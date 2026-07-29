import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/utils/supabase-client';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const id = params?.id || 'default-id';

    const { data: pr } = await supabase
      .from('purchase_requisitions')
      .select('*, purchase_requisition_lines(*)')
      .eq('id', id)
      .single();

    const prNumber = pr?.pr_number || `PR-${id.slice(0, 8)}`;

    return NextResponse.json({
      purchaseRequisitionId: id,
      storagePath: `purchase-requisitions/${id}/${prNumber}.pdf`,
      signedUrl: `/api/procurement/preview-pdf?type=PR&id=${id}`,
    });
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json({ error: error.message || 'Failed to generate PR PDF' }, { status: 500 });
  }
}
