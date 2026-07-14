// tests/shell/tp1-9.starfield-perspective.test.ts
//
// Story tp1-9 (cluster C5), AC6 — "The starfield reuses the same hyperbolic law."
//
// DB-016 (CONFIRMED, docs/audit/findings/pair-4-aldisp-b-well-projection.json):
// the warp starfield is projected through the SAME perspective divide as the
// well, not spread LINEARLY from centre. DSTARF (ALDISP.MAC:2931-2970) swaps in a
// starfield eye — EYL = 0xE8 (signed -24), YDEUNI = 0x28 = 40 — places every plane
// at world centre (PXL=PZL=0x80), and CASCAL scales its star picture by
//     scale(z) = YDEUNI / (PY - EY) = 40 / (z + 24)
// So a plane's radial reach is HYPERBOLIC in z: 40/264 = 0.1515 of full reach at
// spawn (z=0xF0=240), rising to 40/40 = 1.0 at retirement (z=0x10=16) — slow at
// first, whipping past at the end. Our drawStarfield (render.ts:167-168) instead
// maps z LINEARLY: t = (0xF0 - z)/(0xF0 - 0x10), r = t*reach — so at spawn our
// stars pile on the centre point (r = 0) and drift out at a constant rate.
//
// render.ts draws to a live canvas (untestable in node — see starfield.test.ts),
// so the testable seam is a PURE reach law that drawStarfield applies, mirroring
// how the plane lifecycle lives in the importable starfield model.
//
// EXPECTED (Dev's green phase delivers it — src/shell/starfield.ts), reusing the
// perspective divide rather than a bespoke curve:
//   export function starReachFraction(z: number): number
//     // fraction of full reach for a plane at depth z, via the ROM's 40/(z+24)
//     // divide: 0.1515 at STAR_SPAWN_Z, 1.0 at STAR_RETIRE_Z. drawStarfield then
//     // strokes each plane's dots at r = starReachFraction(plane.z) * reach.
//
// The import fails to resolve until then, so this file REDs cleanly.
import { describe, it, expect } from 'vitest'
import {
  starReachFraction,
  STAR_SPAWN_Z,
  STAR_RETIRE_Z,
} from '../../src/shell/starfield'

describe('tp1-9 AC6 — the starfield reach is the ROM hyperbolic divide 40/(z+24) (DB-016)', () => {
  it('a fresh plane spawns at 0.152 of full reach, NOT piled on the centre point', () => {
    // The whole defect: the linear law puts a spawning plane at r = 0 (invisible
    // at centre); the cabinet already has it at ~15% of reach.
    expect(starReachFraction(STAR_SPAWN_Z)).toBeCloseTo(40 / 264, 6) // z=240 -> 0.15152
    expect(starReachFraction(STAR_SPAWN_Z)).toBeGreaterThan(0.1) // categorically not 0
  })

  it('a retiring plane reaches full reach (fraction 1.0) at the near edge', () => {
    expect(starReachFraction(STAR_RETIRE_Z)).toBeCloseTo(1, 6) // z=16 -> 40/40 = 1.0
  })

  it('the reach law is HYPERBOLIC, not linear: 1/fraction is affine in z', () => {
    // 1/(40/(z+24)) = (z+24)/40 is affine in z, so evenly spaced z give CONSTANT
    // first differences. The linear law r=(240-z)/224*reach fails this (1/r convex).
    const zs = [240, 200, 160, 120, 80, 40] // even step -40
    const inv = zs.map((z) => 1 / starReachFraction(z))
    const diffs: number[] = []
    for (let i = 1; i < inv.length; i++) diffs.push(inv[i] - inv[i - 1])
    for (const d of diffs) {
      expect(d).toBeCloseTo(diffs[0], 9) // -40/40 = -1, constant
    }
  })

  it('reach grows monotonically as a plane rushes in (spawn -> retire)', () => {
    let prev = starReachFraction(STAR_SPAWN_Z)
    for (let z = STAR_SPAWN_Z - 8; z >= STAR_RETIRE_Z; z -= 8) {
      const cur = starReachFraction(z)
      expect(cur).toBeGreaterThan(prev)
      prev = cur
    }
  })
})
