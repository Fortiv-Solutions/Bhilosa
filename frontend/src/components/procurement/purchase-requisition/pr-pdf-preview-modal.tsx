import { useState, useEffect } from 'react';
import { X, FileDown, Printer, Loader2, RefreshCw } from 'lucide-react';
import type { PurchaseRequisitionRow } from '@/lib/procurement';
import { generatePurchaseRequisitionPdfBlob, downloadPurchaseRequisitionPdfFile } from '@/lib/purchase-requisition-pdf';
import { supabase } from '@/utils/supabase-client';

function formatPrHistoryLogs(logs: any[], pr: any): Array<{
  from: string;
  to: string;
  by: string;
  at: string;
  daysSince: number;
  remarks: string;
}> {
  const now = new Date();

  function formatDateTimeStr(dateVal: any): string {
    if (!dateVal) return '';
    try {
      const d = new Date(dateVal);
      if (isNaN(d.getTime())) return String(dateVal);
      return d.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }).toUpperCase().replace(',', '');
    } catch {
      return String(dateVal);
    }
  }

  function resolveActorName(val: any): string {
    if (!val) return 'Executive Director';
    const str = String(val).trim();
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)) {
      return 'Executive Director';
    }
    return str;
  }

  function formatStatusLabel(stat: string | null | undefined): string {
    if (!stat) return 'draft';
    const s = String(stat).toLowerCase().trim();
    if (s === 'created' || s === 'initial' || s === 'null') return 'created';
    if (s === 'draft' || s === 'returned_to_draft') return 'draft';
    if (s === 'under_verification' || s === 'verification' || s === 'in_review') return 'under_verification';
    if (s === 'approved') return 'approved';
    if (s === 'rejected') return 'rejected';
    if (s === 'closed') return 'closed';
    return s;
  }

  if (!logs || logs.length === 0) {
    const createdAt = pr.created_at ? new Date(pr.created_at) : now;
    const diffMs = Math.max(0, now.getTime() - createdAt.getTime());
    const daysSince = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const byName = resolveActorName(pr.prepared_by_name || pr.profiles?.name || pr.created_by_name || pr.prepared_by);

    return [
      {
        from: 'created',
        to: formatStatusLabel(pr.status),
        by: byName,
        at: formatDateTimeStr(createdAt),
        daysSince,
        remarks: pr.general_remarks || pr.remarks || 'PR Draft Created',
      },
    ];
  }

  return logs.map((log, index) => {
    const logDate = log.created_at ? new Date(log.created_at) : now;
    const diffMs = Math.max(0, now.getTime() - logDate.getTime());
    const daysSince = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    const isOldest = index === logs.length - 1;
    const isCreationAction = log.action === 'PR Draft Created' || log.action === 'PR Created / Drafted' || log.previous_status === 'created';

    let fromVal = formatStatusLabel(log.previous_status);
    if (isCreationAction || (isOldest && (!log.previous_status || log.previous_status === 'created'))) {
      fromVal = 'created';
    }

    let toVal = formatStatusLabel(log.new_status);
    if (isCreationAction && !log.new_status) {
      toVal = 'draft';
    }

    const byName = resolveActorName(log.profiles?.name || log.actor_name || pr.prepared_by_name || pr.profiles?.name || pr.prepared_by);
    const remarksVal = log.comment || log.action || pr.general_remarks || (fromVal === 'created' ? 'PR Draft Created' : 'PR Draft Saved');

    return {
      from: fromVal,
      to: toVal,
      by: byName,
      at: formatDateTimeStr(logDate),
      daysSince,
      remarks: remarksVal,
    };
  });
}

interface PRPdfPreviewModalProps {
  pr: PurchaseRequisitionRow;
  onClose: () => void;
}

