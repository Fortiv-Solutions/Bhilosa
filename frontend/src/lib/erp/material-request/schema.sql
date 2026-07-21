-- ============================================================================
-- PRODUCTION MATERIAL REQUEST (MR) SCHEMAS & TRIGGERS FOR SUPABASE
-- Module: Supply Chain Management (SCM) - Material Request Subsystem
-- ============================================================================

-- 1. MATERIAL REQUESTS TABLE
create table if not exists public.material_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  site_id uuid references public.project_sites(id) on delete set null,
  mr_number text not null unique,
  raised_by uuid not null references public.profiles(id),
  title text not null,
  justification text,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'critical')),
  status text not null default 'submitted' check (status in ('draft', 'submitted', 'in_review', 'approved', 'rejected', 'closed', 'cancelled')),
  work_activity text,
  site_block text,
  required_date date not null,
  stock_decision text check (stock_decision in ('available', 'shortage', 'partially_available')),
  clarification_text text,
  clarification_by uuid references public.profiles(id),
  clarification_at timestamptz,
  clarification_reply text,
  clarification_replied_at timestamptz,
  rejection_reason text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  management_comment text,
  management_comment_by uuid references public.profiles(id),
  management_comment_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  deleted_at timestamptz
);

-- 2. MATERIAL REQUEST LINES TABLE
create table if not exists public.material_request_lines (
  id uuid primary key default gen_random_uuid(),
  material_request_id uuid not null references public.material_requests(id) on delete cascade,
  item_id uuid references public.inventory_items(id),
  item_description text not null,
  quantity numeric(14, 4) not null check (quantity > 0),
  unit text not null default 'nos',
  estimated_rate numeric(14, 2) default 0,
  reserved_quantity numeric(14, 4) default 0,
  issued_quantity numeric(14, 4) default 0,
  created_at timestamptz not null default now()
);

-- 3. STOCK BALANCES TABLE
create table if not exists public.stock_balances (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  site_id uuid references public.project_sites(id) on delete set null,
  item_id uuid not null references public.inventory_items(id),
  total_qty numeric(14, 4) not null default 0,
  reserved_qty numeric(14, 4) not null default 0,
  available_qty numeric(14, 4) generated always as (total_qty - reserved_qty) stored,
  last_updated timestamptz default now(),
  unique (project_id, site_id, item_id)
);

-- INDEXES FOR PRODUCTION QUERY SPEED
create index if not exists idx_mr_project_status on public.material_requests(project_id, status);
create index if not exists idx_mr_raised_by on public.material_requests(raised_by);
create index if not exists idx_mr_priority_date on public.material_requests(priority, required_date desc);
create index if not exists idx_mrl_mr_id on public.material_request_lines(material_request_id);

-- RLS POLICIES FOR PRODUCTION
alter table public.material_requests enable row level security;
alter table public.material_request_lines enable row level security;

-- Site engineers and PMs can view MRs in their assigned projects
create policy "Users can view MRs of assigned projects"
  on public.material_requests for select
  using (
    project_id in (
      select project_id from public.project_members where user_id = auth.uid() and is_active = true
    )
    or exists (
      select 1 from public.profiles where id = auth.uid() and role in ('UPPER_MANAGEMENT', 'PR_TEAM')
    )
  );

-- Site Engineers can insert MRs
create policy "Site team can raise MR"
  on public.material_requests for insert
  with check (auth.uid() is not null);
