// tests/shell/tp1-30.palette-enemies-starfield.test.ts
//
// THE PALETTE, part 2 (tp1-30) — enemies + starfield resolve colour through the
// per-wave-group COLTAB bank (V-019 "the deepest change", DB-017). Follow-up to
// tp1-12, which shipped the COLTAB mechanism (COLTAB_BANKS / paletteBank /
// paletteColor / wellColor in src/shell/glyphs.ts) and wired ONLY the well.
// tp1-30 lands the DEFERRED per-enemy and starfield recolouring.
//
// ── AC1: THE ROM QUESTION, RESOLVED IN WRITING (before any wiring) ───────────
//
// The colour model has TWO namespaces (both defined in the 1981 source):
//   • Z-prefixed (ZWHITE, ZTURQOI, ZBLUE…) are HUES — the bytes COLTAB stores and
//     INICOL loads into the 8-slot colour RAM (COLRAM) per wave-group.
//   • bare names (WHITE, TURQOI, BLUE…) are COLRAM SLOT INDICES 0-7 — the value a
//     routine stores to `COLOR` (ALCOMN.MAC:351-358):
//         WHITE=0  YELLOW=1  (tanker=2)  RED=3  TURQOI=4  GREEN=5  BLUE=6
//     `STA COLOR` therefore selects a SLOT; the AVG maps it through the current
//     bank's COLRAM. That is the whole point of the tp1-12 machinery.
//
//   Slot MEANINGS (COLTAB, ALDISP.MAC:2406-2413):
//     0 EXPLOSIONS · 1 CURSOR · 2 TANKERS · 3 FLIPPERS · 4 PULSARS · 5 LETTERS ·
//     6 WELL · 7 LETTERS/FLASH
//
// **The pulsar question — does the pulsar read slot 4, or is it "always PULPIC
//   turquoise/white"?** The premise is a false dichotomy, and the answer INVERTS
//   the naive reading (the recurring tp1 trap; cf. tp1-27). PULPIC IS the slot-
//   SELECTION mechanism — it chooses BETWEEN two slots, both resolved through the
//   bank (ALDISP.MAC:861-867):
//         PULPIC:  LDA I,TURQOI   ;PULSE OFF   → COLOR = slot 4  (per-bank PULSARS)
//                  LDY PULSON / IFPL
//                  LDA I,WHITE    ;PULSE ON    → COLOR = slot 0  (white, every bank)
//                  STA COLOR
//   So: a DORMANT pulsar draws in slot 4 (per-bank — cyan in bank 0, YELLOW in
//   bank 1, PURPLE in bank 2, …); a PULSING pulsar draws in slot 0 (white in every
//   bank). "Turquoise/white" is merely bank 0's name for slots 4/0. The two-state
//   PULPIC strobe SURVIVES (pulsing≠dormant), but it is NOT a pair of fixed hues —
//   it recolours per bank exactly like every other enemy (V-019: "the ROM swaps
//   the ENTIRE 8-slot colour RAM every 16 waves, recolouring EVERY enemy"). The
//   confirmed finding V-004 ("turquoise when idle, white while pulsing") is bank 0
//   observed truth; V-019 adds the per-bank behaviour. Both hold after tp1-30.
//
// **The tanker sub-stroke — which recolours?** BODY only. tankerGlyph (glyphs.ts
//   :100-115) is a purple X-diamond BODY (closed) + an optional CARGO EMBLEM (open)
//   that SIGNALS the split: cyan for pulsar cargo (ROM l.4628), yellow for fuseball
//   (l.4711), none for flipper (l.4798). The body resolves through slot 2 (TANKERS);
//   the emblem KEEPS its cargo colour at every level. This is why it is NOT a blanket
//   glyph override — strokeGlyph's `override` recolours EVERY sub-stroke and would
//   erase the emblem's meaning.
//
// **The starfield (DB-017, ALDISP.MAC:2949-2961):** waves 1-4 → every plane BLUE
//   (slot 6); from wave 5 → each plane's colour is its own plane index (`X AND 7`)
//   with index 7 remapped to slot 4, resolved through the bank. Under bank 0 that
//   is the sequence white,yellow,purple,red,turquoise,green,blue,turquoise.
//
// ── TEA (Imperator Furiosa) test-design decisions ───────────────────────────
//  • Every colour rule is pinned BEHAVIOURALLY by calling the pure function and
//    asserting its return — NOT by scanning render.ts source. That is the whole
//    point of AC5: tp1-12's well-wiring source-scan was mutation-proved gameable.
//  • Expected enemy/star colours are asserted BOTH as ROM literals (catches a
//    wrong SLOT) AND against paletteColor(level, SLOT) (catches a wrong BANK). The
//    COLTAB table itself is already pinned by tp1-12 — here we pin the WIRING to it.
//  • One drawEnemy() recording-ctx integration test proves s.level actually reaches
//    the pixels (a constant would satisfy tsc but fail here) and that the emblem
//    survives ON SCREEN — the anti-gaming coverage the story explicitly asks for.
//  • The pulsar tests encode the ROM ruling above; see the Design Deviation and the
//    Delivery Finding raised for Dev/Reviewer (the render.ts:386-395 comment and the
//    fixed-hue pulsarColor(bright) both describe the bank-0 approximation).

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import * as G from '../../src/shell/glyphs'
import { flipperGlyph, tankerGlyph, pulsarColor, paletteColor } from '../../src/shell/glyphs'
import * as Render from '../../src/shell/render'
import { makeCircleTube } from '../../src/core/geometry'
import type { GlyphStroke, PaletteColor } from '../../src/shell/glyphs'
import type { Enemy } from '../../src/core/state'
import type { GameState } from '../../src/core/state'

