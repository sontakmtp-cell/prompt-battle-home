/**
 * Proves the browser SHA-256 shim is byte-for-byte identical to `node:crypto`.
 *
 * This is the load-bearing check behind the whole "engine in the browser" idea.
 * If these two ever disagree, a bot hashed in the web lab gets a different
 * `definitionHash` than the same bot hashed by the CLI — meaning a replay made
 * on the web could not be verified on the command line, and the determinism
 * promise in gameplay.md 6.1 quietly breaks.
 *
 * Run: npx tsx frontend/test/sha256.test.ts
 */
import { createHash as nodeCreateHash } from 'node:crypto';
import { createHash as shimCreateHash, sha256Hex } from '../src/lab/sha256.js';

let failures = 0;

function check(label: string, actual: string, expected: string): void {
  if (actual === expected) {
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}\n       expected ${expected}\n       actual   ${actual}`);
  }
}

/** Compare the shim against node:crypto for one input. */
function compare(label: string, input: string): void {
  const expected = nodeCreateHash('sha256').update(input, 'utf8').digest('hex');
  check(`${label} (streaming)`, shimCreateHash('sha256').update(input, 'utf8').digest('hex') as string, expected);
  check(`${label} (one-shot) `, sha256Hex(input), expected);
}

console.log('sha256 shim vs node:crypto');

// ---- published NIST vectors ------------------------------------------------
check('empty string', sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
check('"abc"', sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
check(
  '"abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"',
  sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'),
  '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
);

// ---- block-boundary lengths ------------------------------------------------
// 55 / 56 / 64 / 65 are the interesting edges: the length field is appended
// after a 0x80 byte, so a message that is exactly 55 or 56 bytes long needs an
// extra block. Getting this wrong is the classic SHA-256 bug.
for (const n of [0, 1, 54, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 129, 255, 256, 1000]) {
  compare(`ascii length ${n}`, 'a'.repeat(n));
}

// ---- multi-byte UTF-8 ------------------------------------------------------
compare('Vietnamese', 'PROMPT CHIẾN — hai bot tự đánh nhau, không ai điều khiển');
compare('emoji + CJK', '🔨✂️📄⚙️ 石头剪刀布');
compare('mixed length utf8', 'â'.repeat(100) + 'ế'.repeat(63));

// ---- chunked updates must equal one-shot -----------------------------------
{
  const whole = nodeCreateHash('sha256').update('x'.repeat(500), 'utf8').digest('hex');
  const streamed = shimCreateHash('sha256');
  let fed = 0;
  while (fed + 7 <= 500) {
    streamed.update('x'.repeat(7), 'utf8');
    fed += 7;
  }
  if (fed < 500) streamed.update('x'.repeat(500 - fed), 'utf8');
  check('chunked update matches one-shot', streamed.digest('hex') as string, whole);
}

// ---- the payload shape the engine actually hashes --------------------------
// A canonical JSON projection of a bot definition: nested objects, arrays of
// numbers, strings. This is what `hashDefinition` feeds in.
{
  const payload = JSON.stringify({
    schemaVersion: 1,
    name: 'Spear',
    triangles: Array.from({ length: 60 }, (_, i) => ({ r: i % 10, j: i % 3, o: i % 2 ? 'up' : 'down', type: 'hammer' })),
    coreIndex: 4,
    brain: { version: 1, rules: [{ when: { cmp: ['>', { field: 'self.stuckTicks' }, 12] }, move: 'backward', rotate: 'toEnemy' }] },
  });
  compare('bot-definition-shaped payload', payload);
}

// ---- raw bytes, not just strings -------------------------------------------
{
  const bytes = new Uint8Array(300);
  for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 37 + 11) & 0xff;
  const expected = nodeCreateHash('sha256').update(bytes).digest('hex');
  check('raw Uint8Array input', shimCreateHash('sha256').update(bytes).digest('hex') as string, expected);
}

console.log(failures === 0 ? '\nall sha256 checks passed' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
