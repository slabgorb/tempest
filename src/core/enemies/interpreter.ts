// src/core/enemies/interpreter.ts
//
// The machine that runs the CAM (cam.ts holds the bytes). Findings W-005..W-008.
//
// MOVINV (ALWELG.MAC:1508-1534) executes one invader's program per ROM frame: it
// seeds the no-exit flag, resumes the PC where the invader left it, and calls
// opcodes through JSRCAM — each followed by the dispatcher's unconditional
// `INC CAMPC` — until an opcode clears the flag and yields the frame. The PC then
// persists on the invader, so a program is a coroutine and VEXIT is a suspend.
//
// Our shell drives stepGame at a fixed SIM_STEP, which IS one ROM frame (tp1-1),
// so one stepGame call runs each invader's CAM exactly once, as MOVINV does.
//
// Two things the ROM does here that we deliberately do elsewhere:
//
//   * VKITST / VFUSKI ask "did this invader just kill the cursor?" per invader,
//     mid-program. We resolve every rim kill centrally, after the move, in sim.ts's
//     resolvePlayerHits — same frame, same predicate (shares the player's lane at
//     rim depth, and not mid-jump). They are no-ops here rather than a second,
//     competing kill path.
//   * The pulse CLOCK is global in the ROM (PULSON/PULTIM) and ticks in MOVINV
//     AFTER the invader loop (1536-1570), not inside the CAM. Ours ticks in sim.ts
//     for the same reason: it is a clock, not a program.
import { Enemy, EnemyKind, PulseState } from '../state'
import { Tube, wrapLane } from '../geometry'
import { type Rng, nextFloat, nextInt } from '@arcade/shared/rng'
import {
  LevelParams, PULSAR_CLIMB_SPEED, PULSAR_NEAR_FAR_DEPTH, SPIKER_TURNAROUND_DEPTH,
  SPIKE_MAX_DEPTH, FUSEBALL_JITTER_INTERVAL, FUSEBALL_MOVE_PROB, PUCHDE_FRAMES, wttfraForLevel,
  WARP_ALONG_SPAN, FUSE_CHASE_ON_TUBE, wfuschForLevel, PLAYER_RIM_DEPTH,
} from '../rules'
import { CAM, CAM_ENTRY, CAM_OPS, CAM_PARAM, TNEWCAM } from './cam'
import { assertNever } from '../assert'

/**
 * A jump is EIGHT angle-steps (W-008). JJUMPM (ALWELG.MAC:1892-1976) advances the
 * jump angle by one unit mod 16 per call and ends the jump when it reaches CALSAN's
 * final angle — the start angle plus 8, the half-turn that carries the invader
 * end-over-end about the shared web spoke. Every climbing program places exactly
 * one VJUMPM between consecutive VEXITs, so a climbing flip takes 8 frames. (Only
 * the rim chaser burns WTTFRA of them per frame — its "DOUBLE SPEED JUMP",
 * ALWELG.MAC:2457 — and that is story tp1-5's.)
 */
export const JUMP_ANGLE_STEPS = 8

/**
 * The rim — the ROM's CURSY, the line the cursor sits on. An invader climbing in INVDIR
 * up reaches it when `CMP CURSY / BEQ ATOP / IFCC` fires (ALWELG.MAC:1744-1747), and that
 * is where CHASER takes it. Our depth axis is INVAY inverted and clamped, so the top of
 * the climb IS depth 1 and no epsilon is needed: jsmove's own Math.min lands an
 * overshooting invader exactly here.
 *
 * This is the SAME ROM line the grab is tested against — only a CHASER, seated here by
 * `LDA CURSY / STA X,INVAY`, can run VKITST. It used to be spelled twice, 1 here and 0.92
 * in rules.ts, and the grab used the wrong copy (tp1-27, W-049). Deriving it from the one
 * name is what stops them drifting apart again.
 */
const RIM_DEPTH = PLAYER_RIM_DEPTH

/** One unit of the ROM's 224-unit depth axis — the `INC INVAY` CHASER nudges a flip back by. */
const ALONG_UNIT = 1 / WARP_ALONG_SPAN

