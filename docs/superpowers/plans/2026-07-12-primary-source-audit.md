# Tempest Primary-Source Fidelity Audit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a verified, citation-backed inventory of every place our Tempest clone diverges from Dave Theurer's original 1981 Atari source, then file a sprint epic from the divergences the user rules "fix".

**Architecture:** Eight auditor subagents each own one source↔ours subsystem pair and emit findings as JSON. A citation checker — built first, TDD — mechanically rejects any finding that does not cite a real line on both sides, or that cites a module which never shipped. A refutation pass then attacks every claimed divergence. Only survivors are synthesised into the audit doc.

**Tech Stack:** TypeScript, Node 20, Vitest 4 (`environment: 'node'`). No new dependencies — findings are JSON, parsed with `JSON.parse`.

**Spec:** `docs/superpowers/specs/2026-07-12-primary-source-audit-design.md`

## Global Constraints

- **The audit produces no code fixes.** Every fix lands later, in the epic's stories, after the user rules on each finding. A task that "helpfully" fixes a divergence is a failed task.
- **The primary source is at `$TEMPEST_SOURCE_DIR`**, default `/Users/slabgorb/Projects/tempest-source-text` (LF line endings). `/Users/slabgorb/Projects/tempest-source` is the same content with CRLF — **never cite it**, its line numbers are the same but its bytes are not.
- **The source is Atari's copyrighted code. Never copy it into this repo.** Findings quote single lines only, as evidence. The checker degrades gracefully when the source directory is absent, so CI still runs.
- **Only these modules shipped** (from `ALEXEC.MAP`, the 27-AUG-81 build): `ALWELG`, `ALSCOR`, `ALDISP`, `ALEXEC`, `ALSOUN`, `ALVROM`, `ALCOIN`, `ALLANG`, `ALHARD`, `ALTEST`, `ALEARO`, `ALVGUT`. Plus `ALCOMN`, which is `.INCLUDE`d rather than linked. **`ALDIS2`, `ALSCO2`, `ALHAR2`, `ALTES2` and `ANVGAN` never shipped** — a citation to any of them is invalid and the checker rejects it.
- **Every finding cites both sides** — a source file+line and one of our files+line — plus the verbatim text of each line. No citation, no finding.
- **Classes are exactly:** `DIVERGENCE`, `CONFIRMED`, `BOOK_WAS_WRONG`, `STRUCTURAL`, `NO_COUNTERPART`.
- **Theurer's vocabulary is not ours.** cursor = player/claw. charges = bullets. invaders = active enemies. nymphs = enemies at the top of the well before they hatch. enemy lines = spikes. well = tube.

## Spec amendment (adopted by this plan)

The spec's scope section listed neither `ALHARD` (in) nor (out). `ALHARD` is the **IRQ handler** — it *is* the 60 Hz frame cadence, which is the anchor for every `STRUCTURAL` float-vs-integer finding. It is **in scope**, assigned to Task 8.

---

## File Structure

| File | Responsibility |
|---|---|
| `tools/audit/linked-modules.mjs` | The single list of modules that shipped. Imported by checker and tests; nothing else hardcodes it. |
| `tools/audit/check-citations.mjs` | Validates one findings array against the schema and both sides' citations. Pure — takes a source-dir path, returns errors. |
| `tests/audit/citations.test.ts` | Runs the checker over every findings file in the repo. Node env (reads `src/` off disk). |
| `docs/audit/findings/pair-N-<slug>.json` | One file per auditor. The raw, machine-checked findings. |
| `docs/2026-07-12-tempest-primary-source-audit.md` | The synthesised human-facing audit. Supersedes `docs/tempest-1981-source-findings.md`. |

`tools/audit/` is new; it sits beside the existing `tools/pokey-bake/`.

## The findings schema

Each `docs/audit/findings/pair-N-<slug>.json` is a JSON array of findings:

```json
[
  {
    "id": "W-001",
    "class": "DIVERGENCE",
    "title": "Flipper flip cadence is time-based, not frame-table driven",
    "source": {
      "file": "ALWELG.MAC",
      "line": 1234,
      "verbatim": "\tLDA I,0C\t;FLIPPER FLIP TIME"
    },
    "ours": {
      "file": "src/core/enemies/flipper.ts",
      "line": 12,
      "verbatim": "const FLIP_SECONDS = 0.25"
    },
    "claim": "The ROM flips on a 12-frame counter; we flip on a 0.25s timer, which is 15 frames at 60Hz.",
    "reasoning": "…",
    "recommendation": "fix",
    "size": "s"
  }
]
```

Field rules the checker enforces:

- `id` — unique across **all** findings files. Prefix per pair: `W` (ALWELG), `V` (ALVROM), `DA` (ALDISP-A), `DB` (ALDISP-B), `S` (ALSOUN), `SC` (ALSCOR), `X` (ALEXEC), `B` (book reconciliation).
- `class` — one of the five.
- `source` — required always. `source.file` must be a shipped module.
- `ours` — required, **except** `class: "NO_COUNTERPART"`, where it must be `null`.
- `recommendation` — `fix` | `accept` | `wont_fix`. Required **except** for `class: "CONFIRMED"`.
- `size` — `s` | `m` | `l`. Required when `recommendation` is `fix`.
- `verdict` — absent until Task 10 writes `CONFIRMED` or `REFUTED`.

