// tests/core/tp1-5.pulsar-fuse-split.test.ts
//
// RED suite for story tp1-5 — the four findings that ride along with the CHASER:
//
//   W-026  the pulse is ONE GLOBAL phase, 7 frames on / 33 off — not a per-enemy
//          0.6 s timer. Every pulsar on the board pulses in unison.
//   W-027  a pulse only kills from inside the potency zone (INVAY < PULPOT).
//   W-023  a fuseball below wave 17 does not chase — it picks left/right at random.
//   W-032  children of a split TOO CLOSE to the player get the NON-FLIPPING cam.
//
// plus prerequisite 4 from tp1-4's review: the pulse kill was never widened
// alongside the mid-jump grab gate, so a pulsar caught between two lines can still
// electrocute a player that a flipper in the same position could not touch.
//
// ── The pulsar's own program (CHASER:1828-1838) ─────────────────────────────
// A pulsar is the one invader that does NOT become a chaser. CHASER's first act is
// to ask whether it is looking at a ZABPUL, and if any nymphs are still unreleased
// it flips INVDIR and returns — "SEND IT DOWN". The pulsar bounces down the well
// and climbs again; it only takes the rim once the wave is spent.
import { describe, it, expect } from 'vitest'
import { playingState } from './helpers'
import { stepGame, makeEnemy } from '../../src/core/sim'
import {
  levelParams, SIM_STEP, PULSAR_NEAR_FAR_DEPTH, PLAYER_RIM_DEPTH,
  TANKER_SPLIT_DEPTH, SPLIT_TOO_CLOSE_DEPTH, BULLET_SPEED,
} from '../../src/core/rules'
import { tubeForLevel } from '../../src/core/geometry'
import { Input } from '../../src/core/input'
import { GameState, Pulsar } from '../../src/core/state'

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

function step(s: GameState, frames: number): GameState {
  let out = s
  for (let i = 0; i < frames; i++) out = stepGame(out, NEUTRAL, FRAME)
  return out
}

/** Narrow away an `undefined` that a failed lookup would otherwise carry into the assertion. */
function must<T>(v: T | undefined, what: string): T {
  if (v === undefined) throw new Error(`fixture: ${what} is missing`)
  return v
}

const pulsarsOf = (s: GameState): Pulsar[] => s.enemies.filter((e): e is Pulsar => e.kind === 'pulsar')

/**
 * Force the pulse ON for this frame.
 *
 * SEAM, and a deliberate one — RE-POINTED BY DEV, exactly as this comment asked. It used
 * to write the pulsar's own two fields, because the pulse was a per-pulsar timer. W-026
 * has landed: the pulse is now ONE global phase (PULSON/PULTIM on GameState), a pulsar has
 * no clock of its own left to write, and the fixture seeds the board's counter instead.
 *
 * `son` is stepped by PULTIM (+4) and the pulse is lit while it is >= 0, so seeding it at
 * 8 leaves it lit (12) after stepPulseClock ticks — which happens after the invaders move
 * and before the kill is resolved, so it is the value the kill will read. The RULE each
 * test below pins (a pulse kills only from inside the potency zone, and never from
 * mid-jump) is untouched by the move; only this helper is.
 */
function pulsing(s: GameState, p: Pulsar): Pulsar {
  s.pulse.son = 8
  p.pulsing = true
  return p
}

