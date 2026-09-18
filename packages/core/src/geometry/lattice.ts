import type { TriOrientation } from '@promptchien/contracts';
import type { P } from '../math/fixed.js';

/**
 * The triangular lattice.
 *
 * A triangular lattice, not a square one: every tile is an equilateral triangle
 * with side TRI_SIDE_MILLI, rows alternate by half a side, and every interior tile
 * has exactly three edge neighbours. Tiles point either "up" (along the bot's
 * forward axis) or "down" (backwards) -- those are the only two base face
 * directions, which is exactly what can_bang.md 3.4 assumes.
 *
 * Coordinates are integers in milli-units (1 unit = 1000). The height of a row is
 * ROW_HEIGHT_MILLI = 866, which is round(1000 * sqrt(3) / 2) -- the exact
 * equilateral height to the nearest milli-unit. Using a single constant row height
 * keeps every vertex on an integer grid, so the whole geometry is integer-exact.
 */
export const TRI_SIDE_MILLI = 1000;
export const ROW_HEIGHT_MILLI = 866;

export interface TriKey {
  r: number;
  j: number;
  o: TriOrientation;
}

/** Row offset: odd rows are shifted by half a tile. */
export function rowOffset(r: number): number {
  return r & 1;
}

export function cellKey(r: number, j: number, o: TriOrientation): string {
  return `${r}:${j}:${o}`;
}

/** Apex direction index in the bot's local frame: up = 48 (-y), down = 16 (+y). */
export function apexIndexLocal(o: TriOrientation): number {
  return o === 'up' ? 48 : 16;
}

/** The three vertices of a tile in lattice coordinates (milli-units). */
export function triVerts(r: number, j: number, o: TriOrientation): [P, P, P] {
  const off = rowOffset(r) * 500;
  const xL = j * TRI_SIDE_MILLI + off;
  const xR = (j + 1) * TRI_SIDE_MILLI + off;
  const yT = r * ROW_HEIGHT_MILLI;
  const yB = (r + 1) * ROW_HEIGHT_MILLI;
  if (o === 'down') {
    // base on the top edge, apex pointing down
    return [
      { x: xL, y: yT },
      { x: xR, y: yT },
      { x: xL + 500, y: yB },
    ];
  }
  // apex pointing up
  return [
    { x: xL + 500, y: yB },
    { x: xR + 500, y: yB },
    { x: xR, y: yT },
  ];
}

/** Centroid of a tile in lattice coordinates (milli-units). */
export function triCentroid(r: number, j: number, o: TriOrientation): P {
  const v = triVerts(r, j, o);
  return {
    x: Math.round((v[0].x + v[1].x + v[2].x) / 3),
    y: Math.round((v[0].y + v[1].y + v[2].y) / 3),
  };
}

/**
 * The three edge neighbours of a tile, in lattice coordinates.
 * Derived from the shared-edge equations of the lattice; the relations are
 * symmetric (A is a neighbour of B iff B is a neighbour of A) and every tile has
 * exactly three.
 */
export function triNeighbors(r: number, j: number, o: TriOrientation): TriKey[] {
  const off = rowOffset(r);
  if (o === 'down') {
    return [
      { r, j: j - 1, o: 'up' },
      { r, j, o: 'up' },
      { r: r - 1, j: j - 1 + off, o: 'up' },
    ];
  }
  return [
    { r, j, o: 'down' },
    { r, j: j + 1, o: 'down' },
    { r: r + 1, j: j + off, o: 'down' },
  ];
}

/** Apex/face direction index of a tile once the bot is rotated to heading `hd`. */
export function faceIndex(hd: number, o: TriOrientation): number {
  return o === 'up' ? hd & 63 : (hd + 32) & 63;
}
