---
story_id: "3-3"
jira_key: ""
epic: "3"
workflow: "tdd"
---
# Story 3-3: Spikes crash the Claw during the warp

## Story Details
- **ID:** 3-3
- **Jira Key:** (not configured)
- **Workflow:** tdd
- **Stack Parent:** none

## Workflow Tracking
**Workflow:** tdd
**Phase:** finish
**Phase Started:** 2026-06-25T21:26:59Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-06-25T20:58:53+00:00 | 2026-06-25T21:01:13Z | 2m 20s |
| red | 2026-06-25T21:01:13Z | 2026-06-25T21:09:52Z | 8m 39s |
| green | 2026-06-25T21:09:52Z | 2026-06-25T21:16:07Z | 6m 15s |
| review | 2026-06-25T21:16:07Z | 2026-06-25T21:26:59Z | 10m 52s |
| finish | 2026-06-25T21:26:59Z | - | - |

## Sm Assessment

**Story:** 3-3 — Spikes crash the Claw during the warp (2 pts, p1, Wave 3, TDD/phased).

**Setup outcome:** Session + context created; feature branch `feat/3-3-spikes-crash-claw-warp`
cut from `develop` (repo is gitflow — `develop` is the integration branch; CLAUDE.md's
"trunk-based" text is stale). No Jira (YAML-only sprint). Merge gate clear — no open PRs.

**Scope (routed, not planned):** Make persistent per-lane spikes lethal during the
end-of-level warp. When warp progress carries the camera past a spike on the player's
**current** lane, the Claw crashes (death + life loss via the existing death path).
Player can steer to a spike-free lane to survive. Builds on 3-2's warp geometry switch.

**Boundary reminder for downstream agents:** Collision belongs in the pure core
(`src/core/sim.ts` warp step) — tube-space lane+depth overlap, no DOM/canvas, time via
`dt`, randomness via seeded RNG. Acceptance criteria seeded in
`sprint/context/context-story-3-3.md` (7 ACs); TEA refines during RED.

**Handoff:** → TEA (Major Hochstetter) for the RED phase. Write failing tests for
spike↔Claw warp collision driven by fixed GameState (spikes[], player lane, warp timer).

**Next agent:** tea · **Next phase:** red

## TEA Assessment

**Tests Required:** Yes
**Reason:** New deterministic core behaviour (spike↔Claw collision during the warp) — squarely the kind of pure-sim logic this project mandates TDD for.

**Test Files:**
- `tests/core/sim.warp-spikes.test.ts` — spike↔Claw warp collision (9 tests)

**Tests Written:** 9 tests covering all 7 ACs.
**Status:** RED (5 behaviour tests failing as designed — collision unimplemented; 4 guard/property tests pass). Verified via testing-runner (RUN_ID 3-3-tea-red); file compiles clean.

### AC Coverage

| AC | Test(s) | Status |
|----|---------|--------|
| 1 spike on player's lane crashes the Claw | `crashes the Claw when the warp reaches a spike…` | failing |
| 2 no spike → no crash | `completes the warp safely when no spike…` | passing (guard) |
| 3 only current lane is lethal / dodge survives | `ignores spikes on lanes other than the player's`, `lets the player dodge…` | passing (guard; meaningful post-impl) |
| 4 deterministic | `is deterministic: identical warp+spike scenarios…`, `does not mutate the input on the crash step…` | passing / failing |
| 5 lives/respawn + gameover | `goes to gameover when a warp spike claims the last life`, `routes a warp crash through the standard death path…` | failing |
| 6 pure core (no DOM/non-determinism) | `does not mutate the input on the crash step and replays purely` | failing |
| 7 surviving warp loads next geometry | `completes the warp safely…`, `…dodge…`, `ignores spikes on other lanes` | passing (guard) |

### Rule Coverage (project hard-boundary, not the generic TS checklist)

| Rule | Test(s) | Status |
|------|---------|--------|
| Pure deterministic core — identical input ⇒ identical output | `is deterministic…` | passing |
| `stepGame` must not mutate its input (cloneState trap) | `does not mutate the input on the crash step…` | failing (drives correct impl) |
| Collision in tube space, no DOM/time/random | whole suite runs headless in core; determinism + purity tests enforce it | mixed |

