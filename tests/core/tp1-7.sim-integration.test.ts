// tests/core/tp1-7.sim-integration.test.ts
//
// RED suite for tp1-7 — the tables are not just DEFINED, they are CONSUMED. A transcription
// that no code reads is dead data. Two consumers are new work for this story and are not
// covered by the direct-function suites:
//
//   1. PRE-SEEDED SPIKES (W-037, sim.ts). INIENE stamps NWTELI into every enemy line at wave
//      start; our advanceLevel does `s.spikes = new Array(laneCount).fill(0)`. From wave 4 the
//      well must OPEN with a spike on every lane. Driven through the real clear->warp->arrive
//      path so it exercises the wave-init code, not a unit stub.
//
//   2. PER-WAVE ENEMY-BOLT CAP (W-019/DA-002, sim.ts). The fire loop breaks at a flat
//      MAX_ENEMY_BULLETS=4; the arcade allows only WCHAMX+1 = 2 at wave 1. Proven by putting a
//      board under heavy fire pressure and watching the in-flight count saturate to the WAVE'S
//      cap, through stepGame — not by reading the constant.
import { describe, it, expect } from 'vitest'
import { playingState } from './helpers'
import type { GameState } from '../../src/core/state'
import { stepGame, makeEnemy } from '../../src/core/sim'
import { Input } from '../../src/core/input'
import { tubeForLevel } from '../../src/core/geometry'
import { enemyBoltCapForLevel, initialSpikeHeightForLevel, levelParams } from '../../src/core/rules'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }
const DT = 1 / 60

// Freshly-cleared board at `level` (mirrors sim.advance-level.test.ts): empty budget, no
// enemies, tube/spikes sized to this level, player parked out of the way.
function clearedAtLevel(level: number, playerLane = 0): GameState {
  const tube = tubeForLevel(level)
  const s = playingState(1)
  s.level = level
  s.tube = tube
  s.spikes = new Array(tube.laneCount).fill(0)
  s.player.lane = playerLane
  s.spawn = { nymphs: [] }
  s.enemies = []
  return s
}

// Clear -> warp -> arrive. Returns the post-warp 'playing' state at level+1.
function transition(fromLevel: number, playerLane = 0): GameState {
  let s = stepGame(clearedAtLevel(fromLevel, playerLane), NEUTRAL, DT)
  for (let i = 0; i < 1000 && s.mode === 'warp'; i++) s = stepGame(s, NEUTRAL, DT)
  return s
}

describe('tp1-7 — the well OPENS with pre-seeded spikes from wave 4 (W-037)', () => {
  it('wave 1 starts clean — every lane at height 0', () => {
    const s = playingState(7)
    expect(s.level).toBe(1)
    expect(s.spikes.every((h) => h === 0)).toBe(true)
  })

  it('arriving at wave 4 seeds EVERY lane with the TELIHI height, not a clean fill(0)', () => {
    const out = transition(3)
    expect(out.level).toBe(4)
    const seed = initialSpikeHeightForLevel(4)
    expect(seed).toBeGreaterThan(0) // sanity: the story is meaningless if this is 0
    expect(out.spikes.length).toBe(out.tube.laneCount)
    for (let lane = 0; lane < out.spikes.length; lane++) {
      expect(out.spikes[lane], `lane ${lane} on wave 4`).toBeCloseTo(seed, 9)
    }
  })

  it('arriving at wave 2 or 3 is still clean (TELIHI bytes 0,0 for those indices)', () => {
    for (const from of [1, 2]) {
      const out = transition(from)
      expect(out.level).toBe(from + 1)
      expect(out.spikes.every((h) => h === 0), `wave ${from + 1} must be clean`).toBe(true)
    }
  })
})

describe('tp1-7 — the enemy-bolt cap that gates fire is the WAVE\'S cap (W-019/DA-002)', () => {
  // Heavy fire pressure: eleven eager tankers parked low (0.35) so none reaches the split
  // depth within the window, player far away so bolts expire instead of ending the test.
  function saturate(level: number): number {
    const enemies: GameState['enemies'] = []
    for (let lane = 0; lane <= 10; lane++) {
      enemies.push(makeEnemy('tanker', lane % tubeForLevel(level).laneCount, 0.35, levelParams(level), 'flipper'))
    }
    const s0 = clearedAtLevel(level, tubeForLevel(level).laneCount - 1)
    let s = { ...s0, enemies }
    let peak = 0
    for (let i = 0; i < 300; i++) {
      s = stepGame(s, NEUTRAL, DT)
      peak = Math.max(peak, s.enemyBullets.length)
    }
    return peak
  }

  it('wave 1 saturates at TWO bolts in flight — not the flat four', () => {
    // The whole of DA-002/W-019: MAX_ENEMY_BULLETS=4 doubles the arcade's wave-1 bolt
    // pressure. WCHAMX+1 = 2 at wave 1.
    const peak = saturate(1)
    expect(enemyBoltCapForLevel(1)).toBe(2)
    expect(peak, 'wave-1 in-flight bolts must never exceed the WCHAMX+1 cap of 2').toBeLessThanOrEqual(2)
    expect(peak, 'under pressure the wave-1 board should reach its cap of 2').toBe(2)
  })

  it('wave 5 saturates at FOUR — the cap really is per-wave, not a constant', () => {
    const peak = saturate(5)
    expect(enemyBoltCapForLevel(5)).toBe(4)
    expect(peak).toBeLessThanOrEqual(4)
    expect(peak).toBe(4)
  })
})
