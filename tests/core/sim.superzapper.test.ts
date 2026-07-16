// tests/core/sim.superzapper.test.ts
//
// Suite for the once-per-level Superzapper. Originally Story 4-1; Story 10-1
// corrected the FIRST press to clear in-flight bolts; Story 10-2 made the weapon
// MULTI-FRAME; tp1-14 corrects the FIRST press to the ROM's TIMAX/KILENE/EXIKIL
// timing (ALWELG.MAC:3490-3567, primary-source audit W-042/W-043/B-001/B-019/S-012):
//
//   full blast (first use)  → over a 19-frame ACTIVE WINDOW (TIMAX[1] = 3+8*2),
//                             vaporise at most 8 enemies on an EVERY-OTHER-FRAME
//                             cadence (KILENE gates on SUZTIM>=3 AND even). The
//                             wipe takes ANY kind, TANKERS INCLUDED — their cargo
//                             is stripped first (EXIKIL clears INVCAR) so no split.
//                             Every in-flight enemy bolt is cleared on the press.
//                             Charge → 'used-once'.
//   weak shot (second use)  → over a ~5-frame window, vaporise exactly ONE enemy
//                             (nearest the rim, ties → lowest index). Net = 1.
//                             Charge → 'spent'.
//   spent (third use+)      → no effect, until the next level.
//   per-level reset         → startLevel refills the charge to 'full'.
//   well-color flash        → each ACTIVE frame emits a `superzapper-flash` event
//                             carrying a color index (QFRAME AND 7 → 0..7); the
//                             flash reverts (stops) once the window goes inactive.
//
// Everything is observed through the public `stepGame` API.
//
// PARANOIA NOTES (why these tests are shaped the way they are):
//   1. SELF-RUNNING WINDOW. Once triggered, the zap runs its window AUTONOMOUSLY
//      — the player does NOT hold the button. So every window test presses ZAP on
//      frame one, then steps on NEUTRAL input and proves the kills/flashes keep
//      coming. A naive "hold zap" test would mask a window that secretly needs the
//      button held.
//   2. AUTO-WARP TRAP. The instant a window empties the board (no enemies, no
//      spawn budget), `checkLevelClear` flips the mode to 'warp' and the window is
//      cut short. tp1-14 makes the wipe kill tankers too, so the old spared-tanker
//      anchor is gone: windowing tests now pass `playing(board, true)` (a far,
//      inert nymph budget) or stage MORE than 8 killable enemies so some always
//      survive, guaranteeing the board never empties mid-window.
//   3. SPARED-TANKER REFIRE TRAP (10-1). The PLAY order runs the zap BEFORE
//      enemy-fire, so a surviving tanker could loose a FRESH bolt mid-window and
//      muddy a "bolts cleared" assertion. Survivors are parked at fireCooldown 999.
//   4. CADENCE, NOT ORDER. KILENE takes the first live invader by SLOT order
//      (scanning down from WINVMX) — our port targets nearest-the-rim, a targeting-
//      ORDER divergence out of tp1-14's scope. So the cadence tests assert "≤1
//      death per active frame" + net kill COUNT + determinism, never WHICH enemy
//      dies on a given frame. The detailed 8-kills-every-other-frame cadence is
//      pinned in tp1-14.superzapper-cadence.test.ts.
//   5. DETERMINISM / dt-INDEPENDENCE. The window is counted in FRAMES (one tick
//      per `stepGame` call), not wall-clock: doubling `dt` must not shorten it.
import { describe, it, expect } from 'vitest'
import { initialState } from '../../src/core/state'
import type { GameState, Enemy, EnemyBullet } from '../../src/core/state'
import type { GameEvent, SuperzapperFlashEvent } from '../../src/core/events'
import { stepGame, makeEnemy } from '../../src/core/sim'
import { Input } from '../../src/core/input'
import { SCORE_FLIPPER, SCORE_TANKER, SCORE_PULSAR, levelParams } from '../../src/core/rules'

const DT = 1 / 60
const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }
const ZAP: Input = { spin: 0, fire: false, zap: true, start: false }

