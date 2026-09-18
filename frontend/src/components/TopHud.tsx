import React from 'react';
import { BotData } from '../types';
import { Zap, Shield, ChevronRight } from 'lucide-react';

interface TopHudProps {
  botA: BotData;
  botB: BotData;
  currentTimeStr: string;
  roundNumber?: number;
  isLive?: boolean;
}

export const TopHud: React.FC<TopHudProps> = ({
  botA,
  botB,
  currentTimeStr,
  roundNumber = 1,
  isLive = true,
}) => {
  return (
    <div className="w-full flex items-center justify-between px-6 py-3 select-none pointer-events-auto">
      {/* LEFT: BOT A — SPEAR v12 */}
      <div className="flex-1 max-w-[360px] bg-white/90 backdrop-blur-md rounded-xl border border-neutral-200/90 shadow-[0_2px_8px_rgba(0,0,0,0.04)] p-3">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-sm bg-red-600 shadow-[0_0_8px_rgba(220,38,38,0.5)] inline-block" />
            <span className="text-xs font-bold tracking-tight text-neutral-900 font-mono">
              BOT A — {botA.name}
            </span>
          </div>
          <span className="text-[11px] font-mono font-semibold text-red-700 bg-red-50 px-1.5 py-0.5 rounded border border-red-200">
            CORE {botA.coreHp}%
          </span>
        </div>

        {/* Health / Core Bar */}
        <div className="w-full h-2 rounded-full bg-neutral-100 overflow-hidden border border-neutral-200/60 p-0.5 mb-2">
          <div
            className="h-full rounded-full bg-gradient-to-r from-red-600 via-orange-500 to-amber-500 transition-all duration-300 shadow-xs"
            style={{ width: `${botA.coreHp}%` }}
          />
        </div>

        {/* Small triangle count & Motor count */}
        <div className="flex items-center justify-between text-[11px] text-neutral-600 font-mono">
          <div className="flex items-center gap-1.5">
            <span className="text-neutral-400">MODULES</span>
            <span className="font-semibold text-neutral-800">
              {botA.activeTriangles} / {botA.totalTriangles}
            </span>
          </div>
          <div className="flex items-center gap-1 text-neutral-400">
            <span>•</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Zap className="w-3 h-3 text-amber-600" />
            <span className="text-neutral-400">MOTORS</span>
            <span className="font-semibold text-neutral-800">
              {botA.activeMotorCount} / {botA.totalMotorCount}
            </span>
          </div>
        </div>
      </div>

      {/* CENTER: ROUND 01 | 00:47 | LIVE SIMULATION */}
      <div className="mx-4 flex flex-col items-center justify-center bg-white/95 backdrop-blur-md rounded-xl border border-neutral-200/90 shadow-[0_2px_8px_rgba(0,0,0,0.04)] px-5 py-2.5 text-center min-w-[170px]">
        <div className="text-[10px] font-mono tracking-wider font-semibold text-neutral-400 uppercase">
          ROUND {String(roundNumber).padStart(2, '0')}
        </div>
        <div className="text-2xl font-bold font-mono tracking-tight text-neutral-900 my-0.5">
          {currentTimeStr}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
          </span>
          <span className="text-[9px] font-bold font-mono tracking-widest uppercase text-neutral-600">
            LIVE SIMULATION
          </span>
        </div>
      </div>

      {/* RIGHT: BOT B — FLANKER v08 (Perfect symmetry with Left) */}
      <div className="flex-1 max-w-[360px] bg-white/90 backdrop-blur-md rounded-xl border border-neutral-200/90 shadow-[0_2px_8px_rgba(0,0,0,0.04)] p-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] font-mono font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
            CORE {botB.coreHp}%
          </span>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold tracking-tight text-neutral-900 font-mono">
              BOT B — {botB.name}
            </span>
            <span className="w-2.5 h-2.5 rounded-sm bg-blue-600 shadow-[0_0_8px_rgba(37,99,235,0.5)] inline-block" />
          </div>
        </div>

        {/* Health / Core Bar */}
        <div className="w-full h-2 rounded-full bg-neutral-100 overflow-hidden border border-neutral-200/60 p-0.5 mb-2">
          <div
            className="h-full rounded-full bg-gradient-to-l from-blue-600 via-teal-500 to-emerald-400 transition-all duration-300 ml-auto shadow-xs"
            style={{ width: `${botB.coreHp}%` }}
          />
        </div>

        {/* Small triangle count & Motor count */}
        <div className="flex items-center justify-between text-[11px] text-neutral-600 font-mono">
          <div className="flex items-center gap-1.5">
            <Zap className="w-3 h-3 text-teal-600" />
            <span className="text-neutral-400">MOTORS</span>
            <span className="font-semibold text-neutral-800">
              {botB.activeMotorCount} / {botB.totalMotorCount}
            </span>
          </div>
          <div className="flex items-center gap-1 text-neutral-400">
            <span>•</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-neutral-400">MODULES</span>
            <span className="font-semibold text-neutral-800">
              {botB.activeTriangles} / {botB.totalTriangles}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
