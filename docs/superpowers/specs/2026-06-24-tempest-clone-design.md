# Tempest Clone — Design

- **Date:** 2026-06-24
- **Status:** Approved (brainstorm complete)
- **Author:** slabgorb + Claude

## Overview

A faithful, browser-based clone of Atari's 1981 vector arcade game *Tempest*. The
player controls the "Claw" (blaster) riding the near rim of a geometric tube,
rotating around it to shoot enemies that climb up the tube's lanes from the far
end. The aesthetic is glowing vector lines on black, rendered with HTML5 Canvas
2D. The game is built as a deterministic pure simulation core wrapped by a thin
input/render/audio shell.

The goal is faithfulness to the original arcade game's mechanics and feel, with
the freedom to tune the difficulty ramp later. No third-party physics or
rendering engine is used — Tempest is a deterministic, grid-like game whose
"collision" is simply *same lane + overlapping depth*, so a physics engine would
add weight without value.

## Goals

- Faithful recreation of Tempest mechanics: lane-based movement, the classic
  enemy roster, spikes, Superzapper, 16 cycling tube geometries, the level-end
  warp, and the full arcade framing (score, lives, attract mode).
- Deterministic, unit-testable game logic (same inputs → same outcome).
- Authentic vector-CRT visual feel via Canvas 2D glow.
- Smooth play independent of frame rate.

## Non-goals (YAGNI)

- No physics engine (rapier.js or otherwise) — not needed for a deterministic
  grid game.
- No 3D engine — Tempest is a fixed 2D projection that fakes depth.
- No networking, multiplayer, accounts, or backend. High scores are local
  (`localStorage`).
- No mobile/touch controls in the initial target (mousewheel + keyboard only;
  touch can be a later addition).

## Key decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Rendering | HTML5 Canvas 2D | Matches the original's fixed 2D projection; `shadowBlur` gives a convincing vector-CRT glow; zero rendering dependencies; transparent and hackable. |
| Language/tooling | TypeScript + Vite | Typed game state catches bugs in a stateful game; fast dev server + simple production build. |
| Physics | None | Collision is lane + depth comparison; a physics engine buys nothing. |
| Architecture | Pure simulation core + IO shell | Deterministic, unit-testable, keeps rendering and rules from tangling. |
| Primary control | Mousewheel (spinner/dial) | Emulates the original's rotary spinner. Keyboard arrows as a fallback. |
| Testing | Vitest (TDD on the core) | The pure core is fully testable; the shell is verified by running it (and later Playwright). |

## Architecture

```
src/
  core/            ← PURE, unit-tested, no DOM/canvas
    geometry.ts    tube definitions (lanes, near/far points), projection math
    state.ts       GameState type; player, enemies[], bullets[], spikes[], level, score, mode, rng
    sim.ts         stepGame(state, input, dt) → state  (orchestrates sub-steppers)
    enemies/       per-type state machines: flipper, tanker, spiker, fuseball, pulsar
    rules.ts       scoring, per-level difficulty params, spawn tables
    rng.ts         seeded PRNG (deterministic)
  shell/           ← IO, exercised manually / via Playwright later
    render.ts      Canvas2D: GameState → glowing vector lines (pure fn of state)
    input.ts       mousewheel → spinner delta; keyboard (fire/zap/start) → Input
    audio.ts       WebAudio SFX (later wave)
    loop.ts        fixed-timestep rAF loop (accumulator), calls sim then render
  main.ts          bootstrap: canvas + wire shell ↔ core
```

**The hard boundary:** `core/` never imports from `shell/` and never touches the
DOM, `window`, `Date.now()`, `Math.random()`, or `requestAnimationFrame`. All
time arrives as `dt`; all randomness comes from the seeded RNG in `GameState`.
This is what makes the simulation a pure, testable function.

## Core data model

Positions are expressed in **tube space**, not screen space:

- A **tube** has `N` lanes arranged around a center. Each lane has a *far point*
  and a *near point* in tube-space. Tubes are **closed** (wrap-around loops:
  circle, square…) or **open** (clamped ends: flat line, V, cross…).
- Every moving object is `{ laneIndex: number, depth: number }` where
  `depth ∈ [0 = far end, 1 = near rim]`.
- `GameState` (sketch):
  ```
  GameState {
    mode: 'attract' | 'playing' | 'warp' | 'dying' | 'gameover' | 'highscore'
    level: number
    tube: Tube                 // current geometry
    player: { lane, alive, respawnTimer, superzapper: 'full' | 'used-once' | 'spent' }
    bullets: Bullet[]          // { lane, depth, velocity }
    enemies: Enemy[]           // tagged union by type, each with its own fields
    spikes: number[]           // per-lane spike height (0 = none)
    score, highScore, lives: number
    spawn: SpawnState          // remaining budget, timers
    rng: RngState              // seeded PRNG
    timers: { ... }            // warp progress, pulse phase, etc.
  }
  ```

## Projection & geometry

The renderer projects `(laneIndex, depth)` to a screen point by interpolating
between the lane's far and near points and scaling toward a vanishing point.
Drawing the tube = drawing each lane's far→near edges plus the near-rim and
far-rim polylines, all with additive glow (`shadowBlur` / layered strokes).
Objects are drawn at their projected position, scaled by depth so they grow as
they approach the rim. Collision detection happens entirely in tube space
(lane + depth overlap) and is independent of projection.