/** Is this invader caught mid-jump, between two lines? (The ROM's $80 INVMOT bit.) */
export function isJumping(e: Enemy): boolean {
  return e.jumpAngle !== undefined
}

/**
 * ROM frames a CHASER takes to walk one lane of the rim, at `level`.
 *
 * TOPPER (ALWELG.MAC:2447-2460) is a fixed loop — crouch, jump, repeat — so every lap
 * round it costs the same: the `VSLOOP` crouch, plus however many frames its "DOUBLE
 * SPEED JUMP" needs to spend a flip's eight angle-steps at WTTFRA of them per frame.
 * The landing frame doubles as the next crouch's first, which is why the crouch is not
 * counted twice.
 *
 * The crouch is read straight out of the bytecode — TOPPER's own VSLOOP operand — so
 * this cannot drift from the CAM the interpreter actually runs. src/shell/input.ts sizes
 * the keyboard's escape margin against it (the player must out-rotate the fastest chaser
 * the ROM can build), and tests/shell/tp1-5.rim-speed.test.ts checks the two agree by
 * MEASURING the cadence out of a running game rather than trusting either.
 */
export function chaserRimFramesPerLane(level: number): number {
  const crouch = CAM[CAM_ENTRY.TOPPER + 1]   // `VSLOOP 4` — the operand byte
  return crouch + Math.ceil(JUMP_ANGLE_STEPS / wttfraForLevel(level))
}

/** How far through its tumble, 0 → 1. The renderer swings the bowtie by this. */
export function jumpProgress(e: Enemy): number {
  return (e.jumpAngle ?? 0) / JUMP_ANGLE_STEPS
}

/**
 * A backstop, not a rule. MOVINV's loop is unbounded because a well-formed program
 * always reaches a VEXIT, and ours is frozen ROM data — but a program that could
 * not yield would hang the frame, so it says so loudly instead of spinning. The
 * longest real path through any of the eleven programs is a handful of opcodes.
 */
const MAX_OPS_PER_FRAME = 64

/** Everything the opcodes can reach. The CAM is pure: no clock, no coin. */
export interface CamContext {
  readonly tube: Tube
  readonly params: LevelParams
  readonly level: number
  readonly dt: number
  readonly playerLane: number
  /** Per-lane spike height, in depth units. VELTST reads it; VSTRAI lays it. */
  readonly spikes: number[]
  /** Enemies still to be released this level — JSTRAI's "ANY NYMPHS LEFT?". */
  readonly spawnRemaining: number
  /**
   * Every invader on the board, INCLUDING the one being run. CHASER's pincer rule is the
   * only reader: it counts the chasers already circling (INCCOU) and, when there is
   * exactly one, hunts it down to take the opposite way round. The caller passes the
   * array it is mapping, and the interpreter mutates invaders in place, so this is a
   * LIVE view — an invader that converted earlier this frame is already visible here.
   */
  readonly enemies: readonly Enemy[]
  /** PULSON/PULTIM. The CAM never ticks the pulse; VCHKPU only ever ASKS about it. */
  readonly pulse: PulseState
  /** The shared movement cursor, advanced in place (the caller owns it). */
  readonly rng: Rng
}

/** The appearance codes TNEWCAM is indexed by (ALCOMN.MAC:845-849). */
const APPEARANCE: Readonly<Record<EnemyKind, number>> = {
  flipper: 0,  // ZABFLI
  pulsar: 1,   // ZABPUL
  tanker: 2,   // ZABTAN
  spiker: 3,   // ZABTRA — the "traler", for the spike it trails up the lane
  fuseball: 4, // ZABFUS
}

/**
 * The program a new invader starts on. A flipper takes the WAVE's program — WFLICAM,
 * which levelParams resolves from CAMWAV (NEWFLI, ALWELG.MAC:1428-1433). Every other
 * kind takes its appearance code's entry in TNEWCAM (1483-1484).
 */
