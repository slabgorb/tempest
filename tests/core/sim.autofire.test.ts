// tests/core/sim.autofire.test.ts
//
// Story 6-2: consistent, faster auto-fire cadence for spin-and-hold.
//
// These are the SEEDED, deterministic CORE tests the story's AC4 requires. The
// pure core is the place cadence and the recycle rate live (the shell only
// decides *when* `fire` is held — see tests/shell/input.test.ts). The contract
// (ROM rev-3): NO artificial fire cooldown; a new shot spawns whenever fire is
// held AND a slot is free, capped at MAX_BULLETS (8) concurrent player shots;
// shots free their slot at the far end after ~25 frames / ~0.42s, so the 8-slot
// pool recycles at the arcade rate.
import { describe, it, expect } from 'vitest'
import { GameState } from '../../src/core/state'
import { playingState } from './helpers'
import { stepGame } from '../../src/core/sim'
import { Input } from '../../src/core/input'
import { MAX_BULLETS, BULLET_SPEED, ROM_FPS, SIM_STEP } from '../../src/core/rules'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }
const HOLD: Input = { spin: 0, fire: true, zap: false, start: false }
const DT = 1 / 60

// An isolated 'playing' state for exercising the fire path: no enemies (so no
// bullet↔enemy collisions skew the count) but the level cannot clear — a large
// remaining budget with a far-future spawn timer keeps mode === 'playing'
// without ever actually spawning an enemy inside the test window.
function firingState(seed: number): GameState {
  const s = playingState(seed)
  s.enemies = []
  s.spawn.remaining = 99
  s.spawn.timer = 9999
  return s
}

// Lifetime (seconds) of a single shot fired from the rim, measured by stepping
// at `dt` until the bullet frees its slot. dt-driven, so this is the recycle
// rate of one of the 8 pool slots.
function bulletLifetimeSeconds(dt: number): number {
  let s = firingState(1)
  s = stepGame(s, HOLD, dt) // spawn exactly one shot...
  let t = dt
  while (s.bullets.length > 0) {
    s = stepGame(s, NEUTRAL, dt) // ...then stop firing and watch it travel out
    t += dt
  }
  return t
}

// Depth of a single in-flight shot after `seconds` of simulated time, stepped in
// `dt`-sized chunks. Travel is linear in dt, so this is exact (unlike a lifetime
// measured in whole steps, which is quantized to ±1 step and noisy across dt).
function bulletDepthAfter(seconds: number, dt: number): number {
  let s = firingState(1)
  s = stepGame(s, HOLD, dt) // spawn at the rim (counts as the first dt of travel)
  const remainingSteps = Math.round((seconds - dt) / dt)
  for (let i = 0; i < remainingSteps; i++) s = stepGame(s, NEUTRAL, dt)
  expect(s.bullets.length, 'shot must still be in flight at the sample time').toBe(1)
  return s.bullets[0].depth
}

