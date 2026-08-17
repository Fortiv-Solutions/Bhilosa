'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import {
  ArrowUp,
  Building2,
  Check,
  ChevronDown,
  Clipboard,
  FileText,
  Menu,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Plus,
  Search,
  TrendingUp,
  X,
  Wrench,
  Clock,
  Coins,
  PackageOpen,
  Calendar,
  Gauge,
  AlertCircle
} from 'lucide-react';
import { useAppStore, AIConversation, AIMessage } from '@/store/use-app-store';

const PramukhLogo = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="30 1 36 29" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path fill="currentColor" d="M52.13,17.62v2.6s7.81,1.18,9,9.31h4.34a4.39,4.39,0,0,1-1.9-2.21C63,25.74,60.25,18.65,52.13,17.62ZM34.47,3.9H44.72V14.23C37.23,14.15,34.62,13.2,34.47,3.9ZM30,1.38A5.14,5.14,0,0,1,32,5.24v.63c.71,9.31,4.65,10.57,12.7,10.65V27.16h-.08s-.4,2.21-1.58,2.37h4.18V1.38H30ZM43.53,17.62v2.6s-7.8,1.18-8.91,9.31H30.29a4.07,4.07,0,0,0,1.81-2.21C32.65,25.74,35.49,18.65,43.53,17.62ZM51,14.23V3.9H61.28C61,13.2,58.44,14.15,51,14.23ZM63.8,1.38H48.5V29.53h4.1C51.5,29.37,51,27.16,51,27.16h0V16.52c8-.08,12-1.34,12.61-10.65a1.71,1.71,0,0,0,.08-.63,4.93,4.93,0,0,1,2-3.86Z"/>
  </svg>
);

interface AssistantTool {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  prompt: string;
  path?: string;
}

const promptSuggestions: AssistantTool[] = [
  {
    icon: Clock,
    title: 'Schedule Defect',
    prompt: 'Why is Orbit 4 delayed?',
  },
  {
    icon: Coins,
    title: 'Budget Burn',
    prompt: 'Compare budget burn across projects.',
  },
  {
    icon: PackageOpen,
    title: 'Procurement Check',
    prompt: 'Show procurement bottlenecks.',
  },
  {
    icon: Calendar,
    title: 'Completion Forecast',
    prompt: 'Predict project completion date.',
  },
  {
    icon: FileText,
    title: 'Client Reporting',
    prompt: 'Generate client progress report.',
  },
  {
    icon: AlertCircle,
    title: 'Material Shortage',
    prompt: 'Show material shortages.',
  },
];