// tp1-14: the first window is 19 frames (TIMAX[1] = CSUSTA+8*(CSUINT+1) = 3+16),
// not 13 — ALWELG.MAC:3539, confirmed by B-001/W-043. Bounds kept ±1 rather than
// over-constraining Dev to an exact off-by-one. The second window is unchanged (5).
const FIRST_WINDOW_MIN = 18
const FIRST_WINDOW_MAX = 20
const SECOND_WINDOW_MIN = 4
const SECOND_WINDOW_MAX = 6

// A fresh, in-progress level holding exactly `enemies` and nothing pending.
// `keepAlive` stamps a far-off nymph (py 30000, proven inert across a window in
// sim.events.test.ts) so a board the first-press wipe EMPTIES does not auto-warp
// mid-window — tp1-14 makes the wipe kill tankers too, so the old "spared tanker"
// anchor no longer holds the board open. It does not change the enemy roster.
function playing(enemies: Enemy[], keepAlive = false): GameState {
  const s = initialState(1)
  s.mode = 'playing'
  s.spawn = { nymphs: keepAlive ? [{ lane: 0, py: 30000 }] : [] }
  s.enemies = enemies
  return s
}

// ----- 10-2 observables (fields/events Dev must add; cast so this file still
// compiles against the pre-10-2 types and FAILS on assertions, not on syntax) -----

// Remaining active-window frames carried on player state (AC-1). 0 = inactive.
const zapTimer = (s: GameState): number => s.player.zapTimer

// Per-frame well-color flash signal (AC-3): a `superzapper-flash` event whose
// `color` is QFRAME AND 7 (0..7). One is expected on every ACTIVE frame.
const flashesOf = (s: GameState): SuperzapperFlashEvent[] =>
  s.events.filter((e): e is SuperzapperFlashEvent => e.type === 'superzapper-flash')
const deathsOf = (s: GameState): GameEvent[] =>
  s.events.filter((e) => e.type === 'enemy-death')
const nonTankers = (s: GameState): Enemy[] => s.enemies.filter((e) => e.kind !== 'tanker')

// Press ZAP once, then step on NEUTRAL until the window goes inactive (a frame
// with no flash event) or `cap` frames elapse. Proves the window SELF-RUNS.
// Returns the final state plus a per-frame trace of flash/death counts.
function runZap(
  s0: GameState,
  input: Input = ZAP,
  cap = 40,
): { final: GameState; trace: { flashes: number; deaths: number; enemies: number }[] } {
  const trace: { flashes: number; deaths: number; enemies: number }[] = []
  let s = stepGame(s0, input, DT) // frame 1 — the press
  trace.push({ flashes: flashesOf(s).length, deaths: deathsOf(s).length, enemies: s.enemies.length })
  for (let i = 0; i < cap && flashesOf(s).length > 0 && s.mode === 'playing'; i++) {
    s = stepGame(s, NEUTRAL, DT) // window self-runs on NEUTRAL input
    trace.push({ flashes: flashesOf(s).length, deaths: deathsOf(s).length, enemies: s.enemies.length })
  }
  return { final: s, trace }
}

// Number of frames in `trace` that emitted at least one flash event.
const activeFrames = (trace: { flashes: number }[]): number =>
  trace.filter((f) => f.flashes > 0).length

// Built on wave 1's params, so every flipper runs NOJUMP and none of them changes
// lane mid-window — lane stays a stable identity we can assert against. (Was
// `flipTimer: 999`, a field tp1-4 deleted along with the timer it drove.)
const threeFlippers = (): Enemy[] => [
  makeEnemy('flipper', 1, 0.2, levelParams(1)),
  makeEnemy('flipper', 5, 0.6, levelParams(1)),
  makeEnemy('flipper', 9, 0.9, levelParams(1)),
]

// 2 flippers + 1 pulsar (must die) + a tanker that SURVIVES the first press
// (so the board never empties → no auto-warp; window runs to completion). Every
// enemy is parked at fireCooldown 999: under the windowed cadence the non-tankers
// now SURVIVE the press frame, and the play order runs enemy-fire AFTER the zap,
// so an un-parked survivor could loose a fresh bolt in the same frame and muddy
// the "press clears in-flight bolts" assertion (10-1 paranoia note #3).
const mixedBoard = (): Enemy[] => [
  { ...makeEnemy('flipper', 1, 0.3, levelParams(1)), fireCooldown: 999 },
  { ...makeEnemy('tanker', 3, 0.5, levelParams(1), 'flipper'), fireCooldown: 999 },
  { ...makeEnemy('pulsar', 5, 0.6, levelParams(1)), pulsing: false, fireCooldown: 999 },
  { ...makeEnemy('flipper', 8, 0.2, levelParams(1)), fireCooldown: 999 },
]

