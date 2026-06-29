// tests/core/sim.superzapper.test.ts
//
// Suite for the once-per-level Superzapper. Originally Story 4-1; Story 10-1
// corrects the FIRST press to the authentic 1981 behaviour:
//   full blast (first use)  → vaporise every NON-TANKER enemy AND clear every
//                             in-flight enemy bolt; TANKERS are SPARED, then 'used-once'
//   weak shot (second use)  → vaporise exactly ONE enemy (nearest the rim,
//                             ties broken by lowest index), then 'spent'
//   spent (third use+)      → no effect, until the next level
//   per-level reset         → startLevel refills the charge to 'full', so every
//                             level (including the post-warp one) begins armed
//
// Everything is observed through the public `stepGame` API.
//
// PARANOIA NOTES (why these tests are shaped the way they are):
//   1. AUTO-WARP TRAP. The instant a full blast empties the board, if there are
//      no enemies left to spawn (`spawn.remaining === 0`), `checkLevelClear`
//      flips the mode to 'warp' IN THE SAME STEP. A naive "blast, then blast
//      again" test would run the second zap in the 'warp' branch, where the
//      Superzapper never fires. So each state transition is set up explicitly
//      (mode reset to 'playing', enemies repopulated) and asserted in isolation.
//      Sparing tankers is also what lets a mixed board survive the first press,
//      so the bolt-clearing assertions run on a board that does NOT auto-warp.
//   2. SPARED-TANKER REFIRE TRAP (Story 10-1). The PLAY order runs the zap
//      BEFORE enemy-fire, so a tanker that survives the blast could loose a
//      FRESH bolt in the very same step and muddy a "bolts cleared" assertion.
//      Surviving tankers are therefore parked at `fireCooldown: 999` in the
//      bolt tests so the only bolts observed are the ones the zap should clear.
//   3. DECLAW (Story 10-1). The first press no longer kills tankers, so the
//      "no tanker split" guard moved to the WEAK shot: a zap kill of a tanker
//      must NOT release its cargo (one tanker scored, no child spawned).
//   4. DETERMINISM. Targeting uses no RNG and no time: the nearest-the-rim pick
//      is `max depth, ties → lowest index`. Identical inputs must produce
//      identical output, and the step must not mutate its input argument.
import { describe, it, expect } from 'vitest'
import { initialState } from '../../src/core/state'
import type { GameState, Enemy, EnemyBullet } from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { Input } from '../../src/core/input'
import { SCORE_FLIPPER, SCORE_TANKER, SCORE_PULSAR } from '../../src/core/rules'

const DT = 1 / 60
const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }
const ZAP: Input = { spin: 0, fire: false, zap: true, start: false }

// A fresh, in-progress level holding exactly `enemies` and nothing pending:
// `spawn.remaining = 0` (board is the whole level) and a parked spawn timer so
// no stray enemy materialises mid-step and skews a count. The Superzapper takes
// its starting value from `initialState` ('full' once the field exists).
function playing(enemies: Enemy[]): GameState {
  const s = initialState(1)
  s.mode = 'playing'
  s.spawn = { remaining: 0, timer: 999 }
  s.enemies = enemies
  return s
}

// flipTimer is parked at 999 so no enemy flips lanes during a step — lane is a
// stable identity we can assert against after the Superzapper picks a target.
const threeFlippers = (): Enemy[] => [
  { kind: 'flipper', lane: 1, depth: 0.2, flipTimer: 999 },
  { kind: 'flipper', lane: 5, depth: 0.6, flipTimer: 999 },
  { kind: 'flipper', lane: 9, depth: 0.9, flipTimer: 999 },
]

// A board of "must-die" enemies (2 flippers + 1 pulsar) plus a tanker that must
// SURVIVE the first press (Story 10-1). The tanker is parked at fireCooldown 999
// so it cannot loose a fresh bolt in the same step and skew a bolt-clear assert.
const mixedBoard = (): Enemy[] => [
  { kind: 'flipper', lane: 1, depth: 0.3, flipTimer: 999 },
  { kind: 'tanker', lane: 3, depth: 0.5, contains: 'flipper', fireCooldown: 999 },
  { kind: 'pulsar', lane: 5, depth: 0.6, flipTimer: 999, pulseTimer: 999, pulsing: false },
  { kind: 'flipper', lane: 8, depth: 0.2, flipTimer: 999 },
]

