import type { BrainDefinition } from './brain.js';

/** A / B are the two sides of the arena. A always starts on the left, B on the right. */
export type Team = 'A' | 'B';

/** The four kinds of tile the whole bot is built from (gameplay.md 3.4). */
export type TriType = 'hammer' | 'scissor' | 'paper' | 'motor';

/**
 * Apex direction of a triangle in the bot's local frame.
 * 'up' triangles point along the bot's forward axis, 'down' triangles point backwards.
 * This is the only thing the orientation multiplier cares about (can_bang.md 3.4).
 */
export type TriOrientation = 'up' | 'down';

export type CombatType = 'hammer' | 'scissor' | 'paper';

export const COMBAT_TYPES: readonly CombatType[] = ['hammer', 'scissor', 'paper'];

export function isCombatType(t: TriType): t is CombatType {
  return t === 'hammer' || t === 'scissor' || t === 'paper';
}

/** One tile on the triangular lattice, addressed by lattice coordinates. */
export interface TriCell {
  /** lattice row (0 is the front-most row of the bot's local frame) */
  r: number;
  /** lattice column within the row */
  j: number;
  /** apex direction, local frame */
  o: TriOrientation;
  type: TriType;
}

export interface BotDefinition {
  schemaVersion: number;
  name: string;
  /** Every tile of the body. Order is meaningful: index is the stable TriId. */
  triangles: TriCell[];
  /** Index into `triangles` of the tile that carries the Core. Must be a combat tile. */
  coreIndex: number;
  brain: BrainDefinition;
}

/** A locked, immutable version of a bot (gameplay.md 4.3). */
export interface BotPackage {
  packageId: string;
  definition: BotDefinition;
  /** sha256 over the canonical normalised definition */
  definitionHash: string;
  engineVersion: string;
  rulesetVersion: string;
  /**
   * Load factor at lock time, in 1/1000 units. The engine never lets a bot move
   * faster than this factor allows (can_bang.md 6.7).
   */
  lockedLoadMilli: number;
  /** Deterministic ordinal, never wall-clock. */
  revision: number;
}

export type IssueSeverity = 'error' | 'warning';

export interface ValidationIssue {
  code: string;
  severity: IssueSeverity;
  message: string;
  path?: string;
}

export interface BotStats {
  triangles: number;
  combat: number;
  motors: number;
  hammer: number;
  scissor: number;
  paper: number;
  /** bodyLoad / pullCapacity, in 1/1000 units */
  loadMilli: number;
  /** speed multiplier from the load table, in 1/1000 units */
  speedMultiplierMilli: number;
  /** largest single combat type share of all combat tiles, in 1/1000 units */
  monoShareMilli: number;
  spanXMilli: number;
  spanYMilli: number;
  coreType: TriType;
}

export interface SandboxPositionReport {
  seed: number;
  startDistanceMilli: number;
  minDistanceMilli: number;
  ticksToContact: number | null;
  contactTicks: number;
  movedMilli: number;
  damageDealt: number;
  passed: boolean;
  failure: string | null;
}

export interface SandboxReport {
  passed: boolean;
  positions: SandboxPositionReport[];
}

export interface ValidationReport {
  botHash: string;
  engineVersion: string;
  rulesetVersion: string;
  ok: boolean;
  issues: ValidationIssue[];
  stats: BotStats | null;
  sandbox: SandboxReport | null;
}

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed';
export type JobKind = 'validation' | 'simulation' | 'official-match';

export interface SimulationJob {
  id: string;
  kind: JobKind;
  status: JobStatus;
  /** deterministic ordinal; wall-clock timestamps stay out of the core */
  ordinal: number;
  botHash: string | null;
  opponentHash: string | null;
  seed: number;
  resultRef: string | null;
  error: string | null;
}

export interface MatchOutcome {
  winner: Team | 'draw';
  reason: 'core' | 'incap' | 'timeout';
  ticks: number;
  /** weighted timeout score in 1/1000 units */
  scoreA: number;
  scoreB: number;
}

