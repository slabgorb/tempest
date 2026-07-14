// tests/core/tp1-5.chaser.test.ts
//
// RED suite for story tp1-5 — THE CAM, part 2. The CHASER.
// Cluster C2, second half: W-009 (the rim state + the pincer rule) and the
// zero-delta branch of JCHPLA that tp1-4's review left open.
//
// tp1-4 landed the CAM interpreter and byte-verified TOPPER's program. What is
// missing is the STATE that runs it: nothing in our port ever converts an invader
// into a chaser, so TOPPER's bytes are dead code and an invader that reaches the
// rim keeps running its climbing program against a depth that is already clamped.
//
// ── What the ROM does (ALWELG.MAC) ──────────────────────────────────────────
//
//   ATOP:1747    JSR CHASER          an invader reaching the rim converts
//   CHASER:1824  pin at CURSY; INMCOU--; INCCOU++; CAMPC = TOPPER; pick direction
//         1845   direction = JCHPLA (shortest way) — UNLESS exactly one other
//                chaser exists, in which case take that one's OPPOSITE. The pincer.
//   JCHPLA:1876  POLDEL to the cursor, then ASL / IFCC: carry CLEAR -> CCW.
//   TOPPER:2447  VSLOOP 4 crouch, VKITST each frame, then jump WTTFRA angle-steps
//                per frame around the rim ("DOUBLE SPEED JUMP").
//
// ── The zero-delta branch (prerequisite 1 from tp1-4's review) ───────────────
// JCHPLA's `ASL` shifts the delta's sign bit into the carry, and `IFCC` takes the
// CCW branch on carry CLEAR — which is delta POSITIVE *or ZERO*. A delta of zero
// is therefore not "no opinion": the ROM sets INVROT to CCW unconditionally.
//
// Ours returns 0 from shortestRot() and jchpla() then declines to touch e.rot at
// all, so an invader standing on the player's own lane keeps whatever rotation it
// happened to be carrying. That is a history-dependent direction where the arcade
// has a fixed one, and CHASER calls JCHPLA to choose its pincer side.
//
// ── The wave brings its own WELL, and the well changes the rules ─────────────
// POLDEL folds the delta into the short way round ONLY on a closed tube; on an
// open sheet `BIT WELTYP / IFPL` skips the reduction entirely (WELTYP is 0xFF
// there — ALCOMN.MAC:717 `;WELL TYPE (0=CLOSED,-1=OPEN)`, stored under Theurer's
// own `;PREVENT WRAP` at ALWELG.MAC:187). A sheet has no seam, so the plain
// linear difference IS the direction, and modular arithmetic INVERTS the answer
// past half a board. Every fixture below therefore builds the wave's real tube,
// and asserts its topology before it asserts anything else.
//
//   wave 1  closed, 16 lanes, flipper CAM = NOJUMP  (a straight climb: no flips)
//   wave 10 OPEN,   15 lanes, flipper CAM = AVOIDR  (VCHPLA then VCHROT: it flees)
//   wave 14 OPEN,   15 lanes, flipper CAM = NOJUMP  (a straight climb on a sheet)
import { describe, it, expect } from 'vitest'
import { playingState } from './helpers'
import { stepGame, makeEnemy } from '../../src/core/sim'
import { levelParams, SIM_STEP, PLAYER_RIM_DEPTH } from '../../src/core/rules'
import { tubeForLevel } from '../../src/core/geometry'
import { Input } from '../../src/core/input'
import { GameState, Enemy } from '../../src/core/state'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }

/** One ROM frame. SIM_STEP is 9/256 s — the ROM's own frame (tp1-1). */
const FRAME = SIM_STEP

/**
 * A state on `level`, carrying that level's REAL well, with the given flippers and
 * the player parked where the caller says. `spawn.remaining = 0` so no
 * reinforcements wander in and disturb the count the pincer rule reads.
 */
function wave(level: number, opts: {
  player: number,
  flippers: readonly { lane: number, depth: number, rot?: -1 | 1 }[],
}): GameState {
  const s = playingState(1)
  s.level = level
  s.tube = tubeForLevel(level)              // the wave's OWN well — never level 1's
  s.spikes = new Array(s.tube.laneCount).fill(0)
  s.spawn = { nymphs: [] }
  s.player.lane = opts.player
  s.enemies = opts.flippers.map((f) => {
    const e = makeEnemy('flipper', f.lane, f.depth, levelParams(level))
    if (f.rot !== undefined) e.rot = f.rot
    return e
  })
  return s
}

