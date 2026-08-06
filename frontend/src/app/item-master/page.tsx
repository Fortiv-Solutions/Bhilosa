'use client';

import React, { useState, useEffect } from 'react';
import { 
  Boxes, 
  Search, 
  Plus, 
  Edit3,
  FileSpreadsheet, 
  RefreshCw, 
  CheckCircle2, 
  Package, 
  Wrench, 
  Truck, 
  Loader2,
  X,
  Sparkles
} from 'lucide-react';
import { 
  fetchAllItems, 
  fetchUnitsOfMeasure, 
  fetchItemGroups, 
  createItem, 
  updateItem,
  updateItemStatus, 
  generateNextItemCode,
  ItemRecord, 
  UnitOfMeasure, 
  ItemGroup 
} from '@/lib/services/items-service';
import { ExcelItemImporterModal } from '@/components/item-master/excel-item-importer-modal';

const formatUomDisplay = (code?: string) => {
  if (!code) return 'Nos';
  const c = code.toUpperCase();
  if (c === 'BAG') return 'Bags';
  if (c === 'KG') return 'Kg';
  if (c === 'NOS') return 'Nos';
  if (c === 'PCS') return 'Pcs';
  if (c === 'SQFT') return 'Sqft';
  if (c === 'CFT') return 'Cft';
  if (c === 'TON') return 'Tons';
  if (c === 'LTR') return 'Liters';
  if (c === 'BOX') return 'Boxes';
  if (c === 'BDL') return 'Bundles';
  return code.charAt(0).toUpperCase() + code.slice(1).toLowerCase();
};

