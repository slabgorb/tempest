// tests/audit/tp1-13.audio-wiring-cues.test.ts
//
// Story tp1-13 — AUDIO WIRING GAPS (audit cluster C9: S-011, S-013, S-014, S-015).
// The chain-of-proof half, following tests/audit/alsoun-cue-mapping.test.ts (the
// cluster-C8 authority): every NEW wiring is pinned event → SoundName → cue →
// ROM record, and the one DELETED wiring is pinned to stay deleted.
//
//   'warp-space'     → startLoop('thrustSpace') → thrust_space.wav → $cc81 = T3
//                      ";THRUST SOUND IN SPACE" — dispatched by SOUTS3 the frame
//                      the cursor passes ILINDDY (MOVCUD, ALWELG.MAC:1032-1037).
//   'wave-bonus'     → play('extraLife')        → extra_life.wav  → $cc11 = WP
//                      ";SPECIAL SCORE" — SAUSON's SECOND trigger, the end-of-wave
//                      bonus (ENDWAV, ALEXEC.MAC:371-376); the first is the
//                      score-threshold life at GIVBON (ALEXEC.MAC:586).
//   'bolt-destroyed' → play('enemyDeath')       → enemy_explosion.wav → $cc5d = EX
//                      ";ENEMY EXPLOSION" — INCCSQ's CCEXPL on a charge-charge
//                      kill (ALWELG.MAC:2797).
//   'superzapper-activate' → NOTHING. kzap.wav is an invention with no slot in
//                      ALSOUN's 13-sound table (S-011); the authentic zap audio
//                      is the EX burst each vaporised enemy's own 'enemy-death'
//                      event already plays (PROSUZ → KILENE → … → CIEXPL,
//                      ALWELG.MAC:3499-3537, 2839).
//
// The SoundName → .wav filename hop lives in audio.ts's unexported SOUNDS
// manifest; it is pinned BEHAVIOURALLY in tests/shell/audio.test.ts (the engine
// fetch list must gain thrust_space.wav and lose kzap.wav). Here we pin the two
// hops on either side of it.
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

import { SFX } from '../../tools/pokey-bake/sfx-data.mjs'
import { playEventSounds } from '../../src/shell/audio-dispatch'
import type { AudioEngine, SoundName } from '../../src/shell/audio'
import type { GameEvent } from '../../src/core/events'

const sourceDir = process.env.TEMPEST_SOURCE_DIR ?? '/Users/slabgorb/Projects/tempest-source-text'
const sourceAvailable = existsSync(sourceDir)

// The three ALSOUN records this story wires (addresses + slot names pinned by
// tests/audit/alsoun-cue-mapping.test.ts, byte-verified there and in the
// provenance suite below).
const T3_ROM = '$cc81' // idx 7, ";THRUST IN SPACE"
const WP_ROM = '$cc11' // idx 4, ";SPECIAL SCORE"
const EX_ROM = '$cc5d' // idx 1, ";ENEMY EXPLOSION"

const cue = (name: string) => {
  const found = SFX.find((s) => s.name === name)
  if (!found) throw new Error(`no SFX cue named '${name}'`)
  return found
}

// ── compile-time pins (tsc goes red until Dev lands the manifest change) ──────
// AC-1's new cue must join the SoundName union…
const _thrustSpaceIsASound: SoundName = 'thrustSpace'
void _thrustSpaceIsASound
// …and AC-4's invented cue must leave it. Pre-GREEN this suppression is "dead"
// (the assignment still compiles), which itself fails `tsc --noEmit` — that IS
// the red, and it flips green when Dev deletes the superzapper cue.
// @ts-expect-error tp1-13 AC-4: 'superzapper' is no longer a SoundName
const _superzapperIsNot: SoundName = 'superzapper'
void _superzapperIsNot

// ── the dispatch hop: event → SoundName ───────────────────────────────────────

type Call = { method: 'play' | 'startLoop' | 'stopLoop'; sound: SoundName }
const recorder = () => {
  const calls: Call[] = []
  const audio: Pick<AudioEngine, 'play' | 'startLoop' | 'stopLoop'> = {
    play: (name) => calls.push({ method: 'play', sound: name }),
    startLoop: (name) => calls.push({ method: 'startLoop', sound: name }),
    stopLoop: (name) => calls.push({ method: 'stopLoop', sound: name }),
  }
  return { calls, audio }
}

