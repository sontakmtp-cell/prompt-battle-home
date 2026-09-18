import type { BotDefinition, Ruleset } from '@promptchien/contracts';
import {
  DEFAULT_RULESET,
  ORIENT_LUT,
  baseDamage,
  computeDamage,
  createRuleset,
  rpsMultiplier,
} from '@promptchien/contracts';
import { simulate } from '../engine/simulate.js';
import { lockBot } from '../bot/package.js';
import { gridToTriangles, coreIndexOf } from '../bots/samples.js';
import {
  FLANKER,
  HAMMER_LEAN,
  MEAT_CUBE,
  MIXED_TRIPLE,
  MOTOR_HUNTER,
  PURE_HAMMER,
  PURE_PAPER,
  PURE_SCISSOR,
  SAMPLE_BOTS,
  SPEAR,
  SPEAR_BLINDFOLD,
} from '../bots/samples.js';

export interface PairResult {
  aWins: number;
  bWins: number;
  draws: number;
  matches: number;
  ticks: number[];
  totalHits: number;
  totalDamage: number;
  impactRMilli: number[];
  reasons: Record<string, number>;
}

export interface HarnessOptions {
  seeds?: number;
  ruleset?: Ruleset;
  /** reduce seed counts for a fast smoke run */
  quick?: boolean;
  onProgress?: (label: string) => void;
}

export interface BalanceCheck {
  id: number;
  name: string;
  criterion: string;
  measured: string;
  status: 'pass' | 'fail' | 'info';
}

export interface BalanceReport {
  generatedWith: { rulesetVersion: string; seeds: number };
  checks: BalanceCheck[];
  duration: { p10: number; p50: number; p90: number; samples: number };
  matchups: Array<{
    a: string;
    b: string;
    aWins: number;
    bWins: number;
    draws: number;
    medianSeconds: number;
  }>;
  findings: string[];
}

function playPair(
  a: BotDefinition,
  b: BotDefinition,
  seeds: number[],
  rs: Ruleset,
  collectEvents: boolean,
): PairResult {
  const pa = lockBot(a, rs);
  const pb = lockBot(b, rs);
  const out: PairResult = {
    aWins: 0,
    bWins: 0,
    draws: 0,
    matches: 0,
    ticks: [],
    totalHits: 0,
    totalDamage: 0,
    impactRMilli: [],
    reasons: {},
  };
  for (const seed of seeds) {
    const { result, replay } = simulate(pa, pb, { seed, ruleset: rs, recordReplay: collectEvents });
    out.matches++;
    out.ticks.push(result.outcome.ticks);
    out.reasons[result.outcome.reason] = (out.reasons[result.outcome.reason] ?? 0) + 1;
    if (result.outcome.winner === 'A') out.aWins++;
    else if (result.outcome.winner === 'B') out.bWins++;
    else out.draws++;
    if (collectEvents) {
      for (const ev of replay.events) {
        if (ev.kind !== 'hit') continue;
        out.totalHits++;
        out.totalDamage += ev.damage;
        const r = Math.trunc(((ev.impactMul - rs.IMPACT_BASE) * 1000) / rs.IMPACT_RANGE);
        out.impactRMilli.push(r);
      }
    }
  }
  return out;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((x, y) => x - y);
  const mid = s.length >> 1;
  return s.length % 2 === 0 ? Math.trunc((s[mid - 1]! + s[mid]!) / 2) : s[mid]!;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((x, y) => x - y);
  const idx = Math.min(s.length - 1, Math.max(0, Math.round(((s.length - 1) * p) / 100)));
  return s[idx]!;
}

function seedList(count: number, salt: number): number[] {
  const out: number[] = [];
  let s = salt >>> 0;
  for (let i = 0; i < count; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    out.push(s % 100000);
  }
  return out;
}

function pct(n: number, total: number): string {
  if (total === 0) return 'n/a';
  return `${((n * 100) / total).toFixed(1)}%`;
}

