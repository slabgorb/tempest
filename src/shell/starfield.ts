// src/shell/starfield.ts
//
// The warp-dive starfield model — shell-only eye candy (Story 10-4). A handful
// of parallel "star planes" stream out from screen centre while the Claw dives,
// recreating the authentic 1981 Tempest warp. This module owns ONLY the plane
// lifecycle (the deterministic Z bookkeeping); render.ts turns each live plane
// into blue dots. Keeping the lifecycle pure makes it unit-testable in the node
// env, where render() can't run (it needs a real canvas).
//
// Constants are the book's "star planes" values (context-story-10-4.md):
//   spawn at Z 0xF0, step -7/frame, spawn the next plane once the newest has
//   descended to 0xD5, retire a plane at 0x10, at most 8 planes, 4 reused star
//   pictures cycled across the planes.

import { ROM_FPS } from '../core/rules'

/** A single depth plane of stars: its current Z and which reused picture it draws. */
export interface StarPlane {
  /** Depth: starts at STAR_SPAWN_Z, decremented by STAR_STEP each frame until it retires. */
  readonly z: number
  /** 0..STAR_PICTURES-1 — which of the 4 reused star pictures this plane shows. */
  readonly picture: number
}

export interface Starfield {
  /** Live planes, oldest first / newest last. */
  readonly planes: readonly StarPlane[]
  /**
   * Advance by `dt` SECONDS of simulation time: move every plane in, retire the
   * arrived ones, spawn the next.
   *
   * This used to take no argument and advance one STAR_STEP per call, which meant
   * the starfield's speed was a function of the player's monitor: 2.11x too fast on
   * a 60 Hz display, 5.1x on a 144 Hz one, and stalled outright on a dropped frame.
   * It is the only finding in the rebase that was not merely wrong but
   * non-deterministic. Time is the input now, so the dive looks the same everywhere.
   */
  step(dt: number): void
  /** Drop every plane (call between dives so each warp starts from a clean centre). */
  reset(): void
}

export const STAR_SPAWN_Z = 0xf0 // 240 — a fresh plane spawns here, far at the centre
export const STAR_STEP = 7 // per-frame Z decrement (the plane rushing toward the rim)
export const STAR_SPAWN_NEXT_Z = 0xd5 // 213 — once the newest reaches here, spawn the next
export const STAR_RETIRE_Z = 0x10 // 16 — a plane that has descended this far is removed
export const STAR_PLANES = 8 // max concurrent planes
export const STAR_PICTURES = 4 // distinct star pictures, reused across the planes

// tp1-9 (DB-016): a plane's radial reach follows the SAME perspective divide as
// the well, not a linear spread. DSTARF (ALDISP.MAC:2931-2970) swaps in the
// starfield eye — EYL = 0xE8 (signed −24), YDEUNI = 0x28 = 40 — puts every plane
// at world centre, and CASCAL scales its star picture by YDEUNI/(PY − EY) =
// 40/(z + 24). So the reach is a fraction of full reach: 40/264 = 0.1515 at spawn
// (z = 0xF0), whipping up to 40/40 = 1.0 at retirement (z = 0x10) — the same
// hyperbolic 1/(coord − eye) law geometry.perspectiveDepth runs for the well.
// drawStarfield strokes each plane's dots at r = starReachFraction(z) · reach.
export function starReachFraction(z: number): number {
  return 40 / (z + 24)
}

export function createStarfield(): Starfield {
  // Internal planes are mutable (Z ticks down in place); the public view is readonly.
  let planes: { z: number; picture: number }[] = []
  let spawned = 0 // total spawns ever — drives the reused-picture cycle

  function step(dt: number): void {
    // 1) Every live plane rushes in. STAR_STEP is 7 Z per ROM FRAME — ROM truth, and
    //    deliberately NOT rebased. What was wrong was the driver: "a frame" used to
    //    mean "a call to this function", so the dive tracked the monitor. Now it is
    //    "how many ROM frames of game time went by", so 7 Z/frame x 28.44 frames/s =
    //    199.1 Z/s holds however often, or unevenly, we are called.
    //
    //    Multiply in THIS order. ROM_FPS * SIM_STEP is exactly 1.0 in IEEE-754, so a
    //    canonical sim step moves a plane by exactly STAR_STEP and the integer Z
    //    lifecycle (spawn 240, retire 16) stays on exact values. Folding it the other
    //    way — (STAR_STEP * ROM_FPS) * dt — gives 6.999999999999999 per step and lets
    //    rounding drift into the thresholds.
    const romFramesElapsed = ROM_FPS * dt
    for (const p of planes) p.z -= STAR_STEP * romFramesElapsed
    // 2) Retire planes that have arrived at the rim.
    planes = planes.filter((p) => p.z > STAR_RETIRE_Z)
    // 3) Spawn the next plane when there's room AND the field is empty or the
    //    newest plane has descended to the spawn-next threshold — this staggers
    //    the planes ~4 frames apart, settling at the full 8.
    const newest = planes[planes.length - 1]
    if (planes.length < STAR_PLANES && (newest === undefined || newest.z <= STAR_SPAWN_NEXT_Z)) {
      planes.push({ z: STAR_SPAWN_Z, picture: spawned % STAR_PICTURES })
      spawned += 1
    }
  }

  function reset(): void {
    planes = []
    spawned = 0
  }

  return {
    get planes(): readonly StarPlane[] {
      return planes
    },
    step,
    reset,
  }
}
