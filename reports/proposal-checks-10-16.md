# Proposal — checks 10 and 16

Status: **analysis only. No code change proposed, and none made.** Both checks
turn out to need a mechanic decision rather than a constant, and the evidence
below is what rules the constant-tuning route out.

---

## 1. The hypothesis I tested, and how it failed

Check 10 was sitting at **facing 50% vs blind 50%** — needing a 10-point gap. The
orientation multiplier spans only 17.6% of damage (1000 dead-on → 850 at ≥90°),
which is exactly what `can_bang.md` check 10 warns about: *"Nếu chênh lệch dưới
10% thì hệ số hướng đang quá nhẹ, không đáng công code."*

So the obvious move is to widen the span. The floor is `ORIENT_BASE`; the ceiling
is pinned at 1000 by the "Hammer → Scissor perfect = exactly 48" criterion
(`24 × 2000 × 1000 × 1000 / 1e9 = 48`), so the only lever is lowering the floor.
Swept with `tools/proposal-orientation-sweep.mjs`:

| `ORIENT_BASE` | span | check 10 | check 16 | check 7 margin |
|---|---|---|---|---|
| 850 (shipped) | 17.6% | FAIL 50 / 50 | FAIL 100% | 14 vs 12 |
| 825 | 21.2% | FAIL 50 / 50 | FAIL 100% | 14 vs 12 |
| 800 | 25.0% | FAIL 50 / 50 | FAIL 100% | 13 vs 12 |
| 780 | 28.2% | FAIL 50 / 50 | FAIL 100% | 13 vs 12 |
| 765 | 30.7% | FAIL 50 / 50 | FAIL 100% | 13 vs 12 |

**Widening the span from 17.6% to 30.7% changes check 10 not at all**, and it
costs check 7 margin (the blocking RPS invariant, which also reads `ORIENT_BASE`).
The hypothesis is refuted: the orientation multiplier's *strength* is not the
lever.

## 2. Why: the penalty is a property of the lattice, not of the brain

Histogram of the orientation multiplier actually applied, over ~62,000 hits each
(`tools/check10-orientation-histogram.mjs`):

| | at the 850 floor | at the 1000 ceiling | mean |
|---|---|---|---|
| facing (`rotate: toEnemy`) | **42.0%** | 3.4% | 932.8 |
| blind (`rotate: hold`) | **45.7%** | 2.9% | 929.7 |

Two things fall out of this.

**The distribution is dominated by the floor.** Between 42% and 46% of all hits
take the *maximum* orientation penalty, and only ~3% reach the ceiling. The mean
sits at ~930 because the mass is bimodal: a cluster at 850 and a smear near 1000.

**Turning to face barely moves it** — 42.0% vs 45.7% at the floor. The gap is
worth 3.1 milli-units of mean orientation, i.e. +4.93% damage per hit.

The reason is structural, and it is the same fact `can_bang.md` check 11 records:
**the lattice is bipartite by orientation** — every edge neighbour of an `up` tile
is a `down` tile. So at any contact, roughly half of the attacker's tiles present
the *wrong* face, because a `down` tile's face points the opposite way from an
`up` tile's. Rotating the whole body turns the good faces away exactly as fast as
it turns the bad ones in. The brain has no command that changes which face a
given tile presents at a given contact — `toEnemy` aims the body axis at the
enemy *origin*, which does not control the tile-level contact normal.

That is why the sweep did nothing: the term the brain can influence is the small
residual, and the term that dominates is fixed by geometry.

## 3. So check 10 needs a mechanic decision, not a number

Three honest routes, in increasing cost:

1. **Adjust the criterion.** The doc's own escape hatch is that the orientation
   multiplier may simply be too weak to justify coding — *"không đáng công code"*.
   The measured value is +4.93% damage per hit for turning to face, against a bar
   that requires a >10-point win-rate swing. Accept that facing is a minor
   optimisation and restate check 10 accordingly, or drop the mechanic.
2. **Compute orientation from the tile's own normal rather than the body
   heading.** That would make the term reflect the actual contact geometry, which
   is what the mechanic is trying to reward. It is a real change to the damage
   model and would need the whole balance suite re-run — but it is the only route
   that makes the term *responsive to anything the brain does*.
3. **Give the brain a command that controls the contact face** (e.g. a rotate
   that aligns a chosen tile face with the contact normal). This creates the
   tactical decision the mechanic was supposed to create, at the cost of a larger
   instruction set.

I would not pick between these without your call, because they differ in what the
game *is*, not in how well it scores.

## 4. Check 16 is a different problem wearing the same label

Check 16 ("geometry tax on wide wings") reads: the compact block must not win
more than 75%; measured 100%. The doc's stated cause is that the *orientation
tax* is too heavy on wide bodies.

The measurement does not support that. Both bodies are identical in tile count
(60), combat count (48), motor count (12) and brain; only the shape differs.

| | mean `orientMul` | mean `impactMul` | hits landed | total damage |
|---|---|---|---|---|
| Block | 934.1 | 988.4 | **57,642** | 1,245,283 |
| WideWing | **945.2** | 989.5 | 47,625 | 1,043,744 |

The wide wing's orientation is **better**, not worse. It loses because it lands
**21% fewer hits**. The mechanism is contact density: the block's bounding radius
is 3,496 milli against the wide wing's 5,971, so a compact body concentrates its
tiles at the contact point and keeps more of them in reach, while the wide body
is a larger target that gets pushed around.

So check 16 is not an orientation problem at all, and the orientation sweep
confirms it (100% at every value). A lever for it would have to act on how many
tiles are simultaneously in reach — the collision/push model, or a shape-aware
rule — or the criterion has to be restated.

## 5. Recommendation

Both checks are now fully diagnosed, and neither is a bug:

- **Check 10**: the orientation penalty is pinned by the bipartite lattice, not by
  the brain. Tuning cannot fix it — proven by the sweep. Needs a decision on
  route 1, 2 or 3 in §3.
- **Check 16**: the penalty on wide bodies is contact density, not orientation.
  Needs a lever on reach, or a restated criterion.

Both are recorded in `reports/m1-report.md` section 6. The M1 gate does not depend
on either: it is the determinism and whole-match gate, and the balance acceptance
criterion (`can_bang.md` 10: checks 2 and 6 together) passes.
