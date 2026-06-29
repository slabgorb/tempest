// src/core/geometry.ts

export interface Point { readonly x: number; readonly y: number }

export interface Tube {
  readonly laneCount: number
  readonly closed: boolean
  readonly far: readonly Point[]
  readonly near: readonly Point[]
}

// --- Story 10-12: true perspective depth projection --------------------------
//
// The well's documented projection parameter. The far ring is the near ring
// scaled by FAR_RATIO toward the vanishing point (the tube centre), so the far
// end sits at eye-distance 1/FAR_RATIO times the near end. (60/300 keeps level 1
// at its original size — see makeRingTube.)
export const FAR_RATIO = 60 / 300

// Depth -> perspective fraction along the far->near segment. A Tempest well is
// ONE ring scaled by a perspective DIVIDE toward the vanishing point, NOT an
// affine lerp: screen distance from the centre is ∝ 1/(eye − z). Pinning both
// endpoints (depth 0 = far ring, depth 1 = near ring, so neither the rim nor the
// claw moves) while requiring "screen radius ∝ 1/z with z linear in depth"
// yields a UNIQUE reparameterisation — one that makes 1/radius affine in depth:
//
//   perspectiveDepth(d) = R·d / (R·d + (1−d)),   R = FAR_RATIO
//
// d=0 -> exactly 0, d=1 -> exactly 1; the interior accelerates toward the near
// rim like the cabinet. (Algebraically R·d/(1+(R−1)d), but written so the
// denominator is exactly R·d at d=1 and exactly 1 at d=0, keeping the endpoints
// bit-exact — the rim and claw must not move even by a rounding ULP.) The
// denominator stays in [R, 1] over depth [0, 1], so the divide never blows up.
// Pure: the only projection state is the FAR_RATIO constant (a single documented
// vanishing-point/eye parameter). Per-level lev_y3d camera offset is a deferred
// render nicety (see the geometry ROM survey).
export function perspectiveDepth(depth: number): number {
  return (FAR_RATIO * depth) / (FAR_RATIO * depth + (1 - depth))
}

export function makeCircleTube(
  laneCount: number, center: Point, farRadius: number, nearRadius: number,
): Tube {
  const far: Point[] = []
  const near: Point[] = []
  for (let i = 0; i < laneCount; i++) {
    const a = (i / laneCount) * Math.PI * 2 - Math.PI / 2
    far.push({ x: center.x + Math.cos(a) * farRadius, y: center.y + Math.sin(a) * farRadius })
    near.push({ x: center.x + Math.cos(a) * nearRadius, y: center.y + Math.sin(a) * nearRadius })
  }
  return { laneCount, closed: true, far, near }
}

export function wrapLane(tube: Tube, lane: number): number {
  if (tube.closed) {
    return ((lane % tube.laneCount) + tube.laneCount) % tube.laneCount
  }
  return Math.max(0, Math.min(tube.laneCount - 1, lane))
}

export function currentLane(tube: Tube, laneFloat: number): number {
  return wrapLane(tube, Math.round(laneFloat))
}

function boundaryIndex(tube: Tube, i: number): number {
  if (tube.closed) {
    return ((i % tube.laneCount) + tube.laneCount) % tube.laneCount
  }
  return Math.max(0, Math.min(tube.far.length - 1, i))
}

