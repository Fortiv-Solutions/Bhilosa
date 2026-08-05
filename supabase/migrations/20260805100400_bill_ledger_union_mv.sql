-- ============================================================================
-- PHASE 4 — UNIFIED BILL LEDGER (materialized) + KEYSET RPCs + RETENTION RELEASE
-- File: supabase/migrations/20260805100400_bill_ledger_union_mv.sql
--
-- Depends on: 20260805100300_service_bill_budget_integration.sql
--
-- THE PROBLEM
-- ===========
-- 1. budget_bill_ledger_view read vendor_bills only, so contractor RA bills were
--    invisible in the module that exists to answer "what has this project spent".
--
-- 2. It could not be paginated. running_available_budget is a window function
--    over the ENTIRE allocation partition, so Postgres must materialise and order
--    the whole partition before any outer LIMIT applies. fetchBillLedger
--    therefore pulled every row and sliced client-side. Adding a second UNION
--    branch roughly doubles that cost.
--
-- 3. Free-text search was a nine-column ILIKE OR chain, which cannot use an index.
--
-- 4. erp_budget_txn_type gained 'retention_released' in Phase 1 and nothing ever
--    emitted it, so budget_allocations.retention_held could only ever grow.
--
-- WHAT THIS MIGRATION DOES
-- ========================
-- * budget_bill_ledger_mv — one materialized view over BOTH bill spines,
--   approved/paid only, with the running balance computed ABOVE the union (per
--   branch it would be meaningless) and a tsvector for search.
-- * budget_bill_ledger_view is kept as a thin compatibility view over the MV, so
--   nothing that already reads it breaks.
-- * rpc_bill_ledger / rpc_bill_ledger_summary / rpc_bill_ledger_export —
--   keyset-paginated reads. Keyset, not OFFSET: the ledger grows monotonically
--   and OFFSET degrades linearly.
-- * retention_releases — the document that finally emits 'retention_released'.
--
-- CONSISTENCY MODEL
-- =================
-- The MV is refreshed CONCURRENTLY, so readers never block, but the ledger is
-- eventually consistent by design. That is the right trade for a ledger of
-- CERTIFIED bills: certification is a low-frequency, deliberate act. The app
-- calls rpc_refresh_bill_ledger() after any mutation it initiates, and a
-- scheduled refresh catches anything else.
--
-- Idempotent and non-destructive: safe to re-run.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 0. LOCK DISCIPLINE + PRECONDITIONS  (see Phase 3 for the deadlock this avoids)
-- ----------------------------------------------------------------------------

SET LOCAL lock_timeout = '20s';
SET LOCAL statement_timeout = '600s';
SET LOCAL deadlock_timeout = '2s';

DO $$
DECLARE
  v_missing text[] := ARRAY[]::text[];
BEGIN
  IF to_regclass('public.service_bill_lines') IS NULL THEN
    v_missing := array_append(v_missing,
      'service_bill_lines (apply 20260805100300_service_bill_budget_integration.sql)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'service_bills'
      AND column_name = 'net_payable_amount'
  ) THEN
    v_missing := array_append(v_missing,
      'service_bills.net_payable_amount (apply 20260805100300)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'erp_budget_txn_type' AND e.enumlabel = 'retention_released'
  ) THEN
    v_missing := array_append(v_missing,
      'erp_budget_txn_type.retention_released (apply 20260805100000)');
  END IF;

  IF array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION 'Unified bill ledger cannot apply. Missing: %',
      array_to_string(v_missing, '; ');
  END IF;
END $$;

LOCK TABLE public.budget_allocations,
           public.payments,
           public.service_bills,
           public.vendor_bills
  IN ACCESS EXCLUSIVE MODE;

