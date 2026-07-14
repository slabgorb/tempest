// tests/core/tp1-9.camera-perspective.test.ts
//
// Story tp1-9 (cluster C5) — THE CAMERA: the far/near perspective ratio is
// PER-WELL, and the far ring is built about the projected VANISHING POINT.
//
// Primary source: Theurer's 1981 assembler, ~/Projects/tempest-source-text
// (the LF copy — the CRLF sibling ~/Projects/tempest-source is NOT citable).
// ALCOMN.MAC:17 sets `.RADIX 16`, so the bytes below are HEX. Audit findings:
// docs/audit/findings/pair-4-aldisp-b-well-projection.json (DB-006, DB-007).
//
// DB-006 (CONFIRMED): the eye's Y distance behind the rim is a PER-WELL constant
//   HOLEYL[wellID] (ALDISP.MAC:1385), negated into EY. With the well spanning
//   world PY 0x10 (near rim) .. 0xF0 (far end), the far/near screen scale ratio is
//       R = (16 + H) / (240 + H),   H = HOLEYL[wellID]
//   ranging 0.104 (H=0x0A) .. 0.164 (H=0x1C). Our clone hardcodes ONE
//   FAR_RATIO = 60/300 = 0.2 for all 16 wells (geometry.ts:18) — too shallow on
//   every level. DB-005 already CONFIRMED the perspective CURVE is exactly the
//   cabinet's 1/(PY-EY) divide; only this CONSTANT diverges.
//
// DB-007 (CONFIRMED): the eye sits OFF the tube axis in Z on 15 of 16 wells
//   (HOLEZL[wellID], ALDISP.MAC:1386; stored RAW, not negated). World Z centre is
//   0x80. So the near and far rings project about DIFFERENT screen centres: the
//   far ring is built about the projected vanishing point VP, not the ring
//   centroid. We instead build far = near * FAR_RATIO about the origin
//   (geometry.ts:209) — concentric — which is only correct for the ONE on-axis
//   well (wellID 11, HOLEZL = 0x80). EX is hardcoded to the world centre 0x80, so
//   the eye is off-axis only in Z, never in X.
//
// These pins are ROM-literal and API-shape-agnostic wherever possible: the
// per-well ratio is recovered from laneWidth(0)/laneWidth(1) and from the
// far/near ring geometry, so they hold no matter how R is stored on the Tube —
// while a labelled subset pins the AC's explicit `perspectiveDepth(tube, depth)`
// signature.
import { describe, it, expect } from 'vitest'
import {
  tubeForLevel,
  makeCircleTube,
  perspectiveDepth,
  project,
  laneCenterFar,
  laneCenterNear,
  laneWidth,
  flipPivot,
  type Point,
  type Tube,
} from '../../src/core/geometry'
import * as geometry from '../../src/core/geometry'

const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y)

