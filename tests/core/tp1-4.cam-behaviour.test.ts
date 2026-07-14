// tests/core/tp1-4.cam-behaviour.test.ts
//
// RED suite for story tp1-4 — THE CAM, part 1. The behavioural half.
// Cluster C2 of the primary-source audit (W-005, W-006, W-007).
//
// tp1-4.cam-table.test.ts pins the CAM's BYTES. This file pins what those bytes
// DO, and it does so entirely through the public `stepGame` — no interpreter
// internals, no state-field names beyond `lane` and `depth`, which are the tube
// coordinates CLAUDE.md declares fundamental. A faithful port passes this file
// whatever it names its registers.
//
// ── Why these five waves ─────────────────────────────────────────────────────
// CAMWAV (ALWELG.MAC:711-727) hands each wave a different flipper program, so
// the wave IS the test fixture. Each one isolates a different opcode:
//
//   wave 1  NOJUMP   VSMOVE only, forever          → never flips. THE ORACLE.
//   wave 2  MOVJMP   no VSMOVE inside the jump loop → the climb FREEZES mid-flip
//   wave 3  SPIRAL   a VSMOVE INSIDE the jump loop  → the climb CONTINUES mid-flip
//   wave 4  SPIRCH   VSLOOP 2 / VCHROT / VSLOOP 3   → 2 flips, reverse, 3, reverse
//   wave 5  COWJMP   VELTST + VBR0PC                → no flip while on a spike
//   wave 15 AVOIDR   VCHPLA then VCHROT             → flips AWAY from the player
//
// Waves 2 and 3 are the pair that proves an interpreter is really running: they
// differ by ONE opcode's position, and no per-kind stepper with a tunable
// constant can be both at once.
//
// ── The wave brings its own WELL, and the well changes the rules ─────────────
// This header used to say "Wave 15 is AVOIDR on a CLOSED tube". That was false,
// and the fixture below hid it: `flipperOnWave` set `s.level` but never rebuilt
// `s.tube`, and GameState.tube is only replaced on a real level transition — so
// every test in this file ran on LEVEL 1's closed 16-lane circle no matter which
// wave it named. For waves 2/3/4/5/17 that was a harmless coincidence (they are
// closed). For AVOIDR it was fatal.
//
// BOTH of AVOIDR's waves are OPEN sheets:
//   wave 10 → ROM_REMAP[9]  = 0x09 → ROM_OPEN[9]  = 0xff   OPEN, 15 lanes
//   wave 15 → ROM_REMAP[14] = 0x0a → ROM_OPEN[10] = 0xff   OPEN, 15 lanes
// so the one program whose whole purpose is a DIRECTION was never once exercised
// on the board it actually runs on. The fixture now builds the wave's real tube.
//
// An open sheet has no seam, and the ROM knows it: `LDA I,0FF / STA WELTYP` is
// commented ";PREVENT WRAP" (ALWELG.MAC:186-187), and POLDEL (1876-1889) SKIPS
// its `AND I,0F` shortest-way reduction whenever WELTYP is set. On a planar well
// "toward the player" is the plain linear difference — you cannot go the long way
// round, because there is no way round.
import { describe, it, expect } from 'vitest'
import { playingState } from './helpers'
import { stepGame, makeEnemy } from '../../src/core/sim'
import { levelParams, SIM_STEP } from '../../src/core/rules'
import { tubeForLevel, Tube } from '../../src/core/geometry'
import { Input } from '../../src/core/input'
import { GameState, Enemy } from '../../src/core/state'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }

// One ROM frame per step. SIM_STEP is 9/256 s — the ROM's own frame (tp1-1).
const FRAME = SIM_STEP

/** A flipper on `lane` at `depth`, on `level`, with the player parked far away. */
function flipperOnWave(level: number, opts: {
  lane: number, depth: number, playerLane: number, seed?: number,
}): GameState {
  const s = playingState(opts.seed ?? 1)
  s.level = level
  // The wave's OWN well — closed circle or open sheet, 16 lanes or 15. Without
  // this the whole file silently tests wave 1's tube.
  s.tube = tubeForLevel(level)
  s.spikes = new Array(s.tube.laneCount).fill(0)
  s.spawn = { nymphs: [] }          // no reinforcements — one enemy, one program
  s.player.lane = opts.playerLane
  s.enemies = [makeEnemy('flipper', opts.lane, opts.depth, levelParams(level))]
  return s
}

interface Sample { lane: number, depth: number }

