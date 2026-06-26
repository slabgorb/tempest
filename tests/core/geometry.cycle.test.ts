// tests/core/geometry.cycle.test.ts
//
// RED-phase suite for Story 3-1: the 16-geometry roster + pure `tubeForLevel`.
// Paranoid by design — it pins level 1 to the EXACT original circle, counts the
// open/closed split exactly, exercises both builders in isolation, guards every
// boundary point against NaN, proves the roster is render-safe through `project`,
// and verifies the `initialState`/`startGame` wiring actually routes through
// `tubeForLevel(1)`.
import { describe, it, expect } from 'vitest'
import {
  tubeForLevel, makePolygonTube, makeOpenTube, makeCircleTube, project, Tube, Point,
} from '../../src/core/geometry'
import { initialState } from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { Input } from '../../src/core/input'

const ORIGIN: Point = { x: 0, y: 0 }
const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }

// A tube is structurally valid when far/near are equal length, sized by the
// open/closed boundary-point rule (closed = laneCount, open = laneCount + 1),
// and every boundary coordinate is a finite number (no NaN / Infinity).
function expectValidTube(t: Tube): void {
  expect(t.near).toHaveLength(t.far.length)
  const expected = t.closed ? t.laneCount : t.laneCount + 1
  expect(t.far).toHaveLength(expected)
  for (const p of [...t.far, ...t.near]) {
    expect(Number.isFinite(p.x)).toBe(true)
    expect(Number.isFinite(p.y)).toBe(true)
  }
}

describe('tubeForLevel — level 1 is the original circle (regression guard)', () => {
  it('is byte-for-byte identical to makeCircleTube(16, origin, 60, 300)', () => {
    expect(tubeForLevel(1)).toEqual(makeCircleTube(16, ORIGIN, 60, 300))
  })

  it('is a 16-lane closed tube with 16 boundary points on each rim', () => {
    const t = tubeForLevel(1)
    expect(t.laneCount).toBe(16)
    expect(t.closed).toBe(true)
    expect(t.far).toHaveLength(16)
    expect(t.near).toHaveLength(16)
  })
})

describe('tubeForLevel — the 16-geometry roster', () => {
  const roster = Array.from({ length: 16 }, (_, i) => tubeForLevel(i + 1))

  it('contains exactly 8 closed and 8 open geometries', () => {
    expect(roster.filter((t) => t.closed)).toHaveLength(8)
    expect(roster.filter((t) => !t.closed)).toHaveLength(8)
  })

  it('every geometry is structurally valid with laneCount >= 8', () => {
    for (const t of roster) {
      expectValidTube(t)
      expect(t.laneCount).toBeGreaterThanOrEqual(8)
    }
  })

  it('every geometry is render-safe: project stays finite across all lanes and depths', () => {
    for (const t of roster) {
      for (let lane = 0; lane < t.laneCount; lane++) {
        for (const depth of [0, 0.5, 1]) {
          const p = project(t, lane, depth)
          expect(Number.isFinite(p.x)).toBe(true)
          expect(Number.isFinite(p.y)).toBe(true)
        }
      }
    }
  })
})

describe('tubeForLevel — cycling with period 16', () => {
  it('returns the exact same geometry object 16 levels apart (shared, immutable table)', () => {
    for (let level = 1; level <= 16; level++) {
      expect(tubeForLevel(level)).toBe(tubeForLevel(level + 16))
    }
    expect(tubeForLevel(1)).toBe(tubeForLevel(33))
  })

  it('is total: non-positive and large levels still resolve to a valid geometry', () => {
    for (const level of [0, -1, -16, 100, 257]) {
      expectValidTube(tubeForLevel(level))
    }
    // level 0 wraps to the last entry, level -15 wraps back to level 1's circle
    expect(tubeForLevel(-15)).toBe(tubeForLevel(1))
  })
})