// ── ROM colour-RAM slot indices (ALCOMN.MAC:351-358) ────────────────────────
const SLOT_WHITE = 0 // EXPLOSIONS — white in every bank (the PULPIC pulse-ON slot)
const SLOT_TANKER = 2 // TANKERS   — the tanker BODY slot
const SLOT_FLIPPER = 3 // FLIPPERS  — FLICOL
const SLOT_PULSAR = 4 // PULSARS   — the PULPIC pulse-OFF slot (TURQOI)
const SLOT_BLUE = 6 // BLUE index — the waves-1-4 star colour (also the WELL slot)

// The eight ROM palette colours (tp1-3/V-008: never orange). `black` is the
// bank-4 invisible well, a legitimate PaletteColor.
const ROM_PALETTE: ReadonlySet<PaletteColor> = new Set<PaletteColor>([
  'white', 'yellow', 'purple', 'red', 'cyan', 'green', 'blue', 'black',
])

// Level → the FIRST level of each of the six banks (INICOL advances every 16 waves).
const BANK_LEVEL = [1, 17, 33, 49, 65, 81] as const

// The closed X-diamond body vs the open cargo emblem (identify by `closed`, so the
// test does not depend on sub-stroke ORDER).
const bodyOf = (g: readonly GlyphStroke[]): GlyphStroke | undefined => g.find((s) => s.closed)
const emblemOf = (g: readonly GlyphStroke[]): GlyphStroke | undefined => g.find((s) => !s.closed)

// A minimal recording ctx — captures the strokeStyle used at each stroke()/fill().
// drawEnemy's glyphs are DOM-free (strokeGlyph only touches these members), so a
// recording ctx is safe in vitest's node env (house pattern: render.tube-glow).
function makeRecCtx(): { ctx: CanvasRenderingContext2D; styles: string[] } {
  const styles: string[] = []
  const rec: Record<string, unknown> = {
    strokeStyle: '', fillStyle: '', shadowColor: '', shadowBlur: 0, lineWidth: 1, globalAlpha: 1,
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
    beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, arc() {},
    stroke() { styles.push(String(rec.strokeStyle)) },
    fill() { styles.push(String(rec.fillStyle)) },
  }
  return { ctx: rec as unknown as CanvasRenderingContext2D, styles }
}

// A minimal GameState — drawEnemy reads only s.tube and (post-tp1-30) s.level.
// Cast is scoped and justified (cf. render.tube-glow.test.ts).
function stateAt(level: number): GameState {
  const tube = makeCircleTube(16, { x: 0, y: 0 }, 20, 200)
  return { tube, level } as unknown as GameState
}

// A settled (non-jumping: no jumpAngle) enemy carrying valid CAM registers.
function enemyAt(over: Partial<Enemy> & Pick<Enemy, 'kind'>): Enemy {
  return {
    lane: 0, depth: 0.5, camPc: 0, camLoop: 0, rot: 1, direction: 1, ...over,
  } as Enemy
}

