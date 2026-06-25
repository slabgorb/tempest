// tests/core/sim.level.test.ts
import { describe, it, expect } from 'vitest'
import { initialState } from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { Input } from '../../src/core/input'
import { levelParams } from '../../src/core/rules'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }

describe('level clear', () => {
  it('advances to the next level when the budget is empty and enemies are gone', () => {
    const s = initialState(1)
    s.spawn.remaining = 0
    s.enemies = []

    const out = stepGame(s, NEUTRAL, 1 / 60)
    expect(out.level).toBe(2)
    expect(out.spawn.remaining).toBe(levelParams(2).enemyCount)
  })

  it('does not advance while enemies remain', () => {
    const s = initialState(1)
    s.spawn.remaining = 0
    s.enemies = [{ kind: 'flipper', lane: 1, depth: 0.2, flipTimer: 999 }]

    const out = stepGame(s, NEUTRAL, 1 / 60)
    expect(out.level).toBe(1)
  })

  it('does not advance while the budget still has enemies to spawn', () => {
    const s = initialState(1)            // spawn.remaining > 0, no enemies yet
    s.enemies = []
    const out = stepGame(s, NEUTRAL, 1 / 60)
    expect(out.level).toBe(1)
  })

  it('makes the next level harder (more enemies, faster flippers)', () => {
    expect(levelParams(2).enemyCount).toBeGreaterThan(levelParams(1).enemyCount)
    expect(levelParams(2).flipperSpeed).toBeGreaterThan(levelParams(1).flipperSpeed)
  })
})
