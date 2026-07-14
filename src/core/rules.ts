// src/core/rules.ts

import { type Rng, nextFloat } from '@arcade/shared/rng'
import type { Enemy, EnemyKind, TankerCargo } from './state'
import { flipperCamForWave } from './enemies/cam'

// ─── THE CLOCK (story tp1-1) ─────────────────────────────────────────────────
//
// The ROM does NOT run at 60 fps. Its IRQ handler treats a single-byte counter's
// 8-bit wrap as one second (ALHARD.MAC:149-152), so the IRQ is 256 Hz by the ROM's
// own arithmetic; MAINLN then spins until NINE of those ticks have elapsed before
// running one game frame (ALEXEC.MAC:49-55). 256/9 = 28.44 game frames a second.
// Theurer says so himself, in a comment above the refire table we already ship
// byte-for-byte: "FRAMES UNTIL INVADER CAN FIRE (28 PER SECOND)" (ALWELG.MAC:581).
//
// This codebase was built on 60. Everything was 2.11x too fast, and the warp dive
// — which carries the base SQUARED — was 4.45x. See the primary-source audit,
// docs/2026-07-12-tempest-primary-source-audit.md §3.
//
// DO NOT be fooled by ALCOMN.MAC:87 `SECOND = 20. ;FRAMES/SECOND`. It sits under
// ";TIMING FOR PAUSE STATE", is used only to reload pause/attract countdowns, and
// appears nowhere in MAINLN, the IRQ handler, or any speed table. Where a constant
// and the machine disagree, the machine wins.
export const ROM_FPS = 256 / 9   // 28.444... — the ONLY place this number is written

// ─── FR-012: where the clock lives. The decision, and why. ───────────────────
//
// A ROM frame count (a flip cadence, a refire holdoff, a superzapper window) has to
// become wall-clock time somewhere. There were exactly two ways to do it:
//
//   (a) make one sim step BE one ROM frame — a 9/256 s fixed timestep;
//   (b) keep a 1/60 s timestep and convert every ROM frame count through ROM_FPS
//       by hand at each use site.
//
// We chose (a), and the deciding argument is not this story — it is the twenty
// stories behind it. Epic tp1 transcribes ROM frame counts by the dozen: the CAM
// (tp1-4/5) is a bytecode VM whose opcodes are literally "move N frames then flip";
// tp1-7 lifts the per-wave CONTOUR tables; tp1-14 the superzapper's 19-frame window.
// Under (b) every one of those is a hand conversion that somebody can forget, and a
// single forgotten one silently re-bakes the 60 — the exact bug class this story
// exists to close. Under (a) a ROM frame count is a sim step count. It cannot drift,
// because there is nothing left to convert.
//
// The cost is real and accepted: the sim now samples at 28.44 Hz rather than 60, so
// input latency is one ROM frame (35 ms) and motion updates 28 times a second. That
// is not a regression — it is the machine. The arcade sampled its spinner at exactly
// this rate. Render-side animation still runs at the display's rate (render.ts drives
// its phases from the real frame dt), so only the simulation is ROM-paced.
//
// Consequence, and the reason AC2 can be checked by grep: src/core contains no
// frame-rate 60 at all. Not in a constant, not in a conversion, not hidden inside a
// literal (see PULSAR_CLIMB_SPEED below, which used to be `82.5` = 1.375 x 60).
export const SIM_STEP = 9 / 256   // seconds per sim step == one ROM frame == 1 / ROM_FPS

// The ROM's "along" axis: enemies and the warp dive run 0x10 (near rim) → 0xf0 (far),
// a 224-unit span. Our depth 0..1 spans the same range, so one along-unit is 1/224
// depth. Declared here, above its first use, because every ROM speed in this file is
// "N along-units per FRAME" and converts as (N * ROM_FPS) / WARP_ALONG_SPAN.
export const WARP_ALONG_SPAN = 0xf0 - 0x10  // 224 ROM along-units

// The ROM's flipper climb bytes, in along-units per FRAME. The ROM ramps the byte
// linearly from L1 to L33+, then holds. These are ROM data, not rates — they only
// become depth/sec when multiplied by ROM_FPS.
//
// Declared up here with the clock because the PULSAR shares the L1 byte: spd_pulsar
// is hardcoded to the same value. Both constants below derive from this one name, so
// the "pulsar == L1 flipper" invariant is structural and cannot be broken by fixing
// one and forgetting the other.
const FLIPPER_ALONG_PER_FRAME_L1 = 1.375   // x 60 gave the notorious 82.5 "along/s"
const FLIPPER_ALONG_PER_FRAME_L33 = 3.375  // x ROM_FPS = exactly 96 along/s
const PULSAR_ALONG_PER_FRAME = FLIPPER_ALONG_PER_FRAME_L1

