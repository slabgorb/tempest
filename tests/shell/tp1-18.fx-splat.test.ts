// tests/shell/tp1-18.fx-splat.test.ts
//
// Story tp1-18 — the player-death splat's TIMING and CAUSE routing (the shape and
// colour of the splat/spark live in tp1-18.shapes.test.ts against the glyphs).
//
// Three behaviours, all against the pure `createFx()` surface:
//   • DA-010  the splat's life is the ROM's 20 TSPTIM frames REBASED through
//             ROM_FPS (28.44) — 20/ROM_FPS ≈ 0.703 s, a quarter of its naively-
//             filed size, NOT today's SPLAT_LIFE = 0.9. Depends on tp1-1.
//   • DA-011  the splat's RADIUS curve is small→peak→small (grow-then-shrink).
//             The finding claimed it was INVERTED; that was REFUTED (wont_fix) —
//             SPLAT1 `SCAL 0,0` is FULL size (middle of the sequence), SPLAT6
//             `SCAL 2,40` the smallest (both ends). Our sin(progress·π) is already
//             correct. This is a KEEP-BEHAVIOUR GUARD: do NOT invert it.
//   • DA-007  an invader-collision death (cause 'grab') gets its OWN cue (the
//             SPARK1 yellow cross), NOT the colour-cycling splat. A charge/bolt
//             death (cause 'bolt' / 'pulse') still gets the splat. The sim already
//             carries the channel: PlayerDeathEvent.cause (events.ts:94-95, emitted
//             at sim.ts:418/597/872) — fx.detect must READ it, not the alive-diff.
//
// TSPTIM = 2,2,2,2,2,4,3,2,1 (ALDISP.MAC:1022-1030) = 20 frames; the following
// .BYTE 20 (PPSTART, :1031) is the SEPARATE pulsar-player tail, not the splat.
import { describe, it, expect } from 'vitest'
import { createFx, type Explosion } from '../../src/shell/fx'
import { initialState } from '../../src/core/state'
import { ROM_FPS } from '../../src/core/rules'
import type { GameEvent } from '../../src/core/events'

const FRAME = 1 / 60

// The ROM's charge-player splat sequence: TSPTIM indices 0-8 sum to 20 frames.
const TSPTIM_SPLAT_FRAMES = [2, 2, 2, 2, 2, 4, 3, 2, 1]
const SPLAT_FRAMES = TSPTIM_SPLAT_FRAMES.reduce((a, b) => a + b, 0) // 20
const EXPECTED_SPLAT_LIFE = SPLAT_FRAMES / ROM_FPS // 20 / 28.444 ≈ 0.703 s
const OLD_SPLAT_LIFE = 0.9 // the pre-tp1-18 (pre-rebase) value we must move OFF

type OfKind<K extends Explosion['kind']> = Extract<Explosion, { kind: K }>
const isKind =
  <K extends Explosion['kind']>(kind: K) =>
  (e: Explosion): e is OfKind<K> =>
    e.kind === kind
const splatsOf = (fx: ReturnType<typeof createFx>) => fx.explosions.filter(isKind('player'))

const deathEvent = (cause: 'grab' | 'pulse' | 'spike' | 'bolt'): GameEvent => ({ type: 'player-death', cause })

// One quiet frame (player alive) so prevAlive is established, then kill the player
// via BOTH the alive flag AND the authentic player-death event (the realistic path
// — the sim always emits the event on death; the alive-diff alone is a legacy seam).
function kill(cause: 'grab' | 'pulse' | 'spike' | 'bolt') {
  const s = initialState(1)
  const fx = createFx()
  fx.detect(s, FRAME, [])
  s.player.alive = false
  fx.detect(s, FRAME, [deathEvent(cause)])
  return { s, fx }
}

