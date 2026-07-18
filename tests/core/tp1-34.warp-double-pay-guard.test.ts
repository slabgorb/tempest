// tests/core/tp1-34.warp-double-pay-guard.test.ts
//
// Story tp1-34 — HARDEN THE WARP DOUBLE-PAY GUARD.
//
// The advanced-start "skill-step" bonus (`s.startBonus`, set once at level
// select by `startWaveBonus(level)`, sim.ts:707) is paid EXACTLY ONCE, at the
// bottom-crossing of a successful dive (`beginFlyIn`, sim.ts:878-882):
//
//   if (s.startBonus > 0) { push 'wave-bonus'; awardScore(s, s.startBonus) }
//   s.startBonus = 0
//
// — cited to the ROM's "CLEAR BONUS" on arrival (ALWELG.MAC:114-117; tp1-13,
// S-015). A warp SPIKE CRASH instead REPLAYS the same wave (`replayWave`,
// sim.ts:892-906, tp1-10/WD-015): its comment states the pending bonus is
// NOT paid on a crash — there is no arrival, so it stays owed for the
// eventual successful dive.
//
// This suite drives the REAL sim (stepGame) through full crash-replay
// sequences and asserts the bonus is paid EXACTLY ONCE — never twice, never
// dropped — in both directions:
//   1. crash BEFORE the bonus is ever paid (still owed after the replay)
//   2. crash AFTER a legitimate arrival already paid and cleared it (must
//      not be re-armed by the replay)
//
// VERDICT (recorded here and in the session's Delivery Findings): the guard
// is already sound. `startWaveBonus` is called in exactly one place —
// `startGameAtLevel`, i.e. only at a fresh game's level select — and nothing
// on the crash/replay path (`replayWave`) or the normal wave-advance path
// (`loadNextWave`) ever re-sets `s.startBonus` to a positive value. Once
// `beginFlyIn`'s `s.startBonus = 0` fires, no code path can make it positive
// again short of starting an entirely new game. So a double-pay or a drop is
// structurally unreachable, and no production change was needed. These tests
// are a characterization/regression pin on that invariant, not a fix.
import { describe, it, expect } from 'vitest'
import type { GameState } from '../../src/core/state'
import { initialState } from '../../src/core/state'
import type { GameEvent } from '../../src/core/events'
import { stepGame } from '../../src/core/sim'
import type { Input } from '../../src/core/input'
import { SPIKE_MAX_DEPTH } from '../../src/core/rules'

const DT = 1 / 60
const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }
const START: Input = { ...NEUTRAL, start: true }
const SPIN_UP: Input = { ...NEUTRAL, spin: 1 }

// The wave-3 ROM skill-step bonus: BONPTM[1], decoded in
// tests/core/tp1-13.audio-wiring-events.test.ts's ROM_START_BONUS table
// (ALWELG.MAC:266-277) — a pinned literal, not re-derived from our code.
const WAVE_3_BONUS = 6_000

function eventsOfType<T extends GameEvent['type']>(
  events: readonly GameEvent[], type: T,
): Extract<GameEvent, { type: T }>[] {
  return events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type)
}

// Drive the REAL framing flow to an advanced-start wave: attract -> (start) ->
// select -> (spin up to `wave`) -> (start) -> playing at `wave`, with
// s.startBonus committed by the actual select machine (tp1-13's startAtWave).
function startAtWave(wave: number, seed = 7): GameState {
  let s = initialState(seed)
  s.mode = 'attract'
  s = stepGame(s, START, DT)
  expect(s.mode, 'start on the title must open level select').toBe('select')
  for (let i = 1; i < wave; i++) s = stepGame(s, SPIN_UP, DT)
  expect(s.select.selectedLevel).toBe(wave)
  s = stepGame(s, START, DT)
  expect(s.mode).toBe('playing')
  expect(s.level).toBe(wave)
  return s
}

// Clear the board (no threat) and drive the warp to its resolution: a clean
// dive that advances exactly one wave. Bounded so a stuck dive fails loudly.
function diveSuccessfully(s: GameState, bound = 3000): { state: GameState; events: GameEvent[] } {
  s.enemies = []
  s.spawn = { nymphs: [] }
  s.bullets = []
  s.enemyBullets = []
  s.spikes = s.spikes.map(() => 0) // no spike threat anywhere — sails straight through
  const levelBefore = s.level
  const events: GameEvent[] = []
  let enteredWarp = false
  let steps = 0
  while (steps < bound) {
    s = stepGame(s, NEUTRAL, DT)
    events.push(...s.events)
    steps++
    if (s.mode === 'warp') enteredWarp = true
    if (enteredWarp && s.mode === 'playing') break
  }
  expect(enteredWarp, 'staging: an empty, spike-free board must enter the warp').toBe(true)
  expect(s.mode).toBe('playing')
  expect(s.level, 'a clean dive advances exactly one wave').toBe(levelBefore + 1)
  return { state: s, events }
}

