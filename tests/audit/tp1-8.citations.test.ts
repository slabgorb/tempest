// tests/audit/tp1-8.citations.test.ts
//
// RED for tp1-8's AC-5: `npm test -- citations` stays green.
//
// tp1-8 replaces `rollSpawnKind` — a memoryless weighted roll — with NYMCHA, the per-type
// MIN/MAX population solver. Finding W-034 ("Enemy type selection is a per-type MIN/MAX
// population solver, not a weighted random table") quotes that exact function signature in
// its `ours` citation:
//
//   "export function rollSpawnKind(level: number, rng: Rng): EnemyKind {"
//
// The citation gate (tests/audit/citations.test.ts, 'every committed findings file passes')
// re-opens every non-remediated `ours` quote against the working tree. The moment Dev turns
// rollSpawnKind into the solver the quote stops describing live code, and the DIVERGENCE it
// records is resolved — so W-034 must be stamped `remediated_by: "tp1-8"`. Per CLAUDE.md's
// citation-gate rules the checker then FREEZES the historical quote and stops re-opening it,
// keeping the main gate green through the rewrite.
//
// It fails now (W-034.remediated_by is null) and goes green only once Dev both lands NYMCHA
// AND records the remediation. Any OTHER finding whose cited line merely SHIFTS because
// rules.ts grew (not because it was fixed) is repaired by
// `node tools/audit/reanchor-citations.mjs --write`, NOT remediation — see the TEA assessment.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const findingsDir = join(repoRoot, 'docs', 'audit', 'findings')

interface Finding { id: string; remediated_by?: string; class?: string; ours?: { verbatim?: string } | null }

const allFindings: Finding[] = existsSync(findingsDir)
  ? readdirSync(findingsDir)
      .filter((f) => f.endsWith('.json'))
      .flatMap((f) => JSON.parse(readFileSync(join(findingsDir, f), 'utf8')) as Finding[])
  : []

const byId = (id: string): Finding | undefined => allFindings.find((f) => f.id === id)

// The story ("Subsumes W-034") remediates the population-solver divergence.
const SUBSUMED = ['W-034']

describe('tp1-8 — W-034 is remediated so the citation gate survives the rewrite (AC-5)', () => {
  it('W-034 exists and is the population-solver divergence citing rollSpawnKind', () => {
    const f = byId('W-034')
    expect(f, 'finding W-034 not found in docs/audit/findings/').toBeDefined()
    expect(f?.class).toBe('DIVERGENCE')
    // The exact line NYMCHA removes — if this drifts, tp1-8's whole premise moved.
    expect(f?.ours?.verbatim).toBe('export function rollSpawnKind(level: number, rng: Rng): EnemyKind {')
  })

  it('W-034 is marked remediated_by tp1-8 once rollSpawnKind becomes the solver', () => {
    for (const id of SUBSUMED) {
      expect(byId(id)?.remediated_by, `${id} must be remediated_by tp1-8`).toBe('tp1-8')
    }
  })

  it('the remediated DIVERGENCE keeps its historical `ours` quote (frozen, not nulled)', () => {
    // Remediation freezes the quote as history; nulling it loses the audit record and the
    // main gate's own DIVERGENCE-needs-ours check would fail. Guard against a lazy null-out.
    for (const id of SUBSUMED) {
      const f = byId(id)
      if (f?.class === 'DIVERGENCE') {
        expect(f?.ours, `${id} (DIVERGENCE) must retain its historical ours citation`).toBeTruthy()
      }
    }
  })
})