// Two enemy bolts in flight on lanes clear of the player (lane 0), so only the
// Superzapper — not a player-collision — can remove them.
const twoBolts = (): EnemyBullet[] => [
  { lane: 2, depth: 0.4 },
  { lane: 7, depth: 0.6 },
]

describe('superzapper — arming and per-level reset', () => {
  it('a fresh level starts with a full superzapper', () => {
    const s = initialState(1)
    expect(s.player.superzapper).toBe('full')
  })

  it('a neutral step leaves a full superzapper untouched (no charge bleed)', () => {
    const out = stepGame(playing(threeFlippers()), NEUTRAL, DT)
    expect(out.player.superzapper).toBe('full')
    expect(out.enemies).toHaveLength(3)
  })

  it('refills to full when the next level starts (after the warp)', () => {
    // Stand in the shoes of a level whose Superzapper was already used once.
    const s = playing([])
    s.player.superzapper = 'used-once'
    expect(s.player.superzapper).toBe('used-once') // precondition, not the driver

    // Empty board + empty budget → the level clears, enters the warp, and the
    // warp runs to completion on neutral input (no spikes to crash on).
    let out = stepGame(s, NEUTRAL, DT)
    for (let i = 0; i < 500 && out.mode !== 'playing'; i++) out = stepGame(out, NEUTRAL, DT)

    expect(out.mode).toBe('playing')
    expect(out.level).toBe(2)
    expect(out.player.superzapper).toBe('full') // startLevel must rearm it
  })
})

describe('superzapper — full blast (first activation)', () => {
  it('vaporises EVERY enemy on screen and becomes used-once', () => {
    const out = stepGame(playing(threeFlippers()), ZAP, DT)
    expect(out.enemies).toHaveLength(0)
    expect(out.player.superzapper).toBe('used-once')
  })

  it('awards score for every enemy vaporised', () => {
    const out = stepGame(playing(threeFlippers()), ZAP, DT)
    expect(out.score).toBe(SCORE_FLIPPER * 3)
  })

  it('spares a tanker (carrier) — the first press leaves it alive and unscored', () => {
    // Authentic 1981 behaviour (Story 10-1): the first press is a screen-clear
    // that SPARES tankers. A board of one tanker therefore survives the blast
    // intact — no kill, no child split, no score — while the charge still drops
    // to used-once. (A board of just the tanker does not auto-warp: it isn't empty.)
    const out = stepGame(playing([{ kind: 'tanker', lane: 3, depth: 0.5, contains: 'flipper' }]), ZAP, DT)
    expect(out.enemies).toHaveLength(1)
    expect(out.enemies[0].kind).toBe('tanker')
    expect(out.enemies[0].lane).toBe(3)
    expect(out.score).toBe(0)                  // spared, so nothing is scored
    expect(out.player.superzapper).toBe('used-once')
  })

  it('does not fire when the player is dead (charge preserved)', () => {
    const s = playing(threeFlippers())
    s.player.alive = false
    const out = stepGame(s, ZAP, DT)
    expect(out.enemies).toHaveLength(3)
    expect(out.player.superzapper).toBe('full')
  })
})

describe('superzapper — weak shot (second activation)', () => {
  it('destroys exactly ONE enemy — the one nearest the rim — and becomes spent', () => {
    const s = playing([
      { kind: 'flipper', lane: 2, depth: 0.3, flipTimer: 999 },
      { kind: 'flipper', lane: 7, depth: 0.8, flipTimer: 999 }, // deepest → nearest the rim
    ])
    s.player.superzapper = 'used-once'
    const out = stepGame(s, ZAP, DT)
    expect(out.enemies).toHaveLength(1)
    expect(out.enemies[0].lane).toBe(2)        // the deeper (0.8) one was vaporised
    expect(out.player.superzapper).toBe('spent')
  })

  it('awards the score of the single enemy it destroys', () => {
    const s = playing([
      { kind: 'flipper', lane: 2, depth: 0.3, flipTimer: 999 },
      { kind: 'flipper', lane: 7, depth: 0.8, flipTimer: 999 },
    ])
    s.player.superzapper = 'used-once'
    const out = stepGame(s, ZAP, DT)
    expect(out.score).toBe(SCORE_FLIPPER)      // one kill, not two
  })

  it('breaks a nearest-the-rim tie by destroying the LOWEST index', () => {
    const s = playing([
      { kind: 'flipper', lane: 4, depth: 0.5, flipTimer: 999 }, // index 0 — equal depth
      { kind: 'flipper', lane: 9, depth: 0.5, flipTimer: 999 }, // index 1 — equal depth
    ])
    s.player.superzapper = 'used-once'
    const out = stepGame(s, ZAP, DT)
    expect(out.enemies).toHaveLength(1)
    expect(out.enemies[0].lane).toBe(9)        // index 0 (lane 4) lost the tie
    expect(out.player.superzapper).toBe('spent')
  })
})

