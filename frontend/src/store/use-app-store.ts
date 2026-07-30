/* eslint-disable @typescript-eslint/no-explicit-any */
import { create } from 'zustand';
import type {
  ProjectSite, 
  User, 
  DailyActivity,
  MaterialStock,
  MaterialTransaction,
  ChatMessage,
  ProcurementReq,
  BOQItem,
  GanttTask,
  Vendor,
  VendorQuotation,
  VendorBill,
  VendorPayment,
  VendorPerformance,
  ChecklistTemplate,
  SubmittedChecklist,
  QcInspection,
  ReworkTask,
  WorkCompletion,
  DelayRecord,
  CorrectiveTask,
} from '@/utils/mock-data';
import { mockProjects } from '@/utils/mock-data';
import type { Role } from '@/lib/roles';

export type AIMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

export type AIConversation = {
  id: string;
  title: string;
  time: string;
  messages: AIMessage[];
};

import { supabase, getDbSiteId, getFrontendProjectId, getDbUserId, getSupabaseJsonHeaders } from '@/utils/supabase-client';
import { bootstrapInboxData, getSessionProfile, signOut as signOutSupabase } from '@/lib/inbox';
import { normalizeDatabaseRole } from '@/lib/rbac';
import {
  addProjectMemberByName,
  createBoqRecord,
  createDailyProgressReport,
  createProcurementWorkflowRequest,
  createQcInspection,
  createVendorBill,
  isLiveSupabase,
  recordNormalizedMaterialTransaction,
} from '@/lib/erp/supabase-modules';

type AppNotification = {
  id: string;
  type: string;
  title: string;
  message: string;
  time: string;
  read: boolean;
};

const DEFAULT_USER: User = {
  id: '',
  name: 'Signed in user',
  email: '',
  role: 'PROJECT_MANAGER',
  avatar: '',
};

interface AppState {
  activeRole: Role;
  currentUser: User;
  isLoggedIn: boolean;
  projects: ProjectSite[];
  notifications: AppNotification[];
  aiConversations: AIConversation[];
  activeProjectId: string;
  theme: 'light' | 'dark';
  sidebarOpen: boolean;
  supabaseInitialized: boolean;
  
  vendors: Vendor[];
  vendorBills: VendorBill[];
  vendorQuotations: VendorQuotation[];
  vendorPayments: VendorPayment[];
  vendorPerformances: VendorPerformance[];
  
  // Actions
  checkLogin: () => Promise<void>;
  login: (email: string, role: Role) => void;
  logout: () => void;
  setActiveRole: (role: Role) => void;
  setActiveProjectId: (id: string) => void;
  toggleTheme: () => void;
  setSidebarOpen: (open: boolean) => void;
  initSupabase: () => void;
  fetchDbProjects: () => Promise<void>;
  fetchDbMessages: () => Promise<void>;
  fetchDbTasks: () => Promise<void>;
  fetchDbTeamMembers: () => Promise<void>;
  fetchDbMaterials: () => Promise<void>;
  sendAIAssistantMessage: (conversationId: string, userText: string) => void;
  createAIConversation: (conversationId: string, title: string) => void;
  
  addDailyActivity: (projectId: string, activity: Omit<DailyActivity, 'id' | 'date'>) => void;
  submitDPR: (projectId: string, dpr: Omit<DailyActivity, 'id'>) => void;
  updateDPRStatus: (projectId: string, dprId: string, status: DailyActivity['status'], remarks?: string) => void;
  reportDelayRecord: (projectId: string, delay: Omit<DelayRecord, 'id'>) => void;
  updateDelayRecord: (projectId: string, delayId: string, updates: Partial<DelayRecord>) => void;
  createCorrectiveTask: (projectId: string, task: Omit<CorrectiveTask, 'id'>) => void;
  updateCorrectiveTask: (projectId: string, taskId: string, updates: Partial<CorrectiveTask>) => void;
  
  addMaterialTransaction: (projectId: string, materialId: string, type: 'INWARD' | 'OUTWARD', quantity: number, cost: number, referenceNo: string) => void;
  addChatMessage: (projectId: string, senderName: string, senderRole: string, message: string, attachments?: string[]) => void;
  addProcurementReq: (projectId: string, req: Omit<ProcurementReq, 'id' | 'requisitionNo' | 'requestedDate'>) => void;
  addBOQItem: (projectId: string, item: Omit<BOQItem, 'id' | 'approved' | 'consumedQty'>) => void;
  markNotificationRead: (id: string) => void;
  clearNotifications: () => void;
  addQCItem: (projectId: string, title: string) => void;
  addInvoice: (projectId: string, amount: number, desc: string) => void;
  addTeamMember: (projectId: string, name: string, role: string) => void;
  addTask: (
    projectId: string,
    task: Omit<GanttTask, 'id' | 'projectId' | 'progress' | 'dependencies' | 'isCriticalPath'>
  ) => void;
  updateTask: (
    projectId: string,
    taskId: string,
    updates: Partial<Pick<GanttTask, 'assigneeId' | 'assigneeName' | 'priority' | 'status' | 'progress'>>
  ) => void;
  
  addVendor: (vendor: Omit<Vendor, 'id' | 'rating'>) => { error?: string; success: boolean };
  addQuotation: (quote: Omit<VendorQuotation, 'id' | 'submittedAt'>) => void;
  addVendorBill: (bill: Omit<VendorBill, 'id'>) => { error?: string; success: boolean };
  addVendorPayment: (payment: Omit<VendorPayment, 'id' | 'createdAt'>) => void;
  addPerformanceMetric: (metric: Omit<VendorPerformance, 'id' | 'evaluationDate'>) => void;

  // QC & Checklists Module
  addChecklistTemplate: (projectId: string, template: Omit<ChecklistTemplate, 'id'>) => void;
  updateChecklistTemplate: (projectId: string, templateId: string, updates: Partial<ChecklistTemplate>) => void;
  addSubmittedChecklist: (projectId: string, checklist: Omit<SubmittedChecklist, 'id'>) => void;
  updateSubmittedChecklistStatus: (projectId: string, checklistId: string, status: SubmittedChecklist['status']) => void;
  
  addQcInspection: (projectId: string, qc: Omit<QcInspection, 'id'>) => void;
  updateQcInspectionStatus: (projectId: string, qcId: string, status: QcInspection['status']) => void;
  
  addReworkTask: (projectId: string, rework: Omit<ReworkTask, 'id'>) => void;
  updateReworkTaskStatus: (projectId: string, reworkId: string, status: ReworkTask['status']) => void;
  
  addWorkCompletion: (projectId: string, workComp: Omit<WorkCompletion, 'id'>) => void;
  updateWorkCompletion: (projectId: string, workCompId: string, updates: Partial<WorkCompletion>) => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeRole: 'UPPER_MANAGEMENT',
  currentUser: DEFAULT_USER,
  isLoggedIn: false,
  projects: [],
  notifications: [],
  aiConversations: [],
  activeProjectId: '',
  theme: 'light',
  sidebarOpen: true,
  supabaseInitialized: false,
  vendors: [],
  vendorBills: [],
  vendorQuotations: [],
  vendorPayments: [],
  vendorPerformances: [],

  // Resolves the signed-in identity from the live Supabase session.
  //
  // No session => isLoggedIn: false. Previously both the "no profile" branch and the
  // catch block set `isLoggedIn: true, activeRole: 'UPPER_MANAGEMENT'`, so any visitor
  // was silently granted full upper-management access to every module without signing
  // in. That also made a login page unreachable by design.
  checkLogin: async () => {
    try {
      const profile = await getSessionProfile();
      if (!profile) {
        set({
          isLoggedIn: false,
          activeRole: 'PROJECT_MANAGER',
          currentUser: DEFAULT_USER,
        });
        return;
      }
      const role = normalizeDatabaseRole(profile.role);
      await bootstrapInboxData();
      set({
        isLoggedIn: true,
        activeRole: role,
        currentUser: {
          id: profile.id,
          name: profile.name,
          email: profile.email,
          role,
          avatar: '',
          project_id: profile.project_id,
        },
      });
    } catch {
      // A failed session lookup must fail closed, never open.
      set({
        isLoggedIn: false,
        activeRole: 'PROJECT_MANAGER',
        currentUser: DEFAULT_USER,
      });
    }
  },

  login: (email, role) => {
    set({
      isLoggedIn: true,
      activeRole: role,
      currentUser: { ...DEFAULT_USER, email, role },
    });
  },

