// tests/shell/tp1-18.shapes.test.ts
//
// Story tp1-18 — SHAPES: the player-death splat and the invader-collision spark,
// drawn from the ROM's vertex data. Cluster C13, part 2.
//
// Today the player-death splat is an EYEBALLED procedural pair of concentric
// jagged rings (render.ts drawPlayerSplat → jaggedStarPath, two radius bands) in
// ONE colour per frame, and the invader-collision death reuses that same splat.
// This story replaces the splat with the vertex data Theurer actually drew, and
// gives the invader-collision death its own distinct ROM cue.
//
// SOURCE OF TRUTH — the ORIGINAL Atari assembler (the primary-source audit, per
// tempest CLAUDE.md "Take arcade constants from [the audit], not the book"):
//   /Users/slabgorb/Projects/tempest-source-text/ALVROM.MAC  (TEMPEST_SOURCE_DIR)
// ALVROM.MAC is `.RADIX 16` across every shape below, so all coordinate literals
// here are HEX decoded to decimal. The citation gate (npm test -- citations)
// re-opens the byte-exact source lines; THIS suite pins sign/scale/rotation-
// invariant SIGNATURES (vertex count, colour SETS, radius spread) so a faithful
// port is not rejected for a choice of units or Y-convention — exactly the
// tp1-17 convention.
//
//   Macro model (ALVROM.MAC 64-92):
//     ICVEC          — reset the pen to the object origin (0,0)
//     SCVEC x,y[,b]  — draw/move to the ABSOLUTE object point (x*CM/CD, y*CM/CD);
//                      b omitted or 0 = beam OFF (a positioning move, not a line),
//                      b = CB (=7) = beam ON (a lit vector)
//     CSTAT c        — set the colour of subsequent vectors (a COLRAM slot)
//
// FINDING MAP (this file's two shapes ↔ the machine-checked audit):
//   player splat → V-013 / DA-009  ALVROM.MAC:806-850  SPLAT
//                    (26 SCVEC entries, 24 LIT: one closed ragged tri-colour ring,
//                     colour re-stated every ~2 vertices — white/red/yellow ALL on
//                     screen at once, and ROTCOL spins the assignment over frames)
//   invader-collision spark → DA-007  ALVROM.MAC:672-684  SPARK1
//                    (TEXTYP[5]=PTSPAR "INVADER - PLAYER COLLISION", ALDISP.MAC:982
//                     — a STATIC 4-dot YELLOW cross on the AXES; SPARK2's diagonal
//                     cross is never invoked, DSPEXP forces picture offset 0)
//
// SCOPE NOTE (see session Delivery Findings): tp1-18's subsumes list "V-013,
// V-017, DA-007, DA-009, DA-018, DA-019" is imprecise for a 4-pt story.
//   • V-013/DA-009/DA-010/DA-011 — the SPLAT — are this story's core (ACs 1-3).
//   • DA-007 — the invader-collision spark — is included per the subsumes list and
//     the title's "burst effects" (user-confirmed 2026-07-15).
//   • V-017 (the TEMPEST-logo alphabet) is tp1-19's EXPLICIT subject, and the
//     "score pop-ups" of the title = FUSEX digit glyphs = V-022, ALSO tp1-19.
//     Both are OUT OF SCOPE here — carved to tp1-19.
//   • DA-018 (enemy-bolt cadence) is already remediated_by tp1-35; DA-019 (bolt-vs-
//     bolt burst) is already live (bolt-destroyed event + tp1-13). Guards only.
import { describe, it, expect } from 'vitest'
import glyphSrc from '../../src/shell/glyphs.ts?raw'
import renderSrc from '../../src/shell/render.ts?raw'
// NOTE (import-RED): splatGlyph / sparkGlyph do not exist yet — Dev adds them to
// glyphs.ts. Until then this file is RED at the contract these tests describe.
import { splatGlyph, sparkGlyph, type Glyph, type GlyphColor } from '../../src/shell/glyphs'

// ---------------------------------------------------------------------------
// Helpers — sign/scale/rotation/order-tolerant (shared with the tp1-17 style).
// ---------------------------------------------------------------------------
type Pt = { x: number; y: number }

