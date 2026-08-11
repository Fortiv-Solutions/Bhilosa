# Work Order Module — Corpus Analysis & Target Design

**Date:** 2026-08-08
**Corpus:** 13 Work Orders (`workorders/`) + 29 Payment Certificate workbooks containing 149 certificate sheets (`PC/`)
**Status:** Analysis and design recommendation. Nothing implemented.

---

## 1. What was analysed

Every sheet of every workbook was extracted cell-by-cell (including merged ranges) and
cross-tabulated. All counts below are measured, not estimated.

| Corpus | Files | Sheets | Notes |
|---|---|---|---|
| Work Orders | 13 | 15 | 2 files carry a second sheet (tower→contractor allocation matrix) |
| Payment Certificates | 29 | 149 certificates | one Excel tab per RA bill; 3 blank filler sheets |

Projects spanned: Pramukh Amaya, Pramukh Revanta, Agastya, Aranya 2.
Issuing entities seen: **Amaya Corporation** (on Work Orders) and **Tanvi Infracon** (on Payment
Certificates) — two different legal entities, both hardcoded as free text.

---

## 2. The four template families

The 13 Work Orders are not one format. They are four incompatible ones, and the difference is
**commercial**, not cosmetic — it changes what the contract value *means*.

### Family A — Lump-sum, per-unit-of-output, activities bundled (2 docs)
`W.O.-2 Plumbing (Deepakbhai)`, `W.O.-3 Plumbing (Salaudin)`

One line item priced per flat. Real contract value (Rs 79.56 L / Rs 46.50 L).
Description bundles **nine** distinct activities into a single string.

### Family B — Rate-only placeholder (8 docs)
Lift Partition ×2, GI Railing ×2, Exterior Louvers ×2, Cable Tray, AC Stand

`Qty = 1`, and the printed **contract value is literally the unit rate**:

| Work Order | Unit | Rate | Printed "Total" | "Total in Words" |
|---|---|---|---|---|
| Lift Partition (Balmukund) | Sqft | 85 | **Rs 85** | Eighty Five Only |
| Lift Partition (Ambika) | Sqft | 85 | **Rs 85** | Eighty Five Only |
| GI Railing (Ambika) | Rft | 655 | **Rs 655** | *Six Hundred Only* ❌ |
| GI Railing (Modern Fab) | Rft | 675 | **Rs 675** | Six Hundred Seventy Five Only |
| Louvers ABCD (Metsil) | Sq.ft | 115 | **Rs 115** | One Hundred Fifteen Only |
| Louvers E–P (Metsil) | Sq.ft | 120 | **Rs 120** | One Hundred Twenty Only |
| Cable Tray (Modern Fab) | Rft | 675 | **Rs 675** | Six Hundred Seventy Five Only |
| AC Stand (Shiv Fab) | KG | 115 | **Rs 115** | One Hundred Fifteen Rupees Only |

**62% of the corpus has no contract value at all.** Quantity is deferred to
*"(Total Measurement As Per Site)"* / *"On Site Measurement Will be taken for finalisation of the
Quantity"*. The Louvers WO points at *"Attached Quotation"* for quantities — a document that is not
part of the Work Order and is not in the corpus.

> **ERP consequence:** `work_orders.total_amount` = 85 for these. `remaining_balance =
> total_amount - billed_to_date` goes negative on the first bill. Stage 3 treasury, Stage 4 ceiling
> enforcement, and every budget-commitment posting are computing against a unit rate.

### Family C — Pure schedule of rates, no quantity, no total (1 doc)
`WO-08 Colour Labour with material (SRM Surface Coating)`

21 rate lines, columns are `Unit | Rate | Warranty Period`. No Qty column, no Amount column, no
total. A rate card, correctly recognised as such — but with no ceiling and no BOQ.
It is the only document carrying a **warranty column** (10-year paint performance, 10-year
waterproofing).

### Family D — Supply + install, itemised (1 doc)
`AC Installation Work`

5 lines with genuine qty × rate = amount, Rs 2,20,300 total. The only Work Order that behaves like
a conventional purchase-style contract. Also the only one whose columns are mislabelled: header
reads `Unit | Qty` but column C holds `1` on every row while column D holds the real count.

*(`W.O.-5 Kitchen T-Angle` sits between B and D: firm qty 1300 Nos × Rs 400 = Rs 5,20,000, yet still
prints "(Total Measurement As Per Site)" — a firm quantity and a re-measurement clause on the same
line.)*

