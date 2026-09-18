import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { BrainCond, BrainDefinition, BrainRule } from '@promptchien/contracts';
import { BRAIN_API_VERSION } from '@promptchien/contracts';

import { validateBrain } from '../src/brain/validate.js';
import { BrainRuntime } from '../src/brain/interpreter.js';
import { runSandbox } from '../src/sandbox/run.js';
import { validateBot } from '../src/validation/validate.js';
import {
  CHASE_BRAIN,
  HOLD_BRAIN,
  RS,
  TYPES,
  defOf,
  rhombi,
  rhombusCoreIndex,
} from './helpers.js';

function brain(rules: BrainRule[]): BrainDefinition {
  return { version: BRAIN_API_VERSION, rules };
}

function codes(b: BrainDefinition): string[] {
  return validateBrain(b, RS).issues.filter((i) => i.severity === 'error').map((i) => i.code);
}

// ---------------------------------------------------------------------------
// static validation
// ---------------------------------------------------------------------------

test('brain: a sane brain validates', () => {
  const r = validateBrain(CHASE_BRAIN, RS);
  assert.deepEqual(r.issues, []);
  assert.equal(r.stats.nodes, 1);
  assert.equal(r.stats.depth, 0);
});

test('brain: an empty rule list is rejected', () => {
  assert.ok(codes(brain([])).includes('BRAIN_NO_RULES'));
});

test('brain: unknown move and rotate commands are rejected', () => {
  const bad = brain([
    { move: 'teleport' as never, rotate: 'spin' as never },
  ]);
  const got = codes(bad);
  assert.ok(got.includes('BRAIN_BAD_MOVE'), got.join(','));
  assert.ok(got.includes('BRAIN_BAD_ROTATE'), got.join(','));
});

test('brain: unknown fields are rejected, bare names too', () => {
  const bad = brain([
    { when: { cmp: ['>', { field: 'self.secretHp' }, 0] }, move: 'forward' },
    { when: { cmp: ['>', { field: 'enemy.mana' }, 0] }, move: 'forward' },
    { when: { cmp: ['>', { field: 'dist' }, 0] }, move: 'forward' },
  ]);
  const got = codes(bad);
  assert.equal(got.filter((c) => c === 'BRAIN_BAD_FIELD').length, 3, got.join(','));
});

test('brain: an unknown operator is rejected', () => {
  const bad = brain([{ when: { cmp: ['~~', 1, 2] as never }, move: 'forward' }]);
  assert.ok(codes(bad).includes('BRAIN_BAD_OP'), codes(bad).join(','));
});

test('brain: the node budget is enforced', () => {
  const rules: BrainRule[] = [];
  for (let i = 0; i < RS.BRAIN_MAX_NODES + 10; i++) rules.push({ move: 'forward' });
  assert.ok(codes(brain(rules)).includes('BRAIN_TOO_MANY_NODES'));
});

test('brain: the depth budget is enforced', () => {
  let cond: BrainCond = { cmp: ['>', { field: 'self.hp' }, 0] };
  for (let i = 0; i < RS.BRAIN_MAX_DEPTH + 4; i++) cond = { all: [cond] };
  assert.ok(codes(brain([{ when: cond, move: 'forward' }])).includes('BRAIN_TOO_DEEP'));
});

test('brain: the variable budget is enforced', () => {
  const rules: BrainRule[] = [];
  for (let i = 0; i < RS.BRAIN_MAX_VARS + 5; i++) {
    rules.push({ set: [{ var: `v${i}`, value: i }] });
  }
  assert.ok(codes(brain(rules)).includes('BRAIN_TOO_MANY_VARS'));
});

test('brain: bad variable names are rejected', () => {
  const bad = brain([{ set: [{ var: '9lives', value: 1 }], move: 'forward' }]);
  assert.ok(codes(bad).includes('BRAIN_BAD_VAR'));
});

// ---------------------------------------------------------------------------
// the interpreter
// ---------------------------------------------------------------------------

test('brain: the first matching rule wins', () => {
  const rt = new BrainRuntime(
    brain([
      { when: { cmp: ['<', { field: 'enemy.dist' }, 1000] }, move: 'backward', rotate: 'left' },
      { move: 'forward', rotate: 'toEnemy' },
    ]),
    RS,
  );
  assert.equal(rt.think({ 'enemy.dist': 500 }).move, 'backward');
  assert.equal(rt.think({ 'enemy.dist': 5000 }).move, 'forward');
});

test('brain: a brain with no matching rule does nothing', () => {
  const rt = new BrainRuntime(brain([{ when: { cmp: ['>', { field: 'self.hp' }, 999999] }, move: 'forward' }]), RS);
  const action = rt.think({ 'self.hp': 1 });
  assert.equal(action.move, 'hold');
  assert.equal(action.rotate, 'hold');
});

