// tests/core/tp1-38.warp-rim-flyoff.test.ts
//
// Story tp1-38 (THE MOVING EYE, part 3) — the FULL RIM-FLY-OFF: during the warp
// DESCENT the near rim sweeps past the advancing eye and off-screen while the
// Claw rides CURSY (WD-012 full fidelity beyond tp1-33's near-ring-fixed model).
//
// Primary source: Theurer's 1981 assembler, ~/Projects/tempest-source-text (the
// LF copy — the CRLF sibling ~/Projects/tempest-source is NOT citable).
// ALCOMN.MAC:17 sets `.RADIX 16`; ALDISP/ALWELG inherit it — bytes below are HEX.
//
// ── THE ROM MECHANISM (byte-verified against the source, not the SM context) ──
//   MOVCUD advances the eye by the SAME velocity as the cursor, every frame
//   ("LDA EYLL ;UPDATE EYE POSITION / CLC / ADC CURSVL", ALWELG.MAC:1049-1057,
//   carry INTO EYH at :1055-1057), and requests a well re-projection whenever the
//   eye moves ("CMP EYL / IFNE ;EYE POSITION CHANGE? / INC ROTDIS", :1058-1061).
//   Projection scales every point by 1/(PY − EY) (CASCAL "INPUT: PYL = OBJECT
//   DEPTH ;EYL,H=EYEPOSITION", ALDISP.MAC:1449, body :1456-1464). The well's rim
//   is FIXED at PY = ILINLIY = 0x10 and its floor at ILINDDY = 0xF0; the eye
//   starts the dive at EY = −H (H = HOLEYL[well], ALDISP.MAC:1385) and covers the
//   full along-span 0xF0−0x10 = 224 with the cursor. So with progress p:
//
//       EY(p) = −H + 224·p
//       rim   scale ∝ 1/(16+H  − 224p)  — EXPANDS, diverges, then BEHIND THE EYE
//       floor scale ∝ 1/(240+H − 224p)  — expands smoothly to the rim's old size
//       Claw (PY=CURSY, advancing with EY): (CURSY − EY) ≡ 16+H — INVARIANT, so
//       the Claw's projected size/position NEVER change (WD-012). It rides the
//       screen spot the rim occupied at p = 0 — no new constant is needed: the
//       Claw's frame is the STATIC tube's rim anchor.
//
//   The rim crosses the eye plane at  p* = (16+H)/224  (0.116..0.196 across the
//   16 wells — EARLY in every dive). Behind the eye the ROM does not draw: ONELN2
//   aborts any line with PY < EYL once the eye is inside the well ("LDA EYH /
//   IFPL ;IF LINE WOULD BE BEHIND EYE / LDA PYL / CMP EYL / IFCC / RTS ;THEN
//   ABORT LINE", ALDISP.MAC:1550-1558). Note the IFPL: while the eye is NEGATIVE
//   (the NEWAV2 fly-in parks it at 0xFA00 = −1536) the cull is DISARMED — nothing
//   can be behind an eye that is behind the whole well. That is why the FLY-IN's
//   transform must stay near-ring-fixed and only the DESCENT gets the fly-off.
//   (Past the bottom the ROM forces CURSY = 0xFF and DSPCUR stops drawing the
//   cursor entirely — "LDA I,0FF / STA CURSY", ALWELG.MAC:1038-1039; DSPCUR's
//   "CMP I,ILINDDY / IFCC ;AT BOTTOM?" gate, ALDISP.MAC:604-608.)
//
// ── THE CONTRACT under test ──
//   A NEW pure core seam for the DESCENT (the shipped near-fixed `warpDiveTube`
//   remains the FLY-IN's transform — see the fly-in guard block):
//
//       warpDescentTube(tube: Tube, progress: number): Tube & { rimBehindEye: boolean }
//
//   • far ring: scaled about the per-well VP by kFar(p) = (240+H)/((240+H)−224p)
//     — the IDENTICAL absolute path the shipped warpDiveTube already traces
//     (algebra: near0 + (far0−near0)·(1−p)/D ≡ VP + (R/D)·(near0−VP), D =
//     1−p(1−R)); tp1-33's far law was already exact, so this seam must reproduce
//     it per-vertex.
//   • near ring (p < p*): scaled about the SAME VP by kNear(p) = (16+H)/((16+H)−224p)
//     — the rim EXPANDS (the SM context's "shrinking screen radius" is REFUTED by
//     the projection law above; deviation logged). Universal shape: kNear(f·p*) =
//     1/(1−f) — 4/3 at f=¼, exactly 2 at f=½, 4 at f=¾.
//   • rimBehindEye: false while the rim is ahead of the eye (p < p*), true once
//     it has crossed (p > p*). AT the crossing the divide is singular — the ROM's
//     equality frame feeds (PY−EY) = 0 into the math box; our port must stay
//     FINITE there (the flag's value at the exact float boundary is not pinned,
//     finiteness is). The shell consults the flag to abort rim/near-dependent
//     draws (ONELN2's cull is the shell's job; the flag is the core's signal).
//   • farRatio of the returned tube: (16+H−224p)/(240+H−224p) while the rim is
//     visible — keeps perspectiveDepth/project/laneWidth exact for interior
//     points (spikes, streaks) under the moving eye.
//   • totality: finite output for progress ∈ [0, 1.1] on every well; input tube
//     never mutated; screenZ / laneCount / closed preserved.
//
// Audit: WD-012 (pair-9-warp-drop-mode.json, CONFIRMED, remediated_by tp1-10 for
// the Claw-fixed half; tp1-33 shipped the far-ring expansion; THIS story ships
// the rim-fly-off half). The fly-in is WD-018 (tp1-37) and is NOT re-modelled.
import { describe, it, expect } from 'vitest'
import { playingState } from './helpers'
import {
  tubeForLevel,
  warpDiveTube,
  warpDescentTube,
  clawTransform,
  type Point,
  type Tube,
} from '../../src/core/geometry'
import { stepGame } from '../../src/core/sim'
import type { GameState } from '../../src/core/state'
import { Input } from '../../src/core/input'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }
const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y)

