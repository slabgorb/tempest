// tests/shell/tp1-39.warp-streaks-diving.test.ts
//
// tp1-39: drawWarp's speed streaks must ride the DIVING (expanding) tube — the
// same moving-eye view render() already computes for drawTube/drawSpikes at
// render.ts ~1063-1073 (warpDescentTube during descent, warpDiveTube during the
// eye fly-in) — not the STATIC base well. The Claw, per the tp1-38 invariant,
// stays anchored on the static tube.
//
// render.ts draws to a live canvas, which vitest's node env cannot provide, so —
// exactly as tp1-10.warp-camera.test.ts / tp1-38.warp-rim-flyoff-render.test.ts
// do — the testable seam is the source text read via Vite's `?raw`. The pure
// diving-tube math (warpDescentTube/warpDiveTube) is already unit-tested in
// tests/core/geometry*.test.ts; here we pin the WIRING: drawWarp's streak loop
// consumes the tube it is HANDED (divingTube), not `s.tube`/staticTube, and the
// render() call site hands it the same `diveTube` variable used to draw the tube
// itself — so the streaks and the drawn well can never diverge frame-to-frame.
import { describe, it, expect } from 'vitest'
import renderSrc from '../../src/shell/render.ts?raw'

// Extract a single function body: from `function name` to the next top-level
// function declaration (same helper tp1-38/tp1-10/render.claw tests use).
function fnBody(src: string, name: string): string {
  const start = src.search(new RegExp(`(export\\s+)?function\\s+${name}\\b`))
  if (start < 0) return ''
  const rest = src.slice(start + 1)
  const nextRel = rest.search(/\n(export\s+)?function\s/)
  return nextRel < 0 ? src.slice(start) : src.slice(start, start + 1 + nextRel)
}

const drawWarp = fnBody(renderSrc, 'drawWarp')

describe('tp1-39 — drawWarp streaks ride the diving tube, not the static well', () => {
  it('drawWarp exists (guard for the following source checks)', () => {
    expect(drawWarp.length).toBeGreaterThan(0)
  })

  it('drawWarp takes a diving-tube parameter distinct from the static `s.tube`', () => {
    expect(drawWarp).toMatch(/function\s+drawWarp\s*\(/)
    expect(drawWarp).toMatch(/divingTube\s*:\s*Tube/)
  })

  it('the streak loop reads from divingTube, not staticTube', () => {
    expect(drawWarp).toMatch(/divingTube\.far/)
    expect(drawWarp).toMatch(/divingTube\.near/)
    expect(drawWarp).not.toMatch(/staticTube\.far/)
    expect(drawWarp).not.toMatch(/staticTube\.near/)
  })

  it('the Claw stays anchored on staticTube (tp1-38 invariant, not regressed)', () => {
    expect(drawWarp).toMatch(/clawTransform\s*\(\s*staticTube\b/)
    expect(drawWarp).not.toMatch(/clawTransform\s*\(\s*divingTube\b/)
  })

  it('render() hands drawWarp the SAME diveTube it draws the tube/spikes with', () => {
    // diveTube is the moving-eye view selected at ~1063-1073 (warpDescentTube
    // during descent, warpDiveTube during the fly-in) and passed to drawTube;
    // the drawWarp call must be handed that identical variable.
    expect(renderSrc).toMatch(/drawTube\s*\(\s*pctx\s*,\s*scene\b/)
    expect(renderSrc).toMatch(/drawWarp\s*\(\s*pctx\s*,\s*s\s*,\s*color\s*,\s*diveTube\s*\)/)
  })
})
