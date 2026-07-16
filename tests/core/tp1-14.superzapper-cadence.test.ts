// tests/core/tp1-14.superzapper-cadence.test.ts
//
// tp1-14 — THE SUPERZAPPER, made faithful to Theurer's ROM (ALWELG.MAC PROSUZ /
// KILENE / EXIKIL, 3490-3567). This corrects three divergences the primary-source
// audit CONFIRMED, all in the FIRST press's sustained wipe:
//
//   AC-1  The first active window is 19 FRAMES, not 13.
//         TIMAX (ALWELG.MAC:3539) is a COMPUTED table, not the book's literal
//         `.BYTE 00,13,05`:  TIMAX[1] = CSUSTA + <8*<CSUINT+1>> with CSUSTA=3,
//         CSUINT=1 (3490-3492) = 3 + 8*2 = 19.  TIMAX[2] = 3 + 1*2 = 5.
//         [B-001, W-043 — CONFIRMED]
//
//   AC-2  It kills once every OTHER frame — at most 8 kills, not 19/one-per-frame.
//         KILENE (3542-3546) gates the kill: `CMP I,CSUSTA / IFCS / AND I,CSUINT /
//         IFEQ`  ==  SUZTIM >= 3 AND SUZTIM even.  Over SUZTIM = 1..19 that fires on
//         {4,6,8,10,12,14,16,18} — exactly 8, which is what the `8*` in TIMAX sizes.
//         Our runZapFrame instead kills on EVERY active frame (double rate).
//         [W-043, B-019, S-012 — CONFIRMED]
//
//   AC-3  The sustained wipe KILLS tankers, stripping their cargo first — it does
//         not skip them.  EXIKIL (3548-3567) takes the first live invader of ANY
//         kind (no type filter), CLEARS its INVCAR bits (`AND I,^C<INVCAR>`,
//         INVCAR=3 per ALCOMN.MAC:860) so no split occurs, then explodes it.  Our
//         runZapFrame filters `e.kind !== 'tanker'`, so a tanker survives a full
//         first-press zap the arcade would clear.  [W-042 — CONFIRMED]
//
//   REGRESSION GUARD (AC-4).  The SECOND press is ALREADY correct and MUST NOT
//         change: ZAP_WINDOW_SECOND = 5, exactly one kill (nearest the rim), the
//         charge spends, and the tanker-cargo declaw already holds.  W-042's
//         refuter and W-043 both say so in as many words ("Our ZAP_WINDOW_SECOND =
//         5 is correct"; the single-shot zap "already kills tankers without
//         splitting them").  Touching it is a regression.
//
// PARANOIA NOTES (why these tests are shaped this way):
//   * SELF-RUNNING WINDOW.  A press opens a window that runs AUTONOMOUSLY; the
//     player does not hold the button.  Every window test presses ZAP once, then
//     steps on NEUTRAL and proves the cadence/flash keep coming.
//   * AUTO-WARP TRAP.  The instant the board empties with no spawn budget,
//     `checkLevelClear` (sim.ts:752) flips to 'warp' and cuts the window short.
//     Story 10-2's suite dodged this with a SPARED tanker — but tp1-14 makes the
//     wipe kill tankers too, so that anchor is gone.  We hold the board open with
//     a `py:30000` nymph budget instead (the proven idiom from sim.events.test.ts),
//     or by staging MORE than 8 killable enemies so some always survive.
//   * CADENCE, NOT ORDER.  KILENE takes the first live invader by SLOT order
//     (scanning DOWN from WINVMX, 3548) — our port targets nearest-the-rim.  That
//     targeting-ORDER divergence is out of THIS story's scope (see the Delivery
//     Finding); these tests assert HOW MANY die and WHEN, never WHICH one, so they
//     hold under either targeting.
//   * FRAME-COUNTED, not seconds.  The window is 19 GAME FRAMES.  The separate
//     28.44-fps-vs-60-Hz timebase error (FR-001/FR-014, B-001's two-part note) is a
//     GAME-WIDE rebase and is NOT this story — we pin the frame COUNT, which the
//     audit calls "base-independent".
import { describe, it, expect } from 'vitest'
import { initialState } from '../../src/core/state'
import type { GameState, Enemy } from '../../src/core/state'
import type { GameEvent, SuperzapperFlashEvent } from '../../src/core/events'
import { stepGame, makeEnemy } from '../../src/core/sim'
import { Input } from '../../src/core/input'
import { ZAP_WINDOW_FIRST, ZAP_WINDOW_SECOND, SCORE_TANKER, levelParams } from '../../src/core/rules'