// One non-tanker + one spared tanker: the single kill finishes on the first
// active frame, so the window's FLASH plainly outlasts the kills — a clean place
// to measure window length independently of kill count.
const oneFlipperOneTanker = (): Enemy[] => [
  makeEnemy('flipper', 1, 0.4, levelParams(1)),
  { ...makeEnemy('tanker', 6, 0.5, levelParams(1), 'flipper'), fireCooldown: 999 },
]

const twoBolts = (): EnemyBullet[] => [
  { lane: 2, depth: 0.4 },
  { lane: 7, depth: 0.6 },
]

// ───────────────────────── unchanged contract (4-1) ─────────────────────────

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

  it('a fresh, un-fired level has no active zap window', () => {
    expect(zapTimer(playing(threeFlippers()))).toBe(0)
  })

  it('refills to full when the next level starts (after the warp)', () => {
    const s = playing([])
    s.player.superzapper = 'used-once'
    let out = stepGame(s, NEUTRAL, DT)
    for (let i = 0; i < 500 && out.mode !== 'playing'; i++) out = stepGame(out, NEUTRAL, DT)
    expect(out.mode).toBe('playing')
    expect(out.level).toBe(2)
    expect(out.player.superzapper).toBe('full') // startLevel must rearm it
    expect(zapTimer(out)).toBe(0) // ...and no leftover active window
  })

  it('does not fire when the player is dead (charge preserved, no window)', () => {
    const s = playing(threeFlippers())
    s.player.alive = false
    const out = stepGame(s, ZAP, DT)
    expect(out.enemies).toHaveLength(3)
    expect(out.player.superzapper).toBe('full')
    expect(zapTimer(out)).toBe(0)
    expect(flashesOf(out)).toHaveLength(0)
  })
})

// ─────────────────── 10-2: the active-window timer (AC-1) ───────────────────

describe('superzapper 10-2 — active-window timer on player state', () => {
  it('the first press opens an active window (timer > 0) and consumes the charge', () => {
    const out = stepGame(playing(mixedBoard()), ZAP, DT)
    expect(zapTimer(out)).toBeGreaterThan(0)
    expect(out.player.superzapper).toBe('used-once')
  })

  it('the window counts DOWN by one per frame and closes on its own', () => {
    const after1 = stepGame(playing(mixedBoard()), ZAP, DT)
    const t1 = zapTimer(after1)
    const after2 = stepGame(after1, NEUTRAL, DT)
    expect(zapTimer(after2)).toBe(t1 - 1) // one frame, one tick
    // ...and run it out: the timer reaches 0 and stays there. keepAlive so the
    // wiped board (tankers die now) does not auto-warp before the timer bottoms.
    const { final } = runZap(playing(mixedBoard(), true))
    expect(zapTimer(final)).toBe(0)
  })

  it('the first window is LONGER than the second (19 vs 5-ish frames)', () => {
    const first = runZap(playing(mixedBoard(), true))
    const firstFrames = activeFrames(first.trace)

    // Drive to the second press. The used-once weak shot kills exactly one, so a
    // two-enemy board leaves one alive through the shorter window.
    const s2 = first.final
    s2.mode = 'playing'
    s2.enemies = [
      makeEnemy('flipper', 2, 0.3, levelParams(1)),
      makeEnemy('flipper', 7, 0.8, levelParams(1)),
    ]
    const second = runZap(s2)
    const secondFrames = activeFrames(second.trace)

    expect(firstFrames).toBeGreaterThan(secondFrames)
    expect(firstFrames).toBeGreaterThanOrEqual(FIRST_WINDOW_MIN)
    expect(firstFrames).toBeLessThanOrEqual(FIRST_WINDOW_MAX)
    expect(secondFrames).toBeGreaterThanOrEqual(SECOND_WINDOW_MIN)
    expect(secondFrames).toBeLessThanOrEqual(SECOND_WINDOW_MAX)
  })

  it('is dt-INDEPENDENT — doubling dt does not shorten the window (frame-counted)', () => {
    const atDt = runZap(playing(oneFlipperOneTanker(), true))
    // Same board, same press, but stepped at 2× dt throughout.
    const trace: { flashes: number }[] = []
    let s = stepGame(playing(oneFlipperOneTanker(), true), ZAP, 2 * DT)
    trace.push({ flashes: flashesOf(s).length })
    for (let i = 0; i < 40 && flashesOf(s).length > 0 && s.mode === 'playing'; i++) {
      s = stepGame(s, NEUTRAL, 2 * DT)
      trace.push({ flashes: flashesOf(s).length })
    }
    // anchor: the window must be real (not a vacuous 0 === 0) AND dt-invariant.
    expect(activeFrames(atDt.trace)).toBeGreaterThanOrEqual(FIRST_WINDOW_MIN)
    expect(activeFrames(trace)).toBe(activeFrames(atDt.trace))
  })
})

