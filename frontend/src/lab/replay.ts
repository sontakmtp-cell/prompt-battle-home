import type {
  BotCheckpoint,
  BotDefinition,
  Checkpoint,
  Replay,
  Ruleset,
  Team,
  VfxEvent,
} from '@promptchien/contracts';
import { baseHp, diversityMaxHp, ringRadiusAt } from '@promptchien/contracts';
import { buildGeometry, type BotGeometry } from '@promptchien/core';

/**
 * Turns a `Replay` into the exact picture of any tick.
 *
 * THE PROBLEM
 * -----------
 * The replay carries two different resolutions of the same match:
 *   - `frames`      one entry per tick, but only the bot pose plus three counters
 *   - `checkpoints` full per-tile detail (HP, alive, damageReceived) every 30 ticks
 *
 * Drawing from `frames` alone gives no per-tile detail; drawing from the nearest
 * checkpoint alone makes every hit lag by up to a full second, so a tile that
 * dies at tick 47 still looks healthy until tick 60. Neither is acceptable for a
 * viewer whose whole job is to make damage legible.
 *
 * THE SOLUTION
 * ------------
 * Take the checkpoint at or before the requested tick, then replay the `hit`,
 * `destroy` and `detach` events forward onto it. The event log is exactly the
 * "damage map + destroyed tile" record that spec_demo.md 19 requires, so this
 * reconstructs the true per-tile state at any tick without the engine having to
 * store 60 tiles x 3600 ticks of history.
 *
 * Max HP is recomputed the same way the engine does it (can_bang.md 6): the
 * diversity resonance depends on which neighbours are still alive, so a tile's
 * ceiling drops when the structure around it breaks. That is why the HP bar has
 * to be recomputed rather than read from the checkpoint once and reused.
 */

export interface TileView {
  index: number;
  r: number;
  j: number;
  o: 'up' | 'down';
  type: 'hammer' | 'scissor' | 'paper' | 'motor';
  isCore: boolean;
  alive: boolean;
  hp: number;
  maxHp: number;
  /** 0..1000, clamped so a stale ceiling can never render above full */
  hpRatioMilli: number;
  damageReceived: number;
}

export interface BotView {
  team: Team;
  name: string;
  x: number;
  y: number;
  heading: number;
  /** interpolated, already in world milli-units */
  geometry: BotGeometry;
  definition: BotDefinition;
  tiles: TileView[];
  coreHp: number;
  coreMaxHp: number;
  coreRatioMilli: number;
  combatAlive: number;
  motorAlive: number;
  alive: boolean;
  effectiveLoadMilli: number;
  speedMultiplierMilli: number;
  totalDamageDealt: number;
  ringOutside: boolean;
}

export interface FrameView {
  tick: number;
  alpha: number;
  ringRadiusMilli: number;
  /** the shrink ring is being announced but has not started closing yet */
  ringAnnouncing: boolean;
  ringActive: boolean;
  a: BotView;
  b: BotView;
}

export interface TileRuntime {
  alive: boolean;
  hp: number;
  maxHp: number;
  damageReceived: number;
}

function cloneCheckpointTiles(cp: BotCheckpoint): TileRuntime[] {
  return cp.tris.map((t) => ({
    alive: t.alive,
    hp: t.hp,
    maxHp: t.maxHp,
    damageReceived: t.damageReceived,
  }));
}

/** Recompute the diversity resonance ceiling exactly as the engine does. */
function recomputeMaxHp(
  tiles: TileRuntime[],
  geom: BotGeometry,
  rs: Ruleset,
  types: readonly string[],
): void {
  const ring = geom.ringIdx;
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i]!;
    if (!t.alive) continue;
    let hasH = false;
    let hasS = false;
    let hasP = false;
    const own = types[i];
    if (own === 'hammer') hasH = true;
    else if (own === 'scissor') hasS = true;
    else if (own === 'paper') hasP = true;
    for (let k = 1; k < 4; k++) {
      const ni = ring[i * 4 + k]!;
      if (ni < 0) continue;
      if (!tiles[ni]!.alive) continue;
      const nt = types[ni];
      if (nt === 'hammer') hasH = true;
      else if (nt === 'scissor') hasS = true;
      else if (nt === 'paper') hasP = true;
    }
    const distinct = (hasH ? 1 : 0) + (hasS ? 1 : 0) + (hasP ? 1 : 0);
    t.maxHp = diversityMaxHp(rs, baseHp(rs, own!), distinct);
    if (t.hp > t.maxHp) t.hp = t.maxHp;
  }
}