**Rules checked:** The TS lang-review checklist (`typescript.md`) is Dev-side self-review (type-escape/enum/null patterns) with no new testable surface here — this story adds no new enums, constructors, or validated types. The project's *real* enforceable rule is the hard architectural boundary (purity/determinism), covered above.
**Self-check:** No vacuous assertions — every test asserts a concrete mode/lives/level/value; guard tests assert specific survival outcomes, not just "truthy."

**Handoff:** To Dev (Sergeant Carter) for GREEN. Implement spike↔Claw collision inside the warp step of `src/core/sim.ts`: while `mode === 'warp'`, when the descending camera reaches a spike on the player's **current** lane (`spikes[currentLane] > 0`), crash via the existing `killPlayer` path. Read the **Delivery Findings** Question first — decide post-respawn warp resolution.

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `src/core/sim.ts` — added `warpClawDepth(progress) = 1 - progress` and `resolveWarpSpikeHit(s)`; `stepWarp` now crashes the Claw via the existing `killPlayer` path when the descending camera reaches a spike on the player's **current** lane, and skips `advanceLevel` on a crash.
- `tests/core/sim.advance-level.test.ts` — cleared the player's lane in the Story 3-2 resize test so the warp completes under the new crash rule (intent preserved; see Design Deviations).

**Approach:** Minimal and pure. Collision keys off `currentLane(tube, player.lane)` and the per-lane `spikes[]` height already in `GameState`; depth model: warp camera dives rim→far, crash when `1 - progress <= spikes[lane]`. No new state, no DOM/time/random — stays inside the hard core boundary. Reused `killPlayer` so lives/dying/gameover behave exactly like an enemy grab.

**Tests:** 126/126 passing (GREEN) — the 9 new spike-warp tests + all pre-existing suites (warp, death, spikes, level, advance-level). `npx tsc --noEmit` clean. Verified via testing-runner (RUN_ID 3-3-dev-green-2).
**Branch:** feat/3-3-spikes-crash-claw-warp (pushed to origin).

**Self-review:**
- ✅ All 7 ACs met (crash on lane / safe otherwise / current-lane-only / dodge / lives+gameover / pure-deterministic / next geometry on survive).
- ✅ Wired into the live sim — `stepGame` warp branch calls `stepWarp`, which the shell loop already drives. No separate wiring needed (pure core).
- ✅ Follows project patterns (helper functions, `killPlayer` reuse, no enum/type changes).
- ✅ Error handling: n/a (pure value logic); guards `player.alive` before crashing.
- ⚠️ One deliberate deferral (post-warp-death re-warp loop) — documented as a deviation + finding for Reviewer/follow-up.

**Handoff:** To TEA (Major Hochstetter) for the verify phase (simplify + quality-pass), then Reviewer.

## Subagent Results

| # | Specialist | Received | Status | Findings | Decision |
|---|-----------|----------|--------|----------|----------|
| 1 | reviewer-preflight | Yes | clean | none (126/126 green, tsc clean, 0 smells) | N/A |
| 2 | reviewer-edge-hunter | No | Skipped | disabled | Disabled via settings — Reviewer assessed edges manually |
| 3 | reviewer-silent-failure-hunter | No | Skipped | disabled | Disabled via settings — Reviewer assessed manually |
| 4 | reviewer-test-analyzer | No | Skipped | disabled | Disabled via settings — Reviewer assessed tests manually |
| 5 | reviewer-comment-analyzer | No | Skipped | disabled | Disabled via settings — Reviewer assessed comments manually |
| 6 | reviewer-type-design | No | Skipped | disabled | Disabled via settings — Reviewer assessed types manually |
| 7 | reviewer-security | No | Skipped | disabled | Disabled via settings (pure core, no external input) |
| 8 | reviewer-simplifier | No | Skipped | disabled | Disabled via settings — Reviewer assessed complexity manually |
| 9 | reviewer-rule-checker | Yes | findings | 1 (import type nit) | confirmed 1 (LOW), dismissed 0, deferred 0 |

