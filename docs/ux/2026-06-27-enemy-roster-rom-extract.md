> **Caution — this document has been proven wrong on its wave numbers.** It was extracted from a
> third-party disassembly, not from Theurer's original source. Finding **W-035** of the
> [primary-source audit](../2026-07-12-tempest-primary-source-audit.md) shows the ROM's own
> per-wave min/max tables put the first **tanker on wave 3** and the first **spiker on wave 4** —
> not both on level 5, as `rules.ts` currently gates them *citing this document*. The tables are
> also non-monotonic in ways a weight model cannot express (tankers vanish again on wave 4; spikers
> disappear entirely on waves 17–19, 33–34 and 40–42). The "60 Hz" note in the header below is also
> wrong: the ROM runs at **28.44 fps**. Treat every number here as unverified until it is
> re-checked against the primary source.

# Enemy roster — verbatim ROM extract (rev-3 `tempest.a65`, VER=3)

> Raw reverse-engineering extract for Wave 6 stories **6-5** (enemy fire), **6-8** (shapes),
> **6-9** (motion). Source: `enemy-recon` over the verified rev-3 `tempest.a65`. All `file:line`
> cites are exact; 60 Hz. This is the detailed companion to the summary in
> `2026-06-27-tempest-arcade-feel-reference.md` (Enemy roster section) — keep the verbatim
> `pv_draw`/`vldraw` data here for faithful shape reproduction.
>
> **VER=3 note:** none of the mix/speed/fire/pulsar/score tables are version-gated — identical
> across VER 1/2/3.

## 0. Shared mechanics

`enemy_along`: **`$10` = near rim (player) … `$f0` = far**; enemies spawn `#$f0`, climb toward low
along; **`$20`** = near-rim trigger.

**Counts** (l.298-302):
```
n_segments_per_tunnel = 16
n_pending_enemies     = 64
n_enemies_on_screen   = 7
n_player_bullets      = 8
n_enemy_bullets       = 4
```
**Type IDs** (`enemy_movement_style & $07`, l.1582-1588): 0=Flipper 1=Pulsar 2=Tanker 3=Spiker 4=Fuzzball.

**`L028a` flag byte** (verbatim l.1603-1611):
```
; $80 bit set -> moving away from player, clear -> towards
; $40 means the enemy can shoot
; $03 bits determine what happens when enemy gets below $20:
;    $00 = no special action
;    $01 = split into two flippers
;    $02 = split into two pulsars
;    $03 = split into two fuzzballs
```
**Speed encoding:** per-level table byte is **signed**; `crack_speed` (l.6974-6992) sign-extends ×8
→ 16-bit velocity added to `along`. Net ≈ **(byte)/32 along-units/frame**, negative = climbing. ×60 → /sec.

**Movement = per-enemy bytecode VM:** `move_enemies` l.8157; opcode dispatch `L9ba2_t1` l.8241-8282;
programs at `m_origin` l.9185-9363. Opcodes: m_move/m_grow/m_flip_start/m_flip_cont/m_rev/m_chk/
m_spike/m_fuzz/m_touch/m_pulsar/m_setdir/m_chk_pulse.

**Creation `L028a` init** `L9a9d_t2` (verbatim l.8132-8136):
```
L9a9d_t2: .byte $40 ; flipper
          .byte $00 ; pulsar - ORed with pulsar_fire; see L9aac
          .byte $41 ; tanker - not actually used; see L9abb..L9aec
          .byte $40 ; spiker
          .byte $00 ; fuzzball
```
Creation (l.8056-8118): flipper `lda L9a9d_t2`(`$40`); pulsar `lda L9a9d_t2+1; ora pulsar_fire`;
spiker→`$40`; fuzzball→`$00`; tanker `lda tanker_load,y; ora #$40`.

---

## A. Flipper (type 0)

**SHAPE** — `draw_flipper` l.13035-13059 (color `_colidx_red`); flat→graphic 0, mid-flip→runtime
rotation `Lb634`/`Lbdcb`. Graphic-0 point-vector, verbatim l.14355-14365:
```
_pv_t3:
  pv_draw 4, 1
  pv_draw 4, -1
  pv_draw -2, 1
  pv_draw 1, 1
  pv_draw -3, -1
  pv_draw -3, 1
  pv_draw 1, -1
  pv_draw -2, -1
```
8 connected segments, closed (deltas sum 0,0) = symmetric **bowtie/butterfly**, 2 outer V-wings +
central crossing. Open/close + rotation = runtime, no stored frames. **RED.**

