// tests/shell/fx.warp-entry.test.ts
//
// Story 10-4 (AC2) — RED suite for the entering-warp FX cue.
//
// Today fx.detect fires the "level cleared" flash off a STATE DIFF — `s.level >
// prevLevel` (fx.ts:108). But `s.level` only increments at ARRIVAL, when the dive
// completes (sim.ts advanceLevel), one+ frames AFTER the warp visually begins. The
// cue should punch on warp ENTRY instead — the frame `checkLevelClear` emits the
// `level-clear` event and flips mode to 'warp' (sim.ts:482-483).
//
// So the cue must move OFF the arrival level-diff and ONTO the `level-clear`
// EVENT, mirroring how the 5-6 warp-spike-crash cue is already event-driven.
//
// These tests pin that behavioural swap. They fail against today's diff-driven
// code (it ignores the event and only fires on the level bump) and pass once
// fx.detect consumes the `level-clear` event.
import { describe, it, expect } from 'vitest'
import { createFx } from '../../src/shell/fx'
import { initialState } from '../../src/core/state'
import type { GameEvent } from '../../src/core/events'

const LEVEL_CLEAR_WHITE = '#ffffff'
const DEATH_RED = '#ff5a3c'

const levelClear = (newLevel: number): GameEvent => ({ type: 'level-clear', newLevel })

// Seed one quiet frame so prevAlive/prevLevel are established and nothing has
// fired yet (player alive, no bullets, no events ⇒ flash stays 0).
function seededFx(level: number) {
  const s = initialState(1)
  s.level = level
  s.mode = 'playing'
  const fx = createFx()
  fx.detect(s, 0.016, [])
  expect(fx.flash).toBe(0) // sanity: the seed frame is silent
  return { fx, s }
}

describe('fx entering-warp cue — fires on the level-clear EVENT (Story 10-4 AC2)', () => {
  it('punches the white level-clear flash on warp ENTRY, before s.level increments', () => {
    const { fx, s } = seededFx(1)
    // Warp just began: the dive is starting, the event fires, but s.level is STILL 1
    // (it only bumps to 2 on arrival). The cue must fire NOW regardless.
    s.mode = 'warp'
    fx.detect(s, 0.016, [levelClear(2)])
    expect(fx.flash).toBeGreaterThan(0)
    expect(fx.flashColor).toBe(LEVEL_CLEAR_WHITE)
    expect(fx.flashColor).not.toBe(DEATH_RED) // distinct from a death flash
    expect(fx.shake).toBeGreaterThan(0)
  })

  it('does NOT fire merely because s.level increased with no level-clear event', () => {
    // The old diff path keyed on the bare level bump; the new event-driven path
    // must ignore a level change that arrives without the event.
    const { fx, s } = seededFx(1)
    s.level = 2 // level bumped, but NO level-clear event this frame
    fx.detect(s, 0.016, [])
    expect(fx.flash).toBe(0)
    expect(fx.shake).toBe(0)
  })

  it('fires once on entry and does NOT re-fire on the later arrival frame', () => {
    const { fx, s } = seededFx(1)
    // Entry frame: event present, level still 1 → cue fires.
    s.mode = 'warp'
    fx.detect(s, 0.016, [levelClear(2)])
    expect(fx.flash).toBeGreaterThan(0) // meaningful: the entry cue DID fire

    // Let the flash fully decay before the arrival frame.
    fx.update(1)
    expect(fx.flash).toBe(0)

    // Arrival frame: the dive completed, s.level is now 2, but there is no fresh
    // level-clear event — the cue must stay silent (no double-fire on arrival).
    s.level = 2
    s.mode = 'playing'
    fx.detect(s, 0.016, [])
    expect(fx.flash).toBe(0)
  })
})
