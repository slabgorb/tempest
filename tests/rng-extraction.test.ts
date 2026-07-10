// tests/rng-extraction.test.ts
//
// SH-3 (ADR-0001) — tempest's migration guard for the RNG extraction. THE
// contract-flip case: tempest alone shipped the IMMUTABLE form (makeRng /
// rngNext -> {value, rng}); the extraction settles on the MUTABLE contract
// (createRng / nextFloat -> number / nextInt), so tempest's ~16 call-sites move
// from `const { value, rng } = rngNext(state.rng)` threading to a mutable cursor.
// The local src/core/rng.ts is retired and consumed from @arcade/shared/rng at a
// pinned git-URL ref.
//
// The old tests/core/rng.test.ts encodes the IMMUTABLE contract (notably "does
// not mutate the input state") — that behaviour is now intentionally reversed,
// so Dev DELETES that suite rather than re-pointing it; its determinism coverage
// is preserved by the tempest-parity block in arcade-shared/tests/rng.test.ts
// (seed 42/1/5/7 goldens captured from tempest's OWN immutable rngNext prove the
// flip changes the API shape WITHOUT changing the numbers).
//
// This guard is pure fs/text (it never imports the shared module, so it always
// collects and reports each miss granularly, matching SH-2's scaffold.test.ts
// idiom). Standalone-repo pure: reads only tempest's own files. RED until GREEN
// removes the local copy, pins the dep, and migrates the call-sites.

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
const someSrcImportsSharedRng = (): boolean =>
  walkTs(path('src')).some((f) => readFileSync(f, 'utf8').includes('@arcade/shared/rng'))

describe('rng extraction — local immutable copy retired, consumed from @arcade/shared (SH-3)', () => {
  it('no longer keeps a local src/core/rng.ts (extracted to @arcade/shared/rng)', () => {
    expect(
      existsSync(path('src/core/rng.ts')),
      'tempest/src/core/rng.ts must be deleted — the PRNG now lives in @arcade/shared/rng (SH-3)',
    ).toBe(false)
  })

  it('retires the old immutable rng unit suite (superseded by the shared tempest-parity lock)', () => {
    expect(
      existsSync(path('tests/core/rng.test.ts')),
      'tempest/tests/core/rng.test.ts encodes the reversed immutable contract and must be removed',
    ).toBe(false)
  })

  it('pins @arcade/shared as a git-URL dependency', () => {
    expect(read('package.json')).toMatch(/"@arcade\/shared":\s*"github:slabgorb\/arcade-shared#/)
  })

  it('migrates at least one core consumer to import from @arcade/shared/rng', () => {
    expect(
      someSrcImportsSharedRng(),
      'no src/*.ts imports @arcade/shared/rng — call-sites were not migrated off the local immutable copy',
    ).toBe(true)
  })
})
