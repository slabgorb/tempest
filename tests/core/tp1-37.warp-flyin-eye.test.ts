// tests/core/tp1-37.warp-flyin-eye.test.ts
//
// RED — tp1-37 (finding WD-018): THE MOVING EYE, part 2 — the fly-in.
//
// tp1-10 shipped a COUNTDOWN PLACEHOLDER for the post-descent fly-in: beginFlyIn
// sets WarpState.flyIn = WARP_FLYIN_FRAMES (an INVENTED ceil(224/24) = 10) and
// stepWarp just decrements it and teleports to 'playing' — no eye, no motion, the
// new well drawn STATIC for the whole hold (src/core/sim.ts:890-905, the block
// flagged "shipped countdown placeholder" at geometry.ts:314-316). This story
// replaces it with the ROM's real eye fly-in.
//
// THE ROM (byte-verified against Theurer's 1981 source ~/Projects/tempest-source-text):
//
//   Reaching the well bottom runs ENDWAV (ALEXEC.MAC:361-382): INC CURWAV, pay the
//   bonus, then `JMP INEWAV`. INEWAV (ALWELG.MAC:24-36) initialises the NEW well
//   (INIOBJ -> INIDSP -> INIWLS, which sets the destination) and then parks the eye
//   FAR back for the fly-in:
//       LDA I,0FA / STA EYH   (ALWELG.MAC:29-30)
//       LDA I,0   / STA EYL   (ALWELG.MAC:31-33)   -> EYH:EYL = 0xFA00 = -1536
//
//   INIWLS (ALDISP.MAC:2464-2475) sets the per-well DESTINATION as the two's-complement
//   of that well's eye-Y, into the SCALAR EYLDES (ALCOMN.MAC:532, `.BLKB 1` — a single
//   byte, NOT a table; the story title's "per-well EYLDES" means its VALUE is per-well):
//       LDA Y,HOLEYL / EOR I,0FF / CLC / ADC I,1   -> A = -HOLEYL[wellID]  (= -H)
//       STA EYL / STA EYLDES                        -> destination = -H
//
//   Then NEWAV2 (ALWELG.MAC:56-121) walks the eye in, ONE frame at a time:
//       LDA EYL / CLC / ADC I,18 / STA EYL   (ALWELG.MAC:85-88)  -> EYL += 0x18 (24)
//       LDA EYH / ADC I,0        / STA EYH   (ALWELG.MAC:89-91)  -> 16-bit carry
//       ... SBC EYLDES ... IFEQ  (ALWELG.MAC:97-104)             -> reached EYLDES?
//       LDA EYLDES / STA EYL / LDA I,0FF / STA EYH               -> YES: clamp AT dest
//       LDA I,CPLAY / STA QSTATE   (ALWELG.MAC:105-109)          -> and GO PLAY.
//
// So the eye flies from -1536 to -H at +24/frame and CLAMPS at -H, which takes
//   ceil((1536 - H) / 24)  frames  (H = ROM_EYE_Y[wellID]).
// For H in 10..28 that is 63-64 frames (~2.2s at 28.44 fps) — NOT 10. The old
// WARP_FLYIN_FRAMES=10 is an invented constant (it flew "224 units back at 24/frame",
// but the ROM flies the 1536-unit EYH:EYL span, resetting to 0xFA00 first). See the
// tp1-33 archive Delivery Findings + this story's TEA deviation log.
//
// CONTRACT handed to Dev (Julia):
//  - Add a LIVE eye field `WarpState.eyeY` (ROM units, signed). beginFlyIn seeds it at
//    EYE_FLYIN_START (-1536). Each fly-in frame it advances by EYE_FLYIN_STEP (+24) and
//    clamps at the per-well destination `-H` (H recoverable from the new tube's farRatio,
//    exactly as tp1-33 recovers it). The fly-in ends -> 'playing' when the eye reaches -H.
//  - The fly-in length is therefore per-well ceil((1536-H)/24), replacing WARP_FLYIN_FRAMES=10.
//  - Keep `flyIn` as the phase gate (>0 = flying in) so the fire/gate suite still reads it.
//  - The shell drives warpDiveTube(newTube, f(eyeY)) so the new well animates in (render is
//    eyeballed per CLAUDE.md, like tp1-33's dive) — the CORE pins the eye, the SHELL the pixels.
import { describe, it, expect } from 'vitest'
import { playingState } from './helpers'
import type { GameState, WarpState } from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { tubeForLevel } from '../../src/core/geometry'
import type { Tube } from '../../src/core/geometry'
import type { Input } from '../../src/core/input'
// These are the constants Dev must add (rules.ts). Missing pre-GREEN -> undefined -> RED.
import { EYE_FLYIN_START, EYE_FLYIN_STEP } from '../../src/core/rules'

const DT = 1 / 60
const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }

// ROM literals, byte-verified above (hard-coded so the observable tests fail on the
// count, not on a missing import): eye start 0xFA00, step 0x18, dest = -ROM_EYE_Y.
const ROM_EYE_START = -1536 // 0xFA00 as signed 16-bit (INEWAV, ALWELG.MAC:29-33)
const ROM_EYE_STEP = 24 //     0x18 per frame            (NEWAV2, ALWELG.MAC:87)