const allPoints = (g: Glyph): Pt[] => g.flatMap((s) => s.points.map((p) => ({ x: p.x, y: p.y })))
const colorsOf = (g: Glyph): Set<GlyphColor> => new Set(g.map((s) => s.color))
const radius = (p: Pt): number => Math.hypot(p.x, p.y)
const round = (n: number): number => Math.round(n * 1e6) / 1e6

function fingerprint(g: Glyph): string {
  return JSON.stringify(g.map((s) => ({ c: s.color, k: s.closed, p: s.points.map((p) => [round(p.x), round(p.y)]) })))
}

// The colour, in ring order, of every LIT segment (a segment = a colour run). Used
// to test the ROTCOL rotation as a consistent global 3-cycle over the whole ring.
const segmentColors = (g: Glyph): GlyphColor[] => g.map((s) => s.color)

// ---------------------------------------------------------------------------
// Authentic ROM vertex data (verbatim ALVROM.MAC, hex → decimal).
// ---------------------------------------------------------------------------

// SPLAT — the 24 LIT SCVEC vectors (b=CB), ALVROM.MAC:814-848 (CM=2). The pen is
// positioned beam-OFF at (18,-8)=(24,-8) (813), draws this closed ragged ring, and
// the last lit vector (848) returns to (24,-8) closing it; a final beam-OFF (0,0)
// resets the pen (849). 26 SCVEC entries total, 24 lit — the AC's "26-vertex".
// Colour (CSTAT) is re-stated every 2 vectors: W W · R R · Y Y · W W · R R · Y Y ·
// W W · R R · W W · Y Y · R R · Y Y  (the 9th run breaks the W→R→Y beat: RED is
// followed by WHITE, skipping YELLOW — ALVROM.MAC:837, the finding's own [CORRECTION]).
const W: GlyphColor = 'white'
const R: GlyphColor = 'red'
const Y: GlyphColor = 'yellow'
const SPLAT_ROM: { p: Pt; c: GlyphColor }[] = [
  { p: { x: 0x38, y: 0x8 }, c: W }, { p: { x: 0x20, y: 0x0c }, c: W },   // 814,815
  { p: { x: 0x24, y: 0x14 }, c: R }, { p: { x: 0x1c, y: 0x15 }, c: R },  // 817,818
  { p: { x: 0x22, y: 0x20 }, c: Y }, { p: { x: 0x10, y: 0x16 }, c: Y },  // 820,821
  { p: { x: 0x12, y: 0x30 }, c: W }, { p: { x: 0x4, y: 0x28 }, c: W },   // 823,824
  { p: { x: -0x0a, y: 0x2d }, c: R }, { p: { x: -0x0c, y: 0x12 }, c: R },// 826,827
  { p: { x: -0x2e, y: 0x18 }, c: Y }, { p: { x: -0x1c, y: 0x0 }, c: Y }, // 829,830
  { p: { x: -0x26, y: -0x8 }, c: W }, { p: { x: -0x20, y: -0x0a }, c: W },// 832,833
  { p: { x: -0x26, y: -0x17 }, c: R }, { p: { x: -0x0d, y: -0x0e }, c: R },// 835,836
  { p: { x: -0x10, y: -0x22 }, c: W }, { p: { x: -0x0c, y: -0x20 }, c: W },// 838,839 (skip-a-beat)
  { p: { x: -0x8, y: -0x2c }, c: Y }, { p: { x: 0x4, y: -0x20 }, c: Y }, // 841,842
  { p: { x: 0x10, y: -0x2c }, c: R }, { p: { x: 0x12, y: -0x18 }, c: R },// 844,845
  { p: { x: 0x22, y: -0x1e }, c: Y }, { p: { x: 0x18, y: -0x8 }, c: Y }, // 847,848 (closes to start)
]
const SPLAT_ROM_PTS: Pt[] = SPLAT_ROM.map((v) => v.p)
const SPLAT_VERTEX_COUNT = 24 // lit vectors; the pen-move + origin-reset are bookkeeping

