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
// CORRECTIONS TO THE AUDIT (filed as session Delivery Findings — the tests below
// encode the CORRECTED geometry, not the finding's text):
//
//   [CORRECTION 1] V-017's CLAIM says TEMLIT "has SEVEN dedicated logo-letter
//   routines". It has FIVE (T:1318, E:1322, M:1329, P:1338, S:1344), called seven
//   times — "TEMPEST" reuses E and T. NOTE: the audit already caught this itself —
//   V-017's own reasoning carries a [CORRECTION] saying "'seven routines' should
//   read 'five routines called seven times'". The claim text was never updated to
//   match, so it is restated here; the credit is the audit's, not this story's.
//
//   [CORRECTION 2] V-017 says the layout "is NOT a straight baseline" and that
//   "'TEMP' sits low-left and 'EST' climbs up and right in a stair-step". IT DOES
//   NOT — and here the audit is wrong, including its [REFUTATION], which explicitly
//   concludes "so the 'stair-step, not a straight baseline' claim is real" after
//   observing that the `0F8,48` advance is "unambiguously up-and-right".
//
//   That inference does not hold, because it reads the ADVANCES without walking the
//   letter subroutines, which move the pen themselves: E ends 128 BELOW its origin,
//   P 56 above, T 128 above. The advances exactly COMPENSATE for that. Traced
//   through, all seven letters span exactly y=256..384 — one baseline, one cap
//   height. Per-letter origin / y-span:
//         T (-432,256) 256..384 │ E (-256,384) 256..384 │ M (-208,256) 256..384
//         P  (-28,256) 256..384 │ E  (204,384) 256..384 │ S  (238,296) 256..384
//         T  (454,256) 256..384
//   (The audit's reasoning gets one step closer — it notes the final `60,-60` jump
//   "drops back down", so the climb is not monotonic — but it is still describing
//   the PEN PATH, which does rise and fall, rather than the LETTER PLACEMENTS,
//   which do not.) The "stair-stepped alphabet" of the story title is the
//   LETTERFORMS (the back-slanted E, arms stepping left as they descend), NOT the
//   layout. A port built to the finding's text would introduce a NEW divergence.
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
import fxSrc from '../../src/shell/fx.ts?raw'
import titleLogoSrc from '../../src/shell/titleLogo.ts?raw'
import { charGlyph, layoutText } from '../../src/shell/font'
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

// (A normalised-radius "cover" check lived here. It only asked whether each ROM
// radius appeared SOMEWHERE in the port — which fabricated coordinates could satisfy,
// and which said nothing about angles. expectSameShape below subsumes it: it compares
// the clouds point-for-point in a canonical frame.)

// ---------------------------------------------------------------------------
// The implementation-vs-oracle comparison.
//
// THIS is what makes the suite bite. The ROM tables inside glyphs.ts are module-
// private, so the transcriptions in this file are a SEPARATE copy. Asserting the
// copy against itself proves nothing about the shipped code — the first cut of this
// file did exactly that, and the whole suite passed with the logo reimplemented as
// message-font text (found by the reviewer, mutation-tested). Every shape below is
// now pinned by comparing the FUNCTION'S OUTPUT to the oracle, point for point.
//
// A port stays free to pick any uniform scale, any translation, and either Y
// convention, so both clouds are normalised to a canonical frame (centre on the
// bbox centre, divide by the bbox height) and the oracle is offered in both Y
// orientations. Anything beyond that freedom — a different SHAPE — fails.
// ---------------------------------------------------------------------------
function canonicalCloud(pts: Pt[], flipY: boolean): string {
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2
  const h = span(ys) || 1
  return pts
    .map((p) => `${round((p.x - cx) / h)},${round(((p.y - cy) / h) * (flipY ? -1 : 1))}`)
    .sort()
    .join(' | ')
}

