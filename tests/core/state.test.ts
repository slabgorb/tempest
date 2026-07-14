import { describe, it, expect } from 'vitest'
import { initialState } from '../../src/core/state'
import { levelParams } from '../../src/core/rules'

describe('initialState', () => {
  // Story 4-2: the game now boots on the attract screen, not mid-game. Gameplay
  // begins only after attract -> select -> playing (see sim.framing.test.ts).
  it('starts on the attract screen at level 1 with full lives', () => {
    const s = initialState(123)
    expect(s.mode as string).toBe('attract')
    expect(s.level).toBe(1)
    expect(s.lives).toBe(3)
    expect(s.score).toBe(0)
  })

  it('builds a 16-lane closed tube', () => {
    const s = initialState(123)
    expect(s.tube.laneCount).toBe(16)
    expect(s.tube.closed).toBe(true)
  })

  it('seeds the level-1 spawn budget as a nymph queue', () => {
    const s = initialState(123)
    expect(s.spawn.nymphs.length).toBe(levelParams(1).enemyCount)
    expect(s.enemies).toEqual([])
    expect(s.bullets).toEqual([])
  })

  it('places an alive player at lane 0', () => {
    const s = initialState(123)
    expect(s.player.alive).toBe(true)
    expect(s.player.lane).toBe(0)
  })
})

describe('levelParams', () => {
  it('ramps enemy count and speed with level', () => {
    expect(levelParams(2).enemyCount).toBeGreaterThan(levelParams(1).enemyCount)
    expect(levelParams(2).flipperSpeed).toBeGreaterThan(levelParams(1).flipperSpeed)
  })
})
