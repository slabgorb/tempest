// tests/core/geometry.cycle.test.ts
//
// The 16-geometry roster + pure `tubeForLevel`. Originally the Story 3-1 RED
// suite (stylized parametric roster); reconciled in Story 6-7 to the AUTHENTIC
// rev-3 ROM wells. Authentic-shape assertions (topology cycle, figure-8 litmus,
// per-shape spot checks) live in geometry.authentic.test.ts; this file keeps the
// structural invariants (validity, period-16 cycling, totality, wiring).
import { describe, it, expect } from 'vitest'
import {
  tubeForLevel, makeCircleTube, project, Tube, Point,
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

describe('tubeForLevel — level 1 is the authentic ROM circle', () => {
  it('keeps the original NEAR rim size (~300); the far ring is foreshortened by the per-well ROM ratio', () => {
    const t = tubeForLevel(1)
    const nr = t.near.map((p) => Math.hypot(p.x, p.y))
    expect(Math.max(...nr)).toBeCloseTo(300, 0) // cardinal rim points sit at exactly 300 — level 1 keeps its size
    expect(Math.min(...nr)).toBeGreaterThan(295)
    // tp1-9 (DB-006/DB-007): the far ring is no longer a concentric near*0.2. It is
    // near scaled by R = (16+H)/(240+H) = 40/264 (H = 0x18) ABOUT the projected
    // vanishing point, so its radius-from-origin is displaced. Its SIZE relative to
    // the near ring is exactly that ratio — measured translation-invariantly by the
    // opposite-point diameter (points 0 and 8 are antipodal on the 16-point circle).
    const nearDiam = Math.hypot(t.near[0].x - t.near[8].x, t.near[0].y - t.near[8].y)
    const farDiam = Math.hypot(t.far[0].x - t.far[8].x, t.far[0].y - t.far[8].y)
    expect(farDiam / nearDiam).toBeCloseTo(40 / 264, 4)
    expect(t.farRatio).toBeCloseTo(40 / 264, 4)
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

  it('contains exactly 10 closed and 6 open geometries (authentic topology)', () => {
    expect(roster.filter((t) => t.closed)).toHaveLength(10)
    expect(roster.filter((t) => !t.closed)).toHaveLength(6)
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
