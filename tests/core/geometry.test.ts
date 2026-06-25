// tests/core/geometry.test.ts
import { describe, it, expect } from 'vitest'
import {
  makeCircleTube, wrapLane, currentLane, laneCenterFar, laneCenterNear, project, Tube,
} from '../../src/core/geometry'

describe('makeCircleTube', () => {
  it('builds laneCount boundary points on each rim and is closed', () => {
    const t = makeCircleTube(16, { x: 0, y: 0 }, 60, 300)
    expect(t.laneCount).toBe(16)
    expect(t.closed).toBe(true)
    expect(t.far).toHaveLength(16)
    expect(t.near).toHaveLength(16)
  })
})

describe('wrapLane (closed tube)', () => {
  const t = makeCircleTube(16, { x: 0, y: 0 }, 60, 300)
  it('wraps overflow', () => { expect(wrapLane(t, 16)).toBe(0) })
  it('wraps negatives', () => { expect(wrapLane(t, -1)).toBe(15) })
  it('leaves in-range lanes alone', () => { expect(wrapLane(t, 5)).toBe(5) })
})

describe('wrapLane (open tube)', () => {
  const open: Tube = { laneCount: 4, closed: false, far: [], near: [] }
  it('clamps below 0', () => { expect(wrapLane(open, -2)).toBe(0) })
  it('clamps above laneCount-1', () => { expect(wrapLane(open, 9)).toBe(3) })
})

describe('currentLane', () => {
  const t = makeCircleTube(16, { x: 0, y: 0 }, 60, 300)
  it('rounds then wraps', () => {
    expect(currentLane(t, 0.4)).toBe(0)
    expect(currentLane(t, 15.6)).toBe(0)
    expect(currentLane(t, 2.5)).toBe(3)
  })
})

describe('project', () => {
  const t = makeCircleTube(16, { x: 0, y: 0 }, 60, 300)
  it('depth 0 equals the far lane center', () => {
    expect(project(t, 3, 0)).toEqual(laneCenterFar(t, 3))
  })
  it('depth 1 equals the near lane center', () => {
    expect(project(t, 3, 1)).toEqual(laneCenterNear(t, 3))
  })
  it('depth 0.5 is the midpoint', () => {
    const f = laneCenterFar(t, 3)
    const n = laneCenterNear(t, 3)
    const p = project(t, 3, 0.5)
    expect(p.x).toBeCloseTo((f.x + n.x) / 2)
    expect(p.y).toBeCloseTo((f.y + n.y) / 2)
  })
})
