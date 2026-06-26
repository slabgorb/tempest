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

export interface Fx {
  /**
   * Compare the new state against the previous one and spawn effects. `events`
   * are the gameplay events the core emitted this frame; cues that a state diff
   * can't tell apart (a warp spike crash vs. a normal death — both just flip
   * `player.alive`) are driven off the explicit event instead.
   */
  detect(s: GameState, dt: number, events?: readonly GameEvent[]): void
  /** Advance particle/shake/flash timers by dt. */
  update(dt: number): void
  readonly particles: readonly Particle[]
  readonly shake: number
  readonly flash: number
  readonly flashColor: string
}

export function createFx(): Fx {
  let parts: Particle[] = []
  let shake = 0
  let flash = 0
  let flashColor = '#fff'
  let prevBullets: { lane: number; depth: number }[] = []
  let prevLevel = 1
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

    // Player death → twin bursts, shake, red flash.
    if (prevAlive && !s.player.alive) {
      const p = project(tube, currentLane(tube, s.player.lane), 1.0)
      burst(p, '#ffe800', 26, 220, 0.9)
      burst(p, '#ff5a3c', 18, 160, 0.8)
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
    for (const e of events) {
      if (e.type === 'warp-spike-crash') {
        const p = project(tube, e.lane, 1.0)
        burst(p, '#7df9ff', 24, 230, 0.7) // cyan shards spraying off the spike
        burst(p, '#ffffff', 14, 130, 0.6) // white impact core
        shake = 26 // harder jolt than a normal death (18)
        flash = 0.6
        flashColor = '#7df9ff' // electric blue, not the red death flash
      }
    }

    // Level cleared → white flash, gentle shake.
    if (s.level > prevLevel) {
      flash = 0.4
      flashColor = '#ffffff'
      shake = 6
    }
    prevLevel = s.level
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
    get shake(): number {
      return shake
    },
    get flash(): number {
      return flash
    },
    get flashColor(): string {
      return flashColor
    },
  }
}
