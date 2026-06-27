---
story_id: "3-4"
jira_key: ""
epic: "3"
workflow: "tdd"
---
# Story 3-4: Difficulty ramp continues past the geometry cycle

## Story Details
- **ID:** 3-4
- **Jira Key:** (none — project does not use Jira)
- **Workflow:** tdd
- **Stack Parent:** none
- **Branch Strategy:** gitflow (feat/3-4-difficulty-ramp-past-cycle)

## Workflow Tracking
**Workflow:** tdd
**Phase:** finish
**Phase Started:** 2026-06-27T00:16:10Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-06-27T00:00:07Z | 2026-06-27T00:02:45Z | 2m 38s |
| red | 2026-06-27T00:02:45Z | 2026-06-27T00:08:35Z | 5m 50s |
| green | 2026-06-27T00:08:35Z | 2026-06-27T00:11:07Z | 2m 32s |
| review | 2026-06-27T00:11:07Z | 2026-06-27T00:16:10Z | 5m 3s |
| finish | 2026-06-27T00:16:10Z | - | - |

## Sm Assessment

**Scope:** 2-point pure-core Wave 3 task. Make difficulty escalation explicit past the 16-geometry cycle so a repeated geometry (level 17+) plays harder than its first appearance. **`core/` only** — no shell/render/audio. The pure-sim boundary and determinism (seeded RNG, `dt`-driven time) must stay intact.

**Target code (Dev owns detail):**
- `levelParams(level)` — ramp formula `1 + (level-1)*0.15` already scales monotonically; ensure it applies unbroken across the level-16 → 17 wrap (no reset on geometry repeat) and add playable floors on timing intervals so very high levels don't approach zero interval.
- `rollSpawnKind(level, rng)` — preserve the early-level introduction schedule (Tanker/Spiker ≥ L3, Pulsar/Fuseball ≥ L5) while scaling harder-kind weights by `cycle = floor((level-1)/16)` so the second cycle opens the full roster.

**Acceptance (full set in context file):**
1. `levelParams` strictly increasing across the cycle boundary (L20 > L16).
2. Timing intervals have playable floors (e.g. L50 stays above sane minimums — no infinite spawn).
3. By L18 all five kinds (Flipper, Tanker, Spiker, Pulsar, Fuseball) are reachable with seeded RNG.
4. Early-introduction schedule preserved (no Tanker/Spiker < L3, no Pulsar/Fuseball < L5).
5. Deterministic: identical seed + RNG state → identical spawn sequences at all levels.
6. Existing tests green; new tests in `tests/core/sim.difficulty.test.ts`.

**Notes for TEA (RED):** This is testable entirely against the pure core — drive `levelParams`/`rollSpawnKind` directly with a fixed RNG seed, assert monotonicity, interval floors, roster availability by level, and the preserved introduction gates. No DOM/canvas needed.

## Tea Assessment

**Phase:** finish — complete. New test file: `tests/core/sim.difficulty.test.ts` (8 tests). Committed `f82b0a4`.

**RED state (verified by testing-runner, run 3-4-tea-red): 6 pass / 2 fail.**

**Key discovery — most ACs already hold against current code.** `s.level` is uncapped in `sim.ts` (`s.level += 1`, line 350) and `levelParams(s.level)`/`rollSpawnKind(s.level, …)` receive the true ever-increasing level. The `MAX_SELECT_LEVEL` clamp applies only to the attract-screen start-level *selection*, not in-game progression. Therefore:
- AC#1 (ramp strictly increasing across the L16→17 boundary) — already true.
- AC#2 (timing floors at high levels) — already implemented via `Math.max` floors in `levelParams`.
- AC#3 (full roster by L18) — already true (`rollSpawnKind` gates open by L5).
- AC#4 (introduction schedule) — already true.
- AC#5 (determinism) — already true.

These are covered by **6 regression-guard tests that pass now** — they lock the existing behavior so a Dev refactor can't silently break it.

