import type {
  BotPackage,
  BotStats,
  Checkpoint,
  MatchResult,
  Replay,
  Ruleset,
  Team,
  TickFrame,
  TriStateRecord,
  VfxEvent,
} from '@promptchien/contracts';
import {
  ENGINE_VERSION,
  ORIENT_LUT,
  ROT64 as ROT64_REF,
  RULESET_VERSION,
  advantageOf,
  baseDamage,
  baseHp,
  computeDamage,
  commitmentMultiplier,
  diversityMaxHp,
  loadFactorMilli,
  ringRadiusAt,
  rpsMultiplier,
  speedMultiplierFor,
} from '@promptchien/contracts';
import { buildGeometry, type BotGeometry } from '../geometry/build.js';
import { cellKey, faceIndex, triNeighbors } from '../geometry/lattice.js';
import { BrainRuntime, type Snapshot } from '../brain/interpreter.js';
import { clamp, dirAbsDelta, dirDelta, dirIndex, isqrt, mulberry32, nextInt, rotateOffset } from '../math/fixed.js';
import { collectContacts, type Contact, type ContactInput } from './collision.js';
import { hashSimulationPayload } from '../replay/hash.js';

const START_X_MILLI = 9000;
const START_Y_JITTER = 3000;
const START_H_JITTER = 4;
const MAX_SEPARATION_PER_TICK = 400;
const CHECKPOINT_EVERY = 30;
const NEG_INF = -1_000_000;

interface TriState {
  hp: number;
  baseMaxHp: number;
  maxHp: number;
  alive: boolean;
  damageReceived: number;
  detachTick: number;
  destroyedBy: number | null;
  destroyed: boolean;
}

interface BotRuntime {
  team: Team;
  name: string;
  hash: string;
  pkg: BotPackage;
  geom: BotGeometry;
  brain: BrainRuntime;
  x: number;
  y: number;
  heading: number;
  vx: number;
  vy: number;
  tris: TriState[];
  /** world centroid per tile: [x0,y0,x1,y1,...] */
  wc: Int32Array;
  /** world vertices per tile: 6 numbers per tile */
  wv: Int32Array;
  alive: boolean;
  coreDestroyed: boolean;
  coreHp: number;
  coreMaxHp: number;
  bodyAlive: number;
  combatAlive: number;
  motorAlive: number;
  loadMilli: number;
  effectiveLoadMilli: number;
  speedMultiplierMilli: number;
  torqueLeft: number;
  torqueRight: number;
  rotStepsLeft: number;
  rotStepsRight: number;
  incapTicks: number;
  ringOutside: boolean;
  ringDrainAccum: number;
  totalDamageDealt: number;
  lastHitTick: Int32Array;
  stuckTicks: number;
  violationRun: number;
  violations: number;
  wasOverloaded: boolean;
  initialTriangles: number;
  initialCombat: number;
  initialMotors: number;
  lockedLoadMilli: number;
  /** speed multiplier implied by the locked load, i.e. the best this bot can ever do */
  lockedSpeedMultiplierMilli: number;
  movedThisTick: number;
}

export interface StartPose {
  x?: number;
  y?: number;
  heading?: number;
}

export interface SimOptions {
  seed: number;
  ruleset: Ruleset;
  recordReplay?: boolean;
  /** override for focused tests; defaults to ruleset.MATCH_MAX_TICKS */
  maxTicks?: number;
  /**
   * Explicit opening poses. Used by the sandbox to sweep contact geometry.
   * When omitted the poses are derived from the seed (A always starts left,
   * B always starts right).
   */
  startOverride?: { a?: StartPose; b?: StartPose };
}

export interface SimResult {
  result: MatchResult;
  replay: Replay;
  /**
   * Rolling 32-bit digest over every tick's full state. Cheap enough to run for
   * thousands of matches and sensitive enough to catch a single-tick divergence,
   * which is what the Windows/Linux cross-platform gate compares.
   */
  digest: string;
}

function createRuntime(team: Team, pkg: BotPackage, rs: Ruleset): BotRuntime {
  const def = pkg.definition;
  const geom = buildGeometry(def);
  const n = geom.tris.length;
  const tris: TriState[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const hp = baseHp(rs, geom.tris[i]!.type);
    tris[i] = {
      hp,
      baseMaxHp: hp,
      maxHp: hp,
      alive: true,
      damageReceived: 0,
      detachTick: -1,
      destroyedBy: null,
      destroyed: false,
    };
  }
  let motors = 0;
  let combat = 0;
  for (const t of geom.tris) {
    if (t.type === 'motor') motors++;
    else combat++;
  }
  const bot: BotRuntime = {
    team,
    name: def.name,
    hash: pkg.definitionHash,
    pkg,
    geom,
    brain: new BrainRuntime(def.brain, rs),
    x: 0,
    y: 0,
    heading: 0,
    vx: 0,
    vy: 0,
    tris,
    wc: new Int32Array(n * 2),
    wv: new Int32Array(n * 6),
    alive: true,
    coreDestroyed: false,
    coreHp: 0,
    coreMaxHp: 0,
    bodyAlive: n,
    combatAlive: combat,
    motorAlive: motors,
    loadMilli: 0,
    effectiveLoadMilli: 0,
    speedMultiplierMilli: 0,
    torqueLeft: 0,
    torqueRight: 0,
    rotStepsLeft: 0,
    rotStepsRight: 0,
    incapTicks: 0,
    ringOutside: false,
    ringDrainAccum: 0,
    totalDamageDealt: 0,
    lastHitTick: new Int32Array(n).fill(NEG_INF),
    stuckTicks: 0,
    violationRun: 0,
    violations: 0,
    wasOverloaded: false,
    initialTriangles: n,
    initialCombat: combat,
    initialMotors: motors,
    lockedLoadMilli: loadFactorMilli(rs, n, motors),
    lockedSpeedMultiplierMilli: motors === 0 ? 0 : speedMultiplierFor(loadFactorMilli(rs, n, motors)),
    movedThisTick: 0,
  };
  bot.coreHp = tris[geom.coreIndex]!.hp;
  bot.coreMaxHp = tris[geom.coreIndex]!.maxHp;
  return bot;
}

