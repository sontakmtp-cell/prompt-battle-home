/**
 * End-to-end check of the M2 lab pipeline, without a browser.
 *
 * PLAN.md M2's gate is that someone who does not write code can go
 * create -> validate -> simulate -> edit -> submit -> watch, entirely locally.
 * This exercises every step of that loop through the same modules the UI calls:
 *
 *   store.ts    drafts, versions, the FIFO queue, stored matches
 *   lab.ts      validate / lock / simulate / matchmake
 *   replay.ts   turning a replay back into a picture
 *   BotEditor   the lattice <-> definition round trip
 *
 * Run: npx tsx frontend/test/lab.test.ts
 */
import type { BotDefinition } from '@promptchien/contracts';
import { BOT_SCHEMA_VERSION, BRAIN_API_VERSION } from '@promptchien/contracts';
import { SAMPLE_BOTS } from '@promptchien/core';
import { labStore } from '../src/lab/store.js';
import {
  blankBot,
  cloneDefinition,
  runAdHoc,
  runNextQueuedMatch,
  ruleset,
  validate,
  validateAndLock,
} from '../src/lab/lab.js';
import { ReplayView } from '../src/lab/replay.js';
import { definitionToGrid, gridToDefinition } from '../src/components/BotEditor.js';

let failures = 0;
const ok = (m: string) => console.log(`  ok   ${m}`);
const bad = (m: string) => {
  failures++;
  console.log(`  FAIL ${m}`);
};

const [spear, shield, flanker] = SAMPLE_BOTS;

console.log('M2 lab pipeline');
labStore.clearAll();

// ---------------------------------------------------------------------------
// 1. drafts and versions
// ---------------------------------------------------------------------------
{
  const d = labStore.createDraft(cloneDefinition(spear!));
  if (labStore.getState().drafts[d.id]) ok('draft created');
  else bad('draft not stored');

  const edited = cloneDefinition(spear!);
  edited.name = 'Spear mk2';
  labStore.updateDraft(d.id, edited);
  if (labStore.getState().drafts[d.id]!.definition.name === 'Spear mk2') ok('draft edited');
  else bad('draft edit lost');

  const r = validateAndLock(d.id, edited);
  if (r.report.ok && r.version) ok('validated and locked into revision 1');
  else bad(`validateAndLock failed: ${JSON.stringify(r.report.issues)}`);

  const after = labStore.getState().drafts[d.id]!;
  if (after.nextRevision === 2 && after.versionKeys.length === 1) ok('revision counter advanced, history kept');
  else bad('revision bookkeeping wrong');
}

// ---------------------------------------------------------------------------
// 2. validation refuses what it should
// ---------------------------------------------------------------------------
{
  // Core on a motor is the classic illegal build (can_bang.md 6.6).
  const motorCore: BotDefinition = {
    schemaVersion: BOT_SCHEMA_VERSION,
    name: 'MotorCore',
    triangles: [
      { r: 0, j: 0, o: 'down', type: 'motor' },
      { r: 0, j: 0, o: 'up', type: 'motor' },
      { r: 1, j: 0, o: 'down', type: 'hammer' },
      { r: 1, j: 0, o: 'up', type: 'hammer' },
    ],
    coreIndex: 0,
    brain: { version: BRAIN_API_VERSION, rules: [{ move: 'forward', rotate: 'toEnemy' }] },
  };
  const r = validate(motorCore);
  if (!r.ok && r.issues.some((i) => i.code === 'CORE_ON_MOTOR')) ok('Core on a motor is rejected');
  else bad('Core on a motor was accepted');

  // Over budget: 31 rhombi is 62 triangles, past the 60 cap.
  const grid = Array.from({ length: 31 }, (_, i) => ({ r: Math.floor(i / 6), j: i % 6, o: 'down' as const, type: 'hammer' as const }));
  const fat: BotDefinition = {
    schemaVersion: BOT_SCHEMA_VERSION,
    name: 'Fat',
    triangles: grid.flatMap((t) => [t, { ...t, o: 'up' as const }]),
    coreIndex: 0,
    brain: { version: BRAIN_API_VERSION, rules: [{ move: 'forward', rotate: 'toEnemy' }] },
  };
  const r2 = validate(fat);
  if (!r2.ok && r2.issues.some((i) => i.code === 'BOT_OVER_BUDGET')) ok('over-budget body is rejected');
  else bad('over-budget body was accepted');

  // A valid lock must not be created for an invalid bot.
  const d = labStore.createDraft(motorCore);
  const r3 = validateAndLock(d.id, motorCore);
  if (!r3.report.ok && r3.version === null) ok('an invalid bot is never locked into a version');
  else bad('an invalid bot produced a locked version');

  // The empty draft is not silently valid either.
  const empty = blankBot('Empty');
  empty.triangles = [];
  if (!validate(empty).ok) ok('an empty body is rejected');
  else bad('an empty body was accepted');
}

