'use client';

import { useState, useEffect } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Calendar,
  CircleX,
  CheckCircle2,
  Clock,
  Eye,
  Flame,
  MessageSquare,
  PackageCheck,
  ShoppingCart,
  ThumbsDown,
  ThumbsUp,
  User,
  X,
  Zap,
  MessageCircle,
  FileText,
  Boxes,
  Check,
  Printer,
  MapPin,
  ClipboardList,
} from 'lucide-react';
import type { MaterialRequestRow, PurchaseRequisitionRow, Role } from '@/lib/erp/material-request/types';
import type { ProcurementLineRow } from '@/lib/procurement';
import { ProcurementSplitProgressBar } from '../procurement-split-progress-bar';
import {
  rejectMaterialRequest,
  markMrUnderReview,
  addManagementComment,
  updateSingleMrLineStatus,
} from '@/lib/procurement';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

interface MRInspectorPanelProps {
  mr: MaterialRequestRow;
  linkedPr: PurchaseRequisitionRow | undefined;
  activeRole: Role;
  onClose: () => void;
  onAction: (label: string, fn: () => Promise<{ data: unknown; error: Error | null }>) => Promise<{ data: unknown; error: Error | null } | void>;
  onConvertToPr: (mr: MaterialRequestRow, approvedLines?: ProcurementLineRow[]) => void;
  /** Generates the report-format Material Request PDF and opens it in a new tab. */
  onPrint?: () => void;
}

