import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkDefinition } from '../src/geometry/validator.js';
import { triVerts } from '../src/geometry/lattice.js';
import { SAMPLE_BOTS } from '../src/bots/samples.js';
import {
  RS,
  TYPES,
  defOf,
  hasError,
  hasWarning,
  rhombi,
  rhombus,
  rhombusCoreIndex,
  tile,
} from './helpers.js';

/** rows of `w` characters, `h` rows tall. */
function block(w: number, h: number, ch: string): string[] {
  return new Array(h).fill(ch.repeat(w)) as string[];
}

function check(def: Parameters<typeof checkDefinition>[0], monoBlock = false) {
  return checkDefinition(def, RS, { monoBlock });
}

test('geometry: a normal bot passes with no errors', () => {
  const rows = ['HHHH', 'HHHH', 'SSSS', 'MMMM'];
  const def = defOf('ok', rhombi(rows, TYPES), rhombusCoreIndex(rows, 1, 1), undefined);
  const r = check(def);
  assert.equal(r.issues.filter((i) => i.severity === 'error').length, 0, JSON.stringify(r.issues));
  assert.ok(r.stats);
  // 4 rows x 4 columns of rhombi = 32 tiles, 24 combat and 8 motors
  assert.equal(r.stats.triangles, 32);
  assert.equal(r.stats.combat, 24);
  assert.equal(r.stats.motors, 8);
});

test('geometry: every reference bot from the spec validates', () => {
  for (const bot of SAMPLE_BOTS) {
    const r = check(bot);
    const errors = r.issues.filter((i) => i.severity === 'error');
    assert.equal(errors.length, 0, `${bot.name}: ${JSON.stringify(errors)}`);
    assert.ok(r.stats, bot.name);
    assert.ok(r.stats.triangles <= RS.MAX_TRIANGLES, `${bot.name} over budget`);
  }
});

test('geometry: over budget is rejected', () => {
  // 12 rows x 11 columns of rhombi = 264 tiles, but still inside the 12x12 span.
  const rows = block(11, 12, 'H');
  const def = defOf('fat', rhombi(rows, TYPES), 0);
  const r = check(def);
  assert.ok(hasError(r.issues, 'BOT_OVER_BUDGET'), JSON.stringify(r.issues));
  assert.ok(!hasError(r.issues, 'BOT_TOO_BIG'), 'span is legal, only the budget is exceeded');
});

test('geometry: a body wider than 12x12 units is rejected', () => {
  const rows = block(13, 1, 'H'); // 26 tiles: under budget, far too wide
  const def = defOf('long', rhombi(rows, TYPES), 0);
  const r = check(def);
  assert.ok(hasError(r.issues, 'BOT_TOO_BIG'), JSON.stringify(r.issues));
  assert.ok(!hasError(r.issues, 'BOT_OVER_BUDGET'), '26 tiles is inside the 60 tile budget');
});

test('geometry: a duplicate cell is rejected', () => {
  const tris = [...rhombus(0, 0, 'hammer'), ...rhombus(0, 0, 'hammer')];
  const r = check(defOf('dupe', tris, 0));
  assert.ok(hasError(r.issues, 'TRI_OVERLAP'), JSON.stringify(r.issues));
});

test('geometry: two tiles touching only at a vertex are not connected', () => {
  // (0,0,down) and (0,1,down) share exactly one vertex and are NOT edge neighbours.
  const a = tile(0, 0, 'down', 'hammer');
  const b = tile(0, 1, 'down', 'hammer');
  const va = triVerts(a.r, a.j, a.o);
  const vb = triVerts(b.r, b.j, b.o);
  const shared = va.filter((p) => vb.some((q) => q.x === p.x && q.y === p.y));
  assert.equal(shared.length, 1, 'the two tiles must share exactly one vertex');

  const r = check(defOf('vertex', [a, b], 0));
  assert.ok(hasError(r.issues, 'BOT_DISCONNECTED'), JSON.stringify(r.issues));
});

