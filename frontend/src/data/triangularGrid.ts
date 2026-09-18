/**
 * Mathematical Equilateral Triangular Tessellation Engine
 * 
 * In a regular 2D triangular grid, equilateral triangles tile the plane seamlessly.
 * Each triangle shares its 3 edges exactly with adjacent neighbor triangles.
 * 
 * Horizontal Orientation (Natural forward thrust vector along X-axis):
 * - Side length: S
 * - Grid step in X: W = S * sqrt(3) / 2
 * - Grid step in Y: S / 2
 * - A cell is identified by integer discrete coordinates (c, r)
 *   If (c + r) is even: points RIGHT (▷)
 *     Apex:         ((c + 1) * W, r * S / 2)
 *     Top-Left:     (c * W, (r - 1) * S / 2)
 *     Bottom-Left:  (c * W, (r + 1) * S / 2)
 *     Centroid:     (c * W + W / 3, r * S / 2)
 *   If (c + r) is odd: points LEFT (◁)
 *     Apex:         (c * W, r * S / 2)
 *     Top-Right:    ((c + 1) * W, (r - 1) * S / 2)
 *     Bottom-Right: ((c + 1) * W, (r + 1) * S / 2)
 *     Centroid:     (c * W + 2 * W / 3, r * S / 2)
 */

export interface Point2D {
  x: number;
  y: number;
}

export interface TriangleGeometry {
  c: number;
  r: number;
  orientation: 'right' | 'left';
  centroid: Point2D;
  vertices: [Point2D, Point2D, Point2D];
  pointsString: string;
  sideLength: number;
}

export const TRIANGLE_SIDE = 26;
export const TRIANGLE_WIDTH = TRIANGLE_SIDE * (Math.sqrt(3) / 2); // ~22.5167

/**
 * Compute the exact mathematical vertices and centroid for a triangular cell at (c, r)
 */
export function getTriangleGeometry(
  c: number,
  r: number,
  side: number = TRIANGLE_SIDE,
  originX: number = 0,
  originY: number = 0
): TriangleGeometry {
  const w = side * (Math.sqrt(3) / 2);
  const halfS = side / 2;
  const isRight = (c + r) % 2 === 0;

  let v1: Point2D;
  let v2: Point2D;
  let v3: Point2D;
  let centroid: Point2D;

  if (isRight) {
    // Points RIGHT (▷)
    const apexX = originX + (c + 1) * w;
    const apexY = originY + r * halfS;
    const baseX = originX + c * w;
    const topY = originY + (r - 1) * halfS;
    const botY = originY + (r + 1) * halfS;

    v1 = { x: apexX, y: apexY };
    v2 = { x: baseX, y: topY };
    v3 = { x: baseX, y: botY };
    centroid = {
      x: originX + c * w + w / 3,
      y: apexY,
    };
  } else {
    // Points LEFT (◁)
    const apexX = originX + c * w;
    const apexY = originY + r * halfS;
    const baseX = originX + (c + 1) * w;
    const topY = originY + (r - 1) * halfS;
    const botY = originY + (r + 1) * halfS;

    v1 = { x: apexX, y: apexY };
    v2 = { x: baseX, y: topY };
    v3 = { x: baseX, y: botY };
    centroid = {
      x: originX + c * w + (2 * w) / 3,
      y: apexY,
    };
  }

  const pointsString = `${v1.x.toFixed(2)},${v1.y.toFixed(2)} ${v2.x.toFixed(2)},${v2.y.toFixed(2)} ${v3.x.toFixed(2)},${v3.y.toFixed(2)}`;

  return {
    c,
    r,
    orientation: isRight ? 'right' : 'left',
    centroid,
    vertices: [v1, v2, v3],
    pointsString,
    sideLength: side,
  };
}

/**
 * Check if two discrete grid coordinates share an edge
 */
export function areTrianglesAdjacent(c1: number, r1: number, c2: number, r2: number): boolean {
  const isRight1 = (c1 + r1) % 2 === 0;
  if (isRight1) {
    // Points RIGHT: shares edges with (c1, r1 - 1), (c1, r1 + 1), and (c1 - 1, r1)
    if (c2 === c1 && (r2 === r1 - 1 || r2 === r1 + 1)) return true;
    if (c2 === c1 - 1 && r2 === r1) return true;
  } else {
    // Points LEFT: shares edges with (c1, r1 - 1), (c1, r1 + 1), and (c1 + 1, r1)
    if (c2 === c1 && (r2 === r1 - 1 || r2 === r1 + 1)) return true;
    if (c2 === c1 + 1 && r2 === r1) return true;
  }
  return false;
}
