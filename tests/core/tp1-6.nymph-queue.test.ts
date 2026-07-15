// tests/core/tp1-6.nymph-queue.test.ts
//
// RED suite for story tp1-6 — NYMPHS + THE 7-INVADER CAP. This file: the QUEUE
// itself (W-002, W-003, DA-012's core half). Its siblings:
//
//   tp1-6.invader-cap.test.ts        the 7-slot cap and every gate that freezes the queue
//   tp1-6.fuseball-turnback.test.ts  W-024, keyed on NYMCOU
//   tp1-6.pulsar-yoyo.test.ts        W-029 (and JSTRAI's conversion), keyed on NYMCOU
//   tp1-6.source-rules.test.ts       the quarry fingerprint + citation pins
//
// ── The contract these tests define ──────────────────────────────────────────
//
// GameState.spawn carries the wave's enemy supply as a NYMPH QUEUE, not a timer:
//
//   s.spawn.nymphs: Nymph[]            the not-yet-live enemies, each { lane, py }
//   py                                 the ROM's NYMPY — integer frames until hatch,
//                                      decremented by 1 per sim step while movement
//                                      is allowed (MOVNYM: `SEC / SBC I,1`, 1130-1132)
//   NYMCOU                             == s.spawn.nymphs.length (ALCOMN.MAC:916)
//
// The old `{ remaining, timer }` metronome (rules.ts spawnInterval) is the very
// divergence W-003 names ("There is no spawn timer anywhere in ALWELG"): release
// is regulated by SLOT BACK-PRESSURE (see the cap suite), never by elapsed time.
//
// ── What the ROM does (ALWELG.MAC unless noted) ──────────────────────────────
//
//   INIENE:303   NWNYMC -> NYMCOU: the wave's whole budget enters as nymphs
//   ININYM:315   seed nymph i at NYMPY = ((i & $F)<<4)|randomLane — the shift is
//                four ASLs on an 8-BIT accumulator, so the bands WRAP at index 16
//                (rework pin below) — and the all-zero assembled byte is bumped
//                to $0F. pys are STAGGERED ~16 frames apart within one 256-frame
//                window, in per-index bands [16(i mod 16), 16(i mod 16)+15]
//   MOVNYM:1124  every frame, each active nymph: py -= 1; at 0 -> CONYMP (hatch)
//         :1148  while py >= $40 the nymph ROTATES one line every other frame
//                (`LDA QFRAME / AND I,1`) — the far-end crawl
//         :1160  in the ALONE ZONE ($20 <= py < $40) its line is marked off
//                limits; a nymph decrementing INTO an occupied line backs off
//                (`INC X,NYMPY`, 1143) and keeps rotating — no two nymphs commit
//                to the same line within a hatch of each other
//   CONYMP:1179  hatch: the invader starts AT THE BOTTOM (`LDA I,ILINDDY`,
//                depth 0) on the nymph's line; `DEC NYMCOU` (1191)
//
// The queue is CORE state: deterministic from the seed, cloned per step like
// everything else stepGame owns (the purity/determinism tests at the bottom).
import { describe, it, expect } from 'vitest'
import { playingState } from './helpers'
import { createRng } from '@arcade/shared/rng'
import { stepGame, makeEnemy } from '../../src/core/sim'
import { levelParams, SIM_STEP, spawnForLevel } from '../../src/core/rules'
import { initialState, GameState } from '../../src/core/state'
import type { Nymph } from '../../src/core/state'
import { tubeForLevel } from '../../src/core/geometry'
import { Input } from '../../src/core/input'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }
/** One ROM frame. SIM_STEP is 9/256 s — the ROM's own frame (tp1-1). */
const FRAME = SIM_STEP

const nymph = (lane: number, py: number): Nymph => ({ lane, py })

/** A quiet mid-game board on `level`: right tube, no enemies, player parked. */
function boardAt(level: number, seed = 1): GameState {
  const s = playingState(seed)
  s.level = level
  s.tube = tubeForLevel(level)
  s.player.lane = 8
  s.enemies = []
  s.bullets = []
  s.spikes = new Array(s.tube.laneCount).fill(0)
  return s
}

