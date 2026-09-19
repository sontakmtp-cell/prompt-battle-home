import React from 'react';
import { Play, Pause, RotateCcw, ChevronLeft, ChevronRight, Layers, Eye, ListTree, Grid, Compass } from 'lucide-react';

/** One dot on the timeline. Kept deliberately small: the feed holds thousands. */
export interface TimelineMarker {
  id: string;
  timeSec: number;
  tick: number;
  title: string;
  critical: boolean;
  team: 'A' | 'B' | null;
}

interface BottomReplayBarProps {
  isPlaying: boolean;
  onTogglePlay: () => void;
  currentTimeSec: number;
  totalTimeSec: number;
  onSeek: (seconds: number) => void;
  onStepTick: (delta: number) => void;
  speed: number;
  onSpeedChange: (speed: number) => void;
  damageMapActive: boolean;
  onToggleDamageMap: () => void;
  eventsOpen: boolean;
  onToggleEvents: () => void;
  inspectorOpen: boolean;
  onToggleInspector: () => void;
  markers: TimelineMarker[];
  gridActive: boolean;
  onToggleGrid: () => void;
  vectorsActive: boolean;
  onToggleVectors: () => void;
}

export const BottomReplayBar: React.FC<BottomReplayBarProps> = ({
  isPlaying,
  onTogglePlay,
  currentTimeSec,
  totalTimeSec,
  onSeek,
  onStepTick,
  speed,
  onSpeedChange,
  damageMapActive,
  onToggleDamageMap,
  eventsOpen,
  onToggleEvents,
  inspectorOpen,
  onToggleInspector,
  markers,
  gridActive,
  onToggleGrid,
  vectorsActive,
  onToggleVectors,
}) => {
  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${String(mins).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const progressPercent = totalTimeSec > 0 ? (currentTimeSec / totalTimeSec) * 100 : 0;

  // A 3 600-tick replay produces a few thousand hit events. Drawing one dot each
  // would be both slow and unreadable, so only the notable ones get a marker.
  const shownMarkers = markers.filter((m) => m.critical).slice(0, 400);

  return (
    <footer className="w-full bg-white/95 backdrop-blur-md border-t border-neutral-200/90 px-6 py-2.5 flex items-center justify-between gap-4 select-none shadow-[0_-1px_4px_rgba(0,0,0,0.02)] z-30">
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onTogglePlay}
          className="w-9 h-9 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white flex items-center justify-center transition-all shadow-xs active:scale-95"
          title={isPlaying ? 'Tạm dừng (Space)' : 'Phát (Space)'}
        >
          {isPlaying ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white ml-0.5" />}
        </button>

        <button
          onClick={() => onStepTick(-1)}
          className="w-8 h-8 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-700 flex items-center justify-center transition-colors"
          title="Lùi 1 nhịp (←)"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onStepTick(1)}
          className="w-8 h-8 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-700 flex items-center justify-center transition-colors"
          title="Tiến 1 nhịp (→)"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => onSeek(Math.max(0, currentTimeSec - 5))}
          className="w-8 h-8 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-700 flex items-center justify-center transition-colors"
          title="Lùi 5 giây"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>

        <div className="font-mono text-xs text-neutral-800 font-semibold px-2 py-1 rounded bg-neutral-50 border border-neutral-200/80 tracking-tight">
          <span>{formatTime(currentTimeSec)}</span>
          <span className="text-neutral-400 mx-1">/</span>
          <span className="text-neutral-400">{formatTime(totalTimeSec)}</span>
        </div>
      </div>

      <div className="flex-1 max-w-2xl relative flex items-center">
        <div
          className="relative w-full h-7 flex items-center cursor-pointer group"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const pct = Math.max(0, Math.min(1, clickX / rect.width));
            onSeek(pct * totalTimeSec);
          }}
        >
          <div className="w-full h-1.5 bg-neutral-200 rounded-full relative overflow-visible">
            <div className="h-full bg-neutral-900 rounded-full transition-all" style={{ width: `${progressPercent}%` }} />

            {shownMarkers.map((evt) => {
              const markerPct = totalTimeSec > 0 ? (evt.timeSec / totalTimeSec) * 100 : 0;
              return (
                <div
                  key={evt.id}
                  style={{ left: `${markerPct}%` }}
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10 group/marker"
                  title={`${formatTime(evt.timeSec)} · nhịp ${evt.tick} — ${evt.title}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSeek(evt.timeSec);
                  }}
                >
                  <div
                    className={`w-2.5 h-2.5 rounded-full border-2 border-white transition-transform hover:scale-150 shadow-xs ${
                      evt.critical ? 'bg-red-600' : evt.team === 'A' ? 'bg-amber-500' : 'bg-blue-600'
                    }`}
                  />
                  <div className="opacity-0 group-hover/marker:opacity-100 pointer-events-none absolute bottom-5 -translate-x-1/2 left-1/2 px-2 py-1 rounded bg-neutral-900 text-white text-[10px] font-mono whitespace-nowrap shadow-lg transition-opacity z-30">
                    <span className="font-semibold text-neutral-300">{formatTime(evt.timeSec)}</span> {evt.title}
                  </div>
                </div>
              );
            })}
          </div>

          <div
            className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white border-2 border-neutral-900 rounded-full shadow-md pointer-events-none transition-all"
            style={{ left: `calc(${progressPercent}% - 8px)` }}
          />
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <div className="flex items-center bg-neutral-100 p-0.5 rounded-lg border border-neutral-200 text-xs font-mono">
          {[0.5, 1, 2, 4].map((s) => (
            <button
              key={s}
              onClick={() => onSpeedChange(s)}
              className={`px-2 py-1 rounded-md transition-all font-semibold ${
                speed === s ? 'bg-white text-neutral-900 shadow-2xs' : 'text-neutral-500 hover:text-neutral-900'
              }`}
            >
              {s}×
            </button>
          ))}
        </div>

        <div className="h-4 w-px bg-neutral-200 mx-1" />

        <div className="flex items-center gap-1.5">
          <button
            onClick={onToggleDamageMap}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-all ${
              damageMapActive
                ? 'bg-neutral-900 text-white border-neutral-900 shadow-xs'
                : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50'
            }`}
            title="Bản đồ sát thương (D)"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Bản đồ đòn</span>
          </button>

          <button
            onClick={onToggleEvents}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-all ${
              eventsOpen
                ? 'bg-neutral-900 text-white border-neutral-900 shadow-xs'
                : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50'
            }`}
            title="Danh sách sự kiện (E)"
          >
            <ListTree className="w-3.5 h-3.5" />
            <span>Sự kiện</span>
          </button>

          <button
            onClick={onToggleInspector}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-all ${
              inspectorOpen
                ? 'bg-neutral-900 text-white border-neutral-900 shadow-xs'
                : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50'
            }`}
            title="Bảng soi bot (I)"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Soi bot</span>
          </button>

          <button
            onClick={onToggleVectors}
            className={`p-1.5 rounded-lg border transition-all ${
              vectorsActive
                ? 'bg-neutral-100 text-neutral-900 border-neutral-300'
                : 'bg-white text-neutral-400 border-neutral-200 hover:text-neutral-700'
            }`}
            title="Mũi tên hướng (V)"
          >
            <Compass className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={onToggleGrid}
            className={`p-1.5 rounded-lg border transition-all ${
              gridActive
                ? 'bg-neutral-100 text-neutral-900 border-neutral-300'
                : 'bg-white text-neutral-400 border-neutral-200 hover:text-neutral-700'
            }`}
            title="Lưới tam giác (G)"
          >
            <Grid className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </footer>
  );
};
