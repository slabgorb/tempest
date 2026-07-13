// tests/core/sim.enemy-motion-fidelity.test.ts
//
// RED-phase suite for Story 6-15 — "Remaining enemy motion fidelity" (6-9
// follow-up). Story 6-9 pinned the climb SPEEDS and a first cut of the spiker
// far-end hop and the fuseball vulnerable bit (see sim.enemy-authentic.test.ts).
// This suite pins the behaviours 6-9 left on the table, all sourced from the
// rev-3 ROM extract (docs/ux/2026-06-27-enemy-roster-rom-extract.md):
//
//   1. SPIKER  — the near "0x20" turnaround (oscillates ~$20 ↔ far, ROM l.202-208,
//      §C l.210) and the "convert to a flipper/tanker when none pending" branch
//      of spiker_hop (§C l.211). 6-9 only built the tallest-spike hop and kept
//      a spawn budget pending so the conversion never fired.
//   2. FUSEBALL — lateral steering biased TOWARD the player, gated by fuzz_move
//      (§D l.240-250), plus the wider hit_tol[4]=6 kill window (§D l.265). 6-9
//      only built the vulnerable bit; today the fuseball jitters 50/50 random on
//      a fixed timer and shares the default hit window with every other enemy.
//   3. PULSAR  — the dual far/near climb speed: flipper speed when farther than
//      L0157, the hardcoded spd_pulsar (-82.5/s) when nearer (§E l.292-293).
//      Today the pulsar climbs at flipper speed everywhere.
//
// ── The ROM "along" ↔ our "depth" mapping (identical to the 6-9 suite) ───────
// ROM along runs 0x10 (near rim/player) … 0xf0 (far); enemies spawn at 0xf0 and
// climb toward low along. Our depth is the inverse-normalised axis: depth = 0 is
// far (along 0xf0), depth = 1 is the near rim (along 0x10). The traversable span
// is 0xf0 − 0x10 = 224 along-units. So depth = (0xf0 − along) / 224, and a ROM
// speed of S along/second maps to S/224 depth/second.
//
// Everything runs against the pure rules/sim with a seeded RNG, so the suite is
// deterministic and needs no DOM/time/Math.random (CLAUDE.md hard boundary).
//
// Most of these FAIL today; Dev turns them green by tuning the enemy steppers +
// the spiker-hop / fuseball-collision logic in sim.ts (and rules.ts constants).
import { describe, it, expect } from 'vitest'
import { playingState } from './helpers'
import { stepGame } from '../../src/core/sim'
import { levelParams, ROM_FPS } from '../../src/core/rules'
import type { GameState, Enemy } from '../../src/core/state'
import type { Input } from '../../src/core/input'

const DT = 1 / 60
const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }

// ── ROM-derived authentic targets (see header for the along↔depth derivation) ─
const ALONG_SPAN = 0xf0 - 0x10 // 224
const depthFromAlong = (along: number): number => (0xf0 - along) / ALONG_SPAN

// Spiker near-turnaround: ROM clamps `along` to $20 and reverses (move away)
// when it climbs below it (§C l.202-208). $20 → depth ≈ 0.929 — far closer to
// the rim than today's SPIKE_MAX_DEPTH (0.75) reversal point.
const SPIKER_TURN_DEPTH = depthFromAlong(0x20) // 208/224 ≈ 0.9286

// Pulsar near speed: spd_pulsar = $fea0, hardcoded — the SAME byte as the L1
// flipper, so it only diverges from the far (flipper) speed at the higher levels
// where pulsars actually appear (L17+).
//
// REBASED BY tp1-1: this was `82.5 / ALONG_SPAN`. The ROM byte is 1.375 along per
// FRAME, and the ROM runs at 256/9 = 28.44 fps, not 60 (audit §3) — so 82.5 is
// just 1.375 × 60, the invented frame rate written into a literal where no grep
// for "60" could ever find it. The true rate is 1.375 × 28.44 = 39.1 along/s.
const PULSAR_ALONG_PER_FRAME = 1.375 // the ROM byte, shared with the L1 flipper
const PULSAR_NEAR_SPEED = (PULSAR_ALONG_PER_FRAME * ROM_FPS) / ALONG_SPAN // ≈ 0.1746 depth/s

// Pulsar far/near boundary: L0157 = $a0 for L1-64 (§E l.311). along < $a0 is
// "nearer than L0157" → pulsar speed; along > $a0 is farther → flipper speed.
// $a0 → depth ≈ 0.357. The pulsar tests below sit each sample WELL clear of it.
const PULSAR_NEAR_FAR_DEPTH = depthFromAlong(0xa0) // ≈ 0.357

