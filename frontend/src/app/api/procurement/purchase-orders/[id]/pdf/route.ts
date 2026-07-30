import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/utils/supabase-client';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const id = params?.id || 'default-id';

    const { data: po } = await supabase
      .from('purchase_orders')
      .select('*, purchase_order_lines(*)')
      .eq('id', id)
      .single();

    const poNumber = po?.po_number || `PO-${id.slice(0, 8)}`;

    return NextResponse.json({
      purchaseOrderId: id,
      storagePath: `purchase-orders/${id}/${poNumber}.pdf`,
      signedUrl: `/api/procurement/preview-pdf?type=PO&id=${id}`,
    });
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json({ error: error.message || 'Failed to generate PO PDF' }, { status: 500 });
  }
}
