'use client';

// PR item-details table: clean ERP grid with all 26 editable columns.

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Plus, AlertTriangle } from 'lucide-react';
import type { PrFormLine } from '@/lib/erp/purchase-requisition/types';

export const STANDARD_UNITS = [
  'NOS',
  'KGS',
  'BAGS',
  'BRASS',
  'BUCKET',
  'BOX',
  'PACKET',
  'BUNDLE',
  'RFT',
  'SQ.FT.',
  'LTR',
  'MT',
  'CUM',
  'SET',
] as const;

export function normalizeUnit(rawUnit?: string | null): string {
  if (!rawUnit || !rawUnit.trim()) return 'NOS';
  const u = rawUnit.trim();
  const lower = u.toLowerCase();

  if (/^(nos|no|number|numbers|pcs|piece|pieces)$/i.test(lower)) return 'NOS';
  if (/^(kg|kgs|kilogram|kilograms)$/i.test(lower)) return 'KGS';
  if (/^(bag|bags|bagsbags)$/i.test(lower)) return 'BAGS';
  if (/^(brass)$/i.test(lower)) return 'BRASS';
  if (/^(bucket|buckets)$/i.test(lower)) return 'BUCKET';
  if (/^(box|boxes)$/i.test(lower)) return 'BOX';
  if (/^(packet|packets|pkt)$/i.test(lower)) return 'PACKET';
  if (/^(bundle|bundles|bndl)$/i.test(lower)) return 'BUNDLE';
  if (/^(rn\.ft|rnft|rft|running feet|running foot)$/i.test(lower)) return 'RFT';
  if (/^(sqf|sqft|sq\.ft\.|sq\.ft|square feet)$/i.test(lower)) return 'SQ.FT.';
  if (/^(lit|liter|liters|litre|litres|ltr)$/i.test(lower)) return 'LTR';
  if (/^(mt|metric ton|ton|tons)$/i.test(lower)) return 'MT';
  if (/^(cum|cubic meter|cubic metre)$/i.test(lower)) return 'CUM';
  if (/^(set|sets)$/i.test(lower)) return 'SET';

  return u.toUpperCase();
}

function useDropdownPosition(isOpen: boolean, search: string) {
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);
  const [dropdownHeight, setDropdownHeight] = useState(240);
  const containerRef = useRef<HTMLDivElement>(null);

  const dropdownRef = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      const height = node.getBoundingClientRect().height;
      if (height > 0 && height !== dropdownHeight) {
        setDropdownHeight(height);
      }
    }
  }, [dropdownHeight]);

  const updateCoords = useCallback(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      
      let top = rect.bottom + window.scrollY;
      if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
        top = rect.top - dropdownHeight + window.scrollY - 4;
      } else {
        top = rect.bottom + window.scrollY + 4;
      }
      
      setCoords({
        top,
        left: rect.left + window.scrollX,
        width: rect.width,
      });
    }
  }, [dropdownHeight]);

  useEffect(() => {
    if (isOpen) {
      updateCoords();
      window.addEventListener("scroll", updateCoords, true);
      window.addEventListener("resize", updateCoords);
      return () => {
        window.removeEventListener("scroll", updateCoords, true);
        window.removeEventListener("resize", updateCoords);
      };
    }
  }, [isOpen, updateCoords, search]);

  return {
    containerRef,
    dropdownRef,
    coords,
  };
}

import { useCallback } from 'react';

