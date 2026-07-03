'use client';

import { useState } from 'react';
import { useAppStore } from '@/store/use-app-store';
import { motion } from 'framer-motion';
import { 
  ClipboardList, 
  Calendar, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  ArrowRight, 
  Search,
  LayoutGrid,
  ListTodo,
  ChevronDown
} from 'lucide-react';
import Link from 'next/link';

export default function ActivitiesPage() {
  const { projects } = useAppStore();
  const [selectedProjectId, setSelectedProjectId] = useState<string>('ALL');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Aggregate all tasks
  const allTasks = projects.flatMap(p => 
    p.tasks.map(t => ({ ...t, projectName: p.name, projectId: p.id }))
  );

  // Aggregate all daily reports
  const allReports = projects.flatMap(p => 
    p.dailyActivities.map(a => ({ ...a, projectName: p.name, projectId: p.id }))
  ).sort((a, b) => b.date.localeCompare(a.date));

  // Filter tasks based on selected project
  const filteredTasks = allTasks.filter(t => selectedProjectId === 'ALL' || t.projectId === selectedProjectId);
  const filteredReports = allReports.filter(r => selectedProjectId === 'ALL' || r.projectId === selectedProjectId);

  // Kanban Columns
  const columns = [
    { title: 'Scheduled / To Do', status: 'todo', items: filteredTasks.filter(t => t.progress === 0) },
    { title: 'In Execution', status: 'progress', items: filteredTasks.filter(t => t.progress > 0 && t.progress < 100) },
    { title: 'Completed', status: 'completed', items: filteredTasks.filter(t => t.progress === 100) },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <span className="text-xs font-semibold text-primary uppercase tracking-normal bg-orange-50 dark:bg-orange-950/30 px-3 py-1 rounded-full border border-orange-100 dark:border-orange-900/40">
            Workforce Coordination
          </span>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-normal text-gray-900 dark:text-white mt-2">
            Activities & Task Board
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Task execution logs, scheduler checklists, and live Daily Progress Reports.
          </p>
          <div className="mt-4">
            <Link 
              href="/dashboard/execution"
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary/90 transition-colors"
            >
              <LayoutGrid className="w-4 h-4" />
              Open Execution Dashboard
            </Link>
          </div>
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

      {/* Kanban Board Container */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {columns.map((col) => (
          <div key={col.title} className="bg-white dark:bg-gray-900 p-5 rounded-3xl border border-gray-100 dark:border-gray-850 shadow-sm flex flex-col min-h-[400px]">
            <div className="flex items-center justify-between border-b border-gray-50 dark:border-gray-850 pb-3 mb-4">
              <span className="text-xs font-semibold text-gray-850 dark:text-gray-200 uppercase tracking-normal">{col.title}</span>
              <span className="text-xs bg-orange-50 dark:bg-orange-950/40 text-primary border border-orange-100 dark:border-orange-900 px-2 py-0.5 rounded-full font-bold">
                {col.items.length} Tasks
              </span>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto max-h-[480px] pr-1">
              {col.items.map((task) => (
                <motion.div
                  key={task.id}
                  whileHover={{ y: -2 }}
                  className={`p-4 rounded-2xl border bg-gray-50/20 dark:bg-gray-950/30 flex flex-col justify-between space-y-3 transition-shadow hover:shadow-sm
                    ${task.isCriticalPath ? 'border-red-200 dark:border-red-950/40' : 'border-gray-100 dark:border-gray-850/80'}`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-bold text-gray-900 dark:text-white leading-tight">{task.name}</span>
                      {task.isCriticalPath && (
                        <span className="bg-red-100 text-red-600 text-xs font-bold uppercase px-1.5 py-0.5 rounded">Critical</span>
                      )}
                    </div>
                    <Link href={`/projects/${task.projectId}`} className="text-xs text-primary hover:underline font-semibold mt-1 inline-block">
                      {task.projectName}
                    </Link>
                  </div>

                  <div className="flex items-center justify-between text-xs text-gray-400">
                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {task.endDate}</span>
                    <span className="font-bold text-gray-650 dark:text-gray-250">{task.progress}% Done</span>
                  </div>

                  <div className="w-full h-1 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${task.progress}%` }} />
                  </div>
                </motion.div>
              ))}

              {col.items.length === 0 && (
                <div className="py-16 text-center text-gray-400 flex flex-col items-center justify-center h-full">
                  <ListTodo className="w-8 h-8 text-gray-300 mb-2" />
                  <p className="text-xs">No tasks in this column.</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* DPR Unified Feed */}
      <div className="bg-white dark:bg-gray-900 p-5 rounded-3xl border border-gray-100 dark:border-gray-850 shadow-sm space-y-4">
        <h3 className="font-heading font-semibold text-gray-900 dark:text-white text-base">Unified Daily Activity Stream</h3>
        
        <div className="space-y-4">
          {filteredReports.slice(0, 5).map((rep) => (
            <div key={rep.id} className="flex items-start gap-4 p-4 rounded-2xl border border-gray-50 dark:border-gray-850 hover:bg-gray-50/20 dark:hover:bg-gray-950/20">
              <div className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-950/30 flex items-center justify-center text-primary flex-shrink-0">
                <ClipboardList className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between text-xs flex-wrap gap-1">
                  <span className="font-bold text-gray-800 dark:text-gray-200">Engr. {rep.engineerName}</span>
                  <span className="text-gray-400">{rep.date}</span>
                </div>
                <p className="text-xs font-semibold text-primary mt-0.5">{rep.projectName}</p>
                <p className="text-xs text-gray-500 dark:text-gray-450 mt-1 leading-relaxed">{rep.workCompleted}</p>
              </div>
            </div>
          ))}

          {filteredReports.length === 0 && (
            <div className="py-12 text-center text-gray-405">
              <ClipboardList className="w-10 h-10 mx-auto text-gray-300 mb-2" />
              <p className="text-xs">No daily logs found matching selection.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
