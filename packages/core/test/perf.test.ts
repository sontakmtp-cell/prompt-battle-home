import { test } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

import { simulate } from '../src/engine/simulate.js';
import { SAMPLE_BOTS } from '../src/bots/samples.js';
import { RS, pkgOf } from './helpers.js';

/** The tick budget from the M1 acceptance list, in milliseconds. */
const TICK_BUDGET_MS = 33;

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[idx]!;
}

/**
 * PLAN.md's M1 performance requirement: two concurrent matches on the reference
 * VPS must keep tick processing p95 under 33 ms.
 *
 * There is no server at M1, so what is measured is the engine's own tick cost. A
 * batch of full matches is run and each match's mean milliseconds per tick is
 * recorded; the 95th percentile of those means is the number that matters. Two
 * matches share one core, so the per-match budget is half the 33 ms.
 */
test('perf: two concurrent matches stay far inside the tick budget', () => {
  const pkgs = SAMPLE_BOTS.map((b) => pkgOf(b));
  const perTick: number[] = [];
  let totalTicks = 0;

  for (let round = 0; round < 2; round++) {
    for (let i = 0; i < pkgs.length; i++) {
      for (let k = 0; k < pkgs.length; k++) {
        if (i === k) continue;
        const seed = round * 100 + i * 10 + k;
        const t0 = performance.now();
        const { result } = simulate(pkgs[i]!, pkgs[k]!, { seed, ruleset: RS, recordReplay: false });
        const ms = performance.now() - t0;
        const ticks = Math.max(1, result.outcome.ticks);
        totalTicks += ticks;
        perTick.push(ms / ticks);
      }
    }
  }

  perTick.sort((a, b) => a - b);
  const p50 = percentile(perTick, 50);
  const p95 = percentile(perTick, 95);
  const budget = TICK_BUDGET_MS / 2;

  assert.ok(perTick.length >= 40, `only ${perTick.length} matches measured`);
  assert.ok(
    p95 < budget,
    `tick p95 is ${p95.toFixed(3)} ms, over the ${budget} ms half budget for one of two concurrent matches ` +
      `(p50 ${p50.toFixed(3)} ms over ${perTick.length} matches, ${totalTicks} ticks)`,
  );
});

test('perf: a full length match is not pathologically slow', () => {
  // a match that runs all the way to the tick ceiling is the worst case
  const a = pkgOf(SAMPLE_BOTS[1]!); // Shield, the tankiest sample
  const b = pkgOf(SAMPLE_BOTS[3]!); // Spinner
  const t0 = performance.now();
  const { result } = simulate(a, b, { seed: 5, ruleset: RS });
  const ms = performance.now() - t0;
  assert.ok(result.outcome.ticks > 0);
  // generous ceiling: this is a smoke test against an accidental O(n^2) blow-up,
  // not a benchmark. The real budget check is the test above.
  assert.ok(ms < 5000, `a full match took ${ms.toFixed(0)} ms`);
});
