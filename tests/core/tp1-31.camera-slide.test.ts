// tests/core/tp1-31.camera-slide.test.ts
//
// Story tp1-31 (DB-008, deferred from tp1-9) — behaviour half — the per-well screen-Z translation's
// LEVEL-START SLIDE, ported from INIWLS + the ALWELG frame driver:
//
//   INIWLS (ALDISP.MAC:2484-2505): on a NEW LIFE (QNXTST == CNWLF2) ZADJL snaps
//   to HOLZAD/HOLZDH ("AT CENTER IMMEDIATELY"); on a NEW WAVE it takes the
//   16-bit delta (target - current) >> 3 into ZADEST ("MOVE UP SLOWLY") — a
//   FIXED per-frame step, an eighth of the initial gap, applied every frame by
//   ALWELG.MAC:75-84 ("UPDATE Z CENTER"), so the well slides into place over
//   ~8 ROM frames at the start of each wave.
//
// Contract pinned here (state seam: s.camera.screenZ, canvas-y ring units like
// tube.screenZ):
//   • game start snaps to the level-1 target (no slide from nowhere)
//   • wave advance EASES: monotone, no overshoot, arrives in ~8 ROM frames
//   • tp1-32 update: the arrival TARGETS derive from the audited tube.screenZ, not
//     raw ROM bytes — the magnitude is now a viewport-safe tune (tp1-32), and this
//     suite owns the EASE, not the magnitude (guarded by tp1-32 + tp1-31.screen-z).
//
// Deliberately NOT pinned (logged as deviations): the ROM's 16-bit fractional
// accumulator (a float port lands within these tolerances), and the mid-slide
// death→respawn snap (our respawn does not re-run well init; flagged for
// tp1-10 / the Reviewer).
import { describe, it, expect } from 'vitest'
import { playingState } from './helpers'
import type { GameState } from '../../src/core/state'
import { initialState } from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { Input } from '../../src/core/input'
import { tubeForLevel } from '../../src/core/geometry'
import { ROM_FPS } from '../../src/core/rules'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }
const FRAME = 1 / ROM_FPS

// tp1-32 RESCOPED the source of these targets. The per-well screenZ MAGNITUDE was
// over-scaled and clipped the well off-screen (tp1-32.framing-viewport.test.ts),
// so it is now a viewport-safe TUNE. This suite pins the SLIDE DYNAMICS (the
// ZADEST 1/8-per-frame ease), which are independent of the magnitude — so the
// start/target derive from the audited `tube.screenZ` rather than the old raw-byte
// literals. The magnitude itself is guarded by tp1-32 + the sign checks in
// tp1-31.screen-z.test.ts, not here. Directions are unchanged: level 1→2 slides
// UP-magnitude (both +), level 7→8 crosses zero (+ → −).
const SCREEN_Z = {
  level1: tubeForLevel(1).screenZ,
  level2: tubeForLevel(2).screenZ,
  level7: tubeForLevel(7).screenZ,
  level8: tubeForLevel(8).screenZ,
}

// A freshly-cleared state at `level` — same staging as sim.advance-level.test.ts.
function clearedAtLevel(level: number): GameState {
  const tube = tubeForLevel(level)
  const s = playingState(1)
  s.level = level
  s.tube = tube
  // Stage the PARKED camera a mid-level board has (playingState is a level-1
  // state; direct level mutation must carry the camera with it). Staging only —
  // the SCREEN_Z literals below pin the actual values independently, so a wrong
  // tube.screenZ still fails the trace assertions.
  s.camera = { screenZ: tube.screenZ, slidePerFrame: 0 }
  s.spikes = new Array(tube.laneCount).fill(0)
  s.player.lane = 0
  s.spawn = { nymphs: [] }
  s.enemies = []
  return s
}

// Clear → warp → arrive: returns the FIRST 'playing' state of level+1.
function transition(fromLevel: number): GameState {
  let s = stepGame(clearedAtLevel(fromLevel), NEUTRAL, FRAME)
  for (let i = 0; i < 2000 && s.mode === 'warp'; i++) s = stepGame(s, NEUTRAL, FRAME)
  expect(s.mode).toBe('playing')
  return s
}

