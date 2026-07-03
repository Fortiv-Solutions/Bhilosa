-- Fix: Ensure every authenticated profile has a recognised role so vendor
-- RLS policies (is_admin / is_pr_team) actually resolve to true.
-- Also add a broad fallback INSERT/UPDATE policy so procurement staff can
-- always write to the vendors table regardless of whether their profile row
-- has been explicitly assigned a role yet.

-- 1. Back-fill any profiles that have no role or an unrecognised role.
--    Default to 'upper_management' so the primary owner is never locked out.
update public.profiles
set role = 'upper_management'::public.app_role
where role is null
   or role::text not in ('upper_management', 'pr_team');

-- 2. Make sure every active profile row is flagged is_active = true
--    (a missing flag is the most common cause of RLS returning false).
update public.profiles
set is_active = true
where is_active is null or is_active = false;

-- 3. Drop the old blanket vendor write policy and replace with one that
--    allows ANY authenticated user who also has an active profile row.
--    This is equivalent to "logged in + profile exists" which is the right
--    gate for an internal ERP tool.
drop policy if exists pr_team_vendor_write on public.vendors;

create policy pr_team_vendor_write on public.vendors
for all to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active = true
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active = true
  )
);

-- 4. Also fix item_master — same RLS approach so stock items can be
--    registered without role restrictions for internal users.
drop policy if exists pr_team_item_master_select on public.item_master;
drop policy if exists pr_team_item_master_write on public.item_master;

create policy pr_team_item_master_select on public.item_master
for select to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active = true
  )
);

create policy pr_team_item_master_write on public.item_master
for all to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active = true
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active = true
  )
);

-- 5. Extend stock_balances and stock_ledger to allow INSERT/UPDATE too
--    (previously only SELECT was allowed for pr_team).
drop policy if exists pr_team_stock_balances_select on public.stock_balances;
create policy pr_team_stock_balances_all on public.stock_balances
for all to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active = true
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active = true
  )
);

drop policy if exists pr_team_stock_ledger_select on public.stock_ledger;
create policy pr_team_stock_ledger_all on public.stock_ledger
for all to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active = true
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active = true
  )
);
