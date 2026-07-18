// tests/core/tp1-26.pulse-potency-wave.test.ts
//
// RED suite for story tp1-26 — the pulse timer (PULTIM) and the pulsar potency zone
// (PULPOT) are WAVE-PARAMETERISED in the ROM; tp1-5 froze both at their wave-1 value.
//
// ── THE TWO ROM TABLES (byte-verified against ~/Projects/tempest-source-text) ─────────
//
// WPULTIM — "PULSAR TIMER INCREMENT" (ALWELG.MAC:610-613):
//     WPULTIM: .BYTE T1,1,48.,4      ; PULTIM = 4 for waves 1-48
//              .BYTE T1,49.,64.,6    ;         6 for waves 49-64
//              .BYTE T1,65.,99.,8    ;         8 for waves 65-99
//
// WPULPOT — "PULSAR POTENCY HEIGHT" (ALWELG.MAC:606-609):
//     WPULPOT: .BYTE T1,1,32.,0A0    ; PULPOT = $A0 for waves 1-32
//              .BYTE T1,33.,64.,0A0  ;         $A0 for waves 33-64  ⇒ $A0 across 1-64
//              .BYTE T1,65.,99.,0C0  ;         $C0 for waves 65-99
//
// Both are records in WTABLE (ALWELG.MAC:743-744, `.WORD WPULPOT,PULPOT` /
// `.WORD WPULTIM,PULTIM`), so CONTOUR walks them and the wave FOLD (below) applies.
//
// ── PULTIM IS THE COUNTER'S STEP — it sets period, duty AND residue ───────────────────
// MOVINV ticks ONE global counter each frame (ALWELG.MAC:1536-1570): PULSON += PULTIM,
// bouncing between rails at PULSON >= 15 and PULSON <= -64, and the SIGN of PULSON IS
// the pulse ("PULSE STATUS (MINUS=OFF)"). INEWLI seeds PULSON = -1 (ALWELG.MAC:46-48).
// Stepping -1 by PULTIM pins the reachable residue class, so the ROM's period / lit-count
// is a FUNCTION of PULTIM. Simulated with the ROM's seed and rails:
//     PULTIM 4 (waves 1-48)  → period 40, lit  7   ← tp1-5's wave-1 result, must not regress
//     PULTIM 6 (waves 49-64) → period 28, lit  5
//     PULTIM 8 (waves 65-99) → period 20, lit  3
// "7 of 40" is a wave-1 fact, not a universal one. Current PULSE_STEP = 4 (rules.ts) is
// row 1 only, so today every wave pulses like wave 1.
//
// ── PULPOT IS THE KILL GATE — and it WIDENS at wave 65 ────────────────────────────────
// JPULMO's electrocution (ALWELG.MAC:1802-1813) fires only when PULSON is lit, the pulsar
// is INSIDE the potency zone (`LDA INVAY / CMP PULPOT / IFCC`), and both legs sit on the
// cursor's. INVAY runs $10 (rim) .. $F0 (far); depth = (0xF0 - INVAY)/224. So the zone is
// depth > (0xF0 - PULPOT)/224:
//     $A0 (waves 1-64)  → kills nearer than depth (0xF0-0xA0)/224 = 0.357
//     $C0 (waves 65-99) → kills nearer than depth (0xF0-0xC0)/224 = 0.214  ← WIDER
// Current kill gate (sim.ts) reads the frozen PULSAR_NEAR_FAR_DEPTH ($A0 = 0.357) at every
// wave, so the widening never happens.
//
// ── NOTE FOR DEV: PULPOT IS ONE ROM BYTE, USED THREE TIMES ────────────────────────────
// The story frames the climb-speed boundary and the kill zone as "different ROM constants
// that only coincide below wave 65." The primary source says otherwise: JPULMO reads the
// SAME PULPOT for the climb-speed near/far switch (1783-1786), the descend reverse (1795)
// AND the kill (1804-1806). They coincide at EVERY wave because they are one byte, and all
// three widen to $C0 at wave 65. Our port already DEFERS the climb-tier $C0 as accepted
// gold-plating (rules.ts, PULSAR_NEAR_FAR_DEPTH's comment). This story fixes only the KILL
// tier: give the kill gate its own wave-parameterised PULPOT and leave the deferred climb
// boundary frozen at $A0. These tests therefore pin ONLY the kill gate's wave behaviour —
// they do NOT demand the climb boundary move — so the existing wave-1 pulsar-motion tests
// (tp1-5, tp1-6, sim.enemy-motion-fidelity) stay green. See the tp1-26 Delivery Finding.
//
// ── THE FOLD: deep waves must not return 0 (CONTOUR 415-423) ──────────────────────────
// Both tables END at wave 99 and s.level is UNCAPPED (sim.ts increments it every clear;
// MAX_SELECT_LEVEL bounds only the SELECT screen). A naive table walk returns end-of-table
// 0 above wave 99 — catastrophic here: PULTIM 0 FREEZES the pulse forever, PULPOT 0 makes
// the kill zone degenerate. The ROM never gets there: CONTOUR rewrites CURWAV >= 98 to a
// RANDOM wave 65..96 (`LDA RANDO2 / AND I,1F / ORA I,40` +INC), a band inside each table's
// last (65-99) record, so every deep wave draws the wave-99 row deterministically. tp1-25
// already extracted this fold once, inline in wfuschForLevel; this story generalises it to
// a shared contourWave() helper feeding all three lookups. tp1-25.fuseball-chase.test.ts
// is the independent regression guard that the wfuschForLevel fold survives the extraction.
import { describe, it, expect } from 'vitest'
import { playingState } from './helpers'
import { stepGame, makeEnemy } from '../../src/core/sim'
import {
  levelParams, SIM_STEP, wfuschForLevel, FUSE_CHASE_AT_TOP, FUSE_CHASE_ON_TUBE,
} from '../../src/core/rules'
import { tubeForLevel } from '../../src/core/geometry'
import type { Input } from '../../src/core/input'
import type { GameState, Pulsar } from '../../src/core/state'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }
const FRAME = SIM_STEP

