/**
 * Canonical purchase order status vocabulary.
 *
 * There used to be three competing vocabularies writing to one enum column:
 * the DB and budget layer spoke `approved | sent_to_vendor | ...`, the PO form
 * wrote `verification | issued | accepted_by_vendor | fulfilled`, and the GRN
 * roll-up wrote a third set. Only the first exists in `erp_po_status`, so every
 * form-driven transition failed with "invalid input value for enum" — and
 * because the form saved the whole header in one UPDATE, that failure rolled
 * back the entire save, line items included.
 *
 * This module is the single source of truth on the client. Every constant below
 * mirrors a function in 20260805090100_po_module_production_hardening.sql:
 *
 *   PO_STATUSES                → erp_po_status labels
 *   LEGACY_STATUS_ALIASES      → public.po_canonical_status(text)
 *   PO_TRANSITIONS             → public.po_transition_allowed(text, text)
 *   PO_APPROVER_ONLY_STATUSES  → v_privileged in trg_guard_purchase_order_status
 *
 * The database is the authority. This copy exists so the UI can disable a
 * button before the round trip, never to decide anything on its own — change
 * both together or the UI will offer actions the database rejects.
 */

export const PO_STATUSES = [
  'draft',
  'review',
  'pending_verification',
  'pending_approval',
  'approved',
  'rejected',
  'sent_to_vendor',
  'acknowledged',
  'partially_delivered',
  'delivered',
  'short_closed',
  'closed',
  'cancelled',
] as const;

export type PoStatus = (typeof PO_STATUSES)[number];

/** Mirrors `public.po_transition_allowed`. Terminal states map to `[]`. */
export const PO_TRANSITIONS: Record<PoStatus, readonly PoStatus[]> = {
  draft: ['review', 'pending_verification', 'pending_approval', 'approved', 'cancelled'],
  review: ['draft', 'pending_verification', 'cancelled'],
  pending_verification: ['draft', 'review', 'pending_approval', 'cancelled'],
  pending_approval: ['pending_verification', 'approved', 'rejected', 'draft', 'cancelled'],
  rejected: ['draft', 'cancelled'],
  approved: ['sent_to_vendor', 'cancelled'],
  sent_to_vendor: ['acknowledged', 'partially_delivered', 'delivered', 'short_closed', 'cancelled'],
  acknowledged: ['partially_delivered', 'delivered', 'short_closed', 'cancelled'],
  partially_delivered: ['delivered', 'short_closed', 'closed'],
  delivered: ['short_closed', 'closed'],
  short_closed: ['closed'],
  closed: [],
  cancelled: [],
};

/**
 * Transitions the database gates on `app_can_approve()`.
 *
 * `partially_delivered` and `delivered` are deliberately absent: they are
 * derived from the goods actually received, and the caller is normally the site
 * engineer who filed the GRN. Gating those would fail every receipt.
 */
export const PO_APPROVER_ONLY_STATUSES: readonly PoStatus[] = [
  'approved',
  'rejected',
  'sent_to_vendor',
  'short_closed',
  'closed',
  'cancelled',
];

/** Statuses the database will not accept without a written reason. */
export const PO_REASON_REQUIRED_STATUSES: readonly PoStatus[] = ['rejected', 'cancelled'];

/** States in which goods may still be received against the order. */
export const PO_RECEIVABLE_STATUSES: readonly PoStatus[] = [
  'approved',
  'sent_to_vendor',
  'acknowledged',
  'partially_delivered',
];

/**
 * States in which the commercial content may still be edited. Mirrors the
 * guard inside `save_purchase_order`: once a PO is out with the vendor,
 * changing its lines or rates would silently alter a document the vendor has
 * already accepted.
 */
export const PO_EDITABLE_STATUSES: readonly PoStatus[] = ['draft', 'review', 'pending_verification', 'pending_approval', 'rejected'];

/** States that no longer participate in the active pipeline. */
export const PO_TERMINAL_STATUSES: readonly PoStatus[] = ['closed', 'cancelled', 'short_closed'];

/**
 * Spellings that predate 20260805090000_po_status_enum_canonical.sql, kept so a
 * row written by an older build still renders and still resolves to a legal
 * transition source. Must match `public.po_canonical_status`.
 */
const LEGACY_STATUS_ALIASES: Record<string, PoStatus> = {
  draft_auto: 'draft',
  review: 'review',
  under_review: 'review',
  verification: 'pending_verification',
  pending_verification: 'pending_verification',
  audit: 'pending_verification',
  pending: 'pending_approval',
  // 'Issued' in the old form meant approved AND dispatched, which is
  // sent_to_vendor — not 'approved'. Mapping it to 'approved' would let the UI
  // offer "Approve & Send" on an order the vendor already has.
  issued: 'sent_to_vendor',
  accepted_by_vendor: 'acknowledged',
  partially_received: 'partially_delivered',
  fulfilled: 'delivered',
  completed: 'delivered',
  canceled: 'cancelled',
};

/**
 * Normalises any status spelling to a canonical status, or `null` when the
 * value is not recognised.
 *
 * Returning `null` rather than defaulting to `'draft'` is deliberate. A silent
 * fall back to draft would render an unknown status as an editable, approvable
 * order — exactly the failure this module exists to prevent. Every consumer
 * below fails closed on `null` instead.
 */
