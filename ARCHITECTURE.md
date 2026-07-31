# Architecture — Pramukh Group ERP Platform (V2)

> **Pragati Project Management Platform** — A full-stack construction ERP system for multi-site project management, procurement, inventory, billing, budget control, quality assurance, and AI-powered operations intelligence.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Repository Structure](#2-repository-structure)
3. [Technology Stack](#3-technology-stack)
4. [Frontend Architecture](#4-frontend-architecture)
5. [Backend Architecture](#5-backend-architecture)
6. [Database Architecture](#6-database-architecture)
7. [Authentication & Authorization](#7-authentication--authorization)
8. [API Surface](#8-api-surface)
9. [Data Flow Patterns](#9-data-flow-patterns)
10. [Module Reference](#10-module-reference)
11. [Module Interconnections](#11-module-interconnections)
12. [Deployment](#12-deployment)
13. [Environment Configuration](#13-environment-configuration)
14. [Key Design Decisions](#14-key-design-decisions)

---

## 1. System Overview

The platform is a **monorepo** containing two independently deployable services that share a single Supabase PostgreSQL database:

```
┌──────────────────────────────────────────────────────────────────┐
│                        Browser / Client                          │
└───────────────┬──────────────────────────────┬───────────────────┘
                │                              │
        ┌───────▼───────┐              ┌───────▼───────┐
        │   Frontend    │   rewrites   │   Backend     │
        │  Next.js 16   │─────────────▶│  FastAPI      │
        │  (Railway)    │              │  (Railway)    │
        └───────┬───────┘              └───────┬───────┘
                │                              │
                │  Supabase JS Client          │  SQLAlchemy
                │  (Direct CRUD + RPC)         │  (DB queries)
                │                              │  Supabase Admin API
                │                              │  OpenAI API
        ┌───────▼──────────────────────────────▼───────┐
        │              Supabase Cloud                   │
        │  ┌──────────┐ ┌─────────┐ ┌────────────────┐ │
        │  │PostgreSQL│ │  Auth   │ │ Object Storage │ │
        │  │ 80+ tbls │ │  (JWT)  │ │ (documents)    │ │
        │  │ RLS + RPC│ │         │ │                │ │
        │  └──────────┘ └─────────┘ └────────────────┘ │
        │  ┌──────────────────────────────────────────┐ │
        │  │           Realtime Engine                │ │
        │  │  (Postgres Changes subscriptions)        │ │
        │  └──────────────────────────────────────────┘ │
        └──────────────────────────────────────────────┘
```

**Key principle:** The frontend communicates directly with Supabase for ~90% of data operations (CRUD, RPCs, realtime, storage). The Python backend handles only specialized server-side tasks: AI inference, PDF generation, user administration, and outbound messaging.

---

## 2. Repository Structure

```
pramukh-erp-monorepo/
├── package.json                  # Root monorepo scripts (concurrently)
├── ARCHITECTURE.md               # ← This file
├── Plan.Txt                      # 17-phase implementation roadmap
├── railway.json                  # Root Railway config
│
├── frontend/                     # Next.js 16 application
│   ├── Dockerfile                # Multi-stage Docker build (node:20-alpine)
│   ├── railway.json              # Railway service config
│   ├── next.config.ts            # API rewrites, standalone output
│   ├── package.json              # Dependencies
│   ├── prisma/
│   │   └── schema.prisma         # Legacy Prisma schema (secondary)
│   ├── public/                   # Static assets
│   └── src/
│       ├── app/                  # Next.js App Router pages + layouts
│       │   ├── layout.tsx        # Root layout (Providers, SplashScreen, LayoutWrapper)
│       │   ├── page.tsx          # Root redirect → /dashboard
│       │   ├── globals.css       # Global styles + Tailwind
│       │   ├── login/            # Auth page
│       │   ├── dashboard/        # Main dashboard + execution sub-dashboard
│       │   ├── projects/         # Project list, detail, completion
│       │   ├── procurement/      # 7-tab procurement workbench
│       │   ├── vendors/          # Vendor management
│       │   ├── inventory/        # Stock management
│       │   ├── materials/        # Material tracking
│       │   ├── finance/          # 7-tab finance cockpit
│       │   ├── billing/          # Billing management
│       │   ├── budget/           # Budget allocations & alerts
│       │   ├── boq/              # Bill of Quantities
│       │   ├── activities/       # Daily activities & DPR
│       │   ├── work-orders/      # Work order management
│       │   ├── labour/           # Labour attendance
│       │   ├── equipment/        # Equipment tracking
│       │   ├── safety-qc/        # Safety & quality control
│       │   ├── qc/               # QC dashboard + templates
│       │   ├── rework/           # Rework tasks
│       │   ├── inbox/            # Project messaging
│       │   ├── communication/    # WhatsApp integration
│       │   ├── ai-assistant/     # AI chatbot page
│       │   ├── documents/        # Document management
│       │   ├── reports/          # Reports
│       │   ├── analytics/        # Analytics
│       │   ├── notifications/    # Notification center
│       │   ├── users/            # User & role management
│       │   └── settings/         # Admin settings
│       │
│       ├── components/           # Shared React components
│       │   ├── layout-wrapper.tsx     # Auth guard, RBAC, license check, shell layout
│       │   ├── header-navbar.tsx      # Top nav: logo, role switcher, theme, notifications
│       │   ├── sidebar.tsx            # Slim icon sidebar (80px)
│       │   ├── sub-navbar.tsx         # Contextual secondary navigation
│       │   ├── mobile-navbar.tsx      # Responsive bottom nav
│       │   ├── floating-chatbot.tsx   # Always-visible AI chat widget
│       │   ├── splash-screen.tsx      # Animated branded splash
│       │   ├── providers.tsx          # React Query provider
│       │   ├── budget-cash-flow-chart.tsx
│       │   ├── ui/                    # Primitives (image-slider)
│       │   ├── billing/               # bill-detail-modal, create-bill-modal
│       │   ├── procurement/           # 9 workbench components (MR, PR, RFQ, PO, GRN...)
│       │   └── projects/              # ai-assistant-module, inbox-module, task-module
│       │
│       ├── config/
│       │   └── erp-navigation.ts      # Navigation structure (15 items + 2 utility)
│       │
│       ├── lib/                  # Service layer (data access + business logic)
│       │   ├── procurement.ts         # Full procurement pipeline (1956 lines)
│       │   ├── billing.ts             # Bill CRUD, duplicate detection, 3-way match
│       │   ├── budget.ts              # Budget allocations, ledger, alerts (via RPCs)
│       │   ├── finance.ts             # Finance overview, vendor aging, payments
│       │   ├── inbox.ts               # Messaging, conversations, voice transcription
│       │   ├── rbac.ts                # Role path guards, profile updates
│       │   ├── roles.ts               # Role definitions, aliases, normalization
│       │   ├── approvals.ts           # Pending approval queue
│       │   ├── delays.ts              # Delay event tracking
│       │   ├── documents.ts           # Entity attachment service
│       │   ├── dpr.ts                 # Daily Progress Reports
│       │   ├── equipment.ts           # Equipment assets & usage
│       │   ├── labour.ts              # Labour attendance
│       │   ├── projects.ts            # Role-based project listing
│       │   ├── safety-qc.ts           # Safety incidents & QC inspections
│       │   ├── erp/
│       │   │   └── supabase-modules.ts    # Composite Supabase operations
│       │   └── supabase/
│       │       └── server.ts              # Server-side Supabase client factory
│       │
│       ├── store/
│       │   └── use-app-store.ts       # Zustand mega-store (2001 lines)
│       │
│       └── utils/
│           ├── supabase-client.ts     # Supabase singleton + ID mapping helpers
│           ├── mock-data.ts           # Demo/fallback data + type definitions
│           ├── format-currency.ts     # Indian lakh/crore formatting
│           └── report-generator.ts    # CSV portfolio report generation
│
├── backend/                      # Python FastAPI service
│   ├── Dockerfile                # Python 3.11-slim
│   ├── railway.json              # Railway service config
│   ├── requirements.txt          # Python dependencies
│   ├── local_dev_fallback.db     # SQLite for local development
│   └── app/
│       ├── main.py               # FastAPI app entry point
│       ├── config.py             # Environment variable loading
│       ├── database.py           # SQLAlchemy engine + session factory
│       ├── core/
│       │   └── security.py       # JWT validation, license check, auth dependency
│       ├── models/
│       │   └── database_models.py    # 11 SQLAlchemy models
│       ├── routers/
│       │   ├── ai.py             # AI chat, transcription, send-message (3 endpoints)
│       │   ├── procurement.py    # PDF generation for PR/PO (2 endpoints)
│       │   ├── qc.py             # AI vision QC analysis (2 endpoints)
│       │   └── users.py          # User CRUD via Supabase Admin API (2 endpoints)
│       └── services/
│           ├── pdf_generator.py      # ReportLab PDF generation (PR + PO)
│           └── supabase_storage.py   # Supabase Storage upload + signed URLs
│
└── supabase/
    └── migrations/               # 8 sequential migration files
        ├── 20260620103334_production_architecture.sql       # Foundation (2960 lines)
        ├── 20260620120543_two_role_procurement_rbac.sql
        ├── 20260622051904_flow1_procurement_billing_workflow.sql
        ├── 20260622115500_fix_vendor_rls_and_profile_role.sql
        ├── 20260622125336_pragati_nine_role_production_foundation.sql
        ├── 20260623090000_budget_control_module.sql
        ├── 20260624000000_add_project_id_to_profiles.sql
        └── 20260624060000_material_request_module_fields.sql
```

---

## 3. Technology Stack

### Frontend

| Category | Technology | Version | Purpose |
|----------|-----------|---------|---------|
| Framework | Next.js | 16.2.7 | App Router, SSR, API rewrites, standalone Docker output |
| UI | React | 19.2.4 | Component rendering |
| Language | TypeScript | 5.x | Type safety |
| Styling | Tailwind CSS | 4.x | Utility-first CSS |
| State | Zustand | 5.0.14 | Global client-side state |
| Data Fetching | TanStack React Query | 5.101.0 | Server state caching (5-min stale time) |
| Charts | Recharts | 3.8.1 | Dashboard visualizations (Area, Bar, Line, Pie) |
| Animation | Framer Motion | 12.40.0 | Splash screen, transitions |
| Icons | Lucide React | 1.17.0 | Consistent icon set |
| Markdown | react-markdown | 10.1.0 | AI chat response rendering |
| PDF (client) | pdf-lib | 1.17.1 | Client-side PDF utilities |
| Database Client | @supabase/supabase-js | 2.107.0 | Direct DB access, Auth, Storage, Realtime |
| ORM (legacy) | @prisma/client | 7.8.0 | Secondary schema (not primary data path) |
| CSS Utilities | clsx, tailwind-merge | latest | Conditional class composition |
| Date | date-fns | 4.4.0 | Date formatting and manipulation |

### Backend

| Category | Technology | Version | Purpose |
|----------|-----------|---------|---------|
| Framework | FastAPI | 0.111.0 | REST API server |
| Runtime | Uvicorn | 0.30.1 | ASGI server |
| ORM | SQLAlchemy | 2.0.30 | Database queries (same Postgres) |
| Validation | Pydantic | 2.7.4 | Request/response models |
| AI | OpenAI SDK | ≥1.30.0 | GPT-4o-mini, Whisper, Vision |
| PDF | ReportLab | 4.2.0 | Server-side branded PDF generation |
| Auth | python-jose | 3.3.0 | JWT decode (HS256) |
| DB Driver | psycopg2-binary | 2.9.9 | PostgreSQL adapter |
| HTTP | requests | 2.32.3 | License check, Supabase Storage uploads |
| Multipart | python-multipart | 0.0.9 | File upload handling |

### Infrastructure

| Component | Service | Details |
|-----------|---------|---------|
| Database | Supabase (PostgreSQL) | 80+ tables, RLS policies, triggers, RPCs, realtime |
| Auth | Supabase Auth | Email/password, JWT tokens (HS256) |
| Storage | Supabase Storage | Buckets: `inbox-media`, `project-documents`, `procurement-documents` |
| Hosting | Railway | Docker containers (frontend + backend as separate services) |
| License | Vercel | External license status endpoint |

---

## 4. Frontend Architecture

### 4.1 App Router (Pages)

All routes use the Next.js 16 App Router (`src/app/`). The root page (`/`) redirects to `/dashboard`.

| Route | Page File | Description |
|-------|-----------|-------------|
| `/login` | `login/page.tsx` | Supabase Auth login with branded slideshow |
| `/dashboard` | `dashboard/page.tsx` (1235 lines) | Portfolio health, project cards, AI health score, charts |
| `/dashboard/execution` | `dashboard/execution/page.tsx` | Execution-focused dashboard view |
| `/projects` | `projects/page.tsx` | Project listing |
| `/projects/[id]` | `projects/[id]/page.tsx` | Dynamic project detail (tabbed) |
| `/projects/[id]/completion` | `projects/[id]/completion/page.tsx` | Work completion tracking |
| `/activities` | `activities/page.tsx` | Daily activities and DPR |
| `/procurement` | `procurement/page.tsx` (1813 lines) | 7-tab procurement workbench |
| `/vendors` | `vendors/page.tsx` | Vendor master management |
| `/inventory` | `inventory/page.tsx` | Stock management |
| `/materials` | `materials/page.tsx` | Material tracking |
| `/finance` | `finance/page.tsx` (1597 lines) | 7-tab finance cockpit |
| `/billing` | `billing/page.tsx` | Billing management |
| `/budget` | `budget/page.tsx` | Budget allocations and alerts |
| `/boq` | `boq/page.tsx` | Bill of Quantities |
| `/work-orders` | `work-orders/page.tsx` | Work order management |
| `/labour` | `labour/page.tsx` | Labour attendance |
| `/equipment` | `equipment/page.tsx` | Equipment tracking |
| `/safety-qc` | `safety-qc/page.tsx` | Safety and quality control |
| `/qc` | `qc/page.tsx` | QC inspection dashboard |
| `/qc/templates` | `qc/templates/page.tsx` | QC checklist templates |
| `/rework` | `rework/page.tsx` | Rework task management |
| `/inbox` | `inbox/page.tsx` | Project-scoped messaging |
| `/communication` | `communication/page.tsx` | External communication (WhatsApp) |
| `/ai-assistant` | `ai-assistant/page.tsx` | Standalone AI assistant |
| `/documents` | `documents/page.tsx` | Document management |
| `/reports` | `reports/page.tsx` | Report generation |
| `/analytics` | `analytics/page.tsx` | Analytics dashboards |
| `/notifications` | `notifications/page.tsx` | Notification center |
| `/users` | `users/page.tsx` | User and role management |
| `/settings` | `settings/page.tsx` | Admin settings |

### 4.2 Application Shell

The rendering hierarchy for authenticated pages:

```
<RootLayout>                          // layout.tsx — fonts, metadata
  <Providers>                         // providers.tsx — React Query
    <SplashScreen>                    // splash-screen.tsx — 2.6s branded animation
      <LayoutWrapper>                 // layout-wrapper.tsx — AUTH GUARD + RBAC
        ├── <HeaderNavbar />          // Top bar: logo, role switcher, theme, notifications
        ├── <Sidebar />              // Slim 80px icon sidebar
        ├── <MobileNavbar />         // Responsive bottom nav
        ├── <SubNavBar />            // Contextual secondary nav
        ├── {children}               // Route page content
        └── <FloatingChatbot />      // Always-visible AI widget
      </LayoutWrapper>
    </SplashScreen>
  </Providers>
</RootLayout>
```

`LayoutWrapper` is the control gate — it:
1. Runs `checkLogin()` on mount (Supabase session check)
2. Enforces RBAC via `canAccessPath(activeRole, pathname)`
3. Initializes Supabase realtime subscriptions via `initSupabase()`
4. Runs hourly license checks via `GET /api/check-license`
5. Shows a full-screen lockout overlay if the system is suspended

### 4.3 State Management (Zustand)

The application uses a single Zustand store (`src/store/use-app-store.ts` — 2001 lines, 76 KB) with this shape:

```typescript
interface AppState {
  // Auth & identity
  activeRole: Role;                     // UPPER_MANAGEMENT | PROJECT_MANAGER | PR_TEAM
  currentUser: User;
  isLoggedIn: boolean;

  // Core data
  projects: ProjectSite[];              // Each project embeds:
                                        //   dailyActivities, materials, boqItems,
                                        //   procurements, tasks, documents, chats,
                                        //   qcItems, invoices, teamMembers

  // Vendor data
  vendors: Vendor[];
  vendorBills: VendorBill[];
  vendorQuotations: VendorQuotation[];
  vendorPayments: VendorPayment[];
  vendorPerformances: VendorPerformance[];

  // AI
  aiConversations: AIConversation[];

  // UI state
  activeProjectId: string;
  theme: 'light' | 'dark';
  sidebarOpen: boolean;
  notifications: AppNotification[];
  supabaseInitialized: boolean;

  // 50+ action methods...
}
```

**Data mutation pattern:** Optimistic local update → async Supabase sync.

The `initSupabase()` action sets up Postgres realtime subscriptions on: `messages`, `tasks`, `materials`, `material_transactions`.

### 4.4 Service Layer (`src/lib/`)

Domain-specific service modules that encapsulate Supabase queries and RPCs:

| Module | Lines | Key Functions |
|--------|-------|---------------|
| `procurement.ts` | 1956 | `createMaterialRequest()`, `approvePurchaseRequisition()`, `createRfqFromPr()`, `recordQuotation()`, `recommendVendorSelection()`, `generatePurchaseOrder()`, `createGrnFromPo()`, `postGrnToInventory()`, `createVendorBillFromGrn()` |
| `billing.ts` | 251 | `listBillingDashboard()`, `createVendorBill()`, `verifyVendorBill()`, `approveVendorBill()`, `runThreeWayMatch()`, `checkDuplicateBill()` |
| `budget.ts` | 280 | `listBudgetDashboard()`, `createBudgetAllocation()`, `reviseBudgetAllocation()`, `approveBudgetRevision()`, `resolveBudgetAlert()` |
| `finance.ts` | 327 | `listFinanceOverview()`, `listVendorOutstanding()` (aging report), `listPayments()`, `recordVendorPayment()` |
| `inbox.ts` | 136 | `listConversations()`, `sendMessage()` (text/image/voice + auto-transcription), `createGroupChannel()`, `createDirectConversation()` |
| `rbac.ts` | 76 | `canAccessPath()`, `isUpperManagement()`, `updateProfileRole()`, `updateProfileProject()` |
| `roles.ts` | 66 | Role type definitions, `normalizeDatabaseRole()` (12+ aliases), `roleToDatabaseRole()` |
| `documents.ts` | 47 | `uploadEntityAttachment()`, `getEntityAttachments()`, `getAttachmentUrl()` |
| `dpr.ts` | 37 | `getDPRs()`, `approveDPR()`, `rejectDPR()` |
| `equipment.ts` | 36 | `getEquipmentAssets()`, `getEquipmentUsageLogs()`, `addEquipmentUsageLog()` |
| `safety-qc.ts` | 34 | `getSafetyIncidents()`, `getQCInspections()`, `reportSafetyIncident()` |
| `approvals.ts` | 25 | `getPendingApprovals()` — aggregates pending PRs, MRs, DPRs |
| `delays.ts` | 24 | `getDelays()`, `reviewDelay()` |
| `projects.ts` | 24 | `getProjectsForRole()` — UPPER_MANAGEMENT sees all; others see assigned only |
| `labour.ts` | 18 | `getLabourAttendance()`, `addLabourAttendance()` |
| `erp/supabase-modules.ts` | 461 | `createDailyProgressReport()`, `createProcurementWorkflowRequest()`, `createQcInspection()`, `recordNormalizedMaterialTransaction()`, `findOrCreateVendor()`, `createModuleNotification()` |
| `supabase/server.ts` | 62 | `createRequestSupabaseClient()`, `requireSupabaseUser()` — server-side authenticated Supabase client |

### 4.5 Navigation & RBAC

Navigation is defined in `src/config/erp-navigation.ts` (15 main items + 2 utility items), organized into groups:

| Group | Items |
|-------|-------|
| *(ungrouped)* | Overview, Inbox |
| Projects & Execution | Projects, Execution |
| Supply Chain | Procurement, Vendors, Inventory |
| Workforce | Labour, Equipment |
| *(ungrouped)* | Safety & QC |
| Financials | Finance, Budget |
| Documents | Documents, Reports |
| Settings | Admin |
| *(utility)* | Notifications, Users & Roles |

Items can carry `allowedRoles` arrays. `getNavigationItemsForRole()` filters the menu per role. `canAccessPath()` enforces route-level access.

---

## 5. Backend Architecture

### 5.1 Entry Point

`backend/app/main.py` creates a FastAPI application with:
- **CORS**: `allow_origins=["*"]` (to be restricted in production)
- **Router registration**: All routers mounted under `/api` prefix
- **SQLite auto-setup**: If `DATABASE_URL` starts with `sqlite`, creates tables via `Base.metadata.create_all()`
- **Health check**: `GET /` returns `{"status": "healthy"}`
- **License endpoint**: `GET /api/check-license` validates system license

### 5.2 Configuration

`backend/app/config.py` loads environment variables with fallbacks:

| Variable | Source | Fallback |
|----------|--------|----------|
| `DATABASE_URL` | env | `sqlite:///./local_dev_fallback.db` |
| `SUPABASE_URL` | `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_URL` | `""` |
| `SUPABASE_JWT_SECRET` | env | `""` (disables auth enforcement) |
| `SUPABASE_SERVICE_ROLE_KEY` | env (multiple key names tried) | `""` |
| `OPENAI_API_KEY` | env | `""` (enables local AI fallback) |

The config auto-converts `postgres://` to `postgresql://` for SQLAlchemy compatibility.

### 5.3 Database Layer

`backend/app/database.py` creates a conditional SQLAlchemy engine:
- **SQLite**: `check_same_thread=False`
- **PostgreSQL**: `pool_pre_ping=True`, `pool_size=5`, `max_overflow=10`

Exports `get_db()` as a FastAPI dependency that yields database sessions.

### 5.4 Security & Authentication

`backend/app/core/security.py` implements a two-layer security model:

**Layer 1 — License Check** (`run_license_check()`):
- Only enforced when `SUPABASE_JWT_SECRET` is set (production)
- Calls `https://pramukh-control-panel-new.vercel.app/api/status`
- Raises HTTP 403 if `system_active=false`
- **Fail-open**: Network failures silently pass to avoid locking out staff

**Layer 2 — JWT Authentication** (`get_current_user()`):
- FastAPI dependency using `HTTPBearer` scheme
- **Local dev bypass**: Returns dummy admin user when JWT secret is absent
- **Production**: Decodes Supabase JWT (HS256), validates expiry, extracts `sub`, `email`, `role`, `user_metadata.name`
- License check runs on every authenticated request

### 5.5 Routers

| Router | Endpoints | Auth | Dependencies |
|--------|-----------|------|-------------|
| `ai.py` | 3 | All require `get_current_user` | OpenAI SDK, SQLAlchemy |
| `qc.py` | 2 | All require `get_current_user` | OpenAI SDK (Vision) |
| `users.py` | 2 | All require `get_current_user` | Supabase GoTrue Admin API |
| `procurement.py` | 2 | All require `get_current_user` | SQLAlchemy, ReportLab, Supabase Storage |

### 5.6 Services

| Service | Purpose |
|---------|---------|
| `pdf_generator.py` | ReportLab-based branded PDF generation. Two functions: `generate_purchase_requisition_pdf()` (clean professional layout with "PRAGATI" header) and `generate_purchase_order_pdf()` (gold-bar branded "PRAMUKH" header, multi-page support, INR formatting with Indian grouping) |
| `supabase_storage.py` | `upload_file()` — uploads to Supabase Storage via REST API with service role key. `create_signed_url()` — generates time-limited signed URLs (default 10 minutes) |

### 5.7 SQLAlchemy Models

The backend defines 11 SQLAlchemy models in `database_models.py`:

| Model | Table | Purpose |
|-------|-------|---------|
| `Profile` | `profiles` | User profiles with email, name, role, project_id |
| `Project` | `projects` | Project master with code and name |
| `ProjectSite` | `ProjectSite` | Site details: location, value, progress, budget |
| `Vendor` | `vendors` | Vendor master with GST/PAN uniqueness |
| `MaterialRequest` | `material_requests` | Material request header |
| `PurchaseRequisition` | `purchase_requisitions` | PR with status workflow |
| `PurchaseRequisitionLine` | `purchase_requisition_lines` | PR line items |
| `PurchaseOrder` | `purchase_orders` | PO with vendor, amounts, terms |
| `PurchaseOrderLine` | `purchase_order_lines` | PO line items with tax |
| `OutboundMessage` | `outbound_messages` | External message queue |
| `EntityAttachment` | `entity_attachments` | Cross-module document attachments |

> **Note:** These models are used only by the Python backend for its 9 endpoints. The full 80+ table schema is managed by Supabase migrations and accessed by the frontend via the Supabase JS client.

---

## 6. Database Architecture

### 6.1 Schema Overview

The database is managed through 8 sequential Supabase migrations totalling ~230 KB of SQL. The foundation migration alone defines 80+ tables, 19 enum types, triggers, RPC functions, and RLS policies.

### 6.2 Enum Types (19)

```
erp_priority             erp_workflow_status       erp_activity_status
erp_delay_status         erp_procurement_status    erp_po_status
erp_delivery_status      erp_grn_status            erp_qc_status
erp_billing_status       erp_payment_status        erp_inventory_txn_type
erp_budget_txn_type      erp_notification_status   erp_document_status
erp_report_status        erp_equipment_status      erp_message_direction
erp_source_system
```

### 6.3 Table Groups

#### Core & RBAC (9 tables)
`organizations` · `organization_members` · `profiles` · `users` · `rbac_roles` · `rbac_permissions` · `rbac_role_permissions` · `rbac_user_roles` · `project_members`

#### Projects (5 tables)
`projects` · `project_sites` · `project_phases` · `project_documents` · `document_versions` · `project_health_scores`

#### Execution (10 tables)
`construction_activities` · `activity_dependencies` · `activity_updates` · `daily_progress_reports` · `dpr_activity_lines` · `delay_events` · `activity_deletion_requests` · `demand_forecasts` · `checklists` · `checklist_items`

#### Inventory (12 tables)
`unit_of_measurements` · `item_categories` · `item_master` · `inventory_locations` · `stock_balances` · `stock_ledger` · `stock_reservations` · `stock_transfers` · `stock_transfer_lines` · `material_issue_slips` · `material_issue_lines` · `consumption_variances`

#### Procurement (16 tables)
`material_requests` · `material_request_lines` · `purchase_requisitions` · `purchase_requisition_lines` · `purchase_requisition_assignments` · `rfqs` · `rfq_vendors` · `vendor_quotations` · `quotation_lines` · `quotation_scores` · `vendor_selections` · `purchase_orders` · `purchase_order_lines` · `goods_receipt_notes` · `goods_receipt_note_lines`

#### Vendors (6 tables)
`vendors` · `vendor_contacts` · `vendor_documents` · `vendor_categories` · `vendor_category_map` · `vendor_performance_reviews`

#### Quality Control (5 tables)
`qc_checklist_templates` · `qc_checklist_template_items` · `qc_inspections` · `qc_inspection_items` · `non_conformance_reports`

#### Billing & Finance (9 tables)
`vendor_bills` · `vendor_bill_lines` · `bill_documents` · `three_way_matches` · `payment_approvals` · `payments` · `budget_heads` · `cost_codes` · `budget_allocations` · `budget_ledger` · `budget_alerts` · `boq_items`

#### Labour & Equipment (7 tables)
`contractors` · `work_orders` · `work_order_lines` · `work_order_activities` · `labour_attendance` · `equipment_assets` · `equipment_usage_logs` · `equipment_maintenance_logs`

#### Communication (8 tables)
`user_site_assignments` · `whatsapp_numbers` · `message_threads` · `raw_messages` · `clean_messages` · `media_files` · `transcriptions` · `outbound_messages`

#### Workflow & Automation (6 tables)
`workflow_definitions` · `workflow_steps` · `workflow_instances` · `workflow_actions` · `approval_requests` · `notifications` · `notification_preferences` · `system_config` · `automation_rules` · `automation_jobs`

#### Reporting & Audit (5 tables)
`report_definitions` · `report_runs` · `report_jobs` · `report_snapshots` · `audit_logs` · `activity_events` · `entity_attachments`

#### Mobile (3 tables)
`device_registrations` · `mobile_sync_queue` · `workflow_rule_configs`

### 6.4 Database Triggers

| Trigger | Event | Effect |
|---------|-------|--------|
| `set_updated_at` | `BEFORE UPDATE` on all tables | Auto-sets `updated_at = now()` |
| `post_grn_stock` | GRN status → `posted` | Creates `stock_ledger` entries, updates `stock_balances` |
| `post_issue_stock` | Material issue slip created | Decrements `stock_balances` per line item |
| `post_bill_budget_ledger` | Vendor bill → `approved` | Records budget actuals, releases PO commitments |
| `enforce_vendor_bill_rules` | Vendor bill → `approved` | Blocks duplicate or incomplete bills |
| `audit_row_change` | `INSERT/UPDATE/DELETE` on 20+ tables | Records change to `audit_logs` with old/new values |

### 6.5 RPC Functions (Server-Side Logic)

| Function | Purpose |
|----------|---------|
| `submit_mobile_material_request()` | Mobile MR submission with auto item-master creation |
| `review_material_request_inventory()` | Checks stock availability for MR items |
| `issue_material_from_stock()` | Creates issue slip + deducts stock atomically |
| `approve_purchase_requisition()` | PR approval workflow transition |
| `approve_and_send_purchase_order()` | PO approval + budget commitment + vendor notification |
| `post_goods_receipt_note()` | GRN posting + stock ledger entries |
| `create_budget_allocation()` | Budget creation with auto cost-code/head creation |
| `revise_budget_allocation()` | Budget revision with delta ledger entry |
| `approve_budget_allocation()` | Budget revision approval |
| `verify_vendor_bill()` | Three-way match + budget gate check |
| `approve_vendor_bill()` | Bill approval with budget posting |
| `resolve_budget_alert()` | Alert resolution |
| `get_or_create_direct_conversation()` | Inbox DM creation/retrieval |
| `create_custom_channel()` | Group channel creation with members |
| `increment_equipment_usage` | Atomic equipment hours increment |

### 6.6 RLS Architecture

Row Level Security policies gate all data access by user role and project membership:

| Scope | Policy Function | Tables |
|-------|----------------|--------|
| Project read | `can_access_project(project_id)` | Most operational tables |
| Project write | `can_edit_project(project_id)` | DPR, activities, delays |
| Procurement | `can_access_procurement(project_id)` | MR, PR, RFQ, PO, GRN (admin OR pr_team OR inventory_team) |
| Budget | `can_manage_budget(project_id)` | Budget allocations, ledger, alerts (admin OR finance_team) |
| Billing | `can_manage_billing(project_id)` | Bills, payments (admin OR billing_team OR finance_team) |
| Master data read | Authenticated user | item_master, UOMs, categories |
| Master data write | Admin only | item_master, UOMs, categories |
| User-scoped | `auth.uid() = user_id` | device_registrations, notification_preferences |

### 6.7 Reporting Views

| View | Purpose |
|------|---------|
| `portfolio_budget_summary` | Project-level budget totals: allocated, committed, spent, remaining |
| `project_quality_billing_status` | Activity QC status + billing eligibility flags |

---

## 7. Authentication & Authorization

### 7.1 Auth Flow

```
1. User enters email/password on /login
2. Frontend calls supabase.auth.signInWithPassword()
3. Supabase Auth returns JWT (access_token + refresh_token)
4. Frontend stores tokens via Supabase SDK (localStorage)
5. All Supabase client calls auto-attach Bearer token
6. Backend calls receive token via next.config.ts rewrites
7. Backend decodes JWT with SUPABASE_JWT_SECRET (HS256)
8. RLS policies evaluate auth.uid() on every query
```

### 7.2 Role System

The platform implements a **dual-layer role system**:

**Frontend Roles (3)** — Controls UI navigation and feature visibility:

| Role | Label | Scope |
|------|-------|-------|
| `UPPER_MANAGEMENT` | Upper Management | All projects, all pages, all actions |
| `PROJECT_MANAGER` | Project Manager | Assigned projects, execution focus |
| `PR_TEAM` | PR Team | Procurement operations focus |

**Database Roles (9)** — Controls data access via RLS:

| Role | Access |
|------|--------|
| `super_admin` | Full system access |
| `upper_management` | All projects, full read |
| `project_manager` | Assigned projects |
| `pr_team` | Procurement tables |
| `site_manager` | Assigned project sites |
| `qc_team` | QC inspection tables |
| `billing_team` | Billing tables |
| `finance_team` | Budget + billing tables |
| `inventory_team` | Inventory + stock tables |

**Role normalization** (`roles.ts`) maps 12+ database role aliases to the 3 frontend roles:
- `admin`, `administrator`, `superadmin`, `super_admin`, `project_director`, `director`, `management` → `UPPER_MANAGEMENT`
- `procurement`, `procurement_manager`, `purchase`, `purchase_team` → `PR_TEAM`
- All others default to `PROJECT_MANAGER`

### 7.3 License Enforcement

A remote license check gates system access:
1. `LayoutWrapper` calls `GET /api/check-license` on mount and then every hour
2. Backend `security.py` calls the Vercel-hosted control panel API
3. If `system_active=false`, HTTP 403 is returned
4. Frontend shows a full-screen "System Suspended" lockout overlay
5. **Fail-open policy**: Network failures to the license server allow access (to prevent lockout during outages)

---

## 8. API Surface

### 8.1 Next.js API Rewrites

The frontend contains **no Next.js API routes**. All `/api/*` calls are proxied to the Python backend via `next.config.ts` rewrites:

```typescript
// next.config.ts rewrites
"/api/transcribe"                               → pythonBackend/api/transcribe
"/api/ai/chat"                                  → pythonBackend/api/ai/chat
"/api/send-message"                             → pythonBackend/api/send-message
"/api/qc/analyze"                               → pythonBackend/api/qc/analyze
"/api/site-inspection"                          → pythonBackend/api/site-inspection
"/api/users"                                    → pythonBackend/api/users
"/api/users/:id"                                → pythonBackend/api/users/:id
"/api/procurement/purchase-orders/:id/pdf"      → pythonBackend/api/procurement/purchase-orders/:id/pdf
"/api/procurement/purchase-requisitions/:id/pdf" → pythonBackend/api/procurement/purchase-requisitions/:id/pdf
"/api/check-license"                            → pythonBackend/api/check-license
"/supabase-api/*"                               → supabaseUrl/*
```

### 8.2 Backend Endpoints (9 total)

#### AI & Communication (Router: `ai.py`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/ai/chat` | ✅ | AI chatbot. Uses GPT-4o-mini with construction ERP context. Falls back to keyword-matched local responses if no API key. |
| `POST` | `/api/transcribe` | ✅ | Audio transcription via OpenAI Whisper (`whisper-1`). Accepts base64 JSON or multipart form-data. Max 25 MB. |
| `POST` | `/api/send-message` | ✅ | Outbound message relay. Validates phone (8-15 digits), text (≤4000 chars). Saves to `outbound_messages`. |

#### Quality Control (Router: `qc.py`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/qc/analyze` | ✅ | Construction image QC analysis via OpenAI Vision (GPT-4o-mini). Accepts base64 image. Returns `{defectsFound, findings}`. |
| `POST` | `/api/site-inspection` | ✅ | Site photo inspection via OpenAI Vision. Accepts image URL. Returns `{report}` with observations, hazards, progress. |

#### User Management (Router: `users.py`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/users` | ✅ | Creates user in Supabase Auth via GoTrue Admin API + upserts profile in DB. |
| `DELETE` | `/api/users/{id}` | ✅ | Deletes user from Supabase Auth + removes profile from DB. |

#### Procurement Documents (Router: `procurement.py`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/procurement/purchase-requisitions/{id}/pdf` | ✅ | Generates PR PDF → uploads to Supabase Storage → creates entity attachment → returns signed URL. |
| `POST` | `/api/procurement/purchase-orders/{id}/pdf` | ✅ | Generates PO PDF → uploads to Supabase Storage → creates entity attachment → returns signed URL. |

#### System

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/` | ❌ | Health check: `{"status": "healthy"}` |
| `GET` | `/api/check-license` | ❌ | License validation against external control panel |

---

## 9. Data Flow Patterns

### 9.1 Pattern A: Direct Supabase Access (~90% of operations)

```
React Component
  → calls lib/ service function (e.g., procurement.ts)
  → calls supabase.from('table').select/insert/update/delete()
  → Supabase JS client auto-attaches Bearer token
  → PostgreSQL executes with RLS enforcement
  → Response returned to component
```

Used for: All CRUD operations, dashboard queries, procurement workflow, billing, budget, messaging, notifications.

### 9.2 Pattern B: Supabase RPC (Transactional workflows)

```
React Component
  → calls lib/ service function
  → calls supabase.rpc('function_name', { params })
  → PostgreSQL executes server-side function atomically
  → Side effects (triggers, stock updates, budget entries) run in same transaction
  → Response returned
```

Used for: Budget allocation, GRN posting, material issuance, bill verification, conversation creation.

### 9.3 Pattern C: Python Backend Proxy (Specialized operations)

```
React Component
  → fetch('/api/endpoint', { headers: { Authorization: Bearer <token> } })
  → next.config.ts rewrite → Python backend
  → security.py validates JWT + checks license
  → Router handler executes (OpenAI API call / PDF generation / Supabase Admin API)
  → Response proxied back to frontend
```

Used for: AI chat, audio transcription, QC image analysis, PDF generation, user administration.

### 9.4 Pattern D: Realtime Subscriptions

```
initSupabase() in Zustand store
  → supabase.channel('channel-name')
  → .on('postgres_changes', { event: '*', table: 'messages' }, callback)
  → PostgreSQL NOTIFY on row changes
  → Supabase Realtime delivers payload to browser via WebSocket
  → Zustand store updates local state
```

Active subscriptions: `messages`, `tasks`, `materials`, `material_transactions`.

### 9.5 Pattern E: Database Trigger Side Effects

```
Supabase client writes data (e.g., GRN status → 'posted')
  → PostgreSQL BEFORE/AFTER trigger fires
  → Trigger function executes (e.g., post_grn_stock)
  → Side effects: stock_balances updated, stock_ledger entries created
  → All within the same transaction (atomic)
```

Active triggers: `post_grn_stock`, `post_issue_stock`, `post_bill_budget_ledger`, `enforce_vendor_bill_rules`, `audit_row_change`.

---

## 10. Module Reference

### Procurement Pipeline (Largest Module)

The procurement module spans the entire request-to-payment lifecycle:

```
                                  Frontend                          Database
                                  ────────                          ────────
Site Engineer raises MR       → procurement.ts                   → material_requests
                                                                   material_request_lines

Inventory reviews stock       → procurement.ts                   → RPC: review_material_request_inventory

PM approves MR               → procurement.ts                   → material_requests (status update)

PR Team converts MR → PR     → procurement.ts                   → purchase_requisitions
                                                                   purchase_requisition_lines

PR approved                  → procurement.ts                   → RPC: approve_purchase_requisition

RFQ created + vendors added  → procurement.ts                   → rfqs, rfq_vendors

Vendors submit quotations    → procurement.ts                   → vendor_quotations, quotation_lines

Comparison matrix generated  → procurement.ts                   → quotation_scores

Vendor finalized             → procurement.ts                   → vendor_selections

PO generated                 → procurement.ts                   → purchase_orders, purchase_order_lines
                                                                  (budget commitment via RPC)

PO PDF generated             → fetch('/api/procurement/...pdf') → pdf_generator.py → Supabase Storage
                                                                   entity_attachments

GRN created and posted       → procurement.ts                   → goods_receipt_notes
                                                                   goods_receipt_note_lines
                                                                  TRIGGER: post_grn_stock → stock_balances

Bill from GRN                → billing.ts                       → vendor_bills, vendor_bill_lines
                                                                   three_way_matches

Bill verified + approved     → billing.ts                       → RPC: verify_vendor_bill
                                                                  TRIGGER: post_bill_budget_ledger

Payment recorded             → finance.ts                       → payments, vendor_bills (status)
```

### Finance Cockpit (7 tabs)

| Tab | Data Source | Key Metrics |
|-----|------------|-------------|
| Overview | `finance.ts` → `vendor_bills`, `portfolio_budget_summary`, `budget_alerts` | Total billed, approved spend, paid, outstanding, monthly trend |
| Billing | `billing.ts` → `vendor_bills`, `three_way_matches` | Bill list with status, duplicate flags, 3-way match results |
| Budget | `budget.ts` → `budget_allocations`, `budget_ledger`, `budget_alerts` | Allocations, committed vs spent, utilization % |
| Payments | `finance.ts` → `payments` | Payment history with references |
| Outstanding | `finance.ts` → `vendor_bills` (computed aging) | Vendor aging buckets: 0-30, 31-60, 61-90, 90+ days |
| Analytics | Recharts (PieChart, BarChart) | Visual breakdowns |
| Alerts | `budget.ts` → `budget_alerts` | Warning/critical threshold breaches |

---

## 11. Module Interconnections

```
Projects ──────────► Activities/DPR ──────► Materials (consumption)
    │                    │                     │
    │                    ├──► Labour            ├──► Inventory
    │                    ├──► Equipment         │     ▲
    │                    └──► Delays ──► Notifications  │
    │                                                    │
    ├──► Work Orders ──────────────────────────────────┘
    │                                                    │
    └──► Procurement ──► MR → PR → RFQ → PO ──► GRN ──┘
              │                          │         │
              ├──► Vendors ◄─────────────┘         │
              │                                    ▼
              └──────────────────────────────► Billing
                                                 │
                                     ┌───────────┤
                                     ▼           ▼
                                  Budget      Finance
                                     │           │
                                     ▼           ▼
                                  Alerts     Payments
                                     │
                                     ▼
                                Notifications

QC ──────► gates Work Completion ──────► gates Billing

AI Assistant ──── reads from all modules (advisory only)

Documents ──── attachable to: Projects, Activities, DPRs, RFQs,
               Quotations, POs, GRNs, QC Inspections, Bills,
               Vendors, Work Orders
```

### Cross-Module Trigger Chains

1. **GRN → Stock**: `post_grn_stock` trigger auto-updates `stock_balances` and creates `stock_ledger` entries when a GRN is posted
2. **Bill → Budget**: `post_bill_budget_ledger` trigger records budget actuals and releases PO commitments when a bill is approved
3. **Issue → Stock**: `post_issue_stock` trigger decrements `stock_balances` when material issue slips are created
4. **Bill Validation**: `enforce_vendor_bill_rules` trigger blocks duplicate or incomplete bills from being approved
5. **Low Stock → Notification**: `addMaterialTransaction()` in the Zustand store auto-creates notifications when stock falls below threshold

---

## 12. Deployment

### 12.1 Docker Images

**Frontend** (`frontend/Dockerfile`):
```
Stage 1 (deps):     node:20-alpine — npm ci
Stage 2 (builder):  node:20-alpine — npm run build (Next.js standalone)
Stage 3 (runner):   node:20-alpine — runs node server.js as non-root user (nextjs:1001)
Exposes:            Port 3000
Build args:         NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, PYTHON_BACKEND_URL
```

**Backend** (`backend/Dockerfile`):
```
Base:               python:3.11-slim
System deps:        build-essential, libpq-dev, curl
Python deps:        pip install -r requirements.txt
Runs:               uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
Exposes:            Port 8000 (or Railway-assigned $PORT)
```

### 12.2 Railway Configuration

Each service has its own `railway.json`:

**Frontend**:
- Builder: DOCKERFILE
- Health check: `GET /`
- Restart policy: ON_FAILURE (max 10 retries)

**Backend**:
- Builder: DOCKERFILE
- Health check: `GET /`
- Restart policy: ON_FAILURE (max 10 retries)

### 12.3 Local Development

```bash
# Start both services concurrently
npm run dev

# Or individually:
npm run dev:frontend    # cd frontend && next dev --webpack
npm run dev:backend     # cd backend && .venv/Scripts/python.exe -m uvicorn app.main:app --reload --port 8000
```

The backend uses `local_dev_fallback.db` (SQLite) when no `DATABASE_URL` is set, enabling offline development without a Supabase connection.

---

## 13. Environment Configuration

### Frontend (`frontend/.env.local`)

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anonymous/public key |
| `PYTHON_BACKEND_URL` | Production only | Python backend URL (defaults to `http://127.0.0.1:8000`) |

### Backend (`backend/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Production | PostgreSQL connection string (falls back to SQLite) |
| `SUPABASE_URL` | ✅ | Supabase project URL |
| `SUPABASE_JWT_SECRET` | Production | JWT signing secret (disables auth bypass when set) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Service role key for Storage uploads and Admin API |
| `OPENAI_API_KEY` | Optional | Enables AI chat, transcription, QC vision (local fallback without) |

### Supabase Storage Buckets

| Bucket | Purpose | Used By |
|--------|---------|---------|
| `inbox-media` | Chat images, voice recordings | `inbox.ts`, `inbox-module.tsx` |
| `project-documents` | Entity attachments (all modules) | `documents.ts` |
| `procurement-documents` | Generated PR/PO PDFs | `procurement.py` (backend) |

---

## 14. Key Design Decisions

### Frontend-Heavy Architecture
Most business logic runs in the browser via Supabase JS client + RLS. This minimizes backend load and enables offline-capable workflows. The Python backend exists only for operations that **require server-side execution**: OpenAI API calls (secret key), PDF generation (ReportLab), Supabase Admin API (service role key), and external webhook/message relay.

### Supabase RPCs for Transactional Integrity
Multi-table mutations (budget allocation, GRN posting, bill verification) are implemented as PostgreSQL functions called via `supabase.rpc()`. This ensures atomicity — partial failures roll back automatically.

### Database Triggers for Cross-Module Side Effects
Stock updates, budget entries, and audit logging are implemented as PostgreSQL triggers rather than application code. This guarantees consistency regardless of which client (frontend, backend, or manual SQL) initiates the change.

### Optimistic Updates with Async Sync
The Zustand store applies mutations locally first for instant UI response, then syncs to Supabase asynchronously. Supabase Realtime subscriptions ensure other connected clients see updates within seconds.

### Dual-Layer Role System
Frontend roles (3) control navigation and UI visibility for simplicity. Database roles (9) control data access via RLS for security. The `normalizeDatabaseRole()` function bridges the two layers with a mapping table and 12+ aliases.

### License-Gated Access
A remote license check can suspend the entire system. The fail-open policy prevents lockout during network issues, while hourly checks ensure timely enforcement of license changes.

### Monorepo with Independent Deployability
Both services live in one repository for development convenience but deploy as separate Docker containers on Railway. They share the Supabase database but have no direct runtime dependency — the frontend proxies API calls through `next.config.ts` rewrites.
