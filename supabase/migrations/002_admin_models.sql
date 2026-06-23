-- Migration to add admin-controlled model management

CREATE TABLE IF NOT EXISTS advisor_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advisor_id text NOT NULL,
  model_name text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (advisor_id, model_name)
);

CREATE INDEX IF NOT EXISTS advisor_models_idx ON advisor_models (advisor_id);

-- Optional: Initial seed data for defaults
INSERT INTO advisor_models (advisor_id, model_name, is_active)
VALUES 
  ('advisor1', 'openrouter/auto', true),
  ('advisor2', 'openrouter/auto', true),
  ('advisor3', 'openrouter/auto', true)
ON CONFLICT DO NOTHING;
