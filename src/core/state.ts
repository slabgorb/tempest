// src/core/state.ts
import { Tube, tubeForLevel } from './geometry'
import { Rng, makeRng } from './rng'
import { START_LIVES, spawnForLevel } from './rules'
import type { HighScoreTable } from './highscore'
import type { GameEvent } from './events'

export type Mode = 'attract' | 'select' | 'playing' | 'dying' | 'gameover' | 'warp' | 'highscore'

// Once-per-level Superzapper charge: a 'full' blast vaporises every enemy, then
// a 'used-once' weak shot vaporises one (nearest the rim), then it is 'spent'
// until the next level rearms it.
export type Superzapper = 'full' | 'used-once' | 'spent'

export interface Player {
  lane: number          // continuous, wrapped into [0, laneCount)
  alive: boolean
  respawnTimer: number  // seconds remaining while mode === 'dying'
  superzapper: Superzapper
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

export interface SelectState {
  selectedLevel: number // the level the player has chosen to start at (1..16)
}

// Mid-flight state for the 'highscore' initials-entry machine. `initials` holds
// the confirmed characters so far (0–3); `charIndex` is the position being
// entered (0–2); `currentLetter` is the A–Z letter currently shown for it.
export interface HighScoreEntryState {
  initials: string
  charIndex: number
  currentLetter: string
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
  select: SelectState
  entry: HighScoreEntryState | null  // non-null only while mode === 'highscore'
  highScoreTable: HighScoreTable     // in-memory top scores (persistence is 4-6)
  events: GameEvent[]                // gameplay events emitted this frame (5-1); cleared each step
  rng: Rng
}

export function initialState(seed: number): GameState {
  const tube: Tube = tubeForLevel(1)
  return {
    mode: 'attract',
    level: 1,
    tube,
    player: { lane: 0, alive: true, respawnTimer: 0, superzapper: 'full' },
    bullets: [],
    enemies: [],
    spikes: new Array(tube.laneCount).fill(0),
    score: 0,
    lives: START_LIVES,
    spawn: spawnForLevel(1),
    warp: { progress: 0 },
    select: { selectedLevel: 1 },
    entry: null,
    highScoreTable: [],
    events: [],
    rng: makeRng(seed),
  }
}
