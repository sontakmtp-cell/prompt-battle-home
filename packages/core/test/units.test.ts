import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_RULESET,
  ORIENT_LUT,
  ROT64,
  ROT_SCALE,
  SPEED_BANDS,
  SPEED_OVERLOAD_MULT,
  canonicalJson,
  computeDamage,
  advantageOf,
  baseDamage,
  baseHp,
  createRuleset,
  diversityMaxHp,
  loadFactorMilli,
  pullCapacity,
  ringRadiusAt,
  rpsMultiplier,
  speedMultiplierFor,
} from '@promptchien/contracts';

const RS = DEFAULT_RULESET;

/**
 * can_bang.md 3.6, the "fourth law": every multiplier in the engine is an
 * integer in 1/1000 units. One float on the damage path makes the integer
 * division return 0 for every hit, and the formula still reads correctly, so it
 * is very hard to spot. This test is the tripwire.
 */
test('units: every ruleset coefficient is an integer', () => {
  for (const [k, v] of Object.entries(RS)) {
    if (typeof v === 'number') {
      assert.ok(Number.isInteger(v), `${k} = ${v} is not an integer`);
    }
  }
});

test('units: every orientation multiplier is an integer in 1/1000', () => {
  assert.equal(ORIENT_LUT.length, RS.ORIENT_LUT_STEPS);
  for (let i = 0; i < ORIENT_LUT.length; i++) {
    const v = ORIENT_LUT[i]!;
    assert.ok(Number.isInteger(v), `ORIENT_LUT[${i}] = ${v}`);
    assert.ok(v >= RS.ORIENT_BASE && v <= RS.ORIENT_BASE + RS.ORIENT_RANGE, `ORIENT_LUT[${i}] = ${v}`);
  }
  assert.equal(ORIENT_LUT[0], 1000, 'a dead-on hit is a full 1.000');
  assert.equal(ORIENT_LUT[32], RS.ORIENT_BASE, '90 degrees away is the 0.850 floor');
});

test('units: the orientation table never rises as the angle opens', () => {
  for (let i = 1; i < 32; i++) {
    assert.ok(ORIENT_LUT[i]! <= ORIENT_LUT[i - 1]!, `ORIENT_LUT[${i}] rose`);
  }
  for (let i = 32; i < ORIENT_LUT.length; i++) {
    assert.equal(ORIENT_LUT[i], RS.ORIENT_BASE, 'beyond 90 degrees the floor is flat');
  }
});

test('units: the 64 direction vectors are integers at scale 1e6', () => {
  assert.equal(ROT64.length, 64);
  for (let i = 0; i < 64; i++) {
    const [x, y] = ROT64[i]!;
    assert.ok(Number.isInteger(x) && Number.isInteger(y), `ROT64[${i}] = ${x},${y}`);
    // length must be 1.0 to within a milli-unit of the scale
    const len2 = x * x + y * y;
    const target = ROT_SCALE * ROT_SCALE;
    assert.ok(Math.abs(len2 - target) / target < 1e-4, `ROT64[${i}] length off`);
  }
  assert.deepEqual([...ROT64[0]!], [ROT_SCALE, 0]);
});

/**
 * The canonical calibration case from can_bang.md 10:
 * Hammer -> Scissor, perfect impact, dead-on orientation must be exactly 48.
 * A value of 0 means floating point leaked onto the damage path.
 */
test('units: Hammer hitting Scissor perfectly deals exactly 48', () => {
  const dmg = computeDamage(RS, RS.HAMMER_DAMAGE, RS.RPS_ADVANTAGE, 1000, 1000);
  assert.equal(dmg, 48);
});

test('units: the whole damage matrix is exact integer arithmetic', () => {
  const types = ['hammer', 'scissor', 'paper'] as const;
  for (const atk of types) {
    for (const def of types) {
      const base = baseDamage(RS, atk);
      const rps = rpsMultiplier(RS, atk, def);
      for (const impact of [RS.IMPACT_BASE, 1000]) {
        for (const orient of [RS.ORIENT_BASE, 1000]) {
          const got = computeDamage(RS, base, rps, impact, orient);
          const want = Math.floor((base * rps * impact * orient) / 1_000_000_000);
          assert.equal(got, want, `${atk}->${def} i=${impact} o=${orient}`);
          assert.ok(Number.isInteger(got));
        }
      }
    }
  }
});

