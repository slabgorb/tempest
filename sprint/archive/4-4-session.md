---
story_id: "4-4"
jira_key: ""
epic: "4"
workflow: "tdd"
---
# Story 4-4: High-score persistence seam in shell/storage.ts

## Story Details
- **ID:** 4-4
- **Title:** High-score persistence seam in shell/storage.ts
- **Jira Key:** (Jira not configured for this project)
- **Workflow:** tdd
- **Points:** 2
- **Stack Parent:** none

## Workflow Tracking
**Workflow:** tdd
**Phase:** finish
**Phase Started:** 2026-06-26T08:38:21Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-06-26T08:16:46Z | - | - |
| red | - | 2026-06-26T08:26:13Z | unknown |
| green | 2026-06-26T08:26:13Z | 2026-06-26T08:29:13Z | 3m |
| review | 2026-06-26T08:29:13Z | 2026-06-26T08:38:21Z | 9m 8s |
| finish | 2026-06-26T08:38:21Z | - | - |
| green | - | 2026-06-26T08:29:13Z | unknown |
| review | 2026-06-26T08:29:13Z | 2026-06-26T08:38:21Z | 9m 8s |
| finish | 2026-06-26T08:38:21Z | - | - |
| review | - | 2026-06-26T08:38:21Z | unknown |
| finish | 2026-06-26T08:38:21Z | - | - |
| finish | - | - | - |

## Technical Context

### Story Purpose
Create a thin persistence seam in `src/shell/storage.ts` for high-score persistence backed by `localStorage`. This is a clean interface that allows:
- Story 4-3 (high-score state machine in core/) to define the high-score table shape and logic
- Story 4-6 (wire persistence at boot/commit) to consume load/save functions
- The core game state to remain pure (no DOM/storage access inside core/)

### Architectural Boundary (Critical)
- **Location:** `src/shell/storage.ts` (IO, not core/)
- **Core remains pure:** No imports from shell/ or storage.ts into core/; core/ has no localStorage access
- **Interface contract:** Define `loadHighScores()` and `saveHighScores(table)` functions
- **Tests:** Mock/stub `window.localStorage` in test setup (Vitest jsdom provides a basic implementation)

### Data Model

High-score table shape (to be defined in this story):
```typescript
interface HighScoreEntry {
  name: string        // player name (3 chars typical in arcade)
  score: number       // points
  level: number       // level completed/reached
  date?: string       // optional: ISO-8601 timestamp of entry
}

// Table: array of entries, sorted descending by score
type HighScoreTable = HighScoreEntry[]

// Default: top 10 scores (arcade convention)
const MAX_ENTRIES = 10
```

### Acceptance Criteria

1. **Define storage API**
   - `loadHighScores(): HighScoreTable` — returns array of entries from localStorage (or empty array if none stored)
   - `saveHighScores(table: HighScoreTable): void` — writes table to localStorage
   - Storage key: `'tempest-high-scores'` (or similar)

2. **Handle missing/invalid data**
   - If localStorage is unavailable (private browsing, quota exceeded), log warning but do not crash
   - If stored data is corrupted/malformed, return empty array (fail safely)
   - Graceful degradation: game still plays; scores just don't persist

3. **Tests (Vitest with jsdom)**
   - Mock localStorage for loading and saving
   - Test loading when key doesn't exist (return `[]`)
   - Test loading valid JSON (parse and validate structure)
   - Test saving a table (writes to localStorage)
   - Test localStorage quota exceeded (no throw, return empty or log warning)
   - Test corrupt JSON (return `[]`, log warning)

4. **Type safety**
   - Export types so 4-3 and 4-6 can depend on `HighScoreEntry` and `HighScoreTable`
   - No `any` types; use strict TypeScript

5. **No DOM/core violation**
   - storage.ts imports from shell/ (if needed) but NOT from core/
   - core/ never imports from storage.ts
   - Verify: `grep -r "import.*storage" src/core/` returns nothing

### Branch & Repo
- **Branch:** `feat/4-4-highscore-persistence-seam`
- **Repo:** tempest
- **Base:** develop (gitflow off protected develop)

### Dependencies
- Depends on: none (prerequisite for 4-6)
- Blocks: 4-6 (wire persistence at boot and on commit)

