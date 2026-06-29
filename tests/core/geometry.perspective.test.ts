// tests/core/geometry.perspective.test.ts
//
// Story 10-12: True perspective projection (replace the linear depth lerp).
//
// The bug being replaced: geometry.project (and the sibling boundaryRail used by
// laneWidth/flipPivot) interpolates far->near AFFINELY in depth — a point at
// depth 0.5 lands exactly at the screen midpoint of the far and near rim. The
// arcade does NOT do this. A Tempest well is ONE ring scaled by a true
// PERSPECTIVE DIVIDE toward the vanishing point (the tube centre): screen radius
// is proportional to 1/(eye - z), so objects sit compressed near the far centre
// and ACCELERATE toward the near rim. See:
//   docs/ux/2026-06-27-tempest-geometry-rom-survey.md  (§1 "pure perspective
//   scaling of that single ring toward a vanishing point")
//
// Depth convention (see `project`): depth 0 = far/vanishing point, depth 1 =
// near/rim (player). Scope decision (story scope, full perspective): project AND
// boundaryRail share ONE perspective reparameterisation, so position (project),
// size (laneWidth) and the flip spoke (flipPivot) all accelerate together.
//
// The defining, implementation-independent signature of a perspective divide
// about the tube centre: radius(depth) is proportional to 1/z and z is linear in
// depth, so **1/radius(depth) is AFFINE in depth** (constant first differences).
// For the old linear lerp, radius is affine in depth, so 1/radius is convex —
// its first differences are NOT constant. Every "perspective signature" test
// below FAILS for the affine lerp and PASSES for a true divide.
import { describe, it, expect } from 'vitest'
import {
  makeCircleTube,
  tubeForLevel,
  project,
  laneCenterFar,
  laneCenterNear,
  laneWidth,
  flipPivot,
  type Point,
  type Tube,
} from '../../src/core/geometry'

// Canonical level-1 ring: far radius 60, near radius 300, 16 closed lanes —
// centred on the origin, so the vanishing point IS the origin and a lane centre's
// screen radius is hypot(p.x, p.y). Same parameters the original game used.
const circle = makeCircleTube(16, { x: 0, y: 0 }, 60, 300)
const N = circle.laneCount

// Screen radius from the vanishing point (origin) — the perspective scale carrier.
const radius = (p: Point): number => Math.hypot(p.x, p.y)
const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y)

// First differences of 1/value across a series. For a true perspective divide
// these are constant (1/radius affine in depth); for the affine lerp they shrink.
const reciprocalFirstDiffs = (values: number[]): number[] => {
  const inv = values.map((v) => 1 / v)
  const diffs: number[] = []
  for (let i = 1; i < inv.length; i++) diffs.push(inv[i] - inv[i - 1])
  return diffs
}

// Evenly spaced depths — equal spacing is what makes "constant first differences
// of 1/radius" the clean perspective signature.
const EVEN_DEPTHS = [0, 0.25, 0.5, 0.75, 1]

describe('project — endpoints are preserved exactly (Story 10-12 AC4 / non-negotiable)', () => {
  // The rim and the claw must not move: only the INTERIOR depth mapping changes.
  it('depth 0 still equals the far lane centre (vanishing point)', () => {
    for (const lane of [0, 3, 7, 15]) {
      const p = project(circle, lane, 0)
      const f = laneCenterFar(circle, lane)
      expect(p.x).toBeCloseTo(f.x, 9)
      expect(p.y).toBeCloseTo(f.y, 9)
    }
  })

  it('depth 1 still equals the near lane centre (the rim)', () => {
    for (const lane of [0, 3, 7, 15]) {
      const p = project(circle, lane, 1)
      const n = laneCenterNear(circle, lane)
      expect(p.x).toBeCloseTo(n.x, 9)
      expect(p.y).toBeCloseTo(n.y, 9)
    }
  })
})