// Sample camera.screenZ over `n` ROM frames of play, starting from (and
// including) the given state.
function sampleSlide(s0: GameState, n: number): number[] {
  const out: number[] = [s0.camera?.screenZ as number]
  let s = s0
  for (let i = 0; i < n; i++) {
    s = stepGame(s, NEUTRAL, FRAME)
    out.push(s.camera?.screenZ as number)
  }
  return out
}

describe('AC-3 — game start SNAPS the screen-Z to the level-1 target', () => {
  it('initialState places the camera at the level-1 translation immediately', () => {
    const s = initialState(42)
    expect(s.camera?.screenZ).toBeCloseTo(SCREEN_Z.level1, 9)
  })

  it('the snap survives the first frames without drifting (nothing to slide toward)', () => {
    let s = playingState(7)
    for (let i = 0; i < 5; i++) {
      s = stepGame(s, NEUTRAL, FRAME)
      expect(s.camera?.screenZ, `frame ${i + 1}`).toBeCloseTo(SCREEN_Z.level1, 9)
    }
  })
})

describe('AC-3 — wave advance EASES the screen-Z toward the new well over ~8 ROM frames', () => {
  it('level 1 → 2: slides from +192·S to +224·S — monotone, no snap, no overshoot', () => {
    const arrived = transition(1)
    expect(arrived.level).toBe(2)
    const trace = sampleSlide(arrived, 12)
    const start = SCREEN_Z.level1
    const target = SCREEN_Z.level2
    const delta = target - start

    // Every sample is a real number (guards a vacuous undefined-trace pass).
    expect(trace.every((v) => Number.isFinite(v))).toBe(true)

    // No SNAP: the first playing frame is still near the OLD well's value
    // (at most ~2 frames of the 8-frame slide may already have elapsed inside
    // the transition frame itself).
    expect(trace[0]).toBeGreaterThanOrEqual(start - 1e-9)
    expect(trace[0]).toBeLessThanOrEqual(start + 0.35 * delta)

    // Still travelling two frames in — an 8-frame slide cannot have arrived.
    expect(trace[2]).toBeLessThan(target - 1e-6)

    // Monotone toward the target, never past it.
    for (let i = 1; i < trace.length; i++) {
      expect(trace[i], `frame ${i} monotone`).toBeGreaterThanOrEqual(trace[i - 1] - 1e-9)
      expect(trace[i], `frame ${i} overshoot`).toBeLessThanOrEqual(target + 1e-9)
    }

    // Arrived by 10 frames after the swap, and stays put.
    expect(trace[10]).toBeCloseTo(target, 6)
    expect(trace[11]).toBeCloseTo(target, 6)
    expect(trace[12]).toBeCloseTo(target, 6)
  })

  it('level 7 → 8: the slide also runs DOWNWARD across a sign change (+144·S → -96·S)', () => {
    const arrived = transition(7)
    expect(arrived.level).toBe(8)
    const trace = sampleSlide(arrived, 12)
    const start = SCREEN_Z.level7
    const target = SCREEN_Z.level8
    const delta = target - start // negative

    expect(trace.every((v) => Number.isFinite(v))).toBe(true)
    expect(trace[0]).toBeLessThanOrEqual(start + 1e-9)
    expect(trace[0]).toBeGreaterThanOrEqual(start + 0.35 * delta)
    expect(trace[2]).toBeGreaterThan(target + 1e-6)
    for (let i = 1; i < trace.length; i++) {
      expect(trace[i], `frame ${i} monotone`).toBeLessThanOrEqual(trace[i - 1] + 1e-9)
      expect(trace[i], `frame ${i} overshoot`).toBeGreaterThanOrEqual(target - 1e-9)
    }
    expect(trace[10]).toBeCloseTo(target, 6)
    expect(trace[12]).toBeCloseTo(target, 6)
  })

  it('the slide is deterministic — identical transitions produce identical traces', () => {
    const a = sampleSlide(transition(1), 10)
    const b = sampleSlide(transition(1), 10)
    expect(a.every((v) => Number.isFinite(v))).toBe(true) // not vacuously equal
    expect(a).toEqual(b)
  })
})