test('brain: blowing the step budget is a violation, not a crash', () => {
  // deeply nested conditions burn the step budget without ever matching
  let cond: BrainCond = { cmp: ['>', { field: 'self.hp' }, 0] };
  for (let i = 0; i < 8; i++) cond = { all: [cond, cond, cond] };
  const rt = new BrainRuntime(brain([{ when: cond, move: 'forward' }]), { ...RS, BRAIN_MAX_STEPS: 50 });
  const action = rt.think({ 'self.hp': 10 });
  assert.equal(action.violated, true, 'the tick should be flagged as a violation');
  assert.equal(action.move, 'hold', 'a violating brain is simply ignored for that tick');
  assert.equal(rt.violationRun, 1);
  assert.equal(rt.violations, 1);
});

test('brain: variables persist across ticks and reset on demand', () => {
  const rt = new BrainRuntime(
    brain([
      { set: [{ var: 'n', value: { field: 'self.tick' } }], move: 'forward' },
      { when: { cmp: ['>', { var: 'n' }, 100] }, move: 'hold' },
    ]),
    RS,
  );
  assert.equal(rt.think({ 'self.tick': 10 }).move, 'forward');
  rt.reset();
  // after a reset the variable is back to zero, so the guard rule cannot fire
  assert.equal(rt.think({ 'self.tick': 10 }).move, 'forward');
});

// ---------------------------------------------------------------------------
// the sandbox (gameplay.md 4.2)
// ---------------------------------------------------------------------------

test('sandbox: a bot that stands still fails', () => {
  const rows = ['HHHH', 'HHHH', 'SSSS', 'MMMM'];
  const frozen = defOf('frozen', rhombi(rows, TYPES), rhombusCoreIndex(rows, 0, 0), HOLD_BRAIN);
  const report = runSandbox(frozen, RS, { maxTicks: 400 });
  assert.equal(report.passed, false);
  assert.ok(report.positions.some((p) => p.failure?.includes('did not move')));
});

test('sandbox: a bot that runs away from the enemy fails', () => {
  const rows = ['HHHH', 'HHHH', 'SSSS', 'MMMM'];
  // never closes the distance: backs off whenever it gets close
  const coward = defOf(
    'coward',
    rhombi(rows, TYPES),
    rhombusCoreIndex(rows, 1, 1),
    brain([{ move: 'backward', rotate: 'awayFromEnemy' }]),
  );
  const report = runSandbox(coward, RS, { maxTicks: 400 });
  assert.equal(report.passed, false);
  assert.ok(
    report.positions.some((p) => p.failure !== null),
    'at least one placement must fail',
  );
});

test('sandbox: a bot that finds the enemy and hits it passes', () => {
  const rows = ['HHHH', 'HHHH', 'SSSS', 'MMMM'];
  const hunter = defOf('hunter', rhombi(rows, TYPES), rhombusCoreIndex(rows, 1, 1), CHASE_BRAIN);
  const report = runSandbox(hunter, RS, { maxTicks: 600 });
  assert.equal(report.passed, true, JSON.stringify(report.positions.filter((p) => !p.passed)));
  for (const p of report.positions) {
    assert.ok(p.movedMilli >= 1000, `placement ${p.seed} barely moved`);
    assert.ok(p.contactTicks > 0, `placement ${p.seed} never made contact`);
    assert.ok(p.damageDealt > 0, `placement ${p.seed} dealt no damage`);
  }
});

// ---------------------------------------------------------------------------
// the whole pipeline
// ---------------------------------------------------------------------------

test('validation: the report is bound to the exact definition hash', () => {
  const rows = ['HHHH', 'HHHH', 'SSSS', 'MMMM'];
  const def = defOf('bound', rhombi(rows, TYPES), rhombusCoreIndex(rows, 1, 1), CHASE_BRAIN);

  const first = validateBot(def, RS, { skipSandbox: true });
  assert.equal(first.ok, true, JSON.stringify(first.issues));
  assert.ok(first.stats);

  // submitting the same bot twice is deterministic
  const second = validateBot(def, RS, { skipSandbox: true });
  assert.equal(second.botHash, first.botHash);
  assert.deepEqual(second.stats, first.stats);

  // editing the bot after validation invalidates the report: the hash moves, so a
  // stale report can never be matched back to the edited bot
  const edited = defOf(
    'bound',
    rhombi(rows, TYPES),
    rhombusCoreIndex(rows, 1, 1),
    brain([{ move: 'forward', rotate: 'toEnemyCore' }]),
  );
  const third = validateBot(edited, RS, { skipSandbox: true });
  assert.notEqual(third.botHash, first.botHash, 'editing the brain must change the hash');
});

test('validation: a structurally broken bot never reaches the sandbox', () => {
  const broken = defOf('broken', [{ r: 0, j: 0, o: 'down', type: 'motor' }], 0, CHASE_BRAIN);
  const report = validateBot(broken, RS);
  assert.equal(report.ok, false);
  assert.equal(report.sandbox, null, 'no point simulating a bot that cannot be built');
  assert.equal(report.stats, null);
});
