import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ListTodo, 
  Clock, 
  TrendingUp, 
  CheckCircle2, 
  Plus, 
  Calendar, 
  ChevronDown, 
  ShieldCheck, 
  Users,
  MoreVertical,
  Trash2,
  X
} from 'lucide-react';
import { useAppStore } from '@/store/use-app-store';

export function TaskModule({ project }: { project: any }) {
  const { addTask, updateTask, deleteTask } = useAppStore();
  
  // State for Add Task form visibility
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);

  // Form states
  const [taskName, setTaskName] = useState('');
  const [taskAssigneeId, setTaskAssigneeId] = useState('');
  const [taskStartDate, setTaskStartDate] = useState('');
  const [taskEndDate, setTaskEndDate] = useState('');
  const [taskPriority, setTaskPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH'>('MEDIUM');
  const [taskFormError, setTaskFormError] = useState('');

  const handleTaskSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setTaskFormError('');

    const normalizedName = taskName.trim();
    if (!normalizedName) {
      setTaskFormError('Please enter a task name.');
      return;
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const defaultEndStr = new Date(Date.now() + 7*24*60*60*1000).toISOString().split('T')[0];

    const availableMembers = (project.teamMembers && project.teamMembers.length > 0) ? project.teamMembers : [
      { id: 'u3', name: 'Rohan Mehta', role: 'Site Manager' },
      { id: 'u5', name: 'Dhruv Shah', role: 'QA/QC Engineer' },
    ];
    const assignee = availableMembers.find((member: any) => member.id === taskAssigneeId) || { id: taskAssigneeId || 'u3', name: 'Rohan Mehta' };

    addTask(project.id, {
      name: normalizedName,
      startDate: taskStartDate || todayStr,
      endDate: taskEndDate || defaultEndStr,
      assigneeId: assignee.id,
      assigneeName: assignee.name,
      priority: taskPriority,
      status: 'TODO',
    });

    setTaskName('');
    setTaskAssigneeId('');
    setTaskStartDate('');
    setTaskEndDate('');
    setTaskPriority('MEDIUM');
    setIsAddFormOpen(false);
  };

  const tasks = project.tasks || [];
  
  const todoTasks = tasks.filter((t: any) => (t.status ?? (t.progress === 0 ? 'TODO' : t.progress === 100 ? 'COMPLETED' : 'IN_PROGRESS')) === 'TODO');
  const inProgressTasks = tasks.filter((t: any) => (t.status ?? (t.progress === 0 ? 'TODO' : t.progress === 100 ? 'COMPLETED' : 'IN_PROGRESS')) === 'IN_PROGRESS');
  const completedTasks = tasks.filter((t: any) => (t.status ?? (t.progress === 0 ? 'TODO' : t.progress === 100 ? 'COMPLETED' : 'IN_PROGRESS')) === 'COMPLETED');

  const priorityColors: Record<string, string> = {
    HIGH: 'bg-red-50 text-red-600 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20',
    MEDIUM: 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
    LOW: 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20'
  };

  const statusColors: Record<string, string> = {
    TODO: 'bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700',
    IN_PROGRESS: 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20',
    COMPLETED: 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20'
  };

  const renderTaskCard = (task: any) => {
    const taskStatus = task.status ?? (task.progress === 0 ? 'TODO' : task.progress === 100 ? 'COMPLETED' : 'IN_PROGRESS');
    const taskPriorityValue = task.priority ?? (task.isCriticalPath ? 'HIGH' : 'MEDIUM');

    return (
      <motion.div 
        layout
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        key={task.id} 
        className="group relative rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm transition-all hover:border-[#b68d40]/30 hover:shadow-md"
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between">
            <div className="flex flex-col">
              <span className={`w-fit rounded-md border px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider mb-2 ${priorityColors[taskPriorityValue]}`}>
                {taskPriorityValue}
              </span>
              <h4 className={`text-sm font-bold leading-tight ${taskStatus === 'COMPLETED' ? 'text-gray-400 line-through' : 'text-gray-900 dark:text-white'}`}>
                {task.name}
              </h4>
            </div>
            
            <div className="relative group/dropdown">
              <button className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <MoreVertical className="w-4 h-4" />
              </button>
              {/* Context Menu Dropdown (Simplified for hover) */}
              <div className="absolute right-0 top-full mt-1 w-36 rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-xl opacity-0 invisible group-hover/dropdown:opacity-100 group-hover/dropdown:visible transition-all z-10 p-1.5 space-y-1">
                <select
                  value={taskStatus}
                  onChange={(e) => updateTask(project.id, task.id, { status: e.target.value as any })}
                  className="w-full appearance-none rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 outline-none hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                >
                  <option value="TODO">To Do</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="COMPLETED">Completed</option>
                </select>
                <div className="h-px bg-gray-100 dark:bg-gray-800 my-0.5"></div>
                <select
                  value={taskPriorityValue}
                  onChange={(e) => updateTask(project.id, task.id, { priority: e.target.value as any })}
                  className="w-full appearance-none rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 outline-none hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                </select>
                <div className="h-px bg-gray-100 dark:bg-gray-800 my-0.5"></div>
                <button
                  onClick={() => {
                    if (confirm('Are you sure you want to delete this task?')) {
                      deleteTask(project.id, task.id);
                    }
                  }}
                  className="w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 cursor-pointer transition-colors whitespace-nowrap"
                >
                  <Trash2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Delete Task</span>
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-x-3 text-[11px] text-gray-500 dark:text-gray-400">
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              <span className="font-medium">{task.endDate}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 font-bold text-gray-700 dark:text-gray-300">
                {task.assigneeName ? task.assigneeName.charAt(0).toUpperCase() : '?'}
              </div>
              <span className="font-medium truncate max-w-[80px]">{task.assigneeName || 'Unassigned'}</span>
            </div>
          </div>

          <div className="mt-1 flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
              <div 
                className={`h-full rounded-full transition-all duration-500 ${taskStatus === 'COMPLETED' ? 'bg-emerald-500' : 'bg-[#b68d40]'}`} 
                style={{ width: `${task.progress || (taskStatus === 'COMPLETED' ? 100 : taskStatus === 'IN_PROGRESS' ? 50 : 0)}%` }} 
              />
            </div>
          </div>
        </div>
      </motion.div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#b68d40]/10 text-[#b68d40]">
            <ListTodo className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-heading text-xl font-bold text-gray-900 dark:text-white">Task Board</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">Manage operations and assignments</p>
          </div>
        </div>
        
        <button
          onClick={() => setIsAddFormOpen(!isAddFormOpen)}
          className="flex items-center gap-2 rounded-xl bg-[#b68d40] px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-[#b68d40]/20 transition-all hover:scale-[1.02] active:scale-95"
        >
          {isAddFormOpen ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {isAddFormOpen ? 'Close Form' : 'New Task'}
        </button>
      </div>

      {/* Add Task Form Collapse */}
      <AnimatePresence>
        {isAddFormOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <form onSubmit={handleTaskSubmit} className="mb-6 relative overflow-hidden rounded-2xl border border-gray-100 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 p-5 lg:p-6 shadow-sm backdrop-blur-xl">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <label className="block lg:col-span-2">
                  <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-gray-500">Task name</span>
                  <input
                    type="text"
                    value={taskName}
                    onChange={(event) => setTaskName(event.target.value)}
                    placeholder="e.g. Inspect basement waterproofing"
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 px-4 py-3 text-sm text-gray-900 dark:text-white outline-none transition-all focus:border-[#b68d40] focus:bg-white dark:focus:bg-gray-900 focus:ring-4 focus:ring-[#b68d40]/10"
                  />
                </label>



                <label className="block">
                  <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-gray-500">Priority</span>
                  <div className="relative">
                    <select
                      value={taskPriority}
                      onChange={(event) => setTaskPriority(event.target.value as 'LOW' | 'MEDIUM' | 'HIGH')}
                      className="w-full appearance-none rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 pl-4 pr-10 py-3 text-sm text-gray-900 dark:text-white outline-none transition-all focus:border-[#b68d40] focus:bg-white dark:focus:bg-gray-900 focus:ring-4 focus:ring-[#b68d40]/10 cursor-pointer"
                    >
                      <option value="LOW">Low</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HIGH">High</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  </div>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-gray-500">Start date</span>
                  <input
                    type="date"
                    value={taskStartDate}
                    onChange={(event) => setTaskStartDate(event.target.value)}
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 px-3 py-3 text-sm text-gray-900 dark:text-white outline-none transition-all focus:border-[#b68d40] focus:bg-white dark:focus:bg-gray-900 focus:ring-4 focus:ring-[#b68d40]/10"
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-gray-500">Due date</span>
                  <input
                    type="date"
                    value={taskEndDate}
                    min={taskStartDate || undefined}
                    onChange={(event) => setTaskEndDate(event.target.value)}
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 px-3 py-3 text-sm text-gray-900 dark:text-white outline-none transition-all focus:border-[#b68d40] focus:bg-white dark:focus:bg-gray-900 focus:ring-4 focus:ring-[#b68d40]/10"
                  />
                </label>
              </div>

              {taskFormError && (
                <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-red-600 dark:border-red-900/50 dark:bg-red-900/20">
                  <div className="mt-0.5"><ShieldCheck className="h-4 w-4" /></div>
                  <p className="text-xs font-medium">{taskFormError}</p>
                </div>
              )}

              <div className="mt-5 flex justify-end">
                <button
                  type="submit"
                  disabled={project.teamMembers.length === 0}
                  className="flex items-center gap-2 rounded-xl bg-gray-900 dark:bg-white px-6 py-3 text-sm font-bold text-white dark:text-gray-900 transition-all hover:scale-[1.02] active:scale-95 disabled:pointer-events-none disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" /> Create Task
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Kanban Board */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
        {/* TO DO COLUMN */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between border-b-2 border-gray-200 dark:border-gray-800 pb-2">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-gray-400"></div>
              <h3 className="font-heading text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">To Do</h3>
            </div>
            <span className="text-xs font-bold text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">{todoTasks.length}</span>
          </div>
          <div className="flex flex-col gap-3 min-h-[200px]">
            <AnimatePresence>
              {todoTasks.map(renderTaskCard)}
            </AnimatePresence>
            {todoTasks.length === 0 && (
              <div className="text-center py-8 border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-xl">
                <p className="text-xs text-gray-400 font-medium">No tasks</p>
              </div>
            )}
          </div>
        </div>

        {/* IN PROGRESS COLUMN */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between border-b-2 border-blue-200 dark:border-blue-900/50 pb-2">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-blue-500"></div>
              <h3 className="font-heading text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">In Progress</h3>
            </div>
            <span className="text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 px-2 py-0.5 rounded-full">{inProgressTasks.length}</span>
          </div>
          <div className="flex flex-col gap-3 min-h-[200px]">
            <AnimatePresence>
              {inProgressTasks.map(renderTaskCard)}
            </AnimatePresence>
            {inProgressTasks.length === 0 && (
              <div className="text-center py-8 border-2 border-dashed border-blue-100 dark:border-blue-900/30 rounded-xl">
                <p className="text-xs text-gray-400 font-medium">No tasks</p>
              </div>
            )}
          </div>
        </div>

        {/* COMPLETED COLUMN */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between border-b-2 border-emerald-200 dark:border-emerald-900/50 pb-2">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
              <h3 className="font-heading text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Completed</h3>
            </div>
            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-full">{completedTasks.length}</span>
          </div>
          <div className="flex flex-col gap-3 min-h-[200px]">
            <AnimatePresence>
              {completedTasks.map(renderTaskCard)}
            </AnimatePresence>
            {completedTasks.length === 0 && (
              <div className="text-center py-8 border-2 border-dashed border-emerald-100 dark:border-emerald-900/30 rounded-xl">
                <p className="text-xs text-gray-400 font-medium">No tasks</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
