// tests/core/tp1-31.framing-zadjl.test.ts
//
// Story tp1-31 (DB-008, deferred from tp1-9) — THE FRAMING: the per-well
// screen-Z vanishing point ZADJL translates the WHOLE tube on screen, and on a
// NEW WAVE it slides in. This completes the framing pair with tp1-9's DB-007
// (the far ring built about the projected vanishing point).
//
// Primary source: Theurer's 1981 assembler, verified against the LF copy at
// ~/Projects/a-3/reference/atari-source/tempest (ALCOMN.MAC sets .RADIX 16, so
// the HOLZAD/HOLZDH bytes below are HEX). Audit finding:
// docs/audit/findings/pair-4-aldisp-b-well-projection.json (DB-008).
//
// ── What the ROM does ────────────────────────────────────────────────────────
// ZADJL is a SIGNED 16-bit little-endian per-well screen-Z centre, assembled
// from two byte tables indexed by wellID (ALDISP.MAC:1387-1388):
//     HOLZAD (low):  40 20 40 80 40 40 70 60 00 20 40 00 A0 40 40 00  ;CENTER ADJUST
//     HOLZDH (high): FF FF FF FF FF FF FF 00 01 FF 00 00 FE 01 FF 01
//   → ZADJL[wellID] = int16LE(low, high)  (decoded to decimal in EXPECTED below)
// XADJL is set to 0 unconditionally ("X SCREEN CENTER", ALDISP.MAC:2507), so the
// whole-tube translate is VERTICAL only — it slides UP/DOWN, never sideways.
//
// On a NEW LIFE the tube SNAPS to ZADJL immediately ("AT CENTER IMMEDIATELY",
// ALDISP.MAC:2489-2492). On a NEW WAVE it "MOVES UP SLOWLY" — the classic >>3
// exponential ease toward the target (ALDISP.MAC:2494-2505 seeds delta>>3;
// ALWELG.MAC:56-82 (NEWAV2) advances ZADJL toward the target each frame).
//
// ── What this file pins, and what it deliberately does NOT ───────────────────
// Per tempest/CLAUDE.md the shell (render/input/audio/loop) is verified by
// RUNNING THE GAME, and tp1-9's Delivery Findings flagged this slide as a
// shell-clock animation to be Reviewer/run-the-game verified, recommending Dev
// expose the per-well offset as a PURE constant so it becomes unit-testable.
// So this suite pins the two pure, DOM-free surfaces Dev creates in a new
// `src/shell/framing.ts`:
//
//   1. WELL_Z_ADJUST — the 16-value signed ZADJL table, by wellID, in RAW ROM
//      units. Hard-pinned bit-for-bit; each value is re-decoded from its
//      HOLZAD/HOLZDH bytes here so a transcription slip yields a wrong decimal.
//   2. stepFraming(current, target) — ONE frame of the new-wave slide toward
//      `target`, in the same RAW ROM units. Pinned by OBSERVABLE PROPERTIES
//      (converges home, ~1/8 per-frame rate, no overshoot, sign-correct), NOT
//      by the ROM's exact 6502 fixed-point accumulator bytes (see the logged
//      TEA deviation — over-coupling to one transcription would reject a
//      faithful port, and the fractional-accumulator smoothing is precisely the
//      "eyeball it" animation half).
//
// NOT unit-pinned here (Reviewer diff-trace + run-the-game, per convention):
//   - the ROM-unit → canvas-pixel scale of the translate,
//   - that render applies it as a VERTICAL translate of the whole tube (XADJL=0),
//   - the NEW-LIFE snap vs NEW-WAVE slide branch selection,
//   - that core projection (src/core/geometry.ts) is UNTOUCHED.
//
// These types/values are absent until GREEN (the module does not exist yet), so
// the import fails to resolve and the whole file REDs — the intended RED signal.
import { describe, it, expect } from 'vitest'
import { WELL_Z_ADJUST, stepFraming } from '../../src/shell/framing'

// Signed little-endian 16-bit from its two ROM bytes. Used to RE-DERIVE every
// expected ZADJL from the raw HOLZAD/HOLZDH bytes, so the EXPECTED decimals below
// can never silently drift from the source table.
const s16LE = (low: number, high: number): number => {
  const u = ((high & 0xff) << 8) | (low & 0xff)
  return u >= 0x8000 ? u - 0x10000 : u
}

