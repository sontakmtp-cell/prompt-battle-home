import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { BotDefinition, Ruleset, Team } from '@promptchien/contracts';
import { rotateOffset } from '@promptchien/core';
import { labStore, type LabState } from './store.js';
import { ReplayView, type BotView, type FrameView, type TileView } from './replay.js';
import { runAdHoc, runNextQueuedMatch, validateAndLock, ruleset, type RunOutcome } from './lab.js';

/** Subscribe a component to the local lab store. */
export function useLabState(): LabState {
  return useSyncExternalStore(labStore.subscribe, labStore.getState, labStore.getState);
}

export interface MatchSession {
  outcome: RunOutcome | null;
  view: ReplayView | null;
  running: boolean;
  error: string | null;
  run: (a: BotDefinition, b: BotDefinition, seed: number) => void;
  runQueued: () => void;
}

/**
 * Holds the one match currently on screen.
 *
 * The engine is synchronous and a 120-second match takes well under a second to
 * compute, but it is still a chunk of work, so it is deferred by a frame to let
 * the UI show a "running" state instead of freezing mid-click.
 */
export function useMatchSession(): MatchSession {
  const [outcome, setOutcome] = useState<RunOutcome | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const viewRef = useRef<ReplayView | null>(null);
  const [view, setView] = useState<ReplayView | null>(null);

  const finish = useCallback((o: RunOutcome) => {
    const v = new ReplayView(o.replay, o.match.a.definition, o.match.b.definition, ruleset);
    viewRef.current = v;
    setView(v);
    setOutcome(o);
    setRunning(false);
  }, []);

  const run = useCallback(
    (a: BotDefinition, b: BotDefinition, seed: number) => {
      setRunning(true);
      setError(null);
      window.setTimeout(() => {
        try {
          finish(runAdHoc(a, b, seed));
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
          setRunning(false);
        }
      }, 0);
    },
    [finish],
  );

  const runQueued = useCallback(() => {
    setRunning(true);
    setError(null);
    window.setTimeout(() => {
      try {
        const o = runNextQueuedMatch();
        if (!o) {
          setError('Cần ít nhất hai bot khác nhau đang chờ trong hàng.');
          setRunning(false);
          return;
        }
        finish(o);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setRunning(false);
      }
    }, 0);
  }, [finish]);

  return { outcome, view, running, error, run, runQueued };
}

export interface Playback {
  tickFloat: number;
  playing: boolean;
  speed: number;
  setPlaying: (p: boolean) => void;
  setSpeed: (s: number) => void;
  seekSec: (sec: number) => void;
  seekTick: (tick: number) => void;
  stepTick: (delta: number) => void;
  reset: () => void;
}

/**
 * The replay clock.
 *
 * Advances in ticks, not seconds, and interpolates inside `ReplayView` - the
 * simulation ticks at a fixed 30 Hz (gameplay.md 5.1) while the screen runs
 * faster, so drawing straight at tick boundaries would visibly stutter.
 */
