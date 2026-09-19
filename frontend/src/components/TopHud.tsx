import React from 'react';
import { Zap } from 'lucide-react';
import type { BotView } from '../lab/replay';

interface TopHudProps {
  a: BotView | null;
  b: BotView | null;
  currentTimeStr: string;
  roundNumber?: number;
  isLive?: boolean;
}

/**
 * Match HUD.
 *
 * ky_thuat_my_thuat.md 4.3 makes the panel order a hard rule: Team A is always on
 * the left and Team B always on the right, in every screen, list and result
 * table, never swapped. It is channel 4 of the four recognition channels - the
 * one that still works when colour is gone.
 */
export const TopHud: React.FC<TopHudProps> = ({
  a,
  b,
  currentTimeStr,
  roundNumber = 1,
  isLive = true,
}) => {
  return (
    <div className="w-full flex items-center justify-between px-6 py-3 select-none pointer-events-auto">
      <SidePanel bot={a} side="A" />

      <div className="mx-4 flex flex-col items-center justify-center bg-white/95 backdrop-blur-md rounded-xl border border-neutral-200/90 shadow-[0_2px_8px_rgba(0,0,0,0.04)] px-5 py-2.5 text-center min-w-[170px]">
        <div className="text-[10px] font-mono tracking-wider font-semibold text-neutral-400 uppercase">
          TRẬN {String(roundNumber).padStart(2, '0')}
        </div>
        <div className="text-2xl font-bold font-mono tracking-tight text-neutral-900 my-0.5">
          {currentTimeStr}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          {isLive && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
            </span>
          )}
          <span className="text-[9px] font-bold font-mono tracking-widest uppercase text-neutral-600">
            {isLive ? 'ĐANG CHẠY' : 'TẠM DỪNG'}
          </span>
        </div>
      </div>

      <SidePanel bot={b} side="B" />
    </div>
  );
};

const SidePanel: React.FC<{ bot: BotView | null; side: 'A' | 'B' }> = ({ bot, side }) => {
  const isA = side === 'A';
  if (!bot) {
    return <div className="flex-1 max-w-[360px] h-[86px] rounded-xl border border-dashed border-neutral-200" />;
  }
  const corePct = bot.coreRatioMilli / 10;
  const alive = bot.tiles.filter((t) => t.alive).length;

  return (
    <div className="flex-1 max-w-[360px] bg-white/90 backdrop-blur-md rounded-xl border border-neutral-200/90 shadow-[0_2px_8px_rgba(0,0,0,0.04)] p-3">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span
            className="w-2.5 h-2.5 rounded-sm inline-block"
            style={{ background: isA ? '#C0392B' : '#1D4ED8' }}
          />
          <span className="text-xs font-bold tracking-tight text-neutral-900 font-mono">
            ĐỘI {side} — {bot.name}
          </span>
        </div>
        <span
          className={`text-[11px] font-mono font-semibold px-1.5 py-0.5 rounded border ${
            isA ? 'text-red-700 bg-red-50 border-red-200' : 'text-blue-700 bg-blue-50 border-blue-200'
          }`}
        >
          LÕI {corePct.toFixed(0)}%
        </span>
      </div>

      <div className="w-full h-2 rounded-full bg-neutral-100 overflow-hidden border border-neutral-200/60 p-0.5 mb-2">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            isA
              ? 'bg-gradient-to-r from-red-600 via-orange-500 to-amber-500'
              : 'bg-gradient-to-l from-blue-600 via-teal-500 to-emerald-400 ml-auto'
          }`}
          style={{ width: `${corePct}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-[11px] text-neutral-600 font-mono">
        <div className="flex items-center gap-1.5">
          <span className="text-neutral-400">Ô</span>
          <span className="font-semibold text-neutral-800">
            {alive} / {bot.tiles.length}
          </span>
        </div>
        <span className="text-neutral-300">•</span>
        <div className="flex items-center gap-1.5">
          <Zap className={`w-3 h-3 ${isA ? 'text-amber-600' : 'text-teal-600'}`} />
          <span className="text-neutral-400">MOTOR</span>
          <span className="font-semibold text-neutral-800">
            {bot.motorAlive} / {bot.tiles.filter((t) => t.type === 'motor').length}
          </span>
        </div>
        <span className="text-neutral-300">•</span>
        <div className="flex items-center gap-1.5">
          <span className="text-neutral-400">TẢI</span>
          <span
            className={`font-semibold ${
              bot.effectiveLoadMilli > 2000
                ? 'text-red-600'
                : bot.effectiveLoadMilli > 1000
                  ? 'text-amber-600'
                  : 'text-emerald-600'
            }`}
          >
            {(bot.effectiveLoadMilli / 1000).toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
};
