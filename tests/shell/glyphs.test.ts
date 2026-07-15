// tests/shell/glyphs.test.ts
//
// Story 6-8: Authentic enemy + bolt shapes (render fidelity).
//
// Our enemy shapes are go/nogo simplifications drawn inline in render.ts with
// imperative ctx.moveTo/lineTo calls — there is no seam to assert "is this the
// real Tempest glyph?" against. This story replaces them with authentic vector
// glyphs lifted from the rev-3 ROM (`tempest.a65`), preserving each shape's
// animation frames (spin / pulse / writhe).
//
// The testable seam these tests drive into existence is a PURE glyph module,
// `src/shell/glyphs.ts`: each function returns vector path data (colored
// strokes in glyph-local space) that render.ts then strokes onto the canvas.
// Animation is an EXPLICIT argument (e.g. `frame`, mirroring the ROM's
// `timectr & 3`) — never internal time or randomness — so the glyphs are
// deterministic and assertable, and the "single white tip dot, no flicker"
// fidelity correction is enforceable.
//
// Source of truth for every authentic coordinate / count / colour below:
//   tempest/docs/ux/2026-06-27-enemy-roster-rom-extract.md  (verbatim ROM)
//
// Contract these tests assume of src/shell/glyphs.ts:
//   export type GlyphColor = 'red'|'green'|'yellow'|'cyan'|'white'|'orange'|'purple'
//   export interface GlyphStroke {
//     readonly points: readonly { x: number; y: number }[]
//     readonly closed: boolean
//     readonly color: GlyphColor
//   }
//   export type Glyph = readonly GlyphStroke[]
//   export type TankerCargo = 'flipper' | 'pulsar' | 'fuseball'
//   export function flipperGlyph(level: number): Glyph
//   export function tankerGlyph(level: number, cargo: TankerCargo): Glyph
//   export function spikerGlyph(frame: number): Glyph
//   export function spikeGlyph(spikeHeight: number): Glyph
//   export function fuseballGlyph(frame: number): Glyph
//   export function pulsarBar(variant: number): Glyph            // 0=sharpest .. 4=flat
//   export function pulsarVariant(pulsing: number): number       // 8-bit -> 0..4
//   export function pulsarColor(level: number, bright: boolean): GlyphColor  // PULPIC slot 0/4
//   export function enemyBoltGlyph(frame: number): Glyph
//   export function playerClawGlyph(rotation: number): Glyph     // 8 graphics
//   export function playerBulletGlyph(): Glyph
import { describe, it, expect } from 'vitest'
// Read the glyph source as text via Vite's `?raw` (no Node `fs` types — the
// project keeps a deliberately browser-pure type posture). Same idiom the core
// boundary scans use (tests/core/events.test.ts, tests/shell/storage.test.ts).
import glyphSrc from '../../src/shell/glyphs.ts?raw'
import {
  flipperGlyph,
  tankerGlyph,
  spikerGlyph,
  spikeGlyph,
  fuseballGlyph,
  pulsarBar,
  pulsarVariant,
  pulsarColor,
  enemyBoltGlyph,
  playerClawGlyph,
  playerBulletGlyph,
  type Glyph,
  type GlyphColor,
} from '../../src/shell/glyphs'

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

type Pt = { x: number; y: number }

function allPoints(g: Glyph): Pt[] {
  return g.flatMap((s) => s.points.map((p) => ({ x: p.x, y: p.y })))
}

function colorsOf(g: Glyph): Set<GlyphColor> {
  return new Set(g.map((s) => s.color))
}

// A stable string so two glyphs/frames can be compared for distinctness, with
// coordinates rounded so float jitter from rotations doesn't read as "different".
function fingerprint(g: Glyph): string {
  return JSON.stringify(
    g.map((s) => ({
      c: s.color,
      k: s.closed,
      p: s.points.map((p) => [round(p.x), round(p.y)]),
    })),
  )
}
function round(n: number): number {
  return Math.round(n * 1e6) / 1e6
}

