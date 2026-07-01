// tests/core/geometry.claw-transform.test.ts
//
// Story 12-1: Rim-anchored ROM CURSOR claw (replace the depth-projected walker).
//
// ROOT CAUSE the transform exists to kill: the old gameplay claw was built from
// INTERIOR tube depths (apex at depth 0.74, muzzle at 0.90) run through
// project(). Story 10-12's true perspective divide (perspectiveDepth, FAR_RATIO)
// then collapsed those interior anchors toward the vanishing point, stretching
// the claw's radial reach ~2.5x (from ~62px to ~153px) so it dominated the tube
// instead of hugging the near rim.
//
// The fix (Architect Option B) is a PURE, unit-testable transform in
// core/geometry.ts that pins the claw to the near RIM as a FIXED-SIZE screen
// object — NEVER built from interior-depth projection. This suite drives that
// seam into existence and structurally immunises it against future projection
// reworks.
//
// Contract these tests assume of src/core/geometry.ts:
//   export interface ClawTransform {
//     readonly anchor: Point    // rim lane-centre at the CONTINUOUS lane
//     readonly scale: number    // fixed screen footprint ∝ rim lane-width
//     readonly rotation: number // fine muzzle alignment (may be ~0)
//     readonly roll: number      // graphic index 0..7 → NCRS(roll+1)
//   }
//   export function clawTransform(tube: Tube, lane: number): ClawTransform
import { describe, it, expect } from 'vitest'
import geometrySrc from '../../src/core/geometry.ts?raw'
import {
  makeCircleTube,
  tubeForLevel,
  laneCenterNear,
  laneWidth,
  project,
  clawTransform,
  type Tube,
  type Point,
} from '../../src/core/geometry'
import { playerClawGlyph } from '../../src/shell/glyphs'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

// Max extent (width or height) of a glyph's points in glyph-local units.
function glyphExtent(roll: number): number {
  const pts = playerClawGlyph(roll).flatMap((s) => s.points)
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
}

// The on-screen footprint of the rendered claw = glyph extent × transform scale.
function renderedFootprint(roll: number, scale: number): number {
  return glyphExtent(roll) * scale
}

// A "closed" 16-lane circle used as level-1-like control geometry.
const circle = (nearR: number, farR: number): Tube =>
  makeCircleTube(16, { x: 0, y: 0 }, farR, nearR)

// The first authentic OPEN sheet in arcade cycle order (15 lanes, clamps).
function firstOpenTube(): { tube: Tube; level: number } {
  for (let lvl = 1; lvl <= 16; lvl++) {
    const t = tubeForLevel(lvl)
    if (!t.closed) return { tube: t, level: lvl }
  }
  throw new Error('no open tube found in the 16-geometry cycle')
}

// ===========================================================================
// Shape of the transform (AC-1: anchor + scale + rotation from tube+lane)
// ===========================================================================
describe('clawTransform — shape of the pure transform (AC-1)', () => {
  it('returns a finite anchor, positive finite scale, finite rotation, and an integer roll', () => {
    const tube = tubeForLevel(1)
    const t = clawTransform(tube, 3)
    expect(Number.isFinite(t.anchor.x)).toBe(true)
    expect(Number.isFinite(t.anchor.y)).toBe(true)
    expect(Number.isFinite(t.scale)).toBe(true)
    expect(t.scale).toBeGreaterThan(0)
    expect(Number.isFinite(t.rotation)).toBe(true)
    expect(Number.isInteger(t.roll)).toBe(true)
    expect(t.roll).toBeGreaterThanOrEqual(0)
    expect(t.roll).toBeLessThan(8)
  })

  it('anchors the claw at the RIM lane-centre — not an interior depth', () => {
    // The whole point: anchor is the near-rim lane centre (project at depth 1.0),
    // NOT project(...,0.74)/(...,0.90). project at depth 1.0 == laneCenterNear.
    const tube = tubeForLevel(1)
    for (const lane of [0, 1, 5, 9, 15]) {
      const rim = laneCenterNear(tube, lane)
      const t = clawTransform(tube, lane)
      expect(dist(t.anchor, rim)).toBeLessThan(1e-9)
      // and identical to the rim projection the story specifies (project @ 1.0)
      expect(dist(t.anchor, project(tube, lane, 1.0))).toBeLessThan(1e-9)
    }
  })

  it('is pure/deterministic — same tube+lane in, identical transform out', () => {
    const tube = tubeForLevel(4)
    const a = clawTransform(tube, 6)
    const b = clawTransform(tube, 6)
    expect(a).toEqual(b)
  })
})

