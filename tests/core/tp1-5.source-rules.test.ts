// tests/core/tp1-5.source-rules.test.ts
//
// RED suite for story tp1-5 — the source-level rules. Two jobs:
//
//   1. The lang-review checklist (.pennyfarthing/gates/lang-review/typescript.md)
//      check #3: "Missing exhaustiveness check in switch/case on enum (no
//      `default: assertNever(x)`)". speedFor() switches on EnemyKind and guards its
//      default with a RUNTIME throw, which is not the same thing — the compiler
//      says nothing when a new kind is added, and the throw only fires once a
//      player is already in the game.
//
//   2. AC-5 and CLAUDE.md's citation convention: a finding this story FIXES must be
//      stamped `remediated_by`, or the gate re-opens its `ours` quote against a
//      working tree where the bug no longer exists and goes red on the next story
//      with a confusing "does not match verbatim".
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (rel: string): string => readFileSync(join(repoRoot, rel), 'utf8')

/** Strip comments, so prose ABOUT a pattern cannot satisfy — or trip — a grep. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

interface Finding {
  id: string
  remediated_by?: string
  ours: { file: string, line: number, verbatim: string } | null
}

function findings(file: string): Finding[] {
  const raw: unknown = JSON.parse(read(`docs/audit/findings/${file}`))
  return (Array.isArray(raw) ? raw : (raw as { findings: Finding[] }).findings)
}

/** Narrow away an `undefined` that a failed lookup would otherwise carry into the assertion. */
function must<T>(v: T | undefined, what: string): T {
  if (v === undefined) throw new Error(what)
  return v
}

describe('tp1-5 — speedFor is exhaustive at COMPILE time (lang-review #3)', () => {
  it('guards its default with assertNever, not only a runtime throw', () => {
    // This story is the reason the rule matters here: the interpreter's own comment
    // (interpreter.ts:116-117) says a sixth EnemyKind "would otherwise fall out of
    // here as `undefined` and turn every speed — and then every depth — into NaN,
    // silently", and then leaves a `throw` as the guard. A throw is a runtime
    // tripwire. assertNever is a compile error, which is the one that arrives before
    // the code ships.
    const src = stripComments(read('src/core/enemies/interpreter.ts'))
    const speedFor = /function speedFor\b[\s\S]*?\n}/.exec(src)?.[0]
    expect(speedFor, 'speedFor() not found in interpreter.ts').toBeDefined()
    expect(speedFor).toMatch(/assertNever/)
  })

  it('the assertNever helper actually refuses a non-never argument', () => {
    // A helper that takes `unknown` and throws is not an exhaustiveness check — it
    // is the runtime throw wearing a better name, and it would let a sixth kind
    // compile. The parameter must be typed `never`.
    const src = stripComments(read('src/core/enemies/interpreter.ts'))
    const local = /function assertNever\s*\(([^)]*)\)/.exec(src)?.[1]
    if (local !== undefined) {
      expect(local).toMatch(/:\s*never\b/)
      return
    }
    // Imported instead? Then find it where it lives and check it there.
    const from = must(
      /import\s*\{[^}]*\bassertNever\b[^}]*\}\s*from\s*'([^']+)'/.exec(src)?.[1],
      'assertNever is neither defined in nor imported into interpreter.ts',
    )
    expect(from, 'assertNever must come from a relative module inside src/').toMatch(/^\./)
    const rel = join('src/core/enemies', from).replace(/\.js$/, '.ts')
    const helper = must(
      /function assertNever\s*\(([^)]*)\)/.exec(stripComments(read(rel)))?.[1],
      `assertNever not found in ${rel}`,
    )
    expect(helper).toMatch(/:\s*never\b/)
  })
})

describe('tp1-5 — the findings it closes are stamped remediated_by (AC-5)', () => {
  // CLAUDE.md, "The fidelity audit and its citation gate": fixing a finding makes
  // its own `ours` quote false — the quote describes the bug you just removed. The
  // stamp is what keeps the quote as HISTORY instead of letting the checker re-open
  // it against a tree that has moved on.
  const CLOSED_BY_TP1_5 = ['W-009', 'W-023', 'W-026', 'W-027', 'W-032']

  it.each(CLOSED_BY_TP1_5)('%s is marked remediated_by tp1-5', (id) => {
    const f = must(
      findings('pair-1-alwelg-sim-enemies.json').find((x) => x.id === id),
      `${id} not found in pair-1-alwelg-sim-enemies.json`,
    )
    expect(f.remediated_by).toBe('tp1-5')
  })
})
