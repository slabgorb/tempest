// tests/core/rom-clock-timing.test.ts
//
// RED suite for story tp1-1 — THE REBASE, observed as WALL-CLOCK BEHAVIOUR.
// Companion to rom-clock.test.ts (which pins the constants). Audit §3.
//
// ── Why this suite is deliberately seam-agnostic ─────────────────────────────
// AC3 (FR-012) leaves ONE architectural choice open, and a test suite must not
// quietly close it:
//
//   (a) the sim's fixed timestep becomes 9/256 s — ROM-paced. Every ROM frame
//       count is then one sim step and is wall-correct for free.
//   (b) the timestep stays 1/60 s and every ROM frame count is converted through
//       ROM_FPS at its use site.
//
// A test that asserted raw dt-independence would FORBID (a): src/core counts some
// things per CALL, not per dt (flipper.ts:21, `flipProgress += 1 / flipFrames`),
// and under (a) that per-call advance is exactly right. A test that asserted a
// literal step count would forbid (b). So every test here drives the sim at its
// OWN declared step, SIM_STEP, and asserts the resulting WALL-CLOCK duration
// against the ROM. Both answers satisfy it; a half-done rebase satisfies neither.
//
// This is the suite that actually decides whether the game plays at the right
// speed. The constants can all be right while the game still runs at 60.

import { describe, it, expect } from 'vitest'
import { playingState } from './helpers'
import { stepGame, makeEnemy } from '../../src/core/sim'
import { tubeForLevel } from '../../src/core/geometry'
import {
  ROM_FPS,
  SIM_STEP,
  enemyFireHoldoffFrames,
  enemyFireHoldoffSeconds, levelParams } from '../../src/core/rules'
import { JUMP_ANGLE_STEPS } from '../../src/core/enemies/interpreter'
import type { GameState } from '../../src/core/state'
import type { Input } from '../../src/core/input'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }

// What the game runs at today, for the "is it really 2.11x?" cross-checks.
const INVENTED_60 = 60

// Drive the sim at its own canonical step and return elapsed WALL SECONDS.
// This is the whole trick: `steps * SIM_STEP` is real time under either FR-012
// answer, so nothing below cares which one Dev picked.
function runUntil(
  s: GameState, done: (s: GameState) => boolean, maxSeconds = 30,
): { state: GameState; seconds: number } {
  let steps = 0
  const limit = Math.ceil(maxSeconds / SIM_STEP)
  while (!done(s) && steps < limit) {
    s = stepGame(s, NEUTRAL, SIM_STEP)
    steps++
  }
  expect(steps, 'the sim never reached the terminating condition — bounded run blew its limit').toBeLessThan(limit)
  return { state: s, seconds: steps * SIM_STEP }
}

// A board frozen except for the enemy under test: nothing spawns, nothing clears,
// the Claw is parked off the action.
function isolated(seed: number, level = 1): GameState {
  const s = playingState(seed)
  s.level = level
  s.player.lane = 8
  s.enemies = []
  s.bullets = []
  s.spawn = { nymphs: Array.from({ length: 5 }, (_, i) => ({ lane: i, py: 30000 + 16 * i })) }
  s.spikes = new Array(s.tube.laneCount).fill(0)
  return s
}

describe('the tube traverse — a level-1 flipper takes 5.7 s, not 2.7 s', () => {
  it('climbs the whole well in 224 / (1.375 x ROM_FPS) seconds', () => {
    // The single most load-bearing consequence of the rebase. At the ROM's real
    // L1 rate (1.375 along/frame x 28.44 fps = 39.1 along/s) a flipper needs
    // 224 / 39.1 = 5.73 s to cross the well. We currently do it in 2.7 s.
    //
    // The delicious part: tests/core/sim.enemy-authentic.test.ts calls the CURRENT
    // 2.7 s "the single most load-bearing authentic constant" and cites the ROM for
    // it. It is wrong, and it has been guarding the wrong number since story 6-9.
    const expected = 224 / (1.375 * ROM_FPS) // 5.727 s
    expect(expected).toBeCloseTo(5.727, 2)

    const s = isolated(7)
    s.enemies = [makeEnemy('flipper', 0, 0, levelParams(1))] // no flips: straight up

    const { state, seconds } = runUntil(s, (x) => (x.enemies[0]?.depth ?? 0) >= 0.999, 12)

    expect(state.enemies.length, 'the flipper must survive the climb (no grab/cull)').toBe(1)
    expect(seconds).toBeGreaterThan(expected * 0.92)
    expect(seconds).toBeLessThan(expected * 1.08)
    // And it is emphatically NOT the 2.7 s we ship today.
    expect(seconds).toBeGreaterThan(4.0)
  })
})

