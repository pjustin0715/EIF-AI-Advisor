-- Optional / unused by runtime: compact state is stored as a special messages row
-- (citations.type = 'context_summary') so no DDL is required via the service role.
-- Kept for documentation if you later want first-class chat columns.

-- ALTER TABLE chats
--   ADD COLUMN IF NOT EXISTS context_summary text,
--   ADD COLUMN IF NOT EXISTS compacted_through_at timestamptz;
