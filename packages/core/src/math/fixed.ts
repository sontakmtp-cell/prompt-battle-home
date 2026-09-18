import { ROT64, ROT_SCALE } from '@promptchien/contracts';

/**
 * Integer-only fixed point helpers.
 *
 * DETERMINISM CONTRACT (PLAN.md M1 gate, can_bang.md 3.6):
 * the simulation may not use Math.sin, Math.cos, Math.sqrt, Math.random, Date,
 * or any other implementation-defined / wall-clock API. Everything below is built
 * from +,-,*, integer division and bit operations, so Windows and Linux produce
 * bit-identical results.
 */

/** Truncating integer division (toward zero), matching C semantics. */
export function idiv(a: number, b: number): number {
  return Math.trunc(a / b);
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Exact integer square root (floor). Bit-by-bit, no floating point involved,
 * so it cannot drift between platforms the way Math.sqrt could.
 */
export function isqrt(n: number): number {
  if (n < 0) throw new Error('isqrt: negative input');
  if (n < 2) return n;
  let x = n;
  let res = 0;
  let bit = 1 << 30;
  while (bit > x) bit >>= 2;
  while (bit !== 0) {
    if (x >= res + bit) {
      x -= res + bit;
      res = (res >> 1) + bit;
    } else {
      res >>= 1;
    }
    bit >>= 2;
  }
  return res;
}

/** Integer distance between two points, milli-units. */
export function idist(dx: number, dy: number): number {
  return isqrt(dx * dx + dy * dy);
}

export interface P {
  x: number;
  y: number;
}

/** Rotate a local-frame offset by a heading index (0..63) into world offsets. */
export function rotateOffset(lx: number, ly: number, hd: number): P {
  const f = ROT64[hd & 63]!;
  const fx = f[0];
  const fy = f[1];
  return {
    x: Math.trunc((lx * -fy - ly * fx) / ROT_SCALE),
    y: Math.trunc((lx * fx - ly * fy) / ROT_SCALE),
  };
}

/** Unit vector (scaled by ROT_SCALE) for a direction index. */
export function dirUnit(k: number): readonly [number, number] {
  return ROT64[k & 63]!;
}

/** Quantise an integer vector onto the 64-direction wheel. Ties pick the lowest index. */
export function dirIndex(dx: number, dy: number): number {
  if (dx === 0 && dy === 0) return 0;
  let best = 0;
  let bestDot = -Number.MAX_SAFE_INTEGER;
  for (let k = 0; k < 64; k++) {
    const v = ROT64[k]!;
    const d = dx * v[0] + dy * v[1];
    if (d > bestDot) {
      bestDot = d;
      best = k;
    }
  }
  return best;
}

/** Signed shortest angular difference in direction steps, range -32..31. */
export function dirDelta(target: number, current: number): number {
  const d = (target - current) & 63;
  return d > 32 ? d - 64 : d;
}

/** Folded angular difference in steps, range 0..32. */
export function dirAbsDelta(a: number, b: number): number {
  const d = (a - b) & 63;
  return d > 32 ? 64 - d : d;
}

/** Deterministic 32-bit PRNG (mulberry32). Integer ops only. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic integer in [lo, hi] from a PRNG step. */
export function nextInt(rng: () => number, lo: number, hi: number): number {
  const span = hi - lo + 1;
  return lo + Math.floor(rng() * span);
}
