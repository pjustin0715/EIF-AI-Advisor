# Eskwelabs EIF AI Advisor — Complete Technical Documentation

---

## 1. Overview

The EIF AI Advisor is a private, invite-only AI chat application for Eskwelabs EIF (Eskwelabs Incubation Fund) staff. It provides access to three specialized AI advisors — each grounded in internal Eskwelabs documentation (the "Company DNA") — to help staff with data dashboards, SSOT memos, and data modeling.

The system is composed of two independently deployed services:

| Service | Stack | Role |
|---|---|---|
| `web/` | Next.js 14 (TypeScript, React) | Frontend UI + API routes (authentication, chat, admin) |
| `rag-service/` | FastAPI (Python) | RAG pipeline (ingestion, embedding, retrieval) |

Both services share a single **Supabase** PostgreSQL database. The web app calls the RAG service internally (server-to-server) to fetch grounding context before every AI response.

---

## 2. Technology Stack

| Technology | Purpose |
|---|---|
| **Next.js 14** | React SSR/CSR framework for the web frontend and API routes |
| **TypeScript** | Type safety across all frontend and API code |
| **FastAPI (Python)** | Lightweight web framework for the RAG microservice |
| **Supabase (PostgreSQL + pgvector)** | Primary database; stores users, chats, messages, turn logs, and 768-dim embeddings |
| **Google OAuth 2.0** | "Sign in with Google" authentication via Google Identity Services |
| **jose** | JWT signing and verification in the Next.js API layer (HS256) |
| **OpenRouter** | LLM gateway — routes AI generation requests to any model (Gemini, Llama, etc.) with a single OpenAI-compatible API |
| **Google Gemini API** | Used for (1) text embeddings (`gemini-embedding-001`, 768 dims) and (2) auto-generating chat titles and voice digests |
| **Google Docs API** | Fetches Company DNA and Advisor prompt documents maintained by non-technical staff in Google Docs |
| **tiktoken** | Token counting for chunk size control during document ingestion |
| **marked.js** | Markdown-to-HTML rendering of AI responses in the browser |

---

## 3. Directory Structure

