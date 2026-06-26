---
story_id: "4-3"
jira_key: ""
epic: "4"
workflow: "tdd"
---
# Story 4-3: High-score entry state machine and table

## Story Details
- **ID:** 4-3
- **Jira Key:** (none — Jira integration not configured)
- **Workflow:** tdd
- **Stack Parent:** none
- **Branch:** feat/4-3-highscore-entry-state-machine
- **Branch Strategy:** gitflow (branched from develop)

## Workflow Tracking
**Workflow:** tdd
**Phase:** red (complete — handing to green/Dev)
**Phase Started:** 2026-06-26T09:12:14Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-06-26T09:12:14Z | 2026-06-26T05:20:00Z | - |
| red | 2026-06-26T05:20:00Z | 2026-06-26T05:22:00Z | ~2m |

## Story Context

### Title
High-score entry state machine and table

### Metadata
- **Story ID:** 4-3
- **Type:** story
- **Points:** 3
- **Priority:** p1
- **Workflow:** tdd
- **Repo:** tempest
- **Epic:** Wave 4 — Superzapper & framing

### Problem
After a game ends with a qualifying score, the player must enter their initials (3 characters, A–Z) to be recorded in the arcade's persistent high-score table. This story implements:
1. The high-score **table logic** — given a list of (name, score, level, date?) entries, insert a new entry in descending-score order and truncate to the top N (arcade convention: 10 entries max).
2. The **initials-entry state machine** — a new `'highscore'` mode where the player rotates through letters A–Z with the spinner (`input.spin`) and confirms each letter with `input.start` or `input.fire`, entering 3 characters total. On completion, insert the entry into the in-memory high-score table and transition to `'attract'` mode.

Both behaviors are pure core logic: no DOM, no `localStorage`, no timers, no `Math.random()`. Persistence (story 4-4) and rendering (story 4-7) are separate concerns.

### Technical Approach

**Part A: High-Score Table Logic**

1. Add a new field to `GameState` to hold the in-memory high-score table: `highScoreTable: HighScoreTable` (using the types defined in `src/core/highscore.ts` from story 4-4).
2. Define a constant `MAX_HIGH_SCORES` (or `MAX_ENTRIES`) in `src/core/rules.ts` — set to 10 per arcade convention.
3. Implement a pure helper `qualifiesForHighScore(table: HighScoreTable, score: number): boolean` — returns true if the table has fewer than `MAX_HIGH_SCORES` entries OR the score is higher than the lowest entry in the table.
4. Implement a pure helper `insertHighScore(table: HighScoreTable, entry: HighScoreEntry): HighScoreTable` — returns a new array with the entry inserted in descending-score order and truncated to `MAX_HIGH_SCORES` entries. Handle ties by preserving insertion order (stable sort) so earlier entries come first.

**Part B: Initials-Entry State Machine**

1. Add a new mode `'highscore'` to the `Mode` type in `src/core/state.ts`.
2. Add an `HighScoreEntryState` interface to `src/core/state.ts`:
   ```typescript
   interface HighScoreEntryState {
     initials: string         // accumulating player input (0, 1, 2, or 3 chars)
     charIndex: number        // which character position is being entered (0, 1, or 2)
     currentLetter: string    // the letter currently shown (A–Z, wraps)
   }
   ```
3. Add `entry: HighScoreEntryState | null` to `GameState` (null when not in initials-entry mode).
4. Define a constant `LETTER_RANGE` (26 for A–Z) in rules or state.
5. In `stepGame`, add a case for `mode === 'highscore'`:
   - `input.spin` rotates `currentLetter` (A → B → … → Z → A, wrapping).
   - `input.start` or `input.fire` confirms the current letter: append it to `initials`, increment `charIndex`.
   - When `charIndex` reaches 3, commit the entry to the in-memory table (call `insertHighScore`) and transition to `'attract'`.
   - Optional: allow `input.zap` or backspace (if in design) to undo the last letter (pop from `initials`, decrement `charIndex`).
6. Initialize `currentLetter` to 'A' for each position.

**Flow Integration**

- In the `'gameover'` case of `stepGame`, add logic:
  - If `input.start` AND `qualifiesForHighScore(state.highScoreTable, state.score)` → transition to `'highscore'` mode and initialize the entry state machine.
  - Else if `input.start` → transition directly to `'attract'` (as 4-2 currently does).

### Acceptance Criteria

1. **Table insertion and truncation:**
   - A new entry is inserted in descending-score order.
   - The table is truncated to `MAX_HIGH_SCORES` (10) after insertion.
   - Ties (equal scores) are handled stably: earlier entries come first.
   - Scores that do not qualify are rejected at the `gameover` → `'highscore'` transition (go straight to `'attract'`).

