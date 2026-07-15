// tests/core/sim.warp-ramp.test.ts
//
// RED-phase suite for Story 6-1 — "Slow→fast warp ramp on level-clear
// (no instant warp-death)".
//
// Deckard trusts nothing the playtest didn't bleed for. Today stepWarp flies the
// Claw down the tube at a CONSTANT speed (rules.WARP_SPEED): progress += dt*2, a
// flat ~0.5s ride. So when the last enemy dies while you're parked on a spiked
// lane, the Claw reaches the spike in ~0.13s — below human reaction time — and
// you die "with no chance to react" (the bug this story exists to kill).
//
// The authentic ROM (rev-3) instead runs an ACCELERATING dive (slow start, ramps
// up, ~0.55–0.75s total) and, when a spike exists at displayed level ≤ 7, fronts
// it with a ~0.5s AVOID SPIKES countdown so you can rotate clear first. Full
// rotation control is retained the whole descent.
//
// These tests pin the OBSERVABLE contract through the public stepGame API only —
// mode, warp.progress, lives, level, player.lane. They deliberately assume
// NOTHING about the state shape Dev adds (warning timer, sub-phase, velocity
// field…). They also guard the repo's hard invariant: the core stays pure,
// deterministic, and dt-driven.
import { describe, it, expect } from 'vitest'
import { playingState } from './helpers'
import type { GameState } from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { currentLane, tubeForLevel } from '../../src/core/geometry'
import type { Input } from '../../src/core/input'
import { SPIKE_MAX_DEPTH, START_LIVES } from '../../src/core/rules'

const DT = 1 / 60
const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }
const spinInput = (spin: number): Input => ({ spin, fire: false, zap: false, start: false })

// A realistic human reaction delay: ~0.25s of doing nothing before the player
// even starts to move. The OLD constant warp crashes a parked player on a
// SPIKE_MAX_DEPTH spike at ~frame 8 (~0.13s) — inside this window — so any test
// that relies on reacting after this delay FAILS on the constant warp and only
// passes once a slow-start/countdown grace exists.
const REACTION_FRAMES = 15

// Build a freshly-cleared 'playing' state at `level` (budget spent, no enemies/
// bullets, tube + spikes sized to the level) and optionally lay spikes. One
// neutral step then runs the REAL level-clear → warp entry path (checkLevelClear)
// so any countdown/warning Dev wires at entry actually engages.
function clearedPlaying(
  level: number, playerLane: number, spikes: ReadonlyArray<readonly [number, number]> = [],
): GameState {
  const tube = tubeForLevel(level)
  const s = playingState(1)
  s.level = level
  s.tube = tube
  s.spikes = new Array(tube.laneCount).fill(0)
  s.player.lane = playerLane
  s.spawn = { nymphs: [] }
  s.enemies = []
  s.bullets = []
  for (const [lane, h] of spikes) s.spikes[lane] = h
  return s
}

function enterWarp(
  level: number, playerLane: number, spikes: ReadonlyArray<readonly [number, number]> = [],
): GameState {
  const s = stepGame(clearedPlaying(level, playerLane, spikes), NEUTRAL, DT)
  // Sanity: the clear step entered the warp at the rim and has NOT yet stepped it.
  expect(s.mode).toBe('warp')
  expect(s.warp.progress).toBe(0)
  return s
}

// Run neutral until the warp resolves (crash → leaves 'warp', or completion →
// 'playing'). Bounded so a never-resolving bug fails loudly. Returns the frames
// spent in the warp.
function runWarp(s: GameState, input: Input = NEUTRAL): { state: GameState; frames: number } {
  let frames = 0
  while (s.mode === 'warp' && frames < 2000) {
    s = stepGame(s, input, DT)
    frames++
  }
  return { state: s, frames }
}

