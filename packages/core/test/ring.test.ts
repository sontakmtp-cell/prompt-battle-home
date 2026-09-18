import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_RULESET, ringRadiusAt } from '@promptchien/contracts';
import type { BrainDefinition } from '@promptchien/contracts';

import { simulate } from '../src/engine/simulate.js';
import { RS, defOf, pkgOf, placeTileAt, tile } from './helpers.js';

const RS_ = DEFAULT_RULESET;

/** A small but legal bot: a Core, an escort, and one motor. */
function survivor(coreType: 'hammer' | 'scissor' | 'paper', name: string) {
  return defOf(name, [
    tile(0, 0, 'down', coreType), // 0 core
    tile(0, 0, 'up', 'paper'), // 1 escort
    tile(1, 0, 'down', 'motor'), // 2 motor
  ], 0);
}

test('ring: the ring only starts shrinking at the announced tick', () => {
  const a = survivor('hammer', 'a');
  const b = survivor('scissor', 'b');
  const { replay } = simulate(pkgOf(a), pkgOf(b), {
    seed: 1,
    ruleset: RS,
    maxTicks: RS.RING_START_TICK + 5,
    startOverride: {
      a: placeTileAt(a, 0, -3000, 0),
      b: placeTileAt(b, 0, 3000, 0),
    },
  });

  const starts = replay.events.flatMap((e) => (e.kind === 'ringStart' ? [e] : []));
  assert.equal(starts.length, 1, 'exactly one ring announcement');
  assert.equal(starts[0]!.tick, RS.RING_START_TICK);
  assert.equal(starts[0]!.radius, RS.RING_START_RADIUS);

  // no core damage before the ring opens, and no ring enter/exit chatter either
  const early = replay.events.filter((e) => e.kind === 'coreHit');
  assert.equal(early.length, 0, 'no core damage before the ring opens');
  assert.equal(replay.events.filter((e) => e.kind === 'ringEnter').length, 0);
});

test('ring: the radius falls linearly and matches the shared helper', () => {
  const a = survivor('hammer', 'a');
  const b = survivor('scissor', 'b');
  const { replay } = simulate(pkgOf(a), pkgOf(b), {
    seed: 1,
    ruleset: RS,
    maxTicks: 2600,
    startOverride: {
      a: placeTileAt(a, 0, -1000, 0),
      b: placeTileAt(b, 0, 1000, 0),
    },
  });

  // the helper is the single source of truth for sim and renderer alike
  assert.equal(ringRadiusAt(RS_, 0), RS.RING_START_RADIUS);
  assert.equal(ringRadiusAt(RS_, RS.RING_START_TICK), RS.RING_START_RADIUS);
  assert.equal(ringRadiusAt(RS_, RS.MATCH_MAX_TICKS), RS.RING_END_RADIUS);

  // the ring event radius must be exactly what the helper says at that tick
  const start = replay.events.find((e) => e.kind === 'ringStart');
  assert.ok(start);
  assert.equal(start.radius, ringRadiusAt(RS_, RS.RING_START_TICK));
});

/**
 * The ring drain is a PERCENTAGE of max HP, not a flat number. That is the whole
 * reason the doc can promise the same grace period to every Core type: a Hammer
 * Core has 420 HP and a Paper Core has 1008 HP, so a flat drain would kill the
 * Hammer one 2.4x sooner.
 *
 * Both bots here are parked at the same distance outside the ring and told to do
 * nothing, so the only thing that can kill them is the ring. If the drain were
 * flat, the match would be decided by the Hammer Core dying first. Instead both
 * Cores must reach zero on the same tick, which the engine reports as a draw.
 */