export function camForNewEnemy(kind: EnemyKind, params: LevelParams): number {
  return kind === 'flipper' ? params.flipperCam : TNEWCAM[APPEARANCE[kind]]
}

/**
 * NEWGEN's program: the GENERIC one for an appearance code, ignoring the wave. SPLCHA
 * (ALWELG.MAC:1494-1502) hands it to the children of a tanker split too close to the
 * player — "YES. NO FLIPPING", because TNEWCAM[ZABFLI] is NOJUMP (W-032). It is the same
 * table camForNewEnemy reads for every non-flipper; the only difference is that a
 * flipper takes it too, instead of the wave's flipping program.
 */
export function genericCamFor(kind: EnemyKind): number {
  return TNEWCAM[APPEARANCE[kind]]
}

/** VSLOPB's wave parameters (WTABLE, ALWELG.MAC:728-751). */
function camParam(slot: number, level: number): number {
  switch (slot) {
    case CAM_PARAM.WTTFRA: return wttfraForLevel(level)
    case CAM_PARAM.PUCHDE: return PUCHDE_FRAMES
    default: throw new Error(`CAM: no wave parameter in slot ${slot}`)
  }
}

/** The invader's move rate, by kind — the ROM's per-type WINVIN/WINVIL. */
function speedFor(e: Enemy, ctx: CamContext): number {
  switch (e.kind) {
    case 'flipper':  return ctx.params.flipperSpeed
    case 'tanker':   return ctx.params.tankerSpeed
    case 'spiker':   return ctx.params.spikerSpeed
    case 'fuseball': return ctx.params.fuseballSpeed
    // JPULMO (ALWELG.MAC:1780-1788): a pulsar outside the power zone "GO[es]
    // FASTER" — it climbs at the FLIPPER's rate until it crosses PULPOT, then at
    // its own hardcoded spd_pulsar.
    case 'pulsar':
      return e.depth >= PULSAR_NEAR_FAR_DEPTH ? PULSAR_CLIMB_SPEED : ctx.params.flipperSpeed
    // A sixth EnemyKind would otherwise fall out of here as `undefined` and turn every
    // speed — and then every depth — into NaN, silently. `assertNever` makes that a `tsc`
    // error instead. It is imported, not local, because the same rule binds `scoreFor`,
    // `enemyCanShoot`, `makeEnemy` and `stepGame` — and for a while this comment claimed a
    // sixth kind "now fails tsc, at the switch that forgot it" while three of those four
    // still compiled clean and returned `undefined`. A guard in one place is not a rule.
    default:
      return assertNever(e, 'enemy kind')
  }
}

/**
 * Which way to turn to face `to`, as POLDEL computes the delta (ALWELG.MAC:3395-3408)
 * and JCHPLA reads its sign (1876-1889).
 *
 * POLDEL takes the raw difference and then, ONLY on a closed tube, folds it into the
 * shorter way round: `AND I,0F` and sign-extend when it lands past 8
 * (`BIT A,EIGHT / ORA I,0F8`, ";TAKE SHORTEST ROUTE").
 *
 * On a PLANAR well it does no such thing. `BIT WELTYP / IFPL` guards that whole
 * block, and WELTYP is 0xFF on an open sheet — set under Theurer's own comment
 * `;PREVENT WRAP` (ALWELG.MAC:186-187). A sheet has no seam, so there is no long way
 * round to be shorter than; the plain difference IS the direction.
 *
 * Folding a sheet as if it were a tube is not a rounding error, it inverts the
 * answer: with the player more than half a board away, wrap-around arithmetic
 * reports him as lying the OTHER way, and AVOIDR — whose whole purpose is to flee —
 * turns and charges him. Both of AVOIDR's waves (10 and 15) are open sheets, so that
 * was every wave it runs on.
 *
 * ── There is no "no opinion". The answer is never zero. ─────────────────────────────
 * JCHPLA does not test the delta for zero; it `ASL`s the sign bit into the carry and
 * takes the CCW branch on carry CLEAR. Carry clear is delta POSITIVE *or ZERO*, so an
 * invader standing on the player's own lane is sent CCW — deliberately, unconditionally,
 * and every time. We used to return 0 there and leave `rot` untouched, which made the
 * direction a function of whatever the invader happened to be carrying: the same enemy,
 * in the same place, with the same player, flipping two different ways depending on its
 * history. CHASER calls JCHPLA to pick its side of the pincer, so that was a live bug.
 *
 * The half-tube delta folds NEGATIVE for the same reason. On sixteen lanes a delta of
 * exactly 8 has bit 3 set, so `ORA I,0F8` sign-extends it to -8: a tie does not break
 * toward CCW, it breaks toward CW. That is the ROM's tie, not ours to round.
 */