---

## Auditor prompt template

Tasks 2–8 each dispatch one auditor. They share this prompt; each task below supplies the bracketed values verbatim. Assemble the prompt by substituting them — do not paraphrase the template.

```
You are auditing a browser clone of Atari's 1981 Tempest against Dave Theurer's
ORIGINAL 1981 Atari assembler source. You are producing evidence, not opinions,
and NOT fixing anything.

PRIMARY SOURCE (read-only, never modify, never copy into the repo):
  [SOURCE_FILES]
  Located in: /Users/slabgorb/Projects/tempest-source-text  (LF endings — cite THIS one)
  Do NOT read or cite /Users/slabgorb/Projects/tempest-source (CRLF, same content).

OUR CODE:
  [OUR_FILES]
  Repo root: /Users/slabgorb/Projects/a-3/tempest

YOUR SCOPE: [SCOPE]

CRITICAL — modules that never shipped. ALEXEC.MAP records the real 27-AUG-81
build. ALDIS2, ALSCO2, ALHAR2, ALTES2 and ANVGAN are NOT in it. They are
near-identical decoy variants (ALDIS2 differs from ALDISP by ONE operand). If
you cite one, your finding is invalid and will be thrown away. Cite only:
ALWELG, ALSCOR, ALDISP, ALEXEC, ALSOUN, ALVROM, ALCOIN, ALLANG, ALHARD,
ALTEST, ALEARO, ALVGUT, ALCOMN.

VOCABULARY. Theurer's names are not ours:
  cursor = player/claw · charges = bullets · invaders = active enemies
  nymphs = enemies at the top of the well, before they hatch (we may have no
  such concept — that is itself a finding) · enemy lines = spikes · well = tube

OUTPUT. Write a JSON array to [OUTPUT_PATH]. Each finding:

  id           "[PREFIX]-001", "[PREFIX]-002", … unique, sequential
  class        DIVERGENCE      we differ and we are probably wrong
               CONFIRMED       we match (RECORD THESE — they are what makes
                               the audit trustworthy; do not omit them)
               BOOK_WAS_WRONG  the source contradicts a constant we took from
                               the "Tempest vs Tempest" book
               STRUCTURAL      differs only because we are float/dt and the
                               arcade is integer on a 60Hz IRQ
               NO_COUNTERPART  exists in the arcade, absent from us entirely
  title        one line
  source       { file, line, verbatim }  — verbatim is the EXACT text of that
               line, copied byte-for-byte including leading tabs
  ours         { file, line, verbatim }  — path relative to the repo root, e.g.
               "src/core/sim.ts". null ONLY when class is NO_COUNTERPART.
  claim        what differs, concretely — values, not adjectives
  reasoning    why it matters, or why it is acceptable
  recommendation  fix | accept | wont_fix   (omit only when class=CONFIRMED)
  size         s | m | l   (only when recommendation=fix)

THE CITATION RULE. A checker will re-open every line you cite and compare it
byte-for-byte against your `verbatim`. If it does not match, your finding is
DELETED — not corrected, not softened. Deleted. So: open the file, read the
actual line, copy it exactly. Do not reconstruct a line from memory. Do not
guess a line number. If you cannot cite it, you do not get to claim it.

Be honest about size. If our five hand-written enemy state machines do not map
onto the source's structure, say the fix is a rewrite. Do not describe a
rewrite as a constant tweak.

Return, as your final message, ONLY a one-paragraph summary: how many findings
of each class, and the single most consequential one.
```

---

### Task 1: Findings schema + citation checker

The checker is the spine of the whole audit — nothing downstream can be trusted without it. It is built first, and TDD, because every later task's output is gated on it.

**Files:**
- Create: `tools/audit/linked-modules.mjs`
- Create: `tools/audit/check-citations.mjs`
- Create: `tests/audit/citations.test.ts`
- Create: `docs/audit/findings/.gitkeep`

**Interfaces:**
- Produces: `LINKED_MODULES: string[]` (from `linked-modules.mjs`); `checkFindings(findings: object[], opts: { repoRoot: string, sourceDir: string | null }) => string[]` — returns an array of human-readable error strings, empty when all findings are valid.

- [ ] **Step 1: Write the failing test**

Create `tests/audit/citations.test.ts`. It must be node-env (it reads files off disk); `vite.config.ts` already sets `environment: 'node'` globally, so no `@vitest-environment` pragma — and do **not** add one, a jsdom pragma breaks `fileURLToPath(import.meta.url)` at module load.

```ts
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
```

Note the deliberate split: the `ours`-side check, the schema, and the never-shipped rule run **always**, including in CI where the Atari source is absent. Only the source-side byte comparison is skipped. Most of the checker's value survives CI.

- [ ] **Step 2: Run the test and watch it fail**

Run: `cd /Users/slabgorb/Projects/a-3/tempest && npm test -- citations`
Expected: FAIL — `Failed to resolve import "../../tools/audit/check-citations.mjs"`.

