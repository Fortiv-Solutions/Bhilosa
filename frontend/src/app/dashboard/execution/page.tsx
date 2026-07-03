'use client';

import { useState } from 'react';
import { useAppStore } from '@/store/use-app-store';
import { motion } from 'framer-motion';
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Users, 
  CalendarClock,
  Wrench,
  Search,
  Filter,
  ChevronDown
} from 'lucide-react';
import Link from 'next/link';

export default function ExecutionDashboard() {
  const { projects, updateDPRStatus } = useAppStore();
  const [selectedProjectId, setSelectedProjectId] = useState<string>('ALL');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'DPR' | 'DELAYS' | 'CORRECTIVE'>('DPR');

  // Aggregation
  const allDprs = projects.flatMap(p => 
    p.dailyActivities.map(dpr => ({ ...dpr, projectName: p.name }))
  ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const allDelays = projects.flatMap(p => 
    (p.delays || []).map(d => ({ ...d, projectName: p.name }))
  ).sort((a, b) => new Date(b.delayDate).getTime() - new Date(a.delayDate).getTime());

  const allCorrectiveTasks = projects.flatMap(p => 
    (p.correctiveTasks || []).map(t => ({ ...t, projectName: p.name }))
  ).sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

  // Filtering
  const filteredDprs = allDprs.filter(d => selectedProjectId === 'ALL' || d.projectId === selectedProjectId);
  const filteredDelays = allDelays.filter(d => selectedProjectId === 'ALL' || d.projectId === selectedProjectId);
  const filteredCorrective = allCorrectiveTasks.filter(c => selectedProjectId === 'ALL' || c.projectId === selectedProjectId);

  // Metrics
  const pendingDprs = filteredDprs.filter(d => d.status === 'Submitted' || d.status === 'Under Review');
  const openDelays = filteredDelays.filter(d => d.status === 'Open' || d.status === 'Assigned');
  const openCorrective = filteredCorrective.filter(c => c.status === 'OPEN' || c.status === 'IN_PROGRESS');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <span className="text-xs font-semibold text-primary uppercase tracking-normal bg-orange-50 dark:bg-orange-950/30 px-3 py-1 rounded-full border border-orange-100 dark:border-orange-900/40">
            Construction Progress
          </span>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-normal text-gray-900 dark:text-white mt-2">
            Execution Dashboard
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Track daily progress reports, site delays, and corrective actions.
          </p>
        </div>

        {/* Custom Project Selector Dropdown */}
        <div className="relative">
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="flex items-center justify-between gap-2 text-xs font-bold px-4 py-2.5 rounded-xl border border-border bg-card text-foreground shadow-xs hover:border-primary/40 transition-colors focus:outline-none min-w-[160px] cursor-pointer"
          >
            <span>{selectedProjectId === 'ALL' ? 'All Project Sites' : projects.find(p => p.id === selectedProjectId)?.name || selectedProjectId}</span>
            <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} />
          </button>
          
          {isDropdownOpen && (
            <>
              {/* Backdrop */}
              <div 
                className="fixed inset-0 z-30" 
                onClick={() => setIsDropdownOpen(false)}
              />
              <div className="absolute right-0 mt-1.5 w-48 rounded-xl border border-border bg-popover p-1 shadow-md z-45 animate-in fade-in slide-in-from-top-1 duration-200">
                <button
                  onClick={() => {
                    setSelectedProjectId('ALL');
                    setIsDropdownOpen(false);
                  }}
                  className={`w-full text-left text-xs font-semibold px-3 py-2 rounded-lg transition-colors cursor-pointer ${
                    selectedProjectId === 'ALL' 
                      ? 'bg-primary/10 text-primary' 
                      : 'text-foreground hover:bg-muted'
                  }`}
                >
                  All Project Sites
                </button>
                {projects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setSelectedProjectId(p.id);
                      setIsDropdownOpen(false);
                    }}
                    className={`w-full text-left text-xs font-semibold px-3 py-2 rounded-lg transition-colors mt-0.5 cursor-pointer ${
                      selectedProjectId === p.id 
                        ? 'bg-primary/10 text-primary' 
                        : 'text-foreground hover:bg-muted'
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-900 p-5 rounded-3xl border border-gray-100 dark:border-gray-850 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-orange-50 dark:bg-orange-950/30 flex items-center justify-center text-primary">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">DPRs to Review</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{pendingDprs.length}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 p-5 rounded-3xl border border-gray-100 dark:border-gray-850 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-red-50 dark:bg-red-950/30 flex items-center justify-center text-red-500">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Open Delays</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{openDelays.length}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 p-5 rounded-3xl border border-gray-100 dark:border-gray-850 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center text-amber-500">
            <Wrench className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Corrective Tasks</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{openCorrective.length}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 p-5 rounded-3xl border border-gray-100 dark:border-gray-850 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center text-blue-500">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Total Labour (Today)</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {filteredDprs.filter(d => d.date === new Date().toISOString().split('T')[0]).reduce((acc, curr) => acc + (curr.totalLabourCount || 0), 0)}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-gray-200 dark:border-gray-800">
        {(['DPR', 'DELAYS', 'CORRECTIVE'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === tab 
                ? 'border-primary text-primary' 
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            {tab === 'DPR' && 'Daily Progress Reports'}
            {tab === 'DELAYS' && 'Delay Logs'}
            {tab === 'CORRECTIVE' && 'Corrective Tasks'}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl border border-gray-100 dark:border-gray-850 shadow-sm min-h-[500px]">
        {activeTab === 'DPR' && (
          <div className="space-y-4">
            {filteredDprs.map(dpr => (
              <div key={dpr.id} className="p-5 rounded-2xl border border-gray-100 dark:border-gray-800 bg-gray-50/30 dark:bg-gray-950/30">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                      {dpr.date} - {dpr.projectName} 
                      {dpr.siteTowerBlock && <span className="text-xs text-gray-500 bg-gray-200 dark:bg-gray-800 px-2 py-0.5 rounded-full">{dpr.siteTowerBlock}</span>}
                    </h3>
                    <p className="text-xs text-gray-500 mt-1">Submitted by: {dpr.engineerName} | Weather: {dpr.weather}</p>
                  </div>
                  <div>
                    <span className={`text-xs font-bold px-2 py-1 rounded-md uppercase ${
                      dpr.status === 'Approved' ? 'bg-green-100 text-green-700' :
                      dpr.status === 'Rejected' ? 'bg-red-100 text-red-700' :
                      dpr.status === 'Correction Required' ? 'bg-amber-100 text-amber-700' :
                      'bg-blue-100 text-blue-700'
                    }`}>
                      {dpr.status || 'Draft'}
                    </span>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-semibold text-gray-700 dark:text-gray-300">Work Completed:</span>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">{dpr.workCompleted}</p>
                  </div>
                  <div>
                    <span className="font-semibold text-gray-700 dark:text-gray-300">Issues/Risks:</span>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">{dpr.issues || dpr.risks || 'None reported'}</p>
                  </div>
                </div>

                {dpr.status === 'Submitted' && (
                  <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 flex items-center gap-2">
                    <button 
                      onClick={() => updateDPRStatus(dpr.projectId, dpr.id, 'Approved')}
                      className="px-4 py-2 bg-green-50 text-green-700 hover:bg-green-100 font-semibold text-xs rounded-xl transition-colors"
                    >
                      Approve DPR
                    </button>
                    <button 
                      onClick={() => {
                        const remarks = prompt("Enter reason for rejection/correction:");
                        if (remarks) updateDPRStatus(dpr.projectId, dpr.id, 'Correction Required', remarks);
                      }}
                      className="px-4 py-2 bg-amber-50 text-amber-700 hover:bg-amber-100 font-semibold text-xs rounded-xl transition-colors"
                    >
                      Request Correction
                    </button>
                  </div>
                )}
              </div>
            ))}
            {filteredDprs.length === 0 && <p className="text-center text-gray-500 py-8">No DPRs found.</p>}
          </div>
        )}

        {activeTab === 'DELAYS' && (
          <div className="space-y-4">
            {filteredDelays.map(delay => (
              <div key={delay.id} className="p-5 rounded-2xl border border-gray-100 dark:border-gray-800 bg-gray-50/30 dark:bg-gray-950/30 flex items-start gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  delay.severity === 'Critical' ? 'bg-red-100 text-red-600' : 
                  delay.severity === 'High' ? 'bg-orange-100 text-orange-600' : 'bg-amber-100 text-amber-600'
                }`}>
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-start">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                      [{delay.projectName}] {delay.reasonCode} Delay - {delay.delayDays} Days
                    </h3>
                    <span className="text-xs bg-gray-200 dark:bg-gray-800 px-2 py-1 rounded-md font-semibold">{delay.status}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Reported on {delay.delayDate} | Site: {delay.siteTowerBlock || 'General'}</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300 mt-2">{delay.reasonDetails}</p>
                  <div className="flex gap-2 mt-3">
                    {delay.impactOnSchedule && <span className="text-[10px] bg-red-50 text-red-600 px-2 py-1 rounded uppercase font-bold">Schedule Impact</span>}
                    {delay.impactOnCost && <span className="text-[10px] bg-amber-50 text-amber-600 px-2 py-1 rounded uppercase font-bold">Cost Impact</span>}
                  </div>
                </div>
              </div>
            ))}
            {filteredDelays.length === 0 && <p className="text-center text-gray-500 py-8">No delays reported.</p>}
          </div>
        )}

        {activeTab === 'CORRECTIVE' && (
          <div className="space-y-4">
            {filteredCorrective.map(task => (
              <div key={task.id} className="p-5 rounded-2xl border border-gray-100 dark:border-gray-800 bg-gray-50/30 dark:bg-gray-950/30 flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0 text-blue-600">
                  <Wrench className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-start">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                      {task.title}
                    </h3>
                    <span className={`text-xs px-2 py-1 rounded-md font-semibold ${
                      task.status === 'COMPLETED' ? 'bg-green-100 text-green-700' : 'bg-gray-200 dark:bg-gray-800'
                    }`}>{task.status}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Project: {task.projectName} | Assigned to: {task.assignedTo} | Due: {task.dueDate}</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300 mt-2">{task.description}</p>
                </div>
              </div>
            ))}
            {filteredCorrective.length === 0 && <p className="text-center text-gray-500 py-8">No corrective tasks.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
