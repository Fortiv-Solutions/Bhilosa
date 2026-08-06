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

export type CreateWorkOrderModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

type DraftLine = CreateWorkOrderLineInput & { key: string };

function emptyLine(): DraftLine {
  return { key: Math.random().toString(36).slice(2), description: '', quantity: 0, unit: '', rate: 0 };
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
  const [tradeCategory, setTradeCategory] = useState('');
  const [activityId, setActivityId] = useState('');
  const [workOrderNumber, setWorkOrderNumber] = useState('');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [scopeOfWork, setScopeOfWork] = useState('');
  const [woType, setWoType] = useState<'fixed_scope' | 'rate_based'>('fixed_scope');
  const [budgetAllocationId, setBudgetAllocationId] = useState('');
  const [masterBudgetItemId, setMasterBudgetItemId] = useState('');
  const [taxInclusive, setTaxInclusive] = useState(false);
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
  }, [isOpen, projectId]);

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
    if (!workOrderNumber.trim()) {
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
        activityId: activityId || undefined,
        templateId: templateId || undefined,
        workOrderNumber,
        scopeOfWork: scopeOfWork || tradeCategory,
        woType,
        issueDate,
        termsAndConditions: [termsBaseline, termsCategory].filter(Boolean).join('\n\n'),
        budgetAllocationId: budgetAllocationId || undefined,
        masterBudgetItemId: masterBudgetItemId || undefined,
        taxInclusive,
        lines: lines.map(({ key, ...rest }) => rest),
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
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Agency <span className="text-red-500">*</span></label>
                <input
                  required
                  list="wo-agency-options"
                  type="text"
                  value={agencyName}
                  onChange={(e) => setAgencyName(e.target.value)}
                  placeholder="Type to search or add a new agency"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
                <datalist id="wo-agency-options">
                  {agencies.map((a) => (
                    <option key={a.id} value={a.agency_name} />
                  ))}
                </datalist>
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
                <input
                  required
                  type="text"
                  value={workOrderNumber}
                  onChange={(e) => setWorkOrderNumber(e.target.value)}
                  placeholder="AC/WO/2026/011"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm uppercase"
                />
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
                <h3 className="text-sm font-semibold">Item / Service Description</h3>
                <button type="button" onClick={addLine} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                  <Plus className="h-3.5 w-3.5" /> Add line
                </button>
              </div>
              <div className="space-y-2">
                {lines.map((line) => (
                  <div key={line.key} className="grid grid-cols-12 gap-2 items-center">
                    <input
                      className="col-span-5 rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                      placeholder="Work description"
                      value={line.description}
                      onChange={(e) => updateLine(line.key, { description: e.target.value })}
                    />
                    <input
                      className="col-span-2 rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                      placeholder="Unit"
                      value={line.unit}
                      onChange={(e) => updateLine(line.key, { unit: e.target.value })}
                    />
                    {woType === 'fixed_scope' && (
                      <input
                        type="number"
                        className="col-span-2 rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                        placeholder="Qty"
                        value={line.quantity}
                        onChange={(e) => updateLine(line.key, { quantity: Number(e.target.value) })}
                      />
                    )}
                    <input
                      type="number"
                      className={`${woType === 'fixed_scope' ? 'col-span-2' : 'col-span-4'} rounded-md border border-input bg-background px-2 py-1.5 text-xs`}
                      placeholder="Rate"
                      value={line.rate}
                      onChange={(e) => updateLine(line.key, { rate: Number(e.target.value) })}
                    />
                    <button type="button" onClick={() => removeLine(line.key)} className="col-span-1 text-red-500 hover:text-red-700">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
              {woType === 'fixed_scope' && (
                <div className="mt-2 text-right text-sm font-bold">WO Value: {formatIndianCurrency(totalAmount)}</div>
              )}
              {woType === 'rate_based' && (
                <p className="mt-2 text-[11px] text-muted-foreground">Rate-based WO — quantity and total value are determined at execution against these rates.</p>
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
