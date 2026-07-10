// src/core/rules.ts

import { type Rng, nextFloat } from '@arcade/shared/rng'
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
// Board depth (MAX_HIGH_SCORES) now lives in @arcade/shared/highscore — the
// single source of truth (SH-4). No per-repo redeclaration.
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

// Superzapper active-window durations, in FRAMES (Story 10-2). The ROM's TIMAX
// holds the first activation "active" ~13 frames and the second ~5, flashing the
// well each frame and killing on a per-frame cadence (KILENE) across the window.
export const ZAP_WINDOW_FIRST = 13
export const ZAP_WINDOW_SECOND = 5

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
// --- Enemy energy bolts (Story 6-5), authentic rev-3 -------------------------
// Max concurrent enemy bolts on screen (ROM n_enemy_bullets = 4). A hard cap;
// it is also what makes the per-live-bolt fire odds self-limiting.
export const MAX_ENEMY_BULLETS = 4
// An enemy must be at least this far up the well ("along >= 0x30") before it may
// fire — freshly spawned enemies near the far end stay silent.
export const ENEMY_FIRE_MIN_DEPTH = 0x30 / 0x100   // ≈ 0.188 of the well
// ...and stops firing once it reaches the arrival zone: an enemy at the rim is
// grabbing/splitting, not shooting. This also keeps every bolt dodgeable — a
// point-blank shot from the rim would leave the player no lane to rotate to.
export const ENEMY_FIRE_MAX_DEPTH = 0.9   // == TANKER_SPLIT_DEPTH; at/after this they grab or split
// A bolt's depth/sec beyond its level's flipper speed ("flipper-relative +0xc0"),
// so a bolt always OUTRUNS a flipper. L1 ≈ 0.18 + 0.72 = 0.9 (ROM ~-202/s).
export const ENEMY_BOLT_SPEED_OFFSET = 0.72

// WHO may fire (the can-shoot bit, gate L028a 0x40). User decision 2026-06-27:
// match the literal rev-3 code — Flippers, Tankers and Spikers always; Pulsars
// only at level 60+; Fuseballs never.
export function enemyCanShoot(kind: EnemyKind, level: number): boolean {
  switch (kind) {
    case 'flipper': return true
    case 'tanker':  return true
    case 'spiker':  return true
    case 'pulsar':  return level >= 60
    case 'fuseball': return false
  }
}

// Self-limiting fire probability indexed by the number of LIVE enemy bolts
// (enm_shoot threshold table): 0 → ~100%, 1 → 1/8, 2 → 1/16, 3 → ~2.3%, 4 → ~0.4%.
const ENEMY_FIRE_CHANCE: readonly number[] = [1.0, 0.125, 0.0625, 0.023, 0.004]
export function enemyFireChance(liveBolts: number): number {
  const i = Math.min(Math.max(liveBolts, 0), ENEMY_FIRE_CHANCE.length - 1)
  return ENEMY_FIRE_CHANCE[i]
}

// Per-level refire holdoff in 60 Hz frames (shot_holdoff): L1 80, ramping down by
// 3/level to L20 23, then 20 for L21-64, then 10 for L65+. Never increases.
export function enemyFireHoldoffFrames(level: number): number {
  if (level >= 65) return 10
  if (level >= 21) return 20
  if (level <= 1) return 80
  return 80 - 3 * (level - 1)   // L2..L20: 77 → 23
}

