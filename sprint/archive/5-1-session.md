---
story_id: "5-1"
jira_key: ""
epic: "5"
workflow: "tdd"
---
# Story 5-1: Pure-core game event channel

## Story Details
- **ID:** 5-1
- **Title:** Pure-core game event channel
- **Jira Key:** (no Jira for this project)
- **Workflow:** tdd
- **Repo:** tempest
- **Slug:** pure-core-game-event-channel
- **Stack Parent:** none

## Workflow Tracking
**Workflow:** tdd
**Phase:** finish
**Phase Started:** 2026-06-26T13:21:34Z
**Round-Trip Count:** 1

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-06-26T12:22:32.165243+00:00 | - | - |
| red | 2026-06-26T12:22:32.165243+00:00 | 2026-06-26T12:37:53Z | 15m 20s |
| green | 2026-06-26T12:37:53Z | 2026-06-26T12:53:35Z | 15m 42s |
| review | 2026-06-26T12:53:35Z | 2026-06-26T13:05:43Z | 12m 8s |
| green | 2026-06-26T13:05:43Z | 2026-06-26T13:10:41Z | 4m 58s |
| review | 2026-06-26T13:10:41Z | 2026-06-26T13:21:34Z | 10m 53s |
| finish | 2026-06-26T13:21:34Z | - | - |

## Story Context

### Technical Approach
The core (src/core/) must emit structured, deterministic gameplay events that the shell can consume to drive audio (5-2/5-5) and particles (5-3/5-4). Events are data structures carried in/returned from GameState, never callbacks. All events are deterministic (seeded RNG + dt only).

**Event types defined in new `src/core/events.ts`:**
- `EnemyDeathEvent` — enemy eliminated (lane, depth, type)
- `PlayerGrabEvent` — player grabbed by enemy or hit by pulse
- `FireEvent` — bullet fired (lane, depth)
- `WarpSpikeCrashEvent` — spike collision during warp
- `LevelClearEvent` — all enemies defeated, advancing level
- `SuperzapperActivateEvent` — superzapper used (kill count)
- `PlayerSpawnEvent` — player respawned (lane)
- `PlayerDeathEvent` — player died (cause: grab | pulse | spike)

**GameState integration:**
- Add `events: GameEvent[]` to GameState in `src/core/state.ts`
- Clear events array at start of each stepGame frame
- Emit events as collisions, kills, and level transitions occur in stepGame and sub-steppers

**Pure-core preservation:**
- No callbacks, DOM, Date.now(), Math.random(), or shell imports
- All time via dt; all randomness via seeded state.rng
- stepGame(state, input, dt) → state remains pure function
- Events are deterministic output data, not side effects

**Scope:** Core-only; event definitions, GameState field, stepGame emissions. Wiring into shell happens in 5-5.

### Acceptance Criteria
1. `GameEvent` discriminated-union type covers all gameplay events (enemy death, player grab/death, fire, warp-spike crash, level-clear, superzapper).
2. `GameState` carries `events: GameEvent[]`; initial state has `events: []`.
3. `stepGame` clears and populates events array; fixed RNG seed + input yields deterministic event sequences.
4. Collision events (bullet↔enemy, grab, pulse, spike) are emitted with correct lane/depth/type.
5. Level-clear and superzapper activation emit corresponding events.
6. No debug code; pure-core boundary preserved (no shell imports, Date, Math.random, DOM).
7. All existing core tests pass; new event-assertion tests cover ACs above.

## TEA Assessment

### Red Phase (test writing)

**Tests Required:** Yes
**Reason:** New pure-core feature (event channel) with deterministic data emissions across many gameplay sites — classic TDD core work, not a chore.

**Test Files:**
- `tests/core/events.test.ts` — static contract: `GameEvent` discriminated-union shape (typed fixtures + exhaustive `switch`), `GameState.events` initial-empty (AC2), and pure-core boundary + debug-residue source scans of `events.ts`/`sim.ts`/`state.ts` (AC6/AC7).
- `tests/core/sim.events.test.ts` — emission behaviour through `stepGame`: fire, enemy-death (bullet ×N + superzapper), player-grab/player-death (grab & pulse causes), warp-spike-crash (spike cause), level-clear, superzapper-activate, player-spawn, per-frame reset, and determinism (single-frame + a 120-frame RNG-driven replay + no-input-mutation).

**Tests Written:** 34 tests covering all 8 ACs (AC1 enforced at `tsc --noEmit`; AC2–AC8 at runtime).
**Status:** RED (failing — ready for Dev). Verified via `testing-runner` (RUN_ID `5-1-tea-red`): 34 new failing, 235 pre-existing passing, **zero regressions**. All failures trace solely to the absent `src/core/events.ts` and missing `GameState.events` field.

