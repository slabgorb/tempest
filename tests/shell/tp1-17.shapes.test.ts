// tests/shell/tp1-17.shapes.test.ts
//
// Story tp1-17 — SHAPES: the tanker, spiker, fuseball and player charge, drawn
// from the ROM's vertex data. Cluster C13, part 1.
//
// The four enemy/player glyphs in src/shell/glyphs.ts are, today, EYEBALLED
// procedural approximations authored at Story 6-8 time (before the primary-source
// audit). This story replaces each with the vertex data Theurer actually drew,
// transcribed byte-exact from the original 1981 Atari source and CITED (AC-5:
// "TRANSCRIBED from the ROM and cited, never eyeballed").
//
// SOURCE OF TRUTH — the ORIGINAL Atari assembler (the primary-source audit, per
// tempest CLAUDE.md "Take arcade constants from [the audit], not the book"):
//   /Users/slabgorb/Projects/tempest-source-text/ALVROM.MAC  (TEMPEST_SOURCE_DIR)
// ALVROM.MAC is `.RADIX 16` across every shape below (the only RADIX-10 window is
// lines 242-268), so all coordinate literals here are HEX decoded to decimal.
//
//   Macro model (ALVROM.MAC 64-92):
//     ICVEC          — reset the pen to the object origin (0,0)
//     SCVEC x,y[,b]  — draw/move to the ABSOLUTE object point (x*CM/CD, y*CM/CD);
//                      b omitted or 0 = beam OFF (a positioning move, not a line)
//     SCDOT x,y      — a beam-off move to (x,y) + one zero-length lit DOT there
//     CSTAT c        — set the colour of subsequent vectors
//
// FINDING MAP (this file's four shapes ↔ the machine-checked audit):
//   tanker body  → V-006  ALVROM.MAC:651  GENTNK  (17-vertex laced double diamond)
//   spiker       → V-008  ALVROM.MAC:522  SPIRA1-4 (GREEN 21-point authored spirals)
//   fuseball     → V-014  ALVROM.MAC:975  FUSE0-3  (5-colour authored scribbles)
//   player charge→ V-010  ALVROM.MAC:385  DIARA2   (17 dots, two rings)
//              and DA-004 ALVROM.MAC:384           (only the INNER ring ammo-tinted)
//
// SCOPE NOTE (see session Delivery Findings): the story description's finding
// range "V-005..V-010, DA-004" is imprecise. The four ACs cover exactly the four
// shapes above; the fuseball's finding is V-014 (OUTSIDE that range), while V-005
// (pulsar bar), V-007 (tanker CARGO emblems) and V-009 (enemy shot) fall inside
// the range but are NOT named by any AC — they are out of scope here.
import { describe, it, expect } from 'vitest'
import glyphSrc from '../../src/shell/glyphs.ts?raw'
import {
  tankerGlyph,
  spikerGlyph,
  fuseballGlyph,
  playerBulletGlyph,
  type Glyph,
  type GlyphColor,
} from '../../src/shell/glyphs'

// ---------------------------------------------------------------------------
// Helpers — all sign/scale/rotation-tolerant, so a faithful port is not rejected
// for a choice of units or Y-convention (the repo Y-flips some shapes and not
// others: CLAW_DELTAS "no y-flip", LIFE1 "Y is NEGATED").
// ---------------------------------------------------------------------------
type Pt = { x: number; y: number }

const allPoints = (g: Glyph): Pt[] => g.flatMap((s) => s.points.map((p) => ({ x: p.x, y: p.y })))
const colorsOf = (g: Glyph): Set<GlyphColor> => new Set(g.map((s) => s.color))
const radius = (p: Pt): number => Math.hypot(p.x, p.y)

// A stable per-frame signature (rounded so float jitter from a rotation does not
// read as "different"), for asserting distinctness / rotation-equality.
function fingerprint(g: Glyph): string {
  return JSON.stringify(g.map((s) => ({ c: s.color, k: s.closed, p: s.points.map((p) => [round(p.x), round(p.y)]) })))
}
const round = (n: number): number => Math.round(n * 1e6) / 1e6

// Sorted radii normalised to the largest — a rotation/reflection/Y-flip/order and
// scale invariant fingerprint of "which 21 points is this?".
function normalisedRadiiSorted(pts: readonly Pt[]): number[] {
  const r = pts.map(radius)
  const max = Math.max(...r)
  return r.map((v) => v / max).sort((a, b) => a - b)
}
function radiiMatch(a: number[], b: number[], tol = 0.02): boolean {
  if (a.length !== b.length) return false
  return a.every((v, i) => Math.abs(v - b[i]) <= tol)
}

