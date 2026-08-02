import type { RagRetrieveResponse } from "@/lib/rag-client";

export const EXCERPT_MAX_CHARS = 200;

export type RetrievalSource = {
  heading: string;
  excerpt: string;
  id?: string;
  similarity?: number;
  content?: string;
};

export type RetrievalPayload = {
  version: 1;
  low_grounding: boolean;
  doc_url: string | null;
  sources: RetrievalSource[];
};

export type RetrievalStatusStep = "searching" | "ranking" | "ready";

export function makeExcerpt(text: string, maxChars = EXCERPT_MAX_CHARS): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars - 1).trimEnd()}…`;
}

export function buildRetrievalPayload(
  rag: RagRetrieveResponse
): RetrievalPayload {
  return {
    version: 1,
    low_grounding: Boolean(rag.low_grounding),
    doc_url: rag.doc_url ?? null,
    sources: (rag.chunks || []).map((chunk) => ({
      heading: chunk.heading || "Section",
      excerpt: makeExcerpt(chunk.content || ""),
      id: chunk.id,
      similarity: chunk.similarity,
      content: chunk.content,
    })),
  };
}

/** Strip admin-only fields for non-admin viewers. */
export function stripRetrievalForViewer(
  payload: RetrievalPayload | null | undefined,
  isAdmin: boolean
): RetrievalPayload | null {
  if (!payload) return null;
  return {
    version: 1,
    low_grounding: Boolean(payload.low_grounding),
    doc_url: payload.doc_url ?? null,
    sources: (payload.sources || []).map((source) => {
      const base: RetrievalSource = {
        heading: source.heading || "Section",
        excerpt: source.excerpt || makeExcerpt(source.content || ""),
      };
      if (isAdmin) {
        if (source.id) base.id = source.id;
        if (typeof source.similarity === "number") {
          base.similarity = source.similarity;
        }
        if (source.content) base.content = source.content;
      }
      return base;
    }),
  };
}

function isRetrievalPayload(value: unknown): value is RetrievalPayload {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  return obj.version === 1 && Array.isArray(obj.sources);
}

/** Normalize legacy string[] citations or v1 retrieval payloads. */
export function normalizeCitations(raw: unknown): RetrievalPayload | null {
  if (raw == null) return null;

  if (Array.isArray(raw)) {
    if (raw.length === 0) return null;
    if (raw.every((item) => typeof item === "string")) {
      return {
        version: 1,
        low_grounding: false,
        doc_url: null,
        sources: (raw as string[]).map((heading) => ({
          heading: heading || "Section",
          excerpt: "",
        })),
      };
    }
    return null;
  }

  if (isRetrievalPayload(raw)) {
    return {
      version: 1,
      low_grounding: Boolean(raw.low_grounding),
      doc_url: raw.doc_url ?? null,
      sources: (raw.sources || []).map((source) => ({
        heading: source.heading || "Section",
        excerpt: source.excerpt || makeExcerpt(source.content || ""),
        ...(source.id ? { id: source.id } : {}),
        ...(typeof source.similarity === "number"
          ? { similarity: source.similarity }
          : {}),
        ...(source.content ? { content: source.content } : {}),
      })),
    };
  }

  return null;
}

/** Normalize then strip for a viewer role. */
export function citationsForViewer(
  raw: unknown,
  isAdmin: boolean
): RetrievalPayload | null {
  return stripRetrievalForViewer(normalizeCitations(raw), isAdmin);
}
