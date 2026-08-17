/**
 * Delivery-date urgency for a purchase order. Centralised so the PO table and
 * the Deliveries follow-up tab agree on what "overdue" means, rather than each
 * computing it slightly differently.
 */
import { isPoReceivable } from './status';

export type DeliveryUrgencyTone = 'neutral' | 'success' | 'warning' | 'danger';

export type DeliveryUrgency = {
  label: string;
  tone: DeliveryUrgencyTone;
  /** Negative when overdue, positive when still ahead, null when there's no delivery_date. */
  daysDiff: number | null;
};

/** Still expecting goods against this PO — reuses the canonical PO status vocabulary. */
export function isPoAwaitingDelivery(status: string | null | undefined): boolean {
  return isPoReceivable(status);
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function getDeliveryUrgency(po: { delivery_date?: string | null; status?: string | null }): DeliveryUrgency {
  if (!po.delivery_date) {
    return { label: 'Not Set', tone: 'neutral', daysDiff: null };
  }

  const awaitingDelivery = isPoAwaitingDelivery(po.status);
  const today = startOfDay(new Date());
  const due = startOfDay(new Date(po.delivery_date));
  const daysDiff = Math.round((due.getTime() - today.getTime()) / 86_400_000);

  if (!awaitingDelivery) {
    // Already delivered/closed/cancelled — the date is historical, not a live risk.
    return { label: 'Not Awaiting Delivery', tone: 'neutral', daysDiff };
  }

  if (daysDiff < 0) {
    return { label: `Overdue ${Math.abs(daysDiff)}d`, tone: 'danger', daysDiff };
  }
  if (daysDiff === 0) {
    return { label: 'Due Today', tone: 'warning', daysDiff };
  }
  if (daysDiff <= 3) {
    return { label: `Due in ${daysDiff}d`, tone: 'warning', daysDiff };
  }
  return { label: 'On Track', tone: 'success', daysDiff };
}

export const DELIVERY_URGENCY_TONE_CLASSES: Record<DeliveryUrgencyTone, string> = {
  neutral: 'border-border bg-muted text-muted-foreground',
  success: 'border-emerald-200 bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
  warning: 'border-amber-200 bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
  danger: 'border-red-300 bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300',
};
