# Tempest level geometry — authentic ROM survey, gap audit & representation ADR

**Story:** 6-7 — *Survey authentic level geometries from ROM & reconcile our parametric set*
**Author:** Emmanuel Goldstein (Architect) · **Date:** 2026-06-27
**Status:** Survey + audit complete; reconcile (`geometry.ts` + tests) handed to Dev/TEA.

---

## Provenance

Same source as the rest of Wave 6 (see `2026-06-27-tempest-arcade-feel-reference.md`
→ *Provenance*): the reconstructed, labeled **`charlesUnixPro/Tempest-Source-Code`**
(`tempest.a65`, 21,518 lines). The ROM set in `~/Downloads/tempest` is CRC32
byte-identical to the canonical MAME `tempest` rev-3 romset. The `tempest.a65` file is
**not committed** to this repo — re-fetch it from
`raw.githubusercontent.com/charlesUnixPro/Tempest-Source-Code/master/tempest.a65`
(verified 21,518 lines, HTTP 200) when verifying these citations. All `:line` cites below
are against that file. The level-geometry data is **not** version-gated.

---

## 1. How the arcade stores a well (the key structural finding)

A Tempest well is **one ring of 16 (x,y) points** — *not* a separate near/far point set.
Depth is pure perspective scaling of that single ring toward a vanishing point.

The build path is `Lc235` (`:14920`) → `get_tube_no` (`:15051`):

- `get_tube_no` takes the level number, applies `lev_remap` (`:13792`) to pick a **tube
  shape 0–15** (`curtube`), and returns `tube*16 + 15` to index the flat `[16][16]` tables.
- `Lc235` copies the 16 points into RAM: `tube_x[x] = lev_x[tube*16+x]`,
  `tube_y[x] = lev_y[...]`, `segment_angle[x] = lev_angle[...]` (`:14987-15008`), then
  computes **lane centers** as midpoints of consecutive rim points (`mid_x/mid_y`,
  `:15011-15030`) — wrapping for closed wells.
- Per-shape projection params are read here too: `lev_scale` (`:13796`), `lev_y3d`
  (camera height, `:13800`), `lev_y2d` (`:13804`), and `open_level ← lev_open[tube]`
  (`:14945`).

Consequences:

- **Lanes** = segments between consecutive rim points: **16 for closed wells, 15 for open**
  ("open" draws one fewer segment — `:15192-15196`, `lda open_level; … dex`).
- The well's **2-D cross-section shape** is fully described by the 16 `lev_x/lev_y` points.
  near-rim vs far-end is the same ring scaled by perspective (`lev_scale`/`lev_y3d`).

---

## 2. Verbatim ROM tables (`tempest.a65:13734-13821`)

Coordinates are 8-bit, origin `$80`, range ≈ `$10`…`$f0` (signed ±112). **+y is UP**
(Atari vector space — negate y for our canvas, where +y is down).

```
lev_x:  ; x[16][16]   (:13734)  — row = tube shape, col = segment 0..15
 tube0  f0 e7 cf aa 80 56 31 19 10 19 31 56 80 aa cf e7
 tube1  f0 f0 f0 b8 80 48 10 10 10 10 10 48 80 b8 f0 f0
 tube2  f0 f0 b8 b8 80 48 48 10 10 10 48 48 80 b8 b8 f0
 tube3  ec d5 b1 90 70 4f 2b 14 14 2b 4f 70 90 b1 d5 ec
 tube4  f0 c0 a0 94 6c 60 40 10 10 40 60 6c 94 a0 c0 f0
 tube5  d9 c2 ac 97 80 69 52 3c 27 10 35 5a 80 a6 ca f0
 tube6  ea e0 9c 80 64 20 16 50 16 20 64 80 9c e0 ea b0
 tube7  10 1e 2c 3a 48 56 64 70 90 9e ac ba c8 d6 e4 f0
 tube8  10 1e 2d 3c 4b 5a 69 78 87 96 a5 b4 c3 d2 e1 f0
 tube9  10 10 10 10 16 29 46 69 97 ba d7 ea f0 f0 f0 f0
 tube10 10 24 30 36 3e 49 5a 75 94 a4 ac ba da e2 ea f0
 tube11 80 70 48 20 10 20 48 70 80 90 b8 e0 f0 e0 b8 90
 tube12 da a4 87 80 79 5c 26 10 10 20 48 80 b8 e0 f0 f0
 tube13 10 10 30 30 50 50 70 70 90 90 b0 b0 d0 d0 f0 f0
 tube14 b0 80 50 47 18 30 18 47 50 80 b0 b9 e8 d4 e8 b9
 tube15 10 1e 21 28 3c 55 66 73 8d 9a ab c4 d8 df e2 f0

lev_y:  ; y[16][16]   (:13754)
 tube0  80 aa cf e7 f0 e7 cf aa 80 56 31 19 10 19 31 56
 tube1  80 b8 f0 f0 f0 f0 f0 b8 80 48 10 10 10 10 10 48
 tube2  80 b8 b8 f0 f0 f0 b8 b8 80 48 48 10 10 10 48 48
 tube3  94 b0 b8 a7 a7 b8 b0 94 6c 50 48 59 59 48 50 6c
 tube4  96 a3 c5 f0 f0 c5 a3 96 6a 5d 3b 10 10 3b 5d 6a
 tube5  3d 6a 97 c4 f0 c4 97 6a 3d 10 10 10 10 10 10 10
 tube6  a0 e0 ea b0 ea e0 a0 80 60 20 16 50 16 20 60 80
 tube7  f0 d0 b0 90 70 50 30 10 10 30 50 70 90 b0 d0 f0
 tube8  40 40 40 40 40 40 40 40 40 40 40 40 40 40 40 40
 tube9  f0 cb a6 80 5c 39 20 12 12 20 39 5c 80 a6 cb f0
 tube10 c0 a6 8a 6a 4a 2f 14 24 20 39 59 75 72 90 b0 d0
 tube11 80 57 48 57 80 a9 ba a9 80 57 48 57 80 a9 ba a9
 tube12 e4 e8 b7 80 b7 e8 e4 b2 7a 47 20 10 20 47 7a b2
 tube13 90 70 70 50 50 30 30 10 10 30 30 50 50 70 70 90
 tube14 e6 d0 e6 b9 ae 80 52 47 14 30 14 47 52 80 ae b9
 tube15 7e 6a 51 3a 2c 2c 38 4e 4e 38 2c 2c 3a 51 6a 7e
```

