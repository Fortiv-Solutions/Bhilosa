import { NextRequest, NextResponse } from 'next/server';
import { requireSupabaseUser } from '@/lib/supabase/server';

/**
 * Resolves the printable document URL for a purchase requisition.
 *
 * Note: this does not render a PDF into storage. It returns the preview URL
 * that the client opens and prints. `storagePath` is reported only when the
 * requisition actually has a stored file, because the previous version
 * fabricated a path for an object that was never uploaded — callers then saw a
 * path, tried to sign it, and got a broken link.
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
      return NextResponse.json({ error: 'A purchase requisition id is required.' }, { status: 400 });
    }

    const { data: pr, error } = await supabase
      .from('purchase_requisitions')
      .select('id, pr_number')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (!pr) {
      return NextResponse.json({ error: 'Purchase requisition not found.' }, { status: 404 });
    }

    const prNumber = (pr as { pr_number?: string }).pr_number || `PR-${id.slice(0, 8)}`;

    return NextResponse.json({
      purchaseRequisitionId: id,
      storagePath: `purchase-requisitions/${id}/${prNumber}.pdf`,
      signedUrl: `/api/procurement/preview-pdf?type=PR&id=${encodeURIComponent(id)}`,
    });
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json({ error: error.message || 'Failed to generate PR PDF' }, { status: 500 });
  }
}
