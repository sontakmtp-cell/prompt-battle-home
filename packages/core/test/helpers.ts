import type {
  BotDefinition,
  BotPackage,
  BrainDefinition,
  BrainRule,
  Ruleset,
  TriCell,
  TriOrientation,
  TriType,
} from '@promptchien/contracts';
import { BOT_SCHEMA_VERSION, BRAIN_API_VERSION, DEFAULT_RULESET } from '@promptchien/contracts';
import { lockBot } from '../src/bot/package.js';
import { buildGeometry } from '../src/geometry/build.js';
import { rotateOffset } from '../src/math/fixed.js';

export const RS: Ruleset = DEFAULT_RULESET;

/**
 * A brain that does nothing at all: the bot stands perfectly still.
 * It still needs one rule, because `validateBrain` rejects an empty rule list
 * (a brain with no rules is almost always an authoring mistake, not intent).
 */
export const HOLD_BRAIN: BrainDefinition = {
  version: BRAIN_API_VERSION,
  rules: [{ move: 'hold', rotate: 'hold' }],
};

/** A brain that always charges, used as the "does something" baseline. */
export const CHASE_BRAIN: BrainDefinition = {
  version: BRAIN_API_VERSION,
  rules: [{ move: 'forward', rotate: 'toEnemy' }],
};

export function brainOf(rules: BrainRule[]): BrainDefinition {
  return { version: BRAIN_API_VERSION, rules };
}

export function tile(r: number, j: number, o: TriOrientation, type: TriType): TriCell {
  return { r, j, o, type };
}

export function defOf(
  name: string,
  triangles: TriCell[],
  coreIndex: number,
  brain: BrainDefinition = HOLD_BRAIN,
): BotDefinition {
  return { schemaVersion: BOT_SCHEMA_VERSION, name, triangles, coreIndex, brain };
}

export function pkgOf(def: BotDefinition, rs: Ruleset = RS): BotPackage {
  return lockBot(def, rs);
}

/**
 * The rhombus pair (down, up) at (r, j). Two tiles that tile together perfectly
 * and are always edge-connected, so a body built from rhombi is connected by
 * construction. This is the same primitive `gridToTriangles` uses.
 */
export function rhombus(r: number, j: number, type: TriType): TriCell[] {
  return [tile(r, j, 'down', type), tile(r, j, 'up', type)];
}

export function rhombi(rows: readonly string[], map: Record<string, TriType>): TriCell[] {
  const out: TriCell[] = [];
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]!;
    for (let j = 0; j < row.length; j++) {
      const ch = row[j]!;
      if (ch === '.' || ch === ' ') continue;
      const type = map[ch];
      if (!type) throw new Error(`unknown tile character "${ch}"`);
      out.push(...rhombus(r, j, type));
    }
  }
  return out;
}

/** Index of the down-triangle of rhombus (r, j) inside a `rhombi` ordering. */
export function rhombusCoreIndex(rows: readonly string[], r: number, j: number): number {
  let idx = 0;
  for (let rr = 0; rr < rows.length; rr++) {
    const row = rows[rr]!;
    for (let jj = 0; jj < row.length; jj++) {
      if (row[jj] === '.' || row[jj] === ' ') continue;
      if (rr === r && jj === j) return idx;
      idx += 2;
    }
  }
  throw new Error(`core cell (${r},${j}) is not part of the body`);
}

export const TYPES: Record<string, TriType> = {
  H: 'hammer',
  S: 'scissor',
  P: 'paper',
  M: 'motor',
};

export function hasError(
  issues: readonly { code: string; severity: string }[],
  code: string,
): boolean {
  return issues.some((i) => i.code === code && i.severity === 'error');
}

export function hasWarning(
  issues: readonly { code: string; severity: string }[],
  code: string,
): boolean {
  return issues.some((i) => i.code === code && i.severity === 'warning');
}

/**
 * Place two bodies so their lattice frames coincide exactly.
 *
 * `simulate` positions a bot by its origin, and the origin is the mean of the
 * tile centroids, so two differently shaped bodies at the same (x, y) do NOT
 * line up. To build focused contact scenarios we need bot B's lattice cell
 * (r, j) to land exactly where bot A's does, so we shift B by the rotated
 * origin difference. At heading 0 the rotation is (lx, ly) -> (-ly, lx).
 */
export function alignedStart(
  defA: BotDefinition,
  defB: BotDefinition,
  shiftLattice: { x: number; y: number } = { x: 0, y: 0 },
): { a: { x: number; y: number; heading: number }; b: { x: number; y: number; heading: number } } {
  const gA = buildGeometry(defA);
  const gB = buildGeometry(defB);
  const d = rotateOffset(gB.origin.x - gA.origin.x, gB.origin.y - gA.origin.y, 0);
  const s = rotateOffset(shiftLattice.x, shiftLattice.y, 0);
  return {
    a: { x: s.x, y: s.y, heading: 0 },
    b: { x: d.x, y: d.y, heading: 0 },
  };
}

/** World centroid of one tile of a body placed at (x, y) with heading 0. */
export function worldCentroid(
  def: BotDefinition,
  index: number,
  x: number,
  y: number,
): { x: number; y: number } {
  const g = buildGeometry(def);
  const t = g.tris[index]!;
  const w = rotateOffset(t.localCentroid.x, t.localCentroid.y, 0);
  return { x: w.x + x, y: w.y + y };
}

/**
 * The (x, y) that puts this body's chosen tile centroid exactly on (tx, ty)
 * at heading 0. Used by the ring tests, which care about the Core's distance
 * from the arena centre rather than the body origin's.
 */
export function placeTileAt(
  def: BotDefinition,
  index: number,
  tx: number,
  ty: number,
): { x: number; y: number; heading: number } {
  const g = buildGeometry(def);
  const t = g.tris[index]!;
  const w = rotateOffset(t.localCentroid.x, t.localCentroid.y, 0);
  return { x: tx - w.x, y: ty - w.y, heading: 0 };
}
