-- Persist auto-compacted conversation memory per chat.
-- Messages with created_at <= compacted_through_at are represented by context_summary
-- when building the LLM prompt; full message rows remain for UI history.

ALTER TABLE chats
  ADD COLUMN IF NOT EXISTS context_summary text,
  ADD COLUMN IF NOT EXISTS compacted_through_at timestamptz;