/** Shortest signed angular distance between two 1/64-turn headings. */
export function headingDelta(from: number, to: number): number {
  return ((((to - from) % 64) + 96) % 64) - 32;
}

export class ReplayView {
  readonly replay: Replay;
  readonly rs: Ruleset;
  readonly geomA: BotGeometry;
  readonly geomB: BotGeometry;
  readonly typesA: readonly string[];
  readonly typesB: readonly string[];
  readonly totalTicks: number;
  readonly tickRate: number;
  readonly durationSec: number;
  /** event indices bucketed by tick, so "events up to tick" is a slice, not a scan */
  private readonly eventsByTick: VfxEvent[][];

  private cache = new Map<Team, { tick: number; tiles: TileRuntime[] }>();
  private readonly defA: BotDefinition;
  private readonly defB: BotDefinition;

  constructor(replay: Replay, defA: BotDefinition, defB: BotDefinition, rs: Ruleset) {
    this.replay = replay;
    this.rs = rs;
    this.defA = defA;
    this.defB = defB;
    this.geomA = buildGeometry(defA);
    this.geomB = buildGeometry(defB);
    this.typesA = defA.triangles.map((t) => t.type);
    this.typesB = defB.triangles.map((t) => t.type);
    this.totalTicks = replay.manifest.totalTicks;
    this.tickRate = replay.manifest.tickRate;
    this.durationSec = this.totalTicks / this.tickRate;

    this.eventsByTick = Array.from({ length: this.totalTicks + 1 }, () => [] as VfxEvent[]);
    for (const e of replay.events) {
      if (e.tick >= 0 && e.tick <= this.totalTicks) this.eventsByTick[e.tick]!.push(e);
    }
  }

  // ---- pose --------------------------------------------------------------

  /** Pose of a bot at a fractional tick, linearly interpolated (ky_thuat_my_thuat.md 3.1). */
  poseAt(team: Team, tickFloat: number): { x: number; y: number; heading: number } {
    const frames = this.replay.frames;
    if (frames.length === 0) {
      const p = this.replay.manifest.startPoses[team === 'A' ? 'a' : 'b'];
      return { x: p.x, y: p.y, heading: p.heading };
    }
    const clamped = Math.max(0, Math.min(tickFloat, frames.length - 1));
    const i0 = Math.floor(clamped);
    const i1 = Math.min(i0 + 1, frames.length - 1);
    const alpha = clamped - i0;
    const f0 = frames[i0]!;
    const f1 = frames[i1]!;
    const a = team === 'A' ? f0.a : f0.b;
    const b = team === 'A' ? f1.a : f1.b;
    const dh = headingDelta(a.heading, b.heading);
    return {
      x: a.x + (b.x - a.x) * alpha,
      y: a.y + (b.y - a.y) * alpha,
      heading: (((a.heading + dh * alpha) % 64) + 64) % 64,
    };
  }

  // ---- per-tile state ----------------------------------------------------

  private checkpointIndexAtOrBefore(tick: number): number {
    const cps = this.replay.checkpoints;
    let lo = 0;
    let hi = cps.length - 1;
    let best = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (cps[mid]!.tick <= tick) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return best;
  }

