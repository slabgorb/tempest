// src/core/rules.ts

import { type Rng, nextInt } from '@arcade/shared/rng'
import type { Enemy, EnemyKind, Nymph, TankerCargo } from './state'
import { flipperCamForWave } from './enemies/cam'
import { assertNever } from './assert'

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

// The ROM's L1 flipper climb byte, in along-units per FRAME. The PULSAR shares it
// (spd_pulsar is hardcoded to the same value), so it stays a named constant even though
// the per-wave flipper speed now comes from the TINVIN table (tp1-7) rather than a linear
// L1→L33 ramp: the "pulsar == L1 flipper" invariant is structural. The full climb curve is
// TINVIN (which DIPS at wave 17 and keeps climbing past 33), not a straight line.
const FLIPPER_ALONG_PER_FRAME_L1 = 1.375   // x 60 gave the notorious 82.5 "along/s"; = -44/32 raw
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
// A charge that has bitten a spike SLOWS to PCVELO-4 = 5 along-units/frame while it
// burrows (MOVCHA: `LDY X,CHARCO / IFNE / SEC / SBC I,4`, ALWELG.MAC:2541-2544).
export const SPIKE_BURROW_SPEED = (5 * ROM_FPS) / WARP_ALONG_SPAN  // 0.635 depth units/sec
// A charge eats a spike over exactly two hit-frames, deactivating once its CHARCO
// collision counter reaches 2 (LIFECT: `CMP I,2 / IFCS`, ALWELG.MAC:2618-2624).
export const SPIKE_BURROW_HITS = 2
export const MAX_BULLETS = 8
// The grab line. It is not a threshold the ROM tunes — it is the RIM itself, and the
// reason no byte could ever be found for it is that the kill check does not test depth.
//
// JKITST (ALWELG.MAC:1980-1993) reads INVAY nowhere. It tests exactly two things: the
// invader is not mid-jump (the $80 INVMOT bit — W-010), and both its legs sit on both of
// the cursor's legs. The depth gate lives one level up, in WHO IS ALLOWED TO RUN IT: the
// opcode VKITST appears in exactly ONE cam program in the cabinet — TOPPER, the CHASER cam
// (2447-2452, "CHASE PLAYER AROUND TOP"). Only a chaser can grab. And an invader becomes a
// chaser in exactly one place, where it is seated on the cursor's own line:
//
//     CHASER: LDA CURSY      ;PLACE EXACTLY AT TOP
//             STA X,INVAY                                  (ALWELG.MAC:1824-1826)
//
// reached from the climb by `CMP CURSY / BEQ ATOP / IFCC` (1744-1747). With
// CURSY = ILINLIY = $10 (ALWELG.MAC:57-58; ALCOMN.MAC:820), the grab line is the top of
// the well: (0xf0 - 0x10) / 224 = 1.0 — which is precisely the depth the cam interpreter
// already pins a chaser to (RIM_DEPTH, which now derives from this name so the two cannot
// drift apart again).
//
// It used to read 0.92, which inverts to INVAY 33.92 — not a ROM byte, and eight units
// short of the rim, so an invader still CLIMBING grabbed a player the cabinet would never
// have touched. Two consequences fell out of that invention: the enemy bolt killed early
// (it shares this line — the ROM's charge is tested `CMP CURSY / IFCC ;AT TOP?` at
// 2562-2565, the same CURSY), and tp1-24 ratified a difficulty change — "a split child is
// born above the grab line, so the player dies on the burst frame" — that the cabinet does
// not have. With the line derived it sits ABOVE the carrier's burst line ($20 = 0.9286), so
// no child is ever born lethal: ATOP is tested BEFORE the carrier check, so a carrier that
// reaches the rim becomes a CHASER instead of bursting. (Story tp1-27; finding W-049.)
export const PLAYER_RIM_DEPTH = (0xf0 - 0x10) / WARP_ALONG_SPAN  // = 1.0, the rim (CURSY)
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
// Spike-height cap. JSTRAI writes the climbing spiker's INVAY straight into the
// spike's tip (LINEY) whenever it is higher, bounded ONLY by the spiker's own $20
// turnaround (ALWELG.MAC:2214-2229) — so a full-grown spike reaches depth
// (0xf0-$20)/224 ≈ 0.929, the SAME $20 as SPIKER_TURNAROUND_DEPTH. Story 6-15
// deliberately clamped this to 0.75 for warp-crash playability; PM ruling
// 2026-07-13 OVERTURNED that deviation once tp1-10 made a spike crash replay the
// wave instead of costing a life outright — reuniting the cap with the turnaround
// at the ROM's single $20 (findings W-039 / B-006).
export const SPIKE_MAX_DEPTH = (0xf0 - 0x20) / WARP_ALONG_SPAN  // ≈ 0.929, the ROM $20
export const SPIKE_SHORTEN = 0.08       // SUPERSEDED by the tp1-15 burrow (W-047); the old flat trim, kept as the value the burrow test refutes
export const EXTRA_LIFE_INTERVAL = 10000

// ─── THE ADVANCED-START SKILL-STEP BONUS (tp1-13, S-015) ─────────────────────
//
// BONSCO awards BONPTM[BONUS] at the end of the STARTING wave — a reward for
// beginning at an advanced skill step. BONPTM (ALWELG.MAC:266-277):
//
//     BONSCO: … LDA I,0 ;LSB ALWAYS 0 …
//     BONPTM: .WORD 0,60,160,320,540,740,940,1140
//
// ALWELG is .RADIX 16, and BONSCO streams each word out as BCD digit-pairs with an
// always-zero ones-pair, so `.WORD 160` → the digit pair 01,60 → 16,000 points
// (NOT decimal 160: its low byte 0xA0 is not a BCD pair — the decode only works if
// the literals are hex). Decoding the whole table gives the ladder below, pinned as
// LITERALS so a re-derivation from the audited constant can't silently drift
// (the tp1-27 lesson). Indexed by SKILL STEP i; the ROM's LEVEL table
// (ALWELG.MAC:278-280) pairs step i with START WAVE 2i+1 (1,3,5,…,15).
const START_WAVE_BONUS_LADDER: readonly number[] = [
  0, 6_000, 16_000, 32_000, 54_000, 74_000, 94_000, 114_000,
]

// The bonus for STARTING at `wave`. The ROM only offers odd start waves (its select
// steps by whole skill steps), so `i = floor((wave-1)/2)` recovers the step and its
// ladder value exactly for odd waves (wave 2k+1 → step k → BONPTM[k]). Our select is
// contiguous 1..16, so an even start wave (never reachable in the cabinet) falls to
// the nearest LOWER step — you keep credit for the highest milestone you passed
// (wave 4 → step 1 → 6,000). Total and non-negative for every wave; a wave-1 start
// is step 0 = 0, which ENDWAV's IFNE gate then silences.
export function startWaveBonus(wave: number): number {
  const step = Math.min(Math.max(0, Math.floor((wave - 1) / 2)), START_WAVE_BONUS_LADDER.length - 1)
  return START_WAVE_BONUS_LADDER[step]
}

