// src/core/sim.ts
import { GameState, Enemy, EnemyKind, TankerCargo } from './state'
import { Input } from './input'
import { Tube, wrapLane, currentLane, tubeForLevel } from './geometry'
import {
  SPIN_SENSITIVITY, BULLET_SPEED, MAX_BULLETS, scoreFor, EXTRA_LIFE_INTERVAL,
  PLAYER_RIM_DEPTH, RESPAWN_DELAY, RESPAWN_LANE, START_LIVES, levelParams, spawnForLevel,
  SCORE_SPIKE_SEGMENT, SPIKE_MAX_DEPTH, SPIKE_SHORTEN, TANKER_SPLIT_DEPTH, LevelParams,
  rollSpawnKind, rollTankerCargo, MAX_SELECT_LEVEL,
  WARP_INITIAL_SPEED, warpAccel, WARP_AVOID_SPIKES_SECONDS, WARP_AVOID_SPIKES_MAX_LEVEL,
  MAX_ENEMY_BULLETS, ENEMY_FIRE_MIN_DEPTH, ENEMY_FIRE_MAX_DEPTH, ENEMY_BOLT_SPEED_OFFSET,
  enemyCanShoot, enemyFireChance, enemyFireHoldoffFrames,
  ZAP_WINDOW_FIRST, ZAP_WINDOW_SECOND,
} from './rules'
import { nextInt, nextFloat } from '@arcade/shared/rng'
import { qualifiesForHighScore, insertHighScore } from '@arcade/shared/highscore'
import { stepNameEntry } from '@arcade/shared/name-entry'
import { stepFlipper } from './enemies/flipper'
import { stepSpiker } from './enemies/spiker'
import { stepPulsar } from './enemies/pulsar'
import { stepFuseball } from './enemies/fuseball'
import { stepTanker, splitTanker } from './enemies/tanker'

