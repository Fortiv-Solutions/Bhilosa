'use client';

// ============================================================================
// RECORD SERVICE BILL (contractor RA bill = Payment Certificate)
// Raises a bill against an issued/active Work Order.
// ============================================================================

import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  X,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Trash2,
  Layers,
  GitBranch,
  Search,
  Check,
  ChevronDown,
} from 'lucide-react';
import {
  createServiceBill,
  listBillableVendors,
  type BillableVendorOption,
  type CreateServiceBillLineInput,
} from '@/lib/service-bills';
import {
  getWorkOrderLineBillingPosition,
} from '@/lib/measurement-sheets';
import {
  getBillableWorkOrders,
  listBudgetHeads,
  listMasterBudgetLines,
  type BudgetHeadOption,
  type MasterBudgetLineOption,
} from '@/lib/work-orders';
import {
  getServiceBillDefaults,
  type ServiceBillDefaults,
} from '@/lib/wo-commercial-terms';
import { useAppStore } from '@/store/use-app-store';
import { formatIndianCurrency } from '@/utils/format-currency';

export type CreateServiceBillModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

type BillableWorkOrder = {
  id: string;
  work_order_number: string;
  scope_of_work: string;
  total_amount: number;
  billed_to_date: number;
  claimed_to_date: number;
  remaining_balance: number;
  tax_inclusive: boolean;
  vendor_id: string | null;
  contractor_id: string | null;
  activity_id: string | null;
  master_budget_item_id: string | null;
  site_agencies?: { agency_name: string } | null;
};

type DraftLine = {
  key: string;
  workOrderLineId?: string;
  billableItemId?: string;
  description: string;
  percentCompleted: number; // % of Work Completed (0 - 100%)
  quantity: number;
  unit: string;
  rate: number;
  contractedRate: number;
  taxRate: number;
};

function newLine(): DraftLine {
  return {
    key: Math.random().toString(36).slice(2),
    description: '',
    percentCompleted: 100,
    quantity: 1,
    unit: '',
    rate: 0,
    contractedRate: 0,
    taxRate: 18,
  };
}

function lineValue(line: DraftLine): number {
  const qty = line.quantity && line.quantity > 0 ? line.quantity : 1;
  const baseVal = qty * (line.rate || 0);
  const pct = line.percentCompleted !== undefined && line.percentCompleted !== null ? line.percentCompleted : 100;
  return baseVal * (pct / 100);
}

/* ─── Typo-Tolerant & Partial Text Fuzzy Matching Helper ───────────────── */
function fuzzyMatch(text: string, query: string): boolean {
  if (!query) return true;
  const normText = text.toLowerCase().trim();
  const normQuery = query.toLowerCase().trim();

  if (normText.includes(normQuery)) return true;

  const queryTokens = normQuery.split(/\s+/).filter(Boolean);
  const textTokens = normText.split(/\s+/).filter(Boolean);
  const allTokensMatch = queryTokens.every((qt) =>
    textTokens.some((tt) => tt.includes(qt) || LevenshteinDistance(tt, qt) <= 1),
  );
  if (allTokensMatch) return true;

  let qIdx = 0;
  for (let i = 0; i < normText.length && qIdx < normQuery.length; i++) {
    if (normText[i] === normQuery[qIdx]) qIdx++;
  }
  return qIdx === normQuery.length;
}

function LevenshteinDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 99;
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1,
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