describe('tp1-13 — event → cue → ROM chain for the three new wirings', () => {
  // The event literals below are annotated (never cast): pre-GREEN they do not
  // exist in the GameEvent union, so `tsc --noEmit` fails — the compile half of
  // this RED — while vitest (which strips types) still runs the behavioural
  // half. A cast would survive GREEN and silently mask payload-field typos.
  it("starts the thrustSpace loop on 'warp-space', and the bake carries T3 at $cc81", () => {
    const { calls, audio } = recorder()
    const warpSpace: GameEvent = { type: 'warp-space' }
    playEventSounds(audio, [warpSpace])
    expect(calls).toContainEqual({ method: 'startLoop', sound: 'thrustSpace' })
    // T3 must hand over from T2: the in-well loop stops on the same event.
    expect(calls).toContainEqual({ method: 'stopLoop', sound: 'levelClear' })
    // No stray one-shots on the handover frame.
    expect(calls.filter((c) => c.method === 'play')).toHaveLength(0)

    const thrust = cue('thrust_space')
    expect(thrust.rom, 'thrust_space carries ALSOUN\'s T3 record').toBe(T3_ROM)
  })

  it("stops BOTH thrust loops on 'warp-end' — no bleed past the dive on either path", () => {
    const { calls, audio } = recorder()
    playEventSounds(audio, [{ type: 'warp-end' }])
    expect(calls).toContainEqual({ method: 'stopLoop', sound: 'levelClear' })
    expect(calls).toContainEqual({ method: 'stopLoop', sound: 'thrustSpace' })
    expect(calls.filter((c) => c.method === 'startLoop')).toHaveLength(0)
  })

  it("plays the WP special-score chime on 'wave-bonus' — SAUSON's second trigger", () => {
    const { calls, audio } = recorder()
    const waveBonus: GameEvent = { type: 'wave-bonus', points: 6000 }
    playEventSounds(audio, [waveBonus])
    expect(calls).toEqual([{ method: 'play', sound: 'extraLife' }])
    expect(cue('extra_life').rom, 'extra_life carries ALSOUN\'s WP record').toBe(WP_ROM)
  })

  it("plays the EX explosion on 'bolt-destroyed' — INCCSQ's CCEXPL", () => {
    const { calls, audio } = recorder()
    const boltDown: GameEvent = { type: 'bolt-destroyed', lane: 4, depth: 0.5 }
    playEventSounds(audio, [boltDown])
    expect(calls).toEqual([{ method: 'play', sound: 'enemyDeath' }])
    expect(cue('enemy_explosion').rom, 'enemy_explosion carries ALSOUN\'s EX record').toBe(EX_ROM)
  })
})

describe('tp1-13 AC-4 — kzap is deleted and nothing replaces it (S-011)', () => {
  it("plays NOTHING on 'superzapper-activate' — there is no 14th ALSOUN sound", () => {
    const { calls, audio } = recorder()
    playEventSounds(audio, [{ type: 'superzapper-activate', killCount: 7 }])
    expect(calls).toEqual([])
  })

  it("the zap's authentic audio is the per-kill EX burst its enemy-death events already play", () => {
    // PROSUZ makes no sound of its own; every KILENE vaporisation reaches
    // CIEXPL → EXSNON → SIDEX (ALWELG.MAC:3531, 2839). The sim already emits one
    // 'enemy-death' per zap kill, so the dispatch of those events IS the zap sound.
    const { calls, audio } = recorder()
    playEventSounds(audio, [
      { type: 'superzapper-activate', killCount: 3 },
      { type: 'enemy-death', enemyType: 'flipper', lane: 1, depth: 0.5 },
      { type: 'enemy-death', enemyType: 'tanker', lane: 5, depth: 0.4 },
      { type: 'enemy-death', enemyType: 'pulsar', lane: 9, depth: 0.3 },
    ])
    expect(calls).toEqual([
      { method: 'play', sound: 'enemyDeath' },
      { method: 'play', sound: 'enemyDeath' },
      { method: 'play', sound: 'enemyDeath' },
    ])
  })

  it('no bake cue is named for a zap — ALSOUN has no such slot', () => {
    expect(SFX.some((s) => /zap/i.test(s.name)), 'no kzap/superzap cue in the bake').toBe(false)
  })
})

