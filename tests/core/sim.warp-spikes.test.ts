// tests/core/sim.warp-spikes.test.ts
//
// RED-phase suite for Story 3-3 — "Spikes crash the Claw during the warp".
//
// Major Hochstetter trusts NOTHING. The warp (Story 3-2) currently flies the
// Claw down the tube as a free ride: stepWarp only advances progress. The design
// (docs/.../tempest-clone-design.md L143–145, L182) says a persistent spike on
// the player's CURRENT lane must crash the Claw during that descent — death +
// life loss — while spikes on other lanes are harmless and the player may steer
// to dodge.
//
// These tests pin the OBSERVABLE behaviour (crash / survive / death-path / next
// level) without coupling to the exact progress→depth threshold the Dev picks.
// They also guard the project's hard architectural boundary: the warp+collision
// step must stay pure and deterministic (no input mutation, identical I/O).
import { describe, it, expect } from 'vitest'
import { initialState } from '../../src/core/state'
import type { GameState } from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { currentLane } from '../../src/core/geometry'
import type { Input } from '../../src/core/input'
import { SPIKE_MAX_DEPTH, RESPAWN_DELAY, START_LIVES } from '../../src/core/rules'

const DT = 1 / 60
const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }

// A game already in the warp (Claw at the rim, progress = 0), with full control
// over the player's lane, the per-lane spikes, and lives. Level 1 = closed
// circle, 16 lanes. Enemies/bullets cleared so nothing else can end the warp.
function warpingState(opts: {
  playerLane?: number
  spikes?: ReadonlyArray<readonly [number, number]>
  lives?: number
}): GameState {
  const s = initialState(1)
  s.spawn.remaining = 0
  s.enemies = []
  s.bullets = []
  s.mode = 'warp'
  s.warp.progress = 0
  if (opts.playerLane !== undefined) s.player.lane = opts.playerLane
  if (opts.lives !== undefined) s.lives = opts.lives
  for (const [lane, h] of opts.spikes ?? []) s.spikes[lane] = h
  return s
}

// Step until the warp resolves — the player crashes (mode leaves 'warp') or the
// warp completes. Bounded so a never-resolving bug fails loudly instead of hanging.
function runWarp(s: GameState, input: Input = NEUTRAL): { state: GameState; steps: number } {
  let steps = 0
  while (s.mode === 'warp' && steps < 1000) {
    s = stepGame(s, input, DT)
    steps++
  }
  return { state: s, steps }
}

