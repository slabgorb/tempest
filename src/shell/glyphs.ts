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

export type GlyphColor = 'red' | 'green' | 'yellow' | 'cyan' | 'white' | 'orange' | 'purple'

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

// ==========================================================================
// A. Flipper — RED 8-segment closed bowtie/butterfly (_pv_t3, ROM l.14355).
// ==========================================================================
const FLIPPER_DELTAS: readonly [number, number][] = [
  [4, 1], [4, -1], [-2, 1], [1, 1], [-3, -1], [-3, 1], [1, -1], [-2, -1],
]

export function flipperGlyph(): Glyph {
  // The deltas sum to (0,0) → a closed loop. Accumulating them lands the final
  // vertex back on the origin, so drop it: 8 distinct vertices, one of which
  // coincides with an earlier vertex (the bowtie's central crossing).
  const verts = fromDeltas(FLIPPER_DELTAS).slice(0, FLIPPER_DELTAS.length)
  return [{ points: center(verts), closed: true, color: 'red' }]
}

// ==========================================================================
// B. Tanker — elongated PURPLE X-diamond body + cargo emblem (draw_tanker).
// ==========================================================================
export function tankerGlyph(cargo: TankerCargo): Glyph {
  // Body: GENTNK purple (ROM authentic), elongated (taller than wide) X-diamond.
  const body: GlyphStroke = {
    points: [{ x: 0, y: -9 }, { x: 6, y: 0 }, { x: 0, y: 9 }, { x: -6, y: 0 }],
    closed: true,
    color: 'purple',
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
// C. Spiker — outward pinwheel/spiral, 4 spin frames on `frame & 3`.
// ==========================================================================
const SPIKER_BASE: readonly V[] = Array.from({ length: 12 }, (_, i) => {
  const r = 2 + i * 0.7 // radius grows outward (the spiral winds out)
  const a = i * (Math.PI / 3)
  return { x: r * Math.cos(a), y: r * Math.sin(a) }
})

export function spikerGlyph(frame: number): Glyph {
  const a = (frame & 3) * (Math.PI / 2) // ROM cycles 4 frames, each +90deg
  return [{ points: rotPoints(SPIKER_BASE, a), closed: false, color: 'orange' }]
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
// D. Fuseball — chaotic multi-colour ball-of-legs, legs redrawn each frame.
// ==========================================================================
const FUSE_COLORS: readonly GlyphColor[] = ['red', 'yellow', 'cyan']
const FUSE_LEGS = 9

export function fuseballGlyph(frame: number): Glyph {
  const f = frame & 3 // 4 writhe frames
  const legs: GlyphStroke[] = []
  for (let i = 0; i < FUSE_LEGS; i++) {
    const base = i * ((Math.PI * 2) / FUSE_LEGS)
    const ang = base + 0.6 * Math.sin(i * 1.7 + f * 1.9) // legs writhe per frame
    const len = 6 + 3 * Math.cos(i * 0.9 + f * 1.3)
    const tip: V = { x: Math.cos(ang) * len, y: Math.sin(ang) * len }
    const midAng = ang + 0.3 * Math.sin(i + f)
    const mid: V = { x: Math.cos(midAng) * len * 0.5, y: Math.sin(midAng) * len * 0.5 }
    legs.push({ points: [{ x: 0, y: 0 }, mid, tip], closed: false, color: FUSE_COLORS[i % FUSE_COLORS.length] })
  }
  return legs
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

export function pulsarColor(bright: boolean): GlyphColor {
  return bright ? 'white' : 'cyan'
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
// G. Player claw — YELLOW chevron + crossbar, 8 rotatable graphics.
// ==========================================================================
function clawBase(): GlyphStroke[] {
  return [
    { points: [{ x: -6, y: 6 }, { x: 0, y: -8 }, { x: 6, y: 6 }], closed: false, color: 'yellow' },
    { points: [{ x: -4, y: 1 }, { x: 4, y: 1 }], closed: false, color: 'yellow' },
  ]
}

export function playerClawGlyph(rotation: number): Glyph {
  const r = ((rotation % 8) + 8) % 8 // 8 graphics, wraps
  const a = r * (Math.PI / 4)
  return clawBase().map((s) => rotStroke(s, a))
}

// ==========================================================================
// H. Player bullet — two concentric dotted octagon rings.
// ==========================================================================
function octagon(radius: number): V[] {
  return Array.from({ length: 8 }, (_, k) => {
    const a = k * (Math.PI / 4)
    return { x: radius * Math.cos(a), y: radius * Math.sin(a) }
  })
}

export function playerBulletGlyph(): Glyph {
  return [
    { points: octagon(3), closed: true, color: 'white' },
    { points: octagon(6), closed: true, color: 'white' },
  ]
}
