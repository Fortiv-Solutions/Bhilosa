'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAppStore } from '@/store/use-app-store';
import { ChecklistTemplate, ChecklistTemplateItem } from '@/utils/mock-data';
import {
  ShieldCheck,
  Plus,
  ArrowLeft,
  CheckCircle2,
  ListChecks,
  Settings,
  Pencil,
  Trash2,
} from 'lucide-react';
import { format } from 'date-fns';

export default function ChecklistTemplatesPage() {
  const { projects, addChecklistTemplate } = useAppStore();
  const [selectedProjectId, setSelectedProjectId] = useState<string>(projects[0]?.id || '');
  
  const project = projects.find(p => p.id === selectedProjectId);
  const templates = project?.checklistTemplates || [];

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTemplate, setNewTemplate] = useState<Partial<ChecklistTemplate>>({
    name: '', category: 'QC', version: '1.0', status: 'DRAFT', items: []
  });

  const handleCreateTemplate = () => {
    if (!newTemplate.name || !selectedProjectId) return;
    
    addChecklistTemplate(selectedProjectId, {
      name: newTemplate.name!,
      category: newTemplate.category || 'QC',
      version: newTemplate.version || '1.0',
      status: newTemplate.status as 'ACTIVE' | 'DRAFT' | 'ARCHIVED',
      items: newTemplate.items || []
    });
    
    setShowCreateModal(false);
    setNewTemplate({ name: '', category: 'QC', version: '1.0', status: 'DRAFT', items: [] });
  };

  return (
    <div className="p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <Link href="/qc" className="flex items-center text-sm font-medium text-blue-600 hover:text-blue-700 mb-2">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to QC Dashboard
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <ListChecks className="w-8 h-8 text-blue-600" />
            Checklist Templates
          </h1>
          <p className="text-gray-500 mt-1">Manage standard inspection checklists for projects.</p>
        </div>
        <div className="flex gap-3">
          <select 
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors shadow-sm outline-none font-medium focus:ring-2 focus:ring-blue-500/20"
          >
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button 
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm shadow-blue-200 flex items-center gap-2 font-medium"
          >
            <Plus className="w-4 h-4" />
            Create Template
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {templates.length === 0 && (
          <div className="col-span-full py-16 text-center bg-white border border-gray-200 rounded-2xl">
            <ListChecks className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-lg font-medium text-gray-900">No templates found</p>
            <p className="text-gray-500 mt-1">Create your first checklist template for this project.</p>
            <button 
              onClick={() => setShowCreateModal(true)}
              className="mt-6 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg font-medium hover:bg-blue-100 transition-colors"
            >
              Create Template
            </button>
          </div>
        )}

        {templates.map(template => (
          <div key={template.id} className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm hover:shadow-md transition-shadow relative group">
            <div className="flex justify-between items-start mb-4">
              <div>
                <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium mb-3 ${
                  template.status === 'ACTIVE' ? 'bg-green-100 text-green-800' :
                  template.status === 'DRAFT' ? 'bg-gray-100 text-gray-800' :
                  'bg-yellow-100 text-yellow-800'
                }`}>
                  {template.status}
                </span>
                <h3 className="text-lg font-bold text-gray-900 leading-tight">{template.name}</h3>
                <p className="text-sm text-gray-500 mt-1">{template.category} • v{template.version}</p>
              </div>
              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                <button className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                  <Pencil className="w-4 h-4" />
                </button>
              </div>
            </div>
            
            <div className="border-t border-gray-100 pt-4 mt-4">
              <p className="text-sm font-medium text-gray-700 mb-3">{template.items.length} Check Points</p>
              <ul className="space-y-2">
                {template.items.slice(0, 3).map(item => (
                  <li key={item.id} className="flex items-start gap-2 text-sm text-gray-600">
                    <CheckCircle2 className="w-4 h-4 text-gray-300 mt-0.5 shrink-0" />
                    <span className="line-clamp-1">{item.question}</span>
                  </li>
                ))}
                {template.items.length > 3 && (
                  <li className="text-sm text-blue-600 font-medium pl-6 pt-1">
                    + {template.items.length - 3} more points
                  </li>
                )}
              </ul>
            </div>
          </div>
        ))}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h2 className="text-lg font-semibold text-gray-900">New Checklist Template</h2>
              <button 
                onClick={() => setShowCreateModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Template Name</label>
                <input 
                  type="text" 
                  value={newTemplate.name}
                  onChange={(e) => setNewTemplate({...newTemplate, name: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  placeholder="e.g. Slab Casting Checklist"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <select 
                    value={newTemplate.category}
                    onChange={(e) => setNewTemplate({...newTemplate, category: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option>QC</option>
                    <option>Safety</option>
                    <option>Material</option>
                    <option>Handover</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select 
                    value={newTemplate.status}
                    onChange={(e) => setNewTemplate({...newTemplate, status: e.target.value as any})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="DRAFT">Draft</option>
                    <option value="ACTIVE">Active</option>
                  </select>
                </div>
              </div>
            </div>
            
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 bg-gray-50">
              <button 
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleCreateTemplate}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors shadow-sm shadow-blue-200"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