// The seam under test returns Tube plus the behind-eye flag; read it through a
// narrowing intersection (never `any` — TS lang-review #1/#8).
type FlaggedTube = Tube & { readonly rimBehindEye?: boolean }
const rimFlag = (t: Tube): boolean | undefined => (t as FlaggedTube).rimBehindEye

// H = HOLEYL[wellID] per level (ALDISP.MAC:1385, HEX) — same decode tp1-33
// cross-checked against tp1-9's WELL table + DB-006. All laws below are written
// straight from H as literals, never derived from the code under test (the
// tp1-27 lesson: pin premises to literals, not to the constant being audited).
const WELL: ReadonlyArray<{ level: number; H: number }> = [
  { level: 1, H: 24 }, // circle
  { level: 2, H: 28 }, // square      (H max → latest fly-off, p* = 44/224)
  { level: 4, H: 15 }, // peanut
  { level: 9, H: 12 }, // staircase
  { level: 11, H: 10 }, // flat line  (H min → earliest fly-off, p* = 26/224)
  { level: 13, H: 20 }, // star
  { level: 15, H: 16 }, // jagged
  { level: 16, H: 15 }, // fig-8 (self-crossing ring; on-axis VP)
]

// The ROM dive laws, from H and progress (see header). WARP_ALONG_SPAN = 224.
const kNear = (H: number, p: number): number => (16 + H) / (16 + H - 224 * p)
const kFar = (H: number, p: number): number => (240 + H) / (240 + H - 224 * p)
const pStar = (H: number): number => (16 + H) / 224
const staticR = (H: number): number => (16 + H) / (240 + H)
const romRatio = (H: number, p: number): number => (16 + H - 224 * p) / (240 + H - 224 * p)

