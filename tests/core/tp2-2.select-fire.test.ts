// tests/core/tp2-2.select-fire.test.ts
//
// Story tp2-2: the select screen's ROM-authentic prompt (tp1-20) reads
// PRESS FIRE TO SELECT, but the sim confirmed only on `start` (Enter) — fire
// did nothing. The behaviour is the bug, not the prompt: fire must confirm
// the chosen level, as it did on the cabinet.
//
// The subtlety is that `fire` is LEVEL-triggered in the shell — a held space
// or mouse button asserts it on every step (deliberate autofire), and a mouse
// click queues start+fire TOGETHER — so the same press that entered select
// must not instantly confirm level 1. stepGame confirms only on a RISING edge,
// read through the shared `GameState.prevFire` latch (6-2) it maintains every
// frame — the same last-frame-fire the high-score entry screen uses — so a
// press carried in from the attract screen must be released before it can
// confirm. These tests drive the real transitions from the attract screen so
// the latch is exercised, not bypassed.
import { describe, it, expect } from 'vitest'
import { initialState, GameState } from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { Input } from '../../src/core/input'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }
const DT = 1 / 60

const step = (s: GameState, over: Partial<Input> = {}): GameState =>
  stepGame(s, { ...NEUTRAL, ...over }, DT)

describe('tp2-2 — fire confirms the start-level select', () => {
  it('a fresh fire press starts the game at the chosen level', () => {
    let s = step(initialState(7), { start: true }) // attract -> select, fire up
    expect(s.mode).toBe('select')
    s = step(s, { spin: 1 }) // 1 -> 2
    s = step(s, { spin: 1 }) // 2 -> 3
    const out = step(s, { fire: true })
    expect(out.mode).toBe('playing')
    expect(out.level).toBe(3)
    // The fire that CONFIRMS must not also spawn a shot on the transition frame.
    expect(out.bullets).toHaveLength(0)
  })

  it('spins while fire is held, then confirms at the spun-to level on release + re-press', () => {
    // The story's own mouse scenario: the trigger is held down WHILE the player
    // spins the selector. Spinning must work and the held fire must never
    // confirm; only a fresh press (after release) commits — at the spun-to level.
    let s = step(initialState(7), { start: true, fire: true }) // enter select, fire held
    expect(s.mode).toBe('select')
    expect(s.select.selectedLevel).toBe(1)
    s = step(s, { spin: 1, fire: true }) // spin with fire still down: 1 -> 2
    expect(s.mode).toBe('select')
    expect(s.select.selectedLevel).toBe(2)
    s = step(s, { spin: 1, fire: true }) // spin with fire still down: 2 -> 3
    expect(s.mode).toBe('select')
    expect(s.select.selectedLevel).toBe(3)
    s = step(s) // release fire — clears the edge latch
    expect(s.mode).toBe('select')
    const out = step(s, { fire: true }) // fresh press confirms
    expect(out.mode).toBe('playing')
    expect(out.level).toBe(3)
  })

  it('fire still held from the press that entered select does not confirm', () => {
    // A mouse click queues start+fire on the same step, and the button is
    // still down on the steps that follow — that must not skip the screen.
    let s = step(initialState(7), { start: true, fire: true })
    expect(s.mode).toBe('select')
    s = step(s, { fire: true })
    expect(s.mode).toBe('select')
    s = step(s, { fire: true })
    expect(s.mode).toBe('select')
  })

  it('release then re-press confirms: the latch clears when fire goes up', () => {
    let s = step(initialState(7), { start: true, fire: true }) // enter, held
    s = step(s, { fire: true }) // still held — inert
    s = step(s) // released
    expect(s.mode).toBe('select')
    const out = step(s, { fire: true }) // fresh press
    expect(out.mode).toBe('playing')
    expect(out.level).toBe(1)
    // The confirming press must not spawn a shot on the transition frame.
    expect(out.bullets).toHaveLength(0)
  })

  it('start (Enter) still confirms', () => {
    const s = step(initialState(7), { start: true })
    const out = step(s, { start: true })
    expect(out.mode).toBe('playing')
    expect(out.level).toBe(1)
  })

  it('zap stays inert on the select screen', () => {
    const s = step(initialState(7), { start: true })
    const out = step(s, { zap: true })
    expect(out.mode).toBe('select')
    expect(out.bullets).toHaveLength(0)
  })
})
