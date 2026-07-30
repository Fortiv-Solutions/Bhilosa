'use client';

import { useState, useEffect } from 'react';

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
      className="fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-[#faf9f6] text-slate-900 select-none pointer-events-none transition-opacity duration-300"
      style={{ opacity: isVisible ? 1 : 0 }}
    >
      <div className="relative flex flex-col items-center max-w-sm px-6">
        <div className="w-20 h-16 text-[#b68d40] flex items-center justify-center z-10">
          <svg className="w-full h-full" viewBox="30 1 36 29" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path className="fill-[#b68d40]" d="M52.13,17.62v2.6s7.81,1.18,9,9.31h4.34a4.39,4.39,0,0,1-1.9-2.21C63,25.74,60.25,18.65,52.13,17.62ZM34.47,3.9H44.72V14.23C37.23,14.15,34.62,13.2,34.47,3.9ZM30,1.38A5.14,5.14,0,0,1,32,5.24v.63c.71,9.31,4.65,10.57,12.7,10.65V27.16h-.08s-.4,2.21-1.58,2.37h4.18V1.38H30ZM43.53,17.62v2.6s-7.8,1.18-8.91,9.31H30.29a4.07,4.07,0,0,0,1.81-2.21C32.65,25.74,35.49,18.65,43.53,17.62ZM51,14.23V3.9H61.28C61,13.2,58.44,14.15,51,14.23ZM63.8,1.38H48.5V29.53h4.1C51.5,29.37,51,27.16,51,27.16h0V16.52c8-.08,12-1.34,12.61-10.65a1.71,1.71,0,0,0,.08-.63,4.93,4.93,0,0,1,2-3.86Z"/>
          </svg>
        </div>
        <h1 className="mt-4 text-2xl font-bold tracking-normal text-[#b68d40] leading-none z-10">PRAMUKH</h1>
        <p className="text-[10px] font-bold text-slate-500 tracking-normal uppercase mt-2 text-center whitespace-nowrap z-10 font-sans">A Class Of Its Own</p>
      </div>
    </div>
  );
}
