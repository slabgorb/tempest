// tests/shell/tp1-35.shapes.test.ts
//
// Story tp1-35 — SHAPES: the pulsar bar, the tanker cargo emblems and the enemy
// shot, drawn from the ROM's vertex data. Cluster C13, part 1b.
//
// tp1-17 (part 1) transcribed four shapes (tanker body, spiker, fuseball, player
// charge) but its ACs deferred the three shapes whose findings fall in the same
// finding range: V-005 (pulsar bar), V-007 (tanker CARGO emblems) and V-009 (enemy
// shot). See tp1-17.shapes.test.ts:35 — "they are out of scope here". This story
// closes them, so its RED suite pins those three against the primary source.
//
// SOURCE OF TRUTH — the ORIGINAL Atari assembler (the primary-source audit, per
// tempest CLAUDE.md "Take arcade constants from [the audit], not the book"):
//   /Users/slabgorb/Projects/tempest-source-text/{ALVROM,ALDISP}.MAC
// ALVROM.MAC is `.RADIX 16` for every shape below (the only RADIX-10 window is
// 242-268), so its hex coordinate literals are decoded to decimal here — EXCEPT
// where a literal carries a trailing `.` (that forces decimal, e.g. the enemy shot's
// `-17.`). ALDISP.MAC's PULS chains are drawn with `VEC dx,dy[,b]` DELTA vectors
// (b=0 → a beam-off positioning move, not a lit segment; ALDISP.MAC:1883-1898).
//
//   ALVROM macro model (ALVROM.MAC:64-92):
//     ICVEC          — reset the pen to the object origin (0,0)
//     SCVEC x,y[,b]  — draw/move to the ABSOLUTE object point; b omitted/0 = beam OFF
//     VCTR 0,0,CB    — a zero-length lit DOT at the current pen position
//     CSTAT c        — set the colour of subsequent vectors
//
// FINDING MAP (machine-checked audit, docs/audit/findings/pair-2-alvrom-shapes-font.json):
//   pulsar bar     → V-005  ALDISP.MAC:2001-2035  PULS0-4  (five DISTINCT chains)
//                    and the PULTAB clamp        ALDISP.MAC:868-893 (idx>=5 → flat)
//   tanker cargo   → V-007  ALVROM.MAC:624-647   TANKP / TANKF (turquoise chevron / 4-colour plus)
//   enemy shot     → V-009  ALVROM.MAC:700-721   ESHOT1 (MESHO1) diagonal ticks + red dots
//
// Test design follows tp1-17: pin sign/scale/rotation/Y-flip-invariant signatures
// (counts, colour SETS, radius sets, topology) so a faithful port is not rejected
// over a units or Y-convention choice — the byte-exact data lands via the citation
// gate (docs/audit/findings). See Delivery Findings for what the audit did NOT decode.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import glyphSrc from '../../src/shell/glyphs.ts?raw'
import renderSrc from '../../src/shell/render.ts?raw'
import {
  tankerGlyph,
  pulsarBar,
  pulsarVariant,
  enemyBoltGlyph,
  type Glyph,
  type GlyphColor,
} from '../../src/shell/glyphs'

// ---------------------------------------------------------------------------
// Helpers — sign/scale/rotation/Y-flip tolerant (mirrors tp1-17.shapes.test.ts).
// ---------------------------------------------------------------------------
type Pt = { x: number; y: number }

const allPoints = (g: Glyph): Pt[] => g.flatMap((s) => s.points.map((p) => ({ x: p.x, y: p.y })))
const colorsOf = (g: Glyph): Set<GlyphColor> => new Set(g.map((s) => s.color))
const radius = (p: Pt): number => Math.hypot(p.x, p.y)
const round = (n: number): number => Math.round(n * 1e6) / 1e6

function fingerprint(g: Glyph): string {
  return JSON.stringify(g.map((s) => ({ c: s.color, k: s.closed, p: s.points.map((p) => [round(p.x), round(p.y)]) })))
}

function bbox(pts: readonly Pt[]): { w: number; h: number } {
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
}