/**
 * Step the sim and sample the (single) flipper each frame, stopping when it
 * reaches the rim — past that it becomes a CHASER (story tp1-5) and its lane is
 * no longer governed by the climbing program under test.
 */
function climbSamples(s0: GameState, frames: number): Sample[] {
  let s = s0
  const out: Sample[] = []
  const first = s.enemies[0]
  out.push({ lane: first.lane, depth: first.depth })
  for (let i = 0; i < frames; i++) {
    s = stepGame(s, NEUTRAL, FRAME)
    const e: Enemy | undefined = s.enemies[0]
    if (!e || e.depth >= 0.98) break
    out.push({ lane: e.lane, depth: e.depth })
  }
  return out
}

/**
 * The signed lane difference, as POLDEL (ALWELG.MAC:1876-1889) computes it.
 *
 *   CLOSED tube — take the short way round: `AND I,0F`, then sign-extend when the
 *     delta is >= 8 (`BIT A,EIGHT / ORA I,0F8`, ";TAKE SHORTEST ROUTE").
 *   OPEN sheet  — the RAW linear difference. WELTYP is 0xFF here (";PREVENT WRAP",
 *     ALWELG.MAC:186-187) and POLDEL's `BIT WELTYP / IFPL` guard skips the modular
 *     reduction entirely. There is no way round a sheet, so there is no short way.
 *
 * Using the closed-tube rule on an open sheet is exactly the bug this suite missed.
 */
function laneDelta(tube: Tube, from: number, to: number): number {
  const d = to - from
  if (!tube.closed) return d
  const n = tube.laneCount
  let m = d % n
  if (m > n / 2) m -= n
  if (m < -n / 2) m += n
  return m
}

/** The direction of each COMPLETED flip: a settled lane change. */
function flipDirections(samples: Sample[], tube: Tube): number[] {
  const dirs: number[] = []
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].lane !== samples[i - 1].lane) {
      dirs.push(Math.sign(laneDelta(tube, samples[i - 1].lane, samples[i].lane)))
    }
  }
  return dirs
}

/** The longest run of consecutive frames in which the climb did not advance. */
function longestFrozenRun(samples: Sample[]): number {
  let best = 0, run = 0
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].depth <= samples[i - 1].depth + 1e-9) { run += 1; best = Math.max(best, run) }
    else run = 0
  }
  return best
}

describe('tp1-4 — THE ORACLE: a wave-1 flipper never flips while climbing', () => {
  // AC-4, and finding W-006. CAMWAV's first entry is NOJUMP (ALWELG.MAC:712),
  // whose entire program is:  VSMOVE / VEXIT / VSETPC NOJUMP.  There is no
  // VJUMPS in it. A level-1 flipper climbs its lane and does not leave it —
  // which is why the arcade's first wave is approachable and ours is not.
  //
  // Ours flips on a timer at EVERY level (flipper.ts: `if (e.flipTimer <= 0)`),
  // so this fails today. That is the single sharpest behavioural difference in
  // the whole cluster.
  it('holds its lane for the entire climb', () => {
    const s = flipperOnWave(1, { lane: 4, depth: 0, playerLane: 12 })
    const samples = climbSamples(s, 200)

    // Guard against a vacuous pass: the flipper must actually have climbed a
    // long way, or "it never flipped" means nothing.
    expect(samples.length, 'the flipper must be observed over a real climb')
      .toBeGreaterThan(60)
    expect(samples[samples.length - 1].depth, 'it must actually be climbing')
      .toBeGreaterThan(samples[0].depth + 0.3)

    const lanes = new Set(samples.map((x) => x.lane))
    expect(
      [...lanes],
      `a wave-1 flipper must never change lane while climbing; it visited ${[...lanes]}`,
    ).toEqual([4])
    expect(flipDirections(samples, s.tube)).toEqual([])
  })

  it('still holds on wave 17 — CAMWAV wraps, it does not run off the end', () => {
    // (wave - 1) mod 16 (DOTZAN). Wave 17 is wave 1's program again.
    const s = flipperOnWave(17, { lane: 4, depth: 0, playerLane: 12 })
    const samples = climbSamples(s, 120)
    expect(samples.length).toBeGreaterThan(40)
    expect(new Set(samples.map((x) => x.lane))).toEqual(new Set([4]))
  })
})

