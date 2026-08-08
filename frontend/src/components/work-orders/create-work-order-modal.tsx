'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, ClipboardCheck, Plus, Trash2, Paperclip } from 'lucide-react';
import {
  createWorkOrder,
  listBudgetHeads,
  listMasterBudgetLines,
  isBudgetHeadRequiredForIssue,
  type CreateWorkOrderLineInput,
  type BudgetHeadOption,
  type MasterBudgetLineOption,
} from '@/lib/work-orders';
import { listWoTemplates, type WoTemplateRow } from '@/lib/wo-templates';
import { listAgencies, findOrCreateAgency, type SiteAgencyRow } from '@/lib/site-agencies';
import { getSiteActivities } from '@/lib/site-activities';
import { uploadEntityAttachment } from '@/lib/documents';
import { useAppStore } from '@/store/use-app-store';
import { formatIndianCurrency } from '@/utils/format-currency';
import { supabase } from '@/utils/supabase-client';

export type CreateWorkOrderModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

type DraftLine = CreateWorkOrderLineInput & { key: string; itemName?: string };

function emptyLine(): DraftLine {
  return { key: Math.random().toString(36).slice(2), itemName: '', description: '', quantity: 0, unit: '', rate: 0 };
}

export function CreateWorkOrderModal({ isOpen, onClose, onSuccess }: CreateWorkOrderModalProps) {
  const { activeProjectId, projects } = useAppStore();
  const projectId = activeProjectId || projects[0]?.id;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [templates, setTemplates] = useState<WoTemplateRow[]>([]);
  const [agencies, setAgencies] = useState<SiteAgencyRow[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [budgetHeads, setBudgetHeads] = useState<BudgetHeadOption[]>([]);
  const [masterLines, setMasterLines] = useState<MasterBudgetLineOption[]>([]);
  const [budgetHeadRequired, setBudgetHeadRequired] = useState(true);

  const [templateId, setTemplateId] = useState('');
  const [agencyName, setAgencyName] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [billingAddress, setBillingAddress] = useState('');
  const [gstNumber, setGstNumber] = useState('');
  const [vendors, setVendors] = useState<any[]>([]);
  const [showVendorDropdown, setShowVendorDropdown] = useState(false);
  const [isAutoWoNumber, setIsAutoWoNumber] = useState(true);
  
  const [tradeCategory, setTradeCategory] = useState('');
  const [activityId, setActivityId] = useState('');
  const [workOrderNumber, setWorkOrderNumber] = useState('[AUTO-GENERATED]');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [scopeOfWork, setScopeOfWork] = useState('');
  const [woType, setWoType] = useState<'fixed_scope' | 'rate_based'>('fixed_scope');
  const [budgetAllocationId, setBudgetAllocationId] = useState('');
  const [masterBudgetItemId, setMasterBudgetItemId] = useState('');
  const [taxInclusive, setTaxInclusive] = useState(false);
  /**
   * Not-to-exceed value for a rate-based contract. Summing bare rates (as the
   * total below does for fixed-scope) is meaningless when there are no
   * quantities, so the ceiling is what gets encumbered.
   */
  const [ceilingAmount, setCeilingAmount] = useState(0);
  const [termsBaseline, setTermsBaseline] = useState('');
  const [termsCategory, setTermsCategory] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [attachments, setAttachments] = useState<File[]>([]);

  useEffect(() => {
    if (!isOpen || !projectId) return;
    listWoTemplates().then(setTemplates).catch(() => setTemplates([]));
    listAgencies(projectId).then(setAgencies).catch(() => setAgencies([]));
    getSiteActivities(projectId).then(setActivities).catch(() => setActivities([]));
    listBudgetHeads(projectId).then(setBudgetHeads).catch(() => setBudgetHeads([]));
    listMasterBudgetLines(projectId).then(setMasterLines).catch(() => setMasterLines([]));
    // Mirrors budget_config.wo_unbudgeted_enforcement, so the form asks for the
    // head up front rather than letting the DB reject the issue action later.
    isBudgetHeadRequiredForIssue(projectId).then(setBudgetHeadRequired).catch(() => setBudgetHeadRequired(true));
    
    // Fetch active vendors list from Supabase
    supabase.from('vendors')
      .select('id, legal_name, display_name, address, gst_number')
      .eq('is_active', true)
      .order('legal_name')
      .then(({ data }) => setVendors(data || []));
  }, [isOpen, projectId]);

  const filteredVendors = useMemo(() => {
    if (!agencyName.trim()) return vendors.slice(0, 10);
    return vendors.filter(v => {
      const vName = (v.display_name || v.legal_name || '').toLowerCase();
      return vName.includes(agencyName.toLowerCase());
    }).slice(0, 10);
  }, [vendors, agencyName]);

  const selectedTemplate = useMemo(() => templates.find((t) => t.id === templateId) || null, [templates, templateId]);
  const selectedHead = useMemo(
    () => budgetHeads.find((h) => h.id === budgetAllocationId) || null,
    [budgetHeads, budgetAllocationId],
  );

  function applyTemplate(id: string) {
    setTemplateId(id);
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    setTradeCategory(tpl.trade_category);
    setWoType(tpl.default_wo_type);
    setTermsBaseline(tpl.terms_baseline || '');
    setTermsCategory(tpl.terms_category || '');
  }

  /**
   * Picking a Master Budget line implies its budget head — the database resolves
   * it the same way at issue time, so pre-filling here keeps the form honest
   * about which head will actually be charged.
   */
  function applyMasterLine(id: string) {
    setMasterBudgetItemId(id);
    if (!id) return;
    const line = masterLines.find((l) => l.id === id);
    if (!line?.categoryId) return;
    const head = budgetHeads.find((h) => h.categoryId === line.categoryId);
    if (head) setBudgetAllocationId(head.id);
  }

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev));
  }

  const totalAmount = lines.reduce((sum, l) => sum + (woType === 'fixed_scope' ? (l.quantity ?? 0) * l.rate : l.rate), 0);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId) {
      setError('No active project selected.');
      return;
    }
    if (!agencyName.trim()) {
      setError('Agency is mandatory.');
      return;
    }
    if (!tradeCategory.trim()) {
      setError('Trade / scope of work is mandatory.');
      return;
    }
    if (!workOrderNumber.trim() && !isAutoWoNumber) {
      setError('WO number is mandatory.');
      return;
    }
    if (lines.some((l) => !l.description.trim())) {
      setError('Every item line needs a description.');
      return;
    }


    setLoading(true);
    setError(null);

    try {
      const agency = await findOrCreateAgency({ projectId, agencyName, tradeCategory });

      const result = await createWorkOrder({
        projectId,
        agencyId: agency.id,
        vendorId: vendorId || undefined,
        activityId: activityId || undefined,
        templateId: templateId || undefined,
        workOrderNumber: isAutoWoNumber ? '[AUTO-GENERATED]' : workOrderNumber,
        scopeOfWork: scopeOfWork || tradeCategory,
        woType,
        issueDate,
        termsAndConditions: [termsBaseline, termsCategory].filter(Boolean).join('\n\n'),
        budgetAllocationId: budgetAllocationId || undefined,
        masterBudgetItemId: masterBudgetItemId || undefined,
        taxInclusive,
        ceilingAmount: woType === 'rate_based' ? ceilingAmount : undefined,
        lines: lines.map((l) => ({
          description: l.itemName ? `${l.itemName} - ${l.description}` : l.description,
          quantity: l.quantity,
          unit: l.unit,
          rate: l.rate,
        })),
        billingAddress: billingAddress || undefined,
        gstNumber: gstNumber || undefined,
      });

      if (result.error) throw result.error;
      const workOrderId = result.data!.id;

      for (const file of attachments) {
        await uploadEntityAttachment(projectId, 'work_orders', workOrderId, 'wo_supporting_document', file);
      }

      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create Work Order.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-4xl rounded-xl bg-card border border-border shadow-2xl flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold">New Work Order</h2>
          </div>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-muted text-muted-foreground transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700 border border-red-200">{error}</div>
          )}

          <form id="create-work-order-form" onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Format / Template (one of the 15)</label>
              <select value={templateId} onChange={(e) => applyTemplate(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="">Start blank…</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.trade_category} — {t.name}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Searchable Agency ComboBox */}
              <div className="space-y-1 relative">
                <label className="text-xs font-semibold text-muted-foreground">Agency Name / Company <span className="text-red-500">*</span></label>
                <input
                  required
                  type="text"
                  value={agencyName}
                  onChange={(e) => {
                    setAgencyName(e.target.value);
                    setShowVendorDropdown(true);
                    const match = vendors.find(v => (v.display_name || v.legal_name || '').toLowerCase() === e.target.value.toLowerCase());
                    if (match) {
                      setVendorId(match.id);
                      setBillingAddress(match.address || '');
                      setGstNumber(match.gst_number || '');
                    } else {
                      setVendorId('');
                    }
                  }}
                  onFocus={() => setShowVendorDropdown(true)}
                  onBlur={() => {
                    setTimeout(() => setShowVendorDropdown(false), 200);
                  }}
                  placeholder="Search agency from Vendor Master or type name"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
                {showVendorDropdown && filteredVendors.length > 0 && (
                  <div className="absolute left-0 right-0 z-50 mt-1 max-h-48 overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
                    {filteredVendors.map((v) => {
                      const vName = v.display_name || v.legal_name || 'Unnamed Vendor';
                      return (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => {
                            setAgencyName(vName);
                            setVendorId(v.id);
                            setBillingAddress(v.address || '');
                            setGstNumber(v.gst_number || '');
                            setShowVendorDropdown(false);
                          }}
                          className="w-full px-3 py-2 text-left text-xs hover:bg-accent hover:text-accent-foreground border-b border-border last:border-0 flex flex-col gap-0.5"
                        >
                          <span className="font-bold text-foreground">{vName}</span>
                          {v.gst_number && <span className="text-[10px] text-muted-foreground">GST: {v.gst_number}</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Trade / Scope of Work <span className="text-red-500">*</span></label>
                <input
                  required
                  type="text"
                  value={tradeCategory}
                  onChange={(e) => setTradeCategory(e.target.value)}
                  placeholder="e.g. Plumbing Works"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>

            {/* Editable Address & GST Number columns */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1 col-span-2">
                <label className="text-xs font-semibold text-muted-foreground">Billing Address</label>
                <textarea
                  rows={2}
                  value={billingAddress}
                  onChange={(e) => setBillingAddress(e.target.value)}
                  placeholder="Billing address of the agency"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">GST Number</label>
                <input
                  type="text"
                  value={gstNumber}
                  onChange={(e) => setGstNumber(e.target.value)}
                  placeholder="GSTIN (e.g. 24AFSPP8397L1ZB)"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm uppercase"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Site / Tower / Activity</label>
                <select value={activityId} onChange={(e) => setActivityId(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="">Unassigned</option>
                  {activities.map((a) => (
                    <option key={a.id} value={a.id}>{a.title}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">WO Number <span className="text-red-500">*</span></label>
                <div className="relative flex items-center">
                  <input
                    required
                    type="text"
                    disabled={isAutoWoNumber}
                    value={isAutoWoNumber ? '[AUTO-GENERATED]' : workOrderNumber}
                    onChange={(e) => setWorkOrderNumber(e.target.value)}
                    placeholder="AC/WO/2026/011"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm uppercase pr-16 disabled:opacity-75 disabled:bg-muted font-bold text-primary"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const nextVal = !isAutoWoNumber;
                      setIsAutoWoNumber(nextVal);
                      if (nextVal) {
                        setWorkOrderNumber('[AUTO-GENERATED]');
                      } else {
                        setWorkOrderNumber('');
                      }
                    }}
                    className="absolute right-1 top-1 bottom-1 px-2.5 text-[9px] font-bold uppercase rounded bg-muted hover:bg-muted/80 text-muted-foreground border border-border"
                  >
                    {isAutoWoNumber ? 'Manual' : 'Auto'}
                  </button>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Issue Date</label>
                <input
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">WO Type <span className="text-red-500">*</span></label>
              <div className="flex gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" checked={woType === 'fixed_scope'} onChange={() => setWoType('fixed_scope')} />
                  Fixed-scope (defined quantity)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" checked={woType === 'rate_based'} onChange={() => setWoType('rate_based')} />
                  Rate-based (quantity at execution)
                </label>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold">Work Order Items (BOQ)</h3>
                <button type="button" onClick={addLine} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                  <Plus className="h-3.5 w-3.5" /> Add line
                </button>
              </div>
              
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-muted/50 font-heading font-bold text-muted-foreground uppercase border-b border-border text-[10px]">
                    <tr>
                      <th className="px-3 py-2 text-center w-[40px]">Sr</th>
                      <th className="px-3 py-2 min-w-[150px]">Item / Service Description</th>
                      <th className="px-3 py-2 min-w-[240px]">Work Description & Specification</th>
                      {woType === 'fixed_scope' && <th className="px-3 py-2 text-right w-[80px]">Qty</th>}
                      <th className="px-3 py-2 w-[80px]">Unit</th>
                      <th className="px-3 py-2 text-right w-[110px]">Rate (₹)</th>
                      {woType === 'fixed_scope' && <th className="px-3 py-2 text-right w-[110px]">Amount (₹)</th>}
                      <th className="px-3 py-2 text-center w-[40px]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, idx) => (
                      <tr key={line.key} className="border-b border-border last:border-0 hover:bg-muted/10">
                        <td className="px-3 py-2 text-center font-semibold text-muted-foreground">{idx + 1}</td>
                        <td className="px-2 py-1.5">
                          <input
                            required
                            type="text"
                            placeholder="e.g. Concrete, AC"
                            value={line.itemName || ''}
                            onChange={(e) => updateLine(line.key, { itemName: e.target.value })}
                            className="w-full rounded border border-input bg-background px-2 py-1 text-xs"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <textarea
                            required
                            rows={1}
                            placeholder="Detailed specifications"
                            value={line.description}
                            onChange={(e) => updateLine(line.key, { description: e.target.value })}
                            className="w-full rounded border border-input bg-background px-2 py-1 text-xs resize-y"
                          />
                        </td>
                        {woType === 'fixed_scope' && (
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
                        )}
                        <td className="px-2 py-1.5">
                          <input
                            required
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
                        {woType === 'fixed_scope' && (
                          <td className="px-3 py-2 text-right font-semibold">
                            {formatIndianCurrency((line.quantity || 0) * line.rate)}
                          </td>
                        )}
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
                    ))}
                  </tbody>
                </table>
              </div>

              {woType === 'fixed_scope' && (
                <div className="mt-2 text-right text-sm font-bold bg-muted/30 p-2.5 rounded-lg border border-border">
                  Total WO Value: <span className="text-primary text-base font-extrabold">{formatIndianCurrency(totalAmount)}</span>
                </div>
              )}
              {woType === 'rate_based' && (
                <div className="mt-2 space-y-1.5 bg-amber-50 dark:bg-amber-950/20 p-3 rounded-lg border border-amber-200/50">
                  <p className="text-[11px] text-muted-foreground">
                    Rate-based WO — quantities are determined at execution against these rates.
                  </p>
                  <label className="block">
                    <span className="text-xs font-semibold text-muted-foreground">
                      Ceiling (not-to-exceed) value <span className="text-red-500">*</span>
                    </span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={ceilingAmount}
                      onChange={(e) => setCeilingAmount(Number(e.target.value))}
                      className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                    />
                  </label>
                  <p className="text-[11px] text-amber-700 dark:text-amber-400 font-semibold">
                    Required to issue. This is the value the budget is encumbered at.
                  </p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Terms & Conditions — baseline block</label>
                <textarea
                  rows={5}
                  value={termsBaseline}
                  onChange={(e) => setTermsBaseline(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Terms & Conditions — category-specific (appendable)</label>
                <textarea
                  rows={5}
                  value={termsCategory}
                  onChange={(e) => setTermsCategory(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                <Paperclip className="h-3.5 w-3.5" /> Attachments (measurement sheets, quotations, scanned pages)
              </label>
              <input
                type="file"
                multiple
                onChange={(e) => setAttachments(Array.from(e.target.files || []))}
                className="w-full text-xs"
              />
              {selectedTemplate?.source_file_name && (
                <p className="text-[11px] text-muted-foreground">Based on format: {selectedTemplate.source_file_name}</p>
              )}
            </div>
          </form>
        </div>

        <div className="border-t border-border p-4 flex justify-end gap-3 bg-muted/20">
          <button type="button" onClick={onClose} disabled={loading} className="px-4 py-2 text-sm font-semibold rounded-md border border-border hover:bg-muted transition-colors">
            Cancel
          </button>
          <button type="submit" form="create-work-order-form" disabled={loading} className="px-4 py-2 text-sm font-semibold rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center gap-2">
            {loading ? <span className="animate-spin">⏳</span> : <ClipboardCheck className="h-4 w-4" />}
            Save Draft
          </button>
        </div>
      </div>
    </div>
  );
}