export const SPIN_SENSITIVITY = 0.15
// The ROM's player charge moves 9 along-units per FRAME. At the real clock that is
// 9 x 28.44 / 224 = 8/7 = 1.143 depth/s.
//
// This constant used to read 2.4, and it was filed by an early audit pass as
// CONFIRMED — "we match the arcade!" — because 9 along/frame and 2.4 depth/s ARE the
// same number... if a frame is 1/60 s. The bad base did not invent a divergence here.
// It manufactured an AGREEMENT, and an agreement is the one thing nobody re-checks.
export const BULLET_SPEED = (9 * ROM_FPS) / WARP_ALONG_SPAN  // 1.143 depth units/sec
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
export const SCORE_SPIKE_SEGMENT = 1    // LIFECT signals UPSCORE with TEMP0=1 (ALWELG.MAC:2606)
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
// warp-death. ROM values are per-FRAME; we map them to dt-driven per-second rates
// through ROM_FPS (28.44), not 60. WARP_ALONG_SPAN is declared with the clock above.
//
// Initial dive speed: ROM 0x0200 = 2.0 along-units/frame → progress/sec.
export const WARP_INITIAL_SPEED = (2.0 * ROM_FPS) / WARP_ALONG_SPAN  // 16/63 ≈ 0.254
// Per-frame ROM acceleration min(wave*4, 0x30) + 0x20 is stored in 8.8 fixed point
// (along-units/frame²); convert to progress/sec².
//
// THIS IS THE SQUARED ONE. An acceleration is per-frame-PER-FRAME, so the base rate
// enters twice — which is why the old `(60 * 60)` made the dive 4.45x too fast while
// everything else was only 2.11x. It is the most base-sensitive expression in the
// codebase. A rebase that replaces one 60 and leaves the other is wrong by 2.11x and
// looks entirely plausible; rom-clock.test.ts rejects that case by name.
//
// THE ARGUMENT IS A WAVE, NOT A LEVEL (WD-010, story tp1-23). MOVCUD's per-frame block
// (ALWELG.MAC:1064-1078) reads `LDA CURWAV / ASL / ASL / CMP I,30 / IFCS / LDA I,30 /
// ENDIF / CLC / ADC I,20` — min(CURWAV*4, 0x30) + 0x20, applied to CURWAV *itself*.
// CURWAV is 0-BASED: INIRAT seeds it with zero (ALWELG.MAC:192-193) and the scoreboard
// adds one to display it (ALSCOR.MAC:296-298). Our GameState.level is the DISPLAYED,
// 1-based number, so callers must hand us `level - 1`. The parameter is named `wave`
// precisely so that passing a level reads wrong at the call site: it was named `level`,
// fed a level, and every dive accelerated one wave early — introduced in story 6-1, fixed in tp1-23.
//
// At the real clock the level-1 (wave 0) dive takes ~1.62 s — 46 ROM frames, which is
// the figure the audit derives independently in pair-11. It used to take ~0.73 s.
export function warpAccel(wave: number): number {
  const perFrame8_8 = Math.min(wave * 4, 0x30) + 0x20  // 1/256 along-units / frame²
  return (perFrame8_8 / 256) * (ROM_FPS * ROM_FPS) / WARP_ALONG_SPAN
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

// Per-level refire holdoff in ROM FRAMES (shot_holdoff): L1 80, ramping down by
// 3/level to L20 23, then 20 for L21-64, then 10 for L65+. Never increases.
//
// These frame COUNTS are ROM truth and are unchanged by the rebase — the ROM's own
// comment above this table reads "FRAMES UNTIL INVADER CAN FIRE (28 PER SECOND)"
// (ALWELG.MAC:581), which is where the 28.44 fps finding was corroborated. Do not
// rebase this function: it returns frames, not seconds. Only the CONVERSION was
// wrong, and it now lives in enemyFireHoldoffSeconds below.
export function enemyFireHoldoffFrames(level: number): number {
  if (level >= 65) return 10
  if (level >= 21) return 20
  if (level <= 1) return 80
  return 80 - 3 * (level - 1)   // L2..L20: 77 → 23
}

// The same holdoff in seconds. sim.ts used to do this conversion inline as
// `enemyFireHoldoffFrames(level) / 60` — buried mid-tick, where it could be neither
// seen nor tested. L1 is 80 ROM frames = 2.81 s of real time; we used to wait 1.33 s,
// so every enemy in the game refired more than twice as often as the arcade's.
export function enemyFireHoldoffSeconds(level: number): number {
  return enemyFireHoldoffFrames(level) / ROM_FPS
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
// Pulsar climb speed when near (story 6-15). spd_pulsar = $fea0, hardcoded and
// level-independent — the SAME ROM byte as the L1 flipper (1.375 along/frame), so it
// only diverges from the far (flipper) speed at the higher levels where pulsars
// appear (L17+).
//
// This line used to read `82.5 / WARP_ALONG_SPAN`, and 82.5 IS 1.375 x 60 — the
// invented frame rate baked into a literal where no grep for "60" could ever find it.
// It is the reason AC2's grep is necessary but not sufficient. Expressed through
// ROM_FPS, it can never silently re-acquire a frame rate again.
export const PULSAR_CLIMB_SPEED = (PULSAR_ALONG_PER_FRAME * ROM_FPS) / WARP_ALONG_SPAN  // ≈ 0.175 depth/s
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
  flipperCam: number     // WFLICAM — the CAM program THIS wave's flippers run (tp1-4)
  spawnInterval: number  // seconds between spawns
  spikerSpeed: number    // depth units/s for spiker oscillation
  pulseInterval: number  // seconds between pulsar pulses
  fuseballSpeed: number  // depth units/s climb for fuseballs
  tankerSpeed: number    // depth units/s climb for tankers
}

// Authentic flipper climb speed (story 6-9, REBASED by tp1-1). The ROM steps the
// flipper's climb byte from 1.375 along/frame at L1 to 3.375 at L33+ (then flat),
// ramping linearly between. A rate of `alongPerFrame` per ROM FRAME is
// (alongPerFrame * ROM_FPS) / WARP_ALONG_SPAN in our depth/sec.
//
// L1  → 39.1/224 = 0.175 depth/s (~5.7 s up the tube)
// L33 → 96.0/224 = 3/7 = 0.429 depth/s
//
// Story 6-9 wrote `* 60` here and got 0.368 depth/s / a 2.7 s traverse, and it did so
// in the name of fidelity. The value it REPLACED — an "invented approximation" of
// 0.18 depth/s — was very nearly right. Tankers climb at flipper speed; fuseballs 2x.
export function flipperSpeedForLevel(level: number): number {
  const t = Math.max(0, Math.min(1, (level - 1) / 32)) // 0 at L1, 1 at L33+, clamped
  const alongPerFrame =
    FLIPPER_ALONG_PER_FRAME_L1 + (FLIPPER_ALONG_PER_FRAME_L33 - FLIPPER_ALONG_PER_FRAME_L1) * t
  return (alongPerFrame * ROM_FPS) / WARP_ALONG_SPAN
}

// The CAM's two wave parameters, which VSLOPB loads into an invader's loop counter
// (WTABLE, ALWELG.MAC:728-751). Story 6-14's `flipPatternForLevel` used to sit here
// — a per-level "move N frames, flip over M" envelope, invented because the CAM had
// not been read yet. Both of its numbers are refuted by the source: a flip is 8
// angle-steps at EVERY wave (W-008, JUMP_ANGLE_STEPS), and the climb between flips
// is written into the program itself (MOVJMP's `VSLOOP 8`), not ramped per level.

// TWTTFRA (ALWELG.MAC:704-706): T1,1,20.,2 / T1,21.,32.,2 / T1,33.,99.,3 — angle-
// steps a CHASER burns per frame at the rim, its "DOUBLE SPEED JUMP". 2 through
// wave 32, 3 from 33. Read by TOPPER, which story tp1-5 gives a rim state to run in.
export function wttfraForLevel(level: number): number {
  return level >= 33 ? 3 : 2
}

// TPUCHDE (ALWELG.MAC:680-684): the pulsar's chase delay — frames it moves before
// it flips again. The ROM's table is per-wave and pulsars only appear from wave 17,
// where it resolves to 20 frames before ramping down in the deep waves. We take the
// 20 (the wave-33 `.BYTE TA,33.,39.,20.,-1` seed) flat, because our pulsars appear
// from wave 1 and the ramp's early rows are written in symbols (PN/PC) whose values
// are not in the audited extract.
export const PUCHDE_FRAMES = 20

export function levelParams(level: number): LevelParams {
  const ramp = 1 + (level - 1) * 0.15
  const flipperSpeed = flipperSpeedForLevel(level)
  return {
    enemyCount: 6 + (level - 1) * 2,
    flipperSpeed,
    // WFLICAM (NEWFLI, ALWELG.MAC:1428-1433): the wave's flipper program. This is
    // the whole of W-006 — wave 1 gets NOJUMP, so its flippers never flip.
    flipperCam: flipperCamForWave(level),
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
