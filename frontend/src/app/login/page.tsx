'use client';

// ============================================================================
// PRAMUKH GROUP ERP — SIGN IN
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
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, Eye, EyeOff, Loader2, Lock, LogIn, Mail } from 'lucide-react';
import { useAppStore } from '@/store/use-app-store';
import { bootstrapInboxData, signIn } from '@/lib/inbox';
import { canAccessPath, getRoleLandingPath, normalizeDatabaseRole } from '@/lib/rbac';
import { isSupabaseConfigured } from '@/utils/supabase-client';

// ── Pramukh monogram ────────────────────────────────────────────────────────────
function PramukhLogo({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="30 1 36 29"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        className="fill-current"
        d="M52.13,17.62v2.6s7.81,1.18,9,9.31h4.34a4.39,4.39,0,0,1-1.9-2.21C63,25.74,60.25,18.65,52.13,17.62ZM34.47,3.9H44.72V14.23C37.23,14.15,34.62,13.2,34.47,3.9ZM30,1.38A5.14,5.14,0,0,1,32,5.24v.63c.71,9.31,4.65,10.57,12.7,10.65V27.16h-.08s-.4,2.21-1.58,2.37h4.18V1.38H30ZM43.53,17.62v2.6s-7.8,1.18-8.91,9.31H30.29a4.07,4.07,0,0,0,1.81-2.21C32.65,25.74,35.49,18.65,43.53,17.62ZM51,14.23V3.9H61.28C61,13.2,58.44,14.15,51,14.23ZM63.8,1.38H48.5V29.53h4.1C51.5,29.37,51,27.16,51,27.16h0V16.52c8-.08,12-1.34,12.61-10.65a1.71,1.71,0,0,0,.08-.63,4.93,4.93,0,0,1,2-3.86Z"
      />
    </svg>
  );
}

// ── Sky backdrop ────────────────────────────────────────────────────────────────
// Dense, realistic cloudscape recolored to the ERP brand palette (warm gold
// #b68d40 fading to the app's neutral cream/slate background) instead of blue.
// Multiple SVG blur layers create volumetric depth: thin wisps up high,
// mid-altitude puffs, a thick cumulus bank filling the lower third, and a
// solid white floor at the very bottom.
function SkyBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* Daytime gradient — warm gold-to-cream transition matching the brand accent */}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#ead9b0_0%,#f0e2bf_14%,#f4e9cc_28%,#f7eed9_42%,#f9f2e2_54%,#fbf5e9_66%,#fdf8f0_78%,#fefaf6_88%,#ffffff_100%)] dark:hidden" />

      {/* Night backdrop for dark mode — matches the app's dark navy background */}
      <div className="absolute inset-0 hidden dark:block dark:bg-[linear-gradient(180deg,#060a16_0%,#0a1124_30%,#101a35_62%,#0a1020_86%,#080d1b_100%)]" />
      <div className="absolute inset-0 hidden dark:block dark:bg-[radial-gradient(120%_80%_at_50%_112%,rgba(182,141,64,0.28)_0%,transparent_62%)]" />

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
      <div className="absolute -bottom-[20%] left-1/2 hidden h-[52%] w-[120%] -translate-x-1/2 rounded-[50%] bg-amber-400/10 blur-[90px] dark:block" />
      <div className="absolute -bottom-[26%] right-[-12%] hidden h-[54%] w-[70%] rounded-full bg-amber-500/8 blur-[100px] dark:block" />
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
      <span className="flex h-9 w-9 items-center justify-center text-[#b68d40] dark:text-[#d1a349]">
        <PramukhLogo className="h-6 w-6" />
      </span>
      <span className="font-heading text-lg font-black tracking-[0.2em] uppercase bg-gradient-to-r from-[#a6802f] via-[#d1a349] to-[#8a641c] bg-clip-text text-transparent drop-shadow-xs">
        PRAGATI
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
        throw new Error(
          'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY before signing in.',
        );
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
        {/* Soft interior tint: warm gold at the top-left, cream at the bottom-right */}
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_0%_0%,rgba(182,141,64,0.16)_0%,transparent_55%),radial-gradient(110%_90%_at_100%_100%,rgba(182,141,64,0.1)_0%,transparent_55%)] dark:bg-[radial-gradient(120%_90%_at_0%_0%,rgba(182,141,64,0.14)_0%,transparent_55%),radial-gradient(110%_90%_at_100%_100%,rgba(182,141,64,0.1)_0%,transparent_55%)]"
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
              Access your Pramukh Group workspace — projects, procurement, budget and
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
                href="mailto:admin@pramukh.com?subject=Pragati%20ERP%20password%20reset"
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
              href="mailto:admin@pramukh.com?subject=Pragati%20ERP%20access%20request"
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