**MOTION** — climb = `spd_flipper` (master speed). `spd_flipper_lsb_lvl_tbl` verbatim l.7012-7020:
```
.byte $08,$01,$08,$d4,$fb           ; L1-8 linear: b0=$d4(-44),b1=$fb(-5)
.byte $04,$09,$10,$af,$ac,$ac,$ac,$a8,$a4,$a0,$a0  ; L9-16 list
.byte $08,$11,$19,$af,$fd           ; L17-25
.byte $08,$1a,$20,$9d,$fd           ; L26-32
.byte $08,$21,$27,$94,$fd           ; L33-39
.byte $08,$28,$30,$92,$ff           ; L40-48
.byte $08,$31,$40,$88,$ff           ; L49-64
.byte $0c,$41,$63,$60,$41           ; L65-99 alternates
```
Decoded: **L1 `$d4`=-44 → -1.375/fr ≈ -82.5/s** (224-unit tube ≈ 163 fr ≈ **2.7 s**); L5 -2.0/fr
(-120/s); L9 -2.53/fr; L33 -3.375/fr(-202/s). `p_move` core l.8493-8502:
```
L9c63: lda enemy_along_lsb, x
       clc
       adc spd_flipper_lsb, y
       sta enemy_along_lsb, x
       lda enemy_along, x
       adc spd_flipper_msb, y
       sta enemy_along, x
       cmp player_along        ; reached top?
```
**Flip patterns** (per-level `flipper_move`): `m_l0b` l.9204 = "move 8 ticks then flip"; `m_l19`
l.9220 = "flip constantly, 1 move between"; `m_l24` l.9236 = "flips 2 one way, 3 other, alternating";
`m_l87` l.9348 = "flip away from player, move 4 ticks". A flip: `p_flip_start` l.8790 sets
`enemy_movement_style |= $80` + target angle (`get_angle` l.8864); `p_flip_cont` l.8671 steps angle
±1/call toward target, on match clears `$80` & writes new `enemy_seg` (adjacent lane).
**Rim grab** `p_chk` verbatim l.8765-8775:
```
p_chk: lda enemy_movement_style, x
       bmi ?f33
       lda enemy_seg, x
       cmp player_seg
       bne ?f33
       lda L02cc, x
       cmp player_status
       bne ?f33
       jsr La33a            ; player death
```
**`flip_top_accel`** (rim flip-speed multiplier) l.7184-7187: **L1-32 = 2, L33-99 = 3**.
**FIRE: YES, always.** `L028a=$40`. Primary shooter.

---

## B. Tanker (type 2)

**SHAPE** — `draw_tanker` l.13065-13079 selects by cargo `L028a&$03`; body `L39b4` verbatim
l.4874-4884 (color idx 2, elongated X-diamond/bowtie):
```
L39b4: vstat 12, 2, 1
  vldraw -64, 64, stat
  vldraw 0, -40, stat
  vldraw 64, -24, stat
  vldraw -40, 0, stat
  vsdraw -24, 24, stat
  vsdraw -24, -24, stat
  vldraw 24, 64, stat
  vldraw -64, -64, stat
  vldraw 40, 0, stat ...
```
Cargo emblems prepended: pulsar-tanker l.4628, fuzzball-tanker l.4711, flipper-tanker l.4798 (no
emblem). Graphic table `?t2` l.13076-13079: `$1a,$1a,$4a,$4c`.

