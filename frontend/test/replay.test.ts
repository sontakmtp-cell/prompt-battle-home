/**
 * Checks that `ReplayView` reconstructs the true per-tile state at any tick.
 *
 * The viewer does not read tile HP straight out of the replay: it takes the
 * nearest earlier checkpoint and replays the damage/destruction events forward
 * (see the comment block in src/lab/replay.ts for why). That reconstruction is
 * only trustworthy if it lands exactly on the engine's own checkpoints, which is
 * what this test asserts: at every checkpoint tick, the reconstructed tile HP,
 * alive flags, max HP and cumulative damage must equal what the engine recorded.
 *
 * It also checks the pose interpolation stays inside the frames it interpolates
 * between, and that the damage map is monotonic (damage received only ever goes
 * up, so the map can only get hotter as the replay is scrubbed forward).
 *
 * Run: npx tsx frontend/test/replay.test.ts
 */
import { DEFAULT_RULESET } from '@promptchien/contracts';
import { SAMPLE_BOTS, lockBot, simulate } from '@promptchien/core';
import { ReplayView } from '../src/lab/replay.js';

let failures = 0;

function fail(msg: string): void {
  failures++;
  console.log(`  FAIL ${msg}`);
}

function ok(msg: string): void {
  console.log(`  ok   ${msg}`);
}

console.log('ReplayView reconstruction');

const rs = DEFAULT_RULESET;
const [spear, shield, flanker, spinner, glassCannon] = SAMPLE_BOTS;

const pairs: Array<[string, typeof spear, typeof spear]> = [
  ['Spear vs Shield', spear!, shield!],
  ['Flanker vs Spinner', flanker!, spinner!],
  ['GlassCannon vs Spear', glassCannon!, spear!],
];

