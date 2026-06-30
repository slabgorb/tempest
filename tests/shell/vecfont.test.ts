// tests/shell/vecfont.test.ts
//
// Story 10-13: Authentic VGMSGA stroke-vector font (replace the TTF webfont).
//
// Today the HUD / framing text is drawn with a TTF webfont ('Vector Battle')
// via ctx.fillText (src/shell/font.ts + render.ts). This story replaces it with
// a TRUE stroke-vector alphabet: a per-letter glyph table in the same style as
// the enemy/claw glyphs in src/shell/glyphs.ts, stroked through the existing
// vector/glow path. No font approximation, no TTF dependency.
//
// The testable seam these tests drive into existence is a PURE glyph module,
// `src/shell/vecfont.ts`, modelled on glyphs.ts: each character maps to vector
// path data (ink polylines in a fixed cell), which render.ts then strokes.
//
// SOURCE OF TRUTH for every coordinate below (authentic, verbatim ROM):
//   tempest/docs/ux/2026-06-30-vector-font-rom-extract.md
//   (← original Atari ANVGAN.MAC, Ed Logg 6-JUNE-79; cross-checked vs the
//    "Tempest vs Tempest" book §4.)
//
// Contract these tests assume of src/shell/vecfont.ts:
//   export const CELL_W: number   // 16
//   export const CELL_H: number   // 24
//   export interface VecStroke { readonly points: readonly { readonly x: number; readonly y: number }[] }
//   export interface VecGlyph {
//     readonly strokes: readonly VecStroke[]  // ink polylines, cell-local, y-UP, baseline y=0
//     readonly advance: number                // x distance from this glyph origin to the next
//   }
//   export const GLYPH_CHARS: string                       // every supported character
//   export function hasGlyph(ch: string): boolean
//   export function charGlyph(ch: string): VecGlyph        // total: unsupported -> blank glyph (no ink)
//   export function layoutText(text: string): { readonly strokes: readonly VecStroke[]; readonly width: number }
//
// Coordinate convention (DEFINED here, matching the ROM): cell-local units, the
// origin at the glyph's lower-left, +x right, +y UP, baseline at y=0; a glyph
// occupies x∈[0,CELL_W], y∈[0,CELL_H]. A ROM "blank" move (intensity 0) is a
// pen-up that STARTS A NEW STROKE; a lit run extends the current stroke. The
// trailing blank move is NOT ink — its net x is the glyph's `advance`.
import { describe, it, expect } from 'vitest'
// Read shell source as text via Vite's ?raw — the same boundary/purity-scan idiom
// used by glyphs.test.ts and the core-boundary suites.
import vecfontSrc from '../../src/shell/vecfont.ts?raw'
import fontSrc from '../../src/shell/font.ts?raw'
import renderSrc from '../../src/shell/render.ts?raw'
import {
  CELL_W,
  CELL_H,
  GLYPH_CHARS,
  hasGlyph,
  charGlyph,
  layoutText,
  type VecGlyph,
} from '../../src/shell/vecfont'

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

type XY = [number, number]

/** A glyph reduced to plain [x,y] polylines for structural comparison. */
function shape(g: VecGlyph): XY[][] {
  return g.strokes.map((s) => s.points.map((p) => [p.x, p.y] as XY))
}

