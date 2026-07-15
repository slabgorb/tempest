// src/core/state.ts
import { Tube, tubeForLevel } from './geometry'
import { type Rng, createRng } from '@arcade/shared/rng'
import { START_LIVES, spawnForLevel, PULSE_SON_INIT, PULSE_STEP } from './rules'
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
  // It reached the rim and CHASER converted it: it is pinned at the top, running
  // TOPPER, and circling the player (W-009, tp1-5). Absent = still climbing a lane.
  //
  // A chaser is a STATE, not a kind. The ROM's CHASER (ALWELG.MAC:1824-1874) does not
  // touch the invader's appearance bits: a flipper that takes the rim is still drawn as
  // a flipper and still scores as one. What changes is where it is (INVAY == CURSY),
  // what it runs (CAMPC = TOPPER), and which of the two counters it belongs to — it
  // leaves INMCOU and joins INCCOU. This flag IS that membership: count the invaders
  // carrying it and you have INCCOU, which is the only reader the ROM has (CHASER's
  // pincer rule, 1845-1869). Fuseballs never carry it — KILINV (2302-2311) books a fuse
  // at the rim as a MOVER, not a chaser, and JFUSEUP never calls CHASER.
  chasing?: boolean
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
  // True while the lane is electrified. NOT a clock any more (W-026): it is this
  // pulsar's copy of the ONE global phase, re-stamped from PulseState every frame by
  // stepPulseClock. The private pulseTimer that used to sit beside it is gone — it let
  // two pulsars strobe out of step, which the cabinet cannot do.
  pulsing: boolean
}

export type Enemy = Flipper | Tanker | Spiker | Fuseball | Pulsar

/**
 * A NYMPH — one of the wave's not-yet-live enemies, climbing in from beyond the
 * far end (W-002/DA-012, tp1-6). The ROM keeps 64 slots of these (NNYMPH,
 * ALCOMN.MAC:811) in the NYMPY/NYMPL arrays; we keep a dynamic array and NYMCOU
 * (ALCOMN.MAC:916, "# OF NYMPHS") is simply `nymphs.length`.
 */
export interface Nymph {
  /** NYMPL — the line it will hatch on. Rotates while far out (py >= $40), then commits. */
  lane: number
  /**
   * NYMPY — integer ROM FRAMES until it hatches, minus 1 per step while movement
   * is allowed (MOVNYM `SEC / SBC I,1`, ALWELG.MAC:1130-1132). Reaching 0 IS the
   * hatch (CONYMP). Never seeded at 0: ININYM bumps the one all-zero seed to $0F.
   */
  py: number
}

/**
 * The wave's enemy supply — a QUEUE, not a timer (W-003). There is no spawn
 * interval anywhere in ALWELG: nymphs march their py down every frame and stop
 * ONLY when the invader slots are booked or a Superzapper is running (MOVNYM,
 * ALWELG.MAC:1107-1123). Release rate is slot back-pressure, nothing else.
 */
export interface SpawnState {
  nymphs: Nymph[]       // the not-yet-live enemies; NYMCOU == nymphs.length
}

// The ROM's pulse clock — PULSON/PULTIM, one counter for the whole board (W-026).
// A signed byte and its increment; the SIGN of `son` is the pulse ("PULSE STATUS
// (MINUS=OFF)", ALCOMN.MAC:775). It lives on GameState rather than on the pulsars
// because that is what it is: global, and ticked once a frame whether or not a pulsar
// is on the board. See rules.ts (PULSE_STEP / PULSE_SON_*) for the rails and the seed.
export interface PulseState {
  son: number           // PULSON — lit while >= 0
  tim: number           // PULTIM — the per-frame increment; negated at each rail
}

