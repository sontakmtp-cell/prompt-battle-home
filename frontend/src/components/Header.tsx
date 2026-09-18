import React from 'react';
import { Cpu, Terminal, Radio, Shield, Sparkles, Layers, Sliders } from 'lucide-react';

interface HeaderProps {
  activeTab: 'Battle' | 'Bots' | 'Lab' | 'Replays';
  setActiveTab: (tab: 'Battle' | 'Bots' | 'Lab' | 'Replays') => void;
  onOpenPromptModal: () => void;
  aspectLock: boolean;
  setAspectLock: (lock: boolean) => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  onOpenPromptModal,
  aspectLock,
  setAspectLock,
}) => {
  return (
    <header className="w-full bg-white/95 backdrop-blur-md border-b border-neutral-200/80 px-6 py-2.5 flex items-center justify-between z-30 select-none shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
      {/* Brand & Tagline */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-neutral-900 flex items-center justify-center text-white shadow-xs">
            {/* Geometric logo mark */}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-white">
              <polygon points="12 2, 22 21, 2 21" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" fill="none" />
              <polygon points="12 8, 18 19, 6 19" fill="#ea580c" fillOpacity="0.8" />
              <circle cx="12" cy="14" r="2" fill="#ffffff" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold tracking-tight text-neutral-900 font-sans leading-none">
                PROMPT CHIẾN
              </h1>
              <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600 font-semibold border border-neutral-200">
                v2.4-sim
              </span>
            </div>
            <p className="text-[11px] text-neutral-500 font-medium mt-0.5 tracking-tight">
              Design with AI. Fight with code.
            </p>
          </div>
        </div>

        {/* Minimal Navigation */}
        <nav className="hidden md:flex items-center gap-1 pl-4 border-l border-neutral-200">
          {(['Battle', 'Bots', 'Lab', 'Replays'] as const).map((tab) => {
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                  isActive
                    ? 'bg-neutral-900 text-white shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100/80'
                }`}
              >
                {tab}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Right status & Connection indicator */}
      <div className="flex items-center gap-3 text-xs font-mono">
        <button
          onClick={onOpenPromptModal}
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-50 hover:bg-neutral-100 text-neutral-700 border border-neutral-200/90 font-sans text-xs font-medium transition-colors"
          title="Open AI Strategy Compiler"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-600" />
          <span>Prompt AI Bot</span>
        </button>

        <button
          onClick={() => setAspectLock(!aspectLock)}
          className={`hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
            aspectLock
              ? 'bg-neutral-900 text-white border-neutral-900'
              : 'bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50'
          }`}
          title="Toggle Desktop 16:9 Standard Constraint"
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>16:9 Aspect</span>
        </button>

        {/* Telemetry badge */}
        <div className="hidden xl:flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-neutral-100/70 border border-neutral-200 text-neutral-500 text-[11px]">
          <span>STEP 4ms</span>
          <span className="text-neutral-300">|</span>
          <span className="text-emerald-600 font-semibold">60 FPS</span>
        </div>

        {/* MCP Connection Status */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50/80 border border-emerald-200/80 text-emerald-800">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-[11px] font-semibold tracking-tight uppercase">
            MCP Connected
          </span>
        </div>
      </div>
    </header>
  );
};
