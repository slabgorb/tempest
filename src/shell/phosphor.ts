// src/shell/phosphor.ts
//
// Phosphor persistence (vector afterglow) — shell-only eye candy. Recreates the
// Atari Color-XY monitor's beam afterglow: fast movers (Flipper flip, spinning
// Claw, bullets) smear while static geometry stays sharp. See
// docs/superpowers/specs/2026-06-28-phosphor-persistence-design.md.

/**
 * Frame-rate-corrected per-frame FADE alpha for the phosphor accumulator.
 *
 * `decay` is the desired retention over one 1/60 s frame (0 = instant clear,
 * 1 = never fades). `dt` is the real elapsed seconds for this drawn frame. The
 * accumulator is an exponential moving average, so to stay frame-rate
 * independent the retention scales as decay^(dt*60); the returned value is the
 * complementary fade `1 - decay^(dt*60)`.
 *
 * At dt = 1/60 this is exactly `1 - decay`. Higher refresh rates (smaller dt)
 * return a smaller fade so N short frames compose to the same retention as one
 * 60 Hz frame.
 */
export function phosphorAlpha(decay: number, dt: number): number {
  const d = Math.max(0, Math.min(1, decay))
  const frames = Math.max(0, dt) * 60
  return 1 - Math.pow(d, frames)
}

export interface Phosphor {
  /**
   * Ensure both buffers are sized to (W·dpr × H·dpr), clear the scratch, set up
   * the scene transform + additive blend on it, and return the scratch ctx for
   * the caller to draw the vector scene into at FULL brightness.
   */
  beginScene(W: number, H: number, dpr: number): CanvasRenderingContext2D
  /**
   * Fold the scratch into the accumulator as an exponential moving average with
   * the given per-frame `fade` alpha, then additively blit the accumulator onto
   * `mainCtx` with the screen `shake` (CSS px) applied to the whole image.
   */
  composite(mainCtx: CanvasRenderingContext2D, dpr: number, fade: number, shake: number): void
  /** Hard-wipe the accumulator to opaque black (framing screens / mode changes). */
  clear(): void
}

export function createPhosphor(): Phosphor {
  // Two device-resolution offscreen canvases, created lazily on first use so
  // merely importing this module never touches the DOM (keeps it test-safe).
  let scratch: HTMLCanvasElement | null = null
  let sctx: CanvasRenderingContext2D | null = null
  let accum: HTMLCanvasElement | null = null
  let actx: CanvasRenderingContext2D | null = null
  let dw = 0
  let dh = 0

  function fillOpaqueBlack(c: CanvasRenderingContext2D, w: number, h: number): void {
    c.setTransform(1, 0, 0, 1, 0, 0)
    c.globalCompositeOperation = 'source-over'
    c.globalAlpha = 1
    c.fillStyle = '#000'
    c.fillRect(0, 0, w, h)
  }

  function ensure(W: number, H: number, dpr: number): void {
    const w = Math.max(1, Math.floor(W * dpr))
    const h = Math.max(1, Math.floor(H * dpr))
    if (!scratch) {
      scratch = document.createElement('canvas')
      sctx = scratch.getContext('2d')!
      accum = document.createElement('canvas')
      actx = accum.getContext('2d')!
    }
    if (w !== dw || h !== dh) {
      dw = w
      dh = h
      scratch.width = w
      scratch.height = h
      accum!.width = w
      accum!.height = h
      // A fresh canvas is transparent black; the accumulator must start OPAQUE
      // black so 'lighter' compositing adds its colour 1:1 (see spec).
      fillOpaqueBlack(actx!, w, h)
    }
  }

  function beginScene(W: number, H: number, dpr: number): CanvasRenderingContext2D {
    ensure(W, H, dpr)
    const c = sctx!
    // Clear scratch to transparent, then apply the SAME scene transform the old
    // renderer used on the main canvas (DPR · centre · uniform 720-scale) plus
    // additive blend + round caps, so every scene-draw function draws identically.
    c.setTransform(1, 0, 0, 1, 0, 0)
    c.globalCompositeOperation = 'source-over'
    c.globalAlpha = 1
    c.clearRect(0, 0, dw, dh)
    const scale = Math.min(W, H) / 720
    c.setTransform(dpr, 0, 0, dpr, 0, 0)
    c.translate(W / 2, H / 2)
    c.scale(scale, scale)
    c.globalCompositeOperation = 'lighter'
    c.lineJoin = 'round'
    c.lineCap = 'round'
    return c
  }

  function composite(
    mainCtx: CanvasRenderingContext2D, dpr: number, fade: number, shake: number,
  ): void {
    if (!scratch || !accum || !actx) return
    // 1) Decay the accumulator toward black (stays opaque): colour *= (1 - fade).
    actx.setTransform(1, 0, 0, 1, 0, 0)
    actx.globalCompositeOperation = 'source-over'
    actx.globalAlpha = fade
    actx.fillStyle = '#000'
    actx.fillRect(0, 0, dw, dh)
    // 2) Add this frame's scene scaled by `fade`: accumulator += fade · scene.
    actx.globalCompositeOperation = 'lighter'
    actx.globalAlpha = fade
    actx.drawImage(scratch, 0, 0)
    actx.globalAlpha = 1
    // 3) Blit the glowing accumulator onto the main canvas additively, shaking
    // the whole image as one (CSS-px shake → device px). The destination rect is
    // the FULL main canvas: since tp1-40 the scene buffers may render at a capped
    // dpr below the canvas's, so the blit scales the accumulator up to fit. When
    // the dprs match this is exactly the old identity blit.
    const sx = (Math.random() - 0.5) * shake * dpr
    const sy = (Math.random() - 0.5) * shake * dpr
    mainCtx.setTransform(1, 0, 0, 1, 0, 0)
    mainCtx.globalCompositeOperation = 'lighter'
    mainCtx.globalAlpha = 1
    mainCtx.drawImage(accum, sx, sy, mainCtx.canvas.width, mainCtx.canvas.height)
  }

  function clear(): void {
    if (!accum || !actx) return
    fillOpaqueBlack(actx, dw, dh)
  }

  return { beginScene, composite, clear }
}