function shortestRot(tube: Tube, from: number, to: number): -1 | 1 {
  if (!tube.closed) return to >= from ? 1 : -1   // ;PREVENT WRAP — and zero is positive
  const n = tube.laneCount
  const forward = (((to - from) % n) + n) % n
  return forward * 2 < n ? 1 : -1               // `BIT A,EIGHT`: half a board round is CW
}

// ── The opcode handlers ──────────────────────────────────────────────────────
// One per CAM subroutine. Those the ROM ends with `STA CAMSTA` return the new
// CAMSTA; the interpreter carries it between opcodes as the zero-page byte does.

/**
 * The move itself, without the arrival: one step along the lane, in INVDIR. This is the
 * body shared by JSMOVU and JSMOVD, and the ONLY mover a fuseball gets — JFUSEUP inlines
 * its own copy (2095-2110) precisely so that a fuse reaching the top does not fall into
 * ATOP and convert.
 */
function moveAlong(e: Enemy, ctx: CamContext): void {
  e.depth = Math.max(0, Math.min(RIM_DEPTH, e.depth + e.direction * speedFor(e, ctx) * ctx.dt))
}

/**
 * CHASER (ALWELG.MAC:1824-1874) — an invader that reaches the rim stops climbing and
 * starts circling. Returns the CAM program counter to resume from, or undefined to leave
 * the PC where it was.
 *
 * The invader does not change into anything: its appearance bits, its score and its
 * drawing are untouched. What CHASER changes is where it is (pinned at CURSY), what it
 * runs (CAMPC = TOPPER), and which counter it belongs to — it leaves INMCOU and joins
 * INCCOU. Hence `chasing`, a state, and not a sixth EnemyKind.
 *
 * The returned PC is TOPPER *minus one*, exactly as the ROM stores it (`LDA I,TOPPER-CAM-1
 * / STA CAMPC`): the dispatcher's own INC completes the jump, so the invader begins
 * TOPPER's crouch in the same frame it arrives, without losing one to the conversion.
 */
function chaser(e: Enemy, ctx: CamContext): number | undefined {
  e.depth = RIM_DEPTH   // "PLACE EXACTLY AT TOP"

  // A pulsar is the one invader that will not take the rim while the wave still owes
  // enemies: `LDA NYMCOU / IFNE` → "SEND IT DOWN" (INVAC2 ^= INVDIR). It bounces down the
  // well and climbs again, and only converts once the nymphs are spent.
  if (e.kind === 'pulsar' && ctx.spawnRemaining > 0) {
    e.direction = -1
    return undefined
  }

  // "STILL FLIPPING? YES. FINISH FLIP BEFORE AT TOP STATUS" — the ROM nudges INVAY back
  // down by one along-unit so the arrival does not fire again next frame, and lets the
  // jump land first. A conversion mid-flip would strand the invader between two lines.
  if (isJumping(e)) {
    e.depth = RIM_DEPTH - ALONG_UNIT
    return undefined
  }

  // THE PINCER (1845-1869). `LDA INCCOU / CMP I,1 / IFNE`: with exactly ONE other chaser
  // already circling, the ROM does not ask which way the player is — it hunts that other
  // chaser down, reads its INVROT and takes the opposite. Two chasers come at you from
  // both sides; they never queue up on the same flank. With none, or with two or more, it
  // falls back to the shortest way round.
  const others = ctx.enemies.filter((o) => o !== e && o.chasing === true)
  if (others.length === 1) e.rot = others[0].rot === 1 ? -1 : 1
  else jchpla(e, ctx)

  e.chasing = true                     // INC INCCOU
  return CAM_ENTRY.TOPPER - 1
}

