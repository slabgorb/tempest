# Tempest — primary-source fidelity audit

**Date:** 2026-07-12 · **Subject:** our browser clone vs. Dave Theurer's original 1981 Atari
assembler source · **Status:** complete; awaiting rulings (see §9)

---

## 1. What this is, and what it supersedes

Every arcade constant in this clone was taken from a **secondary** source. Two of them, in fact:
*Tempest vs Tempest*, a book that reproduces hand-typed 6502 listings as page images and warns in
its own front matter that its operands may be OCR artifacts; and a third-party disassembly of the
rev-3 ROM. We built a game from photographs of someone else's transcription.

We now have the **primary** source: Theurer's actual 1981 Atari assembler source tree —
`ALWELG.MAC` (the game), `ALDISP.MAC` (the display), `ALVROM.MAC` (the vector pictures),
`ALSOUN.MAC` (the sound tables), `ALEXEC.MAC` (the state machine), `ALCOMN.MAC` (the RAM map and
every shared constant), and the rest. This document is the result of auditing our implementation
against it, line by line.

**`docs/tempest-1981-source-findings.md` is hereby demoted.** It remains valuable for its
narrative and historical chapters — how the game was made, what Theurer was thinking, what the
Jaguar sequel changed. It is no longer a reference. Do not take a constant from it. Section 7
below records, with citations, every place it was wrong.

**Method.** Ten auditor agents each owned one source↔ours subsystem pair (enemies, shapes, the
well, audio, scoring, the state machine, the warp, the font, the book reconciliation, and a
dedicated frame-rate adjudication) and emitted findings as JSON. A mechanical citation checker
then rejected any finding that did not quote a real line, byte-for-byte, on *both* sides — the
source and our code — and that did not cite a module which actually shipped. Twenty adversarial
refuters then attacked every finding that claimed a divergence, with a mandate to kill it.

**Tally.** 236 findings. 116 claimed a divergence and were attacked; 114 survived, 2 were killed
(DA-008 and DA-011, §6.10), and 36 of the survivors came back with a **correction** — a detail
the auditor got wrong that did not invalidate the claim. Those corrections are folded into the
findings below; you should not have to dig for them.

---

## 2. Reading this source without being fooled

This is the most useful section in the document. Each of the five traps below very nearly
corrupted this audit, and two of them succeeded until late. Anyone who opens this source later
will hit all five.

### (a) Decoy modules. Four near-identical variants never shipped.

The source tree contains `ALDIS2.MAC`, `ALSCO2.MAC`, `ALHAR2.MAC` and `ALTES2.MAC` alongside
`ALDISP.MAC`, `ALSCOR.MAC`, `ALHARD.MAC` and `ALTEST.MAC`. They are not backups and they are not
obviously stale: `ALDIS2` differs from `ALDISP` by **one operand**. Read the wrong one and you
will write a finding that is precisely, verifiably, citably wrong.

**The authority is `ALEXEC.MAP`'s link string.** Whatever the linker was told to link is what
went into the ROM; everything else is a sibling that lost.

### (b) But `.INCLUDE` also ships. The link string is not the whole answer.

`ALCOMN`, `ANVGAN`, `ASCVG`, `VGMC` and `COIN65` appear nowhere in `ALEXEC.MAP`'s link string —
and they **ship anyway**, because linked modules pull them in as source text. `ALVROM.MAC:26`
reads:

```
	.INCLUDE ANVGAN	;<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
```

unconditionally, outside any `.IF`. The font data really does assemble: `ALEXEC.MAP`'s Global
Symbol Summary resolves `VGMSGA=31E4` and `HALF=325C`, both inside the shared low bank.

**The real rule: shipped = the linked objects, plus everything they `.INCLUDE`, transitively.**
We got this wrong at first — the citation checker's allowlist rejected `ANVGAN.MAC` as
"not a linked object", which meant 36 of the 37 font glyphs were unverifiable — and we had to
correct the tooling before pair 10 could run at all (F-001).

### (c) Dead code that looks authoritative. `SPACG=0`.

`ALVROM.MAC` contains a section headed **ENEMY PICTURES** (roughly lines 1360–1849). It defines
`ENER11`…`ENER44` — beautiful, detailed, hand-authored enemy artwork. It sits inside
`.IF NE,SPACG` with `SPACG=0` set at `ALVROM.MAC:14`. **It never assembled. It is not in the
ROM.** Nobody has ever seen it on a cabinet.

Anyone porting "the authentic enemy shapes from ALVROM" would faithfully reproduce art that never
shipped, and would have a citation to prove it. The shapes that actually shipped are the point
tables in `ALDISP.MAC` (`INVA1S` and friends, from line 1907) and the picture routines earlier in
`ALVROM` (`GENTNK`, `SPIRA1-4`, `FUSE0-3`, `SPLAT`, `DIARA2`).

### (d) `.RADIX 16`. Unmarked numbers are hex.

`ALCOMN.MAC:17` sets `.RADIX 16`, and every module that `.INCLUDE`s it inherits that state —
which is every module. **A bare `60` in this source is 0x60 = 96.** Decimal literals carry a
trailing period: `SECOND = 20.`, `NRANKS = 99.`, `CMP I,10.`.

This silently corrupted at least two findings before it was caught. `ITIMHI=60` (`ALSCOR.MAC:36`)
is 96, not 60 — and combined with the frame-rate error below, the initials-entry timeout came out
as "roughly 32 seconds", a number that sounds exactly like an arcade initials timeout and that
nobody questioned. The real value is **108 seconds** (FR-016). Two independent unit errors
cancelling into a plausible answer is the worst failure mode there is.

### (e) The frame rate. The worst trap of all.

**The ROM does not run at 60 fps.** It runs at 256/9 ≈ 28.44 fps. This is section 3, because it
is not merely a trap — it is the single most consequential finding in the audit.

---

## 3. The clock — the single most important finding

### The chain of evidence

**One.** The IRQ handler increments a frame timer once per interrupt:

```
ALHARD.MAC:149	INC FRTIMR		;UPDATE FRAME TIMER
```

**Two.** The same handler increments a single-byte interrupt counter and treats its 8-bit wrap as
one second:

```
ALHARD.MAC:150	INC $INTCT		;INTERRUPT COUNTER
ALHARD.MAC:151	IFEQ			;ANOTHER SECOND?
ALHARD.MAC:152	INC SECOUL		;YES. UPDATE UP TIMER
```

A single byte wraps every 256 increments. **By the ROM's own arithmetic, the IRQ runs at 256 Hz.**
(The real divider chain is 3 kHz-derived — `M3KHTI = 80 ;3 KHZ TIMER`, `ALCOMN.MAC:251` — giving
something in the 246–256 Hz band. The ROM's own model is 256, and that is the number to convert
with.)

**Three.** The mainline spins until nine of those ticks have elapsed before it will run one game
frame:

```
ALEXEC.MAC:49	BEGIN			;LOOP UNTIL CURRENT FRAME HAS BEEN UP X MS.
ALEXEC.MAC:50	LDA FRTIMR
ALEXEC.MAC:51	CMP I,9
ALEXEC.MAC:52	CSEND
ALEXEC.MAC:53	LDA I,0			;RESTART FRAME TIMER
ALEXEC.MAC:54	STA FRTIMR
ALEXEC.MAC:55	JSR EXSTAT		;EXECUTE APPROPRIATE GAME STATE
ALEXEC.MAC:56	JSR NONSTA
ALEXEC.MAC:57	JSR DISPLA		;EXECUTE CODE TO DISPLAY NEW SCREEN
```

`CSEND` is defined at `HLL65.MAC:93` as `DEFEND CSEND,BCC,BCS` — it branches *back* while carry is
clear, and `CMP` sets carry when `FRTIMR >= 9`. So the loop waits for nine IRQ ticks per logic
frame. **9 ticks at 256 Hz = 35.16 ms. 256/9 = 28.44 game frames per second.**

**Four.** Theurer says so himself, in a comment sitting directly above the enemy refire table we
ship byte-for-byte:

```
ALWELG.MAC:581				;FRAMES UNTIL INVADER CAN FIRE (28 PER SECOND)
```

### Do not be fooled by SECOND = 20

`ALCOMN.MAC:87` reads `SECOND	=20.			;FRAMES/SECOND`, and it is tempting — we nearly were. It sits
under the header `;TIMING FOR PAUSE STATE` (`ALCOMN.MAC:85`) and is used in exactly one role: as
the reload unit for pause and attract countdowns (`4*SECOND`, `2*SECOND`, `QUASEC = SECOND/4`). It
appears nowhere in `MAINLN`, nowhere in the IRQ handler, and in no speed table. It cannot set the
frame rate. It is the author's *assumed* frames-per-second for authoring pause durations, and the
ROM contradicts it two files away. Where the constant and the machine disagree, the machine wins:
a countdown reloaded with 20 frames simply expires in 0.70 s, not 1.0 s (FR-004).

### The consequence

Our entire simulation runs **2.11× too fast** in wall-clock. Every `* 60` and every `/ 60` in the
codebase is wrong:

| Our code | What it does | Error |
|---|---|---|
| `rules.ts:46` `WARP_INITIAL_SPEED = (2.0 * 60) / WARP_ALONG_SPAN` | warp entry velocity | 2.11× |
| `rules.ts:52` `(perFrame8_8 / 256) * (60 * 60) / WARP_ALONG_SPAN` | warp acceleration | **4.45×** |
| `rules.ts:154` `(alongPerFrame * 60) / WARP_ALONG_SPAN` | every enemy climb speed | 2.11× |
| `rules.ts:7` `BULLET_SPEED = 2.4` | player charge speed | 2.10× |
| `rules.ts:120` `PULSAR_CLIMB_SPEED = 82.5 / …` | 82.5 *is* 1.375 × 60 | 2.11× |
| `sim.ts:223` `enemyFireHoldoffFrames(s.level) / 60` | enemy refire holdoff | 2.11× |
| `sim.ts:113`, `flipper.ts:27`/`39` `moveFrames / 60` | flip cadence | 2.11× |
| `loop.ts:9` `const STEP = 1 / 60` | **every frame-counted timer in the sim** | 2.11× |
| `render.ts:144` `starfield.step()` | once per *rendered* frame | 2.11× at 60 Hz, 5.1× at 144 Hz |

**Warp acceleration carries the base squared.** `warpAccel` is the single most base-sensitive
expression in the codebase: at 60 Hz it is 4.45× the arcade's. Our level-1 dive takes ~0.73 s
where the ROM's takes ~1.62 s (FR-011).

The `60` lives in two families, and only the first is a find-and-replace (FR-012):

- **(a) Explicit conversions** — the `* 60` / `/ 60` sites in the table above. A single exported
  `ROM_FPS = 256/9` fixes these mechanically.
- **(b) Everything counted in *our* frames** — which tick at 60/s because `loop.ts` says so. Fixing
  these is a **decision**: either set the sim's fixed timestep to 9/256 s (which makes every ROM
  frame count wall-correct for free, but changes the sim's temporal resolution), or keep 1/60 and
  convert each frame count through `ROM_FPS`. Make it once, globally.

### The subtlest failure in this audit: manufactured agreement

Three findings were originally marked **CONFIRMED — "we match the arcade!"** *only because the
wrong 60 made the numbers agree*:

- **W-045 / B-005** — `BULLET_SPEED = 2.4`. Filed as "a textbook case of the unit trap resolving
  to a match: 2.4 depth/s and 9 along-units/frame are the same number." They are the same number
  *only if a frame is 1/60 s*. The ROM's charge speed is 1.143 depth/s. We are 2.10× fast.
- **W-028** — `PULSAR_CLIMB_SPEED`. Filed as "both the threshold and the two speeds are right."
  The threshold is a pure position ratio and is right. Both speeds are 2.11× fast — and `82.5` is
  literally `1.375 × 60`, carrying the invented frame rate on its face.

The refutation pass only attacks findings that *claim* a divergence. **A false CONFIRMED is never
revisited.** These three would have been printed in this document as proof that we match the
arcade. The bad unit did not invent divergences — it **manufactured agreement**, and agreement is
what nobody checks.

Two findings move the *other* way once the base is corrected, which is the same disease with the
opposite sign: our spikers are ~26% **faster** than the arcade's, not 40% slower (FR-013/W-014),
and our death splat is 1.28× too long, not 2.7× (FR-015/DA-010). Anyone who applies the original
W-014 without the rebase will tune the spiker in the wrong direction.

### Therefore

> **The rebase must land before any other numeric fix.** Every fix applied first re-bakes the 60
> into the code and then "confirms" itself against this audit. W-020's originally-prescribed
> replacement constant, `0.536`, is itself `2.0 × 60/224` — the fix would have permanently
> cemented the bug it was fixing.

### One bright spot

Our POKEY sound tooling independently found the right timebase. `tools/pokey-bake/sfx-data.mjs:16`
reads: *"The engine ticks at the ~246-250 Hz sound interrupt (NOT the 60 Hz game frame)"* — which
is correct (FR-002, S-019). When the audio work needed a clock it went and found the real one.
Only the game core kept the invented 60.

**Corollary, and a live trap for the future:** `ALSOUN`'s "FRAMES" and `ALWELG`'s "frames" are
**different units**. Sound frames are IRQ ticks (~256/s); game frames are `MAINLN` passes
(~28.44/s, nine IRQ ticks each). Never convert one with the other.

---

## 4. Rosetta glossary

Theurer's vocabulary is not ours. The mapping is total and mechanical:

| Source | Ours |
|---|---|
| **cursor** (`CURSY`, `CURSL1`, `MOVCUR`) | the player / the Claw |
| **charges** (`CHARY`, `MOVCHA`, `NPCHARG`) | bullets (player) and bolts (enemy) |
| **invaders** (`INVAY`, `MOVINV`, `NINVAD`) | *active* enemies — the ones on screen |
| **nymphs** (`NYMPY`, `MOVNYM`, `NNYMPH`) | enemies queued at the far end of the well, before they hatch. **We have no such concept.** |
| **enemy lines** (`LINEY`, `DSPENL`) | spikes |
| **well** (`ILINLIY`…`ILINDDY`) | the tube |
| **traler** / `ZABTRA` | spiker |
| **wave** (`CURWAV`, 0-based) | level (ours is 1-based — see WD-010) |

"Nymphs" is the one that matters. It is not a synonym for anything we have; it is an entire object
class we are missing, and at least five other divergences hang off it (§9, cluster 3).

---

## 5. Scorecard

**By class:**

| Class | Count | Meaning |
|---|---:|---|
| DIVERGENCE | 107 | we do something, and the ROM does something else |
| CONFIRMED | 74 | we match, and it is now proven against the primary source |
| NO_COUNTERPART | 25 | the ROM has a thing we do not have at all |
| STRUCTURAL | 21 | different by design (float vs fixed-point, Canvas vs vector generator) |
| BOOK_WAS_WRONG | 9 | the secondary source misled us — §7 |
| **Total** | **236** | |

**By recommendation:**

| Recommendation | Count |
|---|---:|
| `fix` | 114 |
| `accept` | 27 |
| `wont_fix` | 21 |
| *(none — CONFIRMED matches)* | 74 |

**The refutation result:** 116 findings claimed a divergence and were attacked. **114 held. 2 were
killed. 36 came back corrected.**

A 1.7% kill rate looks suspiciously low, and it deserves an honest reading rather than a
triumphant one. It is low **because the citation gate already rejected the fabrications before the
refuters ever saw them.** A finding could not exist unless it quoted a real line, byte-for-byte, on
both sides. What reached the refuters was therefore a population of claims that were all *grounded
in real code* — and the failure mode of a grounded claim is not invention, it is **misreading**.

The refuters found misreadings constantly: a **31% correction rate** (36 of 114). They corrected
the shape of the SPLAT colour cycle, the true count of the TEMPEST logo's letterforms, the fact
that fuseballs *do* sometimes randomize their direction (W-007's "not one call site draws a random
direction" was an overstatement), the fact that SPIRA2/3/4 *are* rotations of SPIRA1 rather than
independent art (V-008), the real WELL colour in banks 2 and 3 (V-019), and the fact that our
second superzapper press already behaves correctly (W-042). None of those corrections killed the
underlying claim. All of them would have embarrassed us in a fix.

The two kills (DA-008, DA-011) share a signature: **an operand the auditor never decoded.** They
are written up in §6.12 because they are instructive.

---

## 6. Findings by subsystem

Grouped by subsystem. Within each: DIVERGENCE first, then BOOK_WAS_WRONG, NO_COUNTERPART,
STRUCTURAL, and CONFIRMED matches last. Every finding carries both citations, the claim, its
recommendation and size, and — where a refuter attacked it — its verdict. Refuter corrections are
folded in as **Correction** lines.

### 6.1 The clock (frame-rate adjudication) — `ALEXEC` / `ALHARD`

The frame-rate pair was commissioned late, after three earlier pairs quietly disagreed about what a ROM frame is worth in seconds. Its conclusion is §3 and is not repeated here; what follows is the finding-level record, including the reclassification of the three false CONFIRMEDs. Note FR-003 in particular: the true rate is a *ceiling*, not a clock — see §8.

#### Divergences

**FR-001 — The ROM's game-logic frame rate is 256/9 ~= 28.4 fps, not 60 - every frames->seconds conversion in the clone (and in this audit) is 2.11x off**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (l)
- Source: `ALEXEC.MAC:51` — `	CMP I,9`
- Ours: `src/core/rules.ts:46` — `export const WARP_INITIAL_SPEED = (2.0 * 60) / WARP_ALONG_SPAN`
- **Claim:** The frame rate is fixed by three lines of primary source, none of which is a comment. (1) The IRQ handler bumps FRTIMR once per interrupt: 'INC FRTIMR ;UPDATE FRAME TIMER' (ALHARD.MAC:149). (2) The same handler bumps the single-byte $INTCT ('INC $INTCT ;INTERRUPT COUNTER', ALHARD.MAC:150) and treats its 8-bit wrap as one second ('IFEQ ;ANOTHER SECOND?', ALHARD.MAC:151, feeding 'INC SECOUL ;YES. UPDATE UP TIMER', line 152) - so by the ROM's own arithmetic the IRQ runs at 256 Hz. (3) MAINLN spins until FRTIMR reaches 9 before it runs a single logic frame: 'BEGIN' / 'LDA FRTIMR' / 'CMP I,9' / 'CSEND' (ALEXEC.MAC:49-52), then 'LDA I,0 ;RESTART FRAME TIMER' / 'STA FRTIMR' (53-54) and exactly one 'JSR EXSTAT' / 'JSR NONSTA' / 'JSR DISPLA' pass (55-57). CSEND is defined as 'DEFEND CSEND,BCC,BCS' (HLL65.MAC:93) - it branches BACK while carry is CLEAR - and CMP sets carry when FRTIMR >= 9, so the loop waits for 9 IRQ ticks per logic frame. 9 ticks at 256 Hz = 35.16 ms => 256/9 = 28.44 game frames per second. Every per-frame quantity in the ROM (invader speed, charge speed, refire holdoff, zap window, QFRAME) is counted in THESE frames. Our code instead multiplies ROM per-frame values by 60 (rules.ts:46, 52, 154) and divides ROM frame counts by 60 (sim.ts:113, 223; flipper.ts:27, 39), making the whole simulation 60/28.44 = 2.11x too fast in wall-clock.

**FR-004 — SECOND=20 is a PAUSE-TIMER unit, not the frame rate - the '~20 fps' reading (WD-008) is refuted, but so is 60**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (s)
- Source: `ALCOMN.MAC:87` — `SECOND	=20.			;FRAMES/SECOND`
- Ours: `src/core/rules.ts:57` — `export const WARP_AVOID_SPIKES_SECONDS = 0.5`
- **Claim:** 'SECOND =20. ;FRAMES/SECOND' (ALCOMN.MAC:87, redeclared identically at ALEXEC.MAC:312) sits under the header ';TIMING FOR PAUSE STATE' (ALCOMN.MAC:85) and is used in exactly one role: as the reload unit for countdown timers. Every use is a pause load - 'LDA I,4*SECOND ;LONGER PAUSE' (ALEXEC.MAC:330), 2*SECOND (333, 402), 1*SECOND (355), 0*SECOND (387), 'LDA I,SECOND ;RESTART FRACTIONAL SECONDS TIMER' (ALWELG.MAC:219) - plus QUASEC = SECOND/4 (ALCOMN.MAC:88), used once, at 'LDA I,6*QUASEC ;WARNING DELAY' (ALWELG.MAC:3164). It appears NOWHERE in MAINLN, ALHARD's IRQ, or any speed table: it never gates the loop and cannot set the frame rate. It is the author's ASSUMED frames-per-second for authoring pause durations, and it is inconsistent with his own ';FRAMES UNTIL INVADER CAN FIRE (28 PER SECOND)' (ALWELG.MAC:581) and with the machine (FR-001). The one place it reaches our code is WARP_AVOID_SPIKES_SECONDS: 6*QUASEC = 30 frames, which at the real 28.44 fps is 1.055 s - not the 1.5 s WD-009 derived from SECOND=20, and not the 0.5 s we ship (which is 30/60).

**FR-006 — Enemy refire holdoff is converted at 60 Hz: 1.33 s where the arcade waits 2.81 s**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (s)
- Source: `ALWELG.MAC:583` — `	.BYTE TA,1,20.,80.,-3`
- Ours: `src/core/sim.ts:223` — `  const holdoffSeconds = enemyFireHoldoffFrames(s.level) / 60`
- **Claim:** TCHARFR's wave-1 record (' .BYTE TA,1,20.,80.,-3', ALWELG.MAC:583) is 80 GAME frames, and the ROM's own header two lines up says those frames run at 28 per second (ALWELG.MAC:581) - so an invader's post-shot holdoff at wave 1 is 80/28.44 = 2.81 s, falling to 23/28.44 = 0.81 s by wave 20. sim.ts:223 computes holdoffSeconds = enemyFireHoldoffFrames(level) / 60 = 1.33 s at level 1: enemies refire 2.11x more often than the arcade's, at every level.

**FR-007 — BULLET_SPEED 2.4 is 2.1x the ROM's charge speed - W-045 and B-005 are FALSE CONFIRMATIONS produced by the 60 Hz base**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (s)
- Source: `ALCOMN.MAC:890` — `PCVELO	=9			;PLAYER SHOT VELOCITY (I)`
- Ours: `src/core/rules.ts:7` — `export const BULLET_SPEED = 2.4       // depth units/sec (near → far); ROM rev-3 frees the slot at ~25 frames / ~0.42s`
- **Claim:** PCVELO = 9 along-units per GAME frame (ALCOMN.MAC:890), added to a charge's Y once per MOVCHA pass, which runs once per MAINLN iteration. The well is 224 along-units (0x10..0xF0), so a charge crosses it in 224/9 = 24.9 frames - correct - but those frames are 35.16 ms each, so the crossing takes 0.875 s, not the '~0.42s' our comment claims. In depth units: 9 * (256/9) / 224 = 256/224 = 1.143 depth/s. We ship BULLET_SPEED = 2.4, which is exactly 9 * 60/224 - the same arithmetic with the wrong base. Our bullets are 2.10x too fast.
- **Correction (refuter):** 2.4 is not algebraically 'exactly' 9*60/224 (that product is 2.4107); the shipped constant is a rounder hand-tuned number close to it. The resulting speed-up ratio is therefore 2.4/1.142857 = 2.1x, not the 2.109x implied elsewhere in the audit — a negligible but real discrepancy that should not be repeated as an exact identity.

**FR-008 — Every enemy climb speed carries the 60: flippers, tankers and fuseballs climb 2.11x too fast in wall-clock**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (m)
- Source: `ALWELG.MAC:592` — `	.BYTE TA,1,8,-44.,-5`
- Ours: `src/core/rules.ts:154` — `  return (alongPerFrame * 60) / WARP_ALONG_SPAN`
- **Claim:** TINVIN's wave-1 record (' .BYTE TA,1,8,-44.,-5', ALWELG.MAC:592) scales through TIMES8 into an 8.8 fixed-point per-GAME-frame increment: 44*8/256 = 1.375 along-units/frame (and 108*8/256 = 3.375 at wave 33). flipperSpeedForLevel converts that with '(alongPerFrame * 60) / WARP_ALONG_SPAN' (rules.ts:154), giving 0.368 depth/s at L1 and 0.904 at L33. With the real base the ROM's flipper climbs at 1.375 * (256/9) / 224 = 0.1746 depth/s at L1 and 0.4286 at L33 - a 5.7 s climb up the tube at level 1, where ours does it in 2.7 s. Tankers (tankerSpeed = flipperSpeed) and fuseballs (2x flipperSpeed) inherit the same 2.11x error.

**FR-009 — PULSAR_CLIMB_SPEED's 82.5 is literally 1.375 x 60 - W-028's CONFIRMED collapses on the speed half**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (s)
- Source: `ALWELG.MAC:547` — `	LDA I,0A0`
- Ours: `src/core/rules.ts:120` — `export const PULSAR_CLIMB_SPEED = 82.5 / WARP_ALONG_SPAN  // ≈ 0.368 depth/s`
- **Claim:** The pulsar's own climb increment is hard-set, level-independent: 'LDA I,0A0' / 'STA WINVIL+ZABPUL' (ALWELG.MAC:547-548) with 'LDA I,0FE' / 'STA WINVIN+ZABPUL' (549-550) = 0xFEA0 = -1.375 along-units per GAME frame - the same byte as the wave-1 flipper. Our PULSAR_CLIMB_SPEED = 82.5/224 = 0.368 depth/s, and 82.5 is exactly 1.375 * 60. At the real base it is 1.375 * (256/9) = 39.11 -> 39.11/224 = 0.1746 depth/s.

**FR-010 — Enemy bolt speed: the ROM's +2.0 along/frame offset is 0.254 depth/s, not the 0.536 W-020 prescribes (that fix is 60-based too)**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (s)
- Source: `ALWELG.MAC:601` — `	.BYTE TB,1,99.,-64.`
- Ours: `src/core/rules.ts:72` — `export const ENEMY_BOLT_SPEED_OFFSET = 0.72`
- **Claim:** TCHARIN is one TB record for every wave (' .BYTE TB,1,99.,-64.', ALWELG.MAC:601), and TB means 'byte + WINVIL', so an enemy charge is always exactly 64*8/256 = 2.0 along-units/frame faster than the invader that fired it. At the real base that offset is 2.0 * (256/9) / 224 = 0.254 depth/s, and the wave-1 bolt's absolute speed is 3.375 along/frame = 0.4286 depth/s. We ship ENEMY_BOLT_SPEED_OFFSET = 0.72 depth/s - 2.83x the ROM's offset - and W-020's proposed replacement, 0.536, is itself the same number computed with 60 (2.0 * 60/224).

**FR-011 — The warp dive is 2.2x too fast: ~0.73 s where the ROM takes ~1.62 s (and WD-008's 2.35 s is the 20 fps error in the other direction)**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (m)
- Source: `ALWELG.MAC:3148` — `	LDA I,2`
- Ours: `src/core/rules.ts:52` — `  return (perFrame8_8 / 256) * (60 * 60) / WARP_ALONG_SPAN`
- **Claim:** INDROP seeds the dive velocity at 'LDA I,2' / 'STA CURSVH' (ALWELG.MAC:3148-3149) with a zeroed fraction = 2.0 along-units/GAME frame, and MOVCUD adds min(CURWAV*4, 0x30) + 0x20 (in 1/256 along-units per frame squared) to it each frame. At displayed level 1 (CURWAV = 0, per WD-010) that is a = 0.125 along/frame^2, so 224 = 2t + 0.0625t^2 gives t = 46.0 frames -> 46 * 35.16 ms = 1.62 s. Our WARP_INITIAL_SPEED = (2.0 * 60)/224 and warpAccel's '(perFrame8_8 / 256) * (60 * 60) / WARP_ALONG_SPAN' (rules.ts:46, 52) produce a ~0.73 s dive.

**FR-012 — Frame-COUNTED timers are also 2.11x fast: our sim ticks them at 60/s because the fixed timestep is 1/60, not 9/256**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (m)
- Source: `ALEXEC.MAC:55` — `	JSR EXSTAT		;EXECUTE APPROPRIATE GAME STATE`
- Ours: `src/core/sim.ts:113` — `    case 'flipper':  return { kind, lane, depth, flipTimer: params.flipPattern.moveFrames / 60 }`
- **Claim:** The ROM advances every frame-counted timer exactly once per gated MAINLN pass ('JSR EXSTAT ;EXECUTE APPROPRIATE GAME STATE', ALEXEC.MAC:55, reached only after FRTIMR >= 9) - i.e. 28.44 ticks per second. Our sim ticks once per stepGame call at STEP = 1/60 (loop.ts:9), so every ROM frame count we ship runs at 60 ticks/second: the flip cadence (sim.ts:113 and flipper.ts:27/39, 'moveFrames / 60'), the refire holdoff (sim.ts:223), the superzapper windows (ZAP_WINDOW_FIRST/SECOND, decremented once per runZapFrame), the explosion stage counters in fx.ts, and the starfield (FR-017). Rebasing only the depth/s constants would fix the speeds and leave every one of these timers 2.11x short.

**FR-013 — Spiker speed: the rebase REVERSES W-014's direction - ours is ~26% faster than the arcade, not 40% slower**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (s)
- Source: `ALWELG.MAC:602` — `TSPIIN:	.BYTE TB,1,20.,0`
- Ours: `src/core/rules.ts:188` — `    spikerSpeed: 0.22 * ramp,`
- **Claim:** TSPIIN's first record ('TSPIIN: .BYTE TB,1,20.,0', ALWELG.MAC:602) is type TB (byte + WINVIL) with byte 0, so for waves 1-20 the spiker's climb speed IS the flipper's: 1.375 along-units/frame at wave 1 = 0.1746 depth/s at the real base. We ship spikerSpeed = 0.22 * ramp = 0.22 depth/s at level 1 - 26% FASTER than the arcade's spiker, not the '40% slower' W-014 reports (a figure obtained by comparing 0.22 against the 60-based 0.368).

**FR-014 — Superzapper window: 19 ROM frames is 0.67 s, not the '~0.317s at 60Hz' B-001 states; ours runs 0.22 s**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (s)
- Source: `ALWELG.MAC:3539` — `TIMAX:	.BYTE 0,CSUSTA+<8*<CSUINT+1>>,CSUSTA+<1*<CSUINT+1>>,0,0`
- Ours: `src/core/rules.ts:35` — `export const ZAP_WINDOW_FIRST = 13`
- **Claim:** TIMAX ('TIMAX: .BYTE 0,CSUSTA+<8*<CSUINT+1>>,CSUSTA+<1*<CSUINT+1>>,0,0', ALWELG.MAC:3539) resolves with CSUSTA=3, CSUINT=1 to {0, 19, 5, 0, 0}: the first zap window is 19 GAME frames = 19/28.44 = 0.668 s and the second is 5 frames = 0.176 s. We ship ZAP_WINDOW_FIRST = 13 and ZAP_WINDOW_SECOND = 5, ticked at 60/s (FR-012), so our windows last 0.217 s and 0.083 s - the first is 3.1x short in wall time, the second 2.1x.

**FR-015 — Player-death splat: 20 ROM frames is 0.70 s, not 0.33 s - DA-010's 'nearly 3x longer' collapses to 1.3x**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (s)
- Source: `ALDISP.MAC:1022` — `TSPTIM:	.BYTE 2			;SPLAT6;CHARGE PLAYER EXPLOSION START`
- Ours: `src/shell/fx.ts:89` — `const SPLAT_LIFE = 0.9`
- **Claim:** TSPTIM ('TSPTIM: .BYTE 2 ;SPLAT6;CHARGE PLAYER EXPLOSION START', ALDISP.MAC:1022) begins the per-stage frame-timer table whose charge-player sequence sums to 20 GAME frames. At the real base that is 20/28.44 = 0.703 s. Our SPLAT_LIFE = 0.9 s is therefore 1.28x the arcade's, not the '~2.7x' DA-010 reports from 20/60 = 0.33 s.

**FR-017 — The warp starfield steps once per RENDERED frame, so it is 2.11x fast at 60 Hz and 5x fast on a 144 Hz display**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (s)
- Source: `ALWELG.MAC:3442` — `	SBC I,07		;UPDATE PLANE POSITION`
- Ours: `src/shell/render.ts:144` — `  starfield.step()`
- **Claim:** PRSTAR decrements each plane's Z by 7 per GAME frame ('SBC I,07 ;UPDATE PLANE POSITION', ALWELG.MAC:3442), i.e. 7 * 28.44 = 199 along-units/second. Our starfield.step() is called from drawStarfield (render.ts:144), which runs once per RENDERED frame - not once per sim step - so the planes rush in at 7 * 60 = 420 units/s on a 60 Hz display, and at 7 * 144 = 1008 units/s on a 144 Hz one. The per-frame constants B-003 confirmed (STAR_SPAWN_Z 0xf0, STAR_STEP 7, STAR_RETIRE_Z 0x10, STAR_SPAWN_NEXT_Z 0xd5, NPLANE 8) are all correct; the CADENCE they are stepped at is not.

#### No counterpart

**FR-016 — Initials-entry auto-abort is ~108 s, not the '~32 seconds' SC-003 states (hex radix + 60 Hz, two errors compounding)**

- **NO_COUNTERPART** · recommend `wont_fix`
- Source: `ALSCOR.MAC:36` — `ITIMHI=60`
- Ours: *(none — nothing in our code corresponds)*
- **Claim:** 'ITIMHI=60' (ALSCOR.MAC:36) is HEX in this assembler - decimal literals carry a trailing period ('SECOND =20.', ALCOMN.MAC:87; 'CMP I,10.', ALWELG.MAC:571) - so ITIMHI = 0x60 = 96. It seeds TIMHIS ('LDA I,ITIMHI', ALSCOR.MAC:745), which GETINI decrements once every 32 GAME frames ('LDA QFRAME ;' / 'AND I,1F' / 'IFEQ ;TIME TO UPDATE TIMER?' / 'DEC TIMHIS ;YES', ALSCOR.MAC:768-771). Total = 96 * 32 = 3072 game frames = 3072/28.44 = 108 s. SC-003 reports 'roughly 32 seconds', which is 60 (decimal) * 32 frames / 60 Hz - the radix error and the frame-rate error cancelling into a plausible-looking number. We have no such timer at all.

#### Structural — different by design

**FR-003 — The ROM's frame rate is a self-paced CEILING, not a fixed clock: 28.4 fps when the frame fits in 9 IRQ ticks, slower when the vector list is busy**

- **STRUCTURAL** · recommend `accept`
- Source: `ALEXEC.MAC:49` — `	BEGIN			;LOOP UNTIL CURRENT FRAME HAS BEEN UP X MS.`
- Ours: `src/shell/loop.ts:9` — `const STEP = 1 / 60`
- **Claim:** MAINLN's inner BEGIN/CSEND spin ('BEGIN ;LOOP UNTIL CURRENT FRAME HAS BEEN UP X MS.', ALEXEC.MAC:49) is a MINIMUM frame period, not a synchronising wait: it only guarantees FRTIMR >= 9 before the next pass. EXSTAT+NONSTA+DISPLA (ALEXEC.MAC:55-57) then run inline, and DISPLA builds the whole vector display list, so a busy scene makes the loop iteration itself longer than 9 ticks and the next pass exits the spin immediately - the classic vector-arcade slowdown-under-load. The only upper bound is the watchdog: the IRQ resets the machine when FRTIMR goes negative ('LDA FRTIMR' / 'BPL SOFTOK ;OVERRUN TIME LIMIT (BR IF OK)', ALHARD.MAC:48-49), i.e. at 128 ticks (0.5 s, ~2 fps). ALDISP.MAC:573-574 ('LDA I,7A' / 'STA FRTIMR') exploits exactly this as an anti-tamper trap. So the rate is a band: 28.4 fps ceiling, degrading under load. Our loop.ts hard-codes STEP = 1/60 and advances the sim by exactly 1/60 s per step regardless of render cost.

#### Confirmed matches

**FR-002 — The IRQ really does run at ~256 Hz - and our POKEY bake tool is the one place in the codebase that already uses the right timebase**

- **CONFIRMED**
- Source: `ALHARD.MAC:150` — `	INC $INTCT		;INTERRUPT COUNTER`
- Ours: `tools/pokey-bake/sfx-data.mjs:16` — `// The engine ticks at the ~246-250 Hz sound interrupt (NOT the 60 Hz game frame),`
- **Claim:** ALHARD.MAC's IRQ handler calls MODSND unconditionally on every interrupt ('JSR MODSND ;PROCESS SOUNDS', line 148), then increments $INTCT (line 150) and treats the byte's wrap as a second ('IFEQ ;ANOTHER SECOND?', line 151). A single-byte counter wraps every 256 increments, so one second = 256 interrupts: the IRQ is ~256 Hz by the ROM's own reckoning, and ~246-250 Hz on the real 3 kHz-derived divider chain (ALCOMN.MAC:251, 'M3KHTI =80 ;3 KHZ TIMER'). sfx-data.mjs:16 documents exactly that: the sound engine ticks at the ~246-250 Hz sound interrupt, not at 60 Hz.

**FR-005 — Theurer's own comment says 28 frames per second - directly above the enemy-refire table we ship byte-for-byte**

- **CONFIRMED**
- Source: `ALWELG.MAC:581` — `				;FRAMES UNTIL INVADER CAN FIRE (28 PER SECOND)`
- Ours: `src/core/rules.ts:97` — `export function enemyFireHoldoffFrames(level: number): number {`
- **Claim:** The skill-contour table header reads ';FRAMES UNTIL INVADER CAN FIRE (28 PER SECOND)' (ALWELG.MAC:581), immediately above TCHARFR (582) whose first record is ' .BYTE TA,1,20.,80.,-3' (583). 28 per second is 256/9 = 28.44 rounded - an independent, in-source corroboration of the loop cadence derived in FR-001, written by the author beside the very numbers he was tuning. Our enemyFireHoldoffFrames (rules.ts:97-102) reproduces that table exactly: 80 at wave 1, -3/wave to 23 at wave 20, 20 for 21-64, 10 for 65+.


### 6.2 Simulation and enemies — `ALWELG.MAC`

The largest pair (48 findings) and the one that carries the most weight. The headline is structural: our five hard-coded per-kind steppers are the wrong *shape*. The arcade runs a per-invader bytecode program — the CAM — with 20 opcodes and 11 programs, and the flipper's program is **selected per wave** from a table. A level-1 flipper in the arcade never flips while it climbs; ours strobes sideways five times a second. Beneath the CAM sit the nymph queue, the seven-invader cap, and a dozen per-wave tables that we replaced with straight lines. Against that, a genuinely encouraging set of matches: the CHANCE fire-probability table, the wave-60 pulsar fire gate, the 8-shot cap, the spiker's `$20` turnaround, the split-child lane geometry, and the mid-flip grab immunity are all exactly right.

#### Divergences

**W-001 — Tick order: the arcade moves charges AFTER invaders and fires enemy charges after moving them; we move bullets before enemies**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (s)
- Source: `ALWELG.MAC:874` — `	JSR MOVCHA		;MOVE CHARGES`
- Ours: `src/core/sim.ts:633` — `  stepBullets(s, dt)`
- **Claim:** PLAY (ALWELG:869-878) runs MOVCUR, FIREPC, PROSUZ, MOVNYM, MOVINV, MOVCHA, FIREIC, COLLIS, PROEXP, ANALYZ. Our stepPlaying (sim.ts:630-644) runs stepPlayer, stepFiring, stepZap, stepBullets, stepEnemies, stepEnemyFire, stepEnemyBullets, resolve*. The first three slots match exactly (cursor, player fire, superzapper). After that: (a) we move player charges (stepBullets, line 633) BEFORE enemies; the arcade moves ALL charges (player and enemy, one MOVCHA loop) AFTER MOVINV, so an invader is at its new position when the bullet advances through it; (b) the arcade fires enemy charges (FIREIC) AFTER MOVCHA, so a newly launched enemy bolt sits still for its birth frame; we call stepEnemyFire then stepEnemyBullets, so our new bolt already moves one step on the frame it is born; (c) the arcade has no spawn step here at all — MOVNYM occupies that slot (see W-002).

**W-003 — Spawn regulation is invader-slot back-pressure, not a spawn interval timer**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (m)
- Source: `ALWELG.MAC:1113` — `	CMP WINVMX`
- Ours: `src/core/sim.ts:127` — `    if (s.spawn.timer <= 0) {`
- **Claim:** MOVNYM (ALWELG:1110-1123) computes INMCOU + INCCOU (invaders on lines + chasers), compares it against WINVMX, and if the slots are booked — or a superzap is running (SUZTIM != 0) — it sets TEMPY negative, which STOPS every nymph from advancing that frame. There is no spawn timer anywhere in ALWELG. Nymphs simply march up and hatch as fast as free invader slots allow. We instead release one enemy every params.spawnInterval seconds (rules.ts:187: max(0.3, 1.2/ramp)) regardless of how many are already alive.

**W-004 — The arcade allows at most 7 live invaders; we have no cap at all**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (m)
- Source: `ALWELG.MAC:695` — `TINVMX:	.BYTE T1,1,99.,6`
- Ours: `src/core/sim.ts:136` — `      s.enemies.push(makeEnemy(kind, lane, 0, params, cargo))`
- **Claim:** WINVMX = 6 for every wave 1-99 (TINVMX), and NINVAD = 7 (ALCOMN.MAC:809). ACTINV (ALWELG:1219-1263) scans slots WINVMX..0 for a vacancy and returns 'no slot' when all are taken; MOVINV loops the same 7 slots. So the arcade never has more than 7 active invaders on screen, at ANY level. Our stepEnemies pushes a new enemy whenever the spawn timer elapses, with no population cap: at level 10 our budget is 24 enemies (rules.ts:183) released every 0.51 s, so 20+ can be alive simultaneously.

**W-005 — Enemy behaviour is a per-invader bytecode program (the CAM), not five hard-coded steppers**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (l)
- Source: `ALWELG.MAC:1526` — `	JSR JSRCAM		;EXECUTE CAM REQUESTED`
- Ours: `src/core/sim.ts:145` — `    switch (e.kind) {`
- **Claim:** Every invader carries INVCAM, a program counter into the CAM table (ALWELG:2374-2526). MOVINV (1508-1534) loads it into CAMPC and executes CAM opcodes through the JSRCAM dispatcher until a VEXIT yields the frame, then writes CAMPC back. There are 20 opcodes (TABJSR, 1611-1632): VEXIT, VSLOOP/VSLOPB (set loop counter, from a literal or from a memory parameter), VELOOP, VSETPC, VSKIP0, VBR0PC (branch on CAMSTA), VNOOP, VSMOVE, VSTRAI, VJUMPS, VJUMPM, VCHROT, VKITST, VELTST, VSFUSE, VFUSKI, VSPUMO, VCHPLA, VCHKPU. Eleven programs are written in it: TRALUP, NOJUMP, MOVJMP, SPIRAL, SPIRCH, TOPPER, COWJMP/COWJM2, FUSEUP, FUSELR, PULSCH, AVOIDR. Our five per-kind step functions (sim.ts:145-197) have no program counter, no loop counter, no branch, and no shared opcode vocabulary; an enemy's behaviour is a function of its `kind` alone.

**W-006 — The flipper's whole behaviour is selected per level from CAMWAV — level 1 flippers never flip while climbing**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (l)
- Source: `ALWELG.MAC:712` — `	.BYTE NOJUMP-CAM`
- Ours: `src/core/enemies/flipper.ts:35` — `  if (e.flipTimer <= 0) {`
- **Claim:** CAMWAV (ALWELG:711-727) is a TZANDF table indexed by (wave-1) mod 16 that picks the FLIPPER's CAM program for the wave; the entry it yields is stored in WFLICAM and handed to every new flipper by NEWFLI (1428-1433). The sixteen entries, in order, are NOJUMP, MOVJMP, SPIRAL, SPIRCH, COWJM2, MOVJMP, SPIRCH, SPIRAL, COWJM2, AVOIDR, SPIRCH, SPIRAL, COWJM2, NOJUMP, AVOIDR, SPIRCH — the source even labels the levels above it (CIRCLE, SQUARE, CROSS, PEANUT, KEY, ...). Wave 1 (the circle) gets NOJUMP, which is literally VSMOVE / VEXIT / VSETPC NOJUMP (2387-2390): climb, yield, repeat. A level-1 flipper NEVER flips while it climbs; it only starts flipping once it reaches the rim and becomes a chaser (W-009). Our flipper flips on every level, every params.flipPattern.moveFrames — 8 frames (0.133 s) at level 1.

**W-007 — Flip direction is never random — it is set by rule (toward the player, away from it, or preserved across jumps)**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (m)
- Source: `ALWELG.MAC:2514` — `	VCHPLA			;SET DIRECTION TOWARD PLAYER`
- Ours: `src/core/enemies/flipper.ts:36` — `    e.flipDir = nextFloat(rng) < 0.5 ? -1 : 1`
- **Claim:** An invader's rotation lives in the INVROT bit of INVAC1 (ALCOMN.MAC) and PERSISTS across jumps — JJUMPS/JJUMPM just keep using it. It is only ever changed deliberately: JCHPLA (1876-1889) computes the polar delta to the cursor and sets INVROT to the SHORTEST way toward the player; JCHROT (1722-1726) flips the bit. AVOIDR does VCHPLA then VCHROT (2514-2515), i.e. it deliberately flips away from the player. SPIRCH does VCHROT after every 2 jumps, then after every 3 (2423-2443). PULSCH does VCHPLA before every flip (2504). TOPPER's chaser gets JCHPLA, or the opposite of the other chaser's direction if one exists (1845-1869). Not one call site draws a random direction. We draw one from the RNG on every flip, for flippers (flipper.ts:36) and pulsars (pulsar.ts:32).
- **Correction (refuter):** The claim's blanket assertion 'Not one call site draws a random direction' is wrong: FUSEUP's underlying JFUSEUP routine (ALWELG.MAC:2126,2139,2162 → LEFRIT at 2171) does use `BIT RANDOM` to pick a fuseball's jump direction when not chasing the player. This does not invalidate the finding's concrete fix target (flipper.ts:36, pulsar.ts:32 — neither of which the ROM ever randomizes), but the general principle should be stated as 'flippers and pulsars are never randomized; fuseballs sometimes are' rather than an absolute rule.

**W-008 — A flip takes 8 angle-steps: 8 frames for a climbing flipper, WTTFRA steps/frame at the rim**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (s)
- Source: `ALWELG.MAC:2457` — `KJULP2:	VJUMPM			;DOUBLE SPEED JUMP`
- Ours: `src/core/rules.ts:175` — `  const flipFrames = level >= 33 ? 3 : 4`
- **Claim:** JJUMPM (1892-1976) advances the jump angle in INVAL2 by exactly ONE unit (mod 16) per call and ends the jump when the angle reaches CALSAN's final angle, which is the start angle + 8 — so a jump is 8 steps. Climbing programs (MOVJMP, SPIRAL, SPIRCH, COWJMP, AVOIDR) call VJUMPM once per VEXIT, i.e. 1 step/frame => an 8-frame flip. Only TOPPER (the rim chaser) loops VJUMPM WTTFRA times per frame (2456-2459, 'DOUBLE SPEED JUMP'), and WTTFRA is 2 for waves 1-32 and 3 for waves 33+ (TWTTFRA, 704-706) => a 4-frame flip at the rim, 2.67 at deep levels. Our flipFrames is 4 for every flipper at every depth (3 at L33+).
- **Correction (refuter):** Minor: the finding states the rim flip is '2.67 frames' at deep levels (8/3). Because VBR0PC checks for jump-done after every single VJUMPM inside the WTTFRA-loop and can exit the loop before it's exhausted, the actual integer frame count for WTTFRA=3 is ceil(8/3)=3 frames (steps 3+3+2), not a fractional 2.67 — so our flipFrames=3 for L33+ is arithmetically exact for the RIM case, not just 'happens to be right' only at L1-32. The core divergence claim is unaffected: it is still wrong for every climbing (non-rim) flip, which should take 8 frames constant, not 3-4.

**W-009 — An invader reaching the rim becomes a CHASER — a distinct state with its own CAM, counter and pincer rule**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (m)
- Source: `ALWELG.MAC:1747` — `ATOP:	JSR CHASER		;YES. CONVERT TO CHASER`
- Ours: `src/core/enemies/flipper.ts:16` — `  e.depth = Math.min(1, e.depth + params.flipperSpeed * dt)`
- **Claim:** JSMOVE detects INVAY <= CURSY and calls CHASER (1824-1874), which: pins the invader exactly at CURSY; decrements INMCOU and increments INCCOU (the arcade tracks 'invaders on lines' and 'invaders chasing the cursor' separately); sets CAMPC to TOPPER; and picks the chase direction — the shortest way to the player via JCHPLA, UNLESS exactly one other chaser already exists, in which case it sends this one the OPPOSITE way to pincer the player (1845-1869). TOPPER (2447-2460) then crouches 4 frames, tests for a cursor kill each frame (VKITST), and jumps around the rim at WTTFRA angle-steps per frame. Our flipper has no rim state: it clamps depth at 1 (flipper.ts:16) and keeps running its climbing behaviour; the grab is resolved externally in resolvePlayerHits.

**W-011 — Enemies per wave: the arcade's TNYMMX table starts at 10 and is not a straight line**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (s)
- Source: `ALWELG.MAC:697` — `TNYMMX:	.BYTE TZ,1,16.,10.,12.,15.,17.,20.,22.,20.,24.,27.,29.,27.,24.,26.,28.,30.,27.`
- Ours: `src/core/rules.ts:183` — `    enemyCount: 6 + (level - 1) * 2,`
- **Claim:** NWNYMC (the wave's nymph count = its total enemy budget) is itemised per wave: 10, 12, 15, 17, 20, 22, 20, 24, 27, 29, 27, 24, 26, 28, 30, 27 for waves 1-16, then TA/T1 records to wave 99 (698-703). Note it is NOT monotonic — it DROPS at wave 7 (22 -> 20) and again at wave 12 (27 -> 24). Ours is 6 + 2*(level-1): 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36. Wave 1 is 6 for us and 10 in the arcade; wave 16 is 36 for us and 27 in the arcade.

**W-012 — The invader speed curve (TINVIN) is a steep piecewise table with a dip at wave 17, not a straight line from L1 to L33**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (s)
- Source: `ALWELG.MAC:592` — `	.BYTE TA,1,8,-44.,-5`
- Ours: `src/core/rules.ts:150` — `export function flipperSpeedForLevel(level: number): number {`
- **Claim:** WINVIL (the base invader speed, used by flippers and tankers, doubled for fuseballs, offset for enemy shots) comes from TINVIN (591-599). Waves 1-8 are TA: -44 with -5 PER WAVE (wave 8 = -79). Waves 9-16 are itemised: -81, -84, -84, -84, -88, -92, -96, -96. Wave 17-25 RESTARTS at -81 (enemies get SLOWER at wave 17), 26-32 at -99, 33-39 at -108, 40-48 at -110, 49-64 at -120, 65-99 alternates -160/-191. TIMES8 (560-578) scales by 8 into 8.8 fixed point, so along-units/frame = |WINVIL|/32. Wave 1 = 1.375, wave 8 = 2.469, wave 16 = 3.000, wave 17 = 2.531, wave 33 = 3.375. Our flipperSpeedForLevel interpolates LINEARLY from 1.375 (L1) to 3.375 (L33): wave 8 = 1.813 (27% too slow), wave 16 = 2.313 (23% too slow), and it never dips at 17.

**W-014 — The spiker moves at exactly the flipper's speed for waves 1-20; ours is on its own curve and ~26% FASTER**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (s)
- Source: `ALWELG.MAC:602` — `TSPIIN:	.BYTE TB,1,20.,0`
- Ours: `src/core/rules.ts:188` — `    spikerSpeed: 0.22 * ramp,`
- **Claim:** The spiker's speed slot is WINVIL+ZABTRA, filled from TSPIIN (602-605) using type code TB, which DOTB (829-832) implements as 'the record byte PLUS the already-computed WINVIL' (the CONTOUR loop walks WTABLE backwards, so WINVIL is set first). TSPIIN's byte is 0 for waves 1-20, so the spiker's speed IS the flipper's speed: 1.375 along-units/frame at wave 1, which at the ROM's 28.44 fps (FR-001) is 0.175 depth/s. It then becomes WINVIL-48 for waves 21-32, WINVIL-40 for 33-48, WINVIL-48 for 49-99 — i.e. FASTER than a flipper in the late game. Our spikerSpeed is 0.22 * (1 + 0.15*(level-1)): 0.22 depth/s at L1, on a curve unrelated to the flipper's — 26% FASTER than the arcade's spiker, not slower.

**W-019 — The concurrent enemy-shot cap is per wave (WCHAMX+1 = 2 at wave 1), not a flat 4**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (s)
- Source: `ALWELG.MAC:586` — `TCHAMX:	.BYTE TZ,1,9,1,1,1,2,3,2,2,3,3	;ADD 1`
- Ours: `src/core/rules.ts:62` — `export const MAX_ENEMY_BULLETS = 4`
- **Claim:** FIREIC searches enemy-charge slots WCHAMX..0 for a vacancy (2709-2726), so the live cap is WCHAMX+1 (hence the ';ADD 1' comment). TCHAMX (586-588) gives WCHAMX = 1,1,1,2,3,2,2,3,3 for waves 1-9, then 2 for waves 10-64, then 3 for 65-99. The cap is therefore 2 bolts on waves 1-3, 3 on wave 4, 4 on wave 5, 3 on waves 6-7, 4 on waves 8-9, 3 on waves 10-64 and 4 on waves 65+ — it goes DOWN as well as up. NICHARG=4 (ALCOMN.MAC:813) is only the physical slot count. We hard-cap at 4 on every level (sim.ts:225).

**W-020 — Enemy bolt speed is invader speed + 2.0 along-units/frame (0.254 depth/s), not +0.72 depth/s — and not the 0.536 this finding first prescribed**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (s)
- Source: `ALWELG.MAC:601` — `	.BYTE TB,1,99.,-64.`
- Ours: `src/core/rules.ts:72` — `export const ENEMY_BOLT_SPEED_OFFSET = 0.72`
- **Claim:** TCHARIN is a single TB record for waves 1-99 with byte -64, and TB (DOTB, 829-832) means 'byte + WINVIL'. So WCHARL = WINVIL - 64 for EVERY wave, then TIMES8 scales it: the bolt is always exactly 64*8/256 = 2.0 along-units/frame faster than the invader that fired it. At the ROM's real 28.44 fps (FR-001) that offset is 2.0 * (256/9) / 224 = 0.254 depth/s, and the wave-1 bolt's absolute speed is (44+64)/32 = 3.375 along/frame = 0.4286 depth/s. Our ENEMY_BOLT_SPEED_OFFSET is 0.72 depth/s — 2.83x the ROM's offset — giving 0.368 + 0.72 = 1.088 depth/s at L1, 2.54x the arcade's bolt. The code comment claiming 'flipper-relative +0xc0' is not what the source says.

**W-021 — The enemy-fire depth gate is 'not too near the rim' — there is no far-end minimum depth at all**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (s)
- Source: `ALWELG.MAC:2694` — `	CMP I,ILINLIY+20	;YES`
- Ours: `src/core/rules.ts:65` — `export const ENEMY_FIRE_MIN_DEPTH = 0x30 / 0x100   // ≈ 0.188 of the well`
- **Claim:** FIREIC's only positional gate is INVAY >= ILINLIY+$20 = $30 (2694-2695, 'INVADER LOW ENOUGH?'), i.e. the invader must be at least $20 units BELOW the rim. In our depth convention (depth = ($F0 - Y)/224) that is depth <= (240-48)/224 = 0.857. There is NO minimum-distance-from-the-far-end check: an invader that hatched one frame ago at the bottom of the well may fire immediately if its INVACT timer is up. We enforce BOTH an invented far-end floor (ENEMY_FIRE_MIN_DEPTH = 0.188, sim.ts:227) and a near cap of 0.9 rather than 0.857. FIREIC also refuses to fire while the invader is mid-jump (INVMOT set, 2702-2704) — we have no such rule.

**W-022 — Fuseball vulnerability is INVERTED: the arcade's fuseball is killable only while it is rolling between lanes**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (s)
- Source: `ALWELG.MAC:2975` — `	IFMI			;VULNERABLE FUSE?`
- Ours: `src/core/sim.ts:316` — `      if (e.kind === 'fuseball' && !e.vulnerable) continue`
- **Claim:** COLCHK's fuse branch (2965-2979) requires THREE things before a player charge may kill a fuseball: it is not at the rim (INVAY != CURSY, 2969-2970 — a fuseball at the top is entirely bulletproof); the charge's base line matches INVAL1; and INVAL2 is NEGATIVE (bit 7 set). INVAL2 has bit 7 set only while the fuse is mid-jump — JUMPSD writes $81/$87 into it when a lateral jump starts (2025-2034), and JJUMPM writes $20 (positive) into it the instant the fuse lands on a line, with the comment 'MAKE IT INVINCIBLE' (1928). So: rolling between lanes = VULNERABLE, parked on a lane = INVINCIBLE, at the rim = INVINCIBLE. Our model is the exact opposite: `vulnerable` starts false, toggles on each lane slide (fuseball.ts:41), and resolveBulletHits skips the fuseball when it is NOT vulnerable — with a comment stating it is 'killable by a bullet only in its on-lane vulnerable phase... invulnerable while rolling the rim'.

**W-023 — Fuseballs do not chase the player before wave 17 — they pick left/right at random**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (s)
- Source: `ALWELG.MAC:687` — `	.BYTE TR,17.,32.,0,40`
- Ours: `src/core/enemies/fuseball.ts:38` — `      const dir = laneStepToward(tube, e.lane, playerLane)`
- **Claim:** The fuseball's chase behaviour is controlled by WFUSCH (D7 = chase at the top, D6 = chase on the tube, ALCOMN.MAC:786) and comes from TWFUSC (686-690). TWFUSC's FIRST record starts at wave 17, and the table ends in TE — so for every wave below 17, CONTOUR's EOT path (442) yields 0 and WFUSCH = 0, meaning NEITHER chase bit is set. JFUSEUP/MAYBLR (2121-2165) then always take the LEFRIT branch, which chooses the rotation direction from RANDOM (2171-2178). Fuseballs first appear at wave 11 (W-036), so for their entire early-game life they wander. Even from wave 17 the chase is conditional: TR alternates 0/$40 across waves 17-32, and MAYBLR only chases on an EVEN invader index (2157-2159). Our fuseball ALWAYS steps toward the player's lane.

**W-024 — On early waves a fuseball turns back before reaching the rim while nymphs remain**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (m)
- Source: `ALWELG.MAC:2115` — `	CMP I,20		;YES. TURN BACK BEFORE TOP`
- Ours: `src/core/enemies/fuseball.ts:30` — `  e.depth = Math.min(1, e.depth + params.fuseballSpeed * dt)`
- **Claim:** JFUSEUP (2105-2130): if there are nymphs left AND CURWAV < 17 ('EARLY WAVE?'), the fuseball's climb is capped at Y = $20 (depth 0.929) instead of CURSY — reaching it triggers a lateral move (LEFRIT/FUCHPL) rather than an arrival. Only when the nymph queue is empty does it 'HEAD FOR THE TOP' (2118). It also reverses at the BOTTOM of its range ($80, 2132-2143), so it yo-yos. Our fuseball climbs monotonically to depth 1 and grabs.

**W-025 — A pulsar flips TOWARD the player; ours flips in a random direction**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (m)
- Source: `ALWELG.MAC:2504` — `PULSC3:	VCHPLA			;SET FLIP DIRECTION TOWARD PLAYER`
- Ours: `src/core/enemies/pulsar.ts:32` — `    const dir = nextFloat(rng) < 0.5 ? -1 : 1`
- **Claim:** The pulsar's CAM program is PULSCH (2493-2509): set a loop counter from PUCHDE (the per-wave 'pulsar chase delay', TPUCHDE 680-685), move that many frames, then check whether a pulse is imminent (VCHKPU), then VCHPLA — set the flip direction toward the player via JCHPLA's shortest polar delta — and start the flip. Our stepPulsar draws the direction from the RNG and uses params.flipInterval (rules.ts:185) rather than PUCHDE.

**W-026 — The pulse is a single GLOBAL phase shared by every pulsar, ~9 frames on / ~31 off (0.32 s of a 1.41 s cycle) — not a per-enemy 0.6 s pulse**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (m)
- Source: `ALWELG.MAC:1539` — `	ADC PULTIM`
- Ours: `src/core/enemies/pulsar.ts:26` — `    e.pulseTimer = e.pulsing ? PULSE_DURATION : params.pulseInterval`
- **Claim:** MOVINV updates the pulse ONCE per frame, outside the invader loop (1536-1570): PULSON += PULTIM; a sign change of PULSON is the on/off transition (PULSON >= 0 = pulsing); PULSON bounces between +15 and -63 (1558-1568), with PULTIM = 4 for waves 1-48, 6 for 49-64, 8 for 65+ (WPULTIM, 610-613). With PULTIM = 4 the full cycle is ~40 GAME frames, which at the ROM's 28.44 fps (FR-001) is 1.41 s, of which only ~9 frames (~0.32 s) are ON. Every pulsar on the board pulses in unison off this one counter. We give each pulsar its OWN pulseTimer, ON for PULSE_DURATION = 0.6 s and OFF for pulseInterval = max(1.2, 3.0/ramp) s — a 3.6 s cycle at level 1, bottoming out at 1.8 s once the ramp reaches the 1.2 s floor.
- **Correction (refuter):** The full pulse cycle is ~42 ROM frames, not ~40 — 42/28.444 = 1.48 s, not 1.41 s (verified by simulating the exact PULSON/PULTIM byte machine). The 9-frame / 0.32 s ON duration is exact. Everything else (global vs. per-enemy phase, the structural description of the update) is accurate.
- **Correction (tp1-5, on landing the fix): the cycle is 40 frames and the pulse is lit for SEVEN of them. Both the claim above and its refuter are wrong, for the same reason: neither read the SEED.** `INEWLI` opens every wave and every life with `LDA I,-1 / STA PULSON` (ALWELG.MAC:46-48). PULSON therefore starts at **-1**, and since it only ever moves in steps of PULTIM = 4, it is pinned to the residue 3 (mod 4) for the whole wave — it can *never* land on 0, 4, 8, 12 or 16. Simulate the byte machine from a seed of 0 (which is what both passes above did) and you get the unreachable set {0,4,8,12,16}, a 9-frame ON window, and — depending on where you start counting the rails — a period that looks like 42. Simulate it from the ROM's own -1 and the reachable values are exactly the twenty-one from -65 to +15 in steps of 4, two of them turning points: **period 2×21 − 2 = 40 frames**, and the lit half (PULSON >= 0) is {3, 7, 11, 15} — the peak once, the other three twice = **7 frames ON, 33 off** (0.25 s of a 1.41 s cycle). The original claim's ~40 was right and its refuter's 42 was not; the 9 that both agreed on was never reachable. Pinned by `tests/core/tp1-5.pulsar-fuse-split.test.ts` ("is ON for exactly 7 frames of a 40-frame cycle"), which measures it out of the running sim.

**W-027 — A pulse only kills when the pulsar is above the potency height (PULPOT)**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (s)
- Source: `ALWELG.MAC:1806` — `	IFCC			;PULSAR IN RANGE?`
- Ours: `src/core/sim.ts:394` — `  const killer = grabber ?? s.enemies.find((e) => e.kind === 'pulsar' && e.pulsing && e.lane === pl)`
- **Claim:** JPULMO's kill test (1802-1817) requires PULSON to be positive (pulse on) AND INVAY < PULPOT AND both cursor legs to match the pulsar's legs. PULPOT is $A0 for waves 1-64 and $C0 for 65+ (WPULPOT, 606-609) — $A0 is depth 0.357 in our convention. So a pulsing pulsar deeper than 0.357 (i.e. in the far third of the well) does NOT kill. Our resolvePlayerHits kills whenever a pulsing pulsar shares the player's lane, at ANY depth, including one that has just hatched at the far end.

**W-028 — Pulsar dual climb speed: the STRUCTURE (flipper speed below the potency height, spd_pulsar above) is right, but BOTH speeds are 2.11x too fast**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (s)
- Source: `ALWELG.MAC:1786` — `	LDY I,ZABFLI		;NO. GO FASTER`
- Ours: `src/core/enemies/pulsar.ts:19` — `  const climbSpeed = e.depth >= PULSAR_NEAR_FAR_DEPTH ? PULSAR_CLIMB_SPEED : params.flipperSpeed`
- **Claim:** JPULMO (1780-1788) selects the speed index: ZABPUL by default, but if the pulsar is going up and INVAY >= PULPOT (i.e. it is still deeper than the potency height) it swaps to ZABFLI — 'NO. GO FASTER'. WINVIL+ZABPUL / WINVIN+ZABPUL are hard-set to $A0/$FE (547-550) = -1.375 along-units per GAME frame, level-independent — the same byte as the wave-1 flipper. At the ROM's real 28.44 fps (FR-001) that is 1.375 * (256/9) / 224 = 0.175 depth/s. We ship PULSAR_CLIMB_SPEED = 82.5/224 = 0.368 depth/s, and 82.5 is literally 1.375 * 60: the constant carries the invented frame rate on its face. PULSAR_NEAR_FAR_DEPTH = (0xf0-0xa0)/224 = 0.357 is a pure position ratio and IS correct, and the finding's structural half (dual speed, selected exactly this way) stands. The pulsar's other speed — params.flipperSpeed — is 2.11x fast for the same reason (FR-008).

**W-029 — Pulsars descend as well as climb — they yo-yo while nymphs remain**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (m)
- Source: `ALWELG.MAC:1796` — `	IFCS			;TIME TO REVERSE?`
- Ours: `src/core/enemies/pulsar.ts:19` — `  const climbSpeed = e.depth >= PULSAR_NEAR_FAR_DEPTH ? PULSAR_CLIMB_SPEED : params.flipperSpeed`
- **Claim:** The pulsar's INVAC2 carries a direction bit (INVDIR, ALCOMN.MAC:869). JPULMO (1789-1801) moves it DOWN when the bit is set, and reverses it back to UP once it descends past PULPOT — unless the nymph queue is empty, in which case it forces the pulsar up ('SEND PULSAR UP', 1793). CHASER (1829-1837) likewise sends a pulsar that reaches the rim back DOWN if any nymphs remain. So a pulsar patrols up and down between the rim and the potency height for as long as the wave still has nymphs. Our pulsar's depth only ever increases.

**W-030 — A tanker auto-splits at depth 0.929 and its children appear at the parent's depth, not 0.9 / 0.85**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (s)
- Source: `ALWELG.MAC:1750` — `	IFCC			;TOO CLOSE TO TOP FOR CARRIER?`
- Ours: `src/core/rules.ts:126` — `export const TANKER_SPLIT_DEPTH = 0.9  // tankers split at/after this depth`
- **Claim:** JSMOVE (1749-1760) splits a carrier the moment its INVAY drops below $20 — depth ($F0-$20)/224 = 0.929, the SAME $20 threshold we already use for SPIKER_TURNAROUND_DEPTH (rules.ts:115). KILINV then places both children at TEMP0 = the parent's own INVAY (2301-2302), i.e. at the parent's exact depth. We split at TANKER_SPLIT_DEPTH = 0.9 and clamp the children to SPLIT_CHILD_DEPTH = 0.85 (tanker.ts:19).

**W-033 — Tankers carry ONLY flippers until wave 33; fuseball cargo starts at 33 and pulsar cargo at 41**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (s)
- Source: `ALWELG.MAC:615` — `	.BYTE T1,1,32.,ZCARFL`
- Ours: `src/core/rules.ts:266` — `    ['fuseball', level >= 11 ? 4 : 0],`
- **Claim:** NEWTAN (1445-1474) picks the cargo by drawing a random index 0-3 into WTACAR and walking it until it finds a type with openings. WTACAR has four entries: slots 0 and 1 are hard-set to ZCARFL on every wave (CONTOUR, 551-553); slot 2 comes from WWTAC2 (614-617) = ZCARFL for waves 1-32, ZCARFU for 33-40, ZCARPU for 41-99; slot 3 comes from WWTAC3 (618-620) = ZCARFL for waves 1-48, ZCARFU for 49-99. So ALL FOUR slots are flippers for waves 1-32: a tanker cannot carry anything but flippers until wave 33, cannot carry a pulsar until wave 41, and the pulsar cargo lives in only one of four slots even then. We roll fuseball cargo from level 11 and pulsar cargo from level 17, at weights 4 against flipper's 10.

**W-034 — Enemy type selection is a per-type MIN/MAX population solver, not a weighted random table**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (l)
- Source: `ALWELG.MAC:1275` — `	LDA X,WFLMAX`
- Ours: `src/core/rules.ts:244` — `export function rollSpawnKind(level: number, rng: Rng): EnemyKind {`
- **Claim:** NYMCHA (1266-1412) decides what a hatching nymph becomes, in this order: (1) compute per-type 'openings' = WFLMAX[type] - FLIPCO[type] (the live count of that type) for all 5 types; (2) subtract 2 openings of the carried type for EVERY live tanker, so cargo is reserved in advance (1286-1303); (3) clamp openings to the total free invader slots; (4) if exactly one type has openings, take it; (5) otherwise satisfy any type whose live count is below its WFLMIN first (1351-1364); (6) then attempt a 'smart launch' — if both a spiker and a tanker slot are free, look at the enemy line the nymph is standing on and launch a SPIKER on a short/dead line or a TANKER on a long one (1366-1385); (7) failing all that, draw RANDO2 AND 3, add 1 — a random type that EXCLUDES flippers (1386-1389) — and walk from there to the first needy type. Our rollSpawnKind is a single weighted pick from a fixed table (flipper 10, tanker 4, spiker 3, pulsar 3, fuseball 3) with level gates and a per-cycle 'hard' multiplier.

**W-035 — Tankers first appear on wave 3 and spikers on wave 4 — not both on level 5**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (s)
- Source: `ALWELG.MAC:651` — `WTANMX:	.BYTE TZ,1,5,0,0,1,0,1`
- Ours: `src/core/rules.ts:250` — `    ['tanker', level >= 5 ? 4 * hard : 0],`
- **Claim:** WTANMX (651-657) itemises the tanker MAX for waves 1-5 as 0, 0, 1, 0, 1 — so exactly one tanker is allowed on wave 3, none on wave 4, one on wave 5, then 2 for waves 6-16. WTANMI (645-650) itemises the MIN as 0, 0, 1, 0 — wave 3 REQUIRES its tanker. WSPIMX (628-635) itemises the spiker max for waves 1-6 as 0, 0, 0, 2, 3, 4 — the first spiker is possible on wave 4 — and WSPIMI (621-627) makes wave 4 require one. Our gates are `level >= 5` for both, with weights rather than counts.
- **Correction (refuter):** Flag for the user: this directly contradicts an existing internal doc (docs/ux/2026-06-27-enemy-roster-rom-extract.md) that the codebase already cites as its ROM source for the L5+ gates. That doc should be re-checked, not just rules.ts.

**W-037 — From wave 4 every lane STARTS with a spike already on it**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (s)
- Source: `ALWELG.MAC:696` — `TELIHI:	.BYTE TZANDF,1,99.,0,0,0,0E0,0D8,0D4,0D0,0C8,0C0,0B8,0B0,0A8,0A0,0A0,0A0,0A8,0A0,9C,9A,98`
- Ours: `src/core/sim.ts:558` — `  s.spikes = new Array(s.tube.laneCount).fill(0)`
- **Claim:** TELIHI is a TZANDF table (indexed by (wave-1) mod 16) giving NWTELI, the INITIAL height of every enemy line for the new wave. INIENE (303-313) writes that one value into LINEY for all NLINES=16 lines. The bytes are 0, 0, 0, $E0, $D8, $D4, $D0, $C8, $C0, $B8, $B0, $A8, $A0, $A0, $A0, $A8 — so waves 1-3 start clean, and from wave 4 EVERY lane begins with a spike, growing from depth ($F0-$E0)/224 = 0.071 at wave 4 to ($F0-$A0)/224 = 0.357 by wave 13. We reset every lane to zero on every level (advanceLevel, sim.ts:558) and grow spikes only from spikers.
- **Correction (refuter):** Note the array padding: TELIHI actually carries 20 raw bytes after its start/end header, but the AND-0xF indexing only ever reaches the first 16 (indices 0-15); the trailing 4 bytes (0A0,9C,9A,98) are dead data. Doesn't change the finding's conclusion.

**W-039 — Spikes can reach depth 0.929, not 0.75**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (s)
- Source: `ALWELG.MAC:2216` — `	IFCC			;NEW ENEMY LINE?`
- Ours: `src/core/sim.ts:176` — `        s.spikes[sp.lane] = Math.min(SPIKE_MAX_DEPTH, Math.max(s.spikes[sp.lane], sp.depth))`
- **Claim:** JSTRAI (2214-2221) writes the spiker's own INVAY straight into LINEY whenever it is higher than the current line height — the spike IS the spiker's high-water mark, with no cap other than the spiker's own $20 turnaround (W-038). So a fully grown spike reaches depth 0.929, essentially the rim. We clamp the stored spike height to SPIKE_MAX_DEPTH = 0.75 (rules.ts:28) even though we already turn the spiker around at 0.929 — so the last 0.18 of the spiker's climb lays no spike at all.
- **Correction (refuter):** This is not an overlooked bug -- rules.ts:110-115 already documents the exact same 0.929 figure and explicitly states SPIKER_TURNAROUND_DEPTH is kept SEPARATE from SPIKE_MAX_DEPTH on purpose ('story 6-15 deviations') so raising the turnaround doesn't also grow spikes, for warp-balance reasons. The technical divergence is accurate as stated, but recommendation='fix' should account for the fact this was a conscious, already-tracked design decision, not something nobody noticed.

**W-040 — A spiker that bottoms out hops to the NEEDIEST lane (shortest/empty spike); we send it to the TALLEST**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (s)
- Source: `ALWELG.MAC:2272` — `	IFCS			;NEEDIEST LINE SO FAR?`
- Ours: `src/core/sim.ts:169` — `            if (s.spikes[i] > tallest) { tallest = s.spikes[i]; target = i }`
- **Claim:** ASTRAL (2252-2291) is the spiker's relocation routine. Starting from a RANDOM line, it walks all 16 lines and keeps the one with the LARGEST LINEY — and a dead line (LINEY = 0) is scored as $FF, the 'worst case' (2267-2270). Because LINEY is a depth-from-the-rim measure where a larger value means a LOWER tip, the largest LINEY is the SHORTEST spike, and an empty lane beats every spike. So the spiker deliberately goes to the lane that needs a spike most. Our spiker hop (sim.ts:166-175) scans for the TALLEST standing spike and goes there, falling back to a random lane only when no spike exists at all.

**W-042 — The Superzapper kills tankers (it strips their cargo first); ours spares them entirely**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (s)
- Source: `ALWELG.MAC:3563` — `	LDA Y,INVAC2		;MAKE SURE IT'S NOT A CARRIER`
- Ours: `src/core/sim.ts:476` — `    const idx = nearestRimIndex(s, (e) => e.kind !== 'tanker')`
- **Claim:** KILENE's EXIKIL (3562-3566) takes the first live invader it finds, CLEARS the INVCAR bits in its INVAC2, and then explodes it — the carrier bit is stripped precisely so that the kill does not split it. So the arcade's zap DOES destroy tankers; it just denies you the cargo. Our first-zap cadence and our kill-count both filter tankers out (`e.kind !== 'tanker'`, sim.ts:476 and 513), so a tanker survives a full superzap.
- **Correction (refuter):** The claim 'ours spares them entirely' overstates scope. That's true only of the FIRST-press sustained wipe cadence (sim.ts:476/513), which our own code comments (sim.ts:485-487) already document as a deliberate choice ('Spares tankers... vaporises one non-tanker per active frame'). The SECOND press (stepZap's used-once->spent branch) calls nearestRimIndex(s, () => true) with no kind filter and zapKillAt never releases cargo -- so that shot already kills tankers without splitting them, matching the ROM's carrier-strip behavior. The real, narrower divergence is: the sustained multi-frame wipe should also be hitting tankers (cargo-stripped) instead of skipping them outright; the single-shot zap is already correct.

**W-043 — The first zap window is 19 frames and kills once every OTHER frame (8 kills max); ours is 13 frames, one kill per frame**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (s)
- Source: `ALWELG.MAC:3539` — `TIMAX:	.BYTE 0,CSUSTA+<8*<CSUINT+1>>,CSUSTA+<1*<CSUINT+1>>,0,0`
- Ours: `src/core/rules.ts:35` — `export const ZAP_WINDOW_FIRST = 13`
- **Claim:** With CSUSTA=3 and CSUINT=1 (3490-3492), TIMAX resolves to 0, 3+8*2 = 19, 3+1*2 = 5, 0, 0, indexed by SUZCNT. So the first zap runs 19 frames and the second 5. KILENE (3542-3546) only kills when SUZTIM >= CSUSTA (3) AND (SUZTIM AND CSUINT) == 0 — i.e. on every SECOND frame from frame 4 — giving at most 8 kills across the first window (which is exactly what the '8*' in TIMAX is sizing). It also takes the first live invader scanning DOWN from slot WINVMX (3548), which is slot order, not nearest-the-rim. Our ZAP_WINDOW_FIRST is 13 frames with one kill on EVERY active frame (runZapFrame, sim.ts:473-480), targeting the enemy nearest the rim. Our ZAP_WINDOW_SECOND = 5 is correct.

**W-045 — Player charge speed is PCVELO = 9 along-units/frame = 1.143 depth/s; our BULLET_SPEED 2.4 is 2.10x too fast**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (s)
- Source: `ALCOMN.MAC:890` — `PCVELO	=9			;PLAYER SHOT VELOCITY (I)`
- Ours: `src/core/rules.ts:7` — `export const BULLET_SPEED = 2.4       // depth units/sec (near → far); ROM rev-3 frees the slot at ~25 frames / ~0.42s`
- **Claim:** MOVCHA adds PCVELO to a player charge's Y every GAME frame (2540) and retires it when it reaches ILINDDY = $F0 (2549-2554). The well is 224 units deep, so a charge crosses it in 224/9 = 24.9 frames — the frame COUNT is right — but a game frame is nine ~256 Hz IRQ ticks = 35.16 ms (256/9 = 28.44 fps, FR-001), so the crossing takes 0.875 s, not the 0.415 s originally computed. In depth units the ROM's charge speed is 9 * (256/9) / 224 = 256/224 = 1.143 depth/s. Our BULLET_SPEED = 2.4 depth/s is exactly 9 * 60/224 — the same arithmetic with the invented base — so our bullets are 2.10x too fast and cross the well in 0.417 s. The code comment's '~25 frames / ~0.42s' has the frames right and the seconds wrong.

**W-046 — The bullet/enemy hit tolerance (ENSIZE) is 7 along-units for a flipper and 6 for a fuseball; ours is roughly double**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (s)
- Source: `ALWELG.MAC:545` — `	LDA I,<PCVELO+3>/2`
- Ours: `src/core/sim.ts:287` — `const HIT_DEPTH = 0.06`
- **Claim:** COLCHK compares |charge Y - invader Y| against ENSIZE indexed by the invader's TYPE (2963-2964). ENSIZE for the fuseball is set literally to (PCVELO+3)/2 = 6 (545-546). For flippers, tankers and pulsars it is computed by TIMES8 (570-577) as ((255 - hi) + 13) >> 1 where hi is the high byte of speed*8 — which evaluates to 7 at waves 1-16 and 8 at waves 33+. In our depth units (224 along-units = depth 1.0) that is 0.031-0.036 for a flipper and 0.027 for a fuseball. Our HIT_DEPTH is 0.06 (13.4 units, ~1.9x too generous) and our FUSEBALL_HIT_DEPTH is 0.09 (20 units, ~3.3x too generous). Our comment at sim.ts:288-291 asserts the ROM's fuseball tolerance is WIDER than the default; the source shows it is NARROWER (6 vs 7).

**W-047 — A player charge cuts a spike down to its own position, survives two hit-frames, and scores 1 point per frame**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (m)
- Source: `ALWELG.MAC:2602` — `	STA Y,LINEY		;YES. UPDATE LINE ENEMY TO`
- Ours: `src/core/sim.ts:338` — `      s.spikes[b.lane] = Math.max(0, h - SPIKE_SHORTEN)`
- **Claim:** LIFECT (2589-2626) runs from MOVCHA on every frame a player charge is at or past a spike tip: it SLOWS the charge (PCVELO - 4 = 5 units/frame, 2542-2545), sets LINEY to the charge's CURRENT Y — cutting the spike down to exactly where the bullet is — increments the charge's CHARCO counter, awards 1 point (2609-2615), and deactivates the charge once CHARCO reaches 2 (2618-2624). So one shot eats ~2 frames' worth (~10 units, ~0.045 depth) of spike and scores ~2 points, and the spike visibly recedes ahead of the bullet. Ours removes a flat SPIKE_SHORTEN = 0.08 depth, kills the bullet instantly, and awards SCORE_SPIKE_SEGMENT = 3.

#### No counterpart

**W-002 — Nymphs do not exist in our simulation**

- **NO_COUNTERPART** · recommend `fix` (l)
- Source: `ALWELG.MAC:1134` — `	JSR CONYMP		;YES. MAKE IT AN INVADER`
- Ours: *(none — nothing in our code corresponds)*
- **Claim:** The arcade has a second enemy population: NNYMPH=64 nymph slots (ALCOMN.MAC:811). MOVNYM (ALWELG:1107-1174) walks all 64 every frame, decrements each active nymph's NYMPY by 1, rotates it one line every other frame while NYMPY >= $40 (QFRAME AND 1), reserves its line as off-limits once it enters the 'alone zone' (NYMPY < $40), and converts it to a live invader (CONYMP) when NYMPY hits 0. NWNYMC (the per-wave nymph count, TNYMMX) is the wave's whole enemy budget. We have no nymph entity at all: sim.ts spawns enemies straight into the tube from a countdown timer.

**W-032 — Children of a split that happens near the rim are given the NON-FLIPPING cam**

- **NO_COUNTERPART** · recommend `fix` (m)
- Source: `ALWELG.MAC:1498` — `	IFCC			;SPLITTING TOO CLOSE TO PLAYER?`
- Ours: *(none — nothing in our code corresponds)*
- **Claim:** SPLCHA (1494-1505) compares the split depth (TEMP0) against $20 and, if the split is happening within $20 of the rim, routes the child through NEWGEN instead of NEWTY2. NEWGEN assigns the type's DEFAULT cam from TNEWCAM (1483-1484), which for a flipper is NOJUMP — 'YES. NO FLIPPING'. NEWTY2, the normal path, would have given the flipper the wave's WFLICAM program. So a tanker that auto-splits at the rim (the common case — see W-030) always produces two flippers that can only climb, never flip. We have no cam and no such rule; our split children are ordinary enemies.

#### Structural — different by design

**W-048 — Enemy position is an 8.8 fixed-point integer stepped once per LOGIC frame (28.4 Hz = nine ~256 Hz IRQs); ours is a float stepped by dt**

- **STRUCTURAL** · recommend `accept`
- Source: `ALWELG.MAC:1739` — `	ADC Y,WINVIL`
- Ours: `src/core/enemies/flipper.ts:16` — `  e.depth = Math.min(1, e.depth + params.flipperSpeed * dt)`
- **Claim:** JSMOVE (1731-1777) keeps each invader's position as a 16-bit fixed-point pair — INVAYL (fraction) and INVAY (integer, 0 = rim end, $F0 = far end) — and adds the per-type WINVIL/WINVIN increment once per GAME frame with a carry between the bytes. A game frame is one FRTIMR-gated MAINLN pass (ALEXEC.MAC:49-57), i.e. NINE IRQ ticks of a ~256 Hz interrupt (ALHARD.MAC:149-151) = 35.16 ms: 256/9 = 28.44 frames/second. It is NOT one IRQ, and it is not 60 Hz. Every threshold in the game ($20, $30, PULPOT, CURSY) is an integer comparison on INVAY. We carry `depth` as a float in [0,1] and integrate it as depth += speed * dt.

#### Confirmed matches

**W-010 — A mid-flip invader cannot grab the cursor**

- **CONFIRMED**
- Source: `ALWELG.MAC:1982` — `	IFPL			;MOVING (NOT JUMPING)`
- Ours: `src/core/sim.ts:389` — `    (e) => GRABBER_KINDS.has(e.kind) && e.depth >= PLAYER_RIM_DEPTH && e.lane === pl`
- **Claim:** JKITST (1980-1993) tests INVAC1 for IFPL — the INVMOT ($80) bit clear, i.e. the invader is on its lines and NOT jumping — before it will compare INVAL1/INVAL2 against CURSL1/CURSL2 and kill the cursor. A jumping invader passing over the player's lane does not kill. Our resolvePlayerHits excludes flippers with `e.flipping` (sim.ts:390) for exactly this reason.

**W-013 — The L1 and L33 flipper speed anchors (1.375 and 3.375 along-units/frame) are correct**

- **CONFIRMED**
- Source: `ALWELG.MAC:754` — `	.WORD TINVIN,WINVIL`
- Ours: `src/core/rules.ts:148` — `const FLIPPER_ALONG_PER_FRAME_L1 = 1.375`
- **Claim:** TINVIN's wave-1 byte is -44 and its wave-33 byte is -108; TIMES8 multiplies by 8 into an 8.8 fixed-point per-frame increment, giving 44*8/256 = 1.375 and 108*8/256 = 3.375 along-units/frame. Our FLIPPER_ALONG_PER_FRAME_L1 = 1.375 and FLIPPER_ALONG_PER_FRAME_L33 = 3.375 (rules.ts:148-149), and the well spans ILINLIY=$10 to ILINDDY=$F0 = 224 units (ALCOMN.MAC:819-820), matching our WARP_ALONG_SPAN of 224.

**W-015 — Fuseball speed is exactly 2x the invader speed**

- **CONFIRMED**
- Source: `ALWELG.MAC:544` — `	STA WFUSIH		;FUSE INC=2X INVADER SPEED`
- Ours: `src/core/rules.ts:190` — `    fuseballSpeed: 2 * flipperSpeed,   // spd_fuzzball = 2 × spd_flipper (fastest enemy)`
- **Claim:** CONTOUR (539-544) loads WINVIL, does one ASL/ROL through the 16-bit pair and stores it as WFUSIL/WFUSIH — a literal doubling of the invader speed. JFUSEUP (2095-2104) adds WFUSIL/WFUSIH to the fuseball's position. Our fuseballSpeed = 2 * flipperSpeed.

**W-016 — Enemy refire holdoff: 80 frames at wave 1, -3/wave to 23 at wave 20, 20 for 21-64, 10 for 65+**

- **CONFIRMED**
- Source: `ALWELG.MAC:583` — `	.BYTE TA,1,20.,80.,-3`
- Ours: `src/core/rules.ts:97` — `export function enemyFireHoldoffFrames(level: number): number {`
- **Claim:** TCHARFR (582-585) is TA,1,20.,80.,-3 then T1,21.,64.,20. then T1,65.,99.,10. — wave 1 = 80 frames, decreasing 3 per wave to wave 20 = 23, then 20 for waves 21-64, then 10 for 65+. WCHARFR is reloaded into the invader's INVACT on every shot (2719-2720). Our enemyFireHoldoffFrames returns 80 at L1, 80-3*(level-1) for L2..L20 (=23 at L20), 20 for L21-64, 10 for L65+ — identical, and in the same units: ROM GAME frames, converted to seconds only at the call site (sim.ts:223), where the divisor is wrong.

**W-017 — The self-limiting enemy fire probability table (CHANCE) matches ours**

- **CONFIRMED**
- Source: `ALWELG.MAC:2737` — `CHANCE:	.BYTE 0,0E0,0F0,0FA,0FF	;HIGHER CHANCE FOR ENEMY SHOT IF LESS ON SCREEN`
- Ours: `src/core/rules.ts:89` — `const ENEMY_FIRE_CHANCE: readonly number[] = [1.0, 0.125, 0.0625, 0.023, 0.004]`
- **Claim:** FIREIC (2705-2708) draws RANDOM and fires when RANDOM >= CHANCE[ESHCOU], where ESHCOU is the number of enemy shots already on screen. The thresholds 0, $E0, $F0, $FA, $FF give firing probabilities of 256/256 = 1.0, 32/256 = 0.125, 16/256 = 0.0625, 6/256 = 0.0234, 1/256 = 0.0039. Our ENEMY_FIRE_CHANCE is [1.0, 0.125, 0.0625, 0.023, 0.004], indexed the same way (sim.ts:229).

**W-018 — Who may fire: flippers/tankers/spikers always, pulsars only from wave 60, fuseballs never**

- **CONFIRMED**
- Source: `ALWELG.MAC:707` — `TWPULF:	.BYTE T1,60.,99.,ZFIRYE`
- Ours: `src/core/rules.ts:82` — `    case 'pulsar':  return level >= 60`
- **Claim:** FIREIC gates on the INVFIR ($40) bit of INVAC2 (2696-2698). TNEWI2 (1485-1489) sets that bit per type: flipper ZFIRYE, pulsar ZFIRNO, tanker ZFIRYE, spiker(TRALER) ZFIRYE, fuse ZFIRNO. NEWPUL (1434-1438) then ORs WPULFI into the pulsar's byte, and WPULFI comes from TWFULF/TWPULF — which has NO record below wave 60 (so it resolves to 0 via the TE default) and ZFIRYE for waves 60-99. Our enemyCanShoot returns true for flipper/tanker/spiker, level >= 60 for pulsar, false for fuseball.

**W-031 — Split children straddle the parent — lanes L-1 and L+1, parent's lane left empty**

- **CONFIRMED**
- Source: `ALWELG.MAC:2354` — `	ADC I,2`
- Ours: `src/core/enemies/tanker.ts:22` — `    makeEnemy(t.contains, wrapLane(tube, t.lane + 1), depth, params),`
- **Claim:** KILINV computes the first child's line as INVAL1 - 1 (2331-2333) and the second's as that value + 2 (2352-2355), both masked to 0F — so the two children land on the lanes either side of the dead carrier and nothing is left on its own lane. Our splitTanker emits children on wrapLane(lane-1) and wrapLane(lane+1).

**W-036 — Fuseballs first appear on wave 11 and pulsars on wave 17**

- **CONFIRMED**
- Source: `ALWELG.MAC:663` — `	.BYTE TZ,17.,32.,5,3,2,2,2,2,2,2,2,2,2,2,2,3,4,2`
- Ours: `src/core/rules.ts:252` — `    ['pulsar', level >= 17 ? 3 * hard : 0],`
- **Claim:** WPULMX's first record starts at wave 17 (663) and WPULMI's at wave 17 (659); with no earlier record the CONTOUR scan falls through to TE and yields 0, so the pulsar max is 0 below wave 17. WFUSMX's first record is T1,11.,16.,1 (672) and WFUSMI's is the same (667), so the fuseball max is 0 below wave 11. Our gates are `level >= 17` for pulsars and `level >= 11` for fuseballs (rules.ts:252-253).

**W-038 — The spiker turns around at Y = $20 (depth 0.929)**

- **CONFIRMED**
- Source: `ALWELG.MAC:2223` — `	CMP I,20`
- Ours: `src/core/enemies/spiker.ts:13` — `  if (e.depth >= SPIKER_TURNAROUND_DEPTH) {`
- **Claim:** JSTRAI (2222-2229) compares the spiker's INVAY against $20; when it climbs past it ('MAX HEIGHT?'), it sets the ZDIRDO bit to send it back down and pins INVAY at $20. That is depth ($F0-$20)/224 = 0.929, which is exactly our SPIKER_TURNAROUND_DEPTH (rules.ts:115).

**W-041 — A bottomed-out spiker with no nymphs left converts into a flipper-carrying tanker**

- **CONFIRMED**
- Source: `ALWELG.MAC:2240` — `	ORA I,ZCARFL		;CARRYING FLIPPERS`
- Ours: `src/core/sim.ts:161` — `            moved.push(makeEnemy('tanker', sp.lane, 0, params, 'flipper'))`
- **Claim:** JSTRAI (2236-2247): when the spiker reaches the bottom of its range and NYMCOU is zero, it rewrites INVAC2's carrier bits to ZCARFL and INVAC1's appearance bits to ZABTAN — it becomes a tanker carrying flippers, and CAMSTA is set to 0 so the CAM branches it out of TRALUP into NOJUMP (2381). Our spiker does exactly this when s.spawn.remaining === 0, spawning a flipper-carrying tanker at depth 0.

**W-044 — Eight player charges may be in flight at once**

- **CONFIRMED**
- Source: `ALCOMN.MAC:812` — `NPCHARG=8`
- Ours: `src/core/rules.ts:8` — `export const MAX_BULLETS = 8`
- **Claim:** NPCHARG = 8 player charge slots (NICHARG = 4 more for enemy shots). FIREPC (2661-2681) scans slots NPCHARG-1..0 for a vacancy and simply does nothing if all eight are busy. Our MAX_BULLETS = 8, enforced the same way in stepFiring (sim.ts:96).


### 6.3 The warp / drop mode — `ALWELG` (INDROP / MOVCUD / PLDROP / ANALYZ)

Two structural facts dominate this subsystem and neither is a constant. First, **the ROM dives the camera**: `MOVCUD` advances the eye by the *same velocity* as the cursor every frame, so `(CURSY - EY)` is invariant — the Claw's size and screen position do not change at all, and the well expands and streams past it. We do the inverse: we shrink the Claw down a static tube. Second, **a spike crash costs you the wave**, not just a life; the wave counter is bumped in exactly one place (`ENDWAV`), reachable only on a successful arrival. Our respawn promotes the player to the next geometry anyway, which turns AVOID SPIKES from a threat into advice. The per-frame magnitudes we extracted (2.0, `$20`, `$30`, 224) are all correct; only the seconds are wrong.

#### Divergences

**WD-010 — warpAccel is fed a 1-based level where the ROM feeds 0-based CURWAV - the whole ramp is one level early**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (s)
- Source: `ALWELG.MAC:280` — `LEVEL:	;TABLE OF LEVEL #S(-1) FOR RATING DISPLAY`
- Ours: `src/core/rules.ts:51` — `  const perFrame8_8 = Math.min(level * 4, 0x30) + 0x20  // 1/256 along-units / frame²`
- **Claim:** The ROM's accel input is CURWAV, which is 0-based: the displayed level is CURWAV+1 (ALSCOR.MAC:296-298 'LDA CURWAV / CLC / ADC I,1'), the start-level table is 'TABLE OF LEVEL #S(-1)' (ALWELG.MAC:280), and INIRAT seeds it with 0 (ALWELG.MAC:192-193). Our warpAccel(level) takes the DISPLAYED 1-based level straight from GameState.level. Concretely at displayed level 1: ROM accel = min(0*4, 0x30) + 0x20 = 0x20 = 32/256 = 0.125 along/frame^2; ours = min(1*4, 0x30) + 0x20 = 0x24 = 36/256 = 0.1406 - 12.5% too much. The saturation point moves too: the ROM caps once CURWAV >= 12, i.e. displayed level 13; we cap at displayed level 12. Every level's dive accelerates as if it were the next level.

**WD-011 — The ROM's wave*4 is an 8-bit ASL pair that wraps at wave 64, collapsing the dive accel back to the base**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `wont_fix`
- Source: `ALCOMN.MAC:665` — `CURWAV:	.BLKB 1		;CURRENT WAVE`
- Ours: `src/core/rules.ts:51` — `  const perFrame8_8 = Math.min(level * 4, 0x30) + 0x20  // 1/256 along-units / frame²`
- **Claim:** 'LDA CURWAV / ASL / ASL' (ALWELG.MAC:1064-1066) is two 8-bit shifts with no carry capture, so for CURWAV >= 0x40 (displayed level 65) the product wraps: CURWAV=0x40 -> 0x00, giving accel = 0x00 + 0x20 = 0x20 - the same acceleration as level 1 - and it climbs from there again (displayed levels 65..76 before re-saturating). Our Math.min(level * 4, 0x30) is arbitrary-precision and never wraps, so from level 65 up our dive is faster than the arcade's.

**WD-012 — The ROM dives the CAMERA with the Claw - the Claw's size is constant and the well expands; we shrink the Claw down a static tube**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (l)
- Source: `ALWELG.MAC:1049` — `	LDA EYLL		;UPDATE EYE POSITION`
- Ours: `src/core/sim.ts:570` — `function warpClawDepth(progress: number): number {`
- **Claim:** MOVCUD advances the eye by the SAME velocity as the cursor, every frame: 'LDA EYLL ;UPDATE EYE POSITION / CLC / ADC CURSVL / STA EYLL / LDA EYL / ADC CURSVH / IFCS / INC EYH / ENDIF' (ALWELG.MAC:1049-1057), and forces the well to be re-projected whenever the eye moves ('CMP EYL / IFNE ;EYE POSITION CHANGE? / INC ROTDIS ;YES. REQUEST NEW WELL DISPLAY', 1058-1061). EYL/EYH is the camera: the projection routine is documented ';INPUT: PYL = OBJECT DEPTH ;EYL,H=EYEPOSITION' (ALDISP.MAC:1449) and scales every object by (PYL - EY). Because the cursor is drawn at PYL = CURSY (ALDISP.MAC:604-608) and BOTH CURSY and EY advance by exactly CURSVH:CURSVL each frame, (CURSY - EY) is INVARIANT across the dive - the Claw's projected size and screen position do not change at all. What changes is the well: its rim (fixed at 0x10) and bottom (fixed at 0xF0) get nearer to the advancing eye, so the tube expands and streams past the stationary Claw. Our model is the inverse: warpClawDepth(progress) = 1 - progress marches the Claw down a STATIC tube, and render.ts:876 shrinks it ('const size = 6 + clawDepth * 14') toward the vanishing point.

**WD-013 — The starfield does not appear until the dive is ~29% down the tube (CURSY >= 0x50)**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (s)
- Source: `ALWELG.MAC:1042` — `	CMP I,50`
- Ours: `src/shell/render.ts:949` — `    drawStarfield(pctx, W, H)`
- **Claim:** MOVCUD only kicks the starfield off once the Claw has descended past 0x50: 'LDA CURSY / CMP I,50 / IFCS / LDA PLAGRO / IFEQ / JSR INSTAR / ENDIF / ENDIF' (ALWELG.MAC:1041-1048). CURSY starts at 0x10, so INSTAR fires only after (0x50 - 0x10) / 224 = 64/224 = 28.6% of the dive has elapsed, and INSTAR then activates a single plane at 0xF0 (ALWELG.MAC:3421-3424). Our renderer draws the starfield unconditionally for every frame the mode is 'warp' (render.ts:946-949), i.e. from progress 0 - including during the AVOID SPIKES hold, when the ROM's Claw has not moved at all and PLAGRO is still 0.

**WD-014 — The player can still FIRE during the drop, and in-flight charges keep moving; we disable firing and clear the bullets**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (m)
- Source: `ALWELG.MAC:891` — `	JSR FIREPC		;FIRE PLAYER CHARGES`
- Ours: `src/core/sim.ts:748` — `      stepPlayer(s, input) // the Claw may still rotate during the warp; firing is disabled`
- **Claim:** The drop-mode mainline PLDROP (ALWELG.MAC:884-897) calls, every frame: MOVCUR (rotate), MOVCUD (descend), PROEXP (explosions), FIREPC ('JSR FIREPC ;FIRE PLAYER CHARGES', 891) and MOVCHA ('JSR MOVCHA', 892). FIREPC in a real game reads the fire button ('LDA SWSTAT / AND I,MFIRE', ALWELG.MAC:2657-2658) and launches a charge from CURSY - the Claw's CURRENT depth - (ALWELG.MAC:2667-2668), so you can shoot all the way down the tube. Our warp branch runs only stepPlayer + stepWarp, with firing explicitly disabled, and checkLevelClear wipes any in-flight bullets on entry ('s.bullets = []', src/core/sim.ts:549).

**WD-015 — Landing on a spike replays the SAME wave in the ROM; we award the level anyway**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (m)
- Source: `ALWELG.MAC:3075` — `	LDA I,CENDLI		;YES. GO TO END OF LIFE STATE`
- Ours: `src/core/sim.ts:411` — `    advanceLevel(s)`
- **Claim:** A spike hit in MOVCUD kills the cursor (INPPSQ, ALWELG.MAC:1094). PLDROP then routes to ANALYZ ('LDA CURSL2 / IFMI ;CURSOR DEAD? / JSR ANALYZ', ALWELG.MAC:893-895), whose dead-cursor branch drags the corpse to the bottom of the well and enters 'LDA I,CENDLI ;YES. GO TO END OF LIFE STATE' (ALWELG.MAC:3075). CENDLI -> ENDLIF spends a life. The wave counter is bumped in exactly ONE place - ENDWAV ('INC CURWAV', ALEXEC.MAC:367) - which is reached only via QSTATE = CENDWAV, and MOVCUD sets that only on a SUCCESSFUL arrival at the bottom (ALWELG.MAC:1035). So a warp crash costs a life AND the wave: you replay the same level, and BONSCO (the end-of-wave bonus, ALEXEC.MAC:371-373) never runs. Our respawn() does the opposite: 'if (s.warp.progress > 0) { advanceLevel(s); return }' (src/core/sim.ts:410-412) - you die, lose a life, and are still promoted to the next geometry.
- **Correction (refuter):** One factual error in the finding's own supporting reasoning: it claims 'the ROM avoids that [re-crash] loop differently: the respawned wave re-runs INIENE, which re-initialises the enemy lines, so the spike the player died on is gone.' This is false. INIENE (which resets LINEY, the spike heights) is called only from INEWAV (ALWELG.MAC:24-27), which is reached only via ENDWAV->INEWAV on a genuine new wave. A life-loss respawn on the SAME wave goes NEWLIF->INEWLI (ALEXEC.MAC:343, ALWELG.MAC:37-44), which calls INICHA/INIINV/ININYM/INIEXP/CLRPOT/INIDSP — never INIENE. So the enemy lines (spikes) are NOT reset on a same-wave respawn; a persistent spike remains exactly where it was. The ROM's actual defense against an instant re-crash loop is structural, not data-reset: a warp-crash death returns the player to normal PLAY of the SAME wave (with any surviving enemies), not directly back into another drop attempt — the player must clear the wave a second time before re-entering drop mode, during which the spike layout can change (via Spikers or the player's own shots) or not. The primary claim (advanceLevel() is wrong; the ROM replays the wave) is unaffected by this correction and remains confirmed.

**WD-016 — The dive starts with live enemies still parked at the rim; our gate needs an empty board**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `accept`
- Source: `ALWELG.MAC:3111` — `	BCS LINER		;EXIT IF LINER (NOT AT TOP)`
- Ours: `src/core/sim.ts:538` — `  if (s.enemies.length === 0 && s.spawn.remaining === 0) {`
- **Claim:** ANALYZ decides to start the drop (ALWELG.MAC:3101-3117) when the cursor is alive and at the top, all nymphs are converted and all explosions are done ('LDA NYMCOU / ORA EXPCOU / IFEQ', 3103-3105), and no invader is still down the well: the loop tests 'LDA Y,INVAY / IFNE / CMP I,11 / BCS LINER ;EXIT IF LINER (NOT AT TOP)' (3108-3111) - only invaders with INVAY >= 0x11 abort the drop. An invader sitting AT the rim (INVAY <= 0x10 = ILINLIY) does not, so the ROM will warp out from under a still-living flipper or fuseball that has reached the top. Our gate is 'if (s.enemies.length === 0 && s.spawn.remaining === 0)' - any living enemy anywhere, including one at the rim, blocks the warp indefinitely.

**WD-017 — The dive's thrust rumble starts on the first DESCENDING frame, not at level-clear**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (s)
- Source: `ALWELG.MAC:1022` — `	JSR SOUTS2		;YES. START RUMBLE`
- Ours: `src/shell/audio-dispatch.ts:49` — `        audio.startLoop('levelClear')`
- **Claim:** MOVCUD starts the rumble only once, on the frame the Claw is still exactly at the top and about to move: 'LDA CURSY / CMP I,ILINLI / IFEQ ;STILL AT TOP? / JSR SOUTS2 ;YES. START RUMBLE' (ALWELG.MAC:1019-1023). MOVCUD does not run at all during the AVOID SPIKES pause (QSTATE is CPAUSE, not CDROP), so the rumble is silent for the entire warning hold — 30 ROM frames ≈ 1.06 s (WD-009, FR-004) — and begins the instant the descent does. Our sustained warp cue is started from the 'level-clear' event - i.e. at warp ENTRY, before the countdown - so it hums under the whole AVOID SPIKES hold. Separately, the ROM starts a NEW sound at the bottom ('JSR SOUTS3 ;START SPACE SOUND', ALWELG.MAC:1037) where we only stop ours ('warp-end').
- **Correction (refuter):** Trivial: the title states the warning hold as '~1.06 s'; 30/(256/9) = 1.0549s, which rounds to 1.05s (the reasoning body itself correctly says 1.055s). Title is off by 0.01s — cosmetic only, does not affect the verdict.

#### The book was wrong

**WD-009 — AVOID SPIKES hold is 30 frames ≈ 1.06 s in the ROM (6 quarter-seconds by the author's own arithmetic), not the 0.5 s we ship**

- **BOOK_WAS_WRONG** · verdict **CONFIRMED** · recommend `fix` (s)
- Source: `ALWELG.MAC:3164` — `	LDA I,6*QUASEC		;WARNING DELAY`
- Ours: `src/core/rules.ts:57` — `export const WARP_AVOID_SPIKES_SECONDS = 0.5`
- **Claim:** INDROP loads the pause timer with 'LDA I,6*QUASEC ;WARNING DELAY' (ALWELG.MAC:3164) into QTMPAUS (3165). QUASEC is defined as 'QUASEC =SECOND/4 ;QUARTER SECOND FACTOR' (ALCOMN.MAC:88) with SECOND = 20 (ALCOMN.MAC:87), so 6*QUASEC = 30 FRAMES — the multiplier 6 is six quarter-seconds by the author's assumed rate. QTMPAUS is decremented once per frame here: the PAUSE handler gates on 'LDA QFRAME / AND PSCALE / IFEQ' (ALEXEC.MAC:115-117) and PSCALE is reset to 0 at the end of every pause (ALEXEC.MAC:125-126, 'RESET STANDARD TIMER SCALE'), and INDROP never sets it — so the mask is 0 and every frame ticks. The frame COUNT is 30 and is certain; the SECONDS are not 1.5 (which would require SECOND=20 to be the real frame rate — it is a pause-timer unit, not the machine's rate, FR-004) but 30/28.44 = 1.055 s. We ship WARP_AVOID_SPIKES_SECONDS = 0.5 — exactly the correct 30 frames divided by the wrong 60 Hz — less than half the arcade's warning.

#### No counterpart

**WD-018 — After the dive the ROM flies the eye INTO the new well over many frames; we swap geometry instantly**

- **NO_COUNTERPART** · recommend `fix` (l)
- Source: `ALWELG.MAC:85` — `	LDA EYL			;MOVE EYE CLOSER TO WELL`
- Ours: *(none — nothing in our code corresponds)*
- **Claim:** Reaching the bottom does not start the next wave. MOVCUD sets QSTATE = CENDWAV ('LDA I,CENDWA ;YES. INITIALIZE SPACE MODE', ALWELG.MAC:1035) and pins CURSY at 0xFF. That runs ENDWAV (wave increment + bonus) and then NEWAV2 (ALWELG.MAC:56-121), which each frame walks the eye toward the new well - 'LDA EYL ;MOVE EYE CLOSER TO WELL / CLC / ADC I,18 / STA EYL' (ALWELG.MAC:85-88), 0x18 = 24 units per frame - kills the starfield when the eye passes 0xFC ('LDA I,1 / STA PLAGRO ;TURN OFF STAR FIELD', 94-95), and only hands control back with 'LDA I,CPLAY ;GO PLAY GAME' (109) once the eye reaches EYLDES. The starfield keeps running through all of it (PRSTAR is driven from EXSTAT every frame while PLAGRO != 0). We have no counterpart: stepWarp calls advanceLevel(s) the frame progress crosses 1, and 'warp' mode ends immediately.

#### Structural — different by design

**WD-008 — The dive's frames-to-seconds base is wrong: the ROM's logic frame runs at 256/9 = 28.44 fps — not 60, and not the '~20' this finding first read off SECOND**

- **STRUCTURAL** · recommend `fix` (l)
- Source: `ALCOMN.MAC:87` — `SECOND	=20.			;FRAMES/SECOND`
- Ours: `src/core/rules.ts:46` — `export const WARP_INITIAL_SPEED = (2.0 * 60) / WARP_ALONG_SPAN`
- **Claim:** Our warp constants convert ROM per-frame values with a 60 Hz base: WARP_INITIAL_SPEED = (2.0 * 60) / 224 and warpAccel multiplies by (60 * 60). That base is invented — but so is the 20 this finding originally took from 'SECOND =20. ;FRAMES/SECOND' (ALCOMN.MAC:87, re-declared ALEXEC.MAC:312). SECOND sits under the header ';TIMING FOR PAUSE STATE' (ALCOMN.MAC:85) and is used in exactly one role, as the reload unit for pause/attract countdowns (QUASEC = SECOND/4, ALCOMN.MAC:88); it never appears in MAINLN, in the IRQ, or in any speed table, so it cannot set the frame rate (FR-004). The machine settles it: the mainloop gates each frame on 'LDA FRTIMR / CMP I,9' (ALEXEC.MAC:50-51), FRTIMR is bumped once per IRQ ('INC FRTIMR ;UPDATE FRAME TIMER', ALHARD.MAC:149), and the IRQ handler treats a wrap of the 8-bit $INTCT as one second ('INC $INTCT ;INTERRUPT COUNTER / IFEQ ;ANOTHER SECOND?', ALHARD.MAC:150-151) — so the IRQ is ~256 Hz, one logic frame is nine ticks = 35.16 ms, and the rate is 256/9 = 28.44 fps, exactly what Theurer writes beside the enemy tables (';FRAMES UNTIL INVADER CAN FIRE (28 PER SECOND)', ALWELG.MAC:581). Concretely for the dive at displayed level 1 (CURWAV=0, accel = 0x20/256 = 0.125 along/frame^2, v0 = 2.0 along/frame): 224 = 2t + 0.0625t^2 gives t ≈ 46 frames = 1.62 s at 28.44 fps — not the 2.35 s computed here from SECOND=20. Our model produces ~0.73 s, so our dive is 2.2x too fast.

#### Confirmed matches

**WD-001 — WARP_ALONG_SPAN = 224 is the exact ROM dive span (ILINLIY 0x10 -> ILINDDY 0xF0)**

- **CONFIRMED**
- Source: `ALCOMN.MAC:819` — `ILINDDY=0F0`
- Ours: `src/core/rules.ts:44` — `export const WARP_ALONG_SPAN = 0xf0 - 0x10  // 224 ROM along-units across the dive`
- **Claim:** The Claw ('cursor') starts a level at CURSY = ILINLIY (ALCOMN.MAC:820 'ILINLIY=010', set by INICUR at ALWELG.MAC:296-297 'LDA I,ILINLIY / STA CURSY', and re-set for each new wave by NEWAV2 at ALWELG.MAC:57-58). MOVCUD ends the dive when CURSY reaches ILINDDY = 0xF0 (ALWELG.MAC:1032 'CMP I,ILINDDY', 1034 'IFCS ;IS CURSOR PAST BOTTOM?'). The traversed span is therefore exactly 0xF0 - 0x10 = 224 along-units. We ship WARP_ALONG_SPAN = 0xf0 - 0x10 = 224.

**WD-002 — Initial dive speed 2.0 along-units/frame (CURSVH=2, CURSVL=0) matches our 2.0 numerator**

- **CONFIRMED**
- Source: `ALWELG.MAC:3148` — `	LDA I,2`
- Ours: `src/core/rules.ts:46` — `export const WARP_INITIAL_SPEED = (2.0 * 60) / WARP_ALONG_SPAN`
- **Claim:** INDROP (ALWELG.MAC:3137-3149) zeroes the velocity's fractional byte ('LDA I,0 / STA CURSVL', 3143-3144) and loads the integer byte with 2 ('LDA I,2 / STA CURSVH', 3148-3149). CURSVH:CURSVL is an 8.8 fixed-point along-units/frame value, so the dive starts at 0x0200/256 = 2.0 along-units per frame. Our WARP_INITIAL_SPEED = (2.0 * 60) / WARP_ALONG_SPAN uses exactly that 2.0 as the per-frame rate. (The '60' in that expression is a separate problem - see WD-008.)

**WD-003 — warpAccel's shape - min(wave*4, 0x30) + 0x20 in 8.8 fixed point - is byte-for-byte the ROM's**

- **CONFIRMED**
- Source: `ALWELG.MAC:1064` — `	LDA CURWAV		;WAVE ACCELERATION +`
- Ours: `src/core/rules.ts:51` — `  const perFrame8_8 = Math.min(level * 4, 0x30) + 0x20  // 1/256 along-units / frame²`
- **Claim:** MOVCUD's 'CONSTANT ACCELERATION FOR VELOCITY' block (ALWELG.MAC:1063-1078) is: LDA CURWAV / ASL / ASL (wave*4) / CMP I,30 / IFCS / LDA I,30 (cap at 0x30) / CLC / ADC I,20 (base 0x20) / CLC / ADC CURSVL / STA CURSVL / LDA CURSVH / ADC I,0 / STA CURSVH. The accel byte is added to the velocity's LOW byte, i.e. it is in units of 1/256 along-units per frame squared. Our perFrame8_8 = Math.min(level * 4, 0x30) + 0x20, divided by 256, is the identical expression - including the *4, the 0x30 cap and the 0x20 base, and including the 8.8 scaling.

**WD-004 — AVOID SPIKES fires on ANY live spike anywhere in the well, not just the player's lane**

- **CONFIRMED**
- Source: `ALWELG.MAC:3154` — `	INC ELICNT		;COUNT LIVE SPIKES`
- Ours: `src/core/sim.ts:546` — `    const spikeThreat = s.spikes.some((h) => h > 0)`
- **Claim:** INDROP counts live enemy lines across ALL 16 lanes before deciding to warn: 'LDX I,NLINES-1 / BEGIN / LDA X,LINEY / IFNE / INC ELICNT ;COUNT LIVE SPIKES / ENDIF / DEX / MIEND' (ALWELG.MAC:3150-3157), then 'LDA ELICNT / IFNE ;ENEMY LINES?' (3158-3159). It does NOT check whether the spike is on the player's own lane. Our spikeThreat = s.spikes.some((h) => h > 0) is the same any-lane predicate.

**WD-005 — WARP_AVOID_SPIKES_MAX_LEVEL = 7 is the correct boundary once CURWAV's 0-base is accounted for**

- **CONFIRMED**
- Source: `ALWELG.MAC:3161` — `	CMP I,7`
- Ours: `src/core/rules.ts:58` — `export const WARP_AVOID_SPIKES_MAX_LEVEL = 7`
- **Claim:** INDROP warns only when 'LDA CURWAV / CMP I,7 / IFCC ;WARN PLAYER?' (ALWELG.MAC:3160-3162) - carry-clear means CURWAV < 7, i.e. CURWAV in 0..6. CURWAV is 0-based: ALSCOR.MAC:296-299 draws the level number as 'LDA CURWAV / CLC / ADC I,1 / JSR DSP1HX', and the start-level table is commented 'TABLE OF LEVEL #S(-1)' (ALWELG.MAC:280). So the ROM warns on DISPLAYED levels 1..7. Our gate is `s.level <= WARP_AVOID_SPIKES_MAX_LEVEL` with s.level 1-based and the constant 7 - levels 1..7. Identical.

**WD-006 — The AVOID SPIKES warning is a hold at the rim BEFORE the dive, with the spinner still live**

- **CONFIRMED**
- Source: `ALWELG.MAC:3166` — `	LDA I,CPAUSE		;PAUSE FIRST`
- Ours: `src/core/sim.ts:599` — `  if (s.warp.warning > 0) {`
- **Claim:** When it warns, INDROP does not enter drop mode: it sets 'LDA I,CPAUSE / STA QSTATE ;PAUSE FIRST' then 'LDA I,CDROP / STA QNXTSTA ;THEN DROP MODE' (ALWELG.MAC:3166-3169), so the Claw sits at CURSY = ILINLIY for the whole timer with no descent and no spike check. The PAUSE state handler still rotates the player - it ends with 'JMP MOVCUR ;UPDATE CURSOR (IF ALIVE)' (ALEXEC.MAC:129). Our stepWarp returns early while s.warp.warning > 0 (no velocity integration, no resolveWarpSpikeHit), and stepPlayer still runs every warp frame (src/core/sim.ts:748).

**WD-007 — Spike crash test - own lane only, triggered when the descending Claw passes the spike tip**

- **CONFIRMED**
- Source: `ALWELG.MAC:1090` — `	IFEQ			;SAME LINE AS CURSOR?`
- Ours: `src/core/sim.ts:580` — `  if (height > 0 && warpClawDepth(s.warp.progress) <= height) {`
- **Claim:** MOVCUD's collision loop (ALWELG.MAC:1082-1103) runs only while CURSY < ILINDDY, and per lane requires the line to be alive ('LDA X,LINEY / IFNE ;ACTIVE LINE?'), to be the player's lane ('CPX CURSL1 / IFEQ ;SAME LINE AS CURSOR?', 1089-1090) and then 'CMP CURSY / IFCC' (1091-1092), i.e. LINEY < CURSY - the cursor's along-coordinate has passed the spike's tip. Mapping the ROM's along axis to our depth (depth = (0xF0 - along)/224), LINEY < CURSY is exactly clawDepth <= spikeHeight. Our check is `height > 0 && warpClawDepth(s.warp.progress) <= height` on currentLane only. Same predicate, same lane restriction, boundary differs only by strict-vs-inclusive on an exact float tie.


### 6.4 Shapes, glyphs and colour — `ALVROM.MAC` / `ALLANG.MAC`

The two strongest fidelity results in the whole audit live here: the **player's claw** (all eight NCRS roll frames, vertex-exact, yellow) and the **flipper** (8-vector chain, vertex-exact, red). Nine of the ROM's message strings carry their exact 1981 wording and colour. Everything else drawn from ALVROM is a procedural approximation standing in for hand-authored art — the tanker is a plain rhombus where the ROM has a 17-vertex laced double diamond; the fuseball is a 3-colour starburst where the ROM has a 5-colour scribble; the spiker is *orange*, a colour that does not exist in the ROM's eight-slot palette at all. And the palette itself is the deepest finding in the group: the ROM swaps all eight colour slots every 16 waves, recolouring the entire cast together.

#### Divergences

**V-005 — The pulsar bar's four flatter variants are amplitude-scaled, not the ROM's four hand-authored chains**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (s)
- Source: `ALDISP.MAC:2034` — `	VEC 6,0`
- Ours: `src/shell/glyphs.ts:168` — `const PULSAR_AMP: readonly number[] = [1, 0.6, 0.35, 0.15, 0] // variant 0 sharpest .. 4 flat`
- **Claim:** The ROM has five DISTINCT chains (ALDISP.MAC 2001-2035): PULS4 = (2,-3)(1,6)(1,-6)(1,6)(1,-6)(2,3) — 6 drawn vectors; PULS3 = move(1,0) then (1,-2)(1,4)(1,-4)(1,4)(1,-4)(1,2) — 6 drawn vectors, x-stride 1 throughout, amplitude 4; PULS2 = move(1,0) then (1,-1)(1,2)(1,-2)(1,2)(1,-2)(1,1) — amplitude 2; PULS1 = move(1,0) then (2,-1)(2,2)(2,-1) — only THREE drawn vectors; PULS0 = move(1,0) then (6,0) — ONE flat 6-unit vector. Ours keeps one delta table (PULSAR_XD [2,1,1,1,1,2], PULSAR_YD y = -3,6,-6,6,-6,3) — which reproduces PULS4 exactly — and derives the other four by multiplying y by 1/0.6/0.35/0.15/0 (glyphs.ts 164-185): every variant keeps 6 segments and the 2/1/1/1/1/2 x-stride, so PULS1's 3-segment and PULS0's 1-segment forms are never drawn. Selection also inverts at the top: PULTAB clamps index >= 5 to CPULS0 (FLAT) (ALDISP.MAC 875-878, 893), while pulsarVariant() maps index 5 to PULSAR_DP_T1[5]=0x09 → variant 0 (SHARPEST) (glyphs.ts 189-194).

**V-006 — The tanker body is a 4-vertex diamond; the ROM's GENTNK is a 17-vertex double diamond with an internal X**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (s)
- Source: `ALVROM.MAC:651` — `GENTNK:	CSTAT PURPLE`
- Ours: `src/shell/glyphs.ts:95` — `    points: [{ x: 0, y: -9 }, { x: 6, y: 0 }, { x: 0, y: 9 }, { x: -6, y: 0 }],`
- **Claim:** GENTNK (ALVROM.MAC 651-669, CM=2 CD=1) is a chain of SCVEC ABSOLUTE vertices (the CVEC macro, ALVROM.MAC 68-78, emits the delta to each new absolute point). Entering from TANKR's blank move to (20,0) it draws, in hex object units: (20,0) → (0,20) → (0,0C) → (20,0) → (0C,0) → (0,0C) → (-0C,0) → (0,20) → (-20,0) → (-0C,0) → (0,-0C) → (-20,0) → (0,-20) → (0,-0C) → (0C,0) → (0,-20) → (20,0) → (0C,0). Decimal, x2 for CM: an OUTER diamond at (+/-64,0),(0,+/-64), an INNER diamond at (+/-24,0),(0,+/-24), and the eight chords that lace them into an X. Ours is a single 4-point diamond (0,-9)(6,0)(0,9)(-6,0), i.e. only the outer ring, and elongated (9 tall x 6 wide) where the ROM's is square (equal x/y extent). Colour is right: ALCOMN.MAC 368 `TANCOL=PURPLE`, ours color:'purple' (glyphs.ts 97).

**V-007 — Tanker cargo emblems: the ROM prefixes a TURQOI chevron (pulsars) or a 4-colour bar (fuses), not our cyan zigzag / yellow cross**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (s)
- Source: `ALVROM.MAC:626` — `	CSTAT TURQOI`
- Ours: `src/shell/glyphs.ts:104` — `      ? { points: [{ x: -3, y: 0 }, { x: -1, y: -2 }, { x: 1, y: 2 }, { x: 3, y: 0 }], closed: false, color: 'cyan' }`
- **Claim:** TANKP (pulsar tanker, ALVROM.MAC 624-633) prefixes GENTNK with ONE turquoise open chain: blank move to (-5,-2), then draw (-3,6) (0,-6) (3,6) (5,-2) — a W/chevron spanning the body. TANKF (fuse tanker, ALVROM.MAC 634-647) prefixes a FOUR-colour mark: CSTAT BLUE draw to (-0C,0); blank to (0,0C); CSTAT RED dot at (0,0C); CSTAT GREEN draw to (0,-0C); CSTAT YELLOW draw to (0C,0). TANKR (flipper tanker, ALVROM.MAC 648-650) has no mark, and TANTAB confirms the three-way pick (ALDISP.MAC 696 `TANTAB: .BYTE PTTANK,PTTANK,PTTANP,PTTANF`). Ours: pulsar cargo = a 4-point cyan zigzag (-3,0)(-1,-2)(1,2)(3,0); fuseball cargo = a single yellow 4-point cross (glyphs.ts 104-105); flipper cargo = no emblem (correct).
- **Correction (refuter):** The RED segment of the fuse-tanker emblem is not a stand-alone dot — it is a real 0xC-unit line from (0,0xC) down to the origin, the top arm of a symmetric 4-colour plus/cross (BLUE left, RED top, GREEN bottom, YELLOW right), not '3 lines + 1 dot'.

**V-008 — The spiker (Theurer's 'traler') is a GREEN 21-point authored spiral in 4 hand-drawn phases; ours is an ORANGE 12-point procedural spiral rotated 90 degrees per frame**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (m)
- Source: `ALVROM.MAC:522` — `	CSTAT GREEN`
- Ours: `src/shell/glyphs.ts:120` — `  return [{ points: rotPoints(SPIKER_BASE, a), closed: false, color: 'orange' }]`
- **Claim:** SPIRA1-4 (ALVROM.MAC 516-620; PICLO entry `PITAB SPIRA1,PTSPI1 ;SPIRALS`, ALVROM.MAC 2110) are FOUR separately-authored 21-vertex spirals, each opening `CSTAT GREEN`, CM=2 CD=1. SPIRA1's absolute vertices (hex object units) are (1,-1) (0,-2) (-2,-2) (-4,0) (-4,4) (0,6) (5,5) (8,0) (7,-7) (0,-0A) (-8,-8) (-0C,0) (-9,9) (0,0E) (0B,0B) (10,0) (0C,-0C) (0,-12) (-0E,-0E) (-14,0) (-0F,0F) — an outward-winding spiral of steadily growing radius. SPIRA2/3/4 are the same spiral advanced one quarter-turn but re-authored, not rotated. Ours is 12 points on r = 2 + 0.7i at 60-degree steps, coloured ORANGE, with the 4 frames produced by rotating that one curve by 90 degrees (glyphs.ts 112-121). ALCOMN.MAC 369 `TRACOL=GREEN` fixes the colour.
- **Correction (refuter):** SPIRA2/SPIRA3/SPIRA4 are NOT independently re-authored data distinct from a rotation — they are exact 90/180/270-degree rotations of SPIRA1 (verified point-by-point). The claim's 'advanced one quarter-turn but re-authored, not rotated' is backwards; only the colour (orange vs GREEN) and vertex-count/winding-rate (12 @ 60deg vs 21 @ 45deg) divergences should be relied on.

**V-009 — Enemy shot: colours (white hooks + red dots) are right, the hook geometry and the frame source are not**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (s)
- Source: `ALVROM.MAC:704` — `	SCVEC -17.,17.,CB`
- Ours: `src/shell/glyphs.ts:215` — `    strokes.push({ points: [corner, hook], closed: false, color: 'white' })`
- **Claim:** ESHOT1 (MESHO1, ALVROM.MAC 700-721, CM=1) is FOUR short WHITE segments on the diagonals — (-11,11)->(-17,17), (-17,-11)->(-11,-17), (17,-17)->(11,-11), (11,17)->(17,11) (decimal) — plus FOUR RED dots at (+/-6,+/-6) (hex 6). Each of ESHOT2/3/4 rotates the same idea with its own coordinates. Ours builds the four white hooks on the CARDINAL axes at radius BOLT_SIZE=10 with a perpendicular 6-unit hook, and the four red dots on the cardinals at radius 4.5 (glyphs.ts 203-227): a pinwheel, not four outward diagonal ticks. Frame selection also differs: the ROM picks the ESHOT frame off the global frame counter (`LDA QFRAME / ASL / AND I,6 / ADC I,PTESHO`, ALDISP.MAC 910-914), we pick it off the bullet's DEPTH (`enemyBoltGlyph(Math.floor(b.depth * 8))`, render.ts 297). Colours match: ICHCOL=WHITE (ALCOMN.MAC 361) and the inner CSTAT RED (ALVROM.MAC 712).

**V-010 — Player charge (bullet) is drawn as two stroked octagons; the ROM's DIARA2 is 17 DOTS in two rings**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (s)
- Source: `ALVROM.MAC:385` — `	SCDOT 0,0`
- Ours: `src/shell/glyphs.ts:282` — `    { points: octagon(3), closed: true, color: 'white' },`
- **Claim:** DIARA2 (ALVROM.MAC 379-403, CM=1) is built entirely from SCDOT (blank move + `VCTR 0,0,CB` — a single lit point; macro at ALVROM.MAC 89-92). Inner ring, CSTAT PSHCTR: dots at (0,0) (7,0) (5,5) (0,7) (-5,5) (-7,0) (-5,-5) (0,-7) (5,-5). Outer ring, CSTAT YELLOW: dots at (0F,0) (0B,0B) (0,0F) (-0B,0B) (-0B,0) (-0B,-0B) (0,-0B) (0B,-0B) — note this outer ring is deliberately IRREGULAR: the -x and -y cardinal dots sit at 0B (11), not 0F (15). Seventeen dots, no lines, two different colours. playerBulletGlyph() returns two CLOSED STROKED octagon outlines of radius 3 and 6, both 'white' (glyphs.ts 273-285), which render.ts then recolours wholesale.

**V-011 — The CHACOU ammo tint recolours the whole bullet; the ROM recolours only the charge's CENTRE dots, and the low tint is BLUE**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (s)
- Source: `ALDISP.MAC:930` — `	STY COLPOR+PSHCTR	;SET UP COLOR FOR CENTER OF PLAYER SOT`
- Ours: `src/shell/render.ts:285` — `    strokeGlyph(ctx, playerBulletGlyph(), p.x, p.y, 0.45 + b.depth * 0.35, renderTime * 5, 14, tint)`
- **Claim:** DSPCHG (ALDISP.MAC 919-930) picks ZYELLO ('PLENTY'), ZBLUE ('LOW', when CHACOU >= NPCHARG-2 = 6) or ZRED ('OUT', when CHACOU >= NPCHARG = 8; NPCHARG=8 at ALCOMN.MAC 812) and stores it into `COLPOR+PSHCTR` — the colour-RAM slot used ONLY by DIARA2's inner ring (`CSTAT PSHCTR`, ALVROM.MAC 384). The outer ring stays `CSTAT YELLOW` (ALVROM.MAC 394) at all times. Our thresholds are right (>=8 red, >=6 cyan, else yellow — glyphs.ts 292-296) but strokeGlyph's `override` recolours EVERY sub-stroke of the glyph (render.ts 83), so both rings change; and the 6-7 tint is 'cyan' (turquoise), where the ROM uses ZBLUE.

**V-012 — Enemy-death explosion is drawn yellow; the ROM's EXPL1-4 are WHITE**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (s)
- Source: `ALVROM.MAC:350` — `	CSTAT WHITE`
- Ours: `src/shell/render.ts:460` — `const ENEMY_BURST_COLOR = '#ffe66b'`
- **Claim:** EXPL1..EXPL4 (ALVROM.MAC 344-376) each open `CSTAT WHITE` and emit SPOK16 (the 16-spoke macro, ALVROM.MAC 120-145) at CM = 1, 2, 4, 8 — i.e. 16 spokes doubling in radius across four frames. DSPEXP confirms the colour at runtime: `LDY I,EXPCOL` (ALDISP.MAC 936) with `EXPCOL=WHITE` (ALCOMN.MAC 366). Our burst is 16 spokes with a scale ladder 1/2/4/8 and a 7->14 brightness ramp (correct), but strokes them in '#ffe66b' — a warm yellow.

**V-013 — Player splat: the ROM SPLAT is one 26-vertex jagged outline whose colour switches every two vertices; ours is two procedural concentric star rings in one colour per frame**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (m)
- Source: `ALVROM.MAC:812` — `	CSTAT PDIWHI`
- Ours: `src/shell/render.ts:503` — `  jaggedStarPath(ctx, ex.x, ex.y, ex.spokes, ex.radius, ex.radius * 0.45)`
- **Claim:** SPLAT (ALVROM.MAC 806-850, CM=2 CD=1 CB=7) is a SINGLE closed jagged outline of 26 absolute vertices — (18,-8) (38,8) (20,0C) (24,14) (1C,15) (22,20) (10,16) (12,30) (4,28) (-0A,2D) (-0C,12) (-2E,18) (-1C,0) (-26,-8) (-20,-0A) (-26,-17) (-0D,-0E) (-10,-22) (-0C,-20) (-8,-2C) (4,-20) (10,-2C) (12,-18) (22,-1E) (18,-8) (0,0) — with the colour re-stated every TWO vertices, cycling PDIWHI -> PDIRED -> PDIYEL -> PDIWHI ... (indices 9/11/10, ALVROM.MAC 812/816/819 and ALCOMN.MAC 384-386), so all three colours are on screen SIMULTANEOUSLY around the ring. SPLAT1-6 (ALVROM.MAC 793-804) then re-draw that one picture at six SCAL sizes. Ours draws two concentric procedural jagged rings (outer/inner radius alternating) in ONE colour per frame, cycling white->red->yellow across frames (render.ts 495-507).

**V-014 — Fuseball: the ROM's FUSE0-3 are 5-colour authored scribbles (red/yellow/green/purple/turquoise); ours is a 9-leg procedural starburst in 3 colours**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (m)
- Source: `ALVROM.MAC:975` — `	CSTAT PURPLE`
- Ours: `src/shell/glyphs.ts:141` — `const FUSE_COLORS: readonly GlyphColor[] = ['red', 'yellow', 'cyan']`
- **Claim:** FUSE0..FUSE3 (ALVROM.MAC 950-1095, CM=2 CD=1 CB=7) are four authored frames, each composed of FIVE colour groups in a fixed order — CSTAT RED, CSTAT YELLOW, CSTAT GREEN, CSTAT PURPLE, CSTAT TURQOI (ALVROM.MAC 955/961/968/975/983) — every group an open polyline of 5-7 absolute vertices. FUSE0's red arm alone is (-4,6) (1,0C) (-5,0E) (1,12) (-1,18); its purple arm is (-4,-1A)m (-4,-14) (-0A,-14) (-7,-0D) (-9,-6) (-3,-8) (0,0); and so on — roughly 29 vertices per frame in 5 colours. Ours generates 9 radial legs from the origin with sinusoidally-writhing angles/lengths, cycling only red/yellow/cyan (glyphs.ts 141-157). GREEN and PURPLE never appear on our fuseball.

**V-015 — Starfield: the ROM's four star pictures are ~22 dots each at authored coordinates; ours are 5 dots each at invented unit directions**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (m)
- Source: `ALVROM.MAC:409` — `	SCDOT 8,0C`
- Ours: `src/shell/render.ts:134` — `  [[-0.8, -0.5], [0.3, -0.9], [0.9, 0.2], [-0.2, 0.7], [0.6, 0.6]],`
- **Claim:** MSTAR1-MSTAR4 (ALVROM.MAC 405-515, CM=4 CD=1) are four macros of 20-22 SCDOTs each at authored absolute coordinates. MSTAR1's 22 dots (hex): (-8,0) (8,0C) (10,0) (8,30) (-30,20) (-34,-20) (-8,-48) (48,-20) (44,28) (18,50) (-38,44) (-48,-8) (-40,-50) (10,-70) (58,-50) (68,-8) (58,50) (8,70) (-40,68) (-78,28) (-70,-28) (-70,-68). Ours reuses four 5-dot 'pictures' of hand-picked unit vectors scattered radially from screen centre (render.ts 133-138). Count (5 vs 22) and every coordinate differ. The colour IS right for early waves: `LDA I,BLUE ;BLUE STARS IN WAVES 1-4` (ALDISP.MAC 2952) vs STAR_COLOR '#7fc3ff' (render.ts 129) — though from wave 5 the ROM varies the star colour per plane (ALDISP.MAC 2949-2960), which we never do.

**V-016 — The lives icon is a hand-drawn chevron; the ROM's LIFE1 is the claw silhouette itself**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (s)
- Source: `ALVROM.MAC:174` — `	SCVEC 4,-2,CB`
- Ours: `src/shell/render.ts:538` — `  ctx.moveTo(lx, baseY); ctx.lineTo(cx, apexY); ctx.lineTo(rx, baseY)`
- **Claim:** LIFE1 (ALVROM.MAC 165-185, CM=6 CD=1 CB=6) opens `CSTAT YELLOW` then draws the closed absolute chain (0,0) (4,-2) (1,-3) (3,-2) (0,-1) (-3,-2) (-1,-3) (-4,-2) (0,0) — the claw's own W-shaped silhouette, scaled x6, with LIFE0 adding the 0A blank advance between icons. drawClawIcon (render.ts 521-549) instead strokes a two-leg chevron plus a horizontal cross-brace and a white apex dot, sized off `size`. Colour is right (CLAW_COLOR '#ffe600' vs CSTAT YELLOW).
- **Correction (refuter):** CLAW_DELTAS/V-002 (NCRS1-8) is a different ROM picture from LIFE1 (confirmed shipped separately at ALDISP.MAC:1917-1997, used for the in-flight rotating cursor, not the lives HUD). Reusing it verbatim will not reproduce LIFE1's actual 8-vertex chain -- new vertex data must be authored from ALVROM.MAC:173-181 for a true fix; the size should not be called 's' on the assumption existing data can be repointed.

**V-017 — The TEMPEST logo is its own stroke alphabet laid out in a stair-step, not the message font on a straight baseline**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (m)
- Source: `ALVROM.MAC:1312` — `	VCTR 0F8,48,0`
- Ours: `src/shell/render.ts:679` — `    drawGlowText(ctx, 'TEMPEST', W / 2, titleY, size, pass.color, 8 + Math.round(20 * pass.depth))`
- **Claim:** TEMLIT (ALVROM.MAC 1297-1351, CM=1 CD=1 CB=6) has SEVEN dedicated logo-letter routines with their own geometry — e.g. `E: VCTR -50,0,CB / VCTR -14,-40,CB / VCTR 70,0,CB / VCTR -70,0,0 / VCTR -14,-40,CB / VCTR 84,0,CB` (a BACK-SLANTED E, its arms stepping left as they descend), and `M`, `P`, `S`, `T` likewise (ALVROM.MAC 1318-1351) — none of which is the ANVGAN message glyph for that letter. The layout is NOT a straight baseline: after CNTR it moves (-1B0,100), draws T, +60 E, +24 M, +34 P, then JUMPS (0F8,48) — up and right — draws E, +16,+28 S, then +60,-60 T. So 'TEMP' sits low-left and 'EST' climbs up and right in a stair-step. We render the string 'TEMPEST' through the ordinary message font (render.ts 679 -> vecText -> layoutText) on one horizontal baseline.
- **Correction (refuter):** The finding overcounts logo routines as 'seven dedicated' -- there are five (T, E, M, P, S), with T and E each reused once to spell the seven letters. Also, the climb is not monotonic: the final T's approach jump (VCTR 60,-60,0) moves down-right, reversing the preceding up-right climb through E and S.

**V-018 — The score/lives HUD uses the level-cycling colour and adds captions; the ROM template is GREEN score, YELLOW lives, GREEN hi-score, BLUE level, no captions**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (m)
- Source: `ALVROM.MAC:1987` — `	CSTAT BLUE`
- Ours: `src/shell/render.ts:790` — `  vecText(ctx, String(s.level).padStart(2, '0'), W - 26, 22, 22, color, 12, 'right', 'top')`
- **Claim:** The SCORES template (ALVROM.MAC 1955-2017) fixes the colour of every HUD field: `CSTAT GREEN` before the 6-digit player score (1958), `CSTAT YELLOW` before the row of LIFE0 life icons (1971-1977), `CSTAT GREEN` before the 6-digit high score (1979), `CSTAT BLUE` before the 2-digit LEVEL (1987-1989), `CSTAT GREEN` before the 3 hi-score initials (1990-1994). Ours draws score, level AND hi-score in the level-cycling `color` (render.ts 787/790/794) and adds three captions the ROM has no glyphs for — 'SCORE', 'LEVEL', 'HI-SCORE' (render.ts 788/791/795) — in a steel-blue that is not a palette colour. The ROM also places the high score directly under player 1's score with the level below it, not centred at the top.

**V-019 — Per-level colour: the ROM swaps the ENTIRE 8-slot colour RAM every 16 waves, recolouring every enemy; we recolour only the well**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (l)
- Source: `ALDISP.MAC:2410` — `	.BYTE ZTURQOI!<ZRED*10>	;PULSARS(4);NYMPHS(0D)`
- Ours: `src/shell/render.ts:19` — `const LEVEL_COLORS = [`
- **Claim:** COLTAB (ALDISP.MAC 2405-2456) is SIX banks of 8 bytes; INICOL indexes it with the wave number (`LDA CURWAV / AND I,70 / ... / ORA I,07`, ALDISP.MAC 2353-2374) and writes each byte's low nibble to colour slots 0-7 and its high nibble to slots 8-15. So slot 3 (FLIPPERS) is ZRED in bank 1 but ZPURPL in bank 2 and ZGREEN in bank 4; slot 6 (WELL, `.BYTE ZBLUE ;WELL(6)`, ALDISP.MAC 2412) is ZBLUE in bank 1, ZGREEN in bank 2, ZTURQOI in bank 3... The whole cast changes colour together, wave group by wave group. Our LEVEL_COLORS (render.ts 19-22) is an 8-hue list used ONLY for the well/HUD (render.ts 917, 941-944); every enemy keeps a hard-coded GLYPH_HEX hue for the whole game (render.ts 38-46).
- **Correction (refuter):** WELL (colour slot 6) is ZBLUE in bank 1 (correct as cited) but ZRED in bank 2 (not ZGREEN) and ZYELLO in bank 3 (not ZTURQOI); ZTURQOI is actually bank 4's WELL colour. The FLIPPERS/slot-3 example elsewhere in the same claim is accurate and does not need correction.

**V-033 — 'SPIN KNOB TO CHANGE' (TURQOISE) is replaced by 'SPIN OR ARROW KEYS TO CHANGE' in a non-palette steel-blue**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (s)
- Source: `ALLANG.MAC:70` — `MESS	PRMOV,TURQOI,1,0	;SPIN`
- Ours: `src/shell/render.ts:710` — `  drawGlowText(ctx, 'SPIN OR ARROW KEYS TO CHANGE', W / 2, H * 0.72, 16, 'rgba(150,190,255,0.7)', 6)`
- **Claim:** PRMOV is TURQOI, scale 1, y=0; the English literal is `EPRMOV: ASCVH <SPIN KNOB TO CHANGE>` (ALLANG.MAC 126). Ours reads 'SPIN OR ARROW KEYS TO CHANGE' in 'rgba(150,190,255,0.7)' — a translucent steel-blue that is not one of the eight palette slots.

**V-034 — 'PRESS FIRE TO SELECT' (YELLOW) is replaced by 'PRESS START / ENTER TO BEGIN' in the level-cycling colour**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (s)
- Source: `ALLANG.MAC:71` — `MESS	PRFIR,YELLOW,1,-10.	;PRESS FIRE`
- Ours: `src/shell/render.ts:713` — `  drawGlowText(ctx, 'PRESS START / ENTER TO BEGIN', W / 2, H * 0.72 + 32, 18, color, 12)`
- **Claim:** PRFIR is YELLOW, scale 1, y=-10.; English literal `EPRFIR: ASCVH <PRESS FIRE TO SELECT>` (ALLANG.MAC 131). Ours reads 'PRESS START / ENTER TO BEGIN' in the per-level cycling `color` — so on level 1 it is blue, level 2 red, and so on.

**V-035 — The initials-entry screen leads with an invented 'NEW HIGH SCORE'; the ROM's message is 'ENTER YOUR INITIALS' in RED**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (s)
- Source: `ALLANG.MAC:121` — `EENTER:	ASCVH <ENTER YOUR INITIALS>`
- Ours: `src/shell/render.ts:720` — `  drawGlowText(ctx, 'NEW HIGH SCORE', W / 2, H * 0.2, 44, color, 24)`
- **Claim:** ENTER is RED, scale 1, y=0B0h (ALLANG.MAC 69 `MESS\tENTER,RED,1,0B0\t\t;ENTER`), with the English literal 'ENTER YOUR INITIALS'. Our high-score entry screen's heading is 'NEW HIGH SCORE' in the level-cycling colour (render.ts 720); 'ENTER YOUR INITIALS' appears only in the defensive no-entry branch, and there it is drawn in CLAW_COLOR yellow (render.ts 724), not red.

**V-036 — The RANK message is 'RANKING FROM 1 TO <n>', not the bare word 'RANK'**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (s)
- Source: `ALLANG.MAC:141` — `ERANK:	ASCVH 0C2,<RANKING FROM 1 TO >`
- Ours: `src/shell/render.ts:701` — `  drawGlowText(ctx, 'RANK', W / 2, H * 0.13 + 38, 16, '#ff2f4f', 8)`
- **Claim:** The MRANK message (RED, scale 1, y=-50., ALLANG.MAC 73) has the English literal 'RANKING FROM 1 TO ' — a sentence with a trailing space onto which the game appends the top selectable level. Ours prints the four-letter label 'RANK'. The colour (RED / '#ff2f4f') is right.

#### No counterpart

**V-020 — SPARK1/SPARK2 — the yellow 4-dot sparkle a SHATTERED spike tip shows**

- **NO_COUNTERPART** · recommend `fix` (s)
- Source: `ALVROM.MAC:2115` — `	PITAB SPARK1,PTSPAR	;SPARKLE`
- Ours: *(none — nothing in our code corresponds)*
- **Claim:** SPARK1/SPARK2 (ALVROM.MAC 670-697) are two YELLOW pictures of four dots each — SPARK1 on the axes at (+/-10,0),(0,+/-10) hex, SPARK2 on the diagonals at (+/-10,+/-10) — alternated to twinkle. They are hung off PTSPAR and used in two places: the SHATTERED enemy-line tip picks one at random (`LDA RANDOM / AND I,2 / ADC I,PTSPAR`, ALDISP.MAC 3193-3197) and the invader-player collision database references PTSPAR (ALDISP.MAC 982). We draw nothing for a shattered spike tip — drawSpikes always caps with the un-shattered white dot (render.ts 263-266).

**V-021 — SHRAP — the shrapnel picture (five yellow debris chunks plus four dots)**

- **NO_COUNTERPART** · recommend `wont_fix`
- Source: `ALVROM.MAC:2134` — `	PITAB SHRAP		;SHRAPNEL`
- Ours: *(none — nothing in our code corresponds)*
- **Claim:** SHRAP (ALVROM.MAC 876-947, CM=4 CD=1 CB=7) draws five separately-scaled CSTAT YELLOW debris pieces (piece 1: (25,-0E) (25,-13) (3A,-7) (2E,-6) (30,-8) (20,-0E); piece 2: 3 vertices; piece 3: 6; piece 4: 6; piece 5: 8) interleaved with JADOT dots at (10,6), (10,30), (-0C,10), (-2C,18), (-0C,-0C), (18,-24) — a blown-apart claw. We have no shrapnel shape; a generic particle spray (drawParticles, render.ts 444-454) stands in.

**V-022 — FUSEX1-3 — the floating WHITE score pop-ups '750' / '500' / '250'**

- **NO_COUNTERPART** · recommend `fix` (s)
- Source: `ALVROM.MAC:1098` — `FUSEX1:	CSTAT WHITE`
- Ours: *(none — nothing in our code corresponds)*
- **Claim:** FUSEX1/2/3 (ALVROM.MAC 1096-1114) are not explosions at all — each sets CSTAT WHITE, SCAL 1,20, backs up `VCTR -36.,0,0` and then JSRLs digit glyphs: FUSEX1 = CHAR.7, CHAR.5, CHAR.0 ('750'); FUSEX2 = CHAR.5, CHAR.0, CHAR.0 ('500'); FUSEX3 = CHAR.2, CHAR.5, CHAR.0 ('250'). They are the score numbers that bloom where a fuseball dies (PICLO entry `PITAB FUSEX1,PTFUSX ;FUSE EXPLOSION`, ALVROM.MAC 2148). We render no floating score text anywhere.

**V-023 — SPLFU1-7 — the 7-stage star-burst ladder for a fuseball killing the player**

- **NO_COUNTERPART** · recommend `wont_fix`
- Source: `ALVROM.MAC:854` — `SPLFU1:	CSTAT WHITE`
- Ours: *(none — nothing in our code corresponds)*
- **Claim:** SPLFU1..SPLFU7 (ALVROM.MAC 852-874) re-use the star picture STAR1B at seven shrinking SCAL steps with a colour ladder: WHITE (SCAL 5,0), WHITE (4,60), YELLOW (4,40), YELLOW (4,20), RED (4,0), RED (3,60), BLUE (3,40). It is a distinct death animation, used when a FUSE (fuseball) takes the player — different from the SPLAT the other enemies trigger. We have exactly one player-death animation (drawPlayerSplat, render.ts 495-507).

**V-025 — The font has no HALF (1/2) and no COPYR (circle-C) glyph**

- **NO_COUNTERPART** · recommend `wont_fix`
- Source: `ALVROM.MAC:30` — `	JSRL HALF		;1/2 (USE QUOTES)`
- Ours: *(none — nothing in our code corresponds)*
- **Claim:** The ROM alphabet includes two composite glyphs beyond the letters/digits: HALF (ALVROM.MAC 30, 53-60) — `VCTR 16,24,.BRITE` then a SCAL 2 '1' over a '2', reached by typing a quote character — and COPYR (ALVROM.MAC 31, 37-52) — an outer circle of 8 VCTRs plus an inner C, reached by typing '#'. @arcade/shared/font ships neither; its GLYPH_CHARS is ' 0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-,/_'. Every unsupported char degrades to a blank.

**V-037 — The '(c) MCMLXXX ATARI' attract line (BLULET) is absent**

- **NO_COUNTERPART** · recommend `wont_fix`
- Source: `ALLANG.MAC:213` — `SATARI:	ASCVH <^ MCMLXXX ATARI>`
- Ours: *(none — nothing in our code corresponds)*
- **Claim:** MATARI is BLULET, scale 1, y=92h (ALLANG.MAC 86) and its literal is identical in all four languages: '^ MCMLXXX ATARI' — where '^' is the ASCVG code for the COPYR circle-C glyph (ALVROM.MAC 31). It is one of the 30 messages. Our attract screen shows 'TEMPEST' + 'A VECTOR ARENA' (render.ts 682) and no copyright line.

#### Structural — different by design

**V-038 — Glyph animation frames are selected from a float render clock, not the ROM's 28.4 Hz QFRAME counter**

- **STRUCTURAL** · recommend `accept`
- Source: `ALDISP.MAC:910` — `	LDA QFRAME		;ENEMY SHOT`
- Ours: `src/shell/render.ts:349` — `      strokeGlyph(ctx, spikerGlyph(Math.floor(renderTime * 8)), p.x, p.y, r / 6, 0, 12)`
- **Claim:** Everywhere the ROM cycles a picture it indexes QFRAME, the integer GAME-frame counter — advanced once per FRTIMR-gated MAINLN pass, i.e. 256/9 = 28.44 Hz, not once per IRQ (~256 Hz) and not 60 Hz (FR-001). Enemy shots `LDA QFRAME / ASL / AND I,6` (ALDISP.MAC 910-912), trailer/spiker `LDA QFRAME / AND I,3` (ALDISP.MAC 701-702), flippers hold one frame (`FLITAB: .BYTE CINVA1,CINVA1,CINVA1,CINVA1`, ALDISP.MAC 685). We derive frames from a float seconds clock instead: spiker `Math.floor(renderTime * 8)` (render.ts 349), fuseball `Math.floor(renderTime * 12)` (render.ts 354), pulsar strobe `Math.sin(renderTime * 12/18)` (render.ts 359-361), bullet spin `renderTime * 5` (render.ts 285). This covers only animation whose frame index is derived from TIME (a float seconds clock standing in for the ROM's integer game-frame count) — it explicitly EXCLUDES any animation whose frame index is derived from something other than elapsed time. In particular, DA-018 (pair-3-aldisp-a-objects.json) shows the enemy-bolt spin frame is computed from `Math.floor(b.depth * 8)` — the bolt's own travel DEPTH, a spatial quantity, not the render clock — so a bolt that stalls in place would freeze mid-animation; that is not a float restatement of QFRAME and is not covered by this finding.

#### Confirmed matches

**V-001 — Flipper (invader) vector chain matches the ROM byte-for-byte, and it is RED**

- **CONFIRMED**
- Source: `ALDISP.MAC:1908` — `	VEC 4,1,1`
- Ours: `src/shell/glyphs.ts:78` — `  [4, 1], [4, -1], [-2, 1], [1, 1], [-3, -1], [-3, 1], [1, -1], [-2, -1],`
- **Claim:** INVA1S (ALDISP.MAC 1907-1916) is an 8-vector chain in unit/perp-unit multipliers: (4,1) (4,-1) (-2,1) (1,1) (-3,-1) (-3,1) (1,-1) (-2,-1). FLIPPER_DELTAS is that exact sequence in that exact order. The deltas sum to (0,0), so the chain closes on itself — our fromDeltas()/closed:true reproduction is equivalent. Colour: ALCOMN.MAC 367 `FLICOL=RED`, applied at ALDISP.MAC 670 `LDA I,FLICOL`; flipperGlyph returns color:'red' (glyphs.ts 86).

**V-002 — Player cursor (claw) graphics NCRS1-8 match the ROM byte-for-byte, and they are YELLOW**

- **CONFIRMED**
- Source: `ALDISP.MAC:1918` — `	VEC 0,-2`
- Ours: `src/shell/glyphs.ts:248` — `  [[0, -2], [2, -1], [3, 4], [-3, -3], [-1, 0], [0, 2], [2, 1], [-3, -1]], // 1 (NCRS1)`
- **Claim:** All eight cursor chains agree vertex-for-vertex with CLAW_DELTAS: NCRS1 (0,-2)(2,-1)(3,4)(-3,-3)(-1,0)(0,2)(2,1)(-3,-1); NCRS2 (1,-2)(7,2)(-3,1)(2,-1)(-6,-1)(0,1)(2,1)(-3,-1); NCRS3 (2,-2)(6,2)...; NCRS4 (3,-2)(5,2)...; NCRS5 (5,-2)(3,2)...; NCRS6 (6,-2)(2,2)...; NCRS7 (7,-2)(1,2)...; NCRS8 opens with the beam-off move `VEC 3,1,0` (ALDISP.MAC 1988) then (3,-4)(2,1)(0,2)(-3,1)(2,-1)(0,-2)(-1,0)(-3,3) — which is exactly our graphic 8, post-MOVE. Colour: ALCOMN.MAC 360 `CURCOL=YELLOW`, set at ALDISP.MAC 602; CLAW_GLYPHS use color:'yellow' (glyphs.ts 263).

**V-003 — Enemy lines (spikes) are a GREEN line capped by a single WHITE dot**

- **CONFIRMED**
- Source: `ALDISP.MAC:3209` — `	LDA I,WHITE		;COLOR (SET STAT WHITE)`
- Ours: `src/shell/render.ts:263` — `    ctx.fillStyle = '#ffffff'`
- **Claim:** The enemy-line body carries the fixed VG prologue `ENLFIX` whose comment is `(CSTATGREEN,CNTR)` (ALDISP.MAC 3027); an un-shattered tip inserts a WHITE colour stat (ALDISP.MAC 3208-3215, WHITIP) then a JSRL to JSRDOT (a zero-length VCTR 0,0 = one dot). drawSpikes strokes the shaft '#39ff14' (render.ts 251) and fills exactly one white tip dot (render.ts 263-266). Line colour and tip colour, and the single-dot cap, all match.

**V-004 — Pulsar strobes TURQUOISE when idle and WHITE while pulsing**

- **CONFIRMED**
- Source: `ALDISP.MAC:862` — `	LDA I,TURQOI		;PULSE OFF`
- Ours: `src/shell/glyphs.ts:196` — `export function pulsarColor(bright: boolean): GlyphColor {`
- **Claim:** PULPIC loads TURQOI for pulse-off and WHITE for pulse-on (ALDISP.MAC 861-867), and the pulsar's colour-RAM slot is index 4 = ZTURQOI (ALDISP.MAC 2410). pulsarColor(bright) returns 'white' when bright and 'cyan' otherwise (glyphs.ts 196-198), and GLYPH_HEX.cyan = '#00e5ff' (render.ts 42) — the turquoise/white strobe, same polarity.

**V-024 — The DASH glyph is verbatim ROM data**

- **CONFIRMED**
- Source: `ALVROM.MAC:33` — `DASH:	VCTR 0,12,0`
- Ours: `src/shell/font.ts:14` — `export * from '@arcade/shared/font'`
- **Claim:** DASH (ALVROM.MAC 33-36) is `VCTR 0,12,0` / `VCTR 16,0,.BRITE` / `VCTR 8,-12,0` with `.BRITE=6` (ALVROM.MAC 22). The font this module re-exports (@arcade/shared/font) stores `'-': [[0, 12, 0], [16, 0, 1], [8, -12, 0]]` — the same three ops, same order, same blank/lit pattern, and the same 16x24 cell (CELL_W=16, CELL_H=24) and 24-unit advance convention.

**V-026 — GAME OVER is GREEN**

- **CONFIRMED**
- Source: `ALLANG.MAC:64` — `MESS	GAMOV,GREEN,1,56		;GAME OVER`
- Ours: `src/shell/render.ts:805` — `    drawGlowText(ctx, 'GAME OVER', W / 2, H * 0.28, 64, '#39ff14', 26)`
- **Claim:** The message table declares GAMOV as GREEN, scale 1, y=56h; the English literal is `EGAMOV: ASCVH <GAME OVER>` (ALLANG.MAC 97). We draw the same string in '#39ff14' (GLYPH_HEX green).

**V-027 — PRESS START is RED**

- **CONFIRMED**
- Source: `ALLANG.MAC:67` — `MESS	PRESS,RED,1,56		;PRESS START`
- Ours: `src/shell/render.ts:686` — `  drawGlowText(ctx, 'PRESS START', W / 2, H * 0.86, 26, '#ff2f4f', 18)`
- **Claim:** PRESS is RED, scale 1, y=56h; English literal `EPRESS: ASCVH <PRESS START>` (ALLANG.MAC 111). We draw 'PRESS START' in '#ff2f4f' (GLYPH_HEX red), blinking, on the attract screen.

**V-028 — HIGH SCORES is RED**

- **CONFIRMED**
- Source: `ALLANG.MAC:72` — `MESS	HIGHS,RED,0,38		;HIGH SCORE`
- Ours: `src/shell/render.ts:623` — `  drawGlowText(ctx, 'HIGH SCORES', cx, top, 20, '#ff2f4f', 14)`
- **Claim:** HIGHS is RED, and note SCALE 0 (the big cell) — the only message besides PLAYER and AVOID SPIKES to use it. English literal `EHIGHS: ASCVH 0BC,<HIGH SCORES>` (ALLANG.MAC 136), plural. We draw the plural 'HIGH SCORES' in '#ff2f4f'.

**V-029 — RATE YOURSELF is GREEN and the NOVICE/EXPERT ladder is RED**

- **CONFIRMED**
- Source: `ALLANG.MAC:74` — `MESS	RATE,GREEN,1,10.	;RATE YOURSELF`
- Ours: `src/shell/render.ts:700` — `  drawGlowText(ctx, 'RATE YOURSELF', W / 2, H * 0.13, 40, '#39ff14', 22)`
- **Claim:** RATE = GREEN (ALLANG.MAC 74, literal `ERATE: ASCVH <RATE YOURSELF>` at 146); NOVIC = RED and EXPER = RED (ALLANG.MAC 75-76). We draw 'RATE YOURSELF' green (#39ff14) and 'NOVICE'/'EXPERT' red (#ff2f4f, render.ts 708-709).

**V-030 — AVOID SPIKES is WHITE**

- **CONFIRMED**
- Source: `ALLANG.MAC:91` — `MESS	SPIKE,WHITE,0,0		;AVOID SPIKES`
- Ours: `src/shell/render.ts:985` — `    drawGlowText(ctx, 'AVOID SPIKES', W / 2, H * 0.32, 28, '#ffffff', 18)`
- **Claim:** SPIKE is WHITE at scale 0 (double-size cell), y=0; English literal `ESPIKE: ASCVH -72.,<AVOID SPIKES>` (ALLANG.MAC 238). We draw 'AVOID SPIKES' in '#ffffff' during the warp hold.

**V-031 — BONUS and TIME are both GREEN**

- **CONFIRMED**
- Source: `ALLANG.MAC:77` — `MESS	BONUS,GREEN,1,-70.	;BONUS`
- Ours: `src/shell/render.ts:993` — `    drawGlowText(ctx, 'BONUS', W / 2, H * 0.16, 40, '#39ff14', 20)`
- **Claim:** BONUS = GREEN scale 1 y=-70. (ALLANG.MAC 77) and TIME = GREEN scale 1 y=98h (ALLANG.MAC 78); literals `SBONUS: ASCVH 8B,<BONUS>` (164) and `ETIME: ASCVH 0E8,<TIME>` (166). We draw both banners in '#39ff14' on the level-clear warp (render.ts 993-994).

**V-032 — SUPERZAPPER RECHARGE is drawn in BLULET (the blue letter slot)**

- **CONFIRMED**
- Source: `ALLANG.MAC:93` — `MESS	SUPZA,BLULET,1,0A0	;NEW SUPER`
- Ours: `src/shell/render.ts:1010` — `    drawGlowText(ctx, 'SUPERZAPPER RECHARGE', W / 2, H * 0.68, 26, '#1f8fff', 16)`
- **Claim:** SUPZA uses BLULET (=7, the second letters slot, ALCOMN.MAC 352) — not the usual LETCOL green. English falls through to `FSUPZA: ASCVH <SUPERZAPPER RECHARGE>` (ALLANG.MAC 248-249), i.e. the English string IS 'SUPERZAPPER RECHARGE'. We draw exactly that string in '#1f8fff' blue.


### 6.5 Objects, charges and explosions — `ALDISP.MAC` (lines 1–1238)

The explosion set. Most of these are small and cheap: the enemy-kill burst is white, not gold; its brightness ramp is off by one frame; the pulsar's colour is a clean binary toggle, not the fast strobe we layer on top of it. Two are not small: the nymph display routine has no counterpart at all, and the player-death splat is a tricolour pinwheel whose colours rotate *spatially* where ours is a single-colour strobe. Two findings from this pair were killed by the refuters — they are in §6.12.

#### Divergences

**DA-002 — Enemy bolt cap: NICHARG=4 matches MAX_ENEMY_BULLETS=4**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (s)
- Source: `ALCOMN.MAC:813` — `NICHARG=4`
- Ours: `src/core/rules.ts:62` — `export const MAX_ENEMY_BULLETS = 4`
- **Claim:** NICHARG=4 (ALCOMN.MAC:813) is only the physical slot count reserved in the charge array for enemy shots — it is not the live concurrent-bolt cap. FIREIC bounds its vacancy search by WCHAMX (ALWELG.MAC:2709, `LDY WCHAMX`), and WCHAMX is filled per wave from TCHAMX (ALWELG.MAC:586), so the real concurrent cap is WCHAMX+1 — 2 bolts at wave 1, not 4. Our MAX_ENEMY_BULLETS hard cap (sim.ts, enforced at `if (s.enemyBullets.length >= MAX_ENEMY_BULLETS) break`) is a flat 4 at every wave, doubling the authentic wave-1 bolt pressure.

**DA-004 — Player bullet: ROM draws loose dots with only the inner ring ammo-tinted; ours draws two closed octagon outlines both uniformly tinted**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (m)
- Source: `ALVROM.MAC:384` — `	CSTAT PSHCTR`
- Ours: `src/shell/glyphs.ts:283` — `    { points: octagon(6), closed: true, color: 'white' },`
- **Claim:** DIARA2 (ALVROM.MAC:383-403), the player-charge picture, is built entirely from SCDOT (each expands to a beam-off move plus a zero-length dot — no connecting stroke). The inner 9-dot cluster (radius ~7, center dot + 8 around it) is colored via the dynamic `PSHCTR` color-RAM slot (the ammo tint from DA-003); the outer 8-dot ring (radius 0F=15, line 395-402) is colored with a fixed `CSTAT YELLOW` (line 394) that never changes. Our `playerBulletGlyph` (glyphs.ts:280-285) instead draws two CLOSED, line-stroked octagons (radius 3 and 6), and `drawBullets` (render.ts:285) passes the ammo `tint` as `strokeGlyph`'s `override`, which recolors EVERY stroke — so both rings change color together, and neither is a scatter of unconnected dots.

**DA-005 — Enemy-kill burst color: ROM's EXPL1-4 are CSTAT WHITE; ours is a gold/yellow hex**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (s)
- Source: `ALVROM.MAC:350` — `	CSTAT WHITE`
- Ours: `src/shell/render.ts:460` — `const ENEMY_BURST_COLOR = '#ffe66b'`
- **Claim:** All four stages of the 16-spoke enemy-kill explosion (EXPL1 line 350, EXPL2 line 358, EXPL3 line 366, EXPL4 line 374 — verified, all four say `CSTAT WHITE`) are pure white, matching ALCOMN.MAC's `EXPCOL=WHITE`. Our `ENEMY_BURST_COLOR` constant, used to stroke and glow every `EnemyBurst`, is `#ffe66b` — a warm gold, not white.

**DA-006 — Enemy-kill burst brightness ramp is off by one frame: ROM dims only the first (smallest) stage, ours dims the first two**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (s)
- Source: `ALVROM.MAC:347` — `	CB=07`
- Ours: `src/shell/fx.ts:233` — `        ex.brightness = frame < 2 ? ENEMY_DIM : ENEMY_BRIGHT`
- **Claim:** CB (the SPOK16 macro's intensity input) is 07 only for EXPL1 (scale 1, the smallest/first stage, line 347); it is set to 0E immediately before EXPL2 (line 356) and stays 0E through EXPL3 and EXPL4 — so only frame 0 is dim, and frames 1, 2 and 3 are all full-bright. Our `update()` instead treats frames 0 AND 1 as dim (`frame < 2`) and only frames 2-3 as bright.

**DA-007 — The "invader-player collision" sparkle (PTSPAR/SPARK1-2) has no counterpart — every player death uses the same splat**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (m)
- Source: `ALDISP.MAC:982` — `	.BYTE PTSPAR			;INVADER - PLAYER COLLISION`
- Ours: `src/shell/fx.ts:161` — `    if (prevAlive && !s.player.alive) {`
- **Claim:** TEXTYP's bang-type table dedicates a distinct entry to a direct invader/player collision (as opposed to a charge killing the player): PTSPAR, drawn from SPARK1/SPARK2 (ALVROM.MAC:672-697) — a static YELLOW 4-dot cross at brightness 7 that just alternates between cardinal and diagonal placement across two frames, with no color cycling and no growth. Our `detect()` fires the SAME effect, `spawnPlayerSplat` (the color-cycling jagged star), for every player death unconditionally — it never distinguishes a grab/collision death from a charge-caused one.

**DA-009 — Player-death splat is simultaneously tri-color per-vertex in the ROM (with the color ASSIGNMENT rotating each frame); ours flashes the WHOLE shape one solid color at a time**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (l)
- Source: `ALVROM.MAC:812` — `	CSTAT PDIWHI`
- Ours: `src/shell/fx.ts:238` — `        ex.color = SPLAT_CYCLE[ex.cycle % SPLAT_CYCLE.length]`
- **Claim:** The SPLAT picture (ALVROM.MAC:810-849) alternates `CSTAT PDIWHI` / `CSTAT PDIRED` / `CSTAT PDIYEL` every 2 vectors around the star, so white, red and yellow segments are all on screen AT ONCE, in a fixed spatial pattern. ALTCOL (ALDISP.MAC:1084-1094) seeds those 3 color-RAM slots to white/yellow/red once, and ROTCOL (ALDISP.MAC:1098-1110) 3-way-ROTATES the slot contents every subsequent frame — so the pattern of which star segment is which color visibly spins over time, but a red segment and a white segment always coexist. Our `drawPlayerSplat` (render.ts:495-507) strokes the ENTIRE jagged star with one `ctx.strokeStyle = ex.color`, and `update()` (fx.ts:236-239) advances that single color through `SPLAT_CYCLE` (white→red→yellow) one whole-object flash per frame.
- **Correction (refuter):** Minor: the ROM alternation is not perfectly '2 vectors per color' (first WHITE run is 3 vectors, and one WHITE follows RED directly, skipping a YELLOW slot) -- it's a hand-authored, slightly irregular tri-color pattern, not a perfectly uniform pinwheel. Does not change the finding's substance or size.

**DA-010 — Player-death splat runs ~20 frames in the ROM = 0.70 s; ours holds for 0.9 s, ~1.3x longer**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (s)
- Source: `ALDISP.MAC:1022` — `TSPTIM:	.BYTE 2			;SPLAT6;CHARGE PLAYER EXPLOSION START`
- Ours: `src/shell/fx.ts:89` — `const SPLAT_LIFE = 0.9`
- **Claim:** The special-explosion frame-timer table (TSPTIM, ALDISP.MAC:1022-1030) sums to 20 frames total for the charge-player splat's full START-through-FINISH sequence (2+2+2+2+2+4+3+2+1 = 20 frames) before the (separate, pulsar-specific) 20-frame tail begins. Those are GAME frames of 35.16 ms (256/9 = 28.44 fps, FR-001), so the sequence runs 20/28.44 = 0.703 s — not the 0.33 s a 60 Hz reading gives. Our `SPLAT_LIFE` constant holds the effect for 0.9 s: 1.28x the authentic duration, ~0.2 s of overhang, not the ~2.7x originally reported.

**DA-017 — No cap on concurrent active invaders: ROM hard-limits 7 simultaneously active, ours spawns unboundedly**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (m)
- Source: `ALCOMN.MAC:809` — `NINVAD=	7`
- Ours: `src/core/sim.ts:136` — `      s.enemies.push(makeEnemy(kind, lane, 0, params, cargo))`
- **Claim:** INVAY/INVAC1/INVAC2 (the active-invader arrays) are sized NINVAD=7, and DSPINV's display loop (ALDISP.MAC:626-650) walks exactly 7 slots every frame — the ROM can never have more than 7 invaders actively climbing/flipping/firing at once; additional spawns queue as nymphs (DA-012) until a slot frees. Our `stepEnemies` spawn block (sim.ts:121-140) pushes a freshly-made enemy onto `s.enemies` whenever the spawn timer elapses and `spawn.remaining > 0`, with no check against how many enemies are already active — `s.enemies.length` is unbounded by any concurrent-count gate.

**DA-018 — Enemy bolt spin frame: ROM ties it to the global frame counter (synchronized, ~7 Hz, continuously cycling); ours ties it to the bolt's own depth (desynchronized, single-pass)**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (s)
- Source: `ALDISP.MAC:910` — `	LDA QFRAME		;ENEMY SHOT`
- Ours: `src/shell/render.ts:297` — `    strokeGlyph(ctx, enemyBoltGlyph(Math.floor(b.depth * 8)), p.x, p.y, scale, b.depth * Math.PI * 4, 12)`
- **Claim:** DSPCHG picks the enemy-shot picture from `QFRAME` (ALDISP.MAC:910-914: `ASL`, `AND I,6`, add to PTESHO) — the global per-GAME-frame counter, advanced once per FRTIMR-gated MAINLN pass — so every enemy bolt on screen cycles through its 4 pictures in lockstep, one full cycle every 4 game frames. At the ROM's 28.44 fps (FR-001) that is 28.44/4 ≈ 7.1 Hz, not the ~15 Hz a 60 Hz reading gives — and it is independent of the bolt's position or speed. Our `drawEnemyBullets` instead derives the frame from `Math.floor(b.depth * 8)` (masked to 4 via `frame & 3` inside `enemyBoltGlyph`) — a SPATIAL, not temporal, driver: a single bolt only passes through the cycle across its own depth 0→1 flight (twice, since depth*8 spans 0-8), and two simultaneous bolts at different depths show different, uncorrelated frames instead of the ROM's shared phase.

**DA-019 — Charge-vs-charge (bullet-bullet) collisions get no explosion in ours; the ROM assigns them the same 16-spoke burst as a charge killing an invader**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (s)
- Source: `ALDISP.MAC:977` — `	.BYTE PTEXP1		;CHARGE CHARGE, CHARGE INVADER`
- Ours: `src/core/sim.ts:261` — `  if (deadBolts.size > 0) s.enemyBullets = s.enemyBullets.filter((_, i) => !deadBolts.has(i))`
- **Claim:** TEXTYP's very first bang-type entry (line 977) explicitly covers BOTH a charge destroying an invader AND two charges colliding with each other — both get the EXPL1-4 16-spoke burst. Our `resolveEnemyBulletHits` (sim.ts:245-262) detects a player bullet meeting an enemy bolt in the same lane/depth and silently filters both out of their arrays — no event is emitted, so the only visual is the incidental small particle spark from fx.ts's generic "a bullet vanished" diff-detection, never the big `EnemyBurst`.

**DA-020 — Pulsar color: ROM is a steady binary toggle for the whole active window; ours adds an extra fast strobe on top while pulsing**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (s)
- Source: `ALDISP.MAC:862` — `	LDA I,TURQOI		;PULSE OFF`
- Ours: `src/shell/render.ts:363` — `      const color = pulsarColor(e.pulsing && beat > 0.5)`
- **Claim:** PULPIC (ALDISP.MAC:861-867) sets the pulsar's color to WHITE for the ENTIRE duration `PULSON` is positive (the whole pulse-active window) and TURQOI otherwise — a single two-state toggle with no additional per-frame flicker in the color logic itself (the zig-zag shape does animate via PULTAB, but the color does not strobe separately). Our code instead gates white on `e.pulsing && beat > 0.5`, where `beat = 0.5 + 0.5*sin(renderTime*18)` — so while pulsing, the color additionally strobes between white and cyan roughly every half-cycle of an 18 rad/s sine, on top of whatever the pulse state is.

**DA-022 — Low-ammo tint: ROM's ZBLUE has no equivalent in our GlyphColor palette, so we substitute cyan**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `accept`
- Source: `ALDISP.MAC:924` — `	LDY I,ZBLUE		;LOW`
- Ours: `src/shell/glyphs.ts:294` — `  if (chargesInFlight >= 6) return 'cyan'`
- **Claim:** The ROM's "low ammo" tint is ZBLUE (ALCOMN.MAC:381, `ZBLUE=FBLUE`, a blue-family color-RAM value). Our shared `GlyphColor` palette (render.ts `GLYPH_HEX`) has no `blue` entry, so `playerBulletColor` substitutes `'cyan'` for this tier, per its own comment ("GlyphColor has no separate `blue`").

#### No counterpart

**DA-012 — Nymphs — pre-hatch enemies climbing from the vanishing point — have no counterpart anywhere in the shell**

- **NO_COUNTERPART** · recommend `fix` (l)
- Source: `ALDISP.MAC:458` — `	.SBTTL	DISPLAY-NYMPHS`
- Ours: *(none — nothing in our code corresponds)*
- **Claim:** DSPNYM (ALDISP.MAC:458-598) is a dedicated ~140-line display routine: up to NNYMPH=64 (ALCOMN.MAC:811) nymphs are tracked (NYMPY/NYMPL arrays), up to 24 (`LDA I,18.`, line 467) are drawn per frame with every-other-one skipped past a depth threshold, each rendered as a fake-perspective dot-plus-line-back-to-the-vanishing-point using its own color slot (NYMCOL=12, ALCOMN.MAC:387). A project-wide search of `src/` for "nymph" (any case) returns zero results — there is no pre-hatch enemy state, no nymph rendering, and no vanishing-point climb-then-hatch animation; every spawned enemy in `stepEnemies` (sim.ts) is pushed directly as a fully active flipper/tanker/spiker/fuseball/pulsar at depth 0.

#### Structural — different by design

**DA-021 — Flip/jump path: ROM's 16-step lookup table (stepped once per 28.4 Hz logic frame) vs. our continuous parametric arc**

- **STRUCTURAL** · recommend `accept`
- Source: `ALDISP.MAC:720` — `	AND I,0F`
- Ours: `src/shell/render.ts:53` — `function arcAbout(`
- **Claim:** The ROM indexes its 16-entry JUMPX/JUMPZ circle (DA-013) with a 4-bit integer step counter (`INVAL2 AND 0F`, line 720) that advances one discrete step at a time — 16 fixed positions per full loop, updated once per GAME frame, i.e. on the FRTIMR-gated 256/9 = 28.44 Hz logic cadence (FR-001), not on a 60 Hz one and not on the ~256 Hz IRQ. `arcAbout()` instead evaluates `cos`/`sin`/`hypot` continuously for an arbitrary float `t` each frame, with no 16-step quantization.

#### Confirmed matches

**DA-001 — Player charge cap: NPCHARG=8 matches MAX_BULLETS=8**

- **CONFIRMED**
- Source: `ALCOMN.MAC:812` — `NPCHARG=8`
- Ours: `src/core/rules.ts:8` — `export const MAX_BULLETS = 8`
- **Claim:** The ROM sizes CHARY/CHARL1 (NCHARG=NPCHARG+NICHARG slots) so exactly the first 8 charge slots are the player's (DSPCHG: `CPX I,NPCHAR` picks PTCURS for indices below that boundary). Our MAX_BULLETS gate (sim.ts:96, `if (s.bullets.length >= MAX_BULLETS) return`) caps the player at the same 8 simultaneous shots.

**DA-003 — Player-bullet ammo-tint thresholds (6, 8) match CHACOU comparisons exactly**

- **CONFIRMED**
- Source: `ALDISP.MAC:922` — `	CMP I,NPCHARG-2`
- Ours: `src/shell/glyphs.ts:294` — `  if (chargesInFlight >= 6) return 'cyan'`
- **Claim:** DSPCHG recolors the player-shot center dot off CHACOU (the live charge count): `CMP I,NPCHARG-2` (line 922, i.e. CHACOU>=6) selects the "low" tint, and `CMP I,NPCHARG` (line 925, CHACOU>=8) selects the "out" tint, else the default "plenty" tint. `playerBulletColor` (glyphs.ts:292-295) uses the identical thresholds: >=8 red, >=6 cyan, else yellow.

**DA-013 — Flip/jump world-coordinate offset table is a literal circle — confirms our arcAbout's "flip is a circular arc" design**

- **CONFIRMED**
- Source: `ALDISP.MAC:764` — `JUMPX:	.BYTE DG000`
- Ours: `src/shell/render.ts:63` — `  const a = a0 + dA * t`
- **Claim:** JUMPX/JUMPZ (ALDISP.MAC:754-779) is a 16-sample lookup table of world-space (X,Z) offsets applied to a flipping/leaping invader's base-line position (IJMPDS, ALDISP.MAC:711-753). Decoding the byte values (DG000=2C=44, DG225=28=40, DG450=1F=31, DG675=10=16, DG900=0, and their negatives) against 22.5-degree steps confirms X[i]=44*cos(i*22.5deg) and — because JUMPZ's 4 bytes are immediately followed in memory by JUMPX's own bytes and both are indexed by the same `AND I,0F` 0-15 value (line 720) — Z[i]=44*sin(i*22.5deg): a genuine 16-point circle of radius 44 world-units. Our `arcAbout()` (render.ts:53-66) computes a continuous circular arc (interpolating angle and radius from source to target) for the same mid-flip tumble.

**DA-014 — Flipper color: FLICOL=RED matches our red bowtie glyph**

- **CONFIRMED**
- Source: `ALCOMN.MAC:367` — `FLICOL=RED			;FLIPPERS`
- Ours: `src/shell/glyphs.ts:86` — `  return [{ points: center(verts), closed: true, color: 'red' }]`
- **Claim:** ALCOMN.MAC hardcodes flippers to RED. `flipperGlyph()` returns its bowtie stroke with `color: 'red'`.

**DA-015 — Cursor (Claw) color: CURCOL=YELLOW matches CLAW_COLOR**

- **CONFIRMED**
- Source: `ALCOMN.MAC:360` — `CURCOL=YELLOW			;CURSOR`
- Ours: `src/shell/render.ts:23` — `const CLAW_COLOR = '#ffe600'`
- **Claim:** ALCOMN.MAC hardcodes the cursor to YELLOW. Our `CLAW_COLOR`, used for the player claw glyph, lives icon, and warp-dive claw, is `#ffe600` — an authentic yellow.

**DA-016 — Tanker body color: GENTNK's CSTAT PURPLE matches our tanker body**

- **CONFIRMED**
- Source: `ALVROM.MAC:651` — `GENTNK:	CSTAT PURPLE`
- Ours: `src/shell/glyphs.ts:97` — `    color: 'purple',`
- **Claim:** The shared tanker-body drawing routine GENTNK (reached by TANKP, TANKF and TANKR alike) sets its X-diamond body to PURPLE, matching ALCOMN.MAC's `TANCOL=PURPLE`. Our `tankerGlyph`'s body stroke is likewise `color: 'purple'`.


### 6.6 The well and the projection — `ALDISP.MAC` (lines 1239–3298)

The good news here is very good. **All 512 bytes of the well coordinate tables (`NEWLIX`/`NEWLIZ`) match ours byte-for-byte** — our disassembly-derived tables reproduce Theurer's source exactly, so the well *shapes* are right and no perspective wrongness can be blamed on a coordinate error. And `perspectiveDepth()` is, algebraically, the cabinet's own pinhole divide: the audit collapsed the arcade's `256*(PX-EX)/(PY-EY)` law and our `R*d/(R*d + 1 - d)` reparameterisation to the same expression, term for term (DB-005). The curve is right. What is wrong is every constant fed into it — `FAR_RATIO` is one hardcoded 0.2 for all 16 wells where the ROM's ratio is per-well and ranges 0.104–0.164; the eye sits *off* the tube axis on 15 of the 16 wells; the whole well is translated per-well in screen space and slides into position at level start; and the eye moves.

#### Divergences

**DB-006 — FAR_RATIO is one hardcoded 0.2 for every well; the arcade's far/near ratio is per-well and is never 0.2**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (m)
- Source: `ALDISP.MAC:1385` — `HOLEYL:	.BYTE 18,1C,18,0F,18,18,18,18,0A,18,10,0F,18,0C,14,0A		;EYE POSITION (Y)`
- Ours: `src/core/geometry.ts:18` — `export const FAR_RATIO = 60 / 300`
- **Claim:** The eye's Y distance behind the rim is a PER-WELL constant: EY = -HOLEYL[wellID] (ALDISP.MAC:2470-2474 negates the table value). With the well spanning PY 0x10..0xF0, the far-ring/near-ring screen scale ratio is R_a = (16 + H)/(240 + H), H = HOLEYL[wellID]: well 0 circle H=0x18(24) -> 40/264 = 0.1515 well 1 square H=0x1C(28) -> 44/268 = 0.1642 well 2 cross H=0x18(24) -> 0.1515 well 3 peanut H=0x0F(15) -> 31/255 = 0.1216 wells 4,5,6,7,9,12 H=0x18(24) -> 0.1515 well 8 plane H=0x0A(10) -> 26/250 = 0.1040 well 10 jagged H=0x10(16) -> 32/256 = 0.1250 well 11 lying-8 H=0x0F(15) -> 0.1216 well 13 stair H=0x0C(12) -> 28/252 = 0.1111 well 14 star H=0x14(20) -> 36/260 = 0.1385 well 15 wave H=0x0A(10) -> 0.1040 Range 0.1040 .. 0.1642. Ours is a single FAR_RATIO = 60/300 = 0.2000 for all 16 — 22% too large on the shallowest well (0.1642) and 92% too large on the deepest (0.1040). Our far ring is therefore too BIG on every level, i.e. every tube is too shallow / under-foreshortened. Fix: make the ratio per-well, R = (16 + HOLEYL[wellID]) / (240 + HOLEYL[wellID]), and feed it to perspectiveDepth (which must then take the tube, not a module constant).

**DB-007 — The eye sits OFF the tube axis in Z (HOLEZL != world centre on 15 of 16 wells); we scale the far ring about the ring centroid**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (m)
- Source: `ALDISP.MAC:1386` — `HOLEZL:	.BYTE 50,50,50,68,50,50,68,0B0,0A0,50,90,80,20,0B0,60,0A0	;EYE POSITION (Z)`
- Ours: `src/core/geometry.ts:209` — `    far.push({ x: x * FAR_RATIO, y: y * FAR_RATIO })`
- **Claim:** The eye's world position is (EX, EY, EZ) = (0x80, -HOLEYL, HOLEZL) — EX is hardcoded to the world centre 0x80 (INIDSP, ALDISP.MAC:2338-2339) but EZ is a PER-WELL table value that is NOT the world centre. World Z centre is 0x80 = 128; HOLEZL is 0x50(80), 0x68(104), 0xB0(176), 0xA0(160), 0x90(144), 0x80(128), 0x20(32), 0x60(96), so (128 - EZ) = +48, +48, +48, +24, +48, +48, +24, -48, -32, +48, -16, 0, +96, -48, +32, -32 for wells 0..15. Only well 11 (LYING 8) has the eye on the tube axis. Consequence: the near and far rings project to DIFFERENT screen centres. For well 0 (circle), the projection of the world centre (0x80,0x80) lands at screen Z = 256*(128-80)/(16+24) + ZADJ = +307.2 + ZADJ at the rim and 256*(128-80)/(240+24) + ZADJ = +46.5 + ZADJ at the far end — a 260.7-unit vertical displacement, against a near-rim radius of 256*112/40 = 716.8 units. The far well is displaced ~36% of the near rim's radius. We instead build far = near * FAR_RATIO about (0,0) (geometry.ts:206-209), so our far ring is exactly CONCENTRIC with the near ring. Fix: far[i] = VP + (near[i] - VP) * R, where VP is the projected vanishing point rather than the ring centroid.
- **Correction (refuter):** The finding's absolute pixel figures (307.2, 46.5, 716.8) depend on an unverified '256' scale constant, but the load-bearing 36% ratio claim is scale-invariant and independently reproduced, so the conclusion stands regardless.

**DB-010 — Well colour: WELCOL is BLUE and the palette cycles every 16 waves through 6 sets — one of which makes the well INVISIBLE**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (s)
- Source: `ALDISP.MAC:2447` — `	.BYTE ZBLACK`
- Ours: `src/shell/render.ts:20` — `  '#1f8fff', '#ff2f4f', '#ffd400', '#23e8a6',`
- **Claim:** The well (rim AND spokes) is drawn in a single colour INDEX, WELCOL = BLUE = 6 (ALCOMN.MAC:359, used at ALDISP.MAC:2612 and 2630). What that index resolves to is set by INICOL (ALDISP.MAC:2353-2378): X = ((min(CURWAV & 0x70, 0x5F)) >> 1) | 0x07, i.e. COLTAB is SIX 8-byte colour sets and the set advances every 16 waves. Slot 6 of each set (ALDISP.MAC:2405-2456): set 0 = ZBLUE, set 1 = ZRED, set 2 = ZYELLO, set 3 = ZTURQOI, set 4 = ZBLACK (ALDISP.MAC:2447 — the famous invisible-well waves), set 5 = ZGREEN. So: waves 1-16 blue, 17-32 red, 33-48 yellow, 49-64 turquoise, 65-80 INVISIBLE, 81-96 green, then it saturates at set 5. Ours: LEVEL_COLORS is 8 arbitrary hex hues indexed by (level-1) mod 8 (render.ts:19-22) — wrong period (8 vs 16), wrong count (8 vs 6), wrong hues, and no invisible-well levels at all.

**DB-011 — Far rim and spokes are drawn at the SAME brightness as the near rim (RATS = 0xC0); we fade both toward the far end**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `accept`
- Source: `ALDISP.MAC:2625` — `	LDA I,RATS		;SPOKE INTENSITY`
- Ours: `src/shell/render.ts:206` — `    { stroke: 'rgba(150,190,255,0.28)', width: 1.5, blur: 6, color }, tube.closed,`
- **Claim:** RATS = 0xC0 (ALDISP.MAC:33). WELPIC drives every spoke at that constant intensity (ALDISP.MAC:2625) and OUTLIN drives the rim polylines at the same constant (ALDISP.MAC:2661 `LDA I,RATS` -> VGBRIT), and OUTLIN is called TWICE with the same COLOR and the same VGBRIT — once for the far rim (Y=0x4F) and once for the near rim (Y=0x0F) (ALDISP.MAC:2634-2638). There is no depth cue on the well: the routine that would have added one, SETINT ('SET INTENSITY AS FUNC OF PYL'), is commented out (ALDISP.MAC:1566). The only beam-off in the whole well is the near-to-adjacent-near hop inside SPOKE (ALDISP.MAC:2731-2732), a pen-up move, not a dim line. We instead draw the far ring at alpha 0.28 / width 1.5 versus the near ring's full-alpha width 3.5 (render.ts:206 vs 212), and gradient each spoke from rgba(255,255,255,0.04) at the far end to full colour at the near end (render.ts:192-193).
- **Correction (refuter):** The SETINT citation (line 1566) is inside ONELN2, the enemy-sprite-picture routine, not inside WELPIC/OUTLIN/SPOKE (the well-rim/spoke routines) — it's suggestive context, not direct proof, for the well specifically. Doesn't change the verdict since WELPIC/OUTLIN/SPOKE's own flat-RATS behavior already proves the claim without it.

**DB-016 — Star planes are projected through the same perspective divide; we spread them LINEARLY from screen centre**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (s)
- Source: `ALDISP.MAC:2936` — `	STA YDEUNI`
- Ours: `src/shell/render.ts:153` — `    const r = t * reach`
- **Claim:** DSTARF temporarily swaps the eye to a starfield-specific one — EYL = 0xE8 / EYH = 0xFF (eye Y = -24) and YDEUNI = 0x28 = 40 (ALDISP.MAC:2931-2936) — then, for each active plane, sets PXL = PZL = 0x80 ('CENTER OF WORLD', ALDISP.MAC:2945-2948), PYL = PLANEY[i], and calls SCAPI2 (ALDISP.MAC:2970). SCAPI2 projects that centre point with WORSCR and then calls CASCAL (ALDISP.MAC:1423) to SCALE the star picture by YDEUNI/(PY - EY) = 40/(PY + 24). So a plane's stars expand hyperbolically: 40/(240+24) = 0.152 at spawn, through 40/(128+24) = 0.263 at mid-flight, to 40/(16+24) = 1.000 at retirement — a 6.6x expansion that is slow at first and violently fast at the end. Our drawStarfield maps the SAME z LINEARLY to a radius: t = (0xF0 - z)/(0xF0 - 0x10), r = t * reach (render.ts:152-153). At spawn our stars are at r = 0 (all piled on the centre point, invisible); the arcade's are already at 15% of full reach. And ours accelerate outward at a constant rate instead of whipping past at the end.

**DB-017 — Star planes are only blue for waves 1-4; from wave 5 each plane takes its own colour**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (s)
- Source: `ALDISP.MAC:2952` — `	LDA I,BLUE		;BLUE STARS IN WAVES 1-4`
- Ours: `src/shell/render.ts:129` — `const STAR_COLOR = '#7fc3ff' // blue star dots`
- **Claim:** DSTARF (ALDISP.MAC:2949-2961): `LDA CURWAV / CMP I,5 / IFCC / LDA I,BLUE ... ELSE / TXA / AND I,7 / CMP I,7 / IFEQ / LDA I,4 / ENDIF`. So for waves 1-4 every plane is BLUE (colour index 6); from wave 5 on, each plane's colour index is its own plane index (X & 7), with index 7 remapped to 4 — giving a multi-coloured, per-plane starfield (white, yellow, purple, red, turquoise, green, blue, turquoise under the wave-1 palette). We hardcode every dot of every plane to a single blue #7fc3ff (render.ts:129, 149-150).

#### No counterpart

**DB-008 — Per-well screen-Z vanishing point (ZADJL from HOLZAD/HOLZDH), and its slide-in on a new wave**

- **NO_COUNTERPART** · recommend `fix` (s)
- Source: `ALDISP.MAC:1387` — `HOLZAD:	.BYTE 40,20,40,80,40,40,70,60,0,20,40,0,0A0,40,40,0;CENTER ADJUST`
- Ours: *(none — nothing in our code corresponds)*
- **Claim:** ZADJL is declared as 'SCREEN Z VANISH PT' (ALCOMN.MAC:543) and is the additive term in WORSCR's SZ (ALDISP.MAC:2274 `ADC ZADJL`). It is loaded per-well from HOLZAD (low byte) + HOLZDH (high byte) (ALDISP.MAC:1387-1388, read at 2489-2498), giving signed 16-bit screen offsets: well 0 0xFF40 = -192, well 1 0xFF20 = -224, well 2 -192, well 3 0xFF80 = -128, wells 4,5 -192, well 6 0xFF70 = -144, well 7 +0x0060 = +96, well 8 +0x0100 = +256, well 9 -224, well 10 +0x0040 = +64, well 11 0, well 12 0xFEA0 = -352, well 13 +0x0140 = +320, well 14 -192, well 15 +256. The X vanishing point is always 0 (ALDISP.MAC:2507 `LDA I,0 ;X SCREEN CENTER`). Furthermore the value is ANIMATED: on a new life it snaps to the table value, but on a new WAVE it eases in — ZADEST = (target - current) >> 3 per step (ALDISP.MAC:2494-2505, applied at ALWELG.MAC:80-84) — so the well slides into place at the start of each level. We have neither the per-well offset nor the slide: our tube is always centred on the canvas origin.

**DB-009 — The eye TRAVELS down the well; we have a fixed camera**

- **NO_COUNTERPART** · recommend `fix` (l)
- Source: `ALDISP.MAC:2767` — `	LDA EYH`
- Ours: *(none — nothing in our code corresponds)*
- **Claim:** The eye is not static. CHKDEP ('CHECK FOR EYE PAST OBJECT ON WELL', ALDISP.MAC:2766-2788) exists purely to cope with the eye having moved INTO the well: if EYH == 0 (eye Y has gone positive, i.e. past the rim at Y=0x10 and inside the tube), any point closer than 0x0C to the eye is nudged out to EYL+0x0F, clamped at 0xF0 ('BUT NOT PAST END OF WELL'). DSPENL likewise aborts drawing the spikes entirely once EYL >= 0xF0 (ALDISP.MAC:3000-3006 — the eye has passed the far end). ALWELG.MAC:85-91 is the driver: `LDA EYL ;MOVE EYE CLOSER TO WELL / CLC / ADC I,18` — the eye advances 0x18 = 24 world units per step toward EYLDES. We have no camera at all: depth is a fixed [0,1] parameter and the tube's screen points never move.

**DB-014 — Spike SHATTERED tip: a random sparkle picture, depth-scaled, instead of the white dot**

- **NO_COUNTERPART** · recommend `fix` (s)
- Source: `ALDISP.MAC:3191` — `	JSR CASCAL		;SHATTERED`
- Ours: *(none — nothing in our code corresponds)*
- **Claim:** LINSTA[i] carries a per-line status byte (ALCOMN.MAC:910: 'D7=1:NEW NEAR PT.; D6=1=SHATTERED'). When bit 6 is set, TIPACT does NOT draw the white dot — it calls CASCAL to derive a depth-appropriate VG scale for the tip, then splices in a JSRL to one of the SPARKLE pictures chosen at random: `LDA RANDOM / AND I,2 / CLC / ADC I,PTSPAR` (ALDISP.MAC:3193-3206), i.e. PTSPAR or PTSPAR+2. So a spike being shot shows a scaled, flickering sparkle at its tip for that frame. Our spikes have no shattered state at all — s.spikes[lane] is a bare number and the tip is unconditionally a 2px white dot (render.ts:263-266).

#### Structural — different by design

**DB-018 — Rim-segment angles are a hand-authored 16-direction table (ILINANG); we derive them exactly with atan2**

- **STRUCTURAL** · recommend `wont_fix`
- Source: `ALDISP.MAC:1362` — `ILINANG:.BYTE 5,6,7,8,9,10.,11.,12.,13.,14.,15.,0,1,2,3,4	;CIRCLE`
- Ours: `src/core/geometry.ts:269` — `  const rotation = Math.atan2(anchor.y - far.y, anchor.x - far.x) + Math.PI / 2`
- **Claim:** ILINANG (ALDISP.MAC:1362-1379) is a 16x16 companion to NEWLIX/NEWLIZ: one byte per rim segment, copied into LINANG at INIWLS (ALDISP.MAC:2527-2528) and documented as 'INDEX=ANGLE FROM GRID LINE TO NEXT CCW LINE' (ALCOMN.MAC:923). It is a 4-bit direction index — 1/16 of a turn, 22.5 degrees per step — used to orient objects that ride the rim. We store no such table; render/geometry recover the same tangent exactly, at full float precision, from the very coordinates the table was authored against (clawTransform's rotation = the lane's far->near radial + pi/2, geometry.ts:269, and render.ts:320-324 leans on it for the flipper's rim-tangent axis).

#### Confirmed matches

**DB-001 — All 16 well X coordinate tables (NEWLIX) match ROM_X byte-for-byte**

- **CONFIRMED**
- Source: `ALDISP.MAC:1245` — `NEWLIX:	.BYTE DG0,DG225,DG450,DG675,DG900	;CIRCLE`
- Ours: `src/core/geometry.ts:137` — `const ROM_X: readonly (readonly number[])[] = [`
- **Claim:** NEWLIX (ALDISP.MAC:1245-1310) is one contiguous 16x16 byte table, part symbolic. Resolving the symbols (DG0=70+80=0xF0, DG225=0xE7, DG450=0xCF, DG675=0xAA, DG900=0x80; DI0=0xF0, DI1=0xB8, DI2=0x80, DI3=0x48, DI4=0x10; CR0=CR1=0xF0, CR2=CR3=0xB8, CR4=0x80; PX0=0xEC, PX1=0xD5, PX2=0xB1, PX3=0x90; and the unary minus as 8-bit two's complement, e.g. -DG675 = -0xAA = 0x56) yields, row by row: CIRCLE f0,e7,cf,aa,80,56,31,19,10,19,31,56,80,aa,cf,e7 / SQUARE f0,f0,f0,b8,80,48,10,10,10,10,10,48,80,b8,f0,f0 / CROSS f0,f0,b8,b8,80,48,48,10,10,10,48,48,80,b8,b8,f0 / PEANUT ec,d5,b1,90,70,4f,2b,14,14,2b,4f,70,90,b1,d5,ec, then the 12 literal rows 4 KEY, TRIANGLE, CLOVER, V, PLANE, U, JAGGED, LYING 8, HEART, STAIRCASE, STAR X, WAVE X. Every one of the 256 bytes is identical to ROM_X[0..15] in src/core/geometry.ts:138-153.

**DB-002 — All 16 well Z coordinate tables (NEWLIZ) match ROM_Y byte-for-byte**

- **CONFIRMED**
- Source: `ALDISP.MAC:1311` — `NEWLIZ:	.BYTE DG900,DG675,DG450,DG225,DG0	;CIRCLE`
- Ours: `src/core/geometry.ts:157` — `const ROM_Y: readonly (readonly number[])[] = [`
- **Claim:** NEWLIZ (ALDISP.MAC:1311-1361), resolved the same way (adding PZ0=0x94, PZ1=0xB0, PZ2=0xB8, PZ3=0xA7, and the PLANE row's `.REPT 10 / .BYTE 40` = sixteen 0x40 bytes), gives: CIRCLE 80,aa,cf,e7,f0,e7,cf,aa,80,56,31,19,10,19,31,56 / SQUARE 80,b8,f0,f0,f0,f0,f0,b8,80,48,10,10,10,10,10,48 / CROSS 80,b8,b8,f0,f0,f0,b8,b8,80,48,48,10,10,10,48,48 / PEANUT 94,b0,b8,a7,a7,b8,b0,94,6c,50,48,59,59,48,50,6c / PLANE 40x16 / ... all 256 bytes identical to ROM_Y[0..15] in src/core/geometry.ts:158-173. Note the source calls the tables X and Z, not X and Y: Z is the SCREEN-VERTICAL axis (VGYABS writes the Z pair first as the VG's Y delta). Our ROM_Y is the source's Z, and we negate it (geometry.ts:207) because canvas +y is down while the VG's +y is up — correct.

**DB-003 — Wave -> well-ID cycle order (WELSEQ) matches ROM_REMAP**

- **CONFIRMED**
- Source: `ALDISP.MAC:1383` — `WELSEQ:	.BYTE 0,1,2,3,4,5,6,7,0D,9,8,0C,0E,0F,0A,0B	;WELL ID SEQUENCE(WAVE)`
- Ours: `src/core/geometry.ts:183` — `  0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x0d, 0x09, 0x08, 0x0c, 0x0e, 0x0f, 0x0a, 0x0b,`
- **Claim:** WELSEQ = 0,1,2,3,4,5,6,7,D,9,8,C,E,F,A,B; ROM_REMAP = the identical 16 values. LVLWEL (ALDISP.MAC:2559-2582) takes (level-1), reduces it mod 16 (WELSEN-WELSEQ = 16), and indexes WELSEQ to get WELLID; tubeForLevel (geometry.ts:221-224) does exactly `GEOMETRIES[(level-1) mod 16]` where GEOMETRIES = ROM_REMAP.map(makeRingTube) (geometry.ts:216) — remap first, then look up the shape. Same composition, same order.

**DB-004 — Open/closed (planar) well flags (HOLRAP) match ROM_OPEN, including the 15-vs-16 lane count**

- **CONFIRMED**
- Source: `ALDISP.MAC:1389` — `HOLRAP:	.BYTE 0,0,0,0,0,0,0,-1,-1,-1,-1,0,0,-1,0,-1	;PLANAR(-1)/CLOSED(0) FLAG`
- Ours: `src/core/geometry.ts:178` — `  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0xff, 0x00, 0x00, 0xff, 0x00, 0xff,`
- **Claim:** -1 assembles to 0xFF, so HOLRAP == ROM_OPEN element-for-element (wells 7,8,9,10,13,15 are planar/open). HOLRAP is indexed by WELLID (ALDISP.MAC:2484 `LDA Y,HOLRAP` with Y=WELLID), and so is ours (makeRingTube(tube) reads ROM_OPEN[tube] where tube = ROM_REMAP[level-1]) — the indexing is not confused with the wave index. The lane-count consequence also matches: OUTLIN (ALDISP.MAC:2656-2660) draws NLINES-1 = 15 rim segments for a closed well (the 16th closes the ring via the INDEX1 wrap at 2665-2674) and one fewer (14 segments over 16 points, i.e. an unclosed polyline) when WELTYP is planar; we set laneCount 16/closed and 15/open over the same 16 rim points (geometry.ts:211).

**DB-005 — perspectiveDepth() IS the arcade's 1/(depth - eye) perspective divide, exactly, once units are converted**

- **CONFIRMED**
- Source: `ALDISP.MAC:2049` — `;FORMULAE:	SCREEN X = [FACTOR/(PY-EY)]*(PX-EX)+SXCENT`
- Ours: `src/core/geometry.ts:38` — `  return (FAR_RATIO * depth) / (FAR_RATIO * depth + (1 - depth))`
- **Claim:** ARCADE. WORSCR (ALDISP.MAC:2218-2333) computes MXP = PY - EY once, loads it as the math box's divisor (MXPL/MXPH), then twice sets the numerator's HIGH byte (MZLH, ALDISP.MAC:2243/2268) and starts a divide (MSZXD, 2244/2269). Numerator in the high byte = numerator*256, so: SX = 256*(PX-EX)/(PY-EY) + XADJ and SZ = 256*(PZ-EZ)/(PY-EY) + ZADJ. That is the header formula at 2049/2051 verbatim, with FACTOR = 256. CASCAL (ALDISP.MAC:1453-1514) derives an object's SIZE from the same denominator: it divides YDEUNI by (PYL - EY) (1456-1479) and packs the result into the VG's binary+linear SCAL word — i.e. scale(PY) = YDEUNI/(PY - EY), a pure reciprocal. The well spans PY in [ILINLIY=0x10 (near rim), ILINDDY=0xF0 (far end)] (ALCOMN.MAC:819-820, used at ALDISP.MAC:2589/2599), and INIWLS sets EY = -HOLEYL[wellID] and YDEUNI = 0x10 - EY = 16 + HOLEYL (ALDISP.MAC:2470-2481), so scale is exactly 1.0 at the rim. OURS. project() (geometry.ts:84-89) walks the far->near segment by t = perspectiveDepth(d) = R*d/(R*d + 1 - d), R = FAR_RATIO, with our far ring built as near*R about the origin (geometry.ts:209). Substituting: screen radius(d) = |N|*(R + (1-R)*t) = |N| * R / (1 - (1-R)*d). CONVERSION. Our depth d (0=far, 1=near) is linear in the arcade's world Y: PY = 240 - 224*d. Then the arcade's screen radius from the vanishing point is 256*|W-E|/(240 + H - 224*d) with H = HOLEYL. Normalising by its rim value and writing R_a = (16+H)/(240+H): 240+H = (16+H)/R_a and 224 = (16+H)*(1-R_a)/R_a, so the arcade's radius law collapses to R_a / (1 - (1-R_a)*d) — ALGEBRAICALLY IDENTICAL to ours, term for term. The curve family is right; only the value of R differs (see DB-006).

**DB-012 — Spike geometry: far lane-centre up to a tip at the lane's mid-point, projected at world depth LINEY**

- **CONFIRMED**
- Source: `ALDISP.MAC:3184` — `	JSR WORSCR		;PROJECT ENEMY LIVE NEAR PT.`
- Ours: `src/shell/render.ts:256` — `    const a = project(s.tube, lane, 0)`
- **Claim:** An 'enemy line' (spike) runs from the FAR end of its lane to its tip. FIXSTU (ALDISP.MAC:3100-3128) builds the far endpoint by averaging the screen coords of far rim points i and i+1 (LIFSXL[X] + LIFSXL[Y], Y = (X+1) & 0x0F, then >>1) — i.e. the lane centre at the far ring. TIPACT (ALDISP.MAC:3160-3186) then takes PYL = LINEY[i] (the spike's height, 0 = inactive, ALDISP.MAC:3162-3163), sets PXL/PZL = LINEXM[i]/LINEZM[i] (the pre-computed mid-point between grid lines i and i+1, built at ALDISP.MAC:2534-2552), projects it with WORSCR, and FCONNECs a vector from the far point to it. We do exactly this: a = project(tube, lane, 0) (the far lane-centre) to b = project(tube, lane, h) (render.ts:256-260). Same two endpoints, same lane-centre convention, same 'grows from the far end toward the rim' direction — and, per DB-005, through the same projection curve.

**DB-013 — Spike body is colour index 5 (GREEN in the wave-1 palette) with a WHITE dot at the tip**

- **CONFIRMED**
- Source: `ALDISP.MAC:3099` — `ENLFIX:	.BYTE 80,40,68,05`
- Ours: `src/shell/render.ts:251` — `  ctx.strokeStyle = '#39ff14'`
- **Claim:** DSPENL emits ENLFIX in REVERSE byte order (ALDISP.MAC:3024-3031 counts X down from 3), so VGLIST receives 05, 68, 40, 80. VGSTAT stores the colour index as the LSB and 0x60|flags as the MSB (ALVGUT.MAC:226-230), so 05/68 is 'STAT colour = 5'. Colour 5 = GREEN (ALCOMN.MAC: GREEN=5); the source's own comment at ALDISP.MAC:3095 names it CSTATGREEN. 40/80 is the CNTR opcode (VGCNTR, ALVGUT.MAC:239-240). The tip: when the line is not shattered, WHITIP writes 'STAT colour = WHITE' then a JSRL to the DOT picture (ALDISP.MAC:3208-3219, `LDA I,WHITE ;COLOR (SET STAT WHITE)`). Ours: green line #39ff14 (render.ts:251) with a single white dot at b (render.ts:263-266). Match.

**DB-015 — Starfield plane lifecycle constants all match: 8 planes, spawn 0xF0, step -7, next-spawn below 0xD5, retire below 0x10, 4 pictures**

- **CONFIRMED**
- Source: `ALDISP.MAC:2922` — `DSTARF:`
- Ours: `src/shell/starfield.ts:32` — `export const STAR_SPAWN_Z = 0xf0 // 240 — a fresh plane spawns here, far at the centre`
- **Claim:** NPLANE = 8 (ALCOMN.MAC:808) == STAR_PLANES (starfield.ts:36). PRSTAR (ALWELG.MAC:3431-3480) steps each active plane with `SBC I,07` == STAR_STEP 7 (starfield.ts:33); retires/recycles it once it drops below `CMP I,10` == STAR_RETIRE_Z 0x10 (starfield.ts:35); and activates the next INACTIVE plane at 0x0F0 only once the PREVIOUS plane has come closer than `CMP I,0D5` == STAR_SPAWN_NEXT_Z 0xD5 (starfield.ts:34) — the same stagger rule, and the same 0xF0 spawn point (INSTAR, ALWELG.MAC:3421-3422). DSPENL's sibling DSTARF picks the plane's picture with `LDA INDEX1 / AND I,3` (ALDISP.MAC:2965-2968) == STAR_PICTURES 4 (starfield.ts:37). Our `<= 0xd5` vs the arcade's strict `< 0xD5` can never differ, since z descends 240, 233, 226, 219, 212 and never lands on 213.


### 6.7 Audio — `ALSOUN.MAC`

Five of our seven baked sounds check out **byte-for-byte** against ALSOUN's own tables, trigger and envelope both: the segment tick, the enemy fire cue, the spike shot, the extra life, the pulsar hum, and the warp rumble. Then there is the cross-wiring. Our `player_fire.wav` *is* ALSOUN's ENEMY EXPLOSION data. Our `enemy_explosion.wav` *is* its THRUST-IN-SPACE data. The real launch sound's twelve bytes are already sitting, unshipped, inside our own bake tooling's verbatim ROM dump. This is the highest value-to-effort item in the audit.

#### Divergences

**S-011 — 'superzapper' (kzap.wav) has no basis anywhere in ALSOUN's 13-sound table**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (s)
- Source: `ALWELG.MAC:3531` — `	JSR KILENE		;WIPE OUT INVADERS & CHARGES`
- Ours: `src/shell/audio.ts:38` — `  superzapper: 'kzap.wav', // superzapper fired (community rip)`
- **Claim:** PROSUZ (ALWELG.MAC:3499-3537) processes a superzapper press by starting SUZTIM and calling KILENE every CSUINT+1 frames. KILENE's only sound-producing action is EXIKIL -> INCISQ -> GEXIFU -> CIEXPL (ALWELG.MAC:2839, "JSR CIEXPL ;BANG SOUND") — the SAME EX ("ENEMY EXPLOSION") cue an ordinary kill plays. Neither PROSUZ, KILENE, nor EXIKIL ever loads one of the 13 SIDxx codes for a dedicated "zap" tone, and ALSOUN's 13-entry PNTRS table (LO,EX,LA,PU,WP,DI,T2,T3,ES,EL,SL,S3,PO) has no such entry either. Our audio.ts nonetheless ships a distinct one-shot 'kzap.wav' (a community rip, not an authentic bake) played once on every 'superzapper-activate' event.
- **Correction (refuter):** Minor: KILENE is called by PROSUZ every active frame, not 'every CSUINT+1 frames' — it's KILENE's internal gate that skips alternate frames (see S-012). Doesn't change the finding's conclusion.

**S-012 — Superzapper's per-frame kill cadence already mirrors KILENE's timing**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (s)
- Source: `ALWELG.MAC:3542` — `KILENE:	LDA SUZTIM`
- Ours: `src/core/sim.ts:487` — `//     non-tanker per active frame (KILENE) until none remain. Charge → used-once.`
- **Claim:** KILENE (ALWELG.MAC:3542-3546) gates its kill on `CMP I,CSUSTA` (SUZTIM must first reach CSUSTA=3) then `AND I,CSUINT` (the result must be even) — so it eliminates one invader on a GATED cadence, roughly every OTHER active frame (every CSUINT+1=2 IRQ ticks), not on every frame. Our stepZap/runZapFrame/zapKillAt (src/core/sim.ts:473-531) instead vaporises one non-tanker on EVERY active frame of the zap window — sim.ts:487's own comment claims this 'mirrors KILENE', but it kills at up to double the ROM's authentic rate.

**S-013 — Charge-charge collisions (a player bullet shooting down an enemy bullet) are silent in our clone**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (m)
- Source: `ALWELG.MAC:2797` — `INCCSQ:	JSR CCEXPL		;CHARGE-CHARGE`
- Ours: `src/core/sim.ts:245` — `function resolveEnemyBulletHits(s: GameState): void {`
- **Claim:** INCCSQ plays the EX ("ENEMY EXPLOSION") cue via CCEXPL whenever a player charge destroys an enemy charge in flight, then deactivates the enemy shot and decrements ESHCOU. Our resolveEnemyBulletHits (src/core/sim.ts:245-261) implements the identical collision rule — its own comment says "player shots can destroy enemy bolts" (src/core/sim.ts:638) — but the function pushes no GameEvent at all, so no sound plays and no other system (particles, score) reacts either.

#### The book was wrong

**S-008 — Our 'fire' sound (player_fire.wav) is byte-identical to ALSOUN's ENEMY EXPLOSION data, not the LAUNCH SOUND**

- **BOOK_WAS_WRONG** · verdict **CONFIRMED** · recommend `fix` (m)
- Source: `ALSOUN.MAC:181` — `EX2F:	.BYTE 1,8,2,10		;ENEMY EXPLOSION`
- Ours: `tools/pokey-bake/sfx-data.mjs:34` — `      audf: [0x01, 0x08, 0x02, 0x10, 0x00, 0x00],`
- **Claim:** sfx-data.mjs's 'player_fire' entry (ROM $cc5d per the existing POKEY map) stores audf=[0x01,0x08,0x02,0x10,0x00,0x00] / audc=[0x86,0x20,0x00,0x04,0x00,0x00]. These are byte-for-byte identical to ALSOUN.MAC's EX2F (line 181, hex 0x01,0x08,0x02,0x10) and EX2A (line 183, ".BYTE 86,20,0,4" = hex 0x86,0x20,0x00,0x04) — the table entry ALSOUN itself labels "ENEMY EXPLOSION" and dispatches ONLY from EXSNON (fed by CCEXPL/CIEXPL on enemy/charge kills, e.g. ALWELG.MAC:2839 "JSR CIEXPL ;BANG SOUND"), never from SLAUNC (the actual player-fire trigger, ALWELG.MAC:2675). Our audio-dispatch.ts plays this exact sample on every 'fire' event — i.e. every time the player shoots.

**S-009 — Our 'enemyDeath' sound (enemy_explosion.wav) is byte-identical to ALSOUN's THRUST-IN-SPACE data, not an explosion**

- **BOOK_WAS_WRONG** · verdict **CONFIRMED** · recommend `fix` (m)
- Source: `ALSOUN.MAC:193` — `T36F:	.BYTE 10,0B,1,40	;THRUST SOUND IN SPACE`
- Ours: `tools/pokey-bake/sfx-data.mjs:55` — `      audf: [0x10, 0x0b, 0x01, 0x40, 0x00, 0x00],`
- **Claim:** sfx-data.mjs's 'enemy_explosion' entry (ROM $cc81) stores audf=[0x10,0x0b,0x01,0x40,0x00,0x00] / audc=[0x86,0x40,0x00,0x0b,0x00,0x00] — byte-for-byte identical to ALSOUN.MAC's T36F (line 193, hex 0x10,0x0b,0x01,0x40) and T36A (line 195, ".BYTE 86,40,0,0B" = hex 0x86,0x40,0x00,0x0b), labelled "THRUST SOUND IN SPACE" and dispatched ONLY from SOUTS3 (ALWELG.MAC:1037, "JSR SOUTS3 ;START SPACE SOUND") — fired when the cursor passes the bottom of the well and the game switches to starfield/"space" mode at the end of the warp dive, not when an invader dies.
- **Correction (refuter):** Minor: the reasoning's '12 ALSOUN table entries' should be 13 (PNTRS has 13 OFFSET calls) — does not affect the core claim.

#### No counterpart

**S-010 — ALSOUN's true LAUNCH SOUND (LA, the real player-fire cue) has no shipped counterpart**

- **NO_COUNTERPART** · recommend `fix` (m)
- Source: `ALSOUN.MAC:141` — `LA3F:	.BYTE 10,1,7,20,0,0`
- Ours: *(none — nothing in our code corresponds)*
- **Claim:** LA3F/LA3A (hex 0x10,0x01,0x07,0x20,0x00,0x00 / 0xa2,0x01,0xf8,0x20,0x00,0x00) is the ONLY ALSOUN table entry SLAUNC (ALWELG.MAC:2675, the moment a charge launches from the cursor) actually dispatches. It is not among the 7 sounds in tools/pokey-bake/sfx-data.mjs's clean SFX array. The identical 12 bytes already sit, unused for this purpose, inside that same file's own ALSOUN_STREAM blob (tools/pokey-bake/sfx-data.mjs:117, "0x10, 0x01, 0x07, 0x20, 0x00, 0x00, 0xa2, 0x01, 0xf8, 0x20, 0x00, 0x00,") — array offset 24, which the map's own address arithmetic (addr = $cbcf + 2v) resolves to ROM $cbe9, matching the existing POKEY map's own idx2 row ("$cbe9 | sound_Lccea ... player shot setup | player-shot variant? | no — multi-segment"). The map's authors flagged this exact address with a "?" and never resolved or shipped it.

**S-014 — No second, distinct "arrival in space" cue at the end of the warp dive**

- **NO_COUNTERPART** · recommend `fix` (m)
- Source: `ALWELG.MAC:1037` — `	JSR SOUTS3		;START SPACE SOUND`
- Ours: *(none — nothing in our code corresponds)*
- **Claim:** SOUTS3 (ALSOUN's T3, "THRUST SOUND IN SPACE") fires in MOVCUD the exact frame the cursor passes ILINDDY (the well's/tube's bottom) and "INITIALIZE SPACE MODE" begins — a second, distinct engine drone that takes over from T2's rumble (S-007, which starts the dive) for the remainder of the warp, ending only when the starfield (PRSTAR/INSTAR) itself is dismissed. Our clone plays exactly one loop ('levelClear'/warp.wav, started on 'level-clear') for the entire dive and stops it outright on 'warp-end' — there is no second phase, the sound just ends.

**S-015 — End-of-wave BONUS score award never plays the special-score chime**

- **NO_COUNTERPART** · recommend `fix` (s)
- Source: `ALEXEC.MAC:376` — `	JSR SAUSON		;MAKE NOISE`
- Ours: *(none — nothing in our code corresponds)*
- **Claim:** ENDWAV (ALEXEC.MAC:361-377, "PREP-END OF WAVE SETUP STATE") computes a per-player bonus score via BONSCO/UPSCOR at the end of every wave that has its BONUS flag set, then calls SAUSON — the SAME "SPECIAL SCORE SOUND" (WP) our clone already ships correctly as extra_life.wav (S-006). This is a SECOND, independent SAUSON trigger, distinct from the score-threshold extra-life award at GIVBON (ALEXEC.MAC:586). Our GameEvent union has no wave-clear-bonus variant, so this trigger never fires.

**S-016 — 3-second skill-select warning beep has no equivalent feature**

- **NO_COUNTERPART** · recommend `wont_fix`
- Source: `ALWELG.MAC:217` — `	JSR S3SWAR		;3 SECONDS WARNING`
- Ours: *(none — nothing in our code corresponds)*
- **Claim:** S3SWAR (ALSOUN's S3 entry) fires from PRORAT's (ALWELG.MAC:200-234, "INITIALIZE-SET SKILL LEVEL") pre-game countdown when QTMPAUS reaches exactly 3 seconds left before the game auto-selects a difficulty/wave for the player. Our clone has no skill-select screen or countdown timer of any kind, so there is no analogous moment to wire this to.

**S-017 — Cabinet slam/coin-door switch sound has no browser equivalent (confirms existing map's deferral)**

- **NO_COUNTERPART** · recommend `wont_fix`
- Source: `ALSOUN.MAC:258` — `	BNE FSNDON`
- Ours: *(none — nothing in our code corresponds)*
- **Claim:** SSLAMS (ALSOUN.MAC:257-258) branches to FSNDON, not SNDON — skipping the "ATTRACT MODE?" BIT QSTATUS gate (ALSOUN.MAC:225) every other trigger goes through — so the slam sound uniquely plays even during attract mode. It is driven from ALEXEC.MAC's LMTIM check ("SLAM SWITCH ON?", ALEXEC.MAC:258-260), a physical coin-door slam-switch input a browser clone has no equivalent for.

#### Structural — different by design

**S-018 — ALSOUN multiplexes 4 distinct sounds onto one shared POKEY channel; we give each an independent voice**

- **STRUCTURAL** · recommend `accept`
- Source: `ALSOUN.MAC:200` — `PU6F:`
- Ours: `src/shell/audio.ts:80` — `  pulsarHum: 'pulsar',`
- **Claim:** ALSOUN's label suffixes show T2 (T26F/T26A), T3 (T36F/T36A), PU (PU6F/PU6A) and PO (PO6F/PO6A) all end in the same channel digit "6" — THRUST-ON-TUBE, THRUST-IN-SPACE, PULSATION-ON and PULSATION-OFF are hard-multiplexed onto one shared physical POKEY audio channel, so on real hardware only one of them can ever sound at a time. Our shell instead gives 'levelClear' its own 'zoom' channel (audio.ts:77) and 'pulsarHum' its own independent 'pulsar' channel (audio.ts:80), so in our clone a warp dive and a ringing pulsar hum can overlap freely, whereas the arcade would always let one cut off the other.

**S-019 — ALSOUN's "FRAMES" counts a ~256 Hz sound IRQ tick, not the 60 Hz game frame**

- **STRUCTURAL** · recommend `accept`
- Source: `ALHARD.MAC:150` — `	INC $INTCT		;INTERRUPT COUNTER`
- Ours: `tools/pokey-bake/sfx-data.mjs:16` — `// The engine ticks at the ~246-250 Hz sound interrupt (NOT the 60 Hz game frame),`
- **Claim:** ALHARD.MAC's IRQ handler calls MODSND (ALHARD.MAC:148, unconditionally, every interrupt) then increments the single-byte $INTCT (line 150); $INTCT wrapping to 0 after 256 increments is treated as "ANOTHER SECOND?" (line 151), meaning this IRQ — and therefore every FRAMES/COUNT decrement inside ALSOUN's MODSND — fires roughly 256 times per second, not 60. ALSOUN.MAC's own naming ("FRAMES: FRAMES UNTIL NEXT CHANGE") invites reading its byte values as 60 Hz game-frame counts; they are not.

#### Confirmed matches

**S-001 — segment-tick trigger and bytes match ALSOUN's LO ("CURSOR MOVES"/SBOING)**

- **CONFIRMED**
- Source: `ALWELG.MAC:967` — `	JSR SBOING		;YES. MAKE SOUND`
- Ours: `src/shell/audio-dispatch.ts:65` — `        audio.play('segmentTick') // ★ authentic POKEY tick as the Claw crosses a lane (6-10)`
- **Claim:** SBOING (ALSOUN's LO entry, comment "CURSOR CROSSED A LINE") fires from ALWELG's cursor-position update exactly when CURSL1 (the cursor's/claw's current lane) changes to a new value — i.e. a lane crossing. Our 'segment-cross' GameEvent -> 'segmentTick' fires on the identical condition (crossing into a new lane). LO5F/LO5A (0x0f,0x04,0x00,0x01 / 0xa2,0x04,0x40,0x01) are also byte-identical to the ROM data baked as segment_tick.wav ($cc39) in tools/pokey-bake/sfx-data.mjs.

**S-002 — enemy-fire trigger and bytes match ALSOUN's ES ("ENEMY SHOT"/ESLSON)**

- **CONFIRMED**
- Source: `ALWELG.MAC:2721` — `	JSR ESLSON`
- Ours: `src/shell/audio-dispatch.ts:31` — `        audio.play('enemyFire') // 6-5 hook; authentic bake wired in 6-6`
- **Claim:** ESLSON is called from FIREIC ("PLAY - FIRE INVADER CHARGE") the moment an invader launches a charge at the cursor. Our EnemyFireEvent -> enemyFire fires on the identical moment (an enemy fired an energy bolt). ES8F/ES8A (0x00,0x03,0x02,0x09 / 0x08,0x03,0xff,0x09) are byte-identical to the ROM data baked as enemy_fire.wav ($cc45).

**S-003 — spike-shot trigger and bytes match ALSOUN's EL ("ENEMY LINE DESTRUCTION"/SELICO)**

- **CONFIRMED**
- Source: `ALWELG.MAC:2607` — `	JSR SELICO		;MAKE SOUND`
- Ours: `src/shell/audio-dispatch.ts:68` — `        audio.play('spikeShot') // ★ authentic spike_shot bake (ROM cc51, 10-11)`
- **Claim:** SELICO fires exactly when a player charge lands on an active enemy line (LINEY nonzero) at or past the line's current height, immediately followed by UPSCORE for the hit. Whether the hit fully retires the line (LINEY forced to 0 past ILINDDY) or merely shortens it, SELICO plays either way. Our SpikeShotEvent -> spikeShot fires on "a player bullet shortened a standing spike" — the same condition. EL7F/EL7A (0x80,0x01,0xe8,0x05 / 0xa1,0x01,0x01,0x05) are byte-identical to the ROM data baked as spike_shot.wav ($cc51).

**S-004 — player-death plays one sound for every death cause, matching ALSOUN's single DI entry**

- **CONFIRMED**
- Source: `ALSOUN.MAC:214` — `CPEXPL:	LDA I,SIDDI		;PLAYER DIES`
- Ours: `src/shell/audio-dispatch.ts:40` — `        audio.play('playerDeath')`
- **Claim:** IPEXPL and CPEXPL are both aliases that fall straight into the same "LDA I,SIDDI / JMP SNDON" (ALSOUN.MAC:214-215), so the ONE DI sound plays regardless of which death path (grab, pulse, spike, bolt) killed the cursor. DEADCU (ALWELG.MAC:2790, "JSR CPEXPL ;START NOISE") is the single kill-cursor routine every death path funnels through. Our PlayerDeathEvent carries a `cause: 'grab' | 'pulse' | 'spike' | 'bolt'` field, but audio-dispatch.ts's 'player-death' case ignores it and always calls audio.play('playerDeath') — exactly matching ALSOUN's one-sound-for-all-causes behaviour.

**S-005 — pulsar-hum start/stop trigger and bytes match ALSOUN's PU/PO (PULSTR/PULSTO)**

- **CONFIRMED**
- Source: `ALWELG.MAC:1552` — `	JSR PULSTR		;ACTIVE SO TURN ON`
- Ours: `src/shell/audio-dispatch.ts:74` — `        audio.startLoop('pulsarHum') // ★ loop the authentic pulsar_hum (ROM cc99, 10-11)`
- **Claim:** PULSTR (ALSOUN's PU) is called when `FLIPCO+ZABPUL` (active pulsars) is nonzero and the cursor is alive — the rising edge of "a pulsar exists". PULSTO (ALSOUN's PO) is called both on the falling edge (ALWELG.MAC:1546, "JSR PULSTO ;YES. TURN OFF") and defensively when the cursor dies on a line (ALWELG.MAC:1093). Our PulsarHumStartEvent/PulsarHumStopEvent fire on the identical 0→>0 / >0→0 transitions of the pulsar population. PU6F (0xb0,0x02,0x00,0xff, delta 0 = constant pitch) plus PU6A's repeated (0xc8,0x01,0x02,0xff) throb are byte-identical to pulsar_hum.wav's stream bytes (audfStart 0x65/audcStart 0x68).

**S-006 — extra-life trigger and bytes match ALSOUN's WP ("SPECIAL SCORE SOUND"/SAUSON) at the bonus-life award**

- **CONFIRMED**
- Source: `ALEXEC.MAC:586` — `	JSR SAUSON		;MAKE BONUS SOUND`
- Ours: `src/shell/audio-dispatch.ts:71` — `        audio.play('extraLife') // ★ authentic extra_life bake (ROM cc11, 10-11)`
- **Claim:** GIVBON (ALEXEC.MAC:580-589) increments LIVES1 (capped at 6) when a score-threshold interval is crossed, then calls SAUSON. Our ExtraLifeEvent -> extraLife fires on "the score crossed one (or more) EXTRA_LIFE_INTERVAL boundaries" — the same condition. WP4F/WP4A's 8-step descending arpeggio (0x40,0x01,0x00,0x01 ... 0x10,0x01,0xff,0x10 / 0xa8,0x93,0x00,0x02) is byte-identical to extra_life.wav's stream bytes (audfStart 0x21/audcStart 0x32).

**S-007 — levelClear/warp.wav trigger timing and bytes match ALSOUN's T2 ("THRUST SOUND ON TUBE"/SOUTS2)**

- **CONFIRMED**
- Source: `ALWELG.MAC:1022` — `	JSR SOUTS2		;YES. START RUMBLE`
- Ours: `tools/pokey-bake/sfx-data.mjs:65` — `      audf: [0xc0, 0x02, 0xff, 0xff, 0x00, 0x00],`
- **Claim:** SOUTS2 (ALSOUN's T2) fires in MOVCUD ("PLAY-MOVE CURSOR DOWN") on the very first frame of the dive, while CURSY still equals ILINLI (cursor/claw still at the top of the well). This is the same moment our LevelClearEvent fires, starting the sustained 'levelClear' loop (warp.wav). T26F/T26A (0xc0,0x02,0xff,0xff / 0x28,0x02,0x00,0xf0) are byte-identical to warp.wav's baked audf/audc arrays ($cc75).


### 6.8 Scoring, high scores and the ladder — `ALSCOR.MAC`

A thin pair, and honest about why: **ALSCOR does not decide what anything is worth.** It receives a computed score and displays, accumulates and persists it; `BONSCO` is only `.GLOBL`'d here. So none of the per-enemy point values could be adjudicated in this pair — they were, in pair 8 (B-010…B-016). Three findings here cite `node_modules/@arcade/shared`, which is a gitignored build artifact of another repository; see §8.

#### Divergences

**SC-001 — High-score board depth: 8 ranks in ALCOMN.MAC vs 10 in @arcade/shared**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (m)
- Source: `ALCOMN.MAC:26` — `NHISCO	=8			;# OF HIGH SCORES KEPT`
- Ours: `node_modules/@arcade/shared/dist/highscore.js:46` — `export const MAX_HIGH_SCORES = 10;`
- **Claim:** The 1981 board keeps exactly 8 ranked entries (NHISCO=8 sizes INITAL to 3*8=24 bytes and HSCORL/M/H to 8 slots throughout ALSCOR.MAC's HISCHK/INIINI). Our shared high-score module keeps 10, and its own doc-comment calls that "the classic 10-deep arcade ladder" — Tempest's classic ladder is 8-deep, not 10.

**SC-003 — Initials-entry screen has no auto-abort timer (the ROM's runs ~108 s, not the ~32 s first reported)**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `wont_fix`
- Source: `ALSCOR.MAC:36` — `ITIMHI=60`
- Ours: `src/core/state.ts:106` — `export interface HighScoreEntryState {`
- **Claim:** ITIMHI=60 (ALSCOR.MAC:36) is HEX in this assembler — decimal literals carry a trailing period ('SECOND =20.', ALCOMN.MAC:87; 'CMP I,10.', ALWELG.MAC:571), cf. B-021 — so ITIMHI = 0x60 = 96, not 60. It seeds TIMHIS (INTLDR, ALSCOR.MAC:745-746), which GETINI decrements once per 32 GAME frames (`LDA QFRAME / AND I,1F / IFEQ ... DEC TIMHIS`, ALSCOR.MAC:768-772) and aborts entry (CNOTFOU) at zero: 96 * 32 = 3072 game frames, which at the ROM's 256/9 = 28.44 fps (FR-001) is ~108 seconds before an idle player's initials entry is auto-cancelled. `HighScoreEntryState` (src/core/state.ts:106-108) carries only `{ initials: string }` — no countdown field anywhere in state.ts or sim.ts — so our entry screen waits indefinitely for input.

**SC-004 — Initial-letter alphabet: 27 symbols (A-Z + blank) in the ROM vs 26 (A-Z only) in ours**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `wont_fix`
- Source: `ALSCOR.MAC:37` — `CBLANK=26.`
- Ours: `node_modules/@arcade/shared/dist/name-entry.js:24` — `    if (buffer.length < maxLength && /^[a-zA-Z]$/.test(key))`
- **Claim:** The ROM's initial-selection cursor (GINICO/GETINI, ALSCOR.MAC:781-789) cycles a value 0-26 where 0-25 map through the ASCVG table to 'A'-'Z' and 26 (CBLANK) is an explicit blank/space glyph — 27 selectable symbols per character slot, and unfilled/default initials are seeded as blank (`LDA I,CBLANK` in HISCHK, ALSCOR.MAC:629-631). Our `stepNameEntry` regex `/^[a-zA-Z]$/` accepts only the 26 letters; there is no blank/space keystroke, and an unfilled slot is simply absent from the string rather than a stored blank character.
- **Correction (refuter):** Minor: the ROM's actual freshly-seeded default is 'A, blank, blank' (TEMP2=0, TEMP1=TEMP0=CBLANK), not 'blank, blank, blank' as the parenthetical might imply — doesn't affect the core 26-vs-27-symbol claim.

**SC-009 — ROM ships pre-seeded placeholder high-score entries; ours starts genuinely empty**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `wont_fix`
- Source: `ALSCOR.MAC:579` — `	.ASCVG	<HEBPJMLDSTFDHPMRRRSEDDJE>`
- Ours: `node_modules/@arcade/shared/dist/highscore.js:340` — `        const rows = raw === null ? [] : parseTable(raw);`
- **Claim:** INIINI (ALSCOR.MAC:513-536) seeds all 8 initial-triples from SCOINI's ASCVG string ("HEB PJM LDS TFD HPM RRR SED DJE") and seeds every HSCORL/M/H byte to 1 (lines 546-550) whenever the EAROM reads as blank/corrupt — a freshly-initialized board is never actually empty, it has 8 placeholder rows. Our `load()` returns `[]` whenever localStorage has no entry, so a fresh browser board has zero rows until a real qualifying score is inserted.
- **Correction (refuter):** Small nuance not stated by the finding: the full 8-triple reseed only happens when EABAD's initials-bad bit is actually set (526-531); if only game-options changed but initials read as valid, only the bottom 5 of 8 rank slots get overwritten (top 3 preserved). This doesn't undercut the claim — the worst/blank-EAROM case (the true 'freshly-initialized' scenario) still reseeds all 8 rows as described.

#### No counterpart

**SC-002 — The 99-rank percentile ranking system (HISCHK/RANKS/RNKDSP) has no equivalent in the clone**

- **NO_COUNTERPART** · recommend `wont_fix`
- Source: `ALCOMN.MAC:27` — `NRANKS	=99.`
- Ours: *(none — nothing in our code corresponds)*
- **Claim:** ALSCOR.MAC implements a whole subsystem, separate from the named 8-entry high-score table, that scores every finished game against an internal 99-slot ranking ladder (HRANKL/HRANKM/HRANKH, populated/shifted in HISCHK, lines ~600-720) and displays the result as "RANKING nn" next to "PLAYER X" (RNKDSP, ALSCOR.MAC:1026-1061, driven by message MRANK) every time the high-score ladder screen (LDRDSP) is shown — regardless of whether the player made the named top-8 list. grep across src/ finds no percentile/ranking concept anywhere; the only surviving use of the word "RANK" in our code is the unrelated pre-game skill-select banner (see SC-006).

#### Structural — different by design

**SC-007 — Per-message color table (MSGLBS) that would confirm/deny our RED/GREEN banner claim lives outside this module**

- **STRUCTURAL** · recommend `wont_fix`
- Source: `ALSCOR.MAC:23` — `	.GLOBL MHIGHS,MPLAYR,MENTER,ENGMSG,MSGLBS,LSYMBL,MPLAY,MPLYR2`
- Ours: `src/shell/render.ts:699` — `  // from the 1981 Messages table — RATE YOURSELF is GREEN, RANK/NOVICE/EXPERT RED.`
- **Claim:** MSGS (ALSCOR.MAC:423-467) derives each message's actual display color from a per-message byte in MSGLBS (`LDA X,MSGLBS ... LSR*4 ... JSR NWCOLO`), but MSGLBS itself is only declared `.GLOBL` here — its data table is defined in a different module, not in ALSCOR.MAC, ALEARO.MAC, or ALCOMN.MAC. Our render.ts comment asserts a specific split ("RATE YOURSELF is GREEN, RANK/NOVICE/EXPERT RED") that this pair's primary source cannot confirm or refute.

**SC-008 — Extra-life interval is an operator-configurable EAROM byte in the ROM, a hardcoded constant in ours**

- **STRUCTURAL** · recommend `accept`
- Source: `ALCOMN.MAC:782` — `BLIFIN:	.BLKB 1		;BONUS LIFE INTERVAL`
- Ours: `src/core/rules.ts:30` — `export const EXTRA_LIFE_INTERVAL = 10000`
- **Claim:** BLIFIN is a 1-byte RAM variable (not a compile-time constant) that BOLOUT displays via 3-digit BCD output captioned "OUTPUT 10K & 20K" (ALSCOR.MAC:966-979) — i.e. its value is operator-set via the cabinet's game-play options, with no fixed default anywhere in ALSCOR.MAC/ALCOMN.MAC. `EXTRA_LIFE_INTERVAL = 10000` in rules.ts is a single, permanent, non-configurable value.

**SC-010 — Per-enemy/per-kill point values are not present in ALSCOR.MAC — they are awarded by an external module**

- **STRUCTURAL** · recommend `wont_fix`
- Source: `ALSCOR.MAC:14` — `	.GLOBL BONSCO,VGSCAL`
- Ours: `src/core/rules.ts:21` — `export const SCORE_FLIPPER = 150`
- **Claim:** ALSCOR.MAC/ALEARO.MAC/ALCOMN.MAC contain no table of per-enemy-type point values and no fuseball-depth-band or spike-shortening point logic (grepped for FLIP/TANK/SPIK/PULS/FUSE and every plausible point literal — none). Even bonus-score computation is external: BONSCO is only declared `.GLOBL` and invoked (`JSR BONSCO` at BODSPL, ALSCOR.MAC:1250-1251) — ALSCOR.MAC receives a computed score and displays/accumulates/persists it; it does not decide per-kill values. Our SCORE_FLIPPER/SCORE_TANKER/SCORE_SPIKER/SCORE_PULSAR/SCORE_FUSEBALL_BASE+STEP/SCORE_SPIKE_SEGMENT constants (rules.ts:21-27) all live in the awarding side, which this pair's primary source does not cover.

**SC-011 — Start-level chooser: ROM shows a scrolling 5-wide window of candidate levels, ours shows one**

- **STRUCTURAL** · recommend `accept`
- Source: `ALSCOR.MAC:1226` — `XPOTAB:	.BYTE 0BE,0E3,09,30,58`
- Ours: `src/shell/render.ts:704` — `    ctx, 'START LEVEL  ${String(s.select.selectedLevel).padStart(2, '0')}', W / 2, H * 0.5,`
- **Claim:** XPOTAB holds 5 screen X-offsets (ALSCOR.MAC:1226); RQRDSP's inner loop (`LDX I,4 / STX INDEX1 ... MIEND`, ALSCOR.MAC:1133-1179) draws LEVEL#, BONUS points and HOLE for 5 candidate levels side-by-side, scrolling the window left/right as the spinner (CURSL1) approaches LEFSID/RITSID. Our drawSelect() renders exactly one level at a time — `s.select.selectedLevel` — with no adjacent-candidates preview.

#### Confirmed matches

**SC-005 — Three-letter initials convention matches**

- **CONFIRMED**
- Source: `ALCOMN.MAC:970` — `INITAL:	.BLKB 3*<NHISCO>`
- Ours: `src/core/sim.ts:49` — `const MAX_INITIALS = 3`
- **Claim:** The ROM reserves exactly 3 initial-bytes per ranked entry (3*NHISCO where NHISCO=8), and our entry buffer caps at MAX_INITIALS=3 — the classic 3-character arcade initials convention is preserved exactly.

**SC-006 — RANK banner flanked by NOVICE/EXPERT frames the pre-game skill/start-level chooser in both**

- **CONFIRMED**
- Source: `ALSCOR.MAC:1227` — `MSGTAB:	.BYTE MRATE,MPRMOV,MPRFIR	;RATE MESSAGES`
- Ours: `src/shell/render.ts:701` — `  drawGlowText(ctx, 'RANK', W / 2, H * 0.13 + 38, 16, '#ff2f4f', 8)`
- **Claim:** RQRDSP (ALSCOR.MAC:1074-1096) walks MSGTAB = {MRATE,MPRMOV,MPRFIR / MNOVIC,MEXPER,MLEVEL / MHOLE,MBONUS} (lines 1227-1229) to build the "RATE YOURSELF" / RANK screen with NOVICE and EXPERT flanking the level chooser. Our drawSelect() (render.ts:697-711) renders the same shape: 'RATE YOURSELF' + 'RANK' header (700-701), 'SELECT START LEVEL' chooser, 'NOVICE' at W*0.17 and 'EXPERT' at W*0.83 (708-709) flanking it — the concept and message set survive even though the presentation differs (see SC-011).


### 6.9 The state machine and the loop — `ALEXEC.MAC` / `ALHARD.MAC`

Almost entirely STRUCTURAL/accept, and that *is* the finding: this is where the two codebases are legitimately, defensibly different. A 19-way jump table versus a 7-value union; a sentinel value packed into the position byte versus an `alive: boolean`; a hand-rolled double-buffer flag versus `requestAnimationFrame`; an EAROM write-throttle versus `localStorage`. The one thing this pair got wrong was reading `SECOND=20` as evidence about the loop rate — corrected in P7-001's own text and settled in §3. Its `accept` on the fixed timestep stands; that accept covers the *variability*, not the *base*.

#### Divergences

**P7-005 — Starting lives-per-game is an operator-configurable RAM value (LVSGAM) in the ROM; ours is a hard-coded constant with no settings surface**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `wont_fix`
- Source: `ALCOMN.MAC:785` — `LVSGAM:	.BLKB 1			;LIVES/GAME`
- Ours: `src/core/rules.ts:15` — `export const START_LIVES = 3`
- **Claim:** NEWGAM reads LVSGAM at the start of every game (ALEXEC.MAC:294-295, `LDA LVSGAM ;GET # LIVES` / `STA AX,LIVES1 ;INITIAL # OF LIVES (GUNS)`) — a RAM cell the cabinet operator sets via DIP-switch-derived options, so "lives per game" is a configurable cabinet setting, not a compile-time constant. `START_LIVES = 3` (rules.ts:15) is a fixed literal with no equivalent options/settings mechanism anywhere in state.ts or rules.ts.

#### No counterpart

**P7-006 — The coin/credit economy ($$CRDT + PROCRE) has no counterpart**

- **NO_COUNTERPART** · recommend `accept`
- Source: `ALCOMN.MAC:409` — `$$CRDT:	.BLKB 1			;# OF CREDITS`
- Ours: *(none — nothing in our code corresponds)*
- **Claim:** PROCRE (ALEXEC.MAC:132-199) is a full credit-processing state machine gating whether a game may start: it decrements $$CRDT on each START press, enforces a "2 game minimum" option (NONSTA, ALEXEC.MAC:210-238), and forces $$CRDT to 2 in free-play mode (NOSTART, ALEXEC.MAC:244-249). None of state.ts, loop.ts or rules.ts has a credits/coin field, a start-gate, or a free-play concept.

**P7-007 — Two-player alternating turns and cocktail-cabinet screen flip have no counterpart**

- **NO_COUNTERPART** · recommend `accept`
- Source: `ALCOMN.MAC:454` — `PLAYUP:	.BLKB 1			;PLAYER UP (0=LEFT, 1=RIGHT)`
- Ours: *(none — nothing in our code corresponds)*
- **Claim:** PLAYUP/NUMPLA/NEWPLA (ALCOMN.MAC:454-456) track whose turn it is across a 2-player game, and COCFLI (ALEXEC.MAC:481-500) flips the physical video output (MFLIP/MVINVX/MVINVY, ALCOMN.MAC:263-264, 285) for player 2 on a cocktail cabinet. Our `Player` (state.ts:15-23) and `GameState` (state.ts:110-132) model exactly one player and have no second-player, turn-order, or screen-orientation concept anywhere.

**P7-008 — Per-IRQ ROM checksum + stack-depth/frame-overrun watchdog reset has no counterpart**

- **NO_COUNTERPART** · recommend `accept`
- Source: `ALHARD.MAC:33` — `CHKSMA::	.BYTE QCHKSA`
- Ours: *(none — nothing in our code corresponds)*
- **Claim:** Every IRQ, before anything else runs, ALHARD.MAC:44-52 checks the stack pointer against 0xD0 and FRTIMR's high bit; if the stack is too deep AND FRTIMR looks overrun it falls straight into a hardware RESET (`BRK` / `JMP RESET`, line 51-52). CHKSMA (line 33) plants a per-module checksum byte (one of QCHKS0-QCHKSB, lines 17-28) that is part of the same self-defense/anti-tamper scheme, alongside scattered "SECURITY" RAM cells (e.g. QT2, ALCOMN.MAC:799, consulted every logic frame at ALEXEC.MAC:262-269). None of loop.ts or state.ts has any checksum, stack-depth check, or watchdog-reset concept.

**P7-014 — EAROM (non-volatile settings) writes are throttled to every other logic frame; our persisted state has no analogous write-throttle**

- **NO_COUNTERPART** · recommend `accept`
- Source: `ALEXEC.MAC:254` — `	AND I,1`
- Ours: *(none — nothing in our code corresponds)*
- **Claim:** NONSTA masks QFRAME's low bit and only calls JSR EAUPD (the EAROM-writing routine) on odd logic frames (ALEXEC.MAC:252-257: `LDA QFRAME` / `AND I,1` / `IFNE` / `JSR EAUPD`) — a deliberate write-rate limiter for the EAROM's wear-limited storage. None of state.ts, loop.ts or rules.ts contains any comparable write-throttling logic for persisted data (the in-memory `highScoreTable`, state.ts:125, and its actual localStorage persistence live outside these files entirely, per the story-4-6 note at state.ts:125).

#### Structural — different by design

**P7-001 — MAINLN is an IRQ-tick-gated, self-paced loop whose ceiling is 256/9 = 28.4 fps; ours is a fixed 1/60s timestep decoupled from draw**

- **STRUCTURAL** · recommend `accept`
- Source: `ALHARD.MAC:151` — `	IFEQ			;ANOTHER SECOND?`
- Ours: `src/shell/loop.ts:9` — `const STEP = 1 / 60`
- **Claim:** ALHARD.MAC:149-151 increments a single byte, $INTCT, every IRQ and the source's OWN comment treats its 8-bit wrap (every 256 increments) as "ANOTHER SECOND" — i.e. the ROM's IRQ rate is ~256 Hz by the author's own arithmetic. MAINLN does not run game logic on every IRQ: it spins (ALEXEC.MAC:49-52, `LDA FRTIMR / CMP I,9 / CSEND`) until FRTIMR (also incremented once per IRQ, ALHARD.MAC:149) reaches 9, resets it to 0, then runs EXSTAT+NONSTA+DISPLA exactly once (ALEXEC.MAC:53-57) — a MINIMUM of 9/256s ≈ 35ms per logic frame (256/9 = 28.44 Hz ceiling), with NO maximum: JSR DISPLA (building the vector display list) happens inline before the loop re-checks FRTIMR, so a heavier scene makes that same iteration take longer in real time. The SECOND=20 constant (ALCOMN.MAC:87, re-declared ALEXEC.MAC:312) is NOT the loop's rate and is no evidence of one: it sits under ';TIMING FOR PAUSE STATE' (ALCOMN.MAC:85), appears only as the reload unit for pause/attract countdowns, and never gates MAINLN or the IRQ — the rate the machine runs at is the 28.44 fps ceiling, which is also what the author writes beside his enemy tables (';FRAMES UNTIL INVADER CAN FIRE (28 PER SECOND)', ALWELG.MAC:581). Our loop.ts hard-codes STEP=1/60 (loop.ts:9): every stepGame() call advances the sim by EXACTLY 1/60s of simulated time regardless of how expensive draw() is, and advanceFixedSteps() runs MORE steps to catch up after a slow frame rather than stretching a step's dt (loop.ts:64-69, 73-116).

**P7-003 — Player-dead is a sentinel value packed into the position field (CURSL1=0x80), not a separate flag**

- **STRUCTURAL** · recommend `accept`
- Source: `ALCOMN.MAC:832` — `				; 80 MEANS PLAYER IS DEAD`
- Ours: `src/core/state.ts:17` — `  alive: boolean`
- **Claim:** CURSL1 (ALCOMN.MAC:830-832) is the Claw's own position (one of the two tube-edge line numbers it straddles); the ROM overloads that SAME byte with the sentinel value 0x80 to mean "player is dead" instead of adding a separate status bit anywhere else in the RAM map. Our `Player` type (state.ts:15-23) keeps `lane: number` and `alive: boolean` as two independent fields — the dead/alive fact is never encoded by corrupting the position value.

**P7-004 — The warp/dive state is 3 packed RAM scalars (sign-flag + two fixed-point byte-pairs) vs our 2 plain floats**

- **STRUCTURAL** · recommend `accept`
- Source: `ALCOMN.MAC:707` — `CURMOD:	.BLKB 1			;CURSOR MODE (-:DROPPING)`
- Ours: `src/core/state.ts:93` — `  progress: number      // 0 = warp just entered (Claw at rim), 1 = arrived at next level`
- **Claim:** The ROM represents "is the Claw currently diving down the well, how far along, and how fast" with: CURMOD (ALCOMN.MAC:707), whose SIGN bit alone flags dropping-mode; CURSY/CURSYL (ALCOMN.MAC:833, 708), an integer+fractional byte pair for depth; and CURSVL/CURSVH (ALCOMN.MAC:705-706), an integer+fractional byte pair for acceleration/velocity down the well — 5 bytes across 3 named variables. Our `WarpState` (state.ts:92-96) covers the same three facts with `mode === 'warp'` (a tagged union member, state.ts:8) plus two IEEE-754 doubles, `progress` and `velocity`.

**P7-009 — ALVGUT's persistent vector-display-list API has no analogue; our draw callback is an opaque, stateless per-frame hook**

- **STRUCTURAL** · recommend `accept`
- Source: `ALVGUT.MAC:268` — `VGADD:	TYA			;ADD 1+(Y) TO VGLIST`
- Ours: `src/shell/loop.ts:39` — `  draw: (s: GameState, frameEvents: readonly GameEvent[]) => void,`
- **Claim:** ALVGUT.MAC is a library of primitives (VGADD, VGVCTR, VGHALT, VGSCAL, VGSTAT, VGHEX/VGHEXZ) that all share one contract: append a fixed-format instruction to a growing display list at (VGLIST,VGLIST+1), advance that pointer, and return — building up a retained buffer of vector-generator opcodes that the AVG hardware later scans independently of the CPU. `draw` (loop.ts:39) is the opposite shape: a single opaque callback invoked once per rendered frame, given the CURRENT state and nothing else, with no persistent list, no beam-position pointer, and no scale-factor quantization (VGSCAL's whole job, ALVGUT.MAC:277-290) — Canvas 2D's `stroke()`/`lineTo()` calls take plain floating-point coordinates directly.

**P7-010 — Manual dual-buffer swap (BUFRDY) vs the browser's own compositor/requestAnimationFrame**

- **STRUCTURAL** · recommend `accept`
- Source: `ALCOMN.MAC:521` — `BUFRDY:	.BLKB 1			;BUFFER STATUS (0-DISPLAY IT, <>0:BUILD IT)`
- Ours: `src/shell/loop.ts:119` — `    raf = requestAnimationFrame(frame)`
- **Claim:** BUFRDY (ALCOMN.MAC:521) is a hand-rolled double-buffer flag: the CPU builds the NEXT vector list into one buffer while the AVG hardware scans the CURRENT one, and BUFRDY tracks which role each buffer is playing (per ALHARD.MAC's own header comment, line 36: "SWITCH DISPLAY BUFFER POINTER AND BUILD BUFFER POINTERS WHEN TIME"). Our loop has no buffer-status flag at all — `requestAnimationFrame(frame)` (loop.ts:119, 125) delegates atomic frame presentation entirely to the browser's own compositor.

**P7-011 — DISPLA runs exactly once per completed logic frame; our draw() runs once per rendered frame regardless of how many fixed sub-steps ran inside it**

- **STRUCTURAL** · recommend `accept`
- Source: `ALEXEC.MAC:57` — `	JSR DISPLA		;EXECUTE CODE TO DISPLAY NEW SCREEN`
- Ours: `src/shell/loop.ts:59` — `    // clears state.events each step, so the post-loop state only carries the`
- **Claim:** MAINLN calls JSR DISPLA exactly once per EXSTAT/NONSTA pass (ALEXEC.MAC:55-57) — logic and display are 1:1, always. Our `frame()` (loop.ts:53-120) can run the fixed sub-step callback ZERO, ONE, or SEVERAL times per `requestAnimationFrame` (via `advanceFixedSteps`'s catch-up, loop.ts:73-116) but calls `draw()` exactly once at the end regardless (loop.ts:118) — the comment at loop.ts:58-61 states outright that when 2+ sub-steps run in one rendered frame, only the LAST one's events/state are ever drawn; earlier sub-step states are computed and then never rendered.

**P7-012 — QSTATE is a 19-way per-frame dispatch table; our Mode is a 7-value union plus continuous per-feature timers**

- **STRUCTURAL** · recommend `accept`
- Source: `ALEXEC.MAC:85` — `ROUTAD:	.WORD NEWGAM-1		;NEW GAME`
- Ours: `src/core/state.ts:8` — `export type Mode = 'attract' | 'select' | 'playing' | 'dying' | 'gameover' | 'warp' | 'highscore'`
- **Claim:** ROUTAD (ALEXEC.MAC:85-103) lists exactly 19 `.WORD` entries — one dedicated routine address per QSTATE code (NEWGAM, NEWLIF, PLAY, ENDLIF, ENDGAM, PAUSE, an unused NEWAV slot, ENDWAV, HISCHK, GETINI, DLADR, PRORAT, NEWAV2, LOGINI, INIRAT, NEWLF2, PLDROP, SYSTEM, PRBOOM) — and EXSTAT (ALEXEC.MAC:66-81) dispatches every logic frame purely by indexing this table with QSTATE (ALCOMN.MAC:396). Our `Mode` (state.ts:8) has 7 values; the finer-grained ROM states are instead folded into continuous per-feature countdowns living alongside mode (`player.respawnTimer`, `warp.progress`/`velocity`/`warning`, `spawn.timer`, `player.zapTimer`).

**P7-013 — The ROM stores the wave number zero-based ("-1"); we store level 1-based, matching the displayed number**

- **STRUCTURAL** · recommend `accept`
- Source: `ALCOMN.MAC:464` — `WAVEN1:	.BLKB 1			;# OF ENEMY WAVE WHICH PLAYER IS BATTLING -1`
- Ours: `src/core/state.ts:112` — `  level: number`
- **Claim:** WAVEN1's own comment says the stored byte is the wave number MINUS 1 — i.e. wave 1 (what the player sees) is stored as 0. `GameState.level` (state.ts:112) is initialised to `level: 1` (state.ts:138) and incremented directly (`s.level += 1` in advanceLevel) to match the number actually shown to the player — no off-by-one offset anywhere.

#### Confirmed matches

**P7-002 — The concept of recording the wave/level reached alongside the score is preserved**

- **CONFIRMED**
- Source: `ALCOMN.MAC:742` — `HIWAVE:	.BLKB 1		;HIGHEST WAVE REACHED IN LAST GAME`
- Ours: `src/core/state.ts:125` — `  highScoreTable: HighScoreTable<'level'>  // in-memory top scores (persistence is 4-6)`
- **Claim:** ENDGAM (ALEXEC.MAC:429-446) computes HIWAVE — the highest wave any player reached that game — every time a game ends, immediately before the state machine requests HISCHK (the hi-score ladder check, ALEXEC.MAC:450). Our `GameState.highScoreTable` is explicitly typed `HighScoreTable<'level'>` (state.ts:125), i.e. the shared high-score module is parameterised to carry a level/wave reached alongside each score entry, the same pairing the ROM computes at end-of-game.


### 6.10 Book reconciliation — the secondary source on trial

This pair took every constant we shipped *because the book said so* and put it against the primary source. Nine were wrong; they are tabulated in §7. Note B-009, which is the mirror case: the book was **right** ("|lane - CURSL1| < 2") and we implemented it wrong anyway (`<= 2`).

#### Divergences

**B-005 — Player bullet travel time: '~25 frames' is right, but that is 0.875 s — the '~0.42s' half of our comment is the 60 Hz base**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `fix` (s)
- Source: `ALCOMN.MAC:890` — `PCVELO	=9			;PLAYER SHOT VELOCITY (I)`
- Ours: `src/core/rules.ts:7` — `export const BULLET_SPEED = 2.4       // depth units/sec (near → far); ROM rev-3 frees the slot at ~25 frames / ~0.42s`
- **Claim:** A charge starts at CURSY = ILINLIY = 0x10 (ALWELG.MAC:296-297, ILINLIY defined ALCOMN.MAC:820) and advances by PCVELO=9/frame (ALWELG.MAC:2540 'ADC I,PCVELO') until CHARY >= ILINDDY = 0xF0 (ALWELG.MAC:2549 'CMP I,ILINDDY', ILINDDY defined ALCOMN.MAC:819). Distance = 0xF0-0x10 = 224 along-units, so frames-to-cross = 224/9 = 24.9 — our comment's '~25 frames' is confirmed. But those are GAME frames of 35.16 ms (256/9 = 28.44 fps, FR-001), so the travel time is 0.875 s, not the '~0.42s' the same comment claims. Normalized to depth units the ROM's rate is 9*(256/9)/224 = 1.143 depth-units/sec; BULLET_SPEED = 2.4 is 9*60/224 — 2.10x too fast.

**B-006 — Spike height cap (SPIKE_MAX_DEPTH) vs the ROM's single along-clamp**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `accept`
- Source: `ALWELG.MAC:2228` — `	LDA I,20		;MAX HEIGHT`
- Ours: `src/core/rules.ts:28` — `export const SPIKE_MAX_DEPTH = 0.75     // spiker turnaround + spike height cap`
- **Claim:** We ship SPIKE_MAX_DEPTH=0.75. The ROM has no cap distinct from the spiker's own climb clamp: JSTRAI (ALWELG.MAC:2205-2229) caps a climbing spiker's INVAY at 0x20 ("MAX HEIGHT", line 2228), and LINEY (the spike's visible tip) is set directly from that same INVAY (lines 2214-2217) — so the ROM's one and only relevant cap is 0x20, i.e. depth (0xF0-0x20)/224 = 0.929, the SAME value already used for our own SPIKER_TURNAROUND_DEPTH (rules.ts:115). Our SPIKE_MAX_DEPTH (0.75) sits well below the ROM's actual cap (0.929).

**B-017 — Extra-life score interval (EXTRA_LIFE_INTERVAL)**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `accept`
- Source: `ALEXEC.MAC:565` — `	LDX BLIFIN		;YES. ET BONUS LIFE INTERVAL (IN 10 K UNITS)`
- Ours: `src/core/rules.ts:30` — `export const EXTRA_LIFE_INTERVAL = 10000`
- **Claim:** EXTRA_LIFE_INTERVAL=10000 is shipped as one fixed rule ("extra life every 10,000 points"). The primary source has no single such constant: BLIFIN (ALCOMN.MAC:782, "BONUS LIFE INTERVAL") is a RAM variable set at boot from an operator DIP-switch field, decoded through TBLIFI (ALLANG.MAC:289, '.BYTE 2,1,3,4,5,6,7,0') into a bonus-life interval of 0 (off), 10K, 20K, ... or 70K points depending on the cabinet's switch setting. 10,000 IS one of the 8 selectable values, but nothing in the disassembly identifies a single canonical/default interval the way a fixed constant would.

#### The book was wrong

**B-001 — Superzapper first-press window length (ZAP_WINDOW_FIRST)**

- **BOOK_WAS_WRONG** · verdict **CONFIRMED** · recommend `fix` (s)
- Source: `ALWELG.MAC:3539` — `TIMAX:	.BYTE 0,CSUSTA+<8*<CSUINT+1>>,CSUSTA+<1*<CSUINT+1>>,0,0`
- Ours: `src/core/rules.ts:35` — `export const ZAP_WINDOW_FIRST = 13`
- **Claim:** We shipped ZAP_WINDOW_FIRST = 13 frames, matching the book's literal transcription "TIMAX: .BYTE 00,13,05". The primary source's TIMAX table is not a literal byte list, it is a computed expression: TIMAX[1] = CSUSTA + (8*(CSUINT+1)). With CSUSTA=3 and CSUINT=1 (ALWELG.MAC:3490-3492), TIMAX[1] = 3 + (8*2) = 19, not 13. The authentic first Superzapper active window is 19 GAME frames — which at the ROM's 256/9 = 28.44 fps (FR-001) is 0.668 s, not the '~0.317s at 60Hz' this finding originally stated. Ours, 13 frames ticked at the sim's 1/60 s timestep, lasts 0.217 s: 3.1x short in wall-clock.

**B-009 — Attract-demo auto-fire lane-distance boundary (DEMO_FIRE_LANES)**

- **BOOK_WAS_WRONG** · verdict **CONFIRMED** · recommend `fix` (s)
- Source: `ALWELG.MAC:2648` — `	CMP I,2`
- Ours: `src/core/sim.ts:680` — `    Math.abs(laneOffset(s.tube, pl, lane)) <= DEMO_FIRE_LANES`
- **Claim:** We fire whenever an enemy/bolt lane distance is <= 2 (0, 1, or 2 lanes away). The ROM's FIREPC attract branch (ALWELG.MAC:2629-2655) computes the absolute lane delta then 'CMP I,2 / IFCC' (lines 2648-2649) — IFCC (branch-if-carry-clear) fires ONLY when the delta is strictly less than 2 (0 or 1 lanes). The ROM never auto-fires at distance 2; our shipped '<= DEMO_FIRE_LANES' (DEMO_FIRE_LANES=2) does. The book's own prose states this correctly ("within 2 lanes ... |lane - CURSL1| < 2") — this is our implementation diverging from both the book AND the ROM, not a book transcription error.

**B-015 — Fuseball score-tier selection: depth-based (ours) vs random (ROM)**

- **BOOK_WAS_WRONG** · verdict **CONFIRMED** · recommend `fix` (m)
- Source: `ALWELG.MAC:2757` — `	IFCS			;RANDOMLY CHOOSE 0(250_,1(500), OR 2(750)`
- Ours: `src/core/rules.ts:201` — `  const tier = Math.min(2, Math.max(0, Math.floor(depth * 3))) // 0,1,2`
- **Claim:** Our fuseballScore() derives the 250/500/750 tier from the fuseball's DEPTH at time of kill (Math.floor(depth*3), rules.ts:200-203). The ROM's INCFS2 instead rolls RANDO2 AND 7 (0-7, ALWELG.MAC:2754-2755); if the roll is >=3 (5 of 8 outcomes) it forces tier 0, otherwise it keeps the roll (0, 1, or 2) directly as the tier (ALWELG.MAC:2756-2759) — i.e. P(tier0)=6/8=75%, P(tier1)=1/8, P(tier2)=1/8, entirely independent of where onscreen the fuseball died. The point VALUES (250/500/750, see B-014) are correct, but the selection MECHANISM is not depth-based at all — it is a heavily tier-0-weighted coin flip.

**B-016 — Points per spike-line hit (SCORE_SPIKE_SEGMENT)**

- **BOOK_WAS_WRONG** · verdict **CONFIRMED** · recommend `fix` (s)
- Source: `ALWELG.MAC:2613` — `	LDA I,1`
- Ours: `src/core/rules.ts:27` — `export const SCORE_SPIKE_SEGMENT = 3    // points for shortening a spike (arcade: 1–3)`
- **Claim:** We award 3 points per bullet-vs-spike-line hit. LIFECT (ALWELG.MAC:2589-2617), the ROM's charge-vs-enemy-line collision handler, signals the score routine to use TEMP0-2 directly ('LDX I,-1', line 2609) with TEMP1=TEMP2=0 and TEMP0=1 (lines 2610-2614, comment literally "ADD 1 TO SCORE FOR EACH HIT") before JSR UPSCORE. A decimal-mode BCD add of 1/0/0 is exactly 1 point per hit — not 3, and not a 1-3 range.

**B-019 — Superzapper KILENE kill cadence (CSUSTA/CSUINT gate) not modeled**

- **BOOK_WAS_WRONG** · verdict **CONFIRMED** · recommend `fix` (m)
- Source: `ALWELG.MAC:3543` — `	CMP I,CSUSTA`
- Ours: `src/core/sim.ts:477` — `    if (idx >= 0) zapKillAt(s, idx)`
- **Claim:** The book's §12 names CSUINT=1 ("kill-cadence mask on the timer") and CSUSTA=3 ("kill-window lower cutoff") as KILENE's gate. Our runZapFrame (sim.ts:473-480) kills one non-tanker enemy unconditionally on EVERY active frame of the first window. The ROM's KILENE (ALWELG.MAC:3542-3552) only kills when SUZTIM>=CSUSTA(3) AND (SUZTIM AND CSUINT)==0 — i.e. only on even SUZTIM values from 4 upward (roughly every OTHER frame), not every frame.

**B-021 — Attract title-rainbow pass count (LOGO_PASSES)**

- **BOOK_WAS_WRONG** · verdict **CONFIRMED** · recommend `wont_fix`
- Source: `ALSCOR.MAC:1281` — `	LDA I,19			;STARTING  CLOSE`
- Ours: `src/shell/titleLogo.ts:23` — `export const LOGO_PASSES = 19`
- **Claim:** We hardcode 19 fixed rainbow passes. The primary source has no fixed "draw the title N times" constant: SCARNG (ALSCOR.MAC:1341-1387) loops from NEARY to FARY in steps of 2 ('ADC I,2 / CMP FARY / CSEND', lines 1383-1387), and NEARY/FARY are dynamic RAM values that BOXPRO and LOGPRO reseed and advance frame-by-frame. LOGINI seeds FARY=0x19/NEARY=0x18 (25/24 decimal — this assembler's default radix is hex; decimal needs a trailing period, e.g. 'NLINES=16.' at ALCOMN.MAC:810) for the earlier, DIFFERENT "shrinking box" rainbow (VORBOX), not the TEMPEST word (VORLIT, drawn by LOGPRO). The apparent number of SCARNG passes changes every frame as NEARY/FARY converge; it is never a fixed 19 anywhere in the source.

#### Confirmed matches

**B-002 — Superzapper second-press window length (ZAP_WINDOW_SECOND), as a FRAME COUNT**

- **CONFIRMED**
- Source: `ALWELG.MAC:3539` — `TIMAX:	.BYTE 0,CSUSTA+<8*<CSUINT+1>>,CSUSTA+<1*<CSUINT+1>>,0,0`
- Ours: `src/core/rules.ts:36` — `export const ZAP_WINDOW_SECOND = 5`
- **Claim:** Both agree at 5 frames. TIMAX[2] = CSUSTA + (1*(CSUINT+1)) = 3 + (1*2) = 5, matching ZAP_WINDOW_SECOND = 5 and the book's transcribed final byte '05'. The COUNT matches; the DURATION does not — 5 ROM game frames is 5/28.44 = 0.176 s (FR-001), whereas our 5 frames are ticked once per 1/60 s sim step and last 0.083 s.

**B-003 — Warp-dive starfield constants (spawn/retire/step/plane-count) — the five CONSTANTS only, not the cadence**

- **CONFIRMED**
- Source: `ALWELG.MAC:3442` — `	SBC I,07		;UPDATE PLANE POSITION`
- Ours: `src/shell/starfield.ts:32` — `export const STAR_SPAWN_Z = 0xf0 // 240 — a fresh plane spawns here, far at the centre`
- **Claim:** All four numbers plus the plane count are confirmed: spawn Z 0xF0 (ALWELG.MAC:3421, 3449, 3469), step -7/frame (ALWELG.MAC:3442 'SBC I,07'), retire below 0x10 (ALWELG.MAC:3444 'CMP I,10' after the SBC), spawn-next threshold 0xD5 (ALWELG.MAC:3467 'CMP I,0D5'), and 8 planes (NPLANE=8, ALCOMN.MAC:808). Matches STAR_SPAWN_Z=0xf0, STAR_STEP=7, STAR_RETIRE_Z=0x10, STAR_SPAWN_NEXT_Z=0xd5, STAR_PLANES=8 (starfield.ts:32-36) exactly. The step is per GAME frame, so the ROM's planes close at 7 * 28.44 = 199 along-units/second (FR-001).

**B-004 — Player bullet cap (MAX_BULLETS)**

- **CONFIRMED**
- Source: `ALCOMN.MAC:812` — `NPCHARG=8`
- Ours: `src/core/rules.ts:8` — `export const MAX_BULLETS = 8`
- **Claim:** Both 8. ALCOMN.MAC:812 defines NPCHARG=8, the maximum simultaneous player charges, matching MAX_BULLETS=8 exactly.

**B-007 — Attract-demo random start level ("RANDOM AND 7")**

- **CONFIRMED**
- Source: `ALWELG.MAC:243` — `	AND I,7`
- Ours: `src/core/sim.ts:651` — `const DEMO_MAX_LEVEL = 8  // random start level 1..8 ("RANDOM AND 7")`
- **Claim:** Confirmed: ALWELG.MAC:242-243 draws 'LDA RANDOM' then 'AND I,7', masking to the range 0-7 (8 values), matching our DEMO_MAX_LEVEL=8 (used as nextInt(rng,8) -> 0..7, then +1 for the 1-indexed level).

**B-008 — Attract-demo life count (DEMO_LIVES = 1)**

- **CONFIRMED**
- Source: `ALWELG.MAC:240` — `	LDY I,1`
- Ours: `src/core/sim.ts:650` — `const DEMO_LIVES = 1      // the attract demo gets a single life (book: attract admin)`
- **Claim:** Confirmed: ALWELG.MAC:240-241 ('LDY I,1' / 'STY LIVES1') sets the attract demo to exactly 1 life, matching DEMO_LIVES=1.

**B-010 — Flipper kill score (SCORE_FLIPPER = 150)**

- **CONFIRMED**
- Source: `ALEXEC.MAC:598` — `TUPSCL:	.BYTE  00,50,0,0,50,50,0,50`
- Ours: `src/core/rules.ts:21` — `export const SCORE_FLIPPER = 150`
- **Claim:** Confirmed: score-table index 1 (TUPSCL[1]=0x50, TUPSCM[1]=1 at ALEXEC.MAC:598/600) evaluates in BCD as 1*100+50=150 points, matching SCORE_FLIPPER=150.

**B-011 — Tanker kill score (SCORE_TANKER = 100)**

- **CONFIRMED**
- Source: `ALEXEC.MAC:598` — `TUPSCL:	.BYTE  00,50,0,0,50,50,0,50`
- Ours: `src/core/rules.ts:23` — `export const SCORE_TANKER = 100`
- **Claim:** Confirmed: score-table index 3 (TUPSCL[3]=0, TUPSCM[3]=1 at ALEXEC.MAC:598/600) evaluates to 1*100+0=100 points, matching SCORE_TANKER=100.

**B-012 — Spiker kill score (SCORE_SPIKER = 50)**

- **CONFIRMED**
- Source: `ALEXEC.MAC:598` — `TUPSCL:	.BYTE  00,50,0,0,50,50,0,50`
- Ours: `src/core/rules.ts:22` — `export const SCORE_SPIKER = 50`
- **Claim:** Confirmed: score-table index 4 (TUPSCL[4]=0x50, TUPSCM[4]=0 at ALEXEC.MAC:598/600) evaluates to 0*100+50=50 points, matching SCORE_SPIKER=50.

**B-013 — Pulsar kill score (SCORE_PULSAR = 200)**

- **CONFIRMED**
- Source: `ALEXEC.MAC:600` — `TUPSCM:	.BYTE  0,1,02,1,0,2,5,7`
- Ours: `src/core/rules.ts:24` — `export const SCORE_PULSAR = 200`
- **Claim:** Confirmed: score-table index 2 (TUPSCL[2]=0, TUPSCM[2]=0x02 at ALEXEC.MAC:598/600) evaluates to 2*100+0=200 points, matching SCORE_PULSAR=200.

**B-014 — Fuseball score tiers (SCORE_FUSEBALL_BASE / SCORE_FUSEBALL_STEP values)**

- **CONFIRMED**
- Source: `ALWELG.MAC:2767` — `	ADC I,5`
- Ours: `src/core/rules.ts:26` — `export const SCORE_FUSEBALL_STEP = 250  // 250 / 500 / 750 across depth thirds`
- **Claim:** Confirmed: INCFS2 (fuseball explosion/score init, ALWELG.MAC:2745-2771) offsets its chosen tier (0/1/2) by +5 ('ADC I,5', line 2767) into the score table, landing on indices 5/6/7. TUPSCL/TUPSCM at those indices (ALEXEC.MAC:598,600) evaluate to 250/500/750 — a flat 250-point step, matching SCORE_FUSEBALL_BASE=250 and SCORE_FUSEBALL_STEP=250 exactly.

**B-018 — Player bullet ammo-count tint thresholds (playerBulletColor)**

- **CONFIRMED**
- Source: `ALDISP.MAC:922` — `	CMP I,NPCHARG-2`
- Ours: `src/shell/glyphs.ts:293` — `  if (chargesInFlight >= 8) return 'red'`
- **Claim:** Confirmed: the ROM's bullet-center color select (ALDISP.MAC:920-929) defaults to ZYELLO (plenty), promotes to ZBLUE once CHACOU >= NPCHARG-2 (=6, line 922), and to ZRED once CHACOU >= NPCHARG (=8, line 925) — exactly our thresholds (<6 yellow, 6-7 cyan, 8 red; glyphs.ts:292-296).

**B-020 — Enemy-death explosion scale/brightness ramp (EXPL1-4)**

- **CONFIRMED**
- Source: `ALVROM.MAC:345` — `	CM=1`
- Ours: `src/shell/fx.ts:83` — `const ENEMY_SCALE_STEPS = [1, 2, 4, 8] as const // doubling each frame`
- **Claim:** Confirmed: ALVROM.MAC:344-376 defines EXPL1..EXPL4 with CM (scale) = 1,2,4,8 and CB (brightness) = 07,0E,0E,0E — matching ENEMY_SCALE_STEPS=[1,2,4,8] and ENEMY_DIM=7 / ENEMY_BRIGHT=14 (fx.ts:85-86; 0x0E=14).


### 6.11 The vector font — `ANVGAN.MAC`

A clean result, and a correction to our own pessimism. Story 10-13 concluded that only 4 of the 37 glyphs (A, T, R, I) were verbatim and that the rest were suspect inventions. That was wrong: **all 26 letters and all 10 digits match the ROM vector-for-vector, delta-for-delta, in the same stroke order** — including the detail that `CHAR.0 = CHAR.O` is an *alias* rather than an independently drawn zero, which our shared font also reproduces. This pair only became possible after the `.INCLUDE`-ships rule was fixed (trap (b), §2).

#### Divergences

**F-003 — CHAR.B's two dimmer cross-strokes (.BRITE-1) are flattened to the same uniform brightness as the rest of the glyph**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `wont_fix`
- Source: `ANVGAN.MAC:46` — `	VCTR 4,-4,.BRITE-1		;THESE VECTORS ARE BRIGHTER THAN THE OTHERS`
- Ours: `src/shell/font.ts:14` — `export * from '@arcade/shared/font'`
- **Claim:** ALVROM.MAC:22 fixes .BRITE=6 before the alphabet include, so every VCTR ...,.BRITE op in the included alphabet draws at intensity 6 - except CHAR.B's two 3-vector diagonal runs, each written as .BRITE-1 (=5): `VCTR 4,-4,.BRITE-1` / `VCTR 0,-4,.BRITE-1` / `VCTR -4,-4,.BRITE-1`, repeated for the letter's lower bowl. (The inline comment reads 'THESE VECTORS ARE BRIGHTER THAN THE OTHERS', which is backwards given 5<6 - likely an authoring-era mislabel - but the byte value is unambiguous: one point dimmer.) This BRITE-1 pattern is unique to B; no other letter, digit, DASH, HALF or COPYR routine uses it. Our `ROM.B` entry (dist/font.js:33-34) stores those same six vectors with intensity flattened to the uniform lit flag `1`, identical to every other lit vector in the glyph - the geometry is exact but the one-step brightness distinction is lost.

**F-008 — Our comma, slash and underscore glyphs are drawn with zero ROM basis - they are new, disclosed additions for other games in the shared font**

- **DIVERGENCE** · verdict **CONFIRMED** · recommend `accept`
- Source: `ALVROM.MAC:31` — `	JSRL COPYR		;CIRCLE C (USE #)`
- Ours: `src/shell/font.ts:14` — `export * from '@arcade/shared/font'`
- **Claim:** ALVROM.MAC:28-31 is the complete, four-entry list of every message-glyph entry point the module calls beyond the plain 37-character VGMSGA alphabet - CHAR. (space), DASH, HALF, COPYR - and nothing else; ANVGAN.MAC's own VGMSGA table (line 316 onward) likewise enumerates only space/digits/A-Z. There is no ROM routine, in any citable or read module, for a comma, a forward slash, or an underscore. Yet @arcade/shared/font's `ROM` table includes `',': [[8,4,0],[-4,-8,1],[20,4,0]]`, `'/': [[16,24,1],[8,-24,0]]`, and `'_': [[16,0,1],[8,0,0]]` (dist/font.js:79-81), each with an inline comment naming the consuming game (star-wars for the comma, battlezone for the slash, asteroids for the underscore) and explicitly stating 'These are NOT verbatim ROM data' (dist/font.js:68-70).

#### No counterpart

**F-007 — HALF (1/2) and COPYR (circle-C) - the two composite message glyphs the ROM defines beyond plain alphanumerics - have no counterpart in ours**

- **NO_COUNTERPART** · recommend `wont_fix`
- Source: `ALVROM.MAC:30` — `	JSRL HALF		;1/2 (USE QUOTES)`
- Ours: *(none — nothing in our code corresponds)*
- **Claim:** Beyond the alphabet, space and DASH, ALVROM.MAC defines exactly two more message glyphs, both natively (no ANVGAN needed): COPYR (ALVROM.MAC:37-52), an outer circle of 8 lit vectors plus an inner 'C' of 3 more, reached by typing '#'; and HALF (ALVROM.MAC:53-60), a slash (`VCTR 16,24,.BRITE`) followed by a scaled-down JSRL CHAR.1 and JSRL CHAR.2 to draw a fraction '1/2', reached by typing a quote character. @arcade/shared/font's entire character set is `GLYPH_CHARS = ' 0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-,/_'` (dist/font.js:118) - neither glyph appears; any attempt to render '#' or a quote falls through `charGlyph`'s `hasGlyph` check to the blank space glyph (dist/font.js:120-126).

#### Structural — different by design

**F-001 — The shipped glyph data is carried by ALVROM.MAC's own assembly (via an unconditional .INCLUDE), not by any citable module's own source text**

- **STRUCTURAL** · recommend `accept`
- Source: `ALVROM.MAC:26` — `	.INCLUDE ANVGAN	;<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<`
- Ours: `src/shell/font.ts:14` — `export * from '@arcade/shared/font'`
- **Claim:** ANVGAN.MAC ("ALPHA-NUMERIC VECTOR SUBROUTINES", Ed Logg, DATE INITIATED 6-JUNE-79) defines all 37 VGMSGA entries (CHAR.A-CHAR.Z, CHAR.0-CHAR.9 with CHAR.0=CHAR.O, and CHAR. for space) plus the VGMSGA jump table itself (ANVGAN.MAC:316, .GLOBL'd at :315). None of that is inside a false conditional the way ALVROM's dead ENEMY PICTURES block is (SPACG=0 gate, ALVROM.MAC:14/1360): ALVROM.MAC unconditionally sets .SIZE=2/.BRITE=6/.ASECT/.RADIX 16/.=3000 (ALVROM.MAC:20-25) and then unconditionally pulls ANVGAN's text in with `.INCLUDE ANVGAN` at line 26 - no .IF, no SPACG. The result genuinely links: ALEXEC.MAP's Global Symbol Summary resolves VGMSGA=31E4 and HALF=325C, both inside the ABS,OVR low bank (0000-A8B0) that every linked module (including ALVROM) shares - proof the alphabet is real, shipped ROM content, not orphaned source. The audit's citable-module allowlist previously excluded ANVGAN.MAC by name on the mistaken premise that it is not its own linked OBJ in ALEXEC.MAP's link string, only textually absorbed into ALVROM's; that exclusion has since been corrected on exactly the .INCLUDE-ships-as-source reasoning laid out above, and ANVGAN.MAC, ASCVG.MAC, VGMC.MAC and COIN65.MAC are now accepted citable modules. Every letter/digit finding below now cites the real CHAR.x line in ANVGAN.MAC directly, rather than anchoring to this .INCLUDE line as a proxy.

#### Confirmed matches

**F-002 — Letters A-Z: all 26 match the ROM vector-for-vector, delta-for-delta, in the same stroke order**

- **CONFIRMED**
- Source: `ANVGAN.MAC:35` — `CHAR.A:	VCTR 0,16,.BRITE`
- Ours: `src/shell/font.ts:14` — `export * from '@arcade/shared/font'`
- **Claim:** Every one of CHAR.A through CHAR.Z in ANVGAN.MAC (lines 35-239, cited here at CHAR.A's own first line as the representative anchor for the full group) has the identical (dx,dy,intensity) sequence, in the identical order and count, as the `ROM` table entries in @arcade/shared/font (dist/font.js:32-58) that this module re-exports. Spot examples: A = (0,16,B)(8,8,B)(8,-8,B)(0,-16,B)(-16,8,0)(16,0,B)(8,-8,0) vs ours `A: [[0,16,1],[8,8,1],[8,-8,1],[0,-16,1],[-16,8,0],[16,0,1],[8,-8,0]]`; R = (0,24,B)(16,0,B)(0,-12,B)(-16,0,B)(4,0,0)(12,-12,B)(8,0,0) vs ours identical; Q, the most complex letter at 8 vectors, = (0,24,B)(16,0,B)(0,-16,B)(-8,-8,B)(-8,0,B)(8,8,0)(8,-8,B)(8,0,0) vs ours identical. This holds for all 26: A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z - every vertex, every blank-vs-lit flag, every trailing advance. (One letter, B, has a narrower intensity nuance covered separately in F-003; its geometry is still exact.)

**F-004 — Digits 0-9 match the ROM vector-for-vector, including the 0=O alias**

- **CONFIRMED**
- Source: `ANVGAN.MAC:244` — `CHAR.0	=CHAR.O`
- Ours: `src/shell/font.ts:14` — `export * from '@arcade/shared/font'`
- **Claim:** ANVGAN.MAC:244 aliases the digit zero directly to the letter O (`CHAR.0 = CHAR.O`, no separate routine), and CHAR.1 through CHAR.9 (ANVGAN.MAC:246-313) each match our `ROM` table digit-for-digit: e.g. '2' = (0,24,0)(16,0,B)(0,-12,B)(-16,0,B)(0,-12,B)(16,0,B)(8,0,0) vs ours `'2': [[0,24,0],[16,0,1],[0,-12,1],[-16,0,1],[0,-12,1],[16,0,1],[8,0,0]]`; '6' = (0,12,0)(16,0,B)(0,-12,B)(-16,0,B)(0,24,B)(24,-24,0) vs ours identical; '9' = (16,0,0)(0,24,B)(-16,0,B)(0,-12,B)(16,0,B)(8,-12,0) vs ours identical. Our code reproduces the alias behaviour too, not just the coincidental shape match: `GLYPHS['0'] = GLYPHS.O` (dist/font.js:113) mirrors `CHAR.0 = CHAR.O` exactly, rather than independently drawing a zero.

**F-005 — Space (CHAR.) and DASH ('-') - the two message glyphs whose own source text lives directly in the shipped modules - match exactly**

- **CONFIRMED**
- Source: `ALVROM.MAC:33` — `DASH:	VCTR 0,12,0`
- Ours: `src/shell/font.ts:14` — `export * from '@arcade/shared/font'`
- **Claim:** Space is CHAR.: a single blank move, `VCTR 24,0,0` (ANVGAN.MAC:241), i.e. no ink at all, just a 24-unit advance; ours is `' ': [[24, 0, 0]]` (dist/font.js:30) - identical. DASH, which (unlike the alphabet) is written directly in ALVROM.MAC itself and needs no ANVGAN reference at all, is the cited 3-op chain: blank `VCTR 0,12,0`, lit `VCTR 16,0,.BRITE`, blank `VCTR 8,-12,0`, RTSL (ALVROM.MAC:33-36) - a mid-height horizontal bar. Ours: `'-': [[0, 12, 0], [16, 0, 1], [8, -12, 0]]` (dist/font.js:31) - the same three ops, same order, same blank/lit/blank pattern.

**F-006 — Cell geometry - 16 wide x 24 tall, baseline at y=0, +y up, 24-unit standard advance - matches across every glyph**

- **CONFIRMED**
- Source: `ANVGAN.MAC:150` — `CHAR.O:	VCTR 0,24,.BRITE`
- Ours: `src/shell/font.ts:14` — `export * from '@arcade/shared/font'`
- **Claim:** ALVROM.MAC sets `.SIZE=2` and `.BRITE=6` (lines 21-22) immediately before including the alphanumerics; summing the vector chains ANVGAN.MAC actually contains under that setting shows every letter/digit's ink stays within x in [0,16] and y in [0,24] (e.g. O = 0,24 / 16,0 / 0,-24 / -16,0 - a 16x24 box, cited here as the cleanest single-glyph example of the envelope; H's crossbar reaches x=16 at half-height; X's diagonals run the full 16x24 span). The near-universal trailing blank move nets +24 in x (the 16-unit glyph plus an 8-unit gap) and resets y to the baseline - e.g. O's `VCTR 24,0,0`, B's `VCTR 24,0,0`, most letters' final `8,0,0`/`24,0,0` moves. Our code hard-codes exactly this: `export const CELL_W = 16` and `export const CELL_H = 24` (dist/font.d.ts:1-2), and `layoutText`'s cursor advance is each glyph's own trailing x total (dist/font.js:145), reproducing the ROM's per-glyph kerning instead of a fixed pitch.

**F-009 — Neither the ROM nor ours has lowercase - both alphabets are caps-only**

- **CONFIRMED**
- Source: `ANVGAN.MAC:316` — `VGMSGA:	JSRL	CHAR.		;ADDRESS OF LETTER ROUTINES`
- Ours: `src/shell/font.ts:14` — `export * from '@arcade/shared/font'`
- **Claim:** The module ALVROM.MAC includes at this section (ANVGAN.MAC) defines exactly 37 VGMSGA table entries - space, '0'-'9', 'A'-'Z' - and not one additional CHAR.a-CHAR.z routine for lowercase; the VGMSGA JSRL table (ANVGAN.MAC:316-352, cited here at its head) lists CHAR. then CHAR.0-CHAR.9 then CHAR.A-CHAR.Z and stops. Our `GLYPH_CHARS` (dist/font.js:118) contains no lowercase letters either, and `vecText` in render.ts explicitly uppercases all dynamic text before layout - `layoutText(text.toUpperCase())` (src/shell/render.ts:566) - so no lowercase character can reach the glyph table even as an unsupported-character blank.

**F-010 — The stroke-encoding model (blank move = pen-up / new stroke, lit move = pen-down / extend, trailing blank = advance) is faithfully reproduced**

- **CONFIRMED**
- Source: `ANVGAN.MAC:74` — `CHAR.E:	VCTR 0,24,.BRITE`
- Ours: `src/shell/font.ts:14` — `export * from '@arcade/shared/font'`
- **Claim:** Every glyph routine in the alphabet follows the same three-state pattern, visible clearly in CHAR.E (ANVGAN.MAC:74-81, cited here as a representative multi-stroke example: two consecutive lit draws - up 24 then right 16 - forming one continuous open stroke, a blank move of (-4,-12) that closes it and repositions the beam, a lit draw of (-12,0) forming a second, separate stroke, a second blank move of (0,-12) that closes that stroke and repositions again, a third lit draw of (16,0) forming a third separate stroke, and a final blank move of (8,0) that is pure advance, never ink): a `VCTR dx,dy,0` lifts the beam and, if a stroke was open, closes it (starting a fresh one only when a further lit vector follows); a `VCTR dx,dy,.BRITE` draws and extends the current open stroke; the final blank move of a routine is never ink, only the advance. Our `build()` accumulator (dist/font.js:84-107) implements exactly this state machine: on `lit` it either opens a new points array (`cur === null`) or pushes onto the current one; on a non-lit vector it closes and pushes the finished stroke (`else if (cur !== null)`); the function returns `{ strokes, advance: x }` where `x` is the running total after the last vector - i.e. the trailing blank's endpoint - matching the ROM's use of the final blank as the next glyph's origin.

### 6.12 The two findings the refuters killed

Both are instructive rather than embarrassing, and they share a signature: **an operand the
auditor never decoded.** Both auditors read a table, inferred what it must mean from the labels
and the ordering, and wrote a citation-perfect finding about a thing that is not there. The
refuters killed them by opening the *body* the table pointed at.

**DA-008 — "Fuseball kills get their own 3-stage explosion sequence" · verdict REFUTED · `wont_fix`**

- Source: `ALDISP.MAC:979` — `	.BYTE PTFUSX+4		;BUSE EXPL 1`
- Ours: `src/shell/fx.ts:185`
- **What was claimed:** `TEXTYP`, the bang-type table, reserves three consecutive entries labelled
  "FUSE EXPL 1/2/3" pointing into the `PTFUSX` picture table — a dedicated explosion sequence used
  only when a fuseball dies, distinct from the generic `EXPL1-4` burst. Our `fx.ts` calls
  `spawnEnemyBurst` for every enemy kind, so the fuseball's own death animation is missing.
- **Why it is wrong:** the refuter followed `PTFUSX` into `ALVROM.MAC:1096-1114` and decoded the
  picture bodies, which the auditor never did. `FUSEX1` is `JSRL CHAR.7` then `JMPL FIFTY`
  (`CHAR.5`, `CHAR.0`). `FUSEX2` is `CHAR.5`, `CHAR.0`, `CHAR.0`. `FUSEX3` is `CHAR.2`, `CHAR.5`,
  `CHAR.0`. They are **digit glyphs**. `FUSEX1/2/3` literally spell out **750 / 500 / 250** — they
  are the fuseball's floating point-value pop-ups, not an explosion at all. There is no
  fuseball-specific explosion sequence to be missing.
- **The residue is real, though:** the pop-ups themselves *are* missing, and that is filed
  correctly and separately as **V-022** (NO_COUNTERPART, `fix`, s). The ROM tells you what a kill
  was worth, at the kill. We do not.

**DA-011 — "Player-death splat radius curve is inverted" · verdict REFUTED · `wont_fix`**

- Source: `ALVROM.MAC:803` — `SPLAT6:	SCAL 2,40`
- Ours: `src/shell/fx.ts:236`
- **What was claimed:** `TSPTIM`'s picture order plays `SPLAT6` first, steps down to `SPLAT1` at
  the sequence's middle, then climbs back to `SPLAT6`. Reading `SPLAT6` as the *largest* picture
  and `SPLAT1` as the *smallest*, the auditor concluded the authentic splat starts at peak size,
  implodes to a point, and re-expands — the opposite of our `sin(progress * π)` arc, which starts
  at 0, peaks in the middle, and returns to 0.
- **Why it is wrong:** the refuter decoded the `SCAL` macro, which the auditor assumed. `VGMC.MAC`
  lines 66–76: *"THE FIRST PARAMETER IS THE POWER OF 2 SCALE. A VALUE OF 0 MEANS FULL SIZE, 1=1/2
  SIZE, 2=1/4, …"* — **the exponent is inverted.** `SPLAT1` (`SCAL 0,0`) is therefore the
  **largest** picture and `SPLAT6` (`SCAL 2,40`) the **smallest**. The ROM's own `PITAB` comments
  say so out loud: `PITAB SPLAT6,PTSPLA ;SMALL SPLAT`. The authentic sequence starts small, grows,
  and shrinks — the same arc as ours. The finding was exactly backwards.
- **The residue, and it is small:** the ROM's splat bottoms out at quarter-size-and-then-some
  rather than at zero, while ours goes fully to 0 at both ends. That is a different and much
  smaller claim than the one that was filed, and nobody has filed it.

**The lesson generalises.** In this source, a label is a hypothesis and a macro is a trap. `SCAL`
inverts its exponent; `SCDOT` is a move plus a zero-length vector; `<...>` is a grouping operator,
not a byte select; the `VEC` macro's third argument is a beam-on flag whose *absence* means lit.
Decode the operand or do not cite the line.

---

## 7. What the book got wrong

Nine constants entered our code from the secondary source and are wrong. This is the section with
teeth.

| Constant | What we shipped | What the primary source says | Where it entered |
|---|---|---|---|
| `ZAP_WINDOW_FIRST` | **13** frames | **19** frames. `TIMAX` is not a literal byte list, it is a computed expression: `TIMAX[1] = CSUSTA + <8*<CSUINT+1>>` = 3 + 16 (`ALWELG.MAC:3539`, `CSUSTA=3`/`CSUINT=1` at 3490-3492) | `rules.ts:35`. The book reproduced the table's *shape* as literal bytes "00,13,05" — it transcribed the assembler's source expression as if it were the assembled data (B-001) |
| Superzapper kill cadence | one kill **every** active frame (≈13–19 kills) | one kill every **other** frame from frame 4 — `SUZTIM >= CSUSTA` **and** `SUZTIM AND CSUINT == 0` — **8 kills, maximum** (`ALWELG.MAC:3542-3546`; the `8*` in `TIMAX` is literally sizing it) | `sim.ts:473-480`. The book *named* `CSUSTA` and `CSUINT` and even quotes "net 7 kills first press"; we shipped the constants and not the gate (B-019, W-043, S-012) |
| `SCORE_SPIKE_SEGMENT` | **3** points | **1** point. `LDA I,1` / `STA TEMP0` → `JSR UPSCORE`, comment: *"ADD 1 TO SCORE FOR EACH HIT"* (`ALWELG.MAC:2609-2615`) | `rules.ts:27`, whose own comment reads `// arcade: 1–3` — an unresolved uncertainty that shipped as a guess (B-016) |
| Fuseball score tier | **depth-based**: `floor(depth * 3)` | **random**, and heavily weighted: `RANDO2 AND 7`; a roll ≥ 3 forces tier 0. P(250) = 75%, P(500) = 12.5%, P(750) = 12.5%, entirely independent of where the fuseball died (`ALWELG.MAC:2754-2759`) | `rules.ts:201`. The point *values* (250/500/750) are right; the selection mechanism is invented (B-015) |
| `WARP_AVOID_SPIKES_SECONDS` | **0.5 s** | **30 frames = 1.055 s** (`LDA I,6*QUASEC ;WARNING DELAY`, `ALWELG.MAC:3164`) | `rules.ts:57`. The frame count 30 is right; 0.5 is 30 ÷ 60. Not a mis-transcription — a mis-conversion (WD-009) |
| `DEMO_FIRE_LANES` | `<= 2` | `< 2`. `CMP I,2` / `IFCC` fires only for a lane delta of 0 or 1 (`ALWELG.MAC:2648-2649`) | `sim.ts:680`. **The book was right** here — its prose says "\|lane − CURSL1\| < 2". We implemented it wrong anyway (B-009) |
| `player_fire.wav` | ROM `$cc5d`, identified **by ear** | those exact bytes are ALSOUN's `EX2F`/`EX2A` — **`;ENEMY EXPLOSION`** (`ALSOUN.MAC:181`), dispatched only from `EXSNON`, never from `SLAUNC` | `tools/pokey-bake/sfx-data.mjs:34`. Story 6-6 locked the address in before ALSOUN's own table was available to cross-check (S-008) |
| `enemy_explosion.wav` | ROM `$cc81`, identified **by ear** | those exact bytes are ALSOUN's `T36F`/`T36A` — **`;THRUST SOUND IN SPACE`** (`ALSOUN.MAC:193`), fired when the Claw passes the bottom of the well (S-009) | `tools/pokey-bake/sfx-data.mjs:55` |
| `LOGO_PASSES` | **19** | **No such constant exists.** See below. | `titleLogo.ts:23` (B-021) |

### `LOGO_PASSES = 19` is the purest case

There is no "draw the title N times" constant anywhere in the ROM. The rainbow logo animation is
`SCARNG` (`ALSCOR.MAC:1341-1387`), which loops from `NEARY` to `FARY` in steps of 2 — and `NEARY`
and `FARY` are **RAM pointers that converge frame by frame**, reseeded and advanced by `BOXPRO`
and `LOGPRO`. The number of passes changes every frame. It is a runtime distance between two
moving values, and it is never a constant.

The literal `19` the book appears to have read is at `ALSCOR.MAC:1281`:

```
	LDA I,19			;STARTING  CLOSE
	STA FARY
```

Three things are wrong with taking that number:

1. It is a **Y-depth seed**, not a pass count — it initialises `FARY`, one end of the convergence.
2. It belongs to a **different animation phase**: `LOGINI`/`BOXPRO` drive the *shrinking-box*
   rainbow (`VORBOX`). The approaching TEMPEST word — the thing `LOGO_PASSES` actually models — is
   `LOGPRO`/`VORLIT`, a separate sub-animation.
3. **It is hex.** `.RADIX 16` is in force (trap (d), §2). The literal is `0x19` = **25**.

So: the right number is not 19, it is not 25, and it is not a number. This is what a secondary
source costs you.

### One more document is wrong the same way

**`docs/ux/2026-06-27-enemy-roster-rom-extract.md` is also wrong, and our code cites it as
authority.** Finding **W-035** proves it: the ROM's per-wave min/max tables put the first **tanker
on wave 3** (`WTANMX: .BYTE TZ,1,5,0,0,1,0,1` — `ALWELG.MAC:651`, and `WTANMI` *requires* it) and
the first **spiker on wave 4** (`WSPIMX`, `ALWELG.MAC:628`; `WSPIMI` requires it). Our
`rules.ts:250-251` gates both at `level >= 5`, citing that document. The tables are also
non-monotonic in a way our weight model cannot express at all — tankers vanish again on wave 4,
and spikers disappear entirely on waves 17–19, 33–34 and 40–42.

That document has been given a caution banner. It needs the same treatment this document gives the
book: a line-by-line re-check against the primary source, or retirement.

---

## 8. Limitations — what this audit did *not* check

Scrupulously:

- **`ALEARO.MAC` (EAROM high-score persistence) has zero citations.** It was in scope for pair 6
  and produced nothing. It is untouched. Any claim about how the original persists high scores,
  ranks, or operator settings is unsupported by this audit.
- **Bonus-score determination is unaudited.** `BONSCO` is only `.GLOBL`'d in `ALSCOR.MAC`
  (SC-010); the routine that decides what an end-of-wave bonus is *worth* was never opened. We
  know the chime fires (S-015) and that the wave carries a BONUS flag; we do not know the formula.
- **`FUSEBALL_MOVE_PROB` and `RESPAWN_LANE` are unverified.** No finding cites either. They may be
  right; nobody looked.
- **The rebased numbers carry ±4%.** 256/9 = 28.44 fps is the ROM's *own* model, derived from its
  treatment of a byte wrap as one second. The real divider chain is 3 kHz-derived
  (`M3KHTI = 80 ;3 KHZ TIMER`, `ALCOMN.MAC:251`), which lands nearer 250/9 = 27.8 fps. More
  importantly, **the true frame rate is a ceiling that degrades under load** (FR-003): `MAINLN`'s
  spin is a *minimum* frame period, `DISPLA` runs inline, and a busy vector list makes the loop
  iteration itself longer than nine ticks. The arcade genuinely slows down when the screen is
  busy — that is the classic vector-arcade behaviour, and the only upper bound is the watchdog at
  128 ticks (~2 fps). We recommend adopting the ceiling as a fixed base and **not** reproducing
  the slowdown; but "28.44 fps" should be read as "the rate the cabinet hits when it is not
  overloaded", not as a clock.
- **Findings SC-001, SC-004 and SC-009 cite `node_modules/@arcade/shared`** — a **gitignored build
  artifact of another repository**. SC-001 (the ROM keeps 8 high scores; the shared module keeps 10
  and its comment calls 10 "the classic 10-deep arcade ladder") is a real divergence with a real
  citation, but **its fix cannot live in a tempest epic**: `MAX_HIGH_SCORES` is consumed by
  tempest, star-wars, asteroids and battlezone, and changing it means judging each game's own
  original board depth. The line numbers in those three citations will rot on the next
  shared-library bump.
- **The refuters attacked DIVERGENCE and BOOK_WAS_WRONG only.** The 74 CONFIRMED matches, the 25
  NO_COUNTERPARTs and the 21 STRUCTURALs were never adversarially challenged. §3 exists because we
  found three false CONFIRMEDs *by accident*, while adjudicating something else. There may be
  more.

---

## 9. Ruling sheet

114 findings recommend `fix`. At s=1 / m=3 / l=5 that is **230 points** — which is not a sprint
epic, it is a quarter. Much of it is **the same change filed many times**: the frame-rate error
alone generated 19 separate findings.

Below, those 114 findings are merged into **15 clusters**. Every fix-recommended finding appears
in exactly one cluster. Sizes are honest re-estimates of the *merged* work, not sums of the parts.

**Total after merging: ~108 points.** That is still large — roughly three sprints. The honest read
is that this is a programme, not an epic, and it should be scoped **by cluster**, not by finding.

### The clusters

| # | Cluster | Subsumes | Size | Depends on |
|---|---|---|---:|---|
| C1 | **THE REBASE** | FR-001, FR-004, FR-006…FR-015, FR-017, WD-008, WD-009, W-028, W-045, B-005, DA-010 (19) | **8** | — (**blocks every numeric fix**) |
| C2 | **THE CAM** (+ the pulsar) | W-005, W-006, W-007, W-008, W-009, W-023, W-025, W-026, W-027, W-032 (10) | **14** | — |
| C3 | **NYMPHS + THE 7-CAP** | W-002, W-003, W-004, W-024, W-029, DA-012, DA-017 (7) | **10** | — |
| C4 | **THE SKILL CONTOUR** | W-011, W-012, W-014, W-019, W-020, W-033, W-034, W-035, W-037, DA-002 (10) | **13** | C1, C3 |
| C5 | **THE CAMERA** | DB-006, DB-007, DB-008, DB-009, DB-016 (5) | **6** | — |
| C6 | **THE WARP DIVE** | WD-010, WD-012, WD-013, WD-014, WD-015, WD-017, WD-018 (7) | **8** | C1, C5 |
| C7 | **THE PALETTE** | V-011, V-012, V-019, DA-005, DB-010, DB-017 (6) | **6** | — |
| C8 | ★ **THE AUDIO CROSS-WIRING** | S-008, S-009, S-010 (3) | **4** | — |
| C9 | **AUDIO WIRING GAPS** | S-011, S-013, S-014, S-015 (4) | **4** | C8 |
| C10 | **THE SUPERZAPPER** | W-042, W-043, B-001, B-019, S-012 (5) | **3** | C1 |
| C11 | **THE SPIKE MODEL** | W-039, W-040, W-047, B-016, V-020, DB-014 (6) | **5** | — |
| C12 | **FIRE & COLLISION GEOMETRY** | W-001, W-021, W-022, W-030, W-046 (5) | **4** | C2 (for W-030's fairness valve) |
| C13 | **SHAPES & SPRITES** | V-005…V-010, V-013…V-017, V-022, DA-004, DA-006, DA-007, DA-009, DA-018, DA-019, DA-020 (19) | **16** | C7 (colours) |
| C14 | **HUD & MESSAGES** | V-018, V-033, V-034, V-035, V-036 (5) | **5** | C7 |
| C15 | **SCORING & MISCELLANY** | B-009, B-015, SC-001 (3) | **2** | — (SC-001 is **blocked**, §8) |
| | | **114 findings** | **~108** | |

### What each cluster actually changes

**C1 — THE REBASE (8) · do this first, before anything else numeric.**
Introduce `ROM_FPS = 256/9`. Rewrite every explicit `* 60` / `/ 60` (`rules.ts:46,52,120,154`,
`sim.ts:113,223`, `flipper.ts:27,39`, `BULLET_SPEED`). Then make the *decision* for the
frame-counted family: either set the sim's fixed timestep to 9/256 s, or convert each ROM frame
count through `ROM_FPS` at its use site (FR-012). Drive the starfield from the sim rather than
from `requestAnimationFrame` (FR-017), and fix `render.ts:905`'s `renderTime += 1/60`. Every
timing test re-baselines. **Nothing else numeric may land before this, or it re-bakes the 60 and
then confirms itself against this document.**

**C2 — THE CAM (14) · a rewrite of `src/core/enemies/`, not a constant tweak.**
Our five per-kind steppers cannot express, at *any* constant setting: "move N frames then flip"
(MOVJMP), "flip continuously while climbing" (SPIRAL), "reverse direction every 2 jumps then every
3" (SPIRCH), "flip only when not standing on a spike" (COWJMP), "flip *away* from the player"
(AVOIDR), or "crouch 4 frames at the rim then jump toward the player at double angular speed"
(TOPPER). Build a small CAM interpreter (20 opcodes) plus the 11 programs, select the flipper's
program per wave from `CAMWAV`, add the CHASER rim state with its pincer rule, and make flip
direction rule-driven rather than a coin flip. The enemy modules do not survive this. Depends on
nothing; blocks C4 and (for fairness) C12's W-030.

**C3 — NYMPHS + THE 7-INVADER CAP (10) · one object, not two changes.**
**The cap is not independently implementable.** The ROM caps live invaders at 7 (`NINVAD=7`,
`WINVMX=6` for every wave 1–99) and regulates spawning by *slot back-pressure*: nymphs simply stop
advancing when the slots are booked. Without a nymph queue there is nowhere to hold the surplus.
Adding the cap alone would just silently drop spawns. This cluster also unblocks the fuseball
turn-back (W-024) and the pulsar yo-yo (W-029), both keyed on `NYMCOU`.

**C4 — THE SKILL CONTOUR (13) · nine findings, one machine.**
Adopt the ROM's per-wave `CONTOUR`/`WTABLE` machinery and stop hand-tuning curves. Eight of the
ten are table transcriptions (enemy count, invader speed, spiker speed, bolt cap, bolt speed,
tanker cargo, intro waves, pre-seeded spikes) and are cheap together — call it 5 points. The tenth,
**W-034 (`NYMCHA`)**, is the expensive half: a per-type min/max population solver that reserves
slots for the cargo of tankers already on the board and biases spikers toward short lanes. It is
the second-largest rewrite in the audit and it needs C3.

**C5 — THE CAMERA (6) · one coherent change to how the rings are built.**
Make `perspectiveDepth()` take the tube (per-well `R = (16+H)/(240+H)`, not a module constant);
build the far ring about the *projected vanishing point* rather than the ring centroid; add the
per-well screen-Z translation and its level-start slide; and make the eye a movable parameter.
Reuse the same hyperbolic law for the starfield. `project`, `boundaryRail`, `laneWidth` and
`flipPivot` all close over the current module constant, so this is an API change.

**C6 — THE WARP DIVE (8).**
Move the camera with the Claw (the Claw's size and screen position must stop changing); add the
second phase where the eye flies *into* the new well; gate the starfield at 29% of the dive; let
the player fire during the dive; make a spike crash **replay the wave**; and start the rumble on
the first descending frame, not at level-clear. Needs C1 (the velocities) and C5 (the movable eye).

**C7 — THE PALETTE (6) · one indirection.**
Replace `enemy → fixed hex` with `enemy → palette slot → per-wave-group `COLTAB` bank`. Six banks,
advancing every 16 waves. This is what makes the arcade's later waves look like different games,
and it brings the **invisible-well waves (65–80)** — one of Tempest's best-known difficulty
spikes, which we simply do not have — for free. Add `blue` to `GlyphColor` while you are there.

**C8 — ★ THE AUDIO CROSS-WIRING (4) · the highest value-to-effort item in the audit.**
Our `player_fire.wav` **is** the ROM's enemy-explosion envelope. Our `enemy_explosion.wav` **is**
its thrust-in-space sound. Every shot the player fires plays an explosion; every enemy that dies
plays an engine. **The correct launch-sound bytes are already in our own bake data** — twelve bytes
sitting at offset 24 of `sfx-data.mjs`'s own `ALSOUN_STREAM` blob (ROM `$cbe9`), which the POKEY
map's authors flagged with a "?" and never resolved. Four points fixes the two most-heard cues in
the game.

**C9 — AUDIO WIRING GAPS (4).** Add the second warp-dive phase (reusing C8's corrected T3 bytes);
fire the special-score chime on the end-of-wave bonus (the sample is already correct); give
bullet-on-bolt collisions their sound and their explosion; drop the invented `kzap.wav`, which has
no basis anywhere in ALSOUN's 13-sound table.

**C10 — THE SUPERZAPPER (3).** Window 13 → 19 frames; kill every *other* frame, not every frame
(8 kills, not 19); kill tankers, stripping their cargo first, rather than skipping them. Note the
refuter's correction to W-042: our **second** zap press is already correct — only the sustained
first-press cadence spares tankers.

**C11 — THE SPIKE MODEL (5).** Spikes reach 0.929, not 0.75. A bottomed-out spiker hops to the
**neediest** lane (shortest or empty), not the tallest — our polarity is inverted, which is why our
boards pile every spike on one lane and the arcade's spread them across the well. A charge burrows
into a spike, cutting it to the bullet's own position over two hit-frames, scoring **1** point per
frame. **Caveat:** the refuter notes that `SPIKE_MAX_DEPTH = 0.75` was a *conscious* deviation
(story 6-15, documented at `rules.ts:110-115`) — so W-039 is a **ruling**, not a bug fix.

**C12 — FIRE & COLLISION GEOMETRY (4).** Reorder the tick (move all charges after invaders; fire
enemy charges after moving them). Remove the invented far-end fire floor (`ENEMY_FIRE_MIN_DEPTH`
silences every fresh spawn for 19% of its climb; the ROM has no such rule). **Invert the fuseball's
vulnerability** — the arcade's fuseball is killable *only while rolling between lanes* and is
bulletproof on a lane and at the rim; ours is the exact opposite. Halve the hit tolerance
(`ENSIZE` is 7 units for a flipper and 6 for a fuseball; ours are ~1.9× and ~3.3× too generous) and
derive it from closing speed rather than hard-coding it.

**C13 — SHAPES & SPRITES (16).** The long tail: the tanker's 17-vertex laced double diamond, the
spiker's 21-point green spiral, the fuseball's 5-colour scribble, the player charge's 17 dots in
two rings, the splat's 26-vertex tricolour outline, the 22-dot star pictures, the claw lives icon,
the TEMPEST logo's own stair-stepped alphabet, the shattered-spike sparkle, the score pop-ups.
Every item is independently landable; none blocks anything.

**C14 — HUD & MESSAGES (5).** Fixed field colours (green score, yellow lives, green hi-score, blue
level); drop the three invented captions; restore the ROM's actual strings ("ENTER YOUR INITIALS",
"RANKING FROM 1 TO *n*", "SPIN KNOB TO CHANGE").

**C15 — SCORING & MISCELLANY (2).** Fuseball score tier is a weighted random roll, not a depth
band. `DEMO_FIRE_LANES` is `< 2`, not `<= 2`. **SC-001 (8 vs 10 high scores) cannot land here** —
it lives in `@arcade/shared` and has a four-game blast radius (§8).

### Suggested order

1. **C1 — THE REBASE.** Alone, first. Everything numeric is downstream.
2. **C8 — THE AUDIO CROSS-WIRING**, in parallel. It depends on nothing and it is four points for
   the two most-heard sounds in the game.
3. **C2 (the CAM)** and **C3 (nymphs)** — independent of each other and of the rebase, and both
   are prerequisites for the difficulty work. Do them before C4.
4. **C4 — THE SKILL CONTOUR.** Needs C1 and C3.
5. **C5 (the camera) → C6 (the warp).** C6 needs C1 and C5.
6. **C7 — THE PALETTE**, before C13 and C14, so the shapes land with the right colours.
7. **C10, C11, C12** — small, mostly independent.
8. **C13, C14, C9, C15** — the long tail.

### The cheap wins — land these today

Carve-outs from the clusters above. Each is a one-line or one-constant change with no dependencies
(except where noted), and together they are the fastest visible fidelity gain available:

- [ ] **The spiker is GREEN, not orange.** `TRACOL=GREEN` (`ALCOMN.MAC:369`). Orange is not in the
      ROM's eight-slot palette *at all*. — `glyphs.ts:120` (V-008, colour half)
- [ ] **The enemy death burst is WHITE, not yellow.** `EXPCOL=WHITE`; all four `EXPL1-4` open
      `CSTAT WHITE`. — `render.ts:460` `ENEMY_BURST_COLOR = '#ffe66b'` (V-012 ≡ DA-005)
- [ ] **`SCORE_SPIKE_SEGMENT` is 1, not 3.** — `rules.ts:27` (B-016)
- [ ] **Burst brightness ramp is off by one frame** — only frame 0 is dim, not frames 0 *and* 1.
      `frame < 2` → `frame < 1`. — `fx.ts:233` (DA-006)
- [ ] **`DEMO_FIRE_LANES` is `< 2`, not `<= 2`.** — `sim.ts:680` (B-009)
- [ ] **The spiker hops to the NEEDIEST lane, not the tallest** — invert one comparison. This one
      changes the shape of every board. — `sim.ts:169` (W-040)
- [ ] **The fuseball's vulnerability is inverted** — killable *only* while rolling between lanes.
      One condition. — `sim.ts:316`, `fuseball.ts:41` (W-022)
- [ ] **Drop the invented pulsar strobe** — the ROM's colour is a clean binary toggle for the whole
      pulse window. — `render.ts:363` (DA-020)
- [ ] **The lives icon is the claw silhouette** (`LIFE1`, 8 vertices), not a hand-drawn chevron.
      New vertex data, but tiny — note it is *not* the same picture as `NCRS1-8`. — `render.ts:538`
      (V-016, and its correction)
- [ ] **`warpAccel` is fed a 1-based level; the ROM feeds 0-based `CURWAV`.** One character.
      **After C1.** — `rules.ts:51` (WD-010)

### Decision column

| Cluster / win | Ruling |
|---|---|
| C1 THE REBASE | fix / accept / won't-fix |
| C2 THE CAM | fix / accept / won't-fix |
| C3 NYMPHS + THE 7-CAP | fix / accept / won't-fix |
| C4 THE SKILL CONTOUR | fix / accept / won't-fix |
| C5 THE CAMERA | fix / accept / won't-fix |
| C6 THE WARP DIVE | fix / accept / won't-fix |
| C7 THE PALETTE | fix / accept / won't-fix |
| C8 THE AUDIO CROSS-WIRING ★ | fix / accept / won't-fix |
| C9 AUDIO WIRING GAPS | fix / accept / won't-fix |
| C10 THE SUPERZAPPER | fix / accept / won't-fix |
| C11 THE SPIKE MODEL | fix / accept / won't-fix |
| C12 FIRE & COLLISION GEOMETRY | fix / accept / won't-fix |
| C13 SHAPES & SPRITES | fix / accept / won't-fix |
| C14 HUD & MESSAGES | fix / accept / won't-fix |
| C15 SCORING & MISCELLANY | fix / accept / won't-fix |
| The cheap wins (10) | fix / accept / won't-fix |

### Duplicates, for the record

These are the same fact filed more than once. They are already merged above; listed so that nobody
double-counts them later:

- **V-012 ≡ DA-005** — enemy burst colour
- **W-004 ≡ DA-017** — the 7-invader cap
- **W-002 ≡ DA-012** — nymphs
- **W-019 ≡ DA-002** — the per-wave enemy-bolt cap
- **W-043 ≡ B-019 ≡ S-012** — the superzapper kill cadence
- **W-045 ≡ B-005 ≡ FR-007** — player charge speed
- **W-028 ≡ FR-009** · **W-020 ≡ FR-010** · **W-014 ≡ FR-013** · **DA-010 ≡ FR-015** ·
  **B-001 ≡ FR-014** · **WD-008 ≡ FR-011** — all the same frame-rate error, filed from six pairs
- **W-044 ≡ DA-001 ≡ B-004** — `MAX_BULLETS = 8` (all three CONFIRMED; we are right three times)
- **DB-015 ≡ B-003** — starfield constants (both CONFIRMED; both withdrew their claim about the
  *cadence*, which is FR-017)
- **V-010 ≡ DA-004** — the player charge's 17 dots
- **V-013 vs DA-009 / DA-010 / DA-011** — the player-death splat, filed four ways: the geometry and
  the spatial colour cycle (V-013, DA-009) are real, the duration (DA-010) is real but a quarter of
  its filed size once rebased, and the radius curve (DA-011) is **refuted**
- **B-016 ⊂ W-047** — the spike score is one clause of the whole spike-burrow mechanic
- **DB-009 ≡ WD-012** — the eye travels down the well
- **V-011 ≈ DA-003 / DA-022** — the ammo tint (thresholds confirmed; the recolour scope and the
  blue-vs-cyan slot are the divergences)
