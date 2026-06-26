// tests/core/sim.death.test.ts
import { describe, it, expect } from 'vitest'
import { playingState } from './helpers'
import { stepGame } from '../../src/core/sim'
import { Input } from '../../src/core/input'
import { RESPAWN_DELAY } from '../../src/core/rules'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }

describe('enemy ↔ player collision and death', () => {
  it('kills the player when an enemy reaches the rim on the player lane', () => {
    const s = playingState(1)
    s.spawn.remaining = 0
    s.player.lane = 4
    s.enemies = [{ kind: 'flipper', lane: 4, depth: 0.95, flipTimer: 999 }]

    const out = stepGame(s, NEUTRAL, 1 / 60)
    expect(out.lives).toBe(2)
    expect(out.mode).toBe('dying')
    expect(out.player.alive).toBe(false)
  })

  it('does not kill the player on a different lane', () => {
    const s = playingState(1)
    s.spawn.remaining = 0
    s.player.lane = 4
    s.enemies = [{ kind: 'flipper', lane: 9, depth: 0.99, flipTimer: 999 }]

    const out = stepGame(s, NEUTRAL, 1 / 60)
    expect(out.mode).toBe('playing')
    expect(out.lives).toBe(3)
  })

  it('respawns after the delay while lives remain', () => {
    let s = playingState(1)
    s.spawn.remaining = 0
    s.player.lane = 4
    // The lane-4 enemy kills the player (and is cleared on respawn). A second
    // enemy on a far lane sits below the rim and survives the respawn, so the
    // level is NOT incidentally clear afterward — this test exercises the
    // respawn mechanic, not the end-of-level warp (see sim.warp.test.ts).
    s.enemies = [
      { kind: 'flipper', lane: 4, depth: 0.95, flipTimer: 999 },
      { kind: 'flipper', lane: 9, depth: 0.3, flipTimer: 999 },
    ]
    s = stepGame(s, NEUTRAL, 1 / 60)            // → dying
    expect(s.mode).toBe('dying')

    for (let i = 0; i < Math.ceil(RESPAWN_DELAY * 60) + 2; i++) {
      s = stepGame(s, NEUTRAL, 1 / 60)
    }
    expect(s.mode).toBe('playing')
    expect(s.player.alive).toBe(true)
  })

  it('goes to gameover when the last life is lost', () => {
    const s = playingState(1)
    s.spawn.remaining = 0
    s.lives = 1
    s.player.lane = 4
    s.enemies = [{ kind: 'flipper', lane: 4, depth: 0.95, flipTimer: 999 }]

    const out = stepGame(s, NEUTRAL, 1 / 60)
    expect(out.mode).toBe('gameover')
    expect(out.lives).toBe(0)
  })

  // Story 4-2: gameover + start now returns to the ATTRACT screen, not straight
  // back into play. The fresh-game reset (score/lives/spikes/geometry) moves to
  // the select -> playing commit and is covered in sim.framing.test.ts.
  it('returns to the attract screen from gameover on start (not straight to play)', () => {
    let s = playingState(1)
    s.mode = 'gameover'
    s.score = 5000
    s.spikes[2] = 0.5
    s = stepGame(s, { ...NEUTRAL, start: true }, 1 / 60)
    expect(s.mode as string).toBe('attract')
    expect(s.mode as string).not.toBe('playing')
  })
})
