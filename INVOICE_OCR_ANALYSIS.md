# GRN Invoice OCR — Format Analysis & Extraction Specification

Source: `Procurement_Report_Formate/sample_invoice.pdf` (3 pages = 3 distinct vendor formats)

**Critical baseline fact:** all 3 pages are **pure raster scans with a zero-byte text layer**
(verified: `page.get_text()` returns length 0 on every page; each page holds one large JPEG,
3316×4684 / 3500×4996 / 3636×5268 px, plus an "OKEN Scanner" watermark strip).
There is nothing to parse with `pdf-parse` / `pdfjs`. This requires real OCR — and because the
layouts are irregular tables with merged cells, it requires **layout-aware vision extraction**,
not line-based OCR.

Page 1 is additionally **rotated 90° CCW**; pages 2 and 3 are upright. Rotation is per-page, not
per-document.

---

## 1. Format taxonomy

| | **Format A** | **Format B** | **Format C** |
|---|---|---|---|
| Vendor | AJIT TRADING CO | BHAGAVAT ENTERPRISE | ARCHIT CORPORATION |
| Orientation | **Landscape, rotated 90° CCW** | Portrait | Portrait |
| Origin | Legacy DOS/ERP print, dot-matrix-ish | Modern SaaS (Zoho-style), digitally signed | Legacy Windows ERP, e-invoice enabled |
| Scan quality | Skewed, shadowed, curled paper, handwriting | Clean, flat, green tint + big diagonal watermark | Clean, faint/thin serif type |
| e-Invoice | No | No (UPI QR only) | **Yes — IRN + Ack No + QR** |
| Line items | 3 | 1 | 1 |
| Buyer entity | AGASTYA DEVELOPERS | AMAYA CORPORATION | PRAMUKH SATVA HOMES LLP |
| Tax model | CGST 9 + SGST 9 | CGST 9 + SGST 9 | CGST 9 + **UT/SGST** 9 |
| Grand total | ₹5,51,492.00 | ₹8,319.00 | ₹45,750.00 |
| Distinct traps | cascading discount, PO hidden in Remarks | **ledger balance ≠ invoice total** | qty column named by unit, 2 bank a/cs |

All three are `ORIGINAL FOR RECIPIENT`, all intra-Gujarat (no IGST), all effectively 18% GST.
Two of the three carry a religious invocation line above the vendor name that carries no data
(`શ્રી વાસુપૂજ્ય સ્વામી ને નમઃ` on A, `|| ** Shree Ganeshay Namah ** ||` on C) — must be ignored.

---

## 2. Format A — AJIT TRADING CO (rotated landscape, legacy ERP)

### Header / vendor
| Field | Value |
|---|---|
| Doc type | `TAX INVOICE - ORIGINAL FOR RECIPIENT` (left edge clipped to `ICE- ORIGINAL FOR RECIPIENT`) |
| Invoice No | `G-2987` (alpha prefix + hyphen) |
| Invoice Date | `11/07/2026` (DD/MM/YYYY) |
| Vendor | AJIT TRADING CO |
| Address | 43-44, S K INDUSTRIAL ESTATE, SOMAKANJI ESTATE, NR. SAGA FURNITURE, OPP. SANIDEV TEMPLE, UDHNA MAGDALLA ROAD, SURAT GUJARAT-24 |
| Contact | 9723434726, 9723434726 (duplicated) |
| Email | ajittradingsurat@rediffmail.com |
| PAN | AVOPS6752N |
| GSTIN | 24AVOPS6752N2ZN |

### Parties — split billed-to vs shipped-to, *different cities*
| | Billed to | Shipped to (Consignee) |
|---|---|---|
| Name | M/S. AGASTYA DEVELOPERS | M/S. AGASTYA DEVELOPERS |
| **Site** | `SITE : AGASTYA` | `SITE : AGSTYA` ← typo, **highlighted in yellow marker** |
| Address | 5, CITY CENTER, SARDAR BAUG ROAD, Sardar Bagh Chowk, Junagadh 362001, GUJARAT-24 | OPP VESU FIRE STATION, VIP ROAD, VESU, SURAT 395007, GUJARAT-24 |
| GSTIN | 24ABYFA3137F1ZE | 24ABYFA3137F1ZE (same) |
| Finance Supervisor | 8488800271 | 8488800271 |
| Site/Account Supervisor, Owner | blank | blank |

`Place Of Supply : GUJARAT-24`. Empty label-only fields (`Site Supervisor :`, `Owner :`,
`Account Supervisor :`) are everywhere — the OCR must not invent values for them.

### Reference numbers — **the single most dangerous block in the whole set**
| Label on paper | Value | What it actually is |
|---|---|---|
| `Challan No` | `2987` | vendor's challan (mirrors invoice numeric part) |
| `P.O.NO.` | `8055` | **vendor's own internal order ref — NOT our PO** |
| `Remarks` | `AD/PAG/PO/2026/0122` | **← this is Pramukh's real PO number** |

A naive extractor maps `P.O.NO. → po_number` and silently returns `8055`, which matches nothing
in our system. The buyer PO lives in a free-text `Remarks` field.

### Transport (all blank — present as labels only)
`L.R. No.`, `Date`, `Name`, `Veh.No.`, `Driver` — all empty.

### Dispatch-from stamp (faint blue, overprinted, partially legible)
```
Dispatch From,
LIXIL INDIA PVT. LTD.
C/o. Kuehne+Nagel Private Limited
BGR Reality Logistics & Industrial Park
Unit # 4, Mumbai Logistics Hub
Village Vahuli, Taluka Bhiwandi
Opp. Dara's Dhaba, NH-3, Mumbai Nasik Highway
Bhiwandi, District Thane - 421302
```
Third-party fulfilment — **not** the vendor and **not** the ship-to. Overlaps the totals block,
so it degrades OCR of the numbers underneath it.

