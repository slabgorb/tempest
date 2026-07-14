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
// $c000). Every sound below is a slice of the ROM's own sample-data region, taken
// at the CPU address ALSOUN dispatches it from — see "One source of truth" below.
//
// ── One source of truth (story tp1-2) ───────────────────────────────────────
// Until tp1-2, each cue carried a ROM `rom:` address AND a hand-typed copy of the
// bytes at that address. Nothing checked that the two agreed, and for two of the
// six cues they did not: story 6-6 identified the sounds BY EAR and put the ENEMY
// EXPLOSION envelope behind the player's fire cue, and the warp-dive THRUST drone
// behind the enemy-death cue. Both "sounded right" and both were wrong.
//
// Theurer's source settles it without a listening test. ALSOUN's sound table is 13
// OFFSET macros, each NAMED (ALSOUN.MAC:88-100), and the ROM's `Lcb01` table is
// that same list in the same order:
//
//     idx1  EX  ";ENEMY EXPLOSION"  $cc5d      idx2  LA  ";PLAYER FIRE"  $cbe9
//     idx7  T3  ";THRUST IN SPACE"  $cc81
//
// So the bytes are no longer typed out. `alsounAt()` SLICES them out of the ROM
// data region we already embed, at the cue's own address. An address is now the
// only thing a cue declares, a wrong one yields wrong BYTES rather than a silent
// mislabel, and the two copies that could disagree are one copy that cannot.
// Cue -> ROM record is pinned in tests/audit/alsoun-cue-mapping.test.ts.

// Verbatim ROM bytes $cbd1..$ccaa — the ALSOUN sample-data region, embedded whole.
// Both the single-note cues (sliced by address, below) and the multi-note streaming
// cues (walked by the engine, further down) read out of this one blob.
export const ALSOUN_STREAM_BASE = 0xcbd1;

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

// Lift a clean single-note cue straight out of the ROM blob at its CPU address:
// the 6-byte AUDF1 record, immediately followed by the 6-byte AUDC1 record. This
// is the 12-byte shape ALSOUN's table entries have (e.g. LA3F/LA3A, ALSOUN.MAC:141).
// A cue therefore declares its ADDRESS and nothing else; the bytes follow from it.
export function alsounAt(rom) {
  const addr = parseInt(rom.replace('$', ''), 16);
  const offset = addr - ALSOUN_STREAM_BASE;
  // `!Number.isInteger` first, and not as an afterthought: a malformed address makes
  // parseInt return NaN, and EVERY comparison against NaN is false — so a bare
  // range check waves it through, and `slice(NaN, …)` then coerces to `slice(0, 0)`
  // and hands back an EMPTY envelope. That bakes to silence, and silence is the one
  // defect an ear never catches. This whole story exists because a check that
  // should have failed loudly didn't fail at all; the guard does not get to repeat it.
  if (!Number.isInteger(addr) || offset < 0 || offset + 12 > ALSOUN_STREAM.length) {
    throw new RangeError(
      `${rom} is not a readable address in the embedded ALSOUN data region ` +
        `($${ALSOUN_STREAM_BASE.toString(16)}..$${(ALSOUN_STREAM_BASE + ALSOUN_STREAM.length - 1).toString(16)})`,
    );
  }
  return {
    audf: ALSOUN_STREAM.slice(offset, offset + 6),
    audc: ALSOUN_STREAM.slice(offset + 6, offset + 12),
  };
}

