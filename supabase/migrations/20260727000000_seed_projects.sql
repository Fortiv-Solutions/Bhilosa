-- ============================================================================
-- PRAMUKH GROUP ERP — SEED DATA FOR CENTRAL PARK PROJECT & SITE
-- ----------------------------------------------------------------------------
-- Safe, idempotent SQL script to insert 'Central Park' into public.projects
-- and public.project_sites.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. INSERT / SEED 'Central Park' PROJECT
INSERT INTO public.projects (
  id,
  code,
  name,
  client_name,
  location,
  description,
  project_value,
  budget_amount,
  actual_spend_amount,
  start_date,
  target_end_date,
  current_phase,
  status
)
VALUES (
  'f6704467-df8c-4f51-a49b-ddfdc40c39af',
  'PRJ-CENTRAL-PARK',
  'Central Park',
  'Pramukh Group',
  'Ring Road, Surat',
  'Luxury Residential & Commercial Towers on Ring Road, Surat.',
  450000000.00,
  450000000.00,
  28400000.00,
  '2024-01-15 00:00:00+00',
  '2026-12-31 00:00:00+00',
  'Execution',
  'active'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  code = EXCLUDED.code,
  location = EXCLUDED.location,
  description = EXCLUDED.description,
  status = EXCLUDED.status;

-- 2. INSERT / SEED 'Central Park' SITE
INSERT INTO public.project_sites (
  id,
  project_id,
  code,
  name,
  address,
  is_active
)
VALUES (
  'f6704467-df8c-4f51-a49b-ddfdc40c39af',
  'f6704467-df8c-4f51-a49b-ddfdc40c39af',
  'SITE-CP-01',
  'Central Park Main Site',
  'Block A & B, Ring Road, Surat',
  true
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  code = EXCLUDED.code,
  address = EXCLUDED.address,
  is_active = EXCLUDED.is_active;