describe('the flip cadence — the frame-counted family (AC3)', () => {
  it('a wave-2 flipper changes lane after the CAM\'s OWN frame count, on the ROM clock', () => {
    // This is the test that catches a rebase that fixed the SPEEDS but left the
    // frame-counted timers on the 60 Hz clock — the exact failure FR-012 warns about.
    //
    // It used to count `moveFrames + flipFrames` at LEVEL 1. tp1-4 refuted both halves
    // of that: `flipPatternForLevel` was invented, and a level-1 flipper never flips at
    // all (its CAM program is NOJUMP — W-006, the oracle in tp1-4.cam-behaviour). So the
    // cadence is re-seated onto the first wave that DOES flip, and onto the ROM's own
    // frame counts, which is what AC3 was always really about.
    //
    // Wave 2 is MOVJMP (CAMWAV, ALWELG.MAC:713). Its frames, straight off the program:
    //     VSLOOP 8   → 8 frames of climb, one VSMOVE per VEXIT   (ALWELG.MAC:2394-2397)
    //   + VJUMPS     → 1 frame to start the jump                 (2398-2399)
    //   + 8 × VJUMPM → 8 angle-steps, the lane settles on the 8th (W-008)
    //   = 17 ROM frames. At 28.44 fps that is 0.598 s; on the invented 60 it is 0.283 s.
    const frames = 8 + 1 + JUMP_ANGLE_STEPS
    const expected = frames / ROM_FPS
    const today = frames / INVENTED_60
    expect(expected / today).toBeCloseTo(2.109, 2) // the 2.11x, proved not assumed

    const s = isolated(3)
    s.level = 2
    const startLane = 5
    s.enemies = [makeEnemy('flipper', startLane, 0.2, levelParams(2))]

    const { state, seconds } = runUntil(s, (x) => (x.enemies[0]?.lane ?? startLane) !== startLane, 5)

    expect(state.enemies.length, 'the flipper must survive to flip').toBe(1)
    // Two sim steps of quantisation either way — the exact yield point inside the
    // jump loop is an implementation choice the ROM does not dictate to the frame.
    expect(seconds).toBeGreaterThan(expected - 2 * SIM_STEP)
    expect(seconds).toBeLessThan(expected + 2 * SIM_STEP)
    // Hard floor: it cannot still be flipping at the 60 Hz cadence.
    expect(seconds).toBeGreaterThan(today * 1.5)
  })
})

describe('the enemy refire holdoff — ROM frames converted at the real rate', () => {
  it('exposes the holdoff in SECONDS, converted through ROM_FPS not 60', () => {
    // sim.ts:223 hid the conversion inline: `enemyFireHoldoffFrames(level) / 60`.
    // AC2 requires that `/ 60` gone. Exposing the converted value as a named
    // function is the smallest change that (a) removes the literal and (b) makes
    // the conversion testable at all — inline arithmetic in the middle of the tick
    // cannot be asserted without simulating a whole firefight.
    //
    // The FRAME counts are ROM truth and do not move (see rom-clock.test.ts);
    // only their conversion to seconds does.
    for (const level of [1, 20, 21, 65]) {
      const frames = enemyFireHoldoffFrames(level)
      expect(enemyFireHoldoffSeconds(level)).toBeCloseTo(frames / ROM_FPS, 12)
      // ...and is decisively not the 60 Hz value.
      expect(enemyFireHoldoffSeconds(level)).not.toBeCloseTo(frames / INVENTED_60, 3)
    }
    // L1: 80 ROM frames = 2.8125 s of real time. We currently wait 1.333 s.
    expect(enemyFireHoldoffSeconds(1)).toBeCloseTo(2.8125, 6)
  })
})