```text
EIF-AI-Advisor/
│
├── .env.example              # Template for all required environment variables
├── docker-compose.yml        # Local development: runs web + rag-service together
├── render.yaml               # Render.com deployment blueprint for the rag-service
├── requirements.txt          # Root-level Python deps (likely unused; see rag-service/)
├── package.json              # Root-level Node deps (workspace tooling)
│
├── web/                      # Next.js Frontend + API Routes
│   ├── Dockerfile
│   ├── next.config.js
│   ├── vercel.json           # Vercel deployment config
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx            # Root layout (fonts, global CSS)
│   │   │   ├── page.tsx              # Entry point — renders <ChatInterface>
│   │   │   ├── globals.css           # All application styles
│   │   │   ├── admin/
│   │   │   │   └── page.tsx          # Admin dashboard (model config + usage stats)
│   │   │   └── api/
│   │   │       ├── auth/
│   │   │       │   ├── google/route.ts    # POST /api/auth/google — Google token exchange
│   │   │       │   └── config/route.ts   # GET /api/auth/config — serves GOOGLE_CLIENT_ID
│   │   │       ├── chat/route.ts          # POST /api/chat — core streaming chat endpoint
│   │   │       ├── chats/
│   │   │       │   ├── route.ts           # GET/POST /api/chats — list + create chat sessions
│   │   │       │   ├── [id]/route.ts      # GET/DELETE /api/chats/:id — fetch or delete a chat
│   │   │       │   └── batch/route.ts     # DELETE /api/chats/batch — bulk delete
│   │   │       ├── advisors/route.ts      # GET /api/advisors — list available advisors
│   │   │       └── admin/
│   │   │           ├── stats/route.ts     # GET /api/admin/stats — token + cost per user
│   │   │           ├── models/route.ts    # GET/PUT /api/admin/models — per-advisor LLM config
│   │   │           └── cache/route.ts     # POST /api/admin/cache — trigger RAG reindex
│   │   ├── components/
│   │   │   ├── ChatInterface.tsx      # Root chat UI component (entire chat experience)
│   │   │   ├── Sidebar.tsx            # Left panel: chat list, select mode, bulk delete
│   │   │   ├── LoginOverlay.tsx       # Google Sign-In overlay + logout button
│   │   │   ├── NewChatModal.tsx       # Modal for picking an advisor when starting a new chat
│   │   │   ├── EmptyChatState.tsx     # Zero-state welcome screen with advisor picker
│   │   │   ├── SuggestionChips.tsx    # Clickable suggestion pills in the chat thread
│   │   │   └── ConfirmDialog.tsx      # Reusable "Are you sure?" dialog for deletes
│   │   └── lib/
│   │       ├── auth.ts           # JWT creation (server) and getCurrentUser() guard
│   │       ├── auth-client.ts    # Client-side token/picture helpers (localStorage)
│   │       ├── supabase.ts       # Supabase admin client factory + ADVISORS registry
│   │       ├── llm.ts            # OpenRouter client, MODEL constant, token/cost helpers
│   │       ├── gemini.ts         # Google Gemini client wrapper (for title generation)
│   │       ├── rag-client.ts     # HTTP client to call the RAG service + buildSystemPrompt()
│   │       ├── generate-title.ts # Auto-generates a short chat title from the first message
│   │       ├── suggestions.ts    # Per-advisor suggestion chips + greeting text
│   │       └── drafts.ts         # localStorage draft persistence per chat
│
└── rag-service/              # Python RAG Microservice
    ├── Dockerfile
    ├── main.py               # FastAPI app entry point + startup ingestion
    ├── config.py             # Pydantic settings + ADVISORS registry
    ├── requirements.txt
    ├── routers/
    │   └── rag.py            # /retrieve, /reindex, /prompts/:id, /health
    ├── services/
    │   ├── docs.py           # Google Docs API: fetch text + revision metadata
    │   ├── ingestion.py      # Chunk + embed DNA doc, upsert into Supabase
    │   ├── chunker.py        # Heading-aware, token-limited text chunking
    │   ├── embeddings.py     # EmbeddingService wrapping Gemini embedding API
    │   ├── retrieval.py      # Vector similarity search via Supabase RPC
    │   ├── prompt_cache.py   # In-memory cache for advisor Google Doc prompts
    │   ├── voice_digest.py   # Gemini-generated ~500-word DNA summary
    │   └── db.py             # Supabase client factory
    ├── evals/
    │   ├── golden.json       # Golden Q&A pairs for retrieval evaluation
    │   └── run_eval.py       # Offline eval script
    └── DEPLOY.md             # Deployment notes for the RAG service
```

---

## 4. Database Schema

The Supabase project contains six tables and one stored procedure. The `pgvector` extension must be enabled.

### `allowed_users`
Controls who can log in.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | Auto-generated |
| `email` | text UNIQUE | Matched case-insensitively at login |
| `role` | text | `'eif'` (default) or `'admin'` — embedded in JWT |
| `is_active` | boolean | Set to `false` to block a user without deleting them |
| `created_at` | timestamptz | |

### `chats`
One row per conversation session.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | |
| `user_email` | text | Foreign key by convention to `allowed_users.email` |
| `title` | text | Defaults to `'New Chat'`; auto-updated by the title generator after the first message |
| `advisor_id` | text | One of `'advisor1'`, `'advisor2'`, `'advisor3'` |
| `created_at` / `updated_at` | timestamptz | |

### `messages`
Individual turns within a chat.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | |
| `chat_id` | uuid (FK → chats) | Cascades on delete |
| `role` | text | `'user'`, `'model'`, or `'assistant'` |
| `content` | text | Full message text |
| `citations` | jsonb | Array of section-heading strings from retrieved DNA chunks; `null` if no RAG context was attached |
| `created_at` | timestamptz | |

### `documents`
Registry of ingested Google Docs (one row per doc key).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | |
| `doc_id` | text UNIQUE | Logical key (e.g., `'company_dna'`) — **not** the Google Doc ID |
| `kind` | text | `'dna'` or `'advisor'` |
| `revision_id` | text | Google Docs revision ID; used to skip re-ingestion when unchanged |
| `voice_digest` | text | ~500-word Gemini-generated summary of the DNA for the system prompt |
| `updated_at` | timestamptz | |

