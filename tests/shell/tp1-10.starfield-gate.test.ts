// tests/shell/tp1-10.starfield-gate.test.ts
//
// RED — tp1-10 AC-3 (finding WD-013): the starfield does not appear until the dive
// is ~29% down the tube.
//
// ROM: MOVCUD kicks the starfield off only once the Claw has descended past 0x50 —
// "LDA CURSY / CMP I,50 / IFCS / LDA PLAGRO / IFEQ / JSR INSTAR" (ALWELG.MAC:1041-
// 1048). CURSY starts at 0x10 (ILINLIY) and the bottom is 0xF0, so INSTAR fires
// only after (0x50 - 0x10) / (0xF0 - 0x10) = 64/224 = 28.6% of the dive — and NOT
// during the AVOID-SPIKES hold, when the Claw has not moved at all.
//
// Today render draws the starfield unconditionally for every warp frame from
// progress 0 (render.ts:1004-1008), including the warning hold. This suite pins the
// gate as the ROM constant WARP_STARFIELD_GATE and requires render to honour it.
import { describe, it, expect } from 'vitest'
import renderSrc from '../../src/shell/render.ts?raw'
import { WARP_STARFIELD_GATE, WARP_ALONG_SPAN } from '../../src/core/rules'

describe('tp1-10 AC-3 — the starfield gate constant (WD-013)', () => {
  it('WARP_STARFIELD_GATE is (0x50 - 0x10) / WARP_ALONG_SPAN = 64/224 ≈ 0.286', () => {
    expect(WARP_ALONG_SPAN).toBe(0xf0 - 0x10) // 224 — the CURSY dive span
    expect(WARP_STARFIELD_GATE).toBeCloseTo((0x50 - 0x10) / (0xf0 - 0x10), 10)
    expect(WARP_STARFIELD_GATE).toBeCloseTo(0.2857, 4)
    // Squarely inside (0, 1): the stars neither open at the rim nor wait for the bottom.
    expect(WARP_STARFIELD_GATE).toBeGreaterThan(0)
    expect(WARP_STARFIELD_GATE).toBeLessThan(1)
  })
})

describe('tp1-10 AC-3 — render gates the starfield on the dive progress', () => {
  const iStar = renderSrc.search(/drawStarfield\s*\(\s*pctx/)

  it('the starfield draw is wired (guard for the following gate check)', () => {
    expect(iStar).toBeGreaterThan(-1)
  })

  it('gates the warp starfield on the dive progress, not merely on mode === warp', () => {
    // The call site must sit behind the ROM progress gate. Assert the actual guard
    // EXPRESSION, with COMMENTS STRIPPED from the window first — otherwise a nearby
    // render comment that merely mentions "progress"/"WARP_STARFIELD_GATE" satisfies a
    // naive text search even when the real `if` is gone (tp1-10 review: exactly that
    // happened to the old `/progress/` check). Mutation-proof: reverting the gate to an
    // unconditional `drawStarfield(...)` removes `s.warp.progress >= WARP_STARFIELD_GATE`
    // from the code window → RED.
    const rawWindow = renderSrc.slice(Math.max(0, iStar - 240), iStar)
    const codeWindow = rawWindow.replace(/\/\/[^\n]*/g, '') // strip line comments
    expect(codeWindow, 'drawStarfield(pctx, ...) must be guarded by the warp progress gate')
      .toMatch(/s\.warp\.progress\s*>=\s*WARP_STARFIELD_GATE/)
  })

  it('references the ROM gate constant WARP_STARFIELD_GATE in code (not just an import/comment)', () => {
    // Stronger than a bare source match (which an import line alone satisfies): the
    // constant must appear in a `>=` comparison against the dive progress somewhere.
    const code = renderSrc.replace(/\/\/[^\n]*/g, '')
    expect(code).toMatch(/progress\s*>=\s*WARP_STARFIELD_GATE/)
  })
})
