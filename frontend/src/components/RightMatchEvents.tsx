import React, { useMemo, useState } from 'react';
import type { Team } from '@promptchien/contracts';

export interface FeedEvent {
  id: string;
  tick: number;
  timeSec: number;
  title: string;
  detail: string;
  kind: string;
  team: Team | null;
  critical: boolean;
}

interface RightMatchEventsProps {
  events: FeedEvent[];
  currentTick: number;
  damageMapActive: boolean;
  onToggleDamageMap: () => void;
  onEventClick: (e: FeedEvent) => void;
  hottest: Array<{ team: Team; index: number; damage: number; destroyedTick: number | null }>;
}

const KIND_COLOR: Record<string, string> = {
  hit: 'text-neutral-600',
  destroy: 'text-amber-700',
  detach: 'text-orange-700',
  motorLost: 'text-red-700',
  overload: 'text-red-700',
  coreHit: 'text-red-700',
  coreDestroyed: 'text-red-800',
  ringStart: 'text-slate-500',
  ringEnter: 'text-red-700',
  ringExit: 'text-emerald-700',
  brainViolation: 'text-purple-700',
  matchEnd: 'text-neutral-900',
};

/**
 * The event feed (gameplay.md 6.1).
 *
 * The list is filtered to the current tick, so scrubbing the replay walks the
 * story forward instead of dumping the whole match at once. `hit` events are the
 * overwhelming majority - a 40-second match emits well over a thousand - so by
 * default only the structural events (destruction, detached limbs, Core hits,
 * the ring) are listed individually, with the raw hits one click away.
 */
export const RightMatchEvents: React.FC<RightMatchEventsProps> = ({
  events,
  currentTick,
  damageMapActive,
  onToggleDamageMap,
  onEventClick,
  hottest,
}) => {
  const [showAll, setShowAll] = useState(false);

  const visible = useMemo(() => {
    const upTo = events.filter((e) => e.tick <= currentTick);
    const tail = upTo.slice(-400);
    if (showAll) return tail.slice(-200).reverse();
    const structural = tail.filter((e) => e.kind !== 'hit' || e.critical);
    if (structural.length > 0) return structural.slice(-120).reverse();
    return tail.slice(-60).reverse();
  }, [events, currentTick, showAll]);

  const hitCount = useMemo(
    () => events.filter((e) => e.tick <= currentTick && e.kind === 'hit').length,
    [events, currentTick],
  );

  return (
    <div className="w-[280px] bg-white/92 backdrop-blur-md rounded-xl border border-neutral-200/90 shadow-[0_2px_8px_rgba(0,0,0,0.04)] flex flex-col max-h-[calc(100vh-260px)] pointer-events-auto">
      <div className="px-3 py-2 border-b border-neutral-100 flex items-center justify-between">
        <span className="text-[11px] font-bold font-mono tracking-tight text-neutral-800">SỰ KIỆN</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono text-neutral-400">{hitCount} cú đánh</span>
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="text-[10px] font-mono text-neutral-500 hover:text-neutral-900 border border-neutral-200 rounded px-1"
            title="Hiện cả những cú đánh lẻ"
          >
            {showAll ? 'lọc' : 'tất cả'}
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={onToggleDamageMap}
        className={`mx-3 mt-2 px-2 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors text-left ${
          damageMapActive
            ? 'bg-neutral-900 text-white border-neutral-900'
            : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-400'
        }`}
      >
        Bản đồ sát thương {damageMapActive ? '· đang bật' : '· đang tắt'}
      </button>

      {damageMapActive && hottest.length > 0 && (
        <div className="mx-3 mt-2 rounded-lg border border-neutral-200 bg-neutral-50/70 p-2">
          <div className="text-[10px] font-bold font-mono text-neutral-500 mb-1">BA Ô ĂN ĐÒN NẶNG NHẤT</div>
          <div className="flex flex-col gap-0.5">
            {hottest.map((h) => (
              <div key={`${h.team}-${h.index}`} className="flex items-center justify-between text-[10px] font-mono">
                <span className={h.team === 'A' ? 'text-red-700' : 'text-blue-700'}>
                  {h.team} · ô #{h.index}
                </span>
                <span className="text-neutral-500">
                  {h.damage} dmg{h.destroyedTick !== null ? ` · vỡ nhịp ${h.destroyedTick}` : ''}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex items-center gap-1">
            <span className="text-[9px] font-mono text-neutral-400">nhẹ</span>
            {['#FAC775', '#EF9F27', '#D85A30', '#A32D2D'].map((c) => (
              <span key={c} className="w-4 h-2 rounded-xs" style={{ background: c }} />
            ))}
            <span className="text-[9px] font-mono text-neutral-400">nặng</span>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-2 py-2 flex flex-col gap-0.5">
        {visible.length === 0 && (
          <p className="text-[11px] font-mono text-neutral-400 px-2 py-3">chưa có sự kiện nào</p>
        )}
        {visible.map((e) => (
          <button
            key={e.id}
            type="button"
            onClick={() => onEventClick(e)}
            className="text-left px-2 py-1 rounded-md hover:bg-neutral-100 transition-colors group"
          >
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-mono text-neutral-400 shrink-0 w-9">{e.timeSec.toFixed(1)}s</span>
              <span className={`text-[11px] font-semibold truncate ${KIND_COLOR[e.kind] ?? 'text-neutral-700'}`}>
                {e.title}
              </span>
              {e.critical && <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />}
            </div>
            {e.detail && <div className="text-[10px] font-mono text-neutral-400 pl-11 truncate">{e.detail}</div>}
          </button>
        ))}
      </div>
    </div>
  );
};
