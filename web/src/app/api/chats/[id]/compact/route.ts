import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { saveCompactSummary } from "@/lib/compact-store";
import {
  buildContextUsage,
  estimatePromptTokens,
  forceCompactHistory,
  readCompactState,
  type HistoryMessage,
  usableContextTokens,
} from "@/lib/context-window";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** POST — manually compact this chat's older turns into a summary message. */
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
  const stored = readCompactState(history);

  let result;
  try {
    result = await forceCompactHistory({
      history,
      existingSummary: stored.summary,
      compactedThroughAt: stored.compactedThroughAt,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to compact conversation";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  if (!result.compacted) {
    const used =
      estimatePromptTokens(
        "",
        result.keptHistory,
        result.summary || stored.summary
      ) + 2500;
    return NextResponse.json({
      compacted: false,
      reason:
        "Nothing left to compact — need at least one older message beyond the latest turn.",
      context_summary: stored.summary,
      compacted_through_at: stored.compactedThroughAt,
      context_usage: buildContextUsage(
        used,
        usableContextTokens(),
        Boolean(stored.summary)
      ),
    });
  }

  const { error: saveError } = await saveCompactSummary(
    supabase,
    params.id,
    result.summary,
    result.compactedThroughAt
  );

  if (saveError) {
    return NextResponse.json(
      { error: "Failed to save compact summary" },
      { status: 500 }
    );
  }

  const used =
    estimatePromptTokens("", result.keptHistory, result.summary) + 2500;
  const context_usage = buildContextUsage(used, usableContextTokens(), true);

  return NextResponse.json({
    compacted: true,
    context_summary: result.summary,
    compacted_through_at: result.compactedThroughAt,
    context_usage,
  });
}