// Consecutive segment deltas of an open polyline (length n-1).
function segDeltasOpen(pts: readonly Pt[]): number[][] {
  const d: number[][] = []
  for (let i = 1; i < pts.length; i++) d.push([pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y])
  return d
}
// Segment deltas of a closed loop, including the wrap edge (length n).
function segDeltasClosed(pts: readonly Pt[]): number[][] {
  const d = segDeltasOpen(pts)
  const last = pts[pts.length - 1]
  const first = pts[0]
  d.push([first.x - last.x, first.y - last.y])
  return d
}

function bbox(pts: readonly Pt[]): { w: number; h: number } {
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
}

function peakToPeakY(pts: readonly Pt[]): number {
  const ys = pts.map((p) => p.y)
  return Math.max(...ys) - Math.min(...ys)
}

// True if `actual` deltas equal `rom` deltas under one uniform positive scale k
// (fidelity is shape-exact but scale-free: ROM units vs render units).
function matchUpToScale(actual: number[][], rom: number[][], relTol = 1e-6): boolean {
  if (actual.length !== rom.length) return false
  let k: number | null = null
  for (let i = 0; i < rom.length; i++) {
    for (const c of [0, 1]) {
      if (Math.abs(rom[i][c]) > 1e-9 && k === null) k = actual[i][c] / rom[i][c]
    }
  }
  if (k === null || !(k > 0)) return false
  for (let i = 0; i < rom.length; i++) {
    for (const c of [0, 1]) {
      if (Math.abs(actual[i][c] - k * rom[i][c]) > relTol * Math.max(1, Math.abs(k))) return false
    }
  }
  return true
}

// Closed-shape fidelity, tolerant of which vertex the loop starts on and which
// way it winds (start-index rotation + reversal), all up to uniform scale.
function matchClosedShapeUpToScale(actual: number[][], rom: number[][]): boolean {
  const n = rom.length
  if (actual.length !== n) return false
  const reversed = [...rom].reverse().map(([x, y]) => [-x, -y]) // reverse a delta loop = negate, reverse order
  for (const base of [rom, reversed]) {
    for (let s = 0; s < n; s++) {
      const rotated = base.map((_, i) => base[(i + s) % n])
      if (matchUpToScale(actual, rotated)) return true
    }
  }
  return false
}

// ---------------------------------------------------------------------------
// Authentic ROM constants (verbatim from the enemy-roster extract)
// ---------------------------------------------------------------------------

// Flipper graphic-0 point-vector `_pv_t3`, l.14355-14365.
const FLIPPER_ROM_DELTAS = [
  [4, 1], [4, -1], [-2, 1], [1, 1], [-3, -1], [-3, 1], [1, -1], [-2, -1],
]
// Pulsar sharpest zig-zag `_pv_offset_9` (variant 1 / graphic 9), l.14467 area.
const PULSAR_SHARPEST_ROM_DELTAS = [
  [2, -3], [1, 6], [1, -6], [1, 6], [1, -6], [2, 3],
]

// Player CURSOR shapes (Story 12-1). Book §8 verbatim deltas
// (docs/tempest-1981-source-findings.md) for the graphics AC-7 names as the test
// oracle. Each closes (deltas sum to 0,0). NCRS8's listing opens with a
// 3-component `3,1,0` — read as a beam-off MOVE to (3,1) preceding an 8-vector
// drawn loop; the drawn silhouette is those 8 vectors, transcribed below.
const NCRS1_ROM_DELTAS = [
  [0, -2], [2, -1], [3, 4], [-3, -3], [-1, 0], [0, 2], [2, 1], [-3, -1],
]
const NCRS4_ROM_DELTAS = [
  [3, -2], [5, 2], [-3, 1], [2, -1], [-4, -1], [-2, 1], [2, 1], [-3, -1],
]
const NCRS8_ROM_DRAWN_DELTAS = [
  [3, -4], [2, 1], [0, 2], [-3, 1], [2, -1], [0, -2], [-1, 0], [-3, 3],
]

