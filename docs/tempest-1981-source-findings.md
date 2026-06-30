# Tempest (1981) — source-code findings from *Tempest vs Tempest*

**Source:** `docs/TempestVsTempest_release.pdf` — *"Tempest vs Tempest: Notes on the
Source Code of Two Video Games"* by Rob Hogan (©2026, CC BY-NC-SA 3.0).
**Scope:** The book interleaves a chapter-by-chapter reverse-engineering of David
Theurer's original **1981 arcade Tempest** (6502 assembly, Atari "Quadrascan"/AVG vector
hardware) with the 1994 Jaguar **Tempest 2000** (Motorola 68K). **This document captures
only the 1981 findings** — every Tempest 2000 / Jaguar / 68K chapter was deliberately
excluded per request (see the *Chapter coverage* table for the full accounting).

**How this was produced:** the 330-page PDF was read end-to-end by parallel extraction
agents, one per page range; each pulled the 1981 facts (labels, addresses, constants,
algorithms) and skipped the Jaguar material. Every seam chapter was classified
identically by the two agents whose ranges overlapped it.

**Relationship to our other docs:** this is the *book-sourced companion* to the
disassembly-sourced docs already in the repo, which it confirms and extends:
- `docs/ux/2026-06-27-tempest-geometry-rom-survey.md` (level geometry)
- `docs/ux/2026-06-27-enemy-roster-rom-extract.md` (enemy shapes/behaviour)
- `docs/ux/2026-06-27-tempest-arcade-feel-reference.md` (feel constants)
- `docs/ux/2026-06-28-pokey-sfx-rom-map.md` (sound table)

Those docs are keyed to the labelled disassembly `charlesUnixPro/Tempest-Source-Code`
(`tempest.a65`) and the verified rev-3 ROM. The book uses the **original Atari source
file/label names** (`ALWELG.MAC`, `MAINLN`, `ROUTAD`, `VGMSGA`, …), which differ in
spelling from `tempest.a65` but describe the same machine. Where the book and our
existing docs overlap, they agree.

> ⚠️ **Transcription caveats.** The book reproduces hand-typed 6502 listings as images;
> a handful of operands are OCR/typo artifacts. Every spot the agents flagged as
> suspect is marked **⚠︎** inline. Treat the *labels and structure* as authoritative and
> re-verify any single magic number against `tempest.a65` / the ROM before baking it in.

---

## Chapter coverage

| Book chapter | Game | Captured here | Maps to (our code) |
|---|---|---|---|
| how to make tempest in 1981 | **1981** | §1 | (reference/build) |
| building tempest 2000 in 1994 | 2000 | — skipped | — |
| mainline | **1981** | §2 | `core/sim.ts`, `state.ts`, `rules.ts` |
| mainloop | 2000 | — skipped | — |
| approaching logo process | **1981** | §5 | `shell/render.ts` (attract/logo) |
| cry if i want to | 2000 | — skipped | — |
| tracing the beam | **1981** | §3 | `shell/render.ts`, `core/modelView.ts` |
| what is blitting | 2000 | — skipped | — |
| copyright atari | **1981** | §16 | (historical) |
| character assassination | 2000 | — skipped | — |
| macro language fun | **1981** | §4 | `shell/font.ts`, `glyphs.ts` |
| my first shader | 2000 | — skipped | — |
| tempest program bug | **1981** | §16 | (historical) |
| strings of tempest 2000 | 2000 | — skipped | — |
| strings of tempest | **1981** | §4 | `shell/font.ts` |
| unused stars | 2000 | — skipped | — |
| star planes | **1981** | §7 | `shell/fx.ts` / render |
| object list | 2000 | — skipped | — |
| wells | **1981** | §6 | `core/geometry.ts` |
| webs | 2000 | — skipped | — |
| cursors | **1981** | §8 | `core/state.ts`, render |
| claws | 2000 | — skipped | — |
| attract mode admin | **1981** | §14 | (attract AI) |
| auto | 2000 | — skipped | — |
| more claws | 2000 | — skipped | — |
| flipper | **1981** | §10 | `core/enemies/flipper.ts` |
| flipper 2000 | 2000 | — skipped | — |
| explosions one to four | **1981** | §13 | `shell/fx.ts` |
| meltovision | 2000 | — skipped | — |
| splat control | **1981** | §13 | `shell/fx.ts` |
| ouch | 2000 | — skipped | — |
| tanker detail | **1981** | §10 | `core/enemies/tanker.ts` |
| even more tanker detail | 2000 | — skipped | — |
| bullet | 2000 | — skipped | — |
| things hidden | **1981** | §17 | (cut content) |
| jump | 2000 | — skipped | — |
| player charges | **1981** | §9 | `core/rules.ts`, `sim.ts` |
| activeobjects | 2000 | — skipped | — |
| superzap | **1981** | §12 | `core/rules.ts` |
| game over | 2000 | — skipped | — |
| spikes | **1981** | §11 | `core/enemies/spiker.ts` |
| rotary club | 2000* | §18 (1 fact) | `core/input.ts`, `shell/input.ts` |
| space game reenactment society | **1981** | §17 | (cut content) |
| sexy yes | 2000 | — skipped | — |
| story of a beep | **1981** | §15 | `shell/audio.ts`, `audio-dispatch.ts` |
| play us a tune pal | 2000 | — skipped | — |
| unused explosions | **1981** | §17 | (unused sounds) |
| ntsc pal | 2000 | — skipped | — |

\* *"rotary club" is a Tempest 2000 chapter; it only mentions the 1981 spinner in passing.*

---

## §1 · Build, toolchain & ROM layout
*(ch. how to make tempest in 1981)*

- Original working title: **"Alien Well Game"** — every source file is prefixed `AL`
  ("Alien"). Programmer **Dave Theurer**; project leader **Morgan Hoff**; project
  **#26903**; build manifest **17-12-1981**, version **"2A ALT"**.
