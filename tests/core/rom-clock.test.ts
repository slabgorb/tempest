// tests/core/rom-clock.test.ts
//
// RED suite for story tp1-1 — THE REBASE. Cluster C1 of the primary-source audit
// (docs/2026-07-12-tempest-primary-source-audit.md §3, "The clock").
//
// ── The finding ──────────────────────────────────────────────────────────────
// The ROM does NOT run at 60 fps. Its IRQ handler treats a single-byte counter's
// 8-bit wrap as one second (ALHARD.MAC:149-152) — so the IRQ is 256 Hz by the
// ROM's own arithmetic — and MAINLN spins until NINE of those ticks have elapsed
// before running one game frame (ALEXEC.MAC:49-55). 256/9 = 28.44 game frames a
// second. Theurer says so himself in a comment above the refire table we already
// ship byte-for-byte: "FRAMES UNTIL INVADER CAN FIRE (28 PER SECOND)"
// (ALWELG.MAC:581).
//
// Our sim runs 2.11x too fast. warpAccel carries the base SQUARED and is 4.45x.
//
// ── The decoy ────────────────────────────────────────────────────────────────
// ALCOMN.MAC:87 reads `SECOND = 20. ;FRAMES/SECOND` and it is a trap. It sits
// under ";TIMING FOR PAUSE STATE", is used only to reload pause/attract
// countdowns, and appears nowhere in MAINLN, the IRQ handler, or any speed table.
// Where the constant and the machine disagree, the machine wins. ROM_FPS is
// neither 60 nor 20.
//
// ── Why these values are pinned as EXACT rationals ───────────────────────────
// 256/9 makes the ROM's numbers come out clean, which is itself evidence the base
// is right: the L33 flipper lands on exactly 96 along/s (3/7 depth/s) and the
// player charge on exactly 256/224 (8/7 depth/s). Hand-tuned numbers do not do
// that. Every expectation below is derived from ROM_FPS by formula, never typed
// in as a decimal — a test that hard-codes 0.1746 would be just as unfalsifiable
// as the 82.5 it replaces.
//
// Pure core, node env, no DOM/time/Math.random (CLAUDE.md hard boundary).

import { describe, it, expect } from 'vitest'
import {
  ROM_FPS,
  SIM_STEP,
  WARP_ALONG_SPAN,
  WARP_INITIAL_SPEED,
  warpAccel,
  flipperSpeedForLevel,
  levelParams,
  PULSAR_CLIMB_SPEED,
  BULLET_SPEED,
  enemyFireHoldoffFrames,
  enemyCanShoot,
} from '../../src/core/rules'

// The ROM's own arithmetic: a 256 Hz IRQ, nine ticks to the game frame.
const IRQ_HZ = 256
const TICKS_PER_FRAME = 9
const EXPECT_ROM_FPS = IRQ_HZ / TICKS_PER_FRAME // 28.444...

// The two frame rates that are NOT the answer.
const INVENTED_60 = 60 // what our sim assumed
const PAUSE_SECOND_20 = 20 // ALCOMN.MAC:87, the decoy

describe('ROM_FPS — the clock (AC1)', () => {
  it('is 256/9, the ROM\'s own arithmetic: a 256 Hz IRQ, nine ticks per game frame', () => {
    expect(ROM_FPS).toBe(EXPECT_ROM_FPS)
  })

  it('is 28.44 fps, matching Theurer\'s own "(28 PER SECOND)" comment (ALWELG.MAC:581)', () => {
    expect(ROM_FPS).toBeCloseTo(28.444, 3)
    // The comment says 28, not 29 or 30 — the floor must land on 28.
    expect(Math.floor(ROM_FPS)).toBe(28)
  })

  it('is NOT 60 — the invented rate the whole codebase was built on', () => {
    expect(ROM_FPS).not.toBe(INVENTED_60)
    // And the error is the audit's headline 2.11x, not some other factor.
    expect(INVENTED_60 / ROM_FPS).toBeCloseTo(2.109, 2)
  })

  it('is NOT 20 — SECOND=20 (ALCOMN.MAC:87) is a pause-countdown reload, not a frame rate', () => {
    expect(ROM_FPS).not.toBe(PAUSE_SECOND_20)
  })
})