export const PULSE_DURATION = 0.6       // seconds a pulse stays lethal
export const FUSEBALL_JITTER_INTERVAL = 0.3  // seconds between erratic lane hops
// fuzz_move probability gate (rev-3 §D l.240-250): a fuseball only slides a lane
// on a passing roll, so its approach is biased-but-not-relentless. The exact
// fuzz_move_prb byte is not in the extracted notes; 0.6 keeps it lively.
export const FUSEBALL_MOVE_PROB = 0.6
// Spiker near-turnaround (story 6-15). ROM clamps `along` to $20 and reverses
// (move away) once it climbs below it (rev-3 §C l.202-208). $20 → depth
// (0xf0-$20)/224 ≈ 0.929 — far closer to the rim than the spike-height cap. Kept
// SEPARATE from SPIKE_MAX_DEPTH (0.75) so raising the turnaround does not also
// grow spikes (which feed warp-crash balance) — see story 6-15 deviations.
export const SPIKER_TURNAROUND_DEPTH = (0xf0 - 0x20) / WARP_ALONG_SPAN  // ≈ 0.929
// Pulsar climb speed when near (story 6-15). spd_pulsar = $fea0 = const -82.5/s
// (rev-3 §E l.293), hardcoded and level-independent — the same byte as the L1
// flipper, so it only diverges from the far (flipper) speed at the higher levels
// where pulsars appear (L17+).
export const PULSAR_CLIMB_SPEED = 82.5 / WARP_ALONG_SPAN  // ≈ 0.368 depth/s
// Pulsar far/near boundary: L0157 = $a0 for L1-64 (rev-3 §E l.311) → depth ≈0.357.
// along > $a0 (depth < this) is "farther than L0157" → flipper speed; nearer →
// pulsar speed. The L65+ $c0 tier is deep-level gold-plating (ratchet rule) and
// is intentionally not modelled.
export const PULSAR_NEAR_FAR_DEPTH = (0xf0 - 0xa0) / WARP_ALONG_SPAN  // ≈ 0.357
export const TANKER_SPLIT_DEPTH = 0.9  // tankers split at/after this depth
// Must be < PLAYER_RIM_DEPTH (0.92) so a rim-split is not an instant grab.
export const SPLIT_CHILD_DEPTH = 0.85

export interface LevelParams {
  enemyCount: number
  flipperSpeed: number   // depth units per second
  flipInterval: number   // seconds between flips (pulsars; legacy flipper fallback)
  flipPattern: FlipPattern // authentic per-level flipper cadence + flip duration (6-14)
  spawnInterval: number  // seconds between spawns
  spikerSpeed: number    // depth units/s for spiker oscillation
  pulseInterval: number  // seconds between pulsar pulses
  fuseballSpeed: number  // depth units/s climb for fuseballs
  tankerSpeed: number    // depth units/s climb for tankers
}

// Authentic rev-3 flipper climb speed (story 6-9). The ROM steps the flipper's
// climb byte from -1.375 along/frame at L1 to -3.375 at L33+ (then flat), ramping
// linearly between. The along axis spans 0x10..0xf0 = WARP_ALONG_SPAN units, so a
// rate of `alongPerFrame` at 60 Hz is (alongPerFrame * 60) / WARP_ALONG_SPAN in
// our depth/sec. L1 → 82.5/224 = 0.368 depth/s (~2.7 s up the tube); L33+ →
// 202.5/224 = 0.904 depth/s. Tankers climb at flipper speed; fuseballs at 2×.
const FLIPPER_ALONG_PER_FRAME_L1 = 1.375
const FLIPPER_ALONG_PER_FRAME_L33 = 3.375
export function flipperSpeedForLevel(level: number): number {
  const t = Math.max(0, Math.min(1, (level - 1) / 32)) // 0 at L1, 1 at L33+, clamped
  const alongPerFrame =
    FLIPPER_ALONG_PER_FRAME_L1 + (FLIPPER_ALONG_PER_FRAME_L33 - FLIPPER_ALONG_PER_FRAME_L1) * t
  return (alongPerFrame * 60) / WARP_ALONG_SPAN
}

// Authentic per-level flipper flip pattern (story 6-14). The arcade ROM drives
// each level's flipper with a `flipper_move` program (enemy-roster ROM extract
// §A l.9204-9348): L1 is the gentle "move 8 ticks then flip"; deep levels are
// "flip constantly, 1 move between". We model the CADENCE envelope — climb frames
// between flips, ramping 8 (L1) → 1 (L33+) — plus the multi-tick flip duration.
// `flip_top_accel` (l.7184-7187) steps 2→3 at L33, so deep flips animate FASTER
// (fewer frames). We do not gold-plate the exact deep-level frame counts nobody
// reaches — only the documented envelope and the direction of the L33 change.
export interface FlipPattern {
  moveFrames: number   // climb frames between flips at 60 Hz (ROM flipper_move cadence)
  flipFrames: number   // frames one flip animates over (multi-tick; >= 2)
}

