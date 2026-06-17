-- Eskwelabs AI Advisor RAG schema
-- Run in Supabase SQL editor or via supabase db push

CREATE EXTENSION IF NOT EXISTS vector;

-- Document registry (DNA + advisor metadata)
CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id text UNIQUE NOT NULL,
  kind text NOT NULL CHECK (kind IN ('dna', 'advisor')),
  revision_id text,
  voice_digest text,
  updated_at timestamptz DEFAULT now()
);

-- Chunked DNA content with embeddings (768-dim for gemini-embedding-001)
CREATE TABLE IF NOT EXISTS doc_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id text NOT NULL,
  chunk_index int NOT NULL,
  heading text,
  content text NOT NULL,
  embedding vector(768),
  revision_id text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (doc_id, chunk_index, revision_id)
);

CREATE INDEX IF NOT EXISTS doc_chunks_doc_id_idx ON doc_chunks (doc_id);
CREATE INDEX IF NOT EXISTS doc_chunks_embedding_idx
  ON doc_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

-- Allow-listed users (if not exists)
CREATE TABLE IF NOT EXISTS allowed_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  role text DEFAULT 'eif' CHECK (role IN ('eif', 'admin')),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Chat sessions
CREATE TABLE IF NOT EXISTS chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email text NOT NULL,
  title text NOT NULL DEFAULT 'New Chat',
  advisor_id text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chats_user_email_idx ON chats (user_email);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id uuid NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'model', 'assistant')),
  content text NOT NULL,
  citations jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_chat_id_idx ON messages (chat_id);

-- Per-turn telemetry (tokens, cost, retrieval audit)
CREATE TABLE IF NOT EXISTS turn_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES chats(id) ON DELETE SET NULL,
  user_email text,
  advisor_id text,
  model text,
  prompt_tokens int DEFAULT 0,
  completion_tokens int DEFAULT 0,
  est_cost_usd numeric(10, 6) DEFAULT 0,
  latency_ms int,
  retrieved_chunk_ids uuid[],
  status text DEFAULT 'ok' CHECK (status IN ('ok', 'blocked', 'error')),
  block_reason text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS turn_logs_conversation_idx ON turn_logs (conversation_id);
CREATE INDEX IF NOT EXISTS turn_logs_user_email_idx ON turn_logs (user_email);

-- Vector similarity search RPC
CREATE OR REPLACE FUNCTION match_doc_chunks(
  query_embedding vector(768),
  match_count int DEFAULT 5,
  filter_doc_id text DEFAULT NULL,
  min_similarity float DEFAULT 0.3
)
RETURNS TABLE (
  id uuid,
  doc_id text,
  chunk_index int,
  heading text,
  content text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc.doc_id,
    dc.chunk_index,
    dc.heading,
    dc.content,
    (1 - (dc.embedding <=> query_embedding))::float AS similarity
  FROM doc_chunks dc
  WHERE (filter_doc_id IS NULL OR dc.doc_id = filter_doc_id)
    AND dc.embedding IS NOT NULL
    AND (1 - (dc.embedding <=> query_embedding)) >= min_similarity
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
