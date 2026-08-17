'use client';

// ============================================================================
// JYOTI ERP — SIGN IN
// File: frontend/src/app/login/page.tsx
//
// This is the application's landing page for unauthenticated visitors.
//
// Authentication logic is unchanged: isSupabaseConfigured guard ->
// signIn(email, password) -> bootstrapInboxData() -> store login(). Only the
// presentation changed, plus a role-aware redirect (getRoleLandingPath) and support
// for ?next= so a deep link survives the sign-in round trip.
//
// Credentials are email + password only — no social providers.
// ============================================================================

import { Suspense, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, Eye, EyeOff, Loader2, Lock, LogIn, Mail } from 'lucide-react';
import { useAppStore } from '@/store/use-app-store';
import { bootstrapInboxData, signIn } from '@/lib/inbox';
import { canAccessPath, getRoleLandingPath, normalizeDatabaseRole } from '@/lib/rbac';
import { isSupabaseConfigured } from '@/utils/supabase-client';

// ── Sky backdrop ────────────────────────────────────────────────────────────────
// Dense, realistic cloudscape recolored to the ERP brand palette (Jyoti pink
// #e83e8c fading to the app's neutral cream/slate background) instead of blue.
// Multiple SVG blur layers create volumetric depth: thin wisps up high,
// mid-altitude puffs, a thick cumulus bank filling the lower third, and a
// solid white floor at the very bottom.
function SkyBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* Daytime gradient — warm pink-to-cream transition matching the brand accent */}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#f6cfe2_0%,#f8d8e6_14%,#fae0eb_28%,#fbe6ee_42%,#fceaf1_54%,#fdeef4_66%,#fef3f7_78%,#fef7fa_88%,#ffffff_100%)] dark:hidden" />

      {/* Night backdrop for dark mode — matches the app's dark navy background */}
      <div className="absolute inset-0 hidden dark:block dark:bg-[linear-gradient(180deg,#060a16_0%,#0a1124_30%,#101a35_62%,#0a1020_86%,#080d1b_100%)]" />
      <div className="absolute inset-0 hidden dark:block dark:bg-[radial-gradient(120%_80%_at_50%_112%,rgba(232,62,140,0.28)_0%,transparent_62%)]" />

      {/* Faint crossing arcs behind the card */}
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
      >
        <g className="stroke-white/45 dark:stroke-white/8" strokeWidth="1.2">
          <ellipse cx="720" cy="700" rx="520" ry="470" />
          <ellipse cx="720" cy="720" rx="690" ry="560" />
          <ellipse cx="720" cy="660" rx="360" ry="360" />
        </g>
      </svg>

      {/* ── Cloudscape ──────────────────────────────────────────────────────── */}
      <svg
        className="absolute inset-0 h-full w-full dark:hidden"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMax slice"
        fill="none"
      >
        <defs>
          {/* Gentle blur for high-altitude wisps */}
          <filter id="cl-wisp" x="-30%" y="-60%" width="160%" height="220%">
            <feGaussianBlur stdDeviation="32" />
          </filter>
          {/* Medium blur for mid-level puffs */}
          <filter id="cl-mid" x="-25%" y="-50%" width="150%" height="200%">
            <feGaussianBlur stdDeviation="22" />
          </filter>
          {/* Tighter blur for the main cumulus tops — keeps puffy definition */}
          <filter id="cl-main" x="-20%" y="-40%" width="140%" height="180%">
            <feGaussianBlur stdDeviation="16" />
          </filter>
          {/* Soft blur for the dense base layer */}
          <filter id="cl-base" x="-20%" y="-30%" width="140%" height="160%">
            <feGaussianBlur stdDeviation="12" />
          </filter>
        </defs>

        {/* ─ Layer 1: High thin wisps (very transparent) ─ */}
        <g fill="#ffffff" opacity="0.25" filter="url(#cl-wisp)">
          <ellipse cx="180" cy="280" rx="260" ry="38" />
          <ellipse cx="420" cy="260" rx="180" ry="30" />
          <ellipse cx="780" cy="240" rx="220" ry="32" />
          <ellipse cx="1100" cy="220" rx="240" ry="36" />
          <ellipse cx="1320" cy="270" rx="160" ry="28" />
        </g>

        {/* ─ Layer 2: Mid-altitude scattered puffs ─ */}
        <g fill="#ffffff" opacity="0.40" filter="url(#cl-mid)">
          <ellipse cx="120" cy="460" rx="180" ry="60" />
          <ellipse cx="340" cy="420" rx="140" ry="52" />
          <ellipse cx="620" cy="440" rx="160" ry="56" />
          <ellipse cx="900" cy="400" rx="190" ry="62" />
          <ellipse cx="1140" cy="430" rx="150" ry="50" />
          <ellipse cx="1360" cy="450" rx="170" ry="54" />
        </g>

        {/* ─ Layer 3: Upper cumulus tops — the distinct puffy silhouettes ─ */}
        <g fill="#ffffff" opacity="0.70" filter="url(#cl-main)">
          <ellipse cx="80"   cy="600" rx="160" ry="74" />
          <ellipse cx="220"  cy="580" rx="130" ry="66" />
          <ellipse cx="380"  cy="610" rx="150" ry="70" />
          <ellipse cx="560"  cy="580" rx="140" ry="72" />
          <ellipse cx="720"  cy="595" rx="160" ry="68" />
          <ellipse cx="900"  cy="575" rx="150" ry="74" />
          <ellipse cx="1060" cy="600" rx="140" ry="66" />
          <ellipse cx="1220" cy="585" rx="160" ry="72" />
          <ellipse cx="1380" cy="605" rx="150" ry="68" />
        </g>

        {/* ─ Layer 4: Dense cumulus bank — thick, overlapping, high opacity ─ */}
        <g fill="#ffffff" opacity="0.88" filter="url(#cl-main)">
          <ellipse cx="60"   cy="690" rx="200" ry="92" />
          <ellipse cx="240"  cy="670" rx="170" ry="86" />
          <ellipse cx="400"  cy="700" rx="190" ry="90" />
          <ellipse cx="580"  cy="675" rx="180" ry="88" />
          <ellipse cx="750"  cy="695" rx="200" ry="94" />
          <ellipse cx="920"  cy="665" rx="175" ry="86" />
          <ellipse cx="1090" cy="690" rx="195" ry="92" />
          <ellipse cx="1260" cy="672" rx="185" ry="88" />
          <ellipse cx="1420" cy="700" rx="190" ry="90" />
          {/* Extra filler puffs between gaps */}
          <ellipse cx="160"  cy="710" rx="140" ry="78" />
          <ellipse cx="490"  cy="680" rx="130" ry="74" />
          <ellipse cx="840"  cy="705" rx="145" ry="80" />
          <ellipse cx="1170" cy="685" rx="135" ry="76" />
        </g>

        {/* ─ Layer 5: Solid cloud floor — completely opaque white from ~750 down ─ */}
        <g fill="#ffffff" opacity="0.97" filter="url(#cl-base)">
          <rect x="-100" y="770" width="1640" height="260" />
          <ellipse cx="100"  cy="770" rx="280" ry="110" />
          <ellipse cx="340"  cy="750" rx="240" ry="100" />
          <ellipse cx="560"  cy="775" rx="260" ry="108" />
          <ellipse cx="800"  cy="755" rx="280" ry="112" />
          <ellipse cx="1020" cy="770" rx="250" ry="104" />
          <ellipse cx="1240" cy="748" rx="270" ry="110" />
          <ellipse cx="1440" cy="765" rx="240" ry="106" />
          {/* Dense filler across the entire bottom */}
          <ellipse cx="200"  cy="800" rx="320" ry="120" />
          <ellipse cx="680"  cy="790" rx="300" ry="116" />
          <ellipse cx="1120" cy="805" rx="310" ry="118" />
          <ellipse cx="1400" cy="795" rx="280" ry="114" />
        </g>
      </svg>

      {/* Dark mode: a low horizon glow instead of clouds. */}
      <div className="absolute -bottom-[20%] left-1/2 hidden h-[52%] w-[120%] -translate-x-1/2 rounded-[50%] bg-pink-500/10 blur-[90px] dark:block" />
      <div className="absolute -bottom-[26%] right-[-12%] hidden h-[54%] w-[70%] rounded-full bg-pink-600/8 blur-[100px] dark:block" />
    </div>
  );
}