**MOTION** — straight up, p-code `m_l_move_up` l.9197-9200: `m_move / m_halt / m_br m_l_move_up`.
`spd_tanker = spd_flipper` (l.6951). **SPLIT** `La06f` l.9111-9179, on reaching `$20` OR on death
(`La398` l.9685 → `La06f`). Cargo→child map verbatim l.9134-9142:
```
lda L028a, y
and #$03
beq ?f6              ; 0 = no split
sec
sbc #$01             ; 1->0 flipper, 2->1 pulsar, 3->(remap)
cmp #$02
bne ?f3
lda #$04             ; 3 -> type 4 fuzzball
```
Spawns **2 children of cargo type in adjacent lanes** (seg-1, seg+1). Cargo from `tanker_load`
(l.7040-7046; defaults `tanker_load[0]=tanker_load[1]=1`).
**FIRE: YES per code** (`L028a = tanker_load|$40`, l.8102-8110). ⚠️ §F.

---

## C. Spiker (type 3)

**SHAPE** — `draw_spiker` l.13083-13093 cycles 4 frames `timectr&3` → graphics `$12/$14/$16/$18`.
`vg_sub_image_spiker_1` verbatim head l.4261-4272:
```
vg_sub_image_spiker_1: vstat 12, 5, 1
  vsdraw 2, -2, stat
  vsdraw -2, -2, stat
  vsdraw -4, 0, stat
  vsdraw -4, 4, stat
  vsdraw 0, 8, stat
  vsdraw 8, 4, stat
  vsdraw 10, -2, stat
  vsdraw 6, -10, stat
  vsdraw -2, -14, stat
  vsdraw -14, -6, stat ...
```
Outward-winding spiral/pinwheel (deltas grow 2→4→…→28/30); 4 frames rotate seed dir 90° (spins).
Color idx 5. **The spike** = dynamic, NOT a stored glyph: `Lc6c7` l.15827-15891 emits one `vldraw`
up the lane, length ∝ `spike_ht[seg]`, capped with a **single white tip dot** (one zero-length
white point — arcade routine `JADOT: VCTR 0,0,CB`; cross-confirmed Hogan 2026 p.288).
[Correction 2026-06-27: an earlier "random 4-dot sparkle" gloss here was unsourced (no code block)
and is superseded — the tip is one white dot, no flicker/randomness.]

**MOTION** — p-code `m_l_spiker` verbatim l.9187-9192:
```
m_l_spiker: m_move / m_grow / m_br_f0 m_l_move_up / m_halt / m_br m_l_spiker
```
`spd_spiker` l.7026-7030: `$0a,$01,$14,$00`(L1-20 = flipper speed), `$0a,$15,$20,$d0`(L21-32 faster),
L33+ faster. **Spike growth** `p_grow` verbatim l.9019-9040:
```
p_grow: lda #$01
  sta pcode_test
  ldy enemy_seg, x
  lda spike_ht, y
  bne ?f1
  lda #$f1
  sta spike_ht, y          ; init at far
?f1: lda enemy_along, x
  cmp spike_ht, y
  bcs ?f2                  ; only extend toward rim:
  sta spike_ht, y          ;   spike_ht = min(along reached)
  lda #$80
  sta L039a, y
?f2: lda enemy_along, x
  cmp #$20
  bcs ?f3
  lda L028a, x
  ora #$80                 ; below $20: reverse (move away)
  sta L028a, x
  lda #$20 ...
```
Growth rate = climb speed. Oscillates ~`$20`↔far; at far end `spiker_hop` l.9069-9107 jumps to
random lane (prefers tallest-spike lane), converts to flipper-holding tanker if none pending.
`spike_ht` lower value = taller spike.
**FIRE: YES per code** (`L028a=$40`, l.8072/8135). ⚠️ §F.

---

## D. Fuseball ("fuzzball", type 4)

**SHAPE** — `vg_sub_image_fuzzball_1` verbatim head l.5592-5605:
```
vg_sub_image_fuzzball_1: vstat 12, 3, 1   ; red group
  vsdraw -8, 12, 14
  vsdraw 10, 12, 14
  vsdraw -12, 4, 14
  vsdraw 12, 8, 14
  vsdraw -4, 12, 14
  vstat 12, 1, 1            ; yellow group
  vsdraw 18, -2, 0
  vsdraw 4, -6, 14 ...
  vstat 12, 5, 1 ... vstat 12, 2, 1 ... vstat 12, 4, 1 (cyan)
```
Chaotic multi-color (red/yellow/cyan) spiky ball-of-legs; legs fully redrawn each of 4 frames
(writhe/flicker). `draw_fuzzball` l.13180-13228 interpolates position between lane endpoints (rides rim).

