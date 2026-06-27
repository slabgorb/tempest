---
story_id: "5-8"
jira_key: ""
epic: ""
workflow: "tdd"
---
# Story 5-8: Harden high-score persistence: per-entry load validation and readonly save API

## Story Details
- **ID:** 5-8
- **Jira Key:** (none)
- **Workflow:** tdd
- **Stack Parent:** none

## Workflow Tracking
**Workflow:** tdd
**Phase:** finish
**Phase Started:** 2026-06-27T09:03:27Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-06-27T08:41:07+00:00 | - | - |
| red | 2026-06-27T08:41:07+00:00 | 2026-06-27T08:53:36Z | 12m 29s |
| green | 2026-06-27T08:53:36Z | 2026-06-27T08:57:26Z | 3m 50s |
| review | 2026-06-27T08:57:26Z | 2026-06-27T09:03:27Z | 6m 1s |
| finish | 2026-06-27T09:03:27Z | - | - |

## Delivery Findings

Agents record upstream observations discovered during their phase.
Each finding is one list item. Use "No upstream findings" if none.

**Types:** Gap, Conflict, Question, Improvement
**Urgency:** blocking, non-blocking

<!-- Agents: append findings below this line. Do not edit other agents' entries. -->

### TEA (test design)
- **Improvement** (non-blocking): A numeric overflow in the stored JSON (e.g. `score: 1e999`) parses to `Infinity`, which passes a `typeof === 'number'` guard and renders as "Infinity". Affects `src/shell/storage.ts` (the `isHighScoreEntry` guard could additionally require `Number.isFinite` for `score`/`level`). Not pinned by a RED test — NaN cannot survive `JSON.parse`, so finiteness was left to Dev's discretion. *Found by TEA during test design.*

### Dev (implementation)
- No upstream findings during implementation.

### Reviewer (code review)
- **Improvement** (non-blocking): Two source-text AC tests are slightly over-broad — `tests/shell/storage.test.ts:335` (the `readonly` regex matches anywhere in the param list) and `tests/core/highscore.source.test.ts:57` (doc-comment existence assertion passes on any comment). Affects those two test files (tighten the regex / fold the existence check into the content check). Both are mitigated by companion tests and do not block. *Found by Reviewer during code review.*
- **Improvement** (non-blocking): `isHighScoreEntry` could additionally validate the optional `date` type and `Number.isFinite(score/level)`. Affects `src/shell/storage.ts` (guard hardening). Out of this story's scope (display-only / unreachable-via-JSON); reiterates TEA's finding. *Found by Reviewer during code review.*

## Impact Summary

**Upstream Effects:** No upstream effects noted
**Blocking:** None

### Deviation Justifications

2 deviations

- **Guard contract pinned to field TYPES, not numeric finiteness**
  - Rationale: NaN cannot survive `JSON.parse`; the only reachable non-finite value is overflow (`1e999` → `Infinity`), an extreme edge surfaced as a non-blocking Delivery Finding instead of constraining the guard beyond the story's type-shape examples
  - Severity: minor
  - Forward impact: none (Dev may add `Number.isFinite` at its discretion; not required to pass RED)
- **Layout / doc ACs enforced via source-text introspection rather than behaviour**
  - Rationale: import ordering and a doc comment cannot be observed behaviourally; source introspection is the only faithful, deterministic enforcement
  - Severity: minor

## Design Deviations

Agents log spec deviations as they happen — not after the fact.
Each entry: what was changed, what the spec said, and why.

<!-- Agents: append deviations below this line. Do not edit other agents' entries. -->

### TEA (test design)
- **Guard contract pinned to field TYPES, not numeric finiteness**
  - Spec source: context-story-5-8.md, AC-1
  - Spec text: "returns only well-formed {name,score,level} rows (dropping bad ones, or [] if none)"
  - Implementation: tests assert the guard rejects wrong TYPES (`name:string`, `score:number`, `level:number`) but do NOT assert rejection of non-finite numbers (NaN / Infinity)
  - Rationale: NaN cannot survive `JSON.parse`; the only reachable non-finite value is overflow (`1e999` → `Infinity`), an extreme edge surfaced as a non-blocking Delivery Finding instead of constraining the guard beyond the story's type-shape examples
  - Severity: minor
  - Forward impact: none (Dev may add `Number.isFinite` at its discretion; not required to pass RED)
