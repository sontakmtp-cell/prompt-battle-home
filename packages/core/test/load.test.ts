import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createRuleset,
  loadFactorMilli,
  pullCapacity,
  speedMultiplierFor,
} from '@promptchien/contracts';

import { simulate } from '../src/engine/simulate.js';
import { checkDefinition } from '../src/geometry/validator.js';
import { SPEAR, FLANKER } from '../src/bots/samples.js';
import { RS, alignedStart, defOf, hasWarning, pkgOf, tile } from './helpers.js';

function lastCheckpoint(replay: ReturnType<typeof simulate>['replay']) {
  return replay.checkpoints[replay.checkpoints.length - 1]!;
}

// ---------------------------------------------------------------------------
// the max() law (gameplay.md 3.4.1)
// ---------------------------------------------------------------------------

/**
 * gameplay.md 3.4.1 puts it in bold: "Dong max() cuoi cung la bat buoc, dung bo."
 * Without it a bot gets LIGHTER as it is broken apart, so losing tiles removes
 * overload and the wreck speeds up. The doc's own example is a 55 combat + 5
 * motor fortress (load 3.00, crawling at 15%) that loses 40 combat tiles: its
 * load falls to 1.00 and it would rocket to 100% speed, i.e. losing two thirds
 * of its body makes it six times faster.
 *
 * This is the same failure at a smaller, exactly measurable scale.
 * A is 7 tiles with a single motor: load 7 / (1 x 4) = 1.750 -> 55% speed.
 * The four fragile scissor tiles are then shot off, leaving 3 tiles and the same
 * one motor: load 3 / 4 = 0.750 -> 100% speed if the max() line were missing.
 */
test('load: a damaged bot must never get faster (the max() law)', () => {
  const a = defOf('lighter', [
    tile(0, 0, 'down', 'paper'), // 0 core
    tile(0, 0, 'up', 'paper'), // 1
    tile(0, 1, 'down', 'scissor'), // 2 fragile
    tile(0, 1, 'up', 'scissor'), // 3 fragile
    tile(0, 2, 'down', 'scissor'), // 4 fragile
    tile(0, 2, 'up', 'scissor'), // 5 fragile
    tile(1, 0, 'down', 'motor'), // 6 the only motor, bolted to the core
  ], 0);
  const b = defOf('ram', [
    tile(0, 1, 'down', 'hammer'), // 0 core
    tile(0, 1, 'up', 'hammer'),
    tile(0, 2, 'down', 'hammer'),
    tile(0, 2, 'up', 'hammer'),
  ], 0);

  // everything is indestructible except the four scissor tiles
  const rs = createRuleset({
    SCISSOR_HP: 1,
    PAPER_HP: 100000,
    HAMMER_HP: 100000,
    MOTOR_HP: 100000,
  });

  const lockLoad = loadFactorMilli(rs, 7, 1);
  assert.equal(lockLoad, 1750, 'seven tiles on one motor');
  const lockSpeed = speedMultiplierFor(lockLoad);
  assert.equal(lockSpeed, 550, 'load 1.750 sits in the 1.50-2.00 band');

  const { replay, result } = simulate(pkgOf(a, rs), pkgOf(b, rs), {
    seed: 1,
    ruleset: rs,
    maxTicks: 60,
    startOverride: alignedStart(a, b),
  });

  const end = lastCheckpoint(replay).a;
  assert.equal(end.alive, true, 'the Core survives: only the escort was shot off');
  assert.equal(end.motorAlive, 1, 'the motor is on the core side of the damage');

  // the body really did get lighter...
  assert.equal(end.loadMilli, 750, `current load after the break: ${end.loadMilli}`);
  assert.ok(
    end.loadMilli < lockLoad,
    'the scenario is only meaningful if the current load dropped below the locked load',
  );

  // ...but the engine refuses to reward it
  assert.equal(end.effectiveLoadMilli, 1750, 'effective load must be pinned to the lock-time value');
  assert.equal(end.speedMultiplierMilli, 550, 'speed must not improve after taking damage');

  // and the counterfactual: without the max() line this bot would be at full speed
  assert.equal(speedMultiplierFor(end.loadMilli), 1000, 'current load alone would allow 100%');
  assert.ok(end.speedMultiplierMilli < 1000, 'the bot sped up by being damaged');

  assert.equal(result.outcome.reason, 'timeout');
});

