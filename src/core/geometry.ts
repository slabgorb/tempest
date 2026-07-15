// src/core/geometry.ts

export interface Point { readonly x: number; readonly y: number }

export interface Tube {
  readonly laneCount: number
  readonly closed: boolean
  readonly far: readonly Point[]
  readonly near: readonly Point[]
  // tp1-9 (DB-006): the PER-WELL far/near screen-scale ratio R = (16+H)/(240+H),
  // H = the ROM's per-well eye-Y distance HOLEYL[wellID]. Replaces the old single
  // module-level FAR_RATIO 0.2. perspectiveDepth reads it, so project/boundaryRail/
  // laneWidth/flipPivot all foreshorten by THIS well's ratio, not a global.
  readonly farRatio: number
  // tp1-31 (DB-008): the per-well SCREEN Z VANISH PT translation (ZADJL, from
  // HOLZAD/HOLZDH ALDISP.MAC:1387-1388) — a whole-well screen translate in
  // canvas-y ring units. ZADJ is added POST-divide in ROM screen units (WORSCR:
  // SCREEN Z = [FACTOR/(PY-EY)]*(PZ-EZ)+SZCENT, ALDISP.MAC:2049-2051, FACTOR =
  // 256 via the math-box high-byte load; ADC ZADJL at :2274), where the rim
  // spans 256·112/(16+H) — so the rim-relative port is -ZADJ·(16+H)·S/256,
  // damped by VIEWPORT_SAFE_SCALE (tp1-32) so the shifted rim never clips.
  // The level-start slide toward this target lives in GameState.camera.
  readonly screenZ: number
}

// --- Story 10-12 / tp1-9: true perspective depth projection ------------------
//
// Depth -> perspective fraction along the far->near segment. A Tempest well is
// ONE ring scaled by a perspective DIVIDE toward the vanishing point, NOT an
// affine lerp: screen distance from the centre is ∝ 1/(eye − z). Pinning both
// endpoints (depth 0 = far ring, depth 1 = near ring, so neither the rim nor the
// claw moves) while requiring "screen radius ∝ 1/z with z linear in depth"
// yields a UNIQUE reparameterisation — one that makes 1/radius affine in depth:
//
//   perspectiveDepth(tube, d) = R·d / (R·d + (1−d)),   R = tube.farRatio
//
// tp1-9 (DB-006): R is now PER-WELL — the ROM's (16+H)/(240+H), H=HOLEYL[wellID],
// ranging 0.104..0.164 — NOT a single 0.2. perspectiveDepth therefore takes the
// tube and reads its ratio; every well foreshortens by its own eye distance.
//
// d=0 -> exactly 0, d=1 -> exactly 1; the interior accelerates toward the near
// rim like the cabinet. (Algebraically R·d/(1+(R−1)d), but written so the
// denominator is exactly R·d at d=1 and exactly 1 at d=0, keeping the endpoints
// bit-exact — the rim and claw must not move even by a rounding ULP.) With R in
// [0.104, 1] the denominator stays in [R, 1] over depth [0, 1], so the divide
// never blows up. Pure: the only projection state is the tube's own ratio.
export function perspectiveDepth(tube: Tube, depth: number): number {
  const r = tube.farRatio
  return (r * depth) / (r * depth + (1 - depth))
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
  // A synthetic circle's ratio IS its far/near radius ratio (60/300 = 0.2 for the
  // canonical level-1 ring), concentric about `center` so its vanishing point is
  // the centre. perspectiveDepth reads this the same way it reads a ROM well's.
  // tp1-31: synthetic tubes carry no screen translate.
  return { laneCount, closed: true, far, near, farRatio: farRadius / nearRadius, screenZ: 0 }
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
  const t = perspectiveDepth(tube, depth)
  return { x: f.x + (n.x - f.x) * t, y: f.y + (n.y - f.y) * t }
}