describe('SIM_STEP — the FR-012 decision, made once and recorded (AC3)', () => {
  // AC3: EITHER the sim's fixed timestep becomes 9/256 s, OR every ROM frame count
  // is converted through ROM_FPS at its use site while the step stays 1/60. The
  // choice must be explicit and global — "a mix of both is a failure". An exported
  // constant is the only form of that decision a test can actually check.
  it('is exported from core — the decision is in the code, not in someone\'s head', () => {
    expect(SIM_STEP).toBeTypeOf('number')
    expect(Number.isFinite(SIM_STEP)).toBe(true)
    expect(SIM_STEP).toBeGreaterThan(0)
  })

  it('is one of the two permitted answers: 9/256 (ROM-paced) or 1/60 (convert-at-use-site)', () => {
    const ROM_PACED = TICKS_PER_FRAME / IRQ_HZ // 0.03515625
    const SIXTY_PACED = 1 / INVENTED_60
    expect([ROM_PACED, SIXTY_PACED]).toContain(SIM_STEP)
  })

  // NOTE: there is deliberately no test here asserting "SIM_STEP === 1/ROM_FPS if
  // ROM-paced". That is a arithmetic identity (9/256 IS the reciprocal of 256/9), so
  // it would assert nothing about the code. The real burden — that BOTH answers
  // produce the same ROM-correct wall-clock behaviour — is carried by
  // rom-clock-timing.test.ts, which drives the sim at SIM_STEP and measures seconds.
})

describe('the warp dive — warpAccel carries the base SQUARED (AC5)', () => {
  it('starts the dive at the ROM velocity: 2.0 along/frame at ROM_FPS', () => {
    // rules.ts:46 had (2.0 * 60) / 224. The 60 is the bug.
    expect(WARP_INITIAL_SPEED).toBeCloseTo((2.0 * ROM_FPS) / WARP_ALONG_SPAN, 12)
    expect(WARP_INITIAL_SPEED).toBeCloseTo(16 / 63, 12) // the exact rational
  })

  it('accelerates at the ROM rate — ROM_FPS squared, not ROM_FPS x 60', () => {
    // rules.ts:52 had (perFrame8_8 / 256) * (60 * 60) / 224. BOTH 60s are the bug.
    // This is the single most base-sensitive expression in the codebase.
    //
    // warpAccel takes a 0-based WAVE (post-tp1-23), so wave 1 here == displayed
    // level 2. These tests pin the ROM_FPS-squared conversion (tp1-1's rebase),
    // NOT the wave index — that's pinned separately in
    // tests/core/tp1-23.warp-curwav.test.ts.
    for (const wave of [1, 5, 12, 33]) {
      const perFrame8_8 = Math.min(wave * 4, 0x30) + 0x20
      const expected = (perFrame8_8 / 256) * (ROM_FPS * ROM_FPS) / WARP_ALONG_SPAN
      expect(warpAccel(wave)).toBeCloseTo(expected, 12)
    }
    expect(warpAccel(1)).toBeCloseTo(32 / 63, 12) // the exact rational, for WAVE 1
  })

  it('REJECTS the half-fixed rebase: one 60 replaced, the other left standing', () => {
    // The trap. A dev who rewrites (60 * 60) as (ROM_FPS * 60) gets a value that is
    // wrong by exactly 60/ROM_FPS = 2.11x, and every other test here still passes.
    // Nothing else in the suite catches it, so it is called out by name.
    const perFrame8_8 = Math.min(1 * 4, 0x30) + 0x20
    const halfFixed = (perFrame8_8 / 256) * (ROM_FPS * INVENTED_60) / WARP_ALONG_SPAN
    expect(warpAccel(1)).not.toBeCloseTo(halfFixed, 6)
  })

  it('is 4.45x slower than the 60 Hz value — the squared error, not the linear one', () => {
    // warpAccel(1) here is WAVE 1 (not level 1) — see the note above.
    const perFrame8_8 = Math.min(1 * 4, 0x30) + 0x20
    const old60 = (perFrame8_8 / 256) * (INVENTED_60 * INVENTED_60) / WARP_ALONG_SPAN
    expect(old60 / warpAccel(1)).toBeCloseTo(4.449, 2)
  })
})

