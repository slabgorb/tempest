// tests/shell/tp1-3.cheap-wins.test.ts
//
// Story tp1-3 — the SHELL half of the nine one-line ROM-fidelity fixes (the core
// half is tests/core/tp1-3.cheap-wins.test.ts). Audited against Theurer's original
// 1981 assembler (~/Projects/tempest-source-text — the LF copy).
//
//   AC1  V-008        the spiker is GREEN, not orange       (glyphs.ts:120)
//   AC2  V-012/DA-005 the enemy death burst is WHITE         (render.ts:460)
//   AC4  DA-006       only frame 0 is dim, not frames 0 AND 1 (fx.ts:233)
//   AC8  DA-020       the invented pulsar colour-strobe is dropped (render.ts:363)
//   AC9  V-016        the lives icon is the LIFE1 claw silhouette (render.ts:538)
//
// Each verified verbatim at primary source during test design:
//   V-008  ALCOMN.MAC:369 `TRACOL=GREEN  ;TRALERS`. Orange is not in the ROM's
//          eight-slot palette at all.
//   V-012  ALCOMN.MAC:366 `EXPCOL=WHITE  ;EXPLOSION`, and EXPL1..EXPL4 each open
//          `CSTAT WHITE` (ALVROM.MAC:350/358/366/374). Ours strokes '#ffe66b'.
//   DA-006 ALVROM.MAC: `CB=07` is set once, immediately before EXPL1 (line 347);
//          `CB=0E` is set before EXPL2 (line 356) and STAYS 0E through EXPL3/EXPL4.
//          So frame 0 (scale 1) is dim and frames 1,2,3 (scales 2,4,8) are ALL bright.
//   DA-020 ALDISP.MAC:861-867 PULPIC: `LDA I,TURQOI / LDY PULSON / IFPL / LDA I,WHITE`
//          — a plain two-state toggle on the sign of PULSON. The SHAPE animates (PULTAB);
//          the COLOUR does not strobe. Ours multiplies in `sin(renderTime * 18)`.
//   V-016  ALVROM.MAC:171-181 LIFE1: `CSTAT YELLOW` then a closed, mirror-symmetric
//          8-vector chain — (4,-2) (1,-3) (3,-2) (0,-1) (-3,-2) (-1,-3) (-4,-2) (0,0)
//          — the claw's own W-silhouette. Ours draws a hand-authored chevron with a
//          cross-brace and an invented white apex dot.
//
// TEA test-design decisions:
//  • render.ts's draw functions are module-private and take a live canvas, so — per
//    the house pattern established by render.claw.test.ts and render.bullet-color.test.ts
//    (Story 6-17 / 10-8) — the testable seam is the module SOURCE TEXT via Vite `?raw`.
//    Source scans read COMMENTS too, so every scan below is anchored to a code
//    construct (an assignment, a call argument), never a bare word that a comment
//    could satisfy or break.
//  • AC9 needs real geometry, not a source scan, so it requires the LIFE1 chain to be
//    exported from the PURE glyphs module as `lifeIconGlyph()` — the same shape the
//    Story 10-8 fix took (`playerBulletColor` moved into glyphs.ts to become testable).
//    render.ts then CONSUMES it, which the source scan asserts.
//  • The vertex chain is pinned up to a global Y-SIGN FLIP. The AVG's +y is up and the
//    canvas's +y is down; which convention glyphs.ts uses is Dev's call, and pinning it
//    would be inventing a requirement the ROM does not state.
import { describe, it, expect } from 'vitest'
// NAMESPACE import, deliberately: `lifeIconGlyph` does not exist yet, and a named
// import of a missing export is a module-load SyntaxError that would take the whole
// file down with it — AC1/AC2/AC4/AC8 would fail for the wrong reason and Dev could
// never see partial green. A namespace access is just `undefined` until Dev adds it.
import * as Glyphs from '../../src/shell/glyphs'
import { spikerGlyph, playerClawGlyph, type Glyph } from '../../src/shell/glyphs'
import { createFx, type Explosion } from '../../src/shell/fx'
import { initialState } from '../../src/core/state'
import type { GameEvent } from '../../src/core/events'
import renderSrc from '../../src/shell/render.ts?raw'
import glyphsSrc from '../../src/shell/glyphs.ts?raw'

