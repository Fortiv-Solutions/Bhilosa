-- Add awards_json column to rfqs for persisting matrix allocations in Supabase
ALTER TABLE rfqs ADD COLUMN IF NOT EXISTS awards_json JSONB DEFAULT '{}'::jsonb;
