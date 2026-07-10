// tests/core/sim.highscore.test.ts
//
// SH2-13 REPOINT of the 4-3/6-2 suite: the mousewheel/arrow letter-cycle entry
// is RETIRED for direct keyboard typing (asteroids' flow is the cabinet-wide
// reference). The user's deliberate guiding call: we have a keyboard — typing
// beats the ROM's spinner scheme.
//
// TEA decisions pinned here (logged as deviations in .session/SH2-13-session.md):
//  - TYPING: letters arrive as KEYDOWN EVENTS through a new PURE core event
//    function `enterInitial(state, key)` (the asteroids pattern — entry chars
//    are edge events and do not ride on the per-frame Input). It delegates the
//    buffer arithmetic to the shared reducer (@arcade/shared/name-entry): A-Z
//    appends UPPERCASED up to 3, 'Backspace' deletes the last character (never
//    past empty), everything else is inert. Inert outside 'highscore' mode.
//  - ENTRY STATE: GameState.entry slims to { initials: string } — charIndex
//    and currentLetter die with the cycle mechanism.
//  - SPIN IS INERT during entry (it keeps its gameplay meaning elsewhere).
//  - CONFIRM: tempest's existing confirm stays — `input.fire` on a RISING edge
//    (prevFire, the 6-2 shift register) — but now commits the COMPLETED buffer
//    (all 3 initials) in one press: insert { name, score, level } (no date —
//    core purity), mode -> 'attract', entry -> null. Fire with a short buffer
//    is inert. `input.start` stays INERT during entry (4-3 decision preserved).
//  - GAMEOVER ROUTING unchanged: start + qualifying -> 'highscore' with a
//    fresh empty entry; non-qualifying -> 'attract'.
//
// Pre-GREEN this file is RED on assertions: enterInitial does not exist yet
// (read through a loose module view so its absence fails tests, not module
// load), stepHighScore still cycles letters, and entry still carries
// charIndex/currentLetter.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { initialState, GameState } from '../../src/core/state'
import * as simModule from '../../src/core/sim'
import { Input } from '../../src/core/input'

const { stepGame } = simModule
// Loose view: the typed-entry event function this story adds. Absent pre-GREEN,
// so the guard test below fails and every use throws INSIDE a test (assertion
// failure), never at module load.
const enterInitial = (
  simModule as unknown as { enterInitial?: (s: GameState, key: string) => GameState }
).enterInitial

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }
const DT = 1 / 60

interface EntryView { initials: string }
interface TableRow { name: string; score: number; level: number; date?: string }

// Loose views over the evolving core types, so reads are clean and the tests
// fail on assertions rather than throwing on undefined properties.
const modeOf = (s: GameState): string => (s as unknown as { mode: string }).mode
const entryOf = (s: GameState): EntryView | null =>
  (s as unknown as { entry: EntryView | null }).entry
const tableOf = (s: GameState): TableRow[] =>
  (s as unknown as { highScoreTable: TableRow[] }).highScoreTable

function withMode(s: GameState, mode: string): GameState {
  ;(s as unknown as { mode: string }).mode = mode
  return s
}
function withEntry(s: GameState, e: EntryView | null): GameState {
  ;(s as unknown as { entry: EntryView | null }).entry = e
  return s
}
function withTable(s: GameState, table: TableRow[]): GameState {
  ;(s as unknown as { highScoreTable: TableRow[] }).highScoreTable = table
  return s
}

// A state parked mid initials-entry. Defaults: empty buffer, empty board, a
// qualifying ended-game score/level.
function entryState(
  opts: Partial<{
    initials: string
    score: number; level: number; table: TableRow[]; seed: number
  }> = {},
): GameState {
  const { initials = '', score = 5000, level = 3, table = [], seed = 1 } = opts
  let s = initialState(seed)
  s.score = score
  s.level = level
  s = withTable(s, table)
  s = withEntry(s, { initials })
  return withMode(s, 'highscore')
}

// A state parked on the gameover screen with the given ended-game score/board.
function gameoverState(score: number, table: TableRow[], seed = 2): GameState {
  let s = initialState(seed)
  s.score = score
  s.level = 4
  s = withTable(s, table)
  s = withEntry(s, null)
  return withMode(s, 'gameover')
}

