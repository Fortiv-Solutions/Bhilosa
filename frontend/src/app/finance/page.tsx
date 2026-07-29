'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function FinancePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/budget');
  }, [router]);

  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center space-y-3 text-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
        Redirecting to Budget Control Workspace…
      </p>
    </div>
  );
}
