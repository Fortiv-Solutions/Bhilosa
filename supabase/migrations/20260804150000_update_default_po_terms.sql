-- Migration: Update default Purchase Order Terms and Conditions in Supabase
-- Target Table: purchase_orders (column: terms_and_conditions)

-- 1. Ensure terms_and_conditions column exists with TEXT type
ALTER TABLE purchase_orders 
  ADD COLUMN IF NOT EXISTS terms_and_conditions TEXT;

-- 2. Set default column value to 17 Detailed Commercial & Legal Clauses with generous line spacing
ALTER TABLE purchase_orders 
  ALTER COLUMN terms_and_conditions SET DEFAULT 'PO Terms 1:-  This is a Contract for Pramukh Group and/or any its affiliates, subsidiaries and/or group companies. Vendor agrees that it shall at all times recognize the validity and ownership of Pramukh and/or any of its affiliates, subsidiaries and/or group companies, as the case may be, over the intellectual property rights and shall not at any time put in issue their validity or ownership.

1. PRELIMINARY
1.1 This is a Contract for execution of job/Supply as required and specified at the time of Enquiry.
1.2 The Enquirer for the above mentioned supply is the company/ proprietary concern/individual.
1.3 The terms and conditions mentioned hereunder are the terms and conditions of the Contract for the execution of the job mentioned under item 1.1 above.

2. REFERENCE FOR DOCUMENTATION
Purchase Order number must appear on order confirmation, correspondence, drawings, invoices, shipping notes, packings and on any documents or papers connected with the order.

3. CONFIRMATION OF ORDER
The Vendor shall acknowledge the receipt of the Purchase Order within ten days following the mailing of this order and shall thereby confirm his acceptance of this Purchase Order in its entirety without exceptions. The acknowledgment will bear on both purchase order and General Procurement Conditions.

4. WEIGHTS AND MEASUREMENTS
a. All weights and measurements recorded by the Organisation on receipt of goods at site will be treated as final.
b. Vendor''s shipping documents and invoices must contain the following data:
   i. Unit net weight
   ii. Unit gross weight (packing included)
   iii. Dimensions of packing.

5. PACKING AND MARKING
The Materials shall be suitably packed for safe transportation till receipt at site and should be commensurate with best possible practices of packing, unless specifically stipulated in the Technical specifications, to avoid any damage during transit.

6. CONTROL REGULATIONS
The supply, dispatch and delivery of goods shall be arranged by the Vendor in strict conformity with the statutory regulations including provision of Industries (Development and Regulation) Act 1951 and any amendment thereof as applicable from time to time. The Organisation disowns any responsibility for any irregularity or contravention of any of the statutory regulations in manufacture or supply of the stores covered by this order.

7. RESPECT FOR DELIVERY DATES
Time of delivery as mentioned in the Purchase Order shall be the essence of the contract and no variation shall be permitted except with prior authorization in writing from the Organisation. Goods should be delivered securely packed and in good order and condition at the place and within the time specified in the Purchase Order for their delivery.

8. DELAYS DUE TO FORCE MAJEURE
A) Any delay in or failure of the performance of either part hereto shall not constitute default hereunder or give rise to any claims for damage, if any, to the extent such delays or failure of performance is caused by occurrences such as Acts of God or an enemy, expropriation or confiscation of facilities by Government authorities, acts of war, rebellion, sabotage or fires, floods, explosions, riots, or strikes. The Contractor shall keep records of the circumstances referred to above and bring these to the notice of the Project-in Charge/Site-in-Charge in writing immediately on such occurrences. The amount of time, if any, lost on any of these counts shall not be counted for the Contract period. Once decision of the Owner arrived at after consultation with the Contractor, shall be final and binding. Such a determined period of time be extended by the Owner to enable the Contractor to complete the job within such extended period of time.
B) If Contractor is prevented or delayed from the performing any of its obligations under this Agreement by Force Majeure, then Contractor shall notify Owner the circumstances constituting the Force Majeure and the obligations performance of which is thereby delayed or prevented, within seven days of the occurrence of the events.

9. REJECTION, REMOVAL OF REJECTED GOODS AND REPLACEMENT
A) In case the testing and inspection at any stage by Inspectors reveal the equipment, material and workmanship do not comply with specification and requirements, the same shall be removed by the Vendor at their / its own expense and risk within the time allowed by the Organisation.
B) The Vendor will have to proceed with the replacement of that equipment or part of equipment without claiming any extra payment if so required by the Organisation. The time taken for replacement in such event will not be added to the contractual delivery period.

10. TAXES & DUTIES
A) GST (CGST, SGST, IGST as applicable), Customs Duty and applicable Cess as applicable shall be reimbursed for the materials consigned to Organisation as per limits indicated in the offer against documentary evidence to be furnished by the Supplier. Organisation shall pay only those taxes, duties and levies as indicated by Supplier at the time of bid submission/as agreed subsequently.(prior to opening of priced bids).
B) The Vendor shall comply with all the provisions of the GST Act / Rules / requirements like providing of tax invoices, payment of taxes to the authorities within the due dates, filing of returns within the due dates etc. to enable Pramukh Group to take Input Tax Credit.

11. JURISDICTION
The Vendor hereby agrees that the Courts situated in location of Organisation address and shall have the jurisdiction to hear and determine all actions and proceedings arising out of this contract.

12. PAYMENT TERMS
Payment will be released, subject to Tax - Invoice uploaded on GST portal before payment due date.

13. LATE DELIVERY CLAUSE
Penalty would be charged from 1% - 10% per week OR as per management decision if delivery would be done after due date OR schedule date given by site.

14. TAX DEDUCTION AT SOURCE TO BE MADE U/S. 194Q FROM THE PURCHASE OF GOODS FROM YOU
As you are aware that w.e.f 1ST July, 2021, the provisions of Section 194Q for withholding of Tax at 0.10% on the value of purchase of goods are applicable. In view of the same, we shall deduct the required TDS at 0.10% from the value of purchase of goods from you. We are the purchasers who satisfies the conditions laid down in Section 194Q and hence we are required to deduct TDS from the value of Purchases from you at the applicable rates. Since we are liable to deduct TDS U/S. 194Q, you being the seller of goods , are not required to make TCS U/S. 206C(1H) at 0.10%. Hence please do not charge any TCS on your purchase Invoice in response to this PO. The rate of Withholding of tax U/S. 194Q shall be subject to the amendments made from time to time.

NOTE : Moreover, please confirm whether you have filed the Income Tax Returns for A.Y. 2019-2020 and A.Y. 2020-2021 along with the acceptance of this PO with copy of the acknowledgement / screen shot from the Income tax website. In the absence of such confirmation, we shall presume that you have not filed your Income tax returns for the required two years and therefore, the withholding of tax shall be made at higher rate of 5% from the value of purchase of goods from you which shall not be refunded nor adjusted in subsequent billing against this PO or any other PO. If you have already submitted the required details of the Income Tax Returns with us, please ignore this note.

15. GUARANTEE / WARRANTY
Under RERA act minimum 5 years from the date of possession for material or workmanship.

16. DELIVERY DATE
As per site Schedule and mentioned in PO.

17. PRICE BASIS
DAP at Site, Freight included.';

-- 3. Update existing records with short placeholder terms to full detailed terms
UPDATE purchase_orders 
SET terms_and_conditions = (SELECT column_default FROM information_schema.columns WHERE table_name = 'purchase_orders' AND column_name = 'terms_and_conditions')
WHERE terms_and_conditions IS NULL 
   OR terms_and_conditions = '' 
   OR length(terms_and_conditions) < 100;
