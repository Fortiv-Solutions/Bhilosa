# Design System & UI Architecture — Pramukh Group ERP (V2)

> **Design Philosophy**: *Industrial Executive & Construction Operations Intelligence*  
> A premium, high-density ERP interface designed for executive decision-making and site operations management. Fuses modern dark-tech aesthetics with warm gold branding (`#b68d40`), crisp tabular typography, micro-animations, and high-contrast data visualization.

---

## Table of Contents

1. [Design Philosophy & Aesthetic Guidelines](#1-design-philosophy--aesthetic-guidelines)
2. [Design Tokens & Theme System](#2-design-tokens--theme-system)
3. [Typography & Numeric Formatting](#3-typography--numeric-formatting)
4. [Spatial Layout & Navigation Grid](#4-spatial-layout--navigation-grid)
5. [Component Patterns & UI Library](#5-component-patterns--ui-library)
6. [Data Visualization & Charting Standards](#6-data-visualization--charting-standards)
7. [Micro-Interactions & Animation System](#7-micro-interactions--animation-system)
8. [Responsive & Accessibility Specifications](#8-responsive--accessibility-specifications)

---

## 1. Design Philosophy & Aesthetic Guidelines

The **Pramukh Group ERP (V2)** UI is tailored for construction leaders, project directors, site engineers, and financial auditors. The visual language balances high-density data management with luxury branding.

### Core Principles

1. **Executive Authority**: Uses a signature Pramukh Gold (`#b68d40`) against deep slate (`#0b0f19` / `#111827`) to convey reliability, structural permanence, and high economic scale.
2. **Zero-Slop Data Density**: Every pixel has functional utility. Avoid giant empty whitespace or decorative padding. Uses tight grid structures, compact data cards, and sticky tab workbenches.
3. **Tabular Precision**: Financial figures (INR lakhs/crores), stock quantities, unit rates, and progress percentages strictly enforce `Geist Mono` with `tabular-nums` for error-free vertical scanability.
4. **Contextual Role Adaptability**: The interface dynamically re-skins navigation and actions based on user personas (`UPPER_MANAGEMENT`, `PROJECT_MANAGER`, `PR_TEAM`).
5. **Dynamic System State**: Integrated live feedback via real-time WebSocket pulses, notification badges, ambient blur glows, and full-screen lockout states for license security.

---

## 2. Design Tokens & Theme System

The design system is powered by CSS variables and Tailwind CSS 4 `@theme` directives configured in `frontend/src/app/globals.css`.

### 2.1 Color Palette

#### Primary Brand Accent
- **Pramukh Gold (`--primary`)**: `#b68d40` (Used for brand logos, primary actions, active state rings, hero accents, and status highlights)
- **Primary Foreground**: `#ffffff`

#### Dark Mode Palette (Default Core Theme)
```css
--background: #0b0f19;       /* Deep Obsidian Base */
--foreground: #f8fafc;       /* Slate 50 High Contrast Text */
--card: #111827;             /* Dark Gray Card Surfaces */
--card-foreground: #f8fafc;
--popover: #111827;          /* Dropdowns & Popovers */
--popover-foreground: #f8fafc;
--secondary: #1e293b;        /* Muted Surface / Secondary Buttons */
--secondary-foreground: #f8fafc;
--accent: #1e293b;           /* Hover / Active Item Surface */
--accent-foreground: #f8fafc;
--muted: #1f2937;            /* Subdued Backgrounds */
--muted-foreground: #9ca3af;   /* Secondary Label Text */
--border: #1f2937;           /* Subtle Dividers */
--input: #1f2937;            /* Form Input Borders */
--ring: #b68d40;             /* Focus Ring Indicator */
```

#### Light Mode Palette
```css
--background: #f4f6f8;       /* Light Muted Gray Canvas */
--foreground: #0f172a;       /* Dark Navy Primary Text */
--card: #ffffff;             /* Crisp White Surface */
--card-foreground: #0f172a;
--secondary: #f1f5f9;        /* Slate 100 Accent Surface */
--muted: #f1f5f9;
--muted-foreground: #64748b;   /* Slate 500 Subtext */
--border: #e2e8f0;           /* Soft Border */
--input: #e2e8f0;
```

#### Semantic Status Indicators
- **Success (`--success`)**: `#10b981` (Emerald — Passed QC, Approved PO, Stock Available)
- **Warning (`--warning`)**: `#f59e0b` (Amber — Pending Approval, Near Budget Limit, Delay Event)
- **Danger (`--danger`)**: `#ef4444` (Rose/Red — QC Defect, Budget Breach, Overdue Action, Suspended System)

### 2.2 Elevation & Surfaces

```css
/* Custom Premium Shadows */
--shadow-premium: 0 4px 24px -6px rgba(15, 23, 42, 0.05), 0 2px 8px -2px rgba(15, 23, 42, 0.03);
--shadow-premium-dark: 0 4px 24px -6px rgba(0, 0, 0, 0.5), 0 2px 8px -2px rgba(0, 0, 0, 0.3);

/* Border Radius Tokens */
--radius-lg: 0.75rem;   /* 12px for Cards, Modals & Workbenches */
--radius-md: 0.625rem;  /* 10px for Buttons & Inputs */
--radius-sm: 0.5rem;    /* 8px for Badges & Chips */
```

---

## 3. Typography & Numeric Formatting

The project employs Vercel's **Geist** font family (`geist/font/sans` and `geist/font/mono`).

### 3.1 Type Hierarchy

| Classification | Font Family | Weight | Size | Letter Spacing | Usage |
|----------------|-------------|--------|------|----------------|-------|
| **Display Header** | Geist Sans | `800` (Black) | 24px – 32px (`text-2xl` / `text-3xl`) | `-0.025em` | Page titles, Modal headers |
| **Section Title** | Geist Sans | `700` (Bold) | 16px – 18px (`text-base` / `text-lg`) | `-0.01em` | Card titles, Workbench headers |
| **Body Regular** | Geist Sans | `400` (Normal) / `500` (Medium) | 14px (`text-sm`) | `0` | Form labels, table text, descriptions |
| **Caption & Meta** | Geist Sans | `500` / `600` | 11px – 12px (`text-xs`) | `+0.05em` uppercase | Metadata tags, badges, field titles |
| **Numeric & Financial** | **Geist Mono** | `600` / `700` / `900` | Any Metric | `tabular-nums` | Currency (INR), Quantities, Dates |

### 3.2 Strict Tabular Numeric Enforcement

To prevent layout jitter during live updates and ensure financial column alignment, global CSS mandates `font-mono` and `tabular-nums` across all numeric elements:

```css
html, body, table, th, td, input, select, textarea, button,
.recharts-text, .metric-value, .stat-val, .kpi-value {
  font-variant-numeric: tabular-nums !important;
}

.font-mono,
td.text-right,
article p.text-2xl,
article p.text-3xl {
  font-family: var(--font-mono), monospace !important;
}
```

### 3.3 Currency & Metric Display Standard (INR)

All monetary values use **Indian Numbering Format** (lakhs & crores) formatted via `src/utils/format-currency.ts`:
- Example: `₹1,45,00,000` (₹1.45 Cr) or `₹4,50,000` (₹4.5 Lakhs)
- Right-aligned in data tables (`td.text-right`) with `font-mono`.

---

## 4. Spatial Layout & Navigation Grid

The application layout uses an integrated shell pattern (`src/components/layout-wrapper.tsx`):

```
+-----------------------------------------------------------------------------------+
| HEADER NAVBAR (Height: 64px) — Logo, Title, Role Selector, Theme, Notifications    |
+---+-------------------------------------------------------------------------------+
| S | MOBILE NAVBAR (Visible <768px)                                               |
| I +-------------------------------------------------------------------------------+
| D | SUB-NAVBAR (Contextual secondary navigation tabs per module)                 |
| E +-------------------------------------------------------------------------------+
| B | MAIN SCROLLABLE CANVAS                                                        |
| A | (px-6 pt-4 pb-6)                                                              |
| R |                                                                               |
|   |   +-----------------------------------------------------------------------+   |
| ( |   | WORKBENCH HEADER & ACTION QUEUE                                       |   |
| 8 |   +-----------------------------------------------------------------------+   |
| 0 |   | BENTO METRIC CARDS / WORK BENCH TAB CONTENT                           |   |
| p |   +-----------------------------------------------------------------------+   |
| x |   | DATA TABLES / RECHARTS VISUALS / MODALS                               |   |
| ) |   +-----------------------------------------------------------------------+   |
|   |                                                                               |
|   |                                                        [ FLOATING CHATBOT ]   |
+---+-------------------------------------------------------------------------------+
```

### 4.1 Shell Components

- **Header Navbar (`header-navbar.tsx`)**: Dark glassmorphic top header containing company branding, active role switcher dropdown, dark/light toggle, live notification popup bell, and profile trigger.
- **Sidebar (`sidebar.tsx`)**: Fixed 80px slim vertical navigation strip. Uses icon-based routing with active gold highlights (`#b68d40`).
- **Sub-Navbar (`sub-navbar.tsx`)**: Dynamic secondary tab strip rendering sub-paths for active navigation groups.
- **Floating Chatbot (`floating-chatbot.tsx`)**: Bottom-right floating trigger button that expands into an interactive AI drawer.

---

## 5. Component Patterns & UI Library

### 5.1 Card & Container Surfaces (`.bg-card`)

Cards use solid surface fills (`#111827` in dark mode) with subtle borders (`#1f2937`) and clean `12px` rounded corners (`rounded-xl`):

```tsx
<div className="bg-card border border-border rounded-xl p-5 shadow-sm hover:border-slate-700 transition-colors">
  <div className="flex items-center justify-between mb-3">
    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Total Allocated</span>
    <div className="p-2 rounded-lg bg-primary/10 text-primary">
      <Briefcase className="w-4 h-4" />
    </div>
  </div>
  <p className="text-2xl font-black font-mono text-foreground tracking-tight">₹4,25,00,000</p>
</div>
```

### 5.2 Status Badges & Chips

State badges use low-saturation background tints paired with bright text labels for quick status scanning:

| Status State | Background Class | Text Class | Icon Example |
|--------------|------------------|------------|--------------|
| **Approved / Completed / Passed** | `bg-emerald-500/10` | `text-emerald-400` | `<CheckCircle2 />` |
| **Pending / In Review / Draft** | `bg-amber-500/10` | `text-amber-400` | `<Clock />` |
| **Rejected / Failed / Breach** | `bg-rose-500/10` | `text-rose-400` | `<AlertTriangle />` |
| **In Progress / Active** | `bg-blue-500/10` | `text-blue-400` | `<Activity />` |

### 5.3 High-Density Data Tables

Data tables adhere to strict visual guidelines:
- **Header**: Sticky `bg-muted/50` text header with `text-[11px] font-bold uppercase tracking-wider text-muted-foreground`.
- **Row Separation**: Thin horizontal borders (`border-border/50`) with hover row highlight (`hover:bg-muted/30`).
- **Alignment**: Text left-aligned; numerical values (Qty, Rate, Total) right-aligned with `font-mono`.

```tsx
<div className="overflow-x-auto border border-border rounded-xl">
  <table className="w-full text-left text-sm">
    <thead className="bg-muted/50 border-b border-border text-[11px] font-bold uppercase text-muted-foreground">
      <tr>
        <th className="px-4 py-3">Item Description</th>
        <th className="px-4 py-3 text-right">Qty</th>
        <th className="px-4 py-3 text-right">Est. Rate</th>
        <th className="px-4 py-3 text-center">Status</th>
      </tr>
    </thead>
    <tbody className="divide-y divide-border/50">
      <tr className="hover:bg-muted/30 transition-colors">
        <td className="px-4 py-3 font-medium text-foreground">Fe-550 TMT Steel Bars</td>
        <td className="px-4 py-3 text-right font-mono">25.00 MT</td>
        <td className="px-4 py-3 text-right font-mono">₹64,500</td>
        <td className="px-4 py-3 text-center"><StatusBadge status="approved" /></td>
      </tr>
    </tbody>
  </table>
</div>
```

### 5.4 7-Tab Workbench Layouts (Procurement & Finance)

Complex modules (Procurement & Finance) employ horizontal workbench tab strips at the top of the canvas:

```tsx
<div className="flex items-center gap-2 border-b border-border mb-6 overflow-x-auto">
  {tabs.map(tab => (
    <button
      key={tab.id}
      onClick={() => setActiveTab(tab.id)}
      className={clsx(
        "px-4 py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 transition-all whitespace-nowrap",
        activeTab === tab.id
          ? "border-primary text-primary bg-primary/5"
          : "border-transparent text-muted-foreground hover:text-foreground"
      )}
    >
      {tab.label}
    </button>
  ))}
</div>
```

---

## 6. Data Visualization & Charting Standards

Analytics rely on **Recharts** styled specifically for dark surfaces:

### 6.1 Chart Configuration Standards

- **Background Grid**: `stroke="#1f2937"` with `strokeDasharray="3 3"`
- **X/Y Axes**: `stroke="#64748b"`, `fontSize={11}`, `tickLine={false}`, `fontFamily="var(--font-mono)"`
- **Tooltips**: Custom container with `bg-[#111827] border border-slate-800 rounded-xl p-3 shadow-xl text-xs`
- **Color Palette for Series**:
  - Allocated / Planned: `#b68d40` (Pramukh Gold)
  - Actual / Spent: `#10b981` (Emerald)
  - Committed / In Progress: `#3b82f6` (Blue)
  - Variance / Defect: `#ef4444` (Rose)

---

## 7. Micro-Interactions & Animation System

Animations are functional and non-distracting:

- **Page Load Splash (`splash-screen.tsx`)**: Framer Motion powered logo assembly animation running for 2.6 seconds on cold start.
- **Hover Feedback**: Subtle background color transitions (`transition-colors duration-150`) on rows, buttons, and navigation cards.
- **System Lockout Blur**: The suspended license overlay (`layout-wrapper.tsx`) applies `backdrop-blur-xl` over a dark obsidian backdrop with pulsing ambient red lights (`animate-pulse`).
- **AI Typing Stream**: Floating chatbot streams text with simulated typewriter timing and custom markdown code-block copy buttons.

---

## 8. Responsive & Accessibility Specifications

### 8.1 Mobile Adaptability

- **Breakpoints**:
  - `sm`: 640px
  - `md`: 768px (Sidebar collapses into `<MobileNavbar />`)
  - `lg`: 1024px (Standard Desktop Grid)
  - `xl`: 1280px (Executive Multi-column Cockpit)
- Mobile navigation uses bottom fixed tabs (`mobile-navbar.tsx`) for core actions: Home, Projects, Procurement, Finance, Menu.

### 8.2 Contrast & Focus

- All primary text combinations maintain a contrast ratio > 4.5:1 against surfaces (`#f8fafc` on `#111827`).
- Interactive elements feature explicit keyboard focus rings via `--ring` (`#b68d40`).
