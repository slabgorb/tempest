// tests/core/sim.flipper-flip.test.ts
//
// Story 6-14: a flipper that is MID-FLIP (caught between two lanes) cannot grab
// the player. The ROM's p_chk skips the rim-grab check when the mid-flip bit
// ($80) is set (enemy-roster ROM extract §A l.8765-8775: `bmi ?f33`). A settled
// flipper on the player's lane at the rim still grabs — only the in-between
// state is safe. This is the fairness pay-off of the multi-tick flip: the player
// can rotate "through" a flipper while it is mid-flip.
//
// tp1-4 rewrote the flipper into the CAM, and this invariant survived it intact —
// only the register changed. The mid-flip bit is no longer `flipping`/`flipProgress`
// but the CAM's own jump angle (INVAL2): `jumpAngle` set means the invader is caught
// between two lines, exactly as the ROM's $80 INVMOT bit does.
import { describe, it, expect } from 'vitest'
import { playingState } from './helpers'
import { stepGame, makeEnemy } from '../../src/core/sim'
import { levelParams } from '../../src/core/rules'
import { Input } from '../../src/core/input'
import { Flipper } from '../../src/core/state'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }

describe('sim — mid-flip flipper grab immunity', () => {
  it('a SETTLED flipper at the rim on the player lane grabs (control)', () => {
    const s = playingState(1)
    s.spawn = { nymphs: [] }
    s.player.lane = 4
    const enemy: Flipper = makeEnemy('flipper', 4, 1, levelParams(1))
    s.enemies = [enemy]

    const out = stepGame(s, NEUTRAL, 1 / 60)
    expect(out.mode).toBe('dying')
    expect(out.lives).toBe(2)
  })

  it('a MID-FLIP flipper at the rim on the player lane does NOT grab', () => {
    const s = playingState(1)
    s.spawn = { nymphs: [] }
    s.player.lane = 4
    // Already mid-jump between lane 4 and 5, the tumble just begun (angle-step 0 of
    // the eight a jump takes). Nothing else about the fixture differs from the
    // control above, so the mid-flip state is the ONLY thing standing between this
    // flipper and a grab.
    const enemy: Flipper = { ...makeEnemy('flipper', 4, 1, levelParams(1)), rot: 1, jumpAngle: 0 }
    s.enemies = [enemy]

    const out = stepGame(s, NEUTRAL, 1 / 60)
    expect(out.mode).toBe('playing') // mid-flip = no grab
    expect(out.lives).toBe(3)
    expect(out.player.alive).toBe(true)
  })
})
