import type {
  BotDefinition,
  BotStats,
  Ruleset,
  TriType,
  ValidationIssue,
} from '@promptchien/contracts';
import {
  BOT_SCHEMA_VERSION,
  loadFactorMilli,
  speedMultiplierFor,
} from '@promptchien/contracts';
import { buildGeometry, type BotGeometry } from './build.js';
import { cellKey, triNeighbors } from './lattice.js';
import { validateBrain } from '../brain/validate.js';

export interface ValidateOptions {
  /**
   * Make the >80% mono-culture ceiling a hard error instead of a warning.
   * can_bang.md section 6 keeps it as a switch, defaulting to warning only.
   */
  monoBlock?: boolean;
}

export interface DefinitionCheck {
  issues: ValidationIssue[];
  stats: BotStats | null;
  geometry: BotGeometry | null;
}

function err(issues: ValidationIssue[], code: string, message: string, path?: string) {
  issues.push({ code, severity: 'error', message, path });
}
function warn(issues: ValidationIssue[], code: string, message: string, path?: string) {
  issues.push({ code, severity: 'warning', message, path });
}

/**
 * Geometry validation (gameplay.md 4.1).
 * Rejects anything that would be cheating or meaningless: over budget, off lattice,
 * overlapping tiles, disconnected bodies, an illegal Core, or an over-sized bot.
 */
