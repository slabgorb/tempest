// tests/core/sim.enemy-authentic.test.ts
//
// RED-phase suite for Story 6-9 — Authentic enemy motion & behavior constants
// (core fidelity). Pins the enemy speeds and behaviors to the rev-3 ROM
// (enemy-recon), expressed in our pure-core units: depth ∈ [0 = far, 1 = near].
//
// ── The ROM "along" ↔ our "depth" mapping ───────────────────────────────────
// ROM along runs 0x10 (near rim/player) … 0xf0 (far); enemies spawn at 0xf0 and
// climb toward low along. Our depth is the inverse-normalised axis: depth = 0 is
// far (along 0xf0), depth = 1 is the near rim (along 0x10). The traversable span
// is 0xf0 − 0x10 = 224 along-units (the same WARP_ALONG_SPAN the warp dive uses).
// So a ROM speed of S along/second maps to S/224 depth/second.
//
// ── REBASED BY STORY tp1-1 (2026-07-13). Read this before touching a number. ──
// This suite used to pin the flipper at "−82.5 along/s → 0.3683 depth/s (~2.7 s up
// the tube)" and called that the ROM. It was wrong, and it was wrong in the most
// dangerous way available: it CITED the ROM for it.
//
// The ROM's speed bytes are per FRAME, not per second: the L1 flipper is 1.375
// along/FRAME. Story 6-9 converted that to a per-second rate by multiplying by 60 —
// and the ROM does not run at 60. It runs at 256/9 = 28.44 fps (audit §3: a 256 Hz
// IRQ, nine ticks to the game frame, ALHARD.MAC:149-152 + ALEXEC.MAC:49-55). The
// notorious 82.5 is simply 1.375 × 60 with the invented rate baked into its face.
//
// So the correct per-second rates are the ROM's per-frame bytes × ROM_FPS:
//   • Flipper L1     1.375 along/frame → 39.1 /s  → 0.1746 depth/s  (~5.7 s up the tube)
//   • Flipper L33+   3.375 along/frame → 96.0 /s  → 0.4286 depth/s  (the fast high tier)
//   • Fuseball        2 × flipper                                   (a RATIO — unaffected)
//   • Tanker          1 × flipper                                   (a RATIO — unaffected)
//   • Pulsar (near)   the L1 flipper byte                           (a RATIO — unaffected)
//
// The ratios were right all along; only the base was wrong. Every absolute number
// below is now DERIVED from ROM_FPS rather than typed in, so it cannot silently
// re-acquire a frame rate.
//
// Footnote, and the reason the audit exists: this file's traverse test used to say
// "Today (0.18 depth/s) it takes ~5.6 s and blows the upper bound — valid RED." The
// pre-6-9 value of 0.18 depth/s was very nearly RIGHT (the truth is 0.1746, a 5.73 s
// traverse). Story 6-9 replaced a correct number with one 2.11× too fast, in the
// name of fidelity, and wrote a test to defend it.
//
// These are exercised against the pure rules/sim with a seeded RNG, so the suite
// is deterministic and needs no DOM/time/Math.random (CLAUDE.md hard boundary).
import { describe, it, expect } from 'vitest'
import { playingState } from './helpers'
import { stepGame } from '../../src/core/sim'
import { splitTanker } from '../../src/core/enemies/tanker'
import { levelParams, SPLIT_CHILD_DEPTH, ROM_FPS } from '../../src/core/rules'
import { wrapLane } from '../../src/core/geometry'
import type { GameState, Enemy } from '../../src/core/state'
import type { Input } from '../../src/core/input'

const DT = 1 / 60
const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }

