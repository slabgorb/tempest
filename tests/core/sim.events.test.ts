// tests/core/sim.events.test.ts
//
// RED-phase suite for Story 5-1 — emission behaviour of the pure-core event
// channel through the public `stepGame` API. Major Hochstetter does not care
// HOW the events get into `state.events`; he cares that the right event, with
// the right payload, appears on the exact frame the gameplay moment happens —
// and that NOTHING leaks across frames or diverges on a replay.
//
// Every helper mirrors the existing core suites (sim.collisions / sim.death /
// sim.superzapper / sim.warp-spikes / sim.advance-level) so a GREEN
// implementation only has to emit events from the sites those suites already
// exercise. `state.events` does not exist yet, so this file fails to compile
// today (valid RED).
import { describe, it, expect } from 'vitest'
import { playingState } from './helpers'
import { initialState } from '../../src/core/state'
import type { GameState, Enemy } from '../../src/core/state'
import type { GameEvent } from '../../src/core/events'
import { stepGame, makeEnemy } from '../../src/core/sim'
import type { Input } from '../../src/core/input'
import { currentLane } from '../../src/core/geometry'
import { SPIKE_MAX_DEPTH, MAX_BULLETS, levelParams } from '../../src/core/rules'

const DT = 1 / 60
const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }
const FIRE: Input = { spin: 0, fire: true, zap: false, start: false }
const ZAP: Input = { spin: 0, fire: false, zap: true, start: false }

// Narrow `state.events` to a single variant for assertion. Returns every match
// so a test can assert on count as well as payload.
function eventsOfType<T extends GameEvent['type']>(
  s: GameState, type: T,
): Extract<GameEvent, { type: T }>[] {
  return s.events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type)
}

// A self-contained in-progress level: no pending spawns and a parked spawn timer
// so no stray enemy materialises mid-step and forges an event we did not author.
function playing(enemies: Enemy[]): GameState {
  const s = playingState(1)
  s.spawn = { nymphs: Array.from({ length: 0 }, (_, i) => ({ lane: i, py: 30000 + 16 * i })) }
  s.enemies = enemies
  return s
}

const threeFlippers = (): Enemy[] => [
  makeEnemy('flipper', 1, 0.2, levelParams(1)),
  makeEnemy('flipper', 5, 0.6, levelParams(1)),
  makeEnemy('flipper', 9, 0.9, levelParams(1)),
]

// --- fire (AC3 / AC4) -------------------------------------------------------
describe('fire events', () => {
  it('emits a fire event at the rim when the player fires', () => {
    const s = playing([])
    s.spawn = { nymphs: [{ lane: 0, py: 30000 }] } // keep the empty board OUT of the level-clear path (which wipes bullets)
    s.player.lane = 4
    const out = stepGame(s, FIRE, DT)

    const fires = eventsOfType(out, 'fire')
    expect(fires).toHaveLength(1)
    expect(out.bullets).toHaveLength(1)
    // The cue is keyed to the lane the shot went down, at the near rim (depth 1).
    expect(fires[0].lane).toBe(out.bullets[0].lane)
    expect(fires[0].lane).toBe(currentLane(out.tube, 4))
    expect(fires[0].depth).toBe(1)
  })

  it('emits no fire event on neutral input', () => {
    const out = stepGame(playing([]), NEUTRAL, DT)
    expect(eventsOfType(out, 'fire')).toHaveLength(0)
  })

  it('emits no fire event when the bullet cap is already reached', () => {
    const s = playing([])
    s.spawn = { nymphs: [{ lane: 0, py: 30000 }] } // keep the empty board OUT of the level-clear path (which wipes bullets)
    s.bullets = Array.from({ length: MAX_BULLETS }, () => ({ lane: 0, depth: 0.5 }))
    const out = stepGame(s, FIRE, DT)
    expect(out.bullets).toHaveLength(MAX_BULLETS)   // nothing fired
    expect(eventsOfType(out, 'fire')).toHaveLength(0)
  })

  it('emits no fire event when the player is dead', () => {
    const s = playing([])
    s.player.alive = false
    const out = stepGame(s, FIRE, DT)
    expect(eventsOfType(out, 'fire')).toHaveLength(0)
  })
})

