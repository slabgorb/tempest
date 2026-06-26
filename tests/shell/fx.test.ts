// tests/shell/fx.test.ts
//
// Story 5-6: a warp spike crash must read DIFFERENTLY from a normal death. Both
// flip `player.alive`, so the generic state-diff death cue can't tell them apart
// — the distinct crash cue is driven off the explicit `warp-spike-crash` event.
// We assert the full-screen flash colour (deterministic, unlike particle spray)
// to prove the two deaths are visually distinct.
import { describe, it, expect } from 'vitest'
import { createFx } from '../../src/shell/fx'
import { initialState } from '../../src/core/state'
import type { GameEvent } from '../../src/core/events'

const DEATH_RED = '#ff5a3c'
const CRASH_BLUE = '#7df9ff'

// Drive one alive frame (to seed prevAlive=true) then one dead frame carrying
// `events`, returning the fx after the death is detected.
function killWith(events: readonly GameEvent[]) {
  const s = initialState(1)
  const fx = createFx()
  fx.detect(s, 0.016, []) // frame 1: alive — establishes prevAlive
  s.player.alive = false
  fx.detect(s, 0.016, events) // frame 2: the death frame
  return fx
}

describe('fx warp spike crash cue (Story 5-6)', () => {
  it('flashes the distinct electric-blue cue on a warp spike crash', () => {
    const fx = killWith([{ type: 'warp-spike-crash', lane: 0 }])
    expect(fx.flashColor).toBe(CRASH_BLUE)
    expect(fx.flashColor).not.toBe(DEATH_RED)
    expect(fx.shake).toBeGreaterThan(18) // harder jolt than a normal death
    expect(fx.particles.length).toBeGreaterThan(0)
  })

  it('keeps the red death flash for a normal death (no crash event)', () => {
    const fx = killWith([])
    expect(fx.flashColor).toBe(DEATH_RED)
  })

  it('treats a warp spike crash differently from a normal grab death', () => {
    const crash = killWith([{ type: 'warp-spike-crash', lane: 2 }])
    const grab = killWith([{ type: 'player-grab', lane: 2, killedBy: 'flipper' }])
    expect(crash.flashColor).not.toBe(grab.flashColor)
  })
})
