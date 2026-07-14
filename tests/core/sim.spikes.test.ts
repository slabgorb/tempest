import { describe, it, expect } from 'vitest'
import { playingState } from './helpers'
import { stepGame, makeEnemy } from '../../src/core/sim'
import { Input } from '../../src/core/input'
import { SCORE_SPIKE_SEGMENT, levelParams } from '../../src/core/rules'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }

describe('spikes', () => {
  it('a spiker raises the spike height in its lane as it climbs', () => {
    let s = playingState(1)
    s.spawn = { nymphs: [] }
    s.enemies = [makeEnemy('spiker', 6, 0, levelParams(1))]
    for (let i = 0; i < 30; i++) s = stepGame(s, NEUTRAL, 1 / 60)
    expect(s.spikes[6]).toBeGreaterThan(0)
  })

  it('a bullet shortens the spike in its lane and scores', () => {
    const s = playingState(1)
    s.spawn = { nymphs: [] }
    s.spikes[2] = 0.5
    s.bullets = [{ lane: 2, depth: 0.5 }]
    const out = stepGame(s, NEUTRAL, 1 / 60)
    expect(out.spikes[2]).toBeLessThan(0.5)
    expect(out.bullets).toHaveLength(0)
    expect(out.score).toBe(SCORE_SPIKE_SEGMENT)
  })

  it('leaves spikes in other lanes alone', () => {
    const s = playingState(1)
    s.spawn = { nymphs: [] }
    s.spikes[2] = 0.5
    s.bullets = [{ lane: 9, depth: 0.5 }]
    const out = stepGame(s, NEUTRAL, 1 / 60)
    expect(out.spikes[2]).toBe(0.5)
  })
})