// --- per-frame reset (AC3) --------------------------------------------------
describe('events channel resets every frame', () => {
  it('clears the previous frame\'s events when nothing new happens', () => {
    const fired = stepGame(playing([]), FIRE, DT)
    expect(eventsOfType(fired, 'fire')).toHaveLength(1)   // frame 1 emitted

    const next = stepGame(fired, NEUTRAL, DT)             // frame 2, neutral
    expect(next.events).toEqual([])                       // last frame's fire is gone
  })
})

// --- enemy death by bullet (AC4) -------------------------------------------
describe('enemy-death events from bullets', () => {
  it('emits an enemy-death carrying the killed enemy\'s kind and lane', () => {
    const s = playing([makeEnemy('flipper', 4, 0.5, levelParams(1))])
    s.bullets = [{ lane: 4, depth: 0.5 }]
    const out = stepGame(s, NEUTRAL, DT)

    expect(out.enemies).toHaveLength(0)                  // it really died
    const deaths = eventsOfType(out, 'enemy-death')
    expect(deaths).toHaveLength(1)
    expect(deaths[0].enemyType).toBe('flipper')
    expect(deaths[0].lane).toBe(4)
    expect(deaths[0].depth).toBeCloseTo(0.5, 1)          // at the kill site
  })

  it('emits one enemy-death per enemy killed in a single frame', () => {
    const s = playing([
      makeEnemy('flipper', 2, 0.5, levelParams(1)),
      makeEnemy('tanker', 7, 0.5, levelParams(1), 'flipper'),
    ])
    s.bullets = [{ lane: 2, depth: 0.5 }, { lane: 7, depth: 0.5 }]
    const out = stepGame(s, NEUTRAL, DT)

    const deaths = eventsOfType(out, 'enemy-death')
    expect(deaths).toHaveLength(2)
    expect(deaths.map((d) => d.enemyType).sort()).toEqual(['flipper', 'tanker'])
  })

  it('emits no enemy-death when the bullet misses', () => {
    const s = playing([makeEnemy('flipper', 4, 0.5, levelParams(1))])
    s.bullets = [{ lane: 7, depth: 0.5 }]                // wrong lane
    const out = stepGame(s, NEUTRAL, DT)
    expect(out.enemies).toHaveLength(1)
    expect(eventsOfType(out, 'enemy-death')).toHaveLength(0)
  })
})

// --- superzapper (AC5) ------------------------------------------------------
describe('superzapper events', () => {
  it('a full blast emits one superzapper-activate and an enemy-death per kill across the window (10-2)', () => {
    const s = playing(threeFlippers())
    s.spawn = { nymphs: [{ lane: 0, py: 30000 }] } // keep the emptied board OUT of the level-clear path
    // The first press opens a multi-frame window (10-2): ONE activate fires on the
    // press carrying the total kill count, and the three kills land one-per-frame
    // across the window. Collect the whole window's stream and assert the net.
    let out = stepGame(s, ZAP, DT)
    const activations = [...eventsOfType(out, 'superzapper-activate')]
    const deaths = [...eventsOfType(out, 'enemy-death')]
    for (let i = 0; i < 20 && out.player.zapTimer > 0 && out.mode === 'playing'; i++) {
      out = stepGame(out, NEUTRAL, DT)
      activations.push(...eventsOfType(out, 'superzapper-activate'))
      deaths.push(...eventsOfType(out, 'enemy-death'))
    }

    expect(out.enemies).toHaveLength(0)
    expect(activations).toHaveLength(1)
    expect(activations[0].killCount).toBe(3)
    expect(deaths).toHaveLength(3)
  })

  it('a weak shot emits a superzapper-activate for the single enemy it destroys', () => {
    const s = playing([
      makeEnemy('flipper', 2, 0.3, levelParams(1)),
      makeEnemy('flipper', 7, 0.8, levelParams(1)), // nearest the rim
    ])
    s.player.superzapper = 'used-once'
    const out = stepGame(s, ZAP, DT)

    expect(out.enemies).toHaveLength(1)
    const activations = eventsOfType(out, 'superzapper-activate')
    expect(activations).toHaveLength(1)
    expect(activations[0].killCount).toBe(1)
    expect(eventsOfType(out, 'enemy-death')).toHaveLength(1)
  })

  it('a spent superzapper emits nothing', () => {
    const s = playing(threeFlippers())
    s.player.superzapper = 'spent'
    const out = stepGame(s, ZAP, DT)

    expect(out.enemies).toHaveLength(3)                  // nothing happened
    expect(eventsOfType(out, 'superzapper-activate')).toHaveLength(0)
    expect(eventsOfType(out, 'enemy-death')).toHaveLength(0)
  })
})

