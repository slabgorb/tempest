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

// An enemy energy bolt (Story 6-5). Mirrors a Bullet but travels the OTHER way:
// spawned at the firing enemy and climbing toward the player at the rim, so its
// depth INCREASES (0 = far → 1 = near rim). No tracking — it rides one lane.
export interface EnemyBullet {
  lane: number          // integer lane the bolt travels down
  depth: number         // 0 (far, at the firing enemy) → 1 (near rim)
}

export type EnemyKind = 'flipper' | 'tanker' | 'spiker' | 'fuseball' | 'pulsar'
export type TankerCargo = 'flipper' | 'fuseball' | 'pulsar'

interface EnemyBase {
  lane: number          // integer lane
  depth: number         // 0 (far, spawn) → 1 (near rim)
  fireCooldown?: number // seconds left on the refire holdoff (Story 6-5); absent = ready to fire
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
  // Authentic vulnerable bit (rev-3 L02cc bit7, story 6-9): a fuseball is killable
  // by a bullet ONLY while `vulnerable` (settled on a lane), NOT while rolling the
  // rim. It flips each time the fuseball rolls to a new lane (see stepFuseball).
  vulnerable: boolean
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
  velocity: number      // dive speed in progress/sec; accelerates each frame (Story 6-1)
  warning: number       // seconds left on the AVOID SPIKES countdown before the dive (0 = none)
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
  enemyBullets: EnemyBullet[]        // enemy energy bolts in flight (6-5), capped at 4
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
  prevFire: boolean                  // last frame's input.fire — lets menu confirms edge-trigger (6-2)
  rng: Rng
  fireRng: Rng                       // SEPARATE stream for enemy-fire rolls (6-5), so fire decisions
                                     // never desync the movement RNG (mirrors the ROM's pokey1_rand)
}

export function initialState(seed: number): GameState {
  const tube: Tube = tubeForLevel(1)
  return {
    mode: 'attract',
    level: 1,
    tube,
    player: { lane: 0, alive: true, respawnTimer: 0, superzapper: 'full' },
    bullets: [],
    enemyBullets: [],
    enemies: [],
    spikes: new Array(tube.laneCount).fill(0),
    score: 0,
    lives: START_LIVES,
    spawn: spawnForLevel(1),
    warp: { progress: 0, velocity: 0, warning: 0 },
    select: { selectedLevel: 1 },
    entry: null,
    highScoreTable: [],
    events: [],
    prevFire: false,
    rng: makeRng(seed),
    // Derive a distinct seed so the fire stream is decorrelated from movement.
    fireRng: makeRng(seed ^ 0x9e3779b9),
  }
}