  /**
   * Per-tile state at `tick`: nearest earlier checkpoint plus the damage and
   * destruction events since. Cached, because the viewer asks once per frame and
   * usually for the same tick.
   */
  tilesAt(team: Team, tick: number): TileRuntime[] {
    const cached = this.cache.get(team);
    if (cached && cached.tick === tick) return cached.tiles;

    const cps: Checkpoint[] = this.replay.checkpoints;
    const ci = this.checkpointIndexAtOrBefore(tick);
    const geom = team === 'A' ? this.geomA : this.geomB;
    const types = team === 'A' ? this.typesA : this.typesB;
    let tiles: TileRuntime[];
    let fromTick: number;

    if (ci < 0) {
      // Before the first checkpoint: the opening state, full HP everywhere.
      fromTick = -1;
      tiles = geom.tris.map((g) => {
        const hp = baseHp(this.rs, g.type);
        return { alive: true, hp, maxHp: hp, damageReceived: 0 };
      });
      recomputeMaxHp(tiles, geom, this.rs, types);
      for (const t of tiles) t.hp = t.maxHp;
    } else {
      const cp = cps[ci]!;
      fromTick = cp.tick;
      tiles = cloneCheckpointTiles(team === 'A' ? cp.a : cp.b);
    }

    let structureChanged = false;
    for (let t = fromTick + 1; t <= tick; t++) {
      for (const e of this.eventsByTick[t] ?? []) {
        const belongsToTeam = 'team' in e && e.team === team;
        if (e.kind === 'hit') {
          if (e.defenderTeam !== team) continue;
          const tile = tiles[e.defender];
          if (!tile || !tile.alive) continue;
          tile.hp -= e.damage;
          tile.damageReceived += e.damage;
        } else if (e.kind === 'destroy') {
          if (!belongsToTeam) continue;
          const tile = tiles[e.tri];
          if (!tile) continue;
          tile.alive = false;
          tile.hp = 0;
          structureChanged = true;
        } else if (e.kind === 'detach') {
          if (!belongsToTeam) continue;
          for (const i of e.tris) {
            const tile = tiles[i];
            if (!tile) continue;
            // NOTE: the engine clears `alive` on a detached tile but leaves its
            // HP where it was (packages/core/src/engine/simulate.ts,
            // `structureUpdate`). Mirroring that exactly is what lets this
            // reconstruction land on the engine's own checkpoints byte for byte.
            tile.alive = false;
          }
          structureChanged = true;
        }
      }
    }

    if (structureChanged) recomputeMaxHp(tiles, geom, this.rs, types);

    // The Core's HP is NOT fully recoverable from the event log. Once the
    // shrinking ring starts (can_bang.md 8.2) the Core bleeds 1.5% of its max HP
    // every tick, and that drain emits no event at all - so a reconstruction
    // built purely from `hit`/`destroy` would show the Core frozen while it was
    // actually dying, for up to a full second between checkpoints.
    //
    // The per-tick frame stream carries `coreHp` exactly, so the Core is read
    // from there instead. This matters because ky_thuat_my_thuat.md 4.5 makes the
    // Core the single most important thing on the field to read at a glance.
    const frames = this.replay.frames;
    if (tick < frames.length && tick >= 0) {
      const f = frames[tick]!;
      const core = tiles[geom.coreIndex]!;
      if (core.alive) core.hp = Math.min(team === 'A' ? f.a.coreHp : f.b.coreHp, core.maxHp);
    }

    this.cache.set(team, { tick, tiles });
    return tiles;
  }

  // ---- the full picture --------------------------------------------------

  botView(team: Team, tick: number, tickFloat: number): BotView {
    const geom = team === 'A' ? this.geomA : this.geomB;
    const def = team === 'A' ? this.replay.manifest.botA : this.replay.manifest.botB;
    const pose = this.poseAt(team, tickFloat);
    const runtime = this.tilesAt(team, tick);

    const tiles: TileView[] = new Array(runtime.length);
    let combat = 0;
    let motor = 0;
    for (let i = 0; i < runtime.length; i++) {
      const t = runtime[i]!;
      const g = geom.tris[i]!;
      if (t.alive) {
        if (g.type === 'motor') motor++;
        else combat++;
      }
      const ratio = t.maxHp === 0 ? 0 : Math.min(1000, Math.trunc((t.hp * 1000) / t.maxHp));
      tiles[i] = {
        index: i,
        r: g.r,
        j: g.j,
        o: g.o,
        type: g.type,
        isCore: i === geom.coreIndex,
        alive: t.alive,
        hp: t.hp,
        maxHp: t.maxHp,
        hpRatioMilli: Math.max(0, ratio),
        damageReceived: t.damageReceived,
      };
    }

    const coreTile = tiles[geom.coreIndex]!;
    return {
      team,
      name: def.name,
      x: pose.x,
      y: pose.y,
      heading: pose.heading,
      geometry: geom,
      definition: this.definitionOf(team),
      tiles,
      coreHp: Math.max(0, coreTile.hp),
      coreMaxHp: coreTile.maxHp,
      coreRatioMilli: coreTile.hpRatioMilli,
      combatAlive: combat,
      motorAlive: motor,
      alive: coreTile.alive,
      effectiveLoadMilli: this.loadAt(team, tick),
      speedMultiplierMilli: this.speedAt(team, tick),
      totalDamageDealt: this.damageDealtAt(team, tick),
      ringOutside: this.ringOutsideAt(team, tick),
    };
  }

  private definitionOf(team: Team): BotDefinition {
    return team === 'A' ? this.defA : this.defB;
  }

  private scalarFromCheckpoint(
    team: Team,
    tick: number,
    pick: (cp: BotCheckpoint) => number,
  ): number {
    const ci = this.checkpointIndexAtOrBefore(tick);
    if (ci < 0) return 0;
    const cp = this.replay.checkpoints[ci]!;
    return pick(team === 'A' ? cp.a : cp.b);
  }

