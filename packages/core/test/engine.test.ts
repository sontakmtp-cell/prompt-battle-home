import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  BOT_SCHEMA_VERSION,
  BRAIN_API_VERSION,
  computeDamage,
  baseDamage,
  createRuleset,
} from '@promptchien/contracts';

import { simulate } from '../src/engine/simulate.js';
import { buildGeometry } from '../src/geometry/build.js';
import { triNeighbors } from '../src/geometry/lattice.js';
import { SPEAR, FLANKER } from '../src/bots/samples.js';
import {
  HOLD_BRAIN,
  RS,
  alignedStart,
  defOf,
  pkgOf,
  tile,
} from './helpers.js';

function hitsOf(replay: ReturnType<typeof simulate>['replay']) {
  return replay.events.filter((e) => e.kind === 'hit');
}

// ---------------------------------------------------------------------------
// per-defender hit cooldown (can_bang.md 8.4)
// ---------------------------------------------------------------------------

/**
 * A defender triangle pinched by three enemy triangles in one tick takes exactly
 * ONE hit. This is the rule that stops a 3-wide wedge from tripling its damage
 * by simply touching the same tile three times.
 *
 * Construction: the defender is a single scissor tile at (6,6,down). The
 * attacker body is made of the defender's three edge neighbours plus a copy of
 * the defender's own cell, then nudged so all of them bite in at once.
 * `simulate` does not validate connectivity, so a deliberately non-physical
 * attacker is legal here: this test targets the damage resolver, not the
 * geometry validator.
 */
test('engine: three attackers pinching one tile land exactly one hit', () => {
  const defender = defOf('defender', [tile(6, 6, 'down', 'scissor')], 0);
  const attacker = defOf(
    'pincer',
    [
      tile(6, 6, 'down', 'hammer'), // sits exactly on the defender
      tile(6, 6, 'up', 'hammer'), // the defender's right edge neighbour
      tile(5, 5, 'up', 'hammer'), // the defender's top edge neighbour
    ],
    0,
  );

  // sanity: the two extra attacker tiles really are edge neighbours of the defender
  const nb = triNeighbors(6, 6, 'down').map((k) => `${k.r},${k.j},${k.o}`);
  assert.ok(nb.includes('6,6,up'), 'attacker tile 1 must be an edge neighbour');
  assert.ok(nb.includes('5,5,up'), 'attacker tile 2 must be an edge neighbour');

  const start = alignedStart(attacker, defender, { x: -150, y: 150 });
  const { replay } = simulate(pkgOf(attacker), pkgOf(defender), {
    seed: 1,
    ruleset: RS,
    maxTicks: 2,
    startOverride: start,
  });

  const hits = hitsOf(replay);

  // every hit the defender landed proves one of the attacker's tiles was in contact
  const contactedAttackerTiles = new Set(
    hits.filter((h) => h.attackerTeam === 'B' && h.attacker === 0).map((h) => h.defender),
  );
  assert.equal(
    contactedAttackerTiles.size,
    3,
    `expected all three attacker tiles in contact, got ${[...contactedAttackerTiles].join(',')}`,
  );

  // ...and yet the defender only ever takes a single hit
  const onDefender = hits.filter((h) => h.defenderTeam === 'B' && h.defender === 0);
  assert.equal(onDefender.length, 1, `defender took ${onDefender.length} hits, the cap is 1`);

  // the surviving hit is the best of the three, not the first one seen
  const best = Math.max(...hits.filter((h) => h.attackerTeam === 'A').map((h) => h.damage));
  assert.equal(onDefender[0]!.damage, best, 'the resolver must keep the highest-damage contact');
});

test('engine: no defender tile is ever hit twice inside the cooldown window', () => {
  const { replay } = simulate(pkgOf(SPEAR), pkgOf(FLANKER), {
    seed: 11,
    ruleset: RS,
    maxTicks: 1500,
  });
  const hits = hitsOf(replay);
  assert.ok(hits.length > 50, `not enough hits to be meaningful: ${hits.length}`);

  const last = new Map<string, number>();
  for (const h of hits) {
    const key = `${h.defenderTeam}:${h.defender}`;
    const prev = last.get(key);
    if (prev !== undefined) {
      assert.ok(
        h.tick - prev >= RS.HIT_COOLDOWN_TICKS,
        `defender ${key} was hit again after only ${h.tick - prev} ticks (cap is ${RS.HIT_COOLDOWN_TICKS})`,
      );
    }
    last.set(key, h.tick);
  }
});