// Superzapper active-window durations, in FRAMES. The ROM's TIMAX table
// (ALWELG.MAC:3539) is COMPUTED, not the book's literal `.BYTE 00,13,05`:
//   TIMAX[1] = CSUSTA + <8*<CSUINT+1>> = 3 + 8*2 = 19   (first press)
//   TIMAX[2] = CSUSTA + <1*<CSUINT+1>> = 3 + 1*2 = 5    (second press)
// with CSUSTA=3, CSUINT=1 (3490-3492). The well flashes each active frame; the
// first press kills on KILENE's every-OTHER-frame cadence (see runZapFrame), and
// the second press's single kill lands on its press frame. tp1-14 raised the
// first window from the book's 13 to the ROM's 19 (B-001/W-043); the second is
// unchanged (already correct). This is a FRAME count — the separate 28.44-fps
// timebase (FR-014) is a game-wide concern, not modelled here.
export const ZAP_WINDOW_FIRST = 19
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
// The starfield does not open until the dive is ~29% down the well (tp1-10, WD-013).
// MOVCUD kicks INSTAR off only once CURSY has descended past 0x50 ("LDA CURSY / CMP
// I,50 / IFCS / ... / JSR INSTAR", ALWELG.MAC:1041-1048). CURSY starts at 0x10 and
// bottoms at 0xF0, so the gate is (0x50 - 0x10) / WARP_ALONG_SPAN = 64/224 ≈ 0.2857.
export const WARP_STARFIELD_GATE = (0x50 - 0x10) / WARP_ALONG_SPAN  // 64/224 ≈ 0.2857
// tp1-37 (WD-018): the eye FLY-IN after the descent bottoms out. ENDWAV increments the
// wave (ALEXEC.MAC:361-382), then INEWAV parks the eye far back — EYH:EYL = 0xFA00 =
// -1536 ("LDA I,0FA / STA EYH … STA EYL", ALWELG.MAC:29-33) — and NEWAV2 walks it INTO
// the new well at +0x18 (24) units/frame ("LDA EYL / CLC / ADC I,18", ALWELG.MAC:85-88),
// clamping at the per-well destination EYLDES = -H (INIWLS ALDISP.MAC:2470-2475; the
// stop-at-dest is ALWELG.MAC:104-108). The fly-in therefore lasts the per-well count
// ceil((1536 - H)/24) ≈ 63-64 frames — computed from the new well in beginFlyIn via
// warpEyeDest. Per the qframe convention (one warp step == one ROM frame), this is a
// frame count, not a dt-scaled span.
//
// (Supersedes tp1-10's placeholder ceil(WARP_ALONG_SPAN / 0x18) = ceil(224/24) = 10,
// which flew the DESCENT span back — an invented derivation; see the tp1-37 deviation log.)
export const EYE_FLYIN_START = -1536  // 0xFA00 as signed 16-bit (INEWAV, ALWELG.MAC:29-33)
export const EYE_FLYIN_STEP = 0x18    // 24 ROM units/frame (NEWAV2, ALWELG.MAC:87)
// --- Enemy energy bolts (Story 6-5), authentic rev-3 -------------------------
// The live concurrent-bolt cap is PER WAVE — `enemyBoltCapForLevel` (TCHAMX, tp1-7), read
// at the fire gate in sim.ts — NOT a flat 4. NICHARG=4 (ALCOMN.MAC:813) was only the ROM's
// physical charge-array size; the old flat MAX_ENEMY_BULLETS conflated it with the live cap
// (WCHAMX+1 = 2 at wave 1), doubling the arcade's early bolt pressure. W-019 / DA-002.
// An enemy must be at least this far up the well ("along >= 0x30") before it may
// fire — freshly spawned enemies near the far end stay silent.
export const ENEMY_FIRE_MIN_DEPTH = 0x30 / 0x100   // ≈ 0.188 of the well
// ...and stops firing once it reaches the arrival zone: an enemy at the rim is
// grabbing/splitting, not shooting. This also keeps every bolt dodgeable — a
// point-blank shot from the rim would leave the player no lane to rotate to.
// (0.9 is its OWN number, not TANKER_SPLIT_DEPTH's — the comment here used to claim they
// were equal, and they were, by coincidence, until the tanker's split moved to the ROM's
// $20. They are separate rules: when a carrier bursts, and when an invader stops firing.)
export const ENEMY_FIRE_MAX_DEPTH = 0.9   // at/after this an invader is grabbing/splitting, not shooting
// A bolt's depth/sec beyond its level's invader speed. TCHARIN (ALWELG.MAC:600-601) is a
// SINGLE TB record, byte -64, for every wave: WCHARL = WINVIL - 64, and TIMES8 scales both
// identically, so the bolt is ALWAYS exactly |−64|/32 = 2.0 along-units/frame faster than the
// invader that fired it (W-020). At the real clock that offset is 0.254 depth/s — the invented
// 0.72 was 2.83x too fast. The +2.0 is wave-independent, so this stays one constant, not a table.
export const ENEMY_BOLT_SPEED_OFFSET = ((Math.abs(-64) / 32) * ROM_FPS) / WARP_ALONG_SPAN

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
    default: return assertNever(kind, 'enemy kind')
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

// ─── THE PULSE: ONE GLOBAL CLOCK (W-026, story tp1-5) ────────────────────────
//
// MOVINV ticks the pulse ONCE per frame, AFTER the invader loop and outside it
// (ALWELG.MAC:1536-1570): `LDA PULSON / CLC / ADC PULTIM`. There is one counter, so
// there is one phase — every pulsar on the board strobes in unison, whenever it
// hatched. The SIGN of that counter IS the pulse: ALCOMN.MAC:775 names it "PULSE
// STATUS (MINUS=OFF)", and JPULMO's kill test asks nothing more than `LDA PULSON /
// IFPL`. Ours gave every pulsar a private 0.6 s/3.0 s timer seeded at spawn, so two
// pulsars that hatched seven frames apart strobed seven frames apart — a thing the
// cabinet cannot do.
//
// The counter walks a triangle between two rails, negating its increment at each
// (1557-1568): at PULSON >= 15, and again at PULSON <= -64 (the ROM spells the lower
// rail `CMP I,-63. / IFCC`, an UNSIGNED compare against 0xC1, so it fires on -64 and
// below). PULTIM is 4 below wave 49 (WPULTIM, 610-613).
export const PULSE_STEP = 4        // PULTIM — WPULTIM's value for waves 1-48
export const PULSE_SON_MAX = 15    // `CMP I,15. / BCS NEGPUL`
export const PULSE_SON_MIN = -64   // `CMP I,-63. / IFCC` — an unsigned compare: -64 and below
//
// THE SEED IS THE DUTY CYCLE, and it is easy to miss. INEWLI opens every wave and every
// life with `LDA I,-1 / STA PULSON` (ALWELG.MAC:46-48) — NEGATIVE, so the wave starts
// with the pulse off. It also pins the counter's residue for the rest of the wave: from
// -1 in steps of 4, PULSON can only ever land on 3 (mod 4). The reachable values are
// therefore -65 .. 15 — twenty-one of them, two of which are turning points, so the
// period is 2*21 - 2 = 40 frames — and the lit half (PULSON >= 0) is exactly {3, 7, 11,
// 15}: the peak once, the other three twice. SEVEN frames on, thirty-three off.
//
// Seed the same machine at 0 instead and it lands on {0,4,8,12,16} and gives NINE. The
// audit says nine (and its refuter says the period is 42); neither read INEWLI. The
// period is 40 and the pulse is lit for 7 — see the tp1-5 deviations.
export const PULSE_SON_INIT = -1
export const FUSEBALL_JITTER_INTERVAL = 0.3  // seconds between erratic lane hops
// fuzz_move probability gate (rev-3 §D l.240-250): a fuseball only slides a lane
// on a passing roll, so its approach is biased-but-not-relentless. The exact
// fuzz_move_prb byte is not in the extracted notes; 0.6 keeps it lively.
export const FUSEBALL_MOVE_PROB = 0.6

