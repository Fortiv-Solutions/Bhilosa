-- ============================================================================
-- QUALITY (QC) MODULE — SCHEMA EXTENSION
-- ----------------------------------------------------------------------------
-- Source: "QC - Pragati / Inspection_Reports.xlsx" (Studio 13 Management
-- Consultants / Studio 13 Architects & Planners inspection formats), digitized
-- for the Projects > Quality module.
--
-- The QC checklist backbone (qc_checklist_templates, qc_checklist_template_items,
-- qc_inspections, qc_inspection_items) already exists in earlier migrations.
-- This migration only ADDS the columns/tables that backbone was missing to
-- represent the 8 inspection-checklist formats in the workbook, plus a new
-- Cube Strength Test log which has no prior equivalent. All ALTERs are
-- additive/nullable — nothing here changes existing row shapes or behavior.
--
-- Result / acceptance status reuses the existing public.erp_qc_status enum
-- (pending | accepted | partially_accepted | rejected) on qc_inspections.status
-- — this maps 1:1 to the workbook's "Accepted / Conditional Acceptance /
-- Rejected" result block, so no new enum is introduced.
-- Photo/document evidence reuses the existing public.entity_attachments
-- table (entity_table = 'qc_inspections' or 'qc_inspection_items') — no new
-- attachments table is introduced.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. qc_checklist_template_items — add section grouping + optional measurement
--    prompt (e.g. "Site Dimension -", "Length -", "No. of Supports -" as seen
--    printed inline in the workbook's Comments column for specific parameters).
-- ----------------------------------------------------------------------------
ALTER TABLE public.qc_checklist_template_items
  ADD COLUMN IF NOT EXISTS section text NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS measurement_label text;

ALTER TABLE public.qc_checklist_template_items
  DROP CONSTRAINT IF EXISTS qc_checklist_template_items_template_section_seq_key;
ALTER TABLE public.qc_checklist_template_items
  ADD CONSTRAINT qc_checklist_template_items_template_section_seq_key
  UNIQUE (template_id, section, sequence_no);

COMMENT ON COLUMN public.qc_checklist_template_items.section IS
  'Groups items within a template, e.g. before_casting / after_casting / before_plastering / after_plastering / general (single-section templates).';
COMMENT ON COLUMN public.qc_checklist_template_items.measurement_label IS
  'Optional label for a free-text measurement the inspector must record alongside the OK/Not-OK result (e.g. "Site Dimension", "Length", "No. of Supports").';

-- ----------------------------------------------------------------------------
-- 2. qc_inspections — add the header fields every workbook format captures
--    that the existing header (project/site/activity/grn/template/number/
--    date/status/remarks/rework/approved_by) does not yet have.
-- ----------------------------------------------------------------------------
ALTER TABLE public.qc_inspections
  ADD COLUMN IF NOT EXISTS tower text,
  ADD COLUMN IF NOT EXISTS floor_level text,
  ADD COLUMN IF NOT EXISTS unit_no text,
  ADD COLUMN IF NOT EXISTS reference_no text,
  ADD COLUMN IF NOT EXISTS planned_date date,
  ADD COLUMN IF NOT EXISTS casting_date date,
  ADD COLUMN IF NOT EXISTS concrete_mix_ratio text,
  ADD COLUMN IF NOT EXISTS slump_test_mm numeric,
  ADD COLUMN IF NOT EXISTS problem_identification text,
  ADD COLUMN IF NOT EXISTS corrective_measures text,
  ADD COLUMN IF NOT EXISTS primary_responsibility text,
  ADD COLUMN IF NOT EXISTS secondary_responsibility text,
  ADD COLUMN IF NOT EXISTS condition_notes text,
  ADD COLUMN IF NOT EXISTS inspected_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS inspected_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

COMMENT ON COLUMN public.qc_inspections.reference_no IS
  'Free-text location reference not covered by tower/floor_level/unit_no, e.g. "Column No. C-12" or "Wing A / Shop 4".';
COMMENT ON COLUMN public.qc_inspections.status IS
  'Reused as the workbook''s Result field: pending (in progress) / accepted / partially_accepted (Conditional Acceptance) / rejected.';
COMMENT ON COLUMN public.qc_inspections.condition_notes IS
  'Free text for "Condition for Acceptance", populated when status = partially_accepted.';
COMMENT ON COLUMN public.qc_inspections.approved_by IS
  'Reused as the workbook''s "Accepted By" sign-off (paired with inspected_by = "Inspected By" and verified_by = "Verified By").';

CREATE INDEX IF NOT EXISTS idx_qc_inspections_tower_floor ON public.qc_inspections(project_id, tower, floor_level);

-- ----------------------------------------------------------------------------
-- 3. qc_inspection_items — link responses back to the template item they were
--    copied from (nullable, so ad-hoc items added on-site still work), and add
--    ordering, section, and the paired measurement label/value.
-- ----------------------------------------------------------------------------
ALTER TABLE public.qc_inspection_items
  ADD COLUMN IF NOT EXISTS template_item_id uuid REFERENCES public.qc_checklist_template_items(id),
  ADD COLUMN IF NOT EXISTS section text,
  ADD COLUMN IF NOT EXISTS sequence_no integer,
  ADD COLUMN IF NOT EXISTS measurement_label text,
  ADD COLUMN IF NOT EXISTS measurement_value text;

CREATE INDEX IF NOT EXISTS idx_qc_inspection_items_template_item ON public.qc_inspection_items(template_item_id);

COMMENT ON COLUMN public.qc_inspection_items.result IS
  'Free text, expected values: pending | ok | not_ok | na.';

-- ----------------------------------------------------------------------------
-- 4. Cube Strength Test log — genuinely new, no existing equivalent.
--    Header = one cast batch (a "Tower / Activity" pour on a given date).
--    Results = individual cube specimens tested at 7 and 28 days (the
--    workbook shows only an Avg. column per age, implying multiple
--    specimens averaged per age — normalized here as one row per specimen).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.qc_cube_tests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  site_id uuid,
  inspection_id uuid,
  tower text,
  activity text NOT NULL,
  grade_of_concrete text NOT NULL,
  slump_mm numeric,
  weight_of_cube_kg numeric,
  date_of_casting date NOT NULL,
  curing_start_date date,
  curing_finish_date date,
  prepared_by uuid,
  site_engineer_id uuid,
  contractor_name text,
  reviewed_by uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  CONSTRAINT qc_cube_tests_pkey PRIMARY KEY (id),
  CONSTRAINT qc_cube_tests_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id),
  CONSTRAINT qc_cube_tests_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.project_sites(id),
  CONSTRAINT qc_cube_tests_inspection_id_fkey FOREIGN KEY (inspection_id) REFERENCES public.qc_inspections(id),
  CONSTRAINT qc_cube_tests_prepared_by_fkey FOREIGN KEY (prepared_by) REFERENCES public.profiles(id),
  CONSTRAINT qc_cube_tests_site_engineer_id_fkey FOREIGN KEY (site_engineer_id) REFERENCES public.profiles(id),
  CONSTRAINT qc_cube_tests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id),
  CONSTRAINT qc_cube_tests_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id),
  CONSTRAINT qc_cube_tests_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id)
);