export function PRPdfPreviewModal({ pr, onClose }: PRPdfPreviewModalProps) {
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    async function loadFreshPrAndGenerateBlob() {
      let prToUse = pr;
      let activityLogs: any[] = [];

      // If pr has a database ID, query Supabase directly for the latest saved row & history logs
      if (pr.id && pr.id !== 'draft-preview' && !pr.id.startsWith('line-')) {
        try {
          const { data: freshPr, error: fetchErr } = await supabase
            .from('purchase_requisitions')
            .select(`
              *,
              purchase_requisition_lines(*),
              profiles!purchase_requisitions_prepared_by_fkey(name, email),
              projects(name),
              project_sites(name)
            `)
            .eq('id', pr.id)
            .maybeSingle();

          if (freshPr && !fetchErr) {
            const fetchedSiteName = freshPr.project_sites?.name || freshPr.sub_project || (pr as any).site_name || (pr as any).sub_project || '';
            prToUse = {
              ...pr,
              ...freshPr,
              project_name: freshPr.projects?.name || (pr as any).project_name || pr.company_name,
              site_name: fetchedSiteName,
              sub_project: fetchedSiteName,
              purchase_requisition_lines: freshPr.purchase_requisition_lines && freshPr.purchase_requisition_lines.length > 0
                ? freshPr.purchase_requisition_lines
                : (pr.purchase_requisition_lines || []),
            };
          }

          const { data: logs } = await supabase
            .from('pr_activity_log')
            .select('id, action, previous_status, new_status, comment, actor_role, created_at, profiles:actor_id(name)')
            .eq('purchase_requisition_id', pr.id)
            .order('created_at', { ascending: false });

          if (logs && logs.length > 0) {
            activityLogs = logs;
          }
        } catch (e) {
          console.warn('Direct Supabase fetch for PR PDF preview failed, using live state:', e);
        }
      }

      // Format history rows matching the required columns: FROM, TO, BY, AT, DAYS SINCE, REMARKS
      const formattedHistory = formatPrHistoryLogs(activityLogs, prToUse);
      prToUse = {
        ...prToUse,
        history: formattedHistory,
      } as any;

      const blob = await generatePurchaseRequisitionPdfBlob(prToUse);
      if (!active) return;
      setPdfBlob(blob);
      const url = URL.createObjectURL(blob);
      setBlobUrl(url);
      setLoading(false);
    }

    loadFreshPrAndGenerateBlob().catch((err) => {
      if (!active) return;
      console.error('PR PDF preview error:', err);
      setError(err?.message || 'Failed to render Purchase Requisition PDF preview.');
      setLoading(false);
    });

    return () => {
      active = false;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [pr]);

  const handleDownload = () => {
    if (pdfBlob) {
      downloadPurchaseRequisitionPdfFile(pr, pdfBlob);
    }
  };

  const handlePrint = () => {
    if (blobUrl) {
      const printWindow = window.open(blobUrl, '_blank');
      if (printWindow) {
        printWindow.focus();
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 sm:p-6 animate-in fade-in duration-200">
      <div className="flex flex-col w-full max-w-5xl h-[90vh] rounded-2xl bg-card border border-border shadow-2xl overflow-hidden">
        {/* MODAL HEADER */}
        <div className="flex items-center justify-between border-b border-border px-6 py-3.5 bg-muted/40">
          <div>
            <h2 className="text-base font-bold text-foreground flex items-center gap-2">
              📄 Purchase Requisition PDF Preview
              <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                {pr.pr_number}
              </span>
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Review requisition details before printing or downloading
            </p>
          </div>

          <div className="flex items-center gap-2">
            {pdfBlob && (
              <>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer"
                >
                  <FileDown className="h-4 w-4" /> Download PDF
                </button>
                <button
                  type="button"
                  onClick={handlePrint}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-bold text-foreground hover:bg-muted transition-colors shadow-2xs cursor-pointer"
                >
                  <Printer className="h-4 w-4 text-primary" /> Print
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
              aria-label="Close Preview"
            >
              <X className="h-4.5 w-4.5" />
            </button>
          </div>
        </div>

        {/* MODAL BODY / PDF IFRAME */}
        <div className="flex-1 bg-slate-900/5 dark:bg-slate-950 p-4 flex items-center justify-center overflow-hidden">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm font-semibold">Rendering Purchase Requisition PDF preview...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center gap-3 p-8 text-center max-w-md bg-card rounded-xl border border-destructive/30">
              <p className="text-sm font-bold text-destructive">{error}</p>
              <button
                type="button"
                onClick={() => {
                  setLoading(true);
                  generatePurchaseRequisitionPdfBlob(pr).then((b) => {
                    setPdfBlob(b);
                    setBlobUrl(URL.createObjectURL(b));
                    setLoading(false);
                  });
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-bold hover:bg-muted"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Retry Preview
              </button>
            </div>
          ) : blobUrl ? (
            <iframe
              src={blobUrl}
              className="w-full h-full rounded-xl border border-border bg-white shadow-inner"
              title={`PDF Preview for ${pr.pr_number}`}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
