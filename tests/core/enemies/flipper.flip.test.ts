// tests/core/enemies/flipper.flip.test.ts
//
// Story 6-14: flips now ANIMATE over multiple ticks instead of snapping to the
// adjacent lane in a single step. p_flip_start sets a mid-flip state + a target
// lane; p_flip_cont advances the flip a step per tick and only writes the new
// integer lane when the flip COMPLETES (enemy-roster ROM extract §A l.8671-8790).
//
// Tick-counting convention this suite pins: the step that STARTS a flip is
// tick 1 (flipProgress jumps 0 → 1/flipFrames). Each later step adds 1/flipFrames.
// The flip completes — flipping clears, the integer lane advances — on the step
// where flipProgress reaches 1, i.e. after exactly flipFrames ticks at 60 Hz.
import { describe, it, expect } from 'vitest'
import { stepFlipper } from '../../../src/core/enemies/flipper'
import { levelParams, flipPatternForLevel } from '../../../src/core/rules'
import { makeRng } from '../../../src/core/rng'
import { makeCircleTube, wrapLane } from '../../../src/core/geometry'
import { Flipper } from '../../../src/core/state'

const tube = makeCircleTube(16, { x: 0, y: 0 }, 60, 300)
const params = levelParams(1)
const DT = 1 / 60

function flipper(over: Partial<Flipper> = {}): Flipper {
  return { kind: 'flipper', lane: 5, depth: 0.5, flipTimer: 999, ...over }
}

describe('stepFlipper — multi-tick flip animation', () => {
  it('starting a flip does NOT change the integer lane in the same step', () => {
    const out = stepFlipper(flipper({ lane: 5, flipTimer: 0.001 }), DT, params, tube, makeRng(1))
    expect(out.enemy.lane).toBe(5) // lane is held until the flip completes
    expect(out.enemy.flipping).toBe(true) // now mid-flip
  })

  it('exposes an in-progress flip: a direction and a fractional progress in (0,1)', () => {
    const out = stepFlipper(flipper({ lane: 5, flipTimer: 0.001 }), DT, params, tube, makeRng(1))
    expect(out.enemy.flipping).toBe(true)
    expect([1, -1]).toContain(out.enemy.flipDir)
    expect(out.enemy.flipProgress).toBeGreaterThan(0)
    expect(out.enemy.flipProgress).toBeLessThan(1)
  })

  it('completes after multiple ticks, moving exactly one adjacent lane, progress rising', () => {
    let out = stepFlipper(flipper({ lane: 5, flipTimer: 0.001 }), DT, params, tube, makeRng(1))
    let e: Flipper = out.enemy
    let rng = out.rng
    expect(e.flipping).toBe(true)
    const dir = e.flipDir as number
    const progresses: number[] = [e.flipProgress as number]
    let steps = 1
    while (e.flipping && steps < 240) {
      out = stepFlipper(e, DT, params, tube, rng)
      e = out.enemy
      rng = out.rng
      steps++
      if (e.flipping) progresses.push(e.flipProgress as number)
    }
    expect(e.flipping).toBeFalsy()
    expect(steps).toBeGreaterThan(1) // genuinely multi-tick, not an instant snap
    expect(e.lane).toBe(wrapLane(tube, 5 + dir)) // landed on the adjacent lane
    for (let i = 1; i < progresses.length; i++) {
      expect(progresses[i]).toBeGreaterThan(progresses[i - 1]) // monotonic advance
    }
  })

  it('completes in exactly flipPatternForLevel(level).flipFrames ticks at 60 Hz', () => {
    const expected = flipPatternForLevel(1).flipFrames
    let out = stepFlipper(flipper({ lane: 5, flipTimer: 0.001 }), DT, params, tube, makeRng(1))
    let e: Flipper = out.enemy
    let rng = out.rng
    let ticks = 1 // the start step counts as tick 1
    while (e.flipping && ticks < 240) {
      out = stepFlipper(e, DT, params, tube, rng)
      e = out.enemy
      rng = out.rng
      ticks++
    }
    expect(ticks).toBe(expected)
  })

  it('keeps climbing while mid-flip — depth still increases', () => {
    const out = stepFlipper(flipper({ lane: 5, depth: 0.5, flipTimer: 0.001 }), DT, params, tube, makeRng(1))
    expect(out.enemy.flipping).toBe(true)
    expect(out.enemy.depth).toBeGreaterThan(0.5)
  })

  it('wraps around the closed tube when a flip completes past the edge', () => {
    let out = stepFlipper(flipper({ lane: 0, flipTimer: 0.001 }), DT, params, tube, makeRng(99))
    let e: Flipper = out.enemy
    let rng = out.rng
    let guard = 0
    while (e.flipping && guard++ < 240) {
      out = stepFlipper(e, DT, params, tube, rng)
      e = out.enemy
      rng = out.rng
    }
    expect([1, 15]).toContain(e.lane)
  })

  it('does not start a flip before the move timer elapses', () => {
    const out = stepFlipper(flipper({ lane: 5, flipTimer: 1 }), DT, params, tube, makeRng(1))
    expect(out.enemy.lane).toBe(5)
    expect(out.enemy.flipping).toBeFalsy()
  })

  it('is deterministic: same seed → same flip direction and timing', () => {
    const a = stepFlipper(flipper({ lane: 8, flipTimer: 0.001 }), DT, params, tube, makeRng(7))
    const b = stepFlipper(flipper({ lane: 8, flipTimer: 0.001 }), DT, params, tube, makeRng(7))
    expect(a.enemy.flipDir).toBe(b.enemy.flipDir)
    expect(a.enemy.flipProgress).toBe(b.enemy.flipProgress)
  })

  it('advances the RNG when a flip starts (direction roll)', () => {
    const rng = makeRng(7)
    const out = stepFlipper(flipper({ lane: 8, flipTimer: 0.001 }), DT, params, tube, rng)
    expect(out.rng.s).not.toBe(rng.s)
  })

  it('does NOT advance the RNG on a plain climb step (no flip)', () => {
    const rng = makeRng(7)
    const out = stepFlipper(flipper({ lane: 8, flipTimer: 1 }), DT, params, tube, rng)
    expect(out.rng.s).toBe(rng.s)
  })
})