// ===========================================================================
// A. Flipper — RED bowtie/butterfly, 8 closed segments, 2 V-wings + crossing
// ===========================================================================
describe('flipperGlyph (Story 6-8: authentic bowtie/butterfly)', () => {
  it('is a single closed RED stroke', () => {
    const g = flipperGlyph(1)
    expect(g).toHaveLength(1)
    expect(g[0].closed).toBe(true)
    expect(g[0].color).toBe<GlyphColor>('red')
  })

  it('has 8 segments (8 vertices) per the ROM point-vector', () => {
    const g = flipperGlyph(1)
    expect(g[0].points).toHaveLength(8)
    expect(segDeltasClosed(g[0].points)).toHaveLength(8)
  })

  it('is geometrically closed: segment deltas sum to zero', () => {
    const deltas = segDeltasClosed(flipperGlyph(1)[0].points)
    const sx = deltas.reduce((a, d) => a + d[0], 0)
    const sy = deltas.reduce((a, d) => a + d[1], 0)
    expect(Math.abs(sx)).toBeLessThan(1e-6)
    expect(Math.abs(sy)).toBeLessThan(1e-6)
  })

  it('has the central crossing — two vertices coincide (the bowtie, not a simple ring)', () => {
    const pts = flipperGlyph(1)[0].points
    let coincident = false
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        if (Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) < 1e-6) coincident = true
      }
    }
    expect(coincident).toBe(true)
  })

  it('matches the authentic _pv_t3 shape (up to scale, start vertex and winding)', () => {
    const deltas = segDeltasClosed(flipperGlyph(1)[0].points)
    expect(matchClosedShapeUpToScale(deltas, FLIPPER_ROM_DELTAS)).toBe(true)
  })
})

// ===========================================================================
// B. Tanker — elongated X-diamond body (color idx 2) + cargo emblem variants
// ===========================================================================
describe('tankerGlyph (Story 6-8: X-diamond + cargo emblem by split type)', () => {
  it('has a PURPLE diamond body (GENTNK)', () => {
    // tp1-17 RE-SEAT: Story 6-8 pinned this body as an *elongated* (9×6), closed
    // 4-point diamond. Audit V-006 refutes that — the ROM's GENTNK (ALVROM.MAC:651)
    // is a SQUARE 17-vertex laced double diamond, and it is not necessarily a closed
    // loop. Those specifics now live in tests/shell/tp1-17.shapes.test.ts; here we
    // keep only the invariant that survives both shapes: there IS a purple body.
    const g = tankerGlyph(1, 'flipper')
    const body = g.find((s) => s.color === 'purple')
    expect(body, 'tanker body stroke (GENTNK purple)').toBeDefined()
    expect(bbox(body!.points).w, 'the body has real geometry').toBeGreaterThan(0)
  })

  it('renders a distinct emblem per cargo type (showing what it splits into)', () => {
    const f = fingerprint(tankerGlyph(1, 'flipper'))
    const p = fingerprint(tankerGlyph(1, 'pulsar'))
    const z = fingerprint(tankerGlyph(1, 'fuseball'))
    expect(new Set([f, p, z]).size).toBe(3)
  })

  it('omits the emblem for a flipper-cargo tanker but adds one for pulsar/fuseball cargo', () => {
    // ROM: flipper-tanker has NO emblem (l.4798); pulsar (4628) & fuzzball (4711)
    // prepend a cargo emblem, so they carry strictly more strokes than the body.
    const flipperT = tankerGlyph(1, 'flipper')
    expect(tankerGlyph(1, 'pulsar').length).toBeGreaterThan(flipperT.length)
    expect(tankerGlyph(1, 'fuseball').length).toBeGreaterThan(flipperT.length)
  })
})

