import { describe, it, expect } from 'vitest'
import { playingState } from '../helpers'
import { stepGame } from '../../../src/core/sim'
import { Input } from '../../../src/core/input'
import { stepFuseball } from '../../../src/core/enemies/fuseball'
import { levelParams } from '../../../src/core/rules'
import { makeRng } from '../../../src/core/rng'
import { makeCircleTube } from '../../../src/core/geometry'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }
const tube = makeCircleTube(16, { x: 0, y: 0 }, 60, 300)
const params = levelParams(1)

describe('stepFuseball', () => {
  it('climbs toward the rim', () => {
    const out = stepFuseball({ kind: 'fuseball', lane: 8, depth: 0.2, jitterTimer: 999, vulnerable: false }, 1 / 60, params, tube, makeRng(1))
    expect(out.enemy.depth).toBeCloseTo(0.2 + params.fuseballSpeed / 60)
  })

  it('hops to an adjacent lane when the jitter timer elapses', () => {
    const out = stepFuseball({ kind: 'fuseball', lane: 8, depth: 0.5, jitterTimer: 0.001, vulnerable: false }, 1 / 60, params, tube, makeRng(1))
    expect([7, 9]).toContain(out.enemy.lane)
  })

  it('is deterministic for a given seed', () => {
    const a = stepFuseball({ kind: 'fuseball', lane: 8, depth: 0.5, jitterTimer: 0.001, vulnerable: false }, 1 / 60, params, tube, makeRng(7))
    const b = stepFuseball({ kind: 'fuseball', lane: 8, depth: 0.5, jitterTimer: 0.001, vulnerable: false }, 1 / 60, params, tube, makeRng(7))
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
