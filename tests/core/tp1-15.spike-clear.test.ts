// tests/core/tp1-15.spike-clear.test.ts
//
// Story tp1-15 — REWORK (round 1). The Reviewer (Thought Police) found a HIGH
// regression: the burrow cuts a spike's tip toward the base, but a charge is CULLED
// at depth<=0 (stepBullets) BEFORE its bite (resolveSpikeHits), so `s.spikes[lane]`
// is only ever assigned a strictly POSITIVE `b.depth` — a spike can NEVER be shot to
// 0. The pre-tp1-15 `Math.max(0, h - SPIKE_SHORTEN)` DID reach 0, so this is a
// regression; and `resolveWarpSpikeHit` (sim.ts) crashes for ANY height>0, so a
// shot-at warp lane can never be made safe. Probe: a 0.05 spike floors at 0.0134.
//
// The ROM clears the line when the biting charge reaches the base:
//   LIFECT: `CMP I,ILINDDY / IFCS / LDA I,0 / ENDIF / STA Y,LINEY`  (ALWELG.MAC:2598-2602)
// = LINEY <- 0 when CHARY >= ILINDDY (the far base). In our inverted depth (0 = far
// base), a burrowing charge that reaches the base clears the spike to EXACTLY 0.
// This suite pins that; it is RED until Dev adds the base-clear.
import { describe, it, expect } from 'vitest'
import { playingState } from './helpers'
import { stepGame } from '../../src/core/sim'
import type { GameState } from '../../src/core/state'
import type { Input } from '../../src/core/input'
import { SIM_STEP } from '../../src/core/rules'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }
const FIRE: Input = { spin: 0, fire: true, zap: false, start: false }

// A board that stays 'playing' for a long shoot: pending nymphs (py far from the
// py===0 hatch, so they never spawn) keep checkLevelClear from warping — it needs
// BOTH enemies AND the queue empty — with NO live enemy that could move onto the
// lane or grab the player (the tp1-3 `isolated` trick).
function shootingBoard(lane: number, spikeHeight: number): GameState {
  const s = playingState(1)
  s.enemies = []
  s.spawn = { nymphs: Array.from({ length: 5 }, (_, i) => ({ lane: i, py: 30000 + i })) }
  s.spikes[lane] = spikeHeight
  s.player.lane = lane
  return s
}

// Fire a steady stream down the player's lane until the spike clears or the budget runs out.
function shootUntilClear(s: GameState, lane: number, maxFrames: number): GameState {
  let cur = s
  for (let i = 0; i < maxFrames && cur.spikes[lane] > 0 && cur.mode === 'playing'; i++) {
    cur = stepGame(cur, FIRE, SIM_STEP)
  }
  return cur
}

describe('tp1-15 rework — a spike can be shot to 0 (far-base clear, W-047 / ALWELG.MAC:2598-2602)', () => {
  it('persistent fire clears a spike to EXACTLY 0', () => {
    const LANE = 4
    const out = shootUntilClear(shootingBoard(LANE, 0.3), LANE, 1500)
    expect(out.mode).toBe('playing') // the board never warped out from under the test
    expect(out.spikes[LANE]).toBe(0) // RED today: floors at a positive stub (~0.013), never 0
  })

  it("clears a SHORT spike (within one charge's burrow reach of the base) to 0", () => {
    const LANE = 9
    const out = shootUntilClear(shootingBoard(LANE, 0.04), LANE, 800)
    expect(out.spikes[LANE]).toBe(0)
  })

  it('a spiked lane, once shot clean, no longer crashes the warp (the WD-014 consumer of s.spikes)', () => {
    // The whole point of the regression: s.spikes[lane] feeds resolveWarpSpikeHit,
    // which crashes for ANY height>0. A lane the player shot CLEAN must be safe to warp.
    const LANE = 4
    let cur = shootUntilClear(shootingBoard(LANE, 0.05), LANE, 800)
    expect(cur.spikes[LANE]).toBe(0) // precondition: truly cleared (RED today — a 0.013 stub)

    // End the wave (empty the queue) and warp on the shot-clean lane.
    cur = { ...cur, spawn: { nymphs: [] }, bullets: [] }
    for (let i = 0; i < 1500 && cur.mode !== 'playing'; i++) {
      cur = stepGame(cur, NEUTRAL, SIM_STEP)
      if (cur.mode === 'dying' || cur.mode === 'gameover') break
    }
    expect(cur.mode).toBe('playing') // warp COMPLETED — not crashed on the cleared lane
  })
})