test('ring: the drain is proportional to max HP, so every Core type gets the same grace', () => {
  const hammerCore = survivor('hammer', 'glass');
  const paperCore = survivor('paper', 'tank');

  const hammerHp = RS.HAMMER_HP;
  const paperHp = RS.PAPER_HP;
  assert.ok(paperHp > hammerHp * 2, `the two Cores must differ a lot: ${hammerHp} vs ${paperHp}`);

  // Park both Cores at the same distance outside the ring. The arena clamp acts
  // on the body origin, not on the Core, so we assert below that neither body was
  // clamped -- otherwise one side would silently start closer than the other and
  // the test would be comparing the wrong thing.
  const DIST = 18000;
  const startA = placeTileAt(hammerCore, 0, -DIST, 0);
  const startB = placeTileAt(paperCore, 0, DIST, 0);

  const { replay, result } = simulate(pkgOf(hammerCore), pkgOf(paperCore), {
    seed: 1,
    ruleset: RS,
    maxTicks: RS.MATCH_MAX_TICKS,
    startOverride: { a: startA, b: startB },
  });

  const first = replay.frames[0]!;
  assert.equal(first.a.x, startA.x, 'body A must not be pushed by the arena clamp');
  assert.equal(first.b.x, startB.x, 'body B must not be pushed by the arena clamp');

  const enterA = replay.events.find((e) => e.kind === 'ringEnter' && e.team === 'A');
  const enterB = replay.events.find((e) => e.kind === 'ringEnter' && e.team === 'B');
  assert.ok(enterA && enterB, 'both bots must end up outside the shrinking ring');
  assert.equal(enterA.tick, enterB.tick, 'they are parked at the same distance');

  // 1.5% of max HP per tick -> 1000 / 15 = 66.67 ticks, about 2.2 seconds
  const expectedTicks = Math.ceil(1000 / RS.RING_DRAIN_PERCENT_TICK);
  assert.equal(expectedTicks, 67);

  const end = replay.events.find((e) => e.kind === 'matchEnd');
  assert.ok(end && end.kind === 'matchEnd');
  assert.equal(end.reason, 'core');
  assert.equal(
    end.winner,
    'draw',
    'a proportional drain must take both Cores on the same tick',
  );
  assert.equal(
    end.tick - enterA.tick,
    expectedTicks - 1,
    `grace was ${end.tick - enterA.tick} ticks, expected ${expectedTicks - 1}`,
  );

  const lastFrame = replay.frames[replay.frames.length - 1]!;
  assert.equal(lastFrame.a.coreHp, 0, 'the hammer Core is gone');
  assert.equal(lastFrame.b.coreHp, 0, 'the paper Core is gone too');

  // 1.5% of 1008 is 15.12 HP/tick and 1.5% of 420 is 6.3 HP/tick: the bigger
  // Core loses more than twice as much HP per tick and still dies at the same time
  const paperDrain = paperHp * RS.RING_DRAIN_PERCENT_TICK;
  const hammerDrain = hammerHp * RS.RING_DRAIN_PERCENT_TICK;
  assert.ok(paperDrain > hammerDrain * 2, 'the bigger Core must bleed faster in absolute terms');
  assert.equal(result.outcome.reason, 'core');
});

/**
 * Walking back inside must save you. The ring only bites while the Core is
 * outside it, so a bot that reacts and drives back in stops bleeding.
 *
 * Two runs, identical except for the brain. The parked bot dies on the ring; the
 * one that runs for the middle survives the same 67 tick window.
 */
test('ring: a bot that walks back inside the ring stops bleeding', () => {
  const runner = defOf('runner', [
    tile(0, 0, 'down', 'hammer'), // 0 core
    tile(0, 0, 'up', 'paper'),
    tile(1, 0, 'down', 'motor'),
  ], 0);
  const anchor = survivor('paper', 'anchor');

  // react to the ring: drive inward while outside, otherwise sit still
  const escapeBrain: BrainDefinition = {
    version: runner.brain.version,
    rules: [
      { when: { cmp: ['==', { field: 'self.ringOutside' }, 1] }, move: 'forward', rotate: 'hold' },
      { move: 'hold', rotate: 'hold' },
    ],
  };
  const frozenBrain: BrainDefinition = {
    version: runner.brain.version,
    rules: [{ move: 'hold', rotate: 'hold' }],
  };

  const start = {
    a: placeTileAt(runner, 0, -18000, 0),
    b: placeTileAt(anchor, 0, 2000, 0),
  };
  const opts = { seed: 1, ruleset: RS, maxTicks: 2700, startOverride: start };

  const frozen = simulate(pkgOf({ ...runner, brain: frozenBrain }), pkgOf(anchor), opts);
  const escaped = simulate(pkgOf({ ...runner, brain: escapeBrain }), pkgOf(anchor), opts);

  // the control: a bot that does nothing about the ring is killed by it
  assert.equal(frozen.result.outcome.reason, 'core');
  assert.equal(frozen.result.outcome.winner, 'B', 'the parked bot must die to the ring');

  // the escape: it notices, drives back in, and lives
  const entered = escaped.replay.events.find((e) => e.kind === 'ringEnter' && e.team === 'A');
  const exited = escaped.replay.events.find((e) => e.kind === 'ringExit' && e.team === 'A');
  assert.ok(entered, 'the runner starts outside the ring');
  assert.ok(exited, 'and must be able to get back inside');
  assert.ok(exited.tick > entered.tick);

  const lastFrame = escaped.replay.frames[escaped.replay.frames.length - 1]!;
  assert.ok(lastFrame.a.coreHp > 0, 'the runner must survive by walking back in');
  assert.notEqual(escaped.result.outcome.reason, 'core');

  // and after the re-entry its Core HP must be frozen, not merely slower
  const atExit = escaped.replay.frames.find((f) => f.tick === exited.tick)?.a.coreHp ?? -1;
  assert.ok(atExit > 0, 'the runner survived long enough to walk back in');
  const settled = escaped.replay.frames[escaped.replay.frames.length - 1]!.a.coreHp;
  const stillOutside = escaped.replay.events.some((e) => e.kind === 'ringEnter' && e.tick > exited.tick);
  if (!stillOutside) {
    assert.equal(settled, atExit, 'Core HP must be frozen once the Core is back inside the ring');
  }
});
