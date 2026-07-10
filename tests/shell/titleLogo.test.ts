// tests/shell/titleLogo.test.ts
//
// Story 10-6 (RED) — the attract title's "approaching rainbow" logo model.
//
// The 1981 attract mode draws TEMPEST as an approaching rainbow (the book's
// "approaching logo process" — SCARNG / LOGPRO): ~19 passes of the word stacked
// from the far horizon to the viewer, each pass a different colour cycling
// white / yellow / magenta / red / cyan / green, the whole stack marching toward
// the viewer every frame and recycling. Today drawAttract() draws a single
// static glow title (render.ts).
//
// render.ts draws to a live canvas (untestable in vitest's `node` env — phosphor
// needs `document`), so — exactly like the 10-4 starfield and the 6-8 glyphs —
// the testable seam is a PURE, importable model that owns the depth / scale /
// colour math. render.ts then just strokes each pass. This file RED-tests that
// model; render.title-rainbow.test.ts guards the wiring.
//
// EXPECTED MODULE (Dev's green phase delivers it — src/shell/titleLogo.ts):
//   export interface LogoPass {
//     readonly depth: number   // 0 = far horizon … →1 = arrived at the viewer
//     readonly scale: number   // size multiplier; strictly increases with depth
//     readonly color: string   // LOGO_PALETTE[passIndex % LOGO_PALETTE.length]
//   }
//   export const LOGO_PASSES: number               // 19 depth passes far→near
//   export const LOGO_PALETTE: readonly string[]   // 6: white,yellow,magenta,red,cyan,green
//   export function titleLogoPasses(phase: number): readonly LogoPass[]
//
// Contract for titleLogoPasses(phase):
//   - returns exactly LOGO_PASSES passes, ordered far→near (ascending depth)
//   - the LOGO_PASSES depths are evenly spaced (consecutive gaps all === 1/LOGO_PASSES)
//     and live in [0, 1)
//   - colour of the k-th pass (far→near) is LOGO_PALETTE[k % LOGO_PALETTE.length] —
//     the repeating rainbow stripe
//   - scale strictly increases with depth (far pass small, near pass large)
//   - `phase` is a continuously-increasing animation clock; increasing it within a
//     cycle moves EVERY pass toward the viewer (greater depth). The pattern recycles
//     every 1.0 of phase: titleLogoPasses(p) === titleLogoPasses(p + 1)
//
// None of this exists yet, so the named imports below fail to resolve and the whole
// file REDs — a clean failing state for Dev to drive green.
import { describe, it, expect } from 'vitest'
import { titleLogoPasses, LOGO_PASSES, LOGO_PALETTE } from '../../src/shell/titleLogo'
// Read the new module as text to guard the type-safety boundary (TS lang-review #1).
import titleLogoSrc from '../../src/shell/titleLogo.ts?raw'

// Normalise a CSS hex colour so the contract can be pinned to the documented hues
// without dictating #rgb vs #rrggbb form. Lowercases and expands 3-digit to 6.
function norm(c: string): string {
  const s = c.trim().toLowerCase()
  const m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(s)
  return m ? `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}` : s
}

describe('titleLogo — documented passes & palette (AC: 6-colour cycle by depth)', () => {
  it('stacks ~19 passes (the book\'s approaching-logo depth count)', () => {
    expect(LOGO_PASSES).toBe(19)
  })

  it('exposes the documented 6-colour rainbow in SCARNG order', () => {
    // white → yellow → magenta → red → cyan → green (full-saturation vector hues).
    expect(LOGO_PALETTE).toHaveLength(6)
    expect(LOGO_PALETTE.map(norm)).toEqual([
      '#ffffff', // white
      '#ffff00', // yellow
      '#ff00ff', // magenta
      '#ff0000', // red
      '#00ffff', // cyan
      '#00ff00', // green
    ])
  })

  it('uses 6 distinct colours (a real rainbow, not a repeated single hue)', () => {
    expect(new Set(LOGO_PALETTE.map(norm)).size).toBe(6)
  })
})

