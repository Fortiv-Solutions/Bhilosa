'use client';

import React, { useState } from 'react';
import { SearchableSelect, SearchableItemInput } from '../purchase-requisition/pr-item-table';
import { supabase } from '@/utils/supabase-client';
import { useAppStore } from '@/store/use-app-store';
import {
  ShoppingBag,
  Building2,
  Calendar,
  Send,
  Plus,
  Minus,
  Trash2,
  CheckCircle2,
  Layers,
  X,
  FileCheck,
  ShieldCheck,
  AlertTriangle,
  FileSpreadsheet,
  FileText,
  HelpCircle,
  Loader2,
  Save,
  Printer,
  Check,
  Upload,
  Mail,
  ArrowLeft,
  XCircle,
  RotateCcw,
} from 'lucide-react';
import {
  type PurchaseOrderRow,
  type VendorOption,
  type PrOption,
  type PurchaseOrderFormPayload,
  type PurchaseOrderFormLine,
  type ProcurementProjectOption,
  type BudgetCategoryOption,
  updatePurchaseOrderTermsAndConditions,
  printPurchaseOrderReport,
  listProcurementProjects,
  listActiveVendorOptions,
  listActivePrOptions,
  listBudgetCategoryOptions,
  cleanMaterialUnit,
} from '@/lib/procurement';
import { PoCloseModal } from './po-close-modal';
import { PoAmendModal } from './po-amend-modal';
import {
  normalizePoStatus,
  availablePoTransitions,
  poRequiresReason,
  poStatusLabel,
  isPoEditable,
  type PoStatus,
} from '@/lib/erp/purchase-order/status';

function numberToWords(num: number): string {
  if (!num || isNaN(num)) return 'Zero Only';
  const a = [
    '', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ',
    'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '
  ];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const inWords = (n: number): string => {
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + a[n % 10] : ' ');
    if (n < 1000) return a[Math.floor(n / 100)] + 'Hundred ' + (n % 100 !== 0 ? 'and ' + inWords(n % 100) : '');
    if (n < 100000) return inWords(Math.floor(n / 1000)) + 'Thousand ' + (n % 1000 !== 0 ? inWords(n % 1000) : '');
    if (n < 10000000) return inWords(Math.floor(n / 100000)) + 'Lakh ' + (n % 100000 !== 0 ? inWords(n % 100000) : '');
    return inWords(Math.floor(n / 10000000)) + 'Crore ' + (n % 10000000 !== 0 ? inWords(n % 10000000) : '');
  };

  const integerPart = Math.floor(num);
  const words = inWords(integerPart).trim();
  return (words ? words : 'Zero') + ' Rupees Only';
}

export interface PoLineItemEntry {
  item_group: string;
  item_desc: string;
  item_code: string;
  item_brand: string;
  item_specification: string;
  open_po: boolean;
  open_till_date: string;
  approved_qty: number;
  unit: string;
  due_on: string;
  purchase_category: string;
  estimated_rate: number;
  basic_rate: number;
  discount_perc: number;
  discount_amt: number;
  rate: number;
  hsn_code: string;
  tax_code: string;
  tax_code_amount: number;
  previous_rate: number;
  amt: number;
  freight_chgs: number;
  load_unload_chgs: number;
  others_chgs: number;
  gst_applicable: boolean;
  net_amt: number;
  gst_principal_amount: number;
  grn_balance_qty: number;
  gst_rate: number;
  over_tolerance_pct?: number;
  activity_name?: string;
  sub_activity_name?: string;
}

export interface FullPoFormState {
  // Uploaded Document Details
  uploaded_document_url?: string;
  uploaded_document_path?: string;
  uploaded_document_name?: string;
  // Challan and invoice attachments deliberately do NOT live here. A challan
  // arrives with the goods and an invoice arrives with the bill, so both belong
  // to the GRN and Bills forms — which is where the working implementation is.
  // The PO form previously carried a copy of that plumbing that was never
  // wired to any file input, plus a filename-sniffing "vendor extractor" that
  // overwrote supplier_name from the uploaded file's name while vendor_id kept
  // pointing at the real supplier.

  // Header Fields (in exact specified order)
  po_number: string;
  po_date: string;
  prepared_by: string;
  company_name: string;
  pan_no: string;
  vat_no: string;
  cst_no: string;
  cess_no: string;
  project_name: string;
  budget_applicable: boolean;
  project_address: string;
  site_contact: string;
  supplier_name: string;
  po_in_the_name_of: string;
  phone_no: string;
  mobile_no: string;
  email_id: string;
  supplier_address: string;
  contact_person: string;
  fax_no: string;
  contractor_service_provider_name: string;
  grn_no_auto: string;
  from_pr_no: string;
  comparative_statement_no: string;
  company_currency: string;
  import_po: boolean;
  import_currency_exchange_rate: number;
  our_state: string;
  vendor_state: string;
  additional_transportation_gst_applicable: boolean;
  gst_no: string;
  location: string;

  // Active Tab Selection
  activeTab: 'entries' | 'terms' | 'comparative' | 'advance' | 'amendment';

  // Tab 1: Line Items
  items: PoLineItemEntry[];

  // Tab 1: Tabular Form Summary Fields
  tax_on_transportation_principal_amount: number;
  hsn_sac_code_for_tax_on_transportation: string;
  tax_code_for_tax_on_transportation: string;
  tax_code_amount_for_tax_on_transportation: number;
  loading_unloading_charges: number;
  other_charges: number;

  // Tab 2: Terms and Conditions
  terms_and_conditions: string[];

  // Tab 3: Comparative Statements List
  comparative_statements: {
    sr: number;
    statement_no: string;
    statement_date: string;
    quotation_reg_no: string;
    supplier_name: string;
    phone_no: string;
    mobile_no: string;
    credit_term_days: number;
    total_net_amount: number;
    effective_amount_status: string;
  }[];

  // Tab 4: Advance Payment List
  advance_payments: {
    sr: number;
    voucher_no: string;
    voucher_date: string;
    supplier_name: string;
    po_no: string;
    project_name: string;
    advance_payment: number;
    status: string;
  }[];

  // Tab 5: PO Amendments List
  po_amendments: {
    sr: number;
    supplier_name: string;
    project_name: string;
    item_group: string;
    item_desc: string;
    item_brand: string;
    item_remarks: string;
    unit: string;
    approved_qty: number;
    grn_rcvd_qty: number;
    grn_balance: number;
    po_closed_qty: number;
    grn_closing_qty: number;
    status: string;
  }[];

  // Footer Fields
  to_grn: boolean;
  credit_period: number;
  delivery_address: string;
  /** Promised delivery date, YYYY-MM-DD. Drives the Deliveries follow-up tab's urgency badges. */
  delivery_date: string;
  note_on_po: string;
  remarks: string;
  relation_count: number;
  ledger_present: number;
  /**
   * Canonical erp_po_status. This used to be a private form vocabulary
   * ('Draft' | 'Verification' | 'Issued' | ...) that was lower-cased and
   * written straight at the enum, where three of the six labels did not
   * exist — so the save failed and silently discarded the whole form.
   */
  status: PoStatus;
  /** Required by the database for `rejected` and `cancelled`. */
  status_reason?: string;
  id?: string;
  vendor_id?: string;
  /** Resolved from the "From P.R. No." picker; persisted as the PO's requisition link. */
  purchase_requisition_id?: string | null;
}

/**
 * Serialises the form into the payload `save_purchase_order` expects.
 *
 * Exported so the page-level save handler does not have to re-derive line
 * amounts. It previously did, using the pre-discount rate and ignoring the
 * charge fields, which is why the persisted total disagreed with the net
 * amount shown on the form.
 */
export function buildPurchaseOrderPayload(form: FullPoFormState): PurchaseOrderFormPayload {
  const lines: PurchaseOrderFormLine[] = form.items.map((item, index) => ({
    line_number: index + 1,
    item_description: item.item_desc,
    item_code: item.item_code || null,
    item_group: item.item_group || null,
    item_brand: item.item_brand || null,
    item_specification: item.item_specification || null,
    hsn_code: item.hsn_code || null,
    tax_code: item.tax_code || null,
    purchase_category: item.purchase_category || null,
    quantity: Number(item.approved_qty) || 0,
    unit: cleanMaterialUnit(item.unit, item.item_desc),
    unit_rate: Number(item.basic_rate) || 0,
    tax_rate: item.gst_applicable ? Number(item.gst_rate) || 0 : 0,
    estimated_rate: item.estimated_rate ?? null,
    previous_rate: item.previous_rate ?? null,
    discount_pct: Number(item.discount_perc) || 0,
    discount_amount: (Number(item.discount_amt) * Number(item.approved_qty)) || 0,
    freight_charges: Number(item.freight_chgs) || 0,
    loading_unloading_charges: Number(item.load_unload_chgs) || 0,
    other_charges: Number(item.others_chgs) || 0,
    is_gst_applicable: item.gst_applicable,
    is_open_po: item.open_po,
    open_till_date: item.open_till_date || null,
    required_date: item.due_on || null,
    activity_name: item.activity_name || null,
    sub_activity_name: item.sub_activity_name || null,
  }));

  return {
    id: form.id || null,
    project_name: form.project_name || null,
    vendor_id: form.vendor_id || null,
    purchase_requisition_id: form.purchase_requisition_id || null,

    po_number: form.po_number || null,
    // The datetime-local input yields "YYYY-MM-DDTHH:mm"; the column is a date.
    po_date: form.po_date ? form.po_date.slice(0, 10) : null,
    delivery_location: form.project_address || null,
    delivery_address: form.delivery_address || form.project_address || null,
    delivery_date: form.delivery_date || null,
    payment_terms: form.credit_period ? `${form.credit_period} days credit` : null,
    terms_and_conditions: form.terms_and_conditions,

    company_name: form.company_name || null,
    prepared_by: form.prepared_by || null,
    prepared_by_name: form.prepared_by || null,
    po_in_the_name_of: form.po_in_the_name_of || null,
    supplier_name: form.supplier_name || null,
    vendor_name: form.supplier_name || null,
    phone_no: form.phone_no || null,
    mobile_no: form.mobile_no || null,
    email_id: form.email_id || null,
    supplier_address: form.supplier_address || null,
    contact_person: form.contact_person || null,
    gst_no: form.gst_no || null,
    pan_no: form.pan_no || null,
    vat_no: form.vat_no || null,
    cst_no: form.cst_no || null,
    cess_no: form.cess_no || null,
    fax_no: form.fax_no || null,
    our_state: form.our_state || null,
    vendor_state: form.vendor_state || null,
    company_currency: form.company_currency || null,
    is_import_po: form.import_po,
    import_exchange_rate: form.import_po ? form.import_currency_exchange_rate : null,

    comparative_statement_no: form.comparative_statement_no || null,
    credit_period_days: form.credit_period ?? null,
    note_on_po: form.note_on_po || null,
    remarks: form.remarks || null,

    // Header-level charges. These reached the database for the first time
    // with this change; before, the form showed them in the net amount and
    // the save threw them away.
    freight_amount: 0,
    loading_unloading_charges: Number(form.loading_unloading_charges) || 0,
    other_charges: Number(form.other_charges) || 0,
    transportation_taxable_amount: Number(form.tax_on_transportation_principal_amount) || 0,
    transportation_tax_rate: transportationTaxRate(form),
    transportation_hsn_code: form.hsn_sac_code_for_tax_on_transportation || null,
    transportation_tax_code: form.tax_code_for_tax_on_transportation || null,

    is_budget_applicable: form.budget_applicable,
    requires_grn: form.to_grn,

    // Repeating sections that had no columns and were dropped on every
    // save. They now persist as jsonb on the order.
    comparative_statements: form.comparative_statements,
    advance_payments: form.advance_payments,
    amendments: form.po_amendments,

    status: form.status,
    lines,
  };
}

/** Transportation tax as a rate, since the form captures it as an amount. */
function transportationTaxRate(form: FullPoFormState): number {
  const principal = Number(form.tax_on_transportation_principal_amount) || 0;
  const amount = Number(form.tax_code_amount_for_tax_on_transportation) || 0;
  if (principal <= 0 || amount <= 0) return 0;
  return Math.round((amount / principal) * 10000) / 100;
}

/**
 * Button presentation per transition. Keyed by PoStatus so a status added
 * to the state machine without a label here is a compile error rather than
 * a blank button.
 */
const TRANSITION_LABELS: Record<PoStatus, string> = {
  draft: 'Return to Draft',
  review: 'Send For Review',
  pending_verification: 'Send for Verification',
  pending_approval: 'Assign for Approval',
  approved: 'Approve PO',
  rejected: 'Reject PO',
  sent_to_vendor: 'Issue to Vendor',
  acknowledged: 'Record Vendor Acceptance',
  partially_delivered: 'Mark Partially Delivered',
  delivered: 'Mark Delivered',
  short_closed: 'Short Close',
  closed: 'Close Order',
  cancelled: 'Cancel Order',
};

const TRANSITION_HINTS: Record<PoStatus, string> = {
  draft: 'Send the order back for editing. Clears the previous approval.',
  review: 'Submit the draft for peer or manager review.',
  pending_verification: 'Submit the draft for verification.',
  pending_approval: 'Route the verified order to management for sign-off.',
  approved: 'Approve the order. Posts the budget commitment.',
  rejected: 'Reject the order. A reason is required and is recorded.',
  sent_to_vendor: 'Issue the approved order to the supplier.',
  acknowledged: 'Record that the supplier has confirmed the order.',
  partially_delivered: 'Derived from goods receipts; set manually only to correct the record.',
  delivered: 'Derived from goods receipts; set manually only to correct the record.',
  short_closed: 'Abandon the undelivered balance and settle the order.',
  closed: 'Close a settled order. No further activity is possible.',
  cancelled: 'Cancel the order. A reason is required. Not possible once goods have been received.',
};

const TRANSITION_STYLES: Record<PoStatus, string> = {
  draft: 'border border-orange-500/30 bg-orange-500/10 text-orange-600 hover:bg-orange-500/20',
  review: 'bg-purple-600 text-white hover:bg-purple-700',
  pending_verification: 'bg-indigo-600 text-white hover:bg-indigo-700',
  pending_approval: 'bg-blue-600 text-white hover:bg-blue-700',
  approved: 'bg-emerald-600 text-white hover:bg-emerald-700',
  rejected: 'border border-red-500/40 bg-red-500/10 text-red-700 hover:bg-red-500/20 dark:text-red-300',
  sent_to_vendor: 'bg-blue-600 text-white hover:bg-blue-700',
  acknowledged: 'bg-teal-600 text-white hover:bg-teal-700',
  partially_delivered: 'border border-cyan-500/40 bg-cyan-500/10 text-cyan-700 hover:bg-cyan-500/20 dark:text-cyan-300',
  delivered: 'bg-emerald-700 text-white hover:bg-emerald-800',
  short_closed: 'border border-slate-400/50 bg-slate-500/10 text-slate-700 hover:bg-slate-500/20 dark:text-slate-300',
  closed: 'border border-slate-400/50 bg-slate-500/10 text-slate-700 hover:bg-slate-500/20 dark:text-slate-300',
  cancelled: 'border border-rose-500/40 bg-rose-500/10 text-rose-700 hover:bg-rose-500/20 dark:text-rose-300',
};