describe('makePolygonTube (closed builder)', () => {
  it('builds a closed tube with laneCount boundary points and finite coords', () => {
    const square = makePolygonTube(16, 4, ORIGIN, 70, 320)
    expect(square.closed).toBe(true)
    expect(square.laneCount).toBe(16)
    expect(square.far).toHaveLength(16)
    expect(square.near).toHaveLength(16)
    expectValidTube(square)
  })

  it('produces a genuine polygon distinct from a circle of the same radius', () => {
    const square = makePolygonTube(16, 4, ORIGIN, 70, 320)
    const circle = makeCircleTube(16, ORIGIN, 70, 320)
    const differs = square.far.some(
      (p, i) => Math.abs(p.x - circle.far[i].x) > 1e-6 || Math.abs(p.y - circle.far[i].y) > 1e-6,
    )
    expect(differs).toBe(true)
  })

  it('keeps every side count from 3 to 8 finite (no division blow-ups)', () => {
    for (const sides of [3, 4, 5, 6, 7, 8]) {
      expectValidTube(makePolygonTube(12, sides, ORIGIN, 70, 320))
    }
  })
})

describe('makeOpenTube (open builder)', () => {
  const dip = (t: number): number => Math.abs(t - 0.5)

  it('builds an open tube with laneCount + 1 boundary points and finite coords', () => {
    const v = makeOpenTube(16, ORIGIN, 640, dip)
    expect(v.closed).toBe(false)
    expect(v.laneCount).toBe(16)
    expect(v.far).toHaveLength(17)
    expect(v.near).toHaveLength(17)
    expectValidTube(v)
  })

  it('applies the profile so the strip is bowed, not flat', () => {
    const v = makeOpenTube(16, ORIGIN, 640, dip)
    // i=8 → t=0.5 (dip 0, the trough); i=0 → t=0 (dip 0.5, the rim) must differ.
    expect(v.near[8].y).not.toBe(v.near[0].y)
  })

  it('a flat profile still yields finite, render-safe geometry through project', () => {
    const flat = makeOpenTube(12, ORIGIN, 560, () => 0)
    expectValidTube(flat)
    for (let lane = 0; lane < flat.laneCount; lane++) {
      const p = project(flat, lane, 0.5)
      expect(Number.isFinite(p.x)).toBe(true)
      expect(Number.isFinite(p.y)).toBe(true)
    }
  })
})

describe('initialState wiring', () => {
  it('builds the level-1 tube from tubeForLevel(1)', () => {
    expect(initialState(1).tube).toEqual(tubeForLevel(1))
  })

  it('sizes the spike array to the level-1 laneCount', () => {
    expect(initialState(1).spikes).toHaveLength(tubeForLevel(1).laneCount)
  })
})

describe('startGameAtLevel wiring (a fresh game loads the chosen level geometry)', () => {
  // Story 4-2: a restart is now framed through attract -> select -> playing. The
  // geometry reset that used to happen on the gameover->start step now happens on
  // the select->playing commit (startGameAtLevel). A stale deeper-level tube must
  // still be discarded for the freshly chosen level.
  it('restores tubeForLevel(1) for a fresh level-1 game, discarding a stale geometry', () => {
    let s = initialState(1)
    s.mode = 'gameover'
    s.lives = 0
    // Stale geometry from a deeper level (wrong laneCount) must be discarded.
    s.tube = makeCircleTube(8, ORIGIN, 60, 300)
    s.spikes = new Array(8).fill(0)

    s = stepGame(s, { ...NEUTRAL, start: true }, 1 / 60) // gameover -> attract
    expect(s.mode as string).toBe('attract')
    s = stepGame(s, { ...NEUTRAL, start: true }, 1 / 60) // attract -> select (level 1)
    expect(s.mode as string).toBe('select')
    const out = stepGame(s, { ...NEUTRAL, start: true }, 1 / 60) // select -> playing

    expect(out.mode as string).toBe('playing')
    expect(out.level).toBe(1)
    expect(out.tube).toEqual(tubeForLevel(1))
    expect(out.tube.laneCount).toBe(16)
    expect(out.spikes).toHaveLength(16)
  })
})
