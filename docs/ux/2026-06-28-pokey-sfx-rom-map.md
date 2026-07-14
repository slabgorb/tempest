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

  Verified against all six sounds 6-6 shipped: `0x35→$cc39`, `0x3b→$cc45`,
  `0x47→$cc5d`, `0x53→$cc75`, `0x59→$cc81`, `0x4d→$cc69`. The arithmetic is exact.
  (6-6's *names* for two of those addresses were not — see below.)

## Primary source supersedes the ear (story tp1-2, 2026-07-13)

This map was built from the ROM, a third-party disassembly, and the book — and it
named the sounds **by ear**. Theurer's own source removes the guesswork: ALSOUN's
sound table is 13 `OFFSET` macros, each one NAMED by its author
(`ALSOUN.MAC:88-100`), and the ROM's `Lcb01` table is that same list **in the same
order**. So the `idx` column below IS the ALSOUN slot, and every slot has a name
that no longer depends on anyone's hearing:

    LO EX LA PU WP DI T2 T3 ES EL SL S3 PO
    0  1  2  3  4  5  6  7  8  9  10 11 12

Two of the by-ear labels were wrong, and the two are each other's counterparts
(audit S-008 / S-009 / S-010, fixed in story tp1-2):

| slot | address | ALSOUN says | 6-6 shipped it as | reality |
|---|---|---|---|---|
| EX (1) | `$cc5d` | `;ENEMY EXPLOSION` | the player-fire cue | every shot the player fired played an explosion |
| LA (2) | `$cbe9` | `;PLAYER FIRE` | *nothing* — flagged `?` | the real fire cue, unshipped for a year |
| T3 (7) | `$cc81` | `;THRUST IN SPACE` | the enemy-death cue | every enemy died to the warp-dive engine drone |

## The sound table (13 entries, in `Lcb01` order = ALSOUN `PNTRS` order)

| idx | ALSOUN slot | disasm label | rev-3 audf | trigger routine / call site | sound | clean 12-byte record? |
|----:|---|---|---|---|---|---|
| 0 | **LO** `;CURSOR MOVES` | `_sound_segment_change` | `$cc39` | `sound_segment_change` | **segment-tick** | yes |
| 1 | **EX** `;ENEMY EXPLOSION` | `Lcb01_01` | `$cc5d` | `sound_Lccc1` (`La36f`) ← `EXSNON` | **enemy-explosion** (tp1-2; 6-6 called this "player_fire") | yes |
| 2 | **LA** `;PLAYER FIRE` | `Lcb01_02` | `$cbe9` | `sound_Lccea` @9527 (player shot setup) ← `SLAUNC` | **player-fire / LAUNCH** (tp1-2 — this is what the `?` was) | **yes ✓** |
| 3 | **PU** `;PULSATION` | `Lcb01_03` | `$cc99` | `sound_Lcd02` @8209 (`n_pulsars>0`, player alive) | **pulsar-hum** | **no — multi-segment** |
| 4 | **WP** `;SPECIAL SCORE` | `_sound_lives_added` | `$cc11` | `sound_lives_added` @16499/16808 | **extra-life** | **no — multi-segment** |
| 5 | **DI** `;PLAYER DIES` | `Lcb01_05` | `$cbf5` | `sound_Lccb0` ← `La352` ← **`pieces_death`** @7685/8581 | **player-explosion** | **no — multi-segment** |
| 6 | **T2** `;THRUST IN TUBE` | `Lcb01_06` | `$cc75` | `sound_Lccee` @7577 (zoom, "top of tunnel") | **warp / zoom** — the dive's FIRST phase | yes |
| 7 | **T3** `;THRUST IN SPACE` | `Lcb01_07` | `$cc81` | `sound_Lccf2` @7595 (zoom end → get-level) ← `SOUTS3` | **thrust-in-space** — the dive's SECOND phase (tp1-2; 6-6 called this "enemy_explosion") | yes |
| 8 | **ES** `;ENEMY SHOT` | `_sound_enemy_fire` | `$cc45` | `sound_enemy_fire` | **enemy-fire** | yes |
| 9 | **EL** `;ENEMY LINE DESTRUCTION` | `_sound_spike_shot` | `$cc51` | `sound_spike_shot` @9458 (`spike_ht`) | **spike-shot** | **yes ✓** |
| 10 | **SL** `;SLAM` | `_sound_slam` | `$cc69` | `sound_slam` @16323 (`play_sound`, runs in attract) | **slam** (= 6-6's "countdown_beep" data) | yes |
| 11 | **S3** `;3 SECONDS LEFT WARNING` | `_sound_Lccfe` | `$cc8d` | `sound_Lccfe` @6453 (1-second timer reset) | countdown/level-select beep | yes |
| 12 | **PO** `;PULSAR OFF` | `Lcb01_0c` | `$cca9` | `sound_pulsar` @7684/8201 (pulse beat toggles) | **pulsar-active** | **no — multi-segment, single stream** |

Notes:
- **The `?` on idx2 is resolved: it is `$cbe9`, ALSOUN's `LA` — `;PLAYER FIRE`.** It is
  also a perfectly clean 12-byte record (`LA3F`/`LA3A`, ALSOUN.MAC:141-142), not the
  "multi-segment" this map guessed. It is now shipped as `player_fire.wav`.
- This map's earlier note read: *"6-6's by-ear labels for `$cc69` and `$cc81` differ
  from the disassembly's structural labels (`slam`, zoom-end). The data bytes match
  6-6 exactly; only the names differ."* That reasoning is what let the bug live. When
  a by-ear label and the ROM's own label disagree, the ROM is right and the ear is
  wrong — the bytes matching proves only that we read the right address, never that
  we hung it on the right cue. `$cc81` really was the zoom-end drone, and we really
  were playing it on every enemy death.
- `$cc69` (shipped as `countdown_beep.wav`) is still hung on `SL`, the SLAM record.
  The real 3-second warning is `S3` at `$cc8d`. That is the SAME class of by-ear
  error, filed separately — tp1-2 does not touch it.

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