// ===========================================================================
// C. Spiker — outward pinwheel, 4 spin frames on `timectr & 3`
// ===========================================================================
describe('spikerGlyph (Story 6-8: 4-frame spinning pinwheel)', () => {
  it('yields 4 distinct spin frames', () => {
    const frames = [0, 1, 2, 3].map((f) => fingerprint(spikerGlyph(f)))
    expect(new Set(frames).size).toBe(4)
  })

  it('selects the frame with `frame & 3` (wraps every 4)', () => {
    expect(fingerprint(spikerGlyph(4))).toBe(fingerprint(spikerGlyph(0)))
    expect(fingerprint(spikerGlyph(7))).toBe(fingerprint(spikerGlyph(3)))
  })

  it('is a multi-segment winding spiral with the same vertex count each frame', () => {
    const counts = [0, 1, 2, 3].map((f) => allPoints(spikerGlyph(f)).length)
    for (const c of counts) expect(c).toBeGreaterThanOrEqual(8) // a real spiral, not a plus-sign
    expect(new Set(counts).size).toBe(1) // one shape, four rotations — vertex count is stable
  })
})

// ===========================================================================
// C'. The spike — dynamic line, length proportional to spike_ht, ONE white tip
// ===========================================================================
describe('spikeGlyph (Story 6-8: dynamic spike, single white tip, no flicker)', () => {
  it('grows monotonically and ~proportionally with spike height', () => {
    const len = (h: number) => {
      const line = spikeGlyph(h).find((s) => s.color !== 'white')!
      const a = line.points[0]
      const b = line.points[line.points.length - 1]
      return Math.hypot(b.x - a.x, b.y - a.y)
    }
    const l1 = len(0.2)
    const l2 = len(0.4)
    const l3 = len(0.8)
    expect(l2).toBeGreaterThan(l1)
    expect(l3).toBeGreaterThan(l2)
    // proportional: length / height is roughly constant (linear in height).
    expect(Math.abs(l2 / 0.4 - l1 / 0.2)).toBeLessThan(0.2 * (l1 / 0.2))
  })

  it('caps the spike with exactly ONE white tip point (no 4-dot sparkle, no flicker)', () => {
    const g = spikeGlyph(0.5)
    const whites = g.filter((s) => s.color === 'white')
    const whitePoints = whites.flatMap((s) => s.points)
    // Authentic ROM: a single zero-length white point (JADOT: VCTR 0,0). The
    // earlier "random 4-dot sparkle" reading was superseded — guard against it.
    expect(whitePoints).toHaveLength(1)
  })

  it('is deterministic — same height in, identical glyph out (no flicker)', () => {
    expect(fingerprint(spikeGlyph(0.5))).toBe(fingerprint(spikeGlyph(0.5)))
  })

  it('draws no spike line at zero height', () => {
    const g = spikeGlyph(0)
    const line = g.find((s) => s.color !== 'white')
    if (line) {
      const a = line.points[0]
      const b = line.points[line.points.length - 1]
      expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeLessThan(1e-6)
    } else {
      expect(line).toBeUndefined()
    }
  })
})

// ===========================================================================
// D. Fuseball — chaotic multi-color ball-of-legs, legs redrawn each frame
// ===========================================================================
describe('fuseballGlyph (Story 6-8: writhing multi-color ball-of-legs)', () => {
  it('uses all three authentic colour groups: red, yellow and cyan', () => {
    const cols = colorsOf(fuseballGlyph(0))
    expect(cols.has('red')).toBe(true)
    expect(cols.has('yellow')).toBe(true)
    expect(cols.has('cyan')).toBe(true)
  })

  it('is a ball of many legs (several strokes)', () => {
    expect(fuseballGlyph(0).length).toBeGreaterThanOrEqual(5)
  })

  it('fully redraws the legs each of 4 frames (writhe — all distinct)', () => {
    const frames = [0, 1, 2, 3].map((f) => fingerprint(fuseballGlyph(f)))
    expect(new Set(frames).size).toBe(4)
  })

  it('wraps the frame every 4', () => {
    expect(fingerprint(fuseballGlyph(4))).toBe(fingerprint(fuseballGlyph(0)))
  })
})

