// tests/core/tp2-1.pulpot-motion-tier.test.ts
//
// RED suite for story tp2-1 — PULPOT is ONE ROM byte, and the pulsar's CLIMB and
// REVERSE tiers widen to $C0 at wave 65 exactly as the kill tier does. tp1-26 gave
// the KILL gate a wave-parameterised WPULPOT lookup and left the motion sites frozen
// at the wave-1 $A0 (rules.ts PULSAR_NEAR_FAR_DEPTH). This story unifies all three.
//
// ── FIDELITY RULING (AC-1): option (a) — adopt the ROM ────────────────────────────────
// The wave-65 tier is ALREADY modelled for the kill gate (tp1-26), so at wave 65+ the
// shipped sim is in a state the cabinet never exhibits: a pulsar at depth 0.28 KILLS
// (the $C0 kill zone) while still climbing at the FAST flipper rate and reversing at the
// $A0 line — the potency zone disagrees with itself about where it is. The ROM cannot
// disagree with itself: JPULMO reads the SAME `PULPOT` byte at all three sites. Full
// reasoning recorded in the tp2-1 session (TEA Assessment).
//
// ── THE ROM (byte-verified against ~/Projects/tempest-source-text — the LF copy) ──────
// WPULPOT — "PULSAR POTENCY HEIGHT" (ALWELG.MAC:606-609, THREE records, $A0 across 1-64):
//     WPULPOT:                ;PULSAR POTENCY HEIGHT
//         .BYTE T1,1,32.,0A0
//         .BYTE T1,33.,64.,0A0
//         .BYTE T1,65.,99.,0C0
//
// JPULMO (ALWELG.MAC:1780-1799) reads that one byte three times:
//   climb  (1783-1786): LDA X,INVAY / CMP PULPOT / IFCS ;IN POWER ZONE?
//                       / LDY I,ZABFLI ;NO. GO FASTER
//   reverse (1795-1796): CMP PULPOT / IFCS ;TIME TO REVERSE?   (descending; the NYMCOU
//                       clause at 1791-1794 loads $FF — "SEND PULSAR UP" — past every rail)
//   kill   (1804-1806): LDA X,INVAY / CMP PULPOT / IFCC ;PULSAR IN RANGE?  (tp1-26's site)
//
// INVAY runs $10 (rim) .. $F0 (far); depth = (0xF0 - INVAY)/224. So the potency zone is
// depth >= (0xF0 - PULPOT)/224: 0.357 at $A0 (waves 1-64), 0.214 at $C0 (waves 65-99) —
// WIDER at 65+, for the climb slow-down and the reverse line exactly as for the kill.
//
// ── THE FOLD (CONTOUR, ALWELG.MAC:415-423) ────────────────────────────────────────────
// s.level is uncapped; the ROM folds wave >= 99 into a random 65..96 — inside WPULPOT's
// single deep record, so the deterministic contourWave fold lands on the identical $C0
// byte. The motion boundary must fold with it: waves 100+ keep the $C0 tier, never the
// $A0 one and never a walk-off value (the tp1-25 lesson: test PAST the table's last row).
//
// ── METHOD: the boundary is DERIVED OUT OF THE RUNNING SIM (AC-2) ─────────────────────
// No assertion below re-derives the boundary arithmetically or reads the constant under
// audit (the tp1-27 lesson): the climb boundary is found by bisecting stepGame's own
// one-frame climb delta between a slow reference (depth 0.6, in-zone at every wave) and
// a fast reference (depth 0.05, out-of-zone at every wave), and the reverse line is the
// minimum depth a descending pulsar reaches before stepGame flips its direction. The two
// $-bytes appear only as spelled-out literals a reader can check against the ROM.
//
// Calibration (probed against shipped code, 2026-07-19): slow rate 0.00614 depth/frame
// (level-independent), fast rate 0.0113 (L17) → 0.0223 (L65+) — ≥1.8× apart at L17+,
// so classification by midpoint is unambiguous. Wave 1 CANNOT discriminate (the L1
// flipper byte IS spd_pulsar), which is why the boundary probes run at 17+.
import { describe, it, expect } from 'vitest'
import { playingState } from './helpers'
import { stepGame, makeEnemy } from '../../src/core/sim'
import * as rules from '../../src/core/rules'
import { levelParams, SIM_STEP } from '../../src/core/rules'
import { tubeForLevel } from '../../src/core/geometry'
import type { Input } from '../../src/core/input'
import type { GameState, Pulsar, Nymph } from '../../src/core/state'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }
const FRAME = SIM_STEP