export default function ItemMasterPage() {
  const [items, setItems] = useState<ItemRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Selection & Tabs
  const [selectedItem, setSelectedItem] = useState<ItemRecord | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'material' | 'equipment' | 'service' | 'draft' | 'inactive'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  // Search inside Create Modal
  const [createUomSearchQuery, setCreateUomSearchQuery] = useState('');
  const [createUomDropdownOpen, setCreateUomDropdownOpen] = useState(false);
  const [createGroupSearchQuery, setCreateGroupSearchQuery] = useState('');
  const [createGroupDropdownOpen, setCreateGroupDropdownOpen] = useState(false);
  const [createResourceTypeSearchQuery, setCreateResourceTypeSearchQuery] = useState('Material');
  const [createResourceTypeDropdownOpen, setCreateResourceTypeDropdownOpen] = useState(false);
  const [createGstSearchQuery, setCreateGstSearchQuery] = useState('18');
  const [createGstDropdownOpen, setCreateGstDropdownOpen] = useState(false);

  // Search inside Edit Modal
  const [editSearchQuery, setEditSearchQuery] = useState('');
  const [editUomSearchQuery, setEditUomSearchQuery] = useState('');
  const [uomDropdownOpen, setUomDropdownOpen] = useState(false);
  const [selectedEditItem, setSelectedEditItem] = useState<ItemRecord | null>(null);

  // Lookups
  const [uoms, setUoms] = useState<UnitOfMeasure[]>([]);
  const [itemGroups, setItemGroups] = useState<ItemGroup[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [codeGenerating, setCodeGenerating] = useState(false);

  // Create form state
  const [createFormData, setCreateFormData] = useState({
    resource_type: 'material' as 'material' | 'equipment' | 'service',
    item_code: '',
    item_group_id: '',
    item_description: '',
    primary_uom_id: '',
    tax_rate: 18,
    lead_period_days: 3,
    status: 'active' as 'active' | 'pending_approval' | 'draft'
  });

  // Edit form state
  const [editFormData, setEditFormData] = useState({
    id: '',
    resource_type: 'material' as 'material' | 'equipment' | 'service',
    item_code: '',
    item_group_id: '',
    item_description: '',
    primary_uom_id: '',
    tax_rate: 18,
    lead_period_days: 3,
    status: 'active' as 'active' | 'pending_approval' | 'draft' | 'archived',
    is_inactive: false
  });

  const loadData = async () => {
    setLoading(true);
    const [fetchedItems, fetchedUoms, fetchedGroups] = await Promise.all([
      fetchAllItems({
        resourceType: ['all', 'draft', 'inactive'].includes(activeTab) ? undefined : activeTab,
        status: activeTab === 'draft' ? 'draft' : undefined,
        searchQuery
      }),
      fetchUnitsOfMeasure(),
      fetchItemGroups()
    ]);

    setItems(fetchedItems);
    setUoms(fetchedUoms);
    setItemGroups(fetchedGroups);
    setLoading(false);

    // Default dropdown selections for create modal
    if (fetchedGroups.length > 0 && !createFormData.item_group_id) {
      const defaultGrp = fetchedGroups[0];
      setCreateFormData(prev => ({ ...prev, item_group_id: defaultGrp.id }));
    }
    if (fetchedUoms.length > 0 && !createFormData.primary_uom_id) {
      setCreateFormData(prev => ({ ...prev, primary_uom_id: fetchedUoms[0].id }));
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTab]);

  // Handle Group Selection change in Create Modal to generate Group Initials code (e.g. AG0012)
  const handleGroupChange = async (groupId: string) => {
    setCreateFormData(prev => ({ ...prev, item_group_id: groupId }));
    const grp = itemGroups.find(g => g.id === groupId);
    if (grp) {
      setCodeGenerating(true);
      const generatedCode = await generateNextItemCode(grp.name, grp.code);
      setCreateFormData(prev => ({ ...prev, item_code: generatedCode }));
      setCodeGenerating(false);
    }
  };

  // Open Create Modal and trigger initial auto-code generation
  const handleOpenCreateModal = async () => {
    setIsCreateModalOpen(true);
    const defaultGrp = itemGroups[0];
    const defaultUom = uoms[0];

    setCreateResourceTypeSearchQuery('Material');
    setCreateGroupSearchQuery(defaultGrp ? `${defaultGrp.name} (${defaultGrp.code})` : '');
    setCreateUomSearchQuery(defaultUom ? `${formatUomDisplay(defaultUom.code)} - ${defaultUom.name}` : '');
    setCreateGstSearchQuery('18');

    if (defaultGrp) {
      setCodeGenerating(true);
      const generatedCode = await generateNextItemCode(defaultGrp.name, defaultGrp.code);
      setCreateFormData({
        resource_type: 'material',
        item_code: generatedCode,
        item_group_id: defaultGrp.id,
        item_description: '',
        primary_uom_id: defaultUom?.id || '',
        tax_rate: 18,
        lead_period_days: 3,
        status: 'active'
      });
      setCodeGenerating(false);
    }
  };

  // Open Edit Modal for a given item or currently selected item
  const handleOpenEditModal = (targetItem?: ItemRecord) => {
    const itemToEdit = targetItem || selectedItem;
    setEditSearchQuery('');
    setEditUomSearchQuery('');
    
    if (itemToEdit) {
      setSelectedEditItem(itemToEdit);
      const matchedUom = uoms.find(u => u.id === itemToEdit.primary_uom_id);
      setEditUomSearchQuery(matchedUom ? `${formatUomDisplay(matchedUom.code)} - ${matchedUom.name}` : '');
      setEditFormData({
        id: itemToEdit.id,
        resource_type: itemToEdit.resource_type,
        item_code: itemToEdit.item_code,
        item_group_id: itemToEdit.item_group_id || itemGroups[0]?.id || '',
        item_description: itemToEdit.item_description,
        primary_uom_id: itemToEdit.primary_uom_id || uoms[0]?.id || '',
        tax_rate: Number(itemToEdit.tax_rate) || 0,
        lead_period_days: Number(itemToEdit.lead_period_days) || 0,
        status: itemToEdit.status,
        is_inactive: itemToEdit.is_inactive
      });
    } else {
      setSelectedEditItem(null);
      setEditFormData({
        id: '',
        resource_type: 'material',
        item_code: '',
        item_group_id: '',
        item_description: '',
        primary_uom_id: '',
        tax_rate: 18,
        lead_period_days: 3,
        status: 'active',
        is_inactive: false
      });
    }
    setIsEditModalOpen(true);
  };

  // Handle Create Form Submit
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createFormData.item_description.trim()) {
      alert('Please enter an item description.');
      return;
    }

    setSubmitting(true);
    const result = await createItem({
      resource_type: createFormData.resource_type,
      item_code: createFormData.item_code,
      item_group_id: createFormData.item_group_id || itemGroups[0]?.id,
      item_description: createFormData.item_description,
      primary_uom_id: createFormData.primary_uom_id || uoms[0]?.id,
      tax_rate: Number(createFormData.tax_rate) || 0,
      lead_period_days: Number(createFormData.lead_period_days) || 0,
      status: createFormData.status
    });

    setSubmitting(false);
    if (result.success) {
      setIsCreateModalOpen(false);
      loadData();
    } else {
      alert('Error creating item: ' + result.error);
    }
  };

  // Handle Edit Form Submit (Updates Supabase live)
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editFormData.item_description.trim()) {
      alert('Please enter an item description.');
      return;
    }

    setSubmitting(true);
    const result = await updateItem(editFormData.id, {
      resource_type: editFormData.resource_type,
      item_code: editFormData.item_code,
      item_group_id: editFormData.item_group_id,
      item_description: editFormData.item_description,
      primary_uom_id: editFormData.primary_uom_id,
      tax_rate: Number(editFormData.tax_rate),
      lead_period_days: Number(editFormData.lead_period_days),
      status: editFormData.status,
      is_inactive: editFormData.is_inactive
    });

    setSubmitting(false);
    if (result.success) {
      setIsEditModalOpen(false);
      setSelectedItem(null);
      loadData();
    } else {
      alert('Error updating item: ' + result.error);
    }
  };

  const handleToggleInactive = async (item: ItemRecord) => {
    const newInactive = !item.is_inactive;
    const success = await updateItemStatus(item.id, item.status, newInactive);
    if (success) {
      setItems(prev =>
        prev.map(i => (i.id === item.id ? { ...i, is_inactive: newInactive } : i))
      );
    }
  };

  // Filtered items for display
  const filteredItems = items.filter(item => {
    if (activeTab === 'inactive' && !item.is_inactive) return false;
    if (activeTab === 'draft' && item.status !== 'draft') return false;
    if (['material', 'equipment', 'service'].includes(activeTab) && item.resource_type !== activeTab) return false;

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      item.item_code.toLowerCase().includes(q) ||
      item.item_description.toLowerCase().includes(q) ||
      (item.group_name && item.group_name.toLowerCase().includes(q))
    );
  });

  // Calculate statistics
  const stats = {
    total: items.length,
    materials: items.filter(i => i.resource_type === 'material').length,
    equipment: items.filter(i => i.resource_type === 'equipment').length,
    services: items.filter(i => i.resource_type === 'service').length,
    active: items.filter(i => i.status === 'active' && !i.is_inactive).length,
    inactive: items.filter(i => i.is_inactive).length
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-semibold text-primary uppercase tracking-normal bg-orange-50 dark:bg-orange-950/30 px-3 py-1 rounded-full border border-orange-100 dark:border-orange-900/40">
            Master Data Management
          </span>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-normal text-gray-900 dark:text-white mt-2">
            Item Master Catalog
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Central single source of truth for materials, equipment, services, tax rates, and units of measure.
          </p>
        </div>

        {/* Top Header Action Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 text-gray-800 dark:text-gray-200 font-bold text-xs rounded-2xl shadow-sm transition-all"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            Excel Bulk Import
          </button>

          <button
            onClick={() => handleOpenEditModal()}
            className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 text-gray-800 dark:text-gray-200 font-bold text-xs rounded-2xl shadow-sm transition-all"
          >
            <Edit3 className="w-4 h-4 text-blue-600" />
            Edit Item
          </button>

          <button
            onClick={handleOpenCreateModal}
            className="flex items-center gap-2 px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs rounded-2xl shadow-lg shadow-orange-600/20 transition-all"
          >
            <Plus className="w-4 h-4" />
            Create New Item
          </button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white dark:bg-gray-900 p-4 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Total Items</p>
            <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">{stats.total}</p>
          </div>
          <Boxes className="w-8 h-8 text-orange-500 opacity-80" />
        </div>

        <div className="bg-white dark:bg-gray-900 p-4 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Materials</p>
            <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{stats.materials}</p>
          </div>
          <Package className="w-8 h-8 text-emerald-500 opacity-80" />
        </div>

        <div className="bg-white dark:bg-gray-900 p-4 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Equipment</p>
            <p className="text-xl font-bold text-blue-600 dark:text-blue-400 mt-1">{stats.equipment}</p>
          </div>
          <Wrench className="w-8 h-8 text-blue-500 opacity-80" />
        </div>

        <div className="bg-white dark:bg-gray-900 p-4 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Services</p>
            <p className="text-xl font-bold text-purple-600 dark:text-purple-400 mt-1">{stats.services}</p>
          </div>
          <Truck className="w-8 h-8 text-purple-500 opacity-80" />
        </div>

        <div className="bg-white dark:bg-gray-900 p-4 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Active & Approved</p>
            <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{stats.active}</p>
          </div>
          <CheckCircle2 className="w-8 h-8 text-emerald-500 opacity-80" />
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white dark:bg-gray-900 p-5 rounded-3xl border border-gray-100 dark:border-gray-850 shadow-sm space-y-5">
        {/* ONE CLEAN LINE CONTROL BAR: Search Bar (Left) + Resource Tabs (Right) */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-gray-100 dark:border-gray-800 pb-4">
          {/* Left Side: Search Bar */}
          <div className="flex items-center gap-2.5 w-full lg:w-auto">
            <div className="relative w-full lg:w-96">
              <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search code or description..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-xs bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-white rounded-xl border border-gray-200 dark:border-gray-800 focus:outline-none focus:border-orange-500 transition-all font-medium"
              />
            </div>

            <button
              onClick={loadData}
              className="p-2 bg-gray-50 dark:bg-gray-950 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl text-gray-400 border border-gray-200 dark:border-gray-800 flex-shrink-0"
              title="Refresh Data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Right Side: Resource Tabs (Renamed "All Items", In One Line) */}
          <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto">
            {[
              { id: 'all', label: 'All Items' },
              { id: 'material', label: 'Materials' },
              { id: 'equipment', label: 'Equipment' },
              { id: 'service', label: 'Services' },
              { id: 'draft', label: 'Drafts' },
              { id: 'inactive', label: 'Inactive' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-orange-600 text-white shadow-md shadow-orange-600/20'
                    : 'bg-gray-50 dark:bg-gray-950 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-12 text-center text-xs text-gray-400 flex items-center justify-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-orange-500" />
              Fetching Item Master items from Supabase...
            </div>
          ) : (
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800 text-gray-400 uppercase text-[10px] tracking-wider">
                  <th className="pb-3 font-bold">Type</th>
                  <th className="pb-3 font-bold">Item Code</th>
                  <th className="pb-3 font-bold">Item Description</th>
                  <th className="pb-3 font-bold">Item Group</th>
                  <th className="pb-3 font-bold text-center">Base UOM</th>
                  <th className="pb-3 font-bold text-right">GST Rate</th>
                  <th className="pb-3 font-bold text-center">Lead Days</th>
                  <th className="pb-3 font-bold text-center">Status</th>
                  <th className="pb-3 font-bold text-right">Status Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-850">
                {filteredItems.slice(0, 300).map(item => {
                  const isRowSelected = selectedItem?.id === item.id;

                  return (
                    <tr
                      key={item.id}
                      onClick={() => setSelectedItem(item)}
                      className={`cursor-pointer transition-colors ${
                        isRowSelected
                          ? 'bg-orange-50/80 dark:bg-orange-950/40 ring-1 ring-orange-500/30'
                          : 'hover:bg-gray-50/60 dark:hover:bg-gray-850/40'
                      }`}
                    >
                      {/* Resource Type */}
                      <td className="py-3">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border ${
                            item.resource_type === 'material'
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/40'
                              : item.resource_type === 'equipment'
                              ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/40'
                              : 'bg-purple-50 border-purple-200 text-purple-700 dark:bg-purple-950/40'
                          }`}
                        >
                          {item.resource_type}
                        </span>
                      </td>

                      {/* Item Code */}
                      <td className="py-3 font-mono font-bold text-orange-600 dark:text-orange-400">
                        {item.item_code}
                      </td>

                      {/* Description */}
                      <td className="py-3 font-medium text-gray-800 dark:text-gray-200 max-w-xs truncate">
                        {item.item_description}
                      </td>

                      {/* Group */}
                      <td className="py-3 text-gray-500 dark:text-gray-400 font-medium">
                        {item.group_name}
                      </td>

                      {/* UOM */}
                      <td className="py-3 text-center">
                        <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 font-bold text-[10px] text-gray-700 dark:text-gray-300 rounded-md">
                          {formatUomDisplay(item.uom_code)}
                        </span>
                      </td>

                      {/* Tax Rate */}
                      <td className="py-3 text-right font-medium text-gray-700 dark:text-gray-300">
                        {item.tax_rate}%
                      </td>

                      {/* Lead Period */}
                      <td className="py-3 text-center font-medium text-gray-500">
                        {item.lead_period_days} Days
                      </td>

                      {/* Status */}
                      <td className="py-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            item.is_inactive
                              ? 'bg-gray-100 border-gray-200 text-gray-500 dark:bg-gray-800'
                              : item.status === 'active'
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/40'
                              : 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/40'
                          }`}
                        >
                          {item.is_inactive ? 'Inactive' : item.status === 'active' ? 'Approved' : 'Draft'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3 text-right">
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            handleToggleInactive(item);
                          }}
                          className="text-[11px] font-bold text-orange-600 dark:text-orange-400 hover:underline"
                        >
                          {item.is_inactive ? 'Activate' : 'Deactivate'}
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {filteredItems.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-gray-400">
                      No matching items found in Supabase database.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* CREATE NEW ITEM MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-950/50">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-orange-500" />
                <h2 className="text-lg font-bold text-gray-900 dark:text-white font-heading">
                  Create New Item Master Entry
                </h2>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-full text-gray-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {/* Resource Type Searchable Autocomplete */}
                <div className="relative">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-1">
                    Resource Type
                  </label>
                  <input
                    type="text"
                    value={createResourceTypeSearchQuery}
                    onFocus={() => setCreateResourceTypeDropdownOpen(true)}
                    onBlur={() => setCreateResourceTypeDropdownOpen(false)}
                    onChange={e => {
                      setCreateResourceTypeSearchQuery(e.target.value);
                      setCreateResourceTypeDropdownOpen(true);
                      
                      // Sync typed value if it matches any resource type
                      const val = e.target.value.toLowerCase();
                      if (['material', 'equipment', 'service'].includes(val)) {
                        setCreateFormData(prev => ({ ...prev, resource_type: val as any }));
                      }
                    }}
                    className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl focus:outline-none focus:border-orange-500 text-gray-900 dark:text-white font-medium"
                  />
                  {createResourceTypeDropdownOpen && (
                    <div className="absolute z-50 left-0 right-0 top-full mt-1 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-950 divide-y divide-gray-100 dark:divide-gray-850 shadow-xl max-h-40 overflow-y-auto">
                      {[
                        { id: 'material', label: 'Material' },
                        { id: 'equipment', label: 'Equipment' },
                        { id: 'service', label: 'Service' }
                      ]
                        .filter(opt => opt.label.toLowerCase().includes(createResourceTypeSearchQuery.toLowerCase()))
                        .map(opt => (
                          <div
                            key={opt.id}
                            onMouseDown={() => {
                              setCreateFormData(prev => ({ ...prev, resource_type: opt.id as any }));
                              setCreateResourceTypeSearchQuery(opt.label);
                              setCreateResourceTypeDropdownOpen(false);
                            }}
                            className="p-2.5 text-xs hover:bg-orange-50 dark:hover:bg-orange-950/20 cursor-pointer font-medium text-gray-900 dark:text-white"
                          >
                            {opt.label}
                          </div>
                        ))}
                    </div>
                  )}
                </div>

                {/* Item Group Searchable Autocomplete */}
                <div className="relative">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-1">
                    Item Group *
                  </label>
                  <input
                    type="text"
                    placeholder="Search Item Group..."
                    value={createGroupSearchQuery}
                    onFocus={() => setCreateGroupDropdownOpen(true)}
                    onBlur={() => setCreateGroupDropdownOpen(false)}
                    onChange={e => {
                      setCreateGroupSearchQuery(e.target.value);
                      setCreateGroupDropdownOpen(true);
                    }}
                    className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl focus:outline-none focus:border-orange-500 text-gray-900 dark:text-white font-medium"
                  />
                  {createGroupDropdownOpen && (
                    <div className="absolute z-50 left-0 right-0 top-full mt-1 max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-950 divide-y divide-gray-100 dark:divide-gray-850 shadow-xl">
                      {itemGroups
                        .filter(g => {
                          const text = createGroupSearchQuery.toLowerCase();
                          return g.name.toLowerCase().includes(text) || g.code.toLowerCase().includes(text);
                        })
                        .map(g => (
                          <div
                            key={g.id}
                            onMouseDown={() => {
                              handleGroupChange(g.id);
                              setCreateGroupSearchQuery(`${g.name} (${g.code})`);
                              setCreateGroupDropdownOpen(false);
                            }}
                            className="p-2.5 text-xs hover:bg-orange-50 dark:hover:bg-orange-950/20 cursor-pointer flex items-center justify-between font-medium text-gray-900 dark:text-white"
                          >
                            <span>{g.name}</span>
                            <span className="text-[9px] text-gray-400 font-bold">{g.code}</span>
                          </div>
                        ))}
                      {itemGroups.filter(g => {
                        const text = createGroupSearchQuery.toLowerCase();
                        return g.name.toLowerCase().includes(text) || g.code.toLowerCase().includes(text);
                      }).length === 0 && (
                        <div className="p-3 text-center text-xs text-gray-400">
                          No matching Item Groups found.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Item Code (Auto-generated with Group Initials style) */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400 flex items-center justify-between mb-1">
                  <span>Item Code (Group Initials Style)</span>
                  {codeGenerating && <span className="text-orange-500 font-normal animate-pulse">Generating...</span>}
                </label>
                <input
                  type="text"
                  placeholder="Auto-generated e.g. AG0012"
                  value={createFormData.item_code}
                  onChange={e => setCreateFormData({ ...createFormData, item_code: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl focus:outline-none text-gray-900 dark:text-white font-mono font-bold"
                />
              </div>

              {/* Description */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-1">
                  Item Description *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Black Soil 50mm"
                  value={createFormData.item_description}
                  onChange={e => setCreateFormData({ ...createFormData, item_description: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl focus:outline-none text-gray-900 dark:text-white font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Base Unit of Measure (UOM) Autocomplete */}
                <div className="relative">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-1">
                    Base Unit of Measure (UOM) *
                  </label>
                  <input
                    type="text"
                    placeholder="Search UOM..."
                    value={createUomSearchQuery}
                    onFocus={() => setCreateUomDropdownOpen(true)}
                    onBlur={() => setCreateUomDropdownOpen(false)}
                    onChange={e => {
                      setCreateUomSearchQuery(e.target.value);
                      setCreateUomDropdownOpen(true);
                    }}
                    className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl focus:outline-none focus:border-orange-500 text-gray-900 dark:text-white font-medium"
                  />
                  {createUomDropdownOpen && (
                    <div className="absolute z-50 left-0 right-0 top-full mt-1 max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-950 divide-y divide-gray-100 dark:divide-gray-850 shadow-xl">
                      {uoms
                        .filter(u => {
                          const text = createUomSearchQuery.toLowerCase();
                          return u.code.toLowerCase().includes(text) || u.name.toLowerCase().includes(text);
                        })
                        .map(u => (
                          <div
                            key={u.id}
                            onMouseDown={() => {
                              setCreateFormData(prev => ({ ...prev, primary_uom_id: u.id }));
                              setCreateUomSearchQuery(`${formatUomDisplay(u.code)} - ${u.name}`);
                              setCreateUomDropdownOpen(false);
                            }}
                            className="p-2.5 text-xs hover:bg-orange-50 dark:hover:bg-orange-950/20 cursor-pointer flex items-center justify-between font-medium text-gray-900 dark:text-white"
                          >
                            <span>{formatUomDisplay(u.code)}</span>
                            <span className="text-gray-400 text-[10px]">{u.name}</span>
                          </div>
                        ))}
                      {uoms.filter(u => {
                        const text = createUomSearchQuery.toLowerCase();
                        return u.code.toLowerCase().includes(text) || u.name.toLowerCase().includes(text);
                      }).length === 0 && (
                        <div className="p-3 text-center text-xs text-gray-400">
                          No matching UOMs found.
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* GST Tax Rate (%) Autocomplete with Custom Value Entry */}
                <div className="relative">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-1">
                    GST Tax Rate (%) *
                  </label>
                  <input
                    type="text"
                    placeholder="Enter GST rate..."
                    value={createGstSearchQuery}
                    onFocus={() => setCreateGstDropdownOpen(true)}
                    onBlur={() => setCreateGstDropdownOpen(false)}
                    onChange={e => {
                      setCreateGstSearchQuery(e.target.value);
                      setCreateGstDropdownOpen(true);
                      
                      // Support typing custom numeric percentages
                      const rate = Number(e.target.value);
                      if (!isNaN(rate)) {
                        setCreateFormData(prev => ({ ...prev, tax_rate: rate }));
                      }
                    }}
                    className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl focus:outline-none focus:border-orange-500 text-gray-900 dark:text-white font-medium"
                  />
                  {createGstDropdownOpen && (
                    <div className="absolute z-50 left-0 right-0 top-full mt-1 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-950 divide-y divide-gray-100 dark:divide-gray-850 shadow-xl max-h-40 overflow-y-auto">
                      {[0, 5, 12, 18, 28].map(rate => (
                        <div
                          key={rate}
                          onMouseDown={() => {
                            setCreateFormData(prev => ({ ...prev, tax_rate: rate }));
                            setCreateGstSearchQuery(String(rate));
                            setCreateGstDropdownOpen(false);
                          }}
                          className="p-2.5 text-xs hover:bg-orange-50 dark:hover:bg-orange-950/20 cursor-pointer font-medium text-gray-900 dark:text-white"
                        >
                          {rate}% {rate === 0 ? '(Exempt)' : ''}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-1">
                  Lead Period (Days)
                </label>
                <input
                  type="number"
                  min={0}
                  value={createFormData.lead_period_days}
                  onChange={e => setCreateFormData({ ...createFormData, lead_period_days: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl focus:outline-none text-gray-900 dark:text-white font-medium"
                />
              </div>

              {/* Form Actions */}
              <div className="pt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-2 bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs rounded-xl shadow-lg shadow-orange-600/20 disabled:opacity-50"
                >
                  {submitting ? 'Saving to Supabase...' : 'Save & Approve Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT EXISTING ITEM MODAL (Connected to Supabase) */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-blue-50/50 dark:bg-blue-950/50">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-blue-600" />
                <h2 className="text-lg font-bold text-gray-900 dark:text-white font-heading">
                  Edit Item Catalog Entry
                </h2>
              </div>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="p-1 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-full text-gray-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="p-6 space-y-5">
              {/* Search & Select Item section */}
              {!selectedEditItem ? (
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block font-heading">
                    Search and Select Item to Edit
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Type item code or description..."
                      value={editSearchQuery}
                      onChange={e => setEditSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 text-xs bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl focus:outline-none text-gray-900 dark:text-white font-medium"
                    />
                  </div>

                  {/* Suggestions list */}
                  {editSearchQuery.trim().length >= 2 && (
                    <div className="max-h-60 overflow-y-auto border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-950 divide-y divide-gray-100 dark:divide-gray-850 shadow-lg mt-1">
                      {items
                        .filter(
                          item =>
                            item.item_code.toLowerCase().includes(editSearchQuery.toLowerCase()) ||
                            item.item_description.toLowerCase().includes(editSearchQuery.toLowerCase())
                        )
                        .slice(0, 8)
                        .map(item => (
                          <div
                            key={item.id}
                            onClick={() => {
                              setSelectedEditItem(item);
                              const matchedUom = uoms.find(u => u.id === item.primary_uom_id);
                              setEditUomSearchQuery(matchedUom ? `${formatUomDisplay(matchedUom.code)} - ${matchedUom.name}` : '');
                              setEditFormData({
                                id: item.id,
                                resource_type: item.resource_type,
                                item_code: item.item_code,
                                item_group_id: item.item_group_id || '',
                                item_description: item.item_description,
                                primary_uom_id: item.primary_uom_id || '',
                                tax_rate: Number(item.tax_rate) || 0,
                                lead_period_days: Number(item.lead_period_days) || 0,
                                status: item.status,
                                is_inactive: item.is_inactive
                              });
                            }}
                            className="p-3 text-xs hover:bg-blue-50 dark:hover:bg-blue-950/20 cursor-pointer flex items-center justify-between transition-colors"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="font-bold text-gray-900 dark:text-white font-mono">{item.item_code}</div>
                              <div className="text-gray-500 truncate max-w-xs">{item.item_description}</div>
                            </div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded ml-2 flex-shrink-0">
                              {item.resource_type}
                            </span>
                          </div>
                        ))}
                      {items.filter(
                        item =>
                          item.item_code.toLowerCase().includes(editSearchQuery.toLowerCase()) ||
                          item.item_description.toLowerCase().includes(editSearchQuery.toLowerCase())
                      ).length === 0 && (
                        <div className="p-3 text-xs text-gray-400 text-center">No matching items found.</div>
                      )}
                    </div>
                  )}

                  <div className="p-4 border border-dashed border-gray-200 dark:border-gray-800 rounded-2xl text-center text-xs text-gray-400">
                    Type 2 or more characters to search existing items.
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Selected Item Info (Display only, Read-Only) */}
                  <div className="bg-gray-50 dark:bg-gray-950 p-4 rounded-2xl border border-gray-100 dark:border-gray-850 flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase border bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/40">
                          {selectedEditItem.resource_type}
                        </span>
                        <span className="text-xs font-semibold text-gray-400">
                          {selectedEditItem.group_name || 'General'}
                        </span>
                      </div>
                      <h3 className="font-mono font-bold text-sm text-orange-600 dark:text-orange-400">
                        {selectedEditItem.item_code}
                      </h3>
                      <p className="text-xs text-gray-600 dark:text-gray-300 font-medium">
                        {selectedEditItem.item_description}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedEditItem(null);
                        setEditSearchQuery('');
                      }}
                      className="text-[11px] font-bold text-blue-600 hover:text-blue-700 hover:underline"
                    >
                      Change Selection
                    </button>
                  </div>

                  {/* ONLY THE EDITABLE FIELDS */}
                  <div className="space-y-4 pt-2">
                    {/* GST/Tax Rate */}
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-1">
                        GST / Tax Rate (%) *
                      </label>
                      <select
                        value={editFormData.tax_rate}
                        onChange={e => setEditFormData({ ...editFormData, tax_rate: Number(e.target.value) })}
                        className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl focus:outline-none text-gray-900 dark:text-white font-medium"
                      >
                        <option value={0}>0% (Exempt)</option>
                        <option value={5}>5%</option>
                        <option value={12}>12%</option>
                        <option value={18}>18%</option>
                        <option value={28}>28%</option>
                      </select>
                    </div>

                    {/* Lead Period */}
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-1">
                        Lead Period (Days) *
                      </label>
                      <input
                        type="number"
                        min={0}
                        required
                        value={editFormData.lead_period_days}
                        onChange={e => setEditFormData({ ...editFormData, lead_period_days: Number(e.target.value) })}
                        className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl focus:outline-none text-gray-900 dark:text-white font-medium"
                      />
                    </div>

                    {/* Unit (Searchable Autocomplete Dropdown UOM) */}
                    <div className="space-y-1.5 relative">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block">
                        Base Unit of Measure (UOM) *
                      </label>
                      <input
                        type="text"
                        placeholder="Search Unit..."
                        value={editUomSearchQuery}
                        onFocus={() => setUomDropdownOpen(true)}
                        onBlur={() => setUomDropdownOpen(false)}
                        onChange={e => {
                          setEditUomSearchQuery(e.target.value);
                          setUomDropdownOpen(true);
                        }}
                        className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl focus:outline-none focus:border-blue-500 text-gray-900 dark:text-white font-medium"
                      />
                      
                      {/* Floating suggestion list */}
                      {uomDropdownOpen && (
                        <div className="absolute z-50 left-0 right-0 top-full mt-1 max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-950 divide-y divide-gray-100 dark:divide-gray-850 shadow-xl">
                          {uoms
                            .filter(u => {
                              const text = editUomSearchQuery.toLowerCase();
                              return u.code.toLowerCase().includes(text) || u.name.toLowerCase().includes(text);
                            })
                            .map(u => (
                              <div
                                key={u.id}
                                onMouseDown={() => {
                                  setEditFormData(prev => ({ ...prev, primary_uom_id: u.id }));
                                  setEditUomSearchQuery(`${formatUomDisplay(u.code)} - ${u.name}`);
                                  setUomDropdownOpen(false);
                                }}
                                className={`p-2.5 text-xs hover:bg-blue-50 dark:hover:bg-blue-950/20 cursor-pointer flex items-center justify-between font-medium ${
                                  editFormData.primary_uom_id === u.id
                                    ? 'bg-blue-50/50 dark:bg-blue-950/10 text-blue-600 font-bold'
                                    : ''
                                }`}
                              >
                                <span>{formatUomDisplay(u.code)}</span>
                                <span className="text-gray-400 text-[10px]">{u.name}</span>
                              </div>
                            ))}
                          {uoms.filter(u => {
                            const text = editUomSearchQuery.toLowerCase();
                            return u.code.toLowerCase().includes(text) || u.name.toLowerCase().includes(text);
                          }).length === 0 && (
                            <div className="p-3 text-center text-xs text-gray-400">
                              No matching UOMs found.
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Status (Active/Inactive) */}
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-1">
                        Status (Active / Inactive) *
                      </label>
                      <select
                        value={editFormData.is_inactive ? 'inactive' : 'active'}
                        onChange={e => setEditFormData({ ...editFormData, is_inactive: e.target.value === 'inactive' })}
                        className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl focus:outline-none text-gray-900 dark:text-white font-medium"
                      >
                        <option value="active">Active (Approved)</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Form Actions */}
              <div className="pt-4 flex justify-end gap-2 border-t border-gray-100 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-xl"
                >
                  Cancel
                </button>
                {selectedEditItem && (
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-600/20 disabled:opacity-50"
                  >
                    {submitting ? 'Updating Supabase...' : 'Save & Update Item'}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Excel Bulk Importer Modal */}
      <ExcelItemImporterModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onSuccess={() => loadData()}
      />
    </div>
  );
}
