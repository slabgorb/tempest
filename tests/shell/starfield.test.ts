// tests/shell/starfield.test.ts
//
// Story 10-4 (AC1) — RED suite for the 8-plane warp starfield.
//
// The warp dive shows a layered starfield rushing outward from screen centre.
// render.ts draws to a live canvas (untestable in the node env — phosphor needs
// `document`), so — exactly like the 6-8 glyphs and the 6-12 audio dispatcher —
// the testable seam is a PURE, importable model that owns the plane lifecycle
// with the documented ROM constants. render.ts then just strokes its `planes`.
//
// The book's "star planes" chapter pins the constants (see context-story-10-4.md):
//   8 planes · spawn Z 0xF0 (240) · step -7/frame · spawn-next at 0xD5 (213) ·
//   retire at 0x10 (16) · 4 reused star pictures.
//
// EXPECTED MODULE (Dev's green phase delivers it — src/shell/starfield.ts):
//   export interface StarPlane {
//     readonly z: number        // depth: STAR_SPAWN_Z (240) → retires at STAR_RETIRE_Z (16)
//     readonly picture: number  // 0..3 — which of the 4 reused star pictures
//   }
//   export interface Starfield {
//     readonly planes: readonly StarPlane[]  // live planes, newest last
//     step(): void                            // advance ONE frame (move -7, retire, spawn)
//     reset(): void                           // clear all planes (warp re-entry)
//   }
//   export function createStarfield(): Starfield
//   export const STAR_SPAWN_Z: number       // 0xF0 = 240
//   export const STAR_STEP: number          // 7   (per-frame Z decrement)
//   export const STAR_SPAWN_NEXT_Z: number  // 0xD5 = 213
//   export const STAR_RETIRE_Z: number      // 0x10 = 16
//   export const STAR_PLANES: number        // 8   (max concurrent planes)
//   export const STAR_PICTURES: number      // 4   (distinct, reused pictures)
//
// Contract for step(), one frame: (1) move every plane z -= STAR_STEP;
// (2) retire planes with z <= STAR_RETIRE_Z; (3) if under the STAR_PLANES cap AND
// the field is empty OR the newest plane has descended to <= STAR_SPAWN_NEXT_Z,
// spawn a fresh plane at z === STAR_SPAWN_Z with the next reused picture index.
//
// None of this exists yet, so the named imports below fail to resolve and the
// whole file REDs — a clean failing state for Dev to drive green.
import { describe, it, expect } from 'vitest'
import {
  createStarfield,
  STAR_SPAWN_Z,
  STAR_STEP,
  STAR_SPAWN_NEXT_Z,
  STAR_RETIRE_Z,
  STAR_PLANES,
  STAR_PICTURES,
} from '../../src/shell/starfield'
// Read the new module as text to guard the type-safety boundary (TS lang-review #1).
import starfieldSrc from '../../src/shell/starfield.ts?raw'

// Run the field forward, snapshotting the plane list AFTER each step so invariants
// can be asserted across the whole lifecycle (not just one lucky frame).
function run(frames: number): ReadonlyArray<ReadonlyArray<{ z: number; picture: number }>> {
  const field = createStarfield()
  const history: { z: number; picture: number }[][] = []
  for (let i = 0; i < frames; i++) {
    field.step()
    history.push(field.planes.map((p) => ({ z: p.z, picture: p.picture })))
  }
  return history
}

describe('starfield — documented ROM constants (AC1)', () => {
  it('exposes the book "star planes" constants with their exact values', () => {
    expect(STAR_SPAWN_Z).toBe(0xf0) // 240
    expect(STAR_STEP).toBe(7)
    expect(STAR_SPAWN_NEXT_Z).toBe(0xd5) // 213
    expect(STAR_RETIRE_Z).toBe(0x10) // 16
    expect(STAR_PLANES).toBe(8)
    expect(STAR_PICTURES).toBe(4)
  })
})

