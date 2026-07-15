// src/shell/glyphs.ts
//
// Story 6-8: authentic enemy / bolt / player vector glyphs.
//
// A PURE, deterministic glyph library. Each function returns the vector path
// data for a shape in glyph-local space (origin-centred); render.ts scales,
// positions and strokes it. Animation is an EXPLICIT argument (a `frame`,
// `variant` or `pulsing` value mirroring the ROM's `timectr & 3` /
// `(pulsing+0x40)>>4`) — never ambient time or randomness — so the glyphs stay
// frame-exact and flicker-free.
//
// Shapes are lifted from the rev-3 ROM (`tempest.a65`); see the verbatim
// `pv_draw`/`vldraw` data in docs/ux/2026-06-27-enemy-roster-rom-extract.md.
// This module is SHELL-only: it never imports the sim/core (the Hard
// Architectural Boundary), keeping it a deterministic value producer.

// The palette's turquoise is `cyan`; `blue` (ZBLUE) is distinct from it — the ROM
// carries both, so the type must too (tp1-12 / V-011). `orange` is NOT a palette
// colour (it is the spiker's, tp1-3); it stays here for its non-palette uses.
export type GlyphColor = 'red' | 'green' | 'yellow' | 'cyan' | 'white' | 'orange' | 'purple' | 'blue'

// A COLTAB slot can also resolve to black — the invisible well of waves 65-80
// (ALDISP.MAC:2447 `.BYTE ZBLACK`). No glyph is ever black (only the well, which
// is not a glyph), so `black` is a palette colour, not a GlyphColor.
export type PaletteColor = GlyphColor | 'black'

/** Narrow a resolved palette colour to a glyph colour. The enemy slots (0-5, 7)
 *  are never the bank-4 invisible-well black — only slot 6 is (ALDISP.MAC:2447) —
 *  so this keeps "no glyph is ever black" true; the fallback never fires for them. */
function asGlyphColor(c: PaletteColor): GlyphColor {
  return c === 'black' ? 'white' : c
}

export interface GlyphStroke {
  readonly points: readonly { readonly x: number; readonly y: number }[]
  readonly closed: boolean
  readonly color: GlyphColor
}

export type Glyph = readonly GlyphStroke[]

/** What a tanker splits into — drives its cargo emblem. */
export type TankerCargo = 'flipper' | 'pulsar' | 'fuseball'

// --------------------------------------------------------------------------
// Local geometry helpers
// --------------------------------------------------------------------------

interface V {
  x: number
  y: number
}

function rotPoint(p: V, a: number): V {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c }
}

function rotPoints(pts: readonly V[], a: number): V[] {
  return pts.map((p) => rotPoint(p, a))
}

function rotStroke(stroke: GlyphStroke, a: number): GlyphStroke {
  return { points: stroke.points.map((p) => rotPoint(p, a)), closed: stroke.closed, color: stroke.color }
}

/** Translate a point set so its centroid sits on the origin. */
function center(pts: readonly V[]): V[] {
  const n = pts.length
  const cx = pts.reduce((a, p) => a + p.x, 0) / n
  const cy = pts.reduce((a, p) => a + p.y, 0) / n
  return pts.map((p) => ({ x: p.x - cx, y: p.y - cy }))
}

/** Accumulate a list of (dx,dy) point-vector deltas into absolute vertices. */
function fromDeltas(deltas: readonly [number, number][], ampY = 1): V[] {
  const pts: V[] = [{ x: 0, y: 0 }]
  let x = 0
  let y = 0
  for (const [dx, dy] of deltas) {
    x += dx
    y += dy * ampY
    pts.push({ x, y })
  }
  return pts
}

/** The largest |x| or |y| across a vertex list — its half-extent from the origin. */
function maxExtent(verts: readonly (readonly [number, number])[]): number {
  return Math.max(...verts.flatMap(([x, y]) => [Math.abs(x), Math.abs(y)]))
}

