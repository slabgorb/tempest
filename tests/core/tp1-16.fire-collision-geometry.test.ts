// tests/core/tp1-16.fire-collision-geometry.test.ts
//
// Story tp1-16: FIRE & COLLISION GEOMETRY. Three CONFIRMED divergences from
// Theurer's 1981 source, verified line-by-line against ALWELG.MAC:
//
//   W-001  Tick order. PLAY runs ...MOVINV, MOVCHA, FIREIC, COLLIS (865-874):
//          ALL charges move AFTER the invaders, and enemy charges are FIRED
//          only AFTER the charges have moved — so a newly launched bolt sits
//          still for its birth frame. We move player bullets before enemies and
//          move a new bolt on the very frame it is born.
//
//   W-021  The enemy-fire depth gate. FIREIC's ONLY positional gate is
//          `CMP INVAY, ILINLIY+$20` / `IFCS` (2694-95): the invader must be at
//          least $20 below the rim (INVAY >= $30 -> depth <= (0xF0-0x30)/224 =
//          192/224 = 0.857). There is NO far-end minimum: a spawn at the base of
//          the well may fire at once. We invented ENEMY_FIRE_MIN_DEPTH = 0.1875
//          (silencing fresh spawns) and capped at 0.9 instead of 0.857.
//
//   W-046  The bullet/enemy hit tolerance is ENSIZE (COLCHK, 2963-64), indexed by
//          invader TYPE. Fuseball = <PCVELO+3>/2 = 6 along-units (a FIXED value,
//          545-46). Flipper/tanker/pulsar = TIMES8 of the wave's invader speed =
//          ((255-hi)+13)>>1 = 7 at waves 1-16, 8 at waves 33+ (570-77). In depth
//          units (224 along = 1.0): 6/224 and 7/224. Ours were 0.06 and 0.09 —
//          ~1.9x and ~3.3x too generous — AND our comment claimed the fuseball's
//          was WIDER; the source shows it is NARROWER (6 < 7).
//
// (W-030 — a tanker's children born at the parent's depth — is NOT tested here.
//  It was already remediated by tp1-24; see tests/core/tp1-24.split-child-depth.test.ts
//  and the `remediated_by` field on the finding.)
//
// Everything is seeded + dt-driven, so the whole suite is deterministic — the
// core-purity rule is what makes this testable.
//
// CONTRACT FOR DEV:
//   * Reorder stepPlaying so charges move AFTER invaders and enemy charges are
//     fired AFTER charges move (a new bolt does not advance on its birth frame).
//   * Delete ENEMY_FIRE_MIN_DEPTH and set the near cap to 192/224 (0.857).
//   * Add `enemyHitTolerance(kind, level): number` to src/core/rules.ts (depth
//     units) and USE it in resolveBulletHits instead of HIT_DEPTH/FUSEBALL_HIT_DEPTH.
import { describe, it, expect } from 'vitest'
import type { GameState, EnemyKind } from '../../src/core/state'
import { playingState } from './helpers'
import { stepGame, makeEnemy } from '../../src/core/sim'
import { Input } from '../../src/core/input'
import {
  levelParams,
  WARP_ALONG_SPAN,
  ENEMY_FIRE_MAX_DEPTH,
  enemyHitTolerance,
} from '../../src/core/rules'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }
const DT = 1 / 60

// The invented far-end floor we are deleting: ENEMY_FIRE_MIN_DEPTH = 0x30/0x100.
const OLD_FAR_END_FLOOR = 0x30 / 0x100 // 0.1875

// A 'playing' board that neither spawns nor clears; the player is parked away from
// the seeded enemies so bolts that reach the rim just expire instead of ending the
// test (mirrors sim.enemy-fire.test.ts's fixture).
function fireBoard(seed: number, enemies: GameState['enemies'], playerLane = 14): GameState {
  const s = playingState(seed)
  s.player.lane = playerLane
  s.spawn = { nymphs: [] }
  s.bullets = []
  s.enemies = enemies
  return s
}

