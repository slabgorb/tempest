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
