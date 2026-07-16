// src/shell/fx.ts
//
// Visual effects layer — particles, screen shake, and full-screen flashes,
// all DERIVED from frame-to-frame diffs of the pure GameState. This lives in
// the shell: it may use Math.random and wall-clock dt because it never feeds
// back into the simulation. The core stays deterministic; fx is pure eye candy.
import { GameState } from '../core/state'
import type { GameEvent } from '../core/events'
import { currentLane, project } from '../core/geometry'
import { ROM_FPS, fuseballScore } from '../core/rules'
import { FUSE_SCORE_TIERS } from './glyphs'

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

// Player death, charge/bolt channel ("splat control", V-013/DA-009/DA-010/DA-011):
// the ROM's one closed ragged tri-colour ring (splatGlyph) that GROWS THEN SHRINKS
// (radius, DA-011 unchanged) while ROTCOL spins its three colours over frames (`rot`).
export interface PlayerSplat {
  kind: 'player'
  x: number
  y: number
  radius: number // grows to a peak then shrinks back (DA-011 — do not invert)
  rot: number // ROTCOL colour-slot rotation phase, advanced each frame (DA-009)
  life: number
  max: number
}

// Player death, invader-collision channel ("SPARK1", DA-007): the ROM's distinct
// STATIC 4-dot yellow cross (sparkGlyph) — NOT the colour-cycling splat.
export interface PlayerSpark {
  kind: 'spark'
  x: number
  y: number
  life: number
  max: number
}

// The fuseball's score pop-up ("FUSE EXPLOSION", V-022): the ROM's FUSEX1/2/3 are
// not explosion pictures at all — they are the WHITE score number that blooms where
// a fuseball dies (PITAB FUSEX1,PTFUSX, ALVROM.MAC:2148). `tier` selects
// 750/500/250; it mirrors what the sim actually awarded, so tp1-21's weighted roll
// will move the pop-up with it for free. Drawn alongside the normal enemy burst —
// the ROM shows both.
export interface FuseScorePop {
  kind: 'fuse-score'
  x: number
  y: number
  tier: number // 0/1/2 → FUSE_SCORE_TIERS 750/500/250
  life: number
  max: number
}

export type Explosion = EnemyBurst | PlayerSplat | PlayerSpark | FuseScorePop

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

// The charge-player splat sequence: TSPTIM = 2,2,2,2,2,4,3,2,1 (ALDISP.MAC:1022-1030)
// = 20 game frames, REBASED through ROM_FPS (28.44) → ≈0.703 s (DA-010; the following
// .BYTE 20 at :1031 is the SEPARATE pulsar-player tail, not the splat).
const SPLAT_FRAMES = 20
const SPLAT_LIFE = SPLAT_FRAMES / ROM_FPS
const SPLAT_PEAK_RADIUS = 30
// The invader-collision SPARK1 cross is a brief static cue (DA-007).
const SPARK_LIFE = 0.25
// The fuseball score number lingers a beat longer than the burst under it, so the
// number is still readable once the star has faded (V-022). The ROM cycles it off
// with the rest of the picture list; we give it its own short life.
const FUSE_SCORE_LIFE = 0.6

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

  // The ROM player-death splat (charge/bolt death). radius grows-then-shrinks
  // (DA-011, unchanged); update() spins the tri-colour ring via `rot` each frame.
  function spawnPlayerSplat(p: { x: number; y: number }): void {
    explosions.push({
      kind: 'player', x: p.x, y: p.y, radius: 0, rot: 0,
      life: SPLAT_LIFE, max: SPLAT_LIFE,
    })
  }

  // The invader-collision SPARK1 cross (DA-007) — a distinct static yellow cue.
  function spawnPlayerSpark(p: { x: number; y: number }): void {
    explosions.push({ kind: 'spark', x: p.x, y: p.y, life: SPARK_LIFE, max: SPARK_LIFE })
  }

  // The fuseball score pop-up (V-022). `depth` picks the tier through the SAME rule
  // the sim scores with, so the number shown is the number awarded — when tp1-21
  // replaces the depth band with the ROM's weighted roll, this follows it.
  function spawnFuseScore(p: { x: number; y: number }, depth: number): void {
    const tier = FUSE_SCORE_TIERS.indexOf(fuseballScore(depth))
    if (tier < 0) return // a score the ROM has no picture for — draw nothing
    explosions.push({
      kind: 'fuse-score', x: p.x, y: p.y, tier,
      life: FUSE_SCORE_LIFE, max: FUSE_SCORE_LIFE,
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

    // Player death → the death cue + shake + red flash. DA-007: an invader-PLAYER
    // DIRECT collision (cause 'grab') gets the ROM's distinct static SPARK1 yellow
    // cross; a charge/bolt/pulse death gets the colour-cycling splat. (A warp-spike
    // crash is a death too and is overridden to cyan in the event loop below.)
    if (prevAlive && !s.player.alive) {
      const p = project(tube, currentLane(tube, s.player.lane), 1.0)
      const death = events.find((e): e is Extract<GameEvent, { type: 'player-death' }> => e.type === 'player-death')
      if (death?.cause === 'grab') spawnPlayerSpark(p)
      else spawnPlayerSplat(p)
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
        const at = project(tube, e.lane, e.depth)
        spawnEnemyBurst(at)
        // …and, for a fuseball only, the ROM's score number on top of it (V-022).
        if (e.enemyType === 'fuseball') spawnFuseScore(at, e.depth)
      }

      // tp1-13 (S-013): a shot-down enemy bolt explodes like any kill — INCCSQ pairs
      // CCEXPL with GENEXP at the shot's coordinates (ALWELG.MAC:2797-2809). Same
      // 16-spoke burst, at the destroyed bolt's projected position, event-driven only.
      if (e.type === 'bolt-destroyed') {
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
        // 4-frame doubling: scale steps 1, 2, 4, 8; brightness 7 then 14. ALVROM sets
        // CB=07 only for EXPL1 (scale 1) and CB=0E from EXPL2 on, so ONLY frame 0 is dim.
        const frame = Math.min(ENEMY_SCALE_STEPS.length - 1, Math.floor(progress * ENEMY_SCALE_STEPS.length))
        ex.scale = ENEMY_SCALE_STEPS[frame]
        ex.brightness = frame < 1 ? ENEMY_DIM : ENEMY_BRIGHT
      } else if (ex.kind === 'player') {
        // Grow-then-shrink (sin arch). DA-011 REFUTED (wont_fix): SPLAT1 is full-size
        // at the sequence middle, SPLAT6 smallest at both ends — do NOT invert this.
        ex.radius = SPLAT_PEAK_RADIUS * Math.sin(progress * Math.PI)
        // ROTCOL: advance the tri-colour slot rotation each frame (DA-009).
        ex.rot += 1
      }
      // spark: a static cross — no per-frame animation, it just ages out.
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
