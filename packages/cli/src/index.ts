#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import type { BotDefinition, Replay } from '@promptchien/contracts';
import { DEFAULT_RULESET, ENGINE_VERSION, RULESET_VERSION, canonicalJson } from '@promptchien/contracts';
import {
  SAMPLE_BOTS,
  hashDefinition,
  lockBot,
  runBalanceSuite,
  sha256Hex,
  simulate,
  validateBot,
  verifyReplay,
} from '@promptchien/core';
import { safeProjectPath } from './paths.js';

const ROOT = resolve(process.cwd());

function arg(name: string, fallback: string | null = null): string | null {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1]!;
  return fallback;
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function loadBot(path: string): BotDefinition {
  const abs = safeProjectPath(ROOT, path);
  const raw = readFileSync(abs, 'utf8');
  return JSON.parse(raw) as BotDefinition;
}

function writeOut(rel: string, content: string): string {
  const abs = safeProjectPath(ROOT, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content, 'utf8');
  return abs;
}

function fmtIssues(issues: Array<{ severity: string; code: string; message: string }>): string {
  if (issues.length === 0) return '  (no issues)';
  return issues
    .map((i) => `  [${i.severity.toUpperCase()}] ${i.code}: ${i.message}`)
    .join('\n');
}

// ---------------------------------------------------------------------------

function cmdBots(): void {
  for (const def of SAMPLE_BOTS) {
    const path = writeOut(`bots/${def.name}.json`, JSON.stringify(def, null, 2) + '\n');
    console.log(`wrote ${path.replace(ROOT + '\\', '').replace(ROOT + '/', '')} (hash ${hashDefinition(def).slice(0, 12)})`);
  }
}

function cmdValidate(path: string): void {
  const def = loadBot(path);
  const report = validateBot(def, DEFAULT_RULESET, { monoBlock: flag('mono-block') });
  console.log(`bot      : ${def.name}`);
  console.log(`hash     : ${report.botHash}`);
  console.log(`engine   : ${report.engineVersion}  ruleset ${report.rulesetVersion}`);
  if (report.stats) {
    const s = report.stats;
    console.log(
      `body     : ${s.triangles} tiles (${s.hammer}H/${s.scissor}S/${s.paper}P/${s.motors}M), ` +
        `load ${(s.loadMilli / 1000).toFixed(3)} -> ${s.speedMultiplierMilli / 10}% speed, ` +
        `span ${(s.spanXMilli / 1000).toFixed(2)}x${(s.spanYMilli / 1000).toFixed(2)}, core on ${s.coreType}`,
    );
  }
  if (report.sandbox) {
    console.log(
      `sandbox  : ${report.sandbox.passed ? 'PASS' : 'FAIL'} ` +
        `(${report.sandbox.positions.filter((p) => p.passed).length}/${report.sandbox.positions.length} placements)`,
    );
    for (const p of report.sandbox.positions) {
      console.log(
        `  #${p.seed}: moved ${(p.movedMilli / 1000).toFixed(1)}u, min dist ${(p.minDistanceMilli / 1000).toFixed(1)}u, ` +
          `contact ${p.contactTicks} ticks, damage ${p.damageDealt}` +
          (p.failure ? `  <-- ${p.failure}` : ''),
      );
    }
  }
  console.log(`issues   :`);
  console.log(fmtIssues(report.issues));
  console.log(`verdict  : ${report.ok ? 'VALID' : 'INVALID'}`);
  process.exitCode = report.ok ? 0 : 1;
}