const DT = 1 / 60
const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }
const ZAP: Input = { spin: 0, fire: false, zap: true, start: false }

// The ROM's own arithmetic, re-derived here so the numbers below are not magic.
const FIRST_WINDOW_FRAMES = 19 // CSUSTA + 8*(CSUINT+1) = 3 + 16
const MAX_FIRST_KILLS = 8 // even SUZTIM in [3,19): {4,6,8,10,12,14,16,18}
const CADENCE_STRIDE = 2 // CSUINT+1 — a kill every OTHER active frame

const flashesOf = (s: GameState): SuperzapperFlashEvent[] =>
  s.events.filter((e): e is SuperzapperFlashEvent => e.type === 'superzapper-flash')
const deathsOf = (s: GameState): GameEvent[] => s.events.filter((e) => e.type === 'enemy-death')

// A fresh, in-progress level holding exactly `enemies`. `keepAlive` stamps a far
// nymph so an emptied board does NOT auto-warp mid-window (proven inert over a
// window — sim.events.test.ts:149) — WITHOUT changing the enemy roster.
function playing(enemies: Enemy[], keepAlive = false): GameState {
  const s = initialState(1)
  s.mode = 'playing'
  s.spawn = { nymphs: keepAlive ? [{ lane: 0, py: 30000 }] : [] }
  s.enemies = enemies
  return s
}

// Wave-1 (NOJUMP) flippers parked so they neither jump lanes nor fire across the
// window: a stable roster whose only change is the zap's own kills.
const flippers = (n: number, depth = 0.15): Enemy[] =>
  Array.from({ length: n }, (_, i) => ({
    ...makeEnemy('flipper', i % 15, depth, levelParams(1)),
    fireCooldown: 999,
  }))

// Press ZAP once, then step NEUTRAL to the end of the window, recording per-frame
// flash and death counts. Frame 1 is the press.
function firstWindow(s0: GameState): {
  flashesPerFrame: number[]
  deathsPerFrame: number[]
  seenKinds: Set<string>
  final: GameState
} {
  const flashesPerFrame: number[] = []
  const deathsPerFrame: number[] = []
  const seenKinds = new Set<string>()
  let s = stepGame(s0, ZAP, DT) // frame 1 — the press
  const record = (st: GameState): void => {
    flashesPerFrame.push(flashesOf(st).length)
    deathsPerFrame.push(deathsOf(st).length)
    for (const e of st.enemies) seenKinds.add(e.kind)
  }
  record(s)
  for (let i = 0; i < 60 && flashesOf(s).length > 0 && s.mode === 'playing'; i++) {
    s = stepGame(s, NEUTRAL, DT)
    record(s)
  }
  return { flashesPerFrame, deathsPerFrame, seenKinds, final: s }
}

const activeFrames = (flashesPerFrame: number[]): number => flashesPerFrame.filter((f) => f > 0).length
// 1-based indices of the frames on which a kill landed.
const killFrames = (deathsPerFrame: number[]): number[] =>
  deathsPerFrame.flatMap((d, i) => (d > 0 ? [i + 1] : []))

// ───────────────────────── AC-1: 19-frame window ─────────────────────────

describe('tp1-14 superzapper — the first window is 19 frames (was 13)', () => {
  it('pins the constant: ZAP_WINDOW_FIRST === 19 (TIMAX[1] = 3 + 8*2), refuting the book 13', () => {
    expect(ZAP_WINDOW_FIRST).toBe(FIRST_WINDOW_FRAMES)
    expect(ZAP_WINDOW_FIRST).not.toBe(13) // the book's literal `.BYTE 00,13,05` (B-001)
  })

  it('the second window is unchanged at 5 frames (TIMAX[2] = 3 + 2) — regression guard', () => {
    expect(ZAP_WINDOW_SECOND).toBe(5)
  })

  it('the first press flashes the well for exactly 19 active frames', () => {
    // 12 flippers, keep-alive: 8 die under the cadence, 4 survive → the board never
    // empties, so the whole window is observable without an auto-warp.
    const { flashesPerFrame } = firstWindow(playing(flippers(12), true))
    expect(activeFrames(flashesPerFrame)).toBe(FIRST_WINDOW_FRAMES)
  })
})

// ──────────────── AC-2: 8 kills, once every OTHER frame ────────────────