/** Uniformly scale raw ROM object-unit vertices into the module's glyph-local space
 *  (render.ts applies the final per-object scale). `k` overrides the derived factor
 *  so several related tables (e.g. the fuseball's four frames) share ONE scale and
 *  do not pulse in size. Shape is preserved exactly — only the units change. */
function scaleVerts(verts: readonly (readonly [number, number])[], target: number, k?: number): V[] {
  const s = k ?? target / maxExtent(verts)
  return verts.map(([x, y]) => ({ x: x * s, y: y * s }))
}

// ==========================================================================
// A. Flipper — RED 8-segment closed bowtie/butterfly (_pv_t3, ROM l.14355).
// ==========================================================================
const FLIPPER_DELTAS: readonly [number, number][] = [
  [4, 1], [4, -1], [-2, 1], [1, 1], [-3, -1], [-3, 1], [1, -1], [-2, -1],
]

export function flipperGlyph(level: number): Glyph {
  // The deltas sum to (0,0) → a closed loop. Accumulating them lands the final
  // vertex back on the origin, so drop it: 8 distinct vertices, one of which
  // coincides with an earlier vertex (the bowtie's central crossing).
  const verts = fromDeltas(FLIPPER_DELTAS).slice(0, FLIPPER_DELTAS.length)
  // FLICOL is COLRAM slot 3 (ALDISP.MAC:670 `LDA I,FLICOL`; RED=3, ALCOMN.MAC:354):
  // the per-bank FLIPPERS slot — red only in bank 0, purple/green/yellow beyond (V-019).
  return [{ points: center(verts), closed: true, color: asGlyphColor(paletteColor(level, 3)) }]
}

// ==========================================================================
// B. Tanker — elongated PURPLE X-diamond body + cargo emblem (draw_tanker).
// ==========================================================================
// GENTNK — the ROM tanker body, ALVROM.MAC:651-668 (V-006). Seventeen SCVEC
// ABSOLUTE vertices (hex object units; CM=2 is a uniform scale we normalise away),
// entered from TANKR's beam-off move to (0x20,0) — so the drawn polyline starts
// there. An OUTER diamond {(±0x20,0),(0,±0x20)} laced through an INNER diamond
// {(±0x0c,0),(0,±0x0c)}: Theurer's square, laced double diamond, not our old
// elongated 9×6 single diamond. Colour is COLRAM slot 2 (TANCOL=PURPLE, bank 0);
// only the BODY recolours per bank — the cargo emblem keeps its signalling hue (V-019).
const GENTNK_VERTS: readonly [number, number][] = [
  [0x20, 0], // TANKR beam-off entry; the first lit vector draws from here
  [0, 0x20], [0, 0x0c], [0x20, 0], [0x0c, 0], [0, 0x0c], [-0x0c, 0], [0, 0x20], [-0x20, 0],
  [-0x0c, 0], [0, -0x0c], [-0x20, 0], [0, -0x20], [0, -0x0c], [0x0c, 0], [0, -0x20], [0x20, 0], [0x0c, 0],
]

export function tankerGlyph(level: number, cargo: TankerCargo): Glyph {
  const body: GlyphStroke = {
    points: scaleVerts(GENTNK_VERTS, 9), // normalise the ±0x20 outer ring to the module's ~±9
    closed: false, // GENTNK is an open laced chain (RTSL, no closing vector)
    color: asGlyphColor(paletteColor(level, 2)),
  }
  // Flipper-cargo tanker carries no emblem (ROM l.4798); pulsar (l.4628) and
  // fuzzball (l.4711) cargo each prepend a distinct emblem showing the split.
  if (cargo === 'flipper') return [body]
  const emblem: GlyphStroke =
    cargo === 'pulsar'
      ? { points: [{ x: -3, y: 0 }, { x: -1, y: -2 }, { x: 1, y: 2 }, { x: 3, y: 0 }], closed: false, color: 'cyan' }
      : { points: [{ x: 0, y: -3 }, { x: 0, y: 3 }, { x: -3, y: 0 }, { x: 3, y: 0 }], closed: false, color: 'yellow' }
  return [emblem, body]
}

