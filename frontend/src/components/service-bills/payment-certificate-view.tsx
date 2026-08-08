'use client';

// ============================================================================
// PAYMENT CERTIFICATE — PRINTABLE
//
// Reproduces the layout of the 29 workbooks in PC/, which all share one shape:
//
//   Payment Certificate            Company / Vendor / Invoice No. / Dates
//   Type of Work · Type of Contract
//   Sr | Items | % of Work Completed | Qty | Unit | Rate | Amount
//   Total Bill Amount -> GST -> Debit -> Amount in Words
//   Advance / Retention / TDS -> Balance Payment to be paid
//   Approved By
//
// "% of Work Completed" is 100 on every one of the 601 parsed lines — Pramukh
// bills sequentially, each RA covering newly completed scope in full — so it is
// rendered as a constant rather than a stored per-line figure.
// ============================================================================

import { useEffect, useState } from 'react';
import { X, Printer, Loader2, AlertTriangle } from 'lucide-react';
import { getPaymentCertificate, type PaymentCertificate } from '@/lib/service-bills';
import { formatIndianCurrency } from '@/utils/format-currency';

/** Indian numbering, as the certificates spell it ("Fourty Four Thousand Only"). */
function amountInWords(value: number): string {
  const rupees = Math.floor(Math.abs(value));
  if (rupees === 0) return 'Zero Only';

  const ones = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen',
    'Eighteen', 'Nineteen',
  ];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const below100 = (n: number): string =>
    n < 20 ? ones[n] : `${tens[Math.floor(n / 10)]}${n % 10 ? ' ' + ones[n % 10] : ''}`;
  const below1000 = (n: number): string =>
    n < 100
      ? below100(n)
      : `${ones[Math.floor(n / 100)]} Hundred${n % 100 ? ' ' + below100(n % 100) : ''}`;

  const parts: string[] = [];
  const crore = Math.floor(rupees / 10000000);
  const lakh = Math.floor((rupees % 10000000) / 100000);
  const thousand = Math.floor((rupees % 100000) / 1000);
  const rest = rupees % 1000;

  if (crore) parts.push(`${below1000(crore)} Crore`);
  if (lakh) parts.push(`${below1000(lakh)} Lakh`);
  if (thousand) parts.push(`${below1000(thousand)} Thousand`);
  if (rest) parts.push(below1000(rest));

  return `${parts.join(' ')} Only`;
}