describe('tp1-5 — a pulsar at the rim is SENT DOWN while nymphs remain (CHASER:1828-1838)', () => {
  it('turns around at the rim instead of becoming a chaser', () => {
    const s0 = base(1, 10)
    s0.spawn = { nymphs: Array.from({ length: 5 }, (_, i) => ({ lane: i, py: 30000 + 16 * i })) } // NYMCOU != 0 — the wave still owes enemies
    s0.enemies = [makeEnemy('pulsar', 4, 0.99, levelParams(1))]

    const s = step(s0, 20)
    const e = s.enemies[0]
    expect(e).toBeDefined()

    // "SEND IT DOWN": INVAC2 ^= INVDIR. It is heading back down the well, so it is
    // no longer parked against the rim. Today it simply pins at depth 1 and stays.
    expect(e.depth).toBeLessThan(PLAYER_RIM_DEPTH)
  })

  it('takes the rim like any other invader once the nymphs are gone', () => {
    // The clause is guarded by `LDA NYMCOU / IFNE`. With the wave spent, the pulsar
    // falls through into the ordinary CHASER conversion.
    //
    // "It changed lane" is NOT enough to prove that here, and a first draft of this
    // test made exactly that mistake: a rim pulsar still running PULSCH flips too
    // (VCHPLA / VJUMPS), so `lane !== 4` passes with no chaser anywhere in the code.
    // What separates the two is CADENCE. PULSCH spends PUCHDE = 20 frames moving
    // before each flip and then takes 8 more to turn it, so it changes lane about
    // once every 28 frames. TOPPER crouches 4 and jumps at WTTFRA angle-steps a
    // frame — roughly 8 frames a lane at wave 1. Over a 40-frame window that is five
    // hops against one, and only the chaser can produce it.
    const s0 = base(1, 10)
    s0.spawn = { nymphs: [] }              // NYMCOU == 0
    s0.enemies = [makeEnemy('pulsar', 4, 0.99, levelParams(1))]

    let s = s0
    let prev = must(s.enemies[0], 'the pulsar').lane
    let hops = 0
    for (let i = 0; i < 40; i++) {
      s = stepGame(s, NEUTRAL, FRAME)
      const e = must(s.enemies[0], 'the pulsar')
      if (e.lane !== prev) { hops++; prev = e.lane }
    }

    const e = must(s.enemies[0], 'the pulsar')
    expect(e.depth).toBeGreaterThanOrEqual(PLAYER_RIM_DEPTH)  // held the rim
    expect(hops).toBeGreaterThanOrEqual(3)                     // at TOPPER's cadence
  })
})

