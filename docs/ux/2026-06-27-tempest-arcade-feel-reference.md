# Tempest Arcade Feel Reference — Wave 6 (6-1 / 6-2 / 6-3)

**Author:** Marya (UX Designer) · **Date:** 2026-06-27
**Purpose:** Authentic behavior reference for the three Wave-6 playtest feel-fixes, sourced
from the **verified rev-3 Atari Tempest ROM** and the labeled reconstructed source.

## Provenance (why these numbers are trustworthy)

- The user's ROM set in `~/Downloads/tempest` was checksummed (CRC32) and is **byte-identical
  to the canonical MAME `tempest` rev-3 romset** — game logic in `133.d1 / 134.f1 / 235.j1 /
  237.p1`, vector data in `136.lm1 / 138.np3`, the rest are hardware PROMs.
- Constants below come from the reconstructed, labeled source `charlesUnixPro/Tempest-Source-Code`
  (`tempest.a65`, 21,518 lines). Every `.if VER=…` block was inspected: **the zoom, fire, and
  death/respawn code is identical across versions 1/2/3** — version conditionals only touch
  HUD/coin/input cosmetics. So rev-3 = these numbers.
- Two screen-capture clips of authentic arcade play (Atari Flashback Classics) were also reviewed:
  one shows a full level-clear → warp → next-level sequence (with the on-screen "AVOID SPIKES"
  banner); the other shows L1 play cornered into death (the explosion/respawn itself was cut off,
  so death timing is sourced from the ROM, not the clip).

Tempest runs at ~60 Hz. Position down the tube is `player_along`, `$10` (near rim) → `$f0`
(far end). Our core uses `depth ∈ [0=far, 1=near]` — **invert** when mapping, and express all
arcade per-frame values as per-second rates driven by `dt` (never frame-locked).

---

## 6-1 — Warp / Zoom on level-clear (slow → fast, + AVOID SPIKES grace)

**The arcade does NOT warp instantly.** On level-clear the player dives down the tube under
`game_state_zoom`, and there are *two* grace mechanisms our clone is missing.

### The descent is an accelerating ramp (slow → fast) — confirmed
`tempest.a65:10056-10062` (init) and `:7579-7651` (per-frame step `L97f8`):

- **Initial velocity** = `$0200` = **2.0** along-units/frame (slow start).
- **Per-frame acceleration** = `min(curlevel*4, $30) + $20`, *added to velocity every frame*.
- Net: starts slow, accelerates continuously. Total descent `$10`→`$f0`:
  | Level | Frames | ≈ Seconds |
  |-------|--------|-----------|
  | 1     | 45     | 0.75 s    |
  | 5     | 39     | 0.65 s    |
  | 11    | 34     | 0.57 s    |
  | 12–55 | 33     | 0.55 s    |

- **The player keeps full rotation control during the entire zoom** (`move_player` runs every
  frame at `:7383`). This is what lets you slide off a spiked lane mid-descent.

### "AVOID SPIKES" pre-warning
`tempest.a65:10072-10088`:
- When any spike exists **and** displayed level ≤ 7, a **30-frame (~0.5 s)** countdown
  (`game_state_countdown`) runs *before* the zoom — the on-screen "AVOID SPIKES" banner.
- On levels ≥ 8 there is **no** warning even with spikes (skill expectation ramps).

### Spike kill rule
`tempest.a65:7656-7688`: during the zoom, the player dies the instant they descend **past the
tip** of a spike on *their current segment* (`spike_ht[player_seg] < player_along`). A short
spike kills almost immediately; a tall spike leaves the whole descent to escape. The escape
window therefore scales with spike height — it is **not** a fixed timer.

### Design direction for 6-1
1. Replace the instant warp with an **accelerating descent**: slow start, continuous accel,
   ~0.55–0.75 s total (longer on low levels). Express as a `dt`-driven depth velocity that ramps.
2. **Keep the spinner live during the descent** so the player can rotate off a spiked lane.
3. Add the **~0.5 s "AVOID SPIKES" pre-warning** on early levels when spikes are present.
4. Kill only when the descending claw passes the spike tip on its *own* lane.

---

## 6-2 — Auto-fire cadence (slot-capped, no cooldown)

**There is no fire cooldown timer in the arcade.** Firing is gated *only* by (a) the fire
button being held and (b) an available shot slot.

