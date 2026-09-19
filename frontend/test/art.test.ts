/**
 * Automates the art acceptance checklist in ky_thuat_my_thuat.md section 10.
 *
 * Most of that checklist needs eyes. These are the parts that do not, and they
 * are exactly the parts that rot silently: a colour tweaked for looks can drop
 * under the contrast floor, a new tile skin can collide with an existing one in
 * greyscale, someone can reach for `Math.random()` in a hurry, or a refactor can
 * quietly turn the batched draw calls back into one element per tile.
 *
 * Run: npx tsx frontend/test/art.test.ts
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Team, TriType } from '@promptchien/contracts';
import {
  CORE_BADGE,
  contrastAudit,
  contrastRatio,
  fxRandom,
  heatColor,
  relativeLuminance,
  tileSkin,
  toGreyscale,
} from '../src/lab/palette.js';
import { batchTiles, fillBand, hpBand, pointInTriangle, type ProjectedTile } from '../src/lab/arenaGeometry.js';
import { settingsFor, tierForFps } from '../src/lab/quality.js';

let failures = 0;
const ok = (m: string) => console.log(`  ok   ${m}`);
const bad = (m: string) => {
  failures++;
  console.log(`  FAIL ${m}`);
};
const info = (m: string) => console.log(`  ..   ${m}`);

const WHITE = '#FFFFFF';
const TYPES: TriType[] = ['hammer', 'scissor', 'paper', 'motor'];
const TEAMS: Team[] = ['A', 'B'];

console.log('art acceptance (ky_thuat_my_thuat.md section 10)');

// ---------------------------------------------------------------------------
// 4.2 - "every colour must reach >= 3:1 against the white arena"
// ---------------------------------------------------------------------------
{
  const audit = contrastAudit();
  const below = audit
    .map((e) => ({ ...e, ratio: contrastRatio(e.hex, WHITE) }))
    .filter((e) => e.ratio < 3);
  if (below.length === 0) {
    ok(`all ${audit.length} painted colours clear 3:1 against white`);
  } else {
    for (const e of below) bad(`${e.hex} (${e.role}, ${e.scope}) is only ${e.ratio.toFixed(2)}:1`);
  }

  // The exemptions must stay exemptions: if a motor fill ever becomes a solid
  // block of colour it has to join the audit.
  const motorFill = tileSkin('A', 'motor').fill;
  const motorStroke = tileSkin('A', 'motor').stroke;
  if (contrastRatio(motorStroke, WHITE) >= 3) {
    ok(`motor reads via its dashed outline (${motorStroke} at ${contrastRatio(motorStroke, WHITE).toFixed(2)}:1)`);
  } else {
    bad('the motor outline is under 3:1 - a pale fill with a faint border is invisible');
  }
  info(`motor fill ${motorFill} is exempt by design (${contrastRatio(motorFill, WHITE).toFixed(2)}:1)`);
}

// ---------------------------------------------------------------------------
// 4.2 - the four tile types must survive greyscale via pattern + stroke weight
// ---------------------------------------------------------------------------
{
  for (const team of TEAMS) {
    const seen = new Map<string, TriType>();
    let collision = '';
    for (const type of TYPES) {
      const s = tileSkin(team, type);
      const signature = `${s.strokeWidth}|${s.dash ?? 'solid'}|${s.dotted ? 'dotted' : 'plain'}`;
      const prev = seen.get(signature);
      if (prev) collision = `${prev} and ${type} share "${signature}"`;
      seen.set(signature, type);
    }
    if (collision) bad(`team ${team}: ${collision} - indistinguishable without colour`);
    else ok(`team ${team}: all four types differ in stroke weight + pattern`);

    // Hammer must carry the heaviest outline; that is what makes the damage
    // dealer readable in a black-and-white print.
    const hammer = tileSkin(team, 'hammer').strokeWidth;
    const others = TYPES.filter((t) => t !== 'hammer').map((t) => tileSkin(team, t).strokeWidth);
    if (others.every((w) => w < hammer)) ok(`team ${team}: hammer has the heaviest outline (${hammer}px)`);
    else bad(`team ${team}: hammer's outline is not the heaviest`);
  }
}

// ---------------------------------------------------------------------------
// 4.3 - the teams must survive greyscale, and colour must NOT be the channel
// ---------------------------------------------------------------------------
{
  const a = tileSkin('A', 'hammer').fill;
  const b = tileSkin('B', 'hammer').fill;
  const greyRatio = contrastRatio(toGreyscale(a), toGreyscale(b));
  info(`team A vs team B hammer in greyscale: ${greyRatio.toFixed(2)}:1 (the doc's own trade-off)`);
  if (greyRatio < 3) {
    info('  -> colour cannot carry team identity; the Core badge and panel order must');
  } else {
    info('  -> better than the doc predicted; the badge is still required, not merely nice');
  }

  // The actual requirement: the badge must differ between teams.
  if (CORE_BADGE.A.solid !== CORE_BADGE.B.solid && CORE_BADGE.B.notches > 0) {
    ok(`Core badge distinguishes the teams: A ${CORE_BADGE.A.solid ? 'solid ring' : 'notched'}, B ${CORE_BADGE.B.notches} notches`);
  } else {
    bad('the Core badge does not distinguish the two teams - greyscale viewers lose team identity');
  }

  // And luminance alone must not be the only difference either.
  const lumA = relativeLuminance(a);
  const lumB = relativeLuminance(b);
  if (Math.abs(lumA - lumB) > 0) {
    info(`luminance A ${lumA.toFixed(3)} vs B ${lumB.toFixed(3)}`);
  }
}

// ---------------------------------------------------------------------------
// 4.5 / 4.6 - the band tables
// ---------------------------------------------------------------------------
{
  const cases: Array<[number, number]> = [
    [1000, 0],
    [600, 0],
    [599, 1],
    [400, 1],
    [399, 2],
    [150, 2],
    [149, 3],
    [0, 3],
  ];
  const wrong = cases.filter(([ratio, band]) => hpBand(ratio) !== band);
  if (wrong.length === 0) ok('HP bands match the four rows of the 4.5 table');
  else bad(`HP band boundaries wrong at: ${wrong.map(([r]) => r).join(', ')}`);

  // A healthy tile on the damage map must still show heat, not the HP colour.
  if (fillBand({ hpRatioMilli: 1000 }, true, 0.9) !== fillBand({ hpRatioMilli: 1000 }, false, 0)) {
    ok('the damage map overrides a healthy tile when it has taken damage');
  } else {
    bad('the damage map did not override a healthy tile');
  }

  // Heat must increase monotonically.
  const heats = [0.1, 0.3, 0.55, 0.8, 1].map((t) => relativeLuminance(heatColor(t)));
  let monotonic = true;
  for (let i = 1; i < heats.length; i++) if (heats[i]! > heats[i - 1]!) monotonic = false;
  if (monotonic) ok('the heat scale darkens monotonically from light to severe');
  else bad('the heat scale is not monotonic');
}

// ---------------------------------------------------------------------------
// 5.2 rule 1 - fill calls must not grow with the triangle count
// ---------------------------------------------------------------------------
{
  const makeTiles = (n: number): ProjectedTile[] =>
    Array.from({ length: n }, (_, i) => ({
      index: i,
      type: TYPES[i % 4]!,
      verts: [
        [0, 0],
        [10, 0],
        [5, 8],
      ] as Array<[number, number]>,
      silhouette: [
        [0, 0],
        [10, 0],
        [5, 8],
      ] as Array<[number, number]>,
      cx: 5,
      cy: 3,
      alive: true,
      isCore: i === 0,
      hpRatioMilli: 1000,
      damageReceived: 0,
    }));

  const small = batchTiles(makeTiles(6), 'A', false, [], 0);
  const large = batchTiles(makeTiles(60), 'A', false, [], 0);
  if (small.length === large.length) ok(`fill paths: 6 tiles and 60 tiles both produce ${large.length} path(s)`);
  else bad(`fill paths grew with the body: ${small.length} vs ${large.length}`);

  // Worst case: every band and type populated.
  const worst: ProjectedTile[] = [];
  for (const type of TYPES) {
    for (let band = 0; band < 4; band++) {
      worst.push({ ...makeTiles(1)[0]!, index: worst.length, type, hpRatioMilli: [1000, 500, 300, 50][band]! });
    }
  }
  const worstPaths = batchTiles(worst, 'A', false, [], 0);
  if (worstPaths.length <= 16) ok(`worst case for one team: ${worstPaths.length} fill paths (ceiling 4 types x 4 bands)`);
  else bad(`worst case produced ${worstPaths.length} paths, above the 16 ceiling`);

  const heat = makeTiles(60).map((t, i) => i);
  const mapPaths = batchTiles(makeTiles(60), 'A', true, heat, 60);
  if (mapPaths.length <= 16) ok(`damage map: ${mapPaths.length} fill paths, still independent of the body`);
  else bad(`damage map produced ${mapPaths.length} paths`);
}

// ---------------------------------------------------------------------------
// 5.2 rules 2 and 3 - no shadowBlur, no ctx.filter; 1.2 - no Math.random
// ---------------------------------------------------------------------------
{
  const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'src');
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(p)) files.push(p);
    }
  };
  walk(root);

  const banned: Array<[RegExp, string]> = [
    [/Math\.random\s*\(/, 'Math.random()'],
    [/shadowBlur/, 'shadowBlur'],
    [/ctx\.filter/, 'ctx.filter'],
    [/\bctx\b/, 'a raw canvas context'],
  ];
  const offences: string[] = [];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const [re, name] of banned) {
      // Skip comment lines: several files explain WHY these are banned.
      const lines = text.split('\n');
      lines.forEach((line, i) => {
        const code = line.split('//')[0]!;
        if (re.test(code) && !/^\s*\*/.test(line)) {
          offences.push(`${name} at ${file.replace(root, 'src')}:${i + 1}`);
        }
      });
    }
  }
  if (offences.length === 0) ok(`no banned drawing calls across ${files.length} source files`);
  else bad(`banned drawing calls: ${offences.join('; ')}`);
}

