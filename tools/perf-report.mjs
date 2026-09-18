// Report the actual tick timings behind the M1 performance gate, so the numbers
// can be quoted in reports/balance-m1.md instead of just "the test passed".
import { performance } from 'node:perf_hooks';
import { simulate } from '../packages/core/dist/src/engine/simulate.js';
import { SAMPLE_BOTS } from '../packages/core/dist/src/bots/samples.js';
import { lockBot } from '../packages/core/dist/src/bot/package.js';
import { DEFAULT_RULESET } from '../packages/contracts/dist/src/index.js';

const pkgs = SAMPLE_BOTS.map((b) => lockBot(b, DEFAULT_RULESET));
const perTick = [];
let totalTicks = 0;
let totalMs = 0;

for (let round = 0; round < 2; round++) {
  for (let i = 0; i < pkgs.length; i++) {
    for (let k = 0; k < pkgs.length; k++) {
      if (i === k) continue;
      const seed = round * 100 + i * 10 + k;
      const t0 = performance.now();
      const { result } = simulate(pkgs[i], pkgs[k], { seed, ruleset: DEFAULT_RULESET, recordReplay: false });
      const ms = performance.now() - t0;
      const ticks = Math.max(1, result.outcome.ticks);
      totalTicks += ticks;
      totalMs += ms;
      perTick.push(ms / ticks);
    }
  }
}

const sorted = [...perTick].sort((a, b) => a - b);
const pct = (p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))))];
const fmt = (x) => x.toFixed(3) + ' ms';

console.log('matches measured      : ' + perTick.length);
console.log('total ticks simulated : ' + totalTicks);
console.log('tick p50              : ' + fmt(pct(50)));
console.log('tick p95              : ' + fmt(pct(95)));
console.log('tick p99              : ' + fmt(pct(99)));
console.log('tick max              : ' + fmt(sorted[sorted.length - 1]));
console.log('two-match p95 budget  : ' + fmt(33 / 2) + '  (2 matches share one core, 33 ms wall budget)');
console.log('aggregate throughput  : ' + (totalTicks / (totalMs / 1000)).toFixed(0) + ' ticks/s single-threaded');
