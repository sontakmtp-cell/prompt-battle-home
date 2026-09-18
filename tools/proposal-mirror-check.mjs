// Is the mirrored-bot symmetry test fragile, or did the commitment factor
// introduce a real asymmetry? Sweep the constant and find the first tick at
// which a mirrored match stops being symmetric.
import { simulate } from '../packages/core/dist/src/engine/simulate.js';
import { lockBot } from '../packages/core/dist/src/bot/package.js';
import { SPEAR } from '../packages/core/dist/src/bots/samples.js';
import { createRuleset } from '../packages/contracts/dist/src/index.js';

const spear = lockBot(SPEAR, createRuleset({}));

function firstAsymmetry(rs, maxTicks) {
  const { replay, result } = simulate(spear, spear, {
    seed: 0,
    ruleset: rs,
    maxTicks,
    startOverride: { a: { x: -5000, y: 0, heading: 0 }, b: { x: 5000, y: 0, heading: 32 } },
  });
  for (const f of replay.frames) {
    if (f.a.x !== -f.b.x || f.a.y !== f.b.y) return f.tick;
  }
  return null;
}

console.log('commit   first asymmetric frame (mirror a.x == -b.x)   final scores');
for (const base of [1000, 850, 750, 700, 675, 650, 600]) {
  const rs = createRuleset({ IMPACT_COMMIT_BASE: base, IMPACT_COMMIT_RANGE: 1000 - base });
  const s = lockBot(SPEAR, rs);
  const { result } = simulate(s, s, {
    seed: 0,
    ruleset: rs,
    maxTicks: 1500,
    startOverride: { a: { x: -5000, y: 0, heading: 0 }, b: { x: 5000, y: 0, heading: 32 } },
  });
  const tick = firstAsymmetry(rs, 1500);
  const tag = base === 1000 ? ' (commit disabled)' : '';
  console.log(
    String(base).padStart(4) + tag.padEnd(19) +
      String(tick === null ? 'never' : tick).padStart(8) +
      '                              ' + result.outcome.scoreA + ' / ' + result.outcome.scoreB,
  );
}