**All received:** Yes (2 enabled subagents returned; 7 disabled via `workflow.reviewer_subagents` and pre-filled)
**Total findings:** 1 confirmed (LOW), 0 dismissed, 0 deferred

## Reviewer Assessment

**Verdict:** APPROVED

The change is small, pure, deterministic, and well-tested. All 7 ACs are met and verified by 9 new tests; the full suite is 126/126 green with a clean `tsc`. No Critical or High issues. One LOW convention nit and one accepted, documented design deferral — neither blocks.

### Rule Compliance (TypeScript lang-review checklist + CLAUDE.md hard boundary)

Enumerated every function/type in the diff against every applicable rule:
- **#1 Type-safety escapes** — clean. No `as any`, `as unknown`, `@ts-ignore`, or unsafe `!` in `warpClawDepth`, `resolveWarpSpikeHit`, `stepWarp`, or any test body.
- **#2 Generics/interfaces** — clean. `resolveWarpSpikeHit(s: GameState)` intentionally mutates the clone (established `sim.ts` private-helper pattern); test `opts.spikes` is `ReadonlyArray<readonly [number, number]>` — good readonly discipline.
- **#3 Enums** — N/A. No new enum or switch; existing `s.mode` switch unchanged and exhaustive.
- **#4 Null/undefined** — clean and notably careful: `height > 0` (not `||`) correctly distinguishes 0 from positive; `opts.spikes ?? []` and `opts.playerLane !== undefined` correctly avoid eating the valid value `0`/lane `0`.
- **#5 Module/declaration** — **1 violation:** `tests/core/sim.warp-spikes.test.ts:21` uses `import { Input }` where `Input` is a type-only interface used solely in annotations; should be `import type { Input }` (line 18 already does this for `GameState`). LOW — no compile/runtime impact under this tsconfig (no `isolatedModules`/`verbatimModuleSyntax`), but it matches the project's own convention so it is confirmed, not dismissed.
- **#6 React/JSX, #7 Async, #9 Build-config, #10 Input-validation, #11 Error-handling** — N/A (no JSX/async/config/external-input/try-catch in the diff).
- **#8 Test quality** — clean. Every test makes concrete behavioural assertions (mode/lives/level/respawnTimer); the dodge test asserts the player actually moved (`currentLane !== 0`) before the neutral run, preventing a false pass; `RESPAWN_DELAY` is a named constant, not a magic number. No vacuous assertions, no `dist` imports.
- **#12 Performance** — clean. `resolveWarpSpikeHit` is O(1), only on the warp path (~30 frames), not normal-play hot path.
- **#13 Fix regressions** — clean. No-spike path (`height > 0` false) leaves the original `advanceLevel` behaviour structurally untouched.
- **CLAUDE.md hard boundary** — clean. No `shell/` import, no DOM/`Date.now`/`Math.random`/`requestAnimationFrame`; time enters via `dt`; operates only on the `cloneState` clone; `cloneState` already deep-copies `warp` and `spikes`. Tube-space depth model correct: `warpClawDepth = 1 - progress` maps progress 0→depth 1 (near rim) and progress 1→depth 0 (far), crash when claw depth `<=` spike height. Dimensionally consistent with `spikes[]` (depth units).

### Observations

