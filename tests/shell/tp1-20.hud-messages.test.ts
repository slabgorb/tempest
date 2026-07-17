// tests/shell/tp1-20.hud-messages.test.ts
//
// Story tp1-20 (Cluster C14): HUD & MESSAGES — fixed field colours and the ROM's
// actual strings; drop the three invented captions. Subsumes audit findings
// V-018, V-033, V-034, V-035, V-036 (docs/audit/findings/pair-2-alvrom-shapes-font.json).
// All five re-verified for this story: CONFIRMED, none carries `remediated_by`,
// and every [REFUTATION] pass in their reasoning FAILED to refute (the claims hold).
//
// PRIMARY SOURCE (re-opened byte-for-byte against ~/Projects/tempest-source-text
// for this suite — line numbers verified, not copied from the findings):
//
//   ALVROM.MAC 1955-1994 — the SCORES template fixes every HUD field's colour and
//   only ever calls JSRL CHAR. / JSRL LIFE0 (digit + life-icon glyphs):
//     :1958 CSTAT GREEN  → SCP1SC  6-digit player score
//     :1971 CSTAT YELLOW → SCP1LI  LIFE0 life icons
//     :1979 CSTAT GREEN  → SCHISC  6-digit high score
//     :1987 CSTAT BLUE   → SCLEVL  2-digit level
//     :1990 CSTAT GREEN  → SCHIIN  3 hi-score initials
//   The template has NO text-drawing call, so the captions SCORE / LEVEL / HI-SCORE
//   are our invention — the cabinet never labelled the panel.
//
//   ALLANG.MAC messages table + English literals:
//     :69 MESS ENTER,RED,1,0B0     → :121 EENTER: ASCVH <ENTER YOUR INITIALS>
//     :70 MESS PRMOV,TURQOI,1,0    → :126 EPRMOV: ASCVH <SPIN KNOB TO CHANGE>
//     :71 MESS PRFIR,YELLOW,1,-10. → :131 EPRFIR: ASCVH <PRESS FIRE TO SELECT>
//     :73 MESS RANK,RED,1,-50.     → :141 ERANK:  ASCVH 0C2,<RANKING FROM 1 TO >
//   ERANK's trailing space is real: the game appends the top selectable level to
//   the sentence, which is the whole point of the screen.
//
// SEAM: render.ts draws to a live canvas (none exists in the node test env), so —
// exactly as in render.banners.test.ts and the 6-17 enemy-scale scan — the
// testable seam is the source text via Vite `?raw`. Colours are pinned by FAMILY
// (channel dominance), per the repo convention: any valid hue within the family
// passes, the wrong family fails. Strings are pinned as exact literals. The one
// stricter pin is TURQOI (V-033): the fix must be the turquoise slot, which the
// blue-vs-cyan family split below distinguishes from both ZBLUE and the old
// translucent steel-blue wash.
//
// Every font glyph these strings need exists in the shared face (GLYPH_CHARS is
// caps + digits + space + `-,/_`): no apostrophes or periods anywhere, so the
// verbatim pins force nothing unrenderable.
import { describe, it, expect } from 'vitest'
import renderSrc from '../../src/shell/render.ts?raw'
import { lifeIconGlyph } from '../../src/shell/glyphs'

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

// Every `vecText(...)` / `drawGlowText(...)` call in `src`, as full call strings.
// Paren- and quote-aware (template literals with ${...} are consumed as quoted
// text), so nested calls like String(s.score).padStart(6, '0') stay inside their
// own call rather than truncating the slice at the first ')'.
function textDrawCalls(src: string): string[] {
  const out: string[] = []
  const re = /\b(?:vecText|drawGlowText)\s*\(/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    const open = m.index + m[0].length - 1
    let depth = 0
    let quote: string | null = null
    let i = open
    for (; i < src.length; i++) {
      const c = src[i]
      if (quote) {
        if (c === '\\') { i++; continue }
        if (c === quote) quote = null
        continue
      }
      if (c === "'" || c === '"' || c === '`') { quote = c; continue }
      if (c === '(') depth++
      else if (c === ')') { depth--; if (depth === 0) break }
    }
    out.push(src.slice(m.index, i + 1))
  }
  return out
}

