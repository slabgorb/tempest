// tests/core/sim.difficulty.test.ts
//
// Story 3-4 — Difficulty ramp continues past the geometry cycle.
//
// The 16 tube geometries cycle with period 16 (level 17 reuses the level-1
// circle). Difficulty MUST NOT reset on that wrap: speeds keep rising, spawn
// cadence keeps tightening (down to playable floors), and — the new behavior
// this story adds — the *enemy mix* opens up further on later cycles so a
// returning player meets a harder roster on a geometry they have already seen.
//
// These tests exercise the pure-core rules functions directly with a seeded
// RNG, so they are fully deterministic and need no DOM/canvas (CLAUDE.md hard
// boundary: core stays pure and reproducible).

import { describe, it, expect } from 'vitest'
import { levelParams } from '../../src/core/rules'

// The three rollSpawnKind-DIRECT suites (roster/introduction, per-cycle escalation, and roll
// determinism) are REMOVED by tp1-8: NYMCHA replaces the weighted roll, and the per-cycle
// SPAWN_CYCLE_HARD_SCALE escalation those tests exercised is deleted (the ROM has no per-cycle
// axis — its per-wave min/max tables ARE the difficulty ramp). The introduction schedule and the
// per-wave composition are now covered per-wave by tests/core/tp1-8.nymcha.test.ts. The
// levelParams SPEED/COUNT ramp below is unaffected and stays.

describe('levelParams ramps past the geometry cycle (AC#1, AC#2)', () => {
  it('difficulty rises over the long run, following the ROM per-wave tables (RE-SEATED by tp1-7)', () => {
    // This `it` used to assert every speed AND the enemy count rise MONOTONICALLY across the
    // level-16 -> 17 geometry wrap (p20 > p16). The ROM refutes that outright:
    //   • TINVIN (W-012) DIPS at wave 17 — invaders restart at -81, SLOWER than wave 16's -96.
    //   • TNYMMX (W-011) drops the count too — 27 at wave 16, 23 at wave 20.
    // So the per-wave curve is NOT a monotonic ramp; its exact shape is the ROM's, pinned in
    // tp1-7.contour-tables.test.ts. What survives of story 3-4's AC#1 is (a) the LONG-RUN rise
    // and (b) that the geometry wrap is not a difficulty RESET — the latter now carried by the
    // enemy MIX (the hard-enemy escalation below), not a hand-tuned per-level speed curve.
    expect(levelParams(33).flipperSpeed).toBeGreaterThan(levelParams(1).flipperSpeed)
    expect(levelParams(33).enemyCount).toBeGreaterThan(levelParams(1).enemyCount)
    // The wave-17 dip is REAL and intended (W-012). This is the assertion that replaces the
    // refuted p20 > p16: a step DOWN, not up, right after the wrap.
    expect(levelParams(17).flipperSpeed).toBeLessThan(levelParams(16).flipperSpeed)
  })

  // 'keeps spawn cadence tightening across the cycle boundary' stood here, pinning
  // `spawnInterval`. tp1-6 (W-003) deleted the metronome it measured: there is no
  // spawn timer anywhere in ALWELG — release pacing is ININYM's 16-frame stagger
  // under slot back-pressure, and the per-wave enemy BUDGET (still asserted above
  // via enemyCount) is what actually ramps. tp1-7's TNYMMX transcription owns the
  // authentic per-wave counts. (`flipInterval` fell the same way in tp1-4, and
  // `pulseInterval` in tp1-5 — the ramp keeps losing numbers that were never the
  // ROM's to scale.)

  it('keeps speeds finite and RISING past the L33 tier — they are not capped there (RE-SEATED by tp1-7)', () => {
    // The old assertion was `flipperSpeed(50) <= flipperSpeed(33)` — it assumed the L33 tier
    // was the fast cap. TINVIN refutes it (W-012): the table keeps climbing after 33 (-108 at
    // 33-39, -110 at 40-48, -120 at 49-64), so level 50 is strictly FASTER than level 33. The
    // survivor of AC#2 is only that the speed stays finite and does not collapse.
    const p = levelParams(50)
    expect(p.flipperSpeed).toBeGreaterThan(0)
    expect(p.flipperSpeed).toBeGreaterThan(levelParams(33).flipperSpeed)
  })
})
