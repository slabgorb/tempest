// tests/core/sim.audio-events.test.ts
//
// RED-phase suite for Story 10-11 — "Sustained/looping sounds + wire unwired
// bakes + warp-audio duration". This pins the PURE-CORE emission contract for the
// five new GameEvents the shell's audio layer will react to:
//
//   - 'spike-shot'       — a player bullet shortened a standing spike (ROM cc51)
//   - 'extra-life'       — a bonus life was awarded at a score threshold (ROM cc11)
//   - 'pulsar-hum-start' — the pulsar population went 0 → >0 (begin the loop)
//   - 'pulsar-hum-stop'  — the pulsar population went >0 → 0 (end the loop)
//   - 'warp-end'         — the dive concluded (completed OR crashed) so the
//                          sustained warp/zoom sound stops with no bleed/silence
//
// O'Brien tests whether the code BREAKS, not whether it passes. Every assertion
// names the exact frame and payload the gameplay moment must produce, and pins
// that NOTHING spurious leaks (no edge when presence is unchanged, no extra-life
// below the threshold, exactly one warp-end per dive). These events do not exist
// in src/core/events.ts yet and sim.ts emits none of them, so the behavioural
// assertions all fail today (valid RED).
import { describe, it, expect } from 'vitest'
import { playingState } from './helpers'
import type { GameState, Enemy } from '../../src/core/state'
import type { GameEvent } from '../../src/core/events'
import { stepGame, makeEnemy } from '../../src/core/sim'
import type { Input } from '../../src/core/input'
import { tubeForLevel } from '../../src/core/geometry'
import { SPIKE_MAX_DEPTH, SCORE_SPIKE_SEGMENT, EXTRA_LIFE_INTERVAL, levelParams } from '../../src/core/rules'

const DT = 1 / 60
const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }

// Narrow `state.events` to a single variant; returns every match so a test can
// assert on COUNT as well as payload (one event, not "at least one").
function eventsOfType<T extends GameEvent['type']>(
  s: GameState, type: T,
): Extract<GameEvent, { type: T }>[] {
  return s.events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type)
}

// A self-contained in-progress level: a parked spawn budget (remaining: 1, timer
// far in the future) so the empty board never trips the level-clear path (which
// wipes bullets and enters warp) and no stray enemy materialises mid-step to
// forge an event we did not author.
function playing(enemies: Enemy[]): GameState {
  const s = playingState(1)
  s.spawn = { nymphs: Array.from({ length: 1 }, (_, i) => ({ lane: i, py: 30000 + 16 * i })) }
  s.player.lane = 0
  s.enemies = enemies
  return s
}

const aPulsar = (lane: number, depth: number): Enemy => ({
  ...makeEnemy('pulsar', lane, depth, levelParams(1)), pulsing: false,
})

// A freshly-cleared 'playing' state (no enemies, empty budget) that enters warp
// on the next step — mirrors sim.advance-level.test.ts's clearedAtLevel.
function clearedAtLevel(level: number, playerLane: number): GameState {
  const tube = tubeForLevel(level)
  const s = playingState(1)
  s.level = level
  s.tube = tube
  s.spikes = new Array(tube.laneCount).fill(0)
  s.player.lane = playerLane
  s.spawn = { nymphs: [] }
  s.enemies = []
  return s
}

// --- spike-shot (AC2) -------------------------------------------------------
describe('spike-shot events (AC2: wire ROM cc51 to spike hits)', () => {
  it('emits exactly one spike-shot, keyed to the lane, when a bullet shortens a spike', () => {
    const s = playing([])
    s.spikes[4] = SPIKE_MAX_DEPTH
    s.bullets = [{ lane: 4, depth: 0.5 }] // depth <= spike height → a hit
    const out = stepGame(s, NEUTRAL, DT)

    // tp1-15/W-047: the charge cuts the tip to its OWN depth (not a flat SPIKE_SHORTEN).
    expect(out.spikes[4]).toBeLessThan(SPIKE_MAX_DEPTH) // it really hit
    const hits = eventsOfType(out, 'spike-shot')
    expect(hits).toHaveLength(1) // one bite this frame → one cue
    expect(hits[0].lane).toBe(4)
  })

  it('emits no spike-shot when the bullet is on a lane with no spike', () => {
    const s = playing([])
    s.spikes[4] = 0 // no spike here
    s.bullets = [{ lane: 4, depth: 0.5 }]
    const out = stepGame(s, NEUTRAL, DT)
    expect(eventsOfType(out, 'spike-shot')).toHaveLength(0)
  })

  it('emits one spike-shot per spike shortened in a single frame', () => {
    const s = playing([])
    s.spikes[3] = SPIKE_MAX_DEPTH
    s.spikes[8] = SPIKE_MAX_DEPTH
    s.bullets = [{ lane: 3, depth: 0.5 }, { lane: 8, depth: 0.5 }]
    const out = stepGame(s, NEUTRAL, DT)
    const hits = eventsOfType(out, 'spike-shot')
    expect(hits).toHaveLength(2)
    expect(new Set(hits.map((h) => h.lane))).toEqual(new Set([3, 8]))
  })
})

