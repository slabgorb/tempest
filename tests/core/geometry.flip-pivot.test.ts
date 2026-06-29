// tests/core/geometry.flip-pivot.test.ts
//
// Story 6-18: Flippers cartwheel end-over-end across the web (pivot on the lane
// spoke), not a naive center-spin.
//
// The bug: render.ts drawEnemy()'s flipper case positions/rotates a flipping
// flipper about its OWN GLYPH CENTRE (the lane centre, `project(tube, lane,
// depth)`) — it lerp-slides centre->centre and adds a half-turn about that
// centre, plus a bogus idle centre-spin when settled. Authentic Tempest flippers
// have no idle spin; they FLIP end-over-end, tumbling about the shared web spoke
// (the rim boundary vertex) between the source lane and the adjacent target lane.
//
// The testable seam this story drives into existence is a PURE helper in
// src/core/geometry.ts:
//   export function flipPivot(tube: Tube, lane: number, dir: number, depth: number): Point
// returning the projected shared rim-spoke point a flipper pivots about when it
// flips from `lane` toward `lane + sign(dir)`. render.ts then swings the bowtie
// about THAT point instead of the lane centre.
//
// Lane/boundary convention (see laneCenterFar): lane L spans rim boundary
// vertices [L, L+1]. So lanes L and L+1 share vertex L+1; lanes L and L-1 share
// vertex L. A +dir flip pivots about vertex L+1; a -dir flip about vertex L.
//
// Depth convention (see `project`): depth 0 = far/vanishing point, depth 1 =
// near/rim. The pivot is the SAME far->near lerp applied to that rim vertex.
import { describe, it, expect } from 'vitest'
import {
  makeCircleTube,
  tubeForLevel,
  project,
  flipPivot,
  type Point,
} from '../../src/core/geometry'

// Assert two points coincide. Direct geometric truths below are computed from the
// tube's own rim arrays — NOT a reimplementation of flipPivot.
const eqP = (p: Point, q: Point, digits = 6): void => {
  expect(p.x).toBeCloseTo(q.x, digits)
  expect(p.y).toBeCloseTo(q.y, digits)
}
const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y)

// Canonical level-1 ring: far radius 60, near radius 300, 16 closed lanes — the
// same parameters the original game used, so the numbers are real.
const circle = makeCircleTube(16, { x: 0, y: 0 }, 60, 300)
const N = circle.laneCount

describe('flipPivot — exists and returns a real point (Story 6-18 AC2)', () => {
  it('is an exported function', () => {
    expect(typeof flipPivot).toBe('function')
  })

  it('returns finite coordinates for every lane / direction / depth', () => {
    for (let lane = 0; lane < N; lane++) {
      for (const dir of [-1, 1]) {
        for (const depth of [0, 0.5, 1]) {
          const p = flipPivot(circle, lane, dir, depth)
          expect(Number.isFinite(p.x)).toBe(true)
          expect(Number.isFinite(p.y)).toBe(true)
        }
      }
    }
  })
})

describe('flipPivot — IS the shared rim spoke, NOT the lane centre (Story 6-18 AC2)', () => {
  // The crux of the bug: the buggy renderer pivots about the lane centre
  // (project). The fix pivots about the rim boundary vertex shared by the two
  // lanes. They are different points, so these assertions fail for ANY
  // centre-based implementation.
  it('a +dir flip from lane L pivots about the NEAR rim vertex shared with lane L+1', () => {
    for (const L of [0, 3, 7, 14]) {
      eqP(flipPivot(circle, L, 1, 1), circle.near[(L + 1) % N])
    }
  })

  it('a -dir flip from lane L pivots about the NEAR rim vertex shared with lane L-1', () => {
    for (const L of [1, 4, 8, 15]) {
      eqP(flipPivot(circle, L, -1, 1), circle.near[L])
    }
  })

  it('the pivot is NOT the lane centre the buggy renderer spins about', () => {
    // Half the rim chord (~58px on this ring) separates the spoke from the lane
    // centre — far more than a rounding tie.
    for (const L of [0, 3, 7]) {
      expect(dist(flipPivot(circle, L, 1, 1), project(circle, L, 1))).toBeGreaterThan(1)
    }
  })
})