- [ ] **Step 3: Write `tools/audit/linked-modules.mjs`**

```js
// The modules actually linked into the shipped 27-AUG-81 build, per ALEXEC.MAP:
//   BIN:ALEXEC,ALEXEC.XX=OBJ:ALWELG,ALSCOR,ALDISP,ALEXEC,ALSOUN,ALVROM/C
//                            ALCOIN,ALLANG,ALHARD,ALTEST,ALEARO,ALVGUT
// ALCOMN is .INCLUDEd by ALWELG rather than linked, so it is real too.
// ALDIS2/ALSCO2/ALHAR2/ALTES2/ANVGAN are absent from the link string: they are
// near-identical variants that never shipped. ALDIS2 differs from ALDISP by a
// single operand (EOR I,02A vs EOR I,029), so a citation to it looks perfectly
// plausible and is perfectly wrong.
export const LINKED_MODULES = [
  'ALWELG', 'ALSCOR', 'ALDISP', 'ALEXEC', 'ALSOUN', 'ALVROM',
  'ALCOIN', 'ALLANG', 'ALHARD', 'ALTEST', 'ALEARO', 'ALVGUT',
  'ALCOMN',
]
```

- [ ] **Step 4: Write `tools/audit/check-citations.mjs`**

```js
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { LINKED_MODULES } from './linked-modules.mjs'

const CLASSES = ['DIVERGENCE', 'CONFIRMED', 'BOOK_WAS_WRONG', 'STRUCTURAL', 'NO_COUNTERPART']
const RECOMMENDATIONS = ['fix', 'accept', 'wont_fix']
const SIZES = ['s', 'm', 'l']

const lineCache = new Map()
function lineAt(path, n) {
  if (!lineCache.has(path)) {
    if (!existsSync(path)) return undefined
    lineCache.set(path, readFileSync(path, 'utf8').split('\n'))
  }
  return lineCache.get(path)[n - 1]
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
    if (f.class === 'NO_COUNTERPART') {
      if (f.ours !== null) errors.push(`${id}: NO_COUNTERPART requires \`ours\` to be null`)
    } else if (!f.ours?.file) {
      errors.push(`${id}: class ${f.class} requires \`ours\` (only NO_COUNTERPART may omit it)`)
    } else {
      const actual = lineAt(join(repoRoot, f.ours.file), f.ours.line)
      if (actual === undefined) {
        errors.push(`${id}: ours ${f.ours.file}:${f.ours.line} does not exist`)
      } else if (actual.trimEnd() !== String(f.ours.verbatim).trimEnd()) {
        errors.push(
          `${id}: ours ${f.ours.file}:${f.ours.line} does not match verbatim\n` +
            `  cited:  ${JSON.stringify(f.ours.verbatim)}\n` +
            `  actual: ${JSON.stringify(actual)}`,
        )
      }
    }
  }

  return errors
}
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `cd /Users/slabgorb/Projects/a-3/tempest && npm test -- citations`
Expected: PASS — 6 tests in `checkFindings`, plus the source-side suite if `TEMPEST_SOURCE_DIR` resolves.

- [ ] **Step 6: Confirm the full suite is still green**

Run: `cd /Users/slabgorb/Projects/a-3/tempest && npm test && npm run build`
Expected: PASS, and `tsc --noEmit` clean.

- [ ] **Step 7: Commit**

```bash
git add tools/audit tests/audit docs/audit
git commit -m "test(audit): citation checker rejects unshipped modules and bad line cites"
```

---

### Tasks 2–8: the eight auditors

Each dispatches one subagent with the template above, filled in as specified. Every one of these tasks has the same five steps, so they are written once here and the per-task blocks below supply only the values.

**The five steps, for each of Tasks 2–8:**

- [ ] **Step 1:** Assemble the auditor prompt from the template, substituting this task's `[SOURCE_FILES]`, `[OUR_FILES]`, `[SCOPE]`, `[OUTPUT_PATH]`, `[PREFIX]`.
- [ ] **Step 2:** Dispatch it with the Agent tool (`subagent_type: "general-purpose"`). These are independent — dispatch Tasks 2–8's agents concurrently in a single message if executing inline.
- [ ] **Step 3:** Run the checker over the new file.
  Run: `cd /Users/slabgorb/Projects/a-3/tempest && npm test -- citations`
  Expected: PASS. **If a finding fails the byte-for-byte citation check, delete that finding.** Do not repair it — a miscited finding is one the auditor did not actually verify, and repairing it launders a guess into evidence. Re-dispatch for that subsystem if the loss is material.
- [ ] **Step 4:** Read the agent's summary paragraph and record the class counts.
- [ ] **Step 5:** Commit.
  ```bash
  git add docs/audit/findings/
  git commit -m "docs(audit): findings for <pair name>"
  ```

#### Task 2 — Pair 1: `ALWELG` ↔ simulation & enemies

**This is the highest-value pair in the audit.** `ALWELG` holds the **CAM table**, Theurer's data-driven enemy-movement dispatcher, plus the nymph→invader conversion and the skill-contour tables. Our enemies are five hand-written state machines derived from prose. Expect the honest finding here to be large.

