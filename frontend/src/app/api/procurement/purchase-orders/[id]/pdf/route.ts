import { NextRequest, NextResponse } from 'next/server';
import { requireSupabaseUser } from '@/lib/supabase/server';

/**
 * Resolves the printable document URL for a purchase order.
 *
 * Requires an authenticated session (this route previously had no auth check
 * at all) and reads through the caller's own client so row level security
 * applies. As with the PR route, no PDF is rendered into storage — the
 * returned URL is the printable preview.
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireSupabaseUser(req);
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { supabase } = auth;

    const params = await context.params;
    const id = params?.id;
    if (!id) {
      return NextResponse.json({ error: 'A purchase order id is required.' }, { status: 400 });
    }

    const { data: po, error } = await supabase
      .from('purchase_orders')
      .select('id, po_number, pdf_storage_path')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (!po) {
      return NextResponse.json({ error: 'Purchase order not found.' }, { status: 404 });
    }

    const row = po as { po_number?: string; pdf_storage_path?: string | null };
    const poNumber = row.po_number || `PO-${id.slice(0, 8)}`;

    return NextResponse.json({
      purchaseOrderId: id,
      storagePath: row.pdf_storage_path || `purchase-orders/${id}/${poNumber}.pdf`,
      signedUrl: `/api/procurement/preview-pdf?type=PO&id=${encodeURIComponent(id)}`,
    });
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json({ error: error.message || 'Failed to generate PO PDF' }, { status: 500 });
  }
}
