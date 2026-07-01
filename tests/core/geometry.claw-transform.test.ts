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
  laneCenterFar,
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

  it('STRETCHES its lane (large rim footprint) — still rim-anchored, NOT a vanishing-point stretch', () => {
    // The old bug stretched the claw ~153px DEEP into a ~117px lane (radial-depth
    // ratio ~1.3). The fix is rim-anchored (this whole block proves depth-immunity),
    // and per the boss's direction the cursor STRETCHES its lane width — a
    // substantial rim object, not the earlier ~13px speck. Assert the selected
    // graphic spans a large fraction of the rim lane-width without overflowing it.
    const tube = tubeForLevel(1)
    for (const lane of [0, 4, 8, 12]) {
      const w = laneWidth(tube, lane, 1.0)
      const { scale, roll } = clawTransform(tube, lane)
      const ratio = renderedFootprint(roll, scale) / w
      expect(ratio).toBeGreaterThan(0.4) // a substantial cursor, not a speck
      expect(ratio).toBeLessThan(1.05) // does not overflow past the lane edges
    }
  })

  it('renders a lane-filling cursor on level 1 (stretches the rim lane, not a ~13px speck)', () => {
    const tube = tubeForLevel(1)
    const w = laneWidth(tube, 0, 1.0)
    const { scale, roll } = clawTransform(tube, 0)
    const px = renderedFootprint(roll, scale)
    expect(px).toBeGreaterThan(0.4 * w) // fills a big part of the lane
    expect(px).toBeLessThan(1.05 * w) // but stays within the lane width
  })

  it('every one of the 8 graphics stretches its lane WITHOUT overflowing past it', () => {
    const tube = tubeForLevel(1)
    const { scale } = clawTransform(tube, 0)
    const w = laneWidth(tube, 0, 1.0)
    for (let roll = 0; roll < 8; roll++) {
      const ratio = renderedFootprint(roll, scale) / w
      expect(ratio).toBeGreaterThan(0.4) // substantial on every roll
      expect(ratio).toBeLessThan(1.05) // never the old vanishing-point stretch, never overflow
    }
  })
})