- Toolchain (historical): coding sheets → DEC **PDP-11** → assembled with **MAC65**
  (v3.09+) → linked with **LINKM/RMAC** → debugged via a FORTH "blue box".
- **Source files** (`.MAC`, decoded purpose):
  - `ALWELG` — main (Alien Well Game) · `ALSCOR`/`ALSCO2` — scores · `ALDISP`/`ALDIS2`
    — display · `ALEXEC` — executive · `ALSOUN` — **sound** · `ALVROM` — **vector ROM
    data** (shapes) · `ALLANG` — language pack · `ALCOIN`/`COIN65` — coin · `ALHARD`/
    `ALHAR2` — IRQ handler · `ALTEST`/`ALTES2` — self-test · `ALEARO` — EAROM · `ALVGUT`
    — vector-generator utilities · `ALCOMN` — common · plus `HLL65`, `VGMC`, `ANVGAN`.
- **ROM/address map** (all 2532 4Kx8 PROMs):

  | Part `136002-` | Contents | CPU addr |
  |---|---|---|
  | 138 | Vector ROM (shape data) | `$3000` |
  | 237 | program | `$9000` |
  | 136 | program | `$A000` |
  | 235 | program | `$B000` |
  | 13x | program | `$C000` |
  | 133 | program (+ self-test) | `$D000` |

  (Matches our gitignored `docs/rom/` set; `136002-136.lm1` loads at `$A000`/`$C000` per
  the POKEY map doc.)

---

## §2 · Game loop & state machine
*(ch. mainline)* → compare `core/sim.ts`, `core/state.ts`, `core/rules.ts`

**The frame loop (`MAINLN`).** Init then an infinite loop gated by a frame timer:

```
MAINLN: JSR INISOU              ; init sounds
        LDA I,CNEWGA / STA QSTATE   ; initial state = new game
loop:   LDA FRTIMR / CMP I,9 / CSEND ; spin until FRTIMR == 9
        LDA I,0 / STA FRTIMR        ; reset frame timer
        JSR EXSTAT              ; run current game state
        JSR NONSTA             ; non-state-dependent code
        JSR DISPLA             ; build the vector display list
        CLC / CSEND            ; loop forever
```

- **`FRTIMR`** is incremented by the IRQ handler at up to **60 Hz**; the main loop runs
  the game body once `FRTIMR` reaches **9**. **`9` is the master speed knob.** `$0F`(15)
  noticeably slows; `$1F`(31) is an unplayable crawl. → *Our sim is fixed-step 60 Hz; this
  is the authentic cadence.*

**State machine (`EXSTAT` → `ROUTAD`).** `EXSTAT` always runs the starfield
(`PRSTAR`, unless free-play attract), then dispatches on **`QSTATE`** through a
`.WORD label-1` jump table pushed onto the stack and reached via `RTS`.

`ROUTAD` table (state index → routine):

| `QSTATE` | routine | meaning |
|---|---|---|
| 0 | `NEWGAM` | new game |
| 1 | `NEWLIF` | new life (after losing a base) |
| 2 | `PLAY` | play |
| 3 | `ENDLIF` | life lost |
| 4 | `ENDGAM` | end of game |
| 5 | `PAUSE` | pause |
| 6 | (0) | new wave (after clearing) |
| 7 | `ENDWAV` | end of wave |
| 8 | `HISCHK` | check for hi scores |
| 9 | `GETINI` | get hi-score initials |
| 10 | `DLADR` | display hi-score table |
| 11 | `PRORAT` | request player rate |
| 12 | `NEWAV2` | new wave part 2 |
| 13 | `LOGINI` | logo init |
| 14 | `INIRAT` | monster delay/display |
| 15 | `NEWLF2` | new life part 2 |
| 16 | `PLDROP` | drop mode |
| 17 | `SYSTEM` | end-wave cleanup after bonus |
| 18 | `PRBOOM` | boom |

State constants seen: `CNEWGA` (new game), **`CREQRAT` = `$16`** (request-rate → `PRORAT`).

**`PLAY` per-frame update order** (order is deliberate: player → enemies → collisions →
status). → *This is the canonical tick order to mirror in `sim.ts`.*

```
JSR MOVCUR   ; move cursor (player) / read spinner
JSR FIREPC   ; fire player charge
JSR PROSUZ   ; process super-zap
JSR MOVNYM   ; move nymphs       (released enemies climbing the rim)
JSR MOVINV   ; move invaders
JSR MOVCHA   ; move charges (bullets)
JSR FIREIC   ; fire invader charge
JSR COLLIS   ; collision detect
JSR PROEXP   ; process explosions
JMP ANALYZ   ; analyse player status
```

**`DISPLA` builds the vector display list** (order *not* significant). Per object type:
`LDA I,<BCxxxx>` → `JSR SBCLOG` → `JSR <DSPxxx>` → `LDA I,<BCxxxx>` → `JSR SBCSWI`
(`SBCLOG`/`SBCSWI` = display-list header/footer). Object draw order: cursor (`DSPCUR`),
charges (`DSPCHG`), invaders (`DSPINV`), explosions (`DSPEXP`), nymphs (`DSPNYM`), info/
scores (`INFO`), well (`DSPWEL`), enemy lines/spikes (`DSPENL`), star field (`DSTARF`).

**`NEWGAM` accounting:** init lives per player from setting **`LVSGAM`** into `LIVES1`
(player-2 `LIVES2`=0 for 1-player); force each `WAVEN1`= -1 (request-rate); set
`PLAGRO` (starfield flag) and induce the "PLAY PLAYER 1" message; clear scores if attract.

