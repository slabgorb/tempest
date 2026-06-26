---
story_id: "4-2"
jira_key: ""
epic: "4"
workflow: "tdd"
---
# Story 4-2: Framing modes: attract screen and start-level select

## Story Details
- **ID:** 4-2
- **Jira Key:** (not configured)
- **Workflow:** tdd (RED → GREEN → REFACTOR)
- **Stack Parent:** none
- **Repository:** tempest
- **Branch:** feat/4-2-framing-modes-attract-select

## Workflow Tracking
**Workflow:** tdd
**Phase:** red
**Phase Started:** 2026-06-26T08:42:22Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| red | 2026-06-26T08:42:22Z | - | - |

## Technical Approach

### Scope Boundary (CRITICAL)
This story implements the **pure core mode state machine** only. Rendering (drawing attract/select/HUD UI) is story 4-7 (trivial). The mode transitions happen here; the visuals happen there.

### Current State
- `src/core/state.ts` defines `Mode = 'playing' | 'dying' | 'gameover' | 'warp'`
- `src/core/sim.ts` orchestrates mode transitions via `stepGame(state, input, dt)`
- Story 4-5 added the `onModeChange` hook in `src/shell/loop.ts` to fire on transitions

### Implementation Plan

#### 1. Extend Mode Union (src/core/state.ts)
Add two new modes to represent framing states:
```typescript
type Mode = 'attract' | 'select' | 'playing' | 'dying' | 'gameover' | 'warp'
```

- **`'attract'`**: Title/attract screen (entry point; no gameplay)
- **`'select'`**: Start-level select (player chooses starting level before play)

#### 2. Add SelectState to GameState (src/core/state.ts)
Add a state field to track the selected level during 'select' mode:
```typescript
interface SelectState {
  selectedLevel: number  // the level the player has chosen to start at
}

interface GameState {
  // ... existing fields ...
  select: SelectState    // defined only when mode === 'select'
}
```

Initialize it in `initialState()` with a safe default (e.g., level 1).

#### 3. Extend stepGame() Mode Cases (src/core/sim.ts)
Add two new mode handlers in the `stepGame()` switch statement:

##### Case 'attract':
- Input: listen for `input.start` to transition to 'select'
- dt: no time-based logic (attract is idle)
- Transition: `input.start` → `mode = 'select'`, initialize `select.selectedLevel = 1`

##### Case 'select':
- Input: 
  - `input.spin`: adjust `select.selectedLevel` within valid range `[1, maxLevel]`
  - `input.start`: commit the selected level and transition to 'playing'
- dt: no time-based logic
- Clamping: ensure `selectedLevel` stays within `[1, maxAllowedLevel]` (use `tubeForLevel()` to detect invalid levels)
- Transition: `input.start` → call `startGameAtLevel(selectedLevel)` (new helper)

#### 4. New Helper: startGameAtLevel() (src/core/sim.ts)
Generalize the existing `startGame()` function. Currently it hardcodes `level = 1`:
```typescript
function startGameAtLevel(s: GameState, selectedLevel: number): void {
  s.mode = 'playing'
  s.level = selectedLevel
  s.score = 0
  s.lives = START_LIVES
  s.player = { lane: 0, alive: true, respawnTimer: 0, superzapper: 'full' }
  s.enemies = []
  s.tube = tubeForLevel(selectedLevel)
  s.spikes = new Array(s.tube.laneCount).fill(0)
  s.warp.progress = 0
  startLevel(s)
}
```

Refactor `startGame()` to call `startGameAtLevel(s, 1)`.

#### 5. Gameover → Attract Transition (src/core/sim.ts)
Modify the 'gameover' case:
- On `input.start`: transition to `'attract'` instead of directly to `'playing'`
- This allows the player to return to the attract/select flow

#### 6. Initial State (src/core/state.ts)
Change `initialState()` to start in `'attract'` mode instead of `'playing'`:
```typescript
function initialState(seed: number): GameState {
  return {
    mode: 'attract',  // Changed from 'playing'
    select: { selectedLevel: 1 },  // Initialize select state
    // ... rest of fields ...
  }
}
```

### Pure Core Guarantee
- **No DOM, canvas, or window access**
- **No Date.now(), Math.random(), or requestAnimationFrame**
- **Time enters as dt parameter**
- **All randomness via seeded RNG in GameState**
- **Deterministic:** identical input + seed → identical mode transitions

