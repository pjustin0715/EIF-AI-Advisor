import { estimateTokens, getOpenRouterClient, MODEL } from "@/lib/llm";
import {
  DEFAULT_CONTEXT_WINDOW_TOKENS,
  DEFAULT_OUTPUT_RESERVE_TOKENS,
  buildContextUsage,
  type ContextUsage,
  usableContextTokens as usableShared,
} from "@/lib/context-window-shared";
import { stripNextQuestion } from "@/lib/next-question";

export type { ContextUsage };
export { buildContextUsage };

/** Model context budget (override via CONTEXT_WINDOW_TOKENS). */
export const CONTEXT_WINDOW_TOKENS = Number(
  process.env.CONTEXT_WINDOW_TOKENS || DEFAULT_CONTEXT_WINDOW_TOKENS
);

/** Tokens reserved for the model completion. */
export const OUTPUT_RESERVE_TOKENS = Number(
  process.env.OUTPUT_RESERVE_TOKENS || DEFAULT_OUTPUT_RESERVE_TOKENS
);

/** Compact when prompt fills this fraction of the usable window. */
export const COMPACT_THRESHOLD = Number(process.env.COMPACT_THRESHOLD || 0.75);

/** Always keep this many most-recent messages verbatim after compact. */
export const KEEP_RECENT_MESSAGES = Number(
  process.env.KEEP_RECENT_MESSAGES || 10
);

export const CONTEXT_SUMMARY_CITATION = {
  type: "context_summary",
} as const;

export type HistoryMessage = {
  id?: string;
  role: string;
  content: string;
  created_at?: string;
  citations?: unknown;
};

export function isContextSummaryMessage(m: HistoryMessage): boolean {
  const c = m.citations;
  return (
    !!c &&
    typeof c === "object" &&
    !Array.isArray(c) &&
    (c as { type?: string }).type === CONTEXT_SUMMARY_CITATION.type
  );
}

/** Read latest compact summary stored as a special message row (no schema migration). */
export function readCompactState(history: HistoryMessage[]): {
  summary: string | null;
  compactedThroughAt: string | null;
} {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (!isContextSummaryMessage(m)) continue;
    const meta = m.citations as {
      type: string;
      compacted_through_at?: string;
    };
    return {
      summary: m.content || null,
      compactedThroughAt: meta.compacted_through_at || m.created_at || null,
    };
  }
  return { summary: null, compactedThroughAt: null };
}

export function visibleMessages<T extends HistoryMessage>(messages: T[]): T[] {
  return messages.filter((m) => !isContextSummaryMessage(m));
}

export function conversationMessages(history: HistoryMessage[]): HistoryMessage[] {
  return history.filter((m) => !isContextSummaryMessage(m));
}

export function usableContextTokens(): number {
  return usableShared(CONTEXT_WINDOW_TOKENS, OUTPUT_RESERVE_TOKENS);
}

export function estimatePromptTokens(
  systemPrompt: string,
  history: HistoryMessage[],
  summary?: string | null
): number {
  let total = estimateTokens(systemPrompt);
  if (summary?.trim()) {
    total += estimateTokens(
      `Previous conversation summary:\n${summary.trim()}`
    );
  }
  for (const m of history) {
    total += estimateTokens(m.content || "");
    total += 4;
  }
  return total;
}

export function filterHistoryForPrompt(
  history: HistoryMessage[],
  compactedThroughAt?: string | null
): HistoryMessage[] {
  const conv = conversationMessages(history);
  if (!compactedThroughAt) return conv;
  const cutoff = new Date(compactedThroughAt).getTime();
  return conv.filter((m) => {
    if (!m.created_at) return true;
    return new Date(m.created_at).getTime() > cutoff;
  });
}

export function toOpenAIMessages(
  history: HistoryMessage[],
  summary?: string | null
): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  const out: Array<{ role: "system" | "user" | "assistant"; content: string }> =
    [];
  if (summary?.trim()) {
    out.push({
      role: "system",
      content: `Previous conversation summary (earlier turns compacted):\n${summary.trim()}`,
    });
  }
  for (const m of history) {
    out.push({
      role: m.role === "user" ? "user" : "assistant",
      content: m.role === "user" ? m.content : stripNextQuestion(m.content),
    });
  }
  return out;
}

export function needsCompaction(usedTokens: number): boolean {
  return usedTokens >= usableContextTokens() * COMPACT_THRESHOLD;
}