// ──────────── 10-2: per-frame kill cadence on the FIRST press (AC-2/5) ───────

describe('superzapper 10-2 — first press kills on a per-frame cadence', () => {
  it('does NOT clear the board in a single step — at most one kill on the press frame', () => {
    const board = mixedBoard() // 3 non-tankers + 1 tanker
    const out = stepGame(playing(board), ZAP, DT)
    // The instant-clear contract is gone: 2 of the 3 non-tankers must still stand.
    expect(deathsOf(out).length).toBeLessThanOrEqual(1)
    expect(nonTankers(out).length).toBeGreaterThanOrEqual(2)
    expect(out.player.superzapper).toBe('used-once') // charge still consumed on the press
  })

  it('removes exactly one enemy per active frame (≤1 death/frame across the window)', () => {
    const { trace } = runZap(playing(mixedBoard(), true))
    for (const f of trace) expect(f.deaths).toBeLessThanOrEqual(1)
    // tp1-14: the wipe now takes the tanker too — all 4 fall, one per kill-tick,
    // cargo stripped so no split adds a 5th.
    const totalDeaths = trace.reduce((n, f) => n + f.deaths, 0)
    expect(totalDeaths).toBe(4) // 2 flippers + pulsar + the (cargo-stripped) tanker
  })

  it('NET outcome (tp1-14): the wipe takes the tanker too — the board fully clears', () => {
    // W-042: the arcade's first-press zap kills tankers (INVCAR stripped so no
    // split); it does not spare them. mixedBoard's 4 enemies all fall (≤ 8 slots).
    const { final } = runZap(playing(mixedBoard(), true))
    expect(final.enemies).toHaveLength(0)
    expect(final.player.superzapper).toBe('used-once')
  })

  it('NET score (tp1-14): scores every kill including the now-taken tanker (100)', () => {
    const { final } = runZap(playing(mixedBoard(), true))
    expect(final.score).toBe(SCORE_FLIPPER * 2 + SCORE_PULSAR + SCORE_TANKER)
  })

  it('emits one death event per kill — now INCLUDING the taken tanker (tp1-14)', () => {
    const s0 = playing(mixedBoard(), true)
    const allDeaths: GameEvent[] = []
    let s = stepGame(s0, ZAP, DT)
    allDeaths.push(...deathsOf(s))
    for (let i = 0; i < 40 && flashesOf(s).length > 0 && s.mode === 'playing'; i++) {
      s = stepGame(s, NEUTRAL, DT)
      allDeaths.push(...deathsOf(s))
    }
    expect(allDeaths).toHaveLength(4)
    expect(allDeaths.some((e) => e.type === 'enemy-death' && e.enemyType === 'tanker')).toBe(true)
  })

  it('the window self-runs on NEUTRAL input — kills keep landing without holding zap', () => {
    // Press once, then NEVER press again: the board must still finish clearing.
    const { final, trace } = runZap(playing(mixedBoard(), true), ZAP)
    // More than one frame did killing work — proof the kill did not all happen on
    // the single press frame, and proof neutral frames advanced it.
    expect(trace.filter((f) => f.deaths > 0).length).toBeGreaterThan(1)
    expect(final.enemies).toHaveLength(0) // every kind cleared, tanker included
  })

  it('a board of only flippers fully clears across the window (no tanker needed)', () => {
    // Keep spawn budget so the emptied board does not auto-warp mid-window.
    const s = playing(threeFlippers())
    s.spawn = { nymphs: Array.from({ length: 3 }, (_, i) => ({ lane: i, py: 30000 + 16 * i })) }
    const { final, trace } = runZap(s)
    expect(final.enemies).toHaveLength(0)
    expect(trace.reduce((n, f) => n + f.deaths, 0)).toBe(3)
    for (const f of trace) expect(f.deaths).toBeLessThanOrEqual(1)
  })

  it('clears every in-flight enemy bolt on the press frame (10-1 preserved)', () => {
    const s = playing(mixedBoard())
    s.enemyBullets = twoBolts()
    const out = stepGame(s, ZAP, DT) // the press frame
    expect(out.enemyBullets).toHaveLength(0)
  })

  it('clears bolts on a first press even with NO enemies on the board', () => {
    const s = playing([])
    s.enemyBullets = twoBolts()
    const out = stepGame(s, ZAP, DT)
    expect(out.enemyBullets).toHaveLength(0)
    expect(out.player.superzapper).toBe('used-once') // charge still consumed
  })
})