// ── WFUSCH: does the fuseball chase, and where? (tp1-25, the other half of W-023) ──
//
// JFUSEUP asks the SAME byte two different questions, and they are two different bits:
//
//     LDA WFUSCH / IFMI    bit 7 — "CHASE PLAYER AT TOP?"  (ALWELG.MAC:2122-2124)
//     BIT WFUSCH / IFVS    bit 6 — "CHASE PLAYER ON TUBE?" (ALWELG.MAC:2135-2137)
//
// (`BIT` puts operand bit 7 in N and bit 6 in V — which is exactly what IFMI/IFVS read.)
//
// ⚠ FUSE_CHASE_AT_TOP IS NOT WIRED, AND THAT IS DELIBERATE — see tp1-25 deviation D3.
// The ROM asks its question on JFUSEUP's "TOO HIGH?" arm (2121-2130), the branch a fuse
// takes while riding UP near the rim. Our fuseball has no such arm: it climbs on moveAlong
// with its own clamp at the top and never enters the up/down oscillation the ROM's fuse
// does, so there is no live decision point for bit 7 to gate. The constant is here because
// it is half of the byte TWFUSC actually stores (and ALCOMN.MAC:786 names both — "FUSE
// CHASE PLAYER FLAG (D7 FOR TOP;D6 FOR TUBE)"), not because the port consults it.
// Do not read this pair and assume both are live. Only ON_TUBE is.
export const FUSE_CHASE_AT_TOP = 0x80
export const FUSE_CHASE_ON_TUBE = 0x40

// TWFUSC (ALWELG.MAC:686-690) — the wave contour for WFUSCH, transcribed as records:
//
//     TWFUSC: .BYTE TR,17.,32.,0,40
//             .BYTE TR,33.,48.,40,0C0
//             .BYTE T1,49.,99.,0C0
//             .BYTE TE
//
// TR IS NOT A RAMP. CONTOUR's own type table says so — `TR=0C;ALTERNATE BETWEEN BYTES 3
// & 4` (414) — and DOTR (858-865) is `JSR RANGER / AND I,1 / IFNE / INY`: byte 4 on an ODD
// offset into the range, byte 3 on an EVEN one. RANGER (848-856) is `TEMP2 - startWave`,
// and TEMP2 is the 1-based wave (CONTOUR loads CURWAV and INCs it, 415-423).
//
// So the FIRST wave of a TR range draws byte 3, and wave 17 — offset 0 — draws ZERO:
// the fuseball does NOT chase at wave 17. The chase starts at 18. Read this table as a
// ramp and you will be off by one at every range boundary.
const TWFUSC: ReadonlyArray<
  | { readonly type: 'TR', readonly start: number, readonly end: number, readonly even: number, readonly odd: number }
  | { readonly type: 'T1', readonly start: number, readonly end: number, readonly value: number }
> = [
  { type: 'TR', start: 17, end: 32, even: 0x00, odd: 0x40 },
  { type: 'TR', start: 33, end: 48, even: 0x40, odd: 0xc0 },
  { type: 'T1', start: 49, end: 99, value: 0xc0 },
]

/**
 * WFUSCH for a wave — CONTOUR (ALWELG.MAC:398-470) walked over TWFUSC.
 *
 * Below wave 17 no record matches, CONTOUR runs off the end of the table onto TE and
 * "EXIT ON EOT TYPE CODE WITH 0" (442). That zero is a REAL answer, not a missing one:
 * it is precisely what makes every fuseball decision fall to the LEFRIT coin, which is
 * the whole of tp1-5's half of W-023. Never `|| fallback` this.
 *
 * ── The deep waves fold back IN. The ROM cannot fall off its own table. ──────────────
 * CONTOUR rewrites the wave BEFORE it walks (415-423):
 *
 *     LDA CURWAV / CMP I,98. / IFCS      ;CURWAV >= 98 — displayed wave >= 99
 *       LDA RANDO2 / AND I,1F / ORA I,40 ;-> 0x40..0x5F = 64..95
 *     ENDIF
 *     STA TEMP2 / INC TEMP2              ;-> TEMP2 = 65..96
 *
 * From wave 99 up it plays a RANDOM wave in 65..96 — and that band lies wholly inside the
 * T1 record below, so the draw is UNOBSERVABLE in WFUSCH: every substituted wave yields
 * the same 0xC0. We fold to 99 and land on the identical byte without touching the RNG,
 * which is what keeps this a pure function of `level`.
 *
 * We need the fold because the PORT reaches a state the ROM cannot: `s.level` increments
 * without a cap (sim.ts), and `MAX_SELECT_LEVEL` bounds only the level-SELECT screen. Walk
 * off the end of the table and the TE zero comes back — the same value that means "no
 * chase" below wave 17 — and the wave-100 fuseball silently returns to the coin, which is
 * the very bug this story exists to remove. (Found in review, round 1.)
 */