function bbox(pts: readonly Pt[]): { w: number; h: number } {
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
}

// ---------------------------------------------------------------------------
// Authentic ROM vertex data (verbatim ALVROM.MAC, hex → decimal)
// ---------------------------------------------------------------------------

// SPIRA1 — 21 SCVEC absolute vertices, ALVROM.MAC:524-544 (CM=2). Radii wind
// strictly outward. All four frames SPIRA1-4 share these radii (they are the same
// spiral advanced a quarter turn), so the radius signature = "a real 21-pt spiral".
const SPIRA1_ROM: Pt[] = [
  [1, -1], [0, -2], [-2, -2], [-4, 0], [-4, 4], [0, 6], [5, 5], [8, 0], [7, -7], [0, -0x0a], [-8, -8],
  [-0x0c, 0], [-9, 9], [0, 0x0e], [0x0b, 0x0b], [0x10, 0], [0x0c, -0x0c], [0, -0x12], [-0x0e, -0x0e], [-0x14, 0], [-0x0f, 0x0f],
].map(([x, y]) => ({ x, y }))
const SPIRA1_RADII = normalisedRadiiSorted(SPIRA1_ROM)

// GENTNK — 17 SCVEC absolute vertices, ALVROM.MAC:652-668 (CM=2). Every vertex is
// on an axis; the distinct non-zero magnitudes are exactly {inner 0x0c=12, outer
// 0x20=32}: an outer diamond {(±32,0),(0,±32)} laced through an inner diamond
// {(±12,0),(0,±12)}. Square (equal x/y extent), colour PURPLE (ALCOMN.MAC TANCOL).
const GENTNK_INNER = 0x0c // 12
const GENTNK_OUTER = 0x20 // 32
const GENTNK_VERTEX_COUNT = 17

// DIARA2 — the player charge, ALVROM.MAC:383-403 (CM=1). 17 SCDOT dots in two
// rings, two colours. The outer ring is DELIBERATELY irregular: its +x and +y
// cardinals sit at 0x0f=15, but its -x and -y cardinals at only 0x0b=11.
const DIARA2_INNER: Pt[] = [
  [0, 0], [7, 0], [5, 5], [0, 7], [-5, 5], [-7, 0], [-5, -5], [0, -7], [5, -5],
].map(([x, y]) => ({ x, y })) // CSTAT PSHCTR (ammo tint), 9 dots
const DIARA2_OUTER: Pt[] = [
  [0x0f, 0], [0x0b, 0x0b], [0, 0x0f], [-0x0b, 0x0b], [-0x0b, 0], [-0x0b, -0x0b], [0, -0x0b], [0x0b, -0x0b],
].map(([x, y]) => ({ x, y })) // CSTAT YELLOW, 8 dots

// ===========================================================================
// AC-1 — TANKER: the ROM's 17-vertex laced double diamond (V-006, GENTNK)
// ===========================================================================
// The body is g's LAST stroke (the cargo emblem, if any, is PREPENDED — TANKP/
// TANKF draw the emblem then JMPL GENTNK). Identify it positionally so this holds
// whether the body is authored open or closed.
const bodyStroke = (g: Glyph) => g[g.length - 1]

