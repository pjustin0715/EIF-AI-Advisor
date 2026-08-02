"use client";

import { useEffect, useState } from "react";
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
  /** User question used for the DNA search (live panel). */
  query?: string | null;
  /** Live trace during loading (before answer tokens). */
  mode?: "live" | "finished";
};

function formatSimilarity(similarity?: number): string | null {
  if (typeof similarity !== "number" || Number.isNaN(similarity)) return null;
  const pct = similarity <= 1 ? similarity * 100 : similarity;
  return `${pct.toFixed(0)}% match`;
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
          <li key={source.id || `${source.heading}-${index}`}>
            <div className="retrieval-source__heading">
              {source.heading}
              {sim && <span className="retrieval-source__meta">{sim}</span>}
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
        <p>
          Looking up DNA sections related to your question
          {query?.trim() ? ":" : "."}
        </p>
        {query?.trim() && (
          <blockquote className="retrieval-step__query">{query.trim()}</blockquote>
        )}
      </div>
    );
  }

  if (step === "ranking") {
    if (!retrieval) {
      return (
        <div className="retrieval-step__context">
          <p className="retrieval-step__empty">
            Waiting for ranked DNA matches…
          </p>
        </div>
      );
    }
    return (
      <div className="retrieval-step__context">
        <p>
          Ranked {count} DNA section{count === 1 ? "" : "s"} by relevance
          {retrieval.low_grounding ? " (limited match)" : ""}.
        </p>
        <SourceList sources={sources} isAdmin={isAdmin} />
      </div>
    );
  }

  // ready
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
      <p>
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

  // Auto-open the active/latest available step so context appears as data arrives;
  // user can still click to switch or collapse.
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
        <div className="retrieval-panel__label">Grounding</div>
        <ol className="retrieval-steps">
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
              <li
                key={step}
                className={[
                  "retrieval-step",
                  readyDone || done ? "retrieval-step--done" : "",
                  active ? "retrieval-step--active" : "",
                  isExpanded ? "retrieval-step--expanded" : "",
                  reached ? "retrieval-step--clickable" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <button
                  type="button"
                  className="retrieval-step__button"
                  disabled={!reached}
                  aria-expanded={isExpanded}
                  onClick={() =>
                    setExpandedStep((prev) => (prev === step ? null : step))
                  }
                >
                  <span className="retrieval-step__marker" aria-hidden="true" />
                  <span className="retrieval-step__label">{label}</span>
                  {reached && (
                    <span className="retrieval-step__chevron" aria-hidden="true">
                      {isExpanded ? "▾" : "▸"}
                    </span>
                  )}
                </button>
                {isExpanded && (
                  <StepContext
                    step={step}
                    retrieval={retrieval}
                    query={query}
                    isAdmin={isAdmin}
                    rankingCount={rankingCount}
                  />
                )}
              </li>
            );
          })}
        </ol>
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
    <details className="retrieval-panel retrieval-panel--finished">
      <summary className="retrieval-panel__summary">{summary}</summary>
      <div className="retrieval-panel__body">
        <ol className="retrieval-steps retrieval-steps--finished">
          {STEP_ORDER.map((step) => {
            const isExpanded = expandedStep === step;
            let label = STEP_LABELS[step];
            if (step === "ranking" && count > 0) {
              label = `Ranking matches (${count})`;
            }
            return (
              <li
                key={step}
                className={[
                  "retrieval-step",
                  "retrieval-step--done",
                  "retrieval-step--clickable",
                  isExpanded ? "retrieval-step--expanded" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <button
                  type="button"
                  className="retrieval-step__button"
                  aria-expanded={isExpanded}
                  onClick={(e) => {
                    e.preventDefault();
                    setExpandedStep((prev) => (prev === step ? null : step));
                  }}
                >
                  <span className="retrieval-step__marker" aria-hidden="true" />
                  <span className="retrieval-step__label">{label}</span>
                  <span className="retrieval-step__chevron" aria-hidden="true">
                    {isExpanded ? "▾" : "▸"}
                  </span>
                </button>
                {isExpanded && (
                  <StepContext
                    step={step}
                    retrieval={retrieval}
                    query={query}
                    isAdmin={isAdmin}
                    rankingCount={count}
                  />
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </details>
  );
}
