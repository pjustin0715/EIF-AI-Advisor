import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { resolveCompactState } from "@/lib/compact-store";
import {
  buildContextUsage,
  estimatePromptTokens,
  filterHistoryForPrompt,
  usableContextTokens,
  visibleMessages,
  type HistoryMessage,
} from "@/lib/context-window";
import { citationsForViewer } from "@/lib/retrieval";
import { getSupabaseAdmin } from "@/lib/supabase";

/** Approximate system + RAG overhead when no live system prompt is available. */
const SYSTEM_OVERHEAD_TOKENS = 2500;

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data: chat, error: chatError } = await supabase
    .from("chats")
    .select("*")
    .eq("id", params.id)
    .eq("user_email", user.email)
    .maybeSingle();

  if (chatError || !chat) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  const { data: messages } = await supabase
    .from("messages")
    .select("*")
    .eq("chat_id", params.id)
    .order("created_at", { ascending: true });

  const history = (messages || []) as HistoryMessage[];
  const stored = resolveCompactState(chat, history);
  const promptHistory = filterHistoryForPrompt(
    history,
    stored.compactedThroughAt
  );
  const used =
    estimatePromptTokens("", promptHistory, stored.summary) +
    SYSTEM_OVERHEAD_TOKENS;
  const context_usage = buildContextUsage(
    used,
    usableContextTokens(),
    Boolean(stored.summary)
  );

  const isAdmin = user.role === "admin";
  const safeMessages = visibleMessages(history).map((msg) => ({
    ...msg,
    citations: citationsForViewer(
      (msg as { citations?: unknown }).citations,
      isAdmin
    ),
  }));

  return NextResponse.json({
    chat: {
      ...chat,
      context_summary: stored.summary,
      compacted_through_at: stored.compactedThroughAt,
    },
    messages: safeMessages,
    context_usage,
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data: chat } = await supabase
    .from("chats")
    .select("id")
    .eq("id", params.id)
    .eq("user_email", user.email)
    .maybeSingle();

  if (!chat) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  await supabase.from("chats").delete().eq("id", params.id);
  return NextResponse.json({ status: "success" });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { title } = await req.json();
  if (!title) {
    return NextResponse.json({ error: "Missing title" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: chat } = await supabase
    .from("chats")
    .select("id")
    .eq("id", params.id)
    .eq("user_email", user.email)
    .maybeSingle();

  if (!chat) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  const { data: updatedChat, error: updateError } = await supabase
    .from("chats")
    .update({ title, updated_at: new Date().toISOString() })
    .eq("id", params.id)
    .select();
    
  console.log("PATCH update result:", { paramsId: params.id, title, updatedChat, updateError });

  return NextResponse.json({ status: "success" });
}
