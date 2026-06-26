---
story_id: "3-6"
jira_key: ""
epic: "3"
workflow: "tdd"
---
# Story 3-6: Resolve post-warp-death re-warp loop on persisted spikes

## Story Details
- **ID:** 3-6
- **Jira Key:** (none)
- **Type:** bug
- **Points:** 2
- **Priority:** p1
- **Workflow:** tdd
- **Stack Parent:** none

## Context Summary

This is a follow-up from Story 3-3 (spike↔Claw warp collision). The issue: after a warp crash and respawn, the player re-enters 'playing' mode, but `checkLevelClear` immediately re-triggers the warp again because the level was already cleared. Any spike still on the player's lane will re-crash during respawn, creating a loop that drains all lives with neutral input.

**Affected code:** `src/core/sim.ts` (respawn / checkLevelClear / stepWarp / advanceLevel)

**Acceptance Criteria:**
1. Decide the resolution: complete the level transition on warp-death respawn, OR clear/skip the killing spike, OR grant brief post-respawn invulnerability — document the choice.
2. After a warp-death respawn, the player is NOT instantly re-killed by the same persisted spike with neutral input.
3. A genuinely surviving warp (no spike on the player's lane) still advances to the next geometry exactly as today.
4. Deterministic and pure-core (no DOM/time/random); covered by tests.

## Workflow Tracking
**Workflow:** tdd
**Phase:** finish
**Phase Started:** 2026-06-26T01:44:43Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-06-26T01:21:25Z | 2026-06-26T01:22:59Z | 1m 34s |
| red | 2026-06-26T01:22:59Z | 2026-06-26T01:30:32Z | 7m 33s |
| green | 2026-06-26T01:30:32Z | 2026-06-26T01:34:23Z | 3m 51s |
| review | 2026-06-26T01:34:23Z | 2026-06-26T01:44:43Z | 10m 20s |
| finish | 2026-06-26T01:44:43Z | - | - |
| red | - | 2026-06-26T01:30:32Z | unknown |
| green | 2026-06-26T01:30:32Z | 2026-06-26T01:34:23Z | 3m 51s |
| review | 2026-06-26T01:34:23Z | 2026-06-26T01:44:43Z | 10m 20s |
| finish | 2026-06-26T01:44:43Z | - | - |
| green | - | 2026-06-26T01:34:23Z | unknown |
| review | 2026-06-26T01:34:23Z | 2026-06-26T01:44:43Z | 10m 20s |
| finish | 2026-06-26T01:44:43Z | - | - |
| review | - | 2026-06-26T01:44:43Z | unknown |
| finish | 2026-06-26T01:44:43Z | - | - |
| finish | - | - | - |

## Technical Approach

The resolution strategy will be determined during the RED phase (TEA) after analyzing the 3-3 session notes. Key decision points:

1. **Option A:** Advance the level immediately on respawn after warp death (skip the second warp entry via an `inWarpDeathRespawn` flag or similar state).
2. **Option B:** Clear the specific spike that killed the player, letting the warp complete without re-crash.
3. **Option C:** Grant 1-2 frames of post-respawn invulnerability to exit the spike lane safely.

Each option must preserve:
- Determinism (no time-based state)
- Pure-core purity (no DOM/random)
- Warp state machine correctness (warp.progress must complete)
- Regression-free behavior for non-spike warp cases

## Sm Assessment

**Setup complete — routing to RED (TEA / Major Hochstetter).**

- **Scope is well-bounded:** a 2-pt p1 bug confined to `src/core/sim.ts` (respawn / checkLevelClear / stepWarp / advanceLevel). Pure-core, so it's fully testable — no DOM/render involvement. This is exactly the kind of deterministic loop bug TDD nails cleanly.
- **The decision is the work, not the code.** AC #1 demands a *documented choice* among the three options (A: advance level on warp-death respawn; B: clear the killing spike; C: brief post-respawn invulnerability). TEA should read `sprint/archive/3-3-session.md` Delivery Findings first, because 3-3 is where this loop was discovered and the original intent was deferred. Don't invent a fourth option without reason.
- **Recommended steer (TEA's call to confirm):** Option A reads as most faithful to the design — a warp that was already cleared shouldn't re-arm itself on respawn. But B and C are legitimate; the failing test should pin whichever behavior is chosen.
- **Regression guard is mandatory:** AC #3 — a genuinely surviving warp (no spike on the player's lane) must still advance to the next geometry exactly as today. The test suite needs both the loop-broken case AND the clean-warp case so we don't trade one bug for another.
- **No Jira key** (standalone sprint story) — claim step skipped, not forgotten.
- **Branching:** feature branch `feat/3-6-post-warp-death-rewarp-loop` cut from `develop` per this repo's gitflow (not trunk-based off main, despite CLAUDE.md).

Handing off. Fellas, the tunnel's dug — Major, your move.

## TEA Assessment

**Tests Required:** Yes
**Reason:** Pure-core deterministic logic bug — exactly what TDD pins. No chore bypass.

**Test Files:**
- `tests/core/sim.warp-death-respawn.test.ts` — 10 tests: 5 RED (pin the fix), 5 regression guards.

**Tests Written:** 10 tests covering all 4 ACs
**Status:** RED (5 failing — verified by testing-runner, run id `3-6-tea-red`)

### The Decision (AC #1 — documented)

I pinned the **observable faithful outcome**, NOT a mechanism: *after a warp-death respawn, the level transition completes (the next geometry loads, the persisted killing spike is gone) and exactly ONE life is spent — no neutral-input drain loop.*

This outcome is satisfied by all three candidate resolutions, so the tests do not force Dev's hand on HOW:
- **A** — complete the level transition on the warp-death respawn (SM's recommendation; I concur it's the most faithful read — a cleared level should not re-arm its warp);
- **B** — clear/skip the killing spike so the re-warp finishes;
- **C** — brief post-respawn invulnerability so the re-warp passes the spike.

All three converge on `level === prev+1`, `lives === START_LIVES − 1`, `mode === 'playing'`, spikes cleared. The suite asserts that convergence and the *absence* of the drain loop, leaving the mechanism to Dev. **Sergeant Carter: A is recommended and lowest-risk; if you choose B/C, the same tests still hold.**

### RED tests (must go green)
1. `does NOT drain all lives with neutral input after a warp-death respawn` — today: drains to `gameover`.
2. `completes the level transition on the warp-death respawn (next geometry loads, spike cleared)` — today: stuck at level 1.
3. `resolves cleanly even with stale spikes on other lanes` — today: stuck at level 1.
4. `resolves the loop end-to-end through the real level-clear path` — today: `gameover` (this is the reported bug via the public surface).
5. `does not mutate its input on the resolving step and replays purely` — today: never reaches level 2.

### Regression guards (must STAY green)
- `a surviving warp still advances to the next geometry with no life lost` (AC3)
- `still lets the player dodge a warp spike by steering off the lane` (AC3)
- `a normal mid-level death respawn resumes the same level (does not advance)` — **critical:** guards against a sloppy "advance on every respawn" fix.
- `a warp crash on the last life goes to gameover and never advances the level` — guards against resurrection-by-advance.
- `is deterministic across identical runs` (AC4)

### Rule Coverage

| Rule (typescript.md) | Test(s) | Status |
|------|---------|--------|
| #4 null/undefined, deterministic outcome | `is deterministic across identical runs` | RED-suite passing guard |
| #8 test quality (no vacuous assertions) | self-check — every test asserts mode/level/lives/alive | done |
| #5 `import type` for type-only imports | file uses `import type { GameState }` / `import type { Input }` (clears 3-3 Reviewer nit) | done |
| Architectural boundary (pure/deterministic core) | `does not mutate its input on the resolving step and replays purely` | RED |

**Rules checked:** Behavioral/test-quality rules applicable to a pure-core test suite. Most of the 13 TS checks target Dev's implementation diff (`as any`, `??` vs `||`, exhaustiveness) — flagged here for Dev's GREEN-phase self-review.
**Self-check:** 0 vacuous assertions found. Every test asserts a meaningful observable (mode/level/lives/alive/spikes), and the determinism test compares full state via `toEqual`.

**Handoff:** To Dev (Sergeant Carter) for GREEN.

## Dev Assessment

**Implementation Complete:** Yes
**Mechanism chosen (AC #1):** **Option A — complete the level transition on the warp-death respawn.** Per TEA's recommendation and SM's steer.

**Files Changed:**
- `src/core/sim.ts` — `respawn()`: a death with `warp.progress > 0` is a warp crash (the only path to `'dying'` with a non-zero progress; normal play keeps it `0`). Instead of returning to `'playing'` (which would re-enter the already-cleared warp and let the persisted spike re-crash), it calls `advanceLevel()`, which loads the next geometry, resets the spike array, and resumes play — exactly one life spent. Normal mid-level deaths (`progress === 0`) keep the original rim-clear + resume-play behavior.

**Why no new state field:** TEA's Option A hint mentioned "an `inWarpDeathRespawn` flag or similar state." I used the existing invariant `warp.progress > 0 ⟺ warp crash` as the discriminator — no new `GameState` field, no changes to `initialState`/`cloneState`. The invariant holds because the only two `killPlayer` call sites are `resolvePlayerHits` (during `'playing'`, progress 0) and `resolveWarpSpikeHit` (during `'warp'`, progress > 0), and `killPlayer` never touches progress. (Logged as a minor deviation.)

**Tests:** 136/136 passing (GREEN) — the 10-test 3-6 suite all green, zero pre-existing regressions. `npx tsc --noEmit` clean. Verified by testing-runner, run id `3-6-dev-green`.

**Diff size:** +12 / −1 in one function. Minimal.

**Handoff:** To Reviewer (General Burkhalter) for review.

## Subagent Results

| # | Specialist | Received | Status | Findings | Decision |
|---|-----------|----------|--------|----------|----------|
| 1 | reviewer-preflight | Yes | clean | none | N/A — 136/136 tests green, tsc clean, no lint script, 0 code smells |
| 2 | reviewer-edge-hunter | No | Skipped | disabled | Disabled via settings — boundary analysis done by Reviewer (see [EDGE]) |
| 3 | reviewer-silent-failure-hunter | No | Skipped | disabled | Disabled via settings — silent-failure analysis done by Reviewer (see [SILENT]) |
| 4 | reviewer-test-analyzer | No | Skipped | disabled | Disabled via settings — test-quality analysis done by Reviewer + rule-checker #8 (see [TEST]) |
| 5 | reviewer-comment-analyzer | No | Skipped | disabled | Disabled via settings — comment analysis done by Reviewer (see [DOC]) |
| 6 | reviewer-type-design | No | Skipped | disabled | Disabled via settings — type analysis done by Reviewer + rule-checker (see [TYPE]) |
| 7 | reviewer-security | No | Skipped | disabled | Disabled via settings — security analysis done by Reviewer (see [SEC]) |
| 8 | reviewer-simplifier | No | Skipped | disabled | Disabled via settings — simplicity analysis done by Reviewer (see [SIMPLE]) |
| 9 | reviewer-rule-checker | Yes | clean | none (17 rules, 34 instances, 0 violations) | N/A — all TS checklist + CLAUDE.md boundary rules pass (see [RULE]) |

**All received:** Yes (2 enabled returned clean; 7 disabled via `workflow.reviewer_subagents`, their domains assessed directly by the Reviewer below)
**Total findings:** 0 confirmed, 0 dismissed, 1 deferred (TEA's Wave 5 render/audio polish note — out of scope)

## Reviewer Assessment

**Verdict:** APPROVED

A 12-line guard in one pure function, backed by a 10-test suite, fixing the exact life-drain loop that 3-3's Reviewer/TEA/Dev all flagged. I traced it myself and deployed every enabled specialist. It holds.

**Data flow traced:** warp crash → `resolveWarpSpikeHit` (sim.ts:284) calls `killPlayer` while `warp.progress > 0` → `mode='dying'` (sim.ts:200), progress untouched → `dying` case decrements `respawnTimer` only (sim.ts:316-318) → `respawn` reads `warp.progress > 0` (sim.ts:224) → `advanceLevel` loads next geometry, resets `spikes`/`progress`, sets `mode='playing'`. The persisted spike that drove the loop is wiped by `advanceLevel`'s `s.spikes = new Array(...).fill(0)` (sim.ts:255). Exactly one life is spent. Safe.

**Pattern observed:** Discriminating a sub-case by an existing state invariant rather than adding a new field (`respawn` at sim.ts:215-231). Minimalist and correct here — but it leans on a non-local invariant, so the explanatory comment (sim.ts:218-223) is load-bearing, not decorative. Good that the Dev wrote it.

**Error handling:** Pure simulation, no I/O, no exceptions. The relevant "failure" surface is state-machine misrouting; the early `return` at sim.ts:226 correctly skips the rim-clear + `mode='playing'` tail because `advanceLevel` supplies both — verified, not assumed.

### Observations (≥5)

- **[VERIFIED] The discriminator invariant `warp.progress > 0 ⟺ warp crash` is airtight at respawn time.** Evidence: `warp.progress` is incremented ONLY at sim.ts:293 (`stepWarp`, warp mode) and reset to 0 at sim.ts:243 (`startGame`), :253 (`checkLevelClear`/warp entry), :266 (`advanceLevel`). The only `mode='dying'` setter is `killPlayer` (sim.ts:200), reached from `resolvePlayerHits` (sim.ts:212, playing mode → progress 0) and `resolveWarpSpikeHit` (sim.ts:284, warp mode → progress ≥ 0.25 since increment precedes the spike check). The `dying` case touches only `respawnTimer`. Therefore at sim.ts:224 the sign of `warp.progress` exactly distinguishes the two death origins. Complies with CLAUDE.md purity (no time/random/DOM).
- **[VERIFIED] No "die on the last enemy that also clears the level" false-positive.** Evidence: in the `playing` step order (sim.ts:298-307), `resolvePlayerHits` runs before `checkLevelClear`, and `checkLevelClear` early-returns when `mode !== 'playing'` (sim.ts:251). So a death that also empties the board leaves `progress === 0` → normal respawn → clean warp entry next frame. No spurious level-skip. This is the subtle case a naive fix would break; it does not.
- **[EDGE] (self, subagent disabled) Boundary on the last life — no resurrection-by-advance.** A warp crash with `lives === 1` routes to `gameover` (sim.ts:197-198), not `dying`, so `respawn`/`advanceLevel` never runs and the level cannot advance. Verified by test `a warp crash on the last life goes to gameover and never advances the level` (test:176-186), which also pins gameover stickiness over 120 further frames. Float boundary: crash requires `progress ≥ 1 − SPIKE_MAX_DEPTH = 0.25`, comfortably clear of the `> 0` threshold; normal play is exactly `0`. No precision ambiguity.
- **[SILENT] (self, subagent disabled) No swallowed state / silent fallback.** The early `return` (sim.ts:226) is not an error-swallow; both skipped tail statements are re-established by `advanceLevel`. `s.enemies` is provably `[]` entering warp (`checkLevelClear` requires `enemies.length === 0`), so bypassing the rim-clear filter drops nothing. Nothing fails quietly.
- **[TEST] (self + rule-checker #8) Test suite is non-vacuous and covers both polarities.** 10 tests, every assertion falsifiable (mode/level/lives/alive/spikes/`toEqual`). Bug-fix cases AND regression guards (clean warp, dodge, normal-death-no-advance, last-life-gameover, determinism, purity). The `runUntilResolved` helper exits the instant `level` leaves 1, so next-level enemy descent can't pollute the life count — a deliberate, correct guard.
- **[DOC] (self, subagent disabled) Comment is accurate and load-bearing.** sim.ts:218-223 correctly states the invariant and the rationale; it matches the code. No stale/misleading docs introduced. Given the fix relies on a non-local invariant, this comment is required, not optional — present and correct.
- **[TYPE] (self + rule-checker) No type-safety erosion.** No `as any`, no non-null assertions, no `||`-vs-`??` footgun. `import type { GameState }`/`import type { Input }` correctly split from runtime imports (clears the 3-3 nit). `opts.playerLane ?? 4` correctly preserves lane 0.
- **[SEC] (self, subagent disabled) No security surface.** Pure core logic, no I/O, no deserialization, no user-input parsing, no secrets. N/A by construction.
- **[SIMPLE] (self, subagent disabled) Minimal, no over-engineering.** +12/−1 in one function; reuses `advanceLevel` rather than duplicating geometry/spike reset. No dead code, no new abstractions, no new state field. This is the smallest correct change.
- **[RULE] rule-checker clean.** 17 rules (13 TS checklist + 4 CLAUDE.md architectural-boundary), 34 instances, 0 violations. Architectural purity boundary explicitly re-verified across the diff.

### Rule Compliance

| Rule source | Applies to diff? | Verdict |
|-------------|------------------|---------|
| CLAUDE.md — core/ never imports shell/ | Yes (sim.ts) | ✓ all imports are core/ (rule-checker A) |
| CLAUDE.md — no DOM/window/document/canvas | Yes | ✓ `advanceLevel` mutates only GameState (rule-checker B) |
| CLAUDE.md — no Date/perf/Math.random/rAF; time via dt, rng seeded | Yes | ✓ no nondeterministic calls; `DT=1/60` literal in tests (rule-checker C) |
| CLAUDE.md — tube-space {laneIndex, depth}, not screen space | Yes | ✓ `wrapLane`/depth-unit spikes only (rule-checker D) |
| TS #4 — `??` not `||` on 0-valid values | Yes (tests) | ✓ `playerLane ?? 4`, explicit `lives !== undefined` guard |
| TS #5 — `import type` for type-only imports | Yes (tests) | ✓ GameState/Input split correctly |
| TS #8 — meaningful test assertions | Yes (tests) | ✓ no vacuous assertions; both polarities covered |
| TS #1/#2/#3/#7/#10/#11/#12 | Mostly N/A | ✓ no escapes/enums/async/IO introduced |

### Devil's Advocate

Let me try to break it. **Attack 1 — exploit the level-skip.** A crash advances the level, so could a player farm spikes to skip hard levels for free? No: you advance only by losing a life, and a clean warp would have advanced anyway. `advanceLevel` awards no points and the spike is wiped, so there is no score or progression exploit — you strictly pay a life for the same advance. **Attack 2 — stale `warp.progress` poisoning a later normal death.** Could progress stay non-zero into a future mid-level death and wrongly advance the level? No: `advanceLevel` (sim.ts:266) and `checkLevelClear` (sim.ts:253) both reset progress to 0 before play resumes, and the `playing` path never increments it. Every normal death therefore sees progress exactly 0. The regression test at test:157-172 nails this. **Attack 3 — enemies carried into the new level.** `advanceLevel` does not clear `s.enemies`. If warp could be entered with live enemies, they'd leak into level N+1 at stale depths. But `checkLevelClear` (the sole warp trigger) requires `enemies.length === 0`, so the array is provably empty — no leak. **Attack 4 — confused player / UX.** A player who crashes on a spike still "arrives" at the next level, which may feel like getting away with it; but this matches arcade Tempest (you proceed down the tube after a spike death) and, more importantly, the design doc is silent, so it is a defensible interpretation, now ratified (below). **Attack 5 — float threshold.** Could a microscopic positive progress from some other path trip the guard? The only writer of a positive value is the warp increment; all other writes are the literal `0`. No drift path exists. **Attack 6 — determinism.** The branch introduces no `Date`/`Math.random`; identical inputs yield identical output, proven by the determinism and purity tests. I cannot break it. The fix is correct, minimal, and faithful.

**Handoff:** To SM (Colonel Hogan) for finish-story.

## Delivery Findings

See `sprint/archive/3-3-session.md` (Delivery Findings from Reviewer/TEA/Dev) for context on the spike collision bug and post-warp behavior.

<!-- Agents: append findings below this line. Do not edit other agents' entries. -->

### TEA (test design)
- **Question** (non-blocking): The north-star design doc is silent on what happens *after* a warp-death respawn (it specifies the crash itself, not the recovery). The tests therefore pin an *inferred* faithful outcome (transition completes + one life spent). Reviewer should ratify the chosen mechanism against design intent — favor Option A (advance-on-respawn). Affects `src/core/sim.ts` (`respawn`/`stepWarp`/`checkLevelClear`/`advanceLevel`). *Found by TEA during test design.*
- **Improvement** (non-blocking): Still no distinct render/audio signal for a warp crash vs a normal death (carried from 3-3 TEA finding). Out of scope here; worth a Wave 5 polish note. Affects `src/shell/render.ts` / audio. *Found by TEA during test design.*

### Dev (implementation)
- No upstream findings during implementation. The fix landed cleanly within the affected function; TEA's Question (design-doc silence on post-warp-death behavior) is resolved by choosing Option A and is flagged for Reviewer ratification.

### Reviewer (code review)
- **Resolved** (non-blocking): TEA's Question is hereby ratified — the post-warp-death resolution is **Option A (complete the level transition on respawn)**. This is faithful to arcade Tempest (the player proceeds down the tube after a spike death during the descent) and is the minimal correct fix. No code change required; recording the design ratification for the record. Affects `src/core/sim.ts` (`respawn`). *Found by Reviewer during code review.*
- **Improvement** (non-blocking): Re-confirm TEA's carried note — a warp crash is still observationally identical to a normal death in the core; Wave 5 polish should add a distinct SFX/visual. Out of scope here. Affects `src/shell/render.ts` / audio. *Found by Reviewer during code review.*

## Impact Summary

**Upstream Effects:** 1 findings (0 Gap, 0 Conflict, 1 Question, 0 Improvement)
**Blocking:** None

- **Question:** The north-star design doc is silent on what happens *after* a warp-death respawn (it specifies the crash itself, not the recovery). The tests therefore pin an *inferred* faithful outcome (transition completes + one life spent). Reviewer should ratify the chosen mechanism against design intent — favor Option A (advance-on-respawn). Affects `src/core/sim.ts`.

### Downstream Effects

- **`src/core`** — 1 finding

### Deviation Justifications

2 deviations

- **Pinned the observable outcome, not a single mechanism**
  - Rationale: All three options converge on the same observable contract; pinning the outcome keeps the suite robust to Dev's implementation choice while still fully enforcing the AC. Mechanism A (advance-on-respawn) is recommended and noted for the Reviewer to ratify.
  - Severity: minor
  - Forward impact: Dev may implement A, B, or C; Reviewer should confirm the chosen mechanism matches design intent.
- **Used existing `warp.progress` invariant as the warp-crash discriminator instead of a new flag**
  - Rationale: The hint allowed "or similar state." Reusing the existing invariant is strictly simpler — no new field, no `initialState`/`cloneState` changes — and the invariant is guaranteed by the two `killPlayer` call sites (`resolvePlayerHits` at progress 0, `resolveWarpSpikeHit` at progress > 0). Minimalist discipline: the simplest code that passes the tests.
  - Severity: minor
  - Forward impact: none — purely internal to `respawn()`; observable behavior matches the pinned ACs.

## Design Deviations

<!-- Agents: append deviations below this line. Do not edit other agents' entries. -->

### TEA (test design)
- **Pinned the observable outcome, not a single mechanism**
  - Spec source: context-story-3-6.md, AC-1
  - Spec text: "Decide the resolution: complete the level transition on warp-death respawn, OR clear/skip the killing spike, OR grant brief post-respawn invulnerability — document the choice."
  - Implementation: Tests assert the shared observable end state (next geometry loads, persisted spike cleared, exactly one life lost, no drain loop) rather than coupling to one of the three named mechanisms.
  - Rationale: All three options converge on the same observable contract; pinning the outcome keeps the suite robust to Dev's implementation choice while still fully enforcing the AC. Mechanism A (advance-on-respawn) is recommended and noted for the Reviewer to ratify.
  - Severity: minor
  - Forward impact: Dev may implement A, B, or C; Reviewer should confirm the chosen mechanism matches design intent.

### Dev (implementation)
- **Used existing `warp.progress` invariant as the warp-crash discriminator instead of a new flag**
  - Spec source: .session/3-6-session.md, Technical Approach, Option A
  - Spec text: "Advance the level immediately on respawn after warp death (skip the second warp entry via an `inWarpDeathRespawn` flag or similar state)."
  - Implementation: No new `GameState` field added. `respawn()` branches on the existing invariant `warp.progress > 0 ⟺ death occurred mid-warp` (normal play always has `progress === 0`).
  - Rationale: The hint allowed "or similar state." Reusing the existing invariant is strictly simpler — no new field, no `initialState`/`cloneState` changes — and the invariant is guaranteed by the two `killPlayer` call sites (`resolvePlayerHits` at progress 0, `resolveWarpSpikeHit` at progress > 0). Minimalist discipline: the simplest code that passes the tests.
  - Severity: minor
  - Forward impact: none — purely internal to `respawn()`; observable behavior matches the pinned ACs.

### Reviewer (audit)
- **TEA — Pinned the observable outcome, not a single mechanism** → ✓ ACCEPTED by Reviewer: sound. Mechanism-agnostic tests fully enforce AC #1's allowed options; the chosen mechanism (A) is ratified in Delivery Findings. No coupling to implementation, no coverage gap.
- **Dev — Used existing `warp.progress` invariant instead of a new flag** → ✓ ACCEPTED by Reviewer: the hint explicitly allowed "or similar state," and reusing the invariant is strictly simpler. I independently verified the invariant is airtight (see [VERIFIED] observations: only writer of a positive `warp.progress` is the warp increment; all other writes are literal 0; the two `killPlayer` sites partition cleanly by mode). The load-bearing comment (sim.ts:218-223) adequately documents the non-local reasoning.
- No undocumented deviations found. The diff matches the ACs and the logged decisions; nothing slipped through.