COMMENT ON TABLE public.qc_cube_tests IS 'Cube specimen size per workbook note: 150mm x 150mm x 150mm.';
COMMENT ON COLUMN public.qc_cube_tests.activity IS 'Structural element the cubes were cast from, e.g. Footing / Column / Slab.';

CREATE TABLE IF NOT EXISTS public.qc_cube_test_results (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cube_test_id uuid NOT NULL,
  test_age_days smallint NOT NULL,
  specimen_no smallint NOT NULL DEFAULT 1,
  date_of_testing date,
  load_kn numeric,
  strength_nmm2 numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  CONSTRAINT qc_cube_test_results_pkey PRIMARY KEY (id),
  CONSTRAINT qc_cube_test_results_cube_test_id_fkey FOREIGN KEY (cube_test_id) REFERENCES public.qc_cube_tests(id) ON DELETE CASCADE,
  CONSTRAINT qc_cube_test_results_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id),
  CONSTRAINT qc_cube_test_results_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id),
  CONSTRAINT qc_cube_test_results_age_check CHECK (test_age_days IN (7, 28)),
  CONSTRAINT qc_cube_test_results_specimen_check CHECK (specimen_no > 0),
  CONSTRAINT qc_cube_test_results_unique_specimen UNIQUE (cube_test_id, test_age_days, specimen_no)
);

