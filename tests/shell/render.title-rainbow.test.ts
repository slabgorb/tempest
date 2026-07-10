// tests/shell/render.title-rainbow.test.ts
//
// Story 10-6 (RED) — wiring guard: drawAttract draws the approaching rainbow.
//
// The depth / scale / colour math lives in the pure ./titleLogo model (RED-tested
// in titleLogo.test.ts). render.ts draws to a live canvas (untestable in vitest's
// `node` env — phosphor needs `document`), so — exactly like the 10-4 warp
// dispatch and the 6-17 enemy scale — the testable seam for "is it wired up?" is
// the render source read via Vite's `?raw`.
//
// AC: the attract title renders as the multi-pass approaching rainbow, animated by
//     the render clock, while the rest of the attract screen (high-score table,
//     PRESS START prompts) is unchanged.
import { describe, it, expect } from 'vitest'
import renderSrc from '../../src/shell/render.ts?raw'

// Slice out the drawAttract() body so wiring is asserted INSIDE the attract screen,
// not somewhere else in render.ts. drawSelect() is the next function definition.
const iAttract = renderSrc.indexOf('function drawAttract')
const iNextFn = renderSrc.indexOf('function drawSelect', iAttract)
const attractSrc = iAttract > -1 && iNextFn > -1 ? renderSrc.slice(iAttract, iNextFn) : ''

describe('render title rainbow — wires the pure titleLogo model (Story 10-6)', () => {
  it('locates the drawAttract() body to scan', () => {
    expect(iAttract, 'render.ts must define drawAttract()').toBeGreaterThan(-1)
    expect(iNextFn, 'drawAttract() must be followed by drawSelect()').toBeGreaterThan(iAttract)
  })

  it('imports the approaching-rainbow model from ./titleLogo', () => {
    expect(renderSrc).toMatch(/from\s*['"]\.\/titleLogo['"]/)
    expect(renderSrc).toMatch(/\btitleLogoPasses\b/)
  })

  it('builds the rainbow inside drawAttract, animated by the render clock', () => {
    // Driven by renderTime so the stack actually advances toward the viewer each
    // frame (the same clock that drives the PRESS START blink).
    expect(attractSrc).toMatch(/titleLogoPasses\s*\(\s*renderTime/)
  })

  it('iterates the passes and consumes their depth/scale/colour', () => {
    // Not just called-and-ignored: drawAttract must loop over the passes…
    expect(attractSrc).toMatch(/(for\s*\([^)]*\bof\b[\s\S]*?titleLogoPasses)|titleLogoPasses\s*\([^)]*\)\s*\.\s*(forEach|map)/)
    // …and actually read each pass's fields to place/size/colour the word.
    expect(attractSrc).toMatch(/\.depth\b/)
    expect(attractSrc).toMatch(/\.scale\b/)
    expect(attractSrc).toMatch(/\.color\b/)
  })

  it('still draws the word TEMPEST in the attract title', () => {
    expect(attractSrc).toMatch(/['"]TEMPEST['"]/)
  })
})

describe('render title rainbow — attract flow/elements unchanged (Story 10-6 AC: pure shell)', () => {
  it('still renders the high-score table', () => {
    expect(attractSrc).toMatch(/drawHighScoreTable\s*\(/)
  })

  it('still shows the PRESS START prompt and the controls hint', () => {
    expect(attractSrc).toMatch(/PRESS START/)
    expect(attractSrc).toMatch(/CLICK OR ENTER TO START/)
  })
})