describe('auto-fire cadence (core)', () => {
  // AC5: one shot per sim tick while held — no artificial multi-frame gap below
  // the cap. Holding fire from empty must add exactly one shot every tick.
  it('spawns exactly one shot per tick while held, with no skipped frames, up to the cap', () => {
    let s = firingState(1)
    for (let tick = 1; tick <= MAX_BULLETS; tick++) {
      s = stepGame(s, HOLD, DT)
      expect(s.bullets.length, `tick ${tick} should have ${tick} shots in flight`).toBe(tick)
    }
  })

  // AC5: the cap is exactly MAX_BULLETS and is never exceeded, however long fire
  // is held. The cap is reached (it is the gating lever, not a cooldown).
  it('caps concurrent shots at MAX_BULLETS and never exceeds it while held', () => {
    let s = firingState(2)
    let peak = 0
    for (let i = 0; i < 120; i++) {
      s = stepGame(s, HOLD, DT)
      expect(s.bullets.length).toBeLessThanOrEqual(MAX_BULLETS)
      peak = Math.max(peak, s.bullets.length)
    }
    expect(peak).toBe(MAX_BULLETS)
  })

  // AC1/AC5: a slot freed by an expiring shot is reusable on the very next tick —
  // there is no multi-tick dead gap in the cadence. Once saturated, holding fire
  // keeps the in-flight count pinned at the cap (or one below, for the single
  // tick between an expiry and its refill) and it always recovers to the cap.
  it('reuses a freed slot on the next tick (no multi-frame gap once saturated)', () => {
    let s = firingState(3)
    for (let i = 0; i < MAX_BULLETS; i++) s = stepGame(s, HOLD, DT)
    expect(s.bullets.length).toBe(MAX_BULLETS)

    let recoveredToCap = false
    for (let i = 0; i < 120; i++) {
      s = stepGame(s, HOLD, DT)
      expect(s.bullets.length).toBeGreaterThanOrEqual(MAX_BULLETS - 1)
      expect(s.bullets.length).toBeLessThanOrEqual(MAX_BULLETS)
      if (s.bullets.length === MAX_BULLETS) recoveredToCap = true
    }
    expect(recoveredToCap, 'a freed slot is refilled back to the cap').toBe(true)
  })

  // AC2: holding fire through a one-lane-per-tick spin sweep lands a shot on
  // every lane the Claw passes — no lane is skipped. (Pure-core proof of the
  // sweep mechanic; the felt fix that keeps `fire` held every frame lives in the
  // shell — see tests/shell/input.test.ts.)
  it('fires on every lane during a one-lane-per-tick sweep (no skipped lanes)', () => {
    let s = firingState(1)
    const firedLanes: number[] = []
    for (let lane = 0; lane < 6; lane++) {
      s.player.lane = lane
      s = stepGame(s, HOLD, DT)
      const ev = s.events.find((e) => e.type === 'fire')
      expect(ev, `expected a shot on lane ${lane}`).toBeDefined()
      if (ev && ev.type === 'fire') firedLanes.push(ev.lane)
    }
    expect(firedLanes).toEqual([0, 1, 2, 3, 4, 5])
  })
})

describe('auto-fire determinism & recycle rate (core)', () => {
  // AC4: cadence is deterministic for a fixed seed and input sequence.
  it('produces an identical shot-count sequence for a fixed seed and inputs', () => {
    const run = (): number[] => {
      let s = firingState(7)
      const counts: number[] = []
      for (let i = 0; i < 40; i++) {
        s = stepGame(s, HOLD, DT)
        counts.push(s.bullets.length)
      }
      return counts
    }
    expect(run()).toEqual(run())
  })

  // AC4: cadence is dt-driven, so a shot travels the same distance per unit time
  // whether the sim is stepped at 60 Hz or 120 Hz — frame-rate independent.
  it('travels a frame-rate-independent (dt-driven) distance per unit time', () => {
    expect(bulletDepthAfter(0.2, 1 / 60)).toBeCloseTo(bulletDepthAfter(0.2, 1 / 120), 6)
  })

  // AC5: bullet speed verified — the pool must recycle at the arcade rate. The ROM
  // frees a shot's slot after ~25 FRAMES from the rim.
  //
  // REBASED BY tp1-1. The 25 frames is ROM truth and has not moved. The "~0.42s" this
  // test used to demand was just 25/60 — the invented clock again. At the real rate 25
  // ROM frames is 25/28.44 = 0.879 s, and BULLET_SPEED (9 along/frame x ROM_FPS = 8/7
  // depth/s) crosses the well in 1/(8/7) = 0.875 s. The frame count was right all
  // along; only its conversion to seconds was wrong.
  it('recycles the shot pool at the arcade rate (~25 ROM frames = ~0.88s, not 0.42s)', () => {
    const expected = 1 / BULLET_SPEED                       // 0.875 s
    expect(expected * ROM_FPS).toBeCloseTo(25, 0)           // ...which IS the ROM's ~25 frames
    const lifetime = bulletLifetimeSeconds(SIM_STEP)
    expect(lifetime).toBeLessThanOrEqual(expected * 1.06)
    expect(lifetime).toBeGreaterThanOrEqual(expected * 0.94)
  })
})
