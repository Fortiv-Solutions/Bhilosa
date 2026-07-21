import type { Role } from '@/lib/roles';
export type { Role };

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatar: string;
  project_id?: string | null;
}

export interface DPRActivityLine {
  id: string;
  activityId: string;
  activityName: string;
  plannedWork: string;
  completedWork: string;
  pendingWork: string;
  completedQty: number;
  unit: string;
  progressPercent: number;
  labourUsed: number;
  materialUsed: string;
  equipmentUsed: string;
  delayReported: boolean;
  delayReason: string | null;
  siteIssue: string | null;
  remarks: string;
  photos: string[];
}

export interface DailyActivity {
  id: string;
  projectId: string;
  siteTowerBlock?: string;
  date: string;
  engineerName: string;
  weather: 'Sunny' | 'Rainy' | 'Cloudy' | 'Windy';
  workCompleted: string;
  issues: string | null;
  risks: string | null;
  progressDelta: number;
  status?: 'Draft' | 'Submitted' | 'Under Review' | 'Reviewed' | 'Correction Required' | 'Approved' | 'Rejected';
  activities?: DPRActivityLine[];
  totalLabourCount?: number;
  engineerCount?: number;
  contractorName?: string | null;
  materialUsedSummary?: string;
  equipmentUsedSummary?: string;
  safetyIssue?: boolean;
  qcIssue?: boolean;
  materialShortage?: boolean;
  workStopped?: boolean;
  generalRemarks?: string;
  photos?: string[];
  submittedBy?: string;
  submittedTime?: string;
  reviewRemarks?: string | null;
  workforceLogs?: WorkforceLog[];
  equipmentLogs?: EquipmentLog[];
  safetyIncidents?: SafetyIncident[];
}

export interface MaterialStock {
  id: string;
  projectId: string;
  itemName: string;
  category: string;
  quantity: number;
  unit: string;
  reorderLevel: number;
  stockValue: number;
  supplierName: string | null;
  status?: string;
  transactions?: MaterialTransaction[];
}

export interface MaterialTransaction {
  id: string;
  materialId: string;
  type: 'INWARD' | 'OUTWARD';
  quantity: number;
  date: string;
  cost: number;
  referenceNo: string;
}

export interface BOQItem {
  id: string;
  projectId: string;
  code: string;
  description: string;
  unit: string;
  rate: number;
  estimatedQty: number;
  consumedQty: number;
  approved: boolean;
}

export interface ProcurementReq {
  id: string;
  projectId: string;
  requisitionNo: string;
  title: string;
  status: 'DRAFT' | 'RFQ_SENT' | 'VENDOR_SELECTED' | 'PO_ISSUED' | 'DELIVERED';
  vendorName: string | null;
  vendorId?: string;
  cost: number;
  requestedDate: string;
  deliveryDate: string | null;
}

export interface WorkforceLog {
  id: string;
  projectId: string;
  siteTowerBlock?: string;
  date: string;
  contractorName: string;
  labourTeamName?: string;
  supervisorName?: string;
  labourCategory: string; // Mason, Helper, Carpenter, etc.
  presentCount: number;
  absentCount: number;
  overtimeHours: number;
  shift?: string;
  remarks?: string;
  linkedActivityId?: string;
  dprId?: string;
  productivity: 'Normal' | 'Low' | 'Good' | 'Work Stopped' | 'Not Enough Labour';
  labourShortage: boolean;
  labourDelay: boolean;
  issueReason?: string;
  actionRequired?: string;
}

export interface EquipmentLog {
  id: string;
  projectId: string;
  siteTowerBlock?: string;
  date: string;
  equipmentName: string;
  equipmentType: string;
  ownerVendor?: string;
  operatorName?: string;
  linkedActivityId?: string;
  dprId?: string;
  usageHours: number;
  fuelConsumed: number; // liters
  status: 'Active' | 'Idle' | 'In Use' | 'Breakdown' | 'Under Maintenance' | 'Removed from Site';
  breakdown: boolean;
  breakdownReason?: string;
  maintenanceRequired: boolean;
  remarks?: string;
  photos?: string[];
}

export interface LabourRecord {
  id: string;
  projectId: string;
  date: string;
  contractorName: string;
  presentCount: number;
  absentCount: number;
  overtimeHours: number;
  productivity: number;
}

export interface EquipmentRecord {
  id: string;
  projectId: string;
  name: string;
  status: string;
  usageHours: number;
  fuelConsumed: number;
  lastMaintenance: string;
}

