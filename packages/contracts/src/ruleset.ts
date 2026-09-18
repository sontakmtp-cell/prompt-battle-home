import { RULESET_VERSION } from './versions.js';

/**
 * UNIT RULE - mandatory, no exceptions (can_bang.md 3.6):
 * every multiplier in the engine is an INTEGER in 1/1000 units.
 * There is no floating point anywhere on the damage path. Mixing floats in makes
 * the integer division return 0 for every hit, which is very hard to spot because
 * the formula still reads correctly.
 *
 * This file is the single source of truth for balance numbers. Nothing balance
 * related is allowed to be hard-coded anywhere else (spec "khong hard-code balance
 * rai rac").
 */
export interface Ruleset {
  version: string;

  // ---- tile stats -------------------------------------------------------
  HAMMER_HP: number;
  HAMMER_DAMAGE: number;
  SCISSOR_HP: number;
  SCISSOR_DAMAGE: number;
  PAPER_HP: number;
  PAPER_DAMAGE: number;
  MOTOR_HP: number;
  MOTOR_DAMAGE: number;

  // ---- rock-paper-scissors multipliers (1/1000) -------------------------
  RPS_ADVANTAGE: number;
  RPS_NEUTRAL: number;
  RPS_DISADVANTAGE: number;
  MOTOR_DAMAGE_MULT: number;

  // ---- impact multiplier (1/1000) ---------------------------------------
  IMPACT_REF_SPEED: number;
  IMPACT_BASE: number;
  IMPACT_RANGE: number;
  IMPACT_R_MAX: number;

  // ---- orientation multiplier (1/1000) ----------------------------------
  ORIENT_BASE: number;
  ORIENT_RANGE: number;
  ORIENT_LUT_STEPS: number;

  // ---- diversity resonance ---------------------------------------------
  DIVERSITY_BONUS_PER_TYPE: number;
  DIVERSITY_MAX_TYPES: number;
  DIVERSITY_COUNT_MOTOR: boolean;

  // ---- mono-culture ceiling --------------------------------------------
  MONO_WARN_THRESHOLD: number;
  MONO_BLOCK_THRESHOLD: number;

  // ---- hit cadence ------------------------------------------------------
  HIT_COOLDOWN_TICKS: number;

  // ---- core -------------------------------------------------------------
  CORE_COUNT: number;
  CORE_ON_MOTOR_ALLOWED: boolean;

  // ---- motor load -------------------------------------------------------
  MOTOR_PULL_PER_MOTOR: number;

  // ---- arena, ring shrink ----------------------------------------------
  ARENA_HALF: number;
  RING_START_TICK: number;
  RING_START_RADIUS: number;
  RING_END_RADIUS: number;
  RING_ANNOUNCE_TICKS: number;
  RING_DRAIN_PERCENT_TICK: number;

  // ---- timeout score weights (1/1000) ----------------------------------
  SCORE_WEIGHT_DAMAGE: number;
  SCORE_WEIGHT_CORE: number;
  SCORE_WEIGHT_COMBAT_TRI: number;
  SCORE_WEIGHT_MOTOR: number;

  // ---- budget and duration ---------------------------------------------
  MAX_TRIANGLES: number;
  MATCH_MAX_TICKS: number;
  TICK_RATE: number;
  MAX_BOT_SPAN: number;

  // ---- brain budget -----------------------------------------------------
  BRAIN_MAX_NODES: number;
  BRAIN_MAX_DEPTH: number;
  BRAIN_MAX_VARS: number;
  BRAIN_MAX_STEPS: number;
  BRAIN_VIOLATION_TICKS: number;

  // ---- incapacity -------------------------------------------------------
  INCAP_TICKS: number;
  MIN_COMBAT_TRIANGLES: number;

  // ---- motion model (derived defaults, tuned in M1) ---------------------
  /** full-speed distance per tick, in milli-units, for a bot at load <= 1.0 */
  FULL_SPEED_PER_TICK: number;
  /** acceleration, milli-units per tick per tick */
  ACCEL_PER_TICK: number;
  /** torque sum that yields TORQUE_REF_STEPS rotation steps per tick */
  TORQUE_REF_MILLI: number;
  TORQUE_REF_STEPS: number;
  TORQUE_MAX_STEPS: number;
  /** passive yaw drift divisor: asym / this = extra steps per tick */
  DRIFT_DIVISOR: number;
  DRIFT_MAX_STEPS: number;
  /** distance between two tile centres that counts as touching, milli-units */
  CONTACT_RADIUS_MILLI: number;
}

