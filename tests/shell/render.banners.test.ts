// tests/shell/render.banners.test.ts
//
// Story 10-9: Missing on-screen banners — SUPERZAPPER RECHARGE, the RATE YOURSELF
// / RANK / NOVICE / EXPERT skill-select ladder, and the between-wave BONUS / TIME
// banners. These are documented in the 1981 ROM "Complete message table"
// (docs/tempest-1981-source-findings.md §4, mirrored here):
//
//   | name  | color  | text                 |
//   | RANK  | RED    | RANK                 |
//   | RATE  | GREEN  | RATE YOURSELF        |
//   | NOVIC | RED    | NOVICE               |
//   | EXPER | RED    | EXPERT               |
//   | BONUS | GREEN  | BONUS                |
//   | TIME  | GREEN  | TIME                 |
//   | SUPZA | BLUE   | SUPERZAPPER RECHARGE |
//
// render.ts draws to a LIVE canvas (no canvas in the node test env), so — exactly
// as with the Story 6-17 enemy-scale scan and the Story 6-8 glyph boundary scans —
// the testable seam for "is the banner wired up, on the right state, in the right
// color?" is the source text read via Vite's `?raw`. We assert four things per
// banner: (1) it is drawn through the shared glow-text helper (not an ad-hoc
// fillText), (2) it is GATED on the correct game state, (3) its color matches the
// Messages-table FAMILY (red / green / blue), classified by channel dominance so a
// valid hue within the family passes but the wrong family fails.
//
// Gate assertions anchor on the actual DRAW CALL (via `guardBefore`) and match the
// real guard CODE (e.g. `.superzapper === 'full'`, `.mode === 'warp'`) — NOT a
// proximity match to a substring of the banner text or a comment. A bare
// `windowAround(... 'SUPERZAPPER RECHARGE').toMatch(/superzapper/i)` is tautological
// (the banner literal contains 'SUPERZAPPER'); `guardBefore` + a code-specific
// regex is the version that actually fails if the gate is removed.
import { describe, it, expect } from 'vitest'
import renderSrc from '../../src/shell/render.ts?raw'

// ---- source-scan helpers --------------------------------------------------

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// The body of a top-level `function NAME(` up to the next top-level function.
function fnBody(src: string, name: string): string {
  const start = src.indexOf(`function ${name}(`)
  if (start < 0) return ''
  const next = src.indexOf('\nfunction ', start + 1)
  return src.slice(start, next < 0 ? undefined : next)
}

// The source code IMMEDIATELY PRECEDING the glow-text DRAW CALL for `banner` —
// i.e. the enclosing guard that sits just above the draw. Crucially this anchors
// on the actual `drawGlowText(... 'BANNER' ...)` call, NOT on any comment or the
// banner string itself, so a gate assertion built on it cannot be satisfied
// tautologically by the banner text. Returns '' if the banner isn't drawn.
function guardBefore(src: string, banner: string, radius = 400): string {
  const re = new RegExp(`(?:drawGlowText|glowText)\\s*\\([^)]*['"\`]${escapeRe(banner)}['"\`]`)
  const m = re.exec(src)
  if (!m) return ''
  return src.slice(Math.max(0, m.index - radius), m.index)
}

// True if `banner` is drawn through the shared glow-text helper (drawGlowText or
// glowText), not via a bare ctx.fillText(...). drawGlowText/glowText calls carry
// no nested parens before the closing one, so `[^)]` safely stays within the call.
function drawnViaGlowHelper(src: string, banner: string): boolean {
  const re = new RegExp(`(?:drawGlowText|glowText)\\s*\\([^)]*['"\`]${escapeRe(banner)}['"\`]`)
  return re.test(src)
}

// The color ARGUMENT passed to the glow-text call that draws `banner`. The helper
// signature is (ctx, text, cx, y, FONT, COLOR, blur); every font literal contains
// 'monospace', so the token right after it is the color. Returns null if not found.
function bannerColorArg(src: string, banner: string): string | null {
  const re = new RegExp(
    `['"\`]${escapeRe(banner)}['"\`][^)]*?monospace['"][^)]*?,\\s*([^,)]+?)\\s*,`,
  )
  const m = re.exec(src)
  return m ? m[1].trim() : null
}

type Family = 'red' | 'green' | 'blue' | 'white' | 'yellow' | 'other'

