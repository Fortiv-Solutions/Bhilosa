// ============================================================================
// MATERIAL REQUEST (MR) TYPES & INTERFACES
// Module: Supply Chain Management - Material Request Subsystem
// ============================================================================

import type { Role } from '@/lib/roles';
import type { MaterialRequestRow, PurchaseRequisitionRow, InventorySnapshotRow, ProcurementProjectOption } from '@/lib/procurement';

export type { Role, MaterialRequestRow, PurchaseRequisitionRow, InventorySnapshotRow, ProcurementProjectOption };

export type MRPriority = 'low' | 'medium' | 'high' | 'critical';
export type MRStatus = 'draft' | 'submitted' | 'in_review' | 'approved' | 'rejected' | 'closed' | 'cancelled';
export type StockDecision = 'available' | 'shortage' | 'partially_available';

export interface MRFilterState {
  searchQuery: string;
  projectId: string;
  status: string;
  priority: string;
  stockDecision: string;
  workActivity: string;
  overdueOnly: boolean;
}

export interface CreateMRLineInput {
  itemDescription: string;
  quantity: number;
  estimatedRate: number;
  unit?: string;
}

export interface CreateMRFormInput {
  projectId: string;
  siteId?: string | null;
  title: string;
  priority: MRPriority;
  requiredDate: string;
  workActivity?: string;
  siteBlock?: string;
  lines: CreateMRLineInput[];
}
