// src/shell/font.ts
//
// Story 10-13: the HUD / framing text is now an authentic stroke-vector font, not
// a TTF webfont. The old "Vector Battle" face and its async webfont loader are
// gone — text is drawn as real glowing vectors (render.ts) from a per-letter glyph
// table lifted verbatim from the 1981 ROM (the VGMSGA alphabet). There is no async
// font to load and no external asset to depend on.
//
// The glyph table + string layout live in vecfont.ts. This module re-exports them
// as the shell's "font" entry point so callers can import a font from one place.
//
// Source of the glyph data:
//   docs/ux/2026-06-30-vector-font-rom-extract.md
export * from './vecfont'
