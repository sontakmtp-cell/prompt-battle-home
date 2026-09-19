# PROMPT CHIEN — notes (index)

Deterministic geometry battler: two bots of triangles on a triangular lattice, driven by
a tiny fixed Brain instruction set, fight with no human input. TS + pnpm workspace,
Node 22, `tsc -b` project refs, NodeNext ESM, `node:test`. Packages: `contracts`
(`ruleset.ts` = **single source of truth for every constant**), `core` (engine, geometry,
brain interpreter, replay, sandbox, validation, balance harness, sample bots), `cli`.

**Deeper notes live in `.workbuddy-ai/memory/REFERENCE.md`** — web-lab wiring, security
invariants, the Docker determinism recipe, design facts, known debt. Read it before
touching the engine, the CLI or the frontend.

## Commands
```
npx --yes pnpm@9 -r build
node --test "packages/core/dist/test/*.test.js" "packages/cli/dist/test/*.test.js"
node packages/cli/dist/src/index.js <bots|validate|simulate|replay|hash100|balance>
```
Test globs **must stay quoted** — the bare dir form fails on Windows.
`bots/*.json` are GENERATED from `core/src/bots/samples.ts` (character grids
`H`/`S`/`P`/`M`). Never hand-edit the JSON.

## Launchers (root, 2026-09-19)
`START.bat` — double-click → build engine + Vite dev + opens http://127.0.0.1:3000.
Args `app` (default) | `test` | `cli` | `build`; `TEST.bat` / `CLI.bat` wrap it.
**ASCII-only + CRLF on purpose** — a UTF-8 `.bat` only renders right after
`chcp 65001`, which is flaky in cmd. `cmd.exe` is blocked from the Bash and PowerShell
tools here, so `.bat` files **cannot be test-run** — verify the npm commands instead.

## Hard rules (breach = contract breach)
1. **Integer-only fixed point.** No `Math.sin/cos/sqrt/random`, no `Date.now`, no
   wall-clock in core — one float on the damage path makes every hit `0`. `isqrt`
   bit-by-bit, directions from the frozen `ROT64`, PRNG `mulberry32`.
2. **Damage** = `floor(base × RPS × impact × orient ÷ 1e9)`, each multiplier an integer
   in 1/1000. Hammer→Scissor perfect must be exactly **48**.
3. **RPS invariant is blocking**: weakest advantage hit (14) > strongest disadvantage (12).
4. **`effectiveLoadMilli = max(current, lockedLoadMilli)`** — the `max()` law is what
   forbids a damaged bot from ever speeding up. Never relax it.
5. **Per-defender cooldown**: one hit per defending triangle per `HIT_COOLDOWN_TICKS`
   (12; check 12 allows 10-12).
6. **The engine never touches DB, network or UI.**

## Standing conventions
- **Zero observations ⇒ `'info'`, never `'pass'`** in every balance verdict.
- Prove a test guards anything with a **mutation test** (re-introduce the bug — it must
  fail), then restore the file byte-identically.
- **After any code change, re-check the numbers quoted in the acceptance docs** —
  `m1-report.md` drifted twice in one day.
- `reports/*` is gitignored except `m1-report.md` and `proposal-*.md`.

## Baseline (2026-09-19)
Build + the two quoted test globs → **125 tests, 0 fail**. Frontend `npm test` (tsx):
sha256 · replay · art · render · lab all pass. The 5 sample-bot hashes and the `hash100`
digest `3bebc8f4…19832` must stay unchanged — the security fix changed **when** we hash,
never **what**.
