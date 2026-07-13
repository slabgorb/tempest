// tests/core/sim.warp-death-respawn.test.ts
//
// RED-phase suite for Story 3-6 — "Resolve post-warp-death re-warp loop on
// persisted spikes". Follow-up from Story 3-3.
//
// Major Hochstetter trusts NOTHING — least of all a respawn. Story 3-3 made a
// spike on the player's lane crash the Claw mid-warp (death + life loss). But it
// left a trap: killPlayer → 'dying' → respawn returns mode to 'playing' while the
// level is STILL cleared (no enemies, spawn.remaining === 0). So checkLevelClear
// immediately re-enters the warp, the SAME persisted spike (s.spikes[lane] is
// never cleared on a crash) re-crashes the Claw, and neutral input drains every
// life — warp → crash → respawn → warp → crash → gameover.
//
// These tests pin the OBSERVABLE faithful outcome and DO NOT couple to the
// mechanism the Dev picks. The three candidate resolutions —
//   A) complete the level transition on the warp-death respawn,
//   B) clear/skip the killing spike so the re-warp finishes,
//   C) grant brief post-respawn invulnerability so the re-warp passes the spike,
// — all converge on the same end state: the transition resolves (the next
// geometry loads, the persisted spike is gone) and AT MOST ONE life is spent.
// That convergence is exactly what we assert, leaving Dev the latitude to choose
// HOW while guaranteeing the loop is dead.
import { describe, it, expect } from 'vitest'
import { playingState } from './helpers'
import type { GameState } from '../../src/core/state'
import { stepGame, makeEnemy } from '../../src/core/sim'
import { currentLane } from '../../src/core/geometry'
import type { Input } from '../../src/core/input'
import { SPIKE_MAX_DEPTH, RESPAWN_DELAY, START_LIVES, levelParams } from '../../src/core/rules'

const DT = 1 / 60
const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }

// A game already in the warp at level 1 (closed circle, 16 lanes), Claw at the
// rim (progress 0), with a spike standing on the player's CURRENT lane so the
// descending warp is guaranteed to crash. Enemies/bullets cleared and the spawn
// budget emptied so the level stays "cleared" — the precondition that makes the
// post-respawn re-warp loop possible.
function warpDeathState(opts: {
  playerLane?: number
  spikes?: ReadonlyArray<readonly [number, number]>
  lives?: number
} = {}): GameState {
  const s = playingState(1)
  s.spawn.remaining = 0
  s.enemies = []
  s.bullets = []
  s.mode = 'warp'
  s.warp.progress = 0
  const lane = opts.playerLane ?? 4
  s.player.lane = lane
  if (opts.lives !== undefined) s.lives = opts.lives
  // Default: a max-height spike on the player's lane (the killer). Callers may
  // override with an explicit spike list.
  const spikes = opts.spikes ?? [[lane, SPIKE_MAX_DEPTH]]
  for (const [l, h] of spikes) s.spikes[l] = h
  return s
}

// Step neutrally until the warp-death is RESOLVED one way or another: the level
// advances out of 1 (the transition completed), or the game ends. Bounded so the
// drain-loop bug fails loudly (hits gameover / bound) instead of hanging. Exits
// the instant the level advances, BEFORE next-level enemies can descend and
// muddy the life count.
function runUntilResolved(
  s: GameState,
  input: Input = NEUTRAL,
  bound = 600,
): { state: GameState; steps: number } {
  let steps = 0
  while (s.level === 1 && s.mode !== 'gameover' && steps < bound) {
    s = stepGame(s, input, DT)
    steps++
  }
  return { state: s, steps }
}

describe('post-warp-death re-warp loop is resolved (Story 3-6)', () => {
  // AC2 — THE bug. With neutral input, a warp crash must cost exactly ONE life,
  // not every life. Today this drains to gameover (warp→crash→respawn→warp...).
  it('does NOT drain all lives with neutral input after a warp-death respawn', () => {
    const { state, steps } = runUntilResolved(warpDeathState({ playerLane: 4 }))
    expect(state.mode).not.toBe('gameover')      // the loop must not kill us off
    expect(state.player.alive).toBe(true)         // we are back in control
    expect(state.lives).toBe(START_LIVES - 1)     // EXACTLY one life spent, no drain
    expect(steps).toBeLessThan(600)               // actually resolved, did not hang
  })

  // AC1/AC2 — the resolution is faithful: the cleared level's transition COMPLETES.
  // The next geometry loads and the persisted killing spike is gone (no re-arm).
  it('completes the level transition on the warp-death respawn (next geometry loads, spike cleared)', () => {
    const { state } = runUntilResolved(warpDeathState({ playerLane: 4 }))
    expect(state.level).toBe(2)                   // advanced to the next geometry
    expect(state.mode).toBe('playing')            // resumed normal play
    expect(state.spikes.every((h) => h === 0)).toBe(true) // killing spike no longer re-crashes
  })

  // AC2 — paranoia: extra spikes on OTHER lanes must not resurrect the loop or
  // cost additional lives. Only the player's-lane spike was ever the killer.
  it('resolves cleanly even with stale spikes on other lanes', () => {
    const { state } = runUntilResolved(
      warpDeathState({ playerLane: 4, spikes: [[4, SPIKE_MAX_DEPTH], [0, SPIKE_MAX_DEPTH], [9, SPIKE_MAX_DEPTH]] }),
    )
    expect(state.level).toBe(2)
    expect(state.mode).toBe('playing')
    expect(state.lives).toBe(START_LIVES - 1)     // still only one life lost
  })

  // AC2 — end-to-end via the REAL clear path (no hand-set 'warp' mode): a spike
  // laid during play on the player's lane, the level clears, the warp crashes,
  // and the post-respawn loop must NOT drain lives. This is the reported bug,
  // reproduced through stepGame's public surface from a 'playing' state.
  it('resolves the loop end-to-end through the real level-clear path', () => {
    const start = playingState(1)
    start.spawn.remaining = 0
    start.enemies = []
    start.bullets = []
    start.player.lane = 7
    start.spikes[7] = SPIKE_MAX_DEPTH             // laid during the level, player's lane
    const entered = stepGame(start, NEUTRAL, DT)  // empty level → enters the warp
    expect(entered.mode).toBe('warp')             // guard: we truly took the clear→warp path
    const { state } = runUntilResolved(entered)
    expect(state.mode).toBe('playing')
    expect(state.level).toBe(2)
    expect(state.lives).toBe(START_LIVES - 1)     // one crash, one life — no loop
  })
})

