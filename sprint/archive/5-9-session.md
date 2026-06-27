---
story_id: "5-9"
jira_key: ""
epic: "5"
workflow: "tdd"
---
# Story 5-9: Robustify loop callbacks and select-spin input edges

## Story Details
- **ID:** 5-9
- **Jira Key:** (none — Jira integration not enabled)
- **Workflow:** tdd
- **Stack Parent:** none
- **Points:** 1
- **Priority:** p3

## Workflow Tracking
**Workflow:** tdd
**Phase:** finish
**Phase Started:** 2026-06-27T10:26:24Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-06-27T10:09:49Z | 2026-06-27T10:10:57Z | 1m 8s |
| red | 2026-06-27T10:10:57Z | 2026-06-27T10:16:25Z | 5m 28s |
| green | 2026-06-27T10:16:25Z | 2026-06-27T10:20:32Z | 4m 7s |
| review | 2026-06-27T10:20:32Z | 2026-06-27T10:26:24Z | 5m 52s |
| finish | 2026-06-27T10:26:24Z | - | - |

## Acceptance Criteria

1. A throwing onModeChange (or draw) callback does not halt the loop — the RAF chain survives; covered by a loop test that registers a throwing callback.
2. The select-mode handler ignores non-finite input.spin (no selectedLevel poisoning); covered by a core sim test.
3. The dead s.spikes[2]=0.5 line is removed; full suite and typecheck stay clean.

## Technical Approach

### Part 1: Unguarded callback invocations in src/shell/loop.ts
The current loop implementation invokes onModeChange, draw, and sampleInput callbacks without error handling. If any callback throws, the requestAnimationFrame chain dies and the game silently halts. Now that story 4-6 registers a real onModeChange callback (save-on-commit), this is a real risk.

**Fix:** Wrap callback invocations in try/catch to ensure an error in one callback does not stop the loop. The catch should log the error and allow the next frame to proceed. Add a test in tests/shell/loop.test.ts that registers a throwing callback and verifies the loop continues.

### Part 2: Non-finite input.spin in src/core/sim.ts
In the select-mode handler, input.spin is not finite-guarded. A NaN spin passes the `!== 0` check and poisons selectedLevel via `Math.sign(NaN)` (which returns NaN). This can corrupt game state.

**Fix:** Guard non-finite spin before using it. Add a test in tests/core/sim.select.test.ts (or inline) that passes NaN and verifies the handler skips the select.

### Part 3: Dead test line in tests/core/sim.death.test.ts
Remove the line `s.spikes[2]=0.5` at line ~XX (the assertion that used it has already been removed).

## Delivery Findings

- No upstream findings.

### TEA (test design)
- **Improvement** (non-blocking): The `stepHighScore` initials-entry handler in
  `src/core/sim.ts` has the SAME non-finite-spin latent bug as the select handler
  this story fixes. Line ~61 gates on `input.spin !== 0`, then `cycleLetter` calls
  `Math.sign(input.spin)`; a NaN spin flows through `String.fromCharCode(65 + NaN)`
  → `String.fromCharCode(NaN)` → the NUL character `'\x00'`, corrupting the entered
  initials. Affects `src/core/sim.ts` (`stepHighScore` / `cycleLetter` need the same
  `Number.isFinite` guard the select handler gets here). OUT OF SCOPE for 5-9 (the
  AC names the select handler only) — no test added; recorded for a future story.
  *Found by TEA during test design.*

### Dev (implementation)
- No upstream findings during implementation.

### Reviewer (code review)
- **Improvement** (non-blocking): A callback that throws *every* frame (e.g.
  permanently-disabled localStorage, a lost canvas context) makes `runGuarded`
  emit `console.error` ~60×/sec — a log flood. Correct trade-off for this story
  (a flooded console beats a frozen game), but a future polish could rate-limit or
  de-duplicate the per-frame error log. Affects `src/shell/loop.ts` (`runGuarded` /
  the sampleInput catch). *Found by Reviewer during code review.*
