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

Each SFX is a timed list of POKEY register writes in web-pokey's `feed()` format:

```js
[ regIndex, value, timeSeconds,  regIndex, value, timeSeconds, ... ]
```

Register index map (from `vendor/pokey.js`):

| idx | reg   | idx | reg   |
|-----|-------|-----|-------|
| 0   | AUDF1 | 1   | AUDC1 |
| 2   | AUDF2 | 3   | AUDC2 |
| 4   | AUDF3 | 5   | AUDC3 |
| 6   | AUDF4 | 7   | AUDC4 |
| 8   | AUDCTL | 9  | console |

`AUDCn` = `[distortion:3][volume-only:1][volume:4]`; `AUDFn` = frequency divider
(lower → higher pitch). A spec may include `pokey2` (the second chip — Tempest has
two); output is mixed to mono.

The file currently ships **two demo entries** (`demo_beep`, `demo_zap`) that prove
the pipeline. **Replace the `SFX` array with the authentic Tempest register
sequences** from the `sound-recon` ROM pass (player fire, enemy fire/charge,
explosion, zoom/warp, superzapper, pulsar, fuseball, bonus, …). The runner warns
`⚠ SILENT` for any entry whose data produces no output.

## Attribution / license

The POKEY emulator core in `vendor/pokey.js` is **web-pokey** by **Mariusz
Kryński**, MIT-licensed — see `vendor/LICENSE`.
Source: https://github.com/mrk-its/web-pokey (commit `0c6327b`).
Vendored unmodified; loaded via a small Node VM shim in `bake-sfx.mjs`.

This tool is build-time only and is **not** part of the game's pure `core/`
simulation.