const FRAME = 1 / 60

// Extract one function body from module source: from `function name` to the next
// top-level function. (Same helper as render.claw.test.ts — the house pattern.)
function fnBody(src: string, name: string): string {
  const start = src.search(new RegExp(`(export\\s+)?function\\s+${name}\\b`))
  if (start < 0) return ''
  const rest = src.slice(start + 1)
  const nextRel = rest.search(/\n(export\s+)?function\s/)
  return nextRel < 0 ? src.slice(start) : src.slice(start, start + 1 + nextRel)
}

// Strip line- and block-comments so a scan cannot be satisfied (or broken) by prose.
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

// ---------------------------------------------------------------------------
// AC1 — V-008: the spiker is GREEN (ALCOMN.MAC:369 `TRACOL=GREEN ;TRALERS`)
// ---------------------------------------------------------------------------

describe('AC1 / V-008 — the spiker is GREEN, not orange', () => {
  it('every spin frame strokes green', () => {
    for (const frame of [0, 1, 2, 3, 4, 7]) {
      const strokes = spikerGlyph(frame)
      expect(strokes.length).toBeGreaterThan(0)
      for (const s of strokes) {
        expect(s.color, `spikerGlyph(${frame}) must be green`).toBe('green')
      }
    }
  })

  it('no spiker stroke is orange — orange is not in the ROM\'s eight-slot palette', () => {
    const colors = [0, 1, 2, 3].flatMap((f) => spikerGlyph(f).map((s) => s.color))
    expect(colors).not.toContain('orange')
  })

  it('the four distinct spin frames survive the recolour (Story 6-8 guard)', () => {
    // Guard the guard: recolouring must not collapse the animation. glyphs.test.ts
    // pins 4 distinct frames; if a Dev "fixes" the colour by rewriting the glyph, that
    // contract must still hold.
    const fingerprints = [0, 1, 2, 3].map((f) => JSON.stringify(spikerGlyph(f)))
    expect(new Set(fingerprints).size).toBe(4)
  })
})

// ---------------------------------------------------------------------------
// AC2 — V-012 / DA-005: the enemy death burst is WHITE
// ---------------------------------------------------------------------------

