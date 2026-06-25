---
story_id: "3-5"
jira_key: ""
epic: "3"
workflow: "trivial"
---
# Story 3-5: Per-level color cycling, open-tube and warp rendering

## Story Details
- **ID:** 3-5
- **Jira Key:** (none)
- **Workflow:** trivial
- **Stack Parent:** none

## Context
This story covers the remaining scope: warp rendering only. Per-level color cycling and open-tube rendering were already shipped in PR #10 (feat/standalone-polish, merged 2026-06-25). The deliverable here is a distinct visual for the end-of-level warp (mode === 'warp', warp.progress 0->1). Shell-only; core already exposes warp state via src/core/state.ts WarpState and src/core/sim.ts stepWarp/advanceLevel.

Relevant files: src/shell/render.ts (where the warp visual belongs), src/core/state.ts, src/core/sim.ts.

## Sm Assessment

**Routing:** trivial (phased) workflow → setup complete → hand off to **Dev** for the implement phase.

**Scope (groomed):** 3-5 is two-thirds delivered. Per-level color cycling and open-tube rendering shipped in PR #10 (feat/standalone-polish, merged 2026-06-25). The ONLY remaining deliverable is **warp rendering** — a distinct visual for `mode === 'warp'` driven by `warp.progress` (0→1). Acceptance criteria were re-written via `pf sprint story update` to reflect this.

**Boundaries for Dev:**
- Shell-only. `core/` stays untouched — warp state is already exposed (`WarpState` in src/core/state.ts; `stepWarp`/`advanceLevel` in src/core/sim.ts). Do NOT add DOM/time/random to core.
- The warp visual belongs in `src/shell/render.ts`. No unit tests are required for the shell (verified by running the game), but `tsc --noEmit` and the full existing suite must stay green.
- No regression to the color-cycling / open-tube rendering already in place.

