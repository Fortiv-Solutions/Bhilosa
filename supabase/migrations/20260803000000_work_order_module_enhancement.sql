-- ============================================================================
-- Work Order module enhancement: mandatory fields, business rules & linkages.
--
-- Adds the template library (15 trade-specific WO formats extracted from
-- C:\Users\karan\Downloads\Pramukh-group\Work Order), the Agency/WO-type/
-- lifecycle/money-tracking fields on work_orders, the QC/WO gate on
-- service_bills (the RA-bill flow this branch is building against Work
-- Orders — vendor_bills, the separate PO/GRN-matched material bill desk, is
-- intentionally left untouched), the missing DPR<->Agency FK, and the
-- scope-overrun -> budget_alerts wiring.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Template library (the 15 trade-specific WO formats)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wo_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  trade_category text NOT NULL,
  default_wo_type text NOT NULL DEFAULT 'fixed_scope' CHECK (default_wo_type IN ('fixed_scope','rate_based')),
  item_columns jsonb NOT NULL DEFAULT '[]'::jsonb,
  terms_baseline text,
  terms_category text,
  source_file_name text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  updated_by uuid REFERENCES public.profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_wo_templates_trade_category ON public.wo_templates(trade_category);

ALTER TABLE public.wo_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wo_templates_select ON public.wo_templates;
CREATE POLICY wo_templates_select
  ON public.wo_templates FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS wo_templates_insert ON public.wo_templates;
CREATE POLICY wo_templates_insert
  ON public.wo_templates FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS wo_templates_update ON public.wo_templates;
CREATE POLICY wo_templates_update
  ON public.wo_templates FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

