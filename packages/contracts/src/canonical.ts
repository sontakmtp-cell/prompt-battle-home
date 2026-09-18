/**
 * Canonical JSON: keys sorted, no whitespace, integers only.
 * Hashing a bot definition or a replay always goes through this so the same
 * logical value always produces the same byte string on every platform.
 */
export function canonicalJson(value: unknown): string {
  return write(value);
}

function write(value: unknown): string {
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
    return `[${value.map(write).join(',')}]`;
  }
  if (t === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
    const parts: string[] = [];
    for (const k of keys) {
      parts.push(`${JSON.stringify(k)}:${write(obj[k])}`);
    }
    return `{${parts.join(',')}}`;
  }
  throw new Error(`canonicalJson: unsupported type ${t}`);
}