// ===========================================================================
// Regression guard (AC-2): perspective changes must NOT move or resize the claw
// ===========================================================================
describe('clawTransform — immune to the perspective divide (AC-2 regression guard)', () => {
  it('depends ONLY on the near rim: identical `near`, different `far` → identical anchor/scale/roll', () => {
    // FAR_RATIO is a module constant, so we cannot mutate it at runtime. Instead
    // we prove the structural property that makes AC-2 hold: two tubes that share
    // the SAME near ring but have DIFFERENT far rings (i.e. a different
    // perspective/vanishing-point mapping) yield the SAME claw. A claw built from
    // any interior-depth projection WOULD move between these two tubes.
    const near = circle(300, 60) // far radius 60
    const wideFar = circle(300, 150) // same near (300), different far (150)
    for (const lane of [0, 2, 7, 11, 15]) {
      const a = clawTransform(near, lane)
      const b = clawTransform(wideFar, lane)
      expect(dist(a.anchor, b.anchor)).toBeLessThan(1e-9)
      expect(Math.abs(a.scale - b.scale)).toBeLessThan(1e-9)
      expect(a.roll).toBe(b.roll)
    }
  })

  it('keeps a SMALL, rim-proportional footprint (~18% of a rim lane-width), not a vanishing-point stretch', () => {
    // The bug rendered the claw at ~153px inside a ~117px lane (ratio ~1.3). The
    // authentic claw hugs the rim at ~18% of the lane width. Assert the rendered
    // footprint of the SELECTED graphic is a small fraction of the rim lane-width.
    const tube = tubeForLevel(1)
    for (const lane of [0, 4, 8, 12]) {
      const w = laneWidth(tube, lane, 1.0)
      const { scale, roll } = clawTransform(tube, lane)
      const ratio = renderedFootprint(roll, scale) / w
      expect(ratio).toBeGreaterThan(0.08) // not degenerate/invisible
      expect(ratio).toBeLessThan(0.4) // nowhere near the ~1.3 stretch bug
    }
  })

  it('renders ~20px on level 1 (the authentic near-rim footprint), never the ~153px stretch', () => {
    const tube = tubeForLevel(1)
    const { scale, roll } = clawTransform(tube, 0)
    const px = renderedFootprint(roll, scale)
    expect(px).toBeGreaterThan(10)
    expect(px).toBeLessThan(42) // rejects both the ~62px (pre-10-12) and ~153px (bug)
  })

  it('NO graphic in the 8-shape table stretches: every roll stays small at a given lane', () => {
    const tube = tubeForLevel(1)
    const { scale } = clawTransform(tube, 0)
    const w = laneWidth(tube, 0, 1.0)
    for (let roll = 0; roll < 8; roll++) {
      const ratio = renderedFootprint(roll, scale) / w
      expect(ratio).toBeGreaterThan(0.05)
      expect(ratio).toBeLessThan(0.45)
    }
  })
})

