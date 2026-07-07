// src/core/enemies/fuseball.ts
import { Fuseball } from '../state'
import { type Rng, nextFloat } from '@arcade/shared/rng'
import { Tube, wrapLane } from '../geometry'
import { LevelParams, FUSEBALL_JITTER_INTERVAL, FUSEBALL_MOVE_PROB } from '../rules'

// The shorter rotational step (-1, 0, +1) from `from` toward `to` on the closed
// tube: forward when that arc is the short way around, backward otherwise, 0 when
// already on the lane. Ties (exact opposite lane) resolve forward.
function laneStepToward(tube: Tube, from: number, to: number): -1 | 0 | 1 {
  const n = tube.laneCount
  const forward = (((to - from) % n) + n) % n // 0..n-1
  if (forward === 0) return 0
  return forward <= n - forward ? 1 : -1
}

// Climb a lane center and slide between lanes TOWARD the player, gated by the
// fuzz_move probability (story 6-15: rev-3 §D l.240-250) — biased pursuit, not a
// 50/50 random walk. Each actual slide flips the authentic vulnerable bit (story
// 6-9): the fuseball is killable by a bullet only while settled on a lane
// (`vulnerable`), invulnerable while rolling the rim — so it cycles in and out of
// a killable window as it rolls. (Lethal on rim CONTACT regardless — that is a
// grab, resolved in sim.ts.)
// `rng` is a mutable cursor advanced in place; the caller owns it.
export function stepFuseball(
  enemy: Fuseball, dt: number, params: LevelParams, tube: Tube, rng: Rng, playerLane: number,
): { enemy: Fuseball } {
  const e: Fuseball = { ...enemy }

  e.depth = Math.min(1, e.depth + params.fuseballSpeed * dt)

  e.jitterTimer -= dt
  if (e.jitterTimer <= 0) {
    e.jitterTimer = FUSEBALL_JITTER_INTERVAL
    // fuzz_move gate: only slide on a passing roll; when it slides, it steps
    // toward the player's lane (never away).
    if (nextFloat(rng) < FUSEBALL_MOVE_PROB) {
      const dir = laneStepToward(tube, e.lane, playerLane)
      if (dir !== 0) {
        e.lane = wrapLane(tube, e.lane + dir)
        e.vulnerable = !e.vulnerable // rolled to a new lane ⇒ toggle the killable window
      }
    }
  }

  return { enemy: e }
}
