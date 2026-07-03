'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAppStore } from '@/store/use-app-store';
import {
  ShieldCheck,
  AlertOctagon,
  Clock,
  ListChecks,
  CheckCircle2,
  XCircle,
  FileCheck,
  Wrench,
  Search,
} from 'lucide-react';
import { format } from 'date-fns';

export default function QcDashboardPage() {
  const { projects } = useAppStore();
  
  // Aggregate data
  const allQcs = projects.flatMap(p => (p.qcInspections || []).map(qc => ({ ...qc, projectName: p.name })));
  const allReworks = projects.flatMap(p => (p.reworkTasks || []).map(rw => ({ ...rw, projectName: p.name })));
  const allSubmittedChecklists = projects.flatMap(p => (p.submittedChecklists || []).map(sc => ({ ...sc, projectName: p.name })));
  const allTemplates = projects.flatMap(p => p.checklistTemplates || []);

  const qcPending = allQcs.filter(qc => qc.status === 'PENDING' || qc.status === 'IN_PROGRESS');
  const qcFailed = allQcs.filter(qc => qc.status === 'FAILED');
  const reworkOpen = allReworks.filter(rw => rw.status !== 'CLOSED');
  const criticalRework = reworkOpen.filter(rw => rw.severity === 'Critical');

  const [activeTab, setActiveTab] = useState<'inspections' | 'reworks' | 'checklists'>('inspections');

  return (
    <div className="p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-8 h-8 text-blue-600" />
            Quality Control Dashboard
          </h1>
          <p className="text-gray-500 mt-1">Monitor site inspections, checklists, and non-conformance reports.</p>
        </div>
        <div className="flex gap-3">
          <Link 
            href="/qc/templates"
            className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors shadow-sm flex items-center gap-2 font-medium"
          >
            <ListChecks className="w-4 h-4" />
            Checklist Templates
          </Link>
          <Link 
            href="/rework"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm shadow-blue-200 flex items-center gap-2 font-medium"
          >
            <Wrench className="w-4 h-4" />
            Manage Rework
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4">
          <div className="p-3 bg-yellow-50 text-yellow-600 rounded-xl">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">QC Pending</p>
            <p className="text-2xl font-bold text-gray-900">{qcPending.length}</p>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4">
          <div className="p-3 bg-red-50 text-red-600 rounded-xl">
            <XCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">QC Failed</p>
            <p className="text-2xl font-bold text-gray-900">{qcFailed.length}</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4">
          <div className="p-3 bg-orange-50 text-orange-600 rounded-xl">
            <Wrench className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Rework Open</p>
            <p className="text-2xl font-bold text-gray-900">{reworkOpen.length}</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-red-200 flex items-center gap-4 relative overflow-hidden">
          <div className="absolute inset-0 bg-red-50/50" />
          <div className="p-3 bg-red-100 text-red-700 rounded-xl relative z-10">
            <AlertOctagon className="w-6 h-6" />
          </div>
          <div className="relative z-10">
            <p className="text-sm font-medium text-red-900">Critical NCR</p>
            <p className="text-2xl font-bold text-red-700">{criticalRework.length}</p>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="border-b border-gray-200 px-6 py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex space-x-6">
            <button 
              onClick={() => setActiveTab('inspections')}
              className={`font-medium pb-4 -mb-4 px-1 border-b-2 transition-colors ${activeTab === 'inspections' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              Recent Inspections
            </button>
            <button 
              onClick={() => setActiveTab('reworks')}
              className={`font-medium pb-4 -mb-4 px-1 border-b-2 transition-colors ${activeTab === 'reworks' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              Open Rework Tasks
            </button>
            <button 
              onClick={() => setActiveTab('checklists')}
              className={`font-medium pb-4 -mb-4 px-1 border-b-2 transition-colors ${activeTab === 'checklists' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              Submitted Checklists
            </button>
          </div>
        </div>

        <div className="p-6">
          {activeTab === 'inspections' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-gray-600">
                <thead className="bg-gray-50 text-gray-900 font-medium border-y border-gray-200">
                  <tr>
                    <th className="py-3 px-4">Inspection ID</th>
                    <th className="py-3 px-4">Project</th>
                    <th className="py-3 px-4">Assigned To</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {allQcs.length === 0 && (
                     <tr><td colSpan={5} className="py-8 text-center text-gray-500">No QC inspections found</td></tr>
                  )}
                  {allQcs.map((qc) => (
                    <tr key={qc.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="py-3 px-4 font-medium text-gray-900">{qc.id}</td>
                      <td className="py-3 px-4">{qc.projectName}</td>
                      <td className="py-3 px-4">{qc.assignedTo}</td>
                      <td className="py-3 px-4">{format(new Date(qc.inspectionDate), 'dd MMM yyyy, HH:mm')}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${
                          qc.status === 'PASSED' ? 'bg-green-50 text-green-700 border border-green-200' :
                          qc.status === 'FAILED' ? 'bg-red-50 text-red-700 border border-red-200' :
                          qc.status === 'PENDING' ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' :
                          'bg-gray-50 text-gray-700 border border-gray-200'
                        }`}>
                          {qc.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'reworks' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {reworkOpen.length === 0 && (
                <div className="col-span-full py-12 text-center text-gray-500 border-2 border-dashed border-gray-200 rounded-xl">
                  <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-3" />
                  <p className="font-medium text-gray-900">All caught up!</p>
                  <p>No open rework tasks found.</p>
                </div>
              )}
              {reworkOpen.map((rw) => (
                <div key={rw.id} className="border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow bg-white">
                  <div className="flex justify-between items-start mb-3">
                    <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                      rw.severity === 'Critical' ? 'bg-red-100 text-red-800' :
                      rw.severity === 'High' ? 'bg-orange-100 text-orange-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {rw.severity} Priority
                    </span>
                    <span className="text-xs text-gray-500 font-medium bg-gray-100 px-2 py-1 rounded">{rw.id}</span>
                  </div>
                  <h3 className="font-medium text-gray-900 mb-1">{rw.description}</h3>
                  <p className="text-sm text-gray-500 mb-4">{rw.projectName} • Assigned to {rw.assignedTo}</p>
                  <div className="flex justify-between items-center text-sm border-t border-gray-100 pt-3">
                    <span className="text-gray-500">Due: {format(new Date(rw.dueDate), 'dd MMM yyyy')}</span>
                    <span className="font-medium text-blue-600">{rw.status.replace(/_/g, ' ')}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'checklists' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-gray-600">
                <thead className="bg-gray-50 text-gray-900 font-medium border-y border-gray-200">
                  <tr>
                    <th className="py-3 px-4">Checklist ID</th>
                    <th className="py-3 px-4">Project</th>
                    <th className="py-3 px-4">Template</th>
                    <th className="py-3 px-4">Submitted By</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {allSubmittedChecklists.length === 0 && (
                     <tr><td colSpan={5} className="py-8 text-center text-gray-500">No submitted checklists</td></tr>
                  )}
                  {allSubmittedChecklists.map((sc) => {
                    const template = allTemplates.find(t => t.id === sc.templateId);
                    return (
                    <tr key={sc.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="py-3 px-4 font-medium text-gray-900">{sc.id}</td>
                      <td className="py-3 px-4">{sc.projectName}</td>
                      <td className="py-3 px-4">{template?.name || 'Unknown Template'}</td>
                      <td className="py-3 px-4">{sc.submittedBy}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${
                          sc.status === 'QC_PENDING' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                          'bg-gray-50 text-gray-700 border border-gray-200'
                        }`}>
                          {sc.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
