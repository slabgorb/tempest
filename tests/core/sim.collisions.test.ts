// tests/core/sim.collisions.test.ts
import { describe, it, expect } from 'vitest'
import { initialState } from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { Input } from '../../src/core/input'
import { SCORE_FLIPPER } from '../../src/core/rules'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }

describe('bullet ↔ enemy collision', () => {
  it('destroys both and awards score when they overlap', () => {
    const s = initialState(1)
    s.spawn.remaining = 0            // stop new spawns interfering
    s.enemies = [{ kind: 'flipper', lane: 4, depth: 0.5, flipTimer: 999 }]
    s.bullets = [{ lane: 4, depth: 0.5 }]

    const out = stepGame(s, NEUTRAL, 1 / 60)
    expect(out.enemies).toHaveLength(0)
    expect(out.bullets).toHaveLength(0)
    expect(out.score).toBe(SCORE_FLIPPER)
  })

  it('misses when on a different lane', () => {
    const s = initialState(1)
    s.spawn.remaining = 0
    s.enemies = [{ kind: 'flipper', lane: 4, depth: 0.5, flipTimer: 999 }]
    s.bullets = [{ lane: 7, depth: 0.5 }]

    const out = stepGame(s, NEUTRAL, 1 / 60)
    expect(out.enemies).toHaveLength(1)
    expect(out.score).toBe(0)
  })

  it('misses when depths are far apart', () => {
    const s = initialState(1)
    s.spawn.remaining = 0
    s.enemies = [{ kind: 'flipper', lane: 4, depth: 0.1, flipTimer: 999 }]
    s.bullets = [{ lane: 4, depth: 0.9 }]

    const out = stepGame(s, NEUTRAL, 1 / 60)
    expect(out.enemies).toHaveLength(1)
    expect(out.score).toBe(0)
  })
})