export function laneCenterFar(tube: Tube, lane: number): Point {
  const a = tube.far[boundaryIndex(tube, lane)]
  const b = tube.far[boundaryIndex(tube, lane + 1)]
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

export function laneCenterNear(tube: Tube, lane: number): Point {
  const a = tube.near[boundaryIndex(tube, lane)]
  const b = tube.near[boundaryIndex(tube, lane + 1)]
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

export function project(tube: Tube, lane: number, depth: number): Point {
  const f = laneCenterFar(tube, lane)
  const n = laneCenterNear(tube, lane)
  const t = perspectiveDepth(depth)
  return { x: f.x + (n.x - f.x) * t, y: f.y + (n.y - f.y) * t }
}

// Project one rim boundary rail (the shared edge between two lanes) to `depth`,
// the same far->near perspective divide `project` does for lane centers.
function boundaryRail(tube: Tube, i: number, depth: number): Point {
  const idx = boundaryIndex(tube, i)
  const f = tube.far[idx]
  const n = tube.near[idx]
  const t = perspectiveDepth(depth)
  return { x: f.x + (n.x - f.x) * t, y: f.y + (n.y - f.y) * t }
}

// Story 6-17: the on-screen width of `lane` at `depth` — the distance between
// its two edge rails projected to that depth. An enemy is a fixed-size object in
// perspective, so its render size is a fraction of this: small at the far
// vanishing point, ~full lane width at the near rim. Pure; closed tubes wrap and
// open sheets clamp via boundaryIndex.
export function laneWidth(tube: Tube, lane: number, depth: number): number {
  const a = boundaryRail(tube, lane, depth)
  const b = boundaryRail(tube, lane + 1, depth)
  return Math.hypot(b.x - a.x, b.y - a.y)
}

// Story 6-18: the rim spoke a flipper pivots about when it flips from `lane`
// toward the adjacent lane in direction `dir`. Lane L spans rim vertices [L, L+1]
// (see laneCenterFar), so lanes L and L+1 share vertex L+1 and lanes L and L-1
// share vertex L: a +dir flip pivots about vertex L+1, a -dir flip about vertex
// L. Projected far->near like every other rim point, so the cartwheel pivot
// tracks perspective. Pure; closed tubes wrap and open sheets clamp via
// boundaryRail. render.ts swings the bowtie about this point so the flipper
// tumbles end-over-end over the web instead of spinning about its own centre.
export function flipPivot(tube: Tube, lane: number, dir: number, depth: number): Point {
  return boundaryRail(tube, lane + (dir > 0 ? 1 : 0), depth)
}

// --- Wave 6 (6-7): authentic ROM well geometry -------------------------------
//
// The 16 well shapes are ported verbatim from the rev-3 ROM
// (charlesUnixPro/Tempest-Source-Code, tempest.a65). Each "tube" is one ring of
// 16 rim points; depth is perspective scaling of that single ring. The
// level->shape cycle order, open/closed topology, and per-lane coordinates all
// come straight from the ROM tables. Survey + gap audit + representation ADR:
//   docs/ux/2026-06-27-tempest-geometry-rom-survey.md
//
// Coordinates are 8-bit, origin 0x80, range ~0x10..0xf0 (signed ±112), with +y
// UP in Atari vector space — we negate y for our canvas (where +y is down).

// lev_x[16][16] — tempest.a65:13734 (row = tube shape, col = segment 0..15)
const ROM_X: readonly (readonly number[])[] = [
  [0xf0, 0xe7, 0xcf, 0xaa, 0x80, 0x56, 0x31, 0x19, 0x10, 0x19, 0x31, 0x56, 0x80, 0xaa, 0xcf, 0xe7],
  [0xf0, 0xf0, 0xf0, 0xb8, 0x80, 0x48, 0x10, 0x10, 0x10, 0x10, 0x10, 0x48, 0x80, 0xb8, 0xf0, 0xf0],
  [0xf0, 0xf0, 0xb8, 0xb8, 0x80, 0x48, 0x48, 0x10, 0x10, 0x10, 0x48, 0x48, 0x80, 0xb8, 0xb8, 0xf0],
  [0xec, 0xd5, 0xb1, 0x90, 0x70, 0x4f, 0x2b, 0x14, 0x14, 0x2b, 0x4f, 0x70, 0x90, 0xb1, 0xd5, 0xec],
  [0xf0, 0xc0, 0xa0, 0x94, 0x6c, 0x60, 0x40, 0x10, 0x10, 0x40, 0x60, 0x6c, 0x94, 0xa0, 0xc0, 0xf0],
  [0xd9, 0xc2, 0xac, 0x97, 0x80, 0x69, 0x52, 0x3c, 0x27, 0x10, 0x35, 0x5a, 0x80, 0xa6, 0xca, 0xf0],
  [0xea, 0xe0, 0x9c, 0x80, 0x64, 0x20, 0x16, 0x50, 0x16, 0x20, 0x64, 0x80, 0x9c, 0xe0, 0xea, 0xb0],
  [0x10, 0x1e, 0x2c, 0x3a, 0x48, 0x56, 0x64, 0x70, 0x90, 0x9e, 0xac, 0xba, 0xc8, 0xd6, 0xe4, 0xf0],
  [0x10, 0x1e, 0x2d, 0x3c, 0x4b, 0x5a, 0x69, 0x78, 0x87, 0x96, 0xa5, 0xb4, 0xc3, 0xd2, 0xe1, 0xf0],
  [0x10, 0x10, 0x10, 0x10, 0x16, 0x29, 0x46, 0x69, 0x97, 0xba, 0xd7, 0xea, 0xf0, 0xf0, 0xf0, 0xf0],
  [0x10, 0x24, 0x30, 0x36, 0x3e, 0x49, 0x5a, 0x75, 0x94, 0xa4, 0xac, 0xba, 0xda, 0xe2, 0xea, 0xf0],
  [0x80, 0x70, 0x48, 0x20, 0x10, 0x20, 0x48, 0x70, 0x80, 0x90, 0xb8, 0xe0, 0xf0, 0xe0, 0xb8, 0x90],
  [0xda, 0xa4, 0x87, 0x80, 0x79, 0x5c, 0x26, 0x10, 0x10, 0x20, 0x48, 0x80, 0xb8, 0xe0, 0xf0, 0xf0],
  [0x10, 0x10, 0x30, 0x30, 0x50, 0x50, 0x70, 0x70, 0x90, 0x90, 0xb0, 0xb0, 0xd0, 0xd0, 0xf0, 0xf0],
  [0xb0, 0x80, 0x50, 0x47, 0x18, 0x30, 0x18, 0x47, 0x50, 0x80, 0xb0, 0xb9, 0xe8, 0xd4, 0xe8, 0xb9],
  [0x10, 0x1e, 0x21, 0x28, 0x3c, 0x55, 0x66, 0x73, 0x8d, 0x9a, 0xab, 0xc4, 0xd8, 0xdf, 0xe2, 0xf0],
]

// lev_y[16][16] — tempest.a65:13754
const ROM_Y: readonly (readonly number[])[] = [
  [0x80, 0xaa, 0xcf, 0xe7, 0xf0, 0xe7, 0xcf, 0xaa, 0x80, 0x56, 0x31, 0x19, 0x10, 0x19, 0x31, 0x56],
  [0x80, 0xb8, 0xf0, 0xf0, 0xf0, 0xf0, 0xf0, 0xb8, 0x80, 0x48, 0x10, 0x10, 0x10, 0x10, 0x10, 0x48],
  [0x80, 0xb8, 0xb8, 0xf0, 0xf0, 0xf0, 0xb8, 0xb8, 0x80, 0x48, 0x48, 0x10, 0x10, 0x10, 0x48, 0x48],
  [0x94, 0xb0, 0xb8, 0xa7, 0xa7, 0xb8, 0xb0, 0x94, 0x6c, 0x50, 0x48, 0x59, 0x59, 0x48, 0x50, 0x6c],
  [0x96, 0xa3, 0xc5, 0xf0, 0xf0, 0xc5, 0xa3, 0x96, 0x6a, 0x5d, 0x3b, 0x10, 0x10, 0x3b, 0x5d, 0x6a],
  [0x3d, 0x6a, 0x97, 0xc4, 0xf0, 0xc4, 0x97, 0x6a, 0x3d, 0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x10],
  [0xa0, 0xe0, 0xea, 0xb0, 0xea, 0xe0, 0xa0, 0x80, 0x60, 0x20, 0x16, 0x50, 0x16, 0x20, 0x60, 0x80],
  [0xf0, 0xd0, 0xb0, 0x90, 0x70, 0x50, 0x30, 0x10, 0x10, 0x30, 0x50, 0x70, 0x90, 0xb0, 0xd0, 0xf0],
  [0x40, 0x40, 0x40, 0x40, 0x40, 0x40, 0x40, 0x40, 0x40, 0x40, 0x40, 0x40, 0x40, 0x40, 0x40, 0x40],
  [0xf0, 0xcb, 0xa6, 0x80, 0x5c, 0x39, 0x20, 0x12, 0x12, 0x20, 0x39, 0x5c, 0x80, 0xa6, 0xcb, 0xf0],
  [0xc0, 0xa6, 0x8a, 0x6a, 0x4a, 0x2f, 0x14, 0x24, 0x20, 0x39, 0x59, 0x75, 0x72, 0x90, 0xb0, 0xd0],
  [0x80, 0x57, 0x48, 0x57, 0x80, 0xa9, 0xba, 0xa9, 0x80, 0x57, 0x48, 0x57, 0x80, 0xa9, 0xba, 0xa9],
  [0xe4, 0xe8, 0xb7, 0x80, 0xb7, 0xe8, 0xe4, 0xb2, 0x7a, 0x47, 0x20, 0x10, 0x20, 0x47, 0x7a, 0xb2],
  [0x90, 0x70, 0x70, 0x50, 0x50, 0x30, 0x30, 0x10, 0x10, 0x30, 0x30, 0x50, 0x50, 0x70, 0x70, 0x90],
  [0xe6, 0xd0, 0xe6, 0xb9, 0xae, 0x80, 0x52, 0x47, 0x14, 0x30, 0x14, 0x47, 0x52, 0x80, 0xae, 0xb9],
  [0x7e, 0x6a, 0x51, 0x3a, 0x2c, 0x2c, 0x38, 0x4e, 0x4e, 0x38, 0x2c, 0x2c, 0x3a, 0x51, 0x6a, 0x7e],
]

// lev_open[16] — tempest.a65:13812 (0x00 = closed tube, 0xff = open sheet)
const ROM_OPEN: readonly number[] = [
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0xff, 0x00, 0x00, 0xff, 0x00, 0xff,
]

// lev_remap[16] — tempest.a65:13792 (level mod 16 -> tube shape index; the cycle order)
const ROM_REMAP: readonly number[] = [
  0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x0d, 0x09, 0x08, 0x0c, 0x0e, 0x0f, 0x0a, 0x0b,
]

const ROM_CENTER = 0x80
// Map the ROM rim radius (±112) onto the original circle's near radius (300) so
// level 1 keeps its size; the far end is the same ring scaled toward the centre
// by FAR_RATIO (the 60/300 depth ratio defined at the top as the projection
// parameter). Per-level lev_y3d vanishing-point fidelity is a render follow-up —
// see the survey's ADR.
const RING_SCALE = 300 / 112

// Build a Tube from one authentic 16-point ring. Closed wells wrap (16 lanes);
// open sheets clamp (15 lanes) but still carry all 16 rim points (laneCount + 1).
// A self-crossing ring (the figure-8: seg0 == seg8 == origin) is just an ordered
// point list — lanes are indices, so the crossing is purely a render-space
// overlap and the simulation is unaffected.
function makeRingTube(tube: number): Tube {
  const closed = ROM_OPEN[tube] === 0x00
  const near: Point[] = []
  const far: Point[] = []
  for (let i = 0; i < 16; i++) {
    const sx = ROM_X[tube][i] - ROM_CENTER
    const sy = ROM_Y[tube][i] - ROM_CENTER
    const x = sx * RING_SCALE
    const y = sy === 0 ? 0 : -sy * RING_SCALE // negate: ROM +y up -> canvas +y down
    near.push({ x, y })
    far.push({ x: x * FAR_RATIO, y: y * FAR_RATIO })
  }
  return { laneCount: closed ? 16 : 15, closed, far, near }
}

// The 16 geometries in arcade cycle order: GEOMETRIES[(level - 1) mod 16].
// Built once (immutable, shared) — never mutated.
const GEOMETRIES: readonly Tube[] = ROM_REMAP.map(makeRingTube)

// Pure: cycles the table with period 16, repeating geometry on later passes
// (difficulty keeps climbing via levelParams). No RNG, no time. Total over all
// integer levels.
export function tubeForLevel(level: number): Tube {
  const n = GEOMETRIES.length
  return GEOMETRIES[(((level - 1) % n) + n) % n]
}
