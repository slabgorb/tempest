// src/core/enemies/flipper.ts
import { Enemy } from '../state'
import { Rng } from '../rng'
import { Tube } from '../geometry'
import { LevelParams } from '../rules'

// Climb toward the near rim. (Flipping across lanes is added in Task 11.)
export function stepFlipper(
  enemy: Enemy, dt: number, params: LevelParams, _tube: Tube, rng: Rng,
): { enemy: Enemy; rng: Rng } {
  const e: Enemy = { ...enemy }
  e.depth = Math.min(1, e.depth + params.flipperSpeed * dt)
  return { enemy: e, rng }
}
