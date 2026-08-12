'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { X, ClipboardCheck, Plus, Trash2, Paperclip, ChevronDown, Search, Check, Layers, GitBranch, FileText, Building2 } from 'lucide-react';
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
import { isLiveSupabase } from '@/lib/erp/supabase-modules';

export type CreateWorkOrderModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

type DraftLine = CreateWorkOrderLineInput & { key: string; itemName?: string; gstPercentage?: number };

function emptyLine(): DraftLine {
  return { key: Math.random().toString(36).slice(2), itemName: '', description: '', quantity: 0, unit: '', rate: 0, gstPercentage: 18 };
}

/* ─── Searchable Combobox: Format / Template ─────────────────────────── */
function TemplateCombobox({
  templates,
  value,
  onChange,
}: {
  templates: WoTemplateRow[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = templates.find((t) => t.id === value);
  const filtered = useMemo(() => {
    if (!query.trim()) return templates;
    const q = query.toLowerCase();
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.trade_category || '').toLowerCase().includes(q),
    );
  }, [templates, query]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="space-y-1 relative" ref={ref}>
      <label className="text-xs font-semibold text-muted-foreground">
        Format / Template (one of the {templates.length})
      </label>
      <div
        onClick={() => {
          setOpen(!open);
          if (!open) setTimeout(() => inputRef.current?.focus(), 50);
        }}
        className={`flex items-center justify-between gap-2 px-3 py-2 text-xs bg-background border rounded-xl cursor-pointer transition-all ${
          open
            ? 'border-primary ring-2 ring-primary/20 shadow-md'
            : 'border-input hover:border-muted-foreground/40'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <FileText className="w-4 h-4 text-primary shrink-0" />
          {selected ? (
            <div className="truncate">
              <span className="font-bold text-foreground mr-2">[{selected.trade_category}]</span>
              <span className="text-foreground font-medium">{selected.name}</span>
            </div>
          ) : (
            <span className="text-muted-foreground font-normal truncate">Start blank…</span>
          )}
        </div>

        <ChevronDown
          className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </div>

      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1.5 bg-popover border border-border rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[320px] animate-in fade-in-50 zoom-in-95 duration-100">
          <div className="p-2.5 border-b border-border bg-muted/40 flex items-center gap-2">
            <Search className="w-4 h-4 text-muted-foreground ml-1 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search templates…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none font-medium"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="p-1 hover:bg-muted rounded-full text-muted-foreground"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="overflow-y-auto flex-1 divide-y divide-border/30">
            <button
              type="button"
              onClick={() => {
                onChange('');
                setOpen(false);
              }}
              className={`w-full px-3.5 py-2.5 text-left text-xs hover:bg-primary/10 hover:text-primary transition-colors flex items-center justify-between ${
                !value ? 'bg-primary/10 font-bold text-primary' : 'text-muted-foreground'
              }`}
            >
              <span>Start blank…</span>
              {!value && <Check className="w-4 h-4 text-primary shrink-0" />}
            </button>
            {filtered.length === 0 && (
              <div className="p-4 text-center text-xs text-muted-foreground">
                No templates match &ldquo;{query}&rdquo;
              </div>
            )}
            {filtered.map((t) => {
              const isSelected = value === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    onChange(t.id);
                    setOpen(false);
                  }}
                  className={`w-full px-3.5 py-2.5 text-left text-xs hover:bg-primary/10 hover:text-primary transition-colors flex items-center justify-between gap-2 ${
                    isSelected ? 'bg-primary/10 text-primary font-bold' : 'text-foreground'
                  }`}
                >
                  <div className="truncate">
                    <span className="font-bold mr-1.5">[{t.trade_category}]</span>
                    <span>{t.name}</span>
                    {t.terms_category && (
                      <span className="block text-[10px] text-muted-foreground truncate font-normal">
                        {t.terms_category}
                      </span>
                    )}
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-primary shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Typo-Tolerant & Partial Text Fuzzy Matching Helper ───────────────── */
function fuzzyMatch(text: string, query: string): boolean {
  if (!query) return true;
  const normText = text.toLowerCase().trim();
  const normQuery = query.toLowerCase().trim();

  // 1. Direct substring match (exact partial match)
  if (normText.includes(normQuery)) return true;

  // 2. Tokenized match (all query words present in text)
  const queryTokens = normQuery.split(/\s+/).filter(Boolean);
  const textTokens = normText.split(/\s+/).filter(Boolean);
  const allTokensMatch = queryTokens.every((qt) =>
    textTokens.some((tt) => tt.includes(qt) || LevenshteinDistance(tt, qt) <= 1),
  );
  if (allTokensMatch) return true;

  // 3. Subsequence match (handles minor typos)
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

/* ─── Searchable Combobox: Budget Head Activity (Type-to-Search) ────────── */
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
  const [displayQuery, setDisplayQuery] = useState(selected?.allocationName || selected?.categoryName || '');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sel = budgetHeads.find((b) => b.id === value);
    setDisplayQuery(sel ? sel.allocationName || sel.categoryName || '' : '');
  }, [value, budgetHeads]);

  const filtered = useMemo(() => {
    if (!displayQuery.trim() || (selected && (selected.allocationName === displayQuery || selected.categoryName === displayQuery))) {
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
      <label className="text-xs font-semibold text-muted-foreground">Activity (Budget Head)</label>
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
                  <span className="whitespace-normal break-words leading-snug flex-1 font-medium">{name}</span>
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

/* ─── Searchable Combobox: Sub-Activity (Type-to-Search) ──────────────── */
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
        return m.categoryName.toLowerCase() === selectedHead.categoryName.toLowerCase();
      }
      if (selectedHead.allocationName && m.categoryName) {
        return m.categoryName.toLowerCase() === selectedHead.allocationName.toLowerCase();
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
          placeholder={selectedHead ? 'Type to search sub-activities…' : 'Select Activity first…'}
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
  /** The vendor master load was silently swallowing its error, so a failed or
      empty read looked identical to a control that simply would not open. */
  const [vendorsLoading, setVendorsLoading] = useState(false);
  const [vendorsError, setVendorsError] = useState<string | null>(null);
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
  const [gstPercentage, setGstPercentage] = useState<number>(18);
  /**
   * Not-to-exceed value for a rate-based contract. Summing bare rates (as the
   * total below does for fixed-scope) is meaningless when there are no
   * quantities, so the ceiling is what gets encumbered.
   */
  const [ceilingAmount, setCeilingAmount] = useState(0);
  const [termsBaseline, setTermsBaseline] = useState('');
  const [termsCategory, setTermsCategory] = useState('');
  const [valuationStructure, setValuationStructure] = useState<'standard' | 'stage_percentage' | 'floor_lead'>('standard');
  const [leadPercentPerFloor, setLeadPercentPerFloor] = useState(7);
  const [stages, setStages] = useState<Array<{ id: string; name: string; percent: number }>>([
    { id: '1', name: 'Inlet Fitting Work', percent: 20 },
    { id: '2', name: 'Internal Drainage Line Work', percent: 10 },
    { id: '3', name: 'Water Proofing Work', percent: 25 },
    { id: '4', name: 'External Vertical Line Work', percent: 20 },
    { id: '5', name: 'Terrace Looping Work', percent: 10 },
    { id: '6', name: 'CP Fitting Work', percent: 7.5 },
    { id: '7', name: 'Sanitary Fitting Work', percent: 7.5 },
  ]);
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [attachments, setAttachments] = useState<File[]>([]);

  useEffect(() => {
    if (!isOpen || !projectId) return;
    listWoTemplates().then(setTemplates).catch(() => setTemplates([]));
    listAgencies(projectId).then(setAgencies).catch(() => setAgencies([]));
    getSiteActivities(projectId).then(setActivities).catch(() => setActivities([]));
    listBudgetHeads(projectId).then(setBudgetHeads).catch(() => setBudgetHeads([]));
    listMasterBudgetLines(projectId).then(setMasterLines).catch(() => setMasterLines([]));
    isBudgetHeadRequiredForIssue(projectId).then(setBudgetHeadRequired).catch(() => setBudgetHeadRequired(true));
    
    // Vendor master. Mirrors listBillableVendors(): active, not soft-deleted,
    // contractors first — and it reports failure instead of hiding it.
    setVendorsLoading(true);
    setVendorsError(null);
    if (!isLiveSupabase()) {
      setVendors([]);
      setVendorsLoading(false);
      setVendorsError('Supabase is not configured, so the vendor master cannot be read.');
    } else {
      supabase
        .from('vendors')
        .select('id, legal_name, display_name, address, gst_number, vendor_code, vendor_type')
        .eq('is_active', true)
        .is('deleted_at', null)
        .order('legal_name')
        .then(({ data, error }) => {
          setVendorsLoading(false);
          if (error) {
            setVendors([]);
            setVendorsError(error.message);
            return;
          }
          const rank = (t: string) => (t === 'contractor' ? 0 : t === 'both' ? 1 : 2);
          setVendors(
            [...(data || [])].sort(
              (a: any, b: any) =>
                rank(a.vendor_type) - rank(b.vendor_type) ||
                String(a.display_name || a.legal_name || '').localeCompare(
                  String(b.display_name || b.legal_name || ''),
                ),
            ),
          );
        });
    }
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

    /* The structure now comes off the template rather than being guessed from
       substrings of the trade name. That guess never reset to standard when a
       later template did not match, and it selected stage_percentage without
       supplying any stages — so the form then failed its own sum-to-100 check
       on a split the user had never been shown. Every branch assigns. */
    const structure = tpl.default_valuation_structure ?? 'standard';
    setValuationStructure(structure);

    if (structure === 'floor_lead') {
      setLeadPercentPerFloor(tpl.default_lead_percent_per_floor || 7);
    }

    if (structure === 'stage_percentage') {
      const seeded = (tpl.default_stages ?? []).filter((s) => s.name && s.percent > 0);
      setStages(
        seeded.length > 0
          ? seeded.map((s) => ({
              id: `${s.name}-${s.percent}-${Math.random().toString(36).slice(2, 8)}`,
              name: s.name,
              percent: s.percent,
            }))
          : [],
      );
    } else {
      setStages([]);
    }
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

  const isPlumbing = useMemo(() => {
    const cat = (tradeCategory || '').toLowerCase();
    const tCat = (selectedTemplate?.trade_category || '').toLowerCase();
    const tName = (selectedTemplate?.name || '').toLowerCase();
    return cat.includes('plumb') || tCat.includes('plumb') || tName.includes('plumb');
  }, [tradeCategory, selectedTemplate]);

  const subtotalAmount = useMemo(() => {
    const linesSum = lines.reduce((sum, l) => {
      const q = l.quantity && l.quantity > 0 ? l.quantity : 1;
      const lineVal = (l.quantity === 0 && l.rate > 0) ? l.rate : q * (l.rate || 0);
      return sum + lineVal;
    }, 0);

    if (woType === 'rate_based' && ceilingAmount > 0) {
      return ceilingAmount;
    }
    return linesSum;
  }, [lines, woType, ceilingAmount, isPlumbing]);

  const gstAmount = useMemo(() => {
    return (subtotalAmount * (gstPercentage || 0)) / 100;
  }, [subtotalAmount, gstPercentage]);

  const grossAmount = useMemo(() => {
    return subtotalAmount + gstAmount;
  }, [subtotalAmount, gstAmount]);

  const totalAmount = subtotalAmount;

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

    if (valuationStructure === 'stage_percentage') {
      const totalPct = stages.reduce((sum, s) => sum + (Number(s.percent) || 0), 0);
      if (Math.abs(totalPct - 100) > 0.1) {
        setError(`Stage percentages must sum to 100%. Currently total is ${totalPct.toFixed(1)}%.`);
        return;
      }
    }

    setLoading(true);
    setError(null);

    try {
      const agency = await findOrCreateAgency({ projectId, agencyName, tradeCategory });
      const gstSummary = gstPercentage > 0 ? `\n\nGST Rate: ${gstPercentage}%` : '';

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
        termsAndConditions: [termsBaseline, termsCategory, gstSummary].filter(Boolean).join('\n\n'),
        budgetAllocationId: budgetAllocationId || undefined,
        masterBudgetItemId: masterBudgetItemId || undefined,
        taxInclusive: taxInclusive || gstPercentage > 0,
        ceilingAmount: woType === 'rate_based' ? (ceilingAmount > 0 ? ceilingAmount : subtotalAmount) : undefined,
        lines: lines.map((l) => ({
          description: (!isPlumbing && l.itemName) ? `${l.itemName} - ${l.description}` : l.description,
          quantity: isPlumbing ? 1 : l.quantity,
          unit: l.unit,
          rate: l.rate,
        })),
        billingAddress: billingAddress || undefined,
        gstNumber: gstNumber || undefined,
        valuationStructure,
        leadPercentPerFloor: valuationStructure === 'floor_lead' ? leadPercentPerFloor : undefined,
        stages: valuationStructure === 'stage_percentage' ? stages : undefined,
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
            <TemplateCombobox
              templates={templates}
              value={templateId}
              onChange={(id) => applyTemplate(id)}
            />

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
                {/* Always opens on focus. Rendering nothing when the list was
                    empty made a working control look broken — there was no way
                    to tell "no vendors in the master" from "this does not open". */}
                {showVendorDropdown && (
                  <div className="absolute left-0 right-0 z-50 mt-1 max-h-48 overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
                    {vendorsLoading && (
                      <div className="px-3 py-2 text-xs text-muted-foreground">
                        Loading vendor master…
                      </div>
                    )}

                    {!vendorsLoading && vendorsError && (
                      <div className="px-3 py-2 text-xs text-red-600">
                        Vendor master could not be read: {vendorsError}
                      </div>
                    )}

                    {!vendorsLoading && !vendorsError && vendors.length === 0 && (
                      <div className="px-3 py-2 text-xs text-muted-foreground">
                        No active vendors in the master. Add one under Vendors, or type a name to
                        create the agency inline.
                      </div>
                    )}

                    {!vendorsLoading &&
                      !vendorsError &&
                      vendors.length > 0 &&
                      filteredVendors.length === 0 && (
                        <div className="px-3 py-2 text-xs text-muted-foreground">
                          No vendor matches “{agencyName}”. It will be created as a new agency.
                        </div>
                      )}

                    {filteredVendors.map((v) => {
                      const vName = v.display_name || v.legal_name || 'Unnamed Vendor';
                      return (
                        <button
                          key={v.id}
                          type="button"
                          /* onMouseDown fires before the input's blur, so the
                             click is not lost to the 200ms close timer. */
                          onMouseDown={(e) => e.preventDefault()}
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
                          <span className="text-[10px] text-muted-foreground">
                            {v.vendor_type === 'contractor'
                              ? 'Contractor'
                              : v.vendor_type === 'both'
                                ? 'Contractor / Supplier'
                                : 'Supplier'}
                            {v.gst_number ? ` · GST ${v.gst_number}` : ''}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {vendorId ? (
                  <p className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                    Linked to vendor master
                  </p>
                ) : agencyName.trim() ? (
                  <p className="text-[10px] text-amber-700 dark:text-amber-400">
                    Not linked to the vendor master — a new agency will be created.
                  </p>
                ) : null}
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

            {/* Activity (Budget Head) & Sub-Activity (Sub-Category) */}
            <div className="grid grid-cols-2 gap-4">
              <BudgetHeadCombobox
                budgetHeads={budgetHeads}
                value={budgetAllocationId}
                onChange={(newHeadId) => {
                  setBudgetAllocationId(newHeadId);
                  setMasterBudgetItemId(''); // Reset sub-activity when activity changes
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

            <div className="grid grid-cols-2 gap-4">
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

            {/* Valuation Structure */}
            <div className="rounded-lg border border-border p-3 bg-muted/20 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-foreground">Trade Valuation & Billing Structure</label>
                <span className="text-[10px] text-muted-foreground">Dictates how Service Bills calculate line amounts</span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setValuationStructure('standard')}
                  className={`p-2.5 rounded-lg border text-left text-xs font-semibold transition-all ${valuationStructure === 'standard' ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background text-muted-foreground'}`}
                >
                  <div>Standard Item Rate</div>
                  <div className="text-[10px] font-normal opacity-80 mt-0.5">Fixed rate × measured Qty</div>
                </button>
                <button
                  type="button"
                  onClick={() => setValuationStructure('stage_percentage')}
                  className={`p-2.5 rounded-lg border text-left text-xs font-semibold transition-all ${valuationStructure === 'stage_percentage' ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background text-muted-foreground'}`}
                >
                  <div>Stage-Wise % (Plumbing/Electric)</div>
                  <div className="text-[10px] font-normal opacity-80 mt-0.5">Milestone % of Flat/Unit Rate</div>
                </button>
                <button
                  type="button"
                  onClick={() => setValuationStructure('floor_lead')}
                  className={`p-2.5 rounded-lg border text-left text-xs font-semibold transition-all ${valuationStructure === 'floor_lead' ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background text-muted-foreground'}`}
                >
                  <div>Floor Lead % (Flooring/Tiles)</div>
                  <div className="text-[10px] font-normal opacity-80 mt-0.5">Base Rate + % Lead per Floor</div>
                </button>
              </div>

              {valuationStructure === 'floor_lead' && (
                <div className="flex items-center gap-3 pt-1">
                  <label className="text-xs font-medium text-foreground">Lead Increment per Floor (%):</label>
                  <input
                    type="number"
                    step="0.5"
                    value={leadPercentPerFloor}
                    onChange={(e) => setLeadPercentPerFloor(Number(e.target.value) || 0)}
                    className="w-20 rounded border border-input bg-background px-2 py-1 text-xs font-bold text-center"
                  />
                  <span className="text-[11px] text-muted-foreground">Added to base ground rate for each floor above ground</span>
                </div>
              )}

              {valuationStructure === 'stage_percentage' && (
                <div className="space-y-2 pt-1 border-t border-border/50">
                  <div className="flex items-center justify-between text-xs font-bold text-foreground">
                    <span>Payment Stages Breakdown</span>
                    <span className={stages.reduce((s, x) => s + (Number(x.percent) || 0), 0) === 100 ? "text-emerald-600 font-bold" : "text-amber-600 font-bold"}>
                      Total: {stages.reduce((s, x) => s + (Number(x.percent) || 0), 0)}% / 100%
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {stages.map((st, sIdx) => (
                      <div key={st.id || sIdx} className="flex items-center gap-2 bg-background p-1.5 rounded border border-border">
                        <input
                          type="text"
                          value={st.name}
                          onChange={(e) => {
                            const copy = [...stages];
                            copy[sIdx].name = e.target.value;
                            setStages(copy);
                          }}
                          className="flex-1 text-xs bg-transparent border-0 font-medium focus:outline-none"
                          placeholder="Stage name"
                        />
                        <div className="flex items-center gap-1 shrink-0">
                          <input
                            type="number"
                            step="0.5"
                            value={st.percent}
                            onChange={(e) => {
                              const copy = [...stages];
                              copy[sIdx].percent = Number(e.target.value) || 0;
                              setStages(copy);
                            }}
                            className="w-14 text-xs font-bold text-right p-1 rounded border border-input"
                          />
                          <span className="text-xs text-muted-foreground">%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
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
                      {!isPlumbing && <th className="px-3 py-2 min-w-[150px]">Item / Service Description</th>}
                      <th className="px-3 py-2 min-w-[240px]">Work Description & Specification</th>
                      {!isPlumbing && woType === 'fixed_scope' && <th className="px-3 py-2 text-right w-[80px]">Qty</th>}
                      <th className="px-3 py-2 w-[80px]">Unit</th>
                      <th className="px-3 py-2 text-right w-[110px]">Rate (₹)</th>
                      <th className="px-3 py-2 w-[90px]">GST %</th>
                      {woType === 'fixed_scope' && <th className="px-3 py-2 text-right w-[110px]">Amount (₹)</th>}
                      <th className="px-3 py-2 text-center w-[40px]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, idx) => (
                      <tr key={line.key} className="border-b border-border last:border-0 hover:bg-muted/10">
                        <td className="px-3 py-2 text-center font-semibold text-muted-foreground">{idx + 1}</td>
                        {!isPlumbing && (
                          <td className="px-2 py-1.5">
                            <input
                              required={!isPlumbing}
                              type="text"
                              placeholder="e.g. Concrete, AC"
                              value={line.itemName || ''}
                              onChange={(e) => updateLine(line.key, { itemName: e.target.value })}
                              className="w-full rounded border border-input bg-background px-2 py-1 text-xs"
                            />
                          </td>
                        )}
                        <td className="px-2 py-1.5">
                          <textarea
                            required
                            rows={1}
                            placeholder="Detailed specifications"
                            value={line.description}
                            onInput={(e) => {
                              const target = e.currentTarget;
                              target.style.height = 'auto';
                              target.style.height = `${target.scrollHeight}px`;
                            }}
                            onChange={(e) => {
                              updateLine(line.key, { description: e.target.value });
                              const target = e.currentTarget;
                              target.style.height = 'auto';
                              target.style.height = `${target.scrollHeight}px`;
                            }}
                            className="w-full rounded border border-input bg-background px-2 py-1 text-xs resize-none overflow-hidden min-h-[34px]"
                          />
                        </td>
                        {!isPlumbing && woType === 'fixed_scope' && (
                          <td className="px-2 py-1.5">
                            <input
                              required={!isPlumbing}
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
                        <td className="px-2 py-1.5">
                          <select
                            value={line.gstPercentage ?? gstPercentage ?? 18}
                            onChange={(e) => updateLine(line.key, { gstPercentage: Number(e.target.value) })}
                            className="w-full rounded border border-input bg-background px-2 py-1 text-xs font-bold text-foreground cursor-pointer"
                          >
                            <option value={0}>0%</option>
                            <option value={5}>5%</option>
                            <option value={12}>12%</option>
                            <option value={18}>18%</option>
                            <option value={28}>28%</option>
                          </select>
                        </td>
                        {woType === 'fixed_scope' && (
                          <td className="px-3 py-2 text-right font-semibold">
                            {formatIndianCurrency(isPlumbing ? line.rate : (line.quantity || 0) * line.rate)}
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
                  Subtotal (Net Value): <span className="text-primary text-base font-extrabold">{formatIndianCurrency(subtotalAmount)}</span>
                </div>
              )}
              {woType === 'rate_based' && (
                <div className="mt-2 space-y-1.5 bg-muted/30 p-3 rounded-lg border border-border">
                  <p className="text-[11px] text-muted-foreground">
                    Rate-based WO — quantities are determined at execution against these rates.
                  </p>
                  <label className="block">
                    <span className="text-xs font-semibold text-muted-foreground">
                      Ceiling (not-to-exceed) value <span className="text-muted-foreground font-normal">(Optional)</span>
                    </span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={ceilingAmount}
                      onChange={(e) => setCeilingAmount(Number(e.target.value))}
                      placeholder="0 (no cap)"
                      className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                    />
                  </label>
                  <p className="text-[11px] text-muted-foreground font-medium">
                    Optional. Leave 0 if not setting a hard budget ceiling.
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