// The authentic ZADJL table, one row per wellID, carrying BOTH the raw ROM bytes
// and the decoded decimal. The decimal is what a lazy transcription gets wrong;
// s16LE(low, high) is the arithmetic that refutes it.
const EXPECTED: ReadonlyArray<{ wellId: number; low: number; high: number; z: number }> = [
  { wellId: 0,  low: 0x40, high: 0xff, z: -192 }, // 0xFF40
  { wellId: 1,  low: 0x20, high: 0xff, z: -224 }, // 0xFF20
  { wellId: 2,  low: 0x40, high: 0xff, z: -192 },
  { wellId: 3,  low: 0x80, high: 0xff, z: -128 }, // 0xFF80
  { wellId: 4,  low: 0x40, high: 0xff, z: -192 },
  { wellId: 5,  low: 0x40, high: 0xff, z: -192 },
  { wellId: 6,  low: 0x70, high: 0xff, z: -144 }, // 0xFF70
  { wellId: 7,  low: 0x60, high: 0x00, z: 96 },   // 0x0060
  { wellId: 8,  low: 0x00, high: 0x01, z: 256 },  // 0x0100  (max positive)
  { wellId: 9,  low: 0x20, high: 0xff, z: -224 },
  { wellId: 10, low: 0x40, high: 0x00, z: 64 },   // 0x0040
  { wellId: 11, low: 0x00, high: 0x00, z: 0 },    // 0x0000  (dead centre)
  { wellId: 12, low: 0xa0, high: 0xfe, z: -352 }, // 0xFEA0  (min / most negative)
  { wellId: 13, low: 0x40, high: 0x01, z: 320 },  // 0x0140
  { wellId: 14, low: 0x40, high: 0xff, z: -192 },
  { wellId: 15, low: 0x00, high: 0x01, z: 256 },  // 0x0100
]

describe('tp1-31 — the ZADJL table is the authentic per-well signed-16-bit screen-Z (ALDISP.MAC:1387-1388)', () => {
  it('has exactly 16 entries — one per wellID, so the level→well remap (0..15) never over-indexes it', () => {
    // Unlike a wave-indexed table, ZADJL is well-indexed: wellID = ROM_REMAP[(level-1)%16]
    // is always in [0,15], so there is no reachable walk-off past the last row.
    expect(WELL_Z_ADJUST).toHaveLength(16)
  })

  it('each wellID carries its exact ROM value, re-decoded from the HOLZAD/HOLZDH bytes', () => {
    for (const e of EXPECTED) {
      // Guard the fixture against ITSELF: the decimal must equal the byte decode.
      expect(e.z).toBe(s16LE(e.low, e.high))
      // Then the shipped table must equal that value.
      expect(WELL_Z_ADJUST[e.wellId]).toBe(e.z)
    }
  })

  it('equals the full ordered ROM table (catches a reordered, padded, or truncated port)', () => {
    expect([...WELL_Z_ADJUST]).toEqual(EXPECTED.map((e) => e.z))
  })

  it('spans the exact ROM extremes: well 12 = -352 (deepest), wells 8 & 15 = +256 (highest)', () => {
    expect(Math.min(...WELL_Z_ADJUST)).toBe(-352) // wellID 12 = 0xFEA0
    expect(Math.max(...WELL_Z_ADJUST)).toBe(256) // wellID 8 & 15 = 0x0100
    expect(WELL_Z_ADJUST[8]).toBe(256)
    expect(WELL_Z_ADJUST[15]).toBe(256)
    expect(WELL_Z_ADJUST[12]).toBe(-352)
  })

  it('wellID 11 alone sits dead-centre (ZADJL = 0) — the same well tp1-9 found on-axis (EYE_Z = 0x80)', () => {
    // Corroboration across findings: wellID 11 is the ONE well with both a
    // concentric far ring (DB-007, VP at origin) AND no screen-Z shift here.
    expect(WELL_Z_ADJUST[11]).toBe(0)
    // ...and it is the only zero: every other well is displaced.
    expect(WELL_Z_ADJUST.filter((z) => z === 0)).toHaveLength(1)
  })

  it('the table is not accidentally the eye-Z table — ZADJL is a distinct constant', () => {
    // ROM_EYE_Z (tp1-9) is all-positive [0x20..0xB0]; ZADJL is signed and mostly
    // negative. A copy-paste of the wrong table would be caught here.
    expect(WELL_Z_ADJUST.some((z) => z < 0)).toBe(true)
    expect(WELL_Z_ADJUST.some((z) => z > 0)).toBe(true)
  })
})

// ── The new-wave slide: stepFraming(current, target) ─────────────────────────
// Run the ease repeatedly and return the whole path [start, s1, s2, ...].
const slide = (start: number, target: number, frames: number): number[] => {
  const path = [start]
  let cur = start
  for (let i = 0; i < frames; i++) {
    cur = stepFraming(cur, target)
    path.push(cur)
  }
  return path
}

