// tests/core/tp1-31.screen-z.test.ts
//
// Story tp1-31 (DB-008, deferred from tp1-9): THE FRAMING — the per-well
// SCREEN Z VANISH PT translation. Data half: every Tube carries its signed
// per-well translate target, ported from HOLZAD/HOLZDH.
//
// ROM quarry (primary source ~/Projects/tempest-source-text):
//   HOLZAD/HOLZDH  ALDISP.MAC:1387-1388  ";CENTER ADJUST" — signed 16-bit
//                  ZADJL ("SCREEN Z VANISH PT", ALCOMN.MAC:543), read per
//                  WELLID by INIWLS (ALDISP.MAC:2484-2498).
//   X vanish is always 0 ("X SCREEN CENTER", ALDISP.MAC:2507).
//
// ⚠ THE UNIT (the trap the superseded tp1-9 review caught — do not regress):
// ZADJ is added to SZ POST-divide (WORSCR header: SCREEN Z =
// [FACTOR/(PY-EY)]*(PZ-EZ)+SZCENT, ALDISP.MAC:2049-2051; ADC ZADJL at :2274),
// i.e. in ROM SCREEN units where FACTOR = 256 rides the math-box high byte and
// the rim spans 256·112/(16+H). Converting ZADJ as a WORLD-unit quantity
// (×RING_SCALE alone) lands 6.4× too large on the circle — the well 71% of
// the viewport off-centre. The rim-relative, scale-invariant port is
//   tube.screenZ = −ZADJ · (16+H) · RING_SCALE / 256    (canvas y down)
// Full derivation: sprint/archive/tp1-9-session-superseded-a1.md.
import { describe, it, expect } from 'vitest'
import { tubeForLevel } from '../../src/core/geometry'

// --- ROM tables as test-side literals (shape-indexed) ------------------------
// WELSEQ (ALDISP.MAC:1384): level (1-based, mod 16) → well shape id.
const WELSEQ = [0, 1, 2, 3, 4, 5, 6, 7, 13, 9, 8, 12, 14, 15, 10, 11] as const
// HOLEYL (ALDISP.MAC:1385) — needed because the screen-unit rim scale is per-well.
const HOLEYL = [24, 28, 24, 15, 24, 24, 24, 24, 10, 24, 16, 15, 24, 12, 20, 10] as const
// HOLZDH:HOLZAD (ALDISP.MAC:1387-1388) as signed 16-bit values:
const ZADJ = [-192, -224, -192, -128, -192, -192, -144, 96, 256, -224, 64, 0, -352, 320, -192, 256] as const

const S = 300 / 112 // geometry.ts RING_SCALE — the documented ROM→ring mapping
const shapeForLevel = (level: number): number => WELSEQ[(level - 1) % 16]
const expectedScreenZ = (shape: number): number =>
  (-ZADJ[shape] * (16 + HOLEYL[shape]) * S) / 256

describe('AC — tube.screenZ carries the per-well SCREEN Z VANISH PT translation', () => {
  it('every level exposes -ZADJ·(16+H)·S/256 in canvas-y ring units', () => {
    for (let level = 1; level <= 16; level++) {
      const shape = shapeForLevel(level)
      expect(tubeForLevel(level).screenZ, `level ${level} (shape ${shape})`)
        .toBeCloseTo(expectedScreenZ(shape), 9)
    }
  })

  it('spot literals: the circle sits LOW, the stair sits HIGH — rim-relative fractions', () => {
    // Shape 0: ZADJ = -192 against a 28672/40 = 716.8-unit ROM-screen rim
    // → +26.8% of the 300-unit rim = +80.357… canvas units (down).
    expect(tubeForLevel(1).screenZ).toBeCloseTo((192 * 40 * 300) / (112 * 256), 9)
    expect(tubeForLevel(1).screenZ).toBeCloseTo(80.357142857142857, 9)
    // Shape 13 (stair, level 9): ZADJ = +320 against a 28672/28 = 1024-unit rim
    // → -93.75 canvas units (up) exactly. Also the WELSEQ remap tripwire:
    // identity indexing would give shape 8's +256/H=10 value instead.
    expect(tubeForLevel(9).screenZ).toBeCloseTo(-93.75, 9)
    expect(tubeForLevel(9).screenZ).not.toBeCloseTo((-256 * 26 * 300) / (112 * 256), 2)
  })

  it('the WORLD-unit misconversion is refuted: never -ZADJ·S alone', () => {
    // The superseded tp1-9 RED shipped -ZADJ·RING_SCALE (no 256 divide). Pin
    // its refutation so the error cannot resurrect from the story description
    // (which lists raw ZADJ values with no unit guidance).
    for (const level of [1, 2, 9, 12]) {
      const shape = shapeForLevel(level)
      if (ZADJ[shape] === 0) continue
      expect(Math.abs(tubeForLevel(level).screenZ), `level ${level}`)
        .toBeLessThan(Math.abs(-ZADJ[shape] * S) * 0.5)
    }
  })

  it('exactly one well is untranslated — the figure-8 (shape 11, ZADJ = 0)', () => {
    const zeroes = Array.from({ length: 16 }, (_, i) => tubeForLevel(i + 1).screenZ)
      .filter((z) => Math.abs(z) < 1e-9)
    expect(zeroes).toHaveLength(1)
    expect(Math.abs(tubeForLevel(16).screenZ)).toBeLessThan(1e-9)
  })

  it('level 17 wraps to level 1 (total over all levels, finite everywhere)', () => {
    expect(tubeForLevel(17).screenZ).toBeCloseTo(tubeForLevel(1).screenZ, 12)
    for (let level = 1; level <= 16; level++) {
      expect(Number.isFinite(tubeForLevel(level).screenZ)).toBe(true)
    }
  })
})
