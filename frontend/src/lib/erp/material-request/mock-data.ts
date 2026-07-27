// ============================================================================
// MATERIAL REQUEST (MR) PRE-SEEDED SAMPLE MOCK DATA & FALLBACK STORE
// ============================================================================

import type { MaterialRequestRow } from '@/lib/procurement';

export const INITIAL_MOCK_MATERIAL_REQUESTS: MaterialRequestRow[] = [
  {
    id: 'mr-mock-001',
    project_id: 'central-park',
    site_id: 'site-a',
    mr_number: 'MR-20260721-001',
    source: 'site_engineer',
    justification: 'Concrete pour scheduled for Block A level 6 slab next week. High grade OPC cement and Fe 550D rebar required on site.',
    required_date: '2026-07-28',
    priority: 'high',
    stock_decision: 'shortage',
    status: 'submitted',
    raised_by: 'u4',
    submitted_at: new Date(Date.now() - 3600000 * 4).toISOString(),
    created_at: new Date(Date.now() - 3600000 * 4).toISOString(),
    work_activity: 'Slab casting',
    site_block: 'Block A - Tower 1',
    clarification_text: null,
    clarification_at: null,
    clarification_by: null,
    clarification_reply: null,
    clarification_replied_at: null,
    rejection_reason: null,
    reviewed_by: null,
    reviewed_at: null,
    management_comment: 'Priority request for Block A progress milestone.',
    management_comment_at: new Date(Date.now() - 3600000 * 2).toISOString(),
    management_comment_by: 'u1',
    material_request_lines: [
      { id: 'mrl-1', item_description: 'OPC 53 Grade Cement', quantity: 500, unit: 'Bags', required_date: '2026-07-25', unit_rate: 380, estimated_rate: 380, line_total: 190000 },
      { id: 'mrl-2', item_description: 'Fe 550D TMT Reinforcement Steel 12mm', quantity: 15, unit: 'MT', required_date: '2026-07-25', unit_rate: 62000, estimated_rate: 62000, line_total: 930000 }
    ],
    profiles: { name: 'Rohan Mehta (Site Eng)', email: 'site.eng@pramukh.com' },
    projects: { name: 'Central Park' },
    project_sites: { name: 'Block A Site' }
  },
  {
    id: 'mr-mock-002',
    project_id: 'orbit-4',
    site_id: 'site-b',
    mr_number: 'MR-20260721-002',
    source: 'construction_manager',
    justification: 'Plastering work starting on Level 4 office spaces. Urgent requirement for fine sand and PPC cement.',
    required_date: '2026-07-24',
    priority: 'critical',
    stock_decision: 'available',
    status: 'in_review',
    raised_by: 'u5',
    submitted_at: new Date(Date.now() - 3600000 * 24).toISOString(),
    created_at: new Date(Date.now() - 3600000 * 24).toISOString(),
    work_activity: 'Plaster work',
    site_block: 'Tower 2 - Commercial',
    clarification_text: null,
    clarification_at: null,
    clarification_by: null,
    clarification_reply: null,
    clarification_replied_at: null,
    rejection_reason: null,
    reviewed_by: 'u2',
    reviewed_at: new Date(Date.now() - 3600000 * 12).toISOString(),
    management_comment: null,
    management_comment_at: null,
    management_comment_by: null,
    material_request_lines: [
      { id: 'mrl-3', item_description: 'Washed River Sand (Plaster Grade)', quantity: 40, unit: 'Brass', required_date: '2026-07-24', unit_rate: 1800, estimated_rate: 1800, line_total: 72000 },
      { id: 'mrl-4', item_description: 'UltraTech PPC Cement', quantity: 300, unit: 'Bags', required_date: '2026-07-24', unit_rate: 360, estimated_rate: 360, line_total: 108000 }
    ],
    profiles: { name: 'Mayur Vyas (CM)', email: 'mayur.vyas@pramukh.com' },
    projects: { name: 'Orbit 4' },
    project_sites: { name: 'Tower 2 Site' }
  }
];
