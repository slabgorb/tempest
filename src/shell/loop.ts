// src/shell/loop.ts
import { GameState, Mode } from '../core/state'
import { GameEvent } from '../core/events'
import { Input } from '../core/input'
import { stepGame } from '../core/sim'
import { advanceFixedSteps } from '@arcade/shared/loop'

const STEP = 1 / 60
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
    const elapsed = (t - last) / 1000
    last = t

    // Collect every sub-step's GameEvents for the shell (audio/fx). stepGame()
    // clears state.events each step, so the post-loop state only carries the
    // LAST sub-step's events — draining it alone would drop, e.g., one of two
    // enemy deaths that landed in different sub-steps of the same render frame.
    const frameEvents: GameEvent[] = []

    // SH-5: the fixed-timestep accumulator is now the shared @arcade/shared/loop
    // kernel — tempest composes OVER it, keeping its injected now() clock and the
    // per-sub-step work below instead of duplicating the arithmetic. advanceFixedSteps
    // clamps the elapsed span (its 0.25s default replaces the old local MAX_FRAME)
    // and invokes the step callback once per fixed STEP, returning the carried
    // remainder — which tempest just threads back into `acc` (draw takes no alpha).
    let input = NEUTRAL
    let sampled = false
    let first = true
    acc = advanceFixedSteps(acc, elapsed, STEP, () => {
      // Sample input lazily, exactly once, and ONLY on a frame that actually
      // steps (this callback runs solely when acc >= STEP). sampleInput() drains
      // and zeroes the accumulated spinner delta, so sampling on a no-step frame
      // (acc < STEP — constant from rAF jitter, always on >60Hz displays) would
      // read the wheel motion and throw it away before any step used it. That
      // dropped input is the "laggy spinner" feel.
      if (!sampled) {
        sampled = true
        try {
          input = sampleInput()
        } catch (e: unknown) {
          console.error('loop: sampleInput callback threw; using neutral input', e)
        }
      }
      // Apply the sampled edges (fire/start/spin) only on the first sub-step so a
      // single input event can't fire multiple bullets in one frame.
      state = stepGame(state, first ? input : NEUTRAL, STEP)
      for (const e of state.events) frameEvents.push(e)
      // Detect mode transitions per sub-step so two transitions in one frame each
      // fire once, in order. A throwing onModeChange must not stop the loop, and
      // prevMode must still advance so the same transition can't re-fire.
      if (state.mode !== prevMode) {
        runGuarded('onModeChange', () => onModeChange?.(prevMode, state.mode))
        prevMode = state.mode
      }
      first = false
    })

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