- **Improvement** (non-blocking): Pre-existing test nits surfaced by the rule-checker
  but NOT introduced by 5-9: `tests/core/sim.death.test.ts:79-80` uses `s.mode as
  string` casts (defeats typo detection) and line 80's `.not.toBe('playing')` is
  vacuous once line 79 asserts `'attract'`. Out of scope here (4-2 code); recorded
  for a future test-hygiene pass. *Found by Reviewer during code review.*

## Design Deviations

### TEA (test design)
- **"non-finite" interpreted as {NaN, +Infinity, -Infinity}, not NaN alone**
  - Spec source: context-story-5-9.md, AC-2 / story description
  - Spec text: "the select-mode handler ignores non-finite input.spin (no
    selectedLevel poisoning)" — the description's worked example cites only NaN
    ("a NaN spin passes the !== 0 check and poisons selectedLevel via Math.sign(NaN)")
  - Implementation: Tests assert NaN, +Infinity, AND -Infinity are all ignored.
    NaN poisons selectedLevel to NaN; ±Infinity pass `Math.sign` as ±1 and silently
    STEP the level — both are invalid spinner deltas. This forces Dev's guard to be
    `Number.isFinite(input.spin)`, not a narrower `!Number.isNaN(...)` check.
  - Rationale: "non-finite" is the AC's own word and unambiguously includes the
    infinities; a NaN-only guard would still let ±Infinity corrupt the level.
  - Severity: minor
  - Forward impact: none — strictly tightens the guard within the stated AC.

### Dev (implementation)
- **sampleInput throw recovers to NEUTRAL input for that frame**
  - Spec source: context-story-5-9.md, AC-1 / TEA loop-robustness tests
  - Spec text: "A throwing onModeChange (or draw) callback does not halt the loop —
    the RAF chain survives" (the test also exercises a throwing sampleInput)
  - Implementation: When `sampleInput()` throws, the frame catches it, logs via
    `console.error`, and falls back to `NEUTRAL` input for that frame's sub-steps
    rather than skipping the step. The guards use a small `runGuarded` helper for
    the two void callbacks (onModeChange, draw); sampleInput is guarded inline
    because it returns a value that needs the fallback.
  - Rationale: The tests pin only "loop survives + reschedules," not how a thrown
    sampleInput is recovered. NEUTRAL keeps the fixed-timestep sub-steps advancing
    (a dropped frame, not a frozen sim) and is the least-surprising recovery. The
    helper removes duplicated try/catch across the two void call sites.
  - Severity: minor
  - Forward impact: none — internal to the loop; no API or sibling-story change.

### Reviewer (audit)
- **TEA: "non-finite" = {NaN, +Infinity, -Infinity}** → ✓ ACCEPTED by Reviewer:
  correct reading of the AC's own word. The code implements it with
  `Number.isFinite(input.spin)` (sim.ts:406), the non-coercing form, which rejects
  all three; the +Infinity/-Infinity tests would fail a NaN-only guard. Sound.
- **Dev: sampleInput throw recovers to NEUTRAL input for that frame** → ✓ ACCEPTED
  by Reviewer: the tests pin only "loop survives + reschedules," so the recovery
  policy is the author's to choose. NEUTRAL keeps the fixed-timestep sub-steps
  advancing (a dropped input frame, not a frozen sim) and logs the throw. Least
  surprising recovery; no sibling-story impact. Sound.
- No undocumented deviations found. The diff matches the three ACs exactly; nothing
  diverged from spec without a logged entry.

## Sm Assessment

Setup complete and routed to TEA for the red phase. This is a 1-point TDD robustness
cleanup with three well-scoped, independent fixes drawn directly from the Epic 4
reviews — no design ambiguity, no new feature surface.