function cmdSimulate(aPath: string, bPath: string): void {
  const a = loadBot(aPath);
  const b = loadBot(bPath);
  const seed = Number(arg('seed', '1'));
  const rs = DEFAULT_RULESET;
  const pa = lockBot(a, rs);
  const pb = lockBot(b, rs);
  const started = process.hrtime.bigint();
  const { result, replay, digest } = simulate(pa, pb, { seed, ruleset: rs, recordReplay: true });
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

  console.log(`engine   : ${ENGINE_VERSION}  ruleset ${RULESET_VERSION}  seed ${seed}`);
  console.log(`A        : ${result.botA.name} ${result.botA.hash.slice(0, 12)}  ${describeBot(result.statsA)}`);
  console.log(`B        : ${result.botB.name} ${result.botB.hash.slice(0, 12)}  ${describeBot(result.statsB)}`);
  console.log(
    `result   : ${result.outcome.winner === 'draw' ? 'DRAW' : result.outcome.winner + ' wins'} ` +
      `by ${result.outcome.reason} at tick ${result.outcome.ticks} ` +
      `(${(result.outcome.ticks / rs.TICK_RATE).toFixed(1)}s)`,
  );
  console.log(`score    : A ${result.outcome.scoreA}  B ${result.outcome.scoreB}  (out of 1000)`);
  console.log(`replay   : ${result.replayHash}`);
  console.log(`digest   : ${digest}`);
  console.log(`events   : ${replay.events.length} (hits ${replay.events.filter((e) => e.kind === 'hit').length})`);
  console.log(`timing   : ${elapsedMs.toFixed(1)} ms`);

  if (flag('json')) {
    console.log(canonicalJson({ result, digest }));
  }
  const saveReplay = arg('save-replay');
  if (saveReplay) {
    const p = writeOut(saveReplay, JSON.stringify({ result, replay }, null, 2));
    console.log(`saved    : ${p}`);
  }
}

function describeBot(s: { triangles: number; motors: number; loadMilli: number; speedMultiplierMilli: number }): string {
  return `${s.triangles} tiles, ${s.motors} motors, load ${(s.loadMilli / 1000).toFixed(2)}, speed ${s.speedMultiplierMilli / 10}%`;
}

function cmdReplay(path: string, aPath: string, bPath: string): void {
  const saved = JSON.parse(readFileSync(safeProjectPath(ROOT, path), 'utf8')) as { replay: Replay };
  const a = loadBot(aPath);
  const b = loadBot(bPath);
  const rs = DEFAULT_RULESET;
  const v = verifyReplay(saved.replay, lockBot(a, rs), lockBot(b, rs), rs);
  console.log(`expected : ${v.expectedHash}`);
  console.log(`actual   : ${v.actualHash}`);
  console.log(`frames   : ${v.framesMatch ? 'match' : 'MISMATCH'}`);
  console.log(`ticks    : ${v.ticksMatch ? 'match' : 'MISMATCH'}`);
  console.log(`outcome  : ${v.outcomeMatch ? 'match' : 'MISMATCH'}`);
  console.log(`verdict  : ${v.ok ? 'VERIFIED' : 'FAILED'}`);
  console.log(v.detail);
  process.exitCode = v.ok ? 0 : 1;
}

function cmdHash100(): void {
  const count = Number(arg('seeds', '100'));
  const rs = DEFAULT_RULESET;
  const parts: string[] = [];
  let matches = 0;
  const started = process.hrtime.bigint();
  for (let i = 0; i < SAMPLE_BOTS.length; i++) {
    const a = SAMPLE_BOTS[i]!;
    const b = SAMPLE_BOTS[(i + 1) % SAMPLE_BOTS.length]!;
    const pa = lockBot(a, rs);
    const pb = lockBot(b, rs);
    const perPair: string[] = [];
    for (let s = 1; s <= count; s++) {
      const { digest } = simulate(pa, pb, { seed: s, ruleset: rs, recordReplay: false });
      perPair.push(digest);
      matches++;
    }
    parts.push(`${a.name}>${b.name}:${sha256Hex(perPair.join(','))}`);
  }
  const combined = sha256Hex(parts.join('\n'));
  const elapsed = Number(process.hrtime.bigint() - started) / 1e6;
  console.log(`seeds    : ${count} per pair x ${SAMPLE_BOTS.length} pairs = ${matches} matches`);
  console.log(`engine   : ${ENGINE_VERSION}  ruleset ${RULESET_VERSION}`);
  for (const p of parts) console.log(`  ${p}`);
  console.log(`DIGEST   : ${combined}`);
  console.log(`timing   : ${(elapsed / 1000).toFixed(2)} s (${(elapsed / matches).toFixed(1)} ms/match)`);
}

