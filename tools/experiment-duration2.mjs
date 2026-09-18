// Sweep HP scale x hit cooldown and report the match duration distribution.
// can_bang.md 4: match length is the first thing to calibrate, and it must be
// measured, not guessed. Run: node tools/experiment-duration2.mjs
import { createRuleset, DEFAULT_RULESET } from '../packages/contracts/dist/src/index.js';
import { simulate, lockBot, SAMPLE_BOTS } from '../packages/core/dist/src/index.js';

const SEEDS = 10;

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[idx];
}

function measure(rs) {
  const pkgs = SAMPLE_BOTS.map((b) => lockBot(b, rs));
  const ticks = [];
  let timeouts = 0;
  for (let i = 0; i < pkgs.length; i++) {
    for (let k = 0; k < pkgs.length; k++) {
      if (i === k) continue;
      for (let s = 0; s < SEEDS; s++) {
        const { result } = simulate(pkgs[i], pkgs[k], { seed: s, ruleset: rs, recordReplay: false });
        ticks.push(result.outcome.ticks);
        if (result.outcome.reason === 'timeout') timeouts++;
      }
    }
  }
  ticks.sort((a, b) => a - b);
  const tr = rs.TICK_RATE;
  return {
    n: ticks.length,
    p10: percentile(ticks, 10) / tr,
    p50: percentile(ticks, 50) / tr,
    p90: percentile(ticks, 90) / tr,
    timeouts: ((timeouts * 100) / ticks.length).toFixed(0),
  };
}

const base = DEFAULT_RULESET;
for (const scale of [6, 7, 8, 9]) {
  for (const cd of [8, 10, 12]) {
    const rs = createRuleset({
      HAMMER_HP: 70 * scale,
      SCISSOR_HP: 105 * scale,
      PAPER_HP: 168 * scale,
      MOTOR_HP: 80 * scale,
      HIT_COOLDOWN_TICKS: cd,
    });
    const m = measure(rs);
    const ok = m.p50 >= 40 && m.p50 <= 80 ? '  <== IN BAND' : '';
    console.log(
      `hp x${scale} cd=${String(cd).padStart(2)}  p10=${m.p10.toFixed(1).padStart(5)}  p50=${m.p50.toFixed(1).padStart(5)}  p90=${m.p90.toFixed(1).padStart(6)}  timeouts=${m.timeouts}%  n=${m.n}${ok}`,
    );
  }
}
void base;
