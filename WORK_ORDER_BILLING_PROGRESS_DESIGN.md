# Work Order → Billing Eligibility: Progress, Milestones & Service Bill Linkage

**Date:** 2026-08-08
**Scope:** Design options for capturing billing conditions as structured, trackable data.
**Status:** Design proposal. Nothing implemented.
**Companion to:** `WORK_ORDER_MODULE_ANALYSIS.md`

---

## 1. Where the module actually stands

Two facts change the shape of this problem.

### 1.1 The field you need already exists — and is enforced nowhere

`wo_commercial_terms.ra_requires_full_activity boolean NOT NULL DEFAULT true`

It encodes exactly the corpus rule *"RA shall be raised only for activity which is 100% Complete."*
It is declared in Stage 5, defaulted to `true` in `fn_wo_terms`, and typed in
`frontend/src/lib/wo-commercial-terms.ts`.

**No trigger, function, view or query reads it.** It is a dead column. Same for
`payment_terms_type` (`on_completion` | `days_after_bill` | `monthly_ra` | `advance_and_completion`)
— stored, never enforced.

### 1.2 Every existing Service Bill gate is a *value* gate. None is a *progress* gate.

| Trigger | Guards |
|---|---|
| `trg_service_bill_require_active_wo` | WO is issued/active |
| `trg_sb_rate_variance_guard` | rate matches the contract |
| `trg_service_bill_wo_balance` | value stays within contract |
| `trg_sb_over_measurement_guard` | cumulative qty ≤ contracted qty (rate-based exempt) |
| `trg_service_bill_qc_gate` | QC inspection passed |
| `trg_service_bill_evidence_gate` | a *verified* measurement sheet backs the bill |

Nothing asks **"is this scope complete enough to bill?"** — which is precisely the question your
Work Orders answer in prose and your certificates answer with `% of Work Completed = 1`.

### 1.3 `wo_payment_stages` is a definition table with no state

```sql
wo_payment_stages (
  id, work_order_id, project_id,
  sequence_no, stage_name, stage_percent,   -- must sum to 100
  created_at, updated_at
)
```

No `status`, no `completed_at`, no `billed_by`. It says how the money *divides*; it cannot say what
has *happened*. Your instinct that something is missing is correct.

---

## 2. Is your proposed approach right?

> *"I may need a separate Work Progress / Billing Progress section within the Work Order details."*

**Right instinct, one correction that matters.**

**Right:** the Work Order Detail page needs a section that shows, per activity/stage: what is done,
what is certified, what is billed, what is claimable. That section does not exist and nothing else
answers those questions.

**The correction:** if that section is a form where a Site Engineer *types a completion percentage*,
you have created a **third independent number** alongside measured quantity and billed quantity.
Three hand-maintained numbers that must agree will not agree.

Your own corpus proves it. The certificate template already has a progress field:

> `% of Work Completed` — populated on 603 lines, **value `1` on every single one.**

A free-typed progress field degenerates into a formality within months. The redesign must not
reproduce it under a new name.

**The rule:** progress is an *assertion that must be evidenced*, and for measurable work the
evidence already exists — the Measurement Sheet. So:

- **Measurable work** → progress is **derived** from verified measurement sheets. Never typed.
- **Non-measurable milestones** (mobilisation advance, "50% on completion", material delivery) →
  progress is **claimed + evidenced + verified**, as an append-only event with attachments and a
  separate verifier. Not a mutable percent field.

The panel is a **cockpit**, not a data-entry form. It reads state and launches the two actions that
can legitimately change it (record measurement / claim milestone).

---

## 3. How enterprise ERP systems handle this

