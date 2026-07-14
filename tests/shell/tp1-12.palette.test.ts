// tests/shell/tp1-12.palette.test.ts
//
// Story tp1-12 — THE PALETTE. Enemy/well colours come from a per-wave-group
// COLTAB bank, not a fixed hex. Audited against Theurer's original 1981 assembler
// (~/Projects/tempest-source-text — the LF copy). Subsumes audit findings
// V-019 (the mechanism), DB-010 (the well + the invisible-well waves), V-011
// (the ammo tint is BLUE, and GlyphColor needs a `blue`), and the colour-half of
// DA-005 (slot 0 is ZWHITE in every bank). DB-017's rainbow starfield rides the
// same table.
//
//   AC1  V-019   enemies/well resolve colour through a palette SLOT → per-wave
//                COLTAB bank, not a hard-coded hex. Six banks, cited.
//   AC2          the bank advances every 16 waves, and saturates at the 6th.
//   AC3  DB-010  waves 65-80 render as INVISIBLE WELLS (bank 4, slot 6 = ZBLACK).
//   AC4  V-011   `blue` is added to GlyphColor (the ROM's ZBLUE, distinct from
//                turquoise/`cyan`); the 6-7 ammo tint is that blue.
//   AC5          the palette is eight slots; nothing outside the ROM's eight
//                colours ships — notably `orange` is not in it (tp1-3's spiker).
//
// The ROM (verified verbatim at test design, ALDISP.MAC — the shipped module per
// ALEXEC.MAP; radix 16 per ALCOMN.MAC:17):
//
//   INICOL (ALDISP.MAC:2349-2378) selects the bank:
//     LDA CURWAV / AND I,70 / CMP I,5F / IFCS / LDA I,5F / LSR / ORA I,07 / TAX
//   → X tops an 8-byte bank; bank = (min(CURWAV & 0x70, 0x5F)) >> 4, i.e.
//     floor(CURWAV / 16) clamped to 5. CURWAV is 0-based; our s.level is 1-based
//     (render.ts:922 `(s.level - 1)`), so bank = clamp(floor((level-1)/16), 0, 5).
//
//   COLTAB (ALDISP.MAC:2405-2456) is SIX 8-byte banks. Each byte is nibble-packed:
//     the LOW nibble → COLRAM[0-7] (the primary colour we pin here); the HIGH
//     nibble → COLRAM+8[8-15] (the SPLAT/NYMPH/FLASH alternates — no AC covers
//     them, so they are out of scope). `ZTURQOI!<ZRED*10>` = 0x03 | (0x0C<<4):
//     low nibble ZTURQOI is the primary. Z* colours: ALCOMN.MAC:375-382.
//
//   Slot meanings (bank-0 comments, ALDISP.MAC:2406-2413): 0 EXPLOSIONS,
//   1 CURSOR/FLASHLIGHT, 2 TANKERS, 3 FLIPPERS, 4 PULSARS, 5 LETTERS, 6 WELL,
//   7 LETTERS/FLASH. The SLOT meaning is fixed; the colour per slot cycles by bank.
//
// TEA test-design decisions (see session "Design Deviations → TEA"):
//  • The palette is pure, testable data + pure resolvers, exported from the
//    colour-authority module `src/shell/glyphs.ts` — the same home the tp1-3 /
//    Story 10-8 precedent gave `lifeIconGlyph` and `playerBulletColor`. A
//    NAMESPACE import of that (already-loading) module means a not-yet-added
//    export reads as `undefined`, so Dev sees clean partial-green instead of a
//    module-load crash taking the whole file down.
//  • Colours are compared as STRING values, so this file pins the ROM's colour
//    NAMES without forcing Dev's hand on the TS type: whether `black` becomes a
//    GlyphColor, a `PaletteColor` union, or is handled at the well's draw site is
//    Dev's call. The one type fact the ROM *does* force — a distinct `blue` — is
//    pinned separately against the source text (AC4).
//  • Only the LOW nibble (the 8 primary slots) is pinned; the high-nibble
//    splat/nymph/flash colours are deferred (no AC).
import { describe, it, expect } from 'vitest'
import * as Glyphs from '../../src/shell/glyphs'
import glyphsSrc from '../../src/shell/glyphs.ts?raw'
import renderSrc from '../../src/shell/render.ts?raw'

// Strip line- and block-comments so a source scan cannot be satisfied (or broken)
// by prose — the tp1-3 house helper.
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

