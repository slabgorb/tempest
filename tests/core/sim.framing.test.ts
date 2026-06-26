// tests/core/sim.framing.test.ts
//
// RED-phase suite for Story 4-2: the pure-core framing state machine — the
// attract screen and the start-level select. Scope is the mode transitions and
// the selectedLevel logic ONLY; rendering the screens is story 4-7.
//
// New surface this exercises (does not exist until 4-2 GREEN):
//   - Mode union gains 'attract' and 'select'
//   - GameState.select = { selectedLevel: number }
//   - initialState() boots in 'attract'
//   - attract + start -> select (selectedLevel reset to 1)
//   - select + spin -> selectedLevel +/- 1, CLAMPED to [1, 16], NO WRAP
//   - select + start -> playing at the chosen level (via startGameAtLevel)
//   - gameover + start -> attract (NOT straight to playing)
//
// These types/values are absent pre-GREEN, so the file only type-checks (tsc)
// after GREEN. Under `vitest run` types are stripped, so the tests execute and
// fail on BEHAVIOUR (assertion mismatch), which is the intended RED signal.
import { describe, it, expect } from 'vitest'
import { initialState, GameState } from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { Input } from '../../src/core/input'
import { tubeForLevel } from '../../src/core/geometry'
import { START_LIVES } from '../../src/core/rules'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }
const DT = 1 / 60

// TEA decision (see session deviations): the start-level select CLAMPS to
// [1, MAX_SELECT_LEVEL] with NO wrap-around. MAX_SELECT_LEVEL is the count of
// distinct tube geometries (tubeForLevel() repeats with period 16, so beyond 16
// no new geometry exists). GREEN must clamp at exactly this value.
const MAX_SELECT_LEVEL = 16

// Loose views over the not-yet-extended core types, so reads are clean and the
// tests fail on an assertion (e.g. expected 'select', got 'attract') rather than
// throwing on an undefined property.
const modeOf = (s: GameState): string => (s as unknown as { mode: string }).mode
const lvlOf = (s: GameState): number | undefined =>
  (s as unknown as { select?: { selectedLevel: number } }).select?.selectedLevel

function withMode(s: GameState, mode: string): GameState {
  ;(s as unknown as { mode: string }).mode = mode
  return s
}
function withSelect(s: GameState, selectedLevel: number): GameState {
  ;(s as unknown as { select: { selectedLevel: number } }).select = { selectedLevel }
  return s
}

// A state parked on the attract screen, regardless of what initialState()
// currently boots into (so attract behaviour is isolated during RED).
const attractState = (seed = 1): GameState => withMode(initialState(seed), 'attract')
// A state parked on the select screen at a chosen level.
const selectState = (seed: number, level: number): GameState =>
  withSelect(withMode(initialState(seed), 'select'), level)
const gameoverState = (seed = 1): GameState => withMode(initialState(seed), 'gameover')

const start = (s: GameState): GameState => stepGame(s, { ...NEUTRAL, start: true }, DT)
const spin = (s: GameState, dir: number): GameState => stepGame(s, { ...NEUTRAL, spin: dir }, DT)

describe('framing — initialState boots on the attract screen', () => {
  // AC: initialState() starts in 'attract'; GameState.select holds { selectedLevel }.
  it('initialState boots in attract with selectedLevel defaulting to 1', () => {
    const s = initialState(7)
    expect(modeOf(s)).toBe('attract')
    expect(lvlOf(s)).toBe(1)
  })
})

describe('framing — attract screen', () => {
  // AC: 'attract' + start -> 'select' (selectedLevel initialized to 1).
  it('attract + start enters select and (re)initializes selectedLevel to 1', () => {
    const s = withSelect(attractState(7), 9) // stale value must be reset on entry
    const out = start(s)
    expect(modeOf(out)).toBe('select')
    expect(lvlOf(out)).toBe(1)
  })

  // AC: attract accepts no gameplay input — only start matters here.
  it('attract ignores spin/fire/zap and stays on the attract screen', () => {
    const out = stepGame(attractState(7), { spin: 5, fire: true, zap: true, start: false }, DT)
    expect(modeOf(out)).toBe('attract')
    expect(out.bullets).toHaveLength(0)
  })
})

