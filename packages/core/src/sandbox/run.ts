import type {
  BotDefinition,
  Ruleset,
  SandboxPositionReport,
  SandboxReport,
} from '@promptchien/contracts';
import { ROT64 } from '@promptchien/contracts';
import { isqrt } from '../math/fixed.js';
import { simulate } from '../engine/simulate.js';
import { lockBot } from '../bot/package.js';
import { DUMMY } from '../bots/samples.js';

const SANDBOX_RINGS = [7000, 9000, 11000, 7000, 9000, 11000, 8000, 10000];
const SANDBOX_ANGLES = [0, 8, 16, 24, 32, 40, 48, 56];

export interface SandboxOptions {
  maxTicks?: number;
}

/**
 * Sandbox (gameplay.md 4.2). The candidate is dropped at eight different contact
 * geometries against an immobile punchbag and must show that it can find the
 * enemy, move, close the distance and land real damage.
 *
 * A bot that stands still, or that spends the whole run avoiding contact, fails.
 */
export function runSandbox(
  def: BotDefinition,
  rs: Ruleset,
  opts: SandboxOptions = {},
): SandboxReport {
  const maxTicks = opts.maxTicks ?? 900;
  const candidate = lockBot(def, rs);
  const dummy = lockBot(DUMMY, rs);
  const positions: SandboxPositionReport[] = [];

  for (let i = 0; i < SANDBOX_RINGS.length; i++) {
    const ring = SANDBOX_RINGS[i]!;
    const angle = SANDBOX_ANGLES[i]!;
    const u = ROT64[angle]!;
    const cx = Math.trunc((u[0] * ring) / 1_000_000);
    const cy = Math.trunc((u[1] * ring) / 1_000_000);
    const heading = (angle + 32) & 63;

    const { replay } = simulate(candidate, dummy, {
      seed: 1000 + i,
      ruleset: rs,
      maxTicks,
      startOverride: { a: { x: cx, y: cy, heading }, b: { x: 0, y: 0, heading: 0 } },
    });

    let moved = 0;
    let minDist = Number.MAX_SAFE_INTEGER;
    let prevX = replay.frames[0]?.a.x ?? cx;
    let prevY = replay.frames[0]?.a.y ?? cy;
    for (const f of replay.frames) {
      moved += isqrt((f.a.x - prevX) * (f.a.x - prevX) + (f.a.y - prevY) * (f.a.y - prevY));
      prevX = f.a.x;
      prevY = f.a.y;
      const dx = f.b.x - f.a.x;
      const dy = f.b.y - f.a.y;
      const d = isqrt(dx * dx + dy * dy);
      if (d < minDist) minDist = d;
    }

    let damageDealt = 0;
    let contactTicks = 0;
    const hitTicks = new Set<number>();
    let firstContact: number | null = null;
    for (const ev of replay.events) {
      if (ev.kind !== 'hit') continue;
      if (ev.attackerTeam !== 'A') continue;
      damageDealt += ev.damage;
      hitTicks.add(ev.tick);
      if (firstContact === null || ev.tick < firstContact) firstContact = ev.tick;
    }
    contactTicks = hitTicks.size;

    let failure: string | null = null;
    if (moved < 1000) failure = 'did not move (stands still)';
    else if (contactTicks === 0) failure = 'never made combat contact (avoiding the fight)';
    else if (damageDealt === 0) failure = 'contacted the enemy but dealt no damage';

    positions.push({
      seed: 1000 + i,
      startDistanceMilli: ring,
      minDistanceMilli: minDist === Number.MAX_SAFE_INTEGER ? ring : minDist,
      ticksToContact: firstContact,
      contactTicks,
      movedMilli: moved,
      damageDealt,
      passed: failure === null,
      failure,
    });
  }

  return { passed: positions.every((p) => p.passed), positions };
}
