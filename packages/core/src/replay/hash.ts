import { createHash } from 'node:crypto';
import type { BotDefinition } from '@promptchien/contracts';
import { canonicalJson } from '@promptchien/contracts';

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/** Canonical, order-stable projection of a bot definition for hashing. */
export function normaliseDefinition(def: BotDefinition): unknown {
  return {
    schemaVersion: def.schemaVersion,
    name: def.name,
    triangles: def.triangles.map((t) => ({ r: t.r, j: t.j, o: t.o, type: t.type })),
    coreIndex: def.coreIndex,
    brain: {
      version: def.brain.version,
      rules: def.brain.rules,
    },
  };
}

/**
 * Package hash. Everything after a lock creates a new revision, so this hash is
 * what a replay, a validation report and a submission all agree on.
 */
export function hashDefinition(def: BotDefinition): string {
  return sha256Hex(canonicalJson(normaliseDefinition(def)));
}

/**
 * Replay hash. Computed over the simulation data only: no ids, no wall-clock,
 * no runtime counters. Two runs of the same bots with the same seed must agree.
 */
export function hashSimulationPayload(payload: unknown): string {
  return sha256Hex(canonicalJson(payload));
}
