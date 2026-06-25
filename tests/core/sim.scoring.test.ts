import { describe, it, expect } from 'vitest'
import { initialState } from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { Input } from '../../src/core/input'
import {
  scoreFor, fuseballScore, SCORE_FLIPPER, SCORE_TANKER, SCORE_SPIKER, SCORE_PULSAR,
} from '../../src/core/rules'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }

describe('scoreFor', () => {
  it('returns the authentic per-kind value', () => {
    expect(scoreFor({ kind: 'flipper', lane: 0, depth: 0.5, flipTimer: 1 })).toBe(SCORE_FLIPPER)
    expect(scoreFor({ kind: 'tanker', lane: 0, depth: 0.5, contains: 'flipper' })).toBe(SCORE_TANKER)
    expect(scoreFor({ kind: 'spiker', lane: 0, depth: 0.5, direction: 1 })).toBe(SCORE_SPIKER)
    expect(scoreFor({ kind: 'pulsar', lane: 0, depth: 0.5, flipTimer: 1, pulseTimer: 1, pulsing: false })).toBe(SCORE_PULSAR)
  })

  it('escalates the fuseball value with depth (250 → 500 → 750)', () => {
    expect(fuseballScore(0.1)).toBe(250)
    expect(fuseballScore(0.5)).toBe(500)
    expect(fuseballScore(0.9)).toBe(750)
  })
})

describe('scoring through a collision', () => {
  it('awards the tanker value when a bullet kills a tanker', () => {
    const s = initialState(1)
    s.spawn.remaining = 0
    s.enemies = [{ kind: 'tanker', lane: 4, depth: 0.5, contains: 'flipper' }]
    s.bullets = [{ lane: 4, depth: 0.5 }]
    const out = stepGame(s, NEUTRAL, 1 / 60)
    expect(out.score).toBe(SCORE_TANKER)
  })

  it('grants an extra life when the score crosses a 10,000 boundary', () => {
    const s = initialState(1)
    s.spawn.remaining = 0
    s.score = 9900
    s.lives = 3
    s.enemies = [{ kind: 'flipper', lane: 4, depth: 0.5, flipTimer: 999 }] // +150 → 10050
    s.bullets = [{ lane: 4, depth: 0.5 }]
    const out = stepGame(s, NEUTRAL, 1 / 60)
    expect(out.score).toBe(10050)
    expect(out.lives).toBe(4)
  })
})
