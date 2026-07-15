// tests/core/tp1-23.warp-curwav.test.ts
//
// Story tp1-23 — finding WD-010: the warp dive's acceleration ramp is indexed by the
// ROM's CURWAV, which is 0-BASED, but stepWarp fed it GameState.level, which is the
// DISPLAYED 1-based number. Every wave's dive therefore accelerated as if it were the
// next wave.
//
// The ROM, from the audit's own citations:
//
//   MOVCUD, per frame          LDA CURWAV / ASL / ASL / CMP I,30 / IFCS / LDA I,30 /
//   (ALWELG.MAC:1064-1078)     ENDIF / CLC / ADC I,20
//                              == min(CURWAV*4, 0x30) + 0x20, applied to CURWAV ITSELF
//   INIRAT   (ALWELG.MAC:192-193)   LDA I,0 / STA CURWAV        <- seeded to ZERO
//   scoreboard (ALSCOR.MAC:296-298) LDA CURWAV / CLC / ADC I,1  <- display adds one
//
// So displayed level 1 is CURWAV 0, and its dive accelerates at 0x20. We were computing
// min(1*4, 0x30) + 0x20 = 0x24 — 12.5% hot — and saturating the ramp at displayed level
// 12 instead of 13.
//
// ── Why these tests drive the SIM and not warpAccel() ────────────────────────────────
// The defect is not IN warpAccel. warpAccel(0) has always returned the right number for
// wave 0; nobody ever passed it a 0. The defect is the ARGUMENT at the call site
// (sim.ts, `warpAccel(s.level - 1)`), so a test that calls warpAccel(0) directly and
// asserts 0x20 would pass just as happily against the unfixed code. It would assert
// nothing.
//
// Every acceleration assertion below therefore recovers the ROM's raw 8.8 byte from the
// velocity the sim ACTUALLY gains in one step of a real dive. Put `s.level` back where
// `s.level - 1` now stands and this file goes red.

import { describe, it, expect } from 'vitest'
import { playingState } from './helpers'
import { stepGame } from '../../src/core/sim'
import { tubeForLevel } from '../../src/core/geometry'
import {
  ROM_FPS,
  SIM_STEP,
  WARP_ALONG_SPAN,
  WARP_INITIAL_SPEED,
  warpAccel,
} from '../../src/core/rules'
import type { GameState } from '../../src/core/state'
import type { Input } from '../../src/core/input'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }

// What the game ran at before tp1-1's rebase, for the AC-3 "still squared" guard.
const INVENTED_60 = 60

// Clear the board at `level` and take the single step that enters the warp. No spikes,
// so no AVOID SPIKES countdown holds the Claw at the rim: the dive starts at once.
function enterWarpAt(level: number): GameState {
  const tube = tubeForLevel(level)
  const s = playingState(level)
  s.level = level
  s.tube = tube
  s.spikes = new Array(tube.laneCount).fill(0)
  s.player.lane = 4
  s.spawn = { nymphs: [] }
  s.enemies = []
  s.bullets = []

  const warping = stepGame(s, NEUTRAL, SIM_STEP)
  expect(warping.mode, 'the cleared level must enter the warp').toBe('warp')
  expect(warping.warp.warning, 'no spikes: nothing may hold the dive at the rim').toBe(0)
  expect(warping.warp.velocity, 'the dive opens at the ROM entry speed').toBeCloseTo(WARP_INITIAL_SPEED, 12)
  return warping
}

// Recover the ROM's raw 8.8 acceleration byte from one real step of a real dive:
// stepWarp does `velocity += warpAccel(wave) * dt`, so the velocity gained in one step,
// run back through the ROM_FPS² conversion, is the byte MOVCUD would have added.
// This is the whole point of the suite — it observes the ARGUMENT, through the call.
function romAccelByteAtLevel(level: number): number {
  const before = enterWarpAt(level)
  const after = stepGame(before, NEUTRAL, SIM_STEP)
  const accelPerSec2 = (after.warp.velocity - before.warp.velocity) / SIM_STEP
  return (accelPerSec2 * 256 * WARP_ALONG_SPAN) / (ROM_FPS * ROM_FPS)
}

// MOVCUD's block, as a function of the 0-based CURWAV.
const romByte = (curwav: number): number => Math.min(curwav * 4, 0x30) + 0x20

