// tests/shell/render.claw.test.ts
//
// Story 12-1: Rim-anchored ROM CURSOR claw — render wiring (AC-3, AC-5, AC-6).
//
// render.ts draws to a live canvas, so (like the Story 6-8 glyph boundary scans
// and Story 6-17 sizing scans) the testable seam for "is the new claw wired up?"
// is the source text read via Vite's `?raw`. The PURE math is unit-tested in
// tests/core/geometry.claw-transform.test.ts and the byte-exact shapes in
// tests/shell/glyphs.test.ts; here we assert drawPlayer actually CONSUMES them —
// dropping the depth-projected articulated walker — while drawWarp stays put.
import { describe, it, expect } from 'vitest'
import renderSrc from '../../src/shell/render.ts?raw'

// Extract a single function body from the source: from `function name` (or
// `export function name`) up to the next top-level function declaration.
function fnBody(src: string, name: string): string {
  const start = src.search(new RegExp(`(export\\s+)?function\\s+${name}\\b`))
  if (start < 0) return ''
  const rest = src.slice(start + 1)
  const nextRel = rest.search(/\n(export\s+)?function\s/)
  return nextRel < 0 ? src.slice(start) : src.slice(start, start + 1 + nextRel)
}

const drawPlayer = fnBody(renderSrc, 'drawPlayer')

describe('drawPlayer — renders the authentic rim-anchored claw (AC-3)', () => {
  it('exists as a function', () => {
    expect(drawPlayer.length).toBeGreaterThan(0)
  })

  it('imports the pure claw transform from core/geometry', () => {
    const importsTransform = /import[\s\S]*?\bclawTransform\b[\s\S]*?from\s*['"][^'"]*geometry['"]/
    expect(renderSrc).toMatch(importsTransform)
  })

  it('imports playerClawGlyph from the glyph library (was previously unused/dead)', () => {
    const importsClaw = /import[\s\S]*?\bplayerClawGlyph\b[\s\S]*?from\s*['"]\.\/glyphs['"]/
    expect(renderSrc).toMatch(importsClaw)
  })

  it('drawPlayer drives the claw through clawTransform → playerClawGlyph → strokeGlyph', () => {
    expect(drawPlayer).toMatch(/\bclawTransform\s*\(/)
    expect(drawPlayer).toMatch(/\bplayerClawGlyph\s*\(/)
    expect(drawPlayer).toMatch(/\bstrokeGlyph\s*\(/)
  })

  it('keeps the claw YELLOW (CLAW_COLOR)', () => {
    expect(drawPlayer).toMatch(/CLAW_COLOR/)
  })

  it('keeps the dying-frame alpha fade and the bright white muzzle-tip dot', () => {
    expect(drawPlayer).toMatch(/mode\s*===\s*['"]dying['"]/)
    expect(drawPlayer).toMatch(/#fff\b/)
  })
})

describe('drawPlayer — the depth-projected articulated walker is GONE (AC-3)', () => {
  it('no longer computes a walk gait (walkPhase / clawPrevLane / leg lifts)', () => {
    expect(drawPlayer).not.toMatch(/walkPhase/)
    expect(drawPlayer).not.toMatch(/clawPrevLane/)
    expect(drawPlayer).not.toMatch(/liftL|liftR/)
  })

  it('no longer builds knee/apex articulation from interior tube depths', () => {
    expect(drawPlayer).not.toMatch(/kneeA|kneeB/)
    expect(drawPlayer).not.toMatch(/apexIn/)
    // the two interior-depth anchors that stretched under the perspective divide
    expect(drawPlayer).not.toMatch(/0\.74/) // apex depth
    expect(drawPlayer).not.toMatch(/project\s*\(\s*tube\s*,\s*lane\s*,\s*0\.9/) // muzzle depth
  })

  it('removes the module-level walk accumulator/prev-lane state entirely', () => {
    expect(renderSrc).not.toMatch(/let\s+walkPhase/)
    expect(renderSrc).not.toMatch(/let\s+clawPrevLane/)
  })
})

describe('drawWarp — the warp-dive claw is intentionally depth-projected, UNCHANGED (AC-5)', () => {
  it('still exists', () => {
    expect(renderSrc).toMatch(/function\s+drawWarp\b/)
  })

  it('still dives down the lane with its far→near depth interpolation (the "do not touch" region)', () => {
    const drawWarp = fnBody(renderSrc, 'drawWarp')
    expect(drawWarp).toMatch(/lerpP\s*\(\s*f\s*,\s*n\s*,/)
    expect(drawWarp).toMatch(/warp\.progress/)
  })
})

describe('render.ts — no type-safety escapes introduced by the claw rewrite (TS lang-review #1, AC-6)', () => {
  it('uses no `as any` or @ts-ignore', () => {
    expect(renderSrc).not.toMatch(/\bas any\b/)
    expect(renderSrc).not.toMatch(/@ts-ignore/)
  })
})