### Rule Coverage

| Rule (typescript.md) | Test(s) | Status |
|------|---------|--------|
| #3 enum/union exhaustiveness (`default: never`) | `events.test.ts` → `discriminant()` exhaustive `switch (e.type)` with `const _exhaustive: never = e` | failing (tsc) |
| #3 string-union over enums | `events.test.ts` → `ALL_EVENTS` typed fixtures pin the literal-union shape | failing (tsc) |
| #1 type predicates have runtime validation | `sim.events.test.ts` → `eventsOfType` predicate guards on `e.type === type` (compliant, not vacuous) | n/a (test self-compliance) |
| #8 no `as any` in tests | both files — narrowing via `Extract<>` predicates, zero `as any` | n/a (test self-compliance) |
| CLAUDE.md hard boundary (pure core) | `events.test.ts` → FORBIDDEN source scan (no Date/random/perf/RAF/DOM/shell-import) | failing (events.ts absent) |

**Rules checked:** Applicable TS-checklist rules are #3 (exhaustiveness — directly enforced) and test-quality #1/#8 (own tests compliant). Checks #6/#7/#9/#10/#11/#12 (React, async, build-config, input-validation, error-handling, bundle) are N/A — this is a synchronous, IO-free, pure data-type addition.
**Self-check:** No vacuous assertions. Every test asserts a payload value or a count; equality-based determinism tests guard against vacuous empty-equality with explicit `length > 0` checks.

**Handoff:** To Dev (Sergeant Carter) for implementation — create `src/core/events.ts` with the 8-variant `GameEvent` union, add `events: GameEvent[]` to `GameState` (init `[]`), and emit from `stepFiring` / `resolveBulletHits` / `stepZap` / `resolvePlayerHits` / `resolveWarpSpikeHit` / `checkLevelClear` / `respawn`. Clear `state.events` at frame start. See Delivery Findings for the two open implementation choices.

## Dev Assessment

**Implementation Complete:** Yes (green rework — Reviewer findings resolved)

**Files Changed:**
- `src/core/events.ts` (new) — `GameEvent` discriminated union: 8 variants (`enemy-death`, `player-grab`, `fire`, `warp-spike-crash`, `level-clear`, `superzapper-activate`, `player-spawn`, `player-death`), pure data. **Rework:** `enemyType` and `killedBy` tightened from `string` to the `EnemyKind` union via `import type { EnemyKind } from './state'` (compile-time-only — no runtime import cycle). Resolves both Reviewer HIGH findings.
- `src/core/state.ts` — added `events: GameEvent[]` to `GameState` (`import type { GameEvent }`); `initialState` seeds `events: []`.
- `src/core/sim.ts` — `cloneState` resets `events: []` each frame (clears prior + no input aliasing); emissions added to `stepFiring` (fire), `resolveBulletHits` (enemy-death), `stepZap` (enemy-death ×N + superzapper-activate, full & weak), `resolvePlayerHits` (player-grab + player-death grab/pulse), `resolveWarpSpikeHit` (warp-spike-crash + player-death spike), `checkLevelClear` (level-clear), `respawn` (player-spawn).
- `tests/core/sim.events.test.ts` (TEA file) — fixed 2 fire-test preconditions; `import { Input }` → `import type { Input }` (Reviewer LOW finding); removed an unused import (see Dev deviations).
- `tests/core/events.test.ts` (TEA file) — purity scan switched from `node:fs` to Vite `?raw` (see Dev deviations).
- `tests/raw-imports.d.ts` (new) — ambient `declare module '*?raw'` for the boundary scan.

**Reviewer findings resolved (all 3):**
- [HIGH] `enemyType: string` → `EnemyKind` (`events.ts:18`) ✓
- [HIGH] `killedBy: string` → `EnemyKind` (`events.ts:32`) ✓
- [LOW] `import { Input }` → `import type { Input }` (`sim.events.test.ts:20`) ✓

**Tests:** 269/269 passing (GREEN). `npx tsc --noEmit` clean. Verified via `testing-runner` (RUN_ID `5-1-dev-green`). Zero regressions — type-only change, no logic touched.

**Pure-core boundary:** preserved — `events.ts` carries only pure type data; the new `import type { EnemyKind }` is erased at compile time (no runtime import, no cycle). No `Date`/`Math.random`/`performance`/DOM/shell imports anywhere in the channel (enforced by the boundary scan AND the determinism replay test).

**Handoff:** Back to Reviewer (General Burkhalter) for re-review.

## Delivery Findings

