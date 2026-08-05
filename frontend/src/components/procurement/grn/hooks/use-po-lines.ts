'use client';

import { useState, useEffect } from 'react';
import { fetchPurchaseOrderOptions, fetchPoLinesWithBalances, type PoLineWithBalance } from '@/lib/procurement';

export type PurchaseOrderOption = {
  id: string;
  po_number: string;
  project_id?: string;
  project_name?: string;
  vendor_id?: string;
  vendor_name?: string;
  company_name?: string;
  godown_name?: string;
  material_details?: string;
};

export function usePurchaseOrderOptions(projectId?: string, vendorFilter?: string) {
  const [options, setOptions] = useState<PurchaseOrderOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function loadOptions() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchPurchaseOrderOptions(projectId, vendorFilter);
        if (mounted) setOptions(data);
      } catch (err: any) {
        if (mounted) setError(err.message || 'Failed to fetch PO options');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    loadOptions();
    return () => { mounted = false; };
  }, [projectId, vendorFilter]);

  return { options, loading, error };
}

export function usePoLinesWithBalances(poId?: string) {
  const [lines, setLines] = useState<PoLineWithBalance[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function loadLines() {
      if (!poId) {
        setLines([]);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const data = await fetchPoLinesWithBalances(poId);
        if (mounted) setLines(data);
      } catch (err: any) {
        if (mounted) setError(err.message || 'Failed to fetch PO lines');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    loadLines();
    return () => { mounted = false; };
  }, [poId]);

  return { lines, loading, error };
}