// ──────────── 10-2: the well-color flash signal (AC-3) ───────────────────────

describe('superzapper 10-2 — per-frame well-color flash', () => {
  it('emits exactly one flash event on every active frame', () => {
    const { trace } = runZap(playing(oneFlipperOneTanker(), true))
    const active = trace.filter((f) => f.flashes > 0)
    expect(active.length).toBeGreaterThanOrEqual(FIRST_WINDOW_MIN)
    for (const f of active) expect(f.flashes).toBe(1) // one flash per active frame, never a burst
  })

  it('the flash color is a QFRAME-AND-7 index in 0..7', () => {
    const s0 = playing(oneFlipperOneTanker(), true)
    let s = stepGame(s0, ZAP, DT)
    const seen: number[] = []
    for (let i = 0; i < 40 && flashesOf(s).length > 0 && s.mode === 'playing'; i++) {
      for (const fl of flashesOf(s)) seen.push(fl.color)
      s = stepGame(s, NEUTRAL, DT)
    }
    expect(seen.length).toBeGreaterThan(0)
    for (const c of seen) {
      expect(Number.isInteger(c)).toBe(true)
      expect(c).toBeGreaterThanOrEqual(0)
      expect(c).toBeLessThanOrEqual(7)
    }
  })

  it('the flash color actually CHANGES frame-to-frame (it cycles, not a constant)', () => {
    const s0 = playing(oneFlipperOneTanker(), true)
    let s = stepGame(s0, ZAP, DT)
    const seen: number[] = []
    for (let i = 0; i < 40 && flashesOf(s).length > 0 && s.mode === 'playing'; i++) {
      for (const fl of flashesOf(s)) seen.push(fl.color)
      s = stepGame(s, NEUTRAL, DT)
    }
    expect(new Set(seen).size).toBeGreaterThan(1)
  })

  it('the flash STOPS once the window closes (reverts after)', () => {
    const { final } = runZap(playing(oneFlipperOneTanker(), true))
    // One more neutral step past window-end emits no flash.
    const after = stepGame(final, NEUTRAL, DT)
    expect(flashesOf(after)).toHaveLength(0)
    expect(zapTimer(after)).toBe(0)
  })

  it('a spent superzapper produces no flash at all', () => {
    const s = playing([makeEnemy('flipper', 3, 0.5, levelParams(1))])
    s.player.superzapper = 'spent'
    const out = stepGame(s, ZAP, DT)
    expect(flashesOf(out)).toHaveLength(0)
    expect(zapTimer(out)).toBe(0)
  })
})

// ──────────── 10-2: second press — shorter window, exactly one kill ──────────