describe('AC-1 tankerGlyph — the ROM GENTNK 17-vertex laced double diamond (V-006, ALVROM.MAC:651)', () => {
  it('the body is a single PURPLE stroke of (at least) the ROM\'s 17 vertices — not a 4-point diamond', () => {
    const body = bodyStroke(tankerGlyph(1, 'flipper'))
    expect(body.color, 'GENTNK CSTAT PURPLE (slot 2) at bank 0').toBe<GlyphColor>('purple')
    // GENTNK is 17 SCVEC draws (ALVROM.MAC:652-668). The eyeballed body is 4.
    expect(body.points.length).toBeGreaterThanOrEqual(GENTNK_VERTEX_COUNT)
  })

  it('is a DOUBLE diamond: an outer ring and an inner ring, all vertices axis-aligned', () => {
    const body = bodyStroke(tankerGlyph(1, 'flipper'))
    // Every GENTNK vertex lies on the x- or y-axis (x≈0 OR y≈0).
    const scale = Math.max(...body.points.map((p) => Math.max(Math.abs(p.x), Math.abs(p.y))))
    for (const p of body.points) {
      const onAxis = Math.min(Math.abs(p.x), Math.abs(p.y)) < 1e-6 * scale
      expect(onAxis, `vertex (${p.x},${p.y}) is not on an axis`).toBe(true)
    }
    // The distinct non-zero |coordinate| magnitudes are exactly two rings.
    const mags = new Set(
      body.points.flatMap((p) => [Math.abs(p.x), Math.abs(p.y)]).filter((m) => m > 1e-6 * scale).map((m) => round(m / scale)),
    )
    expect(mags.size, 'a single diamond has one ring; the ROM tanker has two').toBe(2)
    // …and their ratio is the ROM's 12:32.
    const [inner, outer] = [...mags].sort((a, b) => a - b)
    expect(outer / inner).toBeCloseTo(GENTNK_OUTER / GENTNK_INNER, 1)
  })

  it('is SQUARE (equal x/y extent), NOT the eyeballed elongated 9×6 diamond', () => {
    const body = bodyStroke(tankerGlyph(1, 'flipper'))
    const { w, h } = bbox(body.points)
    expect(Math.abs(w - h)).toBeLessThan(0.05 * Math.max(w, h))
  })
})

// ===========================================================================
// AC-2 — SPIKER: the ROM's GREEN 21-point spiral, 4 authored phases (V-008, SPIRA1-4)
// ===========================================================================
describe('AC-2 spikerGlyph — the ROM SPIRA1-4 GREEN 21-point authored spirals (V-008, ALVROM.MAC:522)', () => {
  it('every one of the 4 frames has the ROM\'s 21 vertices — not the eyeballed 12', () => {
    for (const f of [0, 1, 2, 3]) {
      const n = allPoints(spikerGlyph(f)).length
      expect(n, `spikerGlyph(${f}) vertex count`).toBe(21)
    }
  })

  it('is GREEN on every frame (TRACOL=GREEN; the orange procedural spiral is gone)', () => {
    for (const f of [0, 1, 2, 3]) {
      for (const s of spikerGlyph(f)) expect(s.color, `spikerGlyph(${f})`).toBe<GlyphColor>('green')
    }
  })

  it('carries SPIRA1\'s actual 21 outward-winding radii on frame 0 (not just "some 21 points")', () => {
    // The frame-0 radius SET must equal SPIRA1's (radius 1.4→21), so a faithful
    // transcription — not any 21 points — is what passes. Scale/rotation/Y-flip invariant.
    const r = normalisedRadiiSorted(allPoints(spikerGlyph(0)))
    expect(radiiMatch(r, SPIRA1_RADII), 'frame-0 radius set does not match SPIRA1').toBe(true)
  })

  // NOTE: an earlier RED test asserted "the 4 frames are NOT one curve rotated 90°/frame".
  // That premise came from finding V-008 ("re-authored, not rotated") and is REFUTED by the
  // primary source: SPIRA2 === rot90(SPIRA1), SPIRA3 === rot180, SPIRA4 === rot270, vertex-for-
  // vertex (ALVROM.MAC:549-619). The ROM's four spiral tables ARE exact rotations of one 21-pt
  // spiral, so the faithful port rotates SPIRA1 by (frame&3)·90° — exactly the mechanism the old
  // eyeballed spiker used. The real divergence tp1-17 fixes is 12→21 points and the authored
  // curve, NOT the rotation. The test was removed rather than made to pass by an unfaithful
  // perturbation of the frames. See Design Deviations → Dev and Delivery Findings.

  it('yields 4 distinct frames and wraps on `frame & 3`', () => {
    const frames = [0, 1, 2, 3].map((f) => fingerprint(spikerGlyph(f)))
    expect(new Set(frames).size).toBe(4)
    expect(fingerprint(spikerGlyph(4))).toBe(fingerprint(spikerGlyph(0)))
    expect(fingerprint(spikerGlyph(7))).toBe(fingerprint(spikerGlyph(3)))
  })
})

// ===========================================================================
// AC-3 — FUSEBALL: the ROM's FIVE-colour authored scribble (V-014, FUSE0-3)
// ===========================================================================
const FUSE_ROM_COLORS: readonly GlyphColor[] = ['red', 'yellow', 'green', 'purple', 'cyan'] // TURQOI→cyan

