// tests/core/tp1-3.cheap-wins.test.ts
//
// Story tp1-3 — the CORE half of the nine one-line ROM-fidelity fixes, each
// carved out of the 2026-07-12 primary-source audit against Dave Theurer's
// original 1981 assembler (~/Projects/tempest-source-text — the LF copy).
//
// Covered here (the shell half is tests/shell/tp1-3.cheap-wins.test.ts):
//   AC3  B-016  SCORE_SPIKE_SEGMENT is 1, not 3            (rules.ts:27)
//   AC5  B-009  demo auto-fire is `< 2` lanes, not `<= 2`  (sim.ts:680)
//   AC6  W-040  the spiker hops to the NEEDIEST lane       (sim.ts:169)
//   AC7  W-022  the fuseball's vulnerability is INVERTED   (sim.ts:316, enemies/fuseball.ts:41)
//
// EVERY claim below was re-opened at the primary source during test design — the
// audit's findings are all filed CONFIRMED, and a CONFIRMED is never re-attacked
// by the refutation pass, so it is exactly the class of claim most likely to carry
// a quiet error into a test. A test that pins a WRONG ROM fact is worse than no
// test: it manufactures agreement, and agreement is never audited. What I verified:
//
//   B-016 — the BCD trap. Tempest's scores all end in 0 (flipper 150, tanker 100),
//     the classic signature of an implicit low digit, which would make LIFECT's
//     TEMP0=1 worth TEN points, not one. UPSCORE's body is NOT in the source dump
//     (it is `JSR`ed at ALWELG.MAC:2615 and defined nowhere), so the audit's "1
//     point" rests on Theurer's comment alone. Independent proof found in BONSCO
//     (ALWELG.MAC:266-272), the bonus-score routine, which loads TEMP0 with the
//     comment `;LSB ALWAYS 0`. TEMP0 is a REAL units digit that a routine must
//     explicitly zero when it wants a round number — so LIFECT's TEMP0=1 is 1
//     point. No implicit trailing zero. The claim survives.
//
//   W-040 — ASTRAL (ALWELG.MAC:2260-2291). Theurer's own comment on the compare is
//     `IFCS ;NEEDIEST LINE SO FAR?`, and a dead line (LINEY=0) is scored `LDA I,0FF`
//     — "WORST CASE" — so an EMPTY lane beats every spike. Verified verbatim.
//
//   W-022 — COLCHK's fuse branch (ALWELG.MAC:2965-2979). Three gates: `CMP CURSY /
//     IFNE ;FUSE AT TOP?` (a fuseball at the rim is bulletproof), the base line must
//     match, and `LDA Y,INVAL2 / IFMI ;VULNERABLE FUSE?` — killable only while
//     INVAL2 is NEGATIVE. INVAL2 goes negative ($81/$87) when a lateral jump starts
//     and is set to $20 — positive — the instant the fuse lands on a line, under the
//     comment `;MAKE IT INVINCIBLE` (ALWELG.MAC:1928). Rolling = killable. Parked on
//     a lane = invincible. At the rim = invincible. Verified verbatim.
//
//   B-009 — FIREPC (ALWELG.MAC:2648-2649): `CMP I,2 / IFCC ;TOO CLOSE?`. IFCC is
//     branch-if-carry-clear = strictly less than. Delta 2 does NOT fire.
//
// TEA test-design note: these are BEHAVIOURAL tests through the public core surface
// (stepGame / stepFuseball / demoInput), not assertions on private constants. The
// ROM fixes a BEHAVIOUR; how Dev reaches it is Dev's to choose. The one exception is
// SCORE_SPIKE_SEGMENT, which the ACs name as a constant and which is already imported
// by sim.spikes.test.ts — so it is pinned both as a value and through a scoring run.
import { describe, it, expect } from 'vitest'
import * as Sim from '../../src/core/sim'
import { stepGame } from '../../src/core/sim'
import { stepFuseball } from '../../src/core/enemies/fuseball'
import { SCORE_SPIKE_SEGMENT, levelParams } from '../../src/core/rules'
import { createRng } from '@arcade/shared/rng'
import { playingState } from './helpers'
import type { GameState, Enemy, Fuseball } from '../../src/core/state'
import type { Input } from '../../src/core/input'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }
const DT = 1 / 60