function updateCounts(bot: BotRuntime): void {
  let body = 0;
  let combat = 0;
  let motors = 0;
  for (let i = 0; i < bot.tris.length; i++) {
    const t = bot.tris[i]!;
    if (!t.alive) continue;
    body++;
    if (bot.geom.tris[i]!.type === 'motor') motors++;
    else combat++;
  }
  bot.bodyAlive = body;
  bot.combatAlive = combat;
  bot.motorAlive = motors;
}

/** Recompute max HP from the diversity resonance (can_bang.md 6, rule 3). */
function recomputeDiversity(bot: BotRuntime, rs: Ruleset): void {
  const ring = bot.geom.ringIdx;
  for (let i = 0; i < bot.geom.tris.length; i++) {
    const t = bot.tris[i]!;
    if (!t.alive) continue;
    const g = bot.geom.tris[i]!;
    let hasH = false;
    let hasS = false;
    let hasP = false;
    if (g.type === 'hammer') hasH = true;
    else if (g.type === 'scissor') hasS = true;
    else if (g.type === 'paper') hasP = true;
    for (let k = 1; k < 4; k++) {
      const ni = ring[i * 4 + k]!;
      if (ni < 0) continue;
      if (!bot.tris[ni]!.alive) continue;
      const nt = bot.geom.tris[ni]!.type;
      if (nt === 'hammer') hasH = true;
      else if (nt === 'scissor') hasS = true;
      else if (nt === 'paper') hasP = true;
    }
    const types = (hasH ? 1 : 0) + (hasS ? 1 : 0) + (hasP ? 1 : 0);
    t.maxHp = diversityMaxHp(rs, t.baseMaxHp, types);
    if (t.hp > t.maxHp) t.hp = t.maxHp;
  }
  const core = bot.tris[bot.geom.coreIndex]!;
  bot.coreMaxHp = core.maxHp;
  bot.coreHp = Math.max(0, core.hp);
}

/**
 * Bring every tile up to its effective (resonant) max HP.
 * Only ever used once, at match start, right after the opening resonance is
 * computed: a tile is manufactured full, and "full" means the resonant max.
 */
function fillToMaxHp(bot: BotRuntime): void {
  for (let i = 0; i < bot.tris.length; i++) {
    const t = bot.tris[i]!;
    if (!t.alive) continue;
    t.hp = t.maxHp;
  }
  const core = bot.tris[bot.geom.coreIndex]!;
  bot.coreHp = core.hp;
  bot.coreMaxHp = core.maxHp;
}

function rotationStepsFromTorque(rs: Ruleset, torque: number): number {
  if (torque <= 0) return 0;
  const raw = Math.trunc((rs.TORQUE_REF_STEPS * torque) / rs.TORQUE_REF_MILLI);
  return clamp(raw, 1, rs.TORQUE_MAX_STEPS);
}

function updateDerived(bot: BotRuntime, rs: Ruleset): void {
  updateCounts(bot);
  bot.loadMilli = loadFactorMilli(rs, bot.bodyAlive, bot.motorAlive);
  bot.effectiveLoadMilli = Math.max(bot.loadMilli, bot.lockedLoadMilli);
  bot.speedMultiplierMilli =
    bot.motorAlive === 0 ? 0 : speedMultiplierFor(bot.effectiveLoadMilli);

  let left = 0;
  let right = 0;
  for (let i = 0; i < bot.geom.tris.length; i++) {
    const t = bot.tris[i]!;
    if (!t.alive) continue;
    const g = bot.geom.tris[i]!;
    if (g.type !== 'motor') continue;
    if (g.localCentroid.x < 0) left += g.offsetMilli;
    else right += g.offsetMilli;
  }
  bot.torqueLeft = left;
  bot.torqueRight = right;
  bot.rotStepsLeft = rotationStepsFromTorque(rs, left);
  bot.rotStepsRight = rotationStepsFromTorque(rs, right);
}

function updateWorldGeometry(bot: BotRuntime): void {
  const hd = bot.heading;
  const { wc, wv } = bot;
  for (let i = 0; i < bot.geom.tris.length; i++) {
    const g = bot.geom.tris[i]!;
    const c = rotateOffset(g.localCentroid.x, g.localCentroid.y, hd);
    wc[i * 2] = bot.x + c.x;
    wc[i * 2 + 1] = bot.y + c.y;
    for (let k = 0; k < 3; k++) {
      const v = rotateOffset(g.localVerts[k]!.x, g.localVerts[k]!.y, hd);
      wv[i * 6 + k * 2] = bot.x + v.x;
      wv[i * 6 + k * 2 + 1] = bot.y + v.y;
    }
  }
}

function triInput(bot: BotRuntime, i: number): ContactInput {
  const g = bot.geom.tris[i]!;
  return {
    verts: [
      { x: bot.wv[i * 6]!, y: bot.wv[i * 6 + 1]! },
      { x: bot.wv[i * 6 + 2]!, y: bot.wv[i * 6 + 3]! },
      { x: bot.wv[i * 6 + 4]!, y: bot.wv[i * 6 + 5]! },
    ],
    cx: bot.wc[i * 2]!,
    cy: bot.wc[i * 2 + 1]!,
    radius: g.radiusMilli,
    vx: bot.vx,
    vy: bot.vy,
  };
}

