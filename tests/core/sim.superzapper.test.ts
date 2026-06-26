// tests/core/sim.superzapper.test.ts
//
// RED-phase suite for Story 4-1 — the once-per-level Superzapper:
//   full blast (first use)  → vaporise EVERY enemy on screen, then 'used-once'
//   weak shot (second use)  → vaporise exactly ONE enemy (nearest the rim,
//                             ties broken by lowest index), then 'spent'
//   spent (third use+)      → no effect, until the next level
//   per-level reset         → startLevel refills the charge to 'full', so every
//                             level (including the post-warp one) begins armed
//
// Everything is observed through the public `stepGame` API — `stepZap` and the
// `superzapper` field do not exist yet, so today these tests FAIL:
//   - `s.player.superzapper` is `undefined` (≠ 'full' / 'used-once' / 'spent')
//   - `Input.zap` is reserved but ignored, so the board is never cleared.
//
// PARANOIA NOTES (why these tests are shaped the way they are):
//   1. AUTO-WARP TRAP. The instant a full blast empties the board, if there are
//      no enemies left to spawn (`spawn.remaining === 0`), `checkLevelClear`
//      flips the mode to 'warp' IN THE SAME STEP. A naive "blast, then blast
//      again" test would run the second zap in the 'warp' branch, where the
//      Superzapper never fires. So each state transition is set up explicitly
//      (mode reset to 'playing', enemies repopulated) and asserted in isolation.
//   2. NO TANKER SPLIT. A bullet kill splits a tanker into two children; the
//      Superzapper must VAPORISE it instead. The reference plan never tested
//      this — we do (board ends empty, score is one tanker, not two children).
//   3. DETERMINISM. Targeting uses no RNG and no time: the nearest-the-rim pick
//      is `max depth, ties → lowest index`. Identical inputs must produce
//      identical output, and the step must not mutate its input argument.
import { describe, it, expect } from 'vitest'
import { initialState } from '../../src/core/state'
import type { GameState, Enemy } from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { Input } from '../../src/core/input'
import { SCORE_FLIPPER, SCORE_TANKER } from '../../src/core/rules'

const DT = 1 / 60
const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }
const ZAP: Input = { spin: 0, fire: false, zap: true, start: false }

// A fresh, in-progress level holding exactly `enemies` and nothing pending:
// `spawn.remaining = 0` (board is the whole level) and a parked spawn timer so
// no stray enemy materialises mid-step and skews a count. The Superzapper takes
// its starting value from `initialState` ('full' once the field exists).
function playing(enemies: Enemy[]): GameState {
  const s = initialState(1)
  s.mode = 'playing'
  s.spawn = { remaining: 0, timer: 999 }
  s.enemies = enemies
  return s
}

// flipTimer is parked at 999 so no enemy flips lanes during a step — lane is a
// stable identity we can assert against after the Superzapper picks a target.
const threeFlippers = (): Enemy[] => [
  { kind: 'flipper', lane: 1, depth: 0.2, flipTimer: 999 },
  { kind: 'flipper', lane: 5, depth: 0.6, flipTimer: 999 },
  { kind: 'flipper', lane: 9, depth: 0.9, flipTimer: 999 },
]

describe('superzapper — arming and per-level reset', () => {
  it('a fresh level starts with a full superzapper', () => {
    const s = initialState(1)
    expect(s.player.superzapper).toBe('full')
  })

  it('a neutral step leaves a full superzapper untouched (no charge bleed)', () => {
    const out = stepGame(playing(threeFlippers()), NEUTRAL, DT)
    expect(out.player.superzapper).toBe('full')
    expect(out.enemies).toHaveLength(3)
  })

  it('refills to full when the next level starts (after the warp)', () => {
    // Stand in the shoes of a level whose Superzapper was already used once.
    const s = playing([])
    s.player.superzapper = 'used-once'
    expect(s.player.superzapper).toBe('used-once') // precondition, not the driver

    // Empty board + empty budget → the level clears, enters the warp, and the
    // warp runs to completion on neutral input (no spikes to crash on).
    let out = stepGame(s, NEUTRAL, DT)
    for (let i = 0; i < 500 && out.mode !== 'playing'; i++) out = stepGame(out, NEUTRAL, DT)

    expect(out.mode).toBe('playing')
    expect(out.level).toBe(2)
    expect(out.player.superzapper).toBe('full') // startLevel must rearm it
  })
})

