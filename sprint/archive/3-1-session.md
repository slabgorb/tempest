---
story_id: "3-1"
jira_key: ""
epic: "3"
workflow: "tdd"
---
# Story 3-1: 16-geometry roster and tubeForLevel selector

## Story Details
- **ID:** 3-1
- **Epic:** 3 (Wave 3 — Levels & warp)
- **Title:** 16-geometry roster and tubeForLevel selector
- **Points:** 3
- **Priority:** p1
- **Workflow:** tdd
- **Repository:** tempest
- **Branch:** feat/tempest-wave-3-geometry-roster (from main)
- **Stack Parent:** none (this is the foundation task for Wave 3)

## Workflow Tracking
**Workflow:** tdd
**Phase:** finish
**Phase Started:** 2026-06-25T18:07:56Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-06-25T17:45:52Z | 2026-06-25T17:48:45Z | 2m 53s |
| red | 2026-06-25T17:48:45Z | 2026-06-25T17:56:39Z | 7m 54s |
| green | 2026-06-25T17:56:39Z | 2026-06-25T18:00:00Z | 3m 21s |
| review | 2026-06-25T18:00:00Z | 2026-06-25T18:07:56Z | 7m 56s |
| finish | 2026-06-25T18:07:56Z | - | - |

## Story Context

**From Wave 3 Implementation Plan (Task 1):**

Build the 16-geometry roster (8 closed regular polygons + 8 open fan/strip shapes) and the pure `tubeForLevel(level)` selector that cycles through them with period 16.

### Architecture
- Module-level immutable `GEOMETRIES: readonly Tube[]` of length 16
- `tubeForLevel(level)` indexes with period-16 modular arithmetic
- Index 0 is the existing 16-lane closed circle (level 1 unchanged)
- Closed tubes have exactly `laneCount` boundary points (wrap)
- Open tubes have `laneCount + 1` boundary points (clamp)

### Acceptance Criteria
- [ ] `tubeForLevel` cycles a 16-entry table; level 1 returns the original circle
- [ ] Roster includes 8 closed (polygons: 3,4,5,6,7,8-sided) and 8 open (flat, V, bowl, W, step, ramp, hump, etc.)
- [ ] `makePolygonTube(laneCount, sides, center, farRadius, nearRadius)` builds closed tubes
- [ ] `makeOpenTube(laneCount, center, halfWidth, profile)` builds open tubes
- [ ] `initialState` and `startGame` use `tubeForLevel(1)`
- [ ] Deterministic (no RNG, no Date, no DOM in geometry functions)
- [ ] Tests pass: geometry.cycle.test.ts covers roster structure and cycling
- [ ] All prior tests remain green (level 1 geometry identical)
- [ ] `npm run build` passes tsc without errors

### Test Coverage (TDD approach)
1. Write failing test (`geometry.cycle.test.ts`): roster structure, period-16 cycling
2. Implement geometry builders and table
3. Wire `initialState` and `startGame` to use `tubeForLevel`
4. Verify all tests pass + `npm run build`
5. Commit: `feat(core): 16-geometry roster and pure tubeForLevel selector`

### Implementation Steps (from Wave 3 plan)
1. **Step 1:** Write failing test (geometry.cycle.test.ts)
2. **Step 2:** Verify test fails (`npx vitest run tests/core/geometry.cycle.test.ts`)
3. **Step 3:** Add builders + profiles + `GEOMETRIES` table to geometry.ts
   - `makePolygonTube` with `polygonPoint` helper
   - `makeOpenTube` with profile functions (FLAT, SHALLOW_V, DEEP_V, BOWL, W, STEP, RAMP, HUMP)
   - `tubeForLevel` with period-16 cycling
4. **Step 4:** Update `initialState` in state.ts to use `tubeForLevel(1)`
5. **Step 5:** Update `startGame` in sim.ts to use `tubeForLevel(1)`
6. **Step 6:** Run tests + build verification
7. **Step 7:** Commit

