// tests/core/tp1-6.pulsar-yoyo.test.ts
//
// RED suite for story tp1-6 — the PULSAR YO-YO (W-029) and JSTRAI's conversion,
// REKEYED onto the real nymph queue.
//
// tp1-5 already built the motions: CHASER bounces a rim pulsar back down, JPULMO
// reverses it up past PULPOT, JSTRAI converts a bottomed-out spiker. But it keyed
// all three on `ctx.spawnRemaining` — the countdown of a spawn TIMER that ticks
// whether or not the board can accept anybody. The ROM keys them on NYMCOU, the
// count of nymphs STILL QUEUED — and back-pressure means those are different
// numbers precisely when the board is busy: a packed board freezes the queue, so
// NYMCOU holds while a timer would have quietly run to zero and flipped every
// one of these rules mid-wave.
//
// ── What the ROM does (ALWELG.MAC) ───────────────────────────────────────────
//
//   CHASER:1829-1837  a PULSAR reaching the rim: `LDA NYMCOU / IFNE` -> flip
//                     INVDIR and return — sent back down, no chaser conversion,
//                     for as long as ONE nymph remains queued.
//   JPULMO:1789-1799  descending: reverse up once past PULPOT — or IMMEDIATELY,
//                     wherever it is, when `LDY NYMCOU / IFEQ` ("SEND PULSAR
//                     UP"): the yo-yo ends the moment the queue empties.
//   JSTRAI:2236-2248  a spiker bottoming out: `LDA NYMCOU / IFEQ` -> convert to
//                     a flipper-carrying tanker. (The label's comment muses
//                     about "NON SPIKER TYPE CLIMBERS" — the CODE reads NYMCOU
//                     and nothing else. Call sites over comments.)
import { describe, it, expect } from 'vitest'
import { playingState } from './helpers'
import { stepGame, makeEnemy } from '../../src/core/sim'
import { levelParams, SIM_STEP } from '../../src/core/rules'
import { GameState, Pulsar, Tanker } from '../../src/core/state'
import type { Nymph } from '../../src/core/state'
import { tubeForLevel } from '../../src/core/geometry'
import { Input } from '../../src/core/input'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }
const FRAME = SIM_STEP

// The wave-1 PULPOT byte ($A0, WPULPOT ALWELG.MAC:606-609) as a depth. Every stage in
// this suite is wave 1, where $A0 stands under both the frozen constant and the
// wave-parameterised lookup — tp2-1 retires the rules.ts export, so the staging
// tolerance is pinned to the ROM byte itself (the tp1-27 rule).
const PULSAR_A0_DEPTH = (0xf0 - 0xa0) / 224   // ≈ 0.357

const nymph = (lane: number, py: number): Nymph => ({ lane, py })
/** Dormant far-off nymphs: they keep NYMCOU up without hatching into the test. */
const dormant = (n: number): Nymph[] => Array.from({ length: n }, (_, i) => nymph(i, 30000 + 16 * i))

function boardAt(level: number, seed = 5): GameState {
  const s = playingState(seed)
  s.level = level
  s.tube = tubeForLevel(level)
  s.player.lane = 8
  s.bullets = []
  s.spikes = new Array(s.tube.laneCount).fill(0)
  s.enemies = []
  return s
}

function thePulsar(s: GameState): Pulsar | undefined {
  return s.enemies.find((e): e is Pulsar => e.kind === 'pulsar')
}

// ── The rim bounce (CHASER:1829-1837) ────────────────────────────────────────

describe('tp1-6 — a pulsar will not take the rim while ONE nymph is still queued (W-029)', () => {
  it('queue pending: rim -> bounce down, never a chaser; queue empty: it converts', () => {
    // Half A — nymphs queued (one live pulsar, so the queue is NOT frozen; the
    // dormant pys keep hatches out of the window anyway).
    let a = boardAt(1)
    a.enemies = [makeEnemy('pulsar', 0, 0.97, levelParams(1))]
    a.spawn = { nymphs: dormant(3) }
    let bounced = false
    for (let i = 0; i < 60; i++) {
      a = stepGame(a, NEUTRAL, FRAME)
      const p = thePulsar(a)
      expect(p, 'fixture guard: the pulsar must survive').toBeDefined()
      expect(p!.chasing ?? false, 'NYMCOU != 0: the rim must send it DOWN, not convert it').toBe(false)
      if (p!.depth < 0.9) { bounced = true; break }
    }
    expect(bounced, 'liveness: it reached the rim and came back down (a bounce, not a hover)').toBe(true)

    // Half B — the mirror: the identical pulsar with the queue spent converts
    // and stays put. Together the halves pin the KEY, not just the motion.
    let b = boardAt(1)
    b.enemies = [makeEnemy('pulsar', 0, 0.97, levelParams(1))]
    b.spawn = { nymphs: [] }
    let converted = false
    for (let i = 0; i < 60 && !converted; i++) {
      b = stepGame(b, NEUTRAL, FRAME)
      const p = thePulsar(b)
      expect(p, 'fixture guard: the pulsar must survive').toBeDefined()
      converted = p!.chasing === true
    }
    expect(converted, 'NYMCOU == 0: the same arrival becomes a chaser').toBe(true)
  })
})