const TRANSITION_ICONS: Record<PoStatus, React.ReactNode> = {
  draft: <FileCheck className="h-4 w-4" />,
  review: <Send className="h-4 w-4" />,
  pending_verification: <Send className="h-4 w-4" />,
  pending_approval: <Send className="h-4 w-4" />,
  approved: <CheckCircle2 className="h-4 w-4" />,
  rejected: <X className="h-4 w-4" />,
  sent_to_vendor: <Mail className="h-4 w-4" />,
  acknowledged: <Check className="h-4 w-4" />,
  partially_delivered: <Layers className="h-4 w-4" />,
  delivered: <CheckCircle2 className="h-4 w-4" />,
  short_closed: <ShieldCheck className="h-4 w-4" />,
  closed: <ShieldCheck className="h-4 w-4" />,
  cancelled: <Trash2 className="h-4 w-4" />,
};

interface PoFormProps {
  po: PurchaseOrderRow;
  /** Active vendors backing the vendor dropdown. */
  vendorOptions?: VendorOption[];
  /**
   * Persists the order. Resolves true on success; on false the form stays
   * open so the user's edits survive a rejected save.
   */
  onSubmit: (formData: FullPoFormState) => Promise<boolean>;
  /** Generates the report-format Purchase Order PDF and opens it in a new tab. */
  onPrint?: () => void;
  onCancel: () => void;
  /** Whether the signed-in user may approve, reject or issue an order. */
  canApprove?: boolean;
}