### Dependencies
- Consumes: existing `Tube`, `Point`, `makeCircleTube`, `wrapLane` from core/geometry.ts
- Modifies: `core/state.ts` (initialState), `core/sim.ts` (startGame)
- Creates: `tests/core/geometry.cycle.test.ts`

### Key Technical Notes
- **Pure core boundary:** No imports from shell/, no DOM/window/Date/Math.random
- **Determinism:** No RNG in geometry selection; identical inputs → identical output
- **Immutability:** GEOMETRIES table is never mutated, shared across all plays
- **Boundary convention:** Already enforced by wrapLane/boundaryIndex; builders must honor it
- **TypeScript:** strict mode, noUnusedLocals

## SM Assessment

**Setup complete — ready for RED phase (TEA).**

- **Story scope:** Foundation task for Wave 3. Build the 16-entry `GEOMETRIES` roster (8 closed polygons + 8 open profiles) and a pure, deterministic `tubeForLevel(level)` selector that cycles with period 16. Level 1 must return the existing 16-lane closed circle unchanged.
- **Why this is well-bounded:** Pure-core only (`src/core/geometry.ts` + minor wiring in `state.ts`/`sim.ts`). No shell, no DOM, no RNG, no warp logic yet — those are 3-2/3-3. This story is purely the data table + selector + builders.
- **Architectural guardrail for downstream agents:** The hard core boundary applies — geometry builders must be deterministic and free of DOM/window/Date/Math.random. Closed tubes carry `laneCount` boundary points (wrap); open tubes carry `laneCount + 1` (clamp). All prior tests must stay green (level-1 geometry byte-for-byte identical).
- **TDD entry point for TEA:** Write `tests/core/geometry.cycle.test.ts` first — assert roster length 16, period-16 cycling (`tubeForLevel(1)` === `tubeForLevel(17)`), level-1 == original circle, and closed/open boundary-point counts. Verify it fails before Dev implements.
- **Risks/watch-items:** (1) Don't regress the existing circle geometry — pin level 1 to the current `makeCircleTube` output. (2) Keep the roster immutable and module-level. (3) `npm run build` (tsc strict, noUnusedLocals) must pass.

## TEA Assessment

**Tests Required:** Yes
**Reason:** New pure-core behavior (geometry roster + selector + builders) — squarely TDD.

**Test File:**
- `tests/core/geometry.cycle.test.ts` — 16 tests across 7 describe blocks.

**Tests Written:** 16 tests covering all 8 story ACs.
**Status:** RED (verified failing) — `tubeForLevel is not a function`; all 18 pre-existing files remain GREEN (82 tests), zero regressions.

### Coverage vs Acceptance Criteria

| AC | Test(s) | How it's pinned |
|----|---------|-----------------|
| `tubeForLevel(1)` == original circle | `level 1 is the original circle` (2 tests) | **Deep-equal** to `makeCircleTube(16, origin, 60, 300)` — not just length checks. This is the regression guard. |
| Cycles a 16-entry table | `cycling with period 16` (2 tests) | **Reference identity** `tubeForLevel(n) === tubeForLevel(n+16)` for all 16 levels + level 33; totality for level 0/-1/-16/100/257. |
| 8 closed + 8 open | `contains exactly 8 closed and 8 open` | Counts the split **exactly** (`toHaveLength(8)` each), not "some of each". |
| `makePolygonTube` builds closed tubes | `makePolygonTube (closed builder)` (3 tests) | Structure + **distinct-from-circle** proof + finite coords for sides 3–8 (NaN/div-by-zero guard). |
| `makeOpenTube` builds open tubes | `makeOpenTube (open builder)` (3 tests) | `laneCount+1` boundary points, **profile-actually-bows** proof, flat-profile render-safety. |
| `initialState` uses `tubeForLevel(1)` | `initialState wiring` (2 tests) | `initialState(1).tube` deep-equals `tubeForLevel(1)`; spike array sized to its laneCount. |
| `startGame` uses `tubeForLevel(1)` | `startGame wiring` | **Behavioral** test: restart from `gameover` with a stale 8-lane tube must reset to the 16-lane level-1 geometry + 16-length spikes. **Fails today** (current `startGame` keeps the old tube). |
| Deterministic / render-safe | `render-safe: project stays finite` + period reference identity | Pure indexing into a shared immutable table; `project` finite across every lane/depth of every geometry. |