function cmdBalance(): void {
  const quick = flag('quick');
  const seeds = Number(arg('seeds', '100'));
  const started = process.hrtime.bigint();
  const report = runBalanceSuite({
    seeds,
    quick,
    onProgress: (label) => process.stderr.write(`  .. ${label}\n`),
  });
  const elapsed = Number(process.hrtime.bigint() - started) / 1e6;

  const lines: string[] = [];
  lines.push('# PROMPT CHIEN - M1 balance measurement report');
  lines.push('');
  lines.push(`Engine \`${ENGINE_VERSION}\`, ruleset \`${RULESET_VERSION}\`, ${report.generatedWith.seeds} seeds per pairing.`);
  lines.push('');
  lines.push('Every number in the ruleset is a starting point, not a truth. This report measures.');
  lines.push('');
  lines.push('## Checks');
  lines.push('');
  lines.push('| # | Check | Criterion | Measured | Verdict |');
  lines.push('|---|---|---|---|---|');
  for (const c of report.checks) {
    const verdict = c.status === 'info' ? 'info' : c.status === 'pass' ? '**PASS**' : '**FAIL**';
    lines.push(`| ${c.id} | ${c.name} | ${c.criterion} | ${c.measured} | ${verdict} |`);
  }
  lines.push('');
  lines.push('## Match duration distribution');
  lines.push('');
  lines.push(
    `p10 ${report.duration.p10.toFixed(1)}s, median ${report.duration.p50.toFixed(1)}s, p90 ${report.duration.p90.toFixed(1)}s ` +
      `over ${report.duration.samples} matches.`,
  );
  lines.push('');
  lines.push('## Matchups');
  lines.push('');
  lines.push('| A | B | A wins | B wins | draws | median |');
  lines.push('|---|---|---|---|---|---|');
  for (const m of report.matchups) {
    lines.push(`| ${m.a} | ${m.b} | ${m.aWins} | ${m.bWins} | ${m.draws} | ${m.medianSeconds.toFixed(1)}s |`);
  }
  lines.push('');
  lines.push('## Findings');
  lines.push('');
  for (const f of report.findings) lines.push(`- ${f}`);
  lines.push('');

  const out = arg('out', 'reports/balance-m1.md')!;
  const path = writeOut(out, lines.join('\n'));
  console.log(lines.join('\n'));
  console.log(`\nwritten to ${path}`);
  console.log(`wall time: ${(elapsed / 1000).toFixed(1)} s`);
}

function usage(): void {
  console.log(`PROMPT CHIEN CLI - engine ${ENGINE_VERSION}, ruleset ${RULESET_VERSION}

  bots                                  write the five reference bots to ./bots/*.json
  validate <bot.json> [--mono-block]    schema + geometry + brain + sandbox
  simulate <a.json> <b.json> [--seed N] [--json] [--save-replay path]
  replay <saved.json> <a.json> <b.json> re-run and verify a saved replay
  hash100 [--seeds N]                   cross-platform determinism digest
  balance [--seeds N] [--quick] [--out reports/balance-m1.md]
`);
}

const cmd = process.argv[2] ?? 'help';

// Top-level safety net: any error raised while running a command is reported as
// a single clean line on stderr, with a non-zero exit code and NO stack trace.
// This covers a rejected path (ProjectPathError) as well as a bot JSON that
// cannot be hashed (e.g. a non-integer coordinate reaching `lockBot`), so the
// user gets a clear reason instead of a raw crash. The core/contracts packages
// deliberately keep throwing — only the CLI's edge is softened here.
try {
  switch (cmd) {
    case 'bots':
      cmdBots();
      break;
    case 'validate': {
      const p = process.argv[3];
      if (!p) throw new Error('validate needs a bot json path');
      cmdValidate(p);
      break;
    }
    case 'simulate': {
      const a = process.argv[3];
      const b = process.argv[4];
      if (!a || !b) throw new Error('simulate needs two bot json paths');
      cmdSimulate(a, b);
      break;
    }
    case 'replay': {
      const p = process.argv[3];
      const a = process.argv[4];
      const b = process.argv[5];
      if (!p || !a || !b) throw new Error('replay needs <saved.json> <a.json> <b.json>');
      cmdReplay(p, a, b);
      break;
    }
    case 'hash100':
      cmdHash100();
      break;
    case 'balance':
      cmdBalance();
      break;
    case 'help':
    default:
      usage();
      if (cmd !== 'help') process.exitCode = 1;
      break;
  }

  if (flag('ensure-dirs') && !existsSync(safeProjectPath(ROOT, 'reports'))) {
    mkdirSync(safeProjectPath(ROOT, 'reports'), { recursive: true });
  }
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`error: ${message}\n`);
  process.exitCode = 1;
}