// Step until an enemy fires and a bolt is added on that same frame. Returns the
// post-fire state and the fired bolt's birth depth (the enemy-fire event depth).
function runToFirstBolt(seed: number): { state: GameState; fireDepth: number; lane: number } {
  let s = fireBoard(seed, [makeEnemy('tanker', 4, 0.5, levelParams(1), 'flipper')])
  for (let i = 0; i < 200; i++) {
    const before = s.enemyBullets.length
    s = stepGame(s, NEUTRAL, DT)
    const ev = s.events.find((e) => e.type === 'enemy-fire')
    if (ev && ev.type === 'enemy-fire' && s.enemyBullets.length > before) {
      return { state: s, fireDepth: ev.depth, lane: ev.lane }
    }
  }
  throw new Error('no enemy bolt was fired within the window — fixture is broken')
}

describe('W-001 — tick order: a fired enemy bolt sits still on its birth frame', () => {
  // FIREIC runs AFTER MOVCHA, so the bolt is launched at the (already-moved)
  // invader's position and does NOT ride down the lane until the NEXT frame. Today
  // stepEnemyFire pushes the bolt and stepEnemyBullets advances it in the same tick.
  it('the bolt is born exactly at the firing invader position (has not advanced yet)', () => {
    const { state, fireDepth, lane } = runToFirstBolt(1)
    const bolt = state.enemyBullets.find((b) => b.lane === lane)
    expect(bolt, 'the newborn bolt should be on the firing lane').toBeDefined()
    // depth === the invader's along position at fire time. Currently it is
    // fireDepth + boltSpeed*dt, because the bolt moved on its birth frame.
    expect(bolt!.depth).toBeCloseTo(fireDepth, 6)
  })

  it('the same bolt DOES advance on the following frame (born still, not frozen)', () => {
    const { state, fireDepth, lane } = runToFirstBolt(1)
    const born = state.enemyBullets.find((b) => b.lane === lane)!
    const bornDepth = born.depth
    const next = stepGame(state, NEUTRAL, DT)
    const moved = next.enemyBullets.find((b) => b.lane === lane)
    expect(moved, 'the bolt should still be in flight next frame').toBeDefined()
    // Liveness: a born-still bolt must move the very next frame (rimward, depth up).
    expect(moved!.depth).toBeGreaterThan(bornDepth)
    // And on the birth frame it really had not moved past its origin.
    expect(bornDepth).toBeCloseTo(fireDepth, 6)
  })
})

describe('W-021 — the enemy-fire depth gate (no far-end floor; near cap = 192/224)', () => {
  it('a fresh invader at the base of the well fires without climbing past the invented floor', () => {
    // Tanker parked LOW, below the invented ENEMY_FIRE_MIN_DEPTH = 0.1875. FIREIC
    // has no far-end minimum, so it may fire straight away. Our floor silences it
    // until it has climbed above 0.1875, so today the FIRST fire lands far higher.
    let s = fireBoard(1, [makeEnemy('tanker', 4, 0.05, levelParams(1), 'flipper')])
    let firstFireDepth = Number.NaN
    for (let i = 0; i < 200 && Number.isNaN(firstFireDepth); i++) {
      s = stepGame(s, NEUTRAL, DT)
      const ev = s.events.find((e) => e.type === 'enemy-fire')
      if (ev && ev.type === 'enemy-fire') firstFireDepth = ev.depth
    }
    expect(Number.isNaN(firstFireDepth), 'the low tanker should fire at least once').toBe(false)
    // It fired while still well below the invented floor — proving no floor exists.
    expect(firstFireDepth).toBeLessThan(OLD_FAR_END_FLOOR)
  })

  it('the near-rim fire cap is the ROM’s 192/224 (INVAY >= $30), not 0.9', () => {
    // FIREIC fires only while INVAY >= ILINLIY+$20 = $30 -> depth <= (0xF0-0x30)/224.
    expect(ENEMY_FIRE_MAX_DEPTH).toBeCloseTo(192 / WARP_ALONG_SPAN, 5)
  })
})

