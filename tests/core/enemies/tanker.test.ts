import { describe, it, expect } from 'vitest'
import { playingState } from '../helpers'
import { stepGame } from '../../../src/core/sim'
import { Input } from '../../../src/core/input'
import { stepTanker } from '../../../src/core/enemies/tanker'
import { levelParams, SCORE_TANKER } from '../../../src/core/rules'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }
const params = levelParams(1)

describe('stepTanker', () => {
  it('climbs toward the rim', () => {
    const out = stepTanker({ kind: 'tanker', lane: 4, depth: 0.2, contains: 'flipper' }, 1 / 60, params)
    expect(out.enemy.depth).toBeCloseTo(0.2 + params.tankerSpeed / 60)
  })
})

describe('tanker splitting', () => {
  it('splits into two cargo enemies when shot, and scores the tanker', () => {
    const s = playingState(1)
    s.spawn.remaining = 0
    s.enemies = [{ kind: 'tanker', lane: 4, depth: 0.5, contains: 'flipper' }]
    s.bullets = [{ lane: 4, depth: 0.5 }]
    const out = stepGame(s, NEUTRAL, 1 / 60)
    expect(out.enemies).toHaveLength(2)
    expect(out.enemies.every((e) => e.kind === 'flipper')).toBe(true)
    expect(out.score).toBe(SCORE_TANKER)
  })

  it('places the two children on the flanking lanes seg-1 and seg+1 (story 6-9)', () => {
    // Authentic rev-3 split: children straddle the tanker into the ADJACENT lanes
    // (seg-1, seg+1), leaving the tanker's own lane empty — not seg / seg+1.
    const s = playingState(1)
    s.spawn.remaining = 0
    s.enemies = [{ kind: 'tanker', lane: 4, depth: 0.5, contains: 'flipper' }]
    s.bullets = [{ lane: 4, depth: 0.5 }]
    const out = stepGame(s, NEUTRAL, 1 / 60)
    const lanes = out.enemies.map((e) => e.lane).sort((a, b) => a - b)
    expect(lanes).toEqual([3, 5])
  })

  it('splits when it reaches the rim instead of grabbing the player', () => {
    const s = playingState(1)
    s.spawn.remaining = 0
    s.player.lane = 4
    s.enemies = [{ kind: 'tanker', lane: 4, depth: 0.95, contains: 'flipper' }]
    const out = stepGame(s, NEUTRAL, 1 / 60)
    expect(out.mode).toBe('playing')                 // tanker does not grab
    expect(out.enemies).toHaveLength(2)
    expect(out.enemies.every((e) => e.kind === 'flipper')).toBe(true)
    expect(out.enemies.every((e) => e.depth <= 0.85)).toBe(true)
  })
})