**Scope is clear and bounded:**
1. `src/shell/loop.ts` — guard `onModeChange`/`draw`/`sampleInput` so a throwing
   callback cannot kill the rAF chain (the loop must survive and continue scheduling).
2. `src/core/sim.ts` — finite-guard `input.spin` in the select-mode handler so a NaN
   spin cannot poison `selectedLevel` via `Math.sign(NaN)`.
3. `tests/core/sim.death.test.ts` — delete the dead `s.spikes[2]=0.5` setup line.

**Core-boundary note for TEA/Dev:** Part 2 lives in `core/` — keep it pure and
deterministic. The NaN guard must be plain finite-checking logic; no DOM, time, or
randomness. Part 1 is shell-side, where the try/catch belongs.

**Branching note:** Branch `feat/5-9-robustify-loop-callbacks` was cut off `develop`
(this repo runs gitflow off protected `develop`, despite CLAUDE.md's trunk-based
wording). PR will target `develop`; finish bookkeeping rides the feature branch.

**Recommendation:** Hand off to TEA (red). Write one failing test per fix — a loop
test registering a throwing callback, a select-mode sim test passing NaN spin, and
confirm the death-test suite stays green after the dead line is removed.

---
## TEA Assessment

**Tests Required:** Yes
**Reason:** Two behavioral robustness fixes (loop callback survival, select-mode
non-finite spin guard) each need a failing test. Part 3 (dead test line) is a
test-file cleanup handled here in the RED commit — no behavioral test, since the
line was already assertion-less; the suite simply must stay green without it.

**Test Files:**
- `tests/shell/loop.test.ts` — new describe "createLoop callback robustness
  (Story 5-9)": a throwing `onModeChange` / `draw` / `sampleInput` must not kill
  the rAF chain. Decisive assertion = the reschedule count: a frame that survives
  a throw still calls `requestAnimationFrame` again (and the loop keeps advancing).
- `tests/core/sim.framing.test.ts` — new describe "framing — select rejects
  non-finite spin (Story 5-9)": NaN / +Infinity / -Infinity spin are ignored
  (selectedLevel neither poisoned to NaN nor silently stepped); a finite spin still
  advances one level (regression guard against an over-broad fix).
- `tests/core/sim.death.test.ts` — removed the dead `s.spikes[2]=0.5` setup line.

**Tests Written:** 6 new failing tests + 1 regression guard, covering 3 ACs.
**Status:** RED (verified) — exactly the 6 expected tests fail; 297 pass; `tsc
--noEmit` and Vite build clean. No collateral failures (`testing-runner`,
RUN_ID 5-9-tea-red).

### Rule Coverage

| Rule (typescript.md) | Test(s) | Status |
|----------------------|---------|--------|
| #4 null/undefined & non-finite input handling | select rejects NaN / ±Infinity spin (3 tests) | failing (RED) |
| #11 error handling (callbacks must not crash the loop) | loop survives throwing onModeChange / draw / sampleInput (3 tests) | failing (RED) |
| #8 test quality (meaningful, non-vacuous assertions) | self-check (below) | pass |

**Rules checked:** 3 of 13 lang-review checks are materially applicable to this
diff; all three have test coverage. (The rest — React/JSX, async/Promise, enums,
generics, build-config, bundle — have no surface in this two-line-of-source change.)

**Self-check (Phase C):** Every new test asserts a concrete value or call count
(`rafCount`, `selectedLevel`, `toHaveBeenCalledTimes`), not a tautology. No
`let _ =`, no `assert(true)`, no `is*()`-on-always-constant. The one always-green
test (finite spin still steps) is a deliberate regression guard, labeled as such.

### Guidance for Dev (Sergeant Carter)

