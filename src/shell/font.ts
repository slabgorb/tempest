// src/shell/font.ts
//
// The HUD / framing text is an authentic stroke-vector font (the 1981 ROM VGMSGA
// alphabet), not a webfont — text is drawn as real glowing vectors (render.ts)
// from a per-letter glyph table. There is no async font to load and no external
// asset to depend on.
//
// SH2-2 (epic SH2) promoted the glyph table + string layout OUT of tempest and
// into the shared package. This module now re-exports @arcade/shared/font as the
// shell's single "font" entry point, so callers import the font from one place.
//
// Provenance of the glyph data:
//   tempest/docs/ux/2026-06-30-vector-font-rom-extract.md
export * from '@arcade/shared/font'
