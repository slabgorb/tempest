# Story 5-2 Context

## Title
WebAudio SFX engine

## Metadata
- **Story ID:** 5-2
- **Type:** feature
- **Points:** 2
- **Priority:** p1
- **Workflow:** trivial
- **Repo:** tempest
- **Epic:** Wave 5 — Audio & polish

> **⚠️ Direction note — supersedes the design/plan docs.** The north-star design
> (`docs/superpowers/specs/2026-06-24-tempest-clone-design.md`) and the Wave 5 plan
> (`docs/superpowers/plans/2026-06-25-tempest-wave-5-audio-and-polish.md`) both
> specify *synthesized* SFX ("oscillator + noise, **no asset files, no network**").
> **That is superseded for this story.** The product owner uploaded 42 real arcade
> `.wav` samples to Cloudflare R2 (served at `https://arcade.slabgorb.com/tempest/sfx/`,
> public, CORS-enabled) and explicitly chose **sample playback** over synthesis on
> 2026-06-26. This story plays those samples; it does **not** synthesize. The Task-2
> oscillator code in the Wave 5 plan is reference-only and not the target.

## Problem

Wave 5 gives the game its arcade voice. The pure core (Story 5-1, merged) emits a
typed `GameEvent` channel on `GameState.events` each frame — the data the shell needs
to make sounds. This story builds the **shell-only WebAudio engine** that loads the
real `.wav` SFX samples from R2 and plays them on demand.

The engine must be:
- **Sample-driven** — fetch + decode the R2 `.wav` files into `AudioBuffer`s and play them by name.
- **Gesture-gated** — browsers block autoplay; the `AudioContext` is created/resumed only after a user gesture.
- **Resilient** — a missing/failed sound (network error, decode failure, no AudioContext) must be a silent no-op, never a crash.
- **Pure-core-safe** — lives entirely in `src/shell/` and never touches `src/core/` (CLAUDE.md hard boundary).

## Technical Approach

**WebAudio sample-playback engine (shell-only in `src/shell/audio.ts`):**

1. **Lazy AudioContext + gesture unlock:** Create/resume the `AudioContext` on the first
   user gesture via `resume()` (the actual gesture handler in `main.ts` is wired in Story 5-5).
   Resolve the constructor via a `getAudioContextCtor()` helper to cover the `webkitAudioContext`
   prefix. Until resumed, all methods are safe no-ops.

2. **Sample loading from R2 (the core change vs. the docs):** The engine holds a `SOUNDS`
   manifest mapping a logical sound name → R2 filename, and loads each via
   `fetch(BASE_URL + filename)` → `arrayBuffer()` → `audioContext.decodeAudioData()` into a
   `Map<name, AudioBuffer>`.
   - **Base URL:** `https://arcade.slabgorb.com/tempest/sfx/` (overridable via a
     `createAudioEngine(baseUrl?)` arg for testing/relocation).
   - **When to load:** preload the manifest once after `resume()` (so the start-gesture also
     warms the buffers and avoids first-play latency). Lazy-on-first-`play` is an acceptable
     alternative if Dev prefers — either is fine as long as a not-yet-loaded sound is a no-op,
     not an error.
   - **Filename caveat:** R2 keys are case-sensitive. One asset is uppercase: `klf_zap.WAV`.
     Reference exact filenames.

3. **Playback API:** `play(name)` looks up the decoded `AudioBuffer`, creates a one-shot
   `AudioBufferSourceNode`, routes it through the master gain, and starts it. No-op if the
   buffer isn't loaded, the context isn't ready, or audio is unavailable.

4. **Master gain for headroom:** All sources route through a single master `GainNode`
   (~0.25–0.5) so overlapping SFX don't clip.

5. **Graceful degradation / error handling:** If `AudioContext` is unavailable or construction
   throws, the engine stays inert and every method is a silent no-op. A `fetch`/`decodeAudioData`
   failure for one sample is caught and that sound simply stays unloaded (logged once at most, no
   spam, no throw). The game must run normally with audio fully broken.

6. **Input (consumed downstream):** The engine plays **by name**. Mapping `GameEvent`s →
   sound names and draining `state.events` each frame is **Story 5-5's** job (integration). 5-2
   delivers the engine + the `SOUNDS` manifest; 5-5 wires events to `play(...)`. (Reference: the
   8 `GameEvent` variants from `src/core/events.ts` are `fire`, `enemy-death`, `player-grab`,
   `player-death`, `warp-spike-crash`, `level-clear`, `superzapper-activate`, `player-spawn`.)

