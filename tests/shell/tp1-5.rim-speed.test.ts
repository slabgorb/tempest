// tests/shell/tp1-5.rim-speed.test.ts
//
// RED suite for story tp1-5 — prerequisite 2 from tp1-4's review.
//
// src/shell/input.ts sizes the keyboard's escape margin against the fastest flipper
// the ROM can put on the rim. That number is DEEP_FLIPPER_RIM_FRAMES_PER_LANE = 4,
// and it is a leftover: it was measured against the old per-kind flipper stepper,
// before the CAM existed. input.ts says so itself (lines 73-79) and defers the fix
// here — "Revise it there, from TOPPER's real cadence."
//
// TOPPER's real cadence is not 4 frames a lane. It is a `VSLOOP 4` crouch, a frame
// to launch the jump, and then JUMP_ANGLE_STEPS / WTTFRA frames of "DOUBLE SPEED
// JUMP" (ALWELG.MAC:2447-2460) — with the landing frame doubling as the next
// crouch's first frame. WTTFRA is 2 through wave 32 and 3 from wave 33 (TWTTFRA,
// 704-706), so the FASTEST chaser the ROM can produce is a deep-wave one.
//
// Rather than restate that arithmetic — and risk pinning the shell to an off-by-one
// I derived by hand — this file MEASURES the chaser's cadence out of the running
// simulation and asserts that input.ts agrees with what the game actually does.
// The number in the shell has exactly one job: to be true about the core.
import { describe, it, expect } from 'vitest'
import { playingState } from '../core/helpers'
import { stepGame, makeEnemy } from '../../src/core/sim'
import { levelParams, SIM_STEP, ROM_FPS, PLAYER_RIM_DEPTH } from '../../src/core/rules'
import { tubeForLevel } from '../../src/core/geometry'
import { fastestFlipperRimSpeed, keyboardTurnRate } from '../../src/shell/input'
import { Input } from '../../src/core/input'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }
const FRAME = SIM_STEP

/** The FASTEST chaser: WTTFRA is 3 from wave 33 (TWTTFRA, ALWELG.MAC:704-706). */
const FASTEST_WAVE = 33

/**
 * Drive one flipper onto the rim and time it: how many frames pass between the lane
 * changes of the chaser it becomes? Returns the steady-state period.
 */
function measureRimFramesPerLane(level: number): number {
  const s0 = playingState(1)
  s0.level = level
  s0.tube = tubeForLevel(level)
  s0.spikes = new Array(s0.tube.laneCount).fill(0)
  s0.spawn = { nymphs: [] }
  // Wave 33 wraps onto wave 1's well (a closed 16-lane circle) and wave 1's flipper
  // program, NOJUMP — a straight climb, so it arrives on the lane it started on.
  s0.player.lane = 12
  s0.enemies = [makeEnemy('flipper', 4, 0.99, levelParams(level))]

  let s = s0
  const hops: number[] = []          // frame index of each lane change at the rim
  let prevLane = s.enemies[0].lane

  for (let f = 0; f < 70; f++) {
    s = stepGame(s, NEUTRAL, FRAME)
    const e = s.enemies[0]
    if (!e || e.depth < PLAYER_RIM_DEPTH) { prevLane = e?.lane ?? prevLane; continue }
    if (e.lane !== prevLane) {
      hops.push(f)
      prevLane = e.lane
    }
  }

  // Three hops give two intervals — enough to see that the cadence is steady rather
  // than an artefact of the first one. No chaser at all means no hops, and this is
  // where that shows up.
  expect(hops.length, 'the flipper never moved along the rim — is there a CHASER?')
    .toBeGreaterThanOrEqual(3)

  const gaps: number[] = []
  for (let i = 1; i < hops.length; i++) gaps.push(hops[i] - hops[i - 1])

  // TOPPER is a fixed loop: crouch, jump, repeat. Every lap round it takes the same
  // number of frames.
  for (const g of gaps) expect(g).toBe(gaps[0])
  return gaps[0]
}

describe('tp1-5 — the keyboard margin is re-derived against TOPPER (prerequisite 2)', () => {
  it('fastestFlipperRimSpeed() reports the cadence the chaser actually runs at', () => {
    const framesPerLane = measureRimFramesPerLane(FASTEST_WAVE)
    expect(fastestFlipperRimSpeed()).toBeCloseTo(ROM_FPS / framesPerLane, 6)
  })

  it('is no longer the pre-CAM 4 frames/lane', () => {
    // The stale constant does not merely disagree with TOPPER — it disagrees in the
    // SAFE direction, overstating the flipper so the margin sits too wide. That is
    // why it was allowed to ship, and why nothing has failed until now. It is still
    // a number that describes a stepper we deleted.
    expect(fastestFlipperRimSpeed()).not.toBeCloseTo(ROM_FPS / 4, 6)
  })

  it('the Claw still out-turns the fastest chaser — the margin survives the re-derivation', () => {
    // The whole point of the constant. Whatever TOPPER's cadence turns out to be,
    // a player holding an arrow key must be able to rotate off the chaser's lane.
    expect(keyboardTurnRate()).toBeGreaterThan(fastestFlipperRimSpeed())
  })
})