| System | Mechanism |
|---|---|
| **SAP** (PS / SD) | **Billing Plan** on the contract or WBS element, type *Milestone* or *Periodic*. Each milestone carries a % or fixed value and a **billing block**. Confirming the linked network activity **releases the block**, making the milestone invoiceable. |
| **Oracle Projects** | **Billing Events** with event types; percent-complete and deliverable-based invoicing methods. Events are generated, approved, then drawn into an invoice. |
| **Dynamics 365 Project Operations** | Contract lines decomposed into **milestones** with status `Ready to Invoice` → `Invoiced`. |
| **AIA G702/G703** (US construction standard) | **Schedule of Values.** Each line: Scheduled Value · Previous Applications · This Period · Stored Materials · Total to Date · **%** · Balance to Finish · Retainage. The Application for Payment draws from it. |
| **Indian practice** (CPWD/PWD, FIDIC) | **RA bills against the Measurement Book.** The BOQ is the schedule of values; the MB is the evidence; each RA carries up-to-date and previous quantities. |

**The invariant across all five:**

> A contract is decomposed **once** into billable units, each with a scheduled value and an
> eligibility rule. Progress is recorded **against units**. Invoices **draw from** units. Each unit
> tracks previously-billed / this-period / balance.

None of them stores a single contract-level "% complete" and bills off it.

> **Your Payment Certificate is a degenerate G703.** It has Items / Qty / Rate / Amount but no
> Previous / This Period / Balance columns — which is exactly why cumulative figures ended up in
> unlabelled stray cells (`O14`, `P14`, `K31`).

---

## 4. Four approaches

### Approach A — Completion % on the Work Order header

Add `completion_percent` to `work_orders`; enforce the existing `ra_requires_full_activity`.

**Pros** — Smallest possible change. Closes the 100%-completion case in one trigger. No new tables.
**Cons** — Handles *only* that case. No milestone support. A typed % with no evidence, reproducing
the `603 × 1` failure. No billed-vs-pending tracking. Useless for the plumbing Work Order.

**Verdict:** insufficient. Viable only as a stopgap.

---

### Approach B — Add state to `wo_payment_stages` (your instinct, minimal form)

Add `status`, `completed_at`, `completed_by`, `verified_by`, `billed_service_bill_id`.
Service Bill selects a stage; a gate blocks unless `status = 'verified'`.

**Pros** — Matches the mental model directly. Small, incremental. Makes stages trackable and gives
billed-vs-pending for free. Reuses a table that already exists.
**Cons**
- Stages are **Work-Order-wide percentages**. They do not decompose per scope line or tower, so
  *"Tower C-D inlet fitting done, Tower G not"* cannot be expressed — and that is exactly how the
  plumbing certificates bill (`1st Floor`, `2 Flat` at a time).
- All-or-nothing: a stage is complete or not. Partial claims impossible.
- **Covers only stage-billed contracts.** 11 of your 13 Work Orders have no stages at all, so the
  100%-completion and measured-quantity cases stay unsolved.
- Marking complete is still an unevidenced click.

**Verdict:** correct direction, insufficient coverage. It solves 2 of 13 documents.

---

### Approach C — Unified Billable Item (Schedule of Values) ★ recommended

**One** table is the canonical unit of claim, generated from the contract at issue time — whatever
the contract's shape.

```
wo_billable_items
  work_order_id · work_order_line_id? · payment_stage_id? · scope_group_id?
  sequence_no · item_label

  basis            'quantity' | 'stage_percent' | 'milestone_event' | 'lump_sum'
  scheduled_value  -- the SOV amount (NULL for open rate-based)
  contracted_quantity · unit · rate

  eligibility_rule 'on_measured_quantity'
                 | 'on_full_line_completion'      -- "RA only for 100% complete activity"
                 | 'on_full_wo_completion'        -- ra_requires_full_activity
                 | 'on_milestone_event'           -- advance, delivery, handover
  allows_partial_billing · requires_qc_pass · requires_joint_measurement
  depends_on_item_id      -- sanitary cannot bill before inlet

  status  not_started → in_progress → claimed → verified → partially_billed → billed → closed
```

Generation by `contract_basis`:

| Contract shape | Billable items produced |
|---|---|
| `lump_sum`, no stages (AC Installation) | 1 item, `on_full_wo_completion` |
| `percentage_stage` (Plumbing) | line × stage matrix, `on_full_line_completion` |
| `schedule_of_rates` (Railing, Colour, Louvers) | 1 per scope line, `on_measured_quantity`, partial allowed |
| advance + completion (Louvers 50/50) | 1 `milestone_event` (advance) + N quantity items |

