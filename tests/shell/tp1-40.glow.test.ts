// tests/shell/tp1-40.glow.test.ts
//
// RED contracts for story tp1-40's tempest-local glow helper, src/shell/glow.ts.
// The module does not exist yet, so this whole suite fails today — valid RED,
// same shape as audio.sustain.test.ts pinning startLoop/stopLoop before they
// existed.
//
// Why these seams (TEA design decisions, see session Design Deviations):
//
//  • glowStrokePasses(blur, lineWidth) — the layered-stroke replacement for the
//    live shadow-blur halo. glowTrace already strokes text three times (two
//    blurred + one crisp core, render.ts:667); the fix keeps that structure but
//    makes the halo passes WIDER, LOW-ALPHA and UNBLURRED under the 'lighter'
//    blend. Returning the pass list as pure data makes the geometry testable in
//    the node env where a canvas can't run: the contract is the SHAPE (halo
//    passes wider than the core, dimmer than the core, scaling with the old
//    blur radius, crisp core last) — the exact widths/alphas are Dev's to tune
//    by eye against the neon look, so they are deliberately NOT pinned.
//
//  • blitGlowDot(ctx, color, x, y, size) — the one door every glowing dot goes
//    through (rim sparks, spike tips, starfield, muzzle spark, vanishing glow),
//    backed by the render.ts:509 cached-sprite pattern that already saved the
//    particles. It MUST be node-import-safe and node-CALL-safe: vitest runs in
//    the node env (vite.config.ts) and several existing suites drive drawTube /
//    drawStarfield through recording ctxs with no `document` — the sprite cache
//    must therefore build lazily and degrade to a plain unblurred fill when the
//    DOM is absent (mirror phosphor.ts's lazy-DOM discipline).
//
//  • RENDER_DPR_CAP / cappedDpr(dpr) — the AC-4 tunable. The shared
//    resizeToDisplay already guards Math.min(2, devicePixelRatio||1) at the
//    canvas (main.ts:24); this cap composes on top for the scene/phosphor
//    buffers, where the user's production trace showed the GPU saturating at
//    dpr 1.75. Its VALUE is chosen by measurement in the verify phase — this
//    suite pins only its shape and that capping can never upscale.

import { describe, it, expect } from 'vitest'
import { RENDER_DPR_CAP, cappedDpr, glowStrokePasses, blitGlowDot } from '../../src/shell/glow'

// ── RENDER_DPR_CAP + cappedDpr (AC-4) ────────────────────────────────────────

describe('tp1-40 AC-4 — RENDER_DPR_CAP is a sane named tunable', () => {
  it('is a finite number in [1, 2]', () => {
    expect(typeof RENDER_DPR_CAP).toBe('number')
    expect(Number.isFinite(RENDER_DPR_CAP)).toBe(true)
    // Below 1 the scene would UPSCALE (blurrier than CSS pixels for everyone);
    // above 2 it caps nothing the shared resizeToDisplay hasn't already capped.
    expect(RENDER_DPR_CAP).toBeGreaterThanOrEqual(1)
    expect(RENDER_DPR_CAP).toBeLessThanOrEqual(2)
  })
})

describe('tp1-40 AC-4 — cappedDpr', () => {
  it('is the identity below the cap', () => {
    expect(cappedDpr(1)).toBe(1)
    const below = Math.min(1 + (RENDER_DPR_CAP - 1) / 2, RENDER_DPR_CAP)
    expect(cappedDpr(below)).toBe(below)
  })

  it('clamps to the cap above it (the production dpr 1.75 case included)', () => {
    expect(cappedDpr(RENDER_DPR_CAP)).toBe(RENDER_DPR_CAP)
    expect(cappedDpr(3)).toBe(RENDER_DPR_CAP)
    expect(cappedDpr(1.75)).toBe(Math.min(1.75, RENDER_DPR_CAP))
    expect(cappedDpr(2)).toBe(Math.min(2, RENDER_DPR_CAP))
  })

  it('guards degenerate input the way the cabinet convention does (||1)', () => {
    // resizeToDisplay guards `devicePixelRatio || 1`; a 0/NaN/negative dpr must
    // come out as a usable 1, never 0 (a 0-dpr scene buffer is a crash).
    expect(cappedDpr(0)).toBe(1)
    expect(cappedDpr(-2)).toBe(1)
    expect(cappedDpr(Number.NaN)).toBe(1)
  })

  it('never exceeds the cap for any input', () => {
    for (const d of [0.5, 1, 1.25, 1.5, 1.75, 2, 2.5, 4]) {
      expect(cappedDpr(d)).toBeLessThanOrEqual(RENDER_DPR_CAP)
    }
  })
})

// ── glowStrokePasses (AC-3) ──────────────────────────────────────────────────

