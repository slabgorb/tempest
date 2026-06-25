// tests/core/sim.death.test.ts
import { describe, it, expect } from 'vitest'
import { initialState } from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { Input } from '../../src/core/input'
import { RESPAWN_DELAY } from '../../src/core/rules'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }

describe('enemy ↔ player collision and death', () => {
  it('kills the player when an enemy reaches the rim on the player lane', () => {
    const s = initialState(1)
    s.spawn.remaining = 0
    s.player.lane = 4
    s.enemies = [{ kind: 'flipper', lane: 4, depth: 0.95, flipTimer: 999 }]

    const out = stepGame(s, NEUTRAL, 1 / 60)
    expect(out.lives).toBe(2)
    expect(out.mode).toBe('dying')
    expect(out.player.alive).toBe(false)
  })

  it('does not kill the player on a different lane', () => {
    const s = initialState(1)
    s.spawn.remaining = 0
    s.player.lane = 4
    s.enemies = [{ kind: 'flipper', lane: 9, depth: 0.99, flipTimer: 999 }]

    const out = stepGame(s, NEUTRAL, 1 / 60)
    expect(out.mode).toBe('playing')
    expect(out.lives).toBe(3)
  })

  it('respawns after the delay while lives remain', () => {
    let s = initialState(1)
    s.spawn.remaining = 0
    s.player.lane = 4
    s.enemies = [{ kind: 'flipper', lane: 4, depth: 0.95, flipTimer: 999 }]
    s = stepGame(s, NEUTRAL, 1 / 60)            // → dying
    expect(s.mode).toBe('dying')

    for (let i = 0; i < Math.ceil(RESPAWN_DELAY * 60) + 2; i++) {
      s = stepGame(s, NEUTRAL, 1 / 60)
    }
    expect(s.mode).toBe('playing')
    expect(s.player.alive).toBe(true)
  })

  it('goes to gameover when the last life is lost', () => {
    const s = initialState(1)
    s.spawn.remaining = 0
    s.lives = 1
    s.player.lane = 4
    s.enemies = [{ kind: 'flipper', lane: 4, depth: 0.95, flipTimer: 999 }]

    const out = stepGame(s, NEUTRAL, 1 / 60)
    expect(out.mode).toBe('gameover')
    expect(out.lives).toBe(0)
  })

  it('restarts from gameover on start', () => {
    let s = initialState(1)
    s.mode = 'gameover'
    s.score = 5000
    s = stepGame(s, { ...NEUTRAL, start: true }, 1 / 60)
    expect(s.mode).toBe('playing')
    expect(s.score).toBe(0)
    expect(s.lives).toBe(3)
  })
})
