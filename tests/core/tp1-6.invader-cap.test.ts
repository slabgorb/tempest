// tests/core/tp1-6.invader-cap.test.ts
//
// RED suite for story tp1-6 — the 7-INVADER CAP and slot back-pressure
// (W-004, DA-017, and MOVNYM's gates from W-003).
//
// ── What the ROM does (ALWELG.MAC unless noted) ──────────────────────────────
//
//   ALCOMN.MAC:809   NINVAD = 7 — every active-invader array holds SEVEN slots.
//                    The hardware cannot express an 8th live invader.
//   ALCOMN.MAC:732   WINVMX — "max-invaders-1". TINVMX (ALWELG:695) is a single
//                    T1 record spanning waves 1-99 with value 6: the cap NEVER
//                    varies by wave. (And CONTOUR folds every wave >= 99 back
//                    into 65..96 — ALWELG:415-423 — so there is no wave anywhere
//                    that could walk off the record and read garbage.)
//   MOVNYM:1109-1117 the gate: A = INMCOU + INCCOU (movers PLUS chasers), then
//                    `CMP WINVMX / IFCS / IFNE` — the nested IFNE makes the block
//                    STRICTLY GREATER THAN: nymphs still advance at 6 live (and
//                    hatch to 7); they freeze only once all 7 slots are booked.
//   MOVNYM:1119-1122 `LDA SUZTIM / IFNE` — a running Superzapper ALSO freezes the
//                    queue ("AVOID KAMIKAZE"): the slots a zap opens are not
//                    refilled until the window closes.
//   MOVNYM:1148-1158 the rotation block sits OUTSIDE the TEMPY guard: a frozen
//                    queue still CRAWLS (lanes rotate) — it just does not rise.
//   CONYMP:1196-1199 a hatch that finds no slot is PUT BACK (`INC X,NYMPY`),
//                    never dropped.
//   ACTINV:1219-1263 the single activation gate — the slot scan every new
//                    invader goes through, hatch and split alike. KILINV's split
//                    frees the parent's slot FIRST, then each child runs ACTINV
//                    ("ANY SLOTS?"), so a full board bursts to AT MOST 7.
import { describe, it, expect } from 'vitest'
import { playingState } from './helpers'
import { stepGame, makeEnemy } from '../../src/core/sim'
import { levelParams, SIM_STEP } from '../../src/core/rules'
import { GameState, Enemy } from '../../src/core/state'
import type { Nymph } from '../../src/core/state'
import { tubeForLevel } from '../../src/core/geometry'
import { Input } from '../../src/core/input'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }
const FRAME = SIM_STEP

const nymph = (lane: number, py: number): Nymph => ({ lane, py })

/** A parked, fire-suppressed spiker: alive, harmless, and it holds its slot. */
function slotHolder(lane: number, level: number, depth = 0.3): Enemy {
  const e = makeEnemy('spiker', lane, depth, levelParams(level))
  e.fireCooldown = 1e9
  return e
}

/** A quiet board on `level` with `live` slot-holders and one nymph two frames out. */
function boardWith(level: number, live: number, seed = 1): GameState {
  const s = playingState(seed)
  s.level = level
  s.tube = tubeForLevel(level)
  s.player.lane = 10
  s.bullets = []
  s.spikes = new Array(s.tube.laneCount).fill(0)
  s.enemies = Array.from({ length: live }, (_, i) => slotHolder(i, level))
  s.spawn = { nymphs: [nymph(3, 2)] }
  return s
}

// ── The boundary, both sides in one test ─────────────────────────────────────

