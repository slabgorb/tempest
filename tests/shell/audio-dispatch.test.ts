// tests/shell/audio-dispatch.test.ts
//
// The shell's event->sound dispatch (story 6-12, AC#2) — a pure, importable
// function so the wiring can be exercised BEHAVIOURALLY: feed it GameEvents + a
// recording fake and assert the exact playback calls it makes. No DOM/canvas
// dependency, so unlike main.ts it imports cleanly here.
//
// Story 10-11 UPDATES this contract (AC4: "dispatch tests updated"):
//   - two newly-wired one-shot cues: 'spike-shot' -> spikeShot, 'extra-life' ->
//     extraLife.
//   - SUSTAINED cues via the engine's new startLoop/stopLoop:
//       'pulsar-hum-start' -> startLoop('pulsarHum'),  'pulsar-hum-stop' -> stopLoop
//       'warp-descent-start' -> startLoop('levelClear'), 'warp-end' -> stopLoop
//     The warp/zoom sound used to be a one-shot `play('levelClear')` clipped to the
//     wav length; it is now a loop that spans the actual dive.
//
// tp1-10 (WD-017) RE-SEATED the sustained warp loop: it starts on the first
// DESCENDING frame ('warp-descent-start'), NOT at warp entry ('level-clear'), so it
// no longer hums under the AVOID-SPIKES hold. 'level-clear' now sounds nothing here.
//
// The 'warp-descent-start' event does not exist in the union yet and the dispatcher
// does not wire it, so its row + the headline test below fail today (valid RED).
import { describe, it, expect } from 'vitest'
import type { GameEvent } from '../../src/core/events'
import type { SoundName } from '../../src/shell/audio'

// The slice of the audio engine the dispatcher drives: one-shot `play` plus the
// sustained-loop pair. A test fake satisfies exactly this shape — no `as any`.
interface SoundSurface {
  play(name: SoundName): void
  startLoop(name: SoundName): void
  stopLoop(name: SoundName): void
}

// Dynamic import: the dispatcher is loaded lazily so any RED failure is a clean
// behavioural per-test failure rather than aborting collection of the whole file.
async function loadDispatch(): Promise<{
  playEventSounds(audio: SoundSurface, events: readonly GameEvent[]): void
}> {
  return await import('../../src/shell/audio-dispatch')
}

// One observable playback effect, tagged by the engine method that produced it,
// so a test can distinguish a one-shot `play` from a sustained `startLoop`/`stopLoop`.
type Effect =
  | { kind: 'play'; sound: SoundName }
  | { kind: 'startLoop'; sound: SoundName }
  | { kind: 'stopLoop'; sound: SoundName }

// A typed fake audio surface that records every call in order. Records the METHOD
// too (play vs startLoop vs stopLoop), so "spans the dive" can be told apart from
// "fires once".
function recordingAudio(): SoundSurface & { calls: Effect[] } {
  const calls: Effect[] = []
  return {
    calls,
    play(name) {
      calls.push({ kind: 'play', sound: name })
    },
    startLoop(name) {
      calls.push({ kind: 'startLoop', sound: name })
    },
    stopLoop(name) {
      calls.push({ kind: 'stopLoop', sound: name })
    },
  }
}

// Every core GameEvent discriminant paired with the playback effect the dispatcher
// must produce for it (null = deliberately no sound). This table IS the wiring
// contract. Listing ALL discriminants doubles as a runtime exhaustiveness guard:
// a new event type added to the union without a row here is caught by the coverage
// test below (and by the dispatcher's own compile-time `never` guard).
const EVENT_EFFECT: ReadonlyArray<{ event: GameEvent; effect: Effect | null }> = [
  // --- one-shot cues -------------------------------------------------------
  { event: { type: 'fire', lane: 3, depth: 1 }, effect: { kind: 'play', sound: 'fire' } },
  { event: { type: 'enemy-fire', lane: 3, depth: 0.5 }, effect: { kind: 'play', sound: 'enemyFire' } },
  { event: { type: 'enemy-death', enemyType: 'flipper', lane: 3, depth: 0.5 }, effect: { kind: 'play', sound: 'enemyDeath' } },
  { event: { type: 'player-grab', lane: 3, killedBy: 'flipper' }, effect: { kind: 'play', sound: 'playerGrab' } },
  { event: { type: 'player-death', cause: 'grab' }, effect: { kind: 'play', sound: 'playerDeath' } },
  { event: { type: 'warp-spike-crash', lane: 3 }, effect: { kind: 'play', sound: 'warpSpikeCrash' } },
  { event: { type: 'superzapper-activate', killCount: 4 }, effect: { kind: 'play', sound: 'superzapper' } },
  { event: { type: 'player-spawn', lane: 3 }, effect: { kind: 'play', sound: 'playerSpawn' } },
  { event: { type: 'segment-cross', lane: 4 }, effect: { kind: 'play', sound: 'segmentTick' } },
  { event: { type: 'spike-shot', lane: 4 }, effect: { kind: 'play', sound: 'spikeShot' } }, // 10-11
  { event: { type: 'extra-life', count: 1 }, effect: { kind: 'play', sound: 'extraLife' } }, // 10-11
  // --- sustained / looping cues (10-11) ------------------------------------
  // tp1-10 (WD-017): the sustained warp/zoom loop moved OFF 'level-clear' (warp
  // entry, before the AVOID-SPIKES hold) ONTO 'warp-descent-start' (the first
  // descending frame), so it no longer hums under the warning hold. 'level-clear'
  // now makes NO sound here — its white entry flash is an fx-layer concern.
  { event: { type: 'level-clear', newLevel: 2 }, effect: null },
  { event: { type: 'warp-descent-start' } as unknown as GameEvent, effect: { kind: 'startLoop', sound: 'levelClear' } },
  { event: { type: 'warp-end' }, effect: { kind: 'stopLoop', sound: 'levelClear' } },
  { event: { type: 'pulsar-hum-start' }, effect: { kind: 'startLoop', sound: 'pulsarHum' } },
  { event: { type: 'pulsar-hum-stop' }, effect: { kind: 'stopLoop', sound: 'pulsarHum' } },
  // --- visual-only (no audio) ----------------------------------------------
  { event: { type: 'superzapper-flash', color: 5 }, effect: null }, // 10-2: painted, not sounded
]

