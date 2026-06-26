import { describe, it, expect } from 'vitest'
import { playingState } from './helpers'
import { stepGame } from '../../src/core/sim'
import { Input } from '../../src/core/input'
import { rollSpawnKind } from '../../src/core/rules'
import { makeRng } from '../../src/core/rng'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }

function spawnedKinds(level: number, seed: number): Set<string> {
  let s = playingState(seed)
  s.level = level
  s.spawn = { remaining: 40, timer: 0 }
  const kinds = new Set<string>()
  for (let i = 0; i < 6000; i++) {
    s = stepGame(s, NEUTRAL, 1 / 60)
    for (const e of s.enemies) kinds.add(e.kind)
  }
  return kinds
}

describe('rollSpawnKind', () => {
  it('only rolls flippers at level 1', () => {
    let r = makeRng(123)
    for (let i = 0; i < 100; i++) {
      const res = rollSpawnKind(1, r)
      expect(res.kind).toBe('flipper')
      r = res.rng
    }
  })

  it('introduces tankers and spikers by level 3', () => {
    let r = makeRng(123)
    const kinds = new Set<string>()
    for (let i = 0; i < 200; i++) {
      const res = rollSpawnKind(3, r)
      kinds.add(res.kind)
      r = res.rng
    }
    expect(kinds.has('tanker')).toBe(true)
    expect(kinds.has('spiker')).toBe(true)
  })
})

describe('spawn mix through the sim', () => {
  it('level 1 spawns only flippers', () => {
    expect(spawnedKinds(1, 1)).toEqual(new Set(['flipper']))
  })

  it('a high level spawns a varied roster', () => {
    const kinds = spawnedKinds(6, 1)
    expect(kinds.size).toBeGreaterThan(1)
    expect(kinds.has('flipper')).toBe(true)
  })
})