// ===========================================================================
// AC2 / V-019 — the FLIPPER recolours through slot 3 (FLIPPERS), per bank
// ===========================================================================
describe('AC2 / V-019 — flipper colour resolves through COLTAB slot 3 (FLICOL)', () => {
  it('flipperGlyph(level) takes a level and returns a single stroke', () => {
    const g = flipperGlyph(BANK_LEVEL[0])
    expect(Array.isArray(g), 'flipperGlyph must return a Glyph (array of strokes)').toBe(true)
    expect(g.length, 'the flipper is one closed bowtie stroke').toBe(1)
  })

  it('the flipper is RED / PURPLE / GREEN / GREEN / RED / YELLOW across the six banks', () => {
    // ROM slot-3 sequence, verbatim (V-019: "ZRED in bank 1, ZPURPL in bank 2,
    // ZGREEN in bank 4" — 1-based bank numbering). A wrong SLOT is caught here.
    const wantByBank: PaletteColor[] = ['red', 'purple', 'green', 'green', 'red', 'yellow']
    BANK_LEVEL.forEach((level, bank) => {
      expect(flipperGlyph(level)[0]?.color, `flipper @ level ${level} (bank ${bank})`).toBe(wantByBank[bank])
    })
  })

  it('the flipper stroke equals the palette slot-3 colour at every bank (wired to the table)', () => {
    // A wrong BANK is caught here (against the tp1-12-pinned COLTAB table).
    for (const level of BANK_LEVEL) {
      expect(flipperGlyph(level)[0]?.color).toBe(paletteColor(level, SLOT_FLIPPER))
    }
  })
})

// ===========================================================================
// AC2 — the TANKER body recolours (slot 2); the cargo EMBLEM survives
// ===========================================================================
describe('AC2 — tanker: BODY resolves through slot 2, cargo EMBLEM keeps its meaning', () => {
  it('the body colour is slot 2 (TANKERS) at every bank — purple/blue/cyan/green/purple/purple', () => {
    const wantByBank: PaletteColor[] = ['purple', 'blue', 'cyan', 'green', 'purple', 'purple']
    BANK_LEVEL.forEach((level, bank) => {
      const body = bodyOf(tankerGlyph(level, 'pulsar'))
      expect(body, `tanker body must exist @ level ${level}`).toBeDefined()
      expect(body?.color, `tanker body @ level ${level} (bank ${bank})`).toBe(wantByBank[bank])
      expect(body?.color, 'body must equal the palette slot-2 colour').toBe(paletteColor(level, SLOT_TANKER))
    })
  })

  it('the PULSAR-cargo emblem stays CYAN at every level (it is NOT recoloured)', () => {
    // The emblem signals cargo type; recolouring it would erase that signal. This
    // is the "NOT a blanket override" guard — the emblem is level-INVARIANT.
    for (const level of BANK_LEVEL) {
      expect(emblemOf(tankerGlyph(level, 'pulsar'))?.color, `pulsar-cargo emblem @ ${level}`).toBe('cyan')
    }
  })

  it('the FUSEBALL-cargo emblem stays YELLOW at every level (it is NOT recoloured)', () => {
    for (const level of BANK_LEVEL) {
      expect(emblemOf(tankerGlyph(level, 'fuseball'))?.color, `fuseball-cargo emblem @ ${level}`).toBe('yellow')
    }
  })

  it('a flipper-cargo tanker is body-only (no emblem) and the body still recolours', () => {
    const g = tankerGlyph(17, 'flipper') // bank 1
    expect(g.length, 'flipper-cargo tanker carries no emblem (ROM l.4798)').toBe(1)
    expect(bodyOf(g)?.color, 'body still resolves through slot 2 (bank 1 = blue)').toBe('blue')
  })

  it('the emblem colour is invariant while the body changes — the two are independent', () => {
    // Body differs bank 0 (purple) vs bank 1 (blue); emblem identical (cyan). If
    // Dev blanket-overrode the glyph, the emblem would track the body and this fails.
    const lo = tankerGlyph(1, 'pulsar')
    const hi = tankerGlyph(17, 'pulsar')
    expect(bodyOf(lo)?.color).not.toBe(bodyOf(hi)?.color)
    expect(emblemOf(lo)?.color).toBe(emblemOf(hi)?.color)
  })
})

