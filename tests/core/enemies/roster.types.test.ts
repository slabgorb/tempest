// tests/core/enemies/roster.types.test.ts
import { describe, it, expect } from 'vitest'
import { initialState } from '../../../src/core/state'
import { stepGame } from '../../../src/core/sim'
import { Input } from '../../../src/core/input'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }

describe('Wave 2 state spine', () => {
  it('initialises an empty per-lane spike array sized to the tube', () => {
    const s = initialState(1)
    expect(s.spikes).toHaveLength(s.tube.laneCount)
    expect(s.spikes.every((h) => h === 0)).toBe(true)
  })

  it('deep-copies spikes — stepGame does not mutate the input array', () => {
    const s = initialState(1)
    s.spikes[3] = 0.5
    const snapshot = [...s.spikes]
    const out = stepGame(s, NEUTRAL, 1 / 60)
    expect(s.spikes).toEqual(snapshot)      // input untouched
    expect(out.spikes).not.toBe(s.spikes)   // output is a distinct array
  })

  it('still spawns and climbs flippers after the union refactor', () => {
    let s = initialState(1)
    for (let i = 0; i < 200; i++) s = stepGame(s, NEUTRAL, 1 / 60)
    expect(s.enemies.length).toBeGreaterThan(0)
    expect(s.enemies.every((e) => e.kind === 'flipper')).toBe(true)
  })
})
