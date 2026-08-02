-- Allow cancelled turns (client Stop / Steer abort) in turn_logs.status
ALTER TABLE turn_logs
  DROP CONSTRAINT IF EXISTS turn_logs_status_check;

ALTER TABLE turn_logs
  ADD CONSTRAINT turn_logs_status_check
  CHECK (status IN ('ok', 'blocked', 'error', 'cancelled'));