test('load: effective load never falls below the lock-time load in a real match', () => {
  // a genuine fight where the body gets chewed up over time
  const { replay } = simulate(pkgOf(SPEAR), pkgOf(FLANKER), {
    seed: 21,
    ruleset: RS,
    maxTicks: 2000,
  });
  assert.ok(replay.checkpoints.length >= 2, 'need a few checkpoints to compare');

  let sawDrop = false;
  for (const cp of replay.checkpoints) {
    for (const side of [cp.a, cp.b] as const) {
      assert.ok(
        side.effectiveLoadMilli >= side.loadMilli,
        `effective load ${side.effectiveLoadMilli} fell below current load ${side.loadMilli}`,
      );
      if (side.loadMilli < side.effectiveLoadMilli) sawDrop = true;
    }
  }
  assert.ok(
    sawDrop,
    'this match never actually exercised the max(): the bodies lost no tiles',
  );
});

// ---------------------------------------------------------------------------
// losing a motor cluster
// ---------------------------------------------------------------------------

/**
 * Losing motors must be able to drop a bot a whole band, not just a few percent.
 * A is 6 combat + 2 motors: load 8 / 8 = 1.000 -> 100% speed. Shoot one motor off
 * and it is 7 tiles on one motor: load 1.750 -> 55% speed.
 */
test('load: losing one motor drops the bot a full speed band', () => {
  const a = defOf('twolegs', [
    tile(0, 0, 'down', 'paper'), // 0 core
    tile(0, 0, 'up', 'paper'),
    tile(0, 1, 'down', 'hammer'),
    tile(0, 1, 'up', 'hammer'),
    tile(0, 2, 'down', 'scissor'),
    tile(0, 2, 'up', 'scissor'),
    tile(1, 0, 'down', 'motor'), // 6
    tile(1, 2, 'down', 'motor'), // 7
  ], 0);
  const b = defOf('sniper', [tile(1, 0, 'down', 'hammer')], 0);

  const rs = createRuleset({ MOTOR_HP: 1, PAPER_HP: 100000, HAMMER_HP: 100000, SCISSOR_HP: 100000 });

  assert.equal(loadFactorMilli(rs, 8, 2), 1000, 'eight tiles on two motors is exactly balanced');
  assert.equal(speedMultiplierFor(1000), 1000);

  const { replay } = simulate(pkgOf(a, rs), pkgOf(b, rs), {
    seed: 1,
    ruleset: rs,
    maxTicks: 60,
    startOverride: alignedStart(a, b),
  });

  const end = lastCheckpoint(replay).a;
  assert.equal(end.motorAlive, 1, 'one motor should have been shot off');
  assert.equal(end.loadMilli, 1750, `load after losing a motor: ${end.loadMilli}`);
  assert.equal(end.speedMultiplierMilli, 550, 'the bot must drop into the 1.50-2.00 band');

  const lost = replay.events.flatMap((e) => (e.kind === 'motorLost' && e.team === 'A' ? [e] : []));
  assert.equal(lost.length, 1, 'exactly one motor-loss event');
  assert.equal(lost[0]!.count, 1);
  assert.equal(lost[0]!.side, 'left', 'the motor at (1,0) is on the left of the body');
});

test('load: the documented 55+5 fortress crawls at 15%', () => {
  // the doc's own arithmetic: 60 tiles on 5 motors
  const load = loadFactorMilli(RS, 60, 5);
  assert.equal(load, 3000);
  assert.equal(speedMultiplierFor(load), 150);

  // and the validator warns the designer before they ever submit something like it
  const tris = [];
  for (let r = 0; r < 5; r++) {
    for (let j = 0; j < 6; j++) {
      tris.push(tile(r, j, 'down', 'hammer'), tile(r, j, 'up', 'hammer'));
    }
  }
  assert.equal(tris.length, RS.MAX_TRIANGLES, 'a full 60 tile body');
  // one of them is a motor, and that is nowhere near enough to pull the rest
  tris[59] = tile(4, 5, 'up', 'motor');

  const check = checkDefinition(defOf('fortress', tris, 0), RS);
  assert.ok(hasWarning(check.issues, 'BOT_OVERLOADED'), JSON.stringify(check.issues));
  assert.equal(check.stats?.loadMilli, 15000, '60 tiles on a single motor');
  assert.equal(check.stats?.speedMultiplierMilli, 150);
});

test('load: pull capacity is four tiles per living motor', () => {
  assert.equal(pullCapacity(RS, 0), 0);
  assert.equal(pullCapacity(RS, 1), 4);
  assert.equal(pullCapacity(RS, 15), 60);
  // a bot with no motor at all reports an unusable load factor rather than dividing by zero
  assert.ok(loadFactorMilli(RS, 30, 0) > 1000);
});
