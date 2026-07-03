// Aggregates contractor, agency, work-order, and fleet operations across project sites.
'use client';

import Link from 'next/link';
import { BriefcaseBusiness, HardHat, Truck, Users } from 'lucide-react';
import { useAppStore } from '@/store/use-app-store';

export default function WorkOrdersPage() {
  const { projects } = useAppStore();
  const contractorRecords = projects.flatMap((project) =>
    project.labourRecords.map((record) => ({ ...record, projectName: project.name, projectId: project.id })),
  );
  const equipment = projects.flatMap((project) =>
    project.equipments.map((item) => ({ ...item, projectName: project.name })),
  );
  const tasks = projects.flatMap((project) =>
    project.tasks.map((task) => ({ ...task, projectName: project.name, projectId: project.id })),
  );
  const averageProductivity = contractorRecords.length
    ? contractorRecords.reduce((total, record) => total + record.productivity, 0) / contractorRecords.length
    : 0;

  return (
    <div className="space-y-5">
      <header>
        <span className="rounded-full border border-orange-100 bg-orange-50 px-2.5 py-1 text-[11px] font-semibold uppercase text-primary dark:border-orange-900/40 dark:bg-orange-950/30">Contractor Management</span>
        <h1 className="font-heading mt-2 text-2xl font-semibold text-gray-950 dark:text-white">Work Orders</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Agencies, contractors, assigned work, performance, and operational fleet across all sites.</p>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Contractor Records', value: contractorRecords.length, icon: Users },
          { label: 'Open Work Orders', value: tasks.filter((task) => task.status !== 'COMPLETED').length, icon: BriefcaseBusiness },
          { label: 'Avg. Productivity', value: `${averageProductivity.toFixed(1)}%`, icon: HardHat },
          { label: 'Fleet in Maintenance', value: equipment.filter((item) => item.status === 'MAINTENANCE').length, icon: Truck },
        ].map((metric) => {
          const Icon = metric.icon;
          return (
            <article key={metric.label} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-850 dark:bg-gray-900">
              <Icon className="h-4 w-4 text-primary" />
              <p className="mt-3 text-xl font-semibold">{metric.value}</p>
              <p className="mt-1 text-[10px] font-bold uppercase text-gray-400">{metric.label}</p>
            </article>
          );
        })}
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-850 dark:bg-gray-900">
          <h2 className="font-heading text-base font-semibold">Contractor Performance</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-gray-200 text-gray-400 dark:border-gray-800">
                <tr><th className="pb-3">Contractor</th><th className="pb-3">Site</th><th className="pb-3">Manpower</th><th className="pb-3">Productivity</th></tr>
              </thead>
              <tbody>
                {contractorRecords.map((record) => (
                  <tr key={record.id} className="border-b border-gray-50 dark:border-gray-850">
                    <td className="py-3 font-bold">{record.contractorName}</td>
                    <td className="py-3"><Link href={`/projects/${record.projectId}`} className="font-semibold text-primary">{record.projectName}</Link></td>
                    <td className="py-3">{record.presentCount} present</td>
                    <td className="py-3 font-bold">{record.productivity}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-850 dark:bg-gray-900">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-heading text-base font-semibold">Operations Fleet</h2>
              <p className="mt-1 text-xs text-gray-400">Fleet management is grouped under operations.</p>
            </div>
            <Link href="/equipment" className="text-xs font-bold text-primary">Detailed view</Link>
          </div>
          <div className="mt-4 space-y-2">
            {equipment.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-xl border border-gray-100 px-3 py-2.5 text-xs dark:border-gray-800">
                <div><p className="font-bold">{item.name}</p><p className="mt-0.5 text-gray-400">{item.projectName}</p></div>
                <span className={`rounded-full px-2 py-1 text-[9px] font-bold ${item.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30' : 'bg-amber-50 text-amber-700 dark:bg-amber-950/30'}`}>{item.status}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