// Sorted radii normalised to the largest — a rotation/reflection/Y-flip/order and
// scale invariant fingerprint of "which point set is this?".
function normalisedRadiiSorted(pts: readonly Pt[]): number[] {
  const r = pts.map(radius)
  const max = Math.max(...r)
  return r.map((v) => v / max).sort((a, b) => a - b)
}
function radiiMatch(a: number[], b: number[], tol = 0.02): boolean {
  if (a.length !== b.length) return false
  return a.every((v, i) => Math.abs(v - b[i]) <= tol)
}

// "On a diagonal" = |x| ≈ |y| (within tol of the larger). Distinguishes the ROM's
// diagonal marks from a point on a cardinal axis (where one coordinate is ~0).
function onDiagonal(p: Pt, tol = 0.15): boolean {
  const a = Math.abs(p.x)
  const b = Math.abs(p.y)
  const m = Math.max(a, b)
  return m > 1e-9 && Math.abs(a - b) <= tol * m
}
const midpoint = (s: { readonly points: readonly Pt[] }): Pt => ({
  x: (s.points[0].x + s.points[s.points.length - 1].x) / 2,
  y: (s.points[0].y + s.points[s.points.length - 1].y) / 2,
})

// The tanker body is the LAST stroke; cargo emblem strokes are PREPENDED (TANKP/
// TANKF draw the emblem, then JMPL GENTNK) — the tp1-17/tp1-30 positional convention.
const emblemStrokes = (g: Glyph) => g.slice(0, g.length - 1)

// ===========================================================================
// AC-1 — PULSAR BAR: the ROM's FIVE distinct authored chains (V-005, PULS0-4)
// ===========================================================================
// ALDISP.MAC:2001-2035. PULS4 is 6 drawn VECs (no leading move); PULS3 & PULS2 are
// a leading move(1,0) + 6 drawn VECs (amplitude 4 / 2); PULS1 is move(1,0) + THREE
// drawn VECs; PULS0 is move(1,0) + ONE flat VEC (6,0). So the five chains have
// genuinely different topologies — a DRAWN-SEGMENT-count multiset of {1,3,6,6,6},
// not our single 6-segment table amplitude-scaled five ways (glyphs.ts:247-268).
const PULS_SEGMENT_MULTISET = [1, 3, 6, 6, 6] // sorted drawn-segment counts across the 5 variants
const VARIANTS = [0, 1, 2, 3, 4]
const segCount = (g: Glyph): number => g[0].points.length - 1 // one open polyline per variant
const peakToPeakY = (pts: readonly Pt[]): number => Math.max(...pts.map((p) => p.y)) - Math.min(...pts.map((p) => p.y))
const isFlat = (g: Glyph): boolean => peakToPeakY(allPoints(g)) < 1e-6

describe('AC-1 pulsarBar — the ROM PULS0-4 five DISTINCT chains (V-005, ALDISP.MAC:2001-2035)', () => {
  it('each variant is ONE open polyline', () => {
    for (const v of VARIANTS) {
      expect(pulsarBar(v)).toHaveLength(1)
      expect(pulsarBar(v)[0].closed).toBe(false)
    }
  })

  it('the five variants carry the ROM\'s five distinct topologies — segment counts {1,3,6,6,6}, not {6,6,6,6,6}', () => {
    // The eyeballed table gives every variant 6 segments (amplitude-scaled PULS4);
    // the ROM's PULS1 is 3 segments and PULS0 is 1. Order-invariant multiset.
    const counts = VARIANTS.map((v) => segCount(pulsarBar(v))).sort((a, b) => a - b)
    expect(counts).toEqual(PULS_SEGMENT_MULTISET)
  })

  it('exactly one variant is the FLAT chain (PULS0): a single 2-point segment, zero amplitude', () => {
    const flats = VARIANTS.map((v) => pulsarBar(v)).filter(isFlat)
    expect(flats.length, 'PULS0 is the one flat chain').toBe(1)
    expect(flats[0][0].points.length, 'PULS0 = move(1,0) + ONE VEC 6,0 → 2 drawn points, not 7 collinear').toBe(2)
  })

  it('exactly one variant is the 3-segment chain (PULS1): 4 points', () => {
    // PULS1 = move(1,0) + (2,-1)(2,2)(2,-1) — a real structural difference from the
    // six-segment PULS2/3/4, never producible by amplitude-scaling one table.
    const threeSeg = VARIANTS.map((v) => pulsarBar(v)).filter((g) => segCount(g) === 3)
    expect(threeSeg.length).toBe(1)
    expect(threeSeg[0][0].points.length).toBe(4)
  })

  it('keeps the render contract: variant 0 is the sharpest jagged chain, variant 4 is flat (render.ts:427)', () => {
    // render.ts draws pulsarBar(4) for a DORMANT pulsar (flat) and pulsarBar(0) via
    // the selector for a pulsing one (sharpest) — so the numbering must stay 0=sharp..4=flat.
    expect(isFlat(pulsarBar(4)), 'variant 4 is flat (PULS0)').toBe(true)
    expect(peakToPeakY(allPoints(pulsarBar(0))), 'variant 0 is the sharpest (max amplitude)').toBeGreaterThan(
      peakToPeakY(allPoints(pulsarBar(1))),
    )
    expect(segCount(pulsarBar(0)), 'the sharpest chain is PULS4 — 6 segments').toBe(6)
  })
})

