// tests/shell/audio-dispatch.test.ts
//
// Story 6-12 (AC#2): the shell's event->sound dispatch loop used to live inline in
// src/main.ts and was only "tested" by a brittle `?raw` regex text-match on the
// file (see the now-removed assertions in audio.test.ts). main.ts bootstraps a
// canvas, so it can't be imported in the node test env — hence the text-match.
//
// This story extracts that loop into a pure, importable function so the wiring can
// be exercised BEHAVIOURALLY: feed it GameEvents + a recording fake and assert the
// exact sounds it plays. The dispatcher has no DOM/canvas dependency, so unlike
// main.ts it imports cleanly here.
//
// EXPECTED MODULE (Dev's green phase delivers it):
//   // src/shell/audio-dispatch.ts
//   import type { GameEvent } from '../core/events'
//   import type { SoundName } from './audio'
//   export function playEventSounds(
//     audio: { play(name: SoundName): void },
//     events: readonly GameEvent[],
//   ): void
// main.ts then replaces its inline `for (const event of frameEvents) switch(...)`
// with a single `playEventSounds(audio, frameEvents)` call.
import { describe, it, expect } from 'vitest'
import type { GameEvent } from '../../src/core/events'
import type { SoundName } from '../../src/shell/audio'

// Dynamic import on purpose: the dispatcher is the AC#2 deliverable and does not
// exist yet, so a static top-level import would fail to resolve and abort
// collection of this whole file. Loading it lazily inside each test makes the RED
// a clean, behavioural per-test failure ("Failed to resolve .../audio-dispatch")
// and gives meaningful messages once Dev's green phase adds the module.
async function loadDispatch(): Promise<{
  playEventSounds(audio: { play(name: SoundName): void }, events: readonly GameEvent[]): void
}> {
  return await import('../../src/shell/audio-dispatch')
}

// A typed fake audio surface — just the play() the dispatcher calls — that records
// every sound name in order. No `as any`: the recorder satisfies the real
// { play(name: SoundName): void } shape the dispatcher expects.
function recordingAudio(): { played: SoundName[]; play(name: SoundName): void } {
  const played: SoundName[] = []
  return {
    played,
    play(name: SoundName) {
      played.push(name)
    },
  }
}

// Every core GameEvent discriminant paired with the SoundName main.ts plays for it
// (src/main.ts, the inline switch this story extracts). This table IS the wiring
// the `?raw` regex used to assert textually — now asserted behaviourally. Listing
// all ten discriminants also doubles as a runtime exhaustiveness guard: if a future
// event type is added to the union but not wired, the per-type case below is the
// reminder that the dispatcher (and this table) must cover it.
const EVENT_SOUND: ReadonlyArray<{ event: GameEvent; sound: SoundName }> = [
  { event: { type: 'fire', lane: 3, depth: 1 }, sound: 'fire' },
  { event: { type: 'enemy-fire', lane: 3, depth: 0.5 }, sound: 'enemyFire' },
  { event: { type: 'enemy-death', enemyType: 'flipper', lane: 3, depth: 0.5 }, sound: 'enemyDeath' },
  { event: { type: 'player-grab', lane: 3, killedBy: 'flipper' }, sound: 'playerGrab' },
  { event: { type: 'player-death', cause: 'grab' }, sound: 'playerDeath' },
  { event: { type: 'warp-spike-crash', lane: 3 }, sound: 'warpSpikeCrash' },
  { event: { type: 'level-clear', newLevel: 2 }, sound: 'levelClear' },
  { event: { type: 'superzapper-activate', killCount: 4 }, sound: 'superzapper' },
  { event: { type: 'player-spawn', lane: 3 }, sound: 'playerSpawn' },
  { event: { type: 'segment-cross', lane: 4 }, sound: 'segmentTick' },
]

describe('audio-dispatch playEventSounds (story 6-12, AC#2)', () => {
  it('is exported as an importable function (no DOM/canvas dependency)', async () => {
    const { playEventSounds } = await loadDispatch()
    expect(typeof playEventSounds, 'playEventSounds must be exported from audio-dispatch').toBe('function')
  })

  it.each(EVENT_SOUND.map((row) => ({ ...row, type: row.event.type })))(
    "plays '$sound' on a '$type' event",
    async ({ event, sound }) => {
      const { playEventSounds } = await loadDispatch()
      const audio = recordingAudio()
      playEventSounds(audio, [event])
      // Exactly one play, with exactly the expected sound — not just "is.some()".
      expect(audio.played).toEqual([sound])
    },
  )

  it('dispatches a whole multi-event frame, one play per event, in order', async () => {
    const { playEventSounds } = await loadDispatch()
    const audio = recordingAudio()
    // The loop accumulates several events in one render frame; nothing is dropped
    // and order is preserved (matches main.ts's per-frame event pump).
    const frame = EVENT_SOUND.map((r) => r.event)
    playEventSounds(audio, frame)
    expect(audio.played).toEqual(EVENT_SOUND.map((r) => r.sound))
  })

  it('plays the same sound twice when an event repeats in one frame', async () => {
    const { playEventSounds } = await loadDispatch()
    const audio = recordingAudio()
    const fire: GameEvent = { type: 'fire', lane: 1, depth: 1 }
    playEventSounds(audio, [fire, fire])
    expect(audio.played).toEqual(['fire', 'fire'])
  })

  it('plays nothing for an empty event list', async () => {
    const { playEventSounds } = await loadDispatch()
    const audio = recordingAudio()
    playEventSounds(audio, [])
    expect(audio.played).toEqual([])
  })

  it('wires every GameEvent discriminant exactly once (no missing/duplicate rows)', () => {
    // Guards the table itself: ten distinct event types, no accidental dup or gap.
    // A new event type added to the union without a row here leaves its case
    // unexercised above — the prompt to wire it in the dispatcher too.
    const types = EVENT_SOUND.map((r) => r.event.type)
    expect(new Set(types).size, 'no duplicate event rows').toBe(types.length)
    expect(types.length, 'all ten core GameEvent discriminants covered').toBe(10)
  })
})
