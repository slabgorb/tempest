# Story 5-5 Context

## Title
Wire audio and particles into loop and bootstrap

## Metadata
- **Story ID:** 5-5
- **Type:** chore (integration)
- **Points:** 2
- **Priority:** p1
- **Workflow:** trivial (phased)
- **Repo:** tempest
- **Epic:** Wave 5 — Audio & polish
- **Depends On:** 5-2 (WebAudio SFX engine), 5-3 (particle system), 5-4 (render particles)

## Problem

Wave 5's audio and visual effects systems (5-2, 5-3, 5-4) are built but not yet wired into the main loop. The **pure core** emits `GameEvent[]` data on each frame, and the **shell** has two complete subsystems waiting:

1. **AudioEngine (5-2, merged):** `src/shell/audio.ts` plays `.wav` samples by name from R2; it's created but unused in `main.ts`.
2. **Fx system (5-3/5-4, merged):** `src/shell/fx.ts` spawns particles and screen-shake from GameEvent diffs; already wired to `detect()` and `update()` in `main.ts` and rendered correctly.

The **integration gap:** the loop does not yet collect GameEvents across sub-steps, and `main.ts` does not yet:
- Create the AudioEngine
- Gate it on user interaction (browsers block AudioContext autoplay)
- Drain `state.events` each frame and play sounds

This is the final integration story of Wave 5: **wire the audio engine into the loop** and **gate it on a user gesture** so that gameplay sounds play at the right moments.

## Technical Approach

### 1. AudioEngine Creation and Gesture Gating (main.ts)

**Create the engine at bootstrap (src/main.ts):**
```typescript
import { createAudioEngine } from './shell/audio'

const audio = createAudioEngine()
// Don't call audio.resume() yet; it needs a user gesture first.
```

**Gate on user interaction:**
Register handlers for the first user gesture (`click` and/or `keydown`). On the first gesture, call `audio.resume()` to unlock the AudioContext (browser autoplay policy). After that, the gesture handler can be removed (since every `play()` call will work).

```typescript
function onUserGesture() {
  audio.resume()
  // Optional: remove the listener after first gesture (or leave it idempotent and keep it)
}
canvas.addEventListener('click', onUserGesture)
window.addEventListener('keydown', onUserGesture)
```

### 2. Event-to-Sound Wiring (main.ts draw callback)

The loop's `draw` callback is called once per render frame. At that point, the simulation may have run multiple sub-steps, but **the state passed to draw reflects only the final sub-step**, so `state.events` contains only that sub-step's events.

**Critical for fixed-timestep audio:** The loop must **accumulate GameEvents across all sub-steps** before dispatching to audio/fx. Otherwise, if two enemies die in different sub-steps within the same render frame, only the last kill's sound plays.

**Recommended pattern:** Add a local `frameEvents` array in the loop, append `state.events` after each `stepGame()` call, then pass the accumulated list to the draw callback.

**Alternatively (simpler but lossy if not careful):** Drain `state.events` in the draw callback and play each sound. This works **if and only if** the loop only runs one sub-step per frame (which is most of the time at 60 FPS, but can fail at frame-rate jitter or >60Hz displays). If you choose this, add a comment noting the assumption.

**Map events to sounds in the draw callback:**

```typescript
(s) => {
  // ... existing fx.detect, fx.update code ...
  
  // Drain events and play sounds
  for (const event of s.events) {
    switch (event.type) {
      case 'fire':
        audio.play('fire')
        break
      case 'enemy-death':
        audio.play('enemyDeath')
        break
      case 'player-grab':
        audio.play('playerGrab')
        break
      case 'player-death':
        audio.play('playerDeath')
        break
      case 'warp-spike-crash':
        audio.play('warpSpikeCrash')
        break
      case 'level-clear':
        audio.play('levelClear')
        break
      case 'superzapper-activate':
        audio.play('superzapper')
        break
      case 'player-spawn':
        audio.play('playerSpawn')
        break
    }
  }
  
  render(ctx, s, W, H, fx, dpr)
}
```

The `audio.play(name)` function (from the AudioEngine in 5-2) is a safe no-op if the context isn't ready or the sound didn't load.

### 3. Verify Existing Particle Wiring (main.ts)

The fx system is **already correctly wired** in `main.ts`:
- `fx = createFx()` ✓
- `fx.detect(s, rdt)` is called in the draw callback ✓
- `fx.update(rdt)` is called in the draw callback ✓
- `fx` is passed to `render()` ✓
- Particles, shake, and flash are rendered in `src/shell/render.ts` ✓

**Action:** Verify these calls are present and in the right order (detect → update → render). No changes needed unless they're missing.

### 4. No Core Changes

All wiring lives in `src/shell/` (main.ts, loop.ts if event accumulation is needed). The pure core remains unchanged. `state.events` is already populated by `stepGame()` (from 5-1).

## Acceptance Criteria

1. **AC1 — AudioEngine initialization:** `src/main.ts` imports `createAudioEngine()`, constructs an instance, and calls `audio.resume()` on the first user gesture (click or keydown).

2. **AC2 — Gesture gating:** The AudioContext is created/resumed only after user interaction, respecting the browser autoplay policy. Before the gesture, `audio.play()` is a silent no-op.

3. **AC3 — Event-to-sound mapping:** The draw callback drains `state.events` and plays the appropriate sound for each GameEvent type (fire → 'shot.wav', enemy-death → 'explo.wav', player-grab → 'clawcatch.wav', player-death → 'shipexplosion.wav', warp-spike-crash → 'kaboom.wav', level-clear → 'getwarp.wav', superzapper-activate → 'kzap.wav', player-spawn → 'warpin.wav').

4. **AC4 — Fixed-timestep event collection:** If the loop can run multiple sub-steps in one frame, accumulated GameEvents are all played (not dropped). If the implementation assumes one sub-step per draw, a comment justifies the assumption and notes the risk.

5. **AC5 — Particle system verification:** `fx.detect()`, `fx.update()`, and `fx` passed to `render()` are present and in the correct order in `main.ts`.

6. **AC6 — No debug code:** No `console.log`, `debugger`, `.only`, or temporary fields in the final commit.

7. **AC7 — Shell-only:** All changes are in `src/shell/main.ts` and optionally `src/shell/loop.ts`. Core is untouched. `npm run build` and `npm test` are clean.

8. **AC8 — Game playable with sound:** Run `npm run dev`, fire a shot or kill an enemy, and hear the corresponding sound (after clicking/pressing a key first). Screen-shake and particles render correctly.

## Definition of Done

- Feature branch `feat/5-5-wire-audio-particles-loop` created from `develop`.
- AudioEngine created and gesture-gated in `main.ts`.
- Event-to-sound draining in the loop's draw callback.
- All 8 GameEvent types map to their respective sounds.
- Particle and screen-shake systems verified working.
- `npm run build` and `npm test` pass cleanly.
- Manual test: game plays sounds in response to gameplay (after a gesture).
- Session file updated with phase completion and findings.
- PR created; review may flag non-blocking improvements.

---

_Authored by SM (Colonel Hogan) on 2026-06-26, integrating the merged audio (5-2) and particle (5-3/5-4) systems into the main loop and bootstrap (main.ts)._
