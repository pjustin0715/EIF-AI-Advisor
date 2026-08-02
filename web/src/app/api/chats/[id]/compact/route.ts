import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  buildContextUsage,
  estimatePromptTokens,
  forceCompactHistory,
  type HistoryMessage,
  usableContextTokens,
} from "@/lib/context-window";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** POST — manually compact this chat's older turns into context_summary. */
export async function POST(
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

  let result;
  try {
    result = await forceCompactHistory({
      history,
      existingSummary: chat.context_summary as string | null,
      compactedThroughAt: chat.compacted_through_at as string | null,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to compact conversation";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  if (!result.compacted) {
    const used =
      estimatePromptTokens("", result.keptHistory, result.summary || chat.context_summary) +
      2500;
    return NextResponse.json({
      compacted: false,
      reason:
        "Not enough older messages to compact. Keep chatting, then try again.",
      context_summary: chat.context_summary ?? null,
      compacted_through_at: chat.compacted_through_at ?? null,
      context_usage: buildContextUsage(
        used,
        usableContextTokens(),
        Boolean(chat.context_summary)
      ),
    });
  }

  const { error: updateError } = await supabase
    .from("chats")
    .update({
      context_summary: result.summary,
      compacted_through_at: result.compactedThroughAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.id);

  if (updateError) {
    return NextResponse.json(
      { error: "Failed to save compact summary" },
      { status: 500 }
    );
  }

  const used =
    estimatePromptTokens("", result.keptHistory, result.summary) + 2500;
  const context_usage = buildContextUsage(
    used,
    usableContextTokens(),
    true
  );

  return NextResponse.json({
    compacted: true,
    context_summary: result.summary,
    compacted_through_at: result.compactedThroughAt,
    context_usage,
  });
}