describe('warp ramp — accelerating descent, not constant speed (AC1, AC5)', () => {
  it('accelerates the dive: per-frame progress deltas grow over the descent', () => {
    // No spikes ⇒ no countdown ⇒ a clean dive that isolates the SPEED CURVE.
    let s = enterWarp(1, 4)
    const samples: number[] = [s.warp.progress] // starts at 0
    // tp1-10 (WD-018): sample only the DESCENT. After it bottoms out the warp enters
    // the post-descent EYE FLY-IN (mode stays 'warp', warp.flyIn > 0, progress reset),
    // whose frames are not part of the speed curve — stop when the fly-in begins.
    for (let i = 0; i < 2000 && s.mode === 'warp' && (s.warp.flyIn ?? 0) === 0; i++) {
      s = stepGame(s, NEUTRAL, DT)
      if (s.mode === 'warp' && (s.warp.flyIn ?? 0) === 0) samples.push(s.warp.progress)
    }
    expect((s.warp.flyIn ?? 0) > 0).toBe(true) // the descent actually bottomed out
    // ...and the whole warp still converges to normal play on the next wave.
    for (let i = 0; i < 200 && s.mode !== 'playing'; i++) s = stepGame(s, NEUTRAL, DT)
    expect(s.mode).toBe('playing')

    const deltas: number[] = []
    for (let i = 1; i < samples.length; i++) deltas.push(samples[i] - samples[i - 1])
    expect(deltas.length).toBeGreaterThanOrEqual(3) // a multi-frame ramp, not a jump

    // Monotonic non-decreasing speed (a true ramp — never slows mid-dive)...
    for (let i = 1; i < deltas.length; i++) {
      expect(deltas[i]).toBeGreaterThanOrEqual(deltas[i - 1] - 1e-9)
    }
    // ...and meaningfully FASTER by the end than at the start. A constant-speed
    // warp (the current bug) has equal deltas and fails this outright.
    expect(deltas[deltas.length - 1]).toBeGreaterThan(deltas[0] * 1.5)
  })

  it('keeps the spinner live deep into the accelerating descent (AC5)', () => {
    // Drive several frames into the dive (past any slow start), then rotate.
    let s = enterWarp(1, 4)
    for (let i = 0; i < 8 && s.mode === 'warp'; i++) s = stepGame(s, NEUTRAL, DT)
    expect(s.mode).toBe('warp') // still mid-dive, so this means something
    const before = s.player.lane
    const out = stepGame(s, spinInput(5), DT)
    expect(out.player.lane).not.toBe(before) // full rotation control retained
  })
})

describe('warp ramp — survivable spike on level-clear (AC2, AC3)', () => {
  it('lets a parked player on a spiked lane survive by reacting then steering off', () => {
    // The keystone bug fix. Player is parked on lane 4 with a max-height spike
    // when the level clears. They react after a realistic ~0.25s delay, then spin
    // off the spiked lane. The constant warp crashes them DURING the reaction
    // delay; a slow-start/countdown gives them the window to escape.
    let s = enterWarp(1, 4, [[4, SPIKE_MAX_DEPTH]])

    // 1) Human reaction delay — do nothing.
    for (let i = 0; i < REACTION_FRAMES && s.mode === 'warp'; i++) s = stepGame(s, NEUTRAL, DT)
    // 2) Rotate off lane 4 at a normal spinner rate, then hold.
    for (let i = 0; i < 60 && s.mode === 'warp'; i++) {
      const clear = currentLane(s.tube, s.player.lane) !== 4
      s = stepGame(s, clear ? NEUTRAL : spinInput(3), DT)
    }
    // 3) Ride the rest of the dive out.
    const { state } = runWarp(s)

    expect(state.mode).toBe('playing')        // survived and arrived
    expect(state.lives).toBe(START_LIVES)     // no life lost
    expect(state.level).toBe(2)               // advanced to the next geometry
  })

  it('still crashes a parked player who never steers off the spiked lane (AC3 — grace is a window, not immunity)', () => {
    // The slow ramp grants TIME, not invulnerability: a player who sits on the
    // spike eats it once the descending Claw passes the tip on their own lane.
    const { state, frames } = runWarp(enterWarp(1, 4, [[4, SPIKE_MAX_DEPTH]]))
    expect(state.mode).toBe('dying')          // crashed mid-warp, did not arrive
    expect(state.lives).toBe(START_LIVES - 1) // a life was spent
    expect(state.level).toBe(1)               // no advance
    expect(frames).toBeLessThan(2000)         // actually resolved
  })

  it('ignores a spike on a lane other than the player\'s throughout the ramp (own-segment only)', () => {
    // Lanes 0 and 10 spiked to the cap; the player on lane 4 rides the full
    // accelerating dive untouched — the kill keys off the player's OWN segment.
    const { state } = runWarp(enterWarp(1, 4, [[0, SPIKE_MAX_DEPTH], [10, SPIKE_MAX_DEPTH]]))
    expect(state.mode).toBe('playing')
    expect(state.lives).toBe(START_LIVES)
    expect(state.level).toBe(2)
  })
})

