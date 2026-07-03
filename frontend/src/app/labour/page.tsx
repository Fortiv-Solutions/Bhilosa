'use client';

import { useAppStore } from '@/store/use-app-store';
import { motion } from 'framer-motion';
import { 
  Users, 
  Clock, 
  TrendingUp, 
  MapPin,
  Calendar,
  CheckSquare
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { getLabourAttendance } from '@/lib/labour';
import { isLiveSupabase } from '@/lib/erp/supabase-modules';

export default function LabourPage() {
  const { projects } = useAppStore();
  const [liveLabour, setLiveLabour] = useState<any[]>([]);

  useEffect(() => {
    if (!isLiveSupabase()) return;
    getLabourAttendance().then(data => {
      setLiveLabour(data || []);
    }).catch(console.error);
  }, []);

  // Aggregate all labour records
  const allLabour = liveLabour.length > 0 
    ? liveLabour.map(l => ({
        id: l.id,
        contractorName: l.contractor_id || 'Unknown', // Ideally fetch contractor name
        projectName: l.projects?.name || 'Unknown Project',
        projectId: l.project_id,
        presentCount: l.present_count || 0,
        absentCount: l.absent_count || 0,
        productivity: l.productivity_percent || 0,
        overtimeHours: l.overtime_hours || 0,
        date: l.attendance_date,
      }))
    : projects.flatMap(p => 
        p.labourRecords.map(l => ({ ...l, projectName: p.name, projectId: p.id }))
      );

  const totalPresent = allLabour.reduce((acc, l) => acc + l.presentCount, 0);
  const totalAbsent = allLabour.reduce((acc, l) => acc + l.absentCount, 0);
  const avgProductivity = allLabour.reduce((acc, l) => acc + l.productivity, 0) / (allLabour.length || 1);
  const totalOvertime = allLabour.reduce((acc, l) => acc + Number(l.overtimeHours || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <span className="text-xs font-semibold text-primary uppercase tracking-normal bg-orange-50 dark:bg-orange-950/30 px-3 py-1 rounded-full border border-orange-100 dark:border-orange-900/40">
          Workforce Management
        </span>
        <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-normal text-gray-900 dark:text-white mt-2">
          Workforce Registry & Attendance
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Monitor contractor daily attendance sheets, overtime shifts, and workforce productivity index.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-900 p-5 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-normal">Total Active Labour</p>
          <h3 className="font-heading text-2xl font-semibold text-orange-600 dark:text-orange-400 mt-2">{totalPresent}</h3>
          <p className="text-xs text-gray-400 mt-1">Present on sites today</p>
        </div>

        <div className="bg-white dark:bg-gray-900 p-5 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-normal">Total Absent</p>
          <h3 className="font-heading text-2xl font-semibold text-gray-400 mt-2">{totalAbsent}</h3>
          <p className="text-xs text-gray-450 mt-1">Contractor missing strength</p>
        </div>

        <div className="bg-white dark:bg-gray-900 p-5 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-normal">Avg Productivity</p>
          <h3 className="font-heading text-2xl font-semibold text-success mt-2">{avgProductivity.toFixed(1)}%</h3>
          <p className="text-xs text-success font-medium mt-1">Workrate threshold healthy</p>
        </div>

        <div className="bg-white dark:bg-gray-900 p-5 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-normal">Overtime Logged</p>
          <h3 className="font-heading text-2xl font-semibold text-gray-950 dark:text-white mt-2">{totalOvertime} hrs</h3>
          <p className="text-xs text-gray-400 mt-1">Authorized extra shifts today</p>
        </div>
      </div>

      {/* Labour Table */}
      <div className="bg-white dark:bg-gray-900 p-5 rounded-3xl border border-gray-100 dark:border-gray-850 shadow-sm space-y-4">
        <h3 className="font-heading font-semibold text-gray-900 dark:text-white text-base">Contractor Attendance Log</h3>
        
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-850 text-gray-400">
                <th className="pb-3 font-semibold">Subcontractor Name</th>
                <th className="pb-3 font-semibold">Allocated Project Site</th>
                <th className="pb-3 font-semibold">Present Count</th>
                <th className="pb-3 font-semibold">Absent Count</th>
                <th className="pb-3 font-semibold">Overtime Hours</th>
                <th className="pb-3 font-semibold">Productivity Index</th>
                <th className="pb-3 font-semibold">Log Date</th>
              </tr>
            </thead>
            <tbody>
              {allLabour.map((lab) => (
                <tr key={lab.id} className="border-b border-gray-50 dark:border-gray-850/50 hover:bg-gray-50/20">
                  <td className="py-3.5 font-bold text-gray-800 dark:text-gray-250 flex items-center gap-2">
                    <Users className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                    {lab.contractorName}
                  </td>
                  <td className="py-3.5 font-medium">{lab.projectName}</td>
                  <td className="py-3.5 font-bold text-orange-600 dark:text-orange-400">{lab.presentCount} present</td>
                  <td className="py-3.5 text-gray-400">{lab.absentCount} absent</td>
                  <td className="py-3.5">{lab.overtimeHours} hours</td>
                  <td className="py-3.5 font-bold text-success">{lab.productivity}%</td>
                  <td className="py-3.5 text-gray-400 flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> {lab.date}</td>
                </tr>
              ))}

              {allLabour.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-400">
                    No contractor logs registered for today.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