describe('warp-death resolution preserves existing behavior (Story 3-6 regressions)', () => {
  // AC3 — the clean warp (no spike on the player's lane) still advances to the
  // next geometry with no life lost, exactly as before this story.
  it('a surviving warp still advances to the next geometry with no life lost', () => {
    const { state } = runUntilResolved(
      warpDeathState({ playerLane: 4, spikes: [/* none on lane 4 */ [0, SPIKE_MAX_DEPTH]] }),
    )
    expect(state.level).toBe(2)
    expect(state.mode).toBe('playing')
    expect(state.player.alive).toBe(true)
    expect(state.lives).toBe(START_LIVES)         // no crash, no life lost
  })

  // AC3 — the dodge still works: steer off the spiked entry lane on frame one and
  // the warp completes untouched (collision keys off the CURRENT lane).
  it('still lets the player dodge a warp spike by steering off the lane', () => {
    const start = warpDeathState({ playerLane: 0, spikes: [[0, SPIKE_MAX_DEPTH]] })
    const moved = stepGame(start, { spin: 40, fire: false, zap: false, start: false }, DT)
    expect(currentLane(moved.tube, moved.player.lane)).not.toBe(0) // truly off the spiked lane
    const { state } = runUntilResolved(moved)
    expect(state.level).toBe(2)
    expect(state.lives).toBe(START_LIVES)         // dodged — no life lost
  })

  // REGRESSION — a NORMAL mid-level death must NOT advance the level on respawn.
  // Guards against a sloppy "advance the level on every respawn" fix: a second
  // enemy below the rim keeps the level un-cleared, so respawn must resume the
  // SAME level, not warp forward.
  it('a normal mid-level death respawn resumes the same level (does not advance)', () => {
    let s = playingState(1)
    s.spawn.remaining = 0
    s.player.lane = 4
    s.enemies = [
      makeEnemy('flipper', 4, 0.95, levelParams(1)), // kills, cleared on respawn
      makeEnemy('flipper', 9, 0.3, levelParams(1)),  // survives → level NOT clear
    ]
    s = stepGame(s, NEUTRAL, DT)
    expect(s.mode).toBe('dying')                  // guard: a real death occurred
    for (let i = 0; i < Math.ceil(RESPAWN_DELAY * 60) + 2; i++) s = stepGame(s, NEUTRAL, DT)
    expect(s.mode).toBe('playing')
    expect(s.player.alive).toBe(true)
    expect(s.level).toBe(1)                       // SAME level — no spurious advance
    expect(s.lives).toBe(START_LIVES - 1)
  })

  // AC5 edge — a warp crash on the LAST life ends the game; the resolution must
  // not "resurrect" the player by advancing the level. Gameover stays gameover.
  it('a warp crash on the last life goes to gameover and never advances the level', () => {
    const { state } = runUntilResolved(warpDeathState({ playerLane: 4, lives: 1 }))
    expect(state.mode).toBe('gameover')
    expect(state.lives).toBe(0)
    expect(state.level).toBe(1)                   // no resurrection-by-advance
    // And it STAYS dead under continued neutral input.
    let s = state
    for (let i = 0; i < 120; i++) s = stepGame(s, NEUTRAL, DT)
    expect(s.mode).toBe('gameover')
    expect(s.level).toBe(1)
  })
})

describe('warp-death resolution stays pure & deterministic (Story 3-6, AC4)', () => {
  // AC4 — identical warp-death-respawn scenarios produce byte-identical state.
  it('is deterministic across identical runs', () => {
    const a = runUntilResolved(warpDeathState({ playerLane: 4 })).state
    const b = runUntilResolved(warpDeathState({ playerLane: 4 })).state
    expect(a).toEqual(b)
  })

  // AC4 / architectural boundary — the resolution step must not mutate its input.
  // Walk to the frame where the resolution lands (level leaves 1) and prove that
  // re-running that exact step from the pristine input reproduces the output.
  it('does not mutate its input on the resolving step and replays purely', () => {
    let pre = warpDeathState({ playerLane: 4 })
    let out = stepGame(pre, NEUTRAL, DT)
    for (let i = 0; out.level === 1 && out.mode !== 'gameover' && i < 600; i++) {
      pre = out
      out = stepGame(pre, NEUTRAL, DT)
    }
    expect(out.level).toBe(2)                     // we reached the resolving step
    expect(pre.level).toBe(1)                     // input to that step untouched...
    expect(stepGame(pre, NEUTRAL, DT)).toEqual(out) // ...and the step is pure
  })
})