// The eye field Dev is adding; read defensively so this suite compiles before it exists.
function eyeOf(s: GameState): number | undefined {
  return (s.warp as WarpState & { eyeY?: number }).eyeY
}

// tp1-33's recovery: farRatio = (16+H)/(240+H)  =>  H = (240·r - 16)/(1 - r).
function recoverH(tube: Tube): number {
  const r = tube.farRatio
  return Math.round((240 * r - 16) / (1 - r))
}

// The ROM's NEWAV2 iteration count for a given destination well.
function expectedAdvances(tube: Tube): number {
  return Math.ceil((1536 - recoverH(tube)) / ROM_EYE_STEP)
}

// Enter a CLEAN warp at `level` (no spikes → no warning, no crash) so the dive runs to
// the bottom and hands off to the fly-in on the NEXT well (level+1).
function enterCleanWarp(level: number, seed = 1): GameState {
  const s = playingState(seed)
  s.level = level
  s.tube = tubeForLevel(level)
  s.player.lane = 0
  s.spawn = { nymphs: [] }
  s.enemies = []
  s.bullets = []
  s.spikes = new Array(s.tube.laneCount).fill(0)
  const out = stepGame(s, NEUTRAL, DT) // empty level → enters warp
  expect(out.mode).toBe('warp')
  return out
}

interface FlyInTrace {
  eyes: (number | undefined)[] // eye value on every fly-in frame, through the first 'playing' frame
  heldWarpFrames: number //       frames with the NEW well loaded but mode still 'warp'
  tube: Tube //                   the NEW (destination) well
  sawWarpSpace: boolean //        descent bottom emitted warp-space
  warpEndOnPlayingFrame: boolean //warp-end emitted the frame play resumes
  finalMode: GameState['mode']
  finalLevel: number
}

// Drive a clean warp off `startLevel` and record the eye every frame the NEW wave is
// loaded, up to and including the first frame that resumes play.
function traceFlyIn(startLevel: number, seed = 1): FlyInTrace {
  let s = enterCleanWarp(startLevel, seed)
  const target = startLevel + 1
  const eyes: (number | undefined)[] = []
  let heldWarpFrames = 0
  let sawWarpSpace = false
  let warpEndOnPlayingFrame = false
  for (let i = 0; i < 4000; i++) {
    s = stepGame(s, NEUTRAL, DT)
    if (s.events.some((e) => e.type === 'warp-space')) sawWarpSpace = true
    if (s.level === target && (s.mode === 'warp' || s.mode === 'playing')) {
      eyes.push(eyeOf(s))
      if (s.mode === 'warp') heldWarpFrames++
      if (s.mode === 'playing') {
        warpEndOnPlayingFrame = s.events.some((e) => e.type === 'warp-end')
        break
      }
    }
  }
  return {
    eyes,
    heldWarpFrames,
    tube: s.tube,
    sawWarpSpace,
    warpEndOnPlayingFrame,
    finalMode: s.mode,
    finalLevel: s.level,
  }
}

describe('tp1-37 — the eye advances +0x18/frame during the fly-in (NEWAV2, ALWELG.MAC:85-91)', () => {
  it('seeds the eye at the ROM fly-in start 0xFA00 (-1536) on the first fly-in frame', () => {
    // INEWAV parks the eye far back before NEWAV2 walks it in (ALWELG.MAC:29-33).
    const t = traceFlyIn(1)
    expect(t.eyes.length).toBeGreaterThan(0)
    expect(t.eyes[0]).toBe(ROM_EYE_START)
  })

  it('advances the eye by exactly +0x18 (24) ROM units each frame until it clamps', () => {
    const t = traceFlyIn(1)
    const seq = t.eyes as number[]
    // Every step is +24 except the final one, which is the clamp AT the destination
    // (a short step, 0 < Δ ≤ 24). No step is 0 (frozen) or > 24 (skipping).
    for (let i = 1; i < seq.length; i++) {
      const delta = seq[i] - seq[i - 1]
      const isLast = i === seq.length - 1
      if (isLast) expect(delta).toBeGreaterThan(0)
      else expect(delta).toBe(ROM_EYE_STEP)
      expect(delta).toBeLessThanOrEqual(ROM_EYE_STEP)
    }
  })

  it('moves the eye monotonically toward the well every frame (drives the warpDiveTube arrival)', () => {
    // A shell feeding warpDiveTube(newTube, f(eyeY)) needs a monotone signal; a frozen
    // or oscillating eye would stutter the arrival. (tp1-33: the eye MOVES, never idles.)
    const seq = traceFlyIn(1).eyes as number[]
    for (let i = 1; i < seq.length; i++) expect(seq[i]).toBeGreaterThanOrEqual(seq[i - 1])
    expect(seq[seq.length - 1]).toBeGreaterThan(seq[0]) // it actually flew in, did not idle
  })
})

