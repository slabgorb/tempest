// tests/shell/render.bullet-color.test.ts
//
// Story 10-8: Ammo-count bullet color — tint the player bullet by the number of
// charges (player shots) currently in flight, per the ROM's CHACOU behaviour:
//   • fewer than 6 in flight → yellow
//   • 6–7 in flight          → blue
//   • 8 in flight (the cap)  → red
// Today every bullet is drawn white (glyphs.ts playerBulletGlyph, color:'white',
// stroked by render.ts drawBullets) regardless of how many are on screen.
//
// TEA test-design decisions (see session "Design Deviations → TEA"):
//  • "blue" maps to the existing palette colour `cyan` (#00e5ff) — the codebase's
//    blue. We do NOT introduce a near-duplicate `blue` GlyphColor; the palette
//    stays tight (GLYPH_HEX already carries cyan).
//  • The pure count→colour rule lives in a new exported `playerBulletColor(count)`
//    in the PURE glyphs module, so the thresholds are unit-testable without a
//    canvas. render.ts `drawBullets` is the canvas consumer — like Story 6-17,
//    its wiring is asserted against the module source via Vite `?raw` (drawBullets
//    is module-private, so source text is the testable seam for "is it wired up?").

import { describe, it, expect } from 'vitest'
import { playerBulletColor } from '../../src/shell/glyphs'
import { MAX_BULLETS } from '../../src/core/rules'
import renderSrc from '../../src/shell/render.ts?raw'

describe('playerBulletColor — tint by charges in flight (Story 10-8 AC1)', () => {
  it('fewer than 6 charges in flight → yellow', () => {
    for (const n of [0, 1, 2, 3, 4, 5]) {
      expect(playerBulletColor(n), `${n} in flight should be yellow`).toBe('yellow')
    }
  })

  it('6–7 charges in flight → blue (the palette\'s cyan)', () => {
    expect(playerBulletColor(6)).toBe('cyan')
    expect(playerBulletColor(7)).toBe('cyan')
  })

  it('8 charges in flight (== MAX_BULLETS cap) → red', () => {
    // Couple the "8 = red" boundary to the canonical cap, not a magic number:
    // if the cap ever changes, this guard makes the dependency explicit.
    expect(MAX_BULLETS).toBe(8)
    expect(playerBulletColor(MAX_BULLETS)).toBe('red')
    expect(playerBulletColor(8)).toBe('red')
  })

  it('flips yellow → blue at the 5/6 boundary', () => {
    expect(playerBulletColor(5)).toBe('yellow')
    expect(playerBulletColor(6)).toBe('cyan')
  })

  it('flips blue → red at the 7/8 boundary', () => {
    expect(playerBulletColor(7)).toBe('cyan')
    expect(playerBulletColor(8)).toBe('red')
  })

  it('gives a distinct colour per bucket and is never white (no longer always white)', () => {
    const buckets = [playerBulletColor(1), playerBulletColor(6), playerBulletColor(8)]
    expect(buckets).toEqual(['yellow', 'cyan', 'red'])
    expect(new Set(buckets).size).toBe(3) // all three buckets distinct
    expect(buckets).not.toContain('white') // AC3: bullets are no longer always white
  })
})

describe('drawBullets wiring — consumes the live charge count (Story 10-8 AC2)', () => {
  it('derives the bullet tint from playerBulletColor(...)', () => {
    expect(renderSrc).toMatch(/playerBulletColor\s*\(/)
  })

  it('feeds the in-flight count (s.bullets.length) into the tint', () => {
    expect(renderSrc).toMatch(/bullets\.length/)
  })

  it('imports playerBulletColor from the glyphs module', () => {
    expect(renderSrc).toMatch(
      /import[\s\S]*?\bplayerBulletColor\b[\s\S]*?from\s*['"][^'"]*glyphs['"]/,
    )
  })

  it('still strokes the authentic two-ring playerBulletGlyph (silhouette unchanged)', () => {
    expect(renderSrc).toMatch(/\bplayerBulletGlyph\b/)
  })
})
