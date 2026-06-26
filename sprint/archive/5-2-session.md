---
story_id: "5-2"
jira_key: ""
epic: "5"
workflow: "trivial"
---
# Story 5-2: WebAudio SFX engine

## Story Details
- **ID:** 5-2
- **Jira Key:** (not tracked)
- **Workflow:** trivial
- **Stack Parent:** none

## Workflow Tracking
**Workflow:** trivial
**Phase:** finish
**Phase Started:** 2026-06-26T14:41:30Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-06-26T14:05:07Z | 2026-06-26T14:23:16Z | 18m 9s |
| implement | 2026-06-26T14:23:16Z | 2026-06-26T14:33:26Z | 10m 10s |
| review | 2026-06-26T14:33:26Z | 2026-06-26T14:41:30Z | 8m 4s |
| finish | 2026-06-26T14:41:30Z | - | - |

## Sm Assessment

**Setup complete.** Story 5-2 — WebAudio SFX engine (Wave 5, p1, 2 pts).

- **Workflow:** trivial (phased: setup → implement → review → finish). Next phase **implement**, owned by **Dev**.
- **Branch:** `feat/5-2-webaudio-sfx-engine` (off `develop`, gitflow).
- **Context:** `sprint/context/context-story-5-2.md` — corrected by SM from the auto-generated synthesis brief to **sample playback** (see direction note below).
- **Jira:** none (no integration on this project).

**⚠️ Direction decision (product-owner call, 2026-06-26):** The design doc + Wave 5 plan
specify *synthesized* SFX ("no asset files, no network"). The product owner **superseded** that
this session by uploading 42 real arcade `.wav` samples to Cloudflare R2
(`https://arcade.slabgorb.com/tempest/sfx/`, public + CORS) and explicitly choosing sample
playback. **5-2 plays the R2 samples; it does not synthesize.** The story context was rewritten
accordingly. Dev should build to the context doc, not the Task-2 oscillator code in the Wave 5 plan.

**Handoff:** To Dev (Sergeant Carter) for the implement phase.

## Delivery Findings

Agents record upstream observations discovered during their phase.
Each finding is one list item. Use "No upstream findings" if none.

**Types:** Gap, Conflict, Question, Improvement
**Urgency:** blocking, non-blocking

### SM (setup)
- **Conflict** (non-blocking, RESOLVED): The design doc + Wave 5 plan mandate *synthesized* SFX ("no asset files, no network"), but the product owner uploaded 42 `.wav` samples to R2 and chose sample playback. Resolved by product-owner decision (samples win). Affects `sprint/context/context-story-5-2.md` (rewritten to sample-playback) and, downstream, the Wave 5 plan's Task 2 / design-doc audio section (now stale re: synthesis — a doc-update candidate). *Found by SM during setup.*

### Dev (implementation)
- **Gap** (non-blocking): The `SOUNDS` manifest wires 8 of the 42 R2 samples — one per `GameEvent` type (`fire`/`enemyDeath`/`playerGrab`/`playerDeath`/`warpSpikeCrash`/`levelClear`/`superzapper`/`playerSpawn`). The other 34 (per-enemy variants like `fliphit2`/`pulsar`/`fuseball`, `clawmove`, extra-life `ding`, `rescued`, etc.) are unmapped. Affects `src/shell/audio.ts` (`SOUNDS`) — Story 5-5 (event→sound wiring) should expand the manifest if it wants finer cues (e.g. per-`enemyType` death sounds, a claw-move tick). The context explicitly delegated manifest choice to Dev, so this is a scoped starter set, not a defect. *Found by Dev during implementation.*
- **Improvement** (non-blocking): 5-2 ships the engine only; nothing imports it yet (vite tree-shakes it, bundle unchanged at 27.5 kB). Story 5-5 must: import `createAudioEngine` in `src/main.ts`, call `engine.resume()` from the first click/keydown gesture, and call `engine.play(name)` from `loop.ts` driven by `state.events`. Affects `src/main.ts` + `src/shell/loop.ts`. *Found by Dev during implementation.*

