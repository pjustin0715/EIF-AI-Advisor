"use client";

import type {
  RetrievalPayload,
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
  /** Live trace during loading (before answer tokens). */
  mode?: "live" | "finished";
};

function formatSimilarity(similarity?: number): string | null {
  if (typeof similarity !== "number" || Number.isNaN(similarity)) return null;
  const pct = similarity <= 1 ? similarity * 100 : similarity;
  return `${pct.toFixed(0)}% match`;
}

export default function RetrievalPanel({
  retrieval,
  statusStep = null,
  rankingCount = null,
  isAdmin = false,
  mode = "finished",
}: RetrievalPanelProps) {
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
            let label = STEP_LABELS[step];
            if (step === "ranking" && typeof rankingCount === "number") {
              label = `Ranking matches (${rankingCount})`;
            }
            return (
              <li
                key={step}
                className={
                  readyDone || done
                    ? "retrieval-step retrieval-step--done"
                    : active
                      ? "retrieval-step retrieval-step--active"
                      : "retrieval-step"
                }
              >
                <span className="retrieval-step__marker" aria-hidden="true" />
                <span>{label}</span>
              </li>
            );
          })}
        </ol>
        {retrieval && retrieval.sources.length > 0 && (
          <p className="retrieval-panel__preview">
            Found {retrieval.sources.length} DNA section
            {retrieval.sources.length === 1 ? "" : "s"}
          </p>
        )}
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
        {retrieval?.low_grounding && (
          <p className="retrieval-panel__warning">
            Limited DNA match — answer may rely more on advisor voice and
            instructions.
          </p>
        )}
        {count > 0 && (
          <ul className="retrieval-sources">
            {retrieval!.sources.map((source, index) => {
              const sim = isAdmin ? formatSimilarity(source.similarity) : null;
              return (
                <li key={source.id || `${source.heading}-${index}`}>
                  <div className="retrieval-source__heading">
                    {source.heading}
                    {sim && (
                      <span className="retrieval-source__meta">{sim}</span>
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
        )}
        {retrieval?.doc_url && (
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
    </details>
  );
}
