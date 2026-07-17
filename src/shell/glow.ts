// src/shell/glow.ts
//
// The tempest-local glow kernel (story tp1-40, THE GLOW TAX). Every glowing
// stroke and dot in the scene used to be a live canvas shadow-blur — a
// per-primitive GPU Gaussian pass at device resolution, ~100+ per gameplay
// frame, which saturated the GPU process and dropped production to 8-34 fps
// (session tp1-40: user trace + A/B evidence). This module is the replacement:
//
//   • glowStrokePasses — a stroke's halo as LAYERED, wider, low-alpha,
//     UNBLURRED passes under the 'lighter' blend, crisp core last. Same
//     structure glowTrace always had; the Gaussian is gone.
//   • blitGlowDot / glowSprite — every glowing dot goes through the cached
//     additive sprite pattern that already rescued the particles
//     (render.ts:509 in the blurred era). Node-safe: the DOM cache builds
//     lazily and degrades to a plain colour-carrying fill when `document`
//     is absent (the vitest env), mirroring phosphor's lazy-DOM discipline —
//     the fill fallback MUST set fillStyle to the dot colour because the
//     tp1-15/tp1-30 fidelity suites identify dots by fillStyle at fill().
//   • RENDER_DPR_CAP / cappedDpr — the scene-buffer resolution cap. The
//     shared resizeToDisplay already guards Math.min(2, devicePixelRatio||1)
//     at the canvas; this composes ON TOP for the phosphor scene buffers,
//     where the production trace showed the GPU saturating at dpr 1.75.
//
// Deliberately NOT @arcade/shared/glow: that envelope's whole contract is
// "set the shadow blur, draw, reset" — the exact tax this story removes. The
// story is scoped tempest-local; promote a layered variant to the library
// only when a second game proves the need.

/**
 * Ceiling for the dpr the SCENE (phosphor) buffers render at. The main canvas
 * keeps the display's full dpr for HUD/text crispness; the vector scene — where
 * all the per-pixel compositing work lives — is capped here.
 *
 * 1.5 cuts the user-trace case (dpr 1.75) to ~73% of the pixels and a Retina 2.0
 * to ~56%, while staying visually sharp under the phosphor's own softness.
 * AC-4: this default is provisional until the verify phase's DevTools trace
 * confirms GPU headroom; tune HERE and nowhere else.
 */
export const RENDER_DPR_CAP = 1.5

/**
 * Clamp a device-pixel-ratio to RENDER_DPR_CAP. Degenerate input (0, negative,
 * NaN) comes out as a usable 1 — the cabinet's `devicePixelRatio || 1`
 * convention — because a 0-dpr scene buffer is a crash, not a policy.
 */
export function cappedDpr(dpr: number): number {
  if (!Number.isFinite(dpr) || dpr <= 0) return 1
  return Math.min(dpr, RENDER_DPR_CAP)
}

export interface GlowPass {
  /** Stroke width for this pass, in the caller's coordinate space. */
  readonly width: number
  /** Alpha to MULTIPLY into the caller's ambient globalAlpha for this pass. */
  readonly alpha: number
}

/**
 * The layered-stroke halo for a glow of the given blur radius: an outer bloom
 * reaching ~the old shadow-blur distance, a tighter inner glow, then the crisp
 * core (always last, always full alpha, always the caller's line width).
 *
 * Stroke the SAME path once per pass, widest first, under 'lighter' blending —
 * the alphas add up brightest at the line and fall off outward, which is the
 * neon look the Gaussian used to buy. blur <= 0 is a single crisp pass so
 * non-glow strokes pay nothing.
 *
 * The exact reach/alpha shaping is a tuning surface (verified by eye against
 * the blurred-era look); the STRUCTURE — wider+dimmer halos, core last — is
 * pinned by tests/shell/tp1-40.glow.test.ts.
 */
export function glowStrokePasses(blur: number, lineWidth: number): readonly GlowPass[] {
  if (!(blur > 0)) return [{ width: lineWidth, alpha: 1 }]
  return [
    { width: lineWidth + blur * 2, alpha: 0.08 }, // outer bloom (~the blur reach)
    { width: lineWidth + blur * 0.75, alpha: 0.18 }, // inner glow
    { width: lineWidth, alpha: 1 }, // crisp core
  ]
}

// ── The cached additive dot sprite ───────────────────────────────────────────
// One offscreen canvas per colour: an opaque core out to 25% radius fading to a
// transparent edge — bright centre, soft halo, exactly the blurred-dot look
// under 'lighter'. The palette is a small fixed set (glyph hexes, well colours),
// so the cache never grows unbounded. Built lazily so importing this module
// never touches the DOM (node test env).

const GLOW_SPRITE_SIZE = 64 // offscreen sprite resolution; scaled down on draw
const spriteCache = new Map<string, HTMLCanvasElement>()

/**
 * The cached radial glow sprite for `color`, or null when no DOM is available
 * (vitest's node env) — callers fall back to a plain unblurred fill.
 */
export function glowSprite(color: string): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null
  const cached = spriteCache.get(color)
  if (cached) return cached
  const s = GLOW_SPRITE_SIZE
  const r = s / 2
  const spr = document.createElement('canvas')
  spr.width = s
  spr.height = s
  const g = spr.getContext('2d')!
  const grad = g.createRadialGradient(r, r, 0, r, r, r)
  grad.addColorStop(0, color)
  grad.addColorStop(0.25, color)
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, s, s)
  spriteCache.set(color, spr)
  return spr
}

// The sprite's opaque core spans 25% of its radius, so blitting it at 4x the
// dot's core radius keeps the solid centre the size the old arc drew, with the
// halo reaching ~3 core-radii beyond — the blurred-dot silhouette.
const DOT_HALO_SCALE = 4

/**
 * Draw one glowing dot: core radius `size` at (x, y) in `color`, halo included.
 * Honours the ambient globalAlpha/composite mode. With a DOM: a near-free
 * bitmap blit of the cached sprite. Without one (node tests): a plain arc fill
 * in the dot's colour — no shadow blur on either path, ever.
 */
export function blitGlowDot(
  ctx: CanvasRenderingContext2D, color: string, x: number, y: number, size: number,
): void {
  const spr = glowSprite(color)
  if (spr) {
    const d = size * DOT_HALO_SCALE * 2
    ctx.drawImage(spr, x - d / 2, y - d / 2, d, d)
    return
  }
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(x, y, size, 0, Math.PI * 2)
  ctx.fill()
}
