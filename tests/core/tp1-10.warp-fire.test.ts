// tests/core/tp1-10.warp-fire.test.ts
//
// RED — tp1-10 AC-4 (finding WD-014): the player can FIRE during the dive, and
// in-flight charges keep moving; we currently disable firing and wipe the bullets.
//
// ROM: the drop-mode mainline PLDROP (ALWELG.MAC:884-897) calls FIREPC ("JSR
// FIREPC ;FIRE PLAYER CHARGES", :891) and MOVCHA (:892) every DESCENDING frame,
// identically to the normal PLAY mainline — so you can shoot all the way down the
// tube (it is how you shorten a spike you are about to land on). FIREPC does NOT
// run during the AVOID-SPIKES hold: that is CPAUSE, which routes to PAUSE (rotate
// only), never PLDROP (WD-017 refutation, ALEXEC.MAC:85-103). So: firing is live
// during the DESCENT (warning === 0), silent during the warning hold.
//
// Today the 'warp' case (sim.ts:973-976) runs only stepPlayer + stepWarp — never
// stepFiring or stepBullets — and checkLevelClear wipes in-flight bullets on entry
// ('s.bullets = []', sim.ts:743). Every assertion below is RED against that.
import { describe, it, expect } from 'vitest'
import { playingState } from './helpers'
import type { GameState } from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import type { Input } from '../../src/core/input'
import { WARP_INITIAL_SPEED, WARP_AVOID_SPIKES_SECONDS, SPIKE_MAX_DEPTH } from '../../src/core/rules'

const DT = 1 / 60
const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }
const FIRING: Input = { spin: 0, fire: true, zap: false, start: false }

// A game mid-DESCENT: warp, past the warning hold (warning 0), no spike on the
// player's lane so nothing crashes. progress 0.1 so the Claw is genuinely diving.
function diving(playerLane = 0): GameState {
  const s = playingState(1)
  s.spawn = { nymphs: [] }
  s.enemies = []
  s.bullets = []
  s.player.lane = playerLane
  s.mode = 'warp'
  s.warp = { progress: 0.1, velocity: WARP_INITIAL_SPEED, warning: 0 }
  s.spikes = new Array(s.tube.laneCount).fill(0) // no spikes anywhere → no crash
  return s
}

describe('tp1-10 AC-4 — firing during the warp dive (WD-014)', () => {
  it('spawns a bullet when the player fires during the descent', () => {
    const s = diving()
    expect(s.mode).toBe('warp') // guard: we are actually diving
    const out = stepGame(s, FIRING, DT)
    expect(out.mode).toBe('warp') // one frame of firing does not end the dive
    expect(out.bullets.length).toBeGreaterThan(0)
    expect(out.events.some((e) => e.type === 'fire')).toBe(true)
  })

  it('keeps in-flight charges moving during the dive (MOVCHA runs every drop frame)', () => {
    const s = diving()
    // A charge already in flight, mid-tube. stepBullets is never called in the
    // warp branch today, so its depth is frozen — RED.
    s.bullets = [{ lane: 0, depth: 0.8 }]
    const out = stepGame(s, NEUTRAL, DT)
    expect(out.mode).toBe('warp')
    expect(out.bullets).toHaveLength(1)
    expect(out.bullets[0].depth).toBeLessThan(0.8) // it advanced down the lane
  })

  it('does NOT wipe in-flight charges on warp entry (they keep flying, ROM)', () => {
    // Enter the warp through the real clear path with a charge already in flight.
    // checkLevelClear currently does `s.bullets = []` on entry — RED.
    const s = playingState(1)
    s.spawn = { nymphs: [] }
    s.enemies = []
    s.bullets = [{ lane: 0, depth: 0.5 }]
    s.spikes = new Array(s.tube.laneCount).fill(0)
    const out = stepGame(s, NEUTRAL, DT) // empty level → enters warp
    expect(out.mode).toBe('warp') // guard: we truly took the clear→warp path
    expect(out.bullets.length).toBeGreaterThan(0)
  })

  it('firing STILL does not spawn during the AVOID-SPIKES hold (CPAUSE, not CDROP)', () => {
    // Keep-behaviour guard: during the warning hold the Claw is at the rim and
    // PLDROP/FIREPC do not run — so a lazy "fire always in warp" implementation
    // must be rejected. Green today (no firing at all); must stay green after the fix.
    const s = playingState(1)
    s.spawn = { nymphs: [] }
    s.enemies = []
    s.bullets = []
    s.player.lane = 0
    s.mode = 'warp'
    // A spike on ANOTHER lane arms the warning hold without threatening lane 0.
    s.spikes = new Array(s.tube.laneCount).fill(0)
    s.spikes[8] = SPIKE_MAX_DEPTH
    s.warp = { progress: 0, velocity: WARP_INITIAL_SPEED, warning: WARP_AVOID_SPIKES_SECONDS }
    const out = stepGame(s, FIRING, DT)
    expect(out.warp.warning).toBeGreaterThan(0) // still in the hold
    expect(out.warp.progress).toBe(0) // Claw has not moved
    expect(out.bullets).toHaveLength(0) // no charge while frozen at the rim
  })
})
