// tests/purity-scanner.test.ts
//
// Story td1-2 — RED phase (Han Solo / TEA). Fold joust's AST core/shell purity
// scanner back into tempest. joust proved (jt1-7 + jt1-11) that a regex
// comment/string stripper cannot tell CODE from TEXT-THAT-LOOKS-LIKE-CODE.
//
// tempest's canonical core/shell guard is the recursive src/core sweep in
// tests/rom-clock-sources.test.ts:150-185 (`const FORBIDDEN` regex table over
// stripComments'd source; tp1-4 names it as THE guard cam.ts inherits for free).
// It strips ONLY comments — never strings — so it behaves differently from
// centipede's and from joust's history. Two consequences, both measured this
// session against the LIVE tempest scanner:
//
//   • It OVER-flags string data (a false POSITIVE): `const err = "window.open
//     failed"` -> [window]. joust reads that string as data -> []. The port FIXES
//     this — pinned in "no false positives" below. This is a deliberate SEMANTIC
//     CHANGE the port makes; it is safe because no real tempest core module
//     currently carries a banned name in a string (the suite is green).
//   • Because it never blanks strings, the canonical FN-3 (`\`t${Math.random()}\``)
//     and canonical FN-5 (`const readClock = Date.now`) are ALREADY caught (the
//     literal survives the comment-only strip). They are re-aimed below at
//     constructions tempest genuinely misses — same evasion family, tempest tokens.
//
// ─── THESE ARE TRUE REDS, NOT "the file doesn't exist yet" REDS ───────────────
// Every MUST FLIP case was reproduced against tempest's CURRENT scanner before
// being written, with a live `Math.random()` control. Measured old-scanner output:
//
//   FN-1 string-embedded /*        tempest(old) -> []  (a `/*` in a string opens a
//                                  phantom block that swallows the live Date.now())
//   FN-2 string-embedded //        tempest(old) -> []  (a `//` in a string
//                                  truncates the line, eating performance.now())
//   FN-3 interpolation via [ ]     tempest(old) -> []  (`${Math["random"]()}` — the
//                                  literal `Math.random` never appears)
//   FN-4 Math destructure          tempest(old) -> []  (no alias detection at all)
//   FN-5 element-access alias      tempest(old) -> []  (`Date["now"]` — the literal
//                                  `Date.now` never appears)
//   FN-6 string carrying BOTH      tempest(old) -> []  (phantom block again)
//   BONUS miscased ../SHELL/       tempest(old) -> []  (case-sensitive import ban)
//
// So the port CLOSES a real hole in each case. A GREEN that re-exported the old
// regex table into helpers/ would still FAIL every MUST FLIP test.
//
// ─── REPO-SPECIFIC BAN SET (the port MUST preserve it — do NOT copy joust's) ──
// tempest's core bans EXACTLY: requestAnimationFrame, Date.now, new Date,
// performance.now, Math.random, document.*, window.*, and shell imports. That is
// the whole surface — tempest bans NONE of joust's setTimeout / localStorage /
// fetch / eval / new Function / globalThis / navigator / crypto / process /
// HTMLCanvasElement / AudioContext. Build the AST tables from THIS set:
//   BANNED_OBJECTS {window, document}   BANNED_MEMBERS {Date.now, Math.random,
//   performance.now}   BANNED_CALLS {requestAnimationFrame}   BANNED_CONSTRUCTORS
//   {Date}   ALIASABLE {Date, Math, performance, window, document}   + case-
//   insensitive shell import.
// The alias/element-access closure the six require only closes evasions of bans
// tempest ALREADY has (Math.random, Date.now, performance.now) — it adds no new
// surface. Do not import joust's wider tables; that would silently expand
// tempest's ban set.
//
// Pure fs/text, node env (vite.config.ts sets environment:'node'), repo-local.

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const coreDir = join(repoRoot, 'src', 'core')
const scannerPath = join(repoRoot, 'tests', 'helpers', 'purity-scanner.ts')

type Violations = (source: string, filename?: string) => string[]

/**
 * Load the ported AST scanner. GREEN (Dev) creates
 * tempest/tests/helpers/purity-scanner.ts on the TypeScript compiler API
 * (ts.createSourceFile — NOT acorn, which is JS-only and not in the Vite 8 tree)
 * exporting `violations(source, filename?): string[]`, and migrates the src/core
 * sweep off the inline FORBIDDEN regex table onto it.
 */
