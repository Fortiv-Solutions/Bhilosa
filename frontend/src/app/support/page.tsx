'use client';

import { useState, useEffect, useRef } from 'react';
import { 
  HelpCircle, 
  Phone, 
  Mail, 
  MessageSquare, 
  Building, 
  Send, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  Search, 
  ChevronDown, 
  ChevronUp, 
  FileText, 
  ShieldCheck, 
  Sparkles,
  Smartphone,
  Server,
  Zap,
  ExternalLink,
  Plus,
  RefreshCw,
  Image as ImageIcon,
  UploadCloud,
  X,
  Eye,
  Paperclip
} from 'lucide-react';
import { useAppStore } from '@/store/use-app-store';
import { 
  fetchSupportTickets, 
  createSupportTicket, 
  fetchSupportFaqs,
  type SupportTicketCategory, 
  type SupportTicketPriority, 
  type SupportTicketStatus,
  type SupportTicketRow,
  type SupportFaqRow 
} from '@/lib/support';

interface SupportTicketUI {
  id: string;
  subject: string;
  category: SupportTicketCategory;
  priority: SupportTicketPriority;
  description: string;
  status: SupportTicketStatus;
  createdAt: string;
  assignedEngineer: string;
  attachments?: string[];
}

export default function SupportPage() {
  const { currentUser, activeRole } = useAppStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // New Ticket Form State
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<SupportTicketCategory>('Technical Bug');
  const [priority, setPriority] = useState<SupportTicketPriority>('MEDIUM');
  const [description, setDescription] = useState('');
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const [previewModalImg, setPreviewModalImg] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingLive, setIsLoadingLive] = useState(true);
  const [submittedMessage, setSubmittedMessage] = useState<string | null>(null);

  // Default Initial Mock Tickets
  const [tickets, setTickets] = useState<SupportTicketUI[]>([
    {
      id: 'SUP-2026-9401',
      subject: 'Mobile App DPR photo upload timeout on slow 3G site network',
      category: 'Site Mobile App Sync',
      priority: 'HIGH',
      description: 'Site engineer experienced timeout when uploading 8 photos simultaneously during peak site hours.',
      status: 'IN_PROGRESS',
      createdAt: '2026-08-09 14:30',
      assignedEngineer: 'Rahul Sharma (Lead Mobile Engineer)',
      attachments: []
    },
    {
      id: 'SUP-2026-9280',
      subject: 'Work order stage 2 billing calculation verification query',
      category: 'Work Order & Billing',
      priority: 'MEDIUM',
      description: 'Verified structural measurement quantity match with BOQ item code BOQ-CONC-04.',
      status: 'RESOLVED',
      createdAt: '2026-08-07 10:15',
      assignedEngineer: 'Pramukh Finance Tech Desk',
      attachments: []
    }
  ]);

  // Default FAQs
  const [faqs, setFaqs] = useState<{ question: string; answer: string }[]>([
    {
      question: 'How do Site Engineers sync offline logs from the site mobile app?',
      answer: 'The Pramukh Site App automatically caches log entries, measurement readings, and photo uploads offline when cellular connectivity is weak. Once internet connection is restored, click the "Sync" button at the top of the mobile home screen to push all cached logs to the central ERP.'
    },
    {
      question: 'How does AI compilation generate the Daily Progress Report (DPR)?',
      answer: 'The AI engine cross-references today site manager activity logs against yesterday carrying plan items, automatically matching manpower counts per trade, detecting delays, and formatting site verification photos into an executive PDF/JSON report.'
    },
    {
      question: 'What happens when a QC Inspection fails?',
      answer: 'When a Quality Control inspection receives a "Fail" verdict or AI Vision identifies structural defect, a Rework case (e.g. RW-9041) is automatically raised and assigned to the contractor with a 3-day target date for mandatory re-testing.'
    },
    {
      question: 'How are Work Order Stage Bills cleared for payment?',
      answer: 'Work order stage bills require 4 sequential clearance checks: 100% activity completion, QC approval without open rework cases, verified site measurement sheet, and authorized site engineer sign-off.'
    },
    {
      question: 'How do I add new site engineers or modify role permissions?',
      answer: 'Role permissions are managed under Users & Roles (/users). Executive management can update user profiles and project assignments. Role changes take effect immediately across all client sessions.'
    }
  ]);

  // FAQ Accordion State
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  const [faqSearchQuery, setFaqSearchQuery] = useState('');

  // Handle Image Upload Selection
  const handleImageSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = () => {
        setAttachedImages((prev) => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleRemoveImage = (index: number) => {
    setAttachedImages((prev) => prev.filter((_, i) => i !== index));
  };

  // Load Database Tickets & FAQs on Mount
  const loadDatabaseData = async () => {
    setIsLoadingLive(true);
    
    // Fetch Live Tickets from Supabase
    const { data: liveTickets } = await fetchSupportTickets();
    if (liveTickets && liveTickets.length > 0) {
      const mapped: SupportTicketUI[] = liveTickets.map((t) => ({
        id: t.id,
        subject: t.subject,
        category: t.category,
        priority: t.priority,
        description: t.description,
        status: t.status,
        createdAt: t.created_at ? new Date(t.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Just now',
        assignedEngineer: t.assigned_engineer_name || 'Pramukh Support Desk',
        attachments: t.attachments || []
      }));
      setTickets(mapped);
    }

    // Fetch Live FAQs from Supabase
    const { data: liveFaqs } = await fetchSupportFaqs();
    if (liveFaqs && liveFaqs.length > 0) {
      const mappedFaqs = liveFaqs.map(f => ({
        question: f.question,
        answer: f.answer
      }));
      setFaqs(mappedFaqs);
    }

    setIsLoadingLive(false);
  };

  useEffect(() => {
    void loadDatabaseData();
  }, []);

  const filteredFaqs = faqs.filter(faq => 
    faq.question.toLowerCase().includes(faqSearchQuery.toLowerCase()) ||
    faq.answer.toLowerCase().includes(faqSearchQuery.toLowerCase())
  );

  const handleTicketSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !description.trim()) return;

    setIsSubmitting(true);

    // Call Supabase Database API with attachments
    const { data: createdRow, error } = await createSupportTicket({
      userName: currentUser?.name || 'Site Engineer',
      userRole: activeRole || 'UPPER_MANAGEMENT',
      category,
      priority,
      subject: subject.trim(),
      description: description.trim(),
      attachments: attachedImages
    });

    setIsSubmitting(false);

    if (createdRow) {
      const newTicketUI: SupportTicketUI = {
        id: createdRow.id,
        subject: createdRow.subject,
        category: createdRow.category,
        priority: createdRow.priority,
        description: createdRow.description,
        status: createdRow.status,
        createdAt: createdRow.created_at ? new Date(createdRow.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Just now',
        assignedEngineer: createdRow.assigned_engineer_name || 'Pramukh Support Desk',
        attachments: attachedImages
      };

      setTickets([newTicketUI, ...tickets]);
      setSubject('');
      setDescription('');
      setAttachedImages([]);
      setSubmittedMessage(`Support Ticket ${createdRow.id} with ${attachedImages.length} attached image(s) recorded successfully!`);
      setTimeout(() => setSubmittedMessage(null), 6000);
    } else if (error) {
      setSubmittedMessage(`Error submitting ticket: ${error.message}`);
    }
  };

  const priorityBadgeStyle: Record<SupportTicketPriority, string> = {
    URGENT: 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border-purple-300',
    HIGH: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300 border-red-300',
    MEDIUM: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-amber-300',
    LOW: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-300'
  };

  const statusBadgeStyle: Record<string, string> = {
    OPEN: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-800',
    IN_PROGRESS: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800',
    RESOLVED: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800',
    CLOSED: 'bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-300',
    ESCALATED: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/30 dark:text-purple-300'
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Image Fullscreen Preview Modal */}
      {previewModalImg && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setPreviewModalImg(null)}>
          <div className="relative max-w-3xl max-h-[90vh] bg-popover rounded-2xl overflow-hidden p-2">
            <button 
              onClick={() => setPreviewModalImg(null)}
              className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black"
            >
              <X className="w-4 h-4" />
            </button>
            <img src={previewModalImg} alt="Attachment Proof" className="max-h-[80vh] w-auto object-contain rounded-xl" />
          </div>
        </div>
      )}

      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-gray-900 via-gray-850 to-gray-900 dark:from-black dark:to-gray-900 p-6 lg:p-8 border border-gray-800 text-white shadow-md">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e83e8c]/20 px-3 py-1 text-xs font-bold text-[#e83e8c] border border-[#e83e8c]/30">
                <HelpCircle className="h-3.5 w-3.5" /> 24/7 Operations Desk
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-400 border border-emerald-500/20">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> Supabase Live Database Sync
              </span>
            </div>
            <h1 className="font-heading text-2xl lg:text-3xl font-extrabold tracking-tight text-white">
              Pramukh Help & Support Portal
            </h1>
            <p className="text-xs lg:text-sm text-gray-400 max-w-2xl leading-relaxed">
              Instant technical assistance, image proof attachments, mobile site engineer sync support, and database-backed ticketing system.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => void loadDatabaseData()}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 px-3.5 text-xs font-bold text-white transition active:scale-95 cursor-pointer"
              title="Refresh Database Tickets"
            >
              <RefreshCw className={`h-4 w-4 ${isLoadingLive ? 'animate-spin' : ''}`} /> Refresh
            </button>

            <a
              href="tel:+919876543210"
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#e83e8c] px-4 text-xs font-bold text-white shadow-lg shadow-[#e83e8c]/25 transition hover:bg-[#c3006a] active:scale-95"
            >
              <Phone className="h-4 w-4" /> Call Hotline: +91 98765 43210
            </a>
          </div>
        </div>
      </div>

      {/* Quick Contact & Channel Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Support Hotline */}
        <a
          href="tel:+919876543210"
          className="group p-5 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl shadow-xs hover:border-[#e83e8c]/40 transition-all flex items-start gap-4"
        >
          <div className="w-11 h-11 rounded-xl bg-[#e83e8c]/10 text-[#e83e8c] flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
            <Phone className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Direct Call Desk</span>
            <h3 className="font-bold text-foreground text-sm mt-0.5 group-hover:text-[#e83e8c] transition-colors">+91 98765 43210</h3>
            <p className="text-[11px] text-muted-foreground mt-1">Available 24/7 for urgent site issues</p>
          </div>
        </a>

        {/* Email Support */}
        <a
          href="mailto:support@pramukhgroup.com"
          className="group p-5 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl shadow-xs hover:border-[#e83e8c]/40 transition-all flex items-start gap-4"
        >
          <div className="w-11 h-11 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
            <Mail className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Email Desk</span>
            <h3 className="font-bold text-foreground text-xs mt-0.5 truncate max-w-[150px] group-hover:text-blue-600 transition-colors">support@pramukhgroup.com</h3>
            <p className="text-[11px] text-muted-foreground mt-1">Response time: under 30 minutes</p>
          </div>
        </a>

        {/* WhatsApp Ops Desk */}
        <a
          href="https://wa.me/919876543210"
          target="_blank"
          rel="noopener noreferrer"
          className="group p-5 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl shadow-xs hover:border-emerald-500/40 transition-all flex items-start gap-4"
        >
          <div className="w-11 h-11 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">WhatsApp Channel</span>
            <h3 className="font-bold text-foreground text-sm mt-0.5 group-hover:text-emerald-600 transition-colors">Chat Site Support</h3>
            <p className="text-[11px] text-muted-foreground mt-1">Instant photo & measurement verification</p>
          </div>
        </a>

        {/* System Health */}
        <div className="p-5 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl shadow-xs flex items-start gap-4">
          <div className="w-11 h-11 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
            <Server className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">System Health</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="font-bold text-foreground text-sm">All Services Normal</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">AI Vision & Cloud DB Sync 100%</p>
          </div>
        </div>
      </div>

      {/* Main Grid: Ticket Submission Form & Active Tickets Tracker */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Raise a Support Ticket Form with Image Upload (7 cols) */}
        <div className="lg:col-span-7 bg-white dark:bg-gray-900 p-6 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-xs space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-heading text-lg font-bold text-foreground flex items-center gap-2">
                <Send className="w-5 h-5 text-[#e83e8c]" /> Raise a Support Ticket
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Submit an issue or technical ticket directly to Pramukh Group Operations Engineers.
              </p>
            </div>
            <span className="text-[11px] font-bold bg-[#e83e8c]/10 text-[#e83e8c] px-3 py-1 rounded-full border border-[#e83e8c]/20">
              Database Synced
            </span>
          </div>

          {submittedMessage && (
            <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold text-emerald-800 dark:text-emerald-300 flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>{submittedMessage}</span>
            </div>
          )}

          <form onSubmit={handleTicketSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                  Category *
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as SupportTicketCategory)}
                  className="w-full h-10 rounded-xl border border-border bg-muted/20 px-3 text-xs font-semibold text-foreground focus:outline-none focus:border-primary focus:bg-background transition-all"
                >
                  <option value="Technical Bug">Technical Bug / Crash</option>
                  <option value="Work Order & Billing">Work Order & Billing Query</option>
                  <option value="Site Mobile App Sync">Site Mobile App Sync</option>
                  <option value="Account Access & Roles">Account Access & Roles</option>
                  <option value="Feature Request">Feature Request</option>
                  <option value="General Inquiry">General Inquiry</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                  Priority Level *
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as SupportTicketPriority)}
                  className="w-full h-10 rounded-xl border border-border bg-muted/20 px-3 text-xs font-semibold text-foreground focus:outline-none focus:border-primary focus:bg-background transition-all"
                >
                  <option value="LOW">Low — Non-blocking inquiry</option>
                  <option value="MEDIUM">Medium — Normal ticket</option>
                  <option value="HIGH">High — Site execution impacted</option>
                  <option value="URGENT">Urgent — System or billing blocked</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                Ticket Subject *
              </label>
              <input
                type="text"
                required
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Brief summary of the issue or inquiry..."
                className="w-full h-10 rounded-xl border border-border bg-muted/20 px-3.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary focus:bg-background transition-all"
              />
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                Detailed Description & Steps *
              </label>
              <textarea
                required
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what happened, error message, project site location, or steps to reproduce..."
                className="w-full rounded-xl border border-border bg-muted/20 p-3.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary focus:bg-background transition-all resize-none"
              />
            </div>

            {/* Attach Screenshots / Proof Images Dropzone */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-[#e83e8c]" /> Attach Screenshots / Proof Images (Optional)
                </span>
                <span className="text-[10px] text-muted-foreground">{attachedImages.length} Attached</span>
              </label>

              <input 
                ref={fileInputRef}
                type="file" 
                multiple 
                accept="image/*" 
                onChange={(e) => handleImageSelect(e.target.files)}
                className="hidden" 
              />

              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-border/80 hover:border-primary/60 bg-muted/10 hover:bg-muted/30 rounded-xl p-4 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-1.5"
              >
                <div className="w-9 h-9 rounded-full bg-[#e83e8c]/10 text-[#e83e8c] flex items-center justify-center">
                  <UploadCloud className="w-5 h-5" />
                </div>
                <p className="text-xs font-bold text-foreground">Click or Drag & Drop Screenshots here</p>
                <p className="text-[10px] text-muted-foreground">Supports PNG, JPG, WEBP error proofs up to 10MB</p>
              </div>

              {/* Uploaded Thumbnails Grid */}
              {attachedImages.length > 0 && (
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2.5 mt-3">
                  {attachedImages.map((imgSrc, idx) => (
                    <div key={idx} className="relative group rounded-lg overflow-hidden border border-border bg-black/5 aspect-square">
                      <img src={imgSrc} alt={`Attachment ${idx + 1}`} className="w-full h-full object-cover" />
                      
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setPreviewModalImg(imgSrc); }}
                          className="w-6 h-6 rounded-full bg-white/20 text-white hover:bg-white/40 flex items-center justify-center"
                          title="Preview"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleRemoveImage(idx); }}
                          className="w-6 h-6 rounded-full bg-red-500/80 text-white hover:bg-red-600 flex items-center justify-center"
                          title="Remove"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-[11px] text-muted-foreground">
                Logged in as: <strong className="text-foreground">{currentUser?.name || 'Project Admin'}</strong>
              </span>

              <button
                type="submit"
                disabled={isSubmitting || !subject.trim() || !description.trim()}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#e83e8c] px-6 text-xs font-bold text-white shadow-sm hover:bg-[#c3006a] active:scale-95 disabled:opacity-50 transition-all cursor-pointer"
              >
                {isSubmitting ? (
                  <>Writing to Database...</>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" /> Submit Support Ticket
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Right: Active Support Tickets Tracker (5 cols) */}
        <div className="lg:col-span-5 bg-white dark:bg-gray-900 p-6 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-xs space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-heading text-lg font-bold text-foreground flex items-center gap-2">
                  <Clock className="w-5 h-5 text-[#e83e8c]" /> Live Database Tickets
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Track resolution status of tickets stored in database.
                </p>
              </div>
              <span className="text-xs font-bold bg-muted px-2.5 py-1 rounded-full text-foreground">
                {tickets.length} Active
              </span>
            </div>

            <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
              {tickets.map((t) => (
                <div
                  key={t.id}
                  className="p-4 rounded-xl border border-border/80 bg-muted/20 hover:border-primary/40 transition-all space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-mono text-[11px] font-extrabold text-primary">
                      {t.id}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full border ${priorityBadgeStyle[t.priority]}`}>
                        {t.priority}
                      </span>
                      <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full border ${statusBadgeStyle[t.status]}`}>
                        {t.status.replace('_', ' ')}
                      </span>
                    </div>
                  </div>

                  <h3 className="font-bold text-xs text-foreground line-clamp-2">
                    {t.subject}
                  </h3>

                  <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                    {t.description}
                  </p>

                  {/* Ticket Attached Image Proof Thumbnails */}
                  {t.attachments && t.attachments.length > 0 && (
                    <div className="flex items-center gap-1.5 pt-1">
                      <span className="text-[9px] font-bold text-muted-foreground flex items-center gap-1">
                        <Paperclip className="w-3 h-3 text-[#e83e8c]" /> Proofs:
                      </span>
                      <div className="flex items-center gap-1">
                        {t.attachments.map((imgUrl, imgIdx) => (
                          <div 
                            key={imgIdx} 
                            onClick={() => setPreviewModalImg(imgUrl)}
                            className="w-7 h-7 rounded border border-border overflow-hidden cursor-pointer hover:opacity-80"
                          >
                            <img src={imgUrl} alt="Proof thumbnail" className="w-full h-full object-cover" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-border/50">
                    <span>Category: <strong className="text-foreground">{t.category}</strong></span>
                    <span>{t.createdAt}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300 flex items-center justify-between gap-2">
            <span>Escalation needed? Call HQ Senior Systems Manager directly.</span>
            <a href="tel:+919876543210" className="font-bold underline text-[#e83e8c] shrink-0">Call Now</a>
          </div>
        </div>
      </div>

      {/* Knowledge Base & FAQs Section */}
      <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-xs space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="font-heading text-xl font-bold text-foreground flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#e83e8c]" /> Knowledge Base & FAQs
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Frequently asked questions and step-by-step guides for Pramukh Group ERP modules.
            </p>
          </div>

          <div className="relative max-w-sm w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={faqSearchQuery}
              onChange={(e) => setFaqSearchQuery(e.target.value)}
              placeholder="Search help topics or keywords..."
              className="w-full h-9.5 rounded-xl border border-border bg-muted/20 pl-10 pr-4 text-xs text-foreground outline-none focus:border-primary focus:bg-background transition-all"
            />
          </div>
        </div>

        <div className="space-y-3">
          {filteredFaqs.map((faq, index) => {
            const isOpen = openFaqIndex === index;
            return (
              <div
                key={index}
                className="rounded-xl border border-border/80 bg-card overflow-hidden transition-all"
              >
                <button
                  onClick={() => setOpenFaqIndex(isOpen ? null : index)}
                  className="w-full flex items-center justify-between p-4 text-left font-bold text-xs lg:text-sm text-foreground hover:bg-muted/30 transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <HelpCircle className="w-4 h-4 text-[#e83e8c] shrink-0" />
                    {faq.question}
                  </span>
                  {isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 pt-1 text-xs text-muted-foreground leading-relaxed border-t border-border/40 bg-muted/10">
                    {faq.answer}
                  </div>
                )}
              </div>
            );
          })}

          {filteredFaqs.length === 0 && (
            <div className="py-8 text-center text-xs text-muted-foreground">
              No help topics match your search query "{faqSearchQuery}".
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