// ==========================================================================
// C. Spiker (Theurer's "traler") — the ROM's authored 21-point GREEN spiral.
// ==========================================================================
// SPIRA1, ALVROM.MAC:524-544 (V-008): 21 SCVEC ABSOLUTE vertices winding strictly
// outward (radius 1.4→21). The ROM stores four tables SPIRA1-4, but they are EXACT
// 90° rotations of this one — verified vertex-for-vertex against ALVROM.MAC:549-619
// (SPIRA2 === rot90(SPIRA1), etc.) — so rotating SPIRA1 by (frame&3)·90° reproduces
// all four frames byte-for-byte. (This corrects V-008's "re-authored, not rotated":
// the frames ARE rotations; the real divergence tp1-17 fixes is 12→21 points and the
// authored curve, not the rotation mechanism.) Colour GREEN (ALCOMN TRACOL=GREEN).
const SPIRA1: readonly V[] = scaleVerts([
  [1, -1], [0, -2], [-2, -2], [-4, 0], [-4, 4], [0, 6], [5, 5], [8, 0], [7, -7], [0, -0x0a], [-8, -8],
  [-0x0c, 0], [-9, 9], [0, 0x0e], [0x0b, 0x0b], [0x10, 0], [0x0c, -0x0c], [0, -0x12], [-0x0e, -0x0e], [-0x14, 0], [-0x0f, 0x0f],
], 9)

export function spikerGlyph(frame: number): Glyph {
  const a = (frame & 3) * (Math.PI / 2) // four frames, each SPIRA1 turned +90°
  return [{ points: rotPoints(SPIRA1, a), closed: false, color: 'green' }]
}

// ==========================================================================
// C'. The spike — dynamic GREEN line ∝ height, capped by ONE white tip dot.
// ==========================================================================
const SPIKE_UNIT = 24

export function spikeGlyph(spikeHeight: number): Glyph {
  if (spikeHeight <= 0) return []
  const len = spikeHeight * SPIKE_UNIT
  return [
    { points: [{ x: 0, y: 0 }, { x: 0, y: -len }], closed: false, color: 'green' },
    // Single zero-length white point (ROM JADOT: VCTR 0,0) — no flicker, no sparkle.
    { points: [{ x: 0, y: -len }], closed: false, color: 'white' },
  ]
}

