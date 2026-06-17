from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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


@app.get("/")
def root():
    return {"service": "Eskwelabs RAG Service", "docs": "/docs"}
