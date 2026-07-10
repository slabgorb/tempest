# Phosphor Persistence (Vector Afterglow) — Design

**Date:** 2026-06-28
**Status:** Approved design — ready for implementation planning
**Scope:** `tempest/` render shell only. No `core/` changes.

## Problem

Atari's 1981 *Tempest* ran on a **Color XY ("QuadraScan") vector monitor**. The
phosphor on that tube has persistence: when the beam draws a line and moves on,
the line keeps glowing and decays over tens of milliseconds. Things that move
fast — a Flipper flipping lane-to-lane, the player Claw spinning the rim,
bullets — leave a luminous smear, while the static tube stays sharp because the
beam refreshes it in the same place every frame.

This is a **hardware** effect, not anything in the ROM, so it can't be derived
from ROM data. It must be recreated in the renderer.

The current renderer (`src/shell/render.ts`) **hard-clears to opaque black every
frame** (`fillStyle='#000'; fillRect(...)`), so there is zero frame-to-frame
persistence and nothing trails.

## Goal

Recreate the **genuine cabinet afterglow** — the short, real glow seen by eye,
**not** the oversaturated long smear that low-frame-rate capture videos
exaggerate. Static geometry stays crisp; fast movers get a tasteful trail.

**Non-goals:** no per-object trail bookkeeping, no multi-phosphor hue-shift
simulation, no accessibility / reduced-motion toggle, no `core/` involvement, no
new gameplay behavior. Purely a render concern.

## Key Insight

Real phosphor persistence is **global** — every vector decays. But static
geometry is redrawn in the same spot each frame, so it's continuously refreshed
and looks sharp; only **moving** objects leave a visible trail. Therefore **one
global persistence mechanism** reproduces the whole effect — including the
Flipper smear and the spinning-Claw blur the player remembers — with no
per-object special-casing.

## Chosen Approach: Offscreen Phosphor Buffer (B)

A dedicated offscreen canvas accumulates the glowing vector scene. Each frame the
buffer is decayed, this frame's vectors are drawn into it, then it is composited
onto the main canvas. The background vignette is painted **under** it and the
HUD / scanlines / flash / framing text are drawn **fresh on top** — completely
outside the persistence buffer, so they stay crisp and correctly composited.

### Approaches considered

- **A — Single-canvas fade-clear.** Replace the opaque black clear with a
  semi-transparent black fill so the prior frame decays before the new scene is
  drawn over it. Smallest in spirit, but the background vignette and the
  framing-screen early-return share that clear; any opaque repaint in the scene
  region erases trails. Fiddly ordering, easy "trails get wiped" bugs.
- **B — Offscreen phosphor buffer. ✅ Chosen.** Clean separation: persistence is
  isolated to the buffer; vignette/HUD/text are independent and stay sharp; decay
  math lives in one place; trivially disableable. Cost: two extra device-res
  canvases (a scratch + the accumulator, see Architecture) and a few extra
  full-canvas ops per frame (negligible).
- **C — CSS opacity / stacked snapshots.** Rejected. CSS opacity fades a whole
  element uniformly and cannot hold per-pixel motion history — the entire effect.
  Faking it needs N captured layers per trail at N× cost. Canvas does this
  natively and better.

## Architecture

One new shell module, `src/shell/phosphor.ts`, owns **two** offscreen canvases —
a transparent **scratch** (this frame's scene, full brightness, hard-cleared each
frame) and an opaque **accumulator** (the persistence buffer) — plus their 2D
contexts. It exposes a small interface:

```ts
interface Phosphor {
  // Ensure both buffers are sized to (W·dpr × H·dpr); clear the scratch and set
  // up the scene transform (dpr · center · scale) + 'lighter' + round caps on
  // it; return the scratch ctx for the scene to draw into at FULL brightness.
  beginScene(W: number, H: number, dpr: number): CanvasRenderingContext2D
  // EMA the scratch into the accumulator with the given per-frame fade alpha,
  // then additively blit the accumulator onto the main canvas with a shake offset.
  composite(mainCtx: CanvasRenderingContext2D, dpr: number, fade: number, shake: number): void
  // Hard-wipe the accumulator to opaque black (framing screens / mode changes).
  clear(): void
}
```

Why two canvases: the scene-draw functions set `ctx.globalAlpha` internally for
their own effects (particle fade, vanishing-point glow, pulsar strobe), so a
single outer `globalAlpha` can't uniformly scale the scene's contribution — the
sub-functions reset it. Rendering the scene full-brightness into the scratch and
then blitting scratch → accumulator at `globalAlpha = fade` scales the *whole*
frame as one unit, leaving every scene-draw function's body unchanged.

`render.ts` stops drawing the **scene** onto the main `ctx` and draws it onto the
scratch ctx instead. Everything non-vector (background, HUD, scanlines, flash,
framing text) stays on the main `ctx` exactly as today. The existing scene-draw
functions (`drawTube`, `drawEnemy`, `drawPlayer`, `drawWarp`, `drawBullets`,
`drawSpikes`, `drawParticles`, …) keep their bodies unchanged; they just receive
a different `ctx`.

**Boundary:** 100% shell. `core/` is never touched, so determinism is preserved.

## Per-Frame Pipeline

1. **Main canvas (fresh, non-persistent):** black fill + radial vignette
   (unchanged).
2. **Framing modes** (`attract` / `select` / `highscore`): draw frame + scanlines
   on the main canvas, call `phosphor.clear()`, return. Text never smears.
