// tests/core/sim.bullets.test.ts
import { describe, it, expect } from 'vitest'
import { initialState } from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { Input } from '../../src/core/input'
import { MAX_BULLETS, BULLET_SPEED } from '../../src/core/rules'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }

describe('stepGame firing and bullets', () => {
  it('spawns a bullet at the player lane, depth 1, on fire', () => {
    const out = stepGame(initialState(1), { ...NEUTRAL, fire: true }, 1 / 60)
    expect(out.bullets).toHaveLength(1)
    expect(out.bullets[0].lane).toBe(0)
    expect(out.bullets[0].depth).toBeCloseTo(1 - BULLET_SPEED / 60)
  })

  it('does not fire when fire is false', () => {
    const out = stepGame(initialState(1), NEUTRAL, 1 / 60)
    expect(out.bullets).toHaveLength(0)
  })

  it('moves bullets toward the far end (depth decreases)', () => {
    let s = stepGame(initialState(1), { ...NEUTRAL, fire: true }, 1 / 60)
    const before = s.bullets[0].depth
    s = stepGame(s, NEUTRAL, 1 / 60)
    expect(s.bullets[0].depth).toBeLessThan(before)
  })

  it('caps bullets at MAX_BULLETS', () => {
    let s = initialState(1)
    for (let i = 0; i < MAX_BULLETS + 5; i++) {
      s = stepGame(s, { ...NEUTRAL, fire: true }, 1 / 60)
    }
    expect(s.bullets.length).toBe(MAX_BULLETS)
  })

  it('removes bullets that reach the far end', () => {
    let s = stepGame(initialState(1), { ...NEUTRAL, fire: true }, 1 / 60)
    for (let i = 0; i < 120; i++) s = stepGame(s, NEUTRAL, 1 / 60)
    expect(s.bullets).toHaveLength(0)
  })
})