const fire = (s: GameState): GameState => stepGame(s, { ...NEUTRAL, fire: true }, DT)
const spinStep = (s: GameState, dir: number): GameState =>
  stepGame(s, { ...NEUTRAL, spin: dir }, DT)
const start = (s: GameState): GameState => stepGame(s, { ...NEUTRAL, start: true }, DT)
const neutral = (s: GameState): GameState => stepGame(s, NEUTRAL, DT)

const typeAll = (s: GameState, keys: string[]): GameState =>
  keys.reduce((acc, k) => enterInitial!(acc, k), s)

const fullBoard = (): TableRow[] =>
  Array.from({ length: 10 }, (_, i) => ({ name: `E${i}`, score: (10 - i) * 1000, level: 1 }))

// ---- the new surface exists ----------------------------------------------------

describe('typed entry — the core event function exists', () => {
  it('sim.ts exports enterInitial(state, key)', () => {
    expect(typeof enterInitial).toBe('function')
  })
})

// ---- typing letters (the shared verb, tempest numbers) --------------------------

describe('typed entry — letters fill the buffer (uppercased, capped at 3)', () => {
  it('a lowercase keydown appends its uppercase initial', () => {
    const s = enterInitial!(entryState(), 'a')
    expect(entryOf(s)?.initials).toBe('A')
  })

  it('fills in typing order', () => {
    const s = typeAll(entryState(), ['k', 'a', 'v'])
    expect(entryOf(s)?.initials).toBe('KAV')
  })

  it('ignores a 4th letter (tempest keeps the 3-char arcade convention)', () => {
    const s = typeAll(entryState(), ['k', 'a', 'v', 'x'])
    expect(entryOf(s)?.initials).toBe('KAV')
  })

  it('ignores non-letter keys (digits, named keys, junk)', () => {
    const before = entryState({ initials: 'A' })
    for (const key of ['5', ' ', 'Enter', 'ArrowLeft', 'Escape', 'ab', '']) {
      expect(entryOf(enterInitial!(before, key))?.initials, `key ${JSON.stringify(key)}`).toBe('A')
    }
  })

  it('is inert outside highscore mode (attract, playing, gameover)', () => {
    for (const mode of ['attract', 'playing', 'gameover']) {
      const s = withMode(withEntry(initialState(9), null), mode)
      const out = enterInitial!(s, 'a')
      expect(modeOf(out), mode).toBe(mode)
      expect(entryOf(out), mode).toBeNull()
    }
  })
})

// ---- Backspace (AC-2) -----------------------------------------------------------

describe('typed entry — Backspace deletes (AC-2)', () => {
  it('removes the last typed initial', () => {
    const s = enterInitial!(entryState({ initials: 'AC' }), 'Backspace')
    expect(entryOf(s)?.initials).toBe('A')
  })

  it('cannot delete past an empty buffer', () => {
    const s = enterInitial!(entryState({ initials: '' }), 'Backspace')
    expect(entryOf(s)?.initials).toBe('')
    expect(modeOf(s)).toBe('highscore') // still entering
  })

  it('corrects a full-buffer typo: delete then retype', () => {
    const typo = entryState({ initials: 'ACX' })
    const fixed = enterInitial!(enterInitial!(typo, 'Backspace'), 'e')
    expect(entryOf(fixed)?.initials).toBe('ACE')
  })
})

// ---- the cycle mechanism is RETIRED ----------------------------------------------

describe('the mousewheel/arrow letter-cycle is retired (AC-1)', () => {
  it('spin is INERT during entry — it no longer cycles anything', () => {
    const before = entryState({ initials: 'A' })
    const up = spinStep(before, 1)
    const down = spinStep(before, -1)
    expect(entryOf(up)).toEqual({ initials: 'A' })
    expect(entryOf(down)).toEqual({ initials: 'A' })
    expect(modeOf(up)).toBe('highscore')
    expect(tableOf(up)).toHaveLength(0)
  })

  it('sim.ts no longer carries the cycleLetter machinery (comment-inclusive scan)', () => {
    const simSrc = readFileSync(
      fileURLToPath(new URL('../../src/core/sim.ts', import.meta.url)),
      'utf8',
    )
    expect(simSrc).not.toMatch(/cycleLetter/)
  })

  it('the entry state slims to { initials } — charIndex/currentLetter die with the cycle', () => {
    const fresh = start(gameoverState(5000, []))
    expect(modeOf(fresh)).toBe('highscore')
    expect(entryOf(fresh)).toEqual({ initials: '' })
  })
})