  logout: () => {
    void signOutSupabase();
    set({ isLoggedIn: false, activeRole: 'PROJECT_MANAGER', currentUser: DEFAULT_USER, projects: [], notifications: [] });
  },

  setActiveRole: (role) => set((state) => {
    return { 
      activeRole: role, 
      currentUser: { ...state.currentUser, role },
    };
  }),

  setActiveProjectId: (id) => set({ activeProjectId: id }),
  
  toggleTheme: () => set((state) => {
    const newTheme = state.theme === 'light' ? 'dark' : 'light';
    if (typeof window !== 'undefined') {
      const root = window.document.documentElement;
      if (newTheme === 'dark') {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    }
    return { theme: newTheme };
  }),

  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  initSupabase: () => {
    if (!isLiveSupabase()) return;

    const initialized = useAppStore.getState().supabaseInitialized;
    if (initialized) return;
    set({ supabaseInitialized: true });

    // Fetch initial messages and set up subscription
    void useAppStore.getState().fetchDbProjects().then(() => {
      void useAppStore.getState().fetchDbMessages();
      void useAppStore.getState().fetchDbTasks();
      void useAppStore.getState().fetchDbTeamMembers();
      void useAppStore.getState().fetchDbMaterials();
    });

    // Clean up existing channel if it already exists (e.g. from hot-reload / Fast Refresh)
    try {
      const existingChannel = supabase.channel('db-messages-changes');
      supabase.removeChannel(existingChannel);
    } catch (e) {}

    const channel = supabase
      .channel('db-messages-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        async (payload) => {
          const newMsg = payload.new;
          const projectId = getFrontendProjectId(newMsg.project_id);
          const dbUserId = getDbUserId(useAppStore.getState().currentUser.id);

          let senderName = 'System';
          let senderRole = 'member';
          try {
            const { data: profile } = await supabase
              .from('profiles')
              .select('name, role')
              .eq('id', newMsg.sender_id)
              .limit(1)
              .maybeSingle();
            
            if (profile) {
              senderName = profile.name;
              senderRole = profile.role;
            }
          } catch (err) {
            console.error('Failed to fetch profile for realtime message:', err);
          }

          const chatMsg: ChatMessage = {
            id: newMsg.id,
            projectId,
            senderName: newMsg.sender_id === dbUserId ? 'Me' : senderName,
            senderRole: newMsg.sender_id === dbUserId ? 'UPPER_MANAGEMENT' : senderRole,
            message: newMsg.body || '',
            timestamp: newMsg.created_at || new Date().toISOString(),
            attachments: [],
            category: 'general',
            isOutbound: newMsg.sender_id === dbUserId
          };

          set((state) => {
            const updatedProjects = state.projects.map((proj) => {
              if (proj.id === projectId) {
                const exists = proj.chats.some(c => c.id === chatMsg.id || c.message === chatMsg.message);
                if (exists) return proj;
                
                const mergedChats = [...proj.chats, chatMsg];
                mergedChats.sort((a, b) => new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime());
                
                return {
                  ...proj,
                  chats: mergedChats
                };
              }
              return proj;
            });
            return { projects: updatedProjects };
          });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks' },
        (payload) => {
          const { eventType, new: newRow, old: oldRow } = payload as any;
          set((state) => {
            const updatedProjects = state.projects.map((proj) => {
              const row = newRow || oldRow;
              if (!row) return proj;
              const projId = getFrontendProjectId(row.project_id);
              if (proj.id !== projId) return proj;

              if (eventType === 'INSERT') {
                if (proj.tasks.some(t => t.id === newRow.id)) return proj;
                const newTask: GanttTask = {
                  id: newRow.id,
                  projectId: proj.id,
                  name: newRow.title,
                  startDate: newRow.start_date || '',
                  endDate: newRow.due_date || '',
                  progress: newRow.progress,
                  dependencies: newRow.dependencies || null,
                  isCriticalPath: newRow.priority === 'HIGH',
                  assigneeId: newRow.assignee_id || null,
                  assigneeName: newRow.assignee_name || null,
                  priority: newRow.priority,
                  status: newRow.status,
                };
                return { ...proj, tasks: [...proj.tasks, newTask] };
              }

              if (eventType === 'UPDATE') {
                return {
                  ...proj,
                  tasks: proj.tasks.map(t => t.id === newRow.id ? {
                    ...t,
                    name: newRow.title,
                    startDate: newRow.start_date || '',
                    endDate: newRow.due_date || '',
                    progress: newRow.progress,
                    dependencies: newRow.dependencies || null,
                    isCriticalPath: newRow.priority === 'HIGH',
                    assigneeId: newRow.assignee_id || null,
                    assigneeName: newRow.assignee_name || null,
                    priority: newRow.priority,
                    status: newRow.status,
                  } : t)
                };
              }

              if (eventType === 'DELETE') {
                return {
                  ...proj,
                  tasks: proj.tasks.filter(t => t.id !== oldRow.id)
                };
              }

              return proj;
            });
            return { projects: updatedProjects };
          });
        }
      )
      .subscribe();

    // Clean up existing materials channels if they exist
    try {
      const existingMatChannel = supabase.channel('db-materials-changes');
      supabase.removeChannel(existingMatChannel);
      const existingTxChannel = supabase.channel('db-transactions-changes');
      supabase.removeChannel(existingTxChannel);
    } catch (e) {}

    supabase
      .channel('db-materials-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'materials' },
        (payload) => {
          const { eventType, new: newRowRaw, old: oldRowRaw } = payload;
          const newRow = newRowRaw as any;
          const oldRow = oldRowRaw as any;
          set((state) => {
            const row = newRow || oldRow;
            if (!row) return {};
            const projId = getFrontendProjectId(row.project_id);
            
            const updatedProjects = state.projects.map((proj) => {
              if (proj.id !== projId) return proj;

              if (eventType === 'INSERT') {
                if (proj.materials.some(m => m.id === newRow.id)) return proj;
                let itemName = newRow.item_name;
                let supplierName = newRow.supplier_name || null;
                try {
                  if (newRow.item_name && newRow.item_name.startsWith('{')) {
                    const parsed = JSON.parse(newRow.item_name);
                    if (parsed.materialName) itemName = parsed.materialName;
                    if (parsed.vendor) supplierName = parsed.vendor;
                  }
                } catch (e) {}

                const newMat: MaterialStock = {
                  id: newRow.id,
                  projectId: proj.id,
                  itemName,
                  category: newRow.category,
                  quantity: Number(newRow.quantity),
                  unit: newRow.unit,
                  reorderLevel: Number(newRow.reorder_level),
                  stockValue: Number(newRow.stock_value),
                  supplierName,
                  transactions: [],
                };
                return { ...proj, materials: [...proj.materials, newMat] };
              }

              if (eventType === 'UPDATE') {
                let itemName = newRow.item_name;
                let supplierName = newRow.supplier_name || null;
                try {
                  if (newRow.item_name && newRow.item_name.startsWith('{')) {
                    const parsed = JSON.parse(newRow.item_name);
                    if (parsed.materialName) itemName = parsed.materialName;
                    if (parsed.vendor) supplierName = parsed.vendor;
                  }
                } catch (e) {}

                return {
                  ...proj,
                  materials: proj.materials.map(m => m.id === newRow.id ? {
                    ...m,
                    itemName,
                    category: newRow.category,
                    quantity: Number(newRow.quantity),
                    unit: newRow.unit,
                    reorderLevel: Number(newRow.reorder_level),
                    stockValue: Number(newRow.stock_value),
                    supplierName,
                  } : m)
                };
              }

              if (eventType === 'DELETE') {
                return {
                  ...proj,
                  materials: proj.materials.filter(m => m.id !== oldRow.id)
                };
              }

              return proj;
            });

            return { projects: updatedProjects };
          });
        }
      )
      .subscribe();

    supabase
      .channel('db-transactions-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'material_transactions' },
        (payload) => {
          const newTx = payload.new;
          set((state) => {
            const updatedProjects = state.projects.map((proj) => {
              const hasMaterial = proj.materials.some(m => m.id === newTx.material_id);
              if (!hasMaterial) return proj;

              return {
                ...proj,
                materials: proj.materials.map((m) => {
                  if (m.id !== newTx.material_id) return m;
                  if (m.transactions?.some(t => t.id === newTx.id)) return m;

                  const newTransaction: MaterialTransaction = {
                    id: newTx.id,
                    materialId: newTx.material_id,
                    type: newTx.type as 'INWARD' | 'OUTWARD',
                    quantity: Number(newTx.quantity),
                    date: newTx.date || new Date().toISOString().split('T')[0],
                    cost: Number(newTx.cost),
                    referenceNo: newTx.reference_no
                  };

                  return {
                    ...m,
                    transactions: [newTransaction, ...(m.transactions || [])]
                  };
                })
              };
            });

            return { projects: updatedProjects };
          });
        }
      )
      .subscribe();
  },

  fetchDbProjects: async () => {
    if (!isLiveSupabase()) {
      set((state) => ({
        projects: state.projects.length > 0 ? state.projects : mockProjects,
        activeProjectId: state.activeProjectId || mockProjects[0]?.id || 'central-park',
      }));
      return;
    }

    try {
      const { data, error } = await supabase
        .from('projects')
        .select('id, code, name, status')
        .order('name');

      if (error) throw error;

      if (data && data.length > 0) {
        const dbProjects = data.map((project: any, index: number): ProjectSite => {
          const frontendId = getFrontendProjectId(project.id);
          const status = String(project.status || 'active').toLowerCase();
          const progress = Number(project.progress_percentage ?? project.progress ?? 0);
          return {
            id: frontendId,
            name: project.name || project.code || `Project ${index + 1}`,
            clientName: project.client_name || 'Pramukh Group',
            location: project.location || 'Location not set',
            projectValue: Number(project.project_value || project.budget_amount || 0),
            startDate: project.start_date || '',
            endDate: project.target_end_date || '',
            progress,
            currentPhase: (project.current_phase || 'Execution') as ProjectSite['currentPhase'],
            status: status === 'completed'
              ? 'Completed'
              : status === 'delayed'
                ? 'Delayed'
                : status === 'on_hold'
                  ? 'On Hold'
                  : 'Active',
            budget: Number(project.budget_amount || 0),
            actualSpend: Number(project.actual_spend_amount || 0),
            dailyActivities: [],
            materials: [],
            boqItems: [],
            procurements: [],
            workforceLogs: [],
            equipmentLogs: [],
            safetyIncidents: [],
            tasks: [],
            documents: [],
            chats: [],
            qcItems: [],
            invoices: [],
            teamMembers: [],
            labourRecords: [],
            equipments: [],
            image: '/images/projects/central-park.png',
            galleryImages: [],
            overview: project.description || '',
            reraNo: '',
            projectUrl: '',
            propertyType: 'Construction Project',
          };
        });

        set((state) => ({
          projects: dbProjects,
          activeProjectId: dbProjects[0]?.id ?? state.activeProjectId,
        }));
      } else {
        set((state) => ({
          projects: mockProjects,
          activeProjectId: mockProjects[0]?.id ?? state.activeProjectId,
        }));
      }
    } catch (err) {
      console.warn('Failed to fetch projects from Supabase:', err);
      set((state) => ({
        projects: state.projects.length > 0 ? state.projects : mockProjects,
        activeProjectId: state.activeProjectId || mockProjects[0]?.id || 'central-park',
      }));
    }
  },

  fetchDbMessages: async () => {
    if (!isLiveSupabase()) return;

    try {
      // Fetch messages from the unified messages table
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) {
        console.warn('[store] Supabase messages query skipped:', error.message);
        return;
      }

      const dbUserId = getDbUserId(useAppStore.getState().currentUser.id);
      const messagesByProject: Record<string, ChatMessage[]> = {};

      const addMsg = (projectId: string, chatMsg: ChatMessage) => {
        if (!messagesByProject[projectId]) {
          messagesByProject[projectId] = [];
        }
        messagesByProject[projectId].push(chatMsg);
      };

      if (data) {
        data.forEach((msg: any) => {
          const projectId = getFrontendProjectId(msg.project_id);
          addMsg(projectId, {
            id: msg.id,
            projectId,
            senderName: msg.sender_id === dbUserId ? 'Me' : 'System',
            senderRole: msg.sender_id === dbUserId ? 'UPPER_MANAGEMENT' : 'member',
            message: msg.body || msg.content || '',
            timestamp: msg.created_at,
            attachments: [],
            isOutbound: msg.sender_id === dbUserId
          });
        });
      }

      set((state) => {
        const updatedProjects = state.projects.map((proj) => {
          const dbChats = messagesByProject[proj.id] || [];
          const uniqueDbChats = dbChats.filter(dc => !proj.chats.some(mc => mc.message === dc.message));
          const mergedChats = [...proj.chats, ...uniqueDbChats];
          mergedChats.sort((a, b) => new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime());
          return {
            ...proj,
            chats: mergedChats
          };
        });
        return { projects: updatedProjects };
      });
    } catch (err) {
      console.warn('[store] Failed to fetch DB messages:', err);
    }
  },