describe('AC-1 pulsarVariant — flat/sharp selection matches PULTAB (V-005, ALDISP.MAC:868-893)', () => {
  // PULPIC: idx = (PULSON + 64) >> 4; `CMP I,5 / IFCS / LDA I,0` forces idx>=5 to 0
  // BEFORE indexing PULTAB[.BYTE CPULS0,CPULS1,CPULS2,CPULS3,CPULS4,CPULS4]. So:
  //   idx 0 → PULS0 (flat)   idx 4 → PULS4 (sharp)   idx>=5 → clamp to 0 → PULS0 (flat)
  // Our pulsarVariant clamps the INDEX to 5 and maps it to variant 0 (SHARPEST) — the
  // inversion V-005 flags. pulsing is fed as `(pulsing+0x40)&0xff)>>4`.
  const selected = (pulsing: number): Glyph => pulsarBar(pulsarVariant(pulsing))

  it('the bottom of the range (idx 0, pulsing=0xC0) selects the FLAT chain (PULTAB[0]=PULS0)', () => {
    expect(isFlat(selected(0xc0))).toBe(true) // already correct today — a keep-guard
  })

  it('the peak (idx 4, pulsing=0x00) selects a JAGGED chain (PULS4)', () => {
    expect(peakToPeakY(allPoints(selected(0x00)))).toBeGreaterThan(0) // keep-guard
  })

  it('the TOP of the range (idx 5, pulsing=0x10) clamps to the FLAT chain, NOT the sharpest', () => {
    // pulsing=0x10 → (0x10+0x40)>>4 = 5. The ROM forces this to PULS0 (flat); ours
    // maps it to variant 0 (sharpest). THE inversion — RED until the selector is fixed.
    expect(isFlat(selected(0x10)), 'idx>=5 must fall to flat per PULTAB, not invert to sharpest').toBe(true)
  })
})

// ===========================================================================
// AC-2 — TANKER CARGO EMBLEMS: TURQOI chevron / 4-colour plus (V-007, TANKP/TANKF)
// ===========================================================================
// TANKP (pulsar cargo, ALVROM.MAC:624-632): ONE turquoise open chain — beam-off move
// to (-5,-2), draw to (-3,6)(0,-6)(3,6)(5,-2). A W/chevron spanning the body, TALLER
// (y -6..6) than WIDE (x -5..5). Ours: a 4-point cyan zigzag, wider than tall.
const TANKP_ROM: Pt[] = [
  [-5, -2], [-3, 6], [0, -6], [3, 6], [5, -2],
].map(([x, y]) => ({ x, y }))
const TANKP_RADII = normalisedRadiiSorted(TANKP_ROM)

// TANKF (fuse cargo, ALVROM.MAC:633-646): a FOUR-colour plus/cross — CSTAT BLUE left
// arm, RED top, GREEN bottom, YELLOW right, each 0x0C=12 long from centre. Ours: a
// single YELLOW 4-point cross. (The audit's `claim` said "RED dot"; its own reasoning
// CORRECTS that — the RED element is a real 0x0C line, the top arm.)
const TANKF_ROM_COLORS: readonly GlyphColor[] = ['blue', 'red', 'green', 'yellow']