2. **Qualifying score logic:**
   - `qualifiesForHighScore` returns true if table.length < MAX_HIGH_SCORES.
   - `qualifiesForHighScore` returns true if score > the lowest score in the table.
   - `qualifiesForHighScore` returns false otherwise.

3. **Initials-entry state machine:**
   - Starting in `'highscore'` mode, `charIndex = 0`, `currentLetter = 'A'`.
   - `input.spin` > 0 rotates right (A → B); `input.spin` < 0 rotates left (Z → A, wrapping).
   - `input.start` or `input.fire` confirms the letter (appends to `initials`), increments `charIndex`, resets `currentLetter = 'A'`.
   - After 3 confirmations, the entry (name = `initials`, score, level, optional date) is inserted into `highScoreTable` via `insertHighScore`.
   - On completion, mode transitions to `'attract'`.

4. **Flow integration:**
   - After `'gameover'` with `input.start`:
     - If score qualifies: mode → `'highscore'`, entry state machine begins.
     - If score does NOT qualify: mode → `'attract'` (no entry).

5. **Determinism and purity:**
   - All logic is deterministic (no RNG, no `Date.now()`, no timers in the entry machine itself).
   - `stepGame` mutates only the cloned state, not the input.
   - The entry machine does not import from `shell/` and does not touch the DOM.
   - Existing modes and tests are not affected.

6. **State structure:**
   - `GameState.highScoreTable` is initialized to an empty array `[]` in `initialState`.
   - `GameState.entry` is null by default; set when entering `'highscore'` mode.
   - On transition to `'attract'`, `entry` is reset to null.

7. **Backward compatibility:**
   - The TDD test suite exercises table logic, entry machine state transitions, flow (qualify/reject gameover), and edge cases.
   - No regression in existing modes (`'attract'`, `'select'`, `'playing'`, `'warp'`, `'dying'`, `'gameover'`).

### Scope

- In scope:
  - Pure core table logic: `qualifiesForHighScore`, `insertHighScore`, descending-score sort + truncate.
  - Pure core entry state machine: initials cycling (A–Z wrap), 3-char commit, gameover → qualify decision → entry/attract transition.
  - New `'highscore'` mode and entry state in `GameState`.

- Out of scope:
  - Rendering the entry screen (story 4-7, trivial).
  - Persistence (`localStorage` load/save is story 4-4 + 4-6, wiring).
  - Sound/animations/cosmetics (story 4-5, later).
  - Backspace/undo (if not in the design doc) — covered by future scope.

## Sm Assessment

**Setup decision:** Story 4-3 (*High-score entry state machine and table*, 3pts, p1) routed to the **tdd** phased workflow — correct for a 3-point logic story touching the pure simulation core. Next phase is **red**, owned by **TEA** (The Architect).

**Branch:** `feat/4-3-highscore-entry-state-machine` branched from `develop` (this repo uses gitflow off the protected `develop` branch, not trunk-based off `main`). Confirmed via `git branch --show-current`.

**Jira:** Not configured for this repo. Jira ceremony intentionally skipped — JIRA_KEY left empty. This is expected, not a gap.

**Dependencies:** Story 4-4 (High-score persistence seam) has already shipped; 4-3 depends on the `HighScoreEntry` and `HighScoreTable` types from `src/core/highscore.ts` (4-4 delivered). No blocking upstream work.

**Scope hand-off note for TEA:** The story has two distinct testable components: (1) table sort/insert/truncate logic with a `MAX_HIGH_SCORES` constant, and (2) an initials-entry state machine with A–Z letter rotation and 3-char confirmation. Both are pure core logic — no DOM, no localStorage, no timers. Confirm the new mode name (spec says `'highscore'`), the entry-state structure, and the gameover→qualify→entry flow against the design doc. The design doc (section "Scoring", line ~180) mentions "game-over + high-score (localStorage)" as part of Wave 4 framing; story 4-3 covers the state machine, not persistence. Story 4-4 already defined the table types; 4-3 owns the insertion logic and mode transitions.

## TEA Assessment

**Tests Required:** Yes
**Reason:** 3-point pure-core logic story (table helpers + entry state machine) — exactly the TDD target.

**Test Files:**
- `tests/core/highscore.table.test.ts` — pure table helpers `qualifiesForHighScore` / `insertHighScore` (qualify boundaries, ordering, ties, truncation, purity). 13 tests.
- `tests/core/sim.highscore.test.ts` — the `'highscore'` initials-entry state machine + gameover→qualify routing + determinism/purity. 21 tests.

**Tests Written:** 34 tests covering ACs 1–7.
- 25 fail RED (feature missing) — the behavioural specification of the new surface.
- 9 pass as intentional forward/regression guards (preserved 4-2 gameover→attract routing, no-op inputs, determinism, RNG-untouched, and the cloneState-must-clone-entry guard that will catch a GREEN regression).

