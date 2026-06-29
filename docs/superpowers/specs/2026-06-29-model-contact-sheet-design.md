# Tempest Model Contact Sheet — Design

**Date:** 2026-06-29
**Author:** Architect (Emmanuel Goldstein)
**Status:** Approved design — ready for implementation plan
**Type:** Developer tool (not player-facing)

## Overview

A standalone dev page, `/models.html`, that renders every Tempest actor — the
five enemies (flipper, tanker, spiker, fuseball, pulsar) plus the player claw —
in a contact-sheet grid. Each cell is a **flat, three-lane board**: the simplest
possible tube geometry, used purely as a neutral display surface on which the
actor performs its **characteristic motion**.

This is the Tempest analog of Star Wars's `/models.html`
(`star-wars/src/tools/contactSheet.ts`). There, models **auto-rotate** because a
3D form reveals itself through rotation. Tempest is 2.5D — there is no 3D form to
turn — so the reveal is **motion on the tube**: the flipper tumbles lane-to-lane,
the fuseball writhes and hops the rim, the spiker spins and lays spike, the
pulsar strobes and electrifies its lane, the claw walks the near rim.

Like the Star Wars sheet, every cell is drawn through the **same render pipeline
the game uses** (`shell/render.ts`), so edits to glyph geometry or projection
appear on the contact sheet with no extra wiring.

## Goals

- See every model's shape **and motion** at a glance, on a clean stage.
- Stay faithful to the game with zero drift — reuse the real glyphs + render path.
- Pure, testable layout/geometry math in `core/`; thin DOM tool in `tools/`.
- Mirror the Star Wars dev-tool pattern so the two repos stay legible together.

## Non-Goals

- **Not** player-facing. It is never imported by `core/`, the sim, or any test,
  and is not reachable from the game, attract mode, or the lobby.
- No new gameplay, no new enemy behavior, no rotation/3D.
- No cross-repo shared library (see "Deliberate duplication" below).

## The Star Wars precedent (what we are mirroring)

| Star Wars | Tempest equivalent |
|-----------|--------------------|
| `star-wars/models.html` | `tempest/models.html` |
| `src/tools/contactSheet.ts` (DOM tool) | `src/tools/contactSheet.ts` (DOM tool) |
| `core/modelView.ts` (pure: bounds, fit-distance, `cellRects`) | `core/modelView.ts` (pure: `cellRects`, `flatTube`) |
| reveal = **auto-rotation** through `shell/wireframe.ts` | reveal = **scripted motion** through `shell/render.ts` |
| 3-column grid of cells | 3-column grid of cells |
| `[SPACE]` pause, `[G]` scale toggle | `[SPACE]` pause |

## Architecture

### Files

- **`tempest/models.html`** — Vite entry: a full-bleed `<canvas id="sheet">` on
  black plus `<script type="module" src="/src/tools/contactSheet.ts">`. A near
  copy of `star-wars/models.html`.

- **`tempest/src/core/modelView.ts`** — **pure, unit-tested.** No DOM, no time,
  no randomness (honors the core purity rule). Exports:
  - `cellRects(w, h, count, cols)` — row-major grid partition of a `w×h` area
    into `count` cells across `cols` columns. (Direct port of the Star Wars
    helper.)
  - `flatTube(lanes)` — builds the flat three-lane board as a `Tube`
    (`closed: false`). `near` points lie on a horizontal line near the bottom of
    a unit cell; `far` points lie on a shorter, higher horizontal line (a flat
    trapezoid), so depth `0→1` reads as "rises from the back of the board toward
    the front rim." `laneCount = lanes` (3), with `lanes + 1` boundary points.

- **`tempest/src/tools/contactSheet.ts`** — the DOM/render tool. Owns the
  canvas, the rAF loop, per-cell viewport clipping, the per-model choreography,
  and the labels. Never touched by the sim or tests.

### Render seam (one small change to `shell/render.ts`)

The per-element draws are currently private. Expose the minimal seam the tool
needs, exactly as Star Wars exposes `drawWireframe`:

- Preferred: export `drawTube`, `drawEnemy`, `drawPlayer` so the tool can call
  them per cell after `ctx.translate`/`ctx.clip` into the cell rect.
- Alternative (tighter surface): add one exported helper
  `drawModelCell(ctx, rect, state, actor)` that does the clip/translate and
  dispatches to the existing private draws, keeping `render.ts` internals
  encapsulated.

Either way: **no glyph or projection logic is duplicated in the tool.** Dev picks
whichever keeps the public surface smallest; the constraint is "reuse the
existing draws, do not re-implement them."

> Note: `render.ts` uses module-level animation state (`renderTime`,
> `clawPrevLane`, `walkPhase`). On the single-canvas contact sheet this is shared
> across cells, which is fine — every cell animates on the same clock. If the
> walk-gait bookkeeping (`clawPrevLane`) misbehaves with only one claw cell,
> seeding it once is acceptable; it is cosmetic.

## The reveal: motion (Approach A — scripted poses)