**MOTION** — `p_fuzz` l.8884-8971. **`spd_fuzzball = 2×spd_flipper`** verbatim l.6957-6962:
```
lda spd_flipper_lsb / asl a / sta spd_fuzzball_lsb
lda spd_flipper_msb / rol a / sta spd_fuzzball_msb
```
Fastest climber (L1 -2.75/fr, -165/s). Lateral rim movement gated by `fuzz_move_flg`/`fuzz_move_prb`
(l.7148-7159) + `pokey2_rand` (verbatim l.8951-8958):
```
?f13: lda enemy_along, x
  and #$20
  beq ?f15
  lda pokey2_rand
  cmp fuzz_move_prb
  bcc ?f15           ; prob-gated sideways step
```
Moves toward player via `L9f81` / `L9f8a` (random dir). **KILL RULE** `La463` verbatim l.9866-9877:
```
cpy #$04                 ; fuzzball?
bne ?f7
ldy L38
lda enm_shotpos, y       ; enemy_along-4
cmp player_along
beq ?f6
lda ply_shotseg, x
cmp enm_shotseg, y       ; same lane?
bne ?f6
lda L02cc - 4, y
bpl ?f6                  ; only killable when L02cc bit7 SET (on a lane)
jsr La309                ; kill
```
**Killable only on a lane in vulnerable phase — NOT while rolling on rim.** `hit_tol[4]=6` (l.6963-6964,
wider). Score 250/500/750.
**FIRE: NO.** `L028a=$00`. Never fires.

---

## E. Pulsar (type 1)

**SHAPE** — `draw_pulsar` l.13257-13302. TWO pulse anims off `pulsing`: color cyan↔white; jaggedness
`(pulsing+$40)>>4` clamp 0-4 → graphics `?dp_t1` verbatim l.13295-13300 `.byte $0d,$0c,$0b,$0a,$09,$09`.
Shape variants `_pv_offset_9..13` verbatim l.14467-14508:
```
; variant 1 (graphic 9) sharpest
  pv_draw 2,-3 / pv_draw 1,6 / pv_draw 1,-6 / pv_draw 1,6 / pv_draw 1,-6 / pv_draw 2,3
; ... amplitude shrinks each variant ...
; variant 5 (graphic 13) flat
  pv_move 1,0 / pv_draw 6,0
```
Horizontal zig-zag/lightning bar; flattens & re-sharpens in sync with white/cyan strobe.

**MOTION** — appears **L17+**. p-code `m_l_pulsar` verbatim l.9324-9343:
```
m_l_pulsar: m_ldm pulsar_fliprate
m_l74: m_pulsar / m_halt / m_dec_bnz m_l74
m_l78: m_chk_pulse / m_br_f0 m_l7f / m_pulsar / m_halt / m_br m_l78
m_l7f: m_setdir / m_flip_start ...
```
`p_pulsar` l.8542-8551: flipper speed when farther than `L0157`, pulsar speed when nearer.
**`spd_pulsar` hardcoded `$fea0`** (l.6965-6968) = const -82.5/s. **Pulse:** `pulsing` integrated by
`pulse_beat` (`L9b56` l.8190-8228); `pulse_beat_lvl_tbl` l.7035-7038: **L1-48=4, L49-64=6, L65-99=8**.
`pulsar_fliprate_lvl_tbl` l.7140-7145: **L17=`$28`(40fr/0.67s), L18=`$14`(20fr), L19-32 alt 20/40,
L40+ alt 20/10fr**. **LETHAL LANE** `p_pulsar` verbatim l.8569-8581:
```
?f14: lda pulsing
  bmi ?f15
  lda enemy_along, x
  cmp L0157
  bcs ?f15            ; must be within L0157 of rim
  lda player_seg
  cmp enemy_seg, x
  bne ?f15            ; player must be in pulsar's lane
  lda player_status
  cmp L02cc, x
  bne ?f15
  jsr pieces_death    ; kill player
```
`L0157_lvl_tbl` l.7031-7034: `$a0` (L1-64), `$c0` (L65+).
**FIRE: CONDITIONAL** — `pulsar_fire_lvl_tbl` verbatim l.7190-7192: `.byte $02,$3c,$63,$40` = enabled
only **L60-99** (or ALL levels on HARD via `L937a` l.6934).

