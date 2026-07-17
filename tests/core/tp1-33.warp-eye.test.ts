// tests/core/tp1-33.warp-eye.test.ts
//
// Story tp1-33 (cluster C6, THE WARP DIVE) — THE MOVING EYE: during the warp
// DIVE the eye advances with the cursor, so the well expands past the fixed Claw
// (the deferred well-expansion half of tp1-10's AC-1 / WD-012 — the Claw-fixed
// half already shipped; this completes the "live core eye field").
//
// Primary source: Theurer's 1981 assembler, ~/Projects/tempest-source-text (the
// LF copy — the CRLF sibling ~/Projects/tempest-source is NOT citable). ALCOMN.MAC:17
// sets `.RADIX 16` and ALDISP/ALWELG inherit it, so the bytes below are HEX.
//
// ── THE ROM MECHANISM (byte-verified; the SM's session pointers were corrected) ──
//   Phase 1 — the DIVE (this story). MOVCUD advances the eye by the SAME velocity
//   as the cursor, every frame:
//       LDA EYLL ;UPDATE EYE POSITION / CLC / ADC CURSVL / STA EYLL / LDA EYL /
//       ADC CURSVH ...                                     (ALWELG.MAC:1049-1062)
//   The cursor (CURSY) is updated by that identical CURSVL:CURSVH one instruction
//   above (ALWELG.MAC:1024-1030), so (CURSY - EY) is INVARIANT across the dive —
//   the Claw's projected size/position never change (WD-012). What changes is the
//   well: its rim (fixed at PY=0x10) and floor (fixed at PY=0xF0) get nearer the
//   advancing eye, so the tube expands and streams past the stationary Claw.
//
//   The scale law is (16+H) / (PY - EY_now), and — critically — INIWLS FREEZES
//   YDEUNI at 16+H (ALDISP.MAC:2464-2506); the ROM does NOT recompute the unit as
//   the eye moves. Over the descent the eye advances the FULL along-span WARP_ALONG_SPAN
//   = 0xF0-0x10 = 224 (CURSY: 0x10 -> 0xF0). So the far end's foreshortening ratio
//   relative to the fixed rim is:
//       R_eff(progress) = (16 + H) / ((240 + H) - 224*progress)
//   H = HOLEYL[wellID] (EYE-Y, the per-well eye distance behind the rim,
//   ALDISP.MAC:1385; the same H tp1-9 baked into farRatio = (16+H)/(240+H)).
//   At progress 0 => R_eff = (16+H)/(240+H) = the well's STATIC farRatio R (no pop
//   at dive start). At progress 1 => R_eff = (16+H)/(16+H) = 1.0 EXACTLY — the far
//   ring has expanded to the rim; the well is flat (you have flown all the way in).
//
//   ── NOT this story (corrected from the SM's invented mechanism) ──
//   Phase 2 — the post-descent FLY-IN into the NEW well (NEWAV2): EYL += 0x18 per
//   frame toward the scalar EYLDES (ALWELG.MAC:85-91; EYLDES is a 1-byte scalar,
//   ALCOMN.MAC:532 — NOT a table, and NOT at ALDISP.MAC:2475). That is WD-018, a
//   DISTINCT movement with a shipped countdown placeholder (WarpState.flyIn); it is
//   deferred to a follow-up. The dive expansion is CURSOR-velocity-driven and covers
//   the FULL 224 span, not a per-well-EYLDES-clamped +0x18 ramp (see the guard block).
//
// Audit: WD-012 (pair-9-warp-drop-mode.json, the CONFIRMED headline finding) — the
//   Claw-fixed half is remediated_by tp1-10; the well-expansion half is what this
//   story completes. DB-006/DB-009 (pair-4) — the same per-well eye tables.
//
// ── THE CONTRACT under test ──
//   A new PURE core seam `warpDiveTube(tube, progress): Tube` returns the effective
//   EXPANDING well for a given dive progress. render draws THAT tube during the
//   warp, so the whole existing projection pipeline (perspectiveDepth/project/
//   laneWidth) reuses it unchanged. The NEAR ring (rim, where the Claw rides via
//   tp1-10's clawTransform) is held FIXED; only the FAR ring expands about the same
//   per-well vanishing point. These pins recover R_eff signature-agnostically from
//   the returned ring geometry (as tp1-9 does), plus a labelled subset that pins the
//   explicit `warpDiveTube` signature.
//
//   ── SCOPE NOTE added by tp1-38 ──
//   The full ROM model ALSO sweeps the near rim past the advancing eye and
//   off-screen (the rim crosses the eye at p* = (16+H)/224 — see
//   tp1-38.warp-rim-flyoff.test.ts). That DESCENT behaviour lives in a separate
//   seam, `warpDescentTube`; THIS near-ring-fixed transform remains in service as
//   the FLY-IN's frame (NEWAV2 parks the eye at −1536, and ONELN2's behind-eye
//   cull is disarmed while the eye is negative — "LDA EYH / IFPL",
//   ALDISP.MAC:1550-1552 — so the fly-in must never fly the rim off). This
//   file's pins are therefore PERMANENT keep-behavior guards for that seam, and
//   AC4 below guards exactly the property the fly-in depends on.
import { describe, it, expect } from 'vitest'
import { playingState } from './helpers'
import {
  tubeForLevel,
  warpDiveTube,
  laneWidth,
  laneCenterFar,
  laneCenterNear,
  project,
  type Point,
  type Tube,
} from '../../src/core/geometry'
import { WARP_ALONG_SPAN } from '../../src/core/rules'
import { stepGame } from '../../src/core/sim'
import type { GameState } from '../../src/core/state'
import { Input } from '../../src/core/input'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }
const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y)

