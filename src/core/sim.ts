// src/core/sim.ts
import { GameState } from './state'
import { Input } from './input'
import { wrapLane, currentLane } from './geometry'
import { SPIN_SENSITIVITY, BULLET_SPEED, MAX_BULLETS, levelParams } from './rules'
import { rngInt } from './rng'
import { stepFlipper } from './enemies/flipper'

function cloneState(s: GameState): GameState {
  return {
    ...s,
    player: { ...s.player },
    bullets: s.bullets.map((b) => ({ ...b })),
    enemies: s.enemies.map((e) => ({ ...e })),
    spawn: { ...s.spawn },
  }
}

function stepPlayer(s: GameState, input: Input): void {
  if (!s.player.alive) return
  s.player.lane = wrapLane(s.tube, s.player.lane + input.spin * SPIN_SENSITIVITY)
}

function stepFiring(s: GameState, input: Input): void {
  if (!input.fire || !s.player.alive) return
  if (s.bullets.length >= MAX_BULLETS) return
  s.bullets.push({ lane: currentLane(s.tube, s.player.lane), depth: 1 })
}

function stepBullets(s: GameState, dt: number): void {
  for (const b of s.bullets) {
    b.depth -= BULLET_SPEED * dt
  }
  s.bullets = s.bullets.filter((b) => b.depth > 0)
}

function stepEnemies(s: GameState, dt: number): void {
  const params = levelParams(s.level)

  // Spawn from the budget.
  if (s.spawn.remaining > 0) {
    s.spawn.timer -= dt
    if (s.spawn.timer <= 0) {
      const pick = rngInt(s.rng, s.tube.laneCount)
      s.rng = pick.rng
      s.enemies.push({ kind: 'flipper', lane: pick.value, depth: 0, flipTimer: params.flipInterval })
      s.spawn.remaining -= 1
      s.spawn.timer = params.spawnInterval
    }
  }

  // Move every enemy, threading the RNG.
  const moved = []
  for (const e of s.enemies) {
    const res = stepFlipper(e, dt, params, s.tube, s.rng)
    s.rng = res.rng
    moved.push(res.enemy)
  }
  s.enemies = moved
}

export function stepGame(state: GameState, input: Input, dt: number): GameState {
  const s = cloneState(state)
  if (s.mode === 'playing') {
    stepPlayer(s, input)
    stepFiring(s, input)
    stepBullets(s, dt)
    stepEnemies(s, dt)
  }
  return s
}