export function wfuschForLevel(level: number): number {
  const wave = contourWave(level)   // CONTOUR's fold — extracted once, tp1-7 (see contourWave)
  for (const r of TWFUSC) {
    if (wave < r.start || wave > r.end) continue
    switch (r.type) {
      case 'T1': return r.value
      case 'TR': return (wave - r.start) % 2 === 1 ? r.odd : r.even  // DOTR: odd takes byte 4
      default: return assertNever(r, 'TWFUSC record type')           // TA/TZ/TB are not ported
    }
  }
  return 0   // TE — end of table
}
// Spiker near-turnaround (story 6-15). ROM clamps `along` to $20 and reverses
// (move away) once it climbs below it (rev-3 §C l.202-208). $20 → depth
// (0xf0-$20)/224 ≈ 0.929. This is the SAME $20 that also caps the spike height
// (SPIKE_MAX_DEPTH): story 6-15 had kept them separate (a 0.75 spike cap) for
// warp-crash balance, but PM ruling 2026-07-13 OVERTURNED that deviation and
// reunited both at the ROM's single $20 (see SPIKE_MAX_DEPTH, findings W-039 / B-006).
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
// There is no SPLIT_CHILD_DEPTH here any more, and that is the point of tp1-24 (W-030).
//
// It was 0.85, and its comment said "Must be < PLAYER_RIM_DEPTH (0.92) so a rim-split is
// not an instant grab" — a deliberate softening, written before the fidelity epic, that
// clamped a tanker's children safely below the grab line. (That 0.92 was itself invented;
// the grab line is the RIM — see PLAYER_RIM_DEPTH above, and tp1-27 / W-049.) The cabinet
// does the opposite on purpose: KILINV (ALWELG.MAC:2300-2302) saves the dying parent's own
// INVAY into TEMP0 and ACTINV (1219-1226) seats each child straight back out of it, so both
// are born at the parent's EXACT depth. A carrier that arrives on its own bursts at $20 —
// 0.9286 — so the children are born high in the well rather than at a soft 0.85.
//
// They are NOT born lethal, and tp1-24's claim that they were is retracted (tp1-27). The
// burst line ($20) sits BELOW the grab line ($10 = the rim), and ATOP is tested BEFORE the
// carrier check (1744-1750): a carrier that actually reaches the rim becomes a CHASER
// instead of bursting. So a newborn child is always below the grab line and must climb the
// last stretch — and become a chaser — before it can touch anyone.
//
// The constant is deleted rather than renumbered because there is no number that belongs
// here: the children's depth is not a constant at all, it is the parent's. Do not
// reintroduce it to soften the burst — the burst's fairness lives in the other two thirds
// of the mechanism (the parent's own lane is VACATED, and the children cannot flip onto
// the player), both in splitTanker.

// ─── $20: ONE ROM CONSTANT, READ TWICE (W-032, and the bug tp1-5 first shipped) ──────
//
// SPLCHA's "SPLITTING TOO CLOSE TO PLAYER?" (ALWELG.MAC:1494-1502): `LDA TEMP0 / CMP I,20
// / IFCC` against the depth the parent DIED at. Inside $20 of the rim the children take
// NEWGEN — the generic program for their appearance code, which for a flipper is NOJUMP —
// instead of the wave's flipping one. "YES. NO FLIPPING".
export const SPLIT_TOO_CLOSE_DEPTH = (0xf0 - 0x20) / WARP_ALONG_SPAN  // ≈ 0.929
//
// ...and the auto-split that a CLIMBING carrier triggers reads the SAME BYTE. JSMOVE
// (1748-1758) tests the top of the well twice, in this order:
//
//     CMP CURSY / BEQ ATOP / IFCC   ;AT TOP?                      -> JSR CHASER
//     ELSE
//     CMP I,20  / IFCC              ;TOO CLOSE TO TOP FOR CARRIER?
//                                   -> JSR KILINV  ;SPLIT CARRIER
//
// and the KILINV it jumps to is the one that calls SPLCHA (2344). So the carrier bursts
// INSIDE the too-close band, always, and SPLCHA's compare is a foregone conclusion: a
// tanker that arrives under its own steam ALWAYS gives its children the non-flipping cam.
// Flipping children are what you get for shooting it lower down, and nothing else.
//
// These are therefore not two numbers that happen to be near each other — they are one
// number, and writing them apart is what made W-032's fix dead code. TANKER_SPLIT_DEPTH
// was 0.9 (INVAY 38.4) while the branch judging it read $20 (INVAY 32 = depth 0.9286), so
// the tanker was destroyed 0.029 depth-units before it could ever enter the band its own
// rule is written for. The branch was correct, reachable by no board the game can produce,
// and stamped `remediated_by` regardless. Do not split them apart again.
export const TANKER_SPLIT_DEPTH = SPLIT_TOO_CLOSE_DEPTH

export interface LevelParams {
  enemyCount: number
  flipperSpeed: number   // depth units per second
  flipperCam: number     // WFLICAM — the CAM program THIS wave's flippers run (tp1-4)
  spikerSpeed: number    // depth units/s for spiker oscillation
  fuseballSpeed: number  // depth units/s climb for fuseballs
  tankerSpeed: number    // depth units/s climb for tankers
}

// ─── THE 7-INVADER CAP AND THE NYMPH QUEUE (tp1-6) ───────────────────────────
//
// NINVAD (ALCOMN.MAC:809, `NINVAD= 7`): the ROM's active-invader arrays hold
// SEVEN slots — the hardware cannot express an 8th live invader. Every
// activation, hatch and split child alike, goes through ACTINV's slot scan
// (ALWELG.MAC:1219-1263) and is refused when no slot is free.
export const NINVAD = 7
// WINVMX (ALCOMN.MAC:732, "MAX # OF INVADERS-1"): the byte MOVNYM compares the
// live count against. TINVMX (ALWELG.MAC:695, `.BYTE T1,1,99.,6`) is a single
// constant record spanning every wave 1-99 — the cap NEVER varies by wave, and
// CONTOUR folds waves >= 99 back inside the record, so there is no wave that
// can walk off it. The gate itself is STRICTLY GREATER: `CMP WINVMX / IFCS /
// IFNE` (1113-1115) — both flags of ONE compare — so nymphs still advance at 6
// live (and hatch to 7); they freeze only once all NINVAD slots are booked.
export const WINVMX = NINVAD - 1

// ─── THE FUSEBALL TURN-BACK (W-024, tp1-6) ───────────────────────────────────
//
// JFUSEUP (ALWELG.MAC:2110-2118): climbing with nymphs left (`LDY NYMCOU /
// IFNE`) on an early wave (`LDY CURWAV / CPY I,17.` — CURWAV is 0-based, so
// displayed waves 1-17), the climb is capped at INVAY $20: "TURN BACK BEFORE
// TOP". The same $20 byte as the spiker's turnaround, kept as its OWN constant
// (the tp1-5 lesson: one number, two rules — they must be able to move apart).
export const FUSE_TURNBACK_DEPTH = (0xf0 - 0x20) / WARP_ALONG_SPAN  // ≈ 0.929
// The descent leg reverses at INVAY $80 — "AT BOTTOM OF RANGE?" (2131-2133) —
// so the early-wave fuse yo-yos between depth 0.5 and 0.929 while nymphs remain.
export const FUSE_RANGE_FLOOR_DEPTH = (0xf0 - 0x80) / WARP_ALONG_SPAN  // = 0.5
// `CPY I,17.` on the 0-based CURWAV: the last DISPLAYED wave that is "early".
export const FUSE_EARLY_WAVE_MAX = 17

