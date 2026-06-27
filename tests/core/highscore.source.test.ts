// tests/core/highscore.source.test.ts
//
// RED-phase suite for Story 5-8, Part B: the two NON-behavioral "tidy" ACs on
// the pure-core high-score module. These have zero runtime effect, so Major
// Hochstetter pins them as STATIC source contracts — read via Vite's `?raw`, the
// same browser-pure idiom as tests/core/events.test.ts (no Node `fs` types):
//
//   - the `MAX_HIGH_SCORES` import sits at the TOP of the module, ABOVE the first
//     type declaration (story: "move the MAX_HIGH_SCORES import to the top of
//     src/core/highscore.ts");
//   - `qualifiesForHighScore`'s own doc comment documents its descending-sorted
//     precondition (story: "add a doc-comment to qualifiesForHighScore noting it
//     assumes a descending-sorted table").
//
// Today the import lives BELOW the interface/type (line ~19) and the function's
// doc comment says nothing about sort order, so both assertions fail — clean RED.
import { describe, it, expect } from 'vitest'
import highscoreSrc from '../../src/core/highscore.ts?raw'

// The `import { ... MAX_HIGH_SCORES ... } from './rules'` statement, whitespace-
// and co-import-tolerant.
const MAX_IMPORT = /import\s*\{[^}]*\bMAX_HIGH_SCORES\b[^}]*\}\s*from\s*['"]\.\/rules['"]/

describe('highscore.ts — MAX_HIGH_SCORES import position (Story 5-8 AC2)', () => {
  it('imports MAX_HIGH_SCORES from ./rules', () => {
    expect(highscoreSrc).toMatch(MAX_IMPORT)
  })

  it('places that import ABOVE the first type declaration (top of module)', () => {
    const importIdx = highscoreSrc.search(MAX_IMPORT)
    const firstDeclIdx = highscoreSrc.indexOf('export interface HighScoreEntry')
    expect(importIdx).toBeGreaterThanOrEqual(0)
    expect(firstDeclIdx).toBeGreaterThanOrEqual(0)
    expect(importIdx).toBeLessThan(firstDeclIdx)
  })
})

// Collect the contiguous `//` comment block IMMEDIATELY above a declaration line
// (stops at the first blank or code line) — so the assertion targets the
// function's OWN doc comment, not the module's "descending" mentions elsewhere.
function docCommentAbove(src: string, marker: string): string[] {
  const lines = src.split('\n')
  const idx = lines.findIndex((l) => l.includes(marker))
  if (idx < 0) return []
  const out: string[] = []
  for (let i = idx - 1; i >= 0; i--) {
    const trimmed = lines[i].trim()
    if (trimmed.startsWith('//')) out.unshift(trimmed)
    else break
  }
  return out
}

describe('highscore.ts — qualifiesForHighScore documents its precondition (Story 5-8 AC2)', () => {
  const MARKER = 'export function qualifiesForHighScore'

  it('has a doc comment directly above the function', () => {
    expect(docCommentAbove(highscoreSrc, MARKER).length).toBeGreaterThan(0)
  })

  it('notes that it assumes a descending-sorted table', () => {
    const doc = docCommentAbove(highscoreSrc, MARKER).join(' ').toLowerCase()
    expect(doc).toMatch(/descend|sorted/)
  })
})