export function PaymentCertificateView({
  billId,
  isOpen,
  onClose,
}: {
  billId: string | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  const [certificate, setCertificate] = useState<PaymentCertificate | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !billId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getPaymentCertificate(billId)
      .then((data) => {
        if (!cancelled) setCertificate(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load the certificate.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, billId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm print:static print:bg-transparent print:p-0">
      <div className="flex max-h-[94vh] w-full max-w-4xl flex-col rounded-xl border border-border bg-card shadow-2xl print:max-h-none print:rounded-none print:border-0 print:shadow-none">
        <div className="flex items-center justify-between border-b border-border p-4 print:hidden">
          <h2 className="text-lg font-bold">Payment Certificate</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!certificate}
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <Printer className="h-3.5 w-3.5" /> Print
            </button>
            <button onClick={onClose} className="rounded-full p-1 text-muted-foreground hover:bg-muted">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 print:overflow-visible print:p-0">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading certificate…
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {certificate && !loading && (
            <article className="mx-auto max-w-3xl text-[13px] text-black print:text-[11px]">
              <h1 className="border-b-2 border-black pb-2 text-center text-xl font-bold uppercase tracking-wide">
                Payment Certificate
              </h1>

              <table className="mt-3 w-full border-collapse">
                <tbody>
                  <Row
                    left="Company Name"
                    leftValue={certificate.projectName || '-'}
                    right="Invoice No."
                    rightValue={certificate.billNumber}
                  />
                  <Row
                    left="Vendor Name"
                    leftValue={certificate.contractorName || '-'}
                    right="Date"
                    rightValue={certificate.billDate}
                  />
                  <Row
                    left="Type of Work"
                    leftValue={certificate.scopeOfWork || '-'}
                    right="RA Bill No."
                    rightValue={certificate.raSequence ? `RA-${certificate.raSequence}` : '-'}
                  />
                  <Row
                    left="Work Order"
                    leftValue={certificate.workOrderNumber || '-'}
                    right="GSTIN"
                    rightValue={certificate.contractorGstin || '-'}
                  />
                  {certificate.measurementSheetNumber && (
                    <Row
                      left="Measurement Sheet"
                      leftValue={`${certificate.measurementSheetNumber} (${certificate.measurementSheetStatus})`}
                      right="Supplier Bill No."
                      rightValue={certificate.supplierBillNo || '-'}
                    />
                  )}
                </tbody>
              </table>

              <h2 className="mt-4 border border-black bg-gray-100 p-1 text-center text-sm font-bold">
                Payment Details
              </h2>

              <table className="w-full border-collapse border border-black">
                <thead>
                  <tr className="bg-gray-50 text-[11px]">
                    <Th className="w-10">Sr. No.</Th>
                    <Th className="text-left">Items</Th>
                    <Th className="w-20">% of Work Completed</Th>
                    <Th className="w-20">Qty</Th>
                    <Th className="w-16">Unit</Th>
                    <Th className="w-16">Rate</Th>
                    <Th className="w-24">Amount</Th>
                  </tr>
                </thead>
                <tbody>
                  {certificate.lines.map((line, index) => (
                    <tr key={line.id}>
                      <Td className="text-center">{index + 1}</Td>
                      <Td className="text-left">
                        {line.description}
                        {Number(line.flats_count || 1) > 1 && (
                          <span className="text-[10px] text-gray-600">
                            {' '}× {line.flats_count} units
                          </span>
                        )}
                      </Td>
                      {/* Constant by design: an RA is raised only for scope that
                          is 100% complete, per the Work Order terms. */}
                      <Td className="text-center">100%</Td>
                      <Td className="text-right">{Number(line.quantity).toLocaleString('en-IN')}</Td>
                      <Td className="text-center">{line.unit || '-'}</Td>
                      <Td className="text-right">{Number(line.rate).toLocaleString('en-IN')}</Td>
                      <Td className="text-right font-semibold">
                        {formatIndianCurrency(Number(line.line_total || 0))}
                      </Td>
                    </tr>
                  ))}
                  {certificate.lines.length === 0 && (
                    <tr>
                      <Td className="text-left" colSpan={6}>
                        {certificate.serviceDescription || 'Lump sum claim'}
                      </Td>
                      <Td className="text-right font-semibold">
                        {formatIndianCurrency(certificate.subtotalAmount)}
                      </Td>
                    </tr>
                  )}

                  <Total label="Total Bill Amount" value={certificate.subtotalAmount} />
                  {certificate.isInterstate ? (
                    <Total label="IGST" value={certificate.igstAmount} muted />
                  ) : (
                    <>
                      <Total label="Central GST" value={certificate.cgstAmount} muted />
                      <Total label="State GST" value={certificate.sgstAmount} muted />
                    </>
                  )}
                  <Total label="Gross Bill Amount" value={certificate.totalAmount} bold />
                </tbody>
              </table>

              <p className="mt-1 border border-t-0 border-black p-1 text-[11px] italic">
                {amountInWords(certificate.totalAmount)}
              </p>

              <table className="mt-3 w-full border-collapse border border-black">
                <tbody>
                  <Deduction label="Advance Payment" value={certificate.advanceAdjusted} />
                  <Deduction
                    label={`Retention @ ${certificate.retentionPercent}%`}
                    value={certificate.retentionAmount}
                  />
                  <Deduction
                    label={`Debit${certificate.debitReason ? ` — ${certificate.debitReason}` : ''}`}
                    value={certificate.debitAmount}
                  />
                  <Deduction label="Other Deductions" value={certificate.otherDeductions} />
                  <Deduction
                    label={`TDS @ ${certificate.tdsPercent}%`}
                    value={certificate.tdsAmount}
                  />
                  <tr className="bg-gray-100">
                    <Td className="text-left font-bold">Balance Payment to be paid</Td>
                    <Td className="text-right text-base font-bold">
                      {formatIndianCurrency(certificate.netPayableAmount)}
                    </Td>
                  </tr>
                </tbody>
              </table>

              <p className="mt-1 text-[11px] italic">{amountInWords(certificate.netPayableAmount)}</p>

              <table className="mt-3 w-full border-collapse border border-black text-[11px]">
                <tbody>
                  <tr>
                    <Td className="text-left">Work Order Value</Td>
                    <Td className="text-right">{formatIndianCurrency(certificate.woTotalAmount)}</Td>
                    <Td className="text-left">Certified to Date</Td>
                    <Td className="text-right">{formatIndianCurrency(certificate.woBilledToDate)}</Td>
                    <Td className="text-left">Balance</Td>
                    <Td className="text-right font-bold">
                      {formatIndianCurrency(certificate.woRemainingBalance)}
                    </Td>
                  </tr>
                </tbody>
              </table>

              <div className="mt-6 grid grid-cols-3 gap-4 text-[11px]">
                <Signature label="Prepared By" name={certificate.preparedByName} />
                <Signature
                  label="Verified By"
                  name={certificate.verifiedByName}
                  at={certificate.verifiedAt}
                />
                <Signature
                  label="Approved By"
                  name={certificate.approvedByName}
                  at={certificate.approvedAt}
                />
              </div>

              <p className="mt-4 text-[10px] text-gray-600">
                TDS will be deducted as per applicable rules at your end.
              </p>
            </article>
          )}
        </div>
      </div>
    </div>
  );
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`border border-black p-1 text-center font-bold ${className}`}>{children}</th>;
}

function Td({
  children,
  className = '',
  colSpan,
}: {
  children: React.ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td colSpan={colSpan} className={`border border-black p-1 ${className}`}>
      {children}
    </td>
  );
}

function Row({
  left,
  leftValue,
  right,
  rightValue,
}: {
  left: string;
  leftValue: string;
  right: string;
  rightValue: string;
}) {
  return (
    <tr>
      <td className="border border-black p-1 font-semibold">{left}</td>
      <td className="border border-black p-1">{leftValue}</td>
      <td className="border border-black p-1 font-semibold">{right}</td>
      <td className="border border-black p-1">{rightValue}</td>
    </tr>
  );
}

function Total({
  label,
  value,
  bold,
  muted,
}: {
  label: string;
  value: number;
  bold?: boolean;
  muted?: boolean;
}) {
  return (
    <tr className={bold ? 'bg-gray-100' : ''}>
      <Td className={`text-right ${bold ? 'font-bold' : 'font-semibold'}`} colSpan={6}>
        {label}
      </Td>
      <Td className={`text-right ${bold ? 'font-bold' : muted ? 'text-gray-700' : 'font-semibold'}`}>
        {formatIndianCurrency(value)}
      </Td>
    </tr>
  );
}

function Deduction({ label, value }: { label: string; value: number }) {
  return (
    <tr>
      <Td className="text-left">Less: {label}</Td>
      <Td className="text-right">{value > 0 ? `− ${formatIndianCurrency(value)}` : '-'}</Td>
    </tr>
  );
}

function Signature({ label, name, at }: { label: string; name: string | null; at?: string | null }) {
  return (
    <div className="border-t border-black pt-1">
      <p className="font-bold">{label}</p>
      <p className="mt-6 border-t border-dotted border-gray-500 pt-1">{name || '—'}</p>
      {at && <p className="text-[10px] text-gray-600">{new Date(at).toLocaleDateString('en-IN')}</p>}
    </div>
  );
}
