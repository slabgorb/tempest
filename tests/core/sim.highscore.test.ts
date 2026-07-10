// tests/core/sim.highscore.test.ts
//
// RED-phase suite for Story 4-3, Part B: the PURE 'highscore' initials-entry
// state machine plus the gameover -> qualify -> entry/attract routing.
//
// stepGame() already exists, so this file imports nothing new: it reads the
// not-yet-added GameState fields (`entry`, `highScoreTable`) and the new
// 'highscore' mode through LOOSE VIEWS, exactly like sim.framing.test.ts (4-2).
// Pre-GREEN, stepGame has no 'highscore' case, so it returns the cloned state
// unchanged and the behavioural assertions fail — the intended RED. The gameover
// routing tests fail because gameover+start currently goes straight to 'attract'
// (4-2 behaviour) instead of branching on qualification.
//
// TEA decisions pinned here (logged as deviations in .session/4-3-session.md):
//  - CONFIRM INPUT = `input.fire`. `input.start` is RESERVED for the
//    gameover->highscore transition and is INERT during entry. This separation
//    removes the carry-over hazard: the same `start` edge that enters 'highscore'
//    cannot also confirm the first initial — a fresh `fire` press is required per
//    letter. (The plan said "start or fire"; we pin fire-only.)
//  - LETTER CYCLING: `input.spin` rotates A..Z with WRAP, sign-based ±1 per step
//    (Math.sign granularity, mirroring 4-2's select). spin>0: A->B; spin<0 from A
//    wraps to Z; spin>0 from Z wraps to A.
//  - COMPLETION: after the 3rd confirmed initial the entry is inserted into
//    GameState.highScoreTable (name = initials, score/level from the just-ended
//    game, NO date — core is pure and cannot call Date), mode -> 'attract',
//    GameState.entry -> null.
//  - NON-QUALIFYING gameover+start -> 'attract' (4-2 behaviour preserved), no
//    entry begun.
import { describe, it, expect } from 'vitest'
import { initialState, GameState } from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { Input } from '../../src/core/input'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }
const DT = 1 / 60

interface EntryView { initials: string; charIndex: number; currentLetter: string }
interface TableRow { name: string; score: number; level: number; date?: string }

// Loose views over the not-yet-extended core types, so reads are clean and the
// tests fail on assertions rather than throwing on undefined properties.
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

