'use client';

import { useAppStore } from '@/store/use-app-store';
import { motion } from 'framer-motion';
import { 
  FileText, 
  Search, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  FileCheck2,
  FolderOpen,
  ArrowUpRight
} from 'lucide-react';
import { useState } from 'react';

export default function DocumentsPage() {
  const { projects } = useAppStore();
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');

  // Aggregate documents
  const allDocs = projects.flatMap(p => 
    p.documents.map(d => ({ ...d, projectName: p.name, projectId: p.id }))
  );

  const filteredDocs = allDocs.filter(doc => categoryFilter === 'ALL' || doc.category === categoryFilter);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <span className="text-xs font-semibold text-primary uppercase tracking-normal bg-orange-50 dark:bg-orange-950/30 px-3 py-1 rounded-full border border-orange-100 dark:border-orange-900/40">
          Document Control
        </span>
        <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-normal text-gray-900 dark:text-white mt-2">
          Global Drawings & Invoices Vault
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Review version history on blueprints, structural certifications, client agreements, and invoices.
        </p>
      </div>

      {/* Category selector */}
      <div className="flex items-center gap-2 overflow-x-auto bg-white dark:bg-gray-900 p-3.5 rounded-2xl border border-gray-100 dark:border-gray-850 shadow-sm scrollbar-none">
        <FolderOpen className="w-4 h-4 text-gray-405 mr-2" />
        {(['ALL', 'DRAWING', 'BOQ', 'CONTRACT', 'INVOICE', 'PHOTO', 'APPROVAL'] as const).map((cat) => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(cat)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors border
              ${categoryFilter === cat
                ? 'bg-primary border-primary text-white'
                : 'bg-gray-50 dark:bg-gray-950 border-gray-200 dark:border-gray-800 text-gray-650 dark:text-gray-400 hover:bg-gray-100'
              }`}
          >
            {cat === 'ALL' ? 'All Files' : cat}
          </button>
        ))}
      </div>

      {/* Documents Registry */}
      <div className="bg-white dark:bg-gray-900 p-5 rounded-3xl border border-gray-100 dark:border-gray-850 shadow-sm space-y-4">
        <h3 className="font-heading font-semibold text-gray-900 dark:text-white text-base">Authorized Document Ledger</h3>
        
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-850 text-gray-400">
                <th className="pb-3 font-semibold">Document Name</th>
                <th className="pb-3 font-semibold">Project Site</th>
                <th className="pb-3 font-semibold">Category</th>
                <th className="pb-3 font-semibold">Version ID</th>
                <th className="pb-3 font-semibold">Sync/Upload Date</th>
                <th className="pb-3 font-semibold">Certification Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredDocs.map((doc) => (
                <tr key={doc.id} className="border-b border-gray-50 dark:border-gray-850/50 hover:bg-gray-50/20">
                  <td className="py-4 font-bold text-gray-800 dark:text-gray-250 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-primary" />
                    {doc.name}
                  </td>
                  <td className="py-4 text-primary font-semibold">{doc.projectName}</td>
                  <td className="py-4 text-gray-405">{doc.category}</td>
                  <td className="py-4 text-gray-400">Rev-{doc.version}</td>
                  <td className="py-4 text-gray-400">{doc.uploadDate}</td>
                  <td className="py-4">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold border flex items-center gap-1 w-fit
                      ${doc.status === 'APPROVED' 
                        ? 'bg-emerald-50 border-emerald-200 text-success dark:bg-emerald-950/20' 
                        : 'bg-amber-50 border-amber-200 text-warning dark:bg-amber-950/20'}`}>
                      {doc.status === 'APPROVED' ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                      {doc.status}
                    </span>
                  </td>
                </tr>
              ))}

              {filteredDocs.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-gray-400">No documents found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
