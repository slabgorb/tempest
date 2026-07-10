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
// The suite pins the explosions' geometry and timing against that structured
// surface, fully typed via the exported `Explosion` union (no casts).
import { describe, it, expect } from 'vitest'
import { createFx, type Explosion } from '../../src/shell/fx'
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

// Narrowing type-guard over the `kind` discriminant — keeps the suite fully typed
// against the exported `Explosion` union (no casts, so a field rename is caught).
type OfKind<K extends Explosion['kind']> = Extract<Explosion, { kind: K }>
const isKind =
  <K extends Explosion['kind']>(kind: K) =>
  (e: Explosion): e is OfKind<K> =>
    e.kind === kind

const explosionsOf = <K extends Explosion['kind']>(
  fx: ReturnType<typeof createFx>,
  kind: K,
): OfKind<K>[] => fx.explosions.filter(isKind(kind))

// Step `update` frame-by-frame, snapshotting the single explosion of `kind` each
// frame while it lives (frame 0 = post-detect, pre-update). Stops when it expires.
function trackExplosion<K extends Explosion['kind']>(
  fx: ReturnType<typeof createFx>,
  kind: K,
  maxFrames = 240,
): OfKind<K>[] {
  const find = () => fx.explosions.find(isKind(kind))
  const samples: OfKind<K>[] = []
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

describe('fx enemy-death explosion — 16-spoke star (Story 10-5 AC1)', () => {
  it('spawns one 16-spoke enemy burst on the enemy-death event, at the event location', () => {
    const { s, fx } = seeded()
    fx.detect(s, FRAME, [enemyDeath(2, 0.5)])

    const bursts = explosionsOf(fx, 'enemy')
    expect(bursts.length).toBe(1)

    const burst = bursts[0]
    expect(burst.spokes).toBe(ENEMY_SPOKES)

    const pos = project(s.tube, 2, 0.5)
    expect(burst.x).toBeCloseTo(pos.x, 1)
    expect(burst.y).toBeCloseTo(pos.y, 1)
  })

  it('expands in authentic doubling steps: scale 1 → 2 → 4 → 8 over its life', () => {
    const { s, fx } = seeded()
    fx.detect(s, FRAME, [enemyDeath(2, 0.5)])

    const samples = trackExplosion(fx, 'enemy')
    const scaleSequence = dedupeConsecutive(samples.map((e) => e.scale))
    expect(scaleSequence).toEqual(ENEMY_SCALE_STEPS)
  })

  it('ramps brightness through the documented two tiers: 7 then 14', () => {
    const { s, fx } = seeded()
    fx.detect(s, FRAME, [enemyDeath(2, 0.5)])

    const samples = trackExplosion(fx, 'enemy')
    const brightnessSequence = dedupeConsecutive(samples.map((e) => e.brightness))
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

  it('spawns an independent burst per simultaneous enemy-death (superzapper sweep)', () => {
    const { s, fx } = seeded()
    fx.detect(s, FRAME, [enemyDeath(1, 0.4), enemyDeath(3, 0.6)])

    const bursts = explosionsOf(fx, 'enemy')
    expect(bursts.length).toBe(2) // not collapsed/capped to one

    // Each burst sits at its own event location, and the two are distinct points.
    const want = [project(s.tube, 1, 0.4), project(s.tube, 3, 0.6)]
    for (const w of want) {
      expect(bursts.some((b) => Math.hypot(b.x - w.x, b.y - w.y) < 0.5)).toBe(true)
    }
    expect(Math.hypot(bursts[0].x - bursts[1].x, bursts[0].y - bursts[1].y)).toBeGreaterThan(0.5)
  })
})

describe('fx player-death splat — color-cycling jagged star (Story 10-5 AC2, AC3)', () => {
  it('spawns one concentric jagged star splat on player death', () => {
    const { s, fx } = seeded()
    s.player.alive = false
    fx.detect(s, FRAME, [])

    const splats = explosionsOf(fx, 'player')
    expect(splats.length).toBe(1)

    const splat = splats[0]
    expect(splat.spokes).toBeGreaterThanOrEqual(MIN_JAGGED_POINTS)

    const pos = project(s.tube, currentLane(s.tube, s.player.lane), 1.0)
    expect(splat.x).toBeCloseTo(pos.x, 1)
    expect(splat.y).toBeCloseTo(pos.y, 1)
  })

  it('grows then shrinks — radius rises to a peak, then falls back', () => {
    const { s, fx } = seeded()
    s.player.alive = false
    fx.detect(s, FRAME, [])

    const radii = trackExplosion(fx, 'player').map((e) => e.radius)
    expect(radii.length).toBeGreaterThan(3)

    const peak = Math.max(...radii)
    const peakIdx = radii.indexOf(peak)
    expect(peakIdx).toBeGreaterThan(0) // grew from the start
    expect(peakIdx).toBeLessThan(radii.length - 1) // shrank before the end
    expect(radii[1]).toBeGreaterThan(radii[0]) // actually grew on the first tick
    expect(radii[radii.length - 1]).toBeLessThan(peak) // and shrank from the peak
  })

  it('color-cycles through white/red/yellow, changing essentially every frame', () => {
    const { s, fx } = seeded()
    s.player.alive = false
    fx.detect(s, FRAME, [])

    const colors = trackExplosion(fx, 'player').map((e) => e.color)
    expect(colors.length).toBeGreaterThan(3)

    // Exactly the three documented colours — nothing else.
    expect(new Set(colors)).toEqual(new Set([SPLAT_WHITE, SPLAT_RED, SPLAT_YELLOW]))

    // Cycles EVERY frame (AC3): no two consecutive frames share a colour. The cycle
    // is driven by an integer counter (no float jitter), so this is exact.
    expect(dedupeConsecutive(colors).length).toBe(colors.length)
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