describe('the warp dive — the squared error, felt as time (AC5, AC6)', () => {
  it('takes ~1.62 s at level 1, not the ~0.73 s we ship', () => {
    // warpAccel carries ROM_FPS SQUARED, so the dive is the most base-sensitive
    // thing in the game: 4.45x too fast today. Solving 1 = v0.t + a.t^2/2 with the
    // ROM's v0 = 16/63 and a = 256/567 gives t = 1.62 s (46 ROM frames — the figure
    // pair-11 derives). The 60 Hz values give 0.73 s.
    //
    // NOTE (story tp1-23): this said 1.55 s, because `a` was read as 32/63 — the
    // acceleration for CURWAV 1. Level 1 is CURWAV *0* (WD-010), so the real level-1
    // accel is 256/567 and the real dive is 1.62 s. The band below is wide enough to
    // have swallowed both answers, which is exactly why WD-010 survived this suite;
    // the tight pin now lives in tp1-23.warp-curwav.test.ts. The band is deliberately
    // left alone: it guards tp1-1's 4.45x rebase, not the wave index.
    //
    // This is also the AC6 playability check: the dive is the one place a 2x speed
    // error is instantly, physically obvious to a player.
    const tube = tubeForLevel(1)
    const s = playingState(1)
    s.level = 1
    s.tube = tube
    s.spikes = new Array(tube.laneCount).fill(0) // no spikes: no AVOID SPIKES countdown
    s.player.lane = 4
    s.spawn = { nymphs: [] }
    s.enemies = []
    s.bullets = []

    // One neutral step runs the real level-clear -> warp entry path.
    const warping = stepGame(s, NEUTRAL, SIM_STEP)
    expect(warping.mode, 'the cleared level must enter the warp').toBe('warp')
    expect(warping.warp.progress).toBe(0)

    // tp1-10 (WD-018) / tp1-13 (S-014) UNIFIED: the warp has a post-descent SECOND
    // phase — the eye fly-in (mode stays 'warp' for WARP_FLYIN_FRAMES after the descent
    // bottoms out, warp.flyIn > 0), which is tp1-13's crash-proof space segment. This
    // times the DESCENT — the squared-error subject, the 224-along in-well traverse the
    // 1.62 s figure derives from — so it stops the moment the fly-in begins (flyIn > 0,
    // set by beginFlyIn on the bottom-crossing frame), not when the whole warp mode ends.
    const { seconds } = runUntil(warping, (x) => x.mode !== 'warp' || (x.warp.flyIn ?? 0) > 0, 10)

    expect(seconds).toBeGreaterThan(1.30)
    expect(seconds).toBeLessThan(1.90)
    // The 60 Hz dive is 0.73 s. Nothing in that band can be mistaken for this one.
    expect(seconds).toBeGreaterThan(1.0)
  })
})

describe('dt-independence — what the rebase must NOT break (rule guard)', () => {
  it('keeps the CONTINUOUS sim dt-driven: same wall time, different step, same result', () => {
    // CLAUDE.md's hard boundary: all time enters core as dt. The climb integrator
    // (flipper.ts:16, `depth += flipperSpeed * dt`) is genuinely dt-driven and must
    // STAY that way. If Dev takes FR-012 answer (a) and "simplifies" the continuous
    // integrators into per-step counters, this catches it.
    //
    // NOTE (deliberate, see Design Deviations): this asserts dt-independence ONLY
    // for the continuous integrators, NOT for the per-call flip animation, because
    // FR-012 answer (a) legitimately makes the flip animation step-counted. Pinning
    // that here would forbid an answer the AC explicitly permits.
    // Both runs must cover EXACTLY the same wall time, so the step counts are derived
    // from a common N rather than from Math.round(wall / dt). (Originally this rounded
    // 1.0 s into each step size — but 1.0 is not an integer multiple of 9/256, so the
    // two runs silently covered 0.984 s and 1.002 s and compared different journeys.
    // At the old 1/60 step both divided exactly, which is why the flaw was invisible.)
    const N = 28
    const climbOver = (dt: number, steps: number): number => {
      let s = isolated(11)
      s.enemies = [makeEnemy('flipper', 0, 0, levelParams(1))]
      for (let t = 0; t < steps; t++) s = stepGame(s, NEUTRAL, dt)
      return s.enemies[0].depth
    }

    const coarse = climbOver(SIM_STEP, N)          // N * SIM_STEP seconds
    const fine = climbOver(SIM_STEP / 4, N * 4)    // ...the same, in quarter steps

    expect(coarse).toBeGreaterThan(0) // non-vacuous: it actually climbed
    expect(fine).toBeCloseTo(coarse, 6)
  })
})