**Key state variables** (zero page, first nine "Control & Timing" bytes — see §16 for the
exact addresses):
`QSTATE`($00), `QDSTATE`($01), `QNXTSTA`($02), `QFRAME`($03, frame counter, wraps `$FF`),
`QTMPAUS`($04), `QSTATUS`($05, status/attract flags), `$$CRDT`($06, credits),
`$INTCT`($07), `$COINA`($08). Also `LIVES1/2`, `LVSGAM`, `WAVEN1`(per-game wave),
`CURWAV`(current wave), `NUMPLA`(#players), `PLAYUP`, `NEWPLA`, `PLAGRO`(starfield active),
`SWFINA`/`MFAKE`(must-process flag), `INOPO`(input options), `FRTIMR`(frame timer).

---

## §3 · The Analog Vector Generator (AVG) & the `VCTR` macro
*(ch. tracing the beam, things hidden)* → compare `shell/render.ts`, `core/modelView.ts`

The AVG draws lines, not pixels. Programs are 2-byte opcodes (some 4-byte). Full opcode
set (high nibble of first byte):

| Op | Meaning | Bit layout |
|---|---|---|
| `0`/`1` | Draw relative vector (long, 4 bytes) | `000Y YYYY YYYY YYYY · III X XXXX XXXX XXXX` |
| `2` | Halt | `0x2000` |
| `4`/`5` | Draw **short** relative vector (2 bytes) | `010Y YYYY · III X XXXX` |
| `6` | New color / intensity | `0110 URGB · IIII IIII` |
| `7` | New scale | `0111 USSS · SSSS SSSS` |
| `8` | Center beam | `0x8000` |
| `A`/`B` | Jump to subroutine | `101A AAAA AAAA AAAA` |
| `C` | Return from subroutine | `0xC000` |
| `E`/`F` | Jump to address | `111A AAAA AAAA AAAA` |

- **Coordinates are two's-complement**; the sign appears in the high nibble (long form:
  `4`=+Y, `5`=−Y for short form). Nibble sign map: `-1=F … -8=8 … -9=7`; `1..9 = 1..9`.
- **Color opcode** in practice is `0x68_`; low nibble selects color (see §5/§13 palette).
  `IIIIIIII` byte = intensity.
- **Short vectors halve X resolution** (`DX/2`), so they're used only where the loss is
  invisible. Short form fits when the deltas are small and `(combined & $0FFE1)==0`.

**The `VCTR DX,DY,ZZ` macro** (written by **Ed Logg, 1979**; `ZZ` = intensity 0–7, 0=off,
7=brightest). It converts negatives to two's complement and emits **either**:
- short: `.WORD $4000 + ZZ*$20 + (DX/2 & $1F) + (DY*$80 & $1F00)`, **or**
- long (4 bytes): `.WORD DY & $1FFF, (ZZ*$2000) + (DX & $1FFF)`.

> ⚠︎ The "tracing the beam" chapter describes coords as **two's complement**; the
> "things hidden" chapter's worked `CALVEC -1,-3 → .WORD 1FFD,1FFF` example describes the
> 13-bit axis fields as **one's complement**. Both reproduce the same encoder; re-derive
> from the macro formula above rather than trusting the prose word.

Our renderer works in float model-space, so the takeaway is structural: **shapes are
chains of relative deltas with a per-segment on/off (intensity) flag**, drawn from a start
point and (for closed shapes) summing back to the origin.

---

## §4 · Vector font, glyphs & on-screen messages
*(ch. macro language fun, strings of tempest)* → compare `shell/font.ts`, `shell/glyphs.ts`

- **`ASCVG`** ("ASCii Vector Generator", by Rich Moore) turns a string into one offset
  byte per char, indexing the **`VGMSGA`** ("Vector Generator MeSsaGe Alphabet") table.
  Char→offset:
  - space (`$20`) → `0`
  - `A`–`Z` (char > `$40`) → `char − $36`
  - digits/punct (char ≤ `$40`) → `char − $2F`
  - then `offset *= 2`; the **last char is OR'd with `$80`** to flag string end.
  - Example `ATARI` → `16, 3C, 16, 38, A6` (A=`16`,T=`3C`,R=`38`,I=`26`|`80`=`A6`).
    ⚠︎ an inline listing on the page misprints these as `36,1C,…`; the table value
    `16,3C,16,38,A6` is correct.
- **`VGMSGA`** maps each offset to a per-glyph draw routine `CHAR.x` (a `JSRL CHAR.x`).
  Glyph offsets (×2): `.`=`00`, `0`=`02` … `9`=`14`, `A`=`16`, `B`=`18` … `Z`=`48`.
  Glyphs are `VCTR dx,dy,intensity` chains (`.BRITE`=lit, `0`=blank move) ending `RTSL`,
  on a **~16-wide × 24-tall** cell. Verbatim examples:
  - `CHAR.A`: `0,16,B · 8,8,B · 8,-8,B · 0,-16,B · -16,8,0 · 16,0,B · 8,-8,0 · RTSL`
  - `CHAR.T`: `8,0,0 · 0,24,B · -8,0,B · 16,0,B · 8,-24,0 · RTSL`
  - `CHAR.R`: `0,24,B · 16,0,B · 0,-12,B · -16,0,B · 4,0,0 · 12,-12,B · 8,0,0 · RTSL`
  - `CHAR.I`: `16,0,B · -8,0,0 · 0,24,B · 8,0,0 · -16,0,B · 24,-24,0 · RTSL`
- **`ASCVH`** = `ASCVG` + a horizontal-position byte. 1 arg → auto-center
  (`pos = -(strlen*3)`); 2 args → explicit position byte then string.
- **`MESS name,COLOUR,SCALE,Y`** macro builds one entry in *all four* language tables plus
  the shared **`MSGLABS`** metadata, and defines a global `M<name>` message index (+2
  each). `MSGLABS` packs **color in high nibble (×$10) OR scale in low nibble**, then a Y
  byte. Scale is **0 or 1** only.
- **Localization:** English/French/German/Spanish, tables `ENGMSG`/`FREMSG`/`GERMSG`/
  `SPAMSG`. Most entries are pure vector data, so many labels (e.g. the © line) resolve to
  one shared address.

**Complete message table** (`MESS name,color,scale,Y ; meaning`):