**The one genuinely new behavior** = cycle-scaled spawn weights. Today `rollSpawnKind` produces an identical hard-enemy proportion (0.5632) on cycles 0/1/2 (levels 5/21/37, same in-cycle position). The **2 failing tests** demand that proportion *escalate* with `cycle = floor((level-1)/16)`:
- `escalates … second cycle than the first` — FAIL: `0.5632 > 0.5632` is false.
- `keeps escalating … third cycle` — FAIL: same.

**Notes for Dev (Sergeant Carter):**
- Scale the hard-kind weights (tanker/spiker/pulsar/fuseball) in `rollSpawnKind` by the cycle number while **keeping the `level >= 3` / `level >= 5` introduction gates intact** (the introduction-schedule guard test enforces this — don't open enemies early).
- Flipper weight should stay fixed (scaling all weights equally leaves the *proportion* unchanged and won't turn the tests green).
- Do **not** change the RNG draw count per roll (`weightedPick` calls `rngNext` once) — the determinism guard depends on it.
- Pure-core only: no shell/DOM/time. Keep `core/` deterministic.
- The cross-cycle tests are deterministic (fixed seed 4242, N=6000); a meaningful per-cycle increase clears them comfortably.

### Rule Coverage (TS lang-review + project rules)
- **CLAUDE.md hard boundary (core pure & deterministic):** covered by the determinism test (identical seed+level ⇒ byte-identical sequence) and by testing only pure `rules.ts` functions with the seeded RNG — no DOM/time/Math.random.
- **TS #4 null/undefined (`||` vs `??` falsy bugs):** the floor/ramp guards assert concrete numeric thresholds, catching any `|| default` regression that would mishandle a `0`-valued interval.
- **TS #8 test quality (no vacuous assertions):** self-checked — every test asserts a concrete value/inequality/Map equality; no `let _ =`, no `assert(true)`, no `is*`-on-always-null.
- **TS #3 enum/roster exhaustiveness:** the roster test asserts all five `EnemyKind` values are reachable by L18, guarding against a kind being dropped from the spawn table.
- TS checks #1/#5/#6/#7/#9–#13 (casts, modules, JSX, async, build, security, perf) — N/A to a pure arithmetic/weighted-pick change; no such surface in the diff.

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `src/core/rules.ts` — `rollSpawnKind` now scales hard-enemy weights by `cycle = floor((level-1)/16)`; added `SPAWN_CYCLE_HARD_SCALE = 0.5` constant. Flipper weight fixed at 10; L3/L5 introduction gates applied before the scale (so gated 0 stays 0); single `rngNext` draw per roll unchanged (determinism preserved).

**Approach:** Minimal, surgical change to the one function TEA's RED tests targeted. Hard weights become `base * (1 + cycle * 0.5)` → cycle 0 ×1.0, cycle 1 ×1.5, cycle 2 ×2.0. Hard-enemy share rises each cycle (≈0.565 → 0.661 → 0.722 at levels 5/21/37) while flippers never vanish (fixed weight). `levelParams` untouched — its ramp/floors already satisfied AC#1/#2 and the regression guards confirm it.

**Tests:** 280/280 passing (GREEN). The 2 cycle-scaling tests now pass; 6 difficulty regression guards stay green; no existing tests regressed. `tsc --noEmit` clean.
**Branch:** feat/3-4-difficulty-ramp-past-cycle (pushed)

**Handoff:** To review phase (Reviewer).

## Delivery Findings

Agents record upstream observations discovered during their phase.
Each finding is one list item. Use "No upstream findings" if none.

**Types:** Gap, Conflict, Question, Improvement
**Urgency:** blocking, non-blocking

- **Improvement (non-blocking):** ACs #1–#5 were already satisfied by existing code (uncapped `s.level` feeding `levelParams`/`rollSpawnKind`). The story's substantive deliverable is the cycle-scaled spawn weights (AC-implied by the technical approach, not a numbered AC). RED is driven by 2 new tests for that behavior; the other 6 are regression guards. Dev's scope is effectively just `rollSpawnKind` weight scaling.

## Impact Summary

**Upstream Effects:** No upstream effects noted
**Blocking:** None

## Subagent Results

| # | Specialist | Received | Status | Findings | Decision |
|---|-----------|----------|--------|----------|----------|
| 1 | reviewer-preflight | Yes | clean | none (280/280 green, tsc clean, 0 smells) | N/A |
| 2 | reviewer-edge-hunter | Skipped | disabled | N/A | Disabled via settings — assessed directly |
| 3 | reviewer-silent-failure-hunter | Skipped | disabled | N/A | Disabled via settings — assessed directly |
| 4 | reviewer-test-analyzer | Skipped | disabled | N/A | Disabled via settings — assessed directly |
| 5 | reviewer-comment-analyzer | Skipped | disabled | N/A | Disabled via settings — assessed directly |
| 6 | reviewer-type-design | Skipped | disabled | N/A | Disabled via settings — assessed directly |
| 7 | reviewer-security | Skipped | disabled | N/A | Disabled via settings — assessed directly |
| 8 | reviewer-simplifier | Skipped | disabled | N/A | Disabled via settings — assessed directly |
| 9 | reviewer-rule-checker | Yes | clean | 0 violations / 14 rules / 47 instances | N/A |

**All received:** Yes (2 enabled returned clean, 7 disabled assessed directly)
**Total findings:** 0 confirmed, 0 dismissed, 2 deferred (pre-existing, out of scope)

## Reviewer Assessment

**Verdict:** APPROVED

A 17-line, pure-core change to one function (`rollSpawnKind` in `src/core/rules.ts`) plus a 146-line deterministic test file. It implements exactly the story's Technical Approach — cycle-scaled hard-enemy spawn weights so a repeated geometry past level 16 spawns a meaner roster — and nothing more. I hunted for the flaw; there is no blocking one.

### Subagent dispatch (all 9 tags)
- `[RULE]` rule-checker (enabled): **0 violations** across 14 rules / 47 instances. Confirmed core purity (no DOM/Date/Math.random; randomness only via seeded `rngNext`), determinism, correct `?? 0` nullish handling on every `Map.get`, immutable `ReadonlyArray<readonly [...]>` table types, no `as any`/casts, exhaustive `EnemyKind` union. Independently flagged the `level=0 → cycle=-1 → hard=0.5` pathological edge and concluded it acceptable (level 0 is not a valid game state).
- `[*]` preflight (enabled): 280/280 tests green, `tsc --noEmit` clean, 0 code smells (no console.log/TODO/.skip).
- `[EDGE]` edge-hunter (disabled): assessed directly — boundary levels enumerated via `node` (L0→cycle-1, L1-16→cycle0, L17→cycle1, L1000→cycle62). Gates zero out hard kinds at L0-2; flipper (fixed weight 10) never vanishes; no NaN/Infinity/overflow at any finite level. Clean.
- `[SILENT]` silent-failure-hunter (disabled): assessed directly — no try/catch, no swallowed errors, no fallbacks introduced. `weightedPick`'s `return table[0][0]` default is pre-existing and defensive. N/A.
- `[TEST]` test-analyzer (disabled): assessed directly — every test asserts concretely (Map-equality, inequalities); cross-cycle tests assert *directional* inequalities (not magnitudes) so they aren't coupled to the `0.5` constant; all seeded/deterministic (not flaky). No vacuous assertions.
- `[DOC]` comment-analyzer (disabled): assessed directly — the three new comments are accurate ("cycle 0 for levels 1–16, 1 for 17–32" matches `floor((level-1)/16)`; "flipper share shrinks"; "difficulty does not reset on wrap"). No staleness.
- `[TYPE]` type-design (disabled): assessed directly — `SPAWN_CYCLE_HARD_SCALE: number` inferred const, table type unchanged, no stringly-typed APIs, no casts. Clean.
- `[SEC]` security (disabled): assessed directly — pure arithmetic over a game-internal `level: number`; no user input, JSON.parse, URLs, secrets, or auth. N/A.
- `[SIMPLE]` simplifier (disabled): assessed directly — minimal extraction (one constant + two derived locals); exporting the tuning constant matches the file's existing `SCORE_*`/`SPIKE_*` convention. No over-engineering, no dead code.

### Rule Compliance
Project rules = CLAUDE.md hard boundary + TS lang-review checklist (no `.claude/rules/*.md` or `SOUL.md` exist).
- **Hard architectural boundary (core/ pure & deterministic):** `rules.ts` is core. EVERY new line checked — imports only `./rng` + `./state` (no `shell/`); no DOM/`Date`/`performance.now`/`Math.random`/`requestAnimationFrame` introduced; only `Math.floor`. `rollSpawnKind(level, rng)` derives `cycle`/`hard` purely from `level` and draws exactly one `rngNext` — identical input ⇒ identical output, proven by the determinism test. **COMPLIANT.**
- **TS #4 (null/undefined `||` vs `??`):** all six `Map.get(...) ?? 0` sites use nullish coalescing correctly (0 is valid, undefined is the miss). **COMPLIANT.**
- **TS #2 (readonly / generics):** spawn table stays `ReadonlyArray<readonly [EnemyKind, number]>`. **COMPLIANT.**
- **TS #1 (type-safety escapes):** zero casts/`as any`/`@ts-ignore` in the diff. **COMPLIANT.**
- **TS #8 (test quality):** no `as any`, no mocks, imports from `src/` not `dist/`, every test has a meaningful assertion. **COMPLIANT.**
- **TS #3 (enum exhaustiveness):** `EnemyKind` is a string union; the roster test asserts all five members reachable by L18. **COMPLIANT.**
- TS #5/#6/#7/#9/#10/#11/#12/#13 — N/A or unchanged (no modules/JSX/async/build/security/error surface added).

### Observations (≥5)
1. `[VERIFIED]` Core purity preserved — evidence: `rules.ts:99-100` derive `cycle`/`hard` from `level` only; `weightedPick` (`rules.ts:81`) draws one `rngNext`. Complies with the CLAUDE.md determinism boundary; confirmed by the determinism test (`sim.difficulty.test.ts:138-145`).
2. `[VERIFIED]` Introduction gates intact under scaling — evidence: `rules.ts:104-107` apply `level >= 3 ? 4 * hard : 0` (gate before multiply), so gated `0` stays `0`. The introduction-schedule test (exact `{flipper:500}` Map at L1/L2, no pulsar/fuseball at L4) enforces it. Satisfies AC#4.
3. `[VERIFIED]` Cycle boundary correct — evidence: `node` check shows L16→cycle 0, L17→cycle 1, matching the comment and "no reset on geometry wrap." Satisfies AC#1's intent.
4. `[VERIFIED]` Flipper never vanishes at extreme depth — evidence: flipper weight fixed at 10 (`rules.ts:103`) while hard total grows; at L1000 share ≈ 0.023 but > 0. No degenerate all-hard state.
5. `[LOW]` `level=0` yields `cycle=-1`, `hard=0.5` (`rules.ts:99-100`). Unreachable — in-game `level` starts at 1 and only increments; gates zero out hard kinds there anyway. Non-blocking; rule-checker independently reached the same conclusion. Deferred.
6. `[LOW]` No upper cap on `hard` — unbounded with cycle. Intentional ("keep escalating") and safe (no overflow/NaN; flipper retained). Deferred as a possible future tuning knob, not a defect.
7. `[VERIFIED]` Test file naming (`sim.difficulty.test.ts`) tests `rules.ts` directly — matches the AC's named file and the existing `sim.spawn.test.ts` convention (which also unit-tests `rollSpawnKind`). Acceptable.

### Deferred (pre-existing / out of scope)
- `level=0 → hard=0.5` pathological edge (observation #5) — unreachable game state.
- `tsconfig.json:10` `skipLibCheck: true` — standing project config, untouched by this diff.

### Devil's Advocate
Let me argue this code is broken. **Claim 1: cycle scaling leaks hard enemies in before their introduction level.** A confused reader might think multiplying by `hard` could turn a 0-weight tanker positive early. Refuted: the multiply is *inside* the `level >= 3 ? … : 0` ternary's true-branch only — at level 1/2 the expression short-circuits to literal `0`, and `0 * hard` never even executes. The introduction-schedule test asserts exact `{flipper:500}` Maps at L1/L2 and zero pulsar/fuseball at L4, and it passes. **Claim 2: weights become non-integer (4.5) and break `weightedPick`.** Refuted: `weightedPick` (`rules.ts:79-89`) sums weights into `total` and compares `roll.value * total` against running cumulative weight — it is float-agnostic; `if (w <= 0) continue` still skips gated kinds; the `pick < 0` test works for fractional weights identically. 280 tests pass including the roster test that requires all five kinds at L18 with fractional weights. **Claim 3: a malicious/extreme level overflows or NaNs.** Refuted: `level` is a game-internal `number` bounded by play (starts at 1, +1 per level); even at L1000 `hard=32`, weights stay small doubles, no overflow, no NaN. `level=0` gives `hard=0.5` but is unreachable and harmless (gates closed). **Claim 4: the change is non-deterministic and erodes the pure core.** Refuted: no Date/Math.random/DOM added; `cycle`/`hard` are pure functions of `level`; one `rngNext` draw per roll is unchanged, so the RNG stream advances identically — the determinism test proves byte-identical sequences for identical seed+level. **Claim 5: tests are vacuous or coupled to the magic number 0.5.** Refuted: the cross-cycle tests assert directional inequalities (`thirdCycle > firstCycle`, `>= secondCycle`) that hold for *any* monotonic per-cycle increase, so a future tuning of `SPAWN_CYCLE_HARD_SCALE` won't spuriously break them, yet they still fail against the pre-change code (proven RED: `0.5632 > 0.5632` false). **Claim 6: stressed inputs.** Empty/huge roll counts are bounded by the test constants; the production path spawns one kind per spawn event. Every avenue of attack closes. The change is minimal, correct, faithful to the spec, and deterministic.

**Data flow traced:** `s.level` (pure GameState, uncapped `+= 1` at `sim.ts:350`) → `rollSpawnKind(s.level, s.rng)` (`sim.ts:105`) → `cycle`/`hard` (pure) → weighted pick over the seeded `rng` → `{kind, rng}` written back to spawn an enemy. No DOM/time/Math.random anywhere; deterministic end to end.
**Pattern observed:** gate-before-scale (`level >= 3 ? base * hard : 0`) at `rules.ts:104` — keeps the introduction schedule authoritative while layering difficulty on top. Good, minimal pattern.
**Error handling:** no failure paths in pure arithmetic/weighted-pick; the only "edge" (level 0) is unreachable and degrades gracefully to flipper-only.

**Deviation audit:** Dev logged "No deviations from spec" and noted `rollTankerCargo` left unscaled.
- **`rollTankerCargo` left unscaled** → ✓ ACCEPTED by Reviewer: the story scope and Technical Approach name only `rollSpawnKind`; no test covers tanker-cargo hardening; scaling it would be unrequested scope creep. Agrees with author reasoning.

**Handoff:** To SM (Colonel Hogan) for finish-story.

## Design Deviations

Agents log spec deviations as they happen — not after the fact.
Each entry: what was changed, what the spec said, and why.

### Dev (implementation)
- No deviations from spec. Implemented exactly the cycle-scaled `rollSpawnKind` weights described in the story context's Technical Approach (`cycle = floor((level-1)/16)`), preserving the introduction gates. `rollTankerCargo` left unscaled (out of scope; no test covers it; story names only `rollSpawnKind`). → ✓ ACCEPTED by Reviewer: faithful to story scope; the `rollTankerCargo` carve-out is sound (avoids unrequested scope creep). No undocumented deviations found in the audit.