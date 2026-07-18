// tp1-22 — THE CITATION GATE: freeze the audit's `ours` side to the audit commit.
//
// RED-phase tests (O'Brien / TEA). These pin the NEW behavior the story asks Dev to build:
// the citation checker must read each finding's `ours` side from the AUDIT COMMIT
// (`git show 4232ed4:<file>`) rather than from the working tree, so that a later fix story
// which legitimately changes a cited line no longer reddens the gate. The ROM `source` side
// must STILL be byte-checked live against the LF Atari source — that is where the audit's
// authority lives and it must not regress.
//
// This file is deliberately NOT named `*citations*` so `npm test -- citations` keeps running
// only the live gate (25 green). Run these with `npm test -- freeze`.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkFindings } from '../../tools/audit/check-citations.mjs'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const findingsDir = join(repoRoot, 'docs', 'audit', 'findings')
const sourceDir = process.env.TEMPEST_SOURCE_DIR ?? '/Users/slabgorb/Projects/tempest-source-text'
const sourceAvailable = existsSync(sourceDir)

// The audit baseline (tempest#95, `docs(audit): the primary-source fidelity audit`). Every
// finding's `ours.verbatim` is the defect text as it stood HERE. tp1-22 freezes the gate's
// `ours` read to this commit. This constant MUST match the one the checker adopts; if Dev
// pins a different SHA, update it here too (and flag it — see the Delivery Findings note).
const AUDIT_COMMIT = '4232ed4'

const trimEnd = (s: unknown) => String(s ?? '').replace(/\s+$/, '')

/** `<file>` as it stood at the audit commit, line-split. Throws if git cannot resolve it. */
function auditLines(file: string): string[] {
  return execFileSync('git', ['show', `${AUDIT_COMMIT}:${file}`], {
    cwd: repoRoot,
    encoding: 'utf8',
  }).split('\n')
}

/** Working-tree copy of a tracked file, line-split. */
function workingLines(file: string): string[] {
  return readFileSync(join(repoRoot, file), 'utf8').split('\n')
}

/**
 * Find a tracked line that genuinely CHANGED between the audit commit and the working tree.
 * A citation built on such a line is the only honest way to distinguish "read `ours` from
 * the frozen commit" from "read it live from the working tree": the two answers differ.
 * `src/core/rules.ts` churned +1064/-146 since the audit, so a differing line is guaranteed;
 * if the search ever fails, the fixture is invalid and the test says so out loud rather than
 * passing vacuously.
 */
function pickChangedLine(file = 'src/core/rules.ts') {
  const wt = workingLines(file)
  const audit = auditLines(file)
  const n = Math.min(wt.length, audit.length)
  for (let i = 0; i < n; i++) {
    if (trimEnd(audit[i]).length > 0 && trimEnd(audit[i]) !== trimEnd(wt[i])) {
      return { file, line: i + 1, auditText: audit[i], workingText: wt[i] }
    }
  }
  throw new Error(`fixture invalid: no changed line found in ${file} between ${AUDIT_COMMIT} and the working tree`)
}

/**
 * A minimal, valid finding wrapped around a given `ours`. The `source` defaults to a real
 * linked module (`ALWELG.MAC`) so the source side is well-formed; its bytes are only compared
 * when a `sourceDir` is passed to `checkFindings`.
 */
function finding(
  id: string,
  ours: unknown,
  source: unknown = { file: 'ALWELG.MAC', line: 1, verbatim: 'anything' },
) {
  return {
    id,
    class: 'DIVERGENCE',
    title: 't',
    source,
    ours,
    claim: 'c',
    reasoning: 'r',
    recommendation: 'accept',
  }
}

function loadFinding(id: string): any {
  for (const name of readdirSync(findingsDir).filter((f) => f.endsWith('.json'))) {
    const arr = JSON.parse(readFileSync(join(findingsDir, name), 'utf8'))
    const hit = arr.find((f: any) => f.id === id)
    if (hit) return hit
  }
  return undefined
}