// ---------------------------------------------------------------------------
// 3. the editor's lattice round trip
// ---------------------------------------------------------------------------
{
  let roundTripped = 0;
  for (const bot of SAMPLE_BOTS) {
    const { grid, coreR, coreJ } = definitionToGrid(bot);
    if (coreR < 0 || coreJ < 0) {
      bad(`${bot.name}: Core position lost when loading into the editor`);
      continue;
    }
    const back = gridToDefinition(grid, coreR, coreJ, bot.name, bot.brain);
    const same =
      back.triangles.length === bot.triangles.length &&
      back.coreIndex === bot.coreIndex &&
      back.triangles.every(
        (t, i) =>
          t.r === bot.triangles[i]!.r &&
          t.j === bot.triangles[i]!.j &&
          t.o === bot.triangles[i]!.o &&
          t.type === bot.triangles[i]!.type,
      );
    if (same) roundTripped++;
    else bad(`${bot.name}: editor round trip changed the body`);
  }
  if (roundTripped === SAMPLE_BOTS.length) ok(`all ${roundTripped} sample bots survive the editor round trip`);
}

// ---------------------------------------------------------------------------
// 4. an ad-hoc test match
// ---------------------------------------------------------------------------
{
  const o = runAdHoc(cloneDefinition(spear!), cloneDefinition(flanker!), 5);
  if (o.replay.frames.length > 0 && o.replay.checkpoints.length > 0) ok('ad-hoc match produced a replay');
  else bad('ad-hoc match produced an empty replay');
  if (o.replay.manifest.totalTicks > 0) ok(`match ran ${o.replay.manifest.totalTicks} ticks`);
  else bad('match ran zero ticks');

  const v = new ReplayView(o.replay, o.match.a.definition, o.match.b.definition, ruleset);
  const mid = v.frameAt(Math.floor(v.totalTicks / 2));
  if (mid.a.tiles.length > 0 && mid.b.tiles.length > 0) ok('replay renders at mid-match');
  else bad('replay failed to render');
}

// ---------------------------------------------------------------------------
// 5. the FIFO queue pairs two different bots
// ---------------------------------------------------------------------------
{
  labStore.clearAll();
  const dA = labStore.createDraft(cloneDefinition(spear!));
  const dB = labStore.createDraft(cloneDefinition(shield!));
  const rA = validateAndLock(dA.id, cloneDefinition(spear!));
  const rB = validateAndLock(dB.id, cloneDefinition(shield!));
  if (!rA.version || !rB.version) {
    bad('could not lock the two queue bots');
  } else {
    labStore.enqueue(rA.version);
    labStore.enqueue(rB.version);
    if (labStore.getState().queue.filter((q) => q.status === 'waiting').length === 2) ok('two bots waiting in the queue');
    else bad('queue did not hold both bots');

    const match = runNextQueuedMatch();
    if (match) ok('queue produced a match');
    else bad('queue produced no match');

    const waiting = labStore.getState().queue.filter((q) => q.status === 'waiting').length;
    if (waiting === 0) ok('both queue entries marked matched');
    else bad(`${waiting} queue entries left waiting after a match`);

    if (match && match.match.a.hash !== match.match.b.hash) ok('the pair was two different bots');
    else bad('the queue paired a bot with itself');

    if (labStore.getState().matches.length === 1) ok('match recorded in the local store');
    else bad('match was not recorded');
  }

  // A single bot alone must not be matched.
  labStore.clearAll();
  const dC = labStore.createDraft(cloneDefinition(spear!));
  const rC = validateAndLock(dC.id, cloneDefinition(spear!));
  if (rC.version) {
    labStore.enqueue(rC.version);
    if (runNextQueuedMatch() === null) ok('one bot alone is not matched');
    else bad('a single bot was matched against something');
  }

  // Two identical bots must not be matched either - the queue wants two players.
  labStore.enqueue(rC.version!);
  if (runNextQueuedMatch() === null) ok('two copies of the same bot are not matched');
  else bad('the queue paired a bot with an identical copy of itself');
}

// ---------------------------------------------------------------------------
// 6. the stored replay reproduces exactly
// ---------------------------------------------------------------------------
{
  labStore.clearAll();
  const a = cloneDefinition(spear!);
  const b = cloneDefinition(flanker!);
  const first = runAdHoc(a, b, 42);
  const second = runAdHoc(a, b, 42);
  if (first.match.replayHash === second.match.replayHash) ok('same bots + same seed => same replay hash through the lab');
  else bad('the lab path is not deterministic');

  const third = runAdHoc(a, b, 43);
  if (third.match.replayHash !== first.match.replayHash) ok('a different seed gives a different match');
  else bad('the seed made no difference');
}

console.log(failures === 0 ? '\nall lab checks passed' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