describe('tp1-31 — stepFraming is the >>3 new-wave ease toward the well ZADJL (ALDISP.MAC:2494-2505)', () => {
  it('is a fixed point AT the target — a settled tube does not drift', () => {
    for (const x of [-352, -192, 0, 64, 96, 256, 320]) {
      expect(stepFraming(x, x)).toBe(x)
    }
  })

  it('moves TOWARD the target and never PAST it, in either direction', () => {
    // Upward (target above current)
    for (const [cur, tgt] of [[0, 256], [-352, 256], [-192, 64], [0, 320]]) {
      const next = stepFraming(cur, tgt)
      expect(next).toBeGreaterThan(cur) // moved
      expect(next).toBeLessThanOrEqual(tgt) // no overshoot
    }
    // Downward (target below current)
    for (const [cur, tgt] of [[256, -192], [0, -352], [320, 0], [64, -224]]) {
      const next = stepFraming(cur, tgt)
      expect(next).toBeLessThan(cur) // moved
      expect(next).toBeGreaterThanOrEqual(tgt) // no overshoot
    }
  })

  it('eases by ~1/8 of the remaining gap per frame — EXPONENTIAL, not a linear slide', () => {
    // The signature no constant-step slide can fake: the fraction of the gap
    // covered in one frame is the SAME regardless of gap magnitude (~1/8), so the
    // absolute step scales WITH the gap. A fixed-step linear slide would give a
    // ratio of 1 between these two, not 2.
    const m256 = stepFraming(0, 256) - 0
    const m512 = stepFraming(0, 512) - 0
    expect(m256 / 256).toBeCloseTo(1 / 8, 1) // 0.075..0.175: rejects 1/4 and 1/16
    expect(m512 / 512).toBeCloseTo(1 / 8, 1)
    expect(m512 / m256).toBeCloseTo(2, 1) // step ∝ gap ⇒ exponential, not linear

    // Same rate for a NEGATIVE gap (the deep wells slide DOWN), and same sign.
    const mNeg = stepFraming(0, -352) - 0
    expect(mNeg).toBeLessThan(0)
    expect(mNeg / -352).toBeCloseTo(1 / 8, 1)
  })

  it('first step points the RIGHT way for every one of the 16 real wells', () => {
    WELL_Z_ADJUST.forEach((target, wellId) => {
      const next = stepFraming(0, target)
      if (target === 0) {
        expect(next).toBe(0) // wellID 11: no slide
      } else {
        expect(Math.sign(next)).toBe(Math.sign(target)) // moves toward, not away
      }
    })
  })

  it('slides in and SETTLES on home for every well — never stalls short, never overshoots', () => {
    // The end-of-ease trap: a naive `cur + ((tgt-cur)>>3)` truncates to 0 once the
    // gap drops below 8 and STALLS several ROM-units short of home (≈19px at
    // RING_SCALE) — a tube that never quite frames up. The ROM's fractional
    // accumulator completes the tail; the shell ease must too.
    WELL_Z_ADJUST.forEach((target, wellId) => {
      const path = slide(0, target, 128)
      const final = path[path.length - 1]
      expect(Math.abs(final - target)).toBeLessThanOrEqual(1) // lands home
      // No frame ever leaves the [0, target] corridor (no overshoot / oscillation)…
      const lo = Math.min(0, target) - 1
      const hi = Math.max(0, target) + 1
      for (const v of path) {
        expect(v).toBeGreaterThanOrEqual(lo)
        expect(v).toBeLessThanOrEqual(hi)
      }
      // …and the distance to home is monotonically non-increasing (a true ease).
      for (let i = 1; i < path.length; i++) {
        expect(Math.abs(path[i] - target)).toBeLessThanOrEqual(Math.abs(path[i - 1] - target) + 1e-9)
      }
    })
  })

  it('slides correctly BETWEEN two wells — the real new-wave case (previous ZADJL → new ZADJL)', () => {
    // A new wave eases from the OUTGOING well's offset to the incoming one, which
    // may mean crossing zero. Deepest→highest: well 12 (-352) → well 8 (+256).
    const path = slide(WELL_Z_ADJUST[12], WELL_Z_ADJUST[8], 128)
    const final = path[path.length - 1]
    expect(final).toBeCloseTo(256, 0) // lands on the incoming well within 1 unit
    // Monotonically rising the whole way up (no wobble through 0).
    for (let i = 1; i < path.length; i++) {
      expect(path[i]).toBeGreaterThanOrEqual(path[i - 1] - 1e-9)
    }
  })
})
