import type { BotDefinition, TriType, TriOrientation } from '@promptchien/contracts';
import type { P } from '../math/fixed.js';
import { isqrt } from '../math/fixed.js';
import { cellKey, triCentroid, triNeighbors, triVerts } from './lattice.js';

export interface TriGeometry {
  index: number;
  r: number;
  j: number;
  o: TriOrientation;
  type: TriType;
  /** vertices relative to the bot origin, local frame (milli-units) */
  localVerts: [P, P, P];
  /** centroid relative to the bot origin, local frame (milli-units) */
  localCentroid: P;
  /** indices (inside this bot) of the three edge neighbours, -1 when absent */
  neighbors: number[];
  /** distance from the local centroid to the furthest vertex */
  radiusMilli: number;
  /** distance from the bot origin to the local centroid, used for torque */
  offsetMilli: number;
}

export interface BotGeometry {
  tris: TriGeometry[];
  coreIndex: number;
  /** bot origin in lattice coordinates */
  origin: P;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  spanX: number;
  spanY: number;
  /** max distance from the origin to any vertex, used for arena clamping */
  radiusMilli: number;
  /** 3 edge neighbours per tile, as indices into `tris`; -1 when absent */
  neighbourIdx: Int32Array;
  /** one-ring per tile: itself followed by its three neighbours; -1 when absent */
  ringIdx: Int32Array;
}

/**
 * Build the immutable local geometry of a bot. Pure function of the definition:
 * the same definition always yields the same offsets, so this is safe to cache
 * and safe to hash.
 */
export function buildGeometry(def: BotDefinition): BotGeometry {
  const n = def.triangles.length;
  const centroids: P[] = new Array(n);
  const verts: Array<[P, P, P]> = new Array(n);
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    const t = def.triangles[i]!;
    verts[i] = triVerts(t.r, t.j, t.o);
    const c = triCentroid(t.r, t.j, t.o);
    centroids[i] = c;
    sumX += c.x;
    sumY += c.y;
  }
  const origin: P = { x: Math.round(sumX / n), y: Math.round(sumY / n) };

  const byKey = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const t = def.triangles[i]!;
    byKey.set(cellKey(t.r, t.j, t.o), i);
  }

  const tris: TriGeometry[] = new Array(n);
  const neighbourIdx = new Int32Array(n * 3).fill(-1);
  const ringIdx = new Int32Array(n * 4).fill(-1);
  let minX = Number.MAX_SAFE_INTEGER;
  let minY = Number.MAX_SAFE_INTEGER;
  let maxX = -Number.MAX_SAFE_INTEGER;
  let maxY = -Number.MAX_SAFE_INTEGER;
  let radiusMilli = 0;

  for (let i = 0; i < n; i++) {
    const t = def.triangles[i]!;
    const lv = verts[i]!.map((v) => ({ x: v.x - origin.x, y: v.y - origin.y })) as [P, P, P];
    const lc = { x: centroids[i]!.x - origin.x, y: centroids[i]!.y - origin.y };
    let rMax = 0;
    for (const v of lv) {
      if (v.x < minX) minX = v.x;
      if (v.y < minY) minY = v.y;
      if (v.x > maxX) maxX = v.x;
      if (v.y > maxY) maxY = v.y;
      const d = isqrt((v.x - lc.x) * (v.x - lc.x) + (v.y - lc.y) * (v.y - lc.y));
      if (d > rMax) rMax = d;
      const dr = isqrt(v.x * v.x + v.y * v.y);
      if (dr > radiusMilli) radiusMilli = dr;
    }
    const nb = triNeighbors(t.r, t.j, t.o).map((k) => byKey.get(cellKey(k.r, k.j, k.o)) ?? -1);
    ringIdx[i * 4] = i;
    for (let k = 0; k < 3; k++) {
      neighbourIdx[i * 3 + k] = nb[k]!;
      ringIdx[i * 4 + 1 + k] = nb[k]!;
    }
    const neighbors = nb;
    tris[i] = {
      index: i,
      r: t.r,
      j: t.j,
      o: t.o,
      type: t.type,
      localVerts: lv,
      localCentroid: lc,
      neighbors,
      radiusMilli: rMax,
      offsetMilli: isqrt(lc.x * lc.x + lc.y * lc.y),
    };
  }

  return {
    tris,
    coreIndex: def.coreIndex,
    origin,
    minX,
    minY,
    maxX,
    maxY,
    spanX: maxX - minX,
    spanY: maxY - minY,
    radiusMilli,
    neighbourIdx,
    ringIdx,
  };
}

/** World vertices of one tile for a given bot pose. */
export function worldVerts(
  geom: TriGeometry,
  x: number,
  y: number,
  heading: number,
  rotate: (lx: number, ly: number, hd: number) => P,
): [P, P, P] {
  const out: P[] = [];
  for (const v of geom.localVerts) {
    const w = rotate(v.x, v.y, heading);
    out.push({ x: x + w.x, y: y + w.y });
  }
  return out as [P, P, P];
}
