// tests/core/tp1-25.fuseball-chase.test.ts
//
// RED suite for story tp1-25 — the OTHER half of W-023.
//
// tp1-5 proved a fuseball below wave 17 does not chase: TWFUSC's first record starts
// at wave 17 (ALWELG.MAC:686-690), so below that CONTOUR falls off the end of the table
// (TE), yields 0, neither of WFUSCH's chase bits is set, and every fuseball decision
// takes LEFRIT — "RANDOMLY CHOOSE LEFT OR RIGHT" (2171-2178). That fix is RIGHT.
//
// But the table STARTS at 17 rather than ending there, and `jfuseup` rolls the LEFRIT
// coin unconditionally at every wave. So we traded a fuseball that always chased for one
// that never does. Neither is the arcade.
//
// ── TWO THINGS THE SOURCE SAYS THAT THE STORY DOES NOT ───────────────────────────────
//
// 1. TR IS NOT A RAMP. The story calls it one ("the chase bits ramp on"). CONTOUR's own
//    type table says `TR=0C;ALTERNATE BETWEEN BYTES 3 & 4` (ALWELG.MAC:414), and DOTR
//    (858-865) is `JSR RANGER / AND I,1 / IFNE / INY` — it takes byte 4 on an ODD offset
//    into the range and byte 3 on an EVEN one. RANGER (848-856) is `TEMP2 - startWave`,
//    and TEMP2 is the 1-based wave (CONTOUR loads CURWAV and INCs it, 415-423).
//
//    So wave 17 is offset 0 — EVEN — and takes byte 3, which is 0.
//    THE FUSEBALL DOES NOT CHASE AT WAVE 17. The first chase is wave 18.
//    The story's title is off by one, and a test written to its wording would have
//    pinned the wrong wave and shipped green.
//
// 2. MAYBLR's gate is ODD, not even — see tp1-25.source-rules.test.ts. AC-3 says
//    "even"; the ROM's comment says "even"; the ROM's CODE says odd. The code wins.
//
// ── THE ONE DESIGN CONTRACT THESE TESTS FIX ─────────────────────────────────────────
// The ROM has TWO fuseball decision points and the port collapses them into one:
//
//   JFUSEUP direct (2135-2140)  at bottom of range -> BIT WFUSCH / IFVS -> FUCHPL|LEFRIT
//   MAYBLR       (2148-2166)    otherwise          -> ... -> parity gate -> FUCHPL|LEFRIT
//
// Only MAYBLR carries the invader-index parity gate. These tests pin the DIRECT branch:
// a lone fuseball riding the tube consults WFUSCH bit 6 and chases, with no parity gate
// in the way. If you implement MAYBLR's parity gate ON the port's single decision point,
// a lone fuseball at an even slot will never chase and these tests will go red — that is
// the signal to log the deviation (AC-3), not to weaken the tests.
import { describe, it, expect } from 'vitest'
import { playingState } from './helpers'
import { stepGame, makeEnemy } from '../../src/core/sim'
import {
  levelParams, SIM_STEP, wfuschForLevel, FUSE_CHASE_AT_TOP, FUSE_CHASE_ON_TUBE,
} from '../../src/core/rules'
import { tubeForLevel } from '../../src/core/geometry'
import type { Input } from '../../src/core/input'
import type { GameState } from '../../src/core/state'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }
const FRAME = SIM_STEP

function base(level: number, playerLane: number): GameState {
  const s = playingState(1)
  s.level = level
  s.tube = tubeForLevel(level)
  s.spikes = new Array(s.tube.laneCount).fill(0)
  s.spawn = { nymphs: [] }
  s.player.lane = playerLane
  s.enemies = []
  return s
}

/**
 * The lanes a lone fuseball visits over 60 frames, with the player parked at `playerLane`.
 *
 * A bolt is a second, noisy channel into the RNG — silence it, or the two runs diverge for
 * a reason that has nothing to do with the chase.
 */
