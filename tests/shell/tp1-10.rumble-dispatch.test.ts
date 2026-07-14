// tests/shell/tp1-10.rumble-dispatch.test.ts
//
// RED — tp1-10 AC-6 (finding WD-017), shell half: the sustained warp/zoom loop
// must start on the new `warp-descent-start` event (the first descending frame),
// NOT on 'level-clear' (warp entry, before the AVOID-SPIKES hold). See the core
// half in tests/core/tp1-10.warp-rumble.test.ts.
//
// Today audio-dispatch starts the loop on 'level-clear' (audio-dispatch.ts:45-49),
// so it hums through the whole warning hold. Both assertions below are RED.
import { describe, it, expect } from 'vitest'
import { playEventSounds } from '../../src/shell/audio-dispatch'
import type { GameEvent } from '../../src/core/events'

type Call =
  | { kind: 'play'; sound: string }
  | { kind: 'startLoop'; sound: string }
  | { kind: 'stopLoop'; sound: string }

function recorder() {
  const calls: Call[] = []
  const audio = {
    play: (sound: string) => calls.push({ kind: 'play', sound }),
    startLoop: (sound: string) => calls.push({ kind: 'startLoop', sound }),
    stopLoop: (sound: string) => calls.push({ kind: 'stopLoop', sound }),
  }
  // audio-dispatch only touches play/startLoop/stopLoop (a Pick of AudioEngine).
  return { calls, audio: audio as unknown as Parameters<typeof playEventSounds>[0] }
}

describe('tp1-10 AC-6 — the warp rumble is dispatched on descent-start, not entry', () => {
  it('starts the sustained warp loop on warp-descent-start', () => {
    const { calls, audio } = recorder()
    playEventSounds(audio, [{ type: 'warp-descent-start' } as unknown as GameEvent])
    expect(calls).toContainEqual({ kind: 'startLoop', sound: 'levelClear' })
  })

  it('does NOT start the warp loop on level-clear (entry is before the descent)', () => {
    const { calls, audio } = recorder()
    playEventSounds(audio, [{ type: 'level-clear', newLevel: 2 }])
    expect(calls.some((c) => c.kind === 'startLoop')).toBe(false)
  })

  it('still stops the loop on warp-end so it never bleeds past the dive', () => {
    const { calls, audio } = recorder()
    playEventSounds(audio, [
      { type: 'warp-descent-start' } as unknown as GameEvent,
      { type: 'warp-end' },
    ])
    expect(calls).toEqual([
      { kind: 'startLoop', sound: 'levelClear' },
      { kind: 'stopLoop', sound: 'levelClear' },
    ])
  })
})
