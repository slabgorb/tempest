# Phosphor Persistence (Vector Afterglow) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recreate the Atari Color-XY monitor's phosphor afterglow so fast-moving vectors (Flipper flip, spinning Claw, bullets) leave a short luminous trail while static geometry and all text stay sharp.

**Architecture:** A new shell module `src/shell/phosphor.ts` owns two device-resolution offscreen canvases — a transparent **scratch** (this frame's scene, full brightness) and an opaque **accumulator** (the persistence buffer). Each frame, `render.ts` draws the vector scene into the scratch, then the accumulator is updated as an exponential moving average `accumulator = decay·accumulator + (1−decay)·scene` and blitted additively onto the main canvas. Background, HUD, scanlines, flash and framing text stay on the main canvas, untouched. No `core/` changes.

**Tech Stack:** TypeScript (ES modules, strict), Canvas 2D, Vite, Vitest.

## Global Constraints

- **Hard boundary:** `core/` stays pure — this work is 100% in `src/shell/`. Do not import shell into core; do not touch `core/`.
- **Repo testing posture:** the pure core is unit-tested; the shell (render/canvas) is verified by **running the game**. Only the pure `phosphorAlpha` helper gets a Vitest test here.
- **Commit policy:** this repo commits only when the user asks. The commit steps below are the intended granularity; run them when the user gives the go-ahead. Work on a feature branch: `feat/phosphor-persistence` off `develop` (PRs target `develop`).
- **Authentic-short feel:** `PHOSPHOR_DECAY = 0.55` (retention per 1/60 s) is the starting value; final value is tuned by eye while running the game.
- **Reference spec:** `docs/superpowers/specs/2026-06-28-phosphor-persistence-design.md`.

---

### Task 1: Pure `phosphorAlpha` frame-rate-correction helper

Creates the new module with only the pure, unit-tested decay-math function. No canvas yet.

**Files:**
- Create: `src/shell/phosphor.ts`
- Test: `tests/shell/phosphor.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `phosphorAlpha(decay: number, dt: number): number` — returns the per-frame **fade** alpha `1 − clamp(decay,0,1) ^ (dt·60)`. Used by `render.ts` (Task 3) as the `fade` passed to `composite()`.

- [ ] **Step 1: Write the failing test**

Create `tests/shell/phosphor.test.ts`:

```ts
// tests/shell/phosphor.test.ts
import { describe, it, expect } from 'vitest'
import { phosphorAlpha } from '../../src/shell/phosphor'

describe('phosphorAlpha', () => {
  it('returns 1 - decay at the 60 Hz baseline (dt = 1/60)', () => {
    expect(phosphorAlpha(0.55, 1 / 60)).toBeCloseTo(0.45, 10)
  })

  it('is frame-rate independent: two 120 Hz frames retain like one 60 Hz frame', () => {
    const d = 0.55
    const fade120 = phosphorAlpha(d, 1 / 120)
    const retainedTwoFrames = (1 - fade120) ** 2
    expect(retainedTwoFrames).toBeCloseTo(d, 10)
  })

  it('clears instantly when decay is 0 (full fade each frame)', () => {
    expect(phosphorAlpha(0, 1 / 60)).toBe(1)
  })

  it('does not fade when no time has elapsed (dt = 0)', () => {
    expect(phosphorAlpha(0.55, 0)).toBe(0)
  })

  it('clamps decay into [0, 1]', () => {
    expect(phosphorAlpha(1.5, 1 / 60)).toBe(0) // retention clamped to 1 -> no fade
    expect(phosphorAlpha(-1, 1 / 60)).toBe(1)  // retention clamped to 0 -> full fade
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- phosphor`
Expected: FAIL — `phosphorAlpha` is not exported / module `src/shell/phosphor.ts` not found.

- [ ] **Step 3: Write the minimal implementation**

Create `src/shell/phosphor.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- phosphor`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/shell/phosphor.ts tests/shell/phosphor.test.ts
git commit -m "feat(phosphor): frame-rate-correct decay helper"
```

---

### Task 2: `createPhosphor()` two-canvas accumulation buffer

Adds the canvas-owning factory to `src/shell/phosphor.ts`. Not unit-tested (Canvas 2D isn't available in the node test env, per repo posture) — verified by `npm run build` here and visually in Task 3.

**Files:**
- Modify: `src/shell/phosphor.ts` (append to the file from Task 1)

**Interfaces:**
- Consumes: `phosphorAlpha` is in the same module (used by the caller, not here).
- Produces:
  - `interface Phosphor { beginScene(W, H, dpr): CanvasRenderingContext2D; composite(mainCtx, dpr, fade, shake): void; clear(): void }`
  - `createPhosphor(): Phosphor` — lazily creates its two offscreen canvases on first `beginScene`/`composite`/`clear`, so importing the module never touches the DOM.
  - `beginScene(W, H, dpr)` clears the scratch, sets the scene transform (`dpr` · center · `min(W,H)/720` scale) + `'lighter'` + round caps, and returns the scratch ctx. Draw the scene into it at full brightness.
  - `composite(mainCtx, dpr, fade, shake)` EMA-folds the scratch into the opaque accumulator using `fade`, then additively blits the accumulator onto `mainCtx` with a random shake offset (in device px).
  - `clear()` resets the accumulator to opaque black.

- [ ] **Step 1: Append the implementation**

Append to `src/shell/phosphor.ts`:

```ts
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
    // the whole image as one (CSS-px shake → device px). Identity transform: the
    // accumulator is already at device resolution.
    const sx = (Math.random() - 0.5) * shake * dpr
    const sy = (Math.random() - 0.5) * shake * dpr
    mainCtx.setTransform(1, 0, 0, 1, 0, 0)
    mainCtx.globalCompositeOperation = 'lighter'
    mainCtx.globalAlpha = 1
    mainCtx.drawImage(accum, sx, sy)
  }

  function clear(): void {
    if (!accum || !actx) return
    fillOpaqueBlack(actx, dw, dh)
  }

  return { beginScene, composite, clear }
}
```

- [ ] **Step 2: Typecheck + confirm existing tests still pass**

Run: `npm run build`
Expected: PASS — `tsc --noEmit` reports no errors and `vite build` completes.

Run: `npm test -- phosphor`
Expected: PASS (Task 1's 5 tests still green; the new code adds no tests).

- [ ] **Step 3: Commit**

```bash
git add src/shell/phosphor.ts
git commit -m "feat(phosphor): two-canvas EMA accumulation buffer"
```

---

### Task 3: Wire the phosphor buffer into the render pipeline

Routes the vector scene through the scratch/accumulator and threads the real frame `dt` from `main.ts`. This is the integration task — verified by running the game.

**Files:**
- Modify: `src/shell/render.ts` (imports near line 1–10; `render()` body lines ~726–806; framing early-return lines ~751–756; scene block lines ~758–783)
- Modify: `src/main.ts:104` (the `render(...)` call)

**Interfaces:**
- Consumes: `createPhosphor`, `phosphorAlpha` from `./phosphor` (Tasks 1–2); `rdt` (real elapsed seconds), already computed in `main.ts` at lines ~61–63.
- Produces: `render(ctx, s, W, H, fx, dpr, dt)` — `render` gains a 7th parameter `dt: number` (real elapsed seconds for this drawn frame).

- [ ] **Step 1: Add imports, the decay constant, and a module-level phosphor instance to `render.ts`**

In `src/shell/render.ts`, add to the import block at the top (after the existing `import { Fx } from './fx'` line):

```ts
import { createPhosphor, phosphorAlpha } from './phosphor'
```

Add the decay constant next to `CLAW_COLOR` (near line 17):

```ts
// Phosphor afterglow retention per 1/60 s frame (0 = instant clear, 1 = never
// fades). 0.55 ≈ the authentic Color-XY short glow; tune by eye while running.
const PHOSPHOR_DECAY = 0.55
```

Add the module-level singleton next to the other render-only accumulators (near line 66, after `let renderTime = 0`). `createPhosphor()` is DOM-free until first use, so this is safe at import time:

```ts
// Persistence buffer for the vector scene (shell-only afterglow). Lazily builds
// its offscreen canvases on first beginScene/composite/clear.
const phosphor = createPhosphor()
```

- [ ] **Step 2: Clear the buffer on framing screens**

In `render.ts`, the framing early-return (currently lines ~751–756) is:

```ts
  if (s.mode === 'attract' || s.mode === 'select' || s.mode === 'highscore') {
    drawFrame(ctx, s, W, H, color)
    drawScanlines(ctx, W, H)
    ctx.shadowBlur = 0
    return
  }
```

Add `phosphor.clear()` so trails never leak across a transition back into play:

```ts
  if (s.mode === 'attract' || s.mode === 'select' || s.mode === 'highscore') {
    drawFrame(ctx, s, W, H, color)
    drawScanlines(ctx, W, H)
    ctx.shadowBlur = 0
    phosphor.clear()
    return
  }
```

- [ ] **Step 3: Route the scene through the phosphor buffer**

In `render.ts`, replace the entire scene block (currently lines ~758–783):

```ts
  const scale = Math.min(W, H) / 720
  const sx = (Math.random() - 0.5) * fx.shake
  const sy = (Math.random() - 0.5) * fx.shake

  ctx.save()
  ctx.translate(W / 2 + sx, H / 2 + sy)
  ctx.scale(scale, scale)
  ctx.globalCompositeOperation = 'lighter' // additive vector bloom
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  drawTube(ctx, s, color, currentLane(s.tube, s.player.lane))
  drawSpikes(ctx, s)
  if (s.mode === 'warp') {
    // Diving-Claw warp transition; spikes above stay drawn so a crash reads.
    drawWarp(ctx, s, color)
  } else {
    // Far enemies first so near ones overdraw them.
    const ordered = s.enemies.slice().sort((a, b) => a.depth - b.depth)
    for (const e of ordered) drawEnemy(ctx, s, e)
    drawBullets(ctx, s)
    drawEnemyBullets(ctx, s)
    drawPlayer(ctx, s)
  }
  drawParticles(ctx, fx)
  ctx.restore()
```

with this — the scene draws into the phosphor scratch (`pctx`), then composites onto the main canvas, then the main ctx is restored to CSS-pixel space + normal compositing for the overlays that follow:

```ts
  // Draw the vector scene into the phosphor scratch (full brightness), fold it
  // into the persistence accumulator as an EMA, and blit that onto the main
  // canvas. Static geometry stays sharp; fast movers trail. The screen shake is
  // applied by composite() to the whole accumulated image.
  const pctx = phosphor.beginScene(W, H, dpr)
  drawTube(pctx, s, color, currentLane(s.tube, s.player.lane))
  drawSpikes(pctx, s)
  if (s.mode === 'warp') {
    // Diving-Claw warp transition; spikes above stay drawn so a crash reads.
    drawWarp(pctx, s, color)
  } else {
    // Far enemies first so near ones overdraw them.
    const ordered = s.enemies.slice().sort((a, b) => a.depth - b.depth)
    for (const e of ordered) drawEnemy(pctx, s, e)
    drawBullets(pctx, s)
    drawEnemyBullets(pctx, s)
    drawPlayer(pctx, s)
  }
  drawParticles(pctx, fx)
  phosphor.composite(ctx, dpr, phosphorAlpha(PHOSPHOR_DECAY, dt), fx.shake)

  // Overlays (scanlines/flash/HUD) draw in CSS-pixel space with normal blending.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
```

Note: the old local `scale`, `sx`, `sy` are intentionally removed — `scale` now lives inside `beginScene`, and the shake is applied inside `composite`. Everything after this block (`drawScanlines`, the flash, AVOID SPIKES, `drawHud`) is unchanged.

- [ ] **Step 4: Add the `dt` parameter to `render()`**

In `render.ts`, change the signature (currently lines ~726–733):

```ts
export function render(
  ctx: CanvasRenderingContext2D,
  s: GameState,
  W: number,
  H: number,
  fx: Fx,
  dpr: number,
): void {
```

to add `dt`:

```ts
export function render(
  ctx: CanvasRenderingContext2D,
  s: GameState,
  W: number,
  H: number,
  fx: Fx,
  dpr: number,
  dt: number,
): void {
```

- [ ] **Step 5: Pass the real frame `dt` from `main.ts`**

In `src/main.ts`, the draw callback already computes `rdt` (real elapsed seconds, clamped to 0.05) at lines ~61–63. Change the render call at line 104 from:

```ts
    render(ctx, s, W, H, fx, dpr)
```

to:

```ts
    render(ctx, s, W, H, fx, dpr, rdt)
```

- [ ] **Step 6: Typecheck and run the unit tests**

Run: `npm run build`
Expected: PASS — no TS errors (no unused-local error for the removed `scale`/`sx`/`sy`; `render` is called with all 7 args).

Run: `npm test`
Expected: PASS — all suites green (no behavioral test changes).

- [ ] **Step 7: Visual verification (run the game)**

Run: `npm run dev` → open `http://localhost:5273/tempest/` and confirm:
- Spin the Claw fast → a short luminous smear; hold still → a crisp, full-bright Claw (same brightness as before this change).
- A Flipper mid-flip leaves a brief trail across lanes; bullets streak.
- The tube and **all HUD / title / high-score text are razor-sharp** — no smear on static geometry or text.
- Enter a warp (clear a level) → the diving Claw and speed streaks trail pleasingly.
- Trigger a death → the red full-screen flash does **not** smear; the attract/title screen shows no ghosting after game over.
- If trails look too long/short or static geometry looks too bright/dim, tune `PHOSPHOR_DECAY` (higher = longer trail) and re-check; commit the final value.

- [ ] **Step 8: Commit**

```bash
git add src/shell/render.ts src/main.ts
git commit -m "feat(phosphor): route vector scene through the persistence buffer"
```

---

## Self-Review

**1. Spec coverage:**
- Offscreen buffer approach (B) → Tasks 2–3. ✅
- Scratch + opaque accumulator, EMA `decay·old + (1−decay)·scene` → Task 2 `composite()`. ✅
- Static-stays-bright / movers-smear (no re-tuning) → preserved by drawing the scene into the scratch unchanged and scaling by `fade` (Task 2/3). ✅
- `PHOSPHOR_DECAY = 0.55`, tuned by eye → Task 3 Step 1 + Step 7. ✅
- Frame-rate independence via `phosphorAlpha(decay, dt)` and real `rdt` → Task 1 + Task 3 Steps 4–5. ✅
- Warp included in persistence → Task 3 Step 3 (`drawWarp` draws into `pctx`). ✅
- Framing/HUD/scanlines/flash non-persistent; `clear()` on framing → Task 3 Steps 2–3. ✅
- Resize wipes + re-inits accumulator to opaque black → Task 2 `ensure()`. ✅
- Reduced-motion explicitly out of scope → not implemented. ✅
- `core/` untouched → only `src/shell/*` and `src/main.ts` modified. ✅

**2. Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to" — every code step shows complete code. ✅

**3. Type consistency:** `phosphorAlpha(decay, dt): number`, `Phosphor` interface (`beginScene(W,H,dpr)`, `composite(mainCtx,dpr,fade,shake)`, `clear()`), and `createPhosphor()` are named identically in Tasks 1, 2, and their call sites in Task 3. `render(...)` gains exactly one `dt` parameter, passed `rdt` from `main.ts`. ✅
