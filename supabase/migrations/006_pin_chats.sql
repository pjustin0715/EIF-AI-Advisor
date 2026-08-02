-- Allow chats to be pinned to the top of the sidebar
ALTER TABLE chats
  ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;
