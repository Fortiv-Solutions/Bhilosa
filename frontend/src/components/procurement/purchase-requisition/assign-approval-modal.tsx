'use client';

// Assign for Approval modal — approver dropdown (eligible only), approval level,
// due date, priority, instruction, and a notify toggle.

import { useState } from 'react';
import { X, UserCheck } from 'lucide-react';
import type { ApproverOption } from '@/lib/erp/purchase-requisition/service';

export interface AssignApprovalPayload {
  approverId: string;
  approverRole: string;
  level: number;
  dueDate: string | null;
  priority: string;
  instruction: string;
  notify: boolean;
}

interface AssignApprovalModalProps {
  open: boolean;
  approvers: ApproverOption[];
  submitting: boolean;
  onClose: () => void;
  onConfirm: (payload: AssignApprovalPayload) => void;
}

export function AssignApprovalModal({ open, approvers, submitting, onClose, onConfirm }: AssignApprovalModalProps) {
  const [approverId, setApproverId] = useState('');
  const [level, setLevel] = useState(1);
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState('normal');
  const [instruction, setInstruction] = useState('');
  const [notify, setNotify] = useState(true);

  if (!open) return null;
  const approver = approvers.find((a) => a.id === approverId);

  const FIELD = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary';
  const LABEL = 'mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground';

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Assign for approval">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border bg-muted/20 px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><UserCheck className="h-4 w-4" /></span>
            <h3 className="font-heading text-base font-bold">Assign for Approval</h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        <div className="grid grid-cols-2 gap-3 p-5">
          <div className="col-span-2">
            <label className={LABEL}>Approver</label>
            <select value={approverId} onChange={(e) => setApproverId(e.target.value)} className={FIELD}>
              <option value="">Select an approver…</option>
              {approvers.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.role.replaceAll('_', ' ')}</option>)}
            </select>
          </div>
          <div>
            <label className={LABEL}>Approver Role</label>
            <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm font-semibold capitalize">{approver ? approver.role.replaceAll('_', ' ') : '—'}</div>
          </div>
          <div>
            <label className={LABEL}>Approval Level</label>
            <select value={level} onChange={(e) => setLevel(Number(e.target.value))} className={FIELD}>
              <option value={1}>Level 1</option>
              <option value={2}>Level 2</option>
              <option value={3}>Level 3</option>
            </select>
          </div>
          <div>
            <label className={LABEL}>Due Date</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={FIELD} />
          </div>
          <div>
            <label className={LABEL}>Priority</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value)} className={FIELD}>
              <option value="normal">Normal</option>
              <option value="urgent">Urgent</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className={LABEL}>Instruction / Comment</label>
            <textarea value={instruction} onChange={(e) => setInstruction(e.target.value)} rows={2} className={FIELD} />
          </div>
          <label className="col-span-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="h-4 w-4 accent-[color:var(--color-primary)]" />
            Notify approver
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-xs font-bold hover:bg-muted">Cancel</button>
          <button
            onClick={() => approver && onConfirm({ approverId, approverRole: approver.role, level, dueDate: dueDate || null, priority, instruction: instruction.trim(), notify })}
            disabled={!approverId || submitting}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
          >
            <UserCheck className="h-3.5 w-3.5" /> {submitting ? 'Assigning…' : 'Assign for Approval'}
          </button>
        </div>
      </div>
    </div>
  );
}
