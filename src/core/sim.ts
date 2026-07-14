// src/core/sim.ts
import { GameState, Enemy, EnemyKind, Nymph, Tanker, TankerCargo } from './state'
import { Input } from './input'
import { Tube, wrapLane, currentLane, tubeForLevel } from './geometry'
import {
  SPIN_SENSITIVITY, BULLET_SPEED, MAX_BULLETS, scoreFor, EXTRA_LIFE_INTERVAL,
  PLAYER_RIM_DEPTH, RESPAWN_DELAY, RESPAWN_LANE, START_LIVES, levelParams, spawnForLevel,
  SCORE_SPIKE_SEGMENT, SPIKE_SHORTEN, TANKER_SPLIT_DEPTH, LevelParams,
  SPLIT_TOO_CLOSE_DEPTH, PULSAR_NEAR_FAR_DEPTH, NINVAD, WINVMX,
  PULSE_STEP, PULSE_SON_INIT, PULSE_SON_MAX, PULSE_SON_MIN,
  rollSpawnKind, rollTankerCargo, MAX_SELECT_LEVEL,
  WARP_INITIAL_SPEED, warpAccel, WARP_AVOID_SPIKES_SECONDS, WARP_AVOID_SPIKES_MAX_LEVEL,
  MAX_ENEMY_BULLETS, ENEMY_FIRE_MIN_DEPTH, ENEMY_FIRE_MAX_DEPTH, ENEMY_BOLT_SPEED_OFFSET,
  enemyCanShoot, enemyFireChance, enemyFireHoldoffSeconds,
  ZAP_WINDOW_FIRST, ZAP_WINDOW_SECOND,
} from './rules'
import { nextInt, nextFloat } from '@arcade/shared/rng'
import { qualifiesForHighScore, insertHighScore } from '@arcade/shared/highscore'
import { stepNameEntry } from '@arcade/shared/name-entry'
import { runCam, camForNewEnemy, genericCamFor, isJumping, type CamContext } from './enemies/interpreter'
import { assertNever } from './assert'

function cloneState(s: GameState): GameState {
  return {
    ...s,
    camera: { ...s.camera },
    player: { ...s.player },
    bullets: s.bullets.map((b) => ({ ...b })),
    enemyBullets: s.enemyBullets.map((b) => ({ ...b })),
    enemies: s.enemies.map((e) => ({ ...e })),
    spikes: s.spikes.slice(),
    // Fresh nymph objects, not a shared array: stepNymphs mutates py/lane in
    // place, and a shallow spawn copy would write those through to the caller.
    spawn: { nymphs: s.spawn.nymphs.map((n) => ({ ...n })) },
    pulse: { ...s.pulse },
    warp: { ...s.warp },
    select: { ...s.select },
    entry: s.entry ? { ...s.entry } : null,
    highScoreTable: s.highScoreTable.slice(),
    // Fresh RNG cursors: the shared PRNG is MUTABLE (nextFloat advances rng.seed
    // in place), so the working state must own copies — otherwise a draw this
    // frame would mutate the caller's input state (breaks stepGame purity/replay).
    rng: { ...s.rng },
    fireRng: { ...s.fireRng },
    events: [], // fresh event channel each frame: clears last frame's events and never aliases the input
  }
}

/** Initials the entry screen collects — the 3-char arcade convention. One of
 * tempest's per-cabinet NUMBERS; the entry VERB itself is the cabinet-wide
 * shared reducer (SH2-13). */
const MAX_INITIALS = 3

// The 'highscore' initials-entry machine (SH2-13: the spinner letter-cycle is
// retired — letters and Backspace arrive as keydown EVENTS through
// enterInitial, never on the per-frame Input). This step watches only the
// confirm: `fire` with the buffer COMPLETE inserts the entry and returns to
// attract. `start`, `spin`, and neutral input are inert. RNG is never
// consumed here.
function stepHighScore(s: GameState, input: Input): void {
  if (!s.entry) return
  // Confirm on the RISING edge of fire only. The shell holds `fire` every frame
  // while the button is down (6-2), so a level check would commit the moment
  // the 3rd letter lands under a still-held restart click.
  if (input.fire && !s.prevFire && s.entry.initials.length === MAX_INITIALS) {
    s.highScoreTable = insertHighScore(s.highScoreTable, {
      name: s.entry.initials, score: s.score, level: s.level,
    })
    s.entry = null
    s.mode = 'attract'
  }
}

/** One initials keydown on the 'highscore' entry screen. A PURE core event
 * function the shell calls per keydown (the cabinet-wide typing flow, SH2-13):
 * the shared reducer appends A–Z uppercased up to MAX_INITIALS and deletes on
 * Backspace (never past empty); every other key is inert. Inert outside
 * 'highscore' mode; a no-op returns the same state. */
export function enterInitial(s: GameState, key: string): GameState {
  if (s.mode !== 'highscore' || !s.entry) return s
  const initials = stepNameEntry(s.entry.initials, key, MAX_INITIALS)
  if (initials === s.entry.initials) return s
  return { ...s, entry: { initials } }
}

function stepPlayer(s: GameState, input: Input): void {
  if (!s.player.alive) return
  const before = currentLane(s.tube, s.player.lane)
  s.player.lane = wrapLane(s.tube, s.player.lane + input.spin * SPIN_SENSITIVITY)
  const after = currentLane(s.tube, s.player.lane)
  // Authentic POKEY segment tick (6-10): the cursor crossed a tube-segment
  // boundary into a new lane this frame. One event per crossing; the shell plays
  // segment_tick.wav on it.
  if (after !== before) s.events.push({ type: 'segment-cross', lane: after })
}

function stepFiring(s: GameState, input: Input): void {
  if (!input.fire || !s.player.alive) return
  if (s.bullets.length >= MAX_BULLETS) return
  const lane = currentLane(s.tube, s.player.lane)
  s.bullets.push({ lane, depth: 1 })
  s.events.push({ type: 'fire', lane, depth: 1 })
}

function stepBullets(s: GameState, dt: number): void {
  for (const b of s.bullets) {
    b.depth -= BULLET_SPEED * dt
  }
  s.bullets = s.bullets.filter((b) => b.depth > 0)
}

/**
 * A new invader, on its kind's CAM program (tp1-4). NEWINV hands every invader a
 * program at birth; a flipper's comes from the WAVE (WFLICAM/CAMWAV), which is why
 * `params` carries it — a flipper does not have "flipper behaviour", it has wave 1's
 * behaviour or wave 4's.
 *
 * The rotation bit starts CW. The ROM leaves INVROT wherever NEWINV's status byte
 * put it and every program that cares sets it by rule before its first jump
 * (VCHPLA/VCHROT — W-007: not one call site draws a random direction).
 */
