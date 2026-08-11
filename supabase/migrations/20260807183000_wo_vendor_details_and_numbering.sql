-- 1. Add customizable billing details to work_orders
ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS billing_address text,
  ADD COLUMN IF NOT EXISTS gst_number text;

-- 2. Create function to generate sequential Work Order Numbers
CREATE OR REPLACE FUNCTION public.fn_generate_work_order_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proj_code text;
  v_year_suffix text;
  v_sequence_prefix text;
  v_next_val bigint;
BEGIN
  -- Only generate if work_order_number is not explicitly provided or is [AUTO-GENERATED]
  IF NEW.work_order_number IS NULL OR NEW.work_order_number = '' OR NEW.work_order_number = '[AUTO-GENERATED]' THEN
    -- Get project code (fallback to first 2 letters of project name in uppercase)
    SELECT COALESCE(NULLIF(TRIM(code), ''), UPPER(SUBSTRING(name FROM 1 FOR 2)))
    INTO v_proj_code
    FROM public.projects
    WHERE id = NEW.project_id;

    IF v_proj_code IS NULL THEN
      v_proj_code := 'WO';
    END IF;

    -- Format year suffix (e.g. '26' for calendar year 2026)
    v_year_suffix := TO_CHAR(COALESCE(NEW.issue_date, CURRENT_DATE), 'YY');

    -- Sequence prefix specific to project and year: e.g. "AC/WO/26"
    v_sequence_prefix := format('%s/WO/%s', UPPER(v_proj_code), v_year_suffix);

    -- Increment and fetch last sequence value atomically
    INSERT INTO public.document_number_sequences (prefix, period, last_value, updated_at)
    VALUES (v_sequence_prefix, 'GLOBAL', 1, NOW())
    ON CONFLICT (prefix, period) DO UPDATE
      SET last_value = public.document_number_sequences.last_value + 1,
          updated_at = NOW()
    RETURNING last_value INTO v_next_val;

    -- Format final output: e.g. "AC/WO/26/001"
    NEW.work_order_number := format('%s/%s', v_sequence_prefix, LPAD(v_next_val::text, 3, '0'));
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Bind BEFORE INSERT trigger to work_orders
DROP TRIGGER IF EXISTS trg_generate_work_order_number ON public.work_orders;
CREATE TRIGGER trg_generate_work_order_number
  BEFORE INSERT ON public.work_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_generate_work_order_number();
