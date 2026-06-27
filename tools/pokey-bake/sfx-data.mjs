// SFX register data for the POKEY → WAV bake utility.
//
// Each entry describes one sound effect as a timed sequence of POKEY register
// writes, exactly the format the web-pokey core consumes via `feed()`:
//
//     [ regIndex, value, timeSeconds, regIndex, value, timeSeconds, ... ]
//
// Register index map (from vendor/pokey.js `processEvents`):
//     0 = AUDF1   1 = AUDC1
//     2 = AUDF2   3 = AUDC2
//     4 = AUDF3   5 = AUDC3
//     6 = AUDF4   7 = AUDC4
//     8 = AUDCTL  9 = console (4-bit, for the GTIA-style "click")
//
// AUDCn byte: bits 7-5 = distortion/poly select, bit 4 = "volume-only",
//             bits 3-0 = volume (0-15). AUDFn = frequency divider (lower = higher pitch).
//
// `pokey1` is the primary chip; `pokey2` is optional (Tempest has two POKEYs —
// populate it when a sound uses the second chip). Output is mixed to mono.
//
// ─────────────────────────────────────────────────────────────────────────────
// The two DEMO entries below are PLACEHOLDERS that prove the pipeline end-to-end.
// Replace this array with the authentic Tempest register sequences extracted by
// the `sound-recon` ROM pass (player fire, enemy fire/charge, explosion, zoom,
// superzapper, pulsar, etc.). Keep the same shape.
// ─────────────────────────────────────────────────────────────────────────────

export const SFX = [
  {
    name: 'demo_beep',
    durationMs: 250,
    gain: 0.8,
    // steady tone on channel 1, silenced at 0.20s
    pokey1: [
      8, 0x00, 0.00, // AUDCTL = 0
      1, 0xa8, 0.00, // AUDC1 = pure-ish tone, volume 8
      0, 0x28, 0.00, // AUDF1 = 40
      1, 0x00, 0.20, // AUDC1 = 0 -> silence the tail
    ],
  },
  {
    name: 'demo_zap',
    durationMs: 220,
    gain: 0.85,
    // descending "pew": step AUDF1 upward (rising divider = falling pitch)
    pokey1: [
      8, 0x00, 0.00,
      1, 0xa8, 0.00, // AUDC1 = tone, volume 8
      0, 0x0a, 0.00, // AUDF1 = 10
      0, 0x14, 0.03, // AUDF1 = 20
      0, 0x28, 0.06, // AUDF1 = 40
      0, 0x46, 0.09, // AUDF1 = 70
      0, 0x6e, 0.12, // AUDF1 = 110
      1, 0x00, 0.16, // AUDC1 = 0
    ],
  },
];

export default SFX;