export function makeEnemy<K extends EnemyKind>(
  kind: K, lane: number, depth: number, params: LevelParams, cargo: TankerCargo = 'flipper',
): Extract<Enemy, { kind: K }> {
  const cam = { camPc: camForNewEnemy(kind, params), camLoop: 0, rot: -1 as const, direction: 1 as const }
  const made: Enemy = ((): Enemy => {
    switch (kind) {
      case 'flipper':  return { kind: 'flipper', lane, depth, ...cam }
      case 'tanker':   return { kind: 'tanker', lane, depth, ...cam, contains: cargo }
      case 'spiker':   return { kind: 'spiker', lane, depth, ...cam }
      case 'fuseball': return { kind: 'fuseball', lane, depth, ...cam, jitterTimer: 0, vulnerable: false }
      // `pulsing` is seeded dark and re-stamped from the board's one global phase on the
      // very next tick (stepPulseClock) — a pulsar has no clock of its own to seed (W-026).
      case 'pulsar':   return { kind: 'pulsar', lane, depth, ...cam, pulsing: false }
      // TypeScript narrows a generic `K extends EnemyKind` to `never` here just as it does
      // a bare union, so the sixth kind is a compile error and not the runtime `throw` that
      // used to stand in this spot — which only ever fired once a player was already in the
      // game (lang-review #3).
      default: return assertNever(kind, 'enemy kind')
    }
  })()
  // The switch above returns exactly the kind it was asked for; TypeScript cannot
  // check that against the type parameter, so say it once, here, rather than making
  // every caller narrow a five-way union it already knows the answer to.
  return made as Extract<Enemy, { kind: K }>
}

/**
 * MOVNYM (ALWELG.MAC:1107-1174) + CONYMP (1179-1200) — the nymph queue, tp1-6.
 *
 * One pass per frame over every queued nymph:
 *
 *   * THE GATE (1109-1122). Movement is allowed unless the invader slots are
 *     booked — `LDA INMCOU / ADC INCCOU / CMP WINVMX / IFCS / IFNE`, both flags
 *     of ONE compare, so the freeze is STRICTLY GREATER than WINVMX(6): nymphs
 *     advance at 6 live and hatch to NINVAD(7); a full board holds them — or a
 *     Superzapper is running (`LDA SUZTIM / IFNE`, "AVOID KAMIKAZE"): the slots
 *     a zap opens are not refilled until the window closes. Our live count is
 *     `enemies.length`, which is movers AND chasers, exactly INMCOU + INCCOU.
 *   * THE MARCH (1130-1134). py -= 1; reaching 0 IS the hatch (CONYMP): the
 *     invader starts at the bottom (`LDA I,ILINDDY` — depth 0) on the nymph's
 *     line. A hatch that finds no slot (two pys colliding on a nearly-full
 *     board) is PUT BACK — `INC X,NYMPY`, "MOVE NYMPH BACK TO OLD POSITION"
 *     (1199) — queued, never dropped.
 *   * THE CRAWL (1148-1158). While py >= $40 the nymph rotates one line every
 *     other frame (`LDA QFRAME / AND I,1`). This block sits OUTSIDE the gate:
 *     a frozen queue still crawls, it just does not rise.
 *   * THE ALONE ZONE (1136-1143, 1160-1165). Below $40 the lane is committed
 *     and marked off limits; a nymph decrementing INTO an occupied lane backs
 *     off (`INC X,NYMPY ;YES. BACK OFF`) and keeps rotating until it finds an
 *     open one — no two nymphs commit to the same line within a hatch of each
 *     other. We track the committed-lane set directly instead of the ROM's
 *     NEOFLI/OLOFLI bit double-buffer.
 *
 * The invader's KIND rolls at hatch time (the ROM's NYMCHA — the per-type
 * population solver — is story tp1-8; until it lands, rollSpawnKind stands in).
 */
function stepNymphs(s: GameState): void {
  s.qframe += 1
  const params = levelParams(s.level)
  const frozen = s.enemies.length > WINVMX || s.player.zapTimer > 0
  const rotateThisFrame = (s.qframe & 1) === 0
  // NYMCOU (ALCOMN.MAC:916, "# OF NYMPHS") is the queue's length.
  const committed = new Set<number>()
  for (const n of s.spawn.nymphs) {
    if (n.py < 0x40) committed.add(n.lane)
  }
  let hatchedThisFrame = 0
  // CONYMP's failure latch: a hatch that finds no slot writes TEMPY=-1 ("STOP UP
  // MOVEMENT FLAG", ALWELG.MAC:1197-1198), so every nymph processed AFTER it this
  // frame holds too — the queue freezes from the collision onward, not just the
  // colliding nymph.
  let latched = false
  const hatched = new Set<Nymph>()
  for (const n of s.spawn.nymphs) {
    if (!frozen && !latched) {
      n.py -= 1
      if (n.py === 0) {
        // CONYMP -> ACTINV: take a free slot or go back in the queue.
        if (s.enemies.length + hatchedThisFrame <= WINVMX) {
          hatchedThisFrame += 1
          hatched.add(n)
          const kind = rollSpawnKind(s.level, s.rng)
          const cargo: TankerCargo = kind === 'tanker' ? rollTankerCargo(s.level, s.rng) : 'flipper'
          s.enemies.push(makeEnemy(kind, n.lane, 0, params, cargo))
        } else {
          n.py += 1
          latched = true
        }
      } else if (n.py === 0x3f && committed.has(n.lane)) {
        n.py += 1 // just entering the alone zone on an occupied line: back off
      } else if (n.py < 0x40) {
        committed.add(n.lane)
      }
    }
    if (n.py >= 0x40 && rotateThisFrame) {
      n.lane = (n.lane + 1) % s.tube.laneCount
    }
  }
  if (hatched.size > 0) s.spawn.nymphs = s.spawn.nymphs.filter((n) => !hatched.has(n))
}

/**
 * MOVINV (ALWELG.MAC:1508-1534). Every invader runs its CAM program for one frame —
 * one loop, one interpreter, no dispatch on `kind` (W-005). What an invader DOES is
 * the bytecode at its program counter, and the counter persists across frames.
 */
