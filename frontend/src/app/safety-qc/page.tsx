'use client';

import { useAppStore } from '@/store/use-app-store';
import { motion } from 'framer-motion';
import { 
  ShieldCheck, 
  AlertTriangle, 
  CheckCircle, 
  ClipboardList,
  Wrench,
  Clock
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { getSafetyIncidents, getQCInspections } from '@/lib/safety-qc';
import { isLiveSupabase } from '@/lib/erp/supabase-modules';

export default function SafetyQCPage() {
  const { projects } = useAppStore();
  const [safetyIncidents, setSafetyIncidents] = useState<any[]>([]);
  const [qcInspections, setQcInspections] = useState<any[]>([]);

  useEffect(() => {
    if (!isLiveSupabase()) return;
    
    // Fetch all for all projects
    getSafetyIncidents().then(data => setSafetyIncidents(data || [])).catch(console.error);
    getQCInspections().then(data => setQcInspections(data || [])).catch(console.error);
  }, []);

  const openIncidents = safetyIncidents.filter(s => s.status === 'open' || s.status === 'investigating').length;
  const criticalIncidents = safetyIncidents.filter(s => s.severity === 'critical').length;
  const passedInspections = qcInspections.filter(q => q.status === 'passed').length;
  const failedInspections = qcInspections.filter(q => q.status === 'failed').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <span className="text-xs font-semibold text-primary uppercase tracking-normal bg-orange-50 dark:bg-orange-950/30 px-3 py-1 rounded-full border border-orange-100 dark:border-orange-900/40">
          Safety & Quality Control
        </span>
        <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-normal text-gray-900 dark:text-white mt-2">
          Safety & Quality Control Exceptions
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Monitor site safety incidents, manage QC inspections, and track formal rework behaviors.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-900 p-5 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-normal">Open Safety Incidents</p>
          <h3 className="font-heading text-2xl font-semibold text-red-600 dark:text-red-400 mt-2">{openIncidents}</h3>
          <p className="text-xs text-gray-400 mt-1">Requires investigation</p>
        </div>

        <div className="bg-white dark:bg-gray-900 p-5 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-normal">Critical Incidents</p>
          <h3 className="font-heading text-2xl font-semibold text-red-800 dark:text-red-600 mt-2">{criticalIncidents}</h3>
          <p className="text-xs text-gray-450 mt-1">Highest severity level</p>
        </div>

        <div className="bg-white dark:bg-gray-900 p-5 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-normal">Passed QC Inspections</p>
          <h3 className="font-heading text-2xl font-semibold text-success mt-2">{passedInspections}</h3>
          <p className="text-xs text-success font-medium mt-1">Cleared for billing</p>
        </div>

        <div className="bg-white dark:bg-gray-900 p-5 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-normal">Failed QC (Rework)</p>
          <h3 className="font-heading text-2xl font-semibold text-amber-600 dark:text-amber-500 mt-2">{failedInspections}</h3>
          <p className="text-xs text-gray-400 mt-1">Active rework required</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Safety Incidents */}
        <div className="bg-white dark:bg-gray-900 p-5 rounded-3xl border border-gray-100 dark:border-gray-850 shadow-sm space-y-4">
          <h3 className="font-heading font-semibold text-gray-900 dark:text-white text-base flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            Safety Incidents Log
          </h3>
          
          <div className="space-y-3">
            {safetyIncidents.map((inc) => (
              <div key={inc.id} className="p-4 border border-gray-100 dark:border-gray-800 rounded-xl bg-gray-50/50 dark:bg-gray-800/50">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h4 className="font-bold text-sm text-gray-900 dark:text-white">{inc.projects?.name || 'Unknown Project'}</h4>
                    <p className="text-xs text-gray-500">{new Date(inc.incident_date).toLocaleDateString()}</p>
                  </div>
                  <div className="flex gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider
                      ${inc.severity === 'critical' ? 'bg-red-100 text-red-700 border-red-200' : 
                        inc.severity === 'major' ? 'bg-amber-100 text-amber-700 border-amber-200' : 
                        'bg-blue-100 text-blue-700 border-blue-200'}`}>
                      {inc.severity}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider
                      ${inc.status === 'resolved' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 
                        'bg-gray-100 text-gray-700 border-gray-200'}`}>
                      {inc.status}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-300">{inc.description}</p>
              </div>
            ))}
            {safetyIncidents.length === 0 && (
              <div className="py-8 text-center text-gray-400 text-sm">
                No safety incidents recorded.
              </div>
            )}
          </div>
        </div>

        {/* QC Inspections */}
        <div className="bg-white dark:bg-gray-900 p-5 rounded-3xl border border-gray-100 dark:border-gray-850 shadow-sm space-y-4">
          <h3 className="font-heading font-semibold text-gray-900 dark:text-white text-base flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-blue-500" />
            QC Inspections & Rework
          </h3>
          
          <div className="space-y-3">
            {qcInspections.map((qc) => (
              <div key={qc.id} className="p-4 border border-gray-100 dark:border-gray-800 rounded-xl bg-gray-50/50 dark:bg-gray-800/50">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h4 className="font-bold text-sm text-gray-900 dark:text-white">{qc.projects?.name || 'Unknown Project'}</h4>
                    <p className="text-xs font-semibold text-gray-500">{qc.type?.replace('_', ' ').toUpperCase()}</p>
                  </div>
                  <div className="flex gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider
                      ${qc.status === 'passed' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 
                        qc.status === 'failed' ? 'bg-red-100 text-red-700 border-red-200' : 
                        'bg-amber-100 text-amber-700 border-amber-200'}`}>
                      {qc.status}
                    </span>
                    {qc.rework_required && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-amber-100 text-amber-700 border-amber-200 uppercase tracking-wider flex items-center gap-1">
                        <Wrench className="w-3 h-3" /> Rework
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-xs text-gray-500 mb-2">
                  <span className="font-semibold text-gray-700 dark:text-gray-300">Activity: </span>
                  {qc.construction_activities?.title || 'Unknown Activity'}
                </div>
                {qc.inspector_notes && (
                  <p className="text-sm text-gray-700 dark:text-gray-300 italic">"{qc.inspector_notes}"</p>
                )}
                <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {new Date(qc.inspection_date).toLocaleString()}
                </p>
              </div>
            ))}
            {qcInspections.length === 0 && (
              <div className="py-8 text-center text-gray-400 text-sm">
                No QC inspections recorded.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
