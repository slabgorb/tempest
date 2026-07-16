// tests/shell/tp1-40.glow-tax-sources.test.ts
//
// RED source-rule guard for story tp1-40 — THE GLOW TAX.
//
// The Architect's investigation (session tp1-40, memory tempest-lag-is-live-
// shadowblur) proved the game is GPU-raster-bound: every live canvas shadow-blur
// assignment is a per-primitive Gaussian pass at device resolution, ~100+ per
// gameplay frame, saturating the GPU process (8-34 fps in production at
// dpr 1.75; A/B with the blur no-op'd runs a locked 60). AC-1 is a claim about
// the SOURCE TEXT — "no non-zero shadow blur is set during scene draws" — so
// only a source-reading test can hold it, exactly as rom-clock-sources.test.ts
// holds tp1-1's "zero bare 60s".
//
// Comments are stripped before every check (house rule, learned twice): prose
// documenting the old blurred world should survive as history without forcing
// Dev to mangle it for green.
//
// Three rules, each a distinct regression door:
//   1. Every shadow-blur assignment in src/shell + src/main.ts is a reset to 0.
//      (Zero-resets are ALLOWED — harmless state hygiene; anything else is the
//      GPU tax coming back.)
//   2. src/shell no longer imports @arcade/shared/glow. The shared envelope's
//      whole contract is "set the blur, draw, reset" — its source lives in
//      node_modules where rule 1 cannot see it, so consuming it in the scene
//      path would smuggle live blur past this suite. The story is scoped
//      tempest-local: src/shell/glow.ts replaces it here; the library is NOT
//      touched (promote later only if a second game proves the need).
//   3. The scene dpr cap is WIRED, not decorative: cappedDpr() must be called
//      somewhere outside its defining module. A tunable nobody calls caps
//      nothing.
//
// All three fail today: render.ts carries ~30 non-zero assignments, imports
// @arcade/shared/glow, and cappedDpr does not exist. Valid RED.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (rel: string): string => readFileSync(join(root, rel), 'utf8')

// Strip // line comments and /* block */ comments, leaving executable code only.
// (Same shape as rom-clock-sources.test.ts; the `(^|[^:])` guard keeps `https://`
// URLs inside string literals from being eaten as comments.)
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

// The scene path: everything that draws, plus the bootstrap that owns the dpr.
const SCENE_FILES = [...tsFilesUnder('src/shell'), 'src/main.ts']

describe('tp1-40 AC-1 — zero live shadow blur in the scene path', () => {
  // Every `<expr>.shadowBlur = RHS` (or compound-assign) in executable code.
  // RHS is captured up to the end of the statement so `= 0` can be allowed
  // while `= blur`, `= 8`, `= 4 + t * 8` are all refused.
  const ASSIGN = /\.\s*shadowBlur\s*([+\-*/]?=)\s*([^;\n]+)/g

  for (const file of SCENE_FILES) {
    it(`${file} assigns shadow blur only as a reset to 0`, () => {
      const code = stripComments(read(file))
      const offenders: string[] = []
      for (const m of code.matchAll(ASSIGN)) {
        const [, op, rhs] = m
        if (op !== '=' || rhs.trim() !== '0') {
          offenders.push(`shadowBlur ${op} ${rhs.trim()}`)
        }
      }
      expect(
        offenders,
        `${file} still pays the glow tax — every one of these is a per-primitive ` +
          `GPU Gaussian pass:\n  ${offenders.join('\n  ')}`,
      ).toEqual([])
    })
  }
})

describe('tp1-40 AC-1/AC-3 — the shared blur envelope is out of the scene path', () => {
  for (const file of tsFilesUnder('src/shell')) {
    it(`${file} does not import @arcade/shared/glow`, () => {
      const code = stripComments(read(file))
      expect(code).not.toMatch(/from\s*['"]@arcade\/shared\/glow['"]/)
    })
  }
})

describe('tp1-40 AC-4 — the scene dpr cap is wired, not decorative', () => {
  it('cappedDpr() is called by at least one module other than its own', () => {
    const callers = SCENE_FILES.filter((f) => !f.endsWith('src/shell/glow.ts')).filter((f) =>
      /\bcappedDpr\s*\(/.test(stripComments(read(f))),
    )
    expect(
      callers.length,
      'cappedDpr must gate the dpr that reaches the scene/phosphor buffers',
    ).toBeGreaterThan(0)
  })

  it('render.ts routes its glow through the tempest-local helper (glowStrokePasses + blitGlowDot)', () => {
    const code = stripComments(read('src/shell/render.ts'))
    expect(code, 'strokes/text must take the layered-pass helper').toMatch(/\bglowStrokePasses\s*\(|\bfrom\s*['"].\/glow['"]/)
    expect(code, 'dots must take the sprite-blit helper').toMatch(/\bblitGlowDot\s*\(/)
  })
})
