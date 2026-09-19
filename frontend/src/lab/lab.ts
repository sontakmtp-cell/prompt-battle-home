import type {
  BotDefinition,
  BotPackage,
  Replay,
  Ruleset,
  ValidationReport,
} from '@promptchien/contracts';
import {
  BOT_SCHEMA_VERSION,
  BRAIN_API_VERSION,
  DEFAULT_RULESET,
  createRuleset,
} from '@promptchien/contracts';
import { lockBot, simulate, validateBot } from '@promptchien/core';
import { labStore, type LockedVersion, type QueueEntry, type StoredMatch } from './store.js';

/**
 * The lab service: the only place the UI talks to the engine.
 *
 * Everything the screens need goes through here, so no component ever has to
 * know whether a number came from the engine or from a mock. The engine itself
 * is imported from the built `packages/core` output - the same code the CLI and
 * the test suite run.
 */

export const ruleset: Ruleset = createRuleset();

export interface RunOutcome {
  match: StoredMatch;
  replay: Replay;
  /** null when the match was run from two loose definitions rather than locked versions */
  versionA: LockedVersion | null;
  versionB: LockedVersion | null;
}

/** Full validation pipeline: schema -> geometry -> brain -> sandbox. */
export function validate(
  def: BotDefinition,
  opts: { skipSandbox?: boolean; monoBlock?: boolean } = {},
): ValidationReport {
  return validateBot(def, ruleset, opts);
}

/** Freeze a validated definition into an immutable package. */
export function lock(def: BotDefinition, revision = 1): BotPackage {
  return lockBot(def, ruleset, revision);
}

/** Validate then lock, in the order gameplay.md 4 requires. */
export function validateAndLock(
  draftId: string,
  def: BotDefinition,
  opts: { monoBlock?: boolean } = {},
): { report: ValidationReport; version: LockedVersion | null } {
  const report = validate(def, opts);
  if (!report.ok) return { report, version: null };
  const draft = labStore.getState().drafts[draftId];
  const revision = draft ? draft.nextRevision : 1;
  const version = labStore.lockVersion(draftId, lock(def, revision), report);
  return { report, version };
}

/**
 * Run one match between two locked versions.
 *
 * The seed is the queue ordinal, not a clock: gameplay.md 6.1 promises a replay
 * can be reproduced exactly, and a wall-clock seed would make that impossible to
 * check later.
 */
export function runMatch(
  versionA: LockedVersion,
  versionB: LockedVersion,
  seed: number,
): RunOutcome {
  const pkgA = lock(versionA.definition, versionA.revision);
  const pkgB = lock(versionB.definition, versionB.revision);
  const sim = simulate(pkgA, pkgB, { seed, ruleset, recordReplay: true });

  const match: StoredMatch = {
    matchId: sim.result.matchId,
    ordinal: labStore.getState().nextOrdinal,
    seed,
    a: {
      name: versionA.definition.name,
      hash: versionA.definitionHash,
      definition: versionA.definition,
      versionKey: versionA.key,
    },
    b: {
      name: versionB.definition.name,
      hash: versionB.definitionHash,
      definition: versionB.definition,
      versionKey: versionB.key,
    },
    outcome: sim.result.outcome,
    replayHash: sim.result.replayHash,
  };
  labStore.recordMatch(match);
  return { match, replay: sim.replay, versionA, versionB };
}

/**
 * One step of the local FIFO matchmaker: pair the two oldest waiting bots and
 * fight them. Returns null while fewer than two distinct bots are waiting.
 */
export function runNextQueuedMatch(): RunOutcome | null {
  const pair = labStore.takeNextPair();
  if (!pair) return null;
  const [entryA, entryB] = pair as [QueueEntry, QueueEntry];
  const versionA = labStore.getVersion(entryA.versionKey);
  const versionB = labStore.getVersion(entryB.versionKey);
  if (!versionA || !versionB) return null;

  const seed = Math.max(entryA.ordinal, entryB.ordinal);
  const outcome = runMatch(versionA, versionB, seed);
  labStore.markMatched([entryA.id, entryB.id], outcome.match.matchId);
  return outcome;
}

/**
 * Run a one-off match between two loose definitions, without locking them or
 * touching the queue. This is what the editor's "test this" button uses: the bot
 * under construction is usually not worth freezing into a revision yet.
 */
export function runAdHoc(defA: BotDefinition, defB: BotDefinition, seed: number): RunOutcome {
  const pkgA = lock(defA, 0);
  const pkgB = lock(defB, 0);
  const sim = simulate(pkgA, pkgB, { seed, ruleset, recordReplay: true });
  const match: StoredMatch = {
    matchId: sim.result.matchId,
    ordinal: labStore.getState().nextOrdinal,
    seed,
    a: { name: defA.name, hash: pkgA.definitionHash, definition: defA, versionKey: 'adhoc' },
    b: { name: defB.name, hash: pkgB.definitionHash, definition: defB, versionKey: 'adhoc' },
    outcome: sim.result.outcome,
    replayHash: sim.result.replayHash,
  };
  return { match, replay: sim.replay, versionA: null, versionB: null };
}

// ---------------------------------------------------------------------------
// Editor helpers
// ---------------------------------------------------------------------------

/** An empty, valid-as-far-as-it-goes bot: one tile, Core on it. */
export function blankBot(name = 'New Bot'): BotDefinition {
  return {
    schemaVersion: BOT_SCHEMA_VERSION,
    name,
    triangles: [{ r: 0, j: 0, o: 'down', type: 'hammer' }],
    coreIndex: 0,
    brain: { version: BRAIN_API_VERSION, rules: [{ move: 'forward', rotate: 'toEnemy' }] },
  };
}

/** Deep copy, so the editor never mutates a stored draft in place. */
export function cloneDefinition(def: BotDefinition): BotDefinition {
  return {
    schemaVersion: def.schemaVersion,
    name: def.name,
    triangles: def.triangles.map((t) => ({ r: t.r, j: t.j, o: t.o, type: t.type })),
    coreIndex: def.coreIndex,
    brain: {
      version: def.brain.version,
      rules: def.brain.rules.map((r) => ({ ...r })),
    },
  };
}

export { DEFAULT_RULESET };
