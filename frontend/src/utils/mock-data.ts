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

export const users: User[] = [
  { id: 'u1', name: 'Vikram Patel', email: 'vikram.patel@pramukh.com', role: 'UPPER_MANAGEMENT', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150' },
  { id: 'u2', name: 'Priya Mehta', email: 'purchase@pramukh.com', role: 'PR_TEAM', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150' },
  { id: 'u3', name: 'Mahesh Pramukh', email: 'admin@pramukh.com', role: 'UPPER_MANAGEMENT', avatar: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=150' },
  { id: 'u4', name: 'Rohan Mehta', email: 'pm@pramukh.com', role: 'PROJECT_MANAGER', avatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150' },
  { id: 'u5', name: 'Shreya Shinde', email: 'site@pramukh.com', role: 'PROJECT_MANAGER', avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150' },
  { id: 'u6', name: 'Dhruv Shah', email: 'qc@pramukh.com', role: 'PROJECT_MANAGER', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150' },
  { id: 'u7', name: 'Kavya Desai', email: 'billing@pramukh.com', role: 'UPPER_MANAGEMENT', avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150' },
  { id: 'u8', name: 'Neha Joshi', email: 'finance@pramukh.com', role: 'UPPER_MANAGEMENT', avatar: 'https://images.unsplash.com/photo-1544725176-7c40e5a71c5e?w=150' },
  { id: 'u9', name: 'Harsh Vora', email: 'stores@pramukh.com', role: 'PR_TEAM', avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150' },
];

const suratProjectImages = {
  centralPark: '/images/projects/central-park.png',
  orbit4: '/images/projects/orbit-4.jpg'
};

const createSuratProject = ({
  id,
  name,
  location,
  propertyType,
  image,
  galleryImages,
  overview,
  reraNo,
  projectUrl,
  progress,
  projectValue,
  status = 'Active',
  currentPhase = 'Execution',
  index,
  moduleData
}: {
  id: string;
  name: string;
  location: string;
  propertyType: string;
  image: string;
  galleryImages?: string[];
  overview: string;
  reraNo: string;
  projectUrl: string;
  progress: number;
  projectValue: number;
  status?: ProjectSite['status'];
  currentPhase?: ProjectSite['currentPhase'];
  index: number;
  moduleData: ProjectModuleData;
}): ProjectSite => {
  const budget = Math.round(projectValue * 0.92);
  const actualSpend = Math.round(budget * (progress / 100) * 0.96);

  const labourRecords = (moduleData.workforceLogs || []).map((w: any) => {
    const prodMap: Record<string, number> = {
      'Good': 100,
      'Normal': 85,
      'Low': 60,
      'Work Stopped': 0,
      'Not Enough Labour': 40
    };
    return {
      id: w.id,
      projectId: w.projectId,
      date: w.date,
      contractorName: w.contractorName,
      presentCount: w.presentCount,
      absentCount: w.absentCount,
      overtimeHours: w.overtimeHours || 0,
      productivity: prodMap[w.productivity] || 85
    };
  });

  const equipments = (moduleData.equipmentLogs || []).map((e: any) => {
    const statusMap: Record<string, string> = {
      'Active': 'ACTIVE',
      'Idle': 'IDLE',
      'In Use': 'IN_USE',
      'Breakdown': 'BREAKDOWN',
      'Under Maintenance': 'MAINTENANCE',
      'Removed from Site': 'REMOVED'
    };
    return {
      id: e.id,
      projectId: e.projectId,
      name: e.equipmentName,
      status: statusMap[e.status] || 'ACTIVE',
      usageHours: e.usageHours || 0,
      fuelConsumed: e.fuelConsumed || 0,
      lastMaintenance: e.date
    };
  });

  return {
    id,
    name,
    clientName: 'Pramukh Group - Surat',
    location,
    projectValue,
    startDate: `2025-${String(Math.min(12, index + 1)).padStart(2, '0')}-01`,
    endDate: `2027-${String(Math.min(12, index + 3)).padStart(2, '0')}-30`,
    progress,
    currentPhase,
    status,
    propertyType,
    image,
    galleryImages: galleryImages || [image],
    overview,
    reraNo,
    projectUrl,
    budget,
    actualSpend,
    ...moduleData,
    labourRecords,
    equipments
  };
};

const centralParkModuleData: ProjectModuleData = {
  dailyActivities: [
    { id: 'da_central_1', projectId: 'central-park', date: '2026-06-10', engineerName: 'Priya Nair', weather: 'Cloudy', workCompleted: 'Tower B level 6 slab reinforcement inspection completed; clubhouse retaining-wall shuttering advanced and podium waterproofing test area prepared.', issues: 'Two bathroom sunken-slab sleeves require repositioning before the MEP clearance.', risks: 'Forecast rain may delay the podium membrane application unless the substrate is covered.', progressDelta: 0.3, status: 'Approved', activities: [], photos: [], submittedTime: '2026-06-10T17:30:00Z', totalLabourCount: 96 },
    { id: 'da_central_2', projectId: 'central-park', date: '2026-06-09', engineerName: 'Dhruv Shah', weather: 'Rainy', workCompleted: 'Tower A blockwork continued on levels 2 and 3; sample apartment electrical conduits and plumbing sleeves were coordinated.', issues: 'AAC block unloading was paused during heavy rain.', risks: 'Wet storage conditions could damage uncovered blocks.', progressDelta: 0.2, status: 'Approved', activities: [], photos: [], submittedTime: '2026-06-09T18:00:00Z', totalLabourCount: 110 },
    { id: 'da_central_3', projectId: 'central-park', date: '2026-06-08', engineerName: 'Priya Nair', weather: 'Sunny', workCompleted: 'Basement dewatering, ramp screed preparation, and landscape utility sleeve marking completed around the party lawn zone.', issues: null, risks: null, progressDelta: 0.2, status: 'Approved', activities: [], photos: [], submittedTime: '2026-06-08T18:15:00Z', totalLabourCount: 125 }
  ],
  materials: [
    { id: 'mat_central_concrete', projectId: 'central-park', itemName: 'M40 Ready-Mix Concrete', category: 'Structural Concrete', quantity: 186, unit: 'Cum', reorderLevel: 120, stockValue: 1302000, supplierName: 'Prism RMC Surat', transactions: [{ id: 'tx_central_concrete_1', materialId: 'mat_central_concrete', type: 'INWARD', quantity: 54, date: '2026-06-09', cost: 378000, referenceNo: 'GRN-CP-RMC-0619' }] },
    { id: 'mat_central_steel', projectId: 'central-park', itemName: 'Fe 550D Reinforcement Steel', category: 'Reinforcement', quantity: 38.5, unit: 'Metric Tons', reorderLevel: 25, stockValue: 2502500, supplierName: 'Tata Tiscon' },
    { id: 'mat_central_aac', projectId: 'central-park', itemName: 'AAC Blocks - 150 mm', category: 'Masonry', quantity: 7420, unit: 'Blocks', reorderLevel: 5000, stockValue: 519400, supplierName: 'Magicrete Building Solutions' },
    { id: 'mat_central_waterproofing', projectId: 'central-park', itemName: 'Podium Waterproofing Membrane', category: 'Waterproofing', quantity: 1280, unit: 'Sqm', reorderLevel: 1500, stockValue: 896000, supplierName: 'Fosroc India' },
    { id: 'mat_central_conduits', projectId: 'central-park', itemName: 'FRLS Electrical Conduits', category: 'MEP', quantity: 4650, unit: 'Meters', reorderLevel: 2500, stockValue: 325500, supplierName: 'AKG Group' }
  ],
  boqItems: [
    { id: 'boq_central_rcc', projectId: 'central-park', code: 'CP-STR-001', description: 'RCC frame for residential towers, podium, clubhouse, and basement structures', unit: 'Cum', rate: 7850, estimatedQty: 14800, consumedQty: 4460, approved: true },
    { id: 'boq_central_masonry', projectId: 'central-park', code: 'CP-ARC-014', description: 'AAC block masonry for apartment partitions, shafts, and service rooms', unit: 'Sqm', rate: 1280, estimatedQty: 68400, consumedQty: 12150, approved: true },
    { id: 'boq_central_waterproofing', projectId: 'central-park', code: 'CP-WP-021', description: 'Waterproofing for podium, terraces, toilets, planters, and basement retaining walls', unit: 'Sqm', rate: 920, estimatedQty: 22600, consumedQty: 3180, approved: true },
    { id: 'boq_central_mep', projectId: 'central-park', code: 'CP-MEP-032', description: 'Apartment electrical, plumbing, fire-fighting, and common-area service installations', unit: 'Lot', rate: 96500000, estimatedQty: 1, consumedQty: 0.18, approved: true },
    { id: 'boq_central_landscape', projectId: 'central-park', code: 'CP-LSC-041', description: 'Landscape and amenity works including jogging track, play area, party lawn, stage, and net cricket', unit: 'Lot', rate: 38200000, estimatedQty: 1, consumedQty: 0.06, approved: true }
  ],
  procurements: [
    { id: 'proc_central_1', projectId: 'central-park', requisitionNo: 'CP-PR-0261', title: 'Podium and planter waterproofing system', status: 'VENDOR_SELECTED', vendorName: 'Fosroc India', cost: 8450000, requestedDate: '2026-05-18', deliveryDate: '2026-06-14' },
    { id: 'proc_central_2', projectId: 'central-park', requisitionNo: 'CP-PR-0268', title: 'Passenger and service lift package for residential towers', status: 'RFQ_SENT', vendorName: null, cost: 46800000, requestedDate: '2026-05-29', deliveryDate: null },
    { id: 'proc_central_3', projectId: 'central-park', requisitionNo: 'CP-PR-0272', title: 'AAC blocks and thin-bed mortar - June requirement', status: 'PO_ISSUED', vendorName: 'Magicrete Building Solutions', cost: 3920000, requestedDate: '2026-06-02', deliveryDate: '2026-06-12' },
    { id: 'proc_central_4', projectId: 'central-park', requisitionNo: 'CP-PR-0277', title: 'Clubhouse pool filtration and water-treatment package', status: 'DRAFT', vendorName: null, cost: 6750000, requestedDate: '2026-06-08', deliveryDate: null }
  ],
  workforceLogs: [
    { id: 'lab_central_1', projectId: 'central-park', siteTowerBlock: 'Tower A', date: '2026-06-10', contractorName: 'Shreeji RCC Contractors', labourCategory: 'Mason', presentCount: 40, absentCount: 2, overtimeHours: 10, productivity: 'Normal', labourShortage: false, labourDelay: false },
    { id: 'lab_central_2', projectId: 'central-park', siteTowerBlock: 'Tower B', date: '2026-06-10', contractorName: 'Aarav Masonry Works', labourCategory: 'Helper', presentCount: 50, absentCount: 5, overtimeHours: 8, productivity: 'Good', labourShortage: false, labourDelay: false },
    { id: 'lab_central_3', projectId: 'central-park', siteTowerBlock: 'Podium', date: '2026-06-10', contractorName: 'Apex MEP Systems', labourCategory: 'Electrician', presentCount: 15, absentCount: 2, overtimeHours: 6, productivity: 'Low', labourShortage: true, labourDelay: true, issueReason: 'Shortage of electricians causing delay in conduits.', actionRequired: 'Need 5 more electricians tomorrow.' },
    { id: 'lab_central_4', projectId: 'central-park', siteTowerBlock: 'Podium', date: '2026-06-10', contractorName: 'SealTech Waterproofing', labourCategory: 'Mason', presentCount: 18, absentCount: 3, overtimeHours: 0, productivity: 'Work Stopped', labourShortage: false, labourDelay: true, issueReason: 'Substrate moisture high after rain, work stopped.' }
  ],
  equipmentLogs: [
    { id: 'eq_central_1', projectId: 'central-park', siteTowerBlock: 'Tower A', date: '2026-06-10', equipmentName: 'Tower Crane TC-6015', equipmentType: 'Crane', usageHours: 8, fuelConsumed: 0, status: 'Active', breakdown: false, maintenanceRequired: false },
    { id: 'eq_central_2', projectId: 'central-park', siteTowerBlock: 'Tower B', date: '2026-06-10', equipmentName: 'Concrete Boom Placer 36 m', equipmentType: 'Placer', usageHours: 6, fuelConsumed: 120, status: 'In Use', breakdown: false, maintenanceRequired: false },
    { id: 'eq_central_3', projectId: 'central-park', siteTowerBlock: 'Podium', date: '2026-06-10', equipmentName: 'Basement Dewatering Pump Set', equipmentType: 'Pump', usageHours: 12, fuelConsumed: 45, status: 'Under Maintenance', breakdown: true, breakdownReason: 'Motor coil burnt', maintenanceRequired: true }
  ],
  safetyIncidents: [
    { id: 'safe_central_1', projectId: 'central-park', siteTowerBlock: 'Tower B', date: '2026-06-10', safeDay: false, incidentHappened: true, incidentType: 'Fall hazard', severity: 'High', description: 'Missing edge protection on level 6 slab.', correctiveAction: 'Barricade installed immediately.', status: 'Resolved' },
    { id: 'safe_central_2', projectId: 'central-park', siteTowerBlock: 'Tower A', date: '2026-06-09', safeDay: true, incidentHappened: false, status: 'Reported' }
  ],
  tasks: [
    { id: 'task_central_1', projectId: 'central-park', name: 'Tower A - Level 2 Blockwork', startDate: '2026-06-01', endDate: '2026-06-15', progress: 65, dependencies: null, isCriticalPath: true, status: 'IN_PROGRESS', siteTowerBlock: 'Tower A', plannedQty: 1200, completedQty: 780, unit: 'Sqm' },
    { id: 'task_central_2', projectId: 'central-park', name: 'Tower B - Level 6 Slab Casting', startDate: '2026-06-08', endDate: '2026-06-12', progress: 40, dependencies: null, isCriticalPath: true, status: 'IN_PROGRESS', siteTowerBlock: 'Tower B', plannedQty: 450, completedQty: 180, unit: 'Cum' },
    { id: 'task_central_3', projectId: 'central-park', name: 'Podium Waterproofing - Phase 1', startDate: '2026-06-05', endDate: '2026-06-20', progress: 20, dependencies: null, isCriticalPath: false, status: 'DELAYED', siteTowerBlock: 'Podium', plannedQty: 2500, completedQty: 500, unit: 'Sqm' }
  ],
  documents: [
    { id: 'doc_central_1', projectId: 'central-park', name: 'Central Park GujRERA registration.pdf', category: 'APPROVAL', version: '1.0.0', url: 'https://pramukh.com/surat/central-park/', uploadDate: '2026-05-12', status: 'APPROVED' },
    { id: 'doc_central_2', projectId: 'central-park', name: 'Tower A and B structural IFC drawings.pdf', category: 'DRAWING', version: '4.2.0', url: '/files/central-park-structural-ifc.pdf', uploadDate: '2026-06-06', status: 'APPROVED' },
    { id: 'doc_central_3', projectId: 'central-park', name: 'Podium waterproofing method statement.pdf', category: 'APPROVAL', version: '2.0.0', url: '/files/central-park-waterproofing.pdf', uploadDate: '2026-06-08', status: 'PENDING' },
    { id: 'doc_central_4', projectId: 'central-park', name: 'Residential tower BOQ and cost plan.pdf', category: 'BOQ', version: '3.1.0', url: '/files/central-park-boq.pdf', uploadDate: '2026-06-01', status: 'APPROVED' },
    { id: 'doc_central_5', projectId: 'central-park', name: 'June progress photographs - towers and podium.zip', category: 'PHOTO', version: '1.0.0', url: '/files/central-park-june-progress.zip', uploadDate: '2026-06-10', status: 'PENDING' }
  ],
  chats: [
    { id: 'ch_central_1', projectId: 'central-park', senderName: 'Priya Nair', senderRole: 'SITE_ENGINEER', message: 'Tower B slab inspection is complete except for two bathroom sleeves. MEP team will close them before the 3:00 PM recheck.', timestamp: '2026-06-10T05:20:00Z', attachments: [] },
    { id: 'ch_central_2', projectId: 'central-park', senderName: 'Dhruv Shah', senderRole: 'QA_QC_ENGINEER', message: 'Podium waterproofing substrate moisture is above the application limit after rain. The mock-up area is covered and will be retested tomorrow morning.', timestamp: '2026-06-10T06:05:00Z', attachments: [] },
    { id: 'ch_central_3', projectId: 'central-park', senderName: 'Harsh Vora', senderRole: 'PROCUREMENT_MANAGER (Supply Line)', message: 'Lift vendors have submitted technical deviations. Commercial comparison will follow after consultant clarification.', timestamp: '2026-06-10T07:15:00Z', attachments: [] }
  ],
  qcItems: [
    { id: 'qc_central_1', projectId: 'central-park', title: 'Tower A level 7 reinforcement, cover blocks, and embed inspection', status: 'APPROVED' },
    { id: 'qc_central_2', projectId: 'central-park', title: 'Tower B slab MEP sleeves and bathroom depressions', status: 'PENDING' },
    { id: 'qc_central_3', projectId: 'central-park', title: 'Podium waterproofing substrate moisture and surface preparation', status: 'HOLD' },
    { id: 'qc_central_4', projectId: 'central-park', title: 'Sample apartment AAC block line, level, and opening dimensions', status: 'APPROVED' },
    { id: 'qc_central_5', projectId: 'central-park', title: 'Basement ramp screed slope and drain outlet test', status: 'PENDING' }
  ],
  invoices: [
    { id: 'inv_central_1', projectId: 'central-park', amount: 4275000, desc: 'RA Bill 14 - Tower A and B RCC works' },
    { id: 'inv_central_2', projectId: 'central-park', amount: 1186000, desc: 'May supply invoice - Fe 550D reinforcement steel' },
    { id: 'inv_central_3', projectId: 'central-park', amount: 642000, desc: 'AAC blocks and thin-bed mortar - Lot 06' },
    { id: 'inv_central_4', projectId: 'central-park', amount: 385000, desc: 'Podium waterproofing mobilization advance' }
  ],
  teamMembers: [
    { id: 'tm_central_1', projectId: 'central-park', name: 'Vikram Patel', role: 'Project Director' },
    { id: 'tm_central_2', projectId: 'central-park', name: 'Priya Nair', role: 'Construction Manager' },
    { id: 'tm_central_3', projectId: 'central-park', name: 'Dhruv Shah', role: 'QA/QC Engineer' },
    { id: 'tm_central_4', projectId: 'central-park', name: 'Neha Joshi', role: 'MEP Coordinator' },
    { id: 'tm_central_5', projectId: 'central-park', name: 'Kavya Desai', role: 'Architectural Coordinator' },
    { id: 'tm_central_6', projectId: 'central-park', name: 'Harsh Vora', role: 'Procurement Manager' }
  ],
  checklistTemplates: [
    {
      id: 'ct_central_1',
      name: 'Slab Casting Checklist',
      category: 'QC',
      version: '1.0',
      status: 'ACTIVE',
      items: [
        { id: 'cti_1', question: 'Shuttering line and level checked', acceptanceCriteria: 'Must be perfectly aligned', isMandatory: true, requirePhoto: true, requireRemarks: false, sequence: 1 },
        { id: 'cti_2', question: 'Reinforcement checked as per drawing', acceptanceCriteria: 'Correct spacing and diameter', isMandatory: true, requirePhoto: true, requireRemarks: true, sequence: 2 },
        { id: 'cti_3', question: 'Cover blocks provided', acceptanceCriteria: 'Appropriate concrete cover', isMandatory: true, requirePhoto: false, requireRemarks: false, sequence: 3 },
      ]
    }
  ],
  submittedChecklists: [
    {
      id: 'sc_central_1',
      projectId: 'central-park',
      templateId: 'ct_central_1',
      activityId: 'da_central_1',
      submittedBy: 'Priya Nair',
      submittedAt: '2026-06-10T08:00:00Z',
      status: 'QC_PENDING',
      items: [
        { templateItemId: 'cti_1', response: 'Pass', remarks: 'Looks good', photos: ['/images/qc1.jpg'] },
        { templateItemId: 'cti_2', response: 'Fail', remarks: 'Spacing incorrect at south corner', photos: ['/images/qc2.jpg'] },
        { templateItemId: 'cti_3', response: 'Pass', remarks: '', photos: [] },
      ]
    }
  ],
  qcInspections: [
    {
      id: 'qci_central_1',
      projectId: 'central-park',
      checklistId: 'sc_central_1',
      assignedTo: 'Dhruv Shah',
      inspectionDate: '2026-06-10T10:00:00Z',
      status: 'FAILED',
      items: [
        { checklistTemplateItemId: 'cti_1', qcResult: 'Pass', qcRemarks: 'Verified', photoProof: [] },
        { checklistTemplateItemId: 'cti_2', qcResult: 'Fail', qcRemarks: 'Rework needed as per structural drawings', photoProof: [] },
        { checklistTemplateItemId: 'cti_3', qcResult: 'Pass', qcRemarks: 'Verified', photoProof: [] }
      ]
    }
  ],
  reworkTasks: [
    {
      id: 'rw_central_1',
      projectId: 'central-park',
      qcInspectionId: 'qci_central_1',
      failedItemId: 'cti_2',
      description: 'Fix reinforcement spacing at south corner',
      severity: 'High',
      assignedTo: 'Priya Nair',
      dueDate: '2026-06-11T10:00:00Z',
      correctiveAction: 'Adjust rebars as per drawing RC-04',
      status: 'OPEN',
      photos: []
    }
  ],
  workCompletions: [
    {
      id: 'wc_central_1',
      projectId: 'central-park',
      activityId: 'da_central_1',
      status: 'REWORK_REQUIRED',
      billingAllowed: false,
      blockReason: 'QC Failed - Rework Open'
    }
  ],
  delays: [
    { id: 'delay_central_1', projectId: 'central-park', siteTowerBlock: 'Podium', activityId: 'task_central_3', dprId: null, delayDate: '2026-06-10', delayDays: 2, severity: 'Medium', status: 'Open', reasonCode: 'WEATHER', reasonDetails: 'Heavy rain prevented membrane application on the podium.', impactOnSchedule: true, impactOnCost: false, criticalPathImpact: false, responsibleTeam: 'Waterproofing Contractor' }
  ],
  correctiveTasks: []
};

const orbit4ModuleData: ProjectModuleData = {
  dailyActivities: [
    { id: 'da_orbit4_1', projectId: 'orbit-4', date: '2026-06-10', engineerName: 'Mayur Vyas', weather: 'Cloudy', workCompleted: 'Level 8 composite slab deck inspection completed; east facade GRC sun-breaker brackets and basement-2 fire piping supports progressed.', issues: 'Two facade anchor plates are outside the approved tolerance and require rectification.', risks: 'Delayed high-speed lift shop-drawing approval may affect shaft handover.', progressDelta: 0.3, status: 'Submitted', activities: [], photos: [], submittedTime: '2026-06-10T18:00:00Z', totalLabourCount: 74 },
    { id: 'da_orbit4_2', projectId: 'orbit-4', date: '2026-06-09', engineerName: 'Ritika Mehta', weather: 'Rainy', workCompleted: 'Basement-1 parking ventilation duct installation continued; podium showroom plumbing sleeves and electrical bus-duct openings were checked.', issues: 'Rainwater entered the temporary loading-bay access.', risks: 'Material movement will remain restricted until the access is regraded.', progressDelta: 0.2, status: 'Approved', activities: [], photos: [], submittedTime: '2026-06-09T18:30:00Z', totalLabourCount: 82 },
    { id: 'da_orbit4_3', projectId: 'orbit-4', date: '2026-06-08', engineerName: 'Mayur Vyas', weather: 'Sunny', workCompleted: 'Level 7 office-floor blockwork completed and open-air cafeteria drainage mock-up reviewed with the architect.', issues: null, risks: null, progressDelta: 0.2, status: 'Approved', activities: [], photos: [], submittedTime: '2026-06-08T18:00:00Z', totalLabourCount: 80 }
  ],
  materials: [
    { id: 'mat_orbit_steel', projectId: 'orbit-4', itemName: 'Fe 550D Reinforcement Steel', category: 'Structure', quantity: 31.2, unit: 'Metric Tons', reorderLevel: 22, stockValue: 2028000, supplierName: 'JSW Neosteel' },
    { id: 'mat_orbit_deck', projectId: 'orbit-4', itemName: 'Galvanized Composite Deck Sheets', category: 'Structural Decking', quantity: 1840, unit: 'Sqm', reorderLevel: 1200, stockValue: 2484000, supplierName: 'Tata BlueScope Steel' },
    { id: 'mat_orbit_grc', projectId: 'orbit-4', itemName: 'GRC Sun-Breaker Panels', category: 'Facade', quantity: 146, unit: 'Panels', reorderLevel: 180, stockValue: 3212000, supplierName: 'Classic GRC India' },
    { id: 'mat_orbit_duct', projectId: 'orbit-4', itemName: 'GI HVAC Ducting - 24 Gauge', category: 'HVAC', quantity: 3260, unit: 'Sqm', reorderLevel: 2000, stockValue: 1793000, supplierName: 'Airflow Systems' },
    { id: 'mat_orbit_firepipe', projectId: 'orbit-4', itemName: 'MS Fire-Fighting Pipe - 100 mm', category: 'Fire Safety', quantity: 1280, unit: 'Meters', reorderLevel: 700, stockValue: 1024000, supplierName: 'Jindal Pipes' }
  ],
  boqItems: [
    { id: 'boq_orbit_structure', projectId: 'orbit-4', code: 'O4-STR-006', description: 'RCC and composite structural frame for G+12 commercial floors and three basement levels', unit: 'Cum', rate: 8420, estimatedQty: 9650, consumedQty: 5180, approved: true },
    { id: 'boq_orbit_facade', projectId: 'orbit-4', code: 'O4-FAC-018', description: 'Unitized glazing, aluminium fins, and GRC sun-breaker facade system', unit: 'Sqm', rate: 12850, estimatedQty: 14200, consumedQty: 2380, approved: true },
    { id: 'boq_orbit_lifts', projectId: 'orbit-4', code: 'O4-VT-024', description: 'Four high-speed passenger elevators with destination-control system', unit: 'Nos', rate: 12800000, estimatedQty: 4, consumedQty: 0, approved: true },
    { id: 'boq_orbit_mep', projectId: 'orbit-4', code: 'O4-MEP-031', description: 'HVAC, electrical bus duct, plumbing, fire-fighting, and building-management systems', unit: 'Lot', rate: 112500000, estimatedQty: 1, consumedQty: 0.32, approved: true },
    { id: 'boq_orbit_parking', projectId: 'orbit-4', code: 'O4-PKG-038', description: 'Three-level basement parking finishes, ventilation, signage, and traffic-management systems', unit: 'Lot', rate: 28600000, estimatedQty: 1, consumedQty: 0.27, approved: true }
  ],
  procurements: [
    { id: 'proc_orbit_1', projectId: 'orbit-4', requisitionNo: 'O4-PR-0184', title: 'Four high-speed passenger lifts with destination control', status: 'VENDOR_SELECTED', vendorName: 'KONE Elevators India', cost: 51200000, requestedDate: '2026-05-12', deliveryDate: '2026-08-25' },
    { id: 'proc_orbit_2', projectId: 'orbit-4', requisitionNo: 'O4-PR-0191', title: 'Unitized glazing and GRC sun-breaker facade package', status: 'PO_ISSUED', vendorName: 'Alufit India', cost: 86400000, requestedDate: '2026-05-22', deliveryDate: '2026-06-28' },
    { id: 'proc_orbit_3', projectId: 'orbit-4', requisitionNo: 'O4-PR-0198', title: 'Basement ventilation fans and CO monitoring system', status: 'RFQ_SENT', vendorName: null, cost: 12800000, requestedDate: '2026-06-01', deliveryDate: null },
    { id: 'proc_orbit_4', projectId: 'orbit-4', requisitionNo: 'O4-PR-0203', title: 'Commercial-floor electrical bus duct and tap-off boxes', status: 'DRAFT', vendorName: null, cost: 17600000, requestedDate: '2026-06-08', deliveryDate: null }
  ],
  workforceLogs: [
    { id: 'lab_orbit_1', projectId: 'orbit-4', siteTowerBlock: 'Main Tower', date: '2026-06-10', contractorName: 'Paramount Structures', labourCategory: 'Carpenter', presentCount: 40, absentCount: 4, overtimeHours: 14, productivity: 'Good', labourShortage: false, labourDelay: false },
    { id: 'lab_orbit_2', projectId: 'orbit-4', siteTowerBlock: 'Main Tower', date: '2026-06-10', contractorName: 'Alufit Facade Team', labourCategory: 'Fitter', presentCount: 32, absentCount: 3, overtimeHours: 6, productivity: 'Normal', labourShortage: false, labourDelay: false },
    { id: 'lab_orbit_3', projectId: 'orbit-4', siteTowerBlock: 'Basement-1', date: '2026-06-10', contractorName: 'Apex MEP Systems', labourCategory: 'Plumber', presentCount: 20, absentCount: 5, overtimeHours: 12, productivity: 'Not Enough Labour', labourShortage: true, labourDelay: false, issueReason: 'Need more plumbers for sleeves' }
  ],
  equipmentLogs: [
    { id: 'eq_orbit_1', projectId: 'orbit-4', siteTowerBlock: 'Main Tower', date: '2026-06-10', equipmentName: 'Tower Crane TC-6513', equipmentType: 'Crane', usageHours: 10, fuelConsumed: 0, status: 'Active', breakdown: false, maintenanceRequired: false },
    { id: 'eq_orbit_2', projectId: 'orbit-4', siteTowerBlock: 'Main Tower', date: '2026-06-10', equipmentName: 'Passenger and Material Hoist', equipmentType: 'Hoist', usageHours: 8, fuelConsumed: 0, status: 'Active', breakdown: false, maintenanceRequired: false },
    { id: 'eq_orbit_3', projectId: 'orbit-4', siteTowerBlock: 'Main Tower', date: '2026-06-10', equipmentName: 'Mobile Crane 25T', equipmentType: 'Crane', usageHours: 0, fuelConsumed: 0, status: 'Idle', breakdown: false, maintenanceRequired: false },
    { id: 'eq_orbit_4', projectId: 'orbit-4', siteTowerBlock: 'Basement-1', date: '2026-06-10', equipmentName: 'Diesel Generator 250 kVA', equipmentType: 'Generator', usageHours: 4, fuelConsumed: 80, status: 'Under Maintenance', breakdown: false, maintenanceRequired: true }
  ],
  safetyIncidents: [
    { id: 'safe_orbit_1', projectId: 'orbit-4', siteTowerBlock: 'Main Tower', date: '2026-06-10', safeDay: false, incidentHappened: true, incidentType: 'PPE violation', severity: 'Low', description: 'Workers found without safety helmets during facade works.', correctiveAction: 'Helmets provided and warning issued.', status: 'Closed' }
  ],
  tasks: [
    { id: 'task_orbit_1', projectId: 'orbit-4', name: 'Level 8 Slab Decking', startDate: '2026-06-05', endDate: '2026-06-12', progress: 90, dependencies: null, isCriticalPath: true, status: 'IN_PROGRESS', siteTowerBlock: 'Main Tower', plannedQty: 1840, completedQty: 1650, unit: 'Sqm' },
    { id: 'task_orbit_2', projectId: 'orbit-4', name: 'East Facade GRC Installation', startDate: '2026-06-01', endDate: '2026-06-30', progress: 15, dependencies: null, isCriticalPath: false, status: 'DELAYED', siteTowerBlock: 'Main Tower', plannedQty: 146, completedQty: 22, unit: 'Panels' }
  ],
  documents: [
    { id: 'doc_orbit_1', projectId: 'orbit-4', name: 'Orbit 4 GujRERA registration.pdf', category: 'APPROVAL', version: '1.0.0', url: 'https://pramukh.com/surat/orbit-4/', uploadDate: '2026-05-12', status: 'APPROVED' },
    { id: 'doc_orbit_2', projectId: 'orbit-4', name: 'G+12 and basement structural IFC set.pdf', category: 'DRAWING', version: '5.0.0', url: '/files/orbit-4-structural-ifc.pdf', uploadDate: '2026-06-04', status: 'APPROVED' },
    { id: 'doc_orbit_3', projectId: 'orbit-4', name: 'Facade anchor and GRC sun-breaker shop drawings.pdf', category: 'DRAWING', version: '2.3.0', url: '/files/orbit-4-facade-shop-drawings.pdf', uploadDate: '2026-06-09', status: 'PENDING' },
    { id: 'doc_orbit_4', projectId: 'orbit-4', name: 'Commercial MEP coordinated services drawings.pdf', category: 'DRAWING', version: '3.2.0', url: '/files/orbit-4-mep-coordination.pdf', uploadDate: '2026-06-07', status: 'APPROVED' },
    { id: 'doc_orbit_5', projectId: 'orbit-4', name: 'Orbit 4 package BOQ and procurement schedule.pdf', category: 'BOQ', version: '4.1.0', url: '/files/orbit-4-boq.pdf', uploadDate: '2026-06-02', status: 'APPROVED' }
  ],
  chats: [
    { id: 'ch_orbit_1', projectId: 'orbit-4', senderName: 'Mayur Vyas', senderRole: 'SITE_ENGINEER', message: 'Level 8 deck and reinforcement inspection is closed. Concrete pour can proceed after the facade edge-protection recheck.', timestamp: '2026-06-10T05:35:00Z', attachments: [] },
    { id: 'ch_orbit_2', projectId: 'orbit-4', senderName: 'Ritika Mehta', senderRole: 'QA_QC_ENGINEER', message: 'Two east-elevation anchor plates exceed tolerance. NCR is raised and the facade team has started rectification.', timestamp: '2026-06-10T06:20:00Z', attachments: [] },
    { id: 'ch_orbit_3', projectId: 'orbit-4', senderName: 'Harsh Vora', senderRole: 'PROCUREMENT_MANAGER (Supply Line)', message: 'KONE is selected for the four-lift package. Final shop-drawing comments are the only item holding the manufacturing release.', timestamp: '2026-06-10T07:30:00Z', attachments: [] }
  ],
  qcItems: [
    { id: 'qc_orbit_1', projectId: 'orbit-4', title: 'Level 8 deck profile, shear studs, reinforcement, and slab edge inspection', status: 'APPROVED' },
    { id: 'qc_orbit_2', projectId: 'orbit-4', title: 'East facade anchor plate survey and pull-out test', status: 'REJECTED' },
    { id: 'qc_orbit_3', projectId: 'orbit-4', title: 'Basement-2 fire main pressure test', status: 'PENDING' },
    { id: 'qc_orbit_4', projectId: 'orbit-4', title: 'Parking ventilation duct leakage and support spacing inspection', status: 'PENDING' },
    { id: 'qc_orbit_5', projectId: 'orbit-4', title: 'Open-air cafeteria drainage slope and flood test', status: 'APPROVED' }
  ],
  invoices: [
    { id: 'inv_orbit_1', projectId: 'orbit-4', amount: 3860000, desc: 'RA Bill 11 - Commercial superstructure works' },
    { id: 'inv_orbit_2', projectId: 'orbit-4', amount: 2425000, desc: 'Facade aluminium and GRC material advance' },
    { id: 'inv_orbit_3', projectId: 'orbit-4', amount: 978000, desc: 'Basement HVAC ducting - May measurement' },
    { id: 'inv_orbit_4', projectId: 'orbit-4', amount: 1360000, desc: 'Fire-fighting pipe and fittings - Lot 04' }
  ],
  teamMembers: [
    { id: 'tm_orbit_1', projectId: 'orbit-4', name: 'Vikram Patel', role: 'Project Director' },
    { id: 'tm_orbit_2', projectId: 'orbit-4', name: 'Mayur Vyas', role: 'Construction Manager' },
    { id: 'tm_orbit_3', projectId: 'orbit-4', name: 'Ritika Mehta', role: 'QA/QC and Facade Engineer' },
    { id: 'tm_orbit_4', projectId: 'orbit-4', name: 'Jignesh Parmar', role: 'MEP Manager' },
    { id: 'tm_orbit_5', projectId: 'orbit-4', name: 'Ananya Rao', role: 'Vertical Transportation Consultant' },
    { id: 'tm_orbit_6', projectId: 'orbit-4', name: 'Harsh Vora', role: 'Procurement Manager' }
  ],
  delays: [
    { id: 'delay_orbit_1', projectId: 'orbit-4', siteTowerBlock: 'Main Tower', activityId: 'task_orbit_2', dprId: 'da_orbit4_1', delayDate: '2026-06-10', delayDays: 3, severity: 'High', status: 'Assigned', reasonCode: 'QC', reasonDetails: 'Two east-elevation anchor plates exceed tolerance, requiring rework.', impactOnSchedule: false, impactOnCost: true, criticalPathImpact: false, responsibleTeam: 'Facade Team', actionAssignedTo: 'u3' }
  ],
  correctiveTasks: [
    { id: 'ctask_orbit_1', projectId: 'orbit-4', title: 'Rectify Facade Anchor Plates', siteTowerBlock: 'Main Tower', linkedActivityId: 'task_orbit_2', linkedRecordId: 'delay_orbit_1', recordType: 'DELAY', assignedTo: 'u3', dueDate: '2026-06-12', priority: 'HIGH', description: 'Re-align and re-weld anchor plates as per NCR instructions.', requiredAction: 'Submit pull-out test report after rework.', status: 'OPEN', attachments: [] }
  ]
};

export const mockProjects: ProjectSite[] = [
  createSuratProject({
    id: 'central-park',
    name: 'Central Park',
    location: 'Pal, Surat',
    propertyType: '3 | 3.5 | 4 | 4.5 BHK Infinite Living',
    image: suratProjectImages.centralPark,
    galleryImages: [
      '/images/projects/central-park-gallery/central-park-gallery-1.jpg',
      '/images/projects/central-park-gallery/central-park-gallery-2.jpg',
      '/images/projects/central-park-gallery/central-park-gallery-3.jpg',
      '/images/projects/central-park-gallery/central-park-gallery-4.jpg',
      '/images/projects/central-park-gallery/central-park-gallery-5.jpg',
      '/images/projects/central-park-gallery/central-park-gallery-6.jpg',
      '/images/projects/central-park-gallery/central-park-gallery-7.jpg',
      '/images/projects/central-park-gallery/central-park-gallery-8.jpg',
      '/images/projects/central-park-gallery/central-park-gallery-9.jpg',
      '/images/projects/central-park-gallery/central-park-gallery-10.jpg',
      '/images/projects/central-park-gallery/central-park-gallery-11.jpg',
      '/images/projects/central-park-gallery/central-park-gallery-12.jpg',
      '/images/projects/central-park-gallery/central-park-gallery-13.jpg',
      '/images/projects/central-park-gallery/central-park-gallery-14.jpg',
    ],
    overview: 'A Pal luxury residential project shaped around nature, amenities, and large-format apartment living.',
    reraNo: 'PR/GJ/SURAT/SURAT CITY/Surat Municipal Corporation/RAA13272/080424/311233',
    projectUrl: 'https://pramukh.com/surat/central-park/',
    progress: 28,
    projectValue: 980000000,
    index: 4,
    moduleData: centralParkModuleData
  }),
  createSuratProject({
    id: 'orbit-4',
    name: 'Orbit 4',
    location: 'Bhatar, Surat',
    propertyType: 'Showrooms, Offices, Cafes, Restaurants',
    image: suratProjectImages.orbit4,
    galleryImages: [
      '/images/projects/orbit-4-gallery/orbit-4-gallery-1.jpg',
      '/images/projects/orbit-4-gallery/orbit-4-gallery-2.jpg',
      '/images/projects/orbit-4-gallery/orbit-4-gallery-3.jpg',
      '/images/projects/orbit-4-gallery/orbit-4-gallery-4.jpg',
      '/images/projects/orbit-4-gallery/orbit-4-gallery-5.jpg',
      '/images/projects/orbit-4-gallery/orbit-4-gallery-6.jpg',
      '/images/projects/orbit-4-gallery/orbit-4-gallery-7.jpg',
      '/images/projects/orbit-4-gallery/orbit-4-gallery-8.jpg',
    ],
    overview: 'A corporate commercial building near Ghod Dod Road, crafted as a modern business address.',
    reraNo: 'PR/GJ/SURAT/SURAT CITY/Surat Municipal Corporation/CAA13670/110624/310330',
    projectUrl: 'https://pramukh.com/surat/orbit-4/',
    progress: 46,
    projectValue: 590000000,
    index: 11,
    moduleData: orbit4ModuleData
  })
];

export const aiAnalyticsInsights = [
  {
    id: 'ai2',
    projectId: 'central-park',
    type: 'Delay Prediction',
    title: 'Central Park Schedule Risk',
    description: 'Foundation and basement sequencing is running below baseline. Delay might push superstructure works deeper into the monsoon window.',
    confidenceScore: 94,
    impactLevel: 'HIGH',
    recommendation: 'Add a second concrete and waterproofing crew before the next milestone review.'
  }
];

export const globalNotifications = [
  { id: 'n1', type: 'budget', title: 'Budget watch', message: 'Central Park has exceeded the weekly foundation package forecast by 6%.', time: '10 mins ago', read: false },
  { id: 'n3', type: 'delay', title: 'Delay Risk Predicted', message: 'AI Engine predicts a schedule risk on Central Park due to basement sequencing.', time: '3 hours ago', read: true }
];

export const initialMockVendors: Vendor[] = [
  { id: 'v1', name: 'UltraTech Cement Ltd', gstNumber: '24AAACU1204M1Z2', email: 'sales@ultratech.com', phone: '+91 98765 43210', address: 'Adani Road, Surat, Gujarat', category: 'Cement & Concrete', rating: 96 },
  { id: 'v2', name: 'Tata Tiscon Steel', gstNumber: '24AAACT8902P2Z4', email: 'support@tatatiscon.com', phone: '+91 91234 56789', address: 'Hazira Industrial Area, Surat', category: 'Reinforcement Steel', rating: 98 },
  { id: 'v3', name: 'Polycab India Ltd', gstNumber: '24AAACP4501Q3Z6', email: 'quotes@polycab.com', phone: '+91 99887 76655', address: 'Ring Road, Surat, Gujarat', category: 'Electrical Materials', rating: 94 },
  { id: 'v4', name: 'Kajaria Ceramics', gstNumber: '24AAACK1102A1Z8', email: 'info@kajariaceramics.com', phone: '+91 97766 55443', address: 'Udhna Magdalla Road, Surat', category: 'Flooring & Tiles', rating: 90 },
  { id: 'v5', name: 'Shreeji Builders & Labour', gstNumber: '24AAACS3304S4ZA', email: 'shreeji.labour@gmail.com', phone: '+91 96655 44332', address: 'Katargam, Surat, Gujarat', category: 'Workforce Contracting', rating: 84 },
  { id: 'v6', name: 'Sanghi Cement Industries', gstNumber: '24AAACS7711B2ZB', email: 'sanghi@cement.com', phone: '+91 95544 33221', address: 'Sanghi Nagar, Kutch, Gujarat', category: 'Cement', rating: 94 },
  { id: 'v7', name: 'Raj Steel Corporation', gstNumber: '24AAACR1212C1ZC', email: 'rajsteel@gmail.com', phone: '+91 94433 22110', address: 'GIDC, Sachin, Surat', category: 'Steel', rating: 88 },
  { id: 'v8', name: 'Narmada ReadyMix Concrete', gstNumber: '24AAACN2323D1ZD', email: 'narmada@rmc.com', phone: '+91 93322 11009', address: 'Kamrej, Surat, Gujarat', category: 'Ready-mix', rating: 72 },
  { id: 'v9', name: 'Supreme Electricals', gstNumber: '24AAACS8888E1ZE', email: 'sales@supremeelec.com', phone: '+91 92211 00998', address: 'Varachha, Surat, Gujarat', category: 'Electrical', rating: 91 }
];

export const initialMockVendorQuotations: VendorQuotation[] = [
  { id: 'q1', vendorId: 'v1', vendorName: 'UltraTech Cement Ltd', projectId: 'central-park', materialCategory: 'Cement & Concrete', unitRate: 410, leadTimeDays: 2, gstDetails: '18% GST Extra', paymentTerms: '30 Days Net', status: 'APPROVED', submittedAt: '2026-05-15T10:00:00Z' },
  { id: 'q2', vendorId: 'v6', vendorName: 'Sanghi Cement Industries', projectId: 'central-park', materialCategory: 'Cement & Concrete', unitRate: 395, leadTimeDays: 3, gstDetails: '18% GST Extra', paymentTerms: '15 Days Net', status: 'PENDING', submittedAt: '2026-05-16T11:30:00Z' },
  { id: 'q3', vendorId: 'v2', vendorName: 'Tata Tiscon Steel', projectId: 'central-park', materialCategory: 'Reinforcement Steel', unitRate: 62000, leadTimeDays: 5, gstDetails: '18% GST Extra', paymentTerms: '30 Days Net', status: 'APPROVED', submittedAt: '2026-05-12T09:00:00Z' },
  { id: 'q4', vendorId: 'v7', vendorName: 'Raj Steel Corporation', projectId: 'central-park', materialCategory: 'Reinforcement Steel', unitRate: 61500, leadTimeDays: 7, gstDetails: '18% GST Extra', paymentTerms: 'LC At Sight', status: 'PENDING', submittedAt: '2026-05-14T14:00:00Z' },
  { id: 'q5', vendorId: 'v3', vendorName: 'Polycab India Ltd', projectId: 'central-park', materialCategory: 'Electrical Materials', unitRate: 150, leadTimeDays: 4, gstDetails: '18% GST Extra', paymentTerms: 'Immediate Payment', status: 'APPROVED', submittedAt: '2026-05-20T10:15:00Z' }
];

export const initialMockVendorBills: VendorBill[] = [
  { id: 'b1', vendorId: 'v1', vendorName: 'UltraTech Cement Ltd', projectId: 'central-park', invoiceNumber: 'INV-UT-90281', amount: 4800000, date: '2026-06-05', status: 'PAID', ref: 'TXN-90281' },
  { id: 'b2', vendorId: 'v2', vendorName: 'Tata Tiscon Steel', projectId: 'central-park', invoiceNumber: 'INV-TT-90176', amount: 7500000, date: '2026-06-02', status: 'PAID', ref: 'TXN-90176' },
  { id: 'b3', vendorId: 'v8', vendorName: 'Narmada ReadyMix Concrete', projectId: 'central-park', invoiceNumber: 'INV-NRMC-89945', amount: 3200000, date: '2026-05-28', status: 'HELD', ref: null },
  { id: 'b4', vendorId: 'v9', vendorName: 'Supreme Electricals', projectId: 'central-park', invoiceNumber: 'INV-SE-90512', amount: 1500000, date: '2026-06-08', status: 'VERIFIED', ref: null },
  { id: 'b5', vendorId: 'v1', vendorName: 'UltraTech Cement Ltd', projectId: 'orbit-4', invoiceNumber: 'INV-UT-44021', amount: 3860000, date: '2026-06-01', status: 'PAID', ref: 'TXN-44021' },
  { id: 'b6', vendorId: 'v2', vendorName: 'Tata Tiscon Steel', projectId: 'orbit-4', invoiceNumber: 'INV-TT-44089', amount: 2425000, date: '2026-06-04', status: 'DUE', ref: null }
];

export const initialMockVendorPayments: VendorPayment[] = [
  { id: 'pay1', vendorId: 'v1', vendorName: 'UltraTech Cement Ltd', billId: 'b1', amount: 4800000, date: '2026-06-05', status: 'SUCCESS', paymentRef: 'TXN-90281' },
  { id: 'pay2', vendorId: 'v2', vendorName: 'Tata Tiscon Steel', billId: 'b2', amount: 7500000, date: '2026-06-02', status: 'SUCCESS', paymentRef: 'TXN-90176' },
  { id: 'pay3', vendorId: 'v1', vendorName: 'UltraTech Cement Ltd', billId: 'b5', amount: 3860000, date: '2026-06-05', status: 'SUCCESS', paymentRef: 'TXN-44021' }
];

export const initialMockVendorPerformances: VendorPerformance[] = [
  { id: 'perf1', vendorId: 'v1', vendorName: 'UltraTech Cement Ltd', projectId: 'central-park', deliveryScore: 98, qualityScore: 99.5, priceScore: 92, responseScore: 95, feedback: 'Excellent delivery compliance and testing pass rates.', evaluationDate: '2026-06-10T12:00:00Z' },
  { id: 'perf2', vendorId: 'v2', vendorName: 'Tata Tiscon Steel', projectId: 'central-park', deliveryScore: 92, qualityScore: 98, priceScore: 89, responseScore: 90, feedback: 'Strong logistics, occasional minor shipment bundle splits.', evaluationDate: '2026-06-10T12:00:00Z' },
  { id: 'perf3', vendorId: 'v8', vendorName: 'Narmada ReadyMix Concrete', projectId: 'central-park', deliveryScore: 79, qualityScore: 94.2, priceScore: 80, responseScore: 75, feedback: 'Slump test failed on two transit mixers in May. Workmanship improvements required.', evaluationDate: '2026-06-10T12:00:00Z' },
  { id: 'perf4', vendorId: 'v9', vendorName: 'Supreme Electricals', projectId: 'central-park', deliveryScore: 95, qualityScore: 97.8, priceScore: 91, responseScore: 92, feedback: 'Good performance, prompt replacement of broken conduit lots.', evaluationDate: '2026-06-10T12:00:00Z' }
];
