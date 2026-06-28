// Authentic Tempest (1981, rev-3) POKEY sound-effect data for the WAV bake tool.
//
// Tempest has NO PCM samples — every sound is live POKEY synthesis driven by the
// `ALSOUN.MAC` envelope engine. Each effect is two envelope sequences: one steers
// the AUDF1 register (pitch), one steers AUDC1 (distortion + volume). A sequence
// is a 6-byte record walked by the sound IRQ:
//
//     [ value, beats, delta, count, restart, stop ]
//       value   - first byte written to the register
//       beats   - sound-IRQ ticks to hold before the next change
//       delta   - signed amount added each step (0xFF = -1)
//       count   - number of writes; count=1 means "write once, no change"
//       restart - replay offset for looping sounds (0 = no loop)
//       stop    - terminator (0)
//
// The engine ticks at the ~246-250 Hz sound interrupt (NOT the 60 Hz game frame),
// so one beat ≈ 4 ms. `bake-sfx.mjs` expands these envelopes at that rate.
//
// AUDC byte: bits 7-5 distortion (A=pure tone, 8=white noise, C=poly4, 2/0=gravelly),
//            bit 4 volume-only, bits 3-0 volume (0-15). AUDF: lower divider = higher pitch.
//
// SOURCE: extracted verbatim from the arcade ROM `136002-136.lm1` (loads at CPU
// $c000); the ALSOUN sound table sits at file offset 0x0c2d ($cc2d). Each entry's
// `rom` field is the CPU address of its 12-byte (AUDF+AUDC) record. Sound→address
// mapping confirmed by ear against the real game. Format documented in
// "Tempest vs Tempest" (R. Hogan), ch. "story of a beep".

export const SFX = [
  {
    // Player bullet fired.
    name: 'player_fire',
    rom: '$cc5d',
    alsoun: {
      audf: [0x01, 0x08, 0x02, 0x10, 0x00, 0x00],
      audc: [0x86, 0x20, 0x00, 0x04, 0x00, 0x00],
    },
    gain: 0.85,
  },
  {
    // ★ Enemy energy bolt ("ENEMY SHOT" / ESLSON). Shared by all firing enemy
    // types. Pairs with story 6-5 (the enemy-fire event it wires to).
    name: 'enemy_fire',
    rom: '$cc45',
    alsoun: {
      audf: [0x00, 0x03, 0x02, 0x09, 0x00, 0x00],
      audc: [0x08, 0x03, 0xff, 0x09, 0x00, 0x00],
    },
    gain: 0.85,
  },
  {
    // Enemy destroyed (enemy-death).
    name: 'enemy_explosion',
    rom: '$cc81',
    alsoun: {
      audf: [0x10, 0x0b, 0x01, 0x40, 0x00, 0x00],
      audc: [0x86, 0x40, 0x00, 0x0b, 0x00, 0x00],
    },
    gain: 0.85,
  },
  {
    // Warp / zoom through the tube on level clear.
    name: 'warp',
    rom: '$cc75',
    alsoun: {
      audf: [0xc0, 0x02, 0xff, 0xff, 0x00, 0x00],
      audc: [0x28, 0x02, 0x00, 0xf0, 0x00, 0x00],
    },
    gain: 0.85,
  },
  {
    // Loud warning beep when the level-select timer runs low.
    name: 'countdown_beep',
    rom: '$cc69',
    alsoun: {
      audf: [0x18, 0x04, 0x00, 0xff, 0x00, 0x00],
      audc: [0xaf, 0x04, 0x00, 0xff, 0x00, 0x00],
    },
    gain: 0.85,
  },
  {
    // Cursor / line-crossing tick.
    name: 'segment_tick',
    rom: '$cc39',
    alsoun: {
      audf: [0x0f, 0x04, 0x00, 0x01, 0x00, 0x00],
      audc: [0xa2, 0x04, 0x40, 0x01, 0x00, 0x00],
    },
    gain: 0.7,
  },
];

export default SFX;
