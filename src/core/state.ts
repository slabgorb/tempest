// src/core/state.ts
import { Tube, makeCircleTube } from './geometry'
import { Rng, makeRng } from './rng'
import { START_LIVES, spawnForLevel } from './rules'

export type Mode = 'playing' | 'dying' | 'gameover'

export interface Player {
  lane: number          // continuous, wrapped into [0, laneCount)
  alive: boolean
  respawnTimer: number  // seconds remaining while mode === 'dying'
}

export interface Bullet {
  lane: number          // integer lane the bullet travels down
  depth: number         // 1 (near, just fired) → 0 (far)
}

export type EnemyKind = 'flipper'

export interface Enemy {
  kind: EnemyKind
  lane: number          // integer lane
  depth: number         // 0 (far, spawn) → 1 (near rim)
  flipTimer: number     // seconds until next flip
}

export interface SpawnState {
  remaining: number     // enemies left to spawn this level
  timer: number         // seconds until next spawn
}

export interface GameState {
  mode: Mode
  level: number
  tube: Tube
  player: Player
  bullets: Bullet[]
  enemies: Enemy[]
  score: number
  lives: number
  spawn: SpawnState
  rng: Rng
}

export function initialState(seed: number): GameState {
  const tube: Tube = makeCircleTube(16, { x: 0, y: 0 }, 60, 300)
  return {
    mode: 'playing',
    level: 1,
    tube,
    player: { lane: 0, alive: true, respawnTimer: 0 },
    bullets: [],
    enemies: [],
    score: 0,
    lives: START_LIVES,
    spawn: spawnForLevel(1),
    rng: makeRng(seed),
  }
}
