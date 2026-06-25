// src/core/enemies/pulsar.ts
import { Pulsar } from '../state'
import { Rng, rngNext } from '../rng'
import { Tube, wrapLane } from '../geometry'
import { LevelParams, PULSE_DURATION } from '../rules'

// A pulsar climbs and flips like a flipper, and periodically pulses — toggling
// `pulsing` on for PULSE_DURATION (lethal to a player on its lane), then off
// for `pulseInterval`. sim.ts reads `pulsing` to resolve the kill.
export function stepPulsar(
  enemy: Pulsar, dt: number, params: LevelParams, tube: Tube, rng: Rng,
): { enemy: Pulsar; rng: Rng } {
  const e: Pulsar = { ...enemy }
  let r = rng

  // Climb at flipper speed.
  e.depth = Math.min(1, e.depth + params.flipperSpeed * dt)

  // Pulse cycle.
  e.pulseTimer -= dt
  if (e.pulseTimer <= 0) {
    e.pulsing = !e.pulsing
    e.pulseTimer = e.pulsing ? PULSE_DURATION : params.pulseInterval
  }

  // Flip across a lane boundary.
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
