# Story 5-1 Context

## Title
Pure-core game event channel

## Metadata
- **Story ID:** 5-1
- **Type:** feature
- **Points:** 3
- **Priority:** p1
- **Workflow:** tdd
- **Repo:** tempest
- **Epic:** Wave 5 — Audio & polish

## Problem

The Wave 5 audio (5-2) and downstream wiring (5-5) need to react to gameplay events (enemy death, player grab, fire, warp-spike crash, level-clear, superzapper activation). Currently, there is no structured event channel in the core — audio and visual effects would have to infer events from state changes, which is brittle and error-prone.

The challenge is **maintaining the pure-core boundary**: events must be data (carried in/returned from `GameState`), never callbacks into the shell. All events must be deterministic (driven only by seeded RNG and dt), and the core must emit them as first-class data alongside the updated state.

## Technical Approach

**Event design (deterministic, callback-free):**

1. Define a discriminated-union type `GameEvent` that covers all gameplay events:
   - `EnemyDeathEvent { type: 'enemy-death', enemyType: string, lane: number, depth: number }`
   - `PlayerGrabEvent { type: 'player-grab', lane: number, killedBy: string }`
   - `FireEvent { type: 'fire', lane: number, depth: number }`
   - `WarpSpikeCrashEvent { type: 'warp-spike-crash', lane: number }`
   - `LevelClearEvent { type: 'level-clear', newLevel: number }`
   - `SuperzapperActivateEvent { type: 'superzapper-activate', killCount: number }`
   - `PlayerSpawnEvent { type: 'player-spawn', lane: number }`
   - `PlayerDeathEvent { type: 'player-death', cause: 'grab' | 'pulse' | 'spike' }`

2. **Add events array to GameState:** `GameState { ..., events: GameEvent[] }`

3. **Emit events in stepGame:**
   - Clear `state.events` at the start of each frame (new array per step).
   - As stepSim processes bullets, enemies, collisions, etc., append matching events to `state.events`.
   - Examples:
     - When a bullet hits an enemy: push `EnemyDeathEvent` + `FireEvent` (if the bullet fired) or just the death.
     - When an enemy reaches the player: push `PlayerGrabEvent`.
     - When the player fires: push `FireEvent`.
     - When warp-mode player hits a spike: push `WarpSpikeCrashEvent` + `PlayerDeathEvent`.
     - When all enemies are cleared: push `LevelClearEvent`.

4. **Shell consumption:** The loop (`src/shell/loop.ts`) or render pass reads `state.events` and dispatches to audio (WebAudio SFX engine in 5-2) and particles (already wired in 5-3/5-4).

**Pure-core preservation:**
- No imports of `shell/` modules.
- No callbacks, `Date.now()`, `Math.random()`, or DOM access.
- All time and randomness come from `dt` and the seeded RNG in `state.rng`.
- `stepGame(state, input, dt) → state` remains a pure function; the events array is just additional output data.

**Scope (core only):**
- Add event type definitions to `src/core/events.ts` (new file).
- Update `src/core/state.ts` to include `events: GameEvent[]`.
- Modify `src/core/sim.ts` (and per-type enemy steppers, collision, etc.) to emit events.
- NO changes to `src/shell/` in this story — wiring happens in 5-5.

**Integration points (for TEA/Dev context):**
- 5-2 (WebAudio SFX engine) will subscribe to events and play SFX.
- 5-5 (Wire audio/particles into loop) will dispatch events to audio and particles.
- 5-6 (Warp spike distinct SFX) can now check `WarpSpikeCrashEvent.cause === 'spike'`.

## Scope
- In scope: Define event types; add events array to GameState; emit events in stepGame and sub-steppers.
- Out of scope: Shell wiring (5-5), audio engine (5-2), rendering particles (already done 5-3/5-4).

## Acceptance Criteria

1. **AC1 — Event type hierarchy:** A discriminated-union type `GameEvent` is defined in `src/core/events.ts` covering: enemy death, player grab, fire, warp-spike crash, level-clear, superzapper, player spawn, player death. Type guards exist for narrowing (e.g., `isPlayerGrabEvent(e)` or TypeScript `as const` discrimination).

2. **AC2 — GameState carries events:** `src/core/state.ts` exports a `GameState` type with `events: GameEvent[]` field; initial state has `events: []`.

3. **AC3 — stepGame emits events:** `src/core/sim.ts` `stepGame` clears `state.events` at frame start and populates it as gameplay unfolds. Acceptance: a test-driven spec test (step 5-1 RED tests) confirms that a fixed RNG seed + input sequence yields both identical state changes AND identical event sequences.

4. **AC4 — Collision events:** When bullets hit enemies or the player is grabbed/hit by a spike, the corresponding event(s) are emitted. Covered by existing collision test suites (from prior waves) extended to assert events.

5. **AC5 — Level-clear and superzapper:** When a level ends (all enemies cleared), a `LevelClearEvent` is emitted. When superzapper is activated or spent, a `SuperzapperActivateEvent` is emitted (if activated) or none (if spent). Covered by tests.

6. **AC6 — Determinism preserved:** `stepGame(s1, input, dt) === stepGame(s1, input, dt)` still holds (same GameState equality including events); fixed seed + input stream yields identical event streams on replays. `npx tsc --noEmit` is clean; no imports of `shell/`, `Date`, `Math.random`, or DOM APIs in `core/events.ts` or `core/sim.ts`.

7. **AC7 — No debug code:** No console.log, debugger statements, or temporary test-only fields in events or GameState.

8. **AC8 — Core tests green:** All existing core tests pass; new event-assertion tests cover the acceptance criteria above.

---

_Generated by `pf context create story 5-1` from the sprint YAML and design doc._