// ─── THE SKILL CONTOUR: CONTOUR/WTABLE (tp1-7) ───────────────────────────────
//
// The ROM sets every per-wave difficulty parameter by walking WTABLE and dispatching on a
// one-byte TYPE CODE (ALWELG.MAC:398-470 CONTOUR, :762 DOTYPE). We port that machinery ONCE
// and read eight tables through it — enemy count, invader speed, spiker speed, enemy-bolt
// cap, enemy-bolt speed, tanker cargo, the introduction maxes, and the pre-seeded spikes.
// The hand-tuned curves each replaces are DELETED (tp1-7 AC-2), not left as fallbacks.

// CONTOUR rewrites the wave BEFORE the walk (ALWELG.MAC:415-423): for CURWAV >= 98 (displayed
// wave >= 99) it substitutes a RANDOM wave in 65..96, so the ROM can never fall off its own
// table. Our s.level is uncapped (sim.ts increments it forever; MAX_SELECT_LEVEL bounds only
// the SELECT screen), so a naive walk returns the end-of-table 0 above wave 99 — catastrophic
// here (0 enemies, a 0/1 bolt cap, a frozen speed). We fold deterministically to 99, the last
// row of every table. For the single-record deep tables that is byte-identical to the ROM's
// random band; for the multi-record ones (TNYMMX/TINVIN) it lands on the hardest wave rather
// than the RNG the port cannot reproduce (tp1-7 deviations). This is the shared helper the
// tp1-26 epic note asks for — wfuschForLevel routes through it, and WPULTIM/WPULPOT will.
export function contourWave(level: number): number {
  return level >= 99 ? 99 : level
}

// A CONTOUR record, keyed by the ROM's type code (ALWELG.MAC:408-414):
//   T1 — one byte for the whole range · TZ — one byte per wave · TA — base + delta*offset
//   TR — alternate two bytes by wave parity (DOTR, :858-865)
// TB ("add byte to WINVIL") is modelled as T1 for the byte and the WINVIL add is done by the
// consumer; TZANDF (fold the wave mod 16) is handled in initialSpikeHeightForLevel.
type ContourRecord =
  | { readonly t: 'T1'; readonly start: number; readonly end: number; readonly v: number }
  | { readonly t: 'TZ'; readonly start: number; readonly end: number; readonly vs: readonly number[] }
  | { readonly t: 'TA'; readonly start: number; readonly end: number; readonly base: number; readonly delta: number }
  | { readonly t: 'TR'; readonly start: number; readonly end: number; readonly even: number; readonly odd: number }

// CONTOUR's walk: find the record covering the (folded) wave and decode it. Returns the
// end-of-table 0 (TE) only for a wave BELOW a table's first record — a real answer ("none"/
// "clean"), never a walk-off, because the fold keeps deep waves on the last record.
function contourValue(records: readonly ContourRecord[], level: number): number {
  const wave = contourWave(level)
  for (const r of records) {
    if (wave < r.start || wave > r.end) continue
    switch (r.t) {
      case 'T1': return r.v
      case 'TZ': return r.vs[wave - r.start]
      case 'TA': return r.base + (wave - r.start) * r.delta
      case 'TR': return (wave - r.start) % 2 === 1 ? r.odd : r.even
      default: return assertNever(r, 'CONTOUR record type')
    }
  }
  return 0 // TE — end of table
}

// ── 1. TNYMMX (ALWELG.MAC:697-703) — NWNYMC, the wave's enemy budget. NON-MONOTONIC:
// it DROPS at wave 7 (22→20) and wave 12 (27→24). A straight line cannot express it (W-011).
const TNYMMX: readonly ContourRecord[] = [
  { t: 'TZ', start: 1, end: 16, vs: [10, 12, 15, 17, 20, 22, 20, 24, 27, 29, 27, 24, 26, 28, 30, 27] },
  { t: 'TA', start: 17, end: 26, base: 20, delta: 1 },
  { t: 'T1', start: 27, end: 39, v: 27 },
  { t: 'TA', start: 40, end: 48, base: 29, delta: 1 },
  { t: 'TA', start: 49, end: 64, base: 31, delta: 1 },
  { t: 'TA', start: 65, end: 80, base: 35, delta: 1 },
  { t: 'TA', start: 81, end: 99, base: 43, delta: 1 },
]
export function enemyCountForLevel(level: number): number {
  return contourValue(TNYMMX, level)
}

// ── 2. TINVIN (ALWELG.MAC:591-599) — WINVIL, the base invader speed (raw byte, negative).
// TIMES8 (:560-578) scales |WINVIL| into 8.8 fixed point, so along-units/frame = |WINVIL|/32.
// DIPS at wave 17 (-96 → -81) and keeps CLIMBING past 33; it is NOT a straight line (W-012).
const TINVIN: readonly ContourRecord[] = [
  { t: 'TA', start: 1, end: 8, base: -44, delta: -5 },
  { t: 'TZ', start: 9, end: 16, vs: [-81, -84, -84, -84, -88, -92, -96, -96] },
  { t: 'TA', start: 17, end: 25, base: -81, delta: -3 },
  { t: 'TA', start: 26, end: 32, base: -99, delta: -3 },
  { t: 'TA', start: 33, end: 39, base: -108, delta: -3 },
  { t: 'TA', start: 40, end: 48, base: -110, delta: -1 },
  { t: 'TA', start: 49, end: 64, base: -120, delta: -1 },
  { t: 'TR', start: 65, end: 99, even: -160, odd: -191 },
]
function winvilForLevel(level: number): number {
  return contourValue(TINVIN, level)
}
// A raw WINVIL byte → depth/sec: |raw|/32 along-units/frame, then × ROM_FPS / WARP_ALONG_SPAN.
function invaderSpeedFromRaw(raw: number): number {
  return ((Math.abs(raw) / 32) * ROM_FPS) / WARP_ALONG_SPAN
}
// The flipper (and tanker, and — doubled — fuseball) climb speed IS WINVIL. wave 1 = -44 →
// 1.375 along/frame (the shared PULSAR L1 byte); wave 33 = -108 → 3.375.
export function flipperSpeedForLevel(level: number): number {
  return invaderSpeedFromRaw(winvilForLevel(level))
}

// ── 3. TSPIIN (ALWELG.MAC:602-605) — the spiker's speed slot is WINVIL + this byte (type TB).
// The byte is 0 for waves 1-20, so the spiker IS the flipper there; -48/-40 make it FASTER in
// the late game (W-014). Modelled as the byte (T1); the WINVIL add is here in the consumer.
const TSPIIN: readonly ContourRecord[] = [
  { t: 'T1', start: 1, end: 20, v: 0 },
  { t: 'T1', start: 21, end: 32, v: -48 },
  { t: 'T1', start: 33, end: 48, v: -40 },
  { t: 'T1', start: 49, end: 99, v: -48 },
]
export function spikerSpeedForLevel(level: number): number {
  return invaderSpeedFromRaw(winvilForLevel(level) + contourValue(TSPIIN, level))
}

