# Eskwelabs AI Advisor

Hybrid **Next.js + FastAPI** platform for EIF mentoring advisors with **vector RAG** over the Eskwelabs DNA document.

## Architecture

```
web/ (Next.js on Vercel)
  ├── NextAuth Google login + allow-list
  ├── Streaming chat UI with DNA citations
  └── /api/chat → calls rag-service + Gemini

rag-service/ (FastAPI Python)
  ├── Revision-aware DNA ingestion → Supabase pgvector
  ├── Google gemini-embedding-001 embeddings
  ├── /retrieve (top-k DNA chunks + voice digest)
  └── Cached full advisor prompts (not chunked)

supabase/
  └── migrations/001_rag_schema.sql (pgvector, turn_logs)
```

## Quick Start

### 1. Database

Run [`supabase/migrations/001_rag_schema.sql`](supabase/migrations/001_rag_schema.sql) in Supabase SQL editor.

### 2. Environment

Copy [`.env.example`](.env.example) to `.env` and fill in values.

### 3. RAG Service

```bash
cd rag-service
pip install -r requirements.txt
uvicorn main:app --reload --port 8001
```

Initial index:

```bash
curl -X POST "http://localhost:8001/reindex?force=true" -H "X-RAG-Secret: your-secret"
```

### 4. Next.js Web App

```bash
cd web
npm install
npm run dev
```

Open http://localhost:3000

### 5. Evals

```bash
cd rag-service
RAG_SERVICE_URL=http://localhost:8001 python evals/run_eval.py
```

## Deployment

- **web/** → Vercel (set env vars from `.env.example`)
- **rag-service/** → [Render free tier](rag-service/DEPLOY.md) (step-by-step guide)
- Point `RAG_SERVICE_URL` in Vercel/local `.env` to the deployed RAG service URL

## Key Design Decisions

| Layer | Choice |
|-------|--------|
| Retrieval corpus | DNA doc only (chunked + embedded) |
| Advisor prompts | Full doc, cached with revision/TTL (not RAG) |
| Vector store | Supabase pgvector |
| Embeddings | Google gemini-embedding-001 (768-dim) |
| Freshness | Google revisionId check every 5 min + manual /reindex |
| Trust UX | DNA section citations shown per reply |
| Quality | Golden-set eval harness with hit@k retrieval metric |

## Legacy

The original FastAPI + vanilla JS app remains at repo root for reference. The new stack lives in `web/` and `rag-service/`.