---

## F. ⭐ Enemy fire / bolts

**Who fires** — gate `L028a & $40` (l.1605): **Flipper always, Tanker always, Spiker always,
Pulsar L60+/hard only, Fuseball never.**

> ⚠️ **Honesty flag:** VER=3 code literally sets the can-shoot bit for tankers & spikers too
> (creation l.8056-8136, gate l.9548) — broader than the common "only flippers/pulsars shoot" lore.
> Unconfirmed without running the ROM.
> **Decision (user, 2026-06-27):** match the literal code — Flippers + Tankers + Spikers all fire +
> Pulsars @ L60+; Fuseball never.
>
> 🚩 **RE-FLAGGED 2026-06-27 (cross-source — STILL OPEN).** A second independent disassembly,
> Hogan 2026 (*Tempest vs Tempest*, p.272), documents the same flag byte as `INVAC2`
> (bit7 = direction, bit6 = fire, low-2 = carrier type) — **layout agrees** — but its tabulated
> values **disagree on who fires**: the **flipper-carrier tanker = `10000001` → fire bit CLEAR
> (no fire)**; only the **pulsar** (`11000010`) and **fuse** (`01000011`) carriers fire; the plain
> `00000000` enemy also shows fire bit clear. That points the *opposite* way from the rev-3 reading
> here (tanker `L028a = tanker_load|$40` → fire bit always set) and actually leans toward the narrower
> "only some enemies shoot" lore. **Two disassemblies now conflict on whether flipper-tankers (and
> basic enemies) fire — UNRESOLVED without running the ROM.** The user decision above (match literal
> rev-3) still stands as the implementation choice, but **tanker/spiker fire is a live verification
> item**, not settled fact. Cross-ref: `sprint/context/context-story-6-9.md` → Reference Notes.

**Decision routine `enm_shoot` verbatim l.9539-9592:**
```
enm_shoot: lda player_status
  bmi ?f5                  ; no fire while dead/warping
  ldx #$06                 ; loop 7 enemy slots
?b1: lda enemy_along, x
  beq ?f4                  ; empty slot
  cmp #$30
  bcc ?f4                  ; must be deeper than $30
  lda L028a, x
  and #$40
  beq ?f4                  ; can-shoot bit
  dec shot_delay, x
  bpl ?f4                  ; per-enemy holdoff still counting
  inc shot_delay, x
  lda enemy_movement_style, x
  and #$80
  bne ?f4                  ; not while mid-flip
  lda pokey1_rand          ; <-- RNG
  ldy enm_shotcnt
  cmp ?t1, y               ; threshold by #live bolts
  bcc ?f4                  ; random < threshold -> no fire
;spawn:
  ldy enm_shotmax
?b2: lda enm_shotpos, y
  bne ?f3
  lda enemy_along, x
  sta enm_shotpos, y       ; bolt at enemy along
  lda enemy_seg, x
  sta enm_shotseg, y       ; bolt in enemy lane (no tracking)
  lda L02cc, x
  sta L02c8, y
  lda shot_holdoff
  sta shot_delay, x        ; reset refire timer
  jsr sound_enemy_fire
  inc enm_shotcnt ...
?t1: .byte $00,$e0,$f0,$fa,$ff   ; (l.9587-9592)
```
**P(fire) by #bolts already live** = (256−threshold)/256: **0→~100%, 1→12.5%, 2→6.25%, 3→2.3%,
4→0.4%** (self-limiting).
**Refire `shot_holdoff_lvl_tbl` l.7000-7003:** `$08,$01,$14,$50,$fd` = **L1=80fr(1.33s), −3/lvl →
L20=23fr; L21-64=20fr(0.33s); L65+=10fr(0.17s)**.
**Max concurrent `enm_shotmax_lvl_tbl` l.7006-7009:** L1-3=1, L4=2, L5=3, L6-9 mixed, L10-64=2, L65+=3
(slots = enm_shotmax+1; hard cap **n_enemy_bullets=4**).
**Bolt speed `enm_shotspd_lsb_lvl_tbl` l.7022:** `$0a,$01,$63,$c0` → **L1 `$94`=-108 → -3.375/fr ≈
-202/s** (outruns flippers); scales with flipper speed.
**Bolt→player `La1e4` verbatim l.9427-9435:**
```
La1e4: lda player_seg
  cmp ply_shotseg, x       ; player in bolt's lane?
  bne ?f1
  lda player_status
  bmi ?f1
  jsr La34b
  lda #$81
  sta player_status        ; $81 = hit by enemy shot
```
**Kills only if player in bolt's lane when it reaches rim. Dodge = leave lane.** Bolt seg fixed at
spawn (no tracking). **Bolts are shootable:** `La463` l.9846-9853 → `La36f` l.9661 destroys (tolerance `La7`).
**Bolt shape** `vg_sub_image_enemy_shot_1` verbatim head l.5012-5024:
```
vg_sub_image_enemy_shot_1: vstat 12, 0, 1   ; white pinwheel
  vldraw -11, 11, 0
  vsdraw -6, 6, 12
  vsdraw 0, -28, 0 ... (4 corner hooks)
  vstat 12, 3, 1            ; red central cross
  vldraw 0, 0, 12 / vsdraw -12, 0, 0 ...
```
4 spin frames (`vg_sub_image_enemy_shot_1..4` l.5012-5245). White outer pinwheel + red 4-dot cross.

