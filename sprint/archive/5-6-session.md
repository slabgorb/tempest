---
story_id: "5-6"
jira_key: ""
epic: "5"
workflow: "trivial"
---
# Story 5-6: Distinct SFX and visual for a warp spike crash

## Story Details
- **ID:** 5-6
- **Jira Key:** (not configured)
- **Workflow:** trivial
- **Stack Parent:** none

## Workflow Tracking
**Workflow:** trivial
**Phase:** finish
**Phase Started:** 2026-06-26T20:33:23Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-06-26T20:15:23Z | 2026-06-26T20:17:12Z | 1m 49s |
| implement | 2026-06-26T20:17:12Z | 2026-06-26T20:23:57Z | 6m 45s |
| review | 2026-06-26T20:23:57Z | 2026-06-26T20:33:23Z | 9m 26s |
| finish | 2026-06-26T20:33:23Z | - | - |

## Story Context

**Wave 5 — Audio & Polish:** Give the warp spike crash a distinct SFX and/or visual cue to differentiate it from a normal enemy death.

**Background (from Story 3-3 Delivery Findings):**
A warp spike crash currently routes through the same `killPlayer` path as a normal enemy grab, making them indistinguishable to the player in both audio and visuals. Story 3-3 (TEA Improvement) flagged this as an opportunity for Wave 5 polish: "No render/shell signal exists for a warp crash (it's identical to a normal death in core). Wave 5 polish may want a distinct SFX/visual; out of scope here but worth a note."

**Technical Approach:**
- The core already exposes the signal needed: each death event in the `GameState` includes a `killedBy` field identifying the cause (enemy type, or `'spike'` for warp crashes).
- Shell-only changes in `src/shell/render.ts` and audio engine (`src/shell/audio.ts`).
- When a spike-crash event fires, trigger a distinct sound sample and/or visual effect (e.g. a different particle burst, scream sound, or screen effect).
- Do NOT add new core state or break the pure-determinism boundary (time via `dt`, randomness via seeded RNG).

## Acceptance Criteria

1. A spike crash during the warp produces a distinct sound and/or visual effect, different from a normal enemy-grab death.
2. Pure-core boundary preserved — the cue is driven from existing `GameState` in the shell, no new non-determinism in core.

## Sm Assessment

**Verdict:** Ready for implementation. Trivial workflow, shell-only, 1 point.

**Verified the core signal exists (the linchpin of this story):**
- `src/core/events.ts:71` — `PlayerDeathEvent` carries `cause: 'grab' | 'pulse' | 'spike'`.
- `src/core/sim.ts:374` — the warp spike crash already emits `{ type: 'player-death', cause: 'spike' }`.
- So the shell can branch on `cause === 'spike'` with **zero core changes**. Pure boundary stays intact.

**Correction for Dev:** the discriminator is the **`cause`** field on the `player-death` event, NOT a `killedBy: 'spike'` (the story note above slightly misnames it). `killedBy` lives on the `player-grab` event and holds the enemy *kind*. Branch on `player-death` → `cause`.

**Scope guidance:** existing shell death handling already consumes `player-death` events for the normal-death cue. Add a `cause === 'spike'` branch there for the distinct SFX (Wave 5 uses real .wav samples from arcade.slabgorb.com/tempest/sfx/) and/or a distinct particle/visual. Keep it shell-only — no new core state, no non-determinism.

**Handoff:** → Sergeant Carter (dev) for the implement phase.

## Dev Assessment

**Implementation Complete:** Yes

**Files Changed:**
- `src/shell/fx.ts` — `fx.detect` now accepts the frame's `GameEvent[]`; added a distinct **electric-blue** crash cue (cyan/white shard burst at the crash lane + blue flash + harder shake) keyed off the `warp-spike-crash` event, overriding the generic red death cue.
- `src/main.ts` — pass the accumulated `frameEvents` into `fx.detect(s, rdt, frameEvents)`.
- `tests/shell/fx.test.ts` — new: asserts a warp spike crash flashes the distinct blue cue with a harder shake, a normal death stays red, and crash ≠ grab visually.

**Tests:** 272/272 passing (GREEN); new fx suite 3/3. `tsc --noEmit` clean; `vite build` clean. No lint script configured.
**Branch:** feat/5-6-warp-spike-crash-sfx (pushed)

**AC coverage:**
- AC1 (distinct cue vs. a normal enemy-grab death): **visual** now distinct (blue flash + cyan/white shards + stronger shake); **audio** already distinct (kaboom.wav). ✓
- AC2 (pure-core boundary preserved): zero core changes — cue derived entirely in the shell from the existing `warp-spike-crash` event channel; no new non-determinism. ✓

