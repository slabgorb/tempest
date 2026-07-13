// tests/shell/input.spinner.test.ts
//
// tp1-1 rework — BOTH controls are spinners, and neither may depend on the sim's
// step rate. Reviewer finding, ruled by the Jedi 2026-07-13.
//
// ── What broke ───────────────────────────────────────────────────────────────
// The cabinet's control is a rotary spinner: a DISPLACEMENT device. `Input.spin` is
// therefore "how far the knob turned since you last asked", and sim.ts:86 applies it
// as one. The wheel modelled that correctly and survived the ROM rebase untouched.
//
// The keyboard did not: it emitted a fixed +/-1 on EVERY sample, so its rotation rate
// was `SPIN_SENSITIVITY x samples-per-second`. When tp1-1 moved the sim from 60 Hz to
// the ROM's 28.44 Hz, keyboard steering silently slowed 2.11x — 9.0 lanes/sec down to
// 4.27 — while the wheel did not move at all. Two controls tuned together came to
// disagree by a factor of two, and nothing caught it: the only player-rotation test in
// the repo asserts displacement PER STEP, which is step-rate blind and passes
// identically before and after.
//
// ── Why it was not merely a "feel" regression ────────────────────────────────
// A flipper that reaches the rim walks it at one lane per (moveFrames + flipFrames)
// ROM frames — at L33+ that is 4 frames, i.e. 7.11 lanes/sec. The broken keyboard
// turned 4.27. **The player could not out-rotate a deep flipper at all.** You cannot
// escape a pincer you are slower than, so deep waves were unwinnable on the keyboard.
//
// These tests are written in lanes per SECOND on purpose. That is the unit the bug was
// invisible in. Node env + fake event bus, matching tests/shell/input.test.ts.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  createInputController,
  fastestFlipperRimSpeed,
  keyboardTurnRate,
} from '../../src/shell/input'
import { SPIN_SENSITIVITY, SIM_STEP, ROM_FPS } from '../../src/core/rules'

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

describe('the keyboard is a spinner, not a per-frame tick (tp1-1 rework)', () => {
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

  // Hold ArrowRight, then sample `samples` times across `seconds` of real time.
  // Returns the total lanes the Claw turned.
  function lanesTurned(seconds: number, samples: number): number {
    const ctrl = createInputController(target as unknown as HTMLElement)
    windowBus.emit('keydown', { key: 'ArrowRight' })
    ctrl.sample() // establish the baseline instant; the key is now held

    let spin = 0
    for (let i = 0; i < samples; i++) {
      nowMs += (seconds / samples) * 1000
      spin += ctrl.sample().spin
    }
    return spin * SPIN_SENSITIVITY
  }

  it('turns the Claw at a constant rate in lanes per SECOND', () => {
    const lanes = lanesTurned(1.0, 30)
    expect(lanes).toBeCloseTo(keyboardTurnRate(), 6)
    expect(lanes).toBeCloseTo(9.0, 6) // 60 spin-units/s x SPIN_SENSITIVITY 0.15
  })

  it('is FRAME-RATE INDEPENDENT — the rate cannot move when the sim step moves', () => {
    // The whole point of the rework. Sampling at the sim's step rate, at 60 Hz, or at
    // 144 Hz must turn the Claw the same distance in the same second. Under the old
    // per-sample +/-1 these differed by more than 2x, which is precisely how the ROM
    // rebase broke the controls without a single test going red.
    const atSimStep = lanesTurned(1.0, Math.round(1 / SIM_STEP)) // 28 samples
    const at60 = lanesTurned(1.0, 60)
    const at144 = lanesTurned(1.0, 144)

    expect(at60).toBeCloseTo(atSimStep, 6)
    expect(at144).toBeCloseTo(atSimStep, 6)
    expect(atSimStep).toBeGreaterThan(0) // non-vacuous: it really did turn
  })

  it('survives a stuttering frame budget — same second, same rotation', () => {
    const ctrl = createInputController(target as unknown as HTMLElement)
    windowBus.emit('keydown', { key: 'ArrowRight' })
    ctrl.sample()

    let spin = 0
    const chunks = [0.05, 0.001, 0.3, 0.004, 0.42, 0.015, 0.16, 0.05]
    for (const dt of chunks) {
      nowMs += dt * 1000
      spin += ctrl.sample().spin
    }
    expect(chunks.reduce((a, b) => a + b, 0)).toBeCloseTo(1.0, 6)
    expect(spin * SPIN_SENSITIVITY).toBeCloseTo(keyboardTurnRate(), 6)
  })

  it('REJECTS the old per-sample tick: the rate must not track the sample count', () => {
    // Regression guard aimed squarely at `keySpin = ±1 per sample`. Under that model
    // 120 samples turn 120 x 0.15 = 18 lanes and 28 samples turn 4.2 — wildly
    // different. They must now be identical.
    const few = lanesTurned(1.0, 28)
    const many = lanesTurned(1.0, 120)
    expect(many).toBeCloseTo(few, 6)
    expect(many).not.toBeCloseTo(120 * SPIN_SENSITIVITY, 1)
  })

  it('holds still when no key is held, and reverses on the opposite key', () => {
    // Non-vacuous controls: the rate machinery must not manufacture motion.
    const idle = createInputController(target as unknown as HTMLElement)
    idle.sample()
    nowMs += 1000
    expect(idle.sample().spin).toBe(0)

    const left = createInputController(target as unknown as HTMLElement)
    windowBus.emit('keydown', { key: 'ArrowLeft' })
    left.sample()
    nowMs += 1000
    expect(left.sample().spin * SPIN_SENSITIVITY).toBeCloseTo(-keyboardTurnRate(), 6)
  })
})

