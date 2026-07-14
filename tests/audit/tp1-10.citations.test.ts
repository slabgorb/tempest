// tests/audit/tp1-10.citations.test.ts
//
// RED — tp1-10 AC-7 ("npm test -- citations stays green"). Fixing a DIVERGENCE
// makes its own `ours` quote false (it describes the bug just removed), so every
// finding this story fixes MUST be stamped `"remediated_by": "tp1-10"` — otherwise
// the citations gate (tests/audit/citations.test.ts) re-opens the now-false quote
// and goes red. See tempest/CLAUDE.md "The fidelity audit and its citation gate".
//
// This story (Cluster C6) subsumes WD-010, WD-012, WD-013, WD-014, WD-015, WD-017,
// WD-018 — all in pair-9-warp-drop-mode.json. WD-010 was already remediated by
// tp1-23 and is EXCLUDED; the other six are fixed HERE and must carry the stamp.
// They are unstamped today → RED until Dev stamps them in GREEN.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const pair9 = join(repoRoot, 'docs', 'audit', 'findings', 'pair-9-warp-drop-mode.json')

interface Finding {
  id: string
  remediated_by?: string
}

const findings: Finding[] = JSON.parse(readFileSync(pair9, 'utf8'))
const byId = (id: string): Finding | undefined => findings.find((f) => f.id === id)

// The six findings this story FIXES (WD-010 excluded — already tp1-23).
const FIXED_HERE = ['WD-012', 'WD-013', 'WD-014', 'WD-015', 'WD-017', 'WD-018']

describe('tp1-10 AC-7 — the fixed WD findings are stamped remediated_by tp1-10', () => {
  it.each(FIXED_HERE)('%s carries remediated_by: tp1-10', (id) => {
    const f = byId(id)
    expect(f, `${id} must exist in pair-9-warp-drop-mode.json`).toBeDefined()
    expect(f?.remediated_by).toBe('tp1-10')
  })

  it('does NOT re-stamp WD-010 (already remediated by tp1-23)', () => {
    expect(byId('WD-010')?.remediated_by).toBe('tp1-23')
  })
})
