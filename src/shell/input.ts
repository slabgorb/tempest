// src/shell/input.ts
import { Input } from '../core/input'

const WHEEL_SCALE = 0.01

export interface InputController {
  sample(): Input
}

export function createInputController(target: HTMLElement): InputController {
  let spinAccum = 0
  let fireQueued = false
  let startQueued = false
  let leftHeld = false
  let rightHeld = false

  target.addEventListener(
    'wheel',
    (e: WheelEvent) => {
      spinAccum += e.deltaY * WHEEL_SCALE
      e.preventDefault()
    },
    { passive: false },
  )

  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.repeat) return
    if (e.key === 'ArrowLeft') leftHeld = true
    else if (e.key === 'ArrowRight') rightHeld = true
    else if (e.key === ' ') fireQueued = true
    else if (e.key === 'Enter') startQueued = true
  })

  window.addEventListener('keyup', (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') leftHeld = false
    else if (e.key === 'ArrowRight') rightHeld = false
  })

  return {
    sample(): Input {
      const keySpin = (rightHeld ? 1 : 0) + (leftHeld ? -1 : 0)
      const input: Input = {
        spin: spinAccum + keySpin,
        fire: fireQueued,
        zap: false,
        start: startQueued,
      }
      spinAccum = 0
      fireQueued = false
      startQueued = false
      return input
    },
  }
}