// ROM-derived authentic targets (see header for the along↔depth derivation).
// The ROM bytes are per FRAME; ROM_FPS turns them into per-second rates. Never
// write these as decimals — a literal is how the 60 got in here the first time.
const ALONG_SPAN = 0xf0 - 0x10 // 224
const FLIPPER_ALONG_PER_FRAME_L1 = 1.375  // ROM byte (was mis-scaled to 82.5/s = ×60)
const FLIPPER_ALONG_PER_FRAME_L33 = 3.375 // ROM byte (was mis-scaled to 202.5/s = ×60)
const FLIPPER_L1 = (FLIPPER_ALONG_PER_FRAME_L1 * ROM_FPS) / ALONG_SPAN  // 0.1746 depth/s (~5.7 s)
const FLIPPER_L33 = (FLIPPER_ALONG_PER_FRAME_L33 * ROM_FPS) / ALONG_SPAN // 0.4286 depth/s

// A board frozen except for the enemy under test: no spawning (a high timer with
// budget still pending, so the spiker-hop "none pending" conversion never fires),
// no level-clear (an enemy is always present), and the Claw parked off the action.
function isolated(seed: number): GameState {
  const s = playingState(seed)
  s.level = 1
  s.player.lane = 8
  s.enemies = []
  s.bullets = []
  s.spawn = { remaining: 5, timer: 999 } // pending but never fires within a test
  s.spikes = new Array(s.tube.laneCount).fill(0)
  return s
}

// ── AC: authentic climb speeds (rules.levelParams) ──────────────────────────

describe('authentic climb speeds (story 6-9)', () => {
  it('flips climb at the ROM L1 rate: 1.375 along/frame × 28.44 fps → 0.175 depth/s', () => {
    // 1.375 × 256/9 = 39.1 along/s ÷ 224 = 0.1746 depth/s. The 0.368 this test used
    // to demand is exactly 2.11× too fast — it was 1.375 × 60.
    const v = levelParams(1).flipperSpeed
    expect(v).toBeGreaterThan(0.15)
    expect(v).toBeLessThan(0.20)
  })

  it('reaches the fast L33+ flipper tier: 3.375 along/frame → exactly 96/s → 3/7 depth/s', () => {
    // The ROM steps flipper climb to 3.375 along/frame at L33+. At the true clock
    // that is 3.375 × 256/9 = 96.0 along/s exactly — the base being right is why the
    // number comes out clean. ÷224 = 3/7 = 0.4286 depth/s.
    const v = levelParams(33).flipperSpeed
    expect(v).toBeGreaterThan(0.38)
    expect(v).toBeLessThan(0.48)
    // Sanity: still strictly faster than the L1 rate (the tier rises, not falls).
    expect(v).toBeGreaterThan(levelParams(1).flipperSpeed)
  })

  it('fuseballs move at exactly 2× the flipper speed at every level', () => {
    // spd_fuzzball = 2 × spd_flipper — the fastest enemy. An exact ROM ratio.
    for (const level of [1, 20, 33]) {
      const p = levelParams(level)
      expect(p.fuseballSpeed).toBeCloseTo(2 * p.flipperSpeed, 6)
    }
  })

  it('tankers climb at exactly the flipper speed (straight up the tube)', () => {
    for (const level of [1, 20, 33]) {
      const p = levelParams(level)
      expect(p.tankerSpeed).toBeCloseTo(p.flipperSpeed, 6)
    }
  })

  it('keeps the L1 flipper rate within 10% of the exact ROM constant', () => {
    // Tighter cross-check on the headline constant so the band above can't be
    // satisfied by an accidental near-miss value.
    expect(Math.abs(levelParams(1).flipperSpeed - FLIPPER_L1)).toBeLessThan(0.1 * FLIPPER_L1)
    expect(Math.abs(levelParams(33).flipperSpeed - FLIPPER_L33)).toBeLessThan(0.1 * FLIPPER_L33)
  })
})

// ── AC: authentic traverse time (full sim) ──────────────────────────────────