describe('WD-010: the warp ramp is indexed by CURWAV (0-based), not the displayed level', () => {
  it('accelerates the level-1 dive at 0x20 — the ROM value — and not the 1-based 0x24', () => {
    // The headline of the finding. CURWAV = 0 at displayed level 1, so MOVCUD adds
    // min(0, 0x30) + 0x20 = 0x20 = 32. The 1-based reading adds 0x24 = 36: 12.5% hot.
    expect(romAccelByteAtLevel(1)).toBeCloseTo(0x20, 9)
    expect(romAccelByteAtLevel(1), 'this is the 1-based reading — the bug').not.toBeCloseTo(0x24, 3)
  })

  it('draws every displayed level its byte from one wave BELOW it', () => {
    // The whole ramp, not just its first rung: displayed level N burns CURWAV N-1.
    for (let level = 1; level <= 16; level++) {
      expect(romAccelByteAtLevel(level), `displayed level ${level} is CURWAV ${level - 1}`)
        .toBeCloseTo(romByte(level - 1), 9)
    }
  })

  it('saturates the ramp at displayed level 13, not level 12', () => {
    // The other end of the off-by-one, and the half of WD-010 that a level-1-only test
    // would miss. The ROM caps once CURWAV >= 12 (12*4 = 0x30), i.e. DISPLAYED level 13.
    // Read 1-based, the cap lands a level early — and levels 12 and 13 become identical.
    const l12 = romAccelByteAtLevel(12)
    const l13 = romAccelByteAtLevel(13)
    const l14 = romAccelByteAtLevel(14)

    expect(l12, 'CURWAV 11: min(44, 0x30) + 0x20 = 0x4c — still climbing').toBeCloseTo(0x4c, 9)
    expect(l13, 'CURWAV 12: the ramp reaches its cap here').toBeCloseTo(0x50, 9)
    expect(l14, 'and holds').toBeCloseTo(0x50, 9)

    // Under the 1-based reading level 12 is ALREADY capped, so this is the assertion
    // that dies: the ramp must still be climbing at 12.
    expect(l12, 'level 12 must not yet be saturated').toBeLessThan(l13)
  })

  it('takes 46 ROM frames to dive at level 1 — the audit\'s own figure — not 44', () => {
    // pair-11 derives this independently of our code: "224 = 2t + 0.0625t^2 gives
    // t = 46.0 frames -> 46 * 35.16 ms = 1.62 s", at CURWAV = 0. It is a ROM number, not
    // a number tuned to make this pass. The 1-based dive lands in 44 frames (1.55 s).
    //
    // rom-clock-timing.test.ts also times this dive, but its band is 1.30-1.90 s and
    // swallows BOTH answers — it was written to catch tp1-1's 4.45x error, not this
    // one. The tight pin lives here.
    // Count the IN-WELL dive: rim to the well bottom (ILINDDY = warp.inSpace). tp1-13
    // added a crash-proof SPACE phase after the bottom, before the level advances, so
    // stopping at `mode !== 'warp'` now overcounts by WARP_SPACE_FRAMES; the 46-frame
    // figure is the 224-along traverse, which the bottom-crossing bounds exactly.
    let s = enterWarpAt(1)
    let frames = 0
    // tp1-10 (WD-018) / tp1-13 (S-014) UNIFIED: count only the DESCENT frames. After the
    // descent bottoms out the warp enters its post-descent SECOND phase — the eye fly-in
    // (mode stays 'warp' for WARP_FLYIN_FRAMES, warp.flyIn > 0), which is tp1-13's crash-
    // proof space segment — NOT part of the 46-frame dive the audit derives. Stop the
    // moment the fly-in begins (flyIn > 0, set by beginFlyIn on the bottom-crossing frame).
    while (s.mode === 'warp' && (s.warp.flyIn ?? 0) === 0 && frames < 200) {
      s = stepGame(s, NEUTRAL, SIM_STEP)
      frames++
    }

    expect(frames, 'the ROM dives in 46 frames at CURWAV 0').toBe(46)
    expect(frames * SIM_STEP).toBeCloseTo(1.62, 2)
  })
})

describe('WD-010: tp1-1\'s frame-rate rebase is left standing (AC-3)', () => {
  it('keeps ROM_FPS SQUARED inside warpAccel — the fix must not re-bake a 60', () => {
    // This story changes an ARGUMENT, never the expression. warpAccel is still the most
    // base-sensitive line in the codebase and still carries the base twice.
    expect(warpAccel(0)).toBeCloseTo((0x20 / 256) * (ROM_FPS * ROM_FPS) / WARP_ALONG_SPAN, 12)
    expect(warpAccel(0)).toBeCloseTo(256 / 567, 12) // the exact rational at wave 0

    const halfFixed = (0x20 / 256) * (ROM_FPS * INVENTED_60) / WARP_ALONG_SPAN
    expect(warpAccel(0), 'one 60 replaced, the other left standing').not.toBeCloseTo(halfFixed, 6)
  })

  it('still opens the dive at the ROM entry speed — untouched by this story', () => {
    expect(WARP_INITIAL_SPEED).toBeCloseTo((2.0 * ROM_FPS) / WARP_ALONG_SPAN, 12)
    expect(WARP_INITIAL_SPEED).toBeCloseTo(16 / 63, 12)
  })
})
