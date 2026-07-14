// tests/core/sim.warp-death-respawn.test.ts
//
// Suite for Story 3-6 — "Resolve post-warp-death re-warp loop on persisted spikes"
// — RE-SEATED by tp1-10 (finding WD-015). Follow-up from Story 3-3.
//
// Story 3-3 made a spike on the player's lane crash the Claw mid-warp (death + life
// loss). Story 3-6 killed the re-crash DRAIN loop (warp→crash→respawn→warp→crash→…)
// by having the crash respawn COMPLETE the level transition — i.e. advance to the
// next geometry, so the persisted spike is gone.
//
// tp1-10 / WD-015 overturned the RESOLUTION MECHANISM against Theurer's source: the
// ROM does not advance on a crash. CURWAV is bumped in exactly ONE place — ENDWAV's
// `INC CURWAV` (ALEXEC.MAC:367), reachable only on a SUCCESSFUL arrival — never via
// the crash path (which enters CENDLI → ENDLIF, spending a life, ALWELG.MAC:3075).
// So a crash costs a life AND the wave: you REPLAY THE SAME LEVEL. The ROM still
// avoids the drain loop, but differently: the replayed wave re-runs INIENE, which
// re-initialises the enemy lines and clears the spike the player died on.
//
// So the faithful end state after a warp crash is now: back in 'playing' on the
// SAME level, board re-initialised (spikes cleared → no re-crash), AT MOST ONE life
// spent. The "no drain / one life / loop is dead" intent of Story 3-6 is preserved;
// only the "advance to level 2" outcome flips to "replay level 1".
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
  s.spawn = { nymphs: [] }
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

// Step until the warp is RESOLVED and the player is SETTLED back in normal play,
// or the game ends. "Settled" = we left 'playing' (into warp/dying) and returned to
// it — which covers BOTH a clean warp (→ next wave via the fly-in) and a crash
// (→ replay of the SAME wave). Bounded so the drain-loop bug fails loudly instead of
// hanging (under replay the level never leaves 1, so the old "level advanced" exit
// would spin forever).
function runUntilSettled(
  s: GameState,
  input: Input = NEUTRAL,
  bound = 600,
): { state: GameState; steps: number } {
  let steps = 0
  let leftPlaying = s.mode !== 'playing'
  while (steps < bound) {
    s = stepGame(s, input, DT)
    steps++
    if (s.mode !== 'playing') leftPlaying = true
    if (s.mode === 'gameover') break
    if (leftPlaying && s.mode === 'playing') break
  }
  return { state: s, steps }
}

describe('post-warp-death re-warp loop is resolved by REPLAY (Story 3-6 / tp1-10 WD-015)', () => {
  // THE bug. With neutral input, a warp crash must cost exactly ONE life, not
  // every life. Before Story 3-6 this drained to gameover; it must never drain.
  it('does NOT drain all lives with neutral input after a warp-death respawn', () => {
    const { state, steps } = runUntilSettled(warpDeathState({ playerLane: 4 }))
    expect(state.mode).not.toBe('gameover')      // the loop must not kill us off
    expect(state.player.alive).toBe(true)         // we are back in control
    expect(state.lives).toBe(START_LIVES - 1)     // EXACTLY one life spent, no drain
    expect(steps).toBeLessThan(600)               // actually resolved, did not hang
  })

  // WD-015 — the resolution REPLAYS the same wave: the level does NOT advance, and
  // the board is re-initialised (INIENE) so the persisted killing spike is gone.
  it('replays the SAME wave on the warp-death respawn (level unchanged, spike cleared)', () => {
    const { state } = runUntilSettled(warpDeathState({ playerLane: 4 }))
    expect(state.level).toBe(1)                   // REPLAY — not promoted to 2
    expect(state.mode).toBe('playing')            // resumed normal play
    expect(state.spikes.every((h) => h === 0)).toBe(true) // killing spike no longer re-crashes
  })

  // Paranoia: extra spikes on OTHER lanes must not resurrect the loop or cost
  // additional lives. The board re-init clears them all on the replay.
  it('resolves cleanly even with stale spikes on other lanes', () => {
    const { state } = runUntilSettled(
      warpDeathState({ playerLane: 4, spikes: [[4, SPIKE_MAX_DEPTH], [0, SPIKE_MAX_DEPTH], [9, SPIKE_MAX_DEPTH]] }),
    )
    expect(state.level).toBe(1)                   // replayed, not advanced
    expect(state.mode).toBe('playing')
    expect(state.lives).toBe(START_LIVES - 1)     // still only one life lost
    expect(state.spikes.every((h) => h === 0)).toBe(true)
  })

  // End-to-end via the REAL clear path (no hand-set 'warp' mode): a spike laid
  // during play on the player's lane, the level clears, the warp crashes, and the
  // post-respawn loop must NOT drain lives — replaying the same wave.
  it('resolves the loop end-to-end through the real level-clear path', () => {
    const start = playingState(1)
    start.spawn = { nymphs: [] }
    start.enemies = []
    start.bullets = []
    start.player.lane = 7
    start.spikes[7] = SPIKE_MAX_DEPTH             // laid during the level, player's lane
    const entered = stepGame(start, NEUTRAL, DT)  // empty level → enters the warp
    expect(entered.mode).toBe('warp')             // guard: we truly took the clear→warp path
    const { state } = runUntilSettled(entered)
    expect(state.mode).toBe('playing')
    expect(state.level).toBe(1)                   // replayed the SAME wave — no advance
    expect(state.lives).toBe(START_LIVES - 1)     // one crash, one life — no loop
  })
})