- `[VERIFIED]` **Core purity & no-mutation** — `resolveWarpSpikeHit`/`killPlayer` operate on the clone `s` from `cloneState(state)` (sim.ts:288); `cloneState` does `warp: {...s.warp}` and `spikes: s.spikes.slice()`. Proven by `does not mutate the input on the crash step and replays purely` (sim.warp-spikes.test.ts:135). Complies with CLAUDE.md determinism rule.
- `[VERIFIED]` **Array-bounds safety** — `s.spikes[currentLane(...)]` (sim.ts:271): `currentLane`→`wrapLane` returns `[0, laneCount-1]` for both closed (mod) and open (clamp) tubes; `spikes.length === tube.laneCount` is invariant across `initialState`/`startGame`/`advanceLevel`. No undefined index possible.
- `[VERIFIED]` **Depth model & threshold** — `warpClawDepth(progress) <= height` (sim.ts:272). At progress 0 depth 1 (rim, above a ≤0.75 spike → safe); crash only once the camera descends to the spike tip. Even a tiny spike correctly crashes only near the end of the warp. Matches AC1/AC3.
- `[VERIFIED]` **Death-path reuse** — crash routes through existing `killPlayer` (sim.ts:194): dying+respawnTimer on lives remaining, gameover on the last. No bespoke death branch. Proven by tests at lines 107 and 117.
- `[VERIFIED]` **No-crash regression path** — with all spikes 0, `resolveWarpSpikeHit` returns false and `advanceLevel` runs unchanged; the Story 3-2 warp/advance suites stay green.
- `[MEDIUM]` **Post-warp-death re-warp loop** at `src/core/sim.ts` (`respawn`→`checkLevelClear`→`stepWarp`) — after a warp crash, respawn returns to `playing`, the already-cleared level immediately re-enters the warp, and a spike persisting on the player's lane re-crashes unless the player steers. Documented and deliberately deferred by TEA+Dev; recoverable in play (the player can dodge each re-warp). **Non-blocking** — resolution is a product/design decision tracked as a follow-up finding. See Deviation Audit.
- `[LOW]` `[RULE]` **import type nit** at `tests/core/sim.warp-spikes.test.ts:21` — see Rule Compliance #5. Non-blocking.

### Subagent dispatch tags

- `[RULE]` rule-checker: 1 confirmed (import type, LOW) — see above.
- `[TEST]` test-analyzer **disabled via settings** — Reviewer assessed manually: tests are non-vacuous, behavioural, well-isolated; the dodge test guards against a false pass. No issues.
- `[EDGE]` edge-hunter **disabled** — Reviewer assessed manually: progress>1 overshoot (crash precedence over advance is correct), tiny-spike threshold, open-vs-closed tube indexing, frame-1 (cannot crash, height would exceed cap). No unhandled edge.
- `[SILENT]` silent-failure-hunter **disabled** — Reviewer assessed manually: no try/catch, no swallowed errors, no silent fallback; the boolean return is explicitly consumed by `stepWarp`.
- `[TYPE]` type-design **disabled** — Reviewer assessed manually: no new types; existing `GameState`/`Mode` reused correctly; `WarpState`/`spikes[]` already in the type. No stringly-typed surface.
- `[SEC]` security **disabled** — N/A: pure deterministic core, no external/untrusted input, no secrets, no auth, no tenancy.
- `[SIMPLE]` simplifier **disabled** — Reviewer assessed manually: `warpClawDepth` one-liner is justified for readability and documents the depth model; `resolveWarpSpikeHit` is minimal. No over-engineering, no dead code.
- `[DOC]` comment-analyzer **disabled** — Reviewer assessed manually: the new comments accurately describe the depth model and the no-advance-on-crash rule; the updated 3-2 test comment correctly explains the one-line guard. No stale/misleading docs.

### Devil's Advocate

Assume this code is broken. Where would it fail? The most dangerous angle is the deferred re-warp loop: a player who finishes a level standing on a spiked lane and then sets the controller down loses their entire remaining life stack in seconds. A confused player would read this as the game "killing them for no reason" — they cleared the level, after all. That is a genuine UX wound, and a stricter reviewer could call it High. I keep it Medium because (a) every stated AC is satisfied, (b) the behaviour is recoverable — the player retains full steering on each re-warp and only ~0.125s+ of inaction per cycle triggers the next crash, and (c) the "correct" resolution (advance the level on respawn? clear the spike? grant i-frames?) is an unspecified product decision that TEA and Dev both deliberately declined to invent, logging it for a follow-up rather than guessing. Forcing a fix now would mean shipping behaviour no spec defines.

