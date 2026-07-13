// tests/shell/starfield-sim-clock.test.ts
//
// RED suite for story tp1-1 / FR-017 (AC4) — the starfield must be driven by the
// SIM, not by requestAnimationFrame. Audit §3.
//
// ── The bug ──────────────────────────────────────────────────────────────────
// render.ts:144 calls `starfield.step()` once per RENDERED frame, and step() takes
// no dt at all — it just decrements every plane's Z by STAR_STEP. So the warp
// starfield's speed is a function of the player's MONITOR, not of the game:
//
//     60 Hz display   ->  7 * 60  = 420 Z/s   (2.11x too fast)
//    144 Hz display   ->  7 * 144 = 1008 Z/s  (5.1x too fast)
//    a slow frame     ->  the stars simply stall
//
// This is the only finding in cluster C1 that is not merely wrong but NON-
// DETERMINISTIC: the same dive looks different on different hardware.
//
// ── What is NOT wrong ────────────────────────────────────────────────────────
// STAR_STEP = 7 is ROM truth: 7 Z-units per ROM FRAME. It must NOT be rebased.
// What must change is what "a frame" means. At the real clock, 7 Z per ROM frame
// x 28.44 ROM frames per second = 199.1 Z/s, and that number must hold no matter
// how often, or how irregularly, the shell happens to call step().

import { describe, it, expect } from 'vitest'
import {
  createStarfield,
  STAR_STEP,
  STAR_SPAWN_Z,
  STAR_RETIRE_Z,
} from '../../src/shell/starfield'
import { ROM_FPS, SIM_STEP } from '../../src/core/rules'

// The ROM's true starfield velocity, derived — never typed in as a decimal.
const Z_PER_SECOND = STAR_STEP * ROM_FPS // 199.111 Z/s
const INVENTED_60 = 60

// Spawn the first plane and hand back the field with that plane at STAR_SPAWN_Z.
// (createStarfield's step order is move -> retire -> spawn, so the very first call
// on an empty field only spawns: nothing has moved yet.)
function fieldWithOnePlane(): ReturnType<typeof createStarfield> {
  const sf = createStarfield()
  sf.step(SIM_STEP)
  expect(sf.planes.length, 'the first step must spawn exactly one plane').toBe(1)
  expect(sf.planes[0].z).toBe(STAR_SPAWN_Z)
  return sf
}

// Advance `seconds` of wall time in `steps` equal chunks, return the oldest plane's Z.
function advance(seconds: number, steps: number): number {
  const sf = fieldWithOnePlane()
  const dt = seconds / steps
  for (let i = 0; i < steps; i++) sf.step(dt)
  const oldest = sf.planes[0]
  expect(oldest, 'the tracked plane must survive the run').toBeDefined()
  return oldest.z
}

describe('the starfield runs on the sim clock, not the display (AC4, FR-017)', () => {
  it('takes dt — it can no longer be driven by "however often we happened to draw"', () => {
    // step() currently has arity 0. The whole defect is that it cannot be told how
    // much time has passed.
    const sf = createStarfield()
    expect(sf.step.length, 'step(dt) must accept a timestep').toBeGreaterThanOrEqual(1)
  })

  it('advances a plane at STAR_STEP x ROM_FPS Z-units per second', () => {
    const seconds = 0.5
    const z = advance(seconds, Math.round(seconds / SIM_STEP))

    const expected = STAR_SPAWN_Z - Z_PER_SECOND * seconds // 240 - 99.6 = 140.4
    expect(z).toBeCloseTo(expected, 0)

    // Decisively not the 60 Hz rate we ship today (which would land on 240 - 210 = 30).
    const at60 = STAR_SPAWN_Z - STAR_STEP * INVENTED_60 * seconds
    expect(z).not.toBeCloseTo(at60, 0)
    expect(z).toBeGreaterThan(STAR_RETIRE_Z) // non-vacuous: it did not simply retire
  })

  it('is FRAME-RATE INDEPENDENT — the same half-second on a 60 Hz and a 144 Hz display', () => {
    // The heart of FR-017. Today these three differ by more than 2x, because the
    // plane moves per CALL. After the fix they must be indistinguishable: the same
    // elapsed time is the same dive, whatever the monitor does.
    const seconds = 0.5
    const at60Hz = advance(seconds, Math.round(seconds * 60))
    const at144Hz = advance(seconds, Math.round(seconds * 144))
    const atSimStep = advance(seconds, Math.round(seconds / SIM_STEP))

    expect(at60Hz).toBeCloseTo(at144Hz, 4)
    expect(at60Hz).toBeCloseTo(atSimStep, 4)

    // Non-vacuous: the plane genuinely moved, so "all equal" is not "all frozen".
    expect(at60Hz).toBeLessThan(STAR_SPAWN_Z - 50)
  })

  it('survives an irregular, stuttering frame budget without changing the dive', () => {
    // A dropped frame must slow nothing down; a burst of fast frames must speed
    // nothing up. Same total wall time, wildly uneven chunks.
    const smooth = advance(0.4, 16)

    const sf = fieldWithOnePlane()
    for (const dt of [0.05, 0.001, 0.12, 0.004, 0.08, 0.015, 0.09, 0.04]) sf.step(dt)
    const stuttered = sf.planes[0].z

    const total = 0.05 + 0.001 + 0.12 + 0.004 + 0.08 + 0.015 + 0.09 + 0.04
    expect(total).toBeCloseTo(0.4, 6) // the two runs really are the same wall time
    expect(stuttered).toBeCloseTo(smooth, 4)
  })

  it('leaves STAR_STEP alone — 7 Z per ROM FRAME is ROM truth, the DRIVER was the bug', () => {
    // Guard against the tempting wrong fix: rescaling STAR_STEP to 7 * (ROM_FPS/60)
    // to make it "look right" at 60 Hz, which would leave it just as broken at 144.
    expect(STAR_STEP).toBe(7)
  })
})