// Recover the per-well vanishing point from the BASE tube's own rings using the
// literal R: far0 = VP + R·(near0 − VP) ⇒ VP = (far0 − R·near0)/(1 − R).
// VP.x = 0 on every well (EX is hardcoded to the world centre, ALDISP.MAC:2507).
function recoverVpY(base: Tube, H: number): number {
  const R = staticR(H)
  // Use a vertex with a non-degenerate y (the fig-8's origin vertices give 0/0).
  for (let i = 0; i < base.near.length; i++) {
    const vy = (base.far[i].y - R * base.near[i].y) / (1 - R)
    const check = (base.far[i].x - R * base.near[i].x) / (1 - R)
    if (Math.abs(base.near[i].y - vy) > 1) {
      expect(Math.abs(check)).toBeLessThan(1e-6) // VP.x = 0 cross-check
      return vy
    }
  }
  return 0
}

describe('tp1-38 AC1 — warpDescentTube is the descent seam; progress 0 is the STATIC well (no pop)', () => {
  it('exists as a pure (tube, progress) -> Tube function', () => {
    expect(typeof warpDescentTube).toBe('function')
    expect(warpDescentTube.length).toBe(2)
  })

  it('at progress 0 returns the well unchanged — rings, ratio, translate — with rimBehindEye false', () => {
    for (const w of WELL) {
      const base = tubeForLevel(w.level)
      const d0 = warpDescentTube(base, 0)
      expect(d0.laneCount).toBe(base.laneCount)
      expect(d0.closed).toBe(base.closed)
      expect(d0.farRatio).toBeCloseTo(base.farRatio, 10)
      expect(d0.screenZ).toBeCloseTo(base.screenZ, 10)
      expect(rimFlag(d0)).toBe(false) // explicit boolean, not merely absent (rule #4)
      for (let i = 0; i < base.near.length; i++) {
        expect(dist(d0.near[i], base.near[i])).toBeLessThan(1e-8)
        expect(dist(d0.far[i], base.far[i])).toBeLessThan(1e-8)
      }
    }
  })
})

describe('tp1-38 AC2 — the NEAR RING expands per the ROM law kNear = (16+H)/((16+H)−224p)', () => {
  it('scales every near vertex about the per-well VP by kNear at sampled progress (all wells)', () => {
    for (const w of WELL) {
      const base = tubeForLevel(w.level)
      const vpY = recoverVpY(base, w.H)
      for (const p of [0.05, 0.1]) {
        // 0.1 < p* for every well (min p* = 26/224 ≈ 0.116), so the rim is visible.
        const k = kNear(w.H, p)
        const dive = warpDescentTube(base, p)
        for (let i = 0; i < base.near.length; i++) {
          expect(dive.near[i].x).toBeCloseTo(k * base.near[i].x, 6) // VP.x = 0
          expect(dive.near[i].y - vpY).toBeCloseTo(k * (base.near[i].y - vpY), 6)
        }
      }
    }
  })

  it('the expansion is UNIVERSAL in fractions of p*: kNear(f·p*) = 1/(1−f) — 4/3, 2, 4', () => {
    for (const w of WELL) {
      const base = tubeForLevel(w.level)
      const ps = pStar(w.H)
      for (const [f, expected] of [
        [1 / 4, 4 / 3],
        [1 / 2, 2],
        [3 / 4, 4],
      ] as const) {
        const dive = warpDescentTube(base, f * ps)
        // Near-chord ratio vs the base rim = kNear (uniform scaling preserves chords).
        const i = 0
        const baseChord = dist(base.near[i], base.near[i + 1])
        const diveChord = dist(dive.near[i], dive.near[i + 1])
        expect(diveChord / baseChord).toBeCloseTo(expected, 6)
      }
    }
  })

  it('REFUTES the "rim shrinks" misconception: the rim strictly GROWS, >1 for every p>0', () => {
    // The SM story context claimed the near ring's screen radius "shrinks" as the
    // eye advances. The projection law says the opposite: scale ∝ 1/(16+H−224p)
    // GROWS. Written into the test so nobody regresses to the prose (tp1-27 rule).
    for (const w of WELL) {
      const base = tubeForLevel(w.level)
      const ps = pStar(w.H)
      const baseChord = dist(base.near[0], base.near[1])
      let prev = 1
      for (const f of [1 / 4, 1 / 2, 3 / 4]) {
        const dive = warpDescentTube(base, f * ps)
        const k = dist(dive.near[0], dive.near[1]) / baseChord
        expect(k).toBeGreaterThan(1)
        expect(k).toBeGreaterThan(prev) // strictly growing — never contracting
        prev = k
      }
    }
  })

  it('by p*/2 the rim has (at least) DOUBLED — the sweep off-screen is well underway', () => {
    for (const w of WELL) {
      const base = tubeForLevel(w.level)
      const dive = warpDescentTube(base, pStar(w.H) / 2)
      const k = dist(dive.near[0], dive.near[1]) / dist(base.near[0], base.near[1])
      expect(k).toBeGreaterThanOrEqual(2 - 1e-9)
    }
  })
})