### `doc_chunks`
Chunked, embedded content from the Company DNA.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | |
| `doc_id` | text | References `documents.doc_id` logically |
| `chunk_index` | int | Position of the chunk within the document |
| `heading` | text | Section heading extracted by the chunker |
| `content` | text | Chunk text (~400 tokens) |
| `embedding` | vector(768) | `gemini-embedding-001` embedding |
| `revision_id` | text | Google Docs revision ID at ingestion time |
| `created_at` | timestamptz | |

An `ivfflat` index on `embedding vector_cosine_ops` (with `lists = 50`) accelerates similarity search.

### `turn_logs`
Per-turn telemetry for the admin dashboard and cost tracking.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | |
| `conversation_id` | uuid (FK → chats) | `SET NULL` on chat delete |
| `user_email` | text | |
| `advisor_id` | text | |
| `model` | text | Actual model string returned by OpenRouter |
| `prompt_tokens` / `completion_tokens` | int | Estimated token counts |
| `est_cost_usd` | numeric(10,6) | Currently logged as `0.0` (OpenRouter cost tracking TBD) |
| `latency_ms` | int | Wall-clock time from request start to stream end |
| `retrieved_chunk_ids` | uuid[] | Chunk IDs retrieved from pgvector for this turn |
| `status` | text | `'ok'`, `'blocked'`, or `'error'` |
| `block_reason` | text | Error message if status is not `'ok'` |
| `created_at` | timestamptz | |

### `advisor_models`
Admin-controlled LLM model override per advisor.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | |
| `advisor_id` | text | `'advisor1'`, `'advisor2'`, or `'advisor3'` |
| `model_name` | text | OpenRouter model string (e.g., `'google/gemini-2.5-flash-lite'`) |
| `is_active` | boolean | Only one active row per advisor at a time |
| `created_at` / `updated_at` | timestamptz | |

### `match_doc_chunks` (Stored Procedure)
PostgreSQL function called via Supabase RPC to perform cosine-similarity search:

```sql
match_doc_chunks(
  query_embedding vector(768),
  match_count     int     DEFAULT 5,
  filter_doc_id   text    DEFAULT NULL,
  min_similarity  float   DEFAULT 0.3
)
RETURNS TABLE (id, doc_id, chunk_index, heading, content, similarity)
```

Returns up to `match_count` chunks from `doc_chunks` ordered by `embedding <=> query_embedding` (cosine distance), filtered to chunks with `similarity >= min_similarity`.

---

## 5. Advisors

Three advisors are registered in both the Python config and the TypeScript Supabase lib:

| ID | Name | Google Doc Env Var |
|---|---|---|
| `advisor1` | Data Dashboard Advisor | `DOC_ID_ADVISOR1` |
| `advisor2` | SSOT Memo Advisor | `DOC_ID_ADVISOR2` |
| `advisor3` | Data Modeling Advisor | `DOC_ID_ADVISOR3` |

Each advisor's Google Doc contains its system prompt (its personality, scope, and instructions). All advisors share the **Company DNA** (`DOC_ID_COMPANY_DNA`) as their grounding knowledge corpus.

---

## 6. Environment Variables

All secrets are loaded from a `.env` file at the project root (and `web/.env.local` for Vercel deployments). Copy `.env.example` to `.env` and fill in values.