// ==========================================================================
// D. Fuseball — the ROM's FUSE0-3, five-colour authored scribbles.
// ==========================================================================
// FUSE0-3, ALVROM.MAC:954-1095 (V-014). Four separately hand-authored writhe frames
// (NOT rotations of one another), each a scribble of FIVE colour groups drawn in a
// fixed CSTAT order — red, yellow, green, purple, turquoise(→cyan). Each group is an
// open polyline of absolute SCVEC vertices (hex object units, CM=2 folded into the
// shared scale). Our old shape was a 9-leg procedural starburst in only red/yellow/
// cyan — GREEN and PURPLE never appeared.
interface FuseGroup {
  readonly color: GlyphColor
  readonly verts: readonly [number, number][]
}
const FUSE_FRAMES: readonly (readonly FuseGroup[])[] = [
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

// One shared scale across all four frames (the global half-extent → the module's ~9)
// so the fuseball does not pulse in size between writhe frames. Built once, immutable.
const FUSE_SCALE = 9 / Math.max(...FUSE_FRAMES.flatMap((f) => f.map((g) => maxExtent(g.verts))))
const FUSE_GLYPHS: readonly Glyph[] = FUSE_FRAMES.map((frame) =>
  frame.map((g) => ({ points: scaleVerts(g.verts, 9, FUSE_SCALE), closed: false, color: g.color })),
)

export function fuseballGlyph(frame: number): Glyph {
  return FUSE_GLYPHS[frame & 3] // 4 authored writhe frames
}

// ==========================================================================
// E. Pulsar — horizontal zig-zag bar, 5 jaggedness variants + cyan/white strobe.
// ==========================================================================
// Sharpest authentic zig-zag (`_pv_offset_9`, graphic 9); later variants reuse
// the same x-stride and flatten the y-amplitude toward the flat variant.
const PULSAR_XD: readonly number[] = [2, 1, 1, 1, 1, 2]
const PULSAR_YD: readonly [number, number][] = [
  [0, -3], [0, 6], [0, -6], [0, 6], [0, -6], [0, 3],
]
const PULSAR_AMP: readonly number[] = [1, 0.6, 0.35, 0.15, 0] // variant 0 sharpest .. 4 flat

function clampVariant(v: number): number {
  return Math.max(0, Math.min(4, Math.round(v)))
}

export function pulsarBar(variant: number): Glyph {
  const amp = PULSAR_AMP[clampVariant(variant)]
  const pts: V[] = [{ x: 0, y: 0 }]
  let x = 0
  let y = 0
  for (let i = 0; i < PULSAR_XD.length; i++) {
    x += PULSAR_XD[i]
    y += PULSAR_YD[i][1] * amp
    pts.push({ x, y })
  }
  return [{ points: center(pts), closed: false, color: 'cyan' }]
}

// `(pulsing + 0x40) >> 4` (8-bit) selects a graphic via ?dp_t1; map to a 0..4
// variant index (0 = sharpest / graphic 9, 4 = flat / graphic 13). Clamped.
const PULSAR_DP_T1: readonly number[] = [0x0d, 0x0c, 0x0b, 0x0a, 0x09, 0x09]

export function pulsarVariant(pulsing: number): number {
  const idx = Math.min(((pulsing + 0x40) & 0xff) >> 4, PULSAR_DP_T1.length - 1)
  return PULSAR_DP_T1[idx] - 0x09
}

// PULPIC (ALDISP.MAC:861-867) does not hard-code hues — it SELECTS a COLRAM slot:
// `LDA I,WHITE`(=slot 0) while pulsing, `LDA I,TURQOI`(=slot 4, PULSARS) when idle
// (WHITE/TURQOI are slot indices, ALCOMN.MAC:351-358). Both resolve through the bank,
// so a dormant pulsar recolours per wave-group (cyan/yellow/purple/… ) while a pulsing
// one is white in every bank. "white/cyan" is merely bank 0's instance of slots 0/4.
export function pulsarColor(level: number, bright: boolean): GlyphColor {
  return asGlyphColor(paletteColor(level, bright ? 0 : 4))
}

/** A warp-starfield plane's colour (DSTARF, ALDISP.MAC:2949-2961): every plane is
 *  BLUE (slot 6) for waves 1-4; from wave 5 each plane takes its own index `& 7`
 *  (index 7 remapped to slot 4), resolved through the wave-group bank. */
export function starColor(level: number, planeIndex: number): PaletteColor {
  if (level < 5) return paletteColor(level, 6) // BLUE — paletteColor guards a non-finite level
  const idx = planeIndex & 7
  return paletteColor(level, idx === 7 ? 4 : idx)
}

// ==========================================================================
// F. Enemy bolt — white pinwheel (4 hooks) + red central cross, 4 spin frames.
// ==========================================================================
const BOLT_SIZE = 10

function enemyBoltBase(): GlyphStroke[] {
  const strokes: GlyphStroke[] = []
  // White pinwheel: a hook off each of four corners.
  for (let k = 0; k < 4; k++) {
    const a = k * (Math.PI / 2)
    const corner: V = { x: Math.cos(a) * BOLT_SIZE, y: Math.sin(a) * BOLT_SIZE }
    const hook: V = {
      x: corner.x + Math.cos(a + Math.PI / 2) * BOLT_SIZE * 0.6,
      y: corner.y + Math.sin(a + Math.PI / 2) * BOLT_SIZE * 0.6,
    }
    strokes.push({ points: [corner, hook], closed: false, color: 'white' })
  }
  // Red central 4-dot cross.
  for (let k = 0; k < 4; k++) {
    const a = k * (Math.PI / 2)
    strokes.push({
      points: [{ x: Math.cos(a) * BOLT_SIZE * 0.45, y: Math.sin(a) * BOLT_SIZE * 0.45 }],
      closed: false,
      color: 'red',
    })
  }
  return strokes
}

export function enemyBoltGlyph(frame: number): Glyph {
  // 4 spin frames. Rotate by 22.5deg/frame so the 4-fold-symmetric pinwheel
  // reads as four distinct frames (a 90deg step would alias onto itself).
  const a = (frame & 3) * (Math.PI / 8)
  return enemyBoltBase().map((s) => rotStroke(s, a))
}

// ==========================================================================
// G. Player claw — authentic ROM CURSOR shapes NCRS1–8 (Story 12-1).
// ==========================================================================
// The 8 point-vector claw graphics, transcribed byte-exact from the rev-3 ROM
// (`tempest.a65` `_pv_t3` "claw position 1".."claw position 8", graphics 1–8).
// Graphics 1–7 are 8-vector variants of the same claw (the apex shifts across
// the first two vectors as the cursor rolls); graphic 8 opens with a beam-off
// MOVE (3,1) then an 8-vector drawn loop — the drawn silhouette is those 8
// vectors, transcribed here. Every chain closes (deltas sum to 0,0). Stored as
// raw ROM deltas (origin-relative, no y-flip) exactly like flipperGlyph; the
// pure render transform (core/geometry `clawTransform`) orients + rolls them.
const CLAW_DELTAS: readonly (readonly [number, number][])[] = [
  [[0, -2], [2, -1], [3, 4], [-3, -3], [-1, 0], [0, 2], [2, 1], [-3, -1]], // 1 (NCRS1)
  [[1, -2], [7, 2], [-3, 1], [2, -1], [-6, -1], [0, 1], [2, 1], [-3, -1]], // 2
  [[2, -2], [6, 2], [-3, 1], [2, -1], [-5, -1], [-1, 1], [2, 1], [-3, -1]], // 3
  [[3, -2], [5, 2], [-3, 1], [2, -1], [-4, -1], [-2, 1], [2, 1], [-3, -1]], // 4 (NCRS4)
  [[5, -2], [3, 2], [-3, 1], [2, -1], [-2, -1], [-4, 1], [2, 1], [-3, -1]], // 5
  [[6, -2], [2, 2], [-3, 1], [2, -1], [-1, -1], [-5, 1], [2, 1], [-3, -1]], // 6
  [[7, -2], [1, 2], [-3, 1], [2, -1], [0, -1], [-6, 1], [2, 1], [-3, -1]], // 7
  [[3, -4], [2, 1], [0, 2], [-3, 1], [2, -1], [0, -2], [-1, 0], [-3, 3]], // 8 (NCRS8, post-MOVE)
]

// One centred, closed, yellow stroke per graphic. Each delta chain returns to
// the origin, so drop the final coincident vertex (8 distinct vertices, drawn
// as a closed loop — the same idiom as flipperGlyph). Built once, immutable.
const CLAW_GLYPHS: readonly Glyph[] = CLAW_DELTAS.map((deltas) => {
  const verts = fromDeltas(deltas).slice(0, deltas.length)
  return [{ points: center(verts), closed: true, color: 'yellow' as GlyphColor }]
})

export function playerClawGlyph(roll: number): Glyph {
  return CLAW_GLYPHS[((roll % 8) + 8) % 8] // 8 authentic graphics, wraps
}

// ==========================================================================
// H. Player charge — the ROM's DIARA2, 17 dots in two rings.
// ==========================================================================
// DIARA2, ALVROM.MAC:383-403 (V-010 / DA-004). Seventeen SCDOT dots (each a beam-off
// move + a zero-length lit point — NOT a stroked outline): an INNER 9-dot ring
// (CSTAT PSHCTR, the ammo tint) and an OUTER 8-dot ring (CSTAT YELLOW, fixed). The
// outer ring is deliberately IRREGULAR — its +x/+y cardinals sit at 0x0f but its
// -x/-y cardinals at only 0x0b. Only the INNER ring is ammo-tinted (DA-004), so the
// tint arrives as data here rather than a render-wide override that recolours both.
const DIARA2_INNER: readonly [number, number][] = [
  [0, 0], [7, 0], [5, 5], [0, 7], [-5, 5], [-7, 0], [-5, -5], [0, -7], [5, -5],
]
const DIARA2_OUTER: readonly [number, number][] = [
  [0x0f, 0], [0x0b, 0x0b], [0, 0x0f], [-0x0b, 0x0b], [-0x0b, 0], [-0x0b, -0x0b], [0, -0x0b], [0x0b, -0x0b],
]
// Both rings share ONE scale (outer 0x0f → the module's ~6 bullet size).
const DIARA2_SCALE = 6 / 0x0f

export function playerBulletGlyph(tint: GlyphColor): Glyph {
  const dot = (p: V, color: GlyphColor): GlyphStroke => ({ points: [p], closed: false, color })
  return [
    ...scaleVerts(DIARA2_INNER, 6, DIARA2_SCALE).map((p) => dot(p, tint)), // inner: ammo tint (DA-004)
    ...scaleVerts(DIARA2_OUTER, 6, DIARA2_SCALE).map((p) => dot(p, 'yellow')), // outer: fixed yellow
  ]
}

// Story 10-8 / tp1-12: ammo-count bullet tint (ROM CHACOU, ALDISP.MAC:919-930).
// The centre is recoloured by how many player charges (shots) are in flight — the
// closer to the 8-shot cap, the "hotter" the colour: <6 yellow (ZYELLO), 6–7 blue
// (ZBLUE — the ROM's turquoise-distinct blue, V-011 corrected this from `cyan`),
// 8 (== core MAX_BULLETS) red (ZRED). Pure: the caller passes the live count,
// keeping this module core-free.
export function playerBulletColor(chargesInFlight: number): GlyphColor {
  if (chargesInFlight >= 8) return 'red'
  if (chargesInFlight >= 6) return 'blue'
  return 'yellow'
}

// ==========================================================================
// I. Lives icon — the ROM's own LIFE1 picture (ALVROM.MAC:171-181).
// ==========================================================================
// The AVG walks LIFE1 as `ICVEC` (pen to the origin) then eight `SCVEC`s, the last
// returning to (0,0): a closed, mirror-symmetric W — the claw's own silhouette, and
// deliberately NOT the player-cursor picture NCRS1-8 (V-016 calls that out).
//
// SCVEC's operands are ABSOLUTE, not deltas — its CVEC macro emits `NEWX-...OLX` and
// carries the pen position itself — so these are vertices, transcribed straight from
// the source rather than accumulated like CLAW_DELTAS.
//
// Y is NEGATED from the source: the AVG's +y is up and the canvas's is down, so the
// raw chain would hang the claw upside down. Yellow is LIFE1's own `CSTAT YELLOW`.
const LIFE1: readonly V[] = [
  { x: 0, y: 0 }, { x: 4, y: 2 }, { x: 1, y: 3 }, { x: 3, y: 2 },
  { x: 0, y: 1 }, { x: -3, y: 2 }, { x: -1, y: 3 }, { x: -4, y: 2 },
]

export function lifeIconGlyph(): Glyph {
  return [{ points: LIFE1, closed: true, color: 'yellow' }]
}

// ==========================================================================
// J. THE PALETTE — per-wave-group COLTAB (tp1-12).
// ==========================================================================
// Enemy/well colours are not fixed hues: they come from a per-wave-group colour
// bank. COLTAB (ALDISP.MAC:2405-2456, radix 16 per ALCOMN.MAC:17) is SIX 8-byte
// banks. INICOL selects the bank (ALDISP.MAC:2349-2374):
//     LDA CURWAV / AND I,70 / CMP I,5F / IFCS / LDA I,5F / LSR / ORA I,07 / TAX
// → bank = (min(CURWAV & 0x70, 0x5F)) >> 4 = floor(CURWAV / 16) clamped to 5.
// CURWAV is 0-based; our `level` is 1-based, so bank = clamp(floor((level-1)/16), 0, 5).
//
// Each COLTAB byte is nibble-packed: the LOW nibble → COLRAM[0-7] (the primary
// colour, transcribed here); the HIGH nibble → COLRAM+8[8-15] (the SPLAT/NYMPH/
// FLASH alternates, not modelled). The slot MEANING is fixed and the colour per
// slot cycles by bank (bank-0 comments, ALDISP.MAC:2406-2413):
//   0 EXPLOSIONS · 1 CURSOR/FLASHLIGHT · 2 TANKERS · 3 FLIPPERS · 4 PULSARS
//   5 LETTERS · 6 WELL · 7 LETTERS/FLASH
// ZTURQOI→'cyan', ZBLUE→'blue', ZYELLO/ZYELLOW→'yellow', ZBLACK→'black' (the
// invisible well of bank 4). Orange is not in the ROM's palette at all.
export const COLTAB_BANKS: readonly (readonly PaletteColor[])[] = [
  // bank 0  ;1  ALDISP.MAC:2406-2413
  ['white', 'yellow', 'purple', 'red', 'cyan', 'green', 'blue', 'blue'],
  // bank 1  ;2  ALDISP.MAC:2414-2421
  ['white', 'green', 'blue', 'purple', 'yellow', 'cyan', 'red', 'red'],
  // bank 2  ;3  ALDISP.MAC:2422-2429
  ['white', 'blue', 'cyan', 'green', 'purple', 'red', 'yellow', 'yellow'],
  // bank 3  ;4  ALDISP.MAC:2430-2437
  ['white', 'blue', 'purple', 'green', 'yellow', 'red', 'cyan', 'cyan'],
  // bank 4  ;5  ALDISP.MAC:2441-2448  — slot 6 = ZBLACK (2447), the invisible well
  ['white', 'yellow', 'purple', 'red', 'cyan', 'green', 'black', 'blue'],
  // bank 5  ;6  ALDISP.MAC:2449-2456
  ['white', 'red', 'purple', 'yellow', 'cyan', 'blue', 'green', 'green'],
]

/** The COLTAB well slot (ALDISP.MAC:2412 `;WELL(6)`). */
export const WELL_SLOT = 6

/** The per-wave-group bank for a 1-based level. INICOL: advances every 16 waves,
 *  saturates at the sixth bank (the ROM's `CMP I,5F` clamp — our level has no cap). */
export function paletteBank(level: number): number {
  // Guard a non-finite level (Math.floor(NaN) would poison the clamp) — the enemy
  // and starfield callers landed in tp1-30 can now reach this with a bad level.
  if (!Number.isFinite(level)) return 0
  return Math.max(0, Math.min(COLTAB_BANKS.length - 1, Math.floor((level - 1) / 16)))
}

/** Resolve a colour slot (0-7) through the level's COLTAB bank. */
export function paletteColor(level: number, slot: number): PaletteColor {
  // Clamp the slot into [0,7] so an out-of-range or non-finite slot returns a real
  // palette colour instead of `undefined` (which would break the render loop).
  const s = Number.isFinite(slot) ? Math.max(0, Math.min(7, Math.floor(slot))) : 0
  return COLTAB_BANKS[paletteBank(level)][s]
}

/** The well's colour for a level — `black` (invisible) on waves 65-80 (bank 4). */
export function wellColor(level: number): PaletteColor {
  return paletteColor(level, WELL_SLOT)
}