The shell's `onModeChange` hook will fire as transitions occur, allowing story 4-7 to render the attract/select screens based on mode changes.

## Acceptance Criteria

### New Mode Values
- [ ] Mode union now includes `'attract'` and `'select'` in addition to existing `'playing'`, `'dying'`, `'gameover'`, `'warp'`
- [ ] `GameState.select` field holds `{ selectedLevel: number }`
- [ ] `initialState()` starts in `'attract'` mode

### Mode Transitions
- [ ] `'attract'` + `input.start` → `'select'` (initialize selectedLevel = 1)
- [ ] `'select'` + `input.start` → `'playing'` (at the selected level)
- [ ] `'select'` + `input.spin` → adjust selectedLevel within `[1, maxAllowedLevel]` (no actual mode change)
- [ ] `'gameover'` + `input.start` → `'attract'` (not directly to 'playing')
- [ ] All other mode transitions ('playing' → 'warp', 'warp' → 'playing', death/respawn, etc.) remain unchanged

### Start-Level Select Logic
- [ ] `selectedLevel` is clamped to `[1, maxAllowedLevel]` where maxAllowedLevel is determined by checking valid tube geometries
- [ ] Player can rotate through valid levels using `input.spin` with wrap-around or clamp behavior (TBD in RED phase)
- [ ] `'select'` mode accepts no other input besides `spin` and `start`

### Determinism & Tests
- [ ] Mode transitions are deterministic: same `(state, input, dt)` → same mode and selectedLevel
- [ ] RNG state is preserved during mode transitions (only 'playing' mode uses RNG for enemy spawning)
- [ ] All existing tests for 'playing', 'dying', 'gameover', 'warp' modes still pass (no regressions)
- [ ] New tests added for:
  - `'attract'` → `'select'` transition on start input
  - `'select'` level increment/decrement with spin
  - `'select'` → `'playing'` transition at chosen level
  - Level clamping (e.g., spin past maximum available level)
  - `'gameover'` → `'attract'` on start (not directly to 'playing')
  - Initial state is `'attract'` (not 'playing')

### No Rendering, No Shell Coupling
- [ ] Core code has zero DOM/canvas/window references (confirm with grep)
- [ ] No `Date.now()`, `Math.random()`, or timer calls in core mode logic
- [ ] All time-based state machine logic uses `dt` parameter
- [ ] `onModeChange` hook in shell/loop.ts fires correctly as modes transition (story 4-5 already provides this)
- [ ] Story 4-7 rendering is independent: it reads `state.mode` and draws accordingly (not required for this story)

### Backwards Compatibility
- [ ] Existing `'playing'` mode behavior unchanged
- [ ] Death flow ('playing' → 'dying' → 'playing' or 'gameover') unchanged
- [ ] Warp flow ('playing' → 'warp' → 'playing') unchanged
- [ ] `startGame()` function still works (now delegates to `startGameAtLevel(..., 1)`)

## Delivery Findings

### TEA (test design)
- **Question** (non-blocking): The plan says `maxAllowedLevel` is found by "checking valid tube geometries" via `tubeForLevel()`, but `tubeForLevel()` never returns invalid — it cycles with period 16 (`GEOMETRIES.length`). There is no exported max-level constant. Tests pin the cap at 16. Affects `src/core/sim.ts` / `src/core/rules.ts` (GREEN should add a `MAX_SELECT_LEVEL = 16` constant rather than probe `tubeForLevel`). *Found by TEA during test design.*
- **Improvement** (non-blocking): `startGame()` and the new `startGameAtLevel()` share most of their body; per the plan, refactor `startGame()` to delegate to `startGameAtLevel(s, 1)` so the reset logic lives in one place. Affects `src/core/sim.ts`. *Found by TEA during test design.*

## TEA Assessment

**Tests Required:** Yes
**Reason:** New pure-core mode state machine (attract + start-level select) with non-trivial transition + clamping logic.

