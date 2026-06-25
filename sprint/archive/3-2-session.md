---
story_id: "3-2"
jira_key: "3-2"
epic: "3"
workflow: "tdd"
---
# Story 3-2: End-of-level warp transition with geometry switch

## Story Details
- **ID:** 3-2
- **Title:** End-of-level warp transition with geometry switch
- **Jira Key:** 3-2
- **Workflow:** tdd
- **Epic:** 3 — Wave 3 — Levels & warp
- **Points:** 3
- **Priority:** p1
- **Stack Parent:** none (not a stacked story)

## Context Summary

Story 3-1 delivered the 16-geometry roster (`tubeForLevel` selector) but the level-transition logic in `src/core/sim.ts` (startLevel/checkLevelClear) increments `s.level` without calling `tubeForLevel(s.level)` or resizing the spike array. As a result, all levels past level 1 render the wrong geometry (the level-1 circle), making the entire Wave 3 roster invisible.

This story wires the per-level geometry swap and spike-array resize into `advanceLevel()`, and implements the end-of-level warp transition mode (progress 0→1 at WARP_SPEED) before advancing the level.

**Ref:** `docs/superpowers/plans/2026-06-25-tempest-wave-3-levels-warp.md` Task 2; `sprint/archive/3-1-session.md` Delivery Findings (Reviewer).

## Acceptance Criteria

1. **advanceLevel() swaps geometry:** `s.tube = tubeForLevel(s.level)` so each level actually shows its roster shape (NOT the level-1 circle).
2. **advanceLevel resizes spike array:** `s.spikes = new Array(s.tube.laneCount).fill(0)` — laneCount varies (12/14/15/16) across the roster, so a stale-length array is a bug.
3. **Lane wrapping on geometry change:** `s.player.lane = wrapLane(s.tube, s.player.lane)` keeps the Claw in range when laneCount shrinks.
4. **Warp transition before advancement:** Clearing a level enters 'warp' mode (`warp.progress 0→1 at WARP_SPEED`) instead of advancing immediately; `advanceLevel()` runs on warp completion and resets `warp.progress` to 0, `mode` to 'playing'.
5. **Regression guard:** A test asserts that after a level transition `out.tube.laneCount === tubeForLevel(out.level).laneCount && out.spikes.length === tubeForLevel(out.level).laneCount`.

## Technical Approach

### Implementation Tasks

1. **Define warp mode constants** in `src/core/rules.ts`:
   - `WARP_SPEED` (progress units per second, e.g., 2 for 0.5s transition)
   - Confirm `GameState` has `warp: { mode: 'playing' | 'warping', progress: number }`

2. **Update `checkLevelClear()` in `src/core/sim.ts`:**
   - When player clears a level: set `s.warp.mode = 'warping'` and `s.warp.progress = 0`
   - Do NOT call `advanceLevel()` yet — that happens on warp completion

3. **Implement warp animation in `stepGame()`:**
   - If `s.warp.mode === 'warping'`: increment `s.warp.progress += (dt * WARP_SPEED)`
   - When `s.warp.progress >= 1`: call `advanceLevel(s)`, reset `s.warp.progress = 0`, set `s.warp.mode = 'playing'`

4. **Implement `advanceLevel(s)`:**
   - `s.level += 1`
   - `s.tube = tubeForLevel(s.level)` — swap geometry
   - `s.spikes = new Array(s.tube.laneCount).fill(0)` — resize spike array
   - `s.player.lane = wrapLane(s.tube, s.player.lane)` — keep player in bounds
   - Ensure `s.level <= 16` or loop back to level 1 (check Wave 3 spec for cycling rules)

5. **Create test suite for `advanceLevel()`:**
   - Test that `advanceLevel()` correctly swaps geometry for each level (1–16)
   - Test that spike array resizes to the new laneCount
   - Test lane wrapping when laneCount decreases (e.g., from 16-lane to 12-lane)
   - Test the warp transition lifecycle (progress 0→1, then advanceLevel on completion)
   - Regression guard: assert `out.tube.laneCount === tubeForLevel(out.level).laneCount && out.spikes.length === out.tube.laneCount`

### Key Helpers Already Available
- `tubeForLevel(level)` from `src/core/geometry.ts` (story 3-1)
- `wrapLane(tube, lane)` — verify it exists; if not, implement as `(lane % tube.laneCount)`
- `stepGame(state, input, dt)` — augment to handle warp animation

