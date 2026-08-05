'use client';

import { useMemo } from 'react';
import type { GrnWizardState } from './use-grn-form';

export type LineValidationStatus = 'in_balance' | 'within_tolerance' | 'over_tolerance';

export function useGrnValidation(state: GrnWizardState) {
  const getLineStatus = (received: number, balance: number, maxAllowable: number): LineValidationStatus => {
    if (received <= balance) return 'in_balance';
    if (received <= maxAllowable) return 'within_tolerance';
    return 'over_tolerance';
  };

  const step1Valid = useMemo(() => {
    return !!(state.po_id && state.grn_date);
  }, [state.po_id, state.grn_date]);

  const step2Valid = useMemo(() => {
    // At least one line has received qty > 0 and no line is over tolerance
    const hasReceived = state.items.some(item => (Number(item.received_qty) || 0) > 0);
    const hasOverTolerance = state.items.some(item => 
      getLineStatus(
        Number(item.received_qty) || 0,
        item.current_balance_qty,
        item.max_allowable_qty ?? item.current_balance_qty
      ) === 'over_tolerance'
    );
    return hasReceived && !hasOverTolerance;
  }, [state.items]);

  const step3Valid = useMemo(() => {
    return true; // Always valid
  }, []);

  return {
    getLineStatus,
    step1Valid,
    step2Valid,
    step3Valid
  };
}
