// tests/core/rules.flip-pattern.test.ts
//
// Story 6-14: authentic per-level flipper flip patterns. The arcade ROM drives
// each level's flipper with a `flipper_move` program (enemy-roster ROM extract
// §A, l.9204-9348): L1 is the gentle "move 8 ticks then flip"; deep levels are
// "flip constantly, 1 move between". We model the CADENCE envelope (climb frames
// between flips) plus the multi-tick flip-animation duration. The exact per-level
// bytecode programs and the directional patterns (away-from-player, 2-vs-3
// alternating) are out of scope for this story — see session Design Deviations.
import { describe, it, expect } from 'vitest'
import { flipPatternForLevel } from '../../src/core/rules'

describe('flipPatternForLevel — authentic per-level cadence', () => {
  it('L1 is the gentle "move 8 ticks then flip" program', () => {
    // ROM flipper_move m_l0b (enemy-roster extract §A l.9204): the gentlest
    // cadence — eight climb ticks between flips. L1 is the easiest level, so it
    // gets the gentlest program.
    expect(flipPatternForLevel(1).moveFrames).toBe(8)
  })

  it('every flip is multi-tick — never instantaneous', () => {
    // The headline behaviour: p_flip_cont steps the angle ±1 per tick toward the
    // target lane, so a flip ALWAYS spans more than one tick.
    for (const lvl of [1, 2, 5, 8, 11, 16, 17, 33]) {
      expect(flipPatternForLevel(lvl).flipFrames).toBeGreaterThanOrEqual(2)
    }
  })

  it('cadence tightens (or holds) as the level rises — flippers get meaner', () => {
    const sampled = [1, 2, 3, 5, 8, 11, 16].map((l) => flipPatternForLevel(l).moveFrames)
    for (let i = 1; i < sampled.length; i++) {
      expect(sampled[i]).toBeLessThanOrEqual(sampled[i - 1])
    }
  })

  it('bottoms out at the ROM floor of "1 move between" — never spams 0', () => {
    // m_l19 (l.9220) "flip constantly, 1 move between": the most aggressive
    // cadence the ROM ever uses is one climb tick between flips. moveFrames 0
    // would be a degenerate flip-every-tick-with-no-climb; the ROM never does it.
    for (const lvl of [1, 8, 16, 33, 50, 99]) {
      expect(flipPatternForLevel(lvl).moveFrames).toBeGreaterThanOrEqual(1)
      expect(flipPatternForLevel(lvl).moveFrames).toBeLessThanOrEqual(8)
    }
    // By deep play the cadence has reached the constant-flip floor.
    expect(flipPatternForLevel(33).moveFrames).toBe(1)
  })

  it('flip animation is no slower deep — flip_top_accel steps 2→3 at L33', () => {
    // flip_top_accel (l.7184-7187) is 2 for L1-32 and 3 for L33-99: deep flips
    // animate FASTER, so flipFrames must be non-increasing across that boundary.
    // (We do not gold-plate the exact deep-level frame counts nobody reaches —
    // only the documented direction of the change.)
    expect(flipPatternForLevel(33).flipFrames).toBeLessThanOrEqual(flipPatternForLevel(1).flipFrames)
  })

  it('is total and sane for every level, including geometry wraps', () => {
    for (const lvl of [1, 16, 17, 32, 33, 64, 99]) {
      const p = flipPatternForLevel(lvl)
      expect(Number.isInteger(p.moveFrames)).toBe(true)
      expect(Number.isInteger(p.flipFrames)).toBe(true)
      expect(p.moveFrames).toBeGreaterThan(0)
      expect(p.flipFrames).toBeGreaterThan(0)
    }
  })

  it('is deterministic — same level yields the same pattern', () => {
    expect(flipPatternForLevel(7)).toEqual(flipPatternForLevel(7))
  })
})