// Classify a color literal/identifier into a Messages-table FAMILY. Hex colors are
// classified by channel dominance (robust to hue choice); identifiers fall back to
// their semantic name. Cyan counts as the blue family (the ROM's BLULET/TURQOI).
function classify(colorArg: string | null): Family {
  if (!colorArg) return 'other'
  const hex = /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/.exec(colorArg)
  if (hex) {
    let h = hex[1]
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
    const r = parseInt(h.slice(0, 2), 16)
    const g = parseInt(h.slice(2, 4), 16)
    const b = parseInt(h.slice(4, 6), 16)
    const near = (a: number, c: number) => Math.abs(a - c) <= 24
    if (near(r, g) && near(g, b) && r > 180) return 'white'
    // Green family: green is the STRICTLY dominant channel. `g > b` (not `g >= b`)
    // is what keeps pure cyan (#00ffff, where g === b) OUT of green so it falls
    // through to the blue branch below — fixes the cyan-boundary misclassification.
    if (g >= r && g > b && g - Math.min(r, b) > 40) return 'green'
    if (b >= r && b >= g && b - Math.min(r, g) > 40) return 'blue'
    if (r >= g && r >= b && r - Math.min(g, b) > 40 && near(g, b)) return r > 200 && g > 160 ? 'yellow' : 'red'
    if (r >= g && r >= b && r - Math.max(g, b) > 60) return 'red'
    if (r > 180 && g > 180 && b < 120) return 'yellow'
    return 'other'
  }
  const id = colorArg.toLowerCase()
  if (id.includes('green')) return 'green'
  if (id.includes('red')) return 'red'
  if (id.includes('blue') || id.includes('cyan') || id.includes('blulet') || id.includes('turqoi') || id.includes('star')) return 'blue'
  if (id.includes('claw_color') || id.includes('yellow')) return 'yellow'
  if (id.includes('white')) return 'white'
  return 'other'
}

// Sanity-check the classifier against render.ts's KNOWN colors so a banner test
// that fails is failing on the FEATURE, not on a broken helper. (#39ff14 GAME OVER
// green, #ff2f4f HIGH SCORES red, #1f8fff level-0 blue.)
describe('color classifier self-check (helper sanity, not the feature)', () => {
  it('classifies the established render.ts palette hexes by family', () => {
    expect(classify("'#39ff14'")).toBe('green') // GAME OVER green
    expect(classify("'#ff2f4f'")).toBe('red') // HIGH SCORES red
    expect(classify("'#1f8fff'")).toBe('blue') // level-0 blue
    expect(classify("'#00e5ff'")).toBe('blue') // cyan → blue family (BLULET/TURQOI)
    expect(classify("'#00ffff'")).toBe('blue') // pure cyan (g === b tie) → blue, not green
    expect(classify("'#ffffff'")).toBe('white')
    expect(classify('CLAW_COLOR')).toBe('yellow')
    expect(classify(null)).toBe('other')
  })
})

// ---- AC1: SUPERZAPPER RECHARGE (blue, on recharge) ------------------------