// ===========================================================================
// AC1 / AC2 — the PULSAR: PULPIC selects slot 0 (pulsing) / slot 4 (dormant)
// ===========================================================================
describe('AC1/AC2 — pulsar: PULPIC toggles slot 0 (white) / slot 4 (per-bank) (ALDISP.MAC:861-867)', () => {
  it('pulsarColor(level, bright) takes a level', () => {
    expect(typeof pulsarColor, 'pulsarColor must exist').toBe('function')
    expect(ROM_PALETTE.has(pulsarColor(1, true) as PaletteColor), 'returns a ROM palette colour').toBe(true)
  })

  it('a PULSING pulsar is WHITE in every bank (slot 0, the PULPIC PULSE-ON slot)', () => {
    for (const level of BANK_LEVEL) {
      expect(pulsarColor(level, true), `pulsing pulsar @ ${level}`).toBe('white')
      expect(pulsarColor(level, true)).toBe(paletteColor(level, SLOT_WHITE))
    }
  })

  it('a DORMANT pulsar recolours per bank — cyan/yellow/purple/yellow/cyan/cyan (slot 4)', () => {
    // The discriminator: the ROM draws the idle pulsar in the bank's slot-4 colour,
    // NOT a fixed cyan. Bank 0 is turquoise (matching V-004); banks 1-3 are not.
    const wantByBank: PaletteColor[] = ['cyan', 'yellow', 'purple', 'yellow', 'cyan', 'cyan']
    BANK_LEVEL.forEach((level, bank) => {
      expect(pulsarColor(level, false), `dormant pulsar @ level ${level} (bank ${bank})`).toBe(wantByBank[bank])
      expect(pulsarColor(level, false)).toBe(paletteColor(level, SLOT_PULSAR))
    })
  })

  it('the two-state STROBE survives — pulse-on differs from pulse-off wherever the slots differ', () => {
    // slot 0 (white) vs slot 4 (per-bank) differ in every bank (slot 4 is never white).
    for (const level of BANK_LEVEL) {
      expect(pulsarColor(level, true), `strobe must be two-state @ ${level}`).not.toBe(pulsarColor(level, false))
    }
  })
})

// ===========================================================================
// AC3 / DB-017 — the STARFIELD colours each plane through the palette from wave 5
// ===========================================================================
describe('AC3 / DB-017 — starfield: blue for waves 1-4, per-plane from wave 5 (ALDISP.MAC:2949-2961)', () => {
  it('exposes a pure starColor(level, planeIndex)', () => {
    expect(typeof G.starColor, 'glyphs.ts must export starColor(level, planeIndex)').toBe('function')
  })

  it('every plane is BLUE for waves 1-4 (slot 6, LDA I,BLUE)', () => {
    for (let level = 1; level <= 4; level++) {
      for (let plane = 0; plane < 8; plane++) {
        expect(G.starColor?.(level, plane), `star plane ${plane} @ wave ${level}`).toBe('blue')
      }
    }
    // and blue IS the bank's slot-6 colour for those (bank-0) waves
    expect(G.starColor?.(1, 3)).toBe(paletteColor(1, SLOT_BLUE))
  })

  it('from wave 5 (bank 0) the eight planes are white,yellow,purple,red,turquoise,green,blue,turquoise', () => {
    // DB-017's exact bank-0 sequence — note plane 7 is TURQUOISE (slot 4), not blue.
    const want: PaletteColor[] = ['white', 'yellow', 'purple', 'red', 'cyan', 'green', 'blue', 'cyan']
    for (let plane = 0; plane < 8; plane++) {
      expect(G.starColor?.(5, plane), `star plane ${plane} @ wave 5`).toBe(want[plane])
    }
  })

  it('plane index 7 is remapped to slot 4 (NOT slot 7) at every bank', () => {
    for (const level of [5, 21, 37]) {
      expect(G.starColor?.(level, 7), `plane 7 @ ${level} → slot 4`).toBe(paletteColor(level, SLOT_PULSAR))
    }
    // and slot 4 ≠ slot 7 in bank 0 (turquoise vs blue), so the remap is observable
    expect(paletteColor(5, 4)).not.toBe(paletteColor(5, 7))
  })

  it('each plane resolves through the CURRENT bank — wave 21 (bank 1) differs from wave 5', () => {
    const bank1: PaletteColor[] = ['white', 'green', 'blue', 'purple', 'yellow', 'cyan', 'red', 'yellow']
    for (let plane = 0; plane < 8; plane++) {
      const slot = (plane & 7) === 7 ? SLOT_PULSAR : (plane & 7)
      expect(G.starColor?.(21, plane), `star plane ${plane} @ wave 21`).toBe(bank1[plane])
      expect(G.starColor?.(21, plane)).toBe(paletteColor(21, slot))
    }
  })

  it('the plane index is masked to 0-7 (ROM `AND I,7`)', () => {
    const masked = G.starColor?.(5, 8)
    expect(masked, 'starColor must resolve plane 8 (not undefined)').toBeDefined()
    expect(masked, 'plane 8 masks to plane 0').toBe(G.starColor?.(5, 0))
  })
})

