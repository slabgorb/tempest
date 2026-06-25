# CLAUDE.md — Tempest

This file provides guidance to Claude Code when working on this project.

## Project Overview

A faithful, browser-based clone of Atari's 1981 vector arcade game *Tempest*.
The player controls the "Claw" on the near rim of a geometric tube, rotating
around it to shoot enemies climbing up the lanes. Glowing vector lines on black,
rendered with HTML5 Canvas 2D. The game is a **deterministic pure simulation
core** wrapped by a thin input/render/audio shell.

North-star design doc: `docs/superpowers/specs/2026-06-24-tempest-clone-design.md`.

**Type:** Single-repo browser game (client-only, no backend)
**Language:** TypeScript (ES modules, strict)
**Build tool:** Vite
**Testing:** Vitest (TDD on the pure core)
**Status:** Greenfield — design doc approved; scaffolding starts at Wave 0.

## Repository Structure

The target layout (from the design doc — created as waves land):

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
├── docs/                # design docs and specs
├── .claude/             # Claude Code configuration (symlinks into .pennyfarthing/)
└── .pennyfarthing/      # Pennyfarthing framework
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

## Build Commands

(Defined once Wave 0 scaffolds `package.json`. Expected:)

```bash
npm install          # Install dependencies
npm run dev          # Vite dev server
npm run build        # Production build
npm test             # Run Vitest
npm test -- <name>   # Run a specific test file/pattern
npm run lint         # Lint (if configured)
```

## Testing

TDD on the pure core with Vitest — write the failing test first, then make it
pass. Cover: projection/geometry math (lane interpolation, wrap vs clamp), each
enemy state machine driven by a fixed RNG seed, collision (bullet↔enemy,
enemy↔player, spike↔player-on-warp), and scoring/spawn/level-transition logic.
The shell (render/input/audio/loop) is verified by running the game and, later,
Playwright smoke tests.

## Build Waves

Each wave gets its own implementation plan → TDD cycle:

- **Wave 0 — Skeleton:** Vite+TS, canvas bootstrap, fixed-timestep loop, render
  one closed tube with glow, mousewheel moves the Claw.
- **Wave 1 — Playable slice:** bullets, Flippers (climb/flip), collisions, death
  + lives, score, level-clear.
- **Wave 2 — Full roster:** Tankers, Spikers + spikes, Fuseballs, Pulsars.
- **Wave 3 — Levels & warp:** 16 geometries, color cycling, warp + difficulty ramp.
- **Wave 4 — Superzapper & framing:** HUD, extra lives, attract/title, high scores.
- **Wave 5 — Audio & polish:** WebAudio SFX, particles, glow tuning.

## Git Workflow

- **Feature branches:** `feat/{description}` / **Bug fixes:** `fix/{description}`
- Branch from `main`; PRs target `main` (trunk-based, no `develop`).
- Don't commit/push unless asked.

## Developer Guidance (Pennyfarthing)

### Getting Started

- `/pf-help` — context-aware help on any command or agent
- `/pf-sprint status` — current sprint progress
- `/pf-sprint work` — pick up your next story

### Daily Workflow

1. `/sm` — Start or resume a story (Scrum Master handles setup)
2. Agent handoffs guide the workflow (SM → TEA → Dev → Reviewer → SM)
3. `/reviewer` — Code review when implementation is complete
4. `/sm` — Finish the story (archive, merge)

### Key Commands

| Command | Purpose |
|---------|---------|
| `/pf-help` | Context-aware help |
| `/pf-sprint backlog` | See available work |
| `/pf-sprint work STORY` | Start a specific story |
| `/pf-theme show` | See current persona theme |
| `/pf-workflow` | Check active workflow status |

## Important Notes

- **Persona theme:** `the-matrix` (SM=Morpheus, TEA=The Architect, Dev=Agent
  Smith, Architect=Neo). Change with `pf theme set <name>`.
- No physics engine, no 3D engine, no networking/backend. High scores are local
  (`localStorage`). Mousewheel (spinner) + keyboard only — no touch initially.
- Positions are **tube space** `{ laneIndex, depth }` (`depth ∈ [0=far, 1=near]`),
  not screen space. Projection is a render concern; collision is lane+depth overlap.