/** The port's cloud must equal the ROM oracle's, up to scale/translation/Y-flip. */
function expectSameShape(got: Pt[], oracle: Pt[], what: string): void {
  const g = canonicalCloud(got, false)
  const ok = g === canonicalCloud(oracle, false) || g === canonicalCloud(oracle, true)
  if (!ok) {
    // Surface a readable diff rather than two 800-char blobs.
    expect(`${what}: ${g}`).toBe(`${what}: ${canonicalCloud(oracle, false)}`)
  }
  expect(ok, `${what} does not match the ROM oracle's geometry`).toBe(true)
}

// ===========================================================================
// Authentic ROM vertex data (verbatim ALVROM.MAC, hex literals as written).
// ===========================================================================

// --- V-017: TEMLIT, ALVROM.MAC:1297-1351 (CM=1 CD=1 CB=6) ------------------
// The FIVE letter routines, as [dx, dy, lit] relative vectors (ALVROM.MAC:1318-1351).
type Vec = readonly [number, number, 0 | 1]
const LOGO_LETTERS = {
  T: [[0, 0x80, 1], [-0x50, 0, 0], [0xa0, 0, 1]], // 1318-1320
  E: [[-0x50, 0, 1], [-0x14, -0x40, 1], [0x70, 0, 1], [-0x70, 0, 0], [-0x14, -0x40, 1], [0x84, 0, 1]], // 1322-1327
  M: [[-0x20, 0, 1], [0x30, 0x80, 1], [0x10, 0, 1], [0x20, -0x58, 1], [0x20, 0x58, 1], [0x10, 0, 1], [0x30, -0x80, 1], [-0x20, 0, 1]], // 1329-1336
  P: [[-0x10, 0, 1], [0, 0x80, 1], [0x5c, 0, 1], [0x1a, -0x48, 1], [-0x76, 0, 1]], // 1338-1342
  S: [[-0x10, -0x28, 1], [0x90, 0, 1], [0, 0x38, 1], [-0x70, 0x20, 1], [0x10, 0x28, 1], [0x64, 0, 1], [-0x0c, -0x20, 1]], // 1344-1350
} satisfies Readonly<Record<string, readonly Vec[]>>
type LogoLetter = keyof typeof LOGO_LETTERS
// The TEMLIT body: after CNTR, an advance then a letter, ×7 (ALVROM.MAC:1303-1317).
const LOGO_SEQ: readonly (readonly [readonly [number, number], LogoLetter])[] = [
  [[-0x1b0, 0x100], 'T'], [[0x60, 0], 'E'], [[0x24, 0], 'M'], [[0x34, 0], 'P'],
  [[0xf8, 0x48], 'E'], [[0x16, 0x28], 'S'], [[0x60, -0x60], 'T'],
]
const LOGO_WORD = LOGO_SEQ.map(([, l]) => l).join('') // 'TEMPEST'

/** Map a cloud into the canonical frame used for every comparison below: centred on
 *  its bbox centre, divided by its bbox height. Scale/translation drop out; `flipY`
 *  offers the other Y convention. */
function toCanon(pts: Pt[], flipY = false): Pt[] {
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2
  const h = span(ys) || 1
  return pts.map((p) => ({ x: (p.x - cx) / h, y: ((p.y - cy) / h) * (flipY ? -1 : 1) }))
}

/** The ink of ONE letter, cut out of logoGlyph()'s OWN output.
 *
 *  The x-window comes from the ORACLE's trace and is applied to the SHIPPED glyph in
 *  the shared canonical frame — so if the glyph is not TEMLIT, the window catches the
 *  wrong ink and the caller's assertions fail. (A Y flip cannot affect an x-window,
 *  and an x mirror would already have failed `expectSameShape`.)
 *
 *  Only a letter with clear air either side is separable: the word's SECOND E is the
 *  one (P ends at x=74, the E spans 84..216, S starts at 222). T and the first E
 *  overlap, so they are not isolable this way. */
