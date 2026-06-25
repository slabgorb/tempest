// src/core/enemies/tanker.ts
import { Tanker, Enemy } from '../state'
import { Tube, wrapLane } from '../geometry'
import { LevelParams } from '../rules'
import { makeEnemy } from '../sim'

// Children appear just below grab depth (PLAYER_RIM_DEPTH = 0.92) so a tanker
// that splits AT the rim does not instantly grab the player on the same frame.
const SPLIT_CHILD_DEPTH = 0.85

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