// H = HOLEYL[wellID] per level (ALDISP.MAC:1385, HEX), decoded and cross-checked
// against tp1-9's WELL table + DB-006. R = static farRatio (16+H)/(240+H) written as
// an exact fraction literal so a transcription slip in H is caught by the decimal.
const WELL: ReadonlyArray<{ level: number; H: number; R: number }> = [
  { level: 1,  H: 24, R: 40 / 264 }, // 0.15152 circle
  { level: 2,  H: 28, R: 44 / 268 }, // 0.16418 square   (H max)
  { level: 4,  H: 15, R: 31 / 255 }, // 0.12157 peanut
  { level: 9,  H: 12, R: 28 / 252 }, // 0.11111 staircase
  { level: 11, H: 10, R: 26 / 250 }, // 0.10400 flat line (H min)
  { level: 13, H: 20, R: 36 / 260 }, // 0.13846 star
  { level: 15, H: 16, R: 32 / 256 }, // 0.12500 jagged
  { level: 16, H: 15, R: 31 / 255 }, // 0.12157 fig-8 (on-axis)
]

// The ROM dive law, from H and progress (see header). Written straight, never
// derived from the code under test.
const romREff = (H: number, progress: number): number =>
  (16 + H) / (240 + H - 224 * progress)

// Recover the far/near ratio signature-agnostically from the ring geometry: far
// chord = R_eff * near chord for every lane, so laneWidth(0)/laneWidth(1) = R_eff,
// independent of the vanishing-point translation and of how the ratio is plumbed.
function ratioFromLaneWidth(tube: Tube): number {
  const rs: number[] = []
  for (let lane = 0; lane < tube.laneCount; lane++) {
    const near = laneWidth(tube, lane, 1)
    if (near > 1) rs.push(laneWidth(tube, lane, 0) / near)
  }
  rs.sort((a, b) => a - b)
  return rs[Math.floor(rs.length / 2)] // median — robust to any degenerate lane
}

// Drive a fresh level-1 game into the warp and step to (at least) a target dive
// progress, returning the warp-mode state. Mirrors sim.warp.test.ts's enterWarp.
function warpAtLeast(progress: number, level = 1): GameState {
  const p = playingState(level)
  p.spawn = { nymphs: [] }
  p.enemies = []
  let s = stepGame(p, NEUTRAL, 1 / 60) // the step that enters the warp
  for (let i = 0; i < 2000 && s.mode === 'warp' && s.warp.progress < progress; i++) {
    s = stepGame(s, NEUTRAL, 1 / 60)
  }
  return s
}

