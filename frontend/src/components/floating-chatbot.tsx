'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  MessageSquare, 
  X, 
  Send, 
  Loader2, 
  Sparkles, 
  ChevronDown, 
  Copy, 
  Check, 
  AlertCircle, 
  Clock, 
  Coins, 
  PackageOpen,
  ArrowRight,
  RefreshCw
} from 'lucide-react';
import { useAppStore } from '@/store/use-app-store';
import { listProjects as getInboxProjects, listConversations as getConversations, listMessages as getMessages } from '@/lib/inbox';
import {
  createChatSession,
  loadChatMessages,
  saveChatMessage,
  clearChatMessages,
  updateSessionTitle,
} from '@/lib/ai-chat';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

// Simple formatter for **bold** and inline code `code`
const parseFormatting = (text: string) => {
  const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={idx} className="font-extrabold text-gray-900 dark:text-white">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={idx} className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-[10px] text-rose-600 dark:text-rose-450 font-mono font-semibold">{part.slice(1, -1)}</code>;
    }
    return part;
  });
};

const renderMessageContent = (content: string) => {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  
  let inTable = false;
  let tableHeader: string[] = [];
  let tableRows: string[][] = [];
  let tableAlignments: ('left' | 'center' | 'right')[] = [];
  let currentKey = 0;

  const flushTable = () => {
    if (tableHeader.length > 0 || tableRows.length > 0) {
      elements.push(
        <div key={`table-${currentKey++}`} className="my-3 overflow-x-auto rounded-xl border border-gray-100 dark:border-gray-850 shadow-sm max-w-full">
          <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800 text-[11px]">
            {tableHeader.length > 0 && (
              <thead className="bg-gray-50/75 dark:bg-gray-800/40">
                <tr>
                  {tableHeader.map((col, idx) => {
                    const align = tableAlignments[idx] || 'left';
                    return (
                      <th 
                        key={idx} 
                        className={`px-3 py-2 text-left font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider ${
                          align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : ''
                        }`}
                      >
                        {col}
                      </th>
                    );
                  })}
                </tr>
              </thead>
            )}
            <tbody className="divide-y divide-gray-100 bg-white dark:bg-gray-950 dark:divide-gray-800">
              {tableRows.map((row, rIdx) => (
                <tr key={rIdx} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/20">
                  {row.map((cell, cIdx) => {
                    const align = tableAlignments[cIdx] || 'left';
                    return (
                      <td 
                        key={cIdx} 
                        className={`px-3 py-2.5 text-gray-700 dark:text-gray-300 font-medium ${
                          align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : ''
                        }`}
                      >
                        {parseFormatting(cell)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      tableHeader = [];
      tableRows = [];
      tableAlignments = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Check if line is a table row
    if (line.startsWith('|') && line.endsWith('|')) {
      inTable = true;
      const cols = line.split('|').map(c => c.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
      
      const isSeparator = cols.every(c => c.replace(/[:-\s]/g, '') === '');
      
      if (isSeparator) {
        tableAlignments = cols.map(c => {
          const hasLeft = c.startsWith(':');
          const hasRight = c.endsWith(':');
          if (hasLeft && hasRight) return 'center';
          if (hasRight) return 'right';
          return 'left';
        });
      } else {
        if (tableHeader.length === 0 && tableRows.length === 0) {
          tableHeader = cols;
        } else {
          tableRows.push(cols);
        }
      }
    } else {
      if (inTable) {
        flushTable();
        inTable = false;
      }
      
      if (line.startsWith('- ') || line.startsWith('* ')) {
        const itemText = line.substring(2);
        elements.push(
          <li key={`list-${currentKey++}`} className="ml-4 list-disc pl-1 py-0.5 text-gray-600 dark:text-gray-400">
            {parseFormatting(itemText)}
          </li>
        );
      } else if (line.startsWith('### ')) {
        elements.push(
          <h4 key={`h-${currentKey++}`} className="mt-4 mb-2 text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider">
            {parseFormatting(line.substring(4))}
          </h4>
        );
      } else if (line.startsWith('## ')) {
        elements.push(
          <h3 key={`h-${currentKey++}`} className="mt-5 mb-2.5 text-sm font-extrabold text-[#b68d40] dark:text-[#d6b26b]">
            {parseFormatting(line.substring(3))}
          </h3>
        );
      } else if (line) {
        elements.push(
          <p key={`p-${currentKey++}`} className="my-1.5 leading-relaxed">
            {parseFormatting(line)}
          </p>
        );
      }
    }
  }

  if (inTable) {
    flushTable();
  }

  return <div className="space-y-1">{elements}</div>;
};

const WELCOME_MSG = 'Hello! I am your Pragati AI Assistant. Ask me anything about project schedules, delays, budget burn, or inventory stock levels.';

export default function FloatingChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: WELCOME_MSG, timestamp: new Date() }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);

  const { projects, vendors, vendorBills, currentUser } = useAppStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ── Bootstrap: create/load Supabase session on mount ──────────────────────
  useEffect(() => {
    async function initSession() {
      if (!currentUser?.id) {
        setSessionReady(true);
        return;
      }

      try {
        // Create a new session for this chat window
        const session = await createChatSession(currentUser.id);
        if (!session) {
          setSessionReady(true);
          return;
        }

        setSessionId(session.id);

        // Load existing messages for this session
        const dbMessages = await loadChatMessages(session.id);
        if (dbMessages.length > 0) {
          setMessages(dbMessages.map(m => ({
            role: m.role,
            content: m.content,
            timestamp: new Date(m.created_at),
          })));
        }
      } catch (e) {
        console.error('[chatbot] session init error:', e);
      } finally {
        setSessionReady(true);
      }
    }

    initSession();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  // ── Clear chat: wipe DB messages and reset UI ─────────────────────────────
  const clearChatHistory = async () => {
    const defaultMsg: Message = {
      role: 'assistant',
      content: WELCOME_MSG,
      timestamp: new Date(),
    };
    setMessages([defaultMsg]);
    if (sessionId) {
      await clearChatMessages(sessionId);
    }
  };

  // Auto scroll to bottom
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading]);

  const toggleChat = () => setIsOpen(!isOpen);

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleSendMessage = async (textToSend?: string) => {
    const messageText = (textToSend ?? inputValue).trim();
    if (!messageText || isLoading) return;

    if (!textToSend) setInputValue('');

    const userMsg: Message = { role: 'user', content: messageText, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    // ── Persist user message to Supabase ──────────────────────────────────
    let activeSessionId = sessionId;
    if (!activeSessionId && currentUser?.id) {
      const session = await createChatSession(currentUser.id);
      if (session) {
        activeSessionId = session.id;
        setSessionId(session.id);
      }
    }

    if (activeSessionId) {
      await saveChatMessage(activeSessionId, 'user', messageText);

      // Auto-title the session from the first user message (truncated to 60 chars)
      const existingUserMsgs = messages.filter(m => m.role === 'user');
      if (existingUserMsgs.length === 0) {
        const title = messageText.length > 60 ? messageText.slice(0, 57) + '...' : messageText;
        await updateSessionTitle(activeSessionId, title);
      }
    }

    // ── Fetch inbox context ───────────────────────────────────────────────
    let inboxContext: any[] = [];
    try {
      const inboxProjects = await getInboxProjects();
      for (const p of inboxProjects.slice(0, 2)) {
        const convs = await getConversations(p.id);
        const convData = [];
        for (const c of convs.slice(0, 3)) {
          const msgs = await getMessages(c.id);
          convData.push({
            id: c.id,
            title: c.title || (c.type === 'project_group' ? 'General' : 'Direct Message'),
            type: c.type,
            messages: msgs.slice(-8).map((m: any) => ({
              sender: m.profiles?.name || 'Unknown',
              body: m.body,
              type: m.type,
              timestamp: m.created_at
            }))
          });
        }
        inboxContext.push({ project: p.name, conversations: convData });
      }
    } catch (e) {
      console.warn('[chatbot] Failed to fetch inbox context:', e);
    }

    // ── Build ERP context from Zustand store ──────────────────────────────
    const erpContext = {
      projects: projects.map(p => ({
        id: p.id,
        name: p.name,
        status: p.status,
        progress: p.progress,
        budget: p.budget,
        actualSpend: p.actualSpend,
        currentPhase: p.currentPhase,
        materials: (p.materials || []).map(m => ({
          itemName: m.itemName,
          quantity: m.quantity,
          unit: m.unit,
          reorderLevel: m.reorderLevel
        })),
        dailyActivities: (p.dailyActivities || []).slice(0, 3).map(da => ({
          date: da.date,
          status: da.status,
          notes: da.workCompleted
        }))
      })),
      vendors: vendors.slice(0, 10).map(v => ({
        name: v.name,
        category: v.category,
        rating: v.rating,
        email: v.email,
        phone: v.phone
      })),
      vendorBills: vendorBills.slice(0, 10).map(b => ({
        id: b.id,
        amount: b.amount,
        status: b.status,
        vendorId: b.vendorId
      })),
      currentUser: { name: currentUser?.name, role: currentUser?.role },
      inbox: inboxContext
    };

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageText,
          history: messages.map(m => ({ role: m.role, content: m.content })),
          context: erpContext
        }),
      });

      if (!response.ok) throw new Error('API request failed');

      const data = await response.json();
      const assistantContent = data.response || 'I encountered an error processing your query.';

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: assistantContent,
        timestamp: new Date()
      }]);

      // ── Persist assistant reply to Supabase ───────────────────────────
      if (activeSessionId) {
        await saveChatMessage(activeSessionId, 'assistant', assistantContent, data.tokens_used);
      }
    } catch (error) {
      console.error('[chatbot] Chat error:', error);
      const errContent = '⚠️ Failed to connect to the AI Assistant service. Please verify that the backend FastAPI server is running.';
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: errContent,
        timestamp: new Date()
      }]);
      if (activeSessionId) {
        await saveChatMessage(activeSessionId, 'assistant', errContent);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const suggestions = [
    { text: 'Any project delays?', icon: Clock },
    { text: 'Show budget burn comparison', icon: Coins },
    { text: 'Check material shortages', icon: PackageOpen },
  ];

  return (
    <div className="fixed bottom-6 right-6 z-[999] flex flex-col items-end">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.95 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="mb-4 flex h-[500px] w-[380px] flex-col rounded-2xl border border-gray-200 bg-white/95 shadow-2xl backdrop-blur-md dark:border-gray-800 dark:bg-gray-900/95 sm:w-[420px]"
          >
            {/* Header */}
            <div className="flex items-center justify-between rounded-t-2xl bg-gradient-to-r from-[#b68d40] to-[#cba358] px-4 py-3 text-white">
              <div className="flex items-center gap-2">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-white/20">
                  <Sparkles className="h-4.5 w-4.5 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-sm font-bold tracking-wide">Pragati AI Assistant</h3>
                  <span className="block text-[10px] text-white/80">ERP Intelligence Engine</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {messages.length > 1 && (
                  <button 
                    onClick={clearChatHistory}
                    className="rounded-lg p-1 text-white/85 hover:bg-white/10 hover:text-white transition-colors mr-1"
                    title="Clear Chat History"
                    type="button"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </button>
                )}
                <button 
                  onClick={toggleChat}
                  className="rounded-lg p-1 text-white/85 hover:bg-white/10 hover:text-white transition-colors"
                  aria-label="Close Chat"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((msg, index) => {
                const isUser = msg.role === 'user';
                return (
                  <div key={index} className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
                    {!isUser && (
                      <div className="grid h-7 w-7 flex-shrink-0 place-items-center rounded bg-[#b68d40] text-white shadow-sm text-[10px] font-bold">
                        AI
                      </div>
                    )}
                    <div className={`group relative max-w-[80%] rounded-2xl px-3.5 py-2.5 text-xs leading-5 shadow-sm ${
                      isUser 
                        ? 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-tr-none'
                        : 'bg-white dark:bg-gray-950 border border-gray-100 dark:border-gray-900 text-gray-700 dark:text-gray-300 rounded-tl-none prose dark:prose-invert prose-xs'
                    }`}>
                      {/* Render markdown alerts and tables using custom renderer */}
                      <div className="font-sans">
                        {msg.content.includes('> [!') ? (
                          <div className="space-y-2">
                            {msg.content.split('\n').map((line, lIdx) => {
                              if (line.startsWith('> [!NOTE]') || line.startsWith('> [!WARNING]') || line.startsWith('> [!IMPORTANT]')) return null;
                              if (line.startsWith('>')) {
                                return (
                                  <div key={lIdx} className="flex gap-1.5 items-start bg-amber-500/10 text-amber-600 dark:text-amber-400 p-2.5 rounded-xl border border-amber-500/10 font-semibold text-[11px] my-2">
                                    <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                                    <span>{line.replace(/^>\s*/, '')}</span>
                                  </div>
                                );
                              }
                              return <p key={lIdx} className="leading-relaxed">{parseFormatting(line)}</p>;
                            })}
                          </div>
                        ) : (
                          renderMessageContent(msg.content)
                        )}
                      </div>

                      {!isUser && (
                        <button
                          onClick={() => copyToClipboard(msg.content, index)}
                          className="absolute -bottom-7 right-1 hidden group-hover:flex items-center gap-1 rounded bg-white px-1.5 py-0.5 text-[9px] border border-gray-100 text-gray-400 hover:text-gray-600 dark:bg-gray-800 dark:border-gray-700"
                        >
                          {copiedIndex === index ? (
                            <>
                              <Check className="h-3 w-3 text-emerald-600" />
                              <span className="text-emerald-600">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-3 w-3" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {isLoading && (
                <div className="flex gap-3 justify-start">
                  <div className="grid h-7 w-7 flex-shrink-0 place-items-center rounded bg-[#b68d40] text-white shadow-sm text-[10px] font-bold">
                    AI
                  </div>
                  <div className="flex items-center gap-1.5 bg-white dark:bg-gray-950 border border-gray-100 dark:border-gray-900 rounded-2xl rounded-tl-none px-4 py-3 shadow-sm">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-[#b68d40]" />
                    <span className="text-[11px] text-gray-400">Analyzing ERP data...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Suggestions */}
            {messages.length === 1 && !isLoading && (
              <div className="px-4 pb-2 pt-1">
                <p className="mb-2 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Quick Prompts</p>
                <div className="flex flex-col gap-1.5">
                  {suggestions.map((sug, sIdx) => {
                    const SugIcon = sug.icon;
                    return (
                      <button
                        key={sIdx}
                        onClick={() => handleSendMessage(sug.text)}
                        className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50/50 px-3.5 py-2 text-left text-xs font-medium text-gray-600 hover:bg-gray-100 dark:border-gray-800 dark:bg-gray-800/30 dark:text-gray-300 dark:hover:bg-gray-800/80 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <SugIcon className="h-3.5 w-3.5 text-[#b68d40]" />
                          <span>{sug.text}</span>
                        </div>
                        <ArrowRight className="h-3 w-3 text-gray-400" />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Input Bar */}
            <form 
              onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }}
              className="border-t border-gray-100 bg-gray-50/80 p-3 dark:border-gray-800 dark:bg-gray-900/50 rounded-b-2xl"
            >
              <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-1.5 dark:border-gray-800 dark:bg-gray-950">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Ask Pragati AI..."
                  className="flex-1 bg-transparent text-xs text-gray-800 placeholder-gray-400 focus:outline-none dark:text-gray-100"
                />
                <button
                  type="submit"
                  disabled={!inputValue.trim() || isLoading}
                  className="rounded-lg bg-[#b68d40] p-1.5 text-white hover:bg-[#a57f35] disabled:bg-gray-100 disabled:text-gray-300 dark:disabled:bg-gray-800 dark:disabled:text-gray-600 transition-colors"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Action Button */}
      <motion.button
        onClick={toggleChat}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-r from-[#b68d40] to-[#cba358] text-white shadow-2xl transition-shadow duration-300 hover:shadow-[#b68d40]/20"
        aria-label="Open AI Assistant"
      >
        {isOpen ? (
          <ChevronDown className="h-6 w-6" />
        ) : (
          <div className="relative">
            <MessageSquare className="h-6 w-6" />
            <span className="absolute -right-1 -top-1 flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#d6b26b] opacity-75"></span>
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#fae5b6]"></span>
            </span>
          </div>
        )}
      </motion.button>
    </div>
  );
}
