// tests/core/sim.level.test.ts
//
// RED-phase suite for Story 3-2 (warp transition + geometry switch).
// REPLACES the Wave-1 immediate-advance semantics: clearing a level no longer
// jumps straight to the next level — it now enters a 'warp' mode and only
// advances once the warp completes. These tests pin the *gating* (when does a
// clear enter warp, when does it NOT); the geometry-swap detail lives in
// sim.advance-level.test.ts and the warp mechanics in sim.warp.test.ts.
import { describe, it, expect } from 'vitest'
import { playingState } from './helpers'
import type { GameState } from '../../src/core/state'
import { stepGame, makeEnemy } from '../../src/core/sim'
import { Input } from '../../src/core/input'
import { levelParams } from '../../src/core/rules'
import { tubeForLevel } from '../../src/core/geometry'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }

// Step until the warp finishes (mode leaves 'warp') or a generous frame budget
// is exhausted. WARP_SPEED is chosen so this completes well under the budget.
function runWarpToCompletion(start: GameState): GameState {
  let out = start
  for (let i = 0; i < 1000 && out.mode === 'warp'; i++) {
    out = stepGame(out, NEUTRAL, 1 / 60)
  }
  return out
}

describe('level clear → enters warp (not an immediate advance)', () => {
  it('enters warp, NOT the next level, when the budget is empty and enemies are gone', () => {
    const s = playingState(1)
    s.spawn.remaining = 0
    s.enemies = []

    const out = stepGame(s, NEUTRAL, 1 / 60)
    expect(out.mode).toBe('warp')
    expect(out.level).toBe(1) // the level has NOT advanced yet
  })

  it('advances to the next level + harder spawn budget once the warp completes', () => {
    let s = playingState(1)
    s.spawn.remaining = 0
    s.enemies = []
    s = stepGame(s, NEUTRAL, 1 / 60) // now warping
    expect(s.mode).toBe('warp')

    const out = runWarpToCompletion(s)
    expect(out.mode).toBe('playing')
    expect(out.level).toBe(2)
    expect(out.spawn.remaining).toBe(levelParams(2).enemyCount)
    // Geometry actually swapped to level 2's roster shape (see sim.advance-level
    // for the laneCount-VARYING transitions that truly exercise the resize).
    expect(out.tube.laneCount).toBe(tubeForLevel(2).laneCount)
  })

  it('does NOT enter warp while enemies remain', () => {
    const s = playingState(1)
    s.spawn.remaining = 0
    s.enemies = [makeEnemy('flipper', 1, 0.2, levelParams(1))]

    const out = stepGame(s, NEUTRAL, 1 / 60)
    expect(out.mode).toBe('playing')
    expect(out.level).toBe(1)
  })

  it('does NOT enter warp while the spawn budget still has enemies to release', () => {
    const s = playingState(1) // spawn.remaining > 0, no enemies on field yet
    s.enemies = []

    const out = stepGame(s, NEUTRAL, 1 / 60)
    expect(out.mode).toBe('playing')
    expect(out.level).toBe(1)
  })

  it('makes the next level harder (more enemies, faster flippers)', () => {
    expect(levelParams(2).enemyCount).toBeGreaterThan(levelParams(1).enemyCount)
    expect(levelParams(2).flipperSpeed).toBeGreaterThan(levelParams(1).flipperSpeed)
  })

  it('does NOT enter warp when the player is killed by the final enemy', () => {
    const s = playingState(1)
    s.spawn.remaining = 0
    s.lives = 1
    s.player.lane = 4
    s.enemies = [makeEnemy('flipper', 4, 1, levelParams(1))]

    const out = stepGame(s, NEUTRAL, 1 / 60)
    expect(out.mode).toBe('gameover') // player died this frame
    expect(out.level).toBe(1) // level did NOT advance, no warp
  })
})