describe('project — perspective divide, NOT a linear lerp (Story 10-12 AC1)', () => {
  it('depth 0.5 is NOT the affine midpoint of far and near', () => {
    const f = laneCenterFar(circle, 3)
    const n = laneCenterNear(circle, 3)
    const mid = { x: (f.x + n.x) / 2, y: (f.y + n.y) / 2 }
    const p = project(circle, 3, 0.5)
    // The whole point of the story: depth 0.5 must depart from the midpoint.
    expect(dist(p, mid)).toBeGreaterThan(1)
  })

  it('depth 0.5 sits COMPRESSED toward the far centre (perspective, not affine)', () => {
    const f = laneCenterFar(circle, 3)
    const n = laneCenterNear(circle, 3)
    const p = project(circle, 3, 0.5)
    // 1/z compression: halfway in depth is well short of halfway in screen space.
    expect(dist(p, f)).toBeLessThan(dist(p, n))
    // ...and its screen radius is below the affine-midpoint radius.
    expect(radius(p)).toBeLessThan((radius(f) + radius(n)) / 2)
  })

  it('1/radius(depth) is AFFINE in depth — the signature of a true 1/z divide', () => {
    const radii = EVEN_DEPTHS.map((d) => radius(project(circle, 3, d)))
    const diffs = reciprocalFirstDiffs(radii)
    // Constant first differences of 1/radius <=> radius ∝ 1/z, z linear in depth.
    // (The affine lerp gives shrinking diffs and fails this.)
    for (const d of diffs) {
      expect(Math.abs(d - diffs[0])).toBeLessThan(Math.abs(diffs[0]) * 1e-6)
    }
  })
})

describe('project — apparent motion accelerates toward the near rim (Story 10-12 AC3)', () => {
  it('the screen step over the last 0.1 of depth dwarfs the first 0.1', () => {
    const farStep = dist(project(circle, 3, 0.1), project(circle, 3, 0))
    const rimStep = dist(project(circle, 3, 1), project(circle, 3, 0.9))
    // For the affine lerp these are equal (ratio 1). Perspective makes the rim
    // step many times larger; require a strong, unambiguous acceleration.
    expect(rimStep).toBeGreaterThan(farStep * 3)
  })

  it('equal depth steps produce strictly GROWING screen steps far->near', () => {
    const depths = [0, 0.2, 0.4, 0.6, 0.8, 1]
    const pts = depths.map((d) => project(circle, 3, d))
    const steps: number[] = []
    for (let i = 1; i < pts.length; i++) steps.push(dist(pts[i], pts[i - 1]))
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]).toBeGreaterThan(steps[i - 1])
    }
  })

  it('screen radius still climbs monotonically far->near (no perspective backtrack)', () => {
    const radii = EVEN_DEPTHS.map((d) => radius(project(circle, 3, d)))
    for (let i = 1; i < radii.length; i++) {
      expect(radii[i]).toBeGreaterThan(radii[i - 1])
    }
  })
})

describe('laneWidth — size scales by the SAME perspective divide (Story 10-12 AC3)', () => {
  // Scope decision: an enemy is a fixed-size object in perspective, so its width
  // follows 1/z exactly like its position.
  it('endpoints unchanged: far chord at depth 0, near chord at depth 1', () => {
    const w0 = laneWidth(circle, 0, 0)
    const w1 = laneWidth(circle, 0, 1)
    // Near rim is ~5x the far end (60->300 ring) — preserved by perspective.
    expect(w1).toBeGreaterThan(w0 * 4)
  })

  it('width at depth 0.5 is compressed well below the affine average', () => {
    const w0 = laneWidth(circle, 0, 0)
    const w1 = laneWidth(circle, 0, 1)
    const wMid = laneWidth(circle, 0, 0.5)
    // Perspective pulls mid-depth width to ~0.56x the affine average; the linear
    // lerp lands exactly ON the average. Require a clear gap (< 0.9x) so a float
    // tie at the average can't mask RED.
    expect(wMid).toBeLessThan(((w0 + w1) / 2) * 0.9)
    expect(wMid).toBeGreaterThan(w0) // still grows; just not linearly
  })

  it('1/width(depth) is AFFINE in depth — same 1/z signature as project', () => {
    const widths = EVEN_DEPTHS.map((d) => laneWidth(circle, 0, d))
    const diffs = reciprocalFirstDiffs(widths)
    for (const d of diffs) {
      expect(Math.abs(d - diffs[0])).toBeLessThan(Math.abs(diffs[0]) * 1e-6)
    }
  })
})