**RED proof:** `npx vitest run` → 2 files failed, 25 failed | 190 passed (215). Table failures are `TypeError: qualifiesForHighScore is not a function` (missing export). State-machine failures are clean assertion mismatches (mode `highscore`≠`attract`, charIndex 0≠1, currentLetter `A`≠`B`, etc.). No existing test regressed; no incoherent (module-load/typo) failures.

**Status:** RED (failing — ready for Dev)

**Handoff:** To Dev for implementation (GREEN).

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `src/core/rules.ts` — added `export const MAX_HIGH_SCORES = 10`
- `src/core/highscore.ts` — added pure `qualifiesForHighScore` + `insertHighScore` helpers
- `src/core/state.ts` — `Mode` gains `'highscore'`; added `HighScoreEntryState`; `GameState.entry`/`highScoreTable` fields + `initialState` inits
- `src/core/sim.ts` — `cloneState` clones `entry`/`highScoreTable`; new `'highscore'` entry state machine; `'gameover'` qualify routing
- `tests/core/sim.death.test.ts`, `tests/core/sim.framing.test.ts` — reconciled two stale 4-2 gameover-routing tests to the new 4-3 contract (see Design Deviations)

**Tests:** 215/215 passing (GREEN). `tsc --noEmit` clean. Purity grep: only the two pre-existing comment hits (`rng.ts`, `highscore.ts`); no new violations.
**Branch:** feat/4-3-highscore-entry-state-machine (pushed)

**Handoff:** To review (Reviewer).

## Delivery Findings

Agents record upstream observations discovered during their phase.
Each finding is one list item. Use "No upstream findings" if none.

**Types:** Gap, Conflict, Question, Improvement
**Urgency:** blocking, non-blocking

<!-- Agents: append findings below this line. Do not edit other agents' entries. -->

### Dev (implementation)
- **Conflict** (non-blocking): TEA's RED proof claimed "no existing test regressed", but two 4-2 tests (`sim.death.test.ts`, `sim.framing.test.ts`) hardcoded a qualifying `score = 5000` on an empty board and asserted gameover+start → `'attract'`. 4-3 AC4 deliberately reroutes qualifying scores to `'highscore'`, so those assertions are now contradicted by `sim.highscore.test.ts`. Reconciled by setting those tests' score to `0` (non-qualifying) so they still pin the gameover→attract branch. Affects `tests/core/sim.death.test.ts`, `tests/core/sim.framing.test.ts` (no production behavior change beyond the intended 4-3 routing). *Found by Dev during implementation.*

### TEA (test design)
- **Gap** (non-blocking): `cloneState` in `src/core/sim.ts` does NOT clone the new `entry`/`highScoreTable` fields. Affects `src/core/sim.ts` (Dev must extend `cloneState` to `entry: s.entry ? { ...s.entry } : null` and `highScoreTable: s.highScoreTable.slice()` so the highscore handler mutates only the clone). The test `does not mutate the input state (cloneState must clone entry)` guards this. *Found by TEA during test design.*
- **Gap** (non-blocking): the helpers' module home is unspecified in the plan. Tests import `qualifiesForHighScore`/`insertHighScore` from `src/core/highscore.ts` (colocated with the types). Dev MUST export them from there, not `rules.ts`. Affects `src/core/highscore.ts`. *Found by TEA during test design.*
- **Question** (non-blocking): the plan's `HighScoreEntryState` has no `score`/`level` fields; tests source those from `GameState.score`/`GameState.level` at completion (the ended-game values), which are preserved on the gameover→highscore transition. Confirm Dev does not reset score before insert. *Found by TEA during test design.*

## Design Deviations

Agents log spec deviations as they happen — not after the fact.
Each entry: what was changed, what the spec said, and why.

<!-- Agents: append deviations below this line. Do not edit other agents' entries. -->

### Dev (implementation)
- **Updated two stale 4-2 tests for the new gameover routing:** `tests/core/sim.death.test.ts` and `tests/core/sim.framing.test.ts` each hardcoded `score = 5000` on the default empty board and asserted gameover+start → `'attract'`. Spec/AC4 of 4-3 deliberately changes this: a QUALIFYING score (5000 > 0, empty board) now routes to `'highscore'`, and `sim.highscore.test.ts:229` requires exactly that. No implementation can satisfy both contracts. Implemented `'highscore'` routing per 4-3 and changed those two tests' score to `0` (never qualifies) so they keep validating their original intent — the non-qualifying gameover→attract branch. Reason: prior-story tests superseded by an intended behavior change; their assertions are reconciled, not weakened (the "not playing" guarantee is preserved). Flagged loudly here and in Delivery Findings.

