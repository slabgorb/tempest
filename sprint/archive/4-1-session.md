---
story_id: "4-1"
jira_key: ""
epic: "4"
workflow: "tdd"
---
# Story 4-1: Superzapper full blast, weak shot, and per-level reset

## Story Details
- **ID:** 4-1
- **Jira Key:** (none — Jira integration not configured)
- **Workflow:** tdd
- **Stack Parent:** none
- **Branch:** feat/4-1-superzapper
- **Branch Strategy:** gitflow (branched from develop)

## Workflow Tracking
**Workflow:** tdd
**Phase:** finish
**Phase Started:** 2026-06-26T04:58:39Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-06-26T04:29:24.577145+00:00 | 2026-06-26T04:31:10Z | 1m 45s |
| red | 2026-06-26T04:31:10Z | 2026-06-26T04:41:55Z | 10m 45s |
| green | 2026-06-26T04:41:55Z | 2026-06-26T04:47:16Z | 5m 21s |
| review | 2026-06-26T04:47:16Z | 2026-06-26T04:58:39Z | 11m 23s |
| finish | 2026-06-26T04:58:39Z | - | - |

## Sm Assessment

**Setup decision:** Story 4-1 (*Superzapper full blast, weak shot, and per-level reset*, 3pts, p1) routed to the **tdd** phased workflow — correct for a 3-point logic story touching the pure simulation core. Next phase is **red**, owned by **TEA** (Major Hochstetter).

**Branch:** `feat/4-1-superzapper` branched from `develop` (this repo uses gitflow off the protected `develop` branch, not trunk-based off `main`). Confirmed via `git branch --show-current`.

**Jira:** Not configured for this repo (`pf jira` refuses to contact Jira). Jira ceremony intentionally skipped — JIRA_KEY left empty. This is expected, not a gap.

**Merge gate:** Clear — `gh pr list --state open` returned no open PRs, so no blocking work.

**Scope hand-off note for TEA:** The story has three distinct testable behaviors to drive out with failing tests first — (1) Superzapper *full blast* (first use per level wipes active enemies), (2) *weak shot* (subsequent use within a level is a single weaker zap), and (3) *per-level reset* of Superzapper charges on level transition. All belong in the pure core (`src/core/`), driven by the seeded RNG and `stepGame` — no DOM/time. Confirm authentic Tempest behavior against the design doc and `sprint/context/context-story-4-1.md`.

## TEA Assessment

### Red Phase (test writing)

**Tests Required:** Yes
**Reason:** 3-point logic story adding a new state machine (`Player.superzapper`) and `stepZap` to the pure core — exactly the kind of deterministic logic TDD exists for.

**Test Files:**
- `tests/core/sim.superzapper.test.ts` — full blast, weak shot (nearest-rim + tie-break), spent no-op, per-level reset, dead-player guard, no-mutation, determinism

**Tests Written:** 13 tests, all driven through the public `stepGame` API (no reaching into private helpers).
**Status:** RED — verified by `testing-runner` (RUN_ID `4-1-tea-red`): the new file is 13/13 failing; the full suite is 136 passing / 13 failing with **no pre-existing regressions** (only `sim.superzapper.test.ts` fails). Failures are the right reason — `player.superzapper` is `undefined` and `zap` is ignored because `stepZap` does not exist yet.

**Behaviors covered (mapped to the story title):**
- *Full blast* — vaporises every enemy → `'used-once'`; awards `scoreFor` per enemy; **does NOT split tankers** (vaporise, not hit); preserves charge when the player is dead.
- *Weak shot* — destroys exactly one enemy nearest the rim (max depth), tie broken by lowest index; awards that one enemy's score; → `'spent'`.
- *Per-level reset* — `'used-once'` carries until the next level, then `startLevel` (via the warp → `advanceLevel`) rearms it to `'full'` at level 2.
- *Purity* — `stepGame(ZAP)` does not mutate its input argument; identical inputs yield identical output (deterministic targeting, no RNG/time).

