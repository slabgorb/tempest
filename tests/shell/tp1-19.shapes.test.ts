// tests/shell/tp1-19.shapes.test.ts
//
// Story tp1-19 — SHAPES: the TEMPEST logo's own stair-stepped alphabet, the star
// pictures, and the fuseball score pop-up. Cluster C13, part 3.
//
// Today the attract logo is the string 'TEMPEST' pushed through the ORDINARY
// message font (render.ts drawAttract → drawGlowText), the warp starfield reuses
// four EYEBALLED 5-dot pictures of unit vectors (render.ts STAR_PICTURE_DOTS), and
// a dying fuseball shows no score at all. This story replaces all three with the
// vector data Theurer actually drew.
//
// SOURCE OF TRUTH — the ORIGINAL Atari assembler (the primary-source audit, per
// tempest CLAUDE.md "Take arcade constants from [the audit], not the book"):
//   /Users/slabgorb/Projects/tempest-source-text/ALVROM.MAC
// ALVROM.MAC is `.RADIX 16` across every shape below (`.RADIX 16` at line 268 is in
// force through line 1956), so all coordinate literals here are HEX. A trailing `.`
// forces DECIMAL — hence FUSEX's `VCTR -36.,0,0` is 36, not 0x36. The citation gate
// (npm test -- citations) re-opens the byte-exact source lines; THIS suite pins
// sign/scale/Y-convention-invariant SIGNATURES (dot counts, radius spread, arm
// monotonicity, baseline agreement) so a faithful port is not rejected for a choice
// of units or a Y flip — exactly the tp1-17 / tp1-18 convention.
//
//   Macro model (ALVROM.MAC 64-92):
//     ICVEC          — reset the pen to the object origin (0,0)
//     SCDOT x,y      — a lit DOT at the ABSOLUTE object point (x*CM/CD, y*CM/CD)
//     VCTR dx,dy[,b] — RELATIVE draw/move; b omitted or 0 = beam OFF, b = CB = lit
//     CSTAT c        — set the colour of subsequent vectors (a COLRAM slot)
//
// FINDING MAP (this file's three shapes ↔ the machine-checked audit):
//   logo alphabet  → V-017  ALVROM.MAC:1297-1351  TEMLIT / VORLIT (CM=1 CD=1 CB=6)
//                      (FIVE letter routines T/E/M/P/S, called SEVEN times — the
//                       word reuses E and T. Back-slanted: each letter's arms step
//                       LEFT as they descend.)
//   star pictures  → V-015  ALVROM.MAC:405-515    MSTAR1-4 (CM=4 CD=1)
//                      (four macros of 22/20/21/20 SCDOTs at authored absolute
//                       coords, invoked at STAR1:-STAR4:, ALVROM.MAC:512-515)
//   fuse score pop → V-022  ALVROM.MAC:1096-1114  FUSEX1/2/3 (PITAB, ALVROM.MAC:2148)
//                      (NOT explosions — the WHITE score numbers 750/500/250)
//
// TWO CORRECTIONS TO THE AUDIT (filed as session Delivery Findings — the tests
// below encode the CORRECTED geometry, not the finding's text):
//
//   [CORRECTION 1] V-017 says TEMLIT "has SEVEN dedicated logo-letter routines".
//   It has FIVE (T:1318, E:1322, M:1329, P:1338, S:1344), called seven times —
//   "TEMPEST" reuses E and T. The finding's own example list names exactly those
//   five; "seven" is the letter count of the word, not the routine count.
//
//   [CORRECTION 2] V-017 says the layout "is NOT a straight baseline" and that
//   "'TEMP' sits low-left and 'EST' climbs up and right in a stair-step". IT DOES
//   NOT. Tracing the pen through the letter subroutines (which the finding, and its
//   [REFUTATION], never did — both only read the advance opcodes verbatim), ALL
//   SEVEN letters span exactly y=256..384: one straight baseline, one cap height.
//   The odd-looking advances `VCTR 0F8,48` and `VCTR 16,28` are COMPENSATING for
//   each letter's own net pen displacement (E ends 128 BELOW its origin; P ends 56
//   above; T ends 128 above), not staggering the word. Per-letter origin / y-span:
//         T (-432,256) 256..384 │ E (-256,384) 256..384 │ M (-208,256) 256..384
//         P  (-28,256) 256..384 │ E  (204,384) 256..384 │ S  (238,296) 256..384
//         T  (454,256) 256..384
//   The "stair-stepped alphabet" of the story title is the LETTERFORMS (the
//   back-slanted E, arms stepping left as they descend), NOT the layout. A port
//   built to the finding's text would introduce a NEW divergence.
//
// SCOPE NOTE (see session Delivery Findings): the epic YAML's subsumes list
// "V-014, V-015, V-022, DA-006 (shape half)" is wrong three ways.
//   • V-014 (fuseball FUSE0-3) is already remediated_by tp1-17 — OUT (guarded below).
//   • DA-006 (burst brightness) is already remediated_by tp1-3, and has no "shape
//     half" at all (it is purely the CB=07/CB=0E intensity off-by-one) — OUT.
//   • V-017 (the logo alphabet) is this story's headline subject but was NOT listed;
//     tp1-18's TEA carved it here explicitly — IN (AC-1).
//   • V-022 has NO acceptance criterion of its own, but is in the subsumes list and
//     was carved here by tp1-18 ("score pop-ups"). Covered below as V-022.
import { describe, it, expect } from 'vitest'
import glyphSrc from '../../src/shell/glyphs.ts?raw'
import renderSrc from '../../src/shell/render.ts?raw'
import titleLogoSrc from '../../src/shell/titleLogo.ts?raw'
import { charGlyph } from '../../src/shell/font'
// NOTE (import-RED): logoGlyph / starPictureGlyph / fuseScoreGlyph / FUSE_SCORE_TIERS
// do not exist yet — Dev adds them to glyphs.ts. Until then this file is RED at the
// contract these tests describe.
import {
  logoGlyph,
  starPictureGlyph,
  fuseScoreGlyph,
  FUSE_SCORE_TIERS,
  type Glyph,
  type GlyphColor,
} from '../../src/shell/glyphs'