function stepEnemies(s: GameState, dt: number): void {
  const params = levelParams(s.level)

  // The queue marches (or holds) before the invaders move, so a hatchling runs
  // its first CAM frame in the frame it is born — as the old spawn block did.
  stepNymphs(s)

  const ctx: CamContext = {
    tube: s.tube,
    params,
    level: s.level,
    dt,
    playerLane: currentLane(s.tube, s.player.lane),
    spikes: s.spikes,
    nymphCount: s.spawn.nymphs.length,
    // The board itself: CHASER's pincer rule counts the chasers already circling and
    // reads the way the other one went (INCCOU). The interpreter mutates in place, so
    // this array is the LIVE view an invader converting later in the loop needs.
    enemies: s.enemies,
    pulse: s.pulse,
    rng: s.rng,
  }
  // cloneState already handed us fresh enemy objects, so the interpreter mutates
  // them in place. It returns the invader because a program can CONVERT one (the
  // traler that runs out of well and becomes a tanker — JSTRAI).
  s.enemies = s.enemies.map((e) => runCam(e, ctx))

  stepPulseClock(s)
}

/**
 * The pulse (W-026). In the ROM this is a GLOBAL clock — PULSON stepped by PULTIM —
 * ticked by MOVINV AFTER the invader loop (ALWELG.MAC:1536-1570) and never by the CAM,
 * which only ever ASKS about it through VCHKPU. It ticks here for the same reason: a
 * clock is not a program. One counter, so one phase — every pulsar on the board lights
 * and dies with the same beat, whenever it hatched.
 *
 * The counter is a triangle wave between two rails, and the sign of it IS the pulse
 * ("PULSE STATUS (MINUS=OFF)"). Seeded at -1 by INEWLI, its period is 40 frames and it
 * is lit for 7 of them — see rules.ts, where the seed and the rails are set out.
 *
 * Ours used to give every pulsar a private 0.6 s pulse on a 3.0 s level-scaled interval,
 * seeded at spawn: pulsars strobed out of step with each other, on a cycle more than
 * twice too long, and never in the arcade's rhythm at all.
 */
function stepPulseClock(s: GameState): void {
  s.pulse.son += s.pulse.tim
  if (s.pulse.son >= PULSE_SON_MAX || s.pulse.son <= PULSE_SON_MIN) s.pulse.tim = -s.pulse.tim
  const lit = s.pulse.son >= 0
  for (const e of s.enemies) {
    if (e.kind === 'pulsar') e.pulsing = lit
  }
}

// A tanker's death is THREE rules, and they are one mechanism. Ship any two and the
// rim-burst is not the cabinet's (W-030, W-032).
//
//   1. WHERE THE CHILDREN LAND. Two cargo enemies straddle the tanker on the FLANKING
//      lanes seg-1 and seg+1 (authentic rev-3, story 6-9) — its own lane is left EMPTY.
//      That vacancy is the whole of the burst's fairness: the player who tracked the
//      tanker and stood on its lane to shoot it is the one player it cannot grab.
//
//   2. HOW DEEP THEY LAND (W-030, this line). KILINV (ALWELG.MAC:2300-2302) opens by
//      saving the dying parent's own along value — `LDA Y,INVAY / STA TEMP0` — and
//      ACTINV (1219-1226), called once per child off KILINV's tail, seats each one
//      straight back out of it:
//
//          LDA TEMP0
//          STA Y,INVAY
//
//      Both children are born at the parent's EXACT depth. There is no clamp in the
//      cabinet. This used to read `Math.min(t.depth, SPLIT_CHILD_DEPTH)` — a deliberate
//      softening (0.85, "so a rim-split is not an instant grab") that predates the
//      fidelity epic. A carrier that arrives under its own steam bursts at 0.9286, and
//      drops both children there — high in the well, but BELOW the grab line.
//
//      They are not born lethal. tp1-24 claimed they were ("a player caught on a flanking
//      lane is grabbed on the burst frame … that is the arcade"), and that was wrong: it
//      measured the child's depth against an INVENTED PLAYER_RIM_DEPTH of 0.92. The grab
//      line is the RIM (CURSY = $10 = depth 1.0) and only a CHASER can grab, and ATOP is
//      tested BEFORE this carrier check (ALWELG.MAC:1744-1750) — so a carrier that reaches
//      the rim becomes a chaser instead of bursting, and a newborn child is ALWAYS below
//      the grab line. It must climb the last stretch and take the rim before it can grab
//      anyone. The player on a landing lane gets his reaction time back (tp1-27, W-049).
//
//   3. WHAT PROGRAM THEY RUN (W-032, below) — and it is rule 3 that makes rule 2
//      survivable.
export function splitTanker(t: Tanker, tube: Tube, params: LevelParams): Enemy[] {
  const depth = t.depth
  const kids = [
    makeEnemy(t.contains, wrapLane(tube, t.lane - 1), depth, params),
    makeEnemy(t.contains, wrapLane(tube, t.lane + 1), depth, params),
  ]
  // SPLCHA (ALWELG.MAC:1494-1502), W-032. `LDA TEMP0 / CMP I,20 / IFCC ;SPLITTING TOO
  // CLOSE TO PLAYER?` — and on the carry-clear branch, "YES. NO FLIPPING": the children
  // get NEWGEN, the generic program for their appearance code, instead of NEWTY2's wave
  // program. For a flipper that is NOJUMP, so a tanker shot in the player's face sprays
  // two flippers that climb the lanes they landed on and cannot flip onto him. Split it
  // deeper down and its children get the wave's program like anything else.
  //
  // It reads TEMP0 — the depth the PARENT died at — which is now also the depth the
  // children are born at (rule 2). One byte, and every branch that touches this burst
  // reads it: JSMOVE fires the split at $20, SPLCHA judges it at $20, and the children
  // land on it. They are the same number and rules.ts keeps them that way.
  if (t.depth >= SPLIT_TOO_CLOSE_DEPTH) {
    for (const k of kids) k.camPc = genericCamFor(k.kind)
  }
  return kids
}

// --- Enemy energy bolts (Story 6-5) ------------------------------------------

// A bolt's depth/sec for the level — always faster than a flipper of that level
// (flipper-relative +offset), so it outruns the enemies it is fired past.
function enemyBoltSpeed(level: number): number {
  return levelParams(level).flipperSpeed + ENEMY_BOLT_SPEED_OFFSET
}

