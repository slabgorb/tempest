import { describe, it, expect } from 'vitest'
import { createRng } from '@arcade/shared/rng'
import { playingState } from './helpers'
import { stepGame, makeEnemy } from '../../src/core/sim'
import { Input } from '../../src/core/input'
import { fuseballScore, levelParams } from '../../src/core/rules'
import { GameState } from '../../src/core/state'

// ─────────────────────────────────────────────────────────────────────────────
// tp1-21 — SCORING: the fuseball's score tier is a WEIGHTED RANDOM ROLL from the
// seeded RNG in GameState, NOT a function of the fuseball's depth.
//
// ROM archaeology (Theurer 1981, LF copy ~/Projects/tempest-source-text):
//
//   INCFS2 — "PLAY-EXPLOSION OF FUSE INIT", the fuseball kill path
//   (ALWELG.MAC:2745-2771):
//
//       LDA RANDO2          ; ALWELG.MAC:2754   ; the ROM's RNG byte
//       AND I,7             ; ALWELG.MAC:2755   ; r = RANDO2 & 7  → uniform 0..7
//       CMP I,3             ; ALWELG.MAC:2756
//       IFCS                ; ALWELG.MAC:2757   ; if r >= 3 …
//       LDA I,0             ; ALWELG.MAC:2758   ;   … tier = 0   ("RANDOMLY CHOOSE
//       ENDIF                                   ;   0(250),1(500),OR 2(750)")
//       ...
//       ADC I,5             ; ALWELG.MAC:2767   ; score-table index = tier + 5
//       JSR UPSCOR          ; ALWELG.MAC:2769
//
//   The point-value table UPSCOR indexes (ALEXEC.MAC:598-600), BCD bytes; the
//   score for an index is TUPSCM[i]*100 + TUPSCL[i]:
//
//       TUPSCL: .BYTE 00,50,0,0,50,50,0,50   ; ALEXEC.MAC:598
//       TUPSCM: .BYTE 0,1,02,1,0,2,5,7       ; ALEXEC.MAC:600
//                              └ idx 5 = 2,50 → 250   (tier 0)
//                                idx 6 = 5, 0 → 500   (tier 1)
//                                idx 7 = 7,50 → 750   (tier 2)
//
//   So the tier is:  tier = (r < 3) ? r : 0,  with r = RANDO2 & 7 uniform over 8.
//   The weights over the 8 equally-likely values of r:
//
//       tier 0 → 250 :  r ∈ {0,3,4,5,6,7}  → 6/8 = 0.750
//       tier 1 → 500 :  r == 1             → 1/8 = 0.125
//       tier 2 → 750 :  r == 2             → 1/8 = 0.125
//
//   Depth appears NOWHERE in INCFS2's score decision — RANDO2 is the only input.
//   The ROM RNG (RANDO2, uniform low 3 bits) maps to our seeded GameState RNG as a
//   single `nextInt(rng, 8)` draw; the tier is then `r < 3 ? r : 0`.
//
// The CURRENT implementation (src/core/rules.ts:901-904) computes the tier from
// depth thirds — `Math.floor(depth * 3)` — which these tests must break.
// ─────────────────────────────────────────────────────────────────────────────

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }
const FRAME = 1 / 60

// The three tiers a fuseball kill can ever award, and the ROM weights above.
const ROM_TIERS = [250, 500, 750] as const
const ROM_WEIGHTS: Record<number, number> = { 250: 6 / 8, 500: 1 / 8, 750: 1 / 8 }

// A one-frame kill scenario: a vulnerable fuseball on lane 4 with a bullet sitting
// on it, plus a BULLETPROOF keep-alive fuseball on lane 8 so the board never empties
// (no level-clear, hence no incidental RNG draw). Both fuseballs carry jitterTimer:999
// so JFUSEUP returns before its lateral roll (interpreter.ts:486-487) — they consume
// NO RNG this frame, leaving the seeded cursor pristine for the score roll alone.
// Level 1 keeps the fuseball slow (move/frame ≈ 0.006 « the fuseball hit tol ≈ 0.027),
// so the planted bullet lands the kill.
function fuseKillState(seed: number, depth: number): GameState {
  const s = playingState(seed)
  s.spawn = { nymphs: [] }
  s.enemies = [
    { ...makeEnemy('fuseball', 4, depth, levelParams(1)), vulnerable: true, jitterTimer: 999 },
    { ...makeEnemy('fuseball', 8, 0.5, levelParams(1)), vulnerable: false, jitterTimer: 999 },
  ]
  s.bullets = [{ lane: 4, depth }]
  return s
}