  fetchDbTasks: async () => {
    if (!isLiveSupabase()) return;

    try {
      const { data, error } = await supabase.from('tasks').select('*');
      if (error) {
        console.warn('[store] Tasks query skipped:', error.message);
        return;
      }

      set((state) => {
        const updatedProjects = state.projects.map((proj) => {
          const dbTasks = (data ?? [])
            .filter((t: any) => getFrontendProjectId(t.project_id) === proj.id)
            .map((t: any) => ({
              id: t.id,
              projectId: proj.id,
              name: t.title,
              startDate: t.start_date || '',
              endDate: t.due_date || '',
              progress: t.progress,
              dependencies: t.dependencies || null,
              isCriticalPath: t.priority === 'HIGH',
              assigneeId: t.assignee_id || null,
              assigneeName: t.assignee_name || null,
              priority: t.priority,
              status: t.status,
            }));
          return { ...proj, tasks: dbTasks };
        });
        return { projects: updatedProjects };
      });
    } catch (err) {
      console.warn('[store] Failed to fetch tasks from Supabase:', err);
    }
  },

  fetchDbTeamMembers: async () => {
    if (!isLiveSupabase()) return;

    try {
      const { data, error } = await supabase
        .from('project_members')
        .select('project_id, user_id, profiles(id, name, email, role)')
        .eq('is_active', true);

      if (error) {
        console.warn('[store] Team members query skipped:', error.message);
        return;
      }

      set((state) => {
        const updatedProjects = state.projects.map((proj) => {
          const dbSiteId = getDbSiteId(proj.id);
          const members = (data ?? [])
            .filter((m: any) => m.project_id === dbSiteId)
            .map((m: any) => ({
              id: m.user_id,
              projectId: proj.id,
              name: 'Team Member',
              role: 'member',
            }));
          return { ...proj, teamMembers: members };
        });
        return { projects: updatedProjects };
      });
    } catch (err) {
      console.warn('[store] Failed to fetch team members from Supabase:', err);
    }
  },

  fetchDbMaterials: async () => {
    if (!isLiveSupabase()) return;

    try {
      let { data: dbMaterials, error: matError } = await supabase.from('materials').select('*');
      if (matError) {
        const { data: itemMasterData } = await supabase.from('item_master').select('*');
        if (itemMasterData) dbMaterials = itemMasterData;
      }

      const { data: dbTransactions } = await supabase.from('material_transactions').select('*');

      set((state) => {
        const updatedProjects = state.projects.map((proj) => {
          const projectMaterials = (dbMaterials ?? [])
            .filter((m: any) => getFrontendProjectId(m.project_id) === proj.id)
            .map((m: any) => {
              const materialTx = (dbTransactions ?? [])
                .filter((tx: any) => tx.material_id === m.id)
                .map((tx: any) => ({
                  id: tx.id,
                  materialId: m.id,
                  type: tx.type as 'INWARD' | 'OUTWARD',
                  quantity: Number(tx.quantity),
                  date: tx.date || new Date().toISOString().split('T')[0],
                  cost: Number(tx.cost),
                  referenceNo: tx.reference_no,
                }));

              let itemName = m.item_name;
              let supplierName = m.supplier_name || null;
              try {
                if (m.item_name && m.item_name.startsWith('{')) {
                  const parsed = JSON.parse(m.item_name);
                  if (parsed.materialName) itemName = parsed.materialName;
                  if (parsed.vendor) supplierName = parsed.vendor;
                }
              } catch (e) {}

              return {
                id: m.id,
                projectId: proj.id,
                itemName,
                category: m.category,
                quantity: Number(m.quantity),
                unit: m.unit,
                reorderLevel: Number(m.reorder_level),
                stockValue: Number(m.stock_value),
                supplierName,
                status: m.status,
                transactions: materialTx,
              };
            });

          return {
            ...proj,
            materials: projectMaterials.length > 0 ? projectMaterials : proj.materials
          };
        });
        return { projects: updatedProjects };
      });
    } catch (err) {
      // Graceful fallback for materials fetch
    }
  },

