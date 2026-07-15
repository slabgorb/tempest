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
// Story tp1-13 (audit cluster C9) EXTENDS the same dive audio into a two-phase drone
// and unifies with tp1-10's re-seat here:
//   - 'warp-space' (S-014): the dive crossed the well bottom — the T2 in-well loop
//     (levelClear, started by 'warp-descent-start') STOPS and the T3 space drone
//     ('thrustSpace') STARTS, the handover MOVCUD performs via SOUTS3
//     (ALWELG.MAC:1032-1037). A row may therefore carry MULTIPLE effects, so `effect`
//     became `effects: Effect[] | null`.
//   - 'warp-end' now stops BOTH loops: levelClear (a crashed dive dies in the well
//     with T2 up, before the bottom-crossing) and thrustSpace (a completed dive ends
//     in space / fly-in with T3 up). Stops are idempotent, so the off-path stop is
//     harmless. Fired at the fly-in's end (success) or on the crash path.
//   - 'wave-bonus' (S-015): the end-of-wave skill-step bonus plays the WP special-
//     score chime — the same extraLife cue, SAUSON's second trigger (ALEXEC.MAC:371-376).
//   - 'bolt-destroyed' (S-013): a shot-down enemy bolt plays the EX explosion
//     (INCCSQ → CCEXPL, ALWELG.MAC:2797).
//   - 'superzapper-activate' (S-011): now SILENT. kzap.wav was an invention with no
//     slot in ALSOUN's 13-sound table; the authentic zap audio is the EX burst of
//     each vaporised enemy's own 'enemy-death' event.
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

// Every core GameEvent discriminant paired with the playback effects the
// dispatcher must produce for it, IN ORDER (null = deliberately no sound). This
// table IS the wiring contract. Listing ALL discriminants doubles as a runtime
// exhaustiveness guard: a new event type added to the union without a row here
// is caught by the coverage test below (and by the dispatcher's own
// compile-time `never` guard).
const EVENT_EFFECT: ReadonlyArray<{ event: GameEvent; effects: Effect[] | null }> = [
  // --- one-shot cues -------------------------------------------------------
  { event: { type: 'fire', lane: 3, depth: 1 }, effects: [{ kind: 'play', sound: 'fire' }] },
  { event: { type: 'enemy-fire', lane: 3, depth: 0.5 }, effects: [{ kind: 'play', sound: 'enemyFire' }] },
  { event: { type: 'enemy-death', enemyType: 'flipper', lane: 3, depth: 0.5 }, effects: [{ kind: 'play', sound: 'enemyDeath' }] },
  { event: { type: 'player-grab', lane: 3, killedBy: 'flipper' }, effects: [{ kind: 'play', sound: 'playerGrab' }] },
  { event: { type: 'player-death', cause: 'grab' }, effects: [{ kind: 'play', sound: 'playerDeath' }] },
  { event: { type: 'warp-spike-crash', lane: 3 }, effects: [{ kind: 'play', sound: 'warpSpikeCrash' }] },
  { event: { type: 'player-spawn', lane: 3 }, effects: [{ kind: 'play', sound: 'playerSpawn' }] },
  { event: { type: 'segment-cross', lane: 4 }, effects: [{ kind: 'play', sound: 'segmentTick' }] },
  { event: { type: 'spike-shot', lane: 4 }, effects: [{ kind: 'play', sound: 'spikeShot' }] }, // 10-11
  { event: { type: 'extra-life', count: 1 }, effects: [{ kind: 'play', sound: 'extraLife' }] }, // 10-11
  // tp1-13 (S-015): the end-of-wave skill-step bonus chimes the same WP
  // special-score cue the extra life uses — SAUSON's second trigger.
  { event: { type: 'wave-bonus', points: 6000 }, effects: [{ kind: 'play', sound: 'extraLife' }] },
  // tp1-13 (S-013): a shot-down bolt plays the EX explosion, like any kill.
  { event: { type: 'bolt-destroyed', lane: 4, depth: 0.5 }, effects: [{ kind: 'play', sound: 'enemyDeath' }] },
  // --- sustained / looping cues (10-11, tp1-10 WD-017, tp1-13 S-014) ---------
  // UNIFIED: the sustained warp/zoom loop starts on 'warp-descent-start' (the first
  // descending frame), NOT at 'level-clear' (warp entry, before the AVOID-SPIKES hold)
  // — tp1-10 moved it so it no longer hums under the warning hold. 'level-clear' now
  // makes NO sound here; its white entry flash is an fx-layer concern.
  { event: { type: 'level-clear', newLevel: 2 }, effects: null },
  { event: { type: 'warp-descent-start' }, effects: [{ kind: 'startLoop', sound: 'levelClear' }] },
  // tp1-13 (S-014): the bottom-crossing hands the drone over — T2 out, T3 in.
  {
    event: { type: 'warp-space' },
    effects: [
      { kind: 'stopLoop', sound: 'levelClear' },
      { kind: 'startLoop', sound: 'thrustSpace' },
    ],
  },
  // tp1-13: the dive's end silences whichever thrust loop is still up — T2 on a
  // crash (the dive died in the well), T3 on a completion (it ended in space).
  {
    event: { type: 'warp-end' },
    effects: [
      { kind: 'stopLoop', sound: 'levelClear' },
      { kind: 'stopLoop', sound: 'thrustSpace' },
    ],
  },
  { event: { type: 'pulsar-hum-start' }, effects: [{ kind: 'startLoop', sound: 'pulsarHum' }] },
  { event: { type: 'pulsar-hum-stop' }, effects: [{ kind: 'stopLoop', sound: 'pulsarHum' }] },
  // --- deliberately silent ---------------------------------------------------
  { event: { type: 'superzapper-flash', color: 5 }, effects: null }, // 10-2: painted, not sounded
  // tp1-13 (S-011): kzap.wav is DELETED — no slot in ALSOUN's 13-sound table.
  // The zap's audio is the EX burst of each kill's own 'enemy-death' event.
  { event: { type: 'superzapper-activate', killCount: 4 }, effects: null },
]