describe('tp1-38 AC3 — the FAR RING keeps the shipped absolute path (tp1-33 far law was already exact)', () => {
  it('far vertices follow kFar·R about the VP — the literal ROM law', () => {
    for (const w of WELL) {
      const base = tubeForLevel(w.level)
      const vpY = recoverVpY(base, w.H)
      const R = staticR(w.H)
      for (const p of [0.25, 0.5, 0.75, 1]) {
        const dive = warpDescentTube(base, p)
        const kR = kFar(w.H, p) * R
        for (let i = 0; i < base.near.length; i++) {
          expect(dive.far[i].x).toBeCloseTo(kR * base.near[i].x, 6)
          expect(dive.far[i].y - vpY).toBeCloseTo(kR * (base.near[i].y - vpY), 6)
        }
      }
    }
  })

  it('matches warpDiveTube far ring PER-VERTEX at every progress (continuity with tp1-33)', () => {
    for (const w of WELL) {
      const base = tubeForLevel(w.level)
      for (const p of [0.1, 0.25, 0.5, 0.75, 1]) {
        const desc = warpDescentTube(base, p)
        const dive33 = warpDiveTube(base, p)
        for (let i = 0; i < base.far.length; i++) {
          expect(dist(desc.far[i], dive33.far[i])).toBeLessThan(1e-6)
        }
      }
    }
  })

  it('at p=1 the far ring has expanded to the rim\'s ORIGINAL size/position (kFar·R = 1)', () => {
    for (const w of WELL) {
      const base = tubeForLevel(w.level)
      const flat = warpDescentTube(base, 1)
      for (let i = 0; i < base.near.length; i++) {
        expect(dist(flat.far[i], base.near[i])).toBeLessThan(0.5)
      }
    }
  })
})

