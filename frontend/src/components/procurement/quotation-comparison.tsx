import React from 'react';
import { QuotationRow, VendorSelectionRow } from '@/lib/procurement';
import { formatCurrency, EmptyState } from './shared';
import { AlertTriangle, Award, CheckCircle2, FastForward, Info } from 'lucide-react';

export function QuotationComparison({
  quotations,
  selection,
  onRecommend,
}: {
  quotations: QuotationRow[];
  selection: VendorSelectionRow | null;
  onRecommend: (quotation: QuotationRow) => void;
}) {
  if (quotations.length === 0) {
    return <EmptyState message="No quotations recorded for this RFQ yet." />;
  }

  // Find lowest price and fastest delivery to highlight them
  const validPrices = quotations.map(q => q.total_amount).filter(a => a > 0);
  const lowestPrice = validPrices.length > 0 ? Math.min(...validPrices) : null;
  
  const validLeadTimes = quotations.map(q => q.lead_time_days).filter(d => d !== null && d > 0) as number[];
  const fastestDelivery = validLeadTimes.length > 0 ? Math.min(...validLeadTimes) : null;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h4 className="text-sm font-bold uppercase text-foreground flex items-center gap-2">
          Quotation Comparison
          {quotations.length === 1 && (
            <span className="ml-2 inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 uppercase">
              <AlertTriangle className="w-3 h-3" />
              Single Quotation
            </span>
          )}
        </h4>
        <span className="text-xs font-semibold text-muted-foreground">Compare vendors side-by-side</span>
      </div>
      
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[900px] text-left text-sm whitespace-nowrap">
          <thead className="bg-muted text-muted-foreground border-b border-border">
            <tr>
              <th className="px-4 py-3 font-semibold w-[200px]">Vendor Details</th>
              {quotations.map((q, idx) => (
                <th key={q.id} className="px-4 py-3 font-semibold border-l border-border/50 min-w-[220px]">
                  <div className="flex items-center justify-between">
                    <span className="text-foreground">Option {idx + 1}</span>
                    {selection?.selected_quotation_id === q.id && (
                      <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800 uppercase">
                        <CheckCircle2 className="w-3 h-3" /> Recommended
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {/* Basic Info */}
            <tr>
              <td className="px-4 py-3 font-medium bg-muted/20">Vendor Name</td>
              {quotations.map(q => (
                <td key={q.id} className="px-4 py-3 border-l border-border/50 font-bold text-foreground">
                  {q.vendors?.display_name || q.vendors?.legal_name || 'Unknown Vendor'}
                  {q.vendors?.compliance_status === 'blacklisted' && (
                    <span className="ml-2 text-[10px] text-red-600 bg-red-100 px-1.5 py-0.5 rounded font-bold uppercase">Blacklisted</span>
                  )}
                </td>
              ))}
            </tr>
            <tr>
              <td className="px-4 py-3 font-medium bg-muted/20">Vendor Rating</td>
              {quotations.map(q => (
                <td key={q.id} className="px-4 py-3 border-l border-border/50">
                  <div className="flex items-center gap-1">
                    <Award className={`w-4 h-4 ${Number(q.vendors?.rating) >= 4 ? 'text-amber-500' : 'text-muted-foreground'}`} />
                    <span className="font-semibold">{q.vendors?.rating || 0}/5</span>
                  </div>
                </td>
              ))}
            </tr>
            
            {/* Commercials */}
            <tr>
              <td className="px-4 py-3 font-medium bg-muted/20">Total Amount</td>
              {quotations.map(q => {
                const isLowest = lowestPrice !== null && q.total_amount === lowestPrice;
                return (
                  <td key={q.id} className={`px-4 py-3 border-l border-border/50 font-bold ${isLowest ? 'text-emerald-600 bg-emerald-50/50' : 'text-foreground'}`}>
                    <div className="flex items-center justify-between">
                      {formatCurrency(q.total_amount)}
                      {isLowest && <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded uppercase ml-2">Lowest</span>}
                    </div>
                  </td>
                );
              })}
            </tr>
            <tr>
              <td className="px-4 py-3 font-medium bg-muted/20">Taxes</td>
              {quotations.map(q => (
                <td key={q.id} className="px-4 py-3 border-l border-border/50 text-muted-foreground">
                  {formatCurrency(q.tax_amount)} ({q.gst_details || 'N/A'})
                </td>
              ))}
            </tr>
            
            {/* Delivery & Terms */}
            <tr>
              <td className="px-4 py-3 font-medium bg-muted/20">Delivery Days</td>
              {quotations.map(q => {
                const isFastest = fastestDelivery !== null && q.lead_time_days === fastestDelivery;
                return (
                  <td key={q.id} className={`px-4 py-3 border-l border-border/50 ${isFastest ? 'text-blue-600 font-semibold bg-blue-50/50' : 'text-foreground'}`}>
                    <div className="flex items-center justify-between">
                      {q.lead_time_days ? `${q.lead_time_days} days` : 'Not specified'}
                      {isFastest && <span className="text-[10px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded uppercase flex items-center gap-1 ml-2"><FastForward className="w-3 h-3" /> Fastest</span>}
                    </div>
                  </td>
                );
              })}
            </tr>
            <tr>
              <td className="px-4 py-3 font-medium bg-muted/20">Payment Terms</td>
              {quotations.map(q => (
                <td key={q.id} className="px-4 py-3 border-l border-border/50 text-xs whitespace-normal">
                  {q.payment_terms || 'Not specified'}
                </td>
              ))}
            </tr>
            
            {/* Risk Warnings */}
            <tr>
              <td className="px-4 py-3 font-medium bg-muted/20">Risks / Alerts</td>
              {quotations.map(q => {
                const hasRisks = Number(q.vendors?.rating) < 3 || !q.total_amount || q.vendors?.compliance_status === 'blacklisted';
                return (
                  <td key={q.id} className="px-4 py-3 border-l border-border/50">
                    {hasRisks ? (
                      <div className="flex items-start gap-1 text-red-600 bg-red-50 p-2 rounded text-xs whitespace-normal">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>
                          {Number(q.vendors?.rating) < 3 && "Low vendor rating. "}
                          {!q.total_amount && "Incomplete commercial details. "}
                          {q.vendors?.compliance_status === 'blacklisted' && "Vendor is blacklisted!"}
                        </span>
                      </div>
                    ) : (
                      <span className="text-emerald-600 text-xs flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> No obvious risks</span>
                    )}
                  </td>
                );
              })}
            </tr>

            {/* Actions */}
            <tr>
              <td className="px-4 py-3 bg-muted/20 border-t border-border"></td>
              {quotations.map(q => {
                const isRecommended = selection?.selected_quotation_id === q.id;
                const isBlacklisted = q.vendors?.compliance_status === 'blacklisted';
                const isIncomplete = !q.total_amount;
                const isDisabled = (selection?.status === 'approved' && isRecommended) || isBlacklisted || isIncomplete;

                return (
                  <td key={q.id} className="px-4 py-4 border-l border-t border-border/50">
                    <button 
                      type="button" 
                      onClick={() => onRecommend(q)} 
                      disabled={isDisabled} 
                      className={`w-full rounded-md border px-3 py-2 text-xs font-bold transition-colors ${
                        isRecommended 
                          ? 'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700' 
                          : 'border-primary text-primary hover:bg-primary/5 disabled:border-border disabled:text-muted-foreground disabled:bg-muted/50'
                      }`}
                    >
                      {isRecommended ? 'Update Selection' : 'Select Vendor'}
                    </button>
                    {isBlacklisted && <p className="text-[10px] text-red-500 mt-1 text-center">Cannot select blacklisted vendor</p>}
                    {isIncomplete && <p className="text-[10px] text-amber-600 mt-1 text-center">Quotation details incomplete</p>}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
        <Info className="w-4 h-4" />
        If you select a vendor that is not the lowest bidder or not the fastest, you will be required to provide a justification.
      </div>
    </div>
  );
}