// ── The wave enters as a queue (INIENE/ININYM) ───────────────────────────────

describe('tp1-6 — the wave budget enters as a staggered nymph queue (W-002)', () => {
  it('a fresh game holds its whole level-1 budget as nymphs, in ININYM stagger bands', () => {
    const s = initialState(42)
    const budget = levelParams(1).enemyCount
    expect(s.spawn.nymphs.length, 'NYMCOU must open at the wave budget (INIENE:303-304)').toBe(budget)

    // Every nymph is a legal board position.
    for (const n of s.spawn.nymphs) {
      expect(Number.isInteger(n.lane), 'a nymph lane is a line index').toBe(true)
      expect(n.lane).toBeGreaterThanOrEqual(0)
      expect(n.lane).toBeLessThan(s.tube.laneCount)
      expect(Number.isInteger(n.py), 'NYMPY is a frame count, not seconds').toBe(true)
    }

    // ININYM (315-340): nymph i is seeded at ((i & $F)<<4)|lane — bands of 16
    // frames, one nymph per band FOR THE FIRST SIXTEEN (level 1's TNYMMX budget of
    // 10 never wraps, so here the sorted bands are strict), never 0 (the all-zero
    // assembled byte is bumped to $0F). The wrap itself is pinned below.
    const pys = s.spawn.nymphs.map((n) => n.py).sort((a, b) => a - b)
    for (let i = 0; i < pys.length; i++) {
      expect(pys[i], `sorted nymph ${i} sits in its 16-frame band`).toBeGreaterThanOrEqual(Math.max(1, 16 * i))
      expect(pys[i], `sorted nymph ${i} sits in its 16-frame band`).toBeLessThanOrEqual(16 * i + 15)
    }
  })

  it('the queue is seeded from the game seed: two games from one seed agree', () => {
    const a = initialState(7).spawn.nymphs
    const b = initialState(7).spawn.nymphs
    expect(a).toEqual(b)
    expect(a.length).toBeGreaterThan(0) // guard: agreement over an empty queue proves nothing
  })
})

// ── The 8-bit wrap (review rework, round-trip 1) ─────────────────────────────
//
// ININYM's stagger is `TXA / ASL ASL ASL ASL` (ALWELG.MAC:328-332) — four shifts
// on an EIGHT-BIT accumulator. Index 16 shifts its high bit out through carry and
// lands back in band 0: the cabinet seeds nymphs 16+ INTO THE SAME 256-frame
// window as 0-15, so a big wave opens with interleaved double-density hatching.
// An unbounded `(i << 4)` stretches every wave with budget > 16 — level 7 today,
// and every TNYMMX wave >= 4 once tp1-7 lands — materially slower than the
// arcade's. The Reviewer caught this; the GREEN port and the original band test
// above both assumed the unwrapped read.

describe('tp1-6 rework — ININYM\'s index shift is 8-BIT: bands wrap at nymph 16', () => {
  it('a budget past 16 seeds nymphs 16+ back into the 0-15 bands, all inside one byte', () => {
    const rng = createRng(99)
    const { nymphs } = spawnForLevel(7, rng, 16)
    expect(nymphs.length, 'precondition: level 7 owes more than 16 enemies').toBeGreaterThan(16)
    nymphs.forEach((n, i) => {
      const band = ((i & 0x0f) << 4)
      expect(n.py, `nymph ${i} seeds in band $${band.toString(16)} — the shift is a byte`)
        .toBeGreaterThanOrEqual(Math.max(1, band))
      expect(n.py, `nymph ${i} seeds in band $${band.toString(16)} — the shift is a byte`)
        .toBeLessThanOrEqual(band + 15)
    })
    // NYMPY is one byte: no seed can sit past $FF, ever.
    for (const n of nymphs) expect(n.py, 'the seed window is a single byte').toBeLessThanOrEqual(0xff)
  })

  it('the zero-bump applies POST-wrap: nymph 16 on lane 0 is bumped to $0F like nymph 0', () => {
    // `IFEQ / LDA I,0F` tests the ASSEMBLED byte, after the wrap — so index 16
    // (and 32, …) with lane 0 takes the same $0F rescue as index 0. laneCount 1
    // pins every lane roll to 0, making both zero cases reachable on demand.
    const rng = createRng(1)
    const { nymphs } = spawnForLevel(7, rng, 1)
    expect(nymphs.length, 'precondition: the wrap case exists').toBeGreaterThan(16)
    expect(nymphs[0].py, 'index 0, lane 0: the classic bump').toBe(0x0f)
    expect(nymphs[16].py, 'index 16, lane 0: wrapped to zero and bumped — not born dead').toBe(0x0f)
    for (const n of nymphs) expect(n.py, 'no nymph is ever born at py 0').toBeGreaterThan(0)
  })
})