describe('tp1-38 AC4 — the rim crosses the eye at p* = (16+H)/224 and is flagged BEHIND THE EYE', () => {
  it('rimBehindEye is false just below p* and true just above it, per well (the ONELN2 cull signal)', () => {
    for (const w of WELL) {
      const base = tubeForLevel(w.level)
      const ps = pStar(w.H)
      expect(rimFlag(warpDescentTube(base, ps - 1e-3))).toBe(false)
      expect(rimFlag(warpDescentTube(base, ps + 1e-3))).toBe(true)
    }
  })

  it('the flag is a real boolean at every progress (runtime contract — untyped-test lesson)', () => {
    const base = tubeForLevel(1)
    for (const p of [0, 0.1, 0.5, 1]) {
      expect(typeof rimFlag(warpDescentTube(base, p))).toBe('boolean')
    }
  })

  it('p* is EARLY in every dive — the fly-off always happens (max p* = 44/224 < 0.2)', () => {
    for (const w of WELL) {
      expect(pStar(w.H)).toBeLessThan(0.2)
      expect(pStar(w.H)).toBeGreaterThan(0.11)
    }
    // The binding wells, as literals: square H=28 → 44/224; flat line H=10 → 26/224.
    expect(pStar(28)).toBeCloseTo(44 / 224, 12)
    expect(pStar(10)).toBeCloseTo(26 / 224, 12)
  })

  it('stays flagged all the way to (and past) the bottom', () => {
    for (const w of WELL) {
      const base = tubeForLevel(w.level)
      for (const p of [0.5, 0.75, 1, 1.1]) {
        expect(rimFlag(warpDescentTube(base, p))).toBe(true)
      }
    }
  })
})

describe('tp1-38 AC5 — the descent tube keeps the projection pipeline exact (farRatio law)', () => {
  it('farRatio = (16+H−224p)/(240+H−224p) while the rim is visible', () => {
    for (const w of WELL) {
      const base = tubeForLevel(w.level)
      for (const p of [0, 0.05, 0.1]) {
        expect(warpDescentTube(base, p).farRatio).toBeCloseTo(romRatio(w.H, p), 6)
      }
    }
  })

  it('the ratio SHRINKS toward 0 as the rim blows up (opposite of tp1-33\'s fixed-rim frame)', () => {
    const base = tubeForLevel(1)
    const H = 24
    let prev = Infinity
    for (const f of [0, 1 / 4, 1 / 2, 3 / 4]) {
      const r = warpDescentTube(base, f * pStar(H)).farRatio
      expect(r).toBeLessThan(prev)
      expect(r).toBeGreaterThan(0)
      prev = r
    }
  })
})

describe('tp1-38 AC6 — the Claw rides CURSY: its frame is the STATIC tube, never the descent tube', () => {
  it('anchoring to the descent tube would MOVE the Claw — provably wrong past any p>0', () => {
    // (CURSY − EY) ≡ 16+H means the Claw keeps the screen spot the rim had at
    // p=0 — i.e. clawTransform(STATIC tube). The descent tube's rim flies off, so
    // a claw anchored to it would fly off too. Pin the negative-space evidence:
    // the two frames measurably diverge (the render wiring must use the static
    // one — tests/shell/tp1-38.warp-rim-flyoff-render.test.ts pins the wiring).
    const base = tubeForLevel(1)
    const lane = 3
    const fixed = clawTransform(base, lane)
    const dive = warpDescentTube(base, pStar(24) / 2) // rim doubled here
    const moved = clawTransform(dive, lane)
    expect(dist(moved.anchor, fixed.anchor)).toBeGreaterThan(50)
    expect(moved.scale).toBeGreaterThan(fixed.scale * 1.5)
  })

  it('the static anchor does NOT lie on the descent tube\'s rim once the dive is underway', () => {
    const base = tubeForLevel(1)
    const lane = 3
    const fixed = clawTransform(base, lane)
    const dive = warpDescentTube(base, pStar(24) / 2)
    let min = Infinity
    for (const v of dive.near) min = Math.min(min, dist(v, fixed.anchor))
    expect(min).toBeGreaterThan(10) // the rim has left the Claw behind
  })
})

