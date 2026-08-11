-- Drop function first to allow replacing parameter default signatures cleanly
DROP FUNCTION IF EXISTS public.search_material_requests(uuid,text,text,uuid,boolean,boolean,text,date,date,text,integer,integer);

-- Exclude draft status MRs from the ERP search RPC
CREATE OR REPLACE FUNCTION public.search_material_requests(
  p_project_id uuid,
  p_status text DEFAULT NULL::text,
  p_priority text DEFAULT NULL::text,
  p_assigned_reviewer uuid DEFAULT NULL::uuid,
  p_my_requests boolean DEFAULT false,
  p_pending_my_approval boolean DEFAULT false,
  p_search text DEFAULT NULL::text,
  p_date_from date DEFAULT NULL::date,
  p_date_to date DEFAULT NULL::date,
  p_sort text DEFAULT 'newest'::text,
  p_limit integer DEFAULT 15,
  p_offset integer DEFAULT 0
)
RETURNS jsonb AS $$
DECLARE
  v_result jsonb;
BEGIN
  with base as (
    select mr.* from public.material_requests mr
    where mr.deleted_at is null
      and mr.status::text <> 'draft' -- Exclude draft Material Requests from showing in ERP
      and (p_project_id is null or mr.project_id = p_project_id)
      and (p_status is null or mr.status::text = p_status)
      and (p_priority is null or mr.priority::text = p_priority)
      and (p_assigned_reviewer is null or mr.reviewed_by = p_assigned_reviewer)
      and (not p_my_requests or mr.raised_by = auth.uid())
      and (not p_pending_my_approval or (mr.status::text in ('submitted','in_review') and (mr.reviewed_by = auth.uid() or mr.reviewed_by is null)))
      and (p_date_from is null or mr.created_at::date >= p_date_from)
      and (p_date_to is null or mr.created_at::date <= p_date_to)
      and (p_search is null or p_search = '' or mr.mr_number ilike '%'||p_search||'%'
           or exists (select 1 from public.material_request_lines l where l.material_request_id = mr.id and l.item_description ilike '%'||p_search||'%')
           or exists (select 1 from public.profiles pf where pf.id = mr.raised_by and pf.name ilike '%'||p_search||'%'))
  ),
  paged as (
    select b.*, row_number() over (order by
      case when p_sort='oldest' then b.created_at end asc nulls last,
      case when p_sort='updated' then b.updated_at end desc nulls last,
      case when p_sort='priority' then (case b.priority::text when 'critical' then 4 when 'high' then 3 when 'medium' then 2 when 'low' then 1 else 0 end) end desc nulls last,
      case when p_sort='status' then b.status::text end asc nulls last,
      b.created_at desc) as rn
    from base b order by rn limit greatest(p_limit,1) offset greatest(p_offset,0)
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'rows', coalesce((select jsonb_agg((to_jsonb(pg) - 'rn') || jsonb_build_object(
        'material_request_lines', coalesce((select jsonb_agg(to_jsonb(l)) from public.material_request_lines l where l.material_request_id = pg.id), '[]'::jsonb),
        'profiles', (select jsonb_build_object('name', p.name, 'email', p.email) from public.profiles p where p.id = pg.raised_by),
        'projects', (select jsonb_build_object('name', pr.name) from public.projects pr where pr.id = pg.project_id),
        'project_sites', (select jsonb_build_object('name', ps.name) from public.project_sites ps where ps.id = pg.site_id),
        'reviewer', (select jsonb_build_object('name', rp.name) from public.profiles rp where rp.id = pg.reviewed_by)
      ) order by pg.rn) from paged pg), '[]'::jsonb)
  ) into v_result;

  return v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
