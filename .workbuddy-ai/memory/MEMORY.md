# PROMPT CHIEN — project notes

## What this is
Deterministic geometry battler. Two players build a bot out of triangles on a
triangular lattice, write a Brain from a tiny fixed instruction set, then watch
the bots fight with no human input.

## Layout
TypeScript + pnpm workspace, Node 22, project references (`tsc -b`), NodeNext ESM,
`node:test`. Three packages:
- `packages/contracts` — `ruleset.ts` is the **single source of truth for every
  constant**; also `brain.ts` (instruction set + published field list), `types`,
  `schema`, `canonical`, `rot64`, `versions`.
- `packages/core` — engine, geometry, brain interpreter, replay, sandbox,
  validation, balance harness, sample bots.
- `packages/cli` — `bots`, `validate`, `simulate`, `replay`, `hash100`, `balance`.

## Commands
```
npx --yes pnpm@9 -r build
node --test "packages/core/dist/test/*.test.js"   # quoted glob — the bare dir form fails on Windows
node packages/cli/dist/src/index.js bots          # regenerates bots/*.json from samples.ts
node packages/cli/dist/src/index.js hash100 --seeds 100
node packages/cli/dist/src/index.js balance --seeds 100 --out reports/balance-m1.md
```
`package.json`'s `test` script uses the quoted glob for the same reason.

## Hard rules (violating any of these is a contract breach, not a style choice)
1. **Integer-only fixed point.** No `Math.sin/cos/sqrt/random`, no `Date.now`, no
   wall-clock in the core. One float on the damage path turns every hit into `0`.
   `isqrt` is a bit-by-bit integer square root; directions come from the frozen
   `ROT64` table; the PRNG is `mulberry32`.
2. **Damage** = `floor(base × RPS × impact × orient ÷ 1e9)`, every multiplier an
   integer in 1/1000. Hammer→Scissor perfect must be exactly **48**.
3. **RPS invariant is blocking**: the weakest advantage hit (14) must beat the
   strongest disadvantage hit (12).
4. **`effectiveLoadMilli = max(current, lockedLoadMilli)`** — the `max()` law is
   what forbids a damaged bot from ever speeding up. Never relax it.
5. **Per-defender cooldown**: one hit per defending triangle per
   `HIT_COOLDOWN_TICKS`. A tile pinched by three enemies in one tick takes 1 hit.
6. **The engine never touches DB, network or UI.**

## Source of truth conventions
- `bots/*.json` are **generated** — edit `packages/core/src/bots/samples.ts` and
  re-run the CLI `bots` command. Never hand-edit the JSON.
- `samples.ts` builds bodies from character grids (`H`/`S`/`P`/`M`, `.` = empty),
  one character = one rhombus = the (down, up) tile pair.

## Design facts worth remembering
- The lattice is **bipartite by orientation**: every edge neighbour of an `up`
  tile is a `down` tile. So "interleave up and down" is structural, not tactical.
- **Motor tiles deal 0 damage.** Any bot whose contact face is motors cannot hurt
  anything head-on — this is what made the Spinner sample bot invalid.
- The **impact multiplier spans only [850, 1000]**, i.e. 1.18x. Any acceptance
  threshold that needs a bigger spread between a stationary and a charging bot is
  unreachable without lowering `IMPACT_BASE`.
- The **orientation mechanic spans only 17.6%** of damage (1000 dead-on to 850 at
  >=90 degrees), and turning to face buys ~0.33% of it.
- `HIT_COOLDOWN_TICKS` is the **first lever** for match length (can_bang.md 4);
  the range prescribed by check 12 is 10-12. It is currently 12.
- **A spinning brain is very strong** because continuous rotation sweeps fresh
  faces through the contact. Sample-bot spin gate values are load-bearing: too
  low and the bot dominates every matchup.

## Docs
`PLAN.md` (plan + acceptance list), `can_bang.md` (constants, balance, section 10
= the 19 checks), `gameplay.md` (player-facing rules), `ky_thuat_my_thuat.md`
(art/technical). `spec_demo.md` is referenced but **absent** from the folder.
The docs are explicit that every number is a starting point, not truth:
"Đo rồi hãy chỉnh, đừng chỉnh bừa" (measure, then adjust — don't guess).