const targetAlive = (s: GameState) => s.enemies.some((e) => e.lane === 4)

describe('tp1-21: the fuseball score tier is a weighted random roll, not a depth band', () => {
  describe('fuseballScore(rng) — the roll itself', () => {
    it('only ever produces the three ROM tier values 250 / 500 / 750', () => {
      const rng = createRng(7)
      const seen = new Set<number>()
      for (let i = 0; i < 500; i++) seen.add(fuseballScore(rng))
      for (const v of seen) expect(ROM_TIERS).toContain(v)
      // liveness: a frozen implementation that returns one constant must not pass
      expect(seen.size).toBeGreaterThan(1)
    })

    it('draws from the seeded RNG — each roll advances the cursor', () => {
      const rng = createRng(42)
      const seedBefore = rng.seed
      fuseballScore(rng)
      expect(rng.seed).not.toBe(seedBefore)
    })

    it('is deterministic: equal seeds roll equal tier sequences', () => {
      const a = createRng(2024)
      const b = createRng(2024)
      const seqA: number[] = []
      const seqB: number[] = []
      for (let i = 0; i < 32; i++) {
        seqA.push(fuseballScore(a))
        seqB.push(fuseballScore(b))
      }
      expect(seqA).toEqual(seqB)
      // liveness: guard against two all-NaN sequences comparing equal vacuously
      for (const v of seqA) expect(ROM_TIERS).toContain(v)
    })

    it('matches the ROM weighted distribution — 6/8 : 1/8 : 1/8 for 250 : 500 : 750', () => {
      const rng = createRng(13579)
      const N = 20000
      const counts: Record<number, number> = { 250: 0, 500: 0, 750: 0 }
      for (let i = 0; i < N; i++) {
        const v = fuseballScore(rng)
        // liveness: every draw is a real roll, not NaN/garbage re-derived by the test
        expect(ROM_TIERS).toContain(v)
        counts[v]++
      }
      expect(counts[250] + counts[500] + counts[750]).toBe(N)
      expect(counts[250] / N).toBeCloseTo(ROM_WEIGHTS[250], 1) // 0.750 ± 0.05
      expect(counts[500] / N).toBeCloseTo(ROM_WEIGHTS[500], 1) // 0.125 ± 0.05
      expect(counts[750] / N).toBeCloseTo(ROM_WEIGHTS[750], 1) // 0.125 ± 0.05
      // the low tier is the heavy favourite — 6× as likely as either high tier
      expect(counts[250]).toBeGreaterThan(counts[500] * 3)
      expect(counts[250]).toBeGreaterThan(counts[750] * 3)
    })
  })

  describe('through the real kill path — stepGame', () => {
    it('rolls the tier from the seeded RNG carried in GameState (the kill consumes state.rng)', () => {
      const before = fuseKillState(999, 0.5)
      const seedBefore = before.rng.seed
      const after = stepGame(before, NEUTRAL, FRAME)
      expect(targetAlive(after)).toBe(false)     // the fuseball died this frame
      expect(ROM_TIERS).toContain(after.score)   // a real tier was awarded
      expect(after.rng.seed).not.toBe(seedBefore) // the award drew from state.rng
    })

    it('scores the kill INDEPENDENTLY of depth — same seed, different depth → same score', () => {
      const shallow = stepGame(fuseKillState(12345, 0.25), NEUTRAL, FRAME)
      const deep = stepGame(fuseKillState(12345, 0.8), NEUTRAL, FRAME)
      expect(targetAlive(shallow)).toBe(false)
      expect(targetAlive(deep)).toBe(false)
      // depth-based scoring gives 250 (shallow third) vs 750 (deep third); the ROM's
      // roll draws the same value from the same seed regardless of depth.
      expect(shallow.score).toBe(deep.score)
      expect(ROM_TIERS).toContain(shallow.score)
    })
  })
})