describe('AC-2 tankerGlyph pulsar cargo — the ROM TANKP turquoise chevron (V-007, ALVROM.MAC:624)', () => {
  it('is a single TURQOISE(cyan) open chain of the ROM\'s 5 vertices — not the 4-point zigzag', () => {
    const emblem = emblemStrokes(tankerGlyph(1, 'pulsar'))
    expect(emblem.length, 'one turquoise chevron stroke').toBe(1)
    expect(emblem[0].color, 'CSTAT TURQOI → cyan').toBe<GlyphColor>('cyan')
    expect(emblem[0].points.length, 'TANKP draws 5 vertices (-5,-2)(-3,6)(0,-6)(3,6)(5,-2)').toBe(5)
  })

  it('is TALLER than it is wide (the W dips to ±6 vertically; the eyeballed zigzag was wider than tall)', () => {
    const { w, h } = bbox(emblemStrokes(tankerGlyph(1, 'pulsar'))[0].points)
    expect(h, 'ROM chevron: y-span 12 > x-span 10').toBeGreaterThan(w)
  })

  it('carries TANKP\'s actual radius signature (a faithful transcription, not any 5 points)', () => {
    const r = normalisedRadiiSorted(emblemStrokes(tankerGlyph(1, 'pulsar'))[0].points)
    expect(radiiMatch(r, TANKP_RADII), 'pulsar-cargo emblem radii do not match TANKP').toBe(true)
  })
})

describe('AC-2 tankerGlyph fuse cargo — the ROM TANKF 4-colour plus (V-007, ALVROM.MAC:634)', () => {
  it('draws all FOUR ROM colours — blue, red, green, yellow — not a single yellow cross', () => {
    const set = new Set(emblemStrokes(tankerGlyph(1, 'fuseball')).map((s) => s.color))
    for (const c of TANKF_ROM_COLORS) {
      expect(set.has(c), `fuse-cargo emblem is missing '${c}' (ROM CSTAT BLUE/RED/GREEN/YELLOW)`).toBe(true)
    }
  })

  it('uses EXACTLY those four colours (no stray hue, and no longer a lone yellow)', () => {
    const set = new Set(emblemStrokes(tankerGlyph(1, 'fuseball')).map((s) => s.color))
    expect([...set].sort()).toEqual([...TANKF_ROM_COLORS].sort())
  })

  it('is a symmetric plus: four arms of equal length radiating from the centre', () => {
    // Each CSTAT arm is a 0x0C-long segment from (or through) the origin: BLUE left,
    // RED top, GREEN bottom, YELLOW right. A symmetric 4-armed mark, not one stroke.
    const emblem = emblemStrokes(tankerGlyph(1, 'fuseball'))
    expect(emblem.length, 'four coloured arms').toBe(4)
    // Every arm reaches roughly the same distance from the origin (arms are equal length).
    const reach = emblem.map((s) => Math.max(...s.points.map(radius)))
    const mn = Math.min(...reach)
    const mx = Math.max(...reach)
    expect((mx - mn) / mx, 'the four arms are equal length (a symmetric plus)').toBeLessThan(0.05)
  })
})

// ===========================================================================
// AC-3 — ENEMY SHOT: the ROM's ESHOT1-4 diagonal ticks + red dots (V-009, MESHO1)
// ===========================================================================
// ESHOT1 (MESHO1, ALVROM.MAC:700-721, CM=1): four short WHITE segments whose MIDPOINTS
// sit on the four diagonals — (-11,11)->(-17,17), (-17,-11)->(-11,-17), (17,-17)->
// (11,-11), (11,17)->(17,11) (decimal) — plus four RED dots at (±6,±6). Ours builds
// four white hooks on the CARDINAL axes + four red dots on the cardinals: a pinwheel
// 45° off, and it picks the frame off the bullet DEPTH, not the ROM's frame counter.
//
// SCOPE: the audit `claim` decodes ONLY ESHOT1. ESHOT2/3/4 are DISTINCT hand-authored
// tables (ALVROM.MAC:726-790, verified — not rotations of ESHOT1, like FUSE0-3), so
// frame 0 is pinned exactly here and the other three are routed to Dev (Delivery
// Findings) with the ROM citation. All four frames share the structural contract below.
const ESHOT1_WHITE_VERTS: Pt[] = [
  [-11, 11], [-17, 17], [-17, -11], [-11, -17], [17, -17], [11, -11], [11, 17], [17, 11],
].map(([x, y]) => ({ x, y }))
const ESHOT1_WHITE_RADII = normalisedRadiiSorted(ESHOT1_WHITE_VERTS)
const RED_DOT_R = Math.hypot(6, 6) // ROM red dots at (±6,±6)

