import type { Team, TriType } from '@promptchien/contracts';

/**
 * Every art constant in the web lab lives here.
 *
 * ky_thuat_my_thuat.md 6 is explicit: effect constants must not be scattered
 * through the drawing code any more than balance constants may be scattered
 * through the engine ("khong hard-code my thuat rai rac"). If a number changes
 * how something looks, it belongs in this file.
 *
 * Section numbers below refer to ky_thuat_my_thuat.md.
 */

// ---------------------------------------------------------------------------
// 4.2 - four recognition channels: colour encodes TEAM, pattern encodes TYPE
// ---------------------------------------------------------------------------

export interface TileSkin {
  fill: string;
  stroke: string;
  /** outline weight; hammer is deliberately heaviest so it reads in greyscale */
  strokeWidth: number;
  dash: string | undefined;
  /** paper gets a dot pattern on top of its fill */
  dotted: boolean;
}

const TEAM_A: Record<TriType, TileSkin> = {
  hammer: { fill: '#C0392B', stroke: '#8E2A20', strokeWidth: 2, dash: undefined, dotted: false },
  // ky_thuat_my_thuat.md 4.2 quotes #E67E22 here, but that colour measures
  // 2.85:1 against the white arena, under the >= 3:1 floor the SAME table calls
  // mandatory. The doc contradicts itself, and the floor is the part with a
  // reason behind it (the arena is white, so a too-light tile is hard to see).
  // #D97720 is the nearest colour that clears the floor: identical hue (28 deg)
  // and saturation, only darker. Measured at 3.18:1 - see frontend/test/art.test.ts,
  // which fails the build if any palette colour drops back under 3:1.
  scissor: { fill: '#D97720', stroke: '#A3560F', strokeWidth: 1, dash: undefined, dotted: false },
  paper: { fill: '#A0821A', stroke: '#6E5910', strokeWidth: 1, dash: undefined, dotted: true },
  motor: { fill: '#E8EBEF', stroke: '#C0392B', strokeWidth: 1, dash: '3 2', dotted: false },
};

const TEAM_B: Record<TriType, TileSkin> = {
  hammer: { fill: '#1D4ED8', stroke: '#153A9E', strokeWidth: 2, dash: undefined, dotted: false },
  scissor: { fill: '#0E9488', stroke: '#0A6B62', strokeWidth: 1, dash: undefined, dotted: false },
  paper: { fill: '#4D7C3A', stroke: '#365A28', strokeWidth: 1, dash: undefined, dotted: true },
  motor: { fill: '#E8EBEF', stroke: '#1D4ED8', strokeWidth: 1, dash: '3 2', dotted: false },
};

export function tileSkin(team: Team, type: TriType): TileSkin {
  return (team === 'A' ? TEAM_A : TEAM_B)[type];
}

/** The single dark tone used for the silhouette pass (4.4). */
export const SILHOUETTE = '#1F2937';

/** A detached cluster turns silver-grey and loses all team colour (4.8). */
export const DETACHED_FILL = '#B4B2A9';
export const DETACHED_STROKE = '#8A887F';

/**
 * 4.3 - the Core badge, channel 3 of the four recognition channels.
 *
 * The doc works out that team colours sit at roughly 1.23:1 against each other in
 * greyscale, which is unreadable. Since a colour that is dark enough for white
 * cannot also be light enough to separate from the other team, the fallback has
 * to be non-colour: a solid ring for A, the same ring with four arcs cut out for
 * B. It lives here rather than inside the renderer so the acceptance test can
 * assert the two teams really do differ.
 */
export interface CoreBadge {
  /** solid ring, or a ring with gaps */
  solid: boolean;
  /** number of arcs cut out of the ring */
  notches: number;
}

export const CORE_BADGE: Record<Team, CoreBadge> = {
  A: { solid: true, notches: 0 },
  B: { solid: false, notches: 4 },
};

export function coreBadge(team: Team): CoreBadge {
  return CORE_BADGE[team];
}

// ---------------------------------------------------------------------------
// 4.5 - HP banding
// ---------------------------------------------------------------------------

/** How pale a tile turns as it loses HP. Returns a 0..1 mix toward white. */
export function palenessFor(hpRatioMilli: number): number {
  if (hpRatioMilli >= 600) return 0;
  if (hpRatioMilli >= 400) return 0.15;
  if (hpRatioMilli >= 150) return 0.3;
  return 0.45;
}

/** Below this the tile grows a fracture line (4.5). */
export const CRACK_BELOW_MILLI = 400;
export const CRACK_STRONG_BELOW_MILLI = 150;

