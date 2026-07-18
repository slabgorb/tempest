# CLAUDE.md — Tempest

Guidance for working in this repository.

## Project Overview

A faithful, browser-based clone of Atari's 1981 vector arcade game *Tempest*.
The player controls the "Claw" on the near rim of a geometric tube, rotating
around it to shoot enemies climbing up the lanes. Glowing vector lines on black,
rendered with HTML5 Canvas 2D. The game is a **deterministic pure simulation
core** wrapped by a thin input/render/audio shell.

North-star design doc: `docs/superpowers/specs/2026-06-24-tempest-clone-design.md`.

Fidelity reference: `docs/2026-07-12-tempest-primary-source-audit.md` — our implementation
audited against Theurer's original 1981 source. Take arcade constants from there, not from the
book-derived findings doc. **The ROM runs at 28.44 fps, not 60.**

- **Type:** Single-repo browser game (client-only, no backend)
- **Language:** TypeScript (ES modules, strict)
- **Build tool:** Vite · **Testing:** Vitest (TDD on the pure core)
- **Status:** Playable. Waves 0–5 complete (skeleton → full roster → levels/warp
  → framing → audio/polish); Wave 6 in progress.

## Repository Structure

```
tempest/
├── src/
│   ├── core/            # PURE, unit-tested, no DOM/canvas
│   │   ├── geometry.ts  # tube definitions, projection math
│   │   ├── state.ts     # GameState type
│   │   ├── sim.ts       # stepGame(state, input, dt) → state
│   │   ├── enemies/     # per-type state machines
│   │   ├── rules.ts     # scoring, difficulty params, spawn tables
│   │   └── rng.ts       # seeded PRNG (deterministic)
│   ├── shell/           # IO: render.ts, input.ts, audio.ts, loop.ts
│   └── main.ts          # bootstrap: canvas + wire shell ↔ core
├── tests/               # Vitest suites (mostly against the pure core)
├── tools/               # build-time tooling (e.g. POKEY SFX bake)
├── docs/                # design docs and specs
├── index.html           # Vite entry
└── vite.config.ts       # dev server pinned to port 5273
```

## The Hard Architectural Boundary (most important rule)

`core/` is a **pure, deterministic simulation**. It must NEVER:

- import from `shell/`
- touch the DOM, `window`, `document`, or `canvas`
- call `Date.now()`, `new Date()`, `performance.now()`, `Math.random()`, or
  `requestAnimationFrame`

All time enters `core/` as `dt`. All randomness comes from the seeded RNG carried
in `GameState`. `stepGame(state, input, dt) → state` must produce identical output
for identical input. This is what makes the game unit-testable and frame-rate
independent — do not erode it.

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Vite dev server → http://localhost:5273
npm run build        # tsc --noEmit && vite build
npm test             # vitest run --passWithNoTests
npm run test:watch   # vitest in watch mode
npm test -- <name>   # Run a specific test file/pattern
```

## Testing

TDD on the pure core with Vitest — write the failing test first, then make it
pass. Cover: projection/geometry math (lane interpolation, wrap vs clamp), each
enemy state machine driven by a fixed RNG seed, collision (bullet↔enemy,
enemy↔player, spike↔player-on-warp), and scoring/spawn/level-transition logic.
The shell (render/input/audio/loop) is verified by running the game.

## The fidelity audit and its citation gate

`docs/audit/findings/*.json` is the machine-checked half of the primary-source audit.
Every finding carries two citations: `source` (a byte-exact quote of Theurer's 1981
assembler) and `ours` (a byte-exact quote of the line in THIS repo that diverges from it).
`npm test -- citations` re-opens both and compares. A citation that cannot be re-opened is
not evidence, so **the gate is not optional and must stay green**.

The `source` side is byte-checked live against the 1981 assembler, which never changes. The
`ours` side is byte-checked against our code **as it stood at the audit commit `4232ed4`** —
NOT the working tree (story tp1-22). The record is `git show 4232ed4:<file>`; CI's
`fetch-depth: 0` is what keeps that blob reachable. Freezing `ours` to the audit commit is
deliberate: the audit record is immutable, so a later story that legitimately fixes or
refactors a cited line can no longer redden the gate. Before tp1-22 the gate read the
working tree, and every `tp1` fix story paid a tax of re-pointing dozens of citations by
hand — that tax is gone.

Two conventions still matter:

1. **Fixed a finding? Record it with `"remediated_by": "<story-id>"`.**
   The freeze keeps the gate green whether or not you do this, but the field is how the audit
   RECORDS that a defect was corrected, and by which story — the durable, honest route back
   to the change. The checker then keeps `ours` as HISTORY (the quote of what our code said
   when it was audited) and does not re-open it. A NO_COUNTERPART finding may keep `ours:
   null` — the rule was missing outright, so there was no line to quote — or point `ours` at
   the code that now implements it. Do NOT re-point a fixed finding's `ours` at the corrected
   line: that makes the finding assert the fix is the defect.

2. **`ours` must always name a tracked file in this repo** — never `node_modules/`, whose
   line numbers move on every re-pin (the checker rejects it outright). If the gate goes red
   with "does not match verbatim at 4232ed4", the finding's `ours` has drifted off the
   immutable record: re-baseline its quote to the `4232ed4` text, or mark it `remediated_by`
   if it was actually fixed. `node tools/audit/reanchor-citations.mjs` validates every `ours`
   quote against the audit commit and reports any that are LOST; it no longer moves line
   numbers, because `ours` is frozen and its stored line is now decorative.

> This convention was invented twice, independently, because it was written down nowhere:
> tp1-1 shipped `remediated_by` and tp1-3 shipped an identical `fixed_in` in parallel, and
> they collided on merge. `remediated_by` won. Do not add a third name.

## Build Roadmap

Built in "waves," each a self-contained slice:

- **Wave 0 — Skeleton:** Vite+TS, canvas bootstrap, fixed-timestep loop, one
  glowing tube, mousewheel moves the Claw. ✅
- **Wave 1 — Playable slice:** bullets, Flippers, collisions, lives, score. ✅
- **Wave 2 — Full roster:** Tankers, Spikers + spikes, Fuseballs, Pulsars. ✅
- **Wave 3 — Levels & warp:** 16 geometries, color cycling, warp + ramp. ✅
- **Wave 4 — Superzapper & framing:** HUD, extra lives, attract/title, high scores. ✅
- **Wave 5 — Audio & polish:** WebAudio SFX, particles, glow tuning. ✅
- **Wave 6 — In progress.**

## Git Workflow

- **Default branch:** `develop` (gitflow). PRs target `develop`.
- **`main` = production:** release merges only (`just release tempest` from the
  arcade orchestrator); every push to `main` auto-deploys to R2 — never push it
  by hand.
- **Branches:** `feat/{description}`, `fix/{description}`, `chore/{description}`.
- Just commit; no need to ask first (`develop` is the working branch).

## Important Notes

- No physics engine, no 3D engine, no networking/backend. High scores are local
  (`localStorage`). Mousewheel (spinner) + keyboard only — no touch initially.
- Positions are **tube space** `{ laneIndex, depth }` (`depth ∈ [0=far, 1=near]`),
  not screen space. Projection is a render concern; collision is lane+depth overlap.
