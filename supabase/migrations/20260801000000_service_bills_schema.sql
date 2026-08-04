-- ============================================================================
-- Service Bills: contractor/vendor bills raised against a Work Order,
-- tracked separately from material vendor bills (see vendor_bills / Billing).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.service_bills (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id),
  work_order_id uuid REFERENCES public.work_orders(id),
  vendor_id uuid REFERENCES public.vendors(id),

  bill_number text NOT NULL,
  bill_date date NOT NULL DEFAULT CURRENT_DATE,
  service_description text,

  subtotal_amount numeric NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,

  status text NOT NULL DEFAULT 'draft', -- draft | submitted | verified | approved | rejected | paid
  payment_status text NOT NULL DEFAULT 'pending', -- pending | partially_paid | paid
  remarks text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_bills_project ON public.service_bills(project_id);
CREATE INDEX IF NOT EXISTS idx_service_bills_work_order ON public.service_bills(work_order_id);
CREATE INDEX IF NOT EXISTS idx_service_bills_vendor ON public.service_bills(vendor_id);

ALTER TABLE public.service_bills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_bills_select ON public.service_bills;
CREATE POLICY service_bills_select
  ON public.service_bills FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS service_bills_insert ON public.service_bills;
CREATE POLICY service_bills_insert
  ON public.service_bills FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS service_bills_update ON public.service_bills;
CREATE POLICY service_bills_update
  ON public.service_bills FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
