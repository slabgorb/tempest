// src/core/sim.ts
import { GameState, Enemy, EnemyKind, TankerCargo } from './state'
import { Input } from './input'
import { wrapLane, currentLane, tubeForLevel } from './geometry'
import {
  SPIN_SENSITIVITY, BULLET_SPEED, MAX_BULLETS, scoreFor, EXTRA_LIFE_INTERVAL,
  PLAYER_RIM_DEPTH, RESPAWN_DELAY, RESPAWN_LANE, START_LIVES, levelParams, spawnForLevel,
  SCORE_SPIKE_SEGMENT, SPIKE_MAX_DEPTH, SPIKE_SHORTEN, TANKER_SPLIT_DEPTH, LevelParams,
  rollSpawnKind, rollTankerCargo, MAX_SELECT_LEVEL,
  WARP_INITIAL_SPEED, warpAccel, WARP_AVOID_SPIKES_SECONDS, WARP_AVOID_SPIKES_MAX_LEVEL,
} from './rules'
import { rngInt } from './rng'
import { qualifiesForHighScore, insertHighScore } from './highscore'
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
    enemies: s.enemies.map((e) => ({ ...e })),
    spikes: s.spikes.slice(),
    spawn: { ...s.spawn },
    warp: { ...s.warp },
    select: { ...s.select },
    entry: s.entry ? { ...s.entry } : null,
    highScoreTable: s.highScoreTable.slice(),
    events: [], // fresh event channel each frame: clears last frame's events and never aliases the input
  }
}

// Sign-based ±1 letter cycle over A–Z with wrap in both directions (Z→A, A→Z),
// mirroring the select-screen spin granularity (4-2).
function cycleLetter(letter: string, spin: number): string {
  const offset = letter.charCodeAt(0) - 65
  const next = (offset + Math.sign(spin) + 26) % 26
  return String.fromCharCode(65 + next)
}

// The 'highscore' initials-entry machine. `spin` cycles the current letter;
// `fire` confirms it (append, advance, reset to 'A'); the 3rd confirm inserts the
// completed entry into the in-memory table and returns to attract. `start` and
// neutral input are inert. RNG is never consumed here.
function stepHighScore(s: GameState, input: Input): void {
  if (!s.entry) return
  // Confirm on the RISING edge of fire only. The shell holds `fire` every frame
  // while the button is down (6-2), so a level check would march through all
  // three initials on a single tap — and auto-fill "AAA" when the gameover
  // restart click is still held as the screen flips to entry.
  if (input.fire && !s.prevFire) {
    const initials = s.entry.initials + s.entry.currentLetter
    const charIndex = s.entry.charIndex + 1
    if (charIndex >= 3) {
      s.highScoreTable = insertHighScore(s.highScoreTable, {
        name: initials, score: s.score, level: s.level,
      })
      s.entry = null
      s.mode = 'attract'
    } else {
      s.entry = { initials, charIndex, currentLetter: 'A' }
    }
  } else if (input.spin !== 0) {
    s.entry = { ...s.entry, currentLetter: cycleLetter(s.entry.currentLetter, input.spin) }
  }
}

function stepPlayer(s: GameState, input: Input): void {
  if (!s.player.alive) return
  s.player.lane = wrapLane(s.tube, s.player.lane + input.spin * SPIN_SENSITIVITY)
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
    case 'flipper':  return { kind, lane, depth, flipTimer: params.flipInterval }
    case 'tanker':   return { kind, lane, depth, contains: cargo }
    case 'spiker':   return { kind, lane, depth, direction: 1 }
    case 'fuseball': return { kind, lane, depth, jitterTimer: 0 }
    case 'pulsar':   return { kind, lane, depth, flipTimer: params.flipInterval, pulseTimer: params.pulseInterval, pulsing: false }
  }
}