// ===========================================================================
// E. Pulsar — zig-zag bar, 5 jaggedness variants, cyan<->white strobe
// ===========================================================================
describe('pulsarBar (Story 6-8: 5 jaggedness variants, sharp -> flat)', () => {
  it('variant 0 is the sharpest authentic zig-zag (matches _pv_offset_9 up to scale)', () => {
    const v0 = pulsarBar(0)
    expect(v0).toHaveLength(1)
    expect(v0[0].closed).toBe(false)
    expect(v0[0].points).toHaveLength(PULSAR_SHARPEST_ROM_DELTAS.length + 1)
    expect(matchUpToScale(segDeltasOpen(v0[0].points), PULSAR_SHARPEST_ROM_DELTAS)).toBe(true)
  })

  it('amplitude does not grow from the sharp end to the flat end (sharp → flat ordering)', () => {
    // tp1-35 RE-SEAT: this once asserted STRICT monotonic amplitude, which encoded the
    // "one table amplitude-scaled five ways" bug. The ROM's five chains (PULS0-4,
    // ALDISP.MAC:2001-2035) differ in TOPOLOGY, not just amplitude — PULS1 (3-segment)
    // and PULS2 (6-segment) share a peak-to-peak amplitude of 2, so strict `<` is false
    // there. Weakened to non-increasing: variant 0 (sharpest) ≥ … ≥ variant 4 (flat),
    // which holds under BOTH the current table and tp1-35's distinct chains. The real
    // per-topology contract is pinned in tp1-35.shapes.test.ts (segment multiset).
    const amps = [0, 1, 2, 3, 4].map((v) => peakToPeakY(allPoints(pulsarBar(v))))
    for (let i = 1; i < amps.length; i++) expect(amps[i]).toBeLessThanOrEqual(amps[i - 1])
  })

  it('variant 4 is a flat line (zero amplitude)', () => {
    expect(peakToPeakY(allPoints(pulsarBar(4)))).toBeLessThan(1e-6)
  })
})

describe('pulsarVariant (Story 6-8: (pulsing+0x40)>>4 jaggedness selector, clamped)', () => {
  // ROM: idx = ((pulsing + 0x40) & 0xff) >> 4; ?dp_t1 = $0d,$0c,$0b,$0a,$09,$09;
  // variant = graphic - 9  -> 0=sharp(graphic 9) .. 4=flat(graphic 13).
  it.each([
    [0xc0, 4], // idx 0 -> graphic 0x0d -> flat
    [0xd0, 3],
    [0xe0, 2],
    [0xf0, 1],
    [0x00, 0], // idx 4 -> graphic 0x09 -> sharpest
  ])('maps pulsing=0x%s to variant %i', (pulsing, variant) => {
    expect(pulsarVariant(pulsing)).toBe(variant)
  })

  it('always returns a clamped variant in [0,4] across the full byte range', () => {
    for (let p = 0; p < 256; p += 7) {
      const v = pulsarVariant(p)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(4)
    }
  })
})

describe('pulsarColor (Story 6-8: cyan<->white strobe)', () => {
  it('strobes between cyan and white', () => {
    // tp1-30 made pulsarColor level-keyed (PULPIC slot 0/4 per bank); at level 1
    // (bank 0) the slots resolve to the historic white/cyan this story pinned.
    expect(pulsarColor(1, false)).toBe<GlyphColor>('cyan')
    expect(pulsarColor(1, true)).toBe<GlyphColor>('white')
  })
})

// ===========================================================================
// F. Enemy bolt — white pinwheel + red central cross, 4 spin frames
// ===========================================================================
describe('enemyBoltGlyph (Story 6-8: white pinwheel + red cross, 4 frames)', () => {
  it('carries both the white pinwheel and the red central cross', () => {
    const cols = colorsOf(enemyBoltGlyph(0))
    expect(cols.has('white')).toBe(true)
    expect(cols.has('red')).toBe(true)
  })

  it('yields 4 distinct spin frames', () => {
    const frames = [0, 1, 2, 3].map((f) => fingerprint(enemyBoltGlyph(f)))
    expect(new Set(frames).size).toBe(4)
  })

  it('wraps the spin frame every 4', () => {
    expect(fingerprint(enemyBoltGlyph(4))).toBe(fingerprint(enemyBoltGlyph(0)))
  })
})

