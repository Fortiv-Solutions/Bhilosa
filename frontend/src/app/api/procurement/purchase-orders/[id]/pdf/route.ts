import { NextRequest, NextResponse } from 'next/server';
import { requireSupabaseUser } from '@/lib/supabase/server';

/**
 * Resolves the printable document URL for a purchase order.
 *
 * Requires an authenticated session (this route previously had no auth check
 * at all) and reads through the caller's own client so row level security
 * applies.
 *
 * No PDF is rendered into storage here. The route used to return a
 * `storagePath` of `purchase-orders/<id>/<number>.pdf` whenever the column
 * was null — a path to a file that had never been written — so callers
 * that trusted it went on to request a signed URL for a nonexistent
 * object. `storagePath` is now returned only when a file genuinely exists;
 * otherwise it is null and `signedUrl` points at the live preview, which
 * is rendered on demand from the order's current data.
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

    return NextResponse.json({
      purchaseOrderId: id,
      poNumber: row.po_number ?? null,
      storagePath: row.pdf_storage_path ?? null,
      signedUrl: `/api/procurement/preview-pdf?type=PO&id=${encodeURIComponent(id)}`,
    });
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json({ error: error.message || 'Failed to generate PO PDF' }, { status: 500 });
  }
}