// ── The march and the hatch (MOVNYM/CONYMP) ─────────────────────────────────

describe('tp1-6 — nymphs march down py and hatch at exactly zero (MOVNYM:1124-1134)', () => {
  it('hatches land on the exact frame the py runs out, on the nymph\'s own lane, at depth 0', () => {
    const s0 = boardAt(1)
    s0.spawn = { nymphs: [nymph(2, 3), nymph(5, 5), nymph(11, 11)] }

    let s = s0
    const hatchedAt: number[] = []
    const hatchDepths: number[] = []
    let seen = 0
    for (let frame = 1; frame <= 13; frame++) {
      s = stepGame(s, NEUTRAL, FRAME)
      if (s.enemies.length > seen) {
        hatchedAt.push(frame)
        // Capture depth AT the hatch — by the loop's end an early hatchling has
        // been climbing for ten frames. (GREEN fixture repair; the intent —
        // "starts at the bottom" — is unchanged, the measurement point moved.)
        hatchDepths.push(s.enemies[s.enemies.length - 1].depth)
        seen = s.enemies.length
      }
    }

    // `SBC I,1 / IFEQ -> JSR CONYMP`: the hatch is the decrement that lands on 0.
    expect(hatchedAt, 'three staggered nymphs hatch on their own frames').toEqual([3, 5, 11])
    expect(s.spawn.nymphs.length, 'a hatched nymph leaves the queue (DEC NYMCOU)').toBe(0)

    // CONYMP: "START AT BOTTOM" — the invader enters at the far end, on the
    // nymph's line (all three pys are < $40, so their lanes were committed).
    const lanes = s.enemies.map((e) => e.lane).sort((a, b) => a - b)
    expect(lanes).toEqual([2, 5, 11])
    for (const d of hatchDepths) {
      expect(d, 'a hatchling starts at the bottom (ILINDDY), not mid-well').toBeLessThanOrEqual(0.05)
    }
  })
})

