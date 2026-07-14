import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkFindings } from '../../tools/audit/check-citations.mjs'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const findingsDir = join(repoRoot, 'docs', 'audit', 'findings')
const sourceDir = process.env.TEMPEST_SOURCE_DIR ?? '/Users/slabgorb/Projects/tempest-source-text'
const sourceAvailable = existsSync(sourceDir)

describe('checkFindings', () => {
  it('rejects a citation to a module that never shipped', () => {
    const errors = checkFindings(
      [{
        id: 'X-001', class: 'DIVERGENCE', title: 't',
        source: { file: 'ALDIS2.MAC', line: 81, verbatim: '\tEOR I,029' },
        ours: { file: 'src/core/sim.ts', line: 1, verbatim: 'x' },
        claim: 'c', reasoning: 'r', recommendation: 'accept',
      }],
      { repoRoot, sourceDir: null },
    )
    expect(errors.join('\n')).toMatch(/ALDIS2\.MAC.*never shipped/)
  })

  it('accepts a citation to a module that shipped only via .INCLUDE (ANVGAN)', () => {
    const errors = checkFindings(
      [{
        id: 'X-007', class: 'NO_COUNTERPART', title: 't', ours: null,
        source: { file: 'ANVGAN.MAC', line: 1, verbatim: 'anything' },
        claim: 'c', reasoning: 'r', recommendation: 'accept',
      }],
      { repoRoot, sourceDir: null },
    )
    expect(errors).toEqual([])
  })

  it('rejects a finding whose `ours` verbatim does not match the real line', () => {
    const errors = checkFindings(
      [{
        id: 'X-002', class: 'DIVERGENCE', title: 't',
        source: { file: 'ALWELG.MAC', line: 1, verbatim: 'anything' },
        ours: { file: 'src/core/rules.ts', line: 8, verbatim: 'export const MAX_BULLETS = 999' },
        claim: 'c', reasoning: 'r', recommendation: 'fix', size: 's',
      }],
      { repoRoot, sourceDir: null },
    )
    expect(errors.join('\n')).toMatch(/X-002.*does not match/)
  })

  it('accepts a finding whose `ours` verbatim matches the real line', () => {
    const line = readFileSync(join(repoRoot, 'src/core/rules.ts'), 'utf8').split('\n')[7]
    const errors = checkFindings(
      [{
        id: 'X-003', class: 'DIVERGENCE', title: 't',
        source: { file: 'ALWELG.MAC', line: 1, verbatim: 'anything' },
        ours: { file: 'src/core/rules.ts', line: 8, verbatim: line },
        claim: 'c', reasoning: 'r', recommendation: 'fix', size: 's',
      }],
      { repoRoot, sourceDir: null },
    )
    expect(errors).toEqual([])
  })

  // Story tp1-3 (2026-07-13). The gate went red on develop, and NOT because a game
  // constant drifted: SC-001 and SC-009 cite `node_modules/@arcade/shared/dist/
  // highscore.js`, the BUILT output of a version-pinned git dependency. That dist/ is
  // gitignored in arcade-shared and regenerated on install, so its line numbers move
  // under the audit every time the library is re-pinned or rebuilt — line 46 held
  // `MAX_HIGH_SCORES = 10` when the audit ran and holds a comment today.
  //
  // A citation the checker cannot trust is worthless: the whole point of the ours-side
  // check is that a cited line can be re-opened and byte-compared. So make the category
  // error impossible rather than repairing this instance and waiting for the next one.
  // `ours` means OUR source — a tracked file in this repo. A dependency's build output
  // is neither our code nor stable, and it must be rejected on sight.
  it('rejects an `ours` citation into node_modules — a rebuilt artifact is not our source', () => {
    // The fixture cites node_modules with its CURRENT, byte-exact line, so the verbatim
    // check PASSES. That is deliberate: a naive assertion here (cite a stale line, expect
    // "an error") passes today for the wrong reason — the checker already emits "ours
    // node_modules/...:46 does not match verbatim", and that message CONTAINS the string
    // "node_modules" simply because the path is in it. Such a test would be vacuous: green
    // whether or not the rule exists. By citing the line correctly, the ONLY thing that can
    // produce an error is a rule that rejects the PATH.
    const nmFile = 'node_modules/@arcade/shared/dist/highscore.js'
    const nmLine = 46
    const actual = readFileSync(join(repoRoot, nmFile), 'utf8').split('\n')[nmLine - 1]

    const errors = checkFindings(
      [{
        id: 'X-020', class: 'DIVERGENCE', title: 't',
        source: { file: 'ALWELG.MAC', line: 1, verbatim: 'anything' },
        ours: { file: nmFile, line: nmLine, verbatim: actual },
        claim: 'c', reasoning: 'r', recommendation: 'fix', size: 's',
      }],
      { repoRoot, sourceDir: null },
    )

    expect(errors.join('\n'), 'a byte-perfect citation into node_modules must STILL be rejected')
      .toMatch(/X-020/)
    expect(errors.join('\n')).toMatch(/node_modules/)
  })

  it('still accepts an `ours` citation to a tracked file in our own tree', () => {
    // Guard the guard: the node_modules rule must not become a blanket ban on ours-side
    // citations. src/core/rules.ts:19 is exactly where tempest records that the ladder
    // depth was delegated to @arcade/shared — a stable, tracked anchor.
    const line = readFileSync(join(repoRoot, 'src/core/rules.ts'), 'utf8').split('\n')[18]
    const errors = checkFindings(
      [{
        id: 'X-021', class: 'DIVERGENCE', title: 't',
        source: { file: 'ALWELG.MAC', line: 1, verbatim: 'anything' },
        ours: { file: 'src/core/rules.ts', line: 19, verbatim: line },
        claim: 'c', reasoning: 'r', recommendation: 'fix', size: 's',
      }],
      { repoRoot, sourceDir: null },
    )
    expect(errors).toEqual([])
  })

  it('requires `ours` to be null for NO_COUNTERPART and present otherwise', () => {
    const base = {
      class: 'NO_COUNTERPART', title: 't',
      source: { file: 'ALWELG.MAC', line: 1, verbatim: 'anything' },
      claim: 'c', reasoning: 'r', recommendation: 'fix', size: 'm',
    }
    expect(checkFindings([{ ...base, id: 'X-004', ours: null }], { repoRoot, sourceDir: null })).toEqual([])
    expect(
      checkFindings([{ ...base, id: 'X-005', class: 'DIVERGENCE', ours: null }], { repoRoot, sourceDir: null })
        .join('\n'),
    ).toMatch(/X-005.*requires `ours`/)
  })

  it('lets a remediated NO_COUNTERPART keep its null `ours` — but nothing else may', () => {
    // tp1-5. A NO_COUNTERPART finding is one where our code had NO counterpart line: the
    // rule was missing outright (W-032 — the ROM hands the children of a close split a
    // non-flipping cam, and we did not do that anywhere). Fixing it means ADDING code, so
    // there is no historical `ours` quote to freeze, and demanding one would make a fix
    // story invent a citation for a line that never diverged.
    const base = {
      title: 't', source: { file: 'ALWELG.MAC', line: 1, verbatim: 'anything' },
      claim: 'c', reasoning: 'r', recommendation: 'fix', size: 'm',
    }
    expect(checkFindings(
      [{ ...base, id: 'X-030', class: 'NO_COUNTERPART', ours: null, remediated_by: 'tp1-5' }],
      { repoRoot, sourceDir: null },
    )).toEqual([])

    // The exemption is the CLASS's, not remediated_by's: a remediated DIVERGENCE still owes
    // the historical quote it was audited with, or the audit record is simply lost.
    expect(checkFindings(
      [{ ...base, id: 'X-031', class: 'DIVERGENCE', ours: null, remediated_by: 'tp1-5' }],
      { repoRoot, sourceDir: null },
    ).join('\n')).toMatch(/X-031.*historical citation/)

    // A remediated NO_COUNTERPART MAY instead point `ours` at the code that now implements
    // the rule — S-010 (tp1-2) does exactly that, and it is a record of the same fix. Both
    // shapes are accepted, and neither is re-opened against the working tree.
    expect(checkFindings(
      [{
        ...base, id: 'X-032', class: 'NO_COUNTERPART', remediated_by: 'tp1-5',
        ours: { file: 'src/core/rules.ts', line: 19, verbatim: 'a quote nothing will re-open' },
      }],
      { repoRoot, sourceDir: null },
    )).toEqual([])
  })

  it('a remediated NO_COUNTERPART may have `ours` null or a WELL-FORMED citation — not junk', () => {
    // The widening tp1-5 shipped bought the null case at the cost of validating NOTHING:
    // once `remediated_by` and `class: NO_COUNTERPART` are both set, the branch falls
    // through with no check at all, so an `ours` that is present but malformed — no file,
    // no line, no verbatim — sails past a gate whose entire job is to refuse citations
    // that cannot be re-opened. "Null" and "anything at all" are not the same permission.
    const base = {
      title: 't', source: { file: 'ALWELG.MAC', line: 1, verbatim: 'anything' },
      claim: 'c', reasoning: 'r', recommendation: 'fix', size: 'm',
      class: 'NO_COUNTERPART', remediated_by: 'tp1-5',
    }

    // Present but shapeless: no `file` to open, no `line` to find, no quote to compare.
    expect(checkFindings(
      [{ ...base, id: 'X-033', ours: { line: 3 } }],
      { repoRoot, sourceDir: null },
    ).join('\n'), 'a malformed `ours` was accepted').toMatch(/X-033.*ours/)

    // Not even an object.
    expect(checkFindings(
      [{ ...base, id: 'X-034', ours: 'src/core/sim.ts:1' }],
      { repoRoot, sourceDir: null },
    ).join('\n'), 'a non-object `ours` was accepted').toMatch(/X-034.*ours/)

    // The two legitimate shapes still pass — this must not become "reject everything".
    expect(checkFindings([{ ...base, id: 'X-035', ours: null }], { repoRoot, sourceDir: null })).toEqual([])
    expect(checkFindings(
      [{
        ...base, id: 'X-036',
        ours: { file: 'src/core/rules.ts', line: 19, verbatim: 'a quote nothing will re-open' },
      }],
      { repoRoot, sourceDir: null },
    )).toEqual([])
  })

  it('rejects duplicate ids', () => {
    const f = {
      id: 'X-006', class: 'NO_COUNTERPART', title: 't', ours: null,
      source: { file: 'ALWELG.MAC', line: 1, verbatim: 'anything' },
      claim: 'c', reasoning: 'r', recommendation: 'accept',
    }
    expect(checkFindings([f, { ...f }], { repoRoot, sourceDir: null }).join('\n')).toMatch(/duplicate id.*X-006/i)
  })

  it('every committed findings file passes', () => {
    if (!existsSync(findingsDir)) return
    const files = readdirSync(findingsDir).filter((f) => f.endsWith('.json'))
    const all = files.flatMap((f) => JSON.parse(readFileSync(join(findingsDir, f), 'utf8')))
    const errors = checkFindings(all, { repoRoot, sourceDir: sourceAvailable ? sourceDir : null })
    expect(errors).toEqual([])
  })
})

describe.skipIf(!sourceAvailable)('source-side citations', () => {
  it('every committed findings file cites real source lines', () => {
    if (!existsSync(findingsDir)) return
    const files = readdirSync(findingsDir).filter((f) => f.endsWith('.json'))
    const all = files.flatMap((f) => JSON.parse(readFileSync(join(findingsDir, f), 'utf8')))
    expect(checkFindings(all, { repoRoot, sourceDir })).toEqual([])
  })
})
