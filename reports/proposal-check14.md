# Proposal — resolving the check 8 / check 14 conflict

Status: **proposed and measured, not committed.** The change is sitting in the
working tree (97/97 tests pass) and saved as `reports/proposal-check14.patch`.
Say the word and it gets committed, or it gets reverted.

---

## 1. Root cause: it is a four-part lock, not one bad number

### 1.1 Check 14 cannot be satisfied by the shared relative speed

Check 14 wants `stander / charger < 0.80`. The impact multiplier is

```
impact = IMPACT_BASE + floor(IMPACT_RANGE × min(r, 1000) / 1000)
       = 850 + floor(150 × min(r,1000)/1000)          ∈ [850, 1000]
```

`r` is the **relative** closing speed, so it is *the same number for both
sides*. Both attackers therefore get the same `impact`, and the ratio is exactly
`100%` — for **any** value of `IMPACT_BASE`. This is why the check reads 100.0%
rather than something merely too high: the asymmetry is structurally absent.

So check 14 requires a per-side term. That is exactly what `can_bang.md` 10 says
to do.

### 1.2 But a per-side term inside the impact multiplier breaks check 8

Check 8 derives its measurement by **inverting** the multiplier the engine
reported on each hit:

```
r = (impactMul − IMPACT_BASE) × 1000 / IMPACT_RANGE
```

Any per-side modifier folded into `impactMul` therefore pollutes the calibration
reading. Measured: implementing the doc's switch takes the round-robin median `r`
from **1.000 → 0.500** (head-on collisions halve it: `relative ≈ 2 × own`, so
`min(relative, own) ≈ relative/2`).

### 1.3 Lowering `IMPACT_BASE` to buy the asymmetry breaks check 7

Check 14's ratio floor is `IMPACT_BASE / IMPACT_R_MAX = 850/1000 = 0.85`, so
`< 0.80` needs `IMPACT_BASE < 800`. But check 7 — the **blocking** RPS invariant
— is computed directly from `IMPACT_BASE`:

```
weakestAdv    = computeDamage(base[att], rps_adv, IMPACT_BASE,   ORIENT_BASE)
strongestDis  = computeDamage(base[def], rps_dis, IMPACT_R_MAX,  ORIENT_LUT[0])
```

For the tightest pair (paper → hammer):

```
weakestAdv   = floor(10 × 2000 × 850 × 850 / 1e9) = 14
strongestDis = floor(24 ×  500 × 1000 × 1000 / 1e9) = 12
margin = 2
```

A margin of **2**. The invariant needs `IMPACT_BASE ≥ 765` to keep it. Measured:
check 7 fails at `IMPACT_BASE ≤ 750`.

**So `IMPACT_BASE` is pinned from below by check 7 and from above by check 14.**

### 1.4 `RPS_ADVANTAGE` cannot rescue it

The doc's priority order says to raise `RPS_ADVANTAGE` first when damage is too
low. That route is closed, because `RPS_ADVANTAGE` and `HAMMER_DAMAGE` are
jointly pinned by a hard acceptance criterion (`PLAN.md`): Hammer → Scissor
perfect must be **exactly 48**.

```
24 × 2000 × 1000 × 1000 / 1e9 = 48
```

Raising `RPS_ADVANTAGE` requires lowering `HAMMER_DAMAGE` to keep 48, which
re-derives the whole damage table. It is possible (2400/20 also gives 48) but it
is a full re-balance, not a fix.

### 1.5 And check 8 was measuring the wrong scenario

`can_bang.md` 10 check 18 defines the scenario explicitly: *"a balanced bot
charging at full speed into a stationary bot — measure the actual r"*. The
harness instead took the median `r` over **every hit in a round robin**, which
mixes in glancing contacts and stops measuring calibration at all once the impact
term is priced per side. That mismatch is what made the per-side fix *look* like
it broke check 8.

---

## 2. The measurement

Every naive option breaks something. Only separating the two concerns passes
everything.

| configuration | check 7 (blocking) | check 8 | check 12 | check 14 |
|---|---|---|---|---|
| **as shipped** — shared `r`, 850/150 | PASS | PASS 1.000 | PASS | **FAIL 100.0%** |
| doc's switch — per-side impact + corrected check 8 | PASS | PASS 0.973 | PASS | FAIL 88.5% |
| …plus `IMPACT_BASE` 800/200 | PASS | **FAIL 0.735** | PASS | FAIL 85.5% |
| …plus `IMPACT_BASE` 750/250 | **FAIL** | PASS 0.960 | PASS | FAIL 82.3% |
| …plus `IMPACT_BASE` 700/300 | **FAIL** | PASS 0.943 | PASS | PASS 77.6% |
| **proposed** — commitment factor 675/325 | **PASS** | **PASS 0.980** | **PASS** | **PASS 75.7%** |