// ── 4. TCHAMX (ALWELG.MAC:586-588) — WCHAMX, "MAX # ENEMY SHOTS -1". FIREIC searches slots
// WCHAMX..0 (the ';ADD 1'), so the live concurrent cap is WCHAMX+1: 2 at wave 1, NON-MONOTONIC
// (up to 4 at wave 5, back to 3 at wave 6). W-019 / DA-002.
const TCHAMX: readonly ContourRecord[] = [
  { t: 'TZ', start: 1, end: 9, vs: [1, 1, 1, 2, 3, 2, 2, 3, 3] },
  { t: 'T1', start: 10, end: 64, v: 2 },
  { t: 'T1', start: 65, end: 99, v: 3 },
]
export function enemyBoltCapForLevel(level: number): number {
  return contourValue(TCHAMX, level) + 1
}

// ── 8. TELIHI (ALWELG.MAC:696) — NWTELI, the initial height of every enemy line, a TZANDF
// table indexed by (wave-1) mod 16 (the trailing 4 bytes are dead — the index never reaches
// them). Byte 0 = "LINE VACANT" (ALWELG.MAC:2209) → no spike; a non-zero byte is the spike TIP
// in along-coords, so height = ($F0 - byte)/224. From wave 4 every lane opens spiked (W-037).
const TELIHI: readonly number[] = [
  0, 0, 0, 0xe0, 0xd8, 0xd4, 0xd0, 0xc8, 0xc0, 0xb8, 0xb0, 0xa8, 0xa0, 0xa0, 0xa0, 0xa8,
]
export function initialSpikeHeightForLevel(level: number): number {
  const byte = TELIHI[(contourWave(level) - 1) % 16]
  return byte === 0 ? 0 : (0xf0 - byte) / WARP_ALONG_SPAN
}

// ── 6. WWTAC2 / WWTAC3 (ALWELG.MAC:614-620) — tanker cargo slots 2 & 3. Slots 0 & 1 are
// hard-set to flipper on EVERY wave (CONTOUR, :551-553), so all four are flippers until wave
// 33; slot 2 turns fuseball at 33 and pulsar at 41 (W-033). ZCARFL/ZCARFU/ZCARPU = 1/3/2 in the
// ROM (ALCOMN.MAC:861-864); here they are indices into CARGO_BY_CODE.
const ZCARFL = 0
const ZCARFU = 1
const ZCARPU = 2
const CARGO_BY_CODE: readonly TankerCargo[] = ['flipper', 'fuseball', 'pulsar']
const WWTAC2: readonly ContourRecord[] = [
  { t: 'T1', start: 1, end: 32, v: ZCARFL },
  { t: 'T1', start: 33, end: 40, v: ZCARFU },
  { t: 'T1', start: 41, end: 99, v: ZCARPU },
]
const WWTAC3: readonly ContourRecord[] = [
  { t: 'T1', start: 1, end: 48, v: ZCARFL },
  { t: 'T1', start: 49, end: 99, v: ZCARFU },
]
function tankerCargoSlots(level: number): readonly TankerCargo[] {
  return ['flipper', 'flipper', CARGO_BY_CODE[contourValue(WWTAC2, level)], CARGO_BY_CODE[contourValue(WWTAC3, level)]]
}

// ── 7. The introduction MAXes (ALWELG.MAC:628-676). tp1-7 reads only the INTRODUCTION wave —
// the first wave a type's max is non-zero (WFLIMX gives flippers wave 1) — to gate the spawn
// roll. Tankers first appear on WAVE 3, spikers on WAVE 4 (W-035). The per-wave COUNT
// enforcement and the min tables, and WSPIMX's mid-game gaps, are the population solver, tp1-8.
const WTANMX: readonly ContourRecord[] = [
  { t: 'TZ', start: 1, end: 5, vs: [0, 0, 1, 0, 1] },
  { t: 'T1', start: 6, end: 16, v: 2 },
  { t: 'T1', start: 17, end: 26, v: 1 },
  { t: 'T1', start: 27, end: 32, v: 1 },
  { t: 'T1', start: 33, end: 44, v: 2 },
  { t: 'T1', start: 45, end: 99, v: 3 },
]
const WSPIMX: readonly ContourRecord[] = [
  { t: 'TZ', start: 1, end: 6, vs: [0, 0, 0, 2, 3, 4] },
  { t: 'T1', start: 7, end: 10, v: 4 },
  { t: 'T1', start: 11, end: 16, v: 3 },
  { t: 'T1', start: 20, end: 25, v: 2 },
  { t: 'TZ', start: 26, end: 32, vs: [1, 2, 2, 2, 1, 1, 2] },
  { t: 'T1', start: 53, end: 39, v: 1 }, // ALWELG.MAC:633 `.BYTE T1,35,39.,1` — the `35` is UN-dotted, so under ALWELG's hex radix it is 0x35 = 53: a DEAD [53,39] range → waves 35-39 spiker-max 0, like every other gap here. WSPIMI:625 DOTS it (`35.` = dec 35, min 1), so the assembled ROM is self-contradictory (min 1 > max 0) — a 1981 typo tp1-8's solver resolves. NOT decimal 35.
  { t: 'T1', start: 43, end: 99, v: 1 },
]
const WFUSMX: readonly ContourRecord[] = [
  { t: 'T1', start: 11, end: 16, v: 1 },
  { t: 'T1', start: 22, end: 25, v: 1 },
  { t: 'T1', start: 27, end: 32, v: 1 },
  { t: 'T1', start: 33, end: 39, v: 4 },
  { t: 'T1', start: 40, end: 99, v: 3 },
]
const WPULMX: readonly ContourRecord[] = [
  { t: 'TZ', start: 17, end: 32, vs: [5, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 4, 2] },
  { t: 'T1', start: 33, end: 99, v: 3 },
]
// ── 8. The per-type MIN tables + flipper MAX (ALWELG.MAC:621-676), tp1-8. NYMCHA reads the
// full min/max pair per type per wave. The four other MAX tables (WTANMX/WSPIMX/WFUSMX/WPULMX)
// landed in tp1-7; these five MINs and the flipper MAX are the population solver's new data.
const WFLIMI: readonly ContourRecord[] = [
  { t: 'T1', start: 1, end: 4, v: 1 },
  { t: 'T1', start: 5, end: 99, v: 0 }, // flippers required only on waves 1-4, then min 0
]
const WFLIMX: readonly ContourRecord[] = [
  { t: 'T1', start: 1, end: 4, v: 4 },
  { t: 'T1', start: 5, end: 16, v: 5 },
  { t: 'T1', start: 17, end: 19, v: 3 },
  { t: 'T1', start: 20, end: 25, v: 4 },
  { t: 'T1', start: 26, end: 99, v: 5 },
]
const WPULMI: readonly ContourRecord[] = [
  { t: 'T1', start: 17, end: 32, v: 2 },
  { t: 'T1', start: 33, end: 99, v: 1 },
]
const WTANMI: readonly ContourRecord[] = [
  { t: 'TZ', start: 1, end: 4, vs: [0, 0, 1, 0] }, // a tanker is REQUIRED on wave 3
  { t: 'T1', start: 5, end: 16, v: 1 },
  { t: 'T1', start: 17, end: 32, v: 1 },
  { t: 'T1', start: 33, end: 39, v: 1 },
  { t: 'T1', start: 40, end: 99, v: 1 },
]
const WSPIMI: readonly ContourRecord[] = [
  { t: 'TZ', start: 1, end: 4, vs: [0, 0, 0, 1] }, // a spiker is REQUIRED on wave 4
  { t: 'T1', start: 5, end: 16, v: 2 },
  { t: 'T1', start: 17, end: 19, v: 0 },
  { t: 'T1', start: 20, end: 32, v: 1 },
  // ALWELG.MAC:625 `.BYTE T1,35.,39.,1` — DOTTED (decimal 35) so spiker MIN is 1 on waves 35-39,
  // where WSPIMX's UN-dotted 35 (rules.ts WSPIMX record 6, 0x35=53 dead range) gives MAX 0. NYMCHA
  // reads both; min 1 > max 0 resolves to ZERO spikers because every launch is gated on openings != 0.
  { t: 'T1', start: 35, end: 39, v: 1 },
  { t: 'T1', start: 44, end: 99, v: 1 },
]
const WFUSMI: readonly ContourRecord[] = [
  { t: 'T1', start: 11, end: 16, v: 1 },
  { t: 'T1', start: 22, end: 25, v: 1 },
  { t: 'T1', start: 27, end: 99, v: 1 },
]

