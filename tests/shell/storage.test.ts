// tests/shell/storage.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// storage.ts is the SHELL persistence seam (localStorage IO). It must import the
// table TYPES from core/ — never the reverse — so the pure core (story 4-3's
// high-score state machine) can depend on the shape without importing shell/.
// This type-only import documents that contract; esbuild erases it at runtime,
// so the RED failure below comes from the (not-yet-implemented) shell module.
import type { HighScoreEntry, HighScoreTable } from '../../src/core/highscore'
import { loadHighScores, saveHighScores } from '../../src/shell/storage'
// Read the shell source as text (Vite `?raw`, no Node `fs` types) for the
// signature-level AC check below — the same browser-pure idiom as events.test.ts.
import storageSrc from '../../src/shell/storage.ts?raw'

// The persisted key is part of the public contract (other code / future stories
// read this same key), so we assert the literal rather than re-importing it.
const STORAGE_KEY = 'tempest-high-scores'

// A representative table: descending by score, mixing entries WITH and WITHOUT
// the optional `date` to exercise `date?`.
const SAMPLE_TABLE: HighScoreTable = [
  { name: 'AAA', score: 50000, level: 9, date: '2026-06-26T00:00:00.000Z' },
  { name: 'BOB', score: 30000, level: 5 },
  { name: 'CDE', score: 10000, level: 2, date: '2026-06-25T12:00:00.000Z' },
]

// ---- Fake Storage (node test env has no localStorage) -----------------------

// A minimal in-memory Storage. Cast to Storage because we don't need the index
// signature for these tests.
function makeFakeStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map<string, string>(Object.entries(initial))
  const storage = {
    get length(): number {
      return map.size
    },
    clear(): void {
      map.clear()
    },
    getItem(key: string): string | null {
      return map.has(key) ? (map.get(key) as string) : null
    },
    key(index: number): string | null {
      return Array.from(map.keys())[index] ?? null
    },
    removeItem(key: string): void {
      map.delete(key)
    },
    setItem(key: string, value: string): void {
      map.set(key, String(value))
    },
  }
  return storage as unknown as Storage
}

// A Storage whose setItem always throws, simulating a full quota. The error is a
// plain Error (not a DOMException) on purpose: the impl must catch broadly.
function makeQuotaStorage(): Storage {
  const storage = makeFakeStorage()
  storage.setItem = () => {
    throw new Error('QuotaExceededError: storage is full')
  }
  return storage
}

// Install / remove globalThis.localStorage deterministically. Using
// defineProperty (configurable) lets us swap between a value and a throwing
// getter across tests, and lets afterEach delete it cleanly.
function setLocalStorage(value: Storage | undefined): void {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value,
  })
}

// Simulates private-browsing / sandboxed iframes where even *accessing*
// localStorage throws (SecurityError) before you can call a method on it.
function setThrowingLocalStorage(): void {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get(): never {
      throw new Error('SecurityError: localStorage access denied')
    },
  })
}

beforeEach(() => {
  // Graceful-degradation paths are allowed to log; keep test output clean. We do
  // not ASSERT on logging (impl may use warn/error/none) — only on behaviour.
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage
  vi.restoreAllMocks()
})

// ---- loadHighScores ---------------------------------------------------------

describe('loadHighScores', () => {
  // AC1 + AC2: absent key → empty table (a fresh machine has no scores yet).
  it('returns [] when no high-score key is present', () => {
    setLocalStorage(makeFakeStorage())
    expect(loadHighScores()).toEqual([])
  })

  // AC1: a valid stored table round-trips back to the same value.
  it('parses and returns a valid stored table', () => {
    setLocalStorage(makeFakeStorage({ [STORAGE_KEY]: JSON.stringify(SAMPLE_TABLE) }))
    expect(loadHighScores()).toEqual(SAMPLE_TABLE)
  })

  // AC4: entry shape is {name, score, level, date?} — `date` is optional and its
  // absence must survive the load (not become null / a placeholder).
  it('preserves entry shape including the optional date field', () => {
    setLocalStorage(makeFakeStorage({ [STORAGE_KEY]: JSON.stringify(SAMPLE_TABLE) }))
    const table = loadHighScores()

    expect(table).toHaveLength(3)
    const [first, second] = table as HighScoreEntry[]

    expect(first).toMatchObject({ name: 'AAA', score: 50000, level: 9 })
    expect(first.date).toBe('2026-06-26T00:00:00.000Z')

    expect(second).toMatchObject({ name: 'BOB', score: 30000, level: 5 })
    expect(second.date).toBeUndefined()
    expect('date' in second).toBe(false)
  })

  // AC2: corrupt JSON must fail safe (return []) and never throw.
  it('returns [] for corrupt JSON without throwing', () => {
    setLocalStorage(makeFakeStorage({ [STORAGE_KEY]: '{ this is not: valid json' }))
    expect(() => loadHighScores()).not.toThrow()
    expect(loadHighScores()).toEqual([])
  })

  // AC2: valid JSON that is NOT an array of entries is still malformed for our
  // table contract → fail safe to [].
  it('returns [] when stored JSON is valid but not a table array', () => {
    for (const malformed of ['{"foo":"bar"}', 'null', '42', '"a string"', 'true']) {
      setLocalStorage(makeFakeStorage({ [STORAGE_KEY]: malformed }))
      expect(loadHighScores()).toEqual([])
    }
  })

  // AC2: localStorage absent (e.g. SSR / disabled) → [] and no throw.
  it('returns [] when localStorage is undefined without throwing', () => {
    setLocalStorage(undefined)
    expect(() => loadHighScores()).not.toThrow()
    expect(loadHighScores()).toEqual([])
  })

  // AC2: accessing localStorage itself throws (private browsing) → [] and no throw.
  it('returns [] when accessing localStorage throws without throwing', () => {
    setThrowingLocalStorage()
    expect(() => loadHighScores()).not.toThrow()
    expect(loadHighScores()).toEqual([])
  })
})

