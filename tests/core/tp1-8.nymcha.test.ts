// tests/core/tp1-8.nymcha.test.ts
//
// RED suite for tp1-8 — the BEHAVIOUR of NYMCHA, the per-type MIN/MAX population
// solver (W-034). The source bytes are pinned in tp1-8.source-rules.test.ts; this
// file holds our SIM to the composition the ROM's solver actually produces, driven
// through the stable public surface (stepGame + the real nymph hatch), NOT a new
// export — so it runs assertion-RED against today's memoryless `rollSpawnKind`.
//
// What is RED today and GREEN once NYMCHA lands:
//   AC-6  spikers VANISH on every wave WSPIMX has no live record (17-19, 33-42) —
//         and specifically survive the min>max contradiction on 35-39 as ZERO.
//   AC-1  no type ever exceeds its per-wave MAX; the per-wave MIN is guaranteed.
//   AC-2  cargo of a live tanker is RESERVED under its type's max, so a split fits.
//   AC-3  a spiker is biased onto a short/dead line, a tanker onto a long one.
//
// Today's roll is memoryless: it emits spikers on wave 35, fuseballs on wave 17,
// five flippers where the max is three, never guarantees the wave's spiker, and is
// blind to both tanker cargo and line length. Every assertion below fails on it.
import { describe, it, expect } from 'vitest'
import { createRng } from '@arcade/shared/rng'
import { playingState } from './helpers'
import { stepGame, makeEnemy } from '../../src/core/sim'
import { levelParams, SIM_STEP } from '../../src/core/rules'
import type { Enemy, EnemyKind, GameState, Nymph } from '../../src/core/state'
import { tubeForLevel } from '../../src/core/geometry'
import type { Input } from '../../src/core/input'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }
const FRAME = SIM_STEP

/** A cleared, quiet board on `level`: no enemies, no queue, player parked at lane 0. */
function clearedAt(level: number, seed: number): GameState {
  const tube = tubeForLevel(level)
  const s = playingState(seed)
  s.level = level
  s.tube = tube
  s.rng = createRng(seed)
  s.spikes = new Array(tube.laneCount).fill(0)
  s.player.lane = 0
  s.bullets = []
  s.spawn = { nymphs: [] }
  s.enemies = []
  return s
}

const nymph = (lane: number, py = 1): Nymph => ({ lane, py })

/** Seed a full queue (one nymph per lane, ready to hatch) so NYMCHA fills the board. */
function withFullQueue(s: GameState): GameState {
  s.spawn = { nymphs: Array.from({ length: s.tube.laneCount }, (_, i) => nymph(i)) }
  return s
}

/** Fill the board through the real hatch and let it settle (queue empties or freezes). */
function settle(level: number, seed: number): GameState {
  let s = withFullQueue(clearedAt(level, seed))
  for (let i = 0; i < 40; i++) s = stepGame(s, NEUTRAL, FRAME)
  return s
}

const count = (s: GameState, k: EnemyKind): number => s.enemies.filter((e) => e.kind === k).length

const SEEDS = Array.from({ length: 60 }, (_, i) => i + 1)

// ── AC-6: the routed blocking finding — spikers on the max-0 waves ─────────────
describe('tp1-8 — AC-6: a spiker never appears where WSPIMX has no live record', () => {
  // WSPIMX covers 4-16, 20-32, 43-99. It has NO record for 17-19, 33-34, 40-42
  // (plain gaps -> max 0) NOR for 35-39 (the [53,39] dead range from the un-dotted
  // hex typo -> max 0, while WSPIMI min = 1). On all of these the ROM's solver
  // leaves openings[spiker]=0 and every launch path is gated on openings != 0, so
  // the count is ZERO. Today's roll keeps spikers in the weighted table forever
  // once introduced (wave 4), so it emits them here -> RED.
  const GAP_WAVES = [17, 18, 19, 33, 34, 40, 41, 42]
  const CONTRADICTION_WAVES = [35, 36, 37, 38, 39] // min 1 > max 0

  it.each([...GAP_WAVES, ...CONTRADICTION_WAVES])('wave %i: zero spikers across every seed', (level) => {
    for (const seed of SEEDS) {
      const s = settle(level, seed)
      expect(count(s, 'spiker'), `wave ${level} seed ${seed} must hatch no spiker`).toBe(0)
    }
  })

  it('min 1 > max 0 resolves to ZERO, not one — MAX governs, the min is inert (waves 35-39)', () => {
    // The whole point of the routed finding: a clamp-to-MIN would give 1 spiker here.
    // The ROM gives 0 because the WFLMIN starvation pass is nested inside "has openings".
    const everySpiker = CONTRADICTION_WAVES.flatMap((lvl) => SEEDS.map((sd) => count(settle(lvl, sd), 'spiker')))
    expect(Math.max(...everySpiker)).toBe(0)
  })

  it('FIXTURE GUARD: spikers DO appear where WSPIMX has a live record (else the zeros are vacuous)', () => {
    // wave 20 (max 2) and wave 43 (max 1) both border a gap; spikers must survive there.
    for (const level of [20, 43]) {
      const sawSpiker = SEEDS.some((sd) => count(settle(level, sd), 'spiker') > 0)
      expect(sawSpiker, `spikers must be reachable on wave ${level}`).toBe(true)
    }
  })
})

