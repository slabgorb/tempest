// src/shell/loop.ts
import { GameState, Mode } from '../core/state'
import { Input } from '../core/input'
import { stepGame } from '../core/sim'

const STEP = 1 / 60
const MAX_FRAME = 0.25
const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }

export interface Loop {
  start(): void
  stop(): void
  getState(): GameState
}

export function createLoop(
  initial: GameState,
  sampleInput: () => Input,
  draw: (s: GameState) => void,
  now: () => number,
  onModeChange?: (oldMode: Mode, newMode: Mode) => void,
): Loop {
  let state = initial
  let acc = 0
  let last = now()
  let raf = 0
  // Seeded to the initial mode so the first frame never fires a spurious event.
  let prevMode = initial.mode

  function frame(): void {
    const t = now()
    let delta = (t - last) / 1000
    last = t
    if (delta > MAX_FRAME) delta = MAX_FRAME
    acc += delta

    // Only sample input when a fixed step will actually consume it. sampleInput()
    // drains and zeroes the accumulated spinner delta, so calling it on a frame
    // that runs no sub-step (acc < STEP — happens constantly from rAF jitter and
    // always on >60Hz displays) would read the wheel motion and throw it away
    // before any step uses it. That dropped input is the "laggy spinner" feel.
    if (acc >= STEP) {
      const input = sampleInput()
      let first = true
      while (acc >= STEP) {
        // Apply the sampled edges (fire/start/spin) only on the first sub-step
        // so a single input event can't fire multiple bullets in one frame.
        state = stepGame(state, first ? input : NEUTRAL, STEP)
        // Detect mode transitions per sub-step so two transitions in one frame
        // each fire once, in order.
        if (state.mode !== prevMode) {
          onModeChange?.(prevMode, state.mode)
          prevMode = state.mode
        }
        acc -= STEP
        first = false
      }
    }
    draw(state)
    raf = requestAnimationFrame(frame)
  }

  return {
    start(): void {
      last = now()
      raf = requestAnimationFrame(frame)
    },
    stop(): void {
      cancelAnimationFrame(raf)
    },
    getState(): GameState {
      return state
    },
  }
}
