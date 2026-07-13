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
// ── Wave choice is not arbitrary ─────────────────────────────────────────────
// AVOIDR also runs on wave 10, but wave 10 is an OPEN sheet (lev_open[9]=0xff,
// geometry.ts ROM_OPEN) where lanes clamp instead of wrapping and "away from the
// player" stops being well-defined at the edge. Wave 15 is AVOIDR on a CLOSED
// tube. Likewise COWJMP is tested on wave 5 (closed), not 9 or 13.
import { describe, it, expect } from 'vitest'
import { playingState } from './helpers'
import { stepGame, makeEnemy } from '../../src/core/sim'
import { levelParams, SIM_STEP } from '../../src/core/rules'
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
  s.spawn.remaining = 0          // no reinforcements — one enemy, one program
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

/** Signed lane delta on a closed tube, taking the short way round. */
function signedDelta(from: number, to: number, laneCount: number): number {
  let d = (to - from) % laneCount
  if (d > laneCount / 2) d -= laneCount
  if (d < -laneCount / 2) d += laneCount
  return d
}

/** The direction of each COMPLETED flip: a settled lane change. */
function flipDirections(samples: Sample[], laneCount: number): number[] {
  const dirs: number[] = []
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].lane !== samples[i - 1].lane) {
      dirs.push(Math.sign(signedDelta(samples[i - 1].lane, samples[i].lane, laneCount)))
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
    const laneCount = s.tube.laneCount
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
    expect(flipDirections(samples, laneCount)).toEqual([])
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

    expect(flipDirections(samples, s.tube.laneCount).length, 'MOVJMP must flip at all')
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

    expect(flipDirections(samples, s.tube.laneCount).length, 'SPIRAL must flip')
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
    const dirs = flipDirections(climbSamples(s, 200), s.tube.laneCount)

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
      flipDirections(samples, s.tube.laneCount),
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
      flipDirections(samples, s.tube.laneCount).length,
      'with no spike underfoot, COWJMP must reach its VJUMPS',
    ).toBeGreaterThan(0)
  })
})

describe('tp1-4 — wave 15 (AVOIDR): the avoidance flipper flees the player', () => {
  // VCHPLA (toward the player) immediately followed by VCHROT (reverse it).
  // Ours picks a direction at random, so across three seeds it cannot keep
  // choosing "away" — that is what makes this a real test and not a coin toss.
  // Wave 15, not wave 10: wave 10's sheet is OPEN and its edge lanes clamp.
  it.each([1, 7, 99])('flees on every flip (seed %i)', (seed) => {
    const s = flipperOnWave(15, { lane: 8, depth: 0, playerLane: 10, seed })
    const laneCount = s.tube.laneCount
    const samples = climbSamples(s, 120)

    // Only judge flips taken while the player is unambiguously to one side:
    // at half a tube away, "toward" and "away" are the same thing.
    const judged: number[] = []
    for (let i = 1; i < samples.length; i++) {
      if (samples[i].lane === samples[i - 1].lane) continue
      const toPlayer = signedDelta(samples[i - 1].lane, s.player.lane, laneCount)
      if (Math.abs(toPlayer) === laneCount / 2 || toPlayer === 0) continue
      const flip = Math.sign(signedDelta(samples[i - 1].lane, samples[i].lane, laneCount))
      judged.push(flip * Math.sign(toPlayer))   // +1 = toward the player, -1 = away
    }

    expect(judged.length, 'AVOIDR must actually flip').toBeGreaterThanOrEqual(3)
    expect(judged, 'every AVOIDR flip must be AWAY from the player (-1)')
      .toEqual(judged.map(() => -1))
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
        signedDelta(2, a.lane, cur.tube.laneCount),
        signedDelta(10, b.lane, cur.tube.laneCount),
      ])
    }

    expect(deltas.length).toBeGreaterThan(40)
    for (const [da, db] of deltas) {
      expect(db, 'the two flippers must flip in lockstep, not by independent coin flips')
        .toBe(da)
    }
  })
})