### Reviewer (code review)
- **Improvement** (non-blocking): `load()` calls `res.arrayBuffer()` without first checking `res.ok` — an R2 4xx/5xx error body is fed to `decodeAudioData`, which throws and is caught (so degradation holds), but a `if (!res.ok) throw` short-circuit would avoid decoding an error page. Affects `src/shell/audio.ts:73`. Cosmetic; bundle into 5-5 or a polish pass. *Found by Reviewer during code review.*
- **Improvement** (non-blocking): The node-side graceful-degradation path (no `AudioContext` → `resume()`/`play()` no-op, `ready()` false) IS Vitest-testable despite AC8's "no Vitest" note (which was about un-mockable playback). A tiny `tests/shell/audio.test.ts` would lock in AC6 permanently. Affects `tests/shell/` — optional, defer to a polish story; Dev's real-browser Playwright check already verified the live path. Affects `src/shell/audio.ts`. *Found by Reviewer during code review.*
- **Improvement** (non-blocking): The design doc + Wave 5 plan still describe *synthesized* SFX ("no asset files, no network"); they are now stale after the R2-samples supersession. Affects `docs/superpowers/specs/2026-06-24-tempest-clone-design.md` + `docs/superpowers/plans/2026-06-25-tempest-wave-5-audio-and-polish.md` (audio sections + Task 2) — update when convenient so a future reader isn't misled back to synthesis. *Found by Reviewer during code review.*

## Design Deviations

Agents log spec deviations as they happen — not after the fact.
Each entry: what was changed, what the spec said, and why.

### Dev (implementation)
- No deviations from spec. (Implemented the corrected sample-playback context verbatim: `createAudioEngine(baseUrl?)`, lazy gesture-gated AudioContext, R2 `SOUNDS` manifest fetch+decode, `play(name)` one-shot through a 0.4 master gain, silent no-op on every failure path. The optional `ready()` accessor and the preload-on-resume strategy are both offered by the context as Dev's choice. Master gain 0.4 is within the context's "~0.25–0.5" range.)

### Reviewer (audit)
- Dev "No deviations from spec" → ✓ ACCEPTED: verified the implementation matches the corrected sample-playback context verbatim — `createAudioEngine(baseUrl?)` API, lazy gesture-gated AudioContext, 8-entry R2 `SOUNDS` manifest, `play(name)` one-shot through a 0.4 master gain (within the "~0.25–0.5" range), silent no-op on every failure path. The optional `ready()` and preload-on-resume strategy are both explicitly offered to Dev by the context. No spec divergence.
- Story-level supersession (synthesize → R2 samples) → ✓ ACCEPTED (properly documented, not a Dev deviation): the whole story deviates from the design/Wave-5 docs' "synthesize, no assets" plan, but that is a product-owner-directed direction change, captured in the rewritten context doc and SM's `## Delivery Findings` Conflict entry. It belongs to the product decision, not the implementation — Dev correctly built to the (superseded) context. The stale docs are flagged as a doc-update candidate (see Reviewer finding below).

## Dev Assessment

**Implementation Complete:** Yes

**Files Changed:**
- `src/shell/audio.ts` (new) — shell-only WebAudio SFX engine. `createAudioEngine(baseUrl = 'https://arcade.slabgorb.com/tempest/sfx/'): AudioEngine` with `resume()` / `play(name)` / `ready()`. Lazy, gesture-gated AudioContext via a `globalThis`-based `getAudioContextCtor()` (webkit-prefix + non-browser safe); an 8-entry `SOUNDS` manifest (one per `GameEvent` type); fetch → `arrayBuffer` → `decodeAudioData` into a `Map<SoundName, AudioBuffer>` on first `resume()`; `play()` fires a one-shot `AudioBufferSourceNode` through a 0.4 master `GainNode`. Every failure path (no WebAudio, blocked context, failed fetch/decode, unknown/unloaded name) is a silent no-op.

**ACs:** AC1–AC9 met. Not wired into `main.ts`/`loop.ts` yet — that's Story 5-5 (out of scope here).

