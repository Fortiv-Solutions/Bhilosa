import type { MrpRow } from './types';

/**
 * Seed data for the MRP workspace when Supabase is not configured.
 *
 * Fixed, hand-authored rows (never Math.random()) so the demo is stable
 * across reloads and reviewers can reason about the numbers. Project ids
 * match the slugs used elsewhere in the app (see projectToSiteMap in
 * utils/supabase-client.ts); names are the title-cased seeded projects.
 */
type DemoSeedRow = {
  itemId: string;
  itemName: string;
  sku: string | null;
  uom: string;
  projectId: string;
  projectName: string;
  boqRequiredQty: number;
  onHandQty: number;
  onOrderQty: number;
  avgDailyConsumption: number;
  vendorLeadTimeDays: number;
  safetyStock: number;
  boqMatchConfidence: MrpRow['boqMatchConfidence'];
};

const SEED_ROWS: DemoSeedRow[] = [
  // Central Park — healthy positions
  {
    itemId: 'demo-item-tmt-12mm',
    itemName: 'TMT Steel Fe500 12mm',
    sku: 'STL-TMT-12MM',
    uom: 'MT',
    projectId: 'central-park',
    projectName: 'Central Park',
    boqRequiredQty: 420,
    onHandQty: 180,
    onOrderQty: 220,
    avgDailyConsumption: 6.5,
    vendorLeadTimeDays: 10,
    safetyStock: 25,
    boqMatchConfidence: 'item_id',
  },
  {
    itemId: 'demo-item-opc-53',
    itemName: 'OPC 53 Grade Cement',
    sku: 'CEM-OPC-53',
    uom: 'BAGS',
    projectId: 'central-park',
    projectName: 'Central Park',
    boqRequiredQty: 9000,
    onHandQty: 3200,
    onOrderQty: 4000,
    avgDailyConsumption: 180,
    vendorLeadTimeDays: 5,
    safetyStock: 400,
    boqMatchConfidence: 'item_id',
  },
  // Central Park — reorder risk
  {
    itemId: 'demo-item-drfixit',
    itemName: 'Dr. Fixit 101 LW+ Waterproofing Compound',
    sku: 'WPF-DRFX-101',
    uom: 'LTR',
    projectId: 'central-park',
    projectName: 'Central Park',
    boqRequiredQty: 1200,
    onHandQty: 60,
    onOrderQty: 0,
    avgDailyConsumption: 18,
    vendorLeadTimeDays: 12,
    safetyStock: 50,
    boqMatchConfidence: 'name_match',
  },
  // One Tapi — mixed
  {
    itemId: 'demo-item-sikaflex',
    itemName: 'SikaFlex Sealant',
    sku: 'SLNT-SKF-600ML',
    uom: 'NOS',
    projectId: 'one-tapi',
    projectName: 'One Tapi',
    boqRequiredQty: 600,
    onHandQty: 40,
    onOrderQty: 30,
    avgDailyConsumption: 4,
    vendorLeadTimeDays: 14,
    safetyStock: 30,
    boqMatchConfidence: 'name_match',
  },
  {
    itemId: 'demo-item-aac-block',
    itemName: 'AAC Blocks 600x200x200',
    sku: 'BLK-AAC-600200200',
    uom: 'NOS',
    projectId: 'one-tapi',
    projectName: 'One Tapi',
    boqRequiredQty: 18000,
    onHandQty: 9500,
    onOrderQty: 6000,
    avgDailyConsumption: 220,
    vendorLeadTimeDays: 7,
    safetyStock: 800,
    boqMatchConfidence: 'item_id',
  },
  {
    itemId: 'demo-item-pvc-conduit',
    itemName: 'PVC Conduit Pipe 25mm',
    sku: 'ELE-PVC-25MM',
    uom: 'RMT',
    projectId: 'one-tapi',
    projectName: 'One Tapi',
    boqRequiredQty: 5000,
    onHandQty: 300,
    onOrderQty: 200,
    avgDailyConsumption: 60,
    vendorLeadTimeDays: 9,
    safetyStock: 150,
    boqMatchConfidence: 'name_match',
  },
  // Aranya 3
  {
    itemId: 'demo-item-river-sand',
    itemName: 'River Sand',
    sku: 'AGG-RSAND',
    uom: 'BRASS',
    projectId: 'aranya-3',
    projectName: 'Aranya 3',
    boqRequiredQty: 800,
    onHandQty: 420,
    onOrderQty: 260,
    avgDailyConsumption: 9,
    vendorLeadTimeDays: 4,
    safetyStock: 40,
    boqMatchConfidence: 'item_id',
  },
  {
    itemId: 'demo-item-20mm-aggregate',
    itemName: '20mm Aggregate',
    sku: 'AGG-20MM',
    uom: 'BRASS',
    projectId: 'aranya-3',
    projectName: 'Aranya 3',
    boqRequiredQty: 650,
    onHandQty: 30,
    onOrderQty: 0,
    avgDailyConsumption: 11,
    vendorLeadTimeDays: 6,
    safetyStock: 50,
    boqMatchConfidence: 'item_id',
  },
  {
    itemId: 'demo-item-rmc-m25',
    itemName: 'Ready Mix Concrete M25',
    sku: 'RMC-M25',
    uom: 'CUM',
    projectId: 'aranya-3',
    projectName: 'Aranya 3',
    boqRequiredQty: 2400,
    onHandQty: 0,
    onOrderQty: 180,
    avgDailyConsumption: 22,
    vendorLeadTimeDays: 2,
    safetyStock: 20,
    boqMatchConfidence: 'name_match',
  },
  // Satva
  {
    itemId: 'demo-item-tmt-16mm',
    itemName: 'TMT Steel Fe500 16mm',
    sku: 'STL-TMT-16MM',
    uom: 'MT',
    projectId: 'satva',
    projectName: 'Satva',
    boqRequiredQty: 300,
    onHandQty: 210,
    onOrderQty: 90,
    avgDailyConsumption: 4.2,
    vendorLeadTimeDays: 10,
    safetyStock: 15,
    boqMatchConfidence: 'item_id',
  },
  {
    itemId: 'demo-item-cement-ppc',
    itemName: 'PPC Cement',
    sku: 'CEM-PPC',
    uom: 'BAGS',
    projectId: 'satva',
    projectName: 'Satva',
    boqRequiredQty: 5200,
    onHandQty: 260,
    onOrderQty: 300,
    avgDailyConsumption: 140,
    vendorLeadTimeDays: 5,
    safetyStock: 300,
    boqMatchConfidence: 'name_match',
  },
  {
    itemId: 'demo-item-electrical-fittings',
    itemName: 'Modular Electrical Switch Fittings',
    sku: null,
    uom: 'NOS',
    projectId: 'satva',
    projectName: 'Satva',
    boqRequiredQty: 0,
    onHandQty: 150,
    onOrderQty: 0,
    avgDailyConsumption: 3,
    vendorLeadTimeDays: 7,
    safetyStock: 20,
    boqMatchConfidence: 'unmatched',
  },
  // Orbit 4
  {
    itemId: 'demo-item-pvc-conduit-20mm',
    itemName: 'PVC Conduit Pipe 20mm',
    sku: 'ELE-PVC-20MM',
    uom: 'RMT',
    projectId: 'orbit-4',
    projectName: 'Orbit 4',
    boqRequiredQty: 3200,
    onHandQty: 2100,
    onOrderQty: 500,
    avgDailyConsumption: 28,
    vendorLeadTimeDays: 9,
    safetyStock: 100,
    boqMatchConfidence: 'item_id',
  },
  {
    itemId: 'demo-item-aac-block-100',
    itemName: 'AAC Blocks 600x200x100',
    sku: 'BLK-AAC-600200100',
    uom: 'NOS',
    projectId: 'orbit-4',
    projectName: 'Orbit 4',
    boqRequiredQty: 9000,
    onHandQty: 250,
    onOrderQty: 0,
    avgDailyConsumption: 160,
    vendorLeadTimeDays: 7,
    safetyStock: 600,
    boqMatchConfidence: 'item_id',
  },
  {
    itemId: 'demo-item-imported-facade-glass',
    itemName: 'Imported Structural Glazing Facade Glass',
    sku: null,
    uom: 'SQM',
    projectId: 'orbit-4',
    projectName: 'Orbit 4',
    boqRequiredQty: 0,
    onHandQty: 0,
    onOrderQty: 40,
    avgDailyConsumption: 0.5,
    vendorLeadTimeDays: 45,
    safetyStock: 10,
    boqMatchConfidence: 'unmatched',
  },
];

