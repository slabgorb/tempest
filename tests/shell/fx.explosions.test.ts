// tests/shell/fx.explosions.test.ts
//
// Story 10-5 — RED suite for authentic vector explosions.
//
// Today fx.ts fakes both death effects with the generic particle `burst()`:
//   • Enemy death → 12 random particles, spawned off a bullet-vanish heuristic
//     (fx.ts:62-76). No structure, no spokes, no expansion frames.
//   • Player death → two fixed-colour bursts (#ffe800 / #ff5a3c) with NO cycling
//     (fx.ts:82-83).
//
// The book documents something far more specific:
//   • Enemy death ("explosions one to four"): a 16-SPOKE star that doubles in
//     size across ~4 frames (scale 1, 2, 4, 8) with a two-tier brightness ramp
//     7 → 14.
//   • Player death ("splat control"): a concentric JAGGED star that GROWS THEN
//     SHRINKS while its colour cycles white → red → yellow (ROTCOL) EACH FRAME.
//
// A flat list of fixed-colour point particles cannot express "16 spokes", a
// discrete 4-frame scale-doubling, a two-tier brightness ramp, a grow-then-shrink
// radius, or a per-frame colour cycle. So this suite pins a STRUCTURED surface the
// renderer can draw and tests can observe — a new readonly `fx.explosions`
// collection of a `kind`-discriminated union:
//
//   interface EnemyBurst  { kind: 'enemy';  x; y; spokes: 16; scale; brightness; life; max }
//   interface PlayerSplat { kind: 'player'; x; y; spokes;     radius; color;      life; max }
//   type Explosion = EnemyBurst | PlayerSplat
//   Fx.explosions: readonly Explosion[]
//
// The enemy burst is keyed off the explicit `enemy-death` EVENT (which carries
// lane/depth/kind — exactly what placement needs), replacing the bullet-vanish
// heuristic. The player splat replaces the twin death bursts but the red death
// FLASH + shake are preserved (AC4 — existing cues keep working).
//
// These fail against today's fx.ts (no `explosions` property at all) and pass once
// the structured explosions land.
import { describe, it, expect } from 'vitest'
import { createFx } from '../../src/shell/fx'
import { initialState } from '../../src/core/state'
import { project, currentLane } from '../../src/core/geometry'
import type { GameEvent } from '../../src/core/events'

const FRAME = 1 / 60

// Authentic geometry / palette contract (the values the renderer must honour).
const ENEMY_SPOKES = 16
const ENEMY_SCALE_STEPS = [1, 2, 4, 8] // doubling each frame
const ENEMY_BRIGHTNESS_TIERS = [7, 14] // two-tier ramp, dim then bright
const MIN_JAGGED_POINTS = 8 // a "jagged star", not a smooth ring

// Canonical white / red / yellow for the ROTCOL splat cycle.
const SPLAT_WHITE = '#ffffff'
const SPLAT_RED = '#ff0000'
const SPLAT_YELLOW = '#ffff00'

// Existing death-flash colour (must survive — AC4).
const DEATH_RED = '#ff5a3c'

function dedupeConsecutive<T>(arr: readonly T[]): T[] {
  return arr.filter((v, i) => i === 0 || v !== arr[i - 1])
}

// One quiet seed frame so prevAlive/prevBullets are established and nothing has
// fired yet (player alive, no bullets, no events ⇒ no explosions).
function seeded() {
  const s = initialState(1)
  const fx = createFx()
  fx.detect(s, FRAME, [])
  return { s, fx }
}

const enemyDeath = (lane: number, depth: number): GameEvent => ({
  type: 'enemy-death',
  enemyType: 'flipper',
  lane,
  depth,
})

// Step `update` frame-by-frame, snapshotting the single explosion of `kind` each
// frame while it lives (frame 0 = post-detect, pre-update). Stops when it expires.
function trackExplosion(
  fx: ReturnType<typeof createFx>,
  kind: 'enemy' | 'player',
  maxFrames = 240,
): Array<Record<string, number | string>> {
  // `explosions` is the new surface under test; typed loosely here so the suite
  // runs (RED) before the interface exists.
  const find = () =>
    (fx as unknown as { explosions: ReadonlyArray<Record<string, number | string>> }).explosions?.find(
      (e) => e.kind === kind,
    )
  const samples: Array<Record<string, number | string>> = []
  const first = find()
  if (first) samples.push({ ...first })
  for (let i = 0; i < maxFrames; i++) {
    fx.update(FRAME)
    const e = find()
    if (!e) break // expired — stop sampling
    samples.push({ ...e })
  }
  return samples
}

const explosionsOf = (fx: ReturnType<typeof createFx>, kind: 'enemy' | 'player') =>
  ((fx as unknown as { explosions?: ReadonlyArray<Record<string, unknown>> }).explosions ?? []).filter(
    (e) => e.kind === kind,
  )