export interface SafetyIncident {
  id: string;
  projectId: string;
  siteTowerBlock?: string;
  date: string;
  dprId?: string;
  safeDay: boolean;
  incidentHappened: boolean;
  incidentType?: 'Near miss' | 'Minor injury' | 'Major injury' | 'Unsafe act' | 'Unsafe condition' | 'PPE violation' | 'Fall hazard' | 'Electrical hazard' | 'Fire hazard' | 'Equipment safety issue' | 'Material handling issue' | 'Other';
  severity?: 'Low' | 'Medium' | 'High' | 'Critical';
  injuredPersonCount?: number;
  description?: string;
  correctiveAction?: string;
  responsiblePerson?: string;
  status: 'Reported' | 'Under Review' | 'Assigned' | 'In Progress' | 'Resolved' | 'Closed' | 'Escalated';
  photos?: string[];
  remarks?: string;
}

export interface GanttTask {
  id: string;
  projectId: string;
  name: string;
  startDate: string;
  endDate: string;
  progress: number;
  dependencies: string | null;
  isCriticalPath: boolean;
  assigneeId?: string | null;
  assigneeName?: string | null;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH';
  status?: 'TODO' | 'IN_PROGRESS' | 'COMPLETED' | 'ON_HOLD' | 'DELAYED' | 'CANCELLED';
  siteTowerBlock?: string;
  phase?: string;
  actualStartDate?: string | null;
  actualEndDate?: string | null;
  plannedQty?: number;
  completedQty?: number;
  unit?: string;
}

export interface DelayRecord {
  id: string;
  projectId: string;
  siteTowerBlock?: string;
  activityId?: string | null;
  dprId?: string | null;
  delayDate: string;
  plannedDate?: string;
  actualDate?: string;
  delayDays: number;
  severity: 'Low' | 'Medium' | 'High' | 'Critical';
  status: 'Open' | 'Under Review' | 'Assigned' | 'In Progress' | 'Resolved' | 'Closed' | 'Escalated';
  reasonCode: 'MATERIAL' | 'VENDOR' | 'LABOUR' | 'EQUIPMENT' | 'QC' | 'REWORK' | 'APPROVAL' | 'DRAWING' | 'WEATHER' | 'SITE' | 'SAFETY' | 'HOLD' | 'OTHER';
  reasonDetails: string;
  responsibleTeam?: string;
  responsiblePerson?: string;
  impactOnSchedule: boolean;
  impactOnCost: boolean;
  criticalPathImpact: boolean;
  correctiveActionRequired?: string;
  actionDueDate?: string | null;
  actionAssignedTo?: string | null;
}

export interface CorrectiveTask {
  id: string;
  projectId: string;
  title: string;
  siteTowerBlock?: string;
  linkedActivityId?: string | null;
  linkedRecordId?: string | null;
  recordType?: 'DPR' | 'DELAY' | 'QC' | 'MATERIAL' | 'OTHER';
  assignedTo: string;
  dueDate: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  requiredAction: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'CLOSED';
  attachments?: string[];
}

export interface Document {
  id: string;
  projectId: string;
  name: string;
  category: 'DRAWING' | 'BOQ' | 'CONTRACT' | 'INVOICE' | 'PHOTO' | 'APPROVAL';
  version: string;
  url: string;
  uploadDate: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
}

export interface ChatMessage {
  id: string;
  projectId: string;
  senderName: string;
  senderRole: string;
  message: string;
  timestamp: string;
  attachments: string[];
  category?: string;
  structuredData?: any;
  qcReportId?: string;
  isOutbound?: boolean;
}

export interface QCItem {
  id: string;
  projectId: string;
  title: string;
  status: string;
}

export interface InvoiceRecord {
  id: string;
  projectId: string;
  amount: number;
  desc: string;
}

export interface Vendor {
  id: string;
  name: string;
  gstNumber: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  category: string;
  rating: number; // 0-100 scale
  createdAt?: string;
  updatedAt?: string;
}

export interface VendorQuotation {
  id: string;
  vendorId: string;
  vendorName: string;
  projectId: string;
  materialCategory: string;
  unitRate: number;
  leadTimeDays: number;
  gstDetails: string | null;
  paymentTerms: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  submittedAt: string;
}

export interface VendorBill {
  id: string;
  vendorId: string;
  vendorName: string;
  projectId: string;
  invoiceNumber: string;
  amount: number;
  date: string;
  status: 'DUE' | 'VERIFIED' | 'PAID' | 'HELD';
  ref: string | null;
  createdAt?: string;
}

export interface VendorPayment {
  id: string;
  vendorId: string;
  vendorName: string;
  billId: string | null;
  amount: number;
  date: string;
  status: 'PROCESSING' | 'SUCCESS' | 'FAILED';
  paymentRef: string;
  createdAt?: string;
}

export interface VendorPerformance {
  id: string;
  vendorId: string;
  vendorName: string;
  projectId: string;
  deliveryScore: number;
  qualityScore: number;
  priceScore: number;
  responseScore: number;
  feedback: string | null;
  evaluationDate: string;
}

export interface ChecklistTemplateItem {
  id: string;
  question: string;
  acceptanceCriteria: string;
  isMandatory: boolean;
  requirePhoto: boolean;
  requireRemarks: boolean;
  sequence: number;
}

