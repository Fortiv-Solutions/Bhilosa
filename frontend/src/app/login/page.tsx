'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Lock, Mail, ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAppStore } from '@/store/use-app-store';
import { bootstrapInboxData, signIn } from '@/lib/inbox';
import { normalizeDatabaseRole } from '@/lib/rbac';
import { isSupabaseConfigured } from '@/utils/supabase-client';

// ── Pramukh Monogram SVG ──────────────────────────────────────────────────────
function PramukhLogo({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="30 1 36 29" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path className="fill-current" d="M52.13,17.62v2.6s7.81,1.18,9,9.31h4.34a4.39,4.39,0,0,1-1.9-2.21C63,25.74,60.25,18.65,52.13,17.62ZM34.47,3.9H44.72V14.23C37.23,14.15,34.62,13.2,34.47,3.9ZM30,1.38A5.14,5.14,0,0,1,32,5.24v.63c.71,9.31,4.65,10.57,12.7,10.65V27.16h-.08s-.4,2.21-1.58,2.37h4.18V1.38H30ZM43.53,17.62v2.6s-7.8,1.18-8.91,9.31H30.29a4.07,4.07,0,0,0,1.81-2.21C32.65,25.74,35.49,18.65,43.53,17.62ZM51,14.23V3.9H61.28C61,13.2,58.44,14.15,51,14.23ZM63.8,1.38H48.5V29.53h4.1C51.5,29.37,51,27.16,51,27.16h0V16.52c8-.08,12-1.34,12.61-10.65a1.71,1.71,0,0,0,.08-.63,4.93,4.93,0,0,1,2-3.86Z" />
    </svg>
  );
}

// ── Slideshow projects lists ──────────────────────────────────────────────────
const IMAGES = [
  '/images/projects/central-park-gallery/central-park-gallery-1.jpg',
  '/images/projects/central-park-gallery/central-park-gallery-5.jpg',
  '/images/projects/orbit-4-gallery/orbit-4-gallery-1.jpg',
  '/images/projects/central-park-gallery/central-park-gallery-11.jpg',
  '/images/projects/orbit-4-gallery/orbit-4-gallery-4.jpg',
  '/images/projects/central-park-gallery/central-park-gallery-9.jpg'
];