```
lev_remap: ; remap[16]   (:13792)   level(mod16) -> tube shape
  00 01 02 03 04 05 06 07 0d 09 08 0c 0e 0f 0a 0b

lev_open:  ; open[16]     (:13812)   per TUBE: $00 closed, $ff open
  00 00 00 00 00 00 00 ff ff ff ff 00 00 ff 00 ff

lev_scale: ; scale[16]    (:13796)   18 1c 18 0f 18 18 18 18 0a 18 10 0f 18 0c 14 0a
lev_y3d:   ; y3d[16]      (:13800)   50 50 50 68 50 50 68 b0 a0 50 90 80 20 b0 60 a0
```

`lev_angle[16][16]` (`:13772`) gives a per-segment angle (lane orientation; used for
flip/enemy drawing) — available if per-lane orientation is ever needed for animation on
irregular wells. Not required to reproduce the shapes.

---

## 3. Per-level shape catalog (the survey)

Decoded directly from the tables above (`scratchpad/decode2.py` + `plot.py`). `o` = rim
point, `*` = a point exactly at the origin (the figure-8 crossing / heart dimple).
**Level cycle** repeats every 16; level 99 picks a random tube (`get_tube_no :15064-69`).

| Lvl | tube | topology | lanes | shape |
|----:|-----:|----------|------:|-------|
| 1  | 0  | closed | 16 | **Circle** |
| 2  | 1  | closed | 16 | **Square** (rounded) |
| 3  | 2  | closed | 16 | **Plus / Greek cross** |
| 4  | 3  | closed | 16 | **Horizontal peanut** (pinched top & bottom) |
| 5  | 4  | closed | 16 | **Pinched diamond / spinning-top** |
| 6  | 5  | closed | 16 | **Triangle** (apex up, flat base) |
| 7  | 6  | closed | 16 | **Four-lobe clover/star** (deep central notches) |
| 8  | 7  | open   | 15 | **V funnel** |
| 9  | 13 | open   | 15 | **Step / staircase** |
| 10 | 9  | open   | 15 | **U / bowl** |
| 11 | 8  | open   | 15 | **Flat line** (sheet) |
| 12 | 12 | closed | 16 | **Heart** |
| 13 | 14 | closed | 16 | **Flower / 4-petal star** |
| 14 | 15 | open   | 15 | **W / double-V** |
| 15 | 10 | open   | 15 | **Slanted staircase / spiral** |
| 16 | 11 | closed | 16 | **FIGURE-8** (self-crossing) — *litmus* |

**Authentic topology pattern (L1→L16):** `C C C C C C C O O O O C C O O C` → **10 closed,
6 open**. (Closed L1–7, L12–13, L16; open L8–11, L14–15.)

Renders below are reduced 37×17 grids — faithful enough to recognize each well; the
`lev_x/lev_y` bytes above are ground truth.

