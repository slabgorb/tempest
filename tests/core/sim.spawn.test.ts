import { describe, it, expect } from 'vitest'
import { playingState } from './helpers'
import { stepGame } from '../../src/core/sim'
import { Input } from '../../src/core/input'
import { rollTankerCargo } from '../../src/core/rules'
import { createRng } from '@arcade/shared/rng'
import type { TankerCargo } from '../../src/core/state'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }

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
  // 40 eager nymphs (small staggered pys): the old `timer: 0` "spawn as fast as
  // allowed". Back-pressure paces delivery now, so the same 6000-frame window
  // still sees the whole roster hatch — kinds roll at hatch time.
  s.spawn = { nymphs: Array.from({ length: 40 }, (_, i) => ({ lane: (i * 5) % 16, py: 1 + 16 * i })) }
  const kinds = new Set<string>()
  for (let i = 0; i < 6000; i++) {
    s = stepGame(s, NEUTRAL, 1 / 60)
    for (const e of s.enemies) kinds.add(e.kind)
  }
  return kinds
}

// The rollSpawnKind-DIRECT introduction-schedule suite is REMOVED by tp1-8: NYMCHA replaces the
// weighted roll, so there is no rollSpawnKind to sample. The introduction schedule (a type first
// appears the wave its MAX table is non-zero) and the per-wave availability GAPS it deferred to
// this story are now covered per-wave by tests/core/tp1-8.nymcha.test.ts; the schedule THROUGH
// THE SIM is held by the `spawn mix through the sim` suite below.

describe('spawn mix through the sim (story 6-13)', () => {
  it('level 1 spawns only flippers', () => {
    expect(spawnedKinds(1, 1)).toEqual(new Set(['flipper']))
  })

  it('wave 2 still spawns only flippers — tankers do not enter until wave 3 (RE-SEATED by tp1-7)', () => {
    // Authentic ROM (W-035): waves 1-2 are flippers-only, a tanker first appears on wave 3.
    // Below wave 3 there are no tankers, so no tanker-split children either — the sim-observed
    // set is exactly {flipper}. (This used to assert "level 4 flippers only", from the doc
    // W-035 refutes.)
    expect(spawnedKinds(2, 1)).toEqual(new Set(['flipper']))
  })

  it('wave 4 spawns spikers and flippers but NO tanker — WTANMX blanks the tanker on wave 4 (RE-SEATED by tp1-8)', () => {
    // RE-SEATED by tp1-8: WTANMX itemises the tanker max as 0,0,1,0,1 for waves 1-5 — a tanker
    // enters on wave 3 and VANISHES again on wave 4 (the non-monotonic gap NYMCHA enforces per
    // wave, which tp1-7's monotonic introduction could not express). Spikers enter on wave 4
    // (WSPIMX = 2); flippers are still required (WFLIMI min 1 through wave 4). Fuseballs (11) and
    // pulsars (17) stay out, and there is no tanker to split, so no cargo children either.
    const kinds = spawnedKinds(4, 1)
    expect(kinds.has('spiker'), 'spikers enter on wave 4 (WSPIMX = 2)').toBe(true)
    expect(kinds.has('flipper'), 'flippers still required through wave 4 (WFLIMI min 1)').toBe(true)
    expect(kinds.has('tanker'), 'WTANMX wave 4 = 0: the tanker vanishes again on wave 4').toBe(false)
    expect(kinds.has('fuseball')).toBe(false)
    expect(kinds.has('pulsar')).toBe(false)
  })

  it('a level past the first gate (L5) spawns a varied roster including flippers', () => {
    const kinds = spawnedKinds(5, 1)
    expect(kinds.size).toBeGreaterThan(1)
    expect(kinds.has('flipper')).toBe(true)
  })
})

// RE-SEATED by tp1-7 (W-033): tanker cargo comes from the WTACAR table, NOT from a gate
// aligned to the roster introduction. All four cargo slots are ZCARFL (flipper) until wave
// 33; WWTAC2 turns slot 2 to fuseball at 33 and pulsar at 41; WWTAC3 turns slot 3 to fuseball
// at 49. So cargo lags the ROSTER by a lot (fuseballs enter the roster at 11 but cannot be
// CARRIED until 33), and the "a split never manufactures a type before it is in the roster"
// invariant still holds — with far more headroom than the old L11/L17 gates gave.
describe('rollTankerCargo reads the WTACAR cargo table (RE-SEATED by tp1-7 / W-033)', () => {
  it('carries flippers only until wave 33 — all four WTACAR slots are ZCARFL below it', () => {
    for (const level of [5, 11, 20, 32]) {
      expect(rolledCargo(level, 55)).toEqual(new Set<TankerCargo>(['flipper']))
    }
  })

  it('introduces fuseball cargo at wave 33 (WWTAC2 slot 2), not L11', () => {
    expect(rolledCargo(32, 66).has('fuseball')).toBe(false)
    expect(rolledCargo(33, 66).has('fuseball')).toBe(true)
  })

  it('keeps pulsar cargo out until wave 41 (WWTAC2 -> ZCARPU), not L17', () => {
    for (const level of [17, 33, 40]) {
      expect(rolledCargo(level, 77).has('pulsar')).toBe(false)
    }
    expect(rolledCargo(41, 77).has('pulsar')).toBe(true)
  })
})
