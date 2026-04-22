import React from 'react';
import { Zap, ShieldCheck, UserCircle, ArrowRightLeft } from 'lucide-react';
import { motion } from 'motion/react';
import { UserLevel } from '../lib/karma';

interface SidebarProps {
  karma: number;
  levelName: UserLevel;
  role: 'student' | 'mentor';
  expertise?: string[];
  onDashboardToggle?: () => void;
  onToggleRole?: () => void;
  showDashboard?: boolean;
  unreadCount?: number;
}

export default function Sidebar({ 
  karma, 
  levelName, 
  role, 
  expertise,
  onDashboardToggle,
  onToggleRole,
  showDashboard,
  unreadCount = 0
}: SidebarProps) {
  return (
    <nav className="w-72 border-r border-glass-border hidden lg:flex flex-col p-8 bg-black/40 backdrop-blur-md">
      <div className="mb-12">
        <h2 className="stat-label block mb-6 text-white/40 tracking-[0.2em] font-bold">TECHTARAK HUB</h2>
        <ul className="space-y-6 text-sm font-light text-accent">
          <li 
            onClick={() => !showDashboard ? null : onDashboardToggle?.()}
            className={`flex items-center justify-between cursor-pointer transition-all group ${!showDashboard ? 'text-electric' : 'hover:text-white'}`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full transition-all duration-500 ${!showDashboard ? 'bg-electric shadow-[0_0_12px_rgba(0,229,255,0.8)] scale-110' : 'bg-transparent border border-white/20'}`} />
              <span className="font-serif text-lg tracking-tight">Student Nexus</span>
            </div>
          </li>
          
          {role === 'mentor' && (
            <li 
              onClick={() => showDashboard ? null : onDashboardToggle?.()}
              className={`flex items-center justify-between cursor-pointer transition-all group ${showDashboard ? 'text-saffron' : 'hover:text-white'}`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full transition-all duration-500 ${showDashboard ? 'bg-saffron shadow-[0_0_12px_rgba(255,145,0,0.8)] scale-110' : 'bg-transparent border border-saffron/20'}`} />
                <span className="font-serif text-lg tracking-tight">Mentor Sanctum</span>
              </div>
              {unreadCount > 0 && !showDashboard && (
                <motion.span 
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="bg-saffron text-black text-[9px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center shadow-[0_0_10px_rgba(255,145,0,0.5)]"
                >
                  {unreadCount}
                </motion.span>
              )}
            </li>
          )}

          <li className="flex items-center gap-3 hover:text-white cursor-pointer transition-colors group">
            <div className="w-1.5 h-1.5 rounded-full bg-transparent border border-white/10 group-hover:bg-white/20" />
            <span className="font-serif text-lg tracking-tight">Impact Board</span>
          </li>
          <li className="flex items-center gap-3 hover:text-white cursor-pointer transition-colors group">
            <div className="w-1.5 h-1.5 rounded-full bg-transparent border border-white/10 group-hover:bg-white/20" />
            <span className="font-serif text-lg tracking-tight">Project Match</span>
          </li>
        </ul>
      </div>
      
      <div className="mt-auto space-y-6">
        {/* Karma Card */}
        <div className="p-6 rounded-3xl border border-white/5 bg-white/[0.02] shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
            <Zap className="w-12 h-12 text-saffron" />
          </div>
          
          <span className="stat-label !text-saffron/80 flex items-center gap-2">
            <Zap className="w-3 h-3 fill-saffron" /> Contribution Karma
          </span>
          
          <div className="mt-4">
            <div className="text-4xl font-serif text-white tracking-tighter italic">
              {karma.toLocaleString()}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-[10px] font-bold tracking-widest uppercase py-0.5 px-2 rounded-md ${
                levelName === 'Pioneer' ? 'bg-saffron text-black' : 
                levelName === 'Scholar' ? 'bg-electric text-black' : 
                'bg-white/10 text-white'
              }`}>
                {levelName}
              </span>
            </div>
          </div>

          <div className="mt-6 space-y-2">
            <div className="flex justify-between text-[8px] font-mono uppercase tracking-[0.15em] text-white/30">
              <span>Progress Track</span>
              <span>{Math.min(100, Math.floor((karma / 1000) * 100))}%</span>
            </div>
            <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, (karma / 1000) * 100)}%` }}
                className={`h-full shadow-[0_0_8px] ${
                  levelName === 'Pioneer' ? 'bg-saffron shadow-saffron/50' : 'bg-electric shadow-electric/50'
                }`}
              />
            </div>
          </div>
        </div>

        {role === 'mentor' && expertise && (
          <div className="p-5 rounded-3xl border border-glass-border bg-saffron/[0.03]">
            <span className="stat-label !text-saffron/60 flex items-center gap-2">
              <ShieldCheck className="w-3 h-3" /> Faculty Domain
            </span>
            <div className="flex flex-wrap gap-2 mt-4">
              {expertise.map(ex => (
                <span key={ex} className="text-[10px] border border-saffron/20 px-2 py-1 rounded-lg uppercase font-bold tracking-tighter text-saffron/80 bg-saffron/5">
                  {ex}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Identity Switcher */}
        <button 
          onClick={onToggleRole}
          className="w-full p-4 rounded-2xl border border-white/5 bg-white/[0.01] hover:bg-white/[0.03] transition-all flex items-center justify-between group"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-zinc-900 border border-white/10 flex items-center justify-center group-hover:border-white/20">
              <UserCircle className="w-4 h-4 text-accent" />
            </div>
            <div className="text-left">
              <div className="text-[10px] text-white/40 uppercase font-mono tracking-tighter">Current Persona</div>
              <div className="text-xs font-serif text-white capitalize">{role}</div>
            </div>
          </div>
          <ArrowRightLeft className="w-3 h-3 text-white/20 group-hover:text-white/40 transition-colors" />
        </button>
      </div>
    </nav>
  );
}
