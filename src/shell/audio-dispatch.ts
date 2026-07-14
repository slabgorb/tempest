// src/shell/audio-dispatch.ts
//
// The shell's event->sound dispatch (story 6-12, AC#2). Extracted verbatim from
// the inline `for (const event of frameEvents) switch (...)` that used to live in
// src/main.ts, so the wiring is a pure, importable function — testable WITHOUT
// booting a canvas (which is why main.ts itself can't be imported in the node test
// env, and why this was previously only checked by a brittle `?raw` text-match).
//
// It is pure in the sense that matters: no module-level state, no DOM access. Its
// only effect is calling `play()` on the injected audio surface, once per event,
// in order — so a test can pass a recording fake and assert the exact play calls.
import type { GameEvent } from '../core/events'
import type { AudioEngine } from './audio'

// Just the slice of the audio engine this dispatcher needs: one-shot `play` plus
// the sustained-loop pair (Story 10-11). Narrowing keeps the function decoupled
// from resume()/ready() and lets tests pass a recording fake.
type SoundPlayer = Pick<AudioEngine, 'play' | 'startLoop' | 'stopLoop'>

// Play one sound per gameplay event the core emitted this frame. The caller's loop
// accumulates events across all sub-steps, so nothing is dropped when two events
// land in the same render frame. `play()` is a no-op until the audio engine is
// unlocked by a user gesture, so pre-interaction events are silently skipped.
export function playEventSounds(audio: SoundPlayer, events: readonly GameEvent[]): void {
  for (const event of events) {
    switch (event.type) {
      case 'fire':
        audio.play('fire')
        break
      case 'enemy-fire':
        audio.play('enemyFire') // 6-5 hook; authentic bake wired in 6-6
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
        // tp1-10 (WD-017): warp ENTRY (before the AVOID-SPIKES hold) makes NO sound —
        // the sustained rumble no longer starts here, so it can't hum under the hold.
        // The white entry flash is an fx-layer concern (fx.ts), not audio.
        break
      case 'warp-descent-start':
        // tp1-10 (WD-017): the sustained warp/zoom rumble starts on the first
        // DESCENDING frame (SOUTS2, ALWELG.MAC:1019-1023), silent through the hold,
        // and is stopped by 'warp-end' when the descent bottoms out — so it spans the
        // actual dive, not a one-shot clipped on entry.
        audio.startLoop('levelClear')
        break
      case 'warp-end':
        audio.stopLoop('levelClear') // descent done (bottomed out or crashed) — stop the loop
        break
      case 'superzapper-activate':
        audio.play('superzapper')
        break
      case 'superzapper-flash':
        // Visual-only (10-2): the per-frame well-color flash is painted by the
        // renderer; the zap's audio cue already fires on 'superzapper-activate'.
        break
      case 'player-spawn':
        audio.play('playerSpawn')
        break
      case 'segment-cross':
        audio.play('segmentTick') // ★ authentic POKEY tick as the Claw crosses a lane (6-10)
        break
      case 'spike-shot':
        audio.play('spikeShot') // ★ authentic spike_shot bake (ROM cc51, 10-11)
        break
      case 'extra-life':
        audio.play('extraLife') // ★ authentic extra_life bake (ROM cc11, 10-11)
        break
      case 'pulsar-hum-start':
        audio.startLoop('pulsarHum') // ★ loop the authentic pulsar_hum (ROM cc99, 10-11)
        break
      case 'pulsar-hum-stop':
        audio.stopLoop('pulsarHum') // last pulsar gone — stop the hum (10-11)
        break
      default: {
        // Exhaustiveness guard: every GameEvent discriminant is handled above, so
        // `event` narrows to `never` here. Add a new event type to the union
        // without wiring a case and this line becomes a COMPILE error — the cue
        // can never be silently dropped.
        const _exhaustive: never = event
        void _exhaustive
        break
      }
    }
  }
}
