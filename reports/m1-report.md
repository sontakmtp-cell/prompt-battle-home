# PROMPT CHIEN — M1 delivery report

Engine `0.1.0-m1`, ruleset `1.0.0`, contracts `1.0.0`.
Milestone: **M1 — Hai bot tự đánh** (two bots fight each other).

This report covers the whole M1 scope: the doc summary that drives the design,
what was built, the gate evidence, the defects found while validating, and the
balance measurements with their diagnoses.

> **Revision note.** An earlier revision of this report was written against an
> older source state (before the check-14 damage-model fix) and was never
> refreshed, so parts of its narrative no longer matched the code. This revision
> was rebuilt from the current measurements; the balance numbers now come straight
> from `reports/balance-verify.md`. Where a figure could not be re-measured in
> this pass it is flagged as historical. See the provenance notes in §3 and §5.

---

## 1. The plan in one page

Nine documents describe the project; four are present in this folder
(`PLAN.md`, `can_bang.md`, `gameplay.md`, `ky_thuat_my_thuat.md`). The points
that actually constrain M1 are these.

### 1.1 What the game is

Two players build a bot out of **triangles** on a triangular lattice, write a
**Brain** out of a tiny fixed instruction set, and then watch the two bots fight
with **no human input**. The whole design rests on one bet: that a *small* rule
set plus a *free* geometry editor produces a large space of genuinely different
creatures.

### 1.2 The five laws that must never be broken

| Law | Rule | Why it matters |
|---|---|---|
| **Integer units** (`can_bang.md` 3.6) | every multiplier is an integer in 1/1000; damage is `floor(base × RPS × impact × orient × commit ÷ 10^12)` — the fifth factor, `commit`, is a documented deviation from the doc's four-factor form (see §7) | one float on the damage path turns every hit into `0` |
| **RPS** (`can_bang.md` 3.8) | Hammer > Scissor > Paper > Hammer; advantage 2000, neutral 1000, disadvantage 500; Motor deals 0 | the weakest advantage hit (14) must still beat the strongest disadvantage hit (12) — this invariant is a **blocking** test |
| **Determinism** (`PLAN.md` M1 gate) | no `Math.sin/cos/sqrt/random`, no wall-clock in the core | Windows and Linux must produce a bit-identical hash |
| **Load factor** (`gameplay.md` 3.4.1) | `load = bodyAlive / (motorsAlive × 4)`, and **effective load = `max(current, lockedAtLockTime)`** | the `max()` law is what forbids a damaged bot from ever speeding up |
| **Per-defender cooldown** (`can_bang.md` 8.4) | one hit per *defending triangle* per `HIT_COOLDOWN_TICKS` | a tile pinched by three enemies in one tick takes exactly **1** hit, not 3 |

### 1.3 The mechanics that give the game depth

- **Triangular lattice**, `TRI_SIDE_MILLI = 1000`, `ROW_HEIGHT_MILLI = 866`, three
  edge neighbours. It is **bipartite by orientation**: every edge neighbour of an
  `up` tile is a `down` tile. So "interleave up and down" is a *structural*
  consequence of being connected, not a separate tactical choice.
- **Impact multiplier** `850 + 150 × min(r,1000)/1000`, where `r` is the relative
  normal speed scaled by tick rate and `IMPACT_REF_SPEED`.
- **Orientation multiplier** — a frozen 64-entry LUT, 1000 dead-on falling to 850
  at ≥90°. This is the term that is supposed to reward a brain that turns to face.
- **Diversity resonance** — +12% max HP per extra distinct *combat* type in a
  tile's one-ring, capped at +24%. Motor receives but does not count.
- **Speed bands** — ≤0.50 → 115%, 0.50–1.00 → 100%, 1.00–1.50 → 100%→70%,
  1.50–2.00 → 70%→40%, >2.00 → 15%.
- **Ring shrink** — starts at tick 1800, radius 28300→4000; a Core outside loses
  1.5% of **max** HP per tick, giving every Core type the same ~2.2 s grace.
- **Nine-step tick** — SENSE, THINK, INTENT, MOVE/ROTATE, COLLISION, DAMAGE,
  STRUCTURE, WIN CHECK, EVENT LOG. Both brains read the **same pre-tick snapshot**,
  which is what makes the match fair and replayable.
- **Brain budget** — 256 nodes / depth 16 / 32 vars / 1000 steps; 30 consecutive
  violating ticks is a forfeit.

### 1.4 What M1 specifically demands

**Deliverable** (`PLAN.md`): geometry, Brain, engine, destruction, replay data,
CLI, and the **five sample bots from the spec**.

**Gate**: *"Hai bot đánh hết trận; chạy lại cùng kết quả; Windows/Linux cho cùng
hash với 100 seed cố định."*

**Art scope**: debug draw only — *"Không tốn công mỹ thuật ở mốc này."*