## Workflow Tracking
**Workflow:** tdd
**Phase:** finish
**Phase Started:** 2026-06-25T20:06:05Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-06-25T19:27:01Z | 2026-06-25T19:29:32Z | 2m 31s |
| red | 2026-06-25T19:29:32Z | 2026-06-25T19:43:21Z | 13m 49s |
| green | 2026-06-25T19:43:21Z | 2026-06-25T19:52:44Z | 9m 23s |
| review | 2026-06-25T19:52:44Z | 2026-06-25T20:06:05Z | 13m 21s |
| finish | 2026-06-25T20:06:05Z | - | - |

## Branch Strategy
**Branch:** `feat/tempest-wave-3-warp-geometry-switch` (feature branch off `main`, per CLAUDE.md; PR targets `main`)

## Sm Assessment

**Setup verdict: ready for RED phase (TEA).**

- **Scope is well-bounded.** The story is the geometry-swap carryover baked into ACs from the 3-1 Reviewer findings: wire `advanceLevel` to call `tubeForLevel(s.level)`, resize `s.spikes`, wrap the player lane, and gate the whole thing behind a `warp` mode that animates `warp.progress 0→1` at `WARP_SPEED` before advancing. Five concrete ACs, including an explicit regression guard (AC5) that 3-1's suite structurally could not cover.
- **Dependencies satisfied.** 3-1 (16-geometry roster + pure `tubeForLevel` selector) is merged (PR #6). `tubeForLevel` and the roster already exist; this story consumes them. `wrapLane` is referenced in AC3 — TEA/Dev should confirm it exists in `src/core/geometry.ts` (or equivalent) and add it if not.
- **Hard boundary applies.** All work lands in `src/core/` (pure sim). No DOM/time/RNG — warp animation advances via `dt` and `WARP_SPEED`, not wall-clock. The RED tests must be deterministic.
- **Branch correction.** sm-setup asserted a "trunk-based, no branch" strategy citing a `repos.yaml` that does not exist. That contradicts CLAUDE.md (`feat/{description}`, PRs target `main`) and the Wave 3 precedent (PR #6 from `feat/tempest-wave-3-geometry-roster`). I created `feat/tempest-wave-3-warp-geometry-switch` off `main` and corrected the Branch Strategy section. PR targets `main`.

**Handoff:** TEA (Major Hochstetter) owns the RED phase — write failing tests for the warp lifecycle, `advanceLevel` geometry swap, spike-array resize, lane wrap, and the AC5 regression guard.

## TEA Assessment

### Red Phase (test writing)

**Tests Required:** Yes
**Reason:** Net-new deterministic core behavior (warp `Mode`, `GameState.warp`, `advanceLevel`, geometry swap, spike resize, lane wrap) with five explicit ACs — squarely TDD.

**Test Files:**
- `tests/core/sim.level.test.ts` (REWRITTEN) — warp-gated transition: clearing a level enters `'warp'`, not an immediate advance; advance happens on warp completion; negative-gating cases (enemies remain / budget not empty / player killed) do NOT enter warp.
- `tests/core/sim.warp.test.ts` (NEW) — warp lifecycle: progress ∈ [0,1) on entry, strictly monotonic, terminates within bounded frames, resets to exactly 0 on completion, no firing during warp, rotation still allowed, and `stepGame` must not mutate its input warp state (cloneState clones warp).
- `tests/core/sim.advance-level.test.ts` (NEW) — geometry swap to the exact shared roster object (AC1), spike-array resize across all four distinct laneCounts + zero-fill freshness (AC2), player-lane wrap on shrink (AC3), and the AC5 regression guard parametrized over transitions 1→2 / 3→4 / 4→5 / 5→6 / 7→8, plus a determinism guard.

**Tests Written:** 24 tests covering all 5 ACs (6 in sim.level, 7 in sim.warp, 11 in sim.advance-level).
**Status:** RED confirmed — 18 failing / 0 regressions across the 18 pre-existing test files (run `3-2-tea-red-2`). The 6 green tests are negative-gating (don't-enter-warp) and baseline/determinism invariants that correctly hold under both old and new behavior.

**AC → test traceability:**
| AC | Behavior | Test(s) |
|----|----------|---------|
| AC1 | geometry swap `s.tube = tubeForLevel(level)` | advance-level: "installs the EXACT next-level geometry", "swaps to a DIFFERENT laneCount (16→12)" |
| AC2 | spike array resize + fresh `fill(0)` | advance-level: "resizes across every distinct roster size", "starts every lane at 0" |
| AC3 | `wrapLane` player into new tube | advance-level: "wraps an out-of-range lane into the smaller tube" |
| AC4 | clear → warp, progress 0→1, complete → reset | level: "enters warp NOT next level", "advances once warp completes"; warp: progress/monotonic/reset suite |
| AC5 | tube.laneCount === spikes.length === roster | advance-level: parametrized guard over 5 transitions (laneCounts 16/12/14/15) |

### Rule Coverage

| Rule (lang-review/typescript.md) | Test(s) | Status |
|------|---------|--------|
| #3 enum exhaustiveness — new `'warp'` Mode must be handled in `stepGame` switch, not a silent no-op | warp: "advances progress monotonically", "completes and lands in playing" (prove the `'warp'` branch does real work) | failing |
| #8 test quality — meaningful assertions, no vacuous green | self-check pass (see below) | n/a |
| pure-core (CLAUDE.md, load-bearing) — determinism + no input mutation, no time/RNG in transition | advance-level: "deterministic … identical post-warp geometry"; warp: "does NOT mutate the input state (cloneState must clone warp)" | failing |

**Rules checked:** 3 of the lang-review checks are behaviorally testable for this pure-sim change (#3 enum exhaustiveness, #8 test quality, and the project's load-bearing pure-core/determinism rule); the remainder (React/JSX, async, input validation, bundle) are not applicable to a synchronous pure-core change.
**Self-check:** 2 false-green-in-RED tests found and hardened — "completes within bounded frames" and "does NOT fire bullets during warp" originally passed vacuously (their `while mode==='warp'` loops never ran under the bug); added `expect(s.mode).toBe('warp')` guards so they now fail in RED and meaningfully assert in GREEN. No `as any`, no `let _ =`, no always-true assertions remain.

**Note for Dev (Sergeant Carter):** Authoritative design is Wave 3 plan Task 2 (lines 426+). Add `'warp'` to `Mode`, `WarpState { progress }` + `GameState.warp` to `state.ts` (and `initialState`), `WARP_SPEED` to `rules.ts`, and in `sim.ts`: clone `warp` in `cloneState`, make `checkLevelClear` enter warp (mode='warp', progress=0, clear bullets) instead of advancing, add a `'warp'` branch (stepPlayer + stepWarp; no firing), and a private `advanceLevel` (level+1 → `tubeForLevel` → resize spikes → `wrapLane` player → reset progress → mode 'playing'). Verify with BOTH `npm test` AND `npm run build` (tsc) — vitest/esbuild does not typecheck.

**Handoff:** To Dev for GREEN implementation.

## Dev Assessment

**Implementation Complete:** Yes

**Files Changed:**
- `src/core/state.ts` — `Mode` gains `'warp'`; added `WarpState { progress }`; `GameState.warp` field; `initialState` seeds `warp: { progress: 0 }`.
- `src/core/rules.ts` — added `WARP_SPEED = 2` (progress units/sec → 0→1 in 0.5s).
- `src/core/sim.ts` — `cloneState` clones `warp`; `checkLevelClear` now enters `'warp'` (set mode, reset progress, clear bullets) instead of advancing; new private `advanceLevel` (level+1 → `tubeForLevel` → resize+zero spikes → `wrapLane` player → `startLevel` → reset progress → mode `'playing'`); new `stepWarp` (progress += dt·WARP_SPEED, advanceLevel at ≥1); `'warp'` branch in `stepGame` (stepPlayer only — rotation allowed, no firing); `startGame` resets `warp.progress`.
- `tests/core/sim.death.test.ts` — scenario fix only (see Dev deviation): added a surviving far-lane enemy so respawn doesn't incidentally clear the level. No implementation change drove this.

**Tests:** 117/117 passing (GREEN). `tsc --noEmit` clean; `vite build` succeeds. Verified by `testing-runner` run `3-2-dev-green-2`.

**AC status:** AC1 (geometry swap), AC2 (spike resize + zero-fill), AC3 (lane wrap on shrink), AC4 (warp lifecycle: enter → progress 0→1 → advanceLevel → reset), AC5 (regression guard across laneCounts 12/14/15/16) — all green. Pure-core boundary intact: no DOM/time/RNG; warp advances only via `dt`; determinism + input-immutability tests pass.

**Self-review:** Wired up — shell consumes `'warp'` mode gracefully (renders as playing view; geometry swap now visible past level 1, fixing the 3-1 carryover bug). Follows existing sim patterns (pure helpers mutating the cloned state). No debug code. Minimal — no abstractions beyond what the tests demand.

**Handoff:** To Reviewer (General Burkhalter) for code review.

## Subagent Results

| # | Specialist | Received | Status | Findings | Decision |
|---|-----------|----------|--------|----------|----------|
| 1 | reviewer-preflight | Yes | clean | none (117/117 green, tsc+build clean, 0 smells) | N/A |
| 2 | reviewer-edge-hunter | Yes | findings | 3 | confirmed 3 (all LOW/MEDIUM, non-blocking), dismissed 0, deferred 0 |
| 3 | reviewer-silent-failure-hunter | Yes | findings | 4 | confirmed 4 (1 corroborates assertNever; 3 LOW defensive/future), dismissed 0 |
| 4 | reviewer-test-analyzer | Yes | findings | 8 | confirmed 7 (2 MEDIUM test-hardening, 4 coverage gaps, 1 doc), dismissed 1 (toBe coupling — intentional) |
| 5 | reviewer-comment-analyzer | Yes | findings | 2 | confirmed 2 (both LOW doc), dismissed 0 |
| 6 | reviewer-type-design | Yes | findings | 2 | confirmed 1 (assertNever, MEDIUM), dismissed 1 (primitive-obsession — acceptable, plan-specified) |
| 7 | reviewer-security | Yes | clean | none (purity/determinism boundary intact) | N/A |
| 8 | reviewer-simplifier | Yes | findings | 3 | confirmed 1 (dup test loop, LOW), dismissed 2 (startGame reset = consistency; WarpState wrapper = plan-specified) |
| 9 | reviewer-rule-checker | Yes | findings | 1 | confirmed 1 (assertNever #3, same as type-design/silent) — 86/87 instances compliant |

**All received:** Yes (9 returned, 7 with findings, 2 clean)
**Total findings:** 8 distinct issues confirmed (1 MEDIUM rule-match flagged 3×, 2 MEDIUM test-hardening, rest LOW), 4 dismissed with rationale, 0 deferred. **No Critical/High.**

## Reviewer Assessment

**Verdict:** APPROVED

A pure-core, deterministic warp transition. All 5 ACs met; 117/117 green; `tsc --noEmit` + `vite build` clean. The 9-specialist panel surfaced ZERO Critical/High issues. The most-flagged item (missing `assertNever` default) is a **pre-existing project-wide pattern** the diff merely extends, correct for today's 4-mode union. The test-hardening findings are real but the suite's regression guard is intact (proven below). Approving with non-blocking follow-ups recorded.

**Data flow traced:** `Input` (NEUTRAL/spin) → `stepGame` clone → `'warp'` branch (`stepPlayer` rotates the Claw, `stepWarp` accumulates `dt·WARP_SPEED`) → at `progress ≥ 1`, `advanceLevel` swaps `tubeForLevel(level)`, zero-fills `spikes` to the new `laneCount`, `wrapLane`s the player into the new tube, returns `mode='playing'`. Safe: time enters only via `dt`, no RNG/DOM, input state never mutated (clone-first).

**Confirmed observations (8):**
- `[TYPE][SILENT][RULE]` **Missing `default: assertNever(s.mode)` in the `stepGame` switch** — `src/core/sim.ts:267`. MEDIUM, non-blocking. Matches lang-review rule #3; flagged by 3 specialists. **Confirmed, not dismissed** (rule match). Severity downgraded with rationale: the switch is exhaustive for all 4 current `Mode` values, TS strict compiles clean, and the pattern **pre-existed this diff** (rule-checker confirms `makeEnemy`/`stepEnemies`/`scoreFor` switches also lack `assertNever`). Risk is purely future (Wave 4 adds `attract`/`title`). Recorded as a delivery finding for the Wave 4 mode work.
- `[TEST]` **AC2 spike-resize loop (`sim.advance-level.test.ts:61`) and determinism test (:107) lack an `out.mode === 'playing'` assertion** — MEDIUM, non-blocking. They'd pass vacuously *only if* warp-completion regressed. Mitigated: the AC5 block (`:99`) and `sim.warp.test.ts` (`:52,:59`) assert completion over the same transitions, so the suite catches a broken warp three ways. Recommend adding the one-line guard to harden the siblings.
- `[TEST]` **Coverage gaps** — no integration test for (a) wrapping into an OPEN tube (clamp path of `wrapLane`), (b) the level-16→17 cycle boundary through `advanceLevel`, (c) two consecutive warps (cross-cycle leakage). LOW/MEDIUM, non-blocking. Each underlying behavior is unit-tested elsewhere (`geometry.cycle.test.ts` cycles + `wrapLane`) and edge-hunter verified `player.lane` stays in range for both closed/open. Recommended additions, not blockers.
- `[DOC]` **Stale RED-phase comment** `sim.advance-level.test.ts:5` — "today checkLevelClear bumps s.level WITHOUT calling tubeForLevel" no longer matches the committed code (checkLevelClear now enters warp; `advanceLevel` bumps). LOW. Quick fix.
- `[DOC]` **`WarpState.progress` comment** (`src/core/state.ts:62`) describes `1 = arrived` as a stable value, but it's reset to 0 the instant it's reached (never observable). LOW, imprecise wording.
- `[SIMPLE][TEST]` **Duplicated warp-drain loop** across 3 test files — LOW. The established convention here is per-file helpers (each file declares its own `NEUTRAL`); a shared `tests/core/helpers.ts` would be cleaner. Non-blocking.
- `[EDGE][SILENT]` **`dt = 0` / NaN / negative `dt` can stall the warp** (`src/core/sim.ts:261`) — LOW, non-blocking. This is the **codebase-wide shell-boundary contract**: every `dt`-consuming function (`stepBullets`, `stepEnemies`, respawn timer) already assumes a finite positive `dt`; the fixed-timestep loop in the shell provides it. Not warp-specific, not a regression. Recommend the shell clamp `dt` (defense-in-depth) — recorded as a finding.
- `[SILENT]` **`advanceLevel` has no `player.alive` guard** (`:256`) — LOW, non-blocking. No current path reaches warp with a dead player (`resolvePlayerHits` runs before `checkLevelClear`, which guards `mode === 'playing'`; edge-hunter confirmed). Defensive note for future warp-phase steppers (Task 3 spike crash).

**VERIFIED (evidence + rule-checked):**
- `[VERIFIED]` `[SEC]` Pure-core boundary intact — `stepWarp` uses only `dt`+`WARP_SPEED` (`sim.ts:261`); `advanceLevel` calls only pure `tubeForLevel`/`wrapLane`/`startLevel` (`:249-257`). No `Date.now`/`Math.random`/`performance.now`/DOM/`shell` import. Complies with CLAUDE.md pure-core rule. (`[SEC]` reviewer-security: clean — 0 violations across 16 instances of the no-DOM/no-time/no-RNG/no-shell-import rules; `[RULE]` rule-checker #14, 18 instances, 0 violations.)
- `[VERIFIED]` No input-state mutation — `cloneState` adds `warp: { ...s.warp }` (`sim.ts:26`); `WarpState` is a single primitive so the shallow spread is a full copy. Guarded by `sim.warp.test.ts:78` "does NOT mutate the input state." Complies with the determinism/no-mutation rule. (security + rule-checker #15.)
- `[VERIFIED]` No double-advance or level-skip on large `dt` — `stepWarp` calls `advanceLevel` at most once; `advanceLevel` sets `mode='playing'` and the switch `break`s, so the new level is not processed the same frame (`sim.ts:260-283`). Surplus time is dropped — correct for determinism. (edge-hunter confirmed.)
- `[VERIFIED]` `player.lane` always strictly in `[0, laneCount)` after a tube swap — `advanceLevel` re-wraps via `wrapLane(s.tube, …)` with the NEW tube (`:253`); closed→modulo, open→clamp. (edge-hunter confirmed; AC3 test pins the closed case.)
- `[VERIFIED]` No dead-player-in-warp state — `resolvePlayerHits`→`killPlayer` sets `mode` to `dying`/`gameover` before `checkLevelClear`, which guards `mode === 'playing'` (`sim.ts:235`). (edge-hunter confirmed.)
- `[VERIFIED]` All 5 ACs satisfied and the carryover bug is fixed — geometry now swaps past level 1 (AC1), spikes resize across laneCounts 12/14/15/16 (AC2/AC5), lane wraps on shrink (AC3), warp lifecycle enter→progress→advance→reset (AC4). (preflight 117/117; AC traceability table in TEA/Dev assessments.)

**Pattern observed:** `advanceLevel`/`stepWarp` follow the established `sim.ts` convention — small pure helpers that mutate the already-cloned `GameState` (matches `stepBullets`, `respawn`, `startLevel`). Good. `src/core/sim.ts:249-263`.

**Error handling:** No throws in the pure sim by design; the only robustness gap is unvalidated `dt` (shell-boundary contract, codebase-wide, non-blocking — see findings).

### Rule Compliance (lang-review/typescript.md)
- #1 type-safety escapes — compliant (rule-checker: 22 instances, 0 `as any`/`!`/`@ts-ignore`).
- #2 generics/readonly — compliant (mutation params are intentional cloned-state convention).
- **#3 enum exhaustiveness — VIOLATION (1):** `stepGame` switch lacks `default: assertNever` (`sim.ts:267`). Confirmed, MEDIUM, non-blocking (pre-existing, correct today). See findings.
- #4 null/undefined (`??` vs `||`) — compliant (numeric arithmetic, no falsy traps).
- #5 module/import-type — compliant (`import type` used for `GameState`; bundler resolution, no `.js` needed).
- #6 React/JSX, #7 async, #10 input-validation, #11 error-handling — N/A (synchronous pure core, no UI/async/external input).
- #8 test quality — compliant on `as any`/mocks/dist-imports; 2 MEDIUM vacuous-under-regression weaknesses noted (mitigated at suite level).
- #9 build/config, #12 perf/bundle — compliant (strict on; named imports, no barrels).
- Pure-core determinism + no-mutation (CLAUDE.md) — compliant (rule-checker #14/#15, security: 0 violations).

### Devil's Advocate
Assume this code is broken. **Timing attack on the loop:** the warp trusts `dt` blindly — a tab refocus or a paused shell that pipes `dt = 0`, or first-frame timestamp subtraction yielding `NaN`, drives `progress` to a value that never satisfies `>= 1`, and the game locks forever in `'warp'` with no recovery and no error (silent-failure + edge-hunter agree). A confused shell author would never know why the game froze on level transition. **The regression guard that doesn't guard:** this story exists to prevent the 3-1 carryover, yet two of its tests (AC2-resize loop, determinism) derive the expected `laneCount` from the *actual* output level — if `advanceLevel` silently stopped completing, those tests would pass green while the game was broken. The story would ship a "regression guard" with a hole in it. **The time bomb for Wave 4:** the `Mode` switch has no `assertNever`. Wave 4 adds `attract`/`title`/`pause` modes (per the roadmap) — the day someone adds `'pause'` to the union and forgets a case, `stepGame` will silently return the frame unchanged, the game will appear frozen, and TypeScript will say nothing. **Refactor fragility:** `expect(out.tube).toBe(tubeForLevel(2))` asserts referential identity; a maintainer who hardens `tubeForLevel` to return `Object.freeze`d clones (a reasonable immutability move) breaks the tests despite identical behavior. **UX surprise:** dying to the literal last enemy of a level now respawns you straight into a warp — the player loses a life *and* gets advanced, which may read as a bug to a human (Dev flagged this as an open Question). **Untested clamp path:** every lane-wrap test lands in a closed tube; the open-tube clamp branch of `wrapLane` is never exercised through `advanceLevel`, so an inverted open/closed check would slip through this story's suite. *Resolution:* none of these are Critical/High — the timing issue is a pre-existing whole-sim contract, the vacuous tests are backstopped by AC5 + the warp-lifecycle suite, the `assertNever` and clamp gaps are future/maintainability. All are recorded as non-blocking follow-ups. The production code is correct and deterministic today.

**Handoff:** To SM (Colonel Hogan) for finish-story.

## Delivery Findings

<!-- Agents: append findings below this line. Do not edit other agents' entries. -->

### TEA (test design)
- **Gap** (non-blocking): The level-1 → level-2 transition keeps laneCount at 16, so it cannot detect a missing spike-resize or lane-wrap. Affects `tests/core/sim.advance-level.test.ts` (already mitigated — the AC5 guard is parametrized over level transitions 3→4 / 4→5 / 5→6 / 7→8 to exercise all four distinct laneCounts 12/14/15/16). Flagging so future tube-related stories never rely on a same-size transition as a regression guard. *Found by TEA during test design.*
- **Improvement** (non-blocking): `cloneState` in `src/core/sim.ts` deep-copies `player`/`bullets`/`enemies`/`spikes`/`spawn` but currently has no `warp` field to clone. Affects `src/core/sim.ts` (`cloneState` must add `warp: { ...s.warp }` when `GameState.warp` is introduced, or `stepGame` will mutate its input and break determinism). A test guards this (`does NOT mutate the input state during a warp step`). *Found by TEA during test design.*

### Dev (implementation)
- **Improvement** (non-blocking): The shell renders the new `'warp'` mode as the ordinary playing view — functional and crash-free, but with no bespoke warp animation. Affects `src/shell/render.ts` (a later Wave 3 shell story should add the descending-Claw/zoom warp visual and `paletteForLevel` color cycling). *Found by Dev during implementation.*
- **Question** (non-blocking): When the player dies to the LAST enemy of a level (lives remaining), after respawn the field is empty and the game now enters `'warp'` and advances. This is consistent with AC4's level-clear definition but is a rare corner case worth a product confirmation — should dying to the final enemy still "clear" the level into a warp, or should clearing require the player to survive? Affects `src/core/sim.ts` (`checkLevelClear`). No change made; flagging for the Reviewer/PM. *Found by Dev during implementation.*

### Reviewer (code review)
- **Improvement** (non-blocking): The `stepGame` `switch (s.mode)` has no `default: assertNever(s.mode)` guard (lang-review rule #3, flagged by 3 specialists). Correct for today's 4-mode union but a future `Mode` value would silently no-op. Affects `src/core/sim.ts:267` (add an `assertNever` helper + default case — ideally folded into the Wave 4 work that introduces `attract`/`title`/`pause` modes; the sibling switches `makeEnemy`/`stepEnemies`/`scoreFor` share the gap). *Found by Reviewer during code review.*
- **Improvement** (non-blocking): Two tests (`tests/core/sim.advance-level.test.ts:61` AC2-resize loop and `:107` determinism) derive the expected `laneCount` from `out.level`, so they would pass vacuously if warp-completion regressed. Mitigated at suite level (AC5 `:99` + `sim.warp.test.ts:52,59` assert completion over the same transitions). Affects those two tests — add `expect(out.mode).toBe('playing')` to harden them. *Found by Reviewer during code review.*
- **Gap** (non-blocking): No integration test through `advanceLevel` for (a) wrapping into an OPEN tube (the clamp path of `wrapLane`), (b) the level-16→17 roster-cycle boundary, or (c) two consecutive warps (cross-cycle state leakage). Behaviors are unit-tested elsewhere (`geometry.cycle.test.ts`) and edge-hunter verified in-range wrapping. Affects `tests/core/sim.advance-level.test.ts` (add the three cases). *Found by Reviewer during code review.*
- **Improvement** (non-blocking): The pure core trusts `dt` to be finite and positive; a malformed `dt` (0/NaN/negative) from the shell would stall the warp permanently (and already corrupts the rest of the sim). Affects the shell loop (`src/shell/loop.ts` should clamp/validate `dt` before calling `stepGame` — defense-in-depth at the boundary). Codebase-wide pre-existing contract, not introduced here. *Found by Reviewer during code review.*
- **Improvement** (non-blocking): Minor doc/comment cleanups — stale RED-phase comment at `tests/core/sim.advance-level.test.ts:5` (describes pre-fix `checkLevelClear` behavior) and the `WarpState.progress` comment at `src/core/state.ts:62` (describes `1` as a stable value though it's reset to 0 instantly). *Found by Reviewer during code review.*

## Design Deviations

<!-- Agents: append deviations below this line. Do not edit other agents' entries. -->

### TEA (test design)
- **`advanceLevel` exercised through the public `stepGame` API, not imported directly**
  - Spec source: context-story-3-2.md, AC1–AC3
  - Spec text: "advanceLevel(s) swaps geometry: s.tube = tubeForLevel(s.level) ... advanceLevel resizes the spike array ... advanceLevel wraps the player lane"
  - Implementation: Tests drive a full level-clear → warp → completion through `stepGame` and assert the observable post-warp state (`out.tube`, `out.spikes`, `out.player.lane`); they do not import or call `advanceLevel` directly.
  - Rationale: Keeps `advanceLevel` a private helper (the Wave 3 plan declares it `function advanceLevel`, not exported) and tests behavior through the public interface rather than coupling to an internal export.
  - Severity: minor
  - Forward impact: none
- **Spike-crash-during-warp deliberately NOT tested (scope boundary)**
  - Spec source: docs/superpowers/plans/2026-06-25-tempest-wave-3-levels-warp.md, Task 2 transition model
  - Spec text: "the player may still rotate to dodge, and a spike in the player's lane crashes them ... (Spike crashes are added in Task 3.)"
  - Implementation: No spike-crash tests written; warp tests cover progress/advance/rotate/no-fire/geometry-swap only. Player survival through warp is assumed (no lethal spike interaction).
  - Rationale: Spike crashes are Task 3 (`sim.warp.spikes.test.ts`) and are not among story 3-2's five ACs.
  - Severity: minor
  - Forward impact: minor — the future Wave 3 "spike crash during warp" story (plan Task 3) must add `sim.warp.spikes` coverage; 3-2's suite does not guard that behavior.
- **Warp progress not pinned to `> 0` on the entry frame**
  - Spec source: docs/superpowers/plans/2026-06-25-tempest-wave-3-levels-warp.md, Task 2 Step 1 example test
  - Spec text: "expect(s.warp.progress).toBeGreaterThan(0)" (asserted after the single step that enters warp)
  - Implementation: Tests assert `progress ∈ [0, 1)` on the entry frame and strictly-increasing across subsequent warp steps, rather than `> 0` on the entry frame.
  - Rationale: The ACs do not specify whether the first increment lands on the entry frame or the next; pinning `> 0`-on-entry would falsely fail a correct implementation that sets `progress = 0` on entry and increments on the following warp step.
  - Severity: minor
  - Forward impact: none

### Dev (implementation)
- **Adjusted a pre-existing test's scenario so respawn does not incidentally clear the level**
  - Spec source: tests/core/sim.death.test.ts, "respawns after the delay while lives remain"
  - Spec text: "s.spawn.remaining = 0 ... s.enemies = [{ kind: 'flipper', lane: 4, depth: 0.95 ... }] ... expect(s.mode).toBe('playing')"
  - Implementation: Added a second, far-lane sub-rim enemy (`lane: 9, depth: 0.3`) that survives the respawn, so the field is not empty afterward. Without it, respawn clears the only (rim) enemy, leaving `enemies.length === 0 && spawn.remaining === 0`, which now correctly enters `'warp'` — making the test's `mode === 'playing'` assertion fail. The implementation is unchanged/spec-correct; only the test scenario was made non-degenerate.
  - Rationale: The new warp transition (AC4) makes "empty field + empty budget in playing mode" enter warp; the death test's minimal setup incidentally satisfied that after respawn. The test's intent is the respawn mechanic, not level progression, so the level must not be incidentally clear.
  - Severity: minor
  - Forward impact: none
- **Warp visuals (descending Claw / zoom) not implemented — core only**
  - Spec source: docs/superpowers/plans/2026-06-25-tempest-wave-3-levels-warp.md, File Structure (`src/shell/render.ts` MODIFY: "render the warp (descending Claw + zoom)")
  - Spec text: "render.ts # MODIFY: use paletteForLevel; render the warp (descending Claw + zoom); open-tube draw"
  - Implementation: Only the pure-core warp transition was built (story 3-2's five ACs are all core). The shell renders `'warp'` mode as the normal playing view (tube + rotating Claw, enemies already cleared) — graceful, no crash — but without bespoke warp visuals.
  - Rationale: Story 3-2's ACs are entirely `src/core/`; shell rendering of the warp and per-level color are separate Wave 3 tasks.
  - Severity: minor
  - Forward impact: minor — a later Wave 3 shell story must add warp rendering + `paletteForLevel` in `src/shell/render.ts`.

### Reviewer (audit)
- **TEA: `advanceLevel` tested through public `stepGame` API** → ✓ ACCEPTED by Reviewer: testing observable behavior through the public interface is sound and avoids over-coupling; edge-hunter + rule-checker independently confirmed the resulting geometry/spike/lane behavior is correct.
- **TEA: Spike-crash-during-warp not tested (scope boundary)** → ✓ ACCEPTED by Reviewer: correctly out of scope — spike crashes are Wave 3 Task 3; none of story 3-2's five ACs cover them. Forward impact already recorded for the Task 3 story.
- **TEA: Warp progress not pinned to `> 0` on the entry frame** → ✓ ACCEPTED by Reviewer: pinning `[0,1)` + monotonic-increase is the more-robust choice and avoids falsely failing a correct entry-frame=0 implementation; matches the actual implementation (progress is 0 on the entry frame).
- **Dev: Adjusted the respawn test so it doesn't incidentally clear the level** → ✓ ACCEPTED by Reviewer: root-cause-correct. The warp behavior is spec-correct (AC4); the death test's minimal setup was degenerate. test-analyzer confirmed the second-enemy scenario is sound (lane mismatch + sub-rim depth make collision impossible) — it only asks for an explanatory comment (recorded as a non-blocking finding).
- **Dev: Warp visuals not implemented (core only)** → ✓ ACCEPTED by Reviewer: correctly scoped — all five ACs are `src/core/`; the shell renders `'warp'` gracefully as the playing view (no crash). Warp rendering + `paletteForLevel` are separate Wave 3 shell tasks; forward impact recorded.
- No UNDOCUMENTED deviations found — the implementation matches the Wave 3 plan Task 2 transition model and the five ACs; every divergence TEA/Dev made was logged.