describe('AC-3 fuseballGlyph — the ROM FUSE0-3 5-colour scribble (V-014, ALVROM.MAC:975)', () => {
  it('draws all FIVE authored colour groups: red, yellow, GREEN, PURPLE, turquoise(cyan)', () => {
    for (const f of [0, 1, 2, 3]) {
      const cols = colorsOf(fuseballGlyph(f))
      for (const c of FUSE_ROM_COLORS) {
        expect(cols.has(c), `fuseballGlyph(${f}) is missing '${c}' (ROM CSTAT order red/yellow/green/purple/turqoi)`).toBe(true)
      }
    }
  })

  it('introduces the GREEN and PURPLE the eyeballed 3-colour starburst never had', () => {
    const cols = colorsOf(fuseballGlyph(0))
    expect(cols.has('green')).toBe(true)
    expect(cols.has('purple')).toBe(true)
  })

  it('uses ONLY the ROM\'s five colours (no stray hue)', () => {
    const allowed = new Set<GlyphColor>(FUSE_ROM_COLORS)
    for (const f of [0, 1, 2, 3]) {
      for (const c of colorsOf(fuseballGlyph(f))) expect(allowed.has(c), `unexpected colour '${c}'`).toBe(true)
    }
  })

  it('is an authored scribble of ≥5 colour strokes, redrawn across 4 distinct frames that wrap on 4', () => {
    for (const f of [0, 1, 2, 3]) expect(fuseballGlyph(f).length).toBeGreaterThanOrEqual(5)
    const frames = [0, 1, 2, 3].map((f) => fingerprint(fuseballGlyph(f)))
    expect(new Set(frames).size).toBe(4)
    expect(fingerprint(fuseballGlyph(4))).toBe(fingerprint(fuseballGlyph(0)))
  })
})

// ===========================================================================
// AC-4 — PLAYER CHARGE: the ROM's DIARA2, 17 dots in two rings (V-010 + DA-004)
// ===========================================================================
// DA-004 makes only the INNER ring ammo-tinted, so the tint must reach the glyph
// as data (not a render-wide override that recolours both rings). This drives the
// signature `playerBulletGlyph(tint: GlyphColor)`: inner dots = tint, outer = yellow.
describe('AC-4 playerBulletGlyph — the ROM DIARA2 17 dots in two rings (V-010/DA-004, ALVROM.MAC:384)', () => {
  it('is 17 DOTS (single-point strokes), not two stroked octagon outlines', () => {
    const g = playerBulletGlyph('yellow')
    const dots = g.filter((s) => s.points.length === 1)
    expect(dots.length, 'DIARA2 is 17 SCDOTs — every mark a zero-length lit dot').toBe(17)
    expect(g.length, 'the glyph is dots only — no connecting polylines').toBe(17)
  })

  it('splits into a 9-dot inner ring and an 8-dot outer ring by radius', () => {
    const g = playerBulletGlyph('yellow')
    const r = allPoints(g).map(radius)
    const rMax = Math.max(...r)
    const inner = r.filter((v) => v <= 0.6 * rMax) // radius 0..7 vs 11..15
    const outer = r.filter((v) => v > 0.6 * rMax)
    expect(inner.length, 'inner ring (DIARA2 centre + 8 dots @ r≈7)').toBe(9)
    expect(outer.length, 'outer ring (8 dots @ r≈11..15)').toBe(8)
  })

  it('ammo-tints ONLY the inner ring; the outer ring is a fixed YELLOW (DA-004)', () => {
    const g = playerBulletGlyph('red')
    const rMax = Math.max(...allPoints(g).map(radius))
    for (const s of g) {
      const isInner = radius(s.points[0]) <= 0.6 * rMax
      if (isInner) expect(s.color, 'inner dot takes the ammo tint').toBe<GlyphColor>('red')
      else expect(s.color, 'outer dot is fixed YELLOW, never the tint').toBe<GlyphColor>('yellow')
    }
  })

  it('carries the tint the caller passes (blue too — the 6-7 charge bucket)', () => {
    const rMax = Math.max(...allPoints(playerBulletGlyph('blue')).map(radius))
    const innerBlue = playerBulletGlyph('blue').filter((s) => radius(s.points[0]) <= 0.6 * rMax)
    expect(innerBlue.every((s) => s.color === 'blue')).toBe(true)
  })

  it('the outer ring is DELIBERATELY IRREGULAR: +x/+y cardinals farther out than -x/-y', () => {
    // DIARA2's outer +x,+y cardinals sit at 0x0f=15; its -x,-y cardinals at 0x0b=11.
    // A "regular octagon" reading (the eyeballed bug) makes all eight equidistant.
    const g = playerBulletGlyph('yellow')
    const rMax = Math.max(...allPoints(g).map(radius))
    const outer = allPoints(g).filter((p) => radius(p) > 0.6 * rMax)
    // A near-axis dot: one coordinate ~0. Its distance from the centre is |other|.
    const axisDist = (sign: (p: Pt) => boolean) =>
      outer.filter((p) => Math.min(Math.abs(p.x), Math.abs(p.y)) < 0.3 * Math.max(Math.abs(p.x), Math.abs(p.y)))
        .filter(sign).map(radius)
    const farCardinals = axisDist((p) => p.x > 0 || p.y > 0) // +x or +y cardinal
    const nearCardinals = axisDist((p) => p.x < 0 || p.y < 0) // -x or -y cardinal
    const maxNear = Math.max(...nearCardinals)
    const minFar = Math.min(...farCardinals)
    expect(minFar, 'the +x/+y cardinals must be strictly farther than the -x/-y cardinals').toBeGreaterThan(maxNear + 1e-6)
    // Concretely: the ROM ratio is 15/11.
    expect(minFar / maxNear).toBeCloseTo(0x0f / 0x0b, 1)
  })
})

