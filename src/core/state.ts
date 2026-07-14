// src/core/state.ts
import { Tube, tubeForLevel } from './geometry'
import { type Rng, createRng } from '@arcade/shared/rng'
import { START_LIVES, spawnForLevel } from './rules'
import type { HighScoreTable } from '@arcade/shared/highscore'
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
  zapTimer: number      // frames left on the ACTIVE Superzapper window (10-2);
                        // 0 = inactive. A press opens it; it self-runs to 0,
                        // killing on a per-frame cadence and flashing the well.
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

// Every invader carries the CAM's registers (tp1-4, W-005). Behaviour is not a
// function of `kind` any more: it is the bytecode program at `camPc`, run once per
// frame by the interpreter (src/core/enemies/interpreter.ts). These are the ROM's
// own per-invader bytes, and they PERSIST across frames — that is what makes a CAM
// program a coroutine rather than a state machine.
interface EnemyBase {
  lane: number          // integer lane — the ROM's INVAL1, the invader's base leg
  depth: number         // 0 (far, spawn) → 1 (near rim) — INVAY, inverted
  fireCooldown?: number // seconds left on the refire holdoff (Story 6-5); absent = ready to fire
  camPc: number         // INVCAM — the program counter, an offset into the CAM
  camLoop: number       // INVLOO — the loop counter VSLOOP sets and VELOOP spends
  rot: -1 | 1           // the INVROT bit: which way it jumps. +1 = CCW (lane+1), -1 = CW.
                        // It PERSISTS across jumps and is only ever changed by rule —
                        // VCHROT reverses it, VCHPLA aims it at the player (W-007).
  direction: 1 | -1     // the INVDIR bit: up the well (+1) or back down it (-1)
  // The jump (a flip), mid-flight: the angle-step this invader has reached, of the
  // eight a jump takes (W-008; JUMP_ANGLE_STEPS). Absent means it is not jumping —
  // the ROM's $80 INVMOT bit, clear. While it is set the invader is caught BETWEEN
  // lanes: `lane` holds at the source and settles on `lane + rot` when the angle
  // runs out, which is the window the player can rotate through.
  jumpAngle?: number
}

export interface Flipper extends EnemyBase {
  kind: 'flipper'
}

export interface Tanker extends EnemyBase {
  kind: 'tanker'
  contains: TankerCargo // what it splits into
}

export interface Spiker extends EnemyBase {
  kind: 'spiker'
}

export interface Fuseball extends EnemyBase {
  kind: 'fuseball'
  jitterTimer: number   // seconds until next erratic lane hop
  // Authentic vulnerable bit — the ROM's INVAL2 sign (W-022). A fuseball is killable
  // by a bullet ONLY while `vulnerable`, which means ROLLING BETWEEN LANES; once it
  // lands on a lane it is bulletproof (";MAKE IT INVINCIBLE"), and at the rim it is
  // bulletproof outright. A state, not a toggle — set on every roll, cleared on every
  // landing (the CAM's VSFUSE; the rim gate is in sim.ts).
  vulnerable: boolean
}

export interface Pulsar extends EnemyBase {
  kind: 'pulsar'
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

// Mid-flight state for the 'highscore' initials-entry machine (SH2-13): the
// initials typed so far (0–3 chars, uppercase A–Z). Letters and Backspace
// arrive as keydown events through sim.enterInitial (the cabinet-wide shared
// typing flow); `fire` commits the completed buffer.
export interface HighScoreEntryState {
  initials: string
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
  highScoreTable: HighScoreTable<'level'>  // in-memory top scores (persistence is 4-6)
  events: GameEvent[]                // gameplay events emitted this frame (5-1); cleared each step
  prevFire: boolean                  // last frame's input.fire — lets menu confirms edge-trigger (6-2)
  demoActive: boolean                // the self-play attract demo is currently running (Story 10-3)
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
    player: { lane: 0, alive: true, respawnTimer: 0, superzapper: 'full', zapTimer: 0 },
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
    demoActive: false, // the attract screen boots as a static title; the demo seeds on first idle step
    rng: createRng(seed),
    // Derive a distinct seed so the fire stream is decorrelated from movement.
    fireRng: createRng(seed ^ 0x9e3779b9),
  }
}