export async function summarizeForCompact(
  existingSummary: string | null | undefined,
  messagesToCompact: HistoryMessage[]
): Promise<string> {
  if (messagesToCompact.length === 0) {
    return existingSummary?.trim() || "";
  }

  const transcript = messagesToCompact
    .map((m) => {
      const role = m.role === "user" ? "User" : "Assistant";
      const content =
        m.role === "user" ? m.content : stripNextQuestion(m.content);
      return `${role}: ${content}`;
    })
    .join("\n\n")
    .slice(0, 120_000);

  const openai = getOpenRouterClient();
  const response = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0.2,
    max_tokens: 1200,
    messages: [
      {
        role: "system",
        content:
          "You compress chat history for an advisory AI. Produce a dense factual summary that preserves: user goals, decisions, constraints, key facts, open questions, and advisor recommendations. Omit fluff. Use short bullet points. No preamble.",
      },
      {
        role: "user",
        content: [
          existingSummary?.trim()
            ? `Existing summary to merge/update:\n${existingSummary.trim()}\n\n`
            : "",
          `Conversation turns to compact:\n${transcript}`,
          "\n\nWrite the updated summary:",
        ].join(""),
      },
    ],
  });

  const text = response.choices[0]?.message?.content?.trim();
  if (!text) {
    return [
      existingSummary?.trim(),
      `Compacted ${messagesToCompact.length} earlier turns (summary generation returned empty).`,
    ]
      .filter(Boolean)
      .join("\n");
  }
  return text;
}

export type CompactResult = {
  summary: string;
  compactedThroughAt: string;
  keptHistory: HistoryMessage[];
  compacted: boolean;
};

/**
 * Summarize older turns and keep the most recent KEEP_RECENT_MESSAGES verbatim.
 * Auto mode runs only when usage crosses COMPACT_THRESHOLD.
 * Pass force: true for manual compact (ignores threshold).
 */
export async function maybeCompactHistory(opts: {
  systemPrompt: string;
  history: HistoryMessage[];
  existingSummary?: string | null;
  compactedThroughAt?: string | null;
  force?: boolean;
}): Promise<CompactResult> {
  const activeHistory = filterHistoryForPrompt(
    opts.history,
    opts.compactedThroughAt
  );

  const used = estimatePromptTokens(
    opts.systemPrompt,
    activeHistory,
    opts.existingSummary
  );

  const shouldCompact =
    opts.force ||
    (needsCompaction(used) && activeHistory.length > KEEP_RECENT_MESSAGES);

  if (!shouldCompact || activeHistory.length <= KEEP_RECENT_MESSAGES) {
    return {
      summary: opts.existingSummary || "",
      compactedThroughAt: opts.compactedThroughAt || "",
      keptHistory: activeHistory,
      compacted: false,
    };
  }

  const splitAt = Math.max(0, activeHistory.length - KEEP_RECENT_MESSAGES);
  const toCompact = activeHistory.slice(0, splitAt);
  const keptHistory = activeHistory.slice(splitAt);

  if (toCompact.length === 0) {
    return {
      summary: opts.existingSummary || "",
      compactedThroughAt: opts.compactedThroughAt || "",
      keptHistory,
      compacted: false,
    };
  }

  const summary = await summarizeForCompact(opts.existingSummary, toCompact);
  const lastCompacted = toCompact[toCompact.length - 1];
  const compactedThroughAt =
    lastCompacted.created_at || new Date().toISOString();

  return {
    summary,
    compactedThroughAt,
    keptHistory,
    compacted: true,
  };
}

/** Manual compact: always attempt if there are older turns to summarize. */
export async function forceCompactHistory(opts: {
  systemPrompt?: string;
  history: HistoryMessage[];
  existingSummary?: string | null;
  compactedThroughAt?: string | null;
}): Promise<CompactResult> {
  return maybeCompactHistory({
    systemPrompt: opts.systemPrompt || "",
    history: opts.history,
    existingSummary: opts.existingSummary,
    compactedThroughAt: opts.compactedThroughAt,
    force: true,
  });
}

export function contextUsageFromPrompt(opts: {
  systemPrompt: string;
  history: HistoryMessage[];
  summary?: string | null;
  compacted?: boolean;
}): ContextUsage {
  const used = estimatePromptTokens(
    opts.systemPrompt,
    opts.history,
    opts.summary
  );
  return buildContextUsage(used, usableContextTokens(), !!opts.compacted);
}