### TEA (test design)
- **Question** (non-blocking): A full-charge superzapper fired with zero enemies on screen still consumes the charge (`full → used-once`) but kills nothing — `stepZap` early-returns. Whether that emits `superzapper-activate { killCount: 0 }` or no event is unspecified, and the RED suite deliberately does NOT assert it. Affects `src/core/sim.ts` (`stepZap`) — Dev should pick a behavior and note it in the implementation.
- **Improvement** (non-blocking): `cloneState` in `src/core/sim.ts` spreads `...s` and only deep-copies listed fields; the new `events` array will be carried by reference. Since `stepGame` must replace `state.events` with a fresh array at frame start (AC3), ensure the clear/replace happens BEFORE any emission so a step never mutates the input's `events` (covered by the "does not mutate the input state's events" test). Affects `src/core/sim.ts`.
- **Note** (non-blocking): AC1's union/field contract is enforced at `npx tsc --noEmit` (the `import type { GameEvent }` fixtures + exhaustive switch), not at Vitest runtime — keep the typecheck in the GREEN gate so a renamed field is caught.

### Dev (implementation)
- **Improvement** (non-blocking): `EnemyDeathEvent.enemyType` / `PlayerGrabEvent.killedBy` are typed `string` (per the story context) — downstream 5-2/5-5 SFX mapping won't get an exhaustive `EnemyKind` switch. Affects `src/core/events.ts` (tighten to `EnemyKind` once the `events ↔ state` type-import cycle is broken, if exhaustiveness is wanted). *Found by Dev during implementation.*
- **Gap** (non-blocking): No `player-spawn` event fires on the warp-crash respawn (routes through `advanceLevel`) or at game start (`startGameAtLevel`) — only on the normal mid-level respawn. Affects `src/core/sim.ts` (`respawn` / `startGameAtLevel`) — add emissions there if 5-5 needs a spawn cue for those moments. *Found by Dev during implementation.*
- **Note** (non-blocking): `cloneState` now sets `events: []` each frame (fresh channel), satisfying TEA's clear-before-emit improvement — the per-frame reset and no-input-mutation are both covered by tests. *Found by Dev during implementation.*
- **Note** (non-blocking): Green rework — resolved both Reviewer HIGH findings (`enemyType`/`killedBy` → `EnemyKind`) and the LOW finding (`import type { Input }`). Type-only change, no logic touched; `npx tsc --noEmit` clean, 269/269 green. *Found by Dev during green rework.*

### Reviewer (code review)
- **Improvement** (blocking): `EnemyDeathEvent.enemyType` and `PlayerGrabEvent.killedBy` are typed `string` instead of the existing `EnemyKind` union — the published contract this whole story delivers to 5-2/5-5/5-6 loses exhaustiveness and typo-safety. Affects `src/core/events.ts:17,27` (change both to `EnemyKind`, add `import type { EnemyKind } from './state'`). Dev's "import cycle" objection is unfounded — `import type` is erased, so there is no runtime cycle. *Found by Reviewer during code review.*
- **Improvement** (non-blocking): `import { Input }` should be `import type { Input }` for consistency with the three `import type` lines above it and `isolatedModules` safety. Affects `tests/core/sim.events.test.ts:20`. *Found by Reviewer during code review.*
- **Note** (non-blocking): The `docs:` commit (README.md / INSTALLATION.md) rides on this core-story branch. Out of scope but benign and cleanly isolated in its own commit. *Found by Reviewer during code review.*
- **Note** (non-blocking): Round-2 re-review — the Round-1 blocking `string`→`EnemyKind` finding is RESOLVED (events.ts:22,32) and the LOW `import type { Input }` is applied. No new upstream findings during the green rework. *Found by Reviewer during code review (round 2).*

## Design Deviations

### TEA (test design)
- **AC1 type-guards tested via discriminant narrowing, not named guard functions**
  - Spec source: context-story-5-1.md, AC1
  - Spec text: "Type guards exist for narrowing (e.g., `isPlayerGrabEvent(e)` or TypeScript `as const` discrimination)."
  - Implementation: `events.test.ts` enforces the union with a typed fixture array + an exhaustive `switch (e.type)` that fails to compile if a variant/field is renamed or added. No named `isXEvent` guards are required.
  - Rationale: AC1 explicitly offers `as const` discrimination as an alternative; mandating named guards would couple tests to an optional API and over-constrain Dev.
  - Severity: minor
  - Forward impact: Dev may add named guards if desired, but is not obligated to. Downstream (5-5/5-6) narrows by `.type`.

