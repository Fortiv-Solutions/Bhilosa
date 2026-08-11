'use client';

import { useState, useCallback, useEffect } from 'react';
import type { GrnPurchaseEntry, GrnExtraItem, FullGrnFormState } from '../grn-form';
import type { PurchaseOrderOption } from './use-po-lines';
import type { PoLineWithBalance } from '@/lib/procurement';

export interface GrnWizardState {
  // Step 1
  po_id: string;
  po_no: string;
  project_name: string;
  company_name: string;
  supplier_name: string;
  godown_name: string; // Delivery Location
  
  grn_date: string;
  challan_no: string;
  vehicle_no: string;
  transporter_name: string;
  dealer_name: string; // Sometimes needed
  qc_no: string;
  gr_no: string;
  
  // Weighbridge (optional)
  weighbridge_enabled: boolean;
  in_weight: number;
  out_weight: number;
  net_weight: number; // derived
  volume_in_brass: number;

  // Step 2
  items: GrnPurchaseEntry[];

  // Step 3
  remarks: string;
  extra_items: GrnExtraItem[];
  uploaded_invoice_url?: string;
  uploaded_invoice_path?: string;
  uploaded_invoice_name?: string;
  uploaded_challan_url?: string;
  uploaded_challan_path?: string;
  uploaded_challan_name?: string;
}

const defaultState: GrnWizardState = {
  po_id: '',
  po_no: '',
  project_name: '',
  company_name: '',
  supplier_name: '',
  godown_name: 'Main Site Store',
  grn_date: new Date().toISOString().split('T')[0],
  challan_no: '',
  vehicle_no: '',
  transporter_name: '',
  dealer_name: '',
  qc_no: '',
  gr_no: '',
  weighbridge_enabled: false,
  in_weight: 0,
  out_weight: 0,
  net_weight: 0,
  volume_in_brass: 0,
  items: [],
  remarks: '',
  extra_items: [],
};

export function useGrnWizardForm(initialState?: Partial<GrnWizardState>) {
  const [state, setState] = useState<GrnWizardState>({ ...defaultState, ...initialState });
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  // Auto-calculate net weight
  useEffect(() => {
    if (state.weighbridge_enabled) {
      const net = Math.abs((state.in_weight || 0) - (state.out_weight || 0));
      if (net !== state.net_weight) {
        setState(prev => ({ ...prev, net_weight: net }));
      }
    }
  }, [state.in_weight, state.out_weight, state.weighbridge_enabled, state.net_weight]);

  const updateField = useCallback(<K extends keyof GrnWizardState>(key: K, value: GrnWizardState[K]) => {
    setState(prev => ({ ...prev, [key]: value }));
  }, []);

  const updateItem = useCallback((index: number, updates: Partial<GrnPurchaseEntry>) => {
    setState(prev => {
      const newItems = [...prev.items];
      newItems[index] = { ...newItems[index], ...updates };
      return { ...prev, items: newItems };
    });
  }, []);

  const handlePoSelection = useCallback((po: PurchaseOrderOption, lines: PoLineWithBalance[]) => {
    setState(prev => {
      const newItems: GrnPurchaseEntry[] = lines.map(line => {
        // Map PoLineWithBalance to GrnPurchaseEntry
        return {
          item_id: line.item_id,
          purchase_order_line_id: line.id,
          po_no: po.po_number,
          item_group: line.item_group,
          item_description: line.item_description,
          item_code: line.item_code,
          item_brand: line.item_brand,
          item_specification: line.item_specification || '',
          activity_name: line.activity_name || '',
          sub_activity_name: line.sub_activity_name || '',
          location: po.godown_name || prev.godown_name,
          unit: line.unit,
          purchase_category: line.purchase_category || '',
          open: true,
          approved_qty: line.approved_qty,
          as_on_date_po_balance_qty: line.as_on_date_po_balance_qty,
          return_qty: 0,
          challan_qty: 0,
          received_qty: 0,
          unit_rate: line.unit_rate,
          over_tolerance_pct: line.over_tolerance_pct,
          max_allowable_qty: line.max_allowable_accept_qty,
          balance_quantity_allowed: false,
          pr_no: line.pr_no || '',
          test_report_no: '',
          expiry_date: '',
          current_balance_qty: line.as_on_date_po_balance_qty
        };
      });

      return {
        ...prev,
        po_id: po.id,
        po_no: po.po_number,
        project_name: po.project_name || '',
        company_name: po.company_name || '',
        supplier_name: po.vendor_name || '',
        godown_name: po.godown_name || prev.godown_name,
        items: newItems
      };
    });
  }, []);

  const nextStep = () => setCurrentStep(prev => Math.min(3, prev + 1) as 1 | 2 | 3);
  const prevStep = () => setCurrentStep(prev => Math.max(1, prev - 1) as 1 | 2 | 3);

  // Helper to map wizard state to FullGrnFormState for the onSubmit handler
  const getFullState = useCallback((status: FullGrnFormState['status']): FullGrnFormState => {
    return {
      qc_no: state.qc_no,
      gr_no: state.gr_no,
      grn_date: state.grn_date,
      project_name: state.project_name,
      company_name: state.company_name,
      supplier_name: state.supplier_name,
      phone_no: '',
      mobile_no: '',
      godown_name: state.godown_name,
      dealer_name: state.dealer_name,
      challan_no: state.challan_no,
      transporter_name: state.transporter_name,
      vehicle_measure_required: false,
      vehicle_no: state.vehicle_no,
      length_in_inches: 0,
      breadth_in_inches: 0,
      height_in_inches: 0,
      volume_in_brass: state.volume_in_brass,
      weight_required: state.weighbridge_enabled,
      name_of_weight: '',
      in_wt1: state.in_weight,
      out_wt1: state.out_weight,
      net_weight1: state.net_weight,
      name_of_weight2: '',
      in_wt2: 0,
      out_wt2: 0,
      net_weight2: 0,
      avg_weight: 0,
      grn_weight: 0,
      weight_difference: 0,
      allow_wt_difference: 0,
      net_wt_difference: 0,
      po_exist: !!state.po_id,
      from_pos: state.po_id || '',
      
      purchase_entries: state.items,
      extra_items: state.extra_items,
      po_remarks_list: [],
      
      total_extra_items_received: state.extra_items.length,
      remarks: state.remarks,
      account_posting_material_amount: state.items.reduce((sum, item) => sum + (item.received_qty * (item.unit_rate || 0)), 0),
      asset_amount: 0,
      asset_item: '',
      
      uploaded_invoice_url: state.uploaded_invoice_url,
      uploaded_invoice_path: state.uploaded_invoice_path,
      uploaded_invoice_name: state.uploaded_invoice_name,
      uploaded_challan_url: state.uploaded_challan_url,
      uploaded_challan_path: state.uploaded_challan_path,
      uploaded_challan_name: state.uploaded_challan_name,
      
      pb_lines_created: 0,
      unlocked_fy: 0,
      status
    };
  }, [state]);

  return {
    state,
    currentStep,
    updateField,
    updateItem,
    handlePoSelection,
    nextStep,
    prevStep,
    getFullState
  };
}
