# PROMPT CHIEN — reference notes

Companion to `MEMORY.md`. Not auto-injected — read it when working on the engine, the
CLI or the frontend.

## Package detail
- `packages/contracts` — `ruleset.ts` (all constants), `brain.ts` (instruction set +
  published field list), `types`, `schema`, `canonical`, `rot64`, `versions`.
- `packages/core` — engine, geometry, brain interpreter, replay, sandbox, validation,
  balance harness, sample bots.
- `packages/cli` — `bots`, `validate`, `simulate`, `replay`, `hash100`, `balance`.
- `bots/*.json` are GENERATED: edit `packages/core/src/bots/samples.ts` (character grids
  `H`/`S`/`P`/`M`, `.` = empty, one char = one rhombus = the down+up tile pair), then
  re-run the CLI `bots` command. Never hand-edit the JSON.

## Design facts
- Lattice is **bipartite by orientation**: every edge neighbour of an `up` tile is a
  `down` tile → "interleave up/down" is structural, not tactical.
- **Motor tiles deal 0 damage** → a bot whose contact face is motors cannot hurt anything
  head-on. This is what made the Spinner sample bot invalid.
- **Impact spans only [850, 1000]** (1.18x). **Orientation spans only 17.6%** (1000
  dead-on → 850 at ≥90°), and turning to face buys ~0.33% of it. Any acceptance threshold
  needing a wider spread between a stationary and a charging bot is unreachable without
  lowering `IMPACT_BASE`.
- **A spinning brain is very strong** — continuous rotation sweeps fresh faces through
  the contact. Sample-bot spin gate values are load-bearing: too low and the bot
  dominates every matchup.
- `HIT_COOLDOWN_TICKS` is the **first lever** for match length (can_bang.md 4).
- `HP_SCALE = 6` (`ruleset.ts:133`): real HP is 420/630/1008/480, not 70/105/168/80.
  Allowed — check 12 prescribes exactly this lever, and HP×damage stays equal across the
  three types.

## Docs
`PLAN.md` (plan + acceptance list), `can_bang.md` (constants, balance, §10 = the 19
checks), `gameplay.md` (player-facing rules), `ky_thuat_my_thuat.md` (art/technical).
`spec_demo.md` and `ra_soat_can_bang.md` are cited but **absent** from the folder.
The docs are explicit that every number is a starting point, not truth:
"Đo rồi hãy chỉnh, đừng chỉnh bừa" (measure, then adjust — don't guess).

## The web lab (`frontend/`, M2)
React 19 + Vite 8 + Tailwind 4, port 3000, host 127.0.0.1. No API key needed. **Not**
part of the pnpm workspace — a separate npm project that consumes the built packages.

- **How it reaches the engine:** Vite `resolve.alias` points
  `@promptchien/contracts` and `@promptchien/core` at `packages/*/dist/src/index.js`, so
  the browser runs the same code the CLI and tests run. `frontend/tsconfig.json` mirrors
  the mapping with `paths`. **The packages must be built first** — that is why
  `dev`/`build`/`test` all run `engine:build` (`cd .. && npm run build`) as a prefix.
- **`node:crypto` is aliased to `frontend/src/lab/sha256.ts`.** That single import in
  `packages/core/src/replay/hash.ts` is the only Node built-in on the engine's public
  path. `crypto.subtle` was rejected because it is async and would make `simulate()`
  async. SHA-256 is SHA-256, so hashes match Node exactly —
  `frontend/test/sha256.test.ts` proves it against `node:crypto`. Never "fix" this by
  editing the core.
- **All UI↔engine traffic goes through `frontend/src/lab/lab.ts`** (with `store.ts`,
  `useLab.ts`, `battleTypes.ts`). No component imports `@promptchien/core` to simulate.
- **`lab/replay.ts` (`ReplayView`)** rebuilds the exact per-tile picture at any tick:
  nearest earlier checkpoint + the hit/destroy/detach events after it. Verified
  byte-exact against the engine's own checkpoints. **Exception: Core HP comes from
  `frames[tick].coreHp`** — the shrinking ring drains it with no event.
- **All art constants live in `lab/palette.ts`** (ky_thuat_my_thuat.md 6: don't scatter
  art numbers any more than balance numbers). Colour = TEAM, pattern + stroke weight =
  TYPE. `arenaGeometry.ts` merges draws per (team × type × band), hit-testing instead of
  per-tile handlers. `quality.ts` = fps ladder (5.3) + LOD (5.4). `/dev/fx` reuses
  `BattleArena` rather than drawing a second arena.
- **No `Math.random()` on the draw path** — use `fxRandom(seed, tick, index)` so
  rewatching a replay throws identical sparks.
- **Replays are not stored; bots + seed are.** A full replay is ~1.5 MB of JSON and
  `localStorage` holds ~5 MB. Determinism makes re-simulation equivalent, and it is what
  the CLI's `verify` does.
- Frontend tests run with `tsx` (no browser): `npm test` in `frontend/`.
  `npm install` there needs `--legacy-peer-deps` (esbuild pin vs vite 8).
- Still open in M2: contrast/grayscale checks are automated (`test/art.test.ts`), but the
  fx-lab sliders are the only manual pass.

## Verifying cross-platform determinism (the M1 gate's third leg)
`hash100 --seeds 100` must give the same digest on Windows and Linux. **`wsl.exe` is
blocked by this machine's program blacklist — use Docker instead** (Docker Desktop
28.3.3, linux/x86_64, works).