**Available R2 samples** (under `https://arcade.slabgorb.com/tempest/sfx/`): `aion.wav`,
`alarm.wav`, `ashot.wav`, `bomb.wav`, `capture.wav`, `cheevo.wav`, `clawcatch.wav`,
`clawmove.wav`, `ding.wav`, `efire.wav`, `eshot.wav`, `explo.wav`, `fliphit2.wav`,
`flipstep.wav`, `fuseball.wav`, `getwarp.wav`, `githit.wav`, `gunon.wav`, `hit.wav`,
`hyperjump.wav`, `jump.wav`, `jump2.wav`, `kaboom.wav`, `klf_zap.WAV`, `kzap.wav`,
`manglerhit.wav`, `newgitfire.wav`, `newgitshothit.wav`, `pop.wav`, `pulsar.wav`,
`pupget.wav`, `pupinit.wav`, `rescued.wav`, `shipexplosion.wav`, `shot.wav`, `spinnerhit.wav`,
`warp.wav`, `warpin.wav`, `warpout.wav`, `wpass1.wav`, `wpulse.wav`, `xfire.wav` (42 total).
Dev chooses the starter manifest (a sensible subset keyed to the gameplay moments); not every
file must be wired in this story.

## Scope
- **In scope:** `src/shell/audio.ts` with `createAudioEngine(baseUrl?)` → `AudioEngine`; lazy
  AudioContext + gesture unlock (`resume()`); a `SOUNDS` manifest; sample fetch/decode from R2;
  `play(name)` one-shot playback through a master gain; graceful no-op on every failure path.
- **Out of scope:** Event→sound mapping and per-frame loop wiring (Story 5-5); `main.ts` gesture
  registration (Story 5-5); the distinct warp-spike-crash cue (Story 5-6); mute/volume UI; music/ambience.

## Acceptance Criteria

1. **AC1 — Engine API:** `src/shell/audio.ts` exports `createAudioEngine(baseUrl?: string): AudioEngine`
   where `AudioEngine` exposes at minimum `resume(): void` and `play(name): void` (a `ready()`/load-state
   accessor is optional).

2. **AC2 — Lazy, gesture-gated AudioContext:** The `AudioContext` is created/resumed only on `resume()`
   (driven by a user gesture in 5-5). Before `resume()`, `play()` is a safe no-op. Constructor resolved
   via a webkit-prefix-aware helper.

3. **AC3 — R2 sample loading:** The engine fetches `.wav` files from
   `https://arcade.slabgorb.com/tempest/sfx/` (base URL overridable via the `createAudioEngine` arg) and
   decodes them with `decodeAudioData` into an in-memory name→`AudioBuffer` map. A defined `SOUNDS`
   manifest lists the loaded sounds. (Exact filenames; note the uppercase `klf_zap.WAV`.)

4. **AC4 — Playback by name:** `play(name)` plays the decoded sample as a one-shot source through the
   master gain. Calling `play` with an unknown/unloaded name, or before load completes, is a silent no-op.

5. **AC5 — Master headroom:** All playback routes through a single master `GainNode` so overlapping SFX
   don't clip.

6. **AC6 — Graceful degradation:** With no `AudioContext`, a failed `fetch`, or a failed `decodeAudioData`,
   the engine never throws and the game runs normally; a broken sound just doesn't play (no console spam).

7. **AC7 — Pure-core boundary preserved:** All audio code is in `src/shell/`. No `src/core/` changes; the
   core remains free of `AudioContext`/DOM/`Date`/`Math.random`.

8. **AC8 — Build verification:** `npm run build` (tsc --noEmit + vite build) is clean (WebAudio + fetch
   types resolve); `npm test` is unchanged (core suite green). No Vitest for the engine itself — WebAudio
   is a browser API absent from the node test env; verify by `npm run dev` and confirming a sample plays.

9. **AC9 — No debug code:** No `console.log`/`debugger`/`.only`/temporary fields left behind.

---

_Authored by SM (Colonel Hogan) on 2026-06-26, correcting the auto-generated synthesis context to
sample-playback per the product owner's decision. Supersedes the "synthesize / no assets" approach in the
design + Wave 5 plan docs._