describe('tp1-14 superzapper — first press kills 8, once every OTHER frame (was 13/one-per-frame)', () => {
  it('removes exactly 8 enemies across the window, given plenty to kill', () => {
    const { deathsPerFrame, final } = firstWindow(playing(flippers(12), true))
    const total = deathsPerFrame.reduce((a, b) => a + b, 0)
    expect(total).toBe(MAX_FIRST_KILLS) // 8, not 12 (one-per-frame) and not 13
    expect(final.enemies).toHaveLength(12 - MAX_FIRST_KILLS) // 4 survive — proof it is NOT a full wipe
  })

  it('never kills more than one enemy on a single frame (KILENE fires once per call)', () => {
    const { deathsPerFrame } = firstWindow(playing(flippers(12), true))
    for (const d of deathsPerFrame) expect(d).toBeLessThanOrEqual(1)
  })

  it('lands its kills on non-consecutive frames — every OTHER frame, stride 2', () => {
    const { deathsPerFrame } = firstWindow(playing(flippers(12), true))
    const frames = killFrames(deathsPerFrame)
    expect(frames).toHaveLength(MAX_FIRST_KILLS)
    for (let i = 1; i < frames.length; i++) {
      expect(frames[i] - frames[i - 1]).toBe(CADENCE_STRIDE) // gap of 2 — the staccato cadence
    }
  })

  it('honours the CSUSTA warm-up: no kill in the first two active frames', () => {
    // KILENE needs SUZTIM >= 3 AND even → the first kill is at SUZTIM 4, never on
    // the press frame. The unfixed code kills on frame 1; this fails it hard.
    const { deathsPerFrame } = firstWindow(playing(flippers(12), true))
    const frames = killFrames(deathsPerFrame)
    expect(frames[0]).toBeGreaterThanOrEqual(3)
  })

  it('the kill count (8) is strictly fewer than the active frames (19) — not one-per-frame', () => {
    const { flashesPerFrame, deathsPerFrame } = firstWindow(playing(flippers(12), true))
    const kills = deathsPerFrame.reduce((a, b) => a + b, 0)
    expect(kills).toBeLessThan(activeFrames(flashesPerFrame))
    expect(activeFrames(flashesPerFrame)).toBe(FIRST_WINDOW_FRAMES)
    expect(kills).toBe(MAX_FIRST_KILLS)
  })
})

// ──────────────── AC-3: the wipe takes tankers, cargo-stripped ────────────────

describe('tp1-14 superzapper — the first-press wipe KILLS tankers (cargo stripped, no split)', () => {
  it('vaporises tankers over the window instead of sparing them', () => {
    // 4 tankers, keep-alive so the emptied board does not warp. On the UNFIXED code
    // runZapFrame filters non-tankers → zero kills → all four survive (this fails).
    const s = playing(
      [2, 5, 8, 11].map((lane) => ({
        ...makeEnemy('tanker', lane, 0.5, levelParams(1), 'flipper'),
        fireCooldown: 999,
      })),
      true,
    )
    const { final } = firstWindow(s)
    expect(final.enemies.filter((e) => e.kind === 'tanker')).toHaveLength(0) // all four killed
  })

  it('strips the cargo — the killed tanker NEVER splits into a child (declaw preserved)', () => {
    const s = playing(
      [2, 5, 8, 11].map((lane) => ({
        ...makeEnemy('tanker', lane, 0.5, levelParams(1), 'flipper'),
        fireCooldown: 999,
      })),
      true,
    )
    const { final, seenKinds } = firstWindow(s)
    // No flipper (the cargo kind) ever appears — a split would have spawned one.
    expect(seenKinds.has('flipper')).toBe(false)
    expect(final.enemies).toHaveLength(0) // 4 killed, 0 children left behind
  })

  it('scores each killed tanker exactly once (100), never the doubled score of a split', () => {
    const s = playing(
      [2, 5, 8, 11].map((lane) => ({
        ...makeEnemy('tanker', lane, 0.5, levelParams(1), 'flipper'),
        fireCooldown: 999,
      })),
      true,
    )
    const { final } = firstWindow(s)
    expect(final.score).toBe(4 * SCORE_TANKER)
  })

  it('emits a tanker enemy-death for each kill — no cargo-child death, no split', () => {
    const s = playing(
      [2, 5, 8, 11].map((lane) => ({
        ...makeEnemy('tanker', lane, 0.5, levelParams(1), 'flipper'),
        fireCooldown: 999,
      })),
      true,
    )
    const allDeaths: GameEvent[] = []
    let st = stepGame(s, ZAP, DT)
    allDeaths.push(...deathsOf(st))
    for (let i = 0; i < 60 && flashesOf(st).length > 0 && st.mode === 'playing'; i++) {
      st = stepGame(st, NEUTRAL, DT)
      allDeaths.push(...deathsOf(st))
    }
    expect(allDeaths).toHaveLength(4)
    expect(allDeaths.every((e) => e.type === 'enemy-death' && e.enemyType === 'tanker')).toBe(true)
  })

  it('a MIXED board loses tankers alongside non-tankers (up to 8, any kind)', () => {
    // 3 tankers + 3 flippers = 6 ≤ 8 kill slots, so ALL die — tankers included.
    const s = playing(
      [
        { ...makeEnemy('tanker', 1, 0.5, levelParams(1), 'flipper'), fireCooldown: 999 },
        { ...makeEnemy('flipper', 3, 0.3, levelParams(1)), fireCooldown: 999 },
        { ...makeEnemy('tanker', 5, 0.5, levelParams(1), 'flipper'), fireCooldown: 999 },
        { ...makeEnemy('flipper', 7, 0.3, levelParams(1)), fireCooldown: 999 },
        { ...makeEnemy('tanker', 9, 0.5, levelParams(1), 'flipper'), fireCooldown: 999 },
        { ...makeEnemy('flipper', 11, 0.3, levelParams(1)), fireCooldown: 999 },
      ],
      true,
    )
    const { final } = firstWindow(s)
    expect(final.enemies.some((e) => e.kind === 'tanker')).toBe(false) // tankers no longer spared
    expect(final.enemies).toHaveLength(0)
  })
})