// ── AC-1: the MAX is never exceeded, the MIN is guaranteed ─────────────────────
describe('tp1-8 — AC-1: per-type population respects the wave MAX', () => {
  it('wave 17: flippers capped at 3 (WFLIMX 17-19), and NO fuseball (WFUSMX has no record)', () => {
    // Today: flipper weight 10 dominates -> often 4+; fuseball introduced wave 11 and
    // never removed -> emitted here. NYMCHA caps flippers at WFLIMX=3 and fuse max=0.
    for (const seed of SEEDS) {
      const s = settle(17, seed)
      expect(count(s, 'flipper'), `wave 17 seed ${seed}: flipper max is 3`).toBeLessThanOrEqual(3)
      expect(count(s, 'fuseball'), `wave 17 seed ${seed}: fuseball max is 0`).toBe(0)
    }
  })

  it('wave 10: tankers capped at 2 (WTANMX 6-16)', () => {
    // Today's memoryless roll can put 3+ tankers on a board whose max is 2.
    const maxTankers = Math.max(...SEEDS.map((sd) => count(settle(10, sd), 'tanker')))
    expect(maxTankers, 'no wave-10 board may exceed WTANMX=2 tankers').toBeLessThanOrEqual(2)
  })

  it('wave 22: the fuseball RETURNS (WFUSMX 22-25) — the cap is per-wave, not monotonic', () => {
    // Guard against a naive "fuse only after wave 11" cap: WFUSMX blanks 17-21 then
    // reopens at 22. A board should be ABLE to hatch a fuseball at 22.
    const sawFuse = SEEDS.some((sd) => count(settle(22, sd), 'fuseball') > 0)
    expect(sawFuse, 'fuseballs must be reachable again on wave 22').toBe(true)
  })
})

describe('tp1-8 — AC-1: the per-wave MIN is GUARANTEED, never a lucky roll', () => {
  it('wave 3: every board has at least one tanker (WTANMI wave 3 = 1)', () => {
    // The ROM launches a below-min type FIRST. Today's roll can miss the required
    // tanker entirely on an unlucky seed -> RED on those seeds.
    for (const seed of SEEDS) {
      const s = settle(3, seed)
      expect(count(s, 'tanker'), `wave 3 seed ${seed} must guarantee its tanker`).toBeGreaterThanOrEqual(1)
    }
  })

  it('wave 4: every board has at least one spiker (WSPIMI wave 4 = 1)', () => {
    for (const seed of SEEDS) {
      const s = settle(4, seed)
      expect(count(s, 'spiker'), `wave 4 seed ${seed} must guarantee its spiker`).toBeGreaterThanOrEqual(1)
    }
  })
})

