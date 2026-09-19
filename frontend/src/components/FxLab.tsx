import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SAMPLE_BOTS } from '@promptchien/core';
import type { VfxEvent } from '@promptchien/contracts';
import { BattleArena } from './BattleArena';
import { ReplayView } from '../lab/replay';
import { runAdHoc, ruleset } from '../lab/lab';
import { FX, FX_DEFAULTS, FX_RANGES, resetFx, type FxSettings } from '../lab/palette';
import { settingsFor, tierForFps, type QualitySettings, type QualityTier } from '../lab/quality';
import { usePlayback } from '../lab/useLab';

/**
 * `/dev/fx` - the effect tuning bench (ky_thuat_my_thuat.md 6).
 *
 * WHY IT REUSES THE REAL ARENA
 * ----------------------------
 * The obvious implementation is a toy stage that fires synthetic particles. That
 * would be a second renderer, and a second renderer drifts: you tune a number on
 * the bench, it looks right, and the match still looks wrong. So this page runs a
 * REAL match through the REAL `BattleArena` and gives you tools to get to the
 * interesting frames fast.
 *
 * "Fire a test event" therefore becomes "jump to the next real event of kind X",
 * which is strictly more useful: you are looking at real damage numbers, real
 * impact multipliers and real contact normals, not placeholders.
 *
 * Every constant is a live slider. Nothing is persisted, so a refresh restores
 * the shipped defaults; the reset button does it without a reload.
 */
export interface FxLabProps {
  onExit: () => void;
}

const EVENT_KINDS: Array<{ kind: VfxEvent['kind']; label: string }> = [
  { kind: 'hit', label: 'cú đánh' },
  { kind: 'destroy', label: 'ô vỡ' },
  { kind: 'detach', label: 'đứt lìa' },
  { kind: 'motorLost', label: 'mất Motor' },
  { kind: 'overload', label: 'quá tải' },
  { kind: 'coreHit', label: 'lõi trúng đòn' },
  { kind: 'coreDestroyed', label: 'lõi vỡ' },
  { kind: 'ringStart', label: 'vòng bắt đầu thu' },
  { kind: 'ringEnter', label: 'lõi ra ngoài vòng' },
  { kind: 'ringExit', label: 'lõi quay vào' },
  { kind: 'brainViolation', label: 'não vi phạm' },
  { kind: 'matchEnd', label: 'kết thúc' },
];