// ===========================================================================
// G. Player claw — authentic ROM CURSOR shapes NCRS1–8 (Story 12-1)
// ===========================================================================
// Story 6-8 shipped a STYLIZED chevron+crossbar stand-in (dead code — drawPlayer
// never called it). Story 12-1 replaces it with the byte-exact ROM CURSOR: 8
// shapes NCRS1–NCRS8 (_pv_t3 graphics 1–8), a compact closed vector loop pinned
// at the rim, re-rolled per lane. Oracle: book §8 samples name NCRS1/4/8 (AC-7).
// The disassembly (_pv_t3 graphics 1–8) is authoritative for the full table; if
// it disagrees with these OCR-prone book samples, the disassembly wins and these
// oracle constants are updated (see the story's Delivery Findings).

// Delta chain of the single-stroke claw glyph, honouring its closed flag so N
// vertices → N deltas for a closed loop (matches the flipper's fidelity idiom).
function clawDeltas(g: Glyph): number[][] {
  const s = g[0]
  return s.closed ? segDeltasClosed(s.points) : segDeltasOpen(s.points)
}

describe('playerClawGlyph (Story 12-1: authentic ROM CURSOR NCRS1–8, yellow)', () => {
  it('is a single closed stroke (one continuous cursor loop)', () => {
    const g = playerClawGlyph(0)
    expect(g).toHaveLength(1)
    expect(g[0].closed).toBe(true)
  })

  it('is yellow (CLAW_COLOR) on every graphic', () => {
    for (const roll of [0, 1, 2, 3, 4, 5, 6, 7]) {
      for (const s of playerClawGlyph(roll)) expect(s.color).toBe<GlyphColor>('yellow')
    }
  })

  it('graphic 1 (roll 0) is byte-exact NCRS1 (up to scale, start vertex & winding)', () => {
    const deltas = clawDeltas(playerClawGlyph(0))
    expect(deltas).toHaveLength(NCRS1_ROM_DELTAS.length)
    expect(matchClosedShapeUpToScale(deltas, NCRS1_ROM_DELTAS)).toBe(true)
  })

  it('graphic 4 (roll 3) is byte-exact NCRS4 (up to scale, start vertex & winding)', () => {
    const deltas = clawDeltas(playerClawGlyph(3))
    expect(deltas).toHaveLength(NCRS4_ROM_DELTAS.length)
    expect(matchClosedShapeUpToScale(deltas, NCRS4_ROM_DELTAS)).toBe(true)
  })

  it('graphic 8 (roll 7) is byte-exact NCRS8 (its 8-vector drawn loop, up to scale/start/winding)', () => {
    const deltas = clawDeltas(playerClawGlyph(7))
    expect(deltas).toHaveLength(NCRS8_ROM_DRAWN_DELTAS.length)
    expect(matchClosedShapeUpToScale(deltas, NCRS8_ROM_DRAWN_DELTAS)).toBe(true)
  })

  it('every one of the 8 graphics CLOSES: its deltas sum to (0,0), as the ROM shapes do', () => {
    for (let roll = 0; roll < 8; roll++) {
      const deltas = clawDeltas(playerClawGlyph(roll))
      const sx = deltas.reduce((a, d) => a + d[0], 0)
      const sy = deltas.reduce((a, d) => a + d[1], 0)
      expect(Math.abs(sx), `graphic ${roll + 1} x-close`).toBeLessThan(1e-6)
      expect(Math.abs(sy), `graphic ${roll + 1} y-close`).toBeLessThan(1e-6)
    }
  })

  it('is a compact ~8-unit cursor, NOT the old articulated walker', () => {
    // Guard against a re-emergent sprawling multi-limb shape: the ROM cursor is a
    // small vector chain, so its glyph-unit bounding box stays small.
    for (let roll = 0; roll < 8; roll++) {
      const { w, h } = bbox(allPoints(playerClawGlyph(roll)))
      expect(Math.max(w, h), `graphic ${roll + 1} has real geometry`).toBeGreaterThan(1)
      expect(Math.max(w, h), `graphic ${roll + 1} stays compact`).toBeLessThan(20)
    }
  })

  it('has 8 distinct authentic graphics (re-rolled shapes, not one silhouette spun)', () => {
    const graphics = [0, 1, 2, 3, 4, 5, 6, 7].map((r) => fingerprint(playerClawGlyph(r)))
    expect(new Set(graphics).size).toBe(8)
  })

  it('wraps the roll every 8 graphics', () => {
    expect(fingerprint(playerClawGlyph(8))).toBe(fingerprint(playerClawGlyph(0)))
    expect(fingerprint(playerClawGlyph(-1))).toBe(fingerprint(playerClawGlyph(7)))
  })
})