function buildSnapshot(self: BotRuntime, foe: BotRuntime, tick: number, rs: Ruleset): Snapshot {
  let hp = 0;
  let maxHp = 0;
  for (let i = 0; i < self.tris.length; i++) {
    if (!self.tris[i]!.alive) continue;
    hp += self.tris[i]!.hp;
    maxHp += self.tris[i]!.maxHp;
  }
  const dx = foe.x - self.x;
  const dy = foe.y - self.y;
  const dist = isqrt(dx * dx + dy * dy);
  const bearing = dirDelta(dirIndex(dx, dy), self.heading);
  void rs;
  return {
    'self.x': self.x,
    'self.y': self.y,
    'self.heading': self.heading,
    'self.speed': isqrt(self.vx * self.vx + self.vy * self.vy),
    'self.vx': self.vx,
    'self.vy': self.vy,
    'self.hp': hp,
    'self.hpRatio': maxHp === 0 ? 0 : Math.trunc((hp * 1000) / maxHp),
    'self.coreHp': self.coreHp,
    'self.coreMaxHp': self.coreMaxHp,
    'self.coreHpRatio': self.coreMaxHp === 0 ? 0 : Math.trunc((self.coreHp * 1000) / self.coreMaxHp),
    'self.combat': self.combatAlive,
    'self.motor': self.motorAlive,
    'self.load': self.effectiveLoadMilli,
    'self.stuckTicks': self.stuckTicks,
    'self.ringOutside': self.ringOutside ? 1 : 0,
    'self.tick': tick,
    'enemy.x': foe.x,
    'enemy.y': foe.y,
    'enemy.dx': dx,
    'enemy.dy': dy,
    'enemy.dist': dist,
    'enemy.heading': foe.heading,
    'enemy.bearing': bearing,
    'enemy.coreHpRatio':
      foe.coreMaxHp === 0 ? 0 : Math.trunc((foe.coreHp * 1000) / foe.coreMaxHp),
    'enemy.combat': foe.combatAlive,
    'enemy.motor': foe.motorAlive,
    'enemy.load': foe.effectiveLoadMilli,
  };
}

function applyRotation(bot: BotRuntime, cmd: string, foe: BotRuntime, rs: Ruleset): void {
  if (bot.motorAlive === 0) return;
  const drift = clamp(
    Math.trunc((bot.torqueRight - bot.torqueLeft) / rs.DRIFT_DIVISOR),
    -rs.DRIFT_MAX_STEPS,
    rs.DRIFT_MAX_STEPS,
  );
  let target = bot.heading;
  let useSteps = 0;

  const enemyDir = dirIndex(foe.x - bot.x, foe.y - bot.y);
  switch (cmd) {
    case 'left':
      useSteps = bot.rotStepsLeft;
      target = bot.heading + useSteps;
      break;
    case 'right':
      useSteps = bot.rotStepsRight;
      target = bot.heading - useSteps;
      break;
    case 'toEnemy': {
      const d = dirDelta(enemyDir, bot.heading);
      useSteps = d >= 0 ? bot.rotStepsLeft : bot.rotStepsRight;
      target = bot.heading + clamp(d, -useSteps, useSteps);
      break;
    }
    case 'toEnemyCore': {
      const ci = foe.geom.coreIndex;
      const cx = foe.wc[ci * 2]!;
      const cy = foe.wc[ci * 2 + 1]!;
      const cd = dirDelta(dirIndex(cx - bot.x, cy - bot.y), bot.heading);
      useSteps = cd >= 0 ? bot.rotStepsLeft : bot.rotStepsRight;
      target = bot.heading + clamp(cd, -useSteps, useSteps);
      break;
    }
    case 'awayFromEnemy': {
      const away = (enemyDir + 32) & 63;
      const d = dirDelta(away, bot.heading);
      useSteps = d >= 0 ? bot.rotStepsLeft : bot.rotStepsRight;
      target = bot.heading + clamp(d, -useSteps, useSteps);
      break;
    }
    case 'orbitLeft':
    case 'orbitRight': {
      const off = cmd === 'orbitLeft' ? -8 : 8;
      const desired = (enemyDir + off) & 63;
      const d = dirDelta(desired, bot.heading);
      useSteps = d >= 0 ? bot.rotStepsLeft : bot.rotStepsRight;
      target = bot.heading + clamp(d, -useSteps, useSteps);
      break;
    }
    default:
      target = bot.heading;
      break;
  }
  bot.heading = (((target + drift) % 64) + 64) % 64;
}

function thrustDirection(heading: number, move: string): number {
  switch (move) {
    case 'forward':
      return heading & 63;
    case 'backward':
      return (heading + 32) & 63;
    case 'strafeLeft':
      return (heading - 16) & 63;
    case 'strafeRight':
      return (heading + 16) & 63;
    default:
      return -1;
  }
}