// ---------------------------------------------------------------------------------------
// AC-5 — THE HEADLINE. The gate must survive a simulated code fix.
// ---------------------------------------------------------------------------------------
describe('tp1-22 AC-5 — the citation gate survives a simulated code fix', () => {
  it('GREEN: an `ours` line changed in the working tree does NOT redden — `ours` reads from the frozen audit commit', () => {
    const { file, line, auditText, workingText } = pickChangedLine()

    // The fixture only means something if the two trees really differ at this line.
    expect(trimEnd(auditText), 'fixture invalid: audit and working-tree lines are identical').not.toBe(
      trimEnd(workingText),
    )

    // `ours.verbatim` is the AUDIT-COMMIT text; the working tree at the same line was
    // "fixed" (it differs). A checker that reads `ours` from the frozen commit sees a match
    // and stays green. Today's checker reads the working tree, mismatches, and reddens — so
    // this assertion FAILS against the current tooling. That is the RED we are pinning.
    const frozen = checkFindings([finding('AC5-FROZEN', { file, line, verbatim: auditText })], {
      repoRoot,
      sourceDir: null,
    })
    expect(
      frozen,
      `\`ours\` must be read from ${AUDIT_COMMIT}, not the working tree (working line is now ${JSON.stringify(workingText)})`,
    ).toEqual([])

    // Non-gameable second half: with the SAME frozen `ours`, a mismatched ROM source line
    // must STILL redden — proving the checker did not simply start ignoring everything, and
    // that the source side stays live. (Runs only where the LF Atari source is present.)
    if (sourceAvailable) {
      const bothSides = checkFindings(
        [
          finding('AC5-BOTH', { file, line, verbatim: auditText }, {
            file: 'ALWELG.MAC',
            line: 1786,
            verbatim: 'DELIBERATELY WRONG — not the ROM line at ALWELG.MAC:1786',
          }),
        ],
        { repoRoot, sourceDir },
      )
      expect(bothSides.join('\n'), 'the ROM source side must stay live under the freeze').toMatch(
        /AC5-BOTH[\s\S]*source[\s\S]*does not match/,
      )
    }
  })

  it('ANTI-VACUOUS: a frozen `ours` quote that matches NEITHER tree still reddens', () => {
    // Guards against a checker that "passes everything": the frozen `ours` is still
    // byte-compared, so a quote present in no version of the file is an error. A trivial
    // implementation that skips the `ours` check entirely would wrongly pass here.
    const { file, line } = pickChangedLine()
    const errors = checkFindings(
      [finding('AC5-GHOST', { file, line, verbatim: 'zzz — this quote exists in no version of this file — zzz' })],
      { repoRoot, sourceDir: null },
    )
    expect(errors.join('\n')).toMatch(/AC5-GHOST[\s\S]*does not match/)
  })

  it.skipIf(!sourceAvailable)(
    'SOURCE STAYS LIVE: a mismatched ROM source line reddens even when `ours` is fine',
    () => {
      // The other half of AC-5, on its own so it is confirmed independently: freezing `ours`
      // must not freeze `source`. A trivial "freeze both sides" implementation fails here.
      const { file, line, auditText } = pickChangedLine()
      const errors = checkFindings(
        [
          finding('AC5-SRC', { file, line, verbatim: auditText }, {
            file: 'ALWELG.MAC',
            line: 1786,
            verbatim: 'NOT THE ROM LINE',
          }),
        ],
        { repoRoot, sourceDir },
      )
      expect(errors.join('\n')).toMatch(/AC5-SRC[\s\S]*source[\s\S]*does not match/)
    },
  )
})

// ---------------------------------------------------------------------------------------
// AC-4 — a remediated NO_COUNTERPART must be handled cleanly under the freeze.
//
// NOTE (flagged to Dev in the session Delivery Findings): AC-4 as worded — "NO_COUNTERPART
// can never be marked remediated_by; today that combination hard-errors" — does not match the
// repo. The current checker ACCEPTS NO_COUNTERPART + remediated_by (S-010 and nine others are
// exactly that, blessed by CLAUDE.md), and AC-3 forbids reverting them. So the honest
// intended behavior is the opposite of a ban: the combination stays valid, and the freeze
// must not break it. These tests pin that, plus the genuine hazard AC-4 gestures at — a
// `git show` on a path absent from the audit commit must not become an uncaught crash.
// ---------------------------------------------------------------------------------------
describe('tp1-22 AC-4 — a remediated NO_COUNTERPART is handled cleanly under the freeze', () => {
  it('a remediated NO_COUNTERPART keeps its frozen `ours` — the checker must not re-read it from the audit commit', () => {
    const s010 = loadFinding('S-010')
    expect(s010, 'S-010 (a real remediated NO_COUNTERPART) should exist in the findings').toBeTruthy()
    expect(s010.class).toBe('NO_COUNTERPART')
    expect(s010.remediated_by).toBeTruthy()
    expect(s010.ours && typeof s010.ours === 'object' && s010.ours.file, 'S-010 carries a non-null ours').toBeTruthy()

    // S-010's `ours` points at code the fix ADDED (tools/pokey-bake/sfx-data.mjs). Its quote
    // is frozen history: it matches neither the audit commit nor the working tree at that
    // line. A naive AC-1 that byte-reads EVERY `ours` from the audit commit would redden (or,
    // for a file absent from the commit, throw) on it. The intended behavior: a remediated
    // finding's `ours` is left alone, exactly as today.
    const atAudit = trimEnd(auditLines(s010.ours.file)[s010.ours.line - 1] ?? '')
    expect(atAudit, 'guard: the audit-commit line is not the frozen quote — that is the whole point').not.toBe(
      trimEnd(s010.ours.verbatim),
    )

    const errors = checkFindings([s010], { repoRoot, sourceDir: null })
    expect(errors, 'a remediated NO_COUNTERPART must stay green after the freeze').toEqual([])
  })

  it('an unresolvable frozen `ours` yields a clear returned error, never a raw git/exception hard-error', () => {
    // AC-4's real hazard: reading `ours` from the audit commit means `git show 4232ed4:<file>`,
    // which THROWS for a path absent from that commit. That must surface as a clear checker
    // error string (the same shape the working-tree read gives today for a missing file), not
    // an uncaught exception that takes the whole gate down with a confusing git message.
    const bogus = finding('AC4-ABSENT', {
      file: 'src/core/__file_absent_from_audit_commit__.ts',
      line: 1,
      verbatim: 'x',
    })
    let errors: string[] = []
    expect(
      () => {
        errors = checkFindings([bogus], { repoRoot, sourceDir: null })
      },
      'the checker must not throw when a frozen `ours` cannot be resolved',
    ).not.toThrow()
    expect(errors.join('\n')).toMatch(/AC4-ABSENT/)
  })
})
