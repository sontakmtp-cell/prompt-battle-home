import React from 'react';
import { MatchEvent } from '../types';
import { Layers, Activity, AlertTriangle, ShieldAlert, Sparkles, ExternalLink } from 'lucide-react';

interface RightMatchEventsProps {
  events: MatchEvent[];
  damageMapActive: boolean;
  onToggleDamageMap: () => void;
  onEventClick?: (event: MatchEvent) => void;
}

export const RightMatchEvents: React.FC<RightMatchEventsProps> = ({
  events,
  damageMapActive,
  onToggleDamageMap,
  onEventClick,
}) => {
  // Render specific tiny geometric icon for each event
  const renderGeometricIcon = (event: MatchEvent) => {
    switch (event.type) {
      case 'motor':
        return (
          <svg width="14" height="14" viewBox="0 0 16 16" className="text-amber-500 shrink-0">
            <polygon points="8 1, 14 14, 2 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="2 1" />
            <path d="M8 6 L8 11" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        );
      case 'overload':
        return (
          <svg width="14" height="14" viewBox="0 0 16 16" className="text-red-500 shrink-0">
            <rect x="2" y="2" width="12" height="12" rx="2" transform="rotate(45 8 8)" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="8" cy="8" r="2" fill="currentColor" />
          </svg>
        );
      case 'counter':
        return (
          <svg width="14" height="14" viewBox="0 0 16 16" className="text-red-600 shrink-0">
            {/* Hammer striking Scissor */}
            <polygon points="6 3, 10 9, 2 9" fill="#dc2626" stroke="#991b1b" strokeWidth="1.2" />
            <polygon points="12 6, 15 13, 9 13" fill="none" stroke="#2563eb" strokeWidth="1.2" />
          </svg>
        );
      case 'destroyed':
        return (
          <svg width="14" height="14" viewBox="0 0 16 16" className="text-neutral-400 shrink-0">
            {/* Shattered / breaking triangle */}
            <polygon points="8 2, 13 13, 8 10" fill="none" stroke="currentColor" strokeWidth="1.4" />
            <polygon points="7 9, 3 13, 6 6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeDasharray="1.5 1.5" />
          </svg>
        );
      case 'core':
        return (
          <svg width="14" height="14" viewBox="0 0 16 16" className="text-red-600 shrink-0">
            <circle cx="8" cy="8" r="5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 1" />
            <polygon points="8 5, 10 10, 6 10" fill="#dc2626" />
          </svg>
        );
      default:
        return (
          <svg width="14" height="14" viewBox="0 0 16 16" className="text-blue-500 shrink-0">
            <polygon points="8 2, 14 13, 2 13" fill="none" stroke="currentColor" strokeWidth="1.4" />
          </svg>
        );
    }
  };

  return (
    <aside className="w-[270px] bg-white/95 backdrop-blur-md rounded-2xl border border-neutral-200/90 shadow-[0_4px_20px_rgba(0,0,0,0.05)] p-4 flex flex-col gap-3.5 select-none pointer-events-auto">
      {/* Feed Header */}
      <div className="flex items-center justify-between pb-2 border-b border-neutral-100">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-3 bg-neutral-900 rounded-xs" />
          <h3 className="text-[11px] font-mono uppercase tracking-wider text-neutral-800 font-bold">
            MATCH EVENTS
          </h3>
        </div>
        <span className="text-[10px] font-mono text-neutral-400">
          LOG 00:35–00:47
        </span>
      </div>

      {/* Minimal Event Feed */}
      <div className="space-y-1.5 overflow-y-auto max-h-[220px] pr-1 scrollbar-thin">
        {events.map((event) => (
          <div
            key={event.id}
            onClick={() => onEventClick && onEventClick(event)}
            className="group flex items-start gap-2.5 p-2 rounded-xl hover:bg-neutral-50 border border-transparent hover:border-neutral-200 transition-all cursor-pointer"
          >
            {/* Timestamp */}
            <span className="text-[10px] font-mono font-semibold text-neutral-400 mt-0.5 group-hover:text-neutral-700 transition-colors">
              {event.timestamp}
            </span>

            {/* Tiny Geometric Icon */}
            <div className="mt-0.5">
              {renderGeometricIcon(event)}
            </div>

            {/* Event Description */}
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-neutral-900 leading-tight truncate">
                {event.title}
              </div>
              <div className="text-[10px] text-neutral-500 font-mono mt-0.5 line-clamp-1">
                {event.description}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Damage Map Mini-Preview */}
      <div className="pt-2 border-t border-neutral-100">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-500 font-semibold flex items-center gap-1">
            <Layers className="w-3 h-3 text-neutral-400" />
            Damage Map
          </span>
          <button
            onClick={onToggleDamageMap}
            className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded transition-all ${
              damageMapActive
                ? 'bg-neutral-900 text-white shadow-2xs'
                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
            }`}
          >
            {damageMapActive ? 'Active' : 'Preview'}
          </button>
        </div>

        {/* Small preview frame */}
        <div
          onClick={onToggleDamageMap}
          className="w-full h-24 bg-neutral-900 rounded-xl overflow-hidden relative cursor-pointer border border-neutral-300 group hover:border-neutral-400 transition-all shadow-inner"
          title="Click to toggle full arena damage heatmap"
        >
          {/* Subtle grid on dark miniature preview */}
          <div className="absolute inset-0 opacity-20 arena-grid-pattern invert" />

          {/* Miniature heatmap representation */}
          <svg viewBox="0 0 200 80" className="w-full h-full p-2">
            {/* Bot A (Left) - spear stress gradient */}
            <ellipse cx="65" cy="40" rx="30" ry="18" fill="rgba(234, 88, 12, 0.25)" />
            <polygon points="85,40 50,28 50,52" fill="none" stroke="#ea580c" strokeWidth="1.2" />
            <circle cx="85" cy="40" r="4" fill="#dc2626" className="animate-pulse" />

            {/* Impact clash line */}
            <line x1="86" y1="36" x2="108" y2="44" stroke="#ffffff" strokeWidth="1.5" strokeDasharray="2 1" />

            {/* Bot B (Right) - crescent rupture stress */}
            <ellipse cx="125" cy="40" rx="28" ry="22" fill="rgba(37, 99, 235, 0.3)" />
            <path
              d="M 110,25 C 135,28 135,52 110,55"
              fill="none"
              stroke="#2563eb"
              strokeWidth="1.5"
            />
            {/* Ruptured module zone */}
            <circle cx="108" cy="38" r="6" fill="#ef4444" fillOpacity="0.75" />
            <circle cx="120" cy="40" r="3" fill="#38bdf8" />
            
            {/* Detached debris dots */}
            <circle cx="98" cy="28" r="1.5" fill="#fca5a5" />
            <circle cx="104" cy="22" r="1.2" fill="#e2e8f0" opacity="0.6" />
          </svg>

          <div className="absolute bottom-1.5 left-2 flex items-center gap-1.5 text-[9px] font-mono text-neutral-400">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
            <span>Stress: 98% (Peak)</span>
          </div>

          <div className="absolute bottom-1.5 right-2 text-[9px] font-mono text-neutral-400 group-hover:text-white transition-colors flex items-center gap-0.5">
            <span>Overlay</span>
            <ExternalLink className="w-2.5 h-2.5" />
          </div>
        </div>
      </div>
    </aside>
  );
};
