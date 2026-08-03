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
import {
  buildTurnLock,
  turnLockExpiryIso,
  type TurnLock,
} from "@/lib/turn-lock";

const LOCK_REFRESH_MS = 20_000;

async function acquireTurnLock(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  chatId: string,
  userEmail: string
): Promise<{ ok: true } | { ok: false; turn_lock: TurnLock }> {
  const nowIso = new Date().toISOString();
  const expiry = turnLockExpiryIso();

  const { data: freeLock } = await supabase
    .from("chats")
    .update({
      turn_locked_by: userEmail,
      turn_locked_until: expiry,
    })
    .eq("id", chatId)
    .or(`turn_locked_until.is.null,turn_locked_until.lte.${nowIso}`)
    .select("id")
    .maybeSingle();

  if (freeLock) {
    return { ok: true };
  }

  const { data: sameUserLock } = await supabase
    .from("chats")
    .update({
      turn_locked_by: userEmail,
      turn_locked_until: expiry,
    })
    .eq("id", chatId)
    .eq("turn_locked_by", userEmail)
    .gt("turn_locked_until", nowIso)
    .select("id")
    .maybeSingle();

  if (sameUserLock) {
    return { ok: true };
  }

  const { data: latest } = await supabase
    .from("chats")
    .select("turn_locked_by, turn_locked_until")
    .eq("id", chatId)
    .maybeSingle();

  return {
    ok: false,
    turn_lock: buildTurnLock(
      latest?.turn_locked_by as string | null,
      latest?.turn_locked_until as string | null
    ),
  };
}

async function refreshTurnLock(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  chatId: string,
  userEmail: string
) {
  await supabase
    .from("chats")
    .update({ turn_locked_until: turnLockExpiryIso() })
    .eq("id", chatId)
    .eq("turn_locked_by", userEmail);
}

async function releaseTurnLock(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  chatId: string,
  userEmail: string
) {
  await supabase
    .from("chats")
    .update({ turn_locked_by: null, turn_locked_until: null })
    .eq("id", chatId)
    .eq("turn_locked_by", userEmail);
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
  }

  const userEmail = user.email;
  const startTime = Date.now();
  const { prompt, chat_id, share_token } = await req.json();

  if (!prompt || !chat_id) {
    return new Response(JSON.stringify({ error: "Missing prompt or chat_id" }), {
      status: 400,
    });
  }

  const supabase = getSupabaseAdmin();

  let chatQuery = supabase.from("chats").select("*").eq("id", chat_id);

  if (share_token) {
    chatQuery = chatQuery
      .eq("share_token", share_token)
      .not("shared_at", "is", null);
  } else {
    chatQuery = chatQuery.eq("user_email", userEmail);
  }

  const { data: chat } = await chatQuery.maybeSingle();

  if (!chat) {
    return new Response(JSON.stringify({ error: "Chat not found" }), {
      status: 404,
    });
  }

  const isOwner = chat.user_email === userEmail;
  if (!isOwner && !share_token) {
    return new Response(JSON.stringify({ error: "Chat not found" }), {
      status: 404,
    });
  }

  const lockResult = await acquireTurnLock(supabase, chat_id, userEmail);
  if (!lockResult.ok) {
    return new Response(
      JSON.stringify({
        error: "Turn in progress",
        turn_lock: lockResult.turn_lock,
      }),
      { status: 409 }
    );
  }

  await supabase.from("messages").insert({
    chat_id,
    role: "user",
    content: prompt,
    author_email: userEmail,
  });

  const { data: historyRows } = await supabase
    .from("messages")
    .select("*")
    .eq("chat_id", chat_id)
    .order("created_at", { ascending: true });

  const history = (historyRows || []) as HistoryMessage[];
  const shouldAutoTitle = isOwner && isDefaultChatTitle(chat.title as string);

  let ragContext;
  try {
    ragContext = await retrieveContext(prompt, chat.advisor_id || "advisor1");
  } catch (err) {
    await releaseTurnLock(supabase, chat_id, userEmail);
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
      let lastLockRefresh = Date.now();
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

      const maybeRefreshLock = async () => {
        if (Date.now() - lastLockRefresh < LOCK_REFRESH_MS) return;
        lastLockRefresh = Date.now();
        await refreshTurnLock(supabase, chat_id, userEmail);
      };

      const persistAndSendTitle = async (newTitle: string) => {
        if (titleSent || !newTitle) return;
        const { data: currentChat } = await supabase
          .from("chats")
          .select("title")
          .eq("id", chat_id)
          .maybeSingle();
        if (!isDefaultChatTitle(currentChat?.title as string)) return;

        const { error: updateError } = await supabase
          .from("chats")
          .update({ title: newTitle })
          .eq("id", chat_id);
        if (updateError) {
          console.error("Failed to update chat title:", updateError);
          return;
        }
        titleSent = true;
        send({ type: "title", title: newTitle });
      };

      try {
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
            await maybeRefreshLock();
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

        if (shouldAutoTitle && persistedContent.trim()) {
          const newTitle = await generateChatTitle(
            prompt,
            persistedContent,
            chat.advisor_id as string
          );
          await persistAndSendTitle(newTitle);
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
        await releaseTurnLock(supabase, chat_id, userEmail);
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