// $A0 / $C0 as depths, spelled out so a reader can check them against the ROM bytes.
const ZONE_A0 = (0xf0 - 0xa0) / 224   // 0.357 — potency height for waves 1-64
const ZONE_C0 = (0xf0 - 0xc0) / 224   // 0.214 — potency height for waves 65-99

const pulsarsOf = (s: GameState): Pulsar[] => s.enemies.filter((e): e is Pulsar => e.kind === 'pulsar')

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

/**
 * Re-seed the board's pulse counter at `level` THROUGH THE SIM — never by hand.
 *
 * The wave's PULTIM lands in s.pulse.tim only via INEWLI → startLevel (sim.ts). We reach
 * it the way the cabinet does: kill the Claw and let the 'dying' branch run respawn() →
 * startLevel() at this level. That is the ONLY in-sim path that stamps tim per wave, so a
 * test that set s.pulse.tim itself would be pinning its own arithmetic — the very thing
 * AC-3 forbids (it is how the audit and its refuter both mis-derived the count).
 */
function reseedPulseAtWave(level: number): GameState {
  let s = playingState(1)
  s.level = level
  s.tube = tubeForLevel(level)
  s.lives = 5
  s.warp.progress = 0                  // normal respawn, not a warp-crash replay
  s.player.alive = false
  s.player.respawnTimer = FRAME * 0.5  // -= dt next step → <= 0 → respawn()
  s.mode = 'dying'
  s = stepGame(s, NEUTRAL, FRAME)      // respawn() → startLevel() re-seeds s.pulse.tim from the wave
  // Post-respawn hygiene: startLevel re-armed the nymph queue. Empty it and clear the
  // board so ONLY our observed pulsar drives the pulse we read.
  s.spawn = { nymphs: [] }
  s.enemies = []
  s.spikes = new Array(s.tube.laneCount).fill(0)
  return s
}

interface PulseShape { period: number | undefined; runs: number[]; sawPulse: boolean; frames: number }

/**
 * Drive the sim at `level` and MEASURE the pulse — never compute it. A lone pulsar is
 * parked diametrically opposite the Claw (harmless: it must climb AND flip ~half the ring
 * to reach him); its `pulsing` flag — the state that actually electrocutes — is sampled
 * every frame. We report the OFF→ON period and the length of each COMPLETE lit run.
 *
 * The pulsar carries no bolts (fireCooldown huge) so no second RNG channel or stray kill
 * shortens the window, and we stop the instant the Claw dies. The caller's liveness guard
 * (sawPulse + ≥2 complete runs) refuses a frozen or too-short measurement.
 */