describe('tp1-38 AC7 — the FLY-IN seam is untouched: warpDiveTube stays near-ring-fixed', () => {
  // ONELN2's cull is gated "LDA EYH / IFPL" (ALDISP.MAC:1550-1552): a NEGATIVE
  // eye (the fly-in, parked at −1536) disarms it — nothing is behind that eye.
  // render's fly-in mapping drives warpDiveTube(newTube, 1→0); it must NOT
  // inherit the fly-off. These are keep-behavior guards: green today, and they
  // must STAY green after GREEN.
  it('warpDiveTube\'s near ring is byte-identical to the base at every progress', () => {
    for (const w of WELL) {
      const base = tubeForLevel(w.level)
      for (const p of [0.5, 1]) {
        const t = warpDiveTube(base, p)
        for (let i = 0; i < base.near.length; i++) {
          expect(dist(t.near[i], base.near[i])).toBeLessThan(1e-8)
        }
      }
    }
  })

  it('warpDiveTube never reports a rim behind the eye (no lying flag on the fly-in transform)', () => {
    const base = tubeForLevel(1)
    for (const p of [0, 0.5, 1]) {
      expect(rimFlag(warpDiveTube(base, p)) ?? false).toBe(false)
    }
  })
})

describe('tp1-38 — totality, purity, determinism (TS lang-review #1, #2, #4, #7)', () => {
  it('every coordinate stays FINITE across [0, 1.1] including the singular p* exactly', () => {
    for (const w of WELL) {
      const base = tubeForLevel(w.level)
      const ps = [0, 0.05, pStar(w.H) - 1e-9, pStar(w.H), pStar(w.H) + 1e-9, 0.5, 1, 1.05, 1.1]
      for (const p of ps) {
        const t = warpDescentTube(base, p)
        for (let i = 0; i < t.near.length; i++) {
          expect(Number.isFinite(t.near[i].x)).toBe(true)
          expect(Number.isFinite(t.near[i].y)).toBe(true)
          expect(Number.isFinite(t.far[i].x)).toBe(true)
          expect(Number.isFinite(t.far[i].y)).toBe(true)
        }
        expect(t.laneCount).toBe(base.laneCount)
        expect(t.closed).toBe(base.closed)
        expect(t.screenZ).toBeCloseTo(base.screenZ, 10)
      }
    }
  })

  it('is referentially transparent and does NOT mutate its input tube', () => {
    const base = tubeForLevel(1)
    const snapshot = JSON.stringify(base)
    const a = warpDescentTube(base, 0.6)
    const b = warpDescentTube(base, 0.6)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(JSON.stringify(base)).toBe(snapshot)
  })
})

describe('tp1-38 — wired to the live dive: the fly-off is REACHED in real play', () => {
  // Drive a fresh level-1 game into the warp (the tp1-33 pattern) and confirm the
  // real descent's progress genuinely crosses p*, with the flag flipping false →
  // true — the rim-fly-off is not a dead branch of the geometry.
  function warpDive(level = 1): GameState[] {
    const p0 = playingState(level)
    p0.spawn = { nymphs: [] }
    p0.enemies = []
    let s = stepGame(p0, NEUTRAL, 1 / 60) // enters the warp
    const samples: GameState[] = []
    for (let i = 0; i < 2000 && s.mode === 'warp' && (s.warp.flyIn ?? 0) === 0; i++) {
      samples.push(s)
      s = stepGame(s, NEUTRAL, 1 / 60)
    }
    return samples
  }

  it('a real level-1 descent crosses p* = 40/224 and the flag flips exactly once (false→true)', () => {
    const samples = warpDive(1)
    expect(samples.length).toBeGreaterThan(3) // the descent actually ran (liveness guard)
    const ps = samples.map((s) => s.warp.progress)
    expect(Math.max(...ps)).toBeGreaterThan(40 / 224) // the dive reaches the crossing
    const flags = samples.map((s) => rimFlag(warpDescentTube(s.tube, s.warp.progress)))
    expect(flags[0]).toBe(false) // rim visible at the top
    expect(flags[flags.length - 1]).toBe(true) // flown off by the bottom
    // Monotone: once true, never back to false (the eye never retreats).
    const firstTrue = flags.indexOf(true)
    expect(firstTrue).toBeGreaterThan(0)
    for (let i = firstTrue; i < flags.length; i++) expect(flags[i]).toBe(true)
  })
})
