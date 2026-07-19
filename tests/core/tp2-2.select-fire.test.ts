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
// must not instantly confirm level 1. The select state therefore carries a
// `fireHeld` latch seeded from the entering frame's fire: only a rising edge
// (press after release) confirms. These tests drive the real transitions from
// the attract screen so the latch's seeding is exercised, not bypassed.
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
