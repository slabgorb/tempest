// src/core/rules.ts

export const SPIN_SENSITIVITY = 0.15
export const BULLET_SPEED = 2.0       // depth units per second (near → far)
export const MAX_BULLETS = 8
export const PLAYER_RIM_DEPTH = 0.92  // enemy depth ≥ this on player's lane = grab
export const RESPAWN_DELAY = 1.5      // seconds
export const START_LIVES = 3
export const SCORE_FLIPPER = 150

export interface LevelParams {
  enemyCount: number
  flipperSpeed: number   // depth units per second
  flipInterval: number   // seconds between flips
  spawnInterval: number  // seconds between spawns
}

export function levelParams(level: number): LevelParams {
  const ramp = 1 + (level - 1) * 0.15
  return {
    enemyCount: 6 + (level - 1) * 2,
    flipperSpeed: 0.18 * ramp,
    flipInterval: Math.max(0.4, 1.5 / ramp),
    spawnInterval: Math.max(0.3, 1.2 / ramp),
  }
}

export function spawnForLevel(level: number): { remaining: number; timer: number } {
  const p = levelParams(level)
  return { remaining: p.enemyCount, timer: p.spawnInterval }
}
