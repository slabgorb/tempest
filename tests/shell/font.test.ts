// tests/shell/font.test.ts
//
// SH2-2 (epic SH2) — tempest re-points its stroke-vector font at the shared
// package. The glyph table + layout that used to live in src/shell/vecfont.ts is
// promoted VERBATIM into @arcade/shared/font (its geometry contract now lives in
// arcade-shared/tests/font.test.ts). Here we drive the tempest-side changes:
//
//   AC-3  font.ts re-exports @arcade/shared/font (not ./vecfont); vecfont.ts is
//         deleted; render.ts imports the font from the shared module, not ./vecfont;
//         layoutText/CELL_* still behave identically (no visual change).
//   AC-4  the vestigial VectorBattle-e9XO.ttf and the contactSheet.ts 'Vector Battle'
//         font-family reference are gone.
//
// This suite REPLACES tests/shell/vecfont.test.ts, which imported src/shell/vecfont.ts
// (as a module AND via ?raw) and asserted render.ts imported from './vecfont' — all of
// which invert under this story. We intentionally DO NOT import vecfont.ts in any form
// (it is being deleted); its absence is asserted via the filesystem instead.
import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
// Read shell source as text via Vite's ?raw — the boundary/purity-scan idiom used
// across the tempest suites. These files SURVIVE the story (font.ts/render.ts/
// contactSheet.ts), so scanning them is safe; vecfont.ts is checked by absence only.
import fontSrc from '../../src/shell/font.ts?raw'
import renderSrc from '../../src/shell/render.ts?raw'
import contactSheetSrc from '../../src/tools/contactSheet.ts?raw'
// Behaviour anchor: import through the LOCAL barrel (src/shell/font.ts). Before the
// migration this resolves to ./vecfont; after it, to @arcade/shared/font. Either way
// the observable geometry must be identical — this keeps the "no visual change" honest
// and proves the shared module is actually wired (a missing/broken dep fails the import).
import { layoutText, CELL_W, CELL_H } from '../../src/shell/font'

const fromRepo = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))

// ===========================================================================
// AC-3 — tempest consumes @arcade/shared/font; the local vecfont.ts is gone
// ===========================================================================
describe('SH2-2 AC-3 — font re-points to @arcade/shared/font', () => {
  it('font.ts re-exports the SHARED module, not the local ./vecfont', () => {
    expect(fontSrc, 'font.ts should re-export @arcade/shared/font').toMatch(/@arcade\/shared\/font/)
    expect(fontSrc, 'font.ts should no longer re-export ./vecfont').not.toMatch(
      /from\s+['"]\.\/vecfont['"]/,
    )
  })

  it('src/shell/vecfont.ts is deleted (its contents moved to @arcade/shared/font)', () => {
    expect(existsSync(fromRepo('../../src/shell/vecfont.ts'))).toBe(false)
  })

  it('render.ts imports the font from the shared module / barrel, not ./vecfont', () => {
    expect(renderSrc, 'render.ts must not import the deleted ./vecfont').not.toMatch(
      /from\s+['"]\.\/vecfont['"]/,
    )
    expect(renderSrc, 'render.ts should import from ./font or @arcade/shared/font').toMatch(
      /from\s+['"](\.\/font|@arcade\/shared\/font)['"]/,
    )
  })

  it('behaviour-preserving: the shared font strokes identical geometry (no visual change)', () => {
    // Fixed cell unchanged.
    expect(CELL_W).toBe(16)
    expect(CELL_H).toBe(24)

    // Empty string → nothing.
    const empty = layoutText('')
    expect(empty.strokes).toHaveLength(0)
    expect(empty.width).toBe(0)

    // 'A' — the verbatim ROM apex + crossbar (two strokes), unchanged by the move.
    const a = layoutText('A')
    const aShape = a.strokes.map((s) => s.points.map((p) => [p.x, p.y]))
    expect(aShape).toEqual([
      [[0, 0], [0, 16], [8, 24], [16, 16], [16, 0]],
      [[0, 8], [16, 8]],
    ])

    // 'TEMPEST' advances positively and monotonically (a real string lays out).
    const t = layoutText('TEMPEST')
    expect(t.width).toBeGreaterThan(0)
    expect(t.strokes.length).toBeGreaterThan(0)
  })
})

// ===========================================================================
// AC-4 — the non-commercial Vector Battle TTF and its reference are removed
// ===========================================================================
describe('SH2-2 AC-4 — Vector Battle TTF + reference removed', () => {
  it('the vestigial public/fonts/VectorBattle-e9XO.ttf no longer exists', () => {
    expect(existsSync(fromRepo('../../public/fonts/VectorBattle-e9XO.ttf'))).toBe(false)
  })

  it("contactSheet.ts drops the 'Vector Battle' font-family (and any FontFace/.ttf)", () => {
    expect(contactSheetSrc).not.toMatch(/Vector Battle/)
    expect(contactSheetSrc).not.toMatch(/VectorBattle/)
    expect(contactSheetSrc).not.toMatch(/FontFace/)
    expect(contactSheetSrc).not.toMatch(/\.ttf/)
  })

  it('font.ts carries no TTF/FontFace residue', () => {
    expect(fontSrc).not.toMatch(/FontFace/)
    expect(fontSrc).not.toMatch(/\.ttf/)
    expect(fontSrc).not.toMatch(/VectorBattle/)
    expect(fontSrc).not.toMatch(/Vector Battle/)
  })

  it('render.ts carries no Vector Battle TTF family string', () => {
    expect(renderSrc).not.toMatch(/Vector Battle/)
  })
})
