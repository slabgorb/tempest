// tests/shell/render.tube-glow.test.ts
//
// Story SH2-9: tempest conforms to @arcade/shared/glow WITHOUT regressing tube
// depth. This is the regression-sensitive tail of the SH glow-extraction epic —
// a reviewer could approve the flat games (SH2-8) yet reject tempest — so it
// carries an explicit visual-parity gate. These tests pin the migration contract
// AND the "don't flatten it" guarantee.
//
// TEA (Imperator Furiosa) test-design decisions — see session "Design Deviations":
//
//  • WIRING is asserted against render.ts source via Vite `?raw`, matching the
//    house pattern for module-private render wiring (render.warp-dispatch /
//    render.bullet-color): drawTube is module-driven canvas code, so "is it wired
//    to the shared primitive?" is a source-level seam.
//
//  • DEPTH PRESERVATION is asserted BEHAVIOURALLY by driving the real drawTube()
//    through a lightweight recording ctx. drawTube is DOM-free (it never touches
//    the phosphor scratch canvas / document), so — unlike render() — a recording
//    ctx is safe in vitest's `node` env. Source text cannot prove the far->near
//    gradient stops, the 6/8/18 blur ramp, or the far-ring halo colour survive
//    the migration; a recording ctx can. For a story whose whole reason to exist
//    is "don't silently flatten the tube", that behavioural coverage is the point.
//    (The `?raw`-only pattern was chosen because render()+phosphor need a real
//    canvas; that blocker does not apply to the pure-drawing drawTube.)
//
//  • The far ring's glow colour is INHERITED (drawTube leaves shadowColor at the
//    level colour set by the spoke loop, while stroking a dim blue). We pin that
//    inherited-halo behaviour so the naive glowPolyline migration (which would
//    default shadowColor to the dim-blue stroke) is caught as a regression. See
//    the Delivery Finding flagging this subtlety for Dev/Reviewer.

import { describe, it, expect } from 'vitest'
import renderSrc from '../../src/shell/render.ts?raw'
import { drawTube } from '../../src/shell/render'
import { makeCircleTube } from '../../src/core/geometry'
import type { GameState } from '../../src/core/state'

// ── A minimal recording CanvasRenderingContext2D ────────────────────────────
// Captures the timeline of shadowBlur assignments and a snapshot of the glow
// state at each stroke(), plus the gradients handed out. Only the members
// drawTube touches are implemented; everything else is a no-op.

interface GradStub {
  readonly _grad: true
  readonly stops: Array<readonly [number, string]>
  addColorStop(offset: number, color: string): void
}

interface StrokeSnap {
  readonly strokeStyle: unknown
  readonly shadowColor: unknown
  readonly shadowBlur: number
  readonly lineWidth: number
}

interface RecCtx {
  readonly ctx: CanvasRenderingContext2D
  readonly blurTimeline: number[]
  readonly strokes: StrokeSnap[]
  readonly gradients: GradStub[]
}

function isGrad(v: unknown): v is GradStub {
  return typeof v === 'object' && v !== null && (v as { _grad?: unknown })._grad === true
}

function makeRecCtx(): RecCtx {
  const blurTimeline: number[] = []
  const strokes: StrokeSnap[] = []
  const gradients: GradStub[] = []
  let shadowBlur = 0

  const rec: Record<string, unknown> = {
    strokeStyle: '',
    fillStyle: '',
    shadowColor: '',
    lineWidth: 1,
    globalAlpha: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    createLinearGradient(): GradStub {
      const stops: Array<readonly [number, string]> = []
      const g: GradStub = {
        _grad: true,
        stops,
        addColorStop(offset: number, color: string): void {
          stops.push([offset, color])
        },
      }
      gradients.push(g)
      return g
    },
    beginPath(): void {},
    moveTo(): void {},
    lineTo(): void {},
    closePath(): void {},
    arc(): void {},
    fill(): void {},
    save(): void {},
    restore(): void {},
    translate(): void {},
    rotate(): void {},
    scale(): void {},
    fillRect(): void {},
    setTransform(): void {},
    stroke(): void {
      strokes.push({
        strokeStyle: rec.strokeStyle,
        shadowColor: rec.shadowColor,
        shadowBlur,
        lineWidth: rec.lineWidth as number,
      })
    },
  }
  Object.defineProperty(rec, 'shadowBlur', {
    get(): number {
      return shadowBlur
    },
    set(v: number): void {
      shadowBlur = v
      blurTimeline.push(v)
    },
  })

  return { ctx: rec as unknown as CanvasRenderingContext2D, blurTimeline, strokes, gradients }
}

// The tube-glow constants drawTube must preserve (the per-element blur ramp and
// the far->near gradient stops). Named here so the tests read as a spec.
const SPOKE_BLUR = 8
const FAR_RING_BLUR = 6
const NEAR_RING_BLUR = 18
const GRADIENT_FAR_STOP = 'rgba(255,255,255,0.04)' // dim white at the far rim
const FAR_RING_STROKE = 'rgba(150,190,255,0.28)' // dim blue far ring
const LEVEL_COLOR = '#abcdef' // sentinel level colour passed into drawTube

function drawTestTube(): RecCtx {
  const rec = makeRecCtx()
  // A closed 4-lane circle tube: far.length === near.length === laneCount === 4.
  const tube = makeCircleTube(4, { x: 0, y: 0 }, 20, 200)
  const s = { tube } as unknown as GameState
  drawTube(rec.ctx, s, LEVEL_COLOR, 0)
  return rec
}

// ── AC1: strokes via @arcade/shared/glow (wiring) ───────────────────────────

