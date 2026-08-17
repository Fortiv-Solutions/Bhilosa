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
      className="fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-white text-slate-900 select-none pointer-events-none transition-opacity duration-300"
      style={{ opacity: isVisible ? 1 : 0 }}
    >
      <div className="relative flex flex-col items-center max-w-sm px-6">
        <div className="w-48 h-20 flex items-center justify-center z-10">
          <Image src="/bhilosa-logo.svg" alt="Bhilosa Industries" width={240} height={70} className="w-full h-auto" priority />
        </div>
        <p className="text-[11px] font-bold text-[#2e3192] tracking-wider uppercase mt-4 text-center whitespace-nowrap z-10 font-sans">
          Manufacturer of 100% polyester yarns
        </p>
      </div>
    </div>
  );
}