**Verification:**
- `tsc --noEmit` clean; `vite build` clean (27.5 kB — engine is tree-shaken until 5-5 imports it).
- `npm test` unchanged: **269/269 green** (core suite; no new Vitest per AC8 — WebAudio is absent from node).
- **Real-browser proof (Playwright on the dev server):** dynamically imported the module, `createAudioEngine().resume()`, polled `ready()` → **true in 504 ms** (a sample was fetched from R2 + decoded — confirms CORS + fetch + `decodeAudioData` end-to-end), `play('fire')` ran without throwing, `play('nonexistent')` was a silent no-op. Only console error was an unrelated `favicon.ico` 404 — zero audio errors.

**Branch:** `feat/5-2-webaudio-sfx-engine` (pushed)

**Handoff:** To Reviewer (General Burkhalter) for the review phase.

## Subagent Results

_Toggles: `preflight` + `rule_checker` enabled, 7 disabled via `workflow.reviewer_subagents`._

| # | Specialist | Received | Status | Findings | Decision |
|---|-----------|----------|--------|----------|----------|
| 1 | reviewer-preflight | Yes | clean | none | N/A (tsc clean, vite build 27.5 kB, 269/269 tests, 0 smells, boundary intact) |
| 2 | reviewer-edge-hunter | No | Skipped | disabled | Disabled via settings — assessed manually (see [EDGE]) |
| 3 | reviewer-silent-failure-hunter | No | Skipped | disabled | Disabled via settings — assessed manually (see [SILENT]) |
| 4 | reviewer-test-analyzer | No | Skipped | disabled | Disabled via settings — assessed manually (see [TEST]) |
| 5 | reviewer-comment-analyzer | No | Skipped | disabled | Disabled via settings — assessed manually (see [DOC]) |
| 6 | reviewer-type-design | No | Skipped | disabled | Disabled via settings — covered by rule-checker (see [TYPE]) |
| 7 | reviewer-security | No | Skipped | disabled | Disabled via settings — assessed manually (see [SEC]) |
| 8 | reviewer-simplifier | No | Skipped | disabled | Disabled via settings — assessed manually (see [SIMPLE]) |
| 9 | reviewer-rule-checker | Yes | clean | 0 (14 rules, 31 instances) | 0 violations; 1 LOW non-rule observation (`res.ok`) confirmed as non-blocking |

**All received:** Yes (2 enabled specialists returned clean; 7 disabled via `workflow.reviewer_subagents` and assessed manually)
**Total findings:** 0 confirmed blocking, 0 dismissed, 3 non-blocking LOW improvements captured in Delivery Findings

## Reviewer Assessment

**Verdict:** APPROVED
**Data flow traced:** gameplay moment → (5-5 will map) `play(name: SoundName)` → `buffers.get(name)` (decoded R2 sample) → one-shot `AudioBufferSourceNode` → master `GainNode` (0.4) → `ctx.destination`. Input is a typed `SoundName` union; an unloaded/unknown name is a silent no-op — no path throws into the caller.
**Pattern observed:** closure-factory `createAudioEngine(): AudioEngine` over `let ctx/master`, mirroring `createLoop` (`src/shell/loop.ts:16`). Idiomatic, matches the shell house style.
**Error handling:** every failure path (no WebAudio, blocked/closed context, failed fetch/decode, unknown name) is a guarded silent no-op — verified line by line (resume:87,93–97 / load:78–80 / play:105,107,113–115).

### Scope note — this is a SHELL story
Unlike the pure-core stories, the CLAUDE.md boundary here runs the *other* way: `src/shell/audio.ts` is *allowed* to use `AudioContext`/`fetch`/DOM. The boundary check is that it must not leak into core — verified: `audio.ts` has **zero imports**, and no `src/core/` file imports it (the only "audio" hit in core is a comment in `events.ts:5`). Shell → core dependency arrow only.