### Used by `rag-service`

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | Yes | Google AI API key for embeddings and voice digest generation |
| `SUPABASE_URL` | Yes | Your Supabase project URL |
| `SUPABASE_KEY` | Yes | Supabase service role key (bypasses RLS) |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Yes | Full JSON of the Google service account with Docs read access |
| `DOC_ID_COMPANY_DNA` | Yes | Google Docs document ID for the Company DNA |
| `DOC_ID_ADVISOR1/2/3` | Yes | Google Docs IDs for each advisor's prompt |
| `RAG_SERVICE_SECRET` | Yes | Shared secret for authenticating web → rag-service calls (header: `X-RAG-Secret`) |
| `EMBEDDING_MODEL` | No | Defaults to `gemini-embedding-001` |
| `EMBEDDING_DIMENSIONS` | No | Defaults to `768` |
| `GENERATION_MODEL` | No | Defaults to `gemini-2.5-flash-lite` (used for voice digest) |
| `CACHE_TTL_SECONDS` | No | Prompt cache TTL; defaults to `300` (5 minutes) |
| `RETRIEVAL_TOP_K` | No | Max chunks returned per query; defaults to `5` |
| `MIN_SIMILARITY` | No | Cosine similarity threshold; defaults to `0.35` |
| `CHUNK_TARGET_TOKENS` | No | Target chunk size in tokens; defaults to `400` |
| `CHUNK_OVERLAP_TOKENS` | No | Token overlap between adjacent chunks; defaults to `50` |

### Used by `web`

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_URL` | Yes | Same Supabase project URL |
| `SUPABASE_KEY` | Yes | Same Supabase service role key |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth 2.0 client ID (public; served to the browser via `/api/auth/config`) |
| `SECRET_KEY` | Yes | Secret for signing JWTs (also accepted as `NEXTAUTH_SECRET`) |
| `OPENROUTER_API_KEY` | Yes | OpenRouter API key for LLM generation |
| `RAG_SERVICE_URL` | Yes | Internal URL of the RAG service (e.g., `http://rag-service:8001` in Docker) |
| `RAG_SERVICE_SECRET` | Yes | Must match the value set in `rag-service` |
| `GEMINI_API_KEY` | Yes | Used only for auto-generating chat titles |
| `OPENROUTER_MODEL` | No | Default model string; falls back to `openrouter/auto` |
| `DEV_BYPASS` | No | Set to `"true"` to skip Google OAuth in development |
| `DEV_BYPASS_EMAIL` | No | Email to use when `DEV_BYPASS=true`; defaults to `dev@localhost` |

---

## 7. Data Flows

### Flow A: The Login Process

1. **Page load**: The browser fetches `GET /api/auth/config` to get the `GOOGLE_CLIENT_ID`. The `LoginOverlay` component initializes the Google Identity Services SDK and renders the "Sign in with Google" button.
2. **Google sign-in**: When the user clicks the button, Google handles the OAuth popup and calls the `handleCredentialResponse` callback in `LoginOverlay` with a one-time `credential` (ID token string).
3. **Token exchange** (`POST /api/auth/google`):
   - The frontend sends `{ credential }` to the Next.js API route.
   - The route uses `google-auth-library`'s `OAuth2Client.verifyIdToken()` to validate the token against Google's public keys.
   - It extracts `email` and `picture` from the verified payload.
   - It queries `allowed_users` via `supabase.from("allowed_users").select("*").ilike("email", email).maybeSingle()`.
   - If the row is missing or `is_active === false`, it returns `403`.
4. **JWT minting** (`web/src/lib/auth.ts → createAccessToken`):
   - Queries `allowed_users` for the user's `role` (`'eif'` or `'admin'`).
   - Signs a JWT (`{ sub: email, role }`) with HS256, expiring in 30 minutes, using the `SECRET_KEY`.
5. **Client storage**: The response `{ access_token, picture }` is stored in `localStorage` via `setAccessToken()` in `auth-client.ts`. The JWT is attached as `Authorization: Bearer <token>` on every subsequent API call.

---

### Flow B: The RAG Ingestion Pipeline (Document Indexing)

This runs on startup (automatically) and on demand via the admin "Clear Prompt Cache" button.

1. **Trigger**: Either `startup_ingest()` in `rag-service/main.py` on boot, or a `POST /reindex?force=true` request forwarded from `POST /api/admin/cache`.
2. **Metadata check** (`services/ingestion.py → ingest_dna`):
   - Calls `fetch_doc_metadata(doc_id)` in `services/docs.py`, which uses the Google Docs API to get the document's `revisionId` without fetching the full content.
   - Compares the `revision_id` against the value stored in the `documents` table.
   - If unchanged and `force=False`, skips re-ingestion and returns early.