## Game loop & determinism

Fixed-timestep accumulator: the sim advances in fixed `dt` steps (1/60 s); the
renderer draws the latest state each animation frame. Because `stepGame` is a
pure function of `(state, input, dt)` with the RNG carried in state, behavior is
identical regardless of frame rate, and tests are fully reproducible. (Recorded
attract-mode demos fall out of this for free: replay a fixed seed + input stream.)

## Mechanics (faithful)

**Claw (player):** rides the near rim; mousewheel rotates it (wraps on closed
tubes, clamps at the ends on open tubes). Fires bullets down its current lane,
with a cap on bullets on screen at once. Keyboard fallback: arrows to move,
a key to fire, a key for Superzapper.

**Enemies** spawn at the far end and climb far → near:

- **Flipper** — climbs a lane and "flips" across lane boundaries (end-over-end)
  toward adjacent lanes, more aggressively near the rim. Reaching the player's
  rim segment kills the player. Killed by a bullet in its lane at its depth.
- **Tanker** — a carrier; when shot or upon reaching the rim it splits into two
  enemies (two Flippers / two Fuseballs / two Pulsars depending on tanker type).
- **Spiker** — travels along a lane spinning and lays down a persistent **spike**
  (a growing line) in that lane. Killed by bullets.
- **Fuseball** — a crackling ball that moves erratically along the far rim and up
  lane boundaries; only vulnerable in certain positions; lethal on contact at the
  rim.
- **Pulsar** — climbs a lane and periodically "pulses," electrifying its entire
  lane; if the player is on that lane during a pulse, the player dies. Flips like
  a Flipper.

**Spikes** persist in lanes between/within levels. Harmless during normal play,
but during the end-of-level **warp** (camera zooms down the tube) hitting a spike
on your lane kills you. Bullets shorten/clear spikes.

**Superzapper** — once per level: first activation destroys all enemies on
screen; a second activation destroys one enemy; then it is spent until the next
level.

**Player death** occurs when: an enemy reaches the player's rim segment
(Flipper/Fuseball grab), a Pulsar pulses the player's lane, or the player hits a
spike during the warp. Death costs a life → respawn after a brief pause, or game
over when lives are exhausted.

## Level flow & arcade framing

A per-level spawn budget drains over time. When all enemies are cleared, the
level ends with the **warp**: the camera flies down the tube (player still steers
to dodge spikes), then the next geometry/color appears with harder parameters.
16 distinct geometries (open and closed) cycle, then repeat with increased
difficulty (faster enemies, more flipping, earlier Pulsars, etc.).

Framing: a title/attract screen, start-level select (choose a starting level),
score + high score (persisted to `localStorage`), lives shown as Claw icons,
extra-life thresholds, and game-over → high-score entry → back to attract.

## Scoring

Approximate-faithful per-enemy values (Flipper, Tanker + contents, Spiker + per
spike cleared, Fuseball with escalating value, Pulsar) plus extra-life
thresholds. Exact values are pinned during implementation against reference
material; the difficulty ramp is faithful initially and tunable later.

## Testing strategy

TDD on the pure core with Vitest:

- Projection/geometry math (lane interpolation, wrap vs clamp).
- Each enemy state machine (climb, flip, split, lay-spike, pulse, fuseball
  movement) driven by a fixed RNG seed.
- Collision (bullet↔enemy, enemy↔player, spike↔player-on-warp).
- Scoring, spawn budget, and level-transition logic.

The shell (render/input/audio/loop) is verified by running the game and, in a
later wave, Playwright smoke tests.

## Build waves

This document is the north star for the whole game. Each wave gets its own
implementation plan → TDD implementation cycle. The first plan covers Wave 0 +
Wave 1 (the first playable slice).

- **Wave 0 — Skeleton:** Vite + TS project, canvas bootstrap, fixed-timestep
  loop, render one closed tube with glow, mousewheel moves the Claw around the
  rim. *(Proves projection + input + loop.)*
- **Wave 1 — Playable slice:** bullets fire down lanes; Flippers spawn, climb,
  and flip; bullet↔enemy and enemy↔player collisions; player death + lives;
  score; level-clear → same geometry, harder. *(First genuinely fun build.)*
- **Wave 2 — Full roster:** Tankers (+ split), Spikers + persistent spikes,
  Fuseballs, Pulsars, with faithful behaviors and scoring.
- **Wave 3 — Levels & warp:** all 16 tube geometries (open + closed), color
  cycling, the warp transition with spike collision, difficulty ramp.
- **Wave 4 — Superzapper & framing:** Superzapper (full + weak), HUD, extra-life
  thresholds, attract/title screen, game-over + high-score (localStorage),
  start-level select.
- **Wave 5 — Audio & polish:** WebAudio SFX, particle/screen-shake polish, glow
  tuning.

## To pin during implementation

- Exact scoring values and extra-life thresholds (against reference material).
- The 16 specific tube geometries and their lane counts / open-vs-closed status.
- Bullet-on-screen cap and bullet speed.
- Enemy speeds, flip cadence, pulse cadence, and spawn tables per level.
- Spinner sensitivity (mousewheel delta → rim rotation).
```
