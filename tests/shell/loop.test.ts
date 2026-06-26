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

const stepGameMock = vi.mocked(stepGame)
const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }
const STEP_MS = 1000 / 60 // one fixed sim step, in ms (loop's STEP = 1/60 s)

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
