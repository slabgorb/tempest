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

// Authentic Atari rev-3 enemy *introduction* schedule. RE-SEATED by tp1-7 (W-035): the
// introduction is the WTANMX/WSPIMX/WFUSMX/WPULMX max tables in ALWELG.MAC, NOT the
// enemy-roster doc story 6-13 cited (docs/ux/2026-06-27-enemy-roster-rom-extract.md §H),
// which W-035 refutes. The first non-zero max of each type is its introduction wave:
//   flippers L1+ · tankers WAVE 3+ · spikers WAVE 4+ · fuseballs L11+ · pulsars L17+.
// (tp1-7 corrects the INTRODUCTION waves only; per-wave availability gaps — WSPIMX blanks
// out spikers on waves 17-19, 33-34, 40-42 — and count enforcement belong to the NYMCHA
// population solver, story tp1-8.)
describe('rollSpawnKind — authentic ROM introduction schedule (RE-SEATED by tp1-7 / W-035)', () => {
  it('spawns flippers only through wave 2', () => {
    // A tanker first appears on WAVE 3 (WTANMX), so only waves 1-2 are flippers-only. This
    // used to say "through level 4", from the doc W-035 refutes.
    for (const level of [1, 2]) {
      expect(rolledKinds(level, 100 + level)).toEqual(new Set<EnemyKind>(['flipper']))
    }
  })

  it('introduces the tanker on WAVE 3 and the spiker on WAVE 4 (WTANMX/WSPIMX)', () => {
    const w2 = rolledKinds(2, 11)
    expect(w2.has('tanker')).toBe(false)
    expect(w2.has('spiker')).toBe(false)

    const w3 = rolledKinds(3, 11)
    expect(w3.has('tanker'), 'tanker enters on wave 3 (WTANMX = 1)').toBe(true)
    expect(w3.has('spiker'), 'spiker not until wave 4').toBe(false)

    const w4 = rolledKinds(4, 11)
    expect(w4.has('spiker'), 'spiker enters on wave 4 (WSPIMX = 2)').toBe(true)
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

  it('wave 2 still spawns only flippers — tankers do not enter until wave 3 (RE-SEATED by tp1-7)', () => {
    // Authentic ROM (W-035): waves 1-2 are flippers-only, a tanker first appears on wave 3.
    // Below wave 3 there are no tankers, so no tanker-split children either — the sim-observed
    // set is exactly {flipper}. (This used to assert "level 4 flippers only", from the doc
    // W-035 refutes.)
    expect(spawnedKinds(2, 1)).toEqual(new Set(['flipper']))
  })

  it('wave 4 spawns tankers and spikers through the sim, still no fuseball/pulsar (RE-SEATED by tp1-7)', () => {
    // Tanker enters wave 3, spiker wave 4 (WTANMX/WSPIMX); fuseballs (11) and pulsars (17) stay
    // out. Cargo below wave 33 is flippers only, so tanker splits add no new kinds here.
    const kinds = spawnedKinds(4, 1)
    expect(kinds.has('tanker')).toBe(true)
    expect(kinds.has('spiker')).toBe(true)
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
