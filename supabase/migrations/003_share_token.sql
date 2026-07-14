-- Add share token for snapshot sharing
ALTER TABLE chats ADD COLUMN IF NOT EXISTS share_token uuid UNIQUE DEFAULT gen_random_uuid();
ALTER TABLE chats ADD COLUMN IF NOT EXISTS shared_at timestamptz;