// The 16 well SHAPES reached by levels 1..16, with the ROM eye constants indexed
// by wellID = WELSEQ[level-1] (ALDISP.MAC:1383, our ROM_REMAP). Hand-decoded from
// the HEX byte tables and cross-checked against DB-006/DB-007:
//   HOLEYL: 18 1C 18 0F 18 18 18 18 0A 18 10 0F 18 0C 14 0A   (EYE Y, = H)
//   HOLEZL: 50 50 50 68 50 50 68 B0 A0 50 90 80 20 B0 60 A0   (EYE Z, = EZ)
// R = (16+H)/(240+H) written as an exact fraction literal so a transcription
// slip in H is caught by the decimal it produces (never derived from the code).
const WELL: ReadonlyArray<{
  level: number; wellId: number; H: number; EZ: number; R: number
}> = [
  { level: 1,  wellId: 0,  H: 24, EZ: 80,  R: 40 / 264 }, // 0.15152 circle
  { level: 2,  wellId: 1,  H: 28, EZ: 80,  R: 44 / 268 }, // 0.16418 square  (MAX)
  { level: 3,  wellId: 2,  H: 24, EZ: 80,  R: 40 / 264 }, // 0.15152 cross
  { level: 4,  wellId: 3,  H: 15, EZ: 104, R: 31 / 255 }, // 0.12157 peanut
  { level: 5,  wellId: 4,  H: 24, EZ: 80,  R: 40 / 264 }, // 0.15152
  { level: 6,  wellId: 5,  H: 24, EZ: 80,  R: 40 / 264 }, // 0.15152 triangle
  { level: 7,  wellId: 6,  H: 24, EZ: 104, R: 40 / 264 }, // 0.15152
  { level: 8,  wellId: 7,  H: 24, EZ: 176, R: 40 / 264 }, // 0.15152 (open)
  { level: 9,  wellId: 13, H: 12, EZ: 176, R: 28 / 252 }, // 0.11111 staircase
  { level: 10, wellId: 9,  H: 24, EZ: 80,  R: 40 / 264 }, // 0.15152
  { level: 11, wellId: 8,  H: 10, EZ: 160, R: 26 / 250 }, // 0.10400 flat line (MIN)
  { level: 12, wellId: 12, H: 24, EZ: 32,  R: 40 / 264 }, // 0.15152
  { level: 13, wellId: 14, H: 20, EZ: 96,  R: 36 / 260 }, // 0.13846 star
  { level: 14, wellId: 15, H: 10, EZ: 160, R: 26 / 250 }, // 0.10400 wave    (MIN)
  { level: 15, wellId: 10, H: 16, EZ: 144, R: 32 / 256 }, // 0.12500 jagged
  { level: 16, wellId: 11, H: 15, EZ: 128, R: 31 / 255 }, // 0.12157 fig-8 (ON-AXIS)
]

// geometry.ts:192 RING_SCALE — the ROM rim radius (±0x70 = ±112) mapped onto the
// original circle's near radius 300 so level 1 keeps its size. A fixed story-6-7
// design constant, NOT under audit here; pinned as a literal so the vanishing
// point below is expressed in the same units the near ring is built in.
const RING_SCALE = 300 / 112
const WORLD_CENTRE = 0x80 // 128 — world Z centre (INIDSP hardcodes EX to this too)

// Recover the near->far map's uniform scale R and its fixed point (the vanishing
// point VP) straight from the built rings, with no knowledge of how the Tube
// stores its ratio. For far[i] = VP + R*(near[i] - VP): the ring's spread scales
// by exactly R, and VP = (far[i] - R*near[i]) / (1 - R) for every i (averaged for
// float stability). On the buggy concentric build (far = R*near about 0) this
// returns VP = (0,0); the fix moves it to the off-axis vanishing point.
function recoverScaleAndVP(tube: Tube): { R: number; vp: Point } {
  const spread = (pts: readonly Point[]): number => {
    let max = 0
    for (const p of pts) for (const q of pts) max = Math.max(max, dist(p, q))
    return max
  }
  const R = spread(tube.far) / spread(tube.near)
  let vx = 0
  let vy = 0
  for (let i = 0; i < tube.near.length; i++) {
    vx += (tube.far[i].x - R * tube.near[i].x) / (1 - R)
    vy += (tube.far[i].y - R * tube.near[i].y) / (1 - R)
  }
  return { R, vp: { x: vx / tube.near.length, y: vy / tube.near.length } }
}

// The per-well far/near ratio, recovered SIGNATURE-AGNOSTICALLY from geometry:
// far chord = R * near chord for every lane, so laneWidth(lane,0)/laneWidth(lane,1)
// = R exactly, independent of the VP translation and of how R is plumbed.
function ratioFromLaneWidth(tube: Tube): number {
  const rs: number[] = []
  for (let lane = 0; lane < tube.laneCount; lane++) {
    const near = laneWidth(tube, lane, 1)
    if (near > 1) rs.push(laneWidth(tube, lane, 0) / near)
  }
  rs.sort((a, b) => a - b)
  return rs[Math.floor(rs.length / 2)] // median — robust to any degenerate lane
}

