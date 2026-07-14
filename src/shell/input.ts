// src/shell/input.ts
import { Input } from '../core/input'
import { ROM_FPS, SPIN_SENSITIVITY } from '../core/rules'
import { chaserRimFramesPerLane } from '../core/enemies/interpreter'

// ─── Both controls are SPINNERS. Neither is a per-frame tick. (tp1-1) ────────
//
// The cabinet's control is a rotary spinner: a DISPLACEMENT device. You turn the
// knob, the Claw moves by however far you turned it, and the machine's frame rate
// has nothing whatever to do with it. `core.Input.spin` is therefore a displacement
// — "how far the knob moved since you last asked" — and sim.ts applies it as one.
//
// The WHEEL already modelled that correctly: `spinAccum` banks real hand motion and
// is drained whole on each sample, so sampling half as often simply drains twice as
// much. Its behaviour never depended on the step rate, and the ROM rebase did not
// touch it. It is the reference device; do not "fix" it.
//
// The KEYBOARD did not. It emitted a fixed +/-1 on EVERY sample — which is not a
// control at all, it is a tick counter wearing a control's clothes. Its rotation rate
// was `SPIN_SENSITIVITY x samples-per-second`, so when tp1-1 moved the sim from 60 Hz
// to the ROM's 28.44 Hz, keyboard steering silently slowed by 2.11x while the wheel
// did not move at all. Two controls that had been tuned together came to disagree.
//
// So the keyboard is rebuilt in the wheel's image: a held key is a constant angular
// VELOCITY, and we bank the displacement it produces over elapsed time.
//
// ─── WHOSE clock? The SIM's, not the wall's. (tp1-1 rework, round 2) ─────────
//
// The first attempt at this banked `performance.now()` deltas, and that was a second
// defect wearing the first one's clothes. The shell's wall clock and the simulation's
// clock are NOT the same clock: the loop DISCARDS time the sim refuses to run — it
// freezes on pause (`stepUnlessPaused`: "paused time is discarded, not banked") and
// clamps any single span to 0.25 s so a stall cannot spiral. A keyboard reading the
// wall clock banks every millisecond of that discarded time: a 10-second pause with
// the key held bought 90 lanes of rotation — 5.6 laps — in the frame after Esc.
//
// Clamping the wall-clock delta would only BOUND that divergence, not remove it: the
// input would still be coupled to a clock the simulation does not obey. The coupling
// is the bug, so `tick(dt)` is fed from the loop's `onStep` — the hook that fires once
// per sub-step that ACTUALLY advanced the sim, carrying the sim's own dt. Held-key
// displacement is now, by construction, exactly what the simulation ran: zero while
// paused, exactly the clamped span through a stall, and a constant 9.0 lanes/sec of
// real time whenever the game is actually running, at any display rate.
//
// This is the identical fix, for the identical reason, that FR-017 applied to the warp
// starfield in this same story — it was driven by requestAnimationFrame, so it ran at
// the monitor's rate and kept flying while the game was paused. The keyboard was the
// same bug in the same story. Both now hang off the sim's clock.
const WHEEL_SCALE = 0.01

// How fast a held arrow key spins the knob, in spin-units per SECOND.
//
// This number is NOT restored from what shipped before — it is derived from the ROM,
// because the escape constraint decides it. An invader that reaches the rim becomes a
// CHASER and walks it at TOPPER's cadence: a crouch, then a jump, then round again. At
// wave 33+, the fastest the ROM can make it, that is 7 frames a lane — 28.44/7 = 4.06
// lanes/sec. **The player must be able to out-rotate that**, or a deep wave is
// unwinnable: you cannot escape a pincer you are slower than.
//
// 60 spin-units/sec gives 60 x 0.15 = 9.0 lanes/sec, a 2.2x margin over the fastest thing
// the ROM can send at you. (That it also matches the pre-rebase feel is a happy accident,
// not the reason.)
//
// tp1-5 re-derived the chaser's real cadence and it came out SLOWER than the 4-frame
// guess this constant was originally sized against (7.11 lanes/sec), so the margin widened
// from 1.27x to 2.2x on its own. KEY_SPIN_RATE is deliberately left alone: the constraint
// it exists to satisfy is a floor, not a target, and re-tuning the feel of the keyboard is
// not this story's business. If anything ever wants the margin tightened, that is a
// playtest decision, made against the real number, which is finally what the shell holds.
//
// Pinned by tests/shell/input.spinner.test.ts, in lanes per SECOND.
const KEY_SPIN_RATE = 60