describe('drawTube wiring — strokes via @arcade/shared/glow (SH2-9 AC1)', () => {
  it('imports the shared glow primitive', () => {
    expect(renderSrc).toMatch(/from\s*['"]@arcade\/shared\/glow['"]/)
  })

  it('uses withGlow for the gradient spoke stroke', () => {
    expect(renderSrc).toMatch(/\bwithGlow\s*\(/)
  })

  it('uses glowPolyline where a plain glow stroke suffices (the rings)', () => {
    expect(renderSrc).toMatch(/\bglowPolyline\s*\(/)
  })

  it('drops the local strokePoly set/draw boilerplate (replaced by glowPolyline)', () => {
    // "no local duplicate of the state-set/reset boilerplate remains" — strokePoly
    // was drawTube's private re-implementation of glowPolyline's path logic and is
    // used nowhere else, so it must be gone.
    expect(renderSrc).not.toMatch(/function\s+strokePoly\b/)
  })
})

// ── AC2: far->near gradient + blur ramp preserved (regression guard) ─────────

describe('drawTube depth preserved — far->near gradient + 6/8/18 ramp (SH2-9 AC2)', () => {
  it('strokes EVERY spoke with a far->near CanvasGradient (no flattening)', () => {
    const rec = drawTestTube()
    const spokeStrokes = rec.strokes.filter((snap) => isGrad(snap.strokeStyle))
    // One gradient spoke per boundary — if any spoke were flattened to a solid
    // colour this count would drop below the lane count.
    expect(spokeStrokes.length).toBe(4)
  })

  it('preserves the spoke gradient stops: dim-white far rim -> level colour near rim', () => {
    const rec = drawTestTube()
    const depthGradients = rec.gradients.filter(
      (g) =>
        g.stops.length === 2 &&
        g.stops[0][0] === 0 &&
        g.stops[0][1] === GRADIENT_FAR_STOP &&
        g.stops[1][0] === 1 &&
        g.stops[1][1] === LEVEL_COLOR,
    )
    expect(depthGradients.length).toBe(4)
  })

  it('preserves the spoke blur/width (blur 8, width 2, glows the level colour)', () => {
    const rec = drawTestTube()
    const spokeStrokes = rec.strokes.filter((snap) => isGrad(snap.strokeStyle))
    for (const snap of spokeStrokes) {
      expect(snap.shadowBlur).toBe(SPOKE_BLUR)
      expect(snap.lineWidth).toBe(2)
      expect(snap.shadowColor).toBe(LEVEL_COLOR)
    }
  })

  it('preserves the far ring: dim-blue stroke, blur 6, width 1.5, INHERITED level-colour halo', () => {
    const rec = drawTestTube()
    // The subtle trap: drawTube strokes the far ring dim blue but its glow colour
    // is the level colour inherited from the spoke loop. A naive glowPolyline that
    // omits an explicit `color` would default the halo to the dim-blue stroke —
    // a silent regression. Pin the inherited halo. (Flagged as a Delivery Finding.)
    const far = rec.strokes.filter((snap) => snap.strokeStyle === FAR_RING_STROKE)
    expect(
      far.some(
        (snap) =>
          snap.shadowBlur === FAR_RING_BLUR &&
          snap.lineWidth === 1.5 &&
          snap.shadowColor === LEVEL_COLOR,
      ),
      'far ring must keep blur 6 / width 1.5 and its inherited level-colour halo',
    ).toBe(true)
  })

  it('preserves the near ring: level-colour stroke, blur 18, width 3.5', () => {
    const rec = drawTestTube()
    const near = rec.strokes.filter((snap) => snap.strokeStyle === LEVEL_COLOR)
    expect(
      near.some(
        (snap) =>
          snap.shadowBlur === NEAR_RING_BLUR &&
          snap.lineWidth === 3.5 &&
          snap.shadowColor === LEVEL_COLOR,
      ),
      'near ring must keep the bright rim: level colour, blur 18, width 3.5',
    ).toBe(true)
  })

  it('keeps the whole 6/8/18 blur ramp in play on the tube strokes', () => {
    const rec = drawTestTube()
    const blursUsed = new Set(rec.strokes.map((snap) => snap.shadowBlur))
    for (const b of [FAR_RING_BLUR, SPOKE_BLUR, NEAR_RING_BLUR]) {
      expect(blursUsed.has(b), `blur ${b} must remain in the tube ramp`).toBe(true)
    }
  })
})

// ── withGlow reset contract: no leaking shadowBlur ──────────────────────────

describe('drawTube no longer leaks shadowBlur — withGlow reset contract (SH2-9)', () => {
  it('resets shadowBlur to 0 after every tube glow stroke (6/8/18)', () => {
    const rec = drawTestTube()
    const { blurTimeline } = rec
    // The entire point of the shared primitive: a glow draw sets shadowBlur, then
    // restores it to 0 so the blur never bleeds into the next draw. The pre-migration
    // drawTube hand-sets the ramp and NEVER resets — so every 6/8/18 is followed by
    // the next non-zero blur, and this fails until drawTube routes through
    // withGlow/glowPolyline.
    for (const b of [SPOKE_BLUR, FAR_RING_BLUR, NEAR_RING_BLUR]) {
      const indices = blurTimeline.flatMap((v, i) => (v === b ? [i] : []))
      expect(indices.length, `blur ${b} should appear in the timeline`).toBeGreaterThan(0)
      for (const i of indices) {
        expect(
          blurTimeline[i + 1],
          `shadowBlur ${b} must be reset to 0 immediately after the glow stroke`,
        ).toBe(0)
      }
    }
  })
})
