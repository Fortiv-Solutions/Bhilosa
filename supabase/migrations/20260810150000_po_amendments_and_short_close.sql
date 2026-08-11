-- ============================================================================
-- Migration: PO Amendments and Complete PO Short-Closure Framework
-- Date: 2026-08-10
-- Purpose: Introduces purchase_order_amendments, purchase_order_revisions,
--          PO short-close procedure, amendment workflow, and budget recalculation.
-- ============================================================================

-- 1. Create purchase_order_amendments table
CREATE TABLE IF NOT EXISTS public.purchase_order_amendments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
    revision_number INT NOT NULL DEFAULT 1,
    amendment_type TEXT NOT NULL CHECK (amendment_type IN ('rate_change', 'qty_change', 'line_addition', 'terms_change', 'short_close')),
    reason TEXT NOT NULL,
    changes_diff JSONB NOT NULL,
    requested_by UUID REFERENCES auth.users(id),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
    reviewed_by UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMPTZ,
    review_remarks TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookup by PO and status
CREATE INDEX IF NOT EXISTS idx_po_amendments_po_id ON public.purchase_order_amendments(purchase_order_id, status);

-- 2. Create purchase_order_revisions table for immutable audit snapshots
CREATE TABLE IF NOT EXISTS public.purchase_order_revisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
    revision_number INT NOT NULL,
    header_snapshot JSONB NOT NULL,
    lines_snapshot JSONB NOT NULL,
    amendment_id UUID REFERENCES public.purchase_order_amendments(id),
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_po_revision UNIQUE (purchase_order_id, revision_number)
);

-- 3. Add columns to purchase_orders & purchase_order_lines if not existing
ALTER TABLE public.purchase_orders 
    ADD COLUMN IF NOT EXISTS revision_number INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS is_amendment_pending BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS short_close_reason TEXT;

ALTER TABLE public.purchase_order_lines
    ADD COLUMN IF NOT EXISTS is_short_closed BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS short_closed_reason TEXT;

-- Enable RLS on new tables
ALTER TABLE public.purchase_order_amendments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_revisions ENABLE ROW LEVEL SECURITY;

-- Permissive policies for authenticated users
CREATE POLICY po_amendments_auth_select ON public.purchase_order_amendments FOR SELECT TO authenticated USING (true);
CREATE POLICY po_amendments_auth_insert ON public.purchase_order_amendments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY po_amendments_auth_update ON public.purchase_order_amendments FOR UPDATE TO authenticated USING (true);

CREATE POLICY po_revisions_auth_select ON public.purchase_order_revisions FOR SELECT TO authenticated USING (true);
CREATE POLICY po_revisions_auth_insert ON public.purchase_order_revisions FOR INSERT TO authenticated WITH CHECK (true);

-- Anonymous policies for local/dev read
CREATE POLICY po_amendments_anon_select ON public.purchase_order_amendments FOR SELECT TO anon USING (true);
CREATE POLICY po_revisions_anon_select ON public.purchase_order_revisions FOR SELECT TO anon USING (true);