// NYMCHA indexes WFLMIN/WFLMAX/OPFLIP/FLIPCO by a fixed type order (WTABLE :733-742, NYMTAD
// :1423-1427): flipper, pulsar, tanker, spiker, fuseball. NOT the EnemyKind union order.
const NYMCHA_KINDS: readonly EnemyKind[] = ['flipper', 'pulsar', 'tanker', 'spiker', 'fuseball']
const FLIPPER_IX = 0, PULSAR_IX = 1, TANKER_IX = 2, SPIKER_IX = 3, FUSE_IX = 4
const TYPE_MIN: readonly (readonly ContourRecord[])[] = [WFLIMI, WPULMI, WTANMI, WSPIMI, WFUSMI]
const TYPE_MAX: readonly (readonly ContourRecord[])[] = [WFLIMX, WPULMX, WTANMX, WSPIMX, WFUSMX]
const IX_BY_KIND: Record<EnemyKind, number> = { flipper: 0, pulsar: 1, tanker: 2, spiker: 3, fuseball: 4 }
// ZCARFL/ZCARFU/ZCARPU cargo -> the OPFLIP type index its 2 reserved openings come off
// (NYMCHA :1294-1297 maps ZCARFU -> ZABFUS+1, i.e. the fuse slot).
const CARGO_TYPE_IX: Record<TankerCargo, number> = { flipper: FLIPPER_IX, fuseball: FUSE_IX, pulsar: PULSAR_IX }

const typeMin = (ix: number, level: number): number => contourValue(TYPE_MIN[ix], level)
const typeMax = (ix: number, level: number): number => contourValue(TYPE_MAX[ix], level)

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
  const flipperSpeed = flipperSpeedForLevel(level)
  return {
    // TNYMMX (W-011): the per-wave enemy budget, non-monotonic. Was 6 + 2*(level-1).
    enemyCount: enemyCountForLevel(level),
    flipperSpeed,
    // WFLICAM (NEWFLI, ALWELG.MAC:1428-1433): the wave's flipper program. This is
    // the whole of W-006 — wave 1 gets NOJUMP, so its flippers never flip.
    flipperCam: flipperCamForWave(level),
    // No spawnInterval: the metronome was W-003's divergence and tp1-6 deleted it.
    // Release pacing is ININYM's 16-frame stagger plus slot back-pressure (below).
    // TSPIIN (W-014): the spiker moves at EXACTLY the flipper speed for waves 1-20, then
    // faster (WINVIL + a -48/-40 offset). Was the ad-hoc `0.22 * ramp`.
    spikerSpeed: spikerSpeedForLevel(level),
    // No pulseInterval: the pulse is not a per-pulsar timer any more, and it does not
    // ramp with the level. It is ONE global counter with a fixed 40-frame period
    // (PULSE_STEP / PULSE_SON_*), ticked in sim.ts's stepPulseClock (W-026).
    fuseballSpeed: 2 * flipperSpeed,   // spd_fuzzball = 2 × spd_flipper (fastest enemy)
    tankerSpeed: flipperSpeed,         // tankers climb straight up at flipper speed
  }
}

/**
 * ININYM (ALWELG.MAC:315-340) — the wave's whole enemy budget enters as a
 * staggered nymph queue (INIENE:303-304 loads NWNYMC into NYMCOU; ours is the
 * queue's length). Nymph i is seeded at NYMPY = ((i & $F) << 4) | lane: the
 * ROM's shift is `TXA / ASL ASL ASL ASL` on an EIGHT-BIT accumulator, so the
 * band WRAPS at index 16 — a big wave's nymphs 16+ seed back into the same
 * 256-frame window as 0-15 and the cabinet opens it with interleaved
 * double-density hatching. The one all-zero ASSEMBLED byte is bumped to $0F
 * (`IFEQ / LDA I,0F`) — post-wrap, so index 16 on lane 0 is rescued exactly
 * like index 0 — and a nymph is never born already inactive.
 *
 * (The first GREEN shipped this shift unbounded and stretched every budget
 * past 16 — level 7 and up — slower than the arcade; review round-trip 1.)
 *
 * The ROM rolls the lane as `RANDOM AND I,0F` over its fixed 16 lines; our open
 * wells have laneCount 15, so we roll the tube's real lane range instead —
 * validity over a mask the geometry cannot honor.
 */
export function spawnForLevel(level: number, rng: Rng, laneCount: number): { nymphs: Nymph[] } {
  const nymphs: Nymph[] = []
  const count = levelParams(level).enemyCount
  for (let i = 0; i < count; i++) {
    const lane = nextInt(rng, laneCount)
    const py = ((i & 0x0f) << 4) | lane
    nymphs.push({ lane, py: py === 0 ? 0x0f : py })
  }
  return { nymphs }
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
    // Without this a sixth kind scores `undefined`, and `score += undefined` is NaN —
    // a scoreboard that never recovers, from a switch that compiled clean.
    default: return assertNever(enemy, 'enemy kind')
  }
}

