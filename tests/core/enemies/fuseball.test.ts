import { describe, it, expect } from 'vitest'
import { playingState } from '../helpers'
import { stepGame } from '../../../src/core/sim'
import { Input } from '../../../src/core/input'
import { stepFuseball } from '../../../src/core/enemies/fuseball'
import { levelParams } from '../../../src/core/rules'
import { createRng } from '@arcade/shared/rng'
import { makeCircleTube } from '../../../src/core/geometry'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }
const tube = makeCircleTube(16, { x: 0, y: 0 }, 60, 300)
const params = levelParams(1)

describe('stepFuseball', () => {
  it('climbs toward the rim', () => {
    const out = stepFuseball({ kind: 'fuseball', lane: 8, depth: 0.2, jitterTimer: 999, vulnerable: false }, 1 / 60, params, tube, createRng(1), 8)
    expect(out.enemy.depth).toBeCloseTo(0.2 + params.fuseballSpeed / 60)
  })

  it('on a jitter it slides toward the player, never away (story 6-15)', () => {
    // The fuzz_move gate may skip the step, but it never reverses direction:
    // with the player one lane up (9), the fuseball ends on 8 (stayed) or 9
    // (slid toward) — never 7. Full steering coverage: sim.enemy-motion-fidelity.
    const out = stepFuseball({ kind: 'fuseball', lane: 8, depth: 0.5, jitterTimer: 0.001, vulnerable: false }, 1 / 60, params, tube, createRng(1), 9)
    expect([8, 9]).toContain(out.enemy.lane)
  })

  it('is deterministic for a given seed', () => {
    const a = stepFuseball({ kind: 'fuseball', lane: 8, depth: 0.5, jitterTimer: 0.001, vulnerable: false }, 1 / 60, params, tube, createRng(7), 12)
    const b = stepFuseball({ kind: 'fuseball', lane: 8, depth: 0.5, jitterTimer: 0.001, vulnerable: false }, 1 / 60, params, tube, createRng(7), 12)
    expect(a.enemy.lane).toBe(b.enemy.lane)
  })
})

describe('fuseball at the rim', () => {
  it('grabs the player on its lane (lethal contact)', () => {
    const s = playingState(1)
    s.spawn.remaining = 0
    s.player.lane = 3
    s.enemies = [{ kind: 'fuseball', lane: 3, depth: 0.95, jitterTimer: 999, vulnerable: false }]
    const out = stepGame(s, NEUTRAL, 1 / 60)
    expect(out.mode).toBe('dying')
  })
})
