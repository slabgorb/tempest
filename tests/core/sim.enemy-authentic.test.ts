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
// Speed bytes are signed, sign-extended ×8; the recon gives the net per-second
// rates directly, which is what we pin here:
//   • Flipper L1     −82.5 /s  → 82.5/224  = 0.3683 depth/s  (~2.7 s up the tube)
//   • Flipper L33+   −202.5/s  → 202.5/224 = 0.9040 depth/s  (the fast high tier)
//   • Fuseball L1    −165 /s   → 165/224   = 0.7366 depth/s  ( = 2 × flipper)
//   • Tanker          flipper speed (straight up)
//   • Pulsar (near)  −82.5 /s  (const; coincides with flipper L1)
//
// These are exercised against the pure rules/sim with a seeded RNG, so the suite
// is deterministic and needs no DOM/time/Math.random (CLAUDE.md hard boundary).
//
// Many of these FAIL today: the current levelParams speeds are invented
// approximations (flipper 0.18, fuseball 0.26, tanker 0.14) and several behaviors
// (spiker far-end hop, fuseball vulnerable phase, seg-1/seg+1 split geometry) are
// not yet authentic. Dev turns them green by tuning rules.ts + the enemy steppers.
import { describe, it, expect } from 'vitest'
import { playingState } from './helpers'
import { stepGame } from '../../src/core/sim'
import { splitTanker } from '../../src/core/enemies/tanker'
import { levelParams, SPLIT_CHILD_DEPTH } from '../../src/core/rules'
import { wrapLane } from '../../src/core/geometry'
import type { GameState, Enemy } from '../../src/core/state'
import type { Input } from '../../src/core/input'

const DT = 1 / 60
const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }

// ROM-derived authentic targets (see header for the along↔depth derivation).
const ALONG_SPAN = 0xf0 - 0x10 // 224
const FLIPPER_L1 = 82.5 / ALONG_SPAN // 0.3683 depth/s  (~2.7 s full traverse)
const FLIPPER_L33 = 202.5 / ALONG_SPAN // 0.9040 depth/s (fast high-level tier)

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
  it('flips climb at the ROM L1 rate ≈ 82.5/s → 0.368 depth/s', () => {
    // -82.5 along/s ÷ 224 = 0.3683 depth/s. Generous band around the target so
    // the "~" in the spec has room; the current 0.18 is far below and fails.
    const v = levelParams(1).flipperSpeed
    expect(v).toBeGreaterThan(0.32)
    expect(v).toBeLessThan(0.42)
  })

  it('reaches the fast L33+ flipper tier ≈ 202.5/s → 0.904 depth/s', () => {
    // The ROM steps flipper climb to -3.375/frame at L33+. Pin the high tier so
    // a runaway continuous ramp (today L33 ≈ 2.1 depth/s) is rejected.
    const v = levelParams(33).flipperSpeed
    expect(v).toBeGreaterThan(0.80)
    expect(v).toBeLessThan(1.00)
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
  it('a level-1 flipper climbs the whole tube in ≈ 2.7 seconds', () => {
    // The single most load-bearing authentic constant: at -82.5/s a flipper
    // covers the 224-unit well in 224/82.5 ≈ 2.7 s. Today (0.18 depth/s) it takes
    // ~5.6 s and blows the upper bound — valid RED.
    let s = isolated(7)
    // flipTimer huge: no lane flips, so it climbs straight up lane 0 (off the
    // Claw's lane 8 — never grabs, never gets culled). depth only ever rises.
    s.enemies = [{ kind: 'flipper', lane: 0, depth: 0, flipTimer: 999 }]
    let frames = 0
    while (s.enemies.length > 0 && s.enemies[0].depth < 0.999 && frames < 400) {
      s = stepGame(s, NEUTRAL, DT)
      frames++
    }
    const seconds = frames / 60
    expect(s.enemies.length, 'the flipper must survive the climb (no grab/cull)').toBe(1)
    expect(seconds).toBeGreaterThan(2.2)
    expect(seconds).toBeLessThan(3.2)
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

  // RE-SEATED by tp1-3 (W-040, 2026-07-13). This test used to assert the spiker hops
  // to the TALLEST standing spike — which is what our code did, and it is backwards.
  // ASTRAL (ALWELG.MAC:2260-2291) keeps the LARGEST LINEY, and LINEY is depth-from-the-
  // rim, so the largest is the SHORTEST spike; a dead line scores 0FF ("WORST CASE") and
  // beats every spike outright. Theurer's own comment on the compare reads
  // `IFCS ;NEEDIEST LINE SO FAR?`. The story's intent — "it relocates at the far end" —
  // is unchanged; only the lane it chooses moves. Full coverage of the new rule (empty
  // lane wins, tallest is NOT chosen) lives in tests/core/tp1-3.cheap-wins.test.ts.
  it('hops to the NEEDIEST lane — the shortest spike — when it bottoms out at the far end', () => {
    let s = isolated(11)
    s.enemies = [{ kind: 'spiker', lane: 5, depth: 0.02, direction: -1 }] // about to bottom out
    s.spikes = new Array(s.tube.laneCount).fill(0.6) // a tall, uniform field...
    s.spikes[10] = 0.1 // ...with one unambiguously neediest lane → the hop target
    for (let i = 0; i < 60; i++) s = stepGame(s, NEUTRAL, DT)
    const spiker = s.enemies.find((e) => e.kind === 'spiker')
    expect(spiker, 'the spiker survives the hop').toBeDefined()
    expect(spiker!.lane).toBe(10)
  })
})

// ── AC: the fuseball is killable ONLY while ROLLING between lanes ────────────

describe('authentic fuseball vulnerability (story 6-9; semantics corrected by tp1-3 / W-022)', () => {
  // RE-SEATED by tp1-3 (W-022, 2026-07-13). The MECHANISM these two tests pin — the
  // `vulnerable` bit gates the kill — is correct and unchanged. Their LABELS were
  // backwards: they called `vulnerable: false` "rolling the rim" and `true` "on-lane",
  // which is the exact inverse of the ROM. COLCHK (ALWELG.MAC:2965-2979) kills a fuse
  // only while INVAL2 is NEGATIVE, and INVAL2 goes negative when a lateral jump STARTS
  // ($81/$87) and positive the instant the fuse LANDS on a line ($20, under the comment
  // ";MAKE IT INVINCIBLE", ALWELG.MAC:1928). So: rolling = killable, parked on a lane =
  // invincible, at the rim = invincible. Only the prose moves here; what SETS the bit,
  // and the rim gate we never implemented, are covered in tests/core/tp1-3.cheap-wins.test.ts.
  function boardWith(vulnerable: boolean): GameState {
    const s = isolated(5)
    s.enemies = [{ kind: 'fuseball', lane: 6, depth: 0.5, jitterTimer: 999, vulnerable }]
    s.bullets = [{ lane: 6, depth: 0.5 }]
    return s
  }

  it('survives a point-blank shot while PARKED on a lane (invincible — INVAL2 positive)', () => {
    const out = stepGame(boardWith(false), NEUTRAL, DT)
    const fuseball = out.enemies.find((e) => e.kind === 'fuseball')
    expect(fuseball, 'a fuseball parked on a lane is not destroyed by a bullet').toBeDefined()
    expect(out.score).toBe(0) // no kill ⇒ no points
  })

  it('is destroyed by that same shot while ROLLING between lanes (INVAL2 negative)', () => {
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