describe('flipPivot — +dir from L and -dir from L+1 name the SAME spoke (Story 6-18 AC2)', () => {
  it('is symmetric across the shared boundary at every depth', () => {
    for (const L of [0, 5, 11]) {
      for (const depth of [0, 0.5, 1]) {
        eqP(flipPivot(circle, L, 1, depth), flipPivot(circle, L + 1, -1, depth))
      }
    }
  })
})

describe('flipPivot — perspective: lerps the rim vertex far->near (Story 6-18 AC2)', () => {
  it('at depth 0 sits on the FAR vertex, at depth 1 on the NEAR vertex', () => {
    eqP(flipPivot(circle, 3, 1, 0), circle.far[4])
    eqP(flipPivot(circle, 3, 1, 1), circle.near[4])
  })

  it('at depth 0.5 is compressed toward the far vertex (perspective, not midpoint) — Story 10-12', () => {
    // Story 10-12 replaced the linear lerp with a true perspective divide, so the
    // spoke rides 1/z far->near: at depth 0.5 it sits short of the geometric
    // midpoint, closer to the far vertex. (Full characterisation in
    // geometry.perspective.test.ts.)
    const m = mid(circle.far[4], circle.near[4])
    const p = flipPivot(circle, 3, 1, 0.5)
    const r = (q: Point): number => Math.hypot(q.x, q.y)
    expect(dist(p, m)).toBeGreaterThan(1)
    expect(r(p)).toBeLessThan(r(m))
    expect(dist(p, circle.far[4])).toBeLessThan(dist(p, circle.near[4]))
  })

  it('moves monotonically outward (|pivot| grows) from vanishing point to rim', () => {
    const radii = [0, 0.25, 0.5, 0.75, 1].map((d) => {
      const p = flipPivot(circle, 3, 1, d)
      return Math.hypot(p.x, p.y)
    })
    for (let i = 1; i < radii.length; i++) {
      expect(radii[i]).toBeGreaterThan(radii[i - 1])
    }
  })
})

describe('flipPivot — closed-tube wrap (Story 6-18 AC2, test paranoia)', () => {
  it('flipping +dir off the last lane wraps the shared vertex to boundary 0', () => {
    eqP(flipPivot(circle, N - 1, 1, 1), circle.near[0])
  })

  it('flipping -dir off lane 0 pivots about boundary 0 — the same wrapped spoke', () => {
    eqP(flipPivot(circle, 0, -1, 1), circle.near[0])
  })
})

describe('flipPivot — authentic ROM well (Story 6-18 AC2)', () => {
  it('pivots about the shared near rim vertex on a real closed well (level 1)', () => {
    const t = tubeForLevel(1)
    expect(t.closed).toBe(true)
    const L = 4
    eqP(flipPivot(t, L, 1, 1), t.near[(L + 1) % t.laneCount])
  })

  it('still differs from the lane centre on a real well (the actual fix)', () => {
    const t = tubeForLevel(1)
    const L = 4
    expect(dist(flipPivot(t, L, 1, 1), project(t, L, 1))).toBeGreaterThan(1)
  })
})

describe('flipPivot — pure-core boundary (Story 6-18 AC3)', () => {
  // geometry.ts's source-level no-DOM/no-time/no-random scan is already locked by
  // geometry.lane-width.test.ts (whole-file); here we assert flipPivot's own
  // behavioural purity so we don't duplicate that scan.
  it('does not mutate the tube it reads', () => {
    const t = tubeForLevel(1)
    const beforeNear = t.near.map((p) => ({ ...p }))
    const beforeFar = t.far.map((p) => ({ ...p }))
    flipPivot(t, 4, 1, 0.5)
    t.near.forEach((p, i) => eqP(p, beforeNear[i]))
    t.far.forEach((p, i) => eqP(p, beforeFar[i]))
  })

  it('is deterministic — identical inputs give identical output', () => {
    eqP(flipPivot(circle, 7, 1, 0.5), flipPivot(circle, 7, 1, 0.5), 12)
  })
})
