// Why does the orientation multiplier not respond to its own dynamic range?
// Histogram the per-hit orientation multiplier for a facing bot vs a blind bot.
import { simulate } from '../packages/core/dist/src/engine/simulate.js';
import { lockBot } from '../packages/core/dist/src/bot/package.js';
import { SPEAR } from '../packages/core/dist/src/bots/samples.js';
import { DEFAULT_RULESET, ORIENT_LUT } from '../packages/contracts/dist/src/index.js';

const facing = { ...SPEAR, name: 'Facing', brain: { version: 1, rules: [{ move: 'forward', rotate: 'toEnemy' }] } };
const blind = { ...SPEAR, name: 'Blind', brain: { version: 1, rules: [{ move: 'forward', rotate: 'hold' }] } };

function seedList(n, base) {
  const out = [];
  let s = base >>> 0;
  for (let i = 0; i < n; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    out.push(s % 100000);
  }
  return out;
}
const seeds = seedList(60, 11);

const A = lockBot(facing, DEFAULT_RULESET);
const B = lockBot(blind, DEFAULT_RULESET);

function histogram(team) {
  const buckets = new Map();
  let n = 0;
  for (const seed of seeds) {
    const { replay } = simulate(A, B, { seed, ruleset: DEFAULT_RULESET });
    for (const e of replay.events) {
      if (e.kind !== 'hit' || e.attackerTeam !== team) continue;
      n++;
      buckets.set(e.orientMul, (buckets.get(e.orientMul) ?? 0) + 1);
    }
  }
  return { buckets, n };
}

const f = histogram('A');
const b = histogram('B');

console.log('ORIENT_LUT spans ' + ORIENT_LUT[0] + ' .. ' + ORIENT_LUT[ORIENT_LUT.length - 1] +
  '  (' + ORIENT_LUT.length + ' entries)');
console.log('the lattice is bipartite: every edge neighbour of an "up" tile is a "down" tile,');
console.log('so at any contact roughly half the attacker tiles present the WRONG face.\n');

for (const [label, h] of [['facing (toEnemy)', f], ['blind  (hold)  ', b]]) {
  console.log(label + '   ' + h.n + ' hits');
  const top = [...h.buckets.entries()].sort((x, y) => y[1] - x[1]).slice(0, 6);
  for (const [mul, cnt] of top) {
    const pct = ((100 * cnt) / h.n).toFixed(1);
    console.log('    orientMul ' + String(mul).padStart(4) + '  ' + String(cnt).padStart(7) +
      '  ' + pct.padStart(5) + '%  ' + '#'.repeat(Math.round(Number(pct) / 2)));
  }
}

// how much of the mass sits at the floor vs the ceiling
const share = (h, lo, hi) => {
  let s = 0;
  for (const [mul, cnt] of h.buckets) if (mul >= lo && mul <= hi) s += cnt;
  return (100 * s) / h.n;
};
console.log('\nfacing: ' + share(f, 1000, 1000).toFixed(1) + '% of hits at the 1000 ceiling, ' +
  share(f, 850, 860).toFixed(1) + '% at the 850 floor');
console.log('blind : ' + share(b, 1000, 1000).toFixed(1) + '% of hits at the 1000 ceiling, ' +
  share(b, 850, 860).toFixed(1) + '% at the 850 floor');
