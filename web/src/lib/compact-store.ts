import {
  CONTEXT_SUMMARY_CITATION,
  type HistoryMessage,
  readCompactState,
} from "@/lib/context-window";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Persist compact summary as a special messages row.
 * Avoids requiring chats.context_summary columns (DDL not available via service role).
 */
export async function saveCompactSummary(
  supabase: SupabaseClient,
  chatId: string,
  summary: string,
  compactedThroughAt: string
): Promise<{ error: string | null }> {
  // Remove prior summary rows so only the latest applies
  const { data: existing } = await supabase
    .from("messages")
    .select("id, citations")
    .eq("chat_id", chatId);

  const staleIds = (existing || [])
    .filter((m) => {
      const c = m.citations;
      return (
        !!c &&
        typeof c === "object" &&
        !Array.isArray(c) &&
        (c as { type?: string }).type === CONTEXT_SUMMARY_CITATION.type
      );
    })
    .map((m) => m.id as string);

  if (staleIds.length) {
    await supabase.from("messages").delete().in("id", staleIds);
  }

  const { error } = await supabase.from("messages").insert({
    chat_id: chatId,
    role: "model",
    content: summary,
    citations: {
      ...CONTEXT_SUMMARY_CITATION,
      compacted_through_at: compactedThroughAt,
    },
  });

  return { error: error?.message ?? null };
}

export function compactStateFromHistory(history: HistoryMessage[]) {
  return readCompactState(history);
}