describe('tp1-4 — the wave-2 / wave-3 pair: one opcode apart, two behaviours', () => {
  // MOVJMP's jump loop is  VEXIT / VJUMPM / VSKIP0 / VSETPC  — no VSMOVE.
  // SPIRAL's jump loop is  VEXIT / VJUMPM / VSMOVE / VSKIP0 / VSETPC.
  // The ROM spends one byte to make a spiral a spiral. Ours climbs during every
  // flip at every level (flipper.ts:16, `e.depth = Math.min(1, e.depth + ...)`
  // runs before the `if (e.flipping)` early return), so wave 2 is wrong today
  // and no constant can fix it.
  it('wave 2 (MOVJMP): the climb FREEZES while the flip is in progress', () => {
    const s = flipperOnWave(2, { lane: 4, depth: 0, playerLane: 12 })
    const samples = climbSamples(s, 120)

    expect(flipDirections(samples, s.tube).length, 'MOVJMP must flip at all')
      .toBeGreaterThan(0)
    // A MOVJMP jump runs many frames with no VSMOVE in the loop. We do not pin
    // the exact count (that is emergent from JJUMPM's angle-step budget, W-008);
    // we pin that the climb stops, which today it never does.
    expect(
      longestFrozenRun(samples),
      'a MOVJMP flipper must stop climbing while it flips',
    ).toBeGreaterThanOrEqual(3)
  })

  it('wave 3 (SPIRAL): the climb CONTINUES through the flip — it is a spiral', () => {
    const s = flipperOnWave(3, { lane: 4, depth: 0, playerLane: 12 })
    const samples = climbSamples(s, 120)

    expect(flipDirections(samples, s.tube).length, 'SPIRAL must flip')
      .toBeGreaterThan(0)
    // The climb pauses for EXACTLY ONE frame per jump — the frame that runs VJUMPS.
    //
    // This assertion read `.toBe(0)` in RED, which no faithful interpreter can satisfy:
    // VJUMPS and VSMOVE are different opcodes, and SPIRAL's `VEXIT` (ALWELG.MAC:2409)
    // sits between them, so the frame that STARTS the jump has no move in it. Zero was
    // the old stepper's artifact — it advanced depth unconditionally, before it even
    // looked at the flip (flipper.ts:16). The ROM's spiral climbs through all EIGHT
    // angle-steps of the jump (the `VSMOVE` at 2413, inside the loop) and rests only on
    // the one frame that launches it.
    //
    // Pinning the 1 exactly is what keeps the wave-2/wave-3 pair load-bearing, and it is
    // strictly tighter than the RED assertion: MOVJMP freezes for 8 frames (no VSMOVE in
    // its jump loop), SPIRAL for 1, and the old always-climb code for 0. All three are
    // now distinguishable, and only the middle one passes. (Dev, tp1-4.)
    expect(
      longestFrozenRun(samples),
      'a SPIRAL flipper climbs through its jump, pausing only on the VJUMPS frame',
    ).toBe(1)
  })
})

describe('tp1-4 — wave 4 (SPIRCH): reverse after 2 flips, then after 3', () => {
  // VSLOOP 2 / …jumps… / VCHROT / VSLOOP 3 / …jumps… / VCHROT / VSETPC SPIRCH.
  // The rotation bit PERSISTS across jumps and is only ever changed by VCHROT
  // (W-007) — so the directions must run  a a b b b  a a b b b …  with b = -a.
  // Ours draws a fresh coin for every flip (`nextFloat(rng) < 0.5 ? -1 : 1`), so
  // it cannot produce this pattern except by accident.
  it('flips in the ROM\'s 2-then-3 pattern, indefinitely', () => {
    const s = flipperOnWave(4, { lane: 8, depth: 0, playerLane: 0 })
    const dirs = flipDirections(climbSamples(s, 200), s.tube)

    expect(dirs.length, 'need at least one full period plus its repeat')
      .toBeGreaterThanOrEqual(6)

    const a = dirs[0]
    const b = -a
    expect(dirs.slice(0, 6), `expected [a,a,b,b,b,a] with a=${a}`)
      .toEqual([a, a, b, b, b, a])

    // And the period genuinely repeats, rather than the first six lining up by
    // luck: every flip must match the 5-periodic pattern.
    const expected = dirs.map((_, i) => ([a, a, b, b, b][i % 5]))
    expect(dirs).toEqual(expected)
  })
})

