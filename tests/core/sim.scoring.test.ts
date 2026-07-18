import { describe, it, expect } from 'vitest'
import { createRng } from '@arcade/shared/rng'
import { playingState } from './helpers'
import { stepGame, makeEnemy } from '../../src/core/sim'
import { Input } from '../../src/core/input'
import {
  scoreFor, fuseballScore, SCORE_FLIPPER, SCORE_TANKER, SCORE_SPIKER, SCORE_PULSAR, levelParams } from '../../src/core/rules'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }

describe('scoreFor', () => {
  it('returns the authentic per-kind value', () => {
    const rng = createRng(1) // unused by these kinds; scoreFor's signature just requires it
    expect(scoreFor(makeEnemy('flipper', 0, 0.5, levelParams(1)), rng)).toBe(SCORE_FLIPPER)
    expect(scoreFor(makeEnemy('tanker', 0, 0.5, levelParams(1), 'flipper'), rng)).toBe(SCORE_TANKER)
    expect(scoreFor(makeEnemy('spiker', 0, 0.5, levelParams(1)), rng)).toBe(SCORE_SPIKER)
    expect(scoreFor({ ...makeEnemy('pulsar', 0, 0.5, levelParams(1)), pulsing: false }, rng)).toBe(SCORE_PULSAR)
  })

  // tp1-21: the fuseball tier is a weighted roll off the seeded RNG (ALWELG.MAC:2754),
  // not a function of depth — see tests/core/tp1-21.fuseball-score.test.ts for the
  // full determinism/distribution/depth-independence suite this re-points to.
  it('rolls the fuseball tier from the seeded RNG — one of the ROM 250/500/750 values', () => {
    const rng = createRng(1)
    expect([250, 500, 750]).toContain(fuseballScore(rng))
  })
})

describe('scoring through a collision', () => {
  it('awards the tanker value when a bullet kills a tanker', () => {
    const s = playingState(1)
    s.spawn = { nymphs: [] }
    s.enemies = [makeEnemy('tanker', 4, 0.5, levelParams(1), 'flipper')]
    s.bullets = [{ lane: 4, depth: 0.5 }]
    const out = stepGame(s, NEUTRAL, 1 / 60)
    expect(out.score).toBe(SCORE_TANKER)
  })

  it('grants an extra life when the score crosses a 10,000 boundary', () => {
    const s = playingState(1)
    s.spawn = { nymphs: [] }
    s.score = 9900
    s.lives = 3
    s.enemies = [makeEnemy('flipper', 4, 0.5, levelParams(1))] // +150 → 10050
    s.bullets = [{ lane: 4, depth: 0.5 }]
    const out = stepGame(s, NEUTRAL, 1 / 60)
    expect(out.score).toBe(10050)
    expect(out.lives).toBe(4)
  })
})