// Per-frame enemy fire decision (enm_shoot). First ticks every enemy's refire
// cooldown; then, for each enemy that may shoot, is far enough up the well, is off
// cooldown, and wins the self-limiting RNG roll (against the live-bolt count),
// spawns a bolt at the enemy and emits the enemy-fire SFX event (6-6 hook). Hard-
// capped at MAX_ENEMY_BULLETS. Draws from the SEPARATE fireRng so the decision
// never perturbs the movement RNG (and keeps existing seeds reproducible).
function stepEnemyFire(s: GameState, dt: number): void {
  for (const e of s.enemies) {
    if (e.fireCooldown !== undefined && e.fireCooldown > 0) {
      e.fireCooldown = Math.max(0, e.fireCooldown - dt)
    }
  }
  if (!s.player.alive) return
  const holdoffSeconds = enemyFireHoldoffSeconds(s.level)
  for (const e of s.enemies) {
    if (s.enemyBullets.length >= MAX_ENEMY_BULLETS) break // hard cap
    if (!enemyCanShoot(e.kind, s.level)) continue
    if (e.depth < ENEMY_FIRE_MIN_DEPTH || e.depth >= ENEMY_FIRE_MAX_DEPTH) continue
    if ((e.fireCooldown ?? 0) > 0) continue
    if (nextFloat(s.fireRng) < enemyFireChance(s.enemyBullets.length)) {
      s.enemyBullets.push({ lane: e.lane, depth: e.depth })
      s.events.push({ type: 'enemy-fire', lane: e.lane, depth: e.depth })
      e.fireCooldown = holdoffSeconds
    }
  }
}

// Bolts ride straight down their lane toward the player at the rim (depth → 1).
function stepEnemyBullets(s: GameState, dt: number): void {
  const speed = enemyBoltSpeed(s.level)
  for (const b of s.enemyBullets) b.depth += speed * dt
}

// A player shot sharing a bolt's lane (and overlapping in depth) shoots it down;
// the shot is spent too — one shot, one kill, mirroring bullet↔enemy.
function resolveEnemyBulletHits(s: GameState): void {
  if (s.bullets.length === 0 || s.enemyBullets.length === 0) return
  const deadBullets = new Set<number>()
  const deadBolts = new Set<number>()
  s.bullets.forEach((bullet, bi) => {
    for (let ci = 0; ci < s.enemyBullets.length; ci++) {
      if (deadBolts.has(ci)) continue
      const bolt = s.enemyBullets[ci]
      if (bolt.lane === bullet.lane && Math.abs(bolt.depth - bullet.depth) <= HIT_DEPTH) {
        deadBullets.add(bi)
        deadBolts.add(ci)
        break
      }
    }
  })
  if (deadBullets.size > 0) s.bullets = s.bullets.filter((_, i) => !deadBullets.has(i))
  if (deadBolts.size > 0) s.enemyBullets = s.enemyBullets.filter((_, i) => !deadBolts.has(i))
}

// A bolt reaching the rim on the player's lane kills the Claw (death + life loss).
// Dodge by rotating off the lane before it arrives.
function resolveEnemyBoltHits(s: GameState): void {
  if (!s.player.alive) return
  const pl = currentLane(s.tube, s.player.lane)
  const hit = s.enemyBullets.findIndex((b) => b.lane === pl && b.depth >= PLAYER_RIM_DEPTH)
  if (hit === -1) return
  s.enemyBullets = s.enemyBullets.filter((_, i) => i !== hit)
  s.events.push({ type: 'player-death', cause: 'bolt' })
  killPlayer(s)
}

// Drop bolts that have travelled past the rim without claiming the player.
function cullEnemyBullets(s: GameState): void {
  if (s.enemyBullets.some((b) => b.depth > 1)) {
    s.enemyBullets = s.enemyBullets.filter((b) => b.depth <= 1)
  }
}

// Enemies that kill the player by reaching its rim segment. Tankers split
// before the rim; spikers never reach grab depth.
const GRABBER_KINDS: ReadonlySet<EnemyKind> = new Set<EnemyKind>(['flipper', 'fuseball', 'pulsar'])

const HIT_DEPTH = 0.06
// A fuseball's wider kill tolerance (story 6-15): ROM hit_tol[4]=6 is wider than
// the default enemy tolerance (rev-3 §D l.265), so a bullet registers across a
// larger depth gap — 1.5× the default.
const FUSEBALL_HIT_DEPTH = 0.09

function awardScore(s: GameState, points: number): void {
  const before = s.score
  s.score += points
  const crossed = Math.floor(s.score / EXTRA_LIFE_INTERVAL) - Math.floor(before / EXTRA_LIFE_INTERVAL)
  if (crossed > 0) {
    s.lives += crossed
    // Story 10-11: the authentic extra_life cue (ROM cc11) plays once per award.
    s.events.push({ type: 'extra-life', count: crossed })
  }
}

function resolveBulletHits(s: GameState): void {
  const params = levelParams(s.level)
  const deadBullets = new Set<number>()
  const deadEnemies = new Set<number>()
  const spawned: Enemy[] = []
  s.bullets.forEach((b, bi) => {
    if (deadBullets.has(bi)) return
    for (let ei = 0; ei < s.enemies.length; ei++) {
      if (deadEnemies.has(ei)) continue
      const e = s.enemies[ei]
      // W-022 / COLCHK (ALWELG.MAC:2965-2979) gates the fuseball kill twice. It is
      // killable ONLY while rolling between lanes (`vulnerable`; see fuseball.ts) —
      // parked on a lane it is bulletproof — and `CMP CURSY / IFNE ;FUSE AT TOP?`
      // refuses the kill outright once it reaches the rim, however it is moving. A
      // fuseball on the rim cannot be shot off it. Other kinds always hit.
      if (e.kind === 'fuseball' && (!e.vulnerable || e.depth >= 1)) continue
      const tol = e.kind === 'fuseball' ? FUSEBALL_HIT_DEPTH : HIT_DEPTH
      if (e.lane === b.lane && Math.abs(e.depth - b.depth) <= tol) {
        deadBullets.add(bi)
        deadEnemies.add(ei)
        awardScore(s, scoreFor(e))
        s.events.push({ type: 'enemy-death', enemyType: e.kind, lane: e.lane, depth: e.depth })
        if (e.kind === 'tanker') spawned.push(...splitTanker(e, s.tube, params))
        break
      }
    }
  })
  if (deadBullets.size > 0) s.bullets = s.bullets.filter((_, i) => !deadBullets.has(i))
  if (deadEnemies.size > 0) s.enemies = s.enemies.filter((_, i) => !deadEnemies.has(i))
  if (spawned.length > 0) s.enemies = activateInvaders(s.enemies, spawned)
}

/**
 * ACTINV (ALWELG.MAC:1219-1263) — the one door every new invader walks through.
 * Split children activate the same way a hatch does: KILINV frees the parent's
 * slot FIRST, then each child asks "ANY SLOTS?"; on a full board the CW child
 * (built first by splitTanker, as by KILINV) takes the freed slot and the
 * second is dropped — `LDA I,0 ;SLOT NOT FOUND FLAG` (1262) has no queue to
 * fall back to. The board never exceeds NINVAD, whatever bursts.
 */
