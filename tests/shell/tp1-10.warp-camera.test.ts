// tests/shell/tp1-10.warp-camera.test.ts
//
// RED — tp1-10 AC-1 (finding WD-012): the ROM dives the CAMERA with the Claw, so
// the Claw's size and screen position are CONSTANT and the well expands past it; we
// shrink the Claw down a static tube.
//
// ROM: MOVCUD advances the eye by the SAME velocity as the cursor every frame
// ("LDA EYLL ;UPDATE EYE POSITION / CLC / ADC CURSVL", ALWELG.MAC:1049-1057), and
// because CURSY and EY both advance by CURSVL, (CURSY - EY) is INVARIANT — the
// Claw's projected size and screen position do not change; the well rushes outward
// around it.
//
// render() draws to a live canvas (document.createElement('canvas')), which vitest's
// `node` env cannot provide, so — exactly as render.claw.test.ts / render.warp-
// dispatch.test.ts do — the testable seam is the render source read via ?raw. The
// pure fixed-size rim math is already covered by geometry.claw-transform.test.ts;
// here we pin that drawWarp DROPS the depth-shrunk dive Claw and adopts that fixed
// rim transform. (The visual "well expands" is a render property node cannot drive —
// it is delegated to Reviewer's eyeball; see the session Delivery Findings.)
import { describe, it, expect } from 'vitest'
import renderSrc from '../../src/shell/render.ts?raw'

// Extract a single function body: from `function name` to the next top-level
// function declaration (same helper the render.claw suite uses).
function fnBody(src: string, name: string): string {
  const start = src.search(new RegExp(`(export\\s+)?function\\s+${name}\\b`))
  if (start < 0) return ''
  const rest = src.slice(start + 1)
  const nextRel = rest.search(/\n(export\s+)?function\s/)
  return nextRel < 0 ? src.slice(start) : src.slice(start, start + 1 + nextRel)
}

const drawWarp = fnBody(renderSrc, 'drawWarp')

describe('tp1-10 AC-1 — the dive Claw is rim-anchored & constant, not shrunk (WD-012)', () => {
  it('drawWarp exists (guard for the following source checks)', () => {
    expect(drawWarp.length).toBeGreaterThan(0)
  })

  it('does NOT size the dive Claw by depth (the `6 + clawDepth * 14` shrink is gone)', () => {
    expect(drawWarp).not.toMatch(/6\s*\+\s*clawDepth\s*\*\s*14/)
    // No claw `size` derived from the dive depth/progress at all.
    expect(drawWarp).not.toMatch(/\bsize\b[^\n]*\bclawDepth\b/)
  })

  it('does NOT project the dive Claw at a receding depth (`1 - progress`)', () => {
    // The old model marched the Claw down a static tube at clawDepth = 1 - progress,
    // so it slid toward the vanishing point. A camera that moves WITH the Claw pins
    // it to the rim instead.
    expect(drawWarp).not.toMatch(/clawDepth\s*=\s*1\s*-\s*progress/)
  })

  it('draws the dive Claw through the fixed rim transform (clawTransform), like normal play', () => {
    // clawTransform(tube, lane) is progress-independent (geometry.claw-transform.test.ts),
    // so a Claw drawn through it cannot change size or screen position during the dive.
    expect(drawWarp).toMatch(/clawTransform\s*\(/)
  })
})
