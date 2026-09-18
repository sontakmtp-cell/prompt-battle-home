import React from 'react';
import { BotData } from '../types';
import { Eye, Edit3, ShieldAlert, Activity, Crosshair, HelpCircle } from 'lucide-react';

interface LeftBotInspectorProps {
  bot: BotData;
  onOpenInspect: () => void;
  onOpenEditBot: () => void;
  selectedModuleId?: string | null;
}

export const LeftBotInspector: React.FC<LeftBotInspectorProps> = ({
  bot,
  onOpenInspect,
  onOpenEditBot,
  selectedModuleId,
}) => {
  return (
    <aside className="w-[260px] bg-white/95 backdrop-blur-md rounded-2xl border border-neutral-200/90 shadow-[0_4px_20px_rgba(0,0,0,0.05)] p-4 flex flex-col gap-3 select-none pointer-events-auto">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-neutral-100">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 font-semibold">
            BOT INSPECTOR
          </div>
          <div className="text-sm font-bold text-neutral-900 font-mono tracking-tight flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-600" />
            {bot.name}
          </div>
        </div>
        <span className="text-[10px] font-mono text-neutral-500 bg-neutral-100 px-1.5 py-0.5 rounded border border-neutral-200">
          TEAM WARM
        </span>
      </div>

      {/* Small Miniature Schematic Diagram of Bot A */}
      <div className="w-full h-24 bg-neutral-50 rounded-xl border border-neutral-200/70 relative overflow-hidden flex items-center justify-center group cursor-pointer"
        onClick={onOpenInspect}
        title="Click to open deep module inspection"
      >
        <div className="absolute inset-0 triangle-grid-subtle opacity-60" />
        
        {/* Exact miniature SVG diagram rendered from live tessellated modules */}
        <svg viewBox="-115 -80 235 160" className="w-full h-full p-1 relative z-10">
          {bot.modules.map((m) => {
            const isWarm = bot.identity === 'warm';
            let fill = '#ffffff';
            let stroke = isWarm ? '#ea580c' : '#0d9488';
            if (m.type === 'hammer') {
              fill = isWarm ? '#dc2626' : '#2563eb';
              stroke = isWarm ? '#991b1b' : '#1d4ed8';
            } else if (m.type === 'paper') {
              fill = isWarm ? '#fef3c7' : '#f0fdf4';
              stroke = isWarm ? '#d97706' : '#0284c7';
            } else if (m.type === 'motor') {
              fill = isWarm ? '#fffbeb' : '#e0f2fe';
              stroke = isWarm ? '#f59e0b' : '#38bdf8';
            }
            return (
              <polygon
                key={m.id}
                points={m.points}
                fill={fill}
                stroke={stroke}
                strokeWidth={m.id === selectedModuleId ? 1.8 : 0.6}
                strokeDasharray={m.type === 'motor' ? '1.5 1' : undefined}
              />
            );
          })}
          {/* Core glow ring */}
          {bot.modules.find((m) => m.isCore) && (
            <circle
              cx={bot.modules.find((m) => m.isCore)?.x}
              cy={bot.modules.find((m) => m.isCore)?.y}
              r="14"
              fill="none"
              stroke="#ea580c"
              strokeWidth="1.2"
              strokeDasharray="3 1.5"
            />
          )}
        </svg>

        <div className="absolute bottom-1 right-2 text-[9px] font-mono text-neutral-400">
          schematic
        </div>
      </div>

      {/* Stats Table */}
      <div className="space-y-1.5 text-xs font-mono">
        <div className="flex items-center justify-between py-1 border-b border-neutral-100 text-neutral-700">
          <span className="text-neutral-500 font-sans">Triangles</span>
          <span className="font-semibold text-neutral-900">
            {bot.activeTriangles} / {bot.totalTriangles}
          </span>
        </div>

        {/* Module breakdown */}
        <div className="grid grid-cols-2 gap-1.5 py-1 bg-neutral-50/80 p-2 rounded-lg border border-neutral-100 text-[11px]">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 text-neutral-600 font-sans">
              <span className="w-2 h-2 rounded-[2px] bg-red-600 inline-block" />
              Hammer
            </span>
            <span className="font-semibold text-neutral-900">{bot.triangleCounts.hammer}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 text-neutral-600 font-sans">
              <span className="w-2 h-2 rounded-[2px] border border-orange-600 bg-white inline-block" />
              Scissor
            </span>
            <span className="font-semibold text-neutral-900">{bot.triangleCounts.scissor}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 text-neutral-600 font-sans">
              <span className="w-2 h-2 rounded-[2px] border border-dashed border-amber-600 bg-amber-50 inline-block" />
              Paper
            </span>
            <span className="font-semibold text-neutral-900">{bot.triangleCounts.paper}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 text-neutral-600 font-sans">
              <span className="w-2 h-2 rounded-[2px] border border-dashed border-neutral-400 bg-neutral-100 inline-block" />
              Motor
            </span>
            <span className="font-semibold text-neutral-900">{bot.triangleCounts.motor}</span>
          </div>
        </div>

        <div className="flex items-center justify-between py-0.5 text-neutral-700">
          <span className="text-neutral-500 font-sans">Load factor</span>
          <span className="font-semibold text-neutral-900">{bot.loadFactor.toFixed(2)}</span>
        </div>
        <div className="flex items-center justify-between py-0.5 text-neutral-700">
          <span className="text-neutral-500 font-sans">Mobility</span>
          <span className="font-semibold text-emerald-600">{bot.mobility}%</span>
        </div>
        <div className="flex items-center justify-between py-0.5 text-neutral-700">
          <span className="text-neutral-500 font-sans">Core HP</span>
          <span className="font-semibold text-red-600">{bot.coreHp}%</span>
        </div>
      </div>

      {/* Tactical Label: Brain */}
      <div className="bg-neutral-50 rounded-xl p-2.5 border border-neutral-200/70">
        <div className="text-[10px] font-mono text-neutral-400 uppercase tracking-wide font-semibold">
          Brain
        </div>
        <div className="text-xs font-semibold text-neutral-900 mt-0.5 font-sans">
          {bot.tacticalBrain.directive}
        </div>
        <p className="text-[10px] text-neutral-500 mt-1 line-clamp-2 leading-relaxed font-mono">
          "{bot.tacticalBrain.promptSnippet}"
        </p>
      </div>

      {/* Buttons: Inspect & Edit Bot */}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <button
          onClick={onOpenInspect}
          className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-white border border-neutral-200 hover:bg-neutral-50 text-neutral-800 text-xs font-semibold tracking-wide transition-all shadow-xs"
        >
          <Eye className="w-3.5 h-3.5 text-neutral-500" />
          <span>Inspect</span>
        </button>
        <button
          onClick={onOpenEditBot}
          className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-semibold tracking-wide transition-all shadow-xs"
        >
          <Edit3 className="w-3.5 h-3.5" />
          <span>Edit Bot</span>
        </button>
      </div>
    </aside>
  );
};
