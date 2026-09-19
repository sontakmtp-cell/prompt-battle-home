import React, { useMemo, useRef, useState } from 'react';
import { rotateOffset } from '@promptchien/core';
import { ReplayView, type BotView, type FrameView } from '../lab/replay';
import {
  ARENA,
  ARENA_VIEWBOX,
  CORE_BADGE,
  CRACK_BELOW_MILLI,
  CRACK_STRONG_BELOW_MILLI,
  DETACHED_FILL,
  DETACHED_STROKE,
  FX,
  PAPER_DOT,
  RING_ANNOUNCE_ALPHA,
  RING_COLOR,
  RING_SHADE_DEEPEN_BELOW_MILLI,
  RING_SHADE_MAX,
  RING_SHADE_MIN,
  SILHOUETTE,
  SPARK,
  fxRandom,
  tileSkin,
  worldScale,
} from '../lab/palette';
import {
  batchSilhouette,
  batchTiles,
  hitTest,
  toPoints,
  type ProjectedTile,
} from '../lab/arenaGeometry';
import type { QualitySettings } from '../lab/quality';
import { arcPath, projectTile } from '../lab/useLab';
import type { TileRef } from '../lab/battleTypes';

export type { TileRef };

interface BattleArenaProps {
  view: ReplayView | null;
  frame: FrameView | null;
  tickFloat: number;
  isPlaying: boolean;
  damageMapActive: boolean;
  gridActive: boolean;
  vectorsActive: boolean;
  selected: TileRef | null;
  onSelect: (ref: TileRef | null) => void;
  quality: QualitySettings;
}

/**
 * The arena.
 *
 * Everything drawn here comes from a `ReplayView`, which comes from a real replay
 * produced by the engine. There are no hard-coded coordinates, no mock tiles, and
 * no `Math.random()` - ky_thuat_my_thuat.md 1 requires that watching a replay
 * twice looks identical, sparks included, and that nothing on the drawing path can
 * ever influence the simulation.
 *
 * Draw calls are BATCHED (5.2 rule 1): tiles are merged into one path per
 * (team, type, HP-band), so a 60-tile body and a 6-tile body cost the same. That
 * is also why pointer handling is mathematical hit-testing rather than a handler
 * per tile - a merged path has no per-tile identity to attach one to.
 */