export function normalizePoStatus(value: string | null | undefined): PoStatus | null {
  const raw = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (!raw) return null;
  if ((PO_STATUSES as readonly string[]).includes(raw)) return raw as PoStatus;
  return LEGACY_STATUS_ALIASES[raw] ?? null;
}

/** Fails closed: an unrecognised source status permits no transition. */
export function canTransitionPo(from: string | null | undefined, to: PoStatus): boolean {
  const normalized = normalizePoStatus(from);
  if (!normalized) return false;
  return PO_TRANSITIONS[normalized].includes(to);
}

/** Fails closed: goods are never receivable against a status we cannot read. */
export function isPoReceivable(status: string | null | undefined): boolean {
  const normalized = normalizePoStatus(status);
  return normalized !== null && PO_RECEIVABLE_STATUSES.includes(normalized);
}

/** Fails closed: an unreadable status is treated as locked, not editable. */
export function isPoEditable(status: string | null | undefined): boolean {
  const normalized = normalizePoStatus(status);
  return normalized !== null && PO_EDITABLE_STATUSES.includes(normalized);
}

export function poRequiresReason(status: PoStatus): boolean {
  return PO_REASON_REQUIRED_STATUSES.includes(status);
}

export function poNeedsApprover(status: PoStatus): boolean {
  return PO_APPROVER_ONLY_STATUSES.includes(status);
}

/** Transitions available from a status, filtered by the caller's authority. */
export function availablePoTransitions(
  from: string | null | undefined,
  canApprove: boolean,
): readonly PoStatus[] {
  const normalized = normalizePoStatus(from);
  if (!normalized) return [];
  return PO_TRANSITIONS[normalized].filter((next) => canApprove || !poNeedsApprover(next));
}

/** Human-facing label for each canonical status. */
export const PO_STATUS_LABELS: Record<PoStatus, string> = {
  draft: 'Draft',
  review: 'Review',
  pending_verification: 'Pending for Verification',
  pending_approval: 'Pending for Approval',
  approved: 'Approved',
  rejected: 'Rejected',
  sent_to_vendor: 'Sent to Vendor',
  acknowledged: 'Vendor Acknowledged',
  partially_delivered: 'Partially Delivered',
  delivered: 'Delivered',
  short_closed: 'Short Closed',
  closed: 'Closed',
  cancelled: 'Cancelled',
};

/**
 * Label for display. An unrecognised value is shown verbatim rather than
 * relabelled, so a data problem is visible instead of being disguised as a
 * valid state.
 */
export function poStatusLabel(status: string | null | undefined): string {
  const normalized = normalizePoStatus(status);
  if (normalized) return PO_STATUS_LABELS[normalized];
  const raw = String(status ?? '').trim();
  return raw ? `Unknown (${raw})` : 'Unknown';
}

const UNKNOWN_TONE =
  'border-red-400 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300';

/**
 * Badge tone per status, exhaustive over PoStatus. The PO table previously used
 * an if/else chain with no default, so an unmapped status — `rejected`,
 * `cancelled` — rendered as a green "Fulfilled" badge.
 */
export const PO_STATUS_TONES: Record<PoStatus, string> = {
  draft: 'border-amber-200 bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
  review: 'border-cyan-200 bg-cyan-100 text-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-300',
  pending_verification:
    'border-indigo-200 bg-indigo-100 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300',
  pending_approval:
    'border-purple-200 bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-300',
  approved: 'border-blue-200 bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300',
  rejected: 'border-red-300 bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300',
  sent_to_vendor:
    'border-indigo-200 bg-indigo-100 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300',
  acknowledged: 'border-teal-300 bg-teal-100 text-teal-800 dark:bg-teal-950/40 dark:text-teal-300',
  partially_delivered:
    'border-cyan-300 bg-cyan-100 text-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-300',
  delivered:
    'border-emerald-200 bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
  short_closed:
    'border-slate-300 bg-slate-100 text-slate-800 dark:bg-slate-800/40 dark:text-slate-300',
  closed: 'border-slate-300 bg-slate-200 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300',
  cancelled: 'border-rose-300 bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300',
};

export function poStatusTone(status: string | null | undefined): string {
  const normalized = normalizePoStatus(status);
  return normalized ? PO_STATUS_TONES[normalized] : UNKNOWN_TONE;
}

/** Workspace filter tabs, expressed over the canonical vocabulary. */
export const PO_STATUS_GROUPS = {
  draft: ['draft', 'rejected'],
  pending: ['pending_approval'],
  issued: ['approved', 'sent_to_vendor', 'acknowledged'],
  receiving: ['partially_delivered'],
  closed: ['delivered', 'short_closed', 'closed'],
  cancelled: ['cancelled'],
} as const satisfies Record<string, readonly PoStatus[]>;

export type PoStatusGroup = keyof typeof PO_STATUS_GROUPS;

/** `null` for an unrecognised status, so it lands in no tab rather than in Draft. */
export function poStatusGroup(status: string | null | undefined): PoStatusGroup | null {
  const normalized = normalizePoStatus(status);
  if (!normalized) return null;
  for (const [group, members] of Object.entries(PO_STATUS_GROUPS)) {
    if ((members as readonly PoStatus[]).includes(normalized)) return group as PoStatusGroup;
  }
  return null;
}
