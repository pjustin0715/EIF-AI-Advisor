import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  estimateCost,
  estimateTokens,
  getGeminiModel,
  MODEL,
} from "@/lib/gemini";
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
  const retrievedChunkIds = ragContext.retrieved_chunk_ids;

  const geminiHistory = history.map((m) => ({
    role: m.role === "user" ? "user" : "model",
    parts: [{ text: m.content }],
  }));

  const model = getGeminiModel(systemPrompt);
  const promptTokenEstimate = estimateTokens(
    systemPrompt + history.map((m) => m.content).join("")
  );

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let fullText = "";
      let completionTokens = 0;

      const send = (payload: Record<string, unknown>) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
        );
      };

      try {
        send({ type: "citations", citations });

        const result = await model.generateContentStream({
          contents: geminiHistory,
        });

        for await (const chunk of result.stream) {
          const text = chunk.text();
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
          MODEL,
          promptTokenEstimate,
          completionTokens
        );

        await supabase.from("turn_logs").insert({
          conversation_id: chat_id,
          user_email: userEmail,
          advisor_id: chat.advisor_id,
          model: MODEL,
          prompt_tokens: promptTokenEstimate,
          completion_tokens: completionTokens,
          est_cost_usd: estCost,
          latency_ms: latencyMs,
          retrieved_chunk_ids: retrievedChunkIds,
          status: "ok",
        });

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