describe('starfield — plane lifecycle (AC1)', () => {
  it('starts empty and spawns the first plane at the spawn Z on the first step', () => {
    const field = createStarfield()
    expect(field.planes).toHaveLength(0)
    field.step()
    expect(field.planes).toHaveLength(1)
    expect(field.planes[0].z).toBe(STAR_SPAWN_Z) // 240, exactly — no premature step
  })

  it('steps a lone plane by exactly -STAR_STEP per frame (no early second spawn)', () => {
    const field = createStarfield()
    field.step() // [240]
    field.step() // 240 -> 233; 233 > 213 so nothing new spawns yet
    expect(field.planes).toHaveLength(1)
    expect(field.planes[0].z).toBe(STAR_SPAWN_Z - STAR_STEP) // 233
  })

  it('spawns the next plane only once the newest has descended to <= the spawn-next Z', () => {
    // Whenever a freshly-spawned plane (z === 240) sits alongside others, every
    // OTHER plane must already be at/below 0xD5 (213): that IS the spawn-next rule.
    const history = run(400)
    for (const planes of history) {
      const hasFresh = planes.some((p) => p.z === STAR_SPAWN_Z)
      if (hasFresh && planes.length > 1) {
        for (const p of planes) {
          if (p.z !== STAR_SPAWN_Z) {
            expect(p.z).toBeLessThanOrEqual(STAR_SPAWN_NEXT_Z)
          }
        }
      }
    }
    // And prove the staircase: a second plane never appears while the first is
    // still above the threshold (catches a too-eager spawn cadence).
    const f = createStarfield()
    let sawSecond = false
    for (let i = 0; i < 40 && !sawSecond; i++) {
      f.step()
      if (f.planes.length === 2) {
        sawSecond = true
        const older = Math.max(...f.planes.map((p) => p.z).filter((z) => z !== STAR_SPAWN_Z))
        expect(older).toBeLessThanOrEqual(STAR_SPAWN_NEXT_Z)
      }
    }
    expect(sawSecond).toBe(true) // a second plane DID eventually spawn
  })

  it('retires planes at the retire Z — every live plane stays within (16, 240]', () => {
    const history = run(400)
    for (const planes of history) {
      for (const p of planes) {
        expect(p.z).toBeGreaterThan(STAR_RETIRE_Z) // promptly retired at/below 0x10
        expect(p.z).toBeLessThanOrEqual(STAR_SPAWN_Z) // never above the spawn ceiling
      }
    }
  })

  it('holds at most STAR_PLANES planes and fills to the full 8 at steady state', () => {
    const history = run(400)
    const counts = history.map((planes) => planes.length)
    for (const n of counts) {
      expect(n).toBeLessThanOrEqual(STAR_PLANES) // hard 8-plane cap, never exceeded
    }
    expect(Math.max(...counts)).toBe(STAR_PLANES) // the field actually reaches all 8
  })

  it('reset() clears every plane and restarts the lifecycle from the spawn Z', () => {
    const field = createStarfield()
    for (let i = 0; i < 30; i++) field.step()
    expect(field.planes.length).toBeGreaterThan(0)
    field.reset()
    expect(field.planes).toHaveLength(0)
    field.step()
    expect(field.planes[0].z).toBe(STAR_SPAWN_Z) // fresh dive starts at 240 again
  })
})

describe('starfield — 4 reused star pictures (AC1)', () => {
  it('tags every plane with one of exactly STAR_PICTURES (4) integer pictures', () => {
    const history = run(400)
    const used = new Set<number>()
    for (const planes of history) {
      for (const p of planes) {
        expect(Number.isInteger(p.picture)).toBe(true)
        expect(p.picture).toBeGreaterThanOrEqual(0)
        expect(p.picture).toBeLessThan(STAR_PICTURES) // 0..3
        used.add(p.picture)
      }
    }
    expect(used.size).toBe(STAR_PICTURES) // all 4 pictures get used over the run
  })

  it('REUSES the 4 pictures across the 8 planes (more planes than pictures)', () => {
    // At a full-8 frame, 8 planes share only 4 pictures, so by pigeonhole some
    // picture must repeat — that reuse is the whole point of "4 reused pictures".
    const history = run(400)
    const fullFrame = history.find((planes) => planes.length === STAR_PLANES)
    expect(fullFrame, 'expected the field to reach 8 concurrent planes').toBeDefined()
    const distinct = new Set(fullFrame!.map((p) => p.picture)).size
    expect(distinct).toBeLessThan(fullFrame!.length) // pictures are shared, not unique-per-plane
    expect(distinct).toBeLessThanOrEqual(STAR_PICTURES)
  })
})

describe('starfield — no type-safety escapes (TS lang-review #1)', () => {
  it('uses no `as any`, double-cast, or @ts-ignore', () => {
    expect(starfieldSrc).not.toMatch(/\bas any\b/)
    expect(starfieldSrc).not.toMatch(/as\s+unknown\s+as/)
    expect(starfieldSrc).not.toMatch(/@ts-ignore/)
  })
})
