import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * These tests drive the REAL built CLI, so they require `npm run build` to have
 * produced `packages/cli/dist/src/index.js` (the whole suite runs against dist).
 * The path is derived from this test file's own location so it does not depend
 * on the runner's working directory.
 */
const CLI = fileURLToPath(new URL('../src/index.js', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

function runCli(args: string[], cwd: string) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
}

test('cli: a rejected path fails with one clean line, no stack trace, exit 1', () => {
  const res = runCli(['validate', '../x.json'], REPO_ROOT);
  assert.equal(res.status, 1, `expected exit 1, got ${res.status}; stderr=${res.stderr}`);
  assert.match(res.stderr, /^error: /m, `stderr was: ${res.stderr}`);
  assert.ok(!res.stderr.includes('at '), `stack trace leaked:\n${res.stderr}`);
  assert.equal(
    res.stderr.trimEnd().split('\n').length,
    1,
    `expected a single clean line, got:\n${res.stderr}`,
  );
});

test('cli: a non-hashable bot on `simulate` fails cleanly instead of crashing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'promptchien-cli-'));
  try {
    writeFileSync(
      join(dir, 'float.json'),
      JSON.stringify({
        schemaVersion: 1,
        name: 'Float',
        triangles: [{ r: 0.5, j: 0, o: 'up', type: 'hammer' }],
        coreIndex: 0,
        brain: { version: 1, rules: [{ move: 'forward' }] },
      }),
    );
    // The second bot only needs to be readable JSON: the crash happens while
    // hashing the FIRST bot, before the second one is locked.
    writeFileSync(join(dir, 'other.json'), '{}');

    const res = runCli(['simulate', 'float.json', 'other.json'], dir);
    assert.equal(res.status, 1, `expected exit 1, got ${res.status}; stderr=${res.stderr}`);
    assert.match(res.stderr, /^error: /m, `stderr was: ${res.stderr}`);
    assert.ok(!res.stderr.includes('at '), `stack trace leaked:\n${res.stderr}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
