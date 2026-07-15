// tests/audit/tp1-7.citations.test.ts
//
// RED for tp1-7's AC-5: `npm test -- citations` stays green.
//
// This story DELETES the hand-tuned lines that nine audit findings quote in their `ours`
// citation (the enemyCount straight line, the 0.22 spiker ramp, the flat MAX_ENEMY_BULLETS,
// the 0.72 bolt offset, the level>=5/11/17 gates, the fill(0) spike reset, flipperSpeedForLevel's
// linear interp). The citation gate re-opens every `ours` quote against the working tree
// (tests/audit/citations.test.ts, 'every committed findings file passes'), so the moment Dev
// deletes a quoted line the gate goes RED with "does not match verbatim".
//
// The convention that resolves it (CLAUDE.md, "The fidelity audit and its citation gate"):
// mark a FIXED finding `remediated_by: "<story-id>"`. The checker then keeps the `ours` quote
// as HISTORY and stops re-opening it. So this file pins the mechanism: every finding tp1-7
// subsumes must be stamped `remediated_by: "tp1-7"`. It fails now (all nine are null) and goes
// green only once Dev has both fixed the code AND recorded the remediation — which is exactly
// what keeps the main gate green through the deletion.
//
// (Untouched citations in files tp1-7 merely EDITS still point at TRUE lines whose row shifted;
// those are repaired by `node tools/audit/reanchor-citations.mjs --write`, NOT remediation. See
// the TEA assessment / Delivery Findings.)
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const findingsDir = join(repoRoot, 'docs', 'audit', 'findings')

interface Finding { id: string; remediated_by?: string; class?: string; ours?: unknown }

const allFindings: Finding[] = existsSync(findingsDir)
  ? readdirSync(findingsDir)
      .filter((f) => f.endsWith('.json'))
      .flatMap((f) => JSON.parse(readFileSync(join(findingsDir, f), 'utf8')) as Finding[])
  : []

const byId = (id: string): Finding | undefined => allFindings.find((f) => f.id === id)

// The nine findings this story subsumes (story description + AC-1).
const SUBSUMED = ['W-011', 'W-012', 'W-014', 'W-019', 'W-020', 'W-033', 'W-035', 'W-037', 'DA-002']

describe('tp1-7 — the subsumed findings are remediated so the citation gate stays green (AC-5)', () => {
  it('all nine findings exist in the committed audit', () => {
    for (const id of SUBSUMED) {
      expect(byId(id), `finding ${id} not found in docs/audit/findings/`).toBeDefined()
    }
  })

  it('every subsumed finding is marked remediated_by tp1-7', () => {
    for (const id of SUBSUMED) {
      const f = byId(id)
      expect(f?.remediated_by, `${id} must be remediated_by tp1-7 once its hand-tuned line is deleted`)
        .toBe('tp1-7')
    }
  })

  it('a remediated DIVERGENCE still keeps its historical `ours` quote (not nulled)', () => {
    // remediation FREEZES the quote as history — it does not delete it. A DIVERGENCE with a
    // null `ours` loses the audit record (citations.test.ts enforces this too). Guard it here
    // so a lazy "just null it out" fix cannot pass tp1-7's own suite.
    for (const id of SUBSUMED) {
      const f = byId(id)
      if (f?.class === 'DIVERGENCE') {
        expect(f?.ours, `${id} (DIVERGENCE) must retain its historical ours citation`).toBeTruthy()
      }
    }
  })
})
