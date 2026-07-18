// tests/shell/tp1-36.fuseball-vertex-guard.test.ts
//
// Story tp1-36 (AC-1) — a VERTEX-LEVEL GUARD for the fuseball glyph.
//
// tp1-17 shipped FUSE0-3 byte-exact from the ROM, but the tp1-17 tests
// (tests/shell/tp1-17.shapes.test.ts, AC-3) pin the fuseball by COLOUR only —
// five hues present, four distinct frames. A silent edit to a VERTEX (a typo in
// one SCVEC coordinate, a dropped point, a re-ordered stroke) keeps all five
// colours and still reads as "4 distinct frames", so those colour tests stay
// GREEN while the shape silently regresses. The V-014 citation is frozen at the
// audit commit, so it cannot catch a future drift either. This file closes that
// hole.
//
// This is a CHARACTERIZATION guard: it PASSES against the current (correct) code
// and exists to fail LOUDLY on any future change to the fuseball vertex data.
// Its teeth were proven by mutation during tp1-36 RED (perturb one vertex → this
// suite fails; restore → it passes).
//
// SOURCE OF TRUTH — the original 1981 Atari assembler, re-verified byte-exact,
// SCVEC-for-SCVEC, during tp1-36 RED:
//   /Users/slabgorb/Projects/tempest-source-text/ALVROM.MAC:954-1095  (FUSE0-3)
// The block is `.RADIX 16` (hex). `SCVEC x,y[,b]` names an ABSOLUTE object point;
// a trailing `,0` is a beam-OFF positioning move (the start of a new polyline),
// otherwise the beam is on (`CB`=7). `CSTAT c` sets the colour of the vectors
// that follow; the fixed order is RED, YELLOW, GREEN, PURPLE, TURQOI — and TURQOI
// renders as the palette `cyan` (tp1-12 / V-011). Each CSTAT group becomes one
// open polyline stroke in the emitted Glyph.
//
// fuseballGlyph applies ONE uniform scale (FUSE_SCALE) to these raw ROM object
// units — no rotation, no Y-flip, no centring — so every emitted point equals its
// ROM literal times a single positive constant. The coordinate guard recovers
// that constant from the data and requires every vertex to sit on ROM×s: it is
// scale-tolerant (a legitimate global rescale still passes) yet fails on ANY
// change to a coordinate, count, stroke order, or sign.
import { describe, it, expect } from 'vitest'
import { fuseballGlyph, type GlyphColor } from '../../src/shell/glyphs'

// ---------------------------------------------------------------------------
// The ROM oracle: FUSE0-3, verbatim ALVROM.MAC:954-1095 (hex literals kept as
// JS hex so the transcription reads 1:1 against the source). Five CSTAT groups
// per frame, in fixed order; each group's `verts` is its SCVEC polyline.
// ---------------------------------------------------------------------------
interface RomGroup {
  readonly color: GlyphColor
  readonly verts: readonly (readonly [number, number])[]
}
const FUSE_ROM: readonly (readonly RomGroup[])[] = [
  [ // FUSE0 — ALVROM.MAC:954-989
    { color: 'red', verts: [[-4, 6], [1, 0x0c], [-5, 0x0e], [1, 0x12], [-1, 0x18]] },
    { color: 'yellow', verts: [[8, 0x17], [0x0a, 0x14], [0x0c, 0x10], [6, 0x0c], [8, 8], [0, 0]] },
    { color: 'green', verts: [[0x0a, 2], [8, -6], [0x0e, -6], [8, -0x0c], [0x0c, -0x13], [0x10, -0x13]] },
    { color: 'purple', verts: [[-4, -0x1a], [-4, -0x14], [-0x0a, -0x14], [-7, -0x0d], [-9, -6], [-3, -8], [0, 0]] },
    { color: 'cyan', verts: [[-8, -2], [-0x0a, 3], [-0x0e, -1], [-0x10, 4], [-0x1c, -4]] },
  ],
  [ // FUSE1 — ALVROM.MAC:990-1025
    { color: 'red', verts: [[-1, 8], [-5, 8], [-5, 0x0a], [-0x0a, 9], [-7, 0x10], [-0x0c, 0x10], [-0x0e, 0x0c]] },
    { color: 'yellow', verts: [[0x14, 0x10], [0x0e, 0x12], [9, 0x0d], [0x0a, 7], [6, 8], [0, 0]] },
    { color: 'green', verts: [[1, -1], [9, 0], [0x0b, -5], [0x10, -6], [0x0e, -0x0a], [0x14, -0x0b]] },
    { color: 'purple', verts: [[-8, -0x16], [-8, -0x12], [-4, -0x0c], [-8, -0x0c], [-6, -6], [0, 0]] },
    { color: 'cyan', verts: [[-8, 0], [-0x0c, -4], [-0x10, -2], [-0x18, -6]] },
  ],
  [ // FUSE2 — ALVROM.MAC:1026-1061
    { color: 'red', verts: [[0, 7], [3, 9], [1, 0x0d], [6, 0x10], [4, 0x14], [8, 0x1c]] },
    { color: 'yellow', verts: [[0x18, 0x0e], [0x12, 0x0e], [0x10, 6], [0x0a, 2], [8, 6], [0, 0]] },
    { color: 'green', verts: [[4, -4], [8, -4], [9, -8], [0x10, -9], [0x11, -0x10], [0x18, -0x10]] },
    { color: 'purple', verts: [[-0x0c, -0x18], [-8, -0x14], [-0x0c, -0x0c], [-5, -0x0a], [0, 0]] },
    { color: 'cyan', verts: [[-4, 2], [-8, 0], [-0x0a, 2], [-0x12, 0], [-0x16, -6]] },
  ],
  [ // FUSE3 — ALVROM.MAC:1062-1095
    { color: 'red', verts: [[-4, 4], [-3, 0x0a], [-6, 0x0e], [-0x0c, 0x0e], [-0x0c, 0x12]] },
    { color: 'yellow', verts: [[0x10, 0x10], [0x0a, 0x0e], [0x0d, 0x0b], [8, 8], [0x0a, 4], [0, 0]] },
    { color: 'green', verts: [[8, -3], [9, -7], [0x0e, -4], [0x12, -4], [0x14, -0x0e]] },
    { color: 'purple', verts: [[0, -0x18], [-4, -0x14], [0, -0x10], [-4, -0x0c], [2, -8], [0, 0]] },
    { color: 'cyan', verts: [[-9, -4], [-0x0a, -1], [-0x0e, -1], [-0x0f, -7], [-0x15, -9]] },
  ],
]