/**
 * JSMOVE (ALWELG.MAC:1731-1777): move one step along the lane, then — climbing — test the
 * arrival. `CMP CURSY / BEQ ATOP / IFCC` is what makes an invader a chaser; it is reached
 * from the up branch only, so nothing converts on the way back down.
 *
 * (The ROM's other arrival branch here, the carrier that splits when it comes within $20
 * of the top, is resolveTankerArrivals in sim.ts.)
 */
function jsmove(e: Enemy, ctx: CamContext): number | undefined {
  moveAlong(e, ctx)
  if (e.direction === 1 && e.depth >= RIM_DEPTH) return chaser(e, ctx)   // ATOP
  return undefined
}

/**
 * JPULMO (ALWELG.MAC:1780-1799), the move half. Climbing, it is JSMOVU — arrival and all,
 * which is how a pulsar reaches CHASER's "SEND IT DOWN" clause. Descending, it turns
 * round once it has sunk out of the potency zone, and turns round WHEREVER IT IS if the
 * nymphs have run out (`LDY NYMCOU / IFEQ / LDA I,0FF ;SEND PULSAR UP` — 0xFF is past
 * every rail the compare below can test, so the reverse is unconditional).
 *
 * The kill this routine ends with is resolvePlayerHits' (see the header): one predicate,
 * once, after the move.
 */
function jpulmo(e: Enemy, ctx: CamContext): number | undefined {
  if (e.direction === 1) return jsmove(e, ctx)
  moveAlong(e, ctx)
  if (ctx.spawnRemaining === 0 || e.depth <= PULSAR_NEAR_FAR_DEPTH) e.direction = 1
  return undefined
}

/**
 * JSTRAI (ALWELG.MAC:2205-2249): the traler's own opcode. It lays the spike, turns
 * the spiker around at both ends of its run, and — with nothing left to release —
 * converts it into a flipper-carrying tanker. That conversion is the CAMSTA=0 that
 * sends TRALUP's `VBR0PC NOJUMP` to the tanker's program.
 */
function jstrai(e: Enemy, ctx: CamContext): { camSta: number, became?: Enemy } {
  ctx.spikes[e.lane] = Math.min(SPIKE_MAX_DEPTH, Math.max(ctx.spikes[e.lane], e.depth))

  // "MAX HEIGHT?" — clamp and send it back down the well.
  if (e.depth >= SPIKER_TURNAROUND_DEPTH) {
    e.depth = SPIKER_TURNAROUND_DEPTH
    e.direction = -1
    return { camSta: 1 }
  }

  if (e.depth > 0) return { camSta: 1 }

  // "MIN HEIGHT?" — ASTRAL (ALWELG.MAC:2253-2291) reassigns it to the NEEDIEST
  // line, not the tallest: it scores each line by LINEY (depth from the rim, so a
  // SHORTER spike scores HIGHER) and a dead line takes `LDA I,0FF`, the "WORST
  // CASE", which beats every standing spike outright. Our spikes[] is spike HEIGHT,
  // LINEY's inverse, so the neediest line is simply the smallest height. The scan
  // starts at a RANDOM line (`LDA RANDO2`) and walks down, and the compare is an
  // `IFCS` (>=), so an equal score displaces the incumbent — the random start IS
  // the tie-break, and it carries real weight: on an empty well every lane ties at
  // 0, and a fixed scan would pile every hop into lane 0.
  const n = ctx.tube.laneCount
  const start = nextInt(ctx.rng, n)
  let target = start
  let neediest = Infinity
  for (let k = 0; k < n; k++) {
    const i = (((start - k) % n) + n) % n
    if (ctx.spikes[i] <= neediest) { neediest = ctx.spikes[i]; target = i }
  }
  e.lane = target
  e.direction = 1

  // "ANY NYMPHS, OR NON SPIKER TYPE CLIMBERS?" — none left, so it converts.
  if (ctx.spawnRemaining === 0) {
    return { camSta: 0, became: { ...e, kind: 'tanker', contains: 'flipper' } }
  }
  return { camSta: 1 }
}