// Clear the board but leave a guaranteed max-height spike on the player's
// lane, then drive the warp through crash -> dying -> replayWave -> playing,
// on the SAME wave. Bounded so a re-crash drain loop fails loudly.
function crashOntoSpike(s: GameState, bound = 600): { state: GameState; events: GameEvent[] } {
  s.enemies = []
  s.spawn = { nymphs: [] }
  s.bullets = []
  s.enemyBullets = []
  const lane = 0
  s.player.lane = lane
  s.spikes = s.spikes.map(() => 0)
  s.spikes[lane] = SPIKE_MAX_DEPTH
  const levelBefore = s.level
  const events: GameEvent[] = []
  let sawDying = false
  let steps = 0
  while (steps < bound) {
    s = stepGame(s, NEUTRAL, DT)
    events.push(...s.events)
    steps++
    if (s.mode === 'dying') sawDying = true
    if (s.mode === 'gameover') break
    if (sawDying && s.mode === 'playing') break
  }
  expect(s.level, 'a spike crash replays the SAME wave, never advances').toBe(levelBefore)
  expect(eventsOfType(events, 'warp-spike-crash'), 'staging: the crash must actually happen')
    .toHaveLength(1)
  return { state: s, events }
}

describe('tp1-34 — the advanced-start bonus pays EXACTLY ONCE across a crash-replay', () => {
  it('crash BEFORE the bonus is ever paid: the later legitimate arrival still pays it exactly once', () => {
    let s = startAtWave(3)
    expect(s.score, 'a fresh advanced start: score 0, bonus pending').toBe(0)
    const allEvents: GameEvent[] = []

    // First dive off wave 3 crashes onto a spike before ENDWAV/beginFlyIn ever
    // runs — the pending bonus is untouched (still owed) across the replay.
    const crash = crashOntoSpike(s)
    allEvents.push(...crash.events)
    s = crash.state
    expect(s.level).toBe(3)
    expect(s.score, 'the crash itself pays nothing').toBe(0)

    // Second dive, off the REPLAYED wave 3, with no spike this time: a real arrival.
    const dive = diveSuccessfully(s)
    allEvents.push(...dive.events)
    s = dive.state
    expect(s.level, 'the retry dive completes to wave 4').toBe(4)

    const bonuses = eventsOfType(allEvents, 'wave-bonus')
    expect(bonuses, 'exactly one wave-bonus for the whole sequence').toHaveLength(1)
    expect(bonuses[0].points).toBe(WAVE_3_BONUS)
    expect(s.score, 'the pending bonus is paid exactly once, on the eventual arrival')
      .toBe(WAVE_3_BONUS)
  })

  it('crash AFTER an arrival already paid the bonus: the replay does not re-arm or re-pay it', () => {
    let s = startAtWave(3)
    const allEvents: GameEvent[] = []

    // Dive wave 3 -> 4 cleanly: the legitimate arrival that pays the bonus and
    // clears s.startBonus to 0 (sim.ts:878-882).
    const firstDive = diveSuccessfully(s)
    allEvents.push(...firstDive.events)
    s = firstDive.state
    expect(s.level).toBe(4)
    expect(eventsOfType(firstDive.events, 'wave-bonus')).toHaveLength(1)
    expect(s.score).toBe(WAVE_3_BONUS)

    // Now crash on wave 4 — AFTER the bonus is already cleared — and replay it.
    const crash = crashOntoSpike(s)
    allEvents.push(...crash.events)
    s = crash.state
    expect(s.level).toBe(4)
    expect(s.score, 'the crash-replay must not re-pay the already-cleared bonus')
      .toBe(WAVE_3_BONUS)

    // Dive the replayed wave 4 cleanly to arrival at wave 5: still no second bonus.
    const secondDive = diveSuccessfully(s)
    allEvents.push(...secondDive.events)
    s = secondDive.state
    expect(s.level).toBe(5)

    const bonuses = eventsOfType(allEvents, 'wave-bonus')
    expect(bonuses, 'exactly one wave-bonus across the whole multi-wave, multi-crash sequence')
      .toHaveLength(1)
    expect(s.score, 'score reflects exactly one bonus payment, never twice, never dropped')
      .toBe(WAVE_3_BONUS)
  })

  it('the crash-before-pay sequence is deterministic from a seed', () => {
    function run(): GameState {
      let s = startAtWave(3)
      s = crashOntoSpike(s).state
      return diveSuccessfully(s).state
    }
    expect(run()).toEqual(run())
  })
})