Next, a malicious/edge input: a `spin` so large it wraps many lanes per frame. `wrapLane` mods it back into range, so no out-of-bounds and no NaN (inputs are finite numbers from the shell). A spike height pushed above the cap? Construction clamps to `SPIKE_MAX_DEPTH`, and even an artificially huge height only makes the crash fire one frame earlier — still bounded. `progress` overshooting 1 yields a negative `warpClawDepth`, which is `<= height` for any positive spike, so a lane-resident player crashes rather than escaping on the final frame — correct, not a bug. The float comparison `1 - progress <= height` has no equality knife-edge that matters because the outcome (crash vs. not) is monotonic in progress. A stressed filesystem / config oddity is irrelevant — this is a pure in-memory function with no IO. The only thing the devil surfaced that the review hadn't already captured is the UX framing of the loop, which is recorded. Verdict stands: APPROVED.

### Deviation Audit
See `### Reviewer (audit)` under Design Deviations — all three logged deviations stamped ACCEPTED.

**Data flow traced:** spinner `input.spin` → `stepPlayer` updates `s.player.lane` → `currentLane` rounds/wraps to an integer lane → `resolveWarpSpikeHit` reads `s.spikes[lane]` and `s.warp.progress` → `killPlayer` on overlap. Pure, in-bounds, deterministic end to end.
**Pattern observed:** private helper mutating the clone + boolean signal consumed by caller — matches existing `resolveBulletHits`/`resolvePlayerHits` style at `src/core/sim.ts`.
**Error handling:** pure value logic; guards `player.alive` before crashing; no IO/exceptions.
**Handoff:** To SM (Colonel Hogan) for finish-story.

## Delivery Findings

Agents record upstream observations discovered during their phase.
Each finding is one list item. Use "No upstream findings" if none.

**Types:** Gap, Conflict, Question, Improvement
**Urgency:** blocking, non-blocking

<!-- Agents: append findings below this line. Do not edit other agents' entries. -->