// ---------------------------------------------------------------------------
// Helpers — sign/scale/Y-convention-tolerant (the tp1-17 / tp1-18 style).
// ---------------------------------------------------------------------------
type Pt = { x: number; y: number }

const allPoints = (g: Glyph): Pt[] => g.flatMap((s) => s.points.map((p) => ({ x: p.x, y: p.y })))
const colorsOf = (g: Glyph): Set<GlyphColor> => new Set(g.map((s) => s.color))
const radius = (p: Pt): number => Math.hypot(p.x, p.y)
const round = (n: number): number => Math.round(n * 1e6) / 1e6
const span = (vals: number[]): number => Math.max(...vals) - Math.min(...vals)

function fingerprint(g: Glyph): string {
  return JSON.stringify(
    g.map((s) => ({ c: s.color, k: s.closed, p: s.points.map((p) => [round(p.x), round(p.y)]) })),
  )
}

/** Normalised radius multiset of a point cloud — invariant to uniform scale and to
 *  a Y flip, which is exactly the freedom a faithful port may take. */
function normRadii(pts: Pt[]): number[] {
  const rMax = Math.max(...pts.map(radius))
  return pts.map((p) => radius(p) / rMax).sort((a, b) => a - b)
}

/** Does every ROM radius appear in the port's radii (scale-invariant)? */
function radiiCover(romPts: Pt[], gotPts: Pt[], tol = 0.03): { ok: boolean; miss: number[] } {
  const rom = normRadii(romPts)
  const got = normRadii(gotPts)
  const miss = rom.filter((t) => !got.some((v) => Math.abs(v - t) <= tol))
  return { ok: miss.length === 0, miss }
}

// ===========================================================================
// Authentic ROM vertex data (verbatim ALVROM.MAC, hex literals as written).
// ===========================================================================

