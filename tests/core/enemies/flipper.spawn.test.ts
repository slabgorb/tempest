// tests/core/enemies/flipper.spawn.test.ts
import { describe, it, expect } from 'vitest'
import { initialState } from '../../../src/core/state'
import { stepGame } from '../../../src/core/sim'
import { Input } from '../../../src/core/input'
import { stepFlipper } from '../../../src/core/enemies/flipper'
import { levelParams } from '../../../src/core/rules'
import { makeRng } from '../../../src/core/rng'
import { makeCircleTube } from '../../../src/core/geometry'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }

function run(steps: number) {
  let s = initialState(1)
  for (let i = 0; i < steps; i++) s = stepGame(s, NEUTRAL, 1 / 60)
  return s
}

describe('flipper spawning', () => {
  it('spawns flippers from the budget over time', () => {
    const s = run(200)
    expect(s.enemies.length).toBeGreaterThan(0)
    expect(s.enemies.every((e) => e.kind === 'flipper')).toBe(true)
    expect(s.spawn.remaining).toBeLessThan(levelParams(1).enemyCount)
  })

  it('never spawns more than the level budget', () => {
    const s = run(3000)
    const total = s.enemies.length + s.spawn.remaining
    // total spawned + remaining + killed should not exceed the current level's
    // budget; with no shooting, killed = 0, so spawned ≤ enemyCount.
    // The level may have advanced if all enemies were cleared.
    expect(total).toBeLessThanOrEqual(levelParams(s.level).enemyCount)
  })
})

describe('stepFlipper climb', () => {
  it('increases depth toward the near rim', () => {
    const tube = makeCircleTube(16, { x: 0, y: 0 }, 60, 300)
    const params = levelParams(1)
    const enemy = { kind: 'flipper' as const, lane: 3, depth: 0, flipTimer: 999 }
    const out = stepFlipper(enemy, 1 / 60, params, tube, makeRng(1))
    expect(out.enemy.depth).toBeCloseTo(params.flipperSpeed / 60)
  })

  it('clamps depth at 1', () => {
    const tube = makeCircleTube(16, { x: 0, y: 0 }, 60, 300)
    const params = levelParams(1)
    const enemy = { kind: 'flipper' as const, lane: 3, depth: 0.999, flipTimer: 999 }
    const out = stepFlipper(enemy, 1, params, tube, makeRng(1))
    expect(out.enemy.depth).toBe(1)
  })
})