### Rule Coverage (lang-review/typescript.md)

| Rule | Test / Disposition | Status |
|------|--------------------|--------|
| #2 missing `readonly` on shared arrays | Period reference-identity test proves the table is shared & not rebuilt/mutated; `Tube.far/near` are already `readonly Point[]`. | failing (import) |
| #8 test quality (no vacuous assertions) | Self-checked: no `let _ =`, no `assert(true)`, no always-true asserts; `expectValidTube` always asserts. | n/a — self-check passed |
| #10 input validation / totality | `is total` test exercises non-positive & large levels; selector must be total via modular math. | failing (import) |
| #1,#3-#7,#9,#11-#13 (casts, enums, async, React, JSON.parse, error handling, build) | Not applicable — pure synchronous geometry math, no casts/async/IO/JSX. | n/a |

**Rules checked:** 3 of 13 lang-review rules are applicable and have test coverage; the other 10 are out-of-domain for this pure-math story.
**Self-check:** 0 vacuous tests found.

**Note for Dev (Sergeant Carter):** The plan (`docs/superpowers/plans/2026-06-25-tempest-wave-3-levels-warp.md`, Task 1) ships exact implementation snippets for `makePolygonTube`, `makeOpenTube`, the profile fns, `GEOMETRIES`, and `tubeForLevel`. My tests are stricter than the plan's sample test, but the plan's reference implementation satisfies them. **Verify with `npm run build` (tsc), not just `npm test`** — Vitest/esbuild does not typecheck, and `noUnusedLocals` will flag the now-unused `makeCircleTube` import in `state.ts` (the plan calls this out — remove it).

**Handoff:** To Dev for GREEN implementation.

## Dev Assessment

**Implementation Complete:** Yes

**Files Changed:**
- `src/core/geometry.ts` — added `makePolygonTube` (closed regular-polygon builder + private `polygonPoint`), `makeOpenTube` (open fan-strip builder), 8 profile fns (FLAT/SHALLOW_V/DEEP_V/BOWL/W/STEP/RAMP/HUMP), the module-level immutable `GEOMETRIES: readonly Tube[]` (16 entries, 8 closed + 8 open, index 0 = the original circle), and the pure period-16 `tubeForLevel(level)` selector.
- `src/core/state.ts` — `initialState` builds the tube via `tubeForLevel(1)`; swapped the `makeCircleTube` import for `tubeForLevel` (removed the now-unused import to satisfy `noUnusedLocals`).
- `src/core/sim.ts` — `startGame` now resets `s.tube = tubeForLevel(1)` before sizing the spike array, so a restart returns to the level-1 geometry; added `tubeForLevel` to the geometry import.

**Tests:** 98/98 passing (GREEN) — full suite, 19 files. New `geometry.cycle.test.ts`: 16/16.
**Build:** `npm run build` clean (tsc exit 0, no `noUnusedLocals`/TS6133 errors); Vite production bundle builds.
**Branch:** `feat/tempest-wave-3-geometry-roster` (pushed, commit `c4174e4`).