// ---- confirm: fire edge commits the COMPLETED buffer ------------------------------

describe('typed entry — fire commits once all 3 initials are typed', () => {
  it('fire with a short buffer is inert (waits for the full 3)', () => {
    const partial = entryState({ initials: 'AC' })
    const s = fire(partial)
    expect(modeOf(s)).toBe('highscore')
    expect(entryOf(s)?.initials).toBe('AC')
    expect(tableOf(s)).toHaveLength(0)
  })

  it('fire with 3 typed inserts { name, score, level } and returns to attract', () => {
    const ready = typeAll(entryState({ score: 1234, level: 7 }), ['k', 'a', 'v'])
    const s = fire(ready)
    expect(modeOf(s)).toBe('attract')
    expect(entryOf(s)).toBeNull()
    expect(tableOf(s)).toHaveLength(1)
    expect(tableOf(s)[0]).toMatchObject({ name: 'KAV', score: 1234, level: 7 })
  })

  it('does not stamp a date on the inserted entry (core is pure)', () => {
    const ready = typeAll(entryState(), ['k', 'a', 'v'])
    expect(tableOf(fire(ready))[0].date).toBeUndefined()
  })

  it('inserts into an existing board in descending order', () => {
    const board: TableRow[] = [
      { name: 'TOP', score: 9000, level: 9 },
      { name: 'LOW', score: 1000, level: 1 },
    ]
    const ready = typeAll(entryState({ score: 5000, table: board }), ['m', 'i', 'd'])
    const table = tableOf(fire(ready))
    expect(table.map((r) => r.name)).toEqual(['TOP', 'MID', 'LOW'])
  })

  it('start stays INERT during entry — it does not confirm (4-3 decision preserved)', () => {
    const ready = typeAll(entryState(), ['k', 'a', 'v'])
    const s = start(ready)
    expect(modeOf(s)).toBe('highscore')
    expect(tableOf(s)).toHaveLength(0)
  })

  it('neutral input leaves the entry untouched', () => {
    const before = entryState({ initials: 'KA' })
    const s = neutral(before)
    expect(modeOf(s)).toBe('highscore')
    expect(entryOf(s)).toEqual({ initials: 'KA' })
  })
})

// ---- gameover -> qualify routing (4-3 contracts, preserved) -----------------------

describe('gameover -> qualify routing (unchanged by the mechanism swap)', () => {
  it('gameover + start with a qualifying score enters highscore with a fresh empty entry', () => {
    const s = start(gameoverState(5000, []))
    expect(modeOf(s)).toBe('highscore')
    expect(entryOf(s)).toEqual({ initials: '' })
    expect(tableOf(s)).toHaveLength(0) // nothing inserted yet
  })

  it('gameover + start with a NON-qualifying score goes straight to attract, no entry begun', () => {
    const s = start(gameoverState(0, []))
    expect(modeOf(s)).toBe('attract')
    expect(entryOf(s)).toBeNull()
  })

  it('gameover + start with a full board and score EQUAL to the lowest does NOT qualify', () => {
    const s = start(gameoverState(1000, fullBoard()))
    expect(modeOf(s)).toBe('attract')
    expect(entryOf(s)).toBeNull()
  })

  it('gameover without start stays in gameover', () => {
    const s = neutral(gameoverState(5000, []))
    expect(modeOf(s)).toBe('gameover')
  })
})

// ---- 6-2 regression, repointed: held fire cannot commit ---------------------------

