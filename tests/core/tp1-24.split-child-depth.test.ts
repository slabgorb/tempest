// tests/core/tp1-24.split-child-depth.test.ts
//
// RED suite for story tp1-24 — W-030's OPEN half.
//
// W-030 asserted two divergences. tp1-5 closed the first: the carrier bursts at $20
// (depth 0.9286), not our invented 0.9. This is the second, and it is the same ROM
// read one line further on.
//
// ── The ROM ────────────────────────────────────────────────────────────────────────
// KILINV (ALWELG.MAC:2300-2302) opens by saving the dying parent's OWN along value:
//
//     LDA Y,INVAY
//     STA TEMP0
//
// and ACTINV (1219-1226), called once per child off KILINV's tail, seats each one
// straight back out of it:
//
//     LDA TEMP0
//     STA Y,INVAY
//
// Both children are born at the parent's EXACT depth. There is no clamp in the cabinet.
//
// ── Why this is a ruling, not a typo ──────────────────────────────────────────────
// Ours clamped them to SPLIT_CHILD_DEPTH = 0.85, and that constant's comment said why:
// "Must be < PLAYER_RIM_DEPTH (0.92) so a rim-split is not an instant grab." It was a
// deliberate softening, and it predates this epic.
//
// The ROM does the opposite ON PURPOSE. A carrier that arrives under its own steam
// bursts at 0.9286 — ABOVE the 0.92 grab line — and drops both children there. Measured
// on wave 3: a player standing on a child's landing lane dies on the burst frame, with
// no counterplay. That is the arcade.
//
// What makes it survivable is the other two thirds of the same mechanism:
//
//   1. splitTanker VACATES the parent's own lane (children straddle it, seg-1 / seg+1),
//      so the player who tracked the tanker and stood on its lane to shoot it is spared
//      the instant grab.
//   2. The no-flip rule (SPLCHA / NEWGEN, W-032, landed in tp1-5) means those children
//      cannot flip ONTO him. They can only walk the rim once they reach it.
//
// Burst depth, child depth, and no-flip are ONE mechanism. Measured, the no-flip rule
// doubles the reaction window for the player on the vacated lane: he dies on frame 18
// with it, frame 9 without. Ship two thirds and the rim-burst is gentler than the
// cabinet's — gentler by accident, not by ruling.
//
// RULING (tp1-24): adopt the ROM. SPLIT_CHILD_DEPTH is deleted, not renumbered.
//
// ── The fixture trap this suite is built to avoid ─────────────────────────────────
// Never hand-place a tanker above the arrival gate. `resolveTankerArrivals` destroys a
// tanker the frame it crosses TANKER_SPLIT_DEPTH, so a fixture that seats one at 0.95
// is testing a board the sim cannot produce — which is exactly how W-032's no-flip
// branch stayed dead code through a whole review cycle. Every near-rim test below
// drives a REAL climb and lets the tanker burst on its own.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { playingState } from './helpers'
import { stepGame, makeEnemy, splitTanker } from '../../src/core/sim'
import {
  levelParams, SIM_STEP, PLAYER_RIM_DEPTH, TANKER_SPLIT_DEPTH, SPLIT_TOO_CLOSE_DEPTH,
} from '../../src/core/rules'
import { tubeForLevel } from '../../src/core/geometry'
import { Input } from '../../src/core/input'
import { Enemy, GameState } from '../../src/core/state'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }
const FRAME = SIM_STEP

// Wave 3: its flipper cam is SPIRAL, which flips constantly, so "did a child flip?" is
// trivially observable. (Wave 1's cam IS the generic NOJUMP cam — W-006 — so a wave-1
// board cannot tell the no-flip rule from the wave's own program. Do not test it there.)
const WAVE = 3
const TANKER_LANE = 5
const LANDING_LANES = [4, 6]   // splitTanker straddles the parent: seg-1 and seg+1

function base(level: number, playerLane: number): GameState {
  const s = playingState(1)
  s.level = level
  s.tube = tubeForLevel(level)   // NOT optional: setting s.level alone leaves level 1's tube
  s.spikes = new Array(s.tube.laneCount).fill(0)
  s.spawn = { nymphs: [] }
  s.player.lane = playerLane
  s.enemies = []
  return s
}

/**
 * Let a tanker CLIMB to its own arrival and burst THERE — no bullet, no hand-placed
 * depth. This is the only way a tanker ever splits near the rim in the real game, and
 * it is the board every rule in this suite is written for.
 *
 * Returns the state on the frame the tanker burst, and the parent's depth on the last
 * frame it was still visible (the burst happens inside stepGame, so the parent is gone
 * by the time we can look — its depth AT the burst is one frame's climb beyond this).
 */
