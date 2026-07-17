// tests/shell/tp1-38.warp-rim-flyoff-render.test.ts
//
// RED — tp1-38 (WD-012 full fidelity): the render wiring for the rim-fly-off.
//
// render() draws to a live canvas, which vitest's node env cannot provide, so —
// exactly as tp1-10.warp-camera.test.ts / render.claw.test.ts do — the testable
// seam is the render source read via ?raw. The GEOMETRY of the fly-off is pinned
// in tests/core/tp1-38.warp-rim-flyoff.test.ts; here we pin three wiring facts:
//
//   1. The DESCENT branch draws the moving-eye well: the module calls the new
//      core seam `warpDescentTube(`.
//   2. The FLY-IN keeps the near-ring-fixed transform: `warpDiveTube(` must
//      still be called somewhere — the ROM's behind-eye cull is DISARMED while
//      the eye is negative ("LDA EYH / IFPL ;IF LINE WOULD BE BEHIND EYE",
//      ALDISP.MAC:1550-1552), so the fly-in mapping (progress 1→0 on the new
//      well) must NOT inherit the fly-off.
//   3. The shell consults the behind-eye flag (`rimBehindEye`) — ONELN2 aborts
//      lines behind the eye ("LDA PYL / CMP EYL / IFCC / RTS ;THEN ABORT LINE",
//      ALDISP.MAC:1553-1558); drawing a diverged/inverted rim is the visual bug
//      this story exists to prevent.
//   4. The dive Claw rides CURSY — (CURSY − EY) ≡ 16+H is invariant — so its
//      anchor comes from the STATIC tube, NOT the descent tube handed down for
//      the well. drawWarp today anchors via `clawTransform(tube, …)` where
//      `tube` is the warped state's tube; that exact spelling must go. (A
//      renamed-but-still-warped tube would fool this textual pin — the core
//      suite's AC6 proves the frames diverge, and the Reviewer diff-traces the
//      wiring; this is the same pin strength tp1-10.warp-camera.test.ts set.)
//
// The visual result (rim streaming past the screen edge, claw steady) is a
// render property node cannot drive — delegated to the Reviewer's eyeball run,
// per this repo's convention.
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

describe('tp1-38 — render wiring for the rim-fly-off (WD-012)', () => {
  it('drawWarp exists (guard for the following source checks)', () => {
    expect(drawWarp.length).toBeGreaterThan(0)
  })

  it('the module drives the DESCENT through the new moving-eye seam (warpDescentTube)', () => {
    expect(renderSrc).toMatch(/\bwarpDescentTube\s*\(/)
  })

  it('the FLY-IN keeps the near-ring-fixed seam (warpDiveTube still in service)', () => {
    expect(renderSrc).toMatch(/\bwarpDiveTube\s*\(/)
  })

  it('the shell consults the behind-eye flag (rimBehindEye) — the ONELN2 cull', () => {
    expect(renderSrc).toMatch(/\brimBehindEye\b/)
  })

  it('the dive Claw is NOT anchored to the warped tube handed to drawWarp', () => {
    // Today: `clawTransform(tube, s.player.lane)` with `tube = s.tube` — the
    // WARPED tube. Under the fly-off that rim moves; the Claw must anchor to the
    // static well (CURSY frame). The claw transform itself must survive.
    expect(drawWarp).toMatch(/clawTransform\s*\(/)
    expect(drawWarp).not.toMatch(/clawTransform\s*\(\s*tube\b/)
  })
})