Do NOT run the command against a mounted Windows checkout: pnpm's workspace links are
Windows **junctions**, which Linux cannot traverse, so you get
`ERR_MODULE_NOT_FOUND: Cannot find package '@promptchien/contracts'`. Build a clean tree
inside the container and recreate the links:

```sh
docker run --rm -v "H:/AI/prompt-battle-home:/src:ro" node:22-alpine sh -c '
  mkdir -p /work && cd /work
  tar -cf - --exclude=node_modules --exclude=.git -C /src packages | tar -xf -
  mkdir -p node_modules/@promptchien
  ln -s /work/packages/contracts node_modules/@promptchien/contracts
  ln -s /work/packages/core      node_modules/@promptchien/core
  ln -s /work/packages/cli       node_modules/@promptchien/cli
  node packages/cli/dist/src/index.js hash100 --seeds 100'
```

No `npm install` needed — `dist/` is plain JS with no native deps. Keep `/src:ro` so
nothing is ever written back into the Windows checkout.

**Confirmed 2026-09-19:** Linux digest == Windows digest ==
`3bebc8f47d6146917bab1032a82d60d50a7ff97465c7511fecce1b47a7219832`
(Linux Node v22.23.2, Windows v22.23.1). Re-confirmed after the security fix (which
touched `contracts/src/canonical.ts`) — the depth counter added to `canonicalJson` is
platform-independent, so no re-measurement is needed. If you ever change the damage
model, this digest changes and both sides must be re-measured.

## Security invariants (added 2026-09-19 — do not regress)
1. **Every CLI path read/write goes through `safeProjectPath(root, userPath)`**
   (`packages/cli/src/paths.ts`). Never `resolve(ROOT, p)` + `readFileSync` directly.
   Never replace it with `abs.startsWith(root)` — that leaks a sibling dir sharing the
   name prefix. Two layers: `path.relative` (string) **and** `realpathSync` (real path —
   needed because a Windows **junction can be created without admin rights** and bypasses
   a string-only check). To remove a junction use `rmdirSync`, never `rmSync` recursive
   (it follows the link).
2. **Never hash a bot definition before its structure is checked.** `validateBot()` runs
   the iterative `guardStructure()` walk (caps: depth 128, nodes 100k) first, then
   `isHashable()`, then a narrowly-wrapped `hashDefinition`. Sentinel
   `UNHASHABLE_BOT_HASH` (`'0'.repeat(64)`) must **never** accompany `ok: true` — an
   unhashable definition also pushes an `error`-severity `BOT_UNHASHABLE` issue.
3. `canonicalJson` refuses by **value type**, not just shape: non-integer / non-finite
   numbers and `undefined` inside arrays all throw. Shape guards alone are not enough.
4. CLI failures print **one line** `error: <message>` to stderr and exit 1 — never a raw
   stack trace.
5. `validate` and `simulate` are separate paths: `simulate` calls `lockBot()` →
   `hashDefinition` with no validation, so fixing `validateBot` does not fix `simulate`.

## Balance harness
`harness.ts` had **no unit-test coverage** until `packages/core/test/balance.test.ts`
(2026-09-19) — that is exactly what let the check-20 empty-PASS bug live unseen, so
"125 tests pass" says nothing about the harness. Verdicts are now pure exported
functions: `motorLossStatus`, `hunterLeverageStatus`, `damageSpeedStatus`,
`mixedTripleStatus`, `rpsInvariantStatus`. Verdict table: **10 PASS · 2 FAIL (checks 10
and 16) · 8 info**; check 20 = `102/135` (the 33 exceptions are bots losing a single
Motor without crossing a discrete speed band — PLAN speaks of losing a *cluster*).
Known caveat: check 13's criterion b is 99.5% but discriminates almost nothing, because
the hunter only wins 2.0% of those matches — a flaw in the scenario the doc prescribes.
`simulate.ts:1073` pushes a checkpoint only when `(tick + 1) % CHECKPOINT_EVERY === 0`,
so **the first checkpoint is tick 29, there is no tick-0 checkpoint**.

## Known accepted debt
`checkDefinition()` called directly still stack-overflows on a very deep condition tree
(not reachable from the CLI). A junction pointing at a *non-existent* target outside the
root passes the string check but writes fail with `ENOENT` (theoretical TOCTOU).