**Handoff:** To review phase → General Burkhalter (reviewer).

## Subagent Results

Per `workflow.reviewer_subagents` settings, only `preflight` and `rule_checker` are enabled; the rest are disabled and pre-filled as Skipped.

| # | Specialist | Received | Status | Findings | Decision |
|---|-----------|----------|--------|----------|----------|
| 1 | reviewer-preflight | Yes | clean | 0 smells; tests 272/272, tsc clean, build clean | N/A (GREEN) |
| 2 | reviewer-edge-hunter | No | Skipped | disabled | Disabled via settings |
| 3 | reviewer-silent-failure-hunter | No | Skipped | disabled | Disabled via settings |
| 4 | reviewer-test-analyzer | No | Skipped | disabled | Disabled via settings |
| 5 | reviewer-comment-analyzer | No | Skipped | disabled | Disabled via settings |
| 6 | reviewer-type-design | No | Skipped | disabled | Disabled via settings |
| 7 | reviewer-security | No | Skipped | disabled | Disabled via settings |
| 8 | reviewer-simplifier | No | Skipped | disabled | Disabled via settings |
| 9 | reviewer-rule-checker | Yes | findings | 1 (low, rule 8) | confirmed 1, dismissed 0, deferred 0 |

**All received:** Yes (2 enabled returned, 7 disabled/skipped; 1 low finding)
**Total findings:** 1 confirmed (low, non-blocking), 0 dismissed, 0 deferred

Disabled specialists' domains were assessed by me directly in the Rule Compliance / Observations sections below (the diff is a 28-line shell-only change with no async, no error handling, no external input, no types-as-API surface).

## Rule Compliance

Governing rules: CLAUDE.md (cardinal **pure-core boundary**, tube-space positions) + `.pennyfarthing/gates/lang-review/typescript.md` (13 checks). No `.claude/rules/*.md` or `SOUL.md` in this repo.