/**
 * JELTST (ALWELG.MAC:1692-1705): is this invader standing on an "enemy line" — a
 * lane carrying a spike that reaches past it? CAMSTA=0 if it is, and COWJMP's
 * `VBR0PC COWJM2` then keeps it climbing instead of letting it flip. LINEY is depth
 * FROM the rim, and a vacant line takes 0xFF ("WORST CASE LINE (DEAD)"), so the
 * ROM's `LINEY < INVAY` is, in our inverted units, "the spike stands above me".
 */
function jeltst(e: Enemy, ctx: CamContext): number {
  return ctx.spikes[e.lane] > e.depth ? 0 : 1
}

/**
 * JCHPLA (ALWELG.MAC:1876-1889): aim the rotation the SHORTEST way to the player.
 *
 * It ALWAYS aims. The ROM's `ASL` / `IFCC` writes INVROT on both arms of the branch, so
 * there is no case in which an invader is left carrying the direction it walked in with —
 * not even standing on the player's own lane (see shortestRot).
 */
function jchpla(e: Enemy, ctx: CamContext): void {
  e.rot = shortestRot(ctx.tube, e.lane, ctx.playerLane)
}

/** JCHROT (ALWELG.MAC:1722-1726): reverse the rotation bit. It persists until it does. */
function jchrot(e: Enemy): void {
  e.rot = e.rot === 1 ? -1 : 1
}

/**
 * JJUMPS (ALWELG.MAC:2013-2050): start a jump. The ROM seeds INVAL2 with CALSAN's
 * starting angle for the base leg; we count the eight steps up from zero instead,
 * since all anything downstream needs is how far through the tumble the invader is.
 *
 * OKTOJM (2051-2060) runs first: on a planar (open) well an invader about to jump
 * off the edge has its rotation reversed rather than jumping into the void.
 */
function jjumps(e: Enemy, ctx: CamContext): void {
  if (!ctx.tube.closed) {
    if (e.rot === 1 && e.lane >= ctx.tube.laneCount - 1) e.rot = -1
    else if (e.rot === -1 && e.lane <= 0) e.rot = 1
  }
  e.jumpAngle = 0
}

/**
 * JJUMPM (ALWELG.MAC:1892-1976): advance the jump one angle-step. When the angle
 * reaches the final angle the invader lands on the next line and the jump is over —
 * the CAMSTA=0 ("RETURN WITH STATUS (0=JUMP DONE)") that every jump loop branches
 * on. The lane settles only here: mid-jump the invader is between two lines, which
 * is what lets the player rotate through it.
 */
function jjumpm(e: Enemy, ctx: CamContext): number {
  if (e.jumpAngle === undefined) return 0
  e.jumpAngle += 1
  if (e.jumpAngle < JUMP_ANGLE_STEPS) return 1
  e.lane = wrapLane(ctx.tube, e.lane + e.rot)
  e.jumpAngle = undefined
  return 0
}

/**
 * JFUSEUP (ALWELG.MAC:2095-2145): process the fuse. It rides its lane and rolls between
 * lanes on a fuzz_move roll — NOT "toward the player", which is what this comment used to
 * say and was never true in either regime: below wave 18 the roll is a blind coin (LEFRIT),
 * and from 18 up it aims and then REVERSES, so the fuse rolls deliberately AWAY. See the
 * decision below. (The old wording is exactly the kind of stale comment that seeded this
 * story's own findings — a comment records what someone meant, the code records what runs.)
 *
 * That roll IS the vulnerable window (W-022): COLCHK lets a bullet kill a fuseball only
 * while it is rolling; the instant it lands on a line, ";MAKE IT INVINCIBLE". A jitter tick
 * that does not slide is a landing, so it clears the bit even when the roll never fired, or
 * a fuseball that stopped rolling would stay killable forever.
 */
