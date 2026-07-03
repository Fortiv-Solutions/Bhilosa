'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  ClipboardList,
  IndianRupee,
  PackageCheck,
  Search,
  Truck,
  Warehouse,
  Plus,
  X,
  Loader2,
  RefreshCcw
} from 'lucide-react';
import { useAppStore } from '@/store/use-app-store';
import { type MaterialTransaction } from '@/utils/mock-data';
import { isLiveSupabase } from '@/lib/erp/supabase-modules';
import { supabase } from '@/utils/supabase-client';
import { formatIndianCurrency } from '@/utils/format-currency';
import { 
  createItemMaster, 
  logManualStockMovement, 
  listItemMaster, 
  listItemCategories, 
  listUnitOfMeasurements, 
  listInventoryLocations,
  type ItemMasterRow,
  type ItemCategoryRow,
  type UnitOfMeasurementRow,
  type InventoryLocationRow
} from '@/lib/procurement';

type MovementType = 'INWARD' | 'OUTWARD';

type LiveStockRow = {
  id: string;
  project_id: string;
  available_qty: number;
  reserved_qty: number;
  consumed_qty: number;
  stock_value: number;
  reorder_level: number;
  average_rate: number;
  item_master?: {
    name: string;
  } | null;
  projects?: {
    name: string;
    location: string | null;
  } | null;
};

type StockLedgerRow = {
  id: string;
  project_id?: string;
  item_id?: string;
  transaction_type?: string;
  quantity: number;
  rate: number;
  amount?: number;
  reference_no?: string | null;
  remarks?: string | null;
  transaction_date?: string;
  created_at?: string;
  item_master?: {
    name: string;
  } | null;
  projects?: {
    name: string;
  } | null;
  type?: string;
  date?: string;
  itemName?: string;
  unit?: string;
  projectName?: string;
  referenceNo?: string;
};

type InventoryRow = {
  id: string;
  itemId: string;
  projectId: string;
  projectName: string;
  projectLocation: string;
  itemName: string;
  category: string;
  quantity: number;
  unit: string;
  reorderLevel: number;
  stockValue: number;
  supplierName: string | null;
  transactions?: MaterialTransaction[];
};

