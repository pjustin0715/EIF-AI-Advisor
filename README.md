# Eskwelabs AI Advisor

Hybrid **Next.js + FastAPI** platform for EIF mentoring advisors with **vector RAG** over the Eskwelabs DNA document.

## Architecture

```
web/ (Next.js)
  ├── Google login + allow-list
  ├── Streaming chat UI with source document links
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

Run [`supabase/migrations/001_rag_schema.sql`](supabase/migrations/001_rag_schema.sql) in the Supabase SQL editor.

### 2. Environment

Copy [`.env.example`](.env.example) to `.env` and fill in values, then copy to `web/.env.local` as well.

### 3. Install dependencies

```bash
npm install          # root (installs concurrently)
cd web && npm install
```

### 4. Run locally

```bash
pnpm run dev        # starts both services in parallel
pnpm run dev:web    # Next.js only (port 3000)
pnpm run dev:rag    # FastAPI only (port 8001, with --reload)
```

Open http://localhost:3000

### 5. Initial index (first run only)

```bash
curl -X POST "http://localhost:8001/reindex?force=true" -H "X-RAG-Secret: your-secret"
```

### 6. Evals

```bash
cd rag-service
RAG_SERVICE_URL=http://localhost:8001 python evals/run_eval.py
```

## Deployment

- **web/** → Vercel (set env vars from `.env.example`)
- **rag-service/** → [Render free tier](rag-service/DEPLOY.md)
- Point `RAG_SERVICE_URL` in Vercel/local `.env` to the deployed RAG service URL

## Key Design Decisions

| Layer | Choice |
|-------|--------|
| Retrieval corpus | DNA doc only (chunked + embedded) |
| Advisor prompts | Full doc, cached with revision/TTL (not RAG) |
| Vector store | Supabase pgvector |
| Embeddings | Google gemini-embedding-001 (768-dim) |
| Freshness | Google revisionId check every 5 min + manual /reindex |
| Quality | Golden-set eval harness with hit@k retrieval metric |
