// src/core/modelView.ts
//
// Pure layout/geometry math for the model contact sheet (tools/contactSheet.ts):
// grid partitioning and the neutral flat board each actor performs its
// characteristic motion on. No DOM, no time, no randomness — safe under the
// core's purity rule (CLAUDE.md) and unit-tested.
//
// `cellRects` is a near-verbatim port of the Star Wars dev tool's helper
// (star-wars/src/core/modelView.ts). Two tiny copies of a grid partitioner do
// not justify a cross-repo shared library; revisit extraction at a third
// consumer (see the design doc's "Deliberate duplication").

import type { Tube, Point } from './geometry'

/** Partition a w×h area into `count` grid cells across `cols` columns (row-major). */
export function cellRects(
  w: number,
  h: number,
  count: number,
  cols: number,
): { x: number; y: number; w: number; h: number }[] {
  const c = Math.max(1, cols)
  const rows = Math.max(1, Math.ceil(count / c))
  const cw = w / c
  const ch = h / rows
  const rects: { x: number; y: number; w: number; h: number }[] = []
  for (let i = 0; i < count; i++) {
    rects.push({ x: (i % c) * cw, y: Math.floor(i / c) * ch, w: cw, h: ch })
  }
  return rects
}

// Flat-board proportions, in board-local pixels centred on the origin. The near
// rim is wide and low (the player's front rim); the far edge is narrower and
// high, so the two horizontal lines form a flat trapezoid that reads as the
// board receding. Sized near the game's own scale (near radius 300) so the
// shell's pixel-tuned glyphs look correctly proportioned on it.
const NEAR_HALF_WIDTH = 150
const FAR_HALF_WIDTH = 80
const NEAR_Y = 80 // +y is down → the near rim sits low (front)
const FAR_Y = -80 // the far edge sits high (back)

/**
 * Build the neutral flat board the contact sheet draws every actor on: an OPEN
 * tube of `lanes` lanes (so it clamps at the edges like the game's open wells)
 * carrying `lanes + 1` boundary points per rim. The near rim is a wide, low,
 * colinear horizontal line; the far edge a shorter, higher colinear line — a flat
 * trapezoid — so `project(tube, lane, depth)` reads far→near as depth climbs 0→1.
 */
export function flatTube(lanes: number): Tube {
  const denom = Math.max(1, lanes)
  const count = lanes + 1
  const near: Point[] = []
  const far: Point[] = []
  for (let i = 0; i < count; i++) {
    const t = i / denom // 0 → 1 across the boundary points
    near.push({ x: -NEAR_HALF_WIDTH + 2 * NEAR_HALF_WIDTH * t, y: NEAR_Y })
    far.push({ x: -FAR_HALF_WIDTH + 2 * FAR_HALF_WIDTH * t, y: FAR_Y })
  }
  // tp1-9: Tubes now carry their far/near scale ratio for perspectiveDepth. The
  // flat model-view tube's ratio is its far/near half-width (80/150).
  return { laneCount: lanes, closed: false, far, near, farRatio: FAR_HALF_WIDTH / NEAR_HALF_WIDTH }
}
