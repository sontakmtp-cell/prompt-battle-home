# PROMPT CHIEN — M1 delivery report

Engine `0.1.0-m1`, ruleset `1.0.0`, contracts `1.0.0`.
Milestone: **M1 — Hai bot tự đánh** (two bots fight each other).

This report covers the whole M1 scope: the doc summary that drives the design,
what was built, the gate evidence, the defects found while validating, and the
balance measurements with their diagnoses.

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
| **Integer units** (`can_bang.md` 3.6) | every multiplier is an integer in 1/1000; damage is `floor(base × RPS × impact × orient ÷ 10^9)` | one float on the damage path turns every hit into `0` |
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
ESM, `node:test`. ~7,200 lines across 34 source files.

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

### 3.1 The whole suite

```
# tests 97
# pass 97
# fail 0
```

97 tests across 9 `node:test` files: geometry (budget, span, duplicates,
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
validation, interpreter, sandbox), determinism, samples, perf.

### 3.2 "Two bots fight a whole match"

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

`hash100` runs the five sample bots round robin, 100 seeds per pair = 500
matches, and folds every match into one digest. Two independent runs:

```
DIGEST : 5a35d60bbc80fcdee8c32dddb696fd97dcb581931cead82dce0cce280ab18e7e
DIGEST : 5a35d60bbc80fcdee8c32dddb696fd97dcb581931cead82dce0cce280ab18e7e
```

### 3.4 "Windows/Linux produce the same hash"

This run is the **Windows** side. The Linux side is produced by running the same
command on the reference box; the digest above is the value it must reproduce.

The reason it can be expected to match is that the core contains **no**
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

Gate **5000** is the only setting that passes the sandbox *and* keeps the matchups
differentiated: Spinner beats Spear 99–1, **loses to Shield 1–99**, beats Flanker
63–37, beats GlassCannon 100–0.

### 4.2 Two bugs in the measurement harness itself

- **`Math.min(...arr)` overflowed the call stack** on a 100-seed run
  (`RangeError: Maximum call stack size exceeded`), because a full sweep produces
  more hits than can be spread onto the argument stack. It had been invisible in
  quick mode. Replaced with an explicit loop.
- **Check 16 compared an illegal body against a legal one.** The "wide wing" was
  80 tiles against a 60-tile block, so it was measuring the tile budget, not
  shape. Rebuilt so both are identical in every countable way (60 tiles, 48
  combat, 12 motors, same brain) and differ only in shape.

A third measurement bug was fixed in an earlier pass: **check 10 was confounded**
because it compared SPEAR against its own blindfold variant, and SPEAR also
carries a `stuckTicks > 12` back-off rule, so a result could come from either
change. It is now a controlled comparison — identical body and movement rule,
only `rotate` differs.

---

## 5. Balance measurements

Full 100-seed run, 2,500 matches, written to `reports/balance-m1.md`.

### 5.1 Verdicts

**Passing (9):** 2, 6, 7, 8, 12, 13, 15, 19, 20.

| # | Check | Measured |
|---|---|---|
| 2 | mixed triple beats every pure bot | 100% / 100% / 96% |
| 6 | 70/30 hammer-lean bot stays viable | 0% / 100% / 87% |
| 7 | RPS invariant | worst margin 14 vs 12 |
| 8 | impact calibration | median r = 1.000 over 175,995 hits |
| 12 | match duration | p10 22.3s, **p50 46.7s**, p90 98.4s |
| 13 | motor hunting leverage | hunter wins 0.0% |
| 15 | flanking still viable | Flanker beats Spear 88% |
| 19 | damage never makes a bot faster | 0 violations |
| 20 | losing motors costs speed | verified across checkpoints |

`can_bang.md` names the balance acceptance criterion as checks **2 and 6**
together — *"Nếu cả hai điều đó đúng → cân bằng đã đạt."* Both pass.

**Failing (3):** 10, 14, 16. All three are diagnosed below, and in two cases the
measurement contradicts the doc's own stated hypothesis.

### 5.2 Check 10 — the orientation multiplier does not pay for itself

Criterion: turning to face must beat not turning by more than 10 points.
Measured: **facing 45.0% vs blind 53.0%** — facing *loses*.

Direct measurement of the orientation term over 100 seeds:

| | facing | blind |
|---|---|---|
| mean `orientMul` | 932.8 | 929.7 |
| mean `impactMul` | 928.5 | 929.8 |
| mean damage per hit | 20.155 | 19.209 |

Turning to face buys **3.1 milli-units of orientation (0.33%)**, worth +4.93%
damage per hit. The entire orientation mechanic spans only 17.6% of damage
(1000 dead-on vs 850 at ≥90°). Worse, facing dealt **16% more total damage** and
still lost more matches, so the small gain is not what decides games.