describe('flipPivot — the rim spoke rides the SAME perspective divide (Story 10-12 AC3)', () => {
  it('endpoints unchanged: far vertex at depth 0, near vertex at depth 1', () => {
    const f = flipPivot(circle, 3, 1, 0)
    const n = flipPivot(circle, 3, 1, 1)
    expect(f.x).toBeCloseTo(circle.far[4].x, 9)
    expect(f.y).toBeCloseTo(circle.far[4].y, 9)
    expect(n.x).toBeCloseTo(circle.near[4].x, 9)
    expect(n.y).toBeCloseTo(circle.near[4].y, 9)
  })

  it('depth 0.5 spoke is compressed toward the far vertex (not the midpoint)', () => {
    const f = circle.far[4]
    const n = circle.near[4]
    const mid = { x: (f.x + n.x) / 2, y: (f.y + n.y) / 2 }
    const p = flipPivot(circle, 3, 1, 0.5)
    expect(radius(p)).toBeLessThan(radius(mid))
    expect(dist(p, f)).toBeLessThan(dist(p, n))
  })

  it('1/radius(depth) of the spoke is AFFINE in depth', () => {
    const radii = EVEN_DEPTHS.map((d) => radius(flipPivot(circle, 3, 1, d)))
    const diffs = reciprocalFirstDiffs(radii)
    for (const d of diffs) {
      expect(Math.abs(d - diffs[0])).toBeLessThan(Math.abs(diffs[0]) * 1e-6)
    }
  })
})

describe('perspective divide — no NaN/Infinity from the denominator (TS lang-review #4)', () => {
  // A 1/(eye - z) divide adds a denominator that must never reach 0 across the
  // legal depth range. render.ts only ever calls project/laneWidth with depth in
  // [0,1]; assert the eye sits clear of that whole interval.
  it('project/laneWidth/flipPivot stay finite across the full depth range', () => {
    for (let lane = 0; lane < N; lane++) {
      for (const d of [0, 0.01, 0.25, 0.5, 0.75, 0.99, 1]) {
        const p = project(circle, lane, d)
        expect(Number.isFinite(p.x)).toBe(true)
        expect(Number.isFinite(p.y)).toBe(true)
        const w = laneWidth(circle, lane, d)
        expect(Number.isFinite(w)).toBe(true)
        for (const dir of [-1, 1]) {
          const piv = flipPivot(circle, lane, dir, d)
          expect(Number.isFinite(piv.x)).toBe(true)
          expect(Number.isFinite(piv.y)).toBe(true)
        }
      }
    }
  })

  it('an authentic open sheet (clamped topology) stays finite under perspective', () => {
    let open: Tube | null = null
    for (let lvl = 1; lvl <= 16; lvl++) {
      const t = tubeForLevel(lvl)
      if (!t.closed) { open = t; break }
    }
    expect(open, 'an open sheet exists in the 16-level cycle').not.toBeNull()
    const t = open as Tube
    for (let lane = 0; lane < t.laneCount; lane++) {
      for (const d of [0, 0.5, 1]) {
        const p = project(t, lane, d)
        expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true)
        expect(Number.isFinite(laneWidth(t, lane, d))).toBe(true)
      }
    }
  })
})

describe('perspective divide — authentic ROM well shows the same acceleration', () => {
  it('a real closed well (level 1) accelerates far->near at the lane centre', () => {
    const t = tubeForLevel(1)
    expect(t.closed).toBe(true)
    const lane = 4
    const farStep = dist(project(t, lane, 0.1), project(t, lane, 0))
    const rimStep = dist(project(t, lane, 1), project(t, lane, 0.9))
    expect(rimStep).toBeGreaterThan(farStep * 2)
  })
})