### Rule Compliance
Mapped to `.pennyfarthing/gates/lang-review/typescript.md` (#1–#13) + CLAUDE.md boundary (A). `reviewer-rule-checker` checked 31 instances across 14 rules → **0 violations**; I independently re-read the file.

| Rule | Result |
|------|--------|
| #1 Type-safety escapes | PASS — no `as any`/`@ts-ignore`/non-null. The `globalThis as {AudioContext?;webkitAudioContext?}` cast (52) and `Object.keys(SOUNDS) as SoundName[]` (71, safe under `as const`) are sound, necessary, structural casts — not bypasses. |
| #2 Generic/interface pitfalls | PASS — `Map<SoundName, AudioBuffer>`, concrete `AudioEngine` interface; no `Record<string,any>`/`object`/`Function`. |
| #3 Enum/union | PASS — `SoundName = keyof typeof SOUNDS` is the recommended union-over-enum pattern; `play(name: SoundName)` typed to it. No enums, no switch. |
| #4 Null/undefined | PASS — `??` (not `||`) at 56; `if (!ctx||!master) return` (105); `buffers.get` guarded (106–107, `AudioBuffer` always truthy); default param (59) not `||`. |
| #5 Module/declaration | PASS — `export type`/`export interface`/`export function` all correct; `moduleResolution: bundler` ⇒ no `.js` ext; no ambient `declare`, no `/// ref`. |
| #6 React/JSX | N/A — no `.tsx`. |
| #7 Async/Promise | PASS — `load()` fire-and-forget chains each terminate in `.catch` (no unhandled rejection); `void ctx.resume()` (100) is the correct discard idiom. |
| #8 Test quality | N/A (no tests; AC8 defers to browser verification). Note: a node-side degradation test is possible — logged as a non-blocking Improvement. |
| #9 Build/config | PASS — tsconfig unchanged; `strict:true`; `skipLibCheck` pre-existing. |
| #10 Input validation | PASS — fetch URL is `baseUrl + SOUNDS[name]` (compile-time `as const` values, no user input); `decodeAudioData` on remote bytes is sandboxed; client-side game, no SSRF. |
| #11 Error handling | PASS — the 3 silent catches (78,93,113) are legitimate, documented graceful degradation (AC6), each guarded so they cannot mask a logic bug. |
| #12 Performance/bundle | PASS — new `AudioBufferSourceNode` per `play()` is required by the WebAudio spec (one-shot nodes); `Object.keys` runs once (guarded by `loadStarted`); no barrel imports. |
| #13 Fix regressions | PASS — the `globalThis` cast that replaced the tsc-failing `window as Window & {...}` is strictly better (works in workers/node, type-safe shape). |
| A — CLAUDE.md boundary | PASS — `audio.ts` zero imports; no core file imports it; correctly in `src/shell/`. |

### Observations
- **[VERIFIED][RULE] Boundary intact** — `audio.ts` has zero imports; `grep` across all 10 core files finds no audio import (only a comment in `events.ts:5`). Shell→core arrow only. Evidence: preflight + rule-checker #14 + my own grep.
- **[VERIFIED] Graceful degradation complete** — every failure mode (no `AudioContext` → inert; construct throws → reset+return 93–97; fetch/decode fails → sound stays unloaded 78–80; unknown name → no-op 107; play throws → caught 113–115) leaves the game running. Matches AC6.
- **[VERIFIED] Real-browser proof** — Dev's Playwright run loaded a sample from R2 and decoded it in 504 ms, `play('fire')` fired clean, unknown name no-op. Confirms the live fetch+CORS+decode path AC8 cares about (beyond the node-invisible build check).
- **[LOW][RULE] `res.ok` unchecked** — `load()` (73) passes a 4xx/5xx error body to `decodeAudioData`; throws and is caught, so degradation holds, but a `if (!res.ok) throw` avoids decoding an error page. Cosmetic. (rule-checker + me.)
- **[LOW] Oldest-Safari decode form** — the `webkitAudioContext` fallback implies very-old-Safari support, where `decodeAudioData` had only the callback form; the promise form would leave those samples unloaded. Harmless (silent degradation), affects only ancient iOS.
- **[LOW][DOC] `ready()` comment** — "Mainly for tests / readiness UI" references tests that don't exist yet; benign (Dev used it in the Playwright check).
- **[VERIFIED] Bundle unaffected** — 27.5 kB unchanged because nothing imports `audio.ts` yet (tree-shaken); 5-5 brings it into the graph. Expected.

### Dispatch tags (manual coverage for disabled specialists)
- **[EDGE]** (manual): exercised the boundaries — `resume()` re-entry (idempotent, load guarded by `loadStarted`), ctor-throw reset, suspended-context resume, `play` before load (no-op), unknown name (no-op), play after a hypothetical context close (caught). No unhandled edge.
- **[SILENT]** (manual): the 3 empty catches are intentional, documented degradation (AC6), each guarded so they can't swallow a programming bug (only network I/O + audio decode inside). Not silent failures in the bad sense.
- **[TEST]** (manual): no Vitest per AC8 (WebAudio absent from node); Dev substituted a real-browser Playwright check (stronger than the "manual dev" AC8 asked for). Node-side degradation test is a logged non-blocking Improvement.
- **[DOC]** (manual): file header + per-line comments are accurate and useful; only the `ready()` "tests" comment is slightly ahead of reality (Low). Context docs (133 lines) accurate.
- **[TYPE]** (rule-checker + me): `SoundName` union, `Map<SoundName,AudioBuffer>`, `typeof AudioContext | undefined`, structural `globalThis` cast — all sound; no stringly-typed surface.
- **[SEC]** (manual + rule-checker #10): no user input in URLs (`as const` filenames + internal `baseUrl`); sandboxed decode; client-side game — no auth/secrets/SSRF surface.
- **[SIMPLE]** (manual): minimal — one factory, one manifest, three methods; no dead code, no over-engineering. `ready()` is a 1-line convenience the context permitted.
- **[RULE]** (rule-checker): 14 rules, 31 instances, **0 violations**; CLAUDE.md boundary honored.

### Devil's Advocate
Argue this is broken. The sharpest line: an audio engine that "compiles and decodes one sample in a Playwright run" can still be silently broken in the ways that matter. Does it leak resources? Each `play()` mints a new `AudioBufferSourceNode` and never calls `disconnect()` — in a bullet-hell frame that could be dozens of nodes a second. But one-shot source nodes are spec-required to be single-use, and the browser GCs them after `onended` once they hold no references; the master gain holds no back-reference to the source. No leak — this is the canonical pattern. Could `play()` throw mid-frame and kill the loop (the exact failure that would make the "fun game" freeze)? If the context closes, `createBufferSource`/`start` can throw — but the `try/catch` at 108–115 swallows it, and `play` isn't even wired into the loop yet (5-5). Could a malicious R2 response execute code? `decodeAudioData` runs in the browser's sandboxed audio decoder; a hostile `.wav` fails to decode and is caught. Could the floating preloads race — `play` called before buffers populate? Yes, and that's handled: `buffers.get` returns undefined → no-op; the sound just misses until decoded (sub-second). Could `resume()` be called before any gesture and wedge a suspended context? It creates the context but the OS/browser keeps it suspended until a gesture resumes it; `play` no-ops while suspended-without-output, and the real gesture wiring is 5-5's job. The genuine weaknesses are all LOW and non-fatal: the unchecked `res.ok` wastes a decode on an error page; the promise-form `decodeAudioData` won't run on the most ancient webkit-prefixed Safari; and there is no automated regression test for the degradation contract (mitigated by AC8's explicit deferral + the Playwright evidence). None of these break correctness, the pure-core boundary, or the game loop. For a 2-point trivial shell story delivering exactly the engine the corrected context specified — and verified loading a real sample over CORS — there is nothing here worth blocking on.

**No Critical/High findings. 3 non-blocking LOW improvements captured in Delivery Findings (`res.ok`, optional degradation test, stale docs).**

**Handoff:** To SM (Colonel Hogan) for finish-story.