// A state parked mid initials-entry. Defaults: fresh entry at letter A, charIndex
// 0, empty board, a qualifying ended-game score/level.
function entryState(
  opts: Partial<{
    initials: string; charIndex: number; currentLetter: string
    score: number; level: number; table: TableRow[]; seed: number
  }> = {},
): GameState {
  const {
    initials = '', charIndex = 0, currentLetter = 'A',
    score = 5000, level = 3, table = [], seed = 1,
  } = opts
  let s = initialState(seed)
  s.score = score
  s.level = level
  s = withTable(s, table)
  s = withEntry(s, { initials, charIndex, currentLetter })
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
const spin = (s: GameState, dir: number): GameState => stepGame(s, { ...NEUTRAL, spin: dir }, DT)
const start = (s: GameState): GameState => stepGame(s, { ...NEUTRAL, start: true }, DT)
const neutral = (s: GameState): GameState => stepGame(s, NEUTRAL, DT)

// Confirm the letter at alphabet offset (0='A') for the current position:
// spin up `offset` times (currentLetter resets to 'A' at each new position),
// then fire to confirm.
// Confirm one letter as a genuine DISCRETE tap: release fire first, then press.
// Confirm is edge-triggered (Story 6-2: the shell now holds `fire` every frame,
// so a multi-frame tap must register as one letter, not many).
function enter(s: GameState, offset: number): GameState {
  for (let i = 0; i < offset; i++) s = spin(s, 1)
  s = neutral(s) // release between confirms
  return fire(s)
}

const fullBoard = (): TableRow[] =>
  Array.from({ length: 10 }, (_, i) => ({ name: `E${i}`, score: (10 - i) * 1000, level: 1 }))

describe('highscore entry — letter cycling (A..Z, wrap, sign-based ±1)', () => {
  // AC3: spin>0 rotates the current letter forward.
  it('spin>0 advances the current letter A -> B', () => {
    expect(entryOf(spin(entryState({ currentLetter: 'A' }), 1))?.currentLetter).toBe('B')
  })

  // AC3 / 4-2 parity: one step per spin regardless of magnitude (sign-based).
  it('advances by exactly one regardless of magnitude (sign-based granularity)', () => {
    expect(entryOf(spin(entryState({ currentLetter: 'A' }), 5))?.currentLetter).toBe('B')
  })

  // AC3: wrap DOWN — A spun backward becomes Z.
  it('spin<0 from A wraps DOWN to Z', () => {
    expect(entryOf(spin(entryState({ currentLetter: 'A' }), -1))?.currentLetter).toBe('Z')
  })

  // AC3: wrap UP — Z spun forward becomes A.
  it('spin>0 from Z wraps UP to A', () => {
    expect(entryOf(spin(entryState({ currentLetter: 'Z' }), 1))?.currentLetter).toBe('A')
  })

  // AC3: spinning only cycles the letter — it never confirms.
  it('spinning does not confirm a letter (charIndex/initials unchanged, still in entry)', () => {
    const out = spin(entryState({ currentLetter: 'A' }), 1)
    expect(entryOf(out)?.charIndex).toBe(0)
    expect(entryOf(out)?.initials).toBe('')
    expect(modeOf(out)).toBe('highscore')
  })
})

describe('highscore entry — confirming letters with fire', () => {
  // AC3: fire appends the current letter, advances charIndex, resets letter to A.
  it('fire confirms the current letter: appends, advances charIndex, resets currentLetter to A', () => {
    const out = fire(entryState({ currentLetter: 'A', charIndex: 0, initials: '' }))
    expect(entryOf(out)?.initials).toBe('A')
    expect(entryOf(out)?.charIndex).toBe(1)
    expect(entryOf(out)?.currentLetter).toBe('A') // reset for the next position
    expect(modeOf(out)).toBe('highscore')
  })

  // AC3: three discrete presses accumulate three distinct letters; the letter
  // resets between positions so each is chosen independently.
  it('accumulates distinct letters across discrete fire presses', () => {
    let s = entryState({ table: [] })
    s = enter(s, 2) // 'C'
    expect(entryOf(s)?.initials).toBe('C')
    expect(entryOf(s)?.charIndex).toBe(1)
    s = enter(s, 0) // 'A'
    expect(entryOf(s)?.initials).toBe('CA')
    expect(entryOf(s)?.charIndex).toBe(2)
    expect(modeOf(s)).toBe('highscore') // 2 of 3 — not done yet
  })

  // TEA decision: fire-only confirm. `start` is inert during entry, so the
  // gameover->highscore start edge cannot carry over into a confirmation.
  it('start is INERT during entry — it does NOT confirm a letter', () => {
    const out = start(entryState({ currentLetter: 'A', charIndex: 0, initials: '' }))
    expect(entryOf(out)?.charIndex).toBe(0)
    expect(entryOf(out)?.initials).toBe('')
    expect(modeOf(out)).toBe('highscore')
  })

  // Guard: neutral input is a no-op.
  it('neutral input leaves the entry untouched', () => {
    const out = neutral(entryState({ currentLetter: 'B', charIndex: 1, initials: 'A' }))
    expect(entryOf(out)?.initials).toBe('A')
    expect(entryOf(out)?.charIndex).toBe(1)
    expect(entryOf(out)?.currentLetter).toBe('B')
    expect(modeOf(out)).toBe('highscore')
  })
})

describe('highscore entry — completion inserts and returns to attract', () => {
  // AC3 + AC6: after the 3rd confirm, insert {name, score, level} and -> attract,
  // entry cleared to null.
  it('after the 3rd confirmed initial: inserts the entry, -> attract, entry cleared', () => {
    let s = entryState({ score: 1234, level: 7, table: [] })
    s = enter(s, 2) // C
    s = enter(s, 0) // A
    s = enter(s, 1) // B -> completion
    expect(modeOf(s)).toBe('attract')
    expect(entryOf(s)).toBeNull()
    const table = tableOf(s)
    expect(table).toHaveLength(1)
    expect(table[0].name).toBe('CAB')
    expect(table[0].score).toBe(1234)
    expect(table[0].level).toBe(7)
  })

  // AC1 + AC3: the completed entry is inserted into an existing board in order.
  it('inserts the completed entry into an existing board in descending order', () => {
    const existing: TableRow[] = [
      { name: 'ZZZ', score: 9000, level: 9 },
      { name: 'YYY', score: 100, level: 1 },
    ]
    let s = entryState({ score: 5000, level: 4, table: existing })
    s = enter(s, 0); s = enter(s, 0); s = enter(s, 0) // 'AAA' (three discrete taps)
    expect(modeOf(s)).toBe('attract')
    expect(tableOf(s).map((e) => e.name)).toEqual(['ZZZ', 'AAA', 'YYY'])
    expect(tableOf(s).map((e) => e.score)).toEqual([9000, 5000, 100])
  })

  // AC5 (purity): core cannot call Date — the inserted entry carries no date.
  it('does not stamp a date on the inserted entry (core is pure)', () => {
    let s = entryState({ score: 1, level: 1, table: [] })
    s = enter(s, 0); s = enter(s, 0); s = enter(s, 0)
    expect(tableOf(s)[0].date).toBeUndefined()
  })

  // AC3: completion fires only on the 3rd confirm, not before.
  it('does not complete prematurely: after 2 confirms it stays in entry, board untouched', () => {
    let s = entryState({ score: 1234, level: 7, table: [] })
    s = enter(s, 0); s = enter(s, 0) // only 2 (each a discrete tap)
    expect(modeOf(s)).toBe('highscore')
    expect(entryOf(s)?.charIndex).toBe(2)
    expect(tableOf(s)).toHaveLength(0)
  })
})

describe('gameover -> qualify routing', () => {
  // AC4: qualifying gameover+start enters 'highscore' with a FRESH entry — the
  // start press must NOT have confirmed the first initial.
  it('gameover + start with a qualifying score enters highscore with a fresh entry (no auto-confirm)', () => {
    const out = start(gameoverState(5000, [])) // empty board, positive score qualifies
    expect(modeOf(out)).toBe('highscore')
    const e = entryOf(out)
    expect(e).not.toBeNull()
    expect(e?.initials).toBe('')
    expect(e?.charIndex).toBe(0)
    expect(e?.currentLetter).toBe('A')
  })

  // AC4 + carry-over hazard: the start edge that enters highscore does not carry
  // over; a separate fire press is required to confirm the first initial.
  it('requires a fresh fire press to confirm the first initial (start did not carry over)', () => {
    const entered = start(gameoverState(5000, [])) // gameover -> highscore (charIndex 0)
    expect(entryOf(entered)?.charIndex).toBe(0)
    const confirmed = fire(entered) // a FRESH press confirms letter 0
    expect(entryOf(confirmed)?.charIndex).toBe(1)
    expect(entryOf(confirmed)?.initials).toBe('A')
  })

  // AC4: non-qualifying gameover+start goes straight to attract (4-2 preserved).
  it('gameover + start with a NON-qualifying score goes straight to attract, no entry begun', () => {
    const out = start(gameoverState(100, fullBoard())) // 100 < lowest board score (1000)
    expect(modeOf(out)).toBe('attract')
    expect(entryOf(out)).toBeNull()
  })

  // AC4 + strict full-board boundary: score equal to the 10th does not qualify.
  it('gameover + start with a full board and score EQUAL to the lowest does NOT qualify', () => {
    const out = start(gameoverState(1000, fullBoard())) // equals the lowest board entry
    expect(modeOf(out)).toBe('attract')
    expect(entryOf(out)).toBeNull()
  })

  // Guard: gameover without start does not transition.
  it('gameover without start stays in gameover', () => {
    expect(modeOf(neutral(gameoverState(5000, [])))).toBe('gameover')
  })
})

describe('highscore entry — determinism, purity, RNG', () => {
  // AC5: deterministic — identical (state, input, dt) -> identical result.
  it('is deterministic: identical (state, input, dt) yields identical mode/entry/table/rng', () => {
    const a = fire(entryState({ seed: 99 }))
    const b = fire(entryState({ seed: 99 }))
    expect(modeOf(a)).toBe(modeOf(b))
    expect(entryOf(a)).toEqual(entryOf(b))
    expect(tableOf(a)).toEqual(tableOf(b))
    expect(a.rng).toEqual(b.rng)
  })

  // AC5: the entry machine never consumes the seeded RNG.
  it('entry steps never consume the RNG (spin and fire leave rng untouched)', () => {
    const base = entryState({ seed: 7 })
    const rngBefore = { ...base.rng }
    expect(spin(base, 1).rng).toEqual(rngBefore)
    expect(fire(base).rng).toEqual(rngBefore)
  })

  // AC5 + migration guard: cloneState must deep-clone the new `entry` field, or
  // stepGame would mutate the caller's entry object. The original must be intact.
  it('does not mutate the input state (cloneState must clone entry)', () => {
    const base = entryState({ initials: 'A', charIndex: 1, currentLetter: 'A' })
    const snapshot = JSON.parse(JSON.stringify(entryOf(base)))
    fire(base)
    expect(entryOf(base)).toEqual(snapshot)
  })
})

describe('highscore entry — fire is edge-triggered, not level-triggered (Story 6-2 regression)', () => {
  // Story 6-2 removed the shell AUTOFIRE_MS throttle, so the shell now delivers
  // `fire` on EVERY frame the button is held. A real button tap spans several
  // frames, so a LEVEL-triggered confirm registers one tap as many confirms and
  // marches through all three initials. Confirm must fire on the RISING EDGE:
  // one tap = one letter, however long the button is held. This is exactly the
  // 4-3 design intent ("a fresh fire press is required per letter"), now enforced.

  // A single tap held for several frames confirms exactly ONE letter.
  it('confirms exactly one letter for a single multi-frame tap (held fire)', () => {
    let s = entryState({ table: [] }) // fresh entry at A, charIndex 0
    for (let i = 0; i < 6; i++) s = fire(s) // one tap, held 6 frames (never released)
    expect(entryOf(s)?.charIndex).toBe(1) // exactly one confirm, not six
    expect(entryOf(s)?.initials).toBe('A')
    expect(modeOf(s)).toBe('highscore') // not marched through to completion
  })

  // The reported bug: at gameover a mouse click sets BOTH start and fire; the
  // click enters highscore, then the still-held button must NOT auto-fill "AAA".
  it('does not auto-fill initials when the restart click is held into highscore', () => {
    // A mouse restart click delivers start + fire together for the press duration.
    let s = stepGame(gameoverState(5000, []), { ...NEUTRAL, start: true, fire: true }, DT)
    expect(modeOf(s)).toBe('highscore') // entered initials entry
    for (let i = 0; i < 6; i++) s = stepGame(s, { ...NEUTRAL, fire: true }, DT) // button still down
    expect(modeOf(s)).toBe('highscore') // still entering — NOT bounced to attract
    expect(entryOf(s)).not.toBeNull()
    expect(tableOf(s)).toHaveLength(0) // nothing auto-inserted
  })

  // Guard (stays green after the fix): a held tap followed by a release confirms
  // one letter per tap, so genuine three-tap entry still completes correctly.
  it('confirms one letter per tap when the button is released between taps', () => {
    let s = entryState({ score: 1234, level: 7, table: [] })
    for (let i = 0; i < 3; i++) {
      s = fire(s) // tap...
      s = fire(s) // ...still held — must not double-confirm
      s = neutral(s) // release before the next tap
    }
    expect(modeOf(s)).toBe('attract') // exactly three confirms completed it
    expect(entryOf(s)).toBeNull()
    expect(tableOf(s)).toHaveLength(1)
    expect(tableOf(s)[0].name).toBe('AAA')
  })
})