function applyThrust(bot: BotRuntime, move: string, rs: Ruleset): void {
  const dir = thrustDirection(bot.heading, move);
  const speed = Math.trunc((rs.FULL_SPEED_PER_TICK * bot.speedMultiplierMilli) / 1000);
  let targetVx = 0;
  let targetVy = 0;
  if (dir >= 0 && speed > 0) {
    const u = dirIndexUnit(dir);
    targetVx = Math.trunc((u[0] * speed) / 1_000_000);
    targetVy = Math.trunc((u[1] * speed) / 1_000_000);
  }
  const dvx = targetVx - bot.vx;
  const dvy = targetVy - bot.vy;
  bot.vx += clamp(dvx, -rs.ACCEL_PER_TICK, rs.ACCEL_PER_TICK);
  bot.vy += clamp(dvy, -rs.ACCEL_PER_TICK, rs.ACCEL_PER_TICK);
  const before = { x: bot.x, y: bot.y };
  bot.x += bot.vx;
  bot.y += bot.vy;
  const lim = rs.ARENA_HALF * 1000 - bot.geom.radiusMilli;
  if (lim > 0) {
    bot.x = clamp(bot.x, -lim, lim);
    bot.y = clamp(bot.y, -lim, lim);
  }
  bot.movedThisTick = isqrt((bot.x - before.x) * (bot.x - before.x) + (bot.y - before.y) * (bot.y - before.y));
  if (speed > 0 && bot.movedThisTick < Math.trunc(speed / 4)) bot.stuckTicks++;
  else bot.stuckTicks = 0;
}

function dirIndexUnit(k: number): readonly [number, number] {
  return ROT64_REF[k & 63]!;
}

interface CandidateHit {
  attacker: BotRuntime;
  defender: BotRuntime;
  attackerTri: number;
  defenderTri: number;
  damage: number;
  impactMul: number;
  commitMul: number;
  orientMul: number;
  advantage: 'adv' | 'neutral' | 'disadv';
  atX: number;
  atY: number;
  nx: number;
  ny: number;
}

function impactMultiplier(rs: Ruleset, approachSpeed: number): number {
  const rMilli = Math.trunc((approachSpeed * rs.TICK_RATE * 1000) / rs.IMPACT_REF_SPEED);
  const capped = Math.min(rMilli, rs.IMPACT_R_MAX);
  return rs.IMPACT_BASE + Math.trunc((rs.IMPACT_RANGE * capped) / 1000);
}

function orientationMultiplier(
  heading: number,
  o: 'up' | 'down',
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): number {
  const face = faceIndex(heading, o);
  const attack = dirIndex(toX - fromX, toY - fromY);
  return ORIENT_LUT[dirAbsDelta(attack, face)]!;
}

function structureUpdate(bot: BotRuntime, tick: number, rs: Ruleset, events: VfxEvent[]): void {
  const motorsBefore = bot.motorAlive;
  let motorsLostLeft = 0;
  let motorsLostRight = 0;
  let motorsLostCenter = 0;
  let changed = false;

  for (let i = 0; i < bot.geom.tris.length; i++) {
    const t = bot.tris[i]!;
    if (!t.alive || t.hp > 0) continue;
    t.hp = 0;
    t.alive = false;
    t.destroyed = true;
    changed = true;
    const g = bot.geom.tris[i]!;
    events.push({
      kind: 'destroy',
      tick,
      at: { x: bot.wc[i * 2]!, y: bot.wc[i * 2 + 1]! },
      tri: i,
      team: bot.team,
      type: g.type,
      by: t.destroyedBy,
    });
    if (g.type === 'motor') {
      if (g.localCentroid.x < -100) motorsLostLeft++;
      else if (g.localCentroid.x > 100) motorsLostRight++;
      else motorsLostCenter++;
    }
  }

  // detach everything no longer edge-connected to the Core
  const n = bot.geom.tris.length;
  const neighbourIdx = bot.geom.neighbourIdx;
  const coreIdx = bot.geom.coreIndex;
  if (!bot.tris[coreIdx]!.alive) {
    bot.coreDestroyed = true;
    bot.alive = false;
    for (let i = 0; i < n; i++) bot.tris[i]!.alive = false;
  } else {
    const seen = new Uint8Array(n);
    const stack: number[] = [coreIdx];
    seen[coreIdx] = 1;
    while (stack.length > 0) {
      const idx = stack.pop()!;
      for (let k = 0; k < 3; k++) {
        const ni = neighbourIdx[idx * 3 + k]!;
        if (ni < 0 || seen[ni] || !bot.tris[ni]!.alive) continue;
        seen[ni] = 1;
        stack.push(ni);
      }
    }
    const detached: number[] = [];
    for (let i = 0; i < n; i++) {
      if (!bot.tris[i]!.alive || seen[i]) continue;
      bot.tris[i]!.alive = false;
      bot.tris[i]!.detachTick = tick;
      detached.push(i);
    }
    if (detached.length > 0) {
      changed = true;
      events.push({ kind: 'detach', tick, team: bot.team, tris: detached });
      for (const i of detached) {
        const g = bot.geom.tris[i]!;
        if (g.type !== 'motor') continue;
        if (g.localCentroid.x < -100) motorsLostLeft++;
        else if (g.localCentroid.x > 100) motorsLostRight++;
        else motorsLostCenter++;
      }
    }
  }

  // Fast path: if nothing died and nothing detached this tick, every derived
  // quantity (counts, diversity max HP, load factor, torque) is bit-identical
  // to last tick, so the O(n) recomputation below is pure no-op work. A 40 s
  // match is ~1200 ticks and most of them destroy nothing, so this is the
  // single biggest win in the tick loop (PLAN.md M1 perf gate: tick p95 < 33 ms).
  if (!changed) return;

  updateCounts(bot);
  recomputeDiversity(bot, rs);

  const lost = motorsBefore - bot.motorAlive;
  if (lost > 0) {
    if (motorsLostLeft > 0 || motorsLostRight > 0 || motorsLostCenter > 0) {
      const side: 'left' | 'right' | 'center' =
        motorsLostLeft >= motorsLostRight && motorsLostLeft >= motorsLostCenter
          ? 'left'
          : motorsLostRight >= motorsLostCenter
            ? 'right'
            : 'center';
      events.push({ kind: 'motorLost', tick, team: bot.team, side, count: lost });
    }
  }

  updateDerived(bot, rs);
  if (!bot.wasOverloaded && bot.effectiveLoadMilli > 2000) {
    bot.wasOverloaded = true;
    events.push({ kind: 'overload', tick, team: bot.team, loadFactor: bot.effectiveLoadMilli });
  }
}

