// tests/core/tp1-10.warp-flyin.test.ts
//
// RED — tp1-10 AC-2 (finding WD-018, NO_COUNTERPART): after the dive out of the
// old well, the ROM flies the eye INTO the new well over many frames; we swap the
// geometry instantly.
//
// ROM: reaching the bottom sets QSTATE = CENDWAV, which runs ENDWAV (wave
// increment + bonus) and THEN NEWAV2 (ALWELG.MAC:56-121), which each frame walks
// the eye toward the new well — "LDA EYL ;MOVE EYE CLOSER TO WELL / CLC / ADC I,18"
// (:85-88, 0x18 = 24 units/frame) — and only hands control back with "LDA I,CPLAY"
// (:109) once the eye reaches EYLDES. Crucially the wave (CURWAV) is already
// incremented BEFORE the fly-in runs, so throughout the fly-in the NEW wave is
// loaded but the player is not yet playing.
//
// Today stepWarp calls advanceLevel(s) the frame progress crosses 1 (sim.ts:825-830)
// and advanceLevel sets mode = 'playing' the SAME frame (sim.ts:762) — so there is
// never a frame where the new geometry is loaded but play has not resumed. RED.
//
// NOTE: the EXACT fly-in frame count (EYL start → EYLDES at +0x18/frame) is not
// pinned here — see Delivery Findings. This pins that a multi-frame fly-in EXISTS.
import { describe, it, expect } from 'vitest'
import { playingState } from './helpers'
import type { GameState } from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import type { Input } from '../../src/core/input'
import type { Tube } from '../../src/core/geometry'

// tp1-37 (WD-018): the fly-in length is the ROM's per-well ceil((1536 - H)/24) — the
// eye flies EYH:EYL from 0xFA00 (-1536) to -H at +0x18/frame (NEWAV2, ALWELG.MAC:56-121).
// H is recovered from the destination well's farRatio, as in tp1-33. (This retires the
// old flat WARP_FLYIN_FRAMES=10, an invented ceil(224/24); see tp1-37.warp-flyin-eye.test.ts.)
function expectedFlyInFrames(tube: Tube): number {
  const r = tube.farRatio
  const H = Math.round((240 * r - 16) / (1 - r))
  return Math.ceil((1536 - H) / 24)
}

const DT = 1 / 60
const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }

// Enter a CLEAN warp at level 1 (no spikes anywhere → no warning, no crash) so the
// dive runs to completion and hands off to the next wave.
function enterCleanWarp(): GameState {
  const s = playingState(1)
  s.spawn = { nymphs: [] }
  s.enemies = []
  s.bullets = []
  s.spikes = new Array(s.tube.laneCount).fill(0)
  const out = stepGame(s, NEUTRAL, DT) // empty level → enters warp
  expect(out.mode).toBe('warp')
  return out
}

describe('tp1-10 AC-2 — the eye flies INTO the new well (WD-018)', () => {
  it('does not resume play the same frame the new geometry loads — a fly-in phase exists', () => {
    let s = enterCleanWarp()
    let sawNewWellNotYetPlaying = false
    for (let i = 0; i < 1000 && s.mode !== 'playing'; i++) {
      s = stepGame(s, NEUTRAL, DT)
      // ENDWAV increments the wave, THEN NEWAV2 flies the eye in: there must be at
      // least one frame carrying the NEXT wave's geometry while play is still held.
      if (s.level === 2 && s.mode !== 'playing') sawNewWellNotYetPlaying = true
    }
    expect(sawNewWellNotYetPlaying).toBe(true)
  })

  it('the transition still converges to normal play on the new wave', () => {
    let s = enterCleanWarp()
    let i = 0
    for (; i < 1000 && s.mode !== 'playing'; i++) s = stepGame(s, NEUTRAL, DT)
    expect(s.mode).toBe('playing') // it actually finishes the fly-in
    expect(s.level).toBe(2) // on the next wave
    expect(i).toBeLessThan(1000) // bounded — did not hang
  })

  it('the fly-in takes more than a single frame after the descent bottoms out', () => {
    // Total warp→playing must span more frames than a pure instant swap: count the
    // frames the sim is NOT in 'playing' from warp entry to resumed play.
    let s = enterCleanWarp()
    let heldFrames = 0
    for (let i = 0; i < 1000 && s.mode !== 'playing'; i++) {
      s = stepGame(s, NEUTRAL, DT)
      if (s.level === 2 && s.mode !== 'playing') heldFrames++
    }
    expect(heldFrames).toBeGreaterThanOrEqual(1) // at least one dedicated fly-in frame
  })

  it('the fly-in lasts the ROM per-well count ceil((1536 - H)/24) — ~63 frames, not 10 (tp1-37)', () => {
    // tp1-37 (WD-018): the eye flies the full EYH:EYL span (0xFA00 → -H) at +0x18/frame,
    // so the hold is per-well ceil((1536 - H)/24) ≈ 63, NOT the retired flat 10. Pin the
    // observed held-frame count against the destination well's own H so an accidental
    // desync is caught, and guard that the ~6× longer ROM beat is in force (heldFrames ≥ 60).
    let s = enterCleanWarp()
    let heldFrames = 0
    let destTube = s.tube
    for (let i = 0; i < 4000 && s.mode !== 'playing'; i++) {
      s = stepGame(s, NEUTRAL, DT)
      if (s.level === 2 && s.mode !== 'playing') {
        heldFrames++
        destTube = s.tube
      }
    }
    expect(heldFrames).toBe(expectedFlyInFrames(destTube))
    expect(heldFrames).toBeGreaterThanOrEqual(60)
  })
})