const whiteTicks = (g: Glyph) => g.filter((s) => s.color === 'white')
const redDots = (g: Glyph) => g.filter((s) => s.color === 'red')

describe('AC-3 enemyBoltGlyph frame 0 — the ROM ESHOT1 diagonal ticks + red dots (V-009, ALVROM.MAC:700)', () => {
  it('has FOUR white ticks (2-point segments) and FOUR red dots (1-point marks)', () => {
    const g = enemyBoltGlyph(0)
    expect(whiteTicks(g).length, 'four white diagonal ticks').toBe(4)
    expect(redDots(g).length, 'four red dots').toBe(4)
    for (const t of whiteTicks(g)) expect(t.points.length, 'each tick is a drawn segment').toBe(2)
    for (const d of redDots(g)) expect(d.points.length, 'each red mark is a zero-length dot').toBe(1)
  })

  it('the white ticks are centred on the DIAGONALS, not the cardinals (a pinwheel, not ticks)', () => {
    // Each ROM tick's midpoint is at |x|≈|y|; the eyeballed hooks sit on the axes.
    for (const t of whiteTicks(enemyBoltGlyph(0))) {
      const m = midpoint(t)
      expect(onDiagonal(m), `tick midpoint (${round(m.x)},${round(m.y)}) is not on a diagonal`).toBe(true)
    }
  })

  it('the white ticks carry ESHOT1\'s actual radius signature (a faithful transcription)', () => {
    const verts = whiteTicks(enemyBoltGlyph(0)).flatMap((s) => s.points)
    expect(radiiMatch(normalisedRadiiSorted(verts), ESHOT1_WHITE_RADII), 'white-tick radii do not match ESHOT1').toBe(true)
  })

  it('the red dots sit on the diagonals at (±6,±6), not on the cardinal axes', () => {
    const dots = redDots(enemyBoltGlyph(0)).map((s) => s.points[0])
    const rMax = Math.max(...dots.map(radius))
    for (const d of dots) {
      expect(onDiagonal(d), `red dot (${round(d.x)},${round(d.y)}) is not on a diagonal`).toBe(true)
      // …and at the ROM's radius relative to the white ticks (√72 vs the ticks' 15.6..24).
      expect(radius(d) / rMax).toBeCloseTo(1, 5)
    }
    const whiteMax = Math.max(...whiteTicks(enemyBoltGlyph(0)).flatMap((s) => s.points).map(radius))
    expect(rMax / whiteMax, 'red dots (r≈8.49) are well inside the white ticks (r up to ≈24)').toBeCloseTo(
      RED_DOT_R / Math.hypot(17, 17),
      1,
    )
  })
})

describe('AC-3 enemyBoltGlyph — the ROM two-colour composition across 4 frames', () => {
  it('every frame is exactly white ticks + red dots (ICHCOL=WHITE + CSTAT RED, no stray hue)', () => {
    for (const f of [0, 1, 2, 3]) {
      expect([...colorsOf(enemyBoltGlyph(f))].sort()).toEqual(['red', 'white'])
    }
  })

  it('every frame has four white ticks and four red dots (the ESHOT1-4 composition)', () => {
    for (const f of [0, 1, 2, 3]) {
      expect(whiteTicks(enemyBoltGlyph(f)).length, `frame ${f} white ticks`).toBe(4)
      expect(redDots(enemyBoltGlyph(f)).length, `frame ${f} red dots`).toBe(4)
    }
  })

  it('yields 4 distinct frames and wraps on `frame & 3`', () => {
    const frames = [0, 1, 2, 3].map((f) => fingerprint(enemyBoltGlyph(f)))
    expect(new Set(frames).size).toBe(4)
    expect(fingerprint(enemyBoltGlyph(4))).toBe(fingerprint(enemyBoltGlyph(0)))
    expect(fingerprint(enemyBoltGlyph(7))).toBe(fingerprint(enemyBoltGlyph(3)))
  })
})