function timeoutScore(rs: Ruleset, a: BotRuntime, b: BotRuntime): { scoreA: number; scoreB: number } {
  const dmgA = a.totalDamageDealt;
  const dmgB = b.totalDamageDealt;
  const maxDmg = Math.max(dmgA, dmgB);
  const normA = maxDmg === 0 ? 0 : Math.trunc((dmgA * 1000) / maxDmg);
  const normB = maxDmg === 0 ? 0 : Math.trunc((dmgB * 1000) / maxDmg);
  const coreA = a.coreMaxHp === 0 ? 0 : Math.trunc((Math.max(0, a.coreHp) * 1000) / a.coreMaxHp);
  const coreB = b.coreMaxHp === 0 ? 0 : Math.trunc((Math.max(0, b.coreHp) * 1000) / b.coreMaxHp);
  const combatA = a.initialCombat === 0 ? 0 : Math.trunc((a.combatAlive * 1000) / a.initialCombat);
  const combatB = b.initialCombat === 0 ? 0 : Math.trunc((b.combatAlive * 1000) / b.initialCombat);
  const motorA = a.initialMotors === 0 ? 0 : Math.trunc((a.motorAlive * 1000) / a.initialMotors);
  const motorB = b.initialMotors === 0 ? 0 : Math.trunc((b.motorAlive * 1000) / b.initialMotors);
  const scoreA = Math.trunc(
    (rs.SCORE_WEIGHT_DAMAGE * normA +
      rs.SCORE_WEIGHT_CORE * coreA +
      rs.SCORE_WEIGHT_COMBAT_TRI * combatA +
      rs.SCORE_WEIGHT_MOTOR * motorA) /
      1000,
  );
  const scoreB = Math.trunc(
    (rs.SCORE_WEIGHT_DAMAGE * normB +
      rs.SCORE_WEIGHT_CORE * coreB +
      rs.SCORE_WEIGHT_COMBAT_TRI * combatB +
      rs.SCORE_WEIGHT_MOTOR * motorB) /
      1000,
  );
  return { scoreA, scoreB };
}

function checkpointOf(bot: BotRuntime): Checkpoint['a'] {
  const tris: TriStateRecord[] = new Array(bot.tris.length);
  for (let i = 0; i < bot.tris.length; i++) {
    const t = bot.tris[i]!;
    tris[i] = {
      alive: t.alive,
      hp: t.hp,
      maxHp: t.maxHp,
      damageReceived: t.damageReceived,
    };
  }
  return {
    x: bot.x,
    y: bot.y,
    heading: bot.heading,
    vx: bot.vx,
    vy: bot.vy,
    loadMilli: bot.loadMilli,
    effectiveLoadMilli: bot.effectiveLoadMilli,
    speedMultiplierMilli: bot.speedMultiplierMilli,
    rotationSteps: bot.rotStepsLeft + bot.rotStepsRight,
    coreHp: bot.coreHp,
    coreMaxHp: bot.coreMaxHp,
    combatAlive: bot.combatAlive,
    motorAlive: bot.motorAlive,
    alive: bot.alive,
    incapTicks: bot.incapTicks,
    ringOutside: bot.ringOutside,
    ringDrainMilli: bot.ringDrainAccum,
    totalDamageDealt: bot.totalDamageDealt,
    tris,
  };
}

function frameOf(bot: BotRuntime): TickFrame['a'] {
  return {
    x: bot.x,
    y: bot.y,
    heading: bot.heading,
    coreHp: bot.coreHp,
    combat: bot.combatAlive,
    motor: bot.motorAlive,
  };
}

function statsOf(bot: BotRuntime, rs: Ruleset): BotStats {
  let hammer = 0;
  let scissor = 0;
  let paper = 0;
  let motor = 0;
  for (const g of bot.geom.tris) {
    if (g.type === 'hammer') hammer++;
    else if (g.type === 'scissor') scissor++;
    else if (g.type === 'paper') paper++;
    else motor++;
  }
  const combat = hammer + scissor + paper;
  return {
    triangles: bot.geom.tris.length,
    combat,
    motors: motor,
    hammer,
    scissor,
    paper,
    loadMilli: bot.lockedLoadMilli,
    speedMultiplierMilli: bot.lockedSpeedMultiplierMilli,
    monoShareMilli: combat === 0 ? 1000 : Math.trunc((Math.max(hammer, scissor, paper) * 1000) / combat),
    spanXMilli: bot.geom.spanX,
    spanYMilli: bot.geom.spanY,
    coreType: bot.geom.tris[bot.geom.coreIndex]!.type,
  };
}

/**
 * Run one deterministic match.
 *
 * Nine steps per tick (gameplay.md 5.2): SENSE, THINK, INTENT, MOVE/ROTATE,
 * COLLISION, DAMAGE, STRUCTURE, WIN CHECK, EVENT LOG. Both Brains read the same
 * pre-tick world and all actions land simultaneously, so neither side is ever
 * punished for being processed second.
 */