test('engine: the damage of every hit matches the integer damage formula', () => {
  const { replay } = simulate(pkgOf(SPEAR), pkgOf(FLANKER), {
    seed: 3,
    ruleset: RS,
    maxTicks: 1500,
  });
  const typesA = buildGeometry(SPEAR).tris.map((t) => t.type);
  const typesB = buildGeometry(FLANKER).tris.map((t) => t.type);

  const hits = hitsOf(replay);
  assert.ok(hits.length > 50);
  for (const h of hits) {
    const attackerType = h.attackerTeam === 'A' ? typesA[h.attacker]! : typesB[h.attacker]!;
    const defenderType = h.defenderTeam === 'A' ? typesA[h.defender]! : typesB[h.defender]!;
    const rps =
      defenderType === 'motor'
        ? RS.MOTOR_DAMAGE_MULT
        : attackerType === defenderType
          ? RS.RPS_NEUTRAL
          : (attackerType === 'hammer' && defenderType === 'scissor') ||
              (attackerType === 'scissor' && defenderType === 'paper') ||
              (attackerType === 'paper' && defenderType === 'hammer')
            ? RS.RPS_ADVANTAGE
            : attackerType === 'motor'
              ? 0
              : RS.RPS_DISADVANTAGE;
    // damage = floor(base * rps * impact * orient / 1e9) then scaled by the
    // attacker's commitment factor (can_bang.md 10 check 14).
    const raw = computeDamage(RS, baseDamage(RS, attackerType), rps, h.impactMul, h.orientMul);
    const want = Math.trunc((raw * h.commitMul) / 1000);
    assert.equal(h.damage, want, `${attackerType} -> ${defenderType} at tick ${h.tick}`);
  }
});

test('engine: a Motor never deals damage', () => {
  const attacker = defOf('motorram', [tile(6, 6, 'down', 'motor'), tile(6, 6, 'up', 'motor')], 0);
  const defender = defOf('target', [tile(6, 6, 'down', 'scissor')], 0);
  const start = alignedStart(attacker, defender);
  const { replay } = simulate(pkgOf(attacker), pkgOf(defender), {
    seed: 1,
    ruleset: RS,
    maxTicks: 60,
    startOverride: start,
  });
  const fromMotor = hitsOf(replay).filter((h) => h.attackerTeam === 'A');
  assert.equal(fromMotor.length, 0, 'a motor attacker produced damage');
});

// ---------------------------------------------------------------------------
// win conditions
// ---------------------------------------------------------------------------

test('engine: two Cores dying on the same tick is a draw', () => {
  const one = (name: string) => defOf(name, [tile(6, 6, 'down', 'hammer')], 0);
  const a = one('a');
  const b = one('b');
  // one hit is lethal for both sides, and damage is resolved simultaneously
  const rs = createRuleset({ HAMMER_HP: 1, SCISSOR_HP: 1, PAPER_HP: 1, MOTOR_HP: 1 });
  const { result } = simulate(pkgOf(a, rs), pkgOf(b, rs), {
    seed: 1,
    ruleset: rs,
    maxTicks: 10,
    startOverride: alignedStart(a, b),
  });
  assert.equal(result.outcome.reason, 'core');
  assert.equal(result.outcome.winner, 'draw', 'simultaneous core death must not favour either side');
  assert.equal(result.outcome.ticks, 1);
});

test('engine: destroying one Core ends the match immediately', () => {
  const strong = defOf('strong', [tile(6, 6, 'down', 'hammer')], 0);
  const weak = defOf('weak', [tile(6, 6, 'down', 'scissor')], 0);
  const rs = createRuleset({ SCISSOR_HP: 1 });
  const { result } = simulate(pkgOf(strong, rs), pkgOf(weak, rs), {
    seed: 1,
    ruleset: rs,
    maxTicks: 30,
    startOverride: alignedStart(strong, weak),
  });
  assert.equal(result.outcome.reason, 'core');
  assert.equal(result.outcome.winner, 'A');
});