3. **Document fetch** (`services/docs.py → fetch_doc_text`):
   - Authenticates using `GOOGLE_SERVICE_ACCOUNT_JSON` via `service_account.Credentials.from_service_account_info()`.
   - Calls `service.documents().get(documentId=doc_id).execute()`.
   - Walks the document body, concatenating all `textRun.content` strings into a plain-text string.
4. **Voice Digest generation** (`services/voice_digest.py`):
   - Sends the raw DNA text to Gemini with a fixed prompt asking for a ~500-word summary focused on Eskwelabs identity, tone, lexicon, and formatting rules.
   - The resulting `voice_digest` is stored in the `documents` table and prepended to every AI system prompt.
5. **Chunking** (`services/chunker.py → chunk_document`):
   - Splits the document by headings (Markdown `#`, numbered headings `1.`, or `ALL CAPS:` patterns).
   - Within each section, slides a window of words until a chunk reaches ~400 tokens (measured by `tiktoken`), with ~50-token overlap between adjacent chunks.
   - Returns a list of `Chunk(chunk_index, heading, content)` objects.
6. **Embedding** (`services/embeddings.py → EmbeddingService`):
   - For each chunk, calls `genai.Client.models.embed_content()` with `task_type="RETRIEVAL_DOCUMENT"` and `output_dimensionality=768`.
   - Returns a `list[float]` of 768 values.
7. **Database upsert**:
   - Deletes all existing chunks for this document key from `doc_chunks`.
   - Inserts each chunk with its embedding into `doc_chunks`.
   - Upserts the `documents` row with the new `revision_id`, `voice_digest`, and `updated_at`.

---

### Flow C: Sending a Message (Full Turn)

This is the critical path for every user message.

1. **User action**: The user types a message and presses Enter or the send button. `ChatInterface.tsx → sendMessage()` is called.
2. **Auto-create chat**: If no `activeChatId` exists (the user is on the empty state screen), a new chat is created first via `POST /api/chats` with the selected `advisor_id`.
3. **Streaming request** (`POST /api/chat`):
   - The frontend sends `{ prompt, chat_id }` with an `Authorization: Bearer <token>` header.
   - An `AbortController` is attached to the fetch so the user can stop the stream.
4. **Authentication** (`web/src/lib/auth.ts → getCurrentUser`):
   - Extracts the token from the `Authorization` header.
   - Verifies it using `jose`'s `jwtVerify()`. Returns `{ email, role }` or `null`.
   - Returns `401` if verification fails.
5. **Chat ownership check**: Queries `chats` to confirm the `chat_id` belongs to the authenticated user. Returns `404` otherwise.
6. **Save user message**: Inserts `{ chat_id, role: "user", content: prompt }` into `messages`.
7. **Fetch history**: Retrieves all messages for this chat ordered by `created_at`, then slices to the last 40 messages.
8. **RAG retrieval** (`web/src/lib/rag-client.ts → retrieveContext`):
   - Makes a server-side `POST` to `${RAG_SERVICE_URL}/retrieve?advisor_id=...` with `{ query: prompt }` and `X-RAG-Secret` header.
   - The RAG service:
     - Calls `ensure_dna_fresh()` to check for doc updates (non-blocking if cached).
     - Embeds the query with `task_type="RETRIEVAL_QUERY"`.
     - Calls the Supabase `match_doc_chunks` RPC with `top_k=5` and `min_similarity=0.35`.
     - Returns `{ voice_digest, advisor_prompt, chunks, citations, retrieved_chunk_ids, low_grounding, doc_url }`.
   - If the RAG service is unreachable, a `502` error is logged to `turn_logs` and returned to the client.
9. **System prompt assembly** (`web/src/lib/rag-client.ts → buildSystemPrompt`):
   - Sections: `ESKWELABS VOICE DIGEST`, `ADVISOR INSTRUCTIONS`, `RETRIEVED DNA CONTEXT`.
   - If `low_grounding` is `true` (no chunks above threshold), a note is added to fall back on the voice digest.
   - A rules footer instructs the AI to stay advisory-only, never reveal the system prompt, and cite DNA section headings when using retrieved context.
