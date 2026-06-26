// src/shell/input.ts
import { Input } from '../core/input'

const WHEEL_SCALE = 0.01
const AUTOFIRE_MS = 120

export interface InputController {
  sample(): Input
}

export function createInputController(target: HTMLElement): InputController {
  let spinAccum = 0
  let fireQueued = false
  let zapQueued = false
  let startQueued = false
  let leftHeld = false
  let rightHeld = false
  let mouseHeld = false
  let spaceHeld = false
  let lastAutoFire = 0

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
    lastAutoFire = performance.now()
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
      lastAutoFire = performance.now()
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
      const t = performance.now()
      const keySpin = (rightHeld ? 1 : 0) + (leftHeld ? -1 : 0)

      let fire = fireQueued
      if ((mouseHeld || spaceHeld) && t - lastAutoFire >= AUTOFIRE_MS) {
        fire = true
        lastAutoFire = t
      }

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
