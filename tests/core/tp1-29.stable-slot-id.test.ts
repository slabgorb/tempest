// tests/core/tp1-29.stable-slot-id.test.ts
//
// RED suite for story tp1-29 — a STABLE per-enemy slot id, and MAYBLR's parity gate ported onto it.
//
// ── THE DEFECT ──────────────────────────────────────────────────────────────────────
// The ROM indexes invaders by X — a slot in the fixed INVAY array. INIINV (ALWELG.MAC:345-350)
// allocates NINVAD slots once and walks them with DEX; a slot belongs to an invader for its whole
// life. Our port has no such thing: an enemy's identity IS its position in the spliced `s.enemies`
// array (resolveBulletHits' `s.enemies.filter((_, i) => !deadEnemies.has(i))`, sim.ts), so that
// identity SHIFTS whenever an EARLIER enemy dies. Any ROM rule keyed on the invader index therefore
// cannot be ported — and MAYBLR's parity gate (chase on an ODD index) is exactly such a rule. tp1-25
// shipped its fuseball chase WITHOUT the gate (its deviation D2) precisely because there was no id.
//
// ── WHAT THESE TESTS PIN ────────────────────────────────────────────────────────────
//   AC-1  Every enemy carries a numeric `slotId`, assigned at spawn, that is NOT its array index and
//         does NOT move when an earlier enemy dies (the headline test), and is fixed for its life.
//   AC-2  MAYBLR's gate (ALWELG.MAC:2157-2160 — TXA / LSR / BCC LEFRIT / JSR FUCHPL) chases on an ODD
//         slot id and rolls the LEFRIT coin on an EVEN one — reading the STABLE id, NOT the array
//         position (a fuse at an EVEN array index but an ODD slot id still chases; an array-index
//         gate would flicker as unrelated enemies die).
//
// The id must be DETERMINISTIC (a monotonic counter carried in GameState, never Math.random), so
// stepGame stays reproducible — see the tp1-29 Delivery Findings for Dev's map.
import { describe, it, expect } from 'vitest'
import { playingState } from './helpers'
import { stepGame, makeEnemy } from '../../src/core/sim'
import { levelParams, SIM_STEP, BULLET_SPEED } from '../../src/core/rules'
import { tubeForLevel } from '../../src/core/geometry'
import type { Input } from '../../src/core/input'
import type { GameState, Nymph } from '../../src/core/state'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }
const FRAME = SIM_STEP
const nymph = (lane: number, py: number): Nymph => ({ lane, py })

// `slotId` does not exist on Enemy until tp1-29 lands, so read it through a cast: today this returns
// `undefined` and the numeric guards below fail — that IS the RED. Post-GREEN it is a plain field.
const slotIdOf = (e: unknown): number | undefined => (e as { slotId?: number }).slotId

/**
 * A wave-1 board whose queued nymphs hatch, IN ORDER, as flippers on the given lanes. The hatch
 * (stepNymphs' `s.enemies.push(makeEnemy(...))`, sim.ts) is a real spawn, so a hatched enemy gets
 * whatever id the sim stamps — this is why AC-1 drives hatching rather than placing enemies by hand.
 *
 * Wave-1 flippers run NOJUMP (W-006), so they never change lane: the lane is a STABLE anchor for
 * "the same enemy" across a step, independent of the id under test. The player parks far off on
 * lane 15 so no bolt (bolts ride the firer's lane) can reach it and reset the board.
 */
function hatchedBoard(lanes: number[], seed = 1): GameState {
  const s = playingState(seed)
  s.level = 1
  s.tube = tubeForLevel(1)
  s.spikes = new Array(s.tube.laneCount).fill(0)
  s.player.lane = 15
  s.enemies = []
  // py 1,2,3,… → one hatches per frame in array order; py < 0x40 so a nymph never rotates off-lane.
  s.spawn = { nymphs: lanes.map((lane, i) => nymph(lane, i + 1)) }
  let out = s
  for (let i = 0; i < lanes.length + 4 && out.enemies.length < lanes.length; i++) {
    out = stepGame(out, NEUTRAL, FRAME)
  }
  return out
}