// ===========================================================================
// Continuous, proportional across all 16 geometries (AC-4)
// ===========================================================================
describe('clawTransform — follows the continuous lane & scales proportionally (AC-4)', () => {
  it('produces a finite anchor and positive finite scale for every one of the 16 geometries', () => {
    for (let lvl = 1; lvl <= 16; lvl++) {
      const tube = tubeForLevel(lvl)
      for (let lane = 0; lane < tube.laneCount; lane++) {
        const t = clawTransform(tube, lane)
        expect(Number.isFinite(t.anchor.x) && Number.isFinite(t.anchor.y)).toBe(true)
        expect(t.scale).toBeGreaterThan(0)
        expect(Number.isFinite(t.scale)).toBe(true)
      }
    }
  })

  it('holds a ~constant footprint-to-lane-width ratio across ALL geometries (fixed-size in perspective)', () => {
    // scale ∝ rim lane-width, so footprint/laneWidth is level-INDEPENDENT: the
    // claw is the same fraction of its lane on level 1 and level 16, closed or
    // open. This is the proportional-sizing guarantee.
    const ratios: number[] = []
    for (let lvl = 1; lvl <= 16; lvl++) {
      const tube = tubeForLevel(lvl)
      const lane = Math.min(3, tube.laneCount - 1)
      const w = laneWidth(tube, lane, 1.0)
      const { scale, roll } = clawTransform(tube, lane)
      ratios.push(renderedFootprint(roll, scale) / w)
    }
    const mean = ratios.reduce((a, r) => a + r, 0) / ratios.length
    for (const r of ratios) {
      // every level within ±40% of the mean ratio (per-graphic size differs, but
      // the sizing law is the same everywhere — no runaway growth on any level).
      expect(Math.abs(r - mean)).toBeLessThan(0.4 * mean)
    }
  })

  it('interpolates a FRACTIONAL lane between the two bracketing rim centres (smooth spinner tracking)', () => {
    const tube = tubeForLevel(1)
    const c3 = laneCenterNear(tube, 3)
    const c4 = laneCenterNear(tube, 4)
    const mid = clawTransform(tube, 3.5).anchor
    const eps = 1e-6
    // the interpolated anchor lies within the bounding box of the two centres
    expect(mid.x).toBeGreaterThanOrEqual(Math.min(c3.x, c4.x) - eps)
    expect(mid.x).toBeLessThanOrEqual(Math.max(c3.x, c4.x) + eps)
    expect(mid.y).toBeGreaterThanOrEqual(Math.min(c3.y, c4.y) - eps)
    expect(mid.y).toBeLessThanOrEqual(Math.max(c3.y, c4.y) + eps)
    // and it is NOT pinned to either integer centre (it genuinely tracks the float)
    expect(dist(mid, c3)).toBeGreaterThan(1e-3)
    expect(dist(mid, c4)).toBeGreaterThan(1e-3)
  })

  it('sweeps smoothly with no half-lane SNAP — the old round-to-lane jump is gone', () => {
    // The old claw used currentLane() (Math.round) so its anchor jumped ~half a
    // lane at every x.5 crossing. A continuous transform moves in tiny steps.
    const tube = tubeForLevel(1)
    const meanLaneW =
      Array.from({ length: tube.laneCount }, (_, l) => laneWidth(tube, l, 1.0)).reduce(
        (a, w) => a + w,
        0,
      ) / tube.laneCount
    let prev = clawTransform(tube, 0).anchor
    let maxJump = 0
    for (let lane = 0.05; lane <= tube.laneCount; lane += 0.05) {
      const cur = clawTransform(tube, lane).anchor
      maxJump = Math.max(maxJump, dist(prev, cur))
      prev = cur
    }
    // no adjacent 0.05-lane step moves the anchor by as much as half a lane-width
    expect(maxJump).toBeLessThan(0.5 * meanLaneW)
  })
})