describe('tp1-5 — the pulse is ONE GLOBAL phase (W-026)', () => {
  it('every pulsar on the board pulses in UNISON, whenever it arrived', () => {
    // MOVINV updates the pulse ONCE per frame, outside the invader loop
    // (ALWELG.MAC:1536-1570): PULSON += PULTIM, and the sign of PULSON IS the
    // on/off state. There is one counter, so there is one phase.
    //
    // Ours gives every pulsar its own pulseTimer, seeded when it spawns — so two
    // pulsars that hatched seven frames apart strobe seven frames apart, which is
    // a thing the cabinet cannot do.
    // The window has to be long enough to contain a pulse, or this test asserts
    // `false === false` sixty times and passes against the very code it exists to
    // reject. Today's clock does not fire until pulseInterval (3.0 s at level 1) has
    // run out — about frame 85 — so a 60-frame window sees no pulse at all. That is
    // a vacuous green, and the first draft of this test scored one.
    //
    // 200 frames spans today's 3.6 s cycle and five of the ROM's 40-frame ones, and
    // `sawPulse` below refuses to let the test pass without having seen the thing it
    // is measuring. Lanes 7 and 9 sit on the far side of a 16-lane circle from the
    // player at 0, so neither pulsar can flip its way onto him and cut the run short.
    let s = base(1, 0)
    s.enemies = [makeEnemy('pulsar', 7, 0.1, levelParams(1))]

    s = step(s, 7)                                        // let the first one age
    s.enemies.push(makeEnemy('pulsar', 9, 0.1, levelParams(1)))  // a late arrival

    let sawPulse = false
    let outOfStep = 0
    for (let i = 0; i < 200; i++) {
      s = stepGame(s, NEUTRAL, FRAME)
      const ps = pulsarsOf(s)
      if (ps.length < 2 || !s.player.alive) break
      const [a, b] = ps
      if (a.pulsing || b.pulsing) sawPulse = true
      if (a.pulsing !== b.pulsing) outOfStep++
    }

    expect(sawPulse, 'no pulse fired in the window — the test would be vacuous').toBe(true)
    expect(outOfStep, 'frames where one pulsar was lit and the other was not').toBe(0)
  })

  it('is ON for exactly 7 frames of a 40-frame cycle', () => {
    // PULSON is a signed byte stepped by PULTIM (= 4 for waves 1-48, WPULTIM,
    // ALWELG.MAC:610-613) and bounced between its two rails (1558-1568): it negates
    // PULTIM at PULSON >= 15 and again at PULSON <= -64.
    //
    // ── This test said NINE, and nine is wrong. The seed decides it. ─────────────────
    // The count above was derived (by TEA, from the audit, which says 9 on / ~31 off)
    // by assuming the counter walks {0,4,8,12,16}. It cannot. INEWLI opens every wave
    // and every life with `LDA I,-1 / STA PULSON` (ALWELG.MAC:46-48) — so PULSON starts
    // at -1, and stepping by 4 forever it can only ever land on 3 (mod 4). The set
    // {0,4,8,12,16} is unreachable; the reachable one is -65 .. 15, twenty-one values.
    //
    // Twenty-one values, two of them turning points, still gives 2*21 - 2 = 40 frames —
    // so the PERIOD the audit claimed is right, and the refuter's "~42" is not. But the
    // lit half (PULSON >= 0) is {3, 7, 11, 15}: the peak once, the other three twice.
    // SEVEN frames on, thirty-three off. Dev landed on 7, this test demanded 9, and the
    // 1981 source settles it — see the tp1-5 deviations.
    //
    // 7 ON of 40 at the ROM's 28.44 fps is 0.25 s of a 1.41 s cycle. Ours used to be ON
    // for PULSE_DURATION = 0.6 s and off for pulseInterval = 3.0 s at level 1 — a 3.6 s
    // cycle, more than twice as long, with an ON window well over twice as wide.
    let s = base(1, 0)
    s.enemies = [makeEnemy('pulsar', 8, 0.05, levelParams(1))]

    const on: boolean[] = []
    for (let i = 0; i < 120; i++) {
      s = stepGame(s, NEUTRAL, FRAME)
      on.push(must(pulsarsOf(s)[0], 'the pulsar').pulsing)
    }

    // Every frame index where the pulse switches from off to on.
    const starts: number[] = []
    for (let i = 1; i < on.length; i++) if (on[i] && !on[i - 1]) starts.push(i)

    // Complete ON runs only — a run still open at the end of the window tells us
    // nothing about its length.
    const runs: number[] = []
    for (const st of starts) {
      let len = 0
      while (st + len < on.length && on[st + len]) len++
      if (st + len < on.length) runs.push(len)   // it ended inside the window
    }

    // 120 frames is three full ROM cycles. Today the first pulse does not even
    // begin until frame ~85 and does not end until ~102, so this window holds at
    // most one complete run.
    expect(runs.length).toBeGreaterThanOrEqual(2)
    for (const len of runs) expect(len).toBe(7)
    expect(starts[1] - starts[0]).toBe(40)
  })
})