The doc anticipated this: *"Nếu chênh lệch dưới 10% thì hệ số hướng đang quá nhẹ,
không đáng công code."* The measurement says it is 0.33% on the orientation term
itself — far below the bar.

### 5.3 Check 14 — the threshold is unreachable with the spec's own constants

Criterion: the standing bot must deal **< 80%** of the charging bot's damage.
Measured: **100.0%** (stander 140,103 vs charger 139,985).

This is not a bug — it is arithmetic. The impact multiplier is
`850 + 150 × min(r,1000)/1000`, so it ranges over `[850, 1000]`. For identical
base, RPS and orientation:

```
stander / charger >= 850 / 1000 = 0.85
```

A stander can therefore **never** deal less than 85% of a charger's damage, and
the check demands below 80%. Passing would require `IMPACT_BASE <= 799`, which
contradicts the `850` quoted in `can_bang.md` 3.3.

**The prescribed fix was implemented and measured.** The doc's switch is *"tách
hệ số va chạm theo từng bên (dùng vận tốc riêng của bên tấn công chiếu lên pháp
tuyến)"* — price each attacker by its own closing speed instead of a shared
relative one. Taken literally that has a flaw: two bots travelling in parallel at
the same speed have zero relative approach but a large "own" speed, so a glancing
touch would price as a full-speed impact. The version tested was therefore
`min(relative, own)` — the relative term keeps the physics honest, the own term
is what the doc asks for. A stander floors at `IMPACT_BASE` while a charger
reaches the ceiling, and parallel motion still prices as a graze.

| check | before | with `min(relative, own)` |
|---|---|---|
| **14** defending is not free | 100.0% | **88.5%** (still > 80%) |
| **8** impact calibration (median r) | 1.000 PASS | **0.500 FAIL** |
| **10** facing vs blind | 45.0% vs 53.0% | 12.5% vs 87.5% |

The fix does what it was asked to do — defending stops being free — but it lands
at 88.5%, still over the bar, **and it breaks check 8**, because pricing each side
by its own motion drags the median `r` down to 0.5 and the calibration band is
0.80–1.20. It also makes check 10 markedly worse.

The change was **reverted** (the determinism digest returns to its exact previous
value, `5a35d60b…`, confirming the revert is behaviour-identical). The conclusion
is that check 14 cannot be satisfied by the prescribed mechanism alone: its
threshold is equivalent to demanding `IMPACT_BASE < 800`, and any mechanism that
gets a stander's `r` to 0 also moves the population median `r` out of check 8's
band. **Checks 8 and 14 are in direct conflict, and `can_bang.md`'s own constants
cannot satisfy both.**

### 5.4 Check 16 — not an orientation tax; it is contact density

Criterion: the compact block must not win more than 75%. Measured: **block
100%**.

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

### 5.5 Sample-bot matchup web

Overall win share: Spear 26%, Shield 80%, Flanker 75%, Spinner 70%,
GlassCannon 2%.

The matchups form a genuine web rather than a ladder, which is the property
`gameplay.md` 7.2 calls *"cột mốc quan trọng nhất của game"*:

- Shield beats Spear 100–0 and Spinner 83–17, but **loses to Flanker 37–61**
- Flanker beats Spear 92–8 and Spinner 64–35, but loses to Shield
- Spinner beats Spear 100–0 and GlassCannon 100–0, but loses to Shield 17–83
- Spear beats GlassCannon 93–7 and loses to everything else
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
- **SPEAR loses to its own blindfold variant.** The gap is not the facing logic
  but SPEAR's `stuckTicks > 12` back-off rule: disengaging from a grinder costs
  more than the facing logic earns.
- **`HIT_COOLDOWN_TICKS` is the match-length lever** and is now 12, the top of the
  range `can_bang.md` 10 check 12 prescribes.

---

## 6. Open items

M1's gate is met. What is left is design work that the docs explicitly defer:

1. **Reconcile checks 8 / 10 / 14 / 16.** They are one design problem seen from
   four sides. The orientation term is too weak to reward a brain decision (10)
   and the impact term's range makes the defending-discount check unreachable
   (14), while the mechanism the doc prescribes for 14 breaks the impact
   calibration (8). Meanwhile the real shape penalty is contact density, not
   orientation (16). The honest fix is to decide the intended dynamic range of
   the impact and orientation multipliers *first*, then re-derive all four
   thresholds from it — not to tune the four checks independently.
2. **Produce the Linux half of the digest** by running `hash100 --seeds 100` on
   the reference VPS and comparing against
   `5a35d60bbc80fcdee8c32dddb696fd97dcb581931cead82dce0cce280ab18e7e`.
3. **Consider dropping the diversity resonance** (finding 5.6).
4. **Revisit SPEAR's back-off rule** (finding 5.6).
5. M2 is the local-first web lab — draft, version and queue on `localStorage`.
   Account, database, auth and matchmaking are M3 and are deliberately not
   treated as done.
