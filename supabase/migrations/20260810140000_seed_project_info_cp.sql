-- Seed Project info CP data into public.projects table

-- 1. Ensure all required columns exist if not already created
ALTER TABLE public.projects 
  ADD COLUMN IF NOT EXISTS company_code VARCHAR(50),
  ADD COLUMN IF NOT EXISTS company_status VARCHAR(50),
  ADD COLUMN IF NOT EXISTS gstin_no VARCHAR(50),
  ADD COLUMN IF NOT EXISTS gst_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS currency VARCHAR(10),
  ADD COLUMN IF NOT EXISTS hidden_to_other_depts BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS project_address TEXT,
  ADD COLUMN IF NOT EXISTS communication_address TEXT,
  ADD COLUMN IF NOT EXISTS registered_address TEXT,
  ADD COLUMN IF NOT EXISTS city VARCHAR(100),
  ADD COLUMN IF NOT EXISTS state VARCHAR(100),
  ADD COLUMN IF NOT EXISTS country VARCHAR(100),
  ADD COLUMN IF NOT EXISTS pincode VARCHAR(20),
  ADD COLUMN IF NOT EXISTS area_sqft NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS levels_definition TEXT,
  ADD COLUMN IF NOT EXISTS sub_project_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS sub_project_start_date DATE,
  ADD COLUMN IF NOT EXISTS sub_project_end_date DATE,
  ADD COLUMN IF NOT EXISTS sub_project_days INT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 2. Safely Update or Insert Pramukh Central Park data
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.projects WHERE name ILIKE '%Pramukh Central Park%' OR code = 'CP-001') THEN
    UPDATE public.projects SET
      code = 'CP-001',
      client_name = 'STELLAR SKY PROJECTS LLP',
      company_code = 'SSPL',
      company_status = 'PVT/LLP/LTD',
      communication_address = '10TH, OFFICE NO 1001, Orbit 2, VESU CANAL ROAD, Vesu, Surat, Surat, Gujarat, 395007',
      registered_address = '10TH, OFFICE NO 1001, Orbit 2, VESU CANAL ROAD, Vesu, Surat, Surat, Gujarat, 395007',
      gstin_no = '24AFBFS9249F1ZU',
      gst_type = 'Registered',
      currency = 'INR',
      hidden_to_other_depts = FALSE,
      project_address = 'Pramukh Central Park, Galaxy Circle, Green City Rd, Opposite SMC Party Plot, Adajan Gam, Adajan',
      location = 'Adajan',
      city = 'Surat',
      state = 'Gujarat',
      country = 'India',
      pincode = '395009',
      area_sqft = 615000.00,
      start_date = '2024-03-01',
      target_end_date = '2027-12-01',
      levels_definition = 'Base/BM/GR/1S/2S/3S/4S/5S/6S/7S/8S/9S/10S/11S/12S/TS/ALL',
      sub_project_name = 'Pramukh Central Park',
      sub_project_start_date = '2023-06-01'
    WHERE name ILIKE '%Pramukh Central Park%' OR code = 'CP-001';
  ELSE
    INSERT INTO public.projects (
      name, code, client_name, company_code, company_status,
      communication_address, registered_address, gstin_no, gst_type,
      currency, hidden_to_other_depts, project_address, location,
      city, state, country, pincode, area_sqft, start_date,
      target_end_date, levels_definition, sub_project_name, sub_project_start_date
    ) VALUES (
      'Pramukh Central Park', 'CP-001', 'STELLAR SKY PROJECTS LLP', 'SSPL', 'PVT/LLP/LTD',
      '10TH, OFFICE NO 1001, Orbit 2, VESU CANAL ROAD, Vesu, Surat, Surat, Gujarat, 395007',
      '10TH, OFFICE NO 1001, Orbit 2, VESU CANAL ROAD, Vesu, Surat, Surat, Gujarat, 395007',
      '24AFBFS9249F1ZU', 'Registered', 'INR', FALSE,
      'Pramukh Central Park, Galaxy Circle, Green City Rd, Opposite SMC Party Plot, Adajan Gam, Adajan',
      'Adajan', 'Surat', 'Gujarat', 'India', '395009', 615000.00, '2024-03-01',
      '2027-12-01', 'Base/BM/GR/1S/2S/3S/4S/5S/6S/7S/8S/9S/10S/11S/12S/TS/ALL', 'Pramukh Central Park', '2023-06-01'
    );
  END IF;
END $$;
