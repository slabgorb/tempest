# Tempest

A faithful, browser-based clone of Atari's 1981 vector arcade game *Tempest*.

**▶ Play it live: [tempest.slabgorb.com](https://tempest.slabgorb.com)**

![Tempest gameplay — the Claw rounding a square tube while cyan Flippers climb the lanes from the far rim](https://arcade-assets.slabgorb.com/tempest/screenshot.png)

You control the **Claw** (blaster) riding the near rim of a geometric tube,
spinning around it to shoot enemies that climb up the lanes from the far end.
Glowing vector lines on black, rendered with HTML5 Canvas 2D — no physics
engine, no 3D engine, no backend.

> **Status:** In active development. The playable slice and full enemy roster,
> 16 cycling tube geometries, the level-end warp, scoring, lives, attract mode,
> and local high scores are in place; audio and visual polish are landing now.

---

## Quick start

```bash
npm install
npm run dev
```

Then open **http://localhost:5273**.

For prerequisites, production builds, and troubleshooting, see
**[INSTALLATION.md](INSTALLATION.md)**.

---

## Controls

| Action | Control |
|--------|---------|
| Rotate the Claw | **Mousewheel** (the spinner/dial), or **← / →** arrow keys |
| Fire | **Hold left mouse button**, or **hold Space** (both auto-fire while held) |
| Start / restart | **Click**, or press **Enter** |

The mousewheel emulates the original arcade rotary spinner and is the primary
control. Arrow keys are a keyboard fallback.

---

## Gameplay

- **Lane-based movement.** The Claw snaps between the lanes of a closed tube.
  Positions are *tube space* — `{ laneIndex, depth }` where `depth` runs from
  `0` (far) to `1` (near) — not screen pixels.
- **The enemy roster.** Flippers, Tankers, Spikers (which lay spikes), Fuseballs,
  and Pulsars, each with its own behavior.
- **Spikes & the warp.** Clearing a level launches the Claw down the tube; spikes
  left in your lane are lethal during the warp.
- **16 geometries.** Tube shapes and colors cycle as you advance, with a rising
  difficulty ramp.
- **Arcade framing.** Score, extra lives, attract/title screen, and a local
  high-score table persisted in `localStorage`.

---

## Architecture

Tempest is split into a **pure simulation core** and a thin **IO shell**. This
boundary is the most important rule in the codebase.

```
src/
├── core/              # PURE, deterministic, unit-tested — no DOM/canvas
│   ├── geometry.ts    # tube definitions, projection math
│   ├── state.ts       # GameState type
│   ├── sim.ts         # stepGame(state, input, dt) → state
│   ├── input.ts       # Input type
│   ├── rng.ts         # seeded PRNG (deterministic)
│   ├── rules.ts       # scoring, difficulty, spawn tables
│   ├── highscore.ts   # high-score table logic
│   └── enemies/       # per-type state machines (flipper, tanker, …)
├── shell/             # IO: render.ts, input.ts, audio/fx.ts, loop.ts, storage.ts
└── main.ts            # bootstrap: canvas + wire shell ↔ core
```

**The core is pure and deterministic.** It never imports from `shell/`, never
touches the DOM/`window`/`canvas`, and never calls `Date.now()`,
`performance.now()`, `Math.random()`, or `requestAnimationFrame`. All time enters
the core as `dt`; all randomness comes from a seeded RNG carried in the game
state. `stepGame(state, input, dt)` produces identical output for identical
input — which is exactly what makes the game unit-testable and frame-rate
independent.

---

## Tech stack

- **Language:** TypeScript (ES modules, strict mode)
- **Build tool:** [Vite](https://vitejs.dev/)
- **Tests:** [Vitest](https://vitest.dev/) — TDD on the pure core
- **Rendering:** HTML5 Canvas 2D (`shadowBlur` for the vector-CRT glow)

---

## Development

| Command | What it does |
|---------|--------------|
| `npm run dev` | Start the Vite dev server on port 5273 |
| `npm run build` | Type-check (`tsc --noEmit`) and build to `dist/` |
| `npm run preview` | Serve the production build locally on port 5273 |
| `npm test` | Run the Vitest suite once |
| `npm run test:watch` | Run Vitest in watch mode |

### Testing

The pure core is developed test-first with Vitest. Tests live under `tests/core/`
(geometry, RNG, each enemy state machine, collisions, scoring, level transitions,
warp) and `tests/shell/` (loop, storage). The shell's render/input/audio is
verified by running the game.

```bash
npm test                 # full suite
npm test -- geometry     # a single file or pattern
```

---

## License

Private project. *Tempest* is a trademark of its respective owners; this is an
educational clone.

## Releasing

This repo ships from the [arcade orchestrator](https://github.com/slabgorb/arcade):
`just release tempest` gates on tests + build, merges `develop` → `main`, tags
`vX.Y.Z`, and pushes. Every push to `main` auto-deploys to Cloudflare R2 via
GitHub Actions (`.github/workflows/deploy.yml`) — **`main` is production; never
push it by hand.** A red CI run deploys nothing.