const SLIDE_INFO = [
  { 
    title: 'Find your sweet home', 
    desc1: 'Schedule visit in just a few clicks', 
    desc2: 'visits in just a few clicks' 
  },
  { 
    title: 'Pramukh Central Park', 
    desc1: 'Luxury residential units featuring 3, 3.5, 4 & 4.5 BHK infinite living.', 
    desc2: 'Designed around green open spaces.' 
  },
  { 
    title: 'Pramukh Orbit 4', 
    desc1: 'Premium commercial spaces, corporate offices & retail showrooms.', 
    desc2: 'Commercial project in Bhatar, Surat.' 
  },
  { 
    title: 'Pramukh Aranya 3', 
    desc1: 'Elegant living spaces with premium design architecture and modern layouts.', 
    desc2: 'Sophisticated residential apartments.' 
  },
  { 
    title: 'Pramukh Agastya', 
    desc1: 'A class of its own. Modern architecture tailored for premium comfort.', 
    desc2: 'Tailored for luxury living in Surat.' 
  },
  { 
    title: 'Pramukh Revanta', 
    desc1: 'Stunning residential design situated in Surat\'s fast-developing corporate hub.', 
    desc2: 'Premium housing projects.' 
  }
];

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAppStore();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [bgIndex, setBgIndex] = useState(0);
  const [timerResetToken, setTimerResetToken] = useState(0);

  // Slideshow rotation on the left panel (every 5 seconds)
  useEffect(() => {
    const timer = setInterval(() => {
      setBgIndex((prev) => (prev + 1) % IMAGES.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [timerResetToken]);

  const handleDotClick = (idx: number) => {
    setBgIndex(idx);
    setTimerResetToken((prev) => prev + 1);
  };

  const handlePrevSlide = () => {
    setBgIndex((prev) => (prev - 1 + IMAGES.length) % IMAGES.length);
    setTimerResetToken((prev) => prev + 1);
  };

  const handleNextSlide = () => {
    setBgIndex((prev) => (prev + 1) % IMAGES.length);
    setTimerResetToken((prev) => prev + 1);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (!isSupabaseConfigured) {
        throw new Error('Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY before signing in.');
      }

      const profile = await signIn(email, password);
      if (!profile) throw new Error('Profile not found.');
      await bootstrapInboxData();
      
      login(profile.email, normalizeDatabaseRole(profile.role));
      router.push('/dashboard');
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Sign in failed.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-row bg-background transition-colors duration-300 relative">
      
      {/* ── LEFT PANE: BRAND IMAGE & CAPTION (Full screen absolute background on mobile, 60% relative split on desktop) ── */}
      <div className="absolute inset-0 md:relative md:block md:w-3/5 h-full overflow-hidden select-none border-r border-slate-100/5 dark:border-slate-800/10 z-0 group/slider">
        {IMAGES.map((img, idx) => {
          const isActive = idx === bgIndex;
          return (
            <div
              key={img}
              className={`absolute inset-0 transition-all duration-[5000ms] ease-out ${
                isActive ? 'opacity-100 scale-105' : 'opacity-0 scale-100'
              }`}
              style={{
                backgroundImage: `url(${img})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            />
          );
        })}
        {/* Deep luxurious dark overlay for text readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/35 to-transparent z-10" />

        {/* Floating Glassmorphic Caption Card - Hidden on mobile to avoid covering the centered login form card */}
        <div className="absolute bottom-12 left-12 right-12 text-white z-20 max-w-md bg-black/30 backdrop-blur-md border border-white/10 p-6 rounded-2xl shadow-xl transition-all duration-500 hidden md:block">
          <h3 className="text-2xl font-black font-heading mb-1.5 tracking-tight transition-all duration-500">
            {SLIDE_INFO[bgIndex]?.title}
          </h3>
          <p className="text-white/70 text-xs leading-relaxed font-semibold transition-all duration-500">
            {SLIDE_INFO[bgIndex]?.desc1}
          </p>
          {SLIDE_INFO[bgIndex]?.desc2 && (
            <p className="text-white/70 text-xs leading-relaxed font-semibold transition-all duration-500 mt-1">
              {SLIDE_INFO[bgIndex]?.desc2}
            </p>
          )}
          {/* Slider Pagination Pills */}
          <div className="flex items-center gap-1.5 mt-4">
            {IMAGES.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleDotClick(idx)}
                className={`transition-all duration-500 rounded-full cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#b68d40] ${
                  idx === bgIndex ? 'w-8 h-1 bg-[#b68d40] shadow-xs' : 'w-1.5 h-1.5 bg-white/40 hover:bg-white/70'
                }`}
                aria-label={`Go to slide ${idx + 1}`}
              />
            ))}
          </div>
        </div>

        {/* Floating Prev/Next Navigation Arrows (visible on hover) - Hidden on mobile */}
        <button
          type="button"
          onClick={handlePrevSlide}
          className="absolute left-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-black/25 hover:bg-black/50 border border-white/10 text-white flex items-center justify-center cursor-pointer transition-all duration-300 opacity-0 group-hover/slider:opacity-100 focus:opacity-100 hidden md:flex hover:scale-105 active:scale-95"
          aria-label="Previous slide"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={handleNextSlide}
          className="absolute right-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-black/25 hover:bg-black/50 border border-white/10 text-white flex items-center justify-center cursor-pointer transition-all duration-300 opacity-0 group-hover/slider:opacity-100 focus:opacity-100 hidden md:flex hover:scale-105 active:scale-95"
          aria-label="Next slide"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* ── RIGHT PANE: ULTRA-PREMIUM FORM & ACTIONS (Centered translucent card overlay on mobile, clean right sidebar on desktop) ── */}
      <div className="w-full md:w-2/5 h-full flex flex-col justify-between p-6 sm:p-10 md:p-12 bg-white/80 dark:bg-[#0b0f19]/80 backdrop-blur-lg md:backdrop-blur-none md:bg-slate-50 md:dark:bg-[#0b0f19] text-slate-800 dark:text-slate-100 transition-colors duration-300 relative z-10 border-t md:border-t-0 md:border-l border-white/10 md:border-slate-100/5 dark:md:border-slate-800/10 overflow-y-auto">

        
        {/* Soft glowing ambient spotlight behind right pane to feel high-end */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full bg-primary/4 dark:bg-primary/3 blur-[90px] pointer-events-none" />

        {/* Top-Right space */}
        <div className="h-6" />

        {/* Form Content Container */}
        <div className="my-auto max-w-[400px] w-full mx-auto z-10 bg-white dark:bg-[#0f1423] p-8 sm:p-10 rounded-3xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] dark:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.4)] border border-slate-100 dark:border-slate-800/80">
          
          {/* Centered Monogram Brand Logo */}
          <div className="flex flex-col items-center mb-8 select-none">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 text-[#b68d40] flex-shrink-0 drop-shadow-[0_2px_12px_rgba(182,141,64,0.25)] filter">
                <PramukhLogo className="w-full h-full" />
              </div>
              <span className="text-xl font-black tracking-tight flex items-center gap-1.5 text-slate-900 dark:text-white font-heading">
                Pramukh <span className="text-slate-200 dark:text-slate-800">|</span> <span className="text-[#b68d40] font-bold">Pragati</span>
              </span>
            </div>
            <div className="w-12 h-[2px] bg-gradient-to-r from-transparent via-[#b68d40]/40 to-transparent mt-3.5 rounded-full" />
          </div>

          {/* Heading Panel */}
          <div className="mb-7 text-center">
            <h2 className="text-2xl font-black text-slate-900 dark:text-white leading-tight mb-1.5 font-heading tracking-tight">
              Welcome Back to Pragati!
            </h2>
            <p className="text-[9px] font-extrabold tracking-widest uppercase text-slate-400/80 dark:text-slate-500/90">
              Sign in in your account
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[9px] font-extrabold text-slate-500 dark:text-slate-455 uppercase tracking-widest mb-0.5">Your Email</label>
              <div className="relative group focus-within:scale-[1.01] transition-transform duration-300">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500 group-focus-within:text-[#b68d40] transition-colors" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="info.madhu786@gmail.com"
                  required
                  className="w-full bg-slate-50/50 dark:bg-slate-950/40 border border-slate-200/85 dark:border-slate-850 rounded-xl pl-10 pr-4 py-3 text-slate-800 dark:text-white text-xs font-semibold placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-[#b68d40] focus:ring-1 focus:ring-[#b68d40] focus:bg-white dark:focus:bg-slate-950 transition-all shadow-xs"
                />
              </div>
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[9px] font-extrabold text-slate-500 dark:text-slate-455 uppercase tracking-widest mb-0.5">Password</label>
              <div className="relative group focus-within:scale-[1.01] transition-transform duration-300">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500 group-focus-within:text-[#b68d40] transition-colors" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full bg-slate-50/50 dark:bg-slate-950/40 border border-slate-200/85 dark:border-slate-850 rounded-xl pl-10 pr-11 py-3 text-slate-800 dark:text-xs font-semibold placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-[#b68d40] focus:ring-1 focus:ring-[#b68d40] focus:bg-white dark:focus:bg-slate-950 transition-all shadow-xs"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-655 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Remember Me & Forgot Password */}
            <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 mt-1 select-none">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-slate-300 dark:border-slate-700 text-[#b68d40] focus:ring-[#b68d40] accent-[#b68d40]"
                />
                <span>Remember Me</span>
              </label>
              <span className="hover:underline hover:text-[#b68d40] transition-colors cursor-pointer">
                Forgot Password?
              </span>
            </div>

            {/* Error Alert */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-3.5 py-2.5 text-red-500 text-[10px] font-bold">
                {error}
              </div>
            )}

            {/* Login Button - Premium Styled in Gold Theme with Glow Shadow */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-[#b68d40] to-[#cfa352] hover:from-[#c59c47] hover:to-[#dfb564] text-white font-extrabold text-[10px] uppercase tracking-widest rounded-xl py-4 shadow-md shadow-[#b68d40]/15 hover:shadow-lg hover:shadow-[#b68d40]/30 transition-all active:scale-[0.98] cursor-pointer mt-3 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>Login</span>
                  <ArrowRight className="w-3.5 h-3.5 transition-transform duration-300 group-hover:translate-x-1" />
                </>
              )}
            </button>

            {/* Mock Login / Bypass Button */}
            <button
              type="button"
              onClick={() => {
                login(email || 'demo@pramukh.com', 'PROJECT_MANAGER');
                router.push('/dashboard');
              }}
              className="w-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-white font-extrabold text-[10px] uppercase tracking-widest rounded-xl py-3.5 transition-all active:scale-[0.98] cursor-pointer mt-1.5 flex items-center justify-center gap-2"
            >
              <span>Demo Login (Mock Data)</span>
            </button>
          </form>
        </div>

        {/* Footer Text */}
        <div className="text-center text-[10px] font-bold text-slate-400 select-none z-10 flex items-center justify-center gap-1">
          <span>Don&apos;t have any account?</span>
          <span className="text-[#b68d40] hover:underline cursor-pointer font-bold transition-colors">Register</span>
        </div>
      </div>
    </div>
  );
}