describe('tp1-6 — live invaders are capped at NINVAD=7 by slot back-pressure (W-004)', () => {
  it('at 6 live the nymph hatches to 7; at 7 live the queue FREEZES; a kill thaws it', () => {
    // Side A — six live: MOVNYM's `CMP WINVMX / IFCS / IFNE` is strictly-greater,
    // so 6 is NOT booked and the hatch lands (this is the half that makes the
    // freeze below falsifiable — a dead queue passes the freeze for free).
    let six = boardWith(1, 6)
    for (let i = 0; i < 4; i++) six = stepGame(six, NEUTRAL, FRAME)
    expect(six.enemies.length, 'six live: the 7th slot is open and the hatch takes it').toBe(7)
    expect(six.spawn.nymphs.length).toBe(0)

    // Side B — seven live: every slot booked, so py must not move AT ALL.
    let seven = boardWith(1, 7)
    for (let i = 0; i < 30; i++) seven = stepGame(seven, NEUTRAL, FRAME)
    expect(seven.enemies.length, 'seven live: nothing may hatch, ever').toBe(7)
    expect(seven.spawn.nymphs.length, 'the surplus stays QUEUED — never dropped').toBe(1)
    expect(seven.spawn.nymphs[0].py, 'a frozen nymph does not creep (blocked frames do not count)').toBe(2)

    // Side C — the thaw: free one slot and the same nymph hatches within frames.
    seven.enemies = seven.enemies.slice(1)
    for (let i = 0; i < 4; i++) seven = stepGame(seven, NEUTRAL, FRAME)
    expect(seven.enemies.length, 'a freed slot is refilled from the queue').toBe(7)
    expect(seven.spawn.nymphs.length).toBe(0)
  })

  it('chasers hold slots too: INMCOU *plus* INCCOU is what books the board (MOVNYM:1109-1111)', () => {
    // 6 movers + 1 chaser = 7 booked. A port that counts only on-lane invaders
    // (INMCOU alone) would let this hatch into an 8th slot the ROM does not have.
    let s = boardWith(1, 6)
    const chaser = makeEnemy('flipper', 2, 1, levelParams(1))
    chaser.chasing = true
    s.enemies = [...s.enemies, chaser]
    for (let i = 0; i < 12; i++) s = stepGame(s, NEUTRAL, FRAME)
    expect(s.enemies.length, 'a chaser is a booked slot, not a free one').toBe(7)
    expect(s.spawn.nymphs.length).toBe(1)
  })

  it('a frozen queue still crawls: rotation continues while the rise is blocked (MOVNYM:1148)', () => {
    // The rotation block runs OUTSIDE the TEMPY guard. A port that skips nymph
    // processing wholesale when the board is full parks the far-end crawl the
    // arcade keeps animating.
    let s = boardWith(1, 7)
    s.spawn = { nymphs: [nymph(3, 0xc0)] }
    let prev = 3
    let changes = 0
    for (let i = 0; i < 16; i++) {
      s = stepGame(s, NEUTRAL, FRAME)
      expect(s.spawn.nymphs[0].py, 'py is frozen the whole while').toBe(0xc0)
      if (s.spawn.nymphs[0].lane !== prev) { changes++; prev = s.spawn.nymphs[0].lane }
    }
    expect(changes, 'one lane per two frames, even while frozen').toBeGreaterThanOrEqual(7)
    expect(changes).toBeLessThanOrEqual(9)
  })
})

// ── The cap does not vary by wave — and does not walk off the table ──────────

describe('tp1-6 — WINVMX is 6 for EVERY wave (TINVMX, ALWELG.MAC:695)', () => {
  // TINVMX is one T1 record, 1-99, value 6. The probe levels cover the record's
  // interior, every boundary the OTHER tables break at (16/17, 48/49, 64/65),
  // the record's last wave — and then PAST it (100, 150), because our level
  // counter does not stop at 99 and a table walk-off that returns 0 or
  // undefined would silently turn the cap off exactly where nobody plays.
  const LEVELS = [1, 5, 16, 17, 48, 64, 65, 99, 100, 150]

  it.each(LEVELS)('level %i: seven live freezes the queue, six live hatches', (level) => {
    let seven = boardWith(level, 7)
    for (let i = 0; i < 6; i++) seven = stepGame(seven, NEUTRAL, FRAME)
    expect(seven.enemies.length, `L${level}: the 7-cap must hold`).toBe(7)
    expect(seven.spawn.nymphs.length, `L${level}: the surplus must stay queued`).toBe(1)

    let six = boardWith(level, 6)
    for (let i = 0; i < 6; i++) six = stepGame(six, NEUTRAL, FRAME)
    expect(six.enemies.length, `L${level}: six live is NOT booked — the cap is 7, not 6`).toBe(7)
  })
})

