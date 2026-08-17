-- ============================================================================
-- PO DELIVERY FOLLOW-UP LOG
-- Apply once Supabase is configured. Mirrors pr_activity_log's shape and RLS
-- conventions (see frontend/src/lib/erp/purchase-requisition/schema.sql) so a
-- buyer chasing a late delivery has a real audit trail instead of a phone call
-- nobody else can see.
-- ============================================================================

create table if not exists public.po_delivery_followups (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  note text not null,
  -- "Vendor promised a new date X" — separate from the PO's own delivery_date,
  -- which is the ORIGINAL promise; this tracks a revised one without erasing it.
  promised_date date,
  actor_id uuid references public.profiles(id),
  actor_role text,
  created_at timestamptz not null default now()
);

create index if not exists idx_po_followup_po on public.po_delivery_followups(purchase_order_id, created_at desc);

alter table public.po_delivery_followups enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'po_delivery_followups' and policyname = 'Read PO follow-ups of assigned projects'
  ) then
    create policy "Read PO follow-ups of assigned projects"
      on public.po_delivery_followups for select
      using (
        project_id in (
          select project_id from public.project_members where user_id = auth.uid() and is_active = true
        )
        or exists (
          select 1 from public.profiles where id = auth.uid() and role in ('upper_management', 'pr_team', 'project_manager')
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'po_delivery_followups' and policyname = 'Authenticated users can append PO follow-ups'
  ) then
    create policy "Authenticated users can append PO follow-ups"
      on public.po_delivery_followups for insert
      with check (auth.uid() is not null);
  end if;
end $$;

-- ============================================================================
-- END OF DELIVERY FOLLOW-UP MIGRATION
-- ============================================================================