- **Part 1 (`src/shell/loop.ts`, shell):** Wrap the callback invocations so a throw
  cannot reach the `requestAnimationFrame(frame)` reschedule on the last line of
  `frame()`. The reschedule MUST still run after any callback throws — the tests
  count it. Per lang-review #11, if you `catch`, type it `catch (e: unknown)`, not
  `any`. Surfacing the error (e.g. `console.error`) is fine; swallowing silently is
  acceptable to the tests but log it.
- **Part 2 (`src/core/sim.ts`, PURE CORE):** Guard with `Number.isFinite(input.spin)`
  in the select branch (line ~406) — a `!Number.isNaN` check is NOT enough; the
  ±Infinity tests require finiteness. Keep it pure: no DOM/time/RNG. Do NOT touch
  `stepHighScore` for this story (its twin bug is logged as a non-blocking finding).
- **Part 3:** Already done (dead line removed) — nothing to implement.

**Handoff:** To Dev for implementation (GREEN).

---
## Dev Assessment

**Implementation Complete:** Yes

**Files Changed:**
- `src/shell/loop.ts` — added a `runGuarded(label, fn)` helper and wrapped the
  three shell callbacks so a throw can never reach past the
  `requestAnimationFrame(frame)` reschedule: `onModeChange` and `draw` run via
  `runGuarded`; `sampleInput` is guarded inline with a `NEUTRAL`-input fallback.
  `prevMode` still advances after a guarded `onModeChange` so a transition cannot
  re-fire on a later frame.
- `src/core/sim.ts` — select-mode spin branch now gates on
  `Number.isFinite(input.spin) && input.spin !== 0`, rejecting NaN (poisoned
  `selectedLevel` via `Math.sign(NaN)`) and ±Infinity (silently stepped via
  `Math.sign(±Infinity) = ±1`). Pure-core: no DOM/time/RNG touched.
- `tests/core/sim.death.test.ts` — dead `s.spikes[2]=0.5` line removed (in the
  RED commit by TEA); suite stays green.

**Tests:** 303/303 passing (GREEN) — the 6 RED tests now pass plus the finite-spin
regression guard; `tsc --noEmit` and `vite build` clean. Verified via
`testing-runner`, RUN_ID 5-9-dev-green. No regressions.

**AC status:**
1. Throwing onModeChange/draw/sampleInput does not halt the loop — ✅ rAF chain
   survives and keeps advancing.
2. Select handler ignores non-finite spin — ✅ NaN and ±Infinity rejected, level
   preserved; finite spin still steps.
3. Dead `s.spikes[2]=0.5` line removed — ✅ suite and typecheck clean.

**Branch:** `feat/5-9-robustify-loop-callbacks` (pushed to origin).

**Handoff:** To Reviewer (General Burkhalter) for code review.

---
## Subagent Results

| # | Specialist | Received | Status | Findings | Decision |
|---|-----------|----------|--------|----------|----------|
| 1 | reviewer-preflight | Yes | clean | none (0 smells; 303/303 green; tsc+build pass; lint not configured) | N/A |
| 2 | reviewer-edge-hunter | No | Skipped | disabled | Disabled via settings (self-assessed below) |
| 3 | reviewer-silent-failure-hunter | No | Skipped | disabled | Disabled via settings (self-assessed below) |
| 4 | reviewer-test-analyzer | No | Skipped | disabled | Disabled via settings (self-assessed below) |
| 5 | reviewer-comment-analyzer | No | Skipped | disabled | Disabled via settings (self-assessed below) |
| 6 | reviewer-type-design | No | Skipped | disabled | Disabled via settings (self-assessed below) |
| 7 | reviewer-security | No | Skipped | disabled | Disabled via settings (self-assessed below) |
| 8 | reviewer-simplifier | No | Skipped | disabled | Disabled via settings (self-assessed below) |
| 9 | reviewer-rule-checker | Yes | findings | 3 (all LOW) | confirmed 3 (all non-blocking), dismissed 0, deferred 0 |