// ── Splits obey the same slot machinery (ACTINV is the only door) ────────────

describe('tp1-6 — a tanker burst cannot overflow the board (KILINV -> ACTINV)', () => {
  it('an arriving tanker on a full board bursts to exactly 7 — one child finds the freed slot', () => {
    // 7 live: 6 holders + the carrier. KILINV frees the parent FIRST (its slot
    // and counter go before the children activate), then each child runs
    // ACTINV: child one takes the freed slot, child two finds none and is
    // dropped — the ROM has nowhere to put it. 6 + 1 = 7, never 8.
    let s = boardWith(5, 6, 3)
    s.spawn = { nymphs: [] } // isolate the split from the queue
    const carrier = makeEnemy('tanker', 9, 0.95, levelParams(5))
    carrier.fireCooldown = 1e9
    s.enemies = [...s.enemies, carrier]
    expect(s.enemies.length).toBe(7)

    s = stepGame(s, NEUTRAL, FRAME)
    const tankers = s.enemies.filter((e) => e.kind === 'tanker')
    const children = s.enemies.filter((e) => e.kind === 'flipper')
    expect(tankers.length, 'the carrier burst (fixture guard)').toBe(0)
    expect(children.length, 'exactly ONE child fits the one freed slot').toBe(1)
    expect(s.enemies.length, 'the board never exceeds NINVAD').toBe(7)
  })

  it('a bullet-killed tanker on a full board splits through the same gate', () => {
    // Same rule, other entry: resolveBulletHits' split must route through the
    // slot machinery too, or shooting a carrier point-blank mints an 8th slot.
    let s = boardWith(5, 6, 3)
    s.spawn = { nymphs: [] }
    const carrier = makeEnemy('tanker', 9, 0.5, levelParams(5))
    carrier.fireCooldown = 1e9
    s.enemies = [...s.enemies, carrier]
    s.bullets = [{ lane: 9, depth: 0.5 }]

    s = stepGame(s, NEUTRAL, FRAME)
    expect(s.enemies.some((e) => e.kind === 'tanker'), 'the carrier died (fixture guard)').toBe(false)
    expect(s.enemies.length, 'kill + split on a full board: at most the parent slot refills').toBeLessThanOrEqual(7)
    expect(s.enemies.filter((e) => e.kind === 'flipper').length, 'the freed slot takes one child').toBe(1)
  })
})

// ── The Superzapper freeze ("AVOID KAMIKAZE", MOVNYM:1119-1122) ──────────────

describe('tp1-6 — a running Superzapper freezes the queue even as it frees slots', () => {
  it('no hatches land inside the zap window; they resume once it closes', () => {
    // Seven slot-holders and an eager nymph. The zap kills one enemy per active
    // frame — slots open up mid-window — but SUZTIM != 0 holds every nymph, so
    // the queue must not rush the board while the lightning is still striking.
    let s = boardWith(1, 7, 5)
    s.spawn = { nymphs: [nymph(3, 1)] }
    s.player.superzapper = 'full'

    s = stepGame(s, { ...NEUTRAL, zap: true }, FRAME)
    const zapFrames: number[] = []
    let frame = 0
    while (s.player.zapTimer > 0) {
      frame++
      expect(s.spawn.nymphs.length, `zap frame ${frame}: the queue holds`).toBe(1)
      expect(s.spawn.nymphs[0].py, `zap frame ${frame}: py does not move under a zap`).toBe(1)
      zapFrames.push(s.enemies.length)
      s = stepGame(s, NEUTRAL, FRAME)
    }
    expect(zapFrames.length, 'fixture guard: the window actually ran').toBeGreaterThan(2)
    expect(s.enemies.length, 'fixture guard: the zap actually killed (slots opened mid-window)')
      .toBeLessThan(7)

    // Window closed: SUZTIM is 0 and the thaw delivers into the freed slots.
    for (let i = 0; i < 4; i++) s = stepGame(s, NEUTRAL, FRAME)
    expect(s.spawn.nymphs.length, 'the queue resumes the moment the window closes').toBe(0)
  })
})