describe('titleLogo — depth stack (AC: multiple increasing depths)', () => {
  it('returns exactly LOGO_PASSES passes', () => {
    expect(titleLogoPasses(0)).toHaveLength(LOGO_PASSES)
  })

  it('orders passes far→near with distinct depths inside [0, 1)', () => {
    const passes = titleLogoPasses(0)
    for (const p of passes) {
      expect(p.depth).toBeGreaterThanOrEqual(0)
      expect(p.depth).toBeLessThan(1)
    }
    const depths = passes.map((p) => p.depth)
    // Strictly ascending — every pass is nearer the viewer than the one behind it.
    for (let i = 1; i < depths.length; i++) {
      expect(depths[i]).toBeGreaterThan(depths[i - 1])
    }
  })

  it('spaces the passes evenly across the depth range (gap === 1/LOGO_PASSES)', () => {
    const depths = titleLogoPasses(0).map((p) => p.depth)
    const expectedGap = 1 / LOGO_PASSES
    for (let i = 1; i < depths.length; i++) {
      expect(depths[i] - depths[i - 1]).toBeCloseTo(expectedGap, 6)
    }
  })
})

describe('titleLogo — per-pass scale (AC: per-pass scale, far small / near large)', () => {
  it('scales every pass positively and strictly larger toward the viewer', () => {
    const passes = titleLogoPasses(0) // already far→near
    for (const p of passes) expect(p.scale).toBeGreaterThan(0)
    for (let i = 1; i < passes.length; i++) {
      expect(passes[i].scale).toBeGreaterThan(passes[i - 1].scale)
    }
  })

  it('gives the near pass a markedly larger scale than the far pass (real depth ramp)', () => {
    const passes = titleLogoPasses(0)
    const far = passes[0].scale
    const near = passes[passes.length - 1].scale
    // A flat ramp would defeat the approaching-rainbow illusion; require the near
    // pass to be at least 1.5× the far pass.
    expect(near).toBeGreaterThan(far * 1.5)
  })
})

describe('titleLogo — rainbow colour cycle (AC: colour cycles through the 6-colour palette)', () => {
  it('colours the k-th far→near pass with LOGO_PALETTE[k % 6]', () => {
    const passes = titleLogoPasses(0)
    passes.forEach((p, k) => {
      expect(norm(p.color)).toBe(norm(LOGO_PALETTE[k % LOGO_PALETTE.length]))
    })
  })

  it('shows every one of the 6 palette colours across the 19 passes', () => {
    const used = new Set(titleLogoPasses(0).map((p) => norm(p.color)))
    expect(used.size).toBe(6)
  })
})

describe('titleLogo — advances toward the viewer over time (AC: rainbow advances)', () => {
  it('moves every pass nearer as phase increases within a cycle', () => {
    // phase 0 → 0.3 keeps frac in [0,1) so no pass wraps past the viewer; every
    // pass must end strictly deeper (closer) than it started.
    const before = titleLogoPasses(0)
    const after = titleLogoPasses(0.3)
    expect(after).toHaveLength(before.length)
    before.forEach((b, k) => {
      expect(after[k].depth).toBeGreaterThan(b.depth)
    })
  })

  it('recycles the rainbow every 1.0 of phase (seamless loop)', () => {
    const a = titleLogoPasses(0.42)
    const b = titleLogoPasses(1.42)
    a.forEach((pa, k) => {
      expect(b[k].depth).toBeCloseTo(pa.depth, 6)
      expect(norm(b[k].color)).toBe(norm(pa.color))
    })
  })
})

describe('titleLogo — robust phase handling (TS lang-review #4: 0 is a valid phase, not a falsy default)', () => {
  it('treats phase 0 as the real cycle start (full valid frame, not a degenerate one)', () => {
    const passes = titleLogoPasses(0)
    expect(passes).toHaveLength(LOGO_PASSES)
    // Guards `phase || fallback` mishandling 0: depth 0 is the far horizon, present.
    expect(passes[0].depth).toBeCloseTo(0, 6)
  })

  it('wraps arbitrary large and negative phases into a valid in-range frame', () => {
    for (const phase of [123.456, -0.25, -7]) {
      const passes = titleLogoPasses(phase)
      expect(passes).toHaveLength(LOGO_PASSES)
      for (const p of passes) {
        expect(p.depth).toBeGreaterThanOrEqual(0)
        expect(p.depth).toBeLessThan(1)
      }
    }
  })
})

describe('titleLogo — no type-safety escapes (TS lang-review #1)', () => {
  it('uses no `as any`, double-cast, or @ts-ignore', () => {
    expect(titleLogoSrc).not.toMatch(/\bas any\b/)
    expect(titleLogoSrc).not.toMatch(/as\s+unknown\s+as/)
    expect(titleLogoSrc).not.toMatch(/@ts-ignore/)
  })
})