// Project one rim boundary rail (the shared edge between two lanes) to `depth`,
// the same far->near perspective divide `project` does for lane centers.
function boundaryRail(tube: Tube, i: number, depth: number): Point {
  const idx = boundaryIndex(tube, i)
  const f = tube.far[idx]
  const n = tube.near[idx]
  const t = perspectiveDepth(tube, depth)
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

// tp1-9 (DB-006/DB-007): the per-well EYE, indexed by wellID. From Theurer's 1981
// source ALDISP.MAC (.RADIX 16 per ALCOMN.MAC:17):
//   HOLEYL — EYE POSITION (Y), ALDISP.MAC:1385. The eye's Y distance behind the
//     rim; the far/near screen ratio is R = (16+H)/(240+H), H = HOLEYL[wellID].
//   HOLEZL — EYE POSITION (Z), ALDISP.MAC:1386. The eye's Z; the far ring is
//     scaled about the projected vanishing point, off the world Z centre 0x80 on
//     every well but wellID 11. (EX is hardcoded to the centre 0x80, so X is
//     never off-axis.)
const ROM_EYE_Y: readonly number[] = [
  0x18, 0x1c, 0x18, 0x0f, 0x18, 0x18, 0x18, 0x18, 0x0a, 0x18, 0x10, 0x0f, 0x18, 0x0c, 0x14, 0x0a,
]
const ROM_EYE_Z: readonly number[] = [
  0x50, 0x50, 0x50, 0x68, 0x50, 0x50, 0x68, 0xb0, 0xa0, 0x50, 0x90, 0x80, 0x20, 0xb0, 0x60, 0xa0,
]

// tp1-31 (DB-008): HOLZDH:HOLZAD (ALDISP.MAC:1387-1388) — ";CENTER ADJUST", the
// signed 16-bit per-well SCREEN Z VANISH PT (ZADJL, ALCOMN.MAC:543), combined.
// X is never adjusted ("X SCREEN CENTER" = 0, ALDISP.MAC:2507).
const ROM_ZADJ: readonly number[] = [
  -192, -224, -192, -128, -192, -192, -144, 96, 256, -224, 64, 0, -352, 320, -192, 256,
]
// WORSCR's fixed-point projection factor: the numerator rides the math-box HIGH
// byte (×256), so screen = 256·world/(PY−EY) (ALDISP.MAC:2049-2051) — ZADJ is in
// THOSE units, where the rim spans 256·112/(16+H).
const ROM_SCREEN_FACTOR = 256

// tp1-32: the raw ROM SCREEN-Z target (−ZADJ·(16+H)·S/256, applied below) is
// faithful to the ROM's screen geometry, but our near ring already spans ±300
// against the phosphor scene's ±360 half-box — proportionally far more of the
// frame than the ROM's rim filled its taller screen. Applied undiluted the shift
// drove the near rim (and the Claw on it) OFF-SCREEN for ~half the 16 wells
// (worst: well shape 12, rim at +300 plus the largest +target → |y| ≈ 447 vs the
// ±360 box). Damp every well's shift by this UNIFORM viewport-safe fraction so
// even the deepest well's near rim lands inside the box: the binding well
// (shape 12) needs the factor ≤ ~0.27, and 0.25 leaves a few units under the
// ±340 safe band (tests/core/tp1-32.framing-viewport.test.ts). Uniform, so every
// well keeps its ROM high/low ORDERING and direction — the exact magnitude of the
// framing is a play-test tune, not a pinned ROM byte.
const VIEWPORT_SAFE_SCALE = 0.25

const ROM_CENTER = 0x80
// Map the ROM rim radius (±112) onto the original circle's near radius (300) so
// level 1 keeps its size. The far end is the same ring scaled toward the per-well
// vanishing point by that well's ratio R (see makeRingTube / DB-006).
const RING_SCALE = 300 / 112

// Build a Tube from one authentic 16-point ring. Closed wells wrap (16 lanes);
// open sheets clamp (15 lanes) but still carry all 16 rim points (laneCount + 1).
// A self-crossing ring (the figure-8: seg0 == seg8 == origin) is just an ordered
// point list — lanes are indices, so the crossing is purely a render-space
// overlap and the simulation is unaffected.
//
// tp1-9 perspective (DB-006/DB-007): the far ring is the near ring scaled by the
// per-well ratio R = (16+H)/(240+H) (H = ROM_EYE_Y[wellID]) ABOUT the projected
// vanishing point VP, not the ring centroid. The eye sits on the world X centre
// (0x80) but off-axis in Z at ROM_EYE_Z[wellID], so in our near-ring coordinates
// VP = (0, (0x80 − EZ)·RING_SCALE) — the origin only on wellID 11 (EZ = 0x80),
// the one concentric well. Scaling a ring about VP by R reproduces the cabinet's
// 1/(PY−EY) divide (DB-005 proved the curve; this seats its constants).
function makeRingTube(tube: number): Tube {
  const closed = ROM_OPEN[tube] === 0x00
  const H = ROM_EYE_Y[tube]
  const farRatio = (16 + H) / (240 + H)
  const vpY = (ROM_CENTER - ROM_EYE_Z[tube]) * RING_SCALE // vanishing point (VP.x = 0)
  const near: Point[] = []
  const far: Point[] = []
  for (let i = 0; i < 16; i++) {
    const sx = ROM_X[tube][i] - ROM_CENTER
    const sy = ROM_Y[tube][i] - ROM_CENTER
    const x = sx * RING_SCALE
    const y = sy === 0 ? 0 : -sy * RING_SCALE // negate: ROM +y up -> canvas +y down
    near.push({ x, y })
    // far[i] = VP + R·(near[i] − VP); VP.x = 0, so far.x is simply R·x.
    far.push({ x: x * farRatio, y: vpY + (y - vpY) * farRatio })
  }
  // tp1-31 (DB-008): ZADJ is a ROM SCREEN-unit quantity (post-divide — see
  // Tube.screenZ); the rim there spans ROM_SCREEN_FACTOR·112/(16+H) against our
  // 300, so the rim-relative translate is -ZADJ·(16+H)·RING_SCALE/256, canvas-y.
  // tp1-32: damped by VIEWPORT_SAFE_SCALE so the shifted near rim stays on-screen.
  const screenZ =
    (-ROM_ZADJ[tube] * (16 + H) * RING_SCALE * VIEWPORT_SAFE_SCALE) / ROM_SCREEN_FACTOR
  return { laneCount: closed ? 16 : 15, closed, far, near, farRatio, screenZ }
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

// tp1-33 (WD-012): THE MOVING EYE. During the warp DIVE the eye advances by the
// SAME velocity as the cursor every frame (MOVCUD, "LDA EYLL / ADC CURSVL",
// ALWELG.MAC:1049-1062), so (CURSY − EY) is invariant — the Claw's projected size
// stays fixed while the well's rim/floor near the advancing eye, and the tube
// expands and streams past the stationary Claw. INIWLS freezes YDEUNI at 16+H
// (ALDISP.MAC:2464-2506), so the scale is NOT recomputed as the eye moves; over the
// descent the eye covers the FULL along-span (WARP_ALONG_SPAN = 0xF0−0x10 = 224).
// The far end's foreshortening ratio relative to the fixed rim therefore grows
//     R_eff(progress) = (16+H)/((240+H) − 224·progress),  H = ROM_EYE_Y[wellID]
// from the well's static R = (16+H)/(240+H) at progress 0 (no pop) to exactly 1.0
// (flat) at the bottom. H cancels when written in terms of R alone:
//     R_eff = R / (1 − progress·(1 − R))
// This returns the effective EXPANDING well for a dive progress: the NEAR ring
// (rim/Claw) is held FIXED and every far vertex slides toward its own near vertex
// by k = (1 − progress)/(1 − progress·(1 − R)) — a scale about the same per-well
// vanishing point, so the whole existing projection pipeline (perspectiveDepth/
// project/laneWidth) reuses it. Exact at both endpoints (k=1 → the static far ring,
// k=0 → the near ring). Pure: no eye/VP recovery, no state, no time. Phase-2 (the
// post-descent fly-in INTO the new well, WD-018) is a separate movement and keeps
// its shipped countdown placeholder.
export function warpDiveTube(tube: Tube, progress: number): Tube {
  const R = tube.farRatio
  const denom = 1 - progress * (1 - R)
  const k = (1 - progress) / denom
  const near = tube.near
  const far = tube.far.map((f, i) => ({
    x: near[i].x + (f.x - near[i].x) * k,
    y: near[i].y + (f.y - near[i].y) * k,
  }))
  return { ...tube, far, farRatio: R / denom }
}

// tp1-37 (WD-018): the per-well eye DESTINATION for the NEWAV2 fly-in. INIWLS sets
// EYLDES = -HOLEYL[wellID] (two's complement of the eye-Y, ALDISP.MAC:2470-2475), so
// the destination is -H. H is the same per-well eye-Y baked into farRatio = (16+H)/
// (240+H), recovered exactly (H is an integer ROM byte): H = (240·r - 16)/(1 - r).
export function warpEyeDest(tube: Tube): number {
  const r = tube.farRatio
  return -Math.round((240 * r - 16) / (1 - r))
}

// --- Story 12-1: rim-anchored ROM CURSOR (claw) transform --------------------
//
// The player CURSOR is a FIXED-SIZE screen-space object pinned to the near rim —
// NEVER built from interior tube depths. The old claw anchored its body at
// interior depths 0.74/0.90; under story 10-12's perspective divide those
// collapsed toward the vanishing point and stretched the claw ~2.5x. Anchoring
// to the rim (depth 1.0) restores ROM fidelity and structurally immunises the
// claw against future projection reworks. This pure transform hands render.ts
// everything it needs to place the authentic NCRS glyph.
export interface ClawTransform {
  readonly anchor: Point   // rim lane-centre of the DISCRETE segment (the claw steps, not slides)
  readonly scale: number   // fixed screen footprint ∝ rim lane-width
  readonly rotation: number// the lane's radial angle, so the claw lies along it
  readonly roll: number    // authentic per-sub-lane graphic index 0..7 → NCRS(roll+1)
}

// The NCRS claw glyphs span ~8 ROM units; on-screen the claw FILLS its rim lane
// — the widest graphic spans the full lane-width (prongs at the lane edges), so
// the cursor sits large on the rim like the arcade (still rim-anchored, never
// stretching into the tube toward the vanishing point — that radial-depth
// stretch was the original bug).
const CLAW_GLYPH_UNITS = 8
const CLAW_FOOTPRINT_FRACTION = 1.0

// Compute the claw's rim anchor, fixed size, lane-radial rotation, and authentic
// per-sub-lane graphic roll. Pure — screen-space Points only, no canvas/DOM.
//
// The claw STEPS between discrete segments and LEANS into its travel as it goes —
// it does NOT slide continuously. This is the ROM's "walk": `draw_player` draws
// the cursor at `player_seg` (the whole-segment index), while the fine sub-position
// rolls the shape through its 8 poses. The roll is synced to the step (see `roll`
// below), so the apex leans the way the spinner is turning and plants on the next
// segment as the stride completes — the claw crawls the rim rather than looping a
// detached animation.
export function clawTransform(tube: Tube, lane: number): ClawTransform {
  // discrete segment the claw stands on (round + wrap/clamp) — the STEP.
  const seg = currentLane(tube, lane)
  // anchor: this segment's rim (near) lane-centre; project(...,1.0) == near, so it
  // never depends on the far ring / perspective divide — only the rim.
  const anchor = laneCenterNear(tube, seg)
  // rotation: the lane's far->near screen direction, so the claw sits along its
  // lane. Uses the far ring (orientation follows geometry), never the claw size.
  const far = laneCenterFar(tube, seg)
  const rotation = Math.atan2(anchor.y - far.y, anchor.x - far.x) + Math.PI / 2
  // scale: a fixed fraction of THIS segment's rim lane-width (depth 1.0) — a fixed
  // footprint per segment, independent of any interior-depth projection.
  const width = laneWidth(tube, seg, 1.0)
  const scale = (width * CLAW_FOOTPRINT_FRACTION) / CLAW_GLYPH_UNITS
  // roll: the WALK animation (tempest.a65 draw_player):
  //   graphic = ((player_position >> 1) & 7) + 1
  // The roll IS the lean: the claw's apex slides left→right across graphics 1→7
  // (see glyphs.ts CLAW_DELTAS), so sweeping the roll leans the cursor. What makes
  // it read as a WALK and not a detached loop is SYNC — the roll must run in phase
  // with the step. So we sweep it monotonically across THIS step's window,
  // [seg-0.5, seg+0.5) (the same half-lane window `seg = round(lane)` holds), and
  // wrap it exactly where the anchor snaps: `u` is the fractional progress across
  // the step (0 at the left boundary → 1 at the right), so `roll = floor(u·8)`
  // climbs 0→7 and resets precisely as the foot plants on the next segment.
  // Turning the spinner one way sweeps the apex that way and steps as the stride
  // completes; turning back replays it in reverse — the lean always leads the
  // foot. (graphic 8 / roll 7 is the ROM's beam-off "bridge" frame, right at the
  // step.) Because `seg` and `u` share `Math.round`, the two never drift out of
  // phase the way the old integer-boundary fine position did.
  const u = (lane - Math.round(lane)) + 0.5 // ∈ [0, 1): progress across this step
  const roll = Math.min(7, Math.floor(u * 8))
  return { anchor, scale, rotation, roll }
}