function cloneState(s: GameState): GameState {
  return {
    ...s,
    player: { ...s.player },
    bullets: s.bullets.map((b) => ({ ...b })),
    enemyBullets: s.enemyBullets.map((b) => ({ ...b })),
    enemies: s.enemies.map((e) => ({ ...e })),
    spikes: s.spikes.slice(),
    spawn: { ...s.spawn },
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

export function makeEnemy(
  kind: EnemyKind, lane: number, depth: number, params: LevelParams, cargo: TankerCargo = 'flipper',
): Enemy {
  switch (kind) {
    case 'flipper':  return { kind, lane, depth, flipTimer: params.flipPattern.moveFrames / 60 }
    case 'tanker':   return { kind, lane, depth, contains: cargo }
    case 'spiker':   return { kind, lane, depth, direction: 1 }
    case 'fuseball': return { kind, lane, depth, jitterTimer: 0, vulnerable: false }
    case 'pulsar':   return { kind, lane, depth, flipTimer: params.flipInterval, pulseTimer: params.pulseInterval, pulsing: false }
  }
}

function stepEnemies(s: GameState, dt: number): void {
  const params = levelParams(s.level)

  // Spawn from the budget.
  if (s.spawn.remaining > 0) {
    s.spawn.timer -= dt
    if (s.spawn.timer <= 0) {
      // Draws advance the shared MUTABLE cursor s.rng in place (same order as
      // the old immutable threading, so the seeded sequence is unchanged).
      const kind = rollSpawnKind(s.level, s.rng)
      const lane = nextInt(s.rng, s.tube.laneCount)
      let cargo: TankerCargo = 'flipper'
      if (kind === 'tanker') {
        cargo = rollTankerCargo(s.level, s.rng)
      }
      s.enemies.push(makeEnemy(kind, lane, 0, params, cargo))
      s.spawn.remaining -= 1
      s.spawn.timer = params.spawnInterval
    }
  }

  // Move every enemy by kind, threading the RNG.
  const moved: Enemy[] = []
  for (const e of s.enemies) {
    switch (e.kind) {
      case 'flipper': {
        const res = stepFlipper(e, dt, params, s.tube, s.rng)
        moved.push(res.enemy)
        break
      }
      case 'spiker': {
        const wasDescending = e.direction === -1
        const res = stepSpiker(e, dt, params)
        const sp = res.enemy
        // Far-end bottom-out: a descending spiker that reaches depth 0.
        if (wasDescending && sp.direction === 1 && sp.depth === 0) {
          if (s.spawn.remaining === 0) {
            // spiker_hop "none pending" branch (story 6-15, rev-3 §C l.211): with
            // no spike-enemies left to release, it CONVERTS into a flipper-holding
            // tanker instead of hopping forever.
            moved.push(makeEnemy('tanker', sp.lane, 0, params, 'flipper'))
            break
          }
          // Otherwise hop (story 6-9): relocate to the tallest-standing-spike lane,
          // or a random lane when none stand yet.
          let target = -1
          let tallest = 0
          for (let i = 0; i < s.spikes.length; i++) {
            if (s.spikes[i] > tallest) { tallest = s.spikes[i]; target = i }
          }
          if (target === -1) {
            target = nextInt(s.rng, s.tube.laneCount)
          }
          sp.lane = target
        }
        s.spikes[sp.lane] = Math.min(SPIKE_MAX_DEPTH, Math.max(s.spikes[sp.lane], sp.depth))
        moved.push(sp)
        break
      }
      case 'pulsar': {
        const res = stepPulsar(e, dt, params, s.tube, s.rng)
        moved.push(res.enemy)
        break
      }
      case 'fuseball': {
        const res = stepFuseball(e, dt, params, s.tube, s.rng, s.player.lane)
        moved.push(res.enemy)
        break
      }
      case 'tanker': {
        const res = stepTanker(e, dt, params)
        moved.push(res.enemy)
        break
      }
      default:
        moved.push(e) // kinds without a stepper yet (added in later tasks) hold position
    }
  }
  s.enemies = moved
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
  const holdoffSeconds = enemyFireHoldoffFrames(s.level) / 60
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
      // A fuseball is bullet-proof while rolling the rim — killable by a bullet
      // only in its on-lane vulnerable phase (story 6-9). Other kinds always hit.
      if (e.kind === 'fuseball' && !e.vulnerable) continue
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
  if (spawned.length > 0) s.enemies = s.enemies.concat(spawned)
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
  s.enemies = survivors.concat(spawned)
}

function startLevel(s: GameState): void {
  s.spawn = spawnForLevel(s.level)
  s.bullets = []
  s.enemyBullets = [] // no lingering enemy bolts across a respawn/level (no chain-death)
  s.player.superzapper = 'full' // rearm the once-per-level Superzapper
  s.player.zapTimer = 0         // no zap window carries across a level/respawn (10-2)
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
  // A flipper caught MID-FLIP (between lanes) cannot grab — the ROM's p_chk
  // skips the rim check while the $80 mid-flip bit is set (story 6-14). This is
  // the fairness pay-off of the multi-tick flip: you can rotate "through" it.
  const grabber = s.enemies.find(
    (e) => GRABBER_KINDS.has(e.kind) && e.depth >= PLAYER_RIM_DEPTH && e.lane === pl
      && !(e.kind === 'flipper' && e.flipping),
  )
  // A grab takes precedence over a pulse; a pulse is still reported on the
  // player-grab channel (Story 5-1), attributed to the pulsing pulsar.
  const killer = grabber ?? s.enemies.find((e) => e.kind === 'pulsar' && e.pulsing && e.lane === pl)
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
  if (s.enemies.length === 0 && s.spawn.remaining === 0) {
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
  s.spikes = new Array(s.tube.laneCount).fill(0)
  s.player.lane = wrapLane(s.tube, s.player.lane)
  startLevel(s)
  s.warp.progress = 0
  s.warp.velocity = 0
  s.warp.warning = 0
  s.mode = 'playing'
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
  s.warp.velocity += warpAccel(s.level) * dt
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
  // Auto-fire: any enemy OR enemy bolt within DEMO_FIRE_LANES lanes (wrap-aware).
  const within = (lane: number): boolean =>
    Math.abs(laneOffset(s.tube, pl, lane)) <= DEMO_FIRE_LANES
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
  switch (s.mode) {
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
  }
  // Record this frame's fire so the next frame can detect a fresh press (6-2).
  s.prevFire = input.fire
  return s
}
