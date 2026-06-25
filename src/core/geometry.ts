// src/core/geometry.ts

export interface Point { readonly x: number; readonly y: number }

export interface Tube {
  readonly laneCount: number
  readonly closed: boolean
  readonly far: readonly Point[]
  readonly near: readonly Point[]
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
  return { x: f.x + (n.x - f.x) * depth, y: f.y + (n.y - f.y) * depth }
}

// --- Wave 3: the 16-geometry roster ------------------------------------------

// A closed regular-polygon tube. sides=4 → square, 3 → triangle, etc. Boundary
// points are sampled evenly by angle around the polygon perimeter (flat sides +
// corners), with exactly laneCount points (boundaries wrap, like the circle).
export function makePolygonTube(
  laneCount: number, sides: number, center: Point, farRadius: number, nearRadius: number,
): Tube {
  const far: Point[] = []
  const near: Point[] = []
  for (let i = 0; i < laneCount; i++) {
    const t = i / laneCount
    far.push(polygonPoint(center, farRadius, sides, t))
    near.push(polygonPoint(center, nearRadius, sides, t))
  }
  return { laneCount, closed: true, far, near }
}

// Point on a regular `sides`-gon of circumradius `radius`, at fraction `t` ∈ [0,1)
// around the perimeter, starting from the top.
function polygonPoint(center: Point, radius: number, sides: number, t: number): Point {
  const a = t * Math.PI * 2 - Math.PI / 2
  const seg = (Math.PI * 2) / sides
  const rel = (((a + Math.PI / 2) % seg) + seg) % seg
  const r = (radius * Math.cos(seg / 2)) / Math.cos(rel - seg / 2)
  return { x: center.x + Math.cos(a) * r, y: center.y + Math.sin(a) * r }
}

// An open "fan" strip tube: far points converge near the top, near points fan
// out toward the player rim. `profile(t)` ∈ [0,1] bows the strip (V, U, step…).
// Open tubes carry laneCount+1 boundary points (boundaries clamp, no wrap).
export function makeOpenTube(
  laneCount: number, center: Point, halfWidth: number, profile: (t: number) => number,
): Tube {
  const far: Point[] = []
  const near: Point[] = []
  for (let i = 0; i <= laneCount; i++) {
    const t = i / laneCount
    const dip = profile(t)
    far.push({ x: center.x + (t - 0.5) * halfWidth * 0.3, y: center.y - 60 + dip * 30 })
    near.push({ x: center.x + (t - 0.5) * halfWidth, y: center.y + 220 + dip * 90 })
  }
  return { laneCount, closed: false, far, near }
}

const FLAT = (): number => 0
const SHALLOW_V = (t: number): number => Math.abs(t - 0.5)
const DEEP_V = (t: number): number => Math.abs(t - 0.5) * 2
const BOWL = (t: number): number => (2 * (t - 0.5)) ** 2
const W = (t: number): number => Math.abs(((t * 2) % 1) - 0.5) * 2
const STEP = (t: number): number => (t < 0.5 ? 0 : 1)
const RAMP = (t: number): number => t
const HUMP = (t: number): number => 1 - Math.abs(t - 0.5) * 2

const GEO_CENTER: Point = { x: 0, y: 0 }

// 16 distinct geometries (8 closed, 8 open). Index 0 is the original circle so
// level 1 is unchanged. Built once (immutable, shared) — never mutated.
const GEOMETRIES: readonly Tube[] = [
  makeCircleTube(16, GEO_CENTER, 60, 300),        // 1  circle
  makePolygonTube(16, 4, GEO_CENTER, 70, 320),    // 2  square
  makeOpenTube(16, GEO_CENTER, 640, FLAT),        // 3  flat line
  makePolygonTube(12, 3, GEO_CENTER, 80, 340),    // 4  triangle
  makeOpenTube(14, GEO_CENTER, 600, SHALLOW_V),   // 5  shallow V
  makePolygonTube(15, 5, GEO_CENTER, 70, 320),    // 6  pentagon
  makeOpenTube(16, GEO_CENTER, 640, DEEP_V),      // 7  deep V
  makePolygonTube(12, 6, GEO_CENTER, 70, 320),    // 8  hexagon
  makeOpenTube(16, GEO_CENTER, 640, BOWL),        // 9  U / bowl
  makePolygonTube(16, 8, GEO_CENTER, 70, 320),    // 10 octagon
  makeOpenTube(16, GEO_CENTER, 640, W),           // 11 W zigzag
  makePolygonTube(14, 7, GEO_CENTER, 70, 320),    // 12 heptagon
  makeOpenTube(12, GEO_CENTER, 560, STEP),        // 13 step
  makePolygonTube(12, 4, GEO_CENTER, 70, 320),    // 14 small square
  makeOpenTube(16, GEO_CENTER, 640, RAMP),        // 15 ramp
  makeOpenTube(16, GEO_CENTER, 640, HUMP),        // 16 hump
]

// Pure: cycles the table with period 16, repeating geometry on later passes
// (difficulty keeps climbing via levelParams). No RNG, no time.
export function tubeForLevel(level: number): Tube {
  const n = GEOMETRIES.length
  return GEOMETRIES[(((level - 1) % n) + n) % n]
}