Progress arrives two ways, never typed:

```
wo_progress_events              -- append-only, mirrors your work_order_status_history pattern
  billable_item_id
  event_type  'progress'|'completion_claim'|'verification'|'rejection'
  measured_from_sheet_id        -- quantity-based: derived from a verified measurement sheet
  claimed_quantity / claimed_percent
  attachment_ids                -- milestone-based: photos, delivery note, handover certificate
  claimed_by · claimed_at · verified_by · verified_at · rejection_reason
```

Current status is the **fold of the events**, so the audit trail is free.

**Pros**
- **One model covers all 13 Work Orders** and every future shape.
- One gate, one panel, one mental model — instead of a special case per contract type.
- Billed-vs-pending is a column, not a report.
- Maps 1:1 to AIA G703 and to SAP billing plans, so the printed certificate becomes correct by
  construction.
- Extensible to per-item retention, advance recovery, and stage dependencies.
- **Removes the destructive stage decomposition** (`rpc_generate_wo_stage_lines` deleting base
  lines): billable items are *derived*, so contract lines stay intact. Closes Gap 2 of the analysis.

**Cons**
- Most upfront design. Needs a generator per `contract_basis`.
- Existing Work Orders need backfilling.
- One more layer between line and bill — a bad abstraction here is expensive to unwind.

---

### Approach D — Derive everything from measurement sheets, no billable-item table

**Pros** — Zero duplication; single source of truth.
**Cons** — Milestones with no measurable quantity (advance, handover) have nothing to attach to.
"Which stage is due?" requires re-deriving contractual intent on every query. No place to record
*eligibility* as distinct from *measurement*.

**Verdict:** rejected. It cannot represent non-measurable milestones, which are 2 of your 13.

---

## 5. Recommendation

**Approach C, delivered through B.**

B's columns are a strict subset of C. Ship in slices, each independently useful:

| Slice | Delivers | Unblocks |
|---|---|---|
| **1** | `wo_billable_items` + generator for `lump_sum` and `schedule_of_rates` | The 100%-completion gate — enforce the dead `ra_requires_full_activity` |
| **2** | `wo_progress_events` + derive quantity progress from verified measurement sheets | Real progress, evidenced, no typing |
| **3** | Stage generator (line × stage) + dependency ordering | The plumbing case, per tower/floor |
| **4** | `wo_billing_position` view + Progress & Billing panel | The cockpit |
| **5** | Service Bill creation from eligible items only | Kills free-typed billing |
| **6** | Milestone events with attachments | Advance / delivery / handover |

Do **not** ship A. It is the field that becomes 603 cells of `1`.

---

## 6. How progress, stages and Service Bills link

```
Work Order (contract_basis, commercial terms)
     │
     ├── work_order_lines ──────────► scope as contracted (immutable once live)
     │
     ├── wo_payment_stages ─────────► how value divides (%)
     │
     └── wo_billable_items ─────────► THE UNIT OF CLAIM  ◄── generated from the two above
              │                        scheduled_value · eligibility_rule · status
              │
              ├── wo_progress_events   append-only: claim → evidence → verify
              │        ▲
              │        └── measurement_sheets (verified)   ← evidence for quantity items
              │            attachments                     ← evidence for milestone items
              │
              └── service_bill_lines.billable_item_id      ← NEW FK: the bill draws from items
                       │
                       └── service_bills → payment_certificate_view → treasury
```

**One new FK does most of the work:** `service_bill_lines.billable_item_id`.
It is what makes billed-vs-pending computable, and it is what the 149 certificates lack — they carry
no contract reference at all.

### The single gate

```
trg_sb_eligibility_gate  (BEFORE INSERT/UPDATE on service_bill_lines)
```

resolves the line's billable item and refuses it unless eligible:

| `eligibility_rule` | Passes when |
|---|---|
| `on_full_wo_completion` | **every** billable item on the WO is `verified` |
| `on_full_line_completion` | this item's measured qty = contracted qty **and** verified |
| `on_measured_quantity` | `certified_qty > previously_billed_qty` (partial allowed) |
| `on_milestone_event` | a verified `completion_claim` event exists |

