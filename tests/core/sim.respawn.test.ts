// tests/core/sim.respawn.test.ts
//
// RED-phase suite for Story 6-3 — "Safe respawn after death (no chain-death on
// death lanes)".
//
// O'Brien tests loyalty by breaking it. The reported bug: the next ship respawns
// instantly at the death spot, so a blocked/crowded lane chain-kills the player.
//
// DESIGN DECISION (resolved from the rev-3 ROM): the arcade does NOT use
// invulnerability frames — it RESETS THE BOARD. With lives remaining a death
// FULLY resets the level (remove_all_enemies_from_tube + setup_level +
// reset_pending_enemy_timers + clear_shots) and the player respawns at a FIXED
// lane (arcade segment 14), near the rim, on the SAME level. The cleared board
// plus the spawn delay IS the grace — that is why the arcade never chain-deaths.
//
// These tests pin the OBSERVABLE board-reset behaviour through stepGame's public
// surface. The ~0.25s death-zoom is a render concern (the dying delay already
// exists) and is verified by running the game, not here — see the TEA Assessment
// deviation note.
import { describe, it, expect } from 'vitest'
import { playingState } from './helpers'
import { stepGame, makeEnemy } from '../../src/core/sim'
import { Input } from '../../src/core/input'
import { currentLane, tubeForLevel } from '../../src/core/geometry'
import { RESPAWN_DELAY, START_LIVES, levelParams } from '../../src/core/rules'

const DT = 1 / 60
const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }

// Frames to spend in 'dying' before the respawn lands, plus a small buffer for
// floating-point timer accumulation. RESPAWN_DELAY seconds at 60 Hz.
const DYING_FRAMES = Math.ceil(RESPAWN_DELAY * 60) + 2

// The arcade respawns the Claw at a FIXED segment (14), never at the death spot.
const RESPAWN_LANE = 14