**All received:** Yes (2 enabled subagents returned; 7 disabled via `workflow.reviewer_subagents` and self-assessed)
**Total findings:** 3 confirmed (all LOW, non-blocking), 0 dismissed, 0 deferred

Only `preflight` and `rule_checker` are enabled in this project's
`workflow.reviewer_subagents` settings. The other seven are disabled; per the
"errors/skips are not coverage" rule I assessed each disabled domain myself (see
Rule Compliance, Observations, and Devil's Advocate below).

---
## Reviewer Assessment

**Verdict:** APPROVED

A surgical, well-scoped 1-point robustness fix that resolves a *real* failure path,
not a hypothetical one. Preflight is fully green (303/303 tests, `tsc` + `vite build`
clean, zero debug smells). The rule-checker returned only 3 LOW test-style nits, none
introduced behavior risk. No Critical or High findings.

**Data flow traced:** `input.spin` (shell `input.sample()` → `stepGame`) → select
branch at `sim.ts:406`. A non-finite spin (NaN/±Infinity) is now rejected by
`Number.isFinite` before reaching `Math.sign`, so `selectedLevel` can no longer be
poisoned to NaN or silently stepped. Safe. Separately, the shell callbacks
(`sampleInput`/`onModeChange`/`draw`) flow through `frame()`; a throw is now caught
before the `requestAnimationFrame(frame)` reschedule, so the rAF chain survives.

**Real-world risk validated:** at `main.ts:99` the `onModeChange` callback calls
`saveHighScores` → `localStorage`, which throws on quota-exceeded / private-mode
SecurityError / disabled storage; the `draw` callback runs `render` / `audio.play` /
`fx`, all throw-prone. Before this fix, a single such throw permanently froze the
game loop. The guard closes that hole.

### Observations

- `[VERIFIED]` **Core purity intact** — `sim.ts:406` uses `Number.isFinite` (the
  non-coercing form) and imports only sibling `./core` modules; no DOM/time/RNG/shell.
  `stepGame` stays deterministic (NaN/Infinity are deterministic IEEE-754 values).
  Evidence: grep shows zero shell/Date/performance/Math.random/raf in `sim.ts`;
  complies with CLAUDE.md hard architectural boundary.
- `[VERIFIED]` **rAF reschedule is outside all guards** — `loop.ts` wraps
  `onModeChange` and `draw` in `runGuarded`, and `sampleInput` in an inline
  try/catch with a `NEUTRAL` fallback; `raf = requestAnimationFrame(frame)` sits
  after all of them and is always reached. This is the decisive correctness property
  and is exactly what the reschedule-count tests assert. Evidence: diff lines 65, 73, 74.
- `[VERIFIED]` **`prevMode` advances after a guarded `onModeChange`** — the guard
  wraps only the callback call (diff:65); `prevMode = state.mode` (diff:66) runs
  unconditionally, so a throwing transition cannot re-fire on a later frame.
- `[EDGE]` (self-assessed; subagent disabled) **Boundary inputs covered** — NaN,
  +Infinity, -Infinity, finite, and persistent-throw all considered. The finite-spin
  regression guard prevents an over-broad fix that would drop *all* spin. No
  unhandled boundary remains in the select branch.
- `[SILENT]` (self-assessed; subagent disabled) **Swallow-but-log is by design, not
  a silent failure** — the story's contract is "a throw cannot stop the loop." Both
  catch blocks log via `console.error` before continuing, so errors are surfaced, not
  hidden. This is the intended mechanism, not an empty-catch antipattern.
- `[TEST]` `[RULE]` `[LOW]` **`sim.framing.test.ts:202`** — `Number.isNaN(lvl as
  number)` casts `number | undefined` → `number` to satisfy the type-checker.
  Confirmed as a LOW type-safety nit; mitigated by the adjacent `expect(lvl).toBe(5)`
  which fails loudly on undefined, and `lvl` is always defined here in practice.
  Non-blocking.
- `[RULE]` `[LOW]` **`sim.death.test.ts:79-80`** — pre-existing `s.mode as string`
  casts and a vacuous `.not.toBe('playing')`. NOT introduced by 5-9 (the diff only
  removed the spike line above them). Recorded as a delivery finding for future
  cleanup; out of scope here. Non-blocking.
- `[DOC]` (self-assessed; subagent disabled) **Comments accurate** — the new comments
  in `loop.ts` and `sim.ts` correctly describe the failure mode (rAF-chain death,
  `Math.sign(NaN)` poisoning) and the fix. No stale or misleading documentation.
- `[TYPE]` `[SEC]` `[SIMPLE]` (self-assessed; subagents disabled) — `runGuarded`'s
  `fn: () => void` is a specific signature (not bare `Function`); both catches use
  `catch (e: unknown)` (lang-review #11). The `Number.isFinite` guard *is* the
  type-level input validation rule #10 asks for. The helper is minimal — no
  over-engineering, no dead code. No auth/injection/secret surface in this diff.

### Rule Compliance (lang-review/typescript.md + CLAUDE.md boundary)

- **#1 type-safety escapes:** new code clean; the only diff-introduced cast is
  `lvl as number` (LOW, test-only, mitigated). Pre-existing `s.mode as string`
  flagged but not in scope.
- **#2 generics/interfaces:** `runGuarded(label: string, fn: () => void)` — specific
  signature, compliant. `draw`'s `readonly GameEvent[]` param preserved.
- **#4 null/undefined & non-finite:** `Number.isFinite` (not global `isFinite`) —
  compliant and strictly correct. Optional chaining `onModeChange?.()` correct.
- **#8 test quality:** new loop/select tests assert concrete values (rafCount, call
  counts, selectedLevel) — non-vacuous. One LOW cast nit (sim.framing.test.ts:202).
- **#10 input validation:** the finite guard is the runtime validation the rule calls for.
- **#11 error handling:** both catches use `catch (e: unknown)` — compliant.
- **Architectural boundary (CLAUDE.md):** `core/sim.ts` adds no shell/DOM/time/random
  dependency and stays deterministic; the try/catch lives in `shell/loop.ts` where it
  belongs. Fully compliant.
- #3/#6/#7/#9/#12 not applicable (no enums/JSX/async/config/bundle surface in the diff).

### Devil's Advocate

Suppose this code is broken. The most plausible attack is a *persistently* throwing
callback: if `render` throws every frame (lost WebGL/canvas context) or `localStorage`
is hard-disabled, `runGuarded` logs `console.error` ~60×/sec forever. The loop won't
freeze — but it will flood the console and the sim keeps advancing behind a frozen
screen, so a player sees a hung game while state silently mutates (and high scores may
still attempt to save). Is that worse than the old freeze? No — the old behavior was a
*permanent dead loop* on the very first throw; this is strictly better, and a hung
render is already catastrophic regardless of the loop. I logged the log-flood as a
non-blocking Improvement. A confused user can't reach the bad path through normal play;
it requires an environment failure. Second angle: `stepGame` itself is NOT guarded — a
core throw still kills the loop. But that is deliberate and correct: the core is a pure
deterministic sim; a throw there is a real bug that must surface loudly, and the story's
scope is explicitly the *shell callbacks*. Third: could the `NEUTRAL` fallback mask a
flaky input source? It degrades to "no input this frame," not a crash — the player
notices and the sim stays live; acceptable and documented. Fourth: determinism — could
the guard make `stepGame` non-deterministic? No: `Number.isFinite` is a pure predicate;
identical `(state,input,dt)` yields identical output. Nothing here rises to Critical/High.

**Error handling:** verified — all three shell callbacks guarded with logging; rAF
reschedule always reached; core throws intentionally unguarded (`sim.ts`); finite-guard
prevents arithmetic poisoning.

**Handoff:** To SM (Colonel Hogan) for finish-story.