describe('enemy climb speeds — rebased onto the real clock', () => {
  it('the L1 flipper climbs at 1.375 along/frame x ROM_FPS, not x 60', () => {
    // The ROM byte is 1.375 along/FRAME. At 60 that is the notorious 82.5 along/s.
    expect(flipperSpeedForLevel(1)).toBeCloseTo((1.375 * ROM_FPS) / WARP_ALONG_SPAN, 12)
    expect(flipperSpeedForLevel(1)).toBeCloseTo(11 / 63, 12) // exact rational
  })

  it('the L33+ flipper lands on exactly 96 along/s — 3/7 depth/s', () => {
    // 3.375 * 256/9 = 96 exactly. The base being right is why this is clean.
    expect(3.375 * ROM_FPS).toBeCloseTo(96, 10)
    expect(flipperSpeedForLevel(33)).toBeCloseTo(3 / 7, 12)
  })

  it('kills the 82.5 — the hidden 60 that no grep for "60" will ever find', () => {
    // 82.5 IS 1.375 x 60. It carries the invented frame rate on its face and it is
    // written into rules.ts as a bare literal, so AC2's grep cannot see it. This is
    // the assertion that catches it.
    const HIDDEN_60 = 82.5 / WARP_ALONG_SPAN // 0.3683 — what we ship today
    expect(82.5).toBeCloseTo(1.375 * INVENTED_60, 10) // proof of what 82.5 really is
    expect(flipperSpeedForLevel(1)).not.toBeCloseTo(HIDDEN_60, 4)
    expect(PULSAR_CLIMB_SPEED).not.toBeCloseTo(HIDDEN_60, 4)
  })

  it('the near pulsar is the SAME BYTE as the L1 flipper — an invariant, not a coincidence', () => {
    // spd_pulsar is hardcoded and level-independent, and the ROM reuses the L1
    // flipper byte for it. This holds at ANY frame rate, so it catches a dev who
    // rebases the flipper and forgets the pulsar — a failure mode no absolute
    // value can detect.
    expect(PULSAR_CLIMB_SPEED).toBeCloseTo(flipperSpeedForLevel(1), 12)
  })

  it('preserves the ROM ratios that are frame-rate invariant (fuseball 2x, tanker 1x)', () => {
    // These are pure ratios, so they were RIGHT even with the wrong base and must
    // STAY right after it. A rebase that breaks them has broken something else.
    for (const level of [1, 20, 33]) {
      const p = levelParams(level)
      expect(p.fuseballSpeed).toBeCloseTo(2 * p.flipperSpeed, 10)
      expect(p.tankerSpeed).toBeCloseTo(p.flipperSpeed, 10)
    }
  })
})

describe('the player charge — the "manufactured agreement" (AC5)', () => {
  it('travels at 9 along/frame x ROM_FPS = 8/7 depth/s, not 2.4', () => {
    // BULLET_SPEED = 2.4 was filed as CONFIRMED — "we match the arcade!" — because
    // 9 along-units/frame and 2.4 depth/s ARE the same number... only if a frame is
    // 1/60 s. The bad base did not invent a divergence here; it manufactured an
    // AGREEMENT, and agreement is what nobody re-checks.
    expect(BULLET_SPEED).toBeCloseTo((9 * ROM_FPS) / WARP_ALONG_SPAN, 12)
    expect(BULLET_SPEED).toBeCloseTo(8 / 7, 12) // exact rational: 1.142857 depth/s
    expect(BULLET_SPEED).not.toBeCloseTo(2.4, 2)
  })
})

describe('the 60s that are NOT frame rates — do not "fix" these (AC2 guard)', () => {
  // AC2 says zero bare 60s remain in src/core "used as a frame rate". src/core has
  // 60s that are NOT rates, and a find-and-replace rebase silently destroys the
  // game by changing them. This is the negative control.
  //
  // The projection's 60/300 FAR_RATIO used to be guarded here as one such 60.
  // tp1-9 (cluster C5) REMOVED it: the far/near ratio is now per-well
  // R = (16+H)/(240+H) with no bare 60 for the rebase to misread, so that guard
  // retired with the constant. The level-number 60s below still stand.

  it('the pulsar can-shoot gate stays at LEVEL 60 — a level number, not a clock', () => {
    // rules.ts:82. `level >= 60`. Rebasing it to `level >= 28` would let pulsars
    // shoot from level 28 and change every deep wave.
    expect(enemyCanShoot('pulsar', 59)).toBe(false)
    expect(enemyCanShoot('pulsar', 60)).toBe(true)
  })

  it('enemyFireHoldoffFrames still returns ROM FRAMES — the conversion is the caller\'s job', () => {
    // rules.ts:97 returns a frame COUNT straight from the ROM's table. The frames
    // are correct; only sim.ts:223's `/ 60` that turns them into seconds is wrong.
    // Rebasing this function would double-convert. Values are unchanged by tp1-1.
    expect(enemyFireHoldoffFrames(1)).toBe(80)
    expect(enemyFireHoldoffFrames(20)).toBe(23)
    expect(enemyFireHoldoffFrames(21)).toBe(20)
    expect(enemyFireHoldoffFrames(65)).toBe(10)
  })
})
