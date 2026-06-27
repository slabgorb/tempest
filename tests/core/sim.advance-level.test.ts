// tests/core/sim.advance-level.test.ts
//
// RED-phase suite for Story 3-2 — the geometry swap on level advance
// (AC1, AC2, AC3) and the AC5 regression guard. This is the story's reason for
// existing: today checkLevelClear bumps s.level WITHOUT calling tubeForLevel or
// resizing s.spikes, so every level past 1 renders the level-1 circle.
//
// PARANOIA NOTE: a level 1 → 2 transition stays at 16 lanes, so it CANNOT catch
// a forgotten resize/wrap — both arrays are length 16 either way. Every test
// here that matters drives a transition where laneCount actually CHANGES. The
// authentic ROM roster (Story 6-7) has two lane counts — 16 (closed wells) and
// 15 (open sheets) — so L7 → L8 (16 → 15) and L11 → L12 (15 → 16) are the
// transitions that expose the carryover bug.
// Everything is observed through the public stepGame API (advanceLevel stays a
// private helper) — we assert behavior, not implementation shape.
import { describe, it, expect } from 'vitest'
import { playingState } from './helpers'
import type { GameState } from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { Input } from '../../src/core/input'
import { tubeForLevel, wrapLane } from '../../src/core/geometry'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }

// A self-consistent, freshly-cleared state sitting at `level` with the player on
// `playerLane`: budget empty, no enemies, tube/spikes sized to this level.
function clearedAtLevel(level: number, playerLane: number): GameState {
  const tube = tubeForLevel(level)
  const s = playingState(1)
  s.level = level
  s.tube = tube
  s.spikes = new Array(tube.laneCount).fill(0)
  s.player.lane = playerLane
  s.spawn.remaining = 0
  s.enemies = []
  return s
}

// Clear → warp → arrive. Returns the post-warp 'playing' state (level+1).
function transition(fromLevel: number, playerLane = 0): GameState {
  let s = stepGame(clearedAtLevel(fromLevel, playerLane), NEUTRAL, 1 / 60) // enter warp
  for (let i = 0; i < 1000 && s.mode === 'warp'; i++) s = stepGame(s, NEUTRAL, 1 / 60)
  return s
}

describe('advanceLevel — geometry swap (AC1)', () => {
  it('installs the EXACT next-level geometry from the shared roster table', () => {
    const out = transition(1)
    expect(out.level).toBe(2)
    expect(out.tube).toBe(tubeForLevel(2)) // referential identity: the shared immutable object
  })

  it('swaps to a geometry with a DIFFERENT laneCount (16 → 15) — not the stuck level-7 well', () => {
    const out = transition(7) // level 7 (closed, 16 lanes) → level 8 (open V funnel, 15 lanes)
    expect(out.level).toBe(8)
    expect(out.tube).toBe(tubeForLevel(8))
    expect(out.tube.laneCount).toBe(15)
    expect(out.tube.laneCount).not.toBe(16) // would still be 16 if the swap were missing
  })
})

describe('advanceLevel — spike array resize (AC2)', () => {
  it('resizes the spike array to the new laneCount across both roster sizes', () => {
    // from → to covers both distinct sizes: 16 (closed) and 15 (open).
    // 1→2:16, 7→8:15, 8→9:15, 11→12:16
    for (const from of [1, 7, 8, 11]) {
      const out = transition(from)
      expect(out.spikes).toHaveLength(tubeForLevel(out.level).laneCount)
    }
  })

  it('starts every lane of the new spike array at 0 — no stale heights carried over', () => {
    const s = clearedAtLevel(7, 0) // 16-lane closed source level
    s.spikes = new Array(s.tube.laneCount).fill(0.5) // pretend the level was full of spikes
    s.spikes[0] = 0 // ...except the player's lane (0): a spike there now crashes the Claw
                    // mid-warp (Story 3-3), so clear it to let the transition complete. The
                    // remaining 15 stale heights still prove the new array isn't carried over.
    let out = stepGame(s, NEUTRAL, 1 / 60)
    for (let i = 0; i < 1000 && out.mode === 'warp'; i++) out = stepGame(out, NEUTRAL, 1 / 60)

    expect(out.level).toBe(8)
    expect(out.spikes).toHaveLength(15) // shrunk to the open V funnel's laneCount
    expect(out.spikes.every((h) => h === 0)).toBe(true) // fresh fill(0), not truncated/copied
  })
})

describe('advanceLevel — player lane wrap into the new tube (AC3)', () => {
  it('wraps an out-of-range lane into the new, smaller tube so the Claw stays in bounds', () => {
    const out = transition(7, 15) // lane 15 valid at 16 lanes, out of range at the 15-lane open well
    expect(out.tube.laneCount).toBe(15)
    expect(out.player.lane).toBe(wrapLane(tubeForLevel(8), 15)) // open well clamps to lane 14
    expect(out.player.lane).not.toBe(15) // the stale, now-out-of-range value
    expect(out.player.lane).toBeGreaterThanOrEqual(0)
    expect(out.player.lane).toBeLessThan(out.tube.laneCount) // strictly in range
  })
})

describe('advanceLevel — AC5 regression guard the 3-1 suite could not cover', () => {
  // After a transition, the tube and the spike array must stay in lockstep with
  // the roster — the exact invariant whose violation is the carryover bug.
  // Parametrized over both distinct laneCounts the roster produces (16 / 15).
  for (const from of [1, 7, 8, 11]) {
    it(`level ${from} → ${from + 1}: tube.laneCount === spikes.length === tubeForLevel(level).laneCount`, () => {
      const out = transition(from)
      expect(out.mode).toBe('playing') // the warp actually completed
      const expected = tubeForLevel(out.level)
      expect(out.tube.laneCount).toBe(expected.laneCount)
      expect(out.spikes).toHaveLength(expected.laneCount)
    })
  }
})

describe('advanceLevel — determinism (pure core)', () => {
  it('produces identical post-warp geometry for identical inputs (no RNG, no time)', () => {
    const a = transition(3, 7)
    const b = transition(3, 7)
    expect(a.level).toBe(b.level)
    expect(a.tube).toBe(b.tube) // same shared roster object
    expect(a.spikes).toEqual(b.spikes)
    expect(a.player.lane).toBe(b.player.lane)
  })
})