/** Same body, but one side never rotates to face the enemy. */
/**
 * The geometry-tax pair: two bots that are identical in every countable way
 * (60 tiles, 48 combat, 12 motors, load factor 1.250, same brain) and differ ONLY
 * in shape -- one is broad and shallow, one is narrow and deep. Anything the
 * measurement shows is therefore attributable to shape alone.
 *
 * An earlier version of this pair compared a 60 tile block against an 80 tile
 * wide wing. The wide wing was over the 60 tile budget, so it was not a legal bot
 * and it was also far heavier: the 100/0 result said nothing about geometry.
 */
function wideAndBlock(): { wide: BotDefinition; block: BotDefinition } {
  // 11 wide x 3 deep: frontage 11, 24 combat rhombi + 6 motor rhombi
  const wideRows = ['HHHHHHHHHHH', 'HHHHHHHHHHH', 'HHMMMMMM'];
  // 6 wide x 5 deep: frontage 6, the same 24 + 6 rhombi
  const blockRows = ['HHHHHH', 'HHHHHH', 'HHHHHH', 'HHHHHH', 'MMMMMM'];
  const brain = [{ move: 'forward' as const, rotate: 'toEnemy' as const }];
  const wide: BotDefinition = {
    schemaVersion: 1,
    name: 'WideWing',
    triangles: gridToTriangles(wideRows),
    coreIndex: coreIndexOf(wideRows, 1, 5),
    brain: { version: 1, rules: brain },
  };
  const block: BotDefinition = {
    schemaVersion: 1,
    name: 'Block',
    triangles: gridToTriangles(blockRows),
    coreIndex: coreIndexOf(blockRows, 2, 2),
    brain: { version: 1, rules: brain },
  };
  return { wide, block };
}

/**
 * The nineteen checks from can_bang.md section 10. Every number in the ruleset is
 * a starting point, not a truth: this suite measures and reports, and only the
 * items marked "pass"/"fail" are acceptance criteria.
 */