export function usePlayback(view: ReplayView | null): Playback {
  const [tickFloat, setTickFloat] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number>(0);

  const total = view?.totalTicks ?? 0;
  const rate = view?.tickRate ?? 30;

  useEffect(() => {
    if (!view) {
      setTickFloat(0);
      setPlaying(false);
      return;
    }
    setTickFloat(0);
    setPlaying(true);
  }, [view]);

  useEffect(() => {
    if (!playing || !view) {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }
    lastRef.current = performance.now();
    const loop = (now: number) => {
      const dtSec = Math.min((now - lastRef.current) / 1000, 0.25);
      lastRef.current = now;
      setTickFloat((prev) => {
        const next = prev + dtSec * rate * speed;
        if (next >= total) {
          setPlaying(false);
          return Math.max(0, total - 1);
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [playing, view, speed, rate, total]);

  const seekSec = useCallback(
    (sec: number) => setTickFloat(Math.max(0, Math.min(sec * rate, total - 1))),
    [rate, total],
  );
  const seekTick = useCallback(
    (tick: number) => setTickFloat(Math.max(0, Math.min(tick, total - 1))),
    [total],
  );
  const stepTick = useCallback(
    (delta: number) => setTickFloat((p) => Math.max(0, Math.min(p + delta, total - 1))),
    [total],
  );
  const reset = useCallback(() => setTickFloat(0), []);

  return {
    tickFloat,
    playing,
    speed,
    setPlaying,
    setSpeed,
    seekSec,
    seekTick,
    stepTick,
    reset,
  };
}

// ---------------------------------------------------------------------------
// Geometry helpers shared by the arena and the editor
// ---------------------------------------------------------------------------

export interface ProjectedTileRaw {
  index: number;
  type: TileView['type'];
  verts: Array<[number, number]>;
  silhouette: Array<[number, number]>;
  cx: number;
  cy: number;
  alive: boolean;
  isCore: boolean;
  hpRatioMilli: number;
  damageReceived: number;
}

/**
 * Project one tile into SVG space.
 *
 * The wobble (3.3) is a pure draw-time displacement: the collision hull, the
 * damage and the score all still use the exact lattice geometry. Nothing here
 * feeds back into the simulation (1.1).
 *
 * Vertices are returned as coordinate pairs rather than a formatted string so the
 * caller can merge many tiles into a single path (see lab/arenaGeometry.ts).
 */
export function projectTile(
  bot: BotView,
  tile: TileView,
  scale: number,
  opts: {
    timeSec: number;
    seed: number;
    wobble: number;
    breath: number;
    squash: { amount: number; nx: number; ny: number } | null;
  },
): ProjectedTileRaw {
  const g = bot.geometry.tris[tile.index]!;
  const phase = fxPhase(opts.seed, tile.index);
  const freq = opts.wobble;
  const amp = 35; // milli-units, ~3.5% of a tile edge
  const verts: Array<[number, number]> = [];

  // Centroid in world, then in SVG.
  const wc = rotateOffset(g.localCentroid.x, g.localCentroid.y, bot.heading);
  const ccx = bot.x + wc.x;
  const ccy = bot.y + wc.y;
  const cx = 500 + ccx * scale;
  const cy = 500 + ccy * scale;

  const breathK = 1 + opts.breath;

  for (const v of g.localVerts) {
    let lx = v.x;
    let ly = v.y;
    // breathing about the tile centroid (3.5)
    lx = g.localCentroid.x + (lx - g.localCentroid.x) * breathK;
    ly = g.localCentroid.y + (ly - g.localCentroid.y) * breathK;

    // Apex wobble, phase-locked per tile so it is identical on every rewatch.
    const wob = Math.sin(opts.timeSec * freq * Math.PI * 2 + phase);
    const wob2 = Math.cos(opts.timeSec * freq * Math.PI * 2 * 0.7 + phase * 1.3);
    lx += wob * amp;
    ly += wob2 * amp;

    const w = rotateOffset(Math.round(lx), Math.round(ly), bot.heading);
    let wx = bot.x + w.x;
    let wy = bot.y + w.y;

    // Contact compression along the impact normal (3.4).
    if (opts.squash) {
      const dx = wx - ccx;
      const dy = wy - ccy;
      const along = (dx * opts.squash.nx + dy * opts.squash.ny) / 1000;
      const k = 1 - opts.squash.amount * (along > 0 ? 1 : -1) * 0.5;
      wx = ccx + dx * k;
      wy = ccy + dy * k;
    }

    verts.push([500 + wx * scale, 500 + wy * scale]);
  }

  // Silhouette: the same triangle grown outward from its centroid.
  const grow = 2.5;
  const silhouette = verts.map(([sx, sy]) => {
    const dx = sx - cx;
    const dy = sy - cy;
    const len = Math.hypot(dx, dy) || 1;
    return [sx + (dx / len) * grow, sy + (dy / len) * grow] as [number, number];
  });

  return {
    index: tile.index,
    type: tile.type,
    verts,
    silhouette,
    cx,
    cy,
    alive: tile.alive,
    isCore: tile.isCore,
    hpRatioMilli: tile.hpRatioMilli,
    damageReceived: tile.damageReceived,
  };
}

/** Stable per-tile phase, derived from the match seed rather than Math.random. */
function fxPhase(seed: number, index: number): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (index + 0x85ebca6b), 0x27d4eb2d) >>> 0;
  h ^= h >>> 13;
  return ((h >>> 0) / 4294967296) * Math.PI * 2;
}

/** Arc path for the Core's HP ring (4.5). */
export function arcPath(cx: number, cy: number, r: number, fromFrac: number, toFrac: number): string {
  const a0 = fromFrac * Math.PI * 2 - Math.PI / 2;
  const a1 = toFrac * Math.PI * 2 - Math.PI / 2;
  const x0 = cx + r * Math.cos(a0);
  const y0 = cy + r * Math.sin(a0);
  const x1 = cx + r * Math.cos(a1);
  const y1 = cy + r * Math.sin(a1);
  const large = toFrac - fromFrac > 0.5 ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

export type { BotView, FrameView, TileView };
export type { Team, Ruleset };
