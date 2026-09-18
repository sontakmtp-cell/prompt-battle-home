import type { BotDefinition, BrainDefinition, TriCell, TriType } from '@promptchien/contracts';
import { BOT_SCHEMA_VERSION, BRAIN_API_VERSION } from '@promptchien/contracts';

const CHAR_TYPE: Record<string, TriType> = {
  H: 'hammer',
  S: 'scissor',
  P: 'paper',
  M: 'motor',
};

/**
 * Build a body from a character grid.
 * One character = one rhombus = the (down, up) triangle pair that tiles together,
 * so the body stays edge-connected by construction.
 * Row 0 is the front of the bot (the local -y axis is forward).
 */
export function gridToTriangles(rows: readonly string[]): TriCell[] {
  const tris: TriCell[] = [];
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]!;
    for (let j = 0; j < row.length; j++) {
      const ch = row[j]!;
      if (ch === '.' || ch === ' ') continue;
      const type = CHAR_TYPE[ch];
      if (!type) throw new Error(`unknown tile character "${ch}" at row ${r} col ${j}`);
      tris.push({ r, j, o: 'down', type });
      tris.push({ r, j, o: 'up', type });
    }
  }
  return tris;
}

/** Index of the down-triangle of rhombus (r, j) inside the grid ordering. */
export function coreIndexOf(rows: readonly string[], r: number, j: number): number {
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

function def(name: string, rows: readonly string[], core: [number, number], brain: BrainDefinition): BotDefinition {
  return {
    schemaVersion: BOT_SCHEMA_VERSION,
    name,
    triangles: gridToTriangles(rows),
    coreIndex: coreIndexOf(rows, core[0], core[1]),
    brain,
  };
}

function brain(rules: BrainDefinition['rules']): BrainDefinition {
  return { version: BRAIN_API_VERSION, rules };
}

// ---------------------------------------------------------------------------
// The five reference bots (gameplay.md 7.2)
// ---------------------------------------------------------------------------

/**
 * SPEAR - "Mui Giao". Hammer piled at the front, motors at the back.
 * Charges straight in and tries to end it with one hit.
 */
export const SPEAR: BotDefinition = def(
  'Spear',
  [
    'HHH',
    'HHH',
    'HHH',
    'HHH',
    'HHH',
    'SSS',
    'PPP',
    'MMM',
    'MMM',
    'MMM',
  ],
  [2, 1],
  brain([
    { when: { cmp: ['>', { field: 'self.stuckTicks' }, 12] }, move: 'backward', rotate: 'toEnemy' },
    { when: { cmp: ['<', { field: 'enemy.dist' }, 3000] }, move: 'forward', rotate: 'toEnemy' },
    { move: 'forward', rotate: 'toEnemy' },
  ]),
);

/**
 * SHIELD - "Khien". Paper wrapped around the Core, slow, lets the enemy break on it.
 */
export const SHIELD: BotDefinition = def(
  'Shield',
  [
    'PPPPP',
    'PPPPP',
    'PPPPP',
    'PPPPP',
    'SSSSS',
    'MMMMM',
  ],
  [2, 2],
  brain([
    { when: { cmp: ['>', { field: 'self.stuckTicks' }, 12] }, move: 'strafeRight', rotate: 'toEnemy' },
    { when: { cmp: ['<', { field: 'enemy.dist' }, 3600] }, move: 'hold', rotate: 'toEnemy' },
    { move: 'forward', rotate: 'toEnemy' },
  ]),
);

/**
 * FLANKER - "Vong Suon". Scissors on both wings, motors underneath.
 * Never charges head-on: it spirals in and looks for a flank.
 */
export const FLANKER: BotDefinition = def(
  'Flanker',
  [
    'SPPPS',
    'SPPPS',
    'SPPPS',
    'SPPPS',
    'MMMMM',
    'MMMMM',
  ],
  [2, 2],
  brain([
    { when: { cmp: ['>', { field: 'self.stuckTicks' }, 12] }, move: 'backward', rotate: 'orbitRight' },
    { when: { cmp: ['>', { field: 'enemy.dist' }, 7000] }, move: 'forward', rotate: 'toEnemy' },
    { move: 'forward', rotate: 'orbitLeft' },
  ]),
);

/**
 * SPINNER - "Con Xoay". Radial body: combat tiles on the rim, motors on the
 * flanks. It spins hard so a fresh face is always rotating into the contact.
 *
 * Three things here are deliberate, and all three were learned by measurement:
 *
 *  - The FRONT ROW is combat, not motors. A motor tile deals zero damage
 *    (can_bang.md 3.5), so a radial body whose whole rim is motors has no
 *    favourable face to rotate into the contact - it just bulldozes, and it
 *    failed the sandbox in 4 of 8 placements.
 *  - The brain must COMMIT before it spins. A spin rule that fires as soon as
 *    the enemy is inside 8000 simply orbits at that radius forever, which is
 *    exactly the "circles to avoid the fight" failure gameplay.md 4.2 rejects.
 *  - The spin gate is 5000, not 3000. Rotating sweeps fresh faces through the
 *    contact, which is genuinely strong in this ruleset: at gate 3000 Spinner
 *    won 99% of every matchup and stopped producing different games. At 5000 it
 *    keeps the spin identity (sandbox 8/8) while the matchups differentiate
 *    again - it beats Spear and GlassCannon, and loses to Shield.
 */
export const SPINNER: BotDefinition = def(
  'Spinner',
  [
    '.PHS.',
    'MHSPM',
    'MSPHM',
    'MSPHM',
    'MHSPM',
    '.PHS.',
  ],
  [2, 2],
  brain([
    { when: { cmp: ['>', { field: 'self.stuckTicks' }, 12] }, move: 'backward', rotate: 'left' },
    { when: { cmp: ['>', { field: 'enemy.dist' }, 5000] }, move: 'forward', rotate: 'toEnemy' },
    { move: 'forward', rotate: 'left' },
  ]),
);

/**
 * GLASS CANNON - "Sung Thuy Tinh". Almost no defence, combat tiles up front,
 * a huge motor block behind: fastest thing in the game at 115% speed.
 */
export const GLASS_CANNON: BotDefinition = def(
  'GlassCannon',
  [
    'HHHH',
    'HHHH',
    'HHHH',
    'MMMM',
    'MMMM',
    'MMMM',
  ],
  [1, 1],
  brain([
    { when: { cmp: ['>', { field: 'self.stuckTicks' }, 10] }, move: 'strafeLeft', rotate: 'toEnemy' },
    { move: 'forward', rotate: 'toEnemy' },
  ]),
);

export const SAMPLE_BOTS: readonly BotDefinition[] = [
  SPEAR,
  SHIELD,
  FLANKER,
  SPINNER,
  GLASS_CANNON,
];

// ---------------------------------------------------------------------------
// Roster used by the balance harness (can_bang.md section 10)
// ---------------------------------------------------------------------------

/** Pure-bred bots: 40 combat tiles of one type + 20 motors. */
export const PURE_HAMMER: BotDefinition = def(
  'PureHammer',
  ['HHHHH', 'HHHHH', 'HHHHH', 'HHHHH', 'MMMMM', 'MMMMM'],
  [2, 2],
  brain([{ move: 'forward', rotate: 'toEnemy' }]),
);

export const PURE_SCISSOR: BotDefinition = def(
  'PureScissor',
  ['SSSSS', 'SSSSS', 'SSSSS', 'SSSSS', 'MMMMM', 'MMMMM'],
  [2, 2],
  brain([{ move: 'forward', rotate: 'toEnemy' }]),
);

export const PURE_PAPER: BotDefinition = def(
  'PurePaper',
  ['PPPPP', 'PPPPP', 'PPPPP', 'PPPPP', 'MMMMM', 'MMMMM'],
  [2, 2],
  brain([{ move: 'forward', rotate: 'toEnemy' }]),
);

/** Perfectly interleaved 3-type bot: every tile sees all three combat types. */
export const MIXED_TRIPLE: BotDefinition = def(
  'MixedTriple',
  ['HSPHS', 'SPHPS', 'HSPHS', 'SPHPS', 'MMMMM', 'MMMMM'],
  [2, 2],
  brain([{ move: 'forward', rotate: 'toEnemy' }]),
);

/** 70% hammer / 30% scissor, interleaved so the resonance still fires. */
export const HAMMER_LEAN: BotDefinition = def(
  'HammerLean',
  ['HHSHH', 'HSHSH', 'HHSHS', 'SHHHH', 'MMMMM', 'MMMMM'],
  [2, 2],
  brain([{ move: 'forward', rotate: 'toEnemy' }]),
);

/** Motor hunter: hammer-heavy, built to break legs rather than kill the Core. */
export const MOTOR_HUNTER: BotDefinition = def(
  'MotorHunter',
  ['HHHHH', 'HHHHH', 'HHHHH', 'HHHHH', 'MMMMM', 'MMMMM'],
  [2, 2],
  brain([
    { when: { cmp: ['>', { field: 'enemy.dist' }, 4000] }, move: 'forward', rotate: 'toEnemy' },
    { move: 'forward', rotate: 'toEnemy' },
  ]),
);

/** Immobile punchbag. Used by the sandbox; never submitted. */
export const DUMMY: BotDefinition = def(
  'Dummy',
  ['HHH', 'MMM'],
  [0, 1],
  brain([{ move: 'hold', rotate: 'hold' }]),
);

/** Same body as Spear, but no orientation logic at all: used to price the brain. */
export const SPEAR_BLINDFOLD: BotDefinition = def(
  'SpearBlindfold',
  ['HHH', 'HHH', 'HHH', 'HHH', 'HHH', 'SSS', 'PPP', 'MMM', 'MMM', 'MMM'],
  [2, 1],
  brain([{ move: 'forward', rotate: 'hold' }]),
);

/** 56 combat + 4 motors: the "meat cube" from can_bang.md 6.7 (load factor > 2). */
export const MEAT_CUBE: BotDefinition = def(
  'MeatCube',
  [
    'HHHHH',
    'HHHHH',
    'HHHHH',
    'HHHHH',
    'HHHHH',
    'HMMHH',
  ],
  [2, 2],
  brain([{ move: 'forward', rotate: 'toEnemy' }]),
);