describe('tp1-4 — wave 5 (COWJMP): it will not flip off a spike', () => {
  // VSMOVE / VELTST / VBR0PC COWJM2 — if the invader stands on an "enemy line"
  // (a lane carrying a spike) the branch is taken and it just keeps climbing.
  // Only on an open lane does it reach VJUMPS. JELTST, ALWELG.MAC:1697-1707.
  it('climbs a spiked lane without ever flipping off it', () => {
    const s = flipperOnWave(5, { lane: 3, depth: 0.2, playerLane: 11 })
    s.spikes[3] = 0.9        // a tall spike, well above the flipper's depth

    const samples = climbSamples(s, 40)
    expect(samples.length, 'it must stay on the lane long enough to matter')
      .toBeGreaterThan(30)
    expect(
      flipDirections(samples, s.tube),
      'a COWJMP flipper standing on a spike must not flip',
    ).toEqual([])
    // It must still CLIMB — "does not flip" must not be won by standing still.
    expect(samples[samples.length - 1].depth).toBeGreaterThan(samples[0].depth)
  })

  it('but flips freely on a bare lane (the control)', () => {
    const s = flipperOnWave(5, { lane: 3, depth: 0.2, playerLane: 11 })
    s.spikes[3] = 0          // no spike on its lane

    const samples = climbSamples(s, 40)
    expect(
      flipDirections(samples, s.tube).length,
      'with no spike underfoot, COWJMP must reach its VJUMPS',
    ).toBeGreaterThan(0)
  })
})

describe('tp1-4 — AVOIDR: the avoidance flipper flees the player', () => {
  // VCHPLA (toward the player) immediately followed by VCHROT (reverse it): the
  // ROM spends two opcodes to say "flee". AVOIDR runs on waves 10 and 15, and
  // BOTH are open sheets — so an open sheet is not an exotic case for this
  // program, it is the ONLY case.

  /**
   * Judge every flip as +1 (toward the player) or -1 (away), skipping the ones
   * the ROM does not decide by rule:
   *
   *   - a flip STARTING on an edge lane of an open sheet. OKTOJM (ALWELG.MAC:
   *     2051-2060) deliberately reverses the rotation of an invader about to jump
   *     off the edge — "AT RIGHT EDGE? YES CHANGE TO CW JUMP". A flipper that has
   *     fled into the wall turning round is authentic, not a failure to flee.
   *   - a player exactly half a closed tube away, where toward and away coincide.
   */
  function judgeFlips(s0: GameState, frames: number): number[] {
    const tube = s0.tube
    const samples = climbSamples(s0, frames)
    const judged: number[] = []
    for (let i = 1; i < samples.length; i++) {
      const from = samples[i - 1].lane
      if (samples[i].lane === from) continue
      if (!tube.closed && (from === 0 || from === tube.laneCount - 1)) continue // OKTOJM
      const toPlayer = laneDelta(tube, from, s0.player.lane)
      if (toPlayer === 0) continue
      if (tube.closed && Math.abs(toPlayer) === tube.laneCount / 2) continue
      const flip = Math.sign(laneDelta(tube, from, samples[i].lane))
      judged.push(flip * Math.sign(toPlayer))   // +1 = toward the player, -1 = away
    }
    return judged
  }

  // THE CASE THE OLD SUITE COULD NOT SEE.
  //
  // On a 15-lane open sheet the player at lane 12 is +9 from an invader at lane 3.
  // Nine is more than half the board, so this is exactly where "shortest way round"
  // and "the plain difference" DISAGREE — and on a sheet with no seam, only the
  // plain difference exists. Wrap-around arithmetic says the player lies at -6
  // ("just go backwards through the join"), there being no join, and hands AVOIDR a
  // flee direction that walks it straight INTO him.
  //
  // The old fixture never built this well, so this never ran. It is the whole bug.
  it.each([
    { wave: 15, lane: 3, playerLane: 12 },   // player far to the RIGHT  → must flee LEFT
    { wave: 15, lane: 11, playerLane: 2 },   // player far to the LEFT   → must flee RIGHT
    { wave: 10, lane: 3, playerLane: 12 },   // the other AVOIDR wave, also open
  ])('wave $wave: flees a player $playerLane lanes away, across the half-board line', (c) => {
    const s = flipperOnWave(c.wave, { lane: c.lane, depth: 0, playerLane: c.playerLane })
    expect(s.tube.closed, `wave ${c.wave} must be an OPEN sheet — that is the point`).toBe(false)
    expect(
      Math.abs(c.playerLane - c.lane),
      'the player must be MORE than half a board away, or wrap and no-wrap agree',
    ).toBeGreaterThan(s.tube.laneCount / 2)

    const judged = judgeFlips(s, 160)
    expect(judged.length, 'AVOIDR must actually flip').toBeGreaterThanOrEqual(2)
    expect(judged, 'every AVOIDR flip must be AWAY from the player (-1), never toward (+1)')
      .toEqual(judged.map(() => -1))
  })

  // Starting NEAR the player, where wrap and no-wrap initially agree. This one is
  // the most damning of the three, and I nearly wrote it off as a control that would
  // pass either way.
  //
  // It does not pass. The flipper starts at lane 8 with the player at 10, correctly
  // flees DOWN — and keeps fleeing, until around lane 2 it has put more than half the
  // board between them. At that instant the wrap-around arithmetic decides the player
  // is now nearer "the other way", VCHPLA points the wrong way, VCHROT dutifully
  // reverses it, and the flipper TURNS AROUND AND CHARGES BACK. So the bug is not a
  // quiet mis-aim in a corner case: it makes AVOIDR oscillate, fleeing and charging,
  // and it does so from an ordinary starting position on the wave it actually runs on.
  //
  // The seeds are kept for their original purpose: a random direction cannot flee
  // three times out of three by luck.
  it.each([1, 7, 99])('flees a nearby player, and does not turn and charge back (seed %i)', (seed) => {
    const s = flipperOnWave(15, { lane: 8, depth: 0, playerLane: 10, seed })
    const judged = judgeFlips(s, 120)
    expect(judged.length, 'AVOIDR must actually flip').toBeGreaterThanOrEqual(3)
    expect(judged, 'every AVOIDR flip must be AWAY from the player (-1)')
      .toEqual(judged.map(() => -1))
  })

  // And the closed-tube rule must SURVIVE the fix: a closed well really does have a
  // short way round, and VCHPLA must still take it. PULSCH's VCHPLA and the
  // fuseball's steering both lean on this, on wells that DO wrap.
  it('still takes the short way ROUND on a closed tube (the rule that must not break)', () => {
    // Wave 4 (SPIRCH) is closed and 16-lane. Its flips are decided by VCHROT, not
    // VCHPLA, so instead of a flipper this pins the shared helper directly against
    // the ROM's two branches: closed wraps, open does not.
    const closed = tubeForLevel(4)
    const open = tubeForLevel(15)
    expect(closed.closed).toBe(true)
    expect(open.closed).toBe(false)

    // Lane 2 → lane 13 on a CLOSED 16-lane tube: the short way is BACKWARDS (-5),
    // not forwards (+11). `AND I,0F` + sign-extend.
    expect(laneDelta(closed, 2, 13)).toBe(-5)
    // The same pair on an OPEN 15-lane sheet: +11 is simply +11. ";PREVENT WRAP".
    expect(laneDelta(open, 2, 13)).toBe(11)
  })
})