-- Seed the 15 formats. Idempotent per (name, source_file_name) — guarded by
-- the not-already-seeded check below so re-running the migration is a no-op.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.wo_templates LIMIT 1) THEN
    INSERT INTO public.wo_templates (name, trade_category, default_wo_type, item_columns, terms_baseline, terms_category, source_file_name) VALUES
      ('Ananta AC Installation Work', 'AC Installation Work', 'fixed_scope', '["Sr. No.","Work Description","Unit","Qty","Rate/ Unit (Rs.)","Amount ( In Rs.)"]'::jsonb, '1. GST incl.
    2. Payment Condition - 100% after 30 days of bill submission
    3. All Bill shall be approved by Site Engineer before submission
    4. All work shall be done as per Standard Quality. If quality is found unsatisfactory, client reserves the right to give Debit to Contractor for the same or Contractor will have to do re-work for the same', '1. Total Cost above is approximate, Final Cost will be as per actual Measurement
    2. Bill to be paid only on 1st to and 5th of every month (only if bill will submitte in of previous month, if not than it is consider in next month.)
    3. All Work comes under the BOCW Act,1996
    4. The PF Act shall be applicable to every person who has been employed by or by the Contractor or in any association with the work of the establishment.
    5. Deviation in Specifications : Not Allowed unless approved in writing
    6. If any accident take place at site contractor is solely responsible for it, builder has no responsibility for the same.', 'AC Installtion Work - I building sample flat.xlsx'),
      ('Amaya Lift Area Partition Work', 'Lift Partition Work', 'fixed_scope', '["Sr. No.","Work Description","Qty","Unit","Rate/ Unit","Amount ( In Rs.)"]'::jsonb, '1. GST is extra as per apllicable
    2. Payment Condition - 100% after work completion
    3. All Bill shall be approved by Site Engineer before submission
    4. All work shall be done as per Standard Quality. If quality is found unsatisfactory, client reserves the right to give Debit to Contractor for the same or Contractor will have to do re-work for the same', '1. If Contractor fails to achieve the quality of work desired by the client, then client reserves the right to stop the work & get it complete from another contractor.
    2. Contractor has to maintain labour attendance (Hajri patrak) and Salary details (Pagar patrak) on day to day basis.
    3. Contractor has to provide labour insurance before starting the work.
    4. If any accident take place at site contractor is solely responsible for it, builder has no responsibility for the same.
    5. All welding work should be proper and full
    6. 3 warnings to be given regarding safety after that every instant 2000 Rs. Debit to be given.
    7. Cost of all Material Wastage is considered in the given rates, No additional Cost of Wastage to be given
    8. Bill to be paid only on 15th and 25th of every month and if bill to be submitted of previous month only, or it should be consider in next schedule.
    9. Material to be delivered in given timeline if not completed on time debit of 1500 Rs. Per day to be given.
    10. All Work comes under the BOCW Act,1996
    11. The PF Act shall be applicable to every person who has been employed by or by the Contractor or in any association with the work of the establishment.', 'W.O, - 7  LIFT PARTITION WORK VISHAL.xlsx'),
      ('Revanta GI Railling Work', 'GI Railing / T-Angle Work', 'fixed_scope', '["Sr. No.","Work Description","Qty","Unit","Rate/ Unit","Amount ( In Rs.)"]'::jsonb, '1. GST is included
    2. Payment Condition - 100% after work completion
    3. All Bill shall be approved by Site Engineer before submission
    4. All work shall be done as per Standard Quality. If quality is found unsatisfactory, client reserves the right to give Debit to Contractor for the same or Contractor will have to do re-work for the same', '1. If Contractor fails to achieve the quality of work desired by the client, then client reserves the right to stop the work & get it complete from another contractor.
    2. Contractor has to maintain labour attendance (Hajri patrak) and Salary details (Pagar patrak) on day to day basis.
    3. Contractor has to provide labour insurance before starting the work.
    4. If any accident take place at site contractor is solely responsible for it, builder has no responsibility for the same.
    5. All welding work should be proper and full
    6. 3 warnings to be given regarding safety after that every instant 2000 Rs. Debit to be given.
    7. Cost of all Material Wastage is considered in the given rates, No additional Cost of Wastage to be given
    8. Bill to be paid only on 15th and 25th of every month and if bill to be submitted of previous month only, or it should be consider in next schedule.
    9. Material to be delivered in given timeline if not completed on time debit of 1500 Rs. Per day to be given.
    10. All Work comes under the BOCW Act,1996
    11. The PF Act shall be applicable to every person who has been employed by or by the Contractor or in any association with the work of the establishment.', 'W.O. - 5 Kitchen T-Angle Ambika Metals.xlsx'),
      ('Amaya Lift Area Partition Work', 'Lift Partition Work', 'fixed_scope', '["Sr. No.","Work Description","Qty","Unit","Rate/ Unit","Amount ( In Rs.)"]'::jsonb, '1. GST is extra as per apllicable
    2. Payment Condition - 100% after work completion
    3. All Bill shall be approved by Site Engineer before submission
    4. All work shall be done as per Standard Quality. If quality is found unsatisfactory, client reserves the right to give Debit to Contractor for the same or Contractor will have to do re-work for the same', '1. If Contractor fails to achieve the quality of work desired by the client, then client reserves the right to stop the work & get it complete from another contractor.
    2. Contractor has to maintain labour attendance (Hajri patrak) and Salary details (Pagar patrak) on day to day basis.
    3. Contractor has to provide labour insurance before starting the work.
    4. If any accident take place at site contractor is solely responsible for it, builder has no responsibility for the same.
    5. All welding work should be proper and full
    6. 3 warnings to be given regarding safety after that every instant 2000 Rs. Debit to be given.
    7. Cost of all Material Wastage is considered in the given rates, No additional Cost of Wastage to be given
    8. Bill to be paid only on 15th and 25th of every month and if bill to be submitted of previous month only, or it should be consider in next schedule.
    9. Material to be delivered in given timeline if not completed on time debit of 1500 Rs. Per day to be given.
    10. All Work comes under the BOCW Act,1996
    11. The PF Act shall be applicable to every person who has been employed by or by the Contractor or in any association with the work of the establishment.', 'W.O. - 6  LIFT PARTITION WORK.xlsx'),
      ('Plumbing Labour Work For Tower A, B and C Towers', 'Plumbing Works', 'fixed_scope', '["Sr. No.","Work Description","Unit (Flats)","Rate (Rs.)","Amount ( In Rs.)"]'::jsonb, '1. Tax as applicable
    2. Payment Condition - Payment will be done in 15days after receipt of RA bill. RA shall be raised only for activity which is 100% Complete
    3. Payment Stages - Inlet Fitting Work - 20% Internal Drainage Line Work - 10% Water Proofing Work - 25% External Vertical Line Work - 20% Terrace Looping Work - 10% CP Fitting Work - 7.5% Sanitary Fitting Work - 7.5%
    4. All Bill Shall be approved by Site Engineer before submission to account dept.
    5. All work shall be done as per Standard Quality. If quality is found unsatisfactory, client reserves the right to give Debit for the same
    6. Retention @ 5% will be kept in all RA bills', '1. All work shall be done in Proper Line, Slope & Levels.
    2. All CP & Sanitary Fitting to be done at same level in all Toilets as specified in the drawings
    3. All Core Cut Finishing to be done by Plumbing Agency.
    4. All Work shall be done within agreed timeline, incase of delay, debit of 500/- Rs per day shall be charged
    5. It will be agency''s responsibility to clean entire floor everyday once the work is completed', 'W.O.- 2 Plumbing Works - Deepakbhai.xlsx'),
      ('Plumbing Labour Work For Tower A, B and C Towers', 'Plumbing Works', 'fixed_scope', '["Sr. No.","Work Description","Unit (Flats)","Rate (Rs.)","Amount ( In Rs.)"]'::jsonb, '1. Tax as applicable
    2. Payment Condition - Payment will be done in 15days after receipt of RA bill. RA shall be raised only for activity which is 100% Complete
    3. Payment Stages - Inlet Fitting Work - 20% Internal Drainage Line Work - 10% Water Proofing Work - 25% External Vertical Line Work - 20% Terrace Looping Work - 10% CP Fitting Work - 7.5% Sanitary Fitting Work - 7.5%
    4. All Bill Shall be approved by Site Engineer before submission to account dept.
    5. All work shall be done as per Standard Quality. If quality is found unsatisfactory, client reserves the right to give Debit for the same
    6. Retention @ 5% will be kept in all RA bills', '1. All work shall be done in Proper Line, Slope & Levels.
    2. All CP & Sanitary Fitting to be done at same level in all Toilets as specified in the drawings
    3. All Core Cut Finishing to be done by Plumbing Agency.
    4. All Work shall be done within agreed timeline, incase of delay, debit of 500/- Rs per day shall be charged
    5. It will be agency''s responsibility to clean entire floor everyday once the work is completed', 'W.O.- 3 Plumbing Works - Salaudin.xlsx'),
      ('Colour Labour With Material Work', 'Colour Labour with Material', 'rate_based', '["Sr. No.","Work Description","Unit","Rate (Rs.)","Warranty Period"]'::jsonb, '1. Payment Condition - Payment will be done once in month on submission of RA bill. RA shall be raised only for activity which is 100% Complete
    2. Payment Stages - Payment Will be done as per Running Bill Submitted after work Completion 5% Will be kept as Retention and will be paid after 12 months of total work compltioned.
    3. All Bill Shall be approved by Site Engineer before submission to account dept.
    4. All work shall be done as per Standard Quality. If quality is found unsatisfactory, client reserves the right to give Debit for the same or same work is to be done without any additional cost.', '1. Above Given Rate mentioned is for labour with material all inclusive.Tax will be additional as applicable
    2. On Site Measurement Will be taken for finalisation of the Quantity
    3. All work shall be done in proper Line, Level & Surface should not have any undulation
    4. All Work shall be done within agreed timeline, incase of delay, debit of 2000/- Rs per day shall be charged
    5. It will be agency''s responsibility to clean entire floor/Surfaces everyday once the work is completed
    6. Light & Water will be provided at Single Point on Ground Floor, Further distribution will be in agency''s scope
    7. Cleaning of Colour spilled on other surfaces should be cleaned properly on regular basis.
    8. Painting work includes application of texture, primer and paint material.
    9. All the application will be done at a time when scaffolding is arranged by contractor at construction site .
    10. Material will be routed through Authorized Dealer of Material Supplier Co.
    11. Proper colouring on pipe and surface of duct to be done by contractor
    12. Material will be supplied directly from Co.’s warehouse after accepting quoted rates.
    13. All of the above work will be completed as per the PIS (Product Information Sheet) for optimum result.
    14. Three site Visit will be done by Company’s Technologist, periodically to help the client with providing optimum result.
    15. Application rate for any other material will be quoted separately.
    16. Client will provide place for stocking of material and accommodation place will be provided ,arrangement of rooms to be done by contractor.
    17. Water and Power Supply will be provided by Client free of cost on site.
    18. Surface protection cost for windows and hand rail installations will be in scope of contractor.
    19. Measurement will be done according to prevailing market practices and same will be accepted by both the parties.
    20. Any Surface measure in width/lengths/height below 0.5 foot will be considered as running foot and will be charged at half rate of actual finalized product application rate.
    21. Guarantee certificate to be provided by contractor on material provided companies latter head.
    22. Process for Exterior paint Application. (1). Cutting of nails (khilas) from walls.(2).Checking and filing of cracks.(3).Washing entire building before colour work.(4).Texture Work.(5).Primer Work (6).Colour Work.', 'WO - 08 Colour Labour with material Work order AMAYA.xlsx'),
      ('Railing work of Project Amaya (Tower - A to D, I, J)', 'GI Railing Work', 'fixed_scope', '["Sr. No.","Work Description","Unit","Qty","Rate","Amount ( In Rs.)"]'::jsonb, '1. Payment Condition - Payment will be done once in month on submission of RA bill. RA shall be raised only for activity which is 100% Complete
    2. Payment Stages - Payment Will be done as per Running Bill Submitted after work Completion 5% Will be kept as Retention and will be paid after 12 months of total work compltioned.
    3. All Bill Shall be approved by Site Engineer before submission to account dept.
    4. All work shall be done as per Standard Quality. If quality is found unsatisfactory, client reserves the right to give Debit for the same or same work is to be done without any additional cost.', '1. Above Given Rate mentioned is for labour with material all inclusive.Tax will be additional as applicable
    2. On Site Measurement Will be taken for finalisation of the Quantity
    3. All work shall be done in proper Line, Level & Surface should not have any undulation
    4. It will be agency''s responsibility to clean entire floor/Surfaces everyday once the work is completed
    5. Light & Water will be provided at Single Point on Ground Floor, Further distribution will be in agency''s scope
    6. All the application will be done at a time when scaffolding is arranged by contractor at construction site .
    7. Material will be routed through Authorized Dealer of Material Supplier Co.
    8. Proper colouring on pipe and surface of duct to be done by contractor .
    9. All of the above work will be completed as per the PIS (Product Information Sheet) for optimum result.
    10. Three site Visit will be done by Company’s Technologist, periodically to help the client with providing optimum result.
    11. Application rate for any other material will be quoted separately.
    12. Client will provide place for stocking of material and accommodation place will be provided ,arrangement of rooms to be done by contractor.
    13. Water and Power Supply will be provided by Client free of cost on site.
    14. Measurement will be done according to prevailing market practices and same will be accepted by both the parties.
    15. Any Surface measure in width/lengths/height below 0.5 foot will be considered as running foot and will be charged at half rate of actual finalized product application rate.
    16. 3 warnings to be given regarding safety after that every instant 2000 Rs. Debit to be given.
    17. Cost of all Material Wastage is considered in the given rates, No additional Cost of Wastage to be given
    18. Bill to be paid only on 15th and 20th of every month and if bill to be submitted of previous month only, or it should be consider in next schedule.
    19. All Work comes under the BOCW Act,1996
    20. The PF Act shall be applicable to every person who has been employed by or by the Contractor or in any association with the work of the establishment.
    21. Delay in completion beyond the agreed schedule will attract a debit as decided by the client and adjusted against the final bill.
    22. Guarantee certificate to be provided by contractor on material provided companies latter head.', 'WO - 2026-003 AMBIKA METAL GI RAILING AMAYA.xlsx'),
      ('Railing work of Project Amaya', 'GI Railing Work', 'fixed_scope', '["Sr. No.","Work Description","Unit","Qty","Rate","Amount ( In Rs.)"]'::jsonb, '1. Payment Condition - Payment will be done once in month on submission of RA bill. RA shall be raised only for activity which is 100% Complete
    2. Payment Stages - Payment Will be done as per Running Bill Submitted after work Completion 5% Will be kept as Retention and will be paid after 12 months of total work compltioned.
    3. All Bill Shall be approved by Site Engineer before submission to account dept.
    4. All work shall be done as per Standard Quality. If quality is found unsatisfactory, client reserves the right to give Debit for the same or same work is to be done without any additional cost.', '1. Above Given Rate mentioned is for labour with material all inclusive.Tax will be additional as applicable
    2. On Site Measurement Will be taken for finalisation of the Quantity
    3. All work shall be done in proper Line, Level & Surface should not have any undulation
    4. It will be agency''s responsibility to clean entire floor/Surfaces everyday once the work is completed
    5. Light & Water will be provided at Single Point on Ground Floor, Further distribution will be in agency''s scope
    6. All the application will be done at a time when scaffolding is arranged by contractor at construction site .
    7. Material will be routed through Authorized Dealer of Material Supplier Co.
    8. Proper colouring on pipe and surface of duct to be done by contractor .
    9. All of the above work will be completed as per the PIS (Product Information Sheet) for optimum result.
    10. Three site Visit will be done by Company’s Technologist, periodically to help the client with providing optimum result.
    11. Application rate for any other material will be quoted separately.
    12. Client will provide place for stocking of material and accommodation place will be provided ,arrangement of rooms to be done by contractor.
    13. Water and Power Supply will be provided by Client free of cost on site.
    14. Measurement will be done according to prevailing market practices and same will be accepted by both the parties.
    15. Any Surface measure in width/lengths/height below 0.5 foot will be considered as running foot and will be charged at half rate of actual finalized product application rate.
    16. 3 warnings to be given regarding safety after that every instant 2000 Rs. Debit to be given.
    17. Cost of all Material Wastage is considered in the given rates, No additional Cost of Wastage to be given
    18. Bill to be paid only on 15th and 20th of every month and if bill to be submitted of previous month only, or it should be consider in next schedule.
    19. All Work comes under the BOCW Act,1996
    20. The PF Act shall be applicable to every person who has been employed by or by the Contractor or in any association with the work of the establishment.
    21. Delay in completion beyond the agreed schedule will attract a debit as decided by the client and adjusted against the final bill.
    22. Guarantee certificate to be provided by contractor on material provided companies latter head.', 'WO - 2026-003 MODERN FAB. GI RAILING AMAYA.xlsx'),
      ('GI Exterior Louvers System for E To P Tower', 'Exterior Louvers Work', 'fixed_scope', '["Sr. No.","Work Description","Qty","Unit","Rate/ Unit","Amount ( In Rs.)"]'::jsonb, '1. GST Extra as per applicable
    2. Payment Terms - 50% Adavance & 50% on Work completion
    3. All Bill shall be approved by Site Engineer before submission
    4. All work shall be done as per Standard Quality. If quality is found unsatisfactory, client reserves the right to give Debit to Contractor for the same or Contractor will have to do re-work for the same
    5. Retention @ 10% will be kept in all RA bills. It will be released after 12 months of work completion.', '1. Total cost will be as per Actual quantity of work done on site and item Rates as per Attached Quotation variation above 5% is not considerd for the same as the quantities are based on drawings.
    2. If Contractor fails to achieve the quality of work desired by the client, then client reserves the right to stop the work & get it complete from another contractor.
    3. Contractor will have to submit Quality Test Certificate for all the items.
    4. Contractor will have to submit warranty certificate for all items and will be liable for any defect for one year and one year free service warranty period.
    5. Contractor has to maintain labour attendance (Hajri patrak) and Salary details (Pagar patrak) on day to day basis.
    6. Contractor has to provide labour insurance before starting the work.
    7. Joint measurement should be done at the time of final bill.
    8. All material supplied should be as per specification given in the annexure-1.
    9. If any accident take place at site contractor is solely responsible it, builder has no responsibility for the same.
    10. All sample material / accessories to be submitted and get approved from the PMC before execution.
    11. Contractor has to follow all the safety norms at site 3 Warnings to be given for not following the safety guidelines, than Debit of 2000 Rs. to be given for every time.
    12. All work should be in line and level. All plaster should be in plum and finish as per given instruction.
    13. All material shall be properly powder coated before application. Any kind of touch up required after installation shall be done without and additional cost.
    14. Scaffolding cost is not included in the above rate.
    15. All material loading and unloading shall be under the contractor’s scope. The client will allocate the store area with lock and key, thereafter, the complete responsibility for the safety, security, storage, and handling of the material shall rest with the contractor.
    16. All waste material to be stack and disposeed as per given instruction.
    17. All waste to be cleaning by the agency at its cost. All wastage is included in the above rate no extra cost will be given for the same.
    18. Light & Water will be provided at Single Point on Ground Floor, Further distribution will be in agency''s scope
    19. It will be agency''s responsibility to keep/Stock Material properly on Site. Any Damage caused will be not be bared by Builder
    20. Contractor has to provide labour insurance before starting the work.
    21. If any accident take place at site contractor is solely responsible for it, builder has no responsibility for the same.
    22. All Section should be proper fixed with frame with proper chemical and also corners are fixed properly with proper angle.
    23. 3 warnings to be given regarding safety after that every instant 2000 Rs. Debit to be given.
    24. Cost of all Material Wastage is considered in the given rates, No additional Cost of Wastage to be given
    25. Bill to be paid only on 15th and 20th of every month and if bill to be submitted of previous month only, or it should be consider in next schedule.
    26. All Work comes under the BOCW Act,1996
    27. The PF Act shall be applicable to every person who has been employed by or by the Contractor or in any association with the work of the establishment.
    28. Delay in completion beyond the agreed schedule will attract a debit as decided by the client/builder and adjusted against the final bill.', 'WO - 2026-005 EXTERIOR LOUVERS WORK (2) - AMAYA.xlsx'),
      ('GI Exterior Louvers System for ABCD Tower', 'Exterior Louvers Work', 'fixed_scope', '["Sr. No.","Work Description","Qty","Unit","Rate/ Unit","Amount ( In Rs.)"]'::jsonb, '1. GST Extra as per applicable
    2. Payment Terms - 50% Adavance & 50% on Work completion
    3. All Bill shall be approved by Site Engineer before submission
    4. All work shall be done as per Standard Quality. If quality is found unsatisfactory, client reserves the right to give Debit to Contractor for the same or Contractor will have to do re-work for the same
    5. Retention @ 10% will be kept in all RA bills. It will be released after 12 months of work completion.', '1. Total cost will be as per Actual quantity of work done on site and item Rates as per Attached Quotation variation above 5% is not considerd for the same as the quantities are based on drawings.
    2. If Contractor fails to achieve the quality of work desired by the client, then client reserves the right to stop the work & get it complete from another contractor.
    3. Contractor will have to submit Quality Test Certificate for all the items.
    4. Contractor will have to submit warranty certificate for all items and will be liable for any defect for one year and one year free service warranty period.
    5. Contractor has to maintain labour attendance (Hajri patrak) and Salary details (Pagar patrak) on day to day basis.
    6. Contractor has to provide labour insurance before starting the work.
    7. Joint measurement should be done at the time of final bill.
    8. All material supplied should be as per specification given in the annexure-1.
    9. If any accident take place at site contractor is solely responsible it, builder has no responsibility for the same.
    10. All sample material / accessories to be submitted and get approved from the PMC before execution.
    11. Contractor has to follow all the safety norms at site 3 Warnings to be given for not following the safety guidelines, than Debit of 2000 Rs. to be given for every time.
    12. All work should be in line and level. All plaster should be in plum and finish as per given instruction.
    13. All material shall be properly powder coated before application. Any kind of touch up required after installation shall be done without and additional cost.
    14. Scaffolding cost is not included in the above rate.
    15. All material loading and unloading shall be under the contractor’s scope. The client will allocate the store area with lock and key, thereafter, the complete responsibility for the safety, security, storage, and handling of the material shall rest with the contractor.
    16. All waste material to be stack and disposeed as per given instruction.
    17. All waste to be cleaning by the agency at its cost. All wastage is included in the above rate no extra cost will be given for the same.
    18. Light & Water will be provided at Single Point on Ground Floor, Further distribution will be in agency''s scope
    19. It will be agency''s responsibility to keep/Stock Material properly on Site. Any Damage caused will be not be bared by Builder
    20. Contractor has to provide labour insurance before starting the work.
    21. If any accident take place at site contractor is solely responsible for it, builder has no responsibility for the same.
    22. All Section should be proper fixed with frame with proper chemical and also corners are fixed properly with proper angle.
    23. 3 warnings to be given regarding safety after that every instant 2000 Rs. Debit to be given.
    24. Cost of all Material Wastage is considered in the given rates, No additional Cost of Wastage to be given
    25. Bill to be paid only on 15th and 20th of every month and if bill to be submitted of previous month only, or it should be consider in next schedule.
    26. All Work comes under the BOCW Act,1996
    27. The PF Act shall be applicable to every person who has been employed by or by the Contractor or in any association with the work of the establishment.
    28. Delay in completion beyond the agreed schedule will attract a debit as decided by the client/builder and adjusted against the final bill.', 'WO - 2026-005 EXTERIOR LOUVERS WORK - AMAYA.xlsx'),
      ('Cable Tray work of Project Amaya', 'Cable Tray Work', 'fixed_scope', '["Sr. No.","Work Description","Unit","Qty","Rate","Amount ( In Rs.)"]'::jsonb, '1. Payment Condition - Payment will be done once in month on submission of RA bill. RA shall be raised only for activity which is 100% Complete
    2. Payment Stages - Payment Will be done as per Running Bill Submitted after work Completion 5% Will be kept as Retention and will be paid after 12 months of total work compltioned.
    3. All Bill Shall be approved by Site Engineer before submission to account dept.
    4. All work shall be done as per Standard Quality. If quality is found unsatisfactory, client reserves the right to give Debit for the same or same work is to be done without any additional cost.', '1. Above Given Rate mentioned is for labour with material all inclusive.Tax will be additional as applicable
    2. On Site Measurement Will be taken for finalisation of the Quantity
    3. All work shall be done in proper Line, Level & Surface should not have any undulation
    4. It will be agency''s responsibility to clean entire floor/Surfaces everyday once the work is completed
    5. Light & Water will be provided at Single Point on Ground Floor, Further distribution will be in agency''s scope
    6. All the application will be done at a time when scaffolding is arranged by contractor at construction site .
    7. Material will be routed through Authorized Dealer of Material Supplier Co.
    8. Proper colouring on pipe and surface of duct to be done by contractor .
    9. All of the above work will be completed as per the PIS (Product Information Sheet) for optimum result.
    10. Three site Visit will be done by Company’s Technologist, periodically to help the client with providing optimum result.
    11. Application rate for any other material will be quoted separately.
    12. Client will provide place for stocking of material and accommodation place will be provided ,arrangement of rooms to be done by contractor.
    13. Water and Power Supply will be provided by Client free of cost on site.
    14. Measurement will be done according to prevailing market practices and same will be accepted by both the parties.
    15. Any Surface measure in width/lengths/height below 0.5 foot will be considered as running foot and will be charged at half rate of actual finalized product application rate.
    16. 3 warnings to be given regarding safety after that every instant 2000 Rs. Debit to be given.
    17. Cost of all Material Wastage is considered in the given rates, No additional Cost of Wastage to be given
    18. Bill to be paid only on 15th and 20th of every month and if bill to be submitted of previous month only, or it should be consider in next schedule.
    19. All Work comes under the BOCW Act,1996
    20. The PF Act shall be applicable to every person who has been employed by or by the Contractor or in any association with the work of the establishment.
    21. Delay in completion beyond the agreed schedule will attract a debit as decided by the client and adjusted against the final bill.
    22. Guarantee certificate to be provided by contractor on material provided companies latter head.', 'WO - 2026-006 MODERN FAB. CABLE TRAY AMAYA.xlsx'),
      ('Aluminium Window Section Work', 'Aluminium Window Section Work', 'fixed_scope', '["Sr. No.","Work Description","Qty","Unit","Rate/ Unit","Amount ( In Rs.)"]'::jsonb, '1. GST Extra as per applicable
    2. Payment Terms - On Completion of Work - 100% (30 days after submission of Bill)
    3. All Bill shall be approved by Site Engineer before submission
    4. All work shall be done as per Standard Quality. If quality is found unsatisfactory, client reserves the right to give Debit to Contractor for the same or Contractor will have to do re-work for the same', '1. Area above is approximate, Final area will be as per actual measurement on site
    2. The aluminum window section includes supply, fabrication, and/or installation of aluminum windows as specified in the approved drawings, designs, and measurements. Any work outside this scope will be treated as additional and charged separately.
    3. Aluminum frames shall be of approved grade and finish as mentioned in the quotation or agreement.
    4. Glass type, thickness, and accessories (locks, handles, rubber beading, etc.) shall be as specified.
    5. If Contractor fails to achieve the quality of work desired by the client, then client reserves the right to stop the work & get it complete from another contractor.
    6. Contractor has to maintain labour attendance (Hajri patrak) and Salary details (Pagar patrak) on day to day basis.
    7. Contractor has to provide labour insurance before starting the work.
    8. If any accident take place at site contractor is solely responsible for it, builder has no responsibility for the same.
    9. All Installation work should be proper and fill with silicon.
    10. All Section should be proper fixed with frame with proper chemical and also corners are fixed properly with proper angle.
    11. 3 warnings to be given regarding safety after that every instant 2000 Rs. Debit to be given.
    12. Cost of all Material Wastage is considered in the given rates, No additional Cost of Wastage to be given
    13. Bill to be paid only on 15th and 20th of every month and if bill to be submitted of previous month only, or it should be consider in next schedule.
    14. Project to be complete in given timeline if not completed on time debit of 1500 Rs. Per day to be given.
    15. All Work comes under the BOCW Act,1996
    16. The PF Act shall be applicable to every person who has been employed by or by the Contractor or in any association with the work of the establishment.
    17. Delay in completion beyond the agreed schedule will attract a debit as decided by the client and adjusted against the final bill.', 'WO - 2026-01 WINDOW SECTION 25X65.xlsx'),
      ('AC Stand work of Project AMAYA', 'AC Stand Fabrication', 'fixed_scope', '["Sr. No.","Work Description","Unit","Qty","Rate","Amount ( In Rs.)"]'::jsonb, '1. Payment Condition - Payment will be done once in month on submission of RA bill. RA shall be raised only for activity which is 100% Complete
    2. Payment Stages - Payment Will be done as per Running Bill Submitted after work Completion 5% Will be kept as Retention and will be paid after 12 months of total work compltioned.
    3. All Bill Shall be approved by Site Engineer before submission to account dept.
    4. All work shall be done as per Standard Quality. If quality is found unsatisfactory, client reserves the right to give Debit for the same or same work is to be done without any additional cost.', '1. Above Given Rate mentioned is for labour with material all inclusive.Tax will be additional as applicable
    2. On Site Measurement Will be taken for finalisation of the Quantity
    3. All work shall be done in proper Line, Level & Surface should not have any undulation
    4. It will be agency''s responsibility to clean entire floor/Surfaces everyday once the work is completed
    5. Light & Water will be provided at Single Point on Ground Floor, Further distribution will be in agency''s scope
    6. All the application will be done at a time when scaffolding is arranged by contractor at construction site .
    7. Material will be routed through Authorized Dealer of Material Supplier Co.
    8. Proper colouring on pipe and surface of duct to be done by contractor .
    9. All of the above work will be completed as per the PIS (Product Information Sheet) for optimum result.
    10. Three site Visit will be done by Company’s Technologist, periodically to help the client with providing optimum result.
    11. Application rate for any other material will be quoted separately.
    12. Client will provide place for stocking of material and accommodation place will be provided ,arrangement of rooms to be done by contractor.
    13. Water and Power Supply will be provided by Client free of cost on site.
    14. Measurement will be done according to prevailing market practices and same will be accepted by both the parties.
    15. Any Surface measure in width/lengths/height below 0.5 foot will be considered as running foot and will be charged at half rate of actual finalized product application rate.
    16. 3 warnings to be given regarding safety after that every instant 2000 Rs. Debit to be given.
    17. Cost of all Material Wastage is considered in the given rates, No additional Cost of Wastage to be given
    18. Bill to be paid only on 15th and 20th of every month and if bill to be submitted of previous month only, or it should be consider in next schedule.
    19. All Work comes under the BOCW Act,1996
    20. The PF Act shall be applicable to every person who has been employed by or by the Contractor or in any association with the work of the establishment.
    21. Delay in completion beyond the agreed schedule will attract a debit as decided by the client and adjusted against the final bill.
    22. Guarantee certificate to be provided by contractor on material provided companies latter head.', 'WO - 2026-010 SHIV FAB. ACSTAND AGASTYA.xlsx'),
      ('Colour Labour With Material Work', 'Putty Labour with Material', 'rate_based', '["Sr. No.","Work Description","Unit","Rate (Rs.)","Warranty Period"]'::jsonb, '1. Payment Condition - Payment will be done once in month on submission of RA bill. RA shall be raised only for activity which is 100% Complete
    2. Payment Stages - Payment Will be done as per Running Bill Submitted after work Completion 5% Will be kept as Retention and will be paid after 12 months of total work compltioned.
    3. All Bill Shall be approved by Site Engineer before submission to account dept.
    4. All work shall be done as per Standard Quality. If quality is found unsatisfactory, client reserves the right to give Debit for the same or same work is to be done without any additional cost.', '1. Above Given Rate mentioned is for labour with material all inclusive.Tax will be additional as applicable
    2. On Site Measurement Will be taken for finalisation of the Quantity
    3. All work shall be done in proper Line, Level & Surface should not have any undulation
    4. All Work shall be done within agreed timeline, incase of delay, debit of 2000/- Rs per day shall be charged
    5. It will be agency''s responsibility to clean entire floor/Surfaces everyday once the work is completed
    6. Light & Water will be provided at Single Point on Ground Floor, Further distribution will be in agency''s scope
    7. Cleaning of Colour spilled on other surfaces should be cleaned properly on regular basis.
    8. Painting work includes application of texture, primer and paint material.
    9. All the application will be done at a time when scaffolding is arranged by contractor at construction site .
    10. Material will be routed through Authorized Dealer of Material Supplier Co.
    11. Proper colouring on pipe and surface of duct to be done by contractor
    12. Material will be supplied directly from Co.’s warehouse after accepting quoted rates.
    13. All of the above work will be completed as per the PIS (Product Information Sheet) for optimum result.
    14. Three site Visit will be done by Company’s Technologist, periodically to help the client with providing optimum result.
    15. Application rate for any other material will be quoted separately.
    16. Client will provide place for stocking of material and accommodation place will be provided ,arrangement of rooms to be done by contractor.
    17. Water and Power Supply will be provided by Client free of cost on site.
    18. Surface protection cost for windows and hand rail installations will be in scope of contractor.
    19. Measurement will be done according to prevailing market practices and same will be accepted by both the parties.
    20. Any Surface measure in width/lengths/height below 0.5 foot will be considered as running foot and will be charged at half rate of actual finalized product application rate.
    21. Guarantee certificate to be provided by contractor on material provided companies latter head.
    22. All Work comes under the BOCW Act,1996
    23. The PF Act shall be applicable to every person who has been employed by or by the Contractor or in any association with the work of the establishment.
    24. Delay in completion beyond the agreed schedule will attract a debit as decided by the client of per Day and adjusted against the final bill.
    25. Process for Exterior paint Application. (1). Cutting of nails (khilas) from walls.(2).Checking and filing of cracks.(3).Washing entire building before colour work.(4).Texture Work.(5).Primer Work (6).Colour Work.', 'WO - 2026-02  Putty Labour with material Work order AMAYA.xlsx')
    ON CONFLICT DO NOTHING;

  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. work_orders: Agency link, WO type, template, lifecycle status, money
--    tracking (billed-to-date / remaining balance), scope-variance flag.
-- ----------------------------------------------------------------------------
ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS agency_id uuid REFERENCES public.site_agencies(id),
  ADD COLUMN IF NOT EXISTS activity_id uuid REFERENCES public.construction_activities(id),
  ADD COLUMN IF NOT EXISTS wo_type text NOT NULL DEFAULT 'fixed_scope' CHECK (wo_type IN ('fixed_scope','rate_based')),
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES public.wo_templates(id),
  ADD COLUMN IF NOT EXISTS issue_date date,
  ADD COLUMN IF NOT EXISTS wo_status text NOT NULL DEFAULT 'draft' CHECK (wo_status IN ('draft','issued','active','closed','cancelled')),
  ADD COLUMN IF NOT EXISTS billed_to_date numeric NOT NULL DEFAULT 0 CHECK (billed_to_date >= 0),
  ADD COLUMN IF NOT EXISTS has_scope_variance boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS variance_notes text;

-- remaining_balance can't be added inline with the others above because
-- generated columns can't be added via a single multi-column ADD COLUMN
-- batch together with a column (billed_to_date) they depend on in some PG
-- versions; keep it as its own statement for safety.
ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS remaining_balance numeric GENERATED ALWAYS AS (total_amount - billed_to_date) STORED;

CREATE INDEX IF NOT EXISTS idx_work_orders_agency ON public.work_orders(agency_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_activity ON public.work_orders(activity_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_template ON public.work_orders(template_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_wo_status ON public.work_orders(wo_status);

-- ----------------------------------------------------------------------------
-- 3. work_order_lines: actual executed scope, to detect the 100->120 sq ft
--    variance case independently of the planned quantity.
-- ----------------------------------------------------------------------------
ALTER TABLE public.work_order_lines
  ADD COLUMN IF NOT EXISTS executed_quantity numeric CHECK (executed_quantity IS NULL OR executed_quantity >= 0);

-- ----------------------------------------------------------------------------
-- 4. service_bills: link to the activity/QC-inspection being billed, so bill
--    acceptance can be gated on that activity's QC result.
-- ----------------------------------------------------------------------------
ALTER TABLE public.service_bills
  ADD COLUMN IF NOT EXISTS activity_id uuid REFERENCES public.construction_activities(id),
  ADD COLUMN IF NOT EXISTS qc_inspection_id uuid REFERENCES public.qc_inspections(id);

CREATE INDEX IF NOT EXISTS idx_service_bills_activity ON public.service_bills(activity_id);
CREATE INDEX IF NOT EXISTS idx_service_bills_qc_inspection ON public.service_bills(qc_inspection_id);

-- ----------------------------------------------------------------------------
-- 5. dpr_activity_lines: the missing FK the client flagged -- "Agency name
--    entered in DPR should resolve to the same agency record used in WO"
--    (site_agencies is that shared, growing list; agency_name stays as a
--    legacy/display fallback for older rows that only ever had free text).
-- ----------------------------------------------------------------------------
ALTER TABLE public.dpr_activity_lines
  DROP CONSTRAINT IF EXISTS dpr_activity_lines_agency_id_fkey;

ALTER TABLE public.dpr_activity_lines
  ADD CONSTRAINT dpr_activity_lines_agency_id_fkey
  FOREIGN KEY (agency_id) REFERENCES public.site_agencies(id);

-- ----------------------------------------------------------------------------
-- 6. Business rule: "No WO, no bill." A service bill must reference a Work
--    Order that is issued/active. This is the hard DB-level backstop; the
--    app layer also validates up front for a friendlier error message.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_service_bill_require_active_wo()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_wo_status text;
BEGIN
  IF NEW.work_order_id IS NULL THEN
    RAISE EXCEPTION 'A service bill must reference a Work Order (no WO, no bill).';
  END IF;

  SELECT wo_status INTO v_wo_status FROM public.work_orders WHERE id = NEW.work_order_id;

  IF v_wo_status IS NULL THEN
    RAISE EXCEPTION 'Linked Work Order % does not exist.', NEW.work_order_id;
  END IF;

  IF v_wo_status NOT IN ('issued','active') THEN
    RAISE EXCEPTION 'Work Order is % — bills can only be raised against an issued or active Work Order.', v_wo_status;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_service_bill_require_active_wo ON public.service_bills;
CREATE TRIGGER trg_service_bill_require_active_wo
  BEFORE INSERT OR UPDATE OF work_order_id ON public.service_bills
  FOR EACH ROW EXECUTE FUNCTION public.fn_service_bill_require_active_wo();

-- ----------------------------------------------------------------------------
-- 7. Business rule: "QC gates bill acceptance." A bill can't move to
--    'approved' until QC on the linked activity has passed.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_service_bill_qc_gate()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_qc_ok boolean;
BEGIN
  IF NEW.status IS DISTINCT FROM 'approved' THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'approved' THEN
    RETURN NEW; -- already approved, nothing to re-check
  END IF;
  IF NEW.activity_id IS NULL AND NEW.qc_inspection_id IS NULL THEN
    RETURN NEW; -- no linked activity/inspection to gate on
  END IF;

  IF NEW.qc_inspection_id IS NOT NULL THEN
    SELECT status::text IN ('accepted','partially_accepted') INTO v_qc_ok
    FROM public.qc_inspections WHERE id = NEW.qc_inspection_id;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.qc_inspections
      WHERE activity_id = NEW.activity_id
        AND status::text IN ('accepted','partially_accepted')
      ORDER BY inspection_date DESC LIMIT 1
    ) INTO v_qc_ok;
  END IF;

  IF NOT COALESCE(v_qc_ok, false) THEN
    RAISE EXCEPTION 'QC has not passed for this activity — the bill cannot be approved until QC is accepted.';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_service_bill_qc_gate ON public.service_bills;
CREATE TRIGGER trg_service_bill_qc_gate
  BEFORE UPDATE OF status ON public.service_bills
  FOR EACH ROW EXECUTE FUNCTION public.fn_service_bill_qc_gate();

-- ----------------------------------------------------------------------------
-- 8. Business rule: RA bills draw down the WO balance. billed_to_date is the
--    sum of every non-rejected service bill against the WO; remaining_balance
--    (a generated column) updates for free.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_recompute_wo_billed_to_date(p_work_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_total numeric;
BEGIN
  IF p_work_order_id IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(total_amount), 0) INTO v_total
  FROM public.service_bills
  WHERE work_order_id = p_work_order_id
    AND status <> 'rejected';

  UPDATE public.work_orders
  SET billed_to_date = v_total,
      updated_at = now()
  WHERE id = p_work_order_id;
END $$;

CREATE OR REPLACE FUNCTION public.fn_service_bill_wo_balance()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.fn_recompute_wo_billed_to_date(OLD.work_order_id);
    RETURN OLD;
  END IF;

  PERFORM public.fn_recompute_wo_billed_to_date(NEW.work_order_id);
  IF TG_OP = 'UPDATE' AND OLD.work_order_id IS DISTINCT FROM NEW.work_order_id THEN
    PERFORM public.fn_recompute_wo_billed_to_date(OLD.work_order_id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_service_bill_wo_balance ON public.service_bills;
CREATE TRIGGER trg_service_bill_wo_balance
  AFTER INSERT OR UPDATE OR DELETE ON public.service_bills
  FOR EACH ROW EXECUTE FUNCTION public.fn_service_bill_wo_balance();

-- ----------------------------------------------------------------------------
-- 9. Business rule: scope-overrun variance feeds the SAME alert mechanism as
--    budget overruns (budget_alerts), not a separate one.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_wo_line_variance_alert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_wo record;
  v_overrun_percent numeric;
BEGIN
  IF NEW.executed_quantity IS NULL OR NEW.quantity IS NULL OR NEW.quantity = 0 THEN
    RETURN NEW;
  END IF;

  v_overrun_percent := ((NEW.executed_quantity - NEW.quantity) / NEW.quantity) * 100;

  IF v_overrun_percent <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_wo FROM public.work_orders WHERE id = NEW.work_order_id;
  IF v_wo.id IS NULL OR v_wo.wo_type <> 'fixed_scope' THEN
    RETURN NEW; -- rate-based WOs have no planned quantity to overrun
  END IF;

  UPDATE public.work_orders
  SET has_scope_variance = true,
      variance_notes = 'Line "' || left(NEW.description, 80) || '" executed ' || NEW.executed_quantity::text
                        || ' vs planned ' || NEW.quantity::text || ' (' || round(v_overrun_percent, 1)::text || '% over).',
      updated_at = now()
  WHERE id = v_wo.id;

  INSERT INTO public.budget_alerts (
    project_id, budget_allocation_id, alert_type, threshold_percent, actual_percent,
    message, severity
  ) VALUES (
    v_wo.project_id, v_wo.budget_allocation_id, 'scope_overrun', 0, v_overrun_percent,
    'Work Order ' || COALESCE(v_wo.work_order_number, v_wo.id::text) || ': executed scope exceeds planned scope by '
      || round(v_overrun_percent, 1)::text || '% on line "' || left(NEW.description, 80) || '".',
    CASE WHEN v_overrun_percent >= 20 THEN 'critical' WHEN v_overrun_percent >= 10 THEN 'overrun' ELSE 'warning' END
  );

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_wo_line_variance_alert ON public.work_order_lines;
CREATE TRIGGER trg_wo_line_variance_alert
  AFTER UPDATE OF executed_quantity ON public.work_order_lines
  FOR EACH ROW
  WHEN (NEW.executed_quantity IS DISTINCT FROM OLD.executed_quantity)
  EXECUTE FUNCTION public.fn_wo_line_variance_alert();

-- ----------------------------------------------------------------------------
-- 10. Business rule: notify accounts the moment a bill is raised against a WO.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_service_bill_notify_accounts()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_wo public.work_orders;
BEGIN
  SELECT * INTO v_wo FROM public.work_orders WHERE id = NEW.work_order_id;

  INSERT INTO public.notifications (
    project_id, recipient_id, title, message, notification_type,
    priority, entity_table, entity_id, action_url
  )
  SELECT
    NEW.project_id,
    p.id,
    'Service bill raised',
    'Bill ' || NEW.bill_number || ' for ' || to_char(NEW.total_amount, 'FM99,99,99,999') ||
      ' has been raised against Work Order ' || COALESCE(v_wo.work_order_number, NEW.work_order_id::text) || '.',
    'service_bill_raised',
    'high'::erp_priority,
    'service_bills',
    NEW.id,
    '/service-bills?bill=' || NEW.id::text
  FROM public.profiles p
  WHERE p.is_active
    AND p.role IN ('upper_management', 'project_manager')
    AND (p.role = 'upper_management' OR p.project_id = NEW.project_id);

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_service_bill_notify_accounts ON public.service_bills;
CREATE TRIGGER trg_service_bill_notify_accounts
  AFTER INSERT ON public.service_bills
  FOR EACH ROW EXECUTE FUNCTION public.fn_service_bill_notify_accounts();

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