### Rule Coverage

Project rubric = the TypeScript lang-review checklist (`.pennyfarthing/gates/lang-review/typescript.md`). No `.claude/rules/*.md` or `SOUL.md` exist. The load-bearing project rule is CLAUDE.md's pure-deterministic-core boundary.

| Rule | Test(s) | Status |
|------|---------|--------|
| #3 union exhaustiveness — all three `Superzapper` states reached | full-blast (`full → used-once`), weak-shot (`used-once → spent`), progression (`spent` no-op) | failing (RED) |
| #1 type-safety escapes — no `as any` / `@ts-ignore` in the suite | whole file | pass (self-check) |
| #8 test quality — every test has a meaningful assertion, no vacuous `is`/`true`/`let _ =` | all 13 tests | pass (self-check) |
| CLAUDE.md pure core — `stepGame` does not mutate its arg; deterministic, no RNG/time in targeting | `does not mutate the input state`, `is deterministic` | failing (RED) |

**Rules checked:** the applicable subset (#1, #3, #8 + the CLAUDE.md core boundary). Checks #2, #4–#7, #9–#12 are N/A for a pure-core simulation test file (no heavy generics, no React/JSX, no async, no I/O, no error handling, no build config exercised in tests).
**Self-check:** 0 vacuous tests found; 0 `as any`; every test asserts on a concrete value, not just presence.

**Handoff:** To Dev (Sergeant Carter) for the GREEN phase — add `Superzapper` + `Player.superzapper` to `state.ts` (init `'full'`), reset it in `startLevel`, and implement `stepZap` wired into the `'playing'` branch of `stepGame`, per the plan's Task 1 semantics.

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `src/core/state.ts` — added `Superzapper = 'full' | 'used-once' | 'spent'`; added `Player.superzapper`; initialised it to `'full'` in `initialState`.
- `src/core/sim.ts` — `startLevel` rearms `superzapper` to `'full'` (so every level + post-warp level starts armed); added `stepZap` (full blast vaporises all without splitting tankers, weak shot vaporises one nearest the rim with lowest-index tie-break, spent/dead/empty guarded); wired `stepZap` into the `'playing'` branch after `stepFiring`; updated the `startGame` player literal for the new required field.
- `src/core/input.ts` — corrected the now-stale `Input.zap` comment (it is used, not reserved).

**Tests:** 149/149 passing (GREEN) — including all 13 in `tests/core/sim.superzapper.test.ts`. Verified by `testing-runner` (RUN_ID `4-1-dev-green`). `tsc --noEmit` is clean (the new required `Player.superzapper` field is satisfied at every construction site).

**Self-review:**
- Wired into the real game loop (`stepGame` `'playing'` branch), not a dangling helper.
- Follows project patterns: pure deterministic core (no DOM/time/RNG in targeting), mutation confined to the `cloneState` copy, scoring via the existing `awardScore` (so a zap can grant extra lives).
- Acceptance criteria (full blast / weak shot / per-level reset) all covered by passing tests.
- Edge cases guarded: dead player, spent charge, and zapping an empty board (no `scoreFor(undefined)` crash).

**Branch:** `feat/4-1-superzapper` (pushed to origin).

**Handoff:** To Reviewer (General Burkhalter) for code review.

## Subagent Results

Only `preflight` and `rule_checker` are enabled (`pf settings get workflow.reviewer_subagents`); the other seven are disabled via settings, so I assessed their domains myself — I do not claim subagent coverage for them.

| # | Specialist | Received | Status | Findings | Decision |
|---|-----------|----------|--------|----------|----------|
| 1 | reviewer-preflight | Yes | findings | 1 (import-type style) | confirmed 1 (LOW), dismissed 0, deferred 0 |
| 2 | reviewer-edge-hunter | No | Skipped | disabled | Disabled via settings — assessed by Reviewer ([EDGE]) |
| 3 | reviewer-silent-failure-hunter | No | Skipped | disabled | Disabled via settings — assessed by Reviewer ([SILENT]) |
| 4 | reviewer-test-analyzer | No | Skipped | disabled | Disabled via settings — assessed by Reviewer ([TEST]) |
| 5 | reviewer-comment-analyzer | No | Skipped | disabled | Disabled via settings — assessed by Reviewer ([DOC]) |
| 6 | reviewer-type-design | No | Skipped | disabled | Disabled via settings — assessed by Reviewer ([TYPE]) |
| 7 | reviewer-security | No | Skipped | disabled | Disabled via settings — assessed by Reviewer ([SEC]) |
| 8 | reviewer-simplifier | No | Skipped | disabled | Disabled via settings — assessed by Reviewer ([SIMPLE]) |
| 9 | reviewer-rule-checker | Yes | clean | 0 across 16 rules / 102 instances | confirmed 0, dismissed 0, deferred 0 |

**All received:** Yes (2 enabled subagents returned; 7 disabled via settings and assessed by Reviewer)
**Total findings:** 1 confirmed (LOW), 0 dismissed, 0 deferred

## Reviewer Assessment

**Verdict:** APPROVED

The change is small, surgical, and correct: a 3-state `Superzapper` union, a deterministic `stepZap`, a per-level rearm in `startLevel`, two `Player`-literal updates, a corrected comment, and a 200-line behavior-driven test suite. Tests are GREEN (149/149), `tsc --noEmit` is clean, and there are zero regressions. No Critical or High issues. One LOW style nit (non-blocking).

**Data flow traced:** `input.zap` (shell) → `stepGame` `'playing'` branch → `stepZap` reads `s.player.superzapper` + `s.enemies`, mutates the **clone** (`cloneState` ran first at `sim.ts:299`), routes scoring through `awardScore` (so a zap can grant extra lives), then `checkLevelClear` may warp if the blast emptied the board. Deterministic — no RNG, no `dt`, no time. Verified the original argument is untouched (test `does not mutate the input state`, and `cloneState` spreads `player`, copying the `superzapper` primitive).

### Observations

- `[VERIFIED]` Full blast vaporises all enemies and does NOT split tankers — `sim.ts:261-265` iterates `awardScore(scoreFor(e))` then sets `s.enemies = []`; never calls `splitTanker`. Evidence: test `vaporises a tanker WITHOUT splitting` asserts length 0 + score = `SCORE_TANKER`. Complies with CLAUDE.md (kill, not hit).
- `[VERIFIED][EDGE]` No out-of-bounds on the weak-shot target — `sim.ts:268-271` only runs after the `s.enemies.length === 0` early-return at `:256`, so `s.enemies[target]` at `:272` always has ≥1 element. `target` defaults to index 0 and the loop uses strict `>` (lowest-index tie-break). Evidence: tests `…nearest the rim` and `…tie by destroying the LOWEST index`.
- `[VERIFIED][SILENT]` No swallowed errors / silent fallbacks — `stepZap` has no try/catch; every branch is an explicit guard with a clear outcome (`sim.ts:255-275`). The empty-board / spent / dead paths return deliberately, not by accident.
- `[VERIFIED][TYPE]` `Superzapper` is a string union mirroring `Mode` (`state.ts:11`); `Player.superzapper` is **required** (`state.ts:16`), forcing every construction site to set it — caught at compile (`tsc` clean confirms `initialState` and `startGame` updated). Idiomatic, no stringly-typed escape, no `as`/`!`.
- `[VERIFIED][SEC]` No security surface — pure game core; "input" is the in-engine `Input` (spin/fire/zap/start), not untrusted external data. No auth, secrets, I/O, deserialization, or tenant data. N/A by design.
- `[VERIFIED][SIMPLE]` `stepZap` is minimal and well-commented; no dead code, no over-engineering. The combined `spent || length===0` guard is slightly dense but documented (`sim.ts:256-260`).
- `[LOW][DOC]` `tests/core/sim.superzapper.test.ts:33` uses `import { Input }` (value import) for a type-only interface; the adjacent line correctly uses `import type { GameState, Enemy }`. Flagged by preflight (cites story 3-7). **Adjudication / Challenged:** rule-checker marked this "compliant" on a majority-pattern basis — I confirm it as a real but LOW consistency nit, not a violation. Verified: 17/19 test files use the plain form, tsconfig has no `verbatimModuleSyntax`/`isolatedModules` (so it is **not** a compile error), and 3-7 was a single-file cosmetic cleanup, not an enforced mandate. Non-blocking; recorded as a delivery finding for a future sweep.
- `[LOW][TEST]` Two defensive branches in `stepZap` are unexercised: full blast on an empty board (consumes `full → used-once`, `sim.ts:258`) and a weak shot on an empty board (no-op, charge not consumed). Also no test that `zap` is ignored outside `'playing'` (warp/dying). All low-risk; the specified behaviors are fully covered. Non-blocking.

### Rule Compliance

Rubric = `.pennyfarthing/gates/lang-review/typescript.md` (#1–#13) + CLAUDE.md core boundary. No `.claude/rules/*.md` or `SOUL.md` exist. The `reviewer-rule-checker` ([RULE]) ran an exhaustive pass: **0 violations across 16 rules / 102 instances**. I independently confirm the load-bearing ones:

- **#1 type-safety escapes** — no `as any`, `@ts-ignore`, or non-null assertions in source or tests. ✓
- **#3 enum/union** — `Superzapper` is a string union (no enum runtime cost); all three states are handled by the `stepZap` if-chain; TS narrows without needing `assertNever`. ✓
- **#4 null/undefined** — `s.enemies[target]` guarded (see EDGE above); no `||`-vs-`??` hazards (guards are on booleans/strict-equality). ✓
- **#5 module/import** — the only item is the LOW `import { Input }` nit above; all value vs type imports are otherwise correct. ✓ (with LOW note)
- **#8 test quality** — no `as any`, no `dist/` imports, every test has a meaningful concrete assertion. ✓
- **CLAUDE.md pure core** — `stepZap`/`startLevel`/`startGame` contain no DOM/`window`/`canvas`, no `Date.now`/`Math.random`/`rAF`, no `shell/` import; mutation is confined to the `cloneState` copy; targeting is RNG-free and deterministic. ✓

### Devil's Advocate

Assume this is broken. First suspicion: ordering. `stepZap` runs *before* `resolvePlayerHits`, so a full blast clears the board in the same frame an enemy would have grabbed the Claw — meaning a well-timed zap cancels an incoming death. Is that a bug? No — that is precisely the arcade Superzapper's purpose (a panic button that saves you), so the ordering is a feature, not a flaw. Second: the asymmetry on an empty board — a `full` zap with no targets is consumed to `used-once`, but a `used-once` zap with no targets is NOT consumed. A player mashing the key on a momentarily empty lane field could "waste" their full blast yet keep the weak shot — mildly surprising, but harmless and matches the documented model; no correctness impact. Third: determinism on ties. When two enemies share the max depth, the lowest array index dies; array order is invisible to the player, so "which of two equidistant enemies vaporises" is effectively arbitrary from the seat — acceptable, and it keeps the core deterministic for replay. Fourth: cloning. `cloneState` shallow-spreads `player`; `superzapper` is a string primitive, so the copy is safe today — but if a future story makes the Superzapper an object (e.g., a timer), the shallow spread would alias it across frames and silently break purity. Worth a comment, but out of scope here. Fifth: scoring overflow into extra lives — a full blast that crosses several 10k thresholds at once: `awardScore` uses a floor-division *difference*, so it correctly grants multiple lives in one call; not a bug. Sixth: a confused user pressing zap during the warp or while dying gets nothing, because `stepZap` only runs in `'playing'`; that may feel unresponsive but is correct (no enemies to clear mid-warp). Nothing here rises above LOW. The implementation withstands the assault.

### Hard questions
- **Null/empty inputs:** empty `enemies` handled (guarded, no `scoreFor(undefined)`); dead player handled (early return). ✓
- **Huge inputs:** a board of N enemies → O(N) blast, O(N) target scan; no pathological cost. ✓
- **Race conditions / timeouts:** N/A — synchronous pure function, no async, no `dt` dependence in `stepZap`. ✓
- **Wiring:** `stepZap` is reachable from the live loop (`stepGame` `'playing'`, `sim.ts:334`). Binding the physical zap key is a shell concern, correctly out of this core-only story's scope. ✓

**Handoff:** To SM (Colonel Hogan) for finish-story.

## Delivery Findings

Agents record upstream observations discovered during their phase.
Each finding is one list item. Use "No upstream findings" if none.

**Types:** Gap, Conflict, Question, Improvement
**Urgency:** blocking, non-blocking

<!-- Agents: append findings below this line. Do not edit other agents' entries. -->

### TEA (test design)
- **Improvement** (non-blocking): The Wave 4 plan's Task 1 reference test (`docs/superpowers/plans/2026-06-25-tempest-wave-4-superzapper-and-framing.md`, ~lines 155–180) chains a second/third `stepGame(s, ZAP)` after a full blast on a board with `spawn.remaining = 0`. The full blast empties the board, so `checkLevelClear` flips `mode` to `'warp'` in the **same** step — the chained zaps then execute in the `'warp'` branch, where `stepZap` never fires. Those reference tests would therefore pass without ever exercising the weak-shot / spent paths. Affects `docs/superpowers/plans/2026-06-25-tempest-wave-4-superzapper-and-framing.md` (reference test should reset `mode`/repopulate enemies, or keep `spawn.remaining > 0`). The delivered suite avoids this by setting up each state transition in isolation. *Found by TEA during test design.*

### Dev (implementation)
- **Improvement** (non-blocking): `Input.zap` was documented `// superzapper (reserved for Wave 4)`. This story makes it live, so the comment was corrected to describe it as the activation edge. Affects `src/core/input.ts` (already updated this story — noted so the comment-analyzer reviewer sees it was intentional). *Found by Dev during implementation.*
- No other upstream findings during implementation.

### Reviewer (code review)
- **Improvement** (non-blocking): `tests/core/sim.superzapper.test.ts:33` uses `import { Input }` for a type-only interface where story 3-7 set the direction toward `import type { Input }`. Affects `tests/core/sim.superzapper.test.ts` (change to `import type { Input }` for internal consistency — the adjacent line already does this for `GameState`/`Enemy`). Currently matches the majority (17/19 test files) and is not a compile error, so it is a future-sweep item, not a blocker. *Found by Reviewer during code review.*
- **Improvement** (non-blocking): `stepZap`'s empty-board and non-`'playing'`-mode branches are unexercised by tests (full-on-empty consumes the charge; weak-on-empty does not; zap is ignored mid-warp/dying). Affects `tests/core/sim.superzapper.test.ts` (add guard tests if these edges are deemed worth pinning). Low-risk defensive paths. *Found by Reviewer during code review.*

## Impact Summary

**Upstream Effects:** 1 findings (0 Gap, 0 Conflict, 0 Question, 1 Improvement)
**Blocking:** None

- **Improvement:** `Input.zap` was documented `// superzapper (reserved for Wave 4)`. This story makes it live, so the comment was corrected to describe it as the activation edge. Affects `src/core/input.ts`.

### Downstream Effects

- **`src/core`** — 1 finding

### Deviation Justifications

1 deviation

- **Isolated each Superzapper state transition instead of chaining zaps on a cleared board**
  - Rationale: the no-split rule and the no-mutation/determinism rules are load-bearing core invariants (CLAUDE.md) the reference omitted; tie-break and weak-shot scoring are unguarded behaviors in `stepZap`
  - Severity: minor
  - Forward impact: none — strictly additional guards on the specified behavior.

## Design Deviations

Agents log spec deviations as they happen — not after the fact.
Each entry: what was changed, what the spec said, and why.

<!-- Agents: append deviations below this line. Do not edit other agents' entries. -->

### TEA (test design)
- **Isolated each Superzapper state transition instead of chaining zaps on a cleared board**
  - Spec source: docs/superpowers/plans/2026-06-25-tempest-wave-4-superzapper-and-framing.md, Task 1 Step 1 (reference test)
  - Spec text: reference test chains `s = stepGame(s, ZAP)` (full blast), then manually repopulates `s.enemies` and zaps again to exercise the weak-shot and spent paths
  - Implementation: each transition is constructed directly (`s.player.superzapper = 'used-once' | 'spent'`, `s.mode = 'playing'`, fresh enemies) and asserted in isolation; the one chained progression test explicitly resets `mode` to `'playing'` between zaps
  - Rationale: a full blast on a `spawn.remaining === 0` board auto-enters the warp the same step (`checkLevelClear`), so the reference's chained zaps would run in the `'warp'` branch and never fire — passing for the wrong reason. Isolation makes each transition a true, order-independent assertion.
  - Severity: minor
  - Forward impact: none — Dev implements the same `stepZap` semantics described in the plan; only the test setup differs.
- **Added coverage beyond the reference test** (no spec conflict, recorded for transparency)
  - Spec source: same plan, Task 1
  - Spec text: reference covers full blast, weak shot (nearest rim), spent no-op, per-level reset, dead player
  - Implementation: added tests for (a) the full blast NOT splitting a tanker, (b) weak-shot tie-break = lowest index, (c) weak-shot score award, (d) no-mutation of the input state, (e) determinism of identical zaps, (f) neutral step preserving the charge
  - Rationale: the no-split rule and the no-mutation/determinism rules are load-bearing core invariants (CLAUDE.md) the reference omitted; tie-break and weak-shot scoring are unguarded behaviors in `stepZap`
  - Severity: minor
  - Forward impact: none — strictly additional guards on the specified behavior.

### Dev (implementation)
- No deviations from spec. Implemented exactly the `stepZap` semantics from the plan's Task 1 (full → vaporise-all-no-split → used-once; used-once → one nearest-rim, ties → lowest index → spent; spent/dead/empty → guarded no-op) plus the `startLevel` rearm. `stepZap` is wired immediately after `stepFiring` in the `'playing'` branch (grouping the player's per-frame input actions); the plan left the exact position open, and all 13 TEA tests pass with this placement.

### Reviewer (audit)
- **TEA: Isolated each Superzapper state transition** → ✓ ACCEPTED by Reviewer: the auto-warp trap is real (I verified `checkLevelClear` at `sim.ts:251` flips to `'warp'` the same step a blast empties a `spawn.remaining === 0` board). Isolating each transition makes the tests assert the right thing for the right reason; agrees with author reasoning.
- **TEA: Added coverage beyond the reference test** → ✓ ACCEPTED by Reviewer: the no-split, no-mutation, and determinism guards protect load-bearing CLAUDE.md core invariants the reference omitted. Strictly additive; sound.
- **Dev: No deviations / `stepZap` placed after `stepFiring`** → ✓ ACCEPTED by Reviewer: placement is correct. Running before `resolvePlayerHits` makes the blast cancel an incoming grab — the intended arcade "panic button" behavior — and the plan left the position open. Implementation matches the documented semantics exactly.
- No undocumented spec deviations found. The implementation tracks the plan's Task 1 and the story title precisely.