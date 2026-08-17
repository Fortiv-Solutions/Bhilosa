// ============================================================================
// DEMO DATA — Approval Analytics
// Static, hand-tuned fixture (no write path in this feature, so no stateful
// demo store is needed). Approver names echo the seeded user roster referenced
// in frontend/src/utils/supabase-client.ts's userMap comments, for narrative
// continuity with the rest of the demo environment.
// ============================================================================

import type { ApprovalAnalyticsSummary } from './approval-analytics';

export const DEMO_APPROVAL_ANALYTICS: ApprovalAnalyticsSummary = {
  pr: {
    avgApprovalHours: 18.4,
    pendingCount: 6,
    agingBuckets: { '0-24h': 3, '24-48h': 2, '>48h': 1 },
    sampleSize: 24,
  },
  po: {
    avgApprovalHours: 9.7,
    pendingCount: 4,
    agingBuckets: { '0-24h': 2, '24-48h': 1, '>48h': 1 },
    sampleSize: 31,
  },
  perApprover: [
    { actorId: 'demo-approver-1', actorName: 'Mahesh Pramukh', actorRole: 'upper_management', approvalCount: 11, avgTurnaroundHours: 26.5 },
    { actorId: 'demo-approver-2', actorName: 'Arvind Shah', actorRole: 'project_manager', approvalCount: 18, avgTurnaroundHours: 14.2 },
    { actorId: 'demo-approver-3', actorName: 'Priya Mehta', actorRole: 'pr_team', approvalCount: 22, avgTurnaroundHours: 6.8 },
  ],
  generatedAt: new Date().toISOString(),
  isDemoData: true,
};
