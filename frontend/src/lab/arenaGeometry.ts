import type { Team, TriType } from '@promptchien/contracts';
import { heatColor, lighten, tileSkin } from './palette.js';

/**
 * Pure geometry and batching for the arena.
 *
 * Kept free of React so it can be tested directly, and kept free of the replay
 * so it only has to know "here are some projected triangles, group them".
 *
 * WHY BATCHING (ky_thuat_my_thuat.md 5.2, rule 1)
 * -----------------------------------------------
 * The naive renderer emits one SVG element per tile: 60 tiles x 2 bots x 2 passes
 * (silhouette + fill) = 240 elements rebuilt every frame. The doc calls merging
 * draw calls "the biggest and easiest win", and the M2 acceptance list makes it
 * explicit: "the number of fill calls per frame must not depend on the triangle
 * count".
 *
 * Merging by (team, type) alone is not enough, because the fill varies per tile -
 * tiles pale as they lose HP, and the damage map paints them by heat. So the fill
 * is QUANTISED into a small number of bands first and the batch key includes the
 * band. That is not a compromise: section 4.5 already defines HP as four bands
 * and section 4.6 already defines heat as five stops, so the banded picture is
 * the picture the doc asks for.
 *
 * Result: at most 2 teams x 4 types x 5 bands = 40 fill paths, plus 2 silhouette
 * paths and 2 Core markers. A 6-tile bot and a 60-tile bot cost the same.
 */

export type Pt = readonly [number, number];

export interface ProjectedTile {
  index: number;
  type: TriType;
  /** SVG-space vertices of the tile, already wobbled and squashed */
  verts: Pt[];
  /** SVG-space vertices grown outward from the centroid, for the outline pass */
  silhouette: Pt[];
  cx: number;
  cy: number;
  alive: boolean;
  isCore: boolean;
  /** 0..1000 */
  hpRatioMilli: number;
  damageReceived: number;
}

export interface BatchedShape {
  key: string;
  team: Team;
  type: TriType;
  /** SVG path data covering every tile of this (team, type, band) */
  d: string;
  fill: string;
}

export function toPath(verts: readonly Pt[]): string {
  let d = '';
  for (let i = 0; i < verts.length; i++) {
    const v = verts[i]!;
    d += `${i === 0 ? 'M' : 'L'}${v[0].toFixed(1)} ${v[1].toFixed(1)}`;
  }
  return `${d}Z`;
}

export function toPoints(verts: readonly Pt[]): string {
  return verts.map((v) => `${v[0].toFixed(1)},${v[1].toFixed(1)}`).join(' ');
}

/** How many HP bands section 4.5 defines (100-60, 60-40, 40-15, below 15). */
export const HP_BANDS = 4;
/** How many heat stops section 4.6 defines. */
export const HEAT_BANDS = 4;

/** HP band index, 0 = healthy. Matches the four rows of the 4.5 table. */
export function hpBand(hpRatioMilli: number): number {
  if (hpRatioMilli >= 600) return 0;
  if (hpRatioMilli >= 400) return 1;
  if (hpRatioMilli >= 150) return 2;
  return 3;
}

/**
 * Fill band for a tile: HP bands normally, heat bands when the damage map is on.
 * `heatT` is the tile's damage normalised against the hottest tile on the field.
 */
export function fillBand(tile: { hpRatioMilli: number }, damageMapActive: boolean, heatT: number): number {
  if (damageMapActive && heatT > 0) return heatBandIndex(heatT);
  return hpBand(tile.hpRatioMilli);
}

function heatBandIndex(t: number): number {
  if (t >= 1) return 3;
  if (t >= 0.75) return 2;
  if (t >= 0.5) return 1;
  if (t >= 0.25) return 0;
  return 0;
}

/** The single fill colour for a (team, type, band). */
export function fillFor(
  team: Team,
  type: TriType,
  band: number,
  damageMapActive: boolean,
): string {
  const skin = tileSkin(team, type);
  if (damageMapActive) {
    const stops = [0.3, 0.55, 0.8, 1];
    return heatColor(stops[Math.max(0, Math.min(stops.length - 1, band))]!);
  }
  if (skin.dotted) return `url(#paper-dots-${team === 'A' ? 'a' : 'b'})`;
  const paleness = [0, 0.15, 0.3, 0.45][Math.max(0, Math.min(3, band))]!;
  return lighten(skin.fill, paleness);
}

/**
 * Group tiles into one path per (team, type, band).
 * The output length is bounded by 2 x 4 x 5 and does not grow with the body.
 */
export function batchTiles(tiles: readonly ProjectedTile[], team: Team, damageMapActive: boolean, heat: readonly number[], peak: number): BatchedShape[] {
  const buckets = new Map<string, { type: TriType; band: number; parts: string[] }>();
  for (const t of tiles) {
    const heatT = peak > 0 ? (heat[t.index] ?? 0) / peak : 0;
    const band = fillBand(t, damageMapActive, heatT);
    const key = `${t.type}:${band}`;
    let b = buckets.get(key);
    if (!b) {
      b = { type: t.type, band, parts: [] };
      buckets.set(key, b);
    }
    b.parts.push(toPath(t.verts));
  }
  const out: BatchedShape[] = [];
  for (const b of buckets.values()) {
    out.push({
      key: `${team}:${b.type}:${b.band}`,
      team,
      type: b.type,
      d: b.parts.join(''),
      fill: fillFor(team, b.type, b.band, damageMapActive),
    });
  }
  return out;
}

/** One path covering every silhouette of a bot. */
export function batchSilhouette(tiles: readonly ProjectedTile[]): string {
  return tiles.map((t) => toPath(t.silhouette)).join('');
}

// ---------------------------------------------------------------------------
// Hit testing
// ---------------------------------------------------------------------------

function side(px: number, py: number, a: Pt, b: Pt): number {
  return (b[0] - a[0]) * (py - a[1]) - (b[1] - a[1]) * (px - a[0]);
}

export function pointInTriangle(px: number, py: number, v: readonly Pt[]): boolean {
  const a = v[0]!;
  const b = v[1]!;
  const c = v[2]!;
  const d1 = side(px, py, a, b);
  const d2 = side(px, py, b, c);
  const d3 = side(px, py, c, a);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

/**
 * Which tile is under a point, if any.
 *
 * This replaces per-tile pointer handlers, which is what allows the draw calls to
 * be batched at all: a batched path has no per-tile identity to attach an event
 * to. Ties are broken toward the smaller index so the answer is stable.
 */
export function hitTest(
  tiles: readonly ProjectedTile[],
  px: number,
  py: number,
): number | null {
  let best: number | null = null;
  for (const t of tiles) {
    if (!t.alive) continue;
    if (!pointInTriangle(px, py, t.verts)) continue;
    if (best === null || t.index < best) best = t.index;
  }
  return best;
}
