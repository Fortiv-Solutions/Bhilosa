'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAppStore } from '@/store/use-app-store';
import { WorkCompletion } from '@/utils/mock-data';
import {
  CheckCircle2,
  AlertCircle,
  FileText,
  ArrowLeft,
  XCircle,
  Activity,
  Lock,
  Unlock,
  Building2,
} from 'lucide-react';

export default function WorkCompletionPage() {
  const params = useParams();
  const projectId = params.id as string;
  const { projects, updateWorkCompletion } = useAppStore();
  
  const project = projects.find(p => p.id === projectId);
  const completions = project?.workCompletions || [];
  const activities = project?.dailyActivities || [];

  const handleApprove = (compId: string) => {
    updateWorkCompletion(projectId, compId, {
      status: 'COMPLETION_APPROVED',
      billingAllowed: true,
      blockReason: null
    });
  };

  const handleReject = (compId: string, reason: string) => {
    updateWorkCompletion(projectId, compId, {
      status: 'REWORK_REQUIRED',
      billingAllowed: false,
      blockReason: reason
    });
  };

  if (!project) return <div className="p-8 text-center text-gray-500">Project not found</div>;

  return (
    <div className="p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <Link href={`/projects/${projectId}`} className="flex items-center text-sm font-medium text-blue-600 hover:text-blue-700 mb-2">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Project
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <Activity className="w-8 h-8 text-emerald-600" />
            Work Completion Control
          </h1>
          <p className="text-gray-500 mt-1">Review activity progress, QC results, and approve completions for billing.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <p className="text-sm font-medium text-gray-500">Total Activities</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{activities.length}</p>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <p className="text-sm font-medium text-gray-500">Completion Pending Approval</p>
          <p className="text-2xl font-bold text-orange-600 mt-1">
            {completions.filter(c => c.status !== 'COMPLETION_APPROVED').length}
          </p>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <p className="text-sm font-medium text-gray-500">Billing Allowed</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">
            {completions.filter(c => c.billingAllowed).length}
          </p>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-600">
            <thead className="bg-gray-50 text-gray-900 font-medium border-b border-gray-200">
              <tr>
                <th className="py-4 px-6">Activity Reference</th>
                <th className="py-4 px-6">Work Details</th>
                <th className="py-4 px-6">Status</th>
                <th className="py-4 px-6">Billing Status</th>
                <th className="py-4 px-6">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {completions.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-gray-500">
                    <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-lg font-medium text-gray-900">No completion records</p>
                    <p>Site engineers haven't submitted any work for completion approval yet.</p>
                  </td>
                </tr>
              )}
              {completions.map((comp) => {
                const activity = activities.find(a => a.id === comp.activityId);
                return (
                  <tr key={comp.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="py-4 px-6 font-medium text-gray-900">{comp.id}</td>
                    <td className="py-4 px-6">
                      <div className="font-medium text-gray-900 line-clamp-1" title={activity?.workCompleted}>
                        {activity?.workCompleted || 'Unknown Activity'}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">Engineer: {activity?.engineerName}</div>
                    </td>
                    <td className="py-4 px-6">
                      <span className={`inline-flex px-2 py-1 rounded text-xs font-medium border ${
                        comp.status === 'COMPLETION_APPROVED' ? 'bg-green-50 text-green-700 border-green-200' :
                        comp.status === 'REWORK_REQUIRED' ? 'bg-red-50 text-red-700 border-red-200' :
                        'bg-yellow-50 text-yellow-700 border-yellow-200'
                      }`}>
                        {comp.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      {comp.billingAllowed ? (
                        <div className="flex items-center gap-1.5 text-emerald-600 font-medium">
                          <Unlock className="w-4 h-4" /> Allowed
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5 text-red-600 font-medium">
                            <Lock className="w-4 h-4" /> Blocked
                          </div>
                          <span className="text-xs text-red-500">{comp.blockReason}</span>
                        </div>
                      )}
                    </td>
                    <td className="py-4 px-6">
                      {comp.status !== 'COMPLETION_APPROVED' && (
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => handleApprove(comp.id)}
                            className="px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 rounded transition-colors text-xs font-medium"
                          >
                            Approve
                          </button>
                          {comp.status !== 'REWORK_REQUIRED' && (
                            <button 
                              onClick={() => handleReject(comp.id, 'Manually rejected by PM')}
                              className="px-3 py-1.5 bg-white text-red-600 border border-gray-200 hover:bg-red-50 rounded transition-colors text-xs font-medium"
                            >
                              Reject
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
