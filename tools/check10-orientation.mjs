// Check 10's root cause: how much orientation does "turn to face the enemy"
// actually buy, versus holding a fixed heading? Same body (SPEAR), same
// movement rule, only `rotate` differs.
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

const seeds = seedList(100, 11);

function collect(team) {
  const A = lockBot(facing, DEFAULT_RULESET);
  const B = lockBot(blind, DEFAULT_RULESET);
  let n = 0;
  let orientSum = 0;
  let impactSum = 0;
  let dmgSum = 0;
  let worst = 1000;
  for (const seed of seeds) {
    const { replay } = simulate(A, B, { seed, ruleset: DEFAULT_RULESET });
    for (const e of replay.events) {
      if (e.kind !== 'hit') continue;
      if (e.attackerTeam !== team) continue;
      n++;
      orientSum += e.orientMul;
      impactSum += e.impactMul;
      dmgSum += e.damage;
      if (e.orientMul < worst) worst = e.orientMul;
    }
  }
  return {
    n,
    orient: orientSum / n,
    impact: impactSum / n,
    dmg: dmgSum / n,
    worst,
  };
}

const f = collect('A');
const b = collect('B');

console.log('                       facing (A)     blind (B)');
console.log('hits                   ' + String(f.n).padStart(9) + String(b.n).padStart(14));
console.log('mean orientMul         ' + f.orient.toFixed(1).padStart(9) + b.orient.toFixed(1).padStart(14));
console.log('mean impactMul         ' + f.impact.toFixed(1).padStart(9) + b.impact.toFixed(1).padStart(14));
console.log('mean damage per hit    ' + f.dmg.toFixed(3).padStart(9) + b.dmg.toFixed(3).padStart(14));
console.log('worst orientMul seen   ' + String(f.worst).padStart(9) + String(b.worst).padStart(14));
console.log('');
console.log('orientation range in the LUT: ' + ORIENT_LUT[0] + ' (dead-on) .. ' + ORIENT_LUT[ORIENT_LUT.length - 1] + ' (>=90 deg)');
console.log('so the whole orientation mechanic spans ' +
  (((ORIENT_LUT[0] / ORIENT_LUT[ORIENT_LUT.length - 1] - 1) * 100).toFixed(1)) + '% of damage.');
console.log('facing buys ' + (f.orient - b.orient).toFixed(1) + ' milli-units of orientation (' +
  (((f.orient / b.orient - 1) * 100).toFixed(2)) + '%), i.e. ' +
  (((f.dmg / b.dmg - 1) * 100).toFixed(2)) + '% more damage per hit.');
