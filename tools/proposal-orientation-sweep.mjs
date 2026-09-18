// Checks 10 and 16 are the last two failures. Check 10 now sits at Facing 54%
// vs Blind 45% - one point short of the 10-point bar. The only lever is the
// orientation multiplier's dynamic range, whose floor is ORIENT_BASE (the
// ceiling is pinned at 1000 by the "Hammer->Scissor perfect = 48" criterion).
//
// ORIENT_BASE also appears in check 7 (the blocking RPS invariant), so sweep it
// and watch everything.
import { runBalanceSuite } from '../packages/core/dist/src/balance/harness.js';
import { createRuleset } from '../packages/contracts/dist/src/index.js';

const WATCH = [7, 8, 10, 12, 13, 14, 15, 16, 19, 20];

for (const base of [850, 825, 800, 780, 765]) {
  const rs = createRuleset({ ORIENT_BASE: base, ORIENT_RANGE: 1000 - base });
  const rep = runBalanceSuite({ ruleset: rs, quick: true, seeds: 16 });
  const by = new Map(rep.checks.map((c) => [c.id, c]));
  const fails = WATCH.filter((id) => by.get(id)?.status === 'fail');
  console.log(
    'ORIENT_BASE ' + String(base).padStart(3) +
      '  span ' + (((1000 - base) / base) * 100).toFixed(1).padStart(4) + '%' +
      '  fails: ' + (fails.length ? '#' + fails.join(' #') : 'none'),
  );
  console.log('    c10 ' + by.get(10).measured);
  console.log('    c16 ' + by.get(16).measured);
  console.log('    c7  ' + by.get(7).measured);
  console.log('    c8  ' + by.get(8).measured.split(' (')[0]);
  console.log('    c12 ' + by.get(12).measured);
}
