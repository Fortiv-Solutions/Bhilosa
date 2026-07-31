import { NextRequest, NextResponse } from 'next/server';
import { requireSupabaseUser } from '@/lib/supabase/server';

/**
 * Renders a printable PR or PO.
 *
 * This was an unauthenticated GET that returned a complete commercial
 * document — line items, rates, totals, vendor and project names — for any
 * id supplied in the query string. It now requires a valid session, and reads
 * through that user's own client so row level security applies to the query
 * rather than the request running with blanket anon access.
 */
export async function GET(req: NextRequest) {
  const auth = await requireSupabaseUser(req);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { supabase } = auth;

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') || 'PR';
  const id = searchParams.get('id') || '';

  if (!id) {
    return NextResponse.json({ error: 'A document id is required.' }, { status: 400 });
  }

  let title = 'Purchase Requisition';
  let docNumber = 'PR-2026-001';
  let date = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  let projectName = 'Pramukh Heights';
  let lines: Array<{ item: string; qty: number; rate: number }> = [];
  let totalCost = 0;
  let status = 'Approved';
  let vendorName = '';

  if (type === 'PR' && id) {
    const { data: pr } = await supabase
      .from('purchase_requisitions')
      .select('*, purchase_requisition_lines(*), projects(name)')
      .eq('id', id)
      .single();

    if (pr) {
      docNumber = pr.pr_number || docNumber;
      title = `Purchase Requisition — ${docNumber}`;
      projectName = pr.projects?.name || projectName;
      status = pr.status?.toUpperCase() || status;
      lines = (pr.purchase_requisition_lines || []).map((l: any) => ({
        item: l.item_description,
        qty: Number(l.quantity || 0),
        rate: Number(l.estimated_rate || 0),
      }));
      totalCost = Number(pr.estimated_cost || lines.reduce((a, b) => a + b.qty * b.rate, 0));
    }
  } else if (type === 'PO' && id) {
    const { data: po } = await supabase
      .from('purchase_orders')
      .select('*, purchase_order_lines(*), vendors(legal_name), projects(name)')
      .eq('id', id)
      .single();

    if (po) {
      docNumber = po.po_number || docNumber;
      title = `Purchase Order — ${docNumber}`;
      projectName = po.projects?.name || projectName;
      vendorName = po.vendors?.legal_name || 'Approved Vendor';
      status = po.status?.toUpperCase() || status;
      lines = (po.purchase_order_lines || []).map((l: any) => ({
        item: l.item_description,
        qty: Number(l.quantity || 0),
        rate: Number(l.unit_rate || 0),
      }));
      totalCost = Number(po.total_amount || lines.reduce((a, b) => a + b.qty * b.rate, 0));
    }
  }

  if (lines.length === 0) {
    lines = [
      { item: 'CPVC Pipes & Fittings 2"', qty: 150, rate: 450 },
      { item: 'Brass Ball Valves 1"', qty: 40, rate: 850 },
      { item: 'Solvent Cement 500ml', qty: 15, rate: 320 },
    ];
    totalCost = lines.reduce((a, b) => a + b.qty * b.rate, 0);
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    @media print {
      .no-print { display: none !important; }
      body { margin: 0; padding: 20px; font-size: 12pt; background: #fff; }
    }
    body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 40px; background: #f8fafc; color: #1e293b; }
    .container { max-width: 850px; margin: 0 auto; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 40px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05); }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 20px; margin-bottom: 30px; }
    .company-title { font-size: 24px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px; }
    .company-subtitle { font-size: 12px; color: #64748b; margin-top: 4px; text-transform: uppercase; tracking: 1px; font-weight: 600; }
    .doc-badge { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; font-weight: 700; font-size: 13px; padding: 6px 14px; rounded-radius: 6px; border-radius: 6px; text-transform: uppercase; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; background: #f8fafc; padding: 20px; border-radius: 8px; border: 1px solid #f1f5f9; }
    .meta-item { font-size: 13px; }
    .meta-label { color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 11px; margin-bottom: 2px; }
    .meta-val { font-weight: 700; color: #0f172a; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
    th { background: #0f172a; color: #fff; font-size: 12px; text-transform: uppercase; padding: 12px; text-align: left; font-weight: 600; }
    td { padding: 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; }
    .text-right { text-align: right; }
    .total-row td { font-weight: 800; font-size: 15px; background: #f8fafc; border-top: 2px solid #0f172a; }
    .footer-signatures { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-top: 50px; text-align: center; }
    .sig-line { border-top: 1px solid #94a3b8; margin-top: 40px; padding-top: 8px; font-size: 12px; font-weight: 600; color: #475569; }
    .btn-print { background: #2563eb; color: #fff; border: none; padding: 10px 20px; font-weight: 700; font-size: 14px; border-radius: 8px; cursor: pointer; transition: all 0.2s; }
    .btn-print:hover { background: #1d4ed8; }
  </style>
</head>
<body>
  <div class="no-print" style="max-width: 850px; margin: 0 auto 20px auto; display: flex; justify-content: space-between; align-items: center;">
    <span style="font-size: 13px; color: #64748b; font-weight: 600;">Official Document Preview</span>
    <button onclick="window.print()" class="btn-print">🖨️ Print / Save as PDF</button>
  </div>

  <div class="container">
    <div class="header">
      <div>
        <div class="company-title">PRAMUKH REALTY & BUILDERS</div>
        <div class="company-subtitle">Field Operations & ERP System</div>
      </div>
      <div class="doc-badge">${type === 'PR' ? 'Purchase Requisition' : 'Purchase Order'}</div>
    </div>

    <div class="meta-grid">
      <div class="meta-item">
        <div class="meta-label">Document Number</div>
        <div class="meta-val">${docNumber}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Date</div>
        <div class="meta-val">${date}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Project / Site</div>
        <div class="meta-val">${projectName}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">${vendorName ? 'Vendor Name' : 'Status'}</div>
        <div class="meta-val">${vendorName || status}</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width: 50px;">#</th>
          <th>Item Description</th>
          <th class="text-right">Qty</th>
          <th class="text-right">Unit Rate (₹)</th>
          <th class="text-right">Amount (₹)</th>
        </tr>
      </thead>
      <tbody>
        ${lines.map((l, i) => `
          <tr>
            <td>${i + 1}</td>
            <td style="font-weight: 600;">${l.item}</td>
            <td class="text-right">${l.qty}</td>
            <td class="text-right">₹${l.rate.toLocaleString('en-IN')}</td>
            <td class="text-right" style="font-weight: 700;">₹${(l.qty * l.rate).toLocaleString('en-IN')}</td>
          </tr>
        `).join('')}
        <tr class="total-row">
          <td colSpan="4" class="text-right">Total Estimated Value:</td>
          <td class="text-right" style="color: #2563eb;">₹${totalCost.toLocaleString('en-IN')}</td>
        </tr>
      </tbody>
    </table>

    <div class="footer-signatures">
      <div>
        <div class="sig-line">Prepared By (Site Eng)</div>
      </div>
      <div>
        <div class="sig-line">Verified By (PR Team)</div>
      </div>
      <div>
        <div class="sig-line">Approved By (Management)</div>
      </div>
    </div>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
}
