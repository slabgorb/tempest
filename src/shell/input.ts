// src/shell/input.ts
import { Input } from '../core/input'
import { ROM_FPS, SPIN_SENSITIVITY, flipPatternForLevel } from '../core/rules'

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
// touch it.
//
// The KEYBOARD did not. It emitted a fixed +/-1 on EVERY sample — which is not a
// control at all, it is a tick counter wearing a control's clothes. Its rotation rate
// was `SPIN_SENSITIVITY x samples-per-second`, so when tp1-1 moved the sim from 60 Hz
// to the ROM's 28.44 Hz, keyboard steering silently slowed by 2.11x while the wheel
// did not move at all. Two controls that had been tuned together now disagreed.
//
// So the keyboard is rebuilt in the wheel's image: a held key is a constant angular
// VELOCITY, and we bank the displacement it produces over real elapsed time. It is now
// frame-rate independent by construction, and no future change to the sim's step rate
// can move it.
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

/** The rim speed of the fastest flipper the ROM can produce, in lanes/sec. */
export function fastestFlipperRimSpeed(): number {
  const { moveFrames, flipFrames } = flipPatternForLevel(33)
  return ROM_FPS / (moveFrames + flipFrames)
}

/** Lanes/sec the Claw turns while an arrow key is held. Must beat the flipper. */
export function keyboardTurnRate(): number {
  return KEY_SPIN_RATE * SPIN_SENSITIVITY
}

export interface InputController {
  sample(): Input
}

export function createInputController(target: HTMLElement): InputController {
  let spinAccum = 0
  let lastSampleAt = performance.now()
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
    sample(): Input {
      // The held key is an angular VELOCITY; bank the displacement it produced over
      // the real time since the last sample. Sample twice as often and each sample
      // carries half as much — exactly how the wheel already behaves. The direction
      // is a level read (both keys held cancels), the RATE is what elapsed time buys.
      const t = performance.now()
      const elapsed = Math.max(0, (t - lastSampleAt) / 1000)
      lastSampleAt = t
      const keyDir = (rightHeld ? 1 : 0) + (leftHeld ? -1 : 0)
      const keySpin = keyDir * KEY_SPIN_RATE * elapsed

      // A held button (mouse or space) requests fire on every frame; the core's
      // 8-shot concurrent cap is the only gate on cadence (Story 6-2). A single
      // click still fires once via fireQueued.
      const fire = fireQueued || mouseHeld || spaceHeld

      const input: Input = {
        spin: spinAccum + keySpin,
        fire,
        zap: zapQueued,
        start: startQueued,
      }
      spinAccum = 0
      fireQueued = false
      zapQueued = false
      startQueued = false
      return input
    },
  }
}