export function flipPatternForLevel(level: number): FlipPattern {
  // Cadence ramps linearly from the gentle L1 "move 8 ticks then flip" down to
  // the "flip constantly, 1 move between" floor of 1 by L33, then holds.
  const moveFrames = Math.max(1, Math.min(8, Math.round(8 - (7 * (level - 1)) / 32)))
  // flip_top_accel 2 (L1-32) → 3 (L33+): deep flips cross the gap faster.
  const flipFrames = level >= 33 ? 3 : 4
  return { moveFrames, flipFrames }
}

export function levelParams(level: number): LevelParams {
  const ramp = 1 + (level - 1) * 0.15
  const flipperSpeed = flipperSpeedForLevel(level)
  return {
    enemyCount: 6 + (level - 1) * 2,
    flipperSpeed,
    flipInterval: Math.max(0.4, 1.5 / ramp),
    flipPattern: flipPatternForLevel(level),
    spawnInterval: Math.max(0.3, 1.2 / ramp),
    spikerSpeed: 0.22 * ramp,
    pulseInterval: Math.max(1.2, 3.0 / ramp),
    fuseballSpeed: 2 * flipperSpeed,   // spd_fuzzball = 2 × spd_flipper (fastest enemy)
    tankerSpeed: flipperSpeed,         // tankers climb straight up at flipper speed
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

// `rng` is a mutable cursor advanced in place (one draw per pick).
function weightedPick<T>(table: ReadonlyArray<readonly [T, number]>, rng: Rng): T {
  const total = table.reduce((sum, [, w]) => sum + w, 0)
  let pick = nextFloat(rng) * total
  for (const [value, w] of table) {
    if (w <= 0) continue
    pick -= w
    if (pick < 0) return value
  }
  return table[0][0]
}

// Each full pass through the 16 geometries (a "cycle") ramps the hard-enemy
// spawn weights up by this fraction, so a repeated geometry plays meaner than
// its first appearance. Flipper weight stays fixed, so its share shrinks as the
// roster hardens — difficulty does not reset when the geometry table wraps.
export const SPAWN_CYCLE_HARD_SCALE = 0.5

// Authentic Atari rev-3 enemy *introduction* schedule (story 6-13 — stakeholder
// decision: follow the ROM, do not re-tune the canonical game). Which enemy types
// unlock at which level. Source of truth, citing rev-3 ROM line numbers:
// docs/ux/2026-06-27-enemy-roster-rom-extract.md §H "Mix per level" (line 426),
// corroborated by docs/ux/2026-06-27-tempest-arcade-feel-reference.md line 242:
//   flippers L1+ · tankers L5+ · spikers L5+ · fuseballs L11+ · pulsars L17+.
// (The ROM thins the spiker weight above L16 then restores 1 at the L33+ steady
// state; we gate spikers monotonically at L5+ — the L5-16 window sits on a
// doc-flagged suspected `$35` table bug. See story 6-13 delivery findings.)
// The per-cycle `hard` ramp below is a separate difficulty axis (story 3-4), not
// part of the ROM schedule; it is intentionally retained.
export function rollSpawnKind(level: number, rng: Rng): EnemyKind {
  // cycle 0 for levels 1–16, 1 for 17–32, … (tubeForLevel wraps with period 16).
  const cycle = Math.floor((level - 1) / 16)
  const hard = 1 + cycle * SPAWN_CYCLE_HARD_SCALE
  const table: ReadonlyArray<readonly [EnemyKind, number]> = [
    ['flipper', 10],
    ['tanker', level >= 5 ? 4 * hard : 0],
    ['spiker', level >= 5 ? 3 * hard : 0],
    ['pulsar', level >= 17 ? 3 * hard : 0],
    ['fuseball', level >= 11 ? 3 * hard : 0],
  ]
  return weightedPick(table, rng)
}

// Cargo a tanker splits into must respect the same introduction schedule as the
// roster (story 6-13 follow-up): a tanker cannot carry an enemy type that has not
// yet entered the game. Gates mirror rollSpawnKind above — fuseball cargo L11+,
// pulsar cargo L17+ — so a split can never manufacture a pulsar/fuseball before
// it would otherwise appear. Below those levels a tanker carries flippers only.
export function rollTankerCargo(level: number, rng: Rng): TankerCargo {
  const table: ReadonlyArray<readonly [TankerCargo, number]> = [
    ['flipper', 10],
    ['fuseball', level >= 11 ? 4 : 0],
    ['pulsar', level >= 17 ? 4 : 0],
  ]
  return weightedPick(table, rng)
}