describe('superzapper — full blast (first activation)', () => {
  it('vaporises EVERY enemy on screen and becomes used-once', () => {
    const out = stepGame(playing(threeFlippers()), ZAP, DT)
    expect(out.enemies).toHaveLength(0)
    expect(out.player.superzapper).toBe('used-once')
  })

  it('awards score for every enemy vaporised', () => {
    const out = stepGame(playing(threeFlippers()), ZAP, DT)
    expect(out.score).toBe(SCORE_FLIPPER * 3)
  })

  it('vaporises a tanker WITHOUT splitting it into children', () => {
    // depth 0.5 is well below TANKER_SPLIT_DEPTH (0.9), so a missed blast would
    // leave the tanker intact (length 1, score 0) rather than split it — and a
    // blast that wrongly *split* it would leave children behind / over-score.
    const out = stepGame(playing([{ kind: 'tanker', lane: 3, depth: 0.5, contains: 'flipper' }]), ZAP, DT)
    expect(out.enemies).toHaveLength(0)        // no children left behind
    expect(out.score).toBe(SCORE_TANKER)       // exactly one tanker, not two flippers
    expect(out.player.superzapper).toBe('used-once')
  })

  it('does not fire when the player is dead (charge preserved)', () => {
    const s = playing(threeFlippers())
    s.player.alive = false
    const out = stepGame(s, ZAP, DT)
    expect(out.enemies).toHaveLength(3)
    expect(out.player.superzapper).toBe('full')
  })
})

describe('superzapper — weak shot (second activation)', () => {
  it('destroys exactly ONE enemy — the one nearest the rim — and becomes spent', () => {
    const s = playing([
      { kind: 'flipper', lane: 2, depth: 0.3, flipTimer: 999 },
      { kind: 'flipper', lane: 7, depth: 0.8, flipTimer: 999 }, // deepest → nearest the rim
    ])
    s.player.superzapper = 'used-once'
    const out = stepGame(s, ZAP, DT)
    expect(out.enemies).toHaveLength(1)
    expect(out.enemies[0].lane).toBe(2)        // the deeper (0.8) one was vaporised
    expect(out.player.superzapper).toBe('spent')
  })

  it('awards the score of the single enemy it destroys', () => {
    const s = playing([
      { kind: 'flipper', lane: 2, depth: 0.3, flipTimer: 999 },
      { kind: 'flipper', lane: 7, depth: 0.8, flipTimer: 999 },
    ])
    s.player.superzapper = 'used-once'
    const out = stepGame(s, ZAP, DT)
    expect(out.score).toBe(SCORE_FLIPPER)      // one kill, not two
  })

  it('breaks a nearest-the-rim tie by destroying the LOWEST index', () => {
    const s = playing([
      { kind: 'flipper', lane: 4, depth: 0.5, flipTimer: 999 }, // index 0 — equal depth
      { kind: 'flipper', lane: 9, depth: 0.5, flipTimer: 999 }, // index 1 — equal depth
    ])
    s.player.superzapper = 'used-once'
    const out = stepGame(s, ZAP, DT)
    expect(out.enemies).toHaveLength(1)
    expect(out.enemies[0].lane).toBe(9)        // index 0 (lane 4) lost the tie
    expect(out.player.superzapper).toBe('spent')
  })
})

describe('superzapper — state machine + purity', () => {
  it('progresses full → used-once → spent across activations, then no-ops', () => {
    let s = playing([{ kind: 'flipper', lane: 1, depth: 0.5, flipTimer: 999 }])

    s = stepGame(s, ZAP, DT)               // full blast → used-once (board cleared)
    expect(s.player.superzapper).toBe('used-once')

    // Repopulate + force 'playing' — the cleared board would otherwise be in warp.
    s.enemies = [{ kind: 'flipper', lane: 2, depth: 0.5, flipTimer: 999 }]
    s.mode = 'playing'
    s = stepGame(s, ZAP, DT)               // weak shot → spent (one killed)
    expect(s.player.superzapper).toBe('spent')
    expect(s.enemies).toHaveLength(0)

    // A spent Superzapper must do nothing, no matter how many enemies appear.
    s.enemies = [
      { kind: 'flipper', lane: 3, depth: 0.4, flipTimer: 999 },
      { kind: 'flipper', lane: 8, depth: 0.5, flipTimer: 999 },
    ]
    s.mode = 'playing'
    const out = stepGame(s, ZAP, DT)       // spent → no effect
    expect(out.player.superzapper).toBe('spent')
    expect(out.enemies).toHaveLength(2)
  })

  it('does not mutate the input state when zapping (pure step)', () => {
    const s = playing(threeFlippers())
    const out = stepGame(s, ZAP, DT)
    // the returned state reflects the blast...
    expect(out.player.superzapper).toBe('used-once')
    expect(out.enemies).toHaveLength(0)
    // ...while the original argument is left exactly as it was
    expect(s.player.superzapper).toBe('full')
    expect(s.enemies).toHaveLength(3)
  })

  it('is deterministic — identical states + identical zap give identical output', () => {
    const a = stepGame(playing(threeFlippers()), ZAP, DT)
    const b = stepGame(playing(threeFlippers()), ZAP, DT)
    expect(a.player.superzapper).toBe('used-once')
    expect(b.player.superzapper).toBe(a.player.superzapper)
    expect(a.score).toBe(b.score)
    expect(a.enemies).toEqual(b.enemies)
  })
})