describe('warp ramp — AVOID SPIKES countdown gating by displayed level (AC5)', () => {
  // A parked player on a max spike. With the countdown (spike present AND level
  // ≤ 7) the crash is delayed by the warning; above 7 there is NO warning so the
  // dive — and the crash — come sooner. The constant warp has no countdown at any
  // level, so its crash frame is identical everywhere and these gaps collapse.
  function framesToCrash(level: number): number {
    const { state, frames } = runWarp(enterWarp(level, 4, [[4, SPIKE_MAX_DEPTH]]))
    expect(state.mode).not.toBe('playing') // it crashed rather than completing
    expect(frames).toBeLessThan(2000)
    return frames
  }

  it('delays the crash at level 1 (countdown shown) well beyond level 8 (no countdown)', () => {
    const atLevel1 = framesToCrash(1) // ≤ 7 ⇒ ~0.5s AVOID SPIKES countdown precedes the dive
    const atLevel8 = framesToCrash(8) // > 7 ⇒ no countdown, dive starts immediately
    // The ~0.5s countdown ≈ 30 frames; require a comfortably-attributable margin.
    expect(atLevel1).toBeGreaterThan(atLevel8 + 15)
  })

  it('honors the exact ≤7 boundary: level 7 gets the countdown, level 8 does not', () => {
    const atLevel7 = framesToCrash(7) // boundary — still warned
    const atLevel8 = framesToCrash(8) // boundary — no longer warned
    expect(atLevel7).toBeGreaterThan(atLevel8 + 15)
  })
})

describe('warp ramp — pure, deterministic, dt-driven core (AC4)', () => {
  it('produces byte-identical state for identical inputs (determinism)', () => {
    const scenario = (): GameState => {
      let s = enterWarp(1, 4, [[4, SPIKE_MAX_DEPTH]])
      for (let i = 0; i < REACTION_FRAMES && s.mode === 'warp'; i++) s = stepGame(s, NEUTRAL, DT)
      for (let i = 0; i < 60 && s.mode === 'warp'; i++) {
        const clear = currentLane(s.tube, s.player.lane) !== 4
        s = stepGame(s, clear ? NEUTRAL : spinInput(3), DT)
      }
      return runWarp(s).state
    }
    expect(scenario()).toEqual(scenario())
  })

  it('does not mutate its input state on a warp step (cloneState must clone any new warp fields)', () => {
    const s = enterWarp(1, 4, [[4, SPIKE_MAX_DEPTH]])
    const snapshot = structuredClone(s)
    stepGame(s, NEUTRAL, DT) // result intentionally discarded
    expect(s).toEqual(snapshot) // input untouched — purity at the warp boundary
  })

  it('is frame-rate independent: total descent time barely moves across dt (no spikes)', () => {
    // Only the DESCENT is dt-scaled (warpAccel × dt), so only it is wall-clock stable.
    // The post-descent eye fly-in (tp1-37) is a frame COUNT — the qframe convention, like
    // tp1-31's per-frame camera slide (stepCamera) — so its wall-time is tied to the step
    // rate by design and must NOT be folded into this dt-independence check. Measure the
    // descent up to the bottom (where beginFlyIn arms flyIn), before the fly-in begins.
    const descentSeconds = (dt: number): number => {
      let s = enterWarp(1, 4)
      let t = 0
      for (let i = 0; i < 5000 && s.mode === 'warp' && (s.warp.flyIn ?? 0) === 0; i++) {
        s = stepGame(s, NEUTRAL, dt)
        t += dt
      }
      // Reached the bottom within budget at this dt: the fly-in is armed (or, defensively,
      // play already resumed) — either way the dt-scaled descent has completed.
      expect((s.warp.flyIn ?? 0) > 0 || s.mode === 'playing').toBe(true)
      return t
    }
    const at60 = descentSeconds(1 / 60)
    const at120 = descentSeconds(1 / 120)
    // dt-driven integration should converge: the two totals agree within 15%.
    expect(Math.abs(at60 - at120)).toBeLessThan(at60 * 0.15)
  })
})
