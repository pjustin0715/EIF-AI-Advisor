import time
from dataclasses import dataclass
from typing import Any

from config import ADVISORS, get_settings
from services.docs import fetch_doc_metadata, fetch_doc_text
from services.embeddings import EmbeddingService
from services.chunker import chunk_document
from services.db import get_supabase
from services.voice_digest import generate_voice_digest

DNA_DOC_KEY = "company_dna"


@dataclass
class IngestResult:
    doc_id: str
    kind: str
    revision_id: str
    chunks_upserted: int
    voice_digest_regenerated: bool


def _resolve_doc_id(kind: str, advisor_id: str | None = None) -> str:
    settings = get_settings()
    if kind == "dna":
        return settings.doc_id_company_dna
    if advisor_id and advisor_id in ADVISORS:
        env_key = ADVISORS[advisor_id]["doc_id_env"]
        return getattr(settings, env_key, "")
    return ""


def ingest_dna(force: bool = False) -> IngestResult:
    settings = get_settings()
    doc_id = settings.doc_id_company_dna
    if not doc_id:
        raise ValueError("DOC_ID_COMPANY_DNA is not configured")

    metadata = fetch_doc_metadata(doc_id)
    revision_id = metadata.get("revision_id", "unknown")
    supabase = get_supabase()

    existing = (
        supabase.table("documents")
        .select("*")
        .eq("doc_id", DNA_DOC_KEY)
        .maybe_single()
        .execute()
    )
    existing_row = existing.data if existing else None

    if (
        not force
        and existing_row
        and existing_row.get("revision_id") == revision_id
    ):
        return IngestResult(
            doc_id=DNA_DOC_KEY,
            kind="dna",
            revision_id=revision_id,
            chunks_upserted=0,
            voice_digest_regenerated=False,
        )

    text = fetch_doc_text(doc_id)
    if not text:
        if existing_row:
            return IngestResult(
                doc_id=DNA_DOC_KEY,
                kind="dna",
                revision_id=existing_row.get("revision_id", revision_id),
                chunks_upserted=0,
                voice_digest_regenerated=False,
            )
        raise ValueError("DNA document fetch failed and no cached version exists")

    voice_digest = generate_voice_digest(text)
    chunks = chunk_document(text)
    embedder = EmbeddingService()

    supabase.table("doc_chunks").delete().eq("doc_id", DNA_DOC_KEY).execute()

    upserted = 0
    for chunk in chunks:
        embedding = embedder.embed(
            f"{chunk.heading}\n\n{chunk.content}",
            task_type="RETRIEVAL_DOCUMENT",
        )
        supabase.table("doc_chunks").insert(
            {
                "doc_id": DNA_DOC_KEY,
                "chunk_index": chunk.chunk_index,
                "heading": chunk.heading,
                "content": chunk.content,
                "embedding": embedding,
                "revision_id": revision_id,
            }
        ).execute()
        upserted += 1

    supabase.table("documents").upsert(
        {
            "doc_id": DNA_DOC_KEY,
            "kind": "dna",
            "revision_id": revision_id,
            "voice_digest": voice_digest,
            "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        },
        on_conflict="doc_id",
    ).execute()

    return IngestResult(
        doc_id=DNA_DOC_KEY,
        kind="dna",
        revision_id=revision_id,
        chunks_upserted=upserted,
        voice_digest_regenerated=True,
    )


def ensure_dna_fresh() -> IngestResult:
    return ingest_dna(force=False)


def reindex_all(force: bool = True) -> dict[str, Any]:
    dna_result = ingest_dna(force=force)
    return {"dna": dna_result.__dict__}