// ── AC-1: the id is assigned at spawn, is not the array index, and survives an earlier death ─────
describe('tp1-29 — an enemy carries a STABLE slot id (INIINV, ALWELG.MAC:345-350)', () => {
  it('a later enemy keeps its slot id when an EARLIER enemy dies — the id is not the array index', () => {
    // THE HEADLINE. Four flippers hatch, in array order, on their own lanes. Kill the earliest and
    // the array reindexes under the survivors — but a stable id must not move with it.
    const LANES = [2, 5, 8, 11]
    const s = hatchedBoard(LANES)
    expect(s.enemies.length, 'fixture: four flippers hatched').toBe(4)
    expect(s.enemies.map((e) => e.lane), 'array order == hatch order == lane order').toEqual(LANES)

    // Every enemy carries a NUMERIC id, and the four are DISTINCT — spawn stamped each one.
    // (Today there is no id, so both guards fail: this is the RED.)
    const ids = s.enemies.map((e) => slotIdOf(e))
    for (const id of ids) expect(typeof id, 'each hatched enemy carries a numeric slot id').toBe('number')
    expect(new Set(ids).size, 'the four ids are distinct — one stamped per spawn').toBe(4)

    // The LATER enemy: the last hatched (lane 11, array index 3).
    const targetLane = 11
    const targetSlot = slotIdOf(s.enemies[3])
    const indexBefore = 3

    // Kill an EARLIER enemy (array index 0, lane 2) and step. Removing the array element is exactly
    // the reindex resolveBulletHits' `filter` performs on a real kill — the invariant is identical
    // however it dies, and this isolates it from RNG-driven kill mechanics.
    s.spawn = { nymphs: [] }         // no fresh hatches to perturb the array
    s.enemies = s.enemies.slice(1)   // the earlier enemy dies
    const after = stepGame(s, NEUTRAL, FRAME)

    const survivor = after.enemies.find((e) => e.lane === targetLane)
    expect(survivor, 'the later enemy is still on the board').toBeDefined()
    const indexAfter = after.enemies.findIndex((e) => e.lane === targetLane)

    // Its ARRAY INDEX shifted down (an earlier enemy left) …
    expect(indexAfter, 'the array index moved when the earlier enemy died').toBe(indexBefore - 1)
    // … but its STABLE slot id did not.
    expect(slotIdOf(survivor), 'the stable slot id did NOT move with the array index').toBe(targetSlot)
    // … and the id is demonstrably NOT the (post-shift) array index the ROM rule must not key on.
    expect(slotIdOf(survivor), 'the slot id is not the array index').not.toBe(indexAfter)
  })

  it('the slot id is fixed for the enemy’s whole life — unchanged across many frames', () => {
    let s = hatchedBoard([3, 7, 12])
    expect(s.enemies.length, 'fixture: three flippers hatched').toBe(3)
    s.spawn = { nymphs: [] }
    // Lane -> id at birth; wave-1 flippers never change lane, so lane identifies the enemy across
    // the run and cloneState's per-frame `{ ...e }` copy must carry the id forward untouched.
    const born = new Map(s.enemies.map((e) => [e.lane, slotIdOf(e)]))
    for (const id of born.values()) expect(typeof id, 'a hatched enemy carries a numeric id').toBe('number')
    for (let i = 0; i < 25; i++) {
      s = stepGame(s, NEUTRAL, FRAME)
      for (const e of s.enemies) {
        expect(slotIdOf(e), `lane ${e.lane}: the id must not drift frame to frame`).toBe(born.get(e.lane))
      }
    }
  })

  it('a tanker split stamps FRESH ids on both children — spawn assigns at every spawn site', () => {
    // The split is the OTHER spawn site (splitTanker → activateInvaders, sim.ts). A child that hatches
    // with no id would leave MAYBLR's gate reading `undefined` for it — so both children must be stamped.
    let s = playingState(3)
    s.level = 5
    s.tube = tubeForLevel(5)
    s.spikes = new Array(s.tube.laneCount).fill(0)
    s.player.lane = 0
    s.spawn = { nymphs: [] }
    const tanker = makeEnemy('tanker', 9, 0.5, levelParams(5))
    tanker.fireCooldown = 1e9
    s.enemies = [tanker]
    // One charge-step rimward so it lands ON the carrier at COLLIS (the tp1-6 re-seat).
    s.bullets = [{ lane: 9, depth: 0.5 + BULLET_SPEED * FRAME }]

    s = stepGame(s, NEUTRAL, FRAME)
    const children = s.enemies.filter((e) => e.kind === 'flipper')
    expect(children.length, 'the carrier burst into two children (fixture guard)').toBe(2)
    const kidIds = children.map((e) => slotIdOf(e))
    for (const id of kidIds) expect(typeof id, 'a split child is a spawn — it gets a stamped id').toBe('number')
    expect(new Set(kidIds).size, 'the two children get DISTINCT ids').toBe(2)
  })
})