async function loadScanner(): Promise<Violations> {
  const specifier = ['.', 'helpers', 'purity-scanner.js'].join('/')
  try {
    const mod = (await import(/* @vite-ignore */ specifier)) as { violations?: Violations }
    if (typeof mod.violations !== 'function') throw new Error('module has no `violations` export')
    return mod.violations
  } catch (e) {
    throw new Error(
      'ported AST purity scanner not built yet — GREEN (Dev) creates ' +
        'tempest/tests/helpers/purity-scanner.ts exporting `violations(source, filename?): string[]`, ' +
        'tokenizing via ts.createSourceFile, preserving TEMPEST’s ban set (see header), ' +
        `and migrates the src/core sweep onto it. (${(e as Error).message})`,
    )
  }
}

/** Rule names only, with the `(file:line)` suffix stripped off. */
const rules = async (src: string, file?: string): Promise<string[]> =>
  (await loadScanner())(src, file).map((r) => r.replace(/\s\([^()]*\)$/, ''))

/** Naming-agnostic: matches whether the port names a member 'Date.now' or 'Date.now()'. */
const flags = (hits: string[], re: RegExp): boolean => hits.some((h) => re.test(h))

// ─────────────────────────────────────────────────────────────────────────────
// MUST FLIP — the six false negatives (tempest tokens), each proven red against
// the current FORBIDDEN regex table and green against joust's AST scanner.
// ─────────────────────────────────────────────────────────────────────────────
describe('td1-2 MUST FLIP — false negatives the current regex table misses', () => {
  it('FN-1: a /* inside an ordinary string must not disable the guard', async () => {
    const src = [
      'export const a = "contains /* marker"',
      'export const b = Date.now()',
      '/** an ordinary doc comment, which closes the phantom block */',
      'export const z = 1',
    ].join('\n')
    const hits = await rules(src)
    expect(flags(hits, /\bDate\.now/), `Date.now() sits inside the swallowed span, got: [${hits}]`).toBe(true)
  })

  it('FN-2: a // inside a string must not truncate the line', async () => {
    const hits = await rules('export const c = "a//b" + performance.now()')
    expect(flags(hits, /\bperformance\.now/), `got: [${hits}]`).toBe(true)
  })

  it('FN-3: template interpolation is live code (reached here via element access)', async () => {
    // `${...}` holds a live call; tempest never blanks the template, but it also
    // never sees the literal `Math.random` because it is spelled `Math["random"]`.
    const hits = await rules('export const e = `t${Math["random"]()}`')
    expect(flags(hits, /\bMath\.random/), `got: [${hits}]`).toBe(true)
  })

  it('FN-4: destructuring an alias must not evade a member-anchored ban', async () => {
    const hits = await rules(['const { random } = Math', 'export const f = random()'].join('\n'))
    expect(hits.length, `aliasing Math.random by destructuring must be reported, got: [${hits}]`).toBeGreaterThan(0)
  })

  it('FN-5: an element-access alias must not evade a name-anchored ban', async () => {
    // Re-aimed off `const readClock = Date.now` (which tempest catches by the raw
    // `Date.now` literal) onto `Date["now"]`, which re-spells the same member so
    // the literal never appears. joust reads it back to Date.now().
    const hits = await rules(['const readClock = Date["now"]', 'export const g = readClock()'].join('\n'))
    expect(flags(hits, /\bDate\.now/), `got: [${hits}]`).toBe(true)
  })

  it('FN-6: a string carrying BOTH // and /* (no stripping order survives it)', async () => {
    const src = [
      'export const s = "// and /* together"',
      'export const x = Date.now()',
      '/** closer */',
    ].join('\n')
    const hits = await rules(src)
    expect(flags(hits, /\bDate\.now/), `got: [${hits}]`).toBe(true)
  })

  it('BONUS (jt1-7 review): a miscased ../SHELL/ import must still flag', async () => {
    // tempest's shell-import regex has no `i` flag, so '../SHELL/render' (which
    // macOS resolves and RUNS) sails past. old -> []. Porting joust's
    // case-insensitive SHELL_SPECIFIER closes it.
    const hits = await rules("import { r } from '../SHELL/render'\nexport const ok = 1")
    expect(flags(hits, /shell/i), `got: [${hits}]`).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// MUST HOLD — currently caught by the regex table, each boxing a different
// plausible patch. Proven caught against the live scanner; the port keeps them.
// ─────────────────────────────────────────────────────────────────────────────
describe('td1-2 MUST HOLD — cases that box in the fix', () => {
  const holds: ReadonlyArray<readonly [string, string, string, RegExp]> = [
    ['nested template literals', 'a template regex taught about ${} but not nesting',
      'export const n = `a${`b${Date.now()}c`}d`', /\bDate\.now/],
    ['a regex literal containing a quote', 'a char scanner with no regex-literal awareness',
      "export const re = /[']/\nexport const v = Math.random()", /\bMath\.random/],
    ['a regex literal containing /*', 'the same, the other direction',
      'export const re2 = /\\/\\*/\nexport const w = performance.now()', /\bperformance\.now/],
    ['an escaped quote inside a string', 'naive quote pairing that ignores backslash escapes',
      'export const q = "he said \\"hi\\" //"\nexport const y = Math.random()', /\bMath\.random/],
    ['division that resembles a regex literal', 'regex detection that cannot tell / from ÷',
      'export const d1 = 10 / 2, d2 = 4 / 2\nexport const z2 = Date.now()', /\bDate\.now/],
    ['an apostrophe inside a line comment', 'THE most likely FN-1 patch — strings before comments',
      "// don't read the clock here\nexport const t = Date.now()", /\bDate\.now/],
    ['a backtick inside a plain string', 'template handling that treats any backtick as an opener',
      'export const s = "a ` backtick"\nexport const v2 = Math.random()', /\bMath\.random/],
    ['a comment marker inside a template literal', 'comment stripping that runs before template handling',
      'export const tpl = `/* not a comment */`\nexport const w2 = Date.now()', /\bDate\.now/],
    ['a lowercase ../shell/ import', 'coverage the swap must not lose (uppercase is the BONUS flip above)',
      "import { r } from '../shell/render'\nexport const ok = 1", /shell/i],
  ]

  it.each(holds)('%s — blocks: %s', async (_name, _why, src, expected) => {
    const hits = await rules(src)
    expect(flags(hits, expected), `got: [${hits}]`).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// NO FALSE POSITIVES — the AST port's payoff. Note the STRING-DATA block: these
// are cases tempest's OLD scanner WRONGLY flags (it never strips strings); the
// port must read them as data. Measured old: "window.open failed" -> [window],
// "…Math.random() calls" -> [Math.random].
// ─────────────────────────────────────────────────────────────────────────────
describe('td1-2 no false positives — prose, data and legit code stay clean', () => {
  it('banned names in comments still do not flag', async () => {
    expect(await rules('// the shell reads Date.now() and window.devicePixelRatio')).toEqual([])
    expect(await rules('/* seeded rng replaces Math.random() here */ const x = 1')).toEqual([])
    expect(await rules('/**\n * shell owns document.body and the wall clock\n */')).toEqual([])
  })

  it('banned names inside string DATA do not flag (tempest OLD over-flagged these)', async () => {
    expect(await rules('const err = "window.open failed"')).toEqual([])
    expect(await rules("const tip = 'seed replaces Math.random() calls'")).toEqual([])
    expect(await rules('const msg = `shell owns document.body`')).toEqual([])
  })

  it('lookalike identifiers still do not flag', async () => {
    expect(await rules('const windowSize = view.windowSize')).toEqual([])
    expect(await rules('const next = processInput(pad)')).toEqual([])
    expect(await rules('let stamp: Date')).toEqual([])
    expect(await rules('type Timestamp = Date')).toEqual([])
    expect(await rules('function at<T = Date>(): T { return undefined as T }')).toEqual([])
  })

  it('parses TypeScript syntax, not just JavaScript', async () => {
    const ts = [
      'export interface Tube { lanes: number; open: boolean }',
      'export const TABLE = [1, 2, 3] as const',
      'export function pick<T extends object>(x: T): keyof T { return Object.keys(x)[0] as keyof T }',
      'import type { GameState } from "./state.js"',
      'export const enum Dir { Left = -1, Right = 1 }',
    ].join('\n')
    expect(await rules(ts), 'legitimate TypeScript must scan clean').toEqual([])
  })

  it('sweeps every real src/core module clean (AC-2 — no false positives on real code)', async () => {
    const files = readdirSync(coreDir, { recursive: true, encoding: 'utf8' }).filter((f) =>
      String(f).endsWith('.ts'),
    )
    expect(files.length, 'src/core must hold modules for this to mean anything').toBeGreaterThan(0)
    const dirty: string[] = []
    for (const f of files) {
      const hits = await rules(readFileSync(join(coreDir, String(f)), 'utf8'), String(f))
      if (hits.length) dirty.push(`${f}: ${hits.join(', ')}`)
    }
    expect(dirty, 'the AST scanner must not flag legitimate core code').toEqual([])
  })

  it('handles the rules.ts data module without choking or hanging', async () => {
    const big = join(coreDir, 'rules.ts')
    if (!existsSync(big)) return
    const started = performance.now()
    expect(await rules(readFileSync(big, 'utf8'), 'rules.ts')).toEqual([])
    expect(performance.now() - started, 'scanning one module must not take seconds').toBeLessThan(5000)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// LOCATED REPORTS — a report names its file and line, so a sweep over a
// 1000-line data module points at the offending line, not just the file.
// ─────────────────────────────────────────────────────────────────────────────
describe('td1-2 — a violation report names its file and line', () => {
  it('reports the line the violation sits on', async () => {
    const violations = await loadScanner()
    const src = ['// one', '// two', '// three', 'export const f = Math.random()'].join('\n')
    const report = violations(src, 'probe.ts').join(' | ')
    expect(report, 'the rule name must survive').toMatch(/Math\.random/)
    expect(report, 'the violation is on line 4').toMatch(/\b4\b/)
  })

  it('names the file it was given', async () => {
    const violations = await loadScanner()
    expect(violations('export const f = Date.now()', 'src/core/sim.ts').join(' | ')).toContain('sim.ts')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENTED LIMITS — the scanner is syntactic; it must STATE the dataflow
// routes it does not follow. MUTATION-CHECKED: this list fails against a header
// that names none of them.
// ─────────────────────────────────────────────────────────────────────────────
describe('td1-2 — the scanner documents its own limits', () => {
  it('the header names each undetected dataflow route explicitly', () => {
    const header = readFileSync(scannerPath, 'utf8').split('\nexport ')[0]
    const required: ReadonlyArray<readonly [string, RegExp]> = [
      ['spread', /\bspread\b/i],
      ['Object.assign', /Object\.assign/],
      ['Reflect.get', /Reflect\.get/],
      ['reassignment aliasing', /reassign/i],
      ['class extends', /\bextends\b/],
      ['shadowing strictness', /shadow/i],
    ]
    const missing = required.filter(([, re]) => !re.test(header)).map(([n]) => n)
    expect(missing, 'each must be named as a KNOWN LIMITATION').toEqual([])
  })

  it('and frames them as limitations rather than as features', () => {
    const header = readFileSync(scannerPath, 'utf8').split('\nexport ')[0]
    expect(header).toMatch(/not detected|does not detect|limitation|out of scope|cannot detect/i)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// STRUCTURAL — the two properties that keep the rest honest.
// ─────────────────────────────────────────────────────────────────────────────
function allTestFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) out.push(...allTestFiles(p))
    else if (entry.endsWith('.test.ts')) out.push(p)
  }
  return out
}

describe('td1-2 — the scanner cannot quietly degrade', () => {
  it('does NOT silently pass source it cannot parse (the anti-fallback rule)', async () => {
    // "Tokenize, and on a parse error fall back to the old regex" would satisfy
    // every case above while reintroducing every hole. NO banned token in the
    // fixture, or a no-opped unparseability check returns a hit from the wreckage
    // and the assertion cannot tell the difference.
    //
    // The scanner is loaded OUTSIDE the try on purpose: if it were inside, a
    // missing module would land in the catch and pass this test vacuously (any
    // always-throwing scanner would satisfy it). This way the module must exist,
    // and only then is its behaviour on unparseable source under test.
    const scan = await loadScanner()
    const broken = 'export const a = ((((\nexport const b = 1'
    let threw = false
    let hits: string[] = []
    try {
      hits = scan(broken, 'broken.ts')
    } catch {
      threw = true
    }
    expect(
      threw || hits.length > 0,
      'unparseable source must not certify clean — throw, or report a violation',
    ).toBe(true)
  })

  it('is deterministic and does not mutate its input', async () => {
    const src = 'export const e = `t${Math["random"]()}`'
    const a = await rules(src)
    const b = await rules(src)
    expect(a).toEqual(b)
    expect(src, 'the scanner must not rewrite the source it was handed').toBe(
      'export const e = `t${Math["random"]()}`',
    )
  })

  it('exactly one scanner sweeps src/core — the inline FORBIDDEN regex table is gone', () => {
    // Without this, GREEN can add the AST scanner alongside the original and leave
    // rom-clock-sources.test.ts's FORBIDDEN table still sweeping core: every new
    // test passes, and src/core is still guarded by the holey regex table.
    const romClock = readFileSync(join(repoRoot, 'tests', 'rom-clock-sources.test.ts'), 'utf8')
    expect(
      romClock,
      'the inline FORBIDDEN DOM/clock regex table must be deleted from the core sweep, ' +
        'not left beside its replacement',
    ).not.toMatch(/const\s+FORBIDDEN\b/)
    // …and some suite file statically imports the shared scanner to do the sweep.
    // (This test loads it via dynamic import(), so it is not itself an importer.)
    const importers = allTestFiles(join(repoRoot, 'tests')).filter((f) =>
      /from\s+['"][^'"]*helpers\/purity-scanner(?:\.js)?['"]/.test(readFileSync(f, 'utf8')),
    )
    expect(
      importers.length,
      'the src/core purity sweep must consume the shared AST scanner',
    ).toBeGreaterThan(0)
  })
})
