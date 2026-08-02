-- Live collaborative share: message attribution and turn locking
-- shared_at IS NOT NULL means live share is active (not a message cutoff)

ALTER TABLE messages ADD COLUMN IF NOT EXISTS author_email text;

ALTER TABLE chats ADD COLUMN IF NOT EXISTS turn_locked_by text;
ALTER TABLE chats ADD COLUMN IF NOT EXISTS turn_locked_until timestamptz;