export default function LoginPage() {
  return (
    // useSearchParams needs a Suspense boundary for static prerendering.
    <Suspense fallback={<LoginShell />}>
      <LoginView />
    </Suspense>
  );
}

/** Backdrop + brand only — used as the Suspense fallback so there is no flash. */
function LoginShell() {
  return (
    <main className="relative flex min-h-screen w-full items-center justify-center overflow-hidden px-4 py-10">
      <SkyBackdrop />
      <BrandMark />
    </main>
  );
}

function BrandMark() {
  return (
    <div className="absolute left-5 top-5 z-20 flex select-none items-center gap-3 sm:left-8 sm:top-7">
      <Image src="/jyoti-logo.png" alt="Jyoti" width={72} height={34} className="h-9 w-auto" priority />
      <span className="font-heading text-lg font-black tracking-[0.2em] uppercase bg-gradient-to-r from-[#c3006a] via-[#e83e8c] to-[#a3105c] bg-clip-text text-transparent drop-shadow-xs">
        JYOTI
      </span>
    </div>
  );
}

function LoginView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const login = useAppStore((state) => state.login);
  const isLoggedIn = useAppStore((state) => state.isLoggedIn);
  const activeRole = useAppStore((state) => state.activeRole);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Deep link the user was trying to reach before being bounced to /login.
  const nextPath = useMemo(() => {
    const raw = searchParams.get('next');
    // Only ever accept an internal, single-slash path — never an absolute URL or
    // a protocol-relative one, which would make this an open redirect.
    if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/login')) {
      return null;
    }
    return raw;
  }, [searchParams]);

  // Single owner of "where do we go once authenticated" — covers both landing here
  // with an existing session and having just signed in. Keeping it in one place means
  // the ?next= destination cannot be lost to a race with a second redirect.
  useEffect(() => {
    if (!isLoggedIn) return;
    const destination =
      nextPath && canAccessPath(activeRole, nextPath) ? nextPath : getRoleLandingPath(activeRole);
    router.replace(destination);
  }, [isLoggedIn, nextPath, activeRole, router]);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isLoading) return;

    setError('');

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError('Enter your email address and password to continue.');
      return;
    }

    setIsLoading(true);
    try {
      if (!isSupabaseConfigured) {
        // No database configured yet — sign straight in locally so the app
        // remains usable on mock data until Supabase is wired up.
        login(trimmedEmail, 'UPPER_MANAGEMENT');
        return;
      }

      const profile = await signIn(trimmedEmail, password);
      if (!profile) throw new Error('No user profile is linked to this account. Contact your administrator.');

      await bootstrapInboxData();

      // Setting the session flips isLoggedIn, and the effect above performs the
      // role-aware navigation.
      login(profile.email, normalizeDatabaseRole(profile.role));
    } catch (loginError) {
      setError(
        loginError instanceof Error
          ? loginError.message
          : 'Sign in failed. Check your credentials and try again.',
      );
      setIsLoading(false);
    }
    // On success the redirect unmounts this view, so isLoading intentionally stays
    // true to keep the button disabled through the transition.
  };

  return (
    <main className="relative flex min-h-screen w-full items-center justify-center overflow-hidden px-4 py-16 sm:px-6 sm:py-10">
      <SkyBackdrop />
      <BrandMark />

      {/* ── Sign-in card ─────────────────────────────────────────────────────── */}
      <section
        className="relative z-10 w-full max-w-[380px] overflow-hidden rounded-[28px] border border-white/70 bg-white/45 p-7 shadow-[0_24px_70px_-20px_rgba(31,58,95,0.28)] backdrop-blur-2xl sm:p-8 dark:border-white/10 dark:bg-slate-900/45 dark:shadow-[0_24px_70px_-20px_rgba(0,0,0,0.7)]"
        aria-labelledby="login-heading"
      >
        {/* Soft interior tint: Jyoti pink at the top-left, cream at the bottom-right */}
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_0%_0%,rgba(232,62,140,0.16)_0%,transparent_55%),radial-gradient(110%_90%_at_100%_100%,rgba(232,62,140,0.1)_0%,transparent_55%)] dark:bg-[radial-gradient(120%_90%_at_0%_0%,rgba(232,62,140,0.14)_0%,transparent_55%),radial-gradient(110%_90%_at_100%_100%,rgba(232,62,140,0.1)_0%,transparent_55%)]"
          aria-hidden="true"
        />

        <div className="relative">
          {/* Icon tile */}
          <div className="flex justify-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-[15px] border border-white/80 bg-white text-slate-800 shadow-[0_6px_18px_-6px_rgba(31,58,95,0.35)] dark:border-white/10 dark:bg-slate-800 dark:text-slate-100">
              <LogIn className="h-5 w-5" aria-hidden="true" />
            </span>
          </div>

          {/* Heading */}
          <div className="mt-5 text-center">
            <h1
              id="login-heading"
              className="font-heading text-[22px] font-bold leading-tight tracking-tight text-slate-900 dark:text-white"
            >
              Sign in with email
            </h1>
            <p className="mx-auto mt-2 max-w-[300px] text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
              Access your Jyoti workspace — projects, procurement, budget and
              billing, together in one place.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="mt-6 flex flex-col gap-3" noValidate>
            {/* Email */}
            <div>
              <label htmlFor="login-email" className="sr-only">
                Email address
              </label>
              <div className="relative">
                <Mail
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500"
                  aria-hidden="true"
                />
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  disabled={isLoading}
                  aria-invalid={Boolean(error)}
                  className="h-12 w-full rounded-xl border border-transparent bg-slate-100/80 pl-10 pr-4 text-sm font-medium text-slate-900 shadow-inner shadow-white/40 outline-none transition-colors placeholder:text-slate-400 focus:border-slate-300 focus:bg-white/95 focus:ring-2 focus:ring-slate-900/10 disabled:opacity-60 dark:bg-slate-800/70 dark:text-white dark:shadow-none dark:placeholder:text-slate-500 dark:focus:border-slate-600 dark:focus:bg-slate-800 dark:focus:ring-white/10"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label htmlFor="login-password" className="sr-only">
                Password
              </label>
              <div className="relative">
                <Lock
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500"
                  aria-hidden="true"
                />
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  disabled={isLoading}
                  aria-invalid={Boolean(error)}
                  className="h-12 w-full rounded-xl border border-transparent bg-slate-100/80 pl-10 pr-11 text-sm font-medium text-slate-900 shadow-inner shadow-white/40 outline-none transition-colors placeholder:text-slate-400 focus:border-slate-300 focus:bg-white/95 focus:ring-2 focus:ring-slate-900/10 disabled:opacity-60 dark:bg-slate-800/70 dark:text-white dark:shadow-none dark:placeholder:text-slate-500 dark:focus:border-slate-600 dark:focus:bg-slate-800 dark:focus:ring-white/10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition-colors hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/20 dark:text-slate-500 dark:hover:text-slate-200"
                >
                  {showPassword ? (
                    <Eye className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <EyeOff className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            {/* Forgot password */}
            <div className="flex justify-end">
              <a
                href="mailto:admin@pramukh.com?subject=Jyoti%20ERP%20password%20reset"
                className="rounded text-xs font-medium text-slate-600 underline-offset-2 transition-colors hover:text-slate-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/20 dark:text-slate-400 dark:hover:text-white"
              >
                Forgot password?
              </a>
            </div>

            {/* Error */}
            {error && (
              <p
                role="alert"
                aria-live="polite"
                className="flex items-start gap-2 rounded-xl border border-red-200/80 bg-red-50/90 px-3 py-2.5 text-xs font-medium text-red-700 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-300"
              >
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </p>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="mt-1 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[linear-gradient(180deg,#3a3f47_0%,#22262c_55%,#171a1f_100%)] text-sm font-semibold text-white shadow-[0_10px_24px_-10px_rgba(23,26,31,0.85)] transition-all hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30 focus-visible:ring-offset-2 focus-visible:ring-offset-white/60 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70 dark:bg-[linear-gradient(180deg,#f8fafc_0%,#e2e8f0_100%)] dark:text-slate-900 dark:shadow-[0_10px_24px_-10px_rgba(0,0,0,0.9)] dark:focus-visible:ring-white/30 dark:focus-visible:ring-offset-slate-900"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Signing in…
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          {/* Footer note */}
          {/* "Request an account" always sits on its own line so it never wraps
              mid-phrase on narrow viewports. */}
          <p className="mt-5 text-center text-[11px] leading-relaxed text-slate-500 dark:text-slate-500">
            Access is provisioned by your administrator.
            <br />
            <a
              href="mailto:admin@pramukh.com?subject=Jyoti%20ERP%20access%20request"
              className="font-semibold text-slate-700 underline-offset-2 hover:underline dark:text-slate-300"
            >
              Request an account
            </a>
          </p>
        </div>
      </section>
    </main>
  );
}