describe('superzapper 10-2 — weak shot (second activation)', () => {
  it('destroys exactly ONE enemy — the one nearest the rim — and becomes spent', () => {
    const s = playing([
      makeEnemy('flipper', 2, 0.3, levelParams(1)),
      makeEnemy('flipper', 7, 0.8, levelParams(1)), // deepest → nearest the rim
    ])
    s.player.superzapper = 'used-once'
    const { final } = runZap(s)
    expect(final.enemies).toHaveLength(1)
    expect(final.enemies[0].lane).toBe(2) // the deeper (0.8) one was vaporised
    expect(final.player.superzapper).toBe('spent')
  })

  it('kills exactly one across the WHOLE window — never more, even on a packed board', () => {
    const s = playing([
      makeEnemy('flipper', 1, 0.2, levelParams(1)),
      makeEnemy('flipper', 4, 0.5, levelParams(1)),
      makeEnemy('flipper', 7, 0.8, levelParams(1)),
      makeEnemy('flipper', 9, 0.9, levelParams(1)),
    ])
    s.player.superzapper = 'used-once'
    const { final, trace } = runZap(s)
    expect(trace.reduce((n, f) => n + f.deaths, 0)).toBe(1) // net one kill, not a cascade
    expect(final.enemies).toHaveLength(3)
  })

  it('runs a shorter flash window than the first press (4–6 active frames)', () => {
    const s = playing([
      makeEnemy('flipper', 2, 0.3, levelParams(1)),
      { ...makeEnemy('tanker', 7, 0.5, levelParams(1), 'flipper'), fireCooldown: 999 },
    ])
    s.player.superzapper = 'used-once'
    const { trace } = runZap(s)
    const frames = activeFrames(trace)
    expect(frames).toBeGreaterThanOrEqual(SECOND_WINDOW_MIN)
    expect(frames).toBeLessThanOrEqual(SECOND_WINDOW_MAX)
  })

  it('awards the score of the single enemy it destroys', () => {
    const s = playing([
      makeEnemy('flipper', 2, 0.3, levelParams(1)),
      makeEnemy('flipper', 7, 0.8, levelParams(1)),
    ])
    s.player.superzapper = 'used-once'
    const { final } = runZap(s)
    expect(final.score).toBe(SCORE_FLIPPER) // one kill, not two
  })

  it('breaks a nearest-the-rim tie by destroying the LOWEST index', () => {
    const s = playing([
      makeEnemy('flipper', 4, 0.5, levelParams(1)), // index 0 — equal depth
      makeEnemy('flipper', 9, 0.5, levelParams(1)), // index 1 — equal depth
    ])
    s.player.superzapper = 'used-once'
    const { final } = runZap(s)
    expect(final.enemies).toHaveLength(1)
    expect(final.enemies[0].lane).toBe(9) // index 0 (lane 4) lost the tie
    expect(final.player.superzapper).toBe('spent')
  })

  it('a zap kill never releases tanker cargo (declaw preserved)', () => {
    const s = playing([makeEnemy('tanker', 5, 0.8, levelParams(1), 'flipper')])
    s.player.superzapper = 'used-once'
    const { final } = runZap(s)
    expect(final.enemies).toHaveLength(0) // killed, no child left behind
    expect(final.score).toBe(SCORE_TANKER) // one tanker, not two flippers
    expect(final.player.superzapper).toBe('spent')
  })

  it('a second press does NOT clear in-flight bolts — only the first press does', () => {
    const s = playing([
      { ...makeEnemy('tanker', 2, 0.3, levelParams(1), 'flipper'), fireCooldown: 999 },
      { ...makeEnemy('tanker', 7, 0.8, levelParams(1), 'flipper'), fireCooldown: 999 },
    ])
    s.player.superzapper = 'used-once'
    s.enemyBullets = [{ lane: 5, depth: 0.4 }]
    const { final } = runZap(s)
    expect(final.enemyBullets).toHaveLength(1) // weak shot leaves the bolt in flight
  })
})

// ──────────── 10-2: state machine, holding the button, no-ops ────────────────