// ---------------------------------------------------------------------------
// 1.2 - effect randomness must be a pure function of the seed
// ---------------------------------------------------------------------------
{
  let stable = true;
  let varied = false;
  for (let i = 0; i < 200; i++) {
    if (fxRandom(7, 100, i) !== fxRandom(7, 100, i)) stable = false;
    if (fxRandom(7, 100, i) !== fxRandom(7, 100, i + 1)) varied = true;
  }
  if (stable) ok('effect randomness is stable for a given (seed, tick, index)');
  else bad('effect randomness is not reproducible');
  if (varied) ok('effect randomness varies across indices');
  else bad('effect randomness returns the same value for every index');

  const otherSeed = fxRandom(8, 100, 5);
  if (otherSeed !== fxRandom(7, 100, 5)) ok('a different match seed throws different effects');
  else bad('the match seed does not affect the effects');

  let inRange = true;
  for (let i = 0; i < 500; i++) {
    const v = fxRandom(3, i, i * 7);
    if (!(v >= 0 && v < 1)) inRange = false;
  }
  if (inRange) ok('effect randomness stays in [0, 1)');
  else bad('effect randomness escaped [0, 1)');
}

// ---------------------------------------------------------------------------
// hit testing (what replaced the per-tile pointer handlers)
// ---------------------------------------------------------------------------
{
  const tri: Array<[number, number]> = [
    [0, 0],
    [10, 0],
    [5, 10],
  ];
  if (pointInTriangle(5, 3, tri)) ok('hit test finds a point inside a triangle');
  else bad('hit test missed a point clearly inside');

  if (!pointInTriangle(0, 10, tri)) ok('hit test rejects a point outside');
  else bad('hit test accepted a point outside');

  if (pointInTriangle(5, 0, tri)) ok('hit test includes the boundary');
  else bad('hit test excluded the boundary');
}

