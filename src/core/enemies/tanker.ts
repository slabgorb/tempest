// src/core/enemies/tanker.ts
import { Tanker, Enemy } from '../state'
import { Tube, wrapLane } from '../geometry'
import { LevelParams, SPLIT_CHILD_DEPTH } from '../rules'
import { makeEnemy } from '../sim'

export function stepTanker(
  enemy: Tanker, dt: number, params: LevelParams,
): { enemy: Tanker } {
  const e: Tanker = { ...enemy }
  e.depth = Math.min(1, e.depth + params.tankerSpeed * dt)
  return { enemy: e }
}

// Two cargo enemies on adjacent lanes at the tanker's depth (capped just below
// the rim so a rim-split is not an instant grab).
export function splitTanker(t: Tanker, tube: Tube, params: LevelParams): Enemy[] {
  const depth = Math.min(t.depth, SPLIT_CHILD_DEPTH)
  return [
    makeEnemy(t.contains, t.lane, depth, params),
    makeEnemy(t.contains, wrapLane(tube, t.lane + 1), depth, params),
  ]
}