// ── NYMCHA (ALWELG.MAC:1266-1412): the per-type MIN/MAX population solver (W-034). ──────────
// Replaces the memoryless weighted roll: what a hatching nymph becomes is a CONSTRAINT
// SATISFACTION over the live board, not a draw. Returns null when no type may launch (the ROM's
// TEMP0=0 -> CONYMP puts the nymph back) — the back-pressure that keeps the 7-cap safe. It is
// MIN-DRIVEN: every launch path is gated on the type's min != 0 (steps 4/5/7) or is spiker/
// tanker-only (step 6), so a min-0 type (flippers past wave 4) never hatches fresh — those come
// only from tanker splits. Deterministic except the fallback type + the tanker-cargo slot (rng).
export interface NymchaPick {
  readonly kind: EnemyKind
  readonly cargo: TankerCargo
}

// LINEY (the ROM's per-line enemy reach): a lane whose deepest enemy is near the rim is a LONG
// line, an empty/shallow one short/dead. LINEY is an INVAY along-byte; our depth is its inversion,
// via the file's own along->depth mapping `(0xF0 - byte) / WARP_ALONG_SPAN` (see
// initialSpikeHeightForLevel). So the ROM's `CMP I,0CC` (ALWELG.MAC:1376) threshold is 0xCC decoded
// through that same mapping — any enemy deeper than this reads as a long line.
const LINE_LONG_DEPTH = (0xf0 - 0xcc) / WARP_ALONG_SPAN // 0xCC under the file's INVAY->depth map (~0.161)

function lineIsLong(enemies: readonly Enemy[], lane: number): boolean {
  let reach = 0
  for (const e of enemies) if (e.lane === lane && e.depth > reach) reach = e.depth
  return reach >= LINE_LONG_DEPTH
}

// NEWTYP/NEWTAN (ALWELG.MAC:1413-1474). A tanker draws a random WTACAR slot and takes a cargo
// whose TYPE still has an opening (so the split can land); if none of the 4 slots' cargo has
// room the tanker launch fails (null). Non-tankers carry a dummy 'flipper' cargo (unused).
function tryLaunch(ix: number, level: number, openings: readonly number[], rng: Rng): NymchaPick | null {
  const kind = NYMCHA_KINDS[ix]
  if (kind !== 'tanker') return { kind, cargo: 'flipper' }
  const slots = tankerCargoSlots(level)
  let slot = nextInt(rng, 4) // RANDOM AND 3
  for (let tries = 0; tries < 4; tries++) {
    const cargo = slots[slot]
    if (openings[CARGO_TYPE_IX[cargo]] > 0) return { kind: 'tanker', cargo }
    slot = (slot + 3) % 4 // DEY, cycling 0..3
  }
  return null
}

export function nymcha(level: number, enemies: readonly Enemy[], hatchLane: number, rng: Rng): NymchaPick | null {
  const count = [0, 0, 0, 0, 0] // FLIPCO — live count per type index
  for (const e of enemies) count[IX_BY_KIND[e.kind]] += 1

  // 1. openings[t] = max(0, WFLMAX[t] - FLIPCO[t]) (:1273-1282).
  const openings = count.map((c, ix) => Math.max(0, typeMax(ix, level) - c))
  // 2. reserve TWO openings of each live carrier tanker's cargo type (:1286-1303). DEVIATION: the
  //    ROM does a raw byte `DEC` twice, which CAN underflow on a reachable board — e.g. wave 6
  //    (WFLIMX=5) with 2 flipper-carrying tankers + 2 split flippers gives openings[flipper]
  //    5-2=3 then -2-2 -> 0xFF, which the step-3 cap then rescues to `free` (a phantom opening).
  //    We clamp at 0 instead (reserve everything). This is a conscious deviation, not byte-faithful,
  //    but its impact is muted: a min-0 type (the only kind that ever over-subscribes here, since
  //    flippers are the sub-33 cargo) never launches fresh anyway, so the phantom opening only ever
  //    shifts openCount, never the spawned type. See tp1-8 Reviewer Item 5.
  for (const e of enemies) {
    if (e.kind === 'tanker') {
      const cix = CARGO_TYPE_IX[e.contains]
      openings[cix] = Math.max(0, openings[cix] - 2)
    }
  }
  // 3. cap every opening at the total free slots, WINVMX+1 - sum(FLIPCO) = NINVAD - live (:1304-1320).
  const free = Math.max(0, NINVAD - enemies.length)
  for (let i = 0; i < 5; i++) openings[i] = Math.min(openings[i], free)

  const openCount = openings.reduce((n, o) => (o > 0 ? n + 1 : n), 0)
  if (openCount === 0) return null // TEMP0=0 -> nymph goes back

  // 4. exactly one open type: launch it ONLY if it is required (min != 0) (:1332-1347).
  if (openCount === 1) {
    const ix = openings.findIndex((o) => o > 0)
    return typeMin(ix, level) !== 0 ? tryLaunch(ix, level, openings, rng) : null
  }

  // 5. satisfy any below-min type FIRST — nested inside "has openings" (:1351-1364). The min>max
  //    resolution lives here: a type with 0 openings (max 0) never reaches this compare, so on
  //    waves 35-39 the spiker (min 1, max 0) is never launched — max governs, the min is inert.
  for (let ix = 4; ix >= 0; ix--) {
    if (openings[ix] > 0 && count[ix] < typeMin(ix, level)) {
      const pick = tryLaunch(ix, level, openings, rng)
      if (pick) return pick
    }
  }

  // 6. smart launch: spiker on a short/dead line, tanker on a long one (:1366-1385).
  if (openings[SPIKER_IX] > 0 && openings[TANKER_IX] > 0) {
    const ix = lineIsLong(enemies, hatchLane) ? TANKER_IX : SPIKER_IX
    const pick = tryLaunch(ix, level, openings, rng)
    if (pick) return pick
  }

  // 7. random fallback: RANDO2 AND 3, +1 (excludes flipper as the START), then walk to the first
  //    type with a non-zero min AND openings (:1386-1408).
  let ix = nextInt(rng, 4) + 1 // 1..4
  for (let step = 0; step < 5; step++) {
    if (typeMin(ix, level) !== 0 && openings[ix] > 0) {
      const pick = tryLaunch(ix, level, openings, rng)
      if (pick) return pick
    }
    ix = ix - 1 < 0 ? 4 : ix - 1 // DEX; wrap below 0 to 4
  }
  return null // signal failure -> nymph goes back
}

// Tanker cargo is the WTACAR 4-slot table (W-033), not a roster-aligned weight. NEWTAN
// (ALWELG.MAC:1445-1474) draws a RANDOM slot 0-3 and takes its type. Slots 0 & 1 are always
// flipper (CONTOUR, :551-553); slots 2 & 3 are WWTAC2/WWTAC3 — so a tanker carries ONLY
// flippers until wave 33, a fuseball becomes possible at 33, a pulsar only at 41. Far LATER
// than the roster intro (fuseball 11 / pulsar 17), so a split still never manufactures a type
// before it is in the roster. (The old L11/L17 cargo gates manufactured them 22/24 waves early.)
export function rollTankerCargo(level: number, rng: Rng): TankerCargo {
  return tankerCargoSlots(level)[nextInt(rng, 4)] // RANDOM AND 3
}