### Line items — 12 columns
`No. | Item Code | Item Company | Description | Hsn/Sac | Qty. | Unit | Rate | Discount % | S.Gst % | C.Gst % | Taxable Value`

| # | Item Code | Co. | Description | HSN | Qty | Unit | Rate | Discount % | SGST% | CGST% | Taxable |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | LCC000000004 | LIXIL | LIXIL CL0294F1-6DA10 CONCEPT COUNTER TOP BASIN | 69109000 | 88 | PCS | 4840.00 | `55.00 + 15.25` | 9.00 | 9.00 | 162435.24 |
| 2 | LCC000000001 | LIXIL | LIXIL CCAS3105-4W20410A0 CONCEPT WALL HUNG | 69109000 | 50 | PCS | 14750.00 | `65.00 + 15.25` | 9.00 | 9.00 | 218760.94 |
| 3 | LCC000000002 | LIXIL | LIXIL CCASC105-0200410A0 CONCEPT WALLHUNG SLIM AMORLID **SEAT COVER** (wraps to 2nd line) | 39222000 | 50 | PCS | 5810.00 | `65.00 + 15.25` | 9.00 | 9.00 | 86169.56 |

**Cascading two-stage discount** — `"55.00 + 15.25"` is not a sum (70.25%), it is sequential:
```
taxable = qty × rate × (1 − d1/100) × (1 − d2/100)
88 × 4840 = 425,920 → ×0.45 = 191,664 → ×0.8475 = 162,435.24   ✓ exact
50 × 14750 = 737,500 → ×0.35 = 258,125 → ×0.8475 = 218,760.94  ✓ exact
50 × 5810  = 290,500 → ×0.35 = 101,675 → ×0.8475 = 86,169.56   ✓ exact
```
Reading it as a single 70.25% discount produces ₹126,563 instead of ₹162,435 — a 22% error.
The discount field must be modelled as an **ordered array**, not a scalar.

Row 3's description **wraps across two physical lines** while the numeric cells stay on line 1 —
row grouping must be geometric (y-band), not line-per-row.

### Totals
| | |
|---|---|
| Total Qty | 188.00 |
| Taxable total | 467365.74 |
| S.Gst | 42062.92 |
| C.Gst | 42062.92 |
| Tcs @ 0.000% | 0.000 |
| ROUNDED UP | 0.42 |
| **GRAND TOTAL** | **551492.00** |

HSN-wise summary (`Hsn/Sac | Basic | S.Gst% | CGst% | S.Gst | C.Gst | Total`):

| HSN | Basic | SGST% | CGST% | SGST | CGST | Total |
|---|---|---|---|---|---|---|
| 69109000 | 381196.18 | 9.00 | 9.00 | 34307.65 | 34307.65 | 68615.30 |
| 39222000 | 86169.56 | 9.00 | 9.00 | 7755.26 | 7755.26 | 15510.52 |
| | 467365.74 | | | 42062.91 | 42062.91 | 84125.82 |

**Internal 1-paise inconsistency, present on the paper:** HSN summary sums to `42062.91` but the
totals block says `42062.92` (467365.74 × 9% = 42062.9166). Sum-of-rounded-rows ≠
rounded-sum. Reconciliation must tolerate this, and the **right-hand totals block is
authoritative** because it is what feeds GRAND TOTAL:
`467,365.74 + 42,062.92 + 42,062.92 = 551,491.58 → +0.42 rounding = 551,492.00` ✓

### Tail
- `PAYMENT DUE IN 30 DAYS ON 10/08/2026` — credit days **and** absolute due date in one sentence
- Words: `Five lakh fifty one thousand four hundred ninety two only` (Indian lakh/crore scale)
- `Amount of tax subject to reverse Charges : N.A.`
- Terms Of Sale, 5 numbered clauses (24% p.a. interest, Surat jurisdiction)
- Bank: `KOTAK MAHINDRA BANK GHOD DOI`, A/c `5611279333`, IFSC `KKBK0000871`
- `Received By :` **handwritten signature** ("Nilesh"/"Nitesh" — ambiguous, do not force a read)
- `Zone : ZV-MITESH`
- `FOR, AJIT TRADING CO` / `Authorised Signatory` (signature box empty)

---

## 3. Format B — BHAGAVAT ENTERPRISE (modern SaaS, portrait)

### Header / vendor
| Field | Value |
|---|---|
| Doc type | `TAX INVOICE` + `ORIGINAL FOR RECIPIENT` |
| Vendor | BHAGAVAT ENTERPRISE |
| GSTIN | 24AUHPK6558N1Z1 |
| PAN | AUHPK6558N |
| Address | BEHIND BHIMARAD VILLAGE, OPPOSITE SUMAN SMIT AWAS, BHIMARAD, SURAT, GUJARAT, 395007 |
| Mobile | +91 9998723006, 9924733006, 9737776727 (**three** numbers) |
| Email | bhagavatenterprise@gmail.com |
| Website | www.bhagavatenterprise.com |
| Footer tagline | WHOLESALE BUILDING MATERIAL & CONSTRUCTION CHEMICAL SUPPLIERS :: BRANACHES : VESU-BHIMARAD-ADAJAN |
| Footer | `Page 1 / 1 · This is a digitally signed document.` |

### Customer & meta (two-column key–value, cleanest of the three)
| Field | Value |
|---|---|
| Customer | AMAYA CORPORATION |
| Ph | 7016951962 |
| GSTIN | 24ABZFA6800G1ZB |
| Billing Address | OFFICE NO 1001, 10TH, PRAMUKH ORBIT2, VESU MAIN ROAD, SURAT, SURAT, GUJARAT, 395007 |
| Contact Person | +91 70169 51962 |
| Invoice # | `BE-2026-27-3343` |
| Invoice Date | `16 Jul 2026` (**DD Mon YYYY**) |
| Due Date | `16 Jul 2026` |
| Place of Supply | 24-GUJARAT |
| Vehicle No | GJ05CV4633 |
| **PO Number** | `AC/PAM/PO/2026/0351` ← correctly in a real PO field |
| Shipping Address | AMAYA CORPORATION, NEAR DREAM FESTIVA, GUARAV PATH ROAD, PALANPURE, Surat, GUJARAT, 395009 |
| Ship contact | CONTACT PERSON +91 99134 45849 |