describe('tp1-5 — a pulse only kills from inside the potency zone (W-027)', () => {
  it('does NOT kill from below PULPOT, however hard it is pulsing', () => {
    // JPULMO's kill test (ALWELG.MAC:1801-1815) is three conditions, not one:
    // PULSON positive, INVAY < PULPOT, and both legs on the cursor's legs. PULPOT
    // is $A0 for waves 1-64 (WPULPOT, 606-609) — depth 0.357 in our convention,
    // which is PULSAR_NEAR_FAR_DEPTH, the very constant we already use to pick the
    // pulsar's climb speed. A pulsar out in the far third of the well is harmless.
    //
    // resolvePlayerHits asks only `kind === 'pulsar' && pulsing && lane === pl`. No
    // depth at all: a pulsar that hatched at the far end and happens to be strobing
    // kills a player it cannot even reach.
    const s0 = base(1, 6)
    const p = pulsing(s0, makeEnemy('pulsar', 6, 0.20, levelParams(1)))  // 0.20 < 0.357
    expect(p.depth).toBeLessThan(PULSAR_NEAR_FAR_DEPTH)              // premise
    s0.enemies = [p]

    const s = step(s0, 1)
    expect(s.player.alive).toBe(true)
    expect(s.mode).toBe('playing')
  })

  it('DOES kill from inside it', () => {
    // The other side of the same rule — so the fix cannot be "pulsars never kill".
    const s0 = base(1, 6)
    const p = pulsing(s0, makeEnemy('pulsar', 6, 0.50, levelParams(1)))  // 0.50 > 0.357
    expect(p.depth).toBeGreaterThan(PULSAR_NEAR_FAR_DEPTH)           // premise
    s0.enemies = [p]

    const s = step(s0, 1)
    expect(s.player.alive).toBe(false)
  })

  it('never kills from below PULPOT across a whole pulse cycle (the standing rule)', () => {
    // The two tests above force the phase, which pins them to today's per-pulsar
    // clock. This one does not touch the clock at all: it lets the pulsar climb from
    // the far end on the player's own lane and simply asserts the invariant — if the
    // player dies, the pulsar was inside the potency zone when it happened.
    //
    // This is the test that catches a W-026 landed WITHOUT W-027: globalise the
    // clock and the pulse starts firing every 40 frames, deep in the well, where the
    // old slow timer never reached.
    let s = base(1, 6)
    s.enemies = [makeEnemy('pulsar', 6, 0.05, levelParams(1))]

    let deathDepth: number | undefined
    for (let i = 0; i < 160 && s.player.alive; i++) {
      const before = pulsarsOf(s)[0]
      s = stepGame(s, NEUTRAL, FRAME)
      if (!s.player.alive && before !== undefined) deathDepth = before.depth
    }

    // Non-vacuous: it climbs onto him and eventually does kill.
    expect(s.player.alive).toBe(false)
    expect(deathDepth).toBeDefined()
    expect(deathDepth).toBeGreaterThanOrEqual(PULSAR_NEAR_FAR_DEPTH)
  })

  it('does NOT kill from mid-jump — the pulse kill gets the same gate as the grab', () => {
    // Prerequisite 4. resolvePlayerHits already excludes a mid-jump GRABBER: an
    // invader caught between two lines is not on your line, and you can rotate
    // through it (JKITST's `IFPL`, ALWELG.MAC:1981-1982). The ROM's pulse kill has
    // the same shape — it wants BOTH of the pulsar's legs on BOTH of the cursor's
    // legs (1808-1814), which a jumping pulsar, straddling two lines, does not have.
    //
    // Our grab gate was widened to read the STATE rather than the kind. The pulse
    // branch beside it was not, so a pulsar mid-flip electrocutes a player that the
    // identical flipper mid-flip cannot lay a finger on.
    const s0 = base(1, 6)
    const p = pulsing(s0, makeEnemy('pulsar', 6, 0.50, levelParams(1)))
    p.jumpAngle = 3                    // caught between two lines
    s0.enemies = [p]

    const s = step(s0, 1)
    expect(s.player.alive).toBe(true)
  })
})