describe('AC-3 enemy-shot frame source — the ROM keys the frame off QFRAME, not bullet depth (V-009)', () => {
  it('render.ts does NOT select the enemy-bolt frame from the bullet depth', () => {
    // ROM: `LDA QFRAME / ASL / AND I,6 / ADC I,PTESHO` (ALDISP.MAC:910-914) — a global
    // frame-counter selection. render.ts currently passes `enemyBoltGlyph(Math.floor(
    // b.depth * 8))` (render.ts:356). See Delivery Findings for the QFRAME wiring Dev
    // must add (and dropping the depth-driven `b.depth * Math.PI * 4` spin).
    expect(renderSrc, 'the enemy-bolt frame must not derive from b.depth').not.toMatch(
      /enemyBoltGlyph\(\s*Math\.floor\(\s*b\.depth/,
    )
  })
})

// ===========================================================================
// AC-4 — the vertex data is TRANSCRIBED and cited: V-005/V-007/V-009 remediated_by
// ===========================================================================
// Editing glyphs.ts falsifies each finding's `ours` quote (the bug being removed), so
// the fix must mark it remediated_by so the citation gate keeps `ours` as HISTORY
// (tempest CLAUDE.md, "the fidelity audit and its citation gate"). The ROM `source`
// side stays checked always.
describe('AC-4 — V-005/V-007/V-009 are marked remediated_by tp1-35', () => {
  const findingsDir = fileURLToPath(new URL('../../docs/audit/findings/', import.meta.url))
  const findings = JSON.parse(
    readFileSync(findingsDir + 'pair-2-alvrom-shapes-font.json', 'utf8'),
  ) as Array<Record<string, unknown>>
  const find = (id: string) => findings.find((f) => f.id === id)

  it.each(['V-005', 'V-007', 'V-009'])('%s is remediated_by tp1-35', (id) => {
    expect(find(id), `${id} must exist in the findings`).toBeDefined()
    expect(find(id)?.remediated_by, `${id} must name tp1-35 once its ours-quote is rewritten`).toBe('tp1-35')
  })
})

// ===========================================================================
// AC-5 proof — the transcribed ROM oracles above are well-formed (so the constants
// this file pins against cannot silently drift). Citations live in each comment.
// ===========================================================================
describe('AC-5 — the transcribed ROM oracles are well-formed', () => {
  it('PULS segment multiset is {1,3,6,6,6} — five genuinely distinct topologies', () => {
    expect([...PULS_SEGMENT_MULTISET].sort((a, b) => a - b)).toEqual([1, 3, 6, 6, 6])
    expect(new Set(PULS_SEGMENT_MULTISET).size, 'not all one length — that is the whole point').toBeGreaterThan(1)
  })
  it('TANKP is a 5-vertex chevron taller (12) than wide (10)', () => {
    expect(TANKP_ROM).toHaveLength(5)
    const { w, h } = bbox(TANKP_ROM)
    expect(h).toBeGreaterThan(w)
    expect(h).toBe(12)
    expect(w).toBe(10)
  })
  it('ESHOT1 white ticks: 8 vertices whose 4 segment-midpoints all lie on diagonals', () => {
    expect(ESHOT1_WHITE_VERTS).toHaveLength(8)
    for (let i = 0; i < 8; i += 2) {
      const m = { x: (ESHOT1_WHITE_VERTS[i].x + ESHOT1_WHITE_VERTS[i + 1].x) / 2, y: (ESHOT1_WHITE_VERTS[i].y + ESHOT1_WHITE_VERTS[i + 1].y) / 2 }
      expect(onDiagonal(m), `ESHOT1 segment ${i / 2} midpoint off-diagonal`).toBe(true)
    }
  })
})

// ===========================================================================
// Rule coverage — the Hard Architectural Boundary + purity, and the TypeScript
// lang-review checklist (#1 type-safety escapes, #2 readonly, #8 test quality).
// ===========================================================================
describe('tp1-35 rule coverage — boundary, purity, type-safety, determinism', () => {
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
    expect(glyphSrc).toMatch(/readonly/)
  })

  it('every frame-parameterised shape is deterministic across repeated calls', () => {
    expect(fingerprint(enemyBoltGlyph(2))).toBe(fingerprint(enemyBoltGlyph(2)))
    expect(fingerprint(pulsarBar(3))).toBe(fingerprint(pulsarBar(3)))
    expect(fingerprint(tankerGlyph(1, 'fuseball'))).toBe(fingerprint(tankerGlyph(1, 'fuseball')))
  })
})
