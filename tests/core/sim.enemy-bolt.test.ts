// tests/core/sim.enemy-bolt.test.ts
//
// Story 6-5: enemy-bolt MOTION and COLLISION, exercised by seeding bolts directly
// onto s.enemyBullets so each behaviour is isolated from the probabilistic firing
// path. Bolts travel from the firing enemy toward the player at the rim, i.e.
// depth increases (0 = far -> 1 = near rim), opposite to the player's own shots.
//
// CONTRACT FOR DEV:
//   * GameState gains `enemyBullets: EnemyBullet[]` (EnemyBullet = { lane, depth }).
//   * a bolt at/over the rim depth on the player's lane kills the player, emitting
//     a player-death event with the NEW cause 'bolt'.
//   * bolts are destroyable by player fire.
//   * in-flight bolts are cleared on respawn (no chain-death).
import { describe, it, expect } from 'vitest'
import { GameState } from '../../src/core/state'
import { playingState } from './helpers'
import { stepGame } from '../../src/core/sim'
import { Input } from '../../src/core/input'
import { levelParams, RESPAWN_DELAY } from '../../src/core/rules'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }
const DT = 1 / 60

// A 'playing' board with no enemies and a frozen, non-empty spawn budget — so the
// level never "clears" (which needs an empty board AND remaining === 0) and the
// only things in motion are the bolts we seed. The player sits on `playerLane`.
function boltBoard(seed: number, playerLane = 7): GameState {
  const s = playingState(seed)
  s.player.lane = playerLane
  s.spawn.remaining = 5
  s.spawn.timer = 9999
  s.enemies = []
  s.bullets = []
  return s
}

describe('enemy-bolt motion (AC6)', () => {
  it('travels toward the rim (depth increases)', () => {
    const s = boltBoard(1, 0)
    s.enemyBullets = [{ lane: 9, depth: 0.3 }] // far from the player's lane (0)
    const out = stepGame(s, NEUTRAL, DT)
    expect(out.enemyBullets).toHaveLength(1)
    expect(out.enemyBullets[0].depth).toBeGreaterThan(0.3)
  })

  it('travels straight down its lane — no tracking, even as the player spins', () => {
    let s = boltBoard(1, 0)
    s.enemyBullets = [{ lane: 9, depth: 0.2 }]
    for (let i = 0; i < 20; i++) {
      s = stepGame(s, { ...NEUTRAL, spin: 1 }, DT)
      expect(s.enemyBullets[0]?.lane, 'a bolt must not follow the player').toBe(9)
    }
  })

  it('travel is frame-rate independent (dt-driven)', () => {
    const depthAfter = (dt: number): number => {
      let s = boltBoard(1, 0)
      s.enemyBullets = [{ lane: 9, depth: 0.2 }]
      const steps = Math.round(0.3 / dt)
      for (let i = 0; i < steps; i++) s = stepGame(s, NEUTRAL, dt)
      return s.enemyBullets[0].depth
    }
    const d60 = depthAfter(1 / 60)
    const d120 = depthAfter(1 / 120)
    expect(d60, 'the bolt must actually move').toBeGreaterThan(0.2)
    expect(d60).toBeCloseTo(d120, 5)
  })

  it('outruns a flipper: a bolt covers more depth per second than a flipper climbs', () => {
    let s = boltBoard(1, 0)
    s.enemyBullets = [{ lane: 9, depth: 0.1 }]
    for (let i = 0; i < 30; i++) s = stepGame(s, NEUTRAL, DT) // 0.5s
    const boltDelta = s.enemyBullets[0].depth - 0.1
    const flipperDelta = levelParams(1).flipperSpeed * 0.5
    expect(boltDelta).toBeGreaterThan(flipperDelta)
  })
})

describe('enemy-bolt vs player (AC2)', () => {
  it('kills the player when a bolt reaches the rim on the player lane', () => {
    const s = boltBoard(1, 4)
    s.enemyBullets = [{ lane: 4, depth: 0.95 }] // at the rim, on the player's lane
    const out = stepGame(s, NEUTRAL, DT)
    expect(out.player.alive).toBe(false)
    expect(out.mode).toBe('dying')
    expect(out.lives).toBe(2)
    expect(
      out.events.some((e) => e.type === 'player-death' && e.cause === 'bolt'),
      'death must be attributed to a bolt',
    ).toBe(true)
  })

  it('does NOT kill when the bolt reaches the rim on a different lane (dodge)', () => {
    const s = boltBoard(1, 4)
    s.enemyBullets = [{ lane: 7, depth: 0.95 }] // rim, but not the player's lane
    const out = stepGame(s, NEUTRAL, DT)
    expect(out.player.alive).toBe(true)
    expect(out.mode).toBe('playing')
    expect(out.lives).toBe(3)
  })

  it('does NOT kill while the bolt is still below the rim on the player lane', () => {
    const s = boltBoard(1, 4)
    s.enemyBullets = [{ lane: 4, depth: 0.5 }] // same lane, not at the rim yet
    const out = stepGame(s, NEUTRAL, DT)
    expect(out.player.alive).toBe(true)
    expect(out.mode).toBe('playing')
  })

  it('ends the game when the last life is lost to a bolt', () => {
    const s = boltBoard(1, 4)
    s.lives = 1
    s.enemyBullets = [{ lane: 4, depth: 0.95 }]
    const out = stepGame(s, NEUTRAL, DT)
    expect(out.mode).toBe('gameover')
    expect(out.lives).toBe(0)
  })

  it('clears in-flight bolts on respawn (no chain-death from a lingering bolt)', () => {
    let s = boltBoard(1, 4)
    s.enemyBullets = [
      { lane: 4, depth: 0.95 }, // kills the player this step...
      { lane: 9, depth: 0.3 },  // ...an unrelated bolt that must not survive respawn
    ]
    s = stepGame(s, NEUTRAL, DT)
    expect(s.mode).toBe('dying')

    for (let i = 0; i < Math.ceil(RESPAWN_DELAY * 60) + 2; i++) {
      s = stepGame(s, NEUTRAL, DT)
    }
    expect(s.mode).toBe('playing')
    expect(s.player.alive).toBe(true)
    expect(s.enemyBullets, 'respawn must clear lingering bolts').toHaveLength(0)
  })
})

describe('enemy-bolt vs player fire (AC6)', () => {
  it('is destroyable by a player bullet sharing its lane', () => {
    let s = boltBoard(1, 0) // player parked on lane 0, out of the way
    s.enemyBullets = [{ lane: 9, depth: 0.48 }]
    s.bullets = [{ lane: 9, depth: 0.52 }] // player shot just above it, about to cross
    expect(s.enemyBullets, 'sanity: the bolt exists before the shot lands').toHaveLength(1)
    for (let i = 0; i < 3; i++) s = stepGame(s, NEUTRAL, DT)
    expect(s.enemyBullets, 'the bolt should be shot down').toHaveLength(0)
  })
})