describe('superzapper — state machine + purity', () => {
  it('progresses full → used-once → spent across activations, then no-ops', () => {
    let s = playing([{ kind: 'flipper', lane: 1, depth: 0.5, flipTimer: 999 }])

    s = stepGame(s, ZAP, DT)               // full blast → used-once (board cleared)
    expect(s.player.superzapper).toBe('used-once')

    // Repopulate + force 'playing' — the cleared board would otherwise be in warp.
    s.enemies = [{ kind: 'flipper', lane: 2, depth: 0.5, flipTimer: 999 }]
    s.mode = 'playing'
    s = stepGame(s, ZAP, DT)               // weak shot → spent (one killed)
    expect(s.player.superzapper).toBe('spent')
    expect(s.enemies).toHaveLength(0)

    // A spent Superzapper must do nothing, no matter how many enemies appear.
    s.enemies = [
      { kind: 'flipper', lane: 3, depth: 0.4, flipTimer: 999 },
      { kind: 'flipper', lane: 8, depth: 0.5, flipTimer: 999 },
    ]
    s.mode = 'playing'
    const out = stepGame(s, ZAP, DT)       // spent → no effect
    expect(out.player.superzapper).toBe('spent')
    expect(out.enemies).toHaveLength(2)
  })

  it('does not mutate the input state when zapping (pure step)', () => {
    const s = playing(threeFlippers())
    const out = stepGame(s, ZAP, DT)
    // the returned state reflects the blast...
    expect(out.player.superzapper).toBe('used-once')
    expect(out.enemies).toHaveLength(0)
    // ...while the original argument is left exactly as it was
    expect(s.player.superzapper).toBe('full')
    expect(s.enemies).toHaveLength(3)
  })

  it('is deterministic — identical states + identical zap give identical output', () => {
    const a = stepGame(playing(threeFlippers()), ZAP, DT)
    const b = stepGame(playing(threeFlippers()), ZAP, DT)
    expect(a.player.superzapper).toBe('used-once')
    expect(b.player.superzapper).toBe(a.player.superzapper)
    expect(a.score).toBe(b.score)
    expect(a.enemies).toEqual(b.enemies)
  })
})

