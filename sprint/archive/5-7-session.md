---
story_id: "5-7"
jira_key: ""
epic: "5"
workflow: "trivial"
---
# Story 5-7: Framing-screen render polish: gameover scrim and high-score table self-containment

## Story Details
- **ID:** 5-7
- **Jira Key:** (none)
- **Workflow:** trivial
- **Stack Parent:** none

## Workflow Tracking
**Workflow:** trivial
**Phase:** finish
**Phase Started:** 2026-06-26T21:12:34Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-06-26T20:56:25Z | 2026-06-26T20:57:57Z | 1m 32s |
| implement | 2026-06-26T20:57:57Z | 2026-06-26T21:06:04Z | 8m 7s |
| review | 2026-06-26T21:06:04Z | 2026-06-26T21:12:34Z | 6m 30s |
| finish | 2026-06-26T21:12:34Z | - | - |

## Sm Assessment

**Scope:** 1-point trivial polish, shell-only in `src/shell/render.ts`. No `core/` changes — purely a render concern, so the pure-sim boundary is untouched. Two independent, non-blocking follow-ups carried over from the Epic 4 framing-screen reviews.

**Task 1 — Dimming scrim:** Gameover and attract overlays currently draw framing text/table directly over the additive-blended scene with no backdrop, so the high-score table overlaps the centered tube and contrast suffers. Add a dark scrim (semi-opaque fill) behind the framing text/table before drawing it. Watch the blend mode — the scrim must be drawn in normal (source-over) compositing, not additive, or it won't actually darken. Save/restore `globalCompositeOperation` and `globalAlpha` around it.

**Task 2 — `drawHighScoreTable` self-containment:** It currently relies on `textAlign='center'` persisting from a prior `drawGlowText` call — implicit caller coupling. It must set its own `textAlign` and save/restore so it renders correctly in isolation regardless of prior canvas state.

**Acceptance:**
- Gameover and attract overlays render the high-score table over a dimmed backdrop with readable contrast against the tube behind it.
- `drawHighScoreTable` sets and restores its own `textAlign`; no dependence on caller-leaked canvas state.
- No `core/` changes; render boundary respected.
- Existing tests still pass; this is shell-only so verification is primarily by running the framing screens.

**Routing:** trivial (phased) → handoff to Dev (Sergeant Carter) for the implement phase. No TDD red phase for a 1pt shell-only polish; verify visually plus the existing suite.

## Dev Assessment

**Implementation Complete:** Yes

**Files Changed:**
- `src/shell/render.ts` — (1) Added `drawScrim(ctx, W, H)`: a full-screen dark backdrop (`rgba(0,0,0,0.55)`) drawn `source-over` with save/restore. Called at the top of `drawAttract` and at the start of the `gameover` overlay block in `drawHud`, so the framing text + high-score table read with good contrast instead of fighting the additively-blended scene behind them. (2) `drawHighScoreTable` now opens with `ctx.save()` + explicit `ctx.textAlign = 'center'` and `ctx.restore()`s on every exit path — it no longer depends on a prior `drawGlowText` having left `textAlign='center'`, and leaks no canvas state.

**Compositing note:** The scene is drawn with `globalCompositeOperation = 'lighter'` (additive bloom). A scrim drawn in that mode would *brighten*, not darken — so `drawScrim` forces `source-over`. Verified.

**Tests:** 272/272 passing (GREEN), 32 test files, 0 failures (`5-7-dev-green`). Shell-only change; no core tests affected. `npx tsc --noEmit` clean; `npm run build` succeeds.

**Visual verification (Playwright against live dev server):**
- Attract screen renders clean — title, "NO SCORES YET" table, and prompts all readable; scrim composites without breakage.
- Gameover screen rendered via injected synthetic state — the tube behind is visibly dimmed and GAME OVER / FINAL SCORE / the populated high-score table all read clearly on top. Both ACs confirmed on screen.

**ACs:**
- ✅ Gameover overlay renders the high-score table over a dimmed backdrop with readable contrast against the tube.
- ✅ Attract overlay gets a backdrop too (per story; defensive given 4-2 F1 scene suppression — see Delivery Findings).
- ✅ `drawHighScoreTable` sets and restores its own `textAlign`; correct in isolation, no caller-leaked state.
- ✅ No `core/` changes; shell-only diff in `src/shell/render.ts`.