function allPoints(g: VecGlyph): XY[] {
  return g.strokes.flatMap((s) => s.points.map((p) => [p.x, p.y] as XY))
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
const DIGITS = '0123456789'.split('')
// Characters our on-screen gameplay text actually uses (render.ts literals):
// the alphabet, digits, space, and the hyphen (HI-SCORE, "- NO SCORES YET -").
const REQUIRED = [...LETTERS, ...DIGITS, ' ', '-']

// Authentic ink strokes (y-up, baseline 0), accumulated from the ROM VCTR chains
// in the extract doc. These are the fidelity anchors.
const ROM = {
  A: [
    [[0, 0], [0, 16], [8, 24], [16, 16], [16, 0]],
    [[0, 8], [16, 8]],
  ] as XY[][],
  I: [
    [[0, 0], [16, 0]],
    [[8, 0], [8, 24]],
    [[16, 24], [0, 24]],
  ] as XY[][],
  O: [[[0, 0], [0, 24], [16, 24], [16, 0], [0, 0]]] as XY[][],
  R: [
    [[0, 0], [0, 24], [16, 24], [16, 12], [0, 12]],
    [[4, 12], [16, 0]],
  ] as XY[][],
  // CHAR.T: the `-8,0` move is BLANK (the book misprinted it as lit) — so the
  // stem and the top bar are two separate strokes, never joined.
  T: [
    [[8, 0], [8, 24]],
    [[0, 24], [16, 24]],
  ] as XY[][],
}

// ===========================================================================
// A. Module shape & the fixed cell
// ===========================================================================
describe('vecfont module shape (Story 10-13)', () => {
  it('exposes the authentic 16x24 glyph cell', () => {
    expect(CELL_W).toBe(16)
    expect(CELL_H).toBe(24)
  })

  it('declares its supported character set, including the full alphabet + digits', () => {
    for (const ch of [...LETTERS, ...DIGITS]) expect(GLYPH_CHARS).toContain(ch)
  })
})

// ===========================================================================
// B. Glyph-table completeness — every on-screen character renders
// ===========================================================================
describe('glyph table completeness (AC: alphabet/digits on a consistent cell)', () => {
  it('has a glyph for every required character (A-Z, 0-9, space, hyphen)', () => {
    for (const ch of REQUIRED) {
      expect(hasGlyph(ch), `hasGlyph(${JSON.stringify(ch)})`).toBe(true)
    }
  })

  it('returns a well-formed VecGlyph (strokes + numeric advance) for each', () => {
    for (const ch of REQUIRED) {
      const g = charGlyph(ch)
      expect(Array.isArray(g.strokes), `strokes array for ${JSON.stringify(ch)}`).toBe(true)
      expect(typeof g.advance).toBe('number')
      expect(g.advance).toBeGreaterThan(0)
    }
  })

  it('degrades gracefully: an unsupported char yields a blank glyph, never throws', () => {
    expect(() => charGlyph('~')).not.toThrow()
    expect(hasGlyph('~')).toBe(false)
    expect(charGlyph('~').strokes).toHaveLength(0) // blank: advances but draws nothing
  })
})

// ===========================================================================
// C. Authentic coordinates — the fidelity anchors (verbatim ROM)
// ===========================================================================
describe('authentic glyph geometry (verbatim ANVGAN.MAC)', () => {
  it('A — diagonal apex + crossbar, exactly two strokes', () => {
    expect(shape(charGlyph('A'))).toEqual(ROM.A)
  })

  it('I — bottom serif, stem, top serif: three separate strokes', () => {
    expect(shape(charGlyph('I'))).toEqual(ROM.I)
  })

  it('O — a single closed rectangle (first point === last)', () => {
    expect(shape(charGlyph('O'))).toEqual(ROM.O)
  })

  it('R — bowl + diagonal leg', () => {
    expect(shape(charGlyph('R'))).toEqual(ROM.R)
  })

  it('T — stem and top bar are NOT joined (corrects the book typo)', () => {
    expect(shape(charGlyph('T'))).toEqual(ROM.T)
  })

  it('the digit 0 is drawn with the letter-O routine (CHAR.0 = CHAR.O)', () => {
    expect(shape(charGlyph('0'))).toEqual(shape(charGlyph('O')))
  })
})

// ===========================================================================
// D. Consistent cell — every glyph lives in the same 16x24 box
// ===========================================================================
describe('consistent cell & spacing (AC: consistent cell; legible at all scales)', () => {
  it('keeps every glyph’s ink inside the [0,CELL_W] x [0,CELL_H] cell', () => {
    for (const ch of REQUIRED) {
      for (const [x, y] of allPoints(charGlyph(ch))) {
        expect(x, `x of ${JSON.stringify(ch)}`).toBeGreaterThanOrEqual(0)
        expect(x).toBeLessThanOrEqual(CELL_W)
        expect(y, `y of ${JSON.stringify(ch)}`).toBeGreaterThanOrEqual(0)
        expect(y).toBeLessThanOrEqual(CELL_H)
      }
    }
  })

  it('advances roughly one cell per glyph (monospace-ish, supports column alignment)', () => {
    for (const ch of REQUIRED) {
      const a = charGlyph(ch).advance
      expect(a).toBeGreaterThanOrEqual(CELL_W) // never overlaps the next glyph
      expect(a).toBeLessThanOrEqual(CELL_W * 2) // nor leaves a huge gap
    }
  })
})

// ===========================================================================
// E. Stroke-vector semantics — pen-up/pen-down, not a filled font
// ===========================================================================
describe('stroke-vector semantics (AC: stroked via the vector path)', () => {
  it('space draws no ink but still advances', () => {
    const sp = charGlyph(' ')
    expect(sp.strokes).toHaveLength(0)
    expect(sp.advance).toBeGreaterThanOrEqual(CELL_W)
  })

  it('every ink stroke is a polyline of at least two points', () => {
    for (const ch of REQUIRED) {
      for (const s of charGlyph(ch).strokes) {
        expect(s.points.length).toBeGreaterThanOrEqual(2)
      }
    }
  })

  it('a blank move starts a NEW stroke (glyphs are multi-stroke where the ROM lifts the pen)', () => {
    // A lifts the pen once (2 strokes); I twice (3 strokes). If blank moves were
    // not honoured these would collapse to a single tangled polyline.
    expect(charGlyph('A').strokes.length).toBe(2)
    expect(charGlyph('I').strokes.length).toBe(3)
  })
})

// ===========================================================================
// F. Layout — advancing a string across the consistent cell
// ===========================================================================
describe('layoutText (AC: renders strings on the consistent cell)', () => {
  it('lays out the empty string as nothing', () => {
    const { strokes, width } = layoutText('')
    expect(strokes).toHaveLength(0)
    expect(width).toBe(0)
  })

  it('advances each glyph by its width — total width is the sum of advances', () => {
    const expected = [...'TEMPEST'].reduce((w, ch) => w + charGlyph(ch).advance, 0)
    expect(layoutText('TEMPEST').width).toBeCloseTo(expected, 6)
  })

  it('positions later glyphs to the right (second char shifted by the first’s advance)', () => {
    const adv = charGlyph('I').advance
    const { strokes } = layoutText('II')
    // Two I's → six strokes; the rightmost ink must sit beyond the first cell.
    expect(strokes).toHaveLength(2 * charGlyph('I').strokes.length)
    const maxX = Math.max(...strokes.flatMap((s) => s.points.map((p) => p.x)))
    expect(maxX).toBeGreaterThanOrEqual(adv)
  })
})

// ===========================================================================
// G. Module rules — purity + the Hard Architectural Boundary + type safety
// ===========================================================================
describe('vecfont module rules (boundary + purity + type safety)', () => {
  it('is render-only: never imports from the sim/state/rules/rng/enemies core', () => {
    expect(vecfontSrc).not.toMatch(/from\s+['"]\.\.\/core\/(sim|state|rules|rng|enemies)/)
  })

  it('is pure: no Math.random, Date, or performance time in glyph geometry', () => {
    expect(vecfontSrc).not.toMatch(/Math\.random|Date\.now|new Date\(|performance\.now/)
  })

  it('uses no `as any` / @ts-ignore type-safety escapes (TS lang-review #1)', () => {
    expect(vecfontSrc).not.toMatch(/\bas any\b/)
    expect(vecfontSrc).not.toMatch(/@ts-ignore/)
  })

  it('is deterministic — same char in, identical glyph out across repeated calls', () => {
    expect(shape(charGlyph('S'))).toEqual(shape(charGlyph('S')))
    expect(shape(charGlyph('5'))).toEqual(shape(charGlyph('5')))
  })
})

// ===========================================================================
// H. No TTF dependency — the on-screen text uses the vector font
//    (AC: "All current on-screen gameplay text uses the vector font (no TTF)")
// ===========================================================================
describe('no TTF dependency (AC: drop the webfont)', () => {
  it('font.ts no longer loads a TTF FontFace', () => {
    expect(fontSrc).not.toMatch(/FontFace/)
    expect(fontSrc).not.toMatch(/\.ttf/)
    expect(fontSrc).not.toMatch(/VectorBattle/)
  })

  it('render.ts draws framing text through the vector font, not the TTF family', () => {
    // The vector path is wired in...
    expect(renderSrc).toMatch(/from\s+['"]\.\/vecfont['"]/)
    // ...and the old TTF family string is gone from the render path.
    expect(renderSrc).not.toMatch(/Vector Battle/)
  })
})
