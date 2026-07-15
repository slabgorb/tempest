// tests/core/tp1-7.contour-tables.test.ts
//
// RED suite for tp1-7 — the BEHAVIOUR: the eight per-wave values are READ THROUGH THE
// TABLES at the wave index (AC-3), and the hand-tuned curves they replace are DELETED
// (AC-2). The source-level pins live in tp1-7.source-rules.test.ts; this file holds our
// code to the numbers the ROM actually produces.
//
// Every table is derived from the raw ROM bytes pinned in the source-rules suite:
//   TNYMMX  10,12,15,17,20,22,20,24,27,29,27,24,26,28,30,27 (waves 1-16), then TA/T1 to 99
//   TINVIN  along/frame = |WINVIL|/32 — 1.375 (w1), 3.000 (w16), 2.531 (w17 DIP), 3.75 (w50)
//   TSPIIN  byte 0 for waves 1-20 => spiker speed IS the flipper speed
//   TCHAMX  live cap = WCHAMX+1 — 2,2,2,3,4,3,3,4,4 (waves 1-9), 3 (10-64), 4 (65+)
//   TCHARIN byte -64 => bolt is always +2.0 along/frame over the invader (0.254 depth/s)
//   TELIHI  ($F0-byte)/224, byte 0 = vacant => waves 1-3 clean, wave 4 = 0.0714, wave 13 = 0.357
//
// THE WALK-OFF GUARDS ARE NOT OPTIONAL. Our s.level is uncapped; a naive table walk returns
// the end-of-table 0 above wave 99, and 0 is catastrophic for every one of these (a wave
// with no enemies, a 0/1 bolt cap, a frozen speed). tp1-25 SHIPPED this exact bug in review
// round 1. The deep-wave tests pass today (the hand-tuned formulae extrapolate) and MUST
// stay green through the port — that is what forces the CONTOUR fold (415-423) into the
// port, not a `|| fallback`.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRng } from '@arcade/shared/rng'
import {
  levelParams,
  rollSpawnKind,
  rollTankerCargo,
  ENEMY_BOLT_SPEED_OFFSET,
  ROM_FPS,
  WARP_ALONG_SPAN,
} from '../../src/core/rules'
// enemyBoltCapForLevel and initialSpikeHeightForLevel are NEW exports this story adds; the
// tests that exercise them live in tp1-7.new-lookups.test.ts (import-RED until Dev adds them),
// kept SEPARATE so this file can run assertion-RED against the current code today.
import type { EnemyKind, TankerCargo } from '../../src/core/state'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const rules = readFileSync(join(repoRoot, 'src/core/rules.ts'), 'utf8')
/** Strip comments so prose ABOUT a curve cannot satisfy — or trip — a grep (tp1-25). */
const stripComments = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const rulesCode = stripComments(rules)

// Sample rollSpawnKind / rollTankerCargo across seeds and return the reachable set.
// Absence is EXACT — weight-0/absent kinds are never emitted (sim.spawn.test.ts convention).
function rolledKinds(level: number, seed: number, n = 4000): Set<EnemyKind> {
  const r = createRng(seed)
  const s = new Set<EnemyKind>()
  for (let i = 0; i < n; i++) s.add(rollSpawnKind(level, r))
  return s
}
function rolledCargo(level: number, seed: number, n = 4000): Set<TankerCargo> {
  const r = createRng(seed)
  const s = new Set<TankerCargo>()
  for (let i = 0; i < n; i++) s.add(rollTankerCargo(level, r))
  return s
}

