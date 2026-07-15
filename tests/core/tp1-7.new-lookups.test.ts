// tests/core/tp1-7.new-lookups.test.ts
//
// RED for the TWO NEW pure-function lookups tp1-7 adds to rules.ts. Kept apart from
// tp1-7.contour-tables.test.ts (which only touches existing exports and runs assertion-RED
// today) because these functions do not exist yet — this file is IMPORT-RED until Dev adds:
//
//   enemyBoltCapForLevel(level)   — TCHAMX, the live enemy-bolt cap = WCHAMX+1 (W-019/DA-002)
//   initialSpikeHeightForLevel(level) — TELIHI, the pre-seeded spike height per wave (W-037)
//
// The import error IS the RED signal for the missing contract; the module header explains it
// (sidecar: import-RED is legitimate for a unit suite that names the missing symbol). Once the
// functions exist, these value assertions run. Every expected value is derived from the raw
// ROM bytes pinned byte-for-byte in tp1-7.source-rules.test.ts.
import { describe, it, expect } from 'vitest'
import {
  enemyBoltCapForLevel,
  initialSpikeHeightForLevel,
  WARP_ALONG_SPAN,
} from '../../src/core/rules'

// ── ENEMY-BOLT CAP — TCHAMX, WCHAMX+1, NON-MONOTONIC (W-019, DA-002) ───────────
describe('tp1-7 — enemy-bolt cap reads TCHAMX (not a flat 4)', () => {
  it('the live cap is WCHAMX+1 per wave: 2,2,2,3,4,3,3,4,4 across waves 1-9', () => {
    const CAP = [2, 2, 2, 3, 4, 3, 3, 4, 4]
    for (let w = 1; w <= 9; w++) {
      expect(enemyBoltCapForLevel(w), `wave ${w}`).toBe(CAP[w - 1])
    }
    // Wave 1 is TWO in the arcade, not four — half the bolt pressure we ship today.
    expect(enemyBoltCapForLevel(1)).toBe(2)
    // Non-monotonic: it goes UP to 4 at wave 5 then DOWN to 3 at wave 6.
    expect(enemyBoltCapForLevel(6)).toBeLessThan(enemyBoltCapForLevel(5))
  })

  it('the mid and deep tiers: 3 for waves 10-64, 4 for 65+ — and never a walk-off 0/1', () => {
    expect(enemyBoltCapForLevel(10)).toBe(3)
    expect(enemyBoltCapForLevel(64)).toBe(3)
    expect(enemyBoltCapForLevel(65)).toBe(4)
    // GUARD: the fold keeps deep waves on the table — never the TE-0 walk-off (a 0/1 cap).
    for (const w of [99, 100, 999]) {
      expect(enemyBoltCapForLevel(w), `wave ${w}`).toBeGreaterThanOrEqual(2)
    }
  })
})

// ── PRE-SEEDED SPIKES — TELIHI, TZANDF periodic mod 16 (W-037) ─────────────────
describe('tp1-7 — initial spike height reads TELIHI (not a clean fill(0))', () => {
  it('waves 1-3 start clean; from wave 4 every lane is pre-seeded', () => {
    expect(initialSpikeHeightForLevel(1)).toBe(0)
    expect(initialSpikeHeightForLevel(2)).toBe(0)
    expect(initialSpikeHeightForLevel(3)).toBe(0)
    expect(initialSpikeHeightForLevel(4)).toBeGreaterThan(0)
  })

  it('the seeded height is ($F0 - byte)/224 (byte 0 = vacant), growing from wave 4 to wave 13', () => {
    // The ROM's LINEY convention: 0 = "LINE VACANT" (ALWELG.MAC:2209), a non-zero byte is the
    // spike TIP in along-coords, so height = ($F0 - byte)/224 (byte $E0 = 0.0714, $A0 = 0.357).
    expect(initialSpikeHeightForLevel(4)).toBeCloseTo((0xf0 - 0xe0) / WARP_ALONG_SPAN, 6) // 0.0714
    expect(initialSpikeHeightForLevel(13)).toBeCloseTo((0xf0 - 0xa0) / WARP_ALONG_SPAN, 6) // 0.357
    expect(initialSpikeHeightForLevel(13)).toBeGreaterThan(initialSpikeHeightForLevel(4))
  })

  it('TZANDF is periodic mod 16 — waves 17-19 are clean again, wave 20 == wave 4', () => {
    expect(initialSpikeHeightForLevel(17)).toBe(0) // (17-1) mod 16 = 0
    expect(initialSpikeHeightForLevel(18)).toBe(0)
    expect(initialSpikeHeightForLevel(19)).toBe(0)
    expect(initialSpikeHeightForLevel(20)).toBeCloseTo(initialSpikeHeightForLevel(4), 9) // index 3
  })

  it('a clean-wave 0 is a real NUMBER, never coerced away by || / ?? (TS check #4)', () => {
    // Waves 1-3 return exactly 0. `initialSpikeHeightForLevel(w) || DEFAULT` would silently
    // pre-seed the clean early waves. Assert the VALUE (tp1-25 lesson: a `||` grep is scenery
    // once the fallback moves to its own line).
    expect(typeof initialSpikeHeightForLevel(1)).toBe('number')
    expect(initialSpikeHeightForLevel(1)).toBe(0)
  })

  it('GUARD: the height is always a finite depth in [0, ~0.36] — no walk-off, no NaN', () => {
    for (const w of [99, 100, 150, 999]) {
      const h = initialSpikeHeightForLevel(w)
      expect(Number.isFinite(h), `wave ${w}`).toBe(true)
      expect(h, `wave ${w}`).toBeGreaterThanOrEqual(0)
      expect(h, `wave ${w}`).toBeLessThan(0.4)
    }
  })
})
