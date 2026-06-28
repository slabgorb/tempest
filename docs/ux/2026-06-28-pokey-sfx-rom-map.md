# POKEY SFX ROM map — authoritative sound table (story 6-11)

Reverse-engineered from the rev-3 ROM (`docs/rom/136002-136.lm1`, gitignored) plus
the labelled disassembly `tempest.a65` (charlesUnixPro/Tempest-Source-Code) and the
"Tempest vs Tempest" book (`docs/TempestVsTempest_release.pdf`, ch. *story of a beep*).
This supersedes guesswork: it names every entry in the arcade's sound table and gives
its exact rev-3 address.

## Extraction method (verified)

- ROM `136002-136.lm1` loads at CPU `$c000`; file offset = `CPU addr − $c000`.
- The sound-select table `Lcb01` (`$cb01`) holds one entry per sound: a pair of
  **sample low-bytes** `(audf, audc)`. The real ROM's `$cb01` pairs match the
  disassembly's `Lcb01` order **exactly**.
- The ALSOUN engine (`update_sounds`) streams data from `Lcbd1` (`$cbd1`) using
  `Lc0` as an index that **advances by 2 per note-change**: it reads
  `Lcbd1-6+Lc0*2`, `Lcbd1-5+...`, etc. The runtime data address for a sample whose
  `$cb01` value is `v` is therefore:

  **`addr = $cbcf + 2 × v`**

  Verified against all six sounds 6-6 shipped: segment_tick `0x35→$cc39`,
  enemy_fire `0x3b→$cc45`, player_fire `0x47→$cc5d`, warp `0x53→$cc75`,
  enemy_explosion `0x59→$cc81`, countdown `0x4d→$cc69`. All exact.

## The sound table (13 entries, in `Lcb01` order)

| idx | disasm label | rev-3 audf | trigger routine / call site | sound | clean 12-byte record? |
|----:|---|---|---|---|---|
| 0 | `_sound_segment_change` | `$cc39` | `sound_segment_change` | **segment-tick** (6-6) | yes |
| 1 | `Lcb01_01` | `$cc5d` | `sound_Lccc1` (`La36f`) | **player-fire** (6-6) | yes |
| 2 | `Lcb01_02` | `$cbe9` | `sound_Lccea` @9527 (player shot setup) | player-shot variant? | **no — multi-segment** |
| 3 | `Lcb01_03` | `$cc99` | `sound_Lcd02` @8209 (`n_pulsars>0`, player alive) | **pulsar-hum** | **no — multi-segment** |
| 4 | `_sound_lives_added` | `$cc11` | `sound_lives_added` @16499/16808 | **extra-life** | **no — multi-segment** |
| 5 | `Lcb01_05` | `$cbf5` | `sound_Lccb0` ← `La352` ← **`pieces_death`** @7685/8581 | **player-explosion** | **no — multi-segment** |
| 6 | `Lcb01_06` | `$cc75` | `sound_Lccee` @7577 (zoom, "top of tunnel") | **warp / zoom** (6-6 "warp") | yes |
| 7 | `Lcb01_07` | `$cc81` | `sound_Lccf2` @7595 (zoom end → get-level) | zoom-end (6-6 "enemy_explosion") | yes |
| 8 | `_sound_enemy_fire` | `$cc45` | `sound_enemy_fire` | **enemy-fire** (6-6) | yes |
| 9 | `_sound_spike_shot` | `$cc51` | `sound_spike_shot` @9458 (`spike_ht`) | **spike-shot** | **yes ✓** |
| 10 | `_sound_slam` | `$cc69` | `sound_slam` @16323 (`play_sound`, runs in attract) | **slam** (= 6-6 "countdown_beep" data) | yes |
| 11 | `_sound_Lccfe` | `$cc8d` | `sound_Lccfe` @6453 (1-second timer reset) | countdown/level-select beep | yes |
| 12 | `Lcb01_0c` | `$cca9` | `sound_pulsar` @7684/8201 (pulse beat toggles) | **pulsar-active** | **no — multi-segment, single stream** |

Notes:
- 6-6's by-ear labels for `$cc69` (countdown_beep) and `$cc81` (enemy_explosion) differ
  from the disassembly's structural labels (`slam`, zoom-end). The **data bytes** match
  6-6 exactly; only the names differ. 6-6's six are merged and not re-litigated here.

## Story 6-11 implications for the 7 remaining catalogued SFX

| target sound | table entry | status |
|---|---|---|
| **spike-shot** | idx9 `$cc51` (clean) | **deliverable now** with the existing bake tool. No `spike-shot` GameEvent exists in `src/core/` → bake+host but leave unwired (AC#3 defer-wiring). |
| **player-explosion** | idx5 `$cbf5` (multi-segment) | Has the only real clone trigger (`player-death`). Needs a **bake-tool extension** to emulate the ALSOUN streaming engine — the current `{audf:[6],audc:[6]}` model can't represent it. |
| **pulsar-hum** | idx3 `$cc99` (multi-segment) | Needs streaming-engine bake support. No core pulsar-sound event today. |
| **pulsar-active** | idx12 `$cca9` (multi-segment, single stream) | Needs streaming-engine bake support. No core trigger today. |
| **extra-life** | idx4 `$cc11` (multi-segment) | Needs streaming-engine bake support. No `extra-life` GameEvent today. |
| **zoom-start** | = idx6 `$cc75` (warp) | Duplicate of the already-shipped `warp.wav` / level-clear cue. Defer (no distinct sound). |
| **slam** | idx10 `$cc69` | Same ROM record as 6-6's `countdown_beep.wav`. No slam/tilt switch in a browser clone → no trigger. Defer. |

## Faithful bake of multi-segment sounds (proposed)

`bake-sfx.mjs` currently expands a single `[value,beats,delta,count,restart]` per
register. The streaming sounds need an interpreter of `update_sounds` (above) that
walks the `Lcbd1` stream and emits timed AUDF/AUDC writes into web-pokey. **Validation
path:** re-bake the six known clean sounds through the new interpreter and confirm it
reproduces their current WAV output before trusting it for the multi-segment ones.