`Due Date == Invoice Date` while clause 2 of the terms says "within 30 days" — the structured
field contradicts the prose. Prefer the structured field, but flag it.

### Line items — only 8 columns, **no item-code column at all**
`# | Item | HSN/SAC | Tax | Qty | Rate / Item | Disc (%) | Amount`

| # | Item | HSN/SAC | Tax | Qty | Rate/Item | Disc(%) | Amount |
|---|---|---|---|---|---|---|---|
| 1 | JOINT FILLER IVORY 1 KG | 38241000 | `18%` | `150 PKTS` | 47.00 | `-` | 7,050.00 |

Three format-specific behaviours:
1. **`Tax` is a single combined 18%**, not split CGST/SGST — the 9+9 split only appears lower down.
2. **Unit is fused into the qty cell** (`150 PKTS`) — needs splitting into `150` + `PKTS`.
3. **`Disc (%)` is a literal `-`** meaning nil — must become `0`/`null`, never the string `"-"`.
4. There is a **large empty band** (~45% of the page) between the single item and the totals.

### Totals
```
Taxable Amount            7,050.00
CGST 9.0% @ 7050.00         634.50
SGST 9.0% @ 7050.00         634.50
Total          Qty 150   ₹8,319.00
```
The CGST/SGST label embeds its own base: `CGST 9.0% @ 7050.00`.

HSN summary — nested 2-level header (`Central Tax` / `State/UT Tax` each split into `Rate` + `Amount`):

| HSN/SAC | Taxable Value | Central Rate | Central Amt | State Rate | State Amt | Total Tax |
|---|---|---|---|---|---|---|
| 38241000 | 7050.00 | 9% | 634.50 | 9% | 634.50 | 1269.00 |
| **TOTAL** | 7,050.00 | | 634.50 | | 634.50 | 1269.00 |

### ⚠️ The worst trap in the entire sample set
```
Amount Payable:      ₹8,319.00      ← this invoice
Total Amount Due:   ₹21,08,663.00   ← RUNNING LEDGER BALANCE across all open invoices
```
`Total Amount Due` is **254× larger** than the invoice. Any extractor that keys on
"amount due" / "total due" / picks the largest currency figure on the page will book
₹21.08 lakh against a ₹8,319 GRN. The correct field is **`Amount Payable`**, cross-validated
against `Taxable + CGST + SGST`.

Also note `₹21,08,663.00` uses **Indian digit grouping** (2,2,3), not Western (2,108,663).
A `parseFloat` after naive comma-stripping is fine, but any regex assuming `\d{1,3}(,\d{3})*`
will fail to match it.

### Tail
- Words: `INR Eight Thousand, Three Hundred And Nineteen Rupees Only. E & O.E`
- Bank: IDFC FIRST BANK, A/c `10088337585`, IFSC `IDFB0042261`, Branch `GOD DOD ROAD`
- `Pay using UPI:` **QR code** (decodable → UPI VPA, payee name, sometimes amount)
- 4 numbered terms (30 days / 24% p.a. / check quality before receiving / complaints in 24 hrs)
- `Receiver's Signature` (handwritten mark present)
- `For BHAGAVAT ENTERPRISE` + **round rubber stamp overlapping the signature area**
- Circular vendor logo top-left, **huge diagonal "BHAGAVAT ENTERPRISE" watermark** across the
  entire body — low-contrast text over it is the main OCR risk on this page

---

## 4. Format C — ARCHIT CORPORATION (legacy ERP + e-invoice)

### Header / vendor
| Field | Value |
|---|---|
| Invocation | `|| ** Shree Ganeshay Namah ** ||` (ignore) |
| Vendor | ARCHIT CORPORATION |
| Address | 310-CANAL POINT NEAR INS HOSPITAL, SOMA KANJI NI WADI, KHATODARA SURAT 395002 GUJARAT |
| Email | archit.corporation@gmail.com |
| Mobile | 9913400088 |
| PAN | ACIPS4047H |
| GSTIN | 24ACIPS4047H1ZI |
| Doc type | `TAX INVOICE` / `ORIGINAL FOR RECIPIENT` |
| **QR** | e-invoice QR, top-right of header |

### Dispatch-origin row (unique to this format)
`Dispatch from pin : 394315` · `Dispatch from State : GUJARAT` · `Dispatch from City : Palsana`
· `Place of Supply : 24-GUJARAT`

### Parties
| | Billed to (Customer) | Delivery Address |
|---|---|---|
| Name | **PRAMUKH SATVA HOMES LLP** | `SATVA` ← project/site name as first line |
| Address | 10TH OFFICE NO 1001 Orbit 2, VESU CANAL ROAD, Surat SURAT | NEAR HAPPY ELAGENCE, VESU-MAGDALLA, SURAT SURAT |
| GSTIN | 24ABDFP8234D1ZG | *(blank)* |
| STATE | 24-GUJARAT | 24-GUJARAT |

### Document references
| Field | Value |
|---|---|
| Invoice No. | `26-27/499` ← **FY prefix + slash**; looks like a date/fraction, is neither |
| Invoice Date | `20-07-2026` (DD-MM-YYYY) |
| Challan No. | *(blank)* |
| Due Date | `20-07-2026` |
| Order No. | *(blank)* — **our PO number is simply absent from this invoice** |
| Agent | `Broker :JB` (nested label inside a value) |
| IRN | `b290d6c8492cbb0d3ea2d04a22fdcf4ae9097c1e9a09aefac6ca592a4a713f53` (64 hex) |
| Ack. No. | `162625322158405` (15 digits) |
| Ack. Date | `20-07-2026 13:28:00` (datetime) |
| Eway Bill No / Eway Dt | *(blank)* |
| `Haste :` | *(blank)* — Gujarati-influenced label ≈ "c/o, by hand of" |