export interface MatchResult {
  matchId: string;
  seed: number;
  engineVersion: string;
  rulesetVersion: string;
  botA: { name: string; hash: string };
  botB: { name: string; hash: string };
  outcome: MatchOutcome;
  replayHash: string;
  statsA: BotStats;
  statsB: BotStats;
}

export interface PoseRecord {
  x: number;
  y: number;
  heading: number;
}

export interface ReplayManifest {
  version: number;
  matchId: string;
  seed: number;
  engineVersion: string;
  rulesetVersion: string;
  tickRate: number;
  totalTicks: number;
  /**
   * The tick ceiling this match was run with. Stored so a replay can be
   * recomputed from the file alone: a match that ended on the timeout score is
   * only reproducible if the verifier uses the same ceiling.
   */
  maxTicks: number;
  checkpointEveryTicks: number;
  /** opening poses, so the replay can be recomputed from scratch */
  startPoses: { a: PoseRecord; b: PoseRecord };
  botA: { name: string; hash: string };
  botB: { name: string; hash: string };
  outcome: MatchOutcome;
  replayHash: string;
}

/** One tile's state inside a checkpoint. */
export interface TriStateRecord {
  alive: boolean;
  hp: number;
  maxHp: number;
  /** total damage this tile has taken, cumulative (ky_thuat_my_thuat.md 4.6) */
  damageReceived: number;
}

export interface BotCheckpoint {
  x: number;
  y: number;
  heading: number;
  vx: number;
  vy: number;
  loadMilli: number;
  effectiveLoadMilli: number;
  speedMultiplierMilli: number;
  rotationSteps: number;
  coreHp: number;
  coreMaxHp: number;
  combatAlive: number;
  motorAlive: number;
  alive: boolean;
  incapTicks: number;
  ringOutside: boolean;
  ringDrainMilli: number;
  totalDamageDealt: number;
  tris: TriStateRecord[];
}

/** Per-tick pose stream. Kept small; the full tile detail lives in checkpoints. */
export interface TickFrame {
  tick: number;
  a: { x: number; y: number; heading: number; coreHp: number; combat: number; motor: number };
  b: { x: number; y: number; heading: number; coreHp: number; combat: number; motor: number };
}

export interface Checkpoint {
  tick: number;
  a: BotCheckpoint;
  b: BotCheckpoint;
}

/**
 * Engine -> presentation contract (ky_thuat_my_thuat.md 2.1).
 * The engine emits facts only; it never knows anything about colour or particles.
 */
export type VfxEvent =
  | {
      kind: 'hit';
      tick: number;
      at: { x: number; y: number };
      normal: { x: number; y: number };
      attackerTeam: Team;
      attacker: number;
      defenderTeam: Team;
      defender: number;
      damage: number;
      advantage: 'adv' | 'neutral' | 'disadv';
      impactMul: number;
      /** commitment factor (1/1000) from the attacker's own closing speed */
      commitMul: number;
      orientMul: number;
    }
  | {
      kind: 'destroy';
      tick: number;
      at: { x: number; y: number };
      tri: number;
      team: Team;
      type: TriType;
      by: number | null;
    }
  | { kind: 'detach'; tick: number; team: Team; tris: number[] }
  | {
      kind: 'motorLost';
      tick: number;
      team: Team;
      side: 'left' | 'right' | 'center';
      count: number;
    }
  | { kind: 'overload'; tick: number; team: Team; loadFactor: number }
  | { kind: 'coreHit'; tick: number; team: Team; hpRatio: number }
  | { kind: 'coreDestroyed'; tick: number; team: Team; at: { x: number; y: number } }
  | { kind: 'ringStart'; tick: number; radius: number }
  | { kind: 'ringEnter'; tick: number; team: Team }
  | { kind: 'ringExit'; tick: number; team: Team }
  | { kind: 'brainViolation'; tick: number; team: Team; count: number }
  | {
      kind: 'matchEnd';
      tick: number;
      winner: Team | 'draw';
      reason: 'core' | 'incap' | 'timeout';
    };

export interface Replay {
  manifest: ReplayManifest;
  frames: TickFrame[];
  checkpoints: Checkpoint[];
  events: VfxEvent[];
}