  loadAt(team: Team, tick: number): number {
    return this.scalarFromCheckpoint(team, tick, (c) => c.effectiveLoadMilli);
  }

  speedAt(team: Team, tick: number): number {
    return this.scalarFromCheckpoint(team, tick, (c) => c.speedMultiplierMilli);
  }

  damageDealtAt(team: Team, tick: number): number {
    return this.scalarFromCheckpoint(team, tick, (c) => c.totalDamageDealt);
  }

  /**
   * Whether this bot's Core is outside the shrinking ring.
   *
   * Read from the checkpoint and then advanced with the `ringEnter` / `ringExit`
   * transitions, because a Core that leaves the circle mid-second would otherwise
   * not start flashing until the next checkpoint - and that flash plus the
   * "turn back" guide line is the single most important cue in 4.7.
   */
  ringOutsideAt(team: Team, tick: number): boolean {
    const ci = this.checkpointIndexAtOrBefore(tick);
    let outside = false;
    let from = -1;
    if (ci >= 0) {
      const cp = this.replay.checkpoints[ci]!;
      outside = (team === 'A' ? cp.a : cp.b).ringOutside;
      from = cp.tick;
    }
    for (let t = from + 1; t <= tick; t++) {
      for (const e of this.eventsByTick[t] ?? []) {
        if (e.kind === 'ringEnter' && e.team === team) outside = true;
        else if (e.kind === 'ringExit' && e.team === team) outside = false;
      }
    }
    return outside;
  }

  /**
   * The picture of the whole arena at a fractional tick.
   *
   * The ring radius comes from `ringRadiusAt` in contracts - the same function
   * the simulation itself calls. ky_thuat_my_thuat.md 9.2c calls this out: if the
   * renderer derived the radius independently, a one-constant drift would show
   * the Core bleeding while it still looked safely inside the circle.
   */
  frameAt(tickFloat: number): FrameView {
    const tick = Math.max(0, Math.min(Math.floor(tickFloat), Math.max(0, this.totalTicks - 1)));
    const alpha = Math.max(0, Math.min(tickFloat - tick, 1));
    const ringRadiusMilli = ringRadiusAt(this.rs, tick);
    const announceFrom = this.rs.RING_START_TICK - this.rs.RING_ANNOUNCE_TICKS;
    return {
      tick,
      alpha,
      ringRadiusMilli,
      ringAnnouncing: tick >= announceFrom && tick < this.rs.RING_START_TICK,
      ringActive: tick >= this.rs.RING_START_TICK,
      a: this.botView('A', tick, tickFloat),
      b: this.botView('B', tick, tickFloat),
    };
  }

  // ---- events ------------------------------------------------------------

  eventsUpTo(tick: number): VfxEvent[] {
    const out: VfxEvent[] = [];
    const last = Math.min(tick, this.totalTicks);
    for (let t = 0; t <= last; t++) out.push(...(this.eventsByTick[t] ?? []));
    return out;
  }

  eventsInRange(fromTick: number, toTick: number): VfxEvent[] {
    const out: VfxEvent[] = [];
    for (let t = Math.max(0, fromTick); t <= Math.min(toTick, this.totalTicks); t++) {
      out.push(...(this.eventsByTick[t] ?? []));
    }
    return out;
  }

  /**
   * Damage map at a tick (ky_thuat_my_thuat.md 4.6): heat is each tile's
   * cumulative damage received, normalised against the hottest tile on the field
   * *at that tick*, so the map gets hotter as the replay is scrubbed forward.
   */
  damageMapAt(tick: number): { a: number[]; b: number[]; peak: number } {
    const a = this.tilesAt('A', tick).map((t) => t.damageReceived);
    const b = this.tilesAt('B', tick).map((t) => t.damageReceived);
    const peak = Math.max(0, ...a, ...b);
    return { a, b, peak };
  }

  /** The three hottest tiles on the field, for the analysis readout. */
  hottestTiles(
    tick: number,
  ): Array<{ team: Team; index: number; damage: number; destroyedTick: number | null }> {
    const { a, b } = this.damageMapAt(tick);
    const rows: Array<{ team: Team; index: number; damage: number; destroyedTick: number | null }> = [];
    for (const [team, arr] of [
      ['A', a],
      ['B', b],
    ] as Array<[Team, number[]]>) {
      arr.forEach((damage, index) => {
        if (damage <= 0) return;
        rows.push({ team, index, damage, destroyedTick: this.destroyedTickOf(team, index) });
      });
    }
    rows.sort((x, y) => y.damage - x.damage);
    return rows.slice(0, 3);
  }