// ===========================================================================
// Steps between lanes (the walk), proportional across all 16 geometries (AC-4)
// ===========================================================================
describe('clawTransform — STEPS between lanes (walk) & scales proportionally (AC-4)', () => {
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

  it('SNAPS the claw to a discrete lane centre — it WALKS, it does not slide', () => {
    const tube = tubeForLevel(1)
    // a fractional lane rounds to its nearest segment; the anchor IS that
    // segment's rim centre exactly — never a point interpolated between two lanes.
    expect(dist(clawTransform(tube, 3.3).anchor, laneCenterNear(tube, 3))).toBeLessThan(1e-9)
    expect(dist(clawTransform(tube, 3.7).anchor, laneCenterNear(tube, 4))).toBeLessThan(1e-9)
    // just across the half-lane it has STEPPED to the next segment — a discrete
    // jump of ~half a lane, NOT a tiny slide.
    const before = clawTransform(tube, 3.49).anchor
    const after = clawTransform(tube, 3.51).anchor
    expect(dist(before, after)).toBeGreaterThan(1e-6)
    expect(dist(after, laneCenterNear(tube, 4))).toBeLessThan(1e-9)
  })

  it('takes exactly one discrete stop per lane over a revolution (the walk steps, never slides)', () => {
    const tube = tubeForLevel(1) // 16 lanes
    const key = (p: Point): string => `${Math.round(p.x * 1e3)},${Math.round(p.y * 1e3)}`
    const stops = new Set<string>()
    for (let lane = 0; lane < tube.laneCount; lane += 1 / 32) {
      stops.add(key(clawTransform(tube, lane).anchor))
    }
    // the anchor only ever sits on one of the 16 lane centres — no in-between slide
    expect(stops.size).toBe(tube.laneCount)
    for (let seg = 0; seg < tube.laneCount; seg++) {
      expect(stops.has(key(laneCenterNear(tube, seg)))).toBe(true)
    }
  })

  it('holds scale CONSTANT within a segment and steps it at boundaries (walk, not a smooth ramp)', () => {
    const tube = tubeForLevel(6) // non-uniform lane widths — the sharpest test
    // within one segment (round stays constant) the scale does not change
    expect(Math.abs(clawTransform(tube, 4.1).scale - clawTransform(tube, 4.3).scale)).toBeLessThan(
      1e-9,
    )
    // stepping to the next segment, the scale steps to that lane's own width
    expect(clawTransform(tube, 4.6).scale).toBeCloseTo(clawTransform(tube, 5.0).scale, 9)
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
    // The roll depends on the fine sub-segment position, so the claw tumbles through
    // all 8 shapes as it crosses ONE segment, NOT once per integer lane. So sweep
    // the real motion axis (continuous sub-lane), where s.player.lane actually lives.
    const tube = tubeForLevel(1) // closed, 16 lanes
    const rolls = new Set<number>()
    for (let lane = 0; lane < tube.laneCount; lane += 1 / 16) rolls.add(clawTransform(tube, lane).roll)
    // the ROM cycles ALL 8 graphics as the claw crosses each segment — assert the
    // exact 8, so a wrong divisor (fewer poses) or off-by-one is caught.
    expect(rolls.size).toBe(8)
  })

  it('drives playerClawGlyph to all 8 DISTINCT authentic shapes as it moves (end-to-end re-roll)', () => {
    const tube = tubeForLevel(1)
    const shapes = new Set<string>()
    for (let lane = 0; lane < tube.laneCount; lane += 1 / 16) {
      const { roll } = clawTransform(tube, lane)
      shapes.add(JSON.stringify(playerClawGlyph(roll)))
    }
    // all 8 genuinely different silhouettes appear as it moves, not a single sprite
    expect(shapes.size).toBe(8)
  })

  it('WRAPS on a closed tube: lane L and lane L±laneCount select the same roll & anchor', () => {
    const tube = tubeForLevel(1)
    expect(tube.closed).toBe(true)
    for (const lane of [0, 5, 11, 3.5]) {
      const a = clawTransform(tube, lane)
      const up = clawTransform(tube, lane + tube.laneCount)
      const down = clawTransform(tube, lane - tube.laneCount) // negative wrap too
      expect(up.roll).toBe(a.roll)
      expect(down.roll).toBe(a.roll)
      expect(dist(a.anchor, up.anchor)).toBeLessThan(1e-6)
      expect(dist(a.anchor, down.anchor)).toBeLessThan(1e-6)
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
// The walk is SYNCED to the step & leans into its travel (round-3 boss note)
// ===========================================================================
describe('clawTransform.roll — the walk leans into its travel & wraps AS it steps', () => {
  it('runs the roll continuously THROUGH the segment centre (integer lane) — no mid-stride reset', () => {
    // The old mapping reset the roll at INTEGER lanes, half a segment out of phase
    // with the anchor step (which snaps at the HALF-lane, `round`). That made the
    // lean snap back to centre mid-stride — a detached "loop", not a walk. The roll
    // must be continuous across the lane centre the claw is standing on.
    const tube = tubeForLevel(1)
    for (const seg of [1, 4, 9]) {
      const before = clawTransform(tube, seg - 1e-3).roll
      const after = clawTransform(tube, seg + 1e-3).roll
      expect(Math.abs(after - before)).toBeLessThanOrEqual(1)
    }
  })

  it('wraps the roll EXACTLY where the anchor steps (half-lane): stride completes as the foot plants', () => {
    const tube = tubeForLevel(1)
    const before = clawTransform(tube, 4.5 - 1e-3)
    const after = clawTransform(tube, 4.5 + 1e-3)
    // the anchor steps to the next segment here...
    expect(dist(after.anchor, before.anchor)).toBeGreaterThan(1e-6)
    expect(dist(before.anchor, laneCenterNear(tube, 4))).toBeLessThan(1e-9)
    expect(dist(after.anchor, laneCenterNear(tube, 5))).toBeLessThan(1e-9)
    // ...and the roll wraps at the SAME point: full lean (7 — the ROM bridge frame,
    // graphic 8) just before, reset (0) just after. One stride per step.
    expect(before.roll).toBe(7)
    expect(after.roll).toBe(0)
  })

  it('sweeps the roll monotonically 0→7 across one step, so the lean tracks direction of travel', () => {
    // One whole step is [seg-0.5, seg+0.5); sweeping it the roll only CLIMBS, so
    // the apex leans further into the direction of travel the more the spinner
    // turns. Turning the other way replays this in reverse (the apex leans back).
    const tube = tubeForLevel(1)
    let prev = -1
    for (let lane = 3.5; lane < 4.5 - 1e-6; lane += 1 / 64) {
      const roll = clawTransform(tube, lane).roll
      expect(roll).toBeGreaterThanOrEqual(prev)
      prev = roll
    }
    expect(clawTransform(tube, 3.5).roll).toBe(0) // enters the step at 0...
    expect(clawTransform(tube, 4.5 - 1e-3).roll).toBe(7) // ...leaves at full lean
  })
})

// ===========================================================================
// Rotation follows the lane's radial direction (AC-1 orientation)
// ===========================================================================
describe('clawTransform.rotation — the claw lies along its lane radial (AC-1)', () => {
  const norm = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a))

  it('equals atan2(rim − far-centre) + π/2 for each lane (the lane-radial convention)', () => {
    // At an integer lane the interpolated far-centre is simply laneCenterFar(lane)
    // and the anchor is laneCenterNear(lane), so the convention is exactly derivable
    // and pinned here — a wrong sign, dropped +π/2, or wrong ring would fail.
    const tube = tubeForLevel(1)
    for (const lane of [0, 1, 4, 7, 12, 15]) {
      const { anchor, rotation } = clawTransform(tube, lane)
      const far = laneCenterFar(tube, lane)
      const expected = Math.atan2(anchor.y - far.y, anchor.x - far.x) + Math.PI / 2
      expect(norm(rotation - expected)).toBeCloseTo(0, 9)
    }
  })

  it('changes as the claw moves around the tube (orientation tracks the lane, not fixed)', () => {
    const tube = tubeForLevel(1)
    const rots = [0, 4, 8, 12].map((l) => norm(clawTransform(tube, l).rotation))
    const distinct = new Set(rots.map((r) => Math.round(r * 1e6)))
    expect(distinct.size).toBeGreaterThan(1)
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