```
LEVEL  3  Plus / Greek cross (closed,16)        LEVEL  6  Triangle (closed,16)
        o.......o.......o                                    o
        .               .                                  . .
    o...o               o...o                              o   o
    .                       .                             .     .
    o                       o                            o       o
    .                       .                          o           o
    o...o               o...o                         .             .
        .               .                            o....o....o....o
        o.......o.......o

LEVEL  7  Four-lobe clover/star (closed,16)     LEVEL  8  V funnel (open,15)
      ....o       o....                          o                       o
   o..     .     .     ..o                        o                     o
   .        . . .        .                         o                   o
   o..       o       ..o                            o                 o
      ...   . .   ...                                o               o
   o..       o       ..o                             o             o
   .        . . .        .                            o           o
   o..     .     .     ..o                             o.........o
      ....o       o....

LEVEL 11  Flat line / sheet (open,15)           LEVEL 16  FIGURE-8 (closed,16)  *=origin
                                                   ...o...     ...o...
   o.o.o.o.o.o.o.o.o.o.o.o.o.o.o.o             o..      ..o o..      ..o
                                               .          . .          .
                                              o            *            o
                                               .          . .          .
                                               o..      ..o o..      ..o
                                                  ...o...     ...o...
```

---

## 4. The figure-8 (litmus) in detail — tube 11 / Level 16

`lev_x[11]/lev_y[11]` define a **closed 16-point ring that passes through the origin
twice**: `seg0 = (0,0)` *and* `seg8 = (0,0)`. The ring traces the left loop (seg0→seg8)
then the right loop (seg8→seg0 via seg15), the two meeting at the centre. Signed points:

```
seg 0 ( 0,  0)*  seg 4 (-112, 0)  seg 8 ( 0,  0)*  seg12 (112, 0)
seg 1 (-16,-41)  seg 5 (-96, 41)  seg 9 (16, -41)  seg13 (96, 41)
seg 2 (-56,-56)  seg 6 (-56, 58)  seg10 (56, -56)  seg14 (56, 58)
seg 3 (-96,-41)  seg 7 (-16, 41)  seg11 (96, -41)  seg15 (16, 41)
```

This is the test that our representation must pass.

---

## 5. Gap audit — authentic vs `src/core/geometry.ts`

Our current set (`geometry.ts:119-136`) is **parametric/stylized**: index `i` = level `i+1`.

| Lvl | Ours (geometry.ts) | Authentic | Verdict |
|----:|--------------------|-----------|---------|
| 1  | circle, closed, 16 | circle, closed, 16 | ✅ **match** (coords approximate) |
| 2  | square, closed, 16 | square, closed, 16 | ✅ **match** (coords approximate) |
| 3  | FLAT, **open**, 16 | plus/cross, **closed**, 16 | ❌ topology flip + shape |
| 4  | triangle, closed, **12** | horiz peanut, closed, **16** | ❌ shape + lane count |
| 5  | SHALLOW_V, **open**, **14** | pinched diamond, **closed**, **16** | ❌ topology + shape + lanes |
| 6  | pentagon, closed, **15** | triangle, closed, **16** | ❌ shape + lanes |
| 7  | DEEP_V, **open**, 16 | 4-lobe clover, **closed**, 16 | ❌ topology flip + shape |
| 8  | hexagon, **closed**, **12** | V funnel, **open**, **15** | ❌ topology + shape + lanes |
| 9  | BOWL, open, **16** | step/staircase, open, **15** | ⚠️ topology ok; shape + lanes |
| 10 | octagon, **closed**, **16** | U/bowl, **open**, **15** | ❌ topology + shape + lanes |
| 11 | W, open, **16** | flat line, open, **15** | ⚠️ topology ok; shape + lanes |
| 12 | heptagon, closed, **14** | heart, closed, **16** | ❌ shape + lanes |
| 13 | STEP, **open**, **12** | flower/star, **closed**, **16** | ❌ topology + shape + lanes |
| 14 | small square, **closed**, **12** | W/double-V, **open**, **15** | ❌ topology + shape + lanes |
| 15 | RAMP, open, **16** | slanted spiral, open, **15** | ⚠️ topology ok; shape + lanes |
| 16 | HUMP, **open**, 16 | **FIGURE-8**, **closed**, 16 | ❌ topology + dramatic shape **missing** |

**Summary of gaps:**
- **Shape:** only L1, L2 are faithful. **14/16 wells are the wrong shape.**
- **Topology (open/closed):** **8/16 levels are flipped** (L3,5,7,8,10,13,14,16). Our
  pattern is a polygon/open alternation; the arcade is `CCCCCCC OOOO CC OO C`.
- **Lane count:** authentic is **uniform** — 16 closed / 15 open. Ours is inconsistent
  (12/14/15/16). This shifts player rotation range and enemy spawn lanes per level.