// Rotational (wrapped) lane distance on an n-lane closed tube.
const rdist = (a: number, b: number, n: number): number => {
  const d = Math.abs(a - b) % n
  return Math.min(d, n - d)
}

// A board frozen except for the enemy under test: the Claw parked on a fixed
// lane, no other enemies, no bullets, no standing spikes. `spawnRemaining`
// controls whether the spiker_hop "none pending" conversion is eligible — 6-9's
// helper hard-coded a pending budget specifically to suppress it; here we vary it.
function isolated(seed: number, spawnRemaining = 5): GameState {
  const s = playingState(seed)
  s.level = 1
  s.player.lane = 8
  s.enemies = []
  s.bullets = []
  s.spawn = { remaining: spawnRemaining, timer: 999 } // never auto-fires within a test
  s.spikes = new Array(s.tube.laneCount).fill(0)
  return s
}

// ── AC 1a: spiker oscillates to the $20 near-turnaround (not 0.75) ───────────

describe('spiker 0x20 near turnaround (story 6-15)', () => {
  it('climbs toward the rim and reverses at the ROM $20 point ≈ 0.929 depth', () => {
    // The spiker climbs (depth rising) until `along` drops to $20, then reverses
    // (move away). Today it reverses at SPIKE_MAX_DEPTH = 0.75 and so never
    // approaches the rim the way the arcade spiker does — valid RED.
    let s = isolated(3)
    s.enemies = [{ kind: 'spiker', lane: 5, depth: 0.0, direction: 1 }]

    let peak = 0
    let turned = false
    for (let i = 0; i < 500; i++) {
      s = stepGame(s, NEUTRAL, DT)
      const sp = s.enemies.find((e) => e.kind === 'spiker')
      expect(sp, 'the spiker must survive its climb (it is not a grabber)').toBeDefined()
      peak = Math.max(peak, sp!.depth)
      if (sp!.direction === -1) { turned = true; break } // captured the turnaround
    }

    expect(turned, 'the spiker must turn around within the window').toBe(true)
    // The headline: it climbs PAST the old 0.75 cap up to the $20 point.
    expect(peak).toBeGreaterThan(0.8)
    expect(peak).toBeGreaterThan(SPIKER_TURN_DEPTH - 0.05)
    expect(peak).toBeLessThan(SPIKER_TURN_DEPTH + 0.04)
  })
})

// ── AC 1b: spiker converts to a flipper/tanker at the far end when none pending ─

describe('spiker far-end conversion when nothing is pending (story 6-15)', () => {
  it('converts a bottomed-out spiker into a flipper/tanker when the spawn budget is empty', () => {
    // ROM spiker_hop (§C l.211): at the far end it jumps to a new lane, OR — when
    // there are no pending spike-enemies left to release — it CONVERTS into a
    // flipper-holding tanker instead of hopping forever. We model "none pending"
    // as an empty spawn budget. Today the spiker always hops and stays a spiker.
    let s = isolated(11, /* spawnRemaining */ 0) // nothing left to spawn ⇒ convert
    s.enemies = [{ kind: 'spiker', lane: 5, depth: 0.02, direction: -1 }] // about to bottom out

    for (let i = 0; i < 40; i++) s = stepGame(s, NEUTRAL, DT)

    expect(
      s.enemies.some((e) => e.kind === 'spiker'),
      'the bottomed-out spiker must convert away (no spiker left) when nothing is pending',
    ).toBe(false)
    expect(
      s.enemies.some((e) => e.kind === 'flipper' || e.kind === 'tanker'),
      'it converts into a flipper or a (flipper-holding) tanker',
    ).toBe(true)
  })

  it('still hops and stays a spiker while spike-enemies are pending (6-9 behaviour preserved)', () => {
    // The contrast case: with a pending budget the far-end behaviour is the 6-9
    // hop — relocate to the tallest-spike lane, remain a spiker. This already
    // passes; it guards the conversion above from over-firing.
    let s = isolated(11, /* spawnRemaining */ 5)
    s.enemies = [{ kind: 'spiker', lane: 5, depth: 0.02, direction: -1 }]
    s.spikes[10] = 0.5 // the unambiguous tallest spike → the hop target

    for (let i = 0; i < 40; i++) s = stepGame(s, NEUTRAL, DT)

    const spiker = s.enemies.find((e) => e.kind === 'spiker')
    expect(spiker, 'the spiker survives (hops, not converts) while enemies are pending').toBeDefined()
    expect(spiker!.lane).toBe(10)
  })
})

// ── AC 2a: fuseball steers TOWARD the player (gated, but never away) ─────────

