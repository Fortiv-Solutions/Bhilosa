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
  type WorkOrderLineBillingPosition,
} from '@/lib/measurement-sheets';
import { supabase } from '@/utils/supabase-client';
import {
  getBillableWorkOrders,
  getWorkOrder,
  listBudgetHeads,
  listMasterBudgetLines,
  type BudgetHeadOption,
  type MasterBudgetLineOption,
} from '@/lib/work-orders';
import {
  getServiceBillDefaults,
  type ServiceBillDefaults,
  type ValuationStructure,
  listPaymentStages,
  type PaymentStageRow,
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
  wo_type?: string | null;
  total_amount: number;
  billed_to_date: number;
  claimed_to_date: number;
  remaining_balance: number;
  tax_inclusive: boolean;
  gst_percentage?: number | null;
  agency_id?: string | null;
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
  floorLevel?: number;      // Floor level for floor_lead billing (0 = Ground)
  stageId?: string;          // Primary payment stage ID for stage_percentage billing  
  stageIds?: string[];       // Array of selected stage IDs for multi-stage selection
  stageName?: string;        // Primary payment stage name
  stageNames?: string[];     // Array of selected stage names
  stagePercent?: number;     // Combined payment stage percentage (sum)
  effectiveRate?: number;    // Computed: baseRate * (1 + floor * lead%/100)
  contractedQty?: number;    // Original WO contracted qty (display only)
  prevCertifiedQty?: number; // Previously certified qty (display only)
  warrantyPeriod?: string;   // Display-only warranty period (e.g. 10 Years Paint Performance Warranty)
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

/* ─── Auto-Resizing Textarea Component ────────────────────────────────── */
function AutoResizingTextarea({
  value,
  onChange,
  placeholder,
  className,
  required,
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto';
      ref.current.style.height = `${Math.max(38, ref.current.scrollHeight)}px`;
    }
  }, [value]);

  return (
    <textarea
      ref={ref}
      rows={1}
      required={required}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={
        className ||
        'w-full rounded border border-input bg-background px-2.5 py-1.5 text-xs leading-relaxed resize-none overflow-hidden min-h-[38px] font-medium transition-all focus:ring-1 focus:ring-primary'
      }
    />
  );
}