### TEA (test design)
- **Qualify boundary on a FULL board:** Plan AC2 said "true if score > the lowest". Tests pin STRICTLY greater (score == 10th does NOT qualify). Reason: arcade convention — you must beat the lowest holder to displace them, not tie.
- **Qualify boundary on a non-full board:** Plan AC2 said "true if table.length < MAX_HIGH_SCORES" (unconditional). Tests require the score to also be STRICTLY POSITIVE (> 0) — a 0 score never makes the board even when slots are free. Reason: avoids polluting the board with zero-score entries; matches "any positive score qualifies".
- **Confirm input is FIRE only:** Plan AC3 said "input.start OR input.fire confirms". Tests pin `input.fire` as the sole confirm and make `input.start` INERT during entry. Reason: separating the transition trigger (`start`, used by gameover→highscore) from the confirm action (`fire`) removes the carry-over hazard — the same `start` edge that enters 'highscore' cannot also confirm the first initial.
- **Tie placement on insert:** Spec said "stable, earlier entries first". Tests pin that a NEW entry sorts AFTER existing entries of equal score. Reason: existing high-score holders keep the higher rank on a tie.
- **Letter cycling granularity:** Plan AC3 said "spin>0 rotates right, spin<0 rotates left". Tests pin SIGN-BASED ±1 per step (magnitude ignored, A↔Z WRAP both directions), mirroring 4-2's select-screen spin. Reason: consistency with the established 4-2 spin semantics.
- **Inserted entry has NO date:** Plan listed `date?` as optional. Tests assert the core-inserted entry's `date` is `undefined`. Reason: `core/` is pure and cannot call `Date.now()`/`new Date()`; any timestamp is the shell/persistence seam's job (4-4/4-6), not the simulation's.

### Reviewer (audit)
- **Dev — reconcile two stale 4-2 tests (score 5000→0):** → ✓ ACCEPTED: `git diff` confirms the only change is the score value + comments; the old `5000→attract` assertion is logically impossible under AC4. Intent preserved; both branches covered (qualify→highscore at `sim.highscore.test.ts:229`; non-qualify→attract at `:250/:257` + the two reconciled tests). Reconciled, not weakened.
- **TEA — full-board qualify STRICT `>`:** → ✓ ACCEPTED (`highscore.ts:28`; test `:257`).
- **TEA — non-full qualify requires `> 0`:** → ✓ ACCEPTED (`highscore.ts:25`; test `:57`).
- **TEA — `fire`-only confirm, `start` inert during entry:** → ✓ ACCEPTED (`sim.ts:46-63`; tests `:162,241`) — removes carry-over hazard.
- **TEA — tie places new entry AFTER equal holders:** → ✓ ACCEPTED (`highscore.ts:37-38`; test `:103`).
- **TEA — sign-based ±1 letter cycle, wrap both ways:** → ✓ ACCEPTED (`sim.ts:36-40`; tests `:109-125`).
- **TEA — inserted entry has NO date:** → ✓ ACCEPTED (`sim.ts:52-54`; test `:210`) — core purity.

## Reviewer Assessment

**Verdict:** APPROVED

**Verification run by Reviewer:** `npx vitest run` → 29 files / 215 tests passed; `npx tsc --noEmit` → exit 0; purity grep over `src/core/` → only two pre-existing comment hits, zero code violations.

**Test-modification judgment:** LEGITIMATE (not weakening). Only change to the two 4-2 tests is `score 5000→0` + comments; both still assert the gameover→attract branch with a non-qualifying score, and qualify→highscore is covered separately. Coverage reconciled, not lost.

**[VERIFIED] highlights:** table helpers correct across every boundary (empty/front/end+truncate/equal-to-lowest/tie); `start` inert + `fire` confirms (no carry-over auto-confirm); insert uses the just-ended game's score/level with no `date`; `cloneState` deep-clones `entry` + `highScoreTable`, RNG untouched by entry path; `cycleLetter` wraps both directions; mode switch exhaustive across all 7 modes; playing/dying/warp/select unchanged.

**Findings (all non-blocking):**
- `[LOW]` `src/core/highscore.ts:19` — `MAX_HIGH_SCORES` import mid-file (cosmetic; ESM hoists).
- `[LOW]` `src/core/highscore.ts:27` — `qualifiesForHighScore` assumes table sorted-descending (invariant holds; worth a doc-comment).

**Handoff:** To SM for finish-story. No changes requested.

## Delivery Findings (Reviewer)

### Reviewer (code review)
- **Improvement** (non-blocking): move the `MAX_HIGH_SCORES` import to the top of `src/core/highscore.ts`; add a doc-comment to `qualifiesForHighScore` noting the descending-sort dependency. Affects `src/core/highscore.ts`. *Found by Reviewer during code review.*
- **Note for 4-6:** `GameState.highScoreTable` is the in-memory producer (entries have no `date`). 4-6's save path (shell) is where a `date` can be stamped if desired; load-at-boot should seed `GameState.highScoreTable`. *Found by Reviewer during code review.*