CREATE INDEX IF NOT EXISTS idx_qc_cube_test_results_cube_test ON public.qc_cube_test_results(cube_test_id);
CREATE INDEX IF NOT EXISTS idx_qc_cube_tests_project ON public.qc_cube_tests(project_id);

-- Convenience read model matching the workbook's "7 Days Avg. / 28 Days Avg." columns.
CREATE OR REPLACE VIEW public.qc_cube_test_summary AS
SELECT
  ct.id AS cube_test_id,
  ct.project_id,
  ct.tower,
  ct.activity,
  ct.grade_of_concrete,
  ct.date_of_casting,
  avg(r.strength_nmm2) FILTER (WHERE r.test_age_days = 7)  AS avg_strength_7day_nmm2,
  avg(r.strength_nmm2) FILTER (WHERE r.test_age_days = 28) AS avg_strength_28day_nmm2,
  count(*) FILTER (WHERE r.test_age_days = 7)  AS specimen_count_7day,
  count(*) FILTER (WHERE r.test_age_days = 28) AS specimen_count_28day
FROM public.qc_cube_tests ct
LEFT JOIN public.qc_cube_test_results r ON r.cube_test_id = ct.id
GROUP BY ct.id;

-- ----------------------------------------------------------------------------
-- 5. RLS + updated_at triggers for the new tables (matches existing
--    p_<table>_all / trg_<table>_updated_at convention).
-- ----------------------------------------------------------------------------
ALTER TABLE public.qc_cube_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qc_cube_test_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_qc_cube_tests_all ON public.qc_cube_tests;
CREATE POLICY p_qc_cube_tests_all ON public.qc_cube_tests
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS p_qc_cube_test_results_all ON public.qc_cube_test_results;
CREATE POLICY p_qc_cube_test_results_all ON public.qc_cube_test_results
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

DROP TRIGGER IF EXISTS trg_qc_cube_tests_updated_at ON public.qc_cube_tests;
CREATE TRIGGER trg_qc_cube_tests_updated_at BEFORE UPDATE ON public.qc_cube_tests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_qc_cube_test_results_updated_at ON public.qc_cube_test_results;
CREATE TRIGGER trg_qc_cube_test_results_updated_at BEFORE UPDATE ON public.qc_cube_test_results
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 6. SEED DATA — the 8 checklist templates + their items, digitized verbatim
--    from Inspection_Reports.xlsx. organization_id left NULL (global
--    templates), matching how projects/project_sites/profiles are seeded
--    in this environment (20260727000000_seed_projects.sql).
-- ============================================================================

