// tests/shell/input.spinner.test.ts
//
// tp1-1 rework — BOTH controls are spinners, and neither may depend on a clock the
// simulation does not obey. Reviewer findings (rounds 1 and 2), ruled by the Jedi.
//
// ── What broke, part 1: the keyboard was a tick counter ──────────────────────
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
// That was not merely a "feel" regression. A flipper that reaches the rim walks it at
// one lane per (moveFrames + flipFrames) ROM frames — at L33+ that is 4 frames, i.e.
// 7.11 lanes/sec. The broken keyboard turned 4.27. **The player could not out-rotate a
// deep flipper at all**, so deep waves were unwinnable on the keyboard.
//
// ── What broke, part 2: the fix banked time the sim never ran ────────────────
// The first repair made the held key a constant angular VELOCITY driven by
// `performance.now()`. Frame-rate independent, but coupled to the WALL clock — and the
// loop discards wall time the sim refuses to run: it freezes on pause and clamps any
// single span to 0.25 s. So a 10-second pause with the key held bought 90 lanes (5.6
// laps) in the frame after Esc, and a 2-second stall bought 18.
//
// The keyboard now banks displacement over SIM time (`tick(dt)` from the loop's
// onStep), so it can only ever spend what the simulation spent.
//
// These tests are written in lanes per SECOND on purpose — that is the unit both bugs
// were invisible in — and they drive the REAL `advanceFixedSteps` kernel the shell loop
// uses, so the 0.25 s stall clamp under test is the shipped one, not a replica.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { advanceFixedSteps } from '@arcade/shared/loop'
import {
  createInputController,
  fastestFlipperRimSpeed,
  keyboardTurnRate,
  type InputController,
} from '../../src/shell/input'
import { SPIN_SENSITIVITY, SIM_STEP, ROM_FPS } from '../../src/core/rules'

// The loop's spiral-of-death guard: advanceFixedSteps clamps any single elapsed span
// to this, so a stalled frame steps at most this much sim time. Not imported because
// the kernel takes it as a defaulted parameter — asserted against observed behaviour
// below rather than trusted.
const LOOP_MAX_FRAME = 0.25

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

// A faithful stand-in for shell/loop.ts's frame(), using the same @arcade/shared kernel:
// an elapsed wall span becomes whole sim sub-steps; input is sampled once per frame that
// actually steps, BEFORE that frame's sub-steps tick; tick() fires per sub-step that ran.
// A PAUSED frame drains the accumulator but runs no sub-step body — exactly
// stepUnlessPaused's contract, under which the loop calls neither sampleInput nor onStep.
//
// Because sample() precedes the ticks of its own frame, a frame's displacement is read on
// the NEXT one: a constant one-frame lag, identical to the wall-clock build's and to the
// sim's own input latency. `drain()` reads the outstanding bank so a measurement can end
// on a whole number rather than smear that lag into the result, and `stepped()` reports
// the sim time the loop ACTUALLY ran — the quantity the rotation must be proportional to.
function makeRig(ctrl: InputController) {
  let acc = 0
  let stepped = 0
  return {
    /** Run one display frame of `elapsed` wall seconds. Returns lanes turned. */
    frame(elapsed: number, paused = false): number {
      let spin = 0
      let sampled = false
      acc = advanceFixedSteps(acc, elapsed, SIM_STEP, () => {
        if (paused) return
        if (!sampled) {
          sampled = true
          spin += ctrl.sample().spin
        }
        ctrl.tick(SIM_STEP)
        stepped += SIM_STEP
      })
      return spin * SPIN_SENSITIVITY
    },
    /** Run `seconds` of play at a steady display rate. Returns total lanes turned. */
    run(seconds: number, displayHz: number, paused = false): number {
      const frames = Math.round(seconds * displayHz)
      let lanes = 0
      for (let i = 0; i < frames; i++) lanes += this.frame(1 / displayHz, paused)
      return lanes
    },
    /** Read the outstanding bank without stepping — settles the one-frame lag. */
    drain(): number {
      return ctrl.sample().spin * SPIN_SENSITIVITY
    },
    /** Sim seconds the loop actually advanced. */
    stepped(): number {
      return stepped
    },
  }
}