function toMrpRow(seed: DemoSeedRow): MrpRow {
  const availablePosition = seed.onHandQty + seed.onOrderQty;
  const reorderPoint = seed.avgDailyConsumption * seed.vendorLeadTimeDays + seed.safetyStock;
  return {
    itemId: seed.itemId,
    itemName: seed.itemName,
    sku: seed.sku,
    uom: seed.uom,
    projectId: seed.projectId,
    projectName: seed.projectName,
    boqRequiredQty: seed.boqRequiredQty,
    onHandQty: seed.onHandQty,
    onOrderQty: seed.onOrderQty,
    netRequirementQty: Math.max(0, seed.boqRequiredQty - availablePosition),
    avgDailyConsumption: seed.avgDailyConsumption,
    vendorLeadTimeDays: seed.vendorLeadTimeDays,
    safetyStock: seed.safetyStock,
    reorderPoint,
    availablePosition,
    reorderFlag: availablePosition < reorderPoint,
    boqMatchConfidence: seed.boqMatchConfidence,
  };
}

/** Demo MRP rows, optionally filtered to a single project id. */
export function generateDemoMrpRows(projectId?: string): MrpRow[] {
  const rows = SEED_ROWS.map(toMrpRow);
  if (!projectId || projectId === 'all') return rows;
  return rows.filter((row) => row.projectId === projectId);
}