- **Cycle order:** ours implicitly = level index; authentic uses `lev_remap`
  (`[0,1,2,3,4,5,6,7,13,9,8,12,14,15,10,11]`). Our `tubeForLevel` already cycles % 16,
  so only the *table contents/order* change, not the selector.
- **Dramatic wells missing entirely:** figure-8 (L16), clover (L7), heart (L12),
  flower (L13), pinched diamond (L5), horizontal peanut (L4).

---

## 6. ADR — representation for authentic wells (incl. the figure-8)

**Decision: keep the existing `Tube` data model; add ONE data-driven constructor. No new
core type.**

`Tube = { laneCount, closed, far: Point[], near: Point[] }` is already general enough to
hold authentic per-lane coordinates, **including the self-crossing figure-8**.

**Rationale (reuse-first):**
- A self-crossing loop is a property of the *ordered point list in screen space*, not a
  constraint on the arrays. `far[]`/`near[]` are just point arrays; **lanes are indices
  0–15.** The simulation (`stepGame`, movement, collision, spawn) operates on
  **lane index + depth**, never on screen position — so a crossing has **zero** effect on
  the sim. `project()`, `laneCenterFar/Near()`, `wrapLane()`, `currentLane()` all work
  unchanged on a figure-8 ring.
- This directly resolves AC #5's open question. The story says "our primitives … cannot
  represent it, so a new shape representation is likely required." Correct about the
  *constructors* (`makeCircleTube`/`makePolygonTube`/`makeOpenTube` can't express it),
  **wrong about the data model** — the `Tube` arrays can. We add data + one constructor and
  retire the parametric profile zoo.

**Recommended constructor (Dev to implement — pure core):**

```ts
// Builds a Tube from one authentic 16-point ring; far[] is the ring scaled toward the
// vanishing point. closed ⇒ 16 lanes (wrap); open ⇒ 15 lanes (clamp).
function makeRingTube(ring: readonly Point[], closed: boolean): Tube
```

**Coordinate mapping (ROM → our space):**
- ring point: `signed = byte − 0x80` (range ±112), **negate y** (Atari +y up → canvas +y down).
- `near[i] = { x: (lev_x[i]−0x80)·S, y: −(lev_y[i]−0x80)·S }`, with `S ≈ 300/112 ≈ 2.68`
  to keep today's near-rim radius.
- `far[i]  = near[i] · 0.2` toward `GEO_CENTER` (matches the current circle's 60/300 depth
  ratio). Higher fidelity (optional): offset the vanishing point by `lev_y3d` per level.
- `closed = (lev_open[tube] === 0x00)`; `laneCount = closed ? 16 : 15`.
- `GEOMETRIES` order = the 16 tubes selected by `lev_remap` (so L8→tube13, L9→tube8, …).
  `tubeForLevel` already cycles % 16 — keep it.

**Consequences / watch-outs:**
- **Render (shell), not core:** the two figure-8 lanes through the origin overlap at the
  crossing — that's authentic. Verify in the shell that the crossing renders cleanly
  (z-order/overlap) and the player/enemies on those two *distinct* lanes stay readable.
  Pure-core is unaffected; this is a visual-verify item, not a sim change.
- **Open = 15 lanes:** standardize open wells to 15 lanes / closed to 16 to match the
  arcade. Check any code assuming a fixed 16 lanes regardless of topology.
- `lev_y3d` per-level camera height is a **render-fidelity** nicety; a single vanishing
  point is sufficient for the shape work in 6-7.

---

## 7. Scope recommendation for the reconcile (AC #3–#5)

The gap is large (14/16 shapes, 8 topology flips, lane-count normalization, figure-8 new),
**but the reconcile is mechanical** once the data + `makeRingTube` land, because the lane
and projection math is untouched. Recommendation:

- **Keep in 6-7 (pure core + tests):** port the verbatim tables to `geometry.ts`, add
  `makeRingTube`, rebuild `GEOMETRIES` in `lev_remap` order, preserve closed-wrap /
  open-clamp. **Use the figure-8 (L16) as the litmus unit test** — assert it is a closed
  16-lane ring with `seg0 == seg8 == origin` and that `project`/`wrapLane`/lane-centers
  behave for all 16 lanes.
- **Possible single follow-up (shell):** visual verification of self-crossing rendering +
  optional `lev_y3d` per-level vanishing point. Spin only if the visual pass finds issues;
  do not block 6-7's core work on it.

This respects the architecture boundary: 6-7 stays pure-core + deterministic; the only
thing that *might* spill to the shell is render verification of the crossing.

---

## Appendix — repro

Scripts used (throwaway, in the session scratchpad): `decode2.py` (parse + classify +
self-cross detection), `plot.py` (ASCII render). Re-run against a fresh `tempest.a65`
checkout to verify every cite and byte.
