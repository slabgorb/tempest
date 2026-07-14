// tests/core/tp1-10.warp-replay.test.ts
//
// RED — tp1-10 AC-5 (finding WD-015): landing on a spike REPLAYS THE SAME WAVE.
// This is the hard gate that unblocks tp1-11 (restoring SPIKE_MAX_DEPTH to the
// ROM's 0.929) — if a spike crash does not demonstrably replay the wave, tp1-11
// stops and returns to the PM.
//
// ROM: a spike hit kills the cursor (INPPSQ, ALWELG.MAC:1094); PLDROP routes to
// ANALYZ, whose dead-cursor branch enters CENDLI → ENDLIF, which SPENDS A LIFE
// (ALWELG.MAC:3075; ALEXEC.MAC:386-425). CURWAV is bumped in exactly ONE place —
// ENDWAV's `INC CURWAV` (ALEXEC.MAC:367) — reachable only via a SUCCESSFUL arrival
// at the bottom (CENDWAV), NEVER via the crash path. So a warp crash costs a life
// AND the wave: you replay the same level. The respawned wave re-runs INIENE, which
// re-initialises the enemy lines, so the spike the player died on is gone — that is
// how the ROM avoids the re-crash loop, NOT by promoting to the next geometry.
//
// Today respawn() does the OPPOSITE: `if (s.warp.progress > 0) { advanceLevel(s);
// return }` (sim.ts:600-602) — you die, lose a life, and are still PROMOTED to the
// next geometry. Every "level stays 1" assertion below is RED against that.
import { describe, it, expect } from 'vitest'
import { playingState } from './helpers'
import type { GameState } from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import type { Input } from '../../src/core/input'
import { SPIKE_MAX_DEPTH, START_LIVES } from '../../src/core/rules'

const DT = 1 / 60
const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }

// A game already in the warp at level 1, Claw at the rim (progress 0), with a
// max-height spike on the player's CURRENT lane so the descending dive is
// guaranteed to crash. Board cleared + spawn budget emptied so the level is
// genuinely "cleared" (the precondition for the warp).
function warpCrashState(opts: { playerLane?: number; lives?: number } = {}): GameState {
  const s = playingState(1)
  s.spawn = { nymphs: [] }
  s.enemies = []
  s.bullets = []
  s.mode = 'warp'
  s.warp = { progress: 0, velocity: 0, warning: 0 }
  const lane = opts.playerLane ?? 4
  s.player.lane = lane
  if (opts.lives !== undefined) s.lives = opts.lives
  s.spikes = new Array(s.tube.laneCount).fill(0)
  s.spikes[lane] = SPIKE_MAX_DEPTH
  return s
}

// Step neutrally through the crash → 'dying' → respawn, stopping the instant the
// player is back in control ('playing' after a 'dying' spell) or the game ends.
// Bounded so a re-crash DRAIN loop fails loudly instead of hanging.
function runUntilRespawned(s: GameState, bound = 600): { state: GameState; steps: number } {
  let steps = 0
  let sawDying = false
  while (steps < bound) {
    s = stepGame(s, NEUTRAL, DT)
    steps++
    if (s.mode === 'dying') sawDying = true
    if (s.mode === 'gameover') break
    if (sawDying && s.mode === 'playing') break
  }
  return { state: s, steps }
}

describe('tp1-10 AC-5 — a warp spike crash replays the SAME wave (WD-015)', () => {
  it('crashes onto the spike and spends exactly one life', () => {
    const { state } = runUntilRespawned(warpCrashState({ playerLane: 4 }))
    expect(state.mode).not.toBe('gameover')
    expect(state.player.alive).toBe(true)
    expect(state.lives).toBe(START_LIVES - 1) // one crash, one life
  })

  it('REPLAYS the same wave — the level does NOT advance after the crash', () => {
    const { state } = runUntilRespawned(warpCrashState({ playerLane: 4 }))
    expect(state.mode).toBe('playing')
    expect(state.level).toBe(1) // same wave replays — NOT promoted to 2
  })

  it('re-initialises the board on replay so the killing spike no longer re-crashes', () => {
    const { state, steps } = runUntilRespawned(warpCrashState({ playerLane: 4 }))
    expect(state.level).toBe(1)
    expect(state.spikes.every((h) => h === 0)).toBe(true) // INIENE cleared the well
    expect(steps).toBeLessThan(600) // resolved — did not drain in a re-crash loop
  })

  it('does not drain lives even with the player parked on the spiked lane', () => {
    // The whole point of Story 3-6: neutral input must cost ONE life, not all of
    // them. Under replay the loop is broken by the board re-init, not by advancing.
    const { state } = runUntilRespawned(warpCrashState({ playerLane: 7 }))
    expect(state.mode).toBe('playing')
    expect(state.level).toBe(1)
    expect(state.lives).toBe(START_LIVES - 1)
  })

  it('a crash on the LAST life is game over — no replay, no resurrection', () => {
    const { state } = runUntilRespawned(warpCrashState({ playerLane: 4, lives: 1 }))
    expect(state.mode).toBe('gameover')
    expect(state.lives).toBe(0)
    expect(state.level).toBe(1)
    // And it STAYS dead under continued neutral input.
    let s = state
    for (let i = 0; i < 120; i++) s = stepGame(s, NEUTRAL, DT)
    expect(s.mode).toBe('gameover')
    expect(s.level).toBe(1)
  })

  it('replay is deterministic across identical crashes', () => {
    const a = runUntilRespawned(warpCrashState({ playerLane: 4 })).state
    const b = runUntilRespawned(warpCrashState({ playerLane: 4 })).state
    expect(a).toEqual(b)
  })
})
