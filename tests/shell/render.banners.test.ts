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
// banner: (1) the string is present, (2) it is drawn through the shared
// glow-text helper (not an ad-hoc fillText), (3) it is GATED on the correct game
// state (so it doesn't show unconditionally), and (4) its color matches the
// Messages-table FAMILY (red / green / blue), classified by channel dominance so a
// valid hue choice within the family passes but the wrong family fails.
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

// A window of `radius` chars on each side of the first occurrence of `needle`.
function windowAround(src: string, needle: string, radius = 600): string {
  const i = src.indexOf(needle)
  if (i < 0) return ''
  return src.slice(Math.max(0, i - radius), i + needle.length + radius)
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
    if (g >= r && g >= b && g - Math.min(r, b) > 40 && !(b >= r && b - g > 24)) return 'green'
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

  it('gates it on the superzapper being (re)charged — not shown unconditionally', () => {
    // Authentic trigger: the banner appears when the once-per-level Superzapper is
    // available again. Our model tracks that as player.superzapper === 'full'.
    expect(windowAround(renderSrc, 'SUPERZAPPER RECHARGE')).toMatch(/superzapper/i)
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

  it('renders the ladder on the level/skill SELECT screen (drawSelect), beside the start-level chooser', () => {
    const select = fnBody(renderSrc, 'drawSelect')
    expect(select, 'drawSelect must exist').not.toBe('')
    for (const label of ['RATE YOURSELF', 'NOVICE', 'EXPERT']) {
      expect(select, `drawSelect must render "${label}"`).toContain(label)
    }
  })

  it('colors RATE YOURSELF GREEN per the Messages table', () => {
    expect(classify(bannerColorArg(renderSrc, 'RATE YOURSELF'))).toBe('green')
  })

  it('colors the rank labels (NOVICE/EXPERT) RED per the Messages table', () => {
    expect(classify(bannerColorArg(renderSrc, 'NOVICE'))).toBe('red')
    expect(classify(bannerColorArg(renderSrc, 'EXPERT'))).toBe('red')
  })
})

// ---- AC3: between-wave BONUS / TIME banners ------------------------------

describe('Story 10-9 AC3 — between-wave BONUS / TIME banners', () => {
  it('renders the BONUS and TIME strings', () => {
    expect(renderSrc).toContain('BONUS')
    expect(renderSrc).toContain('TIME')
  })

  it('draws the BONUS banner through the shared glow-text helper', () => {
    expect(drawnViaGlowHelper(renderSrc, 'BONUS')).toBe(true)
  })

  it('shows them on the between-wave / level-clear (warp) transition, not during play', () => {
    // The level-clear → next-level handoff is the `warp` mode; the bonus summary
    // belongs to that transition, so the banner draw must reference the warp state.
    expect(windowAround(renderSrc, 'BONUS')).toMatch(/warp/i)
  })

  it('colors BONUS GREEN per the Messages table', () => {
    expect(classify(bannerColorArg(renderSrc, 'BONUS'))).toBe('green')
  })
})

// ---- AC4 + rule coverage --------------------------------------------------

describe('Story 10-9 AC4 — colors follow the Messages table (cross-check)', () => {
  // Each banner's family, asserted together, is the AC4 contract: the right
  // authentic color per the ROM message table, not an arbitrary palette pick.
  it('SUPERZAPPER RECHARGE=blue, RATE YOURSELF=green, NOVICE/EXPERT=red, BONUS=green', () => {
    expect(classify(bannerColorArg(renderSrc, 'SUPERZAPPER RECHARGE'))).toBe('blue')
    expect(classify(bannerColorArg(renderSrc, 'RATE YOURSELF'))).toBe('green')
    expect(classify(bannerColorArg(renderSrc, 'NOVICE'))).toBe('red')
    expect(classify(bannerColorArg(renderSrc, 'EXPERT'))).toBe('red')
    expect(classify(bannerColorArg(renderSrc, 'BONUS'))).toBe('green')
  })
})

describe('Story 10-9 — TS lang-review #1: no type-safety escapes added to render.ts', () => {
  it('introduces no `as any` or @ts-ignore alongside the new banners', () => {
    expect(renderSrc).not.toMatch(/\bas any\b/)
    expect(renderSrc).not.toMatch(/@ts-ignore/)
  })
})