Check 12 is included because it is the check most likely to be disturbed by a
damage-model change (longer matches). It never leaves the 40–80 s band.

---

## 3. Recommendation

**Put the asymmetry in its own factor and leave `IMPACT_BASE` alone.**

The insight is that two different questions were being answered by one number:

- **"How hard did these two things collide?"** → physics → the *relative* closing
  speed. This is what check 8 calibrates, and it should stay untouched.
- **"How much did this attacker contribute to the collision?"** → design → the
  attacker's *own* closing speed. This is what check 14 is actually asking for.

So the damage pipeline becomes five factors instead of four:

```
damage = floor( base × RPS × impact(relative) × orient × commit(own) / 1e12 )
```

with

```ts
commitmentMultiplier(rs, ownSpeed) =
  IMPACT_COMMIT_BASE + floor(IMPACT_COMMIT_RANGE × min(ownR, 1000) / 1000)
```

- A bot that does not drive into the contact gets `IMPACT_COMMIT_BASE`.
- A bot at full reference speed gets `1000`, so the perfect-hit ceiling
  (Hammer → Scissor = 48) is preserved exactly.
- Parallel motion at equal speed still prices as a graze, because the *relative*
  term is still what sets the impact.

### Why this specific value: 675 / 325

| `IMPACT_COMMIT_BASE` | check 14 | verdict |
|---|---|---|
| 750 | 82.2% | over the bar |
| 700 | 78.8% | passes, but only 1.2 points of headroom |
| **675** | **75.7%** | **passes, 4.3 points of headroom — chosen** |
| 650 | 72.9% | passes, but flips the mirrored-bot fairness test (see 4.1) |

Checks 7, 8 and 12 pass at **every** value in this table, which is the whole
point of not touching `IMPACT_BASE`.

### Changes in the patch

| file | change |
|---|---|
| `contracts/ruleset.ts` | `IMPACT_COMMIT_BASE` / `IMPACT_COMMIT_RANGE` + `commitmentMultiplier()` |
| `contracts/types.ts` | `commitMul` on the hit event, so a hit stays fully reconstructible |
| `engine/collision.ts` | expose each side's own closing speed along the normal |
| `engine/simulate.ts` | apply the commitment factor to damage; keep `impactMul` a pure relative value |
| `balance/harness.ts` | check 8 measured in the doc's scenario, round-robin median kept as an info line |
| `test/engine.test.ts` | the damage-formula test now includes the commitment factor |

### Result after the change

- **10 of 12** pass/fail checks pass (was 9). Checks 10 and 16 remain, and they
  are a separate design question.
- 97/97 tests pass.
- New determinism digest: `3bebc8f47d6146917bab1032a82d60d50a7ff97465c7511fecce1b47a7219832`
  (was `5a35d60b…` — expected, the damage model changed).
- Sample-bot win shares barely move: Shield 84%, Spinner 74%, Flanker 69%,
  Spear 26%, GlassCannon 4%.
- Check 10 improves slightly (Facing 54% / Blind 45%, was 45/53) but still fails.

---

## 4. Caveats and follow-ups

### 4.1 The mirrored-bot fairness test is fragile

`determinism.test.ts` asserts that two identical bots in mirrored poses score
**identically**. That passes at 675 (and at 700/750/850/with the factor disabled)
but flips at 650, where the symmetry breaks at tick 272 (scores 750 vs 829).

This is **not** caused by the commitment factor — that factor is provably
symmetric (`ownA` and `ownB` are computed from `-n` and mirror exactly under the
swap). It is the pre-existing order-dependent tie-break in the separation step:
the engine resolves a depth tie by iteration order, so it does not structurally
guarantee per-match mirror symmetry. The test happens to pass for many parameter
values and fails for others.

Recommendation: keep 675 for now (it passes), and reformulate that test to assert
the property that *is* guaranteed — zero label bias over many seeds — rather than
per-match mirror equality.

### 4.2 The five-factor formula

`can_bang.md` 3.3 states the damage formula as four factors. This proposal adds a
fifth. The alternative is to keep four factors by folding commitment into the
impact term, which is what the doc prescribes — but that is precisely what
collides with check 8 (§1.2). The trade is: one extra factor in exchange for
keeping the blocking invariant and the calibration check intact. If the four-factor
shape is treated as inviolable, the only remaining route is §1.3 + §1.4, i.e. a
full re-derivation of the damage table.

### 4.3 Checks 10 and 16 are untouched

Both remain failing and both are now better understood: the orientation term
spans only 17.6% of damage, and check 16's real mechanism is contact density
rather than orientation. They need a decision about the intended dynamic range of
the orientation multiplier, which is a separate piece of work.
