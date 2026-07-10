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
  {
    // ★ Spike shot — the Spiker's projectile/impact (story 6-11). The
    // disassembly's `_sound_spike_shot` (table entry 9, sample_41/44). A clean
    // single-note record like the 6-6 set: a fast descending-pitch "pew".
    name: 'spike_shot',
    rom: '$cc51',
    alsoun: {
      audf: [0x80, 0x01, 0xe8, 0x05, 0x00, 0x00],
      audc: [0xa1, 0x01, 0x01, 0x05, 0x00, 0x00],
    },
    gain: 0.85,
  },
];

// ── Streaming (multi-note) ALSOUN sounds (story 6-11) ────────────────────────
// Unlike the 6-6 set, these sounds are NOT single 6-byte records — they are
// multi-note envelopes the engine streams from the `Lcbd1` table. We embed the
// authentic rev-3 ROM data region verbatim and let bake-sfx.mjs's expandStream()
// replay the real `update_sounds` engine over it (validated bit-for-bit against
// the 6-6 sounds). `audfStart`/`audcStart` are the per-sound `Lcb01` sample
// values (AUDF1 + AUDC1 voices). See docs/ux/2026-06-28-pokey-sfx-rom-map.md.
export const ALSOUN_STREAM_BASE = 0xcbd1;

// Verbatim ROM bytes $cbd1..$ccaa (the ALSOUN sample-data region).
export const ALSOUN_STREAM = [
  0xc0, 0x08, 0x04, 0x10, 0x00, 0x00, 0xa6, 0x20, 0xf8, 0x04, 0x00, 0x00,
  0x40, 0x08, 0x04, 0x10, 0x00, 0x00, 0xa6, 0x20, 0xfe, 0x04, 0x00, 0x00,
  0x10, 0x01, 0x07, 0x20, 0x00, 0x00, 0xa2, 0x01, 0xf8, 0x20, 0x00, 0x00,
  0x08, 0x04, 0x20, 0x0a, 0x08, 0x04, 0x01, 0x09, 0x10, 0x0d, 0x04, 0x0c,
  0x00, 0x00, 0x08, 0x04, 0x00, 0x0a, 0x68, 0x04, 0x00, 0x09, 0x68, 0x12,
  0xff, 0x09, 0x00, 0x00, 0x40, 0x01, 0x00, 0x01, 0x40, 0x01, 0xff, 0x40,
  0x30, 0x01, 0xff, 0x30, 0x20, 0x01, 0xff, 0x20, 0x18, 0x01, 0xff, 0x18,
  0x14, 0x01, 0xff, 0x14, 0x12, 0x01, 0xff, 0x12, 0x10, 0x01, 0xff, 0x10,
  0x00, 0x00, 0xa8, 0x93, 0x00, 0x02, 0x00, 0x00, 0x0f, 0x04, 0x00, 0x01,
  0x00, 0x00, 0xa2, 0x04, 0x40, 0x01, 0x00, 0x00, 0x00, 0x03, 0x02, 0x09,
  0x00, 0x00, 0x08, 0x03, 0xff, 0x09, 0x00, 0x00, 0x80, 0x01, 0xe8, 0x05,
  0x00, 0x00, 0xa1, 0x01, 0x01, 0x05, 0x00, 0x00, 0x01, 0x08, 0x02, 0x10,
  0x00, 0x00, 0x86, 0x20, 0x00, 0x04, 0x00, 0x00, 0x18, 0x04, 0x00, 0xff,
  0x00, 0x00, 0xaf, 0x04, 0x00, 0xff, 0x00, 0x00, 0xc0, 0x02, 0xff, 0xff,
  0x00, 0x00, 0x28, 0x02, 0x00, 0xf0, 0x00, 0x00, 0x10, 0x0b, 0x01, 0x40,
  0x00, 0x00, 0x86, 0x40, 0x00, 0x0b, 0x00, 0x00, 0x20, 0x80, 0x00, 0x03,
  0x00, 0x00, 0xa8, 0x40, 0xf8, 0x06, 0x00, 0x00, 0xb0, 0x02, 0x00, 0xff,
  0x00, 0x00, 0xc8, 0x01, 0x02, 0xff, 0xc8, 0x01, 0x02, 0xff, 0x00, 0x00,
  0xc0, 0x01,
];

// Streaming SFX entries. `stream.audfStart`/`audcStart` index ALSOUN_STREAM via
// the engine (addr = $cbcf + 2*value). bake-sfx.mjs walks them into register
// events. `rom` is the audf record's CPU address (for parity with the 6-6 set).
SFX.push(
  {
    // ★ Player explosion — the Claw breaking into pieces on death (story 6-11).
    // Disassembly `pieces_death` -> `sound_Lccb0` (table entry 5, sample_13/1a).
    // A 4-note ~0.96s envelope. Wired to the core 'player-death' event,
    // replacing the community-rip shipexplosion.wav.
    name: 'player_explosion',
    rom: '$cbf5',
    stream: { audfStart: 0x13, audcStart: 0x1a },
    gain: 0.85,
  },
  {
    // ★ Extra life / bonus life jingle (story 6-11). Disassembly
    // `_sound_lives_added` (table entry 4, sample_21/32) — an ~1.18s descending
    // 8-note arpeggio. No core 'extra-life' GameEvent exists yet, so this is
    // baked + hosted but left unwired (see Delivery Findings / follow-up).
    name: 'extra_life',
    rom: '$cc11',
    stream: { audfStart: 0x21, audcStart: 0x32 },
    gain: 0.85,
  },
  {
    // ★ Pulsar hum — the sustained tone while pulsars are on the board
    // (story 6-11). Disassembly `sound_Lcd02` (table entry 3, sample_65/68),
    // called when n_pulsars>0. A looping/sustained envelope (capped to a
    // one-shot WAV). No core pulsar-sound event yet, so baked but unwired.
    name: 'pulsar_hum',
    rom: '$cc99',
    stream: { audfStart: 0x65, audcStart: 0x68 },
    gain: 0.7,
  },
);

// Catalogued SFX investigated for 6-11 but NOT delivered as a playable bake,
// each with the reason (AC#1: "any without a confirmable address explicitly
// noted"; AC#3: "deferred with a documented reason"). Names match the story's.
export const DEFERRED = [
  {
    name: 'pulsar_active',
    reason:
      'Disassembly sound_pulsar (entry 12, sample_6d) is a single-tick per-pulse-beat blip ' +
      'with AUDC volume nibble 0 — it bakes SILENT as a one-shot and only makes sense ' +
      'retriggered each pulse beat in-engine, not as a standalone sample. Address known ($cca9).',
  },
  {
    name: 'zoom_start',
    reason:
      'The zoom/level-clear cue (disassembly sound_Lccee, $cc75) is the SAME ROM record already ' +
      'shipped by 6-6 as warp.wav (and wired to level-clear). No distinct "zoom-start" record exists; ' +
      'delivering it again would just duplicate warp.wav.',
  },
  {
    name: 'slam',
    reason:
      'Disassembly _sound_slam (entry 10, $cc69) is the cabinet slam/tilt-switch warning and is the ' +
      'SAME ROM record 6-6 shipped as countdown_beep.wav. A browser clone has no slam/tilt switch, ' +
      'so there is no trigger; the underlying record is already baked. Address known ($cc69).',
  },
];

export default SFX;
