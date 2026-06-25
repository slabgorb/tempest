// src/core/enemies/flipper.ts
import { Flipper } from '../state'
import { Rng, rngNext } from '../rng'
import { Tube, wrapLane } from '../geometry'
import { LevelParams } from '../rules'

export function stepFlipper(
  enemy: Flipper, dt: number, params: LevelParams, tube: Tube, rng: Rng,
): { enemy: Flipper; rng: Rng } {
  const e: Flipper = { ...enemy }
  let r = rng

  // Climb toward the near rim.
  e.depth = Math.min(1, e.depth + params.flipperSpeed * dt)

  // Flip across a lane boundary when the timer elapses.
  e.flipTimer -= dt
  if (e.flipTimer <= 0) {
    const roll = rngNext(r)
    r = roll.rng
    const dir = roll.value < 0.5 ? -1 : 1
    e.lane = wrapLane(tube, e.lane + dir)
    e.flipTimer = params.flipInterval
  }

  return { enemy: e, rng: r }
}