describe('tp1-33 AC1 — warpDiveTube is the dive-expansion seam; progress 0 is the STATIC well (no pop)', () => {
  it('exists as a pure (tube, progress) -> Tube function', () => {
    expect(typeof warpDiveTube).toBe('function')
    expect(warpDiveTube.length).toBe(2)
  })

  it('at progress 0 returns the well UNCHANGED — same rings, ratio, translate (dive starts with no jump)', () => {
    for (const w of WELL) {
      const base = tubeForLevel(w.level)
      const dive0 = warpDiveTube(base, 0)
      expect(dive0.laneCount).toBe(base.laneCount)
      expect(dive0.farRatio).toBeCloseTo(base.farRatio, 10)
      expect(dive0.screenZ).toBeCloseTo(base.screenZ, 10)
      for (let i = 0; i < base.near.length; i++) {
        expect(dive0.near[i].x).toBeCloseTo(base.near[i].x, 8)
        expect(dive0.near[i].y).toBeCloseTo(base.near[i].y, 8)
        expect(dive0.far[i].x).toBeCloseTo(base.far[i].x, 8)
        expect(dive0.far[i].y).toBeCloseTo(base.far[i].y, 8)
      }
    }
  })
})

describe('tp1-33 AC2 — the far/near ratio EXPANDS per the ROM dive law R_eff=(16+H)/((240+H)-224*progress)', () => {
  it('matches the ROM law at sampled progress for every well (recovered from lane width)', () => {
    for (const w of WELL) {
      const base = tubeForLevel(w.level)
      for (const p of [0, 0.25, 0.5, 0.75]) {
        const r = ratioFromLaneWidth(warpDiveTube(base, p))
        expect(r).toBeCloseTo(romREff(w.H, p), 4) // < 0.00005: separates wells and progress steps
      }
    }
  })

  it('progress 0 recovers the well STATIC ratio R=(16+H)/(240+H) exactly', () => {
    for (const w of WELL) {
      expect(ratioFromLaneWidth(warpDiveTube(tubeForLevel(w.level), 0))).toBeCloseTo(w.R, 4)
    }
  })

  it('the ratio grows STRICTLY monotonically as the dive descends (the well expands, never contracts)', () => {
    for (const w of WELL) {
      const base = tubeForLevel(w.level)
      let prev = -Infinity
      for (const p of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
        const r = ratioFromLaneWidth(warpDiveTube(base, p))
        expect(r).toBeGreaterThan(prev)
        prev = r
      }
    }
  })
})

describe('tp1-33 AC3 — the eye advances the FULL 224 span: at the bottom EVERY well is FLAT (R_eff=1)', () => {
  // The distinguishing pin vs Phase 2: the DIVE eye tracks the cursor over the whole
  // WARP_ALONG_SPAN, so at progress 1 the far ring reaches the rim on EVERY well —
  // ratio exactly 1.0 — regardless of that well's H or its EYLDES. A per-well
  // EYLDES-clamped +0x18 ramp (the fly-in, Phase 2) would stop SHORT of 1.0.
  it('WARP_ALONG_SPAN is the ROM 0xF0-0x10 = 224 the law is anchored to', () => {
    expect(WARP_ALONG_SPAN).toBe(0xf0 - 0x10)
    expect(WARP_ALONG_SPAN).toBe(224)
  })

  it('at progress 1 the far ring coincides with the near ring (flat well) for every well', () => {
    for (const w of WELL) {
      const flat = warpDiveTube(tubeForLevel(w.level), 1)
      expect(ratioFromLaneWidth(flat)).toBeCloseTo(1, 4)
      for (let i = 0; i < flat.near.length; i++) {
        expect(dist(flat.far[i], flat.near[i])).toBeLessThan(0.5) // far collapsed onto near
      }
    }
  })

  it('the flat bottom is UNIFORM across wells — not clamped per-well (refutes an EYLDES stopping point)', () => {
    const bottoms = WELL.map((w) => ratioFromLaneWidth(warpDiveTube(tubeForLevel(w.level), 1)))
    for (const r of bottoms) expect(r).toBeCloseTo(1, 4)
  })
})