describe('superzapper 10-2 — state machine across activations', () => {
  it('progresses full → used-once → spent, then a spent zap no-ops with no window/flash', () => {
    // First press → used-once (board clears over the window; keep spawn budget so
    // the emptied board does not auto-warp).
    let s = playing([makeEnemy('flipper', 1, 0.5, levelParams(1))])
    s.spawn = { nymphs: Array.from({ length: 5 }, (_, i) => ({ lane: i, py: 30000 + 16 * i })) }
    s = runZap(s).final
    expect(s.player.superzapper).toBe('used-once')

    // Second press → spent (one kill).
    s.enemies = [makeEnemy('flipper', 2, 0.5, levelParams(1))]
    s.mode = 'playing'
    s = runZap(s).final
    expect(s.player.superzapper).toBe('spent')

    // A spent superzapper must do nothing — no kills, no window, no flash.
    s.enemies = [
      makeEnemy('flipper', 3, 0.4, levelParams(1)),
      makeEnemy('flipper', 8, 0.5, levelParams(1)),
    ]
    s.mode = 'playing'
    const out = stepGame(s, ZAP, DT)
    expect(out.player.superzapper).toBe('spent')
    expect(out.enemies).toHaveLength(2)
    expect(flashesOf(out)).toHaveLength(0)
    expect(zapTimer(out)).toBe(0)
  })

  it('HOLDING zap through the first window does not start the second early', () => {
    // Press and HOLD (ZAP every frame). The held button must not burn the second
    // charge mid-first-window: the charge is 'used-once' for the whole window, and
    // enemies still die one-at-a-time (no instant double-zap cascade). keepAlive so
    // the wiped board (tankers die now) does not auto-warp before the window ends.
    let s = stepGame(playing(mixedBoard(), true), ZAP, DT)
    expect(s.player.superzapper).toBe('used-once')
    expect(zapTimer(s)).toBeGreaterThan(0) // a window must actually open to hold through
    for (let i = 0; i < FIRST_WINDOW_MAX && zapTimer(s) > 0 && s.mode === 'playing'; i++) {
      s = stepGame(s, ZAP, DT) // STILL holding
      // never jumps to 'spent' while the first window is live
      expect(s.player.superzapper).toBe('used-once')
      expect(deathsOf(s).length).toBeLessThanOrEqual(1)
    }
    // tp1-14: the first window cleared the WHOLE board — the tanker is taken too.
    expect(s.enemies).toHaveLength(0)
  })
})

// ──────────── 10-2: determinism & purity ────────────────────────────────────

describe('superzapper 10-2 — determinism & purity', () => {
  it('identical board + identical input give an identical per-frame trace and final state', () => {
    const a = runZap(playing(mixedBoard()))
    const b = runZap(playing(mixedBoard()))
    expect(a.trace).toEqual(b.trace)
    expect(a.final.enemies).toEqual(b.final.enemies)
    expect(a.final.score).toBe(b.final.score)
    expect(a.final.enemyBullets).toEqual(b.final.enemyBullets)
  })

  it('the press frame does not mutate its input state (pure step)', () => {
    const s = playing(mixedBoard())
    s.enemyBullets = twoBolts()
    const out = stepGame(s, ZAP, DT)
    // returned state reflects the press (charge consumed, bolts cleared, window open)...
    expect(out.player.superzapper).toBe('used-once')
    expect(out.enemyBullets).toHaveLength(0)
    expect(zapTimer(out)).toBeGreaterThan(0)
    // ...while the original argument is left exactly as it was.
    expect(s.player.superzapper).toBe('full')
    expect(s.enemies).toHaveLength(4)
    expect(s.enemyBullets).toHaveLength(2)
    expect(zapTimer(s)).toBe(0)
  })
})

// ──────────── 10-14: empty-board behavior — restore 5-1/4-1 semantics ─────────
//
// Story 10-14 (regression). The 10-2 rewrite dropped stepZap's
// `enemies.length === 0` early-return, which had encoded two deliberate 5-1/4-1
// decisions (per the removed source comment, quoted in the 10-2 review): on a
// TRULY EMPTY board (no enemies) a zap has NO TARGET, so —
//   (a) it emits NO `superzapper-activate` event. There is no kill payload, so
//       the shell must not play the "zap killed things" cue. (Story 5-1 Dev
//       deviation #2: "No enemies destroyed = no audible/visual zap payload";
//       reviewer-accepted.) And, since the windowed model flashes the well on
//       every ACTIVE frame, a no-target zap opens NO flash window either.
//   (b) a SECOND press (weak shot) is "wasted-but-not-spent" — the charge is
//       PRESERVED ('used-once'), NOT consumed. A mis-timed press on a momentarily
//       empty tube must not burn the weapon. (Story 4-1 documented model; the
//       reviewer-verified `enemies.length === 0` early-return ran BEFORE the
//       charge transition.)
// The 10-2 regression reversed BOTH: an empty press emitted activate + opened a
// flash window, and the second press consumed the charge → 'spent'. These tests
// restore the authentic semantics WITHOUT regressing 10-1's bolt-clear, which
// still fires on an empty FIRST press — that is the panic-button wiping in-flight
// bolts, not a kill.