const PRIORITY_CONFIG = {
  critical: { label: 'Critical', className: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800', icon: Flame },
  high: { label: 'High', className: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-400 dark:border-orange-800', icon: Zap },
  medium: { label: 'Medium', className: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800', icon: Clock },
  low: { label: 'Low', className: 'bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-400 dark:border-sky-800', icon: ArrowRight },
};

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400 border-amber-200' },
  submitted: { label: 'Submitted', className: 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-400 border-blue-200' },
  in_review: { label: 'Under Review', className: 'bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-400 border-purple-200' },
  approved: { label: 'MR Approved', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-200' },
  rejected: { label: 'Rejected', className: 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-400 border-red-200' },
  closed: { label: 'Fulfilled', className: 'bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-400 border-green-200' },
  cancelled: { label: 'Cancelled', className: 'bg-gray-100 text-gray-700 dark:bg-gray-800/60 dark:text-gray-400 border-gray-200' },
};

function formatAge(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return '1d ago';
  return `${days}d ago`;
}

function isOverdue(requiredDate: string): boolean {
  return new Date(requiredDate) < new Date();
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function normalizeLineStatus(status?: string | null): 'approved_for_pr' | 'fulfilled_from_stock' | 'rejected' | 'pending' {
  if (!status) return 'pending';
  if (status === 'approved' || status === 'approved_for_pr') return 'approved_for_pr';
  if (status === 'closed' || status === 'fulfilled_from_stock') return 'fulfilled_from_stock';
  if (status === 'rejected') return 'rejected';
  return 'pending';
}

export function MRInspectorPanel({
  mr,
  linkedPr,
  activeRole,
  onClose,
  onAction,
  onConvertToPr,
  onPrint,
}: MRInspectorPanelProps) {
  const [lineStatuses, setLineStatuses] = useState<Record<string, 'approved_for_pr' | 'fulfilled_from_stock' | 'rejected' | 'pending'>>(() => {
    const initial: Record<string, 'approved_for_pr' | 'fulfilled_from_stock' | 'rejected' | 'pending'> = {};
    (mr.material_request_lines ?? []).forEach((line) => {
      initial[line.id] = normalizeLineStatus(line.line_status);
    });
    return initial;
  });

  const [fetchedLines, setFetchedLines] = useState<ProcurementLineRow[]>(mr.material_request_lines ?? []);
  const [loadingLines, setLoadingLines] = useState(false);
  const [dbPr, setDbPr] = useState<PurchaseRequisitionRow | undefined>(linkedPr);
  const [liveStatus, setLiveStatus] = useState<string>(mr.status);
  const [historyTimeline, setHistoryTimeline] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    setLiveStatus(mr.status);
  }, [mr.id, mr.status]);

  useEffect(() => {
    async function fetchMRHistory() {
      if (!mr.id) return;
      setLoadingHistory(true);
      try {
        const events: any[] = [];

        // 1. MR Creation (always first)
        events.push({
          title: 'Material Request Created',
          description: `MR ${mr.mr_number || ''} was raised by ${mr.raised_by_name || 'Site Engineer'}`,
          timestamp: mr.created_at,
          status: 'completed',
          icon: 'ClipboardList',
        });

        // If MR is cancelled
        if (liveStatus === 'cancelled') {
          events.push({
            title: 'Material Request Cancelled',
            description: `Request was cancelled and linked draft documents were withdrawn.`,
            timestamp: mr.updated_at || new Date().toISOString(),
            status: 'cancelled',
            icon: 'CircleX',
          });
          setHistoryTimeline(events);
          setLoadingHistory(false);
          return;
        }

        // 2. MR Approval (in our system, submitted MRs are auto-approved)
        if (liveStatus === 'approved' || liveStatus === 'closed' || liveStatus === 'partially_approved') {
          events.push({
            title: 'Material Request Approved',
            description: `Auto-approved upon submission.`,
            timestamp: mr.reviewed_at || mr.created_at,
            status: 'completed',
            icon: 'CheckCircle2',
          });
        }

        // 3. Find PRs linked to this MR
        const { data: prs } = await supabase
          .from('purchase_requisitions')
          .select('id, pr_number, status, created_at, created_by_name')
          .eq('material_request_id', mr.id)
          .is('deleted_at', null);

        if (prs && prs.length > 0) {
          const pr = prs[0];
          events.push({
            title: `PR Generated (${pr.pr_number})`,
            description: `Purchase Requisition created in "${pr.status}" status by ${pr.created_by_name || 'PR Team'}`,
            timestamp: pr.created_at,
            status: pr.status === 'draft' ? 'current' : 'completed',
            icon: 'ShoppingCart',
          });

          // 4. Find RFQs linked to this PR
          const { data: rfqs } = await supabase
            .from('rfqs')
            .select('id, rfq_number, title, status, created_at')
            .eq('purchase_requisition_id', pr.id)
            .is('deleted_at', null);

          if (rfqs && rfqs.length > 0) {
            rfqs.forEach((rfq) => {
              events.push({
                title: `RFQ Issued (${rfq.rfq_number})`,
                description: `Request for Quotation "${rfq.title}" is in "${rfq.status}" status`,
                timestamp: rfq.created_at,
                status: 'completed',
                icon: 'FileText',
              });
            });
          }

          // 5. Find POs linked to this PR
          const { data: pos } = await supabase
            .from('purchase_orders')
            .select('id, po_number, total_amount, status, created_at, supplier_name')
            .eq('purchase_requisition_id', pr.id)
            .is('deleted_at', null);

          if (pos && pos.length > 0) {
            for (const po of pos) {
              events.push({
                title: `PO Raised (${po.po_number})`,
                description: `Purchase Order issued to ${po.supplier_name || 'Vendor'} for INR ${Number(po.total_amount || 0).toLocaleString('en-IN')} (Status: ${po.status})`,
                timestamp: po.created_at,
                status: po.status === 'approved' || po.status === 'sent_to_vendor' || po.status === 'acknowledged' ? 'completed' : 'current',
                icon: 'FileText',
              });

              // 6. Find GRNs linked to this PO
              const { data: grns } = await supabase
                .from('goods_receipt_notes')
                .select('id, grn_number, status, created_at, receipt_date')
                .eq('purchase_order_id', po.id)
                .is('deleted_at', null);

              if (grns && grns.length > 0) {
                grns.forEach((grn) => {
                  events.push({
                    title: `Goods Received (${grn.grn_number})`,
                    description: `Materials received at site (GRN Status: ${grn.status})`,
                    timestamp: grn.created_at,
                    status: grn.status === 'posted' || grn.status === 'approved' ? 'completed' : 'current',
                    icon: 'PackageCheck',
                  });
                });
                
                if (liveStatus === 'closed') {
                  events.push({
                    title: 'Material Request Fulfilled',
                    description: 'All requested materials have been received and verified at the project site.',
                    timestamp: grns[grns.length - 1].created_at,
                    status: 'completed',
                    icon: 'CheckCircle2',
                  });
                }
              }
            }
          }
        }

        // Sort events by timestamp ascending
        events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        setHistoryTimeline(events);
      } catch (err) {
        console.error('Error loading MR history timeline:', err);
      } finally {
        setLoadingHistory(false);
      }
    }

    fetchMRHistory();
  }, [mr.id, liveStatus, dbPr?.id]);

  // Real-time listener for this specific MR status & linked PR creation
  useEffect(() => {
    if (!mr.id) return;
    const channel = supabase
      .channel(`realtime-mr-panel-${mr.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'material_requests', filter: `id=eq.${mr.id}` },
        (payload: any) => {
          if (payload.new && payload.new.status) {
            setLiveStatus(payload.new.status);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'purchase_requisitions', filter: `material_request_id=eq.${mr.id}` },
        (payload: any) => {
          if (payload.new) {
            setDbPr(payload.new as PurchaseRequisitionRow);
            if (['draft', 'returned_to_draft'].includes(payload.new.status)) {
              setLiveStatus('draft');
            } else if (payload.new.status === 'approved') {
              setLiveStatus('approved');
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [mr.id]);

  useEffect(() => {
    const initial: Record<string, 'approved_for_pr' | 'fulfilled_from_stock' | 'rejected' | 'pending'> = {};
    const baseLines = mr.material_request_lines && mr.material_request_lines.length > 0 ? mr.material_request_lines : fetchedLines;
    baseLines.forEach((line) => {
      initial[line.id] = normalizeLineStatus(line.line_status);
    });
    setLineStatuses(initial);
  }, [mr.id, mr.material_request_lines, fetchedLines]);

  useEffect(() => {
    if (mr.material_request_lines && mr.material_request_lines.length > 0) {
      setFetchedLines(mr.material_request_lines);
      return;
    }

    if (!mr.id) return;
    let isMounted = true;
    setLoadingLines(true);

    supabase
      .from('material_request_lines')
      .select('*')
      .eq('material_request_id', mr.id)
      .order('line_number', { ascending: true })
      .then(({ data, error }) => {
        if (!isMounted) return;
        if (!error && data) {
          const loaded = data as ProcurementLineRow[];
          setFetchedLines(loaded);
        }
        setLoadingLines(false);
      });

    return () => { isMounted = false; };
  }, [mr.id, mr.material_request_lines]);

  useEffect(() => {
    setDbPr(linkedPr);
    if (!mr.id) return;
    let isMounted = true;
    supabase
      .from('purchase_requisitions')
      .select('*')
      .eq('material_request_id', mr.id)
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (isMounted && data) {
          setDbPr(data as PurchaseRequisitionRow);
        }
      });
    return () => { isMounted = false; };
  }, [mr.id, linkedPr]);

  const [rejectInput, setRejectInput] = useState('');
  const [managementCommentInput, setManagementCommentInput] = useState('');
  const [activeForm, setActiveForm] = useState<'reject' | 'management' | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [panelMessage, setPanelMessage] = useState<string | null>(null);

  // Close drawer on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const isPrTeam = activeRole === 'PR_TEAM' || activeRole === 'UPPER_MANAGEMENT';
  const isManagement = activeRole === 'UPPER_MANAGEMENT';
  const overdue = isOverdue(mr.required_date) && liveStatus !== 'closed' && liveStatus !== 'rejected' && liveStatus !== 'cancelled';
  const canAct = liveStatus !== 'closed' && liveStatus !== 'rejected' && liveStatus !== 'cancelled';
  const canConvert = canAct;
  const lines = fetchedLines.length > 0 ? fetchedLines : (mr.material_request_lines ?? []);

  const updateLineStatus = async (lineId: string, targetStatus: 'approved_for_pr' | 'fulfilled_from_stock' | 'rejected') => {
    const currentStatus = lineStatuses[lineId] ?? 'pending';
    const nextStatus = currentStatus === targetStatus ? 'pending' : targetStatus;

    // 1. BLOCK status change if item has already been approved for PR
    if (currentStatus === 'approved_for_pr' && nextStatus !== 'approved_for_pr') {
      alert('Action Not Allowed: This line item has already been approved for PR and converted into a Purchase Requisition. Status modification is not permitted after PR creation.');
      return;
    }

    // 2. Optional confirmation if item was previously issued from stock
    if (currentStatus === 'fulfilled_from_stock' && nextStatus !== 'fulfilled_from_stock') {
      const confirmed = window.confirm('Notice: This item was previously issued from stock. Are you sure you want to change its status decision?');
      if (!confirmed) return;
    }

    // 3. Update local state immediately for fast UI feedback
    setLineStatuses((prev) => ({
      ...prev,
      [lineId]: nextStatus,
    }));

    // 4. Persist to Supabase database (material_request_lines) and update parent MR header status
    await updateSingleMrLineStatus(lineId, nextStatus, mr.id);
  };

  async function handleAction(label: string, fn: () => Promise<{ data: unknown; error: Error | null }>) {
    setActionLoading(true);
    setPanelError(null);
    setPanelMessage(null);
    try {
      const res = await fn();
      if (res?.error) {
        setPanelError(res.error.message);
      } else {
        await onAction(label, () => Promise.resolve(res));
      }
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionLoading(false);
    }
  }

  const statusConfig = STATUS_CONFIG[liveStatus] ?? { label: liveStatus, className: 'bg-gray-100 text-gray-800' };
  const priorityConfig = PRIORITY_CONFIG[mr.priority] ?? { label: 'Medium', className: 'bg-amber-100 text-amber-800' };
  const PriorityIcon = priorityConfig.icon;

  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        aria-hidden="true"
      />

      <div
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-5xl flex-col bg-card border-l border-border shadow-2xl animate-in slide-in-from-right duration-300 overflow-hidden"
        role="dialog"
        aria-modal="true"
      >
        {/* DRAWER HEADER */}
        <div className="flex items-center justify-between border-b border-border bg-muted/40 px-6 py-4.5">
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary font-bold shadow-2xs">
              <ShoppingCart className="h-5.5 w-5.5" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="font-heading text-lg font-bold text-foreground tracking-tight">{mr.mr_number}</h3>
                <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-0.5 text-xs font-bold ${statusConfig.className}`}>
                  {statusConfig.label}
                </span>
              </div>
              <p className="text-xs text-muted-foreground font-medium mt-0.5">
                Raised by <span className="font-semibold text-foreground">
                  {((mr as any).raised_by_name?.trim() ||
                    mr.profiles?.full_name?.trim() ||
                    mr.profiles?.name?.trim() ||
                    mr.profiles?.email?.trim() ||
                    (mr.justification?.match(/Raised By:\s*([^•\n\r]+)/i)?.[1]?.trim()) ||
                    'Site Engineer').replace(/\s*\([^)]*\)/g, '').trim() || 'Site Engineer'}
                </span> • {formatAge(mr.created_at)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {onPrint && (
              <button
                type="button"
                onClick={onPrint}
                title="Generate the Material Request report PDF"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3.5 py-2 text-xs font-bold text-foreground hover:bg-muted transition-colors shadow-2xs"
              >
                <Printer className="h-4 w-4 text-primary" /> Print Report
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              aria-label="Close drawer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {panelError && (
          <div className="mx-6 mt-4 p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs font-semibold flex items-center justify-between shadow-2xs">
            <span>{panelError}</span>
            <button type="button" onClick={() => setPanelError(null)} className="text-xs hover:underline font-bold text-red-500">Dismiss</button>
          </div>
        )}
        {panelMessage && (
          <div className="mx-6 mt-4 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-semibold flex items-center justify-between shadow-2xs">
            <span>{panelMessage}</span>
            <button type="button" onClick={() => setPanelMessage(null)} className="text-xs hover:underline font-bold text-emerald-500">Dismiss</button>
          </div>
        )}

        {/* DRAWER BODY: SCROLLABLE MAIN CONTENT */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* MR Approved & PR Created Card */}
          {(liveStatus === 'approved' || (!!dbPr && !['draft', 'returned_to_draft'].includes(dbPr.status || ''))) && (
            <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 p-4 text-xs text-emerald-900 dark:text-emerald-300 font-medium shadow-2xs">
              <Check className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-sm text-emerald-950 dark:text-emerald-200">
                  MR is already approved and PR was already created
                </p>
                <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1 leading-relaxed">
                  Purchase Requisition {dbPr?.pr_number ? <span className="font-bold text-emerald-950 dark:text-emerald-200">({dbPr.pr_number})</span> : ''} has already been generated for this request. Duplicate PR creation has been prevented.
                </p>
              </div>
            </div>
          )}

          {/* Back to Draft / Clarification Reason Banner */}
          {mr.clarification_text && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 p-4 text-xs text-amber-900 dark:text-amber-300 font-medium shadow-2xs">
              <AlertTriangle className="h-4.5 w-4.5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong className="font-bold text-amber-950 dark:text-amber-200">Back to Draft Reason / Clarification:</strong>
                <p className="mt-1 text-foreground/90 leading-relaxed font-sans">{mr.clarification_text}</p>
                {mr.clarification_at && (
                  <span className="mt-1.5 block text-[10px] text-amber-700/80 dark:text-amber-400">
                    Returned on: {formatDate(mr.clarification_at)}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Overdue Warning Alert */}
          {overdue && (
            <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-xs text-red-800 dark:text-red-300 font-medium shadow-2xs">
              <AlertTriangle className="h-4.5 w-4.5 text-red-600 shrink-0" />
              <span>
                <strong>Overdue Warning:</strong> Required date was <strong>{formatDate(mr.required_date)}</strong>. Please expedite verification.
              </span>
            </div>
          )}

          {/* Structured Quick Info Cards Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
            <div className="rounded-xl border border-border bg-background p-4 space-y-1 shadow-2xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-primary" /> Project
              </span>
              <p className="font-bold text-xs text-foreground truncate">{mr.projects?.name ?? mr.project_id}</p>
            </div>

            <div className="rounded-xl border border-border bg-background p-4 space-y-1 shadow-2xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-primary" /> Required By
              </span>
              <p className={`font-bold text-xs ${overdue ? 'text-red-600 dark:text-red-400' : 'text-foreground'}`}>
                {formatDate(mr.required_date)}
              </p>
            </div>

            <div className="rounded-xl border border-border bg-background p-4 space-y-1 shadow-2xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                Priority
              </span>
              <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${priorityConfig.className}`}>
                <PriorityIcon className="h-3 w-3" /> {priorityConfig.label}
              </span>
            </div>

            <div className="rounded-xl border border-border bg-background p-4 space-y-1 shadow-2xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-primary" /> Site Info
              </span>
              <p className="font-bold text-xs text-foreground truncate">{mr.site_block || 'Not specified'}</p>
            </div>
          </div>

          {/* Site Engineer Notes / Justification */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <FileText className="h-4 w-4 text-primary" /> Site Notes & Justification
            </span>
            <p className="text-foreground leading-relaxed italic text-xs pt-1 bg-muted/40 p-3.5 rounded-lg border border-border/50">
              "{((mr.justification || '').replace(/\s*•\s*Raised By:.*$/i, '').replace(/\s*Raised By:.*$/i, '').trim()) || 'No justification text provided by requester.'}"
            </p>
          </div>

          {/* Sourcing Split Progress & Vendor Allocation (Hiding for view-only module) */}
          {false && (
            <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4 space-y-2 shadow-2xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-purple-700 dark:text-purple-300 flex items-center gap-1.5 font-heading">
                <PackageCheck className="h-4 w-4 text-purple-600" /> Procurement Sourcing Progress & Multi-Vendor Breakdown
              </span>
              <ProcurementSplitProgressBar mrId={mr.id} prId={linkedPr?.id} showDetails={true} />
            </div>
          )}

          {/* STRUCTURED MATERIAL ITEMS TABLE */}
          <div className="rounded-xl border border-border bg-background overflow-hidden shadow-2xs space-y-0">
            
            <div className="bg-muted/50 px-5 py-3.5 border-b border-border flex items-center justify-between">
              <div>
                <h4 className="font-heading text-xs font-bold text-foreground flex items-center gap-2">
                  <Boxes className="h-4 w-4 text-primary" /> Requested Material Items ({lines.length} Items)
                </h4>
                <p className="text-[10px] text-muted-foreground mt-0.5">Full list of requested material line items in this Material Request.</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse whitespace-nowrap">
                <thead className="bg-muted/80 text-muted-foreground uppercase font-bold text-[10px] tracking-wider border-b border-border">
                  <tr>
                    <th className="px-4 py-3 font-bold text-foreground">Item Description</th>
                    <th className="px-3 py-3 text-right text-primary font-bold">Qty</th>
                    <th className="px-3 py-3 font-bold text-foreground">Unit</th>
                    <th className="px-3 py-3 font-bold text-foreground">Item Group</th>
                    <th className="px-3 py-3 font-bold text-foreground">Item Brand</th>
                    <th className="px-3 py-3 font-bold text-foreground">Activity (Main)</th>
                    <th className="px-3 py-3 font-bold text-foreground">Sub-Activity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60 bg-card">
                  {lines.map((line, idx) => {
                    const brand = (line as any).item_brand ?? (line as any).preferred_brand ?? (line as any).brand ?? '—';
                    const group = line.item_group ?? 'General Construction';
                    const activity = (line as any).activity_name ?? (mr as any).activity_name ?? 'Site Development/Pre-Construction Work';
                    const subActivity = (line as any).sub_activity_name ?? (mr as any).sub_activity_name ?? '—';

                    return (
                      <tr key={line.id || idx} className="hover:bg-muted/40 transition-colors">
                        <td className="px-4 py-3 font-semibold text-foreground">{line.item_description}</td>
                        <td className="px-3 py-3 text-right font-bold text-primary">{line.quantity}</td>
                        <td className="px-3 py-3 text-muted-foreground font-medium">{line.unit || 'nos'}</td>
                        <td className="px-3 py-3 text-muted-foreground font-medium">{group}</td>
                        <td className="px-3 py-3 text-muted-foreground font-medium">{brand}</td>
                        <td className="px-3 py-3 text-foreground font-medium">{activity}</td>
                        <td className="px-3 py-3 text-foreground font-medium">{subActivity}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* PROCUREMENT LIFECYCLE HISTORY TIMELINE */}
          <div className="space-y-3 pt-4 border-t border-border">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 font-heading">
              <Clock className="h-4 w-4 text-primary" /> Lifecycle History & Audit Trail
            </span>
            
            {loadingHistory ? (
              <div className="space-y-2.5 animate-pulse pl-4 py-2">
                <div className="h-4 bg-muted rounded-md w-3/4" />
                <div className="h-3 bg-muted rounded-md w-1/2" />
              </div>
            ) : historyTimeline.length === 0 ? (
              <p className="text-xs text-muted-foreground italic pl-1">No history logs recorded.</p>
            ) : (
              <div className="relative pl-6 border-l border-border space-y-5 ml-3 pt-1">
                {historyTimeline.map((evt, idx) => {
                  const Icon = 
                    evt.icon === 'ClipboardList' ? ClipboardList :
                    evt.icon === 'CheckCircle2' ? CheckCircle2 :
                    evt.icon === 'ShoppingCart' ? ShoppingCart :
                    evt.icon === 'FileText' ? FileText :
                    evt.icon === 'PackageCheck' ? PackageCheck :
                    evt.icon === 'CircleX' ? CircleX : Clock;

                  const isCancelled = evt.status === 'cancelled';
                  const isCurrent = evt.status === 'current';

                  return (
                    <div key={idx} className="relative group">
                      <span className={`absolute -left-[35px] top-0 h-[18px] w-[18px] rounded-full border-2 border-background flex items-center justify-center shadow-xs 
                        ${isCancelled ? 'bg-red-500 text-white' : isCurrent ? 'bg-amber-500 text-white' : 'bg-primary text-primary-foreground'}`}>
                        <Icon className="h-2.5 w-2.5" />
                      </span>
                      
                      <div className="space-y-0.5">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                          <h5 className={`text-xs font-bold ${isCancelled ? 'text-red-600 dark:text-red-400' : 'text-foreground'}`}>
                            {evt.title}
                          </h5>
                          <span className="text-[10px] text-muted-foreground font-semibold">
                            {formatDate(evt.timestamp)} {new Date(evt.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          {evt.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Rejection Reason Card (Hiding for view-only module) */}
          {false && (mr.rejection_reason || (mr as any).reasons_for_rejection) && (
            <div className="rounded-xl border border-red-200 bg-red-50/50 dark:bg-red-950/20 p-4 space-y-1.5 shadow-2xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-red-800 dark:text-red-300 flex items-center gap-1.5">
                <ThumbsDown className="h-4 w-4 text-red-600" /> Rejection Reason & Decision
              </span>
              <p className="text-xs text-red-900 dark:text-red-200 font-medium bg-background/80 p-3 rounded-lg border border-red-200/60">
                {mr.rejection_reason || (mr as any).reasons_for_rejection}
              </p>
            </div>
          )}

          {/* Executive Management Remark Card (Hiding for view-only module) */}
          {false && (mr.management_comment || (mr as any).remarks) && (
            <div className="rounded-xl border border-purple-200 bg-purple-50/50 dark:bg-purple-950/20 p-4 space-y-1.5 shadow-2xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-purple-800 dark:text-purple-300 flex items-center gap-1.5">
                <MessageCircle className="h-4 w-4 text-purple-600" /> Executive Management Remark
              </span>
              <p className="text-xs text-purple-900 dark:text-purple-200 font-medium bg-background/80 p-3 rounded-lg border border-purple-200/60">
                {mr.management_comment || (mr as any).remarks}
              </p>
            </div>
          )}

          {/* Inline Action Forms */}
          {activeForm === 'reject' && (
            <div className="rounded-xl border border-red-200 bg-red-50/60 dark:bg-red-950/30 p-4 space-y-3 shadow-2xs">
              <label className="block text-xs font-bold text-red-800 dark:text-red-300">Rejection Reason (Required)</label>
              <textarea
                value={rejectInput}
                onChange={(e) => setRejectInput(e.target.value)}
                placeholder="Explain why this request is being rejected..."
                className="w-full rounded-lg border border-red-200 bg-background p-2.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-red-500"
                rows={2}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={actionLoading || !rejectInput.trim()}
                  onClick={() => {
                    handleAction(`Reject MR ${mr.mr_number}`, () => rejectMaterialRequest(mr, rejectInput));
                    setActiveForm(null);
                  }}
                  className="rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  Confirm Rejection
                </button>
                <button type="button" onClick={() => setActiveForm(null)} className="rounded-lg border border-border bg-background px-4 py-2 text-xs font-bold hover:bg-muted transition-colors cursor-pointer">Cancel</button>
              </div>
            </div>
          )}

          {activeForm === 'management' && (
            <div className="rounded-xl border border-purple-200 bg-purple-50/60 dark:bg-purple-950/30 p-4 space-y-3 shadow-2xs">
              <label className="block text-xs font-bold text-purple-800 dark:text-purple-300">Executive Management Remark</label>
              <textarea
                value={managementCommentInput}
                onChange={(e) => setManagementCommentInput(e.target.value)}
                placeholder="Add high-level guidance or decision notes..."
                className="w-full rounded-lg border border-purple-200 bg-background p-2.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-purple-500"
                rows={2}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={actionLoading || !managementCommentInput.trim()}
                  onClick={() => {
                    handleAction(`Add remark on MR ${mr.mr_number}`, () => addManagementComment(mr, managementCommentInput));
                    setActiveForm(null);
                  }}
                  className="rounded-lg bg-purple-600 px-4 py-2 text-xs font-bold text-white hover:bg-purple-700 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  Save Remark
                </button>
                <button type="button" onClick={() => setActiveForm(null)} className="rounded-lg border border-border bg-background px-4 py-2 text-xs font-bold hover:bg-muted transition-colors cursor-pointer">Cancel</button>
              </div>
            </div>
          )}

        </div>

        {/* DRAWER FOOTER: WORKFLOW ACTIONS (Hiding for view-only module) */}
        {false && isPrTeam && canAct && (
          <div className="border-t border-border bg-card px-6 py-4 space-y-3 sticky bottom-0 z-20 shadow-md">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Request Workflow Decision</span>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2.5">
                
                {canConvert && (
                  <button
                    type="button"
                    onClick={() => {
                      if (liveStatus === 'approved' || dbPr) {
                        setPanelMessage('MR is already approved and PR was already created for this request.');
                        return;
                      }
                      setLiveStatus('approved');
                      onConvertToPr(mr, lines);
                    }}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 shadow-sm transition-all cursor-pointer"
                  >
                    <ShoppingCart className="h-4 w-4" /> Approve MR
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setActiveForm(activeForm === 'reject' ? null : 'reject')}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-red-300 bg-red-50 dark:bg-red-950/30 px-3.5 py-2.5 text-xs font-bold text-red-800 dark:text-red-300 hover:bg-red-100 transition-colors cursor-pointer"
                >
                  <ThumbsDown className="h-3.5 w-3.5" /> Reject
                </button>

                <button
                  type="button"
                  onClick={() => setActiveForm(activeForm === 'management' ? null : 'management')}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3.5 py-2.5 text-xs font-bold text-primary hover:bg-primary/20 transition-colors cursor-pointer"
                >
                  <MessageCircle className="h-3.5 w-3.5" /> + Remark
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </>
  );
}
