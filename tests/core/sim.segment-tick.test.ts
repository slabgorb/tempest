// tests/core/sim.segment-tick.test.ts
//
// RED-phase suite for Story 6-10 — the authentic segment_tick cue. On the real
// arcade the POKEY ticks once each time the spinner carries the cursor across a
// tube-segment boundary as the Claw rotates around the rim. The pure core must
// surface that exact moment as a deterministic `segment-cross` GameEvent so the
// shell (audio.ts manifest + main.ts event pump) can play the baked
// segment_tick.wav on it — mirroring every other event->sound cue (5-1 / 6-6).
//
// The 'segment-cross' variant is not in the GameEvent union yet, so no event is
// emitted and the lane assertions below fail: valid RED. Dev turns this green by
// emitting the event from stepPlayer whenever the resolved DISCRETE lane changes
// (currentLane before != currentLane after). That is the only src/core change
// this story authorises.
import { describe, it, expect } from 'vitest'
import { playingState } from './helpers'
import { stepGame } from '../../src/core/sim'
import type { GameState } from '../../src/core/state'
import type { Input } from '../../src/core/input'
import { currentLane } from '../../src/core/geometry'
import { SPIN_SENSITIVITY } from '../../src/core/rules'

const DT = 1 / 60
const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }

// Loosely-typed read of the discriminant: the 'segment-cross' variant is absent
// from the GameEvent union pre-GREEN, so the strict eventsOfType<> helper used by
// the sister suites cannot narrow it. Filtering structurally lets these tests RUN
// (and FAIL on the empty result) under vitest rather than only erroring in tsc.
function segmentCrosses(s: GameState): { type: string; lane: number }[] {
  return s.events.filter(
    (e) => (e as { type: string }).type === 'segment-cross',
  ) as unknown as { type: string; lane: number }[]
}

// A board that isolates pure rotation: no enemies to grab the Claw, a parked
// spawn timer + leftover budget so nothing spawns AND the empty board never trips
// the level-clear -> warp path. Only the spinner can move the cursor here.
function rotatable(seed: number): GameState {
  const s = playingState(seed)
  s.player.lane = 0
  s.enemies = []
  s.spawn = { remaining: 5, timer: 999 }
  return s
}

// SPIN_SENSITIVITY = 0.15, so in ONE frame: spin 4 -> +0.60 lane units (rounds
// 0 -> 1, a real crossing); spin 3 -> +0.45 (still rounds to 0 — sub-segment).
const CROSS_SPIN = 4
const SUBSEGMENT_SPIN = 3

describe('segment-cross events (story 6-10: authentic segment_tick)', () => {
  it('emits a segment-cross when the spinner carries the Claw into a new lane', () => {
    const out = stepGame(rotatable(7), { ...NEUTRAL, spin: CROSS_SPIN }, DT)

    const crosses = segmentCrosses(out)
    expect(crosses).toHaveLength(1)
    // The cue is keyed to the NEW discrete lane the cursor entered.
    expect(crosses[0].lane).toBe(currentLane(out.tube, out.player.lane))
    expect(crosses[0].lane).toBe(1)
  })

  it('reports the wrapped lane when rotating backwards across the seam', () => {
    const out = stepGame(rotatable(7), { ...NEUTRAL, spin: -CROSS_SPIN }, DT)

    const crosses = segmentCrosses(out)
    expect(crosses).toHaveLength(1)
    // Wrapped into [0, laneCount): lane 15, never -1 or 16.
    expect(crosses[0].lane).toBe(currentLane(out.tube, out.player.lane))
    expect(crosses[0].lane).toBe(15)
  })

  it('stays silent while the cursor moves within the same segment', () => {
    const out = stepGame(rotatable(7), { ...NEUTRAL, spin: SUBSEGMENT_SPIN }, DT)

    // The cursor really moved...
    expect(out.player.lane).toBeCloseTo(SPIN_SENSITIVITY * SUBSEGMENT_SPIN)
    // ...but not far enough to round into a new lane, so no tick.
    expect(segmentCrosses(out)).toHaveLength(0)
  })

  it('emits no segment-cross when the spinner is idle', () => {
    const out = stepGame(rotatable(7), NEUTRAL, DT)
    expect(segmentCrosses(out)).toHaveLength(0)
  })

  it('emits no segment-cross while the Claw is dead', () => {
    const s = rotatable(7)
    s.player.alive = false
    const out = stepGame(s, { ...NEUTRAL, spin: CROSS_SPIN }, DT)
    expect(segmentCrosses(out)).toHaveLength(0)
  })

  it('ticks exactly once per lane crossed over a multi-frame rotation', () => {
    // Drift the cursor steadily and count a tick each time the discrete lane
    // actually advances. The tick count must track lane changes one-for-one —
    // never double-firing within a segment, never missing a crossing.
    let s = rotatable(7)
    let ticks = 0
    let lanesChanged = 0
    let prevLane = currentLane(s.tube, s.player.lane)
    for (let i = 0; i < 60; i++) {
      s = stepGame(s, { ...NEUTRAL, spin: 1 }, DT)
      ticks += segmentCrosses(s).length
      const lane = currentLane(s.tube, s.player.lane)
      if (lane !== prevLane) lanesChanged++
      prevLane = lane
    }
    expect(lanesChanged).toBeGreaterThan(0) // the walk genuinely crossed segments
    expect(ticks).toBe(lanesChanged) // one tick per crossing, no more, no fewer
  })

  it('is deterministic: identical seed + input → identical segment-cross stream', () => {
    const run = (): { type: string; lane: number }[] => {
      let s = rotatable(99)
      const all: { type: string; lane: number }[] = []
      for (let i = 0; i < 30; i++) {
        s = stepGame(s, { ...NEUTRAL, spin: 2 }, DT)
        all.push(...segmentCrosses(s))
      }
      return all
    }
    const a = run()
    const b = run()
    expect(a.length).toBeGreaterThan(0) // not vacuously equal-empty
    expect(a).toEqual(b)
  })

  it('does not leak the segment-cross onto the input state', () => {
    const s = rotatable(7)
    expect(s.events).toEqual([])
    const out = stepGame(s, { ...NEUTRAL, spin: CROSS_SPIN }, DT)
    expect(segmentCrosses(out)).toHaveLength(1) // the step produced it...
    expect(s.events).toEqual([]) // ...without touching the input frame
  })
})
