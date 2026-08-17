'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';

export default function SplashScreen() {
  const [mounted, setMounted] = useState(false);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    setMounted(true);
    const timer = setTimeout(() => {
      setIsVisible(false);
    }, 800);
    return () => clearTimeout(timer);
  }, []);

  if (!mounted || !isVisible) return null;

  return (
    <div
      className="fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-[#fff5fa] text-slate-900 select-none pointer-events-none transition-opacity duration-300"
      style={{ opacity: isVisible ? 1 : 0 }}
    >
      <div className="relative flex flex-col items-center max-w-sm px-6">
        <div className="w-28 h-16 flex items-center justify-center z-10">
          <Image src="/jyoti-logo.png" alt="Jyoti" width={168} height={80} className="w-full h-auto" priority />
        </div>
        <p className="text-[10px] font-bold text-slate-500 tracking-normal uppercase mt-3 text-center whitespace-nowrap z-10 font-sans">A Class Of Its Own</p>
      </div>
    </div>
  );
}