- **LevelClearEvent pinned to the clear moment with newLevel = current+1**
  - Spec source: context-story-5-1.md, AC5 / Technical Approach line 45
  - Spec text: "When all enemies are cleared: push `LevelClearEvent`" / "`LevelClearEvent { type: 'level-clear', newLevel: number }`"
  - Implementation: test asserts the event fires on the frame the board clears (entering the warp, `checkLevelClear`), carrying `newLevel === level + 1` (the geometry being advanced to). Starting at level 1 → `newLevel: 2`.
  - Rationale: The "you cleared the wave" cue should fire at the triumphant clear moment (warp entry), not on warp arrival; `newLevel` names the level being entered. The numeric value (old+1) is stable whether emitted at `checkLevelClear` or `advanceLevel`.
  - Severity: minor
  - Forward impact: If Dev emits at `advanceLevel` instead, the "enters warp" test will fail — emit at `checkLevelClear`.

- **SuperzapperActivateEvent emitted for both full blast AND weak shot**
  - Spec source: context-story-5-1.md, AC5
  - Spec text: "When superzapper is activated or spent, a `SuperzapperActivateEvent` is emitted (if activated) or none (if spent)."
  - Implementation: tests assert a full blast emits one activate (`killCount = N`), a weak shot emits one activate (`killCount = 1`), and a spent no-op emits none. `killCount` = enemies destroyed that activation.
  - Rationale: Both full and weak shots are activations of the charge; only the already-`spent` no-op emits nothing. Disambiguates the spec's terse phrasing.
  - Severity: minor
  - Forward impact: see Delivery Findings — the zero-enemy full activation (charge consumed, no kills) is intentionally NOT asserted; Dev chooses.

- **Pulse death emits player-grab (killedBy pulsar) in addition to player-death(cause pulse)**
  - Spec source: context-story-5-1.md, Technical Approach line 42
  - Spec text: "`PlayerGrabEvent` — player grabbed by enemy or hit by pulse"
  - Implementation: the pulsing-pulsar test asserts BOTH a `player-grab` (`killedBy: 'pulsar'`) and a `player-death` (`cause: 'pulse'`).
  - Rationale: The context explicitly folds pulse hits into the player-grab channel; cause is disambiguated on the death event.
  - Severity: minor
  - Forward impact: Dev must attribute `killedBy` to the pulsing pulsar on the player's lane.