describe('tp1-6 — the far-end crawl and the committed lane (MOVNYM:1148-1158)', () => {
  it('a far nymph (py >= $40) rotates one lane every other frame; below $40 its lane freezes', () => {
    const s0 = boardAt(1)
    s0.spawn = { nymphs: [nymph(3, 0x48)] }

    // Far leg: 8 of its 72 frames — with py >= $40 throughout — must show the
    // every-other-frame walk: 3-5 lane changes in 8 frames, all one direction.
    let s = s0
    let prev = 3
    let changes = 0
    const steps: number[] = []
    for (let i = 0; i < 8; i++) {
      s = stepGame(s, NEUTRAL, FRAME)
      const n = s.spawn.nymphs[0]
      expect(n, 'the nymph must still be queued this early').toBeDefined()
      if (n.lane !== prev) {
        changes++
        const d = (n.lane - prev + s.tube.laneCount) % s.tube.laneCount
        steps.push(d === 1 ? 1 : -1)
        prev = n.lane
      }
    }
    expect(changes, 'the crawl is one lane per TWO frames — neither parked nor every-frame').toBeGreaterThanOrEqual(3)
    expect(changes).toBeLessThanOrEqual(5)
    expect(new Set(steps).size, 'the ROM walk is `ADC I,1` — one consistent direction').toBe(1)

    // Committed leg: run it down into the alone zone, then the lane never moves.
    while (s.spawn.nymphs.length > 0 && s.spawn.nymphs[0].py >= 0x40) s = stepGame(s, NEUTRAL, FRAME)
    expect(s.spawn.nymphs.length, 'still queued when it crosses $40').toBe(1)
    const committed = s.spawn.nymphs[0].lane
    for (let i = 0; i < 6; i++) {
      s = stepGame(s, NEUTRAL, FRAME)
      if (s.spawn.nymphs.length === 0) break
      expect(s.spawn.nymphs[0].lane, 'below $40 the lane is committed — no rotation').toBe(committed)
    }
  })

  it('the alone zone: two nymphs converging on one lane hatch on DIFFERENT lanes (MOVNYM:1136-1143)', () => {
    const s0 = boardAt(1)
    // Same lane, pys one frame apart: they crawl in lockstep, so without the
    // NEOFLI back-off (`INC X,NYMPY ;YES. BACK OFF`) both would commit to the
    // same line and hatch stacked.
    s0.spawn = { nymphs: [nymph(3, 0x45), nymph(3, 0x46)] }

    let s = s0
    for (let i = 0; i < 140 && s.enemies.length < 2; i++) s = stepGame(s, NEUTRAL, FRAME)

    expect(s.enemies.length, 'both nymphs must hatch inside the window (liveness)').toBe(2)
    // Wave 1 flippers run NOJUMP — no flips — so the hatch lanes are still legible.
    expect(s.enemies[0].lane, 'the alone zone forbids stacked hatches').not.toBe(s.enemies[1].lane)
  })
})

// ── The queue is load-bearing state: clear, respawn, purity, determinism ─────

describe('tp1-6 — the queue is part of the wave, not bookkeeping', () => {
  it('a wave with an empty board but a live queue is NOT clear; empty both is', () => {
    // Half 1: enemies gone, nymphs pending -> the wave still owes enemies.
    let s = boardAt(1)
    s.spawn = { nymphs: [nymph(4, 200)] }
    s = stepGame(s, NEUTRAL, FRAME)
    expect(s.mode, 'nymphs pending: no level-clear').toBe('playing')

    // Half 2 (the mirror — this is what makes half 1 falsifiable): queue empty
    // too, and the same board clears.
    let done = boardAt(1)
    done.spawn = { nymphs: [] }
    done = stepGame(done, NEUTRAL, FRAME)
    expect(done.mode, 'no enemies and no nymphs: the wave is over').toBe('warp')
  })

  it('a mid-wave death re-arms the FULL queue on respawn (board-reset model + INIENE per life)', () => {
    let s = boardAt(4, 9)
    const budget = levelParams(4).enemyCount
    s.spawn = { nymphs: [nymph(1, 500)] } // mid-wave: most of the budget already spent
    // A flipper on the player's lane at the rim grabs on the next step.
    s.enemies = [fabricatedGrabber()]
    s = stepGame(s, NEUTRAL, FRAME)
    expect(s.mode, 'the grab must land (fixture guard)').toBe('dying')

    while (s.mode === 'dying') s = stepGame(s, NEUTRAL, FRAME)
    expect(s.mode).toBe('playing')
    expect(s.enemies.length, 'the respawn board opens empty').toBe(0)
    expect(s.spawn.nymphs.length, 'the respawn re-seeds the whole wave budget').toBe(budget)
  })

  it('stepGame neither reads through nor hands back an aliased queue (core purity)', () => {
    const s0 = boardAt(1)
    s0.spawn = { nymphs: [nymph(2, 50), nymph(9, 80)] }
    const before = JSON.parse(JSON.stringify(s0.spawn.nymphs))

    const s1 = stepGame(s0, NEUTRAL, FRAME)
    expect(s0.spawn.nymphs, 'the input state is never mutated').toEqual(before)

    // The working copy must own fresh nymph objects — a shallow `{...spawn}`
    // aliases the array and every nymph in it, and this is where it fails.
    s1.spawn.nymphs[0].py = -999
    expect(s0.spawn.nymphs[0].py, 'mutating the result must not reach the input').toBe(before[0].py)
  })

  it('the whole queue lifecycle is deterministic from the seed', () => {
    const run = (): { s: GameState; hatchedSeen: number } => {
      let s = playingState(1234)
      s.level = 4
      s.tube = tubeForLevel(4)
      let hatchedSeen = 0
      for (let i = 0; i < 100; i++) {
        const before = s.enemies.length
        s = stepGame(s, NEUTRAL, FRAME)
        hatchedSeen += Math.max(0, s.enemies.length - before)
      }
      return { s, hatchedSeen }
    }
    const a = run()
    const b = run()
    expect(JSON.stringify(a.s.spawn)).toBe(JSON.stringify(b.s.spawn))
    expect(JSON.stringify(a.s.enemies)).toBe(JSON.stringify(b.s.enemies))
    // Guard on CUMULATIVE hatches, not the final frame's population: the run may
    // deterministically pass through a death/respawn (which clears the board and
    // re-arms the queue), so an end-of-run count can be legitimately zero. (GREEN
    // fixture repair, round-trip 1 — the final-frame guard went stale when tp1-27
    // moved the bolt kill line and shifted where the respawn cycle sits.)
    expect(a.hatchedSeen, 'guard: the run must actually hatch something').toBeGreaterThan(0)
  })
})

