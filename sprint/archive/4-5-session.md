---
story_id: "4-5"
jira_key: ""
epic: "4"
workflow: "tdd"
---
# Story 4-5: Loop onModeChange hook for mode transitions

## Story Details
- **ID:** 4-5
- **Jira Key:** none (Jira not configured)
- **Workflow:** tdd
- **Stack Parent:** none
- **Repos:** tempest
- **Branch:** feat/4-5-loop-onmodechange-hook

## Overview

Add an `onModeChange` hook to the shell game loop (`src/shell/loop.ts`) that fires a callback whenever the game's mode transitions (e.g., `playing` → `game-over` → `attract`). This wiring is a prerequisite for:

- **4-2:** Framing modes (attract screen and start-level select) — needs mode change callbacks to trigger UI state updates
- **4-6:** High-score persistence on mode change — needs to persist score when transitioning to game-over/high-score entry

## Technical Approach

### Current State

The loop (`createLoop()`) maintains game state and calls `stepGame()` to advance simulation, but does not detect or report mode transitions. The game state type (`GameState`) includes a `mode` field with values like `'attract' | 'playing' | 'warp' | 'dying' | 'gameover' | 'highscore'`.

### What to Implement

1. **Add `onModeChange` callback parameter** to `createLoop()`:
   ```typescript
   onModeChange?: (oldMode: string, newMode: string) => void
   ```

2. **Detect mode transitions** in the frame loop:
   - After each `stepGame()` call, compare `state.mode` against the previous mode
   - If mode changed, invoke the callback with `(oldMode, newMode)`

3. **Store previous mode** as local state in the loop closure

4. **Export hook setter** so callers can register a callback after loop creation (optional, but helpful for flexibility)

### Acceptance Criteria

- [x] `createLoop()` accepts an optional `onModeChange` callback parameter
- [x] Mode transitions are detected correctly (compare state.mode before/after each sim step)
- [x] Callback fires with correct `(oldMode, newMode)` parameters
- [x] Multiple calls to `stepGame()` in one frame don't double-fire (fires once per actual mode transition)
- [x] Hook is optional (loop works fine if no callback is provided)
- [x] Unit tests in Vitest cover: mode detection, callback firing, and edge cases (initial mode, no transition, multiple steps)

## Related Stories

- **4-2:** Framing modes (attract/start) — will use the hook to drive UI transitions
- **4-6:** High-score persist on mode change — will use hook to save score when mode changes to game-over/highscore

## Workflow Tracking

**Workflow:** tdd
**Phase:** red
**Phase Started:** 2026-06-26T07:57:12Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-06-26T07:57:12Z | - | - |
| red | - | - | - |

## Delivery Findings

No upstream findings.

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `src/shell/loop.ts` - Added optional 5th positional `onModeChange?: (oldMode: Mode, newMode: Mode) => void` param; track `prevMode` (seeded to `initial.mode`); fire per sub-step after each `stepGame()` when `state.mode` changes.

**Tests:** 7/7 loop tests passing; 156/156 full suite (GREEN)
**Typecheck:** `tsc --noEmit` clean. No lint script configured.
**Branch:** feat/4-5-loop-onmodechange-hook (pushed)

**Handoff:** To Reviewer (review phase)

## Design Deviations

### Dev (implementation)
- No deviations from the planned approach. Typed the callback with the existing `Mode` union (from `core/state`) rather than `string` for type safety; all test literals are valid `Mode` values, so the test's `vi.fn()` satisfies the signature. Did not add the optional post-creation hook setter (not in ACs, not tested).

### TEA (test design)
- **onModeChange param position:** Spec says "accepts an optional `onModeChange` callback parameter" without fixing its position/shape. Tests assume it is the **5th positional parameter** of `createLoop(initial, sampleInput, draw, now, onModeChange?)`. Reason: most literal reading of the AC; the optional "hook setter" mentioned in the approach is not covered (not in ACs).
- **Per-sub-step detection (granularity):** Spec's technical approach says "after each `stepGame()` call, compare `state.mode` against the previous mode." Tests pin **per-sub-step** detection: two distinct transitions within one frame fire once each, in order (not collapsed to one frame-start→frame-end comparison). Reason: matches the stated approach and the AC4 intent ("fires once per *actual* transition").

## TEA Assessment

**Tests Required:** Yes
**Reason:** New shell-loop behavior (mode-transition hook); needs failing tests to drive GREEN.

**Test Files:**
- `tests/shell/loop.test.ts` — 7 tests for the `createLoop` `onModeChange` hook.

**Tests Written:** 7 tests covering all 6 ACs
**Status:** RED (4 feature tests failing as expected; 3 guard tests pass and protect against spurious fires)

**Test → AC map:**
- AC1 (accepts optional callback) / AC3 (correct args): `fires onModeChange with (oldMode, newMode)...` — FAIL (RED)
- AC2 (detect via before/after compare): `does not fire when mode is unchanged...` (PASS guard) + `tracks the previous mode across separate frames` — FAIL (RED)
- AC4 (no double-fire within a frame): `fires exactly once for a single transition spread across sub-steps` — FAIL (RED); `fires once per actual transition even when several occur in one frame` — FAIL (RED)
- AC5 (optional hook): `runs without an onModeChange callback and still advances mode` — PASS guard
- Edge (initial mode / no transition): `does not fire on the first frame when mode stays at its initial value` — PASS guard

**Test approach:** Mocks the pure `stepGame` (vi.mock) to script per-sub-step modes and stubs `requestAnimationFrame`/`cancelAnimationFrame` with a fake clock — deterministic, no real timers/RAF, `src/core/` boundary untouched.

**Handoff:** To Dev for implementation (GREEN).

## Reviewer Assessment

**Verdict:** APPROVED

**Verification run by Reviewer:**
- `npm test` → 156/156 passing (25 files), incl. the 7 new loop tests.
- `npx tsc --noEmit` → clean (exit 0).
- **Non-vacuity proof:** temporarily deleted the detection block in `src/shell/loop.ts` and re-ran the loop suite → exactly 4 feature tests failed, 3 guards passed (matching TEA's RED report). Tests genuinely require the implementation.

**Findings:**
- Critical / High: **none**.
- Minor (non-blocking, follow-ups): (1) `onModeChange` callback is unguarded — if it throws, the RAF chain dies; consistent with existing unguarded `draw()`/`sampleInput()`, so not a regression. Worth a try/catch or a "callbacks must not throw" contract when 4-2/4-6 register non-trivial callbacks. (2) Test gaps: no A→B→A revert-within-one-frame, no `stop()`-suppresses-fire, no callback-throws test — low value, not required.
- Nit: (1) callback typed `(Mode, Mode)` instead of spec's `(string, string)` — ACCEPTED as an improvement (compile-time safety). (2) Session "Current State" line references modes `attract`/`highscore` that don't yet exist in the `Mode` union — aspirational (4-2/4-6 will add them); no code impact.

**Deviation audit:** Dev's `Mode` typing, Dev's omission of the post-creation hook setter, and TEA's 5th-positional-param + per-sub-step granularity all ACCEPTED.

**AC conformance:** All 6 ACs met and test-backed.

**Handoff:** To SM for finish-story. No changes required from Dev or TEA.