**Cardinal rule — `src/core/` purity (the project's #1 rule). Every changed file enumerated:**
- `src/main.ts` — shell file; change passes `frameEvents` (data) into `fx.detect`. No core import added, no write-back into sim. ✓ Compliant.
- `src/shell/fx.ts` — shell file; imports FROM core (allowed direction) via `import type { GameEvent }` (type-only, no runtime cycle). `detect()` only **reads** `s`/`events`, never mutates `GameState`. Uses `Math.random` in `burst()` — explicitly sanctioned by the file header ("fx is pure eye candy… never feeds back into the simulation"). **No new core state added; no core file touched.** ✓ Compliant.
- `tests/shell/fx.test.ts` — test file; imports core for fixtures only. ✓ Compliant.
- **Verdict: the pure-core boundary is intact.** This is the single most important rule on this project and it is fully respected.

**Tube-space rule:** `project(tube, e.lane, 1.0)` (fx.ts) — `e.lane` is the integer lane index from `WarpSpikeCrashEvent`, depth `1.0` is the near rim. Correct tube-space usage; `boundaryIndex` in `project` wraps/clamps defensively. ✓ Compliant.

**TypeScript checklist (13 checks):** rule-checker enumerated 28 instances, 1 violation (rule 8). My spot-checks of the high-risk items agree: (#1) no `as any`/`@ts-ignore`/non-null assertions; (#2) `events` typed `readonly GameEvent[]`; (#4) default param `= []` means `events` is never `undefined` in-body, and `frameEvents` is never `undefined` at the call site (loop.ts:42); (#5) `import type` correct for the type-only `GameEvent`; (#8) one redundant assertion (below). All other checks N/A or pass.

## Reviewer Observations

1. `[VERIFIED]` **Pure-core boundary preserved** — fx.ts:8 uses `import type { GameEvent }` (compile-time only, no runtime cycle); `detect` (fx.ts:60-109) only reads state, never mutates it; zero core files in the diff; `Math.random` is shell-sanctioned eye candy. Complies with the CLAUDE.md cardinal rule. Evidence: `git diff --stat` shows no `src/core/*` change; fx.ts:8, fx.ts:60.
2. `[VERIFIED]` **`frameEvents` is always a defined array** — loop.ts:42 inits `frameEvents: GameEvent[] = []`, accumulates each sub-step (loop.ts:56), passes to `draw` (loop.ts:67); main.ts:57 forwards it. The optional `events?` + default `= []` can never receive `undefined` from production. Evidence: loop.ts:42,56,67; main.ts:57.
3. `[VERIFIED]` **Correct event channel** — Dev used the **accumulated** `frameEvents`, not `s.events` (which carries only the last sub-step). A crash landing in a non-final sub-step is therefore still cued, matching the existing audio wiring. Evidence: loop.ts:38-42 comment + main.ts audio loop already consumes `frameEvents`.
4. `[VERIFIED]` `[TYPE]` **Discriminant narrowing is type-safe** — `e.type === 'warp-spike-crash'` narrows `e` to `WarpSpikeCrashEvent`, so `e.lane` needs no assertion. Evidence: fx.ts:96-98, events.ts:43-46.
5. `[LOW]` `[RULE]` `[TEST]` **Redundant assertion** at tests/shell/fx.test.ts:31 — `expect(fx.flashColor).not.toBe(DEATH_RED)` is logically entailed by line 30's `.toBe(CRASH_BLUE)` since the two constants differ by definition. Harmless (it documents the "not red" intent) and the test has 3 other meaningful assertions + 2 other tests. **Non-blocking nit**, not worth a round-trip on a 1-pt polish story. (Confirmed from rule-checker rule 8.)
6. `[LOW]` `[SIMPLE]` **Generic death particles coexist with the crash burst** — on a crash, the generic death block (fx.ts:75-82) still spawns its yellow/red bursts; the crash block (fx.ts:91-107) adds cyan/white shards and overrides flash→blue, shake→26. The distinction is still unmistakable (blue full-screen flash + harder shake + extra shards vs. a red flash), so AC1 holds, but the particle palette is mixed. Cosmetic only; acceptable for a polish story. Evidence: fx.ts:75-82 then fx.ts:91-107.

**Dispatch tag coverage:** `[EDGE]` no new boundary paths — the `for…of` over a bounded events array with a single discriminant guard; empty array is the common case and is a safe no-op. `[SILENT]` no error handling introduced, nothing swallowed — fx has no failure modes (it appends to in-memory particle arrays). `[DOC]` comments are accurate and the new JSDoc on `Fx.detect` correctly documents the `events` param; no stale docs. `[SEC]` no external/untrusted input — `e.lane` originates from the deterministic core sim, not user/network input; no injection/auth/secret surface. `[TYPE]` see obs #4 (narrowing safe). `[SIMPLE]` see obs #6. `[TEST]` see obs #5. `[RULE]` see obs #5 + Rule Compliance.

### Devil's Advocate

Let me argue this code is broken. **First attack — the override is additive, not replacing.** A skeptic notes the warp-crash branch runs *after* the generic death block, so a crash actually triggers two cue systems at once: the yellow/red death sprays AND the cyan/white crash shards. Could a player misread the mixed palette as "just a normal death with extra sparkle"? Possibly — but the most salient cue is the full-screen flash, and that is unambiguously overridden from red (`#ff5a3c`) to electric blue (`#7df9ff`), plus the shake is 44% stronger (26 vs 18). Faithful Tempest polish is about a *recognisably different* beat, and a different flash colour + harder kick + extra shards clears that bar. Downgraded to a LOW cosmetic note, not a defect.

**Second attack — does the event even fire in real play, or is this dead UI?** If `warp-spike-crash` were never emitted, the whole branch would be untested theatre. But sim.ts:373 pushes `{ type: 'warp-spike-crash', lane }` on a real spike crash, the core suite covers warp-spike collisions, and main.ts already plays audio off the same event — so the channel is live and exercised. Not dead.

**Third attack — undefined/empty inputs.** What if `events` is `undefined`, or `e.lane` is out of range? The default `= []` neutralises `undefined` (and the production caller never passes it anyway), the empty array makes the loop a no-op, and `project`'s `boundaryIndex` wraps/clamps any lane — so even a malformed lane can't throw or NaN the canvas. **Fourth attack — multiple crashes in one frame.** If two crash events accumulated, the branch would burst twice and set the same flash/shake — additive particles, no corruption. Harmless. **Fifth — test fragility.** The test mutates `s.player.alive` directly instead of stepping the sim; a purist calls that white-box coupling. But fx is a state-diff layer with no other way to drive its death branch in isolation, and asserting on the deterministic `flashColor` (not random particle coords) keeps it stable. Conclusion: no Critical/High defect survives scrutiny; the two LOW notes are cosmetic/stylistic and non-blocking.

## Reviewer Assessment

**Verdict:** APPROVED

**Data flow traced:** core `stepGame` emits `warp-spike-crash` (sim.ts:373) → loop accumulates into `frameEvents` (loop.ts:42,56) → `draw` callback (main.ts:57) → `fx.detect(s, rdt, frameEvents)` → distinct blue flash/shake/shards at the crash lane (fx.ts:96-107). Safe because every hop carries data only; nothing writes back into the sim, so determinism is preserved.

**Pattern observed:** Event-driven shell cue layered over the existing state-diff fx — the correct call, since a warp crash and a normal death are indistinguishable by state diff alone (both just flip `player.alive`). The dedicated `warp-spike-crash` event (carrying `lane`) is the right discriminator, reused consistently with the audio wiring. Good engineering at fx.ts:91-107.

**Error handling:** None needed — fx has no failure modes; empty/undefined events degrade to a no-op (fx.ts:60 default `= []`), and `project`/`boundaryIndex` clamp any lane defensively.

**Findings:** 2 × LOW, both non-blocking — (1) redundant assertion at fx.test.ts:31 `[RULE][TEST]`; (2) generic death particles coexist with the crash burst `[SIMPLE]`. No Critical/High. Tag coverage: `[EDGE]` `[SILENT]` `[TEST]` `[DOC]` `[TYPE]` `[SEC]` `[SIMPLE]` `[RULE]` all addressed above.

**AC verification:** AC1 (distinct cue) ✓ — blue flash + harder shake + cyan/white shards, plus pre-existing `kaboom.wav`. AC2 (pure-core boundary) ✓ — zero core changes, verified.

**Handoff:** To SM (Colonel Hogan) for finish-story.

## Delivery Findings

Agents record upstream observations discovered during their phase.
Each finding is one list item. Use "No upstream findings" if none.

**Types:** Gap, Conflict, Question, Improvement
**Urgency:** blocking, non-blocking

<!-- Agents: append findings below this line. Do not edit other agents' entries. -->

No upstream findings.

### Dev (implementation)
- **Improvement** (non-blocking): The story premise ("a warp spike crash is currently indistinguishable from a normal enemy death ... both go through killPlayer") was already partly resolved for **audio** — the core emits a dedicated `warp-spike-crash` event and `src/main.ts:77` already plays a distinct `kaboom.wav` for it (vs. `shipexplosion.wav` for a normal death). This story therefore only needed the **visual** half. No further action required; noted so the premise isn't re-investigated. Affects nothing downstream. *Found by Dev during implementation.*

### Reviewer (code review)
- No upstream findings during code review. The two LOW observations (redundant assertion at fx.test.ts:31; mixed death/crash particle palette) are local cleanups within this story's own diff, non-blocking, and do not warrant downstream work. *Found by Reviewer during code review.*

## Design Deviations

Agents log spec deviations as they happen — not after the fact.
Each entry: what was changed, what the spec said, and why.

<!-- Agents: append deviations below this line. Do not edit other agents' entries. -->

### Dev (implementation)
- **Drove the cue off the `warp-spike-crash` event in the visual layer, not a `player-death cause==='spike'` audio branch**
  - Spec source: .session/5-6-session.md, SM Assessment → "Scope guidance"
  - Spec text: "existing shell death handling already consumes `player-death` events for the normal-death cue. Add a `cause === 'spike'` branch there for the distinct SFX ... and/or a distinct particle/visual."
  - Implementation: Added the distinct cue to the **visual** layer (`src/shell/fx.ts`), keyed off the dedicated `warp-spike-crash` event (which carries the crash `lane`). Audio left untouched.
  - Rationale: The SFX was **already** distinct — the core emits a separate `warp-spike-crash` event and `src/main.ts:77` already plays `warpSpikeCrash` (kaboom.wav) only for the crash, vs. shipexplosion.wav for a normal death. The remaining gap was purely visual, where `fx` had no event input. The dedicated event also carries `lane`, giving precise burst placement that `player-death.cause` cannot.
  - Severity: minor
  - Forward impact: none — additive shell-only change; `fx.detect`'s new `events` param is optional/defaulted, so no caller breaks.

### Reviewer (audit)
- **Dev deviation (cue driven off `warp-spike-crash` event in the visual layer, not a `player-death cause` audio branch)** → ✓ ACCEPTED by Reviewer: the dedicated event carries `lane` for precise burst placement, the audio was already distinct (`kaboom.wav`), and using the accumulated `frameEvents` is more robust than `s.events`. The deviation is an improvement on the SM's suggested approach, not a regression. Pure-core boundary verified intact.
- No undocumented deviations found — the diff matches the logged deviation; no spec divergence slipped through.