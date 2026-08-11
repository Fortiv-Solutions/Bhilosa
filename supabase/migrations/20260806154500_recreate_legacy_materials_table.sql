-- Recreate legacy materials table with columns expected by the mobile application
CREATE TABLE IF NOT EXISTS public.materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT,
  item_name TEXT,
  category TEXT DEFAULT 'General',
  quantity NUMERIC DEFAULT 0,
  unit TEXT,
  reorder_level NUMERIC DEFAULT 0,
  stock_value NUMERIC DEFAULT 0,
  supplier_name TEXT,
  status TEXT DEFAULT 'in-stock',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Grant permissions to public roles for mobile sync compatibility
GRANT ALL ON TABLE public.materials TO postgres, anon, authenticated, service_role;

-- Disable RLS on legacy materials table to allow easy mobile client operations
ALTER TABLE public.materials DISABLE ROW LEVEL SECURITY;
