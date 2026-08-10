import React, { useState, useMemo } from 'react';
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
  X,
  UserCheck,
  Edit3,
  AlertCircle,
  Search,
  LayoutGrid,
  Table as TableIcon,
  BarChart3,
  Filter,
  ChevronRight,
  Building,
  Layers,
  CheckCircle,
  FileText,
  AlertTriangle
} from 'lucide-react';
import { useAppStore } from '@/store/use-app-store';

export function TaskModule({ project, overviewData }: { project: any, overviewData?: any }) {
  const { addTask, updateTask, deleteTask, currentUser } = useAppStore();
  
  // View & Grouping States
  const [viewMode, setViewMode] = useState<'board' | 'table'>('board');
  const [grouping, setGrouping] = useState<'phase' | 'tower' | 'flat'>('phase');

  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [filterChip, setFilterChip] = useState<'ALL' | 'ISSUES' | 'DELAYED' | 'AWAITING_APPROVAL'>('ALL');
  const [filterEngineer, setFilterEngineer] = useState('');
  const [filterPhase, setFilterPhase] = useState('');

  // Accordion collapsed state: Record<groupName, isCollapsed>
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  // Add Task Form visibility & states
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [taskName, setTaskName] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskAssigneeId, setTaskAssigneeId] = useState('');
  const [taskPhase, setTaskPhase] = useState('Substructure / Foundation');
  const [taskTower, setTaskTower] = useState('Tower A');
  const [taskStartDate, setTaskStartDate] = useState('');
  const [taskEndDate, setTaskEndDate] = useState('');
  const [taskPriority, setTaskPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>('MEDIUM');
  const [taskFormError, setTaskFormError] = useState('');

  // Edit Task Modal state
  const [editingTask, setEditingTask] = useState<any | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editAssigneeId, setEditAssigneeId] = useState('');
  const [editPhase, setEditPhase] = useState('');
  const [editTower, setEditTower] = useState('');
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');
  const [editPriority, setEditPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>('MEDIUM');

  const tasks = project.tasks || [];
  const todayStr = new Date().toISOString().split('T')[0];

  // Helper: Pending tasks per site engineer
  const getPendingTaskCount = (engineerId: string) => {
    return tasks.filter(
      (t: any) =>
        (t.assigneeId === engineerId || t.assigned_to === engineerId) &&
        (t.status || 'TODO') !== 'COMPLETED'
    ).length;
  };

  // Helper: Strict site engineer options
  const renderEngineerOptions = (selectedVal: string) => {
    const allMembers = project.teamMembers || [];
    const siteEngineers = allMembers.filter((m: any) => {
      const r = (m.role || '').trim().toLowerCase();
      if (!r) return false;
      const isUpperMgmt = r.includes('super') || r.includes('director') || r.includes('admin') || r.includes('owner') || r.includes('project_manager') || r.includes('project manager');
      if (isUpperMgmt) return false;
      return r.includes('site') || r.includes('engineer') || r.includes('field');
    });

    if (siteEngineers.length === 0) {
      return <option value="" disabled>⚠️ No Site Engineers found</option>;
    }

    return siteEngineers.map((member: any) => {
      const pendingCount = getPendingTaskCount(member.id);
      return (
        <option key={member.id} value={member.id}>
          {member.name} ({member.role || 'Site Engineer'}) — {pendingCount} Pending Task{pendingCount === 1 ? '' : 's'}
        </option>
      );
    });
  };

  // Dynamic Phase & Tower states
  const [customPhases, setCustomPhases] = useState<string[]>([]);
  const [customTowers, setCustomTowers] = useState<string[]>([]);
  const [newPhaseInput, setNewPhaseInput] = useState('');
  const [newTowerInput, setNewTowerInput] = useState('');
  const [isAddingPhase, setIsAddingPhase] = useState(false);
  const [isAddingTower, setIsAddingTower] = useState(false);

  // Compute merged Phase list
  const phaseList = useMemo(() => {
    const defaults = [
      'Substructure / Foundation',
      'Superstructure / Frame',
      'Masonry & Plaster',
      'Finishing & Flooring',
      'MEP Electrical & Plumbing',
      'External & Landscaping'
    ];
    const taskPhases = (tasks || []).map((t: any) => t.phase).filter(Boolean);
    const set = new Set([...defaults, ...customPhases, ...taskPhases]);
    return Array.from(set);
  }, [tasks, customPhases]);

  // Compute merged Tower list
  const towerList = useMemo(() => {
    const defaults = ['Tower A', 'Tower B', 'Tower C', 'Basement Zone', 'Clubhouse / Amenities'];
    const taskTowers = (tasks || []).map((t: any) => t.siteTowerBlock).filter(Boolean);
    const set = new Set([...defaults, ...customTowers, ...taskTowers]);
    return Array.from(set);
  }, [tasks, customTowers]);

  const handleAddCustomPhase = () => {
    const trimmed = newPhaseInput.trim();
    if (!trimmed) return;
    if (!customPhases.includes(trimmed)) {
      setCustomPhases(prev => [...prev, trimmed]);
    }
    setTaskPhase(trimmed);
    setNewPhaseInput('');
    setIsAddingPhase(false);
  };

  const handleAddCustomTower = () => {
    const trimmed = newTowerInput.trim();
    if (!trimmed) return;
    if (!customTowers.includes(trimmed)) {
      setCustomTowers(prev => [...prev, trimmed]);
    }
    setTaskTower(trimmed);
    setNewTowerInput('');
    setIsAddingTower(false);
  };

  // Filter tasks based on search & filter controls
  const filteredTasks = useMemo(() => {
    return tasks.filter((t: any) => {
      // 1. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = (t.name || '').toLowerCase().includes(q);
        const matchesDesc = (t.description || '').toLowerCase().includes(q);
        const matchesAssignee = (t.assigneeName || '').toLowerCase().includes(q);
        const matchesCreator = (t.createdByName || '').toLowerCase().includes(q);
        const matchesPhase = (t.phase || '').toLowerCase().includes(q);
        if (!matchesName && !matchesDesc && !matchesAssignee && !matchesCreator && !matchesPhase) return false;
      }

      // 2. Engineer Filter
      if (filterEngineer && t.assigneeId !== filterEngineer && t.assigned_to !== filterEngineer) {
        return false;
      }

      // 3. Phase Filter
      if (filterPhase && t.phase !== filterPhase) {
        return false;
      }

      // 4. Exception Filter Chips
      if (filterChip === 'ISSUES') {
        if (!t.hasIssue && !t.issueDetails) return false;
      } else if (filterChip === 'DELAYED') {
        const isOverdue = t.status !== 'COMPLETED' && t.endDate && t.endDate < todayStr;
        if (!isOverdue) return false;
      } else if (filterChip === 'AWAITING_APPROVAL') {
        const isAwaiting = t.status === 'COMPLETED' && t.approvalStatus !== 'APPROVED';
        if (!isAwaiting) return false;
      }

      return true;
    });
  }, [tasks, searchQuery, filterEngineer, filterPhase, filterChip, todayStr]);

  // Counts for filter chips
  const issueCount = useMemo(() => tasks.filter((t: any) => t.hasIssue || t.issueDetails).length, [tasks]);
  const delayedCount = useMemo(() => tasks.filter((t: any) => t.status !== 'COMPLETED' && t.endDate && t.endDate < todayStr).length, [tasks, todayStr]);
  const awaitingCount = useMemo(() => tasks.filter((t: any) => t.status === 'COMPLETED' && t.approvalStatus !== 'APPROVED').length, [tasks]);

  // Group filtered tasks into accordions (by Phase or Tower)
  const groupedTasks = useMemo(() => {
    if (grouping === 'flat') {
      return { 'All Project Tasks': filteredTasks };
    }

    const groups: Record<string, any[]> = {};
    const keyProp = grouping === 'phase' ? 'phase' : 'siteTowerBlock';
    const defaultGroup = grouping === 'phase' ? 'General / Uncategorized' : 'Main Tower Block';

    filteredTasks.forEach((t: any) => {
      const gName = t[keyProp] || defaultGroup;
      if (!groups[gName]) groups[gName] = [];
      groups[gName].push(t);
    });

    return groups;
  }, [filteredTasks, grouping]);

  const toggleGroup = (groupName: string) => {
    setCollapsedGroups(prev => ({ ...prev, [groupName]: !prev[groupName] }));
  };

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
      description: taskDescription?.trim() || undefined,
      startDate: taskStartDate || todayStr,
      endDate: taskEndDate || defaultEndStr,
      assigneeId: assignee.id,
      assigneeName: assignee.name,
      priority: taskPriority,
      status: 'TODO',
      phase: taskPhase,
      siteTowerBlock: taskTower,
    });

    setTaskName('');
    setTaskDescription('');
    setTaskAssigneeId('');
    setTaskStartDate('');
    setTaskEndDate('');
    setTaskPriority('MEDIUM');
    setIsAddFormOpen(false);
  };

  const openEditModal = (task: any) => {
    setEditingTask(task);
    setEditName(task.name || '');
    setEditDescription(task.description || '');
    setEditAssigneeId(task.assigneeId || task.assigned_to || '');
    setEditPhase(task.phase || 'Substructure / Foundation');
    setEditTower(task.siteTowerBlock || 'Tower A');
    setEditStartDate(task.startDate || '');
    setEditEndDate(task.endDate || '');
    setEditPriority(task.priority || 'MEDIUM');
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask) return;

    const assignee = (project.teamMembers || []).find((m: any) => m.id === editAssigneeId);

    updateTask(project.id, editingTask.id, {
      name: editName.trim(),
      description: editDescription.trim(),
      startDate: editStartDate,
      endDate: editEndDate,
      priority: editPriority,
      assigneeId: editAssigneeId,
      assigneeName: assignee ? assignee.name : editingTask.assigneeName,
      phase: editPhase,
      siteTowerBlock: editTower,
    });

    setEditingTask(null);
  };

  const priorityColors: Record<string, string> = {
    CRITICAL: 'bg-purple-50 text-purple-700 border-purple-300 dark:bg-purple-500/10 dark:text-purple-300 dark:border-purple-500/30 font-extrabold',
    HIGH: 'bg-red-50 text-red-600 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20',
    MEDIUM: 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
    LOW: 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20'
  };

  // Render single Task Card (for Board View)
  const renderTaskCard = (task: any) => {
    const taskStatus = task.status ?? (task.progress === 0 ? 'TODO' : task.progress === 100 ? 'COMPLETED' : 'IN_PROGRESS');
    const taskPriorityValue = task.priority ?? (task.isCriticalPath ? 'HIGH' : 'MEDIUM');
    const isApproved = task.approvalStatus === 'APPROVED';

    return (
      <motion.div 
        layout
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        key={task.id} 
        className="group relative rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm transition-all hover:border-[#b68d40]/30 hover:shadow-md flex flex-col gap-3"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
              <span className={`w-fit rounded-md border px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider ${priorityColors[taskPriorityValue] || priorityColors.MEDIUM}`}>
                {taskPriorityValue}
              </span>

              {task.phase && (
                <span className="bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border border-gray-200 dark:border-gray-700 text-[8px] font-bold px-1.5 py-0.5 rounded-md">
                  {task.phase}
                </span>
              )}

              {/* Approval status tag */}
              {taskStatus === 'COMPLETED' && (
                isApproved ? (
                  <span className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[9px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Approved by {task.approvedByName || 'Manager'}
                  </span>
                ) : (
                  <span className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-[9px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 animate-pulse">
                    <Clock className="w-3 h-3" /> Awaiting Manager Approval
                  </span>
                )
              )}

              {/* Automatic Delay tag */}
              {(() => {
                const isOverdue = taskStatus !== 'COMPLETED' && task.endDate && task.endDate < todayStr;
                if (!isOverdue) return null;
                const diffMs = new Date().getTime() - new Date(task.endDate).getTime();
                const overdueDays = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
                return (
                  <span className="bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-[9px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
                    <AlertCircle className="w-3 h-3 text-rose-600" /> Delayed by {overdueDays} day{overdueDays > 1 ? 's' : ''}
                  </span>
                );
              })()}

              {/* Site Issue tag */}
              {(task.hasIssue || task.issueDetails) && (
                <span className="bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200 border border-amber-300 dark:border-amber-700 text-[9px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 animate-bounce">
                  ⚠️ Issue: {task.issueDetails || 'Site Issue Reported'}
                </span>
              )}
            </div>

            <h4 className={`text-sm font-bold leading-tight ${taskStatus === 'COMPLETED' && isApproved ? 'text-gray-400 line-through' : 'text-gray-900 dark:text-white'}`}>
              {task.name}
            </h4>

            {task.description && (
              <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mt-1">
                {task.description}
              </p>
            )}
          </div>
          
          <div className="flex items-center gap-1">
            <button 
              onClick={() => openEditModal(task)}
              className="p-1 rounded-lg text-gray-400 hover:text-[#b68d40] hover:bg-gray-100 dark:hover:bg-gray-800 transition"
              title="Edit Task Details"
            >
              <Edit3 className="w-4 h-4" />
            </button>

            <div className="relative group/dropdown">
              <button className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <MoreVertical className="w-4 h-4" />
              </button>
              {/* Context Menu Dropdown */}
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
        </div>

        {/* Assigned By & Assignee Details */}
        <div className="flex flex-col gap-1 pt-1 border-t border-gray-100 dark:border-gray-800 text-[11px] text-gray-500 dark:text-gray-400">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-gray-400" />
              <span className="font-medium">Due: {task.endDate || 'No Due Date'}</span>
            </div>

            <div className="flex items-center gap-1.5">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 font-bold text-gray-700 dark:text-gray-300 text-[10px]">
                {task.assigneeName ? task.assigneeName.charAt(0).toUpperCase() : '?'}
              </div>
              <span className="font-medium truncate max-w-[90px]">{task.assigneeName || 'Unassigned'}</span>
            </div>
          </div>

          <div className="flex items-center gap-1 text-[10px] text-gray-400 mt-1">
            <UserCheck className="w-3 h-3 text-[#b68d40]" />
            <span>Assigned By: <strong className="text-gray-700 dark:text-gray-300">{task.createdByName || currentUser?.name || 'Project Manager'}</strong></span>
          </div>
        </div>

        {/* Progress Bar & Manager Approve Action */}
        <div className="mt-2 space-y-2 pt-2 border-t border-gray-100 dark:border-gray-800">
          {(() => {
            const currentPct = Number(task.progress ?? (taskStatus === 'COMPLETED' ? 100 : taskStatus === 'IN_PROGRESS' ? 50 : 0));
            let barGradient = 'bg-gray-200 dark:bg-gray-700';
            let badgeBg = 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
            
            if (currentPct === 100) {
              barGradient = 'bg-gradient-to-r from-emerald-500 via-teal-400 to-green-500 shadow-sm shadow-emerald-500/30';
              badgeBg = 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800';
            } else if (currentPct >= 50) {
              barGradient = 'bg-gradient-to-r from-blue-600 via-cyan-500 to-indigo-500 shadow-sm shadow-blue-500/30';
              badgeBg = 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800';
            } else if (currentPct > 0) {
              barGradient = 'bg-gradient-to-r from-amber-500 to-yellow-400 shadow-sm shadow-amber-500/30';
              badgeBg = 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800';
            }

            return (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-gray-500 dark:text-gray-400 flex items-center gap-1">
                    <TrendingUp className="w-3.5 h-3.5 text-[#b68d40]" /> App Sync Progress
                  </span>
                  <span className={`px-2 py-0.5 rounded-full border text-[10px] font-black ${badgeBg}`}>
                    {currentPct}% {currentPct === 100 ? 'Completed' : currentPct === 0 ? 'To Do' : 'In Progress'}
                  </span>
                </div>

                <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800/80 p-0.5 border border-gray-200/50 dark:border-gray-700/50 shadow-inner">
                  <div 
                    className={`h-full rounded-full transition-all duration-500 ease-out ${barGradient}`} 
                    style={{ width: `${currentPct}%` }} 
                  />
                </div>
              </div>
            );
          })()}

          {/* Manager Approve Button */}
          {taskStatus === 'COMPLETED' && !isApproved && (
            <div className="pt-2 flex justify-end">
              <button
                onClick={() => updateTask(project.id, task.id, { 
                  approvalStatus: 'APPROVED', 
                  approvedByName: currentUser?.name || 'Project Manager' 
                })}
                className="flex items-center gap-1.5 text-[11px] font-bold bg-emerald-600 text-white px-3 py-1.5 rounded-xl hover:bg-emerald-700 active:scale-95 transition shadow-md cursor-pointer shrink-0"
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> Approve Task
              </button>
            </div>
          )}
        </div>
      </motion.div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-gray-900 p-4 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#b68d40]/10 text-[#b68d40] border border-[#b68d40]/20">
            <ListTodo className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-heading text-lg font-bold text-gray-900 dark:text-white">
                ERP Task Management System
              </h2>
              <span className="text-[11px] font-extrabold px-2.5 py-0.5 rounded-full bg-[#b68d40]/10 text-[#b68d40] border border-[#b68d40]/25">
                {filteredTasks.length} Tasks
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">High-capacity operations engine & site engineer workflow</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap shrink-0">
          {/* View Mode Switcher (Board | Table) */}
          <div className="flex items-center h-9.5 rounded-xl bg-gray-100 dark:bg-gray-800/80 p-1 border border-gray-200 dark:border-gray-700">
            <button
              onClick={() => setViewMode('board')}
              className={`flex items-center gap-1.5 px-3 h-7 rounded-lg text-xs font-bold transition cursor-pointer ${
                viewMode === 'board' ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-xs' : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" /> Board
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1.5 px-3 h-7 rounded-lg text-xs font-bold transition cursor-pointer ${
                viewMode === 'table' ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-xs' : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <TableIcon className="w-3.5 h-3.5" /> Table
            </button>
          </div>

          {/* Grouping Selector */}
          <div className="relative">
            <select
              value={grouping}
              onChange={(e) => setGrouping(e.target.value as any)}
              className="h-9.5 appearance-none rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 pl-3.5 pr-8 text-xs font-bold text-gray-700 dark:text-gray-300 outline-none cursor-pointer hover:border-[#b68d40] focus:ring-1 focus:ring-[#b68d40]"
            >
              <option value="phase">Group by Phase</option>
              <option value="tower">Group by Building Tower</option>
              <option value="flat">No Grouping (Flat List)</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          </div>
          
          <button
            onClick={() => setIsAddFormOpen(!isAddFormOpen)}
            className="flex items-center gap-2 h-9.5 rounded-xl bg-[#b68d40] px-4 text-xs font-bold text-white shadow-sm hover:bg-[#967332] active:scale-95 transition-all cursor-pointer"
          >
            {isAddFormOpen ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {isAddFormOpen ? 'Close Form' : '+ New Task'}
          </button>
        </div>
      </div>

      {/* Search & Multi-Filter Control Bar */}
      <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm space-y-3">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search 1,000+ tasks by title, scope, engineer, or phase..."
              className="w-full h-9.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 pl-10 pr-8 text-xs text-gray-900 dark:text-white outline-none focus:border-[#b68d40] focus:ring-1 focus:ring-[#b68d40]"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Engineer Filter Dropdown */}
          <div className="relative lg:w-60 shrink-0">
            <select
              value={filterEngineer}
              onChange={(e) => setFilterEngineer(e.target.value)}
              className="w-full h-9.5 appearance-none rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 pl-3.5 pr-8 text-xs font-medium text-gray-700 dark:text-gray-300 outline-none cursor-pointer focus:border-[#b68d40]"
            >
              <option value="">Filter by Site Engineer (All)</option>
              {renderEngineerOptions(filterEngineer)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          </div>

          {/* Phase Filter Dropdown */}
          <div className="relative lg:w-56 shrink-0">
            <select
              value={filterPhase}
              onChange={(e) => setFilterPhase(e.target.value)}
              className="w-full h-9.5 appearance-none rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 pl-3.5 pr-8 text-xs font-medium text-gray-700 dark:text-gray-300 outline-none cursor-pointer focus:border-[#b68d40]"
            >
              <option value="">Filter by Phase (All)</option>
              {phaseList.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          </div>
        </div>

        {/* Exception Filter Chips */}
        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-gray-100 dark:border-gray-800">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400 flex items-center gap-1.5 mr-1 select-none">
            <Filter className="w-3 h-3 text-[#b68d40]" /> Quick Exception Filters:
          </span>

          <button
            onClick={() => setFilterChip('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer border ${
              filterChip === 'ALL'
                ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900 border-transparent shadow-xs'
                : 'bg-gray-50 dark:bg-gray-800/60 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-100'
            }`}
          >
            All Tasks ({tasks.length})
          </button>

          <button
            onClick={() => setFilterChip('ISSUES')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer border flex items-center gap-1.5 ${
              filterChip === 'ISSUES'
                ? 'bg-amber-500 text-white border-amber-500 shadow-xs'
                : 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300 border-amber-200 dark:border-amber-800 hover:bg-amber-100'
            }`}
          >
            ⚠️ Has Issues ({issueCount})
          </button>

          <button
            onClick={() => setFilterChip('DELAYED')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer border flex items-center gap-1.5 ${
              filterChip === 'DELAYED'
                ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                : 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300 border-rose-200 dark:border-rose-800 hover:bg-rose-100'
            }`}
          >
            🚨 Delayed ({delayedCount})
          </button>

          <button
            onClick={() => setFilterChip('AWAITING_APPROVAL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer border flex items-center gap-1.5 ${
              filterChip === 'AWAITING_APPROVAL'
                ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                : 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300 border-blue-200 dark:border-blue-800 hover:bg-blue-100'
            }`}
          >
            ⏳ Awaiting Approval ({awaitingCount})
          </button>

          {(searchQuery || filterEngineer || filterPhase || filterChip !== 'ALL') && (
            <button
              onClick={() => {
                setSearchQuery('');
                setFilterEngineer('');
                setFilterPhase('');
                setFilterChip('ALL');
              }}
              className="ml-auto text-xs font-bold text-gray-500 hover:text-red-500 transition-colors flex items-center gap-1 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" /> Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Add Task Form */}
      <AnimatePresence>
        {isAddFormOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <form onSubmit={handleTaskSubmit} className="mb-6 relative overflow-hidden rounded-2xl border border-gray-100 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 p-5 lg:p-6 shadow-sm backdrop-blur-xl space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <label className="block lg:col-span-2">
                  <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-gray-500">Task Title</span>
                  <input
                    type="text"
                    value={taskName}
                    onChange={(event) => setTaskName(event.target.value)}
                    placeholder="e.g. Inspect basement waterproofing"
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 px-4 py-3 text-sm text-gray-900 dark:text-white outline-none transition-all focus:border-[#b68d40]"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="block md:col-span-2 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Construction Phase</span>
                    <button
                      type="button"
                      onClick={() => setIsAddingPhase(!isAddingPhase)}
                      className="text-[10px] font-bold text-[#b68d40] hover:underline cursor-pointer"
                    >
                      {isAddingPhase ? 'Cancel' : '+ Add Custom Phase'}
                    </button>
                  </div>

                  {isAddingPhase ? (
                    <div className="flex items-center gap-1.5 pt-0.5">
                      <input
                        type="text"
                        value={newPhaseInput}
                        onChange={(e) => setNewPhaseInput(e.target.value)}
                        placeholder="Enter phase (e.g. Facade & Glazing)"
                        className="flex-1 rounded-xl border border-[#b68d40] bg-white dark:bg-gray-800 px-3 py-2 text-xs text-gray-900 dark:text-white outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleAddCustomPhase}
                        className="bg-[#b68d40] text-white text-xs font-bold px-3 py-2 rounded-xl hover:bg-[#a37c35] cursor-pointer"
                      >
                        Save
                      </button>
                    </div>
                  ) : (
                    <select
                      value={taskPhase}
                      onChange={(e) => setTaskPhase(e.target.value)}
                      className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 px-3 py-2.5 text-sm text-gray-900 dark:text-white outline-none focus:border-[#b68d40]"
                    >
                      {phaseList.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  )}
                </div>

                <div className="block md:col-span-2 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Building Block / Tower</span>
                    <button
                      type="button"
                      onClick={() => setIsAddingTower(!isAddingTower)}
                      className="text-[10px] font-bold text-[#b68d40] hover:underline cursor-pointer"
                    >
                      {isAddingTower ? 'Cancel' : '+ Add Custom Tower'}
                    </button>
                  </div>

                  {isAddingTower ? (
                    <div className="flex items-center gap-1.5 pt-0.5">
                      <input
                        type="text"
                        value={newTowerInput}
                        onChange={(e) => setNewTowerInput(e.target.value)}
                        placeholder="Enter tower (e.g. Tower D / Commercial)"
                        className="flex-1 rounded-xl border border-[#b68d40] bg-white dark:bg-gray-800 px-3 py-2 text-xs text-gray-900 dark:text-white outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleAddCustomTower}
                        className="bg-[#b68d40] text-white text-xs font-bold px-3 py-2 rounded-xl hover:bg-[#a37c35] cursor-pointer"
                      >
                        Save
                      </button>
                    </div>
                  ) : (
                    <select
                      value={taskTower}
                      onChange={(e) => setTaskTower(e.target.value)}
                      className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 px-3 py-2.5 text-sm text-gray-900 dark:text-white outline-none focus:border-[#b68d40]"
                    >
                      {towerList.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <label className="block md:col-span-3">
                  <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-gray-500">Detailed Scope of Work</span>
                  <textarea
                    rows={2}
                    value={taskDescription}
                    onChange={(e) => setTaskDescription(e.target.value)}
                    placeholder="Add detailed scope or instructions for the site engineer..."
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 px-4 py-2.5 text-sm text-gray-900 dark:text-white outline-none focus:border-[#b68d40]"
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-gray-500">Priority Level</span>
                  <select
                    value={taskPriority}
                    onChange={(event) => setTaskPriority(event.target.value as any)}
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 px-4 py-3 text-sm text-gray-900 dark:text-white outline-none focus:border-[#b68d40]"
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="CRITICAL">Critical</option>
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-gray-500">Start Date</span>
                  <input
                    type="date"
                    value={taskStartDate}
                    onChange={(event) => setTaskStartDate(event.target.value)}
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 px-3 py-3 text-sm text-gray-900 dark:text-white outline-none focus:border-[#b68d40]"
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-gray-500">Due Date</span>
                  <input
                    type="date"
                    value={taskEndDate}
                    min={taskStartDate || undefined}
                    onChange={(event) => setTaskEndDate(event.target.value)}
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 px-3 py-3 text-sm text-gray-900 dark:text-white outline-none focus:border-[#b68d40]"
                  />
                </label>
              </div>

              {taskFormError && (
                <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-red-600 dark:border-red-900/50 dark:bg-red-900/20">
                  <AlertCircle className="h-4 w-4 mt-0.5" />
                  <p className="text-xs font-medium">{taskFormError}</p>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={project.teamMembers.length === 0}
                  className="flex items-center gap-2 rounded-xl bg-gray-900 dark:bg-white px-6 py-3 text-sm font-bold text-white dark:text-gray-900 transition-all hover:scale-[1.02] active:scale-95 cursor-pointer"
                >
                  <Plus className="h-4 w-4" /> Create & Allocate Task
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Task Modal */}
      <AnimatePresence>
        {editingTask && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 w-full max-w-lg rounded-3xl p-6 shadow-2xl space-y-4 relative"
            >
              <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <Edit3 className="w-5 h-5 text-[#b68d40]" /> Edit Task Metadata
                </h3>
                <button
                  onClick={() => setEditingTask(null)}
                  className="p-1 rounded-full text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleEditSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Task Title</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    required
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 px-4 py-2.5 text-sm text-gray-900 dark:text-white outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Phase</label>
                    <select
                      value={editPhase}
                      onChange={(e) => setEditPhase(e.target.value)}
                      className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 px-3 py-2 text-xs"
                    >
                      {phaseList.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Building Block</label>
                    <select
                      value={editTower}
                      onChange={(e) => setEditTower(e.target.value)}
                      className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 px-3 py-2 text-xs"
                    >
                      {towerList.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Reassign Site Engineer</label>
                  <select
                    value={editAssigneeId}
                    onChange={(e) => setEditAssigneeId(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 px-4 py-2.5 text-sm"
                  >
                    <option value="">Select Engineer</option>
                    {renderEngineerOptions(editAssigneeId)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Detailed Scope</label>
                  <textarea
                    rows={2}
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 px-4 py-2.5 text-sm"
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Priority</label>
                    <select
                      value={editPriority}
                      onChange={(e) => setEditPriority(e.target.value as any)}
                      className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 px-3 py-2 text-xs"
                    >
                      <option value="LOW">Low</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HIGH">High</option>
                      <option value="CRITICAL">Critical</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Start Date</label>
                    <input
                      type="date"
                      value={editStartDate}
                      onChange={(e) => setEditStartDate(e.target.value)}
                      className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 px-2 py-2 text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Due Date</label>
                    <input
                      type="date"
                      value={editEndDate}
                      onChange={(e) => setEditEndDate(e.target.value)}
                      className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 px-2 py-2 text-xs"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-3">
                  <button
                    type="button"
                    onClick={() => setEditingTask(null)}
                    className="px-4 py-2 text-xs font-bold text-gray-500 hover:bg-gray-100 rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 text-xs font-bold bg-[#b68d40] text-white rounded-xl hover:bg-[#a37c35] transition shadow-md"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Main View Renderer (Board / Table / Detailed Gantt) */}
      {Object.keys(groupedTasks).length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-2xl">
          <p className="text-sm font-bold text-gray-500">No matching tasks found for your filters.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedTasks).map(([groupName, groupTaskList]) => {
            const isCollapsed = Boolean(collapsedGroups[groupName]);
            const groupTotal = groupTaskList.length;
            const groupCompleted = groupTaskList.filter((t: any) => (t.status || 'TODO') === 'COMPLETED').length;
            const groupProgressPct = groupTotal > 0 ? Math.round((groupCompleted / groupTotal) * 100) : 0;
            const groupIssues = groupTaskList.filter((t: any) => t.hasIssue || t.issueDetails).length;
            const groupOverdue = groupTaskList.filter((t: any) => (t.status || 'TODO') !== 'COMPLETED' && t.endDate && t.endDate < todayStr).length;

            return (
              <div key={groupName} className="space-y-4">
                {/* Accordion Group Header (Only if Grouping enabled) */}
                {grouping !== 'flat' && (
                  <button
                    onClick={() => toggleGroup(groupName)}
                    className="w-full flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-4 shadow-sm hover:border-[#b68d40]/40 transition text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                        {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                      <div>
                        <h3 className="font-heading text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                          {grouping === 'phase' ? <Layers className="w-4 h-4 text-[#b68d40]" /> : <Building className="w-4 h-4 text-[#b68d40]" />}
                          {groupName}
                        </h3>
                        <p className="text-xs text-gray-500">
                          {groupCompleted} / {groupTotal} Tasks Completed ({groupProgressPct}%)
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {groupIssues > 0 && (
                        <span className="bg-amber-100 text-amber-800 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                          ⚠️ {groupIssues} Issue{groupIssues > 1 ? 's' : ''}
                        </span>
                      )}
                      {groupOverdue > 0 && (
                        <span className="bg-rose-100 text-rose-800 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                          🚨 {groupOverdue} Delayed
                        </span>
                      )}

                      {/* Mini Phase Progress Bar */}
                      <div className="w-32 hidden md:block space-y-1">
                        <div className="h-2 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                          <div className="h-full bg-[#b68d40] rounded-full transition-all duration-500" style={{ width: `${groupProgressPct}%` }} />
                        </div>
                      </div>
                    </div>
                  </button>
                )}

                {/* Group Body (Collapsible) */}
                {!isCollapsed && (
                  <div>
                    {/* 1. BOARD VIEW (Kanban 3-Columns) */}
                    {viewMode === 'board' && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
                        {/* TO DO */}
                        <div className="flex flex-col gap-4">
                          <div className="flex items-center justify-between border-b-2 border-gray-200 dark:border-gray-800 pb-2">
                            <div className="flex items-center gap-2">
                              <div className="w-2.5 h-2.5 rounded-full bg-gray-400"></div>
                              <h4 className="font-heading text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider">To Do</h4>
                            </div>
                            <span className="text-xs font-bold text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
                              {groupTaskList.filter((t: any) => (t.status || 'TODO') === 'TODO').length}
                            </span>
                          </div>
                          <div className="flex flex-col gap-3 min-h-[150px]">
                            <AnimatePresence>
                              {groupTaskList.filter((t: any) => (t.status || 'TODO') === 'TODO').map(renderTaskCard)}
                            </AnimatePresence>
                          </div>
                        </div>

                        {/* IN PROGRESS */}
                        <div className="flex flex-col gap-4">
                          <div className="flex items-center justify-between border-b-2 border-blue-200 dark:border-blue-900/50 pb-2">
                            <div className="flex items-center gap-2">
                              <div className="w-2.5 h-2.5 rounded-full bg-blue-500"></div>
                              <h4 className="font-heading text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider">In Progress</h4>
                            </div>
                            <span className="text-xs font-bold text-blue-600 bg-blue-50 dark:bg-blue-500/10 px-2 py-0.5 rounded-full">
                              {groupTaskList.filter((t: any) => (t.status || 'TODO') === 'IN_PROGRESS').length}
                            </span>
                          </div>
                          <div className="flex flex-col gap-3 min-h-[150px]">
                            <AnimatePresence>
                              {groupTaskList.filter((t: any) => (t.status || 'TODO') === 'IN_PROGRESS').map(renderTaskCard)}
                            </AnimatePresence>
                          </div>
                        </div>

                        {/* COMPLETED */}
                        <div className="flex flex-col gap-4">
                          <div className="flex items-center justify-between border-b-2 border-emerald-200 dark:border-emerald-900/50 pb-2">
                            <div className="flex items-center gap-2">
                              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
                              <h4 className="font-heading text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider">Completed</h4>
                            </div>
                            <span className="text-xs font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-full">
                              {groupTaskList.filter((t: any) => (t.status || 'TODO') === 'COMPLETED').length}
                            </span>
                          </div>
                          <div className="flex flex-col gap-3 min-h-[150px]">
                            <AnimatePresence>
                              {groupTaskList.filter((t: any) => (t.status || 'TODO') === 'COMPLETED').map(renderTaskCard)}
                            </AnimatePresence>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 2. TABLE VIEW (High-Density Spreadsheet View) */}
                    {viewMode === 'table' && (
                      <div className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-gray-50 dark:bg-gray-800/60 text-gray-500 dark:text-gray-400 font-bold uppercase tracking-wider border-b border-gray-200 dark:border-gray-800">
                            <tr>
                              <th className="p-3">Task Title & Scope</th>
                              <th className="p-3">Phase / Tower</th>
                              <th className="p-3">Assignee & Creator</th>
                              <th className="p-3">Priority</th>
                              <th className="p-3">Due Date</th>
                              <th className="p-3">Progress</th>
                              <th className="p-3">Status / Approval</th>
                              <th className="p-3 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                            {groupTaskList.map((t: any) => {
                              const tStatus = t.status || 'TODO';
                              const tPriority = t.priority || 'MEDIUM';
                              const isApproved = t.approvalStatus === 'APPROVED';
                              const isOverdue = tStatus !== 'COMPLETED' && t.endDate && t.endDate < todayStr;
                              const pct = Number(t.progress ?? (tStatus === 'COMPLETED' ? 100 : tStatus === 'IN_PROGRESS' ? 50 : 0));

                              return (
                                <tr key={t.id} className="hover:bg-gray-50/80 dark:hover:bg-gray-800/40 transition">
                                  <td className="p-3 font-semibold text-gray-900 dark:text-white max-w-[220px]">
                                    <div className="truncate font-bold">{t.name}</div>
                                    {t.description && <div className="text-[10px] text-gray-400 truncate">{t.description}</div>}
                                    {(t.hasIssue || t.issueDetails) && (
                                      <span className="mt-0.5 inline-flex items-center text-[9px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                                        ⚠️ {t.issueDetails || 'Site Issue'}
                                      </span>
                                    )}
                                  </td>

                                  <td className="p-3 text-gray-500">
                                    <div>{t.phase || 'Uncategorized'}</div>
                                    <div className="text-[10px] text-gray-400">{t.siteTowerBlock || 'Tower A'}</div>
                                  </td>

                                  <td className="p-3">
                                    <div className="font-semibold text-gray-900 dark:text-white">{t.assigneeName || 'Unassigned'}</div>
                                    <div className="text-[10px] text-gray-400">By: {t.createdByName || 'Manager'}</div>
                                  </td>

                                  <td className="p-3">
                                    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase border ${priorityColors[tPriority] || priorityColors.MEDIUM}`}>
                                      {tPriority}
                                    </span>
                                  </td>

                                  <td className="p-3 font-medium">
                                    <div className={isOverdue ? 'text-rose-600 font-bold' : 'text-gray-600 dark:text-gray-300'}>
                                      {t.endDate || 'No Date'}
                                    </div>
                                    {isOverdue && <div className="text-[9px] text-rose-500 font-bold">Overdue</div>}
                                  </td>

                                  <td className="p-3 min-w-[120px]">
                                    <div className="flex items-center justify-between text-[10px] font-bold mb-1">
                                      <span>{pct}%</span>
                                    </div>
                                    <div className="h-1.5 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                      <div className="h-full bg-[#b68d40] rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
                                    </div>
                                  </td>

                                  <td className="p-3">
                                    {tStatus === 'COMPLETED' ? (
                                      isApproved ? (
                                        <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded text-[10px] font-bold">
                                          ✅ Approved
                                        </span>
                                      ) : (
                                        <span className="bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded text-[10px] font-bold animate-pulse">
                                          ⏳ Awaiting Approval
                                        </span>
                                      )
                                    ) : (
                                      <span className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded text-[10px] font-bold">
                                        {tStatus}
                                      </span>
                                    )}
                                  </td>

                                  <td className="p-3 text-right">
                                    <div className="flex items-center justify-end gap-1">
                                      {tStatus === 'COMPLETED' && !isApproved && (
                                        <button
                                          onClick={() => updateTask(project.id, t.id, { approvalStatus: 'APPROVED', approvedByName: currentUser?.name || 'Project Manager' })}
                                          className="p-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 text-[10px] font-bold px-2 flex items-center gap-1 cursor-pointer"
                                        >
                                          <CheckCircle2 className="w-3 h-3" /> Approve
                                        </button>
                                      )}
                                      <button
                                        onClick={() => openEditModal(t)}
                                        className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
                                      >
                                        <Edit3 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
