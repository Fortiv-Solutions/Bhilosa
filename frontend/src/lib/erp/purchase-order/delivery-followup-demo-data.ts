// ============================================================================
// DEMO DATA — Pending Deliveries + Follow-up Log
// Deterministic fixtures used while Supabase isn't configured. Reuses the same
// vendor/material flavor as the MRP demo data (frontend/src/lib/erp/mrp) and
// the RFQ demo quotations for continuity across the app.
// ============================================================================

import { getDeliveryUrgency } from './delivery-urgency';
import type { PendingDeliveryRow, PoFollowUpRow } from './delivery-followup';

/** Fixed "today" offsets so the fixture reads sensibly whenever it's viewed. */
function daysFromToday(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

const DEMO_PROJECTS = [
  { id: 'central-park', name: 'Central Park' },
  { id: 'orbit-4', name: 'Orbit 4' },
  { id: 'one-tapi', name: 'One Tapi' },
];

type DemoPoFixture = {
  id: string;
  po_number: string;
  vendor_name: string;
  projectIndex: number;
  total_amount: number;
  status: string;
  deliveryOffsetDays: number; // negative = overdue, positive = upcoming
  followUps: { note: string; promisedDate: string | null; actorRole: string; actorName: string; createdOffsetDays: number }[];
};

const DEMO_POS: DemoPoFixture[] = [
  {
    id: 'demo-po-001',
    po_number: 'PO-2026-0142',
    vendor_name: 'Tata Steel Ltd. (Tiscon Division)',
    projectIndex: 1,
    total_amount: 842000,
    status: 'sent_to_vendor',
    deliveryOffsetDays: -5,
    followUps: [
      {
        note: 'Called vendor dispatch desk — truck loading delayed at Jamshedpur plant.',
        promisedDate: null,
        actorRole: 'pr_team',
        actorName: 'Priya Mehta',
        createdOffsetDays: -3,
      },
      {
        note: 'Vendor confirmed new dispatch date; promised delivery revised.',
        promisedDate: daysFromToday(2),
        actorRole: 'pr_team',
        actorName: 'Priya Mehta',
        createdOffsetDays: -1,
      },
    ],
  },
  {
    id: 'demo-po-002',
    po_number: 'PO-2026-0138',
    vendor_name: 'UltraTech Cement Ltd.',
    projectIndex: 0,
    total_amount: 316500,
    status: 'acknowledged',
    deliveryOffsetDays: -2,
    followUps: [
      {
        note: 'Site engineer reports no truck arrival yet; escalated to area sales manager.',
        promisedDate: daysFromToday(1),
        actorRole: 'project_manager',
        actorName: 'Arvind Shah',
        createdOffsetDays: -1,
      },
    ],
  },
  {
    id: 'demo-po-003',
    po_number: 'PO-2026-0151',
    vendor_name: 'Dr. Fixit Waterproofing Solutions',
    projectIndex: 0,
    total_amount: 94800,
    status: 'approved',
    deliveryOffsetDays: 0,
    followUps: [],
  },
  {
    id: 'demo-po-004',
    po_number: 'PO-2026-0149',
    vendor_name: 'SikaFlex India Pvt. Ltd.',
    projectIndex: 2,
    total_amount: 58200,
    status: 'sent_to_vendor',
    deliveryOffsetDays: 2,
    followUps: [],
  },
  {
    id: 'demo-po-005',
    po_number: 'PO-2026-0155',
    vendor_name: 'Ambuja Cements Ltd.',
    projectIndex: 1,
    total_amount: 221000,
    status: 'acknowledged',
    deliveryOffsetDays: 6,
    followUps: [],
  },
  {
    id: 'demo-po-006',
    po_number: 'PO-2026-0160',
    vendor_name: 'JK Lakshmi Cement Ltd.',
    projectIndex: 2,
    total_amount: 178400,
    status: 'partially_delivered',
    deliveryOffsetDays: -1,
    followUps: [
      {
        note: 'Half the order arrived; balance quantity promised by end of week.',
        promisedDate: daysFromToday(3),
        actorRole: 'pr_team',
        actorName: 'Priya Mehta',
        createdOffsetDays: -1,
      },
    ],
  },
];

export function generateDemoPendingDeliveries(projectId?: string): PendingDeliveryRow[] {
  const rows: PendingDeliveryRow[] = DEMO_POS.map((po) => {
    const project = DEMO_PROJECTS[po.projectIndex];
    const delivery_date = daysFromToday(po.deliveryOffsetDays);
    return {
      id: po.id,
      po_number: po.po_number,
      po_date: daysFromToday(po.deliveryOffsetDays - 14),
      delivery_date,
      status: po.status,
      total_amount: po.total_amount,
      vendor_name: po.vendor_name,
      project_name: project.name,
      project_id: project.id,
      followUpCount: po.followUps.length,
      urgency: getDeliveryUrgency({ delivery_date, status: po.status }),
    };
  });

  const filtered = projectId ? rows.filter((r) => r.project_id === projectId) : rows;
  return filtered.sort((a, b) => (a.urgency.daysDiff ?? 0) - (b.urgency.daysDiff ?? 0));
}

export function generateDemoFollowUps(poId: string): PoFollowUpRow[] {
  const fixture = DEMO_POS.find((po) => po.id === poId);
  if (!fixture) return [];

  return fixture.followUps
    .map((f, idx) => ({
      id: `${poId}-followup-${idx}`,
      note: f.note,
      promisedDate: f.promisedDate,
      actorRole: f.actorRole,
      actorName: f.actorName,
      createdAt: `${daysFromToday(f.createdOffsetDays)}T09:00:00.000Z`,
    }))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}