describe('authentic full-tube traverse (story 6-9)', () => {
  it('a level-1 flipper climbs the whole tube in ≈ 5.7 seconds', () => {
    // The single most load-bearing authentic constant, and this suite had it wrong.
    // At the ROM's real L1 rate (1.375 along/frame × 28.44 fps = 39.1 along/s) a
    // flipper covers the 224-unit well in 224/39.1 ≈ 5.73 s. The 2.7 s this test
    // used to demand assumed a 60 fps machine that never existed.
    let s = isolated(7)
    // flipTimer huge: no lane flips, so it climbs straight up lane 0 (off the
    // Claw's lane 8 — never grabs, never gets culled). depth only ever rises.
    s.enemies = [{ kind: 'flipper', lane: 0, depth: 0, flipTimer: 999 }]
    let frames = 0
    // The climb is now 2.11× longer, so the old 400-frame bound would have tripped
    // before the flipper ever arrived and failed for the wrong reason.
    while (s.enemies.length > 0 && s.enemies[0].depth < 0.999 && frames < 600) {
      s = stepGame(s, NEUTRAL, DT)
      frames++
    }
    // `frames * DT` — accumulated wall time. NOT `frames / 60`: that spells the
    // invented frame rate out loud and is exactly how this suite got poisoned.
    const seconds = frames * DT
    expect(s.enemies.length, 'the flipper must survive the climb (no grab/cull)').toBe(1)
    expect(seconds).toBeGreaterThan(5.0)
    expect(seconds).toBeLessThan(6.5)
  })
})

// ── AC: tanker splits into 2 cargo children on the FLANKING lanes ───────────

describe('authentic tanker split geometry (story 6-9)', () => {
  it('spawns two cargo children on the flanking lanes (seg-1 and seg+1)', () => {
    // ROM: a split drops two children into the ADJACENT lanes (seg-1, seg+1),
    // straddling the tanker — its own lane is left empty. Today one child lands
    // on the tanker's own lane (seg, seg+1), so this fails on the seg-1 child.
    const tube = playingState(1).tube
    const params = levelParams(1)
    const tanker: Enemy = { kind: 'tanker', lane: 4, depth: 0.5, contains: 'pulsar' }
    const kids = splitTanker(tanker, tube, params)

    expect(kids).toHaveLength(2)
    expect(kids.every((k) => k.kind === 'pulsar')).toBe(true) // cargo type, both children
    const lanes = kids.map((k) => k.lane).sort((a, b) => a - b)
    expect(lanes).toEqual([wrapLane(tube, 3), wrapLane(tube, 5)])
    expect(lanes).not.toContain(4) // the tanker's own lane is vacated
    expect(kids.every((k) => k.depth <= SPLIT_CHILD_DEPTH)).toBe(true)
  })

  it('vacates the seam correctly when splitting on lane 0 (wraps to 15 and 1)', () => {
    const tube = playingState(1).tube // 16-lane closed well
    const kids = splitTanker(
      { kind: 'tanker', lane: 0, depth: 0.5, contains: 'flipper' }, tube, levelParams(1),
    )
    const lanes = kids.map((k) => k.lane).sort((a, b) => a - b)
    expect(lanes).toEqual([1, 15]) // wrap(-1)=15, wrap(+1)=1 — never -1
  })
})

// ── AC: spiker grows spike toward the rim, then hops at the far end ──────────

describe('authentic spiker spike & far-end hop (story 6-9)', () => {
  it('grows the spike only toward the rim and never shrinks it on descent', () => {
    // spike_ht tracks the spiker's high-water mark; descending must not lower it.
    let s = isolated(3)
    s.enemies = [{ kind: 'spiker', lane: 5, depth: 0.0, direction: 1 }]
    // Climb a while, capture the peak spike, then keep stepping (it will turn and
    // descend) and assert the spike height never drops below that peak.
    let peak = 0
    for (let i = 0; i < 40; i++) {
      s = stepGame(s, NEUTRAL, DT)
      peak = Math.max(peak, s.spikes[5])
    }
    expect(peak).toBeGreaterThan(0) // it actually laid spike
    for (let i = 0; i < 200; i++) {
      s = stepGame(s, NEUTRAL, DT)
      expect(s.spikes[5]).toBeGreaterThanOrEqual(peak) // monotone toward the rim
    }
  })

  it('hops to the tallest-spike lane when it bottoms out at the far end', () => {
    // ROM: at the far end the spiker relocates to a new lane, preferring the one
    // with the tallest standing spike. Today it just reverses on its own lane, so
    // it never leaves lane 5 and this fails.
    let s = isolated(11)
    s.enemies = [{ kind: 'spiker', lane: 5, depth: 0.02, direction: -1 }] // about to bottom out
    s.spikes[10] = 0.5 // the unambiguous tallest spike → the hop target
    for (let i = 0; i < 60; i++) s = stepGame(s, NEUTRAL, DT)
    const spiker = s.enemies.find((e) => e.kind === 'spiker')
    expect(spiker, 'the spiker survives the hop').toBeDefined()
    expect(spiker!.lane).toBe(10)
  })
})