function letterPts(letter: LogoLetter): Pt[] {
  const traced = traceLogo()
  const xr = (pts: Pt[]): readonly [number, number] =>
    [Math.min(...pts.map((p) => p.x)), Math.max(...pts.map((p) => p.x))] as const
  const ranges = traced.map((t) => xr(t.pts))
  const i = traced.findIndex((t, k) => t.letter === letter &&
    ranges.every((r, j) => j === k || r[1] < ranges[k][0] || r[0] > ranges[k][1]))
  if (i < 0) throw new Error(`no cleanly isolable '${letter}' in TEMLIT — widen the window`)

  // The letter's x-window, expressed in the oracle's canonical frame…
  const offset = traced.slice(0, i).reduce((n, t) => n + t.pts.length, 0)
  const canonWord = toCanon(traced.flatMap((t) => t.pts))
  const canonLetter = canonWord.slice(offset, offset + traced[i].pts.length)
  const lo = Math.min(...canonLetter.map((p) => p.x))
  const hi = Math.max(...canonLetter.map((p) => p.x))

  // …cut out of the shipped glyph, in that same frame.
  return toCanon(allPoints(logoGlyph())).filter((p) => p.x >= lo - 1e-6 && p.x <= hi + 1e-6)
}

/** Walk TEMLIT exactly as the AVG would; returns each letter's placement + points. */
function traceLogo(): { letter: LogoLetter; origin: Pt; pts: Pt[] }[] {
  let x = 0
  let y = 0 // CNTR
  const out: { letter: LogoLetter; origin: Pt; pts: Pt[] }[] = []
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
// MSTAR2 — 20 dots, ALVROM.MAC:435-454.
const MSTAR2_ROM: readonly Pt[] = [
  { x: 0x8, y: 0x8 }, { x: -0x8, y: 0x10 }, { x: -0x18, y: -0x10 }, { x: 0x8, y: -0x28 },
  { x: 0x28, y: -0x8 }, { x: 0x20, y: 0x20 }, { x: 0x8, y: 0x38 }, { x: -0x20, y: 0x30 },
  { x: -0x40, y: 0x8 }, { x: -0x28, y: -0x40 }, { x: 0x34, y: -0x44 }, { x: 0x58, y: 0x18 },
  { x: 0x38, y: 0x50 }, { x: -0x10, y: 0x68 }, { x: -0x58, y: 0x28 }, { x: -0x58, y: -0x30 },
  { x: -0x38, y: -0x68 }, { x: 0x0, y: -0x78 }, { x: 0x60, y: -0x68 }, { x: 0x68, y: -0x30 },
]
// MSTAR3 — 21 dots (NOT 20 — see the correction below), ALVROM.MAC:459-479.
const MSTAR3_ROM: readonly Pt[] = [
  { x: 0x10, y: 0x10 }, { x: 0x0, y: 0x18 }, { x: -0x30, y: 0x8 }, { x: -0x18, y: -0x2c },
  { x: 0x28, y: -0x18 }, { x: 0x30, y: 0x8 }, { x: 0x38, y: 0x38 }, { x: 0x0, y: 0x48 },
  { x: -0x38, y: 0x28 }, { x: -0x40, y: -0x8 }, { x: -0x20, y: -0x58 }, { x: 0x20, y: -0x58 },
  { x: 0x50, y: -0x30 }, { x: 0x60, y: 0x20 }, { x: 0x2c, y: 0x64 }, { x: -0x20, y: 0x68 },
  { x: -0x64, y: 0x38 }, { x: -0x68, y: -0x8 }, { x: -0x60, y: -0x48 }, { x: -0x28, y: -0x78 },
  { x: 0x40, y: -0x78 },
]
// MSTAR4 — 20 dots, ALVROM.MAC:484-503.
const MSTAR4_ROM: readonly Pt[] = [
  { x: -0x8, y: -0x10 }, { x: 0x20, y: -0x10 }, { x: 0x20, y: 0x18 }, { x: -0x18, y: 0x20 },
  { x: -0x30, y: -0x10 }, { x: 0x10, y: -0x38 }, { x: 0x40, y: 0x0 }, { x: 0x20, y: 0x38 },
  { x: -0x20, y: 0x48 }, { x: -0x50, y: 0x10 }, { x: -0x38, y: -0x40 }, { x: 0x18, y: -0x4c },
  { x: 0x40, y: -0x38 }, { x: 0x68, y: 0x10 }, { x: 0x28, y: 0x58 }, { x: -0x38, y: 0x50 },
  { x: -0x70, y: 0x18 }, { x: -0x68, y: -0x18 }, { x: -0x58, y: -0x78 }, { x: 0x40, y: -0x60 },
]
// All four, in STAR1:-STAR4: order (ALVROM.MAC:512-515).
const MSTAR_ROM: readonly (readonly Pt[])[] = [MSTAR1_ROM, MSTAR2_ROM, MSTAR3_ROM, MSTAR4_ROM]
// NOTE — the audit's [REFUTATION] gloss "MSTAR2/3/4 also verified at 20 SCDOTs each"
// is WRONG: MSTAR3 has 21 (ALVROM.MAC:459-479, counted directly). The finding's
// ORIGINAL "20-22 SCDOTs each" range is the accurate framing. AC-2's "the ROM's 22
// dots" names MSTAR1 specifically — do NOT force all four to 22. [Filed as a session
// Delivery Finding.]
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

  it('IS TEMLIT: logoGlyph()\'s geometry matches the ROM oracle point-for-point', () => {
    // THE test for AC-1. Everything else about the logo is a corollary of this.
    // Compares the SHIPPED function's output against the independently-traced
    // TEMLIT walk, up to uniform scale / translation / Y-flip. A logo rebuilt from
    // the message font — the exact V-017 defect — cannot pass this.
    expectSameShape(allPoints(logoGlyph()), traceLogo().flatMap((l) => l.pts), 'logoGlyph')
  })

  it('keeps TEMLIT\'s beam-off SPLIT: 11 lit strokes, none bridging two letters', () => {
    // expectSameShape compares a SORTED POINT SET, so stroke connectivity is
    // invisible to it: returning the same vertices as ONE merged polyline
    // (LOGO_RUNS.flat()) passed every test here while drawing 10 spurious
    // inter-letter joins up to 258 units — twice the 128 cap height (found by the
    // reviewer, mutation-tested). Beam-on vs beam-off is the core semantic of the
    // vector data this story ports, and this file already pins it for the star
    // dots (points.length === 1); pin the logo's split the same way.
    //
    // The oracle knows the split: each letter is one lit run plus one more per
    // mid-letter beam-off (T's crossbar jump-back, E's arm jump-back).
    const expectSplit = LOGO_SEQ.map(([, l]) => 1 + LOGO_LETTERS[l].filter(([, , lit]) => lit === 0).length)
    expect(expectSplit, 'oracle self-check: T=2 E=2 M=1 P=1 E=2 S=1 T=2').toEqual([2, 2, 1, 1, 2, 1, 2])
    const g = logoGlyph()
    expect(g, 'TEMLIT splits into 11 lit runs at every beam-off').toHaveLength(11)

    // No stroke may bridge letters: every stroke's x-extent must fit inside ONE
    // letter's oracle x-window, in the shared canonical frame. A faithful stroke's
    // points are a subset of its letter's, so it always fits; a merged polyline
    // spans the word and fits nowhere. (A Y flip cannot affect an x-window, and an
    // x mirror already fails expectSameShape above.)
    const traced = traceLogo()
    const canonWord = toCanon(traced.flatMap((t) => t.pts))
    let wOff = 0
    const windows = traced.map((t) => {
      const win = canonWord.slice(wOff, wOff + t.pts.length)
      wOff += t.pts.length
      return [Math.min(...win.map((p) => p.x)), Math.max(...win.map((p) => p.x))] as const
    })
    const canonGlyph = toCanon(allPoints(g))
    let gOff = 0
    g.forEach((stroke, i) => {
      const pts = canonGlyph.slice(gOff, gOff + stroke.points.length)
      gOff += stroke.points.length
      const lo = Math.min(...pts.map((p) => p.x))
      const hi = Math.max(...pts.map((p) => p.x))
      const fits = windows.some(([wl, wh]) => lo >= wl - 1e-6 && hi <= wh + 1e-6)
      expect(fits, `stroke ${i} x-extent [${round(lo)}, ${round(hi)}] must sit inside one letter`).toBe(true)
    })
  })

  it('is NOT the message font — the logo\'s ink is not reproducible from layoutText', () => {
    // The DEFECT is drawGlowText(ctx,'TEMPEST',…) → the ordinary ANVGAN message
    // glyphs. Pin it directly: whatever logoGlyph() returns must NOT be the shape
    // the shared font produces for the same word.
    const fontWord = layoutText('TEMPEST').strokes
      .flatMap((s) => s.points.map((p) => ({ x: p.x, y: p.y })))
    expect(fontWord.length, 'the shared font can lay out TEMPEST').toBeGreaterThan(0)
    const logo = allPoints(logoGlyph())
    const same = canonicalCloud(logo, false) === canonicalCloud(fontWord, false) ||
      canonicalCloud(logo, false) === canonicalCloud(fontWord, true)
    expect(same, 'the logo must be TEMLIT\'s own alphabet, NOT the message font').toBe(false)

    // …and TEMLIT's E is structurally unlike the font's, in the one way that names
    // this story: the BACK-SLANT. The message font's E is a comb on a vertical
    // spine — its three arms all start at x=0 (verified: strokes (0,0)-(0,24)-(16,24),
    // (12,12)-(0,12), (0,0)-(16,0), so every left end is 0). TEMLIT's E has no spine
    // at all: its arms start at -80/-100/-120, stepping left as they descend.
    const fontE = charGlyph('E').strokes.flatMap((s) => s.points.map((p) => ({ x: p.x, y: p.y })))
    expect(fontE.length, 'font E has ink').toBeGreaterThan(0)
    // Distinct left-edge starts per arm level: 1 for a spine, 3 for a back-slant.
    const armLeftEnds = (pts: Pt[]): number[] => {
      const levels = [...new Set(pts.map((p) => round(p.y)))].sort((a, b) => a - b)
      return levels.map((lv) => Math.min(...pts.filter((p) => round(p.y) === lv).map((p) => p.x)))
    }
    const distinct = (a: number[]): number => new Set(a.map((v) => round(v))).size
    expect(distinct(armLeftEnds(fontE)), 'the font E is a comb on ONE spine').toBe(1)
    expect(distinct(armLeftEnds(letterPts('E'))), 'TEMLIT\'s E arms each start further left').toBe(3)
  })

  it('the E is BACK-SLANTED in the SHIPPED glyph — arms step sideways as they descend', () => {
    // ALVROM.MAC:1322-1327: arms at y=0/-64/-128, left ends -80/-100/-120 (a constant
    // -20 step), lengths 80/112/132. Read off logoGlyph()'s OWN output (the second E
    // of the word, isolated by x-window), not off this file's transcription — the
    // earlier version walked the local constant and passed even when the shipped
    // letterform was replaced with a symmetric stand-in.
    const pts = letterPts('E')
    const levels = [...new Set(pts.map((p) => round(p.y)))].sort((a, b) => a - b)
    expect(levels, 'the E has exactly three horizontal arm levels').toHaveLength(3)

    const armLen = levels.map((lv) => span(pts.filter((p) => round(p.y) === lv).map((p) => p.x)))
    const leftEnds = levels.map((lv) => Math.min(...pts.filter((p) => round(p.y) === lv).map((p) => p.x)))
    // Monotone widening 80 → 112 → 132 (order flips with the Y convention; either
    // direction is a monotone run, a symmetric E is not).
    const monotone = (a: number[]): boolean =>
      a.every((v, i) => i === 0 || v > a[i - 1]) || a.every((v, i) => i === 0 || v < a[i - 1])
    expect(monotone(armLen), `arms must widen monotonically, got ${armLen.map(round)}`).toBe(true)
    expect(monotone(leftEnds), `the left edge must step one way, got ${leftEnds.map(round)}`).toBe(true)
    // The step is CONSTANT — a linear back-slant, not a curve.
    const s1 = round(leftEnds[1] - leftEnds[0])
    const s2 = round(leftEnds[2] - leftEnds[1])
    expect(s1, 'the arms step sideways, not straight down').not.toBe(0)
    expect(Math.abs(s1 - s2), 'the step is constant — a linear back-slant').toBeLessThan(1e-3)
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

    // …and the SHIPPED glyph must land on one baseline too. Cut each letter's window
    // out of logoGlyph()'s own output (windows from the oracle) and require EVERY
    // letter to span the full height — a stagger would leave some letter short.
    const canonWord = toCanon(traced.flatMap((t) => t.pts))
    const canonGlyph = toCanon(allPoints(logoGlyph()))
    const H = span(canonGlyph.map((p) => p.y))
    expect(H, 'the logo has vertical extent').toBeGreaterThan(0)
    let offset = 0
    for (const t of traced) {
      const win = canonWord.slice(offset, offset + t.pts.length)
      offset += t.pts.length
      const lo = Math.min(...win.map((p) => p.x))
      const hi = Math.max(...win.map((p) => p.x))
      const ink = canonGlyph.filter((p) => p.x >= lo - 1e-6 && p.x <= hi + 1e-6)
      expect(ink.length, `${t.letter}: the shipped glyph has ink in this letter's window`).toBeGreaterThan(0)
      // Every TEMLIT letter is full cap height, so each window must span the word's
      // whole height. (T/E windows overlap, which only ADDS ink — never removes it —
      // so a short letter still fails.)
      expect(span(ink.map((p) => p.y)), `${t.letter} must span the full cap height — no stagger`)
        .toBeGreaterThan(0.98 * H)
    }
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

  it('every picture IS its ROM constellation — matched point-for-point, all four', () => {
    // THE test for AC-2. Was previously a radii-cover check on MSTAR1 only, which
    // fabricated coordinates could pass for 2/3/4 (found by the reviewer). Each
    // picture's actual dots are now pinned against their own oracle.
    MSTAR_ROM.forEach((rom, i) => {
      expectSameShape(allPoints(starPictureGlyph(i)), rom as Pt[], `MSTAR${i + 1}`)
    })
  })

  it('the four pictures share ONE scale — a plane must not resize when it recycles', () => {
    // The ROM's pictures are authored at a common scale; normalising each to its own
    // extent would make them jump size as a plane cycles between constellations.
    const romRatio = MSTAR_ROM.map((r) => Math.max(...r.map(radius)))
    const gotRatio = MSTAR_ROM.map((_, i) => Math.max(...allPoints(starPictureGlyph(i)).map(radius)))
    // Relative sizes must be preserved: got[i]/got[0] === rom[i]/rom[0].
    romRatio.forEach((_, i) => {
      expect(gotRatio[i] / gotRatio[0], `MSTAR${i + 1} keeps its size relative to MSTAR1`)
        .toBeCloseTo(romRatio[i] / romRatio[0], 5)
    })
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
    // (This asserted `renderSrc.length + glyphSrc.length > 0` — a no-op wearing a
    // regression test's name. Now it pins the actual off-by-one, mirroring the V-014
    // guard above: CB=07 for EXPL1 only, CB=0E from EXPL2 on, so ONLY frame 0 is dim.)
    expect(fxSrc, 'only frame 0 is dim — `frame < 2` was the DA-006 defect')
      .toMatch(/brightness\s*=\s*frame\s*<\s*1\s*\?\s*ENEMY_DIM\s*:\s*ENEMY_BRIGHT/)
    expect(fxSrc, 'the two-frame dim must stay gone').not.toMatch(/frame\s*<\s*2\s*\?\s*ENEMY_DIM/)
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
    // Scoped to THIS story's declarations. A bare /readonly/ matched anywhere in the
    // 700-line file, so stripping readonly off the new tables still passed.
    expect(glyphSrc, 'MSTAR is a readonly nested table').toMatch(/const MSTAR: readonly /)
    expect(glyphSrc, 'FUSE_SCORE_TIERS is readonly').toMatch(/FUSE_SCORE_TIERS: readonly number\[\]/)
    expect(glyphSrc, 'LOGO_SEQ is readonly').toMatch(/const LOGO_SEQ: readonly /)
    expect(glyphSrc, 'the letter table is deeply readonly via satisfies')
      .toMatch(/satisfies Readonly<Record<string, readonly LogoVec\[\]>>/)
  })

  it('all three new glyphs are deterministic across repeated calls (frame-exact)', () => {
    expect(fingerprint(logoGlyph())).toBe(fingerprint(logoGlyph()))
    expect(fingerprint(starPictureGlyph(0))).toBe(fingerprint(starPictureGlyph(0)))
    expect(fingerprint(fuseScoreGlyph(0))).toBe(fingerprint(fuseScoreGlyph(0)))
  })

  it('starPictureGlyph covers exactly the four ROM pictures (no 5th, no wrap-around lie)', () => {
    // TS lang-review #4 (out-of-range index → silent wrong value). This previously
    // only called 0..3 and never exercised the clamp it claimed to guard.
    expect(MSTAR_DOT_COUNTS).toHaveLength(4)
    for (let i = 0; i < 4; i++) expect(starPictureGlyph(i).length).toBeGreaterThan(0)
    // Out of range CLAMPS to the nearest real picture — it must not WRAP (picture 4
    // showing MSTAR1's 22 dots would be a silent lie about which constellation it is).
    expect(fingerprint(starPictureGlyph(4)), 'clamps up to MSTAR4').toBe(fingerprint(starPictureGlyph(3)))
    expect(fingerprint(starPictureGlyph(-1)), 'clamps down to MSTAR1').toBe(fingerprint(starPictureGlyph(0)))
    expect(fingerprint(starPictureGlyph(4)), 'does NOT wrap to MSTAR1').not.toBe(fingerprint(starPictureGlyph(0)))
    // Non-finite must not reach the table: Math.trunc/min/max propagate NaN, so an
    // unguarded clamp hands back NaN and the caller indexes `undefined`.
    expect(() => starPictureGlyph(NaN), 'NaN must not throw').not.toThrow()
    expect(starPictureGlyph(NaN).length, 'NaN resolves to a real picture').toBe(MSTAR_DOT_COUNTS[0])
    expect(() => starPictureGlyph(Infinity)).not.toThrow()
  })

  it('fuseScoreGlyph clamps its tier the same way — never an empty or wrong number', () => {
    expect(fingerprint(fuseScoreGlyph(3)), 'clamps up to the 250 tier').toBe(fingerprint(fuseScoreGlyph(2)))
    expect(fingerprint(fuseScoreGlyph(-1)), 'clamps down to the 750 tier').toBe(fingerprint(fuseScoreGlyph(0)))
    // NaN previously produced String(undefined) → 'undefined' → an all-blank glyph
    // (the font has no lowercase), i.e. an invisible pop-up rather than a number.
    expect(fuseScoreGlyph(NaN).length, 'NaN still draws a real number').toBeGreaterThan(0)
    expect(fingerprint(fuseScoreGlyph(NaN))).toBe(fingerprint(fuseScoreGlyph(0)))
  })
})