`tempest.a65:9509-9534` (`player_fire`), `:300-302` (limits), `:9380-9396` (shot motion):
- **Max concurrent player shots = 8** (`n_player_bullets = 8`; `ply_shotpos/seg` are 8-wide).
- **No reload/charge counter** — gate is `zap_fire_debounce & $10` (button held) + free slot.
- **One new shot per frame** while held (loop force-exits after a single spawn).
- Shots travel **+9 units/frame**, freeing their slot at `$f0`. From the rim a shot lives
  `($f0-$10)/9 ≈ 25` frames (~0.42 s).

### What this means for the "I skipped a bunch" complaint
At full auto the arcade fires a **fast initial burst** (up to 8 shots in 8 frames), then settles
to steady-state ~1 shot per ~3 frames (8 slots / ~25-frame lifetime). The *felt density* comes
from having **up to 8 shots in flight spread down the tube at once** — so a spin-and-hold sweep
deposits fire across many lanes. If our clone caps concurrent bullets below 8, recycles them at a
different speed, or imposes an explicit cooldown, a spin leaves gaps.

### Design direction for 6-2 (answers the story's "cooldown vs bullet-cap" question)
**It's the bullet-cap, not a cooldown.** Recommend:
1. Remove any artificial fire-cooldown; gate firing on an **8-shot concurrent cap** + free slot.
2. Spawn one shot per sim tick while auto-fire is held (rate driven by `dt`, capped by slots).
3. Verify our bullet travel speed so the 8-slot pool recycles at roughly the arcade rate
   (~0.42 s rim-to-end). Faithful coverage during a spin falls out of the 8-in-flight pool.

---

## 6-3 — Death & respawn (board reset, no chain-death)

The user's observed model — *enemies disappear → claw freezes → warp to blank → game resets
from there* — **is exactly the arcade behavior**, and it is what prevents chain-death.

`tempest.a65:9920-9982` (`La504` death anim), `:16514-16551` (`game_state_6`),
`:6266-6283` / `:6586-6606` (respawn reset):

1. **Hit:** `player_status` goes negative (death-in-progress).
2. **Death animation** (per frame while dead): first **waits for all bullets to clear**, then
   **pushes surviving enemies back down the tube** (`enemy_along += $0f`) and **zooms the claw
   back** (`player_along $10→$f0`, +`$0f`/frame = **15 frames ≈ 0.25 s**). This is the
   "freeze + warp to blank."
3. **Bookkeeping** (`game_state_6`): lose a life. If 0 → **GAME OVER**, 40-frame (~0.67 s) pause.
4. **Respawn** (lives remain): **the board is fully reset** —
   `remove_all_enemies_from_tube` + `setup_level` + `reset_pending_enemy_timers` +
   `clear_shots` — and the player reappears at **fixed segment 14** (`$0e`), near rim, on the
   **same level**.
5. **No invulnerability frames.** None exist in the respawn path. The protection is structural:
   the board is wiped and new enemies only arrive after the pending-spawn delay, so nothing is
   adjacent at the spawn instant.

### Design direction for 6-3 (resolves the open design decision)
The arcade model is decisive — **board reset, not i-frames**:
1. On death: clear all enemy shots, run a brief death animation (claw retreats down the tube,
   surviving enemies pushed off), ~0.25 s.
2. On respawn (lives remain): **remove all enemies from the tube, reset spawn timers**, restart
   the **same level**, place the claw at a **fixed lane** (arcade uses segment 14), near rim.
3. **No invulnerability needed** — the cleared board + spawn delay is the grace. This directly
   fixes "respawn into instant death" because the death lane / crowd is gone on respawn.

---

## Determinism note (applies to all three)

The arcade is frame-locked at 60 Hz; our core is a pure `dt`-driven sim. Translate every
per-frame constant above into a per-second rate (×60) or a duration in seconds, and drive it by
`dt` so behavior stays frame-rate independent and unit-testable with a seeded RNG. Do not port
"per-frame" literally.

---

## Typography — adopt "Vector Battle" for HUD & framing text (separate polish story)

**Font:** *Vector Battle* (Arcade), `VectorBattle-e9XO.ttf`, by **ck! / freakyfonts, 1999**
(`~/Downloads/vector-battle-font/`). 29 KB TTF.

**Verdict (UX):** Strong match for the glowing-vector aesthetic — thin **monoline** stroke face
that blooms cleanly under canvas glow; angular vector-ROM letterforms; slashed `0` (won't read as
`O`). Recommended for the message banners ("PLAYER ONE", "AVOID SPIKES", "GAME OVER",
"SUPERZAPPER RECHARGE"), the high-score table, and the HUD.

