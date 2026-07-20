// tests/rom-clock-sources.test.ts
//
// RED source-rule guard for story tp1-1 — THE REBASE. Audit §3.
//
// AC1 ("ROM_FPS ... is the only place that number is written") and AC2 ("Grep
// proves zero remaining bare 60s used as a frame rate in src/core/") are claims
// about the SOURCE TEXT, not about runtime values, so only a source-reading test
// can hold them. rom-clock.test.ts can pass with a dozen stray 60s still littered
// through the tree; this file is what makes the rebase COMPLETE rather than merely
// correct at the four call sites someone happened to look at.
//
// Pure fs/text, node env (vite.config.ts sets `environment: 'node'`), reads only
// tempest's own files.
//
// ── Comments are stripped before every check ────────────────────────────────
// rules.ts is thick with prose like "ROM (rev-3) values are 60 Hz per-frame" and
// "climb frames between flips at 60 Hz". Those are DOCUMENTATION of the bug and
// its history, and several of them should survive the rebase as an explanation of
// what changed. Grepping raw text would fail on all of them and force Dev to
// mangle the comments to get green — so we strip comments and check only code.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'
import { violations } from './helpers/purity-scanner.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel: string): string => readFileSync(join(root, rel), 'utf8')

// Strip // line comments and /* block */ comments, leaving executable code only.
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function tsFilesUnder(relDir: string): string[] {
  const out: string[] = []
  const walk = (abs: string): void => {
    for (const entry of readdirSync(abs)) {
      const p = join(abs, entry)
      if (statSync(p).isDirectory()) walk(p)
      else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) out.push(relative(root, p))
    }
  }
  walk(join(root, relDir))
  return out.sort()
}

const CORE_FILES = tsFilesUnder('src/core')

describe('AC2 — zero bare 60s used as a frame rate anywhere in src/core', () => {
  // `* 60` and `/ 60` are the two shapes a frame rate takes. Note that the
  // NON-rate 60s in core do not match this pattern and are therefore safe by
  // construction, which is exactly why the pattern is written this way:
  //   • geometry.ts:18  FAR_RATIO = 60 / 300   -> "60 /", never "/ 60"
  //   • rules.ts:82     level >= 60            -> no operator
  //   • geometry.ts     0x60 in the tube tables -> a different token
  // (rom-clock.test.ts pins all three as a negative control, so a dev who
  // "fixes" them by mistake fails there rather than silently shipping.)
  const RATE_60 = /[*/]\s*60\b/

  it('finds no `* 60` or `/ 60` in any src/core file', () => {
    expect(CORE_FILES.length, 'non-vacuous: core files were actually discovered').toBeGreaterThan(3)

    const offenders: string[] = []
    for (const file of CORE_FILES) {
      const code = stripComments(read(file))
      code.split('\n').forEach((line, i) => {
        if (RATE_60.test(line)) offenders.push(`${file}:${i + 1}: ${line.trim()}`)
      })
    }
    expect(offenders, `frame-rate 60s still in src/core:\n${offenders.join('\n')}`).toEqual([])
  })

  it('finds no bare 82.5 — the hidden 60 (1.375 x 60) that a grep for "60" cannot see', () => {
    // PULSAR_CLIMB_SPEED = 82.5 / WARP_ALONG_SPAN. There is no "60" on that line,
    // so AC2's grep passes it and the bug survives the rebase. This is the only
    // check that catches it in the source text.
    const offenders: string[] = []
    for (const file of CORE_FILES) {
      const code = stripComments(read(file))
      code.split('\n').forEach((line, i) => {
        if (/\b82\.5\b/.test(line)) offenders.push(`${file}:${i + 1}: ${line.trim()}`)
      })
    }
    expect(offenders, `82.5 is 1.375 x 60 — rebase it:\n${offenders.join('\n')}`).toEqual([])
  })
})

describe('AC1 — ROM_FPS is written in exactly one place', () => {
  it('declares 256/9 once, in src/core, and nowhere else', () => {
    const all = [...CORE_FILES, ...tsFilesUnder('src/shell'), 'src/main.ts']
    const sites: string[] = []
    for (const file of all) {
      let code: string
      try {
        code = stripComments(read(file))
      } catch {
        continue // main.ts may not exist in every layout
      }
      code.split('\n').forEach((line, i) => {
        if (/\b256\s*\/\s*9\b/.test(line)) sites.push(`${file}:${i + 1}`)
      })
    }
    expect(sites, `256/9 must be written once. Found: ${sites.join(', ')}`).toHaveLength(1)
    expect(sites[0].startsWith('src/core/'), '256/9 belongs in the pure core').toBe(true)
  })

  it('exports ROM_FPS and SIM_STEP from rules.ts — the FR-012 decision lives in code', () => {
    const rules = stripComments(read('src/core/rules.ts'))
    expect(rules).toMatch(/export\s+const\s+ROM_FPS\b/)
    expect(rules).toMatch(/export\s+const\s+SIM_STEP\b/)
  })

  it('records the FR-012 rationale in rules.ts — AC3 says "DECIDED IN WRITING"', () => {
    // The one place a comment is REQUIRED rather than stripped. AC3 is explicit:
    // "The choice is recorded in rules.ts with rationale". A future dev who finds
    // SIM_STEP and does not know why it is what it is will re-introduce the bug.
    const raw = read('src/core/rules.ts')
    const decl = raw.indexOf('SIM_STEP')
    expect(decl, 'SIM_STEP must exist to be documented').toBeGreaterThan(-1)
    // Some prose must sit above the declaration.
    const preamble = raw.slice(Math.max(0, decl - 600), decl)
    expect(preamble, 'SIM_STEP needs a rationale comment above it').toMatch(/\/\/|\/\*/)
    expect(raw).toMatch(/FR-012|256\s*\/\s*9|28\.4/)
  })
})

