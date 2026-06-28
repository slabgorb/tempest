// src/shell/phosphor.ts
//
// Phosphor persistence (vector afterglow) — shell-only eye candy. Recreates the
// Atari Color-XY monitor's beam afterglow: fast movers (Flipper flip, spinning
// Claw, bullets) smear while static geometry stays sharp. See
// docs/superpowers/specs/2026-06-28-phosphor-persistence-design.md.

/**
 * Frame-rate-corrected per-frame FADE alpha for the phosphor accumulator.
 *
 * `decay` is the desired retention over one 1/60 s frame (0 = instant clear,
 * 1 = never fades). `dt` is the real elapsed seconds for this drawn frame. The
 * accumulator is an exponential moving average, so to stay frame-rate
 * independent the retention scales as decay^(dt*60); the returned value is the
 * complementary fade `1 - decay^(dt*60)`.
 *
 * At dt = 1/60 this is exactly `1 - decay`. Higher refresh rates (smaller dt)
 * return a smaller fade so N short frames compose to the same retention as one
 * 60 Hz frame.
 */
export function phosphorAlpha(decay: number, dt: number): number {
  const d = Math.max(0, Math.min(1, decay))
  const frames = Math.max(0, dt) * 60
  return 1 - Math.pow(d, frames)
}
