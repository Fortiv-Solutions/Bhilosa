# Complete Module Analysis & Operational Guide — Pramukh Group ERP (V2)

> **Platform Overview**: Pramukh Group ERP V2 is a full-stack, 3-tier construction operations & resource planning platform. This document presents an exhaustive, deep-dive analysis of all 16 business modules powering the enterprise system.

---

## Master Architecture Map

```
                                  ┌─────────────────────────────────────────┐
                                  │      EXECUTIVE & PORTFOLIO CONTROL      │
                                  │   Dashboard (Mod 1) · Finance (Mod 12)  │
                                  └────────────────────┬────────────────────┘
                                                       │
               ┌───────────────────────────────────────┴───────────────────────────────────────┐
               │                                                                               │
               ▼                                                                               ▼
┌─────────────────────────────┐                                                 ┌─────────────────────────────┐
│    PROJECTS & EXECUTION     │                                                 │    SUPPLY CHAIN & VENDORS   │
│ Projects & Sites (Mod 2)    │                                                 │ Procurement Pipeline (Mod 4)│
│ Activities & DPR (Mod 3)    │                                                 │ Inventory & Stock (Mod 5)   │
│ Work Orders & BOQ (Mod 13)  │                                                 │ Vendor Master (Mod 6)       │
└──────────────┬──────────────┘                                                 └──────────────┬──────────────┘
               │                                                                               │
               ├───────────────────────────────┐               ┌───────────────────────────────┤
               │                               │               │                               │
               ▼                               ▼               ▼                               ▼
┌─────────────────────────────┐ ┌─────────────────────────────┐ ┌─────────────────────────────┐ ┌─────────────────────────────┐
│     WORKFORCE & ASSETS      │ │      QUALITY & SAFETY       │ │    BILLING & COST CONTROL   │ │  COMMUNICATION & INTEL      │
│ Labour & Attendance (Mod 7) │ │ QC & Inspections (Mod 9)    │ │ Billing & Verification(Mod10)│ │ Inbox, Voice & WA (Mod 14)  │
│ Equipment & Assets (Mod 8)  │ │ Safety & Rework (Mod 9)     │ │ Budget & Ledger (Mod 11)    │ │ AI Co-Pilot (Mod 15)        │
└─────────────────────────────┘ └─────────────────────────────┘ └─────────────────────────────┘ └─────────────────────────────┘
                                                                                               │
                                                                                               ▼
                                                                                ┌─────────────────────────────┐
                                                                                │     DOCUMENTS & ADMIN       │
                                                                                │ Attachments & Admin (Mod 16)│
                                                                                └─────────────────────────────┘
```

---

## 1. Dashboard & Portfolio Operations

### 1.1 Overview & Executive Scope
The central intelligence control tower that aggregates real-time metrics across active construction projects, financial spend velocity, site progress, supply chain bottlenecks, and operational risk factors.

