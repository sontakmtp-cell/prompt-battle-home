import type { BotDefinition, BotPackage, Ruleset } from '@promptchien/contracts';
import { ENGINE_VERSION, loadFactorMilli } from '@promptchien/contracts';
import { hashDefinition } from '../replay/hash.js';

/**
 * Freeze a bot into an immutable package (gameplay.md 4.3).
 * Any later edit must produce a new revision: the hash is what a validation
 * report, a submission and a replay all point at.
 */
export function lockBot(def: BotDefinition, rs: Ruleset, revision = 1): BotPackage {
  const hash = hashDefinition(def);
  let motors = 0;
  for (const t of def.triangles) if (t.type === 'motor') motors++;
  return {
    packageId: `bot-${hash.slice(0, 12)}-r${revision}`,
    definition: def,
    definitionHash: hash,
    engineVersion: ENGINE_VERSION,
    rulesetVersion: rs.version,
    lockedLoadMilli: loadFactorMilli(rs, def.triangles.length, motors),
    revision,
  };
}
