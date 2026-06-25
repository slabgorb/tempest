// src/core/state.ts
import { Tube, tubeForLevel } from './geometry'
import { Rng, makeRng } from './rng'
import { START_LIVES, spawnForLevel } from './rules'

export type Mode = 'playing' | 'dying' | 'gameover' | 'warp'

export interface Player {
  lane: number          // continuous, wrapped into [0, laneCount)
  alive: boolean
  respawnTimer: number  // seconds remaining while mode === 'dying'
}

export interface Bullet {
  lane: number          // integer lane the bullet travels down
  depth: number         // 1 (near, just fired) → 0 (far)
}

export type EnemyKind = 'flipper' | 'tanker' | 'spiker' | 'fuseball' | 'pulsar'
export type TankerCargo = 'flipper' | 'fuseball' | 'pulsar'

interface EnemyBase {
  lane: number          // integer lane
  depth: number         // 0 (far, spawn) → 1 (near rim)
}

export interface Flipper extends EnemyBase {
  kind: 'flipper'
  flipTimer: number     // seconds until next flip
}

export interface Tanker extends EnemyBase {
  kind: 'tanker'
  contains: TankerCargo // what it splits into
}

export interface Spiker extends EnemyBase {
  kind: 'spiker'
  direction: 1 | -1     // climbing (+1) or descending (-1) while laying spike
}

export interface Fuseball extends EnemyBase {
  kind: 'fuseball'
  jitterTimer: number   // seconds until next erratic lane hop
}

export interface Pulsar extends EnemyBase {
  kind: 'pulsar'
  flipTimer: number     // seconds until next flip
  pulseTimer: number    // seconds until the pulse state next toggles
  pulsing: boolean      // true while the lane is electrified
}

export type Enemy = Flipper | Tanker | Spiker | Fuseball | Pulsar

export interface SpawnState {
  remaining: number     // enemies left to spawn this level
  timer: number         // seconds until next spawn
}

export interface WarpState {
  progress: number      // 0 = warp just entered (Claw at rim), 1 = arrived at next level
}

export interface GameState {
  mode: Mode
  level: number
  tube: Tube
  player: Player
  bullets: Bullet[]
  enemies: Enemy[]
  spikes: number[]      // per-lane spike height in depth units (0 = none)
  score: number
  lives: number
  spawn: SpawnState
  warp: WarpState
  rng: Rng
}

export function initialState(seed: number): GameState {
  const tube: Tube = tubeForLevel(1)
  return {
    mode: 'playing',
    level: 1,
    tube,
    player: { lane: 0, alive: true, respawnTimer: 0 },
    bullets: [],
    enemies: [],
    spikes: new Array(tube.laneCount).fill(0),
    score: 0,
    lives: START_LIVES,
    spawn: spawnForLevel(1),
    warp: { progress: 0 },
    rng: makeRng(seed),
  }
}
