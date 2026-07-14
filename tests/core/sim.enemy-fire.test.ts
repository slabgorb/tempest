// tests/core/sim.enemy-fire.test.ts
//
// Story 6-5: enemies fire energy bolts (behavioural, driven through stepGame).
// Everything here is seeded + dt-driven, so the whole suite is deterministic —
// the core-purity rule (no Math.random / Date.now; randomness via the seeded RNG
// carried in GameState) is what makes this testable at all.
//
// Firing is detected via the `enemy-fire` game event (AC8's SFX hook), which is
// the cleanest observable signal that a bolt was spawned.
//
// CONTRACT FOR DEV:
//   * GameState gains `enemyBullets: EnemyBullet[]` (EnemyBullet = { lane, depth }).
//   * a new `enemy-fire` event { type:'enemy-fire', lane, depth } fires on spawn.
import { describe, it, expect } from 'vitest'
import { GameState } from '../../src/core/state'
import { playingState } from './helpers'
import { stepGame, makeEnemy } from '../../src/core/sim'
import { Input } from '../../src/core/input'
import { levelParams } from '../../src/core/rules'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }
const DT = 1 / 60

// A 'playing' board that neither spawns nor clears: the player is parked far from
// the seeded enemies (so bolts that reach the rim on an enemy lane just expire
// instead of ending the test), and the spawn budget is frozen.
function fireBoard(
  seed: number, enemies: GameState['enemies'], playerLane = 14,
): GameState {
  const s = playingState(seed)
  s.player.lane = playerLane
  s.spawn = { nymphs: [] }
  s.bullets = []
  s.enemies = enemies
  return s
}

// Did any enemy fire during this step? (reads the AC8 event channel)
function firedThisStep(s: GameState): boolean {
  return s.events.some((e) => e.type === 'enemy-fire')
}

describe('eligible enemies fire energy bolts (AC1, AC5)', () => {
  it('a tanker fires a bolt within ~2.5s', () => {
    let s = fireBoard(1, [makeEnemy('tanker', 4, 0.5, levelParams(1), 'flipper')])
    let fired = false
    for (let i = 0; i < 150 && !fired; i++) {
      s = stepGame(s, NEUTRAL, DT)
      if (firedThisStep(s)) fired = true
    }
    expect(fired, 'an eligible tanker should fire at least one bolt').toBe(true)
  })

  it('a flipper fires a bolt within ~2.5s', () => {
    // Built on wave 1's params, so its CAM program is NOJUMP (CAMWAV[0]) — climb,
    // yield, repeat, with no VJUMPS in it. It therefore never goes "mid-flip" (a fire
    // gate) and never wanders onto the player's lane, which is what this fixture needs.
    // (This used to be spelled `flipTimer: 999`; tp1-4 deleted that field — a flipper's
    // cadence is its wave's program now, not a timer.)
    let s = fireBoard(2, [makeEnemy('flipper', 4, 0.4, levelParams(1))])
    let fired = false
    for (let i = 0; i < 150 && !fired; i++) {
      s = stepGame(s, NEUTRAL, DT)
      if (firedThisStep(s)) fired = true
    }
    expect(fired, 'an eligible flipper should fire at least one bolt').toBe(true)
  })

  it('a spiker fires a bolt within ~2.5s', () => {
    // A spiker oscillates within [.., 0.75]; from 0.5 it stays well past the
    // along-eligibility depth for the whole window.
    let s = fireBoard(3, [makeEnemy('spiker', 4, 0.5, levelParams(1))])
    let fired = false
    for (let i = 0; i < 150 && !fired; i++) {
      s = stepGame(s, NEUTRAL, DT)
      if (firedThisStep(s)) fired = true
    }
    expect(fired, 'an eligible spiker should fire at least one bolt').toBe(true)
  })

  it('fuseballs never fire — positive control: the tanker beside it does', () => {
    let s = fireBoard(1, [
      { ...makeEnemy('fuseball', 4, 0.3, levelParams(1)), jitterTimer: 0, vulnerable: false },
      makeEnemy('tanker', 8, 0.4, levelParams(1), 'flipper'),
    ])
    const fireLanes = new Set<number>()
    for (let i = 0; i < 130; i++) {
      s = stepGame(s, NEUTRAL, DT)
      for (const e of s.events) if (e.type === 'enemy-fire') fireLanes.add(e.lane)
    }
    expect(fireLanes.has(8), 'tanker (lane 8) must fire — proves the window is long enough').toBe(true)
    expect(fireLanes.has(4), 'fuseball (lane 4) must never fire a bolt').toBe(false)
  })

  it('pulsars do not fire below level 60 — positive control: the tanker does', () => {
    let s = fireBoard(1, [
      { ...makeEnemy('pulsar', 4, 0.3, levelParams(1)), pulsing: false },
      makeEnemy('tanker', 8, 0.4, levelParams(1), 'flipper'),
    ]) // playingState() starts at level 1
    const fireLanes = new Set<number>()
    for (let i = 0; i < 130; i++) {
      s = stepGame(s, NEUTRAL, DT)
      for (const e of s.events) if (e.type === 'enemy-fire') fireLanes.add(e.lane)
    }
    expect(fireLanes.has(8), 'tanker (lane 8) must fire — proves the window is long enough').toBe(true)
    expect(fireLanes.has(4), 'pulsar (lane 4) must not fire at level 1').toBe(false)
  })
})