export default function InventoryPage() {
  const { projects, addMaterialTransaction } = useAppStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('all');
  const [selectedMaterialId, setSelectedMaterialId] = useState('');
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [movementType, setMovementType] = useState<MovementType>('INWARD');
  const [quantity, setQuantity] = useState('');
  const [cost, setCost] = useState('');
  const [referenceNo, setReferenceNo] = useState('');
  const [remarks, setRemarks] = useState('');
  
  const [liveStocks, setLiveStocks] = useState<LiveStockRow[]>([]);
  const [recentMovements, setRecentMovements] = useState<StockLedgerRow[]>([]);
  const [items, setItems] = useState<ItemMasterRow[]>([]);
  const [categories, setCategories] = useState<ItemCategoryRow[]>([]);
  const [uoms, setUoms] = useState<UnitOfMeasurementRow[]>([]);
  const [locations, setLocations] = useState<InventoryLocationRow[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Register Item Modal State
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [newItemSku, setNewItemSku] = useState('');
  const [newItemName, setNewItemName] = useState('');
  const [newItemDescription, setNewItemDescription] = useState('');
  const [newItemSpecification, setNewItemSpecification] = useState('');
  const [newItemCategoryId, setNewItemCategoryId] = useState('');
  const [newItemUomId, setNewItemUomId] = useState('');
  const [newItemRate, setNewItemRate] = useState(0);
  const [newItemGstRate, setNewItemGstRate] = useState(18);
  const [newItemMinStock, setNewItemMinStock] = useState(10);

  const liveMode = isLiveSupabase();

  const refreshLiveStocks = useCallback(async () => {
    if (!liveMode) return;
    setLoading(true);
    setError(null);
    try {
      const { data: stockList, error: sError } = await supabase
        .from('stock_balances')
        .select('*, item_master(name), projects(name, location)')
        .order('last_transaction_at', { ascending: false, nullsFirst: false })
        .limit(200);
      if (sError) throw new Error(sError.message);
      setLiveStocks((stockList ?? []) as LiveStockRow[]);

      const { data: ledgerList, error: lError } = await supabase
        .from('stock_ledger')
        .select('*, item_master(name), projects(name)')
        .order('created_at', { ascending: false })
        .limit(8);
      if (lError) throw new Error(lError.message);
      setRecentMovements(ledgerList || []);

      const itemList = await listItemMaster();
      setItems(itemList);

      const catList = await listItemCategories();
      setCategories(catList);

      const uomList = await listUnitOfMeasurements();
      setUoms(uomList);

      const locList = await listInventoryLocations();
      setLocations(locList);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to sync inventory data.');
    } finally {
      setLoading(false);
    }
  }, [liveMode]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshLiveStocks();
  }, [refreshLiveStocks]);

  const inventoryRows = useMemo<InventoryRow[]>(() => {
    if (liveMode && liveStocks.length > 0) {
      return liveStocks.map((stock) => ({
        id: stock.id,
        itemId: stock.project_id + '-' + stock.id,
        projectId: stock.project_id,
        projectName: stock.projects?.name || 'Live project',
        projectLocation: stock.projects?.location || 'Site store',
        itemName: stock.item_master?.name || 'Stock item',
        category: 'Stock Item',
        quantity: Number(stock.available_qty || 0),
        unit: 'unit',
        reorderLevel: Number(stock.reorder_level || 0),
        stockValue: Number(stock.stock_value || 0),
        supplierName: null,
        transactions: [],
      }));
    }

    return projects.flatMap((project) =>
      project.materials
        .filter((material) => material.status !== 'ordered')
        .map((material) => ({
          id: material.id,
          itemId: material.id,
          projectId: project.id,
          projectName: project.name,
          projectLocation: project.location,
          itemName: material.itemName,
          category: material.category,
          quantity: Number(material.quantity || 0),
          unit: material.unit,
          reorderLevel: Number(material.reorderLevel || 0),
          stockValue: Number(material.stockValue || 0),
          supplierName: material.supplierName,
          transactions: material.transactions || [],
        })),
    );
  }, [liveMode, liveStocks, projects]);

  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return inventoryRows.filter((row) => {
      const matchesProject = selectedProjectId === 'all' || row.projectId === selectedProjectId;
      const matchesSearch =
        !query ||
        row.itemName.toLowerCase().includes(query) ||
        row.category.toLowerCase().includes(query) ||
        row.projectName.toLowerCase().includes(query) ||
        row.projectLocation.toLowerCase().includes(query) ||
        (row.supplierName || '').toLowerCase().includes(query);

      return matchesProject && matchesSearch;
    });
  }, [inventoryRows, searchQuery, selectedProjectId]);

  const selectedMaterial = useMemo(() => {
    return inventoryRows.find((row) => row.id === selectedMaterialId);
  }, [inventoryRows, selectedMaterialId]);

  const lowStockRows = useMemo(() => {
    return inventoryRows.filter((row) => row.quantity <= row.reorderLevel);
  }, [inventoryRows]);

  const totalStockValue = useMemo(() => {
    return inventoryRows.reduce((sum, row) => sum + row.stockValue, 0);
  }, [inventoryRows]);

  const localRecentMovements = useMemo(() => {
    if (liveMode) return recentMovements;
    return inventoryRows
      .flatMap((row) =>
        (row.transactions || []).map((transaction) => ({
          ...transaction,
          itemName: row.itemName,
          unit: row.unit,
          projectName: row.projectName,
          rate: transaction.cost / transaction.quantity || 0,
        } as StockLedgerRow)),
      )
      .sort((a, b) => new Date(b.date || '').getTime() - new Date(a.date || '').getTime())
      .slice(0, 8);
  }, [liveMode, recentMovements, inventoryRows]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const parsedQuantity = Number(quantity);
    const parsedCost = Number(cost || 0);

    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      setError('Please provide a valid quantity greater than zero.');
      return;
    }
    if (!Number.isFinite(parsedCost) || parsedCost < 0) {
      setError('Please provide a valid cost rate.');
      return;
    }

    if (liveMode) {
      if (!selectedMaterialId) {
        setError('Please select a stock item from the registry.');
        return;
      }
      setLoading(true);

      const targetProject = selectedProjectId === 'all' ? (liveStocks[0]?.project_id || projects[0]?.id) : selectedProjectId;

      const result = await logManualStockMovement({
        projectId: targetProject,
        siteId: null,
        locationId: selectedLocationId || null,
        itemId: selectedMaterialId,
        transactionType: movementType.toLowerCase() as 'inward' | 'outward',
        quantity: parsedQuantity,
        rate: parsedCost,
        referenceNo: referenceNo || null,
        remarks: remarks || null,
      });

      setLoading(false);
      if (result.error) {
        setError(result.error.message);
        return;
      }

      setSuccess('Stock transaction successfully written to the ledger.');
      setQuantity('');
      setCost('');
      setReferenceNo('');
      setRemarks('');
      setSelectedMaterialId('');
      void refreshLiveStocks();
    } else {
      if (!selectedMaterial) return;
      const nextReference =
        referenceNo.trim() ||
        `${movementType}-${selectedMaterial.projectId}-${selectedMaterial.id}-${(selectedMaterial.transactions?.length || 0) + 1}`;

      addMaterialTransaction(
        selectedMaterial.projectId,
        selectedMaterial.id,
        movementType,
        parsedQuantity,
        parsedCost,
        nextReference,
      );

      setSuccess('Demo: Stock movement registered.');
      setQuantity('');
      setCost('');
      setReferenceNo('');
    }
  };

  async function handleRegisterItemSubmit(e: FormEvent) {
    e.preventDefault();
    if (!liveMode) {
      setSuccess('Demo: Stock item registered.');
      setItemModalOpen(false);
      return;
    }
    if (!newItemUomId) {
      setError('Please select a valid unit of measurement.');
      return;
    }
    setError(null);
    setSuccess(null);
    setLoading(true);

    const result = await createItemMaster({
      sku: newItemSku,
      name: newItemName,
      description: newItemDescription || null,
      specification: newItemSpecification || null,
      category_id: newItemCategoryId || null,
      uom_id: newItemUomId,
      default_rate: Number(newItemRate || 0),
      gst_rate: Number(newItemGstRate || 0),
      min_stock_level: Number(newItemMinStock || 0),
    });

    setLoading(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }

    setSuccess(`Item "${newItemName}" registered successfully in the Item Master.`);
    setItemModalOpen(false);
    setNewItemSku('');
    setNewItemName('');
    setNewItemDescription('');
    setNewItemSpecification('');
    setNewItemCategoryId('');
    setNewItemUomId('');
    setNewItemRate(0);
    setNewItemGstRate(18);
    setNewItemMinStock(10);

    void refreshLiveStocks();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-orange-100 bg-orange-50 px-3 py-1 text-xs font-semibold uppercase tracking-normal text-primary dark:border-orange-900/40 dark:bg-orange-950/30">
            <Warehouse className="h-3.5 w-3.5" />
            Inventory Hub
          </span>
          <h1 className="mt-2 font-heading text-2xl font-bold tracking-normal text-gray-900 dark:text-white sm:text-3xl">
            Inventory Management
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
            Monitor stock by site, post inward and outward movements, and catch reorder risk before it blocks execution.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:min-w-[560px] justify-end">
          <button
            type="button"
            onClick={() => void refreshLiveStocks()}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-xs font-bold hover:bg-muted"
          >
            <RefreshCcw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Sync
          </button>
          <button
            type="button"
            onClick={() => setItemModalOpen(true)}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#b68d40] hover:bg-[#967332] px-3 text-xs font-bold text-white shadow-sm transition-colors"
          >
            <Plus className="h-4 w-4" />
            Register Stock Item
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-4">
        <Metric icon={Boxes} label="Stock Lines" value={inventoryRows.length.toString()} />
        <Metric icon={AlertTriangle} label="Reorder Risk" value={lowStockRows.length.toString()} tone={lowStockRows.length ? 'danger' : 'success'} />
        <Metric icon={IndianRupee} label="Stock Value" value={formatIndianCurrency(totalStockValue)} />
        <Metric icon={ClipboardList} label="Movements logged" value={liveMode ? 'Live Ledger' : 'Local logs'} />
      </div>

      {lowStockRows.length > 0 && (
        <section className="rounded-2xl border border-red-100 bg-red-50/60 p-4 dark:border-red-900/30 dark:bg-red-950/20">
          <div className="flex items-center gap-2 text-danger">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-xs font-bold uppercase tracking-normal">Reorder required for {lowStockRows.length} stock line{lowStockRows.length === 1 ? '' : 's'}</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {lowStockRows.map((item) => (
              <span key={item.id} className="rounded-lg border border-red-200 bg-white px-2.5 py-1 text-xs font-bold text-danger dark:border-red-900/40 dark:bg-gray-950">
                {item.itemName} at {item.projectName}: {item.quantity} {item.unit}
              </span>
            ))}
          </div>
        </section>
      )}

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}
      {success && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{success}</div>}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="space-y-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-850 dark:bg-gray-900 sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="font-heading text-base font-semibold text-gray-900 dark:text-white">Site Stock Register</h2>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{filteredRows.length} visible stock line{filteredRows.length === 1 ? '' : 's'} across active stores.</p>
            </div>

            <div className="grid gap-2 sm:grid-cols-[180px_minmax(220px,1fr)] lg:w-[520px]">
              <select
                value={selectedProjectId}
                onChange={(event) => {
                  setSelectedProjectId(event.target.value);
                  setSelectedMaterialId('');
                }}
                className="h-10 rounded-xl border border-gray-200 bg-gray-50 px-3 text-xs font-semibold text-gray-700 focus:outline-none dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200"
              >
                <option value="all">All project sites</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>

              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search material, site, category, or supplier"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50 pl-9 pr-3 text-xs text-gray-900 focus:outline-none dark:border-gray-800 dark:bg-gray-950 dark:text-white"
                />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-gray-400 dark:border-gray-850">
                  <th className="pb-3 font-semibold">Material</th>
                  <th className="pb-3 font-semibold">Site</th>
                  <th className="pb-3 font-semibold">Category</th>
                  <th className="pb-3 font-semibold">Current Stock</th>
                  <th className="pb-3 font-semibold">Reorder Level</th>
                  <th className="pb-3 font-semibold">Stock Value</th>
                  <th className="pb-3 font-semibold">Supplier</th>
                  <th className="pb-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => {
                  const isLow = row.quantity <= row.reorderLevel;
                  return (
                    <tr
                      key={row.itemId}
                      className="border-b border-gray-50 hover:bg-gray-50/60 dark:border-gray-850/50 dark:hover:bg-gray-950/40"
                    >
                      <td className="py-3.5 font-bold text-gray-850 dark:text-gray-150">
                        <span className="flex items-center gap-2 text-left font-bold text-gray-850 dark:text-gray-100">
                          <PackageCheck className="h-4 w-4 flex-shrink-0 text-orange-600 dark:text-orange-400" />
                          {row.itemName}
                        </span>
                      </td>
                      <td className="py-3.5">
                        <div className="font-semibold text-gray-700 dark:text-gray-250">{row.projectName}</div>
                        <div className="mt-0.5 text-gray-400">{row.projectLocation}</div>
                      </td>
                      <td className="py-3.5 text-gray-500 dark:text-gray-400">{row.category}</td>
                      <td className="py-3.5 font-bold text-gray-900 dark:text-white">{row.quantity} {row.unit}</td>
                      <td className="py-3.5 text-gray-500 dark:text-gray-400">{row.reorderLevel} {row.unit}</td>
                      <td className="py-3.5 font-semibold text-gray-700 dark:text-gray-250">{formatIndianCurrency(row.stockValue)}</td>
                      <td className="py-3.5 text-gray-500 dark:text-gray-400">
                        <span className="inline-flex items-center gap-1.5">
                          <Truck className="h-3.5 w-3.5" />
                          {row.supplierName || 'Unassigned'}
                        </span>
                      </td>
                      <td className="py-3.5">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-bold ${isLow ? 'border-red-200 bg-red-50 text-danger dark:border-red-900/40 dark:bg-red-950/20' : 'border-emerald-200 bg-emerald-50 text-success dark:border-emerald-900/40 dark:bg-emerald-950/20'}`}>
                          {isLow ? 'Below Safety' : 'Healthy'}
                        </span>
                      </td>
                    </tr>
                  );
                })}

                {filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-gray-400">
                      No inventory lines match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-850 dark:bg-gray-900">
            <h2 className="font-heading text-base font-semibold text-gray-900 dark:text-white mb-2">Log Stock Movement</h2>
            
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="text-xs font-bold uppercase text-gray-400">Material / Item *</label>
                <select
                  required
                  value={selectedMaterialId}
                  onChange={(event) => setSelectedMaterialId(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 p-2.5 text-xs text-gray-900 focus:outline-none dark:border-gray-800 dark:bg-gray-950 dark:text-white"
                >
                  <option value="">Choose item...</option>
                  {liveMode ? (
                    items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} ({item.sku || 'No SKU'})
                      </option>
                    ))
                  ) : (
                    filteredRows.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.itemName} - {row.projectName} ({row.quantity} {row.unit})
                      </option>
                    ))
                  )}
                </select>
              </div>

              {liveMode && (
                <div>
                  <label className="text-xs font-bold uppercase text-gray-400">Warehouse / Location</label>
                  <select
                    value={selectedLocationId}
                    onChange={(event) => setSelectedLocationId(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 p-2.5 text-xs text-gray-900 focus:outline-none dark:border-gray-800 dark:bg-gray-950 dark:text-white"
                  >
                    <option value="">Project Default Store</option>
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name} ({loc.code})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMovementType('INWARD')}
                  className={`flex h-10 items-center justify-center gap-2 rounded-xl border text-xs font-bold transition-colors ${movementType === 'INWARD' ? 'border-emerald-200 bg-emerald-50 text-success dark:border-emerald-900/40 dark:bg-emerald-950/20' : 'border-gray-200 bg-gray-50 text-gray-500 dark:border-gray-800 dark:bg-gray-950'}`}
                >
                  <ArrowDownToLine className="h-4 w-4" />
                  Inward
                </button>
                <button
                  type="button"
                  onClick={() => setMovementType('OUTWARD')}
                  className={`flex h-10 items-center justify-center gap-2 rounded-xl border text-xs font-bold transition-colors ${movementType === 'OUTWARD' ? 'border-red-200 bg-red-50 text-danger dark:border-red-900/40 dark:bg-red-950/20' : 'border-gray-200 bg-gray-50 text-gray-500 dark:border-gray-800 dark:bg-gray-950'}`}
                >
                  <ArrowUpFromLine className="h-4 w-4" />
                  Outward
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-bold uppercase text-gray-400">Quantity *</label>
                  <input
                    required
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={quantity}
                    onChange={(event) => setQuantity(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 p-2.5 text-xs text-gray-900 focus:outline-none dark:border-gray-800 dark:bg-gray-950 dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase text-gray-400">Rate (INR)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={cost}
                    onChange={(event) => setCost(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 p-2.5 text-xs text-gray-950 focus:outline-none dark:border-gray-800 dark:bg-gray-950 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase text-gray-400">Reference</label>
                <input
                  type="text"
                  value={referenceNo}
                  onChange={(event) => setReferenceNo(event.target.value)}
                  placeholder="GRN, issue slip, or gate pass"
                  className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 p-2.5 text-xs text-gray-900 focus:outline-none dark:border-gray-800 dark:bg-gray-950 dark:text-white"
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase text-gray-400">Remarks / Notes</label>
                <input
                  type="text"
                  value={remarks}
                  onChange={(event) => setRemarks(event.target.value)}
                  placeholder="Audit comments, usage description..."
                  className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 p-2.5 text-xs text-gray-900 focus:outline-none dark:border-gray-800 dark:bg-gray-950 dark:text-white"
                />
              </div>

              <button 
                type="submit" 
                disabled={loading}
                className="w-full rounded-xl bg-[#b68d40] py-3 text-xs font-bold text-white shadow-sm transition-colors hover:bg-[#967332] disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500 dark:disabled:bg-gray-800 flex items-center justify-center gap-1.5"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Post Stock Ledger Transaction
              </button>
            </form>
          </section>

          <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-850 dark:bg-gray-900">
            <h2 className="font-heading text-base font-semibold text-gray-900 dark:text-white">Recent Movements</h2>
            <div className="mt-3 space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {localRecentMovements.map((movement) => (
                <div key={movement.id} className="rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-bold text-gray-850 dark:text-gray-100 truncate">{movement.item_master?.name || movement.itemName || 'Stock item'}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${movement.transaction_type === 'inward' || movement.type === 'INWARD' || movement.transaction_type === 'opening' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20' : 'bg-red-50 text-red-700 dark:bg-red-950/20'}`}>
                      {movement.transaction_type || movement.type}
                    </span>
                  </div>
                  <div className="mt-2 text-[10px] text-gray-500 dark:text-gray-400">
                    Qty: {movement.quantity} • Rate: {formatIndianCurrency(movement.rate)} • Ref: {movement.reference_no || movement.referenceNo || 'None'}
                  </div>
                  {movement.remarks && <p className="mt-1 text-[10px] text-gray-400 italic">Notes: {movement.remarks}</p>}
                </div>
              ))}

              {localRecentMovements.length === 0 && (
                <div className="rounded-xl border border-dashed border-gray-200 p-5 text-center text-xs text-gray-400 dark:border-gray-850">
                  No stock movements have been logged yet.
                </div>
              )}
            </div>
          </section>
        </aside>
      </div>

      {/* Register Item Dialog */}
      {itemModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-xl border border-border bg-card p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4 border-b border-border pb-3">
              <h3 className="text-xl font-bold">Register Stock Item (Item Master)</h3>
              <button onClick={() => setItemModalOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleRegisterItemSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-muted-foreground mb-1">Item Name *</label>
                  <input
                    type="text"
                    value={newItemName}
                    onChange={e => setNewItemName(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                    placeholder="e.g. 12mm Reinforcement TMT Steel"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-muted-foreground mb-1">SKU / Code</label>
                  <input
                    type="text"
                    value={newItemSku}
                    onChange={e => setNewItemSku(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                    placeholder="e.g. STL-TMT-12MM (Auto-gen if empty)"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-muted-foreground mb-1">Material Category</label>
                  <select
                    value={newItemCategoryId}
                    onChange={e => setNewItemCategoryId(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  >
                    <option value="">Unassigned</option>
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name} ({cat.code})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-muted-foreground mb-1">Unit of Measurement (UOM) *</label>
                  <select
                    required
                    value={newItemUomId}
                    onChange={e => setNewItemUomId(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  >
                    <option value="">Select UOM...</option>
                    {uoms.map(uom => (
                      <option key={uom.id} value={uom.id}>{uom.name} ({uom.code})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-muted-foreground mb-1">Default Rate (INR)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newItemRate}
                    onChange={e => setNewItemRate(Number(e.target.value))}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-muted-foreground mb-1">GST Rate %</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={newItemGstRate}
                    onChange={e => setNewItemGstRate(Number(e.target.value))}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-muted-foreground mb-1">Reorder Safety Level</label>
                  <input
                    type="number"
                    min="0"
                    value={newItemMinStock}
                    onChange={e => setNewItemMinStock(Number(e.target.value))}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-muted-foreground mb-1">Material Description</label>
                <input
                  type="text"
                  value={newItemDescription}
                  onChange={e => setNewItemDescription(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  placeholder="e.g. Standard grade building reinforcement steel rods"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-muted-foreground mb-1">Specifications</label>
                <textarea
                  value={newItemSpecification}
                  onChange={e => setNewItemSpecification(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm min-h-[80px] outline-none focus:border-primary"
                  placeholder="e.g. Grade FE 550, Length 12m, BIS standard certified"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => setItemModalOpen(false)}
                  className="rounded-md border border-border px-4 py-2 text-sm font-bold hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-bold text-white shadow hover:bg-primary/95"
                >
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Register Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  tone = 'neutral',
}: {
  icon: typeof Boxes;
  label: string;
  value: string;
  tone?: 'neutral' | 'danger' | 'success';
}) {
  const toneClass =
    tone === 'danger'
      ? 'bg-red-50 text-danger dark:bg-red-950/20'
      : tone === 'success'
        ? 'bg-emerald-50 text-success dark:bg-emerald-950/20'
        : 'bg-orange-50 text-primary dark:bg-orange-950/20';

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm dark:border-gray-850 dark:bg-gray-900">
      <div className={`mb-2 flex h-8 w-8 items-center justify-center rounded-xl ${toneClass}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="text-[11px] font-bold uppercase text-gray-400">{label}</div>
      <div className="mt-1 truncate text-sm font-bold text-gray-900 dark:text-white">{value}</div>
    </div>
  );
}
