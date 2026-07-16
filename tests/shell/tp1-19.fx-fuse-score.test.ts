// tests/shell/tp1-19.fx-fuse-score.test.ts
//
// Story tp1-19 — the fuseball score pop-up's WIRING (its digits and colour live in
// tp1-19.shapes.test.ts against fuseScoreGlyph), mirroring tp1-18's shapes/fx split.
//
// V-022: FUSEX1/2/3 (ALVROM.MAC:1096-1114) are not explosion pictures — they are the
// WHITE score number that blooms where a fuseball dies, wired into the ROM's picture
// list by `PITAB FUSEX1,PTFUSX ;FUSE EXPLOSION` (ALVROM.MAC:2148-2150). The finding's
// own words for our side: "We render no floating score text anywhere."
//
// WHY THIS FILE EXISTS: tp1-19's first review found this wiring had ZERO coverage —
// deleting the `enemyType === 'fuseball'` line from fx.ts passed all 1540 tests. The
// glyph existed and was exported, so the shapes suite was green, but nothing
// connected a fuseball's death to it. A test that only proves a value-producer exists
// does not prove the game shows it.
//
// The number shown must be the number AWARDED: the tier is read through the same
// `fuseballScore` the sim scores with. tp1-21 replaces that rule with the ROM's
// weighted random roll — these tests are written against the RULE, not against a
// hard-coded depth band, so they should survive it.
import { describe, it, expect } from 'vitest'
import { createFx, type Explosion } from '../../src/shell/fx'
import { initialState, type EnemyKind } from '../../src/core/state'
import { project } from '../../src/core/geometry'
import { fuseballScore } from '../../src/core/rules'
import { FUSE_SCORE_TIERS } from '../../src/shell/glyphs'
import type { GameEvent } from '../../src/core/events'

const FRAME = 1 / 60

// One quiet seed frame so prevAlive/prevBullets are established (the fx.explosions
// convention — see fx.explosions.test.ts).
function seeded() {
  const s = initialState(1)
  const fx = createFx()
  fx.detect(s, FRAME, [])
  return { s, fx }
}

const death = (enemyType: EnemyKind, lane: number, depth: number): GameEvent => ({
  type: 'enemy-death', enemyType, lane, depth,
})

const scorePops = (fx: { explosions: readonly Explosion[] }): Extract<Explosion, { kind: 'fuse-score' }>[] =>
  fx.explosions.filter((e): e is Extract<Explosion, { kind: 'fuse-score' }> => e.kind === 'fuse-score')

describe('V-022 wiring — a dying fuseball blooms its score (ALVROM.MAC:2148)', () => {
  it('spawns a fuse-score pop-up on a fuseball death', () => {
    const { s, fx } = seeded()
    expect(scorePops(fx), 'nothing before the kill').toHaveLength(0)
    fx.detect(s, FRAME, [death('fuseball', 3, 0.5)])
    expect(scorePops(fx), 'the arcade tells you what the kill was worth').toHaveLength(1)
  })

  it('places it AT the kill, alongside the normal burst — the ROM draws both', () => {
    const { s, fx } = seeded()
    fx.detect(s, FRAME, [death('fuseball', 3, 0.5)])
    const at = project(s.tube, 3, 0.5)
    const pop = scorePops(fx)[0]
    expect(pop.x).toBeCloseTo(at.x, 5)
    expect(pop.y).toBeCloseTo(at.y, 5)
    // The score is ADDITIONAL to the 16-spoke burst, not a replacement for it.
    expect(fx.explosions.some((e) => e.kind === 'enemy'), 'the burst still fires').toBe(true)
  })

  it('shows the tier the SIM actually awarded — not a guess', () => {
    // The pop-up's tier must resolve to fuseballScore(depth) at every depth, so the
    // number on screen is the number added to the score. Sweep the whole range.
    for (const depth of [0, 0.1, 0.32, 0.34, 0.5, 0.66, 0.67, 0.9, 1]) {
      const { s, fx } = seeded()
      fx.detect(s, FRAME, [death('fuseball', 2, depth)])
      const pop = scorePops(fx)[0]
      expect(pop, `a pop-up at depth ${depth}`).toBeDefined()
      expect(FUSE_SCORE_TIERS[pop.tier], `depth ${depth} shows the awarded score`)
        .toBe(fuseballScore(depth))
    }
  })

  it('reaches all three ROM tiers across the depth range — 750 / 500 / 250', () => {
    const seen = new Set<number>()
    for (let d = 0; d <= 1; d += 0.02) {
      const { s, fx } = seeded()
      fx.detect(s, FRAME, [death('fuseball', 1, d)])
      seen.add(FUSE_SCORE_TIERS[scorePops(fx)[0].tier])
    }
    expect([...seen].sort((a, b) => b - a), 'FUSEX1/2/3 all reachable').toEqual([750, 500, 250])
  })

  it('ONLY the fuseball scores a pop-up — no other enemy does', () => {
    // FUSEX is the fuseball's picture alone; PITAB has no equivalent for the others.
    for (const kind of ['flipper', 'tanker', 'spiker', 'pulsar'] as const) {
      const { s, fx } = seeded()
      fx.detect(s, FRAME, [death(kind, 3, 0.5)])
      expect(scorePops(fx), `${kind} must not bloom a score`).toHaveLength(0)
      expect(fx.explosions.some((e) => e.kind === 'enemy'), `${kind} still bursts`).toBe(true)
    }
  })

  it('ages out and is collected — it must not pile up across a wave', () => {
    const { s, fx } = seeded()
    fx.detect(s, FRAME, [death('fuseball', 3, 0.5)])
    const pop = scorePops(fx)[0]
    expect(pop.life).toBeGreaterThan(0)
    expect(pop.max).toBe(pop.life)
    // Age it past its life (update() owns the timers, detect() only spawns).
    const frames = Math.ceil(pop.max / FRAME) + 2
    for (let i = 0; i < frames; i++) fx.update(FRAME)
    expect(scorePops(fx), 'the pop-up expires').toHaveLength(0)
  })

  it('several fuseball kills each get their own number', () => {
    const { s, fx } = seeded()
    fx.detect(s, FRAME, [death('fuseball', 1, 0.2), death('fuseball', 5, 0.8)])
    expect(scorePops(fx)).toHaveLength(2)
  })
})

describe('V-022 wiring — the renderer draws it', () => {
  it('render.ts routes the fuse-score kind to its own draw', async () => {
    // The union grew to four kinds; drawExplosions' dispatch must not let the new
    // one fall into the spark branch (which would draw a yellow cross, not a number).
    const renderSrc = (await import('../../src/shell/render.ts?raw')).default
    expect(renderSrc).toMatch(/kind\s*===\s*'spark'/)
    expect(renderSrc).toMatch(/\bdrawFuseScore\b/)
    expect(renderSrc).toMatch(/fuseScoreGlyph\s*\(\s*ex\.tier\s*\)/)
  })
})
