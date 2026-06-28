// src/core/enemies/pulsar.ts
import { Pulsar } from '../state'
import { Rng, rngNext } from '../rng'
import { Tube, wrapLane } from '../geometry'
import { LevelParams, PULSE_DURATION, PULSAR_CLIMB_SPEED, PULSAR_NEAR_FAR_DEPTH } from '../rules'

// A pulsar climbs and flips like a flipper, and periodically pulses — toggling
// `pulsing` on for PULSE_DURATION (lethal to a player on its lane), then off
// for `pulseInterval`. sim.ts reads `pulsing` to resolve the kill.
export function stepPulsar(
  enemy: Pulsar, dt: number, params: LevelParams, tube: Tube, rng: Rng,
): { enemy: Pulsar; rng: Rng } {
  const e: Pulsar = { ...enemy }
  let r = rng

  // Dual far/near climb (story 6-15): flipper speed while farther than L0157
  // ($a0 ≈ depth 0.357), then the hardcoded spd_pulsar (-82.5/s) once nearer —
  // so a deep-level pulsar charges up the well then slows near the rim.
  const climbSpeed = e.depth >= PULSAR_NEAR_FAR_DEPTH ? PULSAR_CLIMB_SPEED : params.flipperSpeed
  e.depth = Math.min(1, e.depth + climbSpeed * dt)

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