### Reviewer (code review)
- **Improvement** (non-blocking): Define post-warp-death resolution to remove the re-warp loop (a spike persisting on the player's lane re-crashes after each respawn). Options: complete the level transition on warp-death respawn, clear/skip the killing spike, or grant brief invulnerability. Affects `src/core/sim.ts` (`respawn`/`checkLevelClear`/`stepWarp`). Recommend a follow-up story in Wave 3/5. *Found by Reviewer during code review.*
- **Improvement** (non-blocking): `tests/core/sim.warp-spikes.test.ts:21` should use `import type { Input }` for consistency with line 18's `import type { GameState }` (LOW; no compile/runtime impact under current tsconfig). Trivial cleanup, can ride any future touch of the file. *Found by Reviewer during code review.*

### Dev (implementation)
- **Conflict** (non-blocking): Story 3-2's spike-resize test set a spike on the player's lane before warping, which the new crash now interrupts. Resolved by clearing only the player's lane in that test (the other 15 stale heights still prove the invariant). Affects `tests/core/sim.advance-level.test.ts` (already updated this story). *Found by Dev during implementation.*
- **Question** (non-blocking): Confirms TEA's finding — after a warp-death respawn the cleared level re-enters the warp on the still-persisted spike, so neutral input drains all lives. Recommend a follow-up to define post-warp-death resolution (advance level / clear spike / invuln). Affects `src/core/sim.ts` (`respawn`/`stepWarp`/`checkLevelClear`). *Found by Dev during implementation.*

### TEA (test design)
- **Question** (non-blocking): The spec doesn't define what happens *after* a warp-death respawn — does the level advance, or does the warp restart? Affects `src/core/sim.ts` (`respawn`/`stepWarp`/`advanceLevel`/`checkLevelClear` interaction). Risk: `respawn()` sets `mode='playing'`; with the level already cleared (no enemies, `spawn.remaining === 0`), `checkLevelClear` re-enters the warp immediately — and if the killing spike persists on the player's lane, that is an infinite warp→crash→respawn→warp loop draining all lives. Dev/Architect should pick a resolution (e.g. complete the level transition on warp-death respawn, or clear/skip the spike, or suppress re-warp). *Found by TEA during test design.*
- **Improvement** (non-blocking): No render/shell signal exists for a warp crash (it's identical to a normal death in core). Wave 5 polish may want a distinct SFX/visual; out of scope here but worth a note. Affects `src/shell/render.ts` / audio (later wave). *Found by TEA during test design.*

## Design Deviations

Agents log spec deviations as they happen — not after the fact.
Each entry: what was changed, what the spec said, and why.

<!-- Agents: append deviations below this line. Do not edit other agents' entries. -->

### Reviewer (audit)
- **Dev: Deferred post-warp-death warp resolution (the re-warp loop)** → ✓ ACCEPTED by Reviewer: every AC is met, the loop is recoverable (the player keeps steering on each re-warp), and the correct resolution is an unspecified product decision — deferring with a tracked follow-up finding is sounder than inventing behaviour no spec defines. Recorded as MEDIUM, non-blocking.
- **Dev: Updated a Story 3-2 test whose setup conflicts with the new crash** → ✓ ACCEPTED by Reviewer: the edit preserves the test's real intent (the resize-to-zeros invariant) — clearing only the player's lane while leaving 15 stale heights still fully exercises the carryover check. No coverage lost.
- **TEA: AC5 respawn clause tested as death-path engagement, not stepped to completion** → ✓ ACCEPTED by Reviewer: asserting `mode='dying'` + `respawnTimer === RESPAWN_DELAY` is the correct way to verify reuse of the standard death path without pinning the undefined post-respawn behaviour; the gameover branch is fully exercised separately.

### Dev (implementation)
- **Deferred post-warp-death warp resolution (the re-warp loop)**
  - Spec source: context-story-3-3.md, AC-5; TEA Delivery Finding (Question)
  - Spec text: "After the crash, lives/respawn follow existing rules — respawn on lives remaining…"
  - Implementation: A warp crash routes through `killPlayer` (death + life loss) and does NOT advance the level or clear the spike. After the respawn delay, `respawn()` sets `mode='playing'`; the already-cleared level immediately re-enters the warp (`checkLevelClear`), so a spike still on the player's lane re-crashes unless the player steers away.
  - Rationale: What *should* happen after a warp-death respawn (advance the level? clear/skip the spike? grant invuln frames?) is an open design question TEA flagged and no test pins. Per minimalist discipline I implemented only the specified crash and left the resolution to a follow-up rather than inventing unspecified behaviour.
  - Severity: minor
  - Forward impact: recoverable in play (the player can dodge on the re-warp; only bites with neutral input). A follow-up story / Architect decision should define post-warp-death resolution; verify-phase may add coverage once decided.
- **Updated a Story 3-2 test whose setup conflicts with the new crash**
  - Spec source: tests/core/sim.advance-level.test.ts (Story 3-2), "starts every lane … at 0" test
  - Spec text: filled every lane with 0.5 then warped, expecting to reach level 4
  - Implementation: cleared the player's lane (`spikes[0] = 0`) so the warp completes; the other 15 stale heights still verify the resize-to-zeros invariant
  - Rationale: the test's premise (warping over spikes is harmless) is invalidated by Story 3-3; its real intent (advanceLevel rebuilds a fresh zeroed spike array) is preserved unchanged
  - Severity: minor
  - Forward impact: none — the carryover invariant remains fully covered

### TEA (test design)
- **AC5 respawn clause tested as death-path engagement, not stepped to completion**
  - Spec source: context-story-3-3.md, AC-5
  - Spec text: "After the crash, lives/respawn follow existing rules — respawn on lives remaining, gameover when the last life is lost."
  - Implementation: The gameover branch is fully exercised. The "respawn on lives remaining" branch is asserted as *death-path engagement* (mode `dying` + `respawnTimer === RESPAWN_DELAY`) rather than stepping through `RESPAWN_DELAY` to observe the post-respawn state.
  - Rationale: The spec does not define what happens *after* a warp-death respawn — whether the level advances or the warp restarts. Stepping through would pin behaviour the spec leaves open (and risks asserting an accidental warp→crash→respawn loop). Raised as a Delivery Finding for Dev/Architect to resolve. Once resolved, the post-respawn assertion can be tightened in the verify phase.
  - Severity: minor
  - Forward impact: Dev must define post-respawn warp resolution (see Delivery Findings); verify-phase tests should cover it.