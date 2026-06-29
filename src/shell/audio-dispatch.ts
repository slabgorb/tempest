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

// Just the slice of the audio engine this dispatcher needs. Narrowing to `play`
// keeps the function decoupled from resume()/ready() and lets tests pass a fake.
type SoundPlayer = Pick<AudioEngine, 'play'>

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
        audio.play('levelClear')
        break
      case 'superzapper-activate':
        audio.play('superzapper')
        break
      case 'player-spawn':
        audio.play('playerSpawn')
        break
      case 'segment-cross':
        audio.play('segmentTick') // ★ authentic POKEY tick as the Claw crosses a lane (6-10)
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