**Branch:** feat/5-7-framing-render-polish (will push after commit)

**Handoff:** To review phase (General Burkhalter / Reviewer).

## Subagent Results

| # | Specialist | Received | Status | Findings | Decision |
|---|-----------|----------|--------|----------|----------|
| 1 | reviewer-preflight | Yes | clean | none (272/272 green, tsc+build pass, 0 smells, no core/ touched) | N/A |
| 2 | reviewer-edge-hunter | No | Skipped | disabled | Disabled via settings |
| 3 | reviewer-silent-failure-hunter | No | Skipped | disabled | Disabled via settings |
| 4 | reviewer-test-analyzer | No | Skipped | disabled | Disabled via settings |
| 5 | reviewer-comment-analyzer | No | Skipped | disabled | Disabled via settings |
| 6 | reviewer-type-design | No | Skipped | disabled | Disabled via settings |
| 7 | reviewer-security | No | Skipped | disabled | Disabled via settings |
| 8 | reviewer-simplifier | No | Skipped | disabled | Disabled via settings |
| 9 | reviewer-rule-checker | Yes | findings | 3 (all pre-existing, 0 introduced by diff) | confirmed 0, dismissed 0, deferred 3 (pre-existing/out-of-scope) |

**All received:** Yes (2 enabled subagents returned; 7 disabled via `workflow.reviewer_subagents` and assessed directly by reviewer)
**Total findings:** 0 confirmed blocking, 0 dismissed, 3 deferred (all pre-existing, not introduced by this diff)

## Reviewer Assessment

**Verdict:** APPROVED

A 26-line, shell-only render polish in `src/shell/render.ts`. Two surgical changes that do exactly what the 4-7 reviewer findings #1/#2 asked, no more. I went hunting for the flaw and did not find a blocking one.

### Subagent dispatch (all 8 tags)
- `[RULE]` rule-checker (enabled): **0 violations introduced by the diff.** The `save()/restore()` wrapping in `drawHighScoreTable`, the new `drawScrim`, and both call sites are fully compliant with all 13 TS checks + the architectural-boundary rule. Three findings, all **pre-existing** and not caused by this change (see deferred below).
- `[EDGE]` edge-hunter (disabled): assessed directly — boundary cases checked: empty `highScoreTable` (early-return path restores ctx), `W/H` zero (harmless `fillRect`), save/restore balance on both exit paths. Clean.
- `[SILENT]` silent-failure-hunter (disabled): assessed directly — no try/catch, no error swallowing, no fallbacks in the diff. N/A.
- `[TEST]` test-analyzer (disabled): assessed directly — no test code changed; existing 272 tests green; shell rendering is verified visually by design (CLAUDE.md). No regression.
- `[DOC]` comment-analyzer (disabled): assessed directly — the three new comments are accurate (source-over rationale, 4-2 F1 cross-reference, self-containment note) and match surrounding density.
- `[TYPE]` type-design (disabled): assessed directly — no new types; `drawScrim` params concretely typed (`CanvasRenderingContext2D, number, number`); no `as any`/casts. Clean.
- `[SEC]` security (disabled): assessed directly — pure canvas drawing; no user input, JSON.parse, URLs, secrets, or auth. N/A.
- `[SIMPLE]` simplifier (disabled): assessed directly — `drawScrim` is the minimal extraction of a shared backdrop; no over-engineering, no dead code introduced.