describe('fx enemy-death explosion — 16-spoke star (Story 10-5 AC1)', () => {
  it('spawns one 16-spoke enemy burst on the enemy-death event, at the event location', () => {
    const { s, fx } = seeded()
    fx.detect(s, FRAME, [enemyDeath(2, 0.5)])

    const bursts = explosionsOf(fx, 'enemy')
    expect(bursts.length).toBe(1)

    const burst = bursts[0] as Record<string, number>
    expect(burst.spokes).toBe(ENEMY_SPOKES)

    const pos = project(s.tube, 2, 0.5)
    expect(burst.x).toBeCloseTo(pos.x, 1)
    expect(burst.y).toBeCloseTo(pos.y, 1)
  })

  it('expands in authentic doubling steps: scale 1 → 2 → 4 → 8 over its life', () => {
    const { s, fx } = seeded()
    fx.detect(s, FRAME, [enemyDeath(2, 0.5)])

    const samples = trackExplosion(fx, 'enemy')
    const scaleSequence = dedupeConsecutive(samples.map((e) => e.scale as number))
    expect(scaleSequence).toEqual(ENEMY_SCALE_STEPS)
  })

  it('ramps brightness through the documented two tiers: 7 then 14', () => {
    const { s, fx } = seeded()
    fx.detect(s, FRAME, [enemyDeath(2, 0.5)])

    const samples = trackExplosion(fx, 'enemy')
    const brightnessSequence = dedupeConsecutive(samples.map((e) => e.brightness as number))
    expect(brightnessSequence).toEqual(ENEMY_BRIGHTNESS_TIERS)
  })

  it('clears the burst after its short animation — no lingering explosions', () => {
    const { s, fx } = seeded()
    fx.detect(s, FRAME, [enemyDeath(2, 0.5)])
    expect(explosionsOf(fx, 'enemy').length).toBe(1) // it spawned...

    // Run well past a 4-frame animation; it must have expired.
    for (let i = 0; i < 240; i++) fx.update(FRAME)
    expect(explosionsOf(fx, 'enemy').length).toBe(0) // ...and was cleaned up.
  })
})

describe('fx player-death splat — color-cycling jagged star (Story 10-5 AC2, AC3)', () => {
  it('spawns one concentric jagged star splat on player death', () => {
    const { s, fx } = seeded()
    s.player.alive = false
    fx.detect(s, FRAME, [])

    const splats = explosionsOf(fx, 'player')
    expect(splats.length).toBe(1)

    const splat = splats[0] as Record<string, number>
    expect(splat.spokes).toBeGreaterThanOrEqual(MIN_JAGGED_POINTS)

    const pos = project(s.tube, currentLane(s.tube, s.player.lane), 1.0)
    expect(splat.x).toBeCloseTo(pos.x, 1)
    expect(splat.y).toBeCloseTo(pos.y, 1)
  })

  it('grows then shrinks — radius rises to a peak, then falls back', () => {
    const { s, fx } = seeded()
    s.player.alive = false
    fx.detect(s, FRAME, [])

    const radii = trackExplosion(fx, 'player').map((e) => e.radius as number)
    expect(radii.length).toBeGreaterThan(3)

    const peak = Math.max(...radii)
    const peakIdx = radii.indexOf(peak)
    expect(peakIdx).toBeGreaterThan(0) // grew from the start
    expect(peakIdx).toBeLessThan(radii.length - 1) // shrank before the end
    expect(radii[0]).toBeLessThan(peak)
    expect(radii[radii.length - 1]).toBeLessThan(peak)
  })

  it('color-cycles through white/red/yellow, changing essentially every frame', () => {
    const { s, fx } = seeded()
    s.player.alive = false
    fx.detect(s, FRAME, [])

    const colors = trackExplosion(fx, 'player').map((e) => e.color as string)
    expect(colors.length).toBeGreaterThan(3)

    // Exactly the three documented colours — nothing else.
    expect(new Set(colors)).toEqual(new Set([SPLAT_WHITE, SPLAT_RED, SPLAT_YELLOW]))

    // It actually CYCLES (changes ~every frame), not just shows three colours at
    // fixed positions. Allow a little float jitter in frame timing.
    const transitions = dedupeConsecutive(colors).length
    expect(transitions).toBeGreaterThan(colors.length * 0.8)
  })
})

describe('fx explosions integrate with existing cues (Story 10-5 AC4)', () => {
  it('player death still flashes red and shakes — the splat is added, not a swap-out of the cue', () => {
    const { s, fx } = seeded()
    s.player.alive = false
    fx.detect(s, FRAME, [])

    expect(fx.flashColor).toBe(DEATH_RED)
    expect(fx.flash).toBeGreaterThan(0)
    expect(fx.shake).toBeGreaterThan(0)
    expect(explosionsOf(fx, 'player').length).toBe(1) // and the splat is present
  })

  it('keeps the two death kinds distinct — no cross-wiring', () => {
    // An enemy death must not spawn a player splat...
    const enemy = seeded()
    enemy.fx.detect(enemy.s, FRAME, [enemyDeath(1, 0.4)])
    expect(explosionsOf(enemy.fx, 'enemy').length).toBe(1)
    expect(explosionsOf(enemy.fx, 'player').length).toBe(0)

    // ...and a player death must not spawn an enemy burst.
    const player = seeded()
    player.s.player.alive = false
    player.fx.detect(player.s, FRAME, [])
    expect(explosionsOf(player.fx, 'player').length).toBe(1)
    expect(explosionsOf(player.fx, 'enemy').length).toBe(0)
  })
})