-- ----------------------------------------------------------------------------
-- 1. RETENTION RELEASE DOCUMENT
--    Retention is withheld at certification and released at the end of the
--    defects liability period. Without a document to release it,
--    budget_allocations.retention_held was a number that could only grow.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.retention_releases (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES public.projects(id),
  /* Exactly one source bill, mirroring payments. */
  vendor_bill_id  uuid REFERENCES public.vendor_bills(id),
  service_bill_id uuid REFERENCES public.service_bills(id),

  release_number text NOT NULL,
  release_date   date NOT NULL DEFAULT CURRENT_DATE,
  amount         numeric NOT NULL CHECK (amount > 0),
  reason         text,

  status      text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved', 'paid', 'cancelled')),
  approved_by uuid REFERENCES public.profiles(id),
  approved_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),

  CONSTRAINT retention_releases_exactly_one_bill_chk
    CHECK (num_nonnulls(vendor_bill_id, service_bill_id) = 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_retention_releases_number
  ON public.retention_releases (project_id, lower(btrim(release_number)));
CREATE INDEX IF NOT EXISTS idx_retention_releases_vendor_bill
  ON public.retention_releases (vendor_bill_id) WHERE vendor_bill_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_retention_releases_service_bill
  ON public.retention_releases (service_bill_id) WHERE service_bill_id IS NOT NULL;

-- 1b. Never release more than the bill actually withheld.
CREATE OR REPLACE FUNCTION public.fn_retention_release_guard()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_withheld numeric;
  v_already  numeric;
BEGIN
  IF NEW.vendor_bill_id IS NOT NULL THEN
    SELECT COALESCE(retention_amount, 0) INTO v_withheld
    FROM public.vendor_bills WHERE id = NEW.vendor_bill_id;
  ELSE
    SELECT COALESCE(retention_amount, 0) INTO v_withheld
    FROM public.service_bills WHERE id = NEW.service_bill_id;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_already
  FROM public.retention_releases
  WHERE status IN ('approved', 'paid')
    AND id IS DISTINCT FROM NEW.id
    AND vendor_bill_id  IS NOT DISTINCT FROM NEW.vendor_bill_id
    AND service_bill_id IS NOT DISTINCT FROM NEW.service_bill_id;

  IF NEW.status IN ('approved', 'paid') AND (v_already + NEW.amount) > COALESCE(v_withheld, 0) THEN
    RAISE EXCEPTION
      'Retention release of % exceeds what this bill withheld (% withheld, % already released).',
      NEW.amount, COALESCE(v_withheld, 0), v_already
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_retention_release_guard ON public.retention_releases;
CREATE TRIGGER trg_retention_release_guard
  BEFORE INSERT OR UPDATE OF amount, status ON public.retention_releases
  FOR EACH ROW EXECUTE FUNCTION public.fn_retention_release_guard();

-- 1c. Approval posts 'retention_released' against the same head that held it.
CREATE OR REPLACE FUNCTION public.fn_post_retention_release()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_source_table text;
  v_source_id    uuid;
  v_allocation   uuid;
  v_category     uuid;
  v_doc          text;
BEGIN
  IF NEW.status NOT IN ('approved', 'paid') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IN ('approved', 'paid') THEN
    RETURN NEW;  -- already posted
  END IF;

  -- Release where the retention was held, taken from the ledger row itself so it
  -- can never land in a different head than the one it was withheld from.
  IF NEW.vendor_bill_id IS NOT NULL THEN
    v_source_table := 'vendor_bills';
    v_source_id    := NEW.vendor_bill_id;
  ELSE
    v_source_table := 'service_bills';
    v_source_id    := NEW.service_bill_id;
  END IF;

  SELECT bl.budget_allocation_id, bl.category_id, bl.document_no
    INTO v_allocation, v_category, v_doc
  FROM public.budget_ledger bl
  WHERE bl.source_table = v_source_table
    AND bl.source_id = v_source_id
    AND bl.transaction_type = 'retention_held'::erp_budget_txn_type
    AND bl.reverses_ledger_id IS NULL
  ORDER BY bl.revision_seq DESC
  LIMIT 1;

  IF v_allocation IS NULL THEN
    RETURN NEW;  -- nothing was ever withheld against a budget head
  END IF;

  INSERT INTO public.budget_ledger (
    project_id, budget_allocation_id, category_id, transaction_type,
    source_table, source_id, amount, retention_amount,
    description, posted_at, document_date, document_no, financial_year, revision_seq
  ) VALUES (
    NEW.project_id, v_allocation, v_category, 'retention_released'::erp_budget_txn_type,
    'retention_releases', NEW.id, NEW.amount, NEW.amount,
    'Retention released: ' || NEW.release_number
      || COALESCE(' (bill ' || v_doc || ')', ''),
    now(), NEW.release_date, NEW.release_number, public.fn_budget_current_fy(),
    public.fn_next_ledger_revision_seq('retention_releases', NEW.id,
                                       'retention_released'::erp_budget_txn_type)
  )
  ON CONFLICT (source_table, source_id, transaction_type, revision_seq) DO NOTHING;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_post_retention_release ON public.retention_releases;
CREATE TRIGGER trg_post_retention_release
  AFTER INSERT OR UPDATE OF status ON public.retention_releases
  FOR EACH ROW EXECUTE FUNCTION public.fn_post_retention_release();

ALTER TABLE public.retention_releases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.retention_releases FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.retention_releases TO authenticated;

DROP POLICY IF EXISTS retention_releases_select ON public.retention_releases;
CREATE POLICY retention_releases_select ON public.retention_releases
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS retention_releases_insert ON public.retention_releases;
CREATE POLICY retention_releases_insert ON public.retention_releases
  FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS retention_releases_update ON public.retention_releases;
CREATE POLICY retention_releases_update ON public.retention_releases
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- 2. THE UNIFIED LEDGER
--
--    One row per billed LINE on both branches; a bill with no lines appears once
--    as a header row. Only approved/paid bills — a ledger of uncertified claims
--    is not a ledger, and it would disagree with budget_ledger, which only ever
--    receives certified documents.
-- ----------------------------------------------------------------------------

DROP VIEW IF EXISTS public.budget_bill_ledger_view CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.budget_bill_ledger_mv CASCADE;

CREATE MATERIALIZED VIEW public.budget_bill_ledger_mv AS
WITH bill_payments AS (
  SELECT vendor_bill_id  AS bill_id, 'material'::text AS bill_source,
         COALESCE(SUM(amount) FILTER (WHERE status = 'paid'::erp_payment_status), 0) AS paid_amount
  FROM public.payments WHERE vendor_bill_id IS NOT NULL
  GROUP BY vendor_bill_id
  UNION ALL
  SELECT service_bill_id AS bill_id, 'service'::text AS bill_source,
         COALESCE(SUM(amount) FILTER (WHERE status = 'paid'::erp_payment_status), 0) AS paid_amount
  FROM public.payments WHERE service_bill_id IS NOT NULL
  GROUP BY service_bill_id
),
retention_released AS (
  SELECT COALESCE(vendor_bill_id, service_bill_id) AS bill_id,
         COALESCE(SUM(amount) FILTER (WHERE status IN ('approved', 'paid')), 0) AS released_amount
  FROM public.retention_releases
  GROUP BY COALESCE(vendor_bill_id, service_bill_id)
),
unioned AS (
  -- ---------------- MATERIAL BILLS ----------------
  SELECT
    'material'::text                                                  AS bill_source,
    vb.id                                                             AS bill_id,
    vbl.id                                                            AS line_id,
    vb.project_id,
    COALESCE(bc.category_name, ba.allocation_name, 'Unallocated')      AS head_activity,
    COALESCE(mbi.item_description, vbl.description, 'Unmapped')       AS sub_activity_ledger,
    COALESCE(bh.code, cc.code, bc.category_code, 'UNMAPPED')          AS cost_code,
    bc.id                                                             AS category_id,
    vb.master_budget_item_id,
    ba.id                                                             AS budget_allocation_id,
    ba.allocation_name,
    COALESCE(ba.allocated_amount, 0)                                  AS category_allocated_amount,
    v.id                                                              AS vendor_id,
    COALESCE(v.display_name, v.legal_name, 'Unknown vendor')          AS supplier_name,
    v.gst_number                                                      AS supplier_gst,
    vb.bill_number                                                    AS bill_no,
    COALESCE(vb.supplier_bill_no, vb.bill_book_number, vb.bill_number) AS bill_no_of_supplier,
    vb.bill_date                                                      AS bill_date,
    vb.created_at                                                     AS accounting_date,
    NULL::integer                                                     AS ra_sequence,
    COALESCE(vbl.description, mbi.item_description, 'Bill total')     AS item_desc,
    COALESCE(im.name, 'General')                                      AS item_group,
    COALESCE(vbl.unit, mbi.unit, 'LS')                                AS unit,
    COALESCE(vbl.quantity, 0)                                         AS billed_qty,
    COALESCE(vbl.rate, 0)                                             AS final_bill_rate,
    COALESCE(vbl.line_total, vb.subtotal_amount, 0)                   AS bill_item_amt,
    COALESCE(vbl.tax_rate, 0)                                         AS gst_rate,
    COALESCE(vb.total_amount, 0)                                      AS gross_bill_amount,
    COALESCE(vb.retention_percent, 0)                                 AS retention_percent,
    COALESCE(vb.retention_amount, 0)                                  AS retention_deduction,
    COALESCE(vb.advance_adjusted, 0)                                  AS advance_payment,
    COALESCE(vb.other_deductions, 0)                                  AS other_deductions,
    COALESCE(vb.net_payable_amount, 0)                                AS final_bill_amount,
    vb.status::text                                                   AS bill_status,
    vb.payment_status::text                                           AS payment_status,
    vb.match_status,
    COALESCE(po.po_number, '')                                        AS source_doc_no,
    'PO'::text                                                        AS source_doc_type,
    COALESCE(pol.unit_rate, 0)                                        AS source_doc_rate,
    COALESCE(pr.pr_number, '')                                        AS pr_no,
    COALESCE(grn.grn_number, '')                                      AS grn_no,
    COALESCE(vb.ledger_remarks, vb.match_remarks, '')                 AS remarks
  FROM public.vendor_bills vb
  LEFT JOIN public.vendor_bill_lines   vbl ON vbl.vendor_bill_id = vb.id
  LEFT JOIN public.vendors             v   ON v.id   = vb.vendor_id
  LEFT JOIN public.master_budget_items mbi ON mbi.id = vb.master_budget_item_id
  LEFT JOIN public.budget_categories   bc  ON bc.id  = mbi.category_id
  LEFT JOIN public.budget_allocations  ba  ON ba.id  = COALESCE(
              vb.budget_allocation_id,
              (SELECT id FROM public.budget_allocations
               WHERE project_id = vb.project_id AND category_id = mbi.category_id
                 AND deleted_at IS NULL LIMIT 1))
  LEFT JOIN public.budget_heads          bh  ON bh.id  = ba.budget_head_id
  LEFT JOIN public.cost_codes            cc  ON cc.id  = bh.cost_code_id
  LEFT JOIN public.purchase_orders       po  ON po.id  = vb.purchase_order_id
  LEFT JOIN public.purchase_order_lines  pol ON pol.id = vbl.purchase_order_line_id
  LEFT JOIN public.purchase_requisitions pr  ON pr.id  = po.purchase_requisition_id
  LEFT JOIN public.goods_receipt_notes   grn ON grn.id = vb.grn_id
  LEFT JOIN public.item_master           im  ON im.id  = vbl.item_id
  WHERE vb.deleted_at IS NULL
    AND vb.status IN ('approved'::erp_billing_status, 'paid'::erp_billing_status)

  UNION ALL

  -- ---------------- SERVICE BILLS ----------------
  SELECT
    'service'::text                                                   AS bill_source,
    sb.id                                                             AS bill_id,
    sbl.id                                                            AS line_id,
    sb.project_id,
    COALESCE(bc.category_name, ba.allocation_name, 'Unallocated')      AS head_activity,
    COALESCE(mbi.item_description, sbl.description, sb.service_description, 'Unmapped') AS sub_activity_ledger,
    COALESCE(bh.code, cc.code, bc.category_code, 'UNMAPPED')          AS cost_code,
    bc.id                                                             AS category_id,
    COALESCE(sb.master_budget_item_id, wo.master_budget_item_id)      AS master_budget_item_id,
    ba.id                                                             AS budget_allocation_id,
    ba.allocation_name,
    COALESCE(ba.allocated_amount, 0)                                  AS category_allocated_amount,
    v.id                                                              AS vendor_id,
    COALESCE(v.display_name, v.legal_name, 'Unknown vendor')          AS supplier_name,
    v.gst_number                                                      AS supplier_gst,
    sb.bill_number                                                    AS bill_no,
    COALESCE(sb.supplier_bill_no, sb.bill_number)                     AS bill_no_of_supplier,
    sb.bill_date                                                      AS bill_date,
    sb.created_at                                                     AS accounting_date,
    sb.ra_sequence,
    COALESCE(sbl.description, sb.service_description, 'Bill total')   AS item_desc,
    'Service'::text                                                   AS item_group,
    COALESCE(sbl.unit, 'LS')                                          AS unit,
    COALESCE(sbl.quantity, 0)                                         AS billed_qty,
    COALESCE(sbl.rate, 0)                                             AS final_bill_rate,
    COALESCE(sbl.line_total, sb.subtotal_amount, 0)                   AS bill_item_amt,
    COALESCE(sbl.tax_rate, 0)                                         AS gst_rate,
    COALESCE(sb.total_amount, 0)                                      AS gross_bill_amount,
    COALESCE(sb.retention_percent, 0)                                 AS retention_percent,
    COALESCE(sb.retention_amount, 0)                                  AS retention_deduction,
    COALESCE(sb.advance_adjusted, 0)                                  AS advance_payment,
    COALESCE(sb.other_deductions, 0)                                  AS other_deductions,
    COALESCE(sb.net_payable_amount, 0)                                AS final_bill_amount,
    sb.status                                                         AS bill_status,
    sb.payment_status                                                 AS payment_status,
    NULL::text                                                        AS match_status,
    COALESCE(wo.work_order_number, '')                                AS source_doc_no,
    'WO'::text                                                        AS source_doc_type,
    0::numeric                                                        AS source_doc_rate,
    ''::text                                                          AS pr_no,
    ''::text                                                          AS grn_no,
    COALESCE(sb.ledger_remarks, sb.remarks, '')                       AS remarks
  FROM public.service_bills sb
  LEFT JOIN public.service_bill_lines  sbl ON sbl.service_bill_id = sb.id
  LEFT JOIN public.work_orders         wo  ON wo.id  = sb.work_order_id
  LEFT JOIN public.vendors             v   ON v.id   = sb.vendor_id
  LEFT JOIN public.budget_allocations  ba  ON ba.id  = COALESCE(wo.budget_allocation_id, sb.budget_allocation_id)
  LEFT JOIN public.budget_categories   bc  ON bc.id  = ba.category_id
  LEFT JOIN public.master_budget_items mbi ON mbi.id = COALESCE(sb.master_budget_item_id, wo.master_budget_item_id)
  LEFT JOIN public.budget_heads        bh  ON bh.id  = ba.budget_head_id
  LEFT JOIN public.cost_codes          cc  ON cc.id  = bh.cost_code_id
  WHERE sb.deleted_at IS NULL
    AND sb.status IN ('approved', 'paid')
)
SELECT
  -- Composite key. Two source tables cannot guarantee UUID disjointness, and the
  -- unique index below (required for REFRESH CONCURRENTLY) needs a stable key.
  u.bill_source || ':' || u.bill_id::text || ':' || COALESCE(u.line_id::text, u.bill_id::text) AS id,
  u.*,
  COALESCE(bp.paid_amount, 0)                                           AS jv_payment,
  GREATEST(0, u.final_bill_amount - COALESCE(bp.paid_amount, 0))        AS expected_payment,
  COALESCE(rr.released_amount, 0)                                       AS retention_released,
  GREATEST(0, u.retention_deduction - COALESCE(rr.released_amount, 0))  AS retention_outstanding,
  p.name                                                                AS project_name,
  p.code                                                                AS project_code,

  -- Running available budget, computed ABOVE the union. Inside each branch the
  -- two spines would each keep their own running total against the same head and
  -- the number would be meaningless. On the GROSS basis, matching the Phase 1
  -- restatement: this is budget consumption, not cash.
  u.category_allocated_amount - SUM(u.gross_bill_amount) OVER (
    PARTITION BY u.project_id, COALESCE(u.budget_allocation_id, '00000000-0000-0000-0000-000000000000'::uuid)
    ORDER BY u.bill_date NULLS LAST, u.bill_id, COALESCE(u.line_id, u.bill_id)
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  )                                                                     AS running_available_budget,

  -- Replaces the nine-column ILIKE OR chain, which could not use an index.
  to_tsvector('simple',
    COALESCE(u.supplier_name, '') || ' ' || COALESCE(u.bill_no, '') || ' ' ||
    COALESCE(u.bill_no_of_supplier, '') || ' ' || COALESCE(u.cost_code, '') || ' ' ||
    COALESCE(u.head_activity, '') || ' ' || COALESCE(u.sub_activity_ledger, '') || ' ' ||
    COALESCE(u.source_doc_no, '') || ' ' || COALESCE(u.pr_no, '') || ' ' ||
    COALESCE(u.grn_no, '') || ' ' || COALESCE(u.item_desc, '')
  )                                                                     AS search_tsv
FROM unioned u
JOIN      public.projects p  ON p.id = u.project_id
LEFT JOIN bill_payments   bp ON bp.bill_id = u.bill_id AND bp.bill_source = u.bill_source
LEFT JOIN retention_released rr ON rr.bill_id = u.bill_id;

COMMENT ON MATERIALIZED VIEW public.budget_bill_ledger_mv IS
  'Unified project-wise bill ledger: material (vendor_bills) + service (service_bills), certified bills only, one row per billed line. Refreshed CONCURRENTLY — eventually consistent by design. Read through rpc_bill_ledger.';

-- REFRESH ... CONCURRENTLY requires a unique index.
CREATE UNIQUE INDEX IF NOT EXISTS uq_bill_ledger_mv_id
  ON public.budget_bill_ledger_mv (id);

-- Keyset pagination cursor: (bill_date DESC, id).
CREATE INDEX IF NOT EXISTS idx_bill_ledger_mv_keyset
  ON public.budget_bill_ledger_mv (project_id, bill_date DESC, id);
CREATE INDEX IF NOT EXISTS idx_bill_ledger_mv_allocation
  ON public.budget_bill_ledger_mv (project_id, budget_allocation_id);
CREATE INDEX IF NOT EXISTS idx_bill_ledger_mv_filters
  ON public.budget_bill_ledger_mv (project_id, bill_source, bill_status, payment_status);
CREATE INDEX IF NOT EXISTS idx_bill_ledger_mv_search
  ON public.budget_bill_ledger_mv USING gin (search_tsv);

REVOKE ALL ON public.budget_bill_ledger_mv FROM anon;
GRANT SELECT ON public.budget_bill_ledger_mv TO authenticated;

-- 2b. Compatibility view. Anything still selecting budget_bill_ledger_view keeps
--     working, and now sees service bills too.
CREATE VIEW public.budget_bill_ledger_view AS
  SELECT * FROM public.budget_bill_ledger_mv;

REVOKE ALL ON public.budget_bill_ledger_view FROM anon;
GRANT SELECT ON public.budget_bill_ledger_view TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. REFRESH CONTROL
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.budget_ledger_mv_state (
  id                 boolean PRIMARY KEY DEFAULT true CHECK (id),
  last_refreshed_at  timestamptz NOT NULL DEFAULT now(),
  last_refresh_ms    integer NOT NULL DEFAULT 0,
  row_count          bigint  NOT NULL DEFAULT 0
);
INSERT INTO public.budget_ledger_mv_state (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

REVOKE ALL ON public.budget_ledger_mv_state FROM anon;
GRANT SELECT ON public.budget_ledger_mv_state TO authenticated;
ALTER TABLE public.budget_ledger_mv_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS budget_ledger_mv_state_select ON public.budget_ledger_mv_state;
CREATE POLICY budget_ledger_mv_state_select ON public.budget_ledger_mv_state
  FOR SELECT TO authenticated USING (true);

/* Refresh the ledger. CONCURRENTLY so readers are never blocked.
   p_max_age_seconds lets a caller say "only if it is actually stale", which is
   what makes it safe for the UI to call on every load without thrashing. */
CREATE OR REPLACE FUNCTION public.rpc_refresh_bill_ledger(p_max_age_seconds integer DEFAULT 0)
RETURNS public.budget_ledger_mv_state
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_state public.budget_ledger_mv_state;
  v_start timestamptz := clock_timestamp();
  v_rows  bigint;
BEGIN
  SELECT * INTO v_state FROM public.budget_ledger_mv_state WHERE id;

  IF p_max_age_seconds > 0
     AND v_state.last_refreshed_at > now() - make_interval(secs => p_max_age_seconds) THEN
    RETURN v_state;  -- fresh enough
  END IF;

  REFRESH MATERIALIZED VIEW CONCURRENTLY public.budget_bill_ledger_mv;

  SELECT COUNT(*) INTO v_rows FROM public.budget_bill_ledger_mv;

  UPDATE public.budget_ledger_mv_state
  SET last_refreshed_at = now(),
      last_refresh_ms   = GREATEST(0, EXTRACT(MILLISECONDS FROM clock_timestamp() - v_start)::integer),
      row_count         = v_rows
  WHERE id
  RETURNING * INTO v_state;

  RETURN v_state;
END $$;

GRANT EXECUTE ON FUNCTION public.rpc_refresh_bill_ledger(integer) TO authenticated;
REVOKE ALL ON FUNCTION public.rpc_refresh_bill_ledger(integer) FROM anon;

-- Scheduled catch-up, so a change made outside the app still lands. pg_cron is
-- optional on Supabase; if it is absent the app-triggered refresh covers it.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('refresh-bill-ledger')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-bill-ledger');

    PERFORM cron.schedule('refresh-bill-ledger', '*/5 * * * *',
                          $cron$SELECT public.rpc_refresh_bill_ledger(0)$cron$);
    RAISE NOTICE 'Scheduled bill-ledger refresh every 5 minutes via pg_cron.';
  ELSE
    RAISE NOTICE 'pg_cron not installed - the bill ledger refreshes on demand via rpc_refresh_bill_ledger().';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not schedule the bill-ledger refresh (%). On-demand refresh still works.', SQLERRM;
END $$;

-- ----------------------------------------------------------------------------
-- 4. READ RPCs — keyset pagination, server-side filtering and aggregation.
--
--    Keyset rather than OFFSET: the ledger grows monotonically and OFFSET
--    degrades linearly as it does.
-- ----------------------------------------------------------------------------

-- NOTE ON THE FILTER PREDICATE
-- ----------------------------
-- The predicate is written INLINE in each of the three RPCs below rather than
-- factored into a shared helper. That is deliberate and it matters:
--
--   a helper taking the whole MV row (fn_matches(m, filters)) is opaque to the
--   planner, so it degenerates to a sequential scan with a per-row function call
--   and the GIN index on search_tsv — the entire point of building one — is never
--   used.
--
-- The three copies must stay in step. Any change to one belongs in all three.

CREATE OR REPLACE FUNCTION public.rpc_bill_ledger(
  p_project_id uuid    DEFAULT NULL,
  p_filters    jsonb   DEFAULT '{}'::jsonb,
  p_limit      integer DEFAULT 100,
  p_cursor     jsonb   DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_limit       integer := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);
  v_cursor_date date    := NULLIF(p_cursor->>'billDate', '')::date;
  v_cursor_id   text    := p_cursor->>'id';
  v_rows        jsonb;
  v_count       integer;
BEGIN
  SELECT COALESCE(jsonb_agg(to_jsonb(t) - 'search_tsv' ORDER BY t.bill_date DESC NULLS LAST, t.id), '[]'::jsonb),
         COUNT(*)
    INTO v_rows, v_count
  FROM (
    SELECT m.*
    FROM public.budget_bill_ledger_mv m
    WHERE (p_project_id IS NULL OR m.project_id = p_project_id)
      -- Inline filter predicate (see the note above; keep all three copies in step).
      AND (p_filters->>'billSource'    IS NULL OR p_filters->>'billSource'    = 'All' OR m.bill_source    = p_filters->>'billSource')
      AND (p_filters->>'billStatus'    IS NULL OR p_filters->>'billStatus'    = 'All' OR m.bill_status    = p_filters->>'billStatus')
      AND (p_filters->>'paymentStatus' IS NULL OR p_filters->>'paymentStatus' = 'All' OR m.payment_status = p_filters->>'paymentStatus')
      AND (p_filters->>'categoryId'    IS NULL OR p_filters->>'categoryId'    = 'All' OR m.category_id    = (p_filters->>'categoryId')::uuid)
      AND (p_filters->>'vendorId'      IS NULL OR m.vendor_id  = (p_filters->>'vendorId')::uuid)
      AND (p_filters->>'fromDate'      IS NULL OR m.bill_date >= (p_filters->>'fromDate')::date)
      AND (p_filters->>'toDate'        IS NULL OR m.bill_date <= (p_filters->>'toDate')::date)
      AND (COALESCE(btrim(p_filters->>'search'), '') = ''
           OR m.search_tsv @@ plainto_tsquery('simple', p_filters->>'search'))
      -- Keyset: strictly "after" the cursor in (bill_date DESC, id ASC) order.
      AND (
        v_cursor_date IS NULL
        OR m.bill_date < v_cursor_date
        OR (m.bill_date = v_cursor_date AND m.id > v_cursor_id)
      )
    ORDER BY m.bill_date DESC NULLS LAST, m.id
    LIMIT v_limit
  ) t;

  RETURN jsonb_build_object(
    'rows', v_rows,
    'hasMore', v_count = v_limit,
    'nextCursor',
      CASE WHEN v_count = v_limit
           THEN jsonb_build_object(
                  'billDate', v_rows -> (v_count - 1) ->> 'bill_date',
                  'id',       v_rows -> (v_count - 1) ->> 'id')
           ELSE NULL END
  );
END $$;

/* Totals across the WHOLE filtered set, not the current page. Without this the
   KPI cards would silently become page totals the moment pagination landed. */
CREATE OR REPLACE FUNCTION public.rpc_bill_ledger_summary(
  p_project_id uuid  DEFAULT NULL,
  p_filters    jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH filtered AS (
    SELECT m.*
    FROM public.budget_bill_ledger_mv m
    WHERE (p_project_id IS NULL OR m.project_id = p_project_id)
      -- Inline filter predicate (keep in step with rpc_bill_ledger / _export).
      AND (p_filters->>'billSource'    IS NULL OR p_filters->>'billSource'    = 'All' OR m.bill_source    = p_filters->>'billSource')
      AND (p_filters->>'billStatus'    IS NULL OR p_filters->>'billStatus'    = 'All' OR m.bill_status    = p_filters->>'billStatus')
      AND (p_filters->>'paymentStatus' IS NULL OR p_filters->>'paymentStatus' = 'All' OR m.payment_status = p_filters->>'paymentStatus')
      AND (p_filters->>'categoryId'    IS NULL OR p_filters->>'categoryId'    = 'All' OR m.category_id    = (p_filters->>'categoryId')::uuid)
      AND (p_filters->>'vendorId'      IS NULL OR m.vendor_id  = (p_filters->>'vendorId')::uuid)
      AND (p_filters->>'fromDate'      IS NULL OR m.bill_date >= (p_filters->>'fromDate')::date)
      AND (p_filters->>'toDate'        IS NULL OR m.bill_date <= (p_filters->>'toDate')::date)
      AND (COALESCE(btrim(p_filters->>'search'), '') = ''
           OR m.search_tsv @@ plainto_tsquery('simple', p_filters->>'search'))
  ),
  /* Money columns are HEADER figures repeated across a bill's lines, so they
     must be deduped to one row per bill before summing. Line counts come from
     `filtered` directly. */
  per_bill AS (
    SELECT DISTINCT ON (bill_source, bill_id)
           bill_source, bill_id, gross_bill_amount, retention_deduction,
           retention_outstanding, final_bill_amount, jv_payment, expected_payment
    FROM filtered
    ORDER BY bill_source, bill_id
  )
  SELECT jsonb_build_object(
    'lineCount',            (SELECT COUNT(*) FROM filtered),
    'billCount',            (SELECT COUNT(*) FROM per_bill),
    'materialBillCount',    (SELECT COUNT(*) FROM per_bill WHERE bill_source = 'material'),
    'serviceBillCount',     (SELECT COUNT(*) FROM per_bill WHERE bill_source = 'service'),
    'gross',                COALESCE(SUM(gross_bill_amount), 0),
    'retention',            COALESCE(SUM(retention_deduction), 0),
    'retentionOutstanding', COALESCE(SUM(retention_outstanding), 0),
    'netPayable',           COALESCE(SUM(final_bill_amount), 0),
    'paid',                 COALESCE(SUM(jv_payment), 0),
    'outstanding',          COALESCE(SUM(expected_payment), 0)
  )
  FROM per_bill;
$$;

/* Full filtered set for CSV export. Capped so an accidental portfolio-wide export
   cannot pin the server; the caller is told when the cap was hit rather than
   silently receiving a truncated file. */
CREATE OR REPLACE FUNCTION public.rpc_bill_ledger_export(
  p_project_id uuid    DEFAULT NULL,
  p_filters    jsonb   DEFAULT '{}'::jsonb,
  p_limit      integer DEFAULT 20000
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 20000), 1), 50000);
  v_rows  jsonb;
  v_count integer;
BEGIN
  SELECT COALESCE(jsonb_agg(to_jsonb(t) - 'search_tsv' ORDER BY t.bill_date DESC NULLS LAST, t.id), '[]'::jsonb),
         COUNT(*)
    INTO v_rows, v_count
  FROM (
    SELECT m.* FROM public.budget_bill_ledger_mv m
    WHERE (p_project_id IS NULL OR m.project_id = p_project_id)
      -- Inline filter predicate (keep in step with rpc_bill_ledger / _summary).
      AND (p_filters->>'billSource'    IS NULL OR p_filters->>'billSource'    = 'All' OR m.bill_source    = p_filters->>'billSource')
      AND (p_filters->>'billStatus'    IS NULL OR p_filters->>'billStatus'    = 'All' OR m.bill_status    = p_filters->>'billStatus')
      AND (p_filters->>'paymentStatus' IS NULL OR p_filters->>'paymentStatus' = 'All' OR m.payment_status = p_filters->>'paymentStatus')
      AND (p_filters->>'categoryId'    IS NULL OR p_filters->>'categoryId'    = 'All' OR m.category_id    = (p_filters->>'categoryId')::uuid)
      AND (p_filters->>'vendorId'      IS NULL OR m.vendor_id  = (p_filters->>'vendorId')::uuid)
      AND (p_filters->>'fromDate'      IS NULL OR m.bill_date >= (p_filters->>'fromDate')::date)
      AND (p_filters->>'toDate'        IS NULL OR m.bill_date <= (p_filters->>'toDate')::date)
      AND (COALESCE(btrim(p_filters->>'search'), '') = ''
           OR m.search_tsv @@ plainto_tsquery('simple', p_filters->>'search'))
    ORDER BY m.bill_date DESC NULLS LAST, m.id
    LIMIT v_limit
  ) t;

  RETURN jsonb_build_object('rows', v_rows, 'truncated', v_count = v_limit, 'limit', v_limit);
END $$;

GRANT EXECUTE ON FUNCTION public.rpc_bill_ledger(uuid, jsonb, integer, jsonb)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_bill_ledger_summary(uuid, jsonb)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_bill_ledger_export(uuid, jsonb, integer)   TO authenticated;
REVOKE ALL ON FUNCTION public.rpc_bill_ledger(uuid, jsonb, integer, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_bill_ledger_summary(uuid, jsonb)         FROM anon;
REVOKE ALL ON FUNCTION public.rpc_bill_ledger_export(uuid, jsonb, integer) FROM anon;

-- ----------------------------------------------------------------------------
-- 5. BILL DETAIL RPC — everything the Phase 5 drawer needs, in one round trip.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_bill_detail(
  p_bill_source text,
  p_bill_id     uuid
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_header  jsonb;
  v_lines   jsonb;
  v_ledger  jsonb;
  v_pays    jsonb;
  v_ret     jsonb;
  v_files   jsonb;
BEGIN
  IF p_bill_source NOT IN ('material', 'service') THEN
    RAISE EXCEPTION 'Unknown bill source "%". Expected material or service.', p_bill_source
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_bill_source = 'material' THEN
    SELECT to_jsonb(vb) || jsonb_build_object(
             'vendor_name',   COALESCE(v.display_name, v.legal_name),
             'vendor_gst',    v.gst_number,
             'po_number',     po.po_number,
             'grn_number',    grn.grn_number,
             'pr_number',     pr.pr_number,
             'allocation_name', ba.allocation_name,
             'category_name',   bc.category_name,
             'master_budget_item', mbi.item_description)
      INTO v_header
    FROM public.vendor_bills vb
    LEFT JOIN public.vendors               v   ON v.id  = vb.vendor_id
    LEFT JOIN public.purchase_orders       po  ON po.id = vb.purchase_order_id
    LEFT JOIN public.goods_receipt_notes   grn ON grn.id = vb.grn_id
    LEFT JOIN public.purchase_requisitions pr  ON pr.id = po.purchase_requisition_id
    LEFT JOIN public.budget_allocations    ba  ON ba.id = vb.budget_allocation_id
    LEFT JOIN public.budget_categories     bc  ON bc.id = ba.category_id
    LEFT JOIN public.master_budget_items   mbi ON mbi.id = vb.master_budget_item_id
    WHERE vb.id = p_bill_id AND vb.deleted_at IS NULL;

    SELECT COALESCE(jsonb_agg(to_jsonb(l) ORDER BY l.created_at), '[]'::jsonb) INTO v_lines
    FROM public.vendor_bill_lines l WHERE l.vendor_bill_id = p_bill_id;

    SELECT COALESCE(jsonb_agg(to_jsonb(pm) ORDER BY pm.payment_date DESC), '[]'::jsonb) INTO v_pays
    FROM public.payments pm WHERE pm.vendor_bill_id = p_bill_id;

    SELECT COALESCE(jsonb_agg(to_jsonb(rr) ORDER BY rr.release_date DESC), '[]'::jsonb) INTO v_ret
    FROM public.retention_releases rr WHERE rr.vendor_bill_id = p_bill_id;
  ELSE
    SELECT to_jsonb(sb) || jsonb_build_object(
             'vendor_name',   COALESCE(v.display_name, v.legal_name),
             'vendor_gst',    v.gst_number,
             'work_order_number', wo.work_order_number,
             'work_order_id',     wo.id,
             'wo_total_amount',   wo.total_amount,
             'wo_billed_to_date', wo.billed_to_date,
             'allocation_name',   ba.allocation_name,
             'category_name',     bc.category_name,
             'master_budget_item', mbi.item_description,
             'qc_status',         qc.status)
      INTO v_header
    FROM public.service_bills sb
    LEFT JOIN public.vendors             v   ON v.id  = sb.vendor_id
    LEFT JOIN public.work_orders         wo  ON wo.id = sb.work_order_id
    LEFT JOIN public.budget_allocations  ba  ON ba.id = COALESCE(wo.budget_allocation_id, sb.budget_allocation_id)
    LEFT JOIN public.budget_categories   bc  ON bc.id = ba.category_id
    LEFT JOIN public.master_budget_items mbi ON mbi.id = COALESCE(sb.master_budget_item_id, wo.master_budget_item_id)
    LEFT JOIN public.qc_inspections      qc  ON qc.id = sb.qc_inspection_id
    WHERE sb.id = p_bill_id AND sb.deleted_at IS NULL;

    SELECT COALESCE(jsonb_agg(to_jsonb(l) ORDER BY l.created_at), '[]'::jsonb) INTO v_lines
    FROM public.service_bill_lines l WHERE l.service_bill_id = p_bill_id;

    SELECT COALESCE(jsonb_agg(to_jsonb(pm) ORDER BY pm.payment_date DESC), '[]'::jsonb) INTO v_pays
    FROM public.payments pm WHERE pm.service_bill_id = p_bill_id;

    SELECT COALESCE(jsonb_agg(to_jsonb(rr) ORDER BY rr.release_date DESC), '[]'::jsonb) INTO v_ret
    FROM public.retention_releases rr WHERE rr.service_bill_id = p_bill_id;
  END IF;

  IF v_header IS NULL THEN
    RETURN NULL;
  END IF;

  -- The drill-through that makes the ledger trustable: the actual budget_ledger
  -- rows this bill posted, reversals included.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', bl.id, 'transaction_type', bl.transaction_type,
           'amount', bl.amount, 'gross_amount', bl.gross_amount,
           'retention_amount', bl.retention_amount,
           'description', bl.description, 'posted_at', bl.posted_at,
           'document_date', bl.document_date, 'revision_seq', bl.revision_seq,
           'is_reversal', bl.reverses_ledger_id IS NOT NULL,
           'allocation_name', ba.allocation_name
         ) ORDER BY bl.transaction_type, bl.revision_seq), '[]'::jsonb)
    INTO v_ledger
  FROM public.budget_ledger bl
  LEFT JOIN public.budget_allocations ba ON ba.id = bl.budget_allocation_id
  WHERE bl.source_table = CASE WHEN p_bill_source = 'material' THEN 'vendor_bills' ELSE 'service_bills' END
    AND bl.source_id = p_bill_id;

  SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC), '[]'::jsonb) INTO v_files
  FROM public.entity_attachments a
  WHERE a.entity_table = CASE WHEN p_bill_source = 'material' THEN 'vendor_bills' ELSE 'service_bills' END
    AND a.entity_id = p_bill_id
    AND a.deleted_at IS NULL;

  RETURN jsonb_build_object(
    'billSource', p_bill_source,
    'header',     v_header,
    'lines',      v_lines,
    'ledger',     v_ledger,
    'payments',   v_pays,
    'retentionReleases', v_ret,
    'attachments', v_files
  );