### Dev (implementation)
- **`enemyType`/`killedBy` tightened from `string` to `EnemyKind` (green rework — Reviewer blocking finding resolved)**
  - Spec source: context-story-5-1.md, Technical Approach (event sketch, lines 26 & 29); Reviewer Assessment severity table (HIGH ×2)
  - Spec text: "`EnemyDeathEvent { type: 'enemy-death', enemyType: string, ... }`" / "`PlayerGrabEvent { ..., killedBy: string }`" (the context's literal `string`) vs. Reviewer: "`enemyType: EnemyKind`; add `import type { EnemyKind } from './state'`"
  - Implementation: `events.ts:17,27` now type both fields as the `EnemyKind` union via `import type { EnemyKind } from './state'`. This is NO LONGER A DEVIATION — the code now matches the existing `EnemyKind` contract the emit sites already produce (`e.kind`/`killer.kind`).
  - Rationale: My original `string` choice (to dodge a presumed `events ↔ state` circular import) was wrong — `import type` is fully erased at compile time, so there is no runtime cycle. Reviewer (HIGH) is correct: the published contract for 5-2/5-5/5-6 must be the exhaustive union so downstream `switch` gets `assertNever` coverage and typo rejection.
  - Severity: minor
  - Forward impact: positive — downstream (5-2/5-5/5-6) now narrows on the exhaustive `EnemyKind` union, gaining compile-time exhaustiveness and typo-safety. No runtime/behavioural change; all 269 tests stay green (`'flipper'` etc. are valid `EnemyKind` literals).

- **Zero-enemy full superzapper activation emits NO event**
  - Spec source: session Delivery Findings (TEA Question), context-story-5-1.md AC5
  - Spec text: TEA: "Whether that emits `superzapper-activate { killCount: 0 }` or no event is unspecified ... Dev should pick a behavior."
  - Implementation: `stepZap`'s early-return branch (spent OR no enemies) consumes a full charge silently — no `superzapper-activate`, no `enemy-death`.
  - Rationale: No enemies destroyed = no audible/visual zap payload; emitting a `killCount: 0` activation would make the shell play a "zap killed things" cue for a no-op. Simplest and matches the "none if spent" half of the AC.
  - Severity: minor
  - Forward impact: If 5-5 wants a "charge wasted" sound for a full blast into empty space, that needs a follow-up event; not covered here.

- **`player-spawn` emitted only on the normal mid-level respawn**
  - Spec source: context-story-5-1.md, Technical Approach (PlayerSpawnEvent), TEA `sim.events.test.ts`
  - Spec text: "`PlayerSpawnEvent` — player respawned (lane)"
  - Implementation: emitted in `respawn`'s normal path only — NOT on the warp-crash respawn (which routes through `advanceLevel`) nor at game start (`startGameAtLevel`).
  - Rationale: Only the normal-respawn moment has a test; minimalist discipline — no event without a test demanding it. The other two paths can add it if a cue is needed.
  - Severity: minor
  - Forward impact: 5-5 will not get a `player-spawn` on the first level or after a warp crash; revisit if those moments need a spawn cue.

- **Adjusted two TEA fire tests' board setup (precondition only, assertions unchanged)**
  - Spec source: `tests/core/sim.events.test.ts` (TEA RED suite), AC4
  - Spec text: fire tests asserted `out.bullets` length 1 / `MAX_BULLETS` while set up with `playing([])` (empty board, `spawn.remaining: 0`).
  - Implementation: added `s.spawn.remaining = 1` to the two `out.bullets`-asserting fire tests so the empty board does not trip `checkLevelClear` (which correctly wipes `bullets` on warp entry, long-standing behaviour from Story 3-2). All fire/bullet assertions kept verbatim.
  - Rationale: The empty-board setup inadvertently exercised the level-clear path; the bullet-wipe is correct gameplay, so the test precondition — not the implementation — was the bug. Fixing the precondition preserves the intended fire-emission contract.
  - Severity: minor
  - Forward impact: none — tests now exercise a normal mid-level fire.

- **Replaced `node:fs` purity scan with Vite `?raw` imports + `tests/raw-imports.d.ts`**
  - Spec source: `tests/core/events.test.ts` (TEA RED suite), AC6
  - Spec text: pure-core boundary scan read core source via `import { readFileSync } from 'node:fs'`.
  - Implementation: switched to static `import … from '…?raw'` and added an ambient `declare module '*?raw'`. Same regex coverage, same files scanned.
  - Rationale: `tsconfig` is deliberately browser-pure (`types: ["vitest/globals"]`, no `@types/node`); `node:fs` failed `tsc --noEmit` (TS2307). Adding Node types to a story about keeping the core browser-pure would be self-defeating; `?raw` reads source as text without Node types.
  - Severity: minor
  - Forward impact: none — establishes the `?raw`/ambient-module pattern for any future source-text test.

### Reviewer (audit)
- TEA #1 (type-guards via discriminant narrowing) → ✓ ACCEPTED: the exhaustive `switch` + `never` default is a stronger compile-time guard than named guards; downstream narrows by `.type`.
- TEA #2 (LevelClearEvent at clear moment, `newLevel = level+1`) → ✓ ACCEPTED: verified at `checkLevelClear` (sim.ts:340), emitted before the warp mode flip; value is correct.
- TEA #3 (SuperzapperActivateEvent for full AND weak shot) → ✓ ACCEPTED: sensible disambiguation; `killCount` carries the kill total.
- TEA #4 (pulse death emits player-grab) → ✓ ACCEPTED: matches context line 42 ("grabbed by enemy or hit by pulse"); verified at sim.ts:255.
- Dev #1 (`enemyType`/`killedBy` typed `string`, not `EnemyKind`) → ✗ FLAGGED by Reviewer: this weakens the foundational contract for 5-2/5-5/5-6; the "circular import" rationale is unfounded because `import type` is erased (no runtime cycle). Corroborated independently by `reviewer-rule-checker` (rule #3, high). **Blocking — see severity table.**
- Dev #2 (zero-enemy full superzapper emits nothing) → ✓ ACCEPTED: a no-kill blast needs no "killed things" cue; consistent with the "none if spent" half of AC5.
- Dev #3 (`player-spawn` only on normal respawn) → ✓ ACCEPTED: minimalist; documented as a Gap; warp-crash/game-start cues can be added by 5-5 if needed.
- Dev #4 (adjusted 2 fire tests' board setup) → ✓ ACCEPTED: the empty board genuinely tripped `checkLevelClear` (which correctly wipes bullets, Story 3-2); the precondition — not the implementation — was the bug; assertions are unchanged.
- Dev #5 (`node:fs` → Vite `?raw` + ambient decl) → ✓ ACCEPTED: correct call — preserves the browser-pure `tsconfig` posture; rule-checker confirmed the ambient `declare module '*?raw'` is a clean type stub (rule #5).

#### Reviewer (audit) — Round 2 (green rework)
- Dev #1 (rework: `enemyType`/`killedBy` tightened `string` → `EnemyKind`) → ✓ ACCEPTED — **prior Round-1 FLAG RESOLVED.** Both fields are now `EnemyKind` (events.ts:22,32) via `import type { EnemyKind } from './state'`. Re-verified by `reviewer-rule-checker` round 2 (rule #3 resolved, rule #5 import-type correct, rule #13 no fix-regression, 0 violations) and my own read of the diff. The type-only circular reference (events.ts ↔ state.ts, both `import type`) is fully erased — `tsc --noEmit` clean, no runtime cycle. Dev's original "circular import" worry is now correctly retired in the deviation note.
- Dev's test `import { Input }` → `import type { Input }` (Round-1 LOW) → ✓ ACCEPTED — applied (sim.events.test.ts:20); consistent with the other type-only imports, isolatedModules-safe.
- No new deviations introduced by the rework. All Round-1 ACCEPTED stamps stand unchanged (the rework touched only the two field types + one test import).

## Subagent Results

_Round 2 (green-rework re-review). Toggles unchanged: `preflight` + `rule_checker` enabled, 7 disabled via `workflow.reviewer_subagents`._

| # | Specialist | Received | Status | Findings | Decision |
|---|-----------|----------|--------|----------|----------|
| 1 | reviewer-preflight | Yes | clean | none | N/A (tsc clean, 269/269 tests, vite build 27.5kB clean, 0 smells; out-of-scope `epic-5.yaml`/`sfx/` noted non-blocking) |
| 2 | reviewer-edge-hunter | No | Skipped | disabled | Disabled via settings — assessed manually (see [EDGE]); rework is type-only, no new paths |
| 3 | reviewer-silent-failure-hunter | No | Skipped | disabled | Disabled via settings — assessed manually (see [SILENT]) |
| 4 | reviewer-test-analyzer | No | Skipped | disabled | Disabled via settings — assessed manually (see [TEST]) |
| 5 | reviewer-comment-analyzer | No | Skipped | disabled | Disabled via settings — assessed manually (see [DOC]) |
| 6 | reviewer-type-design | No | Skipped | disabled | Disabled via settings — type design covered by rule-checker (see [TYPE]) |
| 7 | reviewer-security | No | Skipped | disabled | Disabled via settings — assessed manually (see [SEC]) |
| 8 | reviewer-simplifier | No | Skipped | disabled | Disabled via settings — assessed manually (see [SIMPLE]) |
| 9 | reviewer-rule-checker | Yes | clean | 0 (14 rules, 24 instances) | both prior rule #3 violations RESOLVED; #5/#13 verified clean; 0 new violations |

**All received:** Yes (2 enabled specialists returned clean; 7 disabled via `workflow.reviewer_subagents` and assessed manually)
**Total findings:** 0 confirmed, 0 dismissed, 0 deferred — both Round-1 blocking findings resolved by the rework

### Round 1 (REJECTED) — historical
Round 1 ran the same toggles; `reviewer-rule-checker` returned 2 confirmed blocking findings (both rule #3 — `enemyType`/`killedBy` typed `string`). Those were the rejection basis and are now fixed. Round-1 detail preserved in the Reviewer Assessment "Round 1" note below.

## Reviewer Assessment

**Verdict:** APPROVED (Round 2 — green-rework re-review)
**Data flow traced:** enemy `kind` (`EnemyKind`) → `sim.ts` emit sites (`enemyType: e.kind` / `killedBy: killer.kind`) → `GameEvent` payload on `state.events` → consumed by shell (5-2/5-5/5-6). The contract is now end-to-end `EnemyKind`-typed: a downstream `switch` gets exhaustiveness + typo rejection.
**Pattern observed:** type-only intra-core import to break a presumed cycle — `import type { EnemyKind } from './state'` (events.ts:16) mirrors `import type { GameEvent } from './events'` (state.ts:6); both erased at compile time. Clean, idiomatic.
**Error handling:** `const killer = grabber ?? s.enemies.find(...)` with `if (!killer) return` (sim.ts:253-254) — correct nullish handling, no emit on a missing killer.

### What changed since Round 1
The rework (commit `0d661f3`) is exactly the three fixes I demanded and nothing else (`git show` confirms: 8 insertions, 3 deletions across `events.ts` + `sim.events.test.ts`):
1. `EnemyDeathEvent.enemyType: string` → `EnemyKind` (events.ts:22)
2. `PlayerGrabEvent.killedBy: string` → `EnemyKind` (events.ts:32)
3. `import { Input }` → `import type { Input }` (sim.events.test.ts:20)
plus the enabling `import type { EnemyKind } from './state'` (events.ts:16). No logic touched.

### Rule Compliance (Round 2)
Mapped to `.pennyfarthing/gates/lang-review/typescript.md` (#1–#13) + CLAUDE.md hard boundary (A). `reviewer-rule-checker` re-checked 24 instances across 14 rules and returned **0 violations**; I independently re-verified the resolution and the boundary.

| Rule | Result |
|------|--------|
| #1 Type-safety escapes | PASS — no `as any`/`@ts-ignore`/non-null on nullable; `eventsOfType` predicate has a genuine runtime check (`e.type === type`). |
| #2 Generic/interface pitfalls | PASS — no `Record<string,any>`/`object`/`Function`; test tuples use `ReadonlyArray`. |
| #3 Enum/union anti-patterns | **PASS — RESOLVED** — `enemyType`/`killedBy` are now the `EnemyKind` union (events.ts:22,32); `PlayerDeathEvent.cause` is a literal union; `discriminant()` switch keeps its `default: never` exhaustiveness sentinel. The two Round-1 FAILs are fixed. |
| #4 Null/undefined | PASS — `grabber ?? find(...)` uses `??` (not `||`), guarded by `if (!killer) return`. |
| #5 Module/declaration | **PASS — LOW resolved** — `import type` used for all type-only imports incl. the new `EnemyKind` and the test's `Input`; the events.ts↔state.ts type-only cycle is erased (no runtime cycle); ambient `*?raw` clean; `moduleResolution: bundler` ⇒ no `.js` extension needed. |
| #6 React/JSX | N/A — no `.tsx`. |
| #7 Async/Promise | N/A — no async. |
| #8 Test quality | PASS — no `as any`, no `dist/` imports, src-path imports, meaningful assertions. |
| #9 Build/config | PASS — no tsconfig changes; `strict:true`; `skipLibCheck` pre-existing, not introduced here. |
| #10 Input validation | N/A — internal sim data, no user input/JSON.parse/URLs. |
| #11 Error handling | N/A — no try/catch. |
| #12 Performance/bundle | PASS — specific named imports; no dynamic import; no hot-path JSON.stringify. |
| #13 Fix regressions | **PASS** — the rework re-scanned against #1–#12: tightening a type introduces no safety escape, no `||`-for-`??`, no `as any`; `import type` adds no runtime import. Clean. |
| A — CLAUDE.md hard boundary | PASS — `events.ts` imports only a type-only intra-core symbol; no `Date`/`Math.random`/`performance`/RAF/DOM/shell in any core file; all event payloads are tube-space (`lane`/`depth`); `cloneState` resets `events:[]` (fresh array, input never mutated). |

### Observations
- **[VERIFIED][RULE][TYPE]** Round-1 HIGH #1 resolved — `EnemyDeathEvent.enemyType` is `EnemyKind` at `src/core/events.ts:22`; all three emit sites (`sim.ts:189,315,329`) pass `e.kind`/`victim.kind` (`EnemyKind`), so the stricter type typechecks. Evidence: `tsc --noEmit` exit 0; rule-checker rule #3 marked resolved.
- **[VERIFIED][RULE][TYPE]** Round-1 HIGH #2 resolved — `PlayerGrabEvent.killedBy` is `EnemyKind` at `src/core/events.ts:32`; sole emit site `sim.ts:255` passes `killer.kind` after `if (!killer) return` narrowing.
- **[VERIFIED][RULE]** Round-1 LOW resolved — `import type { Input }` at `tests/core/sim.events.test.ts:20`; `Input` is an interface used only as a type annotation on `NEUTRAL`/`FIRE`/`ZAP`.
- **[VERIFIED]** No runtime import cycle — `events.ts:16` and `state.ts:6` are both `import type`; TypeScript erases type-only circular deps; `tsc --noEmit` clean and `vite build` succeeds (27.5 kB).
- **[VERIFIED]** Pure-core boundary intact — `events.ts` has only the one type-only import; the test-suite boundary scan over `events.ts`/`sim.ts`/`state.ts` (FORBIDDEN regexp) plus the 120-frame determinism replay both pass.
- **[VERIFIED]** Behaviour unchanged — a type-only edit cannot alter runtime; full suite **269/269 green**, identical to the pre-rework run (RUN_ID `5-1-dev-green` vs prior `5-1-dev-green-2`).
- **[LOW][DOC]** README.md / INSTALLATION.md still ride this branch (out of scope) in their own `docs:` commit — benign, unchanged from Round 1. Out-of-scope working-tree noise (`sprint/epic-5.yaml` M, `sfx/` untracked) is bookkeeping, not part of the story surface — non-blocking.

### Dispatch tags (manual coverage for disabled specialists)
- **[EDGE]** (manual): rework adds no branch/path — same MAX_BULLETS fire-suppression, multi-kill dedup, zero-enemy zap, warp double-crash prevention covered in Round 1 still hold; type narrowing only removes invalid inputs.
- **[SILENT]** (manual): no swallowed errors / empty catches introduced; the documented zero-enemy-zap silence (Dev deviation #2) is unchanged.
- **[TEST]** (manual): all assertions preserved; the only test change is the `import type { Input }` line — no assertion touched. Determinism tests still guard against vacuous empty-equality with `length > 0`.
- **[DOC]** (manual): the new events.ts comment block accurately explains the `import type` no-cycle rationale; per-variant JSDoc remains correct; only the out-of-scope docs commit noted (Low).
- **[TYPE]**: the two `string`→`EnemyKind` tightenings are the whole point of the rework — type-design domain now fully compliant (rule-checker rule #3 resolved).
- **[SEC]** (manual): pure-core game logic — no auth, network, secrets, user input, or tenant data. No security surface; rework adds none.
- **[SIMPLE]** (manual): rework is the minimal change — one import + two field edits + one test import; no over-engineering, no dead code.
- **[RULE]**: rule-checker round 2 — 14 rules, 24 instances, **0 violations**; both Round-1 violations resolved; CLAUDE.md boundary fully honored.

### Devil's Advocate
Argue this rework is broken. The sharpest attack: did the new `import type { EnemyKind } from './state'` quietly create a module cycle that bundlers mishandle, shipping a broken core? No — both legs of the events.ts↔state.ts reference are `import type`, which TypeScript strips before emit; the Vite build (27.5 kB, exit 0) and `tsc --noEmit` (exit 0) prove no runtime cycle exists. Second attack: does tightening to `EnemyKind` break any caller that legitimately pushed a non-`EnemyKind` string? Search shows every emit site passes `.kind` (an `EnemyKind`), so there is no such caller; and `'flipper'`-style literals in tests are valid members — 269/269 stay green. Third: could the change be cosmetic — types narrowed but a sneaky `as` cast smuggling bad data through? rule-checker #13 found no `as any`/`as unknown`/cast anywhere in the fix diff. Fourth: did the test's `import type { Input }` break runtime by erasing a value the test needs? No — `Input` is an interface used only in `: Input` annotations; nothing reads it as a value. Fifth, the deeper question I rejected on last round — is the published contract now actually safe for 5-2/5-5/5-6? Yes: a consumer `switch (e.enemyType)` now gets compiler-enforced exhaustiveness and a `default: assertNever` will flag any unhandled kind; a misspelled `'fliper'` emit would now fail to compile. The one residual is unchanged and out of scope: `player-spawn` still fires only on the normal respawn (documented Gap for 5-5), and the zero-enemy zap stays silent (documented, intentional). Neither is a defect in *this* story. Net: the rework does exactly what was asked, introduces no regression by any of #1–#13, and the foundational contract three downstream stories depend on is now type-safe. Nothing left to reject on.

**No blocking findings. All three Round-1 findings (2 HIGH + 1 LOW) resolved; zero new findings.**

---

### Round 1 (REJECTED) — historical detail
Round 1 rejected on two rule #3 HIGH violations: `EnemyDeathEvent.enemyType` and `PlayerGrabEvent.killedBy` were typed `string` instead of `EnemyKind`, plus a LOW (`import { Input }` not type-only). The rule-checker (round 1) checked 136 instances and flagged exactly those two; the boundary/determinism were already clean. Dev's original "circular import" rationale was unfounded (`import type` is erased). All three are now fixed — see the Round-2 assessment above. Full Round-1 severity table:

| Severity | Issue | Location | Fix Required | Status |
|----------|-------|----------|--------------|--------|
| [HIGH] | `enemyType` typed `string`, not `EnemyKind` | `src/core/events.ts` (was :17) | `enemyType: EnemyKind` + `import type` | ✅ FIXED (now :22) |
| [HIGH] | `killedBy` typed `string`, not `EnemyKind` | `src/core/events.ts` (was :27) | `killedBy: EnemyKind` | ✅ FIXED (now :32) |
| [LOW] | `import { Input }` not type-only | `tests/core/sim.events.test.ts:20` | `import type { Input }` | ✅ FIXED |

**Handoff:** To SM (Colonel Hogan) for finish-story.

---

**Branch:** feat/5-1-pure-core-game-event-channel
**Created:** 2026-06-26T12:22:32.165243+00:00