function jfuseup(e: Enemy, ctx: CamContext): void {
  if (e.kind !== 'fuseball') return
  // moveAlong, NOT jsmove: JFUSEUP has its own mover and its own clamp at the top, so a
  // fuseball never falls into ATOP and never becomes a chaser. KILINV agrees — it books a
  // fuse standing at CURSY as a MOVER, branching around the chaser count (2302-2311).
  moveAlong(e, ctx)

  e.jitterTimer -= ctx.dt
  if (e.jitterTimer > 0) return
  e.jitterTimer = FUSEBALL_JITTER_INTERVAL

  let rolling = false
  if (nextFloat(ctx.rng) < FUSEBALL_MOVE_PROB) {
    // W-023, BOTH halves. Every fuseball decision — JFUSEUP's and MAYBLR's alike — ends in
    // one of two calls, FUCHPL (chase) or LEFRIT (coin), and which one it takes is decided
    // by the chase bits in WFUSCH, read per wave out of TWFUSC (ALWELG.MAC:686-690).
    //
    // Below wave 17 the table has no record: CONTOUR runs off the end onto TE, yields 0,
    // neither bit is set, and the branch is always LEFRIT — "RANDOMLY CHOOSE LEFT OR RIGHT"
    // (2171-2178), a `BIT RANDOM` coin with the player as no input at all. That is tp1-5's
    // half, and it stands. (Wave 17 itself is still 0 — TR ALTERNATES, so the range's first
    // wave draws byte 3. See wfuschForLevel.)
    //
    // From wave 18 the on-tube bit lights and the ROM takes FUCHPL (2168-2170):
    //
    //     FUCHPL: JSR JCHPLA   ;CHASE PLAYER
    //             JSR JCHROT   ;REVERSE DIRECTION (FUSE IS BACKWARDS)
    //
    // It aims the SHORTEST way to the player and then flips that bit straight back, so it
    // sets off the LONG way round the tube — away from him. That is not a bug to be tidied
    // up: a fuseball that takes the short way is exactly what tp1-5 tore out.
    if (wfuschForLevel(ctx.level) & FUSE_CHASE_ON_TUBE) {
      jchpla(e, ctx)   // aim…
      jchrot(e)        // …then reverse. FUSE IS BACKWARDS.
    } else {
      e.rot = nextFloat(ctx.rng) < 0.5 ? 1 : -1   // LEFRIT
    }
    const to = wrapLane(ctx.tube, e.lane + e.rot)
    if (to !== e.lane) {          // an open sheet clamps at its edge: no roll, no landing
      e.lane = to
      rolling = true
    }
  }
  e.vulnerable = rolling
}

/**
 * JCHKPU (ALWELG.MAC:1709-1719): "CHECK FOR PULSING NOW OR IN NEXT 4 FRAMES".
 * CAMSTA is 0 for no pulse and 0x80 for a pulse, so PULSCH's `VBR0PC PULSC3`
 * branches to the flip exactly when the pulsar is NOT about to pulse.
 *
 * The ROM ANDs the sign of PULSON with the sign of PULSON + 4*PULTIM (`ASL / ASL / CLC /
 * ADC PULSON / AND PULSON / AND I,80 / EOR I,80`), so it answers "no pulse" only when the
 * pulse is dark NOW *and* still dark four frames from now — a pulsar will not start a
 * flip it would be caught mid-way through when the lane lights up. It asks the GLOBAL
 * counter, not the pulsar: under W-026 there is nothing per-pulsar left to ask.
 */
function jchkpu(ctx: CamContext): number {
  const soon = ctx.pulse.son + 4 * ctx.pulse.tim
  return ctx.pulse.son < 0 && soon < 0 ? 0 : 0x80
}

/**
 * Run one invader's program for one frame. Returns the invader — a different one
 * if its program converted it (the spiker that runs out of well and becomes a
 * tanker). The invader is mutated in place; sim.ts hands us its own fresh copy.
 */