/**
 * M1 CALIBRATION - tile HP.
 *
 * can_bang.md 3.2 quotes 70 / 105 / 168 / 80 and requires
 * `mau x sat thuong nen` to be the SAME for all three combat types. It is, and
 * it still is after scaling: 420x24 = 630x16 = 1008x10 = 10080.
 *
 * The absolute scale is the one number the design explicitly hands to
 * measurement (can_bang.md 4: "do truoc, chinh sau"). At the quoted scale the
 * measured median match length was 10-12s, far below the 40-80s acceptance band
 * of check 12, which would leave the ring shrink and the timeout scoring
 * unreachable. Scaling every tile by the same factor lengthens matches without
 * touching a single damage number, so the RPS damage table (can_bang.md 3.7) and
 * the RPS invariant (3.8) stay exactly as written. Base damage is deliberately
 * NOT reduced: can_bang.md 4 forbids it.
 *
 * Measured with tools/experiment-hp2.mjs at 100 matches: median 73s, p10 22s,
 * p90 120s, 11% decided by timeout.
 */
export const HP_SCALE = 6;

export const DEFAULT_RULESET: Ruleset = {
  version: RULESET_VERSION,

  HAMMER_HP: 70 * HP_SCALE,
  HAMMER_DAMAGE: 24,
  SCISSOR_HP: 105 * HP_SCALE,
  SCISSOR_DAMAGE: 16,
  PAPER_HP: 168 * HP_SCALE,
  PAPER_DAMAGE: 10,
  MOTOR_HP: 80 * HP_SCALE,
  MOTOR_DAMAGE: 0,

  RPS_ADVANTAGE: 2000,
  RPS_NEUTRAL: 1000,
  RPS_DISADVANTAGE: 500,
  MOTOR_DAMAGE_MULT: 1000,

  IMPACT_REF_SPEED: 4000,
  IMPACT_BASE: 850,
  IMPACT_RANGE: 150,
  IMPACT_R_MAX: 1000,

  ORIENT_BASE: 850,
  ORIENT_RANGE: 150,
  ORIENT_LUT_STEPS: 64,

  DIVERSITY_BONUS_PER_TYPE: 120,
  DIVERSITY_MAX_TYPES: 3,
  DIVERSITY_COUNT_MOTOR: false,

  MONO_WARN_THRESHOLD: 650,
  MONO_BLOCK_THRESHOLD: 800,

  // Raised from the quoted 6. can_bang.md 4 names the cooldown as the FIRST
  // switch to turn for match length, and can_bang.md 10 check 12 gives the
  // range 10-12. Measured with tools/experiment-duration2.mjs over a 5 bot
  // round robin x 10 seeds (200 matches per configuration):
  //   scale 6, cd  8 -> p50 38.9s  (below the 40-80s band of check 12)
  //   scale 6, cd 10 -> p50 45.7s  (p10 20.9s, p90 107.4s, 4% timeouts)
  //   scale 6, cd 12 -> p50 53.5s
  // cd = 10 cleared the band with the original Spinner, but the fixed Spinner
  // shortened the sample round robin again (p50 back down to 40.0s, a hair
  // under the band). cd = 12 is the doc's upper bound and moves the median
  // clear of the edge. The doc's other numbers are left alone.
  HIT_COOLDOWN_TICKS: 12,

  CORE_COUNT: 1,
  CORE_ON_MOTOR_ALLOWED: false,

  MOTOR_PULL_PER_MOTOR: 4,

  ARENA_HALF: 20,
  RING_START_TICK: 1800,
  RING_START_RADIUS: 28300,
  RING_END_RADIUS: 4000,
  RING_ANNOUNCE_TICKS: 45,
  RING_DRAIN_PERCENT_TICK: 15,

  SCORE_WEIGHT_DAMAGE: 350,
  SCORE_WEIGHT_CORE: 300,
  SCORE_WEIGHT_COMBAT_TRI: 200,
  SCORE_WEIGHT_MOTOR: 150,

  MAX_TRIANGLES: 60,
  MATCH_MAX_TICKS: 3600,
  TICK_RATE: 30,
  MAX_BOT_SPAN: 12,

  BRAIN_MAX_NODES: 256,
  BRAIN_MAX_DEPTH: 16,
  BRAIN_MAX_VARS: 32,
  BRAIN_MAX_STEPS: 1000,
  BRAIN_VIOLATION_TICKS: 30,

  INCAP_TICKS: 300,
  MIN_COMBAT_TRIANGLES: 5,

  FULL_SPEED_PER_TICK: 133,
  ACCEL_PER_TICK: 30,
  TORQUE_REF_MILLI: 90000,
  TORQUE_REF_STEPS: 2,
  TORQUE_MAX_STEPS: 4,
  DRIFT_DIVISOR: 60000,
  DRIFT_MAX_STEPS: 2,
  CONTACT_RADIUS_MILLI: 236,
};

