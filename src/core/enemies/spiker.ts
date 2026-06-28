import { Spiker } from '../state'
import { LevelParams, SPIKER_TURNAROUND_DEPTH } from '../rules'

// A spiker oscillates along its lane (climbing, then descending), laying a
// spike up to its high-water mark. Spike laying itself happens in sim.ts. It
// climbs toward the rim until the ROM $20 turnaround (≈0.929 depth) and reverses
// (move away); the far-end bottom-out (hop / convert) is resolved in sim.ts.
export function stepSpiker(
  enemy: Spiker, dt: number, params: LevelParams,
): { enemy: Spiker } {
  const e: Spiker = { ...enemy }
  e.depth += e.direction * params.spikerSpeed * dt
  if (e.depth >= SPIKER_TURNAROUND_DEPTH) {
    e.depth = SPIKER_TURNAROUND_DEPTH
    e.direction = -1
  } else if (e.depth <= 0) {
    e.depth = 0
    e.direction = 1
  }
  return { enemy: e }
}