### Rule Compliance
Project rules applied to the diff (CLAUDE.md hard boundary + TS lang-review checklist):
- **Hard architectural boundary (core/ pure, shell/ may use canvas):** `render.ts` is shell. No `core/` file touched; imports are shell→core (correct direction); no `Date.now`/`Math.random`/`requestAnimationFrame` introduced into core. **COMPLIANT** — verified by preflight (`changed_files` lists only `src/shell/render.ts` + sprint bookkeeping).
- **Canvas state hygiene (mutating ctx must not leak):** EVERY new state-mutating function checked — `drawScrim` wraps `globalCompositeOperation/globalAlpha/shadowBlur/fillStyle` in save/restore; `drawHighScoreTable` now wraps `textAlign/textBaseline/font/fillStyle/shadowColor/shadowBlur` in save/restore with restore on **both** exit paths. **COMPLIANT.**
- **Type-safety escapes / null handling / async / error handling:** no casts, no `||`-on-falsy bugs, no async, no catch blocks introduced. **COMPLIANT.**
- **Style/idiom:** comment density and cross-reference style match `drawWarp`/`drawClawIcon`/the 4-2 F1 block. **COMPLIANT.**

### Observations (≥5)
1. `[VERIFIED]` `drawHighScoreTable` save/restore is balanced on both exit paths — evidence: `render.ts:376` `ctx.save()`, restore before the empty-table `return`, and restore at function end. Satisfies AC #2 (self-containment) and leaks no canvas state. Complies with canvas-hygiene rule.
2. `[VERIFIED]` `drawScrim` forces `globalCompositeOperation='source-over'` — evidence: the helper sets it explicitly before `fillRect`. Correct: the scene is drawn `'lighter'` (additive, `render.ts:686`); a fill in that mode would *brighten*, defeating the purpose. The author's comment names the exact trap.
3. `[VERIFIED][RULE]` No `core/` changes — evidence: preflight `core_boundary: CLEAN`; only `src/shell/render.ts` is source-changed. Pure-sim boundary intact.
4. `[LOW]` The gameover scrim dims the HUD score/level/lives that `drawHud` paints *before* the gameover block (`render.ts:537-552` run before the `drawScrim` at the start of the `gameover` branch). Cosmetic only — confirmed legible in the Dev's screenshot, and a modal dim of the live HUD is conventional/desirable for a game-over screen. At gameover `lives=0`, so no life glyphs are hidden. Non-blocking.
5. `[LOW][RULE]` `drawScanlines` (`render.ts:405`) mutates `globalCompositeOperation`/`globalAlpha` without save/restore — the one function inconsistent with the hygiene pattern this diff promotes. **Pre-existing, not introduced by the diff**; harmless because it sets absolute known-good values and its call sites are either terminal or immediately followed by explicit state-setting. Deferred as a future cleanup, not a blocker.
6. `[VERIFIED]` Attract scrim is effectively a no-op given 4-2 F1 scene suppression (Dev already logged this as a Delivery Finding). Implemented per the story's explicit ask; acts as a defensive backstop. Accepted.

### Deferred (pre-existing, out of scope for a 1-pt polish)
- `drawScanlines` lacking save/restore (`render.ts:405`) — observation #5.
- `tsconfig.json:10` `skipLibCheck: true` — standing project config, untouched by diff.
- `e.name || '???'` (`render.ts:394`) — context line, not in the diff hunk; `name` is typed `string` so the fallback is unreachable-but-harmless, not a `??` bug.

