// tests/core/sim.collisions.test.ts
import { describe, it, expect } from 'vitest'
import { playingState } from './helpers'
import { stepGame, makeEnemy } from '../../src/core/sim'
import { Input } from '../../src/core/input'
import { SCORE_FLIPPER, levelParams } from '../../src/core/rules'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }

describe('bullet ↔ enemy collision', () => {
  it('destroys both and awards score when they overlap', () => {
    const s = playingState(1)
    s.spawn.remaining = 0            // stop new spawns interfering
    s.enemies = [makeEnemy('flipper', 4, 0.5, levelParams(1))]
    s.bullets = [{ lane: 4, depth: 0.5 }]

    const out = stepGame(s, NEUTRAL, 1 / 60)
    expect(out.enemies).toHaveLength(0)
    expect(out.bullets).toHaveLength(0)
    expect(out.score).toBe(SCORE_FLIPPER)
  })

  it('misses when on a different lane', () => {
    const s = playingState(1)
    s.spawn.remaining = 0
    s.enemies = [makeEnemy('flipper', 4, 0.5, levelParams(1))]
    s.bullets = [{ lane: 7, depth: 0.5 }]

    const out = stepGame(s, NEUTRAL, 1 / 60)
    expect(out.enemies).toHaveLength(1)
    expect(out.score).toBe(0)
  })

  it('misses when depths are far apart', () => {
    const s = playingState(1)
    s.spawn.remaining = 0
    s.enemies = [makeEnemy('flipper', 4, 0.1, levelParams(1))]
    s.bullets = [{ lane: 4, depth: 0.9 }]

    const out = stepGame(s, NEUTRAL, 1 / 60)
    expect(out.enemies).toHaveLength(1)
    expect(out.score).toBe(0)
  })
})