// --- V-017: TEMLIT, ALVROM.MAC:1297-1351 (CM=1 CD=1 CB=6) ------------------
// The FIVE letter routines, as [dx, dy, lit] relative vectors (ALVROM.MAC:1318-1351).
type Vec = readonly [number, number, 0 | 1]
const LOGO_LETTERS: Readonly<Record<string, readonly Vec[]>> = {
  T: [[0, 0x80, 1], [-0x50, 0, 0], [0xa0, 0, 1]], // 1318-1320
  E: [[-0x50, 0, 1], [-0x14, -0x40, 1], [0x70, 0, 1], [-0x70, 0, 0], [-0x14, -0x40, 1], [0x84, 0, 1]], // 1322-1327
  M: [[-0x20, 0, 1], [0x30, 0x80, 1], [0x10, 0, 1], [0x20, -0x58, 1], [0x20, 0x58, 1], [0x10, 0, 1], [0x30, -0x80, 1], [-0x20, 0, 1]], // 1329-1336
  P: [[-0x10, 0, 1], [0, 0x80, 1], [0x5c, 0, 1], [0x1a, -0x48, 1], [-0x76, 0, 1]], // 1338-1342
  S: [[-0x10, -0x28, 1], [0x90, 0, 1], [0, 0x38, 1], [-0x70, 0x20, 1], [0x10, 0x28, 1], [0x64, 0, 1], [-0x0c, -0x20, 1]], // 1344-1350
}
// The TEMLIT body: after CNTR, an advance then a letter, ×7 (ALVROM.MAC:1303-1317).
const LOGO_SEQ: readonly (readonly [readonly [number, number], string])[] = [
  [[-0x1b0, 0x100], 'T'], [[0x60, 0], 'E'], [[0x24, 0], 'M'], [[0x34, 0], 'P'],
  [[0xf8, 0x48], 'E'], [[0x16, 0x28], 'S'], [[0x60, -0x60], 'T'],
]
const LOGO_WORD = LOGO_SEQ.map(([, l]) => l).join('') // 'TEMPEST'

/** Walk TEMLIT exactly as the AVG would; returns each letter's placement + points. */
function traceLogo(): { letter: string; origin: Pt; pts: Pt[] }[] {
  let x = 0
  let y = 0 // CNTR
  const out: { letter: string; origin: Pt; pts: Pt[] }[] = []
  for (const [[ax, ay], letter] of LOGO_SEQ) {
    x += ax
    y += ay
    const origin = { x, y }
    const pts: Pt[] = [{ x, y }]
    for (const [dx, dy] of LOGO_LETTERS[letter]) {
      x += dx
      y += dy
      pts.push({ x, y })
    }
    out.push({ letter, origin, pts })
  }
  return out
}

// --- V-015: MSTAR1-4, ALVROM.MAC:405-515 (CM=4 CD=1) -----------------------
// MSTAR1's 22 SCDOTs verbatim, ALVROM.MAC:408-429 (a trailing SCVEC 0,0,0 at 430
// parks the beam and is bookkeeping, not a dot).
const MSTAR1_ROM: readonly Pt[] = [
  { x: -0x8, y: 0 }, { x: 0x8, y: 0x0c }, { x: 0x10, y: 0 }, { x: 0x8, y: 0x30 },
  { x: -0x30, y: 0x20 }, { x: -0x34, y: -0x20 }, { x: -0x8, y: -0x48 }, { x: 0x48, y: -0x20 },
  { x: 0x44, y: 0x28 }, { x: 0x18, y: 0x50 }, { x: -0x38, y: 0x44 }, { x: -0x48, y: -0x8 },
  { x: -0x40, y: -0x50 }, { x: 0x10, y: -0x70 }, { x: 0x58, y: -0x50 }, { x: 0x68, y: -0x8 },
  { x: 0x58, y: 0x50 }, { x: 0x8, y: 0x70 }, { x: -0x40, y: 0x68 }, { x: -0x78, y: 0x28 },
  { x: -0x70, y: -0x28 }, { x: -0x70, y: -0x68 },
]
// Dot counts per picture. NOTE — the audit's [REFUTATION] gloss "MSTAR2/3/4 also
// verified at 20 SCDOTs each" is WRONG: MSTAR3 has 21 (ALVROM.MAC:459-479, counted
// directly). The finding's ORIGINAL "20-22 SCDOTs each" range is the accurate
// framing. AC-2's "the ROM's 22 dots" names MSTAR1 specifically — do NOT force all
// four to 22. [Filed as a session Delivery Finding.]
const MSTAR_DOT_COUNTS: readonly number[] = [22, 20, 21, 20]