test('units: a Motor deals no damage and takes neutral damage', () => {
  assert.equal(RS.MOTOR_DAMAGE, 0);
  for (const t of ['hammer', 'scissor', 'paper'] as const) {
    assert.equal(rpsMultiplier(RS, 'motor', t), 0, 'a motor cannot attack');
    assert.equal(rpsMultiplier(RS, t, 'motor'), RS.MOTOR_DAMAGE_MULT, 'a motor is outside the RPS ring');
    assert.equal(advantageOf(RS, t, 'motor'), 'neutral');
    const dmg = computeDamage(RS, baseDamage(RS, t), RS.MOTOR_DAMAGE_MULT, 1000, 1000);
    assert.equal(dmg, baseDamage(RS, t), 'damage against a motor is exactly the base damage');
  }
});

/**
 * can_bang.md 3.8, the RPS invariant. This is the blocking test: if it fails the
 * game is not rock-paper-scissors any more, whatever the design doc says.
 *   weakest advantage hit  >  strongest disadvantage hit
 *   floor(10 x 2.0 x 0.85 x 0.85) = 14   >   24 x 0.5 x 1.0 x 1.0 = 12
 */
test('units: the RPS invariant holds with the real numbers', () => {
  const weakestAdvantage = Math.min(
    ...(['hammer', 'scissor', 'paper'] as const).map((atk) => {
      const def = atk === 'hammer' ? 'scissor' : atk === 'scissor' ? 'paper' : 'hammer';
      return computeDamage(RS, baseDamage(RS, atk), RS.RPS_ADVANTAGE, RS.IMPACT_BASE, RS.ORIENT_BASE);
    }),
  );
  const strongestDisadvantage = Math.max(
    ...(['hammer', 'scissor', 'paper'] as const).map((atk) => {
      const def = atk === 'hammer' ? 'paper' : atk === 'scissor' ? 'hammer' : 'scissor';
      return computeDamage(RS, baseDamage(RS, atk), RS.RPS_DISADVANTAGE, 1000, 1000);
    }),
  );
  assert.equal(weakestAdvantage, 14);
  assert.equal(strongestDisadvantage, 12);
  assert.ok(
    weakestAdvantage > strongestDisadvantage,
    `advantage floor ${weakestAdvantage} must beat disadvantage ceiling ${strongestDisadvantage}`,
  );
});

test('units: HP x damage is identical for all three combat types', () => {
  const products = (['hammer', 'scissor', 'paper'] as const).map(
    (t) => baseHp(RS, t) * baseDamage(RS, t),
  );
  assert.equal(new Set(products).size, 1, `products differ: ${products.join(', ')}`);
});

test('units: speed multipliers are integers and the bands are exact', () => {
  for (const [load, want] of [
    [0, 1150],
    [250, 1150],
    [500, 1150], // the 30+30 bot: load exactly 0.50 keeps the 115% bonus
    [501, 1000],
    [750, 1000], // the 0.50-1.00 band is flat
    [1000, 1000], // the 45+15 bot: load exactly 1.00 is 100%
    [1250, 850],
    [1500, 700],
    [1750, 550],
    [2000, 400],
    [2500, 150],
  ] as const) {
    const got = speedMultiplierFor(load);
    assert.ok(Number.isInteger(got), `load ${load} -> ${got}`);
    assert.equal(got, want, `load ${load}`);
  }
});

/**
 * gameplay.md 3.4.1's own worked table, for a 45 combat + 15 motor bot
 * (60 tiles) as its motors are picked off. The doc quotes ~89% / ~78% / ~49% /
 * ~15%; this pins the exact ruleset values so a later "tidy up" of the table
 * cannot silently drift away from the design.
 */
test('units: the doc worked example for a losing 45+15 bot reproduces', () => {
  const body = 60;
  const cases: Array<[motorsLost: number, want: number]> = [
    [3, 888], // 57 tiles, 12 motors -> load 1.188
    [5, 775], // 55 tiles, 10 motors -> load 1.375
    [8, 486], // 52 tiles,  7 motors -> load 1.857
    [11, 150], // 49 tiles,  4 motors -> load 3.063, overloaded
  ];
  for (const [lost, want] of cases) {
    const tiles = body - lost;
    const motors = 15 - lost;
    const load = loadFactorMilli(RS, tiles, motors);
    assert.equal(speedMultiplierFor(load), want, `losing ${lost} motors (load ${load})`);
  }
});