// Top-level argument list of a call string from textDrawCalls. Both helpers share
// the signature (ctx, text, x, y, sizePx, color, blur, ...), so text is args[1]
// and the colour is args[5].
function argsOf(call: string): string[] {
  const open = call.indexOf('(')
  const inner = call.slice(open + 1, call.length - 1)
  const args: string[] = []
  let depth = 0
  let quote: string | null = null
  let cur = ''
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i]
    if (quote) {
      cur += c
      if (c === '\\') { cur += inner[++i] ?? ''; continue }
      if (c === quote) quote = null
      continue
    }
    if (c === "'" || c === '"' || c === '`') { quote = c; cur += c; continue }
    if (c === '(' || c === '[' || c === '{') depth++
    else if (c === ')' || c === ']' || c === '}') depth--
    if (c === ',' && depth === 0) { args.push(cur.trim()); cur = ''; continue }
    cur += c
  }
  if (cur.trim()) args.push(cur.trim())
  return args
}

// Colour argument of the first text-draw call in `src` whose TEXT argument
// matches `textRe` (and, if given, does NOT match `exclude`). Null if no call
// carries the text — i.e. the string is not drawn through the shared helpers.
function drawColorFor(src: string, textRe: RegExp, exclude?: RegExp): string | null {
  for (const call of textDrawCalls(src)) {
    const a = argsOf(call)
    if (a.length < 6) continue
    if (!textRe.test(a[1])) continue
    if (exclude && exclude.test(a[1])) continue
    return a[5]
  }
  return null
}

// Colour arguments of EVERY text-draw call in `src` whose text matches.
function allDrawColorsFor(src: string, textRe: RegExp): string[] {
  const out: string[] = []
  for (const call of textDrawCalls(src)) {
    const a = argsOf(call)
    if (a.length >= 6 && textRe.test(a[1])) out.push(a[5])
  }
  return out
}

type Family = 'red' | 'green' | 'blue' | 'white' | 'yellow' | 'other'

// Classify a colour literal/identifier into a Messages-table FAMILY — same
// classifier as render.banners.test.ts (hex by channel dominance, identifiers by
// semantic name), so a valid hue within the family passes and the wrong family
// fails. The level-cycling `color` parameter classifies 'other'.
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
  if (id.includes('cyan') || id.includes('turqoi')) return 'blue'
  if (id.includes('blue')) return 'blue'
  if (id.includes('claw_color') || id.includes('yellow')) return 'yellow'
  if (id.includes('white')) return 'white'
  return 'other'
}

// TURQOI is stricter than the blue FAMILY: V-033's fix is the turquoise slot
// (g and b both high and dominant over r), which this accepts while rejecting
// ZBLUE '#2b6bff' (g too low), the old translucent steel-blue wash
// 'rgba(150,190,255,0.7)' (no hex, no cyan name), and white (r not dominated).
function isCyanFamily(colorArg: string | null): boolean {
  if (!colorArg) return false
  const hex = /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/.exec(colorArg)
  if (hex) {
    let h = hex[1]
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
    const r = parseInt(h.slice(0, 2), 16)
    const g = parseInt(h.slice(2, 4), 16)
    const b = parseInt(h.slice(4, 6), 16)
    return Math.min(g, b) - r > 60 && g > 150 && b > 150
  }
  return /cyan|turqoi/i.test(colorArg)
}

// ---- helper sanity (not the feature) --------------------------------------