function activateInvaders(enemies: Enemy[], spawned: Enemy[]): Enemy[] {
  const room = Math.max(0, NINVAD - enemies.length)
  return enemies.concat(spawned.slice(0, room))
}

function resolveSpikeHits(s: GameState): void {
  const dead = new Set<number>()
  s.bullets.forEach((b, bi) => {
    const h = s.spikes[b.lane]
    if (h > 0 && b.depth <= h) {
      s.spikes[b.lane] = Math.max(0, h - SPIKE_SHORTEN)
      dead.add(bi)
      awardScore(s, SCORE_SPIKE_SEGMENT)
      // Story 10-11: the authentic spike_shot cue (ROM cc51) plays on the hit.
      s.events.push({ type: 'spike-shot', lane: b.lane })
    }
  })
  if (dead.size > 0) s.bullets = s.bullets.filter((_, i) => !dead.has(i))
}

function resolveTankerArrivals(s: GameState): void {
  if (!s.enemies.some((e) => e.kind === 'tanker' && e.depth >= TANKER_SPLIT_DEPTH)) return
  const params = levelParams(s.level)
  const survivors: Enemy[] = []
  const spawned: Enemy[] = []
  for (const e of s.enemies) {
    if (e.kind === 'tanker' && e.depth >= TANKER_SPLIT_DEPTH) {
      spawned.push(...splitTanker(e, s.tube, params))
    } else {
      survivors.push(e)
    }
  }
  s.enemies = activateInvaders(survivors, spawned)
}

function startLevel(s: GameState): void {
  // INIENE/ININYM run for every new wave AND every new life (the same INEWLI
  // path that re-seeds the pulse below): the whole budget re-enters as nymphs.
  s.spawn = spawnForLevel(s.level, s.rng, s.tube.laneCount)
  s.bullets = []
  s.enemyBullets = [] // no lingering enemy bolts across a respawn/level (no chain-death)
  s.player.superzapper = 'full' // rearm the once-per-level Superzapper
  s.player.zapTimer = 0         // no zap window carries across a level/respawn (10-2)
  // INEWLI (ALWELG.MAC:37-48) re-seeds the pulse for every new wave AND every new life,
  // so a wave always opens dark. The seed is not decoration: it fixes the counter's
  // residue, and with it the duty cycle (rules.ts, PULSE_SON_INIT).
  s.pulse = { son: PULSE_SON_INIT, tim: PULSE_STEP }
}

function killPlayer(s: GameState): void {
  s.player.alive = false
  s.lives -= 1
  if (s.lives <= 0) {
    s.mode = 'gameover'
  } else {
    s.mode = 'dying'
    s.player.respawnTimer = RESPAWN_DELAY
  }
}

function resolvePlayerHits(s: GameState): void {
  if (!s.player.alive) return
  const pl = currentLane(s.tube, s.player.lane)
  // An invader caught MID-JUMP (between two lines) cannot grab — the ROM skips the
  // kill check while the $80 INVMOT bit is set (JKITST's `IFPL`, ALWELG.MAC:1981-82;
  // story 6-14). This is the fairness pay-off of the multi-frame flip: you can rotate
  // "through" one.
  //
  // The gate reads the STATE, not the kind. It used to say `e.kind === 'flipper' &&
  // isJumping(e)`, which was true only because a flipper was the only thing that could
  // BE mid-flip. Under the CAM a pulsar jumps too (PULSCH's VJUMPS), so that spelling
  // would have let a pulsar grab from between two lanes while a flipper beside it
  // could not — an asymmetry the ROM does not have.
  //
  // The depth gate is ONE line for every kind, and it is the RIM. The grab's line is
  // CURSY by construction — only a CHASER runs VKITST and CHASER seats it there
  // (tp1-27, W-049) — and the FUSE kill agrees from its own routine: JFUSKI
  // (ALWELG.MAC:1994-2002) is `LDA X,INVAY / CMP CURSY / IFEQ`, equality with the
  // cursor's own line, not a band. That equality is what keeps W-024's early-wave
  // patrol (capped at $20 = 0.9286, tp1-6) harmless: a fuse BELOW the rim shares
  // the lane and the player lives. One ROM byte, one spelling — PLAYER_RIM_DEPTH.
  const grabber = s.enemies.find(
    (e) => GRABBER_KINDS.has(e.kind) && e.depth >= PLAYER_RIM_DEPTH && e.lane === pl
      && !isJumping(e),
  )
  // A grab takes precedence over a pulse; a pulse is still reported on the
  // player-grab channel (Story 5-1), attributed to the pulsing pulsar.
  //
  // JPULMO's kill (ALWELG.MAC:1801-1815) is THREE conditions, and we were asking one.
  //
  //   * `LDA PULSON / IFPL`   — the pulse is lit. (Ours: `pulsing`.)
  //   * `CMP PULPOT / IFCC`   — and the pulsar has climbed INTO the potency zone. PULPOT
  //     is $A0 for waves 1-64 (WPULPOT, 606-609), which is PULSAR_NEAR_FAR_DEPTH — the
  //     same line it already crosses to change climb speed. A pulsar strobing out in the
  //     far third of the well is harmless, and ours electrocuted the player from there
  //     (W-027).
  //   * both its legs on both of the cursor's legs (1808-1814) — which an invader caught
  //     MID-FLIP, straddling two lines, does not have. That is the grab's own gate, one
  //     line above; the pulse branch beside it never got it, so a pulsar mid-flip could
  //     electrocute a player the identical flipper mid-flip could not touch (prerequisite
  //     4 of tp1-5, left open when the grab gate was widened in tp1-4).
  const killer = grabber ?? s.enemies.find(
    (e) => e.kind === 'pulsar' && e.pulsing && e.lane === pl
      && e.depth >= PULSAR_NEAR_FAR_DEPTH && !isJumping(e),
  )
  if (!killer) return
  s.events.push({ type: 'player-grab', lane: pl, killedBy: killer.kind })
  s.events.push({ type: 'player-death', cause: grabber ? 'grab' : 'pulse' })
  killPlayer(s)
}

