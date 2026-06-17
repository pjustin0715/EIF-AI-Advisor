from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import get_settings
from routers.rag import router as rag_router

app = FastAPI(title="Eskwelabs RAG Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(rag_router)


@app.on_event("startup")
def startup_ingest():
    settings = get_settings()
    if settings.doc_id_company_dna and settings.supabase_url:
        try:
            from services.ingestion import ensure_dna_fresh

            ensure_dna_fresh()
        except Exception as exc:
            print(f"Startup ingestion skipped: {exc}")


@app.get("/")
def root():
    return {"service": "Eskwelabs RAG Service", "docs": "/docs"}