export const FxLab: React.FC<FxLabProps> = ({ onExit }) => {
  const [seed, setSeed] = useState(7);
  const [reloadKey, setReloadKey] = useState(0);
  const [tierOverride, setTierOverride] = useState<'auto' | QualityTier>('auto');
  const [measuredFps, setMeasuredFps] = useState(60);
  const [frameMs, setFrameMs] = useState(0);
  const [tick, setTick] = useState(0);
  const [fxRev, setFxRev] = useState(0);

  const session = useMemo(() => {
    const a = SAMPLE_BOTS[0]!;
    const b = SAMPLE_BOTS[2]!;
    const o = runAdHoc(
      { ...a, triangles: a.triangles.map((t) => ({ ...t })) },
      { ...b, triangles: b.triangles.map((t) => ({ ...t })) },
      seed,
    );
    return { outcome: o, view: new ReplayView(o.replay, o.match.a.definition, o.match.b.definition, ruleset) };
  }, [seed, reloadKey]);

  const playback = usePlayback(session.view);
  const frame = useMemo(
    () => (session.view ? session.view.frameAt(playback.tickFloat) : null),
    [session.view, playback.tickFloat],
  );

  useEffect(() => setTick(frame?.tick ?? 0), [frame]);

  // ---- frame time ---------------------------------------------------------
  const frames = useRef(0);
  const windowStart = useRef(performance.now());
  const lastFrame = useRef(performance.now());
  useEffect(() => {
    let raf = 0;
    const loop = (now: number) => {
      frames.current++;
      const dt = now - lastFrame.current;
      lastFrame.current = now;
      setFrameMs((prev) => prev * 0.9 + dt * 0.1);
      const elapsed = now - windowStart.current;
      if (elapsed >= 1000) {
        const fps = (frames.current * 1000) / elapsed;
        setMeasuredFps(fps);
        frames.current = 0;
        windowStart.current = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const tier: QualityTier = tierOverride === 'auto' ? tierForFps(measuredFps) : tierOverride;
  const quality: QualitySettings = useMemo(() => settingsFor(tier, playback.speed), [tier, playback.speed]);

  // ---- jump to the next event of a kind -----------------------------------
  const events = session.view?.replay.events ?? [];
  const jumpTo = useCallback(
    (kind: VfxEvent['kind']) => {
      const from = Math.floor(playback.tickFloat);
      const next = events.find((e) => e.kind === kind && e.tick > from) ?? events.find((e) => e.kind === kind);
      if (!next) return;
      playback.setPlaying(false);
      playback.seekTick(Math.max(0, next.tick - 2));
    },
    [events, playback],
  );

  const kindCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of events) m.set(e.kind, (m.get(e.kind) ?? 0) + 1);
    return m;
  }, [events]);

  const setFx = (key: keyof FxSettings, value: number) => {
    FX[key] = value;
    setFxRev((r) => r + 1);
  };
  void fxRev;

  if (!session.view) return null;
  const view = session.view;

  return (
    <div className="w-screen h-screen flex flex-col bg-[#f8fafc] text-neutral-900 overflow-hidden font-sans">
      <header className="w-full bg-neutral-900 text-white px-5 py-2.5 flex items-center justify-between z-30 select-none">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold font-mono">/dev/fx</span>
          <span className="text-[11px] font-mono text-neutral-400">
            sân chỉnh hiệu ứng — chỉ dùng khi phát triển
          </span>
        </div>
        <div className="flex items-center gap-3 text-[11px] font-mono">
          <span className={frameMs > 16.6 ? 'text-amber-400' : 'text-emerald-400'}>
            {frameMs.toFixed(1)} ms/khung · {measuredFps.toFixed(0)} fps
          </span>
          <span className="text-neutral-500">|</span>
          <span>bậc {tier}</span>
          <button onClick={onExit} className="px-3 py-1 rounded bg-white text-neutral-900 font-semibold">
            về game
          </button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        <div className="flex-1 relative bg-white">
          <BattleArena
            view={view}
            frame={frame}
            tickFloat={playback.tickFloat}
            isPlaying={playback.playing}
            damageMapActive={false}
            gridActive={true}
            vectorsActive={false}
            selected={null}
            onSelect={() => undefined}
            quality={quality}
          />
        </div>

        <aside className="w-[340px] border-l border-neutral-200 bg-white overflow-y-auto p-3 flex flex-col gap-4">
          {/* ---- transport ---- */}
          <section>
            <H label="CHẠY" />
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              <button onClick={() => playback.setPlaying(!playback.playing)} className={BTN}>
                {playback.playing ? 'dừng' : 'chạy'}
              </button>
              <button onClick={() => playback.stepTick(-30)} className={BTN}>
                −30
              </button>
              <button onClick={() => playback.stepTick(-1)} className={BTN}>
                −1 nhịp
              </button>
              <button onClick={() => playback.stepTick(1)} className={BTN}>
                +1 nhịp
              </button>
              <button onClick={() => playback.stepTick(30)} className={BTN}>
                +30
              </button>
              {[0.5, 1, 2, 4].map((s) => (
                <button
                  key={s}
                  onClick={() => playback.setSpeed(s)}
                  className={`${BTN} ${playback.speed === s ? 'bg-neutral-900 text-white' : ''}`}
                >
                  {s}×
                </button>
              ))}
            </div>
            <p className="text-[10px] font-mono text-neutral-400 mt-1">
              nhịp {tick} / {view.totalTicks} · {(playback.tickFloat / view.tickRate).toFixed(2)}s
            </p>
          </section>

          {/* ---- jump to a real event ---- */}
          <section>
            <H label="NHẢY TỚI SỰ KIỆN THẬT TIẾP THEO" />
            <div className="grid grid-cols-2 gap-1.5 mt-1.5">
              {EVENT_KINDS.map(({ kind, label }) => (
                <button
                  key={kind}
                  onClick={() => jumpTo(kind)}
                  disabled={(kindCounts.get(kind) ?? 0) === 0}
                  className={`${BTN} justify-between disabled:opacity-35`}
                  title={`${kindCounts.get(kind) ?? 0} lần trong trận này`}
                >
                  <span className="truncate">{label}</span>
                  <span className="text-[9px] text-neutral-400">{kindCounts.get(kind) ?? 0}</span>
                </button>
              ))}
            </div>
          </section>

          {/* ---- seed ---- */}
          <section>
            <H label="SEED" />
            <div className="flex items-center gap-1.5 mt-1.5">
              <input
                type="number"
                value={seed}
                onChange={(e) => setSeed(Number(e.target.value))}
                className="w-24 text-[11px] font-mono rounded border border-neutral-200 px-1.5 py-1"
              />
              <button onClick={() => setReloadKey((k) => k + 1)} className={BTN}>
                chạy lại
              </button>
              <button
                onClick={() => setSeed((s) => (s * 7 + 13) % 100000)}
                className={BTN}
                title="Đi sang seed kế tiếp. Cố ý đi tuần tự chứ không ngẫu nhiên: như vậy mới quay lại được seed cũ, và toàn bộ mã nguồn vẫn sạch Math.random."
              >
                seed khác
              </button>
            </div>
          </section>

          {/* ---- quality override ---- */}
          <section>
            <H label="BẬC CHẤT LƯỢNG" />
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              {(['auto', 'high', 'medium', 'low', 'minimal'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTierOverride(t)}
                  className={`${BTN} ${tierOverride === t ? 'bg-neutral-900 text-white' : ''}`}
                >
                  {t}
                </button>
              ))}
            </div>
            <p className="text-[10px] font-mono text-neutral-400 mt-1">
              hạt {quality.maxParticles} · vệt lao {quality.trail ? 'bật' : 'tắt'} · dao động{' '}
              {quality.wobble ? 'bật' : 'tắt'}
            </p>
          </section>

          {/* ---- constants ---- */}
          <section>
            <div className="flex items-center justify-between">
              <H label="HẰNG SỐ HIỆU ỨNG" />
              <button onClick={() => { resetFx(); setFxRev((r) => r + 1); }} className="text-[10px] font-mono text-neutral-500 hover:text-neutral-900 border border-neutral-200 rounded px-1">
                khôi phục gốc
              </button>
            </div>
            <div className="flex flex-col gap-2.5 mt-2">
              {(Object.keys(FX_RANGES) as Array<keyof FxSettings>).map((key) => {
                const range = FX_RANGES[key];
                const changed = FX[key] !== FX_DEFAULTS[key];
                return (
                  <label key={key} className="flex flex-col gap-0.5">
                    <span className="flex items-center justify-between text-[10px] font-mono">
                      <span className={changed ? 'text-amber-700 font-bold' : 'text-neutral-500'}>{range.label}</span>
                      <span className="text-neutral-800 font-semibold">{FX[key]}</span>
                    </span>
                    <input
                      type="range"
                      min={range.min}
                      max={range.max}
                      step={range.step}
                      value={FX[key]}
                      onChange={(e) => setFx(key, Number(e.target.value))}
                      className="w-full accent-neutral-900"
                    />
                  </label>
                );
              })}
            </div>
          </section>

          <p className="text-[10px] text-neutral-400 leading-relaxed border-t border-neutral-100 pt-2">
            Mọi hằng số ở đây nằm trong <code className="font-mono">src/lab/palette.ts</code>, không rải rác trong mã vẽ.
            Chỉnh xong thì chép số vào đó rồi bấm “khôi phục gốc” — trang này không lưu lại gì.
          </p>
        </aside>
      </main>
    </div>
  );
};

const BTN =
  'px-2 py-1 rounded border border-neutral-200 bg-white text-[10px] font-mono text-neutral-700 hover:border-neutral-500 flex items-center gap-1';

const H: React.FC<{ label: string }> = ({ label }) => (
  <div className="text-[10px] font-bold font-mono tracking-wide text-neutral-700">{label}</div>
);
