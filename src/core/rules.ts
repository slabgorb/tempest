// src/core/rules.ts

import { Rng, rngNext } from './rng'
import type { Enemy, EnemyKind, TankerCargo } from './state'

export const SPIN_SENSITIVITY = 0.15
export const BULLET_SPEED = 2.4       // depth units/sec (near → far); ROM rev-3 frees the slot at ~25 frames / ~0.42s
export const MAX_BULLETS = 8
export const PLAYER_RIM_DEPTH = 0.92  // enemy depth ≥ this on player's lane = grab
export const RESPAWN_DELAY = 1.5      // seconds
// Fixed lane the Claw returns to after a death (arcade rev-3: segment 14, near
// rim) — never the death spot. A constant landing lane plus a fully reset board
// is why the arcade never chain-deaths. Valid in every geometry (15/16 lanes).
export const RESPAWN_LANE = 14
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
// --- Level-clear warp dive (Story 6-1) ---------------------------------------
// The authentic accelerating "zoom": the Claw starts slow and ramps up, so a
// player parked on a spiked lane gets a beat to react instead of an instant
// warp-death. ROM (rev-3) values are 60 Hz per-frame; we map them to dt-driven
// per-second rates. ROM "along" runs 0x10 → 0xf0 (span 224) over the descent;
// our warp progress 0 → 1 spans that same range, so 1 along-unit = 1/224 progress.
export const WARP_ALONG_SPAN = 0xf0 - 0x10  // 224 ROM along-units across the dive
// Initial dive speed: ROM 0x0200 = 2.0 along-units/frame at 60 Hz → progress/sec.
export const WARP_INITIAL_SPEED = (2.0 * 60) / WARP_ALONG_SPAN
// Per-frame ROM acceleration min(level*4, 0x30) + 0x20 is stored in 8.8 fixed
// point (along-units/frame²); convert to progress/sec². It grows with level —
// ~0.75s descent at level 1 down to ~0.55s by level 12+ (where it caps at 0x30).
export function warpAccel(level: number): number {
  const perFrame8_8 = Math.min(level * 4, 0x30) + 0x20  // 1/256 along-units / frame²
  return (perFrame8_8 / 256) * (60 * 60) / WARP_ALONG_SPAN
}
// AVOID SPIKES countdown: the Claw holds at the rim for this long before the dive
// begins, but only when a spike actually threatens AND the displayed level is low
// enough to still warn the player (no hand-holding past level 7).
export const WARP_AVOID_SPIKES_SECONDS = 0.5
export const WARP_AVOID_SPIKES_MAX_LEVEL = 7
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

// Each full pass through the 16 geometries (a "cycle") ramps the hard-enemy
// spawn weights up by this fraction, so a repeated geometry plays meaner than
// its first appearance. Flipper weight stays fixed, so its share shrinks as the
// roster hardens — difficulty does not reset when the geometry table wraps.
export const SPAWN_CYCLE_HARD_SCALE = 0.5

export function rollSpawnKind(level: number, rng: Rng): { kind: EnemyKind; rng: Rng } {
  // cycle 0 for levels 1–16, 1 for 17–32, … (tubeForLevel wraps with period 16).
  const cycle = Math.floor((level - 1) / 16)
  const hard = 1 + cycle * SPAWN_CYCLE_HARD_SCALE
  const table: ReadonlyArray<readonly [EnemyKind, number]> = [
    ['flipper', 10],
    ['tanker', level >= 3 ? 4 * hard : 0],
    ['spiker', level >= 3 ? 3 * hard : 0],
    ['pulsar', level >= 5 ? 3 * hard : 0],
    ['fuseball', level >= 5 ? 3 * hard : 0],
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
