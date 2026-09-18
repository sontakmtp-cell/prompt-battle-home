// How much headroom does IMPACT_COMMIT_BASE have? Check 14 must land under 80%,
// and a value that only just clears it is fragile.
import { runBalanceSuite } from '../packages/core/dist/src/balance/harness.js';
import { createRuleset } from '../packages/contracts/dist/src/index.js';

for (const base of [850, 800, 750, 700, 650, 600]) {
  const rs = createRuleset({ IMPACT_COMMIT_BASE: base, IMPACT_COMMIT_RANGE: 1000 - base });
  const rep = runBalanceSuite({ ruleset: rs, quick: true, seeds: 8 });
  const by = new Map(rep.checks.map((c) => [c.id, c]));
  const c14 = by.get(14);
  const c12 = by.get(12);
  const c8 = by.get(8);
  const c7 = by.get(7);
  console.log(
    'commit ' + String(base).padStart(3) + '/' + String(1000 - base).padStart(3) +
      '  c14 ' + (c14.status === 'pass' ? 'PASS' : 'fail') +
      '  ' + c14.measured.replace(/^stander /, '') +
      '   | c7 ' + c7.status + '  c8 ' + c8.status +
      '  c12 ' + c12.status + ' (' + (c12.measured.match(/p50 [\d.]+s/) ?? [''])[0] + ')',
  );
}