describe('the keyboard is a spinner on the SIM clock (tp1-1 rework)', () => {
  let target: ReturnType<typeof makeBus>
  let windowBus: ReturnType<typeof makeBus>

  beforeEach(() => {
    target = makeBus()
    windowBus = makeBus()
    vi.stubGlobal('window', windowBus)
  })
  afterEach(() => vi.unstubAllGlobals())

  // Hold ArrowRight and play `seconds` at `displayHz`. Returns { lanes, stepped }:
  // total lanes turned, and the sim seconds the loop actually ran to turn them.
  function held(seconds: number, displayHz: number): { lanes: number; stepped: number } {
    const ctrl = createInputController(target as unknown as HTMLElement)
    windowBus.emit('keydown', { key: 'ArrowRight' })
    const rig = makeRig(ctrl)
    const lanes = rig.run(seconds, displayHz) + rig.drain()
    return { lanes, stepped: rig.stepped() }
  }

  it('turns the Claw at a constant rate in lanes per SECOND', () => {
    const { lanes, stepped } = held(4, 60)

    // Exact, not approximate: the rotation is keyboardTurnRate() per second of sim time.
    expect(lanes / stepped).toBeCloseTo(keyboardTurnRate(), 9)
    expect(keyboardTurnRate()).toBeCloseTo(9.0, 6) // 60 spin-units/s x SPIN_SENSITIVITY

    // And sim time is real time (the loop's contract), so that is 9 lanes per WALL
    // second too — to within the single sub-step still in flight at the cutoff.
    expect(stepped).toBeCloseTo(4.0, 1)
    expect(lanes).toBeGreaterThan(4 * keyboardTurnRate() - keyboardTurnRate() * SIM_STEP)
  })

  it('is FRAME-RATE INDEPENDENT — the rate cannot move when the display or step moves', () => {
    // The whole point of the rework. Four seconds of play at the sim's own rate, at
    // 60 Hz, or at 144 Hz must turn the Claw the same distance. Under the old
    // per-sample +/-1 these differed by 5x, which is precisely how the ROM rebase broke
    // the controls without a single test going red.
    const atSimRate = held(4, Math.round(ROM_FPS))
    const at60 = held(4, 60)
    const at144 = held(4, 144)

    // The three runs complete slightly different numbers of whole sub-steps in 4 s, so
    // they may differ by the rotation of ONE sub-step — and by no more than that.
    const oneStep = keyboardTurnRate() * SIM_STEP // 0.316 lanes
    expect(Math.abs(at60.lanes - atSimRate.lanes)).toBeLessThan(oneStep)
    expect(Math.abs(at144.lanes - atSimRate.lanes)).toBeLessThan(oneStep)

    // Per second of sim time they are identical to nine decimals — the real invariant.
    expect(at144.lanes / at144.stepped).toBeCloseTo(at60.lanes / at60.stepped, 9)
    expect(atSimRate.lanes).toBeGreaterThan(0) // non-vacuous: it really did turn
  })

  it('survives a stuttering frame budget — same second, same rotation', () => {
    const ctrl = createInputController(target as unknown as HTMLElement)
    windowBus.emit('keydown', { key: 'ArrowRight' })
    const rig = makeRig(ctrl)

    // A rough second of frames: a 4 ms sprint next to a 240 ms hitch, all within the
    // loop's clamp so every millisecond is genuinely stepped.
    const chunks = [0.004, 0.2, 0.016, 0.09, 0.008, 0.24, 0.062, 0.22, 0.16]
    let lanes = 0
    for (const dt of chunks) lanes += rig.frame(dt)
    lanes += rig.drain()

    expect(chunks.reduce((a, b) => a + b, 0)).toBeCloseTo(1.0, 6)
    expect(lanes / rig.stepped()).toBeCloseTo(keyboardTurnRate(), 9)
    expect(lanes).toBeCloseTo(keyboardTurnRate(), 0) // ~9 lanes in that ragged second
  })

  it('holds still when no key is held, and reverses on the opposite key', () => {
    // Non-vacuous controls: the rate machinery must not manufacture motion.
    const idle = createInputController(target as unknown as HTMLElement)
    const idleRig = makeRig(idle)
    expect(idleRig.run(1, 60) + idleRig.drain()).toBe(0)

    const left = createInputController(target as unknown as HTMLElement)
    windowBus.emit('keydown', { key: 'ArrowLeft' })
    const leftRig = makeRig(left)
    const lanes = leftRig.run(4, 60) + leftRig.drain()
    expect(lanes / leftRig.stepped()).toBeCloseTo(-keyboardTurnRate(), 9)
  })

  it('REJECTS the old per-sample tick: the rate must not track the sample count', () => {
    // Regression guard aimed squarely at `keySpin = ±1 per sample`. Under that model a
    // second at 144 Hz turned 144 x 0.15 = 21.6 lanes and a second at 28 Hz turned 4.27
    // — a 5x spread, and both wrong. They must now agree.
    const at144 = held(1, 144)
    const at28 = held(1, 28)
    expect(at144.lanes).not.toBeCloseTo(144 * SPIN_SENSITIVITY, 1)
    expect(at28.lanes).not.toBeCloseTo(28 * SPIN_SENSITIVITY, 1)
    expect(Math.abs(at144.lanes - at28.lanes)).toBeLessThan(keyboardTurnRate() * SIM_STEP)
  })
})