- `[SOURCE_FILES]` — `ALWELG.MAC` (3,569 lines). Pay particular attention to the sections titled: CAM TABLE MACROS, CAM TABLE SUBROUTINE POINTERS, INVADERS - CAM DISPATCHER, PLAY - CONVERT NYMPH TO INVADER, PLAY - DETERMINE NYMPH TYPE, PLAY - DETERMINE SPLIT INVADER CHARACTERISTICS, SKILL CONTOUR TABLES, EASY - MED - HARD OPTIONS, PARAMETER TYPE CODE EXTRACTION VECTORS, PLAY - MAINLINE (TOP OF WELL), PLAY - MAINLINE (DROP MODE).
- `[OUR_FILES]` — `src/core/sim.ts` (774 lines), `src/core/enemies/flipper.ts`, `fuseball.ts`, `pulsar.ts`, `spiker.ts`, `tanker.ts`, `src/core/rules.ts` (difficulty/spawn constants).
- `[SCOPE]` — Enemy movement and state machines; the CAM table and whether our per-enemy modules can express it at all; nymph→invader conversion and whether we model nymphs; enemy splitting; the per-level difficulty curve (skill contour tables) against our hand-tuned constants; the order of the play mainline's tick.
- `[OUTPUT_PATH]` — `docs/audit/findings/pair-1-alwelg-sim-enemies.json`
- `[PREFIX]` — `W`

Add this to the prompt for this pair only:

```
The tick ORDER matters. Determine the exact order the source's PLAY mainline
updates: cursor, nymphs, invaders, charges, enemy fire, collisions, explosions.
Compare it against the order in stepGame() in src/core/sim.ts. An order
difference is a DIVERGENCE even when every individual step is correct.
```

#### Task 3 — Pair 2: `ALVROM` + `ALLANG` ↔ shapes, font, text

- `[SOURCE_FILES]` — `ALVROM.MAC` (2,502 lines) and `ALLANG.MAC` (291 lines, "MESSAGES FOR ALIENS"). Sections: VG ALPHANUMERICS, PICTURES - EXPLOSIONS, PICTURE-PLAYER CHARGE, PICTURES-STAR FIELD, PICTURES - SPIRAL, PICTURES - TANKER, PICTURES - SPARKS, PICTURES - ENEMY SHOTS, SPLAT PIC, FUSE PICS, LOGO, ENEMY PICTURES, FORT ROW-BAR PICS, SHRAPNEL PICTURE, ENEMY PICTURE ADDRESSES, SCORE/LIVES HI SCORE TEMPLATE, TABLE - POINTER TO PICTURES, PICTURE TABLES:SEQUENCES.
- `[OUR_FILES]` — `src/shell/render.ts` (1,016 lines; the shape-drawing code), `src/shell/glyphs.ts` (296 lines), `src/shell/font.ts`, `src/shell/titleLogo.ts`, plus any HUD strings in `src/shell/render.ts`.
- `[SCOPE]` — The literal `VCTR` coordinates and `CSTAT` colours of every shape, against the shapes we draw. The vector font. The on-screen messages and their exact wording and colour. Report per-shape: do our vertices match, and does our palette match.
- `[OUTPUT_PATH]` — `docs/audit/findings/pair-2-alvrom-shapes-font.json`
- `[PREFIX]` — `V`

Add this to the prompt for this pair only:

```
For each shape, ONE finding — not one per vertex. If a shape's vertices differ,
the finding is "the <name> shape's geometry differs", the claim lists the
source's full vertex sequence and ours, and the size reflects redrawing that one
shape. A shape whose vertices match is a CONFIRMED finding; say so.

Decode the macros before comparing. VCTR/RVCTR/SCVEC/ICVEC and the CSTAT colour
names are defined at the top of ALVROM.MAC and in ALCOMN.MAC. If you cannot
decode a macro, say so in `reasoning` and mark the finding accordingly rather
than guessing at coordinates.
```

#### Task 4 — Pair 3: `ALDISP` part A ↔ objects drawn in the well

- `[SOURCE_FILES]` — `ALDISP.MAC` **lines 1–1238 only** (from `.SBTTL DISPLAY-MAINLINE` at line 37 through the end of `DISPLAY BIG BOOM`, which ends where `TABLES-WELL COORDINATES(WORLD)` begins at line 1239). Sections: DISPLAY STATE EXECUTOR, GAME PLAY MAINLINE, BUFFER CONTROL, DISPLAY-NYMPHS, DISPLAY-CURSOR, DISPLAY-INVADERS (MAINLINE), INVADERS PICS, FLIPPERS, TANKERS, DRAW TRAILER, DRAW JUMP INVADER, TABLE-WORLD COORD OFFSETS (X,Z) FOR JUMPERS, INVADE FUSE PICTURE, PULSAR PIC, DISPLAY-CHARGES, DISPLAY-EXPLOSIONS, SPECIAL EXPLOSION CONTROL/DATABASE/FUNCTION/SUBROUTINE, DISPLAY BIG BOOM.
- `[OUR_FILES]` — `src/shell/render.ts` (the per-object draw calls), `src/shell/fx.ts` (270 lines, explosions), `src/shell/phosphor.ts` (136 lines).
- `[SCOPE]` — How each object in the well is drawn and animated: the cursor, nymphs, each invader type, the jumper world-coordinate offset table, charges, and the explosion database. Not the well itself — that is Task 5.
- `[OUTPUT_PATH]` — `docs/audit/findings/pair-3-aldisp-a-objects.json`
- `[PREFIX]` — `DA`