- **Layout / doc ACs enforced via source-text introspection rather than behaviour**
  - Spec source: context-story-5-8.md, AC-2
  - Spec text: "MAX_HIGH_SCORES import is at the top of highscore.ts; qualifiesForHighScore documents its sorted-descending precondition"
  - Implementation: these ACs have no runtime effect, so they are pinned as static `?raw` source assertions (import-ordering; doc-comment keyword) — the browser-pure idiom from events.test.ts — plus a source-text check that `saveHighScores`'s signature names `readonly`
  - Rationale: import ordering and a doc comment cannot be observed behaviourally; source introspection is the only faithful, deterministic enforcement
  - Severity: minor
  - Forward impact: none

### Dev (implementation)
- No deviations from spec. Implemented exactly to the TEA tests and story ACs: `isHighScoreEntry` guard + `parsed.filter(...)`, `readonly HighScoreEntry[]` save param, hoisted import, descending-sorted doc comment. Did not add `Number.isFinite` (TEA's non-blocking finding) — out of RED scope.

### Reviewer (audit)
- **Guard contract pinned to field TYPES, not numeric finiteness** → ✓ ACCEPTED by Reviewer: NaN cannot survive `JSON.parse`; the only reachable non-finite case (`1e999`→`Infinity`) is display-only and not a story constraint. Sound scoping.
- **Layout / doc ACs enforced via source-text introspection rather than behaviour** → ✓ ACCEPTED by Reviewer: import-ordering and a doc comment have no runtime behaviour; `?raw` source assertions are the project's established idiom (events.test.ts) and the only faithful enforcement. The two resulting tests are slightly over-broad (LOW, non-blocking — see Reviewer Assessment) but correct in practice and backed by the compile-time `readonly` type test.
- Dev's "No deviations from spec" → ✓ ACCEPTED: implementation matches the tests and ACs exactly; no undocumented divergence found during review.

## TEA Assessment

### Red Phase (test writing)

**Tests Required:** Yes
**Reason:** n/a — behavioural hardening (per-entry load validation) plus two enforceable layout/doc ACs.

**Test Files:**
- `tests/shell/storage.test.ts` (extended) — `loadHighScores` per-entry validation guard (9 tests) + `saveHighScores` readonly parameter (3 tests); added a `?raw` source import for the signature check.
- `tests/core/highscore.source.test.ts` (new) — `MAX_HIGH_SCORES` import position + `qualifiesForHighScore` doc-comment precondition (4 tests).

**Tests Written:** 13 new tests covering 3 ACs.
**Status:** RED — 10 failing under vitest (286 pass / 10 fail), plus one compile-time RED (passing a `readonly[]` to the still-mutable param) enforced by `tsc --noEmit`. All pre-existing storage tests still pass; no test file fails to load.

### Rule Coverage

| Rule (lang-review/typescript.md) | Test(s) | Status |
|------|---------|--------|
| #10 `JSON.parse()` typed `as T` w/o runtime validation | `loadHighScores` per-entry guard suite | failing |
| #1 type predicate (`is`) without runtime validation inside | guard drops wrong-typed / non-object members | failing |
| #2 missing `readonly` on non-mutating array param | `saveHighScores` readonly param (signature + type-level) | failing (source) / tsc |
| #4 null/undefined handling | "drops non-object array members (null, …)" | failing |
| #8 test quality (no vacuous assertions) | self-check | pass |

**Rules checked:** 4 applicable lang-review checks (#1, #2, #4, #10) covered + #8 self-check. Remaining checks (#3 enums, #5 modules, #6 react, #7 async, #9 build, #11 error, #12 perf) not applicable to this change.
**Self-check:** 0 vacuous tests found — every new test carries a meaningful assertion (round-trip equality, drop-to-`[]`, no-throw, source-pattern match).

**RED breakdown (10 vitest failures):**
- `storage.test.ts` (8): 7 per-entry guard tests + 1 `readonly`-in-signature source check.
- `highscore.source.test.ts` (2): import-above-first-decl + doc-comment notes descending/sorted.
- Passing-now-AND-after guards (regression anchors, intentionally green): "returns a fully well-formed table unchanged", "never throws on garbage array", "does not mutate a frozen input", "accepts a readonly[] and round-trips".

**Implementation notes for Dev (Sergeant Carter):**
- `loadHighScores`: add `isHighScoreEntry(x: unknown): x is HighScoreEntry` (`typeof name==='string' && typeof score==='number' && typeof level==='number`) and `return parsed.filter(isHighScoreEntry)` — replacing `return parsed as HighScoreTable`. **FILTER, do not reconstruct**: the existing "preserves entry shape" test asserts `'date' in entry === false` for date-less rows, so rebuilding entries with `date: undefined` will REGRESS it.
- `saveHighScores`: widen the parameter to `readonly HighScoreEntry[]` (import the `HighScoreEntry` type into storage.ts — it currently imports only `HighScoreTable`).
- `highscore.ts`: move `import { MAX_HIGH_SCORES } from './rules'` above `export interface HighScoreEntry`, and add a contiguous doc-comment line directly above `qualifiesForHighScore` noting the table is assumed sorted descending.
- Optional (non-blocking finding): consider `Number.isFinite` in the guard to reject `Infinity` from numeric overflow.

**Handoff:** To Dev (Sergeant Carter) for GREEN.

## Dev Assessment

**Implementation Complete:** Yes

**Files Changed:**
- `src/shell/storage.ts` — added `isHighScoreEntry(value: unknown): value is HighScoreEntry` type guard (object + `typeof` checks on name/score/level); `loadHighScores` now `return parsed.filter(isHighScoreEntry)` instead of `parsed as HighScoreTable`; `saveHighScores` parameter widened to `readonly HighScoreEntry[]`; imports the `HighScoreEntry` type.
- `src/core/highscore.ts` — hoisted `import { MAX_HIGH_SCORES } from './rules'` above the first type declaration; added a contiguous doc-comment precondition above `qualifiesForHighScore` noting the table is assumed sorted DESCENDING by score.

**Tests:** 296/296 passing (GREEN) via `npm test`. `npx tsc --noEmit` exits 0 (typecheck clean, incl. the `readonly` parameter contract). All 10 RED tests now pass; no regressions in the pre-existing suite.

**AC verification:**
- AC1 (per-entry guard drops malformed rows, `[]` if none) — ✅ guard suite green.
- AC2 (readonly save param; import at top; sorted-descending doc) — ✅ source/structural suites green.
- AC3 (pure core stays pure; all existing high-score tests pass; typecheck clean) — ✅ highscore.ts gained only an import move + comment (no impurity); full suite + tsc clean.

**Branch:** feat/5-8-harden-highscore-persistence (pushed; commit baf77fa)

**Note for review:** the guard FILTERS (does not reconstruct entries), preserving the existing "preserves entry shape including the optional date field" contract (`'date' in entry === false` for date-less rows). TEA's non-blocking `Number.isFinite` finding (Infinity via `1e999` overflow) was deliberately left unimplemented as out of scope.

**Handoff:** To Reviewer (General Burkhalter) for code review.

## Subagent Results

| # | Specialist | Received | Status | Findings | Decision |
|---|-----------|----------|--------|----------|----------|
| 1 | reviewer-preflight | Yes | clean | 0 smells; 296/296 green; tsc exit 0 | N/A — green confirmed |
| 2 | reviewer-edge-hunter | Skipped | disabled | N/A | Disabled via settings; domain assessed by Reviewer (see [EDGE]) |
| 3 | reviewer-silent-failure-hunter | Skipped | disabled | N/A | Disabled via settings; domain assessed by Reviewer (see [SILENT]) |
| 4 | reviewer-test-analyzer | Skipped | disabled | N/A | Disabled via settings; domain assessed by Reviewer (see [TEST]) |
| 5 | reviewer-comment-analyzer | Skipped | disabled | N/A | Disabled via settings; domain assessed by Reviewer (see [DOC]) |
| 6 | reviewer-type-design | Skipped | disabled | N/A | Disabled via settings; domain assessed by Reviewer (see [TYPE]) |
| 7 | reviewer-security | Skipped | disabled | N/A | Disabled via settings; domain assessed by Reviewer (see [SEC]) |
| 8 | reviewer-simplifier | Skipped | disabled | N/A | Disabled via settings; domain assessed by Reviewer (see [SIMPLE]) |
| 9 | reviewer-rule-checker | Yes | findings | 2 Low (Rule 8 test-quality) | confirmed 2 (LOW, non-blocking), 0 dismissed |

**All received:** Yes (2 enabled subagents returned; 7 disabled via `workflow.reviewer_subagents` — their domains assessed by Reviewer)
**Total findings:** 2 confirmed (both LOW, non-blocking), 0 dismissed, 0 deferred

## Reviewer Assessment

**Verdict:** APPROVED

**Data flow traced:** untrusted `localStorage` payload → `loadHighScores` → `JSON.parse` (typed `unknown`) → `Array.isArray` guard → **`parsed.filter(isHighScoreEntry)`** [new per-entry defense] → `HighScoreTable` → `state.highScoreTable` (main.ts:47) → renderer reads `entry.name`/`entry.score` (render.ts:394-399). The new guard closes exactly the malformed-data gap the story names; a corrupt-but-array payload can no longer reach the renderer.

**Pattern observed:** canonical TS type-predicate + `Array.prototype.filter` narrowing, replacing an unchecked `as` cast — `src/shell/storage.ts:18-26,60`. Idiomatic and minimal.

**Error handling:** `JSON.parse` remains wrapped in try/catch returning `[]` (storage.ts:60-63); per-entry rejection is silent BY SPEC ("dropping bad ones, or [] if none"); array-level corruption still warns (storage.ts:58,61). Save path swallows quota/unavailable errors (storage.ts:75-77).

### Rule Compliance (lang-review/typescript.md + CLAUDE.md boundary)

Exhaustive pass by reviewer-rule-checker (13 checklist rules + 3 boundary rules, 47 instances), cross-confirmed by Reviewer:

- **#1 Type-safety escapes** — COMPLIANT. `isHighScoreEntry` is a real predicate with runtime `typeof` validation inside (not an unchecked cast); `value as Record<string, unknown>` is safe post-`typeof` narrowing; the old `parsed as HighScoreTable` cast is removed. (storage.ts:18-26,60)
- **#2 Generic/interface** — COMPLIANT. `readonly HighScoreEntry[]` added to the non-mutating `saveHighScores` param; `Record<string, unknown>` (not `any`). (storage.ts:20,70)
- **#4 Null/undefined** — COMPLIANT. Strict `=== null` checks; `??` used where falsy-but-valid is not a concern. (storage.ts:33,52)
- **#5 Module/declaration** — COMPLIANT. `import type` for type-only imports; `?raw` source imports are the project's established idiom.
- **#8 Test quality** — 2 LOW findings (over-broad `readonly` regex; weak doc-comment existence assertion). Both non-blocking, mitigated by companion tests. See observations.
- **#10 Input validation** — COMPLIANT. `JSON.parse` result typed `unknown` then validated at runtime (array + per-entry guard) instead of `as T`. This is the core hardening. (storage.ts:55-60)
- **#11 Error handling** — COMPLIANT. catch-no-binding pattern; no `catch(e: any)`.
- **#13 Fix-introduced regressions** — COMPLIANT. No new type escapes; `readonly` widening is API-permissive (existing mutable callers still compile).
- **#3 enum / #6 react / #7 async / #9 build / #12 perf** — N/A to this diff (no enums, JSX, async, config, or hot-path serialization).
- **CLAUDE.md hard boundary** — COMPLIANT. `core/highscore.ts` change is an import hoist (`./rules`, a core module) + a comment; no DOM/`Date`/`Math.random`/`performance.now`/`requestAnimationFrame`; core never imports shell; shell→core type-only import preserved.

### Observations (min 5)

1. `[VERIFIED]` Data flow is safe end-to-end — untrusted localStorage now passes the per-entry guard before reaching `state.highScoreTable`. Evidence: storage.ts:55-60 filters; main.ts:47 consumes.
2. `[VERIFIED]` Pure-core boundary intact — `src/core/highscore.ts:7` imports only `./rules` (confirmed at `src/core/rules.ts`); no impurity tokens introduced. Complies with CLAUDE.md.
3. `[TYPE]` `[VERIFIED]` `isHighScoreEntry` is a genuine type predicate with runtime validation (`typeof name==='string' && typeof score==='number' && typeof level==='number'`), closing lang-review #1/#10 — evidence storage.ts:18-26. Not an unchecked cast.
4. `[VERIFIED]` `readonly` widening is API-safe — `saveHighScores(readonly HighScoreEntry[])` is called with a mutable `highScoreTable` (main.ts:100); widening compiles; `tsc --noEmit` exit 0. Complies with #2.
5. `[SEC]` `[VERIFIED]` No injection/XSS — high-score names are drawn via canvas `fillText` (not HTML) and sliced to 3 chars (render.ts:394); localStorage is client-only; `JSON.parse` is try/caught; a `{__proto__:…}` payload is dropped by the guard (lacks required fields), so no prototype pollution reaches state.
6. `[SILENT]` `[VERIFIED]` Silent per-entry drop is BY SPEC, not a swallowed error; array-level corruption still logs `console.warn` (storage.ts:58,61).
7. `[SIMPLE]` `[VERIFIED]` Implementation is minimal — a single guard + `filter`, an import move, and a comment. No over-engineering or dead code.
8. `[EDGE]` `[VERIFIED]` Boundary coverage is thorough — empty array → `[]`; array/null/primitive members dropped; all-garbage → `[]`; mixed → only valid rows in order with `date` preserved (storage.test.ts guard suite).
9. `[TEST]` `[RULE]` (LOW, non-blocking) storage.test.ts:335 — the `readonly` source-text regex `[^)]*\breadonly\b[^)]*` is over-broad (would also match `readonly` inside an in-param comment). Real enforcement is the compile-time type-level test at storage.test.ts:321 (`readonly HighScoreEntry[]` arg under `tsc`), so this is belt-and-suspenders, not the sole guard. Confirmed LOW.
10. `[TEST]` `[DOC]` `[RULE]` (LOW, non-blocking) highscore.source.test.ts:57 — `expect(docCommentAbove(...).length).toBeGreaterThan(0)` is weak in isolation (any comment passes) but is paired with the content check at line 61 (`/descend|sorted/`). Adequate together. Confirmed LOW.
11. `[LOW]` (by-design) The guard does not validate the optional `date` field's type nor `Number.isFinite(score/level)`. Both are explicitly scoped out by TEA (NaN cannot survive `JSON.parse`; `date` is display-only) and re-raised as non-blocking Delivery Findings. Not a story constraint.

### Devil's Advocate

Assume this code is broken. The attacker controls `localStorage` directly (DevTools), so the persisted high-score table is fully untrusted input. Can they break the game or the player? Inject `[{"name":"<img src=x onerror=alert(1)>","score":1,"level":1}]`: the guard accepts it (name is a string), but the renderer draws names with canvas `fillText` — text, not markup — and slices to three characters, so no XSS and no overflow. Inject a 1,000,000-character name: sliced to three; no DoS. Inject `score: 1e999`: this parses to `Infinity`, passes `typeof === 'number'`, and renders as the literal "Infinity" in the board — ugly, not dangerous, and explicitly acknowledged as a non-blocking edge. Inject `{"__proto__":{"isAdmin":true}}`: `JSON.parse` makes `__proto__` an own (non-polluting) property, and the guard drops the object anyway (no `name`/`score`/`level`), so the prototype is untouched and nothing enters state. Inject a deeply nested array `[[[[]]]]`: each inner array is a non-null object whose `.name` is undefined → dropped. What about a confused user who clears storage mid-session? `loadHighScores` returns `[]`; the board renders empty; no crash. A stressed filesystem / exceeded quota on save? Caught, warned, game continues. Could the `readonly` widening break a caller that mutates the argument? No caller mutates it, and widening only relaxes the contract; `tsc` exit 0 confirms. The one genuine soft spot the devil finds is the unvalidated `date` type — a `date: 42` survives — but `date` is not even rendered in the high-score table (render draws rank/name/score only), so the blast radius is nil. No Critical or High issue survives scrutiny.

**Handoff:** To SM (Colonel Hogan) for finish-story.