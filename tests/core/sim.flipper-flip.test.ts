// tests/core/sim.flipper-flip.test.ts
//
// Story 6-14: a flipper that is MID-FLIP (caught between two lanes) cannot grab
// the player. The ROM's p_chk skips the rim-grab check when the mid-flip bit
// ($80) is set (enemy-roster ROM extract §A l.8765-8775: `bmi ?f33`). A settled
// flipper on the player's lane at the rim still grabs — only the in-between
// state is safe. This is the fairness pay-off of the multi-tick flip: the player
// can rotate "through" a flipper while it is mid-flip.
import { describe, it, expect } from 'vitest'
import { playingState } from './helpers'
import { stepGame } from '../../src/core/sim'
import { Input } from '../../src/core/input'
import { Flipper } from '../../src/core/state'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }

describe('sim — mid-flip flipper grab immunity', () => {
  it('a SETTLED flipper at the rim on the player lane grabs (control)', () => {
    const s = playingState(1)
    s.spawn.remaining = 0
    s.player.lane = 4
    const enemy: Flipper = { kind: 'flipper', lane: 4, depth: 0.95, flipTimer: 999 }
    s.enemies = [enemy]

    const out = stepGame(s, NEUTRAL, 1 / 60)
    expect(out.mode).toBe('dying')
    expect(out.lives).toBe(2)
  })

  it('a MID-FLIP flipper at the rim on the player lane does NOT grab', () => {
    const s = playingState(1)
    s.spawn.remaining = 0
    s.player.lane = 4
    // Already mid-flip between lane 4 and 5, animation just begun. A high
    // flipTimer means no NEW flip logic fires this step, isolating the grab-skip
    // behaviour: the only thing standing between this flipper and a grab is its
    // mid-flip state.
    const enemy: Flipper = {
      kind: 'flipper',
      lane: 4,
      depth: 0.95,
      flipTimer: 999,
      flipping: true,
      flipDir: 1,
      flipProgress: 0,
    }
    s.enemies = [enemy]

    const out = stepGame(s, NEUTRAL, 1 / 60)
    expect(out.mode).toBe('playing') // mid-flip = no grab
    expect(out.lives).toBe(3)
    expect(out.player.alive).toBe(true)
  })
})