  private destroyedTickOf(team: Team, tri: number): number | null {
    for (const e of this.replay.events) {
      if (e.kind === 'destroy' && e.team === team && e.tri === tri) return e.tick;
    }
    return null;
  }

  // ---- helpers for the UI ------------------------------------------------

  /** Human-readable event line, following gameplay.md 6.1's example wording. */
  describeEvent(e: VfxEvent, nameA: string, nameB: string): {
    tick: number;
    title: string;
    detail: string;
    kind: VfxEvent['kind'];
    team: Team | null;
    critical: boolean;
  } {
    const who = (t: Team): string => (t === 'A' ? nameA : nameB);
    switch (e.kind) {
      case 'hit': {
        const adv = e.advantage === 'adv' ? 'có lợi thế' : e.advantage === 'disadv' ? 'bất lợi' : 'ngang';
        return {
          tick: e.tick,
          title: `${who(e.attackerTeam)} đánh trúng ${who(e.defenderTeam)}`,
          detail: `${e.damage} sát thương · ${adv} · ô #${e.defender}`,
          kind: e.kind,
          team: e.attackerTeam,
          critical: e.advantage === 'adv' && e.damage > 0,
        };
      }
      case 'destroy':
        return {
          tick: e.tick,
          title: `${who(e.team)} mất ô #${e.tri}`,
          detail: `loại ${e.type} bị phá`,
          kind: e.kind,
          team: e.team,
          critical: e.type === 'motor',
        };
      case 'detach':
        return {
          tick: e.tick,
          title: `${who(e.team)} đứt lìa`,
          detail: `${e.tris.length} ô mất liên thông với lõi`,
          kind: e.kind,
          team: e.team,
          critical: e.tris.length >= 3,
        };
      case 'motorLost':
        return {
          tick: e.tick,
          title: `${who(e.team)} mất ${e.count} Motor`,
          detail: `phía ${e.side === 'left' ? 'trái' : e.side === 'right' ? 'phải' : 'giữa'}`,
          kind: e.kind,
          team: e.team,
          critical: true,
        };
      case 'overload':
        return {
          tick: e.tick,
          title: `${who(e.team)} quá tải`,
          detail: `hệ số tải ${(e.loadFactor / 1000).toFixed(2)}`,
          kind: e.kind,
          team: e.team,
          critical: true,
        };
      case 'coreHit':
        return {
          tick: e.tick,
          title: `Lõi ${who(e.team)} trúng đòn`,
          detail: `còn ${(e.hpRatio / 10).toFixed(1)}%`,
          kind: e.kind,
          team: e.team,
          critical: e.hpRatio < 300,
        };
      case 'coreDestroyed':
        return {
          tick: e.tick,
          title: `Lõi ${who(e.team)} vỡ`,
          detail: 'trận đấu kết thúc',
          kind: e.kind,
          team: e.team,
          critical: true,
        };
      case 'ringStart':
        return {
          tick: e.tick,
          title: 'Vòng thu hẹp bắt đầu',
          detail: `bán kính ${(e.radius / 1000).toFixed(1)} đơn vị`,
          kind: e.kind,
          team: null,
          critical: false,
        };
      case 'ringEnter':
        return {
          tick: e.tick,
          title: `Lõi ${who(e.team)} ra ngoài vòng`,
          detail: 'đang mất máu theo tỉ lệ',
          kind: e.kind,
          team: e.team,
          critical: true,
        };
      case 'ringExit':
        return {
          tick: e.tick,
          title: `Lõi ${who(e.team)} quay vào trong`,
          detail: 'hết nguy hiểm',
          kind: e.kind,
          team: e.team,
          critical: false,
        };
      case 'brainViolation':
        return {
          tick: e.tick,
          title: `${who(e.team)} vi phạm ngân sách não`,
          detail: `${e.count} lần`,
          kind: e.kind,
          team: e.team,
          critical: e.count > 20,
        };
      case 'matchEnd': {
        const label =
          e.winner === 'draw' ? 'Hòa' : `${who(e.winner)} thắng`;
        const why = e.reason === 'core' ? 'phá lõi' : e.reason === 'incap' ? 'mất khả năng chiến đấu' : 'hết giờ tính điểm';
        return {
          tick: e.tick,
          title: `Kết thúc: ${label}`,
          detail: why,
          kind: e.kind,
          team: e.winner === 'draw' ? null : e.winner,
          critical: true,
        };
      }
      default:
        return {
          tick: 0,
          title: 'không rõ',
          detail: '',
          kind: 'hit',
          team: null,
          critical: false,
        };
    }
  }
}
