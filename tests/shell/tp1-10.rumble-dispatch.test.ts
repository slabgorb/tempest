// tests/shell/tp1-10.rumble-dispatch.test.ts
//
// tp1-10 AC-6 (finding WD-017), shell half: the sustained warp/zoom loop starts on
// the `warp-descent-start` event (the first descending frame), NOT on 'level-clear'
// (warp entry, before the AVOID-SPIKES hold). See the core half in
// tests/core/tp1-10.warp-rumble.test.ts.
//
// UNIFIED with tp1-13 (S-014): the drone is two-phase (T2 in-well → T3 in space via
// 'warp-space'), and 'warp-end' now stops BOTH loops (idempotent). These tests pin the
// tp1-10 half — descent-start starts it, level-clear does not, warp-end stops it.
import { describe, it, expect } from 'vitest'
import { playEventSounds } from '../../src/shell/audio-dispatch'

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
  // audio-dispatch only touches play/startLoop/stopLoop (a Pick of AudioEngine); the
  // inline object structurally satisfies that param, so no cast is needed.
  return { calls, audio }
}

describe('tp1-10 AC-6 — the warp rumble is dispatched on descent-start, not entry', () => {
  it('starts the sustained warp loop on warp-descent-start', () => {
    const { calls, audio } = recorder()
    playEventSounds(audio, [{ type: 'warp-descent-start' }])
    expect(calls).toContainEqual({ kind: 'startLoop', sound: 'levelClear' })
  })

  it('does NOT start the warp loop on level-clear (entry is before the descent)', () => {
    const { calls, audio } = recorder()
    playEventSounds(audio, [{ type: 'level-clear', newLevel: 2 }])
    expect(calls.some((c) => c.kind === 'startLoop')).toBe(false)
  })

  it('stops the thrust loops on warp-end so nothing bleeds past the dive', () => {
    const { calls, audio } = recorder()
    playEventSounds(audio, [
      { type: 'warp-descent-start' },
      { type: 'warp-end' },
    ])
    // UNIFIED (tp1-13 S-014): warp-end stops BOTH the in-well (levelClear/T2) and space
    // (thrustSpace/T3) drones. Here only T2 was started (no bottom-crossing), so the T3
    // stop is a harmless idempotent no-op — the tp1-10 intent (the rumble never bleeds
    // past the dive) is preserved: levelClear is stopped exactly once.
    expect(calls).toEqual([
      { kind: 'startLoop', sound: 'levelClear' },
      { kind: 'stopLoop', sound: 'levelClear' },
      { kind: 'stopLoop', sound: 'thrustSpace' },
    ])
  })
})
