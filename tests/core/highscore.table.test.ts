// tests/core/highscore.table.test.ts
//
// RED-phase suite for Story 4-3, Part A: the PURE high-score TABLE helpers
// `qualifiesForHighScore` and `insertHighScore`. These operate on the
// HighScoreEntry / HighScoreTable types from src/core/highscore.ts (shipped by
// 4-4) and are expected to live in that same module (colocated with the types
// they manipulate — see TEA deviation note in the session file).
//
// The helpers do NOT exist pre-GREEN, so a NAMESPACE import is used: the module
// resolves cleanly, the missing members read as `undefined`, and every test that
// calls one fails LOCALLY with "is not a function" — a clean per-test
// missing-feature RED, not a module-load crash. (A bare `import { x }` of an
// absent named export can crash the whole file under native ESM; the namespace
// import avoids that.)
//
// TEA decisions pinned here (logged as deviations in .session/4-3-session.md):
//  - MAX_HIGH_SCORES = 10 (arcade convention; the constant itself lives in
//    rules.ts — hardcoded locally here to avoid coupling to it during RED).
//  - Qualify, table NOT full (< 10 entries): the score must be STRICTLY POSITIVE
//    (> 0). A score of 0 does NOT qualify, even on an empty board. (Refines the
//    plan's AC2, which said "true if length < MAX" unconditionally.)
//  - Qualify, table FULL (== 10 entries): the score must be STRICTLY GREATER than
//    the lowest entry. A score EQUAL to the 10th does NOT qualify.
//  - Tie placement on insert: a new entry sorts AFTER existing entries of equal
//    score (existing holders keep the higher rank).
//  - Truncation: after insert the table is sorted descending and truncated to
//    MAX_HIGH_SCORES; length never exceeds 10 and the lowest overflow is dropped.
//  - insertHighScore is pure: it returns a NEW array and does not mutate inputs.
import { describe, it, expect } from 'vitest'
import type { HighScoreEntry, HighScoreTable } from '../../src/core/highscore'
import * as highscore from '../../src/core/highscore'

const MAX = 10 // MAX_HIGH_SCORES — local copy so RED does not depend on rules.ts

type QualifyFn = (table: HighScoreTable, score: number) => boolean
type InsertFn = (table: HighScoreTable, entry: HighScoreEntry) => HighScoreTable

// Absent pre-GREEN -> `undefined`. Calling either throws "is not a function"
// inside the test that uses it: a clean missing-feature RED.
const qualifiesForHighScore = (highscore as unknown as { qualifiesForHighScore: QualifyFn }).qualifiesForHighScore
const insertHighScore = (highscore as unknown as { insertHighScore: InsertFn }).insertHighScore

const entry = (name: string, score: number, level = 1): HighScoreEntry => ({ name, score, level })

// A descending table of `n` entries, scores n*100 .. 100 (lowest = 100).
const tableOf = (n: number): HighScoreTable =>
  Array.from({ length: n }, (_, i) => entry(`E${i}`, (n - i) * 100))

describe('qualifiesForHighScore — partial/empty board (fewer than 10 entries)', () => {
  // AC2: returns true when there is still room on the board for a real score.
  it('qualifies any strictly-positive score when the table is empty', () => {
    expect(qualifiesForHighScore([], 1)).toBe(true)
    expect(qualifiesForHighScore([], 5000)).toBe(true)
  })

  // TEA decision: a 0 score never makes the board, even with empty slots.
  it('does NOT qualify a score of 0, even on an empty board', () => {
    expect(qualifiesForHighScore([], 0)).toBe(false)
  })

  // AC2: room remains -> any positive score qualifies, even below every entry.
  it('qualifies a positive score below every existing entry while the table is not full', () => {
    expect(qualifiesForHighScore(tableOf(3), 50)).toBe(true) // 300/200/100, not full
  })

  it('still rejects a 0 score on a partial board', () => {
    expect(qualifiesForHighScore(tableOf(3), 0)).toBe(false)
  })
})

describe('qualifiesForHighScore — full board (exactly 10 entries)', () => {
  // AC2: must beat the lowest entry to displace it.
  it('qualifies a score STRICTLY GREATER than the lowest entry', () => {
    expect(qualifiesForHighScore(tableOf(MAX), 101)).toBe(true) // lowest = 100
  })

  // TEA decision: strict boundary — equal to the 10th does NOT qualify.
  it('does NOT qualify a score EQUAL to the lowest entry', () => {
    expect(qualifiesForHighScore(tableOf(MAX), 100)).toBe(false)
  })

  it('does NOT qualify a score below the lowest entry', () => {
    expect(qualifiesForHighScore(tableOf(MAX), 99)).toBe(false)
  })
})

describe('insertHighScore — ordering, ties, truncation, purity', () => {
  // AC1: an entry is inserted into the table.
  it('inserts into an empty table', () => {
    const out = insertHighScore([], entry('AAA', 500))
    expect(out.map((e) => e.name)).toEqual(['AAA'])
    expect(out).toHaveLength(1)
  })

  // AC1: inserted in descending-score order.
  it('keeps the table sorted descending by score after insert', () => {
    const out = insertHighScore([entry('A', 300), entry('B', 100)], entry('X', 200))
    expect(out.map((e) => e.score)).toEqual([300, 200, 100])
    expect(out.map((e) => e.name)).toEqual(['A', 'X', 'B'])
  })

  // AC1 + TEA tie decision: a tied new entry sorts AFTER the equal existing one.
  it('places a tied new entry AFTER existing entries of equal score', () => {
    const out = insertHighScore(
      [entry('A', 300), entry('B', 200), entry('C', 100)],
      entry('X', 200), // ties with B
    )
    expect(out.map((e) => e.name)).toEqual(['A', 'B', 'X', 'C'])
  })

  // AC1: truncate to MAX_HIGH_SCORES; the new lowest overflow is dropped.
  it('truncates to MAX_HIGH_SCORES (10), dropping the overflow on a high insert', () => {
    const out = insertHighScore(tableOf(MAX), entry('TOP', 5000))
    expect(out).toHaveLength(MAX)
    expect(out[0].name).toBe('TOP')
    expect(out.map((e) => e.score)).not.toContain(100) // old lowest dropped
  })

  // Edge: a sub-board score passed to insert is dropped by truncation (it must
  // not displace anyone). Mirrors the strict full-board qualify boundary.
  it('drops a new entry whose score is below a full board (no displacement)', () => {
    const t = tableOf(MAX) // lowest = 100
    const out = insertHighScore(t, entry('LOW', 50))
    expect(out).toHaveLength(MAX)
    expect(out.map((e) => e.name)).not.toContain('LOW')
    expect(out.map((e) => e.score)).toEqual(t.map((e) => e.score)) // top-10 unchanged
  })

  // AC5: pure helper — does not mutate its inputs.
  it('is pure: does not mutate the input table', () => {
    const t = [entry('A', 300), entry('B', 100)]
    const snapshot = JSON.parse(JSON.stringify(t))
    insertHighScore(t, entry('X', 200))
    expect(t).toEqual(snapshot)
    expect(t).toHaveLength(2)
  })
})