#### Task 5 — Pair 4: `ALDISP` part B ↔ the well, projection, starfield, spikes

- `[SOURCE_FILES]` — `ALDISP.MAC` **lines 1239–3298 only** (from `TABLES-WELL COORDINATES(WORLD)` to end of file). Sections: TABLES-WELL COORDINATES(WORLD), UTILITY - DISPLAY PIC BETWEEN PTS., UTILITY - DERIVE BINARY AND LINEAR SCALE FACTORS GIVEN DEPTH, UTILITY-DRAW OBJECT BETWEEN POINTS, UTILITY: PROJECT POINT ONTO SCREEN, INITIALIZE DISPLAY, COLORS, INITIALIZE-GRID LINES, INITIALIZE WELL, UTILITY-BUILD WELL DISPLAY BUFFER, DISPLAY-WELL RIM, DISPLAY-DRAW 2 SPOKES, CHECK FOR EYE PAST OBJECT ON WELL, UTILITY-PROJECT OUTLINE, UTILITY-DRAW WELL SHAPE, DISPLAY STAR FIELD (line 2920), DISPLAY-PLANES OF STARS, DISPLAY - ENEMY LINES (line 2993, these are the **spikes**), ENEMY LINES (TIP STUFF), UTILITY - VG ABS POS.
- `[OUR_FILES]` — `src/core/geometry.ts` (292 lines), `src/core/modelView.ts` (61 lines), `src/shell/starfield.ts` (71 lines), `src/shell/render.ts` (the well/tube drawing).
- `[SCOPE]` — The 16 well shapes' actual world coordinate tables against `tubeForLevel()`; the projection and depth→scale-factor maths against `project()` / `perspectiveDepth()` / `FAR_RATIO`; well and spoke colours; the starfield planes; and the spikes ("enemy lines"), including tip rendering.
- `[OUTPUT_PATH]` — `docs/audit/findings/pair-4-aldisp-b-well-projection.json`
- `[PREFIX]` — `DB`

Add this to the prompt for this pair only:

```
The projection maths is the likeliest single explanation for any perspective
wrongness in our clone, so treat "DERIVE BINARY AND LINEAR SCALE FACTORS GIVEN
DEPTH" and "PROJECT POINT ONTO SCREEN" as the centrepiece. Work out what curve
the source's depth→scale actually is, and compare it to perspectiveDepth() in
src/core/geometry.ts. State both formulas explicitly in the claim.
```

#### Task 6 — Pair 5: `ALSOUN` ↔ audio

- `[SOURCE_FILES]` — `ALSOUN.MAC` (386 lines).
- `[OUR_FILES]` — `src/shell/audio.ts` (98 lines), `src/shell/audio-dispatch.ts` (90 lines), and the existing map `docs/ux/2026-06-28-pokey-sfx-rom-map.md`.
- `[SCOPE]` — Every sound: its POKEY register writes, pitch, duration, and the game event that triggers it. We already have a POKEY map derived from secondary sources — your job is to confirm or contradict it against the primary source, so **mark anything the map got wrong as `BOOK_WAS_WRONG`**.
- `[OUTPUT_PATH]` — `docs/audit/findings/pair-5-alsoun-audio.json`
- `[PREFIX]` — `S`

#### Task 7 — Pair 6: `ALSCOR` + `ALEARO` ↔ scoring, high scores

- `[SOURCE_FILES]` — `ALSCOR.MAC` (1,399 lines) and `ALEARO.MAC` (261 lines, EAROM high-score persistence). **Not `ALSCO2.MAC` — it never shipped.**
- `[OUR_FILES]` — `src/core/rules.ts` lines 20–30 (the `SCORE_*` constants and `EXTRA_LIFE_INTERVAL`), plus our high-score and name-entry code (find it: `grep -rl "highscore\|highScore" src/`).
- `[SCOPE]` — Per-enemy score values; the fuseball's depth-banded scoring; spike-shortening points; bonus-score determination; the extra-life interval; rank/rating banners; and how high scores and initials are stored and displayed.
- `[OUTPUT_PATH]` — `docs/audit/findings/pair-6-alscor-scoring.json`
- `[PREFIX]` — `SC`

#### Task 8 — Pair 7: `ALEXEC` + `ALCOMN` + `ALVGUT` + `ALHARD` ↔ state, cadence, RAM map

