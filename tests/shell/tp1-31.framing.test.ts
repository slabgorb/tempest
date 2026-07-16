// tests/shell/tp1-31.framing.test.ts
//
// Story tp1-31 (DB-008) — the render half of THE FRAMING, pinned via ?raw
// source scans (render() cannot run in the node env — the phosphor scratch
// canvas needs `document`; the 10-4/6-17/tp1-9 seam). The behavioural pins
// live in tests/core/tp1-31.{screen-z,camera-slide}.test.ts; these scans only
// prove the wiring exists. Three concerns, all "where does the projected scene
// sit on screen":
//
// 1. The whole-well translate: WORSCR adds ZADJL to every projected point's SZ
//    (ALDISP.MAC:2274), so render must shift the WHOLE phosphor scene by the
//    sim's animated s.camera.screenZ — tube, spikes, enemies, claw, and the
//    warp starfield (DSTARF swaps the eye but keeps ZADJL).
// 2. The starfield anchor: DSTARF draws each plane at the world centre
//    (PXL = PZL = 0x80, ALDISP.MAC:2945-2948) = OUR SCENE ORIGIN. The current
//    (W/2, H/2) anchor predates the phosphor centre-origin scene transform and
//    displaces the whole field by half a screen (found by the superseded tp1-9
//    review; still live on develop after tempest#113).
// 3. The vanishing-point glow: since tp1-9/#113 the far ring converges on the
//    per-well VP, not the origin — drawTube's decorative glow must not stay
//    hard-anchored at arc(0, 0, …).
import { describe, it, expect } from 'vitest'
import renderSrc from '../../src/shell/render.ts?raw'

describe('AC — the whole-well screen-Z translate is applied from state', () => {
  it('render.ts reads camera.screenZ (the slide the sim animates)', () => {
    expect(renderSrc).toMatch(/camera\.screenZ/)
  })
})

describe('AC — the warp starfield is anchored at the scene origin (world centre)', () => {
  it('star dots are placed at ux·r from the origin, not offset by a canvas-centre cx/cy', () => {
    // The displaced form is `ctx.arc(cx + ux * r, cy + uy * r, …)`; the faithful
    // form places the picture about the origin the scene transform already
    // centres. Assert the offset form is gone and the origin form exists.
    //
    // tp1-19 (V-015): the dots are now the ROM's own MSTAR picture, read from
    // starPictureGlyph, so they read `p.x`/`p.y` instead of the old eyeballed
    // `ux`/`uy` unit vectors. The anchoring this test guards is unchanged — only
    // the names are — so the patterns below are matched name-agnostically.
    expect(renderSrc).not.toMatch(/arc\(\s*cx\s*\+/)
    expect(renderSrc).toMatch(/arc\(\s*\w+(?:\.\w+)?\s*\*\s*r\s*,\s*\w+(?:\.\w+)?\s*\*\s*r/)
  })
})

describe('AC — the vanishing-point glow no longer assumes the origin', () => {
  it('render.ts contains no hard-coded arc(0, 0, …)', () => {
    // The far ring converges on the per-well VP; anchor the glow on the far
    // ring itself (e.g. its centroid), never the origin literal.
    expect(renderSrc).not.toMatch(/arc\(\s*0\s*,\s*0\s*,/)
  })
})