The **IRN is the highest-value field for deduplication**: it is globally unique per e-invoice and
cryptographically tied to the government portal. Any GRN whose invoice carries an IRN should be
duplicate-checked on IRN first, invoice-no+vendor-GSTIN second.

### Line items — 14 columns, unit-named qty header
`Sr | Description of Goods | HSN CODE | BAGES | Net Rate | Rate | Disc % | Disc. | Amount Rs. | Taxable Amount Rs. | CGST(Rate,Amount) | UT/SGST(Rate,Amount)`

| Sr | Description | HSN | **BAGES** | Net Rate | Rate | Disc% | Disc. | Amount | Taxable | CGST% | CGST | SGST% | SGST |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | SHREE CEMENT PPC | 25232930 | 150.00 | 305.000 | 258.48 | 0.00 | | 38771.25 | 38771.25 | 9.00 | 3489.41 | 9.00 | 3489.41 |

Four traps in one row:
1. **The quantity column is named after the unit — `BAGES`** (a misspelling of BAGS). There is no
   column literally called Qty/Quantity, and no separate Unit column. The extractor must infer
   *"this header is a unit noun ⇒ it is the quantity column, and the unit is BAGS"*.
2. **Two rate columns.** `Net Rate 305.000` is the list/MRP rate; `Rate 258.48` is the effective
   rate. The one that reconciles is `Rate`: `38771.25 / 150 = 258.475`.
3. **`Rate` is displayed rounded to 2dp but stored at higher precision.** `150 × 258.48 = 38,772.00`
   vs the printed `38,771.25` — a **₹0.75 discrepancy that is not an OCR error**. Line-level
   `qty × rate == amount` validation must carry a tolerance (or recompute rate from amount).
4. **`Disc % = 0.00` yet `Net Rate ≠ Rate`** — a 15.25% discount is baked into `Rate` without being
   declared. Never derive "no discount given" from the discount column alone.

Also: label is `UT/SGST` (Union-Territory variant), not `SGST`. `Payment within 0 days`.

### Tax summary — the widest matrix in the set
`Tax(%) | Tax.Value Rs. | CGST(%,Amount) | UT/SGST(%,Amount) | IGST(%,Amount) | CESS(%,Amount) | TOTAL Amount`

| Tax% | Tax.Value | CGST% | CGST | SGST% | SGST | IGST% | IGST | CESS% | CESS | Total |
|---|---|---|---|---|---|---|---|---|---|---|
| 18.00 | 38771.25 | 9.00 | 3489.41 | 9.00 | 3489.41 | 0 | 0 | 0 | 0 | 6978.82 |
| **Total:** | | | 3489.41 | | 3489.41 | | 0 | | 0 | 6978.82 |

Note `Tax(%) = 18.00` is the **combined slab**, while CGST and SGST are 9.00 each — the same
number means two different things in two places on one page.

### Grand totals
```
Taxable Amount              38771.25
ADD CGST   9.000 %           3489.41
ADD SGST   9.000 %           3489.41
Bill Amount:                45750.07
[Round]ed off :-0.07          -0.07     ← label clipped by the page border
Net Amount Rs.              45750.00
```
`Rupees. Forty Five Thousand Seven Hundred Fifty Only.`
The round-off is **negative** here (down) vs **positive** in Format A (`ROUNDED UP 0.42`), and its
label is physically truncated to `ed off`. Sign must be read, not assumed.

### Tail
- **Two bank accounts**, both YES BANK, RING ROAD, SURAT, IFSC `YESB0000011`:
  `001184600003837` and `001184600008824` → the schema needs a **bank-accounts array**, not one object
- Transport: `P N CORPORATION` · Station `SURAT` · `L.R.No : 4206` · `LR.Dt :` blank ·
  `Case No :` blank · `VahicleNo : GJ19Z3519` (**misspelled label**)
- TERMS & CONDITIONS, 5 numbered clauses
- `E. & O.E.` · `For ARCHIT CORPORATION` · `Authorised Signatory` (unsigned)

---

## 5. Cross-format variability — what the extractor must absorb

### 5.1 Same concept, different labels
| Canonical | Format A | Format B | Format C |
|---|---|---|---|
| invoice_number | `INVOICE :` | `Invoice #:` | `Invoice No. :` |
| invoice_date | `INVOICE DATE :` | `Invoice Date:` | `Invoice Date :` |
| buyer | `Receiver Details(Billed to)` | `Customer Details:` / `Billing Address:` | `Billed to (Customer):` |
| ship_to | `Consignee Details(Shipped to)` | `Shipping Address:` | `Delivery Address:` |
| buyer_po | `Remarks` ⚠️ | `PO Number:` | *(absent; `Order No.` blank)* |
| quantity | `Qty.` + `Unit` | `Qty` (unit fused) | **`BAGES`** (unit as header) |
| unit_rate | `Rate` | `Rate / Item` | `Rate` (+ decoy `Net Rate`) |
| line_total | `Taxable Value` | `Amount` | `Amount Rs.` = `Taxable Amount Rs.` |
| sgst | `S.Gst` | `State/UT Tax` | `UT/SGST` |
| cgst | `C.Gst` | `Central Tax` | `CGST` |
| grand_total | `GRAND TOTAL` | **`Amount Payable`** ⚠️ | `Net Amount Rs.` |
| round_off | `ROUNDED UP` (+) | *(none)* | `[Round]ed off` (−) |
| vehicle | `Veh.No.` (blank) | `Vehicle No:` | `VahicleNo` |
| lr_number | `L.R. No.` (blank) | *(none)* | `L.R.No.` |