describe('the keyboard can never buy rotation the sim did not step (Reviewer, round 2)', () => {
  let target: ReturnType<typeof makeBus>
  let windowBus: ReturnType<typeof makeBus>

  beforeEach(() => {
    target = makeBus()
    windowBus = makeBus()
    vi.stubGlobal('window', windowBus)
  })
  afterEach(() => vi.unstubAllGlobals())

  function heldCtrl(): InputController {
    const ctrl = createInputController(target as unknown as HTMLElement)
    windowBus.emit('keydown', { key: 'ArrowRight' })
    return ctrl
  }

  it('PAUSE: ten seconds paused with the key held turns the Claw ZERO lanes', () => {
    // The blocking finding. Esc does not blur, so the arrow key stays held through the
    // pause; the loop freezes the sim ("paused time is discarded, not banked") while the
    // old wall-clock keyboard banked every millisecond of it. Measured at 90.0 lanes —
    // 5.6 full laps — in the single frame after resume.
    const rig = makeRig(heldCtrl())

    rig.run(0.5, 60) // playing, key held
    rig.drain() // settle the outstanding bank so the pause starts from zero

    const duringPause = rig.run(10, 60, true)
    expect(duringPause, 'a paused sim turns nothing').toBe(0)
    expect(rig.drain(), 'and it banks nothing behind the pause card either').toBe(0)

    // Resume. The first frame can deliver only the sub-steps it actually ran.
    const onResume = rig.frame(1 / 60) + rig.drain()
    const oneStep = keyboardTurnRate() * SIM_STEP // 0.316 lanes
    expect(onResume).toBeLessThanOrEqual(oneStep + 1e-9)
    expect(onResume, 'the old wall-clock build jumped 90 lanes here').toBeLessThan(1)
  })

  it('STALL: a 2-second hitch turns exactly the clamped span, not two seconds of it', () => {
    // advanceFixedSteps clamps a single elapsed span to 0.25 s, so a GC or asset hitch
    // steps at most floor(0.25 / SIM_STEP) = 7 sub-steps. The keyboard must spend that
    // and no more; the wall-clock build spent the full 2 s (18.0 lanes).
    const rig = makeRig(heldCtrl())
    rig.frame(SIM_STEP) // one normal frame, with the key held
    rig.drain()

    rig.frame(2.0) // the hitch: its sub-steps bank, and are read on the next sample
    const afterStall = rig.drain()

    const steps = Math.floor(LOOP_MAX_FRAME / SIM_STEP) // 7
    const clampedLanes = keyboardTurnRate() * steps * SIM_STEP // 2.21 lanes
    expect(afterStall).toBeCloseTo(clampedLanes, 9)
    expect(afterStall, 'the wall-clock build turned 18 lanes here').toBeLessThan(2.5)

    // Non-vacuous: the clamp really did bite — two seconds of play would be 18 lanes.
    expect(keyboardTurnRate() * 2.0).toBeGreaterThan(afterStall * 8)
  })

  it('does not read the wall clock at all — a frozen performance.now() changes nothing', () => {
    // The structural version of both findings above: the keyboard has no opinion about
    // wall time, so it cannot disagree with the loop about how much of it to honour.
    // Pin performance.now() to a constant; a wall-clock keyboard turns 0 lanes here.
    vi.stubGlobal('performance', { now: () => 12345 })
    const rig = makeRig(heldCtrl())
    const lanes = rig.run(4, 60) + rig.drain()
    expect(lanes / rig.stepped()).toBeCloseTo(keyboardTurnRate(), 9)
    expect(lanes).toBeGreaterThan(0)
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
  let target: ReturnType<typeof makeBus>
  let windowBus: ReturnType<typeof makeBus>

  beforeEach(() => {
    target = makeBus()
    windowBus = makeBus()
    vi.stubGlobal('window', windowBus)
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
        spin += ctrl.sample().spin
      }
      return spin * SPIN_SENSITIVITY
    }
    expect(turn(10)).toBeCloseTo(turn(1), 6)
    expect(turn(1)).toBeGreaterThan(0) // non-vacuous
  })

  it('keeps banking a spin the player really made through a pause', () => {
    // Deliberate asymmetry, and the reason the wheel is NOT tick()-driven: a player who
    // kept turning the knob through a pause genuinely turned it, and that displacement
    // is real hand motion, not banked clock. Only the keyboard synthesises motion from
    // time, so only the keyboard must be gated on the sim's clock.
    const ctrl = createInputController(target as unknown as HTMLElement)
    target.emit('wheel', { deltaY: 600 })
    expect(ctrl.sample().spin * SPIN_SENSITIVITY).toBeCloseTo(0.9, 6)
  })
})