// --- player grabbed / pulsed (AC4) -----------------------------------------
describe('player-grab and player-death events', () => {
  it('a flipper at the rim emits player-grab + player-death(cause grab)', () => {
    const s = playing([makeEnemy('flipper', 4, 1, levelParams(1))])
    s.player.lane = 4
    const out = stepGame(s, NEUTRAL, DT)

    expect(out.mode).toBe('dying')                       // the player really died
    const grabs = eventsOfType(out, 'player-grab')
    expect(grabs).toHaveLength(1)
    expect(grabs[0].killedBy).toBe('flipper')
    expect(grabs[0].lane).toBe(currentLane(out.tube, 4))

    const deaths = eventsOfType(out, 'player-death')
    expect(deaths).toHaveLength(1)
    expect(deaths[0].cause).toBe('grab')
  })

  it('a pulsing pulsar on the player lane kills with cause pulse', () => {
    const s = playing([
      { ...makeEnemy('pulsar', 4, 0.5, levelParams(1)), pulsing: true },
    ])
    s.player.lane = 4
    const out = stepGame(s, NEUTRAL, DT)

    expect(out.mode).toBe('dying')
    const deaths = eventsOfType(out, 'player-death')
    expect(deaths).toHaveLength(1)
    expect(deaths[0].cause).toBe('pulse')
    // The pulse is still a grab-channel event, attributed to the pulsar.
    const grabs = eventsOfType(out, 'player-grab')
    expect(grabs).toHaveLength(1)
    expect(grabs[0].killedBy).toBe('pulsar')
  })

  it('emits no death events while the player is safe (enemy below the rim)', () => {
    const s = playing([makeEnemy('flipper', 4, 0.5, levelParams(1))])
    s.player.lane = 4
    const out = stepGame(s, NEUTRAL, DT)
    expect(out.mode).toBe('playing')
    expect(eventsOfType(out, 'player-grab')).toHaveLength(0)
    expect(eventsOfType(out, 'player-death')).toHaveLength(0)
  })
})

// --- warp-spike crash (AC4) -------------------------------------------------
describe('warp-spike-crash events', () => {
  // Step the warp to its resolution; the returned state is the crash frame (it
  // just left 'warp'), so its events are the crash's events.
  function runWarpToCrash(playerLane: number, spikeLane: number): GameState {
    const s = playing([])
    s.bullets = []
    s.mode = 'warp'
    s.warp.progress = 0
    s.player.lane = playerLane
    s.spikes[spikeLane] = SPIKE_MAX_DEPTH
    let out = s
    for (let i = 0; out.mode === 'warp' && i < 1000; i++) out = stepGame(out, NEUTRAL, DT)
    return out
  }

  it('emits warp-spike-crash + player-death(cause spike) on the crash frame', () => {
    const out = runWarpToCrash(4, 4)
    expect(out.mode).toBe('dying')                       // crashed, did not arrive

    const crashes = eventsOfType(out, 'warp-spike-crash')
    expect(crashes).toHaveLength(1)
    expect(crashes[0].lane).toBe(currentLane(out.tube, 4))

    const deaths = eventsOfType(out, 'player-death')
    expect(deaths).toHaveLength(1)
    expect(deaths[0].cause).toBe('spike')
  })

  it('emits no crash event when the spike sits on a different lane', () => {
    const s = playing([])
    s.bullets = []
    s.mode = 'warp'
    s.warp.progress = 0
    s.player.lane = 4
    s.spikes[10] = SPIKE_MAX_DEPTH                        // not the player's lane
    let out = s
    for (let i = 0; out.mode === 'warp' && i < 1000; i++) out = stepGame(out, NEUTRAL, DT)

    expect(out.mode).toBe('playing')                     // sailed through to the next level
    expect(eventsOfType(out, 'warp-spike-crash')).toHaveLength(0)
  })
})

