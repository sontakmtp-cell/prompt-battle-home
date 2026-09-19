import type {
  BotDefinition,
  Ruleset,
  ValidationIssue,
  ValidationReport,
} from '@promptchien/contracts';
import { ENGINE_VERSION } from '@promptchien/contracts';
import { hashDefinition } from '../replay/hash.js';
import { checkDefinition, type ValidateOptions } from '../geometry/validator.js';
import { runSandbox } from '../sandbox/run.js';

export interface ValidateBotOptions extends ValidateOptions {
  /** skip the sandbox run (structure-only validation) */
  skipSandbox?: boolean;
}

/**
 * Sentinel `botHash` returned when a definition is too broken to be normalised
 * and hashed.
 *
 * `ValidationReport.botHash` is typed as a non-nullable `string`
 * (contracts/types.ts), and `validateBot` must never throw for structurally
 * broken input, so we cannot return `null` here. Instead we return 64 hex zeros:
 * a value that is recognisable as "not a real hash" and that can never collide
 * with a genuine sha256 digest of a valid bot (the chance is 2^-256).
 */
export const UNHASHABLE_BOT_HASH = '0'.repeat(64);

/**
 * Structural safety caps for the bounded walk in `validateBot`.
 *
 * A legitimate definition is tiny: at most `MAX_TRIANGLES` (60) tiles of four
 * primitives plus a brain of at most `BRAIN_MAX_NODES` (256) nodes, i.e. well
 * under 2000 raw JSON nodes, and a raw nesting depth of roughly 40 even for a
 * maximum-depth (16) condition tree. These caps sit far above anything
 * legitimate while still being bounded, so a hostile definition cannot make us
 * recurse (stack overflow) or walk forever before the schema checks even run.
 */
const MAX_STRUCTURAL_DEPTH = 128;
const MAX_STRUCTURAL_NODES = 100_000;

interface StructureGuard {
  ok: boolean;
  issues: ValidationIssue[];
}

/**
 * Bounded, ITERATIVE (explicit stack, no recursion) walk over the raw input.
 *
 * It counts every array/object node and tracks the deepest nesting level, and
 * fails as soon as either cap is exceeded — without descending any further — so
 * a pathologically deep or wide value can never blow the stack here. A cycle
 * (which JSON cannot produce, but a caller could) is also stopped by the node
 * cap rather than looping forever.
 */
function guardStructure(def: unknown): StructureGuard {
  const stack: Array<{ value: unknown; depth: number }> = [{ value: def, depth: 1 }];
  let nodes = 0;
  while (stack.length > 0) {
    const { value, depth } = stack.pop()!;
    nodes += 1;
    if (nodes > MAX_STRUCTURAL_NODES) {
      return {
        ok: false,
        issues: [
          {
            code: 'BOT_TOO_LARGE',
            severity: 'error',
            message: `definition has more than ${MAX_STRUCTURAL_NODES} nodes; refusing to hash or validate it`,
          },
        ],
      };
    }
    if (depth > MAX_STRUCTURAL_DEPTH) {
      return {
        ok: false,
        issues: [
          {
            code: 'BOT_TOO_DEEP',
            severity: 'error',
            message: `definition nests deeper than ${MAX_STRUCTURAL_DEPTH} levels; refusing to hash or validate it`,
          },
        ],
      };
    }
    if (Array.isArray(value)) {
      for (const child of value) stack.push({ value: child, depth: depth + 1 });
    } else if (typeof value === 'object' && value !== null) {
      const obj = value as Record<string, unknown>;
      for (const key of Object.keys(obj)) stack.push({ value: obj[key], depth: depth + 1 });
    }
  }
  return { ok: true, issues: [] };
}

/**
 * True when `normaliseDefinition` / `canonicalJson` can run on this value
 * without throwing. This mirrors exactly what `normaliseDefinition` dereferences:
 * a non-null object with an array `triangles` whose elements are objects, and an
 * object `brain`. Anything else is left to the schema check to report as a normal
 * validation issue; we just must not hand it to the hasher.
 */