// The two ROM bytes as depths, spelled out so a reader can check them against WPULPOT.
const ZONE_A0 = (0xf0 - 0xa0) / 224   // 0.357… — potency height, waves 1-64
const ZONE_C0 = (0xf0 - 0xc0) / 224   // 0.214… — potency height, waves 65-99

const thePulsar = (s: GameState): Pulsar | undefined =>
  s.enemies.find((e): e is Pulsar => e.kind === 'pulsar')

/** Dormant far-off nymphs (tp1-6 idiom): they keep NYMCOU up without hatching. */
const nymph = (lane: number, py: number): Nymph => ({ lane, py })
const dormant = (n: number): Nymph[] => Array.from({ length: n }, (_, i) => nymph(i, 30000 + 16 * i))

/** A quiet board: no queue, no spikes, player parked on lane 0. The whole spawn object
 *  is REPLACED (tp1-6 lesson) so no legacy mechanism can counterfeit the observables. */
function base(level: number): GameState {
  const s = playingState(1)
  s.level = level
  s.tube = tubeForLevel(level)
  s.spikes = new Array(s.tube.laneCount).fill(0)
  s.spawn = { nymphs: [] }
  s.player.lane = 0
  s.enemies = []
  return s
}

/** One frame of climb for a lone pulsar at `depth`, measured out of stepGame. */
function climbDelta(level: number, depth: number): number {
  const s = base(level)
  const p = makeEnemy('pulsar', Math.floor(s.tube.laneCount / 2), depth, levelParams(level))
  p.fireCooldown = 999
  s.enemies = [p]
  const q = thePulsar(stepGame(s, NEUTRAL, FRAME))
  expect(q, `climb probe at L${level} depth ${depth}: the pulsar must survive one frame`).toBeDefined()
  return (q as Pulsar).depth - depth
}

/**
 * The wave's climb-speed boundary, DERIVED from the running sim: bisect the depth at
 * which the one-frame climb delta crosses from the fast (far) rate to the slow (near)
 * rate. Guards its own premises — the references must actually be two distinct rates,
 * and must sit on the expected sides — so a wave where the rates coincide (wave 1) or
 * a broken probe fails loudly instead of "finding" a meaningless number.
 */
function climbBoundary(level: number): number {
  const slowRef = climbDelta(level, 0.6)    // in-zone at every wave ($A0 and $C0 alike)
  const fastRef = climbDelta(level, 0.05)   // out-of-zone at every wave
  expect(fastRef, `L${level}: fast/slow rates must be discriminable (fast ${fastRef}, slow ${slowRef})`)
    .toBeGreaterThan(slowRef * 1.5)
  const mid = (slowRef + fastRef) / 2
  let lo = 0.05   // classified fast
  let hi = 0.6    // classified slow
  for (let i = 0; i < 40; i++) {
    const d = (lo + hi) / 2
    if (climbDelta(level, d) < mid) hi = d
    else lo = d
  }
  return (lo + hi) / 2
}

interface DescendTrace { minDepth: number; rose: boolean }

/** Send a lone pulsar DOWN from `from` with nymphs queued (NYMCOU > 0, so only the
 *  PULPOT line can flip it) and report how deep it got before stepGame sent it up. */
function descendTrace(level: number, from: number): DescendTrace {
  let s = base(level)
  const p = makeEnemy('pulsar', Math.floor(s.tube.laneCount / 2), from, levelParams(level))
  p.fireCooldown = 999
  p.direction = -1
  s.enemies = [p]
  s.spawn = { nymphs: dormant(3) }
  let minDepth = from
  let rose = false
  for (let i = 0; i < 400; i++) {
    s = stepGame(s, NEUTRAL, FRAME)
    const q = thePulsar(s)
    expect(q, `descend probe at L${level}: the pulsar must survive`).toBeDefined()
    minDepth = Math.min(minDepth, (q as Pulsar).depth)
    if ((q as Pulsar).direction === 1) { rose = true; break }
  }
  return { minDepth, rose }
}

