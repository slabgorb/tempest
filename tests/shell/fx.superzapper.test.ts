// tests/shell/fx.superzapper.test.ts
//
// Story 10-15 — the Superzapper well-color flash render wiring.
//
// Core (10-2) emits one `superzapper-flash` event per ACTIVE zap frame, carrying
// the ROM's QFRAME-AND-7 well-color index (0..7). The shell FX layer must surface
// that index as `fx.zapFlash` so the renderer can tint the well/web with the
// matching palette hue, and must REVERT (null) the frame no flash event arrives —
// the zap window closing. The index→hue mapping lives in the renderer (canvas),
// verified by running the game; these tests pin the FX-layer plumbing + revert.
import { describe, it, expect } from 'vitest'
import { createFx } from '../../src/shell/fx'
import { initialState } from '../../src/core/state'
import type { GameEvent } from '../../src/core/events'

const flash = (color: number): GameEvent => ({ type: 'superzapper-flash', color })

// Seed one quiet frame so the FX state is established and nothing is tinting yet
// (no events ⇒ zapFlash stays null).
function seededFx() {
  const s = initialState(1)
  s.mode = 'playing'
  const fx = createFx()
  fx.detect(s, 0.016, [])
  expect(fx.zapFlash).toBeNull() // sanity: idle ⇒ no well tint
  return { fx, s }
}

describe('fx superzapper well-color flash (Story 10-15)', () => {
  it('surfaces the event color index as fx.zapFlash on an active zap frame', () => {
    const { fx, s } = seededFx()
    fx.detect(s, 0.016, [flash(5)])
    expect(fx.zapFlash).toBe(5)
  })

  it('tracks the cycling color across consecutive active frames', () => {
    const { fx, s } = seededFx()
    fx.detect(s, 0.016, [flash(3)])
    expect(fx.zapFlash).toBe(3)
    fx.detect(s, 0.016, [flash(4)])
    expect(fx.zapFlash).toBe(4)
  })

  it('reverts to null the frame no flash event arrives (zap window closed)', () => {
    const { fx, s } = seededFx()
    fx.detect(s, 0.016, [flash(2)])
    expect(fx.zapFlash).toBe(2) // meaningful: it WAS tinting the well
    fx.detect(s, 0.016, [])
    expect(fx.zapFlash).toBeNull()
  })

  it('masks the index into the ROM 0..7 well-color range', () => {
    const { fx, s } = seededFx()
    fx.detect(s, 0.016, [flash(9)]) // 9 & 7 === 1
    expect(fx.zapFlash).toBe(1)
  })
})