## Delivery Findings

### TEA (test design)
- **Improvement** (non-blocking): Type-location decision. `HighScoreEntry`/`HighScoreTable` must live in `src/core/highscore.ts` (pure), NOT in `src/shell/storage.ts`. Story 4-3's high-score state machine lives in `core/`, and the CLAUDE.md hard boundary forbids `core/` importing from `shell/`. Defining the types in shell would force that illegal import. `storage.ts` (shell) imports the types from core and owns localStorage IO. Affects `src/core/highscore.ts` (new types file) and `src/shell/storage.ts` (imports them). *Found by TEA during test design.*
- **Conflict** (non-blocking): AC3 and the Technical Context say "Vitest with jsdom" / "jsdom provides a basic localStorage". The actual `vite.config.ts` sets `test.environment: 'node'` — there is NO `localStorage` global. Tests inject a fake `Storage` on `globalThis` via `Object.defineProperty` instead of relying on jsdom. Affects test setup only. *Found by TEA during test design.*

### Dev (implementation)
- **Improvement** (non-blocking): `src/core/highscore.ts` is now the canonical home for `HighScoreEntry`/`HighScoreTable`. Stories 4-3 (state machine) and 4-6 (wiring) should import the table shape from here, not redeclare it. Affects `src/core/highscore.ts` (consume, don't duplicate). *Found by Dev during implementation.*
- No further upstream findings during implementation.

## Design Deviations

### TEA (test design)
- **Type location:** Story Data Model implies types could sit in `shell/storage.ts`; tests import them from `src/core/highscore.ts`. Reason: core/ may not import shell/ (CLAUDE.md hard boundary); 4-3's core state machine needs the shape.
- **Test env:** Spec says jsdom-provided localStorage; tests use a hand-injected fake `Storage` on `globalThis`. Reason: real env is `node` (vite.config.ts), no localStorage present.
- **Logging not asserted:** AC2 says "log warning". Tests assert behaviour (return `[]` / no-throw) but do NOT assert `console.warn`/`error` is called, to avoid coupling to a logging choice. console is silenced in `beforeEach` for clean output. Reason: behaviour is the contract; logging mechanism is impl detail.

### Dev (implementation)
- **Truncation/ordering not implemented in the seam**
  - Spec source: context-story-4-4.md, Data Model (`MAX_ENTRIES = 10`, "sorted descending by score")
  - Spec text: "Table: array of entries, sorted descending by score. Default: top 10 scores"
  - Implementation: `saveHighScores` persists whatever table it is given verbatim — no sort, no top-10 truncation. `loadHighScores` returns the stored array as-is.
  - Rationale: The seam is dumb IO. Ordering and truncation are the high-score state machine's concern (story 4-3); baking them into the seam would duplicate that logic and there is no test for it here.
  - Severity: minor
  - Forward impact: 4-3 must own sort + top-10 truncation before calling `saveHighScores`; 4-6 wires them together.
- **Shallow (array-level) validation on load**
  - Spec source: context-story-4-4.md, AC3
  - Spec text: "Test loading valid JSON (parse and validate structure)"
  - Implementation: `loadHighScores` validates that the parsed JSON is an array (`Array.isArray`) and returns `[]` otherwise, but does NOT deep-validate each entry's `{name, score, level}` shape.
  - Rationale: Matches the tests (which only assert array-level rejection); per-entry schema validation is over-engineering for a seam whose only writer is our own `saveHighScores`. Minimalist GREEN.
  - Severity: minor
  - Forward impact: a hand-corrupted array of malformed entries would pass through to the caller; 4-3 can validate entry shape if it ever consumes untrusted data.

### Reviewer (audit)
- **TEA — Type location (types in core/highscore.ts):** → ✓ ACCEPTED by Reviewer: correct call; core/ may not import shell/ (CLAUDE.md boundary), and the rule-checker confirmed the dependency direction holds (shell→core only).
- **TEA — Test env (injected fake Storage, not jsdom):** → ✓ ACCEPTED by Reviewer: `vite.config.ts` env is `node`; hand-injected `Storage` is the right deterministic approach.
- **TEA — Logging not asserted:** → ✓ ACCEPTED by Reviewer: behaviour is the contract; coupling tests to a logging mechanism would be brittle. console silenced in `beforeEach`.
- **Dev — Truncation/ordering not in the seam:** → ✓ ACCEPTED by Reviewer: correct separation of concerns — the seam is dumb IO; sort + top-10 truncation belong to the 4-3 state machine. Forward impact correctly noted.
- **Dev — Shallow (array-level) validation on load:** → ✓ ACCEPTED by Reviewer (severity LOW): matches rule-checker finding #10. The only write path is `saveHighScores` in the same module, so realistic exposure is a self-inflicted DevTools edit; worst case is a display glitch on the high-score screen, not a crash or security issue. Forward guidance: 4-3/4-7 should be defensive when consuming entry fields, or add an `isHighScoreEntry` guard if untrusted data is ever read.

## TEA Assessment

**Tests Required:** Yes
**Reason:** New persistence seam with branching failure modes (missing/corrupt/quota/unavailable storage) — exactly the kind of IO boundary that needs paranoid coverage.

**Test Files:**
- `tests/shell/storage.test.ts` — 13 tests for `loadHighScores`/`saveHighScores` against an injected fake `Storage`.

**Tests Written:** 13 tests covering all 5 testable ACs (AC5 is a static grep guard, not a runtime test).
**Status:** RED — module not implemented (`Cannot find module '../../src/shell/storage'`). Correct RED reason; the test transpiles cleanly (no syntax/type errors).

**Handoff:** To Dev for implementation (GREEN).

## Dev Assessment

**Implementation Complete:** Yes

**Files Changed:**
- `src/core/highscore.ts` (new) — pure `HighScoreEntry` (`{name, score, level, date?}`) and `HighScoreTable` types. Lives in core so 4-3's state machine can depend on the shape without importing shell.
- `src/shell/storage.ts` (new) — `loadHighScores()` / `saveHighScores(table)` over `localStorage` (key `tempest-high-scores`). Defensive `getStorage()` helper guards absent/throwing-access storage; load fails safe to `[]` on absent key, corrupt JSON, or non-array JSON; save swallows quota/unavailable errors. `console.warn` on the degraded paths (honours AC2 "log warning").

**Tests:** 13/13 storage tests passing; full suite 169/169 (GREEN). `tsc --noEmit` clean. No lint script configured.
**AC5 boundary:** `grep` confirms `src/core/` imports nothing from `shell/`/`storage`; `storage.ts` imports the type from core via `import type` (shell → core only).
**Branch:** feat/4-4-highscore-persistence-seam (to be pushed)

**Deviations:** Seam does not sort/truncate (deferred to 4-3); load validates array-level only, not per-entry. Both logged in Design Deviations → Dev with forward impact.

**Handoff:** To Reviewer (review phase).

## Subagent Results

| # | Specialist | Received | Status | Findings | Decision |
|---|-----------|----------|--------|----------|----------|
| 1 | reviewer-preflight | Yes | findings | 1 smell (storage.ts:44 cast) + GREEN/typecheck-clean/boundary-clean | confirmed 1, dismissed 0, deferred 0 |
| 2 | reviewer-edge-hunter | No | Skipped | disabled | N/A — Disabled via settings |
| 3 | reviewer-silent-failure-hunter | No | Skipped | disabled | N/A — Disabled via settings |
| 4 | reviewer-test-analyzer | No | Skipped | disabled | N/A — Disabled via settings |
| 5 | reviewer-comment-analyzer | No | Skipped | disabled | N/A — Disabled via settings |
| 6 | reviewer-type-design | No | Skipped | disabled | N/A — Disabled via settings |
| 7 | reviewer-security | No | Skipped | disabled | N/A — Disabled via settings |
| 8 | reviewer-simplifier | No | Skipped | disabled | N/A — Disabled via settings |
| 9 | reviewer-rule-checker | Yes | findings | 3 (all LOW): #1 test double-cast, #2 readonly param, #10 shallow validation | confirmed 3, dismissed 0, deferred 0 |

**All received:** Yes (2 enabled subagents returned; 7 disabled via `workflow.reviewer_subagents` and pre-filled)
**Total findings:** 3 confirmed (all LOW, non-blocking), 0 dismissed, 0 deferred

### Rule Compliance

Enumerated every changed type/function/field against the 13 TypeScript lang-review checks + the CLAUDE.md core-purity boundary (rule-checker checked 44 instances across 14 rules):

- **#1 Type-safety escapes:** `storage.ts:44` single cast from `unknown` (overlaps #10, judged there). `tests:50` `as unknown as Storage` — LOW, standard DOM-Storage test workaround, explained by comment. All other casts in tests are guarded/identity. COMPLIANT except the noted LOWs.
- **#2 Generic/interface:** `saveHighScores(table: HighScoreTable)` — LOW: param never mutated, should be `readonly HighScoreEntry[]`. Otherwise compliant (no `Record<string,any>`/`Function`/`object`).
- **#3 Enums:** none in diff. N/A.
- **#4 Null/undefined:** `getStorage` `?? null`, `if (raw === null)`, guarded `Map.get` — all correct `??`/strict-null usage. COMPLIANT.
- **#5 Module/declaration:** `import type` correctly used in both `storage.ts:9` and tests; no `.js` ext needed under `moduleResolution: bundler`; `export type HighScoreTable`. COMPLIANT.
- **#6 React/JSX:** no .tsx. N/A.
- **#7 Async:** all three functions synchronous. N/A.
- **#8 Test quality:** no `as any` in assertions; mock implements all 6 `Storage` members with matching signatures; imports from `src/`, not `dist/`. COMPLIANT.
- **#9 Build/config:** `strict: true`; no config changed by this PR. COMPLIANT.
- **#10 Type-level input validation:** `storage.ts:44` `parsed as HighScoreTable` after only `Array.isArray` — LOW violation (no per-entry validation). Controlled write path (only `saveHighScores` writes the key); worst case is a display glitch. Matches Dev's logged deviation; ACCEPTED with forward guidance.
- **#11 Error handling:** four bare `catch {}` (no `catch(e:any)`) — correct for swallow-and-degrade. COMPLIANT.
- **#12 Performance/bundle:** `JSON.parse`/`stringify` on load/save (not a frame hot path); specific named imports. COMPLIANT.
- **#13 Fix regressions:** all new files; none. N/A.
- **#14 Core purity (CLAUDE.md):** `core/highscore.ts` has zero imports, no DOM/storage/time/random — pure. `storage.ts` imports only a TYPE from core (shell→core). localStorage access lives in shell. COMPLIANT.

### Observations

- [VERIFIED] Core purity — `src/core/highscore.ts` is types-only with zero imports; no DOM/localStorage/Date/Math.random. Evidence: whole file is two `export` declarations. Complies with CLAUDE.md hard boundary.
- [VERIFIED] Dependency direction — `src/shell/storage.ts:9` `import type { HighScoreTable } from '../core/highscore'` is shell→core (allowed); `grep` confirms `core/` imports nothing from shell/. Complies with the architectural rule.
- [VERIFIED] Graceful degradation — every failure mode returns safely: `getStorage()` try/catch around the global access (storage.ts:15-22), `loadHighScores` returns `[]` on absent/throwing/corrupt/non-array (storage.ts:28-48), `saveHighScores` swallows quota/unavailable (storage.ts:53-60). 13 tests exercise all paths; no path throws. Evidence: full suite 169/169.
- [RULE][LOW] `saveHighScores(table: HighScoreTable)` param should be `readonly HighScoreEntry[]` — function never mutates `table`. `src/shell/storage.ts:53`. Non-blocking hygiene.
- [RULE][LOW] `loadHighScores` casts `parsed as HighScoreTable` after only `Array.isArray` — no per-entry runtime validation. `src/shell/storage.ts:44`. Non-blocking; matches Dev's accepted deviation; controlled write path.
- [RULE][LOW] `return storage as unknown as Storage` double-cast in test fixture. `tests/shell/storage.test.ts:50`. Accepted — `Storage`'s index signature can't be satisfied by an object literal; standard test workaround, explained in-comment.

### Devil's Advocate

Suppose this code is broken. Where would it bite? The persistence seam's whole contract is "never crash the game," so the attack surface is the failure paths. A malicious or curious user opens DevTools and writes `localStorage['tempest-high-scores'] = '[{"name":9999,"score":"oops","level":null}]'`. `loadHighScores` parses it, sees an array, and hands it back typed as `HighScoreTable` — a lie. Downstream, story 4-3's state machine or 4-7's HUD reads `entry.name` (a number), `entry.score` (a string), `entry.level` (null). A naive `table.sort((a,b)=>b.score-a.score)` yields `NaN` comparisons (unstable order but no throw); `String(entry.name)` renders `"9999"`; a number-formatted score of `"oops"` renders `NaN`. Ugly, but no crash and no security boundary crossed — localStorage is same-origin and the "attacker" is editing their own browser. This is the rule-#10 finding, and it is genuinely LOW for a local arcade clone. What about a confused user with a full disk? `saveHighScores` hits the quota-exceeded throw, the bare `catch` swallows it, a `console.warn` fires, and the game continues — scores silently don't persist. Correct degradation, and tested. Private-browsing / sandboxed iframe? Even *reading* `globalThis.localStorage` can throw `SecurityError`; `getStorage()` wraps the access in try/catch and returns `null`, so both load and save no-op. Tested. SSR / non-browser? `localStorage` is `undefined`; `?? null` handles it. Tested. What about an empty string under the key (`''`)? `JSON.parse('')` throws → caught → `[]`. Stored `'null'`/`'42'`/`'true'`? Not arrays → `[]`. The one thing genuinely NOT defended is per-entry shape, and that is a deliberate, logged deviation with the right owner (4-3). The `readonly` omission is cosmetic — no caller mutates the argument. I cannot construct a scenario where this code crashes the game or leaks anything. The seam does exactly one job and degrades safely on every branch I can reach. Verdict stands.

## Reviewer Assessment

**Verdict:** APPROVED

**Data flow traced:** `localStorage['tempest-high-scores']` → `getStorage()` (defensive access) → `JSON.parse` → `Array.isArray` guard → returned as `HighScoreTable`; and `HighScoreTable` → `JSON.stringify` → `setItem`. Safe because every read/parse/write is wrapped to fail to `[]`/no-op rather than throw; the only unvalidated step (per-entry shape) is fed by a controlled write path and is a logged, accepted deviation.

**Pattern observed:** Clean shell/core split — pure types in `src/core/highscore.ts:8,17`, IO confined to `src/shell/storage.ts`; dependency points shell→core only (`storage.ts:9`).

**Error handling:** Four bare `catch {}` swallow-and-degrade blocks (`storage.ts:19,33,45,58`) with `console.warn` on the corrupt/non-array/quota paths — appropriate for a "scores just don't persist" contract. No `catch(e:any)`.

**Findings (all from reviewer-rule-checker):** 3 confirmed, all LOW / non-blocking — none gate the PR.
- `[RULE][LOW]` `saveHighScores` param should be `readonly HighScoreEntry[]` (never mutated) — `src/shell/storage.ts:53`
- `[RULE][LOW]` `loadHighScores` casts `parsed as HighScoreTable` after only `Array.isArray` (no per-entry validation) — `src/shell/storage.ts:44`; controlled write path, matches Dev's accepted deviation
- `[RULE][LOW]` `as unknown as Storage` test-fixture double-cast — `tests/shell/storage.test.ts:50`; standard DOM-Storage workaround, explained in-comment

Recommended (not required) follow-ups: tighten `saveHighScores` param to `readonly`; add an `isHighScoreEntry` guard if 4-3 ever consumes untrusted entry data.

**Handoff:** To SM for finish-story.

## Delivery Findings

### Reviewer (code review)
- **Improvement** (non-blocking): Tighten `saveHighScores(table)` to `readonly HighScoreEntry[]` — the function never mutates the argument. Affects `src/shell/storage.ts` (param type only). *Found by Reviewer during code review.*
- **Improvement** (non-blocking): Per-entry validation of loaded high scores is deferred. When 4-3 (state machine) / 4-7 (HUD) consume entries, either validate shape with an `isHighScoreEntry` guard or render defensively. Affects `src/core/highscore.ts` consumers in 4-3/4-7. *Found by Reviewer during code review.*