test('engine: a match nobody can win ends on the timeout score', () => {
  const rows = ['HHHH', 'HHHH', 'SSSS', 'MMMM'];
  const a = defOf('wall', [
    tile(0, 0, 'down', 'hammer'),
    tile(0, 0, 'up', 'hammer'),
    tile(0, 1, 'down', 'scissor'),
    tile(0, 1, 'up', 'scissor'),
    tile(1, 0, 'down', 'motor'),
    tile(1, 0, 'up', 'motor'),
  ], 0);
  const b = defOf('wall2', [
    tile(0, 0, 'down', 'hammer'),
    tile(0, 0, 'up', 'hammer'),
    tile(0, 1, 'down', 'scissor'),
    tile(0, 1, 'up', 'scissor'),
    tile(1, 0, 'down', 'motor'),
    tile(1, 0, 'up', 'motor'),
  ], 0);
  void rows;
  // parked far apart with HOLD brains: they never meet
  const { result } = simulate(pkgOf(a), pkgOf(b), {
    seed: 5,
    ruleset: RS,
    maxTicks: 40,
    startOverride: { a: { x: -5000, y: 0 }, b: { x: 5000, y: 0 } },
  });
  assert.equal(result.outcome.reason, 'timeout');
  assert.equal(result.outcome.ticks, 40);
  assert.ok(result.outcome.scoreA <= 1000 && result.outcome.scoreB <= 1000);
});

test('engine: a bot with no motor left is judged incapable', () => {
  const cripple = defOf('cripple', [
    tile(0, 0, 'down', 'hammer'),
    tile(0, 0, 'up', 'hammer'),
  ], 0); // no motor at all
  const normal = defOf('normal', [
    tile(0, 0, 'down', 'hammer'),
    tile(0, 0, 'up', 'hammer'),
    tile(1, 0, 'down', 'motor'),
    tile(1, 0, 'up', 'motor'),
  ], 0);
  const { result } = simulate(pkgOf(cripple), pkgOf(normal), {
    seed: 5,
    ruleset: RS,
    maxTicks: 400,
    startOverride: { a: { x: -9000, y: 0 }, b: { x: 9000, y: 0 } },
  });
  assert.equal(result.outcome.reason, 'incap');
  assert.equal(result.outcome.winner, 'B');
  // the loop starts at tick 0, so the counter reaches INCAP_TICKS on tick INCAP_TICKS - 1
  assert.equal(result.outcome.ticks, RS.INCAP_TICKS);
});

// ---------------------------------------------------------------------------
// destruction and detachment
// ---------------------------------------------------------------------------

/**
 * Break the bridge and the far arm must fall off.
 * A is a four-rhombus train with the Core at the front and a deliberately
 * fragile scissor rhombus in the middle. B is a two-tile ram that sits exactly
 * on that rhombus and shatters it, so the last rhombus is left with no path back
 * to the Core.
 */
test('engine: breaking the bridge detaches the orphaned arm', () => {
  const a = defOf('train', [
    tile(0, 0, 'down', 'paper'), tile(0, 0, 'up', 'paper'), // 0,1 core
    tile(0, 1, 'down', 'hammer'), tile(0, 1, 'up', 'hammer'), // 2,3
    tile(0, 2, 'down', 'scissor'), tile(0, 2, 'up', 'scissor'), // 4,5 bridge
    tile(0, 3, 'down', 'paper'), tile(0, 3, 'up', 'paper'), // 6,7 arm
  ], 0);
  const b = defOf('ram', [
    tile(0, 2, 'down', 'hammer'), tile(0, 2, 'up', 'hammer'),
  ], 0);

  // only the scissor bridge is fragile, everything else shrugs off the ram
  const rs = createRuleset({ SCISSOR_HP: 1, PAPER_HP: 100000, HAMMER_HP: 100000, MOTOR_HP: 100000 });
  const { replay } = simulate(pkgOf(a, rs), pkgOf(b, rs), {
    seed: 1,
    ruleset: rs,
    maxTicks: 40,
    startOverride: alignedStart(a, b),
  });

  const destroyed = new Set(
    replay.events.flatMap((e) => (e.kind === 'destroy' && e.team === 'A' ? [e.tri] : [])),
  );
  assert.ok(destroyed.has(4) && destroyed.has(5), `bridge survived: ${[...destroyed].join(',')}`);

  const detachTris = replay.events.flatMap((e) => (e.kind === 'detach' && e.team === 'A' ? [e.tris] : []));
  assert.equal(detachTris.length, 1, 'expected exactly one detachment');
  assert.deepEqual([...detachTris[0]!].sort((x, y) => x - y), [6, 7]);

  // and the detached tiles really are gone
  const last = replay.checkpoints[replay.checkpoints.length - 1]!;
  for (const i of [6, 7]) assert.equal(last.a.tris[i]!.alive, false, `tile ${i} still alive`);
  // while the core and its remaining escort survive
  assert.equal(last.a.tris[0]!.alive, true);
  assert.equal(last.a.tris[2]!.alive, true);
});

