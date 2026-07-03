// Formats construction ERP data into a portfolio CSV report and triggers download.
export function downloadWholeReport(projects: any[]) {
  const csvRows: string[] = [];

  // 1. ERP Portfolio Summary Header
  csvRows.push("PRAGATI ERP - EXECUTIVE PORTFOLIO SUMMARY REPORT");
  csvRows.push(`Report Generated: ${new Date().toLocaleString()}`);
  csvRows.push("");

  // Calculate high-level portfolio metrics
  const totalProjects = projects.length;
  const avgProgress = projects.reduce((sum, p) => sum + (p.progress || 0), 0) / (totalProjects || 1);
  
  let totalAllocated = 0;
  let totalSpent = 0;
  let totalTasks = 0;
  let totalCompletedTasks = 0;

  projects.forEach(p => {
    // Budget calculations
    const budget = p.boqItems?.reduce((sum: number, item: any) => sum + (item.rate * item.estimatedQty), 0) || 0;
    const spent = p.materials?.reduce((sum: number, m: any) => sum + m.stockValue, 0) || 0;
    totalAllocated += budget;
    totalSpent += spent;

    // Task calculations
    totalTasks += p.tasks?.length || 0;
    totalCompletedTasks += p.tasks?.filter((t: any) => t.progress === 100).length || 0;
  });

  csvRows.push("PORTFOLIO SUMMARY METRICS");
  csvRows.push(`Total Active Sites,${totalProjects}`);
  csvRows.push(`Average Site Progress,${avgProgress.toFixed(1)}%`);
  csvRows.push(`Total Allocated Budget,INR ${(totalAllocated / 10_000_000).toFixed(2)} Cr (INR ${totalAllocated.toLocaleString('en-IN')})`);
  csvRows.push(`Total Material Spend,INR ${(totalSpent / 10_000_000).toFixed(2)} Cr (INR ${totalSpent.toLocaleString('en-IN')})`);
  csvRows.push(`Total Scheduled Tasks,${totalTasks}`);
  csvRows.push(`Total Completed Tasks,${totalCompletedTasks}`);
  csvRows.push("");

  // 2. Project-by-Project Detail
  csvRows.push("DETAILED ACTIVE PROJECTS LIST");
  csvRows.push("Project Name,Location,Status,Progress %,Allocated Budget (INR),Material Spend (INR),Total Tasks,Completed Tasks,Safety (Safe Days)");

  projects.forEach(p => {
    const budget = p.boqItems?.reduce((sum: number, item: any) => sum + (item.rate * item.estimatedQty), 0) || 0;
    const spent = p.materials?.reduce((sum: number, m: any) => sum + m.stockValue, 0) || 0;
    const completedTasks = p.tasks?.filter((t: any) => t.progress === 100).length || 0;
    
    const row = [
      `"${p.name}"`,
      `"${p.location || 'N/A'}"`,
      `"${p.status || 'Active'}"`,
      `${p.progress || 0}%`,
      `${budget}`,
      `${spent}`,
      `${p.tasks?.length || 0}`,
      `${completedTasks}`,
      `${p.safeDays || 0}`
    ];
    csvRows.push(row.join(","));
  });

  // 3. Trigger Download
  const csvContent = csvRows.join("\n");
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `pragati_executive_portfolio_report_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
