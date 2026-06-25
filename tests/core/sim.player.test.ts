// tests/core/sim.player.test.ts
import { describe, it, expect } from 'vitest'
import { initialState } from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { Input } from '../../src/core/input'
import { SPIN_SENSITIVITY } from '../../src/core/rules'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }

describe('stepGame player rotation', () => {
  it('moves the player by spin * SPIN_SENSITIVITY', () => {
    const s = initialState(1)
    const out = stepGame(s, { ...NEUTRAL, spin: 1 }, 1 / 60)
    expect(out.player.lane).toBeCloseTo(SPIN_SENSITIVITY)
  })

  it('wraps around a closed tube on negative spin', () => {
    const s = initialState(1)   // lane starts at 0
    const out = stepGame(s, { ...NEUTRAL, spin: -1 }, 1 / 60)
    expect(out.player.lane).toBeCloseTo(16 - SPIN_SENSITIVITY)
  })

  it('does not mutate the input state', () => {
    const s = initialState(1)
    stepGame(s, { ...NEUTRAL, spin: 5 }, 1 / 60)
    expect(s.player.lane).toBe(0)
  })

  it('is deterministic: same input → same output', () => {
    const a = stepGame(initialState(1), { ...NEUTRAL, spin: 3 }, 1 / 60)
    const b = stepGame(initialState(1), { ...NEUTRAL, spin: 3 }, 1 / 60)
    expect(a.player.lane).toBe(b.player.lane)
  })
})