test('geometry: a floating fragment is rejected', () => {
  const tris = [
    ...rhombus(0, 0, 'hammer'),
    ...rhombus(0, 1, 'hammer'),
    ...rhombus(0, 2, 'hammer'),
    // island: far away, edge-connected to nothing
    ...rhombus(6, 6, 'paper'),
  ];
  const r = check(defOf('island', tris, 0));
  assert.ok(hasError(r.issues, 'BOT_DISCONNECTED'), JSON.stringify(r.issues));
});

test('geometry: the Core may not sit on a Motor', () => {
  const rows = ['HH', 'MM'];
  const def = defOf('motorcore', rhombi(rows, TYPES), rhombusCoreIndex(rows, 1, 0));
  const r = check(def);
  assert.ok(hasError(r.issues, 'CORE_ON_MOTOR'), JSON.stringify(r.issues));
  assert.equal(r.stats, null, 'a rejected bot must not produce stats');
});

test('geometry: a Motor Core is allowed only when the ruleset says so', () => {
  const rows = ['HH', 'MM'];
  const def = defOf('motorcore', rhombi(rows, TYPES), rhombusCoreIndex(rows, 1, 0));
  const r = checkDefinition(def, { ...RS, CORE_ON_MOTOR_ALLOWED: true });
  assert.ok(!hasError(r.issues, 'CORE_ON_MOTOR'));
});

test('geometry: an out-of-range coreIndex is rejected', () => {
  const r = check(defOf('badcore', rhombus(0, 0, 'hammer'), 99));
  assert.ok(hasError(r.issues, 'CORE_BAD_INDEX'), JSON.stringify(r.issues));
});

test('geometry: a body with no combat triangle can never win', () => {
  const r = check(defOf('allmotor', rhombus(0, 0, 'motor'), 0));
  assert.ok(hasError(r.issues, 'BOT_NO_COMBAT'), JSON.stringify(r.issues));
});

test('geometry: a body with no motor cannot move', () => {
  const rows = ['HH', 'HH'];
  const r = check(defOf('nomotor', rhombi(rows, TYPES), 0));
  assert.ok(!hasError(r.issues, 'BOT_NO_MOTOR'), 'a motorless bot is legal');
  assert.ok(hasWarning(r.issues, 'BOT_NO_MOTOR'), JSON.stringify(r.issues));
});

test('geometry: off-lattice coordinates are rejected', () => {
  const bad = [{ r: 0.5, j: 0, o: 'down', type: 'hammer' }] as never;
  const r = check(defOf('offlattice', bad, 0));
  assert.ok(hasError(r.issues, 'TRI_BAD_COORDS'), JSON.stringify(r.issues));
});

test('geometry: unknown tile type and orientation are rejected', () => {
  const r1 = check(defOf('badtype', [{ r: 0, j: 0, o: 'down', type: 'laser' } as never], 0));
  assert.ok(hasError(r1.issues, 'TRI_BAD_TYPE'), JSON.stringify(r1.issues));

  const r2 = check(defOf('badorient', [{ r: 0, j: 0, o: 'sideways', type: 'hammer' } as never], 0));
  assert.ok(hasError(r2.issues, 'TRI_BAD_ORIENTATION'), JSON.stringify(r2.issues));
});

test('geometry: mono-culture warns above 65% and blocks above 80% when asked', () => {
  const rows = ['HHHH', 'HHHH', 'HHSS', 'MMMM'];
  const def = defOf('mono', rhombi(rows, TYPES), 0);

  const warned = check(def, false);
  assert.ok(hasWarning(warned.issues, 'BOT_MONO_WARNING'), JSON.stringify(warned.issues));
  assert.ok(!hasError(warned.issues, 'BOT_MONO_BLOCKED'), 'default keeps it a warning');

  const blocked = check(def, true);
  assert.ok(hasError(blocked.issues, 'BOT_MONO_BLOCKED'), JSON.stringify(blocked.issues));
});

test('geometry: a mixed body escapes the mono warning', () => {
  const rows = ['HHSS', 'PPHH', 'SSPP', 'MMMM'];
  const r = check(defOf('mixed', rhombi(rows, TYPES), 0));
  assert.ok(!hasWarning(r.issues, 'BOT_MONO_WARNING'), JSON.stringify(r.issues));
});