// ── 1. ENEMY COUNT — TNYMMX, itemised and NON-MONOTONIC (W-011) ───────────────
describe('tp1-7 — enemy count reads TNYMMX (not 6 + 2*(level-1))', () => {
  it('waves 1-16 are the ROM table verbatim, including the drops at 7 and 12', () => {
    const TNYMMX = [10, 12, 15, 17, 20, 22, 20, 24, 27, 29, 27, 24, 26, 28, 30, 27]
    for (let w = 1; w <= 16; w++) {
      expect(levelParams(w).enemyCount, `wave ${w}`).toBe(TNYMMX[w - 1])
    }
    // The straight line 6+2*(level-1) can express NEITHER the wave-1 = 10 start (it gives 6)
    // NOR the non-monotonic drops. These two assertions are what a formula cannot pass.
    expect(levelParams(7).enemyCount).toBeLessThan(levelParams(6).enemyCount) // 20 < 22
    expect(levelParams(12).enemyCount).toBeLessThan(levelParams(11).enemyCount) // 24 < 27
  })

  it('the deep-wave records continue the table (TA/T1, waves 17-99)', () => {
    expect(levelParams(17).enemyCount).toBe(20) // TA base 20
    expect(levelParams(26).enemyCount).toBe(29) // TA 20 + 9
    expect(levelParams(27).enemyCount).toBe(27) // T1
    expect(levelParams(33).enemyCount).toBe(27) // T1
  })

  it('GUARD: no wave ever has ZERO enemies — the walk-off returns a SANE count, not TE-0', () => {
    // A wave with enemyCount 0 spawns nobody and either hangs or instantly "clears". The
    // CONTOUR fold (415-423) is what keeps the ROM on its table forever; the port must too.
    for (const w of [64, 99, 100, 150, 999]) {
      const n = levelParams(w).enemyCount
      expect(n, `wave ${w}`).toBeGreaterThan(0)
      expect(n, `wave ${w}`).toBeLessThanOrEqual(61) // the table's max (wave 99 = 43+18)
    }
  })
})

// ── 2. INVADER SPEED — TINVIN, dips at 17, climbs past 33 (W-012) ─────────────
describe('tp1-7 — invader speed reads TINVIN (not a straight line L1->L33)', () => {
  // Frame-rate-independent shape check: the ratio to wave 1 is |WINVIL(w)| / 44, which pins
  // the TABLE SHAPE without coupling to ROM_FPS. A linear interp cannot reproduce it.
  const ratio = (w: number): number => levelParams(w).flipperSpeed / levelParams(1).flipperSpeed
  it('the curve follows |WINVIL|/44 — steep early, not a gentle line', () => {
    expect(ratio(8)).toBeCloseTo(79 / 44, 3) // linear interp gives ~1.32, ROM gives 1.795
    expect(ratio(16)).toBeCloseTo(96 / 44, 3)
    expect(ratio(33)).toBeCloseTo(108 / 44, 3)
  })

  it('enemies get SLOWER at wave 17 — the table DIPS where the line only rises', () => {
    // The headline of W-012: wave 17 restarts at -81, a step DOWN from wave 16's -96.
    expect(levelParams(17).flipperSpeed).toBeLessThan(levelParams(16).flipperSpeed)
    expect(ratio(17)).toBeCloseTo(81 / 44, 3)
  })

  it('speed keeps CLIMBING past wave 33 — it is not capped at the L33 tier', () => {
    // TINVIN is -108 (33-39), -110 (40-48), -120 (49-64): the current t=min(1,...) clamp
    // freezes the flipper at 3.375 from wave 33 on. The ROM does not.
    expect(levelParams(50).flipperSpeed).toBeGreaterThan(levelParams(33).flipperSpeed)
  })

  it('fuseball = 2x and tanker = 1x the (now table-driven) invader speed, at every wave', () => {
    for (const w of [1, 8, 17, 50]) {
      const p = levelParams(w)
      expect(p.fuseballSpeed).toBeCloseTo(2 * p.flipperSpeed, 9)
      expect(p.tankerSpeed).toBeCloseTo(p.flipperSpeed, 9)
    }
  })

  it('GUARD: invader speed never collapses to 0 at deep waves', () => {
    for (const w of [99, 100, 150, 999]) {
      expect(levelParams(w).flipperSpeed, `wave ${w}`).toBeGreaterThan(0)
    }
  })
})