// ── AC-3's headline: nothing is ever lost ────────────────────────────────────

describe('tp1-6 — conservation: every queued enemy is delivered, none dropped (W-003)', () => {
  it('kills free slots, the queue drains, and total hatched === budget exactly', () => {
    // Level 4: flippers only (no tanker splits to blur the count) and a budget
    // comfortably past the 7-slot cap, so back-pressure genuinely engages.
    let s = playingState(77)
    s.level = 4
    s.tube = tubeForLevel(4)
    s.player.lane = 8
    // Re-seed for the level we just set: playingState carries initialState's
    // LEVEL-1 queue (budget 6), and mutating s.level does not re-run INIENE.
    // (GREEN fixture repair — the original read the level-1 queue and failed
    // its own >7 precondition; intent unchanged: a real level-4 wave.)
    s.spawn = spawnForLevel(4, s.rng, s.tube.laneCount)
    const budget = s.spawn.nymphs.length
    expect(budget, 'precondition: the level-4 budget must exceed the cap').toBeGreaterThan(7)

    let hatched = 0
    let culled = 0
    for (let frame = 0; frame < 3000 && s.spawn.nymphs.length > 0; frame++) {
      // Surgical "kills": retire the oldest enemy every 8th frame so slots keep
      // freeing, and disarm bolts so the fixture player cannot die.
      if (frame % 8 === 0 && s.enemies.length > 0) {
        s.enemies = s.enemies.slice(1)
        culled++
      }
      s.enemyBullets = []
      const before = s.enemies.length
      s = stepGame(s, NEUTRAL, FRAME)
      expect(s.mode, 'fixture guard: the player must survive the whole drain').toBe('playing')
      hatched += Math.max(0, s.enemies.length - before)

      // The invariant AC-3 names: queued + delivered is the budget, every frame.
      expect(hatched + s.spawn.nymphs.length, `frame ${frame}: a spawn went missing`).toBe(budget)
    }

    expect(s.spawn.nymphs.length, 'the queue must fully drain (liveness)').toBe(0)
    expect(hatched, 'every budgeted enemy was delivered — surplus is queued, never dropped').toBe(budget)
    expect(culled, 'guard: the drain actually exercised kills, not an empty loop').toBeGreaterThan(0)
  })
})

/** A flipper standing on the player's rim segment — a one-step grab. */
function fabricatedGrabber() {
  return { ...makeEnemy('flipper', 8, 1, levelParams(4)) }
}
