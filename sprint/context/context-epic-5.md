# Epic 5 Context

## Title
Wave 5 — Audio & polish

## Metadata
- **Epic ID:** 5
- **Priority:** p1
- **Status:** in progress
- **Repo:** tempest
- **Description:** WebAudio SFX, particle/screen-shake polish, glow tuning

## Problem

The completed Waves 0–4 deliver a fully playable game with all enemy types, the warp mechanic, superzapper, HUD, framing screens, and high-score persistence. Wave 5 adds the arcade voice and final visual polish: synthesized WebAudio SFX (fire, enemy explosions, player death, level-clear/warp transitions, superzapper activation, extra life), visual effects (particle explosions, screen-shake), and glow-tuning to replicate the reference vector CRT aesthetic.

The challenge is **maintaining the pure-core determinism boundary** while building a rich, event-driven SFX and visual effects layer in the shell. The pure core emits typed `GameEvent` data describing each gameplay moment; the shell independently consumes that data to trigger sound and sparks, without feeding effects back into the simulation.

## Technical Approach

**Architecture: Event-driven shell effects**

1. **Pure-core event channel (Story 5-1 — COMPLETE):** The core `stepGame()` populates `GameState.events: GameEvent[]` with typed event data (discriminated union: `enemy-death`, `player-grab`, `fire`, `warp-spike-crash`, `level-clear`, `superzapper-activate`, `player-spawn`, `player-death`). Each event carries the information the shell needs: which lane, how deep, what kind, how many points/kills. Events are cleared at the start of each step; they describe only the current frame's gameplay.

2. **WebAudio SFX engine (Story 5-2):** A shell-only module (`src/shell/audio.ts`) synthesizes arcade-style sounds using oscillators and noise, responsive to each GameEvent type. The AudioContext is created lazily on the first user gesture (autoplay policy) and every method is a graceful no-op when unavailable. No remote asset files are loaded by the core SFX engine (R2 assets are available but not required for the MVP).

3. **Particle system & screen-shake (Story 5-3/5-4 — COMPLETE):** Shell-only render state (`src/shell/particles.ts`, `src/shell/fx.ts`) is seeded from drained `GameEvent`s and advanced by real frame time. Particles and screen-shake never feed back into `stepGame`, so they have zero effect on determinism.

4. **Integration (Story 5-5):** The loop (`src/shell/loop.ts`) collects GameEvents across all fixed sub-steps (since each sub-step overwrites `state.events`, missing the collection step would drop sounds), then dispatches the per-frame event list to audio + particles. `main.ts` constructs the audio engine and gates it on the first user gesture.

5. **Visual polish (Story 5-4):** Glow constants are tuned for the hero elements (Claw, bullets, explosions) and softer for the tube so the scene reads clearly. Screen-shake is applied as a jitter offset to the centered render transform.

6. **Downstream polish (Stories 5-6 to 5-9):** Follow-up stories address a distinct warp-spike visual cue (5-6), framing-screen polish (5-7), high-score persistence hardening (5-8), and loop robustness (5-9).

**Key invariants:**
- **Pure-core boundary (load-bearing):** `src/core/` never imports `src/shell/`, never calls `AudioContext`, `Date.now()`, `Math.random()`, or DOM APIs. Time and randomness enter as parameters; events are the only new output data.
- **Event determinism:** Given identical RNG seed + input sequence, the same events appear in the same order (determinism is unit-tested in 5-1).
- **No effect feedback:** Particles and screen-shake never influence gameplay; they are render polish only.
- **Per-frame event draining (critical for fixed timestep):** The loop must accumulate events across all sub-steps in a `frameEvents` list before dispatching, or intermediate sub-steps' events would be lost (two kills in one frame would drop a sound).

## Stories

| Story | Title | Points | Workflow | Status | Notes |
|-------|-------|--------|----------|--------|-------|
| 5-1 | Pure-core game event channel | 3 | TDD | Done | Events channel in core; 8 GameEvent types; determinism unit-tested |
| 5-2 | WebAudio SFX engine | 2 | trivial | [Current] | Synthesized sounds for all event types; gesture-gated AudioContext |
| 5-3 | Particle system and screen-shake | 2 | trivial | Done | Event-driven spark bursts; decaying screen-shake; no core coupling |
| 5-4 | Render particles, screen-shake, and glow tuning | 2 | trivial | Done | Draw particles in centered space; apply shake offset; tune shadowBlur |
| 5-5 | Wire audio and particles into loop and bootstrap | 2 | trivial | Backlog | Loop collects per-step events; main.ts gates audio on gesture; render takes particles |
| 5-6 | Distinct SFX and visual for warp spike crash | 1 | trivial | Backlog | Distinguish spike-crash death from normal grab (audio + render) |
| 5-7 | Framing-screen render polish: gameover scrim and high-score self-containment | 1 | trivial | Backlog | Dimming scrim behind framing text; drawHighScoreTable self-contained textAlign |
| 5-8 | Harden high-score persistence: per-entry validation and readonly save API | 1 | TDD | Backlog | loadHighScores rejects malformed entries; MAX_HIGH_SCORES moved; API readonly |
| 5-9 | Robustify loop callbacks and select-spin input edges | 1 | TDD | Backlog | Callback exception safety in loop; NaN-guard select-mode input; dead test line removed |

## Scope
- **In:** Pure-core event channel (5-1), WebAudio SFX engine (5-2), particle/shake systems (5-3/5-4), shell wiring (5-5), warp-spike polish (5-6), HUD/framing polish (5-7), storage hardening (5-8), robustness (5-9).
- **Out:** Music, looping ambience, asset-based SFX from R2, mute/volume UI, Playwright audio assertions.

## Acceptance Criteria

**Epic-level AC (all stories complete):**

1. **AC1 — Arcade voice:** When firing, killing an enemy, dying, clearing a level, warping, using the superzapper, or gaining an extra life, the player hears a distinct, synthesized arcade sound.

2. **AC2 — Event-driven effects:** All sounds and particles are seeded from the typed `GameEvent` channel. The core is unaware of audio or particles.

3. **AC3 — Purity preserved:** `stepGame(state, input, dt)` remains pure; identical seed + input yields identical state AND events. Core tests are unchanged and pass. `npm run build` is clean.

4. **AC4 — Graceful degradation:** The game runs and is playable even if WebAudio is unavailable or blocked (headless browser, audio sandbox, OS mute). No thrown errors, no console spam.

5. **AC5 — Fixed-timestep events:** The loop correctly drains events across sub-steps, so two simultaneous kills in one frame both produce sound and sparks.

6. **AC6 — Visual polish:** Glow is tuned for arcade CRT clarity; screen-shake intensity scales by event (player death is heavier than a single enemy kill); particle colors match enemy types.

---

_Generated by `pf context create epic 5` from the sprint YAML and Wave 5 plan._