  addDailyActivity: (projectId, activity) => {
    if (!isLiveSupabase()) return;

    void createDailyProgressReport(projectId, activity).then(({ error }) => {
      if (error) console.error('Failed to sync DPR to Supabase:', error);
    });

    set((state) => {
      const newActivity: DailyActivity = {
        ...activity,
        id: `da_${Date.now()}`,
        date: new Date().toISOString().split('T')[0],
      };

      const updatedProjects = state.projects.map((proj) => {
        if (proj.id === projectId) {
          const nextProgress = Math.min(100, parseFloat((proj.progress + activity.progressDelta).toFixed(1)));
          return {
            ...proj,
            progress: nextProgress,
            dailyActivities: [newActivity, ...proj.dailyActivities]
          };
        }
        return proj;
      });

      return { projects: updatedProjects };
    });
  },

  submitDPR: (projectId, dpr) => set((state) => {
    const updatedProjects = state.projects.map((proj) => {
      if (proj.id === projectId) {
        return {
          ...proj,
          dailyActivities: [{ ...dpr, id: `dpr_${Date.now()}` } as DailyActivity, ...proj.dailyActivities]
        };
      }
      return proj;
    });
    return { projects: updatedProjects };
  }),

  updateDPRStatus: (projectId, dprId, status, remarks) => set((state) => {
    const updatedProjects = state.projects.map((proj) => {
      if (proj.id === projectId) {
        return {
          ...proj,
          dailyActivities: proj.dailyActivities.map(dpr => 
            dpr.id === dprId ? { ...dpr, status, reviewRemarks: remarks || dpr.reviewRemarks } : dpr
          )
        };
      }
      return proj;
    });
    return { projects: updatedProjects };
  }),

  reportDelayRecord: (projectId, delay) => set((state) => {
    const updatedProjects = state.projects.map((proj) => {
      if (proj.id === projectId) {
        return {
          ...proj,
          delays: [{ ...delay, id: `delay_${Date.now()}` } as DelayRecord, ...(proj.delays || [])]
        };
      }
      return proj;
    });
    return { projects: updatedProjects };
  }),

  updateDelayRecord: (projectId, delayId, updates) => set((state) => {
    const updatedProjects = state.projects.map((proj) => {
      if (proj.id === projectId) {
        return {
          ...proj,
          delays: (proj.delays || []).map(d => d.id === delayId ? { ...d, ...updates } : d)
        };
      }
      return proj;
    });
    return { projects: updatedProjects };
  }),

  createCorrectiveTask: (projectId, task) => set((state) => {
    const updatedProjects = state.projects.map((proj) => {
      if (proj.id === projectId) {
        return {
          ...proj,
          correctiveTasks: [{ ...task, id: `ctask_${Date.now()}` } as CorrectiveTask, ...(proj.correctiveTasks || [])]
        };
      }
      return proj;
    });
    return { projects: updatedProjects };
  }),

  updateCorrectiveTask: (projectId, taskId, updates) => set((state) => {
    const updatedProjects = state.projects.map((proj) => {
      if (proj.id === projectId) {
        return {
          ...proj,
          correctiveTasks: (proj.correctiveTasks || []).map(t => t.id === taskId ? { ...t, ...updates } : t)
        };
      }
      return proj;
    });
    return { projects: updatedProjects };
  }),

  addMaterialTransaction: (projectId, materialId, type, quantity, cost, referenceNo) => set((state) => {
    if (!isLiveSupabase()) return { projects: state.projects };

    const transactionId = `tx_${Date.now()}`;
    const newTransaction: MaterialTransaction = {
      id: transactionId,
      materialId,
      type,
      quantity,
      date: new Date().toISOString().split('T')[0],
      cost,
      referenceNo
    };

    (async () => {
      try {
        const { data: material } = await supabase.from('materials').select('*').eq('id', materialId).maybeSingle();
        if (material) {
          const newQty = type === 'INWARD' 
            ? Number(material.quantity) + quantity 
            : Math.max(0, Number(material.quantity) - quantity);
          const pricePerUnit = Number(material.quantity) > 0 ? (Number(material.stock_value) / Number(material.quantity)) : (cost / quantity || 420);
          const nextValue = parseFloat((newQty * pricePerUnit).toFixed(2));

          await supabase.from('material_transactions').insert({
            material_id: materialId,
            type,
            quantity,
            cost,
            reference_no: referenceNo,
            date: new Date().toISOString().split('T')[0]
          });

          await supabase.from('materials').update({
            quantity: newQty,
            stock_value: nextValue
          }).eq('id', materialId);

          const normalizedResult = await recordNormalizedMaterialTransaction({
            projectId,
            materialId,
            type,
            quantity,
            cost,
            referenceNo,
          });
          if (normalizedResult.error) {
            console.error('Failed to sync normalized stock ledger:', normalizedResult.error);
          }
        }
      } catch (err) {
        console.error('Failed to sync material transaction to Supabase:', err);
      }
    })();

    const updatedProjects = state.projects.map((proj) => {
      if (proj.id === projectId) {
        const updatedMaterials = proj.materials.map((mat) => {
          if (mat.id === materialId) {
            const newQty = type === 'INWARD' 
              ? mat.quantity + quantity 
              : Math.max(0, mat.quantity - quantity);
            const pricePerUnit = mat.quantity > 0 ? (mat.stockValue / mat.quantity) : (cost / quantity || 420);
            const nextValue = parseFloat((newQty * pricePerUnit).toFixed(2));
            
            if (newQty < mat.reorderLevel) {
              setTimeout(() => {
                set((innerState) => {
                  const exists = innerState.notifications.some(n => n.message.includes(mat.itemName) && !n.read);
                  if (exists) return {};
                  return {
                    notifications: [
                      {
                        id: `n_${Date.now()}`,
                        type: 'material',
                        title: 'Low Stock Alert',
                        message: `Cement stock at ${proj.name} is below safety threshold (${newQty} ${mat.unit} remaining).`,
                        time: 'Just now',
                        read: false
                      },
                      ...innerState.notifications
                    ]
                  };
                });
              }, 500);
            }

            return {
              ...mat,
              quantity: newQty,
              stockValue: nextValue,
              transactions: [newTransaction, ...(mat.transactions || [])]
            };
          }
          return mat;
        });
        return { ...proj, materials: updatedMaterials };
      }
      return proj;
    });

    return { projects: updatedProjects };
  }),

