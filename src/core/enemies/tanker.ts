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

// Two cargo enemies straddling the tanker on the FLANKING lanes seg-1 and seg+1
// (authentic rev-3, story 6-9) — the tanker's own lane is left empty. Depth is
// capped just below the rim so a rim-split is not an instant grab.
export function splitTanker(t: Tanker, tube: Tube, params: LevelParams): Enemy[] {
  const depth = Math.min(t.depth, SPLIT_CHILD_DEPTH)
  return [
    makeEnemy(t.contains, wrapLane(tube, t.lane - 1), depth, params),
    makeEnemy(t.contains, wrapLane(tube, t.lane + 1), depth, params),
  ]
}