| name | color | scale | Y | text |
|---|---|---|---|---|
| GAMOV | GREEN | 1 | `56` | GAME OVER |
| PLAYR | WHITE | 0 | `1A` | PLAYER (big) |
| PLYR2 | WHITE | 1 | `20` | PLAYER (normal) |
| PRESS | RED | 1 | `56` | PRESS START |
| PLAY | WHITE | 1 | `38` | PLAY |
| ENTER | RED | 1 | `0B0` | ENTER |
| PRMOV | TURQOI | 1 | `0` | SPIN |
| PRFIR | YELLOW | 1 | `-10` | PRESS FIRE TO SELECT |
| HIGHS | RED | 0 | `38` | HIGH SCORES (horiz `$BC`) |
| RANK | RED | 1 | `-50` | RANK |
| RATE | GREEN | 1 | `10` | RATE YOURSELF |
| NOVIC | RED | 1 | `-30` | NOVICE (horiz `$AA`) |
| EXPER | RED | 1 | `-30` | EXPERT (horiz `$4A`) |
| BONUS | GREEN | 1 | `-70` | BONUS |
| TIME | GREEN | 1 | `98` | TIME |
| LEVEL | GREEN | 1 | `-40` | LEVEL |
| HOLE | GREEN | 1 | `-55` | HOLE (horiz `$8B`) |
| INSER | RED | 1 | `56` | INSERT COINS |
| CMODE | GREEN | 1 | `80` | FREE PLAY |
| CMOD1 | GREEN | 1 | `80` | 1 COIN 2 PLAYS |
| CMOD2 | GREEN | 1 | `80` | 1 COIN 1 PLAY |
| CMOD3 | GREEN | 1 | `80` | 2 COINS 1 PLAY |
| ATARI | BLULET | 1 | `92` | © MCMLXXX ATARI |
| CREDI | GREEN | 1 | `80` | CREDITS |
| BONPT | RED | 1 | `0B0` | BONUS PTS |
| 2GAME | GREEN | 1 | `89` | 2 CREDIT MINIMUM |
| BOLIF | TURQOI | 1 | `89` | BONUS EVERY (horiz `$C8`) |
| SPIKE | WHITE | 0 | `0` | AVOID SPIKES (horiz `-72`) |
| APROA | BLULET | 1 | `5A` | APPROACH |
| SUPZA | BLULET | 1 | `0A0` | SUPERZAPPER RECHARGE |

Colors used: GREEN, WHITE, RED, TURQOI(se), YELLOW, BLULET(blue). → *Cross-check our
HUD/message strings, colors, Y positions and the "AVOID SPIKES"/"SUPERZAPPER RECHARGE"
banners against this list.*

---

## §5 · Title logo & attract visuals
*(ch. approaching logo process)* → compare `shell/render.ts` (attract/title)

- The **TEMPEST** title is hand-coded vector subroutines for the five distinct letters
  **T, E, M, P, S** (`VCTR dx,dy,intensity`; `CB`=bright, `0`=blank; `RTSL` ends). Example:
  - `T:` `0,80,CB · -50,0,0 · 0A0,0,CB`
  - `M:` `-20,0,CB · 30,80,CB · 10,0,CB · 20,-58,CB · 20,58,CB · 10,0,CB · 30,-80,CB · -20,0,CB · RTSL`
- **`VORLIT`** draws the whole word (blank-moves between letters, `JSRL`/`JMPL` to each).
- **`SCARNG`** ("logo rainbow builder") draws the title **19 times** at increasing depth,
  each pass a different color → the iconic approaching-rainbow effect.
  - `INDEX1` = per-pass distance, from `NEARY` to `FARY`, **+2 each pass**.
  - **Scale per pass:** linear scale `= (INDEX1<<2) & $7F`; binary scale `= INDEX1>>5`.
  - **Color per pass:** nearest pass = WHITE; else `(INDEX1>>3) & 7`; if that == 7 (black)
    use RED. Color command byte = `$68`.
- **`LOGPRO`** advances the rainbow toward the viewer each frame: `NEARY` floors at
  **`$30`(48)**, `FARY` ceils at **`$80`(128)** and is clamped ≥ `NEARY`.
- **Palette / color index** (low nibble of `$680n`):
  `0`=White, `1`=Yellow, `2`=Magenta, `3`=Red, `4`=Cyan, `5`=Green.
  (Title scale→color: `220`→White, `228/230/238`→Yellow, `240–258`→Magenta,
  `260–278`→Red, `300–318`→Cyan, `320–330`→Green.)

---

## §6 · Level geometry — wells / the tube
*(ch. wells)* → compare `core/geometry.ts` (and `docs/ux/…geometry-rom-survey.md`)