- `[SOURCE_FILES]` — `ALEXEC.MAC` (603 lines), `ALCOMN.MAC` (1,131 lines — the RAM map and shared constants), `ALVGUT.MAC` (396 lines — vector-generator utilities), `ALHARD.MAC` (186 lines — **the IRQ handler, i.e. the frame cadence**). **Not `ALHAR2.MAC` — it never shipped.**
- `[OUR_FILES]` — `src/core/state.ts` (159 lines), `src/shell/loop.ts` (137 lines), `src/core/rules.ts` (the timing constants).
- `[SCOPE]` — The frame/IRQ cadence and what runs per frame vs per N frames; the RAM map's game-state variables against our `GameState`; the vector-generator frame plumbing. **This pair owns the `STRUCTURAL` findings**: the arcade is integer maths on a 60 Hz IRQ and we are float maths on a `dt`-driven core. Enumerate concretely where that difference actually changes observable behaviour, and where it is merely a different spelling of the same thing.
- `[OUTPUT_PATH]` — `docs/audit/findings/pair-7-alexec-state-cadence.json`
- `[PREFIX]` — `X`

---

### Task 9: Reconcile every constant epic-10 took from the book

The spec's success criteria require that **every** constant epic-10 baked in from the book is explicitly marked `CONFIRMED` or `BOOK_WAS_WRONG`. Tasks 2–8 will catch most of them incidentally. This task closes the gap deliberately, because "we forgot to check that one" is exactly how a wrong constant survives.

**Files:**
- Create: `docs/audit/findings/pair-8-book-reconciliation.json`
- Read: `docs/tempest-1981-source-findings.md`, `/Users/slabgorb/Projects/a-3/sprint/archive/context-epic-10.md`, `/Users/slabgorb/Projects/a-3/sprint/archive/epic-10.yaml`

- [ ] **Step 1: Enumerate the book-derived constants**

Every numeric constant epic-10 introduced. Start from these, which are already known to be book-sourced, and extend by reading the epic's fifteen stories:

```
TIMAX superzapper windows        ZAP_WINDOW_FIRST = 13, ZAP_WINDOW_SECOND = 5   (rules.ts:35-36)
starfield                        spawn $F0, spawn-next $D5, retire $10, step -7  (rules.ts:44)
bullet cap                       MAX_BULLETS = 8                                 (rules.ts:8)
bullet lifetime                  BULLET_SPEED = 2.4 "~25 frames / ~0.42s"        (rules.ts:7)
spike cap                        SPIKE_MAX_DEPTH = 0.75                          (rules.ts:28)
attract demo                     level = RANDOM AND 7, fire within 2 lanes
scoring                          SCORE_* values                                  (rules.ts:21-26)
extra life                       EXTRA_LIFE_INTERVAL = 10000                     (rules.ts:30)
```

Read the epic and the context doc; any constant either one attributes to the book goes on the list.

- [ ] **Step 2: Dispatch the reconciliation agent**

Use the template with:
- `[SOURCE_FILES]` — whichever module owns each constant. You will need `ALWELG`, `ALSCOR`, `ALDISP`, `ALCOMN`.
- `[OUR_FILES]` — `src/core/rules.ts`, plus the specific file each constant lives in.
- `[SCOPE]` — the enumerated list from Step 1, one finding per constant, no exceptions.
- `[OUTPUT_PATH]` — `docs/audit/findings/pair-8-book-reconciliation.json`
- `[PREFIX]` — `B`

Add this to the prompt for this pair only:

```
This pair is a CHECKLIST, not a search. You are given a list of constants that
we took from a secondary source — a book that reproduces hand-typed 6502
listings as images and whose own transcription warns that some operands are OCR
artifacts. For EVERY constant on the list you must emit exactly one finding:

  CONFIRMED       the primary source agrees with the value we shipped
  BOOK_WAS_WRONG  the primary source contradicts it — give both values

There is no third outcome and no skipping. If you cannot locate a constant in
the primary source, emit a NO_COUNTERPART finding saying so explicitly, with
the source module you searched. A constant silently absent from your output is
a failure of this task.
```

- [ ] **Step 3: Verify the count**

Every constant from Step 1 must appear exactly once in the output.

Run: `cd /Users/slabgorb/Projects/a-3/tempest && node -e "const f=require('./docs/audit/findings/pair-8-book-reconciliation.json'); console.log(f.length, 'findings:', f.map(x=>x.class).join(', '))"`
Expected: a count matching Step 1's list, with every finding classified `CONFIRMED`, `BOOK_WAS_WRONG`, or `NO_COUNTERPART`.

- [ ] **Step 4: Run the checker**

Run: `cd /Users/slabgorb/Projects/a-3/tempest && npm test -- citations`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add docs/audit/findings/pair-8-book-reconciliation.json
git commit -m "docs(audit): reconcile epic-10's book-derived constants against the primary source"
```

---

### Task 10: The refutation pass

Every claimed `DIVERGENCE` and `BOOK_WAS_WRONG` gets attacked. A finding that survives an honest attempt to kill it is worth ten that were merely asserted.

**Files:**
- Modify: every `docs/audit/findings/pair-*.json` (adds a `verdict` field)

- [ ] **Step 1: Extract the findings to attack**

Run:
```bash
cd /Users/slabgorb/Projects/a-3/tempest && node -e "
const {readdirSync,readFileSync} = require('fs');
const all = readdirSync('docs/audit/findings').filter(f=>f.endsWith('.json'))
  .flatMap(f=>JSON.parse(readFileSync('docs/audit/findings/'+f,'utf8')));
