// tests/core/tp1-10.warp-rumble.test.ts
//
// RED — tp1-10 AC-6 (finding WD-017), core half: the dive's thrust rumble starts
// on the first DESCENDING frame, not at level-clear.
//
// ROM: MOVCUD starts the rumble exactly once, on the frame the Claw is still at the
// top and about to move — "LDA CURSY / CMP I,ILINLI / IFEQ ;STILL AT TOP? / JSR
// SOUTS2 ;YES. START RUMBLE" (ALWELG.MAC:1019-1023). MOVCUD does NOT run during the
// AVOID-SPIKES pause (that is CPAUSE → PAUSE, never PLDROP/MOVCUD), so the rumble is
// SILENT for the whole warning hold and begins the instant the descent does.
//
// Our sustained warp cue is started from the 'level-clear' event — i.e. at warp
// ENTRY, before the countdown — so it hums under the whole AVOID-SPIKES hold. The
// fix needs a first-descending-frame signal. This suite pins a new core event
// `warp-descent-start`, emitted once on the first descending frame and never during
// the warning hold. No such event exists today → RED.
import { describe, it, expect } from 'vitest'
import { playingState } from './helpers'
import type { GameState } from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import type { Input } from '../../src/core/input'
import { SIM_STEP, SPIKE_MAX_DEPTH } from '../../src/core/rules'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }
const has = (s: GameState, type: string): boolean => s.events.some((e) => e.type === type)
const count = (s: GameState, type: string): number => s.events.filter((e) => e.type === type).length

// Enter the warp WITH a spike threat on a non-player lane: warning > 0 (spike
// present, level ≤ 7), but the player's own lane is clear so the dive never crashes.
function enterWarpWithWarning(): GameState {
  const s = playingState(1)
  s.spawn = { nymphs: [] }
  s.enemies = []
  s.bullets = []
  s.player.lane = 0
  s.spikes = new Array(s.tube.laneCount).fill(0)
  s.spikes[8] = SPIKE_MAX_DEPTH // threat on a DIFFERENT lane
  const out = stepGame(s, NEUTRAL, SIM_STEP)
  expect(out.mode).toBe('warp')
  expect(out.warp.warning).toBeGreaterThan(0) // the hold is armed
  return out
}

// Enter a CLEAN warp: warning 0, so the very next warp frame is already descending.
function enterCleanWarp(): GameState {
  const s = playingState(1)
  s.spawn = { nymphs: [] }
  s.enemies = []
  s.bullets = []
  s.spikes = new Array(s.tube.laneCount).fill(0)
  const out = stepGame(s, NEUTRAL, SIM_STEP)
  expect(out.mode).toBe('warp')
  expect(out.warp.warning).toBe(0)
  return out
}

describe('tp1-10 AC-6 — rumble starts on the first descending frame (WD-017)', () => {
  it('does NOT emit warp-descent-start at level-clear / warp entry', () => {
    const s = enterWarpWithWarning()
    // The entry step fired level-clear; the descent has not begun.
    expect(has(s, 'level-clear')).toBe(true)
    expect(has(s, 'warp-descent-start')).toBe(false)
  })

  it('stays silent through the entire AVOID-SPIKES hold', () => {
    let s = enterWarpWithWarning()
    let holdFrames = 0
    while (s.warp.warning > 0 && holdFrames < 60) {
      s = stepGame(s, NEUTRAL, SIM_STEP)
      if (s.warp.warning > 0) {
        expect(has(s, 'warp-descent-start')).toBe(false) // no rumble while frozen
        holdFrames++
      }
    }
    expect(holdFrames).toBeGreaterThan(0) // the hold really lasted several frames
  })

  it('emits warp-descent-start exactly once, on the first frame the Claw descends', () => {
    let s = enterWarpWithWarning()
    // Walk to the first frame the descent actually moves the Claw.
    let firstDescendEvents = 0
    let guard = 0
    while (guard < 200) {
      const before = s.warp.progress
      s = stepGame(s, NEUTRAL, SIM_STEP)
      guard++
      if (s.warp.progress > before && s.mode === 'warp') {
        firstDescendEvents = count(s, 'warp-descent-start')
        break
      }
    }
    expect(firstDescendEvents).toBe(1) // fires on the first descending frame, once
  })

  it('does not re-emit warp-descent-start on later descending frames', () => {
    let s = enterCleanWarp()
    let total = 0
    for (let i = 0; i < 30 && s.mode === 'warp'; i++) {
      s = stepGame(s, NEUTRAL, SIM_STEP)
      total += count(s, 'warp-descent-start')
    }
    expect(total).toBe(1) // one edge, not one-per-frame
  })

  it('with no spike threat, fires on the first warp frame (which is already descending)', () => {
    const entered = enterCleanWarp() // warning 0
    const next = stepGame(entered, NEUTRAL, SIM_STEP) // first descending frame
    expect(next.warp.progress).toBeGreaterThan(0)
    expect(has(next, 'warp-descent-start')).toBe(true)
  })
})