- A well is stored as **16 vertices in two parallel byte tables** — X in **`NEWLIX`**, Y
  in **`NEWLIZ`** (Y is depth in Tempest's coord naming; these are the *face* coords).
  Worked example — the **HEART** well:
  - X (dec): `218,164,135,128,121,92,38,16, 16,32,72,128,184,224,240,240`
  - Y (dec): `228,232,183,128,183,232,228,178, 122,71,32,16,32,71,122,178`
- **`DSPHOL`** ("draw well shape") converts the vertex list to **relative** vectors: for
  each vertex, delta = current − previous (`PXL`=last X, `PYL`=last Y), emit via
  `VGVTR1`. So the tube outline is drawn as a closed delta chain, exactly like our
  geometry's per-segment representation.
- 16-vertex count matches the **16-lane** tube used everywhere else (see §11 spikes:
  `(INDEX2+1) AND $0F`). → *Confirms our 16-segment well model; the book's `wells` chapter
  is the 1981 counterpart to the Jaguar `webs` chapter (skipped).*

---

## §7 · Starfield (between-level dive)
*(ch. star planes)* → compare `shell/fx.ts` / render (warp/dive effect)

- **`NPLANE = 8`** layered planes. **`PLANEY: .BLKB NPLANE`** holds each plane's **Z
  (depth)**; `0` = inactive. (Named `PLANEY` but stores Z; Y is depth in Tempest coords.)
- **4 star pictures** `MSTAR1..4` (each an `ICVEC` + list of `SCDOT x,y` + `RTSL`), reused
  twice to make 8 layers. (Dot coordinate lists captured verbatim in the agent notes;
  several operands like `0C/2C/4C` are ⚠︎ OCR-suspect.)
- **`DSTARF`** (draw): skip if `PLAGRO==0`; for each active plane set depth from `PLANEY`,
  X/Y center = **`$80`(128)**, color = **BLUE**, pick picture via `INDEX1 & 3` into the
  `PTSTR1` pointer table.
- **`PRSTAR`** (advance): per active plane **step Z by −7** each frame; retire when it
  crosses **`$10`(16)**; while "growing" (`PLAGRO` bit 7 set) restart a retired plane at
  **`$F0`(240)**; spawn the *next* plane once the previous reaches **`$D5`(213)**.
- **`PLAGRO` semantics:** nonzero = field drawing; **bit-7 set (negative) = still
  growing** (keeps spawning at the back); clearing the sign bit stops growth so planes
  drain off the front. Turn off entirely by storing any value with bit-7 clear (e.g. `1`).
- **Magic numbers:** 8 planes · center `$80` · spawn Z `$F0` · step `−7` · spawn-next
  `$D5` · retire `$10` · color BLUE.

---

## §8 · Player ship ("cursor" / claw)
*(ch. cursors)* → compare `core/state.ts` (player), render

- The source calls the player ship the **`CURSOR`**. There are **8 cursor shapes
  `NCRS1`–`NCRS8`**, one per roll orientation as the claw sits in different lanes; each is
  a `VEC x,y` delta chain delimited `NCRSnS:` … `NCRSnE:`, drawn from origin (0,0).
- `NCRS1`–`NCRS7` are 8-vector variants of the same claw, differing mainly in the first
  two vectors (apex shifts progressively); **`NCRS8`** is a distinct 9-vector
  near-sideways orientation. Verbatim deltas (start variants):
  - `NCRS1`: `0,-2 · 2,-1 · 3,4 · -3,-3 · -1,0 · 0,2 · 2,1 · -3,-1`
  - `NCRS4`: `3,-2 · 5,2 · -3,1 · 2,-1 · -4,-1 · -2,1 · 2,1 · -3,-1`
    → cumulative `(0,0)→(3,-2)→(8,0)→(5,1)→(7,0)→(3,-1)→(1,0)→(3,1)→(0,0)` (closes).
  - `NCRS8`: `3,1,0 · 3,-4 · 2,1 · 0,2 · -3,1 · 2,-1 · 0,-2 · -1,0 · -3,3`
- Takeaway: the authentic claw is **orientation-aware** — the shape is re-rolled per lane
  rather than a single sprite rotated. → *Check whether our claw render does the same or
  uses one shape; cosmetic but part of the arcade feel.*

---

## §9 · Player charges (bullets) & firing
*(ch. player charges, attract mode admin → FIREPC)* → compare `core/rules.ts`, `core/sim.ts`

- Player bullets are **"charges"**. **Max 8 on screen** (`NCHARG = NPCHARG = 8`).
- Per-charge arrays: **`CHARY`** = depth (0 ⇒ slot free/inactive), **`CHARL1`/`CHARL2`** =
  lane the charge travels, **`CHARCO`** = per-bullet collision counter. **`CHACOU`** =
  count of charges currently in play.
- **Combined char table layout:** player charges occupy the first `NPCHAR` slots
  (`CHARY,X`); invaders & invader-shots are read at the `+NPCHAR` offset
  (`CHARY+NPCHAR,X`, `CHARL1+NPCHAR,X`).
- **`FIREPC` (fire a charge):** require player alive (`CURSL2` ≥ 0). Human path reads
  `SWSTAT & MFIRE`. On fire, find a free slot (`CHARY,X==0`): `INC CHACOU`; bullet depth =
  player depth `CURSY`; bullet lane = `CURSL1`/`CURSL2`; `CHARCO=0`; play `SLAUNC` sound;
  immediate `COLCHK` collision test at that depth.
- **`DSPCHG`** draws charges; bullet picture is **`DIARA2`** (a dot cluster via `SCDOT`).
- **Ammo feedback via the bullet's center color** (read `CHACOU`):
  - `< 6` in play → **YELLOW** ("plenty")
  - `6–7` (`≥ NPCHARG-2`) → **BLUE** ("low")
  - `8` (`≥ NPCHARG`) → **RED** ("out")

  Written via `STY COLPOR+PSHCTR`; `DIARA2` references it with `CSTAT PSHCTR`. → *Nice
  authentic touch to mirror if we show bullet-count feedback.*
- **`SCAPIC`** = "draw a picture centered between two web points, scaled by depth":
  projects world (`PXL,PYL,PZL`) → screen (`SXL,SZL`) via **`WORSCR`**, emits a center
  move, a scale opcode (`CASCAL`), and a brightness opcode (ID `$60`,
  `bright = clamp((BFACTR EOR 7)<<1, min $0A) << 4`).

---

## §10 · Enemies — shapes & status
*(ch. flipper, tanker detail; status byte from superzap)* → compare `core/enemies/*`

**Shared:** enemy shapes are relative-vector chains (Quadrascan). The source reads
`INVA1S`/`INVA1E` as "Invader 1 Start/End". Per-invader arrays: **`INVAY`** (depth/"Z on
the Y axis"), **`INVAL1`** (lane), **`INVAC2`** (status byte, below). `WINVMX` =
invader count.

**Flipper** *(ch. flipper)* → `core/enemies/flipper.ts`
- Manual: originates at the far rim, rides up two rails, flips in the tube and on the near
  rim; kills the player by flipping onto the shooter; killable when in the tube or
  "standing"; appears from **Level 1**.
- Shape `INVA1S` (relative `VEC`): `4,1,1 · 4,-1,1 · -2,1 · 1,1 · -3,-1 · -3,1 · 1,-1 ·
  -2,-1` → deltas sum to (0,0) (closed bow-tie "X"). (First two carry a 3rd value `1` =
  intensity flag.)

**Tanker** *(ch. tanker detail)* → `core/enemies/tanker.ts`
- A tanker carries enemies and releases them when struck; carriers show a small **rubric
  badge** indicating contents. Shared body `GENTNK` (color **PURPLE**, a ±`$20` 4-point
  diamond); each variant draws only its rubric then `JMP GENTNK`:
  - **`TANKR`** (flipper tanker): no rubric, plain purple diamond.
  - **`TANKF`** (fuse tanker): rubric = a crude **blue/red/green/yellow cross**.
  - **`TANKP`** (pulsar tanker): rubric = a **turquoise zig-zag "M"**.

**Enemy status byte `INVAC2`** (per-invader; from §12 superzap) — *important for our
enemy-type/carrier modeling:*

| Bits | Field |
|---|---|
| 7 | movement: 0 = Up, 1 = Down |
| 6 | firepower: 0 = no fire, 1 = fire |
| 1–0 | carrier type |

| Value | Decoded |
|---|---|
| `00000000` | Up / no fire / not a carrier |
| `10000001` | Down / no fire / carries **Flippers** |
| `11000010` | Down / fire / carries **Pulsars** |
| `01000011` | Up / fire / carries **Fuses** |

**`INVCAR = $03`** = carrier-type mask; `^C<INVCAR>` (`$FC`) clears the carrier bits,
turning a carrier into a normal enemy (used by Superzapper to "declaw" before killing so
contents aren't released).

> The book is light on Fuseball / Pulsar / Spiker *behaviour* (those live in our
> `core/enemies/{fuseball,pulsar,spiker}.ts` and are better covered by
> `docs/ux/2026-06-27-enemy-roster-rom-extract.md`). Spikes themselves are §11.

---

## §11 · Spikes & spike lines
*(ch. spikes)* → compare `core/enemies/spiker.ts`, `core/geometry.ts`

- Green spikes grow from the far end of each web line; a spike shot mid-growth gets a
  **white dot at its tip**; descending into one at level end is lethal.
- **`DSPENL`** ("display enemy lines") draws one spike per web line.
  **`NLINES`** = active spike count (= web line count). Per spike it builds a `VGLIST`
  fragment from fixed bytes **`ENLFIX: .BYTE 80,40,68,05`** → opcodes **Set Color Green
  `$6805`** + **Center `$8040`**, plus **Set Scale `$7100`**.
- **16-lane wrap:** adjacent line index = `(INDEX2+1) AND $0F`.
- **`FIXSTU`** computes the **far point** = midpoint of the current and adjacent line's
  far coords. Far-point coords are 16-bit (low/high split): **`LIFSXL/LIFSXH`** (X),
  **`LIFSZL/LIFSZH`** (Z). Halving via `ASL`/`ROR`.
- **`YVGVCT`** emits an **invisible** relative vector (intensity 0) from screen center to
  the far point; stashes it in `CURNTX/CURNTY`.
- **`TIPACT`** computes the **near point**: `LINEY`→`PYL`, `LINEXM/LINEZM`→`PXL/PZL`, then
  **`WORSCR`** (the world→screen perspective projection; long, unannotated; uses eye
  coords `EXL/EYL/EZL`, adjustments `ZADJL/XADJL`).
- **`FCONNEC`** emits the **visible green** vector far→near (delta = near − far);
  X-high `ORA #$A0` sets the intensity bits to make it visible. **`WHITIP`** appends Set
  Color White `$6800` + `JSRL JADOT`; **`JADOT`** = `VCTR 0,0,$CB` (a bright zero-length
  dot) + `RTSL`.
- Final per-spike opcode stream: `Scale $7100 · Color Green $6805 · Center $8040 ·
  blank-vector(center→far) · green-vector(far→near) · Color White $6800 · JSRL JADOT`.

---

## §12 · Superzapper
*(ch. superzap)* → compare `core/rules.ts`

- Constants: **`CSUMAX = 2`** (uses per level), **`CSUINT = 1`** (kill-cadence mask on the
  timer), **`CSUSTA = 3`** (kill-window lower cutoff).
- **`INISUZ`** resets `SUZCNT`(uses) = 0 and `SUZTIM`(timer) = 0 per level.
- Rules (prose): usable **twice per level**; **first press wipes all enemies & enemy
  bullets *except tankers*; second press kills only one more enemy.**
- **`PROSUZ`** runs only outside attract (`QSTATUS` minus). Button (`SWFINA & MSUZA`) with
  `SUZCNT < CSUMAX` → `INC SUZCNT`, `SUZTIM = 1`. While active, `INC SUZTIM`; deactivate
  when `SUZTIM ≥ TIMAX[SUZCNT]`; each tick `JSR KILENE`.
- **`TIMAX: .BYTE 00,13,05`** — first zap runs **13 frames**, second runs **5 frames**.
- **`KILENE`** kills one qualifying enemy per tick: gate is `SUZTIM ≥ CSUSTA(3)` AND
  `(SUZTIM & CSUINT)==0`. It scans `WINVMX` invaders for the first with non-zero `INVAY`;
  carriers are **declawed first** (`INVAC2 AND $FC`) then `JMP INCISQ` (start explosion) so
  killing them doesn't release contents. Prose: net **7 kills first press, 1 second**.
- **Web flash effect** (`DSPWEL`): while `SUZTIM` non-zero & positive, well color =
  `QFRAME & 7`; if 7 (black) use 1 (white) → per-frame color flashing.

> ⚠︎ The `KILENE` comment says "is SUZTIM odd?" but `AND #1`/`IFEQ` fires on **even**;
> and `AUTOCU` (§14) comments "highest" while the code keeps the **minimum** `INVAY`.
> Trust the code, not the comments; verify cadence against ROM if exact kill-count matters.

---

## §13 · Explosions & player death (the "splat")
*(ch. explosions one to four, splat control)* → compare `shell/fx.ts`

**Enemy-death explosion (`EXPL1`–`EXPL4`).** A 4-frame near-subliminal sequence; all four
draw the same 16-spoke star via **`SPOK16`**, varying only scale and brightness:

| Frame | scale mult `CM` | brightness `CB` |
|---|---|---|
| EXPL1 | 1 | `07` |
| EXPL2 | 2 | `0E` |
| EXPL3 | 4 | `0E` |
| EXPL4 | 8 | `0E` |

- Each frame: `CSTAT WHITE · ICVEC · SPOK16 · RTSL`. `SPOK16` draws 8 spokes
  out-and-back from center (`SCVEC` pairs; the return carries brightness `CB`). Scaling
  chain: `SPOK16` → `SCVEC` (scales coords by `CM/CD`) → `CVEC` (absolute→relative,
  tracking `OLX/OLZ`) → `VCTR`. So the star **doubles in size each frame** (1→2→4→8).

**Player death — the "splat".** A smeared, color-cycling star.
- **Animation sequence (9 calls):** `SPLAT6 · SPLAT5 · SPLAT4 · SPLAT3 · SPLAT2 · SPLAT1 ·
  SPLAT3 · SPLAT5 · SPLAT6` — grows to max then shrinks.
- **`SPLATn` fall-through scaling:** each sets a scale then `JSRL SPLAT` and *falls into*
  the next-smaller entry, so one call draws a stack of concentric splats. Scales:
  `SPLAT1 SCAL 0,0` (full) · `SPLAT2 SCAL 0,40` · `SPLAT3 SCAL 1,0` (½) · `SPLAT4 SCAL
  1,40` · `SPLAT5 SCAL 2,0` (¼) · `SPLAT6 SCAL 2,40` (then `JMPL SPLAT`).
- **`SCAL S,LS`** = set-scale opcode `$7000 + S*$100 + LS`. `S` = power-of-2 coarse scale
  (0=full…7=1/128); `LS` = linear fine scale (0=full, `$80`=½, `$FF`=1/256).
- **`SPLAT`** draws a jagged star with `SCVEC dx,dy,intensity` (intensity 7=bright) and
  `CSTAT` color changes between **`PDIWHI`(white) / `PDIRED`(red) / `PDIYEL`(yellow)** —
  these are 3 consecutive slots in the color tables.
- **Color cycling** (`COLPOR` = color ROM read by the AVG; `COLRAM` = working copy):
  - `ALTCOL` seeds the 3 splat slots (`ZRED→PDIRED`, `ZYELLOW→PDIYEL`, `ZWHITE→PDIWHI`).
  - **`ROTCOL`** ("rotate colors for player explosion") shifts the 3 colors left by one in
    both `COLRAM` and `COLPOR` every time the splat is drawn → the pulsing glow.
    Worked rotation: `[01,00,03] → [01,00,01] → [01,03,01] → [00,03,01]`.

---

## §14 · Attract-mode self-play AI
*(ch. attract mode admin)* → informs attract/demo mode

- **Attract flag = `QSTATUS`**; active when **non-negative** (bit 7 clear)
  (`BIT QSTATUS`/`IFPL`).
- **Demo setup:** 1 life (`LIVES1=1`); level picked at random from the **first 8**
  (`RANDOM & 7` → `WAVEN1,X` and `CURWAV`).
- **Movement (`AUTOCU`):** each frame, find the invader with the **smallest non-zero
  `INVAY`** (most advanced toward the rim) — seed `TEMP0=$FF`, scan `WINVMX`, keep min;
  then `POLDEL` gives the signed shortest lane distance (handles web wrap) between
  `INVAL1,X` and player `CURSL1`; sign → move **±9** toward it.
  ⚠︎ comment says "highest" but code keeps the minimum.
- **Shooting (`FIREPC`, attract branch):** scan every invader **and** every invader shot;
  if its lane is **within 2 lanes** of the player (`|lane − CURSL1| < 2`), fire — even
  with nothing currently on that lane (anticipatory, no ammo conservation). Same `FIREPC`
  routine handles human input on the non-attract branch (§9).

---

## §15 · Audio (POKEY)
*(ch. story of a beep)* → compare `shell/audio.ts`, `shell/audio-dispatch.ts`
*(and `docs/ux/2026-06-28-pokey-sfx-rom-map.md`)*

- Sound chip = Atari **POKEY**; all sound data is in **`ALSOUN.MAC`**. A sound is two raw
  register writes (then two to silence): **`AUDC1`** (channel-1 control = distortion +
  4-bit volume) and **`AUDF1`** (channel-1 frequency/pitch).
  - e.g. cursor beep: `AUDC1 = $A2` (low nibble `2` = volume 2), `AUDF1 = $0F` (high
    pitch); silence with both `= 0`. ⚠︎ the book prints `$A2`'s bits as `10110010`
    (= `$B2`); `$A2` = `10100010`.
- **Sounds are data-driven** by paired byte sequences named `<name>F` (writes `AUDF1`,
  the note) and `<name>A` (writes `AUDC1`, volume/distortion). The two run
  **simultaneously**, one step per frame ("beat").
- **6-byte sequence record:**

  | byte | meaning |
  |---|---|
  | 0 | value to write to the register |
  | 1 | beats (frames) to wait before next change |
  | 2 | signed amount to change the value each step (`$FF`=−1, `$F8`=−8…) |
  | 3 | number of changes (`1` ⇒ 0 changes) |
  | 4 | restart position (`0` = none) |
  | 5 | stop (`0`) |

- Examples:
  - **Cursor crossed a line** (`L05F`/`L05A`): `AUDF1=$0F` wait 4 → `$00`;
    `AUDC1=$A2` wait 4 → `$00`.
  - **Enemy shot** (`ES8F`/`ES8A`, every 3 frames, 8×): pitch rises from 0 by +2;
    volume fades from 8 by −1.
- **AUDC1 volume nibble:** `$01`–`$08` = volume 1–8. **AUDF1 pitch** (book's ascending
  read): `$00`=silent, `$02` very-very-low … `$0F` high.
- Other 1981 SFX labels (all `ALSOUN.MAC`): `CPEXPL`, `ESLSON`, `EXSNON`, `PULSTR`,
  `S3SWAR`, `SAUSON`, `SBOING`, `SELICO`, `SLAUNC`, `SOUTS2`, `SOUTS3`, `SSLAMS`.

---

## §16 · Anti-piracy checksums & the credit bug
*(ch. copyright atari, tempest program bug)* → historical / cautionary (not for our clone)

Six trap checksums `QT1`–`QT6` verify copyright/code integrity; on mismatch (plus a
game-progress gate) they sabotage the machine. **One of these is the real bug that bricked
legitimate cabinets** and inflated credits.

- **QT1** — copyright literal `© MCMLXXX ATARI` (`ZATLIS`); valid sum = `00`. Fail (with
  level > 10) → `FRTIMR = $7A` (enemies impossibly fast).
- **QT2** — message routine `ZATC4S` unaltered; valid = `00`. Fail (wave > 19) → `SED`
  (BCD mode → all math garbage → crash).
- **QT3 / QT6** — verify the copyright vector display list (`SECUVG`). Shared fail
  `ZQVAVG`: if `QT3|QT6 ≠ 0` **and score ≥ 170,000**, run `LDX LSCORL · INC X,0` —
  increments the **zero-page byte indexed by the score's last two digits** (`LSCORL`),
  every frame.
- **QT4 / QT5** — POKEY RNG sanity (`RANDOM`/`RANDO2`). Fail paths corrupt `$1FF` (stack)
  or `$200+`.

**The credit bug (the famous one):** the title-screen copyright line was edited before
shipping but its **expected checksum wasn't updated** — computed `29`, expected `$2A`. So
QT3 fails → `ZQVAVG` fires whenever score ≥ 170,000 → it increments zero-page byte
`$00 + LSCORL`. A score ending in **`06`** hits **`$$CRDT` ($06 = the credits counter)**,
inflating credits. Credits are hard-capped at **`$28 = 40`** (`ALSCO2.MAC`), so the bug
pins to 40 free credits.

- Atari Customer Service Bulletin, **Dec 4 1981**: affects uprights **before serial
  #17426**; score > 170,000 ⇒ **~12% chance of 40 credits for one quarter**; fix ROM
  **#136002-217** replaces the ROM at PCB location **J-1**.

→ *We don't reproduce the copy-protection; this section documents the historical quirk and
the exact zero-page layout (`$00`–`$08`) used elsewhere in §2.*

---

## §17 · Vestigial prototype, cut art & unused sounds
*(ch. space game reenactment society, things hidden, unused explosions)* → trivia / not shipped

- **Alien Space Game prototype.** Tempest began as Theurer's *"First Person Space
  Invaders"* with 3D depth-of-field; abandoned, but remnants survive, suppressed by
  **`SPACG=0`** (`;SUPPRESS SPACE GAME CODE`). Leftovers in **`ALVROM.MAC`**: player
  bullets `DSHTBL`/`DS2..4TBL`, enemy spears `ESHTBL`/`ES2..4TBL`, an "asteroid" bomb
  `ASTTBL`, a pyramid "fort" (`FORTMAC`, instantiated at sizes `15/10/0E/0C`), the player
  ship `GUNPIC`, and a vestigial grid (`VRT4DRW`/`VRT5DRW` — comment says "5 vert lines"
  but draws **10** ⚠︎).
- **Cut enemy artwork** (`ALVROM.MAC`, region `ENEMY PICTURES`): `ENER11–14`, `ENER21–24`,
  `ENER41–44`, and `SAU`–`SA4` (cyan diamonds). `ENER21–24` are the clearest predecessors
  to the shipped **claw** player ship. Drawn via the **`CALVEC`** absolute-vertex macro
  (computes deltas vs `OLDX/OLDZ`, calls `VCTR`).
- **Unused explosion sounds** (`ALSOUN.MAC`, `;EXPLOSION SOUND`, never triggered):
  `T51F/T51A` and `T52F/T52A` (same 6-byte F/A format as §15).

---

## §18 · Controller note
*(ch. rotary club — a Tempest 2000 chapter)*

- The only 1981 fact: the original coin-op used a **rotary controller (spinner/knob)**;
  the player's lane position tracks the spinner. (Read each frame by `MOVCUR` in `PLAY`,
  §2.) The book's "rotary club" chapter is otherwise all Jaguar/68K and was skipped — it
  contains **no 1981 spinner disassembly** to extract. → *Our `core/input.ts` /
  `shell/input.ts` spinner handling has no deeper 1981 reference in this book; rely on the
  ROM/`tempest.a65` if exact spinner sensitivity is needed.*

---

## Open follow-ups / things to compare against our code

1. **Tick order** (§2 `PLAY`): verify `sim.ts` updates player → enemies → bullets →
   enemy-fire → collisions → explosions → analyze, in that order.
2. **Superzapper** (§12): confirm 2 uses/level, first=wipe-except-tankers, second=1 kill,
   13/5-frame windows, and carrier "declaw before kill".
3. **Bullet cap & ammo color** (§9): 8 charges max; yellow/blue/red center by count
   (<6 / 6–7 / 8).
4. **Starfield** (§7): 8 planes, step −7, spawn `$F0`, spawn-next `$D5`, retire `$10` —
   compare warp/dive visuals.
5. **Enemy status byte** (§10 `INVAC2`): does our enemy/carrier model encode movement
   dir + fire + carrier-type the same way?
6. **Messages/colors** (§4): reconcile our HUD strings, colors and the "AVOID SPIKES" /
   "SUPERZAPPER RECHARGE" / "RATE YOURSELF" / rank banners.
7. **Claw orientation** (§8): 8 roll variants vs a single rotated shape.
8. **16-lane wrap** (§6/§11): `(i+1) & $0F` everywhere — confirm our segment count/wrap.