* **Primary Route**: `/dashboard`, `/dashboard/execution`
* **Source Files**: [frontend/src/app/dashboard/page.tsx](file:///c:/Users/meetk/Pramukh-Group-AI-System-V2/frontend/src/app/dashboard/page.tsx) (1,235 lines)
* **Target Personas**: `UPPER_MANAGEMENT`, `PROJECT_MANAGER`, `PR_TEAM`

### 1.2 Key Data Structures & Metrics
- **Portfolio Summary Metrics**:
  - `totalProjectValue`: Aggregate contract valuation across active sites.
  - `overallProgress`: Weighted average physical progress % across all active phases.
  - `spentVsAllocated`: Total actual bill spend vs baseline allocated budget.
  - `activeDelays`: Count of un-resolved delay events (`delay_events` table).
- **AI Health Score Engine**: Algorithmic health index (0–100) calculated from three vectors:
  $$\text{Health Score} = 100 - (\text{Overdue DPR Penalty}) - (\text{Budget Variance Penalty}) - (\text{Open NCR Penalty})$$

### 1.3 Interactive Visualizations (Recharts)
- **AreaChart**: Portfolio Cash Flow Trend (Monthly Approved Spend vs Cash Outflow).
- **BarChart**: Project-by-Project Budget vs Actual Spend Comparison.
- **LineChart**: Daily Progress Velocity vs Targeted Completion Curve.

### 1.4 System Interconnections
- **Inputs**: Aggregates from `projects`, `portfolio_budget_summary` (DB View), `daily_progress_reports`, `stock_balances`, `vendor_bills`, and `delay_events`.
- **Outputs**: Action queue links to `/procurement`, `/billing`, `/qc`, and `/activities`.

---

## 2. Projects & Site Management

### 2.1 Overview & Organizational Scope
Manages the baseline hierarchy of construction projects, geographic sites, work breakdown phases, and role-based staff assignments.

* **Primary Routes**: `/projects`, `/projects/[id]`, `/projects/[id]/completion`
* **Source Files**: [frontend/src/app/projects/page.tsx](file:///c:/Users/meetk/Pramukh-Group-AI-System-V2/frontend/src/app/projects/page.tsx), [frontend/src/lib/projects.ts](file:///c:/Users/meetk/Pramukh-Group-AI-System-V2/frontend/src/lib/projects.ts)
* **Target Personas**: `UPPER_MANAGEMENT`, `PROJECT_MANAGER`

### 2.2 Functional Architecture
- **Site Master Management**: Configures project code, legal name, client details, site address, contract value, start/end dates, and project status (`planned`, `active`, `on_hold`, `completed`).
- **Phase Breakdown**: Maps sites into execution phases (Substructure, Superstructure, MEP, Finishing).
- **Project Membership & RLS Scoping**: Assigns users to sites (`project_members`). RLS helper function `can_access_project(project_id)` enforces data isolation so non-executives only view assigned sites.
- **Work Completion & Handover**: Manages pre-handover punch lists, certificate uploads, and formal project closure.

### 2.3 Key Database Tables
`projects`, `project_sites`, `project_phases`, `project_members`, `project_documents`, `project_health_scores`

---

## 3. Execution, Daily Activities & Daily Progress Reports (DPR)

### 3.1 Operational Scope
The core field operations module that tracks site activities, daily work submittals, labor deployment, equipment utilization, material consumption, and schedule delays.

* **Primary Route**: `/activities`
* **Source Files**: [frontend/src/app/activities/page.tsx](file:///c:/Users/meetk/Pramukh-Group-AI-System-V2/frontend/src/app/activities/page.tsx), [frontend/src/lib/dpr.ts](file:///c:/Users/meetk/Pramukh-Group-AI-System-V2/frontend/src/lib/dpr.ts), [frontend/src/lib/delays.ts](file:///c:/Users/meetk/Pramukh-Group-AI-System-V2/frontend/src/lib/delays.ts)
* **Target Personas**: `UPPER_MANAGEMENT`, `PROJECT_MANAGER`

### 3.2 Activity Lifecycle & State Machine
```
[planned] ──► [ready] ──► [in_progress] ──► [blocked] (Delay Event Logged)
                               │
                               ▼
                          [completed]
                               │
                               ▼
                         [qc_pending] ──► [approved] (Eligible for Billing)
```

### 3.3 Daily Progress Report (DPR) Workflow
1. **Submission**: Site Engineer logs daily completed quantities, weather conditions, manpower count, active machinery, and site photos.
2. **Material Deduction**: DPR submittal calculates material quantities consumed and updates site inventory records.
3. **Approval**: Project Manager reviews and calls `approveDPR()`, locking the record and advancing physical progress.
4. **Delay Management**: Logs delay incidents with root cause categories (Material Shortage, Weather, Labor Shortage, Client Scope Change, Equipment Breakdown), impact days, and resolution owners.

### 3.4 Key Database Tables
`construction_activities`, `activity_dependencies`, `daily_progress_reports`, `dpr_activity_lines`, `delay_events`, `activity_deletion_requests`

---

## 4. Procurement & Supply Chain Pipeline

### 4.1 Pipeline Architecture & Workbench Structure
The platform's largest module (over 3,700 lines of frontend logic and backend services) managing the end-to-end purchasing lifecycle from requisition to physical receiving.

* **Primary Route**: `/procurement`
* **Source Files**: 
  - Page: [frontend/src/app/procurement/page.tsx](file:///c:/Users/meetk/Pramukh-Group-AI-System-V2/frontend/src/app/procurement/page.tsx) (1,813 lines)
  - Service: [frontend/src/lib/procurement.ts](file:///c:/Users/meetk/Pramukh-Group-AI-System-V2/frontend/src/lib/procurement.ts) (1,956 lines)
  - Backend PDF Router: [backend/app/routers/procurement.py](file:///c:/Users/meetk/Pramukh-Group-AI-System-V2/backend/app/routers/procurement.py)
  - PDF Engine: [backend/app/services/pdf_generator.py](file:///c:/Users/meetk/Pramukh-Group-AI-System-V2/backend/app/services/pdf_generator.py)
* **Target Personas**: `UPPER_MANAGEMENT`, `PR_TEAM`

### 4.2 7-Stage Procurement Pipeline

```
┌────────────────────────┐    Stock Check    ┌────────────────────────┐
│  1. Material Request   ├──────────────────►│  2. Purchase Requisition│
│       (MR Desk)        │  (In-Stock Issue) │       (PR Desk)        │
└────────────────────────┘                   └───────────┬────────────┘
                                                         │ PDF Generated
                                                         ▼
┌────────────────────────┐    Comparison     ┌────────────────────────┐
│  4. Vendor Quotation   │◄──────────────────┤  3. Request for Quote  │
│    & Finalization      │    Scoring        │       (RFQ Desk)       │
└───────────┬────────────┘                   └────────────────────────┘
            │
            ▼
┌────────────────────────┐   Dispatch Log    ┌────────────────────────┐
│   5. Purchase Order    ├──────────────────►│  6. Delivery Tracking  │
│  (PO & Budget Commit)  │                   │       & Logistics      │
└────────────────────────┘                   └───────────┬────────────┘
                                                         │ Receiving
                                                         ▼
                                             ┌────────────────────────┐
                                             │ 7. Goods Receipt Note  │
                                             │   (GRN & Stock Post)   │
                                             └────────────────────────┘
```

#### Detailed Stage Breakdown:
1. **Material Request (MR)**: Site engineers log material needs. System triggers `review_material_request_inventory()`. Available stock is issued directly via Material Issue Slip (`material_issue_slips`). Unfulfilled items advance to PR.
2. **Purchase Requisition (PR)**: MR items converted into PRs (`purchase_requisitions`). Assigned to buyers. Python backend calls ReportLab service to generate formal PR PDF documents saved to Supabase Storage (`procurement-documents`).
3. **Request for Quotation (RFQ)**: Buyer selects qualified vendor categories (`rfqs`, `rfq_vendors`) and dispatches RFQ packages.
4. **Vendor Quotations & Finalization**: Vendor proposals logged (`vendor_quotations`). System computes automated multi-vendor comparison matrix (`quotation_scores`) assessing unit rate, payment terms, delivery timelines, and vendor historical rating. Winning vendor selected (`vendor_selections`).
5. **Purchase Order (PO)**: PO issued (`purchase_orders`, `purchase_order_lines`). **Crucial Integration**: RPC `approve_and_send_purchase_order` posts a **Budget Commitment** to `budget_ledger` (`transaction_type = 'commitment'`). Python backend generates formal Gold-Branded (`#b68d40`) PO PDF document.
6. **Delivery Tracking**: Tracks dispatch details, expected delivery dates, transporter names, LR/Bilty numbers, and transit statuses (`delivery_trackings`).
7. **Goods Receipt Note (GRN)**: Site store manager inspects shipment, logging accepted vs rejected quantities (`goods_receipt_notes`). Submitting GRN triggers DB trigger `post_grn_stock` to auto-post stock balances.

### 4.3 Key Database Tables
`material_requests`, `material_request_lines`, `purchase_requisitions`, `purchase_requisition_lines`, `purchase_requisition_assignments`, `rfqs`, `rfq_vendors`, `vendor_quotations`, `quotation_lines`, `quotation_scores`, `vendor_selections`, `purchase_orders`, `purchase_order_lines`, `delivery_trackings`, `goods_receipt_notes`, `goods_receipt_note_lines`

---

## 5. Inventory & Materials Management

### 5.1 Operational Scope
Maintains item catalogs, standardized Units of Measurement (UOM), stock locations, physical stock balances, stock ledger audits, and low-stock alerts.

* **Primary Routes**: `/inventory`, `/materials`
* **Source Files**: [frontend/src/app/inventory/page.tsx](file:///c:/Users/meetk/Pramukh-Group-AI-System-V2/frontend/src/app/inventory/page.tsx), [frontend/src/lib/erp/supabase-modules.ts](file:///c:/Users/meetk/Pramukh-Group-AI-System-V2/frontend/src/lib/erp/supabase-modules.ts)
* **Target Personas**: `UPPER_MANAGEMENT`, `PROJECT_MANAGER`, `PR_TEAM`

### 5.2 Stock Movement Architecture & Database Triggers

```
                           Stock Movement Inputs
                                     │
    ┌────────────────────────────────┼───────────────────────────────┐
    │                                │                               │
    ▼                                ▼                               ▼
GRN Receipt                    Site Issue Slip                  Stock Adjustment
(Trigger: post_grn_stock)      (Trigger: post_issue_stock)      (Manual Audit)
(+) Increment Balance          (-) Decrement Balance            (+/ - Correction)
    │                                │                               │
    └────────────────────────────────┼───────────────────────────────┘
                                     │
                                     ▼
                    ┌─────────────────────────────────┐
                    │     `stock_balances` Table      │
                    │   (Current Quantity On-Hand)    │
                    └────────────────┬────────────────┘
                                     │
                                     ▼
                    ┌─────────────────────────────────┐
                    │      `stock_ledger` Table       │
                    │   (Immutable Audit Trail)       │
                    └─────────────────────────────────┘
```

### 5.3 Key Database Tables & RPCs
`item_master`, `item_categories`, `unit_of_measurements`, `inventory_locations`, `stock_balances`, `stock_ledger`, `stock_reservations`, `stock_transfers`, `material_issue_slips`, `consumption_variances`  
* **RPCs**: `issue_material_from_stock()`, `review_material_request_inventory()`

---

## 6. Vendor Management

### 6.1 Operational Scope
Handles vendor registration, compliance records, GST/PAN verification, vendor document repositories, and multi-criteria performance reviews.

* **Primary Route**: `/vendors`
* **Source File**: [frontend/src/app/vendors/page.tsx](file:///c:/Users/meetk/Pramukh-Group-AI-System-V2/frontend/src/app/vendors/page.tsx)
* **Target Personas**: `UPPER_MANAGEMENT`, `PR_TEAM`

### 6.2 Key Functionality
- **Vendor Master**: Legal name, trade display name, address, contact persons, tax IDs.
- **Duplicate Prevention**: Database schema enforces unique constraints on `gst_number` and `pan_number` to prevent duplicate vendor entries.
- **Performance Evaluation Engine**: Calculates vendor rating scores (`vendor_performance_reviews`) based on:
  - **On-Time Delivery %**: Comparison of PO delivery date vs actual GRN receiving date.
  - **Quality Acceptance %**: Ratio of accepted vs rejected quantities on GRNs.
  - **Commercial Compliance**: Price stability across quotation cycles.

### 6.3 Key Database Tables
`vendors`, `vendor_contacts`, `vendor_documents`, `vendor_categories`, `vendor_category_map`, `vendor_performance_reviews`

---

## 7. Workforce & Labour Management

### 7.1 Operational Scope
Tracks sub-contractor trade teams, daily attendance muster rolls, skill classifications, and site labor deployment.

* **Primary Route**: `/labour`
* **Source File**: [frontend/src/lib/labour.ts](file:///c:/Users/meetk/Pramukh-Group-AI-System-V2/frontend/src/lib/labour.ts)
* **Target Personas**: `UPPER_MANAGEMENT`, `PROJECT_MANAGER`

### 7.2 Functional Architecture
- **Contractor Registry**: Master index of labor contractors and specialized trade teams (Masonry, Steel Fixing, Shuttering, Plumbing, Electrical).
- **Muster Roll Tracking**: Logs daily headcount deployment by trade category, shift, and site location.
- **Productivity Analysis**: Links labor headcounts recorded in DPRs against completed activity quantities to derive labor output productivity metrics.

### 7.3 Key Database Tables
`contractors`, `labour_attendance`, `work_orders`, `work_order_lines`

---

## 8. Equipment & Assets

### 8.1 Operational Scope
Tracks heavy construction machinery, equipment assets, daily operating hours, meter logs, fuel usage, and preventive maintenance.

* **Primary Route**: `/equipment`
* **Source File**: [frontend/src/lib/equipment.ts](file:///c:/Users/meetk/Pramukh-Group-AI-System-V2/frontend/src/lib/equipment.ts)
* **Target Personas**: `UPPER_MANAGEMENT`, `PROJECT_MANAGER`

### 8.2 Functional Architecture
- **Asset Master**: Equipment registration, machine category (Excavator, Tower Crane, Concrete Pump, Transit Mixer), ownership type (Owned vs Rented), hourly rate.
- **Usage & Fuel Logs**: Daily meter readings, runtime hours, site location, and diesel fuel consumption.
- **Maintenance Records**: Breakdown history, service logs, and maintenance expenditure (`equipment_maintenance_logs`).

### 8.3 Key Database Tables & RPCs
`equipment_assets`, `equipment_usage_logs`, `equipment_maintenance_logs`  
* **RPC**: `increment_equipment_usage` (atomic update of machine runtime hours)

---

## 9. Quality Control, Safety & Rework

### 9.1 Operational Scope
Enforces physical quality standards via standardized checklist templates, site photo inspections, AI Vision defect detection, and Non-Conformance Reports (NCR).

* **Primary Routes**: `/qc`, `/qc/templates`, `/safety-qc`, `/rework`
* **Source Files**: 
  - Page: [frontend/src/app/qc/page.tsx](file:///c:/Users/meetk/Pramukh-Group-AI-System-V2/frontend/src/app/qc/page.tsx)
  - Backend AI Router: [backend/app/routers/qc.py](file:///c:/Users/meetk/Pramukh-Group-AI-System-V2/backend/app/routers/qc.py)
  - Service: [frontend/src/lib/safety-qc.ts](file:///c:/Users/meetk/Pramukh-Group-AI-System-V2/frontend/src/lib/safety-qc.ts)
* **Target Personas**: `UPPER_MANAGEMENT`, `PROJECT_MANAGER`

### 9.2 Quality Control & AI Vision Workflow

```
Site Photo Upload ──► /api/qc/analyze (OpenAI Vision) ──► Defect Report Generated
                                                             │
           ┌─────────────────────────────────────────────────┴─────────────────────────────────┐
           │                                                                                   │
           ▼                                                                                   ▼
    [QC Passed]                                                                         [QC Failed / Defect]
           │                                                                                   │
           ▼                                                                                   ▼
Mark Activity Approved                                                                Generate NCR & Rework Task
(Eligible for Billing)                                                                (Blocks Vendor Billing)
```

1. **Checklist Templates**: Standardized quality audit items per activity type.
2. **AI Inspection Engine**: Upload site images to `/api/qc/analyze` (OpenAI Vision). AI evaluates structural integrity, honeycombing, rebar spacing, and safety violations.
3. **NCR & Rework Management**: Failed items generate a formal Non-Conformance Report (`non_conformance_reports`) assigning corrective rework tasks to engineers.
4. **Billing Gate**: Pending NCRs or failed QC checks automatically block vendor invoice verification.

### 9.3 Key Database Tables
`qc_checklist_templates`, `qc_checklist_template_items`, `qc_inspections`, `qc_inspection_items`, `non_conformance_reports`

---

## 10. Billing & Invoice Verification

### 10.1 Operational Scope
Processes vendor bills, performs duplicate invoice checks, executes 3-way matching (PO $\leftrightarrow$ GRN $\leftrightarrow$ Bill), and manages approval routing.

* **Primary Route**: `/billing`
* **Source Files**: [frontend/src/app/billing/page.tsx](file:///c:/Users/meetk/Pramukh-Group-AI-System-V2/frontend/src/app/billing/page.tsx), [frontend/src/lib/billing.ts](file:///c:/Users/meetk/Pramukh-Group-AI-System-V2/frontend/src/lib/billing.ts)
* **Target Personas**: `UPPER_MANAGEMENT` (Operational reviews by PR & Finance)

### 10.2 Three-Way Matching Engine (`runThreeWayMatch`)

$$\text{Purchase Order (PO) Value} \quad \longleftrightarrow \quad \text{GRN Accepted Value} \quad \longleftrightarrow \quad \text{Vendor Invoice Amount}$$

- **Duplicate Check**: Scans `vendor_bills` for duplicate `(vendor_id + bill_number)` or identical total amount records.
- **Tolerance Gate**: Compares invoice total against PO value and GRN accepted value within a configurable 5% tolerance window. Mismatches set status to `correction_required` and flag `three_way_matches`.
- **Approval & Ledger Posting**: Approving a bill (`approve_vendor_bill` RPC) triggers DB trigger `post_bill_budget_ledger` to release PO commitments and record actual financial spend.

### 10.3 Key Database Tables & RPCs
`vendor_bills`, `vendor_bill_lines`, `bill_documents`, `three_way_matches`, `payment_approvals`  
* **RPCs / Triggers**: `verify_vendor_bill()`, `approve_vendor_bill()`, Trigger: `post_bill_budget_ledger`

---

## 11. Budget Control & Cost Allocation

### 11.1 Operational Scope
Provides baseline budget creation, cost code tracking, commitment tracking, actual spend ledger recording, and threshold alert enforcement.

* **Primary Route**: `/budget`
* **Source File**: [frontend/src/lib/budget.ts](file:///c:/Users/meetk/Pramukh-Group-AI-System-V2/frontend/src/lib/budget.ts)
* **Target Personas**: `UPPER_MANAGEMENT`

### 11.2 Real-time Budget Formula & Alert Logic

$$\text{Remaining Budget} = \text{Allocated Amount} - \text{Committed Amount} - \text{Spent Amount}$$

```
                           Budget Transaction Events
                                       │
         ┌─────────────────────────────┼─────────────────────────────┐
         │                             │                             │
         ▼                             ▼                             ▼
   Allocation                    PO Commitment                 Bill Approval
(Type: allocation)            (Type: commitment)            (Type: actual & release)
(+) Total Budget              (+) Committed Spend           (-) Release Commitment
                              (-) Available Budget          (+) Actual Spend Recorded
```

- **Warning Threshold**: Breaching defined allocation threshold (e.g. 85%) creates a pending `budget_alerts` record.
- **Hard Limit Threshold**: Reaching 100% budget utilization blocks subsequent PO issuance.

### 11.3 Key Database Tables & RPCs
`cost_codes`, `budget_heads`, `budget_allocations`, `budget_ledger`, `budget_alerts`, `portfolio_budget_summary` (View)  
* **RPCs**: `create_budget_allocation()`, `revise_budget_allocation()`, `approve_budget_allocation()`, `resolve_budget_alert()`

---

## 12. Finance Cockpit & Accounts Payable

### 12.1 Operational Scope
Executive financial cockpit managing portfolio spend metrics, vendor payments, Accounts Payable (AP) aging reports, and cash flow projections.

* **Primary Route**: `/finance` (1,597 lines across 7 tabs)
* **Source File**: [frontend/src/lib/finance.ts](file:///c:/Users/meetk/Pramukh-Group-AI-System-V2/frontend/src/lib/finance.ts)
* **Target Personas**: `UPPER_MANAGEMENT`

### 12.2 Accounts Payable (AP) Aging Analysis
Categorizes all unpaid approved vendor bills across 4 aging buckets:
- **0–30 Days**: Current liabilities.
- **31–60 Days**: Approaching payment due.
- **61–90 Days**: Overdue bills requiring priority release.
- **90+ Days**: Critical overdue liabilities.

### 12.3 Payment Recording (`recordVendorPayment`)
- Validates vendor bill status is `approved`.
- Writes payment entry to `payments` table (tracks UTR/NEFT reference, payment mode, date, and amount).
- Transitions vendor bill status and payment status to `paid`.

### 12.4 Key Database Tables
`payments`, `vendor_bills`, `portfolio_budget_summary`

---

## 13. Bill of Quantities (BOQ) & Work Orders

### 13.1 Operational Scope
Manages client contract BOQ item baselines and trade contractor Work Orders.

* **Primary Routes**: `/boq`, `/work-orders`
* **Target Personas**: `UPPER_MANAGEMENT`, `PROJECT_MANAGER`

### 13.2 Key Functionality
- **BOQ Baseline**: Master record of baseline bill items, contract unit rates, and total estimated quantities (`boq_items`).
- **Work Orders**: Contracts issued to sub-contractors specifying scope items, rates, and target dates (`work_orders`, `work_order_lines`).
- **Contractor Running Bills**: Validates executed quantities against Work Order caps prior to payment processing.

### 13.3 Key Database Tables
`boq_items`, `work_orders`, `work_order_lines`, `work_order_activities`

---

## 14. Inbox, Voice & WhatsApp Communication

### 14.1 Operational Scope
Project-scoped real-time chat, voice note transcription, AI site photo analysis, and external WhatsApp outbound message dispatch.

* **Primary Routes**: `/inbox`, `/communication`
* **Source Files**: 
  - Component: [frontend/src/components/projects/inbox-module.tsx](file:///c:/Users/meetk/Pramukh-Group-AI-System-V2/frontend/src/components/projects/inbox-module.tsx) (32.6 KB)
  - Service: [frontend/src/lib/inbox.ts](file:///c:/Users/meetk/Pramukh-Group-AI-System-V2/frontend/src/lib/inbox.ts)
  - Backend AI Router: [backend/app/routers/ai.py](file:///c:/Users/meetk/Pramukh-Group-AI-System-V2/backend/app/routers/ai.py)
* **Target Personas**: All roles (`UPPER_MANAGEMENT`, `PROJECT_MANAGER`, `PR_TEAM`)

### 14.2 Technical Architecture
- **Real-time WebSockets**: Chat messages synced live via Supabase Realtime changes on `messages`.
- **Whisper Voice Transcription**: Audio files sent to `/api/transcribe` (OpenAI Whisper) to convert voice notes into searchable text body.
- **Automated Site Inspection**: Images posted in the "Site-Inspection" channel automatically trigger `/api/site-inspection` (OpenAI Vision) and post an automated structural report.
- **WhatsApp Relay**: Sends outbound SMS/WhatsApp notifications via `/api/send-message` (`outbound_messages` table).

### 14.3 Key Database Tables
`message_threads`, `conversations`, `conversation_members`, `messages`, `raw_messages`, `media_files`, `transcriptions`, `outbound_messages`, `whatsapp_numbers`

---

## 15. AI Assistant & Project Intelligence

### 15.1 Operational Scope
Conversational AI co-pilot answering natural language queries about project status, delays, procurement, stock levels, budget, and vendors.

* **Primary Route**: `/ai-assistant`
* **Source Files**: [frontend/src/components/floating-chatbot.tsx](file:///c:/Users/meetk/Pramukh-Group-AI-System-V2/frontend/src/components/floating-chatbot.tsx) (22.5 KB), [backend/app/routers/ai.py](file:///c:/Users/meetk/Pramukh-Group-AI-System-V2/backend/app/routers/ai.py)
* **Target Personas**: All roles

### 15.2 Dual Execution Strategy
- **OpenAI Engine**: Uses `gpt-4o-mini` with custom system prompt ("Pramukh Group Project Intelligence Assistant") injected with live project context.
- **Local Rule Fallback**: If no OpenAI API key is configured, uses rule-based keyword matching to output formatted markdown tables for Delays, Spend, Inventory, Vendors, and Messages.
- **Floating Shell Widget**: Persistent bottom-right drawer with full markdown table rendering and copy tools.

---

## 16. Documents, Reports, Users & Settings

### 16.1 Operational Scope
Administrative infrastructure managing document attachments, CSV portfolio reporting, user role assignments, notification rules, and license enforcement.

* **Primary Routes**: `/documents`, `/reports`, `/analytics`, `/notifications`, `/users`, `/settings`
* **Source Files**: [frontend/src/lib/documents.ts](file:///c:/Users/meetk/Pramukh-Group-AI-System-V2/frontend/src/lib/documents.ts), [backend/app/routers/users.py](file:///c:/Users/meetk/Pramukh-Group-AI-System-V2/backend/app/routers/users.py)
* **Target Personas**: `UPPER_MANAGEMENT` (Users & Admin restricted to Executives)

### 16.2 Key Features
- **Cross-Module Attachments**: Unified attachment pipeline (`uploadEntityAttachment()`) using Supabase Storage (`project-documents`) linked to any entity (`projects`, `daily_progress_reports`, `purchase_orders`, `goods_receipt_notes`, `vendor_bills`, `qc_inspections`).
- **CSV Portfolio Reports**: Generates downloadable executive portfolio CSV digests.
- **User Administration**: Creates/deletes users in Supabase Auth via GoTrue Admin API (`/api/users`) and configures RBAC profiles.
- **License Protection**: `LayoutWrapper` periodically calls `/api/check-license`. Suspended licenses render a full-screen lockout blur overlay.

### 16.3 Key Database Tables
`entity_attachments`, `document_versions`, `notifications`, `notification_preferences`, `profiles`, `user_site_assignments`, `audit_logs`, `system_config`