describe('framing — start-level select', () => {
  // AC: select + spin steps selectedLevel by one per spin (TEA: ±1 per spin step).
  it('steps selectedLevel by one per spin — up then down — staying in select', () => {
    let s = selectState(1, 1)
    s = spin(s, 1)
    expect(modeOf(s)).toBe('select')
    expect(lvlOf(s)).toBe(2)
    s = spin(s, 1)
    expect(lvlOf(s)).toBe(3)
    s = spin(s, -1)
    expect(lvlOf(s)).toBe(2)
  })

  // AC: clamp to the minimum — never below 1, and no wrap to the maximum.
  it('clamps selectedLevel at the minimum of 1 on negative spin (no wrap)', () => {
    const out = spin(selectState(1, 1), -1)
    expect(modeOf(out)).toBe('select')
    expect(lvlOf(out)).toBe(1)
  })

  // AC: clamp to the maximum — never above MAX_SELECT_LEVEL, and no wrap to 1.
  it('clamps selectedLevel at the maximum (16) on repeated positive spin (no wrap)', () => {
    let s = selectState(1, 1)
    for (let i = 0; i < 100; i++) s = spin(s, 1)
    expect(modeOf(s)).toBe('select')
    expect(lvlOf(s)).toBe(MAX_SELECT_LEVEL)
    // One more up-spin must stay pinned at the max; a wrap would drop toward 1.
    expect(lvlOf(spin(s, 1))).toBe(MAX_SELECT_LEVEL)
  })

  // AC: select accepts only spin and start — fire/zap are inert.
  it('ignores fire/zap in select: no bullets, no mode change, level unchanged', () => {
    const out = stepGame(selectState(1, 5), { spin: 0, fire: true, zap: true, start: false }, DT)
    expect(modeOf(out)).toBe('select')
    expect(lvlOf(out)).toBe(5)
    expect(out.bullets).toHaveLength(0)
  })

  // Guard: neutral input is a no-op (holds through RED and GREEN).
  it('leaves selectedLevel unchanged on neutral input and stays in select', () => {
    const out = stepGame(selectState(1, 7), NEUTRAL, DT)
    expect(modeOf(out)).toBe('select')
    expect(lvlOf(out)).toBe(7)
  })

  // AC: select + start -> playing at the chosen level (generalized startGameAtLevel);
  // the framing commit must reset a fresh game and must NOT consume the RNG.
  it('start commits to playing at the selected level with a fresh game, RNG untouched', () => {
    const s = selectState(42, 4)
    const rngBefore = { ...s.rng }
    const out = start(s)
    expect(modeOf(out)).toBe('playing')
    expect(out.level).toBe(4)
    expect(out.tube).toEqual(tubeForLevel(4))
    expect(out.spikes).toHaveLength(tubeForLevel(4).laneCount)
    expect(out.spikes.every((h) => h === 0)).toBe(true)
    expect(out.player.alive).toBe(true)
    expect(out.player.lane).toBe(0)
    expect(out.player.superzapper).toBe('full')
    expect(out.score).toBe(0)
    expect(out.lives).toBe(START_LIVES)
    expect(out.rng).toEqual(rngBefore) // framing transitions must not touch RNG
  })
})

describe('framing — gameover returns to attract', () => {
  // AC: 'gameover' + start -> 'attract' (NOT directly to 'playing').
  it('gameover + start returns to attract, not straight into play', () => {
    const s = gameoverState(1)
    s.score = 5000
    const out = start(s)
    expect(modeOf(out)).toBe('attract')
    expect(modeOf(out)).not.toBe('playing')
  })
})

describe('framing — full flow and determinism', () => {
  // AC: end-to-end attract -> select -> (choose level) -> playing.
  it('runs attract -> select -> playing at the chosen level', () => {
    let s = attractState(9)
    s = start(s) // attract -> select
    expect(modeOf(s)).toBe('select')
    expect(lvlOf(s)).toBe(1)
    s = spin(s, 1) // 1 -> 2
    s = spin(s, 1) // 2 -> 3
    expect(lvlOf(s)).toBe(3)
    const out = start(s) // select -> playing at level 3
    expect(modeOf(out)).toBe('playing')
    expect(out.level).toBe(3)
    expect(out.tube).toEqual(tubeForLevel(3))
  })

  // AC: deterministic — identical (state, input, dt) -> identical mode + selectedLevel + RNG.
  it('is deterministic: same (state, input, dt) yields the same mode and selectedLevel', () => {
    const a = start(attractState(123))
    const b = start(attractState(123))
    expect(modeOf(a)).toBe('select')
    expect(modeOf(a)).toBe(modeOf(b))
    expect(lvlOf(a)).toBe(lvlOf(b))
    expect(a.rng).toEqual(b.rng)
  })
})
