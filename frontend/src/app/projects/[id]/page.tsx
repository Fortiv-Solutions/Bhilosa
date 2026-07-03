'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAppStore } from '@/store/use-app-store';
import { 
  Building2, 
  MapPin, 
  User, 
  Calendar, 
  Coins, 
  FileSpreadsheet, 
  ClipboardList, 
  PackageOpen,
  MessageSquare, 
  ShieldCheck, 
  FileText, 
  TrendingUp,
  Send,
  Printer,
  Plus,
  Clock,
  UserCheck,
  Paperclip,
  Wrench,
  Users,
  CheckCircle2,
  Trash2,
  ShoppingCart,
  Settings,
  Bell,
  Truck,
  Award,
  BarChart3,
  ListTodo,
  ChevronDown,
  Search,
  ArrowUpRight,
  ArrowLeft,
  CloudSun,
  Gauge,
  Menu,
  X,
  LogOut,
  Image as ImageIcon,
  Play,
  ChevronUp,
  Video,
  Smartphone,
  FolderClosed
} from 'lucide-react';
import { use } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ImageSlider } from '@/components/ui/image-slider';
import { InboxModule } from '@/components/projects/inbox-module';
import { ProjectMembers } from '@/components/projects/project-members';
import { TaskModule } from '@/components/projects/task-module';
import { supabase, getDbSiteId } from '@/utils/supabase-client';
import { attachmentUrl } from '@/lib/inbox';
import { isLiveSupabase } from '@/lib/erp/supabase-modules';
import { getDPRs, approveDPR, rejectDPR } from '@/lib/dpr';
import { isUpperManagement } from '@/lib/rbac';
import { getPendingApprovals } from '@/lib/approvals';
import { getQCInspections, getSafetyIncidents } from '@/lib/safety-qc';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  RadialBarChart,
  RadialBar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';

// Defined tabs
type ProjectTab = 
  | 'dashboard'
  | 'project-management'
  | 'procurement'
  | 'inventory'
  | 'quality-control'
  | 'site-operations'
  | 'budget'
  | 'work-order'
  | 'billing'
  | 'analytics'
  | 'tasks'
  | 'inbox'
  | 'user-management'
  | 'vendor-management'
  | 'document-control'
  | 'equipment-tracking';

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { 
    projects, 
    addDailyActivity, 
    addMaterialTransaction, 
    addChatMessage, 
    addProcurementReq, 
    addBOQItem,
    addQCItem,
    addInvoice,
    addTeamMember,
    addTask,
    updateTask,
    notifications,
    markNotificationRead,
    clearNotifications,
    currentUser,
    initSupabase
  } = useAppStore();

  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ProjectTab>('project-management');
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const notificationMenuRef = useRef<HTMLDivElement>(null);
  
  // v2.0 Upgraded States
  const [ganttZoom, setGanttZoom] = useState<'week' | 'month' | 'quarter'>('month');
  const [ganttShowCritical, setGanttShowCritical] = useState(false);
  const [ganttShowDelayed, setGanttShowDelayed] = useState(false);
  const [ganttShowDependencies, setGanttShowDependencies] = useState(true);
  const [ganttShowResources, setGanttShowResources] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceNotes, setVoiceNotes] = useState<string[]>([]);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Site Media Gallery States
  interface GalleryMediaItem {
    id: string;
    url: string;
    type: 'image' | 'video';
    createdAt: string;
    name: string;
  }
  const [galleryMedia, setGalleryMedia] = useState<GalleryMediaItem[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(true);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [activeLightboxMedia, setActiveLightboxMedia] = useState<GalleryMediaItem | null>(null);

  // Site Checklist States
  interface DbChecklist {
    id: string;
    projectId: string;
    title: string;
    createdAt: string;
  }
  interface DbChecklistItem {
    id: string;
    checklistId: string;
    text: string;
    done: boolean;
    createdAt: string;
  }
  const [dbChecklists, setDbChecklists] = useState<DbChecklist[]>([]);
  const [dbChecklistItems, setDbChecklistItems] = useState<DbChecklistItem[]>([]);
  const [checklistLoading, setChecklistLoading] = useState(true);
  const [expandedChecklistId, setExpandedChecklistId] = useState<string | null>(null);

  // DPR States
  const [dprLogs, setDprLogs] = useState<any[]>([]);
  const [dprLoading, setDprLoading] = useState(true);

  // Workflow Approvals State
  const [pendingWorkflows, setPendingWorkflows] = useState<any[]>([]);
  const [workflowsLoading, setWorkflowsLoading] = useState(true);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [isMobileMenuOpen]);

  // Find project
  const project = projects.find(p => p.id === id);

  // Fetch site media gallery items
  useEffect(() => {
    if (!project) return;
    
    let isMounted = true;
    const dbSiteId = getDbSiteId(project.id);
    let channel: any = null;

    const fetchGalleryMedia = async () => {
      setGalleryLoading(true);
      const isSimulation = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project');
      
      if (isSimulation) {
        setGalleryMedia([
          {
            id: 'm1',
            url: 'https://images.unsplash.com/photo-1541888946425-d81bb19240f5?auto=format&fit=crop&w=800&q=80',
            type: 'image',
            createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
            name: 'Foundation Reinforcement'
          },
          {
            id: 'm2',
            url: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=800&q=80',
            type: 'image',
            createdAt: new Date(Date.now() - 3600000 * 24).toISOString(),
            name: 'Tower A Slab Pour'
          },
          {
            id: 'm3',
            url: 'https://images.unsplash.com/photo-1581094288338-2314dddb7ecc?auto=format&fit=crop&w=800&q=80',
            type: 'image',
            createdAt: new Date(Date.now() - 3600000 * 48).toISOString(),
            name: 'MEP Piping Check-off'
          },
          {
            id: 'm4',
            url: 'https://images.unsplash.com/photo-1590069261209-f8e9b8642343?auto=format&fit=crop&w=800&q=80',
            type: 'image',
            createdAt: new Date(Date.now() - 3600000 * 72).toISOString(),
            name: 'Waterproofing Mockup'
          }
        ]);
        setGalleryLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('message_attachments')
          .select('id, storage_path, mime_type, created_at')
          .eq('project_id', dbSiteId);

        if (error) throw error;

        if (data && isMounted) {
          const resolved = await Promise.all(
            data.map(async (item: any) => {
              if (!item.mime_type.startsWith('image/') && !item.mime_type.startsWith('video/')) {
                return null;
              }
              try {
                const url = await attachmentUrl(item.storage_path);
                return {
                  id: item.id,
                  url,
                  type: item.mime_type.startsWith('video/') ? ('video' as const) : ('image' as const),
                  createdAt: item.created_at,
                  name: item.mime_type.startsWith('video/') ? 'Site Video Log' : 'Site Photo Log'
                };
              } catch (urlErr) {
                console.error('Failed to get signed URL for attachment:', item.storage_path, urlErr);
                return null;
              }
            })
          );
          
          if (isMounted) {
            const filtered = resolved.filter((x): x is GalleryMediaItem => x !== null);
            filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            setGalleryMedia(filtered);
          }
        }
      } catch (err) {
        console.error('Error fetching gallery media:', err);
      } finally {
        if (isMounted) {
          setGalleryLoading(false);
        }
      }
    };

    fetchGalleryMedia();

    // Set up Realtime listener on message_attachments table
    const channelName = `site-media-${dbSiteId}-${Date.now()}`;
    channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'message_attachments',
          filter: `project_id=eq.${dbSiteId}`
        },
        async (payload) => {
          const newItem = payload.new;
          if (newItem && (newItem.mime_type.startsWith('image/') || newItem.mime_type.startsWith('video/'))) {
            try {
              const url = await attachmentUrl(newItem.storage_path);
              const mediaItem: GalleryMediaItem = {
                id: newItem.id,
                url,
                type: newItem.mime_type.startsWith('video/') ? 'video' : 'image',
                createdAt: newItem.created_at,
                name: newItem.mime_type.startsWith('video/') ? 'Site Video Log' : 'Site Photo Log'
              };
              if (isMounted) {
                setGalleryMedia(prev => [mediaItem, ...prev]);
              }
            } catch (err) {
              console.error('Error handling realtime attachment upload:', err);
            }
          }
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [project, id]);

  // Fetch site checklists and items
  useEffect(() => {
    if (!project) return;

    let isMounted = true;
    const dbSiteId = getDbSiteId(project.id);
    let checklistsChannel: any = null;

    const fetchChecklists = async () => {
      setChecklistLoading(true);
      const isSimulation = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project');

      if (isSimulation) {
        // Mock checklists & items
        setDbChecklists([
          { id: 'c1', projectId: project.id, title: 'Material Delivery Inspection', createdAt: new Date(Date.now() - 3600000 * 24).toISOString() },
          { id: 'c2', projectId: project.id, title: 'Daily Safety Compliance Audit', createdAt: new Date(Date.now() - 3600000 * 2).toISOString() }
        ]);
        setDbChecklistItems([
          { id: 'ci1', checklistId: 'c1', text: JSON.stringify({ description: 'Verify Delivery Challan matches physical quantity', status: 'Pass', note: 'All items matching', imageUrl: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=800&q=80' }), done: true, createdAt: new Date().toISOString() },
          { id: 'ci2', checklistId: 'c1', text: JSON.stringify({ description: 'Inspect cement bags for moisture or dampness', status: 'Pass', note: 'Stored in dry warehouse layout', imageUrl: '' }), done: true, createdAt: new Date().toISOString() },
          { id: 'ci3', checklistId: 'c1', text: JSON.stringify({ description: 'Visual inspection of sand for silt content', status: 'Fail', note: 'Silt content above 8%', imageUrl: 'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=800&q=80' }), done: true, createdAt: new Date().toISOString() },
          
          { id: 'ci4', checklistId: 'c2', text: JSON.stringify({ description: 'Ensure all labor wearing helmets, safety jackets, and boots', status: 'Pass', note: '95% compliance rate on site', imageUrl: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=800&q=80' }), done: true, createdAt: new Date().toISOString() },
          { id: 'ci5', checklistId: 'c2', text: JSON.stringify({ description: 'Verify scaffolding is stable and safety nets are installed', status: 'Pending', note: 'Awaiting third-party cert', imageUrl: '' }), done: false, createdAt: new Date().toISOString() }
        ]);
        setChecklistLoading(false);
        return;
      }

      try {
        // 1. Fetch checklists
        const { data: checklistsData, error: checklistsError } = await supabase
          .from('checklists')
          .select('*')
          .eq('project_id', dbSiteId);

        if (checklistsError) throw checklistsError;

        if (checklistsData && isMounted) {
          const checklistIds = checklistsData.map(c => c.id);
          
          setDbChecklists(checklistsData.map(c => ({
            id: c.id,
            projectId: c.project_id,
            title: c.title,
            createdAt: c.created_at
          })));

          if (checklistIds.length > 0 && isMounted) {
            // 2. Fetch checklist items
            const { data: itemsData, error: itemsError } = await supabase
              .from('checklist_items')
              .select('*')
              .in('checklist_id', checklistIds);

            if (itemsError) throw itemsError;

            if (itemsData && isMounted) {
              setDbChecklistItems(itemsData.map(i => ({
                id: i.id,
                checklistId: i.checklist_id,
                text: i.text,
                done: i.done,
                createdAt: i.created_at
              })));
            }
          } else {
            setDbChecklistItems([]);
          }
        }
      } catch (err) {
        console.error('Error loading checklists:', err);
      } finally {
        if (isMounted) {
          setChecklistLoading(false);
        }
      }
    };

    fetchChecklists();

    // Set up Realtime listener on checklists and checklist_items tables
    const isSimulation = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project');
    if (!isSimulation) {
      const channelName = `site-checklists-${dbSiteId}-${Date.now()}`;
      checklistsChannel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'checklists', filter: `project_id=eq.${dbSiteId}` },
          async (payload) => {
            const { eventType, new: newRow, old: oldRow } = payload;
            if (eventType === 'INSERT' && isMounted) {
              setDbChecklists(prev => [
                { id: newRow.id, projectId: newRow.project_id, title: newRow.title, createdAt: newRow.created_at },
                ...prev
              ]);
            } else if (eventType === 'UPDATE' && isMounted) {
              setDbChecklists(prev => prev.map(c => c.id === newRow.id ? { ...c, title: newRow.title } : c));
            } else if (eventType === 'DELETE' && isMounted) {
              setDbChecklists(prev => prev.filter(c => c.id !== oldRow.id));
              setDbChecklistItems(prev => prev.filter(i => i.checklistId !== oldRow.id));
            }
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'checklist_items' },
          async (payload) => {
            const { eventType, new: newRow, old: oldRow } = payload;
            
            if (eventType === 'INSERT' && isMounted) {
              setDbChecklistItems(prev => {
                if (prev.some(i => i.id === newRow.id)) return prev;
                return [
                  ...prev,
                  { id: newRow.id, checklistId: newRow.checklist_id, text: newRow.text, done: newRow.done, createdAt: newRow.created_at }
                ];
              });
            } else if (eventType === 'UPDATE' && isMounted) {
              setDbChecklistItems(prev => prev.map(i => i.id === newRow.id ? {
                ...i,
                text: newRow.text,
                done: newRow.done
              } : i));
            } else if (eventType === 'DELETE' && isMounted) {
              setDbChecklistItems(prev => prev.filter(i => i.id !== oldRow.id));
            }
          }
        )
        .subscribe();
    }

    return () => {
      isMounted = false;
      if (checklistsChannel) {
        supabase.removeChannel(checklistsChannel);
      }
    };
  }, [project, id]);

  // Fetch DPRs
  useEffect(() => {
    if (!project) return;
    let isMounted = true;
    const dbSiteId = getDbSiteId(project.id);
    const fetchDPRs = async () => {
      setDprLoading(true);
      try {
        const dprs = await getDPRs(dbSiteId);
        if (isMounted) setDprLogs(dprs);
      } catch (err) {
        console.error('Error fetching DPRs:', err);
      } finally {
        if (isMounted) setDprLoading(false);
      }
    };
    
    const fetchWorkflows = async () => {
      setWorkflowsLoading(true);
      try {
        const approvals = await getPendingApprovals(dbSiteId);
        if (isMounted) setPendingWorkflows(approvals);
      } catch (err) {
        console.error('Error fetching approvals:', err);
      } finally {
        if (isMounted) setWorkflowsLoading(false);
      }
    };

    fetchDPRs();
    fetchWorkflows();

    return () => {
      isMounted = false;
    };
  }, [project, id]);

  const handleApproveWorkflow = async (id: string, type: string) => {
    try {
      if (type === 'Daily Progress Report') {
        await approveDPR(id, currentUser.name);
        setDprLogs(prev => prev.map(dpr => dpr.id === id ? { ...dpr, status: 'approved' } : dpr));
      }
      // For PRs/MRs, this would hook into procurement.ts in a fully built system
      setPendingWorkflows(prev => prev.filter(w => w.id !== id));
    } catch (err) {
      console.error('Failed to approve:', err);
    }
  };

  const handleRejectWorkflow = async (id: string, type: string) => {
    try {
      if (type === 'Daily Progress Report') {
        await rejectDPR(id, currentUser.name, 'Rejected by upper management');
        setDprLogs(prev => prev.map(dpr => dpr.id === id ? { ...dpr, status: 'rejected' } : dpr));
      }
      setPendingWorkflows(prev => prev.filter(w => w.id !== id));
    } catch (err) {
      console.error('Failed to reject:', err);
    }
  };

  // Supabase sync helpers for Quality Control module
  const syncQcRequestToSupabase = async (req: any) => {
    const isSimulation = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project');
    if (isSimulation) return;

    try {
      const remarksJson = JSON.stringify({
        contractorName: req.contractorName,
        priority: req.priority,
        location: req.location,
        remarksText: req.remarks || '',
        assignedEngineer: req.assignedEngineer,
        submittedDate: req.submittedDate,
        scheduledDate: req.scheduledDate,
        requestedBy: req.requestedBy,
        activityName: req.activityName,
        completionId: req.completionId,
        category: req.category || 'General',
        photos: req.photos || []
      });

      const { error } = await supabase
        .from('qc_inspections')
        .update({
          status: req.status,
          remarks: remarksJson
        })
        .eq('id', req.id);

      if (error) throw error;
    } catch (err) {
      console.error(`Failed to sync QC request ${req.id} to Supabase:`, err);
    }
  };

  const syncCheckpointsToSupabase = async (reqId: string, checkpoints: any[]) => {
    const isSimulation = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project');
    if (isSimulation) return;

    try {
      for (const cp of checkpoints) {
        if (cp.id && typeof cp.id === 'string' && !cp.id.startsWith('temp_')) {
          const { error } = await supabase
            .from('qc_inspection_items')
            .update({
              result: cp.result,
              remarks: cp.observation,
              description: cp.checkpoint
            })
            .eq('id', cp.id);
          if (error) throw error;
        } else {
          const newId = `qci_${Date.now()}_${Math.random().toString().slice(2, 6)}`;
          const { error } = await supabase
            .from('qc_inspection_items')
            .insert({
              id: newId,
              qc_inspection_id: reqId,
              description: cp.checkpoint,
              result: cp.result || 'Pending',
              remarks: cp.observation || ''
            });
          if (error) throw error;
          cp.id = newId;
        }
      }
    } catch (err) {
      console.error(`Failed to sync checkpoints for QC request ${reqId} to Supabase:`, err);
    }
  };

  const createReworkTaskInSupabase = async (rw: any) => {
    const isSimulation = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project');
    if (isSimulation) return;

    try {
      const dbSiteId = getDbSiteId(project!.id);
      const { error } = await supabase
        .from('tasks')
        .insert({
          id: rw.id,
          project_id: dbSiteId,
          title: `[REWORK] ${rw.activityName}`,
          dependencies: rw.qcRef,
          description: JSON.stringify({
            issueDescription: rw.issueDescription,
            location: rw.location,
            responsiblePerson: rw.responsiblePerson,
            targetDate: rw.targetDate,
            status: rw.status,
            remarks: rw.remarks,
            correctionPhotos: rw.correctionPhotos || []
          }),
          priority: 'MEDIUM',
          status: 'TODO'
        });
      if (error) throw error;
    } catch (err) {
      console.error(`Failed to create rework task ${rw.id} in Supabase:`, err);
    }
  };

  const updateReworkTaskInSupabase = async (rw: any) => {
    const isSimulation = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project');
    if (isSimulation) return;

    try {
      const { error } = await supabase
        .from('tasks')
        .update({
          description: JSON.stringify({
            issueDescription: rw.issueDescription,
            location: rw.location,
            responsiblePerson: rw.responsiblePerson,
            targetDate: rw.targetDate,
            status: rw.status,
            remarks: rw.remarks,
            correctionPhotos: rw.correctionPhotos || []
          })
        })
        .eq('id', rw.id);
      if (error) throw error;
    } catch (err) {
      console.error(`Failed to update rework task ${rw.id} in Supabase:`, err);
    }
  };

  const syncWorkCompletionStatus = async (wcId: string, status: string) => {
    const isSimulation = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project');
    if (isSimulation) return;

    try {
      const { error } = await supabase
        .from('daily_logs')
        .update({ status })
        .eq('id', wcId);
      if (error) throw error;
    } catch (err) {
      console.error(`Failed to update daily_logs status for ${wcId}:`, err);
    }
  };

  const parseChecklistItemText = (text: string) => {
    try {
      if (text.trim().startsWith('{')) {
        return JSON.parse(text);
      }
    } catch (e) {}
    return { description: text, status: 'Pending', note: '', imageUrl: '' };
  };

  const handleApproveSiteChecklist = async (checklistId: string) => {
    const checklist = dbChecklists.find(c => c.id === checklistId);
    if (!checklist) return;

    const items = dbChecklistItems.filter(i => i.checklistId === checklistId);
    const parsedItems = items.map(i => parseChecklistItemText(i.text));
    const hasFail = parsedItems.some(i => i.status === 'Fail');
    const allPassed = parsedItems.every(i => i.status === 'Pass');
    const newStatus = hasFail ? 'Failed' : allPassed ? 'Approved' : 'Submitted';

    setQcRequests(prev => prev.map(req => {
      const matchesTitle = req.activityName.toLowerCase().includes(checklist.title.toLowerCase()) || 
                           checklist.title.toLowerCase().includes(req.activityName.toLowerCase());
      if (matchesTitle && req.status !== 'Approved') {
        const updatedReq = {
          ...req,
          status: newStatus,
          approvedBy: newStatus === 'Approved' ? 'Site Checklist Sync' : undefined,
          approvedAt: newStatus === 'Approved' ? new Date().toLocaleString() : undefined,
          checklist: {
            ...req.checklist,
            checkpoints: parsedItems.map(pi => ({
              checkpoint: pi.description,
              result: pi.status,
              observation: pi.note || 'Synced from site manager checklist'
            }))
          }
        };

        // Sync to Supabase
        syncQcRequestToSupabase(updatedReq);
        syncCheckpointsToSupabase(req.id, updatedReq.checklist.checkpoints);

        return updatedReq;
      }
      return req;
    }));

    showQcAlert(`Site Checklist "${checklist.title}" reviewed. Status synced to corresponding QC Inspection: ${newStatus}`);
  };

  const handleExportQCAuditReport = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showQcAlert('Please allow popups to export the QC Audit Report.', 'error');
      return;
    }

    const filteredReqs = qcRequests.filter(req => {
      const matchesSearch = req.activityName.toLowerCase().includes(logSearch.toLowerCase()) ||
                            req.location.toLowerCase().includes(logSearch.toLowerCase()) ||
                            req.contractorName.toLowerCase().includes(logSearch.toLowerCase());
      const matchesStatus = logStatus === 'All' || req.status === logStatus;
      const matchesPriority = logPriority === 'All' || req.priority === logPriority;
      const hasRework = reworkItems.some(rw => rw.qcRef === req.id);
      const matchesRework = logRework === 'All' || (logRework === 'Yes' && hasRework) || (logRework === 'No' && !hasRework);
      return matchesSearch && matchesStatus && matchesPriority && matchesRework;
    });

    const reportRows = filteredReqs.map(req => {
      const checkpointsHtml = (req.checklist?.checkpoints || []).map((cp: any) => `
        <div style="font-size: 9px; margin-bottom: 2px;">
          <span style="font-weight: bold; color: ${cp.result === 'Pass' ? '#059669' : cp.result === 'Fail' ? '#dc2626' : '#6b7280'};">
            [${cp.result || 'Pending'}]
          </span>
          ${cp.checkpoint} ${cp.observation ? `<em>(${cp.observation})</em>` : ''}
        </div>
      `).join('');

      return `
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 10px; font-weight: bold;">${req.id}</td>
          <td style="padding: 10px;">
            <div style="font-weight: bold;">${req.activityName}</div>
            <div style="font-size: 10px; color: #6b7280;">${req.location}</div>
          </td>
          <td style="padding: 10px;">${req.contractorName}</td>
          <td style="padding: 10px;">${req.submittedDate}</td>
          <td style="padding: 10px; font-weight: bold; color: ${req.status === 'Approved' ? '#059669' : req.status === 'Failed' ? '#dc2626' : '#b68d40'};">
            ${req.status}
          </td>
          <td style="padding: 10px;">${req.approvedBy || req.assignedEngineer || '--'}</td>
          <td style="padding: 10px;">${checkpointsHtml}</td>
        </tr>
      `;
    }).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>QC Audit Report - ${project?.name}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap');
            body {
              font-family: 'Inter', sans-serif;
              color: #1f2937;
              margin: 40px;
              line-height: 1.5;
            }
            .header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              border-bottom: 2px solid #b68d40;
              padding-bottom: 20px;
              margin-bottom: 30px;
            }
            .title {
              font-size: 24px;
              font-weight: 800;
              color: #111827;
              letter-spacing: -0.025em;
            }
            .meta {
              font-size: 11px;
              color: #4b5563;
              margin-bottom: 20px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 40px;
            }
            th {
              background-color: #f9fafb;
              color: #374151;
              font-weight: 800;
              text-transform: uppercase;
              font-size: 10px;
              letter-spacing: 0.05em;
              text-align: left;
              padding: 12px 10px;
              border-bottom: 2px solid #e5e7eb;
            }
            td {
              font-size: 11px;
            }
            .footer {
              margin-top: 60px;
              display: flex;
              justify-content: space-between;
              font-size: 11px;
              color: #6b7280;
            }
            .sig-line {
              width: 200px;
              border-bottom: 1px solid #9ca3af;
              margin-top: 40px;
            }
            @media print {
              body { margin: 20px; }
              button { display: none; }
            }
          </style>
        </head>
        <body>
          <div style="text-align: right; margin-bottom: 20px;">
            <button onclick="window.print()" style="padding: 8px 16px; background-color: #b68d40; color: white; border: none; border-radius: 6px; font-weight: bold; cursor: pointer;">Print Report</button>
          </div>
          <div class="header">
            <div>
              <div class="title">PRAMUKH GROUP ERP</div>
              <div style="font-size: 14px; font-weight: 600; color: #b68d40; margin-top: 4px;">Quality Control & Audit Log Report</div>
            </div>
            <div style="text-align: right;">
              <div style="font-weight: 800;">PROJECT: ${project?.name}</div>
              <div style="font-size: 11px; color: #4b5563;">Site ID: ${project?.id}</div>
            </div>
          </div>

          <div class="meta">
            <strong>Generated On:</strong> ${new Date().toLocaleString()} | 
            <strong>Total Records:</strong> ${filteredReqs.length} |
            <strong>Filter Status:</strong> ${logStatus} |
            <strong>Filter Priority:</strong> ${logPriority}
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 10%;">ID</th>
                <th style="width: 25%;">Activity / Location</th>
                <th style="width: 15%;">Contractor</th>
                <th style="width: 10%;">Sub Date</th>
                <th style="width: 10%;">Status</th>
                <th style="width: 15%;">Verifier</th>
                <th style="width: 25%;">Checkpoints Log</th>
              </tr>
            </thead>
            <tbody>
              ${reportRows || '<tr><td colspan="7" style="padding: 20px; text-align: center; color: #9ca3af; font-style: italic;">No records match the current filters.</td></tr>'}
            </tbody>
          </table>

          <div class="footer">
            <div>
              <div>Prepared By:</div>
              <div class="sig-line"></div>
              <div style="margin-top: 8px; font-weight: 600;">Quality Inspector / Site Engineer</div>
            </div>
            <div>
              <div>Approved By:</div>
              <div class="sig-line"></div>
              <div style="margin-top: 8px; font-weight: 600;">Project Director / Owner Representative</div>
            </div>
          </div>
          <script>
            window.addEventListener('DOMContentLoaded', () => {
              setTimeout(() => { window.print(); }, 500);
            });
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Sync reworkItems from project.tasks in live mode
  useEffect(() => {
    if (!project) return;
    const isSimulation = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project');
    if (isSimulation) return;

    const parsedReworks = (project.tasks || [])
      .filter((t: any) => t.name && t.name.startsWith('[REWORK] '))
      .map((t: any) => {
        let details = {
          issueDescription: t.description || '',
          location: 'Site Location',
          responsiblePerson: t.assigneeName || 'Contractor',
          targetDate: t.endDate || '',
          status: t.status || 'Assigned',
          remarks: '',
          correctionPhotos: []
        };
        try {
          if (t.description && t.description.startsWith('{')) {
            details = { ...details, ...JSON.parse(t.description) };
          }
        } catch (e) {}

        return {
          id: t.id,
          qcRef: t.dependencies || '',
          activityName: t.name.replace('[REWORK] ', ''),
          issueDescription: details.issueDescription,
          location: details.location,
          responsiblePerson: details.responsiblePerson,
          targetDate: details.targetDate,
          status: details.status,
          remarks: details.remarks,
          correctionPhotos: details.correctionPhotos || []
        };
      });

    setReworkItems(parsedReworks);
  }, [project?.tasks]);

  // Fetch QC Inspections and work completions (daily logs) from database
  useEffect(() => {
    if (!project) return;
    
    let isMounted = true;
    const isSimulation = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project');
    if (isSimulation) return;

    const dbSiteId = getDbSiteId(project.id);

    const fetchQcData = async () => {
      try {
        // Fetch QC checklist templates from Supabase
        const { data: templatesData, error: templatesError } = await supabase
          .from('qc_checklist_templates')
          .select('*');

        if (!templatesError && templatesData && templatesData.length > 0) {
          const { data: templateItemsData, error: templateItemsError } = await supabase
            .from('qc_checklist_template_items')
            .select('*');

          if (!templateItemsError && templateItemsData) {
            const fetchedTemplates = templatesData.map((t: any) => {
              const checkpoints = templateItemsData
                .filter((item: any) => item.template_id === t.id)
                .sort((a: any, b: any) => (a.sequence_no ?? 0) - (b.sequence_no ?? 0))
                .map((item: any) => item.text);

              return {
                id: t.id,
                category: t.category || 'General',
                title: t.title,
                checkpoints: checkpoints.length > 0 ? checkpoints : ['Work alignment and layout verify']
              };
            });
            if (isMounted) {
              setQcTemplates(fetchedTemplates);
            }
          }
        }

        const { data: inspectionsData, error: inspectionsError } = await supabase
          .from('qc_inspections')
          .select('*')
          .eq('project_id', dbSiteId);

        if (inspectionsError) throw inspectionsError;

        if (inspectionsData && isMounted) {
          const inspectionIds = inspectionsData.map(ins => ins.id);

          let itemsData: any[] = [];
          if (inspectionIds.length > 0) {
            const { data: qItems, error: itemsError } = await supabase
              .from('qc_inspection_items')
              .select('*')
              .in('qc_inspection_id', inspectionIds);

            if (itemsError) throw itemsError;
            itemsData = qItems || [];
          }

          const mappedQcRequests = inspectionsData.map(ins => {
            let details = {
              contractorName: 'Contractor',
              priority: 'MEDIUM',
              location: 'Site Location',
              remarksText: ins.remarks || '',
              assignedEngineer: ins.inspector_id || '-- Unassigned --',
              scheduledDate: ins.inspection_date || ins.created_at?.split('T')[0] || '',
              submittedDate: ins.inspection_date || ins.created_at?.split('T')[0] || '',
              requestedBy: 'Site Engineer',
              activityName: ins.type || 'Site Activity',
              completionId: ins.activity_id || '',
              category: 'General'
            };

            try {
              if (ins.remarks && ins.remarks.startsWith('{')) {
                const parsed = JSON.parse(ins.remarks);
                details = { ...details, ...parsed };
              }
            } catch (e) {}

            const checklistItems = itemsData.filter(item => item.qc_inspection_id === ins.id);
            const checkpoints = checklistItems.map(item => ({
              id: item.id,
              checkpoint: item.description,
              result: item.result || 'Pending',
              observation: item.remarks || ''
            }));

            return {
              id: ins.id,
              completionId: details.completionId || '',
              activityName: details.activityName,
              category: details.category || 'General',
              contractorName: details.contractorName,
              submittedDate: details.submittedDate,
              requestedBy: details.requestedBy,
              priority: details.priority,
              status: ins.status || 'Pending QC Inspection',
              assignedEngineer: details.assignedEngineer,
              scheduledDate: details.scheduledDate,
              location: details.location,
              remarks: details.remarksText,
              photos: (details as any).photos || [],
              checklist: {
                id: `c_${ins.id}`,
                title: `${details.activityName} QC Checklist`,
                checkpoints: checkpoints.length > 0 ? checkpoints : [
                  { checkpoint: 'Work alignment and layout verify', result: 'Pending', observation: '' },
                  { checkpoint: 'Material specification compliance', result: 'Pending', observation: '' },
                  { checkpoint: 'Structural / finishing tolerances met', result: 'Pending', observation: '' }
                ]
              }
            };
          });

          setQcRequests(mappedQcRequests);
        }

        const { data: logsData, error: logsError } = await supabase
          .from('daily_logs')
          .select('*')
          .eq('project_id', dbSiteId)
          .eq('log_type', 'work');

        if (logsError) {
          const { data: logsData2, error: logsError2 } = await supabase
            .from('daily_logs')
            .select('*')
            .eq('project_id', dbSiteId)
            .eq('type', 'work');
          if (!logsError2 && logsData2) {
            mapWorkLogs(logsData2);
          }
        } else if (logsData) {
          mapWorkLogs(logsData);
        }

      } catch (err) {
        console.error('Error fetching QC/DPR data:', err);
      }
    };

    const mapWorkLogs = (data: any[]) => {
      if (!isMounted) return;
      const mappedWork = data.map(log => {
        let details = {
          boqItem: 'BOQ Item',
          block: 'Block',
          floor: 'Floor',
          contractorName: 'Contractor',
          plannedQty: 100,
          completedQty: 100,
          unit: 'Qty',
          remarksText: log.description || '',
          photos: []
        };

        try {
          if (log.description && log.description.startsWith('{')) {
            details = { ...details, ...JSON.parse(log.description) };
          }
        } catch (e) {}

        return {
          id: log.id,
          activityName: log.title || 'Work Activity',
          boqItem: details.boqItem,
          block: details.block,
          floor: details.floor,
          contractorName: details.contractorName,
          plannedQty: details.plannedQty,
          completedQty: details.completedQty,
          unit: details.unit,
          completionDate: log.created_at?.split('T')[0] || new Date().toISOString().split('T')[0],
          remarks: details.remarksText,
          status: log.status || 'Pending Inspection',
          photos: details.photos || []
        };
      });
      setWorkCompletions(mappedWork);
    };

    fetchQcData();

    // Set up Realtime listener for QC changes
    const channelName = `qc-updates-\${dbSiteId}-\${Date.now()}`;
    const qcChannel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'qc_inspections', filter: `project_id=eq.\${dbSiteId}` },
        () => { fetchQcData(); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'qc_inspection_items' },
        () => { fetchQcData(); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'daily_logs', filter: `project_id=eq.\${dbSiteId}` },
        () => { fetchQcData(); }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(qcChannel);
    };
  }, [project, id]);

  // Get project weather details
  const getWeatherForProject = (id: string) => {
    switch(id) {
      case 'central-park':
        return { temp: '32°C', desc: 'Partly Cloudy, 12 km/h Wind' };
      case 'orbit-4':
        return { temp: '31°C', desc: 'Sunny, 10 km/h Wind' };
      case 'satva-office':
        return { temp: '34°C', desc: 'Clear, 15 km/h Wind' };
      case 'aranya-3':
        return { temp: '30°C', desc: 'Cloudy, 8 km/h Wind' };
      default:
        return { temp: '32°C', desc: 'Partly Cloudy, 12 km/h Wind' };
    }
  };
  const projectWeather = project ? getWeatherForProject(project.id) : { temp: '32°C', desc: 'Partly Cloudy, 12 km/h Wind' };

  // Detailed overview command center data
  const getProjectOverviewData = (id: string) => {
    switch(id) {
      case 'central-park':
        return {
          physicalProgress: 28,
          plannedProgress: 34,
          variance: -6,
          budgetUsed: '₹24.2 Cr',
          workforce: 186,
          pendingApprovals: 7,
          materialRisk: 1,
          openIssues: 3,
          
          developer: 'Pramukh Group',
          pmc: 'Fortiv Solutions PMC',
          architect: 'Space Design Associates',
          consultant: 'V. R. Patel & Associates',
          towers: 4,
          units: 180,
          builtUpArea: '2,45,000 Sq.Ft.',
          startDate: '2025-05-01',
          targetCompletion: '30 Jul 2027',
          reraNumber: 'PR/GJ/SURAT/SURAT CITY/S120',
          propertyType: 'Residential Apartment',
          
          forecastCompletion: '15 Sep 2027',
          forecastDelay: 47,
          milestonesCompleted: 12,
          totalMilestones: 18,
          cpi: 0.92,
          
          approvedBudget: '₹90 Cr',
          committedCost: '₹58 Cr',
          actualSpent: '₹24 Cr',
          pendingBills: '₹4 Cr',
          forecastCost: '₹95 Cr',
          potentialOverrun: '₹5 Cr',
          
          prRaised: 152,
          prPending: 8,
          poIssued: 121,
          pendingDeliveries: 12,
          delayedDeliveries: 3,
          criticalMaterials: 2,
          
          cementStock: { days: 18, status: 'Healthy' as const },
          steelStock: { days: 24, status: 'Healthy' as const },
          aacStock: { days: 7, status: 'Low' as const },
          tilesStock: { days: 3, status: 'Low' as const },
          reorderAlerts: 3,
          
          requiredWorkforce: 220,
          shortfall: 34,
          productivity: 84,
          activeContractors: 8,
          subcontractors: 14,
          
          qaInspections: 245,
          passed: 231,
          failed: 14,
          openSnags: 36,
          closedSnags: 192,
          
          safeDays: 148,
          safetyAudits: 22,
          openNcr: 3,
          safetyViolations: 5,
          
          criticalActivities: [
            { name: 'Tower A Slab L7', delay: '5 Days' },
            { name: 'Waterproofing', delay: '8 Days' },
            { name: 'MEP Shaft Closure', delay: '3 Days' }
          ],
          
          aiInsights: [
            'Tower B delayed by 6 days due to slab cycle lag.',
            'Budget burn exceeds progress by 8%.',
            'Cement stock below safety threshold.',
            '2 approvals blocking structural execution.'
          ],
          aiActions: [
            'Approve PR-145 (Cement reinforcement)',
            'Increase workforce by 18 labour on Tower A',
            'Expedite waterproofing vendor appointment'
          ]
        };
      case 'orbit-4':
      default:
        return {
          physicalProgress: 46,
          plannedProgress: 50,
          variance: -4,
          budgetUsed: '₹24.0 Cr',
          workforce: 194,
          pendingApprovals: 2,
          materialRisk: 1,
          openIssues: 2,
          
          developer: 'Pramukh Group',
          pmc: 'Fortiv Solutions PMC',
          architect: 'Sanjay Puri Architects',
          consultant: 'Delcons Consultants',
          towers: 2,
          units: 96,
          builtUpArea: '1,85,000 Sq.Ft.',
          startDate: '2025-10-01',
          targetCompletion: '30 Dec 2027',
          reraNumber: 'PR/GJ/SURAT/SURAT CITY/S044',
          propertyType: 'Commercial Corporate Complex',
          
          forecastCompletion: '20 Jan 2028',
          forecastDelay: 21,
          milestonesCompleted: 15,
          totalMilestones: 20,
          cpi: 0.96,
          
          approvedBudget: '₹54 Cr',
          committedCost: '₹38 Cr',
          actualSpent: '₹24 Cr',
          pendingBills: '₹2 Cr',
          forecastCost: '₹56 Cr',
          potentialOverrun: '₹2 Cr',
          
          prRaised: 94,
          prPending: 2,
          poIssued: 78,
          pendingDeliveries: 5,
          delayedDeliveries: 1,
          criticalMaterials: 1,
          
          cementStock: { days: 12, status: 'Low' as const },
          steelStock: { days: 18, status: 'Healthy' as const },
          aacStock: { days: 9, status: 'Healthy' as const },
          tilesStock: { days: 15, status: 'Healthy' as const },
          reorderAlerts: 1,
          
          requiredWorkforce: 210,
          shortfall: 16,
          productivity: 90,
          activeContractors: 5,
          subcontractors: 10,
          
          qaInspections: 180,
          passed: 172,
          failed: 8,
          openSnags: 14,
          closedSnags: 158,
          
          safeDays: 210,
          safetyAudits: 18,
          openNcr: 1,
          safetyViolations: 2,
          
          criticalActivities: [
            { name: 'Level 8 Deck Casting', delay: '4 Days' },
            { name: 'GRC Facade Brackets', delay: '6 Days' },
            { name: 'Fire Piping Support', delay: '2 Days' }
          ],
          
          aiInsights: [
            'East facade anchor plates survey variance requires structural alignment.',
            'High-speed lift shop-drawing approval lagging by 14 days.',
            'Steel stock is healthy, but reorder level is approaching.'
          ],
          aiActions: [
            'Approve structural alignment protocol',
            'Expedite high-speed lift drawing signature',
            'Review steel vendor PO next week'
          ]
        };
    }
  };
  const overviewData = project ? getProjectOverviewData(project.id) : getProjectOverviewData('central-park');
  const [imageMode, setImageMode] = useState<'render' | 'photo' | 'drone' | 'camera'>('render');

  // Daily Activity Form states
  const [engineerName, setEngineerName] = useState('');
  const [weather, setWeather] = useState<'Sunny' | 'Rainy' | 'Cloudy' | 'Windy'>('Sunny');
  const [workCompleted, setWorkCompleted] = useState('');
  const [issues, setIssues] = useState('');
  const [risks, setRisks] = useState('');
  const [progressDelta, setProgressDelta] = useState(0.2);

  // Material Transaction Form states
  const [selectedMatId, setSelectedMatId] = useState('');
  const [txType, setTxType] = useState<'INWARD' | 'OUTWARD'>('INWARD');
  const [txQty, setTxQty] = useState(0);
  const [txCost, setTxCost] = useState(0);
  const [txRef, setTxRef] = useState('');

  // Retained for the legacy communication panel, which is no longer exposed as a project module.
  const [chatMessageText, setChatMessageText] = useState('');
  const [chatChannel, setChatChannel] = useState<'engineers' | 'client' | 'vendors'>('engineers');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isNotificationOpen) return;

    const handleOutsideClick = (event: MouseEvent) => {
      if (!notificationMenuRef.current?.contains(event.target as Node)) {
        setIsNotificationOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isNotificationOpen]);

  // Procurement Form states
  const [procTitle, setProcTitle] = useState('');
  const [procCost, setProcCost] = useState(0);
  const [procStatus, setProcStatus] = useState<'DRAFT' | 'RFQ_SENT' | 'PO_ISSUED'>('DRAFT');

  // BOQ Form states
  const [boqCode, setBoqCode] = useState('');
  const [boqDesc, setBoqDesc] = useState('');
  const [boqUnit, setBoqUnit] = useState('Cum');
  const [boqRate, setBoqRate] = useState(0);
  const [boqQty, setBoqQty] = useState(0);

  // QC Form states
  const [qcTitle, setQcTitle] = useState('');

  // v2.0 QC and new ERP module states
  const [snags, setSnags] = useState<{
    id: string;
    description: string;
    location: string;
    severity: 'CRITICAL' | 'MAJOR' | 'MINOR';
    status: 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED';
    owner: string;
  }[]>([]);
  const [newSnagDesc, setNewSnagDesc] = useState('');
  const [newSnagLoc, setNewSnagLoc] = useState('');
  const [newSnagSev, setNewSnagSev] = useState<'CRITICAL' | 'MAJOR' | 'MINOR'>('MAJOR');
  const [newSnagOwner, setNewSnagOwner] = useState('');

  const [audits, setAudits] = useState<{
    id: string;
    item: string;
    status: 'PASSED' | 'FAILED' | 'PENDING';
  }[]>([
    { id: 'A1', item: 'PPE Compliance (Helmets & Safety Vests check)', status: 'PASSED' },
    { id: 'A2', item: 'Concrete slump test verification', status: 'PASSED' },
    { id: 'A3', item: 'Rebar spacing and diameter audit', status: 'FAILED' },
    { id: 'A4', item: 'Scaffolding stability & toe-boards audit', status: 'PENDING' },
    { id: 'A5', item: 'Electrical grounding of distribution boards', status: 'PENDING' },
  ]);

  // Redesigned Quality Control states
  const [qcSubTab, setQcSubTab] = useState<'dashboard' | 'completion' | 'inspections' | 'history' | 'rework' | 'billing'>('dashboard');
  const [expandedTemplates, setExpandedTemplates] = useState<Record<string, boolean>>({});
  const [expandedAudits, setExpandedAudits] = useState<Record<string, boolean>>({});
  const [expandedReworks, setExpandedReworks] = useState<Record<string, boolean>>({});
  const [qcMessage, setQcMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // States for forms
  const [wcActivityName, setWcActivityName] = useState('');
  const [wcBoqItem, setWcBoqItem] = useState('');
  const [wcBlock, setWcBlock] = useState('Tower B');
  const [wcFloor, setWcFloor] = useState('');
  const [wcContractorName, setWcContractorName] = useState('');
  const [wcPlannedQty, setWcPlannedQty] = useState(0);
  const [wcCompletedQty, setWcCompletedQty] = useState(0);
  const [wcUnit, setWcUnit] = useState('Sqft');
  const [wcRemarks, setWcRemarks] = useState('');
  const [wcPhotos, setWcPhotos] = useState<string[]>([]);
  const [wcPhotoUrlInput, setWcPhotoUrlInput] = useState('');
  const [wcCategory, setWcCategory] = useState('qc-concrete');

  // Selected QC request for inspection
  const [selectedQcRequestId, setSelectedQcRequestId] = useState('QCR-2026-001');

  // Assignment states
  const [assigneeMap, setAssigneeMap] = useState<Record<string, string>>({});
  const [scheduleDateMap, setScheduleDateMap] = useState<Record<string, string>>({});

  // Rework form state (when rejecting)
  const [showReworkFormForId, setShowReworkFormForId] = useState<string | null>(null);
  const [reworkTargetDate, setReworkTargetDate] = useState('');
  const [reworkDesc, setReworkDesc] = useState('');

  // Measurement states
  const [measVerifiedQty, setMeasVerifiedQty] = useState<Record<string, number>>({});
  const [measSheetName, setMeasSheetName] = useState<Record<string, string>>({});

  // Dynamic Client Checklist Builder states
  const [dynamicTitle, setDynamicTitle] = useState('');
  const [dynamicPoints, setDynamicPoints] = useState('');

  // Kanban view state for Rework tasks
  const [reworkViewMode, setReworkViewMode] = useState<'table' | 'kanban'>('kanban');

  // AI Vision audit & custom template states
  const [aiAuditingId, setAiAuditingId] = useState<string | null>(null);
  const [newCheckpointText, setNewCheckpointText] = useState('');
  const [newTemplateTitle, setNewTemplateTitle] = useState('');
  const [newTemplatePoints, setNewTemplatePoints] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [inspectingReqId, setInspectingReqId] = useState<string | null>(null);
  const [attachedPhotos, setAttachedPhotos] = useState<string[]>([]);
  const [qcTemplates, setQcTemplates] = useState<any[]>([
    {
      id: 'qc-concrete',
      category: 'Concrete Casting',
      title: 'Concrete Casting Inspection',
      checkpoints: [
        'Formwork alignment and shuttering oil check',
        'Rebar layout, spacing, and binding checks',
        'Reinforcement concrete cover block spacing check',
        'Slump test value and water-cement ratio verification',
        'Concrete pour vibrator usage check',
        'Proper water curing scheduling check'
      ]
    },
    {
      id: 'qc-masonry',
      category: 'Masonry & Plastering',
      title: 'Brick Masonry & Plastering Check',
      checkpoints: [
        'Mortar mix ratio (e.g. 1:4 / 1:6) check',
        'Plumb alignment and wall verticality checks',
        'Joint thickness check (should be uniform 10mm)',
        'Rough surface keying check before plastering',
        'Plaster level thickness & curing check'
      ]
    },
    {
      id: 'qc-plumbing',
      category: 'Plumbing & Sanitary',
      title: 'Plumbing Pressure & Leakage Check',
      checkpoints: [
        'Pipe pressure testing (e.g., 5 bar test)',
        'Drainage pipe slope alignment verification',
        'Leakage test at joints & connectors',
        'Waterproofing of wet areas (bathrooms/balconies) check',
        'Sanitary fixture testing'
      ]
    },
    {
      id: 'qc-electrical',
      category: 'Electrical Installation',
      title: 'Conduiting & Wiring Continuity Check',
      checkpoints: [
        'Conduit pipe routing and joint checks',
        'Continuity and insulation resistance test of cables',
        'DB/MCB placement and wiring connection checks',
        'Earthing and ground resistance measurement check',
        'Fixing switchboards & fixtures check'
      ]
    }
  ]);

  // QC Logs Filtering states
  const [logSearch, setLogSearch] = useState('');
  const [logStatus, setLogStatus] = useState('All');
  const [logPriority, setLogPriority] = useState('All');
  const [logRework, setLogRework] = useState('All');

  // Quantity updates states
  const [editWcId, setEditWcId] = useState<string | null>(null);
  const [editQtyValue, setEditQtyValue] = useState<number>(0);

  const [workCompletions, setWorkCompletions] = useState<any[]>([
    {
      id: 'WC-001',
      activityName: 'External Plaster Work',
      boqItem: 'BOQ-041 (External plastering 1:4 mix)',
      block: 'Tower B',
      floor: 'L6 - L8 East Facade',
      contractorName: 'Pragati Builders',
      plannedQty: 6000,
      completedQty: 5000,
      unit: 'Sqft',
      completionDate: '2026-06-19',
      remarks: 'East facade plastering completed for towers B. Scaffolding is still in place.',
      status: 'Pending Inspection',
      photos: ['https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=800&q=80'],
      docs: ['Plaster-Mix-Test-Report-PB.pdf']
    },
    {
      id: 'WC-002',
      activityName: 'RCC Slab Casting',
      boqItem: 'BOQ-012 (M30 Concrete placement)',
      block: 'Tower A',
      floor: 'L7 Slab',
      contractorName: 'Shreeji Structural',
      plannedQty: 180,
      completedQty: 180,
      unit: 'Cum',
      completionDate: '2026-06-12',
      remarks: 'Pour completed. Curing sensors installed and active.',
      status: 'Approved',
      photos: ['https://images.unsplash.com/photo-1581094288338-2314dddb7ecc?auto=format&fit=crop&w=800&q=80'],
      docs: ['Concrete-Cube-Test-7d-Report.pdf', 'Slump-Test-Challan-502.pdf']
    },
    {
      id: 'WC-003',
      activityName: 'Internal Masonry work',
      boqItem: 'BOQ-028 (AAC Block work 150mm)',
      block: 'Tower B',
      floor: 'L5 Toilet Area',
      contractorName: 'Raj Construction',
      plannedQty: 300,
      completedQty: 220,
      unit: 'Sqm',
      completionDate: '2026-06-17',
      remarks: 'Toilet blocks partitioned. Ready for plastering.',
      status: 'Failed',
      photos: ['https://images.unsplash.com/photo-1590069261209-f8e9b8642343?auto=format&fit=crop&w=800&q=80'],
      docs: ['Block-Batch-Certificate.pdf']
    },
    {
      id: 'WC-004',
      activityName: 'Electrical Conduit Laying',
      boqItem: 'BOQ-082 (PVC Conduit 25mm pipe)',
      block: 'Tower A',
      floor: 'L8 Slab Deck',
      contractorName: 'Supreme Electricals',
      plannedQty: 1200,
      completedQty: 1200,
      unit: 'Rmt',
      completionDate: '2026-06-20',
      remarks: 'Slab reinforcement conduit completed. Ready for concrete.',
      status: 'Pending Inspection',
      photos: [],
      docs: []
    }
  ]);

  const [qcRequests, setQcRequests] = useState<any[]>([]);
  const [safetyIncidents, setSafetyIncidents] = useState<any[]>([]);

  const [reworkItems, setReworkItems] = useState<any[]>([]);

  const [measurementVerifications, setMeasurementVerifications] = useState<any[]>([]);

  const [localDocs, setLocalDocs] = useState<any[]>([]);
  const [newDocName, setNewDocName] = useState('');
  const [newDocCategory, setNewDocCategory] = useState<'DRAWING' | 'BOQ' | 'CONTRACT' | 'INVOICE' | 'PHOTO' | 'APPROVAL'>('DRAWING');
  const [newDocVersion, setNewDocVersion] = useState('V1.0.0');

  const [localEquip, setLocalEquip] = useState<any[]>([]);
  const [logEquipId, setLogEquipId] = useState('');
  const [logHours, setLogHours] = useState('');
  const [logFuel, setLogFuel] = useState('');

  const { vendors: storeVendors, vendorBills, vendorPerformances } = useAppStore();
  
  // Filter vendor performances and properties for this project detail view
  const vendors = storeVendors.map((vendor) => {
    const projectPerf = vendorPerformances.find(
      (p) => p.vendorId === vendor.id && p.projectId === project?.id
    );
    return {
      id: vendor.id,
      name: vendor.name,
      category: vendor.category,
      qualityPass: projectPerf ? projectPerf.qualityScore : (vendor.id === 'v1' ? 99.5 : vendor.id === 'v2' ? 98.0 : vendor.id === 'v8' ? 94.2 : vendor.id === 'v9' ? 97.8 : 95),
      deliverySpeed: projectPerf ? projectPerf.deliveryScore : (vendor.id === 'v1' ? 98 : vendor.id === 'v2' ? 92 : vendor.id === 'v8' ? 79 : vendor.id === 'v9' ? 95 : 90),
      rating: vendor.rating || (vendor.id === 'v1' ? 94 : vendor.id === 'v2' ? 88 : vendor.id === 'v8' ? 72 : vendor.id === 'v9' ? 91 : 85),
      status: vendor.id === 'v1' ? ('PREMIUM' as const) : vendor.id === 'v2' ? ('APPROVED' as const) : vendor.id === 'v8' ? ('PROBATION' as const) : ('APPROVED' as const),
    };
  });

  const projectBills = vendorBills.filter((b) => b.projectId === project?.id);
  const vendorPayments = projectBills.map((bill) => ({
    id: bill.id,
    date: bill.date,
    vendor: bill.vendorName,
    amount: bill.amount,
    status: bill.status === 'PAID' ? ('PAID' as const) : bill.status === 'HELD' ? ('HELD' as const) : ('PROCESSING' as const),
    ref: bill.ref || bill.invoiceNumber,
  }));

  // Sync state values on project load
  useEffect(() => {
    if (project) {
      setLocalDocs(project.documents || []);
      setLocalEquip(project.equipments || []);
    }
  }, [project]);

  useEffect(() => {
    initSupabase();
  }, [initSupabase]);

  // Billing Form states
  const [invoiceAmount, setInvoiceAmount] = useState<number | ''>('');
  const [invoiceDesc, setInvoiceDesc] = useState('');
  const [selectedWcActivity, setSelectedWcActivity] = useState('');

  // Dynamic QC KPIs calculations
  const totalCompletedQC = qcRequests.filter(r => r.status === 'Approved' || r.status === 'Failed').length;
  const totalApprovedQC = qcRequests.filter(r => r.status === 'Approved').length;
  const qcPassRateVal = totalCompletedQC > 0 ? (totalApprovedQC / totalCompletedQC) * 100 : 85.0;
  const qcPassRateStr = `${qcPassRateVal.toFixed(1)}%`;

  const totalActivities = workCompletions.length;
  const clearedOrBilledCount = workCompletions.filter(wc => {
    const req = qcRequests.find(r => r.completionId === wc.id);
    const mv = measurementVerifications.find(m => m.activityName === wc.activityName);
    const rwCount = reworkItems.filter(r => r.qcRef === req?.id && r.status !== 'Closed').length;

    const isCompleted = wc.completedQty > 0;
    const isQcApproved = wc.status === 'Approved';
    const noRework = rwCount === 0;
    const photoProof = wc.photos && wc.photos.length > 0;
    const measurementApproved = mv ? mv.status === 'Approved' : true;
    const invoiceCreated = project!.invoices.some(inv => inv.desc.includes(wc.activityName));

    return (isCompleted && isQcApproved && noRework && photoProof && measurementApproved) || invoiceCreated;
  }).length;

  const billingClearanceRateVal = totalActivities > 0 ? (clearedOrBilledCount / totalActivities) * 100 : 75.0;
  const billingClearanceRateStr = `${billingClearanceRateVal.toFixed(1)}%`;

  // User Management states
  const [teamName, setTeamName] = useState('');
  const [teamRole, setTeamRole] = useState('');


  if (!project) {
    return (
      <div className="py-16 text-center">
        <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <h2 className="font-heading text-lg font-bold text-gray-900 dark:text-white">Project Site Not Found</h2>
        <p className="text-xs text-gray-500 mt-1">The requested Project Site does not exist in our registry.</p>
      </div>
    );
  }

  // Format currency helper
  const formatCurrency = (val: number) => {
    if (val >= 10000000) return `INR ${(val / 10000000).toFixed(2)} Cr`;
    return `INR ${(val / 100000).toFixed(2)} L`;
  };

  // Submit Daily Activity
  const handleDailyActivitySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!engineerName || !workCompleted) return;
    
    addDailyActivity(project!.id, {
      projectId: project!.id,
      engineerName,
      weather,
      workCompleted,
      issues: issues || null,
      risks: risks || null,
      progressDelta: parseFloat(progressDelta.toString())
    });

    // Reset Form
    setWorkCompleted('');
    setIssues('');
    setRisks('');
  };

  // Submit Material Transaction
  const handleMaterialTransactionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMatId || txQty <= 0) return;
    
    addMaterialTransaction(
      project!.id,
      selectedMatId,
      txType,
      parseFloat(txQty.toString()),
      parseFloat(txCost.toString()),
      txRef || `REF-${project!.id}-${selectedMatId}-${(project!.materials.find((mat) => mat.id === selectedMatId)?.transactions?.length || 0) + 1}`
    );

    // Reset Form
    setTxQty(0);
    setTxCost(0);
    setTxRef('');
  };

  const handleSendChatMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMessageText.trim()) return;

    const roleSuffix = chatChannel === 'client'
      ? ' (Client Group)'
      : chatChannel === 'vendors'
        ? ' (Supply Line)'
        : '';

    addChatMessage(project!.id, currentUser.name, currentUser.role + roleSuffix, chatMessageText.trim());
    setChatMessageText('');
  };

  // Submit Procurement Requisition
  const handleProcurementSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!procTitle || procCost <= 0) return;

    addProcurementReq(project!.id, {
      projectId: project!.id,
      title: procTitle,
      status: procStatus,
      cost: parseFloat(procCost.toString()),
      vendorName: null,
      deliveryDate: null
    });

    setProcTitle('');
    setProcCost(0);
  };

  // Submit BOQ Item
  const handleBOQSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!boqCode || !boqDesc || boqQty <= 0 || boqRate <= 0) return;

    addBOQItem(project!.id, {
      projectId: project!.id,
      code: boqCode,
      description: boqDesc,
      unit: boqUnit,
      rate: parseFloat(boqRate.toString()),
      estimatedQty: parseFloat(boqQty.toString())
    });

    setBoqCode('');
    setBoqDesc('');
    setBoqRate(0);
    setBoqQty(0);
  };

  const handleQCSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!qcTitle) return;
    addQCItem(project!.id, qcTitle);
    setQcTitle('');
  };

  const handleInvoiceSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoiceAmount || !invoiceDesc) return;

    if (selectedWcActivity) {
      const wc = workCompletions.find(w => w.id === selectedWcActivity);
      if (wc) {
        const req = qcRequests.find(r => r.completionId === wc.id);
        const mv = measurementVerifications.find(m => m.activityName === wc.activityName);
        const rwCount = reworkItems.filter(r => r.qcRef === req?.id && r.status !== 'Closed').length;

        const isCompleted = wc.completedQty > 0;
        const isQcApproved = wc.status === 'Approved';
        const noRework = rwCount === 0;
        const photoProof = wc.photos && wc.photos.length > 0;
        const measurementApproved = mv ? mv.status === 'Approved' : true;
        const invoiceCreated = project!.invoices.some(inv => inv.desc.includes(wc.activityName));

        const billingAllowed = isCompleted && isQcApproved && noRework && photoProof && measurementApproved && !invoiceCreated;

        if (!billingAllowed) {
          showQcAlert(`Cannot submit invoice: Linked activity "${wc.activityName}" is blocked by QC checks or already billed.`, 'error');
          return;
        }
      }
    }

    addInvoice(project!.id, Number(invoiceAmount), invoiceDesc);
    setInvoiceAmount('');
    setInvoiceDesc('');
    setSelectedWcActivity('');
  };

  const handleTeamSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamName || !teamRole) return;
    addTeamMember(project!.id, teamName, teamRole);
    setTeamName('');
    setTeamRole('');
  };

  // Snag form submit handler
  const handleSnagSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSnagDesc || !newSnagLoc) return;
    const newSnag = {
      id: `S${Date.now()}`,
      description: newSnagDesc,
      location: newSnagLoc,
      severity: newSnagSev,
      status: 'OPEN' as const,
      owner: newSnagOwner || currentUser.name || 'Site Engineer'
    };
    setSnags([...snags, newSnag]);
    setNewSnagDesc('');
    setNewSnagLoc('');
    setNewSnagOwner('');
  };

  // Redesigned Quality Control Helper Functions
  const showQcAlert = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setQcMessage({ text, type });
    setTimeout(() => setQcMessage(null), 5000);
  };

  const handleWorkCompletionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!wcActivityName || !wcContractorName || wcCompletedQty <= 0) {
      showQcAlert('Please fill in all required work completion fields.', 'error');
      return;
    }

    const newWcId = `WC-${Date.now().toString().slice(-4)}`;
    const newQcrId = `QCR-2026-${Date.now().toString().slice(-3)}`;

    const newWc = {
      id: newWcId,
      activityName: wcActivityName,
      boqItem: wcBoqItem || 'BOQ-General',
      block: wcBlock,
      floor: wcFloor || 'General Area',
      contractorName: wcContractorName,
      plannedQty: wcPlannedQty || 0,
      completedQty: wcCompletedQty,
      unit: wcUnit,
      completionDate: new Date().toISOString().split('T')[0],
      remarks: wcRemarks,
      status: 'Pending Inspection',
      photos: wcPhotos.length > 0 ? wcPhotos : (wcPhotoUrlInput ? [wcPhotoUrlInput] : ['https://images.unsplash.com/photo-1541888946425-d81bb19240f5?auto=format&fit=crop&w=800&q=80']),
      docs: []
    };

    const newQcr = {
      id: newQcrId,
      completionId: newWcId,
      activityName: wcActivityName,
      contractorName: wcContractorName,
      submittedDate: new Date().toISOString().split('T')[0],
      requestedBy: `${currentUser.name} (${(currentUser.role as string) === 'SITE_ENGINEER' || (currentUser.role as string) === 'SITE_MANAGER' ? 'Site Eng' : 'User'})`,
      priority: 'MEDIUM',
      status: 'Submitted',
      assignedEngineer: '-- Unassigned --',
      scheduledDate: '',
      location: `${wcBlock} - ${wcFloor || 'General'}`,
      categoryId: wcCategory,
      category: qcTemplates.find(t => t.id === wcCategory)?.category ?? 'General',
      checklist: {
          id: `c_${newQcrId}`,
          title: `${wcActivityName} Quality Checklist`,
          checkpoints: (() => {
            const tmpl = qcTemplates.find(t => t.id === wcCategory);
            const pts = tmpl ? tmpl.checkpoints : [
              'Work alignment and layout verify',
              'Material specification compliance',
              'Structural / finishing tolerances met',
              'Housekeeping and site clearance'
            ];
            return pts.map((cp: string) => ({ checkpoint: cp, result: 'Pending', observation: '' }));
          })()
        }
    };

    setWorkCompletions(prev => [newWc, ...prev]);
    setQcRequests(prev => [newQcr, ...prev]);
    setSelectedQcRequestId(newQcrId); // select this new request automatically

    // Reset fields
    setWcActivityName('');
    setWcBoqItem('');
    setWcFloor('');
    setWcContractorName('');
    setWcPlannedQty(0);
    setWcCompletedQty(0);
    setWcRemarks('');
    setWcPhotos([]);
    setWcPhotoUrlInput('');

    // Database Sync
    const isSimulation = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project');
    if (!isSimulation) {
      const dbSiteId = getDbSiteId(project!.id);
      
      const logDescription = JSON.stringify({
        boqItem: newWc.boqItem,
        block: newWc.block,
        floor: newWc.floor,
        contractorName: newWc.contractorName,
        plannedQty: newWc.plannedQty,
        completedQty: newWc.completedQty,
        unit: newWc.unit,
        remarksText: newWc.remarks || '',
        photos: newWc.photos
      });

      supabase.from('daily_logs').insert({
        id: newWcId,
        project_id: dbSiteId,
        title: newWc.activityName,
        description: logDescription,
        log_type: 'work',
        status: 'Pending Inspection'
      }).then();

      const remarksJson = JSON.stringify({
        contractorName: newQcr.contractorName,
        priority: newQcr.priority,
        location: newQcr.location,
        remarksText: '',
        assignedEngineer: newQcr.assignedEngineer,
        submittedDate: newQcr.submittedDate,
        scheduledDate: newQcr.scheduledDate,
        requestedBy: newQcr.requestedBy,
        activityName: newQcr.activityName,
        completionId: newQcr.completionId
      });

      supabase.from('qc_inspections').insert({
        id: newQcrId,
        project_id: dbSiteId,
        status: 'Submitted',
        remarks: remarksJson
      }).then();

      syncCheckpointsToSupabase(newQcrId, newQcr.checklist.checkpoints);
    }

    showQcAlert(`Work completion ${newWcId} recorded and QC Request ${newQcrId} generated!`);
  };

  const handleAssignQCRequest = (requestId: string) => {
    const assignedEng = assigneeMap[requestId];
    const schedDate = scheduleDateMap[requestId];

    if (!assignedEng || assignedEng === '-- Unassigned --') {
      showQcAlert('Please select a valid QC Engineer for assignment.', 'error');
      return;
    }

    setQcRequests(prev => prev.map(req => {
      if (req.id === requestId) {
        const updatedReq = {
          ...req,
          assignedEngineer: assignedEng,
          scheduledDate: schedDate || new Date().toISOString().split('T')[0],
          status: 'Pending QC Inspection'
        };
        
        syncQcRequestToSupabase(updatedReq);
        return updatedReq;
      }
      return req;
    }));

    showQcAlert(`Assigned ${requestId} to ${assignedEng} scheduled for ${schedDate || 'today'}.`);
  };

  const handleSetQcCheckpointResult = (requestId: string, checkpointIndex: number, result: 'Pass' | 'Fail' | 'NA') => {
    setQcRequests(prev => prev.map(req => {
      if (req.id === requestId) {
        const updatedCheckpoints = [...req.checklist.checkpoints];
        updatedCheckpoints[checkpointIndex] = {
          ...updatedCheckpoints[checkpointIndex],
          result,
          observation: result === 'Pass' ? 'Verified by inspection' : result === 'Fail' ? 'Defect identified' : ''
        };
        syncCheckpointsToSupabase(req.id, updatedCheckpoints);
        return {
          ...req,
          checklist: {
            ...req.checklist,
            checkpoints: updatedCheckpoints
          }
        };
      }
      return req;
    }));
  };

  const handleEditCheckpointObservation = (requestId: string, checkpointIndex: number, text: string) => {
    setQcRequests(prev => prev.map(req => {
      if (req.id === requestId) {
        const updatedCheckpoints = [...req.checklist.checkpoints];
        updatedCheckpoints[checkpointIndex] = {
          ...updatedCheckpoints[checkpointIndex],
          observation: text
        };
        syncCheckpointsToSupabase(req.id, updatedCheckpoints);
        return {
          ...req,
          checklist: {
            ...req.checklist,
            checkpoints: updatedCheckpoints
          }
        };
      }
      return req;
    }));
  };

  const syncTemplateItemsToSupabase = async (templateId: string, checkpoints: string[]) => {
    const isSimulation = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project');
    if (isSimulation) return;
    try {
      await supabase
        .from('qc_checklist_template_items')
        .delete()
        .eq('template_id', templateId);

      const itemsToInsert = checkpoints.map((pt, idx) => ({
        template_id: templateId,
        text: pt,
        sequence_no: idx
      }));

      await supabase
        .from('qc_checklist_template_items')
        .insert(itemsToInsert);
    } catch (err) {
      console.error("Failed to sync template items to Supabase:", err);
    }
  };

  const handleUpdateTemplateCheckpoint = (templateId: string, idx: number, newText: string) => {
    setQcTemplates(prev => prev.map(tmpl => {
      if (tmpl.id === templateId) {
        const updated = [...tmpl.checkpoints];
        updated[idx] = newText;
        syncTemplateItemsToSupabase(templateId, updated);
        return { ...tmpl, checkpoints: updated };
      }
      return tmpl;
    }));
  };

  const handleRemoveTemplateCheckpoint = (templateId: string, idx: number) => {
    setQcTemplates(prev => prev.map(tmpl => {
      if (tmpl.id === templateId) {
        const updated = tmpl.checkpoints.filter((_: any, i: number) => i !== idx);
        syncTemplateItemsToSupabase(templateId, updated);
        return { ...tmpl, checkpoints: updated };
      }
      return tmpl;
    }));
  };

  const handleAddTemplateCheckpoint = (templateId: string, text: string) => {
    if (!text.trim()) return;
    setQcTemplates(prev => prev.map(tmpl => {
      if (tmpl.id === templateId) {
        const updated = [...tmpl.checkpoints, text.trim()];
        syncTemplateItemsToSupabase(templateId, updated);
        return { ...tmpl, checkpoints: updated };
      }
      return tmpl;
    }));
  };

  const handlePhotoUpload = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        setAttachedPhotos(prev => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleToggleQcCheckpoint = (requestId: string, checkpointIndex: number) => {
    setQcRequests(prev => prev.map(req => {
      if (req.id === requestId) {
        const updatedCheckpoints = [...req.checklist.checkpoints];
        const currentResult = updatedCheckpoints[checkpointIndex].result;
        const nextResult = currentResult === 'Pending' ? 'Pass' : currentResult === 'Pass' ? 'Fail' : currentResult === 'Fail' ? 'NA' : 'Pending';
        updatedCheckpoints[checkpointIndex] = {
          ...updatedCheckpoints[checkpointIndex],
          result: nextResult,
          observation: nextResult === 'Pass' ? 'Verified by inspection' : nextResult === 'Fail' ? 'Defect identified' : ''
        };

        syncCheckpointsToSupabase(req.id, updatedCheckpoints);
        return {
          ...req,
          checklist: {
            ...req.checklist,
            checkpoints: updatedCheckpoints
          }
        };
      }
      return req;
    }));
  };

  const handleEditCheckpointText = (requestId: string, checkpointIndex: number, newText: string) => {
    setQcRequests(prev => prev.map(req => {
      if (req.id === requestId) {
        const updatedCheckpoints = [...req.checklist.checkpoints];
        updatedCheckpoints[checkpointIndex] = {
          ...updatedCheckpoints[checkpointIndex],
          checkpoint: newText
        };

        syncCheckpointsToSupabase(req.id, updatedCheckpoints);
        return {
          ...req,
          checklist: {
            ...req.checklist,
            checkpoints: updatedCheckpoints
          }
        };
      }
      return req;
    }));
  };

  const handleAddCheckpoint = (requestId: string) => {
    if (!newCheckpointText.trim()) return;
    setQcRequests(prev => prev.map(req => {
      if (req.id === requestId) {
        const updatedCheckpoints = [
          ...req.checklist.checkpoints,
          { checkpoint: newCheckpointText, result: 'Pending', observation: '' }
        ];

        syncCheckpointsToSupabase(req.id, updatedCheckpoints);
        return {
          ...req,
          checklist: {
            ...req.checklist,
            checkpoints: updatedCheckpoints
          }
        };
      }
      return req;
    }));
    setNewCheckpointText('');
    showQcAlert('New checklist point added to inspection!');
  };

  const handleApplyTemplateToRequest = (requestId: string, templateId: string) => {
    const template = qcTemplates.find(t => t.id === templateId);
    if (!template) return;

    const newCheckpoints = template.checkpoints.map((pt: string) => ({
      checkpoint: pt,
      result: 'Pending',
      observation: ''
    }));

    setQcRequests(prev => prev.map(req => {
      if (req.id === requestId) {
        return {
          ...req,
          checklist: {
            ...req.checklist,
            title: template.title,
            checkpoints: newCheckpoints
          }
        };
      }
      return req;
    }));

    showQcAlert(`Applied "${template.title}" checklist to request ${requestId}!`);
  };

  const handleCreateNewTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTemplateTitle.trim() || !newTemplatePoints.trim()) return;

    const pointsArr = newTemplatePoints.split('\n').map(p => p.trim()).filter(Boolean);
    const newTemplateId = `tmpl-${Date.now()}`;
    const newTemplate = {
      id: newTemplateId,
      category: 'General',
      title: newTemplateTitle,
      checkpoints: pointsArr
    };

    setQcTemplates(prev => [...prev, newTemplate]);
    setNewTemplateTitle('');
    setNewTemplatePoints('');

    const isSimulation = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project');
    if (!isSimulation) {
      try {
        await supabase
          .from('qc_checklist_templates')
          .insert({
            id: newTemplateId,
            title: newTemplate.title,
            category: newTemplate.category,
          });

        const itemsToInsert = pointsArr.map((pt, idx) => ({
          template_id: newTemplateId,
          text: pt,
          sequence_no: idx
        }));

        await supabase
          .from('qc_checklist_template_items')
          .insert(itemsToInsert);
      } catch (err) {
        console.error("Failed to sync new template to Supabase:", err);
      }
    }

    showQcAlert(`New checklist template "${newTemplate.title}" created successfully!`);
  };

  const handleLLMVisionAudit = (requestId: string) => {
    const req = qcRequests.find(r => r.id === requestId);
    if (!req) return;

    setAiAuditingId(requestId);

    setTimeout(() => {
      const isMasonry = req.activityName.toLowerCase().includes('masonry') || req.activityName.toLowerCase().includes('toilet');
      
      const updatedCheckpoints = req.checklist.checkpoints.map((cp: any, idx: number) => {
        const shouldFail = isMasonry && idx === 1; 
        return {
          ...cp,
          result: shouldFail ? 'Fail' : 'Pass',
          observation: shouldFail 
            ? 'AI Vision Audit: Identified 12mm mortar void in vertical joint at grid A3' 
            : `AI Vision Audit: Verified '${cp.checkpoint}' matches standard tolerances (95% confidence)`
        };
      });

      // Update QC Request
      setQcRequests(prev => prev.map(r => {
        if (r.id === requestId) {
          return {
            ...r,
            status: isMasonry ? 'Failed' : 'Approved',
            approvedBy: isMasonry ? undefined : 'AI Vision Engine',
            approvedAt: isMasonry ? undefined : new Date().toLocaleString(),
            rejectedBy: isMasonry ? 'AI Vision Engine' : undefined,
            rejectedAt: isMasonry ? new Date().toLocaleString() : undefined,
            checklist: {
              ...r.checklist,
              checkpoints: updatedCheckpoints
            }
          };
        }
        return r;
      }));

      // Update corresponding work completion
      setWorkCompletions(prev => prev.map(w => w.id === req.completionId ? { ...w, status: isMasonry ? 'Failed' : 'Approved' } : w));

      if (isMasonry) {
        // Auto-create a Rework item
        const newRwId = `RW-${Date.now().toString().slice(-4)}`;
        const newRework = {
          id: newRwId,
          qcRef: requestId,
          activityName: req.activityName,
          category: req.category || 'General',
          issueDescription: 'AI Vision Audit Failure: Joint mortar gap & 12mm mortar void detected. Re-alignment and re-filling needed.',
          location: req.location,
          responsiblePerson: `${req.contractorName} (Contractor)`,
          targetDate: new Date(Date.now() + 3*24*60*60*1000).toISOString().split('T')[0], // 3 days from now
          status: 'Assigned',
          correctionPhotos: [],
          remarks: 'Logged automatically by AI Vision Audit inspection failure.'
        };
        setReworkItems(prev => [newRework, ...prev]);
        showQcAlert(`AI Vision Audit complete. Verdict: ⚠️ FAIL. QC Inspection rejected, Rework task ${newRwId} raised automatically.`, 'error');
      } else {
        // Auto-approve and add to measurement verification
        const existsInMeas = measurementVerifications.some(m => m.activityName === req.activityName);
        if (!existsInMeas) {
          const completionObj = workCompletions.find(w => w.id === req.completionId);
          const newMeas = {
            id: `MV-${Date.now().toString().slice(-4)}`,
            activityName: req.activityName,
            boqItem: completionObj?.boqItem || 'BOQ-General',
            plannedQty: completionObj?.plannedQty || 100,
            completedQty: completionObj?.completedQty || 100,
            verifiedQty: 0,
            measurementDate: '',
            measurementSheet: '',
            status: 'Pending Verification'
          };
          setMeasurementVerifications(prev => [...prev, newMeas]);
        }
        showQcAlert(`AI Vision Audit complete. Verdict: ✅ PASS. QC Inspection Approved and cleared for billing.`, 'success');
      }

      setAiAuditingId(null);
    }, 2000);
  };

  const handleUpdateWcQuantity = (wcId: string) => {
    setWorkCompletions(prev => prev.map(w => w.id === wcId ? { ...w, completedQty: editQtyValue } : w));
    // Also update associated measurement verifications completedQty
    setMeasurementVerifications(prev => prev.map(m => {
      const wcObj = workCompletions.find(w => w.id === wcId);
      if (wcObj && m.activityName === wcObj.activityName) {
        return { ...m, completedQty: editQtyValue };
      }
      return m;
    }));
    setEditWcId(null);
    showQcAlert(`Successfully updated completed quantity for ${wcId} to ${editQtyValue}`);
  };

  const handleQuickApproveQCRequest = (requestId: string) => {
    const req = qcRequests.find(r => r.id === requestId);
    if (!req) return;

    // First mark all checkpoints as Pass
    const updatedCheckpoints = req.checklist.checkpoints.map((cp: any) => ({
      ...cp,
      result: cp.result === 'Pending' ? 'Pass' : cp.result,
      observation: cp.result === 'Pending' ? 'Quick approved via dashboard' : cp.observation
    }));

    const updatedReq = { 
      ...req, 
      status: 'Approved',
      approvedBy: currentUser.name || 'QC Engineer',
      approvedAt: new Date().toLocaleString(),
      checklist: {
        ...req.checklist,
        checkpoints: updatedCheckpoints
      }
    };

    // Approve the request
    setQcRequests(prev => prev.map(r => r.id === requestId ? updatedReq : r));
    // Set corresponding work completion to Approved
    setWorkCompletions(prev => prev.map(w => w.id === req.completionId ? { ...w, status: 'Approved' } : w));

    // Also add to Measurement Verifications automatically if approved
    const existsInMeas = measurementVerifications.some(m => m.activityName === req.activityName);
    if (!existsInMeas) {
      const completionObj = workCompletions.find(w => w.id === req.completionId);
      const newMeas = {
        id: `MV-${Date.now().toString().slice(-4)}`,
        activityName: req.activityName,
        boqItem: completionObj?.boqItem || 'BOQ-General',
        plannedQty: completionObj?.plannedQty || 100,
        completedQty: completionObj?.completedQty || 100,
        verifiedQty: 0,
        measurementDate: '',
        measurementSheet: '',
        status: 'Pending Verification'
      };
      setMeasurementVerifications(prev => [...prev, newMeas]);
    }

    // Sync to Supabase
    syncQcRequestToSupabase(updatedReq);
    syncCheckpointsToSupabase(requestId, updatedCheckpoints);
    syncWorkCompletionStatus(req.completionId, 'Approved');

    showQcAlert(`QC Request ${requestId} has been QUICK APPROVED. Activity cleared for billing.`);
  };

  const handleCancelQCRequest = (requestId: string) => {
    const req = qcRequests.find(r => r.id === requestId);
    if (!req) return;

    const updatedReq = { 
      ...req, 
      status: 'Cancelled',
      rejectedBy: currentUser.name || 'QC Engineer',
      rejectedAt: new Date().toLocaleString()
    };

    setQcRequests(prev => prev.map(r => r.id === requestId ? updatedReq : r));
    setWorkCompletions(prev => prev.map(w => w.id === req.completionId ? { ...w, status: 'Cancelled' } : w));

    // Sync to Supabase
    syncQcRequestToSupabase(updatedReq);
    syncWorkCompletionStatus(req.completionId, 'Cancelled');

    showQcAlert(`QC Request ${requestId} has been CANCELLED.`, 'info');
  };

  const handleApproveQCRequest = (requestId: string) => {
    const req = qcRequests.find(r => r.id === requestId);
    if (!req) return;

    // Check if any checklists are still pending
    const hasPending = req.checklist.checkpoints.some((c: any) => c.result === 'Pending');
    if (hasPending) {
      showQcAlert('Cannot approve: Checklist items are still pending verification.', 'error');
      return;
    }

    // Check if failed checkpoints exist
    const hasFailed = req.checklist.checkpoints.some((c: any) => c.result === 'Fail');
    if (hasFailed) {
      showQcAlert('Cannot approve: Checklist contains failed points. Please reject and initiate rework.', 'error');
      return;
    }

    const updatedReq = { 
      ...req, 
      status: 'Approved',
      approvedBy: currentUser.name || 'QC Engineer',
      approvedAt: new Date().toLocaleString()
    };

    // Set request status to Approved
    setQcRequests(prev => prev.map(r => r.id === requestId ? updatedReq : r));
    // Set corresponding work completion to Approved
    setWorkCompletions(prev => prev.map(w => w.id === req.completionId ? { ...w, status: 'Approved' } : w));

    // Also add to Measurement Verifications automatically if approved
    const existsInMeas = measurementVerifications.some(m => m.activityName === req.activityName);
    if (!existsInMeas) {
      const completionObj = workCompletions.find(w => w.id === req.completionId);
      const newMeas = {
        id: `MV-${Date.now().toString().slice(-4)}`,
        activityName: req.activityName,
        boqItem: completionObj?.boqItem || 'BOQ-General',
        plannedQty: completionObj?.plannedQty || 100,
        completedQty: completionObj?.completedQty || 100,
        verifiedQty: 0,
        measurementDate: '',
        measurementSheet: '',
        status: 'Pending Verification'
      };
      setMeasurementVerifications(prev => [...prev, newMeas]);
    }

    // Sync to Supabase
    syncQcRequestToSupabase(updatedReq);
    syncWorkCompletionStatus(req.completionId, 'Approved');

    showQcAlert(`QC Request ${requestId} has been APPROVED. Activity cleared for billing check.`);
  };

  const handleRejectQCRequest = (e: React.FormEvent, requestId: string) => {
    e.preventDefault();
    const req = qcRequests.find(r => r.id === requestId);
    if (!req) return;

    if (!reworkTargetDate || !reworkDesc) {
      showQcAlert('Please provide rework target date and description.', 'error');
      return;
    }

    const updatedReq = { 
      ...req, 
      status: 'Failed',
      rejectedBy: currentUser.name || 'QC Engineer',
      rejectedAt: new Date().toLocaleString()
    };

    // Set request status to Failed
    setQcRequests(prev => prev.map(r => r.id === requestId ? updatedReq : r));
    // Set corresponding work completion to Failed
    setWorkCompletions(prev => prev.map(w => w.id === req.completionId ? { ...w, status: 'Failed' } : w));

    // Add rework item
    const newRwId = `RW-${Date.now().toString().slice(-4)}`;
    const newRework = {
      id: newRwId,
      qcRef: requestId,
      activityName: req.activityName,
      category: req.category || 'General',
      issueDescription: reworkDesc,
      location: req.location,
      responsiblePerson: `${req.contractorName} (Contractor)`,
      targetDate: reworkTargetDate,
      status: 'Assigned' as const,
      correctionPhotos: [],
      remarks: 'QC inspection failed. Rectification required.'
    };

    setReworkItems(prev => [...prev, newRework]);

    // Sync to Supabase
    syncQcRequestToSupabase(updatedReq);
    syncWorkCompletionStatus(req.completionId, 'Failed');
    createReworkTaskInSupabase(newRework);

    // Reset forms
    setShowReworkFormForId(null);
    setReworkTargetDate('');
    setReworkDesc('');

    showQcAlert(`QC Request ${requestId} REJECTED. Rework case ${newRwId} raised.`, 'info');
  };

  const handleSubmitInspectionResults = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inspectingReqId) return;
    const req = qcRequests.find(r => r.id === inspectingReqId);
    if (!req) return;

    // Check if any checklists are still pending
    const hasPending = req.checklist.checkpoints.some((c: any) => c.result === 'Pending');
    if (hasPending) {
      showQcAlert('Cannot submit: Checklist items are still pending verification.', 'error');
      return;
    }

    const hasFailed = req.checklist.checkpoints.some((c: any) => c.result === 'Fail');
    if (hasFailed) {
      if (!reworkTargetDate || !reworkDesc) {
        showQcAlert('Please provide rework target date and instructions for the failed checkpoints.', 'error');
        return;
      }
      
      const updatedReq = { 
        ...req, 
        status: 'Failed',
        rejectedBy: currentUser.name || 'QC Engineer',
        rejectedAt: new Date().toLocaleString(),
        photos: [...(req.photos || []), ...attachedPhotos]
      };

      // Set request status to Failed
      setQcRequests(prev => prev.map(r => r.id === inspectingReqId ? updatedReq : r));
      // Set corresponding work completion to Failed
      setWorkCompletions(prev => prev.map(w => w.id === req.completionId ? { ...w, status: 'Failed', photos: [...(w.photos || []), ...attachedPhotos] } : w));

      // Add rework item
      const newRwId = `RW-${Date.now().toString().slice(-4)}`;
      const newRework = {
        id: newRwId,
        qcRef: inspectingReqId,
        activityName: req.activityName,
        category: req.category || 'General',
        issueDescription: reworkDesc,
        location: req.location,
        responsiblePerson: `${req.contractorName} (Contractor)`,
        targetDate: reworkTargetDate,
        status: 'Assigned' as const,
        correctionPhotos: [],
        remarks: 'QC inspection failed. Rectification required.'
      };

      setReworkItems(prev => [...prev, newRework]);

      // Sync to Supabase
      syncQcRequestToSupabase(updatedReq);
      syncWorkCompletionStatus(req.completionId, 'Failed');
      createReworkTaskInSupabase(newRework);

      // Reset states
      setInspectingReqId(null);
      setAttachedPhotos([]);
      setReworkTargetDate('');
      setReworkDesc('');

      showQcAlert(`QC Request ${req.id} REJECTED. Rework case ${newRwId} raised.`, 'info');
    } else {
      // Approve flow
      const updatedReq = { 
        ...req, 
        status: 'Approved',
        approvedBy: currentUser.name || 'QC Engineer',
        approvedAt: new Date().toLocaleString(),
        photos: [...(req.photos || []), ...attachedPhotos]
      };

      // Set request status to Approved
      setQcRequests(prev => prev.map(r => r.id === inspectingReqId ? updatedReq : r));
      // Set corresponding work completion to Approved
      setWorkCompletions(prev => prev.map(w => w.id === req.completionId ? { ...w, status: 'Approved', photos: [...(w.photos || []), ...attachedPhotos] } : w));

      // Add to Measurement Verifications automatically if approved
      const existsInMeas = measurementVerifications.some(m => m.activityName === req.activityName);
      if (!existsInMeas) {
        const completionObj = workCompletions.find(w => w.id === req.completionId);
        const newMeas = {
          id: `MV-${Date.now().toString().slice(-4)}`,
          activityName: req.activityName,
          boqItem: completionObj?.boqItem || 'BOQ-General',
          plannedQty: completionObj?.plannedQty || 100,
          completedQty: completionObj?.completedQty || 100,
          verifiedQty: 0,
          measurementDate: '',
          measurementSheet: '',
          status: 'Pending Verification'
        };
        setMeasurementVerifications(prev => [...prev, newMeas]);
      }

      // Sync to Supabase
      syncQcRequestToSupabase(updatedReq);
      syncWorkCompletionStatus(req.completionId, 'Approved');

      // Reset states
      setInspectingReqId(null);
      setAttachedPhotos([]);

      showQcAlert(`QC Request ${req.id} has been APPROVED. Activity cleared for billing check.`);
    }
  };

  const handleMarkReworkCorrected = (reworkId: string) => {
    let correctedRw: any = null;
    setReworkItems(prev => prev.map(rw => {
      if (rw.id === reworkId) {
        correctedRw = {
          ...rw,
          status: 'Corrected' as const,
          remarks: 'Contractor reports work corrected. Uploaded proof photos. Awaiting reinspection.'
        };
        return correctedRw;
      }
      return rw;
    }));

    if (correctedRw) {
      updateReworkTaskInSupabase(correctedRw);
    }

    showQcAlert(`Rework ${reworkId} marked as corrected. Notified QC Engineer for reinspection.`);
  };

  const handleMarkReworkReinspected = (reworkId: string) => {
    const rw = reworkItems.find(r => r.id === reworkId);
    if (!rw) return;

    const closedRw = { ...rw, status: 'Closed' as const };

    // Set Rework status to Closed
    setReworkItems(prev => prev.map(r => r.id === reworkId ? closedRw : r));

    // Update rework task in Supabase
    updateReworkTaskInSupabase(closedRw);

    // Also auto-approve original request and work completion
    setQcRequests(prev => prev.map(req => {
      if (req.id === rw.qcRef) {
        // Mark all checkpoints as Pass
        const updatedCheckpoints = req.checklist.checkpoints.map((cp: any) => ({
          ...cp,
          result: 'Pass',
          observation: 'Verified passed on reinspection'
        }));
        const updatedReq = {
          ...req,
          status: 'Approved',
          approvedBy: currentUser.name || 'QC Engineer',
          approvedAt: new Date().toLocaleString(),
          checklist: {
            ...req.checklist,
            checkpoints: updatedCheckpoints
          }
        };
        // Sync checkpoints and req to Supabase
        syncQcRequestToSupabase(updatedReq);
        syncCheckpointsToSupabase(req.id, updatedCheckpoints);
        return updatedReq;
      }
      return req;
    }));

    const originalReq = qcRequests.find(req => req.id === rw.qcRef);
    if (originalReq) {
      setWorkCompletions(prev => prev.map(w => w.id === originalReq.completionId ? { ...w, status: 'Approved' } : w));
      syncWorkCompletionStatus(originalReq.completionId, 'Approved');
      
      // Add to measurement verification if approved
      const existsInMeas = measurementVerifications.some(m => m.activityName === originalReq.activityName);
      if (!existsInMeas) {
        const completionObj = workCompletions.find(w => w.id === originalReq.completionId);
        const newMeas = {
          id: `MV-${Date.now().toString().slice(-4)}`,
          activityName: originalReq.activityName,
          boqItem: completionObj?.boqItem || 'BOQ-General',
          plannedQty: completionObj?.plannedQty || 100,
          completedQty: completionObj?.completedQty || 100,
          verifiedQty: 0,
          measurementDate: '',
          measurementSheet: '',
          status: 'Pending Verification'
        };
        setMeasurementVerifications(prev => [...prev, newMeas]);
      }
    }

    showQcAlert(`Rework ${reworkId} verified passed and closed. Syncing to billing clearance!`, 'success');
  };

  const handleReinspectRework = (reworkId: string) => {
    const rw = reworkItems.find(r => r.id === reworkId);
    if (!rw) return;

    const closedRw = { ...rw, status: 'Closed' as const };

    // Mark Rework status as Closed
    setReworkItems(prev => prev.map(r => r.id === reworkId ? closedRw : r));

    // Update rework task in Supabase
    updateReworkTaskInSupabase(closedRw);

    // Reset checkpoints in original request back to Pending, and change status back to Submitted
    setQcRequests(prev => prev.map(req => {
      if (req.id === rw.qcRef) {
        const resetCheckpoints = req.checklist.checkpoints.map((c: any) => ({
          ...c,
          result: c.result === 'Fail' ? 'Pending' : c.result, // reset fails to pending
          observation: ''
        }));
        const updatedReq = {
          ...req,
          status: 'Pending QC Inspection',
          checklist: {
            ...req.checklist,
            checkpoints: resetCheckpoints
          }
        };
        syncQcRequestToSupabase(updatedReq);
        syncCheckpointsToSupabase(req.id, resetCheckpoints);
        return updatedReq;
      }
      return req;
    }));

    // Also update corresponding completion status back to Pending Inspection
    const originalReq = qcRequests.find(req => req.id === rw.qcRef);
    if (originalReq) {
      setWorkCompletions(prev => prev.map(w => w.id === originalReq.completionId ? { ...w, status: 'Pending Inspection' } : w));
      syncWorkCompletionStatus(originalReq.completionId, 'Pending Inspection');
    }

    // Go to inspections tab and select the original request
    setSelectedQcRequestId(rw.qcRef);
    setQcSubTab('inspections');

    showQcAlert(`Reinspection scheduled for ${rw.qcRef}. Checklist reset for testing.`);
  };

  // HTML5 Drag and Drop event handlers
  const handleDragStart = (e: React.DragEvent, reworkId: string) => {
    e.dataTransfer.setData('text/plain', reworkId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDropOnColumn = (e: React.DragEvent, targetStatus: 'Assigned' | 'Corrected' | 'Closed') => {
    e.preventDefault();
    const reworkId = e.dataTransfer.getData('text/plain');
    if (!reworkId) return;

    const rw = reworkItems.find(r => r.id === reworkId);
    if (!rw) return;

    if (rw.status === targetStatus) return; // no status change

    if (targetStatus === 'Assigned') {
      const updatedRw = { ...rw, status: 'Assigned' as const, remarks: 'Moved back to correction status' };
      setReworkItems(prev => prev.map(r => r.id === reworkId ? updatedRw : r));
      updateReworkTaskInSupabase(updatedRw);
      showQcAlert(`Rework ${reworkId} status reset to Contractor Correcting.`, 'info');
    } else if (targetStatus === 'Corrected') {
      handleMarkReworkCorrected(reworkId);
    } else if (targetStatus === 'Closed') {
      handleMarkReworkReinspected(reworkId);
    }
  };

  const handleApproveMeasurement = (mvId: string) => {
    const qty = measVerifiedQty[mvId];
    const sheet = measSheetName[mvId];

    if (!qty || qty <= 0) {
      showQcAlert('Please enter a valid verified quantity.', 'error');
      return;
    }

    setMeasurementVerifications(prev => prev.map(mv => {
      if (mv.id === mvId) {
        return {
          ...mv,
          verifiedQty: parseFloat(qty.toString()),
          measurementSheet: sheet || 'Site_Measurement_Log.xlsx',
          measurementDate: new Date().toISOString().split('T')[0],
          status: 'Approved'
        };
      }
      return mv;
    }));

    showQcAlert(`Measurement sheet approved for ${mvId}. Quantity certified.`);
  };

  // Toggle audit status helper
  const handleAuditToggle = (auditId: string) => {
    setAudits(audits.map(audit => {
      if (audit.id === auditId) {
        const nextStatus = audit.status === 'PASSED' ? 'FAILED' : audit.status === 'FAILED' ? 'PENDING' : 'PASSED';
        return { ...audit, status: nextStatus };
      }
      return audit;
    }));
  };

  // Start checklist run from template
  const handleDashboardChecklistStart = async (title: string, items: string[]) => {
    if (!project) return;
    const checklistId = crypto.randomUUID();
    const dbSiteId = getDbSiteId(project.id);
    const isSimulation = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project');

    const newChecklist = {
      id: checklistId,
      projectId: project.id,
      title,
      createdAt: new Date().toISOString()
    };

    const newItems = items.map((itemText, idx) => {
      const itemId = crypto.randomUUID();
      return {
        id: itemId,
        checklistId,
        text: JSON.stringify({ description: itemText, status: 'Pending', note: '' }),
        done: false,
        createdAt: new Date(Date.now() + idx).toISOString()
      };
    });

    setDbChecklists(prev => [newChecklist, ...prev]);
    setDbChecklistItems(prev => [...prev, ...newItems]);
    setExpandedChecklistId(checklistId);

    if (!isSimulation) {
      try {
        const { error: cError } = await supabase
          .from('checklists')
          .insert({ id: checklistId, project_id: dbSiteId, title });

        if (cError) throw cError;

        const { error: itemsError } = await supabase
          .from('checklist_items')
          .insert(newItems.map(item => ({
            id: item.id,
            checklist_id: item.checklistId,
            text: item.text,
            done: item.done
          })));

        if (itemsError) throw itemsError;
      } catch (err) {
        console.error('Failed to create checklist in Supabase:', err);
      }
    }
  };

  const handlePublishDynamicChecklist = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dynamicTitle || !dynamicPoints.trim()) {
      showQcAlert('Please fill in both checklist title and points.', 'error');
      return;
    }
    const pointsList = dynamicPoints
      .split('\n')
      .map(p => p.trim())
      .filter(p => p.length > 0);

    if (pointsList.length === 0) {
      showQcAlert('Please enter at least one checklist checkpoint point.', 'error');
      return;
    }

    handleDashboardChecklistStart(dynamicTitle, pointsList);
    setDynamicTitle('');
    setDynamicPoints('');
  };

  // Toggle item response status from dashboard
  const handleDashboardItemToggle = async (itemId: string, currentText: string, currentDone: boolean) => {
    let parsed = { description: currentText, status: 'Pending', note: '' };
    try {
      if (currentText.startsWith('{')) {
        parsed = JSON.parse(currentText);
      }
    } catch (e) {}

    const statuses: ('Pending' | 'Pass' | 'Fail' | 'NA')[] = ['Pending', 'Pass', 'Fail', 'NA'];
    const nextIdx = (statuses.indexOf(parsed.status as any) + 1) % statuses.length;
    const nextStatus = statuses[nextIdx];
    const nextDone = nextStatus !== 'Pending';

    const updatedText = JSON.stringify({
      ...parsed,
      status: nextStatus
    });

    setDbChecklistItems(prev => prev.map(i => i.id === itemId ? { ...i, text: updatedText, done: nextDone } : i));

    const isSimulation = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project');
    if (!isSimulation) {
      try {
        await supabase
          .from('checklist_items')
          .update({ text: updatedText, done: nextDone })
          .eq('id', itemId);
      } catch (err) {
        console.error('Failed to update checklist item status in Supabase:', err);
      }
    }
  };

  // Change item note from dashboard
  const handleDashboardItemNoteChange = async (itemId: string, currentText: string, note: string) => {
    let parsed = { description: currentText, status: 'Pending', note: '' };
    try {
      if (currentText.startsWith('{')) {
        parsed = JSON.parse(currentText);
      }
    } catch (e) {}

    const updatedText = JSON.stringify({
      ...parsed,
      note
    });

    setDbChecklistItems(prev => prev.map(i => i.id === itemId ? { ...i, text: updatedText } : i));

    const isSimulation = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project');
    if (!isSimulation) {
      try {
        await supabase
          .from('checklist_items')
          .update({ text: updatedText })
          .eq('id', itemId);
      } catch (err) {
        console.error('Failed to update checklist item note in Supabase:', err);
      }
    }
  };

  // Delete checklist run from dashboard
  const handleDashboardChecklistDelete = async (checklistId: string) => {
    if (!confirm('Are you sure you want to delete this checklist? This cannot be undone.')) return;

    setDbChecklists(prev => prev.filter(c => c.id !== checklistId));
    setDbChecklistItems(prev => prev.filter(i => i.checklistId !== checklistId));
    if (expandedChecklistId === checklistId) setExpandedChecklistId(null);

    const isSimulation = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project');
    if (!isSimulation) {
      try {
        await supabase
          .from('checklists')
          .delete()
          .eq('id', checklistId);
      } catch (err) {
        console.error('Failed to delete checklist from Supabase:', err);
      }
    }
  };

  // Reject / Delete PR
  const handleDashboardDeletePR = async (materialId: string) => {
    if (!confirm('Are you sure you want to reject and delete this purchase request?')) return;
    const isSimulation = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project');

    if (isSimulation) {
      useAppStore.setState(state => ({
        projects: state.projects.map(proj => {
          if (proj.id !== project!.id) return proj;
          return {
            ...proj,
            materials: proj.materials.filter(m => m.id !== materialId)
          };
        })
      }));
      return;
    }

    try {
      const { error } = await supabase
        .from('materials')
        .delete()
        .eq('id', materialId);
      if (error) throw error;
    } catch (err) {
      console.error('Failed to delete PR from Supabase:', err);
    }
  };

  // Advance PR stage from dashboard
  const handleDashboardAdvancePR = async (materialId: string, currentName: string, nextStage: 'Approved' | 'PO Raised' | 'Delivered', quantity: number, unit: string) => {
    let details = { materialName: currentName, stage: 'Submitted', requiredDate: '', vendor: '' };
    try {
      if (currentName.startsWith('{')) {
        details = JSON.parse(currentName);
      }
    } catch (e) {}

    const isSimulation = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project');

    if (nextStage === 'Delivered') {
      // Transition to in-stock
      if (isSimulation) {
        useAppStore.setState(state => ({
          projects: state.projects.map(proj => {
            if (proj.id !== project!.id) return proj;
            return {
              ...proj,
              materials: proj.materials.map(m => m.id === materialId ? {
                ...m,
                status: 'in-stock',
                itemName: details.materialName
              } : m)
            };
          })
        }));
        return;
      }

      try {
        const { error } = await supabase
          .from('materials')
          .update({ status: 'in-stock', item_name: details.materialName })
          .eq('id', materialId);
        if (error) throw error;
      } catch (err) {
        console.error('Failed to mark PR as delivered in Supabase:', err);
      }
    } else {
      // Update stage inside name JSON
      const updatedDetails = {
        ...details,
        stage: nextStage
      };
      const serializedName = JSON.stringify(updatedDetails);

      if (isSimulation) {
        useAppStore.setState(state => ({
          projects: state.projects.map(proj => {
            if (proj.id !== project!.id) return proj;
            return {
              ...proj,
              materials: proj.materials.map(m => m.id === materialId ? {
                ...m,
                itemName: serializedName,
                supplierName: details.vendor || null,
              } : m)
            };
          })
        }));
        return;
      }

      try {
        const { error } = await supabase
          .from('materials')
          .update({ item_name: serializedName })
          .eq('id', materialId);
        if (error) throw error;
      } catch (err) {
        console.error('Failed to advance PR stage in Supabase:', err);
      }
    }
  };

  // Document upload handler
  const handleDocUpload = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDocName) return;
    const newDoc = {
      id: `doc-${Date.now()}`,
      projectId: project!.id,
      name: newDocName,
      category: newDocCategory,
      version: newDocVersion || 'V1.0.0',
      url: '#',
      uploadDate: new Date().toISOString().split('T')[0],
      status: 'PENDING' as const
    };
    setLocalDocs([newDoc, ...localDocs]);
    setNewDocName('');
    setNewDocVersion('V1.0.0');
  };

  // Equipment log hours & fuel handler
  const handleLogEquipment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!logEquipId || (!logHours && !logFuel)) return;
    setLocalEquip(localEquip.map(eq => {
      if (eq.id === logEquipId) {
        return {
          ...eq,
          usageHours: eq.usageHours + Number(logHours || 0),
          fuelConsumed: eq.fuelConsumed + Number(logFuel || 0)
        };
      }
      return eq;
    }));
    setLogHours('');
    setLogFuel('');
  };


  // Project phases array
  const phases = ['Planning', 'Design', 'Approval', 'Procurement', 'Execution', 'Testing', 'Handover', 'Completion'];

  const projectModules: { id: ProjectTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'project-management', label: 'Project Management', icon: Building2 },
    { id: 'procurement', label: 'Procurement', icon: ShoppingCart },
    { id: 'inventory', label: 'Inventory', icon: PackageOpen },
    { id: 'quality-control', label: 'Quality Control', icon: ShieldCheck },
    { id: 'site-operations', label: 'Site Operations', icon: Wrench },
    { id: 'budget', label: 'Budget', icon: Coins },
    { id: 'billing', label: 'Billing', icon: FileSpreadsheet },
    { id: 'tasks', label: 'Tasks', icon: ListTodo },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'inbox', label: 'Inbox', icon: MessageSquare },
    { id: 'vendor-management', label: 'Vendor Scorecard', icon: Award },
    { id: 'document-control', label: 'Document Control', icon: FileText },
    { id: 'equipment-tracking', label: 'Equipment Fleet', icon: Truck },
  ];
  const unreadNotificationCount = notifications.filter((notification) => !notification.read).length;
  const whatsappChats = project!.chats.filter((chat) => {
    const senderRole = chat.senderRole.toUpperCase();
    if (chatChannel === 'client') {
      return senderRole.includes('CLIENT') || senderRole.includes('DIRECTOR') || senderRole.includes('CLIENT GROUP');
    }
    if (chatChannel === 'vendors') {
      return senderRole.includes('STORE') || senderRole.includes('FINANCE') || senderRole.includes('SUPPLY LINE');
    }
    return !senderRole.includes('CLIENT') && !senderRole.includes('SUPPLY LINE') && !senderRole.includes('CLIENT GROUP');
  });
  const isLegacyCommunicationModuleEnabled = false;

  return (
    <div className="w-full p-2 sm:p-3 lg:p-4 max-w-[1920px] mx-auto space-y-5 min-h-screen pb-24 md:pb-6">
      {/* New Top Navbar */}
      <div className="flex items-center justify-between bg-white/70 dark:bg-gray-900/70 backdrop-blur-xl border border-gray-200/50 dark:border-gray-800/50 p-2 sm:p-3 rounded-xl shadow-sm mb-4 relative z-50 sticky top-2">
        {/* Left: Exit Button, Menu Toggle, Brand Logo & Name */}
        <div className="flex items-center gap-2 sm:gap-4 pl-1 sm:pl-2">
          <Link href="/projects" className="w-11 h-11 flex items-center justify-center rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-all text-gray-600 dark:text-gray-300 shadow-sm group" title="Back to Projects">
            <ArrowLeft className="w-5 h-5 transition-transform group-hover:-translate-x-0.5" />
          </Link>
          <button onClick={() => setIsMobileMenuOpen(true)} className="md:hidden w-11 h-11 flex items-center justify-center rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 shadow-sm transition-all">
            <Menu className="w-5 h-5" />
          </button>
          <div className="w-[1px] h-6 bg-gray-200 dark:bg-gray-800 mx-1 hidden sm:block"></div>
          <svg className="w-8 h-8 text-[#b68d40] drop-shadow-md hidden sm:block" viewBox="30 1 36 29" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path className="fill-[#b68d40]" d="M52.13,17.62v2.6s7.81,1.18,9,9.31h4.34a4.39,4.39,0,0,1-1.9-2.21C63,25.74,60.25,18.65,52.13,17.62ZM34.47,3.9H44.72V14.23C37.23,14.15,34.62,13.2,34.47,3.9ZM30,1.38A5.14,5.14,0,0,1,32,5.24v.63c.71,9.31,4.65,10.57,12.7,10.65V27.16h-.08s-.4,2.21-1.58,2.37h4.18V1.38H30ZM43.53,17.62v2.6s-7.8,1.18-8.91,9.31H30.29a4.07,4.07,0,0,0,1.81-2.21C32.65,25.74,35.49,18.65,43.53,17.62ZM51,14.23V3.9H61.28C61,13.2,58.44,14.15,51,14.23ZM63.8,1.38H48.5V29.53h4.1C51.5,29.37,51,27.16,51,27.16h0V16.52c8-0.08,12-1.34,12.61-10.65a1.71,1.71,0,0,0,.08-.63,4.93,4.93,0,0,1,2-3.86Z"/>
          </svg>
          <span className="font-bold text-base hidden lg:block text-gray-900 dark:text-white">Pramukh <span className="font-normal text-gray-400">| {project!.name}</span></span>
        </div>

        {/* Center: Categorized Pills Navigation */}
        <div className="hidden md:flex items-center gap-1.5">
          {/* Overview */}
          <button
            onClick={() => setActiveTab('project-management')}
            className={`px-4 lg:px-5 py-2.5 rounded-full text-[13px] font-bold transition-all duration-300 ${activeTab === 'project-management' ? 'bg-[#b68d40] text-white shadow-sm shadow-[#b68d40]/20' : 'text-gray-600 dark:text-gray-400 hover:text-[#b68d40] dark:hover:text-[#b68d40] hover:bg-gray-100 dark:hover:bg-gray-800'}`}
          >
            Overview
          </button>

          {/* Inbox */}
          <button
            onClick={() => setActiveTab('inbox')}
            className={`px-4 lg:px-5 py-2.5 rounded-full text-[13px] font-bold flex items-center gap-1.5 transition-all duration-300 ${activeTab === 'inbox' ? 'bg-[#b68d40] text-white shadow-sm shadow-[#b68d40]/20' : 'text-gray-600 dark:text-gray-400 hover:text-[#b68d40] dark:hover:text-[#b68d40] hover:bg-gray-100 dark:hover:bg-gray-800'}`}
          >
            <MessageSquare className="w-3.5 h-3.5" /> Inbox
          </button>

          {/* Operations Dropdown */}
          <div className="relative group">
            <button className={`px-4 lg:px-5 py-2.5 rounded-full text-[13px] font-bold flex items-center gap-1.5 transition-all duration-300 ${['site-operations', 'quality-control', 'tasks', 'equipment-tracking'].includes(activeTab) ? 'bg-[#b68d40] text-white shadow-sm shadow-[#b68d40]/20' : 'text-gray-600 dark:text-gray-400 hover:text-[#b68d40] dark:hover:text-[#b68d40] hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
              Operations <ChevronDown className="w-3.5 h-3.5" />
            </button>
            <div className="absolute top-full left-0 mt-2 w-48 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 py-2">
              {projectModules.filter(m => ['site-operations', 'quality-control', 'tasks', 'equipment-tracking'].includes(m.id)).map(module => {
                const Icon = module.icon;
                const isItemActive = activeTab === module.id;
                return (
                  <button key={module.id} onClick={() => setActiveTab(module.id)} className={`w-full flex items-center gap-3 px-4 py-2.5 text-[13px] text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${isItemActive ? 'text-[#b68d40] bg-[#b68d40]/5 font-bold' : 'text-gray-700 dark:text-gray-300'}`}>
                    <Icon className="w-4 h-4" /> {module.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Supply Chain Dropdown */}
          <div className="relative group">
            <button className={`px-4 lg:px-5 py-2.5 rounded-full text-[13px] font-bold flex items-center gap-1.5 transition-all duration-300 ${['procurement', 'inventory', 'vendor-management'].includes(activeTab) ? 'bg-[#b68d40] text-white shadow-sm shadow-[#b68d40]/20' : 'text-gray-600 dark:text-gray-400 hover:text-[#b68d40] dark:hover:text-[#b68d40] hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
              Supply Chain <ChevronDown className="w-3.5 h-3.5" />
            </button>
            <div className="absolute top-full left-0 mt-2 w-48 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 py-2">
              {projectModules.filter(m => ['procurement', 'inventory', 'vendor-management'].includes(m.id)).map(module => {
                const Icon = module.icon;
                const isItemActive = activeTab === module.id;
                return (
                  <button key={module.id} onClick={() => setActiveTab(module.id)} className={`w-full flex items-center gap-3 px-4 py-2.5 text-[13px] text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${isItemActive ? 'text-[#b68d40] bg-[#b68d40]/5 font-bold' : 'text-gray-700 dark:text-gray-300'}`}>
                    <Icon className="w-4 h-4" /> {module.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Standalone Documents tab */}
          <button
            onClick={() => setActiveTab('document-control')}
            className={`px-4 lg:px-5 py-2.5 rounded-full text-[13px] font-bold flex items-center gap-1.5 transition-all duration-300 ${activeTab === 'document-control' ? 'bg-[#b68d40] text-white shadow-sm shadow-[#b68d40]/20' : 'text-gray-600 dark:text-gray-400 hover:text-[#b68d40] dark:hover:text-[#b68d40] hover:bg-gray-100 dark:hover:bg-gray-800'}`}
          >
            <FileText className="w-3.5 h-3.5" /> Documents
          </button>

          {/* Financials Dropdown */}
          <div className="relative group">
            <button className={`px-4 lg:px-5 py-2.5 rounded-full text-[13px] font-bold flex items-center gap-1.5 transition-all duration-300 ${['budget', 'billing', 'analytics'].includes(activeTab) ? 'bg-[#b68d40] text-white shadow-sm shadow-[#b68d40]/20' : 'text-gray-600 dark:text-gray-400 hover:text-[#b68d40] dark:hover:text-[#b68d40] hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
              Financials <ChevronDown className="w-3.5 h-3.5" />
            </button>
            <div className="absolute top-full left-0 mt-2 w-48 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 py-2">
              {projectModules.filter(m => ['budget', 'billing', 'analytics'].includes(m.id)).map(module => {
                const Icon = module.icon;
                const isItemActive = activeTab === module.id;
                return (
                  <button key={module.id} onClick={() => setActiveTab(module.id)} className={`w-full flex items-center gap-3 px-4 py-2.5 text-[13px] text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${isItemActive ? 'text-[#b68d40] bg-[#b68d40]/5 font-bold' : 'text-gray-700 dark:text-gray-300'}`}>
                    <Icon className="w-4 h-4" /> {module.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Right: Utils */}
        <div className="flex items-center gap-2 pr-1">
          <button className="w-11 h-11 flex items-center justify-center rounded-full bg-gray-50 dark:bg-gray-800/80 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-300 shadow-sm border border-gray-100 dark:border-gray-800">
            <Search className="w-5 h-5" />
          </button>
          
          <div ref={notificationMenuRef} className="relative">
            <button 
              className="w-11 h-11 flex items-center justify-center rounded-full bg-gray-50 dark:bg-gray-800/80 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-300 shadow-sm border border-gray-100 dark:border-gray-800" 
              onClick={() => setIsNotificationOpen(!isNotificationOpen)}
            >
              <Bell className="w-5 h-5" />
              {unreadNotificationCount > 0 && <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-red-500 rounded-full border border-white dark:border-gray-900"></span>}
            </button>
            {isNotificationOpen && (
              <div className="absolute right-0 top-12 z-50 w-72 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl shadow-xl overflow-hidden">
                 <div className="p-3 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
                   <span className="text-xs font-bold text-gray-900 dark:text-white">Notifications</span>
                   <span className="text-xs text-gray-500">{unreadNotificationCount} unread</span>
                 </div>
                 <div className="max-h-60 overflow-y-auto p-1">
                   {notifications.length === 0 ? (
                     <div className="p-3 text-center text-xs text-gray-500">No new notifications</div>
                   ) : (
                     notifications.map(n => (
                       <div key={n.id} onClick={() => markNotificationRead(n.id)} className="p-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg cursor-pointer">
                         <div className="text-xs font-bold text-gray-800 dark:text-gray-200">{n.title}</div>
                         <div className="text-[10px] text-gray-500 line-clamp-1 mt-0.5">{n.message}</div>
                       </div>
                     ))
                   )}

                     {/* ➕ Work Completion Entry Form */}
                     <div className="bg-white dark:bg-gray-900 p-4 rounded-2xl border border-border/60 shadow-sm space-y-4 text-left">
                       <div className="border-b border-border/60 pb-3">
                         <h4 className="font-heading font-black text-foreground text-xs uppercase tracking-wider flex items-center gap-1.5">
                           ➕ Log New Work Completion &amp; Generate QC Request
                         </h4>
                         <p className="text-[11px] text-muted-foreground mt-0.5 font-medium">
                           Record completed site work. Automatically generates a linked QC inspection request with category-specific checkpoints.
                         </p>
                       </div>
                       <form onSubmit={handleWorkCompletionSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                         <label className="block space-y-1 text-[10px]">
                           <span className="font-bold text-muted-foreground uppercase tracking-wider">QC Category *</span>
                           <select
                             value={wcCategory}
                             onChange={e => setWcCategory(e.target.value)}
                             className="w-full p-2 rounded-lg border border-border bg-background text-foreground font-semibold text-xs outline-none focus:border-[#b68d40] cursor-pointer"
                           >
                             <option value="qc-concrete">🏗️ Concrete Casting</option>
                             <option value="qc-masonry">🧱 Masonry &amp; Plastering</option>
                             <option value="qc-plumbing">🚿 Plumbing &amp; Sanitary</option>
                             <option value="qc-electrical">⚡ Electrical Installation</option>
                           </select>
                           {wcCategory && (
                             <p className="text-[9px] text-[#b68d40] font-semibold pt-0.5">
                               ✓ {(qcTemplates.find(t => t.id === wcCategory)?.checkpoints?.length ?? 0)} checkpoints will be auto-loaded
                             </p>
                           )}
                         </label>
                         <label className="block space-y-1 text-[10px]">
                           <span className="font-bold text-muted-foreground uppercase tracking-wider">Activity Name *</span>
                           <input type="text" value={wcActivityName} onChange={e => setWcActivityName(e.target.value)}
                             placeholder="e.g. RCC Slab Casting Tower A L7"
                             className="w-full p-2 rounded-lg border border-border bg-background text-foreground font-semibold text-xs outline-none focus:border-[#b68d40]" required />
                         </label>
                         <label className="block space-y-1 text-[10px]">
                           <span className="font-bold text-muted-foreground uppercase tracking-wider">Contractor Name *</span>
                           <input type="text" value={wcContractorName} onChange={e => setWcContractorName(e.target.value)}
                             placeholder="e.g. Pragati Builders Pvt Ltd"
                             className="w-full p-2 rounded-lg border border-border bg-background text-foreground font-semibold text-xs outline-none focus:border-[#b68d40]" required />
                         </label>
                         <label className="block space-y-1 text-[10px]">
                           <span className="font-bold text-muted-foreground uppercase tracking-wider">Block / Zone</span>
                           <select value={wcBlock} onChange={e => setWcBlock(e.target.value)}
                             className="w-full p-2 rounded-lg border border-border bg-background text-foreground font-semibold text-xs outline-none focus:border-[#b68d40] cursor-pointer">
                             <option value="Tower A">Tower A</option>
                             <option value="Tower B">Tower B</option>
                             <option value="Tower C">Tower C</option>
                             <option value="Podium">Podium</option>
                             <option value="Basement">Basement</option>
                           </select>
                         </label>
                         <label className="block space-y-1 text-[10px]">
                           <span className="font-bold text-muted-foreground uppercase tracking-wider">Floor / Level</span>
                           <input type="text" value={wcFloor} onChange={e => setWcFloor(e.target.value)}
                             placeholder="e.g. L7 Slab, Ground Floor"
                             className="w-full p-2 rounded-lg border border-border bg-background text-foreground font-semibold text-xs outline-none focus:border-[#b68d40]" />
                         </label>
                         <label className="block space-y-1 text-[10px]">
                           <span className="font-bold text-muted-foreground uppercase tracking-wider">BOQ Reference</span>
                           <input type="text" value={wcBoqItem} onChange={e => setWcBoqItem(e.target.value)}
                             placeholder="e.g. BOQ-012 (M30 Concrete)"
                             className="w-full p-2 rounded-lg border border-border bg-background text-foreground font-semibold text-xs outline-none focus:border-[#b68d40]" />
                         </label>
                         <label className="block space-y-1 text-[10px]">
                           <span className="font-bold text-muted-foreground uppercase tracking-wider">Completed Qty *</span>
                           <input type="number" value={wcCompletedQty || ''} onChange={e => setWcCompletedQty(parseFloat(e.target.value) || 0)}
                             placeholder="e.g. 180" min={0}
                             className="w-full p-2 rounded-lg border border-border bg-background text-foreground font-semibold text-xs outline-none focus:border-[#b68d40]" required />
                         </label>
                         <label className="block space-y-1 text-[10px]">
                           <span className="font-bold text-muted-foreground uppercase tracking-wider">Planned Qty</span>
                           <input type="number" value={wcPlannedQty || ''} onChange={e => setWcPlannedQty(parseFloat(e.target.value) || 0)}
                             placeholder="e.g. 200" min={0}
                             className="w-full p-2 rounded-lg border border-border bg-background text-foreground font-semibold text-xs outline-none focus:border-[#b68d40]" />
                         </label>
                         <label className="block space-y-1 text-[10px]">
                           <span className="font-bold text-muted-foreground uppercase tracking-wider">Unit</span>
                           <select value={wcUnit} onChange={e => setWcUnit(e.target.value)}
                             className="w-full p-2 rounded-lg border border-border bg-background text-foreground font-semibold text-xs outline-none focus:border-[#b68d40] cursor-pointer">
                             <option value="Sqft">Sqft</option>
                             <option value="Sqm">Sqm</option>
                             <option value="Cum">Cum (m³)</option>
                             <option value="Rmt">Rmt (m)</option>
                             <option value="Nos">Nos</option>
                             <option value="MT">MT (Tonnes)</option>
                             <option value="Kg">Kg</option>
                           </select>
                         </label>
                         <label className="block space-y-1 text-[10px] sm:col-span-2 lg:col-span-3">
                           <span className="font-bold text-muted-foreground uppercase tracking-wider">Site Remarks</span>
                           <input type="text" value={wcRemarks} onChange={e => setWcRemarks(e.target.value)}
                             placeholder="Brief notes about work conditions, issues, or observations..."
                             className="w-full p-2 rounded-lg border border-border bg-background text-foreground font-semibold text-xs outline-none focus:border-[#b68d40]" />
                         </label>
                         <div className="sm:col-span-2 lg:col-span-3 flex items-center gap-3 pt-1">
                           <button type="submit"
                             className="px-6 py-2.5 bg-[#b68d40] hover:bg-[#967332] text-white text-[10px] font-extrabold uppercase tracking-wider rounded-lg cursor-pointer transition-all shadow-sm">
                             ➕ Submit &amp; Generate QC Inspection Request
                           </button>
                           <span className="text-[10px] text-muted-foreground">
                             Auto-populates <span className="font-bold text-foreground">{qcTemplates.find(t => t.id === wcCategory)?.checkpoints?.length ?? 0}</span> checkpoints
                             from <span className="font-bold text-[#b68d40]">{qcTemplates.find(t => t.id === wcCategory)?.category ?? ''}</span>
                           </span>
                         </div>
                       </form>
                     </div>
                 </div>
              </div>
            )}
          </div>
          
          <button className="w-11 h-11 items-center justify-center rounded-full bg-gray-50 dark:bg-gray-800/80 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-300 shadow-sm border border-gray-100 dark:border-gray-800 hidden sm:flex">
            <Settings className="w-5 h-5" />
          </button>
          
          <div className="flex items-center gap-1.5 ml-1 sm:ml-2">
            {(() => {
              const initials = currentUser.name
                ? currentUser.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
                : 'SU';
              return (
                <div className="w-11 h-11 flex items-center justify-center rounded-full bg-primary/10 text-primary border border-primary/20 text-xs font-extrabold font-heading select-none">
                  {initials}
                </div>
              );
            })()}
            <button
              onClick={() => router.push('/login')}
              title="Sign Out"
              className="w-11 h-11 flex items-center justify-center rounded-full bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 text-red-500 border border-red-100 dark:border-red-500/20 transition-colors shadow-sm"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Tab Switcher (Horizontal scroll) - Visible on mobile/tablet under md breakpoint */}
      <div className="flex md:hidden items-center gap-2 overflow-x-auto pb-2 w-full sticky top-16 bg-background/95 backdrop-blur-sm z-30 px-1 pt-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {projectModules.map((module) => {
          const Icon = module.icon;
          const isActive = activeTab === module.id;
          return (
            <button
              key={module.id}
              onClick={() => setActiveTab(module.id)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-300 ${
                isActive
                  ? 'bg-black text-white dark:bg-white dark:text-black shadow-sm'
                  : 'bg-card text-muted-foreground hover:text-foreground border border-border/80'
              }`}
            >
              <Icon className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{module.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Panels with Framer Motion */}
      <div className="min-h-[400px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.15 }}
          >
            {/* 0. DASHBOARD BENTO GRID */}
            {false && activeTab === 'dashboard' && (
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 sm:gap-4">
                
                {/* Top Row: Quick Stats & Hero Image */}
                <div className="md:col-span-12 lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                   {/* Stat 1: Budget Utilized */}
                   <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border border-gray-100 dark:border-gray-800 p-3 rounded-xl shadow-sm flex flex-col justify-between">
                     <p className="text-gray-500 dark:text-gray-400 text-xs font-medium">Budget Utilized</p>
                     <div className="mt-3">
                       <p className="font-heading text-3xl font-light text-gray-900 dark:text-white mb-4 tracking-tight">{((project!.actualSpend / project!.budget) * 100).toFixed(1)}<span className="text-lg">%</span></p>
                       <div className="w-full h-4 bg-gray-900 dark:bg-white rounded-full"></div>
                     </div>
                   </div>
                   
                   {/* Stat 2: Ledger Spend */}
                   <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border border-gray-100 dark:border-gray-800 p-3 rounded-xl shadow-sm flex flex-col justify-between">
                     <p className="text-gray-500 dark:text-gray-400 text-xs font-medium">Ledger Spend</p>
                     <div className="mt-3">
                       <p className="font-heading text-3xl font-light text-gray-900 dark:text-white mb-4 tracking-tight"><span className="text-lg font-medium text-gray-400">$</span> {formatCurrency(project!.actualSpend).replace('INR ', '')}</p>
                       <div className="w-full h-4 bg-[#f8e9d3] rounded-full flex overflow-hidden gap-1">
                          <div className="w-[75%] h-full bg-[#dfb768] rounded-full"></div>
                          <div className="flex-1 h-full rounded-full flex gap-1">
                            <div className="w-2 h-full bg-[#dfb768] rounded-full opacity-50"></div>
                            <div className="w-2 h-full bg-[#dfb768] rounded-full opacity-30"></div>
                            <div className="w-2 h-full bg-[#dfb768] rounded-full opacity-10"></div>
                          </div>
                       </div>
                     </div>
                   </div>

                   {/* Below Stats: Spend & Tasks */}
                   <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                     <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border border-gray-100 dark:border-gray-800 p-3 rounded-xl shadow-sm">
                        <div className="flex justify-between items-start">
                          <p className="text-gray-800 dark:text-gray-200 font-medium">Total Spend</p>
                          <button className="w-8 h-8 rounded-full border border-gray-200 dark:border-gray-700 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-800"><ArrowUpRight className="w-4 h-4 text-gray-400" /></button>
                        </div>
                        <div className="mt-6 flex justify-between items-end">
                          <div>
                            <p className="font-heading text-2xl font-light text-gray-900 dark:text-white tracking-tight"><span className="text-base text-gray-400">$</span> {(project!.actualSpend * 0.12).toFixed(2)}L</p>
                            <p className="text-xs text-gray-400 mt-1">This month</p>
                          </div>
                          <div className="flex items-end gap-1 h-10 opacity-60">
                             <div className="w-1.5 h-full bg-gray-900 dark:bg-white rounded-full"></div>
                             <div className="w-1.5 h-4 bg-gray-400 rounded-full"></div>
                             <div className="w-1.5 h-6 bg-gray-900 dark:bg-white rounded-full"></div>
                             <div className="w-1.5 h-3 bg-gray-400 rounded-full"></div>
                             <div className="w-1.5 h-8 bg-gray-900 dark:bg-white rounded-full"></div>
                             <div className="w-1.5 h-5 bg-gray-400 rounded-full"></div>
                          </div>
                        </div>
                     </div>

                     <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border border-gray-100 dark:border-gray-800 p-3 rounded-xl shadow-sm">
                        <div className="flex justify-between items-start">
                          <p className="text-gray-800 dark:text-gray-200 font-medium">Tasks Completed</p>
                          <button className="w-8 h-8 rounded-full border border-gray-200 dark:border-gray-700 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-800"><ArrowUpRight className="w-4 h-4 text-gray-400" /></button>
                        </div>
                        <div className="mt-6 flex justify-between items-end">
                          <div>
                            <p className="font-heading text-2xl font-light text-gray-900 dark:text-white tracking-tight">{project!.tasks.filter(t => t.progress === 100).length || 12}</p>
                            <p className="text-xs text-gray-400 mt-1">This month</p>
                          </div>
                          <div className="flex items-end gap-1 h-10 opacity-60">
                             <div className="w-1.5 h-4 bg-gray-900 dark:bg-white rounded-full"></div>
                             <div className="w-1.5 h-8 bg-gray-400 rounded-full"></div>
                             <div className="w-1.5 h-3 bg-gray-900 dark:bg-white rounded-full"></div>
                             <div className="w-1.5 h-6 bg-gray-400 rounded-full"></div>
                             <div className="w-1.5 h-7 bg-gray-900 dark:bg-white rounded-full"></div>
                          </div>
                        </div>
                     </div>
                   </div>

                   {/* Cost Breakdown Chart */}
                   <div className="sm:col-span-2 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border border-gray-100 dark:border-gray-800 p-3 rounded-xl shadow-sm">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                           <p className="text-gray-800 dark:text-gray-200 font-medium">Cost Breakdown</p>
                           <p className="font-heading text-2xl font-light text-gray-900 dark:text-white mt-3 tracking-tight"><span className="text-base text-gray-400">$</span> {formatCurrency(project!.budget).replace('INR ', '')}</p>
                           <p className="text-xs text-gray-400 mt-1">Total Budget</p>
                        </div>
                        <button className="px-3 py-2 rounded-full border border-gray-200 dark:border-gray-700 text-xs flex items-center gap-2 font-medium hover:bg-gray-50 dark:hover:bg-gray-800">Daily <ChevronDown className="w-3 h-3" /></button>
                      </div>
                      <div className="space-y-4 pt-2">
                        {[
                          { label: 'Materials', value: 45, width: 'w-[45%]' },
                          { label: 'Labor', value: 30, width: 'w-[30%]' },
                          { label: 'Equipment', value: 15, width: 'w-[15%]' },
                          { label: 'Overhead', value: 10, width: 'w-[10%]' },
                        ].map((item, i) => (
                           <div key={item.label} className="flex items-center gap-3 text-xs text-gray-500">
                             <div className="w-16 text-gray-600 dark:text-gray-400 font-medium">{item.label}</div>
                             <div className="flex-1 relative h-6">
                               <div className="absolute inset-0 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden flex items-center pr-2">
                                 <div className={`h-full bg-gray-900 dark:bg-white ${item.width} rounded-full`}></div>
                               </div>
                               <div className={`absolute top-0 bottom-0 left-[calc(${item.value}%-20px)] bg-black text-white px-3 rounded-full text-[10px] font-bold flex items-center`}>+{item.value}%</div>
                             </div>
                           </div>
                        ))}
                        <div className="flex justify-between text-[10px] text-gray-400 pt-3 px-16 border-t border-gray-100 dark:border-gray-800">
                           <span>00</span><span>10</span><span>20</span><span>30</span><span>40</span><span>50</span><span>60</span>
                        </div>
                      </div>
                   </div>
                </div>

                {/* Top Right: Hero Image & Object List */}
                <div className="md:col-span-12 lg:col-span-4 grid grid-cols-1 gap-3 sm:gap-4">
                   {/* Hero Image */}
                   <div className="relative overflow-hidden rounded-xl shadow-sm aspect-[4/3] group bg-white">
                      <div className="absolute inset-0 z-0 bg-gray-100">
                         <img src={project!.image} alt="Project" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                      </div>
                   </div>

                   {/* Site Updates (Property Object styled) */}
                   <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border border-gray-100 dark:border-gray-800 p-3 rounded-xl shadow-sm flex flex-col h-full">
                      <div className="flex justify-between items-center mb-3">
                        <p className="text-gray-800 dark:text-gray-200 font-medium">Recent Site Photos</p>
                        <button className="w-8 h-8 rounded-full border border-gray-200 dark:border-gray-700 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-800"><Search className="w-4 h-4 text-gray-400" /></button>
                      </div>
                      <div className="grid grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-3 flex-1">
                         {[1, 2, 3].map((i) => (
                            <div key={i} className="rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden bg-white dark:bg-gray-900 group shadow-sm pb-1">
                               <div className="relative aspect-[3/4] overflow-hidden m-2 rounded-lg">
                                  <img src={project!.image} alt="Site" className="w-full h-full object-cover opacity-80 group-hover:scale-110 transition-transform duration-500" />
                                  <div className="absolute top-2 right-2 flex gap-1">
                                     <div className="w-6 h-6 bg-white/90 rounded-full flex items-center justify-center shadow-sm"><CheckCircle2 className="w-3 h-3 text-gray-900" /></div>
                                     <div className="w-6 h-6 bg-black/90 text-white rounded-full flex items-center justify-center shadow-sm"><ArrowUpRight className="w-3 h-3" /></div>
                                  </div>
                               </div>
                               <div className="px-3 pb-2 pt-1">
                                  <p className="text-[10px] font-bold text-[#b68d40] mb-0.5">• {i === 1 ? 'Excavation' : i === 2 ? 'Foundation' : 'Structure'}</p>
                                  <p className="text-xs font-semibold text-gray-900 dark:text-white line-clamp-1">{project!.name}</p>
                                  <div className="flex justify-between mt-2 pt-2 border-t border-gray-100 dark:border-gray-800 text-[10px] text-gray-500">
                                     <span>{project!.location.split(',')[0]}</span>
                                  </div>
                               </div>
                            </div>
                         ))}
                      </div>
                   </div>
                </div>

                {/* Bottom Wide Row: Modules Table & Map */}
                <div className="md:col-span-12 grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4 mt-2">
                   {/* Table / List */}
                   <div className="lg:col-span-8 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border border-gray-100 dark:border-gray-800 p-3 rounded-xl shadow-sm overflow-hidden">
                      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                         <div className="flex gap-2">
                           {['Type', 'Status', 'Cost'].map(filter => (
                             <button key={filter} className="px-3 py-2 rounded-full border border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-600 flex items-center gap-1.5 hover:bg-gray-50 dark:hover:bg-gray-800">
                                <ListTodo className="w-3.5 h-3.5 text-gray-400" /> {filter} <ChevronDown className="w-3 h-3" />
                             </button>
                           ))}
                         </div>
                         <div className="flex items-center gap-2">
                           <div className="relative">
                             <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                             <input type="text" placeholder="Search..." className="w-48 pl-9 pr-4 py-2 rounded-full border border-gray-200 dark:border-gray-700 text-xs bg-white dark:bg-gray-900 focus:outline-none" />
                           </div>
                           <button className="w-9 h-9 rounded-full border border-gray-200 dark:border-gray-700 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-800">
                              <Settings className="w-4 h-4 text-gray-600" />
                           </button>
                         </div>
                      </div>

                      {/* Desktop Table View */}
                      <div className="overflow-x-auto hidden md:block">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="text-xs text-gray-400 border-b border-gray-100 dark:border-gray-800">
                              <th className="pb-3 font-medium">Task Name</th>
                              <th className="pb-3 font-medium">Type</th>
                              <th className="pb-3 font-medium">Assignee</th>
                              <th className="pb-3 font-medium">Cost / Value</th>
                              <th className="pb-3 font-medium">Status</th>
                              <th className="pb-3 font-medium text-right">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(project!.tasks.length > 0 ? project!.tasks.slice(0, 4) : [
                               { id: '1', name: 'Site Clearing', startDate: 'Oct 1', endDate: 'Oct 5', assigneeName: 'John Doe', progress: 100 },
                               { id: '2', name: 'Foundation Prep', startDate: 'Oct 6', endDate: 'Oct 12', assigneeName: 'Jane Smith', progress: 40 },
                            ]).map((task, i) => (
                              <tr key={task.id} className="text-xs border-b border-gray-50 dark:border-gray-800/50 last:border-0 hover:bg-gray-50/50 dark:hover:bg-gray-800/20 transition-colors">
                                <td className="py-2.5">
                                  <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0 shadow-sm border border-gray-200/50 dark:border-gray-700/50">
                                       <img src={project!.image} alt="Task" className="w-full h-full object-cover opacity-80" />
                                    </div>
                                    <div>
                                      <p className="font-semibold text-gray-900 dark:text-white">{task.name}</p>
                                      <p className="text-[11px] text-gray-500 mt-0.5 font-medium">{task.startDate} - {task.endDate}</p>
                                    </div>
                                  </div>
                                </td>
                                <td className="py-2.5 text-gray-600 dark:text-gray-400 font-medium">Construction</td>
                                <td className="py-2.5 text-gray-900 dark:text-white font-medium">{task.assigneeName}</td>
                                <td className="py-2.5 font-medium"><span className="text-gray-400">$</span> 12,450</td>
                                <td className="py-2.5">
                                  <span className={`px-3 py-1 rounded-full text-[11px] font-bold ${task.progress === 100 ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}>
                                    {task.progress === 100 ? 'Completed' : 'Active'}
                                  </span>
                                </td>
                                <td className="py-2.5 text-right">
                                   <button className="text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"><Settings className="w-4 h-4 inline" /></button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Mobile Card View */}
                      <div className="flex flex-col gap-3 md:hidden">
                        {(project!.tasks.length > 0 ? project!.tasks.slice(0, 4) : [
                           { id: '1', name: 'Site Clearing', startDate: 'Oct 1', endDate: 'Oct 5', assigneeName: 'John Doe', progress: 100 },
                           { id: '2', name: 'Foundation Prep', startDate: 'Oct 6', endDate: 'Oct 12', assigneeName: 'Jane Smith', progress: 40 },
                        ]).map((task, i) => (
                          <div key={task.id} className="p-3 border border-border/50 rounded-xl bg-card hover:bg-muted/50 transition-colors shadow-sm">
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0 shadow-sm border border-gray-200/50 dark:border-gray-700/50">
                                   <img src={project!.image} alt="Task" className="w-full h-full object-cover opacity-80" />
                                </div>
                                <div>
                                  <p className="font-semibold text-sm text-foreground leading-none">{task.name}</p>
                                  <p className="text-[10px] text-muted-foreground mt-1 font-bold">{task.startDate} - {task.endDate}</p>
                                </div>
                              </div>
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest ${task.progress === 100 ? 'bg-emerald-500/10 text-emerald-600' : 'bg-orange-500/10 text-orange-600'}`}>
                                {task.progress === 100 ? 'Done' : 'Active'}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs border-t border-border/40 pt-2">
                              <div>
                                <span className="text-[9px] text-muted-foreground uppercase font-bold tracking-widest block">Assignee</span>
                                <span className="font-medium text-foreground">{task.assigneeName}</span>
                              </div>
                              <div>
                                <span className="text-[9px] text-muted-foreground uppercase font-bold tracking-widest block">Cost</span>
                                <span className="font-medium text-foreground">$12,450</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                   </div>

                   {/* Project Location Map */}
                   <div className="lg:col-span-4 relative rounded-xl overflow-hidden shadow-sm border border-gray-200/50 dark:border-gray-800/50 bg-gray-50 dark:bg-gray-800 min-h-[300px]">
                      <div className="absolute top-5 left-5 right-5 flex justify-between z-10">
                        <span className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-md px-3 py-2 rounded-full text-xs font-bold shadow-sm text-gray-800 dark:text-gray-200">Map View</span>
                        <button className="w-8 h-8 rounded-full bg-white/90 dark:bg-gray-900/90 flex items-center justify-center shadow-sm"><ArrowUpRight className="w-4 h-4 text-gray-600 dark:text-gray-300" /></button>
                      </div>
                      
                      {/* Decorative Map Pattern */}
                      <div className="absolute inset-0 opacity-50 dark:opacity-20" style={{
                         backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M10 10h80v80h-80z' fill='none' stroke='%239ca3af' stroke-width='0.5'/%3E%3Cpath d='M30 10v80M50 10v80M70 10v80M10 30h80M10 50h80M10 70h80' fill='none' stroke='%239ca3af' stroke-width='0.25'/%3E%3C/svg%3E")`,
                         backgroundSize: '40px 40px'
                      }}></div>
                      
                      {/* Map Pin / Radar effect */}
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
                         <div className="w-56 h-56 bg-[#b68d40]/5 rounded-full animate-ping absolute"></div>
                         <div className="w-36 h-36 bg-[#b68d40]/10 rounded-full absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"></div>
                         <div className="w-14 h-14 bg-gradient-to-b from-[#b68d40] to-[#8a6b30] text-white rounded-full flex items-center justify-center shadow-lg relative z-10 border-[3px] border-white dark:border-gray-900">
                           <span className="font-bold text-base">24</span>
                         </div>
                         <div className="mt-3 text-center">
                           <span className="text-xs font-bold text-gray-900 dark:text-white bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm px-3 py-1.5 rounded-lg shadow-sm border border-gray-100 dark:border-gray-800">{project!.name}</span>
                           <p className="text-[10px] text-gray-500 mt-1 font-medium">{project!.location}</p>
                         </div>
                      </div>
                   </div>
                </div>

              </div>
            )}

            {/* 0.5. INBOX MODULE */}
            {activeTab === 'inbox' && (
              <InboxModule project={project} />
            )}

            {/* 1. OVERVIEW & LIFECYCLE TIMELINE */}
            {activeTab === 'project-management' && (
              <div className="space-y-4">

                {/* ─── NEW CUSP LAYOUT: Image (Left) + KPIs (Right) ─── */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
                  
                  {/* LEFT: Feature Image Card */}
                  <div className="lg:col-span-5 rounded-[24px] overflow-hidden relative group min-h-[320px] lg:min-h-[340px] shadow-sm flex flex-col">
                    {project!.galleryImages && project!.galleryImages.length > 0 ? (
                      <ImageSlider
                        images={project!.galleryImages}
                        interval={4500}
                        className="absolute inset-0 h-full w-full transition-transform duration-1000 ease-out group-hover:scale-105"
                      />
                    ) : project!.image ? (
                      <img
                        src={project!.image}
                        alt={project!.name}
                        className="absolute inset-0 h-full w-full object-cover transition-transform duration-1000 ease-out group-hover:scale-105"
                      />
                    ) : (
                      <div className="absolute inset-0 bg-slate-200 dark:bg-slate-800"></div>
                    )}
                    
                    {/* Gradient Overlay for Text Readability */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/40" />

                    {/* Top Status & Weather Overlays */}
                    <div className="absolute top-5 left-5 right-5 flex justify-between items-start z-10">
                      <div className="flex flex-col gap-2">
                        <span className="bg-[#FF7D29] text-white px-3 py-1.5 rounded-full text-[9px] font-bold uppercase tracking-widest shadow-lg self-start">
                          AI OPTIMIZED
                        </span>
                        <span className="bg-white/10 backdrop-blur-md border border-white/20 text-white px-3 py-1.5 rounded-full text-[9px] font-semibold flex items-center gap-1.5">
                          <MapPin className="w-3 h-3" /> {project!.location}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="bg-white/10 backdrop-blur-md border border-white/20 text-white px-3 py-1.5 rounded-full text-[9px] font-semibold flex items-center gap-1.5 hidden sm:flex">
                          <CloudSun className="w-3 h-3 text-[#f4d08b]" /> {projectWeather.temp} | {projectWeather.desc.split(',')[0]}
                        </span>
                        <span className={`px-3 py-1.5 rounded-full text-[9px] font-bold uppercase tracking-widest border backdrop-blur-md ${
                          project!.status === 'Active' ? 'text-emerald-300 bg-black/20 border-emerald-400/30' : 
                          project!.status === 'Delayed' ? 'text-red-300 bg-black/20 border-red-400/30' : 
                          'text-amber-300 bg-black/20 border-amber-400/30'
                        }`}>
                          {project!.status}
                        </span>
                      </div>
                    </div>

                    {/* Bottom Main Info & Glass Panels */}
                    <div className="absolute bottom-5 left-5 right-5 z-10 flex flex-col items-start gap-4">
                      <div className="w-full">
                        <h2 className="text-3xl md:text-4xl font-heading font-black text-white leading-tight drop-shadow-md">
                          {project!.name}
                        </h2>
                        <p className="text-sm text-slate-200 font-medium mt-1">{overviewData.propertyType} • {project!.currentPhase}</p>
                        
                        {/* Project Progress Bar */}
                        <div className="mt-4 bg-white/10 backdrop-blur-md border border-white/20 rounded-xl p-3.5 text-white w-full">
                          <div className="flex justify-between items-end mb-2.5">
                            <span className="text-[10px] uppercase tracking-wider text-slate-300 font-bold">Project Progress</span>
                            <span className="text-lg font-black leading-none">{overviewData.physicalProgress}%</span>
                          </div>
                          <div className="h-2 w-full bg-black/30 rounded-full overflow-hidden backdrop-blur-sm border border-white/5">
                            <div 
                              className="h-full bg-gradient-to-r from-[#FF7D29] to-[#ff9b57] rounded-full shadow-[0_0_10px_rgba(255,125,41,0.4)]" 
                              style={{ width: `${overviewData.physicalProgress}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* RIGHT: KPI Grid Panel */}
                  <div className="lg:col-span-7 bg-card rounded-[24px] border border-border/40 p-5 shadow-sm flex flex-col">
                    <h3 className="text-[11px] font-heading font-black uppercase tracking-widest text-foreground mb-4 flex items-center gap-2">
                      <span className="w-2 h-4 bg-[#FF7D29] rounded-full"></span> Key Metrics
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1 h-full">
                      {[
                        { label: 'Physical Progress', value: `${overviewData.physicalProgress}%`, sub: `Planned ${overviewData.plannedProgress}%`, color: '#FF7D29', bg: 'bg-[#FF7D29]/10', icon: Gauge, spark: [18,22,25,28] },
                        { label: 'Schedule Variance', value: `${overviewData.variance}%`, sub: 'Behind Plan', color: '#ef4444', bg: 'bg-red-500/10', icon: Clock, spark: [-2,-4,-5,-6] },
                        { label: 'Budget Used', value: overviewData.budgetUsed, sub: `of ${overviewData.approvedBudget}`, color: '#3b82f6', bg: 'bg-blue-500/10', icon: Coins, spark: [12,16,20,24] },
                        { label: 'Workforce', value: `${overviewData.workforce}`, sub: `Need ${overviewData.requiredWorkforce}`, color: '#8b5cf6', bg: 'bg-violet-500/10', icon: Users, spark: [200,195,190,186] },
                        { label: 'Pending Approvals', value: `${overviewData.pendingApprovals}`, sub: 'Items awaiting', color: '#f59e0b', bg: 'bg-amber-500/10', icon: ClipboardList, spark: [3,5,6,7] },
                        { label: 'Material Risk', value: `${overviewData.materialRisk}`, sub: 'Critical items', color: '#ef4444', bg: 'bg-red-500/10', icon: PackageOpen, spark: [0,1,1,1] },
                        { label: 'Open Issues', value: `${overviewData.openIssues}`, sub: 'High priority', color: '#f97316', bg: 'bg-orange-500/10', icon: ListTodo, spark: [2,4,3,3] },
                        { label: 'Safe Days', value: `${overviewData.safeDays}`, sub: 'Without incident', color: '#10b981', bg: 'bg-emerald-500/10', icon: ShieldCheck, spark: [140,145,147,148] },
                      ].map((kpi) => {
                        const Icon = kpi.icon;
                        return (
                          <div key={kpi.label} className="group relative bg-muted/30 border border-transparent hover:border-border/60 hover:bg-muted/50 rounded-2xl p-3 flex items-center justify-between transition-all duration-300">
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${kpi.bg}`}>
                                <Icon className="w-4 h-4" style={{ color: kpi.color }} />
                              </div>
                              <div>
                                <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground block leading-tight">{kpi.label}</span>
                                <span className="text-sm font-black text-foreground block leading-none mt-0.5">{kpi.value}</span>
                              </div>
                            </div>
                            <div className="flex flex-col items-end justify-center w-[40px]">
                              <svg width="32" height="12" viewBox="0 0 32 16" className="opacity-60 group-hover:opacity-100 transition-opacity">
                                {kpi.spark.map((v, i, arr) => {
                                  const min = Math.min(...arr), max = Math.max(...arr), range = max - min || 1;
                                  const x = (i / (arr.length - 1)) * 30 + 1;
                                  const y = 15 - ((v - min) / range) * 13;
                                  return i === 0 ? null : (
                                    <line key={i} x1={(((i-1) / (arr.length - 1)) * 30 + 1)} y1={15 - (((arr[i-1] - min) / range) * 13)} x2={x} y2={y} stroke={kpi.color} strokeWidth="2" strokeLinecap="round" />
                                  );
                                })}
                              </svg>
                              <span className="text-[7px] text-muted-foreground font-bold mt-1 text-right leading-tight whitespace-nowrap">{kpi.sub}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* ─── MIDDLE ROW: 3-Col Analytics ─── */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  
                  {/* Col 1: Project Info */}
                  <div className="bg-card rounded-[24px] border border-border/40 shadow-sm p-4 flex flex-col hover:shadow-md transition-all duration-300">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-4 bg-[#FF7D29] rounded-full"></span>
                        <h3 className="font-heading font-black text-[11px] uppercase tracking-widest text-foreground">Project Info</h3>
                      </div>
                      <span className="text-[8px] font-bold text-emerald-600 bg-emerald-500/10 px-2.5 py-1 rounded-full uppercase tracking-wider">Active Portfolio</span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-4 flex-1">
                      {[
                        { l: 'Project', v: project!.name },
                        { l: 'Type', v: overviewData.propertyType },
                        { l: 'Developer', v: overviewData.developer },
                        { l: 'PMC', v: overviewData.pmc },
                        { l: 'Architect', v: overviewData.architect },
                        { l: 'Towers/Units', v: `${overviewData.towers} / ${overviewData.units}` },
                        { l: 'BUA', v: overviewData.builtUpArea },
                        { l: 'RERA', v: overviewData.reraNumber },
                      ].map(f => (
                        <div key={f.l} className="min-w-0">
                          <span className="text-[8px] text-muted-foreground uppercase font-bold tracking-wider block leading-none mb-1">{f.l}</span>
                          <span className="text-[11px] font-extrabold text-foreground truncate block" title={f.v}>{f.v}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Col 2: Progress & Burn */}
                  <div className="bg-card rounded-[24px] border border-border/40 shadow-sm p-4 flex flex-col hover:shadow-md transition-all duration-300">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-4 bg-[#FF7D29] rounded-full"></span>
                        <h3 className="font-heading font-black text-[11px] uppercase tracking-widest text-foreground">Progress & Burn</h3>
                      </div>
                      <span className={`text-[8px] font-bold px-2.5 py-1 rounded-full border uppercase tracking-wider ${overviewData.variance < 0 ? 'text-red-500 bg-red-500/10 border-red-500/20' : 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20'}`}>
                        {overviewData.variance < 0 ? `▼ Delay ${overviewData.variance}%` : `▲ Ahead +${overviewData.variance}%`}
                      </span>
                    </div>
                    
                    <div className="flex flex-col gap-4 flex-1 justify-between">
                      {/* Dual ring */}
                      <div className="flex items-center gap-5 bg-slate-50/50 dark:bg-slate-900/50 p-3 rounded-2xl border border-border/40">
                        <div className="relative w-[75px] h-[75px] flex-shrink-0">
                          <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
                            <circle cx="40" cy="40" r="32" fill="none" stroke="rgba(0,0,0,0.05)" strokeWidth="6" className="dark:stroke-white/5" />
                            <circle cx="40" cy="40" r="32" fill="none" stroke="#94a3b8" strokeWidth="6" strokeDasharray={201.1} strokeDashoffset={201.1 - (201.1 * overviewData.plannedProgress) / 100} strokeLinecap="round" opacity="0.4" />
                            <circle cx="40" cy="40" r="24" fill="none" stroke="rgba(0,0,0,0.04)" strokeWidth="6" className="dark:stroke-white/10" />
                            <circle cx="40" cy="40" r="24" fill="none" stroke="#FF7D29" strokeWidth="6" strokeDasharray={150.8} strokeDashoffset={150.8 - (150.8 * overviewData.physicalProgress) / 100} strokeLinecap="round" />
                          </svg>
                          <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-[13px] font-black text-foreground leading-none">{overviewData.physicalProgress}%</span>
                          </div>
                        </div>
                        <div className="flex flex-col justify-center space-y-2">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-[#FF7D29] flex-shrink-0 shadow-[0_0_8px_rgba(255,125,41,0.5)]"></span>
                              <span className="text-[10px] font-bold text-foreground">Actual: {overviewData.physicalProgress}%</span>
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="w-2 h-2 rounded-full bg-slate-400 flex-shrink-0 opacity-60"></span>
                              <span className="text-[9px] font-bold text-muted-foreground">Planned: {overviewData.plannedProgress}%</span>
                            </div>
                          </div>
                          <div className="pt-1.5 border-t border-border/40">
                            <div className="text-[8px] text-muted-foreground font-bold uppercase tracking-wider">Target ETA</div>
                            <div className="text-[10px] font-black text-foreground mt-0.5">{overviewData.targetCompletion}</div>
                          </div>
                        </div>
                      </div>
                      
                      {/* Budget Burn Area Chart */}
                      <div className="flex-1 flex flex-col">
                        <div className="flex items-center justify-between mb-1.5 px-1">
                          <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-wider">Budget Burn</span>
                          <span className="text-[9px] font-black text-[#FF7D29]">{overviewData.actualSpent}</span>
                        </div>
                        <div className="flex-1 w-full" style={{minHeight:'65px'}}>
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={[{m:'Jan',budget:10,actual:8},{m:'Feb',budget:20,actual:16},{m:'Mar',budget:33,actual:29},{m:'Apr',budget:46,actual:40},{m:'May',budget:60,actual:52},{m:'Jun',budget:75,actual:65}]} margin={{top:2,right:0,left:-32,bottom:0}}>
                              <defs>
                                <linearGradient id="budgetGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#94a3b8" stopOpacity={0.25}/><stop offset="95%" stopColor="#94a3b8" stopOpacity={0}/></linearGradient>
                                <linearGradient id="actualGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#FF7D29" stopOpacity={0.4}/><stop offset="95%" stopColor="#FF7D29" stopOpacity={0}/></linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.04)" className="dark:stroke-white/5" />
                              <XAxis dataKey="m" tick={{fontSize:8, fill:'#94a3b8'}} axisLine={false} tickLine={false} />
                              <YAxis tick={{fontSize:8, fill:'#94a3b8'}} axisLine={false} tickLine={false} />
                              <Tooltip contentStyle={{fontSize:'10px',borderRadius:'12px',padding:'6px 12px',border:'1px solid rgba(0,0,0,0.08)'}} />
                              <Area type="monotone" dataKey="budget" stroke="#94a3b8" strokeWidth={1.5} fill="url(#budgetGrad)" strokeDasharray="3 1" name="Budget" />
                              <Area type="monotone" dataKey="actual" stroke="#FF7D29" strokeWidth={2.5} fill="url(#actualGrad)" name="Actual" />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Col 3: Project Health */}
                  <div className="bg-card rounded-[24px] border border-border/40 shadow-sm p-4 flex flex-col hover:shadow-md transition-all duration-300">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-4 bg-[#FF7D29] rounded-full"></span>
                        <h3 className="font-heading font-black text-[11px] uppercase tracking-widest text-foreground">Project Health</h3>
                      </div>
                      <span className="text-[8px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full uppercase tracking-wider">Score: 82/100</span>
                    </div>
                    
                    <div className="flex flex-col gap-4 flex-1 justify-between">
                      {/* Radial health bars */}
                      <div className="bg-slate-50/50 dark:bg-slate-900/50 rounded-2xl border border-border/40 p-2 flex items-center justify-center" style={{height:'104px'}}>
                        <ResponsiveContainer width="100%" height="100%">
                          <RadialBarChart cx="50%" cy="50%" innerRadius="20%" outerRadius="95%" data={[{name:'Safety',value:98,fill:'#10b981'},{name:'Quality',value:90,fill:'#3b82f6'},{name:'Inventory',value:82,fill:'#f59e0b'},{name:'Schedule',value:72,fill:'#ef4444'},{name:'Budget',value:88,fill:'#FF7D29'}]} startAngle={90} endAngle={-270}>
                            <RadialBar dataKey="value" background={{ fill: 'rgba(0,0,0,0.03)' }} cornerRadius={4} />
                            <Tooltip contentStyle={{fontSize:'10px',borderRadius:'12px',padding:'6px 12px',border:'1px solid rgba(0,0,0,0.08)',boxShadow:'0 4px 6px rgba(0,0,0,0.05)'}} formatter={(v: any) => [`${v}%`]} />
                            <Legend iconSize={6} wrapperStyle={{fontSize:'8px',paddingTop:'4px'}} />
                          </RadialBarChart>
                        </ResponsiveContainer>
                      </div>
                      
                      {/* Weekly Workforce Bar */}
                      <div className="flex-1 flex flex-col">
                        <div className="flex items-center justify-between mb-1.5 px-1">
                          <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-wider">Weekly Workforce</span>
                          <span className="text-[9px] font-black text-[#FF7D29]">{overviewData.workforce} Today</span>
                        </div>
                        <div className="flex-1 w-full" style={{minHeight:'55px'}}>
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={[{d:'Mon',w:172},{d:'Tue',w:180},{d:'Wed',w:176},{d:'Thu',w:184},{d:'Fri',w:186},{d:'Sat',w:160}]} margin={{top:0,right:0,left:-32,bottom:0}}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.04)" className="dark:stroke-white/5" />
                              <XAxis dataKey="d" tick={{fontSize:8, fill:'#94a3b8'}} axisLine={false} tickLine={false} />
                              <YAxis tick={{fontSize:8, fill:'#94a3b8'}} axisLine={false} tickLine={false} domain={[150,200]} />
                              <Tooltip cursor={{fill: 'rgba(0,0,0,0.02)'}} contentStyle={{fontSize:'10px',borderRadius:'12px',padding:'6px 12px',border:'1px solid rgba(0,0,0,0.08)'}} />
                              <Bar dataKey="w" radius={[4,4,0,0]} name="Workers">
                                {[172,180,176,184,186,160].map((v, i) => (
                                  <Cell key={i} fill={v === 186 ? '#FF7D29' : 'rgba(255,125,41,0.15)'} />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── ROW: Schedule + Budget ── */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  {/* Schedule Control */}
                  <div className="bg-card p-5 rounded-[24px] border border-border/40 shadow-sm flex flex-col gap-4 hover:shadow-md transition-all duration-300">
                    <div className="flex justify-between items-center mb-1">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-4 bg-[#FF7D29] rounded-full"></span>
                        <h3 className="font-heading font-black text-foreground text-[11px] uppercase tracking-widest">Schedule Control</h3>
                      </div>
                      <span className="text-[9px] text-muted-foreground font-bold bg-muted/40 px-2 py-1 rounded-md">Completion: {overviewData.forecastCompletion}</span>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {[{l:'Planned',v:`${overviewData.plannedProgress}%`,c:'text-foreground'},{l:'Actual',v:`${overviewData.physicalProgress}%`,c:'text-foreground'},{l:'Variance',v:`${overviewData.variance}%`,c:'text-red-500'},{l:'Milestones',v:`${overviewData.milestonesCompleted}/${overviewData.totalMilestones}`,c:'text-foreground'}].map(s=>(
                        <div key={s.l} className="bg-muted/30 rounded-2xl p-3 text-center transition-all hover:bg-muted/50 border border-transparent hover:border-border/60">
                          <span className="text-[8px] text-muted-foreground font-bold uppercase tracking-wider block mb-1">{s.l}</span>
                          <span className={`text-xs font-black ${s.c}`}>{s.v}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between bg-red-500/5 border border-red-500/10 rounded-2xl px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse flex-shrink-0 shadow-[0_0_8px_rgba(239,68,68,0.5)]"></span>
                        <span className="text-[10px] text-red-500 font-bold uppercase tracking-wider">Forecast Delay</span>
                      </div>
                      <span className="text-red-500 text-[13px] font-black">{overviewData.forecastDelay} Days</span>
                    </div>
                    <div className="h-[90px] w-full mt-1">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={[
                          { name: 'M1', planned: 5, actual: 4 },
                          { name: 'M2', planned: 12, actual: 10 },
                          { name: 'M3', planned: 22, actual: 18 },
                          { name: 'M4', planned: 34, actual: 28 },
                          { name: 'M5', planned: 50, actual: null },
                          { name: 'M6', planned: 70, actual: null },
                          { name: 'M7', planned: 88, actual: null },
                          { name: 'M8', planned: 100, actual: null },
                        ]} margin={{ top: 2, right: 4, left: -28, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.06)" className="dark:stroke-white/5" />
                          <XAxis dataKey="name" tick={{ fontSize: 8, fill:'#94a3b8' }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 8, fill:'#94a3b8' }} axisLine={false} tickLine={false} />
                          <Tooltip contentStyle={{ borderRadius: '12px', fontSize: '10px', padding: '6px 12px', border:'1px solid rgba(0,0,0,0.08)' }} />
                          <Line type="monotone" dataKey="planned" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 3" name="Planned" dot={{ r: 1.5 }} />
                          <Line type="monotone" dataKey="actual" stroke="#FF7D29" strokeWidth={2.5} name="Actual" dot={{ r: 3, fill:'#FF7D29' }} connectNulls />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Budget & Cost Control */}
                  <div className="bg-card p-5 rounded-[24px] border border-border/40 shadow-sm flex flex-col gap-4 hover:shadow-md transition-all duration-300">
                    <div className="flex justify-between items-center mb-1">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-4 bg-[#FF7D29] rounded-full"></span>
                        <h3 className="font-heading font-black text-foreground text-[11px] uppercase tracking-widest">Budget & Cost Control</h3>
                      </div>
                      <span className={`text-[9px] font-extrabold px-3 py-1 rounded-full border ${
                        overviewData.cpi >= 1
                          ? 'text-emerald-600 bg-emerald-500/10 border-emerald-500/25'
                          : 'text-red-500 bg-red-500/10 border-red-500/25'
                      }`}>CPI: {overviewData.cpi}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        {l:'Approved Budget',v:overviewData.approvedBudget,c:'text-foreground'},
                        {l:'Committed Cost',v:overviewData.committedCost,c:'text-foreground'},
                        {l:'Actual Spent',v:overviewData.actualSpent,c:'text-[#FF7D29] font-black'},
                        {l:'Pending Bills',v:overviewData.pendingBills,c:'text-foreground'},
                        {l:'Forecast Cost',v:overviewData.forecastCost,c:'text-amber-500'},
                        {l:'Potential Overrun',v:overviewData.potentialOverrun,c:'text-red-500'},
                      ].map(s=>(
                        <div key={s.l} className="bg-muted/30 rounded-2xl p-3 transition-all hover:bg-muted/50 border border-transparent hover:border-border/60">
                          <span className="text-[8px] text-muted-foreground font-bold uppercase tracking-wider block mb-1">{s.l}</span>
                          <span className={`text-xs font-black ${s.c}`}>{s.v}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between text-[9px] font-bold text-muted-foreground bg-muted/40 rounded-2xl px-4 py-3 border border-border/40 mt-auto">
                      <span>Risk: <strong className="text-amber-500 uppercase tracking-wide">Low Exposure Watch</strong></span>
                      <span className="flex items-center gap-1.5">Audit: <strong className="text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20 uppercase tracking-wide flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Reconciled</strong></span>
                    </div>
                  </div>
                </div>

                {/* ── ROW 2: Procurement + Inventory + Workforce + Quality (4-up compact) ── */}
                <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">

                  {/* Procurement */}
                  <div className="bg-card p-5 rounded-[24px] border border-border/40 shadow-sm flex flex-col gap-4 hover:shadow-md transition-all duration-300">
                    <h3 className="font-heading font-black text-foreground text-[11px] uppercase tracking-widest flex items-center gap-2 mb-1">
                      <span className="w-2 h-4 bg-[#FF7D29] rounded-full"></span>Procurement
                    </h3>
                    <div className="grid grid-cols-2 gap-2 flex-1">
                      {[
                        {l:'PR Raised',v:overviewData.prRaised,c:'text-foreground'},
                        {l:'PR Pending',v:overviewData.prPending,c:'text-amber-500'},
                        {l:'PO Issued',v:overviewData.poIssued,c:'text-foreground'},
                        {l:'Pend. Deliveries',v:overviewData.pendingDeliveries,c:'text-foreground'},
                        {l:'Delayed',v:overviewData.delayedDeliveries,c:'text-red-500'},
                        {l:'Critical Mat.',v:`${overviewData.criticalMaterials}`,c:'text-red-500'},
                      ].map(s=>(
                        <div key={s.l} className="bg-muted/30 rounded-2xl px-3 py-2 hover:bg-muted/50 transition-colors border border-transparent hover:border-border/60">
                          <span className="text-[8px] text-muted-foreground font-bold uppercase tracking-wider block leading-none mb-1">{s.l}</span>
                          <span className={`text-xs font-black leading-tight flex items-center gap-1 ${s.c}`}>
                            {s.v} {s.l === 'Critical Mat.' && <span className="text-[9px]">⚠</span>}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Inventory */}
                  <div className="bg-card p-5 rounded-[24px] border border-border/40 shadow-sm flex flex-col gap-4 hover:shadow-md transition-all duration-300">
                    <h3 className="font-heading font-black text-foreground text-[11px] uppercase tracking-widest flex items-center gap-2 mb-1">
                      <span className="w-2 h-4 bg-[#FF7D29] rounded-full"></span>Inventory
                    </h3>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        {l:'Cement',v:`${overviewData.cementStock.days}d`,status:'ok'},
                        {l:'Steel',v:`${overviewData.steelStock.days}d`,status:'ok'},
                        {l:'AAC Blocks',v:`${overviewData.aacStock.days}d`,status:'warn'},
                        {l:'Tiles',v:'Low',status:'warn'},
                      ].map(s=>(
                        <div key={s.l} className={`rounded-2xl px-3 py-2 transition-colors border border-transparent ${s.status==='ok'?'bg-emerald-500/5 hover:bg-emerald-500/10 hover:border-emerald-500/20':'bg-amber-500/5 hover:bg-amber-500/10 hover:border-amber-500/20'}`}>
                          <span className="text-[8px] text-muted-foreground font-bold uppercase tracking-wider block leading-none mb-1">{s.l}</span>
                          <span className={`text-xs font-black leading-tight ${s.status==='ok'?'text-emerald-600 dark:text-emerald-400':'text-amber-600 dark:text-amber-400'}`}>{s.v}</span>
                        </div>
                      ))}
                      <div className="col-span-2 bg-red-500/5 border border-red-500/10 rounded-2xl px-4 py-3 flex justify-between items-center transition-colors hover:bg-red-500/10">
                        <span className="text-[9px] text-red-500 font-bold uppercase tracking-wider flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span> Reorder Alerts</span>
                        <span className="text-red-500 text-xs font-black">{overviewData.reorderAlerts}</span>
                      </div>
                    </div>
                  </div>

                  {/* Workforce */}
                  <div className="bg-card p-5 rounded-[24px] border border-border/40 shadow-sm flex flex-col gap-4 hover:shadow-md transition-all duration-300">
                    <h3 className="font-heading font-black text-foreground text-[11px] uppercase tracking-widest flex items-center gap-2 mb-1">
                      <span className="w-2 h-4 bg-[#FF7D29] rounded-full"></span>Workforce
                    </h3>
                    <div className="grid grid-cols-2 gap-2 flex-1">
                      {[
                        {l:'Required',v:overviewData.requiredWorkforce,c:'text-foreground'},
                        {l:'Present',v:overviewData.workforce,c:'text-foreground'},
                        {l:'Shortfall',v:`-${overviewData.shortfall}`,c:'text-red-500'},
                        {l:'Productivity',v:`${overviewData.productivity}%`,c:'text-emerald-500'},
                        {l:'Contractors',v:overviewData.activeContractors,c:'text-foreground'},
                        {l:'Subcontractors',v:overviewData.subcontractors,c:'text-foreground'},
                      ].map(s=>(
                        <div key={s.l} className="bg-muted/30 rounded-2xl px-3 py-2 hover:bg-muted/50 transition-colors border border-transparent hover:border-border/60">
                          <span className="text-[8px] text-muted-foreground font-bold uppercase tracking-wider block leading-none mb-1">{s.l}</span>
                          <span className={`text-xs font-black leading-tight ${s.c}`}>{s.v}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Quality */}
                  <div className="bg-card p-5 rounded-[24px] border border-border/40 shadow-sm flex flex-col gap-4 hover:shadow-md transition-all duration-300">
                    <h3 className="font-heading font-black text-foreground text-[11px] uppercase tracking-widest flex items-center gap-2 mb-1">
                      <span className="w-2 h-4 bg-[#FF7D29] rounded-full"></span>Quality
                    </h3>
                    <div className="grid grid-cols-2 gap-2 flex-1">
                      {[
                        {l:'QA Inspections',v:overviewData.qaInspections,c:'text-foreground'},
                        {l:'Passed',v:overviewData.passed,c:'text-emerald-500'},
                        {l:'Failed',v:overviewData.failed,c:'text-red-500'},
                        {l:'Open Snags',v:overviewData.openSnags,c:'text-amber-500'},
                        {l:'Closed Snags',v:overviewData.closedSnags,c:'text-foreground'},
                      ].map(s=>(
                        <div key={s.l} className="bg-muted/30 rounded-2xl px-3 py-2 hover:bg-muted/50 transition-colors border border-transparent hover:border-border/60">
                          <span className="text-[8px] text-muted-foreground font-bold uppercase tracking-wider block leading-none mb-1">{s.l}</span>
                          <span className={`text-xs font-black leading-tight ${s.c}`}>{s.v}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* ── ROW 3: Safety + Critical Activities ── */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  {/* Safety */}
                  <div className="bg-card p-5 rounded-[24px] border border-border/40 shadow-sm flex flex-col gap-4 hover:shadow-md transition-all duration-300">
                    <h3 className="font-heading font-black text-foreground text-[11px] uppercase tracking-widest flex items-center gap-2 mb-1">
                      <span className="w-2 h-4 bg-[#FF7D29] rounded-full animate-pulse shadow-[0_0_8px_rgba(255,125,41,0.5)]"></span>Safety Dashboard
                    </h3>
                    <div className="grid grid-cols-4 gap-2 h-full">
                      <div className="col-span-2 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl p-4 flex flex-col justify-center items-center gap-3 text-center">
                        <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                          <ShieldCheck className="w-6 h-6 animate-pulse" />
                        </div>
                        <div>
                          <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider block mb-1">Days No Incident</span>
                          <span className="text-emerald-600 dark:text-emerald-400 text-xl font-black">{overviewData.safeDays} Days</span>
                        </div>
                      </div>
                      <div className="col-span-2 grid grid-cols-2 gap-2">
                        {[
                          {l:'Safety Audits',v:`${overviewData.safetyAudits} done`,c:'text-foreground'},
                          {l:'Open NCRs',v:`${overviewData.openNcr} active`,c:'text-amber-500'},
                          {l:'Violations',v:`${overviewData.safetyViolations} logged`,c:'text-red-500'},
                          {l:'PPE Compliance',v:'97%',c:'text-emerald-500'},
                        ].map(s=>(
                          <div key={s.l} className="bg-muted/30 rounded-2xl p-3 flex flex-col justify-center text-center transition-all hover:bg-muted/50 border border-transparent hover:border-border/60">
                            <span className="text-[8px] text-muted-foreground font-bold uppercase tracking-wider block mb-1">{s.l}</span>
                            <span className={`text-xs font-black ${s.c}`}>{s.v}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Critical Activities */}
                  <div className="bg-card p-5 rounded-[24px] border border-border/40 shadow-sm flex flex-col gap-4 hover:shadow-md transition-all duration-300">
                    <h3 className="font-heading font-black text-foreground text-[11px] uppercase tracking-widest flex items-center gap-2 mb-1">
                      <span className="w-2 h-4 bg-[#FF7D29] rounded-full animate-pulse shadow-[0_0_8px_rgba(255,125,41,0.5)]"></span>Critical Activities — PMC Target
                    </h3>
                    <div className="space-y-2">
                      {overviewData.criticalActivities.map(act => (
                        <div key={act.name} className="flex justify-between items-center bg-rose-500/5 border border-rose-500/10 px-4 py-3 rounded-2xl transition-all hover:bg-rose-500/10">
                          <span className="text-xs font-extrabold text-foreground">{act.name}</span>
                          <span className="text-[9px] font-black text-rose-500 bg-rose-500/10 px-3 py-1 rounded-full uppercase tracking-widest">+{act.delay} delay</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 13. AI Project Intelligence Panel */}
                <div className="bg-card p-5 rounded-[24px] border border-border/40 shadow-sm flex flex-col gap-4 hover:shadow-md transition-all duration-300 mt-1">
                  <div className="flex items-center gap-2 border-b border-border/40 pb-3">
                    <span className="w-2 h-4 rounded-full bg-[#FF7D29] animate-pulse shadow-[0_0_8px_rgba(255,125,41,0.5)]"></span>
                    <h3 className="font-heading font-black text-foreground text-[11px] uppercase tracking-widest">AI Project Intelligence</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-muted-foreground select-none">
                    <div className="space-y-2">
                      <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 block mb-3">AI Anomalies Detected</span>
                      {overviewData.aiInsights.map((insight, idx) => (
                        <div key={idx} className="flex items-center gap-3 text-rose-500 dark:text-rose-400 bg-rose-500/5 dark:bg-rose-500/10 border border-rose-500/10 px-4 py-3 rounded-2xl font-bold leading-tight">
                          <span className="text-sm">⚠</span>
                          <p className="flex-1 text-[11px]">{insight}</p>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-2">
                      <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 block mb-3">AI Recommended Actions (One-Click Execute)</span>
                      {overviewData.aiActions.map((action, idx) => (
                        <button key={idx} type="button" className="w-full text-left flex items-center gap-3 text-[#FF7D29] bg-[#FF7D29]/5 border border-[#FF7D29]/15 px-4 py-3 rounded-2xl font-bold hover:bg-[#FF7D29]/10 transition-colors shadow-xs group">
                          <span className="text-sm">⚙</span>
                          <span className="flex-1 text-[11px] font-extrabold text-foreground group-hover:text-[#FF7D29] transition-colors">{action}</span>
                          <span className="text-[9px] font-black uppercase bg-[#FF7D29]/10 text-[#FF7D29] px-3 py-1 rounded-full border border-[#FF7D29]/20 shadow-xs">Apply</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 14. Interactive Gantt Chart */}
                <div className="bg-card p-5 rounded-[24px] border border-border/40 shadow-sm space-y-4 hover:shadow-md transition-all duration-300">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/40 pb-3 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-4 bg-[#FF7D29] rounded-full"></span>
                      <div>
                        <h3 className="font-heading font-black text-foreground text-[11px] uppercase tracking-widest leading-none">Interactive Gantt Schedule</h3>
                        <p className="text-[9px] text-muted-foreground mt-1 font-bold uppercase tracking-widest">PMC Realtime Critical Path Tracking</p>
                      </div>
                    </div>
                    {/* Gantt Filters Checkboxes */}
                    <div className="flex flex-wrap items-center gap-4 text-[9px] font-bold text-muted-foreground bg-muted/30 px-4 py-2 rounded-2xl border border-transparent hover:border-border/60 transition-colors select-none">
                      <label className="flex items-center gap-1.5 cursor-pointer hover:text-foreground group">
                        <input 
                          type="checkbox" 
                          checked={ganttShowCritical}
                          onChange={(e) => setGanttShowCritical(e.target.checked)}
                          className="rounded-md border-border/60 text-[#FF7D29] focus:ring-1 focus:ring-[#FF7D29] focus:ring-offset-0 w-3 h-3 group-hover:border-[#FF7D29]" 
                        />
                        <span className="uppercase tracking-widest">Critical Path</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer hover:text-foreground group">
                        <input 
                          type="checkbox" 
                          checked={ganttShowDelayed}
                          onChange={(e) => setGanttShowDelayed(e.target.checked)}
                          className="rounded-md border-border/60 text-[#FF7D29] focus:ring-1 focus:ring-[#FF7D29] focus:ring-offset-0 w-3 h-3 group-hover:border-[#FF7D29]" 
                        />
                        <span className="uppercase tracking-widest">Delayed</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer hover:text-foreground group">
                        <input 
                          type="checkbox" 
                          checked={ganttShowDependencies}
                          onChange={(e) => setGanttShowDependencies(e.target.checked)}
                          className="rounded-md border-border/60 text-[#FF7D29] focus:ring-1 focus:ring-[#FF7D29] focus:ring-offset-0 w-3 h-3 group-hover:border-[#FF7D29]" 
                        />
                        <span className="uppercase tracking-widest">Dependencies</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer hover:text-foreground group">
                        <input 
                          type="checkbox" 
                          checked={ganttShowResources}
                          onChange={(e) => setGanttShowResources(e.target.checked)}
                          className="rounded-md border-border/60 text-[#FF7D29] focus:ring-1 focus:ring-[#FF7D29] focus:ring-offset-0 w-3 h-3 group-hover:border-[#FF7D29]" 
                        />
                        <span className="uppercase tracking-widest">Resource View</span>
                      </label>
                    </div>

                    {/* Zoom controls */}
                    <div className="flex bg-muted/30 p-1 rounded-2xl border border-border/40 text-[9px] font-bold select-none uppercase tracking-widest">
                      {(['week', 'month', 'quarter'] as const).map(z => (
                        <button
                          key={z}
                          onClick={() => setGanttZoom(z)}
                          className={`px-4 py-1.5 rounded-xl transition-all duration-200 ${ganttZoom === z ? 'bg-[#FF7D29] text-white shadow-md shadow-[#FF7D29]/20' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}`}
                        >
                          {z}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* SVG Gantt Chart */}
                  <div className="overflow-x-auto pb-2">
                    <div className="min-w-[1100px] border border-border/40 rounded-3xl p-4 bg-muted/10 relative shadow-sm">
                      {/* Columns Header based on Zoom */}
                      <div className="flex items-center text-[9px] font-black uppercase tracking-widest text-muted-foreground border-b border-border/40 pb-3 mb-4 select-none">
                        <div className="w-[580px] flex-shrink-0 grid grid-cols-7 pr-3">
                          <div className="col-span-2">Task Name</div>
                          <div>Contractor</div>
                          <div>Resp. Engineer</div>
                          <div>Planned End</div>
                          <div>Actual End</div>
                          <div className="text-right">Delay (Days)</div>
                        </div>
                        <div className="flex-1 grid grid-cols-4 text-center border-l border-border/40">
                          {ganttZoom === 'week' ? (
                            <>
                              <div>Days 1 - 7</div>
                              <div>Days 8 - 14</div>
                              <div>Days 15 - 21</div>
                              <div>Days 22 - 28</div>
                            </>
                          ) : ganttZoom === 'month' ? (
                            <>
                              <div>Week 1</div>
                              <div>Week 2</div>
                              <div>Week 3</div>
                              <div>Week 4</div>
                            </>
                          ) : (
                            <>
                              <div>Month 1 (Phase A)</div>
                              <div>Month 2 (Phase B)</div>
                              <div>Month 3 (Phase C)</div>
                              <div>Month 4 (Phase D)</div>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Gantt Rows */}
                      <div className="space-y-4">
                        {project!.tasks
                          .filter(tsk => {
                            if (ganttShowCritical && !tsk.isCriticalPath) return false;
                            if (ganttShowDelayed) {
                              const isOverdue = tsk.progress < 90 && tsk.priority === 'HIGH';
                              if (!isOverdue) return false;
                            }
                            return true;
                          })
                          .map((tsk, idx) => {
                            const baseMargin = (idx * 12) % 45; // simulated offset for UI representation
                            const baseWidth = 25 + ((idx * 8) % 35); // simulated duration width
                            const hasWarning = tsk.progress < 90 && tsk.priority === 'HIGH';
                            
                            // Mocking dependency connector lines
                            const hasDependency = tsk.dependencies && ganttShowDependencies;

                            // Mocking a vendor mapping
                            const mockVendor = idx % 2 === 0 ? 'ABC Infra' : 'Tata Tiscon';

                            // Simulated Planned / Actual Dates and Delay Days
                            const plannedEnd = tsk.endDate;
                            const actualEnd = idx % 3 === 0 ? '2026-07-15' : plannedEnd;
                            const delayDays = idx % 3 === 0 ? 5 : 0;

                            return (
                              <div key={tsk.id} className="flex items-center text-[10px] py-1.5 border-b border-border/20 last:border-b-0 pb-3 last:pb-0">
                                {/* Task Details and resource (580px width) */}
                                <div className="w-[580px] flex-shrink-0 pr-3 min-w-0 grid grid-cols-7 items-center">
                                  <div className="col-span-2 flex items-center gap-2 min-w-0 pr-2">
                                    <span className="font-extrabold text-foreground truncate block leading-tight">{tsk.name}</span>
                                    {tsk.isCriticalPath && (
                                      <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[7.5px] font-black text-rose-600 dark:text-rose-400 uppercase tracking-widest border border-rose-500/20 flex-shrink-0">Critical</span>
                                    )}
                                  </div>
                                  <span className="font-bold text-muted-foreground truncate block">{mockVendor}</span>
                                  <span className="font-bold text-muted-foreground truncate block">
                                    {ganttShowResources ? `👤 ${tsk.assigneeName || 'Rajesh'}` : '-'}
                                  </span>
                                  <span className="font-bold text-muted-foreground block">{plannedEnd}</span>
                                  <span className="font-bold text-muted-foreground block">{actualEnd}</span>
                                  <span className={`font-black block text-right text-[11px] ${delayDays > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                                    {delayDays > 0 ? `+${delayDays}d` : '0d'}
                                  </span>
                                </div>
                                
                                {/* Gantt Timeline Bar */}
                                <div className="flex-1 relative h-7 bg-muted/20 rounded-xl border border-border/30 overflow-visible flex items-center shadow-inner">
                                  {/* Dotted grids background */}
                                  <div className="absolute inset-0 grid grid-cols-4 pointer-events-none opacity-40">
                                    <div className="border-r border-dashed border-border/70"></div>
                                    <div className="border-r border-dashed border-border/70"></div>
                                    <div className="border-r border-dashed border-border/70"></div>
                                    <div></div>
                                  </div>

                                  {/* Visual Schedule Bar */}
                                  <div 
                                    className={`absolute h-5 rounded-lg flex items-center justify-between px-3 text-[9px] font-black text-white transition-all shadow-md group/bar
                                      ${tsk.isCriticalPath 
                                        ? 'bg-gradient-to-r from-rose-500 to-rose-400 hover:from-rose-600 hover:to-rose-500' 
                                        : 'bg-gradient-to-r from-[#FF7D29] to-[#FF9D5C] hover:from-[#E66B1A] hover:to-[#FF8842]'}`}
                                    style={{ 
                                      left: `${baseMargin}%`, 
                                      width: `${baseWidth}%` 
                                    }}
                                  >
                                    <span className="truncate pr-2 uppercase tracking-wider text-[8px]">Progress</span>
                                    <span>{tsk.progress}%</span>
                                    
                                    {/* Hover tooltip */}
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-popover border border-border text-foreground px-3 py-2 rounded-xl shadow-xl text-[10px] font-bold whitespace-nowrap opacity-0 group-hover/bar:opacity-100 transition-opacity duration-200 pointer-events-none z-30">
                                      Planned End: {plannedEnd} | Actual: {actualEnd} {delayDays > 0 && `(Delay: ${delayDays} days)`}
                                    </div>
                                  </div>

                                  {/* Overdue Blinking warning dot */}
                                  {hasWarning && (
                                    <div 
                                      className="absolute -right-2 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 animate-pulse border-2 border-white dark:border-gray-900 shadow-[0_0_8px_rgba(239,68,68,0.6)]"
                                      title="Overdue Schedule Alert"
                                    >
                                      <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 animate-ping"></span>
                                      <span className="text-[8px] text-white">⚠️</span>
                                    </div>
                                  )}

                                  {/* Dependency connection helper */}
                                  {hasDependency && (
                                    <div 
                                      className="absolute left-0 right-0 top-1/2 h-[1px] border-t-2 border-dashed border-[#FF7D29]/40 -z-10"
                                      style={{
                                        left: `calc(${baseMargin}% - 24px)`,
                                        width: '24px'
                                      }}
                                      title={`Linked to parent task: ${tsk.dependencies}`}
                                    >
                                      <span className="absolute -left-1.5 -top-1.5 font-black text-[#FF7D29] text-[10px]">←</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}

                        {project!.tasks.length === 0 && (
                          <div className="py-12 text-center text-gray-400">
                            No active schedule tasks found. Set up milestones in project settings.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 15. Recent Site Updates */}
                <div className="bg-card p-5 rounded-[24px] border border-border/40 shadow-sm mt-4 hover:shadow-md transition-all duration-300">
                  <div className="flex items-center gap-2 border-b border-border/40 pb-3 mb-4">
                    <span className="w-2 h-4 bg-[#FF7D29] rounded-full"></span>
                    <h3 className="font-heading font-black text-foreground text-[11px] uppercase tracking-widest leading-none">Recent Site Updates</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                    <div className="bg-muted/30 border border-transparent hover:border-border/60 transition-colors p-4 rounded-2xl flex items-start gap-3 text-[10px] font-semibold">
                      <div className="w-6 h-6 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0 text-emerald-500">
                        <span className="font-bold">✔</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block font-black text-[9px] uppercase tracking-widest mb-1">Today</span>
                        <p className="text-foreground leading-tight">Slab Casting Completed for Tower A Level 7 column starter</p>
                      </div>
                    </div>
                    <div className="bg-muted/30 border border-transparent hover:border-border/60 transition-colors p-4 rounded-2xl flex items-start gap-3 text-[10px] font-semibold">
                      <div className="w-6 h-6 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0 text-emerald-500">
                        <span className="font-bold">✔</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block font-black text-[9px] uppercase tracking-widest mb-1">Today</span>
                        <p className="text-foreground leading-tight">PR-145 Submitted for reinforcement structural steel PO</p>
                      </div>
                    </div>
                    <div className="bg-rose-500/5 dark:bg-rose-500/10 border border-rose-500/15 p-4 rounded-2xl flex items-start gap-3 text-[10px] font-semibold transition-colors hover:bg-rose-500/10">
                      <div className="w-6 h-6 rounded-full bg-rose-500/10 flex items-center justify-center flex-shrink-0 text-rose-500">
                        <span className="font-bold">⚠</span>
                      </div>
                      <div>
                        <span className="text-rose-500 block font-black text-[9px] uppercase tracking-widest mb-1">Yesterday</span>
                        <p className="text-foreground leading-tight">Cement Stock Low warning flag raised by store manager</p>
                      </div>
                    </div>
                    <div className="bg-muted/30 border border-transparent hover:border-border/60 transition-colors p-4 rounded-2xl flex items-start gap-3 text-[10px] font-semibold">
                      <div className="w-6 h-6 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0 text-emerald-500">
                        <span className="font-bold">✔</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block font-black text-[9px] uppercase tracking-widest mb-1">Yesterday</span>
                        <p className="text-foreground leading-tight">MEP work completed on Block C level 3 apartment units</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 16. Pending Workflows & Approvals */}
                {isUpperManagement(currentUser.role) && (
                  <div className="bg-card p-5 rounded-[24px] border border-border/40 shadow-sm mt-4 hover:shadow-md transition-all duration-300">
                    <div className="flex items-center gap-2 border-b border-border/40 pb-3 mb-4">
                      <span className="w-2 h-4 bg-amber-500 rounded-full animate-pulse"></span>
                      <h3 className="font-heading font-black text-foreground text-[11px] uppercase tracking-widest leading-none">Pending Workflow Approvals</h3>
                    </div>
                    <div className="space-y-3">
                      {workflowsLoading ? (
                        <div className="text-center text-xs text-muted-foreground py-4">Loading workflows...</div>
                      ) : pendingWorkflows.length === 0 ? (
                        <div className="text-center text-xs text-muted-foreground py-4">No pending approvals. All caught up!</div>
                      ) : (
                        pendingWorkflows.map((workflow) => (
                          <div key={workflow.id} className="bg-muted/30 border border-border/60 hover:border-amber-500/50 transition-colors p-4 rounded-2xl flex flex-col gap-3 text-[10px]">
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="text-amber-500 block font-black text-[9px] uppercase tracking-widest mb-1">{workflow.type}</span>
                                <p className="text-foreground font-bold leading-tight text-xs">{workflow.title}</p>
                              </div>
                              <span className="bg-amber-500/10 text-amber-600 px-2 py-0.5 rounded uppercase font-bold text-[9px]">{workflow.status}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-2">
                              <button 
                                onClick={() => handleApproveWorkflow(workflow.id, workflow.type)}
                                className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-4 py-1.5 rounded-lg shadow-sm transition-all flex-1"
                              >
                                Approve
                              </button>
                              <button 
                                onClick={() => handleRejectWorkflow(workflow.id, workflow.type)}
                                className="bg-red-500 hover:bg-red-600 text-white font-bold px-4 py-1.5 rounded-lg shadow-sm transition-all flex-1"
                              >
                                Reject
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}


            {/* 2. DAILY PROGRESS REPORTS AND FLEET MANAGEMENT */}
            {activeTab === 'site-operations' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Site Operations & Site Diary Panel */}
                  {/* Reports Feed & Site Diary */}
                  <div className="lg:col-span-2 space-y-4">
                    {/* Header bar with Offline status */}
                    <div className="bg-white dark:bg-gray-900 p-4 rounded-2xl border border-border/60 shadow-sm flex items-center justify-between">
                      <div>
                        <h3 className="font-heading font-bold text-foreground text-xs uppercase tracking-wider">Site Diary & DPR Logs</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">Live site logs, voice notes, photos, and offline data cache status.</p>
                      </div>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-500 border border-emerald-500/25">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        Offline Sync Enabled (Cache Clean)
                      </span>
                    </div>

                    {/* Voice Notes Recorder Simulator */}
                    <div className="bg-white dark:bg-gray-900 p-4 rounded-2xl border border-border/60 shadow-sm space-y-3.5">
                      <h4 className="font-heading font-bold text-foreground text-xs uppercase tracking-wider flex items-center gap-2">
                        🎙️ Voice Notes Site Diary
                      </h4>
                      <div className="flex flex-wrap items-center gap-4 bg-muted/30 p-3 rounded-xl border border-border/50">
                        {isRecording ? (
                          <div className="flex items-center gap-3">
                            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping"></span>
                            <span className="text-xs font-bold text-red-500 animate-pulse">Recording Site Update... (0:08)</span>
                            <button 
                              type="button"
                              onClick={() => {
                                setIsRecording(false);
                                setVoiceNotes([...voiceNotes, `VoiceNote_${Date.now()}.mp3`]);
                              }}
                              className="bg-red-500 text-white text-[10px] font-bold px-2.5 py-1 rounded-lg hover:bg-red-600 transition-all cursor-pointer"
                            >
                              Stop
                            </button>
                          </div>
                        ) : (
                          <button 
                            type="button"
                            onClick={() => setIsRecording(true)}
                            className="bg-primary text-primary-foreground text-xs font-bold px-3.5 py-2 rounded-lg hover:bg-primary/95 transition-all shadow-xs cursor-pointer"
                          >
                            Record Voice Memo
                          </button>
                        )}
                        <p className="text-[10px] text-muted-foreground font-semibold flex-1">Record audio notes directly from site walk-throughs. Syncs offline automatically.</p>
                      </div>

                      {/* Voice Notes List */}
                      {voiceNotes.length > 0 && (
                        <div className="space-y-2 pt-2 border-t border-border/60">
                          {voiceNotes.map((note, index) => (
                            <div key={note} className="flex items-center justify-between bg-muted/40 p-2.5 rounded-lg border border-border/40 text-xs font-semibold">
                              <span className="text-foreground">🔊 Walk-through Update #{index + 1} ({note.slice(-10)})</span>
                              <div className="flex gap-2">
                                <button type="button" className="text-primary hover:underline text-[10px] font-bold">Play</button>
                                <button 
                                  type="button" 
                                  onClick={() => setVoiceNotes(voiceNotes.filter(vn => vn !== note))}
                                  className="text-rose-500 hover:underline text-[10px] font-bold"
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* DPR Logs List */}
                    <div className="bg-white dark:bg-gray-900 p-4 rounded-2xl border border-border/60 shadow-sm space-y-4">
                      <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                        {dprLoading ? (
                          <div className="py-12 text-center text-muted-foreground text-xs">Loading DPRs...</div>
                        ) : dprLogs.map((dpr) => (
                          <div key={dpr.id} className="p-3.5 border border-border bg-muted/20 rounded-xl space-y-2">
                            <div className="flex items-center justify-between text-xs flex-wrap gap-2">
                              <span className="font-bold text-foreground">Engr. {dpr.created_by_name}</span>
                              <div className="flex items-center gap-3 text-muted-foreground">
                                <span className="bg-muted px-2 py-0.5 rounded text-[10px] font-bold border border-border/50">{dpr.weather_conditions}</span>
                                <span className="font-semibold">{dpr.date}</span>
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed font-medium">
                              {dpr.activities.map((a: any) => a.activity_name).join(', ')}
                            </p>
                            
                            {(dpr.issues && dpr.issues.length > 0) && (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-2 border-t border-border/50 text-[10px] font-bold">
                                {dpr.issues.map((issue: any, idx: number) => (
                                  <p key={idx} className="text-red-500 font-bold">
                                    <span>Issue:</span> {issue.issue_description}
                                  </p>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                        
                        {!dprLoading && dprLogs.length === 0 && (
                          <div className="py-12 text-center text-gray-400">
                            <ClipboardList className="w-10 h-10 mx-auto text-gray-300 mb-2" />
                            <p className="text-xs">No daily activities logged for this project yet.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                {/* Submit DPR Form */}
                <div className="bg-white dark:bg-gray-900 p-3 rounded-xl border border-gray-100 dark:border-gray-850 shadow-sm space-y-4 h-fit">
                  <h3 className="font-heading font-semibold text-gray-900 dark:text-white text-[13px]">Submit Daily Site Report</h3>
                  
                  <form onSubmit={handleDailyActivitySubmit} className="space-y-3.5">
                    <div>
                      <label className="text-xs font-bold text-gray-400 uppercase">Engineer Name</label>
                      <input
                        type="text"
                        required
                        value={engineerName}
                        onChange={(e) => setEngineerName(e.target.value)}
                        placeholder="e.g. Priya Nair"
                        className="w-full text-xs mt-1 p-2.5 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-gray-400 uppercase">Weather Condition</label>
                      <select
                        value={weather}
                        onChange={(e) => setWeather(e.target.value as typeof weather)}
                        className="w-full text-xs mt-1 p-2.5 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        <option value="Sunny">Sunny</option>
                        <option value="Cloudy">Cloudy</option>
                        <option value="Rainy">Rainy</option>
                        <option value="Windy">Windy</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-gray-400 uppercase">Work Completed Details</label>
                      <textarea
                        required
                        value={workCompleted}
                        onChange={(e) => setWorkCompleted(e.target.value)}
                        rows={3}
                        placeholder="Specify excavation status, concrete casting, shuttering, bricks, etc..."
                        className="w-full text-xs mt-1 p-2.5 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs font-bold text-gray-400 uppercase">Issues (Optional)</label>
                        <input
                          type="text"
                          value={issues}
                          onChange={(e) => setIssues(e.target.value)}
                          placeholder="e.g. Transit delays"
                          className="w-full text-xs mt-1 p-2.5 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-gray-400 uppercase">Risks (Optional)</label>
                        <input
                          type="text"
                          value={risks}
                          onChange={(e) => setRisks(e.target.value)}
                          placeholder="e.g. Mud slides"
                          className="w-full text-xs mt-1 p-2.5 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-gray-400 uppercase">Progress Increase Contribution</label>
                      <input
                        type="number"
                        step="0.05"
                        required
                        value={progressDelta}
                        onChange={(e) => setProgressDelta(parseFloat(e.target.value))}
                        className="w-full text-xs mt-1 p-2.5 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={currentUser.role === 'PR_TEAM'}
                      className="w-full text-xs font-bold bg-primary hover:bg-orange-800 text-white py-3 rounded-lg shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Log Site Activity
                    </button>
                  </form>
                </div>
              </div>

                {/* 6. FLEET MANAGEMENT */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-white dark:bg-gray-900 p-3 rounded-xl border border-gray-100 dark:border-gray-850 shadow-sm">
                    <p className="text-xs text-gray-400 font-semibold uppercase">Assigned Assets</p>
                    <p className="font-heading text-xl font-bold text-gray-900 dark:text-white mt-1">{project!.equipments.length}</p>
                  </div>
                  <div className="bg-white dark:bg-gray-900 p-3 rounded-xl border border-gray-100 dark:border-gray-850 shadow-sm">
                    <p className="text-xs text-gray-400 font-semibold uppercase">Fuel Consumption</p>
                    <p className="font-heading text-xl font-bold text-orange-600 dark:text-orange-400 mt-1">
                      {project!.equipments.reduce((acc, eq) => acc + eq.fuelConsumed, 0)} L
                    </p>
                  </div>
                  <div className="bg-white dark:bg-gray-900 p-3 rounded-xl border border-gray-100 dark:border-gray-850 shadow-sm">
                    <p className="text-xs text-gray-400 font-semibold uppercase">Maintenance Alerts</p>
                    <p className="font-heading text-xl font-bold text-danger mt-1">
                      {project!.equipments.filter((eq) => eq.status === 'MAINTENANCE').length}
                    </p>
                  </div>
                </div>

                <div className="bg-white dark:bg-gray-900 p-3 rounded-xl border border-gray-100 dark:border-gray-850 shadow-sm space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h3 className="font-heading font-semibold text-gray-900 dark:text-white text-[13px]">Fleet & Machinery Register</h3>
                      <p className="text-xs text-gray-400 mt-0.5">Site-wise asset availability, usage hours, diesel burn, and maintenance readiness</p>
                    </div>
                    <span className="text-xs bg-orange-50 dark:bg-orange-950/40 text-primary border border-orange-200 px-2 py-0.5 rounded-full font-bold">
                      {project!.name}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {project!.equipments.map((eq) => (
                      <div key={eq.id} className="flex justify-between items-center text-xs p-3 rounded-lg border border-gray-50 dark:border-gray-850 bg-gray-50/20 dark:bg-gray-950/30">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="p-2 rounded-lg bg-orange-50 dark:bg-orange-950/20 text-primary flex-shrink-0">
                            <Wrench className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-gray-800 dark:text-gray-200 truncate">{eq.name}</p>
                            <p className="text-xs text-gray-400 mt-0.5">Fuel: {eq.fuelConsumed} L | Maint: {eq.lastMaintenance}</p>
                          </div>
                        </div>
                        
                        <div className="text-right flex-shrink-0">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold border
                            ${eq.status === 'ACTIVE' ? 'bg-emerald-50 border-emerald-200 text-success' : 
                              eq.status === 'MAINTENANCE' ? 'bg-red-50 border-red-200 text-danger' : 
                              'bg-amber-50 border-amber-200 text-warning'}`}>
                            {eq.status}
                          </span>
                          <p className="text-xs text-gray-400 mt-1">Usage: {eq.usageHours} hrs</p>
                        </div>
                      </div>
                    ))}

                    {project!.equipments.length === 0 && (
                      <div className="md:col-span-2 py-12 text-center text-gray-400 border border-dashed border-gray-200 dark:border-gray-800 rounded-xl">
                        No fleet assets assigned to this site.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* 3. MATERIAL MANAGEMENT */}
            {activeTab === 'inventory' && (() => {
              const stockItems = project!.materials.filter(m => m.status !== 'ordered');
              const prItems = project!.materials.filter(m => m.status === 'ordered');
              return (
                <div className="space-y-4">
                  {/* Stock Gauges Grid */}
                  <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                    {stockItems.map((mat) => {
                      const isLow = mat.quantity < mat.reorderLevel;
                      return (
                        <div key={mat.id} className={`p-4 bg-white dark:bg-gray-900 border rounded-2xl shadow-sm flex flex-col justify-between space-y-4
                          ${isLow ? 'border-red-200 dark:border-red-950/30 bg-red-50/10' : 'border-gray-100 dark:border-gray-850'}`}>
                          <div>
                            <div className="flex items-start justify-between gap-2">
                              <span className="text-xs font-bold text-gray-900 dark:text-white truncate">{mat.itemName}</span>
                              {isLow && <span className="bg-red-100 text-red-600 text-xs font-bold uppercase px-1.5 py-0.5 rounded">Low</span>}
                            </div>
                            <p className="text-xs text-gray-400 mt-1">{mat.category}</p>
                          </div>

                          <div>
                            <p className="text-base font-bold text-gray-900 dark:text-white">{mat.quantity} <span className="text-xs font-normal text-gray-400">{mat.unit}</span></p>
                            <div className="w-full h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full mt-2 overflow-hidden">
                              <div 
                                className={`h-full rounded-full ${isLow ? 'bg-danger' : 'bg-success'}`}
                                style={{ width: `${Math.min(100, (mat.quantity / (mat.reorderLevel * 3)) * 100)}%` }}
                              />
                            </div>
                            <p className="text-xs text-gray-400 mt-1">Reorder Level: {mat.reorderLevel} {mat.unit}</p>
                          </div>
                        </div>
                      );
                    })}
                    {stockItems.length === 0 && (
                      <div className="col-span-full py-3 text-center text-gray-400 bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-850">
                        No active stock inventory.
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                    {/* Stock Register Ledger */}
                    <div className="lg:col-span-2 bg-white dark:bg-gray-900 p-3 rounded-xl border border-gray-100 dark:border-gray-850 shadow-sm space-y-4">
                      <h3 className="font-heading font-semibold text-gray-900 dark:text-white text-[13px]">Material Stock Inventory</h3>
                      
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left">
                          <thead>
                            <tr className="border-b border-gray-200 dark:border-gray-850 text-gray-400">
                              <th className="pb-3 font-semibold">Material Item</th>
                              <th className="pb-3 font-semibold">Current Stock</th>
                              <th className="pb-3 font-semibold">Stock Value</th>
                              <th className="pb-3 font-semibold">Vendor Supplier</th>
                              <th className="pb-3 font-semibold">Safety Level</th>
                            </tr>
                          </thead>
                          <tbody>
                            {stockItems.map((mat) => (
                              <tr key={mat.id} className="border-b border-gray-50 dark:border-gray-50/50 hover:bg-gray-50/30 dark:hover:bg-gray-950/20">
                                <td className="py-3 font-bold text-gray-800 dark:text-gray-200">{mat.itemName}</td>
                                <td className="py-3 font-medium">{mat.quantity} {mat.unit}</td>
                                <td className="py-3 font-medium">{formatCurrency(mat.stockValue)}</td>
                                <td className="py-3 text-gray-400">{mat.supplierName || 'N/A'}</td>
                                <td className="py-3">
                                  <span className={`font-bold ${mat.quantity < mat.reorderLevel ? 'text-danger' : 'text-success'}`}>
                                    {mat.quantity < mat.reorderLevel ? 'Reorder Urgent' : 'Healthy'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Log Inward/Outward Slip */}
                    <div className="bg-white dark:bg-gray-900 p-3 rounded-xl border border-gray-100 dark:border-gray-850 shadow-sm space-y-4">
                      <h3 className="font-heading font-semibold text-gray-900 dark:text-white text-[13px]">Log Store Transaction</h3>
                      
                      <form onSubmit={handleMaterialTransactionSubmit} className="space-y-3">
                        <div>
                          <label className="text-xs font-bold text-gray-400 uppercase">Select Material</label>
                          <select
                            required
                            value={selectedMatId}
                            onChange={(e) => setSelectedMatId(e.target.value)}
                            className="w-full text-xs mt-1 p-2.5 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary"
                          >
                            <option value="">-- Choose Material Item --</option>
                            {stockItems.map(m => (
                              <option key={m.id} value={m.id}>{m.itemName} (Stock: {m.quantity})</option>
                            ))}
                          </select>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs font-bold text-gray-400 uppercase">Slip Type</label>
                            <select
                              value={txType}
                              onChange={(e) => setTxType(e.target.value as typeof txType)}
                              className="w-full text-xs mt-1 p-2.5 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary"
                            >
                              <option value="INWARD">INWARD (Receipt)</option>
                              <option value="OUTWARD">OUTWARD (Issue)</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-xs font-bold text-gray-400 uppercase">Quantity</label>
                            <input
                              type="number"
                              required
                              min="1"
                              value={txQty || ''}
                              onChange={(e) => setTxQty(parseFloat(e.target.value))}
                              placeholder="Amount"
                              className="w-full text-xs mt-1 p-2.5 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-white"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs font-bold text-gray-400 uppercase">Item Cost (INR)</label>
                            <input
                              type="number"
                              value={txCost || ''}
                              onChange={(e) => setTxCost(parseFloat(e.target.value))}
                              placeholder="Unit/Total cost"
                              className="w-full text-xs mt-1 p-2.5 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-white"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-bold text-gray-400 uppercase">Gate Pass Ref#</label>
                            <input
                              type="text"
                              value={txRef}
                              onChange={(e) => setTxRef(e.target.value)}
                              placeholder="GP-99201"
                              className="w-full text-xs mt-1 p-2.5 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-white"
                            />
                          </div>
                        </div>

                        <button
                          type="submit"
                          disabled={currentUser.role === 'PR_TEAM'}
                          className="w-full text-xs font-bold bg-[#b68d40] hover:bg-[#967332] text-white py-3 rounded-lg shadow-sm transition-colors disabled:opacity-50 cursor-pointer"
                        >
                          Confirm Gate Entry
                        </button>
                      </form>
                    </div>
                  </div>

                  {/* Material Purchase Requests (PRs) Register */}
                  <div className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-100 dark:border-gray-850 shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-heading font-bold text-gray-900 dark:text-white text-[13px] uppercase tracking-wider">
                          📋 Material Purchase Requests (PRs)
                        </h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Approve or raise purchase orders for material requests submitted from the site app.
                        </p>
                      </div>
                      <span className="text-xs font-semibold bg-[#b68d40]/10 text-[#b68d40] px-3 py-1 rounded-full border border-[#b68d40]/25">
                        {prItems.length} Active Requests
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead>
                          <tr className="border-b border-gray-200 dark:border-gray-850 text-gray-400">
                            <th className="pb-3 font-semibold">Material Name</th>
                            <th className="pb-3 font-semibold">Quantity</th>
                            <th className="pb-3 font-semibold">Required Date</th>
                            <th className="pb-3 font-semibold">Vendor</th>
                            <th className="pb-3 font-semibold">Stage</th>
                            <th className="pb-3 font-semibold text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {prItems.map((pr) => {
                            let details = { materialName: pr.itemName, stage: 'Submitted', requiredDate: '', vendor: '' };
                            try {
                              if (pr.itemName.startsWith('{')) {
                                details = JSON.parse(pr.itemName);
                              }
                            } catch (e) {}

                            const stageColors = {
                              Draft: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400',
                              Submitted: 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900/30',
                              Approved: 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/30',
                              'PO Raised': 'bg-indigo-50 text-indigo-600 border-indigo-200 dark:bg-indigo-950/20 dark:text-indigo-400 dark:border-indigo-900/30',
                              Delivered: 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/30',
                            };

                            return (
                              <tr key={pr.id} className="border-b border-gray-50 dark:border-gray-850/50 hover:bg-gray-50/30 dark:hover:bg-gray-950/20">
                                <td className="py-3 font-bold text-gray-800 dark:text-gray-200">{details.materialName}</td>
                                <td className="py-3 font-semibold text-gray-800 dark:text-gray-200">{pr.quantity} {pr.unit}</td>
                                <td className="py-3 text-gray-400">
                                  {details.requiredDate ? new Date(details.requiredDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}
                                </td>
                                <td className="py-3 text-gray-400">{details.vendor || 'N/A'}</td>
                                <td className="py-3">
                                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${stageColors[details.stage as keyof typeof stageColors] || 'bg-muted border-border'}`}>
                                    {details.stage}
                                  </span>
                                </td>
                                <td className="py-3 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    {details.stage === 'Submitted' && (
                                      <button
                                        onClick={() => handleDashboardAdvancePR(pr.id, pr.itemName, 'Approved', pr.quantity, pr.unit)}
                                        className="text-[10px] font-bold bg-[#b68d40] text-white px-2 py-1 rounded hover:bg-[#967332] transition-all cursor-pointer"
                                      >
                                        Approve Request
                                      </button>
                                    )}
                                    {details.stage === 'Approved' && (
                                      <button
                                        onClick={() => handleDashboardAdvancePR(pr.id, pr.itemName, 'PO Raised', pr.quantity, pr.unit)}
                                        className="text-[10px] font-bold bg-indigo-600 text-white px-2 py-1 rounded hover:bg-indigo-750 transition-all cursor-pointer"
                                      >
                                        Raise PO
                                      </button>
                                    )}
                                    {details.stage === 'PO Raised' && (
                                      <button
                                        onClick={() => handleDashboardAdvancePR(pr.id, pr.itemName, 'Delivered', pr.quantity, pr.unit)}
                                        className="text-[10px] font-bold bg-emerald-600 text-white px-2 py-1 rounded hover:bg-emerald-700 transition-all cursor-pointer"
                                      >
                                        Mark Delivered
                                      </button>
                                    )}
                                    <button
                                      onClick={() => handleDashboardDeletePR(pr.id)}
                                      className="p-1 rounded text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                                      title="Reject Request"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}

                          {prItems.length === 0 && (
                            <tr>
                              <td colSpan={6} className="py-8 text-center text-muted-foreground">
                                No active purchase requests.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* 4. BOQ & BUDGET MANAGEMENT */}
            {activeTab === 'budget' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                  {/* BOQ Tracker */}
                  <div className="lg:col-span-2 bg-white dark:bg-gray-900 p-3 rounded-xl border border-gray-100 dark:border-gray-850 shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-heading font-semibold text-gray-900 dark:text-white text-[13px]">Bill of Quantities (BOQ) Ledger</h3>
                      <span className="text-xs bg-orange-50 dark:bg-orange-950/40 text-primary border border-orange-200 px-2 py-0.5 rounded-full font-bold">Approved Baseline</span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead>
                          <tr className="border-b border-border/60 text-muted-foreground">
                            <th className="pb-3 font-bold uppercase tracking-wider text-[9px]">Code / Scope</th>
                            <th className="pb-3 font-bold uppercase tracking-wider text-[9px]">Unit Rate</th>
                            <th className="pb-3 font-bold uppercase tracking-wider text-[9px]">Qty (Est / Cons)</th>
                            <th className="pb-3 font-bold uppercase tracking-wider text-[9px]">Est Cost</th>
                            <th className="pb-3 font-bold uppercase tracking-wider text-[9px]">Actual Cost</th>
                            <th className="pb-3 font-bold uppercase tracking-wider text-[9px]">Variance</th>
                            <th className="pb-3 font-bold uppercase tracking-wider text-[9px] text-right">Progress</th>
                          </tr>
                        </thead>
                        <tbody>
                          {project!.boqItems.map((boq) => {
                            const estCost = boq.rate * boq.estimatedQty;
                            const actCost = boq.rate * (boq.consumedQty || 0);
                            const variance = estCost - actCost;
                            const ratio = Math.min(100, boq.estimatedQty > 0 ? ((boq.consumedQty || 0) / boq.estimatedQty) * 100 : 0);
                            
                            return (
                              <tr key={boq.id} className="border-b border-border/40 hover:bg-muted/30 transition-colors font-semibold">
                                <td className="py-3 pr-2">
                                  <span className="font-extrabold text-foreground">{boq.code}</span>
                                  <p className="text-[10px] text-muted-foreground font-medium line-clamp-1 mt-0.5">{boq.description}</p>
                                </td>
                                <td className="py-3 text-muted-foreground">₹{boq.rate}/{boq.unit}</td>
                                <td className="py-3 text-foreground font-medium">{boq.estimatedQty} / {boq.consumedQty}</td>
                                <td className="py-3 text-foreground">₹{(estCost / 100000).toFixed(1)}L</td>
                                <td className="py-3 text-foreground">₹{(actCost / 100000).toFixed(1)}L</td>
                                <td className="py-3">
                                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                                    variance >= 0 
                                      ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' 
                                      : 'bg-rose-500/10 text-rose-600 border-rose-500/20'
                                  }`}>
                                    {variance >= 0 ? `+₹${(variance / 100000).toFixed(1)}L` : `-₹${(Math.abs(variance) / 100000).toFixed(1)}L`}
                                  </span>
                                </td>
                                <td className="py-3 text-right">
                                  <div className="flex items-center justify-end gap-1.5">
                                    <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                                      <div className="h-full bg-primary" style={{ width: `${ratio}%` }} />
                                    </div>
                                    <span className="text-[10px] font-black">{ratio.toFixed(0)}%</span>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Add BOQ Item Form */}
                  <div className="bg-white dark:bg-gray-900 p-3 rounded-xl border border-gray-100 dark:border-gray-850 shadow-sm space-y-4">
                    <h3 className="font-heading font-semibold text-gray-900 dark:text-white text-[13px]">Add BOQ Code</h3>
                    <form onSubmit={handleBOQSubmit} className="space-y-3">
                      <div>
                        <label className="text-xs font-bold text-gray-400 uppercase">BOQ Code</label>
                        <input
                          type="text"
                          required
                          value={boqCode}
                          onChange={(e) => setBoqCode(e.target.value)}
                          placeholder="e.g. BOQ-PLAS-04"
                          className="w-full text-xs mt-1 p-2.5 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>

                      <div>
                        <label className="text-xs font-bold text-gray-400 uppercase">Item Scope Description</label>
                        <input
                          type="text"
                          required
                          value={boqDesc}
                          onChange={(e) => setBoqDesc(e.target.value)}
                          placeholder="e.g. Gypsum ceiling structural frames..."
                          className="w-full text-xs mt-1 p-2.5 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="text-xs font-bold text-gray-400 uppercase">Unit</label>
                          <input
                            type="text"
                            required
                            value={boqUnit}
                            onChange={(e) => setBoqUnit(e.target.value)}
                            placeholder="Cum/Sqm/Kg"
                            className="w-full text-xs mt-1 p-2.5 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-gray-400 uppercase">Rate (INR)</label>
                          <input
                            type="number"
                            required
                            value={boqRate || ''}
                            onChange={(e) => setBoqRate(parseFloat(e.target.value))}
                            placeholder="Rate"
                            className="w-full text-xs mt-1 p-2.5 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-gray-400 uppercase">Est. Qty</label>
                          <input
                            type="number"
                            required
                            value={boqQty || ''}
                            onChange={(e) => setBoqQty(parseFloat(e.target.value))}
                            placeholder="Volume"
                            className="w-full text-xs mt-1 p-2.5 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50"
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={currentUser.role === 'PR_TEAM'}
                        className="w-full text-xs font-bold bg-primary hover:bg-orange-800 text-white py-3 rounded-lg shadow-sm transition-colors disabled:opacity-50"
                      >
                        Submit BOQ for Approval
                      </button>
                    </form>
                  </div>
                </div>


              </div>
            )}

            {/* 5. LABOUR WORKFORCE */}
            {activeTab === 'work-order' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3">
                  {/* Labour Strength panel */}
                  <div className="bg-white dark:bg-gray-900 p-3 rounded-xl border border-gray-100 dark:border-gray-850 shadow-sm space-y-4">
                    <h3 className="font-heading font-semibold text-gray-900 dark:text-white text-[13px]">Subcontractor Labour Strength</h3>
                    
                    <div className="grid grid-cols-3 gap-3 border-b border-gray-50 dark:border-gray-850/50 pb-4">
                      <div>
                        <p className="text-xs text-gray-400 font-semibold uppercase">Total Present</p>
                        <p className="text-lg font-bold text-orange-600 dark:text-orange-400 mt-1">
                          {project!.labourRecords.reduce((acc, l) => acc + l.presentCount, 0)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 font-semibold uppercase">Total Absent</p>
                        <p className="text-lg font-bold text-gray-400 mt-1">
                          {project!.labourRecords.reduce((acc, l) => acc + l.absentCount, 0)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 font-semibold uppercase">Productivity Index</p>
                        <p className="text-lg font-bold text-emerald-600 mt-1">
                          {(project!.labourRecords.reduce((acc, l) => acc + l.productivity, 0) / (project!.labourRecords.length || 1)).toFixed(0)}%
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {project!.labourRecords.map((lab) => (
                        <div key={lab.id} className="flex justify-between items-center text-xs p-2.5 rounded-lg border border-gray-50 dark:border-gray-850 bg-gray-50/20 dark:bg-gray-950/40">
                          <div>
                            <p className="font-bold text-gray-800 dark:text-gray-200">{lab.contractorName}</p>
                            <p className="text-xs text-gray-400 mt-0.5">Overtime logs: {lab.overtimeHours} hours</p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-gray-700 dark:text-gray-300">Present: {lab.presentCount} / Absent: {lab.absentCount}</p>
                            <p className="text-xs text-emerald-600 font-bold mt-0.5">Prod: {lab.productivity}%</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}




            {/* 7. WHATSAPP COMMUNICATION CENTER */}
            {isLegacyCommunicationModuleEnabled && (
              <div className="bg-[#f0f2f5] dark:bg-[#111b21] border border-gray-200 dark:border-gray-800 rounded-xl shadow-lg flex h-[450px] overflow-hidden">
                {/* Channels List Side (1/3) */}
                <div className="w-[220px] md:w-[280px] flex-shrink-0 border-r border-gray-200 dark:border-gray-800 flex flex-col bg-white dark:bg-[#111b21]">
                  <div className="p-3.5 border-b border-gray-200 dark:border-gray-800 bg-[#f0f2f5] dark:bg-[#202c33] flex items-center justify-between h-14">
                    <p className="font-bold text-xs text-gray-800 dark:text-gray-200">Chats</p>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" title="System Online" />
                    </div>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-2 space-y-1 bg-white dark:bg-[#111b21]">
                    <button
                      onClick={() => setChatChannel('engineers')}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all relative
                        ${chatChannel === 'engineers' 
                          ? 'bg-gray-100 dark:bg-[#2a3942] text-gray-900 dark:text-white' 
                          : 'hover:bg-gray-50 dark:hover:bg-[#202c33]/50 text-gray-600 dark:text-gray-300'}`}
                    >
                      {chatChannel === 'engineers' && (
                        <span className="absolute left-0 top-3 bottom-3 w-1 bg-[#00a884] rounded-r" />
                      )}
                      <div className="w-9 h-9 rounded-full bg-emerald-100 dark:bg-emerald-950 text-[#00a884] flex items-center justify-center font-bold text-xs flex-shrink-0">
                        SE
                      </div>
                      <div className="overflow-hidden flex-1">
                        <div className="flex justify-between items-baseline">
                          <p className="text-xs font-bold truncate text-gray-900 dark:text-gray-100">Site Engineers Group</p>
                          <span className="text-[9px] opacity-60">11:02</span>
                        </div>
                        <p className="text-[10px] text-gray-400 truncate mt-0.5">Priya Nair: Site progress update...</p>
                      </div>
                    </button>

                    <button
                      onClick={() => setChatChannel('client')}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all relative
                        ${chatChannel === 'client' 
                          ? 'bg-gray-100 dark:bg-[#2a3942] text-gray-900 dark:text-white' 
                          : 'hover:bg-gray-50 dark:hover:bg-[#202c33]/50 text-gray-600 dark:text-gray-300'}`}
                    >
                      {chatChannel === 'client' && (
                        <span className="absolute left-0 top-3 bottom-3 w-1 bg-[#00a884] rounded-r" />
                      )}
                      <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-955 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-xs flex-shrink-0">
                        CL
                      </div>
                      <div className="overflow-hidden flex-1">
                        <div className="flex justify-between items-baseline">
                          <p className="text-xs font-bold truncate text-gray-900 dark:text-gray-100">Client Comm - ABG</p>
                          <span className="text-[9px] opacity-60">12:12</span>
                        </div>
                        <p className="text-[10px] text-gray-400 truncate mt-0.5">Meet Patel: Test - 9</p>
                      </div>
                    </button>

                    <button
                      onClick={() => setChatChannel('vendors')}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all relative
                        ${chatChannel === 'vendors' 
                          ? 'bg-gray-100 dark:bg-[#2a3942] text-gray-900 dark:text-white' 
                          : 'hover:bg-gray-50 dark:hover:bg-[#202c33]/50 text-gray-600 dark:text-gray-300'}`}
                    >
                      {chatChannel === 'vendors' && (
                        <span className="absolute left-0 top-3 bottom-3 w-1 bg-[#00a884] rounded-r" />
                      )}
                      <div className="w-9 h-9 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold text-xs flex-shrink-0">
                        VN
                      </div>
                      <div className="overflow-hidden flex-1">
                        <div className="flex justify-between items-baseline">
                          <p className="text-xs font-bold truncate text-gray-900 dark:text-gray-100">Steel & Cement Vendor</p>
                          <span className="text-[9px] opacity-60">Yesterday</span>
                        </div>
                        <p className="text-[10px] text-gray-400 truncate mt-0.5">UltraTech: Material dispatched...</p>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Messages Panel (2/3) */}
                <div className="flex-1 flex flex-col bg-[#efeae2] dark:bg-[#0b141a] relative">
                  {/* Active Header */}
                  <div className="h-14 border-b border-gray-200 dark:border-gray-800 px-3 flex items-center justify-between bg-[#f0f2f5] dark:bg-[#202c33] z-10">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs text-white
                        ${chatChannel === 'engineers' ? 'bg-[#00a884]' : chatChannel === 'client' ? 'bg-blue-500' : 'bg-amber-500'}`}>
                        {chatChannel === 'engineers' ? 'SE' : chatChannel === 'client' ? 'CL' : 'VN'}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-gray-850 dark:text-gray-150 leading-tight">
                          {chatChannel === 'engineers' ? 'Site Engineers Coordination Group' : 
                            chatChannel === 'client' ? 'Pramukh Surat Client Desk' : 
                            'Material Suppliers Vendor Pipeline'}
                        </p>
                        <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Online
                        </p>
                      </div>
                    </div>
                    <span className="text-[9px] text-[#00a884] bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                      Live Whatsapp
                    </span>
                  </div>

                  {/* Message Stream */}
                  <div className="flex-1 overflow-y-auto p-3 space-y-3 relative z-0">
                    {/* Add WhatsApp wallpaper pattern effect if supported */}
                    <div className="absolute inset-0 bg-repeat opacity-[0.04] pointer-events-none dark:opacity-[0.02]" 
                      style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'%3E%3Cg fill='%23000000' fill-opacity='0.4'%3E%3Cpath fill-rule='evenodd' d='M11 18c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm48 25c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zM11 68c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm58-13c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zM30 40c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0-26c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm40 5c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-40 47c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 14c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm40-14c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4z'/%3E%3C/g%3E%3C/svg%3E")` }} 
                    />

                    {whatsappChats.map((msg) => {
                      const isMe = msg.isOutbound || msg.senderName === currentUser.name || msg.senderName === 'Me';
                      
                      return (
                        <div key={msg.id} className={`flex flex-col max-w-[75%] relative z-10 ${isMe ? 'ml-auto items-end' : 'mr-auto items-start'}`}>
                          <div className={`px-3 py-1.5 rounded-xl text-xs space-y-0.5 shadow-[0_1px_0.5px_rgba(0,0,0,0.13)]
                            ${isMe 
                              ? 'bg-[#d9fdd3] dark:bg-[#005c4b] text-[#111b21] dark:text-[#e9edef] rounded-tr-none' 
                              : 'bg-white dark:bg-[#202c33] text-[#111b21] dark:text-[#e9edef] rounded-tl-none border border-transparent dark:border-gray-800/20'}`}>
                            
                            {!isMe && (
                              <div className="text-[10px] font-bold text-[#008069] dark:text-[#53bdeb] mb-0.5">
                                {msg.senderName} <span className="opacity-60 font-medium text-[8px]">({msg.senderRole.replace(' (Client Group)', '').replace(' (Supply Line)', '')})</span>
                              </div>
                            )}

                            <p className="leading-relaxed whitespace-pre-wrap pr-6 text-left break-words">{msg.message}</p>
                            
                            {/* Attachments preview */}
                            {msg.attachments && msg.attachments.length > 0 && (
                              <div className="flex items-center gap-1.5 pt-1.5 border-t border-gray-200/50 dark:border-gray-700/50 mt-1">
                                <Paperclip className="w-3 h-3 opacity-60" />
                                <span className="text-[9px] font-semibold underline cursor-pointer truncate max-w-[150px]">
                                  {msg.attachments[0].split('/').pop()}
                                </span>
                              </div>
                            )}

                            <div className="flex items-center justify-end gap-1 text-[8px] opacity-60 self-end ml-auto mt-0.5 select-none leading-none">
                              <span>{msg.timestamp.substring(11, 16)}</span>
                              {isMe && <span className="text-[#53bdeb] font-bold text-[9px] leading-none ml-0.5">✓✓</span>}
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {whatsappChats.length === 0 && (
                      <div className="py-24 text-center text-gray-400 relative z-10 flex flex-col items-center justify-center">
                        <div className="w-12 h-12 rounded-full bg-white dark:bg-[#202c33] flex items-center justify-center shadow-sm mb-3">
                          <MessageSquare className="w-6 h-6 text-[#00a884] animate-pulse" />
                        </div>
                        <p className="text-xs font-semibold text-gray-500 dark:text-gray-450">WhatsApp Sandbox Active</p>
                        <p className="text-[10px] text-gray-400 mt-1 max-w-[200px]">Send a message below to start chatting with the recipient.</p>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Message Input Box */}
                  <form onSubmit={handleSendChatMessage} className="p-2.5 bg-[#f0f2f5] dark:bg-[#202c33] border-t border-gray-200 dark:border-gray-800 flex items-center gap-2 z-10 h-14">
                    <button
                      type="button"
                      onClick={() => {
                        setChatMessageText(prev => prev + ' [Drawing Attached: L14-Beam-Reinforcement.dwg] ');
                      }}
                      className="p-2 text-gray-550 dark:text-gray-400 rounded-full hover:bg-gray-200 dark:hover:bg-[#2a3942] transition-colors"
                      title="Attach AutoCAD Drawing"
                    >
                      <Paperclip className="w-4 h-4" />
                    </button>
                    
                    <input
                      type="text"
                      required
                      value={chatMessageText}
                      onChange={(e) => setChatMessageText(e.target.value)}
                      placeholder="Type a message to WhatsApp..."
                      className="flex-1 px-3 py-2 text-xs bg-white dark:bg-[#2a3942] text-gray-900 dark:text-white border-none rounded-lg focus:outline-none placeholder-gray-400 dark:placeholder-gray-500 shadow-sm"
                    />

                    <button
                      type="submit"
                      className="w-9 h-9 rounded-full bg-[#00a884] hover:bg-[#008f72] text-white flex items-center justify-center shadow-sm transition-colors cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </form>
                </div>
              </div>
            )}

            {/* PROCUREMENT */}
            {activeTab === 'procurement' && (
              <div className="space-y-4">
                <div className="bg-white dark:bg-gray-900 p-3 rounded-xl border border-gray-100 dark:border-gray-850 shadow-sm space-y-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div>
                      <h3 className="font-heading font-semibold text-gray-900 dark:text-white text-[13px]">Procurement & RFQ Logs</h3>
                      <p className="text-xs text-gray-450 mt-0.5">Track purchase requisition pipelines and supply allocations</p>
                    </div>

                    <form onSubmit={handleProcurementSubmit} className="flex flex-wrap items-center gap-2">
                      <input type="text" required value={procTitle} onChange={(e) => setProcTitle(e.target.value)} placeholder="Material title" className="text-xs p-2 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 focus:outline-none" />
                      <input type="number" required value={procCost || ''} onChange={(e) => setProcCost(parseFloat(e.target.value))} placeholder="Est Cost" className="text-xs w-28 p-2 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 focus:outline-none" />
                      <button type="submit" disabled={currentUser.role === 'PR_TEAM'} className="text-xs font-bold bg-primary text-white px-3 py-2 rounded-lg disabled:opacity-50">Raise PR</button>
                    </form>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-gray-850 text-gray-400">
                          <th className="pb-3 font-semibold">PR Number</th>
                          <th className="pb-3 font-semibold">Description Requisition</th>
                          <th className="pb-3 font-semibold">Cost Estimate</th>
                          <th className="pb-3 font-semibold">Assigned Vendor</th>
                          <th className="pb-3 font-semibold">Order Status</th>
                          <th className="pb-3 font-semibold">Raise Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {project!.procurements.map((proc) => (
                          <tr key={proc.id} className="border-b border-gray-50 dark:border-gray-850/50">
                            <td className="py-3 font-bold">{proc.requisitionNo}</td>
                            <td className="py-3 font-medium">{proc.title}</td>
                            <td className="py-3">{formatCurrency(proc.cost)}</td>
                            <td className="py-3 text-gray-500">{proc.vendorName || '-- Unassigned --'}</td>
                            <td className="py-3">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${proc.status === 'DELIVERED' ? 'bg-emerald-50 text-success' : 'bg-amber-50 text-warning'}`}>
                                {proc.status}
                              </span>
                            </td>
                            <td className="py-3 text-gray-400">{proc.requestedDate}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* QUALITY CONTROL */}
            {activeTab === 'quality-control' && (
              <div className="space-y-4 pb-8">
                {/* QC Operation Message Alerts */}
                {qcMessage && (
                  <div className={`p-4 rounded-xl text-xs font-bold border transition-all animate-pulse ${
                    qcMessage.type === 'success'
                      ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/25'
                      : qcMessage.type === 'error'
                        ? 'bg-red-500/10 text-red-600 border-red-500/25'
                        : 'bg-blue-500/10 text-blue-600 border-blue-500/25'
                  }`}>
                    {qcMessage.type === 'success' ? '✅ ' : qcMessage.type === 'error' ? '❌ ' : 'ℹ️ '} {qcMessage.text}
                  </div>
                )}

                {/* QC Header & Navigation */}
                <div className="bg-white dark:bg-gray-900 p-4 rounded-2xl border border-border/60 shadow-sm flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                  <div>
                    <h3 className="font-heading font-black text-foreground text-sm uppercase tracking-wider flex items-center gap-1.5">
                      <ShieldCheck className="w-5 h-5 text-[#b68d40] drop-shadow-[0_2px_8px_rgba(182,141,64,0.3)]" />
                      Quality Assurance & Control (QA/QC)
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Manage work completions, inspect quality checklists, upload verification evidence, and track rework.</p>
                  </div>
                  <div className="flex flex-wrap gap-1 bg-muted p-1 rounded-xl shrink-0 self-start xl:self-center border border-border/60">
                    <button
                      onClick={() => setQcSubTab('dashboard')}
                      className={`px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                        qcSubTab === 'dashboard'
                          ? 'bg-[#b68d40] text-white shadow-xs'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      📊 Overview
                    </button>
                     <button
                      onClick={() => setQcSubTab('completion')}
                      className={`px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                        qcSubTab === 'completion'
                          ? 'bg-[#b68d40] text-white shadow-xs'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      🏗️ Active
                    </button>
                    <button
                      onClick={() => setQcSubTab('inspections')}
                      className={`px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                        qcSubTab === 'inspections'
                          ? 'bg-[#b68d40] text-white shadow-xs'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      📋 Checklist
                    </button>
                    <button
                      onClick={() => setQcSubTab('history')}
                      className={`px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                        qcSubTab === 'history'
                          ? 'bg-[#b68d40] text-white shadow-xs'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      📜 Audit History ({qcRequests.filter(r => r.status === 'Approved' || r.status === 'Pass').length})
                    </button>
                    <button
                      onClick={() => setQcSubTab('rework')}
                      className={`px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                        qcSubTab === 'rework'
                          ? 'bg-[#b68d40] text-white shadow-xs'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      ⚠️ Rework ({qcRequests.filter(r => r.status === 'Failed' || r.status === 'Fail').length})
                    </button>
                  </div>
                </div>

                {/* SUBTAB CONTENT: 1. DASHBOARD OVERVIEW */}
                {qcSubTab === 'dashboard' && (
                  <div className="space-y-4">
                    {/* QC KPIs Dashboard */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      {/* KPI 1: Pass Rate */}
                      <div className="bg-white dark:bg-gray-900 p-4.5 rounded-2xl border border-border/60 shadow-xs flex items-center justify-between">
                        <div>
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Overall QC Pass Rate</p>
                          <p className="text-xl font-heading font-extrabold text-foreground mt-1">{qcPassRateStr}</p>
                          <div className="mt-2 w-28 bg-muted h-1 rounded-full overflow-hidden">
                            <div className="bg-emerald-500 h-full" style={{ width: `${qcPassRateVal}%` }} />
                          </div>
                        </div>
                        <span className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600">
                          <CheckCircle2 className="w-5 h-5" />
                        </span>
                      </div>

                      {/* KPI 2: Active Reworks */}
                      <div className="bg-white dark:bg-gray-900 p-4.5 rounded-2xl border border-border/60 shadow-xs flex items-center justify-between">
                        <div>
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Open Rework Items</p>
                          <p className="text-xl font-heading font-extrabold text-foreground mt-1">
                            {reworkItems.filter(r => r.status !== 'Closed').length} Cases
                          </p>
                          <p className="text-[10px] text-amber-500 font-semibold mt-1">Action required by contractors</p>
                        </div>
                        <span className="p-2.5 rounded-xl bg-red-500/10 text-red-600">
                          <Wrench className="w-5 h-5" />
                        </span>
                      </div>

                      {/* KPI 3: Pending Inspections */}
                      <div className="bg-white dark:bg-gray-900 p-4.5 rounded-2xl border border-border/60 shadow-xs flex items-center justify-between">
                        <div>
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Pending Inspections</p>
                          <p className="text-xl font-heading font-extrabold text-foreground mt-1">
                            {qcRequests.filter(r => r.status === 'Pending QC Inspection' || r.status === 'Submitted').length} Requests
                          </p>
                          <p className="text-[10px] text-[#b68d40] font-semibold mt-1">Dhruv Shah (QC) assigned</p>
                        </div>
                        <span className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600">
                          <ClipboardList className="w-5 h-5" />
                        </span>
                      </div>

                      {/* KPI 4: Billing Cleared */}
                      <div className="bg-white dark:bg-gray-900 p-4.5 rounded-2xl border border-border/60 shadow-xs flex items-center justify-between">
                        <div>
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Billing Clearance Rate</p>
                          <p className="text-xl font-heading font-extrabold text-foreground mt-1">{billingClearanceRateStr}</p>
                          <p className="text-[10px] text-emerald-500 font-semibold mt-1">{clearedOrBilledCount} of {totalActivities} Activities cleared</p>
                        </div>
                        <span className="p-2.5 rounded-xl bg-blue-500/10 text-blue-600">
                          <Coins className="w-5 h-5" />
                        </span>
                      </div>
                    </div>

                    {qcRequests.length === 0 ? (
                      <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl border border-border/60 shadow-sm text-center flex flex-col items-center justify-center py-10 animate-fade-in">
                        <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-600 mb-3 border border-emerald-500/20">
                          <CheckCircle2 className="w-6 h-6" />
                        </div>
                        <h4 className="font-heading font-extrabold text-foreground text-sm uppercase tracking-wider animate-none">
                          All Quality Controls Cleared
                        </h4>
                        <p className="text-xs text-muted-foreground mt-1 max-w-md font-medium">
                          There are no active quality checklists, pending inspections, or rework alerts. All logged site operations are verified and compliant.
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* Left Column: AI Site Safety recommendations */}
                        <div className="space-y-4">
                          <div className="bg-white dark:bg-gray-900 p-4 rounded-2xl border border-border/60 shadow-sm space-y-3">
                            <h4 className="font-heading font-bold text-foreground text-xs uppercase tracking-wider flex items-center gap-2">
                              🤖 AI Vision & Safety Recommendations
                            </h4>
                            <p className="text-xs text-muted-foreground">Automatic analysis on site photo uploads. Alerts from failed/pending inspections:</p>
                            {qcRequests.filter(r => r.status === 'Failed' || r.status === 'Submitted' || r.status === 'Pending QC Inspection').length === 0 ? (
                              <div className="p-3.5 bg-emerald-500/5 border border-emerald-500/20 rounded-xl text-xs text-center">
                                <p className="font-bold text-emerald-600">✅ All inspections cleared — No active AI alerts</p>
                                <p className="text-muted-foreground mt-0.5">Submit site work completions to trigger AI vision audit queue.</p>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {qcRequests
                                  .filter(r => r.status === 'Failed' || r.status === 'Submitted' || r.status === 'Pending QC Inspection')
                                  .slice(0, 3)
                                  .map(req => {
                                    const isFailed = req.status === 'Failed';
                                    const failedPoints = req.checklist.checkpoints.filter((c: any) => c.result === 'Fail');
                                    return (
                                      <div key={req.id} className={`p-3 border rounded-xl space-y-2 text-xs ${
                                        isFailed
                                          ? 'bg-red-500/5 dark:bg-red-500/10 border-red-500/20'
                                          : 'bg-amber-500/5 dark:bg-amber-500/10 border-amber-500/20'
                                      }`}>
                                        <div className={`flex justify-between font-bold ${
                                          isFailed ? 'text-red-600 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'
                                        }`}>
                                          <span>{isFailed ? '⚠️ QC Failed:' : '🔍 Pending:'} {req.activityName}</span>
                                          <span className="text-[10px] font-semibold">{req.submittedDate}</span>
                                        </div>
                                        <p className="text-muted-foreground leading-relaxed font-medium">
                                          <span className="font-semibold text-foreground">{req.location}</span> — Contractor: {req.contractorName}.
                                          {failedPoints.length > 0
                                            ? ` ${failedPoints.length} checkpoint(s) failed: ${failedPoints[0]?.checkpoint}.`
                                            : ' Awaiting inspector verification of site checkpoints.'}
                                        </p>
                                        <div className="flex items-center gap-2">
                                          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider ${
                                            req.priority === 'CRITICAL' ? 'bg-red-500/15 text-red-600' :
                                            req.priority === 'HIGH' ? 'bg-amber-500/15 text-amber-600' :
                                            'bg-blue-500/15 text-blue-600'
                                          }`}>{req.priority}</span>
                                          <span className="text-[9px] text-muted-foreground font-semibold">Inspector: {req.assignedEngineer !== '-- Unassigned --' ? req.assignedEngineer : 'Unassigned'}</span>
                                        </div>
                                      </div>
                                    );
                                  })
                                }
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Right Column: Urgent QC Inspection Queue (Minimalist card list) */}
                        <div className="space-y-4">
                          <div className="bg-white dark:bg-gray-900 p-4 rounded-2xl border border-border/60 shadow-sm space-y-3">
                            <h4 className="font-heading font-bold text-foreground text-xs uppercase tracking-wider">
                              📋 Urgent QC Inspection Queue
                            </h4>
                            {qcRequests.filter(r => r.status === 'Submitted' || r.status === 'Pending QC Inspection').length === 0 ? (
                              <div className="p-6 bg-muted/20 border border-dashed border-border rounded-xl text-center flex flex-col items-center justify-center py-8">
                                <CheckCircle2 className="w-8 h-8 text-emerald-500/80 mb-2" />
                                <p className="font-bold text-foreground text-xs">No Pending QC Inspections</p>
                                <p className="text-[10px] text-muted-foreground mt-0.5">All quality verification requests have been reviewed and approved.</p>
                              </div>
                            ) : (
                              <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
                                {qcRequests.filter(r => r.status === 'Submitted' || r.status === 'Pending QC Inspection').map(req => (
                                  <div key={req.id} className="p-3 bg-muted/15 border border-border/60 rounded-xl space-y-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-muted/5 transition-all">
                                    <div>
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="font-extrabold text-[#b68d40] text-xs">{req.id}</span>
                                        <span className="font-bold text-foreground text-xs">{req.activityName}</span>
                                        <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider ${
                                          req.priority === 'CRITICAL' ? 'bg-red-500/10 text-red-650' :
                                          req.priority === 'HIGH' ? 'bg-amber-500/10 text-amber-650' :
                                          'bg-blue-500/10 text-blue-650'
                                        }`}>{req.priority}</span>
                                      </div>
                                      <p className="text-[10px] text-muted-foreground mt-0.5 font-medium">Loc: {req.location} | Inspector: {req.assignedEngineer}</p>
                                    </div>
                                    <div className="text-left sm:text-right shrink-0">
                                      <span className="text-[10px] text-muted-foreground font-semibold block">{req.scheduledDate || req.submittedDate}</span>
                                      <span className="text-[9px] font-black text-amber-600 uppercase tracking-wider bg-amber-500/10 px-1.5 py-0.5 rounded inline-block mt-0.5">{req.status}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Checklist templates overview */}
                    <div className="bg-white dark:bg-gray-900 p-4 rounded-2xl border border-border/60 shadow-sm space-y-3 text-left">
                      <div className="border-b border-border/40 pb-2">
                        <h4 className="font-heading font-bold text-foreground text-xs uppercase tracking-wider flex items-center gap-1.5">
                          📋 Available Checklist Templates
                        </h4>
                        <p className="text-[10px] text-muted-foreground mt-0.5 font-medium">
                          Active quality control checklist categories defined for this project.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {qcTemplates.map(tmpl => (
                          <div key={tmpl.id} className="px-3 py-1.5 bg-muted/15 border border-border/60 rounded-xl hover:border-[#b68d40]/40 transition-all flex items-center gap-2">
                            <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-[#b68d40]/10 text-[#b68d40] border border-[#b68d40]/20 uppercase tracking-wider">
                              {tmpl.category}
                            </span>
                            <span className="text-xs font-bold text-foreground">{tmpl.title}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Detailed QC Verification Logs & Archive with Filters */}
                    <div className="bg-white dark:bg-gray-900 p-4.5 rounded-2xl border border-border/60 shadow-sm space-y-4 text-left">
                      <div className="border-b border-border/60 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <h4 className="font-heading font-black text-foreground text-xs uppercase tracking-wider flex items-center gap-1.5">
                            📋 QC Verification Logs & Archive
                          </h4>
                          <p className="text-[11px] text-muted-foreground mt-0.5 font-medium">
                            Audit logs of all site work completion quality inspection reports and checklist outcomes.
                          </p>
                        </div>
                        {qcRequests.length > 0 && (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={handleExportQCAuditReport}
                              className="flex items-center gap-1.5 px-3 py-1 bg-[#b68d40] hover:bg-[#a57c30] text-white rounded-lg text-[10px] font-bold transition-all shadow-xs"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              Export Audit Report
                            </button>
                            <span className="bg-muted text-muted-foreground px-2.5 py-1 rounded-full text-[10px] font-bold border border-border animate-pulse">
                              {qcRequests.filter(req => {
                                const matchesSearch = req.activityName.toLowerCase().includes(logSearch.toLowerCase()) ||
                                                      req.location.toLowerCase().includes(logSearch.toLowerCase()) ||
                                                      req.contractorName.toLowerCase().includes(logSearch.toLowerCase());
                                const matchesStatus = logStatus === 'All' || req.status === logStatus;
                                const matchesPriority = logPriority === 'All' || req.priority === logPriority;
                                const hasRework = reworkItems.some(rw => rw.qcRef === req.id);
                                const matchesRework = logRework === 'All' || (logRework === 'Yes' && hasRework) || (logRework === 'No' && !hasRework);
                                return matchesSearch && matchesStatus && matchesPriority && matchesRework;
                              }).length} Records Found
                            </span>
                          </div>
                        )}
                      </div>

                      {qcRequests.length === 0 ? (
                        <div className="p-8 bg-muted/20 border border-dashed border-border rounded-2xl text-center flex flex-col items-center justify-center py-10">
                          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground mb-3">
                            <FolderClosed className="w-5 h-5" />
                          </div>
                          <p className="font-bold text-foreground text-xs">No Quality Verification Logs Found</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5 font-medium">Completed QC inspections and audits will be archived here for logging and billing clearance.</p>
                        </div>
                      ) : (
                        <>
                          {/* Filters Toolbar */}
                          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 pb-2">
                            <label className="block space-y-1 text-[10px]">
                              <span className="font-bold text-muted-foreground uppercase">Search Activity / Contractor</span>
                              <input
                                type="text"
                                value={logSearch}
                                onChange={e => setLogSearch(e.target.value)}
                                placeholder="Search..."
                                className="w-full p-2 rounded-lg border border-border bg-background text-foreground font-semibold text-xs outline-none focus:border-[#b68d40]"
                              />
                            </label>
                            <label className="block space-y-1 text-[10px]">
                              <span className="font-bold text-muted-foreground uppercase">QC Status</span>
                              <select
                                value={logStatus}
                                onChange={e => setLogStatus(e.target.value)}
                                className="w-full p-2 rounded-lg border border-border bg-background text-foreground font-semibold text-xs outline-none focus:border-[#b68d40]"
                              >
                                <option value="All">All Statuses</option>
                                <option value="Approved">Approved (Pass)</option>
                                <option value="Failed">Failed (Rework)</option>
                                <option value="Submitted">Submitted</option>
                                <option value="Pending QC Inspection">Pending Inspection</option>
                                <option value="Cancelled">Cancelled</option>
                              </select>
                            </label>
                            <label className="block space-y-1 text-[10px]">
                              <span className="font-bold text-muted-foreground uppercase">Rework Triggered</span>
                              <select
                                value={logRework}
                                onChange={e => setLogRework(e.target.value)}
                                className="w-full p-2 rounded-lg border border-border bg-background text-foreground font-semibold text-xs outline-none focus:border-[#b68d40]"
                              >
                                <option value="All">All</option>
                                <option value="Yes">Yes (Rework Active)</option>
                                <option value="No">No Rework</option>
                              </select>
                            </label>
                            <label className="block space-y-1 text-[10px]">
                              <span className="font-bold text-muted-foreground uppercase">Priority Filter</span>
                              <select
                                value={logPriority}
                                onChange={e => setLogPriority(e.target.value)}
                                className="w-full p-2 rounded-lg border border-border bg-background text-foreground font-semibold text-xs outline-none focus:border-[#b68d40]"
                              >
                                <option value="All">All Priorities</option>
                                <option value="CRITICAL">Critical</option>
                                <option value="HIGH">High</option>
                                <option value="MEDIUM">Medium</option>
                                <option value="LOW">Low</option>
                              </select>
                            </label>
                          </div>

                          {/* Log Table */}
                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                              <thead>
                                <tr className="border-b border-border text-muted-foreground font-semibold">
                                  <th className="pb-3 pr-2">Date / Time</th>
                                  <th className="pb-3 pr-2">Project / Site</th>
                                  <th className="pb-3 pr-2">Activity</th>
                                  <th className="pb-3 pr-2">Checklist & Result</th>
                                  <th className="pb-3 pr-2">QC Status</th>
                                  <th className="pb-3 pr-2">Uploaded Proof</th>
                                  <th className="pb-3 pr-2">QC Approval Details</th>
                                  <th className="pb-3 pr-2">Rework Status</th>
                                  <th className="pb-3 pr-2">Remarks / Defect</th>
                                  <th className="pb-3 pr-2 text-right">Work Done Qty</th>
                                  <th className="pb-3 text-right">Billing Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {qcRequests.filter(req => {
                                  const matchesSearch = req.activityName.toLowerCase().includes(logSearch.toLowerCase()) ||
                                                        req.location.toLowerCase().includes(logSearch.toLowerCase()) ||
                                                        req.contractorName.toLowerCase().includes(logSearch.toLowerCase());
                                  const matchesStatus = logStatus === 'All' || req.status === logStatus;
                                  const matchesPriority = logPriority === 'All' || req.priority === logPriority;
                                  const hasRework = reworkItems.some(rw => rw.qcRef === req.id);
                                  const matchesRework = logRework === 'All' || (logRework === 'Yes' && hasRework) || (logRework === 'No' && !hasRework);
                                  return matchesSearch && matchesStatus && matchesPriority && matchesRework;
                                }).map(req => {
                                  const completion = workCompletions.find(w => w.id === req.completionId);
                                  const hasRework = reworkItems.some(rw => rw.qcRef === req.id);
                                  const totalCheckpoints = req.checklist.checkpoints.length;
                                  const passedCheckpoints = req.checklist.checkpoints.filter((c: any) => c.result === 'Pass').length;
                                  
                                  return (
                                    <tr key={req.id} className="border-b border-border/30 hover:bg-muted/10 transition-colors">
                                      {/* Date & Time */}
                                      <td className="py-3 pr-2 text-muted-foreground whitespace-nowrap">
                                        <span className="font-bold block text-foreground">{req.submittedDate}</span>
                                        <span className="text-[10px]">10:45 AM</span>
                                      </td>

                                      {/* Project / Site */}
                                      <td className="py-3 pr-2">
                                        <div className="font-black text-foreground text-[11px] truncate max-w-[120px]" title={project?.name}>{project?.name}</div>
                                        <div className="text-[10px] text-muted-foreground truncate max-w-[120px]" title={req.location}>{req.location}</div>
                                      </td>

                                      {/* Activity */}
                                      <td className="py-3 pr-2">
                                        <span className="font-bold text-foreground block">{req.activityName}</span>
                                        <span className="text-[9px] text-muted-foreground">Contractor: {req.contractorName}</span>
                                      </td>

                                      {/* Checklist & Result */}
                                      <td className="py-3 pr-2">
                                        <span className="font-bold text-foreground block text-[11px] truncate max-w-[140px]" title={req.checklist.title}>{req.checklist.title}</span>
                                        <span className={`inline-block mt-0.5 px-2 py-0.5 rounded text-[9px] font-bold ${passedCheckpoints === totalCheckpoints ? 'bg-green-500/10 text-green-600' : passedCheckpoints > 0 ? 'bg-amber-500/10 text-amber-600' : 'bg-red-500/10 text-red-600'}`}>
                                          {passedCheckpoints} / {totalCheckpoints} Passed
                                        </span>
                                      </td>

                                      {/* Pass/Fail Status */}
                                      <td className="py-3 pr-2 font-bold">
                                        <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black border ${
                                          req.status === 'Approved'
                                            ? 'bg-green-500/10 text-green-600 border-green-500/20'
                                            : req.status === 'Failed'
                                              ? 'bg-red-500/10 text-red-600 border border-red-500/20'
                                              : 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                                        }`}>
                                          {req.status}
                                        </span>
                                      </td>

                                      {/* Uploaded Proof */}
                                      <td className="py-3 pr-2">
                                        <div className="flex gap-1">
                                          {completion?.photos && completion.photos.length > 0 ? (
                                            completion.photos.map((p: string, idx: number) => (
                                              <a key={idx} href={p} target="_blank" rel="noreferrer" className="block relative w-8 h-8 rounded border border-border hover:opacity-85 shadow-2xs bg-gray-100">
                                                <img src={p} className="w-full h-full object-cover" alt="proof" />
                                              </a>
                                            ))
                                          ) : (
                                            <span className="text-[10px] text-muted-foreground italic">None</span>
                                          )}
                                        </div>
                                      </td>

                                      {/* QC Approval Details */}
                                      <td className="py-3 pr-2 text-[10px] text-muted-foreground">
                                        {req.status === 'Approved' ? (
                                          <>
                                            <span className="font-bold text-foreground block">Approved by:</span>
                                            <span>{req.approvedBy || 'QC Eng'}</span>
                                            <span className="block text-[8px]">{req.approvedAt || req.submittedDate}</span>
                                          </>
                                        ) : req.status === 'Failed' ? (
                                          <>
                                            <span className="font-bold text-red-600 block">Rejected by:</span>
                                            <span>{req.rejectedBy || 'QC Eng'}</span>
                                            <span className="block text-[8px]">{req.rejectedAt || req.submittedDate}</span>
                                          </>
                                        ) : (
                                          <span className="italic text-gray-400">Pending Approval</span>
                                        )}
                                      </td>

                                      {/* Rework Status */}
                                      <td className="py-3 pr-2 whitespace-nowrap">
                                        <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold ${hasRework ? 'bg-red-500/10 text-red-600 border border-red-500/20' : 'bg-green-500/10 text-green-600 border border-green-500/20'}`}>
                                          {hasRework ? '⚠️ Yes (RW Active)' : '✓ No'}
                                        </span>
                                        {hasRework && (
                                          <span className="block text-[8px] text-muted-foreground font-semibold mt-0.5">
                                            {reworkItems.find(rw => rw.qcRef === req.id)?.id}
                                          </span>
                                        )}
                                      </td>

                                      {/* Remarks */}
                                      <td className="py-3 pr-2 text-[10px] text-muted-foreground max-w-[130px] truncate" title={
                                        req.checklist.checkpoints.map((c: any) => `${c.checkpoint}: ${c.observation || 'No obs'}`).join(' | ')
                                      }>
                                        {req.checklist.checkpoints.find((c: any) => c.result === 'Fail')?.observation ||
                                         req.checklist.checkpoints.find((c: any) => c.observation)?.observation ||
                                         completion?.remarks || '--'}
                                      </td>

                                      {/* Work Done (Editable) */}
                                      <td className="py-3 pr-2 text-right whitespace-nowrap font-bold">
                                        {editWcId === completion?.id ? (
                                          <div className="flex items-center gap-1.5 justify-end">
                                            <input
                                              type="number"
                                              value={editQtyValue}
                                              onChange={e => setEditQtyValue(parseFloat(e.target.value) || 0)}
                                              className="w-16 p-1 rounded border border-border bg-background text-[10px] font-bold text-foreground text-right"
                                            />
                                            <button
                                              type="button"
                                              onClick={() => handleUpdateWcQuantity(completion!.id)}
                                              className="p-1 bg-green-500 text-white rounded text-[10px] font-bold cursor-pointer hover:bg-green-600"
                                            >
                                              ✓
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => setEditWcId(null)}
                                              className="p-1 bg-gray-300 text-black rounded text-[10px] font-bold cursor-pointer hover:bg-gray-400"
                                            >
                                              ✗
                                            </button>
                                          </div>
                                        ) : (
                                          <div className="flex items-center gap-2 justify-end">
                                            <span className="font-extrabold text-foreground">{completion?.completedQty || 0} {completion?.unit || 'Sqft'}</span>
                                            {completion && (
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  setEditWcId(completion.id);
                                                  setEditQtyValue(completion.completedQty);
                                                }}
                                                className="text-[#b68d40] hover:text-[#967332] font-black text-[10px] hover:underline cursor-pointer"
                                              >
                                                Edit
                                              </button>
                                            )}
                                          </div>
                                        )}
                                      </td>

                                      {/* Billing Status */}
                                      <td className="py-3 text-right font-bold whitespace-nowrap">
                                        {req.status === 'Approved' && !hasRework ? (
                                          <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-600 rounded text-[9px] border border-emerald-500/20">
                                            BILLING CLEAR
                                          </span>
                                        ) : (
                                          <span className="px-2 py-0.5 bg-red-500/10 text-red-600 rounded text-[9px] border border-red-500/20" title="QC Pending / Failed / Rework Active">
                                            BILLING BLOCKED
                                          </span>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}

                                {qcRequests.filter(req => {
                                  const matchesSearch = req.activityName.toLowerCase().includes(logSearch.toLowerCase()) ||
                                                        req.location.toLowerCase().includes(logSearch.toLowerCase()) ||
                                                        req.contractorName.toLowerCase().includes(logSearch.toLowerCase());
                                  const matchesStatus = logStatus === 'All' || req.status === logStatus;
                                  const matchesPriority = logPriority === 'All' || req.priority === logPriority;
                                  const hasRework = reworkItems.some(rw => rw.qcRef === req.id);
                                  const matchesRework = logRework === 'All' || (logRework === 'Yes' && hasRework) || (logRework === 'No' && !hasRework);
                                  return matchesSearch && matchesStatus && matchesPriority && matchesRework;
                                }).length === 0 && (
                                  <tr>
                                    <td colSpan={11} className="py-6 text-center text-muted-foreground italic">
                                      No verification audit logs match the selected filters.
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* SUBTAB CONTENT: 2. COMPLETION ENTRY & REQUESTS */}
                {qcSubTab === 'completion' && (
                  <div className="w-full space-y-4 text-left animate-fade-in">
                    {inspectingReqId ? (
                      (() => {
                        const req = qcRequests.find(r => r.id === inspectingReqId);
                        if (!req) return null;

                        const pointsChecked = req.checklist.checkpoints.filter((c: any) => c.result !== 'Pending').length;
                        const totalPoints = req.checklist.checkpoints.length;
                        const hasFailedPoints = req.checklist.checkpoints.some((c: any) => c.result === 'Fail');

                        return (
                          <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl border border-border/60 shadow-sm space-y-6 text-left max-w-3xl mx-auto animate-none">
                            {/* Header */}
                            <div className="border-b border-border/60 pb-3 flex items-start gap-3">
                              <button
                                type="button"
                                onClick={() => {
                                  setInspectingReqId(null);
                                  setAttachedPhotos([]);
                                  setReworkTargetDate('');
                                  setReworkDesc('');
                                }}
                                className="p-2 hover:bg-muted rounded-full transition-colors text-muted-foreground hover:text-foreground cursor-pointer shrink-0 mt-0.5"
                                title="Back to Active list"
                              >
                                <ArrowLeft className="w-5 h-5" />
                              </button>
                              <div className="flex-1">
                                <p className="text-[10px] text-muted-foreground font-bold tracking-wide uppercase">
                                  (Target/Planned: {req.scheduledDate || req.submittedDate}) and {req.assignedEngineer && req.assignedEngineer !== '-- Unassigned --' ? `Confirmed assignment to ${req.assignedEngineer}` : 'Awaiting QC inspector scheduling confirmation'}
                                </p>
                                <h4 className="font-heading font-black text-foreground text-lg uppercase tracking-wider mt-2 text-[#b68d40]">
                                  {req.category || 'Masonry & Plastering'}
                                </h4>
                                <p className="font-bold text-foreground text-sm mt-1">{req.activityName}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">{req.submittedDate}</p>
                              </div>
                            </div>

                            {/* CHECKLIST ITEMS */}
                            <div className="space-y-4">
                              <h5 className="font-heading font-bold text-foreground text-xs uppercase tracking-wider border-b border-border/40 pb-1.5">
                                CHECKLIST ITEMS
                              </h5>
                              <div className="space-y-4">
                                {req.checklist.checkpoints.map((cp: any, idx: number) => (
                                  <div key={idx} className="p-4 bg-muted/10 border border-border/40 rounded-xl space-y-3">
                                    <p className="font-bold text-foreground text-xs">{idx + 1}. {cp.checkpoint}</p>
                                    <div className="flex gap-2">
                                      <button
                                        type="button"
                                        onClick={() => handleSetQcCheckpointResult(req.id, idx, 'Pass')}
                                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                          cp.result === 'Pass' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/25'
                                        }`}
                                      >
                                        Pass
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleSetQcCheckpointResult(req.id, idx, 'Fail')}
                                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                          cp.result === 'Fail' ? 'bg-red-600 text-white shadow-xs' : 'bg-red-500/10 text-red-650 border border-red-500/25'
                                        }`}
                                      >
                                        Fail
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleSetQcCheckpointResult(req.id, idx, 'NA')}
                                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                          cp.result === 'NA' ? 'bg-gray-500 text-white shadow-xs' : 'bg-gray-500/10 text-gray-500 border border-gray-500/25'
                                        }`}
                                      >
                                        NA
                                      </button>
                                    </div>
                                    <input
                                      type="text"
                                      value={cp.observation || ''}
                                      onChange={(e) => handleEditCheckpointObservation(req.id, idx, e.target.value)}
                                      placeholder={idx === 0 ? "Defect identified" : "Remarks / Corrections"}
                                      className="w-full text-xs p-2.5 rounded-lg border border-border bg-background text-foreground outline-none focus:border-[#b68d40] font-semibold"
                                    />
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Attachments Section */}
                            <div className="space-y-3 pt-3 border-t border-border/40">
                              <h5 className="font-heading font-bold text-foreground text-xs uppercase tracking-wider">
                                Attachments Section
                              </h5>
                              <div className="flex flex-wrap gap-2">
                                <label className="px-4 py-2 bg-secondary text-secondary-foreground hover:bg-[#b68d40] hover:text-white transition-colors text-xs font-bold rounded-lg cursor-pointer border border-border">
                                  📁 Add from Gallery
                                  <input
                                    type="file"
                                    multiple
                                    accept="image/*"
                                    onChange={(e) => handlePhotoUpload(e.target.files)}
                                    className="hidden"
                                  />
                                </label>
                                <label className="px-4 py-2 bg-secondary text-secondary-foreground hover:bg-[#b68d40] hover:text-white transition-colors text-xs font-bold rounded-lg cursor-pointer border border-border">
                                  📷 Capture Photo
                                  <input
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    onChange={(e) => handlePhotoUpload(e.target.files)}
                                    className="hidden"
                                  />
                                </label>
                              </div>
                              {attachedPhotos.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-2">
                                  {attachedPhotos.map((photo, pIdx) => (
                                    <div key={pIdx} className="relative w-20 h-20 rounded-lg overflow-hidden border border-border shadow-xs shrink-0 bg-gray-100">
                                      <img src={photo} className="w-full h-full object-cover" alt="site work proof" />
                                      <button
                                        type="button"
                                        onClick={() => setAttachedPhotos(prev => prev.filter((_, i) => i !== pIdx))}
                                        className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] hover:bg-red-650 transition-colors"
                                      >
                                        ×
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Rework form inline if any failed points */}
                            {hasFailedPoints && (
                              <div className="p-4 border border-red-500/25 bg-red-500/5 dark:bg-red-950/20 rounded-xl space-y-3">
                                <h6 className="font-bold text-red-600 dark:text-red-400 text-xs uppercase tracking-wide">Rework Corrective Action Details</h6>
                                <label className="block space-y-1">
                                  <span className="font-bold text-muted-foreground uppercase text-[10px]">Target Correction Date *</span>
                                  <input
                                    type="date"
                                    value={reworkTargetDate}
                                    onChange={e => setReworkTargetDate(e.target.value)}
                                    className="w-full text-xs p-2.5 rounded-lg border border-border bg-background text-foreground outline-none focus:border-[#b68d40] font-semibold"
                                  />
                                </label>
                                <label className="block space-y-1">
                                  <span className="font-bold text-muted-foreground uppercase text-[10px]">Defect Details & Rectification Instructions *</span>
                                  <textarea
                                    value={reworkDesc}
                                    onChange={e => setReworkDesc(e.target.value)}
                                    rows={3}
                                    placeholder="Write instructions on how to patch, align, dismantle, or retest..."
                                    className="w-full text-xs p-2.5 rounded-lg border border-border bg-background text-foreground outline-none focus:border-[#b68d40] font-semibold"
                                  />
                                </label>
                              </div>
                            )}

                            {/* Actions */}
                            <div className="flex gap-3 pt-4 border-t border-border/40">
                              <button
                                type="button"
                                onClick={() => {
                                  setInspectingReqId(null);
                                  setAttachedPhotos([]);
                                  setReworkTargetDate('');
                                  setReworkDesc('');
                                }}
                                className="flex-1 py-2.5 bg-secondary text-secondary-foreground hover:bg-gray-305 font-extrabold text-xs uppercase rounded-lg transition-all cursor-pointer border border-border"
                              >
                                Suspend Check
                              </button>
                              <button
                                type="button"
                                onClick={handleSubmitInspectionResults}
                                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs uppercase rounded-lg transition-all cursor-pointer"
                              >
                                Submit Results
                              </button>
                            </div>
                          </div>
                        );
                      })()
                    ) : (
                      <div className="bg-white dark:bg-gray-900 p-4.5 rounded-2xl border border-border/60 shadow-sm space-y-4">
                        <div className="border-b border-border/60 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <h4 className="font-heading font-black text-foreground text-xs uppercase tracking-wider flex items-center gap-1.5">
                              🏗️ Active Inspection Requests
                            </h4>
                            <p className="text-[11px] text-muted-foreground mt-0.5 font-medium">
                              Requests currently pending QC Inspection. Select Inspect Check to start verifying.
                            </p>
                          </div>
                          <span className="bg-[#b68d40]/10 text-[#b68d40] px-2.5 py-1 rounded-full text-[10px] font-bold border border-[#b68d40]/25">
                            {qcRequests.filter(r => r.status === 'Submitted' || r.status === 'Pending QC Inspection').length} Active Requests
                          </span>
                        </div>

                        <div className="space-y-4">
                          {qcRequests.filter(r => r.status === 'Submitted' || r.status === 'Pending QC Inspection').length === 0 ? (
                            <div className="text-center py-12 border border-dashed border-border rounded-2xl bg-muted/5">
                              <ClipboardList className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                              <p className="text-xs font-bold text-foreground">No pending requests found</p>
                              <p className="text-[10px] text-muted-foreground mt-0.5">All active submissions have been processed.</p>
                            </div>
                          ) : (
                            qcRequests.filter(r => r.status === 'Submitted' || r.status === 'Pending QC Inspection').map(req => {
                              const pointsChecked = req.checklist.checkpoints.filter((c: any) => c.result !== 'Pending').length;
                              const totalPoints = req.checklist.checkpoints.length;
                              const inspector = req.assignedEngineer && req.assignedEngineer !== '-- Unassigned --' ? req.assignedEngineer : (currentUser.name || 'QC Inspector');

                              return (
                                <div key={req.id} className="p-4.5 bg-muted/15 border border-border/60 rounded-2xl space-y-3 hover:bg-muted/5 transition-all duration-300">
                                  <div className="flex flex-wrap items-center justify-between gap-3">
                                    <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-[#b68d40]/10 text-[#b68d40] border border-[#b68d40]/20 uppercase tracking-wider">
                                      {req.category || 'General'}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground font-semibold">
                                      {req.submittedDate}
                                    </span>
                                  </div>

                                  <h5 className="font-extrabold text-foreground text-sm mt-1">{req.activityName}</h5>
                                  
                                  <div className="flex flex-wrap justify-between items-center gap-2 pt-2 border-t border-border/40">
                                    <p className="text-xs text-muted-foreground font-medium">
                                      Items checked: {pointsChecked} / {totalPoints}, with QC inspector: {inspector}
                                    </p>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setInspectingReqId(req.id);
                                        setAttachedPhotos(req.photos || []);
                                      }}
                                      className="px-4 py-2 bg-[#b68d40] hover:bg-[#967332] text-white transition-all text-xs font-bold rounded-lg cursor-pointer shadow-2xs"
                                    >
                                      Inspect Check
                                    </button>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* SUBTAB CONTENT: 3. INSPECTIONS & CHECKLISTS */}
                {/* SUBTAB CONTENT: 3. CHECKLIST TEMPLATES */}
                {qcSubTab === 'inspections' && (
                  <div className="bg-white dark:bg-gray-900 p-5 rounded-2xl border border-border/60 shadow-sm space-y-4 text-left">
                    <div className="border-b border-border/60 pb-2 flex justify-between items-center">
                      <div>
                        <h4 className="font-heading font-black text-foreground text-xs uppercase tracking-wider flex items-center gap-1.5">
                          📋 Checklist Templates
                        </h4>
                        <p className="text-[11px] text-muted-foreground mt-0.5 font-medium">
                          Manage standard checklist specifications.
                        </p>
                      </div>
                    </div>

                    {/* Create Custom Template form */}
                    <form onSubmit={handleCreateNewTemplate} className="p-3.5 bg-muted/10 border border-border/40 rounded-xl space-y-2.5">
                      <div className="flex flex-col sm:flex-row gap-3 items-end">
                        <div className="flex-1 w-full space-y-1">
                          <label className="text-[9px] font-bold text-muted-foreground uppercase">Template Name</label>
                          <input
                            type="text"
                            value={newTemplateTitle}
                            onChange={e => setNewTemplateTitle(e.target.value)}
                            placeholder="e.g. Concrete Slump Check"
                            className="w-full text-xs p-2 rounded-lg border border-border bg-background text-foreground outline-none focus:border-[#b68d40] font-semibold"
                            required
                          />
                        </div>
                        <div className="flex-1 w-full space-y-1">
                          <label className="text-[9px] font-bold text-muted-foreground uppercase">Checkpoints (One point per line)</label>
                          <textarea
                            value={newTemplatePoints}
                            onChange={e => setNewTemplatePoints(e.target.value)}
                            placeholder="e.g.&#10;Brickwork line, level and plumb&#10;Mortar mix ratio check"
                            rows={1}
                            className="w-full text-xs p-2 rounded-lg border border-border bg-background text-foreground outline-none focus:border-[#b68d40] font-semibold"
                            required
                          />
                        </div>
                        <button
                          type="submit"
                          className="px-4 py-2 bg-[#b68d40] hover:bg-[#967332] text-white transition-colors text-xs font-bold rounded-lg cursor-pointer h-[34px] shrink-0"
                        >
                          Create
                        </button>
                      </div>
                    </form>

                    {/* Templates List with inline editing in list/dropdown format */}
                    <div className="space-y-3 mt-2">
                      {qcTemplates.map(tmpl => {
                        const isExpanded = expandedTemplates[tmpl.id];
                        return (
                          <div key={tmpl.id} className="border border-border/40 rounded-xl bg-muted/5 overflow-hidden transition-all duration-200">
                            {/* Header Row acting as Accordion Toggle */}
                            <button
                              type="button"
                              onClick={() => setExpandedTemplates(prev => ({ ...prev, [tmpl.id]: !prev[tmpl.id] }))}
                              className="w-full flex items-center justify-between p-3.5 hover:bg-muted/10 transition-colors text-left cursor-pointer"
                            >
                              <div className="flex flex-col">
                                <span className="text-[9px] font-black text-muted-foreground uppercase tracking-wider">
                                  {tmpl.category}
                                </span>
                                <h5 className="font-heading font-extrabold text-foreground text-xs mt-0.5">{tmpl.title}</h5>
                              </div>
                              <span className="text-muted-foreground p-1 hover:text-foreground">
                                {isExpanded ? (
                                  <ChevronUp className="w-4 h-4 text-[#b68d40]" />
                                ) : (
                                  <ChevronDown className="w-4 h-4" />
                                )}
                              </span>
                            </button>

                            {/* Collapsible Dropdown Content */}
                            {isExpanded && (
                              <div className="p-3.5 pt-0 border-t border-border/20 bg-background/25 space-y-3">
                                <div className="space-y-1 mt-2">
                                  {tmpl.checkpoints.map((cp: string, cIdx: number) => (
                                    <div key={cIdx} className="flex gap-1.5 items-center group/item">
                                      <span className="text-[9px] text-muted-foreground font-black w-3.5 text-right">{cIdx + 1}.</span>
                                      <input
                                        type="text"
                                        value={cp}
                                        onChange={(e) => handleUpdateTemplateCheckpoint(tmpl.id, cIdx, e.target.value)}
                                        className="flex-1 text-xs px-1.5 py-0.5 rounded border border-transparent hover:border-border/30 bg-transparent focus:bg-background text-foreground focus:border-[#b68d40] outline-none transition-all font-medium"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveTemplateCheckpoint(tmpl.id, cIdx)}
                                        className="p-1 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded transition-colors opacity-0 group-hover/item:opacity-100 focus:opacity-100"
                                        title="Remove checkpoint"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  ))}
                                </div>

                                {/* Add checkpoint inline */}
                                <div className="flex gap-2 pt-2 border-t border-border/20 mt-2">
                                  <input
                                    type="text"
                                    id={`add-cp-input-${tmpl.id}`}
                                    placeholder="Add checkpoint..."
                                    className="flex-1 text-[11px] px-2 py-1 rounded border border-border/40 bg-background text-foreground focus:border-[#b68d40] outline-none font-semibold"
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        const val = (e.target as HTMLInputElement).value;
                                        if (val.trim()) {
                                          handleAddTemplateCheckpoint(tmpl.id, val.trim());
                                          (e.target as HTMLInputElement).value = '';
                                        }
                                      }
                                    }}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const input = document.getElementById(`add-cp-input-${tmpl.id}`) as HTMLInputElement;
                                      if (input && input.value.trim()) {
                                        handleAddTemplateCheckpoint(tmpl.id, input.value.trim());
                                        input.value = '';
                                      }
                                    }}
                                    className="px-3 py-1 bg-secondary text-secondary-foreground hover:bg-[#b68d40] hover:text-white transition-colors text-xs font-bold rounded"
                                  >
                                    Add
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* SUBTAB CONTENT: 3.5 AUDIT HISTORY */}
                {qcSubTab === 'history' && (
                  <div className="bg-white dark:bg-gray-900 p-4.5 rounded-2xl border border-border/60 shadow-sm space-y-4 text-left">
                    <div className="border-b border-border/60 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <h4 className="font-heading font-black text-foreground text-xs uppercase tracking-wider flex items-center gap-1.5">
                          📜 QC Inspection Audit History
                        </h4>
                        <p className="text-[11px] text-muted-foreground mt-0.5 font-medium">
                          Archived record of all approved and passed quality control inspections.
                        </p>
                      </div>
                      <span className="bg-emerald-500/10 text-emerald-650 px-2.5 py-1 rounded-full text-[10px] font-bold border border-emerald-500/25">
                        {qcRequests.filter(r => r.status === 'Approved' || r.status === 'Pass').length} Passed
                      </span>
                    </div>

                    <div className="space-y-4">
                      {qcRequests.filter(r => r.status === 'Approved' || r.status === 'Pass').length === 0 ? (
                        <div className="text-center py-12 border border-dashed border-border rounded-2xl bg-muted/5">
                          <CheckCircle2 className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                          <p className="text-xs font-bold text-foreground">No approved inspections yet</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">Approved checklists will be logged here for audit tracking.</p>
                        </div>
                      ) : (
                        qcRequests.filter(r => r.status === 'Approved' || r.status === 'Pass').map(req => {
                          const isExpanded = expandedAudits[req.id];
                          const isUuid = req.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.id);
                          return (
                            <div key={req.id} className="border border-border/40 rounded-xl bg-muted/5 overflow-hidden transition-all duration-200">
                              {/* Accordion Toggle Header */}
                              <button
                                type="button"
                                onClick={() => setExpandedAudits(prev => ({ ...prev, [req.id]: !prev[req.id] }))}
                                className="w-full flex items-center justify-between p-3.5 hover:bg-muted/10 transition-colors text-left cursor-pointer"
                              >
                                <div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {!isUuid && (
                                      <span className="font-extrabold text-[#b68d40] text-xs">{req.id}</span>
                                    )}
                                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-650 border border-emerald-500/20 uppercase tracking-wider">
                                      {req.category || 'General'}
                                    </span>
                                  </div>
                                  <h5 className="font-heading font-extrabold text-foreground text-xs mt-1">{req.activityName}</h5>
                                  <p className="text-[10px] text-muted-foreground mt-0.5 font-medium">Location: {req.location}</p>
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                  <div className="text-right hidden sm:block">
                                    <span className="text-emerald-650 font-bold text-[10px] block">QC Passed</span>
                                    <span className="text-[9px] text-muted-foreground block mt-0.5">{req.approvedAt || req.scheduledDate || req.submittedDate}</span>
                                  </div>
                                  <span className="text-muted-foreground p-1">
                                    {isExpanded ? (
                                      <ChevronUp className="w-4 h-4 text-emerald-600" />
                                    ) : (
                                      <ChevronDown className="w-4 h-4" />
                                    )}
                                  </span>
                                </div>
                              </button>

                              {/* Dropdown Content */}
                              {isExpanded && (
                                <div className="p-3.5 pt-0 border-t border-border/20 bg-background/25 space-y-3">
                                  <div className="flex flex-wrap justify-between items-start gap-2 pt-2 border-b border-border/10 pb-2">
                                    <div>
                                      <p className="text-[10px] text-muted-foreground font-medium">Verified by: <span className="font-bold text-foreground">{req.approvedBy || req.assignedEngineer || 'QC Engineer'}</span></p>
                                    </div>
                                    <div className="text-right">
                                      <p className="text-[10px] text-muted-foreground font-medium">Approval Date: <span className="font-bold text-foreground">{req.approvedAt || req.scheduledDate || req.submittedDate}</span></p>
                                    </div>
                                  </div>

                                  {/* Checkpoints */}
                                  <div className="space-y-1.5 mt-2">
                                    <p className="text-[10px] font-bold text-muted-foreground uppercase">Verified Checkpoints:</p>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                      {req.checklist.checkpoints.map((cp: any, idx: number) => (
                                        <div key={idx} className="flex items-center justify-between text-[10px] bg-background/50 p-2 rounded border border-border/40">
                                          <span className="font-medium text-foreground">{idx + 1}. {cp.checkpoint}</span>
                                          <span className="text-emerald-650 font-bold uppercase text-[9px] bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                                            {cp.result}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>

                                  {/* Attached Photos */}
                                  {req.photos && req.photos.length > 0 && (
                                    <div className="space-y-1.5 pt-2 border-t border-border/20">
                                      <p className="text-[10px] text-muted-foreground uppercase font-bold">Inspection Photo Proof:</p>
                                      <div className="flex flex-wrap gap-2">
                                        {req.photos.map((p: string, pIdx: number) => (
                                          <div key={pIdx} className="relative w-16 h-16 rounded-lg overflow-hidden border border-border shadow-xs shrink-0">
                                            <img src={p} className="w-full h-full object-cover" alt="proof" />
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}

                {/* SUBTAB CONTENT: 4. REWORK TRACKING */}
                {qcSubTab === 'rework' && (() => {
                  const activeReworks = reworkItems.filter(rw => rw.status !== 'Closed');

                  return (
                    <div className="bg-white dark:bg-gray-900 p-4.5 rounded-2xl border border-border/60 shadow-sm space-y-4 text-left">
                      <div className="border-b border-border/60 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <h4 className="font-heading font-black text-foreground text-xs uppercase tracking-wider flex items-center gap-1.5">
                            ⚠️ Rework & Corrective Actions Tracking
                          </h4>
                          <p className="text-[11px] text-muted-foreground mt-0.5 font-medium">
                            Logs failed QC inspections, responsible parties, correction dates, and reinspection workflows.
                          </p>
                        </div>
                        <span className="bg-red-500/10 text-red-650 px-2.5 py-1 rounded-full text-[10px] font-bold border border-red-500/25 shrink-0 self-start sm:self-center">
                          {activeReworks.length} Active Failed QC
                        </span>
                      </div>

                      <div className="space-y-4">
                        {activeReworks.length === 0 ? (
                          <div className="text-center py-12 border border-dashed border-border rounded-2xl bg-muted/5">
                            <CheckCircle2 className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                            <p className="text-xs font-bold text-foreground">No active rework tasks</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5 font-medium">All failed works corrected and approved.</p>
                          </div>
                        ) : (
                          activeReworks.map(rw => {
                            const req = qcRequests.find(r => r.id === rw.qcRef);
                            const isExpanded = expandedReworks[rw.id];
                            const isUuid = rw.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rw.id);

                            return (
                              <div key={rw.id} className="border border-border/40 rounded-xl bg-muted/5 overflow-hidden transition-all duration-200">
                                {/* Accordion Toggle Header */}
                                <button
                                  type="button"
                                  onClick={() => setExpandedReworks(prev => ({ ...prev, [rw.id]: !prev[rw.id] }))}
                                  className="w-full flex items-center justify-between p-3.5 hover:bg-muted/10 transition-colors text-left cursor-pointer"
                                >
                                  <div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                      {!isUuid && (
                                        <span className="font-extrabold text-[#b68d40] text-xs">{rw.id}</span>
                                      )}
                                      <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-[#b68d40]/10 text-[#b68d40] border border-[#b68d40]/20 uppercase tracking-wider">
                                        {rw.category || 'General'}
                                      </span>
                                    </div>
                                    <h5 className="font-heading font-extrabold text-foreground text-xs mt-1">{rw.activityName}</h5>
                                    <p className="text-[10px] text-muted-foreground mt-0.5 font-medium">Location: {rw.location}</p>
                                  </div>
                                  <div className="flex items-center gap-3 shrink-0">
                                    <div className="text-right hidden sm:block">
                                      <span className={`font-bold text-[10px] block ${
                                        rw.status === 'Corrected' ? 'text-blue-650' : 'text-red-650'
                                      }`}>
                                        {rw.status === 'Corrected' ? '🔵 Awaiting Re-test' : '🔴 Contractor Correcting'}
                                      </span>
                                      <span className="text-[9px] text-muted-foreground block mt-0.5">Target: {rw.targetDate}</span>
                                    </div>
                                    <span className="text-muted-foreground p-1">
                                      {isExpanded ? (
                                        <ChevronUp className={`w-4 h-4 ${rw.status === 'Corrected' ? 'text-blue-600' : 'text-red-600'}`} />
                                      ) : (
                                        <ChevronDown className="w-4 h-4" />
                                      )}
                                    </span>
                                  </div>
                                </button>

                                {/* Dropdown Content */}
                                {isExpanded && (
                                  <div className="p-3.5 pt-0 border-t border-border/20 bg-background/25 space-y-3">
                                    <div className="flex flex-wrap justify-between items-start gap-2 pt-2 border-b border-border/10 pb-2 text-[10px]">
                                      <div>
                                        <p className="text-muted-foreground font-medium">Responsible Party: <span className="font-bold text-foreground">{rw.responsiblePerson}</span></p>
                                        <p className="text-muted-foreground font-medium mt-0.5">Defect Description: <span className="font-bold text-foreground">{rw.issueDescription}</span></p>
                                      </div>
                                      <div className="text-right">
                                        <p className="text-muted-foreground font-medium">Target Date: <span className="font-bold text-foreground">{rw.targetDate}</span></p>
                                      </div>
                                    </div>

                                    {/* Rework Remarks */}
                                    {rw.remarks && (
                                      <div className="p-2.5 bg-amber-500/5 border border-amber-500/10 rounded-lg text-[10px] text-amber-700 dark:text-amber-400">
                                        <span className="font-bold">Latest Remarks: </span>{rw.remarks}
                                      </div>
                                    )}

                                    {/* Checkpoints of original request */}
                                    {req?.checklist?.checkpoints && (
                                      <div className="space-y-1.5 mt-2">
                                        <p className="text-[10px] font-bold text-muted-foreground uppercase">QC Checkpoints Status:</p>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                          {req.checklist.checkpoints.map((cp: any, idx: number) => (
                                            <div key={idx} className="bg-background/50 p-2 rounded border border-border/40 space-y-1 text-[10px]">
                                              <div className="flex items-center justify-between">
                                                <span className="font-medium text-foreground">{idx + 1}. {cp.checkpoint}</span>
                                                <span className={`font-bold uppercase text-[9px] px-1.5 py-0.5 rounded border ${
                                                  cp.result === 'Fail'
                                                    ? 'bg-red-500/10 text-red-650 border-red-500/20'
                                                    : cp.result === 'Pass'
                                                      ? 'bg-emerald-500/10 text-emerald-650 border-emerald-500/20'
                                                      : 'bg-muted text-muted-foreground border-border'
                                                }`}>
                                                  {cp.result}
                                                </span>
                                              </div>
                                              {cp.observation && (
                                                <p className="text-[9px] text-amber-600 dark:text-amber-500 font-semibold pl-3">
                                                  Observation: {cp.observation}
                                                </p>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    {/* Actions */}
                                    <div className="flex justify-end gap-2 pt-2 border-t border-border/10">
                                      {rw.status === 'Assigned' && (
                                        <button
                                          type="button"
                                          onClick={() => handleMarkReworkCorrected(rw.id)}
                                          className="text-[10px] font-bold bg-[#b68d40] hover:bg-[#967332] text-white px-3 py-1.5 rounded-lg transition-all cursor-pointer"
                                        >
                                          Mark Corrected
                                        </button>
                                      )}
                                      {rw.status === 'Corrected' && (
                                        <button
                                          type="button"
                                          onClick={() => handleReinspectRework(rw.id)}
                                          className="text-[10px] font-bold bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg transition-all cursor-pointer"
                                        >
                                          Run Re-inspection
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* VENDOR MANAGEMENT */}
            {activeTab === 'vendor-management' && (
              <div className="space-y-4">
                {/* Header Widget */}
                <div className="bg-white dark:bg-gray-900 p-4 rounded-2xl border border-border/60 shadow-sm flex items-center justify-between">
                  <div>
                    <h3 className="font-heading font-bold text-foreground text-xs uppercase tracking-wider">Vendor Performance & Ledger</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Track procurement supplier scorecards, delivery logistics ratings, and recent contract accounts payable.</p>
                  </div>
                  <span className="text-xs font-semibold bg-[#b68d40]/10 text-[#b68d40] px-3 py-1 rounded-full border border-[#b68d40]/25">
                    {vendors.length} Registered Suppliers
                  </span>
                </div>

                {/* Scorecards and Payments Subgrid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {/* Left columns: Vendor Scorecards registry */}
                  <div className="lg:col-span-2 bg-white dark:bg-gray-900 p-4 rounded-2xl border border-border/60 shadow-sm space-y-4">
                    <h4 className="font-heading font-bold text-foreground text-xs uppercase tracking-wider">
                      Supplier Quality & Speed Scorecard
                    </h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-border text-muted-foreground font-semibold">
                            <th className="pb-3">Supplier Name</th>
                            <th className="pb-3">Category</th>
                            <th className="pb-3">Quality Pass Rate</th>
                            <th className="pb-3">Delivery Speed</th>
                            <th className="pb-3">Overall Score</th>
                            <th className="pb-3 text-right">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {vendors.map(vendor => (
                            <tr key={vendor.id} className="border-b border-border/30 hover:bg-muted/10 transition-colors">
                              <td className="py-3 font-bold text-foreground">{vendor.name}</td>
                              <td className="py-3 text-muted-foreground">{vendor.category}</td>
                              <td className="py-3">
                                <div className="flex items-center gap-1.5">
                                  <div className="w-16 bg-muted h-1.5 rounded-full overflow-hidden">
                                    <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${vendor.qualityPass}%` }} />
                                  </div>
                                  <span className="font-semibold text-[10px]">{vendor.qualityPass}%</span>
                                </div>
                              </td>
                              <td className="py-3">
                                <div className="flex items-center gap-1.5">
                                  <div className="w-16 bg-muted h-1.5 rounded-full overflow-hidden">
                                    <div className="bg-[#b68d40] h-full rounded-full" style={{ width: `${vendor.deliverySpeed}%` }} />
                                  </div>
                                  <span className="font-semibold text-[10px]">{vendor.deliverySpeed}% On-time</span>
                                </div>
                              </td>
                              <td className="py-3">
                                <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                                  vendor.rating >= 90
                                    ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/25'
                                    : vendor.rating >= 80
                                      ? 'bg-blue-500/10 text-blue-600 border-blue-500/25'
                                      : 'bg-red-500/10 text-red-600 border-red-500/25'
                                }`}>
                                  {vendor.rating} / 100
                                </span>
                              </td>
                              <td className="py-3 text-right">
                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                                  vendor.status === 'PREMIUM'
                                    ? 'bg-[#b68d40]/10 text-[#b68d40] border-[#b68d40]/25'
                                    : vendor.status === 'APPROVED'
                                      ? 'bg-blue-500/10 text-blue-600 border-blue-500/25'
                                      : 'bg-amber-500/10 text-amber-600 border-amber-500/25'
                                }`}>
                                  {vendor.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Right column: Recent payments logs */}
                  <div className="bg-white dark:bg-gray-900 p-4 rounded-2xl border border-border/60 shadow-sm space-y-4">
                    <h4 className="font-heading font-bold text-foreground text-xs uppercase tracking-wider flex items-center gap-2">
                      💰 Accounts Payable & Payments
                    </h4>
                    <p className="text-xs text-muted-foreground">Recent transactions ledger logged for project subcontracts.</p>
                    <div className="space-y-3">
                      {vendorPayments.map(pay => (
                        <div key={pay.id} className="p-3 border border-border/40 rounded-xl space-y-1.5 text-xs">
                          <div className="flex justify-between items-center font-bold">
                            <span className="text-foreground truncate max-w-[150px]">{pay.vendor}</span>
                            <span className="text-[#b68d40]">{formatCurrency(pay.amount)}</span>
                          </div>
                          <div className="flex justify-between items-center text-muted-foreground text-[10px]">
                            <span>Date: {pay.date} | Ref: {pay.ref}</span>
                            <span className={`px-1.5 py-0.5 rounded font-bold border ${
                              pay.status === 'PAID'
                                ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/25'
                                : pay.status === 'HELD'
                                  ? 'bg-red-500/10 text-red-600 border-red-500/25'
                                  : 'bg-amber-500/10 text-amber-600 border-amber-500/25'
                            }`}>
                              {pay.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* DOCUMENT CONTROL */}
            {activeTab === 'document-control' && (
              <div className="space-y-4">
                {/* Header Widget */}
                <div className="bg-white dark:bg-gray-900 p-4 rounded-2xl border border-border/60 shadow-sm flex items-center justify-between">
                  <div>
                    <h3 className="font-heading font-bold text-foreground text-xs uppercase tracking-wider">Drawing Registry & Document Control</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Access structural blueprints, RERA certificates, municipal approvals, and drawing revisions logs.</p>
                  </div>
                  <span className="text-xs font-semibold bg-[#b68d40]/10 text-[#b68d40] px-3 py-1 rounded-full border border-[#b68d40]/25">
                    {localDocs.length} Active Drawings
                  </span>
                </div>

                {/* Collapsible Gallery Dropdown */}
                <div className="bg-white dark:bg-gray-900 rounded-2xl border border-border/60 shadow-sm overflow-hidden transition-all duration-300">
                  {/* Gallery Toggle Header */}
                  <button
                    onClick={() => setGalleryOpen(!galleryOpen)}
                    className="w-full flex items-center justify-between p-4 font-heading hover:bg-muted/10 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-lg bg-[#b68d40]/10 text-[#b68d40]">
                        <ImageIcon className="w-5 h-5" />
                      </div>
                      <div className="text-left">
                        <h4 className="font-bold text-foreground text-xs uppercase tracking-wider flex items-center gap-2">
                          Project Site Media Gallery
                        </h4>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          View live photos and videos captured on-site from the mobile app
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-semibold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-3 py-1 rounded-full border border-border/50">
                        {galleryLoading ? 'Loading...' : `${galleryMedia.length} Media Files`}
                      </span>
                      {galleryOpen ? (
                        <ChevronUp className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                  </button>

                  {/* Gallery Body Content */}
                  <AnimatePresence initial={false}>
                    {galleryOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25 }}
                      >
                        <div className="border-t border-border/60 p-4 bg-muted/5">
                          {galleryLoading ? (
                            <div className="flex flex-col items-center justify-center py-10 space-y-2">
                              <div className="w-8 h-8 border-4 border-[#b68d40]/25 border-t-[#b68d40] rounded-full animate-spin"></div>
                              <span className="text-xs text-muted-foreground">Loading site attachments...</span>
                            </div>
                          ) : galleryMedia.length === 0 ? (
                            <div className="text-center py-10 border border-dashed border-border/60 rounded-xl bg-background">
                              <ImageIcon className="w-8 h-8 text-muted-foreground mx-auto opacity-40 mb-2" />
                              <p className="text-xs font-bold text-foreground">No media captured yet</p>
                              <p className="text-[11px] text-muted-foreground mt-1">
                                Photos and videos uploaded via the mobile chat or site logs will appear here.
                              </p>
                            </div>
                          ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5">
                              {galleryMedia.map((media) => (
                                <div
                                  key={media.id}
                                  onClick={() => setActiveLightboxMedia(media)}
                                  className="group aspect-square rounded-xl overflow-hidden bg-background border border-border/60 relative cursor-pointer shadow-sm hover:shadow-md hover:border-[#b68d40]/40 transition-all duration-300"
                                >
                                  {media.type === 'video' ? (
                                    <div className="w-full h-full relative">
                                      <video
                                        src={media.url}
                                        className="w-full h-full object-cover pointer-events-none"
                                        muted
                                        playsInline
                                      />
                                      <div className="absolute inset-0 bg-black/20 group-hover:bg-black/35 flex items-center justify-center transition-colors">
                                        <div className="p-2.5 rounded-full bg-[#b68d40] text-white shadow-lg shadow-[#b68d40]/30 transform group-hover:scale-110 transition-transform duration-300">
                                          <Play className="w-3.5 h-3.5 fill-current" />
                                        </div>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="w-full h-full overflow-hidden relative">
                                      <img
                                        src={media.url}
                                        alt={media.name}
                                        className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500"
                                      />
                                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300" />
                                    </div>
                                  )}

                                  {/* Info Overlay */}
                                  <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent p-2.5 translate-y-1 group-hover:translate-y-0 opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col justify-end text-[10px] text-white">
                                    <span className="font-bold truncate">{media.name}</span>
                                    <span className="opacity-75 mt-0.5">
                                      {new Date(media.createdAt).toLocaleDateString(undefined, {
                                        month: 'short',
                                        day: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      })}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Subgrid of drawings register and upload revision form */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {/* Left Column: Repository register */}
                  <div className="lg:col-span-2 bg-white dark:bg-gray-900 p-4 rounded-2xl border border-border/60 shadow-sm space-y-4">
                    <h4 className="font-heading font-bold text-foreground text-xs uppercase tracking-wider">
                      Master Blueprint & RERA Registry
                    </h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-border text-muted-foreground font-semibold">
                            <th className="pb-3">Document Name</th>
                            <th className="pb-3">Category</th>
                            <th className="pb-3">Revision Log</th>
                            <th className="pb-3">Release Date</th>
                            <th className="pb-3">Verification Check-off</th>
                            <th className="pb-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {localDocs.map(doc => (
                            <tr key={doc.id} className="border-b border-border/30 hover:bg-muted/10 transition-colors">
                              <td className="py-3 font-bold text-foreground flex items-center gap-1.5">
                                <FileText className="w-4 h-4 text-[#b68d40]" />
                                {doc.name}
                              </td>
                              <td className="py-3">
                                <span className="bg-muted px-1.5 py-0.5 rounded text-[9px] font-bold text-muted-foreground border border-border/60">
                                  {doc.category}
                                </span>
                              </td>
                              <td className="py-3 font-semibold text-foreground text-[10px]">{doc.version}</td>
                              <td className="py-3 text-muted-foreground">{doc.uploadDate}</td>
                              <td className="py-3">
                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                                  doc.status === 'APPROVED'
                                    ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/25'
                                    : doc.status === 'REJECTED'
                                      ? 'bg-red-500/10 text-red-600 border-red-500/25'
                                      : 'bg-amber-500/10 text-amber-600 border-amber-500/25'
                                }`}>
                                  {doc.status}
                                </span>
                              </td>
                              <td className="py-3 text-right">
                                <a 
                                  href="#" 
                                  onClick={(e) => { e.preventDefault(); alert(`Downloading ${doc.name} ${doc.version}`); }}
                                  className="text-[10px] font-bold bg-[#b68d40] text-white px-2 py-1 rounded hover:bg-[#967332] transition-all cursor-pointer"
                                >
                                  View Sheet
                                </a>
                              </td>
                            </tr>
                          ))}
                          {localDocs.length === 0 && (
                            <tr>
                              <td colSpan={6} className="py-6 text-center text-muted-foreground">
                                No sheets found in the register.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Right Column: Upload version log form */}
                  <form onSubmit={handleDocUpload} className="bg-white dark:bg-gray-900 p-4 rounded-2xl border border-border/60 shadow-sm space-y-3.5">
                    <h4 className="font-heading font-bold text-foreground text-xs uppercase tracking-wider flex items-center gap-2">
                      ✏️ Upload Drawing Sheet / RERA
                    </h4>
                    <p className="text-xs text-muted-foreground">Log new structural blueprints or revised sheets in the control ledger.</p>

                    <label className="block space-y-1.5">
                      <span className="text-[11px] font-bold text-muted-foreground uppercase">Document / Drawing Title</span>
                      <input 
                        type="text" 
                        value={newDocName} 
                        onChange={e => setNewDocName(e.target.value)} 
                        placeholder="e.g. Tower B Structural Reinforcement" 
                        className="w-full text-xs p-2.5 rounded-lg border border-border bg-background outline-none focus:border-[#b68d40]" 
                        required 
                      />
                    </label>

                    <div className="grid grid-cols-2 gap-2">
                      <label className="block space-y-1.5">
                        <span className="text-[11px] font-bold text-muted-foreground uppercase">Category</span>
                        <select 
                          value={newDocCategory} 
                          onChange={e => setNewDocCategory(e.target.value as any)} 
                          className="w-full text-xs p-2.5 rounded-lg border border-border bg-background outline-none focus:border-[#b68d40]"
                        >
                          <option value="DRAWING">Drawing Sheet</option>
                          <option value="BOQ">BOQ Sheet</option>
                          <option value="CONTRACT">Contract Sheet</option>
                          <option value="APPROVAL">Govt Approval</option>
                          <option value="INVOICE">Invoice Log</option>
                        </select>
                      </label>
                      <label className="block space-y-1.5">
                        <span className="text-[11px] font-bold text-muted-foreground uppercase">Revision Version</span>
                        <input 
                          type="text" 
                          value={newDocVersion} 
                          onChange={e => setNewDocVersion(e.target.value)} 
                          placeholder="e.g. V4.2.0" 
                          className="w-full text-xs p-2.5 rounded-lg border border-border bg-background outline-none focus:border-[#b68d40]" 
                          required 
                        />
                      </label>
                    </div>

                    <button type="submit" className="w-full text-xs font-bold bg-[#b68d40] text-white py-2.5 rounded-lg hover:bg-[#967332] transition-all cursor-pointer">
                      Log Revision Sheet
                    </button>
                  </form>
                </div>
              </div>
            )}

            {/* EQUIPMENT TRACKING */}
            {activeTab === 'equipment-tracking' && (
              <div className="space-y-4">
                {/* Header Widget */}
                <div className="bg-white dark:bg-gray-900 p-4 rounded-2xl border border-border/60 shadow-sm flex items-center justify-between">
                  <div>
                    <h3 className="font-heading font-bold text-foreground text-xs uppercase tracking-wider">Heavy Machinery Fleet Registry</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Monitor operational utilization hours, diesel fuel consumption burn rate, and equipment maintenance schedules.</p>
                  </div>
                  <span className="text-xs font-semibold bg-[#b68d40]/10 text-[#b68d40] px-3 py-1 rounded-full border border-[#b68d40]/25">
                    {localEquip.length} Machinery Units Active
                  </span>
                </div>

                {/* Subgrid of machinery fleet table and logs telemetry */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {/* Left Column: Machinery Table */}
                  <div className="lg:col-span-2 bg-white dark:bg-gray-900 p-4 rounded-2xl border border-border/60 shadow-sm space-y-4">
                    <h4 className="font-heading font-bold text-foreground text-xs uppercase tracking-wider">
                      Machinery Telemetry & Maintenance Schedule
                    </h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-border text-muted-foreground font-semibold">
                            <th className="pb-3">Machinery / Crane Asset</th>
                            <th className="pb-3">Operational Hours</th>
                            <th className="pb-3">Fuel Consumption Rate</th>
                            <th className="pb-3">Total Diesel Burned</th>
                            <th className="pb-3">Last Maintenance Date</th>
                            <th className="pb-3 text-right">Operational Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {localEquip.map(eq => (
                            <tr key={eq.id} className="border-b border-border/30 hover:bg-muted/10 transition-colors">
                              <td className="py-3 font-bold text-foreground flex items-center gap-1.5">
                                <Truck className="w-4 h-4 text-[#b68d40]" />
                                {eq.name}
                              </td>
                              <td className="py-3 font-semibold text-foreground">{eq.usageHours} Hours</td>
                              <td className="py-3 font-semibold text-foreground text-[10px]">
                                {eq.name.toLowerCase().includes('crane') ? '12 L / Hr' : eq.name.toLowerCase().includes('generator') ? '22 L / Hr' : '18 L / Hr'}
                              </td>
                              <td className="py-3 font-semibold text-[#b68d40]">{eq.fuelConsumed} Liters</td>
                              <td className="py-3 text-muted-foreground">{eq.lastMaintenance || '2026-05-15'}</td>
                              <td className="py-3 text-right">
                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                                  eq.status === 'ACTIVE'
                                    ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/25'
                                    : eq.status === 'IDLE'
                                      ? 'bg-amber-500/10 text-amber-600 border-amber-500/25'
                                      : 'bg-red-500/10 text-red-600 border-red-500/25'
                                }`}>
                                  {eq.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                          {localEquip.length === 0 && (
                            <tr>
                              <td colSpan={6} className="py-6 text-center text-muted-foreground">
                                No active heavy machinery registered on site.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Right Column: Log running telemetry form */}
                  <form onSubmit={handleLogEquipment} className="bg-white dark:bg-gray-900 p-4 rounded-2xl border border-border/60 shadow-sm space-y-3.5">
                    <h4 className="font-heading font-bold text-foreground text-xs uppercase tracking-wider flex items-center gap-2">
                      ⚡ Log Engine Hours & Diesel Burn
                    </h4>
                    <p className="text-xs text-muted-foreground">Register daily telemetry update for site excavators, generators, or tower cranes.</p>

                    <label className="block space-y-1.5">
                      <span className="text-[11px] font-bold text-muted-foreground uppercase">Select Machine Asset</span>
                      <select 
                        value={logEquipId} 
                        onChange={e => setLogEquipId(e.target.value)} 
                        className="w-full text-xs p-2.5 rounded-lg border border-border bg-background outline-none focus:border-[#b68d40]"
                        required
                      >
                        <option value="">-- Choose Asset --</option>
                        {localEquip.map(eq => (
                          <option key={eq.id} value={eq.id}>{eq.name} (Currently {eq.status})</option>
                        ))}
                      </select>
                    </label>

                    <div className="grid grid-cols-2 gap-2">
                      <label className="block space-y-1.5">
                        <span className="text-[11px] font-bold text-muted-foreground uppercase">Hours to Add</span>
                        <input 
                          type="number" 
                          value={logHours} 
                          onChange={e => setLogHours(e.target.value)} 
                          placeholder="e.g. 8" 
                          min="0"
                          className="w-full text-xs p-2.5 rounded-lg border border-border bg-background outline-none focus:border-[#b68d40]" 
                          required 
                        />
                      </label>
                      <label className="block space-y-1.5">
                        <span className="text-[11px] font-bold text-muted-foreground uppercase">Fuel Burn (Liters)</span>
                        <input 
                          type="number" 
                          value={logFuel} 
                          onChange={e => setLogFuel(e.target.value)} 
                          placeholder="e.g. 150" 
                          min="0"
                          className="w-full text-xs p-2.5 rounded-lg border border-border bg-background outline-none focus:border-[#b68d40]" 
                          required 
                        />
                      </label>
                    </div>

                    <button type="submit" className="w-full text-xs font-bold bg-[#b68d40] text-white py-2.5 rounded-xl cursor-pointer hover:bg-[#967332] transition-colors">
                      Register Equipment Telemetry
                    </button>
                  </form>
                </div>
              </div>
            )}

            {activeTab === 'billing' && (
              <div className="space-y-4">
                {/* Billing KPI Metrics */}
                <div className="bg-white dark:bg-gray-900 p-4 rounded-2xl border border-border/60 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h3 className="font-heading font-black text-foreground text-xs uppercase tracking-wider flex items-center gap-1.5">
                      <Coins className="w-5 h-5 text-[#b68d40] drop-shadow-[0_2px_8px_rgba(182,141,64,0.3)]" />
                      Contractor Billing & RA Invoices Ledger
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Review project values, verify automated quality clearances, and log contractor RA invoices.</p>
                  </div>
                  <div className="flex gap-3 text-xs">
                    <div className="bg-muted/30 border border-border/60 px-4 py-2 rounded-xl text-center shrink-0">
                      <span className="block text-[9px] font-bold text-muted-foreground uppercase">Project Value</span>
                      <span className="font-extrabold text-foreground">{formatCurrency(project!.projectValue)}</span>
                    </div>
                    <div className="bg-muted/30 border border-border/60 px-4 py-2 rounded-xl text-center shrink-0">
                      <span className="block text-[9px] font-bold text-muted-foreground uppercase">Billed Spend</span>
                      <span className="font-extrabold text-[#b68d40]">{formatCurrency(project!.actualSpend)}</span>
                    </div>
                  </div>
                </div>

                {/* QC Clearance & Measurement Verification Workspace */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                  {/* Left Column: QC Billing Clearance Registry */}
                  <div className="lg:col-span-7 bg-white dark:bg-gray-900 p-4.5 rounded-2xl border border-border/60 shadow-sm space-y-4">
                    <div>
                      <h4 className="font-heading font-bold text-foreground text-xs uppercase tracking-wider flex items-center gap-1.5">
                        🛡️ QC Billing Clearance Registry
                      </h4>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Billing is connected with QC status. Invoices are blocked if QC is pending, failed, or rework is open.
                      </p>
                    </div>

                    <div className="space-y-3">
                      {workCompletions.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic text-center py-6 border border-dashed border-border rounded-xl">
                          No work completion records logged.
                        </p>
                      ) : (
                        workCompletions.map(wc => {
                          const req = qcRequests.find(r => r.completionId === wc.id);
                          const mv = measurementVerifications.find(m => m.activityName === wc.activityName);
                          const rwCount = reworkItems.filter(r => r.qcRef === req?.id && r.status !== 'Closed').length;

                          // QC Billing validation flags
                          const isCompleted = wc.completedQty > 0;
                          const isQcApproved = wc.status === 'Approved';
                          const noRework = rwCount === 0;
                          const photoProof = wc.photos && wc.photos.length > 0;
                          const measurementApproved = mv ? mv.status === 'Approved' : true;
                          
                          // Check if invoice was already created for this activity
                          const invoiceCreated = project!.invoices.some(inv => inv.desc.includes(wc.activityName));

                          const billingAllowed = isCompleted && isQcApproved && noRework && photoProof && measurementApproved && !invoiceCreated;

                          const blockReasons: string[] = [];
                          if (!isCompleted) blockReasons.push("Work not completed (completed quantity must be > 0)");
                          if (!isQcApproved) blockReasons.push(`QC Inspection is not Approved (Current status: ${req?.status || 'Pending'})`);
                          if (!noRework) blockReasons.push(`Rework required (${rwCount} open case(s))`);
                          if (!photoProof) blockReasons.push("Missing photo proof of site work completion");
                          if (!measurementApproved) blockReasons.push("Measurement sheet verification is pending or not approved");

                          return (
                            <div key={wc.id} className="p-3.5 bg-muted/15 border border-border/60 rounded-xl text-xs space-y-3 hover:bg-muted/5 transition-colors text-left">
                              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
                                <div>
                                  <h5 className="font-extrabold text-foreground">{wc.activityName}</h5>
                                  <p className="text-[10px] text-muted-foreground">{wc.block} - {wc.floor} | Contractor: {wc.contractorName} | Qty: {wc.completedQty} {wc.unit}</p>
                                  {req?.approvedBy && (
                                    <p className="text-[9px] text-emerald-600 dark:text-emerald-400 font-bold mt-1">
                                      Approved by: {req.approvedBy} on {req.approvedAt}
                                    </p>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-extrabold border ${
                                    invoiceCreated
                                      ? 'bg-blue-500/10 text-blue-600 border-blue-500/20'
                                      : billingAllowed
                                        ? 'bg-green-500/10 text-green-600 border-green-500/25'
                                        : 'bg-red-500/10 text-red-600 border-red-500/25'
                                  }`}>
                                    {invoiceCreated ? 'BILLED' : billingAllowed ? 'BILLING CLEAR' : 'BILLING BLOCKED'}
                                  </span>
                                </div>
                              </div>

                              {/* Checks checklist */}
                              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[10px] font-bold text-center">
                                <span className={`p-2 rounded-lg border ${isCompleted ? 'bg-green-500/5 text-emerald-600 border-emerald-500/10' : 'bg-red-500/5 text-red-600 border-red-500/10'}`}>
                                  Completion: {isCompleted ? '✓ Done' : '✗ Pending'}
                                </span>
                                <span className={`p-2 rounded-lg border ${isQcApproved ? 'bg-green-500/5 text-emerald-600 border-emerald-500/10' : 'bg-red-500/5 text-red-600 border-red-500/10'}`}>
                                  QC Approved: {isQcApproved ? '✓ Yes' : req?.status === 'Failed' ? '✗ Failed' : '✗ Pending'}
                                </span>
                                <span className={`p-2 rounded-lg border ${noRework ? 'bg-green-500/5 text-emerald-600 border-emerald-500/10' : 'bg-red-500/5 text-red-600 border-red-500/10'}`}>
                                  No Open Rework: {noRework ? '✓ Passed' : '✗ Required'}
                                </span>
                                <span className={`p-2 rounded-lg border ${photoProof ? 'bg-green-500/5 text-emerald-600 border-emerald-500/10' : 'bg-red-500/5 text-red-600 border-red-500/10'}`}>
                                  Photo Proof: {photoProof ? '✓ Uploaded' : '✗ Missing'}
                                </span>
                                <span className={`p-2 rounded-lg border ${measurementApproved ? 'bg-green-500/5 text-emerald-600 border-emerald-500/10' : 'bg-amber-500/5 text-amber-600 border-amber-500/10'}`}>
                                  Measurement: {mv ? (measurementApproved ? '✓ Verified' : '✗ Pending') : 'N/A'}
                                </span>
                              </div>

                              {/* Action controls */}
                              {invoiceCreated ? (
                                <div className="p-2.5 bg-blue-500/5 border border-blue-500/10 text-blue-600 font-bold text-[10px] text-center rounded-lg">
                                  Invoice already generated and logged in ledger.
                                </div>
                              ) : billingAllowed ? (
                                <div className="space-y-1.5 w-full">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const amount = (mv?.verifiedQty || wc.completedQty) * 1250;
                                      const desc = `RA Bill: ${wc.activityName} (${wc.block} - ${wc.floor})`;
                                      addInvoice(project!.id, amount, desc);
                                      showQcAlert(
                                        isLiveSupabase()
                                          ? `Invoice draft logged locally for ${wc.activityName}.`
                                          : `Invoice successfully added to the ledger for ${wc.activityName}.`
                                      );
                                    }}
                                    className="w-full py-2.5 bg-[#b68d40] hover:bg-[#967332] text-white font-extrabold uppercase text-[10px] tracking-wider rounded-xl cursor-pointer transition-all shadow-sm"
                                  >
                                    {isLiveSupabase() ? 'Draft Local RA Invoice' : 'Generate & Log RA Invoice'} ({formatCurrency((mv?.verifiedQty || wc.completedQty) * 1250)})
                                  </button>
                                  {isLiveSupabase() && (
                                    <div className="text-[8px] leading-tight text-amber-600 dark:text-amber-400 font-bold bg-amber-500/5 border border-amber-500/10 p-1.5 rounded-md text-center">
                                      ⚠️ Live Mode: Drafts are local only. For database syncing, record vendor bills in the unified Finance Cockpit.
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="p-2.5 bg-red-500/5 border border-red-500/10 text-red-600 dark:text-red-400 font-bold text-[10px] rounded-lg">
                                  <div className="text-center font-extrabold mb-1">⚠️ Billing Blocked:</div>
                                  <ul className="list-disc pl-4 space-y-0.5 text-[9px] text-left font-semibold">
                                    {blockReasons.map((reason, idx) => (
                                      <li key={idx}>{reason}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Right Column: Measurement Sheet Verification */}
                  <div className="lg:col-span-5 bg-white dark:bg-gray-900 p-4.5 rounded-2xl border border-border/60 shadow-sm space-y-4">
                    <div className="border-b border-border/60 pb-2">
                      <h4 className="font-heading font-black text-foreground text-xs uppercase tracking-wider flex items-center gap-1.5">
                        📐 Measurement Sheet Verification
                      </h4>
                      <p className="text-[11px] text-muted-foreground mt-0.5">Required for quantity-based contractor bill claims only.</p>
                    </div>

                    <div className="space-y-3 max-h-[450px] overflow-y-auto pr-1">
                      {measurementVerifications.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic text-center py-6 border border-dashed border-border rounded-xl">No measurements registered.</p>
                      ) : (
                        measurementVerifications.map(mv => {
                          const completion = workCompletions.find(w => w.activityName === mv.activityName);
                          return (
                            <div key={mv.id} className="p-3 bg-muted/20 border border-border/60 rounded-xl text-xs space-y-3 text-left">
                              <div className="flex justify-between items-center font-bold">
                                <span className="text-[#b68d40]">{mv.id}</span>
                                <span className={`px-2 py-0.5 rounded text-[9px] border ${mv.status === 'Approved' ? 'bg-green-500/10 text-green-600 border-green-500/20' : mv.status === 'Rejected' ? 'bg-red-500/10 text-red-600 border-red-500/20' : 'bg-amber-500/10 text-amber-600 border-amber-500/20'}`}>{mv.status}</span>
                              </div>
                              <div className="space-y-1">
                                <p className="font-extrabold text-foreground">{mv.activityName}</p>
                                <p className="text-[10px] text-muted-foreground">BOQ Item: {mv.boqItem}</p>
                                <p className="text-[10px] text-muted-foreground font-semibold">Completed: {mv.completedQty} {completion?.unit || 'Sqft'} | Planned: {mv.plannedQty}</p>
                              </div>

                              {mv.status === 'Approved' ? (
                                <div className="p-2.5 bg-emerald-500/5 border border-emerald-500/15 rounded-lg space-y-1 text-[10px]">
                                  <p className="font-bold text-emerald-600">✓ Quantity Certified: {mv.verifiedQty} {completion?.unit || 'Sqft'}</p>
                                  <p className="text-muted-foreground">Sheet: {mv.measurementSheet} | Date: {mv.measurementDate}</p>
                                </div>
                              ) : (
                                <div className="pt-2 border-t border-border/40 space-y-2">
                                  <div className="grid grid-cols-2 gap-2 text-left">
                                    <label className="block space-y-1">
                                      <span className="text-[9px] font-bold text-muted-foreground uppercase">Verified Quantity</span>
                                      <input
                                        type="number"
                                        value={measVerifiedQty[mv.id] || ''}
                                        onChange={e => setMeasVerifiedQty({ ...measVerifiedQty, [mv.id]: parseFloat(e.target.value) || 0 })}
                                        placeholder="e.g. 5000"
                                        className="w-full text-[10px] p-2 rounded border border-border bg-background outline-none focus:border-[#b68d40] text-foreground font-semibold"
                                      />
                                    </label>
                                    <label className="block space-y-1">
                                      <span className="text-[9px] font-bold text-muted-foreground uppercase">Measurement Sheet File</span>
                                      <input
                                        type="text"
                                        value={measSheetName[mv.id] || ''}
                                        placeholder="e.g. Plaster_M_Sheet.xlsx"
                                        onChange={e => setMeasSheetName({ ...measSheetName, [mv.id]: e.target.value })}
                                        className="w-full text-[10px] p-2 rounded border border-border bg-background outline-none focus:border-[#b68d40] text-foreground font-semibold"
                                      />
                                    </label>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleApproveMeasurement(mv.id)}
                                    className="w-full py-2 bg-[#b68d40] hover:bg-[#967332] text-white transition-all text-[10px] font-extrabold uppercase tracking-wide rounded-lg cursor-pointer shadow-2xs border border-[#b68d40]/20"
                                  >
                                    Certify & Approve Quantity
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>

                {/* Ledger & Manual override */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                  {/* Left Column: Logged Invoices List */}
                  <div className="lg:col-span-8 bg-white dark:bg-gray-900 p-4.5 rounded-2xl border border-border/60 shadow-sm space-y-4">
                    <h4 className="font-heading font-bold text-foreground text-xs uppercase tracking-wider flex items-center gap-1">
                      📋 Registered Invoices Log
                    </h4>
                    <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                      {project!.invoices.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic text-center py-6">No invoices logged yet.</p>
                      ) : (
                        project!.invoices.map(inv => (
                          <div key={inv.id} className="p-3 border border-border/60 hover:bg-muted/10 rounded-xl flex justify-between items-center transition-colors text-left">
                            <div>
                              <span className="text-xs font-bold text-foreground">{inv.desc}</span>
                              <span className="block text-[9px] text-muted-foreground mt-0.5">Inv Ref: {inv.id}</span>
                            </div>
                            <span className="text-xs font-black text-foreground">{formatCurrency(inv.amount)}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Right Column: Manual Invoice Logging override */}
                  <div className="lg:col-span-4 bg-white dark:bg-gray-900 p-4.5 rounded-2xl border border-border/60 shadow-sm space-y-3 self-start">
                    <div className="text-left">
                      <h4 className="font-heading font-bold text-foreground text-xs uppercase tracking-wider">
                        ✍️ Manual Override Logger
                      </h4>
                      <p className="text-[10px] text-muted-foreground">
                        Use this only for advance payments, retention billing, or non-QC works.
                        {isLiveSupabase() && (
                          <span className="block mt-1 font-bold text-amber-600 dark:text-amber-400 bg-amber-500/5 border border-amber-500/10 p-2 rounded-lg">
                            ⚠️ Note: Manual override invoices are saved as local-only drafts in live mode. Use the unified Finance Cockpit to record permanent vendor bills.
                          </span>
                        )}
                      </p>
                    </div>

                    <form onSubmit={handleInvoiceSubmit} className="space-y-3.5 text-xs text-left">
                      <label className="block space-y-1">
                        <span className="font-bold text-muted-foreground uppercase text-[9px]">Link to Site Activity (Optional)</span>
                        <select
                          value={selectedWcActivity}
                          onChange={e => {
                            setSelectedWcActivity(e.target.value);
                            const wc = workCompletions.find(w => w.id === e.target.value);
                            if (wc) {
                              const mv = measurementVerifications.find(m => m.activityName === wc.activityName);
                              const qty = mv?.verifiedQty || wc.completedQty || 100;
                              setInvoiceAmount(qty * 1250);
                              setInvoiceDesc(`RA Bill: ${wc.activityName} (${wc.block} - ${wc.floor})`);
                            } else {
                              setInvoiceAmount('');
                              setInvoiceDesc('');
                            }
                          }}
                          className="w-full text-xs p-2.5 rounded-lg border border-border bg-background outline-none focus:border-[#b68d40] text-foreground font-semibold"
                        >
                          <option value="">-- None (Advance/Retention Payment) --</option>
                          {workCompletions.map(wc => (
                            <option key={wc.id} value={wc.id}>
                              {wc.activityName} ({wc.block} - {wc.floor})
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block space-y-1">
                        <span className="font-bold text-muted-foreground uppercase text-[9px]">Invoice Description *</span>
                        <input
                          type="text"
                          value={invoiceDesc}
                          onChange={e => setInvoiceDesc(e.target.value)}
                          placeholder="e.g. Mobilization Advance claim"
                          className="w-full text-xs p-2.5 rounded-lg border border-border bg-background outline-none focus:border-[#b68d40] text-foreground"
                          required
                        />
                      </label>
                      <label className="block space-y-1">
                        <span className="font-bold text-muted-foreground uppercase text-[9px]">Amount * (INR)</span>
                        <input
                          type="number"
                          value={invoiceAmount}
                          onChange={e => setInvoiceAmount(e.target.value === '' ? '' : Number(e.target.value))}
                          placeholder="e.g. 250000"
                          className="w-full text-xs p-2.5 rounded-lg border border-border bg-background outline-none focus:border-[#b68d40] text-foreground"
                          required
                        />
                      </label>
                      <button
                        type="submit"
                        className="w-full py-2.5 bg-secondary hover:bg-[#b68d40] text-secondary-foreground hover:text-white transition-all text-[10px] font-extrabold uppercase tracking-wide rounded-lg cursor-pointer"
                      >
                        Override & Log Invoice
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            )}

            {/* ANALYTICS */}
            {activeTab === 'analytics' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="bg-white dark:bg-gray-900 p-3 rounded-xl border border-gray-100 dark:border-gray-850 shadow-sm">
                    <p className="text-xs text-gray-400 font-semibold uppercase">Budget Variance</p>
                    <p className="font-heading text-xl font-bold text-gray-900 dark:text-white mt-1">{formatCurrency(project!.budget - project!.actualSpend)}</p>
                  </div>
                  <div className="bg-white dark:bg-gray-900 p-3 rounded-xl border border-gray-100 dark:border-gray-850 shadow-sm">
                    <p className="text-xs text-gray-400 font-semibold uppercase">Avg Labour Productivity</p>
                    <p className="font-heading text-xl font-bold text-gray-900 dark:text-white mt-1">{(project!.labourRecords.reduce((sum, l) => sum + l.productivity, 0) / (project!.labourRecords.length || 1)).toFixed(1)}%</p>
                  </div>
                  <div className="bg-white dark:bg-gray-900 p-3 rounded-xl border border-gray-100 dark:border-gray-850 shadow-sm">
                    <p className="text-xs text-gray-400 font-semibold uppercase">Total Fuel Consumed</p>
                    <p className="font-heading text-xl font-bold text-gray-900 dark:text-white mt-1">{project!.equipments.reduce((sum, eq) => sum + eq.fuelConsumed, 0)} L</p>
                  </div>
                </div>
              </div>
            )}

            {/* TASK ASSIGNMENT */}
            {activeTab === 'tasks' && (
              <TaskModule project={project} overviewData={overviewData} />
            )}

            {/* USER MANAGEMENT */}
            {activeTab === 'user-management' && (
              <div className="space-y-4">
                <div className="bg-white dark:bg-gray-900 p-3 rounded-xl border border-gray-100 dark:border-gray-850 shadow-sm flex justify-between items-center">
                  <div>
                    <p className="text-xs text-gray-400 font-semibold uppercase">Current User</p>
                    <p className="text-xs font-bold text-gray-900 dark:text-white mt-1">{currentUser.name} ({currentUser.role})</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-400 font-semibold uppercase">Client</p>
                    <p className="text-xs font-bold text-gray-900 dark:text-white mt-1">{project!.clientName}</p>
                  </div>
                </div>
                <ProjectMembers project={project} />
              </div>
            )}

          </motion.div>
        </AnimatePresence>
      </div>
      
      {/* ── Mobile Bottom Navigation Bar ── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-xl border-t border-border/40 shadow-[0_-8px_30px_rgba(0,0,0,0.05)] px-4 py-2 safe-area-pb">
        <div className="flex items-center justify-between">
          <button onClick={() => setActiveTab('project-management')} className={`flex flex-col items-center justify-center p-2 rounded-xl transition-colors ${activeTab === 'project-management' ? 'text-[#FF7D29]' : 'text-muted-foreground hover:text-foreground'}`}>
            <Building2 className="w-5 h-5 mb-1" />
            <span className="text-[9px] font-bold tracking-widest uppercase">Overview</span>
          </button>
          <button onClick={() => setActiveTab('tasks')} className={`flex flex-col items-center justify-center p-2 rounded-xl transition-colors ${activeTab === 'tasks' ? 'text-[#FF7D29]' : 'text-muted-foreground hover:text-foreground'}`}>
            <ListTodo className="w-5 h-5 mb-1" />
            <span className="text-[9px] font-bold tracking-widest uppercase">Tasks</span>
          </button>
          
          {/* Floating Action Button */}
          <div className="relative -top-5">
            <button className="bg-[#FF7D29] text-white p-3.5 rounded-full shadow-lg shadow-[#FF7D29]/30 flex items-center justify-center transition-transform active:scale-95">
              <Plus className="w-6 h-6" />
            </button>
          </div>

          <button onClick={() => setActiveTab('inbox')} className={`flex flex-col items-center justify-center p-2 rounded-xl transition-colors ${activeTab === 'inbox' ? 'text-[#FF7D29]' : 'text-muted-foreground hover:text-foreground'}`}>
            <MessageSquare className="w-5 h-5 mb-1" />
            <span className="text-[9px] font-bold tracking-widest uppercase">Inbox</span>
          </button>
          <button onClick={() => setIsNotificationOpen(!isNotificationOpen)} className={`flex flex-col items-center justify-center p-2 rounded-xl transition-colors ${isNotificationOpen ? 'text-[#FF7D29]' : 'text-muted-foreground hover:text-foreground'}`}>
            <div className="relative">
              <Bell className="w-5 h-5 mb-1" />
              {unreadNotificationCount > 0 && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 border border-background rounded-full"></span>}
            </div>
            <span className="text-[9px] font-bold tracking-widest uppercase">Alerts</span>
          </button>
        </div>
      </div>

      {/* ── Mobile Menu Drawer ── */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="md:hidden fixed inset-0 z-[60] bg-black backdrop-blur-xs"
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="md:hidden fixed inset-y-0 left-0 z-[70] w-72 max-w-[85vw] bg-card shadow-2xl flex flex-col justify-between"
            >
              <div className="p-4 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg className="w-8 h-8 text-[#FF7D29]" viewBox="30 1 36 29" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path className="fill-[#FF7D29]" d="M52.13,17.62v2.6s7.81,1.18,9,9.31h4.34a4.39,4.39,0,0,1-1.9-2.21C63,25.74,60.25,18.65,52.13,17.62ZM34.47,3.9H44.72V14.23C37.23,14.15,34.62,13.2,34.47,3.9ZM30,1.38A5.14,5.14,0,0,1,32,5.24v.63c.71,9.31,4.65,10.57,12.7,10.65V27.16h-.08s-.4,2.21-1.58,2.37h4.18V1.38H30ZM43.53,17.62v2.6s-7.8,1.18-8.91,9.31H30.29a4.07,4.07,0,0,0,1.81-2.21C32.65,25.74,35.49,18.65,43.53,17.62ZM51,14.23V3.9H61.28C61,13.2,58.44,14.15,51,14.23ZM63.8,1.38H48.5V29.53h4.1C51.5,29.37,51,27.16,51,27.16h0V16.52c8-0.08,12-1.34,12.61-10.65a1.71,1.71,0,0,0,.08-.63,4.93,4.93,0,0,1,2-3.86Z"/>
                  </svg>
                  <span className="text-sm font-heading font-bold text-foreground">Menu</span>
                </div>
                <button onClick={() => setIsMobileMenuOpen(false)} className="p-2 rounded-xl bg-muted text-muted-foreground hover:text-foreground">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
                {projectModules.map((module) => {
                  const Icon = module.icon;
                  const isActive = activeTab === module.id;
                  return (
                    <button
                      key={module.id}
                      onClick={() => { setActiveTab(module.id); setIsMobileMenuOpen(false); }}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[13px] font-bold transition-all ${isActive ? 'bg-[#FF7D29]/10 text-[#FF7D29] border-l-4 border-[#FF7D29] pl-3' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}`}
                    >
                      <Icon className="w-5 h-5 flex-shrink-0" />
                      <span>{module.label}</span>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Gallery Lightbox Modal ── */}
      <AnimatePresence>
        {activeLightboxMedia && (
          <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-md flex flex-col items-center justify-center p-4">
            {/* Close Overlay */}
            <div 
              className="absolute inset-0 cursor-zoom-out" 
              onClick={() => setActiveLightboxMedia(null)} 
            />

            {/* Top Bar (Actions & Title) */}
            <div className="absolute top-0 inset-x-0 p-4 bg-gradient-to-b from-black/80 to-transparent flex items-center justify-between z-10">
              <div className="text-white">
                <p className="text-xs font-bold uppercase tracking-wider text-[#b68d40]">{activeLightboxMedia.name}</p>
                <p className="text-[10px] opacity-75 mt-0.5">
                  Uploaded {new Date(activeLightboxMedia.createdAt).toLocaleString()}
                </p>
              </div>
              <button
                onClick={() => setActiveLightboxMedia(null)}
                className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer animate-pulse"
                aria-label="Close Preview"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Media Content Container */}
            <div className="relative max-w-5xl max-h-[85vh] w-full flex items-center justify-center z-10 px-4 animate-in zoom-in-95 duration-200">
              {activeLightboxMedia.type === 'video' ? (
                <video
                  src={activeLightboxMedia.url}
                  controls
                  autoPlay
                  className="max-w-full max-h-[75vh] rounded-2xl shadow-2xl border border-white/10"
                />
              ) : (
                <img
                  src={activeLightboxMedia.url}
                  alt={activeLightboxMedia.name}
                  className="max-w-full max-h-[75vh] rounded-2xl shadow-2xl object-contain border border-white/10"
                />
              )}
            </div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}


