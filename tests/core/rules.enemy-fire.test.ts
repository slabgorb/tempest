// tests/core/rules.enemy-fire.test.ts
//
// Story 6-5: the authentic rev-3 enemy-fire RULES expressed as pure, deterministic
// functions. These lock the ROM numbers the SM flagged as "must not drift":
//   * WHO may shoot (the shooter set)            -> enemyCanShoot(kind, level)
//   * the self-limiting per-live-bolt fire odds  -> enemyFireChance(liveBolts)
//   * the per-level refire holdoff               -> enemyFireHoldoffFrames(level)
//
// Pure functions are the right tool here: no RNG, no dt, no flaky frequency
// sampling. The exact table values are asserted directly, which is exactly the
// approach the SM assessment called for (pin the numbers, don't sample noisily).
//
// CONTRACT FOR DEV: add these three exports to src/core/rules.ts.
import { describe, it, expect } from 'vitest'
import {
  enemyCanShoot,
  enemyFireChance,
  enemyFireHoldoffFrames,
} from '../../src/core/rules'
import type { EnemyKind } from '../../src/core/state'

describe('enemyCanShoot — authentic rev-3 shooter set (AC5)', () => {
  // User decision 2026-06-27: match the LITERAL rev-3 code. Flippers, Tankers,
  // and Spikers carry the can-shoot bit at every level; Pulsars only L60+;
  // Fuseballs never.
  it('lets Flippers fire at every level', () => {
    expect(enemyCanShoot('flipper', 1)).toBe(true)
    expect(enemyCanShoot('flipper', 60)).toBe(true)
    expect(enemyCanShoot('flipper', 99)).toBe(true)
  })

  it('lets Tankers fire at every level', () => {
    expect(enemyCanShoot('tanker', 1)).toBe(true)
    expect(enemyCanShoot('tanker', 60)).toBe(true)
  })

  it('lets Spikers fire at every level', () => {
    expect(enemyCanShoot('spiker', 1)).toBe(true)
    expect(enemyCanShoot('spiker', 60)).toBe(true)
  })

  it('lets Pulsars fire only at level 60 and above', () => {
    expect(enemyCanShoot('pulsar', 1)).toBe(false)
    expect(enemyCanShoot('pulsar', 59)).toBe(false)
    expect(enemyCanShoot('pulsar', 60)).toBe(true)
    expect(enemyCanShoot('pulsar', 65)).toBe(true)
  })

  it('never lets Fuseballs fire, at any level', () => {
    expect(enemyCanShoot('fuseball', 1)).toBe(false)
    expect(enemyCanShoot('fuseball', 60)).toBe(false)
    expect(enemyCanShoot('fuseball', 99)).toBe(false)
  })

  // Exhaustiveness guard (lang-review TS #3): every EnemyKind must get a defined
  // boolean ruling — a newly added kind without a case would surface here as a
  // non-boolean (undefined) return.
  it('returns a boolean for every enemy kind', () => {
    const kinds: EnemyKind[] = ['flipper', 'tanker', 'spiker', 'fuseball', 'pulsar']
    for (const k of kinds) {
      expect(typeof enemyCanShoot(k, 1)).toBe('boolean')
    }
  })
})

describe('enemyFireChance — self-limiting per-live-bolt probability (AC4)', () => {
  // ROM threshold table indexed by the number of LIVE enemy bolts on screen:
  // 0 -> ~100%, 1 -> 12.5%, 2 -> 6.25%, 3 -> ~2.3%, 4 -> ~0.4%. The decay is the
  // whole self-limiting mechanism — more bolts already up => far less likely to
  // add another.
  it('fires almost certainly when no bolts are live', () => {
    expect(enemyFireChance(0)).toBeGreaterThanOrEqual(0.99)
    expect(enemyFireChance(0)).toBeLessThanOrEqual(1)
  })

  it('matches the authentic 1/8 and 1/16 ratios for one and two live bolts', () => {
    expect(enemyFireChance(1)).toBeCloseTo(0.125, 3)
    expect(enemyFireChance(2)).toBeCloseTo(0.0625, 3)
  })

  it('approximates the rev-3 tail for three and four live bolts', () => {
    expect(enemyFireChance(3)).toBeCloseTo(0.023, 2)
    expect(enemyFireChance(4)).toBeCloseTo(0.004, 2)
  })

  it('is strictly self-limiting: each extra live bolt lowers the chance', () => {
    const chances = [0, 1, 2, 3, 4].map((n) => enemyFireChance(n))
    for (let i = 1; i < chances.length; i++) {
      expect(chances[i]).toBeLessThan(chances[i - 1])
    }
  })
})

describe('enemyFireHoldoffFrames — per-level refire holdoff (AC4)', () => {
  // shot_holdoff (60 Hz frames): L1 80, L20 23, L21-64 20, L65+ 10. The deeper
  // the level, the faster an enemy may refire.
  it('matches the authentic anchor points', () => {
    expect(enemyFireHoldoffFrames(1)).toBe(80)
    expect(enemyFireHoldoffFrames(20)).toBe(23)
    expect(enemyFireHoldoffFrames(21)).toBe(20)
    expect(enemyFireHoldoffFrames(64)).toBe(20)
    expect(enemyFireHoldoffFrames(65)).toBe(10)
    expect(enemyFireHoldoffFrames(100)).toBe(10)
  })

  it('never increases as the level climbs (faster refire deeper in)', () => {
    let prev = enemyFireHoldoffFrames(1)
    for (let lvl = 2; lvl <= 100; lvl++) {
      const cur = enemyFireHoldoffFrames(lvl)
      expect(cur).toBeLessThanOrEqual(prev)
      prev = cur
    }
  })
})
