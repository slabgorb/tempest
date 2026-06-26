// tests/core/events.test.ts
//
// RED-phase suite for Story 5-1 — "Pure-core game event channel". Major
// Hochstetter trusts NOTHING about a feature whose whole job is to feed the
// shell. These tests pin the STATIC contract that the downstream audio (5-2),
// wiring (5-5), and warp-crash cue (5-6) will compile against:
//
//   - the `GameEvent` discriminated union exists with the eight documented
//     variants and EXACTLY the documented payload fields (compile-time);
//   - a fresh `GameState` carries an empty `events: []` channel;
//   - the new channel does NOT smuggle impurity into core (no Date / random /
//     DOM / shell imports / debug code) — the hard architectural boundary.
//
// Nothing here exists yet: `src/core/events.ts` is absent and `GameState` has
// no `events` field, so the whole file fails to compile today (valid RED).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import type { GameEvent } from '../../src/core/events'
import { initialState } from '../../src/core/state'
import { playingState } from './helpers'

// One fixture per union member, in the documented shapes (context-story-5-1.md
// §Technical Approach). This array compiles ONLY if `GameEvent` declares each
// variant with these exact discriminants and field names — a renamed field or a
// missing member is a type error, not a silent pass.
const ALL_EVENTS: GameEvent[] = [
  { type: 'enemy-death', enemyType: 'flipper', lane: 4, depth: 0.5 },
  { type: 'player-grab', lane: 4, killedBy: 'flipper' },
  { type: 'fire', lane: 4, depth: 1 },
  { type: 'warp-spike-crash', lane: 4 },
  { type: 'level-clear', newLevel: 2 },
  { type: 'superzapper-activate', killCount: 3 },
  { type: 'player-spawn', lane: 4 },
  { type: 'player-death', cause: 'grab' },
]

// Exhaustive narrowing over the union: the `never` default fails to compile if a
// NINTH variant is ever added without updating callers, and each arm reads the
// variant's payload field — pinning `enemyType`, `killedBy`, `newLevel`,
// `killCount`, `cause`, `lane`, `depth` by name at type-check time.
function discriminant(e: GameEvent): string {
  switch (e.type) {
    case 'enemy-death':         return `${e.enemyType}@${e.lane},${e.depth}`
    case 'player-grab':         return `${e.killedBy}@${e.lane}`
    case 'fire':                return `${e.lane},${e.depth}`
    case 'warp-spike-crash':    return `${e.lane}`
    case 'level-clear':         return `${e.newLevel}`
    case 'superzapper-activate':return `${e.killCount}`
    case 'player-spawn':        return `${e.lane}`
    case 'player-death':        return e.cause
    default: {
      const _exhaustive: never = e
      return _exhaustive
    }
  }
}

describe('GameEvent — discriminated union (AC1)', () => {
  it('covers eight distinct, documented event types', () => {
    const kinds = ALL_EVENTS.map((e) => e.type)
    expect(new Set(kinds).size).toBe(8)
    expect(kinds).toEqual([
      'enemy-death', 'player-grab', 'fire', 'warp-spike-crash',
      'level-clear', 'superzapper-activate', 'player-spawn', 'player-death',
    ])
  })

  it('narrows by its `type` discriminant to the correct payload', () => {
    // Each arm must produce a non-empty description from the variant's own
    // fields — proves the discriminant actually narrows (no `any` leakage).
    for (const e of ALL_EVENTS) {
      expect(discriminant(e).length).toBeGreaterThan(0)
    }
    expect(discriminant({ type: 'player-death', cause: 'spike' })).toBe('spike')
    expect(discriminant({ type: 'superzapper-activate', killCount: 7 })).toBe('7')
  })

  it('admits all three documented player-death causes', () => {
    const causes: GameEvent[] = [
      { type: 'player-death', cause: 'grab' },
      { type: 'player-death', cause: 'pulse' },
      { type: 'player-death', cause: 'spike' },
    ]
    expect(causes.map(discriminant)).toEqual(['grab', 'pulse', 'spike'])
  })
})

describe('GameState event channel — initial state (AC2)', () => {
  it('a fresh game starts with an empty events array', () => {
    const s = initialState(1)
    expect(Array.isArray(s.events)).toBe(true)
    expect(s.events).toEqual([])
  })

  it('a mid-game playing state also starts with an empty events array', () => {
    expect(playingState(7).events).toEqual([])
  })

  it('distinct seeds both initialise an empty (not shared) events array', () => {
    const a = initialState(1)
    const b = initialState(2)
    expect(a.events).toEqual([])
    expect(b.events).toEqual([])
    expect(a.events).not.toBe(b.events) // separate arrays, no aliasing
  })
})

// --- Pure-core boundary guard (AC6 / AC7) ----------------------------------
//
// The event channel must remain DATA. Scan the core source the story touches
// for the forbidden non-determinism / IO tokens the CLAUDE.md boundary bans,
// and for debug residue in the new/extended files. `events.ts` does not exist
// yet, so reading it throws — which fails the suite until Dev creates it clean.
const read = (rel: string): string =>
  readFileSync(new URL(rel, import.meta.url), 'utf8')

const FORBIDDEN: ReadonlyArray<readonly [string, RegExp]> = [
  ['Math.random',            /\bMath\s*\.\s*random\b/],
  ['Date.now',               /\bDate\s*\.\s*now\b/],
  ['new Date',               /\bnew\s+Date\b/],
  ['performance.now',        /\bperformance\s*\.\s*now\b/],
  ['requestAnimationFrame',  /\brequestAnimationFrame\b/],
  ['document access',        /\bdocument\s*\./],
  ['window access',          /\bwindow\s*\./],
  ['shell import',           /from\s+['"][^'"]*shell/],
]

describe('pure-core boundary — event channel stays deterministic (AC6)', () => {
  for (const file of ['../../src/core/events.ts', '../../src/core/sim.ts', '../../src/core/state.ts']) {
    describe(file, () => {
      for (const [name, pattern] of FORBIDDEN) {
        it(`contains no ${name}`, () => {
          expect(read(file)).not.toMatch(pattern)
        })
      }
    })
  }
})

describe('no debug residue in the event channel (AC7)', () => {
  for (const file of ['../../src/core/events.ts', '../../src/core/state.ts']) {
    it(`${file} has no console.log or debugger statements`, () => {
      const src = read(file)
      expect(src).not.toMatch(/console\s*\.\s*log/)
      expect(src).not.toMatch(/\bdebugger\b/)
    })
  }
})