describe('tp1-40 AC-3 — glowStrokePasses layers the halo without blur', () => {
  it('blur 0 is a single crisp core pass (no halo, no waste)', () => {
    expect(glowStrokePasses(0, 2)).toEqual([{ width: 2, alpha: 1 }])
  })

  it('a glowing stroke is ≥2 halo passes + the crisp core last (the glowTrace structure)', () => {
    const passes = glowStrokePasses(14, 2)
    expect(passes.length).toBeGreaterThanOrEqual(3)
    const core = passes[passes.length - 1]
    expect(core).toEqual({ width: 2, alpha: 1 })
  })

  it('halo passes are WIDER and DIMMER than the core', () => {
    const passes = glowStrokePasses(14, 2)
    const halos = passes.slice(0, -1)
    expect(halos.length).toBeGreaterThanOrEqual(2)
    for (const h of halos) {
      expect(h.width).toBeGreaterThan(2)
      expect(h.alpha).toBeGreaterThan(0)
      // Low-alpha is the point: an opaque halo pass is just a fat line.
      expect(h.alpha).toBeLessThanOrEqual(0.6)
    }
  })

  it('passes narrow toward the core (widest halo first)', () => {
    const passes = glowStrokePasses(18, 3.5)
    for (let i = 1; i < passes.length; i++) {
      expect(passes[i].width).toBeLessThan(passes[i - 1].width)
    }
  })

  it('halo reach scales with the requested blur (big glow stays bigger than small glow)', () => {
    const small = glowStrokePasses(6, 2)
    const big = glowStrokePasses(24, 2)
    expect(big[0].width).toBeGreaterThan(small[0].width)
  })

  it('is deterministic and returns finite positive geometry', () => {
    expect(glowStrokePasses(12, 2)).toEqual(glowStrokePasses(12, 2))
    for (const blur of [0, 4, 8, 12, 18, 24]) {
      for (const p of glowStrokePasses(blur, 2)) {
        expect(Number.isFinite(p.width)).toBe(true)
        expect(p.width).toBeGreaterThan(0)
        expect(p.alpha).toBeGreaterThan(0)
        expect(p.alpha).toBeLessThanOrEqual(1)
      }
    }
  })
})

// ── blitGlowDot (AC-2) ───────────────────────────────────────────────────────

// A minimal recording ctx: enough surface for a dot blit by EITHER mechanism —
// the sprite drawImage (DOM available) or the unblurred fill fallback (node).
// Records that no live shadow blur was set either way.

function makeDotCtx(): {
  ctx: CanvasRenderingContext2D
  counts: { drawImages: number; fills: number; fillStyles: string[]; blursSet: number[] }
} {
  const counts = { drawImages: 0, fills: 0, fillStyles: [] as string[], blursSet: [] as number[] }
  let shadowBlur = 0
  const rec: Record<string, unknown> = {
    fillStyle: '',
    strokeStyle: '',
    shadowColor: '',
    globalAlpha: 1,
    save(): void {},
    restore(): void {},
    beginPath(): void {},
    arc(): void {},
    fill(): void {
      counts.fills += 1
      counts.fillStyles.push(String(rec.fillStyle))
    },
    drawImage(): void {
      counts.drawImages += 1
    },
  }
  Object.defineProperty(rec, 'shadowBlur', {
    get(): number {
      return shadowBlur
    },
    set(v: number): void {
      shadowBlur = v
      counts.blursSet.push(v)
    },
  })
  return { ctx: rec as unknown as CanvasRenderingContext2D, counts }
}

describe('tp1-40 AC-2 — blitGlowDot draws every glowing dot without blur', () => {
  it('is node-safe: draws a dot with no document present, without throwing', () => {
    const { ctx, counts } = makeDotCtx()
    expect(() => blitGlowDot(ctx, '#ffe600', 10, 20, 6)).not.toThrow()
    expect(
      counts.drawImages + counts.fills,
      'the dot must actually be drawn (sprite blit or unblurred fill fallback)',
    ).toBeGreaterThan(0)
  })

  it('the node fallback carries the dot COLOUR through fillStyle', () => {
    // Existing fidelity suites (tp1-15 spike sparkle, tp1-30 starfield palette)
    // identify dots by the fillStyle recorded at fill() — "what colour, how
    // many". The DOM sprite cache cannot exist in the node env, so the fallback
    // is the path those suites will observe: it must fill with the requested
    // colour, or every colour-counting contract in the repo goes blind.
    const { ctx, counts } = makeDotCtx()
    blitGlowDot(ctx, '#ffe600', 10, 20, 6)
    expect(counts.fills).toBeGreaterThan(0)
    expect(counts.fillStyles).toContain('#ffe600')
  })

  it('never sets a non-zero shadow blur (that is the whole tax)', () => {
    const { ctx, counts } = makeDotCtx()
    blitGlowDot(ctx, '#ffffff', 0, 0, 4)
    blitGlowDot(ctx, '#39ff14', -5, 7, 2)
    expect(counts.blursSet.filter((v) => v !== 0)).toEqual([])
  })

  it('handles a run of dots at starfield volume without error (160/frame in the warp)', () => {
    const { ctx, counts } = makeDotCtx()
    for (let i = 0; i < 160; i++) blitGlowDot(ctx, '#2b6bff', i, i * 2, 1 + (i % 4))
    expect(counts.drawImages + counts.fills).toBeGreaterThanOrEqual(160)
  })
})
