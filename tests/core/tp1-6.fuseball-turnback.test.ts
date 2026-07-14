// tests/core/tp1-6.fuseball-turnback.test.ts
//
// RED suite for story tp1-6 — the FUSEBALL TURN-BACK (W-024), keyed on NYMCOU.
//
// ── What the ROM does (ALWELG.MAC) ───────────────────────────────────────────
//
//   JFUSEUP:2110  climbing, not yet at the top: `LDY NYMCOU / IFNE` — nymphs
//                 left? — then `LDY CURWAV / CPY I,17. / IFCC` — EARLY wave? —
//                 then `CMP I,20  ;YES. TURN BACK BEFORE TOP`: past INVAY $20
//                 (depth (0xf0-0x20)/224 ≈ 0.9286) the climb is over and the
//                 fuse takes a lateral roll instead of an arrival.
//          2118  `RTS ;NONE LEFT. HEAD FOR TOP` — NYMCOU == 0 disables the cap
//                 outright, whatever the wave.
//          2131  descending: `JSR JSMOVD / CMP I,080 / IFCS ;AT BOTTOM OF
//                 RANGE?` — at INVAY $80 (depth 0.5) it rolls again.
//   JJUMPM:1929  the roll's landing frame REVERSES the vertical direction
//                 (`EOR I,INVDIR ;REVERSE UP DOWN DIRECTION`) — that reversal
//                 is what turns the two rolls above into a YO-YO between
//                 depth ~0.5 and ~0.93. And right below it (1932-1943): with
//                 NYMCOU == 0 the landing is overridden to send the fuse UP.
//   JFUSKI:1994  the fuse kill is `LDA X,INVAY / CMP CURSY / IFEQ` — EXACTLY
//                 the rim, same line. A patrolling fuse brushing depth 0.9286
//                 is HARMLESS in the arcade, even though that height is above
//                 our PLAYER_RIM_DEPTH (0.92) grab line. W-024 makes fuses
//                 LIVE in that band, so the port must gate the fuse kill at
//                 the rim itself or the patrol becomes randomly lethal.
//
// CURWAV is 0-based (tp1-23): `CPY I,17.` caps displayed waves 1-17, and wave
// 18 is the first uncapped one — the same boundary where TWFUSC's chase bit
// lights (tp1-25), which is how the patrol hands over to the chase.
//
// The yo-yo's exact trace is seed- and model-dependent (MAYBLR's random
// mid-band rolls also reverse on landing), so these tests pin the ENVELOPE the
// finding names — the $20 ceiling, a real reversal, the $80 floor, liveness —
// not one particular path. See the session's Design Deviations.
import { describe, it, expect } from 'vitest'
import { playingState } from './helpers'
import { stepGame, makeEnemy } from '../../src/core/sim'
import { levelParams, SIM_STEP } from '../../src/core/rules'
import { GameState, Enemy, Fuseball } from '../../src/core/state'
import type { Nymph } from '../../src/core/state'
import { tubeForLevel } from '../../src/core/geometry'
import { Input } from '../../src/core/input'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }
const FRAME = SIM_STEP

/** INVAY $20 — the "TURN BACK BEFORE TOP" line, in our depth units. */
const TURNBACK_DEPTH = (0xf0 - 0x20) / 224 // ≈ 0.9286
/** INVAY $80 — the "BOTTOM OF RANGE", in our depth units. */
const RANGE_FLOOR = (0xf0 - 0x80) / 224 // = 0.5

const nymph = (lane: number, py: number): Nymph => ({ lane, py })

/** A parked, fire-suppressed spiker: holds a slot, threatens nothing. */
function slotHolder(lane: number, level: number): Enemy {
  const e = makeEnemy('spiker', lane, 0.3, levelParams(level))
  e.fireCooldown = 1e9
  return e
}