// ---- saveHighScores ---------------------------------------------------------

describe('saveHighScores', () => {
  // AC1: writes the table as JSON under the agreed key.
  it('writes the table as JSON under the tempest-high-scores key', () => {
    const fake = makeFakeStorage()
    setLocalStorage(fake)

    saveHighScores(SAMPLE_TABLE)

    const raw = fake.getItem(STORAGE_KEY)
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw as string)).toEqual(SAMPLE_TABLE)
  })

  // AC1: save → load is a faithful round-trip (the two halves agree on format).
  it('round-trips: a saved table loads back equal', () => {
    setLocalStorage(makeFakeStorage())
    saveHighScores(SAMPLE_TABLE)
    expect(loadHighScores()).toEqual(SAMPLE_TABLE)
  })

  // Edge: an empty table is a legitimate value to persist.
  it('persists an empty table without throwing', () => {
    setLocalStorage(makeFakeStorage())
    expect(() => saveHighScores([])).not.toThrow()
    expect(loadHighScores()).toEqual([])
  })

  // AC2: quota exceeded on write → swallow, do not crash the game.
  it('does not throw when the storage quota is exceeded', () => {
    setLocalStorage(makeQuotaStorage())
    expect(() => saveHighScores(SAMPLE_TABLE)).not.toThrow()
  })

  // AC2: localStorage absent on write → no-op, no throw.
  it('does not throw when localStorage is undefined', () => {
    setLocalStorage(undefined)
    expect(() => saveHighScores(SAMPLE_TABLE)).not.toThrow()
  })

  // AC2: accessing localStorage throws on write → no throw.
  it('does not throw when accessing localStorage throws', () => {
    setThrowingLocalStorage()
    expect(() => saveHighScores(SAMPLE_TABLE)).not.toThrow()
  })
})

