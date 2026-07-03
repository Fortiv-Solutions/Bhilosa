-- Material Request Module — Extended fields migration.
-- Adds nullable tracking columns to material_requests without breaking existing queries or RLS.
-- All columns are nullable with no constraints, safe to run against live data.

-- Work activity field: what work is this material for (e.g. Slab casting, Plaster work)
alter table public.material_requests
  add column if not exists work_activity text;

-- Site block / tower field: which specific block or tower needs the material
alter table public.material_requests
  add column if not exists site_block text;

-- Clarification text: question sent by PR team to site engineer
alter table public.material_requests
  add column if not exists clarification_text text;

-- Clarification timestamps and actor
alter table public.material_requests
  add column if not exists clarification_at timestamptz;

alter table public.material_requests
  add column if not exists clarification_by uuid references public.profiles(id) on delete set null;

-- Site engineer reply to clarification
alter table public.material_requests
  add column if not exists clarification_reply text;

alter table public.material_requests
  add column if not exists clarification_replied_at timestamptz;

-- Rejection reason: required when PR team rejects a request
alter table public.material_requests
  add column if not exists rejection_reason text;

-- Reviewer tracking
alter table public.material_requests
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null;

alter table public.material_requests
  add column if not exists reviewed_at timestamptz;

-- Management comment: upper management can add comments or escalation notes
alter table public.material_requests
  add column if not exists management_comment text;

alter table public.material_requests
  add column if not exists management_comment_at timestamptz;

alter table public.material_requests
  add column if not exists management_comment_by uuid references public.profiles(id) on delete set null;

-- Indexes for common query patterns
create index if not exists mr_module_priority_status_idx
  on public.material_requests (priority, status, created_at desc)
  where deleted_at is null;

create index if not exists mr_module_required_date_idx
  on public.material_requests (required_date, status)
  where deleted_at is null;