  addChatMessage: (projectId, senderName, senderRole, message, attachments = []) => {
    if (!isLiveSupabase()) return;

    // 1. Local optimistic update for instant feedback
    const newChat: ChatMessage = {
      id: `ch_opt_${Date.now()}`,
      projectId,
      senderName,
      senderRole,
      message,
      timestamp: new Date().toISOString(),
      attachments
    };

    set((state) => {
      const updatedProjects = state.projects.map((proj) => {
        if (proj.id === projectId) {
          return {
            ...proj,
            chats: [...proj.chats, newChat]
          };
        }
        return proj;
      });
      return { projects: updatedProjects };
    });

    // 2. Outbound sync to Supabase in the background
    (async () => {
      try {
        const dbSiteId = getDbSiteId(projectId);
        const dbUserId = getDbUserId(useAppStore.getState().currentUser.id);

        let channelType = 'engineers';
        if (senderRole.includes('(Client Group)')) {
          channelType = 'client';
        } else if (senderRole.includes('(Supply Line)')) {
          channelType = 'vendors';
        }

        let threadId = null;
        let toUserId = null;
        let phoneNum = null;

        // Fetch all message threads for this site
        const { data: threadsData } = await supabase
          .from('message_threads')
          .select('id, user_id, phone_number')
          .eq('site_id', dbSiteId);

        if (threadsData && threadsData.length > 0) {
          // If we have threads, let's fetch the assigned users' roles to match the channel
          const userIds = threadsData.map(t => t.user_id).filter(Boolean);
          const userRoleMapLocal = new Map<string, string>();
          
          if (userIds.length > 0) {
            const { data: usersData } = await supabase
              .from('users')
              .select('id, role')
              .in('id', userIds);
            
            if (usersData) {
              usersData.forEach(u => {
                if (u.role) userRoleMapLocal.set(u.id, u.role.toLowerCase());
              });
            }
          }

          // Find a thread matching the channel type
          const matchedThread = threadsData.find(t => {
            if (!t.user_id) return false;
            const role = userRoleMapLocal.get(t.user_id) || '';
            if (channelType === 'client') {
              return role === 'client' || role === 'md';
            } else if (channelType === 'vendors') {
              return role === 'vendor' || role === 'purchase';
            } else {
              return role === 'site_engineer';
            }
          });

          if (matchedThread) {
            threadId = matchedThread.id;
            toUserId = matchedThread.user_id;
            phoneNum = matchedThread.phone_number;
          } else {
            // Fallback to the first thread's details
            threadId = threadsData[0].id;
            toUserId = threadsData[0].user_id;
            phoneNum = threadsData[0].phone_number;
          }
        }

        // If not resolved from threads, look for assigned users for this site
        if (!phoneNum) {
          const { data: assignedUsers } = await supabase
            .from('user_site_assignments')
            .select('user_id, users:users(id, role, phone)')
            .eq('site_id', dbSiteId);

          if (assignedUsers && assignedUsers.length > 0) {
            const matchedAssignment = assignedUsers.find((a: unknown) => {
              const typedA = a as Record<string, unknown>;
              if (!typedA.users) return false;
              const userObj = Array.isArray(typedA.users) ? typedA.users[0] : typedA.users;
              if (!userObj) return false;
              const role = ((userObj as Record<string, unknown>).role as string || '').toLowerCase();
              if (channelType === 'client') {
                return role === 'client' || role === 'md';
              } else if (channelType === 'vendors') {
                return role === 'vendor' || role === 'purchase';
              } else {
                return role === 'site_engineer';
              }
            });

            if (matchedAssignment && (matchedAssignment as Record<string, unknown>).users) {
              const usersObj = (matchedAssignment as Record<string, unknown>).users;
              const userObj = Array.isArray(usersObj)
                ? usersObj[0] as Record<string, unknown>
                : usersObj as Record<string, unknown>;
              if (userObj) {
                toUserId = userObj.id as string;
                phoneNum = userObj.phone as string;
              }
            }
          }
        }

        // If still no phone number, try first available in whatsapp_numbers
        if (!phoneNum) {
          const { data: fallbackPhoneData } = await supabase
            .from('whatsapp_numbers')
            .select('phone_number, user_id')
            .limit(1);
          
          if (fallbackPhoneData && fallbackPhoneData.length > 0) {
            phoneNum = fallbackPhoneData[0].phone_number;
            toUserId = fallbackPhoneData[0].user_id;
          }
        }

        // Absolute hardcoded fallbacks
        if (!phoneNum) {
          if (channelType === 'client') {
            phoneNum = '+919900000003';
          } else if (channelType === 'vendors') {
            phoneNum = '+919900000004';
          } else {
            phoneNum = '+919900000002';
          }
        }

        // Send payload to WF5 webhook via local API proxy to avoid browser CORS issues
        const hasWebhook = typeof window !== 'undefined' && (process.env.NEXT_PUBLIC_WF5_WEBHOOK_URL || process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL);
        if (hasWebhook) {
          try {
            const response = await fetch('/api/send-message', {
              method: 'POST',
              headers: await getSupabaseJsonHeaders(),
              body: JSON.stringify({
                to: phoneNum.startsWith('+') ? phoneNum.substring(1) : phoneNum,
                text: message,
                status: 'queued',
                source: 'dashboard',
                timestamp: new Date().toISOString(),
                sent_by: dbUserId,
                site_id: dbSiteId,
                thread_id: threadId,
                to_user_id: toUserId
              })
            });
            if (!response.ok) {
              const errorData = await response.json().catch(() => ({}));
              alert(`Failed to send message: ${errorData.error || response.statusText}`);
            }
            } catch (webhookErr: unknown) {
              const err = webhookErr as Error;
              console.error('Failed to call WF5 webhook proxy:', err);
              alert(`Failed to send message: ${err.message || err}`);
            }
        }
      } catch (err) {
        console.error('Failed to send outbound message:', err);
      }
    })();
  },

  addProcurementReq: (projectId, req) => {
    if (isLiveSupabase()) {
      void createProcurementWorkflowRequest(projectId, req).then(({ error }) => {
        if (error) console.error('Failed to sync procurement workflow to Supabase:', error);
      });
    }

    set((state) => {
      const id = `proc_${Date.now()}`;
      const reqNo = `REQ-2026-${Math.floor(100 + Math.random() * 900)}`;
      const newProc: ProcurementReq = {
        ...req,
        id,
        requisitionNo: reqNo,
        requestedDate: new Date().toISOString().split('T')[0],
        deliveryDate: null
      };

      const updatedProjects = state.projects.map((proj) => {
        if (proj.id === projectId) {
          return {
            ...proj,
            procurements: [newProc, ...proj.procurements]
          };
        }
        return proj;
      });

      return { projects: updatedProjects };
    });
  },

  addBOQItem: (projectId, item) => {
    if (isLiveSupabase()) {
      void createBoqRecord(projectId, item).then(({ error }) => {
        if (error) console.error('Failed to sync BOQ item to Supabase:', error);
      });
    }

    set((state) => {
      const newBOQ: BOQItem = {
        ...item,
        id: `boq_${Date.now()}`,
        consumedQty: 0,
        approved: false
      };

      const updatedProjects = state.projects.map((proj) => {
        if (proj.id === projectId) {
          return {
            ...proj,
            boqItems: [newBOQ, ...proj.boqItems]
          };
        }
        return proj;
      });

      return { projects: updatedProjects };
    });
  },

  createAIConversation: (id, title) => set((state) => ({
    aiConversations: [
      { id, title, time: 'Now', messages: [] },
      ...state.aiConversations
    ]
  })),