describe('tp1-9 AC1 — the far/near ratio is PER-WELL R=(16+H)/(240+H), not a flat 0.2 (DB-006)', () => {
  it('each of the 16 geometries carries its own ROM ratio (recovered from lane width)', () => {
    for (const w of WELL) {
      const r = ratioFromLaneWidth(tubeForLevel(w.level))
      expect(r).toBeCloseTo(w.R, 4) // < 0.00005: distinguishes 0.1250 (well10) from 0.1216 (well3/11)
    }
  })

  it('the ratio spans exactly the ROM range 0.104 .. 0.164 across the roster (AC: "0.104-0.164")', () => {
    const rs = WELL.map((w) => ratioFromLaneWidth(tubeForLevel(w.level)))
    expect(Math.min(...rs)).toBeCloseTo(26 / 250, 4) // 0.10400 — wells 8 & 15 (H=0x0A)
    expect(Math.max(...rs)).toBeCloseTo(44 / 268, 4) // 0.16418 — well 1 (H=0x1C)
  })

  it('NO well uses the deleted flat 0.2 — the single module ratio is gone, not merely renamed', () => {
    for (const w of WELL) {
      expect(ratioFromLaneWidth(tubeForLevel(w.level))).not.toBeCloseTo(60 / 300, 3)
    }
  })

  it('the module-level FAR_RATIO constant is DELETED (AC: "the module-level FAR_RATIO = 0.2 is deleted")', () => {
    expect('FAR_RATIO' in geometry).toBe(false)
  })
})

describe('tp1-9 AC1 — perspectiveDepth() TAKES THE TUBE and derives R from it', () => {
  // AC verbatim: "perspectiveDepth() takes the tube and derives R". Extract R from
  // the reparam: perspectiveDepth(tube, 0.5) = R/(R+1)  =>  R = pd/(1-pd).
  it('perspectiveDepth(tube, 0.5) yields the well ratio R=(16+H)/(240+H) per geometry', () => {
    for (const w of WELL) {
      const pd = perspectiveDepth(tubeForLevel(w.level), 0.5)
      expect(pd / (1 - pd)).toBeCloseTo(w.R, 4)
    }
  })

  it('keeps the endpoints bit-pinned for any well: pd(tube,0)=0, pd(tube,1)=1 (rim & claw must not move)', () => {
    for (const w of [WELL[0], WELL[7], WELL[10], WELL[15]]) {
      const t = tubeForLevel(w.level)
      expect(perspectiveDepth(t, 0)).toBe(0)
      expect(perspectiveDepth(t, 1)).toBe(1)
    }
  })
})

describe('tp1-9 AC2 — the far ring is built about the PROJECTED VANISHING POINT, not the centroid (DB-007)', () => {
  it('the vanishing point is (0, (128-EZ)*RING_SCALE) per well — off-axis in Z, centred in X', () => {
    for (const w of WELL) {
      const { vp } = recoverScaleAndVP(tubeForLevel(w.level))
      expect(vp.x).toBeCloseTo(0, 2) // EX = 0x80 (world centre) on every well
      // EZ = HOLEZL[wellID] != 0x80 on 15 of 16 wells => VP.y != 0 (the concentric
      // build gives VP.y == 0 for ALL wells and FAILS every off-axis one here).
      expect(vp.y).toBeCloseTo((WORLD_CENTRE - w.EZ) * RING_SCALE, 1)
    }
  })

  it('the recovered scale about that VP is the same per-well R as AC1 (one map, one fixed point)', () => {
    for (const w of WELL) {
      expect(recoverScaleAndVP(tubeForLevel(w.level)).R).toBeCloseTo(w.R, 4)
    }
  })

  it('the ON-AXIS well (level 16, wellID 11, HOLEZL=0x80) alone keeps a concentric far ring', () => {
    // The lone well the current concentric build gets right — the fix must not
    // shove ITS far ring off-axis. VP stays at the origin here.
    const { vp } = recoverScaleAndVP(tubeForLevel(16))
    expect(vp.x).toBeCloseTo(0, 2)
    expect(vp.y).toBeCloseTo(0, 2)
  })

  it('an off-axis well is NOT concentric: its far ring centre is displaced from the near ring centre', () => {
    // Level 8 (wellID 7, HOLEZL=0xB0=176) has the largest |128-EZ|=48. Centroids of
    // the two rings must differ by more than a rounding wobble (concentric => equal).
    const t = tubeForLevel(8)
    const centroid = (pts: readonly Point[]): Point => ({
      x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
      y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
    })
    const fc = centroid(t.far)
    const nc = centroid(t.near)
    // Concentric build: fc = R*nc, so the far centroid sits exactly on the ray
    // nc->origin. The off-axis fix pulls it off that ray by the VP displacement.
    const { R } = recoverScaleAndVP(t)
    expect(dist(fc, { x: R * nc.x, y: R * nc.y })).toBeGreaterThan(10)
  })
})

