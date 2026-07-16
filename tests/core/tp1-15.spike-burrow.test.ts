// tests/core/tp1-15.spike-burrow.test.ts
//
// Story tp1-15 — THE SPIKE MODEL. RED phase (O'Brien / TEA).
//
// A player charge does NOT flash-kill a spike. In the arcade it BURROWS: the tip
// of the spike is cut to the charge's OWN position, the charge survives, slows,
// and takes a SECOND bite the next frame — scoring 1 point per bite, two bites,
// then the charge is spent. Cluster C11 finding W-047 (CONFIRMED by the audit's
// own refutation).
//
// PRIMARY SOURCE — Theurer's 1981 assembler (tempest CLAUDE.md: take constants
// from the audit, not the book). ~/Projects/tempest-source-text/ALWELG.MAC:
//
//   LIFECT (ALWELG.MAC:2589-2626) — the charge↔enemy-line collision:
//     LDA X,CHARY / CMP Y,LINEY / IFCS       ; charge reached the tip?
//       (CMP I,ILINDDY / IFCS / LDA I,0)     ; at the far base ($F0) → clear the line
//       STA Y,LINEY   (:2602)                ; ELSE cut the tip to the charge's OWN Y
//       INC X,CHARCO  (:2603)                ; bump this charge's hit counter
//       LDA I,0C0 / STA Y,LINSTA (:2604-5)   ; D7 recalc + D6 SHATTERED  → the sparkle
//       (score) TEMP0=1 → JSR UPSCORE        ; exactly ONE point per bite
//     LDA X,CHARCO / CMP I,2 / IFCS          ; two bites?
//       LDA I,0 / STA X,CHARY                ; → deactivate the charge
//
//   MOVCHA (ALWELG.MAC:2530-2554) — moves each charge, THEN calls LIFECT:
//     ADC I,PCVELO           ; advance by PCVELO=9   (ALCOMN.MAC:890)
//     LDY X,CHARCO / IFNE / SEC / SBC I,4    ; once it has bitten, SLOW it: 9-4 = 5
//     STA X,CHARY / JSR LIFECT
//
//   ILINDDY=$F0 (far base), ILINLIY=$10 (rim), span = 224 (ALCOMN.MAC:819-820).
//
// COORDINATE NOTE: the ROM's Y is $10 rim → $F0 far; OUR tube space is inverted,
// depth 1 = near/rim → 0 = far (tempest CLAUDE.md). So the ROM's "LINEY ← CHARY"
// is `s.spikes[lane] = bullet.depth`, and a charge descends depth 1 → 0. The sim
// steps one ROM frame per stepGame(dt = SIM_STEP); a free charge advances
// PCVELO/224 in depth per frame, a burrowing one PCVELO-4 = 5/224.
//
// Ours today (src/core/sim.ts resolveSpikeHits): a bullet flash-KILLS on first
// contact, trims a FLAT SPIKE_SHORTEN = 0.08, and (already, from a prior story)
// scores 1. This suite pins the burrow that replaces that. The shattered VISUAL
// is in tests/shell/tp1-15.spike-shatter.test.ts; here we pin its core flag.
import { describe, it, expect } from 'vitest'
import { playingState } from './helpers'
import { stepGame, makeEnemy } from '../../src/core/sim'
import type { Input } from '../../src/core/input'
import type { GameState } from '../../src/core/state'
import {
  SIM_STEP,
  BULLET_SPEED,
  WARP_ALONG_SPAN,
  SPIKE_SHORTEN,
  SCORE_SPIKE_SEGMENT,
  levelParams,
} from '../../src/core/rules'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }

const LANE = 3
const H = 0.6 // spike tip depth — well below SPIKE_MAX_DEPTH (0.929) and above 0

// ROM velocities as depth advanced per ROM frame (÷ the 224-unit tube span).
const PCVELO = 9 // ALCOMN.MAC:890 "PLAYER SHOT VELOCITY"
const PCVELO_SLOW = PCVELO - 4 // MOVCHA slows a biting charge (ALWELG.MAC:2543-2544)
const FREE_STEP = PCVELO / WARP_ALONG_SPAN // 9/224 — a free charge's per-frame advance
const SLOW_STEP = PCVELO_SLOW / WARP_ALONG_SPAN // 5/224 — a burrowing charge's advance

// tp1-15 adds a transient per-lane SHATTERED flag to GameState (DB-014: "set on
// the spike hit, cleared on the next step"). It does not exist yet, so read it
// through a tolerant cast — undefined pre-GREEN gives a clean assertion failure.
type WithShatter = { spikeShattered: boolean[] }
const shattered = (s: GameState): boolean[] | undefined =>
  (s as Partial<WithShatter>).spikeShattered

// A charge that has just reached the tip of a spike on LANE. A decoy flipper is
// parked far away on the opposite side of the tube so the board is never empty —
// otherwise checkLevelClear warps the level out from under the two-frame burrow
// (the `enemies = []` trap). Parked deep (depth 0.05) on a distant lane, it neither
// reaches the rim nor lane LANE in these few frames, and it fires nothing (below the
// enemy-fire depth floor), so it cannot touch the charge, the spike, or the score.
function spikeAndCharge(): GameState {
  const s = playingState(1)
  s.spawn = { nymphs: [] }
  s.enemies = [makeEnemy('flipper', 10, 0.05, levelParams(1))]
  s.enemyBullets = []
  s.spikes[LANE] = H
  s.bullets = [{ lane: LANE, depth: H }]
  return s
}

