/**
 * Canonical JSON: keys sorted, no whitespace, integers only.
 * Hashing a bot definition or a replay always goes through this so the same
 * logical value always produces the same byte string on every platform.
 */

/**
 * Hard recursion cap for `write`.
 *
 * `canonicalJson` is reached by hashing paths that may receive attacker-supplied
 * input (a submitted bot definition, a saved replay). Unbounded recursion over a
 * pathologically nested value would blow the JavaScript stack and raise a
 * `RangeError` that no ordinary guard can catch cleanly, so instead we refuse the
 * value with an explicit, ordinary `Error`.
 *
 * 1024 is far above any legitimate value: the deepest real input is a bot
 * definition, whose raw nesting is ~40 levels even for a maximum-depth (16)
 * brain condition tree, and a replay payload nests only a handful of levels.
 */
const MAX_CANONICAL_DEPTH = 1024;

export function canonicalJson(value: unknown): string {
  return write(value, 1);
}

function write(value: unknown, depth: number): string {
  if (depth > MAX_CANONICAL_DEPTH) {
    throw new Error(
      `canonicalJson: value nests deeper than ${MAX_CANONICAL_DEPTH} levels; refusing to recurse further`,
    );
  }
  if (value === null) return 'null';
  const t = typeof value;
  if (t === 'number') {
    if (!Number.isFinite(value as number)) {
      throw new Error('canonicalJson: non-finite number is not allowed');
    }
    const n = value as number;
    if (!Number.isInteger(n)) {
      throw new Error(`canonicalJson: non-integer number ${n} is not allowed`);
    }
    return String(n);
  }
  if (t === 'boolean') return value ? 'true' : 'false';
  if (t === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((v) => write(v, depth + 1)).join(',')}]`;
  }
  if (t === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
    const parts: string[] = [];
    for (const k of keys) {
      parts.push(`${JSON.stringify(k)}:${write(obj[k], depth + 1)}`);
    }
    return `{${parts.join(',')}}`;
  }
  throw new Error(`canonicalJson: unsupported type ${t}`);
}