export interface ChecklistTemplate {
  id: string;
  name: string;
  category: string;
  version: string;
  status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED';
  items: ChecklistTemplateItem[];
}

export interface SubmittedChecklistItem {
  templateItemId: string;
  response: 'Pass' | 'Fail' | 'NA';
  remarks: string;
  photos: string[];
}

export interface SubmittedChecklist {
  id: string;
  projectId: string;
  templateId: string;
  activityId: string;
  submittedBy: string;
  submittedAt: string;
  status: 'DRAFT' | 'SUBMITTED' | 'QC_PENDING';
  items: SubmittedChecklistItem[];
}

export interface QcInspectionItem {
  checklistTemplateItemId: string;
  qcResult: 'Pass' | 'Fail';
  qcRemarks: string;
  photoProof: string[];
}

export interface QcInspection {
  id: string;
  projectId: string;
  checklistId?: string;
  activityId?: string;
  grnRef?: string;
  assignedTo: string;
  inspectionDate: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'PASSED' | 'FAILED' | 'REWORK_REQUIRED' | 'APPROVED' | 'REJECTED' | 'WAIVED';
  waiverReason?: string;
  items: QcInspectionItem[];
}

export interface ReworkTask {
  id: string;
  projectId: string;
  qcInspectionId: string;
  failedItemId: string;
  description: string;
  severity: 'Low' | 'Medium' | 'High' | 'Critical';
  assignedTo: string;
  dueDate: string;
  correctiveAction: string;
  status: 'OPEN' | 'ASSIGNED' | 'IN_PROGRESS' | 'SUBMITTED_FOR_RECHECK' | 'CLOSED';
  photos: string[];
}

export interface WorkCompletion {
  id: string;
  projectId: string;
  activityId: string;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'QC_PENDING' | 'REWORK_REQUIRED' | 'COMPLETION_APPROVED';
  billingAllowed: boolean;
  blockReason: string | null;
}

export interface TeamMember {
  id: string;
  projectId: string;
  name: string;
  role: string;
}

export interface ProjectSite {
  id: string;
  name: string;
  clientName: string;
  location: string;
  projectValue: number; // in Crores (INR) or Millions
  startDate: string;
  endDate: string;
  progress: number;
  currentPhase: 'Planning' | 'Design' | 'Approval' | 'Procurement' | 'Execution' | 'Testing' | 'Handover' | 'Completion';
  status: 'Active' | 'Completed' | 'Delayed' | 'On Hold';
  budget: number; // in INR
  actualSpend: number;
  dailyActivities: DailyActivity[];
  materials: MaterialStock[];
  boqItems: BOQItem[];
  procurements: ProcurementReq[];
  workforceLogs: WorkforceLog[];
  equipmentLogs: EquipmentLog[];
  safetyIncidents: SafetyIncident[];
  tasks: GanttTask[];
  documents: Document[];
  chats: ChatMessage[];
  qcItems: QCItem[];
  invoices: InvoiceRecord[];
  teamMembers: TeamMember[];
  labourRecords: LabourRecord[];
  equipments: EquipmentRecord[];
  checklistTemplates?: ChecklistTemplate[];
  submittedChecklists?: SubmittedChecklist[];
  qcInspections?: QcInspection[];
  reworkTasks?: ReworkTask[];
  workCompletions?: WorkCompletion[];
  delays?: DelayRecord[];
  correctiveTasks?: CorrectiveTask[];
  image?: string;
  galleryImages?: string[];
  overview?: string;
  reraNo?: string;
  projectUrl?: string;
  propertyType: string;
}

type ProjectModuleData = Pick<
  ProjectSite,
  | 'dailyActivities'
  | 'materials'
  | 'boqItems'
  | 'procurements'
  | 'workforceLogs'
  | 'equipmentLogs'
  | 'safetyIncidents'
  | 'tasks'
  | 'documents'
  | 'chats'
  | 'qcItems'
  | 'invoices'
  | 'teamMembers'
  | 'checklistTemplates'
  | 'submittedChecklists'
  | 'qcInspections'
  | 'reworkTasks'
  | 'workCompletions'
  | 'delays'
  | 'correctiveTasks'
>;

export const users: User[] = [];

export const mockProjects: ProjectSite[] = [];

export const aiAnalyticsInsights: {
  id: string;
  projectId: string;
  type: string;
  title: string;
  description: string;
  confidenceScore: number;
  impactLevel: string;
  recommendation: string;
}[] = [];

export const globalNotifications: {
  id: string;
  type: string;
  title: string;
  message: string;
  time: string;
  read: boolean;
}[] = [];

export const initialMockVendors: Vendor[] = [];

export const initialMockVendorQuotations: VendorQuotation[] = [];

export const initialMockVendorBills: VendorBill[] = [];

export const initialMockVendorPayments: VendorPayment[] = [];

export const initialMockVendorPerformances: VendorPerformance[] = [];