// ── 3. SPIKER SPEED — TSPIIN, byte 0 => == flipper for waves 1-20 (W-014) ──────
describe('tp1-7 — spiker speed reads TSPIIN (not 0.22 * ramp)', () => {
  it('the spiker moves at EXACTLY the flipper speed for waves 1-20', () => {
    for (const w of [1, 5, 10, 16, 17, 20]) {
      expect(levelParams(w).spikerSpeed, `wave ${w}`).toBeCloseTo(levelParams(w).flipperSpeed, 9)
    }
  })

  it('the spiker gets FASTER than the flipper in the late game (TB offset -48 at 21+)', () => {
    // TSPIIN byte -48 for waves 21-32 => spiker_raw = WINVIL - 48, magnitude larger => faster.
    expect(levelParams(21).spikerSpeed).toBeGreaterThan(levelParams(21).flipperSpeed)
  })

  it('GUARD: spiker speed never collapses to 0 at deep waves', () => {
    for (const w of [99, 100, 999]) {
      expect(levelParams(w).spikerSpeed, `wave ${w}`).toBeGreaterThan(0)
    }
  })
})

// ── 5. ENEMY-BOLT SPEED — TCHARIN, +2.0 along/frame => 0.254 depth/s (W-020) ───
describe('tp1-7 — enemy-bolt speed offset reads TCHARIN (not the invented 0.72)', () => {
  it('the offset is 2.0 along-units/frame = 0.254 depth/s — and NOT 0.72', () => {
    const expected = (2.0 * ROM_FPS) / WARP_ALONG_SPAN // 0.2540...
    expect(ENEMY_BOLT_SPEED_OFFSET).toBeCloseTo(expected, 6)
    expect(ENEMY_BOLT_SPEED_OFFSET).toBeCloseTo(0.254, 3)
    expect(ENEMY_BOLT_SPEED_OFFSET).not.toBeCloseTo(0.72, 2)
  })
})

// ── 6. TANKER CARGO — WTACAR/WWTAC2/WWTAC3 (W-033) ────────────────────────────
describe('tp1-7 — tanker cargo reads the WTACAR table (not level>=11 / level>=17 gates)', () => {
  it('a tanker carries ONLY flippers until wave 33 — no fuseballs, no pulsars', () => {
    // Today we manufacture fuseball cargo from level 11 and pulsar from level 17. The ROM's
    // four cargo slots are ALL flippers for waves 1-32.
    for (const w of [1, 5, 11, 20, 32]) {
      expect(rolledCargo(w, 100 + w), `wave ${w}`).toEqual(new Set<TankerCargo>(['flipper']))
    }
  })

  it('fuseball cargo first becomes possible at wave 33 (WWTAC2 slot 2)', () => {
    expect(rolledCargo(32, 7).has('fuseball')).toBe(false)
    expect(rolledCargo(33, 7).has('fuseball')).toBe(true)
    expect(rolledCargo(33, 7).has('pulsar')).toBe(false) // pulsar still absent at 33
  })

  it('pulsar cargo first becomes possible at wave 41 (WWTAC2 -> ZCARPU)', () => {
    expect(rolledCargo(40, 9).has('pulsar')).toBe(false)
    expect(rolledCargo(41, 9).has('pulsar')).toBe(true)
  })
})

