// tests/core/geometry.lane-width.test.ts
//
// Story 6-17: Enemies scale to lane width (depth projection), not a fixed pixel
// ramp.
//
// The bug: drawEnemy() sizes every enemy off an absolute pixel ramp
// (`5 + e.depth * 10`) that knows nothing about the well geometry, so enemies
// render as tiny specks that DON'T grow to fill their lane as they climb to the
// rim. Authentic Tempest has no size ramp at all — an enemy is a fixed-size
// object in perspective, so its on-screen size IS the lane width at its depth.
//
// The testable seam this story drives into existence is a PURE helper in
// src/core/geometry.ts:
//   export function laneWidth(tube: Tube, lane: number, depth: number): number
// returning the on-screen distance between the lane's two edge rails projected
// at `depth`. render.ts then sizes each enemy glyph to a fraction of it.
//
// Depth convention (see `project`): depth 0 = far/center (vanishing point),
// depth 1 = near/rim (player). So lane width must GROW monotonically with depth.
import { describe, it, expect } from 'vitest'
import {
  makeCircleTube,
  tubeForLevel,
  laneWidth,
  type Tube,
  type Point,
} from '../../src/core/geometry'
import geometrySrc from '../../src/core/geometry.ts?raw'

// Chord between two rim boundary points.
function chord(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

// A canonical level-1 ring: far radius 60, near radius 300, 16 lanes (closed).
// Same parameters the original game used, so the numbers are real.
const circle = makeCircleTube(16, { x: 0, y: 0 }, 60, 300)
const N = circle.laneCount

// Direct geometric truths (NOT a reimplementation of laneWidth) for cross-check.
const nearChord = (lane: number): number =>
  chord(circle.near[lane], circle.near[(lane + 1) % N])
const farChord = (lane: number): number =>
  chord(circle.far[lane], circle.far[(lane + 1) % N])

describe('laneWidth — exists and returns a real width (Story 6-17 AC1)', () => {
  it('is an exported function', () => {
    expect(typeof laneWidth).toBe('function')
  })

  it('returns a finite, strictly-positive width for every lane at every depth', () => {
    for (let lane = 0; lane < N; lane++) {
      for (const depth of [0, 0.25, 0.5, 0.75, 1]) {
        const w = laneWidth(circle, lane, depth)
        expect(Number.isFinite(w)).toBe(true)
        expect(w).toBeGreaterThan(0)
      }
    }
  })
})

describe('laneWidth — equals the rim chord at the boundaries (Story 6-17 AC1)', () => {
  it('at depth 1 equals the chord between adjacent NEAR rim points (the rim)', () => {
    // AC1 verbatim: "equals the chord between adjacent rim points at depth=1".
    for (const lane of [0, 3, 7, 15]) {
      expect(laneWidth(circle, lane, 1)).toBeCloseTo(nearChord(lane), 6)
    }
  })

  it('at depth 0 equals the chord between adjacent FAR rim points (vanishing point)', () => {
    for (const lane of [0, 3, 7, 15]) {
      expect(laneWidth(circle, lane, 0)).toBeCloseTo(farChord(lane), 6)
    }
  })

  it('the rim (near) lane is dramatically wider than the vanishing-point (far) lane', () => {
    // The whole point of the story: a flipper at the rim must be far bigger than
    // at the centre. With 60->300 radii that is a ~5x span.
    const far = laneWidth(circle, 0, 0)
    const near = laneWidth(circle, 0, 1)
    expect(near).toBeGreaterThan(far * 4)
  })
})

describe('laneWidth — grows monotonically from far to near (Story 6-17 AC1)', () => {
  it('strictly increases as depth climbs from the centre toward the rim', () => {
    const depths = [0, 0.2, 0.4, 0.6, 0.8, 1]
    const widths = depths.map((d) => laneWidth(circle, 0, d))
    for (let i = 1; i < widths.length; i++) {
      expect(widths[i]).toBeGreaterThan(widths[i - 1])
    }
  })

  it('interpolates linearly between the far and near chords (circle ring)', () => {
    // A circle ring's rails are colinear from the centre, so width is linear in
    // depth: width(0.5) is exactly the average of the far and near widths.
    const w0 = laneWidth(circle, 0, 0)
    const w1 = laneWidth(circle, 0, 1)
    expect(laneWidth(circle, 0, 0.5)).toBeCloseTo((w0 + w1) / 2, 6)
  })
})

describe('laneWidth — closed-tube topology (Story 6-17 AC1)', () => {
  it('is symmetric across all lanes of a circle ring at a fixed depth', () => {
    const ref = laneWidth(circle, 0, 1)
    for (let lane = 1; lane < N; lane++) {
      expect(laneWidth(circle, lane, 1)).toBeCloseTo(ref, 6)
    }
  })

  it('wraps the last lane to boundary 0 (closed) — no NaN, matches the wrap chord', () => {
    // Lane 15 spans boundary 15 -> boundary 0 (wrap). Must be a real positive
    // width equal to the chord across that wrap edge, not NaN/Infinity.
    const w = laneWidth(circle, N - 1, 1)
    expect(Number.isFinite(w)).toBe(true)
    expect(w).toBeCloseTo(chord(circle.near[N - 1], circle.near[0]), 6)
  })
})

describe('laneWidth — authentic ROM wells (Story 6-17 AC1)', () => {
  it('grows far->near on an authentic closed well (level 1)', () => {
    const t = tubeForLevel(1)
    expect(t.closed).toBe(true)
    for (const lane of [0, 4, 8]) {
      expect(laneWidth(t, lane, 1)).toBeGreaterThan(laneWidth(t, lane, 0))
    }
  })

  it('matches the near rim chord at depth 1 on an authentic closed well', () => {
    const t = tubeForLevel(1)
    const lane = 4
    const i0 = ((lane % t.laneCount) + t.laneCount) % t.laneCount
    const i1 = (((lane + 1) % t.laneCount) + t.laneCount) % t.laneCount
    expect(laneWidth(t, lane, 1)).toBeCloseTo(chord(t.near[i0], t.near[i1]), 6)
  })

  it('returns a positive, finite width on an authentic OPEN sheet (clamped topology)', () => {
    // Find an open level (laneCount 15, clamps instead of wraps).
    let open: Tube | null = null
    for (let lvl = 1; lvl <= 16; lvl++) {
      const t = tubeForLevel(lvl)
      if (!t.closed) { open = t; break }
    }
    expect(open, 'an open sheet exists in the 16-level cycle').not.toBeNull()
    const t = open as Tube
    for (let lane = 0; lane < t.laneCount; lane++) {
      const w = laneWidth(t, lane, 1)
      expect(Number.isFinite(w)).toBe(true)
      expect(w).toBeGreaterThan(0)
    }
  })
})

describe('laneWidth — degenerate geometry guard (Story 6-17 AC1)', () => {
  it('returns 0 (not NaN) when a lane\'s two rails coincide', () => {
    const degenerate: Tube = {
      laneCount: 2,
      closed: true,
      far: [{ x: 5, y: 5 }, { x: 5, y: 5 }],
      near: [{ x: 5, y: 5 }, { x: 5, y: 5 }],
    }
    const w = laneWidth(degenerate, 0, 0.5)
    expect(Number.isNaN(w)).toBe(false)
    expect(w).toBe(0)
  })
})

describe('laneWidth — pure-core boundary (Story 6-17 AC5 + TS lang-review #1)', () => {
  it('geometry.ts touches no DOM/canvas/window API (the Hard Architectural Boundary)', () => {
    // Match real DOM/canvas API surface, not the English word "canvas" in a
    // comment — the comment on line ~71 explains the y-negation "for our canvas".
    expect(geometrySrc).not.toMatch(
      /\bdocument\.|\bwindow\.|getContext|CanvasRenderingContext2D|requestAnimationFrame/,
    )
  })

  it('geometry.ts uses no ambient time or randomness (deterministic core)', () => {
    expect(geometrySrc).not.toMatch(/Math\.random|Date\.now|new Date\(|performance\.now/)
  })

  it('geometry.ts uses no `as any` / @ts-ignore type-safety escapes (TS #1)', () => {
    expect(geometrySrc).not.toMatch(/\bas any\b/)
    expect(geometrySrc).not.toMatch(/@ts-ignore/)
  })
})