describe('tp1-37 — the eye clamps AT the per-well EYLDES = -ROM_EYE_Y[well] (ALWELG.MAC:97-108)', () => {
  it('stops exactly at -H (the destination well eye-Y), never overshooting', () => {
    // INIWLS: EYLDES = -HOLEYL[wellID] (ALDISP.MAC:2470-2475). The last NEWAV2 frame
    // forces EYL = EYLDES, EYH = 0xFF (ALWELG.MAC:104-108) — an exact clamp, not +24 past.
    const t = traceFlyIn(1)
    const H = recoverH(t.tube)
    const seq = t.eyes as number[]
    expect(seq[seq.length - 1]).toBe(-H)
    // No frame is deeper toward the well than the destination.
    for (const v of seq) expect(v).toBeLessThanOrEqual(-H)
  })

  it('takes ceil((1536 - H)/24) advances to reach EYLDES — the ROM count, per well', () => {
    const t = traceFlyIn(1)
    const seq = t.eyes as number[]
    const H = recoverH(t.tube)
    const firstAtDest = seq.indexOf(-H)
    expect(firstAtDest).toBe(expectedAdvances(t.tube)) // eyes[0] = start, so index == #advances
    expect(expectedAdvances(t.tube)).toBeGreaterThanOrEqual(60) // sanity: it is ~63, not ~10
  })

  it('resumes play the frame the eye reaches EYLDES, ending the dive with warp-end', () => {
    const t = traceFlyIn(1)
    expect(t.sawWarpSpace).toBe(true) // descent bottom → space (unchanged)
    expect(t.finalMode).toBe('playing')
    expect(t.finalLevel).toBe(2)
    expect(t.warpEndOnPlayingFrame).toBe(true) // warp-end fires when the eye lands, not before
  })
})

describe('tp1-37 — the fly-in is far longer than the countdown placeholder (WARP_FLYIN_FRAMES=10 retired)', () => {
  it('holds the new well for ~63 frames, not the invented ceil(224/24)=10', () => {
    const t = traceFlyIn(1)
    expect(t.heldWarpFrames).toBeGreaterThanOrEqual(60)
    expect(t.heldWarpFrames).not.toBe(10) // the placeholder is gone
  })

  it('varies the fly-in length by destination well — EYLDES is per-well, not a flat constant', () => {
    // Different wells have different H, so different ceil((1536-H)/24). A flat count
    // (today: always 10) cannot vary. (a) The ROM count genuinely differs across the 16
    // destination wells — a pure fact about ROM_EYE_Y, no sim needed:
    const perWell = new Set<number>()
    for (let dest = 2; dest <= 17; dest++) perWell.add(expectedAdvances(tubeForLevel(dest)))
    expect(perWell.size).toBeGreaterThan(1)
    // (b) The OBSERVED held-frame eye count actually tracks the destination well it lands in:
    for (const L of [1, 3]) {
      const t = traceFlyIn(L)
      const seq = t.eyes as number[]
      expect(seq.indexOf(-recoverH(t.tube))).toBe(expectedAdvances(t.tube))
    }
  })
})

describe('tp1-37 — purity & determinism (core contract)', () => {
  it('reproduces the identical eye sequence for the same seed (no RNG, no wall-clock)', () => {
    const a = traceFlyIn(1, 7).eyes
    const b = traceFlyIn(1, 7).eyes
    // Non-vacuous: the sequence must be real numbers (a live eye), not all-undefined,
    // before "identical" means anything (a seeded [undefined,…] would trivially match).
    expect(a.every((v) => typeof v === 'number')).toBe(true)
    expect(a).toEqual(b)
  })

  it('does not mutate the input state — the eye advance lands on the returned clone only', () => {
    // Drive to a mid-fly-in frame (new well loaded, still 'warp'), then step once more and
    // confirm the eye advanced on the OUTPUT while the INPUT is untouched (cloneState
    // carries eyeY; stepGame is pure). This frame exists for both the placeholder and the
    // real fly-in, so pre-GREEN this fails cleanly on the missing eye, not on a runaway loop.
    let s = enterCleanWarp(1)
    for (let i = 0; i < 300 && !(s.level === 2 && s.mode === 'warp'); i++) {
      s = stepGame(s, NEUTRAL, DT)
    }
    expect(s.level).toBe(2)
    expect(s.mode).toBe('warp')
    const before = eyeOf(s)
    expect(before).not.toBeUndefined()
    const out = stepGame(s, NEUTRAL, DT)
    expect(eyeOf(s)).toBe(before) // input frozen
    expect(eyeOf(out)).toBe((before as number) + ROM_EYE_STEP) // output advanced +24
  })
})

describe('tp1-37 — ROM constants (rule #2: interface/return contract)', () => {
  it('exposes EYE_FLYIN_START = -1536 (0xFA00) and EYE_FLYIN_STEP = 0x18 (24)', () => {
    expect(EYE_FLYIN_START).toBe(-1536)
    expect(EYE_FLYIN_STEP).toBe(24)
  })
})