// SPARK1 — DA-007, ALVROM.MAC:672-684 (SCVEC + zero-length VCTR = a lit DOT). Four
// YELLOW dots on the AXES at (±10,0),(0,±10) hex = (±16,0),(0,±16). Static: no
// growth, no colour cycle. (SPARK2 at ALVROM.MAC:685 is the DIAGONAL cross and is
// never actually drawn for this bang — the finding's [CORRECTION].)
const SPARK_R = 0x10 // 16
const SPARK1_ROM: Pt[] = [
  { x: SPARK_R, y: 0 }, { x: -SPARK_R, y: 0 }, { x: 0, y: SPARK_R }, { x: 0, y: -SPARK_R },
]

// The three ROTCOL colour slots (PDIWHI=9, PDIYEL=10, PDIRED=11; ALCOMN.MAC:384-386).
const SPLAT_COLORS = new Set<GlyphColor>([W, R, Y])

// ===========================================================================
// AC-1 — the SPLAT is the ROM's one closed 26-vertex tri-colour ring (V-013)
// ===========================================================================
describe('AC-1 splatGlyph — the ROM SPLAT one closed ragged tri-colour ring (V-013, ALVROM.MAC:806)', () => {
  it('is a SINGLE ring of ~24 vertices — not the eyeballed TWO concentric jagged rings', () => {
    const g = splatGlyph(0)
    const pts = allPoints(g)
    // The ROM draws 24 lit vectors around one ring. Allow the port ±2 for a
    // start/close/origin bookkeeping vertex, but reject the 12-point eyeball.
    expect(pts.length, 'SPLAT is ~24 ring vertices').toBeGreaterThanOrEqual(SPLAT_VERTEX_COUNT - 2)

    // The eyeballed splat is TWO clean radius bands (outer + inner*0.45). The ROM
    // is ONE ragged tear: its radii are spread across the whole range, not clustered
    // into two values. Bucket radii to 3 sig-figs of the max and demand many buckets.
    const r = pts.map(radius)
    const rMax = Math.max(...r)
    const buckets = new Set(r.map((v) => Math.round((v / rMax) * 20))) // 5%-wide bins
    expect(buckets.size, 'a ragged ring has many distinct radii; two clean rings have ~2').toBeGreaterThanOrEqual(8)
  })

  it('carries SPLAT\'s actual ragged radii — a faithful transcription, not just "some 24 points"', () => {
    // Every ROM ring radius must be present in the glyph (scale-invariant). This
    // rejects any 24 points that are not SPLAT's specific ragged outline.
    const g = splatGlyph(0)
    const gr = allPoints(g).map(radius)
    const grMax = Math.max(...gr)
    const romMax = Math.max(...SPLAT_ROM_PTS.map(radius))
    for (const romPt of SPLAT_ROM_PTS) {
      const target = radius(romPt) / romMax
      const hit = gr.some((v) => Math.abs(v / grMax - target) <= 0.03)
      expect(hit, `no glyph vertex at normalised radius ${round(target)} (ROM ${round(radius(romPt))})`).toBe(true)
    }
  })

  it('is not point-symmetric — a real hand-authored tear, not a regular star', () => {
    // A regular/procedural star is symmetric under 180° rotation; SPLAT is not.
    const g = splatGlyph(0)
    const pts = allPoints(g)
    const has = (q: Pt) => pts.some((p) => Math.hypot(p.x - q.x, p.y - q.y) < 1e-3 * Math.max(1, radius(q)))
    const mirroredHits = pts.filter((p) => has({ x: -p.x, y: -p.y })).length
    expect(mirroredHits, 'SPLAT is a ragged tear, not a symmetric star').toBeLessThan(pts.length)
  })
})