// ===========================================================================
// AC-5 proof — the vertex data is TRANSCRIBED (a spot-check that our ROM oracle
// really is 17/21/17 and the two-ring irregularity, so the constants above cannot
// silently drift). The citations live in each constant's comment (ALVROM.MAC:NNN).
// ===========================================================================
describe('AC-5 — the transcribed ROM oracle itself is well-formed', () => {
  it('GENTNK is a two-ring axis-aligned diamond at the 12:32 ratio', () => {
    expect(GENTNK_OUTER / GENTNK_INNER).toBeCloseTo(32 / 12, 5)
  })
  it('SPIRA1 is 21 vertices with strictly increasing radii (an outward spiral)', () => {
    expect(SPIRA1_ROM).toHaveLength(21)
    const r = SPIRA1_ROM.map(radius)
    for (let i = 1; i < r.length; i++) expect(r[i], `radius must grow at vertex ${i}`).toBeGreaterThan(r[i - 1])
  })
  it('DIARA2 is 9 inner + 8 outer = 17 dots, with an irregular outer ring', () => {
    expect(DIARA2_INNER).toHaveLength(9)
    expect(DIARA2_OUTER).toHaveLength(8)
    const outerRadii = DIARA2_OUTER.map(radius)
    expect(Math.max(...outerRadii)).toBeCloseTo(Math.hypot(0x0b, 0x0b), 5) // diagonals are the farthest
    expect(new Set(outerRadii.map((r) => round(r))).size, 'a regular octagon has one radius; DIARA2 has several').toBeGreaterThan(1)
  })
})

// ===========================================================================
// Rule coverage — tempest's Hard Architectural Boundary + purity, and the
// TypeScript lang-review checklist (#1 type-safety escapes, #2 readonly, #8 tests).
// ===========================================================================
describe('tp1-17 rule coverage — boundary, purity, type-safety, determinism', () => {
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

  it('keeps the transcribed vertex tables `readonly` (TS lang-review #2 — data is not mutated)', () => {
    // The new ROM tables must be immutable const data, like the existing FLIPPER_DELTAS
    // / CLAW_DELTAS. Assert the module still declares readonly vertex tables.
    expect(glyphSrc).toMatch(/readonly/)
  })

  it('every animated glyph is deterministic across repeated calls (all frame-parameterised shapes)', () => {
    expect(fingerprint(spikerGlyph(1))).toBe(fingerprint(spikerGlyph(1)))
    expect(fingerprint(fuseballGlyph(2))).toBe(fingerprint(fuseballGlyph(2)))
    expect(fingerprint(tankerGlyph(1, 'pulsar'))).toBe(fingerprint(tankerGlyph(1, 'pulsar')))
    expect(fingerprint(playerBulletGlyph('red'))).toBe(fingerprint(playerBulletGlyph('red')))
  })
})
