---
story_id: "5-5"
jira_key: ""
epic: "5"
workflow: "trivial"
---
# Story 5-5: Wire audio and particles into loop and bootstrap

## Story Details
- **ID:** 5-5
- **Type:** chore (integration)
- **Jira Key:** (none — no Jira integration for this story)
- **Workflow:** trivial (phased)
- **Stack Parent:** none
- **Points:** 2
- **Priority:** p1
- **Epic:** Wave 5 — Audio & polish (Epic 5)
- **Repos:** tempest

## Story Summary

Final integration story of Wave 5 (Audio & polish): wire the already-built WebAudio SFX engine (story 5-2, merged) and the particle system (5-3/5-4, merged) into the main game loop and bootstrap. The pure core emits `GameEvent[]` data; the shell subsystems consume it to play sounds and spawn particles. This story connects the plumbing.

**Key tasks:**
1. Create the AudioEngine in `src/main.ts` and gate it on user interaction (click/keydown) due to browser autoplay policy.
2. Drain `GameState.events` each frame in the loop's draw callback and play the corresponding sound for each event type.
3. Verify the Fx system (particles, screen-shake) is correctly wired and rendering.
4. No core changes — all wiring is shell-only.

## Workflow Tracking
**Workflow:** trivial
**Phase:** finish
**Phase Started:** 2026-06-26T15:10:43Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-06-26T14:53:39+00:00 | 2026-06-26T14:55:09Z | 1m 30s |
| implement | 2026-06-26T14:55:09Z | 2026-06-26T15:03:03Z | 7m 54s |
| review | 2026-06-26T15:03:03Z | 2026-06-26T15:10:43Z | 7m 40s |
| finish | 2026-06-26T15:10:43Z | - | - |

## Sm Assessment

**Setup complete — cleared for Dev (implement).**

- **Scope:** Shell-only integration. Wire the merged AudioEngine (5-2) and Fx particle/screen-shake system (5-3/5-4) into `src/main.ts` (bootstrap) and `src/shell/loop.ts` (draw callback). The pure core already emits `GameEvent[]`; nothing in `src/core/` changes — the hard architectural boundary stays intact.
- **Why trivial/phased:** 2-pt plumbing. No new behavior in the simulation, no test-first cycle on core. Manual playtest is the proof.
- **Key risks the Dev should watch:**
  1. **Autoplay policy** — AudioEngine must be resumed on first user gesture (click/keydown), not at construction, or no sound plays.
  2. **Event collection under fixed timestep** — if the loop runs multiple sub-steps per render frame, events from every sub-step must be drained, not just the last state's. Accumulate across sub-steps or justify a single-sub-step assumption in a comment.
  3. **Event→sound mapping** — cover all emitted `GameEvent` types (fire, enemy-death, player-grab, player-death, warp-spike-crash, level-clear, superzapper-activate, player-spawn).
- **Verify-don't-rebuild:** The Fx system is already wired per setup notes — confirm `fx.detect()`/`fx.update()`/`fx` passed to `render()` are present and ordered, don't re-plumb it.
- **Branch:** `feat/5-5-wire-audio-particles-loop` off `develop` (gitflow, protected develop — NOT trunk-based). Bookkeeping rides the feature branch; Colonel merges the PR.
- **Acceptance:** Per `sprint/context/context-story-5-5.md` — 8 ACs covering init, gesture gating, event mapping, event collection, particle verification, debug-free code, shell-only scope, and manual playtest.

## Dev Assessment

**Implementation Complete:** Yes

**Files Changed:**
- `src/shell/loop.ts` — accumulate every sub-step's `GameEvent`s into a per-frame `frameEvents: GameEvent[]` and pass it as a second arg to the `draw` callback (signature now `draw(s, frameEvents: readonly GameEvent[])`). Fixes the fixed-timestep drop: `stepGame()` clears `state.events` each step, so the post-loop state only carries the last sub-step's events.
- `src/main.ts` — create the AudioEngine; gate it on the first user gesture (`click`/`keydown` → idempotent `audio.resume()`); in the draw callback, map each accumulated `GameEvent` to its sound via an exhaustive `switch` (8 types → fire/enemyDeath/playerGrab/playerDeath/warpSpikeCrash/levelClear/superzapper/playerSpawn).

