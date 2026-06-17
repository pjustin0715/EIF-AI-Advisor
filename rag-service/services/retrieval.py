from dataclasses import dataclass
from typing import Any

from config import get_settings
from services.db import get_supabase
from services.embeddings import EmbeddingService
from services.ingestion import DNA_DOC_KEY, ensure_dna_fresh


@dataclass
class RetrievedChunk:
    id: str
    doc_id: str
    chunk_index: int
    heading: str
    content: str
    similarity: float

    def citation_label(self) -> str:
        return self.heading or f"Section {self.chunk_index + 1}"


@dataclass
class RetrievalResult:
    chunks: list[RetrievedChunk]
    low_grounding: bool
    voice_digest: str


def retrieve_context(query: str) -> RetrievalResult:
    settings = get_settings()
    ensure_dna_fresh()

    supabase = get_supabase()
    doc_resp = (
        supabase.table("documents")
        .select("voice_digest")
        .eq("doc_id", DNA_DOC_KEY)
        .limit(1)
        .execute()
    )
    voice_digest = (
        doc_resp.data[0].get("voice_digest", "") if doc_resp.data else ""
    )

    embedder = EmbeddingService()
    query_embedding = embedder.embed_query(query)

    rpc_result = supabase.rpc(
        "match_doc_chunks",
        {
            "query_embedding": query_embedding,
            "match_count": settings.retrieval_top_k,
            "filter_doc_id": DNA_DOC_KEY,
            "min_similarity": settings.min_similarity,
        },
    ).execute()

    rows: list[dict[str, Any]] = rpc_result.data or []
    chunks = [
        RetrievedChunk(
            id=str(row["id"]),
            doc_id=row["doc_id"],
            chunk_index=row["chunk_index"],
            heading=row.get("heading") or "",
            content=row["content"],
            similarity=float(row.get("similarity", 0)),
        )
        for row in rows
    ]

    low_grounding = len(chunks) == 0 or (
        chunks and chunks[0].similarity < settings.min_similarity + 0.05
    )

    return RetrievalResult(
        chunks=chunks,
        low_grounding=low_grounding,
        voice_digest=voice_digest,
    )
