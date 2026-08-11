'use client';

// Single, unified Purchase Requisition form.
// Inspired by enterprise ERP form structures — all fields flow smoothly
// inside a single document surface without separate card boxes.

import { useMemo, useState, useEffect, type ReactNode } from 'react';
import { supabase } from '@/utils/supabase-client';
import {
  FileText, Wallet, Truck, Building2, X,
  AlertTriangle, Layers, Trash2, Search, CheckCircle2, SendHorizonal,
  Sparkles, ShieldCheck, Clock, Bot,
} from 'lucide-react';
import { formatCurrency } from '@/components/procurement/shared';
import { computeCostSummary, computeBudgetStatus, validatePrForm, type BudgetSnapshot } from '@/lib/erp/purchase-requisition/service';
import {
  PR_TYPE_OPTIONS, PR_PRIORITY_OPTIONS, prTypeNeedsContractor,
  type PrFormState, type PrFormLine, type ProcurementProjectOption, type ApprovedMrRow,
} from '@/lib/erp/purchase-requisition/types';
import type { MasterBudgetCategory } from '@/lib/budget';
import { analyzePrActivityBudgets } from '@/lib/erp/purchase-requisition/budget-analysis';
import type { ActivityResolutionMap } from '@/lib/erp/purchase-requisition/activity-category-resolver';
import { PrActivityBudgetCard } from './pr-activity-budget-card';
import { PrStatusBadge, BudgetStatusBadge } from './pr-badges';
import { PrItemTable } from './pr-item-table';

export interface SourceMrChip {
  mrId: string;
  mrNumber: string;
  projectName: string | null;
  activity: string | null;
  importedItems: number;
  pendingQty: number;
}

interface PrFormProps {
  form: PrFormState;
  update: (patch: Partial<PrFormState>) => void;
  onChangeLine: (key: string, patch: Partial<PrFormLine>) => void;
  onRemoveLine: (key: string, reason: string) => void;
  onAddManualLine: () => void;
  onBulkRequiredDate: (date: string) => void;
  onBulkDeliveryLocation: (location: string) => void;
  sourceChips: SourceMrChip[];
  approvedMrs?: ApprovedMrRow[];
  onSelectMrFromDropdown?: (mrId: string) => void;
  onOpenAddMr: () => void;
  onRemoveMr: (mrId: string) => void;
  budgetSnapshot: BudgetSnapshot | null;
  masterBudgetCategories?: MasterBudgetCategory[];
  /** Activity -> Master Budget category resolution, owned by the workspace. */
  activityResolution?: ActivityResolutionMap;
  activityResolving?: boolean;
  activityModelError?: string | null;
  activityUsedModel?: boolean;
  budgetHeads: { id: string; code: string; name: string }[];
  costCodes: { id: string; code: string; name: string }[];
  projectOptions: ProcurementProjectOption[];
  pendingFiles?: any[];
  onAddFiles?: (files: FileList | null, category: string) => void;
  onRemoveFile?: (index: number) => void;
  readOnly?: boolean;
  lastSavedAt: string | null;
  actions?: ReactNode;
  secondaryActions?: ReactNode;
  onCancel: () => void;
  onSendForVerification?: () => void;
  dbItems?: any[];
  itemGroups?: string[];
  budgetData?: {
    activities: string[];
    subActivitiesByCategory: Record<string, string[]>;
  };
}

const LABEL = 'mb-1 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground';
const FIELD = 'w-full rounded-lg border border-border/80 bg-background px-3 py-2 text-xs font-semibold text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all';
const READONLY = 'w-full rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs font-bold text-foreground';

function Field({ label, children, required }: { label: string; children: ReactNode; required?: boolean }) {
  return (
    <div>
      <label className={LABEL}>
        {label}
        {required && <span className="ml-0.5 text-red-500 font-bold">*</span>}
      </label>
      {children}
    </div>
  );
}