const attack = all.filter(f=>['DIVERGENCE','BOOK_WAS_WRONG'].includes(f.class));
console.log(attack.length+' to verify of '+all.length+' total');
console.log(attack.map(f=>f.id+' '+f.title).join('\n'));
"
```

- [ ] **Step 2: Dispatch one refuter per finding**

Dispatch concurrently — they are independent. Each gets:

```
You are REFUTING a claimed divergence between a browser clone of Atari's 1981
Tempest and Dave Theurer's original source. Your job is to kill it. A finding
that survives you is trustworthy; one that does not was never real.

THE CLAIM:
[the full finding JSON]

Re-open BOTH cited lines yourself:
  source: /Users/slabgorb/Projects/tempest-source-text/[source.file] line [source.line]
  ours:   /Users/slabgorb/Projects/a-3/tempest/[ours.file] line [ours.line]

Then attack, in this order:

1. Do the cited lines say what the finding says they say?
2. Is the source line being read in context, or has a macro, an assembler
   directive, or a preceding instruction been missed that changes its meaning?
   Decode the macro. Check ALCOMN.MAC for the definition.
3. Is our line actually the code that governs this behaviour, or does something
   else downstream override it?
4. Is the claimed difference real, or is it the same value in different units?
   The arcade counts frames at 60Hz and uses integer maths; we use seconds and
   floats. 12 frames and 0.2 seconds are THE SAME NUMBER. A unit confusion
   dressed up as a divergence is the single most likely way this audit produces
   a false finding — hunt for it specifically.

Return JSON: {"verdict": "CONFIRMED" | "REFUTED", "reasoning": "..."}
Default to REFUTED when you are uncertain. It is much cheaper to re-examine a
wrongly-refuted finding than to act on a wrongly-confirmed one.
```

- [ ] **Step 3: Write the verdicts back**

Add `"verdict": "CONFIRMED"` or `"verdict": "REFUTED"` to each attacked finding in its source file, with the refuter's reasoning appended to `reasoning`. Leave `CONFIRMED`/`STRUCTURAL`/`NO_COUNTERPART` class findings untouched — they were never attacked and get no verdict.

- [ ] **Step 4: Report the kill rate**

Run:
```bash
cd /Users/slabgorb/Projects/a-3/tempest && node -e "
const {readdirSync,readFileSync} = require('fs');
const all = readdirSync('docs/audit/findings').filter(f=>f.endsWith('.json'))
  .flatMap(f=>JSON.parse(readFileSync('docs/audit/findings/'+f,'utf8')));
const a = all.filter(f=>f.verdict);
console.log('attacked:', a.length, '| survived:', a.filter(f=>f.verdict==='CONFIRMED').length,
            '| refuted:', a.filter(f=>f.verdict==='REFUTED').length);
