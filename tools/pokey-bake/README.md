# pokey-bake — authentic Tempest SFX → WAV

Bakes Atari Tempest sound effects to `.wav` by driving a real **POKEY** chip
emulator headlessly in Node — no browser, no MAME. Feed it the POKEY register
sequences extracted from the Tempest ROM and it renders authentic audio you can
host on R2 and play through the existing sample-based SFX path.

## Why this exists

Tempest has **no audio samples in its ROM** — every sound is live POKEY
synthesis. To get authentic `.wav` SFX we reconstruct each effect from its POKEY
register writes. We chose to **bake once to `.wav`** (rather than synthesize live
in the browser) to keep the existing sampler pipeline; this tool does the baking.

## Usage

```bash
node tools/pokey-bake/bake-sfx.mjs [outDir] [--rate 48000|44100|56000] [--normalize]
```

- `outDir` — where to write `.wav` files (default `tools/pokey-bake/out`)
- `--rate` — sample rate; web-pokey supports 48000 (default), 44100, 56000
- `--normalize` — peak-normalize each SFX to 0.9 (off by default, to preserve the
  authentic relative loudness the arcade sets via each channel's volume nibble)

Requires Node ≥ 16 (uses ES modules + `node:vm`). No npm install needed.

## Defining sounds — `sfx-data.mjs`

Sounds are defined in Tempest's own **ALSOUN** envelope format, extracted verbatim
from the arcade ROM (`136002-136.lm1`, sound table at `$cc2d`). Each SFX is two
6-byte envelope records — one for AUDF1 (pitch), one for AUDC1 (distortion +
volume):

```js
{
  name: 'enemy_fire',
  rom: '$cc45',                                 // CPU address in the ROM (provenance)
  alsoun: {                                     // [value, beats, delta, count, restart, stop]
    audf: [0x00, 0x03, 0x02, 0x09, 0x00, 0x00],
    audc: [0x08, 0x03, 0xff, 0x09, 0x00, 0x00],
  },
  gain: 0.85,
}
```

`bake-sfx.mjs` walks each record at the **~250 Hz sound IRQ** (one beat ≈ 4 ms):
write `value`, hold `beats` ticks, add `delta`, repeat `count` times (`count=1` =
write once); `restart`≠0 loops; `stop`=0 terminates. `AUDCn` =
`[distortion:3][volume-only:1][volume:4]` (A0=pure, 80=noise, C0=poly4); `AUDFn` is
a frequency divider (lower → higher pitch). The runner warns `⚠ SILENT` for any
entry that produces no output.

> **Raw escape hatch:** a spec may instead provide a `pokey1` (and optional
> `pokey2`) array of `[regIndex, value, timeSeconds, …]` writes fed straight to
> `feed()`, bypassing the ALSOUN expander. Register map: `0/1`=AUDF1/AUDC1,
> `2/3`=AUDF2/AUDC2, `4/5`, `6/7`, `8`=AUDCTL, `9`=console.

Provenance, format, and the sound→address mapping are documented in
"Tempest vs Tempest" (R. Hogan), ch. *story of a beep*.

## Attribution / license

The POKEY emulator core in `vendor/pokey.js` is **web-pokey** by **Mariusz
Kryński**, MIT-licensed — see `vendor/LICENSE`.
Source: https://github.com/mrk-its/web-pokey (commit `0c6327b`).
Vendored unmodified; loaded via a small Node VM shim in `bake-sfx.mjs`.

This tool is build-time only and is **not** part of the game's pure `core/`
simulation.
