"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Sidebar from "@/components/sidebar";
import MobileNavbar from "@/components/mobile-navbar";
import HeaderNavbar from "@/components/header-navbar";
import { useAppStore } from "@/store/use-app-store";
import { canAccessPath } from "@/lib/rbac";

export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isLoggedIn, activeRole, checkLogin, initSupabase } = useAppStore();
  const [initialized, setInitialized] = useState(false);
  
  // Check if we are on a project details page (e.g. /projects/123, but not /projects)
  const isProjectDetails = pathname.startsWith('/projects/') && pathname !== '/projects';
  const isLoginPage = pathname === '/login';

  useEffect(() => {
    let active = true;
    void checkLogin().finally(() => {
      if (active) setInitialized(true);
    });
    return () => { active = false; };
  }, [checkLogin]);

  useEffect(() => {
    if (initialized && !isLoginPage && !isLoggedIn) {
      router.replace('/login');
    }
  }, [initialized, isLoggedIn, isLoginPage, router]);

  useEffect(() => {
    if (initialized && isLoggedIn && !isLoginPage && !canAccessPath(activeRole, pathname)) {
      router.replace('/dashboard');
    }
  }, [activeRole, initialized, isLoggedIn, isLoginPage, pathname, router]);

  useEffect(() => {
    if (initialized && isLoggedIn && !isLoginPage) {
      initSupabase();
    }
  }, [initSupabase, initialized, isLoggedIn, isLoginPage]);

  // Prevent flash of content when checking auth state
  if (!initialized) {
    return null;
  }

  // Login page: full-screen, no chrome
  if (isLoginPage) {
    return <>{children}</>;
  }

  // Never render the application shell without a live Supabase session.
  if (!isLoggedIn) {
    return null;
  }

  if (!canAccessPath(activeRole, pathname)) {
    return null;
  }

  if (isProjectDetails) {
    return (
      <div className="flex flex-1 bg-background w-full min-h-screen">
        <main className="flex-1 flex flex-col min-w-0 w-full">
          <div className="flex min-h-0 flex-1 flex-col w-full">
            {children}
          </div>
        </main>
      </div>
    );
  }

  return (
    <>
      <MobileNavbar />
      <div className="flex flex-1 bg-background p-2 lg:p-4 gap-2 lg:gap-6">
        <Sidebar />
        <main className="flex-1 flex flex-col min-w-0 py-2 lg:py-0 pt-[4.25rem] lg:pt-0">
          <HeaderNavbar />
          <div className="flex min-h-0 flex-1 flex-col">
            {children}
          </div>
        </main>
      </div>
    </>
  );
}