describe('DA-010 — the splat lives 20 ROM frames rebased through ROM_FPS (≈0.703 s, not 0.9)', () => {
  it('the sequence is the 20-frame TSPTIM sum, not the 60 Hz misreading', () => {
    expect(SPLAT_FRAMES).toBe(20)
    expect(EXPECTED_SPLAT_LIFE).toBeCloseTo(0.703, 2)
  })

  it('a bolt death spawns a splat whose life is 20/ROM_FPS, a QUARTER off the old 0.9', () => {
    const { fx } = kill('bolt')
    const splats = splatsOf(fx)
    expect(splats.length, 'a charge/bolt death still shows the splat').toBe(1)
    // The splat holds for the rebased duration — derived from ROM_FPS, not a magic 0.9.
    expect(splats[0].max).toBeCloseTo(EXPECTED_SPLAT_LIFE, 2)
    expect(Math.abs(splats[0].max - OLD_SPLAT_LIFE)).toBeGreaterThan(0.1) // moved OFF 0.9
  })

  it('the splat is actually gone by ~0.703 s and still present just before', () => {
    const { fx } = kill('bolt')
    // Just before expiry it still lives …
    const before = Math.floor((EXPECTED_SPLAT_LIFE - 0.05) / FRAME)
    for (let i = 0; i < before; i++) fx.update(FRAME)
    expect(splatsOf(fx).length, 'still visible just before the rebased life').toBe(1)
    // … and by the old 0.9 s it is long gone (would still be visible at 0.9 if unrebased).
    const more = Math.ceil((OLD_SPLAT_LIFE - EXPECTED_SPLAT_LIFE) / FRAME) + 4
    for (let i = 0; i < more; i++) fx.update(FRAME)
    expect(splatsOf(fx).length, 'expired well before the old 0.9 s life').toBe(0)
  })
})

describe('DA-011 — the splat radius curve stays small→peak→small (REFUTED/wont_fix; do NOT invert)', () => {
  it('grows from small to a peak in the MIDDLE, then shrinks — never big→small→big', () => {
    const { fx } = kill('bolt')
    const radii: number[] = []
    const first = splatsOf(fx)[0]
    if (first) radii.push(first.radius)
    for (let i = 0; i < 240; i++) {
      fx.update(FRAME)
      const s = splatsOf(fx)[0]
      if (!s) break
      radii.push(s.radius)
    }
    expect(radii.length).toBeGreaterThan(3)

    const peak = Math.max(...radii)
    const peakIdx = radii.indexOf(peak)
    // The peak is in the interior (grow-then-shrink), NOT at frame 0 (the inverted
    // implosion the finding wrongly claimed).
    expect(peakIdx, 'peak must be interior, not at the start').toBeGreaterThan(0)
    expect(peakIdx, 'peak must be interior, not at the end').toBeLessThan(radii.length - 1)
    // Both ENDS are small relative to the peak (ours bottoms near 0; the ROM near
    // quarter-size — either is "small", so assert < half-peak, not exactly 0).
    expect(radii[0]).toBeLessThan(0.5 * peak)
    expect(radii[radii.length - 1]).toBeLessThan(0.5 * peak)
  })
})

describe('DA-007 — an invader-grab death gets its OWN cue, not the charge splat', () => {
  it('a grab death does NOT spawn the colour-cycling splat', () => {
    const { fx } = kill('grab')
    expect(splatsOf(fx).length, 'invader-collision death must not reuse the charge splat').toBe(0)
  })

  it('a grab death still produces a distinct visual cue (not silence) and still flashes/shakes', () => {
    const { fx } = kill('grab')
    const hasCue = fx.explosions.length > 0 || fx.particles.length > 0
    expect(hasCue, 'the grab death needs its OWN mark (the SPARK1 cross), not nothing').toBe(true)
    expect(fx.flash, 'the death flash/shake survive the cue split').toBeGreaterThan(0)
    expect(fx.shake).toBeGreaterThan(0)
  })

  it('a charge/bolt death STILL spawns the splat (the two channels are distinct)', () => {
    const bolt = kill('bolt')
    expect(splatsOf(bolt.fx).length).toBe(1)
    // The two death causes yield DIFFERENT effect sets — the collapse the finding
    // flags (one visual for every death) is gone.
    const grab = kill('grab')
    expect(splatsOf(grab.fx).length).not.toBe(splatsOf(bolt.fx).length)
  })

  it('a pulse death also shows the splat (only the direct-collision grab diverts to the spark)', () => {
    const { fx } = kill('pulse')
    expect(splatsOf(fx).length, 'a pulsar (charge) death is a splat, like the ROM special explosion').toBe(1)
  })
})
