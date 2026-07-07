// src/core/enemies/flipper.ts
import { Flipper } from '../state'
import { type Rng, nextFloat } from '@arcade/shared/rng'
import { Tube, wrapLane } from '../geometry'
import { LevelParams } from '../rules'

// rng is a mutable cursor: nextFloat advances it in place. The caller owns it
// (sim clones state.rng into a fresh cursor each frame), so no rng is threaded back.
export function stepFlipper(
  enemy: Flipper, dt: number, params: LevelParams, tube: Tube, rng: Rng,
): { enemy: Flipper } {
  const e: Flipper = { ...enemy }
  const { moveFrames, flipFrames } = params.flipPattern

  // Climb toward the near rim — continues even while mid-flip.
  e.depth = Math.min(1, e.depth + params.flipperSpeed * dt)

  if (e.flipping) {
    // Advance the in-progress flip one tick (multi-tick animation, ROM
    // p_flip_cont). The integer lane stays put until the flip completes.
    e.flipProgress = (e.flipProgress ?? 0) + 1 / flipFrames
    if (e.flipProgress >= 1 - 1e-9) {
      e.lane = wrapLane(tube, e.lane + (e.flipDir ?? 1))
      e.flipping = false
      e.flipDir = undefined
      e.flipProgress = undefined
      e.flipTimer = moveFrames / 60   // climb for moveFrames before the next flip
    }
    return { enemy: e }
  }

  // Settled: count down the move timer and START a flip when it elapses
  // (ROM p_flip_start). The lane does NOT change yet — it settles on completion.
  e.flipTimer -= dt
  if (e.flipTimer <= 0) {
    e.flipDir = nextFloat(rng) < 0.5 ? -1 : 1
    e.flipping = true
    e.flipProgress = 1 / flipFrames   // the start step counts as tick 1
    e.flipTimer = moveFrames / 60
  }

  return { enemy: e }
}