function respawn(s: GameState): void {
  s.player.alive = true
  s.player.respawnTimer = 0
  // A warp crash is the only way to enter 'dying' with warp.progress > 0 (normal
  // play keeps it at 0). Resolve it by completing the level transition instead of
  // returning to 'playing' — the level is already cleared, so re-entering the warp
  // would let the still-persisted spike on the player's lane re-crash every
  // respawn, draining all lives on neutral input (Story 3-6). advanceLevel resets
  // the spikes and warp, so the next geometry loads cleanly with one life spent.
  if (s.warp.progress > 0) {
    advanceLevel(s)
    return
  }
  // Normal mid-level death: FULLY RESET the board (arcade rev-3 model). Every
  // enemy is removed, shots are cleared and the spawn budget is re-armed; the
  // Claw returns to a FIXED lane near the rim (segment 14) on the SAME level.
  // There are NO invulnerability frames — the cleared board plus the spawn delay
  // before the next wave IS the grace, which is why the arcade never chain-deaths
  // on a blocked/crowded lane.
  s.enemies = []
  s.player.lane = RESPAWN_LANE
  startLevel(s) // clears bullets, re-arms the spawn budget + Superzapper for this level
  s.mode = 'playing'
  s.events.push({ type: 'player-spawn', lane: currentLane(s.tube, s.player.lane) })
}

// Provision a fresh game at the chosen start level: reset the player, score,
// lives, geometry, spikes and warp, then arm the first level. RNG-free apart
// from whatever startLevel does today (currently none). The framing commit
// (select -> playing) routes through here.
function startGameAtLevel(s: GameState, level: number): void {
  s.mode = 'playing'
  s.level = level
  s.score = 0
  s.lives = START_LIVES
  s.player = { lane: 0, alive: true, respawnTimer: 0, superzapper: 'full', zapTimer: 0 }
  s.enemies = []
  s.tube = tubeForLevel(level)
  // New life/new game: the screen-Z translate SNAPS to the well's target — the
  // ROM's CNWLF2 branch, "AT CENTER IMMEDIATELY" (INIWLS, ALDISP.MAC:2484-2491).
  s.camera = { screenZ: s.tube.screenZ, slidePerFrame: 0 }
  s.spikes = new Array(s.tube.laneCount).fill(0)
  s.warp.progress = 0
  s.warp.velocity = 0
  s.warp.warning = 0
  startLevel(s)
}

// Index of the enemy nearest the rim (max depth, ties → lowest index) among the
// enemies matching `pick`, or -1 if none match. Fully deterministic — no RNG.
function nearestRimIndex(s: GameState, pick: (e: Enemy) => boolean): number {
  let target = -1
  for (let i = 0; i < s.enemies.length; i++) {
    if (!pick(s.enemies[i])) continue
    if (target === -1 || s.enemies[i].depth > s.enemies[target].depth) target = i
  }
  return target
}

// Vaporise the enemy at `idx`: score it (so a zap can grant an extra life like a
// bullet kill) and emit its death event. A zap is a KILL, not a hit — tanker
// cargo is never released (no split), preserving the 10-1 declaw.
function zapKillAt(s: GameState, idx: number): void {
  const victim = s.enemies[idx]
  awardScore(s, scoreFor(victim))
  s.events.push({ type: 'enemy-death', enemyType: victim.kind, lane: victim.lane, depth: victim.depth })
  s.enemies = s.enemies.filter((_, i) => i !== idx)
}

// One ACTIVE frame of a running zap window: flash the well, advance the kill
// cadence, and tick the timer down. The FIRST window ('used-once' charge while
// active) vaporises one non-tanker per frame (KILENE) until none remain; the
// SECOND window ('spent') only flashes — its single kill already landed on the
// press frame. The flash `color` cycles 0..7 like the ROM's QFRAME AND 7,
// derived here from the deterministic timer (the sim has no global frame counter).
function runZapFrame(s: GameState): void {
  s.events.push({ type: 'superzapper-flash', color: s.player.zapTimer & 7 })
  if (s.player.superzapper === 'used-once') {
    const idx = nearestRimIndex(s, (e) => e.kind !== 'tanker')
    if (idx >= 0) zapKillAt(s, idx)
  }
  s.player.zapTimer -= 1
}

// Superzapper: once per level, now MODELLED AS A MULTI-FRAME WINDOW (Story 10-2).
// A press opens an active window that SELF-RUNS to completion — the player does
// not hold the button, and input is ignored while a window is live.
//   First press (full):  screen-clear over the longer window (~13 frames). Spares
//     tankers, wipes all in-flight bolts on the press (10-1), and vaporises one
//     non-tanker per active frame (KILENE) until none remain. Charge → used-once.
//   Second press (used-once): one kill, the nearest the rim (max depth, ties →
//     lowest index), on the press frame, then the shorter window (~5 frames)
//     flashes out. Charge → spent.
//   Spent: inert until the next level rearms it. Targeting is fully deterministic.
function stepZap(s: GameState, input: Input): void {
  // A live window runs autonomously; fresh input cannot retrigger it mid-flight.
  if (s.player.zapTimer > 0) {
    runZapFrame(s)
    return
  }
  if (!input.zap || !s.player.alive) return
  if (s.player.superzapper === 'spent') return

  if (s.player.superzapper === 'full') {
    // First press: consume the charge and clear in-flight bolts now (10-1 — the
    // panic-button fires even with nothing to kill).
    s.enemyBullets = []
    s.player.superzapper = 'used-once'
    // An empty board has no kill payload, so per Story 5-1/4-1 a target-less zap
    // emits NO activation event and opens NO flash window (Story 10-14 restores
    // the early-return the 10-2 rewrite dropped — the charge is still spent, but
    // the weapon makes no sound or light with nothing to vaporise).
    if (s.enemies.length === 0) return
    s.events.push({
      type: 'superzapper-activate',
      killCount: s.enemies.filter((e) => e.kind !== 'tanker').length,
    })
    s.player.zapTimer = ZAP_WINDOW_FIRST
    runZapFrame(s) // frame 1 of the window: flash + first cadence kill + tick
    return
  }

  // 'used-once' → second press. With NO target the weak shot is wasted-but-not-
  // spent (Story 4-1/10-14): preserve the charge and emit nothing, so a mis-timed
  // press on a momentarily empty tube does not burn the last shot.
  const idx = nearestRimIndex(s, () => true)
  if (idx < 0) return
  // A target exists: spend the charge on exactly one kill (nearest the rim, any
  // kind), then the shorter window flashes out with no further kills.
  s.player.superzapper = 'spent'
  zapKillAt(s, idx)
  s.events.push({ type: 'superzapper-activate', killCount: 1 })
  s.player.zapTimer = ZAP_WINDOW_SECOND
  runZapFrame(s) // frame 1: flash + tick (no further kill — second window)
}