// ── 7. INTRO WAVES — WTANMX/WSPIMX introduction (W-035) ───────────────────────
describe('tp1-7 — enemy introduction reads the max tables (tanker wave 3, spiker wave 4)', () => {
  it('waves 1-2 are flippers only', () => {
    expect(rolledKinds(1, 11)).toEqual(new Set<EnemyKind>(['flipper']))
    expect(rolledKinds(2, 11)).toEqual(new Set<EnemyKind>(['flipper']))
  })

  it('a tanker first appears on WAVE 3, before any spiker', () => {
    const w3 = rolledKinds(3, 11)
    expect(w3.has('tanker')).toBe(true)
    expect(w3.has('spiker')).toBe(false)
  })

  it('a spiker first appears on WAVE 4', () => {
    expect(rolledKinds(3, 22).has('spiker')).toBe(false)
    expect(rolledKinds(4, 22).has('spiker')).toBe(true)
  })

  it('fuseballs stay out until wave 11, pulsars until wave 17 (WFUSMX/WPULMX)', () => {
    expect(rolledKinds(10, 33).has('fuseball')).toBe(false)
    expect(rolledKinds(11, 33).has('fuseball')).toBe(true)
    expect(rolledKinds(16, 44).has('pulsar')).toBe(false)
    expect(rolledKinds(17, 44).has('pulsar')).toBe(true)
  })
})

// (Pre-seeded spikes — TELIHI — are a NEW lookup; see tp1-7.new-lookups.test.ts.)

// ── AC-2: the hand-tuned curves are DELETED, not left as a fallback ────────────
describe('tp1-7 — AC-2: every hand-tuned difficulty curve is DELETED from rules.ts', () => {
  it('the enemyCount straight line `6 + (level - 1) * 2` is gone', () => {
    expect(rulesCode).not.toMatch(/6\s*\+\s*\(level\s*-\s*1\)\s*\*\s*2/)
  })

  it('the spiker ad-hoc ramp `0.22 * ramp` is gone', () => {
    expect(rulesCode).not.toMatch(/0\.22\s*\*\s*ramp/)
    // …and the `ramp = 1 + (level-1)*0.15` it depended on is not resurrected for these fields.
    expect(rulesCode).not.toMatch(/spikerSpeed:\s*0\.22/)
  })

  it('the flat MAX_ENEMY_BULLETS cap no longer gates enemy fire (a per-wave cap replaces it)', () => {
    // MAX_ENEMY_BULLETS may survive as the PHYSICAL slot ceiling (NICHARG=4), but the live
    // per-wave cap must exist and be consulted. Assert the new reader exists.
    expect(rulesCode).toMatch(/export function enemyBoltCapForLevel/)
  })

  it('the invented `0.72` bolt offset literal is gone', () => {
    expect(rulesCode).not.toMatch(/=\s*0\.72\b/)
  })

  it('rollSpawnKind / rollTankerCargo no longer carry the hand-tuned level>=5/11/17 gates', () => {
    // The introduction now comes from the max tables. A surviving `level >= 5` on a tanker
    // or `level >= 11` fuseball cargo gate is the exact curve W-035/W-033 delete.
    expect(rulesCode).not.toMatch(/'tanker',\s*level\s*>=\s*5/)
    expect(rulesCode).not.toMatch(/'spiker',\s*level\s*>=\s*5/)
    expect(rulesCode).not.toMatch(/'fuseball',\s*level\s*>=\s*11\s*\?\s*4/)
  })

  it('the TNYMMX bytes are TRANSCRIBED as data, not fitted as a formula (AC-3)', () => {
    // The distinctive non-monotonic run 20,22,20,24 appears nowhere in a formula — its
    // presence as literals proves the table was transcribed, not curve-fitted.
    expect(rulesCode).toMatch(/20\s*,\s*22\s*,\s*20\s*,\s*24/)
  })
})

// ── Lang-review: no unsafe casts in the new table lookups (TS check #1) ────────
describe('tp1-7 — lang-review on the new table lookups', () => {
  it('no `as any` / non-null assertion smuggled into the new table lookups', () => {
    // Scope to the functions this story adds, not the whole file (source-text grep, so it
    // runs without importing the not-yet-existing exports).
    expect(rulesCode).not.toMatch(/enemyBoltCapForLevel[\s\S]{0,400}as any/)
    expect(rulesCode).not.toMatch(/initialSpikeHeightForLevel[\s\S]{0,400}as any/)
  })
})
