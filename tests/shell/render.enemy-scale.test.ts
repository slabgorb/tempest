// tests/shell/render.enemy-scale.test.ts
//
// Story 6-17: Enemies scale to lane width (depth projection), not a fixed pixel
// ramp.
//
// render.ts draws to a live canvas, so (like the Story 6-8 glyph boundary scans)
// the testable seam for "is the new sizing wired up?" is the source text read via
// Vite's `?raw`. The PURE width math is unit-tested in
// tests/core/geometry.lane-width.test.ts; here we assert drawEnemy() actually
// consumes it — replacing the absolute pixel ramp that caused the bug — and that
// the authentic 6-8 glyph silhouettes are still stroked (unchanged).
import { describe, it, expect } from 'vitest'
import renderSrc from '../../src/shell/render.ts?raw'

describe('drawEnemy sizing — replaces the absolute pixel ramp (Story 6-17 AC2)', () => {
  it('no longer sizes enemies with the fixed `5 + e.depth * 10` ramp', () => {
    // This exact ramp IS the bug: a screen-pixel size that ignores the lane and
    // never grows to fill it. It must be gone.
    expect(renderSrc).not.toMatch(/5\s*\+\s*e\.depth\s*\*\s*10/)
  })

  it('imports laneWidth from the core geometry module', () => {
    const importsLaneWidth = /import[\s\S]*?\blaneWidth\b[\s\S]*?from\s*['"][^'"]*geometry['"]/
    expect(renderSrc).toMatch(importsLaneWidth)
  })

  it('sizes enemies from laneWidth(...) — the lane-relative width at the enemy depth', () => {
    expect(renderSrc).toMatch(/laneWidth\s*\(/)
  })
})

describe('drawEnemy sizing — preserves authentic glyphs & motion (Story 6-17 AC4)', () => {
  it('still strokes every authentic 6-8 enemy glyph (silhouettes unchanged)', () => {
    for (const glyph of [
      'flipperGlyph',
      'tankerGlyph',
      'spikerGlyph',
      'fuseballGlyph',
      'pulsarBar',
    ]) {
      expect(renderSrc, `render.ts must still stroke ${glyph}`).toMatch(
        new RegExp(`\\b${glyph}\\b`),
      )
    }
  })

  it('still projects the enemy by (lane, depth) — motion/position seam untouched', () => {
    // The flip-slide and depth position come from project(); only the SCALE
    // argument changes in this story. Guard the position seam stays.
    expect(renderSrc).toMatch(/project\s*\(\s*tube\s*,\s*e\.lane\s*,\s*e\.depth\s*\)/)
  })
})

describe('render.ts — no type-safety escapes introduced (TS lang-review #1)', () => {
  it('uses no `as any` or @ts-ignore', () => {
    expect(renderSrc).not.toMatch(/\bas any\b/)
    expect(renderSrc).not.toMatch(/@ts-ignore/)
  })
})
