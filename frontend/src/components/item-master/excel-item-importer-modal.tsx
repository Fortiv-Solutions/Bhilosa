'use client';

import React, { useState } from 'react';
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, X, Loader2, Download, ArrowRight } from 'lucide-react';
import { supabase } from '@/lib/services/items-service';

interface ExcelItemImporterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function ExcelItemImporterModal({
  isOpen,
  onClose,
  onSuccess
}: ExcelItemImporterModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [parseResults, setParseResults] = useState<{
    validCount: number;
    errorCount: number;
    rows: any[];
  } | null>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);

  if (!isOpen) return null;

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setLoading(true);

    try {
      // Dynamic import openpyxl/xlsx parser
      const XLSX = await import('xlsx');
      const data = await selectedFile.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

      if (!jsonRows || jsonRows.length <= 1) {
        alert('The uploaded file is empty or missing data rows.');
        setLoading(false);
        return;
      }

      // Analyze headers and normalize
      const parsedRows: any[] = [];
      let valid = 0;
      let errors = 0;

      for (let i = 1; i < jsonRows.length; i++) {
        const r = jsonRows[i];
        if (!r || r.length === 0) continue;

        const resType = String(r[0] || 'Material').trim();
        let itemCode = String(r[1] || '').trim();
        if (itemCode.endsWith('.0')) itemCode = itemCode.slice(0, -2);

        const groupName = String(r[2] || 'General').trim();
        const desc = String(r[3] || '').trim();
        const uomRaw = String(r[4] || 'NOS').trim();
        const inactive = Boolean(r[5]);
        const taxRate = parseFloat(r[6]) || 0;
        const leadPeriod = parseInt(r[7]) || 0;
        const statusRaw = String(r[8] || 'active').toLowerCase().trim();

        let status = 'active';
        if (statusRaw === 'approval' || statusRaw === 'pending_approval') status = 'pending_approval';
        if (statusRaw === 'draft') status = 'draft';
        if (statusRaw === 'delete' || statusRaw === 'archived') status = 'archived';

        let isValid = true;
        let errorMessage = '';

        if (!itemCode || !desc) {
          isValid = false;
          errorMessage = 'Missing Item Code or Description';
        }

        if (isValid) valid++;
        else errors++;

        parsedRows.push({
          rowNum: i + 1,
          resource_type: resType.toLowerCase(),
          item_code: itemCode,
          group_name: groupName,
          item_description: desc,
          uom_code: uomRaw.toUpperCase(),
          tax_rate: taxRate,
          lead_period_days: leadPeriod,
          status,
          is_inactive: inactive,
          isValid,
          errorMessage
        });
      }

      setParseResults({
        validCount: valid,
        errorCount: errors,
        rows: parsedRows
      });
    } catch (err: any) {
      console.error('Failed to parse Excel file:', err);
      alert('Failed to parse file. Please upload a valid .xlsx or .csv file.');
    } finally {
      setLoading(false);
    }
  };

  const handleStartImport = async () => {
    if (!parseResults || parseResults.rows.length === 0) return;

    setImporting(true);
    setImportProgress(0);

    const validRows = parseResults.rows.filter((r) => r.isValid);
    const BATCH_SIZE = 200;
    let completed = 0;

    try {
      // 1. Fetch UOM & Group maps
      const { data: uomData } = await supabase.from('units_of_measure').select('id, code');
      const uomMap = new Map((uomData || []).map((u: any) => [u.code.toUpperCase(), u.id]));
      const defaultUomId = uomMap.get('NOS') || (uomData?.[0]?.id ?? '');

      const { data: groupData } = await supabase.from('item_groups').select('id, name');
      const groupMap = new Map((groupData || []).map((g: any) => [g.name.toLowerCase(), g.id]));
      const defaultGroupId = groupData?.[0]?.id ?? '';

      // 2. Batch insert valid rows
      for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
        const chunk = validRows.slice(i, i + BATCH_SIZE).map((r) => ({
          resource_type: ['material', 'equipment', 'service'].includes(r.resource_type) ? r.resource_type : 'material',
          item_code: r.item_code,
          item_group_id: groupMap.get(r.group_name.toLowerCase()) || defaultGroupId,
          item_description: r.item_description,
          primary_uom_id: uomMap.get(r.uom_code) || defaultUomId,
          tax_rate: r.tax_rate,
          lead_period_days: r.lead_period_days,
          status: r.status,
          is_inactive: r.is_inactive
        }));

        const { error } = await supabase.from('items').upsert(chunk, { onConflict: 'item_code' });
        if (error) {
          console.error(`Error importing chunk ${i}:`, error);
        }

        completed += chunk.length;
        setImportProgress(Math.round((completed / validRows.length) * 100));
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Import failed:', err);
      alert('Import failed: ' + err.message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-950/50">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-orange-50 dark:bg-orange-950/50 border border-orange-200 dark:border-orange-900/40 text-orange-600 rounded-2xl">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white font-heading">
                Bulk Excel / CSV Item Importer
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Upload your Item Master Excel file to automatically normalize UOMs and seed Supabase
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-full text-gray-400"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {!parseResults ? (
            <div className="border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-3xl p-12 text-center space-y-4 hover:border-orange-400 transition-colors bg-gray-50/30 dark:bg-gray-950/30">
              <Upload className="w-12 h-12 mx-auto text-orange-500 animate-bounce" />
              <div>
                <p className="text-sm font-bold text-gray-800 dark:text-gray-200">
                  Click to select or drag & drop Item Master Excel file
                </p>
                <p className="text-xs text-gray-400 mt-1">Supports .xlsx and .csv files up to 10,000 items</p>
              </div>
              <input
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={handleFileSelect}
                className="hidden"
                id="excel-file-input"
              />
              <label
                htmlFor="excel-file-input"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs rounded-xl cursor-pointer shadow-lg shadow-orange-600/20 transition-all"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
                Select File
              </label>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Summary Stats */}
              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/30 rounded-2xl flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold uppercase text-emerald-600 tracking-wider">Valid Rows</p>
                    <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400">{parseResults.validCount}</p>
                  </div>
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 opacity-80" />
                </div>

                <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 rounded-2xl flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold uppercase text-red-600 tracking-wider">Error Rows</p>
                    <p className="text-xl font-bold text-red-700 dark:text-red-400">{parseResults.errorCount}</p>
                  </div>
                  <AlertCircle className="w-8 h-8 text-red-500 opacity-80" />
                </div>

                <div className="p-4 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900/30 rounded-2xl flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold uppercase text-orange-600 tracking-wider">Total Rows</p>
                    <p className="text-xl font-bold text-orange-700 dark:text-orange-400">{parseResults.rows.length}</p>
                  </div>
                  <FileSpreadsheet className="w-8 h-8 text-orange-500 opacity-80" />
                </div>
              </div>

              {/* Data Preview Table */}
              <div className="border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden">
                <div className="max-h-[300px] overflow-y-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-gray-50 dark:bg-gray-950 sticky top-0 border-b border-gray-200 dark:border-gray-800 text-gray-400 font-bold uppercase text-[10px]">
                      <tr>
                        <th className="p-3">#</th>
                        <th className="p-3">Code</th>
                        <th className="p-3">Description</th>
                        <th className="p-3">Group</th>
                        <th className="p-3">UOM</th>
                        <th className="p-3">GST %</th>
                        <th className="p-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-850">
                      {parseResults.rows.slice(0, 50).map((r) => (
                        <tr key={r.rowNum} className={!r.isValid ? 'bg-red-50/40 dark:bg-red-950/20' : ''}>
                          <td className="p-3 text-gray-400">{r.rowNum}</td>
                          <td className="p-3 font-mono font-bold text-orange-600">{r.item_code}</td>
                          <td className="p-3 font-medium text-gray-800 dark:text-gray-200">{r.item_description}</td>
                          <td className="p-3 text-gray-500">{r.group_name}</td>
                          <td className="p-3 font-bold text-gray-700 dark:text-gray-300">{r.uom_code}</td>
                          <td className="p-3">{r.tax_rate}%</td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                              {r.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Progress Indicator during bulk insert */}
              {importing && (
                <div className="space-y-2 p-4 bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-900/40 rounded-2xl">
                  <div className="flex justify-between text-xs font-bold text-orange-700 dark:text-orange-300">
                    <span>Importing into Supabase database...</span>
                    <span>{importProgress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-800 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-orange-600 h-full transition-all duration-300"
                      style={{ width: `${importProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-950/50 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-xl"
          >
            Cancel
          </button>

          {parseResults && (
            <button
              onClick={handleStartImport}
              disabled={importing || parseResults.validCount === 0}
              className="flex items-center gap-2 px-6 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs rounded-xl shadow-lg shadow-orange-600/20 disabled:opacity-50 transition-all"
            >
              {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              Import {parseResults.validCount} Items to Supabase
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