function isHashable(def: unknown): def is BotDefinition {
  if (typeof def !== 'object' || def === null) return false;
  const d = def as Partial<BotDefinition>;
  if (!Array.isArray(d.triangles)) return false;
  for (const t of d.triangles) {
    if (typeof t !== 'object' || t === null) return false;
  }
  if (typeof d.brain !== 'object' || d.brain === null) return false;
  return true;
}

/**
 * Full validation pipeline (gameplay.md 4):
 * schema -> geometry -> brain -> sandbox.
 * The report is bound to the exact package hash and ruleset version, so editing
 * the bot invalidates it.
 *
 * Order matters for safety: the bounded structural walk runs FIRST, before any
 * recursive code (hashing, schema, brain) is allowed to touch the input. Only
 * once the shape is known to be safe do we compute a real hash, and only when
 * the definition is actually normalisable; otherwise we fall back to
 * `UNHASHABLE_BOT_HASH` and add a `BOT_UNHASHABLE` error. This guarantees the
 * function always returns a well-formed report and never throws, even for a
 * hostile payload, and that `ok: true` can never accompany the sentinel hash.
 */
export function validateBot(
  def: BotDefinition,
  rs: Ruleset,
  opts: ValidateBotOptions = {},
): ValidationReport {
  // 1. Structural safety first — no hashing, no recursion before this passes.
  const guard = guardStructure(def);
  if (!guard.ok) {
    return {
      botHash: UNHASHABLE_BOT_HASH,
      engineVersion: ENGINE_VERSION,
      rulesetVersion: rs.version,
      ok: false,
      issues: guard.issues,
      stats: null,
      sandbox: null,
    };
  }

  // 2. Hash, but treat the hash as a value-level check too. `canonicalJson`
  //    refuses numbers that are non-integer or non-finite, and values it cannot
  //    serialise at all (e.g. `undefined` inside an array) — and a bot is
  //    integer-only by contract, so anything the canonicaliser rejects is an
  //    invalid bot. We record that as a normal error issue rather than swallowing
  //    it, which also guarantees the report can never read `ok: true` alongside
  //    the sentinel hash.
  let botHash = UNHASHABLE_BOT_HASH;
  const issues: ValidationIssue[] = [];
  if (isHashable(def)) {
    try {
      // Narrow, last-resort guard: ONLY the hash call is wrapped. Everything
      // else (schema, geometry, brain, sandbox) runs outside it. `canonicalJson`
      // is the single source of truth for "is this serialisable"; if it refuses,
      // the definition is invalid, not merely unhashable.
      botHash = hashDefinition(def);
    } catch {
      issues.push({
        code: 'BOT_UNHASHABLE',
        severity: 'error',
        message:
          'definition cannot be normalised for hashing: it contains a non-integer or non-finite ' +
          'number, or an unsupported value (the engine is integer-only)',
        path: 'brain',
      });
    }
  } else {
    issues.push({
      code: 'BOT_UNHASHABLE',
      severity: 'error',
      message:
        'definition cannot be normalised for hashing: its structure is not a valid bot definition',
      path: 'brain',
    });
  }

  const check = checkDefinition(def, rs, opts);
  issues.push(...check.issues);
  const hasError = issues.some((i) => i.severity === 'error');

  let sandbox: ValidationReport['sandbox'] = null;
  if (!hasError && !opts.skipSandbox) {
    sandbox = runSandbox(def, rs);
    if (!sandbox.passed) {
      const bad = sandbox.positions.filter((p) => !p.passed);
      issues.push({
        code: 'SANDBOX_FAILED',
        severity: 'error',
        message:
          `sandbox failed in ${bad.length}/${sandbox.positions.length} placements: ` +
          bad
            .slice(0, 3)
            .map((p) => `#${p.seed} ${p.failure}`)
            .join('; '),
        path: 'brain',
      });
    }
  }

  return {
    botHash,
    engineVersion: ENGINE_VERSION,
    rulesetVersion: rs.version,
    ok: !issues.some((i) => i.severity === 'error'),
    issues,
    stats: check.stats,
    sandbox,
  };
}
