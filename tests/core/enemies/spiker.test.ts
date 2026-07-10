import { describe, it, expect } from 'vitest'
import { stepSpiker } from '../../../src/core/enemies/spiker'
import { levelParams, SPIKER_TURNAROUND_DEPTH } from '../../../src/core/rules'

const params = levelParams(1)

describe('stepSpiker', () => {
  it('climbs while direction is +1', () => {
    const out = stepSpiker({ kind: 'spiker', lane: 5, depth: 0.2, direction: 1 }, 1 / 60, params)
    expect(out.enemy.depth).toBeCloseTo(0.2 + params.spikerSpeed / 60)
  })

  it('reverses to descending at the $20 near-turnaround (story 6-15)', () => {
    const out = stepSpiker({ kind: 'spiker', lane: 5, depth: SPIKER_TURNAROUND_DEPTH - 0.001, direction: 1 }, 1, params)
    expect(out.enemy.depth).toBe(SPIKER_TURNAROUND_DEPTH)
    expect(out.enemy.direction).toBe(-1)
  })

  it('reverses to climbing at the far end', () => {
    const out = stepSpiker({ kind: 'spiker', lane: 5, depth: 0.0001, direction: -1 }, 1, params)
    expect(out.enemy.depth).toBe(0)
    expect(out.enemy.direction).toBe(1)
  })
})
