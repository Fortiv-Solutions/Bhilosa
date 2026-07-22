-- Add missing legacy columns to the projects table
ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS client_name TEXT,
ADD COLUMN IF NOT EXISTS location TEXT,
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS project_value NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS budget_amount NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS actual_spend_amount NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS start_date TEXT,
ADD COLUMN IF NOT EXISTS target_end_date TEXT,
ADD COLUMN IF NOT EXISTS current_phase TEXT,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Add missing columns to project_members table
ALTER TABLE public.project_members
ADD COLUMN IF NOT EXISTS project_role TEXT DEFAULT 'member',
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Create legacy messages table
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT,
  sender_name TEXT,
  sender_role TEXT,
  message TEXT,
  timestamp TIMESTAMPTZ DEFAULT now(),
  attachments TEXT[]
);

-- Create legacy tasks table
CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT,
  name TEXT,
  start_date TEXT,
  end_date TEXT,
  progress NUMERIC DEFAULT 0,
  dependencies TEXT,
  is_critical_path BOOLEAN DEFAULT false
);

-- Create legacy materials table
CREATE TABLE IF NOT EXISTS public.materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT,
  item_name TEXT,
  category TEXT,
  quantity NUMERIC DEFAULT 0,
  unit TEXT,
  reorder_level NUMERIC DEFAULT 0,
  stock_value NUMERIC DEFAULT 0,
  supplier_name TEXT
);

-- Create legacy material_transactions table
CREATE TABLE IF NOT EXISTS public.material_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id TEXT,
  type TEXT,
  quantity NUMERIC DEFAULT 0,
  date TIMESTAMPTZ DEFAULT now(),
  cost NUMERIC DEFAULT 0,
  reference_no TEXT
);

-- Create legacy vendors table (if missing)
CREATE TABLE IF NOT EXISTS public.vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE,
  gst_number TEXT,
  legal_name TEXT,
  display_name TEXT,
  pan_number TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  category TEXT,
  rating NUMERIC DEFAULT 0
);

-- Create legacy vendor_performances table
CREATE TABLE IF NOT EXISTS public.vendor_performances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id TEXT,
  project_id TEXT,
  delivery_score NUMERIC DEFAULT 100,
  quality_score NUMERIC DEFAULT 100,
  price_score NUMERIC DEFAULT 100,
  response_score NUMERIC DEFAULT 100,
  feedback TEXT,
  evaluation_date TIMESTAMPTZ DEFAULT now()
);