Each cell holds a **synthetic `GameState`**: a `flatTube(3)` plus exactly one
actor (one `Enemy` of the cell's kind, or the player). Every frame the tool:

1. Advances a tiny **per-model choreography** that sets the state-driven motion
   fields (below), looping smoothly.
2. Bumps the shared render clock.
3. Calls the exposed draw(s), clipped/translated into the cell rect.

The **frame-driven** animation — flipper idle spin, fuseball writhe frames,
spiker spin frames, pulsar colour/jaggedness strobe, claw walk gait — comes
**free** from `render.ts`, because those effects are computed inside the existing
draws from `renderTime` and the actor's fields. The tool only authors the
**state-driven** part:

| Model | State the tool scripts each frame | Free from render.ts |
|-------|-----------------------------------|---------------------|
| Flipper | `depth` climb far→near; periodically set `flipping`, `flipDir`, ramp `flipProgress` 0→1, then settle on the next lane | bowtie spin + mid-flip half-turn |
| Tanker | `depth` climb; cycle `contains` (`flipper`/`fuseball`/`pulsar`) so the cargo emblem is visible | X-diamond + emblem |
| Spiker | `depth` climb; lay a growing `spikes[lane]` trail behind it | 4-frame pinwheel spin |
| Fuseball | hop `lane` among the 3 lanes on a timer; vary `depth` | 4-frame writhe |
| Pulsar | hold a lane; toggle `pulsing` on/off on a beat | zig-zag + colour/lane strobe |
| Player claw | sweep `player.lane` across the 3 lanes and back | stepping gait + body rock |

The choreography is a small declarative table (one entry per model). It is a fair
*approximation* of in-game motion, not the exact AI — which is the point: a clean,
legible loop that shows what the actor looks like when it moves.

### Approach B (considered, not chosen): run the real sim

Inject one enemy into a real `GameState` and call `stepGame` each frame for 100%
authentic motion (true flip cadence, RNG-driven fuseball jitter). Rejected for
v1: it needs a seam to spawn a specific enemy outside the normal spawn tables,
plus loop/reset handling when the actor dies or reaches the near rim, and couples
the tool to the sim. Approach A mirrors Star Wars (the tool choreographs; the
render pipeline keeps the *model* faithful) and is decoupled. B is a clean future
upgrade if scripted motion ever feels wrong.

## Layout & presentation

- Grid: 6 cells (5 enemies + claw), **3 columns × 2 rows** via `cellRects`. The
  three-wide grid also echoes the three-lane board.
- Each cell: the flat 3-lane board centered in the cell, the actor looping its
  motion, and a caption — model name + a short motion descriptor, e.g.
  `FLIPPER · flips lane→lane`, `FUSEBALL · writhes the rim`. Use the glyph's own
  colour for the label, matching the Star Wars sheet's per-cell colour labels.
- Footer hint: `[SPACE] pause/play`.

## Controls

- `SPACE` — pause/resume all motion (mirrors Star Wars). No scale toggle: flat
  boards make "fit vs gameplay distance" meaningless.

## Deliberate duplication

`cellRects` is a ~12-line pure function copied from Star Wars's `core/modelView.ts`.
The orchestrator's rule is "no shared code until a second game proves the
duplication is real." Two tiny copies of a grid-partition helper do not justify
standing up a cross-repo shared library and coupling two independent subrepos.
When a third consumer appears, revisit extraction. Copy, with a comment pointing
at the Star Wars original.

## Testing

- **`core/modelView.ts`** gets Vitest coverage:
  - `cellRects`: cell count = `count`; row/column placement is row-major; cells
    tile the area without gaps/overlap; `cols` clamped to ≥1.
  - `flatTube`: `laneCount === 3`, `closed === false`, `near.length === far.length === 4`,
    near points colinear (constant y) and below far points (rises with depth).
- **The tool** (`contactSheet.ts`) is verified by running `/models.html` and
  eyeballing each cell — same policy as Star Wars and the rest of the shell.
- The render-seam change must not alter game rendering: existing render/visual
  behavior is unchanged because only export visibility (or one additive helper)
  is added.

## Implementation outline (for Dev)

1. **`core/modelView.ts`** — write `cellRects` + `flatTube`, TDD against the
   tests above. (Pure; no DOM/time/random.)
2. **`shell/render.ts`** — expose the render seam (export the three draws, or add
   `drawModelCell`). No behavior change.
3. **`tools/contactSheet.ts`** — canvas/rAF setup (copy Star Wars scaffolding),
   `cellRects` layout, the per-model choreography table, per-cell synthetic
   `GameState`, draw via the seam, labels + footer, `SPACE` pause.
4. **`models.html`** — Vite entry pointing at the tool.
5. Verify: `npm run build` (tsc) is clean, `npm test` passes, `/models.html`
   shows all six actors moving on their flat boards.

## Open questions / follow-ups

- If `clawPrevLane` gait bookkeeping looks off with a single claw cell, seed it
  on first frame (cosmetic).
- Approach B (real sim per cell) is the documented upgrade path if scripted
  motion is unconvincing.
