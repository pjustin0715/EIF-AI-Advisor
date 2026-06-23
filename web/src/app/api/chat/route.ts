import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  estimateCost,
  estimateTokens,
  getOpenRouterClient,
  MODEL,
} from "@/lib/llm";
import { isDefaultChatTitle } from "@/lib/drafts";
import { generateChatTitle } from "@/lib/generate-title";
import { buildSystemPrompt, retrieveContext } from "@/lib/rag-client";
import { getSupabaseAdmin } from "@/lib/supabase";

const MAX_HISTORY_MESSAGES = 40;

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

  const history = (historyRows || []).slice(-MAX_HISTORY_MESSAGES);
  const isFirstMessage =
    history.length === 1 && history[0]?.role === "user";
  const shouldAutoTitle =
    isFirstMessage && isDefaultChatTitle(chat.title as string);

  let ragContext;
  try {
    ragContext = await retrieveContext(prompt, chat.advisor_id || "advisor1");
  } catch (err) {
    const message = err instanceof Error ? err.message : "RAG service unavailable";
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
  const citations = ragContext.citations;
  const docUrl = ragContext.doc_url ?? null;
  const retrievedChunkIds = ragContext.retrieved_chunk_ids;

  const openAIHistory: any[] = history.map((m) => ({
    role: m.role === "user" ? "user" : "assistant",
    content: m.content,
  }));

  const openai = getOpenRouterClient();
  const promptTokenEstimate = estimateTokens(
    systemPrompt + history.map((m) => m.content).join("")
  );

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let fullText = "";
      let completionTokens = 0;
      // Fetch the active model for this advisor, fallback to default MODEL
      const { data: advisorModel } = await supabase
        .from("advisor_models")
        .select("model_name")
        .eq("advisor_id", chat.advisor_id)
        .eq("is_active", true)
        .maybeSingle();
      
      const targetModel = advisorModel?.model_name || MODEL;
      let actualModelUsed = targetModel;

      let titlePromise: Promise<string> | null = null;
      if (shouldAutoTitle) {
        titlePromise = generateChatTitle(prompt, chat.advisor_id as string);
      }

      const send = (payload: Record<string, unknown>) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
        );
      };

      try {
        send({ type: "citations", citations, doc_url: docUrl });

        const response = await openai.chat.completions.create({
          model: targetModel,
          messages: [
            { role: "system", content: systemPrompt },
            ...openAIHistory,
          ],
          stream: true,
        });

        for await (const chunk of response) {
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

        await supabase.from("messages").insert({
          chat_id,
          role: "model",
          content: fullText,
          citations: citations.length ? citations : null,
        });

        const latencyMs = Date.now() - startTime;
        const estCost = estimateCost(
          actualModelUsed,
          promptTokenEstimate,
          completionTokens
        );

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

        if (titlePromise) {
          const newTitle = await titlePromise;
          await supabase
            .from("chats")
            .update({ title: newTitle, updated_at: new Date().toISOString() })
            .eq("id", chat_id);
          send({ type: "title", title: newTitle });
        }

        send({ type: "done", latency_ms: latencyMs });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Generation failed";
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