export function simulate(pkgA: BotPackage, pkgB: BotPackage, opts: SimOptions): SimResult {
  const rs = opts.ruleset;
  const seed = opts.seed;
  const record = opts.recordReplay !== false;
  const maxTicks = opts.maxTicks ?? rs.MATCH_MAX_TICKS;

  const A = createRuntime('A', pkgA, rs);
  const B = createRuntime('B', pkgB, rs);

  const rng = mulberry32(seed);
  A.y = nextInt(rng, -START_Y_JITTER, START_Y_JITTER);
  A.heading = (nextInt(rng, -START_H_JITTER, START_H_JITTER) + 64) & 63;
  B.y = nextInt(rng, -START_Y_JITTER, START_Y_JITTER);
  B.heading = (32 + nextInt(rng, -START_H_JITTER, START_H_JITTER) + 64) & 63;
  A.x = -START_X_MILLI;
  B.x = START_X_MILLI;
  if (opts.startOverride) {
    const a = opts.startOverride.a;
    const b = opts.startOverride.b;
    if (a?.x !== undefined) A.x = a.x;
    if (a?.y !== undefined) A.y = a.y;
    if (a?.heading !== undefined) A.heading = ((a.heading % 64) + 64) % 64;
    if (b?.x !== undefined) B.x = b.x;
    if (b?.y !== undefined) B.y = b.y;
    if (b?.heading !== undefined) B.heading = ((b.heading % 64) + 64) % 64;
  }

  updateDerived(A, rs);
  updateDerived(B, rs);
  recomputeDiversity(A, rs);
  recomputeDiversity(B, rs);
  // Tiles are built at full HP, so once the opening resonance is known the
  // opening HP must be raised to match it. can_bang.md 6 rule 2 puts the bonus on
  // MAX HP so that a half-damaged tile cannot collect it; if we left HP at the
  // base value the bonus would be pure headroom that no bot can ever reach,
  // because nothing in the game heals. That would make a mixed bot exactly as
  // fragile as a pure one, contradicting "toan than gion hon toi 24%".
  fillToMaxHp(A);
  fillToMaxHp(B);
  updateWorldGeometry(A);
  updateWorldGeometry(B);

  const startPoses = {
    a: { x: A.x, y: A.y, heading: A.heading },
    b: { x: B.x, y: B.y, heading: B.heading },
  };

  const events: VfxEvent[] = [];
  const frames: TickFrame[] = [];
  const checkpoints: Checkpoint[] = [];

  let winner: Team | 'draw' | null = null;
  let reason: 'core' | 'incap' | 'timeout' = 'timeout';
  let endTick = maxTicks;
  let scoreA = 0;
  let scoreB = 0;
  let ringAnnounced = false;

  let digest = 2166136261 >>> 0;
  const mix = (v: number): void => {
    digest ^= v >>> 0;
    digest = Math.imul(digest, 16777619) >>> 0;
  };
  const mixBot = (bot: BotRuntime): void => {
    mix(bot.x);
    mix(bot.y);
    mix(bot.heading);
    mix(bot.vx);
    mix(bot.vy);
    mix(bot.coreHp);
    mix(bot.combatAlive);
    mix(bot.motorAlive);
    mix(bot.speedMultiplierMilli);
    mix(bot.alive ? 1 : 0);
    for (let i = 0; i < bot.tris.length; i++) {
      const t = bot.tris[i]!;
      mix(t.alive ? t.hp + 1 : 0);
    }
  };

  for (let tick = 0; tick < maxTicks; tick++) {
    // ---- 1. SENSE -------------------------------------------------------
    const snapA = buildSnapshot(A, B, tick, rs);
    const snapB = buildSnapshot(B, A, tick, rs);

    // ---- 2. THINK -------------------------------------------------------
    const actA = A.brain.think(snapA);
    const actB = B.brain.think(snapB);
    if (actA.violated) {
      A.violationRun = A.brain.violationRun;
      A.violations = A.brain.violations;
      events.push({ kind: 'brainViolation', tick, team: 'A', count: A.violations });
    }
    if (actB.violated) {
      B.violationRun = B.brain.violationRun;
      B.violations = B.brain.violations;
      events.push({ kind: 'brainViolation', tick, team: 'B', count: B.violations });
    }

    // ---- 3. INTENT + 4. MOVE / ROTATE -----------------------------------
    if (A.alive) {
      applyRotation(A, actA.rotate, B, rs);
      applyThrust(A, actA.move, rs);
    }
    if (B.alive) {
      applyRotation(B, actB.rotate, A, rs);
      applyThrust(B, actB.move, rs);
    }
    updateWorldGeometry(A);
    updateWorldGeometry(B);

    // ---- 5. COLLISION ---------------------------------------------------
    const aInputs: ContactInput[] = [];
    const aIdx: number[] = [];
    for (let i = 0; i < A.tris.length; i++) {
      if (!A.tris[i]!.alive) continue;
      aInputs.push(triInput(A, i));
      aIdx.push(i);
    }
    const bInputs: ContactInput[] = [];
    const bIdx: number[] = [];
    for (let i = 0; i < B.tris.length; i++) {
      if (!B.tris[i]!.alive) continue;
      bInputs.push(triInput(B, i));
      bIdx.push(i);
    }
    const contacts: Contact[] = collectContacts(aInputs, bInputs);

    // ---- 6. DAMAGE ------------------------------------------------------
    const candidates: CandidateHit[] = [];
    for (const c of contacts) {
      const ai = aIdx[c.aTri]!;
      const bi = bIdx[c.bTri]!;

      const impactMul = impactMultiplier(rs, c.approachSpeed);
      const commitA = commitmentMultiplier(rs, c.ownA);
      const commitB = commitmentMultiplier(rs, c.ownB);
      const aType = A.geom.tris[ai]!.type;
      const bType = B.geom.tris[bi]!.type;
      const ax = A.wc[ai * 2]!;
      const ay = A.wc[ai * 2 + 1]!;
      const bx = B.wc[bi * 2]!;
      const by = B.wc[bi * 2 + 1]!;

      if (aType !== 'motor') {
        const orientMul = orientationMultiplier(A.heading, A.geom.tris[ai]!.o, ax, ay, bx, by);
        const rps = rpsMultiplier(rs, aType, bType);
        const dmg = Math.trunc(
          (computeDamage(rs, baseDamage(rs, aType), rps, impactMul, orientMul) * commitA) / 1000,
        );
        if (dmg > 0) {
          candidates.push({
            attacker: A,
            defender: B,
            attackerTri: ai,
            defenderTri: bi,
            damage: dmg,
            impactMul,
            commitMul: commitA,
            orientMul,
            advantage: advantageOf(rs, aType, bType),
            atX: c.px,
            atY: c.py,
            nx: c.nx,
            ny: c.ny,
          });
        }
      }
      if (bType !== 'motor') {
        const orientMul = orientationMultiplier(B.heading, B.geom.tris[bi]!.o, bx, by, ax, ay);
        const rps = rpsMultiplier(rs, bType, aType);
        const dmg = Math.trunc(
          (computeDamage(rs, baseDamage(rs, bType), rps, impactMul, orientMul) * commitB) / 1000,
        );
        if (dmg > 0) {
          candidates.push({
            attacker: B,
            defender: A,
            attackerTri: bi,
            defenderTri: ai,
            damage: dmg,
            impactMul,
            commitMul: commitB,
            orientMul,
            advantage: advantageOf(rs, bType, aType),
            atX: c.px,
            atY: c.py,
            nx: -c.nx,
            ny: -c.ny,
          });
        }
      }
    }

    // per-defender cooldown: at most one hit per defender every HIT_COOLDOWN_TICKS
    const best = new Map<string, CandidateHit>();
    for (const cand of candidates) {
      const d = cand.defender;
      const dt = cand.defenderTri;
      if (tick - d.lastHitTick[dt]! < rs.HIT_COOLDOWN_TICKS) continue;
      const key = `${d.team}:${dt}`;
      const prev = best.get(key);
      if (prev === undefined || cand.damage > prev.damage) best.set(key, cand);
    }

    for (const cand of best.values()) {
      const d = cand.defender;
      const dt = cand.defenderTri;
      const t = d.tris[dt]!;
      if (!t.alive) continue;
      t.hp -= cand.damage;
      t.damageReceived += cand.damage;
      if (t.hp <= 0 && t.destroyedBy === null) t.destroyedBy = cand.attackerTri;
      d.lastHitTick[dt] = tick;
      cand.attacker.totalDamageDealt += cand.damage;
      events.push({
        kind: 'hit',
        tick,
        at: { x: cand.atX, y: cand.atY },
        normal: { x: cand.nx, y: cand.ny },
        attackerTeam: cand.attacker.team,
        attacker: cand.attackerTri,
        defenderTeam: d.team,
        defender: dt,
        damage: cand.damage,
        advantage: cand.advantage,
        impactMul: cand.impactMul,
        commitMul: cand.commitMul,
        orientMul: cand.orientMul,
      });
      if (dt === d.geom.coreIndex) {
        d.coreHp = Math.max(0, t.hp);
        events.push({
          kind: 'coreHit',
          tick,
          team: d.team,
          hpRatio: d.coreMaxHp === 0 ? 0 : Math.trunc((d.coreHp * 1000) / d.coreMaxHp),
        });
      }
    }

    // separation: push the two bodies apart along the deepest contact normal.
    //
    // NOTE: selecting a single deepest contact makes this step depend on contact
    // iteration order whenever two contacts tie on depth, which is why a label
    // swap (A<->B) is not an exact mirror of the match. Averaging every contact
    // normal instead was tried and rejected: it removed the tie dependence but
    // broke the mirrored-identical-bots symmetry that this rule does satisfy, and
    // it changed match dynamics noticeably. See the fairness tests in
    // packages/core/test/determinism.test.ts for what is and is not guaranteed.
    if (contacts.length > 0) {
      let deepest = contacts[0]!;
      for (const c of contacts) if (c.depthMilli > deepest.depthMilli) deepest = c;
      const push = Math.min(deepest.depthMilli, MAX_SEPARATION_PER_TICK);
      const half = Math.trunc(push / 2);
      A.x -= Math.trunc((deepest.nx * half) / 1000);
      A.y -= Math.trunc((deepest.ny * half) / 1000);
      B.x += Math.trunc((deepest.nx * half) / 1000);
      B.y += Math.trunc((deepest.ny * half) / 1000);
    }

    // ring shrink drain, applied to the tile carrying the Core
    const radius = ringRadiusAt(rs, tick);
    if (!ringAnnounced && tick === rs.RING_START_TICK) {
      ringAnnounced = true;
      events.push({ kind: 'ringStart', tick, radius });
    }
    for (const bot of [A, B]) {
      const ci = bot.geom.coreIndex;
      const cx = bot.wc[ci * 2]!;
      const cy = bot.wc[ci * 2 + 1]!;
      const dist = isqrt(cx * cx + cy * cy);
      const outside = dist > radius;
      if (outside !== bot.ringOutside) {
        bot.ringOutside = outside;
        events.push({ kind: outside ? 'ringEnter' : 'ringExit', tick, team: bot.team });
      }
      if (outside && bot.tris[ci]!.alive) {
        const core = bot.tris[ci]!;
        bot.ringDrainAccum += core.maxHp * rs.RING_DRAIN_PERCENT_TICK;
        while (bot.ringDrainAccum >= 1000 && core.hp > 0) {
          core.hp -= 1;
          bot.ringDrainAccum -= 1000;
        }
        bot.coreHp = Math.max(0, core.hp);
      }
    }

    // ---- 7. STRUCTURE ---------------------------------------------------
    structureUpdate(A, tick, rs, events);
    structureUpdate(B, tick, rs, events);
    updateWorldGeometry(A);
    updateWorldGeometry(B);

    // ---- 8. WIN CHECK ---------------------------------------------------
    const aDead = A.coreDestroyed;
    const bDead = B.coreDestroyed;
    if (aDead && bDead) {
      winner = 'draw';
      reason = 'core';
      endTick = tick + 1;
    } else if (aDead) {
      winner = 'B';
      reason = 'core';
      endTick = tick + 1;
    } else if (bDead) {
      winner = 'A';
      reason = 'core';
      endTick = tick + 1;
    }

    if (winner === null) {
      for (const bot of [A, B]) {
        const incapable = bot.combatAlive === 0 || bot.motorAlive === 0;
        bot.incapTicks = incapable ? bot.incapTicks + 1 : 0;
      }
      const aInc = A.incapTicks >= rs.INCAP_TICKS;
      const bInc = B.incapTicks >= rs.INCAP_TICKS;
      if (aInc && bInc) {
        winner = 'draw';
        reason = 'incap';
        endTick = tick + 1;
      } else if (aInc) {
        winner = 'B';
        reason = 'incap';
        endTick = tick + 1;
      } else if (bInc) {
        winner = 'A';
        reason = 'incap';
        endTick = tick + 1;
      }
    }

    if (winner === null) {
      for (const bot of [A, B]) {
        if (bot.violationRun >= rs.BRAIN_VIOLATION_TICKS) {
          winner = bot.team === 'A' ? 'B' : 'A';
          reason = 'incap';
          endTick = tick + 1;
        }
      }
    }

    if (record) {
      frames.push({ tick, a: frameOf(A), b: frameOf(B) });
      if ((tick + 1) % CHECKPOINT_EVERY === 0 || winner !== null) {
        checkpoints.push({ tick, a: checkpointOf(A), b: checkpointOf(B) });
      }
    }

    // ---- 9. EVENT LOG ---------------------------------------------------
    mix(tick);
    mixBot(A);
    mixBot(B);
    if (winner !== null) {
      events.push({ kind: 'matchEnd', tick, winner, reason });
      break;
    }
  }

  if (winner === null) {
    winner = 'draw';
    reason = 'timeout';
    endTick = maxTicks;
    const s = timeoutScore(rs, A, B);
    scoreA = s.scoreA;
    scoreB = s.scoreB;
    if (scoreA > scoreB) winner = 'A';
    else if (scoreB > scoreA) winner = 'B';
    else winner = 'draw';
    events.push({ kind: 'matchEnd', tick: maxTicks - 1, winner, reason: 'timeout' });
    if (record) {
      checkpoints.push({ tick: maxTicks - 1, a: checkpointOf(A), b: checkpointOf(B) });
    }
  }

  if (reason !== 'timeout') {
    const s = timeoutScore(rs, A, B);
    scoreA = s.scoreA;
    scoreB = s.scoreB;
  }

  const matchId = `m${seed}-${pkgA.definitionHash.slice(0, 8)}-${pkgB.definitionHash.slice(0, 8)}`;

  const payload = {
    engineVersion: ENGINE_VERSION,
    rulesetVersion: RULESET_VERSION,
    seed,
    tickRate: rs.TICK_RATE,
    botA: pkgA.definitionHash,
    botB: pkgB.definitionHash,
    startPoses: [
      startPoses.a.x,
      startPoses.a.y,
      startPoses.a.heading,
      startPoses.b.x,
      startPoses.b.y,
      startPoses.b.heading,
    ],
    totalTicks: endTick,
    outcome: { winner, reason, scoreA, scoreB },
    /**
     * The rolling state digest rather than the frame list. The hash must identify
     * the MATCH, so it must not change just because the caller asked for a cheap
     * run with `recordReplay: false`. The digest covers every tick's full state
     * and is computed whether or not frames are being collected.
     */
    stateDigest: digest.toString(16).padStart(8, '0'),
    events,
  };
  const replayHash = hashSimulationPayload(payload);

  const replay: Replay = {
    manifest: {
      version: 1,
      matchId,
      seed,
      engineVersion: ENGINE_VERSION,
      rulesetVersion: RULESET_VERSION,
      tickRate: rs.TICK_RATE,
      totalTicks: endTick,
      maxTicks,
      checkpointEveryTicks: CHECKPOINT_EVERY,
      startPoses: {
        a: { x: startPoses.a.x, y: startPoses.a.y, heading: startPoses.a.heading },
        b: { x: startPoses.b.x, y: startPoses.b.y, heading: startPoses.b.heading },
      },
      botA: { name: A.name, hash: A.hash },
      botB: { name: B.name, hash: B.hash },
      outcome: { winner, reason, ticks: endTick, scoreA, scoreB },
      replayHash,
    },
    frames: record ? frames : [],
    checkpoints: record ? checkpoints : [],
    events,
  };

  const result: MatchResult = {
    matchId,
    seed,
    engineVersion: ENGINE_VERSION,
    rulesetVersion: RULESET_VERSION,
    botA: { name: A.name, hash: A.hash },
    botB: { name: B.name, hash: B.hash },
    outcome: { winner, reason, ticks: endTick, scoreA, scoreB },
    replayHash,
    statsA: statsOf(A, rs),
    statsB: statsOf(B, rs),
  };

  return { result, replay, digest: digest.toString(16).padStart(8, '0') };
}