function SearchableUnitInput({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (val: string) => void;
  disabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const filtered = isTyping && value.trim() !== ''
    ? STANDARD_UNITS.filter((u) => u.toLowerCase().includes(value.trim().toLowerCase()))
    : STANDARD_UNITS;

  const { containerRef, dropdownRef, coords } = useDropdownPosition(isOpen, value);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const clickedEl = e.target as HTMLElement;
      if (
        (containerRef.current && containerRef.current.contains(clickedEl)) ||
        clickedEl.closest(".portal-dropdown-menu")
      ) {
        return;
      }
      setIsOpen(false);
      setIsTyping(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [containerRef]);

  if (disabled) return <span className="font-bold text-foreground">{value || 'NOS'}</span>;

  return (
    <div ref={containerRef} className="relative w-24 mx-auto">
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setIsTyping(true);
          setIsOpen(true);
        }}
        onFocus={() => {
          setIsTyping(false);
          setIsOpen(true);
        }}
        placeholder="Unit"
        className="w-full rounded border border-border bg-background px-2 py-1 text-xs text-center font-bold outline-none focus:border-primary uppercase"
      />
      {mounted && isOpen && coords && createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: "absolute",
            top: `${coords.top}px`,
            left: `${coords.left}px`,
            width: `${coords.width}px`,
            zIndex: 9999,
          }}
          className="portal-dropdown-menu max-h-48 overflow-y-auto rounded-lg border border-border bg-popover text-popover-foreground shadow-xl text-left"
        >
          <div className="py-1">
            {filtered.length > 0 ? (
              filtered.map((u) => (
                <button
                  key={u}
                  type="button"
                  className={`w-full px-2.5 py-1 text-xs font-semibold transition-colors hover:bg-accent hover:text-accent-foreground cursor-pointer ${
                    u.toLowerCase() === (value || '').trim().toLowerCase() ? 'bg-accent text-primary font-extrabold' : ''
                  }`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange(u);
                    setIsOpen(false);
                    setIsTyping(false);
                  }}
                >
                  {u}
                </button>
              ))
            ) : (
              <div className="px-2.5 py-1.5 text-[10px] text-muted-foreground italic">
                Custom: &quot;{value}&quot;
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Select or type...",
  disabled = false,
  disabledPlaceholder = "Select parent first",
  containerClassName = "relative w-full min-w-[180px]",
}: {
  options: string[];
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  disabled?: boolean;
  disabledPlaceholder?: string;
  containerClassName?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState(value || "");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setSearch(value || "");
  }, [value]);

  const filtered = options.filter((opt) =>
    (opt || "").toLowerCase().includes(search.toLowerCase())
  ).slice(0, 50);

  const { containerRef, dropdownRef, coords } = useDropdownPosition(isOpen, search);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const clickedEl = e.target as HTMLElement;
      if (
        (containerRef.current && containerRef.current.contains(clickedEl)) ||
        clickedEl.closest(".portal-dropdown-menu")
      ) {
        return;
      }
      setIsOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [containerRef]);

  if (disabled) {
    return (
      <textarea
        value=""
        disabled
        placeholder={disabledPlaceholder}
        rows={3}
        className="w-full rounded border border-border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground outline-none cursor-not-allowed whitespace-normal break-words resize-none min-h-[58px]"
      />
    );
  }

  return (
    <div ref={containerRef} className={containerClassName}>
      <textarea
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          onChange(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => {
          setIsOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            (e.target as HTMLTextAreaElement).blur();
          }
        }}
        placeholder={placeholder}
        rows={3}
        className="w-full rounded border border-border bg-background px-2.5 py-1 text-xs outline-none focus:border-primary font-medium whitespace-normal break-words resize-none min-h-[58px]"
      />
      {mounted && isOpen && coords && createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: "absolute",
            top: `${coords.top}px`,
            left: `${coords.left}px`,
            width: `${Math.max(coords.width, 240)}px`,
            zIndex: 9999,
          }}
          className="portal-dropdown-menu max-h-60 overflow-y-auto rounded-lg border border-border bg-popover text-popover-foreground shadow-xl text-left"
        >
          <div className="py-1 divide-y divide-border/20 text-left bg-popover">
            {filtered.length > 0 ? (
              filtered.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  className={`w-full px-3 py-2 text-left text-xs font-semibold transition-colors hover:bg-accent hover:text-accent-foreground cursor-pointer ${
                    opt === value ? "bg-accent text-primary font-bold" : "text-foreground bg-popover"
                  }`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange(opt);
                    setSearch(opt);
                    setIsOpen(false);
                  }}
                >
                  <span className="truncate block max-w-xs">{opt}</span>
                </button>
              ))
            ) : (
              <div className="px-3 py-3 text-xs text-muted-foreground italic text-center">
                No matching options found. Use custom: &quot;{search}&quot;
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export function SearchableItemInput({
  value,
  items,
  onSelectItem,
  onChangeSearch,
  placeholder = "Search item...",
  className = "",
  containerClassName = "relative w-full min-w-[200px]",
}: {
  value: string;
  items: any[];
  onSelectItem: (item: any) => void;
  onChangeSearch: (val: string) => void;
  placeholder?: string;
  className?: string;
  containerClassName?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState(value || "");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setSearch(value || "");
  }, [value]);

  const filtered = items.filter(
    (item) =>
      (item.item_description || "").toLowerCase().includes(search.toLowerCase()) ||
      (item.item_code || "").toLowerCase().includes(search.toLowerCase())
  ).slice(0, 50);

  const { containerRef, dropdownRef, coords } = useDropdownPosition(isOpen, search);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const clickedEl = e.target as HTMLElement;
      if (
        (containerRef.current && containerRef.current.contains(clickedEl)) ||
        clickedEl.closest(".portal-dropdown-menu")
      ) {
        return;
      }
      setIsOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [containerRef]);

  return (
    <div ref={containerRef} className={containerClassName}>
      <textarea
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          onChangeSearch(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => {
          setIsOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            (e.target as HTMLTextAreaElement).blur();
          }
        }}
        placeholder={placeholder}
        rows={3}
        className={`${className} whitespace-normal break-words resize-none min-h-[58px]`}
      />
      {mounted && isOpen && coords && createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: "absolute",
            top: `${coords.top}px`,
            left: `${coords.left}px`,
            width: `${Math.max(coords.width, 320)}px`,
            zIndex: 9999,
          }}
          className="portal-dropdown-menu max-h-60 overflow-y-auto rounded-lg border border-border bg-popover text-popover-foreground shadow-xl text-left"
        >
          <div className="py-1 divide-y divide-border/20 text-left bg-popover">
            {filtered.length > 0 ? (
              filtered.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="w-full px-3 py-2 text-left text-xs font-semibold transition-colors hover:bg-accent hover:text-accent-foreground cursor-pointer flex flex-col gap-0.5"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onSelectItem(item);
                    setIsOpen(false);
                  }}
                >
                  <span className="font-mono text-orange-600 dark:text-orange-400 text-[10px] font-bold">
                    [{item.item_code}]
                  </span>
                  <span className="text-foreground truncate max-w-xs font-medium">
                    {item.item_description}
                  </span>
                  <span className="text-[9px] text-muted-foreground font-normal">
                    Group: {item.item_groups?.name || 'General'} · UOM: {item.units_of_measure?.code || 'nos'}
                  </span>
                </button>
              ))
            ) : (
              <div className="px-3 py-3 text-xs text-muted-foreground italic text-center">
                No matching items found
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

interface PrItemTableProps {
  lines: PrFormLine[];
  readOnly?: boolean;
  onChangeLine: (key: string, patch: Partial<PrFormLine>) => void;
  onRemoveLine: (key: string, reason: string) => void;
  onAddManual: () => void;
  onBulkRequiredDate: (date: string) => void;
  onBulkDeliveryLocation: (location: string) => void;
  dbItems: any[];
  itemGroups?: string[];
  budgetData: {
    activities: string[];
    subActivitiesByCategory: Record<string, string[]>;
  };
}

function calculateLeadDate(requiredDateStr: string | null | undefined, leadDays: number): string {
  if (!requiredDateStr) return '';
  const date = new Date(requiredDateStr);
  if (isNaN(date.getTime())) return '';
  date.setDate(date.getDate() - leadDays);
  return date.toISOString().slice(0, 10);
}

const TH = 'px-2.5 py-2.5 font-bold uppercase tracking-wider text-[10px] whitespace-nowrap border-r border-border/50';
const TD_NOWRAP = 'px-2.5 py-2 whitespace-nowrap align-middle border-r border-border/40 text-xs';
const TD_WRAP = 'px-2.5 py-2 align-middle border-r border-border/40 text-xs whitespace-normal break-words';
const INPUT = 'w-full rounded border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary font-medium';

export function PrItemTable({
  lines,
  readOnly = false,
  onChangeLine,
  dbItems = [],
  itemGroups = [],
  budgetData = { activities: [], subActivitiesByCategory: {} },
}: PrItemTableProps) {

  function qtyError(line: PrFormLine): string | null {
    if (line.pr_quantity <= 0) return 'Quantity must be greater than zero';
    if (!line.is_non_mr_item && line.remaining_mr_qty != null && line.pr_quantity > line.remaining_mr_qty + 1e-6) {
      return `Exceeds remaining approved qty (${line.remaining_mr_qty})`;
    }
    return null;
  }

  return (
    <div className="space-y-2">


      <div className="overflow-x-auto rounded-xl border border-border shadow-xs">
        <table className="w-full border-collapse text-left text-xs">
          <thead className="bg-muted/90 text-muted-foreground whitespace-nowrap">
            <tr>
              {/* 1. Sr No. */}
              <th className={`${TH} sticky left-0 z-20 bg-card shadow-sm border-r border-border font-bold text-foreground w-12 text-center`}>Sr No.</th>
              {/* Item Code (NEW!) */}
              <th className={`${TH} font-bold text-foreground w-36 min-w-[130px]`}>Item Code</th>
              {/* 2. Item Description */}
              <th className={`${TH} font-bold text-foreground min-w-[280px] max-w-[380px]`}>Item Description</th>
              {/* 3. Activity Name */}
              <th className={`${TH} w-80 min-w-[280px] max-w-[400px]`}>Activity Name</th>
              {/* 4. Sub-Activity */}
              <th className={`${TH} w-80 min-w-[280px] max-w-[400px]`}>Sub-Activity</th>
              {/* 5. Item Group */}
              <th className={`${TH} w-48 min-w-[180px] max-w-[250px]`}>Item Group</th>
              {/* 7. Item Specification */}
              <th className={`${TH} w-72 min-w-[240px] max-w-[350px]`}>Item Specification</th>
              {/* 8. Units (Mandatory) */}
              <th className={`${TH} text-center w-24`}>Units *</th>
              {/* 10. Quantity (Mandatory) (Highlighted in primary blue) */}
              <th className={`${TH} text-right text-primary bg-primary/10 font-bold border-primary/40 w-28`}>Quantity *</th>
              {/* 13. Lead Period */}
              <th className={`${TH} text-center w-24`}>Lead Period</th>
              {/* 14. Lead Date */}
              <th className={`${TH} text-center w-36`}>Lead Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {lines.length === 0 && (
              <tr>
                <td colSpan={11} className="px-3 py-6 text-center text-sm font-medium text-red-500">
                  No items yet. Select from an approved MR above.
                </td>
              </tr>
            )}
            {lines.map((line, idx) => {
              const err = qtyError(line);
              return (
                <tr key={line.key} className={err ? 'bg-red-50/60 dark:bg-red-950/20' : 'hover:bg-muted/20'}>
                  {/* 1. Sr No. */}
                  <td className={`${TD_NOWRAP} sticky left-0 z-10 bg-card font-bold text-center border-r border-border shadow-xs w-12`}>
                    {idx + 1}
                  </td>

                  {/* Item Code (Searchable ComboBox) */}
                  <td className={`${TD_NOWRAP} w-36 min-w-[130px]`}>
                    {!readOnly ? (
                      <SearchableItemInput
                        value={line.item_code || ''}
                        items={dbItems}
                        onSelectItem={(item) => {
                          const leadDays = Number(item.lead_period_days ?? 3);
                          const reqDate = line.required_date || '';
                          const leadDate = calculateLeadDate(reqDate, leadDays);
                          onChangeLine(line.key, {
                            item_id: item.id,
                            item_code: item.item_code,
                            item_description: item.item_description,
                            item_group: item.item_groups?.name || 'General',
                            unit: item.units_of_measure?.code || 'NOS',
                            tax_rate: item.tax_rate != null ? Number(item.tax_rate) : null,
                            lead_period_days: leadDays,
                            lead_period_date: leadDate,
                          });
                        }}
                        onChangeSearch={(val) => {
                          const matched = dbItems.find(
                            (it: any) => (it.item_code || "").toUpperCase() === val.trim().toUpperCase()
                          );
                          if (matched) {
                            const leadDays = Number(matched.lead_period_days ?? 3);
                            const reqDate = line.required_date || '';
                            const leadDate = calculateLeadDate(reqDate, leadDays);
                            onChangeLine(line.key, {
                              item_id: matched.id,
                              item_code: val,
                              item_description: matched.item_description,
                              item_group: matched.item_groups?.name || 'General',
                              unit: matched.units_of_measure?.code || 'NOS',
                              tax_rate: matched.tax_rate != null ? Number(matched.tax_rate) : null,
                              lead_period_days: leadDays,
                              lead_period_date: leadDate,
                            });
                          } else {
                            onChangeLine(line.key, { item_code: val });
                          }
                        }}
                        placeholder="Search code..."
                        className={`${INPUT} w-32 font-mono font-bold text-orange-600 dark:text-orange-400`}
                        containerClassName="relative w-32"
                      />
                    ) : (
                      <span className="font-mono font-semibold text-orange-600 dark:text-orange-400">{line.item_code || '—'}</span>
                    )}
                  </td>

                  {/* 2. Item Description */}
                  <td className={`${TD_WRAP} min-w-[280px] max-w-[380px]`}>
                    {!readOnly ? (
                      <SearchableItemInput
                        value={line.item_description}
                        items={dbItems}
                        onSelectItem={(item) => {
                          const leadDays = Number(item.lead_period_days ?? 3);
                          const reqDate = line.required_date || '';
                          const leadDate = calculateLeadDate(reqDate, leadDays);
                          onChangeLine(line.key, {
                            item_id: item.id,
                            item_code: item.item_code,
                            item_description: item.item_description,
                            item_group: item.item_groups?.name || 'General',
                            unit: item.units_of_measure?.code || 'NOS',
                            tax_rate: item.tax_rate != null ? Number(item.tax_rate) : null,
                            lead_period_days: leadDays,
                            lead_period_date: leadDate,
                          });
                        }}
                        onChangeSearch={(val) => {
                          const matched = dbItems.find(
                            (it: any) => (it.item_description || "").toUpperCase() === val.trim().toUpperCase()
                          );
                          if (matched) {
                            const leadDays = Number(matched.lead_period_days ?? 3);
                            const reqDate = line.required_date || '';
                            const leadDate = calculateLeadDate(reqDate, leadDays);
                            onChangeLine(line.key, {
                              item_id: matched.id,
                              item_code: matched.item_code,
                              item_description: val,
                              item_group: matched.item_groups?.name || 'General',
                              unit: matched.units_of_measure?.code || 'NOS',
                              tax_rate: matched.tax_rate != null ? Number(matched.tax_rate) : null,
                              lead_period_days: leadDays,
                              lead_period_date: leadDate,
                            });
                          } else {
                            onChangeLine(line.key, { item_description: val });
                          }
                        }}
                        placeholder="Search description..."
                        className={`${INPUT} min-w-[265px] font-bold`}
                        containerClassName="relative w-full min-w-[265px]"
                      />
                    ) : (
                      <span className="font-semibold text-foreground">{line.item_description}</span>
                    )}
                  </td>

                  {/* 3. Activity Name */}
                  <td className={`${TD_WRAP} w-80 min-w-[280px] max-w-[400px]`}>
                    {!readOnly ? (
                      <SearchableSelect
                        options={budgetData.activities}
                        value={line.activity_name || line.work_activity || ''}
                        onChange={(val) => {
                          onChangeLine(line.key, {
                            activity_name: val,
                            work_activity: val,
                            sub_activity_name: '',
                          });
                        }}
                        placeholder="Select activity..."
                        containerClassName="relative w-full min-w-[270px]"
                      />
                    ) : (line.activity_name || line.work_activity || '—')}
                  </td>

                  {/* 4. Sub-Activity */}
                  <td className={`${TD_WRAP} w-80 min-w-[280px] max-w-[400px]`}>
                    {!readOnly ? (
                      <SearchableSelect
                        options={line.activity_name ? (budgetData.subActivitiesByCategory[line.activity_name] || []) : []}
                        value={line.sub_activity_name || ''}
                        onChange={(val) => onChangeLine(line.key, { sub_activity_name: val })}
                        placeholder="Select sub-activity..."
                        disabled={!line.activity_name}
                        disabledPlaceholder="Select Activity first"
                        containerClassName="relative w-full min-w-[270px]"
                      />
                    ) : (line.sub_activity_name || '—')}
                  </td>

                  {/* 5. Item Group */}
                  <td className={`${TD_WRAP} w-48 min-w-[180px] max-w-[250px]`}>
                    {!readOnly ? (
                      <SearchableSelect
                        options={itemGroups}
                        value={line.item_group || ''}
                        onChange={(val) => onChangeLine(line.key, { item_group: val })}
                        placeholder="Select group..."
                        containerClassName="relative w-full min-w-[170px]"
                      />
                    ) : (line.item_group || '—')}
                  </td>

                  {/* 7. Item Specification */}
                  <td className={`${TD_WRAP} w-72 min-w-[240px] max-w-[350px]`}>
                    {!readOnly ? (
                      <textarea
                        value={line.specification || ''}
                        onChange={(e) => onChangeLine(line.key, { specification: e.target.value })}
                        placeholder="—"
                        rows={3}
                        className="w-full rounded border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary font-medium whitespace-normal break-words resize-none min-h-[58px]"
                      />
                    ) : (line.specification || '—')}
                  </td>

                  {/* 8. Units (Mandatory) */}
                  <td className={`${TD_NOWRAP} text-center w-24`}>
                    <SearchableUnitInput
                      value={line.unit || ''}
                      onChange={(val) => onChangeLine(line.key, { unit: val })}
                      disabled={readOnly}
                    />
                  </td>

                  {/* 10. Quantity (Mandatory) (Highlighted in primary blue) */}
                  <td className={`${TD_NOWRAP} text-right bg-primary/5 border-x-2 border-primary/30 w-28`}>
                    {readOnly ? (
                      <span className="font-bold text-primary text-sm">{(line.pr_quantity || 0).toLocaleString('en-IN')}</span>
                    ) : (
                      <div className="relative inline-block">
                        <input
                           type="number"
                           min={0}
                           value={line.pr_quantity ?? ''}
                           onChange={(e) => onChangeLine(line.key, { pr_quantity: Number(e.target.value), is_modified: line.is_modified || (!line.is_non_mr_item && Number(e.target.value) !== line.remaining_mr_qty) })}
                           className="w-24 rounded-lg border-2 border-primary bg-primary/10 px-2 py-1 text-right font-bold text-primary focus:bg-background focus:outline-none transition-colors text-xs"
                        />
                        {err && <span title={err} className="ml-1 inline-block align-middle text-red-500"><AlertTriangle className="inline h-3 w-3" /></span>}
                      </div>
                    )}
                  </td>

                  {/* 13. Lead Period */}
                  <td className={`${TD_NOWRAP} text-center w-24`}>
                    {!readOnly ? (
                      <input
                        type="number"
                        value={line.lead_period_days ?? ''}
                        placeholder="—"
                        onChange={(e) => {
                          const val = e.target.value;
                          const leadDays = val === '' ? 3 : Number(val);
                          const reqDate = line.required_date || '';
                          const leadDate = calculateLeadDate(reqDate, leadDays);
                          onChangeLine(line.key, {
                            lead_period_days: val === '' ? undefined : Number(val),
                            lead_period_date: leadDate,
                          });
                        }}
                        className={`${INPUT} w-20 text-right`}
                      />
                    ) : (line.lead_period_days ? `${line.lead_period_days} Days` : '—')}
                  </td>

                  {/* 14. Lead Date */}
                  <td className={`${TD_NOWRAP} text-center w-36`}>
                    {!readOnly ? (
                      <input type="date" value={line.lead_period_date ?? ''} onChange={(e) => onChangeLine(line.key, { lead_period_date: e.target.value })} className={`${INPUT} w-32`} />
                    ) : (line.lead_period_date || '—')}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