// ── AC: fuseball killable ONLY in its on-lane vulnerable phase ───────────────

describe('authentic fuseball vulnerability (story 6-9)', () => {
  // The collision setup: a stationary fuseball (jitterTimer parked) sharing the
  // bullet's lane and depth. One frame of motion drifts them < HIT_DEPTH apart,
  // so geometry resolves a hit — what changes is whether the vulnerable bit
  // ALLOWS the kill. `vulnerable` is the test's contract for the ROM L02cc bit7.
  function boardWith(vulnerable: boolean): GameState {
    const s = isolated(5)
    s.enemies = [{ kind: 'fuseball', lane: 6, depth: 0.5, jitterTimer: 999, vulnerable }]
    s.bullets = [{ lane: 6, depth: 0.5 }]
    return s
  }

  it('survives a point-blank shot while NOT in its vulnerable phase (rolling the rim)', () => {
    const out = stepGame(boardWith(false), NEUTRAL, DT)
    const fuseball = out.enemies.find((e) => e.kind === 'fuseball')
    expect(fuseball, 'an invulnerable fuseball is not destroyed by a bullet').toBeDefined()
    expect(out.score).toBe(0) // no kill ⇒ no points
  })

  it('is destroyed by that same shot once it is in its vulnerable phase', () => {
    const out = stepGame(boardWith(true), NEUTRAL, DT)
    expect(out.enemies.some((e) => e.kind === 'fuseball')).toBe(false)
    expect(out.score).toBeGreaterThan(0) // the kill scored
  })
})

// ── AC: flipper rim-grab + determinism guard (locks existing authentic behavior) ─

describe('flipper rim-grab and determinism (story 6-9 guards)', () => {
  it('grabs and kills the Claw when it reaches the rim on the player segment', () => {
    const s = isolated(1)
    s.player.lane = 3
    s.enemies = [{ kind: 'flipper', lane: 3, depth: 0.95, flipTimer: 999 }] // at the rim, same seg
    const out = stepGame(s, NEUTRAL, DT)
    expect(out.mode).toBe('dying')
    expect(out.lives).toBe(2)
  })

  it('steps a mixed roster identically from the same seed (pure & deterministic)', () => {
    // Movement RNG is threaded, not global: same seed + same inputs ⇒ byte-identical
    // enemy positions. Low timers force flips/jitter so the RNG path is exercised.
    const build = (): GameState => {
      const s = isolated(1234)
      s.enemies = [
        { kind: 'flipper', lane: 1, depth: 0.2, flipTimer: 0.01 },
        { kind: 'fuseball', lane: 9, depth: 0.3, jitterTimer: 0.01, vulnerable: true },
        { kind: 'pulsar', lane: 12, depth: 0.4, flipTimer: 0.01, pulseTimer: 0.01, pulsing: false },
      ]
      return s
    }
    const run = (): string => {
      let s = build()
      for (let i = 0; i < 30; i++) s = stepGame(s, NEUTRAL, DT)
      return s.enemies.map((e) => `${e.kind}:${e.lane}:${e.depth.toFixed(6)}`).join('|')
    }
    const a = run()
    const b = run()
    expect(a).toContain('flipper') // not vacuously equal-empty
    expect(a).toBe(b)
  })
})