// ──────────────── AC-4: the SECOND press is unchanged (regression guard) ────────────────

describe('tp1-14 superzapper — the second press must NOT change (W-043 refuter)', () => {
  it('a used-once weak shot still kills exactly ONE, nearest the rim, and spends', () => {
    const s = playing([
      makeEnemy('flipper', 2, 0.3, levelParams(1)),
      makeEnemy('flipper', 7, 0.8, levelParams(1)), // deepest → nearest the rim
    ])
    s.player.superzapper = 'used-once'
    const { deathsPerFrame, final } = firstWindow(s)
    expect(deathsPerFrame.reduce((a, b) => a + b, 0)).toBe(1) // exactly one across the whole window
    expect(final.enemies).toHaveLength(1)
    expect(final.enemies[0].lane).toBe(2) // the deeper (0.8) one died
    expect(final.player.superzapper).toBe('spent')
  })

  it('the weak shot still runs the shorter 5-ish window, not the 19-frame one', () => {
    const s = playing([makeEnemy('flipper', 2, 0.3, levelParams(1))], true)
    s.player.superzapper = 'used-once'
    const { flashesPerFrame } = firstWindow(s)
    const frames = activeFrames(flashesPerFrame)
    expect(frames).toBe(ZAP_WINDOW_SECOND) // 5
    expect(frames).toBeLessThan(FIRST_WINDOW_FRAMES) // and decisively shorter than the first
  })
})

// ──────────────── purity / determinism (tempest core rule) ────────────────

describe('tp1-14 superzapper — deterministic & pure (core rule)', () => {
  it('identical board + identical input give an identical per-frame kill trace', () => {
    const a = firstWindow(playing(flippers(12), true))
    const b = firstWindow(playing(flippers(12), true))
    expect(a.deathsPerFrame).toEqual(b.deathsPerFrame)
    expect(a.flashesPerFrame).toEqual(b.flashesPerFrame)
    expect(a.final.score).toBe(b.final.score)
  })

  it('the window is frame-counted, not wall-clock — doubling dt does not shorten it', () => {
    const base = firstWindow(playing(flippers(12), true))
    // Re-run at 2× dt throughout; the frame count must not move.
    let s = stepGame(playing(flippers(12), true), ZAP, 2 * DT)
    const flashes: number[] = [flashesOf(s).length]
    for (let i = 0; i < 60 && flashesOf(s).length > 0 && s.mode === 'playing'; i++) {
      s = stepGame(s, NEUTRAL, 2 * DT)
      flashes.push(flashesOf(s).length)
    }
    expect(activeFrames(flashes)).toBe(activeFrames(base.flashesPerFrame))
    expect(activeFrames(flashes)).toBe(FIRST_WINDOW_FRAMES)
  })
})