/**
 * Does a lit pulsar on the Claw's lane at `depth` electrocute him at `level`?
 * (tp1-26's probe, verbatim: force the pulse lit, step ONE frame, read the kill.)
 */
function pulsarKillsAt(level: number, depth: number): boolean {
  const s = base(level)
  s.player.lane = 6
  const p = makeEnemy('pulsar', 6, depth, levelParams(level))
  p.fireCooldown = 999
  p.pulsing = true
  s.pulse.son = 8
  s.enemies = [p]
  return !stepGame(s, NEUTRAL, FRAME).player.alive
}

// Premises, pinned to literals — never to the constant under audit (tp1-27).
describe('tp2-1 — premises: 0.28 is the depth that tells the two bytes apart', () => {
  it('0.28 lies between the $C0 and $A0 zone edges; 0.18 below both', () => {
    expect(0.28).toBeLessThan(ZONE_A0)
    expect(0.28).toBeGreaterThan(ZONE_C0)
    expect(0.18).toBeLessThan(ZONE_C0)
  })
})

// ── AC-2: the CLIMB tier (ALWELG.MAC:1783-1786) ───────────────────────────────────────
describe('tp2-1 — the climb-speed boundary, derived out of the running sim', () => {
  it('sits at the $A0 line for waves below 65 (keep-behavior: 17 and 64)', () => {
    expect(Math.abs(climbBoundary(17) - ZONE_A0), 'wave 17 boundary must be $A0').toBeLessThan(1e-3)
    expect(Math.abs(climbBoundary(64) - ZONE_A0), 'wave 64 boundary must be $A0').toBeLessThan(1e-3)
  })

  it('WIDENS to the $C0 line at wave 65 — the tier tp1-26 deferred', () => {
    const b = climbBoundary(65)
    expect(Math.abs(b - ZONE_C0),
      `wave 65 climb boundary must be $C0 (0.214…), measured ${b} — still the frozen $A0?`)
      .toBeLessThan(1e-3)
  })

  it('a band pulsar (0.28) climbs FAST at wave 64 and SLOW at wave 65', () => {
    // The single-depth restatement of the two boundary pins, readable at a glance.
    const slow64 = climbDelta(64, 0.6)
    const fast64 = climbDelta(64, 0.05)
    const mid64 = (slow64 + fast64) / 2
    expect(climbDelta(64, 0.28), 'wave 64: 0.28 is outside $A0 — flipper rate').toBeGreaterThan(mid64)

    const slow65 = climbDelta(65, 0.6)
    const fast65 = climbDelta(65, 0.05)
    const mid65 = (slow65 + fast65) / 2
    expect(climbDelta(65, 0.28), 'wave 65: 0.28 is inside $C0 — spd_pulsar').toBeLessThan(mid65)
    // Liveness for the slow half: it still MOVES (a frozen pulsar is not "slow").
    expect(climbDelta(65, 0.28)).toBeGreaterThan(0)
  })

  it('the boundary FOLDS past the table end — waves 100 and 150 keep the $C0 line', () => {
    // tp1-25's lesson: the bug lives where the table ends. A naive walk falls off
    // WPULPOT above 99 and the boundary would collapse to a walk-off value.
    expect(Math.abs(climbBoundary(100) - ZONE_C0), 'wave 100 must fold to the $C0 row').toBeLessThan(1e-3)
    expect(Math.abs(climbBoundary(150) - ZONE_C0), 'wave 150 must fold to the $C0 row').toBeLessThan(1e-3)
  })
})