function measurePulse(level: number, frames = 130): PulseShape {
  let s = reseedPulseAtWave(level)
  s.player.lane = 0
  const p = makeEnemy('pulsar', Math.floor(s.tube.laneCount / 2), 0.05, levelParams(level))
  p.fireCooldown = 999
  s.enemies = [p]

  const on: boolean[] = []
  for (let i = 0; i < frames; i++) {
    s = stepGame(s, NEUTRAL, FRAME)
    if (!s.player.alive) break
    const pulsar = pulsarsOf(s)[0]
    if (!pulsar) break
    on.push(pulsar.pulsing)
  }

  const starts: number[] = []
  for (let i = 1; i < on.length; i++) if (on[i] && !on[i - 1]) starts.push(i)

  const runs: number[] = []
  for (const st of starts) {
    let len = 0
    while (st + len < on.length && on[st + len]) len++
    if (st + len < on.length) runs.push(len) // COMPLETE runs only — a run still open at the window edge is unmeasured
  }

  return { period: starts.length >= 2 ? starts[1] - starts[0] : undefined, runs, sawPulse: on.some(Boolean), frames: on.length }
}

/** Assert a measurement actually observed a live, repeating pulse (never vacuous). */
function expectLivePulse(m: PulseShape, label: string): void {
  expect(m.sawPulse, `${label}: no pulse ever fired — the measurement is vacuous`).toBe(true)
  expect(m.runs.length, `${label}: fewer than 2 complete lit runs in ${m.frames} frames`).toBeGreaterThanOrEqual(2)
  expect(new Set(m.runs).size, `${label}: lit-run length is not stable (${m.runs.join(',')})`).toBe(1)
}

/**
 * Does a lit pulsar sitting on the Claw's lane at `depth` electrocute him at `level`?
 *
 * We force the pulse ON by seeding the board counter lit (PULSON = 8; stepPulseClock lands
 * it at 12..16, still >= 0) exactly as tp1-5 does, put the pulsar on the Claw's lane at the
 * test depth, and step ONE frame — the kill is resolved (resolvePlayerHits) after the pulse
 * ticks. The gate reads s.level LIVE for PULPOT, so this observes the wave's zone.
 */
function pulsarKillsAt(level: number, depth: number): boolean {
  const s = base(level, 6)
  const p = makeEnemy('pulsar', 6, depth, levelParams(level))
  p.fireCooldown = 999
  p.pulsing = true
  s.pulse.son = 8
  s.enemies = [p]
  return !stepGame(s, NEUTRAL, FRAME).player.alive
}

// ── AC-1 / AC-3: PULTIM is per-wave; period and duty come OUT OF the running sim ──────
describe('tp1-26 — PULTIM is read per wave from WPULTIM (ALWELG.MAC:610-613)', () => {
  it('wave 1 is UNCHANGED — 7 lit of a 40-frame cycle (tp1-5 must not regress)', () => {
    const m = measurePulse(1)
    expectLivePulse(m, 'wave 1')
    expect(m.period, 'wave-1 period must stay 40').toBe(40)
    expect(m.runs.every((r) => r === 7), 'wave-1 pulse must stay lit for 7').toBe(true)
  })

  it('period and duty DIFFER across the three PULTIM bands, and match the ROM', () => {
    const a = measurePulse(1)   // band 1-48  → PULTIM 4
    const b = measurePulse(56)  // band 49-64 → PULTIM 6
    const c = measurePulse(80)  // band 65-99 → PULTIM 8
    expectLivePulse(a, 'wave 1')
    expectLivePulse(b, 'wave 56')
    expectLivePulse(c, 'wave 80')

    // The ROM answer, MEASURED out of the sim — not re-derived in the test.
    expect([a.period, a.runs[0]], 'band 1-48 (PULTIM 4)').toEqual([40, 7])
    expect([b.period, b.runs[0]], 'band 49-64 (PULTIM 6)').toEqual([28, 5])
    expect([c.period, c.runs[0]], 'band 65-99 (PULTIM 8)').toEqual([20, 3])

    // The headline: the pulse is NOT the same beat at every wave.
    expect(new Set([a.period, b.period, c.period]).size, 'periods must differ across the 3 bands').toBe(3)
    expect(new Set([a.runs[0], b.runs[0], c.runs[0]]).size, 'duty cycles must differ across the 3 bands').toBe(3)
  })

  it('the period steps exactly at the 48→49 and 64→65 band edges', () => {
    expect(measurePulse(48).period, 'wave 48 — last of band 1-48').toBe(40)
    expect(measurePulse(49).period, 'wave 49 — first of band 49-64').toBe(28)
    expect(measurePulse(64).period, 'wave 64 — last of band 49-64').toBe(28)
    expect(measurePulse(65).period, 'wave 65 — first of band 65-99').toBe(20)
  })
})