function pathWithPlayerAt(level: number, playerLane: number, fuseLane = 8): number[] {
  let s = base(level, playerLane)
  const f = makeEnemy('fuseball', fuseLane, 0.0, levelParams(level))
  f.fireCooldown = 999
  s.enemies = [f]

  const lanes: number[] = []
  for (let i = 0; i < 60; i++) {
    s = stepGame(s, NEUTRAL, FRAME)
    const e = s.enemies[0]
    if (!e) break
    lanes.push(e.lane)
  }
  return lanes
}

/** The first lane the fuseball actually moves to, or undefined if it never moved. */
function firstLaneChange(level: number, playerLane: number, fuseLane = 8): number | undefined {
  return pathWithPlayerAt(level, playerLane, fuseLane).find((l) => l !== fuseLane)
}

// ── AC-1: WFUSCH comes from TWFUSC, per wave, and TR ALTERNATES ─────────────────────
describe('tp1-25 — WFUSCH is read from TWFUSC per wave (ALWELG.MAC:686-690)', () => {
  it('names the two chase bits the ROM actually tests', () => {
    // JFUSEUP asks two different questions of the same byte:
    //   LDA WFUSCH / IFMI  -> bit 7, "CHASE PLAYER AT TOP?"  (2122-2124)
    //   BIT WFUSCH / IFVS  -> bit 6, "CHASE PLAYER ON TUBE?" (2135-2137)
    // BIT puts operand bit 7 in N and bit 6 in V, which is what IFMI/IFVS read.
    expect(FUSE_CHASE_AT_TOP).toBe(0x80)
    expect(FUSE_CHASE_ON_TUBE).toBe(0x40)
  })

  it('is 0 below wave 17 — no record, CONTOUR hits TE and returns 0', () => {
    // This is tp1-5's finding and it must NOT regress. 0 is a REAL value here, not a
    // "missing" one: a `wfuschForLevel(level) || SOMETHING` fallback would light the
    // chase on every early wave (lang-review TS #4 — `||` where 0 is falsy but valid).
    for (let level = 1; level <= 16; level++) {
      expect(wfuschForLevel(level), `wave ${level} must have no chase bits`).toBe(0)
    }
  })

  it('does NOT chase at wave 17 — TR alternates, and 17 is the EVEN slot (byte 3 = 0)', () => {
    // The headline correction. `.BYTE TR,17.,32.,0,40` and DOTR takes byte 3 on an even
    // offset: wave 17 -> offset 0 -> byte 3 -> 0. The chase begins at wave 18, not 17.
    expect(wfuschForLevel(17)).toBe(0)
    expect(wfuschForLevel(18)).toBe(FUSE_CHASE_ON_TUBE)
  })

  it('alternates 0 / $40 across waves 17-32 (`.BYTE TR,17.,32.,0,40`)', () => {
    for (let level = 17; level <= 32; level++) {
      const odd = (level - 17) % 2 === 1
      expect(wfuschForLevel(level), `wave ${level}`).toBe(odd ? FUSE_CHASE_ON_TUBE : 0)
    }
  })

  it('alternates $40 / $C0 across waves 33-48 (`.BYTE TR,33.,48.,40,0C0`)', () => {
    // From 33 the ON_TUBE bit never drops out again — every wave has at least $40 — and
    // the AT_TOP bit blinks on for the odd offsets.
    for (let level = 33; level <= 48; level++) {
      const odd = (level - 33) % 2 === 1
      const expected = odd ? FUSE_CHASE_AT_TOP | FUSE_CHASE_ON_TUBE : FUSE_CHASE_ON_TUBE
      expect(wfuschForLevel(level), `wave ${level}`).toBe(expected)
      expect(wfuschForLevel(level) & FUSE_CHASE_ON_TUBE, `wave ${level} on-tube`).toBeTruthy()
    }
  })

  it('is a constant $C0 — both bits — from wave 49 (`.BYTE T1,49.,99.,0C0`)', () => {
    for (const level of [49, 50, 64, 65, 98, 99]) {
      expect(wfuschForLevel(level), `wave ${level}`).toBe(FUSE_CHASE_AT_TOP | FUSE_CHASE_ON_TUBE)
    }
  })

  // ── REWORK (Reviewer, round 1). The table's LAST record ends at 99, and we walked
  // off the end of it. ────────────────────────────────────────────────────────────────
  //
  // Above wave 99 no record matched and the lookup fell through to the TE `return 0` —
  // the SAME value that means "no chase" below wave 17. So a wave-100 fuseball dropped
  // back to the LEFRIT coin and stopped chasing altogether: the exact bug this story
  // exists to remove, reinstated at the other end of the table. And it is REACHABLE —
  // `advanceLevel` runs `s.level += 1` on every clear with no cap (sim.ts), and
  // MAX_SELECT_LEVEL bounds only the level-SELECT screen.
  //
  // The ROM never gets there, because CONTOUR intercepts the wave BEFORE the table walk
  // (ALWELG.MAC:415-423):
  //
  //     LDA CURWAV / CMP I,98. / IFCS      ; CURWAV >= 98  (i.e. displayed wave >= 99)
  //       LDA RANDO2 / AND I,1F / ORA I,40 ; -> 0x40..0x5F = 64..95
  //     ENDIF
  //     STA TEMP2 / INC TEMP2              ; -> TEMP2 = 65..96
  //
  // It substitutes a RANDOM wave in 65..96. And that band lies WHOLLY INSIDE the third
  // record (`T1, 49-99`), so every draw yields the same byte: the randomness cannot be
  // observed in WFUSCH at all. **For every wave >= 99 the ROM's WFUSCH is $C0** —
  // deterministically, with no RNG needed to reproduce it. See tp1-25.source-rules.test.ts,
  // which pins that band against the source.
  describe('above the table: the deep waves the ROM folds back in (CONTOUR 415-423)', () => {
    it('stays $C0 above wave 99 — it must NOT fall off the end and revert to the coin', () => {
      for (const level of [100, 101, 150, 999]) {
        expect(wfuschForLevel(level), `wave ${level} fell off the end of TWFUSC`)
          .toBe(FUSE_CHASE_AT_TOP | FUSE_CHASE_ON_TUBE)
      }
    })

    it('from wave 33 the on-tube bit NEVER drops out again — not at 48, not at 99, not ever', () => {
      // The bug in one sweep. From record 2 onward every byte carries $40 (33-48 alternate
      // $40/$C0; 49+ is a flat $C0), so from wave 33 up there is no wave at which the
      // fuseball stops chasing. A zero anywhere in here means it has quietly gone back to
      // flipping a coin — which is precisely what happened at 100.
      //
      // NOTE the floor is 33, not 18: waves 17-32 ALTERNATE, so wave 19 legitimately
      // returns 0. Asserting "never 0 above 17" would be a false test, and I wrote it that
      // way first.
      for (let level = 33; level <= 200; level++) {
        expect(wfuschForLevel(level) & FUSE_CHASE_ON_TUBE, `wave ${level} lost the on-tube bit`)
          .toBeTruthy()
      }
    })
  })
})

