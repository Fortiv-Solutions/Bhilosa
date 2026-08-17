"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Sidebar from "@/components/sidebar";
import FloatingChatbot from "@/components/floating-chatbot";
import MobileNavbar from "@/components/mobile-navbar";
import HeaderNavbar from "@/components/header-navbar";
import SubNavBar from "@/components/sub-navbar";
import NotificationPoller from "@/components/notification-poller";
import { useAppStore } from "@/store/use-app-store";
import { canAccessPath, getRoleLandingPath } from "@/lib/rbac";

export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isLoggedIn, activeRole, checkLogin, initSupabase } = useAppStore();
  const [initialized, setInitialized] = useState(false);
  const [isSuspended, setIsSuspended] = useState(false);
  
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

  // Periodically check system status if logged in and not on login page
  useEffect(() => {
    if (!initialized || !isLoggedIn || isLoginPage) {
      return;
    }

    const checkLicense = () => {
      fetch("/api/check-license")
        .then((res) => {
          if (res.status === 403) {
            setIsSuspended(true);
          } else {
            setIsSuspended(false);
          }
        })
        .catch(() => {});
    };
    
    checkLicense();
    // Check every 1 hour to verify license status
    const interval = setInterval(checkLicense, 3600000);
    return () => {
      clearInterval(interval);
    };
  }, [initialized, isLoggedIn, isLoginPage]);

  // Unauthenticated visitors are sent to the login page, which is the application's
  // landing page. (This replaces an auth bypass that force-redirected /login to
  // /dashboard, making the login screen unreachable.)
  useEffect(() => {
    if (initialized && !isLoggedIn && !isLoginPage) {
      const returnTo = pathname && pathname !== '/' ? `?next=${encodeURIComponent(pathname)}` : '';
      router.replace(`/login${returnTo}`);
    }
  }, [initialized, isLoggedIn, isLoginPage, pathname, router]);

  // NOTE: redirecting an already-authenticated user away from /login is owned by the
  // login page itself, because only it knows about the ?next= destination. Doing it
  // here as well would race and drop that deep link.

  useEffect(() => {
    if (initialized && isLoggedIn && !isLoginPage && !canAccessPath(activeRole, pathname)) {
      router.replace(getRoleLandingPath(activeRole));
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

  // Suspended layout: Full-screen lockout blur overlay
  if (isSuspended && !isLoginPage) {
    return (
      <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#0b0f19] p-6 text-center">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-red-500/5 rounded-full blur-[120px] pointer-events-none"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-rose-500/5 rounded-full blur-[120px] pointer-events-none"></div>

        <div className="max-w-md w-full bg-[#111827]/80 backdrop-blur-xl border border-red-950/30 rounded-3xl p-8 shadow-2xl relative z-10 text-slate-100">
          <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          
          <h1 className="text-2xl font-black font-heading text-white mb-2 tracking-tight">
            System Suspended
          </h1>
          <p className="text-[10px] font-extrabold tracking-widest uppercase text-red-555 mb-4">
            License Expired or Revoked
          </p>
          
          <p className="text-slate-400 text-xs leading-relaxed mb-6">
            Access to this Pramukh Group ERP workspace has been temporarily suspended by the system administrator. Please contact your system provider.
          </p>

          <div className="border-t border-slate-800 pt-6 text-[10px] text-slate-500 font-bold uppercase tracking-wider">
            Contact Support &bull; <span className="text-[#e83e8c] lowercase">admin@pramukh.com</span>
          </div>
        </div>
      </div>
    );
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
      <div className="flex flex-1 bg-background w-full min-h-screen relative">
        <main className="flex-1 flex flex-col min-w-0 w-full">
          <div className="flex min-h-0 flex-1 flex-col w-full">
            {children}
          </div>
        </main>
        <FloatingChatbot />
        <NotificationPoller />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden bg-background">
      <HeaderNavbar />
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <div className="flex flex-1 flex-col min-w-0">
          <MobileNavbar />
          <SubNavBar />
          <div className="flex flex-1 min-h-0 relative">
            <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
              <div className="flex min-h-0 flex-1 flex-col px-4 sm:px-6 pt-4 pb-6">
                {children}
              </div>
            </main>
            <FloatingChatbot />
          </div>
        </div>
      </div>
      <NotificationPoller />
    </div>
  );
}