/**
 * The patrol fixture: the fuse under test plus six slot-holders — SEVEN live,
 * so the queue is frozen by back-pressure and NYMCOU stays put for the whole
 * run. That is the point: the turn-back must key on the QUEUE that is still
 * owed, not on a timer that would have quietly expired mid-test.
 */
function fuseBoard(level: number, queued: number, seed = 11): { s: GameState } {
  const s = playingState(seed)
  s.level = level
  s.tube = tubeForLevel(level)
  s.player.lane = 12
  s.bullets = []
  s.spikes = new Array(s.tube.laneCount).fill(0)
  const fuse = makeEnemy('fuseball', 0, 0.6, levelParams(level))
  s.enemies = [fuse, ...Array.from({ length: 6 }, (_, i) => slotHolder(i + 1, level))]
  s.spawn = { nymphs: Array.from({ length: queued }, (_, i) => nymph(i, 30000 + 16 * i)) }
  return { s }
}

function theFuse(s: GameState): Fuseball | undefined {
  return s.enemies.find((e): e is Fuseball => e.kind === 'fuseball')
}

// ── The yo-yo, and its NYMCOU key — both halves in one test ─────────────────

describe('tp1-6 — early-wave fuseball turns back before the top while nymphs remain (W-024)', () => {
  it('with nymphs queued it patrols the $20-$80 band; with the queue empty it heads for the top', () => {
    // Half A — nymphs remain: the fuse must never arrive. It climbs to the $20
    // line, turns back, and yo-yos above the $80 floor. Liveness at every step:
    // a fuse that parks (or dies) satisfies any ceiling for free.
    let { s } = fuseBoard(12, 3)
    let peak = 0
    let postPeakMin = Infinity
    let moved = 0
    let prevDepth = 0.6
    for (let i = 0; i < 2000; i++) {
      s = stepGame(s, NEUTRAL, FRAME)
      expect(s.mode, 'fixture guard: a patrol fuse must not end the game').toBe('playing')
      const f = theFuse(s)
      expect(f, 'fixture guard: the fuse must survive the whole patrol').toBeDefined()
      expect(s.spawn.nymphs.length, 'fixture guard: back-pressure holds NYMCOU at 3').toBe(3)

      expect(f!.depth, `frame ${i}: "TURN BACK BEFORE TOP" — the fuse may never arrive`)
        .toBeLessThan(TURNBACK_DEPTH + 0.012)
      moved += Math.abs(f!.depth - prevDepth)
      prevDepth = f!.depth
      peak = Math.max(peak, f!.depth)
      if (peak > 0.9) postPeakMin = Math.min(postPeakMin, f!.depth)
      if (peak > 0.9 && f!.depth < RANGE_FLOOR - 0.05) break // fell out of the band: fail below
    }
    expect(peak, 'it really climbs to the $20 line (the cap is reached, not avoided)').toBeGreaterThan(0.9)
    expect(postPeakMin, 'after the peak it comes back DOWN — a turn-back, not a clamp-and-park')
      .toBeLessThan(peak - 0.15)
    expect(postPeakMin, 'the $80 "BOTTOM OF RANGE" holds — it yo-yos, it does not sink away')
      .toBeGreaterThan(RANGE_FLOOR - 0.05)
    expect(moved, 'liveness: the patrol is motion, not a freeze').toBeGreaterThan(0.5)

    // Half B — the mirror that keys the rule on NYMCOU: the identical board with
    // an EMPTY queue must send the same fuse all the way to the rim ("NONE
    // LEFT. HEAD FOR TOP"). Without this half, half A cannot tell a nymph key
    // from a fuse that simply lost the ability to arrive.
    let { s: empty } = fuseBoard(12, 0)
    let topped = 0
    for (let i = 0; i < 2000 && topped < 0.99; i++) {
      empty = stepGame(empty, NEUTRAL, FRAME)
      const f = theFuse(empty)
      expect(f, 'fixture guard: the fuse must survive the climb').toBeDefined()
      topped = Math.max(topped, f!.depth)
    }
    expect(topped, 'queue empty: the fuse arrives at the rim').toBeGreaterThanOrEqual(0.99)
  })
})