function climbUntilBurst(level: number, playerLane: number) {
  let s = base(level, playerLane)
  const t = makeEnemy('tanker', TANKER_LANE, 0.5, levelParams(level), 'flipper')
  t.fireCooldown = 999          // no bolts: a bolt is a second, noisy way to die
  s.enemies = [t]

  let lastSeenDepth = 0.5
  for (let i = 0; i < 400; i++) {
    const tk = s.enemies.find((e) => e.kind === 'tanker')
    if (tk) lastSeenDepth = tk.depth
    s = stepGame(s, NEUTRAL, FRAME)
    if (!s.enemies.some((e) => e.kind === 'tanker')) return { s, burstFrame: i, lastSeenDepth }
  }
  throw new Error('fixture: the tanker never burst — it never reached its arrival depth')
}

const flippersOf = (s: GameState): Enemy[] => s.enemies.filter((e) => e.kind === 'flipper')

describe('tp1-24 — the children are born at the PARENT\'s depth (W-030, open half)', () => {
  it('splitTanker seats both children at the parent\'s EXACT depth — there is no clamp', () => {
    // KILINV 2300-2302 -> ACTINV 1219-1226: `LDA TEMP0 / STA Y,INVAY`, twice, from the
    // one TEMP0 the parent's death saved. The children's depth IS the parent's depth.
    const tube = tubeForLevel(WAVE)
    const params = levelParams(WAVE)

    // A parent well ABOVE the old 0.85 clamp — the case the clamp used to soften.
    const near = makeEnemy('tanker', TANKER_LANE, 0.93, params, 'flipper')
    const kids = splitTanker(near, tube, params)

    expect(kids).toHaveLength(2)
    for (const k of kids) {
      expect(k.depth, 'a child must be born at the parent\'s depth, not clamped below it').toBe(0.93)
    }
    // Refute the clamp by name, so it cannot quietly come back as a different number.
    expect(
      kids.map((k) => k.depth),
      'the children are being clamped — SPLIT_CHILD_DEPTH (0.85) is still in the path',
    ).not.toContain(0.85)
  })

  it('a parent BELOW the old clamp is unchanged — the fix removes a clamp, it does not add a floor', () => {
    // The other side of 0.85, so "born at the parent's depth" cannot be satisfied by
    // seating every child at the arrival gate instead. A tanker shot at 0.50 drops its
    // children at 0.50. This passes today and must keep passing.
    const tube = tubeForLevel(WAVE)
    const params = levelParams(WAVE)
    const deep = makeEnemy('tanker', TANKER_LANE, 0.5, params, 'flipper')

    for (const k of splitTanker(deep, tube, params)) {
      expect(k.depth, 'a deep split must still be born at its parent\'s depth').toBe(0.5)
    }
  })

  it('a tanker that ARRIVES on its own bursts above the grab line, and its children are born there', () => {
    // The whole finding, driven through a real climb. No hand-placed depth anywhere.
    const { s, lastSeenDepth } = climbUntilBurst(WAVE, 12)   // player parked far away

    // Premises — an unstated one here is what hid W-032's dead branch for a review cycle.
    expect(s.tube.closed, 'premise: wave 3 is a closed tube').toBe(true)
    expect(lastSeenDepth, 'premise: the tanker really climbed to its own arrival').toBeGreaterThan(0.9)

    const kids = flippersOf(s)
    expect(kids, 'the arrival should have burst the tanker into two children').toHaveLength(2)
    expect(kids.map((k) => k.lane).sort((a, b) => a - b)).toEqual(LANDING_LANES)

    for (const k of kids) {
      // The parent crossed TANKER_SPLIT_DEPTH to die, so a child born AT the parent is
      // at or beyond that line too. This is the assertion the 0.85 clamp fails.
      expect(
        k.depth,
        'a child of a self-arriving tanker is born at the parent\'s depth — at or past the arrival gate',
      ).toBeGreaterThanOrEqual(TANKER_SPLIT_DEPTH)
      // ...and that line is ABOVE the grab line. This is the difficulty change, stated.
      expect(
        k.depth,
        'the ROM drops the children ABOVE PLAYER_RIM_DEPTH — that is the point of the finding',
      ).toBeGreaterThan(PLAYER_RIM_DEPTH)
    }
    // Both children come from the one TEMP0, so they are born at the SAME depth.
    expect(kids[0]!.depth).toBe(kids[1]!.depth)
  })
})