// ===========================================================================
// AC-1 (colour) — SPATIAL tri-colour + ROTCOL temporal rotation (DA-009)
// ===========================================================================
describe('AC-1 splatGlyph colour — SPATIAL white/red/yellow at once, ROTCOL rotates it (DA-009, ALVROM.MAC:812)', () => {
  it('has ALL THREE colours present SIMULTANEOUSLY — not one colour for the whole shape', () => {
    // The DEFECT is a single ex.color strobing per frame; the ROM re-states CSTAT
    // white/red/yellow around ONE ring so all three coexist every frame.
    for (const rot of [0, 1, 2]) {
      const cols = colorsOf(splatGlyph(rot))
      for (const c of SPLAT_COLORS) {
        expect(cols.has(c), `splatGlyph(${rot}) is missing '${c}' — all 3 must be on screen at once`).toBe(true)
      }
    }
  })

  it('uses ONLY the three PDI colours (white, red, yellow) — no stray hue', () => {
    for (const rot of [0, 1, 2]) {
      for (const c of colorsOf(splatGlyph(rot))) {
        expect(SPLAT_COLORS.has(c), `splatGlyph(${rot}) unexpected colour '${c}'`).toBe(true)
      }
    }
  })

  it('re-states the colour every ~2 vectors — many coloured segments, not one', () => {
    // 24 lit vectors in 12 colour runs of 2. A faithful port has many strokes/runs.
    const runs = segmentColors(splatGlyph(0))
    expect(runs.length, 'the ROM re-states CSTAT ~12 times around the ring').toBeGreaterThanOrEqual(10)
  })

  it('ROTCOL spins the assignment: rot advances the 3 colours as ONE consistent global 3-cycle, period 3', () => {
    const g0 = splatGlyph(0)
    const g1 = splatGlyph(1)
    // Same geometry — rotation only RECOLOURS the ring; it never moves a vertex.
    expect(allPoints(g1).map((p) => [round(p.x), round(p.y)]))
      .toEqual(allPoints(g0).map((p) => [round(p.x), round(p.y)]))

    // Every stroke's colour changes (a 3-cycle has no fixed points) …
    const c0 = segmentColors(g0)
    const c1 = segmentColors(g1)
    expect(c0.length).toBe(c1.length)
    // … and the mapping colour(rot0) → colour(rot1) is ONE consistent bijection
    // applied to the whole ring (a global slot rotation, not per-segment noise).
    const perm = new Map<GlyphColor, GlyphColor>()
    for (let i = 0; i < c0.length; i++) {
      const from = c0[i]
      const to = c1[i]
      expect(from, 'ROTCOL is a permutation with no fixed point').not.toBe(to)
      if (perm.has(from)) expect(perm.get(from), 'the rotation must be consistent across the whole ring').toBe(to)
      else perm.set(from, to)
    }
    expect(new Set(perm.values()).size, 'the mapping is a bijection on {white,red,yellow}').toBe(perm.size)

    // Period 3: three rotations return to the start.
    expect(fingerprint(splatGlyph(3))).toBe(fingerprint(g0))
    expect(fingerprint(splatGlyph(4))).toBe(fingerprint(g1))
    // And it actually rotates (0,1,2 are three distinct colourings).
    expect(new Set([0, 1, 2].map((r) => fingerprint(splatGlyph(r)))).size).toBe(3)
  })
})

// ===========================================================================
// DA-007 — the invader-collision spark is the ROM's SPARK1 yellow axis cross
// ===========================================================================
describe('DA-007 sparkGlyph — the ROM SPARK1 static 4-dot YELLOW cross (ALVROM.MAC:672)', () => {
  it('is exactly 4 YELLOW dots (single-point strokes), not a colour-cycling star', () => {
    const g = sparkGlyph()
    expect(g.length, 'SPARK1 is 4 lit dots').toBe(4)
    for (const s of g) {
      expect(s.points.length, 'each mark is a zero-length lit DOT').toBe(1)
      expect(s.color, 'SPARK1 CSTAT YELLOW').toBe<GlyphColor>('yellow')
    }
  })

  it('places the four dots on the AXES (SPARK1), NOT the diagonals (the never-drawn SPARK2)', () => {
    const g = sparkGlyph()
    const pts = allPoints(g)
    const rMax = Math.max(...pts.map(radius))
    for (const p of pts) {
      // On an axis: one coordinate ≈ 0.
      const onAxis = Math.min(Math.abs(p.x), Math.abs(p.y)) < 1e-6 * rMax
      expect(onAxis, `dot (${p.x},${p.y}) must be on an axis (SPARK1), not a diagonal (SPARK2)`).toBe(true)
    }
    // All four cardinals present at one radius (a symmetric cross).
    const dirs = pts.map((p) => `${Math.sign(round(p.x))},${Math.sign(round(p.y))}`)
    expect(new Set(dirs)).toEqual(new Set(['1,0', '-1,0', '0,1', '0,-1']))
    // Equal-radius cross (SPARK1's four dots share |10| = 16).
    const rr = pts.map(radius)
    expect(Math.max(...rr) - Math.min(...rr)).toBeLessThan(0.02 * rMax)
  })
})

