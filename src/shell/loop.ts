// src/shell/loop.ts
import { GameState, Mode } from '../core/state'
import { GameEvent } from '../core/events'
import { Input } from '../core/input'
import { stepGame } from '../core/sim'

const STEP = 1 / 60
const MAX_FRAME = 0.25
const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }

// The shell-supplied callbacks (sampleInput / draw / onModeChange) cross the IO
// boundary and may throw. frame() reschedules itself with requestAnimationFrame
// as its LAST act, so an unguarded throw skips that reschedule and silently kills
// the game (Story 5-9). Run each void callback guarded — log and swallow — so a
// single bad frame can never stop the loop. sampleInput returns a value, so it is
// guarded inline with a neutral-input fallback instead.
function runGuarded(label: string, fn: () => void): void {
  try {
    fn()
  } catch (e: unknown) {
    console.error(`loop: ${label} callback threw; continuing`, e)
  }
}

export interface Loop {
  start(): void
  stop(): void
  getState(): GameState
}

export function createLoop(
  initial: GameState,
  sampleInput: () => Input,
  draw: (s: GameState, frameEvents: readonly GameEvent[]) => void,
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

    // Collect every sub-step's GameEvents for the shell (audio/fx). stepGame()
    // clears state.events each step, so the post-loop state only carries the
    // LAST sub-step's events — draining it alone would drop, e.g., one of two
    // enemy deaths that landed in different sub-steps of the same render frame.
    const frameEvents: GameEvent[] = []

    // Only sample input when a fixed step will actually consume it. sampleInput()
    // drains and zeroes the accumulated spinner delta, so calling it on a frame
    // that runs no sub-step (acc < STEP — happens constantly from rAF jitter and
    // always on >60Hz displays) would read the wheel motion and throw it away
    // before any step uses it. That dropped input is the "laggy spinner" feel.
    if (acc >= STEP) {
      let input = NEUTRAL
      try {
        input = sampleInput()
      } catch (e: unknown) {
        console.error('loop: sampleInput callback threw; using neutral input', e)
      }
      let first = true
      while (acc >= STEP) {
        // Apply the sampled edges (fire/start/spin) only on the first sub-step
        // so a single input event can't fire multiple bullets in one frame.
        state = stepGame(state, first ? input : NEUTRAL, STEP)
        for (const e of state.events) frameEvents.push(e)
        // Detect mode transitions per sub-step so two transitions in one frame
        // each fire once, in order. A throwing onModeChange must not stop the loop,
        // and prevMode must still advance so the same transition can't re-fire.
        if (state.mode !== prevMode) {
          runGuarded('onModeChange', () => onModeChange?.(prevMode, state.mode))
          prevMode = state.mode
        }
        acc -= STEP
        first = false
      }
    }
    runGuarded('draw', () => draw(state, frameEvents))
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
