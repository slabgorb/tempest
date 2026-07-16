// tests/shell/render.tube-glow.test.ts
//
// Tube glow contract — REWRITTEN by story tp1-40 (THE GLOW TAX), superseding
// the SH2-9 suite that lived here.
//
// SH2-9's real point was "migrate the glow WITHOUT flattening the tube": the
// far->near spoke gradients, the dim far ring vs bright near rim, the halo. That
// intent survives intact below. What tp1-40 REMOVES is SH2-9's pinned MECHANISM
// — the @arcade/shared/glow envelope and its live shadow-blur ramp (6/8/18) —
// because the Architect's investigation proved live shadow blur is a
// per-primitive GPU Gaussian pass and the single cause of production's 8-34 fps
// (session tp1-40; A/B with blur no-op'd runs a locked 60). The blur RADII stay
// meaningful as inputs (glowStrokePasses(blur, …) scales the halo reach from
// them); they are simply no longer canvas shadow state. This supersession is
// logged as a Design Deviation in the tp1-40 session file.
//
// House pattern preserved from the original suite: WIRING via `?raw` source,
// DEPTH via a recording ctx driving the real drawTube() (DOM-free, node-safe).
//
// All behavioral tests fail today (drawTube still blurs, has no layered
// passes, draws its dots with live blur). Valid RED.

import { describe, it, expect } from 'vitest'
import renderSrc from '../../src/shell/render.ts?raw'
import { drawTube } from '../../src/shell/render'
import { makeCircleTube } from '../../src/core/geometry'
import type { GameState } from '../../src/core/state'

// ── A minimal recording CanvasRenderingContext2D ────────────────────────────
// Captures every shadowBlur assignment, a snapshot of stroke state (style,
// width, alpha) at each stroke(), gradient creations, and dot draws (fill /
// drawImage) so the blit path is observable whichever mechanism serves it.

interface GradStub {
  readonly _grad: true
  readonly stops: Array<readonly [number, string]>
  addColorStop(offset: number, color: string): void
}

interface StrokeSnap {
  readonly strokeStyle: unknown
  readonly lineWidth: number
  readonly globalAlpha: number
  readonly shadowBlur: number
}

interface RecCtx {
  readonly ctx: CanvasRenderingContext2D
  readonly blurTimeline: number[]
  readonly strokes: StrokeSnap[]
  readonly gradients: GradStub[]
  readonly dots: { fills: number; drawImages: number }
}

function isGrad(v: unknown): v is GradStub {
  return typeof v === 'object' && v !== null && (v as { _grad?: unknown })._grad === true
}

function makeRecCtx(): RecCtx {
  const blurTimeline: number[] = []
  const strokes: StrokeSnap[] = []
  const gradients: GradStub[] = []
  const dots = { fills: 0, drawImages: 0 }
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
    fill(): void {
      dots.fills += 1
    },
    drawImage(): void {
      dots.drawImages += 1
    },
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
        lineWidth: rec.lineWidth as number,
        globalAlpha: rec.globalAlpha as number,
        shadowBlur,
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

  return { ctx: rec as unknown as CanvasRenderingContext2D, blurTimeline, strokes, gradients, dots }
}

// The tube identity drawTube must preserve — the CORE (crisp) stroke of each
// element. The halo around each is layered passes now; its exact widths/alphas
// are Dev-tuned, so the tests pin structure (wider + dimmer) not values.
const SPOKE_CORE_WIDTH = 2
const FAR_RING_CORE_WIDTH = 1.5
const NEAR_RING_CORE_WIDTH = 3.5
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

// ── Wiring: the glow tax is gone from the tube (tp1-40 AC-1/AC-3) ────────────

