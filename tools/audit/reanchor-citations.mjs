// Validate the audit's `ours` citations against the AUDIT COMMIT (tp1-22).
//
// Every finding quotes one of our lines byte-for-byte. Since tp1-22 the citation gate
// (`tests/audit/citations.test.ts`) re-opens each `ours` quote against the commit that
// recorded the audit — `git show 4232ed4:<file>` — not the working tree. The audit record is
// immutable by construction, so once a finding's `ours` quote is present in that commit it
// stays green forever, no matter how the working tree is later fixed or refactored.
//
// That RETIRES this tool's old job. It used to chase a quote's line number around the WORKING
// tree as we edited a cited file, re-pointing `ours.line` so the (then working-tree-reading)
// gate stayed green. The freeze makes `ours.line` decorative — the checker now matches the
// quote by TEXT anywhere in the frozen file — so there is nothing to re-anchor, and moving
// lines to follow the working tree would actively drift a citation off the immutable record.
//
// What remains useful is the health check: confirm every non-remediated `ours` quote is still
// findable in the audit commit. A quote that is NOT is reported LOST and needs a human —
// either it drifted off the immutable record (re-baseline it to its 4232ed4 text) or the
// finding was fixed and wants a `remediated_by` flag.
//
//   - A `remediated_by` finding is history the checker no longer re-opens. Skip.
//   - A quote whose file did not exist at the audit commit cannot be validated against it.
//     Skip (it must be carried by `remediated_by`, or re-baselined to a file that did exist).
//
// Usage:  node tools/audit/reanchor-citations.mjs
import { readFileSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const findingsDir = join(repoRoot, 'docs', 'audit', 'findings')
const AUDIT_COMMIT = '4232ed4'

// A tracked file as it stood at the audit commit, line-split — or null if the path did not
// exist there (`git show` throws). Cached per file; git is invoked at most once per file.
const fileCache = new Map()
function frozenLinesOf(file) {
  if (!fileCache.has(file)) {
    try {
      fileCache.set(
        file,
        execFileSync('git', ['show', `${AUDIT_COMMIT}:${file}`], {
          cwd: repoRoot,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }).split('\n'),
      )
    } catch {
      fileCache.set(file, null)
    }
  }
  return fileCache.get(file)
}

const norm = (s) => String(s).trimEnd()

let ok = 0
let lost = 0
let skipped = 0

for (const name of readdirSync(findingsDir).filter((f) => f.endsWith('.json'))) {
  const findings = JSON.parse(readFileSync(join(findingsDir, name), 'utf8'))

  for (const f of findings) {
    // Remediated findings are history the checker no longer re-opens; a citation whose file
    // never existed at the audit commit cannot be validated against it. Skip both.
    if (!f.ours?.file || f.remediated_by) continue
    const lines = frozenLinesOf(f.ours.file)
    if (lines === null) { skipped++; continue }

    const want = norm(f.ours.verbatim)
    if (lines.some((l) => norm(l) === want)) { ok++; continue }

    // The quote is not in the audit commit's copy of this file. Either it drifted off the
    // immutable record, or the finding was fixed and needs `remediated_by`. A human decides.
    console.log(`LOST  ${f.id.padEnd(7)} ${f.ours.file}:${f.ours.line}`)
    console.log(`        quote: ${JSON.stringify(f.ours.verbatim)}`)
    lost++
  }
}

console.log(`\n${ok} present in ${AUDIT_COMMIT}, ${lost} lost, ${skipped} skipped (file absent from the audit commit).`)
if (lost > 0) {
  console.log('LOST citations need a human: re-baseline the quote to its 4232ed4 text, or mark the finding `remediated_by`.')
}
