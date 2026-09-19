import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  damageSpeedStatus,
  hunterLeverageStatus,
  mixedTripleStatus,
  motorLossStatus,
  rpsInvariantStatus,
  runBalanceSuite,
} from '../src/balance/harness.js';

// ---------------------------------------------------------------------------
// check 20 - motor-loss verdict (the vacuous-pass regression)
// ---------------------------------------------------------------------------

/**
 * This is the regression test for a real bug: balance check 20 used to report
 * 'pass' when it observed NOTHING, because its inline status was
 * `losses === 0 || drops > 0 ? 'pass' : 'fail'`. A check that measured no
 * motor-loss event measured nothing, so it must never be green. The rule now
 * lives in the exported motorLossStatus() so this test can pin it.
 */
test('balance: a check that observed no motor-loss event must never report pass', () => {
  assert.equal(motorLossStatus(0, 0), 'info', 'zero events, zero drops is a no-op, not a pass');
  // losses === 0 must win over EVERY drops value, including a nonsensical one.
  assert.equal(motorLossStatus(0, 5), 'info', 'no loss event means nothing was measured');
});

test('balance: motor-loss verdict follows the observed drops', () => {
  assert.equal(motorLossStatus(5, 3), 'pass', 'a drop was observed among real loss events');
  assert.equal(motorLossStatus(5, 0), 'fail', 'loss events happened but none dropped the multiplier');
  assert.equal(motorLossStatus(135, 102), 'pass', 'the full 100-seed run drops on most losses');
});

// ---------------------------------------------------------------------------
// check 19 - damage-vs-speed verdict (same vacuous-pass class as check 20)
// ---------------------------------------------------------------------------

/**
 * Check 19 had the same shape of bug as check 20: its status was
 * `violations === 0 ? 'pass' : 'fail'` while `checked` could stay 0 if no match
 * lived long enough to compare two checkpoints, so it could report
 * "0 violations in 0 matches" as a green pass. Same rule applies: nothing
 * measured is 'info', never 'pass'.
 */
test('balance: a check with no comparable match must never report pass', () => {
  assert.equal(damageSpeedStatus(0, 0), 'info', 'no comparable match is a no-op, not a pass');
  // checked === 0 must win over EVERY violations value.
  assert.equal(damageSpeedStatus(0, 3), 'info', 'no comparable match means nothing was measured');
});

test('balance: damage-speed verdict follows the observed violations', () => {
  assert.equal(damageSpeedStatus(5, 0), 'pass', 'matches were compared and nothing sped up');
  assert.equal(damageSpeedStatus(5, 2), 'fail', 'matches were compared and two sped up');
});

// ---------------------------------------------------------------------------
// checks 2 and 7 - empty-list verdicts (same vacuous-pass class)
// ---------------------------------------------------------------------------

// check 2 — Array.every() on an empty list is true, so an empty matchup list
// would have reported a vacuous pass without playing a single game.
test('balance: an empty matchup list must never report pass', () => {
  assert.equal(mixedTripleStatus(0, true), 'info', 'Array.every() is true on empty, but nothing was compared');
  assert.equal(mixedTripleStatus(3, true), 'pass', 'three matchups compared, all won');
  assert.equal(mixedTripleStatus(3, false), 'fail', 'three matchups compared, not all won');
});

// check 7 — worstMargin is seeded with Number.MAX_SAFE_INTEGER, so an empty
// pair list would look like a huge positive margin.
test('balance: an empty RPS pair list must never report pass', () => {
  assert.equal(
    rpsInvariantStatus(0, Number.MAX_SAFE_INTEGER),
    'info',
    'the MAX_SAFE_INTEGER seed is not a measured margin',
  );
  assert.equal(rpsInvariantStatus(3, 2), 'pass', 'pairs compared, worst margin still positive');
  assert.equal(rpsInvariantStatus(3, 0), 'fail', 'pairs compared, worst margin is not positive');
  assert.equal(rpsInvariantStatus(3, -1), 'fail', 'pairs compared, worst margin is negative');
});

// ---------------------------------------------------------------------------
// check 13 - hunter leverage needs BOTH criteria
// ---------------------------------------------------------------------------

/**
 * can_bang.md section 10 check 13 has two criteria and BOTH must hold:
 * (a) the hunter must not win more than 70%, and (b) the hunted bot's mean
 * speed must stay above 60% of its own maximum. Note the threshold is a
 * STRICT `> 0.6`, so exactly 0.6 fails while 0.61 passes - the boundary is the
 * easiest place to get this wrong.
 */
test('balance: hunter leverage needs BOTH criteria', () => {
  assert.equal(hunterLeverageStatus(2, 0.995), 'pass', 'both criteria hold comfortably');
  assert.equal(hunterLeverageStatus(80, 0.995), 'fail', 'hunter wins too often (> 70%)');
  assert.equal(hunterLeverageStatus(2, 0.5), 'fail', 'hunted bot lost too much speed');
  // boundary: the speed test is strict, the win-rate test is inclusive
  assert.equal(hunterLeverageStatus(70, 0.6), 'fail', '0.6 does not clear the strict > 0.6 bar');
  assert.equal(hunterLeverageStatus(70, 0.61), 'pass', '70% is allowed, 0.61 clears the bar');
});

// ---------------------------------------------------------------------------
// integration - the real suite, smallest configuration that returns a report
// ---------------------------------------------------------------------------

test('balance: the suite reports structural invariants, never a vacuous pass', () => {
  const started = Date.now();
  const report = runBalanceSuite({ seeds: 2 });
  const elapsedMs = Date.now() - started;
  console.log(`[balance.test] runBalanceSuite({ seeds: 2 }) took ${elapsedMs}ms`);

  assert.ok(report.checks.length > 0, 'the suite must emit checks');

  const ids = new Set<number>();
  for (const check of report.checks) {
    assert.ok(check.criterion.length > 0, `check ${check.id} has an empty criterion`);
    assert.ok(check.measured.length > 0, `check ${check.id} has an empty measured`);
    assert.ok(!ids.has(check.id), `check id ${check.id} is duplicated`);
    ids.add(check.id);

    // The invariant that would have caught the original bug: an empty
    // observation is reported as 'info' and must NEVER be reported as 'pass'.
    if (check.measured.startsWith('no motor-loss event observed')) {
      assert.equal(check.status, 'info', `check ${check.id} observed nothing but reported ${check.status}`);
    }

    const lossEvent = /(\d+)\/(\d+) motor-loss events/.exec(check.measured);
    if (lossEvent) {
      const losses = Number(lossEvent[2]);
      assert.ok(losses > 0, `check ${check.id} claims motor-loss events with a zero denominator`);
      assert.notEqual(check.status, 'info', `check ${check.id} observed events but reported info`);
    }

    // Same class of bug, check 19: "N violations in M matches". M === 0 means
    // nothing was compared, which must be 'info'; M > 0 means something was.
    const damageCheck = /(\d+) violations in (\d+) matches/.exec(check.measured);
    if (damageCheck) {
      const matches = Number(damageCheck[2]);
      if (matches === 0) {
        assert.equal(check.status, 'info', `check ${check.id} compared nothing but reported ${check.status}`);
      } else {
        assert.notEqual(check.status, 'info', `check ${check.id} compared matches but reported info`);
      }
    }
  }
});