INSERT INTO public.qc_checklist_templates (id, name, category, version, is_active) VALUES
  ('a1000000-0000-4000-8000-000000000001', 'RCC Footing Inspection',   'structural', '1.0.0', true),
  ('a1000000-0000-4000-8000-000000000002', 'RCC Column Inspection',    'structural', '1.0.0', true),
  ('a1000000-0000-4000-8000-000000000003', 'RCC Slab Inspection',      'structural', '1.0.0', true),
  ('a1000000-0000-4000-8000-000000000004', 'Masonry Inspection',       'masonry',    '1.0.0', true),
  ('a1000000-0000-4000-8000-000000000005', 'Internal Plaster Inspection', 'finishing', '1.0.0', true),
  ('a1000000-0000-4000-8000-000000000006', 'Granite/Marble Inspection',   'finishing', '1.0.0', true),
  ('a1000000-0000-4000-8000-000000000007', 'Flooring Inspection',         'finishing', '1.0.0', true),
  ('a1000000-0000-4000-8000-000000000008', 'Wall Tiling Inspection',      'finishing', '1.0.0', true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, category = EXCLUDED.category, version = EXCLUDED.version, is_active = EXCLUDED.is_active;

-- 6a. RCC Footing
INSERT INTO public.qc_checklist_template_items (template_id, section, sequence_no, description, measurement_label) VALUES
  ('a1000000-0000-4000-8000-000000000001', 'before_casting', 1, 'Line Out of Footing as per Centerline', NULL),
  ('a1000000-0000-4000-8000-000000000001', 'before_casting', 2, 'Length of Footing', 'Site Dimension'),
  ('a1000000-0000-4000-8000-000000000001', 'before_casting', 3, 'Width of Footing', 'Length'),
  ('a1000000-0000-4000-8000-000000000001', 'before_casting', 4, 'Height of Footing - Marking to be checked', NULL),
  ('a1000000-0000-4000-8000-000000000001', 'before_casting', 5, 'Diagonal Dimensions', 'Height'),
  ('a1000000-0000-4000-8000-000000000001', 'before_casting', 6, 'Cleaning of Bottom PCC Surface', NULL),
  ('a1000000-0000-4000-8000-000000000001', 'before_casting', 7, 'Footing Steel Checking as per Drawing', 'No. of Supports'),
  ('a1000000-0000-4000-8000-000000000001', 'before_casting', 8, 'Cover placed as per Specified Sizes', NULL),
  ('a1000000-0000-4000-8000-000000000001', 'before_casting', 9, 'Formwork properly braced & Supported from all sides', NULL),
  ('a1000000-0000-4000-8000-000000000001', 'after_casting', 1, 'Date of Footing casting to be mentioned', NULL),
  ('a1000000-0000-4000-8000-000000000001', 'after_casting', 2, 'Cubes to be removed on next day of concreting and kept for curing with code number, casting date and tower name', NULL),
  ('a1000000-0000-4000-8000-000000000001', 'after_casting', 3, 'Curing of Footing to be done for min 15 days with wet Hessain cloth', NULL),
  ('a1000000-0000-4000-8000-000000000001', 'after_casting', 4, 'Finishing of honey combing if any', NULL)
ON CONFLICT (template_id, section, sequence_no) DO UPDATE SET
  description = EXCLUDED.description, measurement_label = EXCLUDED.measurement_label;

-- 6b. RCC Column
INSERT INTO public.qc_checklist_template_items (template_id, section, sequence_no, description, measurement_label) VALUES
  ('a1000000-0000-4000-8000-000000000002', 'before_casting', 1, 'Column positioning as per centerline', NULL),
  ('a1000000-0000-4000-8000-000000000002', 'before_casting', 2, 'Sizes as per drawing', 'Site Dimension'),
  ('a1000000-0000-4000-8000-000000000002', 'before_casting', 3, 'Diagonals', 'Length'),
  ('a1000000-0000-4000-8000-000000000002', 'before_casting', 4, 'Proper oiling on shuttering', NULL),
  ('a1000000-0000-4000-8000-000000000002', 'before_casting', 5, 'Plumb level', 'Height'),
  ('a1000000-0000-4000-8000-000000000002', 'before_casting', 6, 'Level marking upto which concreting to be done', NULL),
  ('a1000000-0000-4000-8000-000000000002', 'before_casting', 7, 'Form work properly braced from sides', 'No. of Supports'),
  ('a1000000-0000-4000-8000-000000000002', 'before_casting', 8, 'Cover placed as per specified sizes', NULL),
  ('a1000000-0000-4000-8000-000000000002', 'before_casting', 9, 'Reinforcement as per detail with sufficient lap length', NULL),
  ('a1000000-0000-4000-8000-000000000002', 'before_casting', 10, 'Spacing of reinforcement as per drawing', 'Distance'),
  ('a1000000-0000-4000-8000-000000000002', 'after_casting', 1, 'De shuttering of column after min. 12 hours', NULL),
  ('a1000000-0000-4000-8000-000000000002', 'after_casting', 2, 'Date of casting and column number to be mentioned on column', NULL),
  ('a1000000-0000-4000-8000-000000000002', 'after_casting', 3, 'Hacking (Tancha) on columns (50 Nos./Sqft)', NULL),
  ('a1000000-0000-4000-8000-000000000002', 'after_casting', 4, 'Cubes to be removed on next day of concreting and kept for curing with code number, casting date and tower name', NULL),
  ('a1000000-0000-4000-8000-000000000002', 'after_casting', 5, 'Curing of columns to be done for min 15 days with wet hessain cloth', NULL),
  ('a1000000-0000-4000-8000-000000000002', 'after_casting', 6, 'Finishing of honey combing if any', NULL),
  ('a1000000-0000-4000-8000-000000000002', 'after_casting', 7, 'Plumb Level', 'Deflection')
ON CONFLICT (template_id, section, sequence_no) DO UPDATE SET
  description = EXCLUDED.description, measurement_label = EXCLUDED.measurement_label;

-- 6c. RCC Slab (single section in the workbook)
INSERT INTO public.qc_checklist_template_items (template_id, section, sequence_no, description, measurement_label) VALUES
  ('a1000000-0000-4000-8000-000000000003', 'general', 1, 'Line and Level of Beam Bottom as per Drawings', NULL),
  ('a1000000-0000-4000-8000-000000000003', 'general', 2, 'Height/Level of slab from Plinth/Slab level as per Drawings', NULL),
  ('a1000000-0000-4000-8000-000000000003', 'general', 3, 'Width of Beam Bottom Plank and Top to be checked (Kanda maap to be measured)', NULL),
  ('a1000000-0000-4000-8000-000000000003', 'general', 4, 'Depth of beam as per drawing', NULL),
  ('a1000000-0000-4000-8000-000000000003', 'general', 5, 'Beam sides properly fixed in line, level and plumb in respect to bottom slab', NULL),
  ('a1000000-0000-4000-8000-000000000003', 'general', 6, 'Levels of each individual bay to be checked', NULL),
  ('a1000000-0000-4000-8000-000000000003', 'general', 7, 'Checking of bay sizes and diagonals and Out to Out dimensions of bldg', NULL),
  ('a1000000-0000-4000-8000-000000000003', 'general', 8, 'Column Reduction direction and Termination as per Drawings', NULL),
  ('a1000000-0000-4000-8000-000000000003', 'general', 9, 'Quality of shuttering material - Edges of Ply should not be broken and should not have undulations/Bending', NULL),
  ('a1000000-0000-4000-8000-000000000003', 'general', 10, 'Gaps in between 2 Ply and beam sides properly filled up (Gaabdi) and Tape applied on Joints', NULL),
  ('a1000000-0000-4000-8000-000000000003', 'general', 11, 'Slab/Beam Reinforcement Binding done as per drawings', NULL),
  ('a1000000-0000-4000-8000-000000000003', 'general', 12, 'Props supported to the beam bottom & slab should be in plumb & at every 1''-0" interval.', NULL),
  ('a1000000-0000-4000-8000-000000000003', 'general', 13, 'Packing below props should be of max 4" and that to of wooden plank only.', NULL),
  ('a1000000-0000-4000-8000-000000000003', 'general', 14, 'Beam outer sides shall be properly braced', NULL),
  ('a1000000-0000-4000-8000-000000000003', 'general', 15, 'Bracings on beam sides to be done at every 1''-6" distance', NULL),
  ('a1000000-0000-4000-8000-000000000003', 'general', 16, 'Oil properly applied on beam bottom, sides and shuttering Ply', NULL),
  ('a1000000-0000-4000-8000-000000000003', 'general', 17, 'Checking of electrical points as per electrical drawing', NULL),
  ('a1000000-0000-4000-8000-000000000003', 'general', 18, 'Check plumbing sleeve position as per drawing', NULL),
  ('a1000000-0000-4000-8000-000000000003', 'general', 19, 'Cover blocks placed as per specified sizes', NULL),
  ('a1000000-0000-4000-8000-000000000003', 'general', 20, 'Placing Of Sleeves as per Drawings', NULL),
  ('a1000000-0000-4000-8000-000000000003', 'general', 21, 'Proper cleaning before casting of slab', NULL)
ON CONFLICT (template_id, section, sequence_no) DO UPDATE SET
  description = EXCLUDED.description, measurement_label = EXCLUDED.measurement_label;

-- 6d. Masonry
INSERT INTO public.qc_checklist_template_items (template_id, section, sequence_no, description, measurement_label) VALUES
  ('a1000000-0000-4000-8000-000000000004', 'general', 1, 'Cleaning of entire floor before starting the line out of masonry', NULL),
  ('a1000000-0000-4000-8000-000000000004', 'general', 2, 'Checking of dimensions & diagonals of room after first layer (rangat / perni / nondh)', NULL),
  ('a1000000-0000-4000-8000-000000000004', 'general', 3, 'First layer to checked with beam bottom edge, offset, plumb, etc', NULL),
  ('a1000000-0000-4000-8000-000000000004', 'general', 4, 'Opening to be provided for doors at first layer and for window & A.C. unit at sill level.', NULL),
  ('a1000000-0000-4000-8000-000000000004', 'general', 5, 'Sand and cement screed to be applied on adjoining column surface before masonry', NULL),
  ('a1000000-0000-4000-8000-000000000004', 'general', 6, 'Water to be sprinkled over bricks before start of masonry work', NULL),
  ('a1000000-0000-4000-8000-000000000004', 'general', 7, 'Specific bond to be followed and avoid vertical perpend', NULL),
  ('a1000000-0000-4000-8000-000000000004', 'general', 8, 'Mortar shall be applied properly on all the surfaces of the block (no gaps shall be seen in between)', NULL),
  ('a1000000-0000-4000-8000-000000000004', 'general', 9, 'Plumb to be checked at every layer', NULL),
  ('a1000000-0000-4000-8000-000000000004', 'general', 10, 'Water curing to be done atleast for 7 days', NULL),
  ('a1000000-0000-4000-8000-000000000004', 'general', 11, 'Adjustment in laying of brick to be made such that last layer touches the beam bottom. Gap shall not be more than 10mm', NULL),
  ('a1000000-0000-4000-8000-000000000004', 'general', 12, 'Junction of Last Layer of Brick and Beam Bottom to be fixed with Cement Mortar and Agreegate', NULL),
  ('a1000000-0000-4000-8000-000000000004', 'general', 13, 'Cleaning of rooms', NULL)
ON CONFLICT (template_id, section, sequence_no) DO UPDATE SET
  description = EXCLUDED.description, measurement_label = EXCLUDED.measurement_label;

-- 6e. Internal Plaster
INSERT INTO public.qc_checklist_template_items (template_id, section, sequence_no, description, measurement_label) VALUES
  ('a1000000-0000-4000-8000-000000000005', 'before_plastering', 1, 'Masonry work completely finished', NULL),
  ('a1000000-0000-4000-8000-000000000005', 'before_plastering', 2, 'Watering of surface a day before plastering.', NULL),
  ('a1000000-0000-4000-8000-000000000005', 'before_plastering', 3, 'All electrical conduiting chasing work completed', NULL),
  ('a1000000-0000-4000-8000-000000000005', 'before_plastering', 4, 'Height of Switch boards as per drawings', NULL),
  ('a1000000-0000-4000-8000-000000000005', 'before_plastering', 5, 'All chasing work filled and covered with Chicken mesh', NULL),
  ('a1000000-0000-4000-8000-000000000005', 'before_plastering', 6, 'All concrete and masonry junctions to be covered with chicken mesh', NULL),
  ('a1000000-0000-4000-8000-000000000005', 'before_plastering', 7, 'All concrete work shall be properly hacked (tanchaa)', NULL),
  ('a1000000-0000-4000-8000-000000000005', 'before_plastering', 8, 'T.P. (Thiyaa) marked as per minimum plaster level. (i.e. 12mm-15mm) - min of 3 T.P. Vertically', NULL),
  ('a1000000-0000-4000-8000-000000000005', 'before_plastering', 9, 'Checking of Plumb and Right Angle for T.P. marked', NULL),
  ('a1000000-0000-4000-8000-000000000005', 'before_plastering', 10, 'All electrical box covered with dummy plates', NULL),
  ('a1000000-0000-4000-8000-000000000005', 'before_plastering', 11, 'Min. 5" as per decided plaster to be left from bottom floor for skirting', NULL),
  ('a1000000-0000-4000-8000-000000000005', 'after_plastering', 1, 'Proper curing work for min. 10 days', NULL),
  ('a1000000-0000-4000-8000-000000000005', 'after_plastering', 2, 'Checking plumb line, level and right angle of all plastered surface.', NULL),
  ('a1000000-0000-4000-8000-000000000005', 'after_plastering', 3, 'Cleaning of plastered surface', NULL),
  ('a1000000-0000-4000-8000-000000000005', 'after_plastering', 4, 'Sill, column, beam edges properly dressed at right angle and are in plumb', NULL)
ON CONFLICT (template_id, section, sequence_no) DO UPDATE SET
  description = EXCLUDED.description, measurement_label = EXCLUDED.measurement_label;

-- 6f. Granite/Marble
INSERT INTO public.qc_checklist_template_items (template_id, section, sequence_no, description, measurement_label) VALUES
  ('a1000000-0000-4000-8000-000000000006', 'general', 1, 'Dimensions (Length and Width) as per drawings', NULL),
  ('a1000000-0000-4000-8000-000000000006', 'general', 2, 'Diagonal measurements', NULL),
  ('a1000000-0000-4000-8000-000000000006', 'general', 3, 'Vertical Straightness (Plumb Line)', NULL),
  ('a1000000-0000-4000-8000-000000000006', 'general', 4, 'Mortar applied evenly throughout the length and width of the stone', NULL),
  ('a1000000-0000-4000-8000-000000000006', 'general', 5, 'Stone edges properly shaped and not broken', NULL)
ON CONFLICT (template_id, section, sequence_no) DO UPDATE SET
  description = EXCLUDED.description, measurement_label = EXCLUDED.measurement_label;

-- 6g. Flooring
INSERT INTO public.qc_checklist_template_items (template_id, section, sequence_no, description, measurement_label) VALUES
  ('a1000000-0000-4000-8000-000000000007', 'general', 1, 'Dimension of tiles (length and width) as per requirement', NULL),
  ('a1000000-0000-4000-8000-000000000007', 'general', 2, 'Diagonal dimensions', NULL),
  ('a1000000-0000-4000-8000-000000000007', 'general', 3, 'Tiles to be soaked for 12 hours before commencement of work', NULL),
  ('a1000000-0000-4000-8000-000000000007', 'general', 4, 'Dry weight Vs Wet weight', NULL),
  ('a1000000-0000-4000-8000-000000000007', 'general', 5, 'Cleaning of surface a day before flooring work', NULL),
  ('a1000000-0000-4000-8000-000000000007', 'general', 6, 'Common reference level marked on all the wall of each rooms/bays', NULL),
  ('a1000000-0000-4000-8000-000000000007', 'general', 7, 'Benchmark flooring level (Thiya) made before maachan work', NULL),
  ('a1000000-0000-4000-8000-000000000007', 'general', 8, 'Flooring work to be started as per starting point and laying direction given in the drawing', NULL),
  ('a1000000-0000-4000-8000-000000000007', 'general', 9, 'Maachan work to be done as per Thiya marked and necessary slope given in bathroom/toilets', NULL),
  ('a1000000-0000-4000-8000-000000000007', 'general', 10, 'All vertical and horizontal line shall be in one line', NULL),
  ('a1000000-0000-4000-8000-000000000007', 'general', 11, 'Cement slurry evenly poured below tile over entire surface', NULL),
  ('a1000000-0000-4000-8000-000000000007', 'general', 12, 'No undulation to be observed at joints', NULL)
ON CONFLICT (template_id, section, sequence_no) DO UPDATE SET
  description = EXCLUDED.description, measurement_label = EXCLUDED.measurement_label;

-- 6h. Wall Tiles
INSERT INTO public.qc_checklist_template_items (template_id, section, sequence_no, description, measurement_label) VALUES
  ('a1000000-0000-4000-8000-000000000008', 'general', 1, 'Dimension of tiles (length and width) as per requirement', NULL),
  ('a1000000-0000-4000-8000-000000000008', 'general', 2, 'Diagonal dimensions', NULL),
  ('a1000000-0000-4000-8000-000000000008', 'general', 3, 'Tiles to be soaked for 12 hours before commencement of work', NULL),
  ('a1000000-0000-4000-8000-000000000008', 'general', 4, 'Dry weight Vs Wet weight', NULL),
  ('a1000000-0000-4000-8000-000000000008', 'general', 5, 'Benchmark level (Thiya) made on all walls', NULL),
  ('a1000000-0000-4000-8000-000000000008', 'general', 6, 'Mortar to be applied evenly on entire surface of tile, no voids shall be observed', NULL),
  ('a1000000-0000-4000-8000-000000000008', 'general', 7, 'All vertical and horizontal line shall be in one line', NULL),
  ('a1000000-0000-4000-8000-000000000008', 'general', 8, 'No undulation to be observed at joints', NULL),
  ('a1000000-0000-4000-8000-000000000008', 'general', 9, 'Height to be checked upto which Dado is to be done', NULL),
  ('a1000000-0000-4000-8000-000000000008', 'general', 10, 'No undulation to be observed at joints (grout lines)', NULL)
ON CONFLICT (template_id, section, sequence_no) DO UPDATE SET
  description = EXCLUDED.description, measurement_label = EXCLUDED.measurement_label;