export function createRuleset(overrides: Partial<Ruleset> = {}): Ruleset {
  return { ...DEFAULT_RULESET, ...overrides };
}

/** Orientation lookup table: 64 steps of 5.625 degrees, values already x1000. */
const ORIENT_LUT_HEAD = [
  1000, 999, 997, 994, 989, 982, 975, 966, 956, 945, 933, 921, 907, 894, 879,
  865, 850,
];

export function orientLut(): Int32Array {
  const lut = new Int32Array(64);
  for (let k = 0; k < 64; k++) {
    lut[k] = k < ORIENT_LUT_HEAD.length ? ORIENT_LUT_HEAD[k]! : 850;
  }
  return lut;
}

export const ORIENT_LUT: Int32Array = orientLut();

/**
 * Speed table from gameplay.md 3.4.1. The doc's table gives ONE speed per band,
 * so a band with a single value is flat; only the two upper bands are described
 * as "giam dan" (gradually decreasing) and therefore ramp.
 *
 *   <= 0.50          -> 115%  flat   the "30 combat + 30 motor" band
 *   0.50 .. 1.00     -> 100%  flat
 *   1.00 .. 1.50     -> 100% down to 70%
 *   1.50 .. 2.00     -> 70% down to 40%
 *   > 2.00           -> 15%          overloaded: a stationary fortress
 *
 * Why the 115% band is flat and separate (gameplay.md 3.4.1): the doc justifies
 * the band by the fact that a 30+30 bot (load exactly 0.50) runs 15% faster than
 * a 45+15 bot (load exactly 1.00). That gap only exists if 0.50 is the exclusive
 * floor of the 115% band and 1.00 the flat top of the 100% band. Ramping between
 * them would blur the boundary and hand a partial bonus to every intermediate
 * build, which is precisely what the doc says must not happen.
 *
 * The two ramps are linear, not stepped: the worked table in gameplay.md 3.4.1
 * (a 45 combat + 15 motor bot losing 3 / 5 / 8 / 11 motors -> "~89% / ~78% /
 * ~49% / ~15%") only reproduces with linear ramps. Load factors 1.188, 1.375,
 * 1.857 and 3.063 give 888 / 775 / 486 / 150.
 */
export interface SpeedBand {
  /** load factor at which this band ends, inclusive, in 1/1000 */
  upToMilli: number;
  /** speed at the start of the band, in 1/1000 */
  fromMilli: number;
  /** speed at the end of the band; equal to `fromMilli` for a flat band */
  toMilli: number;
}

export const SPEED_BANDS: readonly SpeedBand[] = [
  { upToMilli: 500, fromMilli: 1150, toMilli: 1150 },
  { upToMilli: 1000, fromMilli: 1000, toMilli: 1000 },
  { upToMilli: 1500, fromMilli: 1000, toMilli: 700 },
  { upToMilli: 2000, fromMilli: 700, toMilli: 400 },
];

/** The band anchors, for tests and tooling that want the raw shape. */
export const SPEED_TABLE: readonly (readonly [number, number])[] = [
  [0, 1150],
  [500, 1150],
  [1000, 1000],
  [1500, 700],
  [2000, 400],
];

/** Above this load factor the bot is pinned to the overload crawl speed. */
export const SPEED_OVERLOAD_LOAD = 2000;
export const SPEED_OVERLOAD_MULT = 150;

export function speedMultiplierFor(loadMilli: number): number {
  let lower = 0;
  for (const band of SPEED_BANDS) {
    if (loadMilli <= band.upToMilli) {
      const rise = band.toMilli - band.fromMilli;
      if (rise === 0) return band.fromMilli;
      const span = band.upToMilli - lower;
      return band.fromMilli + Math.trunc((rise * (loadMilli - lower)) / span);
    }
    lower = band.upToMilli;
  }
  return SPEED_OVERLOAD_MULT;
}

/** True when `speedMultiplierFor` is a step function rather than a ramp here. */
export function speedBandFor(loadMilli: number): SpeedBand {
  for (const band of SPEED_BANDS) if (loadMilli <= band.upToMilli) return band;
  return SPEED_BANDS[SPEED_BANDS.length - 1]!;
}