  sendAIAssistantMessage: (conversationId, userText) => set((state) => {
    const userMessage: AIMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: userText
    };

    const sortedProjects = [...state.projects].sort((a, b) => b.progress - a.progress);
    const leadingProject = sortedProjects[0];
    const trailingProject = sortedProjects[sortedProjects.length - 1];
    
    // Sort projects by total actual spend vs budget
    const projectBudgets = state.projects.map(p => {
      const budget = p.boqItems.reduce((acc, item) => acc + (item.rate * item.estimatedQty), 0);
      const actualSpend = p.materials.reduce((acc, m) => acc + m.stockValue, 0); 
      return { p, budget, actualSpend, overrun: actualSpend - budget };
    }).sort((a, b) => b.overrun - a.overrun);

    const highestOverrun = projectBudgets[0];

    // Find a material risk
    let materialRiskMsg = '';
    for (const proj of state.projects) {
      const lowMaterial = proj.materials.find(m => m.quantity <= m.reorderLevel);
      if (lowMaterial) {
        materialRiskMsg = `${lowMaterial.itemName} stock at ${proj.name} is critically low at ${lowMaterial.quantity} ${lowMaterial.unit}. `;
        break;
      }
    }

    const lowerText = userText.toLowerCase();
    let aiResponseText = '';

    if (lowerText.includes('orbit 4 delayed') || (lowerText.includes('orbit 4') && lowerText.includes('delay'))) {
      aiResponseText = `### ⚠️ Delay Analysis: Orbit 4
Orbit 4 is currently experiencing a **14-day delay** in its critical path.

**Key Bottleneck:** 
Concrete supply bottleneck affecting Tower B slab cycle. Narmada ReadyMix Concrete (the supplier) has been placed on probation due to a 79% delivery speed rate.

**Impacted Milestones:**
| Milestone | Scheduled Date | Expected Date | Delay (Days) | Status |
| :--- | :--- | :--- | :--- | :--- |
| Tower B L4 Slab Pour | 2026-06-01 | 2026-06-15 | 14 Days | 🔴 Critical Delay |
| Tower B Brickwork Starter | 2026-06-20 | 2026-07-02 | 12 Days | 🟡 At Risk |
| Block C Plastering | 2026-07-15 | 2026-07-20 | 5 Days | 🟢 On Track |

**Recommendation:** 
Immediately shift concrete procurement to Sanghi Cement Industries (98% delivery speed rating) and log a penalty check against Narmada ReadyMix.`;
    } else if (lowerText.includes('compare budget burn') || lowerText.includes('budget burn')) {
      aiResponseText = `### 📊 Portfolio Budget Burn Comparison
Here is the financial exposure comparison across the active Pramukh Group portfolio:

| Project Site | Total Budget | Actual Spent | Burn Rate | Overrun Risk | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Central Park** | ₹90.00 Cr | ₹24.00 Cr | 26.6% | None | 🟢 Under Budget |
| **Orbit 4** | ₹54.00 Cr | ₹36.50 Cr | 67.5% | ₹2.50 Cr | 🔴 Overrun Exposure |
| **Ganga Enclave** | ₹32.00 Cr | ₹14.20 Cr | 44.3% | None | 🟢 Under Budget |

**Key Insight:** Orbit 4 is burning through its excavation and reinforcement budget 18% faster than physical completion due to steel price fluctuations and excavation structural corrections.`;
    } else if (lowerText.includes('procurement bottlenecks') || lowerText.includes('procurement bottleneck')) {
      aiResponseText = `### 📦 Procurement Bottlenecks & PR Registry
Active inventory and vendor supply-chain bottlenecks detected:

1. **Narmada ReadyMix Concrete (Concrete Supplier):**
   - **Performance:** 72/100 score, 79% delivery speed rating.
   - **Impact:** Delaying Tower B slab work at Orbit 4.
2. **Raj Steel Corporation (Steel Supplier):**
   - **Status:** Held payment of ₹32.00 L pending QC rebar diameter verification at Central Park.
3. **Pending Purchase Requests (PRs):**
   - **PR-803:** 500 bags of Portland Cement for Central Park (Pending Super-Admin approval).
   - **PR-812:** 15 MT Structural Rebar for Orbit 4 (Draft PO state).`;
    } else if (lowerText.includes('predict project completion') || (lowerText.includes('predict') && lowerText.includes('completion'))) {
      aiResponseText = `### 🔮 Predictive Completion Forecast (AI Engine)
Based on current labour productivity, material availability, and schedule trends:

1. **Central Park:**
   - **Contract Date:** 2026-11-15
   - **AI Predicted Date:** **2026-11-03 (12 days ahead of schedule)**
   - **Confidence:** 94% (Supported by 98% PPE compliance and premium vendor ratings).
2. **Orbit 4:**
   - **Contract Date:** 2027-01-30
   - **AI Predicted Date:** **2027-02-23 (24 days delayed)**
   - **Confidence:** 87% (Concrete bottlenecks and excavation rework are causing lagging cycle times).`;
    } else if (lowerText.includes('client progress report') || lowerText.includes('client report')) {
      aiResponseText = `### 📋 Client Progress Executive Report (Pramukh Group)
**Project Name:** Central Park Phase 1
**Date Range:** May 1, 2026 - June 10, 2026

**1. Physical Progress Summary:**
- Overall Physical Progress: **82%**
- Current Phase: **Execution** (Tower A structure completed, Tower B slab pouring in progress).

**2. Key Milestones Achieved:**
- ✔ Substructure waterproofing checked and certified.
- ✔ Tower A brickwork completed up to Level 12.
- ✔ Main electrical substation cabling laid.

**3. Material & Inventory Health:**
- Cement & Aggregate levels: **Sufficient (7-day buffer)**
- Rebar compliance rating: **98.2% passed QA/QC.**

**4. Safety & Audits:**
- Site Audit Compliance: **100% PPE compliant.** zero accidents logged.`;
    } else if (lowerText.includes('material shortages') || lowerText.includes('material shortage')) {
      aiResponseText = `### 🚨 Inventory Alert: Material Shortage Log
The AI engine has flagged the following materials at risk of depleting below reorder thresholds:

* **Central Park:**
  - **Portland Cement:** Current: 150 bags | Reorder Level: 300 bags | Status: 🔴 Depleted (Pending PR-803 approval).
  - **Fine Aggregate:** Current: 40 Ton | Reorder Level: 50 Ton | Status: 🟡 Warning.
* **Orbit 4:**
  - **TMT Rebar 16mm:** Current: 1.2 Tons | Reorder Level: 3.0 Tons | Status: 🔴 Depleted (Draft PO pending vendor dispatch).`;
    } else if (lowerText.includes('generate mom') || lowerText.includes('minutes of meeting')) {
      aiResponseText = `### 📝 Minutes of Meeting (MOM) - Site Inspection Audit
**Location:** Central Park Project Site (Surat)  
**Date:** June 9, 2026  
**Attendees:** Vikram Patel (Super Admin), Rohan Mehta (PM), Priya Nair (Site Engineer)

---

#### 1. Discussion Points & Observations:
* **Tower A Finishes:** Plastering finish verified. AI detected micro-cracks on Block C stair walls.
* **Safety & PPE:** Site compliance was outstanding. 100% helmet and harness usage.
* **Material Logs:** Concrete core temp sensor dev resolved. Curing schedule normalized.

#### 2. Action Items & Ownership:
| Task / Action Item | Owner | Target Date | Priority | Status |
| :--- | :--- | :--- | :--- | :--- |
| Repair Block C stair plastering cracks | Priya Nair | 2026-06-12 | MEDIUM | ⏳ Assigned |
| Approve PR-803 for Portland Cement | Vikram Patel | 2026-06-11 | HIGH | 🔴 Pending |
| Dispatch rebar sample to testing lab | Rohan Mehta | 2026-06-14 | HIGH | ⏳ Assigned |`;
    } else if (lowerText.includes('generate dpr') || lowerText.includes('daily progress report')) {
      aiResponseText = `### 📋 Daily Progress Report (DPR) - Consolidated Site Feed
**Date:** June 10, 2026  
**Report Generated By:** Pramukh Project Intelligence Engine

---

#### 1. Workforce Attendance Log:
* **Central Park:** 186 Personnel On-Site (170 Present, 16 Absent, 22 Overtime Hours).
* **Orbit 4:** 230 Personnel On-Site (215 Present, 15 Absent, 35 Overtime Hours).

#### 2. Physical Work Completed Today:
* **Central Park Tower A:** Brickwork layer 5 completed. Plastering of Block A bathrooms in progress.
* **Orbit 4 Tower B:** Level 4 slab reinforcement bars tied (Ready for inspection slump test).

#### 3. Material Transactions logged:
* Received **15 Tons of Aggregate** at Central Park (Inward Log - TXN-90281).
* Dispatched **20 Bags of Cement** for blockwork mortar (Outward Log - Site Store).

#### 4. Delay & Risks Checklist:
* ⚠️ Concrete supplier bottleneck at Orbit 4 could delay Level 4 pour by 48 hours if not resolved by tomorrow morning.`;
    } else if (lowerText.includes('create purchase request') || lowerText.includes('draft purchase request')) {
      aiResponseText = `### 📦 AI-Drafted Purchase Request (PR-824)
A draft purchase request has been prepared in the Procurement Module.

**PR Details:**
* **Requested For:** Central Park Project Site
* **Department:** Civil & Structural execution
* **Estimated Cost:** ₹1,80,000 (INR 1.8 Lakhs)

**Material Line Items:**
| Material Item | Quantity | Unit | Estimated Rate | Subtotal |
| :--- | :--- | :--- | :--- | :--- |
| **Portland Cement (Grade 53)** | 500 | Bags | ₹360 / Bag | ₹1,80,000 |

**Recommended Vendor:** Sanghi Cement Industries (94/100 performance score, premium approved pricing contract).  
**Target Delivery:** 2026-06-16

*Click "Approve Purchase Request" in the Procurement console to dispatch RFQ.*`;
    } else if (lowerText.includes('create site visit report') || lowerText.includes('site visit report')) {
      aiResponseText = `### 🩺 Site Visit Report - Executive Tour Summary
**Visitor:** Vikram Patel (Super Admin / Director)  
**Site:** Orbit 4 Construction Site (Ahmedabad)  
**Date of Tour:** June 9, 2026

---

#### 1. Visual Structural Checks:
* **Excavation Pit:** Shoring and strutting installation checks passed. Moisture levels stable.
* **Slab Reinforcement:** Tower B Level 4 rebar alignment found with minor deviations in spacing. PM instructed to correct spacing before concrete pour.

#### 2. Safety & Housekeeping Observations:
* ⚠️ **Hazard:** Scaffold boards at Tower B northwest corner were unsecured. Site safety steward was instructed to secure them immediately.
* **Housekeeping:** Debris accumulation in Block A basement requires clearing.

#### 3. Key Directives Issued:
* Shift concrete supplier from Narmada ReadyMix if delivery is not received by tomorrow noon.
* Rectify rebar spacing deviations within 24 hours.`;
    } else if (lowerText.includes('whatsapp updates') || lowerText.includes('whatsapp site group') || lowerText.includes('whatsapp update') || lowerText.includes('summarize whatsapp')) {
      aiResponseText = `### 💬 AI WhatsApp Updates Site Group Summary
*Group: "Pramukh Central Park Site Team"*  
*Date Range: Today (June 10, 2026)*

**Key Summarized Updates:**
* **[09:15 AM - Priya Nair]:** "Ready-mix truck has arrived at gate 2. Starting slump tests now." (Verified: Slump test passed, concrete pour commenced).
* **[11:30 AM - Rohan Mehta]:** "Electrician subcontractor team has completed wiring checks for floor 6."
* **[02:45 PM - Priya Nair]:** "Curing team reports temp sensor anomaly on Tower A Level 4 slab. We are spraying additional water." (Update: Sensors show temp stabilized at 04:30 PM).
* **[05:15 PM - Kunal Sen]:** "Cement stock is down to 150 bags. Super Admin approval required for PR-803."

**Action Requested:** Approval of PR-803 for Portland Cement.`;
    } else if (lowerText.includes('schedule') || lowerText.includes('delay')) {
      aiResponseText = `${trailingProject.name} requires the closest schedule attention, currently at ${trailingProject.progress}%. In contrast, ${leadingProject.name} is leading at ${leadingProject.progress}%.`;
    } else if (lowerText.includes('material') || lowerText.includes('inventory')) {
      aiResponseText = materialRiskMsg ? `Material Alert: ${materialRiskMsg}` : 'All projects currently have sufficient material stock above reorder thresholds.';
    } else if (lowerText.includes('budget') || lowerText.includes('spend')) {
      if (highestOverrun.overrun > 0) {
        aiResponseText = `${highestOverrun.p.name} is currently showing the highest budget overrun exposure of ₹${highestOverrun.overrun.toLocaleString()}.`;
      } else {
        aiResponseText = `All projects are currently operating within their allocated BOQ budgets.`;
      }
    } else if (lowerText.includes('update') || lowerText.includes('summary') || lowerText.includes('portfolio')) {
      aiResponseText = `The active portfolio consists of ${state.projects.length} projects. ${leadingProject.name} is leading execution at ${leadingProject.progress}%, while ${trailingProject.name} is at ${trailingProject.progress}%. ${materialRiskMsg}`;
    } else {
      aiResponseText = `Based on current portfolio data (${state.projects.length} active projects), ${leadingProject.name} is leading execution. Could you specify if you need a review of schedule, budget, materials, or workforce?`;
    }

    const aiMessage: AIMessage = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: aiResponseText
    };