describe('tp1-20 helper sanity — classifier + call parser self-check', () => {
  it('classifies the render.ts palette by family', () => {
    expect(classify("'#39ff14'")).toBe('green') // GLYPH_HEX.green
    expect(classify("'#ffe600'")).toBe('yellow') // GLYPH_HEX.yellow / CLAW_COLOR
    expect(classify("'#ff2f4f'")).toBe('red') // GLYPH_HEX.red
    expect(classify("'#2b6bff'")).toBe('blue') // GLYPH_HEX.blue (ZBLUE)
    expect(classify('GLYPH_HEX.green')).toBe('green')
    expect(classify('GLYPH_HEX.blue')).toBe('blue')
    expect(classify('CLAW_COLOR')).toBe('yellow')
    expect(classify('color')).toBe('other') // the level-cycling parameter
    expect(classify(null)).toBe('other')
  })

  it('separates TURQOI from ZBLUE, steel-blue washes, and white', () => {
    expect(isCyanFamily("'#00e5ff'")).toBe(true) // GLYPH_HEX.cyan (ZTURQOI)
    expect(isCyanFamily('GLYPH_HEX.cyan')).toBe(true)
    expect(isCyanFamily("'#2b6bff'")).toBe(false) // ZBLUE is not turquoise
    expect(isCyanFamily("'rgba(150,190,255,0.7)'")).toBe(false) // the old wash
    expect(isCyanFamily("'#ffffff'")).toBe(false)
    expect(isCyanFamily(null)).toBe(false)
  })

  it('parses a real vecText call: nested padStart comma stays inside the text arg', () => {
    const fixture = "vecText(ctx, String(s.score).padStart(6, '0'), 26, 22, 22, color, 12, 'left', 'top')"
    const calls = textDrawCalls(fixture)
    expect(calls).toHaveLength(1)
    const a = argsOf(calls[0])
    expect(a[1]).toBe("String(s.score).padStart(6, '0')")
    expect(a[5]).toBe('color')
  })

  it('parses a template-literal drawGlowText call without splitting on ${}', () => {
    const fixture = 'drawGlowText(ctx, `RANKING FROM 1 TO ${MAX_SELECT_LEVEL}`, W / 2, H * 0.2, 16, "#ff2f4f", 8)'
    const a = argsOf(textDrawCalls(fixture)[0])
    expect(a[1]).toBe('`RANKING FROM 1 TO ${MAX_SELECT_LEVEL}`')
    expect(a[5]).toBe('"#ff2f4f"')
  })
})

// ---- AC-1: HUD field colours are FIXED per field (V-018) ------------------