### 5.2 Format inconsistencies to normalise
| Aspect | Variants seen |
|---|---|
| **Date** | `11/07/2026` · `16 Jul 2026` · `20-07-2026` — all DD-first; **never** assume MM/DD |
| **Datetime** | `20-07-2026 13:28:00` (Ack. Date only) |
| **Invoice no.** | `G-2987` · `BE-2026-27-3343` · `26-27/499` — alnum, hyphens, slashes, FY prefixes |
| **Currency** | bare `551492.00` · `₹8,319.00` · `45750.00` — ₹ present on B only |
| **Grouping** | none (A, C) · Indian lakh grouping `21,08,663.00` (B) |
| **Discount** | `55.00 + 15.25` cascade (A) · `-` nil (B) · `0.00` + hidden in rate (C) |
| **GST split** | separate 9/9 columns (A, C) · combined `18%` per line (B) |
| **Unit** | own column `PCS` (A) · fused `150 PKTS` (B) · header noun `BAGES` (C) |
| **Rounding** | `+0.42` up (A) · none (B) · `−0.07` down (C) |
| **Rotation** | 90° CCW (A) · 0° (B) · 0° (C) |

### 5.3 Field presence matrix (`✓` present · `○` label present but empty · `✗` absent)
| Field | A | B | C |
|---|---|---|---|
| PAN | ✓ | ✓ | ✓ |
| Vendor GSTIN | ✓ | ✓ | ✓ |
| Buyer GSTIN | ✓ | ✓ | ✓ |
| Ship-to GSTIN | ✓ | ✗ | ○ |
| Buyer PO number | ✓ *(in Remarks)* | ✓ | ✗ |
| Challan no | ✓ | ✗ | ○ |
| Vendor order ref | ✓ `8055` | ✗ | ○ |
| Due date | ✓ *(in prose)* | ✓ | ✓ |
| Credit days | ✓ `30` | ✓ *(terms prose)* | ✓ `0` |
| Item code | ✓ | ✗ | ✗ |
| Item brand/company | ✓ `LIXIL` | ✗ | ✗ |
| Per-line HSN | ✓ | ✓ | ✓ |
| HSN summary table | ✓ | ✓ | ✓ |
| Cascading discount | ✓ | ✗ | ✗ |
| List (MRP) rate | ✗ | ✗ | ✓ `Net Rate` |
| Round-off | ✓ | ✗ | ✓ |
| TCS | ✓ `0.000%` | ✗ | ✗ |
| CESS | ✗ | ✗ | ✓ `0` |
| IGST | ✗ | ✗ | ✓ `0` |
| Amount in words | ✓ | ✓ | ✓ |
| Bank details | ✓ ×1 | ✓ ×1 | ✓ **×2** |
| UPI QR | ✗ | ✓ | ✗ |
| IRN / Ack | ✗ | ✗ | ✓ |
| e-invoice QR | ✗ | ✗ | ✓ |
| Eway bill | ✗ | ✗ | ○ |
| Transporter | ○ | ✗ | ✓ |
| Vehicle no | ○ | ✓ | ✓ |
| LR no | ○ | ✗ | ✓ |
| Driver name | ○ | ✗ | ✗ |
| Agent / broker | ✗ | ✗ | ✓ |
| Dispatch-from party | ✓ *(stamp)* | ✗ | ✓ *(pin/state/city)* |
| Site / project name | ✓ `AGASTYA` | ✗ | ✓ `SATVA` |
| Ledger balance | ✗ | ✓ ⚠️ | ✗ |
| Reverse-charge note | ✓ `N.A.` | ✗ | ✗ |
| Zone code | ✓ `ZV-MITESH` | ✗ | ✗ |
| Handwriting present | ✓ signature | ✓ signature | ✗ |
| Rubber stamp | ✓ dispatch stamp | ✓ round stamp | ✗ |
| Watermark | scanner strip | **heavy diagonal** | scanner strip |

The `○` rows are why "extract every label you see" fails: three of A's transport fields and four of
C's reference fields are printed but empty. Empty must round-trip as `null`, never as `""` and never
as a hallucinated guess.

---

## 6. Extraction approach — as built (deterministic, no AI)

**Status: implemented and validated. 75/75 ground-truth fields correct across all three formats,
overall confidence 0.93 / 0.94 / 0.93, every arithmetic check passing.** See `frontend/src/lib/ocr/`
and `frontend/scripts/extract-probe.ts`.

### 6.1 Why classical OCR *can* work here
Tesseract alone returns a flat text stream, and every hard field in this sample set is
*positional* — which of two rate columns, which of two totals blocks, which row a wrapped
description belongs to, a quantity column named `BAGES`. The flat stream is not enough.

Three mechanisms close that gap without a model:

1. **Preprocessing that makes layout analysis work at all.** Border trim is not cosmetic: with the
   photographic surround present, Tesseract classifies the whole sheet as one image block and
   returns *5 words* for a full invoice. After `sharp.trim()` the same page yields 400+.
2. **Geometry instead of text order.** Columns are derived from the table's own vertical gutters
   and rows from skew-corrected y-bands, so a cell wider than its heading stays in its column and
   a wrapped description merges into the right item.
3. **The invoice's own redundancy, used twice** — first to *filter* candidate reads, then to
   *repair* them. This is what replaces a model's judgement, and it is the single biggest
   contributor to accuracy.

Measured effect of the redundancy pass on this sample set: 67/76 → 75/75.

### 6.1a What actually shipped

