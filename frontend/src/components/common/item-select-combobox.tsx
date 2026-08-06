'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, ChevronDown, Check, Boxes, Package, Loader2, X } from 'lucide-react';
import { fetchActiveItems, ItemRecord } from '@/lib/services/items-service';

interface ItemSelectComboboxProps {
  value?: string; // item_code or item_id
  onSelectItem: (item: ItemRecord) => void;
  placeholder?: string;
  resourceType?: 'material' | 'equipment' | 'service';
  disabled?: boolean;
  className?: string;
}

export function ItemSelectCombobox({
  value,
  onSelectItem,
  placeholder = 'Select or search item...',
  resourceType = 'material',
  disabled = false,
  className = ''
}: ItemSelectComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [items, setItems] = useState<ItemRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Load items from Supabase
  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      setLoading(true);
      const data = await fetchActiveItems(resourceType);
      if (isMounted) {
        setItems(data);
        setLoading(false);
      }
    }
    loadData();
    return () => {
      isMounted = false;
    };
  }, [resourceType]);

  // Selected item object
  const selectedItem = useMemo(() => {
    return items.find((i) => i.item_code === value || i.id === value);
  }, [items, value]);

  // Filtered items based on search query
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items.slice(0, 100); // Top 100 items by default

    const q = searchQuery.toLowerCase().trim();
    return items
      .filter(
        (item) =>
          item.item_code.toLowerCase().includes(q) ||
          item.item_description.toLowerCase().includes(q) ||
          (item.group_name && item.group_name.toLowerCase().includes(q))
      )
      .slice(0, 100); // Limit to top 100 search results for high 60fps performance
  }, [items, searchQuery]);

  // Handle outside click to close popover
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard navigation logic
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < filteredItems.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : filteredItems.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredItems[selectedIndex]) {
        handleSelect(filteredItems[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const handleSelect = (item: ItemRecord) => {
    onSelectItem(item);
    setIsOpen(false);
    setSearchQuery('');
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* Input Trigger Field */}
      <div
        onClick={() => {
          if (!disabled) {
            setIsOpen(!isOpen);
            setTimeout(() => inputRef.current?.focus(), 50);
          }
        }}
        className={`flex items-center justify-between gap-2 px-3 py-2 text-xs bg-white dark:bg-gray-900 border rounded-xl cursor-pointer transition-all ${
          isOpen
            ? 'border-orange-500 ring-2 ring-orange-500/20 shadow-md'
            : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700'
        } ${disabled ? 'opacity-50 cursor-not-allowed bg-gray-50 dark:bg-gray-950' : ''}`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Package className="w-4 h-4 text-orange-600 flex-shrink-0" />
          {selectedItem ? (
            <div className="truncate">
              <span className="font-bold text-gray-900 dark:text-white mr-2">
                [{selectedItem.item_code}]
              </span>
              <span className="text-gray-700 dark:text-gray-300 font-medium">
                {selectedItem.item_description}
              </span>
            </div>
          ) : (
            <span className="text-gray-400 dark:text-gray-500 font-normal truncate">
              {placeholder}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {selectedItem && (
            <span className="px-2 py-0.5 text-[10px] font-bold bg-orange-50 dark:bg-orange-950/40 text-orange-600 rounded-md border border-orange-200 dark:border-orange-900/40">
              {selectedItem.uom_code}
            </span>
          )}
          <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {/* Search Popover Dropdown */}
      {isOpen && (
        <div className="absolute z-50 left-0 right-0 mt-1.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[380px] animate-in fade-in-50 zoom-in-95 duration-100">
          {/* Popover Header Search Bar */}
          <div className="p-2.5 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-950/50 flex items-center gap-2">
            <Search className="w-4 h-4 text-gray-400 ml-1 flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Type code, description, or category (e.g. AG0011, Cement)..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSelectedIndex(0);
              }}
              onKeyDown={handleKeyDown}
              className="w-full bg-transparent text-xs text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="p-1 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-full text-gray-400"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Column Header Grid Bar */}
          <div className="grid grid-cols-12 gap-2 px-3 py-1.5 bg-gray-100/70 dark:bg-gray-950 text-[10px] font-bold uppercase tracking-wider text-gray-400 border-b border-gray-100 dark:border-gray-800">
            <div className="col-span-3">Item Code</div>
            <div className="col-span-5">Description</div>
            <div className="col-span-2">Group</div>
            <div className="col-span-1 text-center">UOM</div>
            <div className="col-span-1 text-right">GST</div>
          </div>

          {/* Results List */}
          <div ref={listRef} className="overflow-y-auto flex-1 divide-y divide-gray-50 dark:divide-gray-850">
            {loading ? (
              <div className="p-8 text-center text-xs text-gray-400 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-orange-500" />
                Loading Item Master catalog...
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="p-8 text-center text-xs text-gray-400 space-y-1">
                <Boxes className="w-6 h-6 mx-auto text-gray-300 dark:text-gray-700 mb-2" />
                <p className="font-semibold text-gray-600 dark:text-gray-300">No matching items found</p>
                <p className="text-[11px]">Try searching by item code (e.g. AG0011) or description</p>
              </div>
            ) : (
              filteredItems.map((item, index) => {
                const isSelected = selectedItem?.id === item.id || selectedItem?.item_code === item.item_code;
                const isHighlighted = index === selectedIndex;

                return (
                  <div
                    key={item.id || item.item_code}
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={`grid grid-cols-12 gap-2 px-3 py-2.5 text-xs cursor-pointer items-center transition-colors ${
                      isHighlighted
                        ? 'bg-orange-50/80 dark:bg-orange-950/40 text-gray-900 dark:text-white'
                        : isSelected
                        ? 'bg-gray-50 dark:bg-gray-850/50'
                        : 'hover:bg-gray-50/50 dark:hover:bg-gray-850/30 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {/* Item Code */}
                    <div className="col-span-3 font-mono font-bold text-orange-600 dark:text-orange-400 truncate flex items-center gap-1.5">
                      {isSelected && <Check className="w-3 h-3 text-orange-600 flex-shrink-0" />}
                      {item.item_code}
                    </div>

                    {/* Description */}
                    <div className="col-span-5 font-medium truncate text-gray-800 dark:text-gray-200">
                      {item.item_description}
                    </div>

                    {/* Group */}
                    <div className="col-span-2 text-[11px] text-gray-500 dark:text-gray-400 truncate">
                      {item.group_name || 'General'}
                    </div>

                    {/* UOM */}
                    <div className="col-span-1 text-center font-bold text-[10px] text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">
                      {item.uom_code || 'NOS'}
                    </div>

                    {/* GST Tax Rate */}
                    <div className="col-span-1 text-right font-medium text-[11px] text-gray-500 dark:text-gray-400">
                      {item.tax_rate}%
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer Info Bar */}
          <div className="px-3 py-1.5 bg-gray-50 dark:bg-gray-950 border-t border-gray-100 dark:border-gray-800 text-[10px] text-gray-400 flex items-center justify-between">
            <span>Showing {filteredItems.length} active items</span>
            <span>Use ↑ ↓ to navigate, Enter to select</span>
          </div>
        </div>
      )}
    </div>
  );
}
