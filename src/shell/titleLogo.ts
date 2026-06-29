// src/shell/titleLogo.ts
//
// The attract-mode title's "approaching rainbow" model — shell-only eye candy
// (Story 10-6). The 1981 attract draws TEMPEST as the book's "approaching logo
// process" (SCARNG / LOGPRO): the word stacked across ~19 depth passes from the
// far horizon to the viewer, each pass a different rainbow colour, the whole
// stack marching forward every frame and recycling. This module owns ONLY the
// pure depth / scale / colour math; render.ts turns each pass into glowing text.
// Keeping it pure makes it unit-testable in the node env, where render() can't
// run (it needs a real canvas).

/** One depth pass of the title: where it sits in Z, how big it draws, its hue. */
export interface LogoPass {
  /** 0 = far horizon … →1 = arrived at the viewer. */
  readonly depth: number
  /** Size multiplier; strictly increases with depth (far small, near large). */
  readonly scale: number
  /** One of LOGO_PALETTE — the repeating rainbow stripe for this pass. */
  readonly color: string
}

/** Number of depth passes stacked from far to near (the book's ~19). */
export const LOGO_PASSES = 19

/**
 * The SCARNG rainbow, far→near: white, yellow, magenta, red, cyan, green —
 * full-saturation vector hues. With LOGO_PASSES (19) passes over 6 colours the
 * stripe repeats ~3× down the stack, so the rainbow reads as it advances.
 */
export const LOGO_PALETTE: readonly string[] = [
  '#ffffff', // white
  '#ffff00', // yellow
  '#ff00ff', // magenta
  '#ff0000', // red
  '#00ffff', // cyan
  '#00ff00', // green
]

// Perspective scale: a pass at depth d sits at distance z, and apparent size is
// the near-plane distance over z (the classic 1/z perspective divide). depth 0
// (far) → z = LOGO_Z_FAR → small; depth 1 (viewer) → z = LOGO_Z_NEAR → full size.
const LOGO_Z_NEAR = 1
const LOGO_Z_FAR = 8

function logoScale(depth: number): number {
  const z = LOGO_Z_FAR + (LOGO_Z_NEAR - LOGO_Z_FAR) * depth
  return LOGO_Z_NEAR / z
}

/**
 * The LOGO_PASSES passes of the title at animation clock `phase`, ordered
 * far→near (ascending depth).
 *
 * Pass k (k = 0..LOGO_PASSES-1) sits at depth `(k + frac(phase)) / LOGO_PASSES`,
 * so the passes are evenly spaced (gap = 1/LOGO_PASSES) across [0, 1). Increasing
 * `phase` within a cycle advances every pass toward the viewer; the pattern
 * recycles every 1.0 of phase (frac wraps), so a pass arriving at the viewer is
 * replaced by a fresh one at the horizon. Any real `phase` (negative or large) is
 * wrapped into a valid in-range frame.
 */
export function titleLogoPasses(phase: number): readonly LogoPass[] {
  const frac = phase - Math.floor(phase) // [0, 1), correct for negative phases too
  const passes: LogoPass[] = []
  for (let k = 0; k < LOGO_PASSES; k++) {
    const depth = (k + frac) / LOGO_PASSES
    passes.push({
      depth,
      scale: logoScale(depth),
      color: LOGO_PALETTE[k % LOGO_PALETTE.length],
    })
  }
  return passes
}