// ── AC-4: BOTH sides, driven through a REAL wave ────────────────────────────────────
describe('tp1-25 — below the table the fuseball still ignores the player (no regression)', () => {
  // Run the identical seed twice and move ONLY the player. A fuseball that rolls a coin
  // walks the identical path both times; one that steers by the player walks two
  // different ones. Lanes 2 and 14 sit on OPPOSITE sides of the fuseball's lane 8.
  const ignoresPlayer = (level: number): void => {
    const path = pathWithPlayerAt(level, 2)

    // LIVENESS FIRST. A frozen fuseball also "ignores the player" — it walks [8,8,8,…]
    // twice and satisfies the equality below without moving a muscle. Refuse that.
    expect(
      new Set(path).size,
      `wave ${level}: the fuseball never left its lane — the equality would pass vacuously`,
    ).toBeGreaterThan(1)

    expect(path, `wave ${level}: the player must not be an input`).toEqual(pathWithPlayerAt(level, 14))
  }

  it('wave 1 — the LEFRIT coin, exactly as tp1-5 shipped it', () => ignoresPlayer(1))
  it('wave 16 — the last wave before the table opens', () => ignoresPlayer(16))
  it('wave 17 — STILL the coin: TR alternates and 17 draws byte 3 = 0', () => ignoresPlayer(17))
})