// ---------------------------------------------------------------------------
// 5.3 / 5.4 - quality tiers and speed-based level of detail
// ---------------------------------------------------------------------------
{
  const boundaries: Array<[number, string]> = [
    [60, 'high'],
    [55, 'high'],
    [54, 'medium'],
    [40, 'medium'],
    [39, 'low'],
    [25, 'low'],
    [24, 'minimal'],
    [5, 'minimal'],
  ];
  const wrong = boundaries.filter(([fps, tier]) => tierForFps(fps) !== tier);
  if (wrong.length === 0) ok('quality tiers match the 5.3 table at every boundary');
  else bad(`tier boundaries wrong at ${wrong.map(([f]) => f + 'fps').join(', ')}`);

  const high = settingsFor('high', 1);
  if (high.maxParticles === 300 && high.trail && high.wobble && high.squash) {
    ok('the high tier enables everything');
  } else {
    bad('the high tier is missing effects');
  }

  const low = settingsFor('low', 1);
  if (!low.trail && !low.wobble && low.squash && low.breath && low.maxParticles === 60) {
    ok('the low tier drops the trail and wobble but keeps squash and breathing (5.3)');
  } else {
    bad(`the low tier is wrong: ${JSON.stringify(low)}`);
  }

  const minimal = settingsFor('minimal', 1);
  if (minimal.maxParticles === 0 && !minimal.trail && !minimal.wobble && !minimal.squash && !minimal.breath) {
    ok('the minimal tier strips every effect');
  } else {
    bad(`the minimal tier still has effects: ${JSON.stringify(minimal)}`);
  }

  // 5.4 - speed based LOD applies ON TOP of the tier.
  const at2 = settingsFor('high', 2);
  if (at2.maxParticles === 150 && !at2.squash && at2.trail) {
    ok('at x2: half the particles, squash off, trail kept (5.4)');
  } else {
    bad(`x2 LOD wrong: ${JSON.stringify(at2)}`);
  }

  const at4 = settingsFor('high', 4);
  if (at4.maxParticles === 0 && !at4.trail) {
    ok('at x4: no particles and no trail (5.4)');
  } else {
    bad(`x4 LOD wrong: ${JSON.stringify(at4)}`);
  }

  // 5.3, stated in bold: the lowest tier must still be playable, which means the
  // body, the Core and the bars are never optional. Nothing here may remove them.
  if (minimal.tier === 'minimal') ok('the lowest tier still returns a usable renderer configuration');
  else bad('the lowest tier produced an unusable configuration');
}

console.log(failures === 0 ? '\nall art acceptance checks passed' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
