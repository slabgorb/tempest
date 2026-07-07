// tests/core/enemies/pulsar.test.ts
import { describe, it, expect } from 'vitest'
import { playingState } from '../helpers'
import { stepGame } from '../../../src/core/sim'
import { Input } from '../../../src/core/input'
import { stepPulsar } from '../../../src/core/enemies/pulsar'
import { levelParams } from '../../../src/core/rules'
import { createRng } from '@arcade/shared/rng'
import { makeCircleTube } from '../../../src/core/geometry'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }
const tube = makeCircleTube(16, { x: 0, y: 0 }, 60, 300)
const params = levelParams(1)

describe('stepPulsar', () => {
  it('climbs toward the rim', () => {
    const out = stepPulsar({ kind: 'pulsar', lane: 5, depth: 0.3, flipTimer: 999, pulseTimer: 999, pulsing: false }, 1 / 60, params, tube, createRng(1))
    expect(out.enemy.depth).toBeGreaterThan(0.3)
  })

  it('flips to an adjacent lane when its flip timer elapses', () => {
    const out = stepPulsar({ kind: 'pulsar', lane: 5, depth: 0.3, flipTimer: 0.001, pulseTimer: 999, pulsing: false }, 1 / 60, params, tube, createRng(1))
    expect(Math.abs(out.enemy.lane - 5)).toBe(1)
  })

  it('toggles into the pulsing state when its pulse timer elapses', () => {
    const out = stepPulsar({ kind: 'pulsar', lane: 5, depth: 0.3, flipTimer: 999, pulseTimer: 0.001, pulsing: false }, 1 / 60, params, tube, createRng(1))
    expect(out.enemy.pulsing).toBe(true)
  })
})

describe('pulsar pulse kills the player', () => {
  it('kills the player when a pulse fires on the player lane', () => {
    const s = playingState(1)
    s.spawn.remaining = 0
    s.player.lane = 4
    s.enemies = [{ kind: 'pulsar', lane: 4, depth: 0.4, flipTimer: 999, pulseTimer: 0.001, pulsing: false }]
    const out = stepGame(s, NEUTRAL, 1 / 60) // pulse toggles on, player shares the lane
    expect(out.mode).toBe('dying')
    expect(out.lives).toBe(2)
  })

  it('does not kill when not pulsing', () => {
    const s = playingState(1)
    s.spawn.remaining = 0
    s.player.lane = 4
    s.enemies = [{ kind: 'pulsar', lane: 4, depth: 0.4, flipTimer: 999, pulseTimer: 999, pulsing: false }]
    const out = stepGame(s, NEUTRAL, 1 / 60)
    expect(out.mode).toBe('playing')
    expect(out.lives).toBe(3)
  })
})