// ===========================================================================
// Per-lane re-roll mapping (AC-8): pure, bounded, re-rolls, wraps, clamps
// ===========================================================================
describe('clawTransform.roll — authentic per-lane re-roll (AC-8)', () => {
  it('returns a bounded integer graphic index [0,8) for every lane of every geometry', () => {
    for (let lvl = 1; lvl <= 16; lvl++) {
      const tube = tubeForLevel(lvl)
      for (let lane = 0; lane < tube.laneCount; lane++) {
        const { roll } = clawTransform(tube, lane)
        expect(Number.isInteger(roll)).toBe(true)
        expect(roll).toBeGreaterThanOrEqual(0)
        expect(roll).toBeLessThan(8)
      }
    }
  })

  it('VISIBLY re-rolls as the claw MOVES — 8 shapes as it crosses a segment (draw_player)', () => {
    // Authentic ROM (tempest.a65 `draw_player`): graphic = ((player_position>>1)&7)+1.
    // player_position's TOP nibble is the segment, so `&7` cancels it and the roll
    // depends ONLY on the sub-segment "fine" position — the claw tumbles through
    // all 8 shapes as it crosses ONE segment, NOT once per integer lane. So sweep
    // the real motion axis (continuous sub-lane), where s.player.lane actually lives.
    const tube = tubeForLevel(1) // closed, 16 lanes
    const rolls = new Set<number>()
    for (let lane = 0; lane < tube.laneCount; lane += 1 / 16) rolls.add(clawTransform(tube, lane).roll)
    expect(rolls.size).toBeGreaterThanOrEqual(4)
  })

  it('drives playerClawGlyph to DISTINCT authentic shapes as it moves (end-to-end re-roll)', () => {
    const tube = tubeForLevel(1)
    const shapes = new Set<string>()
    for (let lane = 0; lane < tube.laneCount; lane += 1 / 16) {
      const { roll } = clawTransform(tube, lane)
      shapes.add(JSON.stringify(playerClawGlyph(roll)))
    }
    // the claw shows several genuinely different silhouettes, not a single sprite
    expect(shapes.size).toBeGreaterThanOrEqual(4)
  })

  it('WRAPS on a closed tube: lane L and lane L+laneCount select the same roll & anchor', () => {
    const tube = tubeForLevel(1)
    expect(tube.closed).toBe(true)
    for (const lane of [0, 5, 11]) {
      const a = clawTransform(tube, lane)
      const b = clawTransform(tube, lane + tube.laneCount)
      expect(b.roll).toBe(a.roll)
      expect(dist(a.anchor, b.anchor)).toBeLessThan(1e-6)
    }
  })

  it('CLAMPS on an open sheet: out-of-range lanes pin to the boundary (no wrap)', () => {
    const { tube } = firstOpenTube()
    expect(tube.closed).toBe(false)
    const last = tube.laneCount - 1
    // below range clamps to lane 0
    expect(clawTransform(tube, -3).roll).toBe(clawTransform(tube, 0).roll)
    expect(dist(clawTransform(tube, -3).anchor, clawTransform(tube, 0).anchor)).toBeLessThan(1e-6)
    // above range clamps to the last lane (does NOT wrap around to lane 0)
    expect(clawTransform(tube, last + 5).roll).toBe(clawTransform(tube, last).roll)
    expect(
      dist(clawTransform(tube, last + 5).anchor, clawTransform(tube, last).anchor),
    ).toBeLessThan(1e-6)
  })
})

// ===========================================================================
// Purity boundary (AC-6): the new geometry stays in the pure core
// ===========================================================================
describe('geometry.ts stays pure after the claw transform (AC-6)', () => {
  it('never touches DOM/canvas/time/randomness (the Hard Architectural Boundary)', () => {
    // Match ACCESS patterns, not bare words — core/geometry legitimately MENTIONS
    // "canvas" in a coordinate-convention comment ("ROM +y up -> canvas +y down"),
    // which is documentation, not a boundary breach.
    expect(geometrySrc).not.toMatch(
      /\bdocument\s*\.|\bwindow\s*\.|\.getContext\s*\(|requestAnimationFrame\s*\(/,
    )
    expect(geometrySrc).not.toMatch(/Math\.random|Date\.now|new Date\(|performance\.now/)
  })

  it('does not import from the shell (core must not depend on render/glyphs)', () => {
    expect(geometrySrc).not.toMatch(/from\s+['"]\.\.\/shell\//)
  })

  it('introduces no `as any` / @ts-ignore type-safety escapes (TS lang-review #1)', () => {
    expect(geometrySrc).not.toMatch(/\bas any\b/)
    expect(geometrySrc).not.toMatch(/@ts-ignore/)
  })
})