// A board with nothing on it but what a test puts there — no spawns, no spikes.
function isolated(seed: number): GameState {
  const s = playingState(seed)
  s.level = 1
  s.player.lane = 8
  s.enemies = []
  s.bullets = []
  s.spawn = { remaining: 5, timer: 999 } // pending but never fires within a test
  s.spikes = new Array(s.tube.laneCount).fill(0)
  return s
}

// `demoInput` is module-private-by-convention; the attract-demo suite reaches it the
// same way (tests/core/sim.attract-demo.test.ts).
const demoInput = (s: GameState): Input =>
  (Sim as unknown as { demoInput: (s: GameState) => Input }).demoInput(s)

const flipperAt = (lane: number, depth: number): Enemy =>
  ({ kind: 'flipper', lane, depth, flipTimer: 999 }) as Enemy

// ---------------------------------------------------------------------------
// AC3 — B-016: a spike-segment hit is worth ONE point, not three
// ---------------------------------------------------------------------------

describe('AC3 / B-016 — SCORE_SPIKE_SEGMENT is 1 (ALWELG.MAC:2606-2615, "ADD 1 TO SCORE FOR EACH HIT")', () => {
  it('is exactly 1 — not 3, and not a 1..3 range', () => {
    // LIFECT signals UPSCORE with TEMP2=TEMP1=0 and TEMP0=1. BONSCO proves TEMP0 is
    // a real units digit (`;LSB ALWAYS 0`), so there is no implicit trailing zero:
    // one hit, one point. Our shipped 3 came from the book, which was wrong.
    expect(SCORE_SPIKE_SEGMENT).toBe(1)
  })

  it('a single bullet-vs-spike hit awards exactly 1 point end-to-end', () => {
    // Behavioural guard: pinning the constant alone would not catch an award path
    // that multiplies it. Shoot a spike, score exactly 1.
    //
    // Deliberately NOT tuned to a single frame's worth of bullet travel. The original
    // fixture stepped once and assumed the bullet crossed a 0.02 gap — true only while
    // BULLET_SPEED was 2.4. tp1-1's ROM-clock rebase more than halved it (to
    // (9 * ROM_FPS) / WARP_ALONG_SPAN ≈ 1.143 depth units/sec), so one 1/60 frame now
    // descends 0.019 and lands at 0.601, missing `b.depth <= h` by a hair. The AWARD was
    // never wrong; the fixture was silently coupled to the flight time. Step until the
    // bullet RESOLVES instead, so this pins the award and nothing else.
    let s = isolated(4)
    s.spikes[2] = 0.6
    s.bullets = [{ lane: 2, depth: 0.62 }]

    for (let i = 0; i < 60 && s.bullets.length > 0; i++) s = stepGame(s, NEUTRAL, DT)

    expect(s.bullets, 'the spike consumes the bullet').toHaveLength(0)
    expect(s.spikes[2]).toBeLessThan(0.6) // the spike was actually trimmed...
    expect(s.score).toBe(1) // ...and the hit paid exactly ONE point, not three
  })
})

// ---------------------------------------------------------------------------
// AC5 — B-009: the attract demo fires at delta < 2, never at exactly 2
// ---------------------------------------------------------------------------