**Acceptance list** (`PLAN.md` section 5) — geometry rejections (over budget,
duplicate cells, vertex-only touching, disconnection, invalid Motor, **Core on
Motor rejected**); RPS, cooldown, two Cores dying on the same tick, fragment
detach, Motor loss, timeout; the 3-vs-1 per-defender cooldown; all-integer
constants and Hammer→Scissor perfect = exactly 48; balance checks 1–19 per
`can_bang.md` section 10; load factor incl. the `max()` law; ring shrink; Brain
errors/depth/budget/stall/avoidance in a multi-position multi-seed sandbox;
determinism, fairness under reordering, replay seek and hash; editing during
validation, repeated submit, cross-account access, expired token, interrupted
job; and on the reference VPS **two concurrent matches must keep tick p95 under
33 ms**.

### 1.5 The stance the docs take on tuning

`can_bang.md` section 10 is explicit and it shaped every decision below:

> *"Mọi con số trên là điểm khởi đầu hợp lý, không phải chân lý."*
> (Every number above is a reasonable starting point, not truth.)
> *"Đo rồi hãy chỉnh, đừng chỉnh bừa."* (Measure, then adjust — don't guess.)

So the balance suite **measures and reports**, and only the items it marks
`pass`/`fail` are acceptance criteria.

---

## 2. What was built

TypeScript + pnpm workspace, Node 22, project references (`tsc -b`), NodeNext
ESM, `node:test`. **25 source files (~5,029 lines)** under `packages/*/src`, plus
**11 test files (~1,928 lines)** under `packages/core/test` — **36 `.ts` files,
~6,957 lines** in total (counted with `Get-ChildItem -Filter *.ts`, generated
`dist/` excluded).

> **These are file/line counts as of this revision.** Counting method:
> `Get-ChildItem -Recurse -Filter *.ts` (excluding `dist/` and `node_modules/`)
> piped through `Get-Content | Measure-Object -Line`, which counts **non-blank
> lines only**. Use this exact method when updating, or the numbers will disagree
> and look wrong. If you change the source, re-count and update this paragraph —
> the figures have already drifted during M1's final pass.

| Package | Contents |
|---|---|
| `contracts` | `ruleset` (single source of truth for every constant), `brain` (the instruction set and the published field list), `types`, `schema`, `canonical` (canonical JSON), `rot64` (the frozen 64-direction wheel), `versions` |
| `core` | `math/fixed` (integer-only helpers), `geometry/lattice` + `build` + `validator`, `brain/validate` + `interpreter`, `engine/collision` + `simulate` (the nine-step tick), `replay/hash` + `verify`, `sandbox/run`, `validation/validate`, `balance/harness`, `bots/samples` |
| `cli` | `bots`, `validate`, `simulate`, `replay`, `hash100`, `balance` |

**Module boundary** is enforced: the engine never touches DB, network or UI, and
it is the only thing that decides damage.

**The five sample bots** (`gameplay.md` 7.2) ship both as source and as
`bots/*.json`, regenerated by the CLI:

| Bot | Shape | Idea | Hash |
|---|---|---|---|
| Spear | hammer wall front, motors behind | charge straight, one killing blow | `d0cddc535527` |
| Shield | paper wrapped around the Core | defend, let the enemy break on you | `122b212aac85` |
| Flanker | scissors on both wings | never charge head-on, spiral in | `d5bd43cf5bc2` |
| Spinner | radial, combat rim, motors on the flanks | spin so a fresh face rotates into the contact | `a00162131b7e` |
| GlassCannon | combat front, huge motor block | fastest thing in the game at 115% | `aa9292a411e9` |

---

## 3. Gate evidence

> **Provenance.** In this revision, §3.1 (the test suite), §3.4 (the
> Windows/Linux digest) and §5 (the balance suite) were re-run on 2026-09-19. The
> single-match transcripts in §3.2 and the two `hash100` runs in §3.3 are carried
> over from earlier passes and were **not** re-executed in this pass; the digest
> they quote is the same value confirmed by the Windows/Linux comparison in §3.4.
> The performance table in §3.5 is a **development-machine** measurement — see the
> note there.

### 3.1 The whole suite

```
# tests 105
# pass 105
# fail 0
```

> **Counts are a snapshot of this revision.** If you change the test suite,
> re-run `node --test "packages/core/dist/test/*.test.js"` and update this block —
> the count has already drifted twice during M1's final pass.

105 tests across 11 `.ts` files under `packages/core/test` (ten `node:test`
suites plus the `helpers` module): geometry (budget, span, duplicates,
vertex-only touching, floating fragments, Core-on-Motor, bad coords/type/
orientation, mono warn/block), units (every coefficient integer, ORIENT_LUT
shape, ROT64 integer and unit length, Hammer→Scissor perfect = 48, the whole
damage matrix, Motor immunity, the RPS invariant 14 > 12, the speed band table
incl. the doc's worked 45+15 example, load factor, diversity cap, ring
monotonicity, canonical JSON, ruleset immutability), engine (the 3-vs-1
per-defender cooldown, cooldown never violated in a real match, per-hit damage
matches the formula, Motor deals no damage, mutual core kill = draw, timeout
scoring, incap, detach, Motor loss), load (the `max()` law), ring (proportional
drain — a 420 HP and a 1008 HP Core die on the same tick), brain (static
validation, interpreter, sandbox), determinism, samples, perf, balance (covers
the balance harness: a regression test asserting that a check which observed
nothing never returns `pass` — checks 19 and 20 — and a boundary test for check
13's strict `> 0.6` threshold).

### 3.2 "Two bots fight a whole match"

*(Transcript carried over from an earlier pass; not re-run in this revision.)*

```
A        : Spear d0cddc535527  60 tiles, 18 motors, load 0.83, speed 100%
B        : Spinner a00162131b7e  52 tiles, 16 motors, load 0.81, speed 100%
result   : B wins by core at tick 1276 (42.5s)
score    : A 350  B 767  (out of 1000)
replay   : 6d0d7dd0bb87e99ad24149862179c1e35674ec668cf25c5c28ce4ab0259729be
events   : 2002 (hits 1927)
```

and the saved replay re-runs and verifies:

```
expected : 6d0d7dd0bb87e99ad24149862179c1e35674ec668cf25c5c28ce4ab0259729be
actual   : 6d0d7dd0bb87e99ad24149862179c1e35674ec668cf25c5c28ce4ab0259729be
frames   : match      ticks : match      outcome : match
verdict  : VERIFIED over 1276 ticks (B by core)
```

### 3.3 "Re-running gives the same result"

*(Two runs carried over from an earlier pass; not re-run in this revision, but
the same digest was independently reproduced during the Windows/Linux comparison
in §3.4.)*

`hash100` runs the five sample bots round robin, 100 seeds per pair = 500
matches, and folds every match into one digest. Two independent runs:

```
DIGEST : 3bebc8f47d6146917bab1032a82d60d50a7ff97465c7511fecce1b47a7219832
DIGEST : 3bebc8f47d6146917bab1032a82d60d50a7ff97465c7511fecce1b47a7219832
```

> The digest was `5a35d60b…` before the check-14 fix described in 5.3. It changed
> because the damage model changed; that is expected, and the new value is the one
> the Linux side reproduces.

### 3.4 "Windows/Linux produce the same hash"

**Both halves have now been measured.** The Windows side runs Node **v22.23.1**;
the Linux side runs Node **v22.23.2** inside a Docker container
(`Linux 6.6.87.2-microsoft-standard-WSL2 x86_64`). The digests are **identical**,
and all five per-pair digests match too.

| | Windows | Linux (container) |
|---|---|---|
| Platform | win32 | `Linux 6.6.87.2-microsoft-standard-WSL2 x86_64` |
| Node | v22.23.1 | v22.23.2 |
| **DIGEST** | `3bebc8f47d6146917bab1032a82d60d50a7ff97465c7511fecce1b47a7219832` | `3bebc8f47d6146917bab1032a82d60d50a7ff97465c7511fecce1b47a7219832` |

Reproduction command — the clean tree matters, because the workspace symlinks
pnpm creates on Windows are **junctions** that Linux cannot traverse, so a naive
run fails with `Cannot find package '@promptchien/contracts'`:

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

The reason it matches is that the core contains **no**
platform-dependent operation. A source audit of `core` and `contracts` finds no
`Math.sin/cos/tan/sqrt/pow/exp/log/atan/asin/acos/hypot`, no `Math.random`, no
`Date.now`, no `performance.now` and no `process.hrtime` anywhere except in
comments that forbid them. Everything is built from `+ - *`, truncating integer
division, bit operations and a table lookup:

- `isqrt` is a bit-by-bit integer square root, not `Math.sqrt`.
- Directions come from the frozen `ROT64` table, generated once offline.
- The PRNG is `mulberry32` — `Math.imul` and shifts only.
- The one float division in the geometry path (`Math.round(sumX / n)` for the
  body origin) is an exactly-specified IEEE-754 divide by a small integer
  followed by an exactly-specified `Math.round`, so it is identical on both
  platforms. It runs once at build time, not per tick.

### 3.5 The VPS requirement — two concurrent matches, tick p95 < 33 ms

> **Scope note.** These numbers are measured on the **Windows development
> machine**, not on the reference VPS that `PLAN.md` specifies. `perf.test.ts`
> itself notes *"There is no server at M1"*. The result is a very large margin, so
> the requirement is expected to hold, but this is a dev-machine figure.

Measured over 40 full matches (64,105 ticks):

| metric | value |
|---|---|
| tick p50 | **0.030 ms** |
| tick p95 | **0.061 ms** |
| tick p99 | 0.151 ms |
| tick max | 0.151 ms |
| budget for one of two concurrent matches | 16.500 ms |
| single-threaded throughput | 32,493 ticks/s |

The p95 is roughly **270× inside** the half-budget, so the requirement holds with
a very large margin. The engine also carries a fast path in `structureUpdate`:
if nothing died and nothing detached, every derived quantity (counts, diversity
max HP, load factor, torque) is bit-identical to the previous tick, so the O(n)
recomputation is skipped. That change was verified behaviour-preserving (same
digest) and cut a reference match from 192 ms to 114 ms.

---

## 4. Defects found and fixed

The test suite earned its keep: it caught five genuine defects in code that
already ran, four of them contract violations rather than typos.

1. **Speed table was a continuous ramp** where the doc specifies *flat bands* —
   load 750 returned 1075 instead of 1000. Fixed with an explicit `SPEED_BANDS`
   table.
2. **`diversityMaxHp` ignored `DIVERSITY_MAX_TYPES`** — four distinct types
   returned 1360 instead of the capped 1240.
3. **Diversity HP was never applied.** `recomputeDiversity` raised `maxHp` but
   never raised the tile's opening `hp`, so the +12%/+24% resonance was pure
   headroom that nothing could ever use (nothing heals). The ring test exposed
   it: a 420 HP and a 1008 HP Core were supposed to die on the same tick and
   did not. Fixed with `fillToMaxHp` after the opening recompute.
4. **`replayHash` depended on `recordReplay`** — the hashed payload contained the
   frame list, so turning recording off changed the hash. Fixed by hashing the
   rolling state digest instead.
5. **A timeout match could not be reproduced.** `verifyReplay` re-ran with the
   default tick ceiling. Fixed by storing `maxTicks` in the replay manifest and
   schema and passing it through.

### 4.1 The Spinner sample bot was invalid

Found by the new `samples.test.ts`: **Spinner failed the sandbox in 4 of its 8
placements** with *"never made combat contact"*. Two independent defects:

- **Body.** Spinner's front row was motors (`.MMM.`), and a Motor tile deals
  zero damage. Head-on contact therefore did nothing: the bot literally
  bulldozed the immobile dummy 17,821 milli-units across the arena while landing
  **0 hits**. A radial body whose entire rim is motors has no favourable face to
  rotate into the contact — which contradicts the spec's own description of the
  bot (*"Xoay để đưa mặt có lợi vào va chạm"*). Fixed by moving combat to the rim
  and keeping motors on the flanks, where they also contribute the most torque.
- **Brain.** The rule `dist > 8000 → toEnemy, else forward + left` meant that
  anything closer than 8000 triggered a permanent spin, which orbits at that
  radius forever. That is exactly the *"circles to avoid the fight"* failure
  `gameplay.md` 4.2 exists to reject. Fixed by making the bot commit first.

The fix initially over-corrected: with a 3000 spin gate Spinner won **99.8%** of
every matchup (up from 66.8%), which destroys the "five clearly different
matchups" goal. Sweeping the gate showed it is the real power lever (motor count
barely matters):

| spin gate | sandbox | win share |
|---|---|---|
| 3000 | 8/8 | 99.4% |
| 4000 | 8/8 | 75.6% |
| **5000** | **8/8** | **65.8%** |
| 6000 | 2/8 | 66.3% |
| 8000 | 0/8 | 72.5% |

> **Provenance.** The spin-gate table and the win shares quoted in this paragraph
> (`99.8%`, `66.8%`) are **historical — from the pass that fixed Spinner, not
> re-measured in this revision.** In particular the old claim that at gate 5000
> Spinner *"loses to Shield 1–99"* is **no longer true**: the current run reads
> **Shield 50–Spinner 50** (see §5.5). Gate 5000 was still chosen because it is
> the only setting that passes the sandbox and keeps the matchups differentiated.

### 4.2 Measurement bugs in the harness itself

- **`Math.min(...arr)` overflowed the call stack** on a 100-seed run
  (`RangeError: Maximum call stack size exceeded`), because a full sweep produces
  more hits than can be spread onto the argument stack. It had been invisible in
  quick mode. Replaced with an explicit loop.
- **Check 16 compared an illegal body against a legal one.** The "wide wing" was
  80 tiles against a 60-tile block, so it was measuring the tile budget, not
  shape. Rebuilt so both are identical in every countable way (60 tiles, 48
  combat, 12 motors, same brain) and differ only in shape.
- **Check 8 measured the wrong scenario.** It took the median `r` over *every*
  hit in a round robin, while `can_bang.md` check 18 defines the scenario as *"a
  balanced bot charging at full speed into a stationary bot"*. It now measures
  that, with the round-robin median kept as an info line. This mattered: the
  mismatch is what made a per-side impact fix *look* like it broke check 8
  (see 5.3).
- **Check 20 could pass without measuring anything.** Its verdict was
  `losses === 0 || drops > 0 ? 'pass' : 'fail'`, so a run that observed *no*
  motor-loss event at all still reported **PASS** — and the shipped run did
  exactly that (`0/0`). The report then described it as *"verified across
  checkpoints"*, which read as if it had been checked. Fixed: the check now
  watches **both** bots across the **full** seed set, and when no event is
  observed it returns `info`, never `pass`. It now reports
  `102/135 motor-loss events also dropped the speed multiplier`.
- **Check 19 carried the same vacuous-pass shape as check 20.** Its status was
  `violations === 0 ? 'pass' : 'fail'`, while `checked` only increments when a
  match lives long enough to produce two checkpoints. With no comparable match it
  would have reported `"0 violations in 0 matches"` as a green pass. Found by an
  independent audit sweep of every `status` site in the harness, not by a failing
  test. Fixed with `damageSpeedStatus()`, which returns `'info'` when nothing was
  compared. Two further sites carried the same latent shape and were hardened:
  check 2 (`Array.every()` on an empty list is `true`) and check 7 (`worstMargin`
  seeded with `Number.MAX_SAFE_INTEGER`). All three verdict helpers now follow one
  convention — **zero observations ⇒ `info`, never `pass`** — so anyone adding a
  new check knows the rule to follow.
- **The report's own statistics drifted three times.** The test/file counts in §2
  and §3.1 were written before the suite stopped changing, so each later code
  change silently made them stale (97 → 103 → 105 tests). This is a process
  defect, not a code one: a number in a report is only true as of the revision
  that measured it. Fixed by stamping both sections with the exact counting
  method and a re-run instruction, so the next update is mechanical rather than a
  guess.

One further measurement bug was fixed in an earlier pass: **check 10 was
confounded** because it compared SPEAR against its own blindfold variant, and
SPEAR also carries a `stuckTicks > 12` back-off rule, so a result could come from
either change. It is now a controlled comparison — identical body and movement
rule, only `rotate` differs.

---

## 5. Balance measurements

Full 100-seed run, **2,500 matches**, written to **`reports/balance-verify.md`**
(330.4 s on the Windows development machine).

> **Provenance.** The verdicts and numbers in §5.1 come straight from
> `reports/balance-verify.md` (full 100-seed run, re-run 2026-09-19). The
> orientation histogram and the `ORIENT_BASE` sweep in §5.2, and the `ORIENT_BASE`
> sweep in §5.4, were **also re-measured on 2026-09-19** and reproduce; their
> sample configurations are noted inline. The check-16 contact-density table in
> §5.4 and the option table in §5.3 come from `reports/proposal-*.md` and were
> **not** re-run in this revision — those figures keep a `historical` flag.

### 5.1 Verdicts

**Passing (10):** 2, 6, 7, 8, 12, 13, 14, 15, 19, 20.

| # | Check | Measured |
|---|---|---|
| 2 | mixed triple beats every pure bot | 99% / 100% / 97% |
| 6 | 70/30 hammer-lean bot stays viable | 0% / 100% / 96% |
| 7 | RPS invariant | worst margin 14 vs 12 |
| 8 | impact calibration | charger-vs-stander median r = 0.980 over 84,717 hits |
| 12 | match duration | p10 24.8s, **p50 54.3s**, p90 100.6s (over 1,000 matches) |
| 13 | motor hunting leverage | a: hunter wins 2.0%; b: hunted mean speed **99.5%** of its max |
| 14 | defending is not free | stander 148,723 vs charger 196,224 (**75.7%**) |
| 15 | flanking still viable | Flanker beats Spear 87% |
| 19 | damage never makes a bot faster | 0 violations in 8 matches |
| 20 | losing motors costs speed | **102/135** motor-loss events also dropped the speed multiplier |

Check 13 now carries **both** halves of its criterion. Half (b) applies to the
**hunted** bot (`MIXED_TRIPLE`, side B): its mean speed across the match must stay
above 60% of its own maximum. The denominator is `speedMultiplierMilli` at the
**first checkpoint, which is tick 29** — checkpoints are pushed only when
`(tick + 1) % CHECKPOINT_EVERY === 0` (`engine/simulate.ts:1074`,
`CHECKPOINT_EVERY = 30`), so there is **no tick-0 checkpoint**. Because the `max()`
law (`engine/simulate.ts:280`, `effectiveLoadMilli = Math.max(loadMilli,
lockedLoadMilli)`) only lets the multiplier fall, the tick-29 value is ≤ the true
tick-0 maximum, so the denominator is slightly **smaller** than the real maximum
and the ratio is biased **upward** (towards passing). At 99.5% against a 60%
threshold the bias does not change the verdict, but it is disclosed. Full text:
`a: hunter wins 2.0% (balanced 98.0%, draw 0.0%); b: hunted mean speed 99.5% of
its max over 100 matches; hunter mean speed 97.7% (info)`.

> **Criterion b is technically correct but weak in discriminating power.** In the
> pairing `can_bang.md` prescribes, the hunter wins only 2.0% of matches — it
> barely damages the hunted bot at all, so a 99.5% speed retention is almost
> guaranteed and does **not** demonstrate that motors are durable in general. What
> limits the check is the scenario fixed by the doc, not the implementation. See
> `reports/m1-audit-2026-09-19.md` §5.9.

> **Why check 20 reads `102/135`, not `135/135`.** 33 motor-loss events did *not*
> drop the speed multiplier. The speed bands are discrete (≤0.50 → 115% ·
> 0.50–1.00 → 100% · 1.00–1.50 → 70% · 1.50–2.00 → 40% · >2.00 → 15%), so losing
> one motor out of 18 does not always cross a band boundary. PLAN.md's real
> requirement is that losing a *cluster* of motors drops a full band — that is
> covered exactly by the unit test `load.test.ts:130`. The check's criterion string
> now states what the code actually asserts (that a motor loss *can* drop the
> multiplier), rather than the stronger claim it used to make.

> **Two scopes, not a contradiction.** Check 12's figures (`p10 24.8s, p50 54.3s,
> p90 100.6s`) are over the **1,000** matches of the sample-bot round robin. The
> *"Match duration distribution"* section of `reports/balance-verify.md`
> (`p10 24.7s, median 45.0s, p90 109.4s`) is over **all 2,500** matches of the run.
> They measure different sets.

`can_bang.md` names the balance acceptance criterion as checks **2 and 6**
together — *"Nếu cả hai điều đó đúng → cân bằng đã đạt."* Both pass.

**Failing (2):** 10 (`facing 54.0% vs blind 45.0%`, full 100-seed run) and 16
(`block 100%`, full 100-seed run), diagnosed below. In both cases the measurement
contradicts the doc's own stated hypothesis.

### 5.2 Check 10 — the orientation penalty belongs to the lattice, not the brain

Criterion: turning to face must beat not turning by more than 10 points.
Measured over the **full 100-seed run**: **facing 54.0% vs blind 45.0%** — a
9-point gap, so still **FAIL** (the bar is > 10).

Direct measurement of the orientation term (`tools/check10-orientation-histogram.mjs`,
60 seeds, `DEFAULT_RULESET`; facing 62,471 hits, blind 57,907 hits).
**Re-measured 2026-09-19 — reproduces:**

| | at the 850 floor | at the 1000 ceiling | mean `orientMul` |
|---|---|---|---|
| facing (`rotate: toEnemy`) | **42.0%** | 3.4% | 932.8 |
| blind (`rotate: hold`) | **45.7%** | 2.9% | 929.7 |

Turning to face bought **3.1 milli-units of mean orientation (0.33%)**, worth
+4.93% damage per hit — against a bar that demands a >10-point win-rate swing.

The distribution is the real story: between **42% and 46% of all hits take the
maximum orientation penalty**, and only ~3% reach the ceiling. The cause is
structural and it is the same fact check 11 records — **the lattice is bipartite
by orientation**, so every edge neighbour of an `up` tile is a `down` tile. At any
contact roughly half of the attacker's tiles present the *wrong* face, and
rotating the whole body turns the good faces away exactly as fast as it turns the
bad ones in. The brain has no command that changes which face a given tile
presents at a given contact.

**This is why the multiplier cannot be tuned into working.** A sweep of
`ORIENT_BASE` from 850 down to 765 — widening the span from 17.6% to 30.7% —
changes check 10 *not at all* while eroding check 7's blocking margin. Re-measured
2026-09-19 with `tools/proposal-orientation-sweep.mjs` (`quick: true, seeds: 16`):
check 10 reads **50.0% vs 50.0%** at every value, and check 7's worst margin
falls from **2** at 850 and 825 to **1** from 800 down to 765. The term the brain
can influence is the small residual; the term that dominates is fixed by
geometry. Full analysis in `reports/proposal-checks-10-16.md`.

> **Check 10's margin depends on the sample size.** The full 100-seed run measures
> `facing 54.0% vs blind 45.0%` — a 9-point gap, one point short of the bar. The
> 16-seed quick sweep measures `50.0% vs 50.0%` — a 0-point gap. Both fail the
> "> 10 points" criterion, and they are **two different sample configurations, not
> two contradictory figures**. Anyone comparing §5.1 against the sweep table must
> read the seed count before concluding the numbers disagree.
>
> The consequence is that this measurement is **sensitive to sample size**: at 16
> seeds it misses the bar by a full 10 points, at 100 seeds by only **1 point**. So
> no "just short" conclusion can be drawn from a single configuration — every
> figure has to be stamped with the configuration it came from.

### 5.3 Check 14 — resolved by separating two conflated questions

Criterion: the standing bot must deal **< 80%** of the charging bot's damage.
Was **100.0%**; now **75.7%** (stander 148,723 vs charger 196,224). **PASS.**

This took some work, because the obvious fixes each broke something else. The
full analysis and the measured option table are in `reports/proposal-check14.md`;
in short:

1. `r` is the **relative** closing speed, so it is the same number for both
   sides. Both attackers therefore get the same impact multiplier and the ratio
   is exactly `100%` for **any** value of `IMPACT_BASE` — the asymmetry is
   structurally absent, so a per-side term is required.
2. But a per-side term folded into the impact multiplier pollutes check 8, which
   derives `r` by **inverting** the multiplier the engine reported. Measured:
   round-robin median `r` collapses from 1.000 to 0.500.
3. Lowering `IMPACT_BASE` instead breaks **check 7**, the blocking RPS invariant,
   whose margin at the quoted constants is only **2** (`14 vs 12`). Check 14 needs
   `IMPACT_BASE < 800`; check 7 needs `IMPACT_BASE >= 765`. Measured: check 7
   fails at 750.
4. `RPS_ADVANTAGE` cannot rescue check 7 either, because it is jointly pinned
   with `HAMMER_DAMAGE` by the "Hammer → Scissor perfect = exactly 48" criterion.

There was also a genuine measurement bug: check 8 was taking the median `r` over
*every* hit in a round robin, while `can_bang.md` check 18 defines the scenario as
*"a balanced bot charging at full speed into a stationary bot"*. It now measures
that scenario, with the round-robin median kept as an info line.

**The fix** is to stop making one number answer two questions. "How hard did these
two things collide?" is physics and belongs to the *relative* speed, which check 8
calibrates. "How much did this attacker contribute?" is design and belongs to the
attacker's *own* speed. So the asymmetry moved into its own factor:

```
damage = floor( base × RPS × impact(relative) × orient × commit(own) / 1e12 )
commit = 675 + floor(325 × min(ownR, 1000) / 1000)
```

A bot that does not drive into the contact gets 675; one at full reference speed
gets 1000, so the perfect-hit ceiling (Hammer → Scissor = 48) is preserved exactly,
and parallel motion still prices as a graze because the relative term still sets
the impact. `IMPACT_BASE` is untouched, which is why checks 7, 8 and 12 all stay
green at every value of the new constant.

| configuration | check 7 | check 8 | check 12 | check 14 |
|---|---|---|---|---|
| as first shipped | PASS | PASS 1.000 | PASS | FAIL 100.0% |
| doc's switch (per-side impact) | PASS | PASS 0.973 | PASS | FAIL 88.5% |
| …+ `IMPACT_BASE` 800/200 | PASS | FAIL 0.735 | PASS | FAIL 85.5% |
| …+ `IMPACT_BASE` 750/250 | **FAIL** | PASS 0.960 | PASS | FAIL 82.3% |
| …+ `IMPACT_BASE` 700/300 | **FAIL** | PASS 0.943 | PASS | PASS 77.6% |
| **shipped — commitment factor 675/325** | **PASS** | **PASS 0.980** | **PASS** | **PASS 75.7%** |

> The option table above is from `reports/proposal-check14.md` — **historical, not
> re-run in this revision**. Its last row (the shipped configuration) is the one
> confirmed by `reports/balance-verify.md`: check 8 = 0.980, check 14 = 75.7%.

675/325 was chosen for real headroom: 700 passes at 78.8% (only 1.2 points of
margin) and 650 passes at 72.9% but flips a fairness test — see 6.6.

### 5.4 Check 16 — not an orientation tax; it is contact density

Criterion: the compact block must not win more than 75%. Measured over the **full
100-seed run**: **block 100%**.

The doc's hypothesis is that the *"thuế hướng"* (orientation tax) is too heavy on
wide bodies. The measurement does not support that. Over 100 seeds, with both
bodies identical in tile count (60), combat count (48), motor count (12) and
brain:

| | mean `orientMul` | mean `impactMul` | hits landed | total damage |
|---|---|---|---|---|
| Block | 934.1 | 988.4 | **57,642** | 1,245,283 |
| WideWing | **945.2** | 989.5 | 47,625 | 1,043,744 |

The wide wing's orientation is **better**, not worse. It loses because it lands
**21% fewer hits**. The mechanism is geometry, not orientation: the block's
bounding radius is 3,496 milli against the wide wing's 5,971, so a compact body
concentrates its tiles at the contact point and keeps more of them in reach,
while the wide body is a larger target that gets pushed around.

The orientation sweep confirms it: check 16 reads 100% at every value of
`ORIENT_BASE` from 850 down to 765. Widening the orientation span does not touch
this check, because the check was never about orientation.

> The `ORIENT_BASE` sweep in this subsection was **re-measured 2026-09-19**
> (`tools/proposal-orientation-sweep.mjs`, `quick: true, seeds: 16`): check 16
> reads `block wins 100.0%` at every value, so it reproduces. The contact-density
> table above is from `tools/check16-contact-density.mjs` and is **historical, not
> re-run in this revision**. The verdict itself (block 100%, full 100-seed run) is
> confirmed by `reports/balance-verify.md`.

### 5.5 Sample-bot matchup web

Overall win share across the five sample bots (from the full run): Spear 26%,
Shield 84%, Flanker 69%, Spinner 74%, GlassCannon 4%.

The five-bot matchups form a genuine web rather than a ladder, which is the
property `gameplay.md` 7.2 calls *"cột mốc quan trọng nhất của game"*:

| A | B | A wins | B wins | draws |
|---|---|---|---|---|
| Spear | Shield | 0 | 100 | 0 |
| Spear | Flanker | 6 | 94 | 0 |
| Spear | Spinner | 0 | 100 | 0 |
| Spear | GlassCannon | 85 | 15 | 0 |
| Shield | Flanker | 86 | 13 | 1 |
| Shield | Spinner | 50 | 50 | 0 |
| Shield | GlassCannon | 100 | 0 | 0 |
| Flanker | Spinner | 52 | 46 | 2 |
| Flanker | GlassCannon | 100 | 0 | 0 |
| Spinner | GlassCannon | 100 | 0 | 0 |

- Shield beats Spear 100–0, beats Flanker 86–13 and GlassCannon 100–0, but only
  **ties Spinner 50–50**
- Flanker beats Spear 94–6, edges Spinner 52–46 and beats GlassCannon 100–0, but
  **loses to Shield 13–86**
- Spinner beats Spear 100–0 and GlassCannon 100–0, ties Shield 50–50, and
  **narrowly loses to Flanker 46–52**
- Spear beats GlassCannon 85–15 and loses to everything else
- GlassCannon is the extreme archetype the spec asks for — *"Đánh trước, đánh
  chết, hoặc chết"* — and loses to all four

### 5.6 Other findings carried forward

- **The diversity resonance is a tax, not a shield.** The mixed bot wins the same
  matchups with and without it (check 17). `can_bang.md` 6.5 predicted it only
  contributes 1.22–1.29×; the measurement says it is not decisive and could be
  dropped to reduce complexity.
- **Face coverage is structural.** A connected body on this lattice is bipartite
  by orientation, so check 11's "interleave up and down" is not available as a
  tactical choice.
- **SPEAR beats its own blindfold variant 54–45** (full 100-seed run). (An
  earlier draft claimed the opposite; the current run shows Spear winning.) The
  margin is small and its cause is **not** re-established here — the
  `stuckTicks > 12` back-off rule is a plausible contributor, but it was not
  isolated in this revision.
- **`HIT_COOLDOWN_TICKS` is the match-length lever** and is now 12, the top of the
  range `can_bang.md` 10 check 12 prescribes.

---

## 6. Open items

M1's gate is met. What is left is design work that the docs explicitly defer:

1. **Checks 10 and 16 need a mechanic decision, not a patch.** They look like one
   problem but are two. Check 10's orientation penalty is pinned by the bipartite
   lattice — 42% of hits sit at the 850 floor (histogram, §5.2) regardless of what
   the brain does — and sweeping `ORIENT_BASE` from 850 to 765 changes it not at
   all (sweep, §5.2), so no constant can fix it. Check 16 is not about orientation
   at all: the wide wing's orientation is *better*, and it loses because a compact
   body lands 21% more hits. Full analysis, including the three routes available
   for check 10, in `reports/proposal-checks-10-16.md`.
2. ~~**Produce the Linux half of the digest.**~~ — **done 2026-09-19** (see §3.4);
   the digest is reproduced identically on Linux. Follow-up: add a CI job so the
   evidence stays fresh automatically.
3. **Consider dropping the diversity resonance** (finding 5.6).
4. **Revisit SPEAR's back-off rule** (finding 5.6).
5. M2 is the local-first web lab — draft, version and queue on `localStorage`.
   Account, database, auth and matchmaking are M3 and are deliberately not
   treated as done.
6. **The mirrored-bot fairness test is fragile and should be reformulated.**
   `determinism.test.ts` asserts that two identical bots in mirrored poses score
   *identically*. That holds at `IMPACT_COMMIT_BASE = 675` and above, but breaks at
   650, where the symmetry goes at tick 272 (scores 750 vs 829). The commitment
   factor is not the cause — it computes mirrored inputs to mirrored outputs and is
   provably symmetric. The cause is the pre-existing order-dependent tie-break in
   the separation step, which means the engine never structurally guaranteed
   per-match mirror symmetry; the test simply happens to pass for many parameter
   values. It should assert the property that *is* guaranteed — zero label bias
   over many seeds — instead of per-match mirror equality.
7. **The damage formula is now five factors, not four.** `can_bang.md` 3.3 states
   four. The alternative is to fold the commitment term into the impact
   multiplier, which is what the doc prescribes — and that is exactly what
   collides with check 8. The trade is one extra factor in exchange for keeping
   the blocking RPS invariant and the calibration check intact. See also §7.

---

## 7. Documented deviations from can_bang.md

Three constants differ from the literal text of `can_bang.md`. Each is either an
explicitly permitted tuning switch or a documented consequence of a later fix;
none is silent — all three are noted in the source.

| Deviation | Doc says | Code uses | Basis |
|---|---|---|---|
| All tile HP | 70 / 105 / 168 / 80 | **×6** → 420 / 630 / 1008 / 480 (`packages/contracts/src/ruleset.ts:133 HP_SCALE = 6`) | `can_bang.md` check 12 names exactly this switch (*"tăng máu toàn bộ tam giác theo cùng tỉ lệ, giữ máu × sát thương = 1680"*); the HP × damage product is still identical across the three combat types |
| `HIT_COOLDOWN_TICKS` | 6 | **12** | check 12 permits the 10–12 range |
| Damage formula | 4 factors | **5 factors** (adds `commit`; `packages/contracts/src/ruleset.ts:411–415`) | consequence of the check-14 fix; see `reports/proposal-check14.md` |

---

## 8. Independent audit

The M1 milestone was **independently audited by QA on 2026-09-19**. The audit
re-ran every piece of gate evidence from scratch rather than trusting this
report: build, the 105-test suite, `hash100` twice, a `simulate` + `replay`
round-trip, and the full `balance --seeds 100` run.

**Conclusion: the M1 gate PASSES** — all three of its clauses carry self-measured
evidence:

1. two bots complete a match;
2. re-running gives the same result;
3. Windows and Linux produce the same 100-seed hash.

The audit also confirmed the two balance checks that remain **FAIL (10 and 16)**,
and the measurement-quality issues that this revision fixes (the empty check-20
pass, the missing check-13 criterion b, and the non-reproducible figures in the
earlier report). The full audit is in `reports/m1-audit-2026-09-19.md`.
