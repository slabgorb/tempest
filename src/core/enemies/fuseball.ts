// src/core/enemies/fuseball.ts
import { Fuseball } from '../state'
import { Rng, rngNext } from '../rng'
import { Tube, wrapLane } from '../geometry'
import { LevelParams, FUSEBALL_JITTER_INTERVAL } from '../rules'

// Climb a lane center and roll erratically between adjacent lanes on a timer.
// Each roll flips the authentic vulnerable bit (story 6-9): the fuseball is
// killable by a bullet only while settled on a lane (`vulnerable`), invulnerable
// while rolling the rim — so it cycles in and out of a killable window as it
// rolls. (Lethal on rim CONTACT regardless — that is a grab, resolved in sim.ts.)
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
    e.vulnerable = !e.vulnerable // roll to a new lane ⇒ toggle the killable window
  }

  return { enemy: e, rng: r }
}
