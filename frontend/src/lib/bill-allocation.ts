export interface BillLineItemForAllocation {
  id?: string;
  item_desc: string;
  item_code?: string;
  approved_qty: number;
  unit_rate: number;
  net_amt: number;
  activity_name?: string;
  sub_activity_name?: string;
}

export interface PbHeaderCharges {
  lumpsum_freight_charges: number;
  lumpsum_loading_unloading_charges: number;
  lumpsum_other_charges: number;
  lumpsum_discount_amount: number;
  roundoff_adjustment?: number;
}

export interface AllocatedBillLineItem extends BillLineItemForAllocation {
  allocated_freight: number;
  allocated_handling: number;
  allocated_others: number;
  allocated_discount: number;
  total_allocated_charges: number;
  landed_net_amount: number;
  effective_landed_unit_rate: number;
}

export interface LandedCostAllocationResult {
  lines: AllocatedBillLineItem[];
  totalBaseAmount: number;
  totalHeaderCharges: number;
  totalLandedAmount: number;
}

export interface ChargeVarianceResult {
  poFreight: number;
  poHandling: number;
  poOthers: number;
  totalPoCharges: number;

  pbFreight: number;
  pbHandling: number;
  pbOthers: number;
  totalPbCharges: number;

  freightVariance: number;
  handlingVariance: number;
  othersVariance: number;
  totalVariance: number;
  variancePercentage: number;
  isOverTolerance: boolean;
  warningMessage: string | null;
}

/**
 * Proportionally allocates header-level PB charges down to individual line items.
 *
 * Rules:
 * - Freight & Handling: Distributed proportionally by Billed Quantity.
 * - Other Charges & Lumpsum Discount: Distributed proportionally by Line Base Amount.
 * - Landed Cost per Line = Line Base Amount + Allocated Freight + Allocated Handling + Allocated Others - Allocated Discount.
 */
export function calculateLandedCostAllocation(
  lines: BillLineItemForAllocation[],
  charges: PbHeaderCharges,
): LandedCostAllocationResult {
  if (!lines || lines.length === 0) {
    return {
      lines: [],
      totalBaseAmount: 0,
      totalHeaderCharges: 0,
      totalLandedAmount: 0,
    };
  }

  const totalQty = lines.reduce((sum, item) => sum + (Number(item.approved_qty) || 0), 0);
  const totalBaseAmount = lines.reduce(
    (sum, item) => sum + (Number(item.net_amt) || Number(item.approved_qty * item.unit_rate) || 0),
    0,
  );

  const freight = Number(charges.lumpsum_freight_charges) || 0;
  const handling = Number(charges.lumpsum_loading_unloading_charges) || 0;
  const others = Number(charges.lumpsum_other_charges) || 0;
  const discount = Number(charges.lumpsum_discount_amount) || 0;

  const totalHeaderCharges = freight + handling + others - discount;

  const allocatedLines: AllocatedBillLineItem[] = lines.map((item) => {
    const qty = Number(item.approved_qty) || 0;
    const baseAmt = Number(item.net_amt) || qty * Number(item.unit_rate) || 0;

    // Proportional ratios
    const qtyRatio = totalQty > 0 ? qty / totalQty : 0;
    const valueRatio = totalBaseAmount > 0 ? baseAmt / totalBaseAmount : 0;

    // Allocated charge amounts rounded to 2 decimal places
    const allocFreight = Number((freight * qtyRatio).toFixed(2));
    const allocHandling = Number((handling * qtyRatio).toFixed(2));
    const allocOthers = Number((others * valueRatio).toFixed(2));
    const allocDiscount = Number((discount * valueRatio).toFixed(2));

    const totalAlloc = allocFreight + allocHandling + allocOthers - allocDiscount;
    const landedNet = Number((baseAmt + totalAlloc).toFixed(2));
    const effectiveRate = qty > 0 ? Number((landedNet / qty).toFixed(2)) : Number(item.unit_rate || 0);

    return {
      ...item,
      allocated_freight: allocFreight,
      allocated_handling: allocHandling,
      allocated_others: allocOthers,
      allocated_discount: allocDiscount,
      total_allocated_charges: totalAlloc,
      landed_net_amount: landedNet,
      effective_landed_unit_rate: effectiveRate,
    };
  });

  const totalLandedAmount = Number((totalBaseAmount + totalHeaderCharges).toFixed(2));

  return {
    lines: allocatedLines,
    totalBaseAmount,
    totalHeaderCharges,
    totalLandedAmount,
  };
}

/**
 * Compares PO-level committed charges against PB-level billed charges.
 * Calculates variance and evaluates tolerance limits (5% or ₹2,000 threshold).
 */
export function comparePoAndPbCharges(
  poCharges: { freight?: number; handling?: number; others?: number },
  pbCharges: PbHeaderCharges,
  pctToleranceThreshold: number = 5,
  absToleranceThreshold: number = 2000,
): ChargeVarianceResult {
  const poFreight = Number(poCharges.freight) || 0;
  const poHandling = Number(poCharges.handling) || 0;
  const poOthers = Number(poCharges.others) || 0;
  const totalPoCharges = poFreight + poHandling + poOthers;

  const pbFreight = Number(pbCharges.lumpsum_freight_charges) || 0;
  const pbHandling = Number(pbCharges.lumpsum_loading_unloading_charges) || 0;
  const pbOthers = Number(pbCharges.lumpsum_other_charges) || 0;
  const totalPbCharges = pbFreight + pbHandling + pbOthers;

  const freightVariance = Number((pbFreight - poFreight).toFixed(2));
  const handlingVariance = Number((pbHandling - poHandling).toFixed(2));
  const othersVariance = Number((pbOthers - poOthers).toFixed(2));
  const totalVariance = Number((totalPbCharges - totalPoCharges).toFixed(2));

  const variancePercentage =
    totalPoCharges > 0
      ? Number(((totalVariance / totalPoCharges) * 100).toFixed(1))
      : totalPbCharges > 0
      ? 100
      : 0;

  const isOverTolerance =
    totalVariance > absToleranceThreshold ||
    (totalPoCharges > 0 && variancePercentage > pctToleranceThreshold);

  let warningMessage: string | null = null;
  if (isOverTolerance) {
    warningMessage = `PB Header Charges (₹${totalPbCharges.toLocaleString()}) exceed PO Committed Charges (₹${totalPoCharges.toLocaleString()}) by ₹${totalVariance.toLocaleString()} (+${variancePercentage}%). Manager approval required.`;
  }

  return {
    poFreight,
    poHandling,
    poOthers,
    totalPoCharges,
    pbFreight,
    pbHandling,
    pbOthers,
    totalPbCharges,
    freightVariance,
    handlingVariance,
    othersVariance,
    totalVariance,
    variancePercentage,
    isOverTolerance,
    warningMessage,
  };
}
