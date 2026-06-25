// tests/core/enemies/flipper.flip.test.ts
import { describe, it, expect } from 'vitest'
import { stepFlipper } from '../../../src/core/enemies/flipper'
import { levelParams } from '../../../src/core/rules'
import { makeRng } from '../../../src/core/rng'
import { makeCircleTube } from '../../../src/core/geometry'

const tube = makeCircleTube(16, { x: 0, y: 0 }, 60, 300)
const params = levelParams(1)

describe('stepFlipper flipping', () => {
  it('flips to an adjacent lane when the flip timer elapses', () => {
    const enemy = { kind: 'flipper' as const, lane: 5, depth: 0.5, flipTimer: 0.001 }
    const out = stepFlipper(enemy, 1 / 60, params, tube, makeRng(1))
    expect(Math.abs(out.enemy.lane - 5)).toBe(1) // moved to lane 4 or 6
    expect(out.enemy.flipTimer).toBeCloseTo(params.flipInterval)
  })

  it('does not flip before the timer elapses', () => {
    const enemy = { kind: 'flipper' as const, lane: 5, depth: 0.5, flipTimer: 1 }
    const out = stepFlipper(enemy, 1 / 60, params, tube, makeRng(1))
    expect(out.enemy.lane).toBe(5)
  })

  it('wraps around the closed tube when flipping past the edge', () => {
    const enemy = { kind: 'flipper' as const, lane: 0, depth: 0.5, flipTimer: 0.001 }
    const out = stepFlipper(enemy, 1 / 60, params, tube, makeRng(99))
    expect([1, 15]).toContain(out.enemy.lane)
  })

  it('is deterministic: same RNG seed → same flip direction', () => {
    const enemy = { kind: 'flipper' as const, lane: 8, depth: 0.5, flipTimer: 0.001 }
    const a = stepFlipper(enemy, 1 / 60, params, tube, makeRng(7))
    const b = stepFlipper(enemy, 1 / 60, params, tube, makeRng(7))
    expect(a.enemy.lane).toBe(b.enemy.lane)
  })

  it('advances the RNG when it flips', () => {
    const enemy = { kind: 'flipper' as const, lane: 8, depth: 0.5, flipTimer: 0.001 }
    const rng = makeRng(7)
    const out = stepFlipper(enemy, 1 / 60, params, tube, rng)
    expect(out.rng.s).not.toBe(rng.s)
  })
})
