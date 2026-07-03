'use client';

import { useAppStore } from '@/store/use-app-store';
import { motion } from 'framer-motion';
import { 
  Wrench, 
  Clock, 
  Fuel, 
  Calendar,
  Building,
  CheckCircle
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { getEquipmentAssets } from '@/lib/equipment';
import { isLiveSupabase } from '@/lib/erp/supabase-modules';

export default function EquipmentPage() {
  const { projects } = useAppStore();
  const [liveEquipment, setLiveEquipment] = useState<any[]>([]);

  useEffect(() => {
    if (!isLiveSupabase()) return;
    getEquipmentAssets().then(data => {
      setLiveEquipment(data || []);
    }).catch(console.error);
  }, []);

  // Aggregate equipment
  const allEquipment = liveEquipment.length > 0
    ? liveEquipment.map(e => ({
        id: e.id,
        name: e.name || 'Unknown',
        projectName: e.projects?.name || 'Unknown Project',
        projectId: e.project_id,
        status: e.status?.toUpperCase() || 'ACTIVE',
        usageHours: e.total_usage_hours || 0,
        fuelConsumed: e.total_fuel_consumed || 0,
        lastMaintenance: e.last_maintenance_date || 'N/A'
      }))
    : projects.flatMap(p => 
        p.equipments.map(e => ({ ...e, projectName: p.name, projectId: p.id }))
      );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <span className="text-xs font-semibold text-primary uppercase tracking-normal bg-orange-50 dark:bg-orange-950/30 px-3 py-1 rounded-full border border-orange-100 dark:border-orange-900/40">
          Fleet Management
        </span>
        <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-normal text-gray-900 dark:text-white mt-2">
          Fleet Management
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Monitor site-wise machinery status, diesel consumption, usage hours, and maintenance alerts.
        </p>
      </div>

      {/* Equipment Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {allEquipment.map((eq) => (
          <div key={eq.id} className="bg-white dark:bg-gray-900 p-5 rounded-3xl border border-gray-100 dark:border-gray-850 shadow-sm flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-950/20 flex items-center justify-center text-primary">
                    <Wrench className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-heading font-semibold text-xs text-gray-900 dark:text-white leading-tight">{eq.name}</h3>
                    <p className="text-xs text-primary font-bold mt-1 uppercase tracking-normal">{eq.projectName}</p>
                  </div>
                </div>

                <span className={`px-2 py-0.5 rounded-full text-xs font-bold border
                  ${eq.status === 'ACTIVE' ? 'bg-emerald-50 border-emerald-200 text-success' : 
                    eq.status === 'MAINTENANCE' ? 'bg-red-50 border-red-200 text-danger' : 
                    'bg-amber-50 border-amber-200 text-warning'}`}>
                  {eq.status}
                </span>
              </div>

              {/* Data list */}
              <div className="grid grid-cols-2 gap-3 text-xs pt-4 mt-4 border-t border-gray-50 dark:border-gray-850">
                <div className="flex items-center gap-1.5 text-gray-500">
                  <Clock className="w-3.5 h-3.5 text-gray-405" />
                  <span>Hours: <span className="font-bold text-gray-900 dark:text-white">{eq.usageHours} hrs</span></span>
                </div>
                <div className="flex items-center gap-1.5 text-gray-500">
                  <Fuel className="w-3.5 h-3.5 text-gray-450" />
                  <span>Fuel: <span className="font-bold text-gray-900 dark:text-white">{eq.fuelConsumed} L</span></span>
                </div>
              </div>
            </div>

            <div className="flex justify-between text-xs text-gray-400 pt-2 border-t border-gray-50 dark:border-gray-850">
              <span>Last Maint: {eq.lastMaintenance}</span>
              <span className="text-success font-bold flex items-center gap-0.5"><CheckCircle className="w-3 h-3" /> Certified</span>
            </div>
          </div>
        ))}

        {allEquipment.length === 0 && (
          <div className="col-span-full py-12 text-center text-gray-400">
            No machinery inventory initialized.
          </div>
        )}
      </div>
    </div>
  );
}