describe('warp-death resolution preserves existing behavior (Story 3-6 regressions)', () => {
  // A CLEAN warp (no spike on the player's lane) still advances to the next
  // geometry with no life lost, exactly as before this story.
  it('a surviving warp still advances to the next geometry with no life lost', () => {
    const { state } = runUntilSettled(
      warpDeathState({ playerLane: 4, spikes: [/* none on lane 4 */ [0, SPIKE_MAX_DEPTH]] }),
    )
    expect(state.level).toBe(2)                   // clean dive → next wave
    expect(state.mode).toBe('playing')
    expect(state.player.alive).toBe(true)
    expect(state.lives).toBe(START_LIVES)         // no crash, no life lost
  })

  // The dodge still works: steer off the spiked entry lane on frame one and the
  // warp completes untouched (collision keys off the CURRENT lane).
  it('still lets the player dodge a warp spike by steering off the lane', () => {
    const start = warpDeathState({ playerLane: 0, spikes: [[0, SPIKE_MAX_DEPTH]] })
    const moved = stepGame(start, { spin: 40, fire: false, zap: false, start: false }, DT)
    expect(currentLane(moved.tube, moved.player.lane)).not.toBe(0) // truly off the spiked lane
    const { state } = runUntilSettled(moved)
    expect(state.level).toBe(2)                   // dodged → clean dive → next wave
    expect(state.lives).toBe(START_LIVES)         // dodged — no life lost
  })

  // REGRESSION — a NORMAL mid-level death must NOT advance the level on respawn
  // (its warp.progress is 0, so the replay branch never fires). A second enemy
  // below the rim keeps the level un-cleared, so respawn resumes the SAME level.
  it('a normal mid-level death respawn resumes the same level (does not advance)', () => {
    let s = playingState(1)
    s.spawn = { nymphs: [] }
    s.player.lane = 4
    s.enemies = [
      makeEnemy('flipper', 4, 1, levelParams(1)), // kills, cleared on respawn
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

  // A warp crash on the LAST life ends the game; the resolution must not
  // "resurrect" the player by replaying either. Gameover stays gameover on level 1.
  it('a warp crash on the last life goes to gameover and never advances the level', () => {
    const { state } = runUntilSettled(warpDeathState({ playerLane: 4, lives: 1 }))
    expect(state.mode).toBe('gameover')
    expect(state.lives).toBe(0)
    expect(state.level).toBe(1)                   // no resurrection
    // And it STAYS dead under continued neutral input.
    let s = state
    for (let i = 0; i < 120; i++) s = stepGame(s, NEUTRAL, DT)
    expect(s.mode).toBe('gameover')
    expect(s.level).toBe(1)
  })
})

describe('warp-death resolution stays pure & deterministic (Story 3-6, AC4)', () => {
  // Identical warp-death-respawn scenarios produce byte-identical state.
  it('is deterministic across identical runs', () => {
    const a = runUntilSettled(warpDeathState({ playerLane: 4 })).state
    const b = runUntilSettled(warpDeathState({ playerLane: 4 })).state
    expect(a).toEqual(b)
  })

  // The resolving step (the respawn that REPLAYS the wave) must not mutate its
  // input. Walk to the frame where the replay lands (dying → playing) and prove
  // that re-running that exact step from the pristine input reproduces the output.
  it('does not mutate its input on the resolving step and replays purely', () => {
    let pre = warpDeathState({ playerLane: 4 })
    let out = stepGame(pre, NEUTRAL, DT)
    let sawDying = out.mode === 'dying'
    for (let i = 0; i < 600 && !(sawDying && out.mode === 'playing') && out.mode !== 'gameover'; i++) {
      pre = out
      out = stepGame(pre, NEUTRAL, DT)
      if (out.mode === 'dying') sawDying = true
    }
    expect(sawDying && out.mode === 'playing').toBe(true) // reached the replay resolve
    expect(out.level).toBe(1)                     // replayed the same wave
    expect(pre.mode).toBe('dying')                // input to the resolving step...
    expect(stepGame(pre, NEUTRAL, DT)).toEqual(out) // ...and the step is pure
  })
})
