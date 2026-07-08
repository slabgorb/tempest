// tests/loop-extraction.test.ts
//
// SH-5 (ADR-0001) — tempest's migration guard for the game-loop extraction.
// Unlike its siblings, tempest does NOT retire its shell/loop.ts: its wrapper
// carries real extra duties (an injected, testable now() clock, per-sub-step
// GameEvent draining, first-sub-step-only input, per-sub-step mode transitions,
// guarded callbacks, getState()). AC-3 has it COMPOSE OVER the shared kernel —
// delegating the fixed-timestep accumulator arithmetic to advanceFixedSteps from
// @arcade/shared/loop — rather than keep its own duplicate. So this guard asserts
// the composition (the wrapper stays AND pulls the accumulator from the shared
// module), not a deletion. Pure fs/text, standalone-repo: reads only tempest's
// own files; the kernel's behavioural lock lives in arcade-shared/tests/loop.test.ts.

import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const path = (rel: string): string => join(root, rel)
const read = (rel: string): string => readFileSync(path(rel), 'utf8')

function walkTs(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...walkTs(full))
    else if (full.endsWith('.ts')) out.push(full)
  }
  return out
}
const someSrcImportsSharedLoop = (): boolean =>
  walkTs(path('src')).some((f) => readFileSync(f, 'utf8').includes('@arcade/shared/loop'))

describe('loop extraction — richer wrapper composes over @arcade/shared (SH-5, AC-3)', () => {
  it('pins @arcade/shared as a git-URL dependency', () => {
    expect(read('package.json')).toMatch(/"@arcade\/shared":\s*"github:slabgorb\/arcade-shared#/)
  })

  it('KEEPS its richer src/shell/loop.ts wrapper (it composes over the kernel, it is not retired)', () => {
    expect(
      existsSync(path('src/shell/loop.ts')),
      "tempest/src/shell/loop.ts must remain — it wraps the shared kernel with tempest's injected clock, event drain and mode transitions (SH-5 AC-3)",
    ).toBe(true)
  })

  it('composes over the shared kernel: some src file imports from @arcade/shared/loop', () => {
    expect(
      someSrcImportsSharedLoop(),
      'no src/*.ts imports @arcade/shared/loop — the wrapper still duplicates the accumulator instead of composing over the shared kernel',
    ).toBe(true)
  })
})
