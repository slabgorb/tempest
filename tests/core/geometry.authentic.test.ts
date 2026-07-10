// tests/core/geometry.authentic.test.ts
//
// Story 6-7: the 16-geometry roster reconciled to the AUTHENTIC rev-3 ROM well
// shapes (tempest.a65:13734-13814 — lev_x/lev_y/lev_open/lev_remap). Survey:
// docs/ux/2026-06-27-tempest-geometry-rom-survey.md. These pin the arcade's
// topology cycle, lane counts, the level->shape order, and the figure-8 litmus.
import { describe, it, expect } from 'vitest'
import { tubeForLevel, project } from '../../src/core/geometry'

const roster = Array.from({ length: 16 }, (_, i) => tubeForLevel(i + 1))

describe('authentic roster — topology (open/closed) cycle', () => {
  it('matches the arcade pattern CCCCCCC OOOO CC OO C (10 closed, 6 open)', () => {
    const pattern = roster.map((t) => (t.closed ? 'C' : 'O')).join('')
    expect(pattern).toBe('CCCCCCCOOOOCCOOC')
  })

  it('closed wells have 16 lanes, open wells have 15', () => {
    for (const t of roster) {
      expect(t.laneCount).toBe(t.closed ? 16 : 15)
    }
  })

  it('every well carries exactly 16 rim points on each rim', () => {
    for (const t of roster) {
      expect(t.far).toHaveLength(16)
      expect(t.near).toHaveLength(16)
    }
  })
})

describe('figure-8 (level 16) — the litmus self-crossing well', () => {
  const f8 = tubeForLevel(16)

  it('is a closed 16-lane well', () => {
    expect(f8.closed).toBe(true)
    expect(f8.laneCount).toBe(16)
  })

  it('passes through the origin twice: seg0 and seg8 coincide at the centre', () => {
    expect(f8.near[0].x).toBeCloseTo(f8.near[8].x)
    expect(f8.near[0].y).toBeCloseTo(f8.near[8].y)
    expect(f8.near[0].x).toBeCloseTo(0)
    expect(f8.near[0].y).toBeCloseTo(0)
    expect(f8.far[0].x).toBeCloseTo(f8.far[8].x)
    expect(f8.far[0].y).toBeCloseTo(f8.far[8].y)
  })

  it('remains render-safe (finite) on every lane and depth despite the crossing', () => {
    for (let lane = 0; lane < f8.laneCount; lane++) {
      for (const depth of [0, 0.5, 1]) {
        const p = project(f8, lane, depth)
        expect(Number.isFinite(p.x)).toBe(true)
        expect(Number.isFinite(p.y)).toBe(true)
      }
    }
  })
})

describe('authentic shapes — spot checks vs the ROM tables', () => {
  const radii = (lvl: number): number[] =>
    tubeForLevel(lvl).near.map((p) => Math.hypot(p.x, p.y))

  it('level 1 is a circle (near-constant rim radius)', () => {
    const r = radii(1)
    expect(Math.max(...r) - Math.min(...r)).toBeLessThan(10)
  })

  it('level 6 is a triangle, not a circle (strong rim-radius variation)', () => {
    const r = radii(6)
    expect(Math.max(...r) - Math.min(...r)).toBeGreaterThan(50)
  })

  it('level 11 is an open, flat horizontal line (all rim points share a y)', () => {
    const t = tubeForLevel(11)
    expect(t.closed).toBe(false)
    const ys = t.near.map((p) => p.y)
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(0, 1)
  })
})

describe('level -> shape cycle order matches lev_remap', () => {
  it('levels 1-7 are closed, then level 8 is the first open well', () => {
    for (let lvl = 1; lvl <= 7; lvl++) expect(tubeForLevel(lvl).closed).toBe(true)
    expect(tubeForLevel(8).closed).toBe(false)
  })

  it('cycles with period 16 (same shape 16 levels apart)', () => {
    for (let lvl = 1; lvl <= 16; lvl++) {
      expect(tubeForLevel(lvl)).toBe(tubeForLevel(lvl + 16))
    }
  })
})