### Devil's Advocate
Let me argue this code is broken. **Claim 1: the scrim leaks state and corrupts later draws.** `drawScrim` mutates four ctx properties — if `restore()` didn't run, the next frame's additive scene would render in `source-over` at alpha 1 with the black fill style, washing the tube out. Refuted: the helper is a strict `save()`…`restore()` bracket with no early return and no throwing call between them (`fillRect` cannot throw on a valid 2D context), so the bracket always balances. **Claim 2: `drawHighScoreTable` leaks on the empty-table path.** A reader might assume the early `return` skips the restore. Refuted: the diff explicitly inserts `ctx.restore()` immediately before that `return` — both paths are covered; the rule-checker independently confirmed this. **Claim 3: a confused user sees the high-score table vanish behind an opaque black rectangle.** Refuted: 0.55 alpha is translucent, drawn *before* the text/table, so the glowing text composites on top at full brightness — the Dev's gameover screenshot shows the table clearly legible over the dimmed tube. **Claim 4: the scrim darkens something it shouldn't, hiding game info.** The gameover scrim does dim the pre-drawn HUD (observation #4), but at game-over `lives=0` (no life glyphs), the FINAL SCORE is re-drawn prominently in the overlay, and the top score/level remain legible — no information is lost. **Claim 5: stressed/edge inputs.** Zero-size canvas → `fillRect(0,0,0,0)` is a no-op; an absurdly large `highScoreTable` → the loop is bounded by `Math.min(maxRows, table.length)` (≤10), pre-existing. **Claim 6: this erodes the deterministic core.** It cannot — the change is entirely within the shell render layer, touches no `GameState`, and adds no time/RNG source. Every avenue of attack closes. The change is minimal, correct, and faithful to the originating findings.

**Data flow traced:** `s.highScoreTable` (pure core state) → `drawHighScoreTable`/`drawScrim` (shell render, read-only) → canvas pixels. No mutation back into state; deterministic core untouched.
**Pattern observed:** shared-helper extraction with disciplined save/restore at `render.ts:416` (`drawScrim`) — good pattern, now the in-file standard the lone `drawScanlines` doesn't yet follow.
**Error handling:** no failure paths in pure canvas draws; null/empty inputs (empty table) explicitly handled with a restoring early return.

**Handoff:** To SM (Colonel Hogan) for finish-story.

## Delivery Findings

Agents record upstream observations discovered during their phase.
Each finding is one list item. Use "No upstream findings" if none.

**Types:** Gap, Conflict, Question, Improvement
**Urgency:** blocking, non-blocking

No upstream findings.

<!-- Agents: append findings below this line. Do not edit other agents' entries. -->

### Dev (implementation)
- **Improvement** (non-blocking): The story premise that the *attract* overlay "draws over the additive-blended scene" is outdated — the 4-2 F1 fix (`render.ts:672`) early-returns and suppresses the playing scene for attract/select/highscore, so attract's backdrop is already pure black. The scrim was still added to `drawAttract` per the story's explicit ask; it now acts as a defensive backstop (correct contrast if the scene ever leaks again) and a consistency match with gameover. The genuinely impactful scrim is the gameover one, where the scene IS still drawn behind. Affects `src/shell/render.ts` (no change needed — noting for the record). *Found by Dev during implementation.*

### Reviewer (code review)
- **Improvement** (non-blocking): `drawScanlines` (`render.ts:405`) mutates `globalCompositeOperation`/`globalAlpha` without a save/restore bracket — the only state-mutating draw helper that doesn't follow the canvas-hygiene pattern this story establishes in `drawScrim`/`drawHighScoreTable`. Harmless today (sets absolute known-good values; call sites are terminal or followed by explicit state-setting). A future polish story could wrap it for consistency. Affects `src/shell/render.ts` (`drawScanlines` — add `ctx.save()/restore()`). *Found by Reviewer during code review.*

## Design Deviations

Agents log spec deviations as they happen — not after the fact.
Each entry: what was changed, what the spec said, and why.

No design deviations.

<!-- Agents: append deviations below this line. Do not edit other agents' entries. -->

### Dev (implementation)
- No deviations from spec.

### Reviewer (audit)
- **"No deviations from spec"** → ✓ ACCEPTED by Reviewer: confirmed accurate. The attract scrim was added per the story's explicit ask (not a deviation) and the Dev correctly logged its defensive nature as a Delivery Finding rather than a deviation. I traced the diff against the story ACs and the 4-7 findings and found no undocumented spec divergence — both changes implement exactly what was specified, scoped to the shell.
## Impact Summary

**Delivery Findings Analysis:**
- 2 non-blocking improvements identified (Dev + Reviewer)
- 0 blocking issues; no functional regressions
- All acceptance criteria satisfied with visual verification
- Canvas state hygiene fully compliant on new code; pre-existing `drawScanlines` inconsistency deferred

**Key Observations:**
1. Attract scrim serves as a defensive backstop given the 4-2 F1 scene suppression fix
2. Gameover scrim is the genuinely impactful change, enabling clear contrast for the high-score table
3. `drawHighScoreTable` now self-contained with explicit save/restore on both exit paths
4. Pure-sim boundary intact; shell-only rendering diff

**Recommendation:** Ready to finish. Non-blocking improvements can be addressed in future polish stories.
