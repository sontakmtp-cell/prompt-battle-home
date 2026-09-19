import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { BrainCond, BrainDefinition, ValidationReport } from '@promptchien/contracts';
import { BRAIN_API_VERSION } from '@promptchien/contracts';

import { hashDefinition } from '../src/replay/hash.js';
import { UNHASHABLE_BOT_HASH, validateBot } from '../src/validation/validate.js';
import { SAMPLE_BOTS } from '../src/bots/samples.js';
import { RS } from './helpers.js';

/**
 * sha256 of the canonical normalised Spear definition, captured before the
 * structural-safety fix. It must stay byte-identical: this fix changes WHEN we
 * hash, never WHAT we hash.
 */
const SPEAR_HASH = 'd0cddc5355273badaf11b20f605f953debfdbb02deb2ce1c9865ee6ec9cca84d';

const HEX64 = /^[0-9a-f]{64}$/;

// ---------------------------------------------------------------------------
// structurally broken input: a well-formed report, never a throw
// ---------------------------------------------------------------------------

test('validation: {} returns a report with the sentinel hash, no throw', () => {
  let report: ValidationReport | undefined;
  assert.doesNotThrow(() => {
    report = validateBot({} as never, RS);
  });
  assert.ok(report, 'validateBot must return a report');
  assert.equal(report.ok, false);
  assert.equal(report.botHash, UNHASHABLE_BOT_HASH);
  assert.ok(report.issues.some((i) => i.severity === 'error'));
});

test('validation: a definition missing triangles returns a report, no throw', () => {
  const { triangles: _omit, ...noTriangles } = SAMPLE_BOTS[0]!;
  let report: ValidationReport | undefined;
  assert.doesNotThrow(() => {
    report = validateBot(noTriangles as never, RS);
  });
  assert.ok(report);
  assert.equal(report.ok, false);
  assert.equal(report.botHash, UNHASHABLE_BOT_HASH);
  assert.ok(report.issues.some((i) => i.code === 'BOT_NO_TRIANGLES'));
});

test('validation: a definition missing brain returns a report, no throw', () => {
  const { brain: _omit, ...noBrain } = SAMPLE_BOTS[0]!;
  let report: ValidationReport | undefined;
  assert.doesNotThrow(() => {
    report = validateBot(noBrain as never, RS);
  });
  assert.ok(report);
  assert.equal(report.ok, false);
  assert.equal(report.botHash, UNHASHABLE_BOT_HASH);
  assert.ok(report.issues.some((i) => i.code === 'BOT_NO_BRAIN'));
});

test('validation: triangles of the wrong type returns a report, no throw', () => {
  const bad = { ...SAMPLE_BOTS[0]!, triangles: 'nope' } as never;
  let report: ValidationReport | undefined;
  assert.doesNotThrow(() => {
    report = validateBot(bad, RS);
  });
  assert.ok(report);
  assert.equal(report.ok, false);
  assert.equal(report.botHash, UNHASHABLE_BOT_HASH);
});

test('validation: brain.rules of the wrong type returns a report, no throw', () => {
  const bad = {
    ...SAMPLE_BOTS[0]!,
    brain: { version: BRAIN_API_VERSION, rules: 'x' },
  } as never;
  let report: ValidationReport | undefined;
  assert.doesNotThrow(() => {
    report = validateBot(bad, RS);
  });
  assert.ok(report);
  assert.equal(report.ok, false);
  assert.ok(report.issues.some((i) => i.code === 'BRAIN_NO_RULES'));
});

test('validation: an abnormally deep condition tree is rejected, not crashed', () => {
  // 100k nested groups. Built with a loop so the source stays a single line and
  // the depth is real, not a literal the parser would refuse.
  let deep: BrainCond = { cmp: ['>', { field: 'self.hp' }, 0] };
  for (let i = 0; i < 100_000; i++) deep = { all: [deep] };
  const brain: BrainDefinition = {
    version: BRAIN_API_VERSION,
    rules: [{ when: deep, move: 'forward' }],
  };
  const def = { ...SAMPLE_BOTS[0]!, brain } as never;

  let report: ValidationReport | undefined;
  assert.doesNotThrow(() => {
    report = validateBot(def, RS);
  });
  assert.ok(report, 'validateBot must return a report');
  assert.equal(report.ok, false);
  assert.equal(report.botHash, UNHASHABLE_BOT_HASH);
  assert.ok(
    report.issues.some((i) => i.code === 'BOT_TOO_DEEP'),
    `expected BOT_TOO_DEEP, got ${report.issues.map((i) => i.code).join(',')}`,
  );
});

