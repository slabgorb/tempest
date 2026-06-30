// src/shell/fx.ts
//
// Visual effects layer — particles, screen shake, and full-screen flashes,
// all DERIVED from frame-to-frame diffs of the pure GameState. This lives in
// the shell: it may use Math.random and wall-clock dt because it never feeds
// back into the simulation. The core stays deterministic; fx is pure eye candy.
import { GameState } from '../core/state'
import type { GameEvent } from '../core/events'
import { currentLane, project } from '../core/geometry'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
  color: string
}

// Authentic vector explosions (Story 10-5). Unlike the generic point `Particle`,
// these are STRUCTURED vector shapes the renderer draws directly, with their
// geometry animated over `life`. A `kind` discriminant lets the renderer (and
// tests) narrow the union.

// Enemy death ("explosions one to four"): a 16-spoke star that DOUBLES in size
// across ~4 frames (scale 1 → 2 → 4 → 8) with a two-tier brightness ramp 7 → 14.
// `brightness` is the Tempest colour-RAM intensity (0..15). Keyed off the
// explicit `enemy-death` event (covers both bullet kills and superzapper kills).
export interface EnemyBurst {
  kind: 'enemy'
  x: number
  y: number
  spokes: number // 16 radial arms
  scale: number // current radial scale: 1, 2, 4, then 8
  brightness: number // 7 (dim) for the first half, 14 (bright) for the second
  life: number
  max: number
}

// Player death ("splat control"): a concentric jagged star that GROWS THEN
// SHRINKS while its colour cycles white → red → yellow EACH FRAME (ROTCOL).
export interface PlayerSplat {
  kind: 'player'
  x: number
  y: number
  spokes: number // jagged star points
  radius: number // grows to a peak then shrinks back
  color: string // cycles through SPLAT_CYCLE each frame
  cycle: number // frame counter driving the colour cycle
  life: number
  max: number
}

export type Explosion = EnemyBurst | PlayerSplat

export interface Fx {
  /**
   * Compare the new state against the previous one and spawn effects. `events`
   * are the gameplay events the core emitted this frame; cues that a state diff
   * can't tell apart (a warp spike crash vs. a normal death — both just flip
   * `player.alive`) are driven off the explicit event instead.
   */
  detect(s: GameState, dt: number, events?: readonly GameEvent[]): void
  /** Advance particle/explosion/shake/flash timers by dt. */
  update(dt: number): void
  readonly particles: readonly Particle[]
  readonly explosions: readonly Explosion[]
  readonly shake: number
  readonly flash: number
  readonly flashColor: string
  /**
   * The Superzapper well-color flash index (Story 10-15): `0..7` on a frame the
   * core emitted a `superzapper-flash` (one per ACTIVE zap frame, the ROM's
   * QFRAME-AND-7 well colour), or `null` when no zap is flashing this frame. The
   * renderer maps the index to a palette hue and tints the whole well/web with
   * it, reverting to the level colour the frame this goes back to `null`.
   */
  readonly zapFlash: number | null
}

const ENEMY_SPOKES = 16
const ENEMY_SCALE_STEPS = [1, 2, 4, 8] as const // doubling each frame
const ENEMY_BURST_LIFE = 0.24 // ~4 quick frames
const ENEMY_DIM = 7
const ENEMY_BRIGHT = 14

const SPLAT_POINTS = 12 // jagged star points
const SPLAT_LIFE = 0.9
const SPLAT_PEAK_RADIUS = 30
// White → red → yellow, the canonical ROTCOL cycle.
const SPLAT_CYCLE: readonly string[] = ['#ffffff', '#ff0000', '#ffff00']