describe('AC2 / V-012 — the enemy death burst is WHITE (EXPCOL=WHITE; EXPL1-4 all `CSTAT WHITE`)', () => {
  const src = code(renderSrc)

  it('ENEMY_BURST_COLOR is white', () => {
    const decl = src.match(/const\s+ENEMY_BURST_COLOR\s*=\s*(['"`])(.*?)\1/)
    expect(decl, 'ENEMY_BURST_COLOR must still exist').not.toBeNull()
    const value = decl![2].trim().toLowerCase()
    expect(['#fff', '#ffffff', 'white']).toContain(value)
  })

  it('the warm gold #ffe66b is gone from the burst', () => {
    // The shipped value. It must not survive anywhere in the burst's draw path.
    const decl = src.match(/const\s+ENEMY_BURST_COLOR\s*=\s*(['"`])(.*?)\1/)
    expect(decl![2].toLowerCase()).not.toBe('#ffe66b')
    expect(code(fnBody(renderSrc, 'drawEnemyBurst'))).not.toMatch(/#ffe66b/i)
  })
})

// ---------------------------------------------------------------------------
// AC4 — DA-006: only frame 0 is dim (CB=07 for EXPL1; CB=0E from EXPL2 on)
// ---------------------------------------------------------------------------

describe('AC4 / DA-006 — the burst brightness ramp is off by one frame', () => {
  // The existing suite (fx.explosions.test.ts) DEDUPES the brightness sequence to
  // [7,14] before asserting it — which passes whether the dim tier covers frame 0 or
  // frames 0 AND 1. It is blind to this bug by construction. So pin brightness AGAINST
  // THE SCALE: the ROM sets CB per picture, and scale is that picture's identity.
  //   EXPL1 scale 1 → CB=07 (dim) · EXPL2 scale 2 → CB=0E · EXPL3 4 → 0E · EXPL4 8 → 0E
  const DIM = 7
  const BRIGHT = 14

  function burstSamples(): { scale: number; brightness: number }[] {
    const s = initialState(1)
    const fx = createFx()
    fx.detect(s, FRAME, [])
    const death: GameEvent = { type: 'enemy-death', enemyType: 'flipper', lane: 2, depth: 0.5 }
    fx.detect(s, FRAME, [death])

    const isEnemy = (e: Explosion): e is Extract<Explosion, { kind: 'enemy' }> => e.kind === 'enemy'
    const samples: { scale: number; brightness: number }[] = []
    for (let i = 0; i < 240; i++) {
      const e = fx.explosions.find(isEnemy)
      if (!e) break
      samples.push({ scale: e.scale, brightness: e.brightness })
      fx.update(FRAME)
    }
    return samples
  }

  it('scale 1 (EXPL1) is the ONLY dim frame — CB=07', () => {
    const dimScales = new Set(burstSamples().filter((s) => s.brightness === DIM).map((s) => s.scale))
    expect([...dimScales]).toEqual([1])
  })

  it('scale 2 (EXPL2) is FULL BRIGHT — this is the bug: we ship it dim', () => {
    const atScale2 = burstSamples().filter((s) => s.scale === 2)
    expect(atScale2.length, 'the burst must actually reach scale 2').toBeGreaterThan(0)
    for (const s of atScale2) expect(s.brightness).toBe(BRIGHT)
  })

  it('scales 4 and 8 (EXPL3, EXPL4) stay full bright — CB stays 0E', () => {
    const samples = burstSamples()
    for (const scale of [4, 8]) {
      const at = samples.filter((s) => s.scale === scale)
      expect(at.length, `the burst must reach scale ${scale}`).toBeGreaterThan(0)
      for (const s of at) expect(s.brightness).toBe(BRIGHT)
    }
  })

  it('the two-tier ramp itself survives — dim strictly precedes bright, and never returns', () => {
    const seq = burstSamples().map((s) => s.brightness)
    expect(seq[0]).toBe(DIM) // it still opens dim...
    expect(seq[seq.length - 1]).toBe(BRIGHT) // ...and ends bright
    // and the ramp is monotone: every dim sample precedes every bright one.
    expect(seq.lastIndexOf(DIM)).toBeLessThan(seq.indexOf(BRIGHT))
    expect(new Set(seq)).toEqual(new Set([DIM, BRIGHT])) // exactly two tiers, no third
  })
})

// ---------------------------------------------------------------------------
// AC8 — DA-020: the pulsar's colour does not strobe
// ---------------------------------------------------------------------------

describe('AC8 / DA-020 — the invented pulsar colour-strobe is dropped (PULPIC, ALDISP.MAC:861-867)', () => {
  // PULPIC is a two-state toggle on the SIGN of PULSON: white while pulsing, turquoise
  // otherwise. No per-frame flicker in the colour logic. Our code gates white on
  // `e.pulsing && beat > 0.5` where beat = 0.5 + 0.5*sin(renderTime*18) — an invented
  // strobe layered on top of the pulse state.
  //
  // The pulsar is drawn by a private render.ts function against a live canvas, so the
  // seam is the source text. Anchor on the CALL: pulsarColor's argument must be the
  // pulse state alone — no time term.
  const src = code(renderSrc)

  it('pulsarColor is called with the pulse state alone — no time-varying term', () => {
    const call = src.match(/pulsarColor\(([^)]*)\)/)
    expect(call, 'render.ts must still call pulsarColor').not.toBeNull()
    const arg = call![1]
    expect(arg).toMatch(/pulsing/) // it is still driven by the pulse state...
    expect(arg).not.toMatch(/beat|sin|renderTime|Math\./) // ...and by nothing else
  })

  it('no `beat > 0.5` colour gate survives anywhere in render.ts', () => {
    expect(src).not.toMatch(/beat\s*>\s*0?\.5/)
  })

  it('the pulsar SHAPE may still animate — PULTAB does drive the zig-zag', () => {
    // Guard against over-fixing: DA-020 kills the COLOUR strobe only. The variant
    // animation is authentic (the ROM's PULTAB cycles the zig-zag), so a Dev who rips
    // out all time-dependence has gone too far. pulsarVariant must still be driven.
    const call = src.match(/pulsarVariant\(([^)]*)\)/)
    expect(call, 'the zig-zag variant animation must survive').not.toBeNull()
    expect(call![1].length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// AC9 — V-016: the lives icon is the LIFE1 claw silhouette
// ---------------------------------------------------------------------------

describe('AC9 / V-016 — the lives icon is the LIFE1 claw silhouette (ALVROM.MAC:171-181)', () => {
  // LIFE1's chain, transcribed from the source. The AVG walks: ICVEC (pen to origin)
  // then eight vectors, the last returning to (0,0) — a closed, mirror-symmetric
  // W-silhouette of exactly 8 vertices. NOT the two-leg chevron + cross-brace + white
  // apex dot that drawClawIcon hand-draws today, and NOT the same picture as NCRS1-8
  // (the player cursor), which the audit calls out explicitly.
  const LIFE1: readonly { x: number; y: number }[] = [
    { x: 0, y: 0 }, { x: 4, y: -2 }, { x: 1, y: -3 }, { x: 3, y: -2 },
    { x: 0, y: -1 }, { x: -3, y: -2 }, { x: -1, y: -3 }, { x: -4, y: -2 },
  ]

  // The glyph must exist as pure, testable geometry — a canvas cannot be asserted on.
  const lifeIconGlyph = (Glyphs as unknown as { lifeIconGlyph?: () => Glyph }).lifeIconGlyph

  it('glyphs.ts exports a pure `lifeIconGlyph()`', () => {
    expect(typeof lifeIconGlyph, 'the LIFE1 chain must be pure, exported geometry').toBe('function')
  })

  it('is a single CLOSED stroke of exactly 8 vertices', () => {
    const strokes = lifeIconGlyph!()
    expect(strokes).toHaveLength(1)
    expect(strokes[0].points).toHaveLength(8)
    expect(strokes[0].closed, 'LIFE1\'s last vector returns to the origin').toBe(true)
  })

  it('matches LIFE1\'s vertex chain (up to the AVG↔canvas y-sign convention)', () => {
    const pts = lifeIconGlyph!()[0].points
    const asIs = LIFE1.every((v, i) => pts[i].x === v.x && pts[i].y === v.y)
    const yFlipped = LIFE1.every((v, i) => pts[i].x === v.x && pts[i].y === -v.y)
    expect(
      asIs || yFlipped,
      `expected LIFE1's chain (either y-orientation), got ${JSON.stringify(pts)}`,
    ).toBe(true)
  })

  it('is mirror-symmetric about the claw\'s axis — the W-silhouette', () => {
    const pts = lifeIconGlyph!()[0].points
    for (const p of pts) {
      const mirrored = pts.some((q) => q.x === -p.x && q.y === p.y)
      expect(mirrored, `(${p.x},${p.y}) has no mirror twin`).toBe(true)
    }
  })

  it('is YELLOW (`CSTAT YELLOW`) — the one thing the shipped icon already got right', () => {
    expect(lifeIconGlyph!()[0].color).toBe('yellow')
  })

  it('is NOT the player-cursor picture — the audit calls this out explicitly', () => {
    expect(JSON.stringify(lifeIconGlyph!())).not.toBe(JSON.stringify(playerClawGlyph(0)))
  })

  it('render.ts DRAWS the glyph instead of hand-stroking a chevron', () => {
    const icon = code(fnBody(renderSrc, 'drawClawIcon'))
    expect(icon, 'drawClawIcon must still exist').not.toBe('')
    expect(icon).toMatch(/lifeIconGlyph/) // it consumes the pure chain...
    expect(icon).not.toMatch(/\.arc\(/) // ...and the invented white apex dot is gone
  })

  it('the LIFE1 chain lives in the PURE glyph module, not in render.ts', () => {
    expect(code(glyphsSrc)).toMatch(/lifeIconGlyph/)
  })
})
