# Tempest vector font — ROM extract (VGMSGA / ANVGAN alphabet)

Authentic stroke-vector alphabet for the HUD / framing text, lifted **verbatim**
from the original Atari Tempest source. Grounds story **10-13** (replace the TTF
webfont in `src/shell/font.ts` with a true stroke-vector glyph table, styled like
`src/shell/glyphs.ts`).

## Provenance

- **Source of truth:** `ANVGAN.MAC` — *"ANVGAN — ALPHA-NUMERIC VECTOR SUBROUTINES"*,
  programmer **Ed Logg**, date initiated **6-JUNE-79**. The glyph routines are
  `.INCLUDE`d by `ALVROM.MAC` ("ALIENS ROM VG PICTURES, TABLES", Dave Theurer),
  which sets `.BRITE=6` and `.SIZE=2` before the include.
- Obtained from the historicalsource-derived disassembly repo
  [`mwenge/tempest`](https://github.com/mwenge/tempest) (`src/ANVGAN.MAC`,
  `src/ALVROM.MAC`). Cross-checked against the *Tempest vs Tempest* book
  (ch. *macro language fun*), captured in
  [`docs/tempest-1981-source-findings.md`](../tempest-1981-source-findings.md) §4.
- The book transcribed only 4 glyphs (A/T/R/I) and had **one typo**: in `CHAR.T`
  the `-8,0` move is **blank (intensity 0)**, not lit. This doc uses the ROM
  source, which is authoritative.

## The vector model

Each glyph is a chain of `VCTR dx,dy,intensity` ops drawn by the
auto-normalizing Vector Generator, ending in `RTSL` (return from subroutine):

- **Coordinates** are signed cell units. **`+y` is UP** (vector monitor
  convention) — our Canvas is `+y` down, so the renderer must flip `y` (as
  `glyphs.ts` already does for its shapes).
- **Intensity:** `.BRITE` (= **6**, the lit/drawn value) vs **`0`** (a *blank*
  move — reposition the beam without drawing). A few `CHAR.B` strokes use
  `.BRITE-1` (= 5), very slightly dimmer.
- **Cell:** **16 wide × 24 tall**. Glyphs sit on a baseline at `y=0` and rise to
  `y=24`. The **trailing blank move** of each routine advances the beam to the
  next character origin (typically a net **+24 in x**, i.e. the 16-wide glyph +
  an 8-unit gap), and resets `y` to the baseline. Honour these advances for
  authentic inter-character spacing instead of a fixed pitch.
- **Caps-only.** There are no lowercase glyphs (matches `font.ts`). `CHAR.0`
  **aliases `CHAR.O`** (the digit zero is drawn with the letter-O routine).

## VGMSGA table order & ASCVG offsets

`VGMSGA` is the table of `JSRL CHAR.x` calls. `ASCVG` ("ASCii Vector Generator",
Rich Moore) maps a character to a byte offset into it:

- space (`$20`) → `0`
- `A`–`Z` (char > `$40`) → `char − $36`
- digits/punct (char ≤ `$40`) → `char − $2F`
- then `offset *= 2`; the **last char of a string is OR'd with `$80`** to flag end.

Table order (offset ÷2): `.`(space)=`0`, `0`…`9`=`1`…`10`, `A`…`Z`=`11`…`36`.
(So byte offsets ×2: space=`00`, `0`=`02` … `9`=`14`, `A`=`16` … `Z`=`48`.)

## The 37 glyphs (verbatim)

`x,y,i` where `i`=`B` is `.BRITE` (lit), `i`=`0` is a blank move, `i`=`B-1` is
`.BRITE-1` (slightly dimmer). Every routine ends `RTSL`. Last entry of each is the
inter-glyph advance.

### Space & letters

