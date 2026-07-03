'use client';

import { useState } from 'react';
import { useAppStore } from '@/store/use-app-store';
import { ReworkTask } from '@/utils/mock-data';
import {
  Wrench,
  Search,
  Filter,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowRight
} from 'lucide-react';
import { format } from 'date-fns';

export default function ReworkPage() {
  const { projects, updateReworkTaskStatus } = useAppStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const allReworks = projects.flatMap(p => (p.reworkTasks || []).map(rw => ({ ...rw, projectName: p.name })));
  
  const filteredReworks = allReworks.filter(rw => {
    const matchesSearch = rw.description.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          rw.assignedTo.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          rw.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || rw.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getSeverityBadge = (severity: string) => {
    switch(severity) {
      case 'Critical': return <span className="bg-red-100 text-red-800 px-2 py-1 rounded text-xs font-medium border border-red-200 flex items-center gap-1"><AlertTriangle className="w-3 h-3"/> Critical</span>;
      case 'High': return <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded text-xs font-medium border border-orange-200">High</span>;
      case 'Medium': return <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-xs font-medium border border-yellow-200">Medium</span>;
      default: return <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-medium border border-blue-200">Low</span>;
    }
  };

  const handleStatusChange = (projectId: string, reworkId: string, newStatus: ReworkTask['status']) => {
    updateReworkTaskStatus(projectId, reworkId, newStatus);
  };

  return (
    <div className="p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <Wrench className="w-8 h-8 text-orange-500" />
            Rework & NCR Management
          </h1>
          <p className="text-gray-500 mt-1">Track and resolve non-conformance issues from failed QC inspections.</p>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="relative w-full sm:w-96">
          <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input 
            type="text" 
            placeholder="Search by ID, description, or assignee..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
          />
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Filter className="w-5 h-5 text-gray-400" />
          <select 
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full sm:w-48 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
          >
            <option value="ALL">All Statuses</option>
            <option value="OPEN">Open</option>
            <option value="ASSIGNED">Assigned</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="SUBMITTED_FOR_RECHECK">Recheck Pending</option>
            <option value="CLOSED">Closed</option>
          </select>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-600">
            <thead className="bg-gray-50 text-gray-900 font-medium border-b border-gray-200">
              <tr>
                <th className="py-4 px-6">ID & Description</th>
                <th className="py-4 px-6">Severity</th>
                <th className="py-4 px-6">Project & Assignee</th>
                <th className="py-4 px-6">Due Date</th>
                <th className="py-4 px-6">Status</th>
                <th className="py-4 px-6">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredReworks.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-gray-500">
                    <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-3" />
                    <p className="text-lg font-medium text-gray-900">No Rework Tasks Found</p>
                    <p>Try adjusting your search or filters.</p>
                  </td>
                </tr>
              )}
              {filteredReworks.map((rw) => (
                <tr key={rw.id} className="hover:bg-gray-50/50 transition-colors group">
                  <td className="py-4 px-6">
                    <div className="font-medium text-gray-900">{rw.id}</div>
                    <div className="text-gray-500 max-w-xs truncate" title={rw.description}>{rw.description}</div>
                  </td>
                  <td className="py-4 px-6">
                    {getSeverityBadge(rw.severity)}
                  </td>
                  <td className="py-4 px-6">
                    <div className="font-medium text-gray-900">{rw.projectName}</div>
                    <div className="text-gray-500">Assigned: {rw.assignedTo}</div>
                  </td>
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-gray-400" />
                      <span className={new Date(rw.dueDate) < new Date() && rw.status !== 'CLOSED' ? 'text-red-600 font-medium' : ''}>
                        {format(new Date(rw.dueDate), 'dd MMM yyyy')}
                      </span>
                    </div>
                  </td>
                  <td className="py-4 px-6">
                    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium border ${
                      rw.status === 'CLOSED' ? 'bg-green-50 text-green-700 border-green-200' :
                      rw.status === 'SUBMITTED_FOR_RECHECK' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                      rw.status === 'IN_PROGRESS' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' :
                      'bg-gray-50 text-gray-700 border-gray-200'
                    }`}>
                      {rw.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="py-4 px-6">
                    {rw.status === 'SUBMITTED_FOR_RECHECK' && (
                      <button 
                        onClick={() => handleStatusChange(rw.projectId, rw.id, 'CLOSED')}
                        className="px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 transition-colors text-xs font-medium flex items-center gap-1"
                      >
                        <CheckCircle2 className="w-3 h-3" /> Approve
                      </button>
                    )}
                    {rw.status === 'OPEN' && (
                      <button 
                        onClick={() => handleStatusChange(rw.projectId, rw.id, 'ASSIGNED')}
                        className="px-3 py-1.5 bg-gray-100 text-gray-700 border border-gray-200 rounded hover:bg-gray-200 transition-colors text-xs font-medium"
                      >
                        Assign
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