// The palette surface, accessed loosely so (a) missing exports are `undefined`,
// not a load error, and (b) colour comparisons are plain strings and never trip
// tsc before Dev adds `blue`/`black`. Mirrors tp1-3's `(Glyphs as unknown as …)`.
const P = Glyphs as unknown as {
  COLTAB_BANKS?: readonly (readonly string[])[]
  paletteBank?: (level: number) => number
  paletteColor?: (level: number, slot: number) => string
  wellColor?: (level: number) => string
}

// The golden table, transcribed byte-exact from ALDISP.MAC:2406-2456 (low nibble).
// ZTURQOI→'cyan' (the codebase's turquoise), ZBLUE→'blue', ZYELLO/ZYELLOW→'yellow',
// ZBLACK→'black'. Cross-checked: DA-005 (every slot 0 is ZWHITE) and DB-010 (the
// slot-6 well sequence). Bank index is 0-based; the source comments ;1..;6 are 1-based.
const COLTAB: readonly (readonly string[])[] = [
  // bank 0  ;1  ALDISP.MAC:2406-2413
  ['white', 'yellow', 'purple', 'red', 'cyan', 'green', 'blue', 'blue'],
  // bank 1  ;2  ALDISP.MAC:2414-2421
  ['white', 'green', 'blue', 'purple', 'yellow', 'cyan', 'red', 'red'],
  // bank 2  ;3  ALDISP.MAC:2422-2429
  ['white', 'blue', 'cyan', 'green', 'purple', 'red', 'yellow', 'yellow'],
  // bank 3  ;4  ALDISP.MAC:2430-2437
  ['white', 'blue', 'purple', 'green', 'yellow', 'red', 'cyan', 'cyan'],
  // bank 4  ;5  ALDISP.MAC:2441-2448  — slot 6 = ZBLACK (2447), the invisible well
  ['white', 'yellow', 'purple', 'red', 'cyan', 'green', 'black', 'blue'],
  // bank 5  ;6  ALDISP.MAC:2449-2456
  ['white', 'red', 'purple', 'yellow', 'cyan', 'blue', 'green', 'green'],
]

// The eight colours the ROM's palette can produce (ALCOMN.MAC:375-382). Orange
// (ALCOMN.MAC has no Z-orange) is deliberately absent — it is tp1-3's spiker only.
const ROM_PALETTE_COLORS = new Set(['white', 'yellow', 'purple', 'red', 'cyan', 'green', 'blue', 'black'])

const SLOT_TANKER = 2
const SLOT_FLIPPER = 3
const SLOT_PULSAR = 4
const SLOT_WELL = 6

// bank = clamp(floor((level-1)/16), 0, 5) — the ROM's INICOL, in 1-based level terms.
function expectedBank(level: number): number {
  return Math.max(0, Math.min(5, Math.floor((level - 1) / 16)))
}

// ---------------------------------------------------------------------------
// AC1 / V-019 — the six COLTAB banks, transcribed from the ROM
// ---------------------------------------------------------------------------
describe('AC1 / V-019 — the six COLTAB banks (ALDISP.MAC:2405-2456)', () => {
  it('exports the palette as pure, testable data', () => {
    expect(Array.isArray(P.COLTAB_BANKS), 'glyphs.ts must export COLTAB_BANKS').toBe(true)
  })

  it('is exactly SIX banks — not eight (our old LEVEL_COLORS count), not one', () => {
    expect(P.COLTAB_BANKS).toHaveLength(6)
  })

  it('every bank has exactly EIGHT slots', () => {
    expect(P.COLTAB_BANKS, 'COLTAB_BANKS must exist').toBeDefined()
    expect(P.COLTAB_BANKS?.length, 'and not be empty').toBeGreaterThan(0)
    for (const [i, bank] of (P.COLTAB_BANKS ?? []).entries()) {
      expect(bank, `bank ${i} must have 8 slots`).toHaveLength(8)
    }
  })

  it('matches the ROM byte-for-byte across all 48 entries', () => {
    // The whole transcription, in one deep compare. Any single mistranscribed
    // slot fails here with the bank/slot that diverges.
    expect(P.COLTAB_BANKS).toEqual(COLTAB)
  })

  it('slot 0 (EXPLOSIONS) is ZWHITE in EVERY bank — the DA-005 colour-half', () => {
    // ALDISP.MAC:2406,2414,2422,2430,2441,2449 all `.BYTE ZWHITE`. The explosion
    // white survives the indirection because it is white in every bank.
    for (let bank = 0; bank < 6; bank++) {
      expect(P.COLTAB_BANKS?.[bank]?.[0], `bank ${bank} slot 0`).toBe('white')
    }
  })

  it('the FLIPPER slot (3) really cycles by bank — red→purple→green→… (V-019 tell)', () => {
    // V-019: "slot 3 is ZRED in bank 1 but ZPURPL in bank 2 and ZGREEN in bank 4"
    // (1-based banks). This is the whole point: the same enemy, a different colour
    // per wave-group. Resolve it through Dev's actual palette, not the local golden
    // — a Dev who hard-codes one hue collapses this to a constant and it goes red.
    const flipperByBank = [0, 1, 2, 3, 4, 5].map((bank) => P.paletteColor?.(bank * 16 + 1, SLOT_FLIPPER))
    expect(flipperByBank).toEqual(['red', 'purple', 'green', 'green', 'red', 'yellow'])
    expect(new Set(flipperByBank).size, 'the flipper colour must vary across banks').toBeGreaterThan(1)
  })
})