// Clearing a level no longer advances immediately — it enters the warp. The
// Claw flies down the tube (progress 0 → 1); advanceLevel runs on completion.
function checkLevelClear(s: GameState): void {
  if (s.mode !== 'playing') return
  // A wave with nymphs still queued is not over: they are the enemies it owes.
  if (s.enemies.length === 0 && s.spawn.nymphs.length === 0) {
    s.events.push({ type: 'level-clear', newLevel: s.level + 1 })
    s.mode = 'warp'
    s.warp.progress = 0
    s.warp.velocity = WARP_INITIAL_SPEED // dive starts slow, then accelerates (6-1)
    // AVOID SPIKES grace: hold the Claw at the rim for a beat so the player can
    // rotate off a spiked lane before the dive commits — but only when a spike
    // actually threatens AND the displayed level is still low enough to warn.
    const spikeThreat = s.spikes.some((h) => h > 0)
    s.warp.warning =
      spikeThreat && s.level <= WARP_AVOID_SPIKES_MAX_LEVEL ? WARP_AVOID_SPIKES_SECONDS : 0
    s.bullets = []
  }
}

// Swap in the next level's geometry, resize the per-lane spike array to the new
// laneCount, wrap the player into the (possibly smaller) tube, then resume play.
function advanceLevel(s: GameState): void {
  s.level += 1
  s.tube = tubeForLevel(s.level)
  // New wave: EASE the screen-Z translate toward the new well — the ROM's
  // ZADEST, a fixed eighth of the gap per frame ("MOVE UP SLOWLY", INIWLS
  // ALDISP.MAC:2492-2505), applied every frame by ALWELG.MAC:75-84 (stepCamera).
  s.camera.slidePerFrame = (s.tube.screenZ - s.camera.screenZ) / 8
  s.spikes = new Array(s.tube.laneCount).fill(0)
  s.player.lane = wrapLane(s.tube, s.player.lane)
  startLevel(s)
  s.warp.progress = 0
  s.warp.velocity = 0
  s.warp.warning = 0
  s.mode = 'playing'
}

// tp1-31 (DB-008): advance the level-start slide one frame — the port of
// ALWELG.MAC:75-84 ("UPDATE Z CENTER"): ZADJL += ZADEST every frame. The ROM's
// fixed-point step lands on the target after 8 frames; the float port clamps
// there and parks. One stepPlaying call = one ROM frame (the qframe convention).
function stepCamera(s: GameState): void {
  const step = s.camera.slidePerFrame
  if (step === 0) return
  const target = s.tube.screenZ
  const next = s.camera.screenZ + step
  if (step > 0 ? next >= target : next <= target) {
    s.camera.screenZ = target
    s.camera.slidePerFrame = 0
  } else {
    s.camera.screenZ = next
  }
}

// During the warp the camera dives from the rim (progress 0 → depth 1) toward the
// far end (progress 1 → depth 0). A spike on a lane reaches up from the far end to
// `spikes[lane]`, so the Claw crashes onto it once its depth descends to that height.
function warpClawDepth(progress: number): number {
  return 1 - progress
}

// Crash the Claw if the descending camera has reached a spike on the player's
// current lane. Returns true when a crash occurred (the warp must not advance).
function resolveWarpSpikeHit(s: GameState): boolean {
  if (!s.player.alive) return false
  const lane = currentLane(s.tube, s.player.lane)
  const height = s.spikes[lane]
  if (height > 0 && warpClawDepth(s.warp.progress) <= height) {
    s.events.push({ type: 'warp-spike-crash', lane })
    s.events.push({ type: 'player-death', cause: 'spike' })
    // Story 10-11: the dive ended (here, by a crash) — stop the sustained warp
    // sound so it never bleeds past the dive into the death/respawn.
    s.events.push({ type: 'warp-end' })
    killPlayer(s)
    return true
  }
  return false
}

// Advance the warp by dt (Story 6-1). First an AVOID SPIKES countdown holds the
// Claw at the rim — no descent, no crash — so the player can still rotate off a
// spiked lane. Once it elapses the Claw dives with an accelerating slow→fast
// speed curve (velocity ramps every frame). A spike on the player's lane crashes
// the Claw mid-dive (death + life loss); otherwise on arrival (progress ≥ 1) the
// level advances.
function stepWarp(s: GameState, dt: number): void {
  if (s.warp.warning > 0) {
    s.warp.warning = Math.max(0, s.warp.warning - dt)
    return // still at the rim — the dive (and any spike crash) waits for the countdown
  }
  // WD-010 (tp1-23): warpAccel's ramp is indexed by the ROM's CURWAV, which is 0-based,
  // while s.level is the displayed 1-based number (state.ts seeds it at 1). Feeding it
  // s.level ran the whole ramp one wave early — the level-1 dive got 0x24 where the ROM
  // gives 0x20 (12.5% hot) and the cap landed on level 12 instead of 13.
  s.warp.velocity += warpAccel(s.level - 1) * dt
  s.warp.progress += s.warp.velocity * dt
  if (resolveWarpSpikeHit(s)) return // crashed onto a spike — do not advance the level
  if (s.warp.progress >= 1) {
    // Story 10-11: the dive completed — stop the sustained warp sound on the same
    // frame the level advances, so it spans the dive exactly (no bleed into next).
    s.events.push({ type: 'warp-end' })
    advanceLevel(s)
  }
}

// Story 10-11: the authentic pulsar_hum (ROM cc99) loops while a pulsar is on the
// board. Emit an edge event when the pulsar population transitions across zero —
// `prev` is the pre-step state (read-only), `s` the post-step state — so the shell
// can start the loop on the first pulsar and stop it when the last one leaves.
function emitPulsarHumEdge(prev: GameState, s: GameState): void {
  const had = prev.enemies.some((e) => e.kind === 'pulsar')
  const has = s.enemies.some((e) => e.kind === 'pulsar')
  if (has && !had) s.events.push({ type: 'pulsar-hum-start' })
  else if (had && !has) s.events.push({ type: 'pulsar-hum-stop' })
}

// One frame of the live gameplay simulation: player, firing, enemies, collisions,
// level-clear. Shared by the real `playing` mode and the attract self-play demo
// (Story 10-3), so the demo runs the EXACT same pipeline, just on synthetic input.
// `prev` is the pre-step (read-only) state; `s` is the working clone.
function stepPlaying(prev: GameState, s: GameState, input: Input, dt: number): void {
  stepCamera(s)               // level-start screen-Z slide (tp1-31, DB-008)
  stepPlayer(s, input)
  stepFiring(s, input)
  stepZap(s, input)
  stepBullets(s, dt)
  stepEnemies(s, dt)
  stepEnemyFire(s, dt)        // enemies decide to fire from their moved positions
  stepEnemyBullets(s, dt)     // bolts (new and existing) ride down their lanes
  resolveBulletHits(s)
  resolveEnemyBulletHits(s)   // player shots can destroy enemy bolts
  resolveSpikeHits(s)
  resolveTankerArrivals(s)
  resolveEnemyBoltHits(s)     // a bolt at the rim on the player's lane kills
  resolvePlayerHits(s)
  cullEnemyBullets(s)         // retire bolts that flew past the rim
  checkLevelClear(s)          // no-op unless mode === 'playing' (the demo stays in 'attract')
  emitPulsarHumEdge(prev, s)  // pulsar appeared/left this frame → hum on/off
}

