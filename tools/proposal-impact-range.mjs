// Proposal test: widen the impact multiplier's dynamic range so check 14's
// "< 80%" bar becomes reachable, and see what it costs elsewhere.
//
// Currently IMPACT_BASE=850, IMPACT_RANGE=150 -> range [850,1000], ratio floor
// 0.85. Keeping the ceiling at 1000 and lowering the base widens the floor.
import { runBalanceSuite } from '../packages/core/dist/src/balance/harness.js';
import { createRuleset } from '../packages/contracts/dist/src/index.js';

const CONFIGS = [
  { label: 'baseline 850/150', rs: createRuleset({}) },
  { label: 'base 800/200', rs: createRuleset({ IMPACT_BASE: 800, IMPACT_RANGE: 200 }) },
  { label: 'base 750/250', rs: createRuleset({ IMPACT_BASE: 750, IMPACT_RANGE: 250 }) },
  { label: 'base 700/300', rs: createRuleset({ IMPACT_BASE: 700, IMPACT_RANGE: 300 }) },
];

const WATCH = [7, 8, 12, 13, 14, 15, 19, 20];

for (const { label, rs } of CONFIGS) {
  const rep = runBalanceSuite({ ruleset: rs, quick: true, seeds: 8 });
  const byId = new Map(rep.checks.map((c) => [c.id, c]));
  const parts = [];
  for (const id of WATCH) {
    const c = byId.get(id);
    if (!c) continue;
    const v = c.status === 'pass' ? 'ok' : c.status === 'fail' ? 'FAIL' : 'info';
    parts.push('#' + id + ':' + v);
  }
  const c14 = byId.get(14);
  const c8 = byId.get(8);
  const c12 = byId.get(12);
  console.log('\n=== ' + label + ' ===');
  console.log('  checks  ' + parts.join(' '));
  console.log('  c14  ' + c14.measured);
  console.log('  c8   ' + c8.measured);
  console.log('  c12  ' + c12.measured);
}