test('units: the 115% band is a real step, not a slow ramp', () => {
  // the whole point of the band is that a comfortably-light bot is visibly faster
  assert.equal(speedMultiplierFor(0), speedMultiplierFor(500), 'the 115% band is flat');
  assert.equal(speedMultiplierFor(501), speedMultiplierFor(1000), 'the 100% band is flat');
  assert.ok(speedMultiplierFor(500) > speedMultiplierFor(501), 'the band boundary is a step');
});

test('units: the band table is well formed', () => {
  let prev = 0;
  for (const band of SPEED_BANDS) {
    assert.ok(band.upToMilli > prev, 'bands must be strictly increasing');
    assert.ok(Number.isInteger(band.fromMilli) && Number.isInteger(band.toMilli));
    assert.ok(band.fromMilli >= band.toMilli, 'speed must never rise as load grows');
    prev = band.upToMilli;
  }
  assert.equal(SPEED_BANDS[0]!.fromMilli, 1150, 'the lightest band is the fastest');
  assert.equal(SPEED_BANDS[SPEED_BANDS.length - 1]!.toMilli, 400);
  assert.ok(SPEED_OVERLOAD_MULT < SPEED_BANDS[SPEED_BANDS.length - 1]!.toMilli);
});

test('units: load factor is an integer in 1/1000 and uses 4 pull per motor', () => {
  assert.equal(pullCapacity(RS, 10), 40);
  assert.equal(loadFactorMilli(RS, 40, 10), 1000);
  assert.equal(loadFactorMilli(RS, 60, 10), 1500);
  assert.equal(loadFactorMilli(RS, 1, 0), 1_000_000, 'no motor means no capacity at all');
  for (const [body, motors] of [
    [60, 18],
    [45, 15],
    [30, 30],
    [56, 4],
  ] as const) {
    const v = loadFactorMilli(RS, body, motors);
    assert.ok(Number.isInteger(v), `load ${body}/${motors} = ${v}`);
  }
});

test('units: diversity resonance is +12% per extra type, capped at +24%', () => {
  const base = 1000;
  assert.equal(diversityMaxHp(RS, base, 1), 1000, 'one type is no bonus');
  assert.equal(diversityMaxHp(RS, base, 2), 1120);
  assert.equal(diversityMaxHp(RS, base, 3), 1240);
  assert.equal(diversityMaxHp(RS, base, 4), 1240, 'capped: there are only three combat types');
});

test('units: the ring holds at full radius then shrinks linearly to the floor', () => {
  assert.equal(ringRadiusAt(RS, 0), RS.RING_START_RADIUS);
  assert.equal(ringRadiusAt(RS, RS.RING_START_TICK - 1), RS.RING_START_RADIUS);
  assert.equal(ringRadiusAt(RS, RS.MATCH_MAX_TICKS), RS.RING_END_RADIUS);
  let prev = Number.MAX_SAFE_INTEGER;
  for (let t = RS.RING_START_TICK; t <= RS.MATCH_MAX_TICKS; t += 10) {
    const r = ringRadiusAt(RS, t);
    assert.ok(r <= prev, `ring grew at tick ${t}`);
    assert.ok(Number.isInteger(r));
    prev = r;
  }
});

test('units: canonical JSON refuses non-integers', () => {
  assert.equal(canonicalJson({ b: 2, a: 1 }), '{"a":1,"b":2}');
  assert.throws(() => canonicalJson({ a: 1.5 }), /integer/i);
  assert.throws(() => canonicalJson({ a: Number.NaN }), /finite|integer/i);
  assert.throws(() => canonicalJson({ a: Number.POSITIVE_INFINITY }), /finite|integer/i);
});

test('units: a ruleset override does not mutate the default', () => {
  const custom = createRuleset({ MAX_TRIANGLES: 10 });
  assert.equal(custom.MAX_TRIANGLES, 10);
  assert.equal(DEFAULT_RULESET.MAX_TRIANGLES, 60, 'the shared default was mutated');
});