const FRAMES = [0, 1, 2, 3] as const
// CSTAT draw order (RED/YELLOW/GREEN/PURPLE/TURQOI→cyan), fixed on every frame.
const ROM_COLOR_ORDER: readonly GlyphColor[] = ['red', 'yellow', 'green', 'purple', 'cyan']
// Per-group SCVEC counts, hand-counted from ALVROM.MAC and cross-checked below.
const ROM_GROUP_COUNTS = FUSE_ROM.map((frame) => frame.map((g) => g.verts.length))
// Per-frame totals: FUSE0=29, FUSE1=29, FUSE2=28, FUSE3=27 → 113 across all four.
const ROM_FRAME_TOTALS = ROM_GROUP_COUNTS.map((counts) => counts.reduce((a, b) => a + b, 0))

describe('AC-1 fuseballGlyph — vertex-level guard against silent shape drift (V-014, ALVROM.MAC:954-1095)', () => {
  // Sanity-anchor the oracle so a typo in the transcription above cannot make the
  // real guards vacuous: the ROM oracle MUST itself be 5 groups / 29·29·28·27 / 113.
  it('the ROM oracle is well-formed: 5 groups per frame, 29/29/28/27 SCVECs, 113 total', () => {
    expect(FUSE_ROM.map((f) => f.length)).toEqual([5, 5, 5, 5])
    expect(FUSE_ROM.every((f) => f.map((g) => g.color).every((c, i) => c === ROM_COLOR_ORDER[i]))).toBe(true)
    expect(ROM_FRAME_TOTALS).toEqual([29, 29, 28, 27])
    expect(ROM_FRAME_TOTALS.reduce((a, b) => a + b, 0)).toBe(113)
  })

  it('emits exactly 5 colour strokes per frame, in the ROM CSTAT order red/yellow/green/purple/turqoi(cyan)', () => {
    for (const f of FRAMES) {
      const strokeColors = fuseballGlyph(f).map((s) => s.color)
      expect(strokeColors, `frame ${f} stroke colours & order`).toEqual(ROM_COLOR_ORDER)
    }
  })

  it('emits the ROM vertex count for every colour group of every frame (a dropped/added point fails)', () => {
    for (const f of FRAMES) {
      const counts = fuseballGlyph(f).map((s) => s.points.length)
      expect(counts, `frame ${f} per-group vertex counts`).toEqual(ROM_GROUP_COUNTS[f])
    }
  })

  it('emits 29/29/28/27 total vertices per frame — 113 across all four writhe frames', () => {
    const totals = FRAMES.map((f) => fuseballGlyph(f).reduce((n, s) => n + s.points.length, 0))
    expect(totals).toEqual([29, 29, 28, 27])
    expect(totals.reduce((a, b) => a + b, 0)).toBe(113)
  })

  it('every emitted vertex equals its ROM coordinate × one uniform scale (exact shape, scale-tolerant)', () => {
    // fuseballGlyph is a pure uniform scaling of the raw ROM units, so out = rom·s
    // for a single positive constant s across ALL frames. Recover s from the first
    // non-zero coordinate, then require every vertex — zeros included — to sit on
    // rom·s. A one-unit edit to any coordinate moves that vertex ≈0.32 units off
    // rom·s (far beyond the 1e-6 tolerance) and reddens this assertion.
    const pairs: [out: number, rom: number][] = []
    let s = Number.NaN
    for (const f of FRAMES) {
      const g = fuseballGlyph(f)
      FUSE_ROM[f].forEach((grp, gi) => {
        const stroke = g[gi]
        expect(stroke.color, `frame ${f} group ${gi} colour`).toBe(grp.color)
        expect(stroke.points.length, `frame ${f} group ${gi} vertex count`).toBe(grp.verts.length)
        grp.verts.forEach(([rx, ry], vi) => {
          const p = stroke.points[vi]
          pairs.push([p.x, rx], [p.y, ry])
          if (Number.isNaN(s) && rx !== 0) s = p.x / rx
          if (Number.isNaN(s) && ry !== 0) s = p.y / ry
        })
      })
    }
    expect(s, 'a single positive uniform scale must be recoverable').toBeGreaterThan(0)
    for (const [out, rom] of pairs) {
      expect(out).toBeCloseTo(rom * s, 6)
    }
  })

  it('wraps on `frame & 3`: frame 4 reproduces frame 0 vertex-for-vertex', () => {
    const dump = (f: number) => fuseballGlyph(f).map((s) => ({ c: s.color, p: s.points.map((q) => [q.x, q.y]) }))
    expect(dump(4)).toEqual(dump(0))
    expect(dump(7)).toEqual(dump(3))
  })
})
