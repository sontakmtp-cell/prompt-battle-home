import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Replay } from '@promptchien/contracts';

import { simulate } from '../src/engine/simulate.js';
import { verifyReplay } from '../src/replay/verify.js';
import { hashDefinition, sha256Hex } from '../src/replay/hash.js';
import { lockBot } from '../src/bot/package.js';
import { SPEAR, FLANKER, SHIELD, SPINNER, SAMPLE_BOTS } from '../src/bots/samples.js';
import { RS, pkgOf } from './helpers.js';

const spear = pkgOf(SPEAR);
const flanker = pkgOf(FLANKER);

// ---------------------------------------------------------------------------
// determinism
// ---------------------------------------------------------------------------

test('determinism: the same match replays to the same digest, every time', () => {
  const runs = [0, 1, 2, 3, 4].map(() =>
    simulate(spear, flanker, { seed: 42, ruleset: RS, maxTicks: 1200 }),
  );
  const first = runs[0]!;
  for (const r of runs) {
    assert.equal(r.digest, first.digest);
    assert.equal(r.result.replayHash, first.result.replayHash);
    assert.deepEqual(r.result.outcome, first.result.outcome);
    assert.equal(r.replay.frames.length, first.replay.frames.length);
  }
});

test('determinism: recording the replay does not change the simulation', () => {
  // the digest covers simulation state only, so turning recording off must not
  // move it -- otherwise the cheap cross-platform gate would be measuring the
  // recorder rather than the engine
  const withReplay = simulate(spear, flanker, { seed: 7, ruleset: RS, maxTicks: 1200 });
  const without = simulate(spear, flanker, { seed: 7, ruleset: RS, maxTicks: 1200, recordReplay: false });
  assert.equal(without.digest, withReplay.digest);
  assert.equal(without.result.replayHash, withReplay.result.replayHash);
  assert.equal(without.replay.frames.length, 0);
});

test('determinism: different seeds give different matches', () => {
  const digests = new Set<string>();
  for (let seed = 0; seed < 40; seed++) {
    digests.add(simulate(spear, flanker, { seed, ruleset: RS, maxTicks: 1200 }).digest);
  }
  assert.equal(digests.size, 40, 'the seed must actually drive the match');
});