3. **Scene modes** (`playing` / `warp` / `dying` / `gameover`):
   1. `beginScene()` clears the **scratch** and returns its ctx with the existing
      translate/scale + `'lighter'` transform set up.
   2. Draw the scene into the scratch in today's order, at full brightness:
      tube → spikes → (warp dive **or** enemies → bullets → enemy bullets →
      player) → particles. The warp transition is a vector scene and is included
      in persistence.
   3. `composite()` EMA-folds the scratch into the **accumulator** and then
      additively (`'lighter'`) blits the accumulator onto the main canvas, over
      the vignette, with the screen-shake offset applied to the blit.
4. **Main canvas (fresh, non-persistent):** scanlines, death flash,
   AVOID SPIKES, HUD. The full-screen death flash especially must stay out of the
   buffer or it would smear.

The accumulator is kept **opaque** (black background + additive vector light).
Its empty pixels are black, so blitting it onto the main canvas with `'lighter'`
adds nothing there and the vignette shows through; only lit vectors add their
glow. Keeping it opaque (rather than transparent) avoids Canvas `'lighter'`
premultiplying a partial alpha into the color and double-dimming the result.

## Decay & Brightness Model

The accumulator is an **exponential moving average** of the scene:

```
accumulator = decay·accumulator + (1 − decay)·scene
```

Let `fade = 1 − decay`. Mechanically per frame, in `composite()`:

1. **Decay** the accumulator toward black, preserving opacity:
   `globalCompositeOperation='source-over'; globalAlpha=fade; fillStyle='#000';
   fillRect(whole buffer)` → multiplies stored color by `(1 − fade) = decay`,
   alpha stays 1.
2. **Add** this frame's scene, scaled by `fade`:
   `globalCompositeOperation='lighter'; globalAlpha=fade; drawImage(scratch)` →
   adds `fade · scene`.

That yields `accumulator = decay·accumulator + fade·scene` exactly. Because the
scene is fully rendered in the scratch *before* the `fade` scaling, each
sub-function's internal `globalAlpha` works normally and the whole frame is
scaled as one unit.

The math falls out exactly right:

- **Static geometry** (tube, a held-still Claw) reaches steady state `= scene` →
  **identical brightness to today**. The existing tuned bloom (`'lighter'` +
  `shadowBlur` + the chosen hex colors) is preserved; no re-tuning needed.
- **Moving objects** (flipping Flipper, spinning Claw, bullets) peak at
  `(1 − decay)·scene` ≈ 45% and trail off — dimmer-and-smeared, the authentic
  accumulated-static vs single-pass-moving ratio.

One constant governs the whole effect:

```ts
const PHOSPHOR_DECAY = 0.55 // retention per 1/60 s; 0 = instant clear, 1 = never fades
```

Target feel: **authentic short glow** (~3–5 frame visible tail). The value is
tuned by eye while running the game and the final number committed.

## Frame-Rate Independence

`draw` runs once per `requestAnimationFrame`, so on a 120/144 Hz display it fires
2–2.4× as often and would fade trails too fast. `main.ts` already computes real
elapsed `rdt` per draw; thread it into `render()` and derive the per-frame fade:

```
fade = phosphorAlpha(PHOSPHOR_DECAY, rdt) = 1 − PHOSPHOR_DECAY ^ (rdt · 60)
```

At 60 Hz (`rdt = 1/60`), `fade = 1 − PHOSPHOR_DECAY`. At 120 Hz the per-frame fade
is smaller, such that two 120 Hz frames retain the same fraction as one 60 Hz
frame — so a 144 Hz monitor matches 60 Hz. `phosphorAlpha(decay, dt)` is a **pure
function** (no canvas, no DOM) and is the one unit-tested piece; `composite()`
consumes its result as the `fade` argument.

## Resize & Lifecycle

- Both offscreen buffers track `canvas.width` / `canvas.height` (device pixels).
  `beginScene` lazily resizes them when the dims drift (a resize wipes trails —
  acceptable) and (re)initializes the accumulator to opaque black.
- `clear()` runs on framing screens and on the mode change back into a scene so
  stale trails never leak across a transition.

## Testing

Per the repo rule, the shell is verified by **running the game** and `core/`
stays pure (no determinism tests touched).

- **Unit test:** the pure `phosphorAlpha(decay, dt)` helper (frame-rate
  correction) — e.g. `dt = 1/60` returns `1 − decay`; two 120 Hz frames retain
  the same fraction as one 60 Hz frame (`(1 − phosphorAlpha(d, 1/120))² ≈ d`);
  `decay = 0` returns `1` (full clear); `dt = 0` returns `0` (no fade).
- **Visual checks (run the game):**
  - Spin the Claw fast → short luminous smear; hold still → crisp, full-bright
    Claw.
  - Flipper mid-flip leaves a brief trail across lanes.
  - Tube and HUD/title text are razor-sharp (no smear on static geometry or
    text).
  - Warp dive trails pleasingly.
  - 60 Hz and 120 Hz displays look the same.
  - Death flash does not smear; framing screens show no ghosting.

## Performance

Extra cost per frame: one scratch `clearRect`, one accumulator `source-over`
black fade, one `drawImage` scratch → accumulator, and one `drawImage`
accumulator → main — plus rendering the scene into the scratch instead of the
main canvas (same cost as today). ~3–4 extra full-canvas ops/frame, trivial for a
GPU-backed canvas, no `shadowBlur` count change. Memory: two extra device-res
canvases (dpr capped at 2) — on a 1440p window ≈ 15 MB each.

## Out of Scope

- `prefers-reduced-motion` / any motion toggle (explicitly declined).
- Per-channel / hue-shift phosphor decay.
- Any `core/` change or new gameplay behavior.