// ── The wave boundary: capped through 17, free from 18 (CPY I,17. on 0-based CURWAV) ──

describe('tp1-6 — the "EARLY WAVE?" gate ends after displayed wave 17', () => {
  it('wave 17 still turns back; wave 18, same queue, arrives at the rim', () => {
    // CURWAV is 0-based (tp1-23): displayed wave 17 is CURWAV 16 — carry clear,
    // capped. Displayed 18 is CURWAV 17 — `CPY I,17.` sets the carry, the $20
    // compare is skipped, and the fuse is free to arrive even with nymphs
    // queued. Pinning both sides keeps the classic off-by-one out: a port that
    // reads the story's "wave 17" as 1-based caps one wave too few.
    let { s: capped } = fuseBoard(17, 3)
    let cappedPeak = 0
    for (let i = 0; i < 1500; i++) {
      capped = stepGame(capped, NEUTRAL, FRAME)
      const f = theFuse(capped)
      expect(f, 'fixture guard (wave 17): the fuse must survive').toBeDefined()
      cappedPeak = Math.max(cappedPeak, f!.depth)
      expect(f!.depth, 'displayed wave 17 is still an early wave — the cap holds')
        .toBeLessThan(TURNBACK_DEPTH + 0.012)
    }
    expect(cappedPeak, 'liveness (wave 17): it climbs to the line it is capped at').toBeGreaterThan(0.9)

    let { s: free } = fuseBoard(18, 3)
    let freePeak = 0
    for (let i = 0; i < 2000 && freePeak < 0.99; i++) {
      free = stepGame(free, NEUTRAL, FRAME)
      const f = theFuse(free)
      expect(f, 'fixture guard (wave 18): the fuse must survive').toBeDefined()
      freePeak = Math.max(freePeak, f!.depth)
    }
    expect(freePeak, 'displayed wave 18: nymphs or not, the fuse heads for the top').toBeGreaterThanOrEqual(0.99)
  })
})

// ── The patrol must not be lethal: the fuse kill is exact-rim (JFUSKI) ───────

describe('tp1-6 — a patrolling fuse at $20 cannot grab; only the rim kills (JFUSKI:1994-2002)', () => {
  function boardWithFuseAt(depth: number): GameState {
    const s = playingState(21)
    s.level = 12
    s.tube = tubeForLevel(12)
    s.player.lane = 4
    s.bullets = []
    s.enemies = [makeEnemy('fuseball', 4, depth, levelParams(12))]
    s.spawn = { nymphs: [nymph(0, 30000)] }
    return s
  }

  it('at patrol height on the player\'s own lane the player SURVIVES; at the rim he dies', () => {
    // Half A: TURNBACK_DEPTH (0.9286) is above PLAYER_RIM_DEPTH (0.92), which is
    // exactly why this needs its own gate — `CMP CURSY / IFEQ`: not "near the
    // rim", AT it. W-024 parks fuses in this band for whole waves; if the grab
    // line catches them there, early waves become a coin-flip death.
    let patrol = boardWithFuseAt(TURNBACK_DEPTH)
    patrol = stepGame(patrol, NEUTRAL, FRAME)
    expect(patrol.player.alive, 'a $20-height fuse shares the lane and the player lives').toBe(true)
    expect(patrol.events.some((e) => e.type === 'player-death'), 'no death event either').toBe(false)

    // Half B — the mirror that keeps half A honest: the SAME lane with the fuse
    // truly at the rim is still a kill. (Rim fuses exist here whenever the
    // queue is spent, or on late waves.)
    let rim = boardWithFuseAt(1)
    rim = stepGame(rim, NEUTRAL, FRAME)
    expect(rim.player.alive, 'a fuse AT the rim on the player\'s lane still kills').toBe(false)
  })
})