// ── AC-2: cargo is RESERVED under the type max before the tanker splits ─────────
describe('tp1-8 — AC-2: a live tanker RESERVES two of its cargo type\'s slots', () => {
  it('wave 10: liveFlippers + 2*tankers <= flipper max (5) — the split always fits', () => {
    // On waves < 33 every tanker cargo slot is a flipper (WWTAC*), so a tanker splits
    // into 2 flippers. NYMCHA's `DEC OPFLIP[cargo]` twice per tanker holds flippers to
    // (max - 2*tankers), so when the tankers split the 2*tankers flippers stay under
    // WFLIMX and no split is dropped (KILINV -> ACTINV needs the room). Today's roll
    // reserves nothing: one tanker on a full board already breaks this.
    // The reservation is per-cargo-TYPE headroom: NYMCHA never launches cargo-type
    // invaders into the (max - 2*tankers) it holds back, so when the tankers split the
    // 2*tankers new flippers land WITHIN WFLIMX and no split violates the flipper max.
    // (It is headroom under the TYPE max, not a global slot lock — the honest bound the
    // ROM's `DEC OPFLIP[cargo]` twice actually provides; see the TEA assessment.)
    let sawTanker = false
    for (const seed of SEEDS) {
      const s = settle(10, seed)
      const t = count(s, 'tanker')
      const f = count(s, 'flipper')
      sawTanker = sawTanker || t > 0
      expect(f + 2 * t, `wave 10 seed ${seed}: ${f} flippers + 2x${t} tankers must fit WFLIMX=5`).toBeLessThanOrEqual(5)
    }
    expect(sawTanker, 'FIXTURE GUARD: tankers must actually spawn on wave 10').toBe(true)
  })
})

// ── AC-3: spikers bias to short lines, tankers to long ones ────────────────────
describe('tp1-8 — AC-3: the smart launch puts a spiker on a short line, a tanker on a long one', () => {
  // NYMCHA's smart launch (ALWELG.MAC:1366-1385) fires only once the mins are met and
  // both a spiker and a tanker slot are open; it then reads LINEY at the hatching
  // nymph's own line and launches a SPIKER on a short/dead line, a TANKER on a long one
  // (CMP I,0CC). We stage exactly that window: mins pre-satisfied, both types still
  // open, one dead lane and one lane occupied high up. `depth` is our INVAY (0 far ->
  // 1 near rim): an enemy near the rim is a LONG line, an empty lane is a dead/SHORT one.
  //
  // The precise LINEY -> depth mapping and the 0xCC threshold are Dev's to choose; this
  // test brackets the DIRECTION (short -> spiker, long -> tanker), which today's
  // line-blind roll cannot produce. The authoritative rule is pinned byte-exact in
  // tp1-8.source-rules.test.ts.
  const LONG_LANE = 5
  const SHORT_LANE = 10

  /** Wave 10 board with mins met (2 spikers, 1 tanker) and both types still open. */
  function smartLaunchBoard(seed: number): GameState {
    const s = clearedAt(10, seed)
    const p = levelParams(10)
    const hold = (e: Enemy): Enemy => ((e.fireCooldown = 1e9), e)
    s.enemies = [
      // meet WSPIMI(10)=2 and WTANMI(10)=1 so the min pass is done and smart launch runs
      hold(makeEnemy('spiker', 1, 0.3, p)),
      hold(makeEnemy('spiker', 2, 0.3, p)),
      hold(makeEnemy('tanker', 3, 0.3, p, 'flipper')),
      // LONG_LANE occupied near the rim -> a long line; SHORT_LANE left empty -> dead/short
      hold(makeEnemy('flipper', LONG_LANE, 0.95, p)),
    ]
    // spiker max 4 (2 open) and tanker max 2 (1 open): the smart-launch window is live.
    s.spawn = { nymphs: [nymph(SHORT_LANE), nymph(LONG_LANE)] }
    return s
  }

  it('a nymph hatching on a DEAD lane becomes a spiker; on a LONG lane, a tanker', () => {
    let shortIsSpiker = 0
    let longIsTanker = 0
    let sampled = 0
    for (const seed of SEEDS) {
      const before = smartLaunchBoard(seed)
      const s = stepGame(before, NEUTRAL, FRAME)
      const onShort = s.enemies.find((e) => e.lane === SHORT_LANE && e.depth < 0.1)
      const onLong = s.enemies.filter((e) => e.lane === LONG_LANE).find((e) => e.depth < 0.1)
      if (!onShort || !onLong) continue // both hatched this frame
      sampled++
      if (onShort.kind === 'spiker') shortIsSpiker++
      if (onLong.kind === 'tanker') longIsTanker++
    }
    expect(sampled, 'FIXTURE GUARD: the smart-launch window actually hatched both nymphs').toBeGreaterThan(20)
    // Line-blind code scatters kinds uniformly; the ROM's rule makes these near-certain.
    expect(shortIsSpiker / sampled, 'a dead line strongly favours a spiker').toBeGreaterThan(0.8)
    expect(longIsTanker / sampled, 'a long line strongly favours a tanker').toBeGreaterThan(0.8)
  })
})
