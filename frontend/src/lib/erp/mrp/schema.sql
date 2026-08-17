-- Material Requirement Planning (MRP) — optional schema support.
--
-- Not executed automatically; ship this to whoever owns the Supabase
-- migrations once a live project is configured for this environment.
--
-- Links BOQ lines directly to the item master so MRP netting doesn't have to
-- fall back to fuzzy name/sku matching between boq_items.description/code and
-- item_master.name/sku. Safe to apply even if some rows are never backfilled:
-- frontend/src/lib/erp/mrp/service.ts already falls back to the name/sku
-- match (and further to `boqMatchConfidence: 'unmatched'`) whenever item_id
-- is null or the column itself does not exist yet.
alter table public.boq_items
  add column if not exists item_id uuid references public.item_master(id);
create index if not exists idx_boq_items_item_id on public.boq_items(item_id);
