// tests/shell/loop.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// The loop is shell, but the mode-transition detection it owns must be unit
// tested in isolation. We mock the pure sim so each stepGame() sub-step returns
// a mode we script, letting us drive transitions deterministically without
// reaching into real simulation rules.
vi.mock('../../src/core/sim', () => ({
  stepGame: vi.fn(),
}))

import { createLoop } from '../../src/shell/loop'
import { GameState, Mode } from '../../src/core/state'
import { playingState } from '../core/helpers'
import { stepGame } from '../../src/core/sim'
import { Input } from '../../src/core/input'
import { SIM_STEP } from '../../src/core/rules'

const stepGameMock = vi.mocked(stepGame)
const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }
// One fixed sim step, in ms. tp1-1: the sim is ROM-paced — the loop's STEP is now
// SIM_STEP (9/256 s = 35.16 ms), not 1/60 s. Taken from the core rather than restated,
// because a test that keeps its own private opinion about the clock is how the 60
// survived here in the first place. These tests are about onModeChange and the guarded
// callbacks; the step size is incidental to every one of them.
const STEP_MS = SIM_STEP * 1000

describe('createLoop onModeChange hook', () => {
  let nowMs: number
  let rafCb: FrameRequestCallback | null
  // Modes the mocked stepGame should return, one per sub-step. When empty, the
  // mock returns the incoming mode unchanged (no transition).
  let modeQueue: Mode[]

  const now = () => nowMs
  const sampleInput = () => NEUTRAL
  const draw = () => {}

  // Invoke the most recently scheduled animation frame (the loop reschedules
  // itself synchronously inside frame(), so rafCb is fresh after each call).
  function runFrame(): void {
    const cb = rafCb
    if (!cb) throw new Error('no animation frame scheduled')
    cb(0)
  }

  // Advance the fake clock by `n` whole sim steps (+ half-ms epsilon to defeat
  // float drift) and run one frame, making the loop perform exactly `n`
  // stepGame() sub-steps in that frame.
  function pump(n: number): void {
    nowMs += n * STEP_MS + 0.5
    runFrame()
  }

  beforeEach(() => {
    nowMs = 0
    rafCb = null
    modeQueue = []

    stepGameMock.mockReset()
    stepGameMock.mockImplementation((state: GameState) => {
      const mode = modeQueue.length ? (modeQueue.shift() as Mode) : state.mode
      return { ...state, mode }
    })

    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafCb = cb
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', () => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // AC1: createLoop accepts an optional onModeChange callback.
  // AC3: callback fires with correct (oldMode, newMode).
  it('fires onModeChange with (oldMode, newMode) when the sim mode changes', () => {
    const onModeChange = vi.fn()
    const loop = createLoop(playingState(1), sampleInput, draw, now, onModeChange)
    loop.start()

    modeQueue = ['dying'] // one sub-step: playing -> dying
    pump(1)

    expect(onModeChange).toHaveBeenCalledTimes(1)
    expect(onModeChange).toHaveBeenCalledWith('playing', 'dying')
  })

  // AC2: transitions detected by comparing state.mode before/after a step.
  // Edge: no transition -> no fire.
  it('does not fire when the mode is unchanged across the frame', () => {
    const onModeChange = vi.fn()
    const loop = createLoop(playingState(1), sampleInput, draw, now, onModeChange)
    loop.start()

    modeQueue = ['playing', 'playing'] // two sub-steps, no change
    pump(2)

    expect(onModeChange).not.toHaveBeenCalled()
  })

  // AC4: multiple stepGame() calls in one frame must not double-fire for a
  // single actual transition.
  it('fires exactly once for a single transition spread across sub-steps', () => {
    const onModeChange = vi.fn()
    const loop = createLoop(playingState(1), sampleInput, draw, now, onModeChange)
    loop.start()

    // 3 sub-steps in one frame; mode only actually changes on the last one.
    modeQueue = ['playing', 'playing', 'dying']
    pump(3)

    expect(onModeChange).toHaveBeenCalledTimes(1)
    expect(onModeChange).toHaveBeenCalledWith('playing', 'dying')
  })

  // AC4: per the session technical approach, detection is per sub-step ("after
  // each stepGame() call, compare state.mode against the previous mode"), so two
  // distinct transitions within one frame fire once each, in order.
  it('fires once per actual transition even when several occur in one frame', () => {
    const onModeChange = vi.fn()
    const loop = createLoop(playingState(1), sampleInput, draw, now, onModeChange)
    loop.start()

    modeQueue = ['dying', 'gameover'] // two real transitions, one frame
    pump(2)

    expect(onModeChange).toHaveBeenCalledTimes(2)
    expect(onModeChange).toHaveBeenNthCalledWith(1, 'playing', 'dying')
    expect(onModeChange).toHaveBeenNthCalledWith(2, 'dying', 'gameover')
  })

  // AC2: the previous mode is remembered across frames, not reset each frame.
  it('tracks the previous mode across separate frames', () => {
    const onModeChange = vi.fn()
    const loop = createLoop(playingState(1), sampleInput, draw, now, onModeChange)
    loop.start()

    modeQueue = ['dying']
    pump(1)
    modeQueue = ['gameover']
    pump(1)

    expect(onModeChange).toHaveBeenCalledTimes(2)
    expect(onModeChange).toHaveBeenNthCalledWith(1, 'playing', 'dying')
    expect(onModeChange).toHaveBeenNthCalledWith(2, 'dying', 'gameover')
  })

  // Edge: the initial mode must not produce a spurious fire on the first frame
  // (no comparing the seed mode against an uninitialised/undefined previous).
  it('does not fire on the first frame when the mode stays at its initial value', () => {
    const onModeChange = vi.fn()
    const loop = createLoop(playingState(1), sampleInput, draw, now, onModeChange)
    loop.start()

    // seed (playingState) mode is 'playing'; nothing scripted -> mode unchanged.
    pump(1)

    expect(onModeChange).not.toHaveBeenCalled()
  })

  // AC5: the hook is optional — the loop runs and advances with no callback.
  it('runs without an onModeChange callback and still advances mode', () => {
    const loop = createLoop(playingState(1), sampleInput, draw, now)
    loop.start()

    modeQueue = ['dying']
    expect(() => pump(1)).not.toThrow()
    expect(loop.getState().mode).toBe('dying')
  })
})

// Story 5-9: the loop invokes sampleInput / onModeChange / draw before it
// reschedules the next animation frame (requestAnimationFrame is the LAST thing
// frame() does). If any callback throws, that reschedule is never reached and the
// rAF chain dies — the game silently halts. The loop MUST survive a throwing
// callback and keep scheduling frames. The decisive signal is the reschedule
// count: a frame that survives a throw still calls requestAnimationFrame again.
describe('createLoop callback robustness (Story 5-9)', () => {
  let nowMs: number
  let rafCb: FrameRequestCallback | null
  let rafCount: number // total requestAnimationFrame() calls; +1 per scheduled frame
  let modeQueue: Mode[]

  const now = () => nowMs

  function runFrame(): void {
    const cb = rafCb
    if (!cb) throw new Error('no animation frame scheduled')
    cb(0)
  }
  function pump(n: number): void {
    nowMs += n * STEP_MS + 0.5
    runFrame()
  }

  beforeEach(() => {
    nowMs = 0
    rafCb = null
    rafCount = 0
    modeQueue = []

    stepGameMock.mockReset()
    stepGameMock.mockImplementation((state: GameState) => {
      const mode = modeQueue.length ? (modeQueue.shift() as Mode) : state.mode
      return { ...state, mode }
    })

    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafCb = cb
      rafCount += 1
      return rafCount
    })
    vi.stubGlobal('cancelAnimationFrame', () => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // AC1: a throwing onModeChange must not halt the loop — the rAF chain survives
  // and the loop keeps advancing on subsequent frames.
  it('keeps scheduling frames when onModeChange throws', () => {
    const onModeChange = vi.fn(() => {
      throw new Error('onModeChange boom')
    })
    const loop = createLoop(playingState(1), () => NEUTRAL, () => {}, now, onModeChange)
    loop.start()
    expect(rafCount).toBe(1) // start() scheduled the first frame

    modeQueue = ['dying'] // forces the throwing callback to fire this frame
    expect(() => pump(1)).not.toThrow()
    expect(onModeChange).toHaveBeenCalledTimes(1)
    expect(rafCount).toBe(2) // frame rescheduled despite the throw — chain alive

    // The loop must still advance on the very next frame.
    modeQueue = ['gameover']
    expect(() => pump(1)).not.toThrow()
    expect(rafCount).toBe(3)
    expect(loop.getState().mode).toBe('gameover')
  })

  // AC1: a throwing draw callback must not halt the loop either.
  it('keeps scheduling frames when draw throws', () => {
    const draw = vi.fn(() => {
      throw new Error('draw boom')
    })
    const loop = createLoop(playingState(1), () => NEUTRAL, draw, now)
    loop.start()
    expect(rafCount).toBe(1)

    expect(() => pump(1)).not.toThrow()
    expect(draw).toHaveBeenCalledTimes(1)
    expect(rafCount).toBe(2) // rescheduled despite draw throwing
  })

  // AC1: a throwing sampleInput must not halt the loop. sampleInput only runs on a
  // frame that consumes at least one sub-step, which pump(1) guarantees.
  it('keeps scheduling frames when sampleInput throws', () => {
    const sampleInput = vi.fn(() => {
      throw new Error('sampleInput boom')
    })
    const loop = createLoop(playingState(1), sampleInput, () => {}, now)
    loop.start()
    expect(rafCount).toBe(1)

    expect(() => pump(1)).not.toThrow()
    expect(sampleInput).toHaveBeenCalledTimes(1)
    expect(rafCount).toBe(2) // rescheduled despite sampleInput throwing
  })
})
