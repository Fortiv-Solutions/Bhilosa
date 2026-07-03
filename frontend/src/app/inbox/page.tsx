'use client';

import React, { useState, useEffect } from 'react';
import { useAppStore } from '@/store/use-app-store';
import { InboxModule } from '@/components/projects/inbox-module';
import { Building, ChevronDown, Loader2 } from 'lucide-react';

export default function InboxPage() {
  const { projects } = useAppStore();
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Set initial selected project once loaded
  useEffect(() => {
    if (projects.length > 0 && !selectedProjectId) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProjectId]);

  // If projects are still loading
  if (projects.length === 0) {
    return (
      <div className="flex h-[calc(100vh-120px)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const selectedProject = projects.find(p => p.id === selectedProjectId) || projects[0];

  return (
    <div className="flex flex-col min-h-0 flex-1 gap-4">
      {/* Header Panel */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border bg-card p-4 rounded-3xl border shadow-xs">
        <div>
          <h1 className="font-heading text-xl font-bold text-foreground">PROJECT INBOX</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Centralized site coordination and direct messages</p>
        </div>

        {/* Project Selector Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-xs font-semibold text-foreground shadow-xs hover:bg-muted transition-all cursor-pointer"
          >
            <Building className="h-4 w-4 text-primary" />
            <span>{selectedProject?.name || 'Select Project'}</span>
            <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} />
          </button>
          {isDropdownOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setIsDropdownOpen(false)} />
              <div className="absolute right-0 mt-2 z-20 w-64 rounded-xl border border-border bg-popover p-1.5 shadow-premium animate-in fade-in slide-in-from-top-1 duration-200">
                {projects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setSelectedProjectId(p.id);
                      setIsDropdownOpen(false);
                    }}
                    className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-xs font-semibold transition-colors hover:bg-muted cursor-pointer ${
                      p.id === selectedProject.id ? 'bg-primary/10 text-primary' : 'text-foreground'
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

      {/* Main Inbox Module Container */}
      <div className="flex-1 min-h-0 bg-card border border-border rounded-3xl overflow-hidden shadow-xs">
        <InboxModule project={selectedProject} />
      </div>
    </div>
  );
}
