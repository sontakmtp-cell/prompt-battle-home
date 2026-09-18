// Check 16: why does the compact block beat the wide wing 100% when the two
// bodies are identical in tile count, type mix and brain?
import { simulate } from '../packages/core/dist/src/engine/simulate.js';
import { lockBot } from '../packages/core/dist/src/bot/package.js';
import { gridToTriangles, coreIndexOf } from '../packages/core/dist/src/bots/samples.js';
import { buildGeometry } from '../packages/core/dist/src/geometry/build.js';
import { DEFAULT_RULESET, BOT_SCHEMA_VERSION } from '../packages/contracts/dist/src/index.js';

const wideRows = ['HHHHHHHHHHH', 'HHHHHHHHHHH', 'HHMMMMMM'];
const blockRows = ['HHHHHH', 'HHHHHH', 'HHHHHH', 'HHHHHH', 'MMMMMM'];
const brain = [{ move: 'forward', rotate: 'toEnemy' }];

const mk = (name, rows, r, j) => ({
  schemaVersion: BOT_SCHEMA_VERSION,
  name,
  triangles: gridToTriangles(rows),
  coreIndex: coreIndexOf(rows, r, j),
  brain: { version: 1, rules: brain },
});

const wide = mk('WideWing', wideRows, 1, 5);
const block = mk('Block', blockRows, 2, 2);

for (const b of [wide, block]) {
  const g = buildGeometry(b);
  let maxR = 0;
  for (const t of g.tris) {
    const d = Math.sqrt(t.localCentroid.x * t.localCentroid.x + t.localCentroid.y * t.localCentroid.y);
    if (d > maxR) maxR = d;
  }
  console.log(b.name.padEnd(9) + ' tiles=' + g.tris.length + '  boundingRadius=' + maxR.toFixed(0) + ' milli');
}

function seedList(n, base) {
  const out = [];
  let s = base >>> 0;
  for (let i = 0; i < n; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    out.push(s % 100000);
  }
  return out;
}

const A = lockBot(block, DEFAULT_RULESET);
const B = lockBot(wide, DEFAULT_RULESET);
let aWins = 0;
const agg = {
  A: { n: 0, orient: 0, impact: 0, dmg: 0 },
  B: { n: 0, orient: 0, impact: 0, dmg: 0 },
};
const seeds = seedList(100, 8);
for (const seed of seeds) {
  const { result, replay } = simulate(A, B, { seed, ruleset: DEFAULT_RULESET });
  if (result.outcome.winner === 'A') aWins++;
  for (const e of replay.events) {
    if (e.kind !== 'hit') continue;
    const s = agg[e.attackerTeam];
    s.n++;
    s.orient += e.orientMul;
    s.impact += e.impactMul;
    s.dmg += e.damage;
  }
}

console.log('\nblock (A) wins ' + aWins + '/100');
for (const team of ['A', 'B']) {
  const s = agg[team];
  const name = team === 'A' ? 'Block   ' : 'WideWing';
  console.log(
    name + '  hits=' + String(s.n).padStart(7) +
      '  meanOrient=' + (s.orient / s.n).toFixed(1) +
      '  meanImpact=' + (s.impact / s.n).toFixed(1) +
      '  totalDamage=' + String(s.dmg).padStart(8),
  );
}
