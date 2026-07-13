// Re-anchor the audit's `ours` citations after we change the code they cite.
//
// Every finding quotes one of our lines byte-for-byte, and `tests/audit/citations.test.ts`
// re-opens each quote and compares. That gate keeps the audit honest, but it means any
// edit to a cited file invalidates citations two different ways:
//
//   1. The line MOVED. Insert a function above it and its text is unchanged but its
//      number is stale. The citation is still TRUE — it just points at the wrong row.
//      That is this tool's job: find the quote, correct the number.
//
//   2. The line was FIXED. We changed what it says, on purpose, because the finding
//      told us to. No amount of re-anchoring helps: the quoted text is gone. Such a
//      finding is marked `"fixed_in": "<story-id>"` by hand, which tells the checker to
//      stop byte-comparing it — the quote stays as the historical record of what our
//      code said when it was audited. This tool leaves those alone.
//
// Usage:  node tools/audit/reanchor-citations.mjs [--write]
// Without --write it only reports (dry run).
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const findingsDir = join(repoRoot, 'docs', 'audit', 'findings')
const write = process.argv.includes('--write')

const fileCache = new Map()
function linesOf(path) {
  if (!fileCache.has(path)) {
    fileCache.set(path, existsSync(path) ? readFileSync(path, 'utf8').split('\n') : null)
  }
  return fileCache.get(path)
}

const norm = (s) => String(s).trimEnd()

let moved = 0
let lost = 0
let ok = 0

for (const name of readdirSync(findingsDir).filter((f) => f.endsWith('.json'))) {
  const path = join(findingsDir, name)
  const findings = JSON.parse(readFileSync(path, 'utf8'))
  let dirty = false

  for (const f of findings) {
    // Fixed findings are history — their quote is meant to be stale. Skip.
    if (!f.ours?.file || f.fixed_in) continue
    const lines = linesOf(join(repoRoot, f.ours.file))
    if (lines === null) continue // e.g. a node_modules citation the checker now rejects

    const want = norm(f.ours.verbatim)
    if (norm(lines[f.ours.line - 1] ?? '') === want) { ok++; continue }

    // The quote is not where it used to be. Find it. A line's text is rarely unique
    // (`  }` is not a citation), so when several rows match, take the one CLOSEST to
    // the original number — an edit shifts a citation by a few rows, never reorders it.
    const hits = []
    for (let i = 0; i < lines.length; i++) if (norm(lines[i]) === want) hits.push(i + 1)

    if (hits.length === 0) {
      // The text is gone entirely. Either we fixed this line and forgot to mark it
      // `fixed_in`, or the citation was already broken. A human has to look.
      console.log(`LOST  ${f.id.padEnd(7)} ${f.ours.file}:${f.ours.line}`)
      console.log(`        quote: ${JSON.stringify(f.ours.verbatim)}`)
      lost++
      continue
    }

    const to = hits.reduce((a, b) => (Math.abs(b - f.ours.line) < Math.abs(a - f.ours.line) ? b : a))
    const tag = hits.length > 1 ? ` (${hits.length} matches, took nearest)` : ''
    console.log(`MOVED ${f.id.padEnd(7)} ${f.ours.file}:${f.ours.line} -> ${to}${tag}`)
    f.ours.line = to
    moved++
    dirty = true
  }

  if (dirty && write) writeFileSync(path, JSON.stringify(findings, null, 2) + '\n')
}

console.log(`\n${ok} already correct, ${moved} re-anchored, ${lost} lost.`)
if (lost > 0) console.log('LOST citations need a human: fix the quote, or mark the finding `fixed_in`.')
if (moved > 0 && !write) console.log('Dry run — pass --write to apply.')