**Implementation notes:**
- Followed the Wave 3 plan's Task 1 reference implementation verbatim — it satisfied all of TEA's stricter assertions (deep-equal level 1, exact 8/8 split, reference-identity cycling, NaN-free builders, render-safe `project`).
- No new abstractions beyond what the tests demand. Geometry selection is pure: a modular index into a shared immutable table, no RNG, no DOM, no time — the hard core boundary holds.
- The `makeCircleTube` export remains (still used by the roster's index 0 and by existing tests); only its now-redundant import in `state.ts` was dropped.

**Handoff:** To Reviewer (General Burkhalter) for code review.

## Subagent Results

| # | Specialist | Received | Status | Findings | Decision |
|---|-----------|----------|--------|----------|----------|
| 1 | reviewer-preflight | Yes | clean | 0 smells; 98/98 tests green; tsc exit 0; no lint script | confirmed 0, dismissed 0, deferred 0 |
| 2 | reviewer-edge-hunter | Yes | findings | 5 (1 high, 4 medium) | confirmed 1 (deferred to 3-2), dismissed 0, deferred 4 (out-of-scope hardening) |
| 3 | reviewer-silent-failure-hunter | Yes | findings | 4 (1 high, 1 medium, 2 low) | confirmed 1 (deferred to 3-2), dismissed 0, deferred 3 |
| 4 | reviewer-test-analyzer | Yes | findings | 8 (1 high, 5 medium, 2 low) | confirmed 0 blocking, dismissed 1, deferred 7 (test-quality improvements) |
| 5 | reviewer-comment-analyzer | Yes | findings | 3 (1 high-conf, 2 medium) | confirmed 0 blocking, deferred 3 (doc polish) |
| 6 | reviewer-type-design | Yes | findings | 5 (1 high, 2 medium, 2 low) | confirmed 1 (deferred to 3-2), deferred 4 |
| 7 | reviewer-security | Yes | clean | 0 — purity & determinism fully compliant | confirmed 0, dismissed 0, deferred 0 |
| 8 | reviewer-simplifier | Yes | findings | 4 (all low) | dismissed 4 (named constants aid readability; below extraction threshold) |
| 9 | reviewer-rule-checker | Yes | findings | 1 (low severity) | deferred 1 (FLAT param-type consistency nit) |

**All received:** Yes (9 returned, 6 with findings, 2 clean, 1 preflight)
**Total findings:** 0 blocking confirmed, 5 dismissed, ~22 deferred (1 cross-story to 3-2, the rest non-blocking improvements)

## Reviewer Assessment

**Verdict:** APPROVED

The diff delivers exactly story 3-1's scope — the 16-geometry roster, the two builders, and the pure period-16 `tubeForLevel` — wired into `initialState`/`startGame` at level 1 only. Tests green (98/98), tsc clean, purity/determinism intact. No in-scope Critical/High issues. The one genuinely impactful finding (geometry never swaps on level advance) is **story 3-2's explicit deliverable**, not a 3-1 defect — see below.

### Observations

- `[VERIFIED]` **Purity boundary holds** — evidence: `src/core/geometry.ts:60-148` uses only `Math.PI/cos/sin/abs`; no `Date`, `Math.random`, `window`, `requestAnimationFrame`, or `shell/` import. `sim.ts:4` and `state.ts:2` only add a `tubeForLevel` import from `./geometry`. Complies with CLAUDE.md's load-bearing pure-core rule. `[SEC]` confirmed clean.
- `[VERIFIED]` **`tubeForLevel` is total and deterministic for all integers** — evidence: `geometry.ts:146-148` `(((level-1)%16)+16)%16` always lands in `[0,15]`; same level → same shared object (test `toBe` at `geometry.cycle.test.ts:76`). `[SEC]` confirms bounds safety; no out-of-bounds for any finite integer.
- `[VERIFIED]` **Level 1 is byte-for-byte the original circle** — evidence: `GEOMETRIES[0] = makeCircleTube(16, {0,0}, 60, 300)` (`geometry.ts`), pinned by deep-equal at `geometry.cycle.test.ts:34`. No regression to existing Wave 0-2 behavior; all 18 prior test files stay green.
- `[EDGE][SILENT][TYPE]` **(HIGH → DEFERRED to story 3-2)** `startLevel` (`sim.ts:188-191`) and `checkLevelClear` (`sim.ts:233-239`) increment `s.level` but never call `tubeForLevel(s.level)` nor resize `s.spikes`, so mid-game progression stays on the level-1 circle. **This code path is NOT modified by this diff** (the diff touches only `startGame`), and 3-1's AC explicitly scopes wiring to "`initialState` and `startGame` use `tubeForLevel(1)`". The per-level geometry switch + spike resize is the documented job of story 3-2 ("End-of-level warp transition with geometry switch" → the plan's `advanceLevel`). No current bug: the tube stays the 16-lane circle and spikes stay length 16 during play, so there is no mismatch today. Recorded as a non-blocking Delivery Finding for 3-2.
- `[EDGE][SILENT][TYPE]` **(LOW → DEFERRED)** The exported builders `makePolygonTube`/`makeOpenTube` have no guards for degenerate inputs (`sides < 3` → NaN/Infinity via `cos`; `laneCount = 0` → `0/0 = NaN`). Unreachable from `GEOMETRIES` (all sides 3-8, laneCount 12-16) and not required by any 3-1 AC or project rule. Defensible to leave per minimalist discipline; noted as a future-hardening improvement should these become public level-editor APIs.
- `[TEST]` **(MEDIUM → DEFERRED)** `initialState wiring` test (`geometry.cycle.test.ts:148`) compares `initialState(1).tube` to `tubeForLevel(1)` — both now derive from the same function, so it can't catch a co-changed regression. Not vacuous (the level-1==circle guard exists at line 34), but `toBe` (reference identity) or a literal `laneCount===16` would be stronger. Test-quality improvement, non-blocking.
- `[DOC]` **(LOW → DEFERRED)** The `geometry.ts` comment "Built once (immutable, shared) — never mutated" overstates the runtime guarantee (`readonly` is compile-only; no `Object.freeze`). Accurate as a statement of intent and consistent with the codebase's readonly-everywhere convention. Optional softening to "treat as immutable."
- `[SIMPLE]` **(LOW → DISMISSED)** `GEO_CENTER` and the 8 named profile constants could be inlined. Dismissed: the named profiles document each geometry's shape and `GEO_CENTER` names the shared origin; both aid readability and the duplication is below the extraction threshold. Rationale cites simplifier's own "low confidence / not blocking."
- `[RULE]` **(LOW → DEFERRED)** `FLAT = (): number => 0` (`geometry.ts`) omits the `t` parameter the `profile: (t:number)=>number` slot declares; the seven sibling profiles declare `t`. TypeScript accepts the zero-arity callback (it compiles — build is clean), so this is a cosmetic consistency nit (`(_t: number): number => 0`). Non-blocking.