describe('AC4 — the shell stops inventing its own clock', () => {
  it('loop.ts does not declare its own 1/60 — it takes the step from the core', () => {
    // loop.ts:9 `const STEP = 1 / 60` is the single line that sets the pace of every
    // frame-counted timer in the sim. Leaving it while rebasing rules.ts is the
    // most likely half-done rebase there is.
    const loop = stripComments(read('src/shell/loop.ts'))
    expect(loop).not.toMatch(/[*/]\s*60\b/)
    expect(loop, 'the shell must consume the core\'s step, not mint one').toMatch(/SIM_STEP/)
  })

  it('render.ts does not advance renderTime by a hard-coded 1/60', () => {
    // render.ts:905 `renderTime += 1 / 60` — inside a function that ALREADY receives
    // dt. It drives every glyph animation phase, so at 144 Hz the whole game's
    // animation runs at the wrong speed too.
    const render = stripComments(read('src/shell/render.ts'))
    expect(render).not.toMatch(/renderTime\s*\+=\s*1\s*\/\s*60/)
    expect(render).toMatch(/renderTime\s*\+=\s*dt/)
  })
})

describe('the core purity boundary — what FR-017 must not break (rule guard)', () => {
  // CLAUDE.md's hard architectural rule. FR-017 moves the starfield off
  // requestAnimationFrame and onto the sim; if that work drags the starfield's
  // shell dependencies into src/core, the pure deterministic core stops being
  // either. This is the highest-risk rule violation in the whole story, so it gets
  // its own guard rather than trusting a reviewer to spot it in the diff.
  //
  // td1-2 (GREEN) moved this sweep onto the shared TypeScript-compiler-API
  // scanner in tests/helpers/purity-scanner.ts (ported from joust's
  // jt1-7/jt1-11), replacing the inline `FORBIDDEN` regex table that only
  // stripped comments and never strings — a false negative AND a false
  // positive source (see tests/purity-scanner.test.ts).

  it('keeps src/core free of DOM, wall-clock time and ambient randomness', () => {
    const offenders: string[] = []
    for (const file of CORE_FILES) {
      const hits = violations(read(file), file).filter((h) => !h.startsWith('import from shell/'))
      if (hits.length) offenders.push(`${file}: ${hits.join(', ')}`)
    }
    expect(offenders, `src/core must stay pure:\n${offenders.join('\n')}`).toEqual([])
  })

  it('keeps src/core from importing src/shell', () => {
    const offenders: string[] = []
    for (const file of CORE_FILES) {
      const hits = violations(read(file), file)
      if (hits.some((h) => h.startsWith('import from shell/'))) offenders.push(file)
    }
    expect(offenders, `src/core must not import from src/shell:\n${offenders.join('\n')}`).toEqual([])
  })
})

// tp1-1 rework (Reviewer, round 2) — the held-arrow spinner banks displacement over SIM
// time, via the loop's onStep hook, and must never read the wall clock. That is a wiring
// claim about main.ts, which boots a canvas and cannot be imported here (see
// tests/shell/audio.test.ts for the same constraint), so it is held as a source rule.
// The behaviour is pinned in tests/shell/input.spinner.test.ts; what THIS guards is that
// the tick is actually connected — delete the one line in main.ts and every behavioural
// test still passes while the shipped keyboard silently stops turning.
describe('the keyboard spinner is wired to the sim clock, not the wall clock', () => {
  it('main.ts feeds input.tick(dt) from the loop step hook', () => {
    const main = stripComments(read('src/main.ts'))
    expect(main, 'input.tick(dt) must be called with the sim dt').toMatch(
      /input\.tick\(\s*dt\s*\)/,
    )
  })

  it('shell/input.ts reads no wall clock', () => {
    // The round-2 defect in one line: a keyboard that reads performance.now() banks the
    // time the sim discarded on pause and on a stall. It has no business knowing the hour.
    const input = stripComments(read('src/shell/input.ts'))
    expect(input).not.toMatch(/\bperformance\.now\b/)
    expect(input).not.toMatch(/\bDate\.now\b/)
  })
})