export interface WarpState {
  progress: number      // 0 = warp just entered (Claw at rim), 1 = cursor at the well bottom (ILINDDY)
  velocity: number      // dive speed in progress/sec; accelerates each frame (Story 6-1)
  warning: number       // seconds left on the AVOID SPIKES countdown before the dive (0 = none)
  // tp1-10 (WD-018) / tp1-13 (S-014): the dive's SECOND phase — the post-descent EYE
  // FLY-IN. Once the cursor passes the well bottom (progress ≥ 1, ILINDDY) it is off
  // the lines and in space — crash-proof, the T3 space drone ringing (MOVCUD/SOUTS3,
  // ALWELG.MAC:1032-1037) — while ENDWAV increments the wave and NEWAV2 flies the eye
  // INTO the new well over `flyIn` frames before play resumes (ALWELG.MAC:56-121).
  // This single counter unifies tp1-10's fly-in with tp1-13's provisional inSpace/
  // spaceFrames space phase (WARP_SPACE_FRAMES) — the ROM camera timing tp1-13 deferred.
  // >0 = flying in (new geometry loaded, mode stays 'warp', play deferred); 0/absent
  // = descending or not warping. Optional so the pre-tp1-10 3-field warp literals in
  // the suite still type-check (undefined ≡ 0).
  flyIn?: number
  // tp1-37 (WD-018): the LIVE eye Y during the fly-in, in ROM units. NEWAV2 parks the
  // eye far back (EYE_FLYIN_START = 0xFA00 = -1536, INEWAV ALWELG.MAC:29-33) and walks
  // it toward the new well at +0x18/frame, clamping at the per-well EYLDES = -H
  // (ALWELG.MAC:85-108). Present only while `flyIn > 0`; the shell feeds it to
  // warpDiveTube so the new well animates in. Optional for the same 3-field literals.
  eyeY?: number
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

// tp1-31 (DB-008): the whole-well screen-Z translation, animated by the sim.
// INIWLS snaps ZADJL to the well's target on a NEW LIFE ("AT CENTER
// IMMEDIATELY", ALDISP.MAC:2484-2491) and on a NEW WAVE takes an eighth of the
// gap into ZADEST ("MOVE UP SLOWLY", :2492-2505), which the frame loop then
// adds every frame (ALWELG.MAC:75-84) — the well slides into place over ~8
// frames at each level start.
export interface CameraState {
  /** Current whole-well translate, canvas-y ring units (target: tube.screenZ). */
  screenZ: number
  /** The ROM's ZADEST: a fixed per-frame step toward tube.screenZ; 0 when parked. */
  slidePerFrame: number
}

export interface GameState {
  mode: Mode
  level: number
  tube: Tube
  camera: CameraState   // tp1-31: screen-Z translate + level-start slide (DB-008)
  player: Player
  bullets: Bullet[]
  enemyBullets: EnemyBullet[]        // enemy energy bolts in flight (6-5), capped at 4
  enemies: Enemy[]
  spikes: number[]      // per-lane spike height in depth units (0 = none)
  score: number
  lives: number
  // tp1-13 (S-015): the ROM's BONUS — points pending from an advanced-wave start
  // (0 for a wave-1 start). Set at level select from the BONPTM skill-step ladder,
  // paid ONCE through the shared score path on arrival at the next well, and
  // cleared there ("CLEAR BONUS", ALWELG.MAC:114-117). See rules.startWaveBonus.
  startBonus: number
  spawn: SpawnState
  pulse: PulseState     // PULSON/PULTIM — the board's single pulse phase (W-026)
  warp: WarpState
  select: SelectState
  entry: HighScoreEntryState | null  // non-null only while mode === 'highscore'
  highScoreTable: HighScoreTable<'level'>  // in-memory top scores (persistence is 4-6)
  events: GameEvent[]                // gameplay events emitted this frame (5-1); cleared each step
  prevFire: boolean                  // last frame's input.fire — lets menu confirms edge-trigger (6-2)
  demoActive: boolean                // the self-play attract demo is currently running (Story 10-3)
  // QFRAME — the ROM's free-running frame counter, of which we port the one
  // consumer we have: nymph rotation happens on every OTHER frame (`LDA QFRAME /
  // AND I,1`, MOVNYM ALWELG.MAC:1149-1151). It is GLOBAL parity, not per-nymph:
  // the crawl keeps its half-rate cadence even while the queue's rise is frozen
  // (a frozen py would freeze a py-derived parity with it).
  qframe: number
  rng: Rng
  fireRng: Rng                       // SEPARATE stream for enemy-fire rolls (6-5), so fire decisions
                                     // never desync the movement RNG (mirrors the ROM's pokey1_rand)
}

export function initialState(seed: number): GameState {
  const tube: Tube = tubeForLevel(1)
  // The rng exists before the spawn state because ININYM DRAWS from it: every
  // nymph's hatch lane is a random roll (ALWELG.MAC:324-327), so the queue is a
  // function of the seed like everything else.
  const rng = createRng(seed)
  return {
    mode: 'attract',
    level: 1,
    tube,
    camera: { screenZ: tube.screenZ, slidePerFrame: 0 }, // fresh game = new life: snap (CNWLF2 path)
    player: { lane: 0, alive: true, respawnTimer: 0, superzapper: 'full', zapTimer: 0 },
    bullets: [],
    enemyBullets: [],
    enemies: [],
    spikes: new Array(tube.laneCount).fill(0),
    score: 0,
    lives: START_LIVES,
    startBonus: 0,        // set at level select; attract boots with no pending bonus (tp1-13)
    spawn: spawnForLevel(1, rng, tube.laneCount),
    pulse: { son: PULSE_SON_INIT, tim: PULSE_STEP },  // INEWLI, ALWELG.MAC:46-48
    warp: { progress: 0, velocity: 0, warning: 0 },
    select: { selectedLevel: 1 },
    entry: null,
    highScoreTable: [],
    events: [],
    prevFire: false,
    demoActive: false, // the attract screen boots as a static title; the demo seeds on first idle step
    qframe: 0,
    rng,
    // Derive a distinct seed so the fire stream is decorrelated from movement.
    fireRng: createRng(seed ^ 0x9e3779b9),
  }
}