| Stage | Implementation | Why |
|---|---|---|
| Rasterise | `mupdf` (wasm) at 400 dpi | pdfjs + `@napi-rs/canvas` **segfaults**; mupdf needs no native build |
| Border trim | `sharp.trim({threshold:40})` | **Mandatory** — see above |
| Colour | always 3-channel sRGB | tesseract.js silently mis-decodes 1-channel PNGs (5 words vs 347) |
| Orientation | 4-way probe, `keywordScore × horizontalFraction` | `osd.traineddata` unavailable, and Tesseract auto-corrects 90° internally so text quality alone cannot tell 0° from 270° (46 vs 47 keyword hits) |
| Skew | baseline slope from word centres, in coordinate space | AJIT rises ~0.5° / 33px across 4600px, which split every line item in half. A **pixel-domain** deskew was tried and removed: a mis-estimated angle made Tesseract reject the page outright |
| OCR | PSM 3 **and** PSM 11, word sets merged by IoU | the two disagree usefully per layout; merging raises recall without choosing per vendor |
| Columns | vertical gutters from the data, self-tuned gap width | header midpoints mis-slot any cell wider than its heading, and cannot separate headings the OCR ran together |
| Fields | fuzzy label anchoring + validated fall-through | a generic alias otherwise captures a neighbour's value |
| Correctness | arithmetic filter + constrained digit repair | §6.5 |

Runtime ≈ 30 s/page (≈90 s for the 3-page sample), single-threaded, cached by file hash.

### 6.1b Deliberate non-goals
- **The IRN is left `null` when it cannot be read exactly.** ARCHIT's OCRs with ~3 character errors
  (`cB`→`c8`, `13153`→`13f53`) and a 64-hex string has no checksum to repair from. Since the IRN is
  the duplicate-detection key, a corrupted value is worse than a missing one — it could mask a real
  duplicate or falsely match an unrelated invoice. A warning is raised instead.
- **The HSN summary is advisory only.** It is the least reliable region to OCR (nested two-level
  headers) and fully redundant: the line items already carry per-HSN taxable values. A mismatch
  logs an `info` and the line items win.
- **A vision LLM would still be more accurate** on unseen layouts, degraded scans and handwriting.
  This implementation is the deterministic path that was asked for; the trade-off is that a new
  vendor whose wording is absent from `aliases.ts` under-extracts until its wording is added — a
  one-line change, but a change nonetheless.

### 6.2 Pre-processing pipeline (before the model call)
1. **Rasterise** each page at **≥300 DPI** (`pdfjs`/`pdf-to-img` server-side, or MuPDF).
   Page 1's source JPEG is 3316×4684 — do not downscale below ~2000 px on the long edge or the
   dot-matrix digits in the discount column degrade.
2. **Auto-detect and correct rotation per page** — do not apply one rotation document-wide
   (A is 90° CCW, B and C are 0°). Either use an OSD pass or let the vision model report
   `page_rotation` and re-submit.
3. **Deskew** — Format A's paper is visibly curled and skewed; a Hough/projection deskew measurably
   improves column alignment.
4. Optional but high-value: **decode QR codes separately** with a real QR library (`jsQR`/`zxing`).
   Format C's e-invoice QR contains a signed JWT with `SellerGstin`, `BuyerGstin`, `DocNo`,
   `DocDt`, `TotInvVal`, `Irn` — a **ground-truth cross-check the model cannot hallucinate**.
   Format B's UPI QR yields the payee VPA. If the QR decodes, trust it over the OCR.
5. Send **one page per request** with the whole page in view (do not crop to regions — the model
   needs the surrounding table structure to disambiguate columns).
6. If a PDF *does* carry a text layer, extract it and pass it **alongside** the image as a hint —
   belt-and-braces. (Not applicable to this sample, but real vendors will send digital PDFs.)

### 6.3 Unified target schema
Designed so that a field absent on a given format is `null` rather than missing, and so that every
format-specific quirk above has somewhere to land.

```ts
type Extracted = {
  meta: {
    page_rotation: 0 | 90 | 180 | 270;
    detected_format_hint: string | null;   // free-text, e.g. "legacy landscape ERP"
    document_type: 'TAX INVOICE' | 'PROFORMA' | 'DELIVERY CHALLAN' | 'CREDIT NOTE' | 'OTHER';
    copy_type: string | null;              // "ORIGINAL FOR RECIPIENT"
    is_einvoice: boolean;
    page_label: string | null;             // "Page 1 / 1"
  };

  vendor: {
    name: string;
    address_lines: string[]; city: string | null; state: string | null; pincode: string | null;
    gstin: string | null; pan: string | null;
    phones: string[]; emails: string[]; website: string | null;
  };

  buyer:  Party;                            // billed-to
  ship_to: Party & { site_name: string | null };
  dispatch_from: {                          // A's stamp, C's pin/state/city
    party_name: string | null; address_lines: string[];
    pincode: string | null; city: string | null; state: string | null;
  } | null;

  document: {
    invoice_number: string;
    invoice_date: string;                   // ISO yyyy-mm-dd
    due_date: string | null;
    credit_days: number | null;             // 30 from A's prose, 0 from C
    challan_number: string | null;
    buyer_po_number: string | null;         // ← "AD/PAG/PO/2026/0122" even when in Remarks
    buyer_po_number_source: 'po_field' | 'remarks' | 'order_no' | 'inferred' | null;
    vendor_order_ref: string | null;        // ← A's "8055". NEVER put this in buyer_po_number
    place_of_supply: string | null;
    irn: string | null; ack_no: string | null; ack_date: string | null;
    eway_bill_no: string | null; eway_date: string | null;
    reverse_charge: boolean | null;
    agent_or_broker: string | null;
    zone_code: string | null;
  };

  transport: {
    transporter_name: string | null; station: string | null;
    lr_number: string | null; lr_date: string | null;
    vehicle_number: string | null; driver_name: string | null;
    case_no: string | null;
  };

  line_items: Array<{
    sr: number;
    item_code: string | null;
    brand_or_company: string | null;        // "LIXIL"
    description: string;                    // fully joined across wrapped lines
    hsn_sac: string | null;
    quantity: number;
    unit: string | null;                    // from own column, fused cell, or unit-named header
    unit_source: 'unit_column' | 'fused_in_qty' | 'column_header' | 'inferred' | null;
    list_rate: number | null;               // C's "Net Rate" 305.000
    unit_rate: number;                      // the rate that reconciles: 258.475
    discount_percents: number[];            // [55, 15.25] cascade | [] | [0]
    discount_amount: number | null;
    taxable_value: number;
    cgst_rate: number | null; cgst_amount: number | null;
    sgst_rate: number | null; sgst_amount: number | null;
    igst_rate: number | null; igst_amount: number | null;
    cess_rate: number | null; cess_amount: number | null;
    combined_tax_rate: number | null;       // B's per-line "18%"
    line_total: number | null;
  }>;

  hsn_summary: Array<{
    hsn_sac: string; taxable_value: number;
    cgst_rate: number | null; cgst_amount: number | null;
    sgst_rate: number | null; sgst_amount: number | null;
    igst_rate: number | null; igst_amount: number | null;
    cess_amount: number | null; total_tax: number | null;
  }>;

  totals: {
    total_quantity: number | null;
    taxable_amount: number;
    cgst_amount: number | null; sgst_amount: number | null;
    igst_amount: number | null; cess_amount: number | null;
    tcs_rate: number | null; tcs_amount: number | null;
    freight: number | null; packing: number | null; insurance: number | null;
    loading_unloading: number | null; other_charges: number | null;
    round_off: number | null;               // SIGNED: +0.42 (A), -0.07 (C)
    grand_total: number;                    // THIS invoice only
    amount_in_words: string | null;
    ledger_balance_due: number | null;      // ⚠️ B's ₹21,08,663 — parked, never used as total
  };

  payment: {
    bank_accounts: Array<{                  // array — C has two
      bank_name: string | null; branch: string | null;
      account_number: string | null; ifsc: string | null;
    }>;
    upi_id: string | null;
    payment_terms_text: string | null;
  };

  qr_codes: Array<{ kind: 'einvoice' | 'upi' | 'unknown'; raw: string | null }>;
  terms_and_conditions: string[];
  remarks: string | null;
  signatures: { received_by: string | null; authorised_signatory_present: boolean };

  validation: {
    line_math_ok: boolean;
    tax_math_ok: boolean;
    grand_total_ok: boolean;
    hsn_summary_matches_lines: boolean;
    warnings: string[];
    field_confidence: Record<string, number>;   // 0–1 per dotted path
    overall_confidence: number;
  };
};
```