describe('fuseball steers toward the player (story 6-15)', () => {
  // Run a single fuseball that starts a few lanes off the player and watch its
  // wrapped lane-distance to the Claw over a short window (before it climbs out).
  // A toward-biased fuseball NEVER increases that distance (the fuzz_move gate
  // only skips a step, it never reverses direction); today's 50/50 random hop
  // walks AWAY about half the time, so the distance overshoots its start.
  function runSeed(seed: number): { init: number; max: number; min: number } {
    const s0 = isolated(seed)
    const n = s0.tube.laneCount
    const player = s0.player.lane // 8
    const start = (player + 4) % n // 4 lanes away; the short way is toward the player
    let s: GameState = s0
    s.enemies = [{ kind: 'fuseball', lane: start, depth: 0, jitterTimer: 0, vulnerable: false }]

    const init = rdist(start, player, n)
    let max = init
    let min = init
    for (let i = 0; i < 60; i++) {
      s = stepGame(s, NEUTRAL, DT)
      const fb = s.enemies.find((e) => e.kind === 'fuseball')
      if (!fb) break // grabbed/culled — stop sampling
      const d = rdist(fb.lane, player, n)
      max = Math.max(max, d)
      min = Math.min(min, d)
    }
    return { init, max, min }
  }

  const SEEDS = [1, 7, 13, 42, 99]

  it('never drifts farther from the player than where it started (no away-steps)', () => {
    for (const seed of SEEDS) {
      const { init, max } = runSeed(seed)
      expect(max, `seed ${seed}: fuseball stepped AWAY from the player`).toBeLessThanOrEqual(init)
    }
  })

  it('actually closes the gap (it is steering, not frozen)', () => {
    // Liveness across the seed set: a correct steerer reduces the distance at
    // least once somewhere; this rejects a do-nothing implementation that would
    // vacuously satisfy the "never increases" assertion above.
    const closed = SEEDS.some((seed) => runSeed(seed).min < runSeed(seed).init)
    expect(closed, 'no seed ever moved the fuseball toward the player').toBe(true)
  })
})

// ── AC 2b: fuseball has the wider hit_tol[4]=6 kill window ────────────────────

describe('fuseball wider hit tolerance (story 6-15)', () => {
  // hit_tol[4]=6 (§D l.265) is WIDER than the default enemy tolerance: a bullet
  // registers on a (vulnerable) fuseball across a larger depth gap than it would
  // on, say, a flipper. We isolate the spatial window from temporal drift by
  // stepping with dt → 0, so neither the bullet nor the enemy moves measurably
  // and the hit is decided purely by the initial depth offset.
  //
  // NOTE (TEA assumption — see session Design Deviations): the rev-3 default
  // hit_tol is not in the extracted notes, so this pins the RELATIONSHIP
  // (fuseball window strictly wider than the default ~0.06) rather than an exact
  // fuseball depth. The probe offset 0.07 sits just beyond today's shared 0.06
  // window; Dev/Reviewer should confirm the exact ratio against the disassembly.
  const TINY = 1e-9
  const BULLET_DEPTH = 0.5
  const WIDE_OFFSET = 0.07 // just beyond the default 0.06 → only a wider window catches it
  const NARROW_OFFSET = 0.05 // inside the default window → everyone is hit

  function killedAtOffset(enemy: Enemy, offset: number): boolean {
    const s = isolated(5, /* spawnRemaining */ 0)
    s.player.lane = 0 // park the Claw off the action lane
    s.enemies = [enemy]
    s.bullets = [{ lane: 6, depth: BULLET_DEPTH }]
    const out = stepGame(s, NEUTRAL, TINY)
    return !out.enemies.some((e) => e.kind === enemy.kind)
  }

  it('kills a vulnerable fuseball at a gap that is too wide for the default window', () => {
    const fuseball: Enemy = {
      kind: 'fuseball', lane: 6, depth: BULLET_DEPTH + WIDE_OFFSET, jitterTimer: 999, vulnerable: true,
    }
    expect(killedAtOffset(fuseball, WIDE_OFFSET)).toBe(true)
  })

  it('does NOT kill a flipper at that same wide gap (the widening is fuseball-specific)', () => {
    // Guards against a lazy fix that widens the GLOBAL HIT_DEPTH for everyone.
    const flipper: Enemy = { kind: 'flipper', lane: 6, depth: BULLET_DEPTH + WIDE_OFFSET, flipTimer: 999 }
    expect(killedAtOffset(flipper, WIDE_OFFSET)).toBe(false)
  })

  it('still kills a vulnerable fuseball inside the default window (not made narrower)', () => {
    const fuseball: Enemy = {
      kind: 'fuseball', lane: 6, depth: BULLET_DEPTH + NARROW_OFFSET, jitterTimer: 999, vulnerable: true,
    }
    expect(killedAtOffset(fuseball, NARROW_OFFSET)).toBe(true)
  })
})

