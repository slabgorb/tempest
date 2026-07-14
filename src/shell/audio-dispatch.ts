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
        // Story 10-11: the warp/zoom cue is now SUSTAINED. It starts here (warp
        // entry) with the T2 in-well drone and hands over to T3 at the bottom-crossing
        // ('warp-space'); 'warp-end' stops whichever is still up.
        audio.startLoop('levelClear')
        break
      case 'warp-space':
        // tp1-13 (S-014): the cursor passed the well bottom (ILINDDY). MOVCUD hands the
        // drone over from T2 to T3 via SOUTS3 (ALWELG.MAC:1032-1037) — stop the in-well
        // loop, start the space drone.
        audio.stopLoop('levelClear')
        audio.startLoop('thrustSpace')
        break
      case 'warp-end':
        // The dive ended: silence whichever thrust loop is still up — T2 on a crash
        // (died in the well), T3 on a completion (ended in space). Stops are idempotent
        // at the engine, so the off-path stop is a harmless no-op.
        audio.stopLoop('levelClear')
        audio.stopLoop('thrustSpace')
        break
      case 'wave-bonus':
        // tp1-13 (S-015): the end-of-wave skill-step bonus chimes the WP special-score
        // cue — SAUSON's second trigger, the same extra_life bake (ALEXEC.MAC:371-376).
        audio.play('extraLife')
        break
      case 'bolt-destroyed':
        // tp1-13 (S-013): a shot-down enemy bolt plays the EX explosion, like any kill
        // (INCCSQ → CCEXPL, ALWELG.MAC:2797).
        audio.play('enemyDeath')
        break
      case 'superzapper-activate':
        // tp1-13 (S-011): SILENT. kzap.wav was an invention — ALSOUN's 13-sound table
        // has no superzapper slot. The zap's authentic audio is the rapid EX burst of
        // each vaporised enemy's own 'enemy-death' event (PROSUZ → KILENE → CIEXPL).
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
