---
story_id: "4-7"
jira_key: ""
epic: "4"
workflow: "trivial"
---
# Story 4-7: Framing screens and Claw-icon lives HUD

## Story Details
- **ID:** 4-7
- **Jira Key:** (none — Jira not configured)
- **Workflow:** trivial
- **Stack Parent:** none
- **Repos:** tempest

## Workflow Tracking
**Workflow:** trivial
**Phase:** implement
**Phase Started:** 2026-06-26T09:37:18Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-06-26T09:37:18Z | - | - |
| implement | 2026-06-26T09:37:18Z | - | - |

## Delivery Findings

Agents record upstream observations discovered during their phase.
Each finding is one list item. Use "No upstream findings" if none.

**Types:** Gap, Conflict, Question, Improvement
**Urgency:** blocking, non-blocking

No upstream findings.

## Design Deviations

Agents log spec deviations as they happen — not after the fact.
Each entry: what was changed, what the spec said, and why.

No design deviations.

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `src/shell/render.ts` — added `drawClawIcon`, `drawGlowText`, `drawHighScoreTable`, `drawScanlines`, `drawAttract`, `drawSelect`, `drawEntry`, `drawFrame`; `render()` early-returns to `drawFrame` for `attract`/`select`/`highscore` (4-2 F1 stale-frame fix); `drawHud` now shows score + HI-SCORE + level and renders lives as miniature Claw glyphs; gameover overlay shows final score + high-score table + play-again prompt.

**Tests:** No renderer unit tests in this project (shell is verified by running the game). `npx tsc --noEmit` clean; `npm run build` succeeds. Visually confirmed working by the human (all framing screens + HUD).
**Scope:** SHELL only — committed diff is `src/shell/render.ts` only; no `src/core/` changes.
**Branch:** feat/4-7-framing-screens-lives-hud.

**Handoff:** To Reviewer (review phase).

## Reviewer Assessment

**Verdict:** APPROVED

**Verification:** committed diff is `src/shell/render.ts` ONLY (one commit, no core); `npx tsc --noEmit` exit 0; `npm run build` exit 0. F1 fix VERIFIED — `render()` returns before the playing-scene block for attract/select/highscore (no stale tube/enemy leak on boot or gameover→attract). Null-safety VERIFIED (drawEntry guards `entry===null`; high-score table guards empty; out-of-range initials guarded). ctx-state-leak VERIFIED clean (globalAlpha/shadowBlur/compositeOp/textAlign all reset). Mode coverage VERIFIED (all 7 modes render, no blank screen). Font weights (500/700/900) match index.html's Orbitron load.

**Findings (all LOW, non-blocking — Wave 5 polish):**
- Gameover overlay has no dimming scrim over the additive scene; high-score table overlaps the tube. Legible (human-confirmed). `render.ts:554-569`.
- `drawHighScoreTable` relies on `textAlign='center'` persisting from a prior `drawGlowText` (implicit coupling; works today). `render.ts:385-395`.

**All 8 ACs satisfied with evidence. Handoff:** To SM for finish-story.