**License:** **Freeware, Non-Commercial** (designer's terms). Cleared for this non-commercial
hobby project. **Must keep designer attribution** (credits/about screen or repo). **If the
project ever becomes commercial, a commercial license must be purchased from the designer** —
record this constraint.

**Coverage / constraints:**
- A–Z, 0–9, `.`, `:` present and clean. **Caps-only** — lowercase code points map to the same
  caps glyphs. Fine for an all-caps arcade UI; render text uppercase.
- **Thin strokes get fragile at small sizes.** Sings at ≥30 px (titles/messages). For the live
  HUD (score/lives/level) render at **≥18–20 px and/or reduce glow blur** for small text — do a
  legibility pass on the real canvas.

**Implementation notes:** load via the browser `FontFace` API (or `@font-face`); ship the 29 KB
TTF as a static asset (honor `base:'/tempest/'`). This is a **render/shell-only change** — no
`core/` impact, so it does not touch the pure simulation. Replace the current HUD/framing text
draw calls with the loaded family; keep a system-font fallback in case the face fails to load.

**Suggested story:** *"Adopt Vector Battle vector font for HUD & framing text"* — small (1–2 pt),
`trivial` or `tdd` (shell-only). Acceptance criteria should include: license attribution present;
small-size HUD legibility verified; graceful fallback if the font fails to load.

---

## Sound / SFX — authentic POKEY audio (story 6-6 + bake tool)

**Tempest has no PCM samples in ROM** — all audio is live synthesis on 2× POKEY chips. SFX are
*envelope programs* (target/duration/ramp triples in table `Lcbd1`) streamed to the AUDF/AUDC
registers by `update_sounds` at the **~246 Hz sound IRQ** — NOT the 60 Hz game frame, so an
envelope step N maps to time ≈ `N/246` s. Source: `sound-recon` over `tempest.a65`.

### The 13 catalogued SFX (`Lcb01` @ `:16867`; routines `:17166-17435`)
segment-tick · player-fire · **enemy-fire** · spike-shot · enemy-death · player-explosion ·
pulsar-hum · pulsar-active · zoom-start · zoom-through/level-clear · countdown-beep · extra-life · slam.

- **Enemy-fire** (`sound_enemy_fire` @ `:17179`): pokey2 voice 4, envelopes `sample_3b`/`sample_3e`;
  triggered at `:9575` right after `sta enm_shotpos,y`. **Shared by all enemy types** (no per-type
  fire SFX). This is the headline gap in our R2 set — pairs with the enemy-bolt feature (6-5).
- **No dedicated superzapper sound** — it's a cascade of enemy-death SFX. **No coin sound**
  (mechanical counters). The **button-click** is a direct-POKEY tone outside the envelope engine.

### Production pipeline (decided: bake to WAV)
`tools/pokey-bake/` drives the **web-pokey** POKEY core (MIT) headlessly and bakes register
sequences → 16-bit mono WAV. Built + verified with demo data. Remaining work is story **6-6**:
extract the numeric envelope data for the 13 SFX into `sfx-data.mjs` (timing at `step/246` s), bake,
host on R2 (`arcade-assets.slabgorb.com/tempest/sfx/`), and audit/fill gaps — priority
**enemy-fire**, then segment-tick, spike-shot, pulsar hum/active.

### Audio-extraction feasibility (for the record)
ROM has no samples. Paths: (i) MAME record — best fidelity, but MAME not installed here;
(ii) **reconstruct from the catalogued POKEY envelopes via web-pokey** (chosen — the bake tool);
(iii) community rip packs (what we use today).

---

## Enemy roster — authentic shapes, motion & fire (stories 6-5 / 6-8 / 6-9)

From `enemy-recon` over rev-3 `tempest.a65` (all values VER-1/2/3 identical). 60 Hz.
**Verbatim vector data + every constant with `file:line`:** see the companion extract
[`2026-06-27-enemy-roster-rom-extract.md`](./2026-06-27-enemy-roster-rom-extract.md) — that's the
source for the `pv_draw`/`vldraw` glyph data story 6-8 needs.
`enemy_along`: **`$10` = near rim (player) … `$f0` = far**; enemies spawn at `$f0` and climb toward
low along. `$20` = near-rim trigger (split / spiker-reverse / grab). Speed bytes are signed,
sign-extended ×8 → net ≈ `(byte)/32` along/frame; ×60 → per second. Type IDs: 0=Flipper, 1=Pulsar,
2=Tanker, 3=Spiker, 4=Fuseball. Counts: 16 segments, 7 enemies on screen, 8 player bullets,
**4 enemy bullets**.

| Enemy | Shape (draw / vector) | Motion highlights | Fires? |
|-------|----------------------|-------------------|--------|
| **Flipper** (RED) | `draw_flipper` :13035; graphic 0 @ :14348 — 8-seg closed **bowtie/butterfly**, flip done at runtime | climb L1 −82.5/s → L33+ −202/s; flip = +`$80`/target angle, step ±1/tick to adjacent lane; per-level flip patterns; rim grab = death; `flip_top_accel` 2→3 | **always** (primary) |
| **Tanker** | `draw_tanker` :13065; `L39b4` :4874 — elongated **X-diamond** + cargo emblem | straight up at flipper speed; **splits** on `$20`/death → 2 children of cargo type into seg±1 (1→flippers, 2→pulsars, 3→fuseballs) | code: yes (see flag) |
| **Spiker** | `draw_spiker` :13083; `vg_sub_image_spiker_1..4` :4261 — spinning **pinwheel**, 4 frames; spike = dynamic line `Lc6c7` :15827, flickering 4-dot tip | grows spike toward rim (rate = climb speed); oscillates `$20`↔far; hops random lane at far end | code: yes (see flag) |
| **Fuseball** | `draw_fuzzball` :13180; `vg_sub_image_fuzzball_1..4` :5592 — chaotic red/yellow/cyan **ball-of-legs**, redrawn each frame | **2× flipper speed** (fastest; −165/s); rolls rim + slides lanes; **killable only on-lane in vulnerable phase** (`L02cc` bit7), not on rim; `hit_tol` 6 | **never** |
| **Pulsar** | `draw_pulsar` :13257 — strobes cyan↔white; jaggedness `(pulsing+$40)>>4` → zig-zag bar, 5 variants (`_pv_offset_9..13` :14465) | appears **L17+**; `spd_pulsar` const −82.5/s; pulse `pulse_beat` 4/6/8; `pulsar_fliprate` 40→10-20 fr; **lethal lane**: pulsing + player in its lane = death | **L60+ only** (or all on hard) |

**Enemy bolts (6-5).** Fire decision (`enm_shoot` :9539): per-frame, gated by player-alive,
along ≥ `$30`, can-shoot bit, `shot_delay` elapsed, not mid-flip, then RNG vs a threshold indexed
by **# live bolts** → P(fire) ≈ 100 / 12.5 / 6.25 / 2.3 / 0.4 % for 0–4 live bolts (self-limiting).
Refire `shot_holdoff` L1 80 fr (1.33 s) → L65+ 10 fr. Bolt travels **straight down its lane**
(no tracking) at `enm_shotspd` ≈ −202/s (L1, outruns flippers); **max 4 concurrent**; kills only the
player **in that lane at the rim**; **shootable**. Bolt glyph `vg_sub_image_enemy_shot_1..4` :5012 —
white pinwheel + red central cross, 4 frames.

> ⚠️ **Honesty flag (6-5):** the literal VER=3 code sets the "can shoot" bit for **Tankers and
> Spikers too** — broader than the common "only Flippers/Pulsars shoot" lore. Unconfirmed without
> running the ROM.
> **Decision (user, 2026-06-27):** match the literal rev-3 code — **Flippers + Tankers + Spikers all
> fire** (when the per-frame gates pass) + **Pulsars @ L60+**; Fuseball never.

**Player pieces.** Claw: rotatable point-vectors graphics 1–8 (`_pv_t3` :14368), `draw_player`
:12954, **yellow**. Player bullet `vg_sub_image_player_shot` :3609 — two concentric dotted octagons,
**+9/fr ≈ 540/s**, max 8 (see 6-2).

**Scoring / spawn (verify vs our difficulty).** Flipper 150 · Pulsar 200 · Tanker 100 · Spiker 50 ·
Fuseball 250/500/750. Mix: flippers-only L1-4; tankers L5+; spikers L5-16; fuseballs L11+; pulsars
L17+; steady L33+ (5F/3P/3T/1S/3Fz). `wave_enemies` released via 64 staggered ~16 fr (0.27 s)
countdowns while in-tube < `max_enm` = 6.
