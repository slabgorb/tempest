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