// ===========================================================================
// H. Player bullet — the ROM DIARA2 (17 dots), see tp1-17.shapes.test.ts
// ===========================================================================
describe('playerBulletGlyph (tp1-17 RE-SEAT: the ROM DIARA2 is 17 dots, not two octagons)', () => {
  // Story 6-8 pinned two stroked, regular-octagon outlines. Audit V-010/DA-004
  // refute that: the ROM's DIARA2 (ALVROM.MAC:383-403) is 17 loose SCDOT dots in
  // two rings, only the inner ring ammo-tinted. The exhaustive ROM pins now live in
  // tests/shell/tp1-17.shapes.test.ts; this guards the headline contract in place so
  // the old octagon silhouette cannot creep back.
  it('is 17 single-point dots, not stroked polygon outlines', () => {
    const g = playerBulletGlyph('yellow')
    expect(g.filter((s) => s.points.length === 1)).toHaveLength(17)
    expect(g.some((s) => s.points.length > 2), 'no multi-point ring outlines remain').toBe(false)
  })
})

// ===========================================================================
// Rule coverage — architectural boundary + purity (tempest's #1 rule) and
// TypeScript lang-review #1 (no type-safety escapes).
// ===========================================================================
describe('glyph module rules (boundary + purity + type safety)', () => {
  it('is render-only: never imports from the sim/state/rules/rng/enemies core', () => {
    // The Hard Architectural Boundary (tempest CLAUDE.md): glyphs are SHELL. They
    // may borrow the pure `Point` type from core/geometry, but must not couple to
    // mutable sim state. Story 6-8 AC: "Shell/render-only: src/core/ untouched."
    expect(glyphSrc).not.toMatch(/from\s+['"]\.\.\/core\/(sim|state|rules|rng|enemies)/)
  })

  it('is pure: no Math.random, Date, or performance time in glyph geometry', () => {
    // Determinism is what makes "no flicker" and frame-exact fidelity testable;
    // animation must arrive as explicit args, never ambient time/randomness.
    expect(glyphSrc).not.toMatch(/Math\.random|Date\.now|new Date\(|performance\.now/)
  })

  it('uses no `as any` / @ts-ignore type-safety escapes (TS lang-review #1)', () => {
    expect(glyphSrc).not.toMatch(/\bas any\b/)
    expect(glyphSrc).not.toMatch(/@ts-ignore/)
  })

  it('every animated glyph is deterministic across repeated calls', () => {
    // One strong purity assertion covering all frame-parameterised glyphs.
    expect(fingerprint(spikerGlyph(1))).toBe(fingerprint(spikerGlyph(1)))
    expect(fingerprint(fuseballGlyph(2))).toBe(fingerprint(fuseballGlyph(2)))
    expect(fingerprint(enemyBoltGlyph(3))).toBe(fingerprint(enemyBoltGlyph(3)))
    expect(fingerprint(playerClawGlyph(5))).toBe(fingerprint(playerClawGlyph(5)))
    expect(fingerprint(pulsarBar(2))).toBe(fingerprint(pulsarBar(2)))
  })
})
