/** Shared context-window constants & client-safe estimators (no server deps). */

export const DEFAULT_CONTEXT_WINDOW_TOKENS = 128000;
export const DEFAULT_OUTPUT_RESERVE_TOKENS = 4096;

export type ContextUsage = {
  used: number;
  limit: number;
  percent: number;
  compacted: boolean;
};

export function usableContextTokens(
  windowTokens = DEFAULT_CONTEXT_WINDOW_TOKENS,
  reserve = DEFAULT_OUTPUT_RESERVE_TOKENS
): number {
  return Math.max(1024, windowTokens - reserve);
}

export function buildContextUsage(
  used: number,
  limit = usableContextTokens(),
  compacted = false
): ContextUsage {
  const percent = Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
  return { used, limit, percent, compacted };
}

export function estimateTokensClient(text: string): number {
  return Math.ceil((text || "").length / 4);
}

/** Rough conversation load for the chatbar meter (includes ~system/RAG overhead). */
export function estimateConversationTokensClient(
  messages: Array<{ content?: string }>,
  draft = "",
  summary?: string | null
): number {
  let total = 2500;
  if (summary?.trim()) {
    total += estimateTokensClient(
      `Previous conversation summary:\n${summary}`
    );
  }
  for (const m of messages) {
    total += estimateTokensClient(m.content || "");
    total += 4;
  }
  if (draft.trim()) {
    total += estimateTokensClient(draft);
    total += 4;
  }
  return total;
}

export function formatTokenCount(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    return `${k >= 10 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, "")}k`;
  }
  return String(n);
}