function step(s: GameState, frames: number): GameState {
  let out = s
  for (let i = 0; i < frames; i++) out = stepGame(out, NEUTRAL, FRAME)
  return out
}

/** The enemies still on the board, in their original spawn order. */
function enemies(s: GameState): Enemy[] {
  return s.enemies
}

describe('tp1-5 — an invader that reaches the rim becomes a CHASER (W-009)', () => {
  it('stops climbing, holds the rim, and circles it — it does not sit still', () => {
    // Wave 1 is NOJUMP: VSMOVE / VEXIT / VSETPC, forever. A wave-1 flipper NEVER
    // changes lane while it climbs — so any lane movement at all, after it reaches
    // the rim, can only have come from a rim state running TOPPER. That makes
    // NOJUMP the cleanest possible oracle for "the chaser exists".
    const s0 = wave(1, { player: 10, flippers: [{ lane: 4, depth: 0.99 }] })
    expect(s0.tube.closed).toBe(true)          // premise: wave 1 is a closed circle
    expect(s0.tube.laneCount).toBe(16)

    const s = step(s0, 30)
    const e = enemies(s)[0]
    expect(e).toBeDefined()

    // Pinned at the rim ("PLACE EXACTLY AT TOP", CHASER:1825-1826) — it neither
    // sinks back nor is culled.
    expect(e.depth).toBeGreaterThanOrEqual(PLAYER_RIM_DEPTH)

    // And it has MOVED around the rim. Today it stops at lane 4 and stays there
    // for the rest of the game, because NOJUMP has no VJUMPS in it and nothing
    // ever switches it to TOPPER.
    expect(e.lane).not.toBe(4)
  })

  it('circles TOWARD the player, the shortest way round (JCHPLA)', () => {
    // Player at 10, chaser from 4: delta +6 on a 16-lane circle. Forward 6, back
    // 10 — the short way is FORWARD, so the chaser walks 4 -> 5 -> 6 ... toward 10.
    // (Not lane 12: a delta of exactly 8 is a tie on a 16-lane tube, and a fixture
    // that lands on the tie tests the tie-break, not the rule.)
    const s = step(wave(1, { player: 10, flippers: [{ lane: 4, depth: 0.99 }] }), 30)
    const e = enemies(s)[0]

    expect(e.lane).toBeGreaterThan(4)     // moved
    expect(e.lane).toBeLessThanOrEqual(10) // toward the player, and not past him
  })

  it('on an OPEN sheet it takes the LINEAR difference — the long way round does not exist', () => {
    // Wave 14: an open sheet, 15 lanes, and its flipper CAM is NOJUMP — a straight
    // climb, so the lane the chaser starts from is the lane it arrived on.
    //
    // Chaser at 1, player at 12. The plain difference is +11: the chaser must walk
    // UP through 2, 3, 4 ... toward 12. Fold the sheet as if it were a tube and the
    // arithmetic says forward 11 vs back 4 — "shortest" becomes -1 and the chaser
    // marches AWAY from the player, off the low edge. That inversion is exactly the
    // bug that hid inside AVOIDR for a whole review cycle.
    const s0 = wave(14, { player: 12, flippers: [{ lane: 1, depth: 0.99 }] })
    expect(s0.tube.closed).toBe(false)         // premise: wave 14 is an OPEN sheet
    expect(s0.tube.laneCount).toBe(15)

    const s = step(s0, 30)
    const e = enemies(s)[0]

    expect(e.depth).toBeGreaterThanOrEqual(PLAYER_RIM_DEPTH)
    expect(e.lane).toBeGreaterThan(1)          // walked UP toward 12, not down to 0
  })
})

