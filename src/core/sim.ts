// src/core/sim.ts
import { GameState, Enemy, EnemyKind } from './state'
import { Input } from './input'
import { wrapLane, currentLane } from './geometry'
import {
  SPIN_SENSITIVITY, BULLET_SPEED, MAX_BULLETS, scoreFor, EXTRA_LIFE_INTERVAL,
  PLAYER_RIM_DEPTH, RESPAWN_DELAY, START_LIVES, levelParams, spawnForLevel,
  SCORE_SPIKE_SEGMENT, SPIKE_MAX_DEPTH, SPIKE_SHORTEN,
} from './rules'
import { rngInt } from './rng'
import { stepFlipper } from './enemies/flipper'
import { stepSpiker } from './enemies/spiker'
import { stepPulsar } from './enemies/pulsar'
import { stepFuseball } from './enemies/fuseball'

function cloneState(s: GameState): GameState {
  return {
    ...s,
    player: { ...s.player },
    bullets: s.bullets.map((b) => ({ ...b })),
    enemies: s.enemies.map((e) => ({ ...e })),
    spikes: s.spikes.slice(),
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

  // Move every enemy by kind, threading the RNG.
  const moved: Enemy[] = []
  for (const e of s.enemies) {
    switch (e.kind) {
      case 'flipper': {
        const res = stepFlipper(e, dt, params, s.tube, s.rng)
        s.rng = res.rng
        moved.push(res.enemy)
        break
      }
      case 'spiker': {
        const res = stepSpiker(e, dt, params)
        const sp = res.enemy
        s.spikes[sp.lane] = Math.min(SPIKE_MAX_DEPTH, Math.max(s.spikes[sp.lane], sp.depth))
        moved.push(sp)
        break
      }
      case 'pulsar': {
        const res = stepPulsar(e, dt, params, s.tube, s.rng)
        s.rng = res.rng
        moved.push(res.enemy)
        break
      }
      case 'fuseball': {
        const res = stepFuseball(e, dt, params, s.tube, s.rng)
        s.rng = res.rng
        moved.push(res.enemy)
        break
      }
      default:
        moved.push(e) // kinds without a stepper yet (added in later tasks) hold position
    }
  }
  s.enemies = moved
}

// Enemies that kill the player by reaching its rim segment. Tankers split
// before the rim; spikers never reach grab depth.
const GRABBER_KINDS: ReadonlySet<EnemyKind> = new Set<EnemyKind>(['flipper', 'fuseball', 'pulsar'])

const HIT_DEPTH = 0.06

function awardScore(s: GameState, points: number): void {
  const before = s.score
  s.score += points
  const crossed = Math.floor(s.score / EXTRA_LIFE_INTERVAL) - Math.floor(before / EXTRA_LIFE_INTERVAL)
  if (crossed > 0) s.lives += crossed
}

function resolveBulletHits(s: GameState): void {
  const deadBullets = new Set<number>()
  const deadEnemies = new Set<number>()
  s.bullets.forEach((b, bi) => {
    if (deadBullets.has(bi)) return
    for (let ei = 0; ei < s.enemies.length; ei++) {
      if (deadEnemies.has(ei)) continue
      const e = s.enemies[ei]
      if (e.lane === b.lane && Math.abs(e.depth - b.depth) <= HIT_DEPTH) {
        deadBullets.add(bi)
        deadEnemies.add(ei)
        awardScore(s, scoreFor(e))
        break
      }
    }
  })
  if (deadBullets.size > 0) s.bullets = s.bullets.filter((_, i) => !deadBullets.has(i))
  if (deadEnemies.size > 0) s.enemies = s.enemies.filter((_, i) => !deadEnemies.has(i))
}

function resolveSpikeHits(s: GameState): void {
  const dead = new Set<number>()
  s.bullets.forEach((b, bi) => {
    const h = s.spikes[b.lane]
    if (h > 0 && b.depth <= h) {
      s.spikes[b.lane] = Math.max(0, h - SPIKE_SHORTEN)
      dead.add(bi)
      awardScore(s, SCORE_SPIKE_SEGMENT)
    }
  })
  if (dead.size > 0) s.bullets = s.bullets.filter((_, i) => !dead.has(i))
}

function startLevel(s: GameState): void {
  s.spawn = spawnForLevel(s.level)
  s.bullets = []
}

function killPlayer(s: GameState): void {
  s.player.alive = false
  s.lives -= 1
  if (s.lives <= 0) {
    s.mode = 'gameover'
  } else {
    s.mode = 'dying'
    s.player.respawnTimer = RESPAWN_DELAY
  }
}

function resolvePlayerHits(s: GameState): void {
  if (!s.player.alive) return
  const pl = currentLane(s.tube, s.player.lane)
  const grabbed = s.enemies.some(
    (e) => GRABBER_KINDS.has(e.kind) && e.depth >= PLAYER_RIM_DEPTH && e.lane === pl,
  )
  const pulsed = s.enemies.some((e) => e.kind === 'pulsar' && e.pulsing && e.lane === pl)
  if (grabbed || pulsed) killPlayer(s)
}

function respawn(s: GameState): void {
  s.player.alive = true
  s.player.respawnTimer = 0
  // Clear enemies already at the rim so the player isn't killed on the same frame.
  s.enemies = s.enemies.filter((e) => e.depth < PLAYER_RIM_DEPTH)
  s.mode = 'playing'
}

function startGame(s: GameState): void {
  s.mode = 'playing'
  s.level = 1
  s.score = 0
  s.lives = START_LIVES
  s.player = { lane: 0, alive: true, respawnTimer: 0 }
  s.enemies = []
  startLevel(s)
}

function checkLevelClear(s: GameState): void {
  if (s.mode !== 'playing') return
  if (s.enemies.length === 0 && s.spawn.remaining === 0) {
    s.level += 1
    startLevel(s)
  }
}

export function stepGame(state: GameState, input: Input, dt: number): GameState {
  const s = cloneState(state)
  switch (s.mode) {
    case 'playing':
      stepPlayer(s, input)
      stepFiring(s, input)
      stepBullets(s, dt)
      stepEnemies(s, dt)
      resolveBulletHits(s)
      resolveSpikeHits(s)
      resolvePlayerHits(s)
      checkLevelClear(s)
      break
    case 'dying':
      s.player.respawnTimer -= dt
      if (s.player.respawnTimer <= 0) respawn(s)
      break
    case 'gameover':
      if (input.start) startGame(s)
      break
  }
  return s
}