export function createFx(): Fx {
  let parts: Particle[] = []
  let explosions: Explosion[] = []
  let shake = 0
  let flash = 0
  let flashColor = '#fff'
  let zapFlash: number | null = null
  let prevBullets: { lane: number; depth: number }[] = []
  let prevAlive = true

  function burst(
    p: { x: number; y: number }, color: string, count: number, speed: number, life: number,
  ): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2
      const v = speed * (0.35 + Math.random() * 0.9)
      parts.push({
        x: p.x, y: p.y,
        vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        life: life * (0.6 + Math.random() * 0.6), max: life, color,
      })
    }
  }

  // The authentic 16-spoke enemy explosion. Starts at frame 0 (scale 1, dim);
  // update() animates the doubling + brightness ramp over its life.
  function spawnEnemyBurst(p: { x: number; y: number }): void {
    explosions.push({
      kind: 'enemy', x: p.x, y: p.y, spokes: ENEMY_SPOKES,
      scale: ENEMY_SCALE_STEPS[0], brightness: ENEMY_DIM,
      life: ENEMY_BURST_LIFE, max: ENEMY_BURST_LIFE,
    })
  }

  // The color-cycling player splat. Starts at radius 0 / first cycle colour;
  // update() grows-then-shrinks the radius and advances the colour each frame.
  function spawnPlayerSplat(p: { x: number; y: number }): void {
    explosions.push({
      kind: 'player', x: p.x, y: p.y, spokes: SPLAT_POINTS,
      radius: 0, color: SPLAT_CYCLE[0], cycle: 0,
      life: SPLAT_LIFE, max: SPLAT_LIFE,
    })
  }

  function detect(s: GameState, _dt: number, events: readonly GameEvent[] = []): void {
    const tube = s.tube

    // A bullet that vanished mid-flight hit something → spark where it was.
    const cur = s.bullets
    for (const pb of prevBullets) {
      let alive = false
      for (const cb of cur) {
        if (cb.lane === pb.lane && cb.depth <= pb.depth + 1e-3 && pb.depth - cb.depth < 0.25) {
          alive = true
          break
        }
      }
      if (!alive && pb.depth > 0.06) {
        const sparkColor = pb.depth > 0.55 ? '#fff2a8' : '#9fe8ff'
        burst(project(tube, pb.lane, pb.depth), sparkColor, 12, 140, 0.5)
      }
    }
    prevBullets = cur.map((b) => ({ lane: b.lane, depth: b.depth }))

    // Player death → the color-cycling splat, shake, red flash. (The old twin
    // particle bursts are replaced by the authentic jagged-star splat; the red
    // full-screen flash + shake stay.)
    if (prevAlive && !s.player.alive) {
      const p = project(tube, currentLane(tube, s.player.lane), 1.0)
      spawnPlayerSplat(p)
      shake = 18
      flash = 0.5
      flashColor = '#ff5a3c'
    }
    prevAlive = s.player.alive

    // A warp spike crash is a death too, so the generic block above already
    // fired the red death cue. Override it with a DISTINCT electric-blue burst
    // at the crash lane (paired with kaboom.wav in main.ts) so a spike crash
    // reads differently from a normal grab/pulse death. Event-driven because the
    // state diff alone can't tell the two deaths apart.
    //
    // Superzapper well-color flash (Story 10-15): re-derived every frame. The
    // core emits one `superzapper-flash` per ACTIVE zap frame; with none this
    // frame the well reverts to its level colour, so clear first and (re)set it
    // below only while the zap is flashing.
    zapFlash = null
    for (const e of events) {
      // Enemy destroyed (bullet OR superzapper) → the authentic 16-spoke star
      // burst at the kill site. Event-driven so it fires for superzapper kills
      // too, not just bullet vanishes.
      if (e.type === 'enemy-death') {
        spawnEnemyBurst(project(tube, e.lane, e.depth))
      }

      // Superzapper active this frame → surface the well-color index (masked to
      // the ROM's 0..7 range) for the renderer to tint the well/web with.
      if (e.type === 'superzapper-flash') {
        zapFlash = e.color & 7
      }

      if (e.type === 'warp-spike-crash') {
        const p = project(tube, e.lane, 1.0)
        burst(p, '#7df9ff', 24, 230, 0.7) // cyan shards spraying off the spike
        burst(p, '#ffffff', 14, 130, 0.6) // white impact core
        shake = 26 // harder jolt than a normal death (18)
        flash = 0.6
        flashColor = '#7df9ff' // electric blue, not the red death flash
      }

      // Level cleared → white flash, gentle shake. Driven off the explicit
      // `level-clear` event (fired on warp ENTRY by sim.checkLevelClear) rather
      // than the arrival `s.level` diff, so the cue punches as the dive BEGINS.
      if (e.type === 'level-clear') {
        flash = 0.4
        flashColor = '#ffffff'
        shake = 6
      }
    }
  }

  function update(dt: number): void {
    for (const p of parts) {
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vx *= 0.92
      p.vy *= 0.92
      p.life -= dt
    }
    parts = parts.filter((p) => p.life > 0)

    // Animate explosions over their life. `progress` runs 0 → 1 as life drains.
    for (const ex of explosions) {
      ex.life -= dt
      const progress = ex.max > 0 ? 1 - Math.max(0, ex.life) / ex.max : 1
      if (ex.kind === 'enemy') {
        // 4-frame doubling: scale steps 1, 2, 4, 8; brightness 7 then 14.
        const frame = Math.min(ENEMY_SCALE_STEPS.length - 1, Math.floor(progress * ENEMY_SCALE_STEPS.length))
        ex.scale = ENEMY_SCALE_STEPS[frame]
        ex.brightness = frame < 2 ? ENEMY_DIM : ENEMY_BRIGHT
      } else {
        // Grow-then-shrink (sin arch), with the colour advancing every frame.
        ex.radius = SPLAT_PEAK_RADIUS * Math.sin(progress * Math.PI)
        ex.cycle += 1
        ex.color = SPLAT_CYCLE[ex.cycle % SPLAT_CYCLE.length]
      }
    }
    explosions = explosions.filter((ex) => ex.life > 0)

    shake *= Math.pow(0.0001, dt) // fast decay
    if (shake < 0.3) shake = 0
    flash = Math.max(0, flash - dt * 1.6)
  }

  return {
    detect,
    update,
    get particles(): readonly Particle[] {
      return parts
    },
    get explosions(): readonly Explosion[] {
      return explosions
    },
    get shake(): number {
      return shake
    },
    get flash(): number {
      return flash
    },
    get flashColor(): string {
      return flashColor
    },
    get zapFlash(): number | null {
      return zapFlash
    },
  }
}