function stepEnemies(s: GameState, dt: number): void {
  const params = levelParams(s.level)

  // Spawn from the budget.
  if (s.spawn.remaining > 0) {
    s.spawn.timer -= dt
    if (s.spawn.timer <= 0) {
      const kindRoll = rollSpawnKind(s.level, s.rng)
      s.rng = kindRoll.rng
      const laneRoll = rngInt(s.rng, s.tube.laneCount)
      s.rng = laneRoll.rng
      let cargo: TankerCargo = 'flipper'
      if (kindRoll.kind === 'tanker') {
        const cargoRoll = rollTankerCargo(s.level, s.rng)
        s.rng = cargoRoll.rng
        cargo = cargoRoll.cargo
      }
      s.enemies.push(makeEnemy(kindRoll.kind, laneRoll.value, 0, params, cargo))
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
        s.rng = res.rng
        moved.push(res.enemy)
        break
      }
      case 'spiker': {
        const res = stepSpiker(e, dt, params)
        const sp = res.enemy
        s.spikes[sp.lane] = Math.min(SPIKE_MAX_DEPTH, Math.max(s.spikes[sp.lane], sp.depth))
        moved.push(sp)
        break
      }
      case 'pulsar': {
        const res = stepPulsar(e, dt, params, s.tube, s.rng)
        s.rng = res.rng
        moved.push(res.enemy)
        break
      }
      case 'fuseball': {
        const res = stepFuseball(e, dt, params, s.tube, s.rng)
        s.rng = res.rng
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

// Enemies that kill the player by reaching its rim segment. Tankers split
// before the rim; spikers never reach grab depth.
const GRABBER_KINDS: ReadonlySet<EnemyKind> = new Set<EnemyKind>(['flipper', 'fuseball', 'pulsar'])

const HIT_DEPTH = 0.06

function awardScore(s: GameState, points: number): void {
  const before = s.score
  s.score += points
  const crossed = Math.floor(s.score / EXTRA_LIFE_INTERVAL) - Math.floor(before / EXTRA_LIFE_INTERVAL)
  if (crossed > 0) s.lives += crossed
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
      if (e.lane === b.lane && Math.abs(e.depth - b.depth) <= HIT_DEPTH) {
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
  s.player.superzapper = 'full' // rearm the once-per-level Superzapper
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
  const grabber = s.enemies.find(
    (e) => GRABBER_KINDS.has(e.kind) && e.depth >= PLAYER_RIM_DEPTH && e.lane === pl,
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
  s.player = { lane: 0, alive: true, respawnTimer: 0, superzapper: 'full' }
  s.enemies = []
  s.tube = tubeForLevel(level)
  s.spikes = new Array(s.tube.laneCount).fill(0)
  s.warp.progress = 0
  s.warp.velocity = 0
  s.warp.warning = 0
  startLevel(s)
}

// Superzapper: once per level. The first activation vaporises every enemy on
// screen (no tanker split — it is a kill, not a hit); the second vaporises one
// enemy, the nearest the rim (max depth, ties → lowest index); after that it is
// spent until the next level. Scoring flows through awardScore so a zap can
// grant extra lives just like a bullet kill. Targeting is fully deterministic.
function stepZap(s: GameState, input: Input): void {
  if (!input.zap || !s.player.alive) return
  if (s.player.superzapper === 'spent' || s.enemies.length === 0) {
    // A full charge is still consumed even with nothing to hit; a weak shot with
    // no target is wasted-but-not-spent (nothing to destroy this frame). No
    // enemies means no kill and (by design, Story 5-1) no activation event.
    if (s.player.superzapper === 'full') s.player.superzapper = 'used-once'
    return
  }
  if (s.player.superzapper === 'full') {
    const killCount = s.enemies.length
    for (const e of s.enemies) {
      awardScore(s, scoreFor(e))
      s.events.push({ type: 'enemy-death', enemyType: e.kind, lane: e.lane, depth: e.depth })
    }
    s.events.push({ type: 'superzapper-activate', killCount })
    s.enemies = []
    s.player.superzapper = 'used-once'
    return
  }
  // 'used-once' → destroy the single enemy nearest the rim.
  let target = 0
  for (let i = 1; i < s.enemies.length; i++) {
    if (s.enemies[i].depth > s.enemies[target].depth) target = i
  }
  const victim = s.enemies[target]
  awardScore(s, scoreFor(victim))
  s.events.push({ type: 'enemy-death', enemyType: victim.kind, lane: victim.lane, depth: victim.depth })
  s.events.push({ type: 'superzapper-activate', killCount: 1 })
  s.enemies = s.enemies.filter((_, i) => i !== target)
  s.player.superzapper = 'spent'
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
  if (s.warp.progress >= 1) advanceLevel(s)
}

export function stepGame(state: GameState, input: Input, dt: number): GameState {
  const s = cloneState(state)
  switch (s.mode) {
    case 'attract':
      // Idle title screen — only `start` matters; gameplay input is ignored.
      // Entering select (re)initialises the chosen level to 1. RNG untouched.
      if (input.start) {
        s.mode = 'select'
        s.select = { selectedLevel: 1 }
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
      stepPlayer(s, input)
      stepFiring(s, input)
      stepZap(s, input)
      stepBullets(s, dt)
      stepEnemies(s, dt)
      resolveBulletHits(s)
      resolveSpikeHits(s)
      resolveTankerArrivals(s)
      resolvePlayerHits(s)
      checkLevelClear(s)
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
          s.entry = { initials: '', charIndex: 0, currentLetter: 'A' }
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