/* ─── Searchable Combobox: Activity (Budget Head) ───────────────────────── */
function BudgetHeadCombobox({
  budgetHeads,
  value,
  onChange,
}: {
  budgetHeads: BudgetHeadOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = budgetHeads.find((b) => b.id === value);
  const [displayQuery, setDisplayQuery] = useState(
    selected?.allocationName || selected?.categoryName || '',
  );
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sel = budgetHeads.find((b) => b.id === value);
    setDisplayQuery(sel ? sel.allocationName || sel.categoryName || '' : '');
  }, [value, budgetHeads]);

  const filtered = useMemo(() => {
    if (
      !displayQuery.trim() ||
      (selected &&
        (selected.allocationName === displayQuery ||
          selected.categoryName === displayQuery))
    ) {
      return budgetHeads;
    }
    return budgetHeads.filter((b) => {
      const name = b.allocationName || b.categoryName || '';
      return fuzzyMatch(name, displayQuery);
    });
  }, [budgetHeads, displayQuery, selected]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        const sel = budgetHeads.find((b) => b.id === value);
        setDisplayQuery(sel ? sel.allocationName || sel.categoryName || '' : '');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [value, budgetHeads]);

  return (
    <div className="space-y-1 relative" ref={ref}>
      <label className="text-xs font-semibold text-muted-foreground">
        Activity (Budget Head)
      </label>
      <div
        className={`flex items-center justify-between gap-2 px-3 py-2 text-xs bg-background border rounded-xl transition-all ${
          open
            ? 'border-primary ring-2 ring-primary/20 shadow-md'
            : 'border-input hover:border-muted-foreground/40'
        }`}
      >
        <Layers className="w-4 h-4 text-primary shrink-0" />
        <input
          type="text"
          value={displayQuery}
          onChange={(e) => {
            setDisplayQuery(e.target.value);
            setOpen(true);
            if (!e.target.value.trim()) onChange('');
          }}
          onFocus={() => setOpen(true)}
          placeholder="Type to search activity budget heads…"
          className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground font-medium outline-none"
        />
        {displayQuery && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange('');
              setDisplayQuery('');
            }}
            className="p-0.5 hover:bg-muted rounded-full text-muted-foreground"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        <ChevronDown
          onClick={() => setOpen(!open)}
          className={`w-3.5 h-3.5 text-muted-foreground cursor-pointer transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </div>

      {open && (
        <div className="absolute z-50 left-0 min-w-full w-max max-w-[90vw] sm:max-w-xl mt-1.5 bg-popover border border-border rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[280px] animate-in fade-in-50 zoom-in-95 duration-100">
          <div className="overflow-y-auto flex-1 divide-y divide-border/30">
            <button
              type="button"
              onClick={() => {
                onChange('');
                setDisplayQuery('');
                setOpen(false);
              }}
              className={`w-full px-3.5 py-2.5 text-left text-xs hover:bg-primary/10 hover:text-primary transition-colors flex items-center justify-between ${
                !value ? 'bg-primary/10 font-bold text-primary' : 'text-muted-foreground'
              }`}
            >
              <span>All Activities (Unset)</span>
              {!value && <Check className="w-4 h-4 text-primary shrink-0" />}
            </button>

            {filtered.length === 0 && (
              <div className="p-4 text-center text-xs text-muted-foreground">
                No matching activities for &ldquo;{displayQuery}&rdquo;
              </div>
            )}

            {filtered.map((b) => {
              const isSelected = value === b.id;
              const name = b.allocationName || b.categoryName || '';
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => {
                    onChange(b.id);
                    setDisplayQuery(name);
                    setOpen(false);
                  }}
                  className={`w-full px-3.5 py-2.5 text-left text-xs hover:bg-primary/10 hover:text-primary transition-colors flex items-start justify-between gap-3 border-b border-border/30 last:border-0 ${
                    isSelected ? 'bg-primary/10 text-primary font-bold' : 'text-foreground'
                  }`}
                >
                  <span className="whitespace-normal break-words leading-snug flex-1 font-medium">
                    {name}
                  </span>
                  <div className="flex items-center gap-2 shrink-0 pt-0.5">
                    {b.availableAmount !== undefined && (
                      <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-900/40">
                        ₹{b.availableAmount.toLocaleString()}
                      </span>
                    )}
                    {isSelected && <Check className="w-4 h-4 text-primary shrink-0" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Searchable Combobox: Sub-Activity (Budget Head Sub-Category) ────────── */
function SubActivityCombobox({
  masterLines,
  selectedHead,
  value,
  onChange,
}: {
  masterLines: MasterBudgetLineOption[];
  selectedHead?: BudgetHeadOption;
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = masterLines.find((m) => m.id === value);
  const [displayQuery, setDisplayQuery] = useState(selected?.description || '');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sel = masterLines.find((m) => m.id === value);
    setDisplayQuery(sel?.description || '');
  }, [value, masterLines]);

  const filteredByHead = useMemo(() => {
    if (!selectedHead) return masterLines;
    return masterLines.filter((m) => {
      if (selectedHead.categoryId && m.categoryId) {
        return m.categoryId === selectedHead.categoryId;
      }
      if (selectedHead.categoryName && m.categoryName) {
        return (
          m.categoryName.toLowerCase() === selectedHead.categoryName.toLowerCase()
        );
      }
      if (selectedHead.allocationName && m.categoryName) {
        return (
          m.categoryName.toLowerCase() ===
          selectedHead.allocationName.toLowerCase()
        );
      }
      return true;
    });
  }, [masterLines, selectedHead]);

  const filtered = useMemo(() => {
    if (!displayQuery.trim() || (selected && selected.description === displayQuery)) {
      return filteredByHead;
    }
    return filteredByHead.filter((m) => {
      const desc = `${m.srNo ? `[${m.srNo}] ` : ''}${m.description || ''}`;
      return fuzzyMatch(desc, displayQuery);
    });
  }, [filteredByHead, displayQuery, selected]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        const sel = masterLines.find((m) => m.id === value);
        setDisplayQuery(sel?.description || '');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [value, masterLines]);

  return (
    <div className="space-y-1 relative" ref={ref}>
      <label className="text-xs font-semibold text-muted-foreground">Sub-Activity</label>
      <div
        className={`flex items-center justify-between gap-2 px-3 py-2 text-xs bg-background border rounded-xl transition-all ${
          open
            ? 'border-primary ring-2 ring-primary/20 shadow-md'
            : 'border-input hover:border-muted-foreground/40'
        }`}
      >
        <GitBranch className="w-4 h-4 text-primary shrink-0" />
        <input
          type="text"
          value={displayQuery}
          onChange={(e) => {
            setDisplayQuery(e.target.value);
            setOpen(true);
            if (!e.target.value.trim()) onChange('');
          }}
          onFocus={() => setOpen(true)}
          placeholder={
            selectedHead ? 'Type to search sub-activities…' : 'Select Activity first…'
          }
          className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground font-medium outline-none"
        />
        {displayQuery && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange('');
              setDisplayQuery('');
            }}
            className="p-0.5 hover:bg-muted rounded-full text-muted-foreground"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        <ChevronDown
          onClick={() => setOpen(!open)}
          className={`w-3.5 h-3.5 text-muted-foreground cursor-pointer transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </div>

      {open && (
        <div className="absolute z-50 left-0 min-w-full w-max max-w-[90vw] sm:max-w-xl mt-1.5 bg-popover border border-border rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[280px] animate-in fade-in-50 zoom-in-95 duration-100">
          <div className="overflow-y-auto flex-1 divide-y divide-border/30">
            <button
              type="button"
              onClick={() => {
                onChange('');
                setDisplayQuery('');
                setOpen(false);
              }}
              className={`w-full px-3.5 py-2.5 text-left text-xs hover:bg-primary/10 hover:text-primary transition-colors flex items-center justify-between ${
                !value ? 'bg-primary/10 font-bold text-primary' : 'text-muted-foreground'
              }`}
            >
              <span>None (Unset)</span>
              {!value && <Check className="w-4 h-4 text-primary shrink-0" />}
            </button>

            {filtered.length === 0 && (
              <div className="p-4 text-center text-xs text-muted-foreground">
                {selectedHead
                  ? `No matching sub-activities under "${selectedHead.allocationName || selectedHead.categoryName}"`
                  : `No sub-activities match "${displayQuery}"`}
              </div>
            )}

            {filtered.map((m) => {
              const isSelected = value === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    onChange(m.id);
                    setDisplayQuery(m.description);
                    setOpen(false);
                  }}
                  className={`w-full px-3.5 py-2.5 text-left text-xs hover:bg-primary/10 hover:text-primary transition-colors flex items-start justify-between gap-3 border-b border-border/30 last:border-0 ${
                    isSelected ? 'bg-primary/10 text-primary font-bold' : 'text-foreground'
                  }`}
                >
                  <div className="whitespace-normal break-words leading-snug flex-1 font-medium">
                    {m.srNo && (
                      <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1 py-0.5 rounded border border-border mr-1.5 inline-block">
                        [{m.srNo}]
                      </span>
                    )}
                    <span>{m.description}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 pt-0.5">
                    {m.budgetedCost > 0 && (
                      <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded border border-border">
                        ₹{m.budgetedCost.toLocaleString()}
                      </span>
                    )}
                    {isSelected && <Check className="w-4 h-4 text-primary shrink-0" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function CreateServiceBillModal({
  isOpen,
  onClose,
  onSuccess,
}: CreateServiceBillModalProps) {
  const { activeProjectId, projects } = useAppStore();
  const projectId = activeProjectId || projects[0]?.id;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [workOrders, setWorkOrders] = useState<BillableWorkOrder[]>([]);
  const [vendors, setVendors] = useState<BillableVendorOption[]>([]);
  const [budgetHeads, setBudgetHeads] = useState<BudgetHeadOption[]>([]);
  const [masterLines, setMasterLines] = useState<MasterBudgetLineOption[]>([]);

  const [budgetAllocationId, setBudgetAllocationId] = useState('');
  const [masterBudgetItemId, setMasterBudgetItemId] = useState('');
  const [defaults, setDefaults] = useState<ServiceBillDefaults | null>(null);

  const [vendorId, setVendorId] = useState('');
  const [workOrderId, setWorkOrderId] = useState('');
  const [serviceDescription, setServiceDescription] = useState('');
  const [billNumber, setBillNumber] = useState('');
  const [billDate, setBillDate] = useState(new Date().toISOString().split('T')[0]);
  const [supplierBillNo, setSupplierBillNo] = useState('');

  const [lines, setLines] = useState<DraftLine[]>([newLine()]);

  const [retentionPercent, setRetentionPercent] = useState(0);
  const [advanceAdjusted, setAdvanceAdjusted] = useState(0);
  const [otherDeductions, setOtherDeductions] = useState(0);
  const [debitAmount, setDebitAmount] = useState(0);
  const [debitReason, setDebitReason] = useState('');
  const [tdsPercent, setTdsPercent] = useState(0);
  const [isInterstate, setIsInterstate] = useState(false);

  const resetForm = useCallback(() => {
    setVendorId('');
    setWorkOrderId('');
    setServiceDescription('');
    setBillNumber('');
    setBillDate(new Date().toISOString().split('T')[0]);
    setSupplierBillNo('');
    setLines([newLine()]);
    setRetentionPercent(0);
    setAdvanceAdjusted(0);
    setOtherDeductions(0);
    setDebitAmount(0);
    setDebitReason('');
    setTdsPercent(0);
    setIsInterstate(false);
    setBudgetAllocationId('');
    setMasterBudgetItemId('');
    setError(null);
  }, []);

  useEffect(() => {
    if (!isOpen || !projectId) return;
    resetForm();
    getBillableWorkOrders(projectId)
      .then((rows) => setWorkOrders((rows || []) as unknown as BillableWorkOrder[]))
      .catch(() => setWorkOrders([]));
    listBillableVendors()
      .then(setVendors)
      .catch(() => setVendors([]));
    listBudgetHeads(projectId)
      .then(setBudgetHeads)
      .catch(() => setBudgetHeads([]));
    listMasterBudgetLines(projectId)
      .then(setMasterLines)
      .catch(() => setMasterLines([]));
  }, [isOpen, projectId, resetForm]);

  // Requirement 1: If contractor/vendor is selected first, show ONLY connected Work Orders
  const filteredWorkOrders = useMemo(() => {
    if (!vendorId) return workOrders;
    return workOrders.filter((wo) => {
      const woVendor = wo.contractor_id || wo.vendor_id;
      return woVendor === vendorId;
    });
  }, [workOrders, vendorId]);

  const selectedWorkOrder = useMemo(
    () => workOrders.find((wo) => wo.id === workOrderId) || null,
    [workOrders, workOrderId],
  );

  // When a Work Order is selected:
  // 1. Auto-select connected contractor/vendor
  // 2. Auto-fetch Activity & Sub-Activity from connected Work Order
  useEffect(() => {
    if (!workOrderId || !selectedWorkOrder) return;

    // Auto-select vendor
    const woVendor = selectedWorkOrder.contractor_id || selectedWorkOrder.vendor_id;
    if (woVendor && vendors.some((v) => v.id === woVendor)) {
      setVendorId(woVendor);
    }

    // Auto-fetch Activity & Sub-Activity from Work Order
    if (selectedWorkOrder.activity_id) {
      setBudgetAllocationId(selectedWorkOrder.activity_id);
    }
    if (selectedWorkOrder.master_budget_item_id) {
      setMasterBudgetItemId(selectedWorkOrder.master_budget_item_id);
    }

    // Fetch commercial defaults and populate initial line items
    Promise.all([
      getWorkOrderLineBillingPosition(workOrderId).catch(() => []),
      getServiceBillDefaults(workOrderId).catch(() => null),
    ]).then(([positionRows, billDefaults]) => {
      if (billDefaults) {
        setDefaults(billDefaults);
        setRetentionPercent(billDefaults.retentionPercent);
        setTdsPercent(billDefaults.tdsPercent);
      }

      if (positionRows.length > 0) {
        setLines(
          positionRows.map((pos) => ({
            key: pos.workOrderLineId || Math.random().toString(36).slice(2),
            workOrderLineId: pos.workOrderLineId,
            description: pos.description,
            percentCompleted: 100,
            quantity: pos.contractedQuantity || 1,
            unit: pos.unit || '',
            rate: pos.rate || 0,
            contractedRate: pos.rate || 0,
            taxRate: billDefaults?.gstTreatment === 'exclusive' ? billDefaults.gstRate : 18,
          })),
        );
      }
    });
  }, [workOrderId, selectedWorkOrder, vendors]);

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, newLine()]);
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev));
  }

  const subtotal = useMemo(() => {
    return lines.reduce((sum, l) => sum + lineValue(l), 0);
  }, [lines]);

  const taxAmount = useMemo(() => {
    return lines.reduce((sum, l) => sum + (lineValue(l) * (l.taxRate || 0)) / 100, 0);
  }, [lines]);

  const totalAmount = subtotal + taxAmount;
  const retentionAmount = Math.round(((subtotal * (retentionPercent || 0)) / 100) * 100) / 100;
  const tdsAmount = Math.round(((subtotal * (tdsPercent || 0)) / 100) * 100) / 100;
  const netPayable = Math.max(
    0,
    totalAmount - retentionAmount - advanceAdjusted - otherDeductions - debitAmount - tdsAmount,
  );

  const drawdownValue = selectedWorkOrder?.tax_inclusive ? totalAmount : subtotal;
  const exceedsWorkOrder =
    selectedWorkOrder != null && drawdownValue > Number(selectedWorkOrder.remaining_balance || 0);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId) return setError('No active project selected.');
    if (!workOrderId) return setError('A Work Order is mandatory — no WO, no bill.');
    if (!vendorId) return setError('Select the vendor or contractor this bill is from.');
    if (!billNumber.trim()) return setError('Bill number is required.');
    if (debitAmount > 0 && !debitReason.trim()) {
      return setError('A debit needs a reason — it is a contractual penalty and must be auditable.');
    }

    const billableLines: CreateServiceBillLineInput[] = lines
      .filter((l) => l.description.trim())
      .map((l) => ({
        description: l.description,
        unit: l.unit || undefined,
        quantity: l.quantity,
        rate: l.rate * ((l.percentCompleted ?? 100) / 100),
        taxRate: l.taxRate,
        workOrderLineId: l.workOrderLineId,
        billableItemId: l.billableItemId,
      }));

    if (billableLines.length === 0) {
      return setError('Please enter at least one line item.');
    }

    setLoading(true);
    setError(null);

    const result = await createServiceBill({
      projectId,
      vendorId,
      workOrderId,
      activityId: budgetAllocationId || selectedWorkOrder?.activity_id || undefined,
      budgetAllocationId: budgetAllocationId || undefined,
      masterBudgetItemId:
        masterBudgetItemId || selectedWorkOrder?.master_budget_item_id || undefined,
      billNumber,
      billDate,
      supplierBillNo: supplierBillNo || undefined,
      serviceDescription,
      retentionPercent,
      advanceAdjusted,
      otherDeductions,
      debitAmount,
      debitReason: debitReason || undefined,
      tdsPercent,
      isInterstate,
      lines: billableLines,
    });

    setLoading(false);

    if (result.error) setError(result.error.message);
    else {
      onSuccess();
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-4xl rounded-xl bg-card border border-border shadow-2xl flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold">Record Service Bill</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1 hover:bg-muted text-muted-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700 border border-red-200">
              {error}
            </div>
          )}

          <form id="create-service-bill-form" onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">
                  Vendor / Contractor <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={vendorId}
                  onChange={(e) => {
                    const newVendorId = e.target.value;
                    setVendorId(newVendorId);
                    if (workOrderId) {
                      const wo = workOrders.find((w) => w.id === workOrderId);
                      const woVendor = wo?.contractor_id || wo?.vendor_id;
                      if (woVendor && woVendor !== newVendorId) {
                        setWorkOrderId('');
                      }
                    }
                  }}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Select a vendor / contractor…</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                      {v.vendorCode ? ` (${v.vendorCode})` : ''}
                      {v.vendorType === 'contractor' ? ' — contractor' : ''}
                    </option>
                  ))}
                </select>
                {vendors.length === 0 && (
                  <p className="text-[11px] text-amber-600">
                    No active vendors on record. Add one under Vendors first.
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">
                  Work Order <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={workOrderId}
                  onChange={(e) => setWorkOrderId(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Select an issued/active Work Order…</option>
                  {filteredWorkOrders.map((wo) => (
                    <option key={wo.id} value={wo.id}>
                      {wo.work_order_number} — {wo.site_agencies?.agency_name || 'Agency'} (
                      {formatIndianCurrency(wo.remaining_balance)} left)
                    </option>
                  ))}
                </select>
                {filteredWorkOrders.length === 0 && (
                  <p className="text-[11px] text-amber-600">
                    {vendorId
                      ? 'No active Work Orders for this contractor.'
                      : 'No issued/active Work Orders for this project.'}
                  </p>
                )}
              </div>
            </div>

            {selectedWorkOrder && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs">
                <span className="font-semibold text-muted-foreground">
                  {selectedWorkOrder.scope_of_work}
                </span>
                <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1">
                  <span>
                    WO Value <strong>{formatIndianCurrency(selectedWorkOrder.total_amount)}</strong>
                  </span>
                  <span>
                    Certified <strong>{formatIndianCurrency(selectedWorkOrder.billed_to_date)}</strong>
                  </span>
                  <span>
                    Remaining <strong>{formatIndianCurrency(selectedWorkOrder.remaining_balance)}</strong>
                  </span>
                  <span className="text-muted-foreground">
                    Draws down on {selectedWorkOrder.tax_inclusive ? 'gross (GST incl.)' : 'net-of-tax'} value
                  </span>
                </div>
              </div>
            )}

            {/* Requirement 2: Auto-fetched Activity & Sub-Activity Comboboxes in Work Order Style */}
            <div className="grid grid-cols-2 gap-4">
              <BudgetHeadCombobox
                budgetHeads={budgetHeads}
                value={budgetAllocationId}
                onChange={(newHeadId) => {
                  setBudgetAllocationId(newHeadId);
                  setMasterBudgetItemId('');
                }}
              />
              <SubActivityCombobox
                masterLines={masterLines}
                selectedHead={budgetHeads.find((b) => b.id === budgetAllocationId)}
                value={masterBudgetItemId}
                onChange={(newSubId) => {
                  setMasterBudgetItemId(newSubId);
                  if (newSubId) {
                    const line = masterLines.find((m) => m.id === newSubId);
                    if (line) {
                      const matchingHead = budgetHeads.find(
                        (h) =>
                          (line.categoryId && h.categoryId === line.categoryId) ||
                          (line.categoryName &&
                            (h.allocationName?.toLowerCase() === line.categoryName.toLowerCase() ||
                              h.categoryName?.toLowerCase() === line.categoryName.toLowerCase())),
                      );
                      if (matchingHead && matchingHead.id !== budgetAllocationId) {
                        setBudgetAllocationId(matchingHead.id);
                      }
                    }
                  }
                }}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">
                  Bill Number <span className="text-red-500">*</span>
                </label>
                <input
                  required
                  type="text"
                  value={billNumber}
                  onChange={(e) => setBillNumber(e.target.value)}
                  placeholder="SB-XXXXX"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm uppercase"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">
                  Contractor&apos;s Bill No.
                </label>
                <input
                  type="text"
                  value={supplierBillNo}
                  onChange={(e) => setSupplierBillNo(e.target.value)}
                  placeholder="Their reference"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">
                  Bill Date <span className="text-red-500">*</span>
                </label>
                <input
                  required
                  type="date"
                  value={billDate}
                  onChange={(e) => setBillDate(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">
                Service Description
              </label>
              <input
                type="text"
                value={serviceDescription}
                onChange={(e) => setServiceDescription(e.target.value)}
                placeholder="e.g. Scaffolding erection - Tower B, Aug 2026"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>

            {/* Requirement 3: Streamlined Line Items Table */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold text-foreground">Service Bill Items</h3>
                <button
                  type="button"
                  onClick={addLine}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                >
                  <Plus className="h-3.5 w-3.5" /> Add line
                </button>
              </div>

              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-muted/50 font-heading font-bold text-muted-foreground uppercase border-b border-border text-[10px]">
                    <tr>
                      <th className="px-3 py-2 min-w-[200px]">Items</th>
                      <th className="px-3 py-2 text-right w-[140px]">% of Work Completed</th>
                      <th className="px-3 py-2 text-right w-[90px]">Qty</th>
                      <th className="px-3 py-2 w-[90px]">Unit</th>
                      <th className="px-3 py-2 text-right w-[110px]">Rate/Flat</th>
                      <th className="px-3 py-2 text-right w-[120px]">Amount</th>
                      <th className="px-3 py-2 text-center w-[40px]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => {
                      const val = lineValue(line);
                      return (
                        <tr key={line.key} className="border-b border-border last:border-0 hover:bg-muted/10">
                          <td className="px-2 py-1.5">
                            <input
                              required
                              type="text"
                              placeholder="Item description"
                              value={line.description}
                              onChange={(e) => updateLine(line.key, { description: e.target.value })}
                              className="w-full rounded border border-input bg-background px-2 py-1 text-xs font-medium"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <div className="flex items-center justify-end gap-1">
                              <input
                                required
                                type="number"
                                min="0"
                                max="100"
                                step="0.5"
                                placeholder="100"
                                value={line.percentCompleted === 0 ? '' : line.percentCompleted}
                                onChange={(e) => updateLine(line.key, { percentCompleted: Number(e.target.value) })}
                                className="w-16 rounded border border-input bg-background px-2 py-1 text-xs text-right font-semibold"
                              />
                              <span className="text-xs text-muted-foreground">%</span>
                            </div>
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              required
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="Qty"
                              value={line.quantity === 0 ? '' : line.quantity}
                              onChange={(e) => updateLine(line.key, { quantity: Number(e.target.value) })}
                              className="w-full rounded border border-input bg-background px-2 py-1 text-xs text-right"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="text"
                              placeholder="Unit"
                              value={line.unit}
                              onChange={(e) => updateLine(line.key, { unit: e.target.value })}
                              className="w-full rounded border border-input bg-background px-2 py-1 text-xs"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              required
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="Rate"
                              value={line.rate === 0 ? '' : line.rate}
                              onChange={(e) => updateLine(line.key, { rate: Number(e.target.value) })}
                              className="w-full rounded border border-input bg-background px-2 py-1 text-xs text-right"
                            />
                          </td>
                          <td className="px-3 py-2 text-right font-bold text-foreground">
                            {formatIndianCurrency(val)}
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <button
                              type="button"
                              disabled={lines.length === 1}
                              onClick={() => removeLine(line.key)}
                              className="text-red-500 hover:text-red-700 disabled:opacity-30"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="border-t border-border pt-4">
              <h3 className="mb-3 text-sm font-semibold">Deductions &amp; Settlement</h3>
              {defaults && (
                <p className="mb-3 rounded-lg border border-dashed border-border bg-muted/20 p-2 text-[11px] text-muted-foreground">
                  Inherited from Work Order: retention{' '}
                  <strong className="text-foreground">{defaults.retentionPercent}%</strong>
                  {' · '}TDS <strong className="text-foreground">{defaults.tdsPercent}%</strong>
                </p>
              )}
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Retention %</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={retentionPercent}
                    onChange={(e) => setRetentionPercent(Number(e.target.value))}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Advance Recovered</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={advanceAdjusted}
                    onChange={(e) => setAdvanceAdjusted(Number(e.target.value))}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Other Deductions</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={otherDeductions}
                    onChange={(e) => setOtherDeductions(Number(e.target.value))}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">TDS %</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={tdsPercent}
                    onChange={(e) => setTdsPercent(Number(e.target.value))}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Debit (penalty)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={debitAmount}
                    onChange={(e) => setDebitAmount(Number(e.target.value))}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">
                    Debit reason {debitAmount > 0 && <span className="text-red-500">*</span>}
                  </label>
                  <input
                    value={debitReason}
                    onChange={(e) => setDebitReason(e.target.value)}
                    placeholder="Safety violation / delay"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <label className="mt-3 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                <input
                  type="checkbox"
                  checked={isInterstate}
                  onChange={(e) => setIsInterstate(e.target.checked)}
                />
                Interstate supply (IGST instead of CGST + SGST)
              </label>

              <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3 text-xs">
                <div className="flex flex-wrap gap-x-6 gap-y-1">
                  <span>Subtotal <strong>{formatIndianCurrency(subtotal)}</strong></span>
                  <span>
                    {isInterstate ? 'IGST' : 'CGST + SGST'} <strong>{formatIndianCurrency(taxAmount)}</strong>
                  </span>
                  <span>Gross <strong>{formatIndianCurrency(totalAmount)}</strong></span>
                  <span>Retention <strong>−{formatIndianCurrency(retentionAmount)}</strong></span>
                  {tdsAmount > 0 && <span>TDS <strong>−{formatIndianCurrency(tdsAmount)}</strong></span>}
                  {debitAmount > 0 && <span>Debit <strong>−{formatIndianCurrency(debitAmount)}</strong></span>}
                  <span className="text-primary">Net payable <strong>{formatIndianCurrency(netPayable)}</strong></span>
                </div>
              </div>
            </div>

            {exceedsWorkOrder && (
              <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <div className="text-xs text-amber-800">
                  This bill exceeds the Work Order&apos;s remaining balance by{' '}
                  {formatIndianCurrency(drawdownValue - Number(selectedWorkOrder?.remaining_balance || 0))}.
                </div>
              </div>
            )}

            <div className="flex items-start gap-3 rounded-lg border border-orange-200 bg-orange-50 p-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-orange-600" />
              <div className="text-xs text-orange-800">
                Submitting records a claim. Cost hits the budget only on <strong>approval</strong>.
              </div>
            </div>
          </form>
        </div>

        <div className="flex justify-end gap-3 border-t border-border bg-muted/20 p-4">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-md border border-border px-4 py-2 text-sm font-semibold transition-colors hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="create-service-bill-form"
            disabled={loading || workOrders.length === 0}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            <FileText className="h-4 w-4" />
            {loading ? 'Submitting…' : 'Submit Bill'}
          </button>
        </div>
      </div>
    </div>
  );
}