**Test Files:**
- `tests/core/sim.framing.test.ts` (new) — the attract/select state machine: initialState→attract, attract→select, select spin (±1, clamp [1,16], no wrap), select→playing at chosen level, gameover→attract, determinism + RNG-untouched, full flow.
- `tests/core/helpers.ts` (new) — shared `playingState(seed)` helper for the initialState→attract migration.
- `tests/core/state.test.ts` — initialState mode assertion flipped to `'attract'` (RED).
- `tests/core/sim.death.test.ts` — gameover-restart now asserts → `'attract'` (RED).
- `tests/core/geometry.cycle.test.ts` — restart geometry-reset retargeted to the attract→select→playing flow (RED).
- 17 gameplay test files + `tests/shell/loop.test.ts` migrated to `playingState()` (behavior-preserving; stay green).

**Tests Written:** 12 new framing tests (8 RED + 4 guards) + 3 converted assertions = 11 failing, covering all framing ACs.
**Status:** RED (failing for the right reasons — feature not implemented; full suite otherwise green: 170 passing).

**Handoff:** To Dev for implementation (GREEN).

## Design Deviations

### Dev (implementation)
- **startGame() wrapper removed (not kept as a delegate):** Plan/AC said refactor `startGame()` to delegate to `startGameAtLevel(s, 1)`. Implemented `startGameAtLevel(s, level)` and removed the `startGame()` wrapper entirely. Reason: the only caller was the `gameover` case, which now sets `mode='attract'` instead of restarting; with `noUnusedLocals: true` an unused private `startGame` fails `tsc --noEmit`. The level-1 reset path is preserved via `startGameAtLevel(s, 1)` (exercised by the geometry.cycle restart test). No test references `startGame`.

### TEA (test design)
- **initialState migration:** Plan changes `initialState()` from `'playing'`→`'attract'`. Existing gameplay tests depended on `initialState()` being mid-game. Tests now build a playing state via a new `tests/core/helpers.ts` `playingState(seed)` (= `initialState(seed)` with `mode` forced to `'playing'`). Reason: forcing `'playing'` is a no-op pre-GREEN and correct post-GREEN, so the gameplay suite stays green across the change while only the new framing behaviors fail. 18 gameplay files + loop test migrated.
- **Level-select boundary = CLAMP, no wrap:** Plan left wrap-vs-clamp "TBD in RED". Tests assert CLAMP to `[1, 16]` (negative spin pins at 1; 100 up-spins pin at 16; one more stays at 16, never wrapping to 1). Reason: the AC repeatedly says "clamped to [1, maxAllowedLevel]", clamp is more predictable for a rate-yourself selector, and avoids confusing max→1 jumps.
- **Max selectable level = 16:** Defined as the count of distinct geometries (`tubeForLevel` period). Tests hardcode 16; GREEN should add an explicit constant. Reason: no exported max exists and `tubeForLevel` never returns "invalid".
- **Spin granularity = ±1 level per spin step (sign-based):** Tests assert one positive unit spin increments by exactly 1 and one negative decrements by 1 (clamped). Reason: a discrete, deterministic, arcade-faithful "one click = one level"; keeps the contract testable without coupling to `SPIN_SENSITIVITY` accumulation. GREEN must step by `sign(input.spin)` (0 = no change).
- **gameover→attract resets nothing:** Tests assert gameover+start only flips mode to `'attract'` (does NOT reset score/lives/geometry). The fresh-game reset moves to the `select`→`playing` commit (`startGameAtLevel`), where the geometry/score/lives/spikes/superzapper reset is asserted. Reason: attract is the title screen; a new game is provisioned only when the player commits a level.

### Reviewer (audit)
- **Dev — startGame() wrapper removed:** → ✓ ACCEPTED: `noUnusedLocals` forces it; `git grep` shows zero references; the level-1 reset path is preserved as `startGameAtLevel(s, 1)` and covered by the geometry.cycle restart test. Cleaner contract supersedes the AC's "delegates" wording.
- **TEA — initialState→attract migration via `playingState`:** → ✓ ACCEPTED: verified mechanical/behavior-preserving across all 17 gameplay files (loop.test.ts also drops the now-unused import); suite stayed green across the change.
- **TEA — clamp [1,16], no wrap:** → ✓ ACCEPTED: matches AC wording; min/max/no-wrap all tested.
- **TEA — max selectable = 16:** → ✓ ACCEPTED: equals `GEOMETRIES.length` (verified exactly 16 entries in `geometry.ts`).
- **TEA — ±1 sign-based spin granularity:** → ✓ ACCEPTED: deterministic, decoupled from `SPIN_SENSITIVITY`, arcade-faithful; tested.
- **TEA — gameover→attract resets nothing:** → ✓ ACCEPTED: attract is the title screen; reset correctly deferred to the select→playing commit; tested.

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `src/core/state.ts` - Extended `Mode` with `'attract' | 'select'`; added `SelectState` + `GameState.select`; `initialState()` boots in `'attract'` with `select.selectedLevel = 1`.
- `src/core/rules.ts` - Added `MAX_SELECT_LEVEL = 16` constant (highest selectable start level).
- `src/core/sim.ts` - `cloneState` clones `select`; parameterized `startGame()` → `startGameAtLevel(s, level)` (wrapper removed); added `attract`/`select` stepGame cases; `gameover + start` → `'attract'`.