// ── provenance: re-open Theurer's source and prove the quarry verbatim ────────
// Same pattern as alsoun-cue-mapping's provenance suite: skipped where the 1981
// source is absent (CI), byte-checked where it exists. Line numbers are 1-based
// into the LF-only citable checkout.
describe.skipIf(!sourceAvailable)('tp1-13 — the 1981 source says what we claim it says', () => {
  const lines = (file: string): string[] =>
    readFileSync(join(sourceDir, file), 'latin1').split('\n')
  const at = (file: string, n: number): string => lines(file)[n - 1] ?? ''

  it('MOVCUD starts the space sound the frame the cursor passes ILINDDY (S-014)', () => {
    expect(at('ALWELG.MAC', 1032)).toContain('CMP I,ILINDDY')
    expect(at('ALWELG.MAC', 1034)).toContain('IS CURSOR PAST BOTTOM?')
    expect(at('ALWELG.MAC', 1035)).toContain('LDA I,CENDWA')
    expect(at('ALWELG.MAC', 1035)).toContain('INITIALIZE SPACE MODE')
    expect(at('ALWELG.MAC', 1037)).toContain('JSR SOUTS3')
    expect(at('ALWELG.MAC', 1037)).toContain('START SPACE SOUND')
    expect(at('ALCOMN.MAC', 819)).toContain('ILINDDY=0F0')
  })

  it('the dive\'s spike collision only exists while the cursor is still on the lines', () => {
    // The gate that makes the space phase crash-proof.
    expect(at('ALWELG.MAC', 1083)).toContain('CMP I,ILINDDY')
    expect(at('ALWELG.MAC', 1084)).toContain('IFCC')
    expect(at('ALWELG.MAC', 1085)).toContain('CURSOR STILL ON LINES')
  })

  it('ENDWAV gates the bonus on IFNE and makes noise through SAUSON (S-015)', () => {
    expect(at('ALEXEC.MAC', 371)).toContain('LDA X,BONUS')
    expect(at('ALEXEC.MAC', 372)).toContain('IFNE')
    expect(at('ALEXEC.MAC', 373)).toContain('JSR BONSCO')
    expect(at('ALEXEC.MAC', 375)).toContain('JSR UPSCOR')
    expect(at('ALEXEC.MAC', 376)).toContain('JSR SAUSON')
    expect(at('ALEXEC.MAC', 376)).toContain('MAKE NOISE')
  })

  it('BONUS is the advanced-start code: set at select, cleared on arrival', () => {
    expect(at('ALCOMN.MAC', 704)).toContain('BONUS CODE FOR STARTING AT ADVANCED WAVE')
    expect(at('ALWELG.MAC', 236)).toContain('STA X,BONUS') // select commits the index
    expect(at('ALWELG.MAC', 117)).toContain('CLEAR BONUS') // arrival at the next well
  })

  it('BONPTM holds the ladder; the BCD digit-pair decode yields our literal anchors', () => {
    expect(at('ALWELG.MAC', 266)).toContain('BONSCO:')
    expect(at('ALWELG.MAC', 275)).toContain('.WORD 0,60,160,320,540,740,940,1140')
    // ALWELG is .RADIX 16, and BONSCO emits TEMP0=00 (ones), TEMP1=low byte,
    // TEMP2=high byte as BCD digit-pairs. Decoding the table's own words:
    const words = [0x0, 0x60, 0x160, 0x320, 0x540, 0x740, 0x940, 0x1140]
    const bcdPoints = words.map((w) => {
      const hi = (w >> 8) & 0xff
      const lo = w & 0xff
      return Number(`${hi.toString(16)}${lo.toString(16).padStart(2, '0')}`) * 100
    })
    expect(bcdPoints).toEqual([0, 6_000, 16_000, 32_000, 54_000, 74_000, 94_000, 114_000])
    // The decimal misreading is refuted by the machine: .WORD 160 read as
    // decimal 160 has low byte 0xA0, whose "digit pair" a0 is not a BCD pair at
    // all — the encoding only decodes if the literals are hex.
    expect(((160 & 0xff) >> 4)).toBeGreaterThan(9) // 0xA — not a decimal digit
  })

  it('INCCSQ is the charge-charge kill: EX cue plus its own explosion (S-013)', () => {
    expect(at('ALWELG.MAC', 2797)).toContain('INCCSQ:')
    expect(at('ALWELG.MAC', 2797)).toContain('JSR CCEXPL')
    expect(at('ALWELG.MAC', 2797)).toContain('CHARGE-CHARGE')
  })
})