// ---- loadHighScores: per-entry validation guard (Story 5-8) -----------------
//
// Pre-5-8, loadHighScores validates ARRAY SHAPE only (Array.isArray) and then
// `return parsed as HighScoreTable` — a corrupt-but-array payload like `[{}]` or
// `[{name:9,score:'x'}]` sails straight through to the renderer, which reads
// entry.name / entry.score / entry.level (render.ts:394-395) and prints garbage.
// Story 5-8 adds a per-entry `isHighScoreEntry` guard so only well-formed rows
// survive (bad rows dropped; `[]` if none).
//
// TEA contract pinned here ("well-formed" == correct field TYPES):
//   - name  : typeof === 'string'
//   - score : typeof === 'number'
//   - level : typeof === 'number'
//   - date  : optional; survivors keep it (the existing "preserves entry shape"
//             test forbids reconstructing entries with a spurious `date` key, so
//             the guard must FILTER, not rebuild).
// NOT pinned: finiteness of score/level. NaN cannot survive JSON.parse, so the
// only reachable non-finite case is numeric overflow (1e999 → Infinity); that
// edge is raised as a non-blocking Delivery Finding rather than constrained here,
// keeping the guard contract exactly matching the story's type-shape examples.
describe('loadHighScores — per-entry validation guard (Story 5-8)', () => {
  const loadFrom = (payload: unknown): HighScoreTable => {
    setLocalStorage(makeFakeStorage({ [STORAGE_KEY]: JSON.stringify(payload) }))
    return loadHighScores()
  }

  // The two corruption shapes named verbatim in the story.
  it('drops an empty-object entry ([{}] → [])', () => {
    expect(loadFrom([{}])).toEqual([])
  })

  it('drops a wrong-typed entry ([{name:9, score:"x"}] → [])', () => {
    expect(loadFrom([{ name: 9, score: 'x' }])).toEqual([])
  })

  // Each required field, individually missing → entry is not well-formed.
  it('drops entries missing any required field (name | score | level)', () => {
    expect(loadFrom([{ score: 100, level: 3 }])).toEqual([]) // no name
    expect(loadFrom([{ name: 'ABC', level: 3 }])).toEqual([]) // no score
    expect(loadFrom([{ name: 'ABC', score: 100 }])).toEqual([]) // no level
  })

  // Each required field, individually wrong-typed → dropped.
  it('drops entries whose required fields have the wrong type', () => {
    expect(loadFrom([{ name: 9, score: 100, level: 3 }])).toEqual([]) // name not string
    expect(loadFrom([{ name: 'ABC', score: '100', level: 3 }])).toEqual([]) // score not number
    expect(loadFrom([{ name: 'ABC', score: 100, level: '3' }])).toEqual([]) // level not number
  })

  // Array members that are not objects at all.
  it('drops non-object array members (null, number, string, boolean, array)', () => {
    expect(loadFrom([null, 42, 'AAA', true, []])).toEqual([])
  })

  // The renderer never sees a malformed row: an all-garbage array collapses to [].
  it('returns [] when every entry is malformed', () => {
    const garbage: unknown[] = [
      {},
      { name: 9, score: 'x' },
      { name: 'ABC', score: 100 },
      { score: 100, level: 3 },
      null,
      42,
      'AAA',
      true,
      [],
    ]
    expect(loadFrom(garbage)).toEqual([])
  })

  // Partial corruption: keep ONLY the well-formed rows, in order, with the
  // optional `date` preserved on survivors.
  it('keeps only the well-formed rows from a mixed array, preserving order and date', () => {
    const mixed: unknown[] = [
      { name: 'AAA', score: 50000, level: 9, date: '2026-06-26T00:00:00.000Z' }, // keep
      {}, // drop
      { name: 'BOB', score: 30000, level: 5 }, // keep
      { name: 9, score: 'x' }, // drop
      null, // drop
      { name: 'CDE', score: 10000, level: 2 }, // keep
    ]
    expect(loadFrom(mixed)).toEqual([
      { name: 'AAA', score: 50000, level: 9, date: '2026-06-26T00:00:00.000Z' },
      { name: 'BOB', score: 30000, level: 5 },
      { name: 'CDE', score: 10000, level: 2 },
    ])
  })

  // The guard must not OVER-reject: a fully well-formed table returns unchanged.
  it('returns a fully well-formed table unchanged', () => {
    expect(loadFrom(SAMPLE_TABLE)).toEqual(SAMPLE_TABLE)
  })

  // Fail-safe parity with corrupt JSON: a garbage array must never throw.
  it('never throws on a garbage array payload', () => {
    expect(() => loadFrom([{}, null, { name: 1 }])).not.toThrow()
  })
})

// ---- saveHighScores: readonly parameter (Story 5-8) -------------------------
//
// Story 5-8 widens the parameter to `readonly HighScoreEntry[]` (saveHighScores
// never mutates its input). Two enforcement layers, because the test runner
// (esbuild) strips types while the type runner (`tsc --noEmit`) does not:
//   1. compile-time — the `readonlyTable` annotation below only type-checks once
//      the signature is widened (a `readonly[]` is NOT assignable to a mutable
//      `[]` parameter), so this is the real gate under `tsc --noEmit`.
//   2. source-text — the declared signature literally names `readonly`, giving the
//      type-stripped vitest run its own RED signal for the AC.
describe('saveHighScores — readonly parameter (Story 5-8)', () => {
  it('accepts a readonly HighScoreEntry[] and round-trips it', () => {
    setLocalStorage(makeFakeStorage())
    const readonlyTable: readonly HighScoreEntry[] = SAMPLE_TABLE
    saveHighScores(readonlyTable)
    expect(loadHighScores()).toEqual(SAMPLE_TABLE)
  })

  it('does not mutate a frozen input table', () => {
    setLocalStorage(makeFakeStorage())
    const frozen: readonly HighScoreEntry[] = Object.freeze(SAMPLE_TABLE.map((e) => ({ ...e })))
    expect(() => saveHighScores(frozen)).not.toThrow()
    expect(frozen).toEqual(SAMPLE_TABLE)
  })

  it('declares its parameter `readonly` in the source signature', () => {
    expect(storageSrc).toMatch(/export function saveHighScores\s*\([^)]*\breadonly\b[^)]*\)/)
  })
})