describe('tp1-24 — the burst is lethal where the ROM says it is, and survivable where it does not', () => {
  it('is INSTANTLY lethal to a player standing on a child\'s landing lane', () => {
    // The cruelty, and the reason this is a ruling rather than a transcription. The
    // child is born at 0.9286, above PLAYER_RIM_DEPTH, on lane 4 — and resolveTankerArrivals
    // runs BEFORE resolvePlayerHits in the same frame, so the grab lands the moment it
    // is born. Today the child appears at 0.85 and the player strolls away.
    const livesBefore = base(WAVE, LANDING_LANES[0]!).lives
    const { s } = climbUntilBurst(WAVE, LANDING_LANES[0]!)   // player ON lane 4

    expect(flippersOf(s), 'premise: the tanker burst').toHaveLength(2)
    expect(
      s.player.alive,
      'a child born above the grab line on the player\'s own lane must grab him on the burst frame',
    ).toBe(false)
    expect(s.lives, 'the grab must actually cost a life').toBe(livesBefore - 1)
  })

  it('SPARES the player on the tanker\'s own lane — the lane the ROM vacates', () => {
    // The fairness that makes the cruelty above survivable, and the reason option (a)
    // is shippable at all. The player who tracked the tanker and stood on its lane to
    // shoot it is NOT instantly grabbed: the children straddle him (4 and 6), and the
    // no-flip rule means they cannot flip onto lane 5. He must move or shoot — but he
    // gets to.
    //
    // Measured: he dies on frame 18 (the children take the rim and walk it to him). With
    // the no-flip rule broken he dies on frame 9. That gap IS W-032's contribution, and
    // this test is the floor under it.
    const { s } = climbUntilBurst(WAVE, TANKER_LANE)   // player ON lane 5

    const kids = flippersOf(s)
    expect(kids, 'premise: the tanker burst').toHaveLength(2)
    expect(kids.map((k) => k.lane).sort((a, b) => a - b)).toEqual(LANDING_LANES)
    expect(kids.map((k) => k.lane), 'premise: the ROM vacates the parent\'s own lane').not.toContain(TANKER_LANE)

    expect(
      s.player.alive,
      'the burst must not grab the player on the lane it vacated',
    ).toBe(true)

    // ...and he stays alive for as long as the children are still climbing. Once they
    // take the rim they are chasers and will walk to him — that is authentic, and not
    // what this test is about.
    let live = s
    for (let i = 0; i < 40; i++) {
      const below = flippersOf(live).every((k) => k.depth < 1)
      if (!below) break
      live = stepGame(live, NEUTRAL, FRAME)
      expect(
        live.player.alive,
        'a child reached the player on the vacated lane while still BELOW the rim — it flipped, and the no-flip rule is broken',
      ).toBe(true)
    }
  })
})

describe('tp1-24 — burst depth and the no-flip rule are ONE mechanism (W-032 stays alive)', () => {
  it('neither child changes lane while it is still below the rim', () => {
    // The window-free form of "the children do not flip". The old spelling stepped a
    // fixed 16 frames and asserted the children were still on lanes 4 and 6 — which
    // silently depended on them being born at 0.85, low enough that 16 frames of climb
    // could not reach the rim. Born at the parent's 0.9286 they reach it on frame 10,
    // become chasers, and start WALKING the rim — a lane change that is authentic and
    // has nothing to do with flipping.
    //
    // So: watch every frame, and only care about lane changes made BELOW the rim. A
    // NOJUMP child never makes one. A SPIRAL child makes its first on frame 9.
    const { s } = climbUntilBurst(WAVE, 12)
    const kids = flippersOf(s)
    expect(kids, 'premise: the tanker burst').toHaveLength(2)

    let live = s
    let prev = new Map(flippersOf(live).map((k, i) => [i, k.lane]))
    let sawBelowRim = 0

    for (let f = 0; f < 40; f++) {
      live = stepGame(live, NEUTRAL, FRAME)
      const now = flippersOf(live)
      if (now.length !== 2) break

      now.forEach((k, i) => {
        if (k.depth < 1) {
          sawBelowRim++
          expect(
            k.lane,
            `a child changed lane on frame ${f} while still below the rim (depth ${k.depth.toFixed(3)}) — it FLIPPED. The no-flip rule (W-032) is not firing for a self-arriving tanker.`,
          ).toBe(prev.get(i))
        }
      })
      prev = new Map(now.map((k, i) => [i, k.lane]))
    }

    // Guard: if the children vaulted straight past the rim we observed nothing at all and
    // the loop above would have passed vacuously.
    expect(sawBelowRim, 'the children were never observed below the rim — this test proved nothing').toBeGreaterThan(0)
  })
})

describe('tp1-24 — SPLIT_CHILD_DEPTH is deleted, not orphaned', () => {
  // The AC is explicit: if we adopt the ROM the constant does not get a new number, it
  // stops existing. A constant left behind unused is the residue this story exists to
  // clear — and the next reader would take it for a live rule.
  const srcOf = (rel: string) =>
    readFileSync(fileURLToPath(new URL(`../../src/core/${rel}`, import.meta.url)), 'utf8')

  // Strip comments: prose ABOUT the departed constant (the history of why we clamped,
  // and stopped) is welcome and must not fail this. Only live code is the subject.
  const codeOnly = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

  it.each(['rules.ts', 'sim.ts'])('%s carries no SPLIT_CHILD_DEPTH in live code', (file) => {
    expect(
      codeOnly(srcOf(file)),
      `${file} still references SPLIT_CHILD_DEPTH — the clamp is deleted, so the constant must go too`,
    ).not.toMatch(/SPLIT_CHILD_DEPTH/)
  })

  it('the $20 band the children are born into is still ONE constant, read twice', () => {
    // tp1-5's lesson, kept as a standing invariant: the arrival gate and the too-close
    // test are the same ROM byte. Writing them as two numbers is what made W-032's
    // no-flip branch unreachable for a whole review cycle. Do not split them again.
    expect(TANKER_SPLIT_DEPTH).toBe(SPLIT_TOO_CLOSE_DEPTH)
  })
})
