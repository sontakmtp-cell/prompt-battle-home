import type { BotDefinition, Ruleset, ValidationReport } from '@promptchien/contracts';
import { ENGINE_VERSION } from '@promptchien/contracts';
import { hashDefinition } from '../replay/hash.js';
import { checkDefinition, type ValidateOptions } from '../geometry/validator.js';
import { runSandbox } from '../sandbox/run.js';

export interface ValidateBotOptions extends ValidateOptions {
  /** skip the sandbox run (structure-only validation) */
  skipSandbox?: boolean;
}

/**
 * Full validation pipeline (gameplay.md 4):
 * schema -> geometry -> brain -> sandbox.
 * The report is bound to the exact package hash and ruleset version, so editing
 * the bot invalidates it.
 */
export function validateBot(
  def: BotDefinition,
  rs: Ruleset,
  opts: ValidateBotOptions = {},
): ValidationReport {
  const botHash = hashDefinition(def);
  const check = checkDefinition(def, rs, opts);
  const issues = [...check.issues];
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