// ===========================================================================
// AC4 — paletteColor / paletteBank guard their inputs (unreachable until now)
// ===========================================================================
describe('AC4 — palette resolvers guard non-finite level and out-of-range slot', () => {
  it('paletteBank(non-finite) returns a valid bank 0-5, never NaN', () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      const b = G.paletteBank(bad)
      expect(Number.isFinite(b), `paletteBank(${bad}) must be finite`).toBe(true)
      expect(b, `paletteBank(${bad}) in [0,5]`).toBeGreaterThanOrEqual(0)
      expect(b).toBeLessThanOrEqual(5)
    }
  })

  it('paletteColor(non-finite level, slot) does not throw and returns a ROM colour', () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      expect(() => paletteColor(bad, 0), `paletteColor(${bad}, 0) must not crash the render loop`).not.toThrow()
      expect(ROM_PALETTE.has(paletteColor(bad, 0)), `paletteColor(${bad}, 0) is a ROM colour`).toBe(true)
    }
  })

  it('paletteColor(level, out-of-range slot) does not throw and returns a ROM colour', () => {
    for (const slot of [-1, 8, 99, NaN]) {
      expect(() => paletteColor(1, slot), `paletteColor(1, ${slot}) must not crash`).not.toThrow()
      expect(ROM_PALETTE.has(paletteColor(1, slot)), `paletteColor(1, ${slot}) is a ROM colour`).toBe(true)
    }
  })

  it('slot 0 is NOT swallowed by a falsy guard (?? not ||): paletteColor(level, 0) is always white', () => {
    // TS review #4: `slot || fallback` would break slot 0, the most-used slot.
    for (const level of BANK_LEVEL) expect(paletteColor(level, 0)).toBe('white')
  })

  it('the enemy/star/well resolvers survive a non-finite level without throwing', () => {
    expect(() => flipperGlyph(NaN)).not.toThrow()
    expect(() => tankerGlyph(NaN, 'pulsar')).not.toThrow()
    expect(() => pulsarColor(NaN, false)).not.toThrow()
    expect(() => G.starColor?.(NaN, 3)).not.toThrow()
    expect(() => Render.resolveWellColor?.(NaN, null)).not.toThrow()
  })
})

