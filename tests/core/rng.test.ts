import { describe, it, expect } from 'vitest'
import { makeRng, rngNext, rngInt } from '../../src/core/rng'

describe('rng', () => {
  it('is deterministic for the same seed', () => {
    expect(rngNext(makeRng(42)).value).toBe(rngNext(makeRng(42)).value)
  })

  it('produces values in [0, 1)', () => {
    let r = makeRng(1)
    for (let i = 0; i < 200; i++) {
      const n = rngNext(r)
      expect(n.value).toBeGreaterThanOrEqual(0)
      expect(n.value).toBeLessThan(1)
      r = n.rng
    }
  })

  it('advances: consecutive values differ', () => {
    const first = rngNext(makeRng(5))
    const second = rngNext(first.rng)
    expect(first.value).not.toBe(second.value)
  })

  it('rngInt returns integers in [0, max)', () => {
    let r = makeRng(7)
    for (let i = 0; i < 200; i++) {
      const n = rngInt(r, 16)
      expect(Number.isInteger(n.value)).toBe(true)
      expect(n.value).toBeGreaterThanOrEqual(0)
      expect(n.value).toBeLessThan(16)
      r = n.rng
    }
  })

  it('does not mutate the input state', () => {
    const r = makeRng(99)
    const before = r.s
    rngNext(r)
    expect(r.s).toBe(before)
  })

  it('different seeds usually differ', () => {
    expect(rngNext(makeRng(1)).value).not.toBe(rngNext(makeRng(2)).value)
  })
})