// `superzapper-activate` events emitted this frame (drives the zap sound). On a
// target-less zap there should be NONE.
const activatesOf = (s: GameState): GameEvent[] =>
  s.events.filter((e) => e.type === 'superzapper-activate')

describe('superzapper 10-14 — empty-board FIRST press (full charge, no enemies)', () => {
  it('emits NO superzapper-activate event (no kill payload → no zap sound)', () => {
    const out = stepGame(playing([]), ZAP, DT)
    expect(activatesOf(out)).toHaveLength(0)
  })

  it('opens NO flash window on an empty board (zapTimer stays 0, no flashes)', () => {
    const out = stepGame(playing([]), ZAP, DT)
    expect(zapTimer(out)).toBe(0)
    expect(flashesOf(out)).toHaveLength(0)
  })

  it('still consumes the charge AND clears in-flight bolts (10-1 panic-button preserved)', () => {
    const s = playing([])
    s.enemyBullets = twoBolts()
    const out = stepGame(s, ZAP, DT)
    expect(out.player.superzapper).toBe('used-once') // full charge still consumed (4-1)
    expect(out.enemyBullets).toHaveLength(0) // in-flight bolts still wiped (10-1)
  })

  it('produces no enemy-death events on an empty board', () => {
    const out = stepGame(playing([]), ZAP, DT)
    expect(deathsOf(out)).toHaveLength(0)
  })
})

describe('superzapper 10-14 — empty-board SECOND press (weak shot is wasted-but-not-spent)', () => {
  it('does NOT spend the charge when there is no target — it stays used-once', () => {
    const s = playing([])
    s.player.superzapper = 'used-once'
    const out = stepGame(s, ZAP, DT)
    expect(out.player.superzapper).toBe('used-once') // preserved, NOT 'spent'
  })

  it('emits no activate event and opens no flash window on a target-less weak shot', () => {
    const s = playing([])
    s.player.superzapper = 'used-once'
    const out = stepGame(s, ZAP, DT)
    expect(activatesOf(out)).toHaveLength(0)
    expect(zapTimer(out)).toBe(0)
    expect(flashesOf(out)).toHaveLength(0)
  })

  it('the preserved charge is still usable — a later weak shot WITH a target kills one and spends', () => {
    // Keep a spawn budget so the empty press does NOT auto-warp (checkLevelClear
    // only warps an empty board with spawn.remaining === 0). The charge must
    // survive the wasted press and remain a live 'used-once' weak shot.
    const s = playing([])
    s.spawn = { nymphs: Array.from({ length: 1 }, (_, i) => ({ lane: i, py: 30000 + 16 * i })) }
    s.player.superzapper = 'used-once'
    const wasted = stepGame(s, ZAP, DT)
    expect(wasted.player.superzapper).toBe('used-once') // wasted, not spent
    expect(wasted.mode).toBe('playing') // no auto-warp — charge is still in hand

    // A target now appears; the SAME charge fires the weak shot for real.
    wasted.enemies = [
      makeEnemy('flipper', 2, 0.3, levelParams(1)),
      makeEnemy('flipper', 7, 0.8, levelParams(1)), // deepest → nearest the rim
    ]
    const { final } = runZap(wasted)
    expect(final.enemies).toHaveLength(1)
    expect(final.enemies[0].lane).toBe(2) // the deeper (0.8) one was vaporised
    expect(final.player.superzapper).toBe('spent') // NOW the charge spends
  })
})

describe('superzapper 10-14 — populated board is UNCHANGED (regression guard for the fix)', () => {
  it('a first press WITH enemies still opens the window and emits activate (10-2 intact)', () => {
    const out = stepGame(playing(mixedBoard()), ZAP, DT)
    expect(activatesOf(out)).toHaveLength(1)
    expect(zapTimer(out)).toBeGreaterThan(0)
    expect(out.player.superzapper).toBe('used-once')
  })

  it('a second press WITH a target still kills one nearest the rim and spends (10-2 intact)', () => {
    const s = playing([
      makeEnemy('flipper', 2, 0.3, levelParams(1)),
      makeEnemy('flipper', 7, 0.8, levelParams(1)), // deepest → nearest the rim
    ])
    s.player.superzapper = 'used-once'
    const { final } = runZap(s)
    expect(final.enemies).toHaveLength(1)
    expect(final.enemies[0].lane).toBe(2)
    expect(final.player.superzapper).toBe('spent')
  })
})