export function PoForm({ po, vendorOptions = [], onSubmit, onPrint, onCancel, canApprove = false }: PoFormProps) {
  const { currentUser } = useAppStore();
  const defaultPreparedBy = currentUser?.name || 'Rohan Mehta (Site Eng)';
  const todayStr = new Date().toISOString().slice(0, 10);
  const [submitting, setSubmitting] = useState(false);
  const [promptReasonTarget, setPromptReasonTarget] = useState<PoStatus | null>(null);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showAmendModal, setShowAmendModal] = useState(false);
  const [savingTerms, setSavingTerms] = useState(false);
  const [termsSaveMsg, setTermsSaveMsg] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [projectOptions, setProjectOptions] = useState<ProcurementProjectOption[]>([]);
  const [liveVendors, setLiveVendors] = useState<VendorOption[]>(vendorOptions);
  const [prOptions, setPrOptions] = useState<PrOption[]>([]);
  const [budgetCategories, setBudgetCategories] = useState<BudgetCategoryOption[]>([]);
  const [dbItems, setDbItems] = useState<any[]>([]);
  const [itemGroups, setItemGroups] = useState<string[]>([]);
  const [budgetData, setBudgetData] = useState<{
    activities: string[];
    subActivitiesByCategory: Record<string, string[]>;
  }>({
    activities: [],
    subActivitiesByCategory: {},
  });

  React.useEffect(() => {
    // 1. Fetch items
    supabase
      .from('items')
      .select('id, item_code, item_description, tax_rate, lead_period_days, item_groups:item_group_id(name), units_of_measure:primary_uom_id(code)')
      .eq('is_inactive', false)
      .order('item_description', { ascending: true })
      .then(({ data, error }) => {
        if (!error && data) setDbItems(data);
      });

    // 2. Fetch item groups
    supabase
      .from('item_groups')
      .select('name')
      .eq('is_active', true)
      .order('name')
      .then(({ data, error }) => {
        if (!error && data) setItemGroups(data.map((g: any) => g.name).filter(Boolean));
      });
  }, []);

  React.useEffect(() => {
    const projectId = po?.project_id;
    if (!projectId) return;

    const loadProjectActivities = async () => {
      const DEFAULT_ACTIVITIES = [
        "Site Development/Pre-Construction Work",
        "Civil Work - Substructure",
        "Civil Work - Superstructure",
        "Masonry / Brickwork",
        "Plaster & Finishing",
        "Plumbing & Sanitary",
        "Electrical Work",
        "Flooring & Tiling",
      ];

      const DEFAULT_SUB_ACTIVITIES: Record<string, string[]> = {
        "Site Development/Pre-Construction Work": ["Site Clearance & Levelling", "Excavation", "Temporary Fencing & Gate", "Soil Testing & Survey"],
        "Civil Work - Substructure": ["PCC 1:4:8 Bedding", "RCC Footings", "Plinth Beam Construction", "Anti-Termite Treatment"],
        "Civil Work - Superstructure": ["RCC Columns", "RCC Beam & Slab Casting", "Staircase Casting"],
        "Masonry / Brickwork": ["Brickwork 9 inch", "AAC Block Masonry 6 inch", "Parapet Wall Masonry"],
        "Plaster & Finishing": ["Internal Gypsum Plaster", "External Double Coat Plaster", "Neeru Finish"],
        "Plumbing & Sanitary": ["PVC Drainage Piping", "CPVC Water Supply Lines", "Sanitaryware Installation"],
        "Electrical Work": ["Conduit Laying", "Wiring & DB Installation", "Switchboard & Fixture Fitting"],
        "Flooring & Tiling": ["Vitrified Tile Flooring", "Granite Door Frame Moulding", "Dado Tiling"],
      };

      try {
        const { data: categories } = await supabase
          .from('budget_categories')
          .select('id, category_name')
          .eq('project_id', projectId)
          .order('category_name', { ascending: true });

        const { data: items } = await supabase
          .from('master_budget_items')
          .select('category_name, item_description')
          .eq('project_id', projectId)
          .eq('is_active', true)
          .is('deleted_at', null)
          .order('item_description', { ascending: true });

        const activitiesSet = new Set<string>();
        const subActivitiesByCategory: Record<string, Set<string>> = {};

        if (categories && categories.length > 0) {
          categories.forEach((c) => {
            if (c.category_name?.trim()) {
              const name = c.category_name.trim();
              activitiesSet.add(name);
              if (!subActivitiesByCategory[name]) {
                subActivitiesByCategory[name] = new Set();
              }
            }
          });
        }

        if (items && items.length > 0) {
          items.forEach((item) => {
            const catName = item.category_name?.trim();
            const subName = item.item_description?.trim();
            if (catName) {
              activitiesSet.add(catName);
              if (!subActivitiesByCategory[catName]) {
                subActivitiesByCategory[catName] = new Set();
              }
              if (subName) {
                subActivitiesByCategory[catName].add(subName);
              }
            }
          });
        }

        if (activitiesSet.size === 0) {
          setBudgetData({
            activities: DEFAULT_ACTIVITIES,
            subActivitiesByCategory: DEFAULT_SUB_ACTIVITIES,
          });
          return;
        }

        const activities = Array.from(activitiesSet).sort();
        const subActivities: Record<string, string[]> = {};
        for (const cat of activities) {
          subActivities[cat] = subActivitiesByCategory[cat]
            ? Array.from(subActivitiesByCategory[cat]).sort()
            : [];
        }

        setBudgetData({
          activities,
          subActivitiesByCategory: subActivities,
        });
      } catch (err) {
        console.error("Error loading project budget items:", err);
        setBudgetData({
          activities: DEFAULT_ACTIVITIES,
          subActivitiesByCategory: DEFAULT_SUB_ACTIVITIES,
        });
      }
    };

    loadProjectActivities();
  }, [po?.project_id]);

  React.useEffect(() => {
    let active = true;
    listBudgetCategoryOptions().then((cats) => {
      if (active && cats) {
        setBudgetCategories(cats);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    let active = true;
    listActivePrOptions().then((prs) => {
      if (active && prs) {
        setPrOptions(prs);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    let active = true;
    listProcurementProjects().then((projs) => {
      if (active && projs) {
        setProjectOptions(projs);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    if (vendorOptions.length > 0) {
      setLiveVendors(vendorOptions);
    } else {
      let active = true;
      listActiveVendorOptions().then((opts) => {
        if (active && opts) {
          setLiveVendors(opts);
        }
      });
      return () => {
        active = false;
      };
    }
  }, [vendorOptions]);

  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  /** Set while a reason-requiring transition waits for the user's reason. */
  const [pendingTransition, setPendingTransition] = useState<PoStatus | null>(null);

  const validateForm = (targetForm: FullPoFormState): string[] => {
    const errors: string[] = [];

    // The vendor must be a registry selection, not a typed name: the save
    // path needs a real vendor_id and will no longer guess one.
    if (!targetForm.vendor_id) {
      errors.push('Select a supplier from the dropdown. A typed name is not enough to raise a purchase order.');
    }
    if (!targetForm.supplier_name || !targetForm.supplier_name.trim()) {
      errors.push('Supplier / Vendor Name is required.');
    }
    if (!targetForm.project_name || !targetForm.project_name.trim()) {
      errors.push('Project Name is required. Please select a project from the dropdown.');
    }
    if (!targetForm.items || targetForm.items.length === 0) {
      errors.push('At least 1 Line Item is required in the Purchase Order.');
    } else {
      targetForm.items.forEach((item, index) => {
        if (!item.item_desc || !item.item_desc.trim()) {
          errors.push(`Line Item #${index + 1}: Description is required`);
        }
        if (!Number.isFinite(Number(item.approved_qty)) || Number(item.approved_qty) <= 0) {
          errors.push(`Line Item #${index + 1}: Quantity must be greater than 0`);
        }
        if (Number(item.basic_rate) < 0) {
          errors.push(`Line Item #${index + 1}: Rate cannot be negative`);
        }
        if (Number(item.discount_perc) < 0 || Number(item.discount_perc) > 100) {
          errors.push(`Line Item #${index + 1}: Discount must be between 0 and 100 percent`);
        }
      });
    }

    if (poRequiresReason(targetForm.status) && !targetForm.status_reason?.trim()) {
      errors.push(`A reason is required to mark this purchase order ${poStatusLabel(targetForm.status)}.`);
    }
    return errors;
  };

  /**
   * Applies a workflow transition and saves in one go.
   *
   * `onSubmit` is awaited and its result inspected, so a rejected
   * transition — an illegal move, a missing role, a server error — leaves
   * the form open with the user's work intact. It used to be fire and
   * forget: the workspace closed the form the instant this was called.
   */
  const handleActionWithValidation = async (targetStatus: PoStatus, reason?: string) => {
    const updatedState: FullPoFormState = {
      ...form,
      id: po.id || undefined,
      status: targetStatus,
      status_reason: reason ?? form.status_reason,
    };

    const errors = validateForm(updatedState);
    if (errors.length > 0) {
      setValidationErrors(errors);
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return;
    }

    setValidationErrors([]);
    setForm(updatedState);
    setSubmitting(true);
    try {
      const ok = await onSubmit(updatedState);
      if (ok === false) {
        // The parent surfaces the reason; revert the optimistic status so
        // the buttons match what the database actually holds.
        setForm((prev) => ({ ...prev, status: normalizePoStatus(po.status) ?? 'draft' }));
      }
    } finally {
      setSubmitting(false);
    }
  };

  /** Collects a reason first when the database requires one. */
  const requestTransition = async (next: PoStatus) => {
    if (poRequiresReason(next)) {
      setPendingTransition(next);
      return;
    }
    await handleActionWithValidation(next);
  };

  const [form, setForm] = useState<FullPoFormState>(() => {
    const rawLines = po.purchase_order_lines && po.purchase_order_lines.length > 0
      ? po.purchase_order_lines
      : (po as any).po_lines && (po as any).po_lines.length > 0
      ? (po as any).po_lines
      : [];

    // Line money is re-derived from the stored primitives (quantity, rate,
    // discount, tax_rate) rather than read out of the stored totals.
    //
    // The previous mapper read `l.gst_rate`, a column that does not exist —
    // the real column is `tax_rate` — so every line silently became 18% on
    // reopen, corrupting any 5% or 12% GST line on the next save. It then
    // loaded the stored `line_total` into `amt` and added 18% on top, which
    // compounded tax on every save/reopen cycle because the save path had
    // written `line_total` tax-inclusive.
    const mappedItems: PoLineItemEntry[] = rawLines.map((l: any, lIdx: number) => {
      const qty = Number(l.quantity ?? 0);
      const rate = Number(l.unit_rate ?? 0);
      const discountPct = Number(l.discount_pct ?? 0);
      const discountAmt = discountPct > 0
        ? (rate * discountPct) / 100
        : (qty > 0 ? (Number(l.discount_amount ?? 0) / qty) : 0);
      const gstApplicable = l.is_gst_applicable !== false;
      const gstRate = gstApplicable ? Number(l.tax_rate ?? l.gst_rate ?? l.gst_percent ?? 18) : 0;

      const netRate = Math.max(rate - discountAmt, 0);
      const basicAmt = qty * netRate;
      const taxAmt = (basicAmt * gstRate) / 100;

      const rawActivity = (l.activity_name || l.work_activity || l.activity || '').trim();
      const rawSubActivity = (l.sub_activity_name || l.sub_activity || '').trim();
      const rawGroup = (l.item_group || l.category || l.purchase_category || '').trim();
      const spec = (l.item_specification || l.specification || '').trim();
      const brand = (l.item_brand || l.preferred_brand || '').trim();

      /* Legacy rows written before the RFQ->PO mapping was fixed carry the item
         group in activity_name and the brand in sub_activity_name. Showing the
         wrong axis is worse than showing nothing, so a value that is merely a
         copy of another column is treated as absent. The item_group test is the
         one that matters: that was the actual corruption, and the original
         sanitizer only checked spec and brand. */
      const isActCorrupt = Boolean(
        rawActivity &&
          ((spec && rawActivity === spec) ||
            (brand && rawActivity === brand) ||
            (rawGroup && rawActivity === rawGroup)),
      );
      const isSubActCorrupt = Boolean(
        rawSubActivity &&
          ((spec && rawSubActivity === spec) ||
            (brand && rawSubActivity === brand) ||
            (rawGroup && rawSubActivity === rawGroup)),
      );

      const cleanAct = isActCorrupt ? '' : rawActivity;
      const cleanSubAct = isSubActCorrupt ? '' : rawSubActivity;

      return {
        item_group: rawGroup,
        item_desc: l.item_description || '',
        item_code: l.item_code || (l.item_id ? String(l.item_id) : ''),
        item_brand: brand,
        item_specification: spec,
        activity_name: cleanAct,
        sub_activity_name: cleanSubAct,
        open_po: Boolean(l.is_open_po),
        open_till_date: l.open_till_date || '',
        approved_qty: qty,
        unit: cleanMaterialUnit(l.unit, l.item_description),
        due_on: l.required_date || '',
        purchase_category: l.purchase_category || '',
        estimated_rate: Number(l.estimated_rate ?? rate),
        basic_rate: rate,
        discount_perc: discountPct,
        discount_amt: discountAmt,
        rate: netRate,
        hsn_code: l.hsn_code || '',
        tax_code: l.tax_code || '',
        tax_code_amount: taxAmt,
        previous_rate: Number(l.previous_rate ?? 0),
        amt: basicAmt,
        freight_chgs: Number(l.freight_charges ?? 0),
        load_unload_chgs: Number(l.loading_unloading_charges ?? 0),
        others_chgs: Number(l.other_charges ?? 0),
        gst_applicable: gstApplicable,
        net_amt: basicAmt + taxAmt,
        gst_principal_amount: basicAmt,
        // Outstanding quantity, not the ordered quantity: a part-received
        // line previously showed its full quantity as still to come.
        grn_balance_qty: Math.max(qty - Number(l.received_qty ?? 0), 0),
        gst_rate: gstRate,
      };
    });

    return {
      // 1. Header Fields
      po_number: po.po_number || '',
      po_date: po.po_date || `${todayStr}T00:00`,
      prepared_by: (po as any).prepared_by_name || (po as any).prepared_by || (po as any).profiles?.name || defaultPreparedBy,
      company_name: (po as any).company_name || 'Bhilosa Industries Private Limited',
      pan_no: (po as any).pan_no || 'AAACR5489E',
      vat_no: (po as any).vat_no || '',
      cst_no: (po as any).cst_no || '',
      cess_no: (po as any).cess_no || '',
      // Resolved from the joined projects row.
      project_name: po.projects?.name || (po as any).project_name || 'Silvassa Unit I - Polyester Division',
      budget_applicable: (po as any).budget_applicable !== false,
      project_address: (po as any).project_address || (po as any).delivery_location || po.delivery_location || 'Silvassa Unit I - Polyester Division, UT of DNH & DD',
      site_contact: (po as any).site_contact || (po as any).site_contact_number || '+91 98250 12345',
      supplier_name: po.vendors?.display_name || po.vendors?.legal_name || (po as any).supplier_name || 'Reliance Polyester Raw Materials Ltd',
      po_in_the_name_of: (po as any).po_in_the_name_of || po.vendors?.legal_name || po.vendors?.display_name || 'Reliance Polyester Raw Materials Ltd',
      phone_no: (po as any).phone_no || '+91 98250 12345',
      mobile_no: (po as any).mobile_no || (po as any).contact_number || '+91 98250 12345',
      email_id: (po as any).email_id || (po as any).email || 'supply@reliancepolyester.com',
      supplier_address: (po as any).supplier_address || 'Plot 45, GIDC Industrial Estate, Hazira, Surat, Gujarat - 394510',
      contact_person: (po as any).contact_person || (po as any).site_contact_person || 'Sales Operations Team',
      fax_no: (po as any).fax_no || '',
      contractor_service_provider_name: (po as any).contractor_service_provider_name || '',
      grn_no_auto: 'Auto',
      from_pr_no: (po as any).pr_number || ((po as any).purchase_requisitions?.pr_number) || 'PR-20260817-001',
      comparative_statement_no: (po as any).comparative_statement_no || (po as any).cs_number || '',
      company_currency: (po as any).company_currency || 'INR',
      import_po: Boolean((po as any).import_po),
      import_currency_exchange_rate: Number((po as any).import_currency_exchange_rate || 0),
      our_state: (po as any).our_state || 'UT of DNH & DD',
      vendor_state: (po as any).vendor_state || 'Gujarat',
      additional_transportation_gst_applicable: Boolean((po as any).additional_transportation_gst_applicable),
      gst_no: po.vendors?.gst_number || (po as any).vendor_gstin || (po as any).gst_no || '24AAACR5489E1ZI',
      location: (po as any).location || 'Silvassa',

      // Active Tab
      activeTab: 'entries',

      // Tab 1 Line Items
      items: mappedItems.length > 0 ? mappedItems : [
        {
          id: `item-default-bhilosa-001`,
          resource_type: 'material',
          item_code: 'YARN-DTY-75-36',
          item_group: 'Draw Texturised Yarn',
          item_description: '75/36 Semi Dull Micro DTY Yarn (Grade A Spools)',
          specification: '75 Denier / 36 Filaments Filament Micro Polyester Yarn',
          brand: 'Bhilosa Premium Yarns',
          work_activity: 'Yarn Spinning',
          sub_activity: 'Yarn Texturising',
          unit: 'kg',
          qty: 5000,
          unit_rate: 135,
          discount_pct: 0,
          discount_amt: 0,
          amt: 675000,
          tax_code: 'GST 12%',
          cgst_rate: 6,
          sgst_rate: 6,
          igst_rate: 0,
          cgst_amt: 40500,
          sgst_amt: 40500,
          igst_amt: 0,
          total_tax_amt: 81000,
          tds_code: 'None',
          tds_rate: 0,
          tds_amt: 0,
          hsn_sac: '54023300',
          packing_chgs: 0,
          others_chgs: 0,
          gst_applicable: true,
          net_amt: 756000,
          gst_principal_amount: 675000,
          grn_balance_qty: 5000,
          gst_rate: 12,
        }
      ],

      // Tab 1 Summaries
      tax_on_transportation_principal_amount: Number((po as any).tax_on_transportation_principal_amount || 0),
      hsn_sac_code_for_tax_on_transportation: (po as any).hsn_sac_code_for_tax_on_transportation || '',
      tax_code_for_tax_on_transportation: (po as any).tax_code_for_tax_on_transportation || '',
      tax_code_amount_for_tax_on_transportation: Number((po as any).tax_code_amount_for_tax_on_transportation || 0),
      loading_unloading_charges: Number((po as any).loading_unloading_charges || (po as any).freight_amount || 0),
      other_charges: Number((po as any).other_charges || 0),

      // Tab 2 Terms & Conditions (Always default to 17 Clauses text block if empty)
      terms_and_conditions: po.terms_and_conditions
        ? (typeof po.terms_and_conditions === 'string'
            ? po.terms_and_conditions.split('\n')
            : (Array.isArray(po.terms_and_conditions) ? po.terms_and_conditions : []))
        : [
            'PO Terms 1:-  This is a Contract for Pramukh Group and/or any its affiliates, subsidiaries and/or group companies. Vendor agrees that it shall at all times recognize the validity and ownership of Pramukh and/or any of its affiliates, subsidiaries and/or group companies, as the case may be, over the intellectual property rights and shall not at any time put in issue their validity or ownership.',
            '',
            '1. PRELIMINARY',
            '1.1 This is a Contract for execution of job/Supply as required and specified at the time of Enquiry.',
            '1.2 The Enquirer for the above mentioned supply is the company/ proprietary concern/individual.',
            '1.3 The terms and conditions mentioned hereunder are the terms and conditions of the Contract for the execution of the job mentioned under item 1.1 above.',
            '',
            '2. REFERENCE FOR DOCUMENTATION',
            'Purchase Order number must appear on order confirmation, correspondence, drawings, invoices, shipping notes, packings and on any documents or papers connected with the order.',
            '',
            '3. CONFIRMATION OF ORDER',
            'The Vendor shall acknowledge the receipt of the Purchase Order within ten days following the mailing of this order and shall thereby confirm his acceptance of this Purchase Order in its entirety without exceptions. The acknowledgment will bear on both purchase order and General Procurement Conditions.',
            '',
            '4. WEIGHTS AND MEASUREMENTS',
            'a. All weights and measurements recorded by the Organisation on receipt of goods at site will be treated as final.',
            'b. Vendor\'s shipping documents and invoices must contain the following data:',
            '   i. Unit net weight',
            '   ii. Unit gross weight (packing included)',
            '   iii. Dimensions of packing.',
            '',
            '5. PACKING AND MARKING',
            'The Materials shall be suitably packed for safe transportation till receipt at site and should be commensurate with best possible practices of packing, unless specifically stipulated in the Technical specifications, to avoid any damage during transit.',
            '',
            '6. CONTROL REGULATIONS',
            'The supply, dispatch and delivery of goods shall be arranged by the Vendor in strict conformity with the statutory regulations including provision of Industries (Development and Regulation) Act 1951 and any amendment thereof as applicable from time to time. The Organisation disowns any responsibility for any irregularity or contravention of any of the statutory regulations in manufacture or supply of the stores covered by this order.',
            '',
            '7. RESPECT FOR DELIVERY DATES',
            'Time of delivery as mentioned in the Purchase Order shall be the essence of the contract and no variation shall be permitted except with prior authorization in writing from the Organisation. Goods should be delivered securely packed and in good order and condition at the place and within the time specified in the Purchase Order for their delivery.',
            '',
            '8. DELAYS DUE TO FORCE MAJEURE',
            'A) Any delay in or failure of the performance of either part hereto shall not constitute default hereunder or give rise to any claims for damage, if any, to the extent such delays or failure of performance is caused by occurrences such as Acts of God or an enemy, expropriation or confiscation of facilities by Government authorities, acts of war, rebellion, sabotage or fires, floods, explosions, riots, or strikes. The Contractor shall keep records of the circumstances referred to above and bring these to the notice of the Project-in Charge/Site-in-Charge in writing immediately on such occurrences. The amount of time, if any, lost on any of these counts shall not be counted for the Contract period. Once decision of the Owner arrived at after consultation with the Contractor, shall be final and binding. Such a determined period of time be extended by the Owner to enable the Contractor to complete the job within such extended period of time.',
            'B) If Contractor is prevented or delayed from the performing any of its obligations under this Agreement by Force Majeure, then Contractor shall notify Owner the circumstances constituting the Force Majeure and the obligations performance of which is thereby delayed or prevented, within seven days of the occurrence of the events.',
            '',
            '9. REJECTION, REMOVAL OF REJECTED GOODS AND REPLACEMENT',
            'A) In case the testing and inspection at any stage by Inspectors reveal the equipment, material and workmanship do not comply with specification and requirements, the same shall be removed by the Vendor at their / its own expense and risk within the time allowed by the Organisation.',
            'B) The Vendor will have to proceed with the replacement of that equipment or part of equipment without claiming any extra payment if so required by the Organisation. The time taken for replacement in such event will not be added to the contractual delivery period.',
            '',
            '10. TAXES & DUTIES',
            'A) GST (CGST, SGST, IGST as applicable), Customs Duty and applicable Cess as applicable shall be reimbursed for the materials consigned to Organisation as per limits indicated in the offer against documentary evidence to be furnished by the Supplier. Organisation shall pay only those taxes, duties and levies as indicated by Supplier at the time of bid submission/as agreed subsequently.(prior to opening of priced bids).',
            'B) The Vendor shall comply with all the provisions of the GST Act / Rules / requirements like providing of tax invoices, payment of taxes to the authorities within the due dates, filing of returns within the due dates etc. to enable Pramukh Group to take Input Tax Credit.',
            '',
            '11. JURISDICTION',
            'The Vendor hereby agrees that the Courts situated in location of Organisation address and shall have the jurisdiction to hear and determine all actions and proceedings arising out of this contract.',
            '',
            '12. PAYMENT TERMS',
            'Payment will be released, subject to Tax - Invoice uploaded on GST portal before payment due date.',
            '',
            '13. LATE DELIVERY CLAUSE',
            'Penalty would be charged from 1% - 10% per week OR as per management decision if delivery would be done after due date OR schedule date given by site.',
            '',
            '14. TAX DEDUCTION AT SOURCE TO BE MADE U/S. 194Q FROM THE PURCHASE OF GOODS FROM YOU',
            'As you are aware that w.e.f 1ST July, 2021, the provisions of Section 194Q for withholding of Tax at 0.10% on the value of purchase of goods are applicable. In view of the same, we shall deduct the required TDS at 0.10% from the value of purchase of goods from you. We are the purchasers who satisfies the conditions laid down in Section 194Q and hence we are required to deduct TDS from the value of Purchases from you at the applicable rates. Since we are liable to deduct TDS U/S. 194Q, you being the seller of goods , are not required to make TCS U/S. 206C(1H) at 0.10%. Hence please do not charge any TCS on your purchase Invoice in response to this PO. The rate of Withholding of tax U/S. 194Q shall be subject to the amendments made from time to time.',
            '',
            'NOTE : Moreover, please confirm whether you have filed the Income Tax Returns for A.Y. 2019-2020 and A.Y. 2020-2021 along with the acceptance of this PO with copy of the acknowledgement / screen shot from the Income tax website. In the absence of such confirmation, we shall presume that you have not filed your Income tax returns for the required two years and therefore, the withholding of tax shall be made at higher rate of 5% from the value of purchase of goods from you which shall not be refunded nor adjusted in subsequent billing against this PO or any other PO. If you have already submitted the required details of the Income Tax Returns with us, please ignore this note.',
            '',
            '15. GUARANTEE / WARRANTY',
            'Under RERA act minimum 5 years from the date of possession for material or workmanship.',
            '',
            '16. DELIVERY DATE',
            'As per site Schedule and mentioned in PO.',
            '',
            '17. PRICE BASIS',
            'DAP at Site, Freight included.'
          ],

      // Tab 3 Comparative Statements
      comparative_statements: (po as any).comparative_statements || [],

      // Tab 4 Advance Payment List
      advance_payments: (po as any).advance_payments || [],

      // Tab 5 PO Amendments List
      po_amendments: (po as any).po_amendments || [],

      // Footer Fields
      to_grn: (po as any).to_grn !== false,
      credit_period: Number((po as any).credit_period || (po as any).credit_period_days || 30),
      delivery_address: (po as any).delivery_address || po.delivery_location || (po as any).project_address || '',
      delivery_date: (po as any).delivery_date || '',
      note_on_po: (po as any).note_on_po || '',
      remarks: (po as any).remarks || (po as any).general_remarks || '',
      relation_count: Number((po as any).relation_count || 0),
      ledger_present: Number((po as any).ledger_present || 1),

      // Status.
      //
      // Read through the canonical normaliser instead of the old substring
      // chain, which matched 'verif' / 'issue' / 'approve' / 'fulfill' and
      // therefore resolved pending_approval, sent_to_vendor, acknowledged,
      // rejected, partially_delivered, delivered and closed all to 'Draft'.
      // Saving such a PO wrote status 'draft' back and silently reverted the
      // workflow — including on approved orders that already carried a
      // budget commitment.
      status: normalizePoStatus(po.status) ?? 'draft',
      id: po.id || undefined,
      vendor_id: po.vendor_id || undefined,
      purchase_requisition_id: po.purchase_requisition_id || null,
    };
  });

  const [newTermText, setNewTermText] = useState('');

  const updateHeader = <K extends keyof FullPoFormState>(key: K, value: FullPoFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleLineItemChange = (index: number, field: keyof PoLineItemEntry, value: any) => {
    setForm((prev) => {
      const updated = [...prev.items];
      const current = { ...updated[index], [field]: value };

      const qty = Number(current.approved_qty || 0);
      const rate = Number(current.basic_rate || 0);
      const discPct = Number(current.discount_perc || 0);
      const gstRate = Number(current.gst_rate || 18);

      const discAmt = (rate * discPct) / 100;
      const effectiveRate = rate - discAmt;
      const basicAmt = qty * effectiveRate;
      const taxAmt = (basicAmt * gstRate) / 100;

      current.rate = effectiveRate;
      current.discount_amt = discAmt;
      current.amt = basicAmt;
      current.gst_principal_amount = basicAmt;
      current.tax_code_amount = taxAmt;
      current.net_amt = basicAmt + taxAmt;

      updated[index] = current;
      return { ...prev, items: updated };
    });
  };

  const updateLineItem = handleLineItemChange;

  /**
   * Adds an empty line. This used to insert a fully populated mock row
   * ("RCC Material" / "New Material Item", 10 BAGS at Rs 300, HSN 2523),
   * so an unedited row went to the vendor as a real order line.
   */
  const handleAddLineItem = () => {
    setForm((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          item_group: '',
          item_desc: '',
          item_code: '',
          item_brand: '',
          item_specification: '',
          activity_name: '',
          sub_activity_name: '',
          open_po: false,
          open_till_date: '',
          approved_qty: 0,
          unit: 'nos',
          due_on: '',
          purchase_category: '',
          estimated_rate: 0,
          basic_rate: 0,
          discount_perc: 0,
          discount_amt: 0,
          rate: 0,
          hsn_code: '',
          tax_code: '',
          tax_code_amount: 0,
          previous_rate: 0,
          amt: 0,
          freight_chgs: 0,
          load_unload_chgs: 0,
          others_chgs: 0,
          gst_applicable: true,
          net_amt: 0,
          gst_principal_amount: 0,
          grn_balance_qty: 0,
          gst_rate: 0,
        },
      ],
    }));
  };

  const handleRemoveLineItem = (index: number) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  // Add / Remove Terms
  const handleAddTerm = () => {
    if (!newTermText.trim()) return;
    setForm((prev) => ({
      ...prev,
      terms_and_conditions: [...prev.terms_and_conditions, `${prev.terms_and_conditions.length + 1}. ${newTermText.trim()}`],
    }));
    setNewTermText('');
  };

  const handleRemoveTerm = (index: number) => {
    setForm((prev) => ({
      ...prev,
      terms_and_conditions: prev.terms_and_conditions.filter((_, i) => i !== index),
    }));
  };

  const handleTermChange = (index: number, text: string) => {
    setForm((prev) => {
      const updated = [...prev.terms_and_conditions];
      updated[index] = text;
      return { ...prev, terms_and_conditions: updated };
    });
  };

  // Summary math. This is what the database now derives too — line
  // subtotals net of discount, plus line tax, plus the header charges — so
  // the figure shown here is the figure that is persisted, sent to the
  // vendor and committed against the budget.
  const totalGrossAmount = form.items.reduce((sum, i) => sum + i.amt, 0);
  const totalTaxCodeAmount = form.items.reduce((sum, i) => sum + i.tax_code_amount, 0);
  const totalDiscountAmount = form.items.reduce((sum, i) => sum + i.discount_amt * i.approved_qty, 0);
  const netAmount = totalGrossAmount + totalTaxCodeAmount + form.tax_code_amount_for_tax_on_transportation + form.loading_unloading_charges + form.other_charges;
  const totalAmountInWords = numberToWords(netAmount);

  /**
   * Transitions this user may make from the current status. Derived from
   * the shared state machine, so a button can never offer a move the
   * database will refuse.
   */
  const availableTransitions = availablePoTransitions(form.status, canApprove);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const errors = validateForm(form);
    if (errors.length > 0) {
      setValidationErrors(errors);
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return;
    }

    setValidationErrors([]);
    onSubmit({ ...form, id: po.id });
  };

  return (
    <div className="rounded-xl border border-border bg-card shadow-lg p-6 space-y-6">
      {/* Form Header Title */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <ShoppingBag className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-heading text-lg font-bold text-foreground">
              Production Purchase Order (P.O.) Form
            </h2>
            <p className="text-xs text-muted-foreground font-medium">
              Official ERP Purchase Order Entry &amp; Multi-Tab Commercial Verification
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Validation Errors Alert Banner */}
      {validationErrors.length > 0 && (
        <div className="rounded-xl border border-red-500/50 bg-red-500/10 p-4 space-y-2 text-red-600 dark:text-red-400">
          <div className="flex items-center gap-2 font-bold text-sm">
            <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
            <span>Cannot Save Purchase Order — Please fill in the required fields:</span>
          </div>
          <ul className="list-disc list-inside text-xs space-y-1 pl-2 font-semibold">
            {validationErrors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6 text-xs">

        {/* ========================================================================= */}
        {/* SECTION 1: HEADER FIELDS (Strict Field Order as Requested)                */}
        {/* ========================================================================= */}
        <div className="rounded-xl border border-border/70 bg-muted/30 p-4 space-y-4">
          <h3 className="font-bold uppercase tracking-wider text-muted-foreground border-b border-border/50 pb-2">
            1. Primary Purchase Order Header Parameters
          </h3>

          <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* 1. P.O. No. */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">P.O. No.</label>
              <input
                type="text"
                value={form.po_number}
                onChange={(e) => updateHeader('po_number', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
                required
              />
            </div>

            {/* 2. P.O. Date* */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-primary mb-1">P.O. Date*</label>
              <input
                type="text"
                value={form.po_date}
                onChange={(e) => updateHeader('po_date', e.target.value)}
                className="w-full rounded-lg border-2 border-primary/50 bg-background px-3 py-2 font-semibold text-foreground"
                required
              />
            </div>

            {/* 3. Name of Company* */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-primary mb-1">Name of Company*</label>
              <input
                type="text"
                value={form.company_name}
                onChange={(e) => updateHeader('company_name', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-bold text-foreground"
                required
              />
            </div>

            {/* Prepared By */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-primary mb-1">Prepared By</label>
              <input
                type="text"
                value={form.prepared_by || ''}
                onChange={(e) => updateHeader('prepared_by', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-semibold text-foreground"
                placeholder="Prepared By Name"
              />
            </div>

            {/* 4. PAN No. */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">PAN No.</label>
              <input
                type="text"
                value={form.pan_no}
                onChange={(e) => updateHeader('pan_no', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
              />
            </div>

            {/* 5. VAT No. */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">VAT No.</label>
              <input
                type="text"
                value={form.vat_no}
                onChange={(e) => updateHeader('vat_no', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-medium text-foreground"
              />
            </div>

            {/* 6. CST No. */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">CST No.</label>
              <input
                type="text"
                value={form.cst_no}
                onChange={(e) => updateHeader('cst_no', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-medium text-foreground"
              />
            </div>

            {/* 7. Cess No. */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Cess No.</label>
              <input
                type="text"
                value={form.cess_no}
                onChange={(e) => updateHeader('cess_no', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-medium text-foreground"
              />
            </div>

            {/* 8. Project Name Dropdown */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Project Name</label>
              <select
                value={form.project_name}
                onChange={(e) => {
                  const selectedName = e.target.value;
                  updateHeader('project_name', selectedName);
                  const matchedProj = projectOptions.find((p) => p.name === selectedName);
                  if (matchedProj) {
                    po.project_id = matchedProj.id;
                  }
                }}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer"
                required
              >
                <option value="">-- Select Project --</option>
                {projectOptions.map((p) => (
                  <option key={p.id} value={p.name}>
                    {p.name} {p.code ? `(${p.code})` : ''}
                  </option>
                ))}
                {form.project_name && !projectOptions.some((p) => p.name === form.project_name) && (
                  <option value={form.project_name}>{form.project_name}</option>
                )}
              </select>
            </div>



            {/* 10. Project Address */}
            <div className="sm:col-span-2 lg:col-span-3">
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Project Address</label>
              <input
                type="text"
                value={form.project_address}
                onChange={(e) => updateHeader('project_address', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-medium text-foreground"
                required
              />
            </div>

            {/* 11. Site Contact */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Site Contact</label>
              <input
                type="text"
                value={form.site_contact}
                onChange={(e) => updateHeader('site_contact', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-bold text-foreground"
              />
            </div>

            {/* 12. Supplier Name Dropdown — maps all vendor details dynamically */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Supplier Name</label>
              <select
                value={form.supplier_name}
                onChange={(e) => {
                  const selectedVal = e.target.value;
                  const vendor = liveVendors.find(
                    (v) =>
                      v.id === selectedVal ||
                      (v.display_name || v.legal_name) === selectedVal ||
                      v.legal_name === selectedVal
                  );

                  if (vendor) {
                    const fullName = vendor.display_name || vendor.legal_name;
                    const fullAddr = [vendor.address, vendor.location, vendor.city].filter(Boolean).join(', ');
                    const gstCode = vendor.gst_number ? vendor.gst_number.substring(0, 2) : '';
                    const derivedState = (vendor as any).state ||
                      (gstCode === '24' ? 'Gujarat' :
                       gstCode === '27' ? 'Maharashtra' :
                       gstCode === '07' ? 'Delhi' :
                       gstCode === '29' ? 'Karnataka' :
                       gstCode === '33' ? 'Tamil Nadu' :
                       gstCode === '09' ? 'Uttar Pradesh' :
                       vendor.city || 'Gujarat');

                    setForm((prev) => ({
                      ...prev,
                      supplier_name: fullName,
                      po_in_the_name_of: vendor.legal_name || fullName,
                      gst_no: vendor.gst_number || '',
                      pan_no: vendor.pan_number || '',
                      phone_no: vendor.phone || '',
                      mobile_no: vendor.phone || '',
                      email_id: vendor.email || '',
                      supplier_address: fullAddr || vendor.address || '',
                      location: vendor.location || vendor.city || '',
                      vendor_state: derivedState,
                      vendor_id: vendor.id,
                    }));
                    po.vendor_id = vendor.id;
                  } else {
                    updateHeader('supplier_name', selectedVal);
                  }
                }}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer"
                required
              >
                <option value="">-- Select Supplier / Vendor --</option>
                {liveVendors.map((vendor) => {
                  const vName = vendor.display_name || vendor.legal_name;
                  return (
                    <option key={vendor.id} value={vName}>
                      {vName} {vendor.gst_number ? `(${vendor.gst_number})` : ''}
                    </option>
                  );
                })}
                {form.supplier_name && !liveVendors.some((v) => (v.display_name || v.legal_name) === form.supplier_name) && (
                  <option value={form.supplier_name}>{form.supplier_name}</option>
                )}
              </select>
            </div>

            {/* 13. PO in the name of* */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-primary mb-1">PO in the name of*</label>
              <input
                type="text"
                value={form.po_in_the_name_of}
                onChange={(e) => updateHeader('po_in_the_name_of', e.target.value)}
                className="w-full rounded-lg border-2 border-primary/50 bg-background px-3 py-2 font-extrabold text-foreground"
                required
              />
            </div>

            {/* 14. Phone No. */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Phone No.</label>
              <input
                type="text"
                value={form.phone_no}
                onChange={(e) => updateHeader('phone_no', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-medium text-foreground"
              />
            </div>

            {/* 15. Mobile No. */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Mobile No.</label>
              <input
                type="text"
                value={form.mobile_no}
                onChange={(e) => updateHeader('mobile_no', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-bold text-foreground"
              />
            </div>

            {/* 16. Email ID */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Email ID</label>
              <input
                type="email"
                value={form.email_id}
                onChange={(e) => updateHeader('email_id', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-semibold text-foreground"
              />
            </div>

            {/* 17. Supplier Address */}
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Supplier Address</label>
              <input
                type="text"
                value={form.supplier_address}
                onChange={(e) => updateHeader('supplier_address', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-medium text-foreground"
              />
            </div>

            {/* 18. Contact Person */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Contact Person</label>
              <input
                type="text"
                value={form.contact_person}
                onChange={(e) => updateHeader('contact_person', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-bold text-foreground"
              />
            </div>

            {/* 19. Fax No. */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Fax No.</label>
              <input
                type="text"
                value={form.fax_no}
                onChange={(e) => updateHeader('fax_no', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-medium text-foreground"
              />
            </div>

            {/* 20. Contractor / Service Provider Name */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Contractor / Service Provider Name</label>
              <input
                type="text"
                value={form.contractor_service_provider_name}
                onChange={(e) => updateHeader('contractor_service_provider_name', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-medium text-foreground"
              />
            </div>

            {/* 22. From P.R. No. */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">From P.R. No.</label>
              <div className="relative">
                <input
                  type="text"
                  list="pr-number-options"
                  value={form.from_pr_no}
                  onChange={(e) => {
                    const val = e.target.value;
                    const matchedPr = prOptions.find((p) => p.pr_number === val);
                    const prItems: PoLineItemEntry[] = (matchedPr?.lines && matchedPr.lines.length > 0)
                      ? matchedPr.lines.map((l: any) => {
                          const grp = l.item_group || l.category || '';
                          const act = l.activity_name || l.work_activity || l.activity || '';
                          const subAct = l.sub_activity_name || l.sub_activity || '';
                          const spec = l.specification || l.item_specification || '';
                          const rate = Number(l.estimated_rate || 0);
                          const qty = Number(l.quantity || 0);
                          const itemGst = Number(l.tax_rate ?? l.gst_rate ?? l.gst_percent ?? l.tax_percent ?? 18);
                          const lineAmt = qty * rate;
                          const lineTax = (lineAmt * itemGst) / 100;
                          return {
                            item_group: grp,
                            item_desc: l.item_description || '',
                            item_code: l.item_code || (l.item_id ? String(l.item_id) : ''),
                            item_brand: l.item_brand || l.preferred_brand || '',
                            item_specification: spec,
                            activity_name: act,
                            sub_activity_name: subAct,
                            open_po: false,
                            open_till_date: '',
                            approved_qty: qty,
                            unit: cleanMaterialUnit(l.unit, l.item_description),
                            due_on: l.required_date || '',
                            purchase_category: '',
                            estimated_rate: rate,
                            basic_rate: rate,
                            discount_perc: 0,
                            discount_amt: 0,
                            rate: rate,
                            hsn_code: l.hsn_code || '',
                            tax_code: '',
                            tax_code_amount: lineTax,
                            previous_rate: 0,
                            amt: lineAmt,
                            freight_chgs: 0,
                            load_unload_chgs: 0,
                            others_chgs: 0,
                            gst_applicable: itemGst > 0,
                            net_amt: lineAmt + lineTax,
                            gst_principal_amount: lineAmt,
                            grn_balance_qty: qty,
                            gst_rate: itemGst,
                            total: lineAmt + lineTax,
                            remarks: l.remarks || '',
                          };
                      })
                      : [];

                    setForm((prev) => ({
                      ...prev,
                      from_pr_no: val,
                      purchase_requisition_id: matchedPr?.id ?? null,
                      project_name: matchedPr?.project_name && !prev.project_name
                        ? matchedPr.project_name
                        : prev.project_name,
                      items: prItems.length > 0 ? prItems : prev.items,
                    }));
                  }}
                  placeholder="Select or type PR No."
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <datalist id="pr-number-options">
                  {prOptions.map((pr) => (
                    <option key={pr.id} value={pr.pr_number}>
                      {pr.pr_number} {pr.project_name ? `(${pr.project_name})` : ''}
                    </option>
                  ))}
                </datalist>
              </div>
            </div>

            {/* 23. Comparative Statement No. */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Comparative Statement No.</label>
              <input
                type="text"
                value={form.comparative_statement_no}
                onChange={(e) => updateHeader('comparative_statement_no', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-semibold text-foreground"
              />
            </div>

            {/* 24. Company Currency */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Company Currency</label>
              <input
                type="text"
                value={form.company_currency}
                onChange={(e) => updateHeader('company_currency', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
              />
            </div>

            {/* 27. Our State */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Our State</label>
              <input
                type="text"
                value={form.our_state}
                onChange={(e) => updateHeader('our_state', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-bold text-foreground"
              />
            </div>

            {/* 28. Vendor State */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Vendor State</label>
              <input
                type="text"
                value={form.vendor_state}
                onChange={(e) => updateHeader('vendor_state', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-bold text-foreground"
              />
            </div>

            {/* 30. GST No. */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">GST No.</label>
              <input
                type="text"
                value={form.gst_no}
                onChange={(e) => updateHeader('gst_no', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
              />
            </div>

            {/* 31. Location */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Location</label>
              <input
                type="text"
                value={form.location}
                onChange={(e) => updateHeader('location', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-bold text-foreground"
              />
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* SECTION 2: FIVE TABS NAVIGATION SYSTEM                                     */}
        {/* ========================================================================= */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 border-b border-border pb-2 overflow-x-auto">
            <button
              type="button"
              onClick={() => updateHeader('activeTab', 'entries')}
              className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                form.activeTab === 'entries'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <Layers className="h-4 w-4" /> Purchase Order Entries ({form.items.length})
            </button>

            <button
              type="button"
              onClick={() => updateHeader('activeTab', 'terms')}
              className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                form.activeTab === 'terms'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <FileText className="h-4 w-4" /> Terms and Conditions
            </button>

            <button
              type="button"
              onClick={() => updateHeader('activeTab', 'comparative')}
              className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                form.activeTab === 'comparative'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <FileSpreadsheet className="h-4 w-4" /> Comparative Statements ({form.comparative_statements.length})
            </button>

            <button
              type="button"
              onClick={() => updateHeader('activeTab', 'advance')}
              className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                form.activeTab === 'advance'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <CheckCircle2 className="h-4 w-4" /> Advance Payment ({form.advance_payments.length})
            </button>

            <button
              type="button"
              onClick={() => updateHeader('activeTab', 'amendment')}
              className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                form.activeTab === 'amendment'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <ShieldCheck className="h-4 w-4" /> PO Amendment ({form.po_amendments.length})
            </button>
          </div>

          {/* TAB 1: PURCHASE ORDER ENTRIES (Editable Table) */}
          {form.activeTab === 'entries' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs font-bold uppercase text-muted-foreground">
                  Purchase Order Line Entries ({form.items.length})
                </span>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-bold text-foreground">Open Till Date / Validity:</label>
                    <input
                      type="date"
                      value={form.items[0]?.open_till_date || todayStr}
                      onChange={(e) => {
                        const dateVal = e.target.value;
                        setForm((prev) => ({
                          ...prev,
                          items: prev.items.map((i) => ({ ...i, open_till_date: dateVal })),
                        }));
                      }}
                      className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-bold text-foreground shadow-2xs outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddLineItem}
                    className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-all shadow-xs cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Entry Row
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-border shadow-2xs">
                <table className="group w-full border-collapse text-left text-xs whitespace-normal border border-border/60">
                  <thead className="bg-muted/60 font-heading text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border whitespace-nowrap">
                    <tr>
                      <th className="px-2.5 py-2.5 text-center transition-all duration-300 opacity-0 group-hover:opacity-100 max-w-0 group-hover:max-w-[40px] overflow-hidden whitespace-nowrap border-r border-border/50">Sr</th>
                      <th className="px-2.5 py-2.5 font-bold text-primary min-w-[220px] border-r border-border/50">Item Description</th>
                      <th className="px-2.5 py-2.5 font-bold text-primary min-w-[180px] border-r border-border/50">Item Group</th>
                      <th className="px-2.5 py-2.5 font-bold text-primary min-w-[260px] border-r border-border/50">Activity</th>
                      <th className="px-2.5 py-2.5 font-bold text-primary min-w-[260px] border-r border-border/50">Sub Activity</th>
                      <th className="px-2.5 py-2.5 font-bold text-primary min-w-[280px] border-r border-border/50">Item Spec</th>
                      <th className="px-2.5 py-2.5 text-right min-w-[90px] border-r border-border/50">Approved Qty</th>
                      <th className="px-2.5 py-2.5 font-bold text-primary text-center min-w-[80px] border-r border-border/50">Unit</th>
                      <th className="px-2.5 py-2.5 font-bold text-primary min-w-[110px] border-r border-border/50">Due Date</th>
                      <th className="px-2.5 py-2.5 font-bold text-primary text-right min-w-[100px] border-r border-border/50">Unit Rate (₹)</th>
                      <th className="px-2.5 py-2.5 text-right min-w-[80px] border-r border-border/50">Discount (%)</th>
                      <th className="px-2.5 py-2.5 text-right min-w-[100px] border-r border-border/50">Discount/Unit (₹)</th>
                      <th className="px-2.5 py-2.5 font-bold text-primary text-right min-w-[115px] border-r border-border/50">Rate After Disc (₹)</th>
                      <th className="px-2.5 py-2.5 text-right min-w-[100px] border-r border-border/50">Discount Amt (₹)</th>
                      <th className="px-2.5 py-2.5 min-w-[90px] border-r border-border/50">HSN Code</th>
                      <th className="px-2.5 py-2.5 text-right min-w-[100px] border-r border-border/50">Subtotal (₹)</th>
                      <th className="px-2.5 py-2.5 text-right min-w-[85px] border-r border-border/50">Freight (₹)</th>
                      <th className="px-2.5 py-2.5 text-right min-w-[85px] border-r border-border/50">Handling (₹)</th>
                      <th className="px-2.5 py-2.5 text-right min-w-[85px] border-r border-border/50">Others (₹)</th>
                      <th className="px-2.5 py-2.5 text-right min-w-[80px] border-r border-border/50">GST Rate (%)</th>
                      <th className="px-2.5 py-2.5 text-right min-w-[90px] font-bold text-primary border-r border-border/50">Tol (%)</th>
                      <th className="px-2.5 py-2.5 text-right min-w-[120px]">Total Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {form.items.map((item, index) => (
                      <tr key={index} className="hover:bg-muted/30 transition-colors align-middle font-mono">
                        <td className="px-2.5 py-2 text-center font-bold text-muted-foreground transition-all duration-300 opacity-0 group-hover:opacity-100 max-w-0 group-hover:max-w-[40px] overflow-hidden whitespace-nowrap border-r border-border/40">{index + 1}</td>
                        {/* Item Description + (Brand) */}
                        <td className="px-2.5 py-2 whitespace-normal break-words border-r border-border/40 align-middle" title={item.item_desc}>
                          <div className="flex flex-col gap-1 w-full">
                            <SearchableItemInput
                              value={item.item_desc}
                              items={dbItems}
                              onSelectItem={(selectedItem) => {
                                updateLineItem(index, 'item_code', selectedItem.item_code);
                                updateLineItem(index, 'item_desc', selectedItem.item_description);
                                updateLineItem(index, 'item_group', selectedItem.item_groups?.name || 'General');
                                updateLineItem(index, 'unit', selectedItem.units_of_measure?.code || 'NOS');
                                updateLineItem(index, 'gst_rate', Number(selectedItem.tax_rate ?? 18));
                              }}
                              onChangeSearch={(val) => {
                                const matched = dbItems.find(
                                  (it: any) => (it.item_description || "").toUpperCase() === val.trim().toUpperCase()
                                );
                                if (matched) {
                                  updateLineItem(index, 'item_code', matched.item_code);
                                  updateLineItem(index, 'item_desc', val);
                                  updateLineItem(index, 'item_group', matched.item_groups?.name || 'General');
                                  updateLineItem(index, 'unit', matched.units_of_measure?.code || 'NOS');
                                  updateLineItem(index, 'gst_rate', Number(matched.tax_rate ?? 18));
                                } else {
                                  updateLineItem(index, 'item_desc', val);
                                }
                              }}
                              placeholder="Search description..."
                              className="w-full rounded border border-border bg-background px-1.5 py-1 text-xs font-bold text-foreground focus:border-primary focus:outline-none disabled:opacity-75 whitespace-normal break-words resize-none min-h-[58px]"
                            />
                            {item.item_brand && (
                              <span
                                title={`Brand: ${item.item_brand}`}
                                className="text-[10px] font-semibold text-primary/80 bg-primary/10 px-1 py-0.5 rounded border border-primary/20 whitespace-nowrap self-start"
                              >
                                ({item.item_brand})
                              </span>
                            )}
                          </div>
                        </td>
                        {/* Item Group */}
                        <td className="px-2.5 py-2 whitespace-normal break-words border-r border-border/40 align-middle" title={`Group: ${item.item_group || ''}`}>
                          <SearchableSelect
                            options={itemGroups}
                            value={item.item_group || ''}
                            onChange={(val) => updateLineItem(index, 'item_group', val)}
                            placeholder="Select group..."
                          />
                        </td>
                        {/* Activity */}
                        <td className="px-2.5 py-2 whitespace-normal break-words border-r border-border/40 align-middle" title={`Activity: ${item.activity_name || ''}`}>
                          <SearchableSelect
                            options={budgetData.activities}
                            value={item.activity_name || ''}
                            onChange={(val) => {
                              updateLineItem(index, 'activity_name', val);
                              updateLineItem(index, 'sub_activity_name', '');
                            }}
                            placeholder="Select activity..."
                          />
                        </td>
                        {/* Sub Activity */}
                        <td className="px-2.5 py-2 whitespace-normal break-words border-r border-border/40 align-middle" title={`Sub Activity: ${item.sub_activity_name || ''}`}>
                          <SearchableSelect
                            options={item.activity_name ? budgetData.subActivitiesByCategory[item.activity_name] || [] : []}
                            value={item.sub_activity_name || ''}
                            onChange={(val) => updateLineItem(index, 'sub_activity_name', val)}
                            placeholder="Select sub activity..."
                            disabled={!item.activity_name}
                            disabledPlaceholder="Select activity first"
                          />
                        </td>
                        {/* Item Spec */}
                        <td className="px-2.5 py-2 whitespace-normal break-words border-r border-border/40 align-middle" title={`Spec: ${item.item_specification || ''}`}>
                          <textarea
                            value={item.item_specification || ''}
                            onChange={(e) => updateLineItem(index, 'item_specification', e.target.value)}
                            placeholder="Item Spec"
                            className="w-full rounded border border-border bg-background px-1.5 py-1 text-xs font-semibold text-foreground focus:border-primary focus:outline-none disabled:opacity-75 whitespace-normal break-words resize-none min-h-[58px]"
                            rows={3}
                          />
                        </td>
                        {/* Approved Qty */}
                        <td className="px-2.5 py-2 border-r border-border/40 align-middle" title={`Qty: ${item.approved_qty} ${item.unit}`}>
                          <input
                            type="number"
                            step="0.01"
                            title={`Qty: ${item.approved_qty}`}
                            value={item.approved_qty === 0 ? '' : item.approved_qty}
                            placeholder="0"
                            onChange={(e) => {
                              const clean = e.target.value.replace(/^0+(?=\d)/, '');
                              updateLineItem(index, 'approved_qty', clean === '' ? 0 : Number(clean));
                            }}
                            className="w-14 focus:w-20 hover:w-20 transition-all duration-200 rounded border border-border bg-background px-1.5 py-1 text-right text-xs font-bold text-foreground relative z-10 hover:z-20 focus:z-20"
                          />
                        </td>
                        {/* Unit */}
                        <td className="px-2.5 py-2 border-r border-border/40 align-middle" title={`Unit: ${item.unit}`}>
                          <select
                            value={item.unit}
                            onChange={(e) => updateLineItem(index, 'unit', e.target.value)}
                            className="rounded border border-border bg-background px-1 py-1 text-xs font-bold text-foreground"
                          >
                            <option value="BAGS">BAGS</option>
                            <option value="BAG">BAG</option>
                            <option value="MT">MT</option>
                            <option value="KG">KG</option>
                            <option value="SQFT">SQFT</option>
                            <option value="NOS">NOS</option>
                          </select>
                        </td>
                        {/* Due Date */}
                        <td className="px-2.5 py-2 border-r border-border/40 align-middle" title={`Due Date: ${item.due_on}`}>
                          <input
                            type="date"
                            value={item.due_on}
                            onChange={(e) => updateLineItem(index, 'due_on', e.target.value)}
                            className="rounded border border-border bg-background px-1.5 py-1 text-xs"
                          />
                        </td>
                        {/* Unit Rate (₹) */}
                        <td className="px-2.5 py-2 border-r border-border/40 align-middle" title={`Unit Rate: ₹${item.basic_rate}`}>
                          <input
                            type="number"
                            step="0.01"
                            title={`Unit Rate: ₹${item.basic_rate}`}
                            value={item.basic_rate === 0 ? '' : item.basic_rate}
                            placeholder="0"
                            onChange={(e) => {
                              const clean = e.target.value.replace(/^0+(?=\d)/, '');
                              updateLineItem(index, 'basic_rate', clean === '' ? 0 : Number(clean));
                            }}
                            className="w-20 focus:w-28 hover:w-28 transition-all duration-200 rounded border-2 border-primary/50 bg-background px-1.5 py-1 text-right text-xs font-extrabold text-primary relative z-10 hover:z-20 focus:z-20"
                          />
                        </td>
                        {/* Discount (%) */}
                        <td className="px-2.5 py-2 border-r border-border/40 align-middle" title={`Discount: ${item.discount_perc}%`}>
                          <input
                            type="number"
                            step="0.01"
                            title={`Discount: ${item.discount_perc}%`}
                            value={item.discount_perc === 0 ? '' : item.discount_perc}
                            placeholder="0"
                            onChange={(e) => {
                              const clean = e.target.value.replace(/^0+(?=\d)/, '');
                              updateLineItem(index, 'discount_perc', clean === '' ? 0 : Number(clean));
                            }}
                            className="w-12 focus:w-16 hover:w-16 transition-all duration-200 rounded border border-border bg-background px-1 py-1 text-right text-xs relative z-10 hover:z-20 focus:z-20"
                          />
                        </td>
                        {/* Discount/Unit (₹) */}
                        <td className="px-2.5 py-2 border-r border-border/40 align-middle" title={`Discount/Unit: ₹${(Number(item.discount_amt) || 0).toFixed(2)}`}>
                          <input
                            type="number"
                            step="0.01"
                            value={!item.discount_amt ? '' : (Number(item.discount_amt) || 0).toFixed(2)}
                            placeholder="0"
                            onChange={(e) => {
                              const clean = e.target.value.replace(/^0+(?=\d)/, '');
                              const val = clean === '' ? 0 : Number(clean);
                              const rate = Number(item.basic_rate || 0);
                              if (rate > 0) {
                                const newPct = (val / rate) * 100;
                                updateLineItem(index, 'discount_perc', Number(newPct.toFixed(4)));
                              } else {
                                updateLineItem(index, 'discount_perc', 0);
                              }
                            }}
                            className="w-16 focus:w-20 hover:w-20 transition-all duration-200 rounded border border-border bg-background px-1 py-1 text-right text-xs relative z-10 hover:z-20 focus:z-20 font-bold"
                          />
                        </td>
                        {/* Rate After Disc (Single Unit Amt After Disc) */}
                        <td className="px-2.5 py-2 border-r border-border/40 align-middle text-right font-extrabold text-primary" title={`Single Unit Amt After Disc: ₹${(Number(item.rate) || 0).toFixed(2)}`}>
                          <input
                            type="number"
                            step="0.01"
                            readOnly
                            value={(Number(item.rate) || 0).toFixed(2)}
                            className="w-20 rounded border border-border/80 bg-muted/40 px-1.5 py-1 text-right text-xs font-extrabold text-primary"
                          />
                        </td>
                        {/* Discount Amt (₹) */}
                        <td className="px-2.5 py-2 border-r border-border/40 align-middle" title={`Discount Amt: ₹${((Number(item.discount_amt) || 0) * (Number(item.approved_qty) || 0)).toFixed(2)}`}>
                          <input
                            type="number"
                            step="0.01"
                            value={!item.discount_amt || !item.approved_qty ? '' : ((Number(item.discount_amt) || 0) * (Number(item.approved_qty) || 0)).toFixed(2)}
                            placeholder="0"
                            onChange={(e) => {
                              const clean = e.target.value.replace(/^0+(?=\d)/, '');
                              const val = clean === '' ? 0 : Number(clean);
                              const rate = Number(item.basic_rate || 0);
                              const qty = Number(item.approved_qty || 0);
                              if (rate > 0 && qty > 0) {
                                const unitDiscAmt = val / qty;
                                const newPct = (unitDiscAmt / rate) * 100;
                                updateLineItem(index, 'discount_perc', Number(newPct.toFixed(4)));
                              } else {
                                updateLineItem(index, 'discount_perc', 0);
                              }
                            }}
                            className="w-16 focus:w-20 hover:w-20 transition-all duration-200 rounded border border-border bg-background px-1 py-1 text-right text-xs relative z-10 hover:z-20 focus:z-20 font-bold text-foreground"
                          />
                        </td>
                        {/* HSN Code */}
                        <td className="px-2.5 py-2 border-r border-border/40 align-middle" title={`HSN Code: ${item.hsn_code}`}>
                          <input
                            type="text"
                            title={`HSN Code: ${item.hsn_code}`}
                            value={item.hsn_code}
                            onChange={(e) => updateLineItem(index, 'hsn_code', e.target.value)}
                            className="w-16 focus:w-24 hover:w-24 transition-all duration-200 rounded border border-border bg-background px-1.5 py-1 text-xs relative z-10 hover:z-20 focus:z-20"
                          />
                        </td>
                        {/* Subtotal (₹) */}
                        <td className="px-2.5 py-2 text-right font-bold text-foreground text-xs border-r border-border/40 align-middle" title={`Subtotal: ₹${item.amt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}>
                          ₹{item.amt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        {/* Freight (₹) */}
                        <td className="px-2.5 py-2 text-right border-r border-border/40 align-middle" title={`Freight: ₹${item.freight_chgs}`}>
                          <input
                            type="number"
                            step="0.01"
                            title={`Freight: ₹${item.freight_chgs}`}
                            value={item.freight_chgs === 0 ? '' : item.freight_chgs}
                            placeholder="0"
                            onChange={(e) => {
                              const clean = e.target.value.replace(/^0+(?=\d)/, '');
                              updateLineItem(index, 'freight_chgs', clean === '' ? 0 : Number(clean));
                            }}
                            className="w-14 focus:w-20 hover:w-20 transition-all duration-200 rounded border border-border bg-background px-1 py-1 text-right text-xs relative z-10 hover:z-20 focus:z-20"
                          />
                        </td>
                        {/* Handling (₹) */}
                        <td className="px-2.5 py-2 text-right border-r border-border/40 align-middle" title={`Handling: ₹${item.load_unload_chgs}`}>
                          <input
                            type="number"
                            step="0.01"
                            title={`Handling: ₹${item.load_unload_chgs}`}
                            value={item.load_unload_chgs === 0 ? '' : item.load_unload_chgs}
                            placeholder="0"
                            onChange={(e) => {
                              const clean = e.target.value.replace(/^0+(?=\d)/, '');
                              updateLineItem(index, 'load_unload_chgs', clean === '' ? 0 : Number(clean));
                            }}
                            className="w-14 focus:w-20 hover:w-20 transition-all duration-200 rounded border border-border bg-background px-1 py-1 text-right text-xs relative z-10 hover:z-20 focus:z-20"
                          />
                        </td>
                        {/* Others (₹) */}
                        <td className="px-2.5 py-2 text-right border-r border-border/40 align-middle" title={`Others: ₹${item.others_chgs}`}>
                          <input
                            type="number"
                            step="0.01"
                            title={`Others: ₹${item.others_chgs}`}
                            value={item.others_chgs === 0 ? '' : item.others_chgs}
                            placeholder="0"
                            onChange={(e) => {
                              const clean = e.target.value.replace(/^0+(?=\d)/, '');
                              updateLineItem(index, 'others_chgs', clean === '' ? 0 : Number(clean));
                            }}
                            className="w-14 focus:w-20 hover:w-20 transition-all duration-200 rounded border border-border bg-background px-1 py-1 text-right text-xs relative z-10 hover:z-20 focus:z-20"
                          />
                        </td>
                        {/* GST Rate (%) */}
                        <td className="px-2.5 py-2 text-right font-bold border-r border-border/40 align-middle" title={`GST Rate: ${item.gst_rate}%`}>
                          <input
                            type="number"
                            title={`GST Rate: ${item.gst_rate}%`}
                            value={item.gst_rate === 0 ? '' : item.gst_rate}
                            placeholder="0"
                            onChange={(e) => {
                              const clean = e.target.value.replace(/^0+(?=\d)/, '');
                              updateLineItem(index, 'gst_rate', clean === '' ? 0 : Number(clean));
                            }}
                            className="w-12 focus:w-16 hover:w-16 transition-all duration-200 rounded border border-border bg-background px-1 py-1 text-right text-xs font-bold relative z-10 hover:z-20 focus:z-20"
                          />
                        </td>
                        {/* Over-Delivery Tolerance (%) */}
                        <td className="px-2.5 py-2 text-right font-bold border-r border-border/40 align-middle" title={`Tolerance: ${item.over_tolerance_pct ?? 5}%`}>
                          <input
                            type="number"
                            step="0.5"
                            min="0"
                            max="100"
                            title={`Tolerance: ${item.over_tolerance_pct ?? 5}%`}
                            value={item.over_tolerance_pct ?? 5}
                            onChange={(e) => updateLineItem(index, 'over_tolerance_pct', Math.max(0, Number(e.target.value) || 0))}
                            className="w-14 focus:w-20 hover:w-20 transition-all duration-200 rounded border border-primary/40 bg-background px-1 py-1 text-right text-xs font-bold text-primary relative z-10 hover:z-20 focus:z-20"
                          />
                        </td>
                        {/* Total Amount (₹) */}
                        <td className="px-2.5 py-2 text-right font-extrabold text-foreground text-xs border-r border-border/40 align-middle" title={`Line Total: ₹${item.net_amt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}>
                          ₹{item.net_amt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Tabular Form Field Summary (Exact Specified Fields) */}
              <div className="rounded-xl border border-border p-4 bg-muted/20 space-y-4">
                <h4 className="font-bold uppercase tracking-wider text-muted-foreground border-b border-border pb-2">
                  Purchase Entries Commercial Summary &amp; Transportation Tax Fields
                </h4>

                <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
                  {/* Total Gross Amount */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Total Gross Amount</label>
                    <input
                      type="text"
                      value={`₹${totalGrossAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                      readOnly
                      className="w-full rounded-lg border border-border bg-muted/60 px-3 py-2 font-mono font-extrabold text-foreground cursor-not-allowed"
                    />
                  </div>

                  {/* Total Tax Code Amount */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Total Tax Code Amount</label>
                    <input
                      type="text"
                      value={`₹${totalTaxCodeAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                      readOnly
                      className="w-full rounded-lg border border-border bg-muted/60 px-3 py-2 font-mono font-extrabold text-foreground cursor-not-allowed"
                    />
                  </div>

                  {/* Tax On Transportation Principal Amount* */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-primary mb-1">
                      Tax On Transportation Principal Amount*
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={form.tax_on_transportation_principal_amount === 0 ? '' : form.tax_on_transportation_principal_amount}
                      placeholder="0"
                      onChange={(e) => {
                        const clean = e.target.value.replace(/^0+(?=\d)/, '');
                        updateHeader('tax_on_transportation_principal_amount', clean === '' ? 0 : Number(clean));
                      }}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
                    />
                  </div>

                  {/* HSN/SAC Code for Tax On Transportation* */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-primary mb-1">
                      HSN/SAC Code for Tax On Transportation*
                    </label>
                    <input
                      type="text"
                      value={form.hsn_sac_code_for_tax_on_transportation}
                      onChange={(e) => updateHeader('hsn_sac_code_for_tax_on_transportation', e.target.value)}
                      placeholder="e.g. 996511"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
                    />
                  </div>

                  {/* Tax Code Amount for Tax On Transportation */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">
                      Tax Code Amount for Tax On Transportation
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={form.tax_code_amount_for_tax_on_transportation === 0 ? '' : form.tax_code_amount_for_tax_on_transportation}
                      placeholder="0"
                      onChange={(e) => {
                        const clean = e.target.value.replace(/^0+(?=\d)/, '');
                        updateHeader('tax_code_amount_for_tax_on_transportation', clean === '' ? 0 : Number(clean));
                      }}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
                    />
                  </div>

                  {/* Net Amount */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Net Amount</label>
                    <input
                      type="text"
                      value={`₹${netAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                      readOnly
                      className="w-full rounded-lg border border-border bg-muted/60 px-3 py-2 font-mono font-extrabold text-foreground cursor-not-allowed"
                    />
                  </div>

                  {/* Total Amount */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-primary mb-1">Total Amount</label>
                    <input
                      type="text"
                      value={`₹${netAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                      readOnly
                      className="w-full rounded-lg border-2 border-primary/50 bg-background px-3 py-2 font-mono font-extrabold text-primary text-base cursor-not-allowed"
                    />
                  </div>

                  {/* Total Discount Amount */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Total Discount Amount</label>
                    <input
                      type="text"
                      value={`₹${totalDiscountAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                      readOnly
                      className="w-full rounded-lg border border-border bg-muted/60 px-3 py-2 font-mono font-bold text-foreground cursor-not-allowed"
                    />
                  </div>

                  {/* Loading/Unloading Charges */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Loading/Unloading Charges</label>
                    <input
                      type="number"
                      step="0.01"
                      value={form.loading_unloading_charges}
                      onChange={(e) => updateHeader('loading_unloading_charges', Number(e.target.value))}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
                    />
                  </div>

                  {/* Other Charges */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Other Charges</label>
                    <input
                      type="number"
                      step="0.01"
                      value={form.other_charges}
                      onChange={(e) => updateHeader('other_charges', Number(e.target.value))}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
                    />
                  </div>

                  {/* Total Amount in Words */}
                  <div className="sm:col-span-2 lg:col-span-4">
                    <label className="block text-[11px] font-bold uppercase text-primary mb-1">Total Amount in Words</label>
                    <input
                      type="text"
                      value={totalAmountInWords}
                      readOnly
                      className="w-full rounded-lg border-2 border-emerald-500/40 bg-emerald-500/10 px-3 py-2 font-extrabold text-emerald-900 dark:text-emerald-200 text-sm"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: TERMS AND CONDITIONS (Copy/Paste Formatted Multiline Field with Save Button) */}
          {form.activeTab === 'terms' && (
            <div className="rounded-xl border border-border p-4 bg-card space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
                <div>
                  <h4 className="font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    Terms and Conditions Master Field
                  </h4>
                  <p className="text-[11px] font-semibold text-muted-foreground mt-0.5">
                    Paste or edit complete terms &amp; conditions with formatting and numbering
                  </p>
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    if (!po.id) return;
                    try {
                      setSavingTerms(true);
                      const textToSave = Array.isArray(form.terms_and_conditions)
                        ? form.terms_and_conditions.join('\n')
                        : (form.terms_and_conditions || '');
                      const res = await updatePurchaseOrderTermsAndConditions(po.id, textToSave);
                      if (res.error) throw res.error;
                      setTermsSaveMsg('Terms & Conditions saved successfully!');
                      setTimeout(() => setTermsSaveMsg(null), 3500);
                    } catch (err: any) {
                      setTermsSaveMsg(`Error: ${err?.message || 'Failed to save terms'}`);
                    } finally {
                      setSavingTerms(false);
                    }
                  }}
                  disabled={savingTerms}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-all shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {savingTerms ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-3.5 w-3.5" /> Save Terms &amp; Conditions
                    </>
                  )}
                </button>
              </div>

              {termsSaveMsg && (
                <div className={`rounded-lg border px-3.5 py-2 text-xs font-bold ${termsSaveMsg.startsWith('Error') ? 'border-red-500/30 bg-red-500/10 text-red-600' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'}`}>
                  {termsSaveMsg}
                </div>
              )}

              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase text-foreground">
                  Complete Terms &amp; Conditions (Spacing &amp; Formatting Preserved)
                </label>
                <textarea
                  rows={18}
                  value={Array.isArray(form.terms_and_conditions) ? form.terms_and_conditions.join('\n') : (form.terms_and_conditions || '')}
                  onChange={(e) => {
                    const linesVal = e.target.value.split('\n');
                    setForm((prev) => ({ ...prev, terms_and_conditions: linesVal }));
                  }}
                  placeholder="Copy and paste entire Terms & Conditions text block here..."
                  className="w-full rounded-xl border border-border bg-background p-4 font-mono text-xs font-medium text-foreground focus:border-primary focus:outline-none shadow-inner leading-relaxed"
                />
              </div>
            </div>
          )}

          {/* TAB 3: COMPARATIVE STATEMENTS (Fully Editable Table) */}
          {form.activeTab === 'comparative' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase text-muted-foreground">
                  Comparative Statements ({form.comparative_statements.length})
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setForm((prev) => ({
                      ...prev,
                      comparative_statements: [
                        ...prev.comparative_statements,
                        {
                          sr: prev.comparative_statements.length + 1,
                          statement_no: `CS-${new Date().getFullYear()}-00${prev.comparative_statements.length + 1}`,
                          statement_date: new Date().toISOString().slice(0, 10),
                          quotation_reg_no: `QT-${new Date().getFullYear()}-00${prev.comparative_statements.length + 1}`,
                          supplier_name: form.supplier_name || 'New Supplier',
                          phone_no: '',
                          mobile_no: form.mobile_no || '',
                          credit_term_days: 45,
                          total_net_amount: 0,
                          effective_amount_status: 'Under Review',
                        },
                      ],
                    }));
                  }}
                  className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/20 transition-all cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Comparative Row
                </button>
              </div>

              <div className="overflow-x-auto rounded-xl border border-border shadow-2xs">
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="bg-muted/60 font-heading text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border">
                    <tr>
                      <th className="px-3 py-3 text-center">Sr</th>
                      <th className="px-3 py-3">CS No.</th>
                      <th className="px-3 py-3">CS Date</th>
                      <th className="px-3 py-3">Quotation Reg. No.</th>
                      <th className="px-3 py-3">Supplier Name</th>
                      <th className="px-3 py-3">Phone No.</th>
                      <th className="px-3 py-3">Mobile No.</th>
                      <th className="px-3 py-3 text-center">Credit Term (Days)</th>
                      <th className="px-3 py-3 text-right">Total Net Amount (₹)</th>
                      <th className="px-3 py-3">Effective Status</th>
                      <th className="px-3 py-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {form.comparative_statements.map((cs, idx) => (
                      <tr key={idx} className="hover:bg-muted/30 transition-colors align-middle">
                        <td className="px-3 py-2 text-center font-bold text-muted-foreground">{idx + 1}</td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={cs.statement_no}
                            onChange={(e) => {
                              const val = e.target.value;
                              setForm((prev) => {
                                const list = [...prev.comparative_statements];
                                list[idx].statement_no = val;
                                return { ...prev, comparative_statements: list };
                              });
                            }}
                            className="w-32 rounded border border-border bg-background px-2 py-1 text-xs font-bold text-primary"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="date"
                            value={cs.statement_date}
                            onChange={(e) => {
                              const val = e.target.value;
                              setForm((prev) => {
                                const list = [...prev.comparative_statements];
                                list[idx].statement_date = val;
                                return { ...prev, comparative_statements: list };
                              });
                            }}
                            className="rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={cs.quotation_reg_no}
                            onChange={(e) => {
                              const val = e.target.value;
                              setForm((prev) => {
                                const list = [...prev.comparative_statements];
                                list[idx].quotation_reg_no = val;
                                return { ...prev, comparative_statements: list };
                              });
                            }}
                            className="w-28 rounded border border-border bg-background px-2 py-1 text-xs font-semibold"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={cs.supplier_name}
                            onChange={(e) => {
                              const val = e.target.value;
                              setForm((prev) => {
                                const list = [...prev.comparative_statements];
                                list[idx].supplier_name = val;
                                return { ...prev, comparative_statements: list };
                              });
                            }}
                            className="w-40 rounded border border-border bg-background px-2 py-1 text-xs font-bold"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={cs.phone_no || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              setForm((prev) => {
                                const list = [...prev.comparative_statements];
                                list[idx].phone_no = val;
                                return { ...prev, comparative_statements: list };
                              });
                            }}
                            className="w-28 rounded border border-border bg-background px-2 py-1 text-xs"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={cs.mobile_no}
                            onChange={(e) => {
                              const val = e.target.value;
                              setForm((prev) => {
                                const list = [...prev.comparative_statements];
                                list[idx].mobile_no = val;
                                return { ...prev, comparative_statements: list };
                              });
                            }}
                            className="w-28 rounded border border-border bg-background px-2 py-1 text-xs"
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <input
                            type="number"
                            value={cs.credit_term_days}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setForm((prev) => {
                                const list = [...prev.comparative_statements];
                                list[idx].credit_term_days = val;
                                return { ...prev, comparative_statements: list };
                              });
                            }}
                            className="w-16 rounded border border-border bg-background px-2 py-1 text-xs text-center font-bold"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            step="0.01"
                            value={cs.total_net_amount}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setForm((prev) => {
                                const list = [...prev.comparative_statements];
                                list[idx].total_net_amount = val;
                                return { ...prev, comparative_statements: list };
                              });
                            }}
                            className="w-28 rounded border border-border bg-background px-2 py-1 text-xs text-right font-extrabold"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={cs.effective_amount_status}
                            onChange={(e) => {
                              const val = e.target.value;
                              setForm((prev) => {
                                const list = [...prev.comparative_statements];
                                list[idx].effective_amount_status = val;
                                return { ...prev, comparative_statements: list };
                              });
                            }}
                            className="w-28 rounded border border-border bg-background px-2 py-1 text-xs font-bold text-emerald-600"
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              setForm((prev) => ({
                                ...prev,
                                comparative_statements: prev.comparative_statements.filter((_, i) => i !== idx),
                              }));
                            }}
                            className="p-1.5 text-muted-foreground hover:text-red-600 transition-colors cursor-pointer"
                            title="Remove row"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: ADVANCE PAYMENT (Fully Editable Table) */}
          {form.activeTab === 'advance' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase text-muted-foreground">
                  Advance Payments ({form.advance_payments.length})
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setForm((prev) => ({
                      ...prev,
                      advance_payments: [
                        ...prev.advance_payments,
                        {
                          sr: prev.advance_payments.length + 1,
                          voucher_no: `VCH-${new Date().getFullYear()}-00${prev.advance_payments.length + 1}`,
                          voucher_date: new Date().toISOString().slice(0, 10),
                          supplier_name: form.supplier_name || 'New Supplier',
                          po_no: form.po_number || 'PO-2026-001',
                          project_name: form.project_name || 'Pramukh Orbit 3',
                          advance_payment: 0,
                          status: 'Pending Approval',
                        },
                      ],
                    }));
                  }}
                  className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/20 transition-all cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Advance Payment Row
                </button>
              </div>

              <div className="overflow-x-auto rounded-xl border border-border shadow-2xs">
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="bg-muted/60 font-heading text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border">
                    <tr>
                      <th className="px-3 py-3 text-center">Sr</th>
                      <th className="px-3 py-3">Voucher No.</th>
                      <th className="px-3 py-3">Voucher Date</th>
                      <th className="px-3 py-3">Supplier Name</th>
                      <th className="px-3 py-3">P.O. No.</th>
                      <th className="px-3 py-3">Project Name</th>
                      <th className="px-3 py-3 text-right">Advance Amount (₹)</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-3 py-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {form.advance_payments.map((adv, idx) => (
                      <tr key={idx} className="hover:bg-muted/30 transition-colors align-middle">
                        <td className="px-3 py-2 text-center font-bold text-muted-foreground">{idx + 1}</td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={adv.voucher_no}
                            onChange={(e) => {
                              const val = e.target.value;
                              setForm((prev) => {
                                const list = [...prev.advance_payments];
                                list[idx].voucher_no = val;
                                return { ...prev, advance_payments: list };
                              });
                            }}
                            className="w-32 rounded border border-border bg-background px-2 py-1 text-xs font-bold text-primary"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="date"
                            value={adv.voucher_date}
                            onChange={(e) => {
                              const val = e.target.value;
                              setForm((prev) => {
                                const list = [...prev.advance_payments];
                                list[idx].voucher_date = val;
                                return { ...prev, advance_payments: list };
                              });
                            }}
                            className="rounded border border-border bg-background px-2 py-1 text-xs"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={adv.supplier_name}
                            onChange={(e) => {
                              const val = e.target.value;
                              setForm((prev) => {
                                const list = [...prev.advance_payments];
                                list[idx].supplier_name = val;
                                return { ...prev, advance_payments: list };
                              });
                            }}
                            className="w-40 rounded border border-border bg-background px-2 py-1 text-xs font-bold"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={adv.po_no}
                            onChange={(e) => {
                              const val = e.target.value;
                              setForm((prev) => {
                                const list = [...prev.advance_payments];
                                list[idx].po_no = val;
                                return { ...prev, advance_payments: list };
                              });
                            }}
                            className="w-32 rounded border border-border bg-background px-2 py-1 text-xs font-semibold"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={adv.project_name}
                            onChange={(e) => {
                              const val = e.target.value;
                              setForm((prev) => {
                                const list = [...prev.advance_payments];
                                list[idx].project_name = val;
                                return { ...prev, advance_payments: list };
                              });
                            }}
                            className="w-36 rounded border border-border bg-background px-2 py-1 text-xs font-medium cursor-pointer"
                          >
                            <option value="">-- Select --</option>
                            {projectOptions.map((p) => (
                              <option key={p.id} value={p.name}>
                                {p.name}
                              </option>
                            ))}
                            {adv.project_name && !projectOptions.some((p) => p.name === adv.project_name) && (
                              <option value={adv.project_name}>{adv.project_name}</option>
                            )}
                          </select>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            step="0.01"
                            value={adv.advance_payment}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setForm((prev) => {
                                const list = [...prev.advance_payments];
                                list[idx].advance_payment = val;
                                return { ...prev, advance_payments: list };
                              });
                            }}
                            className="w-28 rounded border border-border bg-background px-2 py-1 text-xs text-right font-extrabold"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={adv.status}
                            onChange={(e) => {
                              const val = e.target.value;
                              setForm((prev) => {
                                const list = [...prev.advance_payments];
                                list[idx].status = val;
                                return { ...prev, advance_payments: list };
                              });
                            }}
                            className="w-28 rounded border border-border bg-background px-2 py-1 text-xs font-bold"
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              setForm((prev) => ({
                                ...prev,
                                advance_payments: prev.advance_payments.filter((_, i) => i !== idx),
                              }));
                            }}
                            className="p-1.5 text-muted-foreground hover:text-red-600 transition-colors cursor-pointer"
                            title="Remove row"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 5: PO AMENDMENT (Fully Editable Table) */}
          {form.activeTab === 'amendment' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase text-muted-foreground">
                  PO Amendments ({form.po_amendments.length})
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setForm((prev) => ({
                      ...prev,
                      po_amendments: [
                        ...prev.po_amendments,
                        {
                          sr: prev.po_amendments.length + 1,
                          supplier_name: form.supplier_name || 'Supplier Name',
                          project_name: form.project_name || 'Project Name',
                          item_group: 'RCC Material',
                          item_desc: 'New Amendment Material Item',
                          item_brand: 'Standard',
                          item_remarks: 'Site Amendment',
                          unit: 'BAG',
                          approved_qty: 10,
                          grn_rcvd_qty: 0,
                          grn_balance: 10,
                          po_closed_qty: 0,
                          grn_closing_qty: 10,
                          status: 'Draft Amendment',
                        },
                      ],
                    }));
                  }}
                  className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/20 transition-all cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Amendment Row
                </button>
              </div>

              <div className="overflow-x-auto rounded-xl border border-border shadow-2xs">
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="bg-muted/60 font-heading text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border">
                    <tr>
                      <th className="px-3 py-3 text-center">Sr</th>
                      <th className="px-3 py-3">Supplier Name</th>
                      <th className="px-3 py-3">Project Name</th>
                      <th className="px-3 py-3">Item Group</th>
                      <th className="px-3 py-3 min-w-[150px]">Item Desc</th>
                      <th className="px-3 py-3">Item Brand</th>
                      <th className="px-3 py-3">Remarks</th>
                      <th className="px-3 py-3 text-center">Unit</th>
                      <th className="px-3 py-3 text-right">Appr Qty</th>
                      <th className="px-3 py-3 text-right">GRN Rcvd</th>
                      <th className="px-3 py-3 text-right">GRN Closing</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-3 py-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {form.po_amendments.map((am, idx) => (
                      <tr key={idx} className="hover:bg-muted/30 transition-colors align-middle">
                        <td className="px-3 py-2 text-center font-bold text-muted-foreground">{idx + 1}</td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={am.supplier_name}
                            onChange={(e) => {
                              const val = e.target.value;
                              setForm((prev) => {
                                const list = [...prev.po_amendments];
                                list[idx].supplier_name = val;
                                return { ...prev, po_amendments: list };
                              });
                            }}
                            className="w-32 rounded border border-border bg-background px-2 py-1 text-xs font-bold"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={am.project_name}
                            onChange={(e) => {
                              const val = e.target.value;
                              setForm((prev) => {
                                const list = [...prev.po_amendments];
                                list[idx].project_name = val;
                                return { ...prev, po_amendments: list };
                              });
                            }}
                            className="w-36 rounded border border-border bg-background px-2 py-1 text-xs font-medium cursor-pointer"
                          >
                            <option value="">-- Select --</option>
                            {projectOptions.map((p) => (
                              <option key={p.id} value={p.name}>
                                {p.name}
                              </option>
                            ))}
                            {am.project_name && !projectOptions.some((p) => p.name === am.project_name) && (
                              <option value={am.project_name}>{am.project_name}</option>
                            )}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={am.item_group}
                            onChange={(e) => {
                              const val = e.target.value;
                              setForm((prev) => {
                                const list = [...prev.po_amendments];
                                list[idx].item_group = val;
                                return { ...prev, po_amendments: list };
                              });
                            }}
                            className="w-28 rounded border border-border bg-background px-2 py-1 text-xs"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={am.item_desc}
                            onChange={(e) => {
                              const val = e.target.value;
                              setForm((prev) => {
                                const list = [...prev.po_amendments];
                                list[idx].item_desc = val;
                                return { ...prev, po_amendments: list };
                              });
                            }}
                            className="w-44 rounded border border-border bg-background px-2 py-1 text-xs font-bold"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={am.item_brand}
                            onChange={(e) => {
                              const val = e.target.value;
                              setForm((prev) => {
                                const list = [...prev.po_amendments];
                                list[idx].item_brand = val;
                                return { ...prev, po_amendments: list };
                              });
                            }}
                            className="w-24 rounded border border-border bg-background px-2 py-1 text-xs"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={am.item_remarks}
                            onChange={(e) => {
                              const val = e.target.value;
                              setForm((prev) => {
                                const list = [...prev.po_amendments];
                                list[idx].item_remarks = val;
                                return { ...prev, po_amendments: list };
                              });
                            }}
                            className="w-28 rounded border border-border bg-background px-2 py-1 text-xs"
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <input
                            type="text"
                            value={am.unit}
                            onChange={(e) => {
                              const val = e.target.value;
                              setForm((prev) => {
                                const list = [...prev.po_amendments];
                                list[idx].unit = val;
                                return { ...prev, po_amendments: list };
                              });
                            }}
                            className="w-16 rounded border border-border bg-background px-2 py-1 text-xs text-center font-bold"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            value={am.approved_qty}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setForm((prev) => {
                                const list = [...prev.po_amendments];
                                list[idx].approved_qty = val;
                                return { ...prev, po_amendments: list };
                              });
                            }}
                            className="w-16 rounded border border-border bg-background px-2 py-1 text-xs text-right font-extrabold"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            value={am.grn_rcvd_qty}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setForm((prev) => {
                                const list = [...prev.po_amendments];
                                list[idx].grn_rcvd_qty = val;
                                return { ...prev, po_amendments: list };
                              });
                            }}
                            className="w-16 rounded border border-border bg-background px-2 py-1 text-xs text-right font-bold text-emerald-600"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            value={am.grn_closing_qty}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setForm((prev) => {
                                const list = [...prev.po_amendments];
                                list[idx].grn_closing_qty = val;
                                return { ...prev, po_amendments: list };
                              });
                            }}
                            className="w-16 rounded border border-border bg-background px-2 py-1 text-xs text-right font-bold"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={am.status}
                            onChange={(e) => {
                              const val = e.target.value;
                              setForm((prev) => {
                                const list = [...prev.po_amendments];
                                list[idx].status = val;
                                return { ...prev, po_amendments: list };
                              });
                            }}
                            className="w-28 rounded border border-border bg-background px-2 py-1 text-xs font-bold text-primary"
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              setForm((prev) => ({
                                ...prev,
                                po_amendments: prev.po_amendments.filter((_, i) => i !== idx),
                              }));
                            }}
                            className="p-1.5 text-muted-foreground hover:text-red-600 transition-colors cursor-pointer"
                            title="Remove row"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* SECTION 3: FOOTER FORM TABULAR FIELDS (After all tab details end)          */}
        {/* ========================================================================= */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-4">
          <h3 className="font-bold uppercase tracking-wider text-muted-foreground border-b border-border pb-2">
            3. Final Order Processing &amp; Site Logistics Parameters
          </h3>

          <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* Credit Period */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Credit Period (In Days)</label>
              <input
                type="number"
                value={form.credit_period}
                onChange={(e) => updateHeader('credit_period', Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
              />
            </div>

            {/* Promised Delivery Date — drives the Deliveries tab's overdue/due-soon badges */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Promised Delivery Date</label>
              <input
                type="date"
                value={form.delivery_date}
                onChange={(e) => updateHeader('delivery_date', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
              />
            </div>

            {/* Delivery Address* */}
            <div className="sm:col-span-2 lg:col-span-4">
              <label className="block text-[11px] font-bold uppercase text-primary mb-1">Delivery Address*</label>
              <textarea
                rows={2}
                value={form.delivery_address}
                onChange={(e) => updateHeader('delivery_address', e.target.value)}
                className="w-full rounded-lg border-2 border-primary/50 bg-background p-2.5 font-medium text-foreground"
                required
              />
            </div>

            {/* Note On PO */}
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Note On PO</label>
              <input
                type="text"
                value={form.note_on_po}
                onChange={(e) => updateHeader('note_on_po', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-semibold text-foreground"
              />
            </div>

            {/* Remarks */}
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Remarks</label>
              <input
                type="text"
                value={form.remarks}
                onChange={(e) => updateHeader('remarks', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-medium text-foreground"
              />
            </div>

            {/* Relation Count */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Relation Count</label>
              <input
                type="number"
                step="0.01"
                value={form.relation_count}
                onChange={(e) => updateHeader('relation_count', Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
              />
            </div>

            {/* Ledger Present */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Ledger Present</label>
              <input
                type="number"
                step="0.01"
                value={form.ledger_present}
                onChange={(e) => updateHeader('ledger_present', Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
              />
            </div>

            {/* Status.

                Read-only. This was a free dropdown over a private
                vocabulary, so any user could move a draft with no approval
                and no receipt straight to "Fulfilled". The status is now
                whatever the database holds, and it changes only through the
                guarded transitions in the action bar below. */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-primary mb-1">PO Status</label>
              <div className="w-full rounded-lg border-2 border-primary bg-muted/40 px-3 py-2 font-extrabold text-foreground">
                {poStatusLabel(form.status)}
              </div>
            </div>
          </div>
        </div>

        {/* Form Action Buttons (Status-Driven Dynamic Visibility & Real-time Supabase Persistence) */}
        <div className="flex flex-wrap items-center justify-between border-t border-border pt-4 gap-4">
          <div className="flex items-center gap-4">
            {/* PRINT BUTTON */}
            <button
              type="button"
              onClick={() => onPrint ? onPrint() : printPurchaseOrderReport(form)}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 shadow-xs transition-all cursor-pointer"
            >
              <Printer className="h-4 w-4" /> Print PO PDF
            </button>

            <div className="text-xs font-bold text-muted-foreground">
              Total PO Net Amount: <span className="font-mono text-sm text-primary font-extrabold">₹{netAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Close / Cancel Button */}
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-border bg-background px-4 py-2 text-xs font-bold text-muted-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              Close
            </button>

            {/* DRAFT / AUTO DRAFT ACTIONS */}
            {((normalizePoStatus(form.status) ?? 'draft') === 'draft') && (
              <>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void handleActionWithValidation('draft')}
                  className="inline-flex items-center gap-2 rounded-lg bg-secondary px-4 py-2 text-xs font-bold text-secondary-foreground hover:bg-secondary/80 transition-all cursor-pointer disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck className="h-4 w-4" />}
                  Save Draft
                </button>

                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void handleActionWithValidation('pending_verification')}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 shadow-md transition-all cursor-pointer disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Send For verification
                </button>

                {canApprove && (
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => void handleActionWithValidation('approved')}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 shadow-md transition-all cursor-pointer disabled:opacity-50"
                  >
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Approve
                  </button>
                )}
              </>
            )}

            {/* REVIEW ACTIONS */}
            {normalizePoStatus(form.status) === 'review' && (
              <>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void handleActionWithValidation('draft')}
                  className="inline-flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs font-bold text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowLeft className="h-4 w-4" />}
                  Back to Draft
                </button>

                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void handleActionWithValidation('pending_verification')}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 shadow-md transition-all cursor-pointer disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Send For verification
                </button>

                {canApprove && (
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => void handleActionWithValidation('approved')}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 shadow-md transition-all cursor-pointer disabled:opacity-50"
                  >
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Approve
                  </button>
                )}
              </>
            )}

            {/* PENDING FOR VERIFICATION ACTIONS */}
            {normalizePoStatus(form.status) === 'pending_verification' && (
              <>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void handleActionWithValidation('draft')}
                  className="inline-flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs font-bold text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowLeft className="h-4 w-4" />}
                  Back to verification
                </button>

                {canApprove && (
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => void handleActionWithValidation('approved')}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 shadow-md transition-all cursor-pointer disabled:opacity-50"
                  >
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Approve
                  </button>
                )}
              </>
            )}

            {/* PENDING FOR APPROVAL ACTIONS */}
            {normalizePoStatus(form.status) === 'pending_approval' && (
              <>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void handleActionWithValidation('draft')}
                  className="inline-flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs font-bold text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowLeft className="h-4 w-4" />}
                  Back to Draft
                </button>

                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void handleActionWithValidation('pending_verification')}
                  className="inline-flex items-center gap-2 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-4 py-2 text-xs font-bold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowLeft className="h-4 w-4" />}
                  Back to verification
                </button>

                {canApprove && (
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => void handleActionWithValidation('approved')}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 shadow-md transition-all cursor-pointer disabled:opacity-50"
                  >
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Approve
                  </button>
                )}
              </>
            )}

            {/* APPROVED & POST-APPROVAL ACTIONS */}
            {normalizePoStatus(form.status) === 'approved' && (
              <button
                type="button"
                disabled={submitting}
                onClick={() => void handleActionWithValidation('approved')}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 shadow-md transition-all cursor-pointer disabled:opacity-50"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                Reapprove
              </button>
            )}

            {/* POST-APPROVAL ACTIONS: SHORT CLOSE & AMEND PO */}
            {(normalizePoStatus(form.status) === 'approved' ||
              normalizePoStatus(form.status) === 'sent_to_vendor' ||
              normalizePoStatus(form.status) === 'acknowledged' ||
              normalizePoStatus(form.status) === 'partially_delivered') && (
              <>
                <button
                  type="button"
                  onClick={() => setShowAmendModal(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border-2 border-primary bg-primary/10 px-3.5 py-2 text-xs font-extrabold text-primary hover:bg-primary/20 transition-all cursor-pointer shadow-2xs"
                >
                  <FileCheck className="h-4 w-4 text-primary" /> Amend PO / Revisions
                </button>

                <button
                  type="button"
                  onClick={() => setShowCloseModal(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/50 bg-amber-500/10 px-3.5 py-2 text-xs font-extrabold text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 transition-all cursor-pointer shadow-2xs"
                >
                  <XCircle className="h-4 w-4 text-amber-500" /> Close PO (Short-Close)
                </button>
              </>
            )}

            {/* OTHER / CUSTOM STATUS ACTIONS */}
            {normalizePoStatus(form.status) !== 'draft' &&
             normalizePoStatus(form.status) !== 'review' &&
             normalizePoStatus(form.status) !== 'pending_verification' &&
             normalizePoStatus(form.status) !== 'pending_approval' &&
             normalizePoStatus(form.status) !== 'approved' && (
              <button
                type="button"
                disabled={submitting}
                onClick={() => void handleActionWithValidation(normalizePoStatus(form.status) || 'draft')}
                className="inline-flex items-center gap-2 rounded-lg bg-secondary px-4 py-2 text-xs font-bold text-secondary-foreground hover:bg-secondary/80 transition-all cursor-pointer disabled:opacity-50"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck className="h-4 w-4" />}
                Save {poStatusLabel(form.status)}
              </button>
            )}
          </div>
        </div>

        {/* Reason Prompt Dialog for Rejecting */}
        {promptReasonTarget && (
          <div className="mt-4 rounded-xl border-2 border-red-400/60 bg-red-50 p-4 dark:bg-red-950/30">
            <label className="block text-[11px] font-bold uppercase text-red-800 dark:text-red-300 mb-1">
              Reason for Rejecting Purchase Order (Required)
            </label>
            <textarea
              rows={2}
              autoFocus
              value={form.status_reason ?? ''}
              onChange={(e) => updateHeader('status_reason', e.target.value)}
              placeholder="Enter rejection reason for audit history..."
              className="w-full rounded-lg border border-red-400/60 bg-background p-2.5 text-xs font-medium text-foreground"
            />
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                disabled={submitting || !form.status_reason?.trim()}
                onClick={() => {
                  const target = promptReasonTarget;
                  setPromptReasonTarget(null);
                  void handleActionWithValidation(target, form.status_reason);
                }}
                className="rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50 cursor-pointer"
              >
                Confirm Rejection
              </button>
              <button
                type="button"
                onClick={() => setPromptReasonTarget(null)}
                className="rounded-lg border border-border bg-background px-4 py-2 text-xs font-bold text-muted-foreground hover:bg-muted cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </form>
      {/* Short-Close PO Modal */}
      {showCloseModal && (
        <PoCloseModal
          poId={po.id}
          poNumber={form.po_number || po.po_number || ''}
          items={form.items.map((item) => {
            const ordered = Number(item.approved_qty) || 0;
            const bal = Number(item.grn_balance_qty ?? item.approved_qty) || 0;
            const rcvd = Math.max(0, ordered - bal);
            return {
              item_code: item.item_code,
              item_desc: item.item_desc,
              unit: item.unit,
              ordered_qty: ordered,
              received_qty: rcvd,
              balance_qty: Math.max(0, ordered - rcvd),
              item_group: item.item_group,
              activity_name: item.activity_name,
            };
          })}
          onSuccess={(newStatus) => {
            setShowCloseModal(false);
            setForm((prev) => ({ ...prev, status: (normalizePoStatus(newStatus) || 'short_closed') as PoStatus }));
            onSubmit(form);
          }}
          onClose={() => setShowCloseModal(false)}
        />
      )}

      {/* Amend PO Studio Modal */}
      {showAmendModal && (
        <PoAmendModal
          poId={po.id}
          poNumber={form.po_number || po.po_number || ''}
          currentRevision={(po as any)?.revision_number || 0}
          isAmendmentPending={Boolean((po as any)?.is_amendment_pending)}
          lines={form.items.map((i, idx) => ({
            id: (i as any).id || `line-${idx}`,
            item_description: i.item_desc,
            unit_rate: i.basic_rate || i.rate,
            quantity: i.approved_qty,
            unit: i.unit,
          }))}
          onSuccess={() => {
            setShowAmendModal(false);
            onSubmit(form);
          }}
          onClose={() => setShowAmendModal(false)}
        />
      )}
    </div>
  );
}