import {
  conversationMessages,
  readCompactState,
  type HistoryMessage,
} from "@/lib/context-window";
import type { SupabaseClient } from "@supabase/supabase-js";

export type CompactState = {
  summary: string | null;
  compactedThroughAt: string | null;
};

/** Prefer chats columns; fall back to legacy summary message rows if present. */
export function resolveCompactState(
  chat: {
    context_summary?: string | null;
    compacted_through_at?: string | null;
  },
  history: HistoryMessage[]
): CompactState {
  if (chat.context_summary) {
    return {
      summary: chat.context_summary,
      compactedThroughAt: chat.compacted_through_at ?? null,
    };
  }
  return readCompactState(history);
}

export async function saveCompactSummary(
  supabase: SupabaseClient,
  chatId: string,
  summary: string,
  compactedThroughAt: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("chats")
    .update({
      context_summary: summary,
      compacted_through_at: compactedThroughAt,
    })
    .eq("id", chatId);

  return { error: error?.message ?? null };
}

export { conversationMessages };