**Verification expectation:** Run the game (playtest on http://localhost:1981/) and confirm a level-clear shows a distinct warp transition; confirm the 3-3 spike crash reads correctly during warp.

**Branch:** feat/3-5-warp-rendering (off develop). **No Jira** — local sprint YAML only.

## Dev Assessment

**Implementation Complete:** Yes

**Files Changed:**
- `src/shell/render.ts` — added `drawWarp()` (diving-Claw transition: depth 1→0 as `warp.progress` 0→1, mirroring the core's `warpClawDepth`; plus a dive trail and progress-scaled speed streaks along every spoke) and branched `render()` to use it while `mode === 'warp'`. Spikes stay drawn so the 3-3 crash reads. Boundary-safe indexing → works on open tubes, not just closed circles.

**Tests:** 126/126 passing (GREEN, via testing-runner); `tsc --noEmit` clean. Core untouched.

**Visual verification:** Drove the renderer in-browser (dynamic import) at warp progress ~0.5 on BOTH a closed polygon tube and an open strip tube. Confirmed the Claw dives toward the vanishing point and a spike on its lane reads as a crash threat. Screenshots reviewed; no runtime errors.

**Acceptance criteria:**
- AC1 (distinct warp transition driven by warp.progress) — met: diving Claw + progress-scaled streaks
- AC2 (Claw travels down its lane toward the vanishing point, crash legible) — met
- AC3 (color cycling + open-tube, no regression) — met: verified open tube renders; LEVEL_COLORS still applied
- AC4 (shell-only, core untouched, tsc + suite green) — met

**Branch:** feat/3-5-warp-rendering (pushed)

**Handoff:** To review phase.

## Subagent Results

| # | Specialist | Received | Status | Findings | Decision |
|---|-----------|----------|--------|----------|----------|
| 1 | reviewer-preflight | Yes | clean | 0 blocking (4 informational) | confirmed 0, dismissed 0, deferred 0 |
| 2 | reviewer-edge-hunter | No | Skipped | disabled | Disabled via settings |
| 3 | reviewer-silent-failure-hunter | No | Skipped | disabled | Disabled via settings |
| 4 | reviewer-test-analyzer | No | Skipped | disabled | Disabled via settings |
| 5 | reviewer-comment-analyzer | No | Skipped | disabled | Disabled via settings |
| 6 | reviewer-type-design | No | Skipped | disabled | Disabled via settings |
| 7 | reviewer-security | No | Skipped | disabled | Disabled via settings |
| 8 | reviewer-simplifier | No | Skipped | disabled | Disabled via settings |
| 9 | reviewer-rule-checker | Yes | clean | 0 violations (14 checks, 28 instances) | confirmed 0, dismissed 0, deferred 0 |

**All received:** Yes (2 enabled returned clean; 7 disabled via `workflow.reviewer_subagents`)
**Total findings:** 0 confirmed blocking, 0 dismissed, 1 deferred (non-blocking hardening — see Delivery Findings)

## Reviewer Assessment

**Verdict:** APPROVED

Shell-only change (one function `drawWarp` + a mode branch in `render()`). Both enabled specialists returned clean; I disabled-domain-checked the rest myself. No Critical/High issues.

**Observations (domain-tagged):**
- `[RULE]` Core-purity boundary upheld — `drawWarp` lives in `src/shell/render.ts`, imports only FROM core (state, geometry), and calls no `Math.random`/`Date.now`/`performance.now`/`requestAnimationFrame`. Rule-checker: 14/14 checks clean, incl. the CLAUDE.md boundary. Evidence: render.ts:381–449; rule-checker rule #14.
- `[EDGE]` Division-by-zero guarded — `const ulen = Math.hypot(ux, uy) || 1` (render.ts:426) handles a zero-length direction vector; matches the established `radialUnit` guard (render.ts:39).
- `[EDGE]` Boundary-safe iteration — the streak loop bounds on `tube.far.length` (render.ts:391), not `laneCount`, so open tubes (laneCount+1 boundary points) and closed tubes both render without index overflow. VERIFIED in-browser on both a closed polygon and an open strip tube.
- `[TYPE]` `s.warp.progress` access is type-safe — `WarpState` is a required field on `GameState` (state.ts:65–77), always present after `initialState`/`cloneState`; value is clamped to [0,1] at render.ts:383. (type_design disabled; verified via `tsc --noEmit` clean + type.)
- `[DOC]` Comment accuracy — the `drawWarp` header states `warpClawDepth = 1 - progress`, which matches the core's `warpClawDepth` (sim.ts:262). Not stale. (comment_analyzer disabled; verified against core.)
- `[SIMPLE]` Appropriately scoped — single-purpose helper, no dead code, mirrors the file's existing `draw*` conventions; not over-engineered. (simplifier disabled; verified manually.)
- `[SILENT]` No swallowed errors — render performs no error handling and canvas 2D ops don't throw on finite numeric input. (silent_failure_hunter disabled; N/A.)
- `[TEST]` No tests added — per CLAUDE.md the shell is verified by running the game, not unit tests; visual verification on closed + open tubes is the prescribed method and was done. Core suite stays GREEN 126/126. (test_analyzer disabled; consistent with project policy.)
- `[SEC]` N/A — pure canvas drawing; no user input, auth, secrets, or tenant data. (security disabled.)

### Rule Compliance
- **CLAUDE.md core-purity boundary** — enumerated against every change: `drawWarp` (shell) ✓, `render()` warp branch (shell) ✓, no `src/core/**` file touched ✓, no DOM/time/random added to core ✓, `renderTime` is a shell animation accumulator that never flows back into `GameState`/`stepGame` ✓, import direction is shell→core only ✓. Compliant.
- **Tube-space positions** — `drawWarp` works in `{lane, depth}` and projects via `project()`; projection kept a render concern. Compliant.
- **TypeScript lang-review checklist** — rule-checker enumerated 14 rules / 28 instances: 0 violations. No `any`, no non-null assertions, no floating promises, no enum anti-patterns. Compliant. (Informational, pre-existing, out of scope: `drawEnemy`'s `switch(e.kind)` has no `default: assertNever` — a discriminated union, not an enum, so not a rule violation.)

### Devil's Advocate
Trying to break it: **(1) Non-finite progress.** If `s.warp.progress` were ever `NaN`/`Infinity`, `Math.max(0, Math.min(1, NaN))` yields `NaN`, `clawDepth` becomes `NaN`, `project` returns `NaN` coordinates, and the canvas silently draws nothing — no throw, but no Claw either. Is it reachable? The core advances progress as `progress += dt * WARP_SPEED` with finite `dt` and a constant speed, and `cloneState` copies a number; there is no path to NaN today. So this is a latent fragility, not a live bug — recorded as a non-blocking hardening finding. **(2) Long-session precision.** `renderTime` grows unbounded (≈ frames/60); after many hours `renderTime * speed` loses float precision before `% 1`, so the streak phase could stutter. Purely cosmetic, shared by every other animated helper in the file. **(3) Degenerate tube.** If a lane's far and near centers coincided, `ux=uy=0`, the `|| 1` guard prevents NaN, and the Claw glyph collapses to a dot — but none of the 16 shipped geometries are degenerate, so unreachable. **(4) Rotation mid-warp.** The player can spin during warp; `drawWarp` reads `currentLane(tube, s.player.lane)` each frame, so the diving Claw tracks the live lane and the spike-crash stays consistent with the sim. **(5) Confused user resizes window mid-warp.** `render` recomputes W/H/scale every frame; the warp simply continues at the new size. **(6) Spike taller than the Claw's entry depth.** The sim (3-3) owns the crash; render only draws spikes + the descending Claw, so the collision reads correctly. Conclusion: no reachable break; the only nits are cosmetic or latent and non-blocking.

**Data flow traced:** `s.warp.progress` (core, set by `stepWarp`) → `drawWarp` clamps to [0,1] → `clawDepth = 1 - progress` → `project(tube, lane, depth)` → canvas coordinates. Safe: clamped input, guarded normalization, projection handles wrap/clamp.

**Pattern observed:** Mode-branch in `render()` (render.ts:485) cleanly separates the warp visual from normal play, leaving the existing enemy/bullet/player path byte-for-byte unchanged — zero regression risk to normal rendering.

**Error handling:** None required; no I/O, no parsing, no throwing APIs. Inputs are clamped/guarded numerics.

**Handoff:** To SM for finish-story.

## Workflow Tracking
**Workflow:** trivial
**Phase:** finish
**Phase Started:** 2026-06-25T22:57:22Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-06-25T22:38:24Z | 2026-06-25T22:41:09Z | 2m 45s |
| implement | 2026-06-25T22:41:09Z | 2026-06-25T22:48:47Z | 7m 38s |
| review | 2026-06-25T22:48:47Z | 2026-06-25T22:57:22Z | 8m 35s |
| finish | 2026-06-25T22:57:22Z | - | - |

## Delivery Findings

Agents record upstream observations discovered during their phase.
Each finding is one list item. Use "No upstream findings" if none.

**Types:** Gap, Conflict, Question, Improvement
**Urgency:** blocking, non-blocking

<!-- Agents: append findings below this line. Do not edit other agents' entries. -->

### Dev (implementation)
- **Improvement** (non-blocking): The player death-burst on a warp spike crash spawns at the rim, not at the Claw's actual crash depth. Affects `src/shell/fx.ts` (death detection projects the burst at depth 1.0; could use `1 - warp.progress` when the prior mode was `warp`). Dovetails with backlog story 5-6 (distinct warp-crash SFX/visual). *Found by Dev during implementation.*

### Reviewer (code review)
- **Improvement** (non-blocking): `drawWarp` assumes a finite `warp.progress`; a non-finite value would silently draw nothing. Affects `src/shell/render.ts` (a `Number.isFinite` fallback would harden it). Latent only — the core never produces a non-finite progress today. *Found by Reviewer during code review.*

## Impact Summary

**Upstream Effects:** No upstream effects noted
**Blocking:** None

## Design Deviations

Agents log spec deviations as they happen — not after the fact.
Each entry: what was changed, what the spec said, and why.

<!-- Agents: append deviations below this line. Do not edit other agents' entries. -->

### Dev (implementation)
- No deviations from spec.

### Reviewer (audit)
- **Dev: "No deviations from spec."** → ✓ ACCEPTED by Reviewer: confirmed — the implementation matches all four acceptance criteria, is shell-only, and leaves the normal-play render path unchanged. No undocumented deviations found during review.