// tests/core/tp1-11.spike-max-depth.test.ts
//
// RED — tp1-11 (findings W-039 / B-006): restore SPIKE_MAX_DEPTH to the ROM's
// 0.929, overturning the story-6-15 playability deviation (0.75) per the PM
// ruling of 2026-07-13. Sequenced behind tp1-10, whose warp-dive replay makes a
// 0.929 spike FAIR — a crash replays the wave instead of costing a life outright.
//
// ROM: JSTRAI (ALWELG.MAC:2214-2229) writes the climbing spiker's INVAY straight
// into LINEY (the spike's tip) whenever it is higher, THEN clamps INVAY to $20
// and reverses. LINEY is bounded ONLY by that $20 turnaround, so a full-grown
// spike reaches depth (0xf0-$20)/224 ≈ 0.929 — the SAME $20 that already drives
// our SPIKER_TURNAROUND_DEPTH. Today interpreter.ts:332 clamps the stored spike
// to SPIKE_MAX_DEPTH = 0.75, so the last ~0.18 of the spiker's climb lays no
// spike at all. The audit's ruling: "the cap and the turnaround should be the
// same $20" (W-039). This suite pins that reunification.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { playingState } from './helpers'
import type { GameState } from '../../src/core/state'
import { stepGame, makeEnemy } from '../../src/core/sim'
import type { Input } from '../../src/core/input'
import { SPIKE_MAX_DEPTH, SPIKER_TURNAROUND_DEPTH, levelParams, START_LIVES } from '../../src/core/rules'

const DT = 1 / 60
const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }

// The ROM $20 near-turnaround as an INDEPENDENT literal derivation (0xf0, 0x20,
// 224 written raw), so the value pins below never collapse into a tautology
// against the very constant they are checking (the tp1-27 lesson).
const ROM_SPIKE_DEPTH = (0xf0 - 0x20) / 224 // 208/224 ≈ 0.9286

// ── AC-1: the constant ───────────────────────────────────────────────────────
describe('tp1-11 AC-1 — SPIKE_MAX_DEPTH is the ROM 0.929, not the 0.75 deviation', () => {
  it('is the ROM depth ≈ 0.929, raised from the retired 0.75 playability cap', () => {
    expect(SPIKE_MAX_DEPTH, 'the 6-15 deviation is overturned').toBeGreaterThan(0.75)
    expect(SPIKE_MAX_DEPTH, "the ROM's $20 depth to 3 places").toBeCloseTo(0.929, 3)
    expect(SPIKE_MAX_DEPTH, 'exactly the raw-derived (0xf0-0x20)/224').toBeCloseTo(ROM_SPIKE_DEPTH, 10)
  })

  it('caps the spike exactly where the spiker turns around — ONE shared $20', () => {
    // W-039 / B-006 agree: the ROM has a single cap (INVAY clamped to $20)
    // governing BOTH the spiker's turnaround and the spike's drawn height. After
    // the restore they must be the same value; today they diverge (0.75 vs 0.929).
    expect(SPIKE_MAX_DEPTH).toBe(SPIKER_TURNAROUND_DEPTH)
  })
})

// ── AC-1 behavioural: the laid spike reaches the full ROM depth ──────────────
// A board frozen except for a single spiker climbing on its lane: the Claw parked
// on the far side, no other enemies/bullets, and a pending spawn budget so the
// spiker keeps spiking instead of converting to a tanker at the far end (6-15).
function loneSpiker(seed: number, lane: number): GameState {
  const s = playingState(seed)
  s.level = 1
  s.player.lane = (lane + 8) % s.tube.laneCount
  s.enemies = [makeEnemy('spiker', lane, 0.0, levelParams(1))]
  s.bullets = []
  s.spawn = { nymphs: Array.from({ length: 5 }, (_, i) => ({ lane: i, py: 30000 + 16 * i })) }
  s.spikes = new Array(s.tube.laneCount).fill(0)
  return s
}

function spikePeak(s: GameState, lane: number, frames = 500): number {
  let peak = 0
  for (let i = 0; i < frames; i++) {
    s = stepGame(s, NEUTRAL, DT)
    peak = Math.max(peak, s.spikes[lane])
  }
  return peak
}