| glyph | VCTR chain (x,y,i) |
|---|---|
| `CHAR.` (space) | `24,0,0` |
| `A` | `0,16,B` · `8,8,B` · `8,-8,B` · `0,-16,B` · `-16,8,0` · `16,0,B` · `8,-8,0` |
| `B` | `0,24,B` · `12,0,B` · `4,-4,B-1` · `0,-4,B-1` · `-4,-4,B-1` · `-12,0,B` · `12,0,0` · `4,-4,B-1` · `0,-4,B-1` · `-4,-4,B-1` · `-12,0,B` · `24,0,0` |
| `C` | `0,24,B` · `16,0,B` · `-16,-24,0` · `16,0,B` · `8,0,0` |
| `D` | `0,24,B` · `8,0,B` · `8,-8,B` · `0,-8,B` · `-8,-8,B` · `-8,0,B` · `24,0,0` |
| `E` | `0,24,B` · `16,0,B` · `-4,-12,0` · `-12,0,B` · `0,-12,0` · `16,0,B` · `8,0,0` |
| `F` | `0,24,B` · `16,0,B` · `-4,-12,0` · `-12,0,B` · `0,-12,0` · `24,0,0` |
| `G` | `0,24,B` · `16,0,B` · `0,-8,B` · `-8,-8,0` · `8,0,B` · `0,-8,B` · `-16,0,B` · `24,0,0` |
| `H` | `0,24,B` · `0,-12,0` · `16,0,B` · `0,12,0` · `0,-24,B` · `8,0,0` |
| `I` | `16,0,B` · `-8,0,0` · `0,24,B` · `8,0,0` · `-16,0,B` · `24,-24,0` |
| `J` | `0,8,0` · `8,-8,B` · `8,0,B` · `0,24,B` · `8,-24,0` |
| `K` | `0,24,B` · `12,0,0` · `-12,-12,B` · `12,-12,B` · `12,0,0` |
| `L` | `0,24,0` · `0,-24,B` · `16,0,B` · `8,0,0` |
| `M` | `0,24,B` · `8,-8,B` · `8,8,B` · `0,-24,B` · `8,0,0` |
| `N` | `0,24,B` · `16,-24,B` · `0,24,B` · `8,-24,0` |
| `O` | `0,24,B` · `16,0,B` · `0,-24,B` · `-16,0,B` · `24,0,0` |
| `P` | `0,24,B` · `16,0,B` · `0,-12,B` · `-16,0,B` · `12,-12,0` · `12,0,0` |
| `Q` | `0,24,B` · `16,0,B` · `0,-16,B` · `-8,-8,B` · `-8,0,B` · `8,8,0` · `8,-8,B` · `8,0,0` |
| `R` | `0,24,B` · `16,0,B` · `0,-12,B` · `-16,0,B` · `4,0,0` · `12,-12,B` · `8,0,0` |
| `S` | `16,0,B` · `0,12,B` · `-16,0,B` · `0,12,B` · `16,0,B` · `8,-24,0` |
| `T` | `8,0,0` · `0,24,B` · `-8,0,0` · `16,0,B` · `8,-24,0` |
| `U` | `0,24,0` · `0,-24,B` · `16,0,B` · `0,24,B` · `8,-24,0` |
| `V` | `0,24,0` · `8,-24,B` · `8,24,B` · `8,-24,0` |
| `W` | `0,24,0` · `0,-24,B` · `8,8,B` · `8,-8,B` · `0,24,B` · `8,-24,0` |
| `X` | `16,24,B` · `-16,0,0` · `16,-24,B` · `8,0,0` |
| `Y` | `8,0,0` · `0,16,B` · `-8,8,B` · `16,0,0` · `-8,-8,B` · `16,-16,0` |
| `Z` | `0,24,0` · `16,0,B` · `-16,-24,B` · `16,0,B` · `8,0,0` |

### Digits

