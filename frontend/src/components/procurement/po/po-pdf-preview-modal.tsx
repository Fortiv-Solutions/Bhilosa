'use client';

import { useState, useEffect } from 'react';
import { X, Download, Printer, Loader2, Eye } from 'lucide-react';
import type { PurchaseOrderRow } from '@/lib/procurement';
import { generatePurchaseOrderPdfBlob, downloadPurchaseOrderPdfFile } from '@/lib/purchase-order-pdf';

interface POPdfPreviewModalProps {
  po: Partial<PurchaseOrderRow>;
  onClose: () => void;
}

export function POPdfPreviewModal({ po, onClose }: POPdfPreviewModalProps) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadPdf() {
      try {
        setLoading(true);
        setError(null);
        const blob = await generatePurchaseOrderPdfBlob(po);
        if (!active) return;
        setPdfBlob(blob);
        const url = URL.createObjectURL(blob);
        setPdfUrl(url);
      } catch (err: any) {
        if (!active) return;
        console.error('Failed to generate PO PDF:', err);
        setError(err?.message || 'Failed to render Purchase Order PDF preview.');
      } finally {
        if (active) setLoading(false);
      }
    }
    loadPdf();
    return () => {
      active = false;
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [po]);

  const handleDownload = () => {
    if (pdfBlob) {
      downloadPurchaseOrderPdfFile(po, pdfBlob);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="flex h-[90vh] w-full max-w-5xl flex-col rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border bg-muted/40 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Printer className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground font-heading">
                Purchase Order PDF Preview
              </h3>
              <p className="text-xs text-muted-foreground font-medium">
                {po.po_number || 'PO Report'} • Pramukh Group Infrastructure Ltd.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {pdfBlob && (
              <button
                onClick={handleDownload}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-all shadow-2xs cursor-pointer"
              >
                <Download className="h-4 w-4" /> Download PDF Report
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-lg border border-border bg-background p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 bg-zinc-900 p-4 relative flex items-center justify-center overflow-hidden">
          {loading && (
            <div className="flex flex-col items-center gap-2 text-white/80">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="text-xs font-bold">Generating Official Purchase Order PDF...</span>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center text-red-400 max-w-md">
              <p className="text-sm font-bold">{error}</p>
              <button
                onClick={onClose}
                className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 transition-colors"
              >
                Close Preview
              </button>
            </div>
          )}

          {!loading && !error && pdfUrl && (
            <iframe
              src={pdfUrl}
              className="h-full w-full rounded-lg border border-zinc-800 shadow-md"
              title="Purchase Order PDF Document Preview"
            />
          )}
        </div>
      </div>
    </div>
  );
}