// ---------------------------------------------------------------------------
// value-level non-serialisable input: canonicalJson refuses the value, so the
// hash cannot be computed. That must be a normal invalid report — never a
// throw, and never `ok: true` alongside the sentinel hash.
// ---------------------------------------------------------------------------

test('validation: definitions canonicalJson refuses are reported, not thrown', () => {
  const okTri = [
    { r: 0, j: 0, o: 'up', type: 'hammer' },
    { r: 1, j: 0, o: 'down', type: 'motor' },
  ];
  const cases: Array<{ label: string; input: unknown; codes: string[] }> = [
    {
      label: 'float coord r=0.5',
      input: {
        schemaVersion: 1,
        name: 'a',
        triangles: [{ r: 0.5, j: 0, o: 'up', type: 'hammer' }],
        coreIndex: 0,
        brain: { version: 1, rules: [{ move: 'forward' }] },
      },
      codes: ['BOT_UNHASHABLE', 'TRI_BAD_COORDS'],
    },
    {
      label: 'NaN coord',
      input: {
        schemaVersion: 1,
        name: 'a',
        triangles: [{ r: NaN, j: 0, o: 'up', type: 'hammer' }],
        coreIndex: 0,
        brain: { version: 1, rules: [{ move: 'forward' }] },
      },
      codes: ['BOT_UNHASHABLE', 'TRI_BAD_COORDS'],
    },
    {
      label: 'float brain literal',
      input: {
        schemaVersion: 1,
        name: 'a',
        triangles: okTri,
        coreIndex: 0,
        brain: { version: 1, rules: [{ when: { cmp: ['>', 'self.x', 1.5] }, move: 'forward' }] },
      },
      codes: ['BOT_UNHASHABLE'],
    },
    {
      label: 'Infinity in brain',
      input: {
        schemaVersion: 1,
        name: 'a',
        triangles: okTri,
        coreIndex: 0,
        brain: {
          version: 1,
          rules: [{ when: { cmp: ['>', 'self.x', Infinity] }, move: 'forward' }],
        },
      },
      codes: ['BOT_UNHASHABLE'],
    },
    {
      label: 'brain.rules has undefined',
      input: {
        schemaVersion: 1,
        name: 'a',
        triangles: okTri,
        coreIndex: 0,
        brain: { version: 1, rules: [undefined] },
      },
      codes: ['BOT_UNHASHABLE', 'BRAIN_BAD_RULE'],
    },
  ];

  for (const { label, input, codes } of cases) {
    let report: ValidationReport | undefined;
    assert.doesNotThrow(() => {
      report = validateBot(input as never, RS, { skipSandbox: true });
    }, `validateBot threw on ${label}`);
    assert.ok(report, label);
    assert.equal(report.ok, false, `${label} must not be VALID`);
    assert.equal(report.botHash, UNHASHABLE_BOT_HASH, `${label} must use the sentinel hash`);
    const seen = report.issues.map((i) => i.code);
    for (const code of codes) {
      assert.ok(seen.includes(code), `${label}: expected ${code}, got ${seen.join(',')}`);
    }
  }
});

// ---------------------------------------------------------------------------
// a valid bot is untouched: same hash, still valid
// ---------------------------------------------------------------------------

test('validation: a valid sample bot still hashes exactly as before', () => {
  assert.equal(hashDefinition(SAMPLE_BOTS[0]!), SPEAR_HASH);
  assert.match(SPEAR_HASH, HEX64);
});

test('validation: a valid sample bot still validates end to end', () => {
  const report = validateBot(SAMPLE_BOTS[0]!, RS);
  assert.equal(report.ok, true, JSON.stringify(report.issues));
  assert.equal(report.botHash, SPEAR_HASH);
  assert.ok(report.sandbox);
  assert.equal(report.sandbox.passed, true);
});

// ---------------------------------------------------------------------------
// fuzz: no malformed value may ever make validateBot throw
// ---------------------------------------------------------------------------

test('validation: validateBot never throws on a fuzz set of malformed values', () => {
  const malformed: unknown[] = [
    null,
    undefined,
    42,
    true,
    'nope',
    [],
    { triangles: [] },
    { triangles: [null] },
    { triangles: [{}] },
    { triangles: 'x' },
    { brain: {} },
    { brain: { rules: 'x' } },
  ];
  for (const value of malformed) {
    let report: ValidationReport | undefined;
    assert.doesNotThrow(() => {
      report = validateBot(value as never, RS);
    }, `validateBot threw on ${String(value)}`);
    assert.ok(report, String(value));
    // invariant: the sentinel hash must never accompany a passing report
    if (report.botHash === UNHASHABLE_BOT_HASH) {
      assert.equal(report.ok, false, `sentinel hash with ok:true on ${String(value)}`);
    }
  }
});