| glyph | VCTR chain (x,y,i) |
|---|---|
| `0` | **= `CHAR.O`** (alias) |
| `1` | `8,0,0` · `0,24,B` · `16,-24,0` |
| `2` | `0,24,0` · `16,0,B` · `0,-12,B` · `-16,0,B` · `0,-12,B` · `16,0,B` · `8,0,0` |
| `3` | `16,0,B` · `0,24,B` · `-16,0,B` · `0,-12,0` · `16,0,B` · `8,-12,0` |
| `4` | `0,24,0` · `0,-12,B` · `16,0,B` · `0,12,0` · `0,-24,B` · `8,0,0` |
| `5` | `16,0,B` · `0,12,B` · `-16,0,B` · `0,12,B` · `16,0,B` · `8,-24,0` |
| `6` | `0,12,0` · `16,0,B` · `0,-12,B` · `-16,0,B` · `0,24,B` · `24,-24,0` |
| `7` | `0,24,0` · `16,0,B` · `0,-24,B` · `8,0,0` |
| `8` | `16,0,B` · `0,24,B` · `-16,0,B` · `0,-24,B` · `0,12,0` · `16,0,B` · `8,-12,0` |
| `9` | `16,0,0` · `0,24,B` · `-16,0,B` · `0,-12,B` · `16,0,B` · `8,-12,0` |

### Special glyphs (defined in `ALVROM.MAC`, not `ANVGAN.MAC`)

| glyph | VCTR chain (x,y,i) | notes |
|---|---|---|
| `DASH` (`-`) | `0,12,0` · `16,0,B` · `8,-12,0` | mid-height horizontal bar; used by `HI-SCORE`, `- NO SCORES YET -` |
| `COPYR` (©) | `0,4,0` · `0,16,B` · `4,4,B` · `8,0,B` · `4,-4,B` · `0,-16,B` · `-4,-4,B` · `-8,0,B` · `-4,4,B` · `12,4,0` · `-8,0,B` · `0,8,B` · `8,0,B` · `12,-16,0` | circle + inner C (attract © line) |
| `HALF` (½) | `16,24,B` · `-14,-10,0` · `SCAL 2` · `JSRL CHAR.1` · `-8,-28,0` · `JSRL CHAR.2` · `SCAL 1` | slash + small 1 & 2 |

## On-screen messages (color / scale / Y)

The `MESS name,COLOR,SCALE,Y` table (book §4) defines every framing string's
color, scale (0 or 1), and Y position. Authentic colors used: GREEN, WHITE, RED,
TURQOI(se), YELLOW, BLULET(blue). The full table is in
[`docs/tempest-1981-source-findings.md`](../tempest-1981-source-findings.md) §4 —
cross-check our HUD/banner strings (`GAME OVER`/green, `PRESS START`/red,
`RATE YOURSELF`/green, `AVOID SPIKES`, `SUPERZAPPER RECHARGE`, …) against it.

ROM palette indices (low nibble of `$680n`): `0`=White, `1`=Yellow, `2`=Magenta/
Purple, `3`=Red, `4`=Cyan/Turquoise, `5`=Green, `7`=Blue.

## Mapping to our code

- Replace the `FontFace`/TTF path in `src/shell/font.ts` with a pure glyph table
  in the `src/shell/glyphs.ts` style: each character → a list of strokes
  (polylines) in a 16×24 cell. Keep it SHELL-only and pure (no DOM/time/random),
  matching the Hard Architectural Boundary and `glyphs.test.ts` rules.
- A blank-move (`i=0`) **starts a new stroke** (pen-up); a lit run (`i=B`) extends
  the current stroke (pen-down). Flip `y` for Canvas. The trailing advance vector
  gives per-glyph kerning.
- `render.ts` `drawGlowText`/`glowText` currently set `ctx.font` to the
  `'Vector Battle'` TTF and call `ctx.fillText`; AC-2 wants all of that text drawn
  through the vector glyph path (no TTF dependency).

---
*Extracted 2026-06-30 from `mwenge/tempest` `src/ANVGAN.MAC` + `src/ALVROM.MAC`
(original Atari source, Ed Logg / Dave Theurer), cross-checked vs Tempest vs
Tempest §4. Companion to the enemy-roster / geometry / POKEY ROM extracts.*