// --- extra-life (AC2) -------------------------------------------------------
describe('extra-life events (AC2: wire ROM cc11 to bonus-life awards)', () => {
  it('emits exactly one extra-life when the score crosses the bonus threshold', () => {
    const s = playing([])
    s.score = EXTRA_LIFE_INTERVAL - 1 // 9999: a single award tips it over 10000
    s.lives = 3
    s.spikes[4] = SPIKE_MAX_DEPTH
    s.bullets = [{ lane: 4, depth: 0.5 }] // SCORE_SPIKE_SEGMENT (3) → score 10002
    const out = stepGame(s, NEUTRAL, DT)

    expect(out.score).toBe(EXTRA_LIFE_INTERVAL - 1 + SCORE_SPIKE_SEGMENT) // crossed
    expect(out.lives).toBe(4) // life actually granted
    const awards = eventsOfType(out, 'extra-life')
    expect(awards).toHaveLength(1)
    expect(awards[0].count).toBe(1) // one life added this frame
  })

  it('emits no extra-life when an award does NOT cross a threshold', () => {
    const s = playing([])
    s.score = 0
    s.lives = 3
    s.spikes[4] = SPIKE_MAX_DEPTH
    s.bullets = [{ lane: 4, depth: 0.5 }] // score 0 → 3, no threshold crossed
    const out = stepGame(s, NEUTRAL, DT)
    expect(out.lives).toBe(3)
    expect(eventsOfType(out, 'extra-life')).toHaveLength(0)
  })
})

// --- pulsar-hum edges (AC1) -------------------------------------------------
describe('pulsar-hum loop edges (AC1: loop while a pulsar is present)', () => {
  it('emits pulsar-hum-start the frame the first pulsar appears (0 → >0)', () => {
    // A tanker carrying a pulsar reaches split depth and bursts into pulsars this
    // frame: the board had NO pulsar before the step and HAS one after — the edge.
    const tanker: Enemy = makeEnemy('tanker', 8, 0.95, levelParams(1), 'pulsar')
    const s = playing([tanker])
    const out = stepGame(s, NEUTRAL, DT)

    expect(out.enemies.some((e) => e.kind === 'pulsar')).toBe(true) // pulsars appeared
    expect(eventsOfType(out, 'pulsar-hum-start')).toHaveLength(1)
    expect(eventsOfType(out, 'pulsar-hum-stop')).toHaveLength(0)
  })

  it('emits pulsar-hum-stop the frame the last pulsar is killed (>0 → 0)', () => {
    const s = playing([aPulsar(4, 0.5)])
    s.bullets = [{ lane: 4, depth: 0.5 }] // kills the only pulsar
    const out = stepGame(s, NEUTRAL, DT)

    expect(out.enemies.some((e) => e.kind === 'pulsar')).toBe(false) // none remain
    expect(eventsOfType(out, 'pulsar-hum-stop')).toHaveLength(1)
    expect(eventsOfType(out, 'pulsar-hum-start')).toHaveLength(0)
  })

  it('emits NEITHER edge while a pulsar simply persists frame-to-frame', () => {
    const s = playing([aPulsar(4, 0.5)])
    const out = stepGame(s, NEUTRAL, DT)
    expect(out.enemies.some((e) => e.kind === 'pulsar')).toBe(true) // still present
    expect(eventsOfType(out, 'pulsar-hum-start')).toHaveLength(0)
    expect(eventsOfType(out, 'pulsar-hum-stop')).toHaveLength(0)
  })

  it('emits NEITHER edge when no pulsar is ever on the board', () => {
    const s = playing([makeEnemy('flipper', 4, 0.5, levelParams(1))])
    const out = stepGame(s, NEUTRAL, DT)
    expect(eventsOfType(out, 'pulsar-hum-start')).toHaveLength(0)
    expect(eventsOfType(out, 'pulsar-hum-stop')).toHaveLength(0)
  })
})

