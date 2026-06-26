// src/core/rules.ts

import { Rng, rngNext } from './rng'
import type { Enemy, EnemyKind, TankerCargo } from './state'

export const SPIN_SENSITIVITY = 0.15
export const BULLET_SPEED = 2.0       // depth units per second (near → far)
export const MAX_BULLETS = 8
export const PLAYER_RIM_DEPTH = 0.92  // enemy depth ≥ this on player's lane = grab
export const RESPAWN_DELAY = 1.5      // seconds
export const START_LIVES = 3
// Highest selectable start level. There are 16 distinct tube geometries
// (tubeForLevel cycles with period 16), so beyond 16 no new geometry exists.
export const MAX_SELECT_LEVEL = 16
// Maximum entries retained in the high-score table (arcade convention: top 10).
export const MAX_HIGH_SCORES = 10
export const SCORE_FLIPPER = 150
export const SCORE_SPIKER = 50
export const SCORE_TANKER = 100
export const SCORE_PULSAR = 200
export const SCORE_FUSEBALL_BASE = 250
export const SCORE_FUSEBALL_STEP = 250  // 250 / 500 / 750 across depth thirds
export const SCORE_SPIKE_SEGMENT = 3    // points for shortening a spike (arcade: 1–3)
export const SPIKE_MAX_DEPTH = 0.75     // spiker turnaround + spike height cap
export const SPIKE_SHORTEN = 0.08       // depth a single bullet trims off a spike
export const EXTRA_LIFE_INTERVAL = 10000
export const WARP_SPEED = 2           // warp progress units per second (0 → 1 in 0.5s)
export const PULSE_DURATION = 0.6       // seconds a pulse stays lethal
export const FUSEBALL_JITTER_INTERVAL = 0.3  // seconds between erratic lane hops
export const TANKER_SPLIT_DEPTH = 0.9  // tankers split at/after this depth
// Must be < PLAYER_RIM_DEPTH (0.92) so a rim-split is not an instant grab.
export const SPLIT_CHILD_DEPTH = 0.85

export interface LevelParams {
  enemyCount: number
  flipperSpeed: number   // depth units per second
  flipInterval: number   // seconds between flips
  spawnInterval: number  // seconds between spawns
  spikerSpeed: number    // depth units/s for spiker oscillation
  pulseInterval: number  // seconds between pulsar pulses
  fuseballSpeed: number  // depth units/s climb for fuseballs
  tankerSpeed: number    // depth units/s climb for tankers
}

export function levelParams(level: number): LevelParams {
  const ramp = 1 + (level - 1) * 0.15
  return {
    enemyCount: 6 + (level - 1) * 2,
    flipperSpeed: 0.18 * ramp,
    flipInterval: Math.max(0.4, 1.5 / ramp),
    spawnInterval: Math.max(0.3, 1.2 / ramp),
    spikerSpeed: 0.22 * ramp,
    pulseInterval: Math.max(1.2, 3.0 / ramp),
    fuseballSpeed: 0.26 * ramp,
    tankerSpeed: 0.14 * ramp,
  }
}

export function spawnForLevel(level: number): { remaining: number; timer: number } {
  const p = levelParams(level)
  return { remaining: p.enemyCount, timer: p.spawnInterval }
}

export function fuseballScore(depth: number): number {
  const tier = Math.min(2, Math.max(0, Math.floor(depth * 3))) // 0,1,2
  return SCORE_FUSEBALL_BASE + tier * SCORE_FUSEBALL_STEP
}

export function scoreFor(enemy: Enemy): number {
  switch (enemy.kind) {
    case 'flipper':  return SCORE_FLIPPER
    case 'tanker':   return SCORE_TANKER
    case 'spiker':   return SCORE_SPIKER
    case 'pulsar':   return SCORE_PULSAR
    case 'fuseball': return fuseballScore(enemy.depth)
  }
}

function weightedPick<T>(table: ReadonlyArray<readonly [T, number]>, rng: Rng): { value: T; rng: Rng } {
  const total = table.reduce((sum, [, w]) => sum + w, 0)
  const roll = rngNext(rng)
  let pick = roll.value * total
  for (const [value, w] of table) {
    if (w <= 0) continue
    pick -= w
    if (pick < 0) return { value, rng: roll.rng }
  }
  return { value: table[0][0], rng: roll.rng }
}

export function rollSpawnKind(level: number, rng: Rng): { kind: EnemyKind; rng: Rng } {
  const table: ReadonlyArray<readonly [EnemyKind, number]> = [
    ['flipper', 10],
    ['tanker', level >= 3 ? 4 : 0],
    ['spiker', level >= 3 ? 3 : 0],
    ['pulsar', level >= 5 ? 3 : 0],
    ['fuseball', level >= 5 ? 3 : 0],
  ]
  const res = weightedPick(table, rng)
  return { kind: res.value, rng: res.rng }
}

export function rollTankerCargo(level: number, rng: Rng): { cargo: TankerCargo; rng: Rng } {
  const table: ReadonlyArray<readonly [TankerCargo, number]> = [
    ['flipper', 10],
    ['fuseball', level >= 5 ? 4 : 0],
    ['pulsar', level >= 5 ? 4 : 0],
  ]
  const res = weightedPick(table, rng)
  return { cargo: res.value, rng: res.rng }
}