// --- level clear (AC5) ------------------------------------------------------
describe('level-clear events', () => {
  it('emits level-clear with the next level number when the board is cleared', () => {
    const s = playing([])                                // no enemies, no budget → clears
    expect(s.level).toBe(1)
    const out = stepGame(s, NEUTRAL, DT)

    expect(out.mode).toBe('warp')                        // clearing enters the warp
    const clears = eventsOfType(out, 'level-clear')
    expect(clears).toHaveLength(1)
    expect(clears[0].newLevel).toBe(2)                   // advancing 1 → 2
  })

  it('does not emit level-clear while enemies remain', () => {
    const s = playing([makeEnemy('flipper', 3, 0.4, levelParams(1))])
    const out = stepGame(s, NEUTRAL, DT)
    expect(out.mode).toBe('playing')
    expect(eventsOfType(out, 'level-clear')).toHaveLength(0)
  })
})

// --- player spawn (AC1 roster) ---------------------------------------------
describe('player-spawn events', () => {
  it('emits player-spawn on the frame the Claw respawns after a death', () => {
    const s = playing([makeEnemy('flipper', 9, 0.3, levelParams(1))]) // far, survives
    s.player.lane = 4
    s.player.alive = false
    s.mode = 'dying'
    s.player.respawnTimer = 0.01                          // expires within one DT step
    s.warp.progress = 0
    const out = stepGame(s, NEUTRAL, DT)

    expect(out.mode).toBe('playing')
    expect(out.player.alive).toBe(true)
    const spawns = eventsOfType(out, 'player-spawn')
    expect(spawns).toHaveLength(1)
    expect(spawns[0].lane).toBe(currentLane(out.tube, out.player.lane))
  })
})

// --- determinism (AC3 / AC6) ------------------------------------------------
describe('event streams are deterministic', () => {
  it('identical states + identical input produce identical events', () => {
    const a = stepGame(playing(threeFlippers()), ZAP, DT)
    const b = stepGame(playing(threeFlippers()), ZAP, DT)
    expect(a.events.length).toBeGreaterThan(0)           // not vacuously equal-empty
    expect(a.events).toEqual(b.events)
  })

  it('replays an entire RNG-driven session to an identical event stream', () => {
    // Drives the full pipeline: seeded spawns, fires, and the collisions they
    // cause — all of which emit events. Two identical seeds must agree frame
    // for frame, event for event.
    const run = (seed: number): GameEvent[] => {
      let s = initialState(seed)
      s.mode = 'playing'
      const all: GameEvent[] = []
      for (let i = 0; i < 120; i++) {
        s = stepGame(s, i % 10 === 0 ? FIRE : NEUTRAL, DT)
        all.push(...s.events)
      }
      return all
    }
    const a = run(12345)
    const b = run(12345)
    expect(a.length).toBeGreaterThan(0)                  // the session actually produced events
    expect(a).toEqual(b)
  })

  it('does not mutate the input state\'s events when stepping', () => {
    const s = playing(threeFlippers())
    expect(s.events).toEqual([])
    const out = stepGame(s, ZAP, DT)
    expect(out.events.length).toBeGreaterThan(0)         // the step produced events...
    expect(s.events).toEqual([])                         // ...without touching the input
  })
})