    return {
      aiConversations: state.aiConversations.map(conv => {
        if (conv.id === conversationId) {
          const isFirstMessage = conv.messages.length === 0;
          return {
            ...conv,
            title: isFirstMessage ? userText.slice(0, 38) : conv.title,
            messages: [...conv.messages, userMessage, aiMessage]
          };
        }
        return conv;
      })
    };
  }),

  markNotificationRead: (id) => set((state) => ({
    notifications: state.notifications.map(n => n.id === id ? { ...n, read: true } : n)
  })),

  clearNotifications: () => set({ notifications: [] }),

  addQCItem: (projectId, title) => {
    if (isLiveSupabase()) {
      void createQcInspection(projectId, title).then(({ error }) => {
        if (error) console.error('Failed to sync QC inspection to Supabase:', error);
      });
    }

    set((state) => {
      const updatedProjects = state.projects.map(proj => {
        if (proj.id === projectId) {
          return {
            ...proj,
            qcItems: [...proj.qcItems, { id: `qc_${Date.now()}`, projectId, title, status: 'PENDING' }]
          };
        }
        return proj;
      });
      return { projects: updatedProjects };
    });
  },

  addInvoice: (projectId, amount, desc) => {
    if (isLiveSupabase()) {
      console.warn('[Finance] Manual invoice log is marked local-only because of missing PO/GRN/work-order reference.');
    }

    set((state) => {
      const updatedProjects = state.projects.map(proj => {
        if (proj.id === projectId) {
          return {
            ...proj,
            invoices: [...proj.invoices, { id: `inv_${Date.now()}`, projectId, amount, desc, localOnly: true }]
          };
        }
        return proj;
      });
      return { projects: updatedProjects };
    });
  },

  addTeamMember: (projectId, name, role) => {
    if (isLiveSupabase()) {
      void addProjectMemberByName(projectId, name, role).then(({ error }) => {
        if (error) console.error('Failed to sync project member to Supabase:', error);
      });
    }

    set((state) => {
      const updatedProjects = state.projects.map(proj => {
        if (proj.id === projectId) {
          return {
            ...proj,
            teamMembers: [...proj.teamMembers, { id: `tm_${Date.now()}`, projectId, name, role }]
          };
        }
        return proj;
      });
      return { projects: updatedProjects };
    });
  },

  addTask: (projectId, task) => {
    if (!isLiveSupabase()) return;

    (async () => {
      try {
        const dbSiteId = getDbSiteId(projectId);
        
        let assigneeId = task.assigneeId || null;
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (assigneeId && !uuidRegex.test(assigneeId)) {
          const { data: profileData } = await supabase
            .from('profiles')
            .select('id')
            .eq('name', task.assigneeName)
            .limit(1)
            .maybeSingle();
          assigneeId = profileData?.id || null;
        }

        const { error } = await supabase.from('tasks').insert({
          project_id: dbSiteId,
          title: task.name,
          start_date: task.startDate || null,
          due_date: task.endDate || null,
          assignee_id: assigneeId,
          assignee_name: task.assigneeName || null,
          priority: task.priority,
          status: task.status,
          done: task.status === 'COMPLETED',
          progress: task.status === 'COMPLETED' ? 100 : 0,
        });
        if (error) throw error;
      } catch (err) {
        console.error('Failed to add task to Supabase:', err);
      }
    })();
  },

  updateTask: (projectId, taskId, updates) => {
    if (!isLiveSupabase()) return;

    (async () => {
      try {
        let assigneeId = updates.assigneeId;
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (assigneeId && !uuidRegex.test(assigneeId)) {
          const { data: profileData } = await supabase
            .from('profiles')
            .select('id')
            .eq('name', updates.assigneeName)
            .limit(1)
            .maybeSingle();
          assigneeId = profileData?.id || undefined;
        }

        let progress = updates.progress;
        if (progress === undefined && updates.status !== undefined) {
          progress = updates.status === 'COMPLETED' ? 100 : updates.status === 'TODO' ? 0 : 50;
        }

        const payload: any = {};
        if (updates.status !== undefined) {
          payload.status = updates.status;
          payload.done = updates.status === 'COMPLETED';
        }
        if (progress !== undefined) payload.progress = progress;
        if (updates.priority !== undefined) payload.priority = updates.priority;
        if (assigneeId !== undefined) payload.assignee_id = assigneeId;
        if (updates.assigneeName !== undefined) payload.assignee_name = updates.assigneeName;

        const { error } = await supabase
          .from('tasks')
          .update(payload)
          .eq('id', taskId);
        if (error) throw error;
      } catch (err) {
        console.error('Failed to update task in Supabase:', err);
      }
    })();
  },

  addVendor: (vendor) => {
    let result = { success: true, error: undefined as string | undefined };
    set((state) => {
      const nameExists = state.vendors.some(
        (v) => v.name.toLowerCase() === vendor.name.trim().toLowerCase()
      );
      const checkGst = vendor.gstNumber ? vendor.gstNumber.trim().toLowerCase() : '';
      const gstExists = checkGst !== '' && state.vendors.some(
        (v) => v.gstNumber && v.gstNumber.trim().toLowerCase() === checkGst
      );
      
      if (nameExists) {
        result = { success: false, error: 'A vendor with this name already exists.' };
        return {};
      }
      if (gstExists) {
        result = { success: false, error: 'A vendor with this GST Number already exists.' };
        return {};
      }

      const newVendor: Vendor = {
        ...vendor,
        id: `v_${Date.now()}`,
        name: vendor.name.trim(),
        gstNumber: vendor.gstNumber ? vendor.gstNumber.trim().toUpperCase() : null,
        rating: 0,
      };

      return {
        vendors: [newVendor, ...state.vendors],
      };
    });
    
    const isSimulation = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project');
    if (!isSimulation && result.success) {
      (async () => {
        try {
          const { error } = await supabase.from('vendors').insert({
            name: vendor.name.trim(),
            gst_number: vendor.gstNumber ? vendor.gstNumber.trim().toUpperCase() : null,
            email: vendor.email,
            phone: vendor.phone,
            address: vendor.address,
            category: vendor.category,
            rating: 0,
          });
          if (error) console.error('Failed to sync vendor to Supabase:', error);
        } catch (err) {
          console.error('Supabase vendor sync error:', err);
        }
      })();
    }

    return result;
  },

  addQuotation: (quote) => {
    const newQuote: VendorQuotation = {
      ...quote,
      id: `q_${Date.now()}`,
      submittedAt: new Date().toISOString(),
    };

    set((state) => ({
      vendorQuotations: [newQuote, ...state.vendorQuotations],
    }));

    const isSimulation = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project');
    if (!isSimulation) {
      (async () => {
        try {
          const siteId = await getDbSiteId(quote.projectId);
          const { error } = await supabase.from('vendor_quotations').insert({
            vendor_id: quote.vendorId,
            project_id: siteId,
            material_category: quote.materialCategory,
            unit_rate: quote.unitRate,
            lead_time_days: quote.leadTimeDays,
            gst_details: quote.gstDetails,
            payment_terms: quote.paymentTerms,
            status: quote.status,
          });
          if (error) console.error('Failed to sync quote to Supabase:', error);
        } catch (err) {
          console.error('Supabase quote sync error:', err);
        }
      })();
    }
  },

  addVendorBill: (bill) => {
    let result = { success: true, error: undefined as string | undefined };
    set((state) => {
      const invoiceExists = state.vendorBills.some(
        (b) => b.vendorId === bill.vendorId && b.invoiceNumber.trim().toLowerCase() === bill.invoiceNumber.trim().toLowerCase()
      );

      if (invoiceExists) {
        result = { success: false, error: 'An invoice with this number has already been registered for this vendor.' };
        return {};
      }

      const newBill: VendorBill = {
        ...bill,
        id: `b_${Date.now()}`,
        invoiceNumber: bill.invoiceNumber.trim(),
      };

      return {
        vendorBills: [newBill, ...state.vendorBills],
      };
    });

    const isSimulation = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project');
    if (!isSimulation && result.success) {
      (async () => {
        try {
          const siteId = await getDbSiteId(bill.projectId);
          const { error } = await supabase.from('vendor_bills').insert({
            vendor_id: bill.vendorId,
            project_id: siteId,
            bill_number: bill.invoiceNumber.trim(),
            subtotal_amount: bill.amount,
            total_amount: bill.amount,
            bill_date: bill.date,
            status: 'draft',
            payment_status: 'pending',
          });
          if (error) console.error('Failed to sync bill to Supabase:', error);
        } catch (err) {
          console.error('Supabase bill sync error:', err);
        }
      })();
    }

    return result;
  },

  addVendorPayment: (payment) => {
    const newPayment: VendorPayment = {
      ...payment,
      id: `pay_${Date.now()}`,
    };

    set((state) => {
      const updatedBills = state.vendorBills.map((bill) => {
        if (bill.id === payment.billId) {
          return { ...bill, status: 'PAID' as const, ref: payment.paymentRef };
        }
        return bill;
      });

      return {
        vendorPayments: [newPayment, ...state.vendorPayments],
        vendorBills: updatedBills,
      };
    });

    const isSimulation = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project');
    if (!isSimulation) {
      (async () => {
        try {
          const siteId = await getDbSiteId('one-tapi');
          const { data: billData } = await supabase
            .from('vendor_bills')
            .select('project_id')
            .eq('id', payment.billId)
            .maybeSingle();

          const projectId = billData?.project_id || siteId;

          const { error } = await supabase.from('payments').insert({
            project_id: projectId,
            vendor_bill_id: payment.billId,
            amount: payment.amount,
            payment_date: payment.date,
            status: 'paid',
            payment_reference: payment.paymentRef,
            payment_mode: 'Bank Transfer',
          });
          if (error) console.error('Failed to sync payment to Supabase:', error);

          if (payment.billId) {
            const { error: billError } = await supabase
              .from('vendor_bills')
              .update({ status: 'paid', payment_status: 'paid' })
              .eq('id', payment.billId);
            if (billError) console.error('Failed to update bill status in Supabase:', billError);
          }
        } catch (err) {
          console.error('Supabase payment sync error:', err);
        }
      })();
    }
  },

  addPerformanceMetric: (metric) => {
    const newPerf: VendorPerformance = {
      ...metric,
      id: `perf_${Date.now()}`,
      evaluationDate: new Date().toISOString(),
    };

    set((state) => {
      const relatedLogs = [newPerf, ...state.vendorPerformances.filter((p) => p.vendorId === metric.vendorId)];
      const totalScore = relatedLogs.reduce((acc, curr) => {
        const avgScore = (curr.deliveryScore + curr.qualityScore + curr.priceScore + curr.responseScore) / 4;
        return acc + avgScore;
      }, 0);
      const newRating = Math.round(totalScore / relatedLogs.length);

      const updatedVendors = state.vendors.map((v) => {
        if (v.id === metric.vendorId) {
          return { ...v, rating: newRating };
        }
        return v;
      });

      return {
        vendorPerformances: [newPerf, ...state.vendorPerformances],
        vendors: updatedVendors,
      };
    });

    const isSimulation = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project');
    if (!isSimulation) {
      (async () => {
        try {
          const siteId = await getDbSiteId(metric.projectId);
          const { error } = await supabase.from('vendor_performances').insert({
            vendor_id: metric.vendorId,
            project_id: siteId,
            delivery_score: metric.deliveryScore,
            quality_score: metric.qualityScore,
            price_score: metric.priceScore,
            response_score: metric.responseScore,
            feedback: metric.feedback,
          });
          if (error) console.error('Failed to sync performance metric to Supabase:', error);
        } catch (err) {
          console.error('Supabase performance sync error:', err);
        }
      })();
    }
  },

  // QC & Checklists Implementations
  addChecklistTemplate: (projectId, template) => set((state) => ({
    projects: state.projects.map(p => 
      p.id === projectId 
        ? { ...p, checklistTemplates: [...(p.checklistTemplates || []), { ...template, id: `ct_${Date.now()}` }] }
        : p
    )
  })),

  updateChecklistTemplate: (projectId, templateId, updates) => set((state) => ({
    projects: state.projects.map(p => 
      p.id === projectId 
        ? { ...p, checklistTemplates: p.checklistTemplates?.map(t => t.id === templateId ? { ...t, ...updates } : t) }
        : p
    )
  })),

  addSubmittedChecklist: (projectId, checklist) => set((state) => ({
    projects: state.projects.map(p => 
      p.id === projectId 
        ? { ...p, submittedChecklists: [...(p.submittedChecklists || []), { ...checklist, id: `sc_${Date.now()}` }] }
        : p
    )
  })),

  updateSubmittedChecklistStatus: (projectId, checklistId, status) => set((state) => ({
    projects: state.projects.map(p => 
      p.id === projectId 
        ? { ...p, submittedChecklists: p.submittedChecklists?.map(sc => sc.id === checklistId ? { ...sc, status } : sc) }
        : p
    )
  })),

  addQcInspection: (projectId, qc) => set((state) => ({
    projects: state.projects.map(p => 
      p.id === projectId 
        ? { ...p, qcInspections: [...(p.qcInspections || []), { ...qc, id: `qci_${Date.now()}` }] }
        : p
    )
  })),

  updateQcInspectionStatus: (projectId, qcId, status) => set((state) => ({
    projects: state.projects.map(p => 
      p.id === projectId 
        ? { ...p, qcInspections: p.qcInspections?.map(q => q.id === qcId ? { ...q, status } : q) }
        : p
    )
  })),

  addReworkTask: (projectId, rework) => set((state) => ({
    projects: state.projects.map(p => 
      p.id === projectId 
        ? { ...p, reworkTasks: [...(p.reworkTasks || []), { ...rework, id: `rw_${Date.now()}` }] }
        : p
    )
  })),

  updateReworkTaskStatus: (projectId, reworkId, status) => set((state) => ({
    projects: state.projects.map(p => 
      p.id === projectId 
        ? { ...p, reworkTasks: p.reworkTasks?.map(r => r.id === reworkId ? { ...r, status } : r) }
        : p
    )
  })),

  addWorkCompletion: (projectId, workComp) => set((state) => ({
    projects: state.projects.map(p => 
      p.id === projectId 
        ? { ...p, workCompletions: [...(p.workCompletions || []), { ...workComp, id: `wc_${Date.now()}` }] }
        : p
    )
  })),

  updateWorkCompletion: (projectId, workCompId, updates) => set((state) => ({
    projects: state.projects.map(p => 
      p.id === projectId 
        ? { ...p, workCompletions: p.workCompletions?.map(wc => wc.id === workCompId ? { ...wc, ...updates } : wc) }
        : p
    )
  })),
}));