// ── AC 3: pulsar climbs at flipper speed when far, spd_pulsar when near ──────

describe('pulsar far/near dual climb speed (story 6-15)', () => {
  // Measure a pulsar's climb rate over a short window that stays entirely on one
  // side of the L0157 ($a0 ≈ depth 0.357) boundary. flipTimer/pulseTimer are
  // parked so only the climb moves it; the pulsar sits off the Claw's lane.
  function climbRate(level: number, startDepth: number): number {
    let s = isolated(2)
    s.level = level
    s.enemies = [{
      kind: 'pulsar', lane: 2, depth: startDepth, flipTimer: 999, pulseTimer: 999, pulsing: false,
    }]
    const before = startDepth
    const frames = 10
    for (let i = 0; i < frames; i++) s = stepGame(s, NEUTRAL, DT)
    const after = s.enemies.find((e) => e.kind === 'pulsar')!.depth
    return (after - before) / (frames * DT)
  }

  it('a NEAR pulsar climbs at the hardcoded spd_pulsar (1.375 along/frame ≈ 0.175 depth/s)', () => {
    // depth 0.60 → along ≈ $69, well inside L0157 ($a0): pulsar (near) speed.
    // The constant is level-independent, so L33 must show it.
    // Bands rebased by tp1-1: the old 0.30–0.45 was the 60 Hz misreading.
    expect(0.6).toBeGreaterThan(PULSAR_NEAR_FAR_DEPTH) // sanity: 0.6 is on the near side
    const near = climbRate(33, 0.6)
    expect(near).toBeGreaterThan(0.14)
    expect(near).toBeLessThan(0.21)
    expect(Math.abs(near - PULSAR_NEAR_SPEED)).toBeLessThan(0.03)
  })

  it('a FAR pulsar climbs at the level flipper speed, strictly faster than near', () => {
    // depth 0.10 → along ≈ $d9, outside L0157: flipper (far) speed. At L33 that is
    // 3.375 along/frame × 28.44 fps ÷ 224 = 3/7 ≈ 0.429 depth/s — still ~2.45× the
    // near constant. The RATIO is frame-rate invariant and was right all along;
    // only the two absolute bands carried the invented 60.
    expect(0.1).toBeLessThan(PULSAR_NEAR_FAR_DEPTH) // sanity: 0.1 is on the far side
    const far = climbRate(33, 0.1)
    const near = climbRate(33, 0.6)
    const flipper = levelParams(33).flipperSpeed
    expect(far).toBeGreaterThan(0.38)
    expect(far).toBeLessThan(0.48)
    expect(Math.abs(far - flipper)).toBeLessThan(0.1 * flipper) // far == the flipper rate
    expect(far).toBeGreaterThan(near * 1.5) // and clearly faster than the near constant
  })
})

// ── Rule guard: the new motion paths stay deterministic (CLAUDE.md boundary) ──

describe('determinism of the 6-15 motion paths (core-purity rule)', () => {
  it('steps the spiker/fuseball/pulsar identically from the same seed', () => {
    // The core is a pure function of (state, input, dt): identical seed + inputs
    // ⇒ byte-identical enemy positions. Low timers force the RNG-driven branches
    // (fuseball fuzz_move steer, pulsar flip, spiker far-end hop) so a stray
    // Math.random or wall-clock read smuggled into the new code would desync the
    // two runs and fail here. This guard must hold now AND after GREEN.
    const build = (): GameState => {
      const s = isolated(20240615)
      s.level = 20
      s.player.lane = 8
      s.enemies = [
        { kind: 'spiker', lane: 5, depth: 0.02, direction: -1 },     // hop RNG
        { kind: 'fuseball', lane: 12, depth: 0.1, jitterTimer: 0.01, vulnerable: true }, // steer RNG
        { kind: 'pulsar', lane: 2, depth: 0.1, flipTimer: 0.01, pulseTimer: 0.01, pulsing: false }, // flip RNG
      ]
      return s
    }
    const run = (): string => {
      let s = build()
      for (let i = 0; i < 25; i++) s = stepGame(s, NEUTRAL, DT)
      return s.enemies.map((e) => `${e.kind}:${e.lane}:${e.depth.toFixed(6)}`).join('|')
    }
    const a = run()
    const b = run()
    expect(a.length, 'the roster must not vanish (non-vacuous comparison)').toBeGreaterThan(0)
    expect(a).toBe(b)
  })
})
