"use client";

import { useEffect, useState, type ReactNode } from "react";
import type {
  RetrievalPayload,
  RetrievalSource,
  RetrievalStatusStep,
} from "@/lib/retrieval";

const STEP_LABELS: Record<RetrievalStatusStep, string> = {
  searching: "Searching DNA",
  ranking: "Ranking matches",
  ready: "Ready to answer",
};

const STEP_ORDER: RetrievalStatusStep[] = ["searching", "ranking", "ready"];

type RetrievalPanelProps = {
  retrieval?: RetrievalPayload | null;
  statusStep?: RetrievalStatusStep | null;
  rankingCount?: number | null;
  isAdmin?: boolean;
  query?: string | null;
  mode?: "live" | "finished";
};

function formatSimilarity(similarity?: number): string | null {
  if (typeof similarity !== "number" || Number.isNaN(similarity)) return null;
  const pct = similarity <= 1 ? similarity * 100 : similarity;
  return `${pct.toFixed(0)}%`;
}

function IconSearch() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <path d="M16 16l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function IconRank() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 7h12M4 12h16M4 17h9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M5 12.5l4.5 4.5L19 7.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconChevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`retrieval-step__chevron-icon${open ? " is-open" : ""}`}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        d="M9 6l6 6-6 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function stepIcon(step: RetrievalStatusStep, done: boolean): ReactNode {
  if (done && step === "ready") return <IconCheck />;
  if (step === "searching") return <IconSearch />;
  if (step === "ranking") return <IconRank />;
  return <IconCheck />;
}

