import { describe, it, expect } from 'vitest'
import { playingState } from './helpers'
import { stepGame } from '../../src/core/sim'
import { Input } from '../../src/core/input'
import { rollSpawnKind, rollTankerCargo } from '../../src/core/rules'
import { createRng } from '@arcade/shared/rng'
import type { EnemyKind, TankerCargo } from '../../src/core/state'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }

// Sample rollSpawnKind `n` times at `level` from a fixed seed and return the set
// of kinds that can appear. Absence is EXACT — a weight-0 kind is skipped by
// weightedPick and can never be returned — so a missing kind is a real gate, not
// an unlucky sample. Presence is reliable at this sample size for any non-trivial
// weight. Calling rollSpawnKind directly (not via the sim) avoids contamination
// from tanker-split cargo, which can manufacture pulsar/fuseball children.
function rolledKinds(level: number, seed: number, n = 4000): Set<EnemyKind> {
  const r = createRng(seed) // mutable cursor: rollSpawnKind advances it in place
  const kinds = new Set<EnemyKind>()
  for (let i = 0; i < n; i++) {
    kinds.add(rollSpawnKind(level, r))
  }
  return kinds
}

// Sample rollTankerCargo `n` times at `level` and return the set of cargo kinds
// that can appear. Absence is EXACT (weight-0 cargo is skipped by weightedPick),
// so a missing cargo type is a real gate, not an unlucky sample.
function rolledCargo(level: number, seed: number, n = 4000): Set<TankerCargo> {
  const r = createRng(seed)
  const cargo = new Set<TankerCargo>()
  for (let i = 0; i < n; i++) {
    cargo.add(rollTankerCargo(level, r))
  }
  return cargo
}

function spawnedKinds(level: number, seed: number): Set<string> {
  let s = playingState(seed)
  s.level = level
  s.spawn = { remaining: 40, timer: 0 }
  const kinds = new Set<string>()
  for (let i = 0; i < 6000; i++) {
    s = stepGame(s, NEUTRAL, 1 / 60)
    for (const e of s.enemies) kinds.add(e.kind)
  }
  return kinds
}

// Authentic Atari rev-3 enemy *introduction* schedule (story 6-13 — decision:
// follow the ROM, do not re-tune the canonical game). Source of truth:
// docs/ux/2026-06-27-enemy-roster-rom-extract.md §H "Mix per level" (line 426),
// corroborated by docs/ux/2026-06-27-tempest-arcade-feel-reference.md line 242:
//   flippers L1+ · tankers L5+ · spikers L5+ · fuseballs L11+ · pulsars L17+.
// (The ROM thins the spiker weight above L16 then restores 1 at the L33+ steady
// state; we gate spikers monotonically at L5+ — see story 6-13 delivery finding
// re: the doc-flagged suspected `$35` spiker-table bug.)
describe('rollSpawnKind — authentic ROM introduction schedule (story 6-13)', () => {
  it('spawns flippers only through level 4', () => {
    for (const level of [1, 2, 3, 4]) {
      expect(rolledKinds(level, 100 + level)).toEqual(new Set<EnemyKind>(['flipper']))
    }
  })

  it('introduces tankers and spikers at level 5, not before', () => {
    const l4 = rolledKinds(4, 11)
    expect(l4.has('tanker')).toBe(false)
    expect(l4.has('spiker')).toBe(false)

    const l5 = rolledKinds(5, 11)
    expect(l5.has('tanker')).toBe(true)
    expect(l5.has('spiker')).toBe(true)
  })

  it('keeps fuseballs out until level 11', () => {
    for (const level of [5, 6, 10]) {
      expect(rolledKinds(level, 22).has('fuseball')).toBe(false)
    }
    expect(rolledKinds(11, 22).has('fuseball')).toBe(true)
  })

  it('keeps pulsars out until level 17', () => {
    for (const level of [5, 11, 16]) {
      expect(rolledKinds(level, 33).has('pulsar')).toBe(false)
    }
    expect(rolledKinds(17, 33).has('pulsar')).toBe(true)
  })

  it('reaches the full five-enemy roster at the L33+ steady state', () => {
    const all: EnemyKind[] = ['flipper', 'tanker', 'spiker', 'pulsar', 'fuseball']
    const dist = rolledKinds(33, 44)
    for (const kind of all) expect(dist.has(kind)).toBe(true)
  })
})

describe('spawn mix through the sim (story 6-13)', () => {
  it('level 1 spawns only flippers', () => {
    expect(spawnedKinds(1, 1)).toEqual(new Set(['flipper']))
  })

  it('level 4 still spawns only flippers — hard enemies start at level 5', () => {
    // Authentic ROM: L1-4 are flippers-only. With no tankers there are also no
    // tanker-split children, so the sim-observed set is exactly {flipper}.
    expect(spawnedKinds(4, 1)).toEqual(new Set(['flipper']))
  })

  it('a level past the first gate (L5) spawns a varied roster including flippers', () => {
    const kinds = spawnedKinds(5, 1)
    expect(kinds.size).toBeGreaterThan(1)
    expect(kinds.has('flipper')).toBe(true)
  })
})

// A tanker must not split into an enemy type that has not yet entered the roster.
// rollSpawnKind gates fuseballs at L11+ and pulsars at L17+, so rollTankerCargo's
// cargo gates are aligned to match (story 6-13 follow-up): below those levels a
// tanker carries flippers only, keeping the roster-by-level promise consistent
// even through tanker splits.
describe('rollTankerCargo respects the roster introduction schedule (story 6-13 follow-up)', () => {
  it('carries flippers only before fuseballs enter the roster (below L11)', () => {
    for (const level of [5, 6, 10]) {
      expect(rolledCargo(level, 55)).toEqual(new Set<TankerCargo>(['flipper']))
    }
  })

  it('introduces fuseball cargo at L11, matching the fuseball roster gate', () => {
    expect(rolledCargo(10, 66).has('fuseball')).toBe(false)
    expect(rolledCargo(11, 66).has('fuseball')).toBe(true)
  })

  it('keeps pulsar cargo out until L17, matching the pulsar roster gate', () => {
    for (const level of [11, 13, 16]) {
      expect(rolledCargo(level, 77).has('pulsar')).toBe(false)
    }
    expect(rolledCargo(17, 77).has('pulsar')).toBe(true)
  })
})