describe('tp1-5 — a fuseball below wave 17 does not chase (W-023)', () => {
  it('ignores the player entirely: the same seed walks the same path wherever he stands', () => {
    // WFUSCH's two chase bits come from TWFUSC (ALWELG.MAC:686-690), whose FIRST
    // record starts at wave 17 and whose table ends in TE. Below 17 CONTOUR's
    // end-of-table path yields 0, so NEITHER bit is set and JFUSEUP/MAYBLR always
    // take the LEFRIT branch — which reads RANDOM (2171-2178). The player is not an
    // input to the decision at all.
    //
    // So: run the identical seed twice and move only the PLAYER. A fuseball that
    // rolls a coin walks the identical path both times. A fuseball that steps toward
    // the player — ours, via laneStepToward — walks two different paths, and that
    // difference is the whole finding.
    const pathWithPlayerAt = (playerLane: number): number[] => {
      let s = base(1, playerLane)
      const f = makeEnemy('fuseball', 8, 0.0, levelParams(1))
      f.fireCooldown = 999            // no bolts: a bolt is a second, noisy channel
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

    // LIVENESS FIRST. Two identical paths prove the player is not an input — but a
    // fuseball frozen solid also walks two identical paths ([8,8,8,…]), and would
    // satisfy the assertion below without moving a muscle. The pair of tests this one
    // replaced carried exactly this guard ("actually closes the gap — it is steering,
    // not frozen") and dropping it was a regression the Reviewer caught. A random
    // walker MUST visit more than one lane in 60 frames.
    const path = pathWithPlayerAt(2)
    expect(
      new Set(path).size,
      'the fuseball never left its lane — the equality below would pass vacuously',
    ).toBeGreaterThan(1)

    // Lane 2 and lane 14 are on OPPOSITE sides of the fuseball's lane 8, so a
    // chasing fuseball is pulled in opposite directions by the two runs.
    expect(path).toEqual(pathWithPlayerAt(14))
  })
})

describe('tp1-5 — a split too close to the player produces NON-FLIPPING children (W-032)', () => {
  // ── ONE ROM CONSTANT, TWO TESTS. This is the whole finding. ──────────────────────
  //
  // JSMOVE (ALWELG.MAC:1748-1758) auto-splits a climbing CARRIER:
  //
  //     CMP CURSY / BEQ ATOP / IFCC   ;AT TOP?      -> JSR CHASER
  //     ELSE
  //     CMP I,20  / IFCC              ;TOO CLOSE TO TOP FOR CARRIER?
  //                                   -> JSR KILINV   ;SPLIT CARRIER
  //
  // and the KILINV that split it routes through SPLCHA (2344), whose too-close test is
  // the SAME compare (1494-1502):
  //
  //     LDA TEMP0 / CMP I,20 / IFCC   ;SPLITTING TOO CLOSE TO PLAYER?
  //                                   -> TAY / JSR NEWGEN   ;YES. NO FLIPPING
  //
  // Both are `CMP I,20`. So in the arcade EVERY tanker that arrives under its own steam
  // splits INSIDE the too-close band, by construction, and its children ALWAYS get
  // NEWGEN — TNEWCAM[ZABFLI] = NOJUMP. A tanker only produces flipping children when it
  // is SHOT further down the well, below $20.
  //
  // $20 = INVAY 32, and depth = (0xf0 - INVAY) / 224, so the band is depth > 0.9286 —
  // which is SPLIT_TOO_CLOSE_DEPTH exactly. The arrival gate must therefore sit AT OR
  // BEYOND that line, or the two rules are describing different places and the
  // too-close branch can never fire.
  //
  // Wave 3's flipper cam is SPIRAL, which flips constantly, so "did the children flip?"
  // is trivially observable.

  it('the carrier auto-split cannot fire SHALLOWER than the too-close band', () => {
    // The bug tp1-5 shipped, stated as an invariant. TANKER_SPLIT_DEPTH was 0.9
    // (INVAY 38.4) while the too-close test reads $20 (INVAY 32 = depth 0.9286) — so
    // the tanker was always destroyed 0.029 depth-units BEFORE it could enter the band
    // its own rule is written for, and `t.depth >= SPLIT_TOO_CLOSE_DEPTH` was dead code.
    // Correct in isolation, unreachable in play, and stamped `remediated_by` regardless.
    expect(
      TANKER_SPLIT_DEPTH,
      'the arrival gate fires below $20, so SPLCHA\'s too-close branch can never be true',
    ).toBeGreaterThanOrEqual(SPLIT_TOO_CLOSE_DEPTH)
  })

  /**
   * Let a tanker CLIMB to its own arrival and split THERE — no bullet, no hand-placed
   * depth. This is the only way a tanker ever splits near the rim in the real game, and
   * it is the state SPLCHA's rule is written for. The test it replaces seated a tanker
   * at depth 0.95 by hand: a depth no tanker in this game has ever occupied, because
   * `resolveTankerArrivals` destroys it at 0.9 and its fastest climb is 0.0151/frame.
   * A test that builds its own premise cannot falsify anything.
   */
  function climbUntilSplit(level: number, startDepth: number): GameState {
    let s = base(level, 12)                 // player far from lane 5: nothing is grabbed
    const t = makeEnemy('tanker', 5, startDepth, levelParams(level), 'flipper')
    t.fireCooldown = 999                    // no bolts: a bolt is a second, noisy channel
    s.enemies = [t]

    for (let i = 0; i < 400; i++) {
      s = stepGame(s, NEUTRAL, FRAME)
      if (!s.enemies.some((e) => e.kind === 'tanker')) return s
    }
    throw new Error('fixture: the tanker never split — it never reached its arrival depth')
  }

  it('children of a tanker that ARRIVES on its own never flip', () => {
    const atSplit = climbUntilSplit(3, 0.5)
    expect(atSplit.tube.closed).toBe(true)     // premise: wave 3 is a closed tube

    // splitTanker straddles the parent's lane: the children land on 4 and 6.
    const born = atSplit.enemies.filter((e) => e.kind === 'flipper')
    expect(born, 'the arrival should have burst the tanker into two children').toHaveLength(2)
    expect(born.map((k) => k.lane).sort((a, b) => a - b)).toEqual([4, 6])

    // ── RE-SEATED BY tp1-24 (test maintenance, not a goalpost move) ──────────────────
    // This used to step a fixed 16 frames and assert the children were STILL on lanes 4
    // and 6, with `chasing === false` carried as a premise. Both only held because the
    // children were seated at SPLIT_CHILD_DEPTH = 0.85 — low enough that 16 frames of
    // climb could not reach the rim.
    //
    // tp1-24 closes W-030's open half: the children are now born at the PARENT's own
    // depth (0.9286 — KILINV 2300-2302 -> ACTINV 1219-1226), from which they reach the
    // rim on frame 10, become CHASERS, and begin WALKING it. That is a lane change, it
    // is authentic, and it is not a flip — but a fixed window cannot tell the two apart,
    // so the old spelling would go red on a correct implementation.
    //
    // The rule is unchanged; only the window is gone. A child must not change lane while
    // it is still BELOW the rim, because below the rim only a FLIP can move it. That
    // holds whatever depth it is born at, and it is what W-032 actually says.
    let s = atSplit
    let prev = new Map(s.enemies.filter((e) => e.kind === 'flipper').map((k, i) => [i, k.lane]))
    let observed = 0

    for (let f = 0; f < 40; f++) {
      s = step(s, 1)
      const kids = s.enemies.filter((e) => e.kind === 'flipper')
      if (kids.length !== 2) break

      kids.forEach((k, i) => {
        if (k.depth < 1) {
          observed++
          expect(
            k.lane,
            `a child flipped on frame ${f} (depth ${k.depth.toFixed(3)}, still below the rim) — on NOJUMP it must sit on the lane it landed on`,
          ).toBe(prev.get(i))
        }
      })
      prev = new Map(kids.map((k, i) => [i, k.lane]))
    }

    // Without this the loop above passes vacuously if the children never climb.
    expect(observed, 'no child was ever seen below the rim — the flip assertion never ran').toBeGreaterThan(0)
  })

  it('children of a tanker SHOT deep in the well still get the wave\'s program, and do flip', () => {
    // The other side of the threshold, so "no flipping" cannot be applied to every
    // split. This is the one path that is genuinely reachable with a bullet: a tanker
    // shot at depth 0.50 is nowhere near $20, so its children run SPIRAL and must move
    // off the lanes they landed on. If this ever goes red, the fix overshot and made
    // EVERY split non-flipping.
    const s0 = base(3, 12)
    s0.enemies = [makeEnemy('tanker', 5, 0.50, levelParams(3), 'flipper')]
    // Seated ONE charge-step rimward so it lands ON the tanker at COLLIS, which runs after
    // MOVCHA (tp1-16/W-001). A charge parked exactly on its target is 9 along-units PAST it
    // by the time anything checks — outside the ROM's ENSIZE=7 window, though the invented
    // 0.06 used to catch it. Still a point-blank split at ~0.50; only the seat moved.
    s0.bullets = [{ lane: 5, depth: 0.50 + BULLET_SPEED * FRAME }]

    const s = step(s0, 20)
    const kids = s.enemies.filter((e) => e.kind === 'flipper')
    expect(kids).toHaveLength(2)

    expect(kids.map((k) => k.lane).sort((a, b) => a - b)).not.toEqual([4, 6])
  })
})