export default function AIAssistantPage() {
  const { currentUser, aiConversations: conversations, sendAIAssistantMessage, createAIConversation } = useAppStore();
  const [activeConversationId, setActiveConversationId] = useState(conversations[0]?.id || 'portfolio-summary');
  const [inputValue, setInputValue] = useState('');
  const [isResponding, setIsResponding] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeConversation =
    conversations.find((conversation) => conversation.id === activeConversationId) ?? conversations[0];
  const firstName = currentUser?.name?.split(' ')[0] || 'there';
  const initials = currentUser?.name
    ?.split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'PU';

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConversation.messages, isResponding]);

  const startNewChat = () => {
    const id = `conversation-${Date.now()}`;
    createAIConversation(id, 'New conversation');
    setActiveConversationId(id);
    setInputValue('');
    setHistoryOpen(false);
  };

  const sendMessage = (messageOverride?: string) => {
    const content = (messageOverride ?? inputValue).trim();
    if (!content || isResponding) return;

    setInputValue('');
    setIsResponding(true);

    sendAIAssistantMessage(activeConversationId, content);

    // Give a brief visual delay to clear the loading state
    window.setTimeout(() => {
      setIsResponding(false);
    }, 650);
  };

  const copyMessage = async (message: AIMessage) => {
    await navigator.clipboard.writeText(message.content);
    setCopiedMessageId(message.id);
    window.setTimeout(() => setCopiedMessageId(null), 1400);
  };

  return (
    <div className="relative flex h-[calc(100vh-2rem)] min-h-[620px] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-950 lg:h-[calc(100vh-2rem)]">
      <AnimatePresence>
        {historyOpen && (
          <>
            <motion.button
              aria-label="Close chat history"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setHistoryOpen(false)}
              className="absolute inset-0 z-30 bg-gray-950/35 lg:hidden"
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.24, ease: [0.25, 1, 0.5, 1] }}
              className="absolute inset-y-0 left-0 z-40 w-[min(86vw,300px)] lg:hidden"
            >
              <ConversationHistory
                conversations={conversations}
                activeConversationId={activeConversationId}
                onSelect={(id) => {
                  setActiveConversationId(id);
                  setHistoryOpen(false);
                }}
                onNewChat={startNewChat}
                onClose={() => setHistoryOpen(false)}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <aside className="hidden w-[248px] flex-shrink-0 border-r border-gray-200 bg-[#f7f7f5] dark:border-gray-800 dark:bg-gray-900/60 lg:block">
        <ConversationHistory
          conversations={conversations}
          activeConversationId={activeConversationId}
          onSelect={setActiveConversationId}
          onNewChat={startNewChat}
        />
      </aside>

      <section className="flex min-w-0 flex-1 flex-col bg-white dark:bg-gray-950">
        <header className="flex h-16 flex-shrink-0 items-center justify-between border-b border-gray-100 px-3 sm:px-5 dark:border-gray-800">
          <div className="flex min-w-0 items-center gap-2">
            <button
              onClick={() => setHistoryOpen(true)}
              className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg text-gray-500 transition-colors duration-200 hover:bg-gray-100 hover:text-gray-900 active:scale-[0.97] dark:hover:bg-gray-900 dark:hover:text-white lg:hidden"
              aria-label="Open chat history"
            >
              <Menu className="h-5 w-5" />
            </button>
            <button className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors duration-200 hover:bg-gray-100 active:scale-[0.98] dark:hover:bg-gray-900">
              <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-[#e83e8c] text-white shadow-sm">
                <PramukhLogo className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-gray-900 dark:text-white">Pramukh Project Intelligence</span>
                <span className="block text-[11px] text-gray-500 dark:text-gray-400">Enterprise AI Engine</span>
              </span>
              <ChevronDown className="h-4 w-4 flex-shrink-0 text-gray-400" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={startNewChat}
              className="flex h-9 items-center gap-2 rounded-lg bg-gray-950 px-3 text-xs font-semibold text-white transition-transform duration-150 active:scale-[0.97] dark:bg-white dark:text-gray-950"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">New chat</span>
            </button>
            <div
              className="grid h-9 w-9 place-items-center rounded-full border border-[#e83e8c]/25 bg-[#fdeef4] text-xs font-bold text-[#a3105c] dark:bg-[#3a0f28]/40 dark:text-[#f2679f]"
              title={currentUser?.name}
            >
              {initials}
            </div>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-4 sm:px-6">
            {activeConversation.messages.length === 0 ? (
              <EmptyConversation firstName={firstName} onPromptSelect={sendMessage} />
            ) : (
              <div className="flex-1 py-7 sm:py-10">
                <AnimatePresence initial={false}>
                  {activeConversation.messages.map((message) => (
                    <motion.article
                      key={message.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                      className={`mb-7 flex gap-3 sm:gap-4 ${
                        message.role === 'user' ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      {message.role === 'assistant' && (
                        <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-[#e83e8c] text-white shadow-sm">
                          <PramukhLogo className="h-5 w-5" />
                        </div>
                      )}

                      <div className={`min-w-0 ${message.role === 'user' ? 'max-w-[85%] sm:max-w-[76%]' : 'max-w-[88%]'}`}>
                        <div
                          className={
                            message.role === 'user'
                              ? 'rounded-2xl rounded-br-md bg-[#f1eee8] px-4 py-3 text-sm leading-6 text-gray-800 dark:bg-gray-800 dark:text-gray-100'
                              : 'pt-1 text-sm leading-7 text-gray-700 dark:text-gray-200'
                          }
                        >
                          {message.content}
                        </div>

                        {message.role === 'assistant' && (
                          <div className="mt-2 flex items-center gap-1">
                            <button
                              onClick={() => copyMessage(message)}
                              className="grid h-8 w-8 place-items-center rounded-lg text-gray-400 transition-colors duration-200 hover:bg-gray-100 hover:text-gray-700 active:scale-[0.97] dark:hover:bg-gray-900 dark:hover:text-gray-200"
                              aria-label="Copy response"
                              title="Copy response"
                            >
                              {copiedMessageId === message.id ? (
                                <Check className="h-4 w-4 text-emerald-600" />
                              ) : (
                                <Clipboard className="h-4 w-4" />
                              )}
                            </button>
                            <button
                              className="grid h-8 w-8 place-items-center rounded-lg text-gray-400 transition-colors duration-200 hover:bg-gray-100 hover:text-gray-700 active:scale-[0.97] dark:hover:bg-gray-900 dark:hover:text-gray-200"
                              aria-label="More response actions"
                              title="More actions"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    </motion.article>
                  ))}
                </AnimatePresence>

                {isResponding && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-7 flex items-center gap-4"
                  >
                    <div className="grid h-8 w-8 place-items-center rounded-lg bg-[#e83e8c] text-white">
                      <PramukhLogo className="h-5 w-5" />
                    </div>
                    <div className="flex items-center gap-1.5">
                      {[0, 1, 2].map((dot) => (
                        <motion.span
                          key={dot}
                          animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
                          transition={{ duration: 0.9, repeat: Infinity, delay: dot * 0.12 }}
                          className="h-1.5 w-1.5 rounded-full bg-[#e83e8c]"
                        />
                      ))}
                    </div>
                  </motion.div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </div>

        <div className="flex-shrink-0 bg-white px-3 pb-3 pt-2 dark:bg-gray-950 sm:px-6 sm:pb-4">
          <div className="mx-auto max-w-3xl">
            {/* One-Click AI Actions Bar */}
            <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
              <button 
                type="button"
                onClick={() => sendMessage('Generate MOM for yesterday\'s site inspection')}
                className="text-[10px] sm:text-xs font-bold border border-gray-250 bg-gray-50 hover:bg-[#fdeef4] hover:border-[#e83e8c]/45 dark:bg-gray-900 dark:border-gray-800 dark:hover:bg-[#3a0f28]/15 px-3 py-1.5 rounded-full transition-all flex items-center gap-1.5 cursor-pointer text-gray-700 dark:text-gray-300"
              >
                📝 Generate MOM
              </button>
              <button 
                type="button"
                onClick={() => sendMessage('Generate Daily Progress Report (DPR) for active sites')}
                className="text-[10px] sm:text-xs font-bold border border-gray-250 bg-gray-50 hover:bg-[#fdeef4] hover:border-[#e83e8c]/45 dark:bg-gray-900 dark:border-gray-800 dark:hover:bg-[#3a0f28]/15 px-3 py-1.5 rounded-full transition-all flex items-center gap-1.5 cursor-pointer text-gray-700 dark:text-gray-300"
              >
                📋 Generate DPR
              </button>
              <button 
                type="button"
                onClick={() => sendMessage('Create a draft Purchase Request for Portland Cement')}
                className="text-[10px] sm:text-xs font-bold border border-gray-250 bg-gray-50 hover:bg-[#fdeef4] hover:border-[#e83e8c]/45 dark:bg-gray-900 dark:border-gray-800 dark:hover:bg-[#3a0f28]/15 px-3 py-1.5 rounded-full transition-all flex items-center gap-1.5 cursor-pointer text-gray-700 dark:text-gray-300"
              >
                📦 Create PR
              </button>
              <button 
                type="button"
                onClick={() => sendMessage('Create Site Visit Report')}
                className="text-[10px] sm:text-xs font-bold border border-gray-250 bg-gray-50 hover:bg-[#fdeef4] hover:border-[#e83e8c]/45 dark:bg-gray-900 dark:border-gray-800 dark:hover:bg-[#3a0f28]/15 px-3 py-1.5 rounded-full transition-all flex items-center gap-1.5 cursor-pointer text-gray-700 dark:text-gray-300"
              >
                🩺 Site Visit Report
              </button>
              <button 
                type="button"
                onClick={() => sendMessage('Summarize WhatsApp Updates')}
                className="text-[10px] sm:text-xs font-bold border border-gray-250 bg-gray-50 hover:bg-[#fdeef4] hover:border-[#e83e8c]/45 dark:bg-gray-900 dark:border-gray-800 dark:hover:bg-[#3a0f28]/15 px-3 py-1.5 rounded-full transition-all flex items-center gap-1.5 cursor-pointer text-gray-700 dark:text-gray-300"
              >
                💬 WhatsApp Updates
              </button>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-2 shadow-[0_10px_35px_rgba(15,23,42,0.08)] transition-[border-color,box-shadow] duration-200 focus-within:border-[#e83e8c]/70 focus-within:shadow-[0_12px_38px_rgba(182,141,64,0.13)] dark:border-gray-700 dark:bg-gray-900">
              <textarea
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="Ask about projects, budgets, materials, or schedules"
                rows={2}
                className="max-h-36 min-h-14 w-full resize-none bg-transparent px-2 pt-2 text-sm leading-6 text-gray-900 outline-none placeholder:text-gray-400 dark:text-white"
              />
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-1">
                  <button
                    className="grid h-9 w-9 place-items-center rounded-lg text-gray-500 transition-colors duration-200 hover:bg-gray-100 hover:text-gray-900 active:scale-[0.97] dark:hover:bg-gray-800 dark:hover:text-white"
                    aria-label="Attach a file"
                    title="Attach a file"
                  >
                    <Paperclip className="h-4 w-4" />
                  </button>
                  <button className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-gray-500 transition-colors duration-200 hover:bg-gray-100 hover:text-gray-900 active:scale-[0.97] dark:hover:bg-gray-800 dark:hover:text-white">
                    <Search className="h-4 w-4" />
                    Search projects
                  </button>
                </div>
                <button
                  onClick={() => sendMessage()}
                  disabled={!inputValue.trim() || isResponding}
                  className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-[#e83e8c] text-white shadow-sm transition-[transform,background-color,opacity] duration-150 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-35"
                  aria-label="Send message"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
              </div>
            </div>
            <p className="mt-2 text-center text-[10px] text-gray-400 dark:text-gray-500">
              Pramukh Project Intelligence may make mistakes. Verify critical project and financial decisions.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function ConversationHistory({
  conversations,
  activeConversationId,
  onSelect,
  onNewChat,
  onClose,
}: {
  conversations: AIConversation[];
  activeConversationId: string;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onClose?: () => void;
}) {
  return (
    <div className="flex h-full flex-col bg-[#f7f7f5] p-3 dark:bg-gray-900">
      <div className="mb-4 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg border border-[#e83e8c]/20 bg-white text-[#e83e8c] shadow-sm dark:bg-gray-950">
            <PramukhLogo className="h-5 w-5" />
          </span>
          <span className="text-sm font-semibold text-gray-900 dark:text-white">AI Workspace</span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-800"
            aria-label="Close chat history"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <button
        onClick={onNewChat}
        className="mb-5 flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-800 shadow-sm transition-[transform,border-color] duration-150 hover:border-[#e83e8c]/50 active:scale-[0.98] dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
      >
        <Plus className="h-4 w-4" />
        New conversation
      </button>

      <div className="mb-2 flex items-center justify-between px-2">
        <span className="text-[10px] font-bold uppercase text-gray-400">Recent</span>
        <MessageSquare className="h-3.5 w-3.5 text-gray-400" />
      </div>

      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto">
        {conversations.map((conversation) => (
          <button
            key={conversation.id}
            onClick={() => onSelect(conversation.id)}
            className={`group flex w-full items-center gap-2 rounded-lg px-2.5 py-2.5 text-left transition-colors duration-200 ${
              activeConversationId === conversation.id
                ? 'bg-[#fdeef4] text-gray-950 dark:bg-[#3a0f28]/55 dark:text-white'
                : 'text-gray-600 hover:bg-gray-200/60 dark:text-gray-300 dark:hover:bg-gray-800'
            }`}
          >
            <MessageSquare
              className={`h-4 w-4 flex-shrink-0 ${
                activeConversationId === conversation.id ? 'text-[#e83e8c]' : 'text-gray-400'
              }`}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium">{conversation.title}</span>
              <span className="mt-0.5 block text-[10px] text-gray-400">{conversation.time}</span>
            </span>
            <MoreHorizontal className="h-4 w-4 flex-shrink-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
          </button>
        ))}
      </nav>

      <div className="mt-3 border-t border-gray-200 pt-3 dark:border-gray-800">
        <div className="flex items-center gap-2 rounded-lg px-2 py-2">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-[#e83e8c] text-[10px] font-bold text-white">PA</span>
          <span className="min-w-0">
            <span className="block text-xs font-semibold text-gray-800 dark:text-gray-100">Pramukh Project Intelligence</span>
            <span className="block text-[10px] text-emerald-600 dark:text-emerald-400">Portfolio data ready</span>
          </span>
        </div>
      </div>
    </div>
  );
}

function EmptyConversation({
  firstName,
  onPromptSelect,
}: {
  firstName: string;
  onPromptSelect: (prompt: string) => void;
}) {
  return (
    <div className="flex flex-1 flex-col justify-center py-10 sm:py-14">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        className="mb-8"
      >
        <div className="mb-5 grid h-11 w-11 place-items-center rounded-xl bg-[#e83e8c] text-white shadow-[0_8px_24px_rgba(182,141,64,0.25)]">
          <PramukhLogo className="h-6 w-6" />
        </div>
        <h1 className="font-heading text-2xl font-semibold text-gray-950 dark:text-white sm:text-3xl">How can I help, {firstName}?</h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-gray-500 dark:text-gray-400">
          Ask for a project summary, execution risk, budget comparison, material review, or a management-ready update.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {promptSuggestions.map((suggestion, index) => {
          const Icon = suggestion.icon;
          const content = (
            <>
              <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-[#fdeef4] text-[#a3105c] dark:bg-[#3a0f28]/45 dark:text-[#f2679f]">
                <Icon className="h-4 w-4" />
              </span>
              <span>
                <span className="block text-xs font-semibold text-gray-900 dark:text-white">{suggestion.title}</span>
                <span className="mt-1 block text-xs leading-5 text-gray-500 dark:text-gray-400">{suggestion.prompt}</span>
              </span>
            </>
          );
          const className = "group flex min-h-20 items-start gap-3 rounded-xl border border-gray-200 p-3 text-left transition-[transform,border-color,background-color] duration-200 hover:-translate-y-0.5 hover:border-[#e83e8c]/45 hover:bg-[#fef7fa] active:scale-[0.99] dark:border-gray-800 dark:hover:bg-[#3a0f28]/15";

          return suggestion.path ? (
            <motion.div
              key={suggestion.title}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, delay: index * 0.04, ease: [0.22, 1, 0.36, 1] }}
            >
              <Link href={suggestion.path} className={className}>
                {content}
              </Link>
            </motion.div>
          ) : (
            <motion.button
              key={suggestion.title}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, delay: index * 0.04, ease: [0.22, 1, 0.36, 1] }}
              onClick={() => onPromptSelect(suggestion.prompt)}
              className={className}
            >
              {content}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