-- 4. Function to short-close an ENTIRE Purchase Order
CREATE OR REPLACE FUNCTION public.short_close_entire_purchase_order(
    p_po_id UUID,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_profile UUID := public.app_require_profile();
    v_po RECORD;
    v_new_status TEXT;
    v_lines_updated INT := 0;
BEGIN
    IF NOT public.app_can_approve() THEN
        RAISE EXCEPTION 'Only management or a project manager may short-close a purchase order.'
            USING ERRCODE = '42501';
    END IF;

    IF coalesce(trim(p_reason), '') = '' THEN
        RAISE EXCEPTION 'A valid reason is required to short-close a purchase order.'
            USING ERRCODE = '22023';
    END IF;

    SELECT id, po_number, status INTO v_po
    FROM public.purchase_orders
    WHERE id = p_po_id AND deleted_at IS NULL;

    IF v_po.id IS NULL THEN
        RAISE EXCEPTION 'Purchase Order % not found.', p_po_id USING ERRCODE = 'P0002';
    END IF;

    -- Short-close all unfulfilled/open lines
    UPDATE public.purchase_order_lines
    SET is_short_closed = true,
        short_closed_reason = trim(p_reason),
        updated_by = v_profile
    WHERE purchase_order_id = p_po_id AND is_short_closed = false;
    
    GET DIAGNOSTICS v_lines_updated = ROW_COUNT;

    -- Store header short close reason
    UPDATE public.purchase_orders
    SET short_close_reason = trim(p_reason)
    WHERE id = p_po_id;

    -- Refresh receipt status to transition status to 'short_closed' or 'closed'
    v_new_status := public.refresh_purchase_order_receipt_status(p_po_id);

    -- Log amendment history for audit trail
    INSERT INTO public.purchase_order_amendments (
        purchase_order_id,
        revision_number,
        amendment_type,
        reason,
        changes_diff,
        requested_by,
        status,
        reviewed_by,
        reviewed_at
    ) VALUES (
        p_po_id,
        0,
        'short_close',
        trim(p_reason),
        jsonb_build_object('action', 'short_close_entire_po', 'lines_closed', v_lines_updated),
        v_profile,
        'approved',
        v_profile,
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'purchaseOrderId', p_po_id,
        'poNumber', v_po.po_number,
        'linesClosed', v_lines_updated,
        'newStatus', v_new_status
    );
END;
$$;


-- 5. Function to submit a PO Amendment request
CREATE OR REPLACE FUNCTION public.submit_po_amendment(
    p_po_id UUID,
    p_amendment_type TEXT,
    p_reason TEXT,
    p_diff JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_profile UUID := public.app_require_profile();
    v_po RECORD;
    v_amendment_id UUID;
    v_current_rev INT;
BEGIN
    IF coalesce(trim(p_reason), '') = '' THEN
        RAISE EXCEPTION 'A reason is required to submit a PO amendment.'
            USING ERRCODE = '22023';
    END IF;

    SELECT id, po_number, status, revision_number, is_amendment_pending
    INTO v_po
    FROM public.purchase_orders
    WHERE id = p_po_id AND deleted_at IS NULL;

    IF v_po.id IS NULL THEN
        RAISE EXCEPTION 'Purchase Order not found.' USING ERRCODE = 'P0002';
    END IF;

    IF v_po.is_amendment_pending THEN
        RAISE EXCEPTION 'A pending amendment already exists for PO %. Complete or reject it first.', v_po.po_number
            USING ERRCODE = '55000';
    END IF;

    v_current_rev := coalesce(v_po.revision_number, 0);

    INSERT INTO public.purchase_order_amendments (
        purchase_order_id,
        revision_number,
        amendment_type,
        reason,
        changes_diff,
        requested_by,
        status
    ) VALUES (
        p_po_id,
        v_current_rev + 1,
        p_amendment_type,
        trim(p_reason),
        p_diff,
        v_profile,
        'pending'
    )
    RETURNING id INTO v_amendment_id;

    UPDATE public.purchase_orders
    SET is_amendment_pending = true
    WHERE id = p_po_id;

    RETURN jsonb_build_object(
        'success', true,
        'amendmentId', v_amendment_id,
        'revisionNumber', v_current_rev + 1
    );
END;
$$;


-- 6. Function to approve a PO Amendment
CREATE OR REPLACE FUNCTION public.approve_po_amendment(
    p_amendment_id UUID,
    p_remarks TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_profile UUID := public.app_require_profile();
    v_amendment RECORD;
    v_po RECORD;
    v_header_snap JSONB;
    v_lines_snap JSONB;
    v_line_item JSONB;
    v_line_id UUID;
    v_new_rate NUMERIC;
    v_new_qty NUMERIC;
BEGIN
    IF NOT public.app_can_approve() THEN
        RAISE EXCEPTION 'Only management or a project manager may approve PO amendments.'
            USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_amendment
    FROM public.purchase_order_amendments
    WHERE id = p_amendment_id FOR UPDATE;

    IF v_amendment.id IS NULL THEN
        RAISE EXCEPTION 'Amendment % not found.', p_amendment_id USING ERRCODE = 'P0002';
    END IF;

    IF v_amendment.status != 'pending' THEN
        RAISE EXCEPTION 'Amendment is already %.', v_amendment.status USING ERRCODE = '55000';
    END IF;

    SELECT * INTO v_po
    FROM public.purchase_orders
    WHERE id = v_amendment.purchase_order_id FOR UPDATE;

    -- Snapshot current header & lines before applying revision
    SELECT to_jsonb(v_po) INTO v_header_snap;
    
    SELECT jsonb_agg(to_jsonb(l)) INTO v_lines_snap
    FROM public.purchase_order_lines l
    WHERE l.purchase_order_id = v_po.id;

    -- Save revision snapshot
    INSERT INTO public.purchase_order_revisions (
        purchase_order_id,
        revision_number,
        header_snapshot,
        lines_snapshot,
        amendment_id,
        created_by
    ) VALUES (
        v_po.id,
        v_po.revision_number,
        v_header_snap,
        coalesce(v_lines_snap, '[]'::jsonb),
        p_amendment_id,
        v_profile
    )
    ON CONFLICT (purchase_order_id, revision_number) DO NOTHING;

    -- Apply rate/qty line diffs if provided
    IF jsonb_typeof(v_amendment.changes_diff->'lines') = 'array' THEN
        FOR v_line_item IN SELECT * FROM jsonb_array_elements(v_amendment.changes_diff->'lines')
        LOOP
            v_line_id := (v_line_item->>'id')::uuid;
            v_new_rate := (v_line_item->>'unit_rate')::numeric;
            v_new_qty := (v_line_item->>'quantity')::numeric;

            UPDATE public.purchase_order_lines
            SET unit_rate = coalesce(v_new_rate, unit_rate),
                quantity = coalesce(v_new_qty, quantity),
                updated_by = v_profile
            WHERE id = v_line_id AND purchase_order_id = v_po.id;
        END LOOP;
    END IF;

    -- Update PO header revision counter & clear pending flag
    UPDATE public.purchase_orders
    SET revision_number = v_po.revision_number + 1,
        is_amendment_pending = false,
        updated_at = NOW()
    WHERE id = v_po.id;

    -- Recalculate totals
    PERFORM public.po_recalculate_header(v_po.id);

    -- Mark amendment approved
    UPDATE public.purchase_order_amendments
    SET status = 'approved',
        reviewed_by = v_profile,
        reviewed_at = NOW(),
        review_remarks = trim(p_remarks)
    WHERE id = p_amendment_id;

    RETURN jsonb_build_object(
        'success', true,
        'purchaseOrderId', v_po.id,
        'newRevisionNumber', v_po.revision_number + 1
    );
END;
$$;


-- 7. Function to reject a PO Amendment
CREATE OR REPLACE FUNCTION public.reject_po_amendment(
    p_amendment_id UUID,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_profile UUID := public.app_require_profile();
    v_amendment RECORD;
BEGIN
    IF NOT public.app_can_approve() THEN
        RAISE EXCEPTION 'Only management or a project manager may reject PO amendments.'
            USING ERRCODE = '42501';
    END IF;

    IF coalesce(trim(p_reason), '') = '' THEN
        RAISE EXCEPTION 'A reason is required to reject a PO amendment.'
            USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_amendment
    FROM public.purchase_order_amendments
    WHERE id = p_amendment_id FOR UPDATE;

    IF v_amendment.id IS NULL THEN
        RAISE EXCEPTION 'Amendment % not found.', p_amendment_id USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.purchase_order_amendments
    SET status = 'rejected',
        reviewed_by = v_profile,
        reviewed_at = NOW(),
        review_remarks = trim(p_reason)
    WHERE id = p_amendment_id;

    UPDATE public.purchase_orders
    SET is_amendment_pending = false
    WHERE id = v_amendment.purchase_order_id;

    RETURN jsonb_build_object('success', true);
END;
$$;
