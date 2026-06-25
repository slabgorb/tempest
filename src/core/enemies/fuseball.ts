// src/core/enemies/fuseball.ts
import { Fuseball } from '../state'
import { Rng, rngNext } from '../rng'
import { Tube, wrapLane } from '../geometry'
import { LevelParams, FUSEBALL_JITTER_INTERVAL } from '../rules'

// Simplified first cut: climb a lane center and hop erratically between
// adjacent lanes on a timer. Always vulnerable; lethal on rim contact.
export function stepFuseball(
  enemy: Fuseball, dt: number, params: LevelParams, tube: Tube, rng: Rng,
): { enemy: Fuseball; rng: Rng } {
  const e: Fuseball = { ...enemy }
  let r = rng

  e.depth = Math.min(1, e.depth + params.fuseballSpeed * dt)

  e.jitterTimer -= dt
  if (e.jitterTimer <= 0) {
    const roll = rngNext(r)
    r = roll.rng
    const dir = roll.value < 0.5 ? -1 : 1
    e.lane = wrapLane(tube, e.lane + dir)
    e.jitterTimer = FUSEBALL_JITTER_INTERVAL
  }

  return { enemy: e, rng: r }
}