// ---------------------------------------------------------------------------
// AC1 — the slot resolver: enemies resolve colour THROUGH a slot
// ---------------------------------------------------------------------------
describe('AC1 — paletteColor(level, slot) resolves enemy colour via the per-wave bank', () => {
  it('exposes a pure resolver', () => {
    expect(typeof P.paletteColor, 'glyphs.ts must export paletteColor(level, slot)').toBe('function')
  })

  it('resolves the TANKER slot (2) to its bank colour, wave-group by wave-group', () => {
    // ALDISP slot 2: purple, blue, cyan, purple, purple, purple across banks 0-5.
    const tankerByBank = COLTAB.map((b) => b[SLOT_TANKER])
    for (let bank = 0; bank < 6; bank++) {
      const level = bank * 16 + 1 // first wave of each bank
      expect(P.paletteColor?.(level, SLOT_TANKER), `tanker @ level ${level} (bank ${bank})`).toBe(tankerByBank[bank])
    }
  })

  it('resolves the PULSAR slot (4) identically at both ends of a wave-group', () => {
    // Bank membership, not the exact wave, drives the colour: wave 1 and wave 16
    // are the same bank, so the same colour.
    for (let bank = 0; bank < 6; bank++) {
      const lo = bank * 16 + 1
      const hi = bank * 16 + 16
      const want = COLTAB[bank][SLOT_PULSAR]
      expect(P.paletteColor?.(lo, SLOT_PULSAR)).toBe(want)
      expect(P.paletteColor?.(hi, SLOT_PULSAR)).toBe(want)
    }
  })
})

