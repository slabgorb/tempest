// tests/shell/input.test.ts
//
// Story 6-2: the auto-fire bug lives in the shell. While the fire button is
// HELD, the input controller throttles `fire` to once every AUTOFIRE_MS, so a
// held button only emits a shot roughly every ~7 frames — irregular gaps that
// make spin-and-hold skip lanes. The contract: a held button (mouse or space)
// must request `fire` on EVERY frame and let the pure core's 8-shot cap be the
// only gate on cadence.
//
// The controller binds to a DOM target + window and reads performance.now().
// The suite runs in the 'node' env, so we capture listeners on fake event buses
// and drive a controllable clock — the same stub-the-globals approach as
// tests/shell/loop.test.ts.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createInputController } from '../../src/shell/input'

const FRAME_MS = 1000 / 60

// A listener-capturing fake EventTarget. createInputController binds 'wheel' and
// 'mousedown' to the target and the rest ('mouseup'/'blur'/'keydown'/'keyup')
// to window; emit() invokes captured handlers with a default preventDefault.
function makeBus() {
  const handlers: Record<string, ((e: unknown) => void)[]> = {}
  return {
    addEventListener(type: string, cb: (e: unknown) => void) {
      ;(handlers[type] ||= []).push(cb)
    },
    emit(type: string, event: Record<string, unknown> = {}) {
      const e = { preventDefault() {}, ...event }
      ;(handlers[type] || []).forEach((cb) => cb(e))
    },
  }
}

describe('createInputController auto-fire cadence (Story 6-2)', () => {
  let nowMs: number
  let target: ReturnType<typeof makeBus>
  let windowBus: ReturnType<typeof makeBus>

  beforeEach(() => {
    nowMs = 0
    target = makeBus()
    windowBus = makeBus()
    vi.stubGlobal('window', windowBus)
    vi.stubGlobal('performance', { now: () => nowMs })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function build() {
    return createInputController(target as unknown as HTMLElement)
  }

  // AC1/AC5: a held mouse button must request fire on EVERY frame — no throttle
  // gaps. Today AUTOFIRE_MS=120 leaves ~6 of every 7 frames un-fired.
  it('requests fire on every frame while the mouse button is held', () => {
    const ctrl = build()
    target.emit('mousedown', { button: 0 })

    expect(ctrl.sample().fire, 'initial press fires').toBe(true)
    for (let frame = 1; frame <= 12; frame++) {
      nowMs += FRAME_MS
      expect(ctrl.sample().fire, `frame ${frame} should still fire while held`).toBe(true)
    }
  })

  // AC1/AC5: holding space (keyboard auto-fire) must behave identically.
  it('requests fire on every frame while space is held', () => {
    const ctrl = build()
    windowBus.emit('keydown', { key: ' ', repeat: false })

    expect(ctrl.sample().fire, 'initial press fires').toBe(true)
    for (let frame = 1; frame <= 12; frame++) {
      nowMs += FRAME_MS
      expect(ctrl.sample().fire, `frame ${frame} should still fire while held`).toBe(true)
    }
  })

  // Guard: removing the throttle must not jam fire permanently on. With nothing
  // held or pressed, fire stays false.
  it('does not fire when neither the mouse nor space is held', () => {
    const ctrl = build()
    for (let frame = 0; frame < 6; frame++) {
      nowMs += FRAME_MS
      expect(ctrl.sample().fire).toBe(false)
    }
  })

  // Guard: releasing the button stops fire on the next frame (the held flag is
  // honoured, not latched).
  it('stops firing the frame after the mouse button is released', () => {
    const ctrl = build()
    target.emit('mousedown', { button: 0 })
    ctrl.sample() // consume the initial press
    nowMs += FRAME_MS
    expect(ctrl.sample().fire, 'still held → fires').toBe(true)

    windowBus.emit('mouseup', { button: 0 })
    nowMs += FRAME_MS
    expect(ctrl.sample().fire, 'released → no longer fires').toBe(false)
  })
})
