// tests/core/name-entry-resolution.test.ts
//
// SH2-13 RED — the dependency-pin contract: tempest must consume @arcade/shared
// at a ref whose exports map carries the /name-entry subpath (the shared
// keyboard initials-entry reducer). The current pin (v0.6.0) predates the
// module entirely, so this fails until Dev re-pins to the tag that ships it —
// which also finally converges tempest with the rest of the cabinet (the
// epic's outstanding v0.6.0 -> latest cleanup, SH2-6 Delivery Finding).
//
// Isolated in its own file, and imported through a VARIABLE specifier with
// @vite-ignore, so the unresolvable subpath surfaces as this one test's
// failure — not a module-graph crash that would silence sibling tests (the
// SH2-5/SH2-6 precedent).
import { describe, it, expect } from 'vitest'

const SHARED_NAME_ENTRY_SUBPATH = '@arcade/shared/name-entry'

interface SharedNameEntryModule {
  stepNameEntry: (buffer: string, key: string, maxLength: number) => string
}

describe('SH2-13 — @arcade/shared/name-entry resolves with the shared reducer', () => {
  it('resolves the subpath and the reducer behaves (type, delete, guard)', async () => {
    const mod = (await import(
      /* @vite-ignore */ SHARED_NAME_ENTRY_SUBPATH
    )) as unknown as SharedNameEntryModule
    expect(typeof mod.stepNameEntry).toBe('function')
    expect(mod.stepNameEntry('', 'a', 3)).toBe('A')
    expect(mod.stepNameEntry('AC', 'Backspace', 3)).toBe('A')
    expect(mod.stepNameEntry('', 'Backspace', 3)).toBe('')
  })
})