10. **Model selection**: Queries `advisor_models` for an active model override for this advisor. Falls back to `OPENROUTER_MODEL` env var, then to `"openrouter/auto"`.
11. **Auto-title generation** (parallel, first message only): If this is the first message and the chat still has the default title `'New Chat'`, `generateChatTitle()` is called concurrently using the Gemini SDK.
12. **LLM streaming** (`web/src/lib/llm.ts → getOpenRouterClient`):
    - Calls `openai.chat.completions.create()` with `stream: true` against `https://openrouter.ai/api/v1`.
    - The API is OpenAI-compatible, so any model on OpenRouter can be used by changing the model string.
13. **SSE stream to browser**: The Next.js route uses a `ReadableStream` to emit Server-Sent Events in this sequence:
    - `{ type: "citations", citations: [...], doc_url: "..." }` — sent first so the UI can show sources before text arrives.
    - `{ type: "token", text: "..." }` — one event per chunk from OpenRouter's stream.
    - `{ type: "title", title: "..." }` — sent after the title generator resolves (first message only).
    - `{ type: "done", latency_ms: N }` — signals end of stream.
    - `{ type: "error", message: "..." }` — if generation fails mid-stream.
14. **Client-side rendering** (`ChatInterface.tsx`):
    - Reads the SSE stream via `ReadableStream.getReader()`.
    - Accumulates `token` events into `streamingText` state, which is rendered live via `marked.parse()`.
    - On `done`, commits the final `assistantText` to the `messages` state array.
    - On `title`, calls `updateChatTitle()` to update the sidebar without a full reload.
15. **Database persistence** (after stream completes):
    - Inserts the AI response into `messages` with `role: "model"` and the `citations` array.
    - Inserts a row into `turn_logs` with model name, token estimates, latency, retrieved chunk IDs, and cost.
16. **Chat title update** (if auto-titled): Updates the `chats` row with the new title and `updated_at`.

---

### Flow D: Admin Actions

The Admin Dashboard (`/admin`) is only accessible to users whose JWT contains `role: "admin"`. The role is read from `allowed_users.role` at login time and embedded in the JWT.

#### Viewing Usage Stats (`GET /api/admin/stats`)
- Queries all rows from `turn_logs` (`user_email`, `model`, `prompt_tokens`, `completion_tokens`, `est_cost_usd`).
- Groups by `user_email`, summing tokens and cost, collecting unique model strings.
- Sorts by highest cost and returns the array.

#### Managing Models (`GET/PUT /api/admin/models`)
- `GET`: Returns all rows from `advisor_models` where `is_active = true`.
- `PUT`: Receives `{ advisor_id, model_name }`. Deactivates all existing active rows for that advisor, then upserts a new row with `is_active = true`. This allows the admin to point any advisor to any OpenRouter-compatible model string without a redeploy.

#### Clearing the RAG Cache (`POST /api/admin/cache`)
- Proxies a `POST /reindex?force=true` request to the RAG service with the `X-RAG-Secret` header.
- The RAG service re-fetches all Google Docs, re-chunks, re-embeds, and overwrites `doc_chunks` and `documents`. All in-memory prompt caches are also invalidated.

---

## 8. File-by-File Reference

### `web/src/lib/auth.ts`
**Server-side** JWT helpers. Never imported by client components.

- `createAccessToken(email)`: Looks up the user's role in Supabase, then signs a `{ sub: email, role }` JWT with `jose`'s `SignJWT`, valid for 30 minutes.
- `getCurrentUser(req)`: Reads the `Authorization: Bearer <token>` header, verifies with `jwtVerify`, and returns `{ email, role }`. Returns `null` on any failure (expired, tampered, missing).

### `web/src/lib/auth-client.ts`
**Client-side** token management. Runs only in the browser.

- Stores `access_token` and `profile_picture` in `localStorage`.
- `authHeaders()` builds the `Authorization` header for every API fetch.
- `clearAccessToken()` is called on logout and on a `401` response from any API.