describe('tp1-9 AC5 — project / laneWidth / flipPivot funnel through the PER-WELL ratio', () => {
  // AC verbatim: "project, boundaryRail, laneWidth and flipPivot take the tube
  // rather than closing over a module constant." boundaryRail is module-private;
  // laneWidth and flipPivot exercise it. Each must reflect the tube's OWN R, not 0.2.
  const SAMPLE = [WELL[0], WELL[1], WELL[8], WELL[10]] // R = .1515, .1642, .1111, .1250

  it('project() places depth 0.5 at the perspective fraction R/(R+1) along its lane', () => {
    for (const w of SAMPLE) {
      const t = tubeForLevel(w.level)
      const lane = 2
      const f = laneCenterFar(t, lane)
      const n = laneCenterNear(t, lane)
      const frac = dist(project(t, lane, 0.5), f) / dist(n, f)
      expect(frac).toBeCloseTo(w.R / (w.R + 1), 4) // 0.2 for every well on the buggy code
    }
  })

  it('laneWidth() far/near ratio equals the well R (not the flat 0.2)', () => {
    for (const w of SAMPLE) {
      const t = tubeForLevel(w.level)
      expect(laneWidth(t, 2, 0) / laneWidth(t, 2, 1)).toBeCloseTo(w.R, 4)
    }
  })

  it('flipPivot() rides the same per-well fraction along its rim spoke', () => {
    for (const w of SAMPLE) {
      const t = tubeForLevel(w.level)
      const k = 3 // pivot vertex for lane 2, dir +1 (lane + 1)
      const frac = dist(flipPivot(t, 2, 1, 0.5), t.far[k]) / dist(t.near[k], t.far[k])
      expect(frac).toBeCloseTo(w.R / (w.R + 1), 4)
    }
  })
})

describe('tp1-9 — the per-well divide never blows up (TS lang-review #4)', () => {
  // R now varies 0.104..0.164 per well, so the divide's denominator R*d+(1-d)
  // stays in [R, 1] and never reaches 0 across depth [0,1] on ANY of the 16 wells.
  it('perspectiveDepth stays finite and in [0,1] across all 16 wells and the full depth range', () => {
    for (const w of WELL) {
      const t = tubeForLevel(w.level)
      for (const d of [0, 0.01, 0.25, 0.5, 0.75, 0.99, 1]) {
        const pd = perspectiveDepth(t, d)
        expect(Number.isFinite(pd)).toBe(true)
        expect(pd).toBeGreaterThanOrEqual(0)
        expect(pd).toBeLessThanOrEqual(1)
      }
    }
  })
})

describe('tp1-9 — makeCircleTube keeps R = farRadius/nearRadius (protects the story-10-12 perspective suite)', () => {
  // The existing geometry.perspective.test.ts drives a concentric makeCircleTube
  // whose 60/300 ratio IS 0.2. Once perspectiveDepth reads R from the tube, that
  // path must resolve R from the circle's own radii, or the whole suite REDs.
  it('perspectiveDepth(circle, 0.5) matches the circle\'s explicit far/near ratio', () => {
    const c = makeCircleTube(16, { x: 0, y: 0 }, 60, 300) // far 60, near 300 => R = 0.2
    const pd = perspectiveDepth(c, 0.5)
    expect(pd / (1 - pd)).toBeCloseTo(60 / 300, 6)
  })

  it('a shallower circle (far 150, near 300) resolves R = 0.5, proving R is read from the tube', () => {
    const c = makeCircleTube(16, { x: 0, y: 0 }, 150, 300) // R = 0.5, not the old 0.2
    const pd = perspectiveDepth(c, 0.5)
    expect(pd / (1 - pd)).toBeCloseTo(0.5, 6)
  })
})