describe('spikes crash the Claw during the warp (Story 3-3)', () => {
  // AC1 — a spike on the player's lane crashes the Claw before the warp lands.
  it('crashes the Claw when the warp reaches a spike on the player\'s lane', () => {
    const { state, steps } = runWarp(
      warpingState({ playerLane: 4, spikes: [[4, SPIKE_MAX_DEPTH]] }),
    )
    expect(state.mode).toBe('dying')        // crashed mid-warp, did not arrive
    expect(state.player.alive).toBe(false)
    expect(state.lives).toBe(START_LIVES - 1) // a life was spent
    expect(state.level).toBe(1)             // warp interrupted — no advance yet
    expect(steps).toBeLessThan(1000)        // actually resolved
  })

  // AC2 / AC7 — no spike on the player's lane: the warp completes safely and the
  // next geometry loads, exactly as it did before this story.
  it('completes the warp safely when no spike sits on the player\'s lane', () => {
    const { state } = runWarp(warpingState({ playerLane: 4 }))
    expect(state.mode).toBe('playing')
    expect(state.player.alive).toBe(true)
    expect(state.lives).toBe(START_LIVES)   // no life lost
    expect(state.level).toBe(2)             // advanced to the next geometry
  })

  // AC3 — spikes on OTHER lanes are harmless during the warp. Lanes 0 and 10 are
  // spiked to the cap; the player on lane 4 sails through untouched.
  it('ignores spikes on lanes other than the player\'s', () => {
    const { state } = runWarp(
      warpingState({ playerLane: 4, spikes: [[0, SPIKE_MAX_DEPTH], [10, SPIKE_MAX_DEPTH]] }),
    )
    expect(state.mode).toBe('playing')
    expect(state.lives).toBe(START_LIVES)
    expect(state.level).toBe(2)
  })

  // AC3 — dodge. A tall spike sits on the entry lane (0). The player spins clear
  // on the first frame, then rides neutral. Because collision keys off the
  // player's CURRENT lane (not the entry lane), steering away survives. If the
  // implementation latched the entry lane, this test would catch the bug.
  it('lets the player dodge by steering off the spiked lane', () => {
    const start = warpingState({ playerLane: 0, spikes: [[0, SPIKE_MAX_DEPTH]] })
    const moved = stepGame(start, { spin: 40, fire: false, zap: false, start: false }, DT)
    expect(currentLane(moved.tube, moved.player.lane)).not.toBe(0) // truly off lane 0
    const { state } = runWarp(moved)        // ride the rest neutrally
    expect(state.mode).toBe('playing')
    expect(state.lives).toBe(START_LIVES)
    expect(state.level).toBe(2)
  })

  // AC5 — the warp crash spends a life and goes to gameover on the last one.
  it('goes to gameover when a warp spike claims the last life', () => {
    const { state } = runWarp(
      warpingState({ playerLane: 4, spikes: [[4, SPIKE_MAX_DEPTH]], lives: 1 }),
    )
    expect(state.mode).toBe('gameover')
    expect(state.lives).toBe(0)
  })

  // AC5 — the crash routes through the EXISTING death path: enters 'dying' and
  // arms the standard respawn timer (reuse, not a bespoke death branch).
  it('routes a warp crash through the standard death path (dying + respawn timer)', () => {
    const { state } = runWarp(
      warpingState({ playerLane: 4, spikes: [[4, SPIKE_MAX_DEPTH]], lives: 3 }),
    )
    expect(state.mode).toBe('dying')
    expect(state.player.respawnTimer).toBe(RESPAWN_DELAY)
  })

  // AC4 — determinism: identical warp+spike scenarios yield byte-identical state.
  it('is deterministic: identical warp+spike scenarios produce identical state', () => {
    const a = runWarp(warpingState({ playerLane: 4, spikes: [[4, SPIKE_MAX_DEPTH]] })).state
    const b = runWarp(warpingState({ playerLane: 4, spikes: [[4, SPIKE_MAX_DEPTH]] })).state
    expect(a).toEqual(b)
  })

  // AC4 / AC6 — purity at the crash boundary: the crash step must not mutate its
  // input, and replaying it must reproduce the same output. Walks to the actual
  // crash step (no threshold assumptions) and checks the pristine pre-crash input.
  it('does not mutate the input on the crash step and replays purely', () => {
    let pre = warpingState({ playerLane: 4, spikes: [[4, SPIKE_MAX_DEPTH]], lives: 3 })
    let out = stepGame(pre, NEUTRAL, DT)
    for (let i = 0; out.mode === 'warp' && i < 1000; i++) {
      pre = out
      out = stepGame(pre, NEUTRAL, DT)
    }
    expect(out.mode).toBe('dying')               // we reached the crash, not a clean finish
    expect(pre.mode).toBe('warp')                // input to the crash step untouched...
    expect(pre.lives).toBe(START_LIVES)
    expect(pre.spikes[4]).toBe(SPIKE_MAX_DEPTH)
    expect(stepGame(pre, NEUTRAL, DT)).toEqual(out) // ...and the step is pure
  })

  // Integration — a spike laid during play persists across warp entry (only
  // bullets are cleared) and crashes the Claw on the real level-clear → warp path.
  it('persists spikes into the warp and crashes on them via the real clear path', () => {
    const s = initialState(1)
    s.spawn.remaining = 0
    s.enemies = []
    s.player.lane = 0
    s.spikes[0] = SPIKE_MAX_DEPTH                 // laid during the level, player's lane
    const entered = stepGame(s, NEUTRAL, DT)      // empty level → enters the warp
    expect(entered.mode).toBe('warp')
    expect(entered.spikes[0]).toBe(SPIKE_MAX_DEPTH) // survived warp entry
    const { state } = runWarp(entered)
    expect(state.mode).toBe('dying')
    expect(state.lives).toBe(START_LIVES - 1)
  })
})