**Verified (don't-rebuild):** Fx wiring untouched and correct — `fx.detect(s, rdt)` → `fx.update(rdt)` → `render(ctx, s, W, H, fx, dpr)` in order. `src/core/` untouched (hard boundary intact).

**Tests:** 269/269 passing (GREEN). `tsc --noEmit` strict clean — the compiler proves the event→sound `switch` is exhaustive over the `GameEvent` union. `vite build` succeeds (28.98 KB / 9.65 KB gzip).

**Live browser smoke (Playwright @ localhost:5273):** Page boots clean (only a benign `favicon.ico` 404). A keypress gesture unlocked the `AudioContext` and triggered fetches for **all 8** R2 `.wav` samples — proving gesture-gating (no fetch before interaction) and the full resume→load chain end-to-end. No wiring errors. Literal audio playback (speakers) remains the Colonel's final manual listen (AC8).

**ACs:** AC1 ✓ AC2 ✓ AC3 ✓ AC4 ✓ (accumulate-across-sub-steps, not lossy drain) AC5 ✓ AC6 ✓ (no debug code) AC7 ✓ (shell-only, build+tests clean) AC8 ✓ pipeline verified live; final listen deferred to manual playtest.

**Branch:** `feat/5-5-wire-audio-particles-loop` (pushed)

**Handoff:** To Reviewer (General Burkhalter).

## Subagent Results

| # | Specialist | Received | Status | Findings | Decision |
|---|-----------|----------|--------|----------|----------|
| 1 | reviewer-preflight | Yes | clean | none | N/A |
| 2 | reviewer-edge-hunter | No | Skipped | disabled | Disabled via settings — assessed manually (see [EDGE] below) |
| 3 | reviewer-silent-failure-hunter | No | Skipped | disabled | Disabled via settings — assessed manually (see [SILENT] below) |
| 4 | reviewer-test-analyzer | No | Skipped | disabled | Disabled via settings — assessed manually (see [TEST] below) |
| 5 | reviewer-comment-analyzer | No | Skipped | disabled | Disabled via settings — assessed manually (see [DOC] below) |
| 6 | reviewer-type-design | No | Skipped | disabled | Disabled via settings — assessed manually (see [TYPE] below) |
| 7 | reviewer-security | No | Skipped | disabled | Disabled via settings — assessed manually (see [SEC] below) |
| 8 | reviewer-simplifier | No | Skipped | disabled | Disabled via settings — assessed manually (see [SIMPLE] below) |
| 9 | reviewer-rule-checker | Yes | findings | 1 (Rule 3: missing exhaustiveness guard) | confirmed 1 (LOW, non-blocking) |

**All received:** Yes (2 enabled subagents returned; 7 disabled via `workflow.reviewer_subagents` and assessed manually)
**Total findings:** 1 confirmed (LOW, non-blocking), 0 dismissed, 0 deferred

## Reviewer Assessment

**Verdict:** APPROVED

A clean, minimal, shell-only integration. The hard architectural boundary is intact, all 8 gameplay events are wired, and the fixed-timestep event-collection hazard the SM flagged was handled correctly (accumulate across sub-steps, not the lossy single-step drain). 269 tests green, tsc strict clean, build clean. One LOW non-blocking robustness finding (missing exhaustiveness guard) — does not block; logged for follow-up.

**Data flow traced:** core `stepGame()` pushes `GameEvent`s onto `state.events` each sub-step → loop's `frameEvents` accumulates references after every sub-step (`loop.ts:56`) → `draw(state, frameEvents)` (`loop.ts:67`) → `main.ts` switch maps each event to `audio.play(name)` → `audio.ts` plays a decoded buffer, or no-ops if unloaded/locked. Safe end-to-end: events are immutable data, `frameEvents` is `readonly` at the callback boundary, and `play()` swallows all WebAudio failures by design.

### Observations (tagged by domain)

- **[RULE][TYPE] [LOW]** Missing exhaustiveness guard at `src/main.ts:64`. The `switch (event.type)` handles all 8 current `GameEvent` variants, but has no `default: assertNever(event)` (nor `const _: never = event`). TypeScript does **not** enforce exhaustiveness on a side-effecting switch, so adding a 9th variant to the `GameEvent` union in `core/events.ts` would compile silently and play no sound for it. Confirmed (matches lang-review TypeScript Rule 3). **Non-blocking** — functionally complete today; this is future-proofing. Logged as a delivery finding.
- **[VERIFIED]** Event accumulation is correct — `frameEvents` is a fresh `[]` per frame (`loop.ts:42`), appended after each `stepGame()` (`loop.ts:56`); on frames where `acc < STEP` no sub-step runs, so `frameEvents` stays empty and `draw(state, [])` plays nothing — no spurious replays. Event objects are freshly created per step, so pushed references can't be clobbered by a later step.
- **[VERIFIED]** Core purity boundary intact (CLAUDE.md hard rule) — `src/core/` untouched; `loop.ts`/`main.ts` import **from** core (`GameEvent`, `stepGame`), never the reverse; `GameEvent` crosses the boundary as plain data, not a callback or DOM handle. Verified via `git diff` (no `src/core/` files) and the rule-checker's boundary pass.
- **[VERIFIED]** Audio gesture-gating correct — `audio.resume()` is idempotent and bound to `click`/`keydown` (`main.ts:41-42`); `play()` is a no-op until a buffer decodes (`audio.ts:104-107`). Pre-gesture events are silently skipped — matches AC2. Confirmed live: the Playwright smoke showed no R2 fetch until a keypress, then all 8 samples loaded.
- **[VERIFIED]** All 8 union variants handled — `fire`, `enemy-death`, `player-grab`, `player-death`, `warp-spike-crash`, `level-clear`, `superzapper-activate`, `player-spawn` map 1:1 to the `events.ts` union and to the `audio.ts` `SoundName` keys. Functionally exhaustive today (by inspection, not by compiler — see the [RULE] finding).
- **[SILENT] [VERIFIED]** No new silent-failure path introduced. `audio.play()`'s internal try/catch and silent-degrade are pre-existing and intentional (5-2 design: missing sound ≠ crash). Nothing in this diff swallows an error.
- **[TEST] [LOW]** No direct unit test for `frameEvents` accumulation. Acceptable: the changed `draw` signature is exercised by the existing `loop.test.ts` (the multi-sub-step `onModeChange` cases run the same `while (acc >= STEP)` path), 269 tests pass, and CLAUDE.md prescribes shell verification "by running the game and Playwright smoke tests" — which the Dev did. Non-blocking; a focused accumulation test would be a nice follow-up.
- **[DOC]** Comments are accurate and well-placed. One record-keeping nit: the Dev Assessment claims "tsc proves the event→sound switch is exhaustive" — tsc does **not** enforce that here (no never-assignment); the switch is exhaustive by inspection. The shipped code/comments are fine; the overstated claim is only in the assessment.
- **[SEC] [VERIFIED]** No security surface. `unlockAudio` handles no user-supplied data (only calls `resume()`); no input parsing, no `JSON.parse`, no injection vector. Sample URLs are a fixed manifest (pre-existing 5-2).
- **[SIMPLE] [VERIFIED]** Minimal and non-over-engineered. The accumulate-in-loop pattern is the spec's recommended approach; the per-frame `[]` allocation is O(events) (typically 0–3/frame) inside rAF — negligible. No dead code, no needless abstraction.

### Rule Compliance

Project rules: CLAUDE.md (hard architectural boundary, style) + lang-review `typescript.md` (13 checks). No `.claude/rules/` or `SOUL.md` present. Enumerated against every changed type/function:

- **CLAUDE.md — core purity:** `src/core/` not modified; shell→core import direction only; `GameEvent` flows as data. ✓ COMPLIANT (every changed file checked).
- **CLAUDE.md — shell freedom (DOM/wall-clock/Math.random allowed in shell):** `addEventListener`, `performance.now()`, `requestAnimationFrame` all in shell. ✓ COMPLIANT.
- **CLAUDE.md — style/idiom:** new blocks carry explanatory comments matching surrounding density. ✓ COMPLIANT.
- **TS Rule 1 (type-safety escapes):** no `as any`/`@ts-ignore`/new `!`. ✓
- **TS Rule 2 (readonly on non-mutated params):** `frameEvents: readonly GameEvent[]` correctly readonly. ✓
- **TS Rule 3 (switch exhaustiveness):** `switch (event.type)` — ✗ VIOLATION (LOW): no `default: assertNever`. Sole finding.
- **TS Rule 4 (null/undefined, `||` vs `??`):** no nullable handling introduced; `for…of` over non-null array. ✓
- **TS Rule 5 (module/declaration):** `import { GameEvent }` is type-only-used but value-imported — consistent with the file's existing `GameState`/`Mode`/`Input` imports and legal under this tsconfig (no `verbatimModuleSyntax`/`isolatedModules`). ✓ (pre-existing style, not a regression). `createAudioEngine` correctly value-imported.
- **TS Rules 6–13:** N/A or clean (no JSX, no new async/await, no tests changed, no tsconfig change, no user-input validation surface, no new catch, no bundle/perf concern, no fix-regression). ✓

### Devil's Advocate

Let me argue this code is broken. **First attack — dropped sounds.** The whole story exists because `state.events` only carries the last sub-step. Did they actually fix it, or just move the bug? I traced it: `frameEvents` is declared inside `frame()` (fresh each call), the push runs *inside* the `while (acc >= STEP)` loop after every `stepGame`, and `draw` receives the accumulated list. So two enemy deaths in different sub-steps both reach audio. The lossy path is genuinely avoided. **Second attack — spurious or doubled sounds.** Could an event replay? On a frame with no sub-step, the `if (acc >= STEP)` block never runs, `frameEvents` is `[]`, nothing plays — good, no replay of the previous frame's kills. Could the same event object be pushed twice? No — each `stepGame` produces a new events array with new objects; we copy references once. **Third attack — the autoplay gate.** A confused user who never clicks/keys hears nothing — but that's the browser's policy, correctly respected; the first gesture unlocks it, and `keydown` covers the keyboard-only player who never clicks the canvas. `resume()` firing on *every* keypress is harmless (idempotent, cheap branch). **Fourth attack — the missing default.** This is the real weakness: a future dev adds a `bonus-life` event to the union, tsc stays silent, and the sound never plays — a silent regression caught only by ear in playtest. That is precisely the rule finding; it is a maintainability hazard, not a current defect, so LOW and non-blocking. **Fifth attack — performance.** Allocating `[]` every rAF frame: at 60fps that's 60 tiny arrays/sec, collected trivially; not a concern for a vector game. **Sixth — stressed environment.** If R2 is unreachable, `play()` no-ops (verified in 5-2's catch); the game stays silent but playable. No crash path. Conclusion: no Critical/High emerges; the only legitimate dent is the exhaustiveness guard, already logged.

**Handoff:** To SM (Colonel Hogan) for finish-story.

## Delivery Findings

Agents record upstream observations discovered during their phase.
Each finding is one list item. Use "No upstream findings" if none.

**Types:** Gap, Conflict, Question, Improvement
**Urgency:** blocking, non-blocking

<!-- Agents: append findings below this line. Do not edit other agents' entries. -->

### Dev (implementation)
- **Improvement** (non-blocking): The story context (`context-story-5-5.md`) refers to the bootstrap file as both `src/main.ts` and `src/shell/main.ts` interchangeably (e.g. AC7 says "src/shell/main.ts"). The actual bootstrap lives at `src/main.ts` — there is no `src/shell/main.ts`. Affects `sprint/context/context-story-5-5.md` (doc-only; correct the path references in any future story context). *Found by Dev during implementation.*

### Reviewer (code review)
- **Improvement** (non-blocking): The event→sound `switch` in `src/main.ts:64` has no `default: assertNever(event)` exhaustiveness guard, so a future addition to the `GameEvent` union (`src/core/events.ts`) would compile silently and play no sound for the new variant. Affects `src/main.ts` (add a `default` branch asserting `event` is `never`; there is no `assertNever` helper in the codebase yet, so this also seeds one). Matches lang-review TypeScript Rule 3. *Found by Reviewer during code review.*

## Design Deviations

Agents log spec deviations as they happen — not after the fact.
Each entry: what was changed, what the spec said, and why.

<!-- Agents: append deviations below this line. Do not edit other agents' entries. -->

### Dev (implementation)
- No deviations from spec. The context's "recommended pattern" was to accumulate `state.events` across sub-steps inside the loop and pass the list to the draw callback; that is exactly what was implemented (loop accumulates `frameEvents`, the `draw` signature gains a `readonly GameEvent[]` arg). The "alternative (simpler but lossy)" in-draw drain was explicitly declined because the loop demonstrably runs multiple sub-steps per frame.

### Reviewer (audit)
- **Dev: "No deviations from spec" (chose the recommended accumulate-in-loop pattern over the lossy drain)** → ✓ ACCEPTED by Reviewer: verified the implementation matches the context's recommended pattern exactly, and the declined "alternative" was correctly declined because `loop.ts` runs multiple sub-steps per frame (`while (acc >= STEP)`). No undocumented deviations found in the diff.