describe('drawTube wiring — tempest-local layered glow, no shared blur envelope', () => {
  it('no longer imports @arcade/shared/glow (its contract IS live blur)', () => {
    expect(renderSrc).not.toMatch(/from\s*['"]@arcade\/shared\/glow['"]/)
  })

  it('imports the tempest-local glow helper instead', () => {
    expect(renderSrc).toMatch(/from\s*['"]\.\/glow['"]/)
  })
})

// ── The tax itself: zero live blur while the tube draws (tp1-40 AC-1) ────────

describe('drawTube pays no glow tax — no live shadow blur at any stroke', () => {
  it('never strokes with a non-zero shadowBlur', () => {
    const rec = drawTestTube()
    const blurred = rec.strokes.filter((s) => s.shadowBlur !== 0)
    expect(
      blurred.length,
      'every blurred stroke is a per-primitive GPU Gaussian pass — the lag',
    ).toBe(0)
  })

  it('never even assigns a non-zero shadowBlur (resets to 0 are fine)', () => {
    const rec = drawTestTube()
    expect(rec.blurTimeline.filter((v) => v !== 0)).toEqual([])
  })
})

// ── Depth preserved: SH2-9's guarantee, carried forward (tp1-40 AC-3) ────────

describe('drawTube depth preserved — far->near gradient + element identity', () => {
  it('strokes every spoke with a far->near CanvasGradient (no flattening)', () => {
    const rec = drawTestTube()
    const spokeGrads = new Set(rec.strokes.map((s) => s.strokeStyle).filter(isGrad))
    expect(spokeGrads.size).toBe(4)
  })

  it('creates ONE gradient per spoke, reused across its passes (no per-pass churn)', () => {
    // This is a perf story: a layered spoke that mints a fresh gradient for
    // every halo pass would triple the per-frame gradient churn it came to fix.
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

  it('keeps each spoke\'s crisp core: gradient stroke at width 2, full alpha', () => {
    const rec = drawTestTube()
    const cores = rec.strokes.filter(
      (s) => isGrad(s.strokeStyle) && s.lineWidth === SPOKE_CORE_WIDTH && s.globalAlpha === 1,
    )
    expect(cores.length).toBe(4)
  })

  it('keeps the far ring core: dim-blue stroke at width 1.5', () => {
    const rec = drawTestTube()
    expect(
      rec.strokes.some(
        (s) => s.strokeStyle === FAR_RING_STROKE && s.lineWidth === FAR_RING_CORE_WIDTH,
      ),
      'the dim far ring must survive — losing it flattens the tube',
    ).toBe(true)
  })

  it('keeps the near ring core: level-colour stroke at width 3.5, full alpha', () => {
    const rec = drawTestTube()
    expect(
      rec.strokes.some(
        (s) =>
          s.strokeStyle === LEVEL_COLOR &&
          s.lineWidth === NEAR_RING_CORE_WIDTH &&
          s.globalAlpha === 1,
      ),
      'the bright near rim must survive at its width',
    ).toBe(true)
  })

  it('layers a halo: wider, dimmer passes accompany the cores', () => {
    const rec = drawTestTube()
    // The glow is layered strokes now. Floor: each tube element (4 spokes, far
    // ring, near ring) contributes at least one wider-than-core low-alpha pass.
    const halos = rec.strokes.filter((s) => s.globalAlpha < 1 && s.lineWidth > SPOKE_CORE_WIDTH)
    expect(
      halos.length,
      'a tube with no wide low-alpha passes has lost its neon halo entirely',
    ).toBeGreaterThanOrEqual(6)
    // And specifically the near rim still BLOOMS (its old blur-18 halo was the
    // brightest thing on screen): a pass wider than its 3.5 core, dimmed.
    expect(
      rec.strokes.some((s) => s.lineWidth > NEAR_RING_CORE_WIDTH && s.globalAlpha < 1),
    ).toBe(true)
  })

  it('still draws the rim dots + vanishing glow, all blur-free (tp1-40 AC-2)', () => {
    const rec = drawTestTube()
    // 4 rim vertex sparks + the closed-tube vanishing-point glow: ≥5 dot draws,
    // by sprite blit (drawImage) or unblurred fill — either is acceptable here;
    // the sprite cache is pinned behaviourally in tp1-40.glow.test.ts.
    expect(rec.dots.fills + rec.dots.drawImages).toBeGreaterThanOrEqual(5)
  })
})