---

## G. Player pieces

**Claw:** rotatable point-vectors graphics 1-8 (`_pv_t3` l.14368-14463), `draw_player` l.12954-12972,
color `_colidx_player` (yellow). Starburst icon `vg_sub_image_player_nominal` l.2982-3017 = lives-display only.
**Player bullet:** `vg_sub_image_player_shot` l.3609-3646 = 2 concentric dotted octagon rings.
Speed verbatim l.9380 `adc #9` = **+9 along/fr ≈ 540/s** (slows -4 near spikes via L02f2). Max 8.
**Spike:** dynamic line (§C). **Enemy bolt:** §F.

---

## H. Scoring / spawn / difficulty

**Scores** `?enemy_score` l.16817-16839 ("0 150 200 100 50 250 500 750"), type→idx `?t1` l.9706-9713:
**Flipper 150, Pulsar 200, Tanker 100, Spiker 50, Fuseball 250/500/750** (random `La309` l.9595-9621).
**Mix per level:** flippers-only L1-4; tankers L5+; spikers L5-16; fuseballs L11+; pulsars L17+;
steady L33+ = 5 flippers / 3 pulsars / 3 tankers / 1 spiker / 3 fuseballs. Tables: flippers l.7078-7090,
pulsars l.7112-7121, tankers l.7093-7109, spikers l.7049-7075 (⚠️ source flags suspected `$35` bug
l.7066-7072), fuzzballs l.7124-7137.
**Spawn cadence:** `wave_enemies` l.7174-7181 (L1=10, L2=12, L3=15, L4=17, L5=20…) → `enemies_pending`;
released via 64 staggered countdowns (`reset_pending_enemy_timers` l.6632-6662) ≈ **new enemy every
~16 fr (~0.27 s)**, only while `enemies_in+enemies_top < max_enm` (`create_enemies` l.7703-7806).
`max_enm_lvl_tbl` l.7162 = **6** all levels. Color cycle per 16-lvl block `Lc1fd` l.14899-14911.
Level randomized 65-96 past L99.

---

## Cheat-sheet (VER=3, 60 Hz)

flipper L1 -1.375/fr (-82.5/s) → L33 -3.375/fr · fuseball = 2× flipper (-165/s @ L1) · pulsar const
-82.5/s · bolt L1 -3.375/fr (-202/s) · player shot +9/fr (540/s). flip_top_accel 2→3 · pulse_beat
4/6/8 · pulsar_fliprate 40fr → 10-20fr · shot_holdoff 80→23→20→10fr · enm bolts 2-4 (cap 4) ·
P(fire) 100/12.5/6.25/2.3/0.4% · pulsars fire L60+ · fuseballs never fire & killable only on-lane
(`L02cc` bit7), hit_tol 6 · `L0157` proximity `$a0`/`$c0` · trigger point `$20`.