describe('W-046 — bullet/enemy hit tolerance is ENSIZE, not ~2-3x too generous', () => {
  it('a flipper/tanker/pulsar tolerance is 7 along-units (7/224) at waves 1-16', () => {
    expect(enemyHitTolerance('flipper', 1)).toBeCloseTo(7 / WARP_ALONG_SPAN, 4)
    expect(enemyHitTolerance('flipper', 16)).toBeCloseTo(7 / WARP_ALONG_SPAN, 4)
    expect(enemyHitTolerance('tanker', 1)).toBeCloseTo(7 / WARP_ALONG_SPAN, 4)
    expect(enemyHitTolerance('pulsar', 1)).toBeCloseTo(7 / WARP_ALONG_SPAN, 4)
  })

  it('a fuseball tolerance is a FIXED 6 along-units (6/224), wave-independent', () => {
    expect(enemyHitTolerance('fuseball', 1)).toBeCloseTo(6 / WARP_ALONG_SPAN, 4)
    expect(enemyHitTolerance('fuseball', 40)).toBeCloseTo(6 / WARP_ALONG_SPAN, 4)
  })

  it('the fuseball tolerance is NARROWER than the flipper’s (our comment had it backwards)', () => {
    expect(enemyHitTolerance('fuseball', 1)).toBeLessThan(enemyHitTolerance('flipper', 1))
  })

  it('scales with closing speed: 8 along-units (8/224) by waves 33+', () => {
    // TIMES8 derives ENSIZE from the wave's invader speed; the finding pins 7 through
    // wave 16 and 8 from wave 33. We anchor those two waves only (17-32 is unstated).
    expect(enemyHitTolerance('flipper', 33)).toBeCloseTo(8 / WARP_ALONG_SPAN, 4)
    expect(enemyHitTolerance('flipper', 33)).toBeGreaterThan(enemyHitTolerance('flipper', 1))
  })

  it('returns a finite tolerance for every enemy kind (exhaustiveness — lang-review TS)', () => {
    // A switch on EnemyKind must end in default: assertNever; a new kind without a
    // case would surface here as a non-finite (undefined) return.
    const kinds: EnemyKind[] = ['flipper', 'tanker', 'spiker', 'fuseball', 'pulsar']
    for (const k of kinds) expect(Number.isFinite(enemyHitTolerance(k, 1))).toBe(true)
  })
})

describe('W-046 — the tolerance is actually wired into bullet↔enemy collision', () => {
  // A bullet placed just rimward of a flipper on its lane. After one frame both have
  // moved once (bullet ~0.019 rimward->baseward, flipper climbs a hair) before COLLIS,
  // so the depth gap at the check is ~gap - 0.02.
  function flipperKilledAtGap(gap: number): boolean {
    const s = playingState(1)
    s.spawn = { nymphs: [] }
    s.enemies = [makeEnemy('flipper', 4, 0.5, levelParams(1))]
    s.bullets = [{ lane: 4, depth: 0.5 + gap }]
    const out = stepGame(s, NEUTRAL, DT)
    return out.enemies.length === 0
  }

  it('still destroys a flipper at point-blank range', () => {
    expect(flipperKilledAtGap(0)).toBe(true)
  })

  it('no longer destroys a flipper across a gap the invented 0.06 tolerance reached', () => {
    // Start-gap 0.066 -> ~0.045 depth gap at COLLIS: inside the invented 0.06, but
    // well outside the ROM's 7/224 = 0.03125. Today this is a kill; it must become a miss.
    expect(flipperKilledAtGap(0.066)).toBe(false)
  })
})