// ===========================================================================
// AC5 — a pure resolveWellColor(level, zapFlash), unit-tested behaviourally
// ===========================================================================
describe('AC5 — resolveWellColor(level, zapFlash) replaces the gameable well source-scan', () => {
  const HEX = /^#[0-9a-f]{6}$/i

  it('render.ts exports a pure resolveWellColor(level, zapFlash)', () => {
    expect(typeof Render.resolveWellColor, 'render.ts must export resolveWellColor').toBe('function')
  })

  it('with no zap, a visible well is a real hue and the invisible well (bank 4) is black', () => {
    const visible = Render.resolveWellColor?.(1, null) // bank 0 well = blue
    expect(String(visible), 'visible well is a 6-digit hex').toMatch(HEX)
    expect(String(visible), 'visible well is not black').not.toBe('#000000')
    // Waves 65-80 (bank 4, slot 6 = ZBLACK) — the famous invisible well.
    expect(Render.resolveWellColor?.(65, null), 'invisible well renders as background black').toBe('#000000')
  })

  it('an active superzapper flash OVERRIDES the well — even the invisible well flashes', () => {
    expect(String(Render.resolveWellColor?.(1, 0)), 'flash is a hue').toMatch(HEX)
    // The zap makes the bank-4 invisible well visible while it strobes.
    expect(Render.resolveWellColor?.(65, 0), 'zap overrides the invisible well').not.toBe('#000000')
  })

  it('the flash hue is LEVEL-INDEPENDENT (it is the strobe ramp, not the well colour)', () => {
    for (const k of [0, 1, 3, 5, 7]) {
      const at1 = Render.resolveWellColor?.(1, k)
      expect(String(at1), `flash ${k} is a hue`).toMatch(HEX)
      expect(at1, `flash ${k} ignores level`).toBe(Render.resolveWellColor?.(65, k))
    }
  })

  it('the flash CYCLES through distinct hues as the index advances', () => {
    const hues = new Set([0, 1, 2, 3, 4, 5, 6, 7].map((k) => Render.resolveWellColor?.(1, k)))
    expect(hues.size, 'the superzapper strobes through the spectrum').toBeGreaterThanOrEqual(2)
  })

  it('the flash index wraps (the ramp is a finite ring)', () => {
    const at8 = Render.resolveWellColor?.(1, 8)
    expect(String(at8), 'index 8 is a hue').toMatch(HEX)
    expect(at8, 'index 8 wraps to 0').toBe(Render.resolveWellColor?.(1, 0))
  })
})

// ===========================================================================
// AC6 — V-019 and DB-017 are marked remediated_by tp1-30
// ===========================================================================
describe('AC6 — the subsumed findings are marked remediated_by tp1-30', () => {
  const findingsDir = fileURLToPath(new URL('../../docs/audit/findings/', import.meta.url))
  const load = (file: string): Array<Record<string, unknown>> =>
    JSON.parse(readFileSync(findingsDir + file, 'utf8')) as Array<Record<string, unknown>>
  const find = (id: string): Record<string, unknown> | undefined => {
    for (const file of ['pair-2-alvrom-shapes-font.json', 'pair-4-aldisp-b-well-projection.json']) {
      const hit = load(file).find((f) => f.id === id)
      if (hit) return hit
    }
    return undefined
  }

  it('V-019 (per-level colour: recolour every enemy) is remediated_by tp1-30', () => {
    expect(find('V-019')?.remediated_by, 'V-019 must name tp1-30').toBe('tp1-30')
  })

  it('DB-017 (per-plane starfield colour) is remediated_by tp1-30', () => {
    expect(find('DB-017')?.remediated_by, 'DB-017 must name tp1-30').toBe('tp1-30')
  })
})

// ===========================================================================
// WIRING — the pixels actually change with s.level (drawEnemy integration)
// ===========================================================================
describe('WIRING — drawEnemy threads s.level to the pixels, and the emblem survives on screen', () => {
  const stylesFor = (enemy: Enemy, level: number): string[] => {
    const { ctx, styles } = makeRecCtx()
    Render.drawEnemy(ctx, stateAt(level), enemy)
    return styles.filter((s) => s.startsWith('#')) // glyph hues are hex
  }

  it('a flipper drawn at wave 1 is a DIFFERENT pixel than at wave 17 (level is threaded, not constant)', () => {
    const lo = stylesFor(enemyAt({ kind: 'flipper' }), 1)
    const hi = stylesFor(enemyAt({ kind: 'flipper' }), 17)
    expect(lo.length, 'the flipper strokes at least once').toBeGreaterThan(0)
    expect(lo[0], 'red (bank 0) ≠ purple (bank 1)').not.toBe(hi[0])
  })

  it('a pulsar-cargo tanker recolours its body but keeps its emblem pixel across levels', () => {
    const lo = new Set(stylesFor(enemyAt({ kind: 'tanker', contains: 'pulsar' }), 1))
    const hi = new Set(stylesFor(enemyAt({ kind: 'tanker', contains: 'pulsar' }), 17))
    expect(lo.size, 'body + emblem = two distinct pixels').toBe(2)
    expect(hi.size).toBe(2)
    // The emblem is the pixel common to both levels; the body is the one that changed.
    const shared = [...lo].filter((h) => hi.has(h))
    expect(shared.length, 'exactly the emblem pixel survives both levels').toBe(1)
    expect([...lo].some((h) => !hi.has(h)), 'the body pixel changed between banks').toBe(true)
  })
})