### `web/src/lib/llm.ts`
- `getOpenRouterClient()`: Returns an `OpenAI` instance pointed at `https://openrouter.ai/api/v1`. The OpenAI SDK is fully compatible with OpenRouter's API.
- `estimateTokens(text)`: Rough approximation (`text.length / 4`) used for logging when an exact count is unavailable.
- `MODEL`: The default model string, overridable via `OPENROUTER_MODEL` env var.

### `web/src/lib/rag-client.ts`
- `retrieveContext(query, advisorId)`: Makes a server-to-server POST to the RAG service. Throws on non-200 responses so the caller can log the error.
- `buildSystemPrompt(rag)`: Assembles the three-section system prompt from the RAG response. Adds a `low_grounding` warning note when retrieval quality is poor.

### `web/src/lib/generate-title.ts`
Calls `@google/generative-ai` directly (not via OpenRouter) to generate a 3–6 word title. Uses Gemini with `temperature=0.2` and `maxOutputTokens=24`. Falls back to the first 6 words of the user's message if the API call fails or is unconfigured.

### `web/src/lib/drafts.ts`
Persists the user's in-progress typed text across chat switches using `localStorage` keys like `draft:<chatId>`. A "pending draft" is used when no chat is selected yet (the empty-state input).

### `web/src/components/ChatInterface.tsx`
The root React component. Contains all state and event handlers for the chat UI:
- Auth state and admin role detection (by decoding the JWT payload client-side).
- Chat list loading and management (select, delete single, bulk delete with confirmation dialog).
- Message loading and streaming.
- Draft save/restore on chat switch.
- `sendMessage()` — the main entry point that orchestrates chat creation, API call, SSE parsing, and state updates.

### `rag-service/services/chunker.py`
Splits a plain-text document into overlapping chunks suitable for embedding.
- `_split_by_headings()`: Uses a regex to detect headings (`## Header`, `1. Section`, `ALL CAPS:`) and groups body text under them.
- `chunk_document()`: For each section, slides a word window until the chunk reaches `CHUNK_TARGET_TOKENS` (measured by `tiktoken`), then starts the next chunk with `CHUNK_OVERLAP_TOKENS` / 4 words of overlap.

### `rag-service/services/embeddings.py`
Wraps the Gemini Embeddings API.
- `embed(text, task_type)`: Calls `genai.Client.models.embed_content()` with `output_dimensionality=768`. Returns a `list[float]`.
- `embed_query(query)`: Shortcut using `task_type="RETRIEVAL_QUERY"`.
- Embedding model uses separate task types for documents (`RETRIEVAL_DOCUMENT`) vs. queries (`RETRIEVAL_QUERY`) to maximize retrieval accuracy.

### `rag-service/services/prompt_cache.py`
In-memory cache for advisor Google Doc prompts (their system prompt text).
- `get_advisor_prompt(advisor_id)`: Checks the TTL-based cache first. If stale, fetches the doc's `revisionId`. If the revision is unchanged, only refreshes the TTL. If changed, re-fetches the full text. Falls back to the cached version if the fetch fails.
- `invalidate_advisor_cache()`: Clears all cached prompts, called during `/reindex`.

### `rag-service/services/voice_digest.py`
Generates a compact (~500-word) summary of the Company DNA using Gemini. The prompt instructs the model to focus on identity, voice, tone, lexicon, and formatting rules — explicitly excluding operational details or course content. This digest is stored in the `documents` table and included at the top of every system prompt.

### `rag-service/services/retrieval.py`
- `retrieve_context(query)`: Runs `ensure_dna_fresh()`, embeds the query, calls the `match_doc_chunks` Supabase RPC, and returns a `RetrievalResult` containing the matched `RetrievedChunk` list, a `low_grounding` flag, and the `voice_digest` from the `documents` table.
- `low_grounding` is `True` when no chunks are returned or the top chunk's similarity is barely above the threshold.

---

## 9. Deployment

### Local Development (Docker Compose)

```bash
cp .env.example .env
# Fill in all values in .env
docker compose up
```

- `rag-service` starts on port `8001`
- `web` starts on port `3000`
- They communicate internally as `http://rag-service:8001`

### Production Deployment