**Tests:** 181/181 passing (GREEN). `npx tsc --noEmit` clean. Purity grep: no new violations.
**Branch:** feat/4-2-framing-modes-attract-select (pushed)

**MAX_SELECT_LEVEL home:** `src/core/rules.ts` — it is a tunable game-rule cap (sits with `START_LIVES`, scoring, etc.) and `sim.ts` imports it. Value 16 = number of distinct tube geometries (`tubeForLevel` period).

**Handoff:** To review (Reviewer).

## Reviewer Assessment

**Verdict:** APPROVED

**Verification run by Reviewer:** `npx vitest run` → 27 files, 181 passed (181); `npx tsc --noEmit` → clean; purity grep over `src/core/` → only two pre-existing comment hits, zero actual DOM/window/localStorage/Date/Math.random/performance.now/rAF/shell-import introduced by the diff.

**Data flow traced:** `input.start` (shell Enter/mouse → `startQueued`) → `loop.sample()` → `stepGame` attract case → `select` (selectedLevel=1) → spin clamps [1,16] → start → `startGameAtLevel(s, selectedLevel)` resets player/score/lives/tube/spikes/warp/superzapper → `playing`. Reset is provisioned only at the commit, so no state leaks into the next game. `start` IS wired in the shell, so attract→select→playing is reachable — no soft-lock.

**[VERIFIED] highlights:** core purity intact; determinism preserved (`cloneState` clones `select`; immutable `Rng` untouched by framing steps so `out.rng` is reference-identical); `initialState→attract` blast radius safe (sole prod caller `main.ts:32`; `start` wired); `startGame()` removal safe (zero refs; reset preserved + tested); clamp logic correct (`Math.max(1, Math.min(16, level + Math.sign(spin)))`); all 6 modes handled, no fall-through; test migration sound.

**Findings (all non-blocking):**
- `[LOW]` L1 — dead setup line `s.spikes[2] = 0.5` in `tests/core/sim.death.test.ts` gameover→attract test (assertion already removed). Optional TEA cleanup.
- `[LOW]` L2 — theoretical: a `NaN` `input.spin` would pass the `!== 0` guard and poison `selectedLevel` via `Math.sign(NaN)`. Shell never emits NaN; theoretical only.

**Deviation audit:** all 6 logged deviations (Dev startGame removal; TEA migration, clamp, max=16, ±1 spin, gameover-no-reset) → ACCEPTED. See `### Reviewer (audit)`.

**Handoff:** To SM for finish-story. No fixes required from Dev or TEA.

## Delivery Findings

### Reviewer (code review)
- **Gap** (non-blocking, FOR STORY 4-7): `src/shell/render.ts` has no `attract`/`select` branch — it only special-cases `dying`/`gameover`/`warp`. On boot (now `attract`) and after `gameover→attract`, render draws the normal playing scene, so the stale score / frozen previous-game enemies remain visible until the player commits a level in `select` (`startGameAtLevel` resets them). It does NOT crash (every `GameState` field is populated by `initialState`); pure-core state is correct. This is a rendering gap that belongs squarely to **story 4-7** (framing screens + HUD): 4-7 must add attract/select draw branches and suppress the stale playing frame. Affects `src/shell/render.ts`. *Found by Reviewer during code review.*
- **Improvement** (non-blocking): optional `NaN`-guard on `input.spin` in the `select` case, and an opportunistic cleanup of the dead `s.spikes[2]=0.5` line in `sim.death.test.ts`. *Found by Reviewer during code review.*
