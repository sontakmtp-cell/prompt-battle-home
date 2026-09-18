import { test } from 'node:test';
import assert from 'node:assert/strict';

import { simulate } from '../src/engine/simulate.js';
import { verifyReplay } from '../src/replay/verify.js';
import { validateBot } from '../src/validation/validate.js';
import { runSandbox } from '../src/sandbox/run.js';
import { checkDefinition } from '../src/geometry/validator.js';
import { SAMPLE_BOTS } from '../src/bots/samples.js';
import { RS, pkgOf } from './helpers.js';

const EXPECTED_NAMES = ['Spear', 'Shield', 'Flanker', 'Spinner', 'GlassCannon'];

test('samples: the five reference bots from the spec are all present', () => {
  assert.equal(SAMPLE_BOTS.length, 5);
  assert.deepEqual(
    SAMPLE_BOTS.map((b) => b.name),
    EXPECTED_NAMES,
  );
});

test('samples: every reference bot is structurally valid', () => {
  for (const bot of SAMPLE_BOTS) {
    const check = checkDefinition(bot, RS);
    const errors = check.issues.filter((i) => i.severity === 'error');
    assert.equal(errors.length, 0, `${bot.name}: ${JSON.stringify(errors)}`);
    assert.ok(check.stats, bot.name);
    assert.ok(check.stats.triangles <= RS.MAX_TRIANGLES, `${bot.name} is over budget`);
    assert.ok(check.stats.motors > 0, `${bot.name} cannot move`);
    assert.ok(check.stats.combat > 0, `${bot.name} cannot fight`);
    assert.notEqual(check.stats.coreType, 'motor', `${bot.name} has an illegal Core`);
  }
});

test('samples: every reference bot passes the full validation pipeline', () => {
  // this includes the eight-placement sandbox run, which is the expensive part
  for (const bot of SAMPLE_BOTS) {
    const report = validateBot(bot, RS);
    assert.equal(report.ok, true, `${bot.name}: ${JSON.stringify(report.issues)}`);
    assert.ok(report.sandbox, `${bot.name} produced no sandbox report`);
    assert.equal(report.sandbox.passed, true, `${bot.name}: ${JSON.stringify(report.sandbox.positions)}`);
    assert.match(report.botHash, /^[0-9a-f]{64}$/);
  }
});

test('samples: the reference bots are meaningfully different from each other', () => {
  const stats = SAMPLE_BOTS.map((b) => checkDefinition(b, RS).stats!);
  const speeds = new Set(stats.map((s) => s.speedMultiplierMilli));
  assert.ok(speeds.size >= 2, `every sample bot moves at the same speed: ${[...speeds].join(',')}`);

  const loads = new Set(stats.map((s) => s.loadMilli));
  assert.ok(loads.size >= 2, 'the sample roster does not explore the load table');

  const shapes = new Set(stats.map((s) => `${s.spanXMilli}x${s.spanYMilli}`));
  assert.ok(shapes.size >= 3, 'the sample roster does not explore different body shapes');
});

/**
 * The headline M1 acceptance test: two bots play a whole match to a decision, and
 * the match is reproducible from the replay file alone.
 */
test('samples: Spear vs Flanker plays a complete, verifiable match', () => {
  const spear = pkgOf(SAMPLE_BOTS[0]!);
  const flanker = pkgOf(SAMPLE_BOTS[2]!);
  const { result, replay, digest } = simulate(spear, flanker, { seed: 7, ruleset: RS });

  // it reaches a real decision, not the tick ceiling
  assert.notEqual(result.outcome.winner, null);
  assert.ok(['core', 'incap', 'timeout'].includes(result.outcome.reason));
  assert.ok(result.outcome.ticks > 0 && result.outcome.ticks <= RS.MATCH_MAX_TICKS);
  assert.ok(replay.frames.length === result.outcome.ticks);
  assert.ok(replay.events.length > 0);

  // there was an actual fight, not two bots missing each other
  const hits = replay.events.filter((e) => e.kind === 'hit');
  assert.ok(hits.length > 50, `only ${hits.length} hits landed`);

  // the last event is the end of the match
  const last = replay.events[replay.events.length - 1]!;
  assert.equal(last.kind, 'matchEnd');

  // and the replay recomputes to the same match
  assert.equal(verifyReplay(replay, spear, flanker, RS).ok, true);
  assert.match(digest, /^[0-9a-f]{8}$/);
});

test('samples: every ordered pair of reference bots completes a match', () => {
  for (const a of SAMPLE_BOTS) {
    for (const b of SAMPLE_BOTS) {
      if (a === b) continue;
      const { result, replay } = simulate(pkgOf(a), pkgOf(b), {
        seed: 3,
        ruleset: RS,
        maxTicks: 1200,
      });
      assert.ok(result.outcome.ticks > 0, `${a.name} vs ${b.name} produced no ticks`);
      assert.equal(replay.frames.length, result.outcome.ticks);
      const end = replay.events[replay.events.length - 1]!;
      assert.equal(end.kind, 'matchEnd', `${a.name} vs ${b.name} did not end cleanly`);
    }
  }
});

test('samples: the sandbox is deterministic', () => {
  const bot = SAMPLE_BOTS[0]!;
  const a = runSandbox(bot, RS, { maxTicks: 300 });
  const b = runSandbox(bot, RS, { maxTicks: 300 });
  assert.deepEqual(a, b);
});