describe('Story 10-9 AC1 — SUPERZAPPER RECHARGE banner', () => {
  it('renders the SUPERZAPPER RECHARGE string', () => {
    expect(renderSrc).toContain('SUPERZAPPER RECHARGE')
  })

  it('draws it through the shared glow-text helper (not an ad-hoc fillText)', () => {
    expect(drawnViaGlowHelper(renderSrc, 'SUPERZAPPER RECHARGE')).toBe(true)
  })

  it('gates the draw on player.superzapper === "full" (not shown unconditionally)', () => {
    // Authentic trigger: the banner appears when the once-per-level Superzapper is
    // available again — our model tracks that as player.superzapper === 'full'.
    // Anchor on the DRAW CALL and assert the real guard precedes it: this regex
    // matches actual code (`.superzapper === 'full'`), NOT the banner string or
    // the comment, so deleting the gate would make this fail.
    expect(guardBefore(renderSrc, 'SUPERZAPPER RECHARGE')).toMatch(/\.superzapper\s*===\s*['"]full['"]/)
  })

  it('uses the Messages-table BLUE (BLULET), not green/red/white', () => {
    expect(classify(bannerColorArg(renderSrc, 'SUPERZAPPER RECHARGE'))).toBe('blue')
  })
})

// ---- AC2: RATE YOURSELF / RANK / NOVICE / EXPERT ladder -------------------

describe('Story 10-9 AC2 — RATE YOURSELF skill-select ladder', () => {
  it('presents the RATE YOURSELF / RANK / NOVICE / EXPERT strings', () => {
    for (const label of ['RATE YOURSELF', 'RANK', 'NOVICE', 'EXPERT']) {
      expect(renderSrc, `render.ts must present "${label}"`).toContain(label)
    }
  })

  it('renders the whole ladder on the SELECT screen (drawSelect), beside the start-level chooser', () => {
    const select = fnBody(renderSrc, 'drawSelect')
    expect(select, 'drawSelect must exist').not.toBe('')
    for (const label of ['RATE YOURSELF', 'RANK', 'NOVICE', 'EXPERT']) {
      expect(select, `drawSelect must render "${label}"`).toContain(label)
    }
  })

  it('colors RATE YOURSELF GREEN per the Messages table', () => {
    expect(classify(bannerColorArg(renderSrc, 'RATE YOURSELF'))).toBe('green')
  })

  it('colors the rank labels (RANK/NOVICE/EXPERT) RED per the Messages table', () => {
    expect(classify(bannerColorArg(renderSrc, 'RANK'))).toBe('red')
    expect(classify(bannerColorArg(renderSrc, 'NOVICE'))).toBe('red')
    expect(classify(bannerColorArg(renderSrc, 'EXPERT'))).toBe('red')
  })
})

// ---- AC3: between-wave BONUS / TIME banners ------------------------------

describe('Story 10-9 AC3 — between-wave BONUS / TIME banners', () => {
  // Both BONUS and TIME get the SAME four-way contract (helper / warp-gate / color)
  // so neither rests on a presence check the comment alone could satisfy.
  it('draws BOTH BONUS and TIME through the shared glow-text helper (not ad-hoc fillText)', () => {
    expect(drawnViaGlowHelper(renderSrc, 'BONUS')).toBe(true)
    expect(drawnViaGlowHelper(renderSrc, 'TIME')).toBe(true)
  })

  it('gates BOTH draws on s.mode === "warp" (between-wave only, not during play)', () => {
    // Anchor on each DRAW CALL and assert the real `s.mode === 'warp'` guard
    // precedes it. This regex matches code, not the "...warp dive..." comment,
    // so removing the warp gate would make this fail.
    expect(guardBefore(renderSrc, 'BONUS')).toMatch(/\.mode\s*===\s*['"]warp['"]/)
    expect(guardBefore(renderSrc, 'TIME')).toMatch(/\.mode\s*===\s*['"]warp['"]/)
  })

  it('colors BOTH BONUS and TIME GREEN per the Messages table', () => {
    expect(classify(bannerColorArg(renderSrc, 'BONUS'))).toBe('green')
    expect(classify(bannerColorArg(renderSrc, 'TIME'))).toBe('green')
  })
})

// ---- AC4 + rule coverage --------------------------------------------------

describe('Story 10-9 AC4 — colors follow the Messages table (cross-check)', () => {
  // Each banner's family, asserted together, is the AC4 contract: the right
  // authentic color per the ROM message table, not an arbitrary palette pick.
  it('SUPERZAPPER=blue · RATE YOURSELF/BONUS/TIME=green · RANK/NOVICE/EXPERT=red', () => {
    expect(classify(bannerColorArg(renderSrc, 'SUPERZAPPER RECHARGE'))).toBe('blue')
    expect(classify(bannerColorArg(renderSrc, 'RATE YOURSELF'))).toBe('green')
    expect(classify(bannerColorArg(renderSrc, 'BONUS'))).toBe('green')
    expect(classify(bannerColorArg(renderSrc, 'TIME'))).toBe('green')
    expect(classify(bannerColorArg(renderSrc, 'RANK'))).toBe('red')
    expect(classify(bannerColorArg(renderSrc, 'NOVICE'))).toBe('red')
    expect(classify(bannerColorArg(renderSrc, 'EXPERT'))).toBe('red')
  })
})

describe('Story 10-9 — TS lang-review #1: no type-safety escapes added to render.ts', () => {
  it('introduces no `as any` or @ts-ignore alongside the new banners', () => {
    expect(renderSrc).not.toMatch(/\bas any\b/)
    expect(renderSrc).not.toMatch(/@ts-ignore/)
  })
})