export const SFX = [
  {
    // ★ Player bullet fired — ALSOUN's LA, ";PLAYER FIRE" (ALSOUN.MAC:90/141), the
    // only cue SLAUNC dispatches (ALWELG.MAC:2675, "JSR SLAUNC ;LAUNCH SOUND").
    // Story tp1-2: was $cc5d, which is the ENEMY EXPLOSION record — so every shot
    // the player fired played an explosion. The correct bytes were already sitting
    // in the blob above at offset 24, flagged "?" in the POKEY map and never
    // resolved (audit S-008 / S-010).
    name: 'player_fire',
    rom: '$cbe9',
    alsoun: alsounAt('$cbe9'),
    gain: 0.85,
  },
  {
    // ★ Enemy energy bolt — ALSOUN's ES, ";ENEMY SHOT" (ALSOUN.MAC:96). Shared by
    // all firing enemy types. Pairs with story 6-5 (the enemy-fire event).
    name: 'enemy_fire',
    rom: '$cc45',
    alsoun: alsounAt('$cc45'),
    gain: 0.85,
  },
  {
    // ★ Enemy destroyed — ALSOUN's EX, ";ENEMY EXPLOSION" (ALSOUN.MAC:89/181),
    // dispatched only from EXSNON (ALSOUN.MAC:224), fed by CIEXPL/CCEXPL on a kill.
    // Story tp1-2: was $cc81, the THRUST-IN-SPACE drone — so a dying enemy played
    // the warp-dive engine. These are the bytes that used to ship as player_fire
    // (audit S-008 / S-009).
    name: 'enemy_explosion',
    rom: '$cc5d',
    alsoun: alsounAt('$cc5d'),
    gain: 0.85,
  },
  {
    // ★ Thrust in space — ALSOUN's T3, ";THRUST SOUND IN SPACE" (ALSOUN.MAC:95/193),
    // dispatched only from SOUTS3 (ALSOUN.MAC:253) the frame the cursor clears the
    // bottom of the well and space mode begins. An engine drone, not an explosion.
    //
    // Story tp1-2 displaced these bytes from the enemy-death cue and gives them a
    // home of their own. NOT WIRED to an event yet: the second phase of the warp
    // dive that plays it is story tp1-9 (audit S-014), which reuses exactly this
    // record. Baked and hosted so tp1-9 only has to wire it — the same way 6-11
    // landed spike_shot and extra_life ahead of their triggers.
    name: 'thrust_space',
    rom: '$cc81',
    alsoun: alsounAt('$cc81'),
    gain: 0.85,
  },
  {
    // Warp / zoom through the tube on level clear — ALSOUN's T2, ";THRUST IN TUBE"
    // (ALSOUN.MAC:94). The dive's FIRST phase; T3 above takes over at the bottom.
    name: 'warp',
    rom: '$cc75',
    alsoun: alsounAt('$cc75'),
    gain: 0.85,
  },
  {
    // Loud warning beep when the level-select timer runs low. NOTE: this record is
    // ALSOUN's SL, ";SLAM" (ALSOUN.MAC:98) — the cabinet tilt warning. The real
    // 3-second countdown is S3 at $cc8d. Another 6-6 by-ear mislabel, but a
    // DIFFERENT one from tp1-2's: filed separately, out of this story's scope.
    name: 'countdown_beep',
    rom: '$cc69',
    alsoun: alsounAt('$cc69'),
    gain: 0.85,
  },
  {
    // Cursor / line-crossing tick — ALSOUN's LO, ";CURSOR MOVES" (ALSOUN.MAC:88).
    name: 'segment_tick',
    rom: '$cc39',
    alsoun: alsounAt('$cc39'),
    gain: 0.7,
  },
  {
    // ★ Spike shot — the Spiker's projectile/impact (story 6-11). ALSOUN's EL,
    // ";ENEMY LINE DESTRUCTION" (ALSOUN.MAC:97). A fast descending-pitch "pew".
    name: 'spike_shot',
    rom: '$cc51',
    alsoun: alsounAt('$cc51'),
    gain: 0.85,
  },
];

// ── Streaming (multi-note) ALSOUN sounds (story 6-11) ────────────────────────
// Unlike the cues above, these are NOT a single 12-byte record — they are
// multi-note envelopes the engine streams out of the same blob. We let
// bake-sfx.mjs's expandStream() replay the real `update_sounds` engine over it
// (validated bit-for-bit against the clean sounds). `audfStart`/`audcStart` are
// the per-sound `Lcb01` sample values (AUDF1 + AUDC1 voices), which the engine
// resolves as `addr = $cbcf + 2v`. See docs/ux/2026-06-28-pokey-sfx-rom-map.md.
SFX.push(
  {
    // ★ Player explosion — the Claw breaking into pieces on death (story 6-11).
    // ALSOUN's DI, ";PLAYER DIES" (ALSOUN.MAC:93). A 4-note ~0.96s envelope.
    name: 'player_explosion',
    rom: '$cbf5',
    stream: { audfStart: 0x13, audcStart: 0x1a },
    gain: 0.85,
  },
  {
    // ★ Extra life / bonus life jingle (story 6-11). ALSOUN's WP, ";SPECIAL SCORE"
    // (ALSOUN.MAC:92) — an ~1.18s descending 8-note arpeggio.
    name: 'extra_life',
    rom: '$cc11',
    stream: { audfStart: 0x21, audcStart: 0x32 },
    gain: 0.85,
  },
  {
    // ★ Pulsar hum — the sustained tone while pulsars are on the board (story 6-11).
    // ALSOUN's PU, ";PULSATION" (ALSOUN.MAC:91). A looping/sustained envelope
    // (capped to a one-shot WAV).
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
      "ALSOUN's PO, \";PULSAR OFF\" (entry 12, $cca9) is a single-tick per-pulse-beat blip " +
      'with AUDC volume nibble 0 — it bakes SILENT as a one-shot and only makes sense ' +
      'retriggered each pulse beat in-engine, not as a standalone sample. Address known ($cca9).',
  },
  {
    name: 'zoom_start',
    reason:
      "The zoom/level-clear cue is ALSOUN's T2 (\";THRUST IN TUBE\", $cc75) — the SAME ROM record " +
      'already shipped as warp.wav and wired to level-clear. No distinct "zoom-start" record ' +
      'exists; delivering it again would just duplicate warp.wav.',
  },
  {
    name: 'slam',
    reason:
      "ALSOUN's SL, \";SLAM\" (entry 10, $cc69) is the cabinet slam/tilt-switch warning, and it is the " +
      'SAME ROM record 6-6 shipped as countdown_beep.wav. A browser clone has no slam/tilt switch, ' +
      'so there is no trigger; the underlying record is already baked. Address known ($cc69).',
  },
];

export default SFX;
