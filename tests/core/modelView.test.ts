// tests/core/modelView.test.ts
//
// Pure layout/geometry math for the model contact sheet (tools/contactSheet.ts).
// `cellRects` partitions a viewport into a grid; `flatTube` builds the neutral
// flat board every actor performs its characteristic motion on. Both are pure —
// no DOM, no time, no randomness — so they live in core/ and are unit-tested.
import { describe, it, expect } from 'vitest'
import { cellRects, flatTube } from '../../src/core/modelView'
import { project } from '../../src/core/geometry'

describe('cellRects', () => {
  it('returns exactly `count` rects', () => {
    expect(cellRects(900, 400, 6, 3)).toHaveLength(6)
    expect(cellRects(900, 400, 5, 3)).toHaveLength(5)
  })

  it('places cells row-major across `cols` columns', () => {
    const r = cellRects(900, 400, 6, 3) // 3 cols × 2 rows → 300×200 cells
    expect(r[0]).toEqual({ x: 0, y: 0, w: 300, h: 200 })
    expect(r[1]).toEqual({ x: 300, y: 0, w: 300, h: 200 })
    expect(r[2]).toEqual({ x: 600, y: 0, w: 300, h: 200 })
    expect(r[3]).toEqual({ x: 0, y: 200, w: 300, h: 200 })
    expect(r[4]).toEqual({ x: 300, y: 200, w: 300, h: 200 })
    expect(r[5]).toEqual({ x: 600, y: 200, w: 300, h: 200 })
  })

  it('tiles the area without gaps or overlap', () => {
    const r = cellRects(900, 400, 6, 3)
    // Rightmost column reaches the right edge; bottom row reaches the bottom.
    expect(r[2].x + r[2].w).toBe(900)
    expect(r[3].y + r[3].h).toBe(400)
    // Uniform cell size → every cell tiles flush against its neighbours.
    for (const cell of r) {
      expect(cell.w).toBe(300)
      expect(cell.h).toBe(200)
    }
  })

  it('clamps `cols` to at least 1', () => {
    const r = cellRects(900, 400, 4, 0) // 0 cols → 1 col, 4 rows
    expect(r).toHaveLength(4)
    expect(r[0]).toEqual({ x: 0, y: 0, w: 900, h: 100 })
    expect(r[3]).toEqual({ x: 0, y: 300, w: 900, h: 100 })
  })
})

describe('flatTube', () => {
  const t = flatTube(3)

  it('is an open 3-lane board carrying lanes+1 boundary points', () => {
    expect(t.laneCount).toBe(3)
    expect(t.closed).toBe(false)
    expect(t.near).toHaveLength(4)
    expect(t.far).toHaveLength(4)
  })

  it('lays the near rim on one colinear horizontal line', () => {
    const y = t.near[0].y
    for (const p of t.near) expect(p.y).toBe(y)
  })

  it('lays the far edge on one colinear horizontal line', () => {
    const y = t.far[0].y
    for (const p of t.far) expect(p.y).toBe(y)
  })

  it('puts the near rim below (lower on screen than) the far edge', () => {
    // Canvas +y is down, so "below" / "front" means a larger y.
    expect(t.near[0].y).toBeGreaterThan(t.far[0].y)
  })

  it('draws the far edge shorter than the near rim (a flat trapezoid)', () => {
    const farSpan = t.far[t.far.length - 1].x - t.far[0].x
    const nearSpan = t.near[t.near.length - 1].x - t.near[0].x
    expect(farSpan).toBeGreaterThan(0)
    expect(farSpan).toBeLessThan(nearSpan)
  })

  it('rises far→near as depth climbs 0→1', () => {
    for (let lane = 0; lane < 3; lane++) {
      const far = project(t, lane, 0)
      const near = project(t, lane, 1)
      expect(near.y).toBeGreaterThan(far.y)
    }
  })
})