export const BattleArena: React.FC<BattleArenaProps> = ({
  view,
  frame,
  tickFloat,
  isPlaying,
  damageMapActive,
  gridActive,
  vectorsActive,
  selected,
  onSelect,
  quality,
}) => {
  const [hover, setHover] = useState<TileRef | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  /** latest projected tiles, so the pointer handler can hit-test without re-rendering */
  const projectedRef = useRef<{ a: ProjectedTile[]; b: ProjectedTile[] }>({ a: [], b: [] });
  /** rolling trail buffer, advanced once per simulated tick rather than per frame */
  const trailRef = useRef<{ a: string[]; b: string[]; tick: number }>({ a: [], b: [], tick: -1 });

  const scale = view ? worldScale(view.rs.ARENA_HALF) : 0.025;
  const timeSec = view ? tickFloat / view.tickRate : 0;
  const seed = view ? view.replay.manifest.seed : 0;

  const bots = useMemo(() => {
    if (!view || !frame) return null;

    const build = (bot: BotView) => {
      const load = bot.effectiveLoadMilli / 1000;
      // 3.7: the heavier the load, the slower and shallower the breathing.
      const breathAmp = quality.breath ? FX.BREATH_AMPLITUDE * (load > 2 ? 2.2 : load > 1 ? 1.4 : 1) : 0;
      const breathFreq = FX.BREATH_FREQ * (load > 2 ? 0.5 : load > 1 ? 0.75 : 1);
      const hurt = 1 - bot.coreRatioMilli / 1000;
      const wobble = quality.wobble
        ? FX.WOBBLE_FREQ_HEALTHY + (FX.WOBBLE_FREQ_HURT - FX.WOBBLE_FREQ_HEALTHY) * hurt
        : 0;
      const breath = Math.sin(timeSec * breathFreq * Math.PI * 2) * breathAmp;
      const squash = quality.squash ? squashAt(view, bot.team, frame.tick) : null;
      const tiles: ProjectedTile[] = [];
      for (const t of bot.tiles) {
        if (!t.alive) continue;
        tiles.push(projectTile(bot, t, scale, { timeSec, seed, wobble, breath, squash }) as ProjectedTile);
      }
      return { bot, tiles };
    };
    return { a: build(frame.a), b: build(frame.b) };
  }, [view, frame, scale, timeSec, seed, quality]);

  if (bots) projectedRef.current = { a: bots.a.tiles, b: bots.b.tiles };

  const damage = useMemo(
    () => (view && frame && damageMapActive ? view.damageMapAt(frame.tick) : null),
    [view, frame, damageMapActive],
  );

  /** Merged fill paths: at most 2 teams x 4 types x 5 bands, never one per tile. */
  const shapes = useMemo(() => {
    if (!bots) return [];
    const empty: number[] = [];
    return [
      ...batchTiles(bots.a.tiles, 'A', damageMapActive, damage?.a ?? empty, damage?.peak ?? 0),
      ...batchTiles(bots.b.tiles, 'B', damageMapActive, damage?.b ?? empty, damage?.peak ?? 0),
    ];
  }, [bots, damageMapActive, damage]);

  const silhouettes = useMemo(
    () =>
      bots
        ? [
            { team: 'A' as const, d: batchSilhouette(bots.a.tiles) },
            { team: 'B' as const, d: batchSilhouette(bots.b.tiles) },
          ]
        : [],
    [bots],
  );

  // ---- 3.6 trail ----------------------------------------------------------
  // A rolling buffer of silhouette paths, advanced once per simulated tick. The
  // doc forbids redrawing the body N times per frame; because the silhouette is
  // already one merged path, keeping three ghosts costs three elements and three
  // re-projections per tick, not per frame.
  if (view && bots && frame && quality.trail && trailRef.current.tick !== frame.tick) {
    const ghosts = quality.trailGhosts;
    const push = (prev: string[], d: string): string[] =>
      d ? [...prev, d].slice(-ghosts) : prev;
    const fastA = isMovingFast(view, 'A', frame.tick);
    const fastB = isMovingFast(view, 'B', frame.tick);
    trailRef.current = {
      tick: frame.tick,
      a: fastA ? push(trailRef.current.a, silhouettes[0]?.d ?? '') : [],
      b: fastB ? push(trailRef.current.b, silhouettes[1]?.d ?? '') : [],
    };
  }
  if (!quality.trail && trailRef.current.tick !== -1) {
    trailRef.current = { a: [], b: [], tick: -1 };
  }

  /** Sparks for hits in the last ~0.45 s, all derived from the match seed. */
  const sparks = useMemo(() => {
    if (!view || !frame || quality.maxParticles === 0) return [];
    const out: Array<{ id: string; x: number; y: number; dx: number; dy: number; r: number; alpha: number; color: string }> = [];
    for (const e of view.eventsInRange(frame.tick - 14, frame.tick)) {
      if (e.kind !== 'hit') continue;
      const life = 1 - (frame.tick - e.tick) / 14;
      if (life <= 0) continue;
      const count = e.advantage === 'adv' ? 8 : e.advantage === 'neutral' ? 3 : 2;
      // 3.4: a dead-on hit throws a tight beam, a glancing one sprays wide.
      const spread = 0.6 + (1 - e.orientMul / 1000) * 4;
      const baseAngle = Math.atan2(e.normal.y, e.normal.x);
      for (let k = 0; k < count; k++) {
        const r1 = fxRandom(seed, e.tick, k, 1);
        const r2 = fxRandom(seed, e.tick, k, 2);
        const r3 = fxRandom(seed, e.tick, k, 3);
        const ang = baseAngle + (r1 - 0.5) * spread;
        const speed = 18 + r2 * 60;
        out.push({
          id: `${e.tick}-${e.defender}-${k}`,
          x: 500 + e.at.x * scale,
          y: 500 + e.at.y * scale,
          dx: Math.cos(ang) * speed * life,
          dy: Math.sin(ang) * speed * life,
          r: 1.1 + r3 * 1.6,
          alpha: life,
          color: e.advantage === 'adv' ? SPARK.adv : e.advantage === 'neutral' ? SPARK.neutral : SPARK.disadv,
        });
      }
    }
    // 5.2 rule 5: over the cap, retire the OLDEST spark, never the newest - the
    // newest is the one the eye is on.
    return out.length > quality.maxParticles ? out.slice(-quality.maxParticles) : out;
  }, [view, frame, seed, scale, quality.maxParticles]);

  /**
   * 4.8 - a detached cluster is frozen at its world position at the instant it
   * broke and drifts outward. It must NOT keep following the body, otherwise the
   * viewer reads it as still attached.
   */
  const ghosts = useMemo(() => {
    if (!view || !frame) return [];
    const fadeTicks = Math.max(1, Math.round(FX.DETACH_FADE_SEC * view.tickRate));
    const out: Array<{ key: string; points: string; alpha: number }> = [];
    for (const e of view.eventsInRange(frame.tick - fadeTicks, frame.tick)) {
      if (e.kind !== 'detach') continue;
      const age = frame.tick - e.tick;
      const alpha = Math.max(0, 1 - age / fadeTicks);
      if (alpha <= 0) continue;
      const bot = e.team === 'A' ? frame.a : frame.b;
      const pose = view.poseAt(e.team, e.tick);
      const drift = Math.trunc((FX.DETACH_DRIFT_MILLI_PER_SEC * age) / view.tickRate);
      for (const i of e.tris) {
        const g = bot.geometry.tris[i];
        if (!g) continue;
        const pts: string[] = [];
        for (const v of g.localVerts) {
          const r = rotateOffset(v.x, v.y, pose.heading);
          let wx = pose.x + r.x;
          let wy = pose.y + r.y;
          const len = Math.hypot(wx - pose.x, wy - pose.y) || 1;
          wx += ((wx - pose.x) / len) * drift;
          wy += ((wy - pose.y) / len) * drift;
          pts.push(`${(500 + wx * scale).toFixed(1)},${(500 + wy * scale).toFixed(1)}`);
        }
        out.push({ key: `${e.tick}-${i}`, points: pts.join(' '), alpha });
      }
    }
    return out;
  }, [view, frame, scale]);

  if (!view || !frame || !bots) {
    return (
      <div className="relative w-full h-full bg-white flex items-center justify-center">
        <p className="text-sm text-neutral-400 font-mono">chưa có trận nào — bấm “Chạy trận”</p>
      </div>
    );
  }

  const ringSvgR = frame.ringRadiusMilli * scale;
  const shade = frame.ringRadiusMilli < RING_SHADE_DEEPEN_BELOW_MILLI ? RING_SHADE_MAX : RING_SHADE_MIN;
  const announceAlpha = frame.ringAnnouncing
    ? RING_ANNOUNCE_ALPHA * (1 - (view.rs.RING_START_TICK - frame.tick) / view.rs.RING_ANNOUNCE_TICKS)
    : frame.ringActive
      ? RING_ANNOUNCE_ALPHA
      : 0;

  const lookup = (ref: TileRef | null) => {
    if (!ref) return null;
    const bot = ref.team === 'A' ? frame.a : frame.b;
    const tile = bot.tiles[ref.index];
    return tile ? { ref, tile, bot } : null;
  };
  const hoverInfo = lookup(hover);
  const selectedInfo = lookup(selected);

  /** Client coordinates -> arena coordinates, via the SVG's own transform. */
  const toArena = (clientX: number, clientY: number): [number, number] | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return [p.x, p.y];
  };

  const handlePointer = (clientX: number, clientY: number) => {
    const pt = toArena(clientX, clientY);
    if (!pt) return null;
    const [x, y] = pt;
    // Team A is drawn on top of team B, so it wins a tie.
    const a = hitTest(projectedRef.current.a, x, y);
    if (a !== null) return { team: 'A' as const, index: a };
    const b = hitTest(projectedRef.current.b, x, y);
    if (b !== null) return { team: 'B' as const, index: b };
    return null;
  };

  const renderCore = (bot: BotView, tiles: ProjectedTile[]) => {
    const t = tiles.find((x) => x.isCore);
    if (!t) return null;
    const r = 11;
    const frac = Math.max(0, Math.min(1, t.hpRatioMilli / 1000));
    const weak = frac < 0.3;
    const outside = bot.ringOutside;
    const color = tileSkin(bot.team, 'hammer').fill;
    const pulseDur = weak ? 0.6 : 1.6;
    const badge = CORE_BADGE[bot.team];

    // 4.3 channel 3: the badge is what survives greyscale. A solid ring for A,
    // the same ring with four arcs cut out for B.
    const notches: React.ReactNode[] = [];
    if (!badge.solid) {
      for (let i = 0; i < badge.notches; i++) {
        const a0 = (i * Math.PI) / 2 + 0.18;
        const a1 = a0 + 0.42;
        notches.push(
          <line
            key={i}
            x1={t.cx + r * Math.cos(a0)}
            y1={t.cy + r * Math.sin(a0)}
            x2={t.cx + r * Math.cos(a1)}
            y2={t.cy + r * Math.sin(a1)}
            stroke={ARENA.CORE_CENTER}
            strokeWidth="3"
          />,
        );
      }
    }

    // 4.7: a Core outside the ring gets a red flash AND a thin guide line to the
    // nearest point on the circle. The line is the part that matters - it turns
    // "you are losing HP" into "you are losing HP, go this way".
    let guide: React.ReactNode = null;
    if (outside) {
      const dx = t.cx - 500;
      const dy = t.cy - 500;
      const len = Math.hypot(dx, dy) || 1;
      guide = (
        <line
          x1={t.cx + (dx / len) * (r + 2)}
          y1={t.cy + (dy / len) * (r + 2)}
          x2={500 + (dx / len) * ringSvgR}
          y2={500 + (dy / len) * ringSvgR}
          stroke={ARENA.CORE_ALERT}
          strokeWidth="1.2"
          strokeDasharray="3 3"
          opacity="0.8"
        />
      );
    }

    return (
      <g key={`core-${bot.team}`} className="pointer-events-none">
        {guide}
        <circle cx={t.cx} cy={t.cy} r={r} fill="none" stroke={ARENA.CORE_RING_BG} strokeWidth="2.5" opacity="0.9" />
        {frac > 0 && (
          <path d={arcPath(t.cx, t.cy, r, 0, frac)} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
        )}
        {notches}
        <circle
          cx={t.cx}
          cy={t.cy}
          r={r * 0.55}
          fill={weak ? ARENA.CORE_WEAK_CENTER : ARENA.CORE_CENTER}
          stroke={color}
          strokeWidth="1.4"
          style={{ animation: `pc-pulse ${pulseDur}s ease-in-out infinite` }}
        />
        {outside && (
          <circle
            cx={t.cx}
            cy={t.cy}
            r={r + 3}
            fill="none"
            stroke={ARENA.CORE_ALERT}
            strokeWidth="1.6"
            style={{ animation: 'pc-pulse 0.5s steps(2, end) infinite' }}
          />
        )}
        {weak && !outside && (
          <circle cx={t.cx} cy={t.cy} r={r + 3} fill="none" stroke={ARENA.CORE_ALERT} strokeWidth="1" opacity="0.5" />
        )}
      </g>
    );
  };

  return (
    <div className="relative w-full h-full bg-white overflow-hidden select-none flex items-center justify-center">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${ARENA_VIEWBOX} ${ARENA_VIEWBOX}`}
        preserveAspectRatio="xMidYMid meet"
        className="w-full h-full"
        onClick={() => onSelect(null)}
        onMouseMove={(e) => {
          const hit = handlePointer(e.clientX, e.clientY);
          setHover((prev) =>
            prev && hit && prev.team === hit.team && prev.index === hit.index ? prev : hit,
          );
        }}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <pattern id="paper-dots-a" width="7" height="7" patternUnits="userSpaceOnUse">
            <rect width="7" height="7" fill={tileSkin("A", "paper").fill} />
            <circle cx="3.5" cy="3.5" r="1" fill={PAPER_DOT.A} opacity="0.7" />
          </pattern>
          <pattern id="paper-dots-b" width="7" height="7" patternUnits="userSpaceOnUse">
            <rect width="7" height="7" fill={tileSkin("B", "paper").fill} />
            <circle cx="3.5" cy="3.5" r="1" fill={PAPER_DOT.B} opacity="0.7" />
          </pattern>
          <pattern id="arena-tri-grid" width="25" height="43.301" patternUnits="userSpaceOnUse">
            <path
              d="M 0 0 L 0 43.301 M 0 0 L 25 21.65 M 25 21.65 L 0 43.301 M 25 0 L 25 43.301 M 25 0 L 50 21.65 M 50 21.65 L 25 43.301"
              fill="none"
              stroke={ARENA.GRID}
              strokeWidth="0.4"
              strokeOpacity="0.28"
            />
          </pattern>
        </defs>

        <rect width={ARENA_VIEWBOX} height={ARENA_VIEWBOX} fill={ARENA.BG} />
        {gridActive && <rect width={ARENA_VIEWBOX} height={ARENA_VIEWBOX} fill="url(#arena-tri-grid)" />}

        <rect
          x={500 - view.rs.ARENA_HALF * 1000 * scale}
          y={500 - view.rs.ARENA_HALF * 1000 * scale}
          width={view.rs.ARENA_HALF * 2000 * scale}
          height={view.rs.ARENA_HALF * 2000 * scale}
          fill="none"
          stroke={ARENA.EDGE}
          strokeWidth="1"
          strokeDasharray="5 6"
          opacity="0.5"
        />

        {/* 4.7: the ring fades in over 1.5 s and never pops into existence. */}
        {announceAlpha > 0 && (
          <circle
            cx={500}
            cy={500}
            r={ringSvgR}
            fill="none"
            stroke={RING_COLOR}
            strokeWidth="1.5"
            strokeDasharray="6 5"
            opacity={announceAlpha}
          />
        )}
        {frame.ringActive && (
          <>
            <path
              d={`M 0 0 H ${ARENA_VIEWBOX} V ${ARENA_VIEWBOX} H 0 Z M ${500 + ringSvgR} 500 A ${ringSvgR} ${ringSvgR} 0 1 0 ${500 - ringSvgR} 500 A ${ringSvgR} ${ringSvgR} 0 1 0 ${500 + ringSvgR} 500`}
              fill={ARENA.RING_SHADE}
              opacity={shade}
              fillRule="evenodd"
            />
            <circle
              cx={500}
              cy={500}
              r={ringSvgR}
              fill="none"
              stroke={RING_COLOR}
              strokeWidth="1.5"
              strokeDasharray="6 5"
            />
          </>
        )}

        {/* 3.6 trail, oldest ghost faintest. Six paths at most, for both bots. */}
        {quality.trail && (
          <g opacity="0.28">
            {([...trailRef.current.a, ...trailRef.current.b] as string[]).map((d, i) => (
              <path key={`trail-${i}`} d={d} fill={SILHOUETTE} opacity={0.18 + (i % 3) * 0.06} />
            ))}
          </g>
        )}

        {/* 4.4 silhouette: one merged path per team, then the batched fills. */}
        {silhouettes.map((s) => (
          <path
            key={`sil-${s.team}`}
            d={s.d}
            fill={SILHOUETTE}
            stroke={SILHOUETTE}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        ))}

        {shapes.map((s) => {
          const skin = tileSkin(s.team, s.type);
          return (
            <path
              key={s.key}
              d={s.d}
              fill={s.fill}
              stroke={skin.stroke}
              strokeWidth={skin.strokeWidth}
              strokeDasharray={skin.dash}
              strokeLinejoin="round"
            />
          );
        })}

        {/* 4.5 fracture lines, drawn per tile but only for the handful of tiles
            that actually need one - a healthy body emits none. */}
        {[
          ...bots.a.tiles.map((t) => ({ team: 'A' as const, t })),
          ...bots.b.tiles.map((t) => ({ team: 'B' as const, t })),
        ]
          .filter(({ t }) => t.hpRatioMilli < CRACK_BELOW_MILLI)
          .map(({ team, t }) => {
            const strong = t.hpRatioMilli < CRACK_STRONG_BELOW_MILLI;
            return (
              <line
                key={`crack-${team}-${t.index}`}
                x1={t.cx - 3}
                y1={t.cy - 2}
                x2={t.cx + 3}
                y2={t.cy + 2}
                stroke={ARENA.CRACK}
                strokeWidth={strong ? 1.4 : 0.8}
                opacity={strong ? 0.9 : 0.5}
                className="pointer-events-none"
              />
            );
          })}

        {hoverInfo && !selectedInfo && (
          <polygon
            points={toPoints(hoverInfoTile(bots, hoverInfo.ref)?.verts ?? [])}
            fill="none"
            stroke={ARENA.SELECT}
            strokeWidth="3"
            strokeLinejoin="round"
            opacity="0.6"
            className="pointer-events-none"
          />
        )}
        {selectedInfo && (
          <polygon
            points={toPoints(hoverInfoTile(bots, selectedInfo.ref)?.verts ?? [])}
            fill="none"
            stroke={ARENA.SELECT}
            strokeWidth="3"
            strokeLinejoin="round"
            opacity="0.9"
            className="pointer-events-none"
          />
        )}

        {renderCore(frame.a, bots.a.tiles)}
        {renderCore(frame.b, bots.b.tiles)}

        {/* 4.8 detached clusters, frozen in place and fading */}
        {ghosts.map((g) => (
          <polygon
            key={g.key}
            points={g.points}
            fill={DETACHED_FILL}
            stroke={DETACHED_STROKE}
            strokeWidth="1"
            opacity={g.alpha * 0.85}
          />
        ))}

        {sparks.map((p) => (
          <line
            key={p.id}
            x1={(p.x - p.dx * 0.6).toFixed(1)}
            y1={(p.y - p.dy * 0.6).toFixed(1)}
            x2={(p.x + p.dx).toFixed(1)}
            y2={(p.y + p.dy).toFixed(1)}
            stroke={p.color}
            strokeWidth={p.r.toFixed(2)}
            strokeLinecap="round"
            opacity={p.alpha}
          />
        ))}

        {vectorsActive && (
          <g opacity="0.75">
            {[frame.a, frame.b].map((bot) => {
              const len = 60;
              const a = (bot.heading / 64) * Math.PI * 2;
              const x = 500 + bot.x * scale;
              const y = 500 + bot.y * scale;
              const color = tileSkin(bot.team, 'hammer').fill;
              return (
                <g key={bot.team}>
                  <line
                    x1={x}
                    y1={y}
                    x2={x + Math.cos(a) * len}
                    y2={y + Math.sin(a) * len}
                    stroke={color}
                    strokeWidth="1.6"
                    strokeDasharray="4 3"
                  />
                  <circle cx={x} cy={y} r="2.5" fill={color} />
                </g>
              );
            })}
          </g>
        )}
      </svg>

      {hoverInfo && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 pointer-events-none bg-neutral-900/95 backdrop-blur-md text-white rounded-lg px-3 py-2 text-[11px] font-mono shadow-xl border border-neutral-700 min-w-[190px]">
          <div className="flex items-center justify-between border-b border-neutral-700 pb-1 mb-1.5">
            <span className="font-bold text-amber-400">
              {hoverInfo.bot.name} · ô #{hoverInfo.tile.index}
            </span>
            <span className="text-[10px] uppercase text-neutral-400">
              {hoverInfo.ref.team === 'A' ? 'Đội A' : 'Đội B'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-2 gap-y-1">
            <span className="text-neutral-400">Loại</span>
            <span className="font-semibold capitalize">{hoverInfo.tile.type}</span>
            <span className="text-neutral-400">Hướng</span>
            <span className="font-semibold">{hoverInfo.tile.o === 'up' ? 'đỉnh tới' : 'đỉnh lui'}</span>
            <span className="text-neutral-400">Máu</span>
            <span className="font-semibold">
              {hoverInfo.tile.hp}/{hoverInfo.tile.maxHp} ({(hoverInfo.tile.hpRatioMilli / 10).toFixed(0)}%)
            </span>
            <span className="text-neutral-400">Đã nhận</span>
            <span className="font-semibold text-orange-400">{hoverInfo.tile.damageReceived} sát thương</span>
            <span className="text-neutral-400">Toạ độ</span>
            <span className="font-semibold text-sky-400">
              [{hoverInfo.tile.r}, {hoverInfo.tile.j}]
            </span>
          </div>
          {hoverInfo.tile.isCore && (
            <div className="mt-1 pt-1 border-t border-red-900/60 text-[10px] text-red-400 font-semibold">
              LÕI — vỡ là thua ngay
            </div>
          )}
        </div>
      )}

      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 text-[10px] font-mono text-neutral-400">
        nhịp {frame.tick} / {view.totalTicks} · {timeSec.toFixed(1)}s · bậc {quality.tier}
      </div>
    </div>
  );
};

/** The projected tile behind a TileRef, for drawing its highlight. */
function hoverInfoTile(
  bots: { a: { tiles: ProjectedTile[] }; b: { tiles: ProjectedTile[] } },
  ref: TileRef,
): ProjectedTile | undefined {
  const list = ref.team === 'A' ? bots.a.tiles : bots.b.tiles;
  return list.find((t) => t.index === ref.index);
}

/**
 * 3.6: the trail only appears above roughly 60% of top speed. Top speed is the
 * 115% band, so the bar is 0.6 x 1.15 x FULL_SPEED_PER_TICK.
 */
function isMovingFast(view: ReplayView, team: 'A' | 'B', tick: number): boolean {
  if (tick <= 0) return false;
  const now = view.poseAt(team, tick);
  const before = view.poseAt(team, tick - 1);
  const moved = Math.hypot(now.x - before.x, now.y - before.y);
  const topSpeed = view.rs.FULL_SPEED_PER_TICK * 1.15;
  return moved > topSpeed * 0.6;
}

/**
 * 3.4 compression from the most recent hit on this body.
 *
 * The amount comes from `impactMul` and the direction from the contact normal -
 * NOT from `damage`. Two hits can share a damage number while looking completely
 * different (a slow square-on stab versus a fast glancing scrape), and collapsing
 * them onto one number would throw that distinction away.
 */
function squashAt(
  view: ReplayView,
  team: 'A' | 'B',
  tick: number,
): { amount: number; nx: number; ny: number } | null {
  const window = FX.SQUASH_DECAY_TICKS;
  let best: { amount: number; nx: number; ny: number } | null = null;
  for (const e of view.eventsInRange(tick - window, tick)) {
    if (e.kind !== 'hit' || e.defenderTeam !== team) continue;
    const age = tick - e.tick;
    const raw = (FX.SQUASH_MAX * (e.impactMul - 850)) / 150;
    const amount = Math.max(0, Math.min(FX.SQUASH_MAX, raw)) * (1 - age / window);
    if (amount <= 0) continue;
    if (!best || amount > best.amount) best = { amount, nx: e.normal.x, ny: e.normal.y };
  }
  return best;
}
