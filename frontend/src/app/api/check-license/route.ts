import { NextResponse } from 'next/server';

// ── License Check API ───────────────────────────────────────────────────────────
// Returns 200 (active) or 403 (suspended). The layout-wrapper polls this endpoint
// periodically to enforce license gating. For now, the license is always active.
// To suspend the system, change the response status to 403.
export async function GET() {
  return NextResponse.json({ status: 'active', message: 'License valid' }, { status: 200 });
}
