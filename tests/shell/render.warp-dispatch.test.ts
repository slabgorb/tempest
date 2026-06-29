// tests/shell/render.warp-dispatch.test.ts
//
// Story 10-4 (AC3 + AC1 render wiring) — the render-dispatch guard.
//
// render() draws into the phosphor scratch canvas, which calls
// `document.createElement('canvas')` — unavailable in vitest's `node` env. So,
// exactly as the 6-17 enemy-scale suite documents, the testable seam for "is the
// dispatch wired up?" is the render source read via Vite's `?raw`. Call sites are
// anchored on the `pctx` argument so they match the actual calls inside render(),
// never the top-level `function drawX(ctx, ...)` definitions.
//
// AC3: render() takes the drawWarp branch when mode is warp, with spikes still
//      drawn. (This guards EXISTING behaviour against regression as the starfield
//      is layered in — drawSpikes must keep running for both warp and play.)
// AC1: the 8-plane starfield (src/shell/starfield.ts) is drawn DURING the warp
//      dive — imported by render.ts and stroked inside the warp branch only.
import { describe, it, expect } from 'vitest'
import renderSrc from '../../src/shell/render.ts?raw'

// First-match indices of each call site / branch token in render.ts source.
const iSpikes = renderSrc.search(/drawSpikes\s*\(\s*pctx/)
const iWarpCond = renderSrc.search(/s\.mode\s*===\s*'warp'/) // dispatch branch (line ~823)
const iWarp = renderSrc.search(/drawWarp\s*\(\s*pctx/)
const iEnemy = renderSrc.search(/drawEnemy\s*\(\s*pctx/) // call site in the else branch
const iStarfield = renderSrc.search(/drawStarfield\s*\(\s*pctx/)

describe('render warp dispatch — drawWarp branch + spikes (Story 10-4 AC3)', () => {
  it('dispatches drawWarp inside the `s.mode === \'warp\'` branch', () => {
    expect(iWarpCond, 'render() must branch on s.mode === warp').toBeGreaterThan(-1)
    expect(iWarp, 'render() must call drawWarp(pctx, ...)').toBeGreaterThan(-1)
    expect(iWarp).toBeGreaterThan(iWarpCond) // the call lives inside/after the warp branch
  })

  it('still draws spikes during warp — drawSpikes runs before the warp/else split', () => {
    // drawSpikes is called unconditionally ahead of the mode branch, so the 3-3
    // spike crash reads on screen during the dive, not just in normal play.
    expect(iSpikes, 'render() must call drawSpikes(pctx, ...)').toBeGreaterThan(-1)
    expect(iSpikes).toBeLessThan(iWarpCond)
  })

  it('does NOT draw the enemy roster during warp — enemies stay in the else branch', () => {
    // The warp dive replaces the enemy scene; drawEnemy belongs after the branch.
    expect(iEnemy, 'render() must still call drawEnemy(pctx, ...) for normal play').toBeGreaterThan(-1)
    expect(iEnemy).toBeGreaterThan(iWarp)
  })
})

describe('render starfield wiring — shown DURING warp (Story 10-4 AC1)', () => {
  it('imports the pure starfield model from ./starfield', () => {
    expect(renderSrc).toMatch(/from\s*['"]\.\/starfield['"]/)
  })

  it('strokes the starfield inside the warp branch (after the branch, before enemies)', () => {
    expect(iStarfield, 'render() must call drawStarfield(pctx, ...)').toBeGreaterThan(-1)
    expect(iStarfield).toBeGreaterThan(iWarpCond) // inside the warp branch
    expect(iStarfield).toBeLessThan(iEnemy) // not in the normal-play else branch
  })

  it('draws the starfield exactly once — warp only, not every frame', () => {
    const calls = renderSrc.match(/drawStarfield\s*\(/g) ?? []
    expect(calls).toHaveLength(1)
  })
})
