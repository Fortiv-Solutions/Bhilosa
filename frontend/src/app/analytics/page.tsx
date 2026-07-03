'use client';

import { useAppStore } from '@/store/use-app-store';
import { 
  ShieldCheck
} from 'lucide-react';

export default function AnalyticsPage() {
  const { projects } = useAppStore();

  const getImpactBadgeClass = (impact: string) => {
    switch (impact) {
      case 'CRITICAL':
        return 'bg-red-100 text-danger border-red-300';
      case 'HIGH':
        return 'bg-red-50 text-danger border-red-200';
      default:
        return 'bg-amber-50 text-warning border-amber-200';
    }
  };

  const insights = projects.map(proj => {
    const budget = proj.boqItems.reduce((acc, item) => acc + (item.rate * item.estimatedQty), 0);
    const actualSpend = proj.materials.reduce((acc, m) => acc + m.stockValue, 0); 
    const isOverrun = actualSpend > budget && budget > 0;
    const lowStockMats = proj.materials.filter(m => m.quantity <= m.reorderLevel);
    
    const projInsights = [];
    if (isOverrun) {
      projInsights.push({
        id: `ins_bud_${proj.id}`,
        type: 'BUDGET VARIANCE',
        impactLevel: 'HIGH',
        title: `Budget overrun risk at ${proj.name}`,
        description: `Actual spend (₹${actualSpend.toLocaleString()}) exceeds planned BOQ budget (₹${budget.toLocaleString()}).`,
        confidenceScore: 92,
        recommendation: `Review procurement costs for ${proj.name} and align with BOQ allowances.`
      });
    }

    if (lowStockMats.length > 0) {
      projInsights.push({
        id: `ins_mat_${proj.id}`,
        type: 'MATERIAL SHORTAGE',
        impactLevel: 'CRITICAL',
        title: `Critical material shortage at ${proj.name}`,
        description: `${lowStockMats.map(m => m.itemName).join(', ')} stock is below reorder threshold.`,
        confidenceScore: 88,
        recommendation: `Expedite purchase requisitions for ${lowStockMats[0].itemName} immediately.`
      });
    }

    if (proj.progress < 40 && proj.progress > 0) {
      projInsights.push({
        id: `ins_sch_${proj.id}`,
        type: 'SCHEDULE DELAY',
        impactLevel: 'HIGH',
        title: `Execution delay at ${proj.name}`,
        description: `Project progress is at ${proj.progress}%, trending behind the baseline curve.`,
        confidenceScore: 85,
        recommendation: `Re-evaluate critical path and increase manpower deployment.`
      });
    }

    return projInsights;
  }).flat();

  if (insights.length === 0) {
    insights.push({
        id: `ins_ok`,
        type: 'PORTFOLIO HEALTH',
        impactLevel: 'LOW',
        title: `All projects operating within tolerances`,
        description: `No critical budget overruns, material shortages, or schedule delays detected in the active portfolio.`,
        confidenceScore: 95,
        recommendation: `Maintain current execution velocity.`
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <span className="text-xs font-semibold text-primary uppercase tracking-normal bg-orange-50 dark:bg-orange-950/30 px-3 py-1 rounded-full border border-orange-100 dark:border-orange-900/40">
            Management Intelligence
          </span>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-normal text-gray-900 dark:text-white mt-2">
            Analytics & Reports
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Analyze delays, budgets, materials, productivity, and executive risk across all project sites.
          </p>
        </div>

        <span className="bg-orange-50 dark:bg-orange-950/40 text-primary px-3 py-1 rounded-full border border-orange-200 text-xs font-bold flex items-center gap-1.5 self-start md:self-auto">
          <ShieldCheck className="w-4 h-4 text-secondary animate-pulse" /> AI Copilot Engine Active
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {['Delay Analysis', 'Budget Analysis', 'Material Analysis', 'Productivity Analysis', 'Executive Reports'].map((section) => (
          <span key={section} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">{section}</span>
        ))}
      </div>

      {/* Analytics Insights */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {insights.map((insight) => (
          <div key={insight.id} className="bg-white dark:bg-gray-900 p-5 rounded-3xl border border-gray-100 dark:border-gray-850 shadow-sm flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-4">
                <span className="text-xs bg-orange-50 dark:bg-orange-950/40 text-primary border border-orange-200 px-2 py-0.5 rounded-full font-bold uppercase tracking-normal">
                  {insight.type}
                </span>

                <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${getImpactBadgeClass(insight.impactLevel)}`}>
                  {insight.impactLevel} IMPACT
                </span>
              </div>

              <h3 className="font-heading font-semibold text-base text-gray-900 dark:text-white leading-tight">
                {insight.title}
              </h3>
              
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                {insight.description}
              </p>
            </div>

            <div className="pt-3 border-t border-gray-50 dark:border-gray-850 space-y-2">
              <div className="flex justify-between text-xs text-gray-400 font-semibold">
                <span>Confidence Probability Score</span>
                <span>{insight.confidenceScore}%</span>
              </div>
              <div className="w-full h-1.5 bg-gray-50 dark:bg-gray-850 rounded-full overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${insight.confidenceScore}%` }} />
              </div>
              <p className="text-xs text-primary font-bold pt-1">
                <span className="text-gray-400 font-medium">Resolution:</span> {insight.recommendation}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