function WorkOrderSearchableSelect({
  value,
  workOrders,
  onChange,
  disabled = false,
}: {
  value: string;
  workOrders: any[];
  onChange: (wo: any) => void;
  disabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState(value || '');

  useEffect(() => {
    setSearch(value || '');
  }, [value]);

  const filtered = workOrders.filter((wo) => {
    const num = (wo.work_order_number || '').toLowerCase();
    const vendor = (wo.vendors?.display_name || wo.vendors?.legal_name || '').toLowerCase();
    return num.includes(search.toLowerCase()) || vendor.includes(search.toLowerCase());
  });

  return (
    <div className="relative w-full">
      <input
        type="text"
        value={search}
        disabled={disabled}
        onChange={(e) => {
          setSearch(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => {
          if (!disabled) setIsOpen(true);
        }}
        placeholder="Search Work Order..."
        className="w-full rounded-lg border border-border/80 bg-background px-3 py-2 text-xs font-semibold text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all font-mono"
      />
      {isOpen && !disabled && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute left-0 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg z-50">
            {filtered.length > 0 ? (
              filtered.map((wo) => {
                const contractor = wo.vendors?.display_name || wo.vendors?.legal_name || 'No Contractor';
                return (
                  <button
                    key={wo.id}
                    type="button"
                    onClick={() => {
                      onChange(wo);
                      setSearch(wo.work_order_number);
                      setIsOpen(false);
                    }}
                    className="w-full text-left rounded-md px-2.5 py-2 text-xs font-medium hover:bg-accent hover:text-accent-foreground transition-colors flex flex-col gap-0.5"
                  >
                    <span className="font-mono text-primary font-bold">{wo.work_order_number}</span>
                    <span className="text-[10px] text-muted-foreground font-normal">Contractor: {contractor}</span>
                  </button>
                );
              })
            ) : (
              <div className="px-2.5 py-2 text-xs text-muted-foreground italic text-center">
                No active work orders found
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SearchableApprovedMrDropdown({
  approvedMrs = [],
  onSelectMr,
  onOpenAddMr,
}: {
  approvedMrs?: ApprovedMrRow[];
  onSelectMr?: (mrId: string) => void;
  onOpenAddMr: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const sorted = [...(approvedMrs || [])].sort((a, b) => new Date(b.mr_date || b.required_date).getTime() - new Date(a.mr_date || a.required_date).getTime());
    if (!search.trim()) return sorted;
    const q = search.toLowerCase();
    return sorted.filter(mr => 
      mr.mr_number.toLowerCase().includes(q) ||
      (mr.project_name && mr.project_name.toLowerCase().includes(q)) ||
      (mr.requested_by && mr.requested_by.toLowerCase().includes(q)) ||
      (mr.work_activity && mr.work_activity.toLowerCase().includes(q))
    );
  }, [approvedMrs, search]);

  return (
    <div className="relative flex-1 min-w-[280px]">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="w-full flex items-center justify-between rounded-lg border border-border/80 bg-background px-3 py-2 text-xs font-semibold hover:border-primary transition-colors text-left"
          >
            <span className="flex items-center gap-2 text-foreground">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              Select from Approved MR...
            </span>
            <span className="text-[10px] text-muted-foreground font-mono">▼</span>
          </button>

          {open && (
            <div className="absolute left-0 right-0 top-full mt-1.5 z-40 rounded-xl border border-border bg-card shadow-2xl p-2 space-y-2 animate-in fade-in zoom-in-95 duration-150">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search MR#, project, requester..."
                  className="w-full rounded-md border border-border bg-background pl-8 pr-3 py-1.5 text-xs outline-none focus:border-primary font-medium"
                  autoFocus
                />
              </div>

              <div className="max-h-48 overflow-y-auto space-y-1">
                {filtered.length === 0 ? (
                  <div className="p-3 text-center text-xs text-muted-foreground">
                    {approvedMrs.length === 0 ? 'No approved MRs available.' : 'No matching approved MR found.'}
                  </div>
                ) : (
                  filtered.map((mr) => (
                    <button
                      key={mr.id}
                      type="button"
                      onClick={() => {
                        onSelectMr?.(mr.id);
                        setOpen(false);
                      }}
                      className="w-full text-left p-2 rounded-lg hover:bg-primary/10 transition-colors flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-bold text-primary font-mono">{mr.mr_number}</span>
                        <span className="text-[11px] text-muted-foreground block font-medium">
                          {mr.project_name || 'Main Site'} • {mr.requested_by || 'Site Team'}
                        </span>
                      </div>
                      <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 px-2 py-0.5 rounded">
                        {mr.lines.length} items
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onOpenAddMr}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-all shadow-xs"
        >
          <Layers className="h-3.5 w-3.5" /> + Add from Approved MR
        </button>
      </div>
    </div>
  );
}

import VarianceResolutionDrawer from '@/components/budget/variance-resolution-drawer';

export function PrForm(props: PrFormProps) {
  const { form, update, sourceChips, approvedMrs, onSelectMrFromDropdown, onOpenAddMr, onRemoveMr, budgetSnapshot, projectOptions } = props;
  const [showValidation, setShowValidation] = useState(false);
  const [isVarianceDrawerOpen, setIsVarianceDrawerOpen] = useState(false);

  const [activeWorkOrders, setActiveWorkOrders] = useState<any[]>([]);
  const [fetchingWorkOrders, setFetchingWorkOrders] = useState(false);

  useEffect(() => {
    async function loadWorkOrders() {
      setFetchingWorkOrders(true);
      try {
        const { data, error } = await supabase
          .from('work_orders')
          .select(`
            id,
            work_order_number,
            wo_status,
            vendor_id,
            vendors:vendor_id (
              id,
              display_name,
              legal_name,
              vendor_code
            )
          `)
          .eq('wo_status', 'active');
        if (!error && data) {
          setActiveWorkOrders(data);
        }
      } catch (e) {
        console.error('Error loading work orders:', e);
      } finally {
        setFetchingWorkOrders(false);
      }
    }
    loadWorkOrders();
  }, []);

  const summary = useMemo(() => computeCostSummary(form), [form]);
  const budgetAnalysis = useMemo(
    () =>
      analyzePrActivityBudgets(
        form.lines,
        props.masterBudgetCategories || [],
        props.activityResolution ?? new Map(),
      ),
    [form.lines, props.masterBudgetCategories, props.activityResolution],
  );
  const isOverBudget = budgetAnalysis.overallStatus === 'over_budget';

  const validation = useMemo(() => validatePrForm(form, isOverBudget), [form, isOverBudget]);
  const readOnly = Boolean(props.readOnly);

  // Real figures for the variance drawer. Previously this built a synthetic
  // `sampleVarianceItem` whose "actual" rate was the estimate x 1.2 and whose
  // cost/BUA divided by a hardcoded 615000 — a fabricated 20% overrun.
  const varianceContext = useMemo(() => {
    const firstLine = form.lines[0];
    const requestedQuantity = form.lines.reduce((sum, line) => sum + (line.pr_quantity || 0), 0);
    const requestedAmount = summary.totalEstimatedCost;
    return {
      scopeLabel:
        form.lines.length > 1
          ? `${form.lines.length} requested items (${firstLine?.item_description ?? 'PR scope'} + ${form.lines.length - 1} more)`
          : (firstLine?.item_description ?? 'PR requested items'),
      categoryLabel: form.activity_name || 'Purchase requisition scope',
      unit: firstLine?.unit || 'LS',
      availableBudget: Math.max(0, budgetSnapshot?.available ?? 0),
      requestedAmount,
      requestedQuantity: requestedQuantity || 1,
      requestedRate:
        requestedQuantity > 0 ? requestedAmount / requestedQuantity : (firstLine?.estimated_rate ?? 0),
    };
  }, [form.lines, form.activity_name, summary.totalEstimatedCost, budgetSnapshot?.available]);

  return (
    <>
      <fieldset disabled={readOnly} className="m-0 min-w-0 border-0 p-0 pb-24">
        {/* UNIFIED SINGLE FORM CARD CONTAINER */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-6">
          
          {/* Form Header Title */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
            <div>
              <h2 className="font-heading text-lg font-bold text-foreground">Purchase Requisition (PR)</h2>
              <p className="text-xs text-muted-foreground font-medium">Create or modify official purchase requisition entries</p>
            </div>

            <div className="flex items-center gap-3">
              <BudgetStatusBadge status={budgetAnalysis.overallStatus} />
              <PrStatusBadge status={form.status} />
            </div>
          </div>

          {/* Activity-Wise AI Budget Analysis Card */}
          {form.budget_applicable && (
            <PrActivityBudgetCard
              analysis={budgetAnalysis}
              resolving={props.activityResolving}
              modelError={props.activityModelError}
              usedModel={props.activityUsedModel}
              onResolveVariance={() => setIsVarianceDrawerOpen(true)}
              readOnly={readOnly}
            />
          )}

          {/* Validation Summary Banner */}
          {showValidation && validation.length > 0 && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-xs dark:border-amber-800 dark:bg-amber-950/30 shadow-xs animate-in fade-in">
              <p className="mb-1.5 flex items-center gap-1.5 font-bold text-amber-800 dark:text-amber-300 text-sm">
                <AlertTriangle className="h-4 w-4" /> Complete these before sending for verification:
              </p>
              <ul className="ml-5 list-disc space-y-1 text-amber-700 dark:text-amber-400 font-medium">
                {validation.map((e) => <li key={e}>{e}</li>)}
              </ul>
            </div>
          )}

          {/* Source MR Selector Sub-Header */}
          <div className="rounded-xl border border-border/60 bg-muted/20 p-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs font-bold text-foreground font-heading flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-primary" /> Source Material Requisition
              </span>
              {sourceChips.length === 0 && (
                <SearchableApprovedMrDropdown
                  approvedMrs={approvedMrs}
                  onSelectMr={onSelectMrFromDropdown}
                  onOpenAddMr={onOpenAddMr}
                />
              )}
            </div>

            {sourceChips.length === 0 ? (
              <p className="text-xs text-muted-foreground">No MR linked yet. Use <span className="font-semibold text-foreground">Add from Approved MR</span> to import approved items, or add manual items below.</p>
            ) : (
              <div className="flex flex-wrap gap-2 pt-1">
                {sourceChips.map((chip) => (
                  <div key={chip.mrId} className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-1.5 text-xs shadow-2xs">
                    <div>
                      <p className="font-bold text-primary font-mono">{chip.mrNumber}</p>
                      <p className="text-[11px] text-muted-foreground">{chip.projectName || '—'}{chip.activity ? ` · ${chip.activity}` : ''}</p>
                    </div>
                    <button onClick={() => onRemoveMr(chip.mrId)} title="Remove MR" className="rounded p-1 text-red-500 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/30">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>



          {/* Section 1: PR Identification & Details */}
          <div className="space-y-3">
            <div className="border-b border-border/60 pb-1.5 font-heading text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <FileText className="h-3.5 w-3.5 text-primary" /> PR Identification &amp; Details
            </div>
            
            <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-2 lg:grid-cols-4">
              <Field label="Purchase Requisition (PR) No."><div className={READONLY}>{form.pr_number || 'Auto'}</div></Field>
              <Field label="P.R. Date" required><input type="date" value={form.pr_date} onChange={(e) => update({ pr_date: e.target.value })} className={FIELD} /></Field>
              <Field label="Name of Company" required><input value={form.company_name} onChange={(e) => update({ company_name: e.target.value })} placeholder="From selected MR" className={FIELD} /></Field>
              <Field label="Project Name" required>
                <select value={form.project_id} onChange={(e) => update({ project_id: e.target.value })} className={FIELD}>
                  <option value="">Select project…</option>
                  {projectOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
              <Field label="Site" required>
                <input
                  value={form.delivery_address}
                  onChange={(e) => update({ delivery_address: e.target.value })}
                  placeholder="Auto-filled from MR Site Info"
                  className={FIELD}
                />
              </Field>

              <Field label="Contractor / Service Provider Name">
                <input
                  value={form.contractor_name}
                  onChange={(e) => update({ contractor_name: e.target.value, contractor_applicable: true })}
                  placeholder="Contractor / Service Provider Name"
                  className={FIELD}
                />
              </Field>
              <Field label="Work Order No.">
                <WorkOrderSearchableSelect
                  value={form.contract_reference}
                  workOrders={activeWorkOrders}
                  onChange={(wo) => {
                    const contractorName = wo.vendors?.display_name || wo.vendors?.legal_name || '';
                    update({
                      contract_reference: wo.work_order_number,
                      contractor_name: contractorName,
                      contractor_applicable: true,
                      vendor_code: wo.vendors?.vendor_code || '',
                    });
                  }}
                  disabled={readOnly}
                />
              </Field>

              <Field label="PR Type">
                <select value={form.pr_type} onChange={(e) => update({ pr_type: e.target.value as PrFormState['pr_type'] })} className={FIELD}>
                  {PR_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
              <Field label="Priority">
                <select value={form.priority} onChange={(e) => update({ priority: e.target.value as PrFormState['priority'] })} className={FIELD}>
                  {PR_PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
              <Field label="Required By Date" required><input type="date" value={form.required_date} onChange={(e) => update({ required_date: e.target.value })} className={FIELD} /></Field>
            </div>
          </div>

          {/* Section 2: Material Request Entries / Item Details Table */}
          <div className="space-y-3 pt-2">
            <div className="border-b border-border/60 pb-1.5 font-heading text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Layers className="h-3.5 w-3.5 text-primary" /> Material Request Entries ({form.lines.length} line items)
              </span>
            </div>

            <PrItemTable
              lines={form.lines}
              onChangeLine={props.onChangeLine}
              onRemoveLine={props.onRemoveLine}
              onAddManual={props.onAddManualLine}
              onBulkRequiredDate={props.onBulkRequiredDate}
              onBulkDeliveryLocation={props.onBulkDeliveryLocation}
              dbItems={props.dbItems || []}
              itemGroups={props.itemGroups || []}
              budgetData={props.budgetData || { activities: [], subActivitiesByCategory: {} }}
            />
          </div>

          {/* Section 3: Delivery & Additional Information */}
          <div className="space-y-3 pt-2">
            <div className="border-b border-border/60 pb-1.5 font-heading text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Truck className="h-3.5 w-3.5 text-primary" /> Delivery &amp; Additional Information
            </div>

            <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <Field label="Delivery Address" required>
                  <textarea value={form.delivery_address} onChange={(e) => update({ delivery_address: e.target.value })} rows={2} className={FIELD} />
                </Field>
              </div>
              <Field label="Site Contact Person">
                <input value={form.site_contact_person} onChange={(e) => update({ site_contact_person: e.target.value })} className={FIELD} />
              </Field>
              <Field label="Site Contact Number">
                <input value={form.site_contact_number} onChange={(e) => update({ site_contact_number: e.target.value })} className={FIELD} />
              </Field>
              <div className="md:col-span-2">
                <Field label="General Remarks / MR Justification">
                  <textarea value={form.general_remarks} onChange={(e) => update({ general_remarks: e.target.value })} rows={2} placeholder="Remarks / Justification from Material Request" className={FIELD} />
                </Field>
              </div>
            </div>
          </div>

          {/* Section 4: Release & Verification Parameters */}
          <div className="space-y-3 pt-4 border-t border-border/60">
            <div className="font-heading text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Bot className="h-3.5 w-3.5 text-primary" /> Release &amp; Verification Parameters
            </div>

            <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-2 lg:grid-cols-4">
              <Field label="Unlocked Project">
                <input
                  type="number"
                  step="0.01"
                  value={form.unlocked_project ?? 1.00}
                  onChange={(e) => update({ unlocked_project: Number(e.target.value) })}
                  className={FIELD}
                />
              </Field>

              <Field label="Prepared By (PR Creator)">
                <input
                  type="text"
                  value={
                    (form.prepared_by && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(form.prepared_by) ? form.prepared_by : null) ??
                    (form.department && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(form.department) ? form.department : null) ??
                    'Rohan Mehta (Site Eng)'
                  }
                  onChange={(e) => update({ prepared_by: e.target.value, department: e.target.value })}
                  placeholder="PR Creator Name"
                  className={FIELD}
                />
              </Field>

              <Field label="MR Raised By">
                <input
                  type="text"
                  value={form.mr_raised_by || form.lines[0]?.raised_by || 'Rohan Mehta (Site Eng)'}
                  onChange={(e) => update({ mr_raised_by: e.target.value })}
                  placeholder="Material Request Requester"
                  className={FIELD}
                />
              </Field>

              <Field label="PR Release Date">
                <input
                  type="text"
                  value={form.pr_release_date ?? '20/07/2026 16:29'}
                  onChange={(e) => update({ pr_release_date: e.target.value })}
                  placeholder="20/07/2026 16:29"
                  className={FIELD}
                />
              </Field>

              <Field label="Status">
                <select
                  value={form.status}
                  onChange={(e) => update({ status: e.target.value as any })}
                  className={FIELD}
                >
                  <option value="draft">Draft</option>
                  <option value="under_verification">Verified by Site Engineer</option>
                  <option value="awaiting_assignment">Awaiting Assignment</option>
                  <option value="pending_approval">Pending Approval</option>
                  <option value="approved">Approved</option>
                  <option value="returned_to_draft">Returned to Draft</option>
                  <option value="revision_required">Revision Required</option>
                  <option value="rejected">Rejected</option>
                  <option value="on_hold">On Hold</option>
                  <option value="closed">Closed</option>
                  <option value="auto_draft_pr">Auto-Draft</option>
                </select>
              </Field>
            </div>
          </div>

        </div>
      </fieldset>

      {/* Sticky contextual action bar */}
      <div className="sticky bottom-0 z-30 -mx-4 border-t border-border bg-card/95 px-4 shadow-[0_-4px_12px_rgba(0,0,0,0.04)] backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-2 py-2.5">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <button onClick={props.onCancel} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 font-bold text-foreground hover:bg-muted transition-colors cursor-pointer"><X className="h-3.5 w-3.5" /> Close</button>
            {props.secondaryActions}
            {props.lastSavedAt && <span className="ml-1 text-[11px]">Last saved {props.lastSavedAt}</span>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {props.actions}

          </div>
        </div>
      </div>

      {/* Mounted only while open: the drawer has no isOpen prop, so its hooks can
          never change order between renders (that was the original crash). */}
      {isVarianceDrawerOpen && (
      <VarianceResolutionDrawer
        onClose={() => setIsVarianceDrawerOpen(false)}
        scopeLabel={varianceContext.scopeLabel}
        categoryLabel={varianceContext.categoryLabel}
        unit={varianceContext.unit}
        availableBudget={varianceContext.availableBudget}
        requestedAmount={varianceContext.requestedAmount}
        requestedQuantity={varianceContext.requestedQuantity}
        requestedRate={varianceContext.requestedRate}
        onSelectAction={(action, details) => {
          // The resolution is captured on the PR itself, so it travels with the
          // document through approval instead of only firing an alert().
          if (action === 'revise_budget') {
            update({
              over_budget_justification:
                details.remarks || 'Budget revision requested for over-budget PR.',
            });
          } else if (action === 'update_quantity' && details.newQuantity !== undefined) {
            update({
              general_remarks: [form.general_remarks, details.remarks].filter(Boolean).join(' '),
              over_budget_justification:
                details.remarks || `Quantity reduced to ${details.newQuantity} ${varianceContext.unit}.`,
            });
          } else {
            update({
              general_remarks: [form.general_remarks, details.remarks].filter(Boolean).join(' '),
              over_budget_justification: details.remarks || 'Value engineering / vendor change.',
            });
          }
        }}
      />
      )}
    </>
  );
}
