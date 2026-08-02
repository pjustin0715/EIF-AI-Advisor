"use client";

import {
  DEFAULT_CONTEXT_WINDOW_TOKENS,
  DEFAULT_OUTPUT_RESERVE_TOKENS,
  formatTokenCount,
  usableContextTokens,
  type ContextUsage,
} from "@/lib/context-window-shared";

type Props = {
  usage: ContextUsage | null;
  compacting?: boolean;
  canCompact?: boolean;
  onCompact?: () => void;
};

function levelClass(percent: number): string {
  if (percent >= 90) return "context-meter--critical";
  if (percent >= 75) return "context-meter--warn";
  return "context-meter--ok";
}

export default function ContextMeter({
  usage,
  compacting,
  canCompact,
  onCompact,
}: Props) {
  const limit =
    usage?.limit ||
    usableContextTokens(
      DEFAULT_CONTEXT_WINDOW_TOKENS,
      DEFAULT_OUTPUT_RESERVE_TOKENS
    );
  const used = usage?.used ?? 0;
  const percent = usage?.percent ?? 0;
  const compacted = usage?.compacted ?? false;

  return (
    <div
      className={`context-meter ${levelClass(percent)}`}
      title={`Context window: ${used.toLocaleString()} / ${limit.toLocaleString()} tokens${
        compacted ? " (compacted)" : ""
      }`}
      aria-label={`Context window ${percent}% full`}
    >
      <div className="context-meter-track" aria-hidden="true">
        <div
          className="context-meter-fill"
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>
      <span className="context-meter-label">
        {compacting
          ? "Compacting…"
          : `${formatTokenCount(used)} / ${formatTokenCount(limit)}`}
        {compacted && !compacting ? (
          <span className="context-meter-badge">compacted</span>
        ) : null}
      </span>
      {onCompact ? (
        <button
          type="button"
          className="context-meter-compact-btn"
          onClick={onCompact}
          disabled={!canCompact || compacting}
          title="Summarize older turns to free context"
        >
          Compact
        </button>
      ) : null}
    </div>
  );
}