// --- warp-end (AC3: warp sound spans the dive) ------------------------------
describe('warp-end events (AC3: the warp sound spans the dive, no bleed/silence)', () => {
  it('still emits level-clear on warp entry (the sustained sound starts here)', () => {
    const out = stepGame(clearedAtLevel(1, 0), NEUTRAL, DT)
    expect(out.mode).toBe('warp')
    expect(eventsOfType(out, 'level-clear')).toHaveLength(1)
  })

  // tp1-10 (WD-017/WD-018) + tp1-13 (S-014) UNIFIED: the sustained thrust drone spans the
  // WHOLE dive as two phases — T2 (in-well) from warp-descent-start, handed over to T3
  // (space) at the bottom-crossing (warp-space), and stopped by ONE warp-end at the
  // fly-in's END, exactly as play resumes. The intent is unchanged: exactly ONE warp-end
  // across the dive (no bleed/silence). The capture is re-keyed onto the frame warp-end is
  // actually emitted — now the ARRIVAL frame (mode → 'playing'), not the descent bottom
  // (which now emits warp-space to hand the drone over to T3, not warp-end).
  it('emits exactly one warp-end, on the frame the dive completes (play resumes)', () => {
    let s = stepGame(clearedAtLevel(1, 0), NEUTRAL, DT) // enter warp
    expect(s.mode).toBe('warp')

    let totalEnds = 0
    let endsWhenEmitted = -1
    let modeWhenEmitted = ''
    for (let i = 0; i < 1000 && s.mode !== 'playing'; i++) {
      s = stepGame(s, NEUTRAL, DT)
      const ends = eventsOfType(s, 'warp-end').length
      totalEnds += ends
      if (ends > 0) {
        endsWhenEmitted = ends
        modeWhenEmitted = s.mode // the fly-in has completed — play resumes on this frame
      }
    }
    expect(s.mode).toBe('playing') // the dive really finished (descent + fly-in)
    expect(totalEnds).toBe(1) // one stop signal across the whole dive — no bleed
    expect(endsWhenEmitted).toBe(1) // emitted exactly once, as the dive ends
    expect(modeWhenEmitted).toBe('playing') // warp-end coincides with play resuming (fly-in end)
  })

  it('emits a warp-end on a mid-dive spike crash (the loop stops, no runaway hum)', () => {
    const s0 = clearedAtLevel(1, 4)
    s0.spikes[4] = SPIKE_MAX_DEPTH // a spike on the player's dive lane → crash
    let s = stepGame(s0, NEUTRAL, DT) // enter warp
    expect(s.mode).toBe('warp')

    let endsOnCrash = -1
    for (let i = 0; i < 1000 && s.mode === 'warp'; i++) {
      s = stepGame(s, NEUTRAL, DT)
      if (eventsOfType(s, 'warp-spike-crash').length > 0) {
        endsOnCrash = eventsOfType(s, 'warp-end').length
        break
      }
    }
    expect(endsOnCrash).toBe(1) // the crash frame stops the warp loop
  })
})

// --- determinism (AC4: pure data, deterministic) ----------------------------
describe('audio events are deterministic (AC4: pure core)', () => {
  it('produces an identical event stream for identical inputs', () => {
    const build = (): GameState => {
      const s = playing([aPulsar(4, 0.5)])
      s.bullets = [{ lane: 4, depth: 0.5 }]
      s.score = EXTRA_LIFE_INTERVAL - 1
      s.spikes[7] = SPIKE_MAX_DEPTH
      s.bullets.push({ lane: 7, depth: 0.5 })
      return s
    }
    const a = stepGame(build(), NEUTRAL, DT)
    const b = stepGame(build(), NEUTRAL, DT)
    expect(a.events).toEqual(b.events) // same moments, same payloads, same order
  })
})