// ── The descent leg (JPULMO:1789-1799) ───────────────────────────────────────

describe('tp1-6 — the descending pulsar and the emptying queue (W-029)', () => {
  it('descends to PULPOT while nymphs remain — and turns up AT ONCE when the queue empties', () => {
    // Half A — queue pending: a pulsar sent down keeps descending well past the
    // point where a dead key would have flipped it, and reverses at the PULPOT
    // line, not before. (One live enemy: the queue is free, the dormancy is py.)
    let a = boardAt(1)
    const down = makeEnemy('pulsar', 0, 0.6, levelParams(1))
    down.direction = -1
    a.enemies = [down]
    a.spawn = { nymphs: dormant(3) }
    let minDepth = 1
    let rose = false
    for (let i = 0; i < 200; i++) {
      a = stepGame(a, NEUTRAL, FRAME)
      const p = thePulsar(a)
      expect(p, 'fixture guard: the pulsar must survive').toBeDefined()
      minDepth = Math.min(minDepth, p!.depth)
      if (p!.direction === 1) { rose = true; break }
    }
    expect(minDepth, 'it genuinely descends below 0.5 first (a timer key would flip it early)')
      .toBeLessThan(0.5)
    expect(rose, 'liveness: the descent ends in a reversal').toBe(true)
    expect(minDepth, 'the reversal is at the PULPOT line, not past it')
      .toBeGreaterThan(PULSAR_A0_DEPTH - 0.06)

    // Half B — the queue empties MID-DESCENT: "SEND PULSAR UP", wherever it is.
    let b = boardAt(1)
    const sunk = makeEnemy('pulsar', 0, 0.6, levelParams(1))
    sunk.direction = -1
    b.enemies = [sunk]
    b.spawn = { nymphs: dormant(3) }
    for (let i = 0; i < 3; i++) b = stepGame(b, NEUTRAL, FRAME)
    expect(thePulsar(b)!.direction, 'guard: still descending with nymphs queued').toBe(-1)
    expect(thePulsar(b)!.depth, 'guard: still far above PULPOT — only the queue can flip it here')
      .toBeGreaterThan(PULSAR_A0_DEPTH + 0.1)

    b.spawn = { nymphs: [] } // the last nymph hatches (surgically)
    for (let i = 0; i < 2; i++) b = stepGame(b, NEUTRAL, FRAME)
    expect(thePulsar(b)!.direction, 'NYMCOU hit 0: sent up immediately, mid-well').toBe(1)
  })
})

// ── The spiker conversion (JSTRAI:2236-2248) ─────────────────────────────────

describe('tp1-6 — a bottomed-out spiker converts ONLY once the queue is spent', () => {
  function bottomingSpiker(queued: number): GameState {
    const s = boardAt(1, 13)
    // Descending and nearly home: it bottoms out within a few frames.
    const sp = makeEnemy('spiker', 3, 0.05, levelParams(1))
    sp.direction = -1
    sp.fireCooldown = 1e9
    s.enemies = [sp]
    s.spawn = { nymphs: dormant(queued) }
    return s
  }

  it('nymphs queued: it re-arms and climbs again as a spiker; queue empty: it becomes a tanker', () => {
    // Half A — nymphs pending, so "ANY NYMPHS?" says yes and it stays a spiker.
    let a = bottomingSpiker(2)
    for (let i = 0; i < 40; i++) a = stepGame(a, NEUTRAL, FRAME)
    expect(a.enemies.length, 'fixture guard: it must survive the bounce').toBe(1)
    expect(a.enemies[0].kind, 'NYMCOU != 0: no conversion — it hops and climbs again').toBe('spiker')
    expect(a.enemies[0].direction, 'liveness: it turned around at the bottom').toBe(1)

    // Half B — the queue is spent: the same bottom-out converts it into the
    // flipper-carrying tanker ("CONVERT IT TO TANKER ... CARRYING FLIPPERS").
    let b = bottomingSpiker(0)
    let tanker: Tanker | undefined
    for (let i = 0; i < 40 && !tanker; i++) {
      b = stepGame(b, NEUTRAL, FRAME)
      tanker = b.enemies.find((e): e is Tanker => e.kind === 'tanker')
    }
    expect(tanker, 'NYMCOU == 0: the spiker converts at the bottom').toBeDefined()
    expect(tanker!.contains, 'ZCARFL: it carries flippers').toBe('flipper')
  })
})