// ---------------------------------------------------------------------------
// 4.6 - damage map heat scale
// ---------------------------------------------------------------------------

export const HEAT_STOPS: ReadonlyArray<readonly [number, string]> = [
  [0.0, '#FAC775'],
  [0.25, '#FAC775'],
  [0.5, '#EF9F27'],
  [0.75, '#D85A30'],
  [1.0, '#A32D2D'],
];

/** Heat colour for a 0..1 normalised damage value. */
export function heatColor(t: number): string {
  const v = Math.max(0, Math.min(1, t));
  if (v <= 0) return '#FFFFFF';
  let lo = HEAT_STOPS[0]!;
  let hi = HEAT_STOPS[HEAT_STOPS.length - 1]!;
  for (let i = 0; i < HEAT_STOPS.length - 1; i++) {
    const a = HEAT_STOPS[i]!;
    const b = HEAT_STOPS[i + 1]!;
    if (v >= a[0] && v <= b[0]) {
      lo = a;
      hi = b;
      break;
    }
  }
  const span = hi[0] - lo[0];
  const f = span === 0 ? 0 : (v - lo[0]) / span;
  const ca = hexToRgb(lo[1]);
  const cb = hexToRgb(hi[1]);
  return rgbToHex(
    Math.round(ca[0] + (cb[0] - ca[0]) * f),
    Math.round(ca[1] + (cb[1] - ca[1]) * f),
    Math.round(ca[2] + (cb[2] - ca[2]) * f),
  );
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(r: number, g: number, b: number): string {
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/** Mix a colour toward white, for the HP banding in 4.5. */
export function lighten(hex: string, amount: number): string {
  if (amount <= 0) return hex;
  const [r, g, b] = hexToRgb(hex);
  const k = Math.max(0, Math.min(1, amount));
  return rgbToHex(
    Math.round(r + (255 - r) * k),
    Math.round(g + (255 - g) * k),
    Math.round(b + (255 - b) * k),
  );
}

// ---------------------------------------------------------------------------
// Arena chrome and effect colours
// ---------------------------------------------------------------------------

/**
 * Everything the renderer paints that is not a tile skin.
 *
 * These used to be typed straight into the SVG, which is exactly what
 * ky_thuat_my_thuat.md 6 forbids ("khong hard-code my thuat rai rac" - do not
 * scatter art constants). Keeping them here also lets the acceptance test prove
 * that nothing reaches the screen that this file cannot account for.
 */
export const ARENA = {
  /** the arena is white; this is the only "background" the art system has */
  BG: '#FFFFFF',
  GRID: '#94A3B8',
  EDGE: '#CBD5E1',
  /** the dimming outside the shrinking ring (4.7) */
  RING_SHADE: '#64748B',
  /** 4.5 Core marker */
  CORE_RING_BG: '#E2E8F0',
  CORE_CENTER: '#FFFFFF',
  CORE_WEAK_CENTER: '#FEE2E2',
  CORE_ALERT: '#DC2626',
  /** 4.5 fracture line */
  CRACK: '#7F1D1D',
  /** selected / hovered outline */
  SELECT: '#0F172A',
} as const;

/** 4.2 - the dot colour inside the paper pattern, per team. */
export const PAPER_DOT: Record<Team, string> = {
  A: '#FFFBEB',
  B: '#F0FDF4',
};

/**
 * 3.4 / 2.3 - spark colour by advantage.
 * The advantage hit is the one that has to read as painful, so it borrows the
 * darkest stop of the damage scale rather than inventing a new red.
 */
export const SPARK = {
  adv: '#A32D2D',
  neutral: '#94A3B8',
  disadv: '#C7CBD1',
} as const;

// ---------------------------------------------------------------------------
// WCAG colour maths, for the acceptance checks in ky_thuat_my_thuat.md 4.2
// ---------------------------------------------------------------------------

/** WCAG relative luminance. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, always >= 1. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/** Convert to greyscale the way a black-and-white print would. */
export function toGreyscale(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  const y = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
  return rgbToHex(y, y, y);
}

export interface ContrastEntry {
  hex: string;
  /** where the colour is used, for the failure message */
  role: string;
  /**
   * `fill` for a solid block of colour, `stroke` for an outline.
   * Motor's fill is exempt (see below), so it is not listed as a fill.
   */
  scope: 'fill' | 'stroke';
}

/**
 * Every colour the renderer paints, tagged with how it must behave.
 *
 * The 3:1 floor in section 4.2 applies to colours that have to be *seen* against
 * the white arena. Two deliberate exemptions:
 *
 *  - **Motor fill.** The doc specifies a "very pale" fill on purpose and makes
 *    the dashed outline carry the reading ("Riêng Motor dùng viền nét đứt để vẫn
 *    đọc được khi in đen trắng"). A near-white fill is the design, so only the
 *    motor's stroke is held to the floor.
 *  - **Detached grey.** Section 4.8's silver ghost is a dying fragment that fades
 *    out over 0.9 s. It is not part of the 4.2 palette and being faint is the
 *    point, so it is not audited.
 */
export function contrastAudit(): ContrastEntry[] {
  const out: ContrastEntry[] = [];
  for (const team of ['A', 'B'] as const) {
    for (const type of ['hammer', 'scissor', 'paper', 'motor'] as const) {
      const s = tileSkin(team, type);
      out.push({ hex: s.stroke, role: `${team} ${type} outline`, scope: 'stroke' });
      // Motor is the one type whose fill is allowed to be near-white.
      if (type !== 'motor') {
        out.push({ hex: s.fill, role: `${team} ${type} fill`, scope: 'fill' });
      }
    }
  }
  out.push({ hex: SILHOUETTE, role: 'silhouette', scope: 'fill' });
  return out;
}

/** The colours the renderer paints, for the contrast audit. */
export function allPaletteColors(): string[] {
  return [...new Set(contrastAudit().map((e) => e.hex.toUpperCase()))];
}

/**
 * Every colour the palette is able to produce, including the ones the renderer
 * derives at runtime by mixing or by walking the heat scale.
 *
 * The acceptance test compares the rendered markup against this set: anything on
 * screen that the palette cannot produce was typed by hand somewhere, which is
 * the failure mode section 6 warns about.
 */
export function paletteColorSpace(): Set<string> {
  const out = new Set<string>();
  const add = (c: string) => out.add(c.toUpperCase());

  for (const team of ['A', 'B'] as const) {
    for (const type of ['hammer', 'scissor', 'paper', 'motor'] as const) {
      const s = tileSkin(team, type);
      add(s.fill);
      add(s.stroke);
      // Every HP band the renderer can mix toward white (4.5).
      for (const p of [0, 0.15, 0.3, 0.45]) add(lighten(s.fill, p));
    }
    add(PAPER_DOT[team]);
  }

  add(SILHOUETTE);
  add(DETACHED_FILL);
  add(DETACHED_STROKE);
  add(RING_COLOR);
  for (const v of Object.values(ARENA)) add(v);
  for (const v of Object.values(SPARK)) add(v);

  // Every colour heatColor can return.
  for (let i = 0; i <= 100; i++) add(heatColor(i / 100));

  return out;
}

// ---------------------------------------------------------------------------
// 4.7 - shrinking ring
// ---------------------------------------------------------------------------

export const RING_COLOR = '#888780';
export const RING_ANNOUNCE_ALPHA = 0.6;
/** Outside-the-ring shading is 8% normally, deepening to 14% near the end. */
export const RING_SHADE_MIN = 0.08;
export const RING_SHADE_MAX = 0.14;
export const RING_SHADE_DEEPEN_BELOW_MILLI = 10000;

// ---------------------------------------------------------------------------
// 3 - the seven "make hard geometry look alive" techniques
// ---------------------------------------------------------------------------

export interface FxSettings {
  /** 3.2 spring lag; stiffness/damping in per-second units */
  SPRING_STIFFNESS: number;
  SPRING_DAMPING: number;
  /** 3.3 apex wobble, as a fraction of a tile edge */
  WOBBLE_AMPLITUDE: number;
  WOBBLE_FREQ_HEALTHY: number;
  WOBBLE_FREQ_HURT: number;
  /** 3.4 squash: 1 + SQUASH_MAX * (impactMul - 850)/150, capped */
  SQUASH_MAX: number;
  SQUASH_DECAY_TICKS: number;
  /** 3.5 breathing, amplitude as a fraction */
  BREATH_AMPLITUDE: number;
  BREATH_FREQ: number;
  /** 4.4 silhouette outline growth, in world milli-units */
  SILHOUETTE_GROWTH_MILLI: number;
  /** 4.8 detached shards drift outward at roughly this speed (world milli-units/sec) */
  DETACH_DRIFT_MILLI_PER_SEC: number;
  DETACH_FADE_SEC: number;
}

/**
 * The tuning constants, deliberately MUTABLE.
 *
 * ky_thuat_my_thuat.md 6 asks for a `/dev/fx` page where every effect constant
 * can be dragged with a slider and the result seen immediately, and warns that if
 * an artist has to wait for a rebuild for every number, art progress dies in two
 * weeks. A frozen object would force exactly that wait.
 *
 * The renderer reads `FX.*` everywhere, so tuning is a property write, not a
 * code change. `resetFx()` restores the shipped defaults; the dev page has a
 * button for it, and the values are never persisted, so a refresh is also a reset.
 */
export const FX_DEFAULTS: Readonly<FxSettings> = {
  SPRING_STIFFNESS: 22,
  SPRING_DAMPING: 7,
  WOBBLE_AMPLITUDE: 0.035,
  WOBBLE_FREQ_HEALTHY: 1.2,
  WOBBLE_FREQ_HURT: 3.6,
  SQUASH_MAX: 0.3,
  SQUASH_DECAY_TICKS: 8,
  BREATH_AMPLITUDE: 0.015,
  BREATH_FREQ: 0.6,
  SILHOUETTE_GROWTH_MILLI: 60,
  DETACH_DRIFT_MILLI_PER_SEC: 150,
  DETACH_FADE_SEC: 0.9,
};

export const FX: FxSettings = { ...FX_DEFAULTS };

export function resetFx(): void {
  Object.assign(FX, FX_DEFAULTS);
}

/** Slider ranges for the dev page, so the bounds live next to the defaults. */
export const FX_RANGES: Record<keyof FxSettings, { min: number; max: number; step: number; label: string }> = {
  SPRING_STIFFNESS: { min: 2, max: 60, step: 1, label: 'Độ cứng lò xo' },
  SPRING_DAMPING: { min: 0, max: 25, step: 0.5, label: 'Độ tắt dần' },
  WOBBLE_AMPLITUDE: { min: 0, max: 0.15, step: 0.005, label: 'Biên độ dao động đỉnh' },
  WOBBLE_FREQ_HEALTHY: { min: 0, max: 5, step: 0.1, label: 'Tần số dao động (khỏe)' },
  WOBBLE_FREQ_HURT: { min: 0, max: 10, step: 0.1, label: 'Tần số dao động (bị thương)' },
  SQUASH_MAX: { min: 0, max: 1, step: 0.05, label: 'Độ nén tối đa' },
  SQUASH_DECAY_TICKS: { min: 1, max: 30, step: 1, label: 'Số nhịp hồi nén' },
  BREATH_AMPLITUDE: { min: 0, max: 0.1, step: 0.005, label: 'Biên độ thở' },
  BREATH_FREQ: { min: 0, max: 3, step: 0.05, label: 'Tần số thở' },
  SILHOUETTE_GROWTH_MILLI: { min: 0, max: 300, step: 10, label: 'Độ dày viền bóng' },
  DETACH_DRIFT_MILLI_PER_SEC: { min: 0, max: 1000, step: 25, label: 'Tốc độ trôi mảnh đứt' },
  DETACH_FADE_SEC: { min: 0.1, max: 3, step: 0.1, label: 'Thời gian tan mảnh đứt' },
};

// ---------------------------------------------------------------------------
// Deterministic effect randomness (ky_thuat_my_thuat.md 1.2)
// ---------------------------------------------------------------------------

/**
 * Every random-looking value in the renderer comes from here.
 *
 * The doc's rule is absolute: no `Math.random()` anywhere on the drawing path,
 * because a replay watched twice must produce an identical picture, sparks
 * included. The seed is the match seed, so the same match always throws the same
 * sparks.
 */
export function fxRandom(seed: number, tick: number, index: number, salt = 0): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (tick + 0x85ebca6b), 0x27d4eb2d) >>> 0;
  h = Math.imul(h ^ (index + 0xc2b2ae35), 0x165667b1) >>> 0;
  h = Math.imul(h ^ (salt + 0x9e3779b9), 0x2545f491) >>> 0;
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

// ---------------------------------------------------------------------------
// Arena mapping
// ---------------------------------------------------------------------------

/** The SVG canvas the arena is drawn into. Square, because the arena is 40x40. */
export const ARENA_VIEWBOX = 1000;

/** World milli-units -> SVG units. */
export function worldScale(arenaHalfUnits: number): number {
  return ARENA_VIEWBOX / (arenaHalfUnits * 2 * 1000);
}

export function toSvgX(worldX: number, scale: number): number {
  return ARENA_VIEWBOX / 2 + worldX * scale;
}

export function toSvgY(worldY: number, scale: number): number {
  return ARENA_VIEWBOX / 2 + worldY * scale;
}