describe('AC5 / B-009 — demo auto-fire is strictly inside 2 lanes (ALWELG.MAC:2648 `CMP I,2 / IFCC`)', () => {
  const board = (playerLane: number, enemyLane: number): GameState => {
    const s = isolated(3)
    s.player.lane = playerLane
    s.enemies = [flipperAt(enemyLane, 0.5)]
    return s
  }

  it('fires when the enemy is ON the player lane (delta 0)', () => {
    expect(demoInput(board(0, 0)).fire).toBe(true)
  })

  it('fires when the enemy is 1 lane away (delta 1 — the last firing distance)', () => {
    expect(demoInput(board(0, 1)).fire).toBe(true)
  })

  it('does NOT fire when the enemy is exactly 2 lanes away — IFCC is strictly-less-than', () => {
    // This is the whole finding. Our shipped `<= DEMO_FIRE_LANES` fires here; the
    // ROM's branch-if-carry-clear does not. The book's own prose agreed with the
    // ROM ("|lane - CURSL1| < 2") — this is our code diverging from BOTH.
    expect(demoInput(board(0, 2)).fire).toBe(false)
  })

  it('does NOT fire at delta 2 across the wrap seam either (player 0, enemy 14 of 16)', () => {
    // The window is measured on WRAPPED distance, so the seam must obey the same
    // exclusive bound — otherwise the fix leaks a firing lane back in at the wrap.
    expect(demoInput(board(0, 14)).fire).toBe(false)
  })

  it('still fires at delta 1 across the wrap seam (player 0, enemy 15) — wrap-awareness survives', () => {
    // Guard against "fixing" the bound by breaking the wrap: 15 is one lane below 0.
    expect(demoInput(board(0, 15)).fire).toBe(true)
  })

  it('fires on an enemy BOLT at delta 1 but not at delta 2 — the bolt shares the window', () => {
    const withBolt = (boltLane: number): GameState => {
      const s = isolated(3)
      s.player.lane = 0
      s.enemies = []
      s.enemyBullets = [{ lane: boltLane, depth: 0.5 }]
      return s
    }
    expect(demoInput(withBolt(1)).fire).toBe(true)
    expect(demoInput(withBolt(2)).fire).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// AC6 — W-040: the spiker relocates to the NEEDIEST lane, not the tallest
// ---------------------------------------------------------------------------

describe('AC6 / W-040 — the spiker hops to the NEEDIEST lane (ASTRAL, ALWELG.MAC:2260-2291)', () => {
  // ASTRAL walks all 16 lines keeping the LARGEST LINEY. LINEY is depth-from-the-rim,
  // so the largest LINEY is the SHORTEST spike — and a dead line scores 0FF, the
  // "WORST CASE", so an EMPTY lane beats every standing spike. The spiker deliberately
  // goes where a spike is most needed. Ours goes to the TALLEST — which is why our
  // spikes pile into one lane while the arcade's spread across the well.
  //
  // Setup: park the spiker at the far end about to bottom out, so it must relocate.
  const aboutToHop = (seed: number): GameState => {
    const s = isolated(seed)
    s.enemies = [{ kind: 'spiker', lane: 5, depth: 0.02, direction: -1 } as Enemy]
    return s
  }

  const spikerLane = (s: GameState): number | undefined =>
    s.enemies.find((e) => e.kind === 'spiker')?.lane

  it('hops to the SHORTEST standing spike when every lane has one', () => {
    let s = aboutToHop(11)
    s.spikes = new Array(s.tube.laneCount).fill(0.6) // a tall, uniform field...
    s.spikes[10] = 0.1 // ...with one obviously neediest lane
    for (let i = 0; i < 60; i++) s = stepGame(s, NEUTRAL, DT)

    expect(spikerLane(s), 'the spiker survives the hop').toBeDefined()
    expect(spikerLane(s)).toBe(10)
  })

  it('prefers an EMPTY lane over every standing spike — a dead line is the ROM\'s WORST CASE (0FF)', () => {
    let s = aboutToHop(11)
    s.spikes = new Array(s.tube.laneCount).fill(0.6)
    s.spikes[7] = 0 // an empty lane: LINEY = 0 → scored 0FF → it wins outright
    for (let i = 0; i < 60; i++) s = stepGame(s, NEUTRAL, DT)

    expect(spikerLane(s)).toBe(7)
  })

  it('does NOT hop to the tallest spike — the shipped behaviour, inverted', () => {
    // The direct refutation of the old rule. One tall spike, one short: the old code
    // chose the tall lane (and its test asserted exactly that); the ROM chooses short.
    let s = aboutToHop(11)
    s.spikes = new Array(s.tube.laneCount).fill(0.5)
    s.spikes[10] = 0.7 // the tallest — the OLD target
    s.spikes[3] = 0.2 // the shortest — the ROM's target
    for (let i = 0; i < 60; i++) s = stepGame(s, NEUTRAL, DT)

    expect(spikerLane(s)).not.toBe(10)
    expect(spikerLane(s)).toBe(3)
  })

  // ---- ASTRAL's RANDOM SCAN START — the tie-break ---------------------------
  //
  // ASTRAL seeds its scan from `LDA RANDO2 ;START AT A RANDOM LINE` (ALWELG.MAC:2258),
  // walks all 16 lines DOWNWARD, and compares with `IFCS` (>=) — so an EQUAL score
  // DISPLACES the incumbent. The random start therefore IS the tie-break, and a tie is
  // the COMMON case, not a corner: on an empty well every lane scores 0. Without it a
  // fixed scan sends every hop to the SAME lane, trading the tall-lane pile-up for an
  // index pile-up and calling it fidelity — so W-040's whole promise ("the arcade's
  // spikes spread across the well") would go undelivered.
  //
  // The three tests above each build a UNIQUE minimum, so every one of them passes under
  // a fixed ascending scan: they cannot see the start at all. These two are what pin it.

  // Step until it actually relocates — never a fixed frame budget. (tp1-1's ROM-clock
  // rebase halved every speed in the sim; a frame count is not a behaviour.)
  const hopFrom = (seed: number): number | undefined => {
    let s = aboutToHop(seed)
    for (let i = 0; i < 240 && spikerLane(s) === 5; i++) s = stepGame(s, NEUTRAL, DT)
    return spikerLane(s)
  }

  it('scatters the hop across the well when every lane ties — the random start IS the tie-break', () => {
    // `isolated()` leaves every spike at 0, so the board is one big tie. (The spiker
    // lays a stub on its own lane as it descends, which merely excludes lane 5.)
    const landed = new Set<number>()
    for (let seed = 1; seed <= 24; seed++) {
      const lane = hopFrom(seed)
      if (lane !== undefined) landed.add(lane)
    }
    // A fixed scan — ascending or descending — lands EVERY seed on ONE lane, so this
    // assertion is exactly the refutation of one. Measured: 13 distinct lanes.
    expect(
      landed.size,
      `an all-tied well must scatter the hop; got [${[...landed].sort((a, b) => a - b)}]`,
    ).toBeGreaterThan(6)
  })

  it('but the scatter is SEEDED, not ad-hoc — the same seed always hops to the same lane', () => {
    // core/ is a pure deterministic sim (CLAUDE.md's hardest rule): the scan start must
    // come from the RNG carried in GameState, never Math.random. Same seed, same lane.
    expect(hopFrom(7)).toBe(hopFrom(7))
    expect(hopFrom(23)).toBe(hopFrom(23))
  })
})

// ---------------------------------------------------------------------------
// AC7 — W-022: the fuseball is killable ONLY while rolling between lanes
// ---------------------------------------------------------------------------

describe('AC7 / W-022 — the fuseball\'s vulnerability is INVERTED (COLCHK, ALWELG.MAC:2965-2979)', () => {
  const params = levelParams(1)
  const tube = playingState(1).tube

  const fuse = (over: Partial<Fuseball> = {}): Fuseball =>
    ({ kind: 'fuseball', lane: 8, depth: 0.5, jitterTimer: 999, vulnerable: false, ...over }) as Fuseball

  // ---- what SETS the bit: rolling, not sitting -----------------------------
  //
  // The ROM's INVAL2 goes NEGATIVE when a lateral jump starts (JUMPSD writes $81/$87)
  // and POSITIVE the instant the fuse lands on a line (JJUMPM writes $20, ";MAKE IT
  // INVINCIBLE"). Our flag must track the same thing: rolling ⇒ set, settled ⇒ clear.
  //
  // A jitter tick with the player OFF-lane forces a slide (FUSEBALL_MOVE_PROB gates it,
  // so we retry seeds until one rolls — the roll is what we are testing, not the RNG).
  function rollOnce(start: Fuseball, playerLane: number): Fuseball {
    for (let seed = 1; seed < 60; seed++) {
      const out = stepFuseball({ ...start, jitterTimer: 0.0001 }, DT, params, tube, createRng(seed), playerLane)
      if (out.enemy.lane !== start.lane) return out.enemy // it actually slid
    }
    throw new Error('no seed produced a lane slide — FUSEBALL_MOVE_PROB may have changed')
  }

  it('becomes VULNERABLE the moment it rolls to a new lane', () => {
    const rolled = rollOnce(fuse({ vulnerable: false }), 12)
    expect(rolled.lane).not.toBe(8) // it rolled...
    expect(rolled.vulnerable).toBe(true) // ...so it is killable, per INVAL2 going negative
  })

  it('stays VULNERABLE across TWO consecutive rolls — it is a state, not a toggle', () => {
    // The shipped bug in one line: `e.vulnerable = !e.vulnerable` ALTERNATES, so a
    // fuseball that rolls twice flips back to invulnerable while still rolling. The
    // ROM has no such alternation — every jump start writes a negative INVAL2.
    const once = rollOnce(fuse({ vulnerable: false }), 12)
    const twice = rollOnce(once, 12)
    expect(twice.lane).not.toBe(once.lane) // it rolled again...
    expect(twice.vulnerable).toBe(true) // ...and is STILL killable
  })

  it('becomes INVINCIBLE once it settles on a lane (";MAKE IT INVINCIBLE", ALWELG.MAC:1928)', () => {
    // A jitter tick that does NOT slide = the fuse landed and is parked on a line.
    // Pin it where it already is (player on its own lane ⇒ laneStepToward returns 0
    // ⇒ no slide can occur, whatever the RNG rolls).
    const settled = stepFuseball(
      { ...fuse({ vulnerable: true }), jitterTimer: 0.0001 }, DT, params, tube, createRng(1), 8,
    ).enemy
    expect(settled.lane).toBe(8) // it did not roll...
    expect(settled.vulnerable).toBe(false) // ...so it is parked, and bulletproof
  })

  // ---- what the bit GATES: the kill ----------------------------------------

  const shotAt = (f: Fuseball): GameState => {
    const s = isolated(5)
    s.enemies = [f]
    s.bullets = [{ lane: f.lane, depth: f.depth }]
    return s
  }
  const fuseballSurvives = (s: GameState): boolean =>
    stepGame(s, NEUTRAL, DT).enemies.some((e) => e.kind === 'fuseball')

  it('a fuseball ROLLING between lanes dies to a point-blank shot', () => {
    const out = stepGame(shotAt(fuse({ vulnerable: true })), NEUTRAL, DT)
    expect(out.enemies.some((e) => e.kind === 'fuseball')).toBe(false)
    expect(out.score).toBeGreaterThan(0) // the kill scored
  })

  it('a fuseball PARKED on a lane survives that same shot', () => {
    const s = shotAt(fuse({ vulnerable: false }))
    expect(fuseballSurvives(s)).toBe(true)
    expect(stepGame(s, NEUTRAL, DT).score).toBe(0) // no kill ⇒ no points
  })

  it('a fuseball AT THE RIM is bulletproof even while rolling (`CMP CURSY / IFNE ;FUSE AT TOP?`)', () => {
    // The third gate, and the one we never implemented at all: COLCHK refuses the kill
    // when the fuse's Y equals the cursor's — a fuseball that has reached the rim cannot
    // be shot off it, however it is moving. (It remains lethal on CONTACT — that is the
    // grab, resolved separately; this test only asserts the BULLET cannot kill it.)
    const s = shotAt(fuse({ depth: 1, vulnerable: true }))
    expect(fuseballSurvives(s), 'a fuseball at the rim cannot be shot').toBe(true)
  })

  it('the rim rule is about the RIM, not about depth generally — mid-tube it still dies', () => {
    // Guard the guard: a Dev could satisfy the rim test by making the fuseball
    // unkillable at every depth. It must still die at 0.5 while rolling.
    expect(fuseballSurvives(shotAt(fuse({ depth: 0.5, vulnerable: true })))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Scope guard — WD-010 is NOT this story (moved to tp1-1 at SM setup)
// ---------------------------------------------------------------------------
//
// No test here touches rules.ts:51 / warpAccel. Feeding it a 0-based CURWAV is
// ordering-constrained behind tp1-1's frame-rate rebase: fixing it while the 60 is
// still baked into `(60 * 60) / WARP_ALONG_SPAN` re-bakes the 60. Deliberately absent,
// not forgotten. See the session file's SM Assessment.
//
// NOTE for Dev: rules.ts:27 (SCORE_SPIKE_SEGMENT, AC3) IS in scope. Same file,
// nearby line, opposite instruction. Do not conflate them.