Plus: `depends_on_item_id` must be `billed` or later, and `requires_qc_pass` is satisfied.

Every refusal returns a **`blocking_reason`** — that string is what the UI shows, and it is the
difference between a usable system and one people work around.

### Billed vs pending

One view, `wo_billing_position`, one row per billable item:

```
scheduled_value · measured_qty · certified_qty · certified_value
previously_billed_value · claimable_now_value · retention_held · balance_to_bill
percent_complete · status · blocking_reason
```

| Your question | Column |
|---|---|
| Which milestone is complete? | `status` |
| What % is executed? | `percent_complete` (value-weighted roll-up per WO) |
| Which payment stage is due? | `claimable_now_value > 0` |
| What is already billed? | `previously_billed_value` |
| Why can't I bill this? | `blocking_reason` |

---

## 7. UI

### 7.1 Work Order Detail — new "Progress & Billing" section

`src/app/work-orders/[id]/page.tsx` is a stacked list of `<section>` cards (no tabs). This slots in
after `FinancialPositionPanel`, before `VariationsPanel`, as
`components/work-orders/billing-progress-panel.tsx`.

**Header strip:** Contract value · Certified to date · Billed to date · Retention held ·
Balance to bill · **Overall % complete (value-weighted)**

**Schedule of Values table** — deliberately the G703 column set:

| # | Billable item | Basis | Scheduled | % Done | Certified | Billed | **Claimable now** | Status |
|---|---|---|---|---|---|---|---|---|
| 1 | Inlet Fitting — Tower C-D (20%) | stage | 6,70,000 | 100% | 6,70,000 | 6,70,000 | — | `billed` |
| 2 | Internal Drainage — Tower C-D (10%) | stage | 3,35,000 | 100% | 3,35,000 | — | **3,35,000** | `verified` |
| 3 | Waterproofing — Tower C-D (25%) | stage | 8,37,500 | 40% | — | — | — | `in_progress` |

Row actions by role:
- **Site Engineer** → *Record measurement* (opens the existing `measurement-sheet-modal`,
  pre-filtered to that item) · *Claim completion* (milestone items — attachment mandatory)
- **Verifier / PM** → *Verify* · *Reject with reason*
- **Accounts** → *Create Service Bill from selected*

Ineligible rows stay visible and greyed, showing `blocking_reason`. Visibility of *why* is what
stops people from working around the gate.

### 7.2 Service Bill module

Bill creation stops being a blank form. Select the Work Order → the system lists **eligible billable
items** with claimable amounts pre-filled; ineligible items are shown greyed with their reason.

- Rate is drawn from the contract (the rate-variance guard already exists — this stops the argument
  before it starts).
- Quantity defaults to `certified − previously billed`.
- Deductions (retention, advance recovery, TDS, debits) computed from `wo_commercial_terms`.

This is what prevents the corpus failure where the stage % was typed into the item description and
the stage rate was hand-derived (`20% × 31,900 = 6,380`).

### 7.3 Work Order list

Add a **% complete** bar and a **Claimable now** column. That single column turns the list into a
billing worklist and answers "what can we invoice this month?" without opening anything.

---

## 8. Decisions needed

1. **Who verifies?** Does the Site Engineer's completion claim need a second person (PM / QS) before
   it becomes billable? Recommended yes — a self-verified claim is the `603 × 1` failure again.
2. **Retention per item or per bill?** AIA holds per line; your certificates hold per bill. Per bill
   is simpler and matches the template.
3. **Partial stage billing.** If Tower C-D inlet is done but Tower G is not, may 60% of the stage be
   billed? Approach C supports it via per-scope-group items; confirm the business wants it.
4. **Rate-based with no ceiling.** 62% of the corpus. Eligibility works on measured quantity, but
   without a ceiling there is no `scheduled_value` and `% complete` is undefined. Ties back to the
   open decision in `WORK_ORDER_MODULE_ANALYSIS.md` §11.1.
5. **Backfill.** Do live Work Orders get billable items generated retroactively, or does the model
   apply only to new ones?