export function runBalanceSuite(opts: HarnessOptions = {}): BalanceReport {
  const rs = opts.ruleset ?? DEFAULT_RULESET;
  const seedCount = opts.quick ? 8 : (opts.seeds ?? 100);
  const heavyCount = opts.quick ? 6 : Math.max(20, Math.trunc(seedCount / 4));
  const checks: BalanceCheck[] = [];
  const findings: string[] = [];
  const allTicks: number[] = [];
  const matchupRows: BalanceReport['matchups'] = [];
  const report = (label: string) => opts.onProgress?.(label);

  const S1 = seedList(seedCount, 11);
  const S2 = seedList(seedCount, 22);
  const S3 = seedList(seedCount, 33);
  const S4 = seedList(seedCount, 44);
  const S5 = seedList(seedCount, 55);
  const S6 = seedList(seedCount, 66);
  const S7 = seedList(seedCount, 77);
  const S8 = seedList(seedCount, 88);

  const pushMatchup = (a: string, b: string, r: PairResult) => {
    matchupRows.push({
      a,
      b,
      aWins: r.aWins,
      bWins: r.bWins,
      draws: r.draws,
      medianSeconds: median(r.ticks) / rs.TICK_RATE,
    });
    allTicks.push(...r.ticks);
  };

  // ---- 7. RPS invariant (blocking, pure arithmetic) ----------------------
  {
    const pairs: Array<[string, string]> = [
      ['hammer', 'scissor'],
      ['scissor', 'paper'],
      ['paper', 'hammer'],
    ];
    let worstMargin = Number.MAX_SAFE_INTEGER;
    const detail: string[] = [];
    for (const [att, def] of pairs) {
      const weakestAdv = computeDamage(
        rs,
        baseDamage(rs, att),
        rpsMultiplier(rs, att, def),
        rs.IMPACT_BASE,
        rs.ORIENT_BASE,
      );
      const strongestDis = computeDamage(
        rs,
        baseDamage(rs, def),
        rpsMultiplier(rs, def, att),
        rs.IMPACT_R_MAX,
        ORIENT_LUT[0]!,
      );
      const margin = weakestAdv - strongestDis;
      worstMargin = Math.min(worstMargin, margin);
      detail.push(`${att}>${def}: ${weakestAdv} vs ${strongestDis}`);
    }
    checks.push({
      id: 7,
      name: 'RPS invariant',
      criterion: 'weakest advantage hit > strongest disadvantage hit',
      measured: `${detail.join(' | ')} (worst margin ${worstMargin})`,
      status: worstMargin > 0 ? 'pass' : 'fail',
    });
  }

  // ---- 12. match duration -------------------------------------------------
  report('duration: five sample bots round robin');
  const samplePairs: Array<[BotDefinition, BotDefinition]> = [];
  for (let i = 0; i < SAMPLE_BOTS.length; i++) {
    for (let k = i + 1; k < SAMPLE_BOTS.length; k++) {
      samplePairs.push([SAMPLE_BOTS[i]!, SAMPLE_BOTS[k]!]);
    }
  }
  {
    const ticks: number[] = [];
    for (const [a, b] of samplePairs) {
      const r = playPair(a, b, S1, rs, false);
      ticks.push(...r.ticks);
      pushMatchup(a.name, b.name, r);
    }
    const p10 = percentile(ticks, 10) / rs.TICK_RATE;
    const p50 = median(ticks) / rs.TICK_RATE;
    const p90 = percentile(ticks, 90) / rs.TICK_RATE;
    checks.push({
      id: 12,
      name: 'Match duration',
      criterion: 'median between 40s and 80s',
      measured: `p10 ${p10.toFixed(1)}s, p50 ${p50.toFixed(1)}s, p90 ${p90.toFixed(1)}s over ${ticks.length} matches`,
      status: p50 >= 40 && p50 <= 80 ? 'pass' : 'fail',
    });
    findings.push(
      `Duration spread: p10 ${p10.toFixed(1)}s / p50 ${p50.toFixed(1)}s / p90 ${p90.toFixed(1)}s.`,
    );
  }

  // ---- 1. pure hammer vs pure paper --------------------------------------
  report('pure hammer vs pure paper');
  {
    const r = playPair(PURE_HAMMER, PURE_PAPER, S2, rs, false);
    pushMatchup('PureHammer', 'PurePaper', r);
    const winRate = (r.aWins * 100) / r.matches;
    checks.push({
      id: 1,
      name: 'Hammer (pure) vs Paper (pure)',
      criterion: 'paper must dominate hammer; hammer win rate reported',
      measured: `hammer ${pct(r.aWins, r.matches)}, paper ${pct(r.bWins, r.matches)}, draw ${pct(r.draws, r.matches)}`,
      status: 'info',
    });
    findings.push(`Pure hammer wins ${winRate.toFixed(1)}% against pure paper.`);
  }

  // ---- 2. mixed triple vs each pure --------------------------------------
  report('mixed triple vs pure bots');
  const mixedVsPure: Array<{ pure: string; r: PairResult }> = [];
  {
    for (const [pure, name, seeds] of [
      [PURE_HAMMER, 'PureHammer', S3] as const,
      [PURE_SCISSOR, 'PureScissor', S4] as const,
      [PURE_PAPER, 'PurePaper', S5] as const,
    ]) {
      const r = playPair(MIXED_TRIPLE, pure, seeds, rs, false);
      pushMatchup('MixedTriple', name, r);
      mixedVsPure.push({ pure: name, r });
    }
    const wonAll = mixedVsPure.every((m) => m.r.aWins > m.r.bWins);
    checks.push({
      id: 2,
      name: 'Mixed triple vs every pure bot',
      criterion: 'the mixed bot must win all three matchups',
      measured: mixedVsPure
        .map((m) => `${m.pure}: ${pct(m.r.aWins, m.r.matches)} vs ${pct(m.r.bWins, m.r.matches)}`)
        .join(' | '),
      status: wonAll ? 'pass' : 'fail',
    });
  }

  // ---- 3. pure paper mirror ----------------------------------------------
  report('pure paper mirror');
  {
    const r = playPair(PURE_PAPER, PURE_PAPER, S6, rs, false);
    pushMatchup('PurePaper', 'PurePaper', r);
    const timeouts = r.reasons['timeout'] ?? 0;
    checks.push({
      id: 3,
      name: 'Paper vs Paper mirror',
      criterion: 'report how often the mirror drags to timeout',
      measured: `${pct(timeouts, r.matches)} decided by timeout, median ${(median(r.ticks) / rs.TICK_RATE).toFixed(1)}s`,
      status: 'info',
    });
  }

  // ---- 4. diversity bonus rate -------------------------------------------
  report('diversity bonus sweep 0 / 8 / 12 / 16 %');
  {
    const rows: string[] = [];
    for (const rate of [0, 80, 120, 160]) {
      const rs2 = createRuleset({ DIVERSITY_BONUS_PER_TYPE: rate });
      const r = playPair(MIXED_TRIPLE, PURE_HAMMER, S7, rs2, false);
      rows.push(`${rate / 10}% -> mixed ${pct(r.aWins, r.matches)}`);
    }
    checks.push({
      id: 4,
      name: 'Diversity bonus sweep',
      criterion: 'report mixed-bot win rate at 0 / 8 / 12 / 16 %',
      measured: rows.join(' | '),
      status: 'info',
    });
  }

  // ---- 5. mono ceiling ----------------------------------------------------
  {
    checks.push({
      id: 5,
      name: 'Mono-culture ceiling',
      criterion: 'warn above 65%, block switch above 80% (off by default)',
      measured: `MONO_WARN_THRESHOLD=${rs.MONO_WARN_THRESHOLD}, MONO_BLOCK_THRESHOLD=${rs.MONO_BLOCK_THRESHOLD}`,
      status: 'info',
    });
  }

  // ---- 6. 70% hammer bot stays alive -------------------------------------
  report('70/30 hammer-lean bot vs pure bots');
  {
    const rows: string[] = [];
    let survived = false;
    for (const [pure, name, seeds] of [
      [PURE_HAMMER, 'PureHammer', S8] as const,
      [PURE_SCISSOR, 'PureScissor', S1] as const,
      [PURE_PAPER, 'PurePaper', S2] as const,
    ]) {
      const r = playPair(HAMMER_LEAN, pure, seeds, rs, false);
      pushMatchup('HammerLean', name, r);
      const rate = (r.aWins * 100) / r.matches;
      if (rate >= 25) survived = true;
      rows.push(`${name}: ${rate.toFixed(0)}%`);
    }
    checks.push({
      id: 6,
      name: 'Hammer-lean bot (70/30) stays viable',
      criterion: 'must not be crushed in every matchup (>= 25% in at least one)',
      measured: rows.join(' | '),
      status: survived ? 'pass' : 'fail',
    });
  }

  // ---- 8 / 18. impact reference calibration ------------------------------
  report('impact reference calibration');
  {
    // can_bang.md 10 check 18 defines the scenario explicitly: "a balanced bot
    // charging at full speed into a stationary bot - measure the actual r". The
    // pass/fail number is therefore taken from that scenario, which is the only
    // thing that tells us IMPACT_REF_SPEED is calibrated rather than pinned.
    //
    // The median over EVERY hit in a round robin is kept as an info line: it is
    // a useful wider view, but it mixes in glancing contacts and (once the
    // impact term is priced per side) it no longer measures calibration at all.
    const chargeRows = ['HHHHH', 'HHHHH', 'HHHHH', 'HHHHH', 'MMMMM', 'MMMMM'];
    const stander: BotDefinition = {
      schemaVersion: 1,
      name: 'CalibStander',
      triangles: gridToTriangles(chargeRows),
      coreIndex: coreIndexOf(chargeRows, 2, 2),
      brain: { version: 1, rules: [{ move: 'hold', rotate: 'hold' }] },
    };
    const charger: BotDefinition = {
      schemaVersion: 1,
      name: 'CalibCharger',
      triangles: gridToTriangles(chargeRows),
      coreIndex: coreIndexOf(chargeRows, 2, 2),
      brain: { version: 1, rules: [{ move: 'forward', rotate: 'toEnemy' }] },
    };
    // playPair mixes both teams' hits, so the charging side's approach has to be
    // collected separately - the stander's hits all carry r = 0 by definition.
    const ph = lockBot(charger, rs);
    const ps = lockBot(stander, rs);
    const chargeR: number[] = [];
    for (const seed of S3) {
      const { replay } = simulate(ph, ps, { seed, ruleset: rs, recordReplay: true });
      for (const ev of replay.events) {
        if (ev.kind !== 'hit' || ev.attackerTeam !== 'A') continue;
        chargeR.push(Math.trunc(((ev.impactMul - rs.IMPACT_BASE) * 1000) / rs.IMPACT_RANGE));
      }
    }
    const rMilli = chargeR.length > 0 ? median(chargeR) : 0;

    const wide = playPair(MIXED_TRIPLE, PURE_HAMMER, S3, rs, true);
    const wideMilli = wide.impactRMilli.length > 0 ? median(wide.impactRMilli) : 0;

    checks.push({
      id: 8,
      name: 'IMPACT_REF_SPEED calibration (r)',
      criterion: 'median r between 0.80 and 1.20',
      measured:
        `charger-vs-stander median r = ${(rMilli / 1000).toFixed(3)} over ${chargeR.length} hits ` +
        `(round-robin median ${(wideMilli / 1000).toFixed(3)} over ${wide.impactRMilli.length} hits, info)`,
      status: rMilli >= 800 && rMilli <= 1200 ? 'pass' : 'fail',
    });
    // NOTE: not Math.min(...arr) - a full 100-seed sweep produces far more hits
    // than the engine can spread onto the argument stack (RangeError).
    let rMin = Number.MAX_SAFE_INTEGER;
    let rMax = 0;
    for (const v of chargeR) {
      if (v < rMin) rMin = v;
      if (v > rMax) rMax = v;
    }
    checks.push({
      id: 18,
      name: 'IMPACT_REF_SPEED stays off the rails',
      criterion: 'r must not be pinned at the floor or the ceiling',
      measured: `min ${(rMin / 1000).toFixed(3)}, max ${(rMax / 1000).toFixed(3)}`,
      status: 'info',
    });
  }

  // ---- 9. real damage vs the perfect-hit table ---------------------------
  {
    const r = playPair(MIXED_TRIPLE, PURE_HAMMER, S4, rs, true);
    const avg = r.totalHits === 0 ? 0 : r.totalDamage / r.totalHits;
    checks.push({
      id: 9,
      name: 'Average damage per hit in a real match',
      criterion: 'reported; the table is the perfect-hit ceiling',
      measured: `${avg.toFixed(2)} damage/hit over ${r.totalHits} hits (perfect-hit table: hammer 24/48/12, scissor 8/16/32, paper 20/5/10)`,
      status: 'info',
    });
  }

  // ---- 10. does the brain cash in the orientation multiplier? ------------
  report('facing brain vs blind brain, same body');
  {
    // Controlled comparison. Comparing SPEAR with SPEAR_BLINDFOLD would be
    // confounded: SPEAR also carries a back-off rule (`stuckTicks > 12`), so a
    // result could come from either change. Here the body and the movement rule
    // are identical and the ONLY difference is whether the bot turns to face the
    // enemy, which is what the orientation multiplier actually pays for.
    const facing: BotDefinition = {
      ...SPEAR,
      name: 'Facing',
      brain: { version: 1, rules: [{ move: 'forward', rotate: 'toEnemy' }] },
    };
    const blind: BotDefinition = {
      ...SPEAR,
      name: 'Blind',
      brain: { version: 1, rules: [{ move: 'forward', rotate: 'hold' }] },
    };
    const r = playPair(facing, blind, S5, rs, false);
    pushMatchup('Facing', 'Blind', r);
    const rate = (r.aWins * 100) / r.matches;
    checks.push({
      id: 10,
      name: 'Brain earns the orientation multiplier',
      criterion: 'turning to face the enemy must beat not turning, by more than 10 points',
      measured: `facing ${rate.toFixed(1)}% vs blind ${pct(r.bWins, r.matches)}`,
      status: rate - (r.bWins * 100) / r.matches > 10 ? 'pass' : 'fail',
    });

    // kept for reference: the full SPEAR also carries a back-off rule
    const ref = playPair(SPEAR, SPEAR_BLINDFOLD, S5, rs, false);
    pushMatchup('Spear', 'SpearBlindfold', ref);
    if (ref.bWins > ref.aWins) {
      findings.push(
        'SPEAR loses to its own blindfold variant, and the controlled run above shows why: the gap is not ' +
          'the facing logic but SPEAR\'s back-off rule (`stuckTicks > 12`). Disengaging from a grinder ' +
          'costs more than the facing logic earns, so the sample brain is worth revisiting.',
      );
    }
  }

  // ---- 11. up/down interleaving ------------------------------------------
  {
    checks.push({
      id: 11,
      name: 'Up/down face coverage',
      criterion: 'report whether interleaving is a design choice or a lattice property',
      measured:
        'on this triangular lattice every edge neighbour of an "up" tile is a "down" tile and vice versa, ' +
        'so a connected body is bipartite by orientation and always covers both faces',
      status: 'info',
    });
    findings.push(
      'Face coverage is structural: a connected body on a triangular lattice cannot be single-orientation, ' +
        'so the "interleave up and down tiles" decision is not available as a separate tactical choice.',
    );
  }

  // ---- 13. motor hunting leverage ----------------------------------------
  report('motor hunter vs balanced bot');
  {
    const r = playPair(MOTOR_HUNTER, MIXED_TRIPLE, S6, rs, false);
    pushMatchup('MotorHunter', 'MixedTriple', r);
    const rate = (r.aWins * 100) / r.matches;
    checks.push({
      id: 13,
      name: 'Motor hunting leverage',
      criterion: 'hammer-heavy motor hunter must not win more than 70%',
      measured: `hunter wins ${rate.toFixed(1)}% (balanced ${pct(r.bWins, r.matches)}, draw ${pct(r.draws, r.matches)})`,
      status: rate <= 70 ? 'pass' : 'fail',
    });
  }

  // ---- 14. does standing still pay? --------------------------------------
  report('stand-and-rotate vs charge');
  {
    const holdRows = ['HHHHH', 'HHHHH', 'HHHHH', 'HHHHH', 'MMMMM', 'MMMMM'];
    const holder: BotDefinition = {
      schemaVersion: 1,
      name: 'Holder',
      triangles: gridToTriangles(holdRows),
      coreIndex: coreIndexOf(holdRows, 2, 2),
      brain: { version: 1, rules: [{ move: 'hold', rotate: 'toEnemy' }] },
    };
    const charger: BotDefinition = {
      schemaVersion: 1,
      name: 'Charger',
      triangles: gridToTriangles(holdRows),
      coreIndex: coreIndexOf(holdRows, 2, 2),
      brain: { version: 1, rules: [{ move: 'forward', rotate: 'toEnemy' }] },
    };
    const ph = lockBot(holder, rs);
    const pc = lockBot(charger, rs);
    let holderDamage = 0;
    let chargerDamage = 0;
    const runs = opts.quick ? 3 : 12;
    for (let i = 0; i < runs; i++) {
      const { replay } = simulate(ph, pc, {
        seed: 4000 + i,
        ruleset: rs,
        maxTicks: 900,
        recordReplay: true,
      });
      for (const ev of replay.events) {
        if (ev.kind !== 'hit') continue;
        if (ev.attackerTeam === 'A') holderDamage += ev.damage;
        else chargerDamage += ev.damage;
      }
    }
    const ratio = chargerDamage === 0 ? 1000 : Math.trunc((holderDamage * 1000) / chargerDamage);
    checks.push({
      id: 14,
      name: 'Defending is not free',
      criterion: 'the standing bot must deal less than 80% of the charging bot damage',
      measured: `stander ${holderDamage} vs charger ${chargerDamage} (${(ratio / 10).toFixed(1)}%) over ${runs} x 30s`,
      status: ratio < 800 ? 'pass' : 'fail',
    });
  }

  // ---- 15. is flanking alive? --------------------------------------------
  report('flanker round robin');
  {
    const r = playPair(FLANKER, SPEAR, S7, rs, false);
    pushMatchup('Flanker', 'Spear', r);
    const flankRate = (r.aWins * 100) / r.matches;
    checks.push({
      id: 15,
      name: 'Flanking is still viable',
      criterion: 'flanker must take at least 40% overall and beat spear at least once in ten',
      measured: `flanker vs spear: ${flankRate.toFixed(1)}% (${r.aWins}/${r.matches})`,
      status: flankRate >= 40 && r.aWins >= 1 ? 'pass' : 'fail',
    });
  }

  // ---- 16. geometry tax ---------------------------------------------------
  report('wide wing vs compact block');
  {
    const { wide, block } = wideAndBlock();
    const r = playPair(block, wide, S8, rs, false);
    pushMatchup('Block', 'WideWing', r);
    const blockRate = (r.aWins * 100) / r.matches;
    checks.push({
      id: 16,
      name: 'Geometry tax on wide wings',
      criterion: 'the compact block must not win more than 75%',
      measured: `block wins ${blockRate.toFixed(1)}% (wide ${pct(r.bWins, r.matches)})`,
      status: blockRate <= 75 ? 'pass' : 'fail',
    });
  }

  // ---- 17. is the diversity resonance actually needed? -------------------
  report('mixed vs pure with the resonance switched off');
  {
    const rs0 = createRuleset({ DIVERSITY_BONUS_PER_TYPE: 0 });
    const rows: string[] = [];
    let winsWith = 0;
    let winsWithout = 0;
    const targets: Array<[BotDefinition, string]> = [
      [PURE_HAMMER, 'PureHammer'],
      [PURE_SCISSOR, 'PureScissor'],
      [PURE_PAPER, 'PurePaper'],
    ];
    for (const [pure, name] of targets) {
      const withBonus = playPair(MIXED_TRIPLE, pure, S1, rs, false);
      const without = playPair(MIXED_TRIPLE, pure, S1, rs0, false);
      if (withBonus.aWins > withBonus.bWins) winsWith++;
      if (without.aWins > without.bWins) winsWithout++;
      rows.push(
        `${name}: with ${pct(withBonus.aWins, withBonus.matches)} / without ${pct(without.aWins, without.matches)}`,
      );
    }
    checks.push({
      id: 17,
      name: 'Diversity resonance necessity',
      criterion: 'if the mixed bot wins either way, the resonance is a tax not a shield',
      measured: rows.join(' | '),
      status: 'info',
    });
    findings.push(
      winsWithout === winsWith
        ? 'Mixed bot wins the same matchups with and without the resonance: the resonance is not decisive, ' +
          'it only taxes non-mixing bots. Consider dropping it to reduce complexity (can_bang.md 6.5).'
        : 'The resonance changes outcomes, so it is carrying real weight.',
    );
  }

  // ---- 19. damage must never make you faster -----------------------------
  report('meat cube: heavy damage must not speed it up');
  {
    const r = playPair(MEAT_CUBE, MIXED_TRIPLE, S2, rs, false);
    pushMatchup('MeatCube', 'MixedTriple', r);
    const pc = lockBot(MEAT_CUBE, rs);
    const po = lockBot(MIXED_TRIPLE, rs);
    let violations = 0;
    let checked = 0;
    for (const seed of S2.slice(0, Math.min(8, S2.length))) {
      const { replay } = simulate(pc, po, { seed, ruleset: rs, recordReplay: true });
      const cps = replay.checkpoints.filter((c) => c.a.alive);
      if (cps.length < 2) continue;
      const first = cps[0]!;
      const last = cps[cps.length - 1]!;
      checked++;
      if (last.a.speedMultiplierMilli > first.a.speedMultiplierMilli) violations++;
    }
    checks.push({
      id: 19,
      name: 'Damage never makes a bot faster',
      criterion: 'effective speed multiplier at the end <= at the start',
      measured: `${violations} violations in ${checked} matches`,
      status: violations === 0 ? 'pass' : 'fail',
    });
  }

  // ---- 20. load factor drops a full speed band on motor loss -------------
  report('motor loss drops a speed band');
  {
    const r = playPair(MIXED_TRIPLE, PURE_HAMMER, S3, rs, false);
    pushMatchup('MixedTriple', 'PureHammer', r);
    const p1 = lockBot(MIXED_TRIPLE, rs);
    const p2 = lockBot(PURE_HAMMER, rs);
    let drops = 0;
    let losses = 0;
    for (const seed of S3.slice(0, Math.min(8, S3.length))) {
      const { replay } = simulate(p1, p2, { seed, ruleset: rs, recordReplay: true });
      for (let i = 1; i < replay.checkpoints.length; i++) {
        const prev = replay.checkpoints[i - 1]!;
        const cur = replay.checkpoints[i]!;
        if (cur.a.motorAlive < prev.a.motorAlive) {
          losses++;
          if (cur.a.speedMultiplierMilli < prev.a.speedMultiplierMilli) drops++;
        }
      }
    }
    checks.push({
      id: 20,
      name: 'Losing motors costs speed',
      criterion: 'a motor loss between checkpoints must not leave speed unchanged',
      measured: `${drops}/${losses} motor-loss events also dropped the speed multiplier`,
      status: losses === 0 || drops > 0 ? 'pass' : 'fail',
    });
  }

  const allDurations = allTicks.map((t) => t / rs.TICK_RATE);
  const duration = {
    p10: percentile(allDurations, 10),
    p50: median(allDurations),
    p90: percentile(allDurations, 90),
    samples: allDurations.length,
  };

  // ---- extra sample-bot spread -------------------------------------------
  const spread = new Map<string, { w: number; n: number }>();
  for (const row of matchupRows) {
    const a = spread.get(row.a) ?? { w: 0, n: 0 };
    a.w += row.aWins;
    a.n += row.aWins + row.bWins + row.draws;
    spread.set(row.a, a);
    const b = spread.get(row.b) ?? { w: 0, n: 0 };
    b.w += row.bWins;
    b.n += row.aWins + row.bWins + row.draws;
    spread.set(row.b, b);
  }
  const spreadLine = [...spread.entries()]
    .filter(([, v]) => v.n > 0)
    .map(([k, v]) => `${k} ${((v.w * 100) / v.n).toFixed(0)}%`)
    .join(', ');
  findings.push(`Overall win share across all measured matchups: ${spreadLine}.`);

  return {
    generatedWith: { rulesetVersion: rs.version, seeds: seedCount },
    checks,
    duration,
    matchups: matchupRows,
    findings,
  };
}