// ── AC-2: MAYBLR chases on an ODD slot id (ALWELG.MAC:2157-2160), reading the id, not the index ──
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

/** The lanes a lone fuseball on slot `slotId` visits over 60 frames, player parked at `playerLane`. */
function fusePath(level: number, playerLane: number, slotId: number, fuseLane = 8): number[] {
  const s = base(level, playerLane)
  const f = makeEnemy('fuseball', fuseLane, 0.0, levelParams(level))
  f.fireCooldown = 999
  // Seat an EXPLICIT slot id (the cast keeps this compiling before tp1-29 adds the field).
  ;(f as typeof f & { slotId: number }).slotId = slotId
  s.enemies = [f]
  let cur = s
  const lanes: number[] = []
  for (let i = 0; i < 60; i++) {
    cur = stepGame(cur, NEUTRAL, FRAME)
    const e = cur.enemies[0]
    if (!e) break
    lanes.push(e.lane)
  }
  return lanes
}

// wave 49: WFUSCH = $C0, the on-tube chase bit ($40) is set (tp1-25). A lone fuse HERE can chase.
const CHASE_WAVE = 49

describe("tp1-29 — MAYBLR's parity gate chases only on an ODD slot (ALWELG.MAC:2157-2160)", () => {
  it('ODD slot chases — and it is the STABLE id being read, not the even array index', () => {
    // The fuse is alone, so its ARRAY index is 0 (EVEN). A gate keyed on the array position would
    // send an even-index fuse to LEFRIT and it would NOT chase. It chases only if the gate reads the
    // stable slot id (1, ODD) — so a pass here is proof the id, not the index, drives the decision,
    // and an array-index implementation goes RED right here.
    const odd2 = fusePath(CHASE_WAVE, 2, 1)
    const odd14 = fusePath(CHASE_WAVE, 14, 1)
    expect(new Set(odd2).size, 'liveness: the fuse must actually move to be shown chasing').toBeGreaterThan(1)
    expect(odd2, 'ODD slot: the fuse mirrors the player — the path depends on where he stands').not.toEqual(odd14)
  })

  it('EVEN slot does NOT chase — it rolls the LEFRIT coin (the RED half)', () => {
    // Paired with the ODD case above under the SAME wave and seed, so "does not chase" cannot pass
    // vacuously: the ODD test proves a fuse CAN chase here; this one proves the EVEN slot specifically
    // does not. Today jfuseup has no parity gate, so at wave 49 EVERY fuse chases — this one too —
    // and the two player positions diverge, failing the equality. MAYBLR's gate makes an even slot
    // take LEFRIT, which is blind to the player, so the two paths become identical.
    const even2 = fusePath(CHASE_WAVE, 2, 2)
    const even14 = fusePath(CHASE_WAVE, 14, 2)
    expect(new Set(even2).size, 'liveness: a frozen fuse would satisfy the equality without moving').toBeGreaterThan(1)
    expect(even2, 'EVEN slot: the coin is player-independent, so both player positions walk one path').toEqual(even14)
  })

  it('below the chase table the gate is silent — an ODD slot at wave 16 still just rolls', () => {
    // Guards the interaction with tp1-5/tp1-25: for waves 1-17 WFUSCH is 0, so MAYBLR's `BIT WFUSCH /
    // IFVS` is false and the parity test is never reached — neither parity chases. A gate written as
    // "odd slot always chases" (dropping the WFUSCH pre-condition) would light a chase here and redden.
    const p2 = fusePath(16, 2, 1)   // ODD slot, but the chase bit is clear at wave 16
    const p14 = fusePath(16, 14, 1)
    expect(new Set(p2).size, 'liveness').toBeGreaterThan(1)
    expect(p2, 'wave 16 ignores the player whatever the slot parity').toEqual(p14)
  })
})
