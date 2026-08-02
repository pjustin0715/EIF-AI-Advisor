"use client";

import { useEffect, useId, useRef, useState } from "react";
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

const RING_SIZE = 22;
const RING_STROKE = 2.5;

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
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const limit =
    usage?.limit ||
    usableContextTokens(
      DEFAULT_CONTEXT_WINDOW_TOKENS,
      DEFAULT_OUTPUT_RESERVE_TOKENS
    );
  const used = usage?.used ?? 0;
  const percent = usage?.percent ?? 0;
  const compacted = usage?.compacted ?? false;

  const radius = (RING_SIZE - RING_STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset =
    circumference - (Math.min(100, Math.max(0, percent)) / 100) * circumference;

  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={`context-meter ${levelClass(percent)}${open ? " context-meter--open" : ""}`}
    >
      <button
        type="button"
        className="context-meter-ring-btn"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Context window ${percent}% full. ${
          open ? "Hide" : "Show"
        } details`}
        title={`Context ${formatTokenCount(used)} / ${formatTokenCount(limit)}`}
        onClick={() => setOpen((v) => !v)}
      >
        <svg
          className="context-meter-ring"
          width={RING_SIZE}
          height={RING_SIZE}
          viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
          aria-hidden="true"
        >
          <circle
            className="context-meter-ring-track"
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={radius}
            fill="none"
            strokeWidth={RING_STROKE}
          />
          <circle
            className="context-meter-ring-fill"
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={radius}
            fill="none"
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
          />
        </svg>
      </button>

      {open ? (
        <div
          id={panelId}
          className="context-meter-panel"
          role="dialog"
          aria-label="Context window details"
        >
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
      ) : null}
    </div>
  );
}