export function runCam(enemy: Enemy, ctx: CamContext): Enemy {
  let e = enemy
  let pc = e.camPc
  let camSta = 0
  let exicam = true
  let budget = MAX_OPS_PER_FRAME

  while (exicam) {
    if (budget-- <= 0) throw new Error(`CAM: the program at ${e.camPc} never yielded (pc ${pc})`)

    const op = CAM[pc]
    switch (op) {
      case CAM_OPS.VEXIT:                        // JEXIT: clear EXICAM — yield the frame
        exicam = false
        break
      case CAM_OPS.VNOOP:                        // JNOOP
        break

      // ── control flow ──────────────────────────────────────────────────────
      case CAM_OPS.VSLOOP:                       // JSLOOP: INVLOO = the immediate
        pc += 1
        e.camLoop = CAM[pc]
        break
      case CAM_OPS.VSLOPB:                       // JSLOPB: INVLOO = *(the wave parameter)
        pc += 1
        e.camLoop = camParam(CAM[pc], ctx.level)
        break
      case CAM_OPS.VELOOP:                       // JELOOP: --INVLOO; reloop unless it hit 0
        e.camLoop = (e.camLoop - 1) & 0xff
        if (e.camLoop === 0) pc += 1             // exhausted: step past the operand
        else pc = CAM[pc + 1]                    // reloop (the operand is target-1)
        break
      case CAM_OPS.VSETPC:                       // JSETPC: CAMPC = the operand (target-1)
        pc = CAM[pc + 1]
        break
      case CAM_OPS.VSKIP0:                       // JSKIP0: skip the next line (2 bytes) if CAMSTA==0
        if (camSta === 0) pc += 2
        break
      case CAM_OPS.VBR0PC:                       // JBR0PC: branch if CAMSTA==0
        pc += 1
        if (camSta === 0) pc = CAM[pc]
        break

      // ── movement ──────────────────────────────────────────────────────────
      // A move can reach the rim, and CHASER re-points the PC when it does — the ROM's
      // own `STA CAMPC` from inside JSMOVE, completed by the dispatcher's INC below.
      case CAM_OPS.VSMOVE: {
        const to = jsmove(e, ctx)
        if (to !== undefined) pc = to
        break
      }
      case CAM_OPS.VSTRAI: {
        const { camSta: sta, became } = jstrai(e, ctx)
        camSta = sta
        if (became) e = became
        break
      }
      case CAM_OPS.VSFUSE:
        jfuseup(e, ctx)
        break
      case CAM_OPS.VSPUMO: {                     // JPULMO: the pulsar's move (dual-speed, in speedFor)
        const to = jpulmo(e, ctx)
        if (to !== undefined) pc = to
        break
      }

      // ── jumping ───────────────────────────────────────────────────────────
      case CAM_OPS.VJUMPS:
        jjumps(e, ctx)
        break
      case CAM_OPS.VJUMPM:
        camSta = jjumpm(e, ctx)
        break
      case CAM_OPS.VCHROT:
        jchrot(e)
        break
      case CAM_OPS.VCHPLA:
        jchpla(e, ctx)
        break

      // ── tests ─────────────────────────────────────────────────────────────
      case CAM_OPS.VELTST:
        camSta = jeltst(e, ctx)
        break
      case CAM_OPS.VCHKPU:
        camSta = jchkpu(ctx)
        break

      // The cursor kills. The ROM asks per invader, here; we answer for every
      // invader at once in resolvePlayerHits, after the move — see the header.
      case CAM_OPS.VKITST:
      case CAM_OPS.VFUSKI:
        break

      default:
        throw new Error(`CAM: ${op} at ${pc} is not an opcode`)
    }

    // The dispatcher's own INC CAMPC. CAMPC is a single byte, and the wrap is
    // load-bearing: a jump to offset 0 (TRALUP) is encoded as the operand 0xFF, and
    // this increment is what carries it round to 0. See the assembler in cam.ts.
    pc = (pc + 1) & 0xff
  }

  e.camPc = pc
  return e
}
