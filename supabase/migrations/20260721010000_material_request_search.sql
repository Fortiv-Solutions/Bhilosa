-- ============================================================================
-- MATERIAL REQUEST — SERVER-SIDE SEARCH / FILTER / SORT / PAGINATE
-- ----------------------------------------------------------------------------
-- Powers the production MR Requests page. Everything (search across MR number,
-- item description and requester name; status/priority/project/reviewer/date
-- filters; My Requests; Pending My Approval; sorting; pagination + total count)
-- is computed in Postgres so the client only ever transfers one 15-row page.
--
-- SECURITY INVOKER — results are naturally scoped by the material_requests RLS
-- policies, so users only page through rows they are allowed to see.
--
-- SAFE TO RE-RUN.
-- ============================================================================

create extension if not exists pg_trgm;

-- Trigram + btree indexes that keep ILIKE search and the filters fast at scale.
create index if not exists idx_mr_number_trgm     on public.material_requests using gin (mr_number gin_trgm_ops);
create index if not exists idx_mrl_desc_trgm       on public.material_request_lines using gin (item_description gin_trgm_ops);
create index if not exists idx_mr_reviewed_by      on public.material_requests(reviewed_by);
create index if not exists idx_mr_raised_by        on public.material_requests(raised_by);
create index if not exists idx_mr_created_at       on public.material_requests(created_at desc);
create index if not exists idx_mr_updated_at       on public.material_requests(updated_at desc);
create index if not exists idx_mr_project_status2  on public.material_requests(project_id, status);

-- ----------------------------------------------------------------------------
-- search_material_requests — returns { total, rows[] } as JSONB.
-- rows are fully shaped like the frontend MaterialRequestRow (nested lines,
-- requester profile, project, site, reviewer).
-- ----------------------------------------------------------------------------
create or replace function public.search_material_requests(
  p_project_id          uuid    default null,
  p_status              text    default null,
  p_priority            text    default null,
  p_assigned_reviewer   uuid    default null,
  p_my_requests         boolean default false,
  p_pending_my_approval boolean default false,
  p_search              text    default null,
  p_date_from           date    default null,
  p_date_to             date    default null,
  p_sort                text    default 'newest',   -- newest|oldest|priority|status|updated
  p_limit               integer default 15,
  p_offset              integer default 0
)
returns jsonb
language sql
stable
as $$
  with base as (
    select mr.*
    from public.material_requests mr
    where mr.deleted_at is null
      and (p_project_id        is null or mr.project_id = p_project_id)
      and (p_status            is null or mr.status = p_status)
      and (p_priority          is null or mr.priority = p_priority)
      and (p_assigned_reviewer is null or mr.reviewed_by = p_assigned_reviewer)
      and (not p_my_requests or mr.raised_by = auth.uid())
      and (not p_pending_my_approval or (
            mr.status in ('submitted','in_review')
            and (mr.reviewed_by = auth.uid() or mr.reviewed_by is null)
          ))
      and (p_date_from is null or mr.created_at::date >= p_date_from)
      and (p_date_to   is null or mr.created_at::date <= p_date_to)
      and (
        p_search is null or p_search = '' or
        mr.mr_number ilike '%' || p_search || '%' or
        exists (select 1 from public.material_request_lines l
                 where l.material_request_id = mr.id and l.item_description ilike '%' || p_search || '%') or
        exists (select 1 from public.profiles pf
                 where pf.id = mr.raised_by and pf.name ilike '%' || p_search || '%')
      )
  ),
  paged as (
    select b.*,
           row_number() over (order by
             case when p_sort = 'oldest'   then b.created_at end asc  nulls last,
             case when p_sort = 'updated'  then b.updated_at end desc nulls last,
             case when p_sort = 'priority' then
               (case b.priority when 'critical' then 4 when 'high' then 3 when 'medium' then 2 when 'low' then 1 else 0 end)
             end desc nulls last,
             case when p_sort = 'status'   then b.status end asc nulls last,
             b.created_at desc
           ) as rn
    from base b
    order by rn
    limit greatest(p_limit, 1) offset greatest(p_offset, 0)
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'rows', coalesce((
      select jsonb_agg(
        (to_jsonb(pg) - 'rn') || jsonb_build_object(
          'material_request_lines',
            coalesce((select jsonb_agg(to_jsonb(l)) from public.material_request_lines l
                      where l.material_request_id = pg.id), '[]'::jsonb),
          'profiles',
            (select jsonb_build_object('name', p.name, 'email', p.email)
             from public.profiles p where p.id = pg.raised_by),
          'projects',
            (select jsonb_build_object('name', pr.name)
             from public.projects pr where pr.id = pg.project_id),
          'project_sites',
            (select jsonb_build_object('name', ps.name)
             from public.project_sites ps where ps.id = pg.site_id),
          'reviewer',
            (select jsonb_build_object('name', rp.name)
             from public.profiles rp where rp.id = pg.reviewed_by)
        )
        order by pg.rn
      )
      from paged pg
    ), '[]'::jsonb)
  );
$$;

-- ----------------------------------------------------------------------------
-- material_request_stats — status/priority roll-up for the KPI bar. Reflects
-- ALL statuses (independent of the active status filter).
-- ----------------------------------------------------------------------------
create or replace function public.material_request_stats(p_project_id uuid default null)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'total',         count(*),
    'pending',       count(*) filter (where status = 'submitted'),
    'underReview',   count(*) filter (where status = 'in_review'),
    'clarification', count(*) filter (where status = 'draft'),
    'converted',     count(*) filter (where status = 'approved'),
    'fulfilled',     count(*) filter (where status = 'closed'),
    'critical',      count(*) filter (where priority = 'critical' and status not in ('closed','rejected','cancelled')),
    'overdue',       count(*) filter (where required_date < current_date and status not in ('closed','rejected','cancelled'))
  )
  from public.material_requests
  where deleted_at is null
    and (p_project_id is null or project_id = p_project_id);
$$;

-- ============================================================================
-- END
-- ============================================================================