describe('Story 6-3 — safe respawn after death (board reset, no chain-death)', () => {
  // THE bug. A crowded death lane (a survivor climbing just below the rim on the
  // same lane) must NOT chain-kill the freshly respawned ship. Under the old
  // "respawn at the death spot, keep near-rim survivors" model the survivor
  // climbs back to the rim and grabs the new ship; the board reset kills that.
  it('does not chain-death on a crowded death lane after respawn', () => {
    let s = playingState(1)
    s.spawn = { nymphs: [] } // no fresh spawns muddy the window before death
    s.player.lane = 4
    s.enemies = [
      makeEnemy('flipper', 4, 1, levelParams(1)), // the killer
      makeEnemy('flipper', 4, 0.8, levelParams(1)),  // would chain-kill if it survives
    ]

    s = stepGame(s, NEUTRAL, DT) // → dying
    expect(s.mode).toBe('dying')
    expect(s.lives).toBe(START_LIVES - 1)

    // Run through the death delay and ~1s of play. Under the old model the
    // lane-4 survivor reaches the rim (~40 frames after respawn) and chain-kills.
    for (let i = 0; i < Math.ceil(RESPAWN_DELAY * 60) + 60; i++) {
      s = stepGame(s, NEUTRAL, DT)
    }

    expect(s.mode).toBe('playing')
    expect(s.player.alive).toBe(true)
    expect(s.lives).toBe(START_LIVES - 1) // exactly ONE life spent — no chain-death
  })

  // Full board reset: every enemy removed, every shot cleared, the spawn budget
  // re-armed, and the SAME level resumed (not advanced, not restarted from 1).
  it('performs a full board reset on respawn (enemies, shots, spawn budget, same level)', () => {
    let s = playingState(1)
    s.level = 3
    s.tube = tubeForLevel(3)
    s.spawn = { nymphs: [] } // level fully drained pre-death
    s.player.lane = 4
    s.bullets = [
      { lane: 0, depth: 0.5 },
      { lane: 8, depth: 0.7 },
    ]
    s.enemies = [
      makeEnemy('flipper', 4, 1, levelParams(1)),       // the killer
      makeEnemy('flipper', 7, 0.3, levelParams(1)),        // far survivor (old model keeps it)
      makeEnemy('tanker', 2, 0.5, levelParams(1), 'flipper'),    // mid-tube survivor
    ]

    s = stepGame(s, NEUTRAL, DT) // → dying
    expect(s.mode).toBe('dying')

    for (let i = 0; i < DYING_FRAMES; i++) s = stepGame(s, NEUTRAL, DT)
    expect(s.mode).toBe('playing')

    expect(s.enemies).toHaveLength(0)                                   // remove_all_enemies_from_tube
    expect(s.bullets).toHaveLength(0)                                   // clear_shots
    expect(s.spawn.nymphs.length).toBe(levelParams(3).enemyCount)      // reset_pending_enemy_queue
    expect(s.level).toBe(3)                                            // SAME level — not advanced, not reset to 1
  })

  // The Claw always comes back at the SAME fixed lane, independent of where the
  // ship died — arcade segment 14. The old model respawned at the death spot.
  it('respawns at the fixed arcade lane (segment 14) regardless of death location', () => {
    function respawnLaneAfterDeathOn(deathLane: number): number {
      let s = playingState(1)
      s.spawn = { nymphs: [] }
      s.player.lane = deathLane
      s.enemies = [
        makeEnemy('flipper', deathLane, 1, levelParams(1)), // the killer
        // A far survivor on a third lane keeps the level un-cleared under the old
        // model (so it resumes 'playing' instead of warping), forcing the failure
        // onto the respawn-lane assertion below rather than an incidental warp.
        makeEnemy('flipper', 0, 0.3, levelParams(1)),
      ]
      s = stepGame(s, NEUTRAL, DT) // → dying
      for (let i = 0; i < DYING_FRAMES; i++) s = stepGame(s, NEUTRAL, DT)
      expect(s.mode).toBe('playing')
      return currentLane(s.tube, s.player.lane)
    }

    const diedOn4 = respawnLaneAfterDeathOn(4)
    const diedOn9 = respawnLaneAfterDeathOn(9)

    expect(diedOn4).toBe(diedOn9)        // fixed: independent of death location
    expect(diedOn4).toBe(RESPAWN_LANE)   // and it is arcade segment 14
  })

  // NO invulnerability frames. The cleared board is the only grace: the instant
  // an enemy reaches the rim on the respawn lane it must kill again. A respawn
  // that grants an invuln shield would let this enemy pass and fail here.
  it('grants no invulnerability frames on respawn (a rim enemy kills immediately)', () => {
    let s = playingState(1)
    s.spawn = { nymphs: [] }
    s.player.lane = 4
    s.enemies = [makeEnemy('flipper', 4, 1, levelParams(1))]

    s = stepGame(s, NEUTRAL, DT) // → dying, one life spent
    for (let i = 0; i < DYING_FRAMES; i++) s = stepGame(s, NEUTRAL, DT)
    expect(s.mode).toBe('playing')
    expect(s.lives).toBe(START_LIVES - 1)

    // Drop a grabber straight onto the rim of the respawn lane.
    const lane = currentLane(s.tube, s.player.lane)
    s.enemies = [makeEnemy('flipper', lane, 1, levelParams(1))]

    s = stepGame(s, NEUTRAL, DT)
    expect(s.mode).toBe('dying')              // killed again — no shield protected the ship
    expect(s.lives).toBe(START_LIVES - 2)
  })

  // The whole transition must stay pure & deterministic: identical seed + inputs
  // reproduce byte-identical post-respawn state (core purity boundary).
  it('respawn is deterministic for identical seed and inputs', () => {
    function run(): ReturnType<typeof stepGame> {
      let s = playingState(42)
      s.spawn = { nymphs: [] }
      s.player.lane = 4
      s.enemies = [makeEnemy('flipper', 4, 1, levelParams(1))]
      s = stepGame(s, NEUTRAL, DT)
      for (let i = 0; i < DYING_FRAMES + 10; i++) s = stepGame(s, NEUTRAL, DT)
      return s
    }

    const a = run()
    const b = run()
    expect(a).toEqual(b)
  })
})