// The wave that produces the FASTEST chaser the ROM can build. TOPPER's jump burns WTTFRA
// angle-steps a frame, and TWTTFRA (ALWELG.MAC:704-706) steps that from 2 to 3 at wave 33
// and never again — so the deepest wave is the quickest lap of the rim, and 33 is where it
// tops out.
//
// This replaces DEEP_FLIPPER_RIM_FRAMES_PER_LANE = 4, which tp1-1 left behind with a note
// saying so: it was measured against the per-kind flipper stepper, and tp1-4 deleted that
// stepper. The enemy that actually walks the rim is the CHASER, and until story tp1-5
// there was no chaser to measure — the constant described a thing that no longer existed.
// It is now DERIVED, from TOPPER's own bytecode, by chaserRimFramesPerLane.
//
// The old number was WRONG IN THE SAFE DIRECTION, which is why nothing failed: 4 frames a
// lane overstated the chaser (the truth is 7), so the margin it sized was too wide rather
// than too narrow. Worth stating plainly, because the correction has an edge to it — the
// real chaser is SLOWER than the number the shell was defending against, so the margin
// gets wider, not tighter, and no deep wave was ever unwinnable on this account.
const FASTEST_CHASER_WAVE = 33

/**
 * The rim speed of the fastest chaser the ROM can produce, in lanes/sec — the thing the
 * player must out-rotate. (Named for the flipper because a flipper is what usually
 * becomes one; a chaser is a rim STATE, not a kind, so a pulsar that takes the rim walks
 * it at exactly this rate too.)
 */
export function fastestFlipperRimSpeed(): number {
  return ROM_FPS / chaserRimFramesPerLane(FASTEST_CHASER_WAVE)
}

/** Lanes/sec the Claw turns while an arrow key is held. Must beat the flipper. */
export function keyboardTurnRate(): number {
  return KEY_SPIN_RATE * SPIN_SENSITIVITY
}

export interface InputController {
  /**
   * Advance the held-key spinner by one sub-step of SIM time. Wired to the loop's
   * `onStep`, which fires only for sub-steps that actually advanced the simulation
   * — so a paused or stalled game banks nothing it did not run. This is the ONLY
   * clock the keyboard sees; it deliberately does not read `performance.now()`.
   */
  tick(dt: number): void
  sample(): Input
}

export function createInputController(target: HTMLElement): InputController {
  let spinAccum = 0
  let keyAccum = 0
  let fireQueued = false
  let zapQueued = false
  let startQueued = false
  let leftHeld = false
  let rightHeld = false
  let mouseHeld = false
  let spaceHeld = false

  target.addEventListener(
    'wheel',
    (e: WheelEvent) => {
      spinAccum += e.deltaY * WHEEL_SCALE
      e.preventDefault()
    },
    { passive: false },
  )

  // Left mouse: fire (and restart on game over); holding it auto-fires.
  target.addEventListener('mousedown', (e: MouseEvent) => {
    if (e.button !== 0) return
    mouseHeld = true
    fireQueued = true
    startQueued = true
    e.preventDefault()
  })
  window.addEventListener('mouseup', (e: MouseEvent) => {
    if (e.button === 0) mouseHeld = false
  })
  // Dropping focus must release every held control, or the Claw "sticks".
  window.addEventListener('blur', () => {
    mouseHeld = false
    spaceHeld = false
    leftHeld = false
    rightHeld = false
    zapQueued = false
  })

  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.repeat) return
    if (e.key === 'ArrowLeft') leftHeld = true
    else if (e.key === 'ArrowRight') rightHeld = true
    else if (e.key === ' ') {
      // Hold space to autofire, mirroring held mouse — frees the hand on the
      // wheel. The `e.repeat` guard above means we only see the initial press;
      // sample() drives the repeat cadence off `spaceHeld`.
      spaceHeld = true
      fireQueued = true
      e.preventDefault()
    } else if (e.key === 'Shift') {
      // Superzapper: a single edge per press. The `e.repeat` guard above keeps
      // a held Shift from re-triggering; sample() consumes the edge each frame.
      zapQueued = true
    } else if (e.key === 'Enter') startQueued = true
  })

  window.addEventListener('keyup', (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') leftHeld = false
    else if (e.key === 'ArrowRight') rightHeld = false
    else if (e.key === ' ') spaceHeld = false
  })

  return {
    tick(dt: number): void {
      // The held key is an angular VELOCITY; bank the displacement it buys over the
      // sim time that just ran. The DIRECTION is a level read (both keys held cancels),
      // the RATE is what `dt` buys. Banked here rather than at sample() so the keyboard
      // can only ever spend time the simulation actually spent.
      const keyDir = (rightHeld ? 1 : 0) + (leftHeld ? -1 : 0)
      keyAccum += keyDir * KEY_SPIN_RATE * dt
    },

    sample(): Input {
      // Both spinners drain WHOLE, exactly as the wheel always did: sample twice as
      // often and each sample carries half as much. The rotation a second of play buys
      // is therefore independent of how often the shell happens to ask.
      //
      // A held button (mouse or space) requests fire on every frame; the core's
      // 8-shot concurrent cap is the only gate on cadence (Story 6-2). A single
      // click still fires once via fireQueued.
      const fire = fireQueued || mouseHeld || spaceHeld

      const input: Input = {
        spin: spinAccum + keyAccum,
        fire,
        zap: zapQueued,
        start: startQueued,
      }
      spinAccum = 0
      keyAccum = 0
      fireQueued = false
      zapQueued = false
      startQueued = false
      return input
    },
  }
}
