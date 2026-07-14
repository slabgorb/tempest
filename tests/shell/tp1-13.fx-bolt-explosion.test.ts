// tests/shell/tp1-13.fx-bolt-explosion.test.ts
//
// Story tp1-13, AC-3 (audit S-013): a player shot destroying an enemy bolt gets
// its explosion, not just its sound. The ROM's INCCSQ pairs CCEXPL (the EX cue)
// with GENEXP at the SHOT's coordinates (ALWELG.MAC:2797-2809) — the same
// explosion machinery an enemy kill uses. Our fx layer already spawns the
// authentic 16-spoke EnemyBurst off 'enemy-death' events (fx.ts detect); the new
// 'bolt-destroyed' event must feed the same burst at the destroyed bolt's spot.
//
// The event does not exist and fx.detect ignores unknown events silently (its
// handler is an `if` chain, not an exhaustive switch), so these fail today (RED).
import { describe, it, expect } from 'vitest'
import { createFx, type EnemyBurst } from '../../src/shell/fx'
import { initialState } from '../../src/core/state'
import { project } from '../../src/core/geometry'
import type { GameEvent } from '../../src/core/events'

const FRAME = 1 / 60

// One quiet seed frame so prevAlive/prevBullets are established (the same
// staging as tests/shell/fx.explosions.test.ts).
function seeded() {
  const s = initialState(1)
  const fx = createFx()
  fx.detect(s, FRAME, [])
  return { s, fx }
}

const enemyBursts = (fx: ReturnType<typeof createFx>): EnemyBurst[] =>
  fx.explosions.filter((e): e is EnemyBurst => e.kind === 'enemy')

describe('tp1-13 AC-3 — a destroyed bolt explodes (S-013)', () => {
  it('spawns one enemy-style burst at the destroyed bolt\'s projected position', () => {
    const { s, fx } = seeded()
    const boltDown: GameEvent = { type: 'bolt-destroyed', lane: 3, depth: 0.55 }
    fx.detect(s, FRAME, [boltDown])

    const bursts = enemyBursts(fx)
    expect(bursts, 'one collision, one burst').toHaveLength(1)
    const where = project(s.tube, 3, 0.55)
    expect(bursts[0].x).toBeCloseTo(where.x, 5)
    expect(bursts[0].y).toBeCloseTo(where.y, 5)
  })

  it('spawns one burst per bolt when two are shot down on the same frame', () => {
    const { s, fx } = seeded()
    const a: GameEvent = { type: 'bolt-destroyed', lane: 2, depth: 0.4 }
    const b: GameEvent = { type: 'bolt-destroyed', lane: 10, depth: 0.7 }
    fx.detect(s, FRAME, [a, b])
    expect(enemyBursts(fx)).toHaveLength(2)
  })

  it('spawns nothing without the event — no heuristic double-fire', () => {
    // The old bullet-vanish heuristic sparks are point particles, not structured
    // explosions; the structured burst must be driven by the event alone.
    const { s, fx } = seeded()
    fx.detect(s, FRAME, [])
    expect(enemyBursts(fx)).toHaveLength(0)
  })
})