test('engine: a detached fragment stops contributing to the body count', () => {
  const a = defOf('train', [
    tile(0, 0, 'down', 'paper'), tile(0, 0, 'up', 'paper'), // 0,1 core
    tile(0, 1, 'down', 'hammer'), tile(0, 1, 'up', 'hammer'), // 2,3
    tile(0, 2, 'down', 'scissor'), tile(0, 2, 'up', 'scissor'), // 4,5 bridge
    tile(0, 3, 'down', 'paper'), tile(0, 3, 'up', 'paper'), // 6,7 arm
    tile(1, 3, 'down', 'motor'), tile(1, 3, 'up', 'motor'), // 8,9 motors on the arm
  ], 0);
  const b = defOf('ram', [
    tile(0, 2, 'down', 'hammer'), tile(0, 2, 'up', 'hammer'),
  ], 0);
  const rs = createRuleset({ SCISSOR_HP: 1, PAPER_HP: 100000, HAMMER_HP: 100000, MOTOR_HP: 100000 });
  const { replay } = simulate(pkgOf(a, rs), pkgOf(b, rs), {
    seed: 1,
    ruleset: rs,
    maxTicks: 40,
    startOverride: alignedStart(a, b),
  });

  // counts at the start of the match come from the definition, not from a
  // checkpoint: the bridge can already be broken by the first checkpoint at tick 29
  const types = buildGeometry(a).tris.map((t) => t.type);
  assert.equal(types.filter((t) => t !== 'motor').length, 8, 'eight combat tiles to begin with');
  assert.equal(types.filter((t) => t === 'motor').length, 2);

  const detachTris = replay.events.flatMap((e) => (e.kind === 'detach' && e.team === 'A' ? [e.tris] : []));
  assert.equal(detachTris.length, 1);
  assert.deepEqual(
    [...detachTris[0]!].sort((x, y) => x - y),
    [6, 7, 8, 9],
    'the arm and the motors bolted to it go together',
  );

  const last = replay.checkpoints[replay.checkpoints.length - 1]!;
  // four combat tiles survive: two paper (the Core escort) and two hammer.
  // The other four died: the two scissor bridge tiles and the two paper arm tiles.
  assert.equal(last.a.combatAlive, 4, `combat count after the break: ${last.a.combatAlive}`);
  assert.equal(last.a.motorAlive, 0, 'the motors were on the far side of the bridge');
  assert.equal(last.a.alive, true, 'the Core and its escort survive');
});

test('engine: losing every motor stops the bot dead', () => {
  const a = defOf('runner', [
    tile(0, 0, 'down', 'hammer'), tile(0, 0, 'up', 'hammer'),
    tile(0, 1, 'down', 'scissor'), tile(0, 1, 'up', 'scissor'),
    tile(0, 2, 'down', 'motor'), tile(0, 2, 'up', 'motor'),
  ], 0);
  const b = defOf('ram', [
    tile(0, 2, 'down', 'hammer'), tile(0, 2, 'up', 'hammer'),
  ], 0);
  const rs = createRuleset({ MOTOR_HP: 1, PAPER_HP: 100000, HAMMER_HP: 100000, SCISSOR_HP: 100000 });
  const { replay } = simulate(pkgOf(a, rs), pkgOf(b, rs), {
    seed: 1,
    ruleset: rs,
    maxTicks: 40,
    startOverride: alignedStart(a, b),
  });
  const last = replay.checkpoints[replay.checkpoints.length - 1]!;
  assert.equal(last.a.motorAlive, 0, 'the motors should be gone');
  assert.equal(last.a.speedMultiplierMilli, 0, 'no motor means no speed at all');

  const lost = replay.events.filter((e) => e.kind === 'motorLost' && e.team === 'A');
  assert.equal(lost.length, 1, 'exactly one motor-loss event');
});
