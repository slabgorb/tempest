// src/shell/framing.ts
//
// Story tp1-31 (DB-008, deferred from tp1-9) — THE FRAMING: the per-well
// screen-Z centre ZADJL translates the WHOLE tube, and on a new wave it slides
// in. This completes the framing pair with tp1-9's DB-007 (the far ring built
// about the projected vanishing point).
//
// Pure, DOM-free shell module: the constant data + the ease math. render.ts
// consumes it to translate the whole tube (see FRAMING wiring there). Kept out
// of src/core so the deterministic simulation boundary is untouched.
//
// Primary source: Theurer's 1981 assembler, ALDISP.MAC (.RADIX 16 per
// ALCOMN.MAC:17). Audit finding pair-4-aldisp-b-well-projection.json (DB-008).

// ── The ZADJL table ──────────────────────────────────────────────────────────
// The per-well screen-Z centre, a SIGNED 16-bit little-endian value assembled by
// wellID from two byte tables (ALDISP.MAC:1387-1388):
//     HOLZAD (low):  40 20 40 80 40 40 70 60 00 20 40 00 A0 40 40 00  ;CENTER ADJUST
//     HOLZDH (high): FF FF FF FF FF FF FF 00 01 FF 00 00 FE 01 FF 01
//   → WELL_Z_ADJUST[wellID] = int16LE(low, high), decoded to decimal below.
// XADJL is 0 unconditionally ("X SCREEN CENTER", ALDISP.MAC:2507), so the
// whole-tube translate is VERTICAL only. Values are in RAW ROM units; render.ts
// owns the ROM→canvas scale (a design choice, play-test tuned).
export const WELL_Z_ADJUST: readonly number[] = [
  -192, // well 0  = 0xFF40
  -224, // well 1  = 0xFF20
  -192, // well 2  = 0xFF40
  -128, // well 3  = 0xFF80
  -192, // well 4  = 0xFF40
  -192, // well 5  = 0xFF40
  -144, // well 6  = 0xFF70
  96, // well 7  = 0x0060
  256, // well 8  = 0x0100
  -224, // well 9  = 0xFF20
  64, // well 10 = 0x0040
  0, // well 11 = 0x0000  (dead centre — also tp1-9's on-axis well)
  -352, // well 12 = 0xFEA0  (deepest / most negative)
  320, // well 13 = 0x0140  (highest / most positive)
  -192, // well 14 = 0xFF40
  256, // well 15 = 0x0100
]

// ── The new-wave slide ───────────────────────────────────────────────────────
// One frame of the "MOVE UP SLOWLY (NEW WAVE)" ease toward the well's ZADJL: the
// classic >>3 exponential — each frame closes ~1/8 of the remaining gap
// (ALDISP.MAC:2494-2505 seeds the delta as gap>>3; ALWELG.MAC:56-82 advances it
// per frame). `>>` is JS's arithmetic (sign-preserving) shift, matching the ROM's
// signed step. A NEW LIFE snaps to the target instead of sliding — that branch
// is render.ts's job (set the offset to WELL_Z_ADJUST[wellID] directly).
//
// The tail: a bare `gap >> 3` truncates to 0 once |gap| < 8 and would STALL a few
// units short of home. The ROM's fractional accumulator completes the tail; here
// we finish it directly the frame the shifted step rounds to zero, so the tube
// always frames up exactly (no perpetual off-by-a-few-pixels drift).
export function stepFraming(current: number, target: number): number {
  const gap = target - current
  if (gap === 0) return current
  const step = gap >> 3
  if (step === 0) return target // |gap| < 8: finish the tail this frame
  return current + step
}