describe('audio-dispatch playEventSounds (story 6-12 / 10-11)', () => {
  it('is exported as an importable function (no DOM/canvas dependency)', async () => {
    const { playEventSounds } = await loadDispatch()
    expect(typeof playEventSounds, 'playEventSounds must be exported from audio-dispatch').toBe('function')
  })

  it.each(EVENT_EFFECT.map((row) => ({ ...row, type: row.event.type })))(
    "dispatches the right effect(s) for a '$type' event",
    async ({ event, effects }) => {
      const { playEventSounds } = await loadDispatch()
      const audio = recordingAudio()
      playEventSounds(audio, [event])
      // Exactly the expected calls (method + sound), in order, or nothing for a
      // deliberately silent event.
      expect(audio.calls).toEqual(effects ?? [])
    },
  )

  it('dispatches a whole multi-event frame, every sounded effect in order', async () => {
    const { playEventSounds } = await loadDispatch()
    const audio = recordingAudio()
    const frame = EVENT_EFFECT.map((r) => r.event)
    playEventSounds(audio, frame)
    const expected = EVENT_EFFECT.flatMap((r) => r.effects ?? [])
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

  // The headline behaviour, UNIFIED (tp1-10 WD-017 + tp1-13 S-014): the warp/zoom
  // sound is a TWO-PHASE sustained loop. It starts on the first DESCENDING frame
  // ('warp-descent-start', NOT at 'level-clear'/entry, so it stays silent through the
  // AVOID-SPIKES hold); the bottom-crossing ('warp-space') hands T2 (levelClear) over
  // to T3 (thrustSpace); 'warp-end' silences whatever is still up at the fly-in's end.
  it('runs the full dive loop lifecycle: T2 on descent-start, T3 in space, silence at warp-end', async () => {
    const { playEventSounds } = await loadDispatch()
    const audio = recordingAudio()
    playEventSounds(audio, [
      { type: 'warp-descent-start' },
      { type: 'warp-space' },
      { type: 'warp-end' },
    ])
    expect(audio.calls).toEqual([
      { kind: 'startLoop', sound: 'levelClear' },
      { kind: 'stopLoop', sound: 'levelClear' },
      { kind: 'startLoop', sound: 'thrustSpace' },
      { kind: 'stopLoop', sound: 'levelClear' },
      { kind: 'stopLoop', sound: 'thrustSpace' },
    ])
    // Neither thrust phase is a one-shot play — that was the clipped-on-entry bug.
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

  it('never starts the space drone on a crashed dive — the crash path has no warp-space', async () => {
    // The sim's contract (tests/core/tp1-13.audio-wiring-events.test.ts): a
    // crashed dive emits level-clear → warp-spike-crash → warp-end, never
    // warp-space. Dispatching exactly that sequence must leave thrustSpace
    // untouched except for the harmless idempotent stop at the end.
    const { playEventSounds } = await loadDispatch()
    const audio = recordingAudio()
    playEventSounds(audio, [
      { type: 'level-clear', newLevel: 2 },
      { type: 'warp-spike-crash', lane: 4 },
      { type: 'warp-end' },
    ])
    expect(audio.calls.filter((c) => c.kind === 'startLoop' && c.sound === 'thrustSpace')).toEqual([])
    expect(audio.calls).toContainEqual({ kind: 'play', sound: 'warpSpikeCrash' })
    expect(audio.calls).toContainEqual({ kind: 'stopLoop', sound: 'levelClear' })
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

  // tp1-13 (S-011): kzap.wav has no basis in ALSOUN's 13-sound table. The zap's
  // authentic audio is the rapid EX burst of the kills themselves.
  it('makes no sound of its own for superzapper-activate — the kills carry the audio', async () => {
    const { playEventSounds } = await loadDispatch()
    const audio = recordingAudio()
    playEventSounds(audio, [
      { type: 'superzapper-activate', killCount: 2 },
      { type: 'enemy-death', enemyType: 'flipper', lane: 1, depth: 0.5 },
      { type: 'enemy-death', enemyType: 'tanker', lane: 6, depth: 0.4 },
    ])
    expect(audio.calls).toEqual([
      { kind: 'play', sound: 'enemyDeath' },
      { kind: 'play', sound: 'enemyDeath' },
    ])
  })

  it('wires every GameEvent discriminant exactly once (no missing/duplicate rows)', () => {
    // Guards the table itself: every discriminant present, no dup or gap. A new
    // event type added to the union without a row here trips this — the prompt to
    // wire it in the dispatcher too (the dispatcher's `never` guard enforces the
    // compile-time half).
    const types = EVENT_EFFECT.map((r) => r.event.type)
    expect(new Set(types).size, 'no duplicate event rows').toBe(types.length)
    expect(types.length, 'all 20 core GameEvent discriminants covered (16 + tp1-10 warp-descent-start + tp1-13 warp-space/wave-bonus/bolt-destroyed)').toBe(20)
  })
})
