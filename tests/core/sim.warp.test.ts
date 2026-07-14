// tests/core/sim.warp.test.ts
//
// RED-phase suite for Story 3-2 — the warp animation lifecycle (AC4).
// Paranoid by design: pins progress to [0,1) on entry, proves it advances
// monotonically toward 1, resets to exactly 0 on completion, forbids firing
// during the warp, allows the Claw to keep rotating (the dodge foundation),
// and — critically — proves stepGame does NOT mutate its input warp state
// (the `cloneState` must clone `warp`, a subtle determinism trap).
import { describe, it, expect } from 'vitest'
import { playingState } from './helpers'
import type { GameState } from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { Input } from '../../src/core/input'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }
const FIRING: Input = { spin: 0, fire: true, zap: false, start: false }

// Clear a fresh level-1 game and take the single step that enters the warp.
function enterWarp(): GameState {
  const s = playingState(1)
  s.spawn = { nymphs: [] }
  s.enemies = []
  return stepGame(s, NEUTRAL, 1 / 60)
}

describe('warp lifecycle', () => {
  it('enters warp with progress in [0, 1) — entered but not yet arrived', () => {
    const s = enterWarp()
    expect(s.mode).toBe('warp')
    expect(s.warp.progress).toBeGreaterThanOrEqual(0)
    expect(s.warp.progress).toBeLessThan(1)
  })

  it('advances progress monotonically toward 1 while warping', () => {
    let s = enterWarp()
    const samples: number[] = [s.warp.progress]
    for (let i = 0; i < 12 && s.mode === 'warp'; i++) {
      s = stepGame(s, NEUTRAL, 1 / 60)
      if (s.mode === 'warp') samples.push(s.warp.progress)
    }
    expect(samples.length).toBeGreaterThanOrEqual(2) // warp lasts several frames
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]).toBeGreaterThan(samples[i - 1])
    }
  })

  it('completes within a bounded number of frames and lands back in playing', () => {
    let s = enterWarp()
    expect(s.mode).toBe('warp') // must actually be warping for this to mean anything
    let i = 0
    for (; i < 1000 && s.mode === 'warp'; i++) s = stepGame(s, NEUTRAL, 1 / 60)
    expect(s.mode).toBe('playing')
    expect(i).toBeLessThan(1000) // it actually finished, not just ran out of budget
  })

  it('resets warp.progress to exactly 0 after completing (AC4)', () => {
    let s = enterWarp()
    for (let i = 0; i < 1000 && s.mode === 'warp'; i++) s = stepGame(s, NEUTRAL, 1 / 60)
    expect(s.mode).toBe('playing')
    expect(s.warp.progress).toBe(0)
  })

  it('does NOT fire bullets during the warp', () => {
    let s = enterWarp()
    expect(s.mode).toBe('warp') // guard: hold FIRING *while warping*, not after it ends
    for (let i = 0; i < 5 && s.mode === 'warp'; i++) s = stepGame(s, FIRING, 1 / 60)
    expect(s.bullets).toHaveLength(0)
  })

  it('still lets the player rotate the Claw during the warp', () => {
    const s = enterWarp()
    const before = s.player.lane
    const out = stepGame(s, { spin: 3, fire: false, zap: false, start: false }, 1 / 60)
    expect(out.mode).toBe('warp') // one rotation step does not finish the warp
    expect(out.player.lane).not.toBe(before)
  })

  it('does NOT mutate the input state during a warp step (cloneState must clone warp)', () => {
    const s = enterWarp()
    const progressBefore = s.warp.progress
    const modeBefore = s.mode
    const levelBefore = s.level

    stepGame(s, NEUTRAL, 1 / 60) // result intentionally discarded

    expect(s.warp.progress).toBe(progressBefore) // input untouched...
    expect(s.mode).toBe(modeBefore)
    expect(s.level).toBe(levelBefore)
  })
})
