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
  it('every level keeps the ROM per-well DIRECTION and never exceeds its ROM target', () => {
    // tp1-32 RESCOPED this from an exact-magnitude pin. The shipped
    // -ZADJ·(16+H)·S/256 was OVER-SCALED — it drove the near rim off-screen
    // (tp1-32.framing-viewport.test.ts). The magnitude is now a viewport-safe
    // TUNE, so the enduring, fix-agnostic contract is: screenZ keeps each well's
    // ROM direction (= sign of the raw target) and is a REDUCTION of that
    // ROM-derived target — never inverted, never amplified — whether the fix
    // rescales uniformly or clamps to a safe band. (The raw target still tethers
    // screenZ to the ROM per-well data; only its scale is under the tune.)
    for (let level = 1; level <= 16; level++) {
      const shape = shapeForLevel(level)
      const target = expectedScreenZ(shape)
      const z = tubeForLevel(level).screenZ
      if (ZADJ[shape] === 0) {
        expect(z, `level ${level} (shape ${shape}) untranslated`).toBeCloseTo(0, 9)
        continue
      }
      expect(Math.sign(z), `level ${level} (shape ${shape}) direction`).toBe(Math.sign(target))
      expect(Math.abs(z), `level ${level} (shape ${shape}) not amplified past ROM target`)
        .toBeLessThanOrEqual(Math.abs(target) + 1e-9)
    }
  })

  it('spot directions: the circle sits LOW, the stair sits HIGH — and the remap holds', () => {
    // tp1-32 rescoped this from exact literals to the scale-invariant DIRECTION.
    // Shipped sign convention: −ZADJ → +screenZ sits the circle LOW; +ZADJ →
    // −screenZ sits the stair HIGH.
    // Circle (level 1, shape 0, ZADJ −192): translated, positive (LOW/down).
    expect(tubeForLevel(1).screenZ).toBeGreaterThan(0)
    // Stair (level 9, shape 13, ZADJ +320): negative (HIGH/up). Also the WELSEQ
    // remap tripwire — identity indexing would read shape 9 (ZADJ −224) and land
    // POSITIVE, so the sign alone catches a dropped remap, at any magnitude.
    expect(tubeForLevel(9).screenZ).toBeLessThan(0)
    expect(Math.sign(tubeForLevel(9).screenZ), 'level 9 must remap to shape 13, not identity shape 9')
      .not.toBe(Math.sign(expectedScreenZ(9)))
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