describe('confirm is edge-triggered, not level-triggered (Story 6-2 regression, repointed)', () => {
  it('does not auto-commit when the restart click is held into highscore', () => {
    // A mouse restart click delivers start + fire together for the press
    // duration; the click enters highscore and the still-held button must not
    // commit anything (the buffer is empty anyway — belt and braces).
    let s = stepGame(gameoverState(5000, []), { ...NEUTRAL, start: true, fire: true }, DT)
    expect(modeOf(s)).toBe('highscore')
    for (let i = 0; i < 6; i++) s = stepGame(s, { ...NEUTRAL, fire: true }, DT)
    expect(modeOf(s)).toBe('highscore')
    expect(entryOf(s)).not.toBeNull()
    expect(tableOf(s)).toHaveLength(0)
  })

  it('a fire held since BEFORE the 3rd initial cannot commit — a fresh press is required', () => {
    // Hold the button (prevFire latches true), type the 3rd letter while it is
    // still down, keep holding: no commit. Release, press again: commits once.
    let s = fire(entryState({ initials: 'KA' })) // fire pressed with a short buffer — inert
    s = enterInitial!(s, 'v') // 3rd letter typed while the button is still down
    for (let i = 0; i < 6; i++) s = fire(s) // still held — must not commit
    expect(modeOf(s)).toBe('highscore')
    expect(tableOf(s)).toHaveLength(0)
    s = neutral(s) // released
    s = fire(s) // fresh press
    expect(modeOf(s)).toBe('attract')
    expect(tableOf(s)).toHaveLength(1)
    expect(tableOf(s)[0].name).toBe('KAV')
  })

  it('a single multi-frame tap commits exactly once', () => {
    let s = typeAll(entryState({ score: 4321, level: 2 }), ['b', 'o', 'b'])
    for (let i = 0; i < 6; i++) s = fire(s) // one tap, held 6 frames
    expect(modeOf(s)).toBe('attract')
    expect(tableOf(s)).toHaveLength(1) // one insert, not six
  })
})

// ---- determinism / purity ----------------------------------------------------------

describe('typed entry — determinism, purity, RNG', () => {
  it('enterInitial is deterministic and does not mutate its input state', () => {
    const base = entryState({ initials: 'K' })
    const snapshot = JSON.parse(JSON.stringify(entryOf(base)))
    const a = enterInitial!(base, 'v')
    const b = enterInitial!(base, 'v')
    expect(entryOf(a)).toEqual(entryOf(b))
    expect(entryOf(base)).toEqual(snapshot) // caller state untouched
  })

  it('identical (state, input, dt) yields identical mode/entry/table through stepGame', () => {
    const mk = () => typeAll(entryState({ score: 777, level: 5 }), ['z', 'o', 'e'])
    const a = fire(mk())
    const b = fire(mk())
    expect(modeOf(a)).toBe(modeOf(b))
    expect(entryOf(a)).toEqual(entryOf(b))
    expect(tableOf(a)).toEqual(tableOf(b))
  })

  it('entry steps and typing never consume the RNG', () => {
    const before = entryState({ initials: 'K' })
    const rngBefore = JSON.parse(JSON.stringify(before.rng))
    const afterType = enterInitial!(before, 'a')
    const afterStep = neutral(afterType)
    expect(afterStep.rng).toEqual(rngBefore)
  })

  it('does not mutate the caller state on confirm (cloneState clones entry)', () => {
    const ready = typeAll(entryState(), ['k', 'a', 'v'])
    const snapshot = JSON.parse(JSON.stringify(entryOf(ready)))
    fire(ready)
    expect(entryOf(ready)).toEqual(snapshot)
  })
})

// ---- the shared VERB + shell wiring (AC-3 / AC-2) -----------------------------------

describe('the mechanism is the SHARED reducer and the shell forwards keys (AC-3/AC-2)', () => {
  const srcDir = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))
  const joinSources = (dir: string): string =>
    readdirSync(dir)
      .filter((f) => f.endsWith('.ts'))
      .map((f) => readFileSync(`${dir}/${f}`, 'utf8'))
      .join('\n')

  it('some core module imports @arcade/shared/name-entry', () => {
    expect(joinSources(srcDir('../../src/core'))).toContain('@arcade/shared/name-entry')
  })

  it('the shell forwards keydown letters AND Backspace to enterInitial', () => {
    const shell =
      joinSources(srcDir('../../src/shell')) +
      readFileSync(srcDir('../../src/main.ts'), 'utf8')
    expect(shell).toContain('enterInitial')
    expect(shell).toContain('Backspace')
  })
})