describe('tp1-4 — the interpreter is pure (AC-6)', () => {
  // The CAM must not reach for a clock or a coin. Identical input, identical
  // output — the hard boundary in CLAUDE.md.
  it('stepGame is deterministic across identical runs on a CAM wave', () => {
    const run = (): GameState => {
      let s = flipperOnWave(4, { lane: 8, depth: 0, playerLane: 0, seed: 12345 })
      for (let i = 0; i < 90; i++) s = stepGame(s, NEUTRAL, FRAME)
      return s
    }
    expect(JSON.stringify(run())).toEqual(JSON.stringify(run()))
  })

  it('two flippers in identical positions on the same wave behave identically', () => {
    // A coin-flip flip direction cannot survive this: the two enemies share one
    // RNG cursor, so today they diverge. Under the CAM they are two runs of the
    // same program from the same PC and must stay in lockstep.
    const s = flipperOnWave(2, { lane: 4, depth: 0, playerLane: 12 })
    const params = levelParams(2)
    // Same depth, same program, different lanes — diametrically opposite so
    // neither is nearer the player than the other.
    s.enemies = [
      makeEnemy('flipper', 2, 0.1, params),
      makeEnemy('flipper', 10, 0.1, params),
    ]

    let cur = s
    const deltas: Array<[number, number]> = []
    for (let i = 0; i < 60; i++) {
      cur = stepGame(cur, NEUTRAL, FRAME)
      const [a, b] = cur.enemies
      if (!a || !b) break
      deltas.push([
        laneDelta(cur.tube, 2, a.lane),
        laneDelta(cur.tube, 10, b.lane),
      ])
    }

    expect(deltas.length).toBeGreaterThan(40)
    for (const [da, db] of deltas) {
      expect(db, 'the two flippers must flip in lockstep, not by independent coin flips')
        .toBe(da)
    }
  })
})