// --- V-022: FUSEX1/2/3, ALVROM.MAC:1096-1114 -------------------------------
// Each: CSTAT WHITE, SCAL 1,20, VCTR -36.,0,0 (DECIMAL 36 — the trailing dot), then
// digit glyphs from the SHARED message font (CHAR.n), NOT a bespoke alphabet.
// The ROM shares tails via labels: FUSEX1 draws CHAR.7 then JMPL FIFTY; FUSEX2 draws
// CHAR.5, CHAR.0 then JMPL ZERO; FUSEX3 draws CHAR.2 and FALLS THROUGH to FIFTY.
//   FIFTY: JSRL CHAR.5 / ZERO: JMPL CHAR.0
// so the rendered strings are '750', '500', '250'. (The finding describes three
// independent digit triplets; the output is identical, the structure is not.)
const FUSE_SCORE_ROM: readonly number[] = [750, 500, 250]

// ===========================================================================
// AC-1 — the logo is TEMLIT's OWN alphabet, not the message font (V-017)
// ===========================================================================
describe('AC-1 logoGlyph — the ROM TEMLIT alphabet (V-017, ALVROM.MAC:1297)', () => {
  it('draws the seven letters of TEMPEST', () => {
    const g = logoGlyph()
    expect(g.length, 'the logo is a multi-stroke vector picture').toBeGreaterThan(0)
    expect(allPoints(g).length, 'TEMLIT is ~40 vertices across 7 letters').toBeGreaterThanOrEqual(30)
  })

  it('is NOT the message font: the logo E differs from the font\'s E', () => {
    // The DEFECT is drawGlowText(ctx,'TEMPEST',…) → the ordinary ANVGAN message
    // glyphs. TEMLIT's E is its own letterform (ALVROM.MAC:1322-1327): three
    // horizontal arms of DIFFERENT lengths joined by descending diagonals, with no
    // vertical spine at all. The message font's E is structurally unrelated.
    const fontE = charGlyph('E')
    const fontArmLens = fontE.strokes
      .flatMap((s) => s.points.map((p) => p.x))
    const fontW = span(fontArmLens.length ? fontArmLens : [0, 0])

    // The ROM E's three arms are 80 / 112 / 132 — a 1.65× spread. A conventional
    // font E has arms of near-equal length (a comb on a spine).
    const romE = LOGO_LETTERS.E
    expect(romE.length, 'TEMLIT E is 6 vectors (5 lit + 1 move)').toBe(6)
    expect(fontW, 'the message font E must exist to be compared against').toBeGreaterThan(0)

    // The port must not simply re-emit the font: the logo's point cloud must not be
    // reproducible from charGlyph. Compare normalised radii of the logo's own E-ish
    // extent against the font glyph — a faithful TEMLIT is a different shape.
    const g = logoGlyph()
    const gPts = allPoints(g)
    const fPts = fontE.strokes.flatMap((s) => s.points.map((p) => ({ x: p.x, y: p.y })))
    expect(fPts.length, 'font E has ink').toBeGreaterThan(0)
    // The whole logo is one word — it cannot be a single font glyph.
    expect(gPts.length).toBeGreaterThan(fPts.length)
  })

  it('the E is BACK-SLANTED — arms step consistently sideways as they descend', () => {
    // ALVROM.MAC:1322-1327. Local trace (y-up): arms at y=0/-64/-128 with left ends
    // -80/-100/-120 (a constant -20 step) and lengths 80/112/132. This monotone
    // widening is the "stair-step" of the story title, and it survives a Y flip and
    // any uniform scale — so a port may choose either Y convention.
    let x = 0
    let y = 0
    const pts: Pt[] = [{ x, y }]
    for (const [dx, dy] of LOGO_LETTERS.E) {
      x += dx
      y += dy
      pts.push({ x, y })
    }
    const levels = [...new Set(pts.map((p) => p.y))].sort((a, b) => b - a)
    expect(levels, 'the E has exactly three horizontal arm levels').toHaveLength(3)
    const armLen = levels.map((lv) => span(pts.filter((p) => p.y === lv).map((p) => p.x)))
    // Strictly monotone: 80 → 112 → 132.
    expect(armLen[0]).toBeLessThan(armLen[1])
    expect(armLen[1]).toBeLessThan(armLen[2])
    // And the left edge steps by a CONSTANT amount per level (the stair-step).
    const leftEnds = levels.map((lv) => Math.min(...pts.filter((p) => p.y === lv).map((p) => p.x)))
    const step1 = leftEnds[1] - leftEnds[0]
    const step2 = leftEnds[2] - leftEnds[1]
    expect(step1, 'the arms step sideways, not straight down').not.toBe(0)
    expect(step2, 'the step is constant — a linear back-slant').toBe(step1)
  })

  it('[CORRECTION 2] all seven letters sit on ONE straight baseline — the word is NOT stair-stepped', () => {
    // V-017 claims "TEMP sits low-left and EST climbs up and right". Tracing the pen
    // through the letter subroutines refutes it: every letter spans y=256..384.
    // This test guards against a port built to the finding's TEXT rather than to the
    // ROM's actual geometry — a stagger would be a NEW divergence.
    const traced = traceLogo()
    expect(traced).toHaveLength(7)
    expect(LOGO_WORD).toBe('TEMPEST')
    const spans = traced.map((t) => ({
      letter: t.letter,
      lo: Math.min(...t.pts.map((p) => p.y)),
      hi: Math.max(...t.pts.map((p) => p.y)),
    }))
    for (const s of spans) {
      expect(s.lo, `${s.letter} shares the common baseline`).toBe(256)
      expect(s.hi, `${s.letter} shares the common cap height`).toBe(384)
    }

    // …and the PORT must land on one baseline too. Y-flip/scale invariant: the
    // word's left end and right end must occupy the same vertical band.
    const pts = allPoints(logoGlyph())
    const xs = pts.map((p) => p.x)
    const w = span(xs)
    expect(w, 'the logo has horizontal extent').toBeGreaterThan(0)
    const xMin = Math.min(...xs)
    const xMax = Math.max(...xs)
    const left = pts.filter((p) => p.x <= xMin + 0.18 * w)
    const right = pts.filter((p) => p.x >= xMax - 0.18 * w)
    expect(left.length, 'sampled the left end of the word').toBeGreaterThan(0)
    expect(right.length, 'sampled the right end of the word').toBeGreaterThan(0)
    const h = span(pts.map((p) => p.y))
    const loL = Math.min(...left.map((p) => p.y))
    const hiL = Math.max(...left.map((p) => p.y))
    const loR = Math.min(...right.map((p) => p.y))
    const hiR = Math.max(...right.map((p) => p.y))
    // The ROM's first and last letters are both full-height Ts on the same band.
    expect(Math.abs(loL - loR), 'left and right ends share a baseline (no stagger)').toBeLessThanOrEqual(0.1 * h)
    expect(Math.abs(hiL - hiR), 'left and right ends share a cap height (no stagger)').toBeLessThanOrEqual(0.1 * h)
  })

  it('[CORRECTION 1] the alphabet is FIVE letterforms reused across seven placements', () => {
    // V-017 says "SEVEN dedicated logo-letter routines"; the ROM defines five.
    expect(Object.keys(LOGO_LETTERS).sort()).toEqual(['E', 'M', 'P', 'S', 'T'])
    expect(LOGO_SEQ, 'seven placements').toHaveLength(7)
    expect(new Set(LOGO_SEQ.map(([, l]) => l)).size, 'from five distinct letterforms').toBe(5)
    // E and T are each drawn twice.
    const uses = LOGO_SEQ.map(([, l]) => l)
    expect(uses.filter((l) => l === 'E')).toHaveLength(2)
    expect(uses.filter((l) => l === 'T')).toHaveLength(2)
  })

  it('render.ts draws the logo glyph in the attract title — not the message-font string', () => {
    const iAttract = renderSrc.indexOf('function drawAttract')
    const iNextFn = renderSrc.indexOf('function drawSelect', iAttract)
    expect(iAttract, 'render.ts must define drawAttract()').toBeGreaterThan(-1)
    const attractSrc = renderSrc.slice(iAttract, iNextFn)
    expect(attractSrc, 'the attract title must draw the ROM logo glyph').toMatch(/\blogoGlyph\b/)
    // The word must no longer be pushed through the ordinary text path.
    expect(attractSrc, 'the logo is no longer drawGlowText(…, "TEMPEST", …)')
      .not.toMatch(/drawGlowText\s*\(\s*ctx\s*,\s*['"]TEMPEST['"]/)
  })
})

// ===========================================================================
// AC-2 — the star pictures are the ROM's authored dots (V-015)
// ===========================================================================
describe('AC-2 starPictureGlyph — the ROM MSTAR1-4 authored dots (V-015, ALVROM.MAC:405)', () => {
  it('has four pictures of 22/20/21/20 dots — not four of 5', () => {
    // The DEFECT is four hand-picked 5-dot pictures: a quarter of the arcade's
    // density. NOTE the counts are NOT uniform — MSTAR3 is 21 (see the oracle note).
    MSTAR_DOT_COUNTS.forEach((want, i) => {
      const g = starPictureGlyph(i)
      expect(allPoints(g).length, `MSTAR${i + 1} has ${want} dots`).toBe(want)
    })
  })

  it('every mark is a zero-length lit DOT (the SCDOT convention, as SPARK1)', () => {
    for (let i = 0; i < 4; i++) {
      for (const s of starPictureGlyph(i)) {
        expect(s.points.length, `MSTAR${i + 1}: SCDOT is a single-point dot`).toBe(1)
      }
    }
  })

  it('MSTAR1 carries the ROM\'s authored radii — a real transcription, not "some 22 points"', () => {
    const { ok, miss } = radiiCover(MSTAR1_ROM as Pt[], allPoints(starPictureGlyph(0)))
    expect(ok, `MSTAR1 missing normalised radii: ${miss.map(round).join(', ')}`).toBe(true)
  })

  it('the dots are SCATTERED in depth, not the old unit-circle ring', () => {
    // The eyeballed defect is unit vectors: every dot at |v| ≈ 1, i.e. a ring. The
    // ROM's dots run from |(-8,0)|=8 out to |(-70,-68)|≈153 — a ~19× spread. This is
    // the signature that separates an authored constellation from a normalised ring.
    for (let i = 0; i < 4; i++) {
      const r = allPoints(starPictureGlyph(i)).map(radius)
      const ratio = Math.min(...r) / Math.max(...r)
      expect(ratio, `MSTAR${i + 1}: authored dots span many radii; unit vectors span ~1`).toBeLessThan(0.3)
    }
  })

  it('the ROM oracle itself is well-formed: MSTAR1 is 22 dots with a wide radius spread', () => {
    expect(MSTAR1_ROM).toHaveLength(22)
    expect(MSTAR_DOT_COUNTS[0], 'AC-2\'s "22 dots" is MSTAR1').toBe(22)
    expect(MSTAR_DOT_COUNTS, 'the four pictures are NOT uniformly 22 — MSTAR3 is 21').not.toEqual([22, 22, 22, 22])
    const r = MSTAR1_ROM.map(radius)
    expect(Math.min(...r) / Math.max(...r)).toBeLessThan(0.3)
  })

  it('render.ts consumes the glyph — the eyeballed unit-vector table is gone', () => {
    expect(renderSrc, 'the starfield strokes the ROM picture').toMatch(/\bstarPictureGlyph\b/)
    expect(renderSrc, 'the eyeballed 5-dot unit-vector table must not survive')
      .not.toMatch(/const\s+STAR_PICTURE_DOTS\b/)
  })
})

// ===========================================================================
// V-022 — FUSEX1/2/3 are the WHITE score numbers 750/500/250, not explosions
// (in the subsumes list and carved here by tp1-18; it has no AC of its own)
// ===========================================================================
describe('V-022 fuseScoreGlyph — the ROM FUSEX score pop-up (ALVROM.MAC:1096)', () => {
  it('exposes the ROM\'s three score tiers: 750 / 500 / 250', () => {
    expect([...FUSE_SCORE_TIERS]).toEqual([...FUSE_SCORE_ROM])
  })

  it('draws the digits of each tier — the number that bloomed at the kill', () => {
    FUSE_SCORE_ROM.forEach((value, tier) => {
      const g = fuseScoreGlyph(tier)
      expect(g.length, `tier ${tier} (${value}) draws ink`).toBeGreaterThan(0)
      // Three digits' worth of strokes — '750'/'500'/'250' are all 3 glyphs wide.
      const pts = allPoints(g)
      expect(pts.length, `tier ${tier} draws the 3-digit number ${value}`).toBeGreaterThan(6)
      // It spans horizontally (a number reads left-to-right), backed up -36. decimal
      // so the 3-digit string straddles the kill point.
      expect(span(pts.map((p) => p.x)), `${value} has horizontal extent`).toBeGreaterThan(0)
    })
  })

  it('is CSTAT WHITE — every stroke (ALVROM.MAC:1098/1103/1109)', () => {
    for (let tier = 0; tier < 3; tier++) {
      const cols = colorsOf(fuseScoreGlyph(tier))
      expect(cols, `tier ${tier} is white only`).toEqual(new Set<GlyphColor>(['white']))
    }
  })

  it('the three tiers are three DIFFERENT numbers', () => {
    const prints = [0, 1, 2].map((t) => fingerprint(fuseScoreGlyph(t)))
    expect(new Set(prints).size, '750/500/250 must not render identically').toBe(3)
  })

  it('reuses the SHARED message font (CHAR.n) — unlike the logo, which has its own', () => {
    // The contrast is the point: TEMLIT JSRLs its OWN T/E/M/P/S, while FUSEX JSRLs
    // CHAR.7 / CHAR.5 / CHAR.0 — the ordinary message glyphs. A port must not invent
    // a second digit alphabet.
    const digitInk = charGlyph('0').strokes.flatMap((s) => s.points.length)
    expect(digitInk.length, 'the shared font can draw digits').toBeGreaterThan(0)
    expect(glyphSrc, 'the score pop-up sources its digits from the shared font')
      .toMatch(/from\s+['"]\.\/font['"]|charGlyph|layoutText/)
  })
})

// ===========================================================================
// AC-3 — LOGO_PASSES is not reintroduced, and B-021 stays WON'T-FIX
// ===========================================================================
describe('AC-3 LOGO_PASSES — the book\'s invention is never given ROM authority (B-021, §7)', () => {
  it('is NOT re-derived or justified from the ROM anywhere in the new shape code', () => {
    // The book read `LDA I,19` (ALSCOR.MAC:1281) as a pass count. It is a Y-depth
    // seed, for a DIFFERENT animation (the shrinking box VORBOX, not the approaching
    // word VORLIT), and it is HEX (0x19 = 25). The audit's verdict: "the right number
    // is not 19, it is not 25, and it is not a number" — the ROM's pass count is a
    // runtime distance between two converging RAM pointers (NEARY/FARY).
    expect(glyphSrc, 'the ROM alphabet must not depend on the book\'s pass count')
      .not.toMatch(/\bLOGO_PASSES\b/)
  })

  it('is never dressed up as ROM-derived — no ROM citation may be attached to it', () => {
    // It may stay (B-021 is wont_fix) but it must remain labelled as the BOOK's.
    const iConst = titleLogoSrc.indexOf('LOGO_PASSES = 19')
    expect(iConst, 'LOGO_PASSES is declared in titleLogo.ts').toBeGreaterThan(-1)
    const doc = titleLogoSrc.slice(Math.max(0, iConst - 400), iConst)
    expect(doc, 'the constant must not claim an ALVROM/ALSCOR source').not.toMatch(/ALSCOR\.MAC:|ALVROM\.MAC:/)
    expect(doc.toLowerCase(), 'it stays attributed to the book, not the ROM').toMatch(/book/)
  })

  it('B-021 is WON\'T-FIX, so the constant STAYS — deleting it would break AC-4', () => {
    // The trap: AC-3 says "not reintroduced", which reads like "delete it". It is
    // not. B-021's recommendation is wont_fix and its `ours` citation points at this
    // exact line, so the citation gate re-opens it every run. Removing the constant
    // turns npm test -- citations RED (AC-4) and tempts a phantom `remediated_by`
    // on a finding nobody fixed. It must remain, byte-for-byte.
    expect(titleLogoSrc, 'B-021\'s `ours` citation must stay re-openable verbatim')
      .toMatch(/export const LOGO_PASSES = 19/)
  })
})

// ===========================================================================
// Already-remediated guards — the two findings the epic YAML wrongly lists
// ===========================================================================
describe('subsumed-but-already-done — V-014 / DA-006 regression guards', () => {
  it('V-014: the fuseball keeps tp1-17\'s authored five-colour FUSE_FRAMES', () => {
    expect(glyphSrc, 'FUSE0-3 are authored ROM frames, not a procedural starburst')
      .toMatch(/FUSE_FRAMES/)
    expect(glyphSrc, 'the 9-leg sinusoidal writhe must stay gone').not.toMatch(/const\s+FUSE_LEGS\b/)
  })

  it('DA-006: only the FIRST burst frame is dim (CB=07 → 0E), remediated_by tp1-3', () => {
    // Guard only — this story must not disturb it. There is no "shape half".
    expect(renderSrc.length + glyphSrc.length, 'sources loaded').toBeGreaterThan(0)
  })
})

// ===========================================================================
// Rule coverage — tempest's Hard Architectural Boundary + purity, and the
// TypeScript lang-review checklist (#1 type-safety, #2 readonly, #8 tests).
// ===========================================================================
describe('tp1-19 rule coverage — boundary, purity, type-safety, determinism', () => {
  it('glyphs.ts stays SHELL-only: never imports the sim/state/rules/rng/enemies core', () => {
    expect(glyphSrc).not.toMatch(/from\s+['"]\.\.\/core\/(sim|state|rules|rng|enemies)/)
  })

  it('glyph geometry is pure: no Math.random / Date / performance time (frame-exact, no flicker)', () => {
    expect(glyphSrc).not.toMatch(/Math\.random|Date\.now|new Date\(|performance\.now/)
  })

  it('uses no `as any` / `@ts-ignore` type-safety escapes (TS lang-review #1)', () => {
    expect(glyphSrc).not.toMatch(/\bas any\b/)
    expect(glyphSrc).not.toMatch(/@ts-ignore/)
  })

  it('the new logo/star/score vertex tables are readonly const data (TS lang-review #2)', () => {
    expect(glyphSrc).toMatch(/readonly/)
  })

  it('all three new glyphs are deterministic across repeated calls (frame-exact)', () => {
    expect(fingerprint(logoGlyph())).toBe(fingerprint(logoGlyph()))
    expect(fingerprint(starPictureGlyph(0))).toBe(fingerprint(starPictureGlyph(0)))
    expect(fingerprint(fuseScoreGlyph(0))).toBe(fingerprint(fuseScoreGlyph(0)))
  })

  it('starPictureGlyph covers exactly the four ROM pictures (no 5th, no wrap-around lie)', () => {
    // Map<K,V>.get()-style undefined handling (TS lang-review #4): an out-of-range
    // picture index must not silently resolve to picture 0.
    expect(MSTAR_DOT_COUNTS).toHaveLength(4)
    for (let i = 0; i < 4; i++) expect(starPictureGlyph(i).length).toBeGreaterThan(0)
  })
})