export const BASE_HP: Record<string, number> = {
  hammer: DEFAULT_RULESET.HAMMER_HP,
  scissor: DEFAULT_RULESET.SCISSOR_HP,
  paper: DEFAULT_RULESET.PAPER_HP,
  motor: DEFAULT_RULESET.MOTOR_HP,
};

export const BASE_DAMAGE: Record<string, number> = {
  hammer: DEFAULT_RULESET.HAMMER_DAMAGE,
  scissor: DEFAULT_RULESET.SCISSOR_DAMAGE,
  paper: DEFAULT_RULESET.PAPER_DAMAGE,
  motor: DEFAULT_RULESET.MOTOR_DAMAGE,
};

export function baseHp(rs: Ruleset, type: string): number {
  switch (type) {
    case 'hammer':
      return rs.HAMMER_HP;
    case 'scissor':
      return rs.SCISSOR_HP;
    case 'paper':
      return rs.PAPER_HP;
    case 'motor':
      return rs.MOTOR_HP;
    default:
      throw new Error(`unknown tile type: ${type}`);
  }
}

export function baseDamage(rs: Ruleset, type: string): number {
  switch (type) {
    case 'hammer':
      return rs.HAMMER_DAMAGE;
    case 'scissor':
      return rs.SCISSOR_DAMAGE;
    case 'paper':
      return rs.PAPER_DAMAGE;
    case 'motor':
      return rs.MOTOR_DAMAGE;
    default:
      throw new Error(`unknown tile type: ${type}`);
  }
}

/** RPS relation: does `attacker` beat `defender`? */
export function rpsMultiplier(rs: Ruleset, attacker: string, defender: string): number {
  if (defender === 'motor') return rs.MOTOR_DAMAGE_MULT;
  if (attacker === 'motor') return 0;
  if (attacker === defender) return rs.RPS_NEUTRAL;
  const beats: Record<string, string> = { hammer: 'scissor', scissor: 'paper', paper: 'hammer' };
  return beats[attacker] === defender ? rs.RPS_ADVANTAGE : rs.RPS_DISADVANTAGE;
}

export function advantageOf(rs: Ruleset, attacker: string, defender: string): 'adv' | 'neutral' | 'disadv' {
  if (defender === 'motor' || attacker === 'motor') return 'neutral';
  const m = rpsMultiplier(rs, attacker, defender);
  if (m > rs.RPS_NEUTRAL) return 'adv';
  if (m < rs.RPS_NEUTRAL) return 'disadv';
  return 'neutral';
}

/**
 * The damage formula (can_bang.md 3.6). All four factors are integers in 1/1000,
 * so this is an integer division and `floor` is free.
 */
export function computeDamage(
  rs: Ruleset,
  base: number,
  rps: number,
  impact: number,
  orient: number,
): number {
  return Math.trunc((base * rps * impact * orient) / 1_000_000_000);
}

/** Ring radius at a given tick, in milli-units. Identical for sim and renderer. */
export function ringRadiusAt(rs: Ruleset, tick: number): number {
  if (tick < rs.RING_START_TICK) return rs.RING_START_RADIUS;
  const total = rs.MATCH_MAX_TICKS - rs.RING_START_TICK;
  const elapsed = Math.min(tick, rs.MATCH_MAX_TICKS) - rs.RING_START_TICK;
  const drop = rs.RING_START_RADIUS - rs.RING_END_RADIUS;
  return rs.RING_START_RADIUS - Math.trunc((drop * elapsed) / total);
}

/**
 * Effective max HP of a tile given how many distinct combat types surround it.
 * can_bang.md 6 caps the resonance at DIVERSITY_MAX_TYPES distinct types
 * (+12% each, so +24% at the cap). Only three combat types exist, so in practice
 * the cap is unreachable, but the ruleset states it and the function honours it
 * rather than trusting the caller to never pass 4.
 */
export function diversityMaxHp(rs: Ruleset, base: number, distinctCombatTypes: number): number {
  const capped = Math.min(distinctCombatTypes, rs.DIVERSITY_MAX_TYPES);
  const extra = Math.max(0, capped - 1);
  return Math.trunc((base * (1000 + rs.DIVERSITY_BONUS_PER_TYPE * extra)) / 1000);
}

export function pullCapacity(rs: Ruleset, motorsAlive: number): number {
  return motorsAlive * rs.MOTOR_PULL_PER_MOTOR;
}

export function loadFactorMilli(rs: Ruleset, bodyLoad: number, motorsAlive: number): number {
  const capacity = pullCapacity(rs, motorsAlive);
  if (capacity <= 0) return 1_000_000; // fully overloaded, cannot move
  return Math.trunc((bodyLoad * 1000) / capacity);
}
