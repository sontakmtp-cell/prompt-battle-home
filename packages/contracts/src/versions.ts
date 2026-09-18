/**
 * Independent version axes (PLAN.md section 2, "Hop dong du lieu va replay").
 * Engine, ruleset, bot schema, Brain API, replay and MCP API each carry their own
 * version so an old match can always be replayed with the data it was produced by.
 */
export const ENGINE_VERSION = '0.1.0-m1';
export const RULESET_VERSION = '1.0.0';
export const BOT_SCHEMA_VERSION = 1;
export const BRAIN_API_VERSION = 1;
export const REPLAY_VERSION = 1;
export const MCP_API_VERSION = '2026-07-28';

/** Canonical serialisation order for hashing bot definitions. */
export const CANONICAL_FIELD_ORDER = [
  'schemaVersion',
  'name',
  'triangles',
  'coreIndex',
  'brain',
] as const;