---

## 3. How Work Descriptions are written

### 3.1 The bundling problem — measured

The plumbing Work Order's single description:

> *"Total Plumbing Work — Inlet Fitting, Internal Drainage Line, External Vertical Line upto First
> Basement Slab, Terrace Looping, Balcony Drain Line, AC Drain Line, UGT to OHWT Connection, C.P &
> Sanitary Fitting, Sunk Water Proofing (Toilet, Wash and Balcony Area) — 3 BHK Flats (C-D, G Tower)"*

That one cell contains **five different kinds of data**:

| Data | Example | Belongs in |
|---|---|---|
| Activity list (×9) | Inlet Fitting, Internal Drainage… | 9 scope lines |
| Unit-of-output type | 3 BHK / 2 BHK | a scope-group attribute |
| Location | C-D Tower, G Tower | a scope-group attribute |
| Scope boundary | "upto First Basement Slab" | line specification |
| Included sub-scope | (Toilet, Wash and Balcony Area) | line specification |

**It reconciles with nothing.** Nine activities in the description, seven payment stages in the
Terms & Conditions:

- Activities with **no payment stage** (so they can never be billed on their own): `Balcony Drain
  Line`, `AC Drain Line`, `UGT to OHWT Connection`
- Stage with **no matching activity name**: `CP Fitting Work` (the description says "C.P & Sanitary
  Fitting" as one item; the stages split it into two at 7.5% each)
- `Water Proofing Work` (stage) vs `Sunk Water Proofing` (activity) — same thing, two names

### 3.2 Specifications leak into the description
Family B puts specs in unnumbered rows *underneath* the line, with Qty/Rate/Amount vertically
merged across the whole block:

```
1 | Providing and fixing of G.I. Railing … Railing Height 3'6"   Rft | 1 | 655 | 655
  | Top Pipe Living : 40 X 80 X 1.6mm          ← spec, not scope
  | Post Pipe : 32 X 32 X 1.6mm                ← spec, not scope
  | Fastener : Mungo/Fischer 10 X 120mm        ← spec, not scope
```

These are attributes of one line. Any naive import reads seven extra scope rows with null amounts.

### 3.3 Product/brand is embedded in prose
The colour WO encodes product, coats and process inside the description:
*"1 Coat Exterior Acrylic Primer with 2 Coats of Exterior Emulsion — Birla Opus E-10 Primer with
Birla Opus E-70 Exterior Emulsion (Surface Washing n Cleaning + Crack filling + Application of 1
coat Primer + Application of 2 Coats of Ext Emulsion)"*.
Brand, system, coat count, and the method statement are one unsearchable string.

### 3.4 The allocation matrix lives outside the Work Order
Both plumbing files carry a hidden second sheet mapping Tower → Contractor → flat count
(A-B→Deepak→48, C-D→Salaudin→48, …, total 664 flats across 4 contractors). This is the real work
breakdown, and it exists nowhere in the contract document.

---

## 4. How Terms & Conditions are structured

Free prose, numbered 1..N, 10–33 clauses per document, retyped every time.

**Measured across the 13 documents:** 73 distinct clause texts; **only 10 appear in a single
document**. 86% is shared boilerplate being retyped.

| Appears in | Clause |
|---|---|
| 13/13 | Standard quality; client may debit or demand re-work |
| 10/13 | All work comes under the BOCW Act, 1996 |
| 10/13 | PF Act applicability |
| 9/13 | 3 safety warnings, then Rs 2000 debit per instance |
| 9/13 | Material wastage included in rate |
| 7/13 | Bills approved by Site Engineer before submission **to account dept.** |
| 6/13 | Bills approved by Site Engineer before submission *(same rule, different text)* |
| 6/13 | Bill paid only on 15th and 20th of every month |
| 6/13 | Delay debit "as decided by the client" |

Consequences observed:

- **The same rule exists as two clause texts** (site-engineer approval, 7 + 6). Any text-based
  dedupe splits one obligation into two.
- **Duplicates inside a single document.** Both Louvers WOs state "Contractor has to provide labour
  insurance before starting the work" at #10 *and* #25, "accident responsibility" at #13 *and* #26,
  "3 safety warnings" at #15 *and* #28.
- **Typos are propagated by copy-paste**: *"apllicable"*, *"compltioned"*, *"disposeed"*,
  *"Adavance"*, *"considerd"*.
- **Financially material terms are buried as prose** and therefore never enforced (§5, §6).

### Commercial terms are inconsistent across the corpus

| Term | Variants observed |
|---|---|
| **GST** | "GST incl." / "GST is included" (3) · "GST is extra as applicable" (8) · "Tax as applicable" (2, ambiguous) |
| **Retention** | 5% no release period (2) · 5% released 12 months after completion (5) · 10% released 12 months (2) · **not mentioned at all (4)** |
| **Payment** | 100% after 30 days of bill submission · 100% on completion · 15 days after RA receipt · monthly on RA submission · 50% advance + 50% on completion |
| **Billing window** | 1st–5th · 15th & 25th · 15th & 20th · not stated |
| **Delay debit** | Rs 500/day · Rs 1500/day · Rs 2000/day · **"as decided by the client"** (5, unquantified) |
| **Advance** | 50% (Louvers only) — with **no recovery schedule stated** |
| **Variation tolerance** | ±5% (Louvers only) |
| **Warranty** | 10-yr paint · 10-yr waterproofing · 1-yr defect + 1-yr service · guarantee certificate on letterhead |

Both plumbing Work Orders carry a `GST 18%` row that computes **0** and a `Grand Total` row that is
**blank** — so the Rs 79.56 L figure is pre-tax while the header says "Tax as applicable".

---

## 5. How Payment Stages are defined

**They are Terms & Conditions clause #3.** Not a table, not a column — a line of prose with embedded
newlines:

```
Payment Stages -
  Inlet Fitting Work - 20%
  Internal Drainage Line Work - 10%
  Water Proofing Work - 25%
  External Vertical Line Work - 20%
  Terrace Looping Work - 10%
  CP Fitting Work - 7.5%
  Sanitary Fitting Work - 7.5%
```

Only the two plumbing Work Orders define real stages. The other five that have a "Payment Stages"
clause say the same non-stage sentence:

> *"Payment Will be done as per Running Bill Submitted after work Completion. 5% Will be kept as
> Retention and will be paid after 12 months of total work compltioned."*

— a retention rule filed under the heading "Payment Stages". So the field label is not even reliable.

### What happens downstream — the smoking gun

`Salauddin Payment Certificate.xlsx`, sheet 1, item lines:

| Item as typed | % of Work Completed | Qty | Rate | Amount |
|---|---|---|---|---|
| Toilet, Kitchen, Wash area Inlet Fitting **(20%)** (1st Floor) | 1 | 2 Flat | 6,380 | 12,760 |
| …Internal Drainage Work **(10%)** (1st Floor) | 1 | 2 Flat | 3,190 | 6,380 |
| …Waterproofing and PCC work **(25%)** (1st Floor) | 1 | 2 Flat | 7,975 | 15,950 |

Three separate failures on three rows:

1. **The stage percentage is typed into the item description string.** It is the only place the
   stage is recorded on the certificate.
2. **The stage rate is hand-derived.** 6,380 = 20% × 31,900. 3,190 = 10% × 31,900. 7,975 = 25% ×
   31,900. Someone multiplied by hand and typed the result. Every RA bill re-derives it.
3. **The implied base rate is Rs 31,900/flat — which appears in no Work Order.** WO-3 contracts
   Rs 33,500 (3BHK) and Rs 25,000 (2BHK). The certificate is billing a contract that is not in the
   corpus, and **nothing on the certificate says which contract it is** (see §6.1).

Had the ERP computed these from a Rs 33,500 contract, the stage rates would be
Rs 6,700 / 3,350 / 8,375 / 6,700 / 3,350 / 2,512.50 / 2,512.50.

---

## 6. The Payment Certificate side — what the Work Order defects cost

149 certificates measured.

### 6.1 Zero traceability to the contract
> **0 of 149 certificates reference a Work Order number.** There is no W.O. field on the template.

A certificate identifies itself by the *vendor's* invoice number only. There is no way, from the
document, to know which contract authorised the work, what rate was agreed, or what the ceiling is.

### 6.2 The progress column is dead
> `% of Work Completed` is populated on 603 lines. **Every single value is `1`.**

The one field designed to answer "how much is done" carries zero information. Actual progress is
communicated by writing "(1st Floor)" and "(20%)" into the description string.

### 6.3 Contractual deductions are silently skipped

| Deduction row | Present on | Actually filled |
|---|---|---|
| Retention | 149 | **7 (4.7%)** |
| Advance Payment | 149 | **1 (0.7%)** |
| Debit | 60 | **4** |

The Work Orders mandate 5–10% retention on **all RA bills**. It is applied on 4.7% of them. On
`Northern Star Bill-1`, retention is blank and `Balance Payment to be paid` equals the full
gross-plus-GST — the retention row is printed, left empty, and ignored by the total.

This is not a data-entry nicety. It is the largest quantifiable control gap in the corpus.

### 6.4 No running account
Only 1 of 149 sheets has any "previous" reference. There are no
`contract qty / cumulative / previous / this bill` columns. Cumulative figures are instead parked in
unlabelled stray cells outside the print area — `O14=2215163.77`, `P14=1365163.77`,
`K31=1293439.8`, `M15=66`. These are load-bearing numbers with no header.

### 6.5 Arithmetic and presentation
- No rounding anywhere: `232450.1948`, `1876360.788`, `1573.41` × `121` = `190382.61`.
- Amount-in-words is hand-typed and drifts: `1,876,360.788` → *"Eighteen Lakh Seventy Six Thousand
  Three Hundred **Sixty One** Only"*.
- GST is sometimes `CGST 9% + SGST 9%`, sometimes a single `GST @ 18%` row computing 0. No IGST
  handling, no place-of-supply logic.
- `TDS will be deducted as per applicable rules at your end` — TDS is never computed.

### 6.6 Vendor identity is two things at once
The template has both `Company Name` and `Vendor Name`. In practice:
`Vendor Name` = the **person** you call on site (Umeshbhai, Chimanbhai, Rajbhai).
`Company Name` = the **billing entity** that issues the GST invoice.

They diverge constantly:

- **14 of 29** workbooks are filed under a name that appears in no billing entity
  (`Denishbhai` → *Shiv Fabrication*, `Ketanbhai Grouting` → *Manek Enterprise*,
  `Manojbhai Road` → *NIJANAND CONSTRUCTION*, `Metallium Louvers` → *Drashya Interior*,
  `Punambhai` → *Anop Singh Deora*, `Raheman colour work` → *Abdullah Ibarahim*).
- **5 of 29** bill under two or three different legal entities within the same book
  (`Raffikbhai` → Firoj Gulambhai Bhatti / Sheth Vasimakram / Rafikbhai).
- One entity (`D.K. Alluminum & Fiber`) is tracked in **two separate workbooks**
  (`D.K. Alluminium & Fiber`, `Rupesh Ganesh`) — the same vendor, two running accounts.

This is the standard Indian sub-contracting pattern: one labour contractor invoices through
whichever registered firm is convenient. It must be modelled deliberately, not flattened.

### 6.7 Free-text everything
- Billed-to entity has **6 spellings**: `Tanvi Infracon`, `Tanvi Infracon - Revanta Project`,
  `Tanvi Infracon - Pramukh Revanta Project`, `Tanvi Infracon - Pramukh Revanta`,
  `Tanvi Infrcon, Revanta Project` (typo), `Tanvi Infracon - Aranya 2 Project`.
  Entity and project are concatenated into one string.
- `Type of Work` and `Type of Contract` are free text and frequently degenerate — on
  `Salauddin` sheet 12 both read `"Ground Floor"`.
- The same workbook mixes contract shapes: `Salauddin` sheet 1 is stage-percentage flat billing,
  sheet 12 is an itemised SoR bill (storm-water line, chambers, pipe fittings by diameter). Nothing
  distinguishes them.

---

## 7. Work Order numbering

| WO Number | Issued to | Collision |
|---|---|---|
| `AC/WO/25/6` | Ambika Metals *and* Balmukund Steel | ⚠️ same scope, same Rs 85 rate, two agencies |
| `AC/WO/2026/003` | Ambika Metal (Rs 655) *and* Modern Fab (Rs 675) | ⚠️ competing rates, one number |
| `AC/WO/2026/005` | Metsil (ABCD towers, Rs 115) *and* Metsil (E–P towers, Rs 120) | ⚠️ |

**3 collisions across 10 distinct numbers.** Format also drifts on every axis: prefix
(`AC/` `TI/` `TIPR/`), year (`24` `25` `2025` `2026`), sequence padding (`6` `06` `003` `008`).

> The pattern suggests these are rate-comparison drafts issued to competing agencies that were never
> renumbered on award — a governance gap, not just a formatting one.

---

## 8. Gap analysis against the ERP as built

The ERP substrate is **substantially further along than the documents**. Stages 1–5 already provide:

| Already built | Where |
|---|---|
| `wo_payment_stages` (sequence, name, percent, sums to 100 enforced) | Stage 5 |
| `wo_commercial_terms` (GST treatment, retention %, release months, advance %, recovery %, TDS %, payment terms, billing windows, delay/safety debits, variation tolerance, joint measurement) | Stage 5 |
| `measurement_sheets` + `measurement_sheet_items` (nos/L/W/H/deduction → generated `total_quantity`), status workflow | Stage 2 |
| `service_bill_lines` with `cumulative_quantity` / `previous_quantity` | Budget integration |
| `payment_certificate_view` (retention, advance, debit, TDS, net payable, previous/cumulative certified) | Stage 2 |
| `work_order_variations` + `work_order_variation_lines` + contract-immutability guards | Stage 4 |
| Atomic WO numbering `{PROJ}/WO/{YY}/{NNN}` via `document_number_sequences` | 20260807183000 |
| Rate-variance guard, over-measurement guard, ceiling enforcement | Stages 4–5 |
| `stage_percentage` / `floor_lead` valuation structures in the create modal | frontend |

**The design brief is therefore mostly "close the remaining gaps and enforce what exists", not
"build from zero".** The real gaps:

### Gap 1 — Terms & Conditions are still an unstructured blob
`frontend/src/lib/work-orders.ts` stores `terms_and_conditions` as one text field, assembled as
`[termsBaseline, termsCategory].join('\n\n')`. **The ERP reproduces the Excel defect.** There is no
clause library, no per-clause identity, no override tracking. `wo_commercial_terms` holds the
machine-readable values, but nothing renders the prose *from* them — so the two can disagree exactly
as they do today.

### Gap 2 — Stage decomposition is destructive
`rpc_generate_wo_stage_lines` (Stage 5) decomposes each base line into one line per stage and then
**deletes the base line**. Two problems:

- The contract *as signed* is destroyed. After generation there is no row representing
  "Rs 33,500/flat × 100 flats"; only seven derived rows.
- The correctness of the contract value depends on a `DELETE` succeeding. That is exactly the
  failure the open migration `20260807141000_fix_wo_line_immutable_delete_return.sql` repairs —
  a `BEFORE DELETE` trigger returning `NEW` (NULL) silently cancelled the delete, leaving base +
  stage lines and **doubling Rs 46.5 L to Rs 93 L**.

The fix is correct. The *design* that requires a destructive delete to stay arithmetically honest is
the fragility. Stages should be a **child table of the line**, not a replacement for it.

### Gap 3 — `work_order_lines` cannot hold what the documents contain
Current columns: `description, quantity, unit, rate, total_amount, executed_quantity`.
Missing: `activity_id` (canonical activity), `scope_group_id` (tower/floor/flat-type),
`specification`, `material_brand`, `location_ref`, `sequence_no`, `warranty_months`.
*(Stage 5's RPC already writes `specification`, `material_brand`, `payment_stage_id` — so these
exist by then; the base table in `current_schemma.sql` predates them. Confirm live state.)*

### Gap 4 — No rate-based ceiling on 62% of contracts
`wo_type = 'rate_based'` and `ceilingAmount` exist. But the source documents state no ceiling
anywhere, and the BOQ they reference ("Attached Quotation") is not modelled. Without a ceiling,
rate-based Work Orders have no budget commitment and no overrun detection.

### Gap 5 — Issuing entity is not modelled
Amaya Corporation vs Tanvi Infracon, 4+ address variants, 6 billed-to spellings. There is
`billing_address` and `gst_number` as free text on `work_orders`. It needs to be an entity master.

### Gap 6 — Agency ↔ billing entity is 1:1
`site_agencies` and `vendors` exist, but the corpus shows one site person mapping to 2–3 billing
entities over time. Needs an explicit link table with effective dates.

---

## 9. Recommended target design

### 9.1 Principle

> **Anything with financial or scheduling effect is a typed column. Prose is generated from the
> columns, never the other way round.**

Three corollaries, each aimed at a measured defect:

1. A description holds **one activity** and nothing else — no percentage, no location, no flat type,
   no stage name, no specification.
2. A term that moves money (retention, advance, GST, TDS, LD, tolerance) exists as a **field first**
   and as a printed clause **rendered from that field**. This is what makes the 4.7% retention
   application impossible to repeat.
3. A document that claims money **must** carry the contract reference that authorises it.

### 9.2 Layer 0 — Masters

| Master | Purpose | Fixes |
|---|---|---|
| `issuing_entities` | Amaya Corporation, Tanvi Infracon — name, GSTIN, address, logo, letterhead | §6.7 6 spellings, §2 4 address variants |
| `trades` | civil, plumbing, electrical, painting, fabrication, waterproofing, fire-fighting, aluminium/glass, gypsum, flooring, HVAC | §9.7 |
| `uom_master` | canonical + aliases: `Sqft`≡`Sq.ft`, `Rft`≡`R.ft.`, `R.mt.`, `Nos`≡`Nos.`, `KG`, `Flat`, `Lot` | free-text units |
| `activity_master` | per trade: canonical activity, default UoM, default spec template. *"Inlet Fitting"*, *"Internal Drainage Line"*, *"Sunk Water Proofing"* | §3.1 bundling, §5 stage↔activity mismatch |
| `clause_library` | every T&C as a versioned row | §4 |
| `stage_set_library` | named reusable stage presets per trade | §5 |
| `agency_billing_entities` | agency (person) ⇄ vendor (GST entity), effective-dated, many-to-many | §6.6 |

### 9.3 Layer 1 — The contract header

Extend `work_orders`:

- `issuing_entity_id` → replaces hardcoded letterhead
- `contract_basis` enum — **replaces the overloaded `wo_type`**:
  - `lump_sum` — fixed price, fixed scope (Family D)
  - `item_rate` — firm quantities, re-measurable at contract rates (Kitchen T-Angle)
  - `schedule_of_rates` — rate card, quantity unknown, **`ceiling_value` mandatory** (Families B & C)
  - `percentage_stage` — priced per unit-of-output, released by stage % (Family A)
- `estimated_value` / `contract_value` / `ceiling_value` as three distinct numbers.
  For `schedule_of_rates`, `contract_value` is **null**, not Rs 85.
- `quotation_ref`, `quotation_date`, `boq_attachment_id` — the "Attached Quotation" becomes a
  first-class linked document
- Numbering: keep the existing atomic sequence; add the entity dimension →
  `{ENTITY}/{PROJ}/WO/{FY}/{NNN}`

### 9.4 Layer 2 — Scope (fixes bundled descriptions)

```
work_orders
└── wo_scope_groups          -- optional: Tower A-B · 3 BHK · Floors 1-12
    └── work_order_lines     -- ONE activity each, FK → activity_master
        ├── wo_line_specifications   -- the GI pipe sizes / paint system / coats
        └── wo_line_stages           -- % release per stage (see 9.5)
```

`wo_scope_groups` carries `group_type` (tower / building / floor / flat_type / block / zone),
`label`, `unit_count`. It absorbs *"3 BHK Flats (C-D, G Tower)"* **and** replaces the hidden
allocation matrix sheet.

`work_order_lines` gains `activity_id`, `scope_group_id`, `sequence_no`, `location_ref`,
`specification`, `material_brand`, `warranty_months`, `is_provisional`.

The plumbing Work Order becomes: 2 scope groups × 9 activity lines — not one 400-character string.

### 9.5 Layer 3 — Payment stages as first-class (out of Terms & Conditions)

Extend `wo_payment_stages` with:

- `activity_id` — **binds the stage to the canonical activity**, so `Water Proofing Work` the stage
  and `Sunk Water Proofing` the activity are provably the same thing. This is what makes the 9-vs-7
  mismatch a **validation error at draft time** instead of a discovery at billing time.
- `trigger_type`: `activity_completion` | `milestone_event` | `time_based` | `advance` | `on_delivery`
- `applies_to`: all lines / a scope group / a specific line
- `is_advance`, `advance_recovery_percent`
- `requires_qc_pass`, `requires_joint_measurement`, `evidence_required`

**Replace destructive decomposition with a matrix.** New child table:

```
wo_line_stages (work_order_line_id, payment_stage_id, stage_percent, stage_value)
```

- The **base line survives** as the contractual truth. Contract value = Σ base lines. Structurally
  impossible to double-count — no `DELETE` in the critical path (closes Gap 2).
- Stage value is **computed**: `33,500 × 20% = 6,700`. Never typed (closes §5 defect 2).
- The printed Work Order can render either the contract view or the stage-release view.
- Measurement measures the **activity**; the RA bill claims the **stage**.

Add a draft-time validator: every scope line must be covered by stages summing to 100%, and every
stage must resolve to a line. The plumbing Work Order would fail today, correctly.

### 9.6 Layer 4 — Progress, milestones, payment eligibility

One derived view answers all four of your questions:

```
wo_billable_position  (work_order_id, line_id, stage_id) →
    contracted_qty · contracted_value
    measured_qty   (from approved measurement sheets)
    certified_qty · certified_value
    previously_billed_value
    claimable_now_value
    retention_held · balance_to_bill
    stage_status · blocking_reason
```

| Your question | Answered by |
|---|---|
| Which milestone is complete? | `stage_status` ∈ not_started / in_progress / measured / certified / billed / paid |
| What % of work is executed? | `measured_qty / contracted_qty` per line; value-weighted roll-up per WO |
| Which payment stage is due? | rows where `stage_status = certified` **and** `previously_billed_value = 0` |
| Where is it recorded? | **the measurement sheet — the only entry point.** Nothing else may create progress. |

`blocking_reason` is what makes this operationally useful: *"QC inspection not passed"*, *"joint
measurement pending"*, *"prior stage not certified"*, *"ceiling would be breached"*.

### 9.7 Layer 5 — Document flow

```
Work Order  ──award──►  contracted qty · rate · stage %
     │
     ▼
Measurement Sheet   nos × L × W × H − deductions  →  measured quantity
     │              (already built, Stage 2 — keep as-is)
     ▼
RA Bill / Service Bill
     │   qty_this_bill = certified_cumulative − previously_certified
     │   rate  ← FROM THE CONTRACT, never typed  (rate-variance guard exists)
     │   gross = Σ qty × rate
     │   + GST   ← from wo_commercial_terms.gst_treatment / place of supply
     │   − retention        ← from terms.retention_percent      ⟵ was skipped on 95% of certificates
     │   − advance recovery ← from terms.advance_recovery_percent
     │   − debits (delay/safety/quality) ← computed from terms + logged events
     │   − TDS              ← from terms.tds_percent
     │   = net payable, rounded, with a round-off line
     ▼
Payment Certificate  — a RENDER of the RA bill, not a document you fill in
     │   carries WO number, RA sequence, contract value, cumulative position
     ▼
Treasury / Payment  →  retention ledger  →  release after N months
```

Every number on the certificate is derived. The only human inputs in the whole chain are
**measurements** and **approvals**.

Required additions:
- `wo_number` + `ra_sequence` on the printed certificate (closes §6.1 — 0/149)
- a **retention ledger** so held amounts accumulate per contract and release on schedule
- an **advance ledger** so 50% mobilisation recovers pro-rata across RA bills
- a `debit_events` table (delay days, safety warnings, quality rejections) so debits are traceable
  rather than negotiated
- generated amount-in-words and 2-decimal rounding with an explicit round-off line

### 9.8 Layer 6 — Terms & Conditions as a clause library

```
clause_library
  code · category · title · body_template ("Retention @ {{pct}}% … released after {{months}} months")
  applies_to_trades[] · applies_to_contract_basis[] · is_mandatory
  version · effective_from · supersedes_id

wo_clauses
  work_order_id · clause_id · sequence_no
  resolved_body · variable_values
  is_overridden · override_reason · approved_by
```

Rules:

1. **Clauses with financial effect are rendered from `wo_commercial_terms`.** Retention, advance,
   GST, TDS, LD, billing window, variation tolerance — the prose is *output*, so document and data
   cannot disagree.
2. **Pure-obligation clauses are library text** (BOCW Act, PF Act, labour insurance, hajri/pagar
   patrak, cleaning, scaffolding, safety warnings, material wastage). Deduplicate the 73 texts down
   to roughly 35 canonical clauses; merge the two site-engineer variants into one.
3. **Overrides are explicit and approved**, never a silent edit.
4. A **draft-time completeness check** blocks issue when a financially material term is unset —
   e.g. a `schedule_of_rates` contract with no ceiling, or a delay debit of "as decided by the
   client".

*(`wo_terms_completeness` validation already exists in Stage 5 — extend it rather than rebuild.)*

### 9.9 Trade standardisation — one structure, many shapes

A **template** (extend the existing `wo_templates`) binds:

```
trade + contract_basis
  → default activity set        (from activity_master)
  → default stage set           (from stage_set_library)
  → default clause set          (from clause_library)
  → default commercial terms    (retention %, GST, payment days, billing window)
  → column layout               (item_columns jsonb — already present)
```

| Trade | Typical basis | Stage set | Measurement unit |
|---|---|---|---|
| Plumbing (flat-wise) | `percentage_stage` | 7 stages, flat-wise | Flat |
| Painting / colour | `schedule_of_rates` | RA on measured area + retention | Sqft |
| Fabrication (railing, tray, AC stand) | `schedule_of_rates` | RA on measured qty | Rft / Kg / Sqft |
| Louvers / façade | `schedule_of_rates` + advance | 50% advance, balance on completion | Sq.ft |
| Fire-fighting | `item_rate` | supply / install / testing / commissioning | Nos / R.mt |
| Civil — compound wall, road | `item_rate` | RA on measured qty | Rmt / Sqm |
| AC supply + install | `lump_sum` | supply / install / commissioning | Nos |

Same tables throughout. What varies is which template is loaded — flexible where the trade differs,
rigid where money moves.

---

## 10. Suggested sequencing

| Phase | Work | Why first |
|---|---|---|
| **0** | Apply and verify the open Stage 1–5 migrations; confirm the `wo_line_immutable` delete fix is live | The Rs 46.5 L → Rs 93 L doubling is active until it is |
| **1** | Masters: `issuing_entities`, `uom_master`, `trades`, `activity_master`, `agency_billing_entities` | Everything else references them |
| **2** | `clause_library` + `wo_clauses`; render financial clauses from `wo_commercial_terms` | Highest ratio of risk removed to effort; closes Gap 1 |
| **3** | Scope restructure: `wo_scope_groups`, extend `work_order_lines`, `wo_line_specifications` | Unblocks per-activity tracking |
| **4** | `wo_line_stages` matrix; retire destructive `rpc_generate_wo_stage_lines`; add the 100%-coverage validator | Closes Gap 2 permanently |
| **5** | `wo_billable_position` view + the Work Order progress workspace | This is the screen that answers the four questions |
| **6** | Deduction engine: retention ledger, advance ledger, `debit_events`, TDS, rounding, words | Closes the 4.7% retention gap |
| **7** | Templates per trade; seed activity master and stage sets from this corpus | Makes correct data entry the easy path |
| **8** | Import the 13 Work Orders and 149 certificates as historical records | Backfill only after the model is proven |

---

## 11. Decisions needed before design freeze

1. **Rate-based ceilings.** 8 of 13 contracts have no value. Does a `schedule_of_rates` Work Order
   require a mandatory ceiling before issue, or may it be issued open-ended with a soft alert?
2. **Retention.** Enforce contractually (auto-deducted, non-overridable without approval), or
   advisory? Today it is applied on 4.7% of certificates — the answer changes cash position
   materially and retrospectively.
3. **Historical certificates.** Import all 149 as records, or start clean and keep the workbooks as
   an archive? The missing WO linkage means backfill needs a human to map each certificate to a
   contract.
4. **The two issuing entities.** Are Amaya Corporation and Tanvi Infracon separate books requiring
   separate numbering series and separate GST registers, or presentation variants of one book?
5. **Agency vs billing entity.** Is the Work Order awarded to the *person* (Deepakbhai) with the
   billing entity chosen per bill, or to the *legal entity* with a change requiring a new Work Order?
   The corpus does the former; the ERP currently assumes the latter.
6. **Stage-set governance.** May a site engineer define an ad-hoc stage split per Work Order, or only
   pick from an approved `stage_set_library`?
7. **Duplicate-number governance.** `AC/WO/2026/003` went to two agencies at different rates. Should
   competing drafts be a first-class "rate comparison" object that produces exactly one awarded Work
   Order?

---

## Appendix — extraction scripts

Reproducible dumps used for every count in this document:

- `dump_xlsx.py <folder> <out.txt>` — full cell-by-cell dump with merged-range annotation
- Aggregations: clause frequency, WO-number collisions, deduction fill rates, `% of Work Completed`
  value distribution, vendor-identity divergence

Written to `C:\Temp\claude\c--Users-meetk-Pramukh-Group-AI-System-V2\eff297a0-9f0a-482c-b2eb-139751011090\scratchpad\`
(session-scoped — copy them into the repo if you want them to survive). Re-runnable against
`workorders/` and `PC/` with `python 3.10` + `openpyxl 3.1.5`.
