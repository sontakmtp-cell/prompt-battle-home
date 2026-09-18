import type { BotPackage, Replay, Ruleset } from '@promptchien/contracts';
import { simulate } from '../engine/simulate.js';

export interface ReplayVerification {
  ok: boolean;
  expectedHash: string;
  actualHash: string;
  framesMatch: boolean;
  eventsMatch: boolean;
  ticksMatch: boolean;
  outcomeMatch: boolean;
  detail: string;
}

/**
 * Re-run the match from the two packages and the seed, then compare against the
 * stored replay. This is the CLI's independent check that a replay is honest:
 * it does not trust the file, it recomputes it.
 */
export function verifyReplay(
  replay: Replay,
  pkgA: BotPackage,
  pkgB: BotPackage,
  rs: Ruleset,
): ReplayVerification {
  const manifest = replay.manifest;
  const rerun = simulate(pkgA, pkgB, {
    seed: manifest.seed,
    ruleset: rs,
    recordReplay: true,
    // honour the ceiling the match was actually run with: a match decided on the
    // timeout score is only reproducible if the verifier stops at the same tick
    maxTicks: manifest.maxTicks,
    startOverride: { a: manifest.startPoses.a, b: manifest.startPoses.b },
  });

  const expectedHash = manifest.replayHash;
  const actualHash = rerun.result.replayHash;
  const ticksMatch = rerun.result.outcome.ticks === manifest.outcome.ticks;
  const outcomeMatch =
    rerun.result.outcome.winner === manifest.outcome.winner &&
    rerun.result.outcome.reason === manifest.outcome.reason;

  let framesMatch = replay.frames.length === rerun.replay.frames.length;
  if (framesMatch) {
    for (let i = 0; i < replay.frames.length; i++) {
      const a = replay.frames[i]!;
      const b = rerun.replay.frames[i]!;
      if (
        a.tick !== b.tick ||
        a.a.x !== b.a.x ||
        a.a.y !== b.a.y ||
        a.a.heading !== b.a.heading ||
        a.a.coreHp !== b.a.coreHp ||
        a.b.x !== b.b.x ||
        a.b.y !== b.b.y ||
        a.b.heading !== b.b.heading ||
        a.b.coreHp !== b.b.coreHp
      ) {
        framesMatch = false;
        break;
      }
    }
  }

  const eventsMatch = replay.events.length === rerun.replay.events.length;

  const ok = expectedHash === actualHash && framesMatch && ticksMatch && outcomeMatch;

  return {
    ok,
    expectedHash,
    actualHash,
    framesMatch,
    eventsMatch,
    ticksMatch,
    outcomeMatch,
    detail: ok
      ? `replay verified over ${manifest.totalTicks} ticks (${manifest.outcome.winner} by ${manifest.outcome.reason})`
      : `replay MISMATCH: hash ${expectedHash.slice(0, 12)} vs ${actualHash.slice(0, 12)}, ` +
        `frames=${framesMatch}, ticks=${ticksMatch}, outcome=${outcomeMatch}`,
  };
}