describe('superzapper — Story 10-1: first press spares tankers, clears bolts', () => {
  it('first press kills every non-tanker enemy but leaves tankers alive', () => {
    const out = stepGame(playing(mixedBoard()), ZAP, DT)
    expect(out.enemies).toHaveLength(1)        // only the tanker remains
    expect(out.enemies[0].kind).toBe('tanker')
    expect(out.enemies[0].lane).toBe(3)        // tankers climb straight — lane is stable
    expect(out.player.superzapper).toBe('used-once')
  })

  it('first press scores only the enemies it kills — the spared tanker is not scored', () => {
    const out = stepGame(playing(mixedBoard()), ZAP, DT)
    // 2 flippers (150 ea) + 1 pulsar (200); the tanker (100) survives, so unscored.
    expect(out.score).toBe(SCORE_FLIPPER * 2 + SCORE_PULSAR)
  })

  it('first press emits a death event per kill and none for the spared tanker', () => {
    const out = stepGame(playing(mixedBoard()), ZAP, DT)
    const deaths = out.events.filter((e) => e.type === 'enemy-death')
    expect(deaths).toHaveLength(3) // the two flippers + the pulsar
    expect(deaths.some((e) => e.type === 'enemy-death' && e.enemyType === 'tanker')).toBe(false)
  })

  it('first press clears every in-flight enemy bolt', () => {
    const s = playing(mixedBoard())
    s.enemyBullets = twoBolts()
    const out = stepGame(s, ZAP, DT)
    expect(out.enemyBullets).toHaveLength(0)
  })

  it('first press clears bolts even when the board is NOT emptied (only tankers remain)', () => {
    // Proves bolt-clearing is intrinsic to the first press — not a side effect of
    // an emptied board. The surviving tanker (fireCooldown 999) cannot refire.
    const s = playing([{ kind: 'tanker', lane: 4, depth: 0.5, contains: 'pulsar', fireCooldown: 999 }])
    s.enemyBullets = twoBolts()
    const out = stepGame(s, ZAP, DT)
    expect(out.enemies).toHaveLength(1)
    expect(out.enemies[0].kind).toBe('tanker')
    expect(out.enemyBullets).toHaveLength(0)
    expect(out.player.superzapper).toBe('used-once')
  })

  it('first press clears in-flight bolts even with NO enemies on the board', () => {
    // An enemy can fire then die, leaving a lethal bolt with nothing left to kill.
    // The first press is a screen-clear, so the bolt must still go (this exercises
    // the no-enemies early-return path, distinct from the enemies-present branch).
    const s = playing([])
    s.enemyBullets = twoBolts()
    const out = stepGame(s, ZAP, DT)
    expect(out.enemyBullets).toHaveLength(0)
    expect(out.player.superzapper).toBe('used-once') // the charge is still consumed
  })

  it('second press still kills exactly one enemy — the one nearest the rim (no regression)', () => {
    // After a first press the board is tankers-only; the weak shot takes one — the
    // deepest (nearest the rim). fireCooldown 999 keeps the survivor from refiring.
    const s = playing([
      { kind: 'tanker', lane: 2, depth: 0.3, contains: 'flipper', fireCooldown: 999 },
      { kind: 'tanker', lane: 7, depth: 0.8, contains: 'flipper', fireCooldown: 999 }, // deepest
    ])
    s.player.superzapper = 'used-once'
    const out = stepGame(s, ZAP, DT)
    expect(out.enemies).toHaveLength(1)
    expect(out.enemies[0].lane).toBe(2)        // the lane-7 tanker (0.8) was vaporised
    expect(out.player.superzapper).toBe('spent')
  })

  it('a zap kill never releases tanker cargo (declaw preserved)', () => {
    // The weak shot kills a tanker outright — no flipper child spawned, and the
    // score is a single tanker (100), not the two children a bullet split makes.
    const s = playing([{ kind: 'tanker', lane: 5, depth: 0.8, contains: 'flipper' }])
    s.player.superzapper = 'used-once'
    const out = stepGame(s, ZAP, DT)
    expect(out.enemies).toHaveLength(0)        // killed, no child left behind
    expect(out.score).toBe(SCORE_TANKER)       // one tanker, not two flippers
    expect(out.player.superzapper).toBe('spent')
  })

  it('second press does NOT clear in-flight bolts — only the first press does', () => {
    // Pins the minimal change: bolt-clearing belongs to the FIRST press alone.
    const s = playing([
      { kind: 'tanker', lane: 2, depth: 0.3, contains: 'flipper', fireCooldown: 999 },
      { kind: 'tanker', lane: 7, depth: 0.8, contains: 'flipper', fireCooldown: 999 },
    ])
    s.player.superzapper = 'used-once'
    s.enemyBullets = [{ lane: 5, depth: 0.4 }]
    const out = stepGame(s, ZAP, DT)
    expect(out.enemyBullets).toHaveLength(1)   // weak shot leaves the bolt in flight
  })

  it('first press is deterministic — identical board + zap give identical output', () => {
    const a = stepGame(playing(mixedBoard()), ZAP, DT)
    const b = stepGame(playing(mixedBoard()), ZAP, DT)
    expect(a.enemies).toEqual(b.enemies)
    expect(a.score).toBe(b.score)
    expect(a.enemyBullets).toEqual(b.enemyBullets)
  })

  it('first press does not mutate the input state (pure step)', () => {
    const s = playing(mixedBoard())
    s.enemyBullets = twoBolts()
    const out = stepGame(s, ZAP, DT)
    // the returned state reflects the blast (tanker spared, bolts cleared)...
    expect(out.enemies).toHaveLength(1)
    expect(out.enemyBullets).toHaveLength(0)
    // ...while the original argument is left exactly as it was
    expect(s.enemies).toHaveLength(4)
    expect(s.enemyBullets).toHaveLength(2)
  })
})