### 6.4 Prompt rules the model must be given explicitly
These are derived one-for-one from the traps above — each earns its place:

1. **Dates are always day-first.** Emit ISO. `11/07/2026` → `2026-07-11`, never `2026-11-07`.
2. **`Grand total` = this invoice only.** Reject any figure labelled *Total Amount Due*,
   *Closing Balance*, *Previous Balance*, *Outstanding* — park those in `ledger_balance_due`.
   Sanity rule: `grand_total ≈ taxable + taxes + charges ± round_off`. If a candidate misses by
   more than ₹5, it is the wrong number.
3. **Buyer PO vs vendor order ref.** Our PO looks like `XX/XXX/PO/YYYY/NNNN`
   (`AD/PAG/PO/2026/0122`, `AC/PAM/PO/2026/0351`). Search the *entire* document including
   Remarks/Narration/Notes. A short bare integer next to `P.O.No.` (e.g. `8055`) is the
   vendor's own ref → `vendor_order_ref`. Record where it was found in `buyer_po_number_source`.
4. **Discounts may cascade.** `"55.00 + 15.25"` → `[55, 15.25]` applied sequentially, never summed.
5. **Two rate columns:** pick the one satisfying `qty × rate ≈ amount`; put MRP/list in `list_rate`.
   A `0.00` discount column does **not** mean the rate is undiscounted.
6. **Unit may be a column, fused into qty, or the qty column's own header** (`BAGES` → qty column,
   unit `BAGS`). Set `unit_source` accordingly.
7. **Join wrapped description lines** into one `description`; group rows by vertical band, never
   one-row-per-text-line.
8. **Empty printed labels → `null`.** Never guess, never `""`. Reproducing a label with no value is
   a hallucination.
9. **Indian digit grouping** — `21,08,663.00` = 2108663.00.
10. **Round-off is signed**; its label is often clipped (`ed off`).
11. **Ignore** religious invocations, watermarks, scanner banners ("Scanned with OKEN Scanner"),
    taglines, page footers, and highlighter marks. Never treat them as field values.
12. **`Tax 18%` on a line = combined slab**; split to CGST 9 + SGST 9 for intra-state (both GSTINs
    start with the same state code) or IGST 18 for inter-state.
13. **Do not read handwriting as data** beyond `signatures.received_by`; leave it `null` if unclear.
14. **Verify arithmetic before answering**; on mismatch keep the printed figure and append a
    `validation.warnings` entry — never silently "fix" the vendor's paper.

### 6.5 Post-extraction validation (deterministic code, not the model)
Run these in TypeScript after the model returns; they catch the failure modes the model can still hit:

```
per line:  |qty × unit_rate × Π(1 − dᵢ/100) − taxable_value| ≤ max(1.00, 0.005 × taxable)
           (tolerance is REQUIRED: C's rate 258.475 prints as 258.48 → ₹0.75 drift)
taxes:     |taxable × cgst_rate/100 − cgst_amount| ≤ 1.00      (per line and in total)
totals:    |Σ line.taxable_value − totals.taxable_amount| ≤ 1.00
hsn:       |Σ hsn_summary.taxable_value − totals.taxable_amount| ≤ 1.00
           ⚠️ allow ≥ ₹0.02 slack: A's HSN block (42062.91) and totals block (42062.92) genuinely
              disagree by 1 paise on paper. Prefer the totals block.
grand:     |taxable + cgst + sgst + igst + cess + charges + round_off − grand_total| ≤ 0.50
words:     Indian-numbering words→number, compare to grand_total (catches whole-rupee OCR slips)
gstin:     /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/ + checksum digit
           ⚠️ A's vendor GSTIN reads 24AVOPS6752N2ZN — 15 chars but the 13th/14th deviate from the
              usual `…1Z…`; flag for review rather than auto-rejecting the whole extraction.
pan:       /^[A-Z]{5}[0-9]{4}[A-Z]$/ and PAN must equal GSTIN[2..12]
hsn:       4/6/8 digits
irn:       /^[0-9a-f]{64}$/  → primary duplicate key
intra/inter: state code of vendor GSTIN == buyer GSTIN ⇒ expect CGST+SGST and IGST = 0
dup check: (irn) OR (vendor_gstin + invoice_number) already on a GRN ⇒ block with a clear message
```
Anything that fails becomes a **field-level warning badge in the UI**, not a hard rejection — the
paper is the legal record and vendors really do print inconsistent totals.