describe('tp1-11 AC-1 — a climbing spiker lays a spike to the full ROM depth', () => {
  it('grows the spike PAST the retired 0.75 cap, up to the ≈0.929 turnaround', () => {
    const lane = 5
    const peak = spikePeak(loneSpiker(3, lane), lane)
    expect(peak, 'the spiker must actually lay a spike (liveness)').toBeGreaterThan(0.1)
    expect(peak, 'the spike climbs past the retired 0.75 cap').toBeGreaterThan(0.8)
    expect(peak, 'and reaches the ROM $20 depth ≈ 0.929').toBeCloseTo(0.929, 2)
  })

  it('does not grow the spike PAST the spiker turnaround — a raised cap is not NO cap', () => {
    const lane = 7
    const peak = spikePeak(loneSpiker(4, lane), lane)
    expect(peak, 'still reached the cap (liveness + past 0.75)').toBeGreaterThan(0.8)
    expect(peak, 'never deeper than the $20 turnaround toward the rim')
      .toBeLessThanOrEqual(SPIKER_TURNAROUND_DEPTH + 1e-9)
  })
})

// ── AC-3 hard gate: a full-depth (0.929) warp crash still REPLAYS the wave ────
// The PM sequenced this behind tp1-10 precisely because 0.929 is only FAIR if a
// dive crash replays the wave rather than costing a life outright. This guards
// that tp1-10's mechanic still holds at the RESTORED depth — the spike is pinned
// to a LITERAL 0.929, independent of the constant, so it proves the gate for the
// value this story installs.
function warpCrashAtDeepSpike(lane: number, lives?: number): GameState {
  const s = playingState(1)
  s.spawn = { nymphs: [] }
  s.enemies = []
  s.bullets = []
  s.mode = 'warp'
  s.warp = { progress: 0, velocity: 0, warning: 0 }
  s.player.lane = lane
  if (lives !== undefined) s.lives = lives
  s.spikes = new Array(s.tube.laneCount).fill(0)
  s.spikes[lane] = 0.929 // the near-lethal restored ROM spike, as a raw literal
  return s
}

function runUntilRespawned(s: GameState, bound = 600): { state: GameState; steps: number } {
  let steps = 0
  let sawDying = false
  while (steps < bound) {
    s = stepGame(s, NEUTRAL, DT)
    steps++
    if (s.mode === 'dying') sawDying = true
    if (s.mode === 'gameover') break
    if (sawDying && s.mode === 'playing') break
  }
  return { state: s, steps }
}

describe('tp1-11 AC-3 — a 0.929 spike crash replays the wave (tp1-10 gate holds)', () => {
  it('crashes, spends exactly one life, and REPLAYS level 1 — not a promotion, not a drain', () => {
    const { state, steps } = runUntilRespawned(warpCrashAtDeepSpike(4))
    expect(state.mode).toBe('playing')
    expect(state.level, 'the same wave replays — NOT promoted to 2').toBe(1)
    expect(state.lives, 'one crash costs exactly one life').toBe(START_LIVES - 1)
    expect(state.spikes.every((h) => h === 0), 'board re-init clears the well').toBe(true)
    expect(steps, 'resolved — no re-crash drain loop').toBeLessThan(600)
  })
})

// ── AC-2: the deviation note is REPLACED with the overturned-ruling record ────
describe('tp1-11 AC-2 — rules.ts records the ruling that OVERTURNED the deviation', () => {
  const rulesSrc = readFileSync(new URL('../../src/core/rules.ts', import.meta.url), 'utf8')

  it('no longer declares SPIKE_MAX_DEPTH = 0.75', () => {
    expect(rulesSrc).not.toMatch(/SPIKE_MAX_DEPTH\s*=\s*0\.75/)
  })

  it('records the 2026-07-13 PM ruling that overturned the 6-15 deviation (not silently deleted)', () => {
    expect(rulesSrc, 'the ruling date must be recorded').toMatch(/2026-07-13/)
    expect(rulesSrc, 'the note must say the deviation was OVERTURNED').toMatch(/overturn/i)
  })
})