export function checkDefinition(
  def: BotDefinition,
  rs: Ruleset,
  opts: ValidateOptions = {},
): DefinitionCheck {
  const issues: ValidationIssue[] = [];

  if (typeof def !== 'object' || def === null) {
    err(issues, 'BOT_NOT_OBJECT', 'bot definition must be an object');
    return { issues, stats: null, geometry: null };
  }
  if (def.schemaVersion !== BOT_SCHEMA_VERSION) {
    err(issues, 'BOT_BAD_SCHEMA_VERSION', `schemaVersion must be ${BOT_SCHEMA_VERSION}`, 'schemaVersion');
  }
  if (typeof def.name !== 'string' || def.name.length === 0 || def.name.length > 48) {
    err(issues, 'BOT_BAD_NAME', 'name must be a string of 1..48 characters', 'name');
  }
  if (!Array.isArray(def.triangles)) {
    err(issues, 'BOT_NO_TRIANGLES', 'triangles must be an array', 'triangles');
    return { issues, stats: null, geometry: null };
  }
  if (def.triangles.length === 0) {
    err(issues, 'BOT_EMPTY', 'bot must contain at least one triangle', 'triangles');
    return { issues, stats: null, geometry: null };
  }
  if (def.triangles.length > rs.MAX_TRIANGLES) {
    err(
      issues,
      'BOT_OVER_BUDGET',
      `bot uses ${def.triangles.length} triangles, budget is ${rs.MAX_TRIANGLES}`,
      'triangles',
    );
  }

  // ---- per-tile shape and duplicate detection --------------------------
  const seen = new Map<string, number>();
  let coreCellOk = false;
  for (let i = 0; i < def.triangles.length; i++) {
    const t = def.triangles[i]!;
    const path = `triangles[${i}]`;
    if (!t || typeof t !== 'object') {
      err(issues, 'TRI_NOT_OBJECT', 'triangle must be an object', path);
      continue;
    }
    if (!Number.isInteger(t.r) || !Number.isInteger(t.j)) {
      err(issues, 'TRI_BAD_COORDS', 'r and j must be integers (the tile must sit on the lattice)', path);
      continue;
    }
    if (t.o !== 'up' && t.o !== 'down') {
      err(issues, 'TRI_BAD_ORIENTATION', 'o must be "up" or "down"', path);
      continue;
    }
    if (t.type !== 'hammer' && t.type !== 'scissor' && t.type !== 'paper' && t.type !== 'motor') {
      err(issues, 'TRI_BAD_TYPE', `unknown tile type "${String(t.type)}"`, path);
      continue;
    }
    const key = cellKey(t.r, t.j, t.o);
    const prev = seen.get(key);
    if (prev !== undefined) {
      err(
        issues,
        'TRI_OVERLAP',
        `triangle at (${t.r},${t.j},${t.o}) is already used by triangles[${prev}]`,
        path,
      );
      continue;
    }
    seen.set(key, i);
    if (i === def.coreIndex) coreCellOk = true;
  }

  if (issues.some((x) => x.severity === 'error')) {
    return { issues, stats: null, geometry: null };
  }

  // ---- core -------------------------------------------------------------
  if (!Number.isInteger(def.coreIndex) || def.coreIndex < 0 || def.coreIndex >= def.triangles.length) {
    err(issues, 'CORE_BAD_INDEX', 'coreIndex must point at an existing triangle', 'coreIndex');
    return { issues, stats: null, geometry: null };
  }
  if (!coreCellOk) {
    err(issues, 'CORE_BAD_INDEX', 'coreIndex does not resolve to a valid triangle', 'coreIndex');
    return { issues, stats: null, geometry: null };
  }
  const coreType = def.triangles[def.coreIndex]!.type;
  if (coreType === 'motor' && !rs.CORE_ON_MOTOR_ALLOWED) {
    err(
      issues,
      'CORE_ON_MOTOR',
      'the Core must sit on a combat triangle (hammer / scissor / paper). A motor Core is immune to the ' +
        'rock-paper-scissors ring and would be the second best Core position in the game for free ' +
        '(can_bang.md 6.6)',
      'coreIndex',
    );
  }

  // ---- connectivity -----------------------------------------------------
  const byKey = new Map<string, number>();
  for (let i = 0; i < def.triangles.length; i++) {
    const t = def.triangles[i]!;
    byKey.set(cellKey(t.r, t.j, t.o), i);
  }
  const visited = new Uint8Array(def.triangles.length);
  const stack = [0];
  visited[0] = 1;
  let reached = 1;
  while (stack.length > 0) {
    const idx = stack.pop()!;
    const t = def.triangles[idx]!;
    for (const nb of triNeighbors(t.r, t.j, t.o)) {
      const ni = byKey.get(cellKey(nb.r, nb.j, nb.o));
      if (ni === undefined || visited[ni]) continue;
      visited[ni] = 1;
      reached++;
      stack.push(ni);
    }
  }
  if (reached !== def.triangles.length) {
    const orphans: number[] = [];
    for (let i = 0; i < visited.length; i++) if (!visited[i]) orphans.push(i);
    err(
      issues,
      'BOT_DISCONNECTED',
      `body is not edge-connected: ${def.triangles.length - reached} tile(s) are floating free ` +
        `(triangles ${orphans.slice(0, 8).join(', ')}${orphans.length > 8 ? ', ...' : ''})`,
      'triangles',
    );
  }

  // ---- geometry, span, stats -------------------------------------------
  const geometry = buildGeometry(def);
  if (geometry.spanX > rs.MAX_BOT_SPAN * 1000 || geometry.spanY > rs.MAX_BOT_SPAN * 1000) {
    err(
      issues,
      'BOT_TOO_BIG',
      `bot spans ${(geometry.spanX / 1000).toFixed(2)} x ${(geometry.spanY / 1000).toFixed(2)} units, ` +
        `limit is ${rs.MAX_BOT_SPAN} x ${rs.MAX_BOT_SPAN}`,
      'triangles',
    );
  }

  let hammer = 0;
  let scissor = 0;
  let paper = 0;
  let motor = 0;
  for (const t of def.triangles) {
    if (t.type === 'hammer') hammer++;
    else if (t.type === 'scissor') scissor++;
    else if (t.type === 'paper') paper++;
    else motor++;
  }
  const combat = hammer + scissor + paper;
  const loadMilli = loadFactorMilli(rs, def.triangles.length, motor);
  const speedMultiplierMilli = motor === 0 ? 0 : speedMultiplierFor(loadMilli);
  const monoShareMilli = combat === 0 ? 1000 : Math.trunc((Math.max(hammer, scissor, paper) * 1000) / combat);

  const stats: BotStats = {
    triangles: def.triangles.length,
    combat,
    motors: motor,
    hammer,
    scissor,
    paper,
    loadMilli,
    speedMultiplierMilli,
    monoShareMilli,
    spanXMilli: geometry.spanX,
    spanYMilli: geometry.spanY,
    coreType,
  };

  // ---- soft checks ------------------------------------------------------
  if (combat === 0) {
    err(issues, 'BOT_NO_COMBAT', 'bot has no combat triangles; it can never win', 'triangles');
  } else if (combat < rs.MIN_COMBAT_TRIANGLES) {
    warn(
      issues,
      'BOT_FEW_COMBAT',
      `only ${combat} combat triangle(s): this bot will be judged incapable of fighting after ` +
        `${(rs.INCAP_TICKS / rs.TICK_RATE).toFixed(0)} seconds`,
      'triangles',
    );
  }
  if (motor === 0) {
    warn(issues, 'BOT_NO_MOTOR', 'bot has no motor: it cannot move or rotate at all', 'triangles');
  } else if (loadMilli > 2000) {
    warn(
      issues,
      'BOT_OVERLOADED',
      `load factor ${(loadMilli / 1000).toFixed(2)} (>2.00): this bot is a stationary fortress and will ` +
        `crawl at about 15% speed`,
      'triangles',
    );
  } else if (loadMilli > 1000) {
    warn(
      issues,
      'BOT_HEAVY',
      `load factor ${(loadMilli / 1000).toFixed(2)} (>1.00): not enough motors, this bot will be slowed ` +
        `to about ${speedMultiplierMilli / 10}% speed`,
      'triangles',
    );
  }

  const monoLimit = opts.monoBlock ? rs.MONO_BLOCK_THRESHOLD : Number.MAX_SAFE_INTEGER;
  if (monoShareMilli > monoLimit) {
    err(
      issues,
      'BOT_MONO_BLOCKED',
      `a single combat type holds ${(monoShareMilli / 10).toFixed(1)}% of combat tiles, above the ` +
        `${rs.MONO_BLOCK_THRESHOLD / 10}% ceiling`,
      'triangles',
    );
  } else if (monoShareMilli > rs.MONO_WARN_THRESHOLD) {
    warn(
      issues,
      'BOT_MONO_WARNING',
      `a single combat type holds ${(monoShareMilli / 10).toFixed(1)}% of combat tiles: this bot is ` +
        `almost pure-bred and will be very brittle (no diversity resonance)`,
      'triangles',
    );
  }

  // ---- diversity preview ------------------------------------------------
  const diversityTypes = countDiversityTypes(def, byKey);
  if (diversityTypes.max === 1 && combat > 6) {
    warn(
      issues,
      'BOT_NO_RESONANCE',
      'no tile reaches even two distinct combat types in its one-ring: the whole body runs at +0% HP',
      'triangles',
    );
  }
  // ---- brain ------------------------------------------------------------
  if (!def.brain || typeof def.brain !== 'object') {
    err(issues, 'BOT_NO_BRAIN', 'brain is required', 'brain');
  } else {
    const b = validateBrain(def.brain, rs);
    issues.push(...b.issues);
  }

  // Contract: `stats` is non-null if and only if the bot is buildable. Handing
  // out a full stat line for a bot that was just rejected invites a caller to
  // treat those numbers as real (a rejected Core-on-Motor bot still has a
  // perfectly computable load factor, for instance).
  const invalid = issues.some((i) => i.severity === 'error');
  return { issues, stats: invalid ? null : stats, geometry };
}

export interface DiversitySummary {
  max: number;
  histogram: Record<string, number>;
}

/** How many distinct combat types each tile sees in its one-ring. */
export function countDiversityTypes(def: BotDefinition, byKey?: Map<string, number>): DiversitySummary {
  const index = byKey ?? new Map<string, number>();
  if (!byKey) {
    for (let i = 0; i < def.triangles.length; i++) {
      const t = def.triangles[i]!;
      index.set(cellKey(t.r, t.j, t.o), i);
    }
  }
  const histogram: Record<string, number> = { '0': 0, '1': 0, '2': 0, '3': 0 };
  let max = 0;
  for (let i = 0; i < def.triangles.length; i++) {
    const t = def.triangles[i]!;
    const types = new Set<TriType>();
    if (t.type !== 'motor') types.add(t.type);
    for (const nb of triNeighbors(t.r, t.j, t.o)) {
      const ni = index.get(cellKey(nb.r, nb.j, nb.o));
      if (ni === undefined) continue;
      const nt = def.triangles[ni]!.type;
      if (nt !== 'motor') types.add(nt);
    }
    const n = types.size;
    histogram[String(n)] = (histogram[String(n)] ?? 0) + 1;
    if (n > max) max = n;
  }
  return { max, histogram };
}
