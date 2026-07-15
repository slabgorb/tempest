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
import { levelParams, rollSpawnKind } from '../../src/core/rules'
import { createRng } from '@arcade/shared/rng'
import type { EnemyKind } from '../../src/core/state'

const ALL_KINDS: EnemyKind[] = ['flipper', 'tanker', 'spiker', 'pulsar', 'fuseball']

// Count how many of `n` seeded rolls land on each kind at a given level.
function rollDistribution(level: number, seed: number, n: number): Map<EnemyKind, number> {
  const r = createRng(seed) // mutable cursor: rollSpawnKind advances it in place
  const counts = new Map<EnemyKind, number>()
  for (let i = 0; i < n; i++) {
    const kind = rollSpawnKind(level, r)
    counts.set(kind, (counts.get(kind) ?? 0) + 1)
  }
  return counts
}

// Fraction of `n` seeded rolls that produce a non-flipper ("hard") enemy.
function hardFraction(level: number, seed: number, n: number): number {
  const r = createRng(seed)
  let hard = 0
  for (let i = 0; i < n; i++) {
    if (rollSpawnKind(level, r) !== 'flipper') hard++
  }
  return hard / n
}

// Ordered list of kinds for a seeded roll sequence (for determinism checks).
function rollSequence(level: number, seed: number, n: number): EnemyKind[] {
  const r = createRng(seed)
  const kinds: EnemyKind[] = []
  for (let i = 0; i < n; i++) {
    kinds.push(rollSpawnKind(level, r))
  }
  return kinds
}

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

describe('rollSpawnKind roster & introduction schedule (AC#3, AC#4)', () => {
  it('opens the full five-enemy roster by level 18', () => {
    // AC#3: deep into the second cycle every kind must be reachable.
    const dist = rollDistribution(18, 7, 4000)
    for (const kind of ALL_KINDS) {
      expect(dist.get(kind) ?? 0).toBeGreaterThan(0)
    }
  })

  it('preserves the authentic ROM early-level introduction schedule (RE-SEATED by tp1-7)', () => {
    // AC#4, corrected by tp1-7/W-035: the introduction is the WTANMX/WSPIMX max tables, not
    // the enemy-roster doc this test used to cite (docs/ux/2026-06-27-enemy-roster-rom-extract.md
    // §H) — which W-035 refutes. Tankers first appear on WAVE 3 and spikers on WAVE 4, not both
    // at level 5. Pulsars (17+) and fuseballs (11+) still stay out. Only the INTRODUCTION waves
    // move; the weighted mix and per-cycle hard scaling are untouched.
    expect(rollDistribution(1, 11, 500)).toEqual(new Map<EnemyKind, number>([['flipper', 500]]))
    expect(rollDistribution(2, 11, 500)).toEqual(new Map<EnemyKind, number>([['flipper', 500]]))

    const d3 = rollDistribution(3, 11, 2000)
    expect(d3.get('tanker') ?? 0, 'tanker enters at wave 3').toBeGreaterThan(0)
    expect(d3.get('spiker') ?? 0, 'the spiker has not yet, at wave 3').toBe(0)

    const d4 = rollDistribution(4, 11, 2000)
    expect(d4.get('spiker') ?? 0, 'spiker enters at wave 4').toBeGreaterThan(0)

    const d5 = rollDistribution(5, 11, 2000)
    expect(d5.get('tanker') ?? 0).toBeGreaterThan(0)
    expect(d5.get('spiker') ?? 0).toBeGreaterThan(0)
    expect(d5.get('pulsar') ?? 0).toBe(0)
    expect(d5.get('fuseball') ?? 0).toBe(0)
  })
})

describe('rollSpawnKind escalates the enemy mix on later cycles (AC core: new behavior)', () => {
  // Levels 5, 21, 37 share the same in-cycle position ((level-1) mod 16 === 4)
  // and ascending cycles (0, 1, 2). NOTE (story 6-13): under the authentic ROM
  // introduction schedule they no longer differ by cycle ALONE — L5 only has
  // tankers/spikers, while L21/L37 (≥17) also have pulsars+fuseballs. So the
  // rising hard-enemy proportion reflects both the opening roster and the
  // retained cycle scaling; the assertion that later levels are harder still
  // holds. (Whether to keep cycle scaling vs the ROM's fixed L33+ steady-state
  // weights is a flagged follow-up decision — see story 6-13 delivery findings.)
  const SEED = 4242
  const N = 6000

  it('spawns a higher proportion of hard enemies on the second cycle than the first', () => {
    const firstCycle = hardFraction(5, SEED, N)
    const secondCycle = hardFraction(21, SEED, N)
    expect(secondCycle).toBeGreaterThan(firstCycle)
  })

  it('keeps escalating the hard-enemy proportion into the third cycle', () => {
    const firstCycle = hardFraction(5, SEED, N)
    const secondCycle = hardFraction(21, SEED, N)
    const thirdCycle = hardFraction(37, SEED, N)
    expect(thirdCycle).toBeGreaterThan(firstCycle)
    expect(thirdCycle).toBeGreaterThanOrEqual(secondCycle)
  })
})

describe('rollSpawnKind stays deterministic across the cycle (AC#5)', () => {
  it('produces identical kind sequences for identical seed, level and rng state', () => {
    // Core purity: same seed + same level => byte-identical roll sequence.
    const a = rollSequence(21, 999, 1000)
    const b = rollSequence(21, 999, 1000)
    expect(a).toEqual(b)
    // Sanity: the sequence is not trivially one-kinded at a deep level.
    expect(new Set(a).size).toBeGreaterThan(1)
  })
})