describe('tp1-20 AC-1 — HUD field colours fixed per the SCORES template (V-018, ALVROM.MAC:1957-1994)', () => {
  const hud = fnBody(renderSrc, 'drawHud')

  it('drawHud exists and draws all three numeric fields through the shared text helpers', () => {
    expect(hud, 'drawHud must exist').not.toBe('')
    expect(drawColorFor(hud, /s\.score/, /FINAL/), 'score readout draw call').not.toBeNull()
    expect(drawColorFor(hud, /s\.level/), 'level readout draw call').not.toBeNull()
    expect(drawColorFor(hud, /\bhi\b|highScoreTable/), 'hi-score readout draw call').not.toBeNull()
  })

  it('player score is GREEN (CSTAT GREEN → SCP1SC, ALVROM.MAC:1958), not the level-cycling colour', () => {
    // The exclude keeps the gameover FINAL SCORE overlay (a different concern)
    // out of the match; the always-on HUD readout is the field under audit.
    const c = drawColorFor(hud, /s\.score/, /FINAL/)
    expect(classify(c), `score colour arg ${String(c)}`).toBe('green')
  })

  it('level number is BLUE (CSTAT BLUE → SCLEVL, ALVROM.MAC:1987) — the ZBLUE slot, not cycling', () => {
    const c = drawColorFor(hud, /s\.level/)
    expect(classify(c), `level colour arg ${String(c)}`).toBe('blue')
  })

  it('high score is GREEN (CSTAT GREEN → SCHISC, ALVROM.MAC:1979), not cycling', () => {
    const c = drawColorFor(hud, /\bhi\b|highScoreTable/)
    expect(classify(c), `hi-score colour arg ${String(c)}`).toBe('green')
  })

  it('KEEP: lives are the yellow LIFE icons (CSTAT YELLOW → SCP1LI, ALVROM.MAC:1971)', () => {
    // Already faithful — LIFE1 carries its own CSTAT YELLOW in glyphs.ts. Pinned
    // so the per-field colour work cannot regress the one field that was right.
    const glyph = lifeIconGlyph()
    expect(glyph.length).toBeGreaterThan(0)
    for (const stroke of glyph) expect(stroke.color).toBe('yellow')
    // ...and drawHud still renders one icon per remaining life.
    expect(hud).toMatch(/for\s*\(\s*let\s+\w+\s*=\s*0;\s*\w+\s*<\s*s\.lives/)
    expect(hud).toContain('drawClawIcon')
  })
})

// ---- AC-2: the three invented captions are removed (V-018) ----------------

describe('tp1-20 AC-2 — the invented captions are gone (V-018: the SCORES template draws only digits and life icons)', () => {
  it.each(['SCORE', 'LEVEL', 'HI-SCORE'])(
    "render.ts no longer draws a bare '%s' caption",
    (cap) => {
      // Exact quoted literal: longer strings that merely CONTAIN the word
      // ('SELECT START LEVEL', 'HIGH SCORES', `FINAL SCORE ${…}`) do not match.
      expect(renderSrc).not.toMatch(new RegExp(`['"\`]${escapeRe(cap)}['"\`]`))
    },
  )
})

// ---- AC-3: ENTER YOUR INITIALS (V-035) ------------------------------------

describe("tp1-20 AC-3 — 'ENTER YOUR INITIALS' is the entry screen's RED heading (V-035, ALLANG.MAC:69 MESS ENTER,RED / :121 EENTER)", () => {
  const entry = fnBody(renderSrc, 'drawEntry')

  it("drops the invented 'NEW HIGH SCORE' heading", () => {
    expect(renderSrc).not.toContain('NEW HIGH SCORE')
  })

  it("draws 'ENTER YOUR INITIALS' on the entry screen", () => {
    expect(entry, 'drawEntry must exist').not.toBe('')
    expect(entry).toContain('ENTER YOUR INITIALS')
  })

  it('draws it RED per the messages table — every occurrence, never CLAW_COLOR yellow', () => {
    const colors = allDrawColorsFor(renderSrc, /ENTER YOUR INITIALS/)
    expect(colors.length, 'at least one draw call must carry the string').toBeGreaterThan(0)
    for (const c of colors) expect(classify(c), `colour arg ${c}`).toBe('red')
  })

  it('draws it as the heading proper, not only inside the defensive no-entry branch', () => {
    const iStr = entry.indexOf('ENTER YOUR INITIALS')
    expect(iStr, 'the string must appear in drawEntry').toBeGreaterThan(-1)
    const iGuard = entry.indexOf('!entry')
    // If the defensive branch survives, the heading must be drawn BEFORE it —
    // i.e. unconditionally. (If the branch is gone, the heading is trivially
    // unconditional and the colour + presence pins above carry the contract.)
    if (iGuard >= 0) {
      expect(iStr, 'heading must precede the !entry defensive guard').toBeLessThan(iGuard)
    }
  })
})

// ---- AC-3: SPIN KNOB TO CHANGE (V-033) ------------------------------------

describe("tp1-20 AC-3 — 'SPIN KNOB TO CHANGE' verbatim in TURQOI (V-033, ALLANG.MAC:70 MESS PRMOV,TURQOI / :126 EPRMOV)", () => {
  const select = fnBody(renderSrc, 'drawSelect')

  it('ships the ROM string verbatim on the select screen', () => {
    expect(select, 'drawSelect must exist').not.toBe('')
    expect(select).toContain('SPIN KNOB TO CHANGE')
  })

  it("retires the invented 'SPIN OR ARROW KEYS TO CHANGE'", () => {
    expect(renderSrc).not.toContain('SPIN OR ARROW KEYS TO CHANGE')
  })

  it('draws it in the turquoise slot at full opacity — not the translucent steel-blue wash', () => {
    const c = drawColorFor(select, /SPIN KNOB TO CHANGE/)
    expect(c, 'the string must be drawn through the shared text helpers').not.toBeNull()
    expect(isCyanFamily(c), `colour arg ${String(c)} must be the TURQOI slot`).toBe(true)
    expect(c as string, 'full opacity — no translucent rgba() wash').not.toMatch(/rgba\(/)
  })
})

// ---- AC-3: RANKING FROM 1 TO n (V-036) ------------------------------------

describe("tp1-20 AC-3 — 'RANKING FROM 1 TO n' replaces the bare RANK label (V-036, ALLANG.MAC:73 MESS RANK,RED / :141 ERANK)", () => {
  const select = fnBody(renderSrc, 'drawSelect')

  it("carries the ROM sentence with its real trailing space: 'RANKING FROM 1 TO '", () => {
    expect(select).toContain('RANKING FROM 1 TO ')
  })

  it('appends the top selectable level — the same MAX_SELECT_LEVEL bound the chooser clamps to', () => {
    // ERANK's trailing space exists so the game can append the top selectable
    // level. Ours is MAX_SELECT_LEVEL (rules.ts — the bound sim.ts clamps the
    // chooser to), and the sentence must reference IT, not a divorced copy that
    // silently lies when the bound moves.
    const call = textDrawCalls(select).find((c) => {
      const a = argsOf(c)
      return a.length >= 6 && /RANKING FROM 1 TO /.test(a[1])
    })
    expect(call, 'a text-draw call must carry the RANKING sentence').toBeDefined()
    expect(argsOf(call as string)[1]).toMatch(/MAX_SELECT_LEVEL/)
  })

  it('draws it RED per the messages table', () => {
    const c = drawColorFor(select, /RANKING FROM 1 TO /)
    expect(classify(c), `RANKING colour arg ${String(c)}`).toBe('red')
  })

  it("never again draws the bare four-letter 'RANK' caption (the cabinet had no such label)", () => {
    // Refutation-in-test: 'RANK' alone was our invention; the ROM sentence is
    // the only sanctioned use of the word. Exact quoted literal, so the full
    // sentence (and prose comments) stay legal.
    expect(renderSrc).not.toMatch(/['"`]RANK['"`]/)
  })
})

// ---- V-034 (story description subsume): PRESS FIRE TO SELECT --------------

describe("tp1-20 — 'PRESS FIRE TO SELECT' in fixed YELLOW (V-034, ALLANG.MAC:71 MESS PRFIR,YELLOW / :131 EPRFIR; subsumed by the story description)", () => {
  const select = fnBody(renderSrc, 'drawSelect')

  it('ships the ROM string verbatim on the select screen', () => {
    expect(select).toContain('PRESS FIRE TO SELECT')
  })

  it("retires the invented 'PRESS START / ENTER TO BEGIN'", () => {
    expect(renderSrc).not.toContain('PRESS START / ENTER TO BEGIN')
  })

  it('draws it in fixed YELLOW — not the level-cycling colour', () => {
    const c = drawColorFor(select, /PRESS FIRE TO SELECT/)
    expect(classify(c), `colour arg ${String(c)}`).toBe('yellow')
  })
})

// ---- lang-review rule coverage --------------------------------------------

describe('tp1-20 — TS lang-review #1: no type-safety escapes in render.ts', () => {
  it('introduces no `as any` or @ts-ignore alongside the HUD/message fixes', () => {
    expect(renderSrc).not.toMatch(/\bas any\b/)
    expect(renderSrc).not.toMatch(/@ts-ignore/)
  })
})