describe('tp1-33 AC4 — warpDiveTube holds the near ring FIXED (the fly-in frame; see tp1-38 scope note)', () => {
  it('the near ring is byte-identical across the whole descent (the Claw rides it, unmoved)', () => {
    for (const w of WELL) {
      const base = tubeForLevel(w.level)
      for (const p of [0, 0.3, 0.6, 1]) {
        const dive = warpDiveTube(base, p)
        for (let i = 0; i < base.near.length; i++) {
          expect(dive.near[i].x).toBeCloseTo(base.near[i].x, 8)
          expect(dive.near[i].y).toBeCloseTo(base.near[i].y, 8)
        }
      }
    }
  })

  it('a point AT the near rim (depth 1) projects to the same screen point at every progress', () => {
    const base = tubeForLevel(1)
    const lane = 3
    const rim0 = project(warpDiveTube(base, 0), lane, 1)
    for (const p of [0.25, 0.5, 0.9]) {
      const rim = project(warpDiveTube(base, p), lane, 1)
      expect(dist(rim, rim0)).toBeLessThan(1e-6) // the rim (and the Claw on it) is stationary
    }
  })
})

describe('tp1-33 AC5 — the well expands OUTWARD past the Claw (a far-end point rushes toward the rim)', () => {
  it('a point at the far end (depth 0) moves toward the near rim as the dive progresses', () => {
    // Its screen distance to the near-rim point on the same lane must SHRINK toward
    // 0 as the far ring expands to the rim — the well opening up around the Claw,
    // and the mechanism by which a spike grows up to meet the stationary Claw (WD-012).
    const base = tubeForLevel(1)
    const lane = 2
    const nearPt = laneCenterNear(base, lane)
    let prevGap = Infinity
    for (const p of [0, 0.25, 0.5, 0.75, 1]) {
      const farPt = laneCenterFar(warpDiveTube(base, p), lane)
      const gap = dist(farPt, nearPt)
      expect(gap).toBeLessThan(prevGap) // strictly closing
      prevGap = gap
    }
    // At the bottom the far point has arrived at the rim.
    expect(dist(laneCenterFar(warpDiveTube(base, 1), lane), nearPt)).toBeLessThan(0.5)
  })
})

describe('tp1-33 — purity / determinism (TS lang-review #4, #7)', () => {
  it('is referentially transparent and does NOT mutate its input tube', () => {
    const base = tubeForLevel(1)
    const snapshot = JSON.stringify(base)
    const a = warpDiveTube(base, 0.5)
    const b = warpDiveTube(base, 0.5)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b)) // same input -> same output
    expect(JSON.stringify(base)).toBe(snapshot) // input untouched
  })

  it('stays finite and in [R, 1] across all wells and the full progress range (divide never blows up)', () => {
    for (const w of WELL) {
      const base = tubeForLevel(w.level)
      for (const p of [0, 0.01, 0.25, 0.5, 0.75, 0.99, 1]) {
        const r = ratioFromLaneWidth(warpDiveTube(base, p))
        expect(Number.isFinite(r)).toBe(true)
        expect(r).toBeGreaterThanOrEqual(w.R - 1e-6)
        expect(r).toBeLessThanOrEqual(1 + 1e-6)
      }
    }
  })
})

describe('tp1-33 — wired to the live dive: the expansion tracks the REAL warp progress', () => {
  // Keep the sneaky Dev honest: warpDiveTube must be driven by the actual descending
  // s.warp.progress, so a real stepGame dive shows monotonic expansion — not a
  // hard-coded ramp divorced from the sim.
  it('sampling warpDiveTube(s.tube, s.warp.progress) over a real descent expands monotonically', () => {
    let s = warpAtLeast(0) // just entered warp, progress ~0
    const ratios: number[] = []
    for (let i = 0; i < 40 && s.mode === 'warp' && (s.warp.flyIn ?? 0) === 0; i++) {
      ratios.push(ratioFromLaneWidth(warpDiveTube(s.tube, Math.min(1, s.warp.progress))))
      s = stepGame(s, NEUTRAL, 1 / 60)
    }
    expect(ratios.length).toBeGreaterThan(3) // the descent actually ran
    for (let i = 1; i < ratios.length; i++) {
      expect(ratios[i]).toBeGreaterThanOrEqual(ratios[i - 1] - 1e-9) // non-decreasing as it descends
    }
    expect(ratios[ratios.length - 1]).toBeGreaterThan(ratios[0]) // and it genuinely grew
  })
})
