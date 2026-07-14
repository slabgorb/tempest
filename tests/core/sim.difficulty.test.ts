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
  it('keeps speeds increasing across the level-16 → 17+ cycle boundary', () => {
    // AC#1: difficulty does not reset when geometry repeats. Level 20 reuses
    // the level-4 geometry but must move faster than level 16 in every speed.
    const p16 = levelParams(16)
    const p20 = levelParams(20)
    expect(p20.flipperSpeed).toBeGreaterThan(p16.flipperSpeed)
    expect(p20.spikerSpeed).toBeGreaterThan(p16.spikerSpeed)
    expect(p20.fuseballSpeed).toBeGreaterThan(p16.fuseballSpeed)
    expect(p20.tankerSpeed).toBeGreaterThan(p16.tankerSpeed)
    expect(p20.enemyCount).toBeGreaterThan(p16.enemyCount)
  })

  it('keeps spawn cadence tightening across the cycle boundary', () => {
    // AC#1: shorter intervals = faster spawning at higher levels.
    //
    // `flipInterval` used to be asserted here too. tp1-4 deleted it: a flipper's flip
    // cadence is not a per-level number at all, it is written into the wave's CAM
    // program (W-005/W-006), and the wave picks the program from CAMWAV — so "flips
    // faster at higher levels" is not a thing the ROM does, or can do.
    const p16 = levelParams(16)
    const p20 = levelParams(20)
    expect(p20.spawnInterval).toBeLessThan(p16.spawnInterval)
  })

  it('clamps timing intervals to playable floors at very high levels', () => {
    // AC#2: a level-50 ramp must not drive any cadence to zero — the game has
    // to stay finite/playable arbitrarily deep into the difficulty curve.
    //
    // This used to check `pulseInterval` too. tp1-5 (W-026) removed it from LevelParams
    // altogether: the pulse is not a per-level interval in the ROM, it is ONE global
    // counter on a fixed 40-frame period (PULSON/PULTIM), so the ramp cannot reach it to
    // drive it anywhere. That is a stronger guarantee than a floor, and it is structural —
    // there is no longer a number here for a level to scale.
    const p = levelParams(50)
    expect(p.spawnInterval).toBeGreaterThanOrEqual(0.3)
    // And the floors must actually bind here (otherwise "floor" is meaningless):
    // a floored value never exceeds the unfloored level-16 value.
    expect(p.spawnInterval).toBeLessThanOrEqual(levelParams(16).spawnInterval)
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

  it('preserves the authentic ROM early-level introduction schedule', () => {
    // AC#4 (reconciled by story 6-13): cycle scaling must NOT leak hard enemies
    // in before their *authentic* gate. Levels 1-4: flippers only. Level 5
    // introduces tankers/spikers, but pulsars (L17+) and fuseballs (L11+) stay
    // out. Source: docs/ux/2026-06-27-enemy-roster-rom-extract.md §H.
    for (const level of [1, 2, 3, 4]) {
      expect(rollDistribution(level, 11, 500)).toEqual(
        new Map<EnemyKind, number>([['flipper', 500]]),
      )
    }

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
