'use client';

import { useAppStore } from '@/store/use-app-store';
import { motion } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';
import { ImageSlider } from '@/components/ui/image-slider';
import { 
  Building2, 
  MapPin, 
  ArrowRight,
  Gauge,
  Wallet,
  AlertTriangle,
  Activity,
  CloudSun
} from 'lucide-react';
import { formatIndianCurrency } from '@/utils/format-currency';

export default function ProjectsPage() {
  const { projects } = useAppStore();

  const getDelayStatusLabel = (status: string, progress: number) => {
    if (status === 'Delayed') {
      return { label: 'Delayed', color: 'text-red-500 bg-red-500/10 border-red-500/20' };
    }
    if (progress < 35 && status === 'Active') {
      return { label: 'At Risk', color: 'text-amber-500 bg-amber-500/10 border-amber-500/20' };
    }
    return { label: 'On Track', color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' };
  };

  const getAIInsight = (id: string) => {
    switch (id) {
      case 'central-park':
        return 'Tower B MEP clearances lagging by 14 days due to sleeve recheck.';
      case 'orbit-4':
        return 'East facade anchor plates survey variance requires structural alignment.';
      default:
        return 'Procurement forecast predicts cement supply delivery risk within 7 days.';
    }
  };

  const getWeatherForProject = (id: string) => {
    switch(id) {
      case 'central-park':
        return { temp: '32°C', desc: 'Partly Cloudy, 12 km/h Wind' };
      case 'orbit-4':
        return { temp: '31°C', desc: 'Sunny, 10 km/h Wind' };
      case 'satva-office':
        return { temp: '34°C', desc: 'Clear, 15 km/h Wind' };
      case 'aranya-3':
        return { temp: '30°C', desc: 'Cloudy, 8 km/h Wind' };
      default:
        return { temp: '32°C', desc: 'Partly Cloudy, 12 km/h Wind' };
    }
  };

  return (
    <div className="space-y-6 pb-10">
      {/* Header section */}
      <div>
        <span className="text-[11px] font-bold text-primary uppercase tracking-wider bg-primary/10 px-3 py-1 rounded-full border border-primary/20">
          Portfolio Management
        </span>
        <h1 className="text-2xl sm:text-3xl font-heading font-black text-foreground mt-3 tracking-tight">
          Active Project Sites
        </h1>
        <p className="max-w-5xl text-xs sm:text-sm text-muted-foreground mt-1.5 font-medium">
          Select a project site to manage site activity diary, inventory stock, workforce attendance, BOQ, procurement approvals, documents, and Pramukh Project Intelligence modules.
        </p>
      </div>

      {/* Projects Grid */}
      <motion.div 
        layout
        className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6"
      >
        {projects.map((proj) => {
          const delayStatus = getDelayStatusLabel(proj.status, proj.progress);

          return (
            <Link 
              key={proj.id} 
              href={`/projects/${proj.id}`} 
              className="group block focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded-2xl"
            >
              <motion.div
                layout
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1 }}
                whileHover={{ y: -6 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="relative h-[360px] overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all duration-300 hover:shadow-premium hover:border-primary/45"
              >
                {/* Visual Header (Image Slider or Static Image covering full background) */}
                <div className="absolute inset-0 w-full h-full bg-muted">
                  <div className="absolute inset-0 flex items-center justify-center bg-muted dark:bg-gray-900 text-gray-400">
                    <Building2 className="h-10 w-10 opacity-50" />
                  </div>
                  {proj.galleryImages && proj.galleryImages.length > 0 ? (
                    <ImageSlider 
                      images={proj.galleryImages}
                      interval={3000}
                      className="absolute inset-0 h-full w-full transition-transform duration-700 ease-out group-hover:scale-105"
                    />
                  ) : proj.image ? (
                    <Image 
                      src={proj.image} 
                      alt="" 
                      aria-hidden="true"
                      fill
                      sizes="(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw"
                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                    />
                  ) : null}
                </div>

                {/* Gradient overlay - darker at bottom for text readability */}
                <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/10 to-black/75 transition-colors duration-500 group-hover:from-black/45 group-hover:to-black/80" />

                {/* Top Badges */}
                <div className="absolute left-3 right-3 top-3 flex items-start justify-between gap-3 z-10">
                  <span className="rounded-full bg-white/10 backdrop-blur-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white border border-white/20">
                    {proj.status === 'Active' || proj.status === 'Delayed' ? 'Under Construction' : proj.status}
                  </span>
                  <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider backdrop-blur-md ${delayStatus.color}`}>
                    {delayStatus.label}
                  </span>
                </div>

                {/* Bottom glassmorphic details panel */}
                <div className="absolute inset-x-3 bottom-3 rounded-xl border border-white/20 bg-white/10 p-3.5 text-white shadow-lg backdrop-blur-md transition-all duration-500 group-hover:bottom-4 group-hover:bg-white/20 space-y-2.5">
                  {/* Title row */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-heading font-black tracking-tight text-white leading-tight">
                        {proj.name}
                      </h3>
                      <p className="text-[10px] text-white/70 font-semibold mt-0.5 truncate">{proj.propertyType}</p>
                    </div>
                    <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-white text-gray-950 shadow-sm transition-transform duration-300 group-hover:scale-110">
                      <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </div>

                  {/* Location & Weather row */}
                  <div className="flex items-center justify-between text-[10px] text-white/75 font-medium">
                    <div className="flex items-center gap-1">
                      <MapPin className="h-3 w-3 text-white/75 flex-shrink-0" />
                      <span>{proj.location}</span>
                    </div>
                    <div className="flex items-center gap-1 bg-white/10 px-2 py-0.5 rounded-full border border-white/15 backdrop-blur-sm text-[9px]">
                      <CloudSun className="h-3.5 w-3.5 text-[#f4d08b] flex-shrink-0 animate-pulse" />
                      <span className="text-white font-semibold">
                        {getWeatherForProject(proj.id).temp} | {getWeatherForProject(proj.id).desc.split(',')[0]}
                      </span>
                    </div>
                  </div>

                  {/* Physical Progress bar */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] font-bold text-white tracking-wide">
                      <span className="flex items-center gap-1 text-white/80 uppercase"><Gauge className="w-3.5 h-3.5 text-[#f4d08b]" /> Site Progress</span>
                      <span className="text-white font-extrabold">{proj.progress}%</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-white/10 border border-white/10 overflow-hidden backdrop-blur-sm">
                      <div 
                        className="h-full rounded-full transition-all duration-1000 ease-out"
                        style={{ 
                          width: `${proj.progress}%`,
                          background: 'linear-gradient(90deg, #e83e8c 0%, #f4d08b 100%)',
                          boxShadow: '0 0 8px rgba(244, 208, 139, 0.6)'
                        }}
                      />
                    </div>
                  </div>
                </div>
              </motion.div>
            </Link>
          );
        })}

        {projects.length === 0 && (
          <div className="col-span-full py-16 text-center bg-card border border-border rounded-2xl shadow-sm">
            <Building2 className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-bold text-muted-foreground">No projects available.</p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