describe('the escape constraint — the Claw must out-rotate the ROM (AC6)', () => {
  it('a deep flipper walks the rim at 7.11 lanes/sec', () => {
    // One lane per (moveFrames + flipFrames) ROM frames. L33+: 1 + 3 = 4 frames.
    // 28.44 / 4 = 7.11 lanes/sec — the fastest thing the ROM can send at the player.
    expect(fastestFlipperRimSpeed()).toBeCloseTo(ROM_FPS / 4, 9)
    expect(fastestFlipperRimSpeed()).toBeCloseTo(7.111, 3)
  })

  it('the player OUT-ROTATES the fastest flipper, with margin', () => {
    // The assertion that makes deep waves winnable — and the one the broken build
    // failed. A margin below 1.0 means the flipper closes on you no matter what you do.
    const margin = keyboardTurnRate() / fastestFlipperRimSpeed()
    expect(margin).toBeGreaterThan(1.2)
    expect(margin).toBeCloseTo(1.27, 2)

    // The broken value, named so that it can never quietly come back.
    const BROKEN_PER_STEP_RATE = SPIN_SENSITIVITY * ROM_FPS // 4.27 lanes/sec
    expect(BROKEN_PER_STEP_RATE).toBeLessThan(fastestFlipperRimSpeed())
    expect(keyboardTurnRate()).toBeGreaterThan(BROKEN_PER_STEP_RATE)
  })
})

describe('the wheel was always right — do not "fix" it (regression guard)', () => {
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
  afterEach(() => vi.unstubAllGlobals())

  it('banks real hand motion, so its rate never depended on how often we sample', () => {
    // The wheel is the REFERENCE device: it already modelled the arcade spinner, which
    // is why the ROM rebase did not touch it. The same total hand motion must turn the
    // Claw the same distance whether it is drained in one sample or in ten.
    const turn = (samples: number): number => {
      const ctrl = createInputController(target as unknown as HTMLElement)
      let spin = 0
      for (let i = 0; i < samples; i++) {
        target.emit('wheel', { deltaY: 600 / samples })
        nowMs += (1000 / samples)
        spin += ctrl.sample().spin
      }
      return spin * SPIN_SENSITIVITY
    }
    expect(turn(10)).toBeCloseTo(turn(1), 6)
    expect(turn(1)).toBeGreaterThan(0) // non-vacuous
  })
})