// ===========================================================================
// Oracle well-formedness — the transcribed constants above cannot silently drift
// (AC-style spot-check; the byte-exact data lands via the citation gate).
// ===========================================================================
describe('the transcribed ROM oracle itself is well-formed', () => {
  it('SPLAT is 24 lit vectors, tri-colour, and a RAGGED ring (radii span, not two bands)', () => {
    expect(SPLAT_ROM).toHaveLength(24)
    expect(new Set(SPLAT_ROM.map((v) => v.c))).toEqual(SPLAT_COLORS)
    const r = SPLAT_ROM_PTS.map(radius)
    const spread = Math.min(...r) / Math.max(...r)
    expect(spread, 'a ragged tear has a wide radius spread (min/max well below 1)').toBeLessThan(0.5)
  })

  it('SPLAT re-states colour every 2 vectors and breaks the W→R→Y beat once (RED→WHITE at 837)', () => {
    // Runs of identical colour are length 2 (the CSTAT-every-2 pattern) …
    const cols = SPLAT_ROM.map((v) => v.c)
    for (let i = 0; i < cols.length; i += 2) expect(cols[i], `run at ${i}`).toBe(cols[i + 1])
    // … and the run sequence is NOT a perfect W,R,Y,W,R,Y (index 8 is W after R,
    // ALVROM.MAC:837 — the finding's [CORRECTION], so tests must not demand uniformity).
    const runs = cols.filter((_, i) => i % 2 === 0)
    const perfect = runs.every((c, i) => c === [W, R, Y][i % 3])
    expect(perfect, 'the ROM cycle is irregular — do not pin a uniform W→R→Y').toBe(false)
  })

  it('SPARK1 is a 4-dot axis cross at radius 16 (0x10)', () => {
    expect(SPARK1_ROM).toHaveLength(4)
    for (const p of SPARK1_ROM) expect(radius(p)).toBeCloseTo(SPARK_R, 5)
  })
})

// ===========================================================================
// Already-remediated guards — DA-018 & DA-019 are in the subsumes list but were
// fixed by earlier stories; a light guard keeps them from regressing here.
// ===========================================================================
describe('subsumed-but-already-done — DA-018 / DA-019 regression guards', () => {
  it('DA-018: enemy bolts spin off a TEMPORAL global counter (renderTime·ROM_FPS), not b.depth (remediated_by tp1-35)', () => {
    expect(renderSrc, 'the QFRAME-analog cadence must stay time-driven').toMatch(/renderTime\s*\*\s*ROM_FPS/)
    expect(renderSrc, 'the old SPATIAL depth-driven frame must stay gone').not.toMatch(/enemyBoltGlyph\(\s*Math\.floor\(\s*b\.depth\s*\*\s*8/)
  })
  // DA-019 (bolt-vs-bolt → 16-spoke burst) is covered by the live bolt-destroyed
  // event + tests/shell/tp1-13.fx-bolt-explosion.test.ts. Not re-pinned here.
})

// ===========================================================================
// Rule coverage — tempest's Hard Architectural Boundary + purity, and the
// TypeScript lang-review checklist (#1 type-safety, #2 readonly, #8 tests).
// ===========================================================================
describe('tp1-18 rule coverage — boundary, purity, type-safety, determinism', () => {
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

  it('the new splat/spark vertex tables are readonly const data (TS lang-review #2)', () => {
    expect(glyphSrc).toMatch(/readonly/)
  })

  it('splat & spark glyphs are deterministic across repeated calls (frame-exact)', () => {
    expect(fingerprint(splatGlyph(1))).toBe(fingerprint(splatGlyph(1)))
    expect(fingerprint(sparkGlyph())).toBe(fingerprint(sparkGlyph()))
  })
})