describe('tp1-15 the spike model — a charge burrows into a spike (W-047)', () => {
  it('anchors the frame model: one stepGame at SIM_STEP == PCVELO of depth', () => {
    // Every arithmetic assertion below leans on this: a free charge moves 9/224
    // of the tube's depth per ROM frame. A drift in the timebase would silently
    // rescale the burrow.
    expect(BULLET_SPEED * SIM_STEP).toBeCloseTo(FREE_STEP, 8)
  })

  it('SURVIVES the first spike contact instead of flash-killing (W-047)', () => {
    const out = stepGame(spikeAndCharge(), NEUTRAL, SIM_STEP)
    expect(out.bullets).toHaveLength(1) // ours today: 0 (instant kill)
    expect(out.bullets[0]?.lane).toBe(LANE)
  })

  it('cuts the tip to the charge\'s OWN position, not a flat SPIKE_SHORTEN (W-047)', () => {
    const out = stepGame(spikeAndCharge(), NEUTRAL, SIM_STEP)
    // LINEY ← CHARY (ALWELG.MAC:2595-2602): the tip becomes exactly where the charge is.
    expect(out.spikes[LANE]).toBe(out.bullets[0]?.depth)
    expect(out.spikes[LANE]).toBeCloseTo(H - FREE_STEP, 8)
    // …and specifically NOT ours' flat 0.08 trim.
    expect(out.spikes[LANE]).not.toBeCloseTo(H - SPIKE_SHORTEN, 4)
  })

  it('scores exactly ONE point on a bite — TEMP0=1 via UPSCORE (W-047)', () => {
    const s = spikeAndCharge()
    const out = stepGame(s, NEUTRAL, SIM_STEP)
    expect(out.score - s.score).toBe(SCORE_SPIKE_SEGMENT) // == 1
  })

  it('burrows over exactly TWO bites, +1 each, then the charge is spent (W-047)', () => {
    let s = spikeAndCharge()

    // Bite 1 — the charge lives on.
    s = stepGame(s, NEUTRAL, SIM_STEP)
    expect(s.score).toBe(SCORE_SPIKE_SEGMENT) // +1
    expect(s.bullets).toHaveLength(1)
    const tipAfter1 = s.spikes[LANE]

    // Bite 2 — CHARCO reaches 2, the charge deactivates on the same frame.
    s = stepGame(s, NEUTRAL, SIM_STEP)
    expect(s.score).toBe(2 * SCORE_SPIKE_SEGMENT) // +1 again == 2 total
    expect(s.bullets).toHaveLength(0)
    const tipAfter2 = s.spikes[LANE]

    // Frame 3 — no charge left: never a third bite, the spike holds where it was cut.
    s = stepGame(s, NEUTRAL, SIM_STEP)
    expect(s.score).toBe(2 * SCORE_SPIKE_SEGMENT)
    expect(s.spikes[LANE]).toBe(tipAfter2)

    // The tip receded ahead of the charge across the two bites (never grew).
    expect(tipAfter1).toBeLessThan(H)
    expect(tipAfter2).toBeLessThan(tipAfter1)
  })

  it('slows the charge after its first bite — PCVELO-4, not full speed (W-047 / MOVCHA)', () => {
    let s = spikeAndCharge()
    s = stepGame(s, NEUTRAL, SIM_STEP) // bite 1: the charge is now in-collision, slowed
    const tipAfter1 = s.spikes[LANE]
    s = stepGame(s, NEUTRAL, SIM_STEP) // bite 2: advances by the SLOWED step, cuts again
    const recession = tipAfter1 - s.spikes[LANE]
    expect(recession).toBeCloseTo(SLOW_STEP, 6) // 5/224, the slowed advance
    expect(recession).toBeLessThan(FREE_STEP) // strictly less than a free charge's 9/224
  })

  it('leaves spikes in OTHER lanes untouched while burrowing one (W-047)', () => {
    const s = spikeAndCharge()
    s.spikes[7] = 0.4
    const out = stepGame(s, NEUTRAL, SIM_STEP)
    expect(out.spikes[7]).toBe(0.4)
  })
})

describe('tp1-15 the shattered flag — the charge marks the lane for the shell (DB-014)', () => {
  it('is NOT set before any bite lands', () => {
    const s = spikeAndCharge()
    expect(shattered(s)?.[LANE] ?? false).toBe(false)
  })

  it('flags the struck lane SHATTERED on the bite (LINSTA D6, ALWELG.MAC:2604-2605)', () => {
    const out = stepGame(spikeAndCharge(), NEUTRAL, SIM_STEP)
    expect(shattered(out)?.[LANE]).toBe(true)
    // …and only the struck lane.
    expect(shattered(out)?.some((v, i) => v && i !== LANE) ?? false).toBe(false)
  })

  it('is TRANSIENT: clears on the next step once the lane is no longer struck (DB-014)', () => {
    let s = spikeAndCharge()
    s = stepGame(s, NEUTRAL, SIM_STEP) // bite → shattered
    expect(shattered(s)?.[LANE]).toBe(true)
    s.bullets = [] // remove the charge so no further bite lands this lane
    s = stepGame(s, NEUTRAL, SIM_STEP)
    expect(shattered(s)?.[LANE]).toBe(false)
  })
})