/* ─── Multi-Stage Selection Dropdown Component ───────────────────────── */
function MultiStageDropdown({
  stages,
  selectedStageIds = [],
  onChange,
}: {
  stages: Array<{ id: string; name: string; percent: number }>;
  selectedStageIds: string[];
  onChange: (
    stageIds: string[],
    selectedStages: Array<{ id: string; name: string; percent: number }>
  ) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedStages = useMemo(
    () => stages.filter((s) => selectedStageIds.includes(s.id)),
    [stages, selectedStageIds]
  );

  const totalPercent = useMemo(
    () => selectedStages.reduce((sum, s) => sum + s.percent, 0),
    [selectedStages]
  );

  const toggleStage = (stageId: string) => {
    let nextIds: string[];
    if (selectedStageIds.includes(stageId)) {
      nextIds = selectedStageIds.filter((id) => id !== stageId);
    } else {
      nextIds = [...selectedStageIds, stageId];
    }
    const nextStages = stages.filter((s) => nextIds.includes(s.id));
    onChange(nextIds, nextStages);
  };

  const toggleAll = () => {
    if (selectedStageIds.length === stages.length) {
      onChange([], []);
    } else {
      onChange(stages.map((s) => s.id), stages);
    }
  };

  return (
    <div className="relative w-full" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs bg-background border border-input rounded hover:border-primary/50 text-left transition-all"
      >
        <span className="truncate font-medium">
          {selectedStages.length === 0 ? (
            <span className="text-muted-foreground">Select Stage(s)…</span>
          ) : selectedStages.length === 1 ? (
            <span>{selectedStages[0].name} ({selectedStages[0].percent}%)</span>
          ) : (
            <span className="font-semibold text-violet-700 dark:text-violet-300">
              {selectedStages.length} Stages ({totalPercent}%)
            </span>
          )}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 left-0 mt-1 min-w-[260px] max-w-sm w-max bg-popover border border-border rounded-lg shadow-xl p-2.5 animate-in fade-in-50 zoom-in-95 duration-100">
          <div className="flex items-center justify-between border-b border-border pb-1.5 mb-1.5 px-1">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              Select Stages ({selectedStages.length}/{stages.length})
            </span>
            <button
              type="button"
              onClick={toggleAll}
              className="text-[10px] font-semibold text-primary hover:underline"
            >
              {selectedStageIds.length === stages.length ? 'Clear all' : 'Select all'}
            </button>
          </div>

          <div className="max-h-52 overflow-y-auto space-y-1">
            {stages.map((stage) => {
              const isSelected = selectedStageIds.includes(stage.id);
              return (
                <label
                  key={stage.id}
                  className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded cursor-pointer text-xs transition-colors ${
                    isSelected ? 'bg-primary/10 font-semibold text-primary' : 'hover:bg-muted text-foreground'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleStage(stage.id)}
                      className="rounded border-input text-primary focus:ring-primary h-3.5 w-3.5"
                    />
                    <span className="truncate">{stage.name}</span>
                  </div>
                  <span className="text-[11px] font-mono text-muted-foreground shrink-0">{stage.percent}%</span>
                </label>
              );
            })}
          </div>

          {selectedStages.length > 0 && (
            <div className="border-t border-border mt-2 pt-1.5 px-1 flex justify-between items-center text-[11px] font-bold text-foreground">
              <span>Combined Total:</span>
              <span className="text-violet-700 dark:text-violet-300 font-mono text-xs">{totalPercent}%</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function lineValue(line: DraftLine): number {
  const qty = line.quantity && line.quantity > 0 ? line.quantity : 0;
  const effectiveRate = line.effectiveRate && line.effectiveRate > 0 ? line.effectiveRate : (line.rate || 0);
  return qty * effectiveRate;
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

  const [valuationStructure, setValuationStructure] = useState<'standard' | 'stage_percentage' | 'floor_lead' | 'rate_based'>('standard');
  const [leadPercentPerFloor, setLeadPercentPerFloor] = useState(0);
  const [paymentStages, setPaymentStages] = useState<Array<{ id: string; name: string; percent: number }>>([]);

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
    setValuationStructure('standard');
    setLeadPercentPerFloor(0);
    setPaymentStages([]);
  }, []);

  const targetProjectId = projectId || 'central-park';

  useEffect(() => {
    if (!isOpen) return;
    resetForm();
    getBillableWorkOrders(targetProjectId)
      .then(async (rows) => {
        if (rows && rows.length > 0) {
          setWorkOrders(rows as unknown as BillableWorkOrder[]);
        } else {
          // Fallback: query all active Work Orders if project ID mapping differs or no project passed
          const allWos = await getBillableWorkOrders().catch(() => []);
          setWorkOrders((allWos || []) as unknown as BillableWorkOrder[]);
        }
      })
      .catch(async () => {
        const allWos = await getBillableWorkOrders().catch(() => []);
        setWorkOrders((allWos || []) as unknown as BillableWorkOrder[]);
      });
    listBillableVendors()
      .then(setVendors)
      .catch(() => setVendors([]));
    listBudgetHeads(targetProjectId)
      .then(setBudgetHeads)
      .catch(() => setBudgetHeads([]));
    listMasterBudgetLines(targetProjectId)
      .then(setMasterLines)
      .catch(() => setMasterLines([]));
  }, [isOpen, targetProjectId, resetForm]);

  // Requirement 1: If contractor/vendor is selected first, filter connected Work Orders with fallback
  const filteredWorkOrders = useMemo(() => {
    if (!vendorId) return workOrders;
    const matched = workOrders.filter((wo) => {
      const woVendor = wo.agency_id || wo.contractor_id || wo.vendor_id;
      return !woVendor || woVendor === vendorId;
    });
    return matched.length > 0 ? matched : workOrders;
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
    if (selectedWorkOrder.master_budget_item_id) {
      setMasterBudgetItemId(selectedWorkOrder.master_budget_item_id);
      const line = masterLines.find((m) => m.id === selectedWorkOrder.master_budget_item_id);
      if (line) {
        const matchingHead = budgetHeads.find(
          (h) =>
            (line.categoryId && h.categoryId === line.categoryId) ||
            (line.categoryName &&
              (h.allocationName?.toLowerCase() === line.categoryName.toLowerCase() ||
                h.categoryName?.toLowerCase() === line.categoryName.toLowerCase())),
        );
        if (matchingHead) {
          setBudgetAllocationId(matchingHead.id);
        }
      }
    } else if (selectedWorkOrder.activity_id) {
      setBudgetAllocationId(selectedWorkOrder.activity_id);
    }

    // Fetch commercial defaults and populate initial line items
    async function loadWoData() {
      try {
        const [positionRows, billDefaults, woDetail, billCountRes] = await Promise.all([
          getWorkOrderLineBillingPosition(workOrderId).catch(() => [] as WorkOrderLineBillingPosition[]),
          getServiceBillDefaults(workOrderId).catch(() => null),
          getWorkOrder(workOrderId).catch(() => null),
          supabase
            .from('service_bills')
            .select('id', { count: 'exact', head: true })
            .eq('work_order_id', workOrderId)
            .is('deleted_at', null),
        ]);

        const existingBillsCount = billCountRes.count ?? 0;

        // Auto-generate sequential RA bill number
        const woNum = selectedWorkOrder?.work_order_number || 'SB';
        const seq = existingBillsCount + 1;
        setBillNumber(`${woNum}/RA-${seq}`);

        if (billDefaults) {
          setDefaults(billDefaults);
          setRetentionPercent(billDefaults.retentionPercent);
          setTdsPercent(billDefaults.tdsPercent);
          setValuationStructure((billDefaults.valuation_structure as 'standard' | 'stage_percentage' | 'floor_lead' | 'rate_based') ?? 'standard');
          setLeadPercentPerFloor(billDefaults.lead_percent_per_floor ?? 0);
          setPaymentStages(billDefaults.stages ?? []);
        }

        if (positionRows && positionRows.length > 0) {
          const defaultGstRate = Number(
            (woDetail as any)?.gst_percentage ??
              (woDetail as any)?.gst_rate ??
              billDefaults?.gstRate ??
              18,
          );
          const woLines = (woDetail as any)?.work_order_lines || [];

          setLines(
            positionRows.map((pos: any) => {
              const matchedLine = woLines.find((l: any) => l.id === pos.workOrderLineId);
              const lineGst = Number(
                pos.gst_percentage ??
                  pos.gstRate ??
                  pos.tax_rate ??
                  matchedLine?.gst_percentage ??
                  matchedLine?.gst_rate ??
                  matchedLine?.tax_rate ??
                  defaultGstRate,
              );

              return {
                key: pos.workOrderLineId || Math.random().toString(36).slice(2),
                workOrderLineId: pos.workOrderLineId,
                description: pos.description,
                percentCompleted: 100,
                quantity: pos.contractedQuantity || 1,
                unit: pos.unit || '',
                rate: pos.rate || 0,
                contractedRate: pos.rate || 0,
                contractedQty: pos.contractedQuantity,
                prevCertifiedQty: pos.certifiedQuantity,
                taxRate: lineGst,
              };
            }),
          );
        }
      } catch (err) {
        console.error('Error loading Work Order billing data:', err);
      }
    }

    void loadWoData();
  }, [workOrderId, selectedWorkOrder, vendors, budgetHeads, masterLines]);

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
        rate: valuationStructure === 'floor_lead' && l.effectiveRate ? l.effectiveRate : l.rate,
        taxRate: l.taxRate,
        workOrderLineId: l.workOrderLineId,
        billableItemId: l.billableItemId,
        floorLevel: valuationStructure === 'floor_lead' ? l.floorLevel : undefined,
        rateFactorApplied: valuationStructure === 'floor_lead' && l.floorLevel !== undefined
          ? (1 + (l.floorLevel * leadPercentPerFloor) / 100)
          : undefined,
      }));

    if (billableLines.length === 0) {
      return setError('Please enter at least one line item.');
    }

    // Client-side over-billing validation for fixed scope contracts
    const woType = selectedWorkOrder?.wo_type || 'fixed_scope';
    if (woType === 'fixed_scope') {
      for (const l of lines) {
        if (l.description.trim() && l.contractedQty !== undefined && l.contractedQty > 0) {
          const prevBilled = l.prevCertifiedQty || 0;
          const availQty = Math.max(0, l.contractedQty - prevBilled);
          if (l.quantity > availQty + 0.0001) {
            return setError(
              `Over-billing on "${l.description}": Entered quantity (${l.quantity}) exceeds remaining balance (${availQty.toFixed(2)}). Previously billed: ${prevBilled}, Contracted: ${l.contractedQty}.`,
            );
          }
        }
      }
    }

    setLoading(true);
    setError(null);

    const result = await createServiceBill({
      projectId,
      vendorId,
      workOrderId,
      activityId: selectedWorkOrder?.activity_id || undefined,
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
      <div className="w-full max-w-[94vw] lg:max-w-7xl xl:max-w-[90vw] rounded-2xl bg-card border border-border shadow-2xl flex flex-col max-h-[95vh] duration-200">
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
                      {wo.work_order_number} {wo.scope_of_work ? `[${wo.scope_of_work}]` : ''} — {wo.site_agencies?.agency_name || 'Agency'} (
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
                {defaults && valuationStructure !== 'standard' && (
                  <div className="flex items-center gap-2 mt-2">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      valuationStructure === 'stage_percentage'
                        ? 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300'
                        : valuationStructure === 'floor_lead'
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                        : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                    }`}>
                      {valuationStructure === 'stage_percentage' && '⚡ Stage/Milestone Billing'}
                      {valuationStructure === 'floor_lead' && '📐 Floor Lead Billing'}
                      {valuationStructure === 'rate_based' && '📐 Rate-Based Contract (Quantity at Execution)'}
                    </span>
                  </div>
                )}
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

              {valuationStructure === 'floor_lead' && (
                <div className="mb-2 rounded.md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 flex items-center gap-2 font-medium">
                  <span className="shrink-0 font-bold">📐 Floor Lead Billing:</span>
                  <span>Each floor level must be recorded as a separate bill line (e.g. Ground Floor, 1st Floor, 2nd Floor). Base rate increases by +{leadPercentPerFloor}% per floor level.</span>
                </div>
              )}

              {valuationStructure === 'stage_percentage' && (
                <div className="mb-2 rounded-md border border-violet-200 bg-violet-50 p-2.5 text-xs text-violet-800 flex items-center gap-2 font-medium">
                  <span className="shrink-0 font-bold">⚡ Stage/Milestone Billing:</span>
                  <span>Multiple stages can be billed in a single bill by selecting the stage for each line item.</span>
                </div>
              )}

              {valuationStructure === 'rate_based' && (
                <div className="mb-2 rounded-md border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-900 flex items-center gap-2 font-medium">
                  <span className="shrink-0 font-bold">📐 Rate-Based Contract:</span>
                  <span>Quantities are measured at site execution time. Enter the actual measured work quantity for this bill period. Line Amount = Executed Qty × Contract Rate.</span>
                </div>
              )}

              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full min-w-[1500px] text-left text-xs border-collapse">
                  <thead className="bg-muted/60 font-heading font-bold text-muted-foreground uppercase border-b border-border text-[10px] tracking-wider">
                    {valuationStructure === 'standard' && (
                      <tr>
                        <th className="px-3 py-2.5 min-w-[280px]">Items</th>
                        <th className="px-2 py-2.5 text-right w-[90px]">Contracted</th>
                        <th className="px-2 py-2.5 text-right w-[90px]">Prev Billed</th>
                        <th className="px-2 py-2.5 text-right w-[100px] text-emerald-700 dark:text-emerald-400">Balance Qty</th>
                        <th className="px-2 py-2.5 text-right w-[110px] text-purple-700 dark:text-purple-400">Remaining (₹)</th>
                        <th className="px-2 py-2.5 text-right w-[100px]">This Bill Qty</th>
                        <th className="px-2 py-2.5 w-[70px]">Unit</th>
                        <th className="px-2 py-2.5 text-right w-[100px]">Rate (₹)</th>
                        <th className="px-2 py-2.5 text-right w-[110px]">% Work Done</th>
                        <th className="px-2 py-2.5 w-[80px]">GST %</th>
                        {lines.some((l) => l.warrantyPeriod) && (
                          <th className="px-2 py-2.5 w-[110px]">Warranty</th>
                        )}
                        <th className="px-3 py-2.5 text-right w-[120px]">Amount (₹)</th>
                        <th className="px-2 py-2.5 text-center w-[40px]"></th>
                      </tr>
                    )}
                    {valuationStructure === 'stage_percentage' && (
                      <tr>
                        <th className="px-3 py-2.5 min-w-[280px]">Items</th>
                        <th className="px-2 py-2.5 min-w-[150px]">Stage</th>
                        <th className="px-2 py-2.5 text-right w-[70px]">Stage %</th>
                        <th className="px-2 py-2.5 text-right w-[90px]">Contracted</th>
                        <th className="px-2 py-2.5 text-right w-[90px]">Prev Billed</th>
                        <th className="px-2 py-2.5 text-right w-[100px] text-emerald-700 dark:text-emerald-400">Balance Qty</th>
                        <th className="px-2 py-2.5 text-right w-[110px] text-purple-700 dark:text-purple-400">Remaining (₹)</th>
                        <th className="px-2 py-2.5 text-right w-[90px]">Flats to Bill</th>
                        <th className="px-2 py-2.5 text-right w-[100px]">Flat Rate (₹)</th>
                        <th className="px-2 py-2.5 w-[80px]">GST %</th>
                        {lines.some((l) => l.warrantyPeriod) && (
                          <th className="px-2 py-2.5 w-[110px]">Warranty</th>
                        )}
                        <th className="px-3 py-2.5 text-right w-[120px]">Amount (₹)</th>
                        <th className="px-2 py-2.5 text-center w-[40px]"></th>
                      </tr>
                    )}
                    {valuationStructure === 'floor_lead' && (
                      <tr>
                        <th className="px-3 py-2.5 min-w-[280px]">Items</th>
                        <th className="px-2 py-2.5 text-right w-[90px]">Contracted</th>
                        <th className="px-2 py-2.5 text-right w-[90px]">Prev Billed</th>
                        <th className="px-2 py-2.5 text-right w-[100px] text-emerald-700 dark:text-emerald-400">Balance Qty</th>
                        <th className="px-2 py-2.5 text-right w-[110px] text-purple-700 dark:text-purple-400">Remaining (₹)</th>
                        <th className="px-2 py-2.5 text-right w-[100px]">This Bill Qty</th>
                        <th className="px-2 py-2.5 w-[70px]">Unit</th>
                        <th className="px-2 py-2.5 text-center w-[85px]">Floor Level</th>
                        <th className="px-2 py-2.5 text-right w-[100px]">Base Rate (₹)</th>
                        <th className="px-2 py-2.5 text-right w-[80px]">Lead %</th>
                        <th className="px-2 py-2.5 text-right w-[110px]">Effective (₹)</th>
                        <th className="px-2 py-2.5 w-[80px]">GST %</th>
                        {lines.some((l) => l.warrantyPeriod) && (
                          <th className="px-2 py-2.5 w-[110px]">Warranty</th>
                        )}
                        <th className="px-3 py-2.5 text-right w-[120px]">Amount (₹)</th>
                        <th className="px-2 py-2.5 text-center w-[40px]"></th>
                      </tr>
                    )}
                    {valuationStructure === 'rate_based' && (
                      <tr>
                        <th className="px-3 py-2.5 min-w-[280px]">Items</th>
                        <th className="px-2 py-2.5 text-right w-[110px]">Prev. Executed</th>
                        <th className="px-2 py-2.5 text-right w-[130px] text-emerald-700 dark:text-emerald-400">This Bill Executed Qty</th>
                        <th className="px-2 py-2.5 w-[80px]">Unit</th>
                        <th className="px-2 py-2.5 text-right w-[110px]">Rate/Unit (₹)</th>
                        <th className="px-2 py-2.5 w-[80px]">GST %</th>
                        {lines.some((l) => l.warrantyPeriod) && (
                          <th className="px-2 py-2.5 w-[110px]">Warranty</th>
                        )}
                        <th className="px-3 py-2.5 text-right w-[120px]">Amount (₹)</th>
                        <th className="px-2 py-2.5 text-center w-[40px]"></th>
                      </tr>
                    )}
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {lines.map((line) => {
                      const val = lineValue(line);
                      const prevBilled = line.prevCertifiedQty || 0;
                      const contracted = line.contractedQty;
                      const availBalanceQty = contracted !== undefined ? Math.max(0, contracted - prevBilled) : 0;
                      const netBalanceQty = contracted !== undefined ? Math.max(0, contracted - prevBilled - (line.quantity || 0)) : 0;
                      const isOverBilled = contracted !== undefined && contracted > 0 && (line.quantity || 0) > availBalanceQty + 0.0001;
                      const remainingVal = netBalanceQty * line.rate;

                      return (
                        <tr key={line.key} className="border-b border-border last:border-0 hover:bg-muted/10">
                          <td className="px-3 py-2.5">
                            <AutoResizingTextarea
                              required
                              placeholder="Item description & specification"
                              value={line.description}
                              onChange={(val) => updateLine(line.key, { description: val })}
                            />
                          </td>

                          {valuationStructure === 'standard' && (
                            <>
                              <td className="px-2 py-2.5 text-right font-medium text-muted-foreground tabular-nums">{contracted ?? '-'}</td>
                              <td className="px-2 py-2.5 text-right font-semibold text-muted-foreground tabular-nums">{prevBilled}</td>
                              <td className="px-2 py-2.5 text-right font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{contracted !== undefined ? netBalanceQty : '-'}</td>
                              <td className="px-2 py-2.5 text-right font-bold text-purple-600 dark:text-purple-400 tabular-nums">{contracted !== undefined ? formatIndianCurrency(remainingVal) : '-'}</td>
                              <td className="px-2 py-2.5">
                                <input
                                  required
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  placeholder="Qty"
                                  value={line.quantity === 0 ? '' : line.quantity}
                                  onChange={(e) => {
                                    const newQty = Number(e.target.value);
                                    const patch: Partial<DraftLine> = { quantity: newQty };
                                    if (contracted && contracted > 0) {
                                      patch.percentCompleted = Number(((newQty / contracted) * 100).toFixed(1));
                                    }
                                    updateLine(line.key, patch);
                                  }}
                                  className={`w-full rounded border px-2 py-1 text-xs text-right font-semibold ${
                                    isOverBilled
                                      ? 'border-red-500 bg-red-50 text-red-700 font-bold dark:bg-red-950/40 dark:text-red-300'
                                      : 'border-input bg-background'
                                  }`}
                                />
                                {isOverBilled && (
                                  <p className="text-[10px] font-bold text-red-600 text-right mt-0.5">
                                    Max: {availBalanceQty}
                                  </p>
                                )}
                              </td>
                              <td className="px-2 py-2.5">
                                <input
                                  type="text"
                                  placeholder="Unit"
                                  value={line.unit}
                                  onChange={(e) => updateLine(line.key, { unit: e.target.value })}
                                  className="w-full rounded border border-input bg-background px-2 py-1 text-xs font-semibold"
                                />
                              </td>
                              <td className="px-2 py-2.5">
                                <input
                                  required
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  placeholder="Rate"
                                  value={line.rate === 0 ? '' : line.rate}
                                  onChange={(e) => updateLine(line.key, { rate: Number(e.target.value) })}
                                  className="w-full rounded border border-input bg-background px-2 py-1 text-xs text-right font-semibold"
                                />
                              </td>
                              <td className="px-2 py-2.5">
                                <div className="flex items-center justify-end gap-1">
                                  <input
                                    required
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="any"
                                    placeholder="100"
                                    value={line.percentCompleted === 0 ? '' : line.percentCompleted}
                                    onChange={(e) => updateLine(line.key, { percentCompleted: Number(e.target.value) })}
                                    className="w-16 rounded border border-input bg-background px-2 py-1 text-xs text-right font-bold text-foreground"
                                  />
                                  <span className="text-xs text-muted-foreground">%</span>
                                </div>
                              </td>
                              <td className="px-2 py-2.5">
                                <select
                                  value={line.taxRate ?? 18}
                                  onChange={(e) => updateLine(line.key, { taxRate: Number(e.target.value) })}
                                  className="w-full rounded border border-input bg-background px-2 py-1 text-xs font-bold text-foreground cursor-pointer"
                                >
                                  <option value={0}>0%</option>
                                  <option value={5}>5%</option>
                                  <option value={12}>12%</option>
                                  <option value={18}>18%</option>
                                  <option value={28}>28%</option>
                                </select>
                              </td>
                            </>
                          )}

                          {valuationStructure === 'stage_percentage' && (
                            <>
                              <td className="px-2 py-2.5 min-w-[200px]">
                                <MultiStageDropdown
                                  stages={paymentStages}
                                  selectedStageIds={line.stageIds || (line.stageId ? [line.stageId] : [])}
                                  onChange={(selectedIds, selectedStages) => {
                                    const totalPct = selectedStages.reduce((sum, s) => sum + s.percent, 0);
                                    const names = selectedStages.map((s) => s.name);
                                    updateLine(line.key, {
                                      stageId: selectedIds[0] || '',
                                      stageIds: selectedIds,
                                      stageName: names.join(', ') || '',
                                      stageNames: names,
                                      stagePercent: totalPct || undefined,
                                      percentCompleted: totalPct || 100,
                                    });
                                  }}
                                />
                              </td>
                              <td className="px-2 py-2.5 text-right font-bold text-violet-700 dark:text-violet-300 tabular-nums">
                                {line.stagePercent ? `${line.stagePercent}%` : '-'}
                              </td>
                              <td className="px-2 py-2.5 text-right font-medium text-muted-foreground tabular-nums">{line.contractedQty ?? '-'}</td>
                              <td className="px-2 py-2.5 text-right font-medium text-muted-foreground tabular-nums">{line.prevCertifiedQty ?? '0'}</td>
                              <td className="px-2 py-2.5 text-right font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{line.contractedQty !== undefined ? netBalanceQty : '-'}</td>
                              <td className="px-2 py-2.5 text-right font-bold text-purple-600 dark:text-purple-400 tabular-nums">{line.contractedQty !== undefined ? formatIndianCurrency(remainingVal) : '-'}</td>
                              <td className="px-2 py-2.5">
                                <input
                                  required
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  placeholder="Flats"
                                  value={line.quantity === 0 ? '' : line.quantity}
                                  onChange={(e) => updateLine(line.key, { quantity: Number(e.target.value) })}
                                  className="w-full rounded border border-input bg-background px-2 py-1 text-xs text-right font-semibold"
                                />
                              </td>
                              <td className="px-2 py-2.5 text-right font-bold text-foreground tabular-nums">
                                {formatIndianCurrency(line.rate || 0)}
                              </td>
                              <td className="px-2 py-2.5">
                                <select
                                  value={line.taxRate ?? 18}
                                  onChange={(e) => updateLine(line.key, { taxRate: Number(e.target.value) })}
                                  className="w-full rounded border border-input bg-background px-2 py-1 text-xs font-bold text-foreground cursor-pointer"
                                >
                                  <option value={0}>0%</option>
                                  <option value={5}>5%</option>
                                  <option value={12}>12%</option>
                                  <option value={18}>18%</option>
                                  <option value={28}>28%</option>
                                </select>
                              </td>
                            </>
                          )}

                          {valuationStructure === 'floor_lead' && (
                            <>
                              <td className="px-2 py-2.5 text-right font-medium text-muted-foreground tabular-nums">{line.contractedQty ?? '-'}</td>
                              <td className="px-2 py-2.5 text-right font-medium text-muted-foreground tabular-nums">{line.prevCertifiedQty ?? '0'}</td>
                              <td className="px-2 py-2.5 text-right font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{line.contractedQty !== undefined ? netBalanceQty : '-'}</td>
                              <td className="px-2 py-2.5 text-right font-bold text-purple-600 dark:text-purple-400 tabular-nums">{line.contractedQty !== undefined ? formatIndianCurrency(remainingVal) : '-'}</td>
                              <td className="px-2 py-2.5">
                                <input
                                  required
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  placeholder="Qty"
                                  value={line.quantity === 0 ? '' : line.quantity}
                                  onChange={(e) => updateLine(line.key, { quantity: Number(e.target.value) })}
                                  className="w-full rounded border border-input bg-background px-2 py-1 text-xs text-right font-semibold"
                                />
                              </td>
                              <td className="px-2 py-2.5">
                                <input
                                  type="text"
                                  placeholder="Unit"
                                  value={line.unit}
                                  onChange={(e) => updateLine(line.key, { unit: e.target.value })}
                                  className="w-full rounded border border-input bg-background px-2 py-1 text-xs font-semibold"
                                />
                              </td>
                              <td className="px-2 py-2.5">
                                <input
                                  required
                                  type="number"
                                  min="0"
                                  step="1"
                                  placeholder="0"
                                  value={line.floorLevel === undefined ? '' : line.floorLevel}
                                  onChange={(e) => {
                                    const floorLevel = Number(e.target.value);
                                    const effectiveRate = line.rate * (1 + (floorLevel * leadPercentPerFloor) / 100);
                                    updateLine(line.key, { floorLevel, effectiveRate });
                                  }}
                                  className="w-full rounded border border-input bg-background px-2 py-1 text-xs text-center font-bold text-foreground"
                                />
                              </td>
                              <td className="px-2 py-2.5">
                                <input
                                  required
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  placeholder="Base"
                                  value={line.rate === 0 ? '' : line.rate}
                                  onChange={(e) => {
                                    const rate = Number(e.target.value);
                                    const effectiveRate = rate * (1 + ((line.floorLevel || 0) * leadPercentPerFloor) / 100);
                                    updateLine(line.key, { rate, effectiveRate });
                                  }}
                                  className="w-full rounded border border-input bg-background px-2 py-1 text-xs text-right font-semibold"
                                />
                              </td>
                              <td className="px-2 py-2.5 text-right text-muted-foreground text-[10px] font-semibold">
                                {leadPercentPerFloor}% / flr
                              </td>
                              <td className="px-2 py-2.5 text-right font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                                {formatIndianCurrency(line.effectiveRate || line.rate || 0)}
                              </td>
                              <td className="px-2 py-2.5">
                                <select
                                  value={line.taxRate ?? 18}
                                  onChange={(e) => updateLine(line.key, { taxRate: Number(e.target.value) })}
                                  className="w-full rounded border border-input bg-background px-2 py-1 text-xs font-bold text-foreground cursor-pointer"
                                >
                                  <option value={0}>0%</option>
                                  <option value={5}>5%</option>
                                  <option value={12}>12%</option>
                                  <option value={18}>18%</option>
                                  <option value={28}>28%</option>
                                </select>
                              </td>
                            </>
                          )}

                          {valuationStructure === 'rate_based' && (
                            <>
                              <td className="px-2 py-2.5 text-right font-medium text-muted-foreground tabular-nums">
                                {line.prevCertifiedQty ?? '0'} {line.unit}
                              </td>
                              <td className="px-2 py-2.5">
                                <input
                                  required
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  placeholder="Executed Qty"
                                  value={line.quantity === 0 ? '' : line.quantity}
                                  onChange={(e) => updateLine(line.key, { quantity: Number(e.target.value) })}
                                  className="w-full rounded border border-emerald-500/40 bg-emerald-50/30 dark:bg-emerald-950/20 px-2 py-1 text-xs text-right font-bold text-foreground focus:ring-emerald-500"
                                />
                              </td>
                              <td className="px-2 py-2.5">
                                <input
                                  type="text"
                                  placeholder="Unit"
                                  value={line.unit}
                                  onChange={(e) => updateLine(line.key, { unit: e.target.value })}
                                  className="w-full rounded border border-input bg-background px-2 py-1 text-xs font-semibold"
                                />
                              </td>
                              <td className="px-2 py-2.5">
                                <input
                                  required
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  placeholder="Rate"
                                  value={line.rate === 0 ? '' : line.rate}
                                  onChange={(e) => updateLine(line.key, { rate: Number(e.target.value) })}
                                  className="w-full rounded border border-input bg-background px-2 py-1 text-xs text-right font-semibold"
                                />
                              </td>
                              <td className="px-2 py-2.5">
                                <select
                                  value={line.taxRate ?? 18}
                                  onChange={(e) => updateLine(line.key, { taxRate: Number(e.target.value) })}
                                  className="w-full rounded border border-input bg-background px-2 py-1 text-xs font-bold text-foreground cursor-pointer"
                                >
                                  <option value={0}>0%</option>
                                  <option value={5}>5%</option>
                                  <option value={12}>12%</option>
                                  <option value={18}>18%</option>
                                  <option value={28}>28%</option>
                                </select>
                              </td>
                            </>
                          )}

                          {lines.some((l) => l.warrantyPeriod) && (
                            <td className="px-2 py-2.5">
                              <span className="inline-block px-2 py-0.5 rounded bg-muted/60 text-[11px] text-muted-foreground font-mono truncate max-w-[130px]" title={line.warrantyPeriod || 'N/A'}>
                                {line.warrantyPeriod || 'N/A'}
                              </span>
                            </td>
                          )}

                          <td className="px-3 py-2 text-right font-bold text-foreground tabular-nums text-sm">
                            {formatIndianCurrency(val)}
                          </td>
                          <td className="px-2 py-2.5 text-center">
                            <button
                              type="button"
                              onClick={() => removeLine(line.key)}
                              className="text-muted-foreground hover:text-red-600 transition-colors"
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

              {/* Commercial Summary directly after table */}
              <div className="mt-3 rounded-xl border border-border bg-muted/20 p-3.5 text-xs font-medium">
                <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="font-bold text-foreground">{formatIndianCurrency(subtotal)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground">GST</span>
                    <span className="font-bold text-foreground">{formatIndianCurrency(taxAmount)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground">Gross</span>
                    <span className="font-bold text-foreground">{formatIndianCurrency(totalAmount)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground">Retention</span>
                    <span className="font-bold text-amber-600 dark:text-amber-400">−{formatIndianCurrency(retentionAmount)}</span>
                  </div>
                  {tdsAmount > 0 && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground">TDS</span>
                      <span className="font-bold text-amber-600 dark:text-amber-400">−{formatIndianCurrency(tdsAmount)}</span>
                    </div>
                  )}
                  {debitAmount > 0 && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground">Debit</span>
                      <span className="font-bold text-red-600 dark:text-red-400">−{formatIndianCurrency(debitAmount)}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-1 text-primary border border-primary/20">
                    <span className="font-semibold">Net Payable</span>
                    <span className="font-extrabold text-sm">{formatIndianCurrency(netPayable)}</span>
                  </div>
                </div>
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