describe('enemy-fire SFX hook (AC8)', () => {
  it('emits an enemy-fire event carrying the firing lane and a numeric depth', () => {
    let s = fireBoard(1, [makeEnemy('tanker', 4, 0.5, levelParams(1), 'flipper')])
    let ev: GameState['events'][number] | undefined
    for (let i = 0; i < 150 && !ev; i++) {
      s = stepGame(s, NEUTRAL, DT)
      ev = s.events.find((e) => e.type === 'enemy-fire')
    }
    expect(ev, 'an enemy-fire event should accompany a spawned bolt').toBeDefined()
    if (ev && ev.type === 'enemy-fire') {
      expect(ev.lane).toBe(4)
      expect(typeof ev.depth).toBe('number')
    }
  })
})

describe('concurrent enemy bolts are capped (AC3, self-limiting)', () => {
  it('never exceeds 4 in flight, and saturates to the cap under pressure', () => {
    // 11 eager tankers (player parked on lane 15). They start low enough that none
    // reach the split depth (0.9) within the window, so all stay eligible shooters.
    const enemies: GameState['enemies'] = []
    for (let lane = 0; lane <= 10; lane++) {
      enemies.push(makeEnemy('tanker', lane, 0.35, levelParams(1), 'flipper'))
    }
    let s = fireBoard(5, enemies, 15)

    let max = 0
    let peak = 0
    for (let i = 0; i < 220; i++) {
      s = stepGame(s, NEUTRAL, DT)
      max = Math.max(max, s.enemyBullets.length)
      peak = Math.max(peak, s.enemyBullets.length)
    }
    expect(max, 'concurrent enemy bolts must never exceed the n_enemy_bullets cap').toBeLessThanOrEqual(4)
    expect(peak, 'under heavy pressure the in-flight count should reach the cap').toBe(4)
  })
})

describe('enemy firing is deterministic (AC7)', () => {
  it('produces an identical bolt set for a fixed seed and input stream', () => {
    const run = (): Array<{ lane: number; depth: number }> => {
      let s = fireBoard(7, [
        makeEnemy('tanker', 2, 0.4, levelParams(1), 'flipper'),
        makeEnemy('tanker', 6, 0.4, levelParams(1), 'flipper'),
        makeEnemy('tanker', 10, 0.4, levelParams(1), 'flipper'),
      ])
      for (let i = 0; i < 90; i++) s = stepGame(s, NEUTRAL, DT)
      return s.enemyBullets.map((b) => ({ lane: b.lane, depth: b.depth }))
    }
    expect(run()).toEqual(run())
  })
})