END $$;

GRANT EXECUTE ON FUNCTION public.rpc_bill_detail(text, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.rpc_bill_detail(text, uuid) FROM anon;

-- ----------------------------------------------------------------------------
-- 6. VERIFICATION
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  v_problems text[] := ARRAY[]::text[];
BEGIN
  IF to_regclass('public.budget_bill_ledger_mv') IS NULL THEN
    v_problems := array_append(v_problems, 'budget_bill_ledger_mv missing');
  END IF;
  IF to_regclass('public.budget_bill_ledger_view') IS NULL THEN
    v_problems := array_append(v_problems, 'budget_bill_ledger_view compatibility view missing');
  END IF;
  IF to_regclass('public.retention_releases') IS NULL THEN
    v_problems := array_append(v_problems, 'retention_releases missing');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'uq_bill_ledger_mv_id') THEN
    v_problems := array_append(v_problems,
      'uq_bill_ledger_mv_id missing - REFRESH CONCURRENTLY will not work');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_bill_ledger_mv_search') THEN
    v_problems := array_append(v_problems, 'GIN search index missing');
  END IF;

  IF array_length(v_problems, 1) > 0 THEN
    RAISE EXCEPTION 'Unified bill ledger incomplete: %', array_to_string(v_problems, '; ');
  END IF;

  RAISE NOTICE 'Phase 4 applied: unified bill ledger (material + service), keyset RPCs, retention release document.';
END $$;

COMMIT;

-- ============================================================================
-- Populate the materialized view. Outside the transaction: the CREATE above
-- builds it WITH DATA already, but this makes the state row and the row count
-- honest, and proves REFRESH CONCURRENTLY works before anything depends on it.
-- ============================================================================

SELECT public.rpc_refresh_bill_ledger(0);

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