for (const [label, defA, defB] of pairs) {
  const pkgA = lockBot(defA, rs);
  const pkgB = lockBot(defB, rs);
  const sim = simulate(pkgA, pkgB, { seed: 7, ruleset: rs, recordReplay: true });
  const view = new ReplayView(sim.replay, defA, defB, rs);

  // ---- every checkpoint must be reproduced exactly ------------------------
  let checkedTiles = 0;
  let mismatch = 0;
  for (const cp of sim.replay.checkpoints) {
    for (const team of ['A', 'B'] as const) {
      const expected = team === 'A' ? cp.a : cp.b;
      const actual = view.tilesAt(team, cp.tick);
      if (actual.length !== expected.tris.length) {
        fail(`${label}: tile count ${actual.length} != ${expected.tris.length}`);
        continue;
      }
      for (let i = 0; i < actual.length; i++) {
        const a = actual[i]!;
        const e = expected.tris[i]!;
        checkedTiles++;
        if (a.alive !== e.alive || a.hp !== e.hp || a.maxHp !== e.maxHp || a.damageReceived !== e.damageReceived) {
          if (mismatch < 4) {
            fail(
              `${label} tick ${cp.tick} team ${team} tile ${i}: ` +
                `alive ${a.alive}/${e.alive} hp ${a.hp}/${e.hp} maxHp ${a.maxHp}/${e.maxHp} ` +
                `dmg ${a.damageReceived}/${e.damageReceived}`,
            );
          }
          mismatch++;
        }
      }
    }
  }
  if (mismatch === 0) {
    ok(`${label}: ${checkedTiles} tile states reproduced exactly across ${sim.replay.checkpoints.length} checkpoints`);
  }

  // ---- mid-tick reconstruction stays coherent -----------------------------
  // Note: a tile that was DETACHED keeps its HP in the engine (only `alive` is
  // cleared), so "dead but HP > 0" is legitimate and must not be flagged.
  const reasons = { negativeHp: 0, aboveMax: 0, aliveWithNoMax: 0, negativeDamage: 0 };
  for (let tick = 0; tick < sim.replay.manifest.totalTicks; tick += 7) {
    for (const team of ['A', 'B'] as const) {
      const tiles = view.tilesAt(team, tick);
      for (const t of tiles) {
        if (t.hp < 0) reasons.negativeHp++;
        if (t.alive && t.hp > t.maxHp) reasons.aboveMax++;
        if (t.alive && t.maxHp <= 0) reasons.aliveWithNoMax++;
        if (t.damageReceived < 0) reasons.negativeDamage++;
      }
    }
  }
  const incoherent = Object.values(reasons).reduce((a, b) => a + b, 0);
  if (incoherent === 0) ok(`${label}: no incoherent tile state on off-checkpoint ticks`);
  else fail(`${label}: ${incoherent} incoherent tile states ${JSON.stringify(reasons)}`);

  // ---- damage map is monotonic --------------------------------------------
  let regressions = 0;
  let prevPeak = -1;
  for (let tick = 0; tick < sim.replay.manifest.totalTicks; tick += 11) {
    const map = view.damageMapAt(tick);
    if (map.peak < prevPeak) regressions++;
    prevPeak = map.peak;
  }
  if (regressions === 0) ok(`${label}: damage map never cools down as the replay advances`);
  else fail(`${label}: damage map regressed ${regressions} times`);

  // ---- pose interpolation stays between its endpoints ---------------------
  let outOfRange = 0;
  for (let tick = 0; tick + 1 < sim.replay.frames.length; tick += 13) {
    const f0 = sim.replay.frames[tick]!;
    const f1 = sim.replay.frames[tick + 1]!;
    for (const team of ['A', 'B'] as const) {
      const a = team === 'A' ? f0.a : f0.b;
      const b = team === 'A' ? f1.a : f1.b;
      const mid = view.poseAt(team, tick + 0.5);
      const lo = Math.min(a.x, b.x);
      const hi = Math.max(a.x, b.x);
      if (mid.x < lo - 1 || mid.x > hi + 1) outOfRange++;
      const loY = Math.min(a.y, b.y);
      const hiY = Math.max(a.y, b.y);
      if (mid.y < loY - 1 || mid.y > hiY + 1) outOfRange++;
    }
  }
  if (outOfRange === 0) ok(`${label}: interpolated poses stay between their two frames`);
  else fail(`${label}: ${outOfRange} interpolated poses escaped their frame bounds`);

  // ---- frameAt produces a complete picture --------------------------------
  const frame = view.frameAt(sim.replay.manifest.totalTicks / 2);
  if (frame.a.tiles.length === defA.triangles.length && frame.b.tiles.length === defB.triangles.length) {
    ok(`${label}: frameAt returns all tiles for both bots`);
  } else {
    fail(`${label}: frameAt tile counts wrong`);
  }
  if (frame.a.coreMaxHp > 0 && frame.a.coreRatioMilli >= 0 && frame.a.coreRatioMilli <= 1000) {
    ok(`${label}: core HP ratio in range`);
  } else {
    fail(`${label}: core HP ratio out of range (${frame.a.coreRatioMilli})`);
  }
}

// ---- event log describes cleanly ------------------------------------------
{
  const sim = simulate(lockBot(spear!, rs), lockBot(flanker!, rs), { seed: 3, ruleset: rs, recordReplay: true });
  const view = new ReplayView(sim.replay, spear!, flanker!, rs);
  const all = view.eventsUpTo(sim.replay.manifest.totalTicks);
  let bad = 0;
  for (const e of all) {
    const d = view.describeEvent(e, 'Spear', 'Flanker');
    if (!d.title || d.title === 'không rõ') bad++;
  }
  if (bad === 0) ok(`event log: ${all.length} events all describe cleanly`);
  else fail(`event log: ${bad}/${all.length} events failed to describe`);

  const last = all[all.length - 1];
  if (last && last.kind === 'matchEnd') ok('event log ends with matchEnd');
  else fail('event log does not end with matchEnd');
}

console.log(failures === 0 ? '\nall replay checks passed' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
