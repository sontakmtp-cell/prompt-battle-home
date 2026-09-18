import type { P } from '../math/fixed.js';
import { dirIndex, isqrt } from '../math/fixed.js';

export interface Contact {
  aTri: number;
  bTri: number;
  /** contact point (midpoint between the two centroids), milli-units */
  px: number;
  py: number;
  /** unit normal pointing from A to B, scaled by 1000 */
  nx: number;
  ny: number;
  /** quantised normal direction index (0..63) */
  dirIdx: number;
  /** penetration depth along the normal, milli-units */
  depthMilli: number;
  /** approach speed of the two tiles along the normal, milli-units per tick */
  approachSpeed: number;
  /** each side's own closing speed along the normal, milli-units per tick */
  ownA: number;
  ownB: number;
}

function project(poly: readonly P[], ax: number, ay: number): [number, number] {
  let min = poly[0]!.x * ax + poly[0]!.y * ay;
  let max = min;
  for (let i = 1; i < poly.length; i++) {
    const p = poly[i]!.x * ax + poly[i]!.y * ay;
    if (p < min) min = p;
    if (p > max) max = p;
  }
  return [min, max];
}

interface SatResult {
  hit: boolean;
  depth: number;
  ax: number;
  ay: number;
}

/** Separating Axis Theorem for two convex triangles. */
function satTriTri(a: readonly P[], b: readonly P[]): SatResult {
  let bestDepth = Number.MAX_SAFE_INTEGER;
  let bestAx = 0;
  let bestAy = 0;
  for (const poly of [a, b]) {
    for (let i = 0; i < 3; i++) {
      const p = poly[i]!;
      const q = poly[(i + 1) % 3]!;
      const ax = q.y - p.y;
      const ay = -(q.x - p.x);
      if (ax === 0 && ay === 0) continue;
      const [amin, amax] = project(a, ax, ay);
      const [bmin, bmax] = project(b, ax, ay);
      const overlap = Math.min(amax, bmax) - Math.max(amin, bmin);
      if (overlap <= 0) return { hit: false, depth: 0, ax: 0, ay: 0 };
      if (overlap < bestDepth) {
        bestDepth = overlap;
        bestAx = ax;
        bestAy = ay;
      }
    }
  }
  return { hit: true, depth: bestDepth, ax: bestAx, ay: bestAy };
}

export interface ContactInput {
  /** world vertices of a tile */
  verts: [P, P, P];
  /** world centroid */
  cx: number;
  cy: number;
  /** broad-phase radius */
  radius: number;
  /** velocity of the owning bot, milli-units per tick */
  vx: number;
  vy: number;
}

/**
 * Broad phase by AABB, narrow phase by SAT (gameplay.md 5.2 step 5).
 * Deterministic: no epsilon floats, integer projections only.
 */
export function collectContacts(
  aTris: ContactInput[],
  bTris: ContactInput[],
): Contact[] {
  const out: Contact[] = [];
  // AABB broad phase per tile
  const aBoxes = aTris.map((t) => {
    let minX = t.verts[0].x;
    let maxX = t.verts[0].x;
    let minY = t.verts[0].y;
    let maxY = t.verts[0].y;
    for (const v of t.verts) {
      if (v.x < minX) minX = v.x;
      if (v.x > maxX) maxX = v.x;
      if (v.y < minY) minY = v.y;
      if (v.y > maxY) maxY = v.y;
    }
    return { minX, maxX, minY, maxY };
  });
  const bBoxes = bTris.map((t) => {
    let minX = t.verts[0].x;
    let maxX = t.verts[0].x;
    let minY = t.verts[0].y;
    let maxY = t.verts[0].y;
    for (const v of t.verts) {
      if (v.x < minX) minX = v.x;
      if (v.x > maxX) maxX = v.x;
      if (v.y < minY) minY = v.y;
      if (v.y > maxY) maxY = v.y;
    }
    return { minX, maxX, minY, maxY };
  });

  for (let i = 0; i < aTris.length; i++) {
    const ta = aTris[i]!;
    const ba = aBoxes[i]!;
    for (let k = 0; k < bTris.length; k++) {
      const tb = bTris[k]!;
      const bb = bBoxes[k]!;
      if (ba.maxX < bb.minX || bb.maxX < ba.minX) continue;
      if (ba.maxY < bb.minY || bb.maxY < ba.minY) continue;
      const dx = tb.cx - ta.cx;
      const dy = tb.cy - ta.cy;
      const rr = ta.radius + tb.radius;
      if (dx * dx + dy * dy > rr * rr) continue;
      const sat = satTriTri(ta.verts, tb.verts);
      if (!sat.hit) continue;

      let ax = sat.ax;
      let ay = sat.ay;
      // orient the axis from A to B
      const toward = ax * dx + ay * dy;
      if (toward < 0) {
        ax = -ax;
        ay = -ay;
      }
      const len = isqrt(ax * ax + ay * ay);
      if (len === 0) continue;
      const nx = Math.trunc((ax * 1000) / len);
      const ny = Math.trunc((ay * 1000) / len);
      const depthMilli = Math.trunc((sat.depth * 1000) / len);

      const relVx = ta.vx - tb.vx;
      const relVy = ta.vy - tb.vy;
      const approachSpeed = Math.abs(Math.trunc((relVx * nx + relVy * ny) / 1000));
      const ownA = Math.trunc((ta.vx * nx + ta.vy * ny) / 1000);
      const ownB = Math.trunc((tb.vx * -nx + tb.vy * -ny) / 1000);

      out.push({
        aTri: i,
        bTri: k,
        px: Math.trunc((ta.cx + tb.cx) / 2),
        py: Math.trunc((ta.cy + tb.cy) / 2),
        nx,
        ny,
        dirIdx: dirIndex(nx, ny),
        depthMilli,
        approachSpeed,
        ownA: ownA <= 0 ? 0 : ownA,
        ownB: ownB <= 0 ? 0 : ownB,
      });
    }
  }
  return out;
}