// ── AC-2 / AC-4: PULPOT is per-wave; the kill zone widens at wave 65 ──────────────────
describe('tp1-26 — the potency zone (PULPOT) widens at wave 65 (WPULPOT 606-609; JPULMO 1802-1813)', () => {
  // Depth 0.28 sits BETWEEN the two zone edges: inside the wide $C0 zone (0.214),
  // outside the narrow $A0 one (0.357). It is the single depth that tells the bands apart.
  it('a pulsar at depth 0.28 kills at wave 65 but NOT at wave 64 — the $A0→$C0 step is real', () => {
    expect(0.28, 'premise: 0.28 is outside $A0 (0.357)').toBeLessThan(ZONE_A0)
    expect(0.28, 'premise: 0.28 is inside $C0 (0.214)').toBeGreaterThan(ZONE_C0)
    expect(pulsarKillsAt(64, 0.28), 'wave 64 zone is $A0; a pulsar at 0.28 is out of range').toBe(false)
    expect(pulsarKillsAt(65, 0.28), 'wave 65 zone is $C0; a pulsar at 0.28 is IN range').toBe(true)
  })

  it('the wide zone still has a floor — 0.18 kills at neither 64 nor 65', () => {
    expect(0.18, 'premise: 0.18 is below even $C0 (0.214)').toBeLessThan(ZONE_C0)
    expect(pulsarKillsAt(65, 0.18), 'below $C0 → harmless even at wave 65').toBe(false)
    expect(pulsarKillsAt(64, 0.18), 'below $A0 → harmless at wave 64').toBe(false)
  })

  it('liveness — the electrocution DOES fire inside $A0 (0.40) at both waves', () => {
    // Without this, the two `false`s above could pass simply because pulsars never kill.
    expect(pulsarKillsAt(64, 0.40), 'inside $A0 at wave 64 must kill').toBe(true)
    expect(pulsarKillsAt(65, 0.40), 'inside $C0 at wave 65 must kill').toBe(true)
  })
})

// ── AC-6/7/8: the CONTOUR fold — every deep-wave lookup stays NON-ZERO ────────────────
describe('tp1-26 — deep waves fold to the wave-99 row, never to 0 (CONTOUR 415-423)', () => {
  it('PULTIM does not fall to 0 above wave 99 — the pulse keeps its wave-99 cadence, unfrozen', () => {
    for (const level of [100, 150]) {
      const m = measurePulse(level)
      expectLivePulse(m, `wave ${level}`) // a naive walk → PULTIM 0 → son never moves → sawPulse false → fails here
      expect(m.period, `wave ${level}: not the folded (wave-99) period`).toBe(20)
      expect(m.runs.every((r) => r === 3), `wave ${level}: not the folded duty`).toBe(true)
    }
  })

  it('PULPOT does not go degenerate above wave 99 — the $C0 zone folds through intact', () => {
    for (const level of [100, 150]) {
      expect(pulsarKillsAt(level, 0.28), `wave ${level}: kill zone lost past wave 99`).toBe(true)  // inside folded $C0
      expect(pulsarKillsAt(level, 0.18), `wave ${level}: kill zone became everywhere`).toBe(false) // below folded $C0
    }
  })

  it('wfuschForLevel already folds — the anchor this story generalises to PULTIM and PULPOT', () => {
    // GREEN today (tp1-25 shipped the fold inline). Kept here so the suite shows the ONE
    // fold that must now cover all three tables; tp1-25.fuseball-chase.test.ts remains the
    // independent regression guard that this fold survives Dev's contourWave() extraction.
    expect(wfuschForLevel(100)).toBe(FUSE_CHASE_AT_TOP | FUSE_CHASE_ON_TUBE)
    expect(wfuschForLevel(150)).toBe(FUSE_CHASE_AT_TOP | FUSE_CHASE_ON_TUBE)
  })
})