"
```

A refutation rate of zero is itself suspicious — it means the refuters rubber-stamped. Read three refuted findings and three survivors by hand before trusting the numbers.

- [ ] **Step 5: Run the checker and commit**

Run: `cd /Users/slabgorb/Projects/a-3/tempest && npm test -- citations`
Expected: PASS.

```bash
git add docs/audit/findings/
git commit -m "docs(audit): refutation pass — verdicts on every claimed divergence"
```

---

### Task 11: Synthesise the audit document

**Files:**
- Create: `docs/2026-07-12-tempest-primary-source-audit.md`
- Modify: `docs/tempest-1981-source-findings.md` (add a superseded banner at the top)
- Modify: `CLAUDE.md` (point the fidelity reference at the new doc)

- [ ] **Step 1: Write the audit doc**

Structure, in order:

1. **What this is, and what it supersedes.** State plainly that our clone was built from secondary sources, that this is the primary source, and that `docs/tempest-1981-source-findings.md` is now the historical companion rather than the reference.
2. **Which files are real.** The `ALEXEC.MAP` link string; the fact that `ALDIS2`/`ALSCO2`/`ALHAR2`/`ALTES2`/`ANVGAN` never shipped; that `ALDIS2` differs from `ALDISP` by one operand. Anyone who reads the source directory later will otherwise walk straight into this.
3. **Rosetta glossary.** cursor/charges/invaders/nymphs/enemy lines/well.
4. **Scorecard.** Counts by class, and the refutation kill rate.
5. **Findings, grouped by subsystem**, `DIVERGENCE` first, then `BOOK_WAS_WRONG`, `NO_COUNTERPART`, `STRUCTURAL`, and `CONFIRMED` last. Each renders as: title, both citations with verbatim lines, the claim, the recommendation and size, and — for anything that went through Task 10 — the refuter's verdict.
6. **What the book got wrong.** Every `BOOK_WAS_WRONG` in one table: constant, what we shipped, what the source says, where it entered the code. This is the section with teeth.
7. **Ruling sheet.** Every finding recommended `fix`, as a checklist with an empty decision column, ready for the user to mark fix/accept/won't-fix.

- [ ] **Step 2: Banner the superseded doc**

At the very top of `docs/tempest-1981-source-findings.md`:

```markdown
> **Superseded.** This document was extracted from the *Tempest vs Tempest* book — a
> secondary source that reproduces hand-typed 6502 listings as images. The primary
> source (Theurer's original Atari assembler source) has since been audited directly:
> see [`2026-07-12-tempest-primary-source-audit.md`](./2026-07-12-tempest-primary-source-audit.md),
> which records every place this document was wrong. Kept for its narrative and
> historical chapters; do not take a constant from it.
```

- [ ] **Step 3: Point `CLAUDE.md` at the new reference**

Add to the tempest `CLAUDE.md`, near the north-star design doc line:

```markdown
Fidelity reference: `docs/2026-07-12-tempest-primary-source-audit.md` — our
implementation audited against Theurer's original 1981 source. Take arcade
constants from there, not from the book-derived findings doc.
```

- [ ] **Step 4: Verify and commit**

Run: `cd /Users/slabgorb/Projects/a-3/tempest && npm test && npm run build`
Expected: PASS.

```bash
git add docs/ CLAUDE.md
git commit -m "docs(audit): tempest implementation audited against the 1981 primary source"
```

- [ ] **Step 5: Open the PR**

```bash
git push -u origin chore/primary-source-audit-spec
gh pr create --base develop \
  --title "docs: audit tempest against Theurer's 1981 primary source" \
  --body "$(cat <<'EOF'
Audits our clone against the original Atari source. Findings are citation-checked
(`npm test -- citations`) and every claimed divergence survived a refutation pass.

Establishes that `ALEXEC.MAP`, not the directory listing, says what shipped:
`ALDIS2`/`ALSCO2`/`ALHAR2`/`ALTES2`/`ANVGAN` never did.

No code changes. Fixes land in the follow-on epic, per the user's rulings.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

### Task 12: File the epic — **gated on the user**

**Do not start this task until the user has ruled on the ruling sheet.** The whole design of this audit is that the user rules per item on a verified list. An agent that files stories from its own recommendations has quietly promoted itself to the decision-maker.

**Files:**
- Create: `/Users/slabgorb/Projects/a-3/sprint/epic-tp1.yaml`
- Create: `/Users/slabgorb/Projects/a-3/sprint/context/context-epic-tp1.md`
- Modify: `/Users/slabgorb/Projects/a-3/sprint/current-sprint.yaml` (add `tp1` to `epics`)

- [ ] **Step 1: Present the ruling sheet and stop.** Every finding recommended `fix`, with its size, grouped by subsystem. Ask for fix/accept/won't-fix on each. Confirm the epic id (`tp1`) and note that the sprint's existing ids are `SH2`, `sw5`, `lb2` — there is no tempest epic, which is what this fills.

- [ ] **Step 2: Write `sprint/epic-tp1.yaml`.** One story per finding ruled `fix`. Each story's description cites the finding id and both source and ours citations, so the implementer can re-open the evidence without re-reading the audit. Points from `size`: s=1, m=3, l=5. Workflow `tdd`. `repos: tempest`.

- [ ] **Step 3: Write the epic context doc** summarising the audit and linking it.

- [ ] **Step 4: Add `tp1` to `current-sprint.yaml`'s `epics` list.** The sprint goal is already "ROM fidelity".

- [ ] **Step 5: Commit in the orchestrator.**

Note: the orchestrator's `main` is protected by the pf hook, and `cd x && git ...` fails in a way that leaves the shell in the *previous* directory. Change directory in its own call, confirm with `pwd`, then commit.

```bash
git add sprint/
git commit -m "chore(sprint): file epic tp1 — tempest primary-source fidelity"
```

---

## Self-Review

**Spec coverage.** Every spec section maps to a task: the seven pairs → Tasks 2–8; the citation rule and finding classes → Task 1 (mechanised, not merely asked for); the verify pass → Task 10; the audit doc, Rosetta glossary and supersession → Task 11; the deviation policy and per-item ruling → Task 12; the "every book constant checked" success criterion → Task 9, which exists solely because Tasks 2–8 would have covered it only incidentally. The spec's `ALHARD` gap is closed by the amendment above and assigned to Task 8.

**Placeholders.** None. Every agent prompt is given in full; every code step carries its code; every command carries its expected output.

**Type consistency.** `checkFindings(findings, { repoRoot, sourceDir })` and `LINKED_MODULES` are defined in Task 1 and used with those exact names and shapes in Tasks 2–10. The finding field names (`id`, `class`, `title`, `source`, `ours`, `claim`, `reasoning`, `recommendation`, `size`, `verdict`) are identical across the schema, the checker, the auditor prompt, the refuter prompt, and the Task 12 story mapping. Class and recommendation enums match the checker's arrays exactly.

**One risk this plan does not remove.** The checker proves a finding *cites a real line*. It cannot prove the finding *reasoned correctly about that line* — that is what Task 10's refuters are for, and they are themselves fallible. Step 4 of Task 10 exists because a zero-refutation rate means the refuters rubber-stamped, and that is the failure mode most likely to put a confident falsehood into the audit doc.