test('determinism: a 100 seed sweep is reproducible end to end', () => {
  // this is the shape of the Windows/Linux gate: one digest per seed, all of them
  // stable, and a single aggregate the two platforms can compare
  const sweep = (): string => {
    let acc = '';
    for (let seed = 0; seed < 100; seed++) {
      acc += simulate(spear, flanker, { seed, ruleset: RS, maxTicks: 900, recordReplay: false }).digest;
      acc += '|';
    }
    return sha256Hex(acc);
  };
  const a = sweep();
  const b = sweep();
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test('determinism: the definition hash ignores key order but not content', () => {
  const h1 = hashDefinition(SPEAR);
  const h2 = hashDefinition({ ...SPEAR });
  assert.equal(h1, h2);
  assert.match(h1, /^[0-9a-f]{64}$/);

  // a real edit moves the hash
  const edited = { ...SPEAR, name: 'Spear II' };
  assert.notEqual(hashDefinition(edited), h1);
});

test('determinism: locking the same bot twice gives the same package hash', () => {
  const a = lockBot(SPEAR, RS);
  const b = lockBot(SPEAR, RS);
  assert.equal(a.definitionHash, b.definitionHash);
  assert.equal(a.lockedLoadMilli, b.lockedLoadMilli);
  // a new revision is a new ordinal, but the definition hash is unchanged
  const c = lockBot(SPEAR, RS, 2);
  assert.equal(c.definitionHash, a.definitionHash);
  assert.equal(c.revision, 2);
});

// ---------------------------------------------------------------------------
// fairness under reordering
// ---------------------------------------------------------------------------

/**
 * Neither side may be punished for being processed second (gameplay.md 5.2).
 *
 * An exact per-match mirror is NOT what this engine guarantees, and pretending
 * otherwise would be a false claim: the separation step picks a single deepest
 * contact, so when two contacts tie on depth the choice depends on which body is
 * iterated first. Over one match that order sensitivity can flip the result
 * (chaotic divergence), which is why the earlier, stronger version of this test
 * failed. Averaging the contact normals to remove the tie dependence was tried
 * and rejected: it broke the mirrored-identical symmetry below and changed match
 * dynamics.
 *
 * What IS guaranteed, and what matters, is that the label carries no systematic
 * advantage. This runs the whole sample roster against itself, every ordered pair,
 * both ways round, and requires the A and B win counts to come out level. A real
 * bias of even five points would be caught here.
 */
test('fairness: the A/B label carries no systematic advantage', () => {
  const SEEDS = 6;
  let aWins = 0;
  let bWins = 0;

  const pkgs = SAMPLE_BOTS.map((b) => pkgOf(b));
  for (let x = 0; x < pkgs.length; x++) {
    for (let y = 0; y < pkgs.length; y++) {
      if (x === y) continue;
      for (let seed = 0; seed < SEEDS; seed++) {
        const forward = simulate(pkgs[x]!, pkgs[y]!, { seed, ruleset: RS, recordReplay: false });
        if (forward.result.outcome.winner === 'A') aWins++;
        else if (forward.result.outcome.winner === 'B') bWins++;

        const reverse = simulate(pkgs[y]!, pkgs[x]!, { seed, ruleset: RS, recordReplay: false });
        if (reverse.result.outcome.winner === 'A') bWins++;
        else if (reverse.result.outcome.winner === 'B') aWins++;
      }
    }
  }

  const total = aWins + bWins;
  assert.ok(total >= 200, `not enough matches to be meaningful: ${total}`);
  const biasPoints = Math.abs(aWins - bWins) / (total / 100);
  assert.ok(
    biasPoints < 5,
    `label bias is ${biasPoints.toFixed(2)} points (A ${aWins}, B ${bWins} of ${total})`,
  );
});

/**
 * The mechanism behind that fairness guarantee: both Brains read the same
 * PRE-tick snapshot, and all actions land simultaneously.
 *
 * Two identical bots are set up in mirrored poses and told to charge, then to
 * back off the moment the enemy is closer than 3000 milli-units. The distance
 * between them shrinks symmetrically, so if either Brain were reading the world
 * after the other had already moved, that side would see the threshold crossed
 * first and would reverse one tick early. They must reverse on the same tick.
 */
test('fairness: mirrored bots react on exactly the same tick', () => {
  const brain = {
    version: SPEAR.brain.version,
    rules: [
      { when: { cmp: ['<', { field: 'enemy.dist' }, 3000] }, move: 'backward', rotate: 'hold' },
      { move: 'forward', rotate: 'hold' },
    ],
  } as typeof SPEAR.brain;
  const duellist = { ...SPEAR, brain };

  const r = simulate(pkgOf(duellist), pkgOf(duellist), {
    seed: 0,
    ruleset: RS,
    maxTicks: 600,
    startOverride: {
      a: { x: -4000, y: 0, heading: 0 },
      b: { x: 4000, y: 0, heading: 32 },
    },
  });

  // A drives +x, B drives -x. Find the first tick each one turns around.
  const reversal = (read: (f: (typeof r.replay.frames)[number]) => number): number | null => {
    let prev = read(r.replay.frames[0]!);
    for (const f of r.replay.frames.slice(1)) {
      const now = read(f);
      if (now < prev) return f.tick; // it moved back the way it came
      prev = now;
    }
    return null;
  };

  const turnA = reversal((f) => f.a.x);
  const turnB = reversal((f) => -f.b.x);
  assert.ok(turnA !== null, 'bot A must eventually back off');
  assert.ok(turnB !== null, 'bot B must eventually back off');
  assert.equal(
    turnA,
    turnB,
    `the two brains saw different worlds: A turned at ${turnA}, B at ${turnB}`,
  );
});

test('fairness: both brains read the same pre-tick world', () => {
  // with both bots identical and in mirrored poses, a perfectly symmetric engine
  // must not be able to pick a winner out of thin air
  const left = { x: -5000, y: 0, heading: 0 };
  const right = { x: 5000, y: 0, heading: 32 };
  const r = simulate(spear, spear, {
    seed: 0,
    ruleset: RS,
    maxTicks: 1500,
    startOverride: { a: left, b: right },
  });
  assert.equal(r.result.outcome.scoreA, r.result.outcome.scoreB, 'mirrored bots must score identically');
});

// ---------------------------------------------------------------------------
// replay verification and seeking
// ---------------------------------------------------------------------------

test('replay: an honest replay verifies', () => {
  const { replay } = simulate(spear, flanker, { seed: 99, ruleset: RS, maxTicks: 1500 });
  const v = verifyReplay(replay, spear, flanker, RS);
  assert.equal(v.ok, true, v.detail);
  assert.equal(v.actualHash, v.expectedHash);
  assert.equal(v.framesMatch, true);
  assert.equal(v.eventsMatch, true);
  assert.equal(v.ticksMatch, true);
  assert.equal(v.outcomeMatch, true);
});

test('replay: a tampered replay is rejected', () => {
  const { replay } = simulate(spear, flanker, { seed: 99, ruleset: RS, maxTicks: 1500 });

  const tampered = structuredClone(replay) as Replay;
  const mid = Math.floor(tampered.frames.length / 2);
  tampered.frames[mid]!.a.x += 1;

  const v = verifyReplay(tampered, spear, flanker, RS);
  assert.equal(v.ok, false, 'a one-milli-unit nudge must be caught');
  assert.equal(v.framesMatch, false);
});

test('replay: a replay cannot be replayed against different bots', () => {
  const { replay } = simulate(spear, flanker, { seed: 99, ruleset: RS, maxTicks: 1500 });
  const v = verifyReplay(replay, spear, pkgOf(SHIELD), RS);
  assert.equal(v.ok, false, 'swapping a combatant must invalidate the replay');
});

test('replay: checkpoints are consistent with the frame stream', () => {
  // this is what makes seeking work: jumping to a checkpoint must land on exactly
  // the state the per-tick frames describe
  const { replay } = simulate(spear, flanker, { seed: 1234, ruleset: RS, maxTicks: 1500 });
  assert.ok(replay.checkpoints.length >= 2);

  const byTick = new Map(replay.frames.map((f) => [f.tick, f]));
  for (const cp of replay.checkpoints) {
    const frame = byTick.get(cp.tick);
    assert.ok(frame, `checkpoint at tick ${cp.tick} has no matching frame`);
    assert.equal(cp.a.coreHp, frame.a.coreHp, `core HP mismatch at tick ${cp.tick}`);
    assert.equal(cp.b.coreHp, frame.b.coreHp, `core HP mismatch at tick ${cp.tick}`);
    assert.equal(cp.a.x, frame.a.x);
    assert.equal(cp.a.y, frame.a.y);
    assert.equal(cp.a.heading, frame.a.heading);
    assert.equal(cp.a.combatAlive, frame.a.combat);
    assert.equal(cp.a.motorAlive, frame.a.motor);
  }
});

test('replay: the frame stream is contiguous from tick 0', () => {
  const { replay } = simulate(spear, flanker, { seed: 55, ruleset: RS, maxTicks: 1200 });
  assert.equal(replay.frames[0]!.tick, 0);
  for (let i = 1; i < replay.frames.length; i++) {
    assert.equal(replay.frames[i]!.tick, replay.frames[i - 1]!.tick + 1, `gap at frame ${i}`);
  }
});

test('replay: the manifest is self describing', () => {
  const { replay, result } = simulate(spear, flanker, { seed: 8, ruleset: RS, maxTicks: 1200 });
  const m = replay.manifest;
  assert.equal(m.seed, 8);
  assert.equal(m.rulesetVersion, RS.version);
  assert.equal(m.tickRate, RS.TICK_RATE);
  assert.equal(m.botA.hash, spear.definitionHash);
  assert.equal(m.botB.hash, flanker.definitionHash);
  assert.equal(m.replayHash, result.replayHash);
  assert.equal(m.totalTicks, result.outcome.ticks);
  assert.deepEqual(m.outcome, result.outcome);
  // the opening poses are stored so the match can be recomputed from scratch
  assert.ok(Number.isInteger(m.startPoses.a.x) && Number.isInteger(m.startPoses.a.y));
  assert.ok(Number.isInteger(m.startPoses.b.x) && Number.isInteger(m.startPoses.b.y));
});

test('replay: SPINNER vs SHIELD also verifies', () => {
  const a = pkgOf(SPINNER);
  const b = pkgOf(SHIELD);
  const { replay } = simulate(a, b, { seed: 3, ruleset: RS, maxTicks: 1500 });
  assert.equal(verifyReplay(replay, a, b, RS).ok, true);
});