describe('tp1-5 — the PINCER rule (CHASER:1845-1869)', () => {
  it('the SECOND chaser is sent the OPPOSITE way, so the two converge from both sides', () => {
    // `LDA INCCOU / CMP I,1 / IFNE` — when exactly ONE other chaser already exists,
    // the ROM does not call JCHPLA at all. It hunts down that other chaser, reads
    // its INVROT, and takes the opposite. Two chasers pincer the player; they never
    // stack up on the same side of him.
    //
    // Both of these would take the SAME way round on their own: A (lane 4, delta +6)
    // and B (lane 7, delta +3) both want CCW. Only the pincer rule can split them.
    // A is a shade nearer the rim, so it converts first and B converts against a
    // live count of 1.
    const s = step(wave(1, {
      player: 10,
      flippers: [
        { lane: 4, depth: 0.995 },  // A — converts first
        { lane: 7, depth: 0.97 },   // B — converts a frame or two later, INCCOU == 1
      ],
    }), 40)

    const [a, b] = enemies(s)
    expect(a).toBeDefined()
    expect(b).toBeDefined()
    expect(a.depth).toBeGreaterThanOrEqual(PLAYER_RIM_DEPTH)
    expect(b.depth).toBeGreaterThanOrEqual(PLAYER_RIM_DEPTH)

    // A took the shortest way: upward, toward 10.
    expect(a.lane).toBeGreaterThan(4)

    // B was turned around. It walks DOWN from 7, around the far side, to meet the
    // player from the other flank. Without the pincer rule it also walks up and the
    // two simply queue behind each other.
    expect(b.lane).toBeLessThan(7)
  })

  it('a THIRD chaser goes back to the shortest way — the pincer is for exactly one other', () => {
    // The ROM's test is `CMP I,1 / IFNE` — NOT "is there any other chaser". With two
    // already circling, INCCOU is 2, the IFNE takes the JSR JCHPLA branch, and the
    // third chaser simply heads the shortest way like the first did.
    const s = step(wave(1, {
      player: 10,
      flippers: [
        { lane: 4, depth: 0.995 },  // A — INCCOU 0 -> shortest way
        { lane: 7, depth: 0.985 },  // B — INCCOU 1 -> PINCER (opposite of A)
        { lane: 5, depth: 0.97 },   // C — INCCOU 2 -> shortest way again
      ],
    }), 40)

    const [, , c] = enemies(s)
    expect(c).toBeDefined()
    expect(c.depth).toBeGreaterThanOrEqual(PLAYER_RIM_DEPTH)

    // C at lane 5, player at 10: delta +5, forward 5 vs back 11 — the short way is up.
    expect(c.lane).toBeGreaterThan(5)
  })
})

describe('tp1-5 — JCHPLA treats a delta of ZERO as positive (prerequisite 1)', () => {
  // AVOIDR (wave 10) is the instrument. Its first two opcodes are VCHPLA then
  // VCHROT: aim at the player, then reverse — the ROM spends two opcodes to say
  // "flee". That makes the rotation JCHPLA chose directly observable as the lane
  // the flipper jumps to, WITHOUT putting an enemy on the player's lane at the rim
  // (which would just grab him and end the frame).
  //
  // On the player's OWN lane the delta is zero. The ROM's ASL/IFCC sets CCW (+1,
  // lane+1); AVOIDR's VCHROT then reverses it to -1, so the flipper flees DOWN a
  // lane — from 7 to 6 — and it does so no matter what rotation it was carrying.
  //
  // Ours leaves e.rot untouched on a zero delta, so the answer is whatever the
  // invader happened to be holding: a flipper carrying -1 flees to 8, one carrying
  // +1 flees to 6. Same position, same player, two different answers.
  const zeroDeltaLane = (initialRot: -1 | 1): number => {
    const s0 = wave(10, { player: 7, flippers: [{ lane: 7, depth: 0.3, rot: initialRot }] })
    expect(s0.tube.closed).toBe(false)   // premise: wave 10 is an OPEN sheet (AVOIDR's own)
    expect(s0.tube.laneCount).toBe(15)
    // Lane 7 is mid-sheet, so OKTOJM's edge guard (ALWELG.MAC:2051-2060) — which
    // reverses a jump that would go off the end of a planar well — is not in play.
    const s = step(s0, 12)               // AVOIDR lands its jump on frame 9
    return s.enemies[0].lane
  }

  it('is DETERMINISTIC: the same position gives the same direction, whatever the history', () => {
    // AC-1, stated as the audit states it: two enemies in identical positions flip
    // the same way. The rotation an invader is carrying is history — a VCHROT it
    // took ten frames ago — and the ROM's rule overwrites it.
    expect(zeroDeltaLane(-1)).toBe(zeroDeltaLane(1))
  })

  it('resolves to CCW, so an AVOIDR on the player\'s lane flees the way the ROM sends it', () => {
    // Not merely consistent — consistent with the ROM. Zero -> carry clear ->
    // `ORA I,INVROT` -> CCW -> +1; VCHROT reverses it -> -1 -> lane 6.
    expect(zeroDeltaLane(-1)).toBe(6)
    expect(zeroDeltaLane(1)).toBe(6)
  })
})