### Rule Compliance

Rubric = `.pennyfarthing/gates/lang-review/typescript.md` (#1–#13) + CLAUDE.md pure-core rule. Enumerated against every new symbol (`makePolygonTube`, `polygonPoint`, `makeOpenTube`, 8 profile consts, `GEO_CENTER`, `GEOMETRIES`, `tubeForLevel`, the `initialState`/`startGame` edits, and the test file).

| Rule | Verdict | Evidence |
|------|---------|----------|
| #1 type-safety escapes | ✅ compliant | No `as any`/`as unknown`/`@ts-ignore`/`!` anywhere in the diff (rule-checker: 7 instances clean). |
| #2 generics/readonly/Function type | ✅ compliant (1 low nit) | `profile` is a proper signature, not bare `Function`; `GEOMETRIES`/`Tube.far/near` are `readonly`. Nit: `FLAT` lacks explicit `t` param — cosmetic, compiles. |
| #3 enums | ✅ n/a | No enums added. |
| #4 null/undefined (`||` vs `??`) | ✅ compliant | Pure arithmetic; no `||`/`??` on 0/'' values. |
| #5 module/imports (`.js` ext) | ✅ compliant | Extensionless relative imports match the repo's established Vite/TS convention (every existing file). |
| #6 React/JSX | ✅ n/a | No `.tsx`. |
| #7 async | ✅ n/a | All new functions synchronous. |
| #8 test quality | ✅ compliant | No `as any`, no mocks, imports from `src/` not `dist/`; `expectValidTube` always asserts; `toBe` used correctly for shared-table identity. (Improvement opportunities noted, not violations.) |
| #9 build/config | ✅ n/a | No tsconfig/vite changes. |
| #10 input validation/totality | ✅ compliant for scope | `tubeForLevel` total over integers; degenerate-builder hardening is out-of-scope (unreachable, no AC/rule requires it). |
| #11 error handling | ✅ n/a | No try/catch / error types. |
| #12 perf/bundle | ✅ compliant | `GEOMETRIES` built once at module load; `tubeForLevel` is O(1). |
| #13 fix-regressions | ✅ compliant | `state.ts`/`sim.ts` edits introduce no new casts/`||`/type holes. |
| CLAUDE.md pure-core | ✅ compliant | No DOM/Date/Math.random/window/shell import in any changed file. |

### Devil's Advocate

Let me argue this code is broken. First and loudest: **the headline feature does nothing.** A 16-geometry roster that the game never displays past level 1 is, from a player's chair, vaporware — clear level 1, and level 2 is... the same circle. Three independent specialists flagged it. Am I waving it through on a technicality? No: I read `sim.ts:188` myself. `startLevel` was untouched by this diff, 3-1's acceptance criteria say "level 1" in plain text, and story 3-2's title is literally "geometry switch." This is a deliberately thin vertical slice — the data layer lands first, the transition that consumes it lands next. Approving the slice is correct; pretending the slice is the whole feature would be the lie. I have recorded it as a blocking-for-3-2 finding so it cannot be forgotten.

Second attack: **shared mutable singletons.** Every level that maps to the same geometry returns the *same object*. One `(tube.far as Point[]).push(...)` anywhere corrupts that geometry for the rest of the session — and the test at line 76 *depends* on this aliasing. But nothing in the core mutates `Tube` (it's `readonly` throughout, and `cloneState` copies the mutable state around it, never the tube). The risk requires deliberately casting away `readonly`. Acceptable, consistent with the existing `makeCircleTube` pattern; `Object.freeze` is a reasonable future hardening, not a 3-1 blocker.

Third: **a confused caller passes `tubeForLevel(1.5)` and gets `undefined`**, then crashes opaquely. Real, but no code path produces a non-integer level — `s.level` starts at 1 and only `+= 1`. A flooring guard would be defensive polish, not a fix for a live defect.

Fourth: **NaN coordinates from `makePolygonTube(.., 2, ..)`.** Unreachable — the table only uses sides 3-8, and the test pins finiteness for exactly that range. A stressed filesystem, malformed config, malicious input? There is none: this is pure offline math with no I/O, no parsing, no user strings, no persistence in this diff. The security pass confirmed it. None of these attacks lands a blow on *story 3-1's* contract. The slice is sound.

**Data flow traced:** `level` (integer, internal) → `tubeForLevel(level)` → `GEOMETRIES[idx]` (bounds-safe modulo) → shared `Tube` → consumed read-only by `project`/`render`. Safe: index always in `[0,15]`, no user input reaches it.
**Pattern observed:** Data-driven table + pure selector at `geometry.ts:140-148` — idiomatic, mirrors the existing `makeCircleTube` builder style.
**Error handling:** No I/O or async to fail; degenerate-input guards intentionally omitted (unreachable, out of scope).
**Wiring:** `initialState`/`startGame` → `tubeForLevel(1)` verified live by the GREEN suite; mid-game wiring is 3-2's scope.

**Handoff:** To SM (Colonel Hogan) for finish-story.

## Delivery Findings

<!-- Append-only. Each agent adds under its own subheading. -->

### TEA (test design)
- No upstream findings. The Wave 3 plan's Task 1 is self-consistent with the existing `geometry.ts` boundary-point convention; the only wiring wrinkle (unused `makeCircleTube` import in `state.ts` under `noUnusedLocals`) is already documented in the plan.

### Dev (implementation)
- No upstream findings during implementation. The plan's Task 1 was complete and accurate; no gaps, conflicts, or open questions surfaced. The `makeCircleTube` import wrinkle TEA flagged was handled as expected (dropped from `state.ts`, kept as an export).

### Reviewer (code review)
- **Gap** (non-blocking, **owned by story 3-2**): Mid-game level transitions do not swap geometry or resize the spike array. `startLevel`/`checkLevelClear` (`src/core/sim.ts:188,233`) increment `s.level` but never call `tubeForLevel(s.level)`, so the roster added here is only exercised at game-boot and restart. Affects `src/core/sim.ts` — story 3-2's `advanceLevel` must add `s.tube = tubeForLevel(s.level)` and `s.spikes = new Array(s.tube.laneCount).fill(0)`. *Found by Reviewer during code review (corroborated by edge-hunter, silent-failure-hunter, type-design).*
- **Improvement** (non-blocking): Exported builders `makePolygonTube`/`makeOpenTube` (`src/core/geometry.ts`) lack guards for degenerate inputs (`sides < 3`, `laneCount < 1` → NaN/Infinity coords). Unreachable today; harden if these become public level-editor APIs in a later wave. *Found by Reviewer during code review.*
- **Improvement** (non-blocking): `tubeForLevel` returns `undefined` for non-integer `level` (float array index). No current caller passes non-integers; a `Math.floor`/integer assertion would make misuse loud. Affects `src/core/geometry.ts`. *Found by Reviewer during code review.*

## Design Deviations

### TEA (test design)
- **Stricter than the plan's sample test (additive, not a reduction)**
  - Spec source: docs/superpowers/plans/2026-06-25-tempest-wave-3-levels-warp.md, Task 1 Step 1
  - Spec text: sample `geometry.cycle.test.ts` checks laneCount/closed/length, mix of open+closed, per-index boundary counts, and period-16 by laneCount/closed.
  - Implementation: tests additionally assert level-1 **deep equality** to the original circle, the **exact** 8/8 split, **reference identity** for period cycling, both builders in isolation, NaN/render-safety via `project`, and the `startGame` restart reset.
  - Rationale: the sample test would pass against a wrong-but-same-shape table; the stricter assertions pin the actual ACs ("identical level 1", "8 closed and 8 open").
  - Severity: minor
  - Forward impact: none — the plan's reference implementation satisfies all added assertions.
- **`startGame` wiring tested behaviorally rather than by call-site inspection**
  - Spec source: context-story-3-1.md, AC "initialState and startGame use tubeForLevel(1)"
  - Spec text: "`startGame` uses `tubeForLevel(1)`"
  - Implementation: rather than assert the function calls `tubeForLevel`, the test drives a restart from a stale geometry and asserts the observable result (tube + spike array reset to level 1).
  - Rationale: behavioral assertions survive refactors and prove the user-visible effect; a call-site assertion is brittle and the `initialState` equivalence already pins level-1 geometry.
  - Severity: minor
  - Forward impact: none.

### Dev (implementation)
- No deviations from spec. Implemented the Wave 3 plan's Task 1 reference design exactly (builders, profiles, `GEOMETRIES` table, `tubeForLevel`, and the `initialState`/`startGame` wiring); all of TEA's tests pass without altering any test or relaxing any assertion.

### Reviewer (audit)
- **Stricter than the plan's sample test (TEA)** → ✓ ACCEPTED by Reviewer: additive coverage that pins the real ACs (deep-equal level 1, exact 8/8 split). Strengthens, never weakens, the spec. Rule-checker and test-analyzer confirm assertions are meaningful, not vacuous.
- **`startGame` wiring tested behaviorally rather than by call-site inspection (TEA)** → ✓ ACCEPTED by Reviewer: behavioral assertion is the more robust choice and genuinely failed pre-implementation (proving it exercises the new code path). Note: the *sibling* `initialState wiring` test (line 148) is the weaker tautological one — flagged as a non-blocking test-quality improvement above, not as a spec deviation.
- **No deviations from spec (Dev)** → ✓ ACCEPTED by Reviewer: confirmed against the diff — the implementation matches the Wave 3 plan Task 1 reference verbatim; no abstractions added beyond what the tests demand.
- **No undocumented deviations found.** The one scope boundary that matters (mid-game geometry swap absent) is not a 3-1 deviation — 3-1's ACs explicitly scope wiring to level 1, and the swap is story 3-2's deliverable. Recorded as a cross-story Delivery Finding, not a deviation.