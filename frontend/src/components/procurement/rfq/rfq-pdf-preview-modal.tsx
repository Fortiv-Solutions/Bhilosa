'use client';

import { useState, useEffect } from 'react';
import { X, FileDown, Printer, Loader2, RefreshCw } from 'lucide-react';
import type { RfqFormState } from './rfq-form';
import { generateRfqPdfBlob, downloadRfqPdfFile } from '@/lib/rfq-pdf';

interface RfqPdfPreviewModalProps {
  rfq: Partial<RfqFormState>;
  onClose: () => void;
}

export function RfqPdfPreviewModal({ rfq, onClose }: RfqPdfPreviewModalProps) {
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    generateRfqPdfBlob(rfq)
      .then((blob) => {
        if (!active) return;
        setPdfBlob(blob);
        const url = URL.createObjectURL(blob);
        setBlobUrl(url);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        console.error('RFQ PDF preview error:', err);
        setError(err?.message || 'Failed to render Request for Quotation PDF preview.');
        setLoading(false);
      });

    return () => {
      active = false;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [rfq.quotation_registration_no]);

  const handleDownload = () => {
    if (pdfBlob) {
      downloadRfqPdfFile(rfq, pdfBlob);
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
              📄 Request for Quotation (RFQ) PDF Preview
              <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                {rfq.quotation_registration_no}
              </span>
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Review quotation request details before printing or downloading
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
              <p className="text-sm font-semibold">Rendering Request for Quotation PDF preview...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center gap-3 p-8 text-center max-w-md bg-card rounded-xl border border-destructive/30">
              <p className="text-sm font-bold text-destructive">{error}</p>
              <button
                type="button"
                onClick={() => {
                  setLoading(true);
                  generateRfqPdfBlob(rfq).then((b) => {
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
              title={`PDF Preview for ${rfq.quotation_registration_no}`}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
