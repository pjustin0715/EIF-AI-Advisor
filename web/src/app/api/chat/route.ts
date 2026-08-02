import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { resolveCompactState, saveCompactSummary } from "@/lib/compact-store";
import {
  contextUsageFromPrompt,
  filterHistoryForPrompt,
  maybeCompactHistory,
  toOpenAIMessages,
  type HistoryMessage,
} from "@/lib/context-window";
import {
  estimateCost,
  estimateTokens,
  getOpenRouterClient,
  MODEL,
  resolveModel,
} from "@/lib/llm";
import { isDefaultChatTitle } from "@/lib/drafts";
import { generateChatTitle } from "@/lib/generate-title";
import { extractNextQuestion } from "@/lib/next-question";
import { buildSystemPrompt, retrieveContext } from "@/lib/rag-client";
import {
  buildRetrievalPayload,
  stripRetrievalForViewer,
} from "@/lib/retrieval";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
  }

  const userEmail = user.email;
  const startTime = Date.now();
  const { prompt, chat_id } = await req.json();

  if (!prompt || !chat_id) {
    return new Response(JSON.stringify({ error: "Missing prompt or chat_id" }), {
      status: 400,
    });
  }

  const supabase = getSupabaseAdmin();
  const { data: chat } = await supabase
    .from("chats")
    .select("*")
    .eq("id", chat_id)
    .eq("user_email", userEmail)
    .maybeSingle();

  if (!chat) {
    return new Response(JSON.stringify({ error: "Chat not found" }), {
      status: 404,
    });
  }

  await supabase.from("messages").insert({
    chat_id,
    role: "user",
    content: prompt,
  });

  const { data: historyRows } = await supabase
    .from("messages")
    .select("*")
    .eq("chat_id", chat_id)
    .order("created_at", { ascending: true });

  const history = (historyRows || []) as HistoryMessage[];
  const isFirstMessage =
    history.length === 1 && history[0]?.role === "user";
  const shouldAutoTitle =
    isFirstMessage && isDefaultChatTitle(chat.title as string);

  let ragContext;
  try {
    ragContext = await retrieveContext(prompt, chat.advisor_id || "advisor1");
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "RAG service unavailable";
    await supabase.from("turn_logs").insert({
      conversation_id: chat_id,
      user_email: userEmail,
      advisor_id: chat.advisor_id,
      model: MODEL,
      status: "error",
      block_reason: message,
      latency_ms: Date.now() - startTime,
    });
    return new Response(JSON.stringify({ error: message }), { status: 502 });
  }

  const systemPrompt = buildSystemPrompt(ragContext);
  const retrievalPayload = buildRetrievalPayload(ragContext);
  const viewerRetrieval = stripRetrievalForViewer(
    retrievalPayload,
    user.role === "admin"
  );
  const retrievedChunkIds = ragContext.retrieved_chunk_ids;

  const stored = resolveCompactState(chat, history);
  let contextSummary = stored.summary;
  let compactedThroughAt = stored.compactedThroughAt;
  let didCompact = false;
  let promptHistory = filterHistoryForPrompt(history, compactedThroughAt);

  try {
    const compactResult = await maybeCompactHistory({
      systemPrompt,
      history,
      existingSummary: contextSummary,
      compactedThroughAt,
    });

    promptHistory = compactResult.keptHistory;
    if (compactResult.compacted) {
      didCompact = true;
      contextSummary = compactResult.summary;
      compactedThroughAt = compactResult.compactedThroughAt;
      const { error: saveError } = await saveCompactSummary(
        supabase,
        chat_id,
        contextSummary,
        compactedThroughAt
      );
      if (saveError) {
        console.error("Failed to save compact summary:", saveError);
      }
    } else if (compactResult.summary) {
      contextSummary = compactResult.summary;
    }
  } catch (err) {
    console.error("Auto-compact failed, using filtered history:", err);
    promptHistory = filterHistoryForPrompt(history, compactedThroughAt).slice(
      -40
    );
  }

  const openAIHistory = toOpenAIMessages(promptHistory, contextSummary);
  const contextUsage = contextUsageFromPrompt({
    systemPrompt,
    history: promptHistory,
    summary: contextSummary,
    compacted: didCompact,
  });

  const promptTokenEstimate = contextUsage.used;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let fullText = "";
      let completionTokens = 0;
      const { data: advisorModel } = await supabase
        .from("advisor_models")
        .select("model_name")
        .eq("advisor_id", chat.advisor_id)
        .eq("is_active", true)
        .maybeSingle();

      const targetModel = resolveModel(advisorModel?.model_name);
      let actualModelUsed = targetModel;
      let titleSent = false;

      const send = (payload: Record<string, unknown>) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
        );
      };

      const persistAndSendTitle = async (newTitle: string) => {
        if (titleSent || !newTitle) return;
        const { error: updateError } = await supabase
          .from("chats")
          .update({ title: newTitle, updated_at: new Date().toISOString() })
          .eq("id", chat_id);
        if (updateError) {
          console.error("Failed to update chat title:", updateError);
          return;
        }
        titleSent = true;
        send({ type: "title", title: newTitle });
      };

      try {
        // Generate a real LLM title in parallel with the retrieval trace.
        const titleWork = shouldAutoTitle
          ? generateChatTitle(prompt, chat.advisor_id as string)
              .then((newTitle) => persistAndSendTitle(newTitle))
              .catch((err) =>
                console.error("Auto-title generation failed:", err)
              )
          : Promise.resolve();

        const pause = (ms: number) =>
          new Promise((resolve) => setTimeout(resolve, ms));

        send({ type: "retrieval_status", step: "searching" });
        await pause(280);
        send({
          type: "retrieval_status",
          step: "ranking",
          count: retrievalPayload.sources.length,
        });
        await pause(220);
        send({
          type: "retrieval",
          ...(viewerRetrieval || {
            version: 1,
            low_grounding: false,
            doc_url: null,
            sources: [],
          }),
        });
        send({ type: "retrieval_status", step: "ready" });
        await pause(160);
        send({ type: "context", ...contextUsage });

        await titleWork;

        const openai = getOpenRouterClient();
        const response = await openai.chat.completions.create(
          {
            model: targetModel,
            messages: [
              { role: "system", content: systemPrompt },
              ...openAIHistory,
            ],
            stream: true,
          },
          { signal: req.signal }
        );

        for await (const chunk of response) {
          if (req.signal.aborted) {
            break;
          }
          if (chunk.model) {
            actualModelUsed = chunk.model;
          }
          const text = chunk.choices[0]?.delta?.content || "";
          if (text) {
            fullText += text;
            completionTokens += estimateTokens(text);
            send({ type: "token", text });
          }
        }

        if (req.signal.aborted) {
          await supabase.from("turn_logs").insert({
            conversation_id: chat_id,
            user_email: userEmail,
            advisor_id: chat.advisor_id,
            model: actualModelUsed,
            prompt_tokens: promptTokenEstimate,
            completion_tokens: completionTokens,
            latency_ms: Date.now() - startTime,
            retrieved_chunk_ids: retrievedChunkIds,
            status: "cancelled",
            block_reason: "client_aborted",
          });
          return;
        }

        const { body: persistedContent, question: nextQuestion } =
          extractNextQuestion(fullText);

        await supabase.from("messages").insert({
          chat_id,
          role: "model",
          content: persistedContent,
          citations:
            retrievalPayload.sources.length > 0 || retrievalPayload.low_grounding
              ? retrievalPayload
              : null,
        });

        const latencyMs = Date.now() - startTime;
        const estCost = estimateCost(
          actualModelUsed,
          promptTokenEstimate,
          completionTokens
        );

        const postUsage = contextUsageFromPrompt({
          systemPrompt,
          history: [
            ...promptHistory,
            { role: "model", content: persistedContent },
          ],
          summary: contextSummary,
          compacted: didCompact,
        });
        send({ type: "context", ...postUsage });

        await supabase.from("turn_logs").insert({
          conversation_id: chat_id,
          user_email: userEmail,
          advisor_id: chat.advisor_id,
          model: actualModelUsed,
          prompt_tokens: promptTokenEstimate,
          completion_tokens: completionTokens,
          est_cost_usd: estCost,
          latency_ms: latencyMs,
          retrieved_chunk_ids: retrievedChunkIds,
          status: "ok",
        });

        if (nextQuestion) {
          send({ type: "suggestion", question: nextQuestion });
        }

        send({ type: "done", latency_ms: latencyMs });
      } catch (err) {
        const aborted =
          req.signal.aborted ||
          (err instanceof Error &&
            (err.name === "AbortError" ||
              err.name === "APIUserAbortError" ||
              /aborted|abort/i.test(err.message)));

        if (aborted) {
          await supabase.from("turn_logs").insert({
            conversation_id: chat_id,
            user_email: userEmail,
            advisor_id: chat.advisor_id,
            model: MODEL,
            status: "cancelled",
            block_reason: "client_aborted",
            latency_ms: Date.now() - startTime,
            retrieved_chunk_ids: retrievedChunkIds,
          });
        } else {
          const message =
            err instanceof Error ? err.message : "Generation failed";
          send({ type: "error", message });
          await supabase.from("turn_logs").insert({
            conversation_id: chat_id,
            user_email: userEmail,
            advisor_id: chat.advisor_id,
            model: MODEL,
            status: "error",
            block_reason: message,
            latency_ms: Date.now() - startTime,
            retrieved_chunk_ids: retrievedChunkIds,
          });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