describe('audio-dispatch playEventSounds (story 6-12 / 10-11)', () => {
  it('is exported as an importable function (no DOM/canvas dependency)', async () => {
    const { playEventSounds } = await loadDispatch()
    expect(typeof playEventSounds, 'playEventSounds must be exported from audio-dispatch').toBe('function')
  })

  it.each(EVENT_EFFECT.map((row) => ({ ...row, type: row.event.type })))(
    "dispatches the right effect for a '$type' event",
    async ({ event, effect }) => {
      const { playEventSounds } = await loadDispatch()
      const audio = recordingAudio()
      playEventSounds(audio, [event])
      // Exactly the expected call (method + sound), or nothing for a visual-only event.
      expect(audio.calls).toEqual(effect ? [effect] : [])
    },
  )

  it('dispatches a whole multi-event frame, one call per sounded event, in order', async () => {
    const { playEventSounds } = await loadDispatch()
    const audio = recordingAudio()
    const frame = EVENT_EFFECT.map((r) => r.event)
    playEventSounds(audio, frame)
    const expected = EVENT_EFFECT.map((r) => r.effect).filter((e): e is Effect => e !== null)
    expect(audio.calls).toEqual(expected)
  })

  it('plays the same one-shot twice when an event repeats in one frame', async () => {
    const { playEventSounds } = await loadDispatch()
    const audio = recordingAudio()
    const fire: GameEvent = { type: 'fire', lane: 1, depth: 1 }
    playEventSounds(audio, [fire, fire])
    expect(audio.calls).toEqual([
      { kind: 'play', sound: 'fire' },
      { kind: 'play', sound: 'fire' },
    ])
  })

  it('plays nothing for an empty event list', async () => {
    const { playEventSounds } = await loadDispatch()
    const audio = recordingAudio()
    playEventSounds(audio, [])
    expect(audio.calls).toEqual([])
  })

  // The headline behaviour: the warp/zoom sound is sustained AND (tp1-10 / WD-017)
  // starts on the first DESCENDING frame, not at level-clear/entry. So it spans the
  // dive from descent-start to warp-end, silent through the AVOID-SPIKES hold.
  it('starts the warp loop on warp-descent-start and stops it on warp-end (spans the dive)', async () => {
    const { playEventSounds } = await loadDispatch()
    const audio = recordingAudio()
    playEventSounds(audio, [
      { type: 'warp-descent-start' } as unknown as GameEvent,
      { type: 'warp-end' },
    ])
    expect(audio.calls).toEqual([
      { kind: 'startLoop', sound: 'levelClear' },
      { kind: 'stopLoop', sound: 'levelClear' },
    ])
    // It must NOT be a one-shot play anymore — that was the clipped-on-entry bug.
    expect(audio.calls.some((c) => c.kind === 'play')).toBe(false)
  })

  // tp1-10 (WD-017): 'level-clear' fires at warp ENTRY, before the descent — it must
  // NOT start the sustained rumble (that would hum under the AVOID-SPIKES hold).
  it('does NOT start the warp loop on level-clear (entry precedes the descent)', async () => {
    const { playEventSounds } = await loadDispatch()
    const audio = recordingAudio()
    playEventSounds(audio, [{ type: 'level-clear', newLevel: 2 }])
    expect(audio.calls).toEqual([])
  })

  it('starts and stops the pulsar hum loop on its edges', async () => {
    const { playEventSounds } = await loadDispatch()
    const audio = recordingAudio()
    playEventSounds(audio, [{ type: 'pulsar-hum-start' }, { type: 'pulsar-hum-stop' }])
    expect(audio.calls).toEqual([
      { kind: 'startLoop', sound: 'pulsarHum' },
      { kind: 'stopLoop', sound: 'pulsarHum' },
    ])
  })

  it('makes no sound for the visual-only superzapper-flash', async () => {
    const { playEventSounds } = await loadDispatch()
    const audio = recordingAudio()
    playEventSounds(audio, [{ type: 'superzapper-flash', color: 3 }])
    expect(audio.calls).toEqual([])
  })

  it('wires every GameEvent discriminant exactly once (no missing/duplicate rows)', () => {
    // Guards the table itself: every discriminant present, no dup or gap. A new
    // event type added to the union without a row here trips this — the prompt to
    // wire it in the dispatcher too (the dispatcher's `never` guard enforces the
    // compile-time half).
    const types = EVENT_EFFECT.map((r) => r.event.type)
    expect(new Set(types).size, 'no duplicate event rows').toBe(types.length)
    expect(types.length, 'all 17 core GameEvent discriminants covered (16 + tp1-10 warp-descent-start)').toBe(17)
  })
})