// ── AC-2: the REVERSE tier (ALWELG.MAC:1795) ──────────────────────────────────────────
describe('tp2-1 — the descend-reverse line, derived out of the running sim', () => {
  it('wave 64: reverses AT the $A0 line — and never enters the $C0 band (keep-behavior)', () => {
    const t = descendTrace(64, 0.6)
    expect(t.rose, 'liveness: the descent must end in a reversal').toBe(true)
    expect(t.minDepth, 'it genuinely descends to the line').toBeLessThanOrEqual(ZONE_A0 + 1e-9)
    expect(t.minDepth, 'wave 64 must NOT descend into the $C0 band').toBeGreaterThan(ZONE_A0 - 0.01)
  })

  it('wave 65: descends THROUGH the old $A0 line and reverses at $C0', () => {
    const t = descendTrace(65, 0.6)
    expect(t.rose, 'liveness: the descent must end in a reversal').toBe(true)
    expect(t.minDepth,
      `wave 65 must descend to the $C0 line (0.214…), reached only ${t.minDepth} — reversed at the frozen $A0?`)
      .toBeLessThanOrEqual(ZONE_C0 + 1e-9)
    expect(t.minDepth, 'and not past it — $C0 is the line, not a suggestion').toBeGreaterThan(ZONE_C0 - 0.01)
  })

  it('wave 65: an EMPTY queue still sends it up at once, wherever it is (NYMCOU clause)', () => {
    // Guards the OR: the new lookup must not swallow the 1791-1794 "SEND PULSAR UP".
    let s = base(65)
    const p = makeEnemy('pulsar', Math.floor(s.tube.laneCount / 2), 0.6, levelParams(65))
    p.fireCooldown = 999
    p.direction = -1
    s.enemies = [p]
    for (let i = 0; i < 2; i++) s = stepGame(s, NEUTRAL, FRAME)
    expect(thePulsar(s)?.direction, 'queue empty: up immediately, mid-well').toBe(1)
    expect(thePulsar(s)?.depth ?? 0, 'it never descended to any PULPOT line').toBeGreaterThan(0.5)
  })

  it('the reverse line FOLDS past the table end — wave 100 reverses at $C0', () => {
    const t = descendTrace(100, 0.6)
    expect(t.rose, 'liveness: the descent must end in a reversal').toBe(true)
    expect(t.minDepth, 'wave 100 must fold to the $C0 row').toBeLessThanOrEqual(ZONE_C0 + 1e-9)
    expect(t.minDepth, 'and never walk off the table').toBeGreaterThan(ZONE_C0 - 0.01)
  })
})

// ── AC-3: one byte, one lookup ────────────────────────────────────────────────────────
describe('tp2-1 — PULPOT is ONE number per wave, for motion and kill alike', () => {
  it('PULSAR_NEAR_FAR_DEPTH is retired from rules.ts (the tp1-26 name-split hazard)', () => {
    // Two spellings of one ROM byte is how the grab line shipped wrong (tp1-27). The
    // frozen constant must be GONE, not aliased alongside the wave-parameterised lookup.
    expect((rules as Record<string, unknown>).PULSAR_NEAR_FAR_DEPTH,
      'rules.ts still exports the frozen $A0 constant — retire it in favour of the WPULPOT lookup')
      .toBeUndefined()
  })

  it('motion and kill AGREE at the band depth, on both sides of 65', () => {
    // The behavioural face of "one byte": at 0.28 the kill gate and the climb switch
    // must give the SAME answer about the zone — out at 64, in at 65. The kill halves
    // are tp1-26's shipped behaviour; the climb halves are this story's.
    const slow64 = climbDelta(64, 0.6)
    const fast64 = climbDelta(64, 0.05)
    expect(pulsarKillsAt(64, 0.28), 'wave 64 kill: 0.28 out of zone').toBe(false)
    expect(climbDelta(64, 0.28), 'wave 64 climb: 0.28 out of zone').toBeGreaterThan((slow64 + fast64) / 2)

    const slow65 = climbDelta(65, 0.6)
    const fast65 = climbDelta(65, 0.05)
    expect(pulsarKillsAt(65, 0.28), 'wave 65 kill: 0.28 in zone').toBe(true)
    expect(climbDelta(65, 0.28), 'wave 65 climb: 0.28 in zone').toBeLessThan((slow65 + fast65) / 2)
  })

  it('liveness — the kill probe does fire inside the zone at both waves', () => {
    // Without this, the `false` above could pass because pulsars never kill at all.
    expect(pulsarKillsAt(64, 0.40), 'inside $A0 at wave 64 must kill').toBe(true)
    expect(pulsarKillsAt(65, 0.40), 'inside $C0 at wave 65 must kill').toBe(true)
  })
})
