// tests/shell/phosphor.test.ts
import { describe, it, expect } from 'vitest'
import { phosphorAlpha } from '../../src/shell/phosphor'

describe('phosphorAlpha', () => {
  it('returns 1 - decay at the 60 Hz baseline (dt = 1/60)', () => {
    expect(phosphorAlpha(0.55, 1 / 60)).toBeCloseTo(0.45, 10)
  })

  it('is frame-rate independent: two 120 Hz frames retain like one 60 Hz frame', () => {
    const d = 0.55
    const fade120 = phosphorAlpha(d, 1 / 120)
    const retainedTwoFrames = (1 - fade120) ** 2
    expect(retainedTwoFrames).toBeCloseTo(d, 10)
  })

  it('clears instantly when decay is 0 (full fade each frame)', () => {
    expect(phosphorAlpha(0, 1 / 60)).toBe(1)
  })

  it('does not fade when no time has elapsed (dt = 0)', () => {
    expect(phosphorAlpha(0.55, 0)).toBe(0)
  })

  it('clamps decay into [0, 1]', () => {
    expect(phosphorAlpha(1.5, 1 / 60)).toBe(0) // retention clamped to 1 -> no fade
    expect(phosphorAlpha(-1, 1 / 60)).toBe(1)  // retention clamped to 0 -> full fade
  })
})
