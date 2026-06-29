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
  /** Advance one frame: move every plane in, retire the arrived ones, spawn the next. */
  step(): void
  /** Drop every plane (call between dives so each warp starts from a clean centre). */
  reset(): void
}

export const STAR_SPAWN_Z = 0xf0 // 240 — a fresh plane spawns here, far at the centre
export const STAR_STEP = 7 // per-frame Z decrement (the plane rushing toward the rim)
export const STAR_SPAWN_NEXT_Z = 0xd5 // 213 — once the newest reaches here, spawn the next
export const STAR_RETIRE_Z = 0x10 // 16 — a plane that has descended this far is removed
export const STAR_PLANES = 8 // max concurrent planes
export const STAR_PICTURES = 4 // distinct star pictures, reused across the planes

export function createStarfield(): Starfield {
  // Internal planes are mutable (Z ticks down in place); the public view is readonly.
  let planes: { z: number; picture: number }[] = []
  let spawned = 0 // total spawns ever — drives the reused-picture cycle

  function step(): void {
    // 1) Every live plane rushes in by one step.
    for (const p of planes) p.z -= STAR_STEP
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