function SourceList({
  sources,
  isAdmin,
}: {
  sources: RetrievalSource[];
  isAdmin: boolean;
}) {
  if (sources.length === 0) {
    return <p className="retrieval-step__empty">No DNA sections matched.</p>;
  }
  return (
    <ul className="retrieval-sources">
      {sources.map((source, index) => {
        const sim = isAdmin ? formatSimilarity(source.similarity) : null;
        return (
          <li
            key={source.id || `${source.heading}-${index}`}
            className="retrieval-source"
          >
            <div className="retrieval-source__top">
              <span className="retrieval-source__heading">{source.heading}</span>
              {sim && (
                <span className="retrieval-source__badge">{sim} match</span>
              )}
            </div>
            {source.excerpt && (
              <p className="retrieval-source__excerpt">{source.excerpt}</p>
            )}
            {isAdmin && source.content && (
              <details className="retrieval-source__full">
                <summary>Full chunk</summary>
                <pre>{source.content}</pre>
                {source.id && (
                  <code className="retrieval-source__id">{source.id}</code>
                )}
              </details>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function StepContext({
  step,
  retrieval,
  query,
  isAdmin,
  rankingCount,
}: {
  step: RetrievalStatusStep;
  retrieval?: RetrievalPayload | null;
  query?: string | null;
  isAdmin: boolean;
  rankingCount?: number | null;
}) {
  const sources = retrieval?.sources ?? [];
  const count =
    typeof rankingCount === "number" ? rankingCount : sources.length;

  if (step === "searching") {
    return (
      <div className="retrieval-step__context">
        <p className="retrieval-step__prose">
          Looking up DNA sections related to your question
          {query?.trim() ? ":" : "."}
        </p>
        {query?.trim() && (
          <p className="retrieval-step__query">{query.trim()}</p>
        )}
      </div>
    );
  }

  if (step === "ranking") {
    if (!retrieval) {
      return (
        <div className="retrieval-step__context">
          <p className="retrieval-step__empty">Waiting for ranked DNA matches…</p>
        </div>
      );
    }
    return (
      <div className="retrieval-step__context">
        <p className="retrieval-step__prose">
          Ranked {count} DNA section{count === 1 ? "" : "s"} by relevance
          {retrieval.low_grounding ? " — limited match strength" : ""}.
        </p>
        <SourceList sources={sources} isAdmin={isAdmin} />
      </div>
    );
  }

  if (!retrieval) {
    return (
      <div className="retrieval-step__context">
        <p className="retrieval-step__empty">Preparing answer context…</p>
      </div>
    );
  }

  return (
    <div className="retrieval-step__context">
      {retrieval.low_grounding && (
        <p className="retrieval-panel__warning">
          Limited DNA match — answer may rely more on advisor voice and
          instructions.
        </p>
      )}
      <p className="retrieval-step__prose">
        Using {sources.length} retrieved section
        {sources.length === 1 ? "" : "s"} to draft the answer.
      </p>
      <SourceList sources={sources} isAdmin={isAdmin} />
      {retrieval.doc_url && (
        <a
          className="doc-link"
          href={retrieval.doc_url}
          target="_blank"
          rel="noreferrer"
        >
          View source document
        </a>
      )}
    </div>
  );
}

function Timeline({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <ol className={`retrieval-timeline ${className}`.trim()}>{children}</ol>
  );
}

function TimelineStep({
  step,
  label,
  reached,
  active,
  done,
  expanded,
  onToggle,
  children,
}: {
  step: RetrievalStatusStep;
  label: string;
  reached: boolean;
  active: boolean;
  done: boolean;
  expanded: boolean;
  onToggle: () => void;
  children?: ReactNode;
}) {
  return (
    <li
      className={[
        "retrieval-step",
        reached ? "retrieval-step--reached" : "",
        active ? "retrieval-step--active" : "",
        done ? "retrieval-step--done" : "",
        expanded ? "retrieval-step--expanded" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <button
        type="button"
        className="retrieval-step__button"
        disabled={!reached}
        aria-expanded={expanded}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (reached) onToggle();
        }}
      >
        <span
          className={`retrieval-step__icon${done ? " retrieval-step__icon--done" : ""}`}
          aria-hidden="true"
        >
          {stepIcon(step, done)}
        </span>
        <span className="retrieval-step__label">{label}</span>
        {done && !active && (
          <span className="retrieval-step__status">Done</span>
        )}
        {reached && <IconChevron open={expanded} />}
      </button>
      {expanded && children}
    </li>
  );
}

export default function RetrievalPanel({
  retrieval,
  statusStep = null,
  rankingCount = null,
  isAdmin = false,
  query = null,
  mode = "finished",
}: RetrievalPanelProps) {
  const [expandedStep, setExpandedStep] = useState<RetrievalStatusStep | null>(
    null
  );
  const [finishedOpen, setFinishedOpen] = useState(false);

  useEffect(() => {
    if (mode !== "live") return;
    if (statusStep === "ready" && retrieval) {
      setExpandedStep((prev) => (prev == null ? "ready" : prev));
      return;
    }
    if (statusStep === "ranking" && retrieval) {
      setExpandedStep((prev) =>
        prev === "searching" || prev == null ? "ranking" : prev
      );
      return;
    }
    if (statusStep === "searching") {
      setExpandedStep((prev) => (prev == null ? "searching" : prev));
    }
  }, [mode, statusStep, retrieval]);

  if (mode === "live") {
    const activeIndex = statusStep ? STEP_ORDER.indexOf(statusStep) : 0;
    return (
      <div className="retrieval-panel retrieval-panel--live" aria-live="polite">
        <div className="retrieval-panel__eyebrow">Grounding</div>
        <Timeline>
          {STEP_ORDER.map((step, index) => {
            const done = index < activeIndex || statusStep === "ready";
            const active = step === statusStep && statusStep !== "ready";
            const readyDone = step === "ready" && statusStep === "ready";
            const reached = done || active || readyDone || index <= activeIndex;
            const isExpanded = expandedStep === step;
            let label = STEP_LABELS[step];
            if (step === "ranking" && typeof rankingCount === "number") {
              label = `Ranking matches (${rankingCount})`;
            }

            return (
              <TimelineStep
                key={step}
                step={step}
                label={label}
                reached={reached}
                active={active}
                done={done || readyDone}
                expanded={isExpanded}
                onToggle={() =>
                  setExpandedStep((prev) => (prev === step ? null : step))
                }
              >
                <StepContext
                  step={step}
                  retrieval={retrieval}
                  query={query}
                  isAdmin={isAdmin}
                  rankingCount={rankingCount}
                />
              </TimelineStep>
            );
          })}
        </Timeline>
      </div>
    );
  }

  if (!retrieval || retrieval.sources.length === 0) {
    if (!retrieval?.low_grounding) return null;
  }

  const count = retrieval?.sources.length ?? 0;
  const summary =
    count > 0
      ? `How this was grounded (${count})`
      : "How this was grounded";

  return (
    <div
      className={`retrieval-panel retrieval-panel--finished${finishedOpen ? " is-open" : ""}`}
    >
      <button
        type="button"
        className="retrieval-panel__summary"
        aria-expanded={finishedOpen}
        onClick={() => setFinishedOpen((open) => !open)}
      >
        <IconChevron open={finishedOpen} />
        <span>{summary}</span>
      </button>
      {finishedOpen && (
        <div className="retrieval-panel__body">
          <Timeline className="retrieval-timeline--finished">
            {STEP_ORDER.map((step) => {
              const isExpanded = expandedStep === step;
              let label = STEP_LABELS[step];
              if (step === "ranking" && count > 0) {
                label = `Ranking matches (${count})`;
              }
              return (
                <TimelineStep
                  key={step}
                  step={step}
                  label={label}
                  reached
                  active={false}
                  done
                  expanded={isExpanded}
                  onToggle={() =>
                    setExpandedStep((prev) => (prev === step ? null : step))
                  }
                >
                  <StepContext
                    step={step}
                    retrieval={retrieval}
                    query={query}
                    isAdmin={isAdmin}
                    rankingCount={count}
                  />
                </TimelineStep>
              );
            })}
          </Timeline>
        </div>
      )}
    </div>
  );
}