// --- Attract self-play demo (Story 10-3) ----------------------------------
const DEMO_FIRE_LANES = 2 // fire when an enemy or bolt lane is within this many lanes
const DEMO_LIVES = 1      // the attract demo gets a single life (book: attract admin)
const DEMO_MAX_LEVEL = 8  // random start level 1..8 ("RANDOM AND 7")

// Shortest signed lane offset from `from` to `to`, honoring tube wrap. Positive =
// steer toward higher lane indices. Open tubes do not wrap, so it is the direct
// difference. Used to point the demo Claw at its target by the short way around.
function laneOffset(tube: Tube, from: number, to: number): number {
  const d = to - from
  if (!tube.closed) return d
  const n = tube.laneCount
  const m = ((d % n) + n) % n
  return m > n / 2 ? m - n : m
}

// The demo "brain": a pure, RNG-free function of the board that returns the
// synthetic input for one frame. It steers the Claw toward the most-advanced
// enemy (nearest the rim = the MAX `depth` in our convention; see session
// deviation) by the shortest wrapped lane distance, and fires anticipatorily when
// any enemy or enemy bolt is within DEMO_FIRE_LANES of the player. Never mutates.
export function demoInput(s: GameState): Input {
  const pl = currentLane(s.tube, s.player.lane)
  // Auto-move: chase the most-advanced enemy (largest non-zero depth).
  let target: Enemy | null = null
  for (const e of s.enemies) {
    if (e.depth <= 0) continue // ignore un-entered spawns ("non-zero depth")
    if (target === null || e.depth > target.depth) target = e
  }
  const spin = target === null ? 0 : laneOffset(s.tube, pl, target.lane)
  // Auto-fire: any enemy OR enemy bolt STRICTLY inside DEMO_FIRE_LANES (wrap-aware).
  // FIREPC's `CMP I,2 / IFCC` is branch-if-carry-clear — strictly less than, so a
  // target exactly 2 lanes away does not draw fire (ALWELG.MAC:2648).
  const within = (lane: number): boolean =>
    Math.abs(laneOffset(s.tube, pl, lane)) < DEMO_FIRE_LANES
  const fire = s.enemies.some((e) => within(e.lane)) || s.enemyBullets.some((b) => within(b.lane))
  return { spin, fire, zap: false, start: false }
}

// Arm a fresh demo game: a single life on a random level 1..8 (the only RNG draw),
// reusing the normal game setup but parked in 'attract' so it reads as the title.
function seedDemo(s: GameState): void {
  const level = nextInt(s.rng, DEMO_MAX_LEVEL) // 0..7
  startGameAtLevel(s, level + 1)               // 1..8 — resets board/score/lives/spikes
  s.mode = 'attract'                         // the demo lives inside the attract screen
  s.lives = DEMO_LIVES
  s.demoActive = true
}

// Return to the static title: stop the demo so the next idle frame re-seeds a
// fresh one. (The attract renderer hides the playing scene, so leftover board
// state is never drawn.)
function resetDemoToTitle(s: GameState): void {
  s.mode = 'attract'
  s.demoActive = false
}

// True when the player supplied a real, deliberate input this frame (any real
// input ends the demo — book: attract exits to the title on input). `start` is
// handled separately because it begins a real game. Non-finite spin is noise.
function hasRealInput(input: Input): boolean {
  return input.fire || input.zap || (Number.isFinite(input.spin) && input.spin !== 0)
}

export function stepGame(state: GameState, input: Input, dt: number): GameState {
  const s = cloneState(state)
  // Switch on the mode we ARRIVED in, not on the live field — half these arms reassign
  // `s.mode` mid-body, which would otherwise re-widen the discriminant and rob the
  // `default` below of the `never` it needs to be a compile-time guard (lang-review #3).
  const mode = s.mode
  switch (mode) {
    case 'attract':
      // The attract screen plays itself when idle (Story 10-3). `start` begins a
      // real game (→ select); any other real input returns to the title; otherwise
      // the demo seeds (once) and runs the normal playing pipeline on synthetic
      // input. A demo death (mode leaves 'attract') also returns to the title.
      if (input.start) {
        s.mode = 'select'
        s.select = { selectedLevel: 1 }
        s.demoActive = false
      } else if (hasRealInput(input)) {
        resetDemoToTitle(s)
      } else {
        if (!s.demoActive) seedDemo(s)
        stepPlaying(state, s, demoInput(s), dt)
        if (s.mode !== 'attract') resetDemoToTitle(s) // demo died/cleared → title
      }
      break
    case 'select':
      // `start` commits to a fresh game at the chosen level; otherwise `spin`
      // steps the level by one (sign-based), clamped to [1, MAX_SELECT_LEVEL]
      // with no wrap. Fire/zap are inert. RNG untouched by the framing step.
      if (input.start) {
        startGameAtLevel(s, s.select.selectedLevel)
      } else if (Number.isFinite(input.spin) && input.spin !== 0) {
        // Number.isFinite rejects NaN and ±Infinity: a NaN spin would poison
        // selectedLevel via Math.sign(NaN) = NaN, and ±Infinity would silently
        // step the level via Math.sign(±Infinity) = ±1 (Story 5-9).
        const next = s.select.selectedLevel + Math.sign(input.spin)
        s.select.selectedLevel = Math.max(1, Math.min(MAX_SELECT_LEVEL, next))
      }
      break
    case 'playing':
      stepPlaying(state, s, input, dt)
      break
    case 'warp':
      stepPlayer(s, input) // the Claw may still rotate during the warp; firing is disabled
      stepWarp(s, dt)
      break
    case 'dying':
      s.player.respawnTimer -= dt
      if (s.player.respawnTimer <= 0) respawn(s)
      break
    case 'highscore':
      stepHighScore(s, input)
      break
    case 'gameover':
      // On `start`, a qualifying ended-game score enters initials-entry (score and
      // level are preserved for the eventual insert); otherwise return to attract.
      if (input.start) {
        if (qualifiesForHighScore(s.highScoreTable, s.score)) {
          s.mode = 'highscore'
          s.entry = { initials: '' }
        } else {
          s.mode = 'attract'
        }
      }
      break
    default:
      assertNever(mode, 'game mode')
  }
  // Record this frame's fire so the next frame can detect a fresh press (6-2).
  s.prevFire = input.fire
  return s
}
