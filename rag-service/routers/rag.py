from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

from config import ADVISORS, get_settings
from services.ingestion import reindex_all
from services.prompt_cache import get_advisor_prompt, invalidate_advisor_cache
from services.retrieval import retrieve_context

router = APIRouter()


def verify_service_secret(x_rag_secret: str | None = Header(default=None)) -> None:
    settings = get_settings()
    if settings.rag_service_secret and x_rag_secret != settings.rag_service_secret:
        raise HTTPException(status_code=401, detail="Invalid RAG service secret")


class RetrieveRequest(BaseModel):
    query: str = Field(min_length=1)


class RetrieveResponse(BaseModel):
    voice_digest: str
    advisor_prompt: str
    chunks: list[dict[str, Any]]
    citations: list[str]
    retrieved_chunk_ids: list[str]
    low_grounding: bool
    doc_url: str | None = None


class ReindexResponse(BaseModel):
    status: str
    results: dict[str, Any]


@router.post("/retrieve", response_model=RetrieveResponse)
def retrieve(
    body: RetrieveRequest,
    advisor_id: str = "advisor1",
    _: None = Depends(verify_service_secret),
):
    if advisor_id not in ADVISORS:
        raise HTTPException(status_code=400, detail="Invalid advisor ID")

    result = retrieve_context(body.query)
    advisor_prompt = get_advisor_prompt(advisor_id)

    chunks_payload = [
        {
            "id": c.id,
            "heading": c.heading,
            "content": c.content,
            "similarity": c.similarity,
        }
        for c in result.chunks
    ]
    citations = [c.citation_label() for c in result.chunks]

    # Build a Google Docs URL from the source doc_id
    settings = get_settings()
    doc_id_value = settings.doc_id_company_dna
    doc_url = f"https://docs.google.com/document/d/{doc_id_value}/view" if doc_id_value else None

    return RetrieveResponse(
        voice_digest=result.voice_digest,
        advisor_prompt=advisor_prompt,
        chunks=chunks_payload,
        citations=citations,
        retrieved_chunk_ids=[c.id for c in result.chunks],
        low_grounding=result.low_grounding,
        doc_url=doc_url,
    )


@router.get("/prompts/{advisor_id}")
def get_prompts(advisor_id: str, _: None = Depends(verify_service_secret)):
    if advisor_id not in ADVISORS:
        raise HTTPException(status_code=400, detail="Invalid advisor ID")
    return {
        "advisor_id": advisor_id,
        "name": ADVISORS[advisor_id]["name"],
        "prompt": get_advisor_prompt(advisor_id),
    }


@router.post("/reindex", response_model=ReindexResponse)
def reindex(force: bool = True, _: None = Depends(verify_service_secret)):
    invalidate_advisor_cache()
    results = reindex_all(force=force)
    return ReindexResponse(status="ok", results=results)


@router.get("/health")
def health():
    return {"status": "ok", "service": "rag-service"}
