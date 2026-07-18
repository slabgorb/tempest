import { readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { LINKED_MODULES } from './linked-modules.mjs'

const CLASSES = ['DIVERGENCE', 'CONFIRMED', 'BOOK_WAS_WRONG', 'STRUCTURAL', 'NO_COUNTERPART']
const RECOMMENDATIONS = ['fix', 'accept', 'wont_fix']
const SIZES = ['s', 'm', 'l']
const NODE_MODULES = /(^|\/)node_modules(\/|$)/

// tp1-22 — THE FREEZE. `ours` is read from the AUDIT COMMIT, never the working tree.
//
// Each finding's `ours.verbatim` IS the defect text as our code stood when it was audited.
// Reading it from the working tree meant the gate went red the moment any story fixed the
// very line the audit describes — so every tp1 story paid a hand re-pointing tax. We instead
// re-open `ours` against the commit that recorded the audit. That commit is immutable, so a
// later fix (or refactor) of the working tree can never redden the gate again. The ROM
// `source` side above stays LIVE against the 1981 assembler — that is where the audit's
// authority comes from, and it must still catch a mis-cited source line.
const AUDIT_COMMIT = '4232ed4'

/**
 * Is this a whole citation — something a reader could actually go and re-open?
 *
 * A file to open, a line to find, and a quote to compare against. A citation missing any
 * one of the three is not evidence, which is the only thing this gate is for.
 */
function isCitation(o) {
  return (
    typeof o === 'object' && o !== null && !Array.isArray(o) &&
    typeof o.file === 'string' && o.file.length > 0 &&
    Number.isInteger(o.line) && o.line > 0 &&
    typeof o.verbatim === 'string'
  )
}

const lineCache = new Map()
function lineAt(path, n) {
  if (!lineCache.has(path)) {
    if (!existsSync(path)) return undefined
    lineCache.set(path, readFileSync(path, 'utf8').split('\n'))
  }
  return lineCache.get(path)[n - 1]
}

// A tracked file as it stood at AUDIT_COMMIT, line-split — or `{ error }` if git cannot
// resolve it (the path did not exist at the audit). Cached per (repo, file); `git show` is
// invoked at most once per file. `git show` THROWS for an absent path, so the throw is
// caught and turned into a returned error the caller reports — the gate must never crash on
// a frozen citation it cannot resolve (tp1-22 AC-4b).
const frozenCache = new Map()
function frozenFileAt(repoRoot, file) {
  const key = `${repoRoot}::${file}`
  if (!frozenCache.has(key)) {
    try {
      const text = execFileSync('git', ['show', `${AUDIT_COMMIT}:${file}`], {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      })
      frozenCache.set(key, { lines: text.split('\n') })
    } catch {
      frozenCache.set(key, { error: `git show ${AUDIT_COMMIT}:${file} failed — path absent from the audit commit` })
    }
  }
  return frozenCache.get(key)
}

/**
 * @param findings  array of finding objects
 * @param opts.repoRoot   absolute path to the tempest repo
 * @param opts.sourceDir  absolute path to the LF Atari source, or null to skip
 *                        source-side byte checks (e.g. in CI, where it is absent)
 * @returns array of error strings; empty means every finding is valid
 */
export function checkFindings(findings, { repoRoot, sourceDir }) {
  const errors = []
  const seen = new Set()

  for (const f of findings) {
    const id = f.id ?? '(missing id)'

    if (!f.id) errors.push('a finding has no id')
    else if (seen.has(f.id)) errors.push(`duplicate id: ${f.id}`)
    else seen.add(f.id)

    if (!CLASSES.includes(f.class)) {
      errors.push(`${id}: class must be one of ${CLASSES.join('|')}, got ${JSON.stringify(f.class)}`)
      continue
    }
    if (!f.title) errors.push(`${id}: missing title`)
    if (!f.claim) errors.push(`${id}: missing claim`)

    if (f.class !== 'CONFIRMED' && !RECOMMENDATIONS.includes(f.recommendation)) {
      errors.push(`${id}: recommendation must be one of ${RECOMMENDATIONS.join('|')}`)
    }
    if (f.recommendation === 'fix' && !SIZES.includes(f.size)) {
      errors.push(`${id}: recommendation=fix requires size (${SIZES.join('|')})`)
    }

    // --- source side
    if (!f.source?.file) {
      errors.push(`${id}: missing source citation`)
    } else {
      const mod = f.source.file.replace(/\.MAC$/i, '').toUpperCase()
      if (!LINKED_MODULES.includes(mod)) {
        errors.push(
          `${id}: cites ${f.source.file}, which never shipped ` +
            `(not in the ALEXEC.MAP link string). Re-cite against the linked module.`,
        )
      } else if (sourceDir) {
        const actual = lineAt(join(sourceDir, f.source.file), f.source.line)
        if (actual === undefined) {
          errors.push(`${id}: source ${f.source.file}:${f.source.line} does not exist`)
        } else if (actual.trimEnd() !== String(f.source.verbatim).trimEnd()) {
          errors.push(
            `${id}: source ${f.source.file}:${f.source.line} does not match verbatim\n` +
              `  cited:  ${JSON.stringify(f.source.verbatim)}\n` +
              `  actual: ${JSON.stringify(actual)}`,
          )
        }
      }
    }

    // --- ours side
    //
    // A `node_modules` citation is rejected FIRST, ahead of every other rule — including
    // `remediated_by` (story tp1-3). `ours` means OUR source: a tracked file in this
    // repo. A dependency's build output is neither. Its line numbers move on every re-pin
    // or rebuild, so it is not a trustworthy anchor even as HISTORY, and not even when it
    // happens to match byte-for-byte today (SC-004 survived the old gate on exactly that
    // luck). Re-anchor to a tracked line that records the delegation instead.
    //
    // `remediated_by` (story tp1-1): once a fix story lands, the `ours` verbatim
    // describes code that DELIBERATELY no longer exists. Re-pointing it at the
    // corrected line would make the finding assert that the fix is the defect, and
    // deleting it would destroy the audit record — so a remediated finding keeps its
    // citation as HISTORY and is no longer re-opened against the working tree. Note this
    // means its line number is frozen and will drift; that is intended. The durable route
    // back to the change is the field itself — it names the story.
    //
    // The ROM `source` side above is still checked, always. That is where the audit's
    // authority comes from, and the 1981 source does not change. What we are giving up
    // here is only the guard that OUR code still contains the defect — which is the
    // one thing a fix story is supposed to make false.
    if (f.ours?.file && NODE_MODULES.test(f.ours.file)) {
      errors.push(
        `${id}: ours ${f.ours.file} is inside node_modules — a dependency's build ` +
          `output is not our source, and its line numbers move on every re-pin. ` +
          `Re-anchor to a tracked file in this repo.`,
      )
    } else if (f.remediated_by) {
      // A remediated finding keeps whatever citation it was AUDITED with — and a
      // NO_COUNTERPART was audited with none (story tp1-5).
      //
      // The requirement below assumes every finding has an `ours` line to freeze.
      // NO_COUNTERPART is the class where our code had NO counterpart line to quote,
      // because the rule was missing outright: W-032 was "the ROM gives the children of a
      // close split a non-flipping cam, and we do not do this anywhere". Fixing that means
      // ADDING code, so there is no historical quote to preserve — `ours` was null when it
      // was audited and null is still the truthful answer. Demanding one would force a fix
      // story to invent a citation for a line that never diverged, which is exactly the
      // kind of evidence this gate exists to refuse.
      //
      // A fix story MAY still attach an `ours` to a NO_COUNTERPART, pointing at the code
      // that now implements the rule — S-010 (tp1-2) does — and that is accepted too. Both
      // are records of the same fix, and neither is re-opened against the working tree.
      // Two shapes, and ONLY two. The exemption below is for a MISSING citation, not for
      // an unchecked one: before this guard, `remediated_by` + `NO_COUNTERPART` fell
      // through with no test at all, so an `ours` that was present but shapeless — no
      // file, no line, no quote, or not even an object — sailed past a gate whose whole
      // job is to refuse citations that cannot be re-opened. "May be null" and "may be
      // anything" are not the same permission.
      if (f.class === 'NO_COUNTERPART') {
        if (f.ours !== null && f.ours !== undefined && !isCitation(f.ours)) {
          errors.push(
            `${id}: a remediated NO_COUNTERPART's \`ours\` must be null, or a whole ` +
              `citation ({file, line, verbatim}) naming the code that now implements the ` +
              `rule — not ${JSON.stringify(f.ours)}`,
          )
        }
      } else if (!f.ours?.file) {
        errors.push(`${id}: remediated_by requires \`ours\` to keep its historical citation`)
      }
    } else if (f.class === 'NO_COUNTERPART') {
      if (f.ours !== null) errors.push(`${id}: NO_COUNTERPART requires \`ours\` to be null`)
    } else if (!f.ours?.file) {
      errors.push(`${id}: class ${f.class} requires \`ours\` (only NO_COUNTERPART may omit it)`)
    } else {
      // THE FREEZE (tp1-22). Re-open `ours` against AUDIT_COMMIT, not the working tree, and
      // match BY TEXT rather than by the stored line: tp1-1 and later stories re-anchored
      // `ours.line` to the working tree, so the recorded row is no longer the audit-commit
      // row. Mirroring `reanchor-citations.mjs`, the quote is honoured if it appears anywhere
      // in the file as it stood at the audit — its line number is now decorative. A path that
      // never existed at the audit commit is a clear returned error, never a crash (AC-4b).
      const frozen = frozenFileAt(repoRoot, f.ours.file)
      if (frozen.error) {
        errors.push(
          `${id}: ours ${f.ours.file}:${f.ours.line} cannot be frozen — ${frozen.error}. ` +
            `Re-baseline it to a file present at ${AUDIT_COMMIT}, or mark it remediated_by.`,
        )
      } else {
        const want = String(f.ours.verbatim).trimEnd()
        const present = frozen.lines.some((l) => l.trimEnd() === want)
        if (!present) {
          errors.push(
            `${id}: ours ${f.ours.file}:${f.ours.line} does not match verbatim at ${AUDIT_COMMIT}\n` +
              `  cited:  ${JSON.stringify(f.ours.verbatim)}\n` +
              `  (that text is absent from ${f.ours.file} as it stood at the audit commit)`,
          )
        }
      }
    }
  }

  return errors
}
