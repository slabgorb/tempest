// src/shell/input.ts
import { Input } from '../core/input'
import { ROM_FPS, SPIN_SENSITIVITY } from '../core/rules'

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
// because the escape constraint decides it. A flipper that reaches the rim walks it at
// one lane per (moveFrames + flipFrames) ROM frames. At L33+ that is 1 + 3 = 4 frames,
// i.e. 28.44/4 = 7.11 lanes/sec. **The player must be able to out-rotate that**, or a
// deep wave is unwinnable: you cannot escape a pincer you are slower than.
//
// The broken per-step keyboard gave 4.27 lanes/sec — a margin of 0.60x. It could not
// escape a deep flipper AT ALL. 60 spin-units/sec gives 60 x 0.15 = 9.0 lanes/sec, a
// 1.27x margin over the fastest thing the ROM can send at you. (That it also matches
// the pre-rebase feel is a happy accident, not the reason.)
//
// Pinned by tests/shell/input.spinner.test.ts, in lanes per SECOND.
const KEY_SPIN_RATE = 60

// ROM frames a deep-wave flipper takes to walk one lane of the rim: 1 frame of
// move + a 3-frame flip, at L33+.
//
// These two numbers came from `flipPatternForLevel`, which tp1-4 deleted — the CAM
// (W-005..W-008) refutes it: a flip is 8 angle-steps at every wave, and the climb
// between flips is written into the program, not ramped per level. The number is
// kept HERE, and unchanged, on purpose. It is not a flipper fact: it is the escape
// constraint this module exists to satisfy, and the enemy that actually walks the
// rim is the CHASER (TOPPER), which story tp1-5 builds. Revise it there, from
// TOPPER's real cadence — a `VSLOOP 4` crouch plus a jump of JUMP_ANGLE_STEPS /
// WTTFRA frames — and re-derive KEY_SPIN_RATE's margin against it. Lowering this
// number silently WIDENS the margin, so leaving it high is the safe side to sit on
// until the chaser exists to measure.
const DEEP_FLIPPER_RIM_FRAMES_PER_LANE = 4

/** The rim speed of the fastest flipper the ROM can produce, in lanes/sec. */
export function fastestFlipperRimSpeed(): number {
  return ROM_FPS / DEEP_FLIPPER_RIM_FRAMES_PER_LANE
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
