import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BotData, TriangleCell, MatchEvent } from './types';
import { INITIAL_BOT_A, INITIAL_BOT_B, MATCH_EVENTS } from './data/mockBattleData';
import { Header } from './components/Header';
import { TopHud } from './components/TopHud';
import { LeftBotInspector } from './components/LeftBotInspector';
import { RightMatchEvents } from './components/RightMatchEvents';
import { BottomReplayBar } from './components/BottomReplayBar';
import { BattleArena } from './components/BattleArena';
import { EditBotModal } from './components/EditBotModal';
import { InspectModuleModal } from './components/InspectModuleModal';

export default function App() {
  // Navigation & Viewport State
  const [activeTab, setActiveTab] = useState<'Battle' | 'Bots' | 'Lab' | 'Replays'>('Battle');
  const [aspectLock, setAspectLock] = useState<boolean>(false);

  // Simulation & Playback State
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTimeSec, setCurrentTimeSec] = useState<number>(47); // Initial 00:47 as requested
  const totalTimeSec = 120; // 02:00
  const [speed, setSpeed] = useState<number>(1);

  // Bot Models
  const [botA, setBotA] = useState<BotData>(INITIAL_BOT_A);
  const [botB, setBotB] = useState<BotData>(INITIAL_BOT_B);

  // Panels & Overlays State
  const [inspectorOpen, setInspectorOpen] = useState<boolean>(true);
  const [eventsOpen, setEventsOpen] = useState<boolean>(true);
  const [damageMapActive, setDamageMapActive] = useState<boolean>(false);
  const [gridActive, setGridActive] = useState<boolean>(true);
  const [vectorsActive, setVectorsActive] = useState<boolean>(false);

  // Modals & Selection State
  const [selectedTriangle, setSelectedTriangle] = useState<TriangleCell | null>(null);
  const [isEditBotModalOpen, setIsEditBotModalOpen] = useState<boolean>(false);
  const [isInspectModalOpen, setIsInspectModalOpen] = useState<boolean>(false);

  // Impact Shake State when damage is registered
  const [isImpactShaking, setIsImpactShaking] = useState<boolean>(false);
  const [shakeIntensity, setShakeIntensity] = useState<'normal' | 'heavy'>('normal');
  const shakeTimeoutRef = useRef<number | null>(null);
  const lastDamageEventSecRef = useRef<number>(-1);

  const triggerImpactShake = useCallback((intensity: 'normal' | 'heavy' = 'normal') => {
    setShakeIntensity(intensity);
    setIsImpactShaking(true);
    if (shakeTimeoutRef.current) clearTimeout(shakeTimeoutRef.current);
    shakeTimeoutRef.current = window.setTimeout(() => {
      setIsImpactShaking(false);
    }, intensity === 'heavy' ? 400 : 320);
  }, []);

  // Timer progression when simulation is playing
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setCurrentTimeSec((prev) => {
        if (prev >= totalTimeSec) return 0;
        return Number((prev + 0.1 * speed).toFixed(1));
      });
    }, 100);
    return () => clearInterval(interval);
  }, [isPlaying, speed, totalTimeSec]);

  // Trigger impact shake when timeline hits critical damage events
  useEffect(() => {
    const sec = Math.floor(currentTimeSec);
    if (sec === lastDamageEventSecRef.current) return;

    const matchedEvent = MATCH_EVENTS.find((e) => e.timeSec === sec);
    if (matchedEvent) {
      lastDamageEventSecRef.current = sec;
      if (matchedEvent.critical) {
        triggerImpactShake('heavy');
      } else if (matchedEvent.type === 'counter' || matchedEvent.type === 'thrust') {
        triggerImpactShake('normal');
      }
    }
  }, [currentTimeSec, triggerImpactShake]);

  // Keyboard controls for pro simulation feel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts if user is typing in an input/textarea
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying((p) => !p);
      } else if (e.key === 'd' || e.key === 'D') {
        setDamageMapActive((p) => !p);
      } else if (e.key === 'g' || e.key === 'G') {
        setGridActive((p) => !p);
      } else if (e.key === 'v' || e.key === 'V') {
        setVectorsActive((p) => !p);
      } else if (e.key === 'e' || e.key === 'E') {
        setEventsOpen((p) => !p);
      } else if (e.key === 'i' || e.key === 'I') {
        setInspectorOpen((p) => !p);
      } else if (e.key === 'k' || e.key === 'K') {
        triggerImpactShake('heavy');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [triggerImpactShake]);

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${String(mins).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleSeek = (secs: number) => {
    setCurrentTimeSec(Math.round(secs));
  };

  const handleEventClick = (event: MatchEvent) => {
    setCurrentTimeSec(event.timeSec);
    triggerImpactShake(event.critical ? 'heavy' : 'normal');
  };

  return (
    <div className="w-screen h-screen flex flex-col bg-[#f8fafc] text-neutral-900 overflow-hidden font-sans">
      {/* 1. MINIMAL HEADER NAVIGATION */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenPromptModal={() => setIsEditBotModalOpen(true)}
        aspectLock={aspectLock}
        setAspectLock={setAspectLock}
      />

      {/* 2. MAIN BATTLEGROUND & DESKTOP STAGE */}
      <main className="flex-1 w-full relative overflow-hidden flex items-center justify-center p-2 sm:p-4">
        {/* Aspect Ratio Container: 16:9 or Flexible Responsive Container */}
        <div
          id="arena-stage-container"
          className={`relative w-full h-full bg-white rounded-2xl border border-neutral-200/90 shadow-[0_8px_30px_rgba(0,0,0,0.04)] overflow-hidden flex flex-col transition-shadow ${
            aspectLock ? 'max-w-[1440px] max-h-[810px] aspect-video mx-auto my-auto' : ''
          } ${
            isImpactShaking
              ? shakeIntensity === 'heavy'
                ? 'animate-impact-shake-heavy ring-1 ring-red-500/30 shadow-[0_12px_35px_rgba(220,38,38,0.14)]'
                : 'animate-impact-shake ring-1 ring-amber-500/25 shadow-[0_10px_30px_rgba(245,158,11,0.09)]'
              : ''
          }`}
        >
          {/* TOP HUD: Floating inside the arena boundary */}
          <div className="absolute top-0 left-0 right-0 z-20 pointer-events-none">
            <TopHud
              botA={botA}
              botB={botB}
              currentTimeStr={formatTime(currentTimeSec)}
              roundNumber={1}
              isLive={isPlaying}
            />
          </div>

          {/* LEFT SIDE PANEL — BOT INSPECTOR */}
          {inspectorOpen && (
            <div className="absolute top-[116px] left-6 z-20 animate-in fade-in slide-in-from-left-4 duration-200 pointer-events-none">
              <LeftBotInspector
                bot={botA}
                onOpenInspect={() => setIsInspectModalOpen(true)}
                onOpenEditBot={() => setIsEditBotModalOpen(true)}
                selectedModuleId={selectedTriangle?.id}
              />
            </div>
          )}

          {/* RIGHT SIDE PANEL — MATCH EVENTS */}
          {eventsOpen && (
            <div className="absolute top-[116px] right-6 z-20 animate-in fade-in slide-in-from-right-4 duration-200 pointer-events-none">
              <RightMatchEvents
                events={MATCH_EVENTS}
                damageMapActive={damageMapActive}
                onToggleDamageMap={() => setDamageMapActive(!damageMapActive)}
                onEventClick={handleEventClick}
              />
            </div>
          )}

          {/* CENTER — BATTLE ARENA (65-70% of screen) */}
          <div className="flex-1 w-full h-full relative">
            <BattleArena
              botA={botA}
              botB={botB}
              currentTimeSec={currentTimeSec}
              isPlaying={isPlaying}
              damageMapActive={damageMapActive}
              gridActive={gridActive}
              vectorsActive={vectorsActive}
              onSelectTriangle={(cell) => {
                setSelectedTriangle(cell);
                if (cell) {
                  // If double click or selected, allow inspecting
                }
              }}
              selectedTriangleId={selectedTriangle?.id || null}
              onTriggerImpact={triggerImpactShake}
              isImpactShaking={isImpactShaking}
            />
          </div>

          {/* QUICK FLOATING ARENA CONTROLS OVERLAY (BOTTOM LEFT) */}
          <div className="absolute bottom-4 left-6 z-10 hidden sm:flex items-center gap-2 bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-neutral-200/80 shadow-xs text-[11px] font-mono text-neutral-500 pointer-events-auto">
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 rounded bg-neutral-100 border border-neutral-200 text-[10px]">Space</kbd> Play
            </span>
            <span className="text-neutral-300">•</span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 rounded bg-neutral-100 border border-neutral-200 text-[10px]">D</kbd> Damage Map
            </span>
            <span className="text-neutral-300">•</span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 rounded bg-neutral-100 border border-neutral-200 text-[10px]">V</kbd> Vectors
            </span>
            <span className="text-neutral-300">•</span>
            <button
              type="button"
              onClick={() => triggerImpactShake('heavy')}
              className="flex items-center gap-1 hover:text-red-600 transition-colors cursor-pointer group"
              title="Test kinetic impact collision shake"
            >
              <kbd className="px-1 py-0.5 rounded bg-neutral-100 group-hover:bg-red-50 border border-neutral-200 group-hover:border-red-200 text-[10px] text-neutral-600 group-hover:text-red-600 font-bold">K</kbd>
              <span className="font-sans">Impact Shake</span>
            </button>
          </div>

          {/* BOT LEGEND INDICATOR (BOTTOM RIGHT) */}
          <div className="absolute bottom-4 right-6 z-10 hidden sm:flex items-center gap-4 bg-white/90 backdrop-blur-md px-3.5 py-1.5 rounded-xl border border-neutral-200/80 shadow-xs text-[11px] font-mono text-neutral-600 pointer-events-auto">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-red-600 border border-red-800" />
              <span>Hammer</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs border border-orange-500 bg-white" />
              <span>Scissor</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs border border-dashed border-amber-600 bg-amber-50" />
              <span>Paper</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs border border-dashed border-neutral-400 bg-neutral-100" />
              <span>Motor</span>
            </div>
          </div>
        </div>
      </main>

      {/* 3. BOTTOM REPLAY BAR */}
      <BottomReplayBar
        isPlaying={isPlaying}
        onTogglePlay={() => setIsPlaying(!isPlaying)}
        currentTimeSec={currentTimeSec}
        totalTimeSec={totalTimeSec}
        onSeek={handleSeek}
        speed={speed}
        onSpeedChange={setSpeed}
        damageMapActive={damageMapActive}
        onToggleDamageMap={() => setDamageMapActive(!damageMapActive)}
        eventsOpen={eventsOpen}
        onToggleEvents={() => setEventsOpen(!eventsOpen)}
        inspectorOpen={inspectorOpen}
        onToggleInspector={() => setInspectorOpen(!inspectorOpen)}
        events={MATCH_EVENTS}
        gridActive={gridActive}
        onToggleGrid={() => setGridActive(!gridActive)}
        vectorsActive={vectorsActive}
        onToggleVectors={() => setVectorsActive(!vectorsActive)}
      />

      {/* 4. MODALS */}
      <EditBotModal
        isOpen={isEditBotModalOpen}
        onClose={() => setIsEditBotModalOpen(false)}
        bot={botA}
        onSaveBot={(updated) => setBotA(updated)}
      />

      <InspectModuleModal
        isOpen={isInspectModalOpen}
        onClose={() => setIsInspectModalOpen(false)}
        selectedTriangle={selectedTriangle}
        botA={botA}
        botB={botB}
      />
    </div>
  );
}