// ---------------------------------------------------------------------------
// AC2 — the bank advances every 16 waves, and saturates at the sixth
// ---------------------------------------------------------------------------
describe('AC2 — paletteBank(level) advances every 16 waves (INICOL, ALDISP.MAC:2349-2374)', () => {
  it('exposes a pure bank selector', () => {
    expect(typeof P.paletteBank, 'glyphs.ts must export paletteBank(level)').toBe('function')
  })

  it('holds one bank for a whole 16-wave group, then steps at the boundary', () => {
    const boundaries: [number, number, number][] = [
      // [lastLevelOfGroup, firstLevelOfNext, bankBeforeBoundary]
      [16, 17, 0],
      [32, 33, 1],
      [48, 49, 2],
      [64, 65, 3],
      [80, 81, 4],
    ]
    for (const [last, next, bankBefore] of boundaries) {
      expect(P.paletteBank?.(last), `level ${last} is still bank ${bankBefore}`).toBe(bankBefore)
      expect(P.paletteBank?.(next), `level ${next} steps to bank ${bankBefore + 1}`).toBe(bankBefore + 1)
    }
  })

  it('agrees with the ROM formula across the first six groups', () => {
    for (let level = 1; level <= 96; level++) {
      expect(P.paletteBank?.(level), `level ${level}`).toBe(expectedBank(level))
    }
  })

  // The walk-off. INICOL clamps CURWAV to 0x5F before indexing, so the table can
  // never be walked off its end — but our s.level increments with no cap, so the
  // port reaches states the ROM's clamp hid. Pin the FIRST level past the table
  // AND far beyond it, and prove it saturates at bank 5 rather than falling
  // through to some default. (Sidecar: "test the wave AFTER the last row.")
  it('saturates at bank 5 forever — never a 7th bank, never a wrap, never a fall-through', () => {
    for (const level of [96, 97, 112, 128, 200, 999, 10_000]) {
      expect(P.paletteBank?.(level), `level ${level} must clamp to the sixth bank`).toBe(5)
    }
  })

  it('a deep wave resolves to bank 5\'s ACTUAL colours, not a black/undefined default', () => {
    // The dangerous failure is silent: an out-of-range index that returns the same
    // value as a legitimate one. Bank 5 slot 6 is GREEN; if a deep wave went black
    // it would masquerade as an extra invisible-well band that the ROM does not have.
    expect(P.paletteColor?.(999, SLOT_WELL)).toBe('green')
    expect(P.paletteColor?.(999, SLOT_FLIPPER)).toBe('yellow')
  })

  it('clamps the low end defensively (level 0/1 → bank 0)', () => {
    expect(P.paletteBank?.(1)).toBe(0)
    expect(P.paletteBank?.(0)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// AC3 / DB-010 — waves 65-80 render as INVISIBLE WELLS
// ---------------------------------------------------------------------------
describe('AC3 / DB-010 — the invisible-well waves (bank 4 slot 6 = ZBLACK, ALDISP.MAC:2447)', () => {
  it('exposes a pure wellColor(level)', () => {
    expect(typeof P.wellColor, 'glyphs.ts must export wellColor(level)').toBe('function')
  })

  it('the well colour cycles blue → red → yellow → cyan → BLACK → green by bank', () => {
    // DB-010's slot-6 sequence, verbatim. This is the whole identity of Tempest's
    // later waves.
    const wellByBank = COLTAB.map((b) => b[SLOT_WELL])
    expect(wellByBank).toEqual(['blue', 'red', 'yellow', 'cyan', 'black', 'green'])
    // and wellColor must agree with the table it comes from
    for (let bank = 0; bank < 6; bank++) {
      expect(P.wellColor?.(bank * 16 + 1), `well @ bank ${bank}`).toBe(wellByBank[bank])
    }
  })

  it('EVERY wave from 65 to 80 is an invisible (black) well', () => {
    for (let level = 65; level <= 80; level++) {
      expect(P.wellColor?.(level), `wave ${level} must be an invisible well`).toBe('black')
    }
  })

  it('the black band is EXACTLY 65-80 — nowhere else is the well invisible', () => {
    // The famous difficulty spike is one wave-group, not a leak. Check the frames
    // either side and a long tail: a black well outside 65-80 would be a bug, and
    // (per the walk-off) a black well at a DEEP wave would be a silent fall-through.
    expect(P.wellColor?.(64), 'wave 64 (bank 3) is a turquoise well, not black').toBe('cyan')
    expect(P.wellColor?.(81), 'wave 81 (bank 5) is a green well, not black').toBe('green')
    for (let level = 1; level <= 300; level++) {
      const invisible = P.wellColor?.(level) === 'black'
      expect(invisible, `wave ${level}: invisible iff 65..80`).toBe(level >= 65 && level <= 80)
    }
  })
})

// ---------------------------------------------------------------------------
// AC4 / V-011 — `blue` is added to GlyphColor (the ROM's ZBLUE ≠ turquoise)
// ---------------------------------------------------------------------------
describe('AC4 / V-011 — GlyphColor gains a distinct `blue` (ALDISP.MAC:925 LDY ZBLUE)', () => {
  it('the GlyphColor union includes `blue`', () => {
    // GlyphColor is a compile-time type (erased at runtime), so pin it against the
    // module source. Anchor on the type declaration, comments stripped.
    const src = code(glyphsSrc)
    const decl = src.match(/type\s+GlyphColor\s*=\s*([^\n]+)/)
    expect(decl, 'GlyphColor must still be declared in glyphs.ts').not.toBeNull()
    expect(decl![1], 'GlyphColor must list a `blue` member').toMatch(/'blue'|"blue"/)
  })

  it('`blue` is a DISTINCT pixel from `cyan` — not an alias of turquoise', () => {
    // GLYPH_HEX (render.ts) is the one place colours become pixels. Blue and cyan
    // must map to different hexes, or the palette error V-011 flagged survives.
    const src = code(renderSrc)
    const blue = src.match(/\bblue\s*:\s*(['"`])(#[0-9a-fA-F]{3,8})\1/)
    const cyan = src.match(/\bcyan\s*:\s*(['"`])(#[0-9a-fA-F]{3,8})\1/)
    expect(blue, 'GLYPH_HEX must give `blue` its own hex').not.toBeNull()
    expect(cyan, 'GLYPH_HEX must still carry `cyan`').not.toBeNull()
    expect(blue![2].toLowerCase(), 'blue must not be the same pixel as cyan').not.toBe(cyan![2].toLowerCase())
  })

  it('the 6-7 ammo tint is that blue (CHACOU: ZBLUE, ALDISP.MAC:919-930)', () => {
    // V-011 reverses Story 10-8's `cyan` mapping: the low-ammo tint is ZBLUE. The
    // full boundary set lives in the re-seated render.bullet-color.test.ts; pin
    // the corrected middle tier here too.
    const bulletColor = (Glyphs as unknown as { playerBulletColor?: (n: number) => string }).playerBulletColor
    expect(typeof bulletColor).toBe('function')
    expect(bulletColor?.(6)).toBe('blue')
    expect(bulletColor?.(7)).toBe('blue')
  })
})

// ---------------------------------------------------------------------------
// AC5 — eight slots, and nothing outside the ROM's eight colours ships
// ---------------------------------------------------------------------------
describe('AC5 — the palette is eight slots and only the ROM\'s eight colours', () => {
  it('produces only the ROM\'s eight palette colours — never `orange`', () => {
    // Orange is not in the ROM's palette at all (tp1-3 / V-008). Assert against
    // Dev's actual export (not a local fallback) so a missing palette fails here.
    expect(P.COLTAB_BANKS, 'COLTAB_BANKS must exist').toBeDefined()
    const all = (P.COLTAB_BANKS ?? []).flat()
    expect(all, 'six banks of eight slots').toHaveLength(48)
    for (const c of all) expect(ROM_PALETTE_COLORS.has(c), `${c} is not a ROM palette colour`).toBe(true)
    expect(all, 'orange belongs to the spiker (tp1-3), never the palette').not.toContain('orange')
  })

  it('uses all eight ROM colours across the table (a real 8-colour palette)', () => {
    expect(P.COLTAB_BANKS, 'COLTAB_BANKS must exist').toBeDefined()
    const used = new Set((P.COLTAB_BANKS ?? []).flat())
    expect(used).toEqual(ROM_PALETTE_COLORS)
  })

  it('`orange` remains a GlyphColor for non-palette uses — only the PALETTE excludes it', () => {
    // Guard against over-fixing: the palette must not produce orange, but the type
    // still needs it (GLYPH_HEX.orange and other callers). Removing it is too far.
    expect(code(glyphsSrc)).toMatch(/type\s+GlyphColor\s*=[^\n]*'orange'/)
  })
})

// ---------------------------------------------------------------------------
// AC1 wiring — the WELL consumes the palette instead of an arbitrary hue list
// ---------------------------------------------------------------------------
describe('AC1 wiring — render.ts drives the well through the palette, not LEVEL_COLORS', () => {
  // render's draw functions are module-private and take a live canvas, so the
  // testable seam is the source text (the tp1-3 / Story 6-17 house pattern). Assert
  // the POSITIVE (the palette is consumed) rather than LEVEL_COLORS' removal — the
  // superzapper flash may still want a hue ramp, and forbidding it over-specifies.
  const src = code(renderSrc)

  it('imports the palette resolver from the glyphs module', () => {
    expect(src).toMatch(/import[\s\S]*?\b(wellColor|paletteColor|COLTAB_BANKS)\b[\s\S]*?from\s*['"][^'"]*glyphs['"]/)
  })

  it('derives the per-level well colour from the palette', () => {
    expect(src, 'the well hue must come from the palette, not an arbitrary 8-hue list').toMatch(
      /\b(wellColor|paletteColor)\s*\(/,
    )
  })

  it('no longer keys the well off the old (level-1) % LEVEL_COLORS index', () => {
    // The specific defective expression DB-010 cites (render.ts:922). Its removal
    // is safe to require: it is the bug, not shared machinery.
    expect(src).not.toMatch(/LEVEL_COLORS\s*\[\s*\(\s*s\.level\s*-\s*1\s*\)/)
  })
})