**RAG Service → Render.com**

The `render.yaml` blueprint deploys `rag-service/` as a free-tier Python web service:
- Build: `pip install -r requirements.txt`
- Start: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- Health check: `GET /health`
- `RAG_SERVICE_SECRET` is auto-generated by Render; copy it to the web service's env vars.
- All other env vars (`GEMINI_API_KEY`, `SUPABASE_URL`, etc.) must be set manually in the Render dashboard.

**Web App → Vercel**

The `web/` directory is deployed to Vercel (configured by `web/vercel.json`):
- Set all `web`-specific env vars in Vercel's environment settings.
- Set `RAG_SERVICE_URL` to the Render service's public URL.
- Set `RAG_SERVICE_SECRET` to match the value generated by Render.

### Database Setup

Run migrations against your Supabase project:
1. Open the Supabase SQL Editor.
2. Run `supabase/migrations/001_rag_schema.sql` (creates all tables, indexes, and the `match_doc_chunks` function).
3. Run `supabase/migrations/002_admin_models.sql` (creates `advisor_models` and seeds defaults).
4. Add at least one row to `allowed_users` with `role = 'admin'` to access the admin dashboard.

---

## 10. Role-Based Access Control

Two roles are supported, set per user in the `allowed_users.role` column:

| Role | Access |
|---|---|
| `eif` | Can log in, create chats, send messages |
| `admin` | All `eif` access + can view the Admin Dashboard, manage per-advisor LLM models, and trigger cache clears |

The role is read from Supabase at login and embedded in the JWT. API routes that require `admin` access call `getCurrentUser()` and check `user.role !== "admin"`. The client-side `ChatInterface` also decodes the JWT to show or hide the "Admin Dashboard" button without a round-trip.

---

## 11. Streaming Architecture

The `/api/chat` route returns a `text/event-stream` (SSE) response. Each event is a JSON payload on a `data:` line, separated by `\n\n`.

**Event types, in order:**

| Event | When | Payload |
|---|---|---|
| `citations` | Before first token | `{ type: "citations", citations: string[], doc_url: string \| null }` |
| `token` | For each streamed chunk | `{ type: "token", text: string }` |
| `title` | After title resolves (first message only) | `{ type: "title", title: string }` |
| `done` | Stream complete | `{ type: "done", latency_ms: number }` |
| `error` | On failure | `{ type: "error", message: string }` |

The client reads the stream via `ReadableStream.getReader()`, splits on `\n\n`, strips the `data: ` prefix, and JSON-parses each payload. Text is accumulated into `streamingText` state and rendered incrementally via `marked.parse()` on each token event.

---

## 12. Key Design Decisions

- **OpenRouter over direct Gemini**: The generation layer routes through OpenRouter, which provides a single API key and URL for access to dozens of models. Admins can switch any advisor to a cheaper or more capable model at runtime without a redeploy.
- **RAG over full-doc injection**: The Company DNA may grow large. Rather than injecting the full document into every system prompt (hitting token limits and increasing cost), the RAG service embeds the DNA into pgvector and retrieves only the 5 most relevant sections per query.
- **Voice Digest as always-on context**: Even when retrieval finds no relevant chunks (`low_grounding = true`), the ~500-word voice digest ensures the AI always has Eskwelabs tone, terminology, and identity constraints.
- **Revision-ID-based cache invalidation**: The RAG service checks Google Docs' `revisionId` before re-ingesting. This means DNA updates are picked up automatically within one cache TTL (5 minutes) without manual intervention, while avoiding redundant API calls when nothing has changed.
- **In-memory prompt cache with TTL + revision check**: Advisor prompt docs are fetched at most once per TTL period, but only re-read from Google if the revision has actually changed — a two-level cache that minimizes both latency and API quota usage.
- **Per-advisor model override in Supabase**: Storing the active model in the database (rather than env vars) means admins can change models through the UI at runtime. The chat route fetches the active model at the start of each turn, so changes take effect immediately.
- **JWT role embedded at mint time**: The user's role is read from Supabase once at login and baked into the JWT, so admin-gated routes don't need a database round-trip on every request.