describe('tp1-25 — from wave 18 the fuseball DOES chase (FUCHPL, ALWELG.MAC:2168-2170)', () => {
  const chasesPlayer = (level: number): void => {
    const path = pathWithPlayerAt(level, 2)

    expect(
      new Set(path).size,
      `wave ${level}: the fuseball never left its lane — it cannot be shown to chase`,
    ).toBeGreaterThan(1)

    // The whole point: move the player, and the fuseball's path MUST change.
    expect(path, `wave ${level}: the player must be an input to the decision`)
      .not.toEqual(pathWithPlayerAt(level, 14))
  }

  it('wave 18 — the first wave TWFUSC actually lights the on-tube bit', () => chasesPlayer(18))
  it('wave 49 — $C0, both bits, no alternation left', () => chasesPlayer(49))

  // REWORK (Reviewer, round 1): the table lookup is only half the story — prove the fuseball
  // on the BOARD still hunts past the last record. The unit test above pins the byte; this
  // pins the behaviour, which is what the player actually meets.
  it('wave 100 — past the end of TWFUSC, and it had better still be hunting', () => chasesPlayer(100))
})

// ── AC-2: and it chases BACKWARDS. Do not "fix" this. ───────────────────────────────
describe('tp1-25 — FUCHPL is JCHPLA then JCHROT: it aims, then REVERSES', () => {
  // FUCHPL (2168-2170):
  //     FUCHPL: JSR JCHPLA   ;CHASE PLAYER
  //             JSR JCHROT   ;REVERSE DIRECTION (FUSE IS BACKWARDS)
  //
  // JCHPLA (1876-1889) sets the rotation the SHORTEST way to the player. JCHROT
  // (1722-1726) is `EOR I,INVROT` — it flips that bit straight back. So a chasing
  // fuseball deliberately sets off the LONG way round the tube, away from the player.
  //
  // This is the ROM. It is not a bug and it is not ours to correct: a fuseball that
  // takes the SHORT way is the very thing tp1-5 tore out.
  const FUSE_LANE = 8

  // ONE test, because the two halves are only meaningful TOGETHER. Asserting a single
  // direction is worthless: the seeded LEFRIT coin is itself deterministic, and on this
  // seed it happens to roll lane 7 — so "player clockwise -> steps to 7" passes against
  // the UNFIXED code, for entirely the wrong reason. (It did. That is why this is one test.)
  //
  // What no coin can do is MIRROR the player. Put him on the other side and a chaser's
  // direction must flip; a coin's must not. And the direction it flips TO is the long way
  // round, which is what separates FUCHPL from a JCHPLA that forgot its JCHROT:
  //
  //                      player CW (lane 10)      player CCW (lane 6)
  //   LEFRIT coin        7 (or 9) — same both     the SAME lane either way   <- no mirror
  //   JCHPLA alone       9  (short way, toward)   7  (short way, toward)     <- mirrored, wrong side
  //   FUCHPL (the ROM)   7  (long way, away)      9  (long way, away)        <- what we want
  it('MIRRORS the player and points the LONG way round — away from him, not toward him', () => {
    const playerCW = firstLaneChange(49, FUSE_LANE + 2, FUSE_LANE)
    const playerCCW = firstLaneChange(49, FUSE_LANE - 2, FUSE_LANE)

    // LIVENESS. A fuseball that never moved reports undefined for both, and every
    // assertion below would be comparing nothing to nothing.
    expect(playerCW, 'the fuseball never moved with the player clockwise').toBeDefined()
    expect(playerCCW, 'the fuseball never moved with the player counter-clockwise').toBeDefined()

    // The mirror: a coin gives the same lane on both boards. A chaser cannot.
    expect(playerCW, 'the direction did not respond to the player — this is still a coin')
      .not.toBe(playerCCW)

    // And the side: shortest from 8 to 10 is +1 (CW), so JCHROT must send it to 7.
    // A fuseball that "helpfully" took the short way lands on 9 — do not fix the reversal.
    expect(playerCW, 'took the SHORT way to the player — JCHROT was dropped').toBe(FUSE_LANE - 1)
    expect(playerCCW, 'took the SHORT way to the player — JCHROT was dropped').toBe(FUSE_LANE + 1)
  })
})