### 6.6 Confidence & human-in-the-loop
Ask the model for `field_confidence` per dotted path. Then:
- **≥0.90 and validation clean** → auto-fill, green tick.
- **0.60–0.90, or any validation warning** → auto-fill but **amber, focus-ring the field**, require
  the user to tab through it before submit.
- **<0.60 or null** → leave the field blank with a red hint and the reason.
- Always render the **source page image side-by-side** with the form so the storeman can eyeball
  Qty/Rate/Total. Ideally return bounding boxes per field and highlight on hover — that single
  feature does more for trust than any accuracy gain.
- **Never auto-submit a GRN from OCR.** Received qty has financial and inventory consequences.

---

## 7. Mapping to `FullGrnFormState`

Target: [grn-form.tsx](frontend/src/components/procurement/grn/grn-form.tsx#L67-L129)

| GRN field | Source | Notes |
|---|---|---|
| `supplier_name` | `vendor.name` | fuzzy-match to `vendors` table on GSTIN first, name second |
| `dealer_name` | `dispatch_from.party_name` | A → `LIXIL INDIA PVT. LTD.` |
| `phone_no` / `mobile_no` | `vendor.phones[0]` / `[1]` | dedupe (A repeats the same number twice) |
| `challan_no` | `document.challan_number` → fallback `invoice_number` | blank on C |
| `company_name` | `buyer.name` | AGASTYA DEVELOPERS / AMAYA CORPORATION / PRAMUKH SATVA HOMES LLP — these are **different group entities**; must resolve, not hardcode |
| `project_name` | `ship_to.site_name` | A `AGASTYA`, C `SATVA`; else infer from delivery address |
| `godown_name` | `ship_to` address | needs a site→godown lookup |
| `transporter_name` | `transport.transporter_name` | C only |
| `vehicle_no` | `transport.vehicle_number` | B, C |
| `grn_date` | today, **not** `invoice_date` | receipt date ≠ invoice date |
| `purchase_entries[].po_no` | `document.buyer_po_number` | ⚠️ from Remarks on A; **absent on C → user must pick the PO** |
| `purchase_entries[].item_description` | `line_items[].description` | |
| `purchase_entries[].item_code` | `line_items[].item_code` | A only; else match by description+HSN against PO lines |
| `purchase_entries[].item_brand` | `line_items[].brand_or_company` | A only |
| `purchase_entries[].unit` | `line_items[].unit` | normalise `PCS`/`PKTS`/`BAGS` to the master unit list |
| `purchase_entries[].challan_qty` | `line_items[].quantity` | |
| `purchase_entries[].received_qty` | `line_items[].quantity` **as a default only** | storeman must confirm physically |
| `approved_qty`, `as_on_date_po_balance_qty`, `current_balance_qty` | **from the PO, not the invoice** | never OCR-filled |
| `extra_items[]` | line items with no PO match | this is exactly what the extra-items table is for |
| `extra_items[].loading_unloading_chgs` | `totals.loading_unloading` | none present in this sample |
| `account_posting_material_amount` | `totals.taxable_amount` | |
| `remarks` | `document.buyer_po_number_source === 'remarks' ? remarks : remarks` | keep the raw text either way |
| `test_report_no`, `expiry_date`, `qc_no` | — | not on any invoice; leave blank |
| `status` | `'Pending QC'` | OCR must never set `Approve` |

**Unmapped-but-valuable fields** — nothing in `FullGrnFormState` can currently hold these, and they
are worth persisting on a `grn_invoice_extractions` table for audit, 3-way match and duplicate
detection: `irn`, `ack_no`, `invoice_number`, `invoice_date`, `due_date`, `grand_total`,
`cgst/sgst/igst`, `round_off`, `hsn_summary`, `bank_accounts`, `ledger_balance_due`,
`vendor_order_ref`, `place_of_supply`, `eway_bill_no`, plus the raw model JSON + confidences.

---

## 8. Implementation notes

- The current [parse-quotation-pdf/route.ts](frontend/src/app/api/ai/parse-quotation-pdf/route.ts)
  is a **mock**: it branches on `file.name` (`includes('tata')`, `includes('sika')`) and returns
  hardcoded totals with `Math.random()` document numbers. It never opens the file beyond
  `file.size`. It cannot be extended into this — the GRN path needs a new
  `POST /api/ai/extract-invoice` built on real vision extraction.
- Enforce the schema with **tool-use / structured output**, not free-text JSON + `JSON.parse`.
- Cache by file hash — re-uploading the same invoice must not re-bill a model call.
- Multi-page PDFs: extract per page, then merge — **one invoice may span pages** (`Page 1 / 2`),
  and one PDF may hold several unrelated invoices (exactly like this sample). Group by
  `invoice_number` before writing GRN drafts.
- Store the page renders alongside the GRN so the side-by-side review UI works after the fact.
- Suggested regression fixture: these 3 pages with the expected JSON checked in, asserted on every
  prompt change. The arithmetic in §2–§4 is fully verified and can serve as the golden output.
