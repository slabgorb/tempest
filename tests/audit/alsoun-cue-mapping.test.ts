// tests/audit/alsoun-cue-mapping.test.ts
//
// Story tp1-2 — THE AUDIO CROSS-WIRING (audit cluster C8: S-008, S-009, S-010).
//
// Story 6-6 identified the ROM's sounds BY EAR and got two of them backwards. The
// primary source settles it. ALSOUN's sound table is a 13-entry list of OFFSET
// macros (ALSOUN.MAC:87-100) and the disassembly's `Lcb01` table is that same list
// IN ORDER — so the table INDEX is the ALSOUN slot, and every slot is named by
// Theurer himself:
//
//     idx1  EX  ";ENEMY EXPLOSION"  $cc5d   <- we ship this as the PLAYER-FIRE cue
//     idx2  LA  ";PLAYER FIRE"      $cbe9   <- we ship this NOWHERE
//     idx7  T3  ";THRUST IN SPACE"  $cc81   <- we ship this as the ENEMY-DEATH cue
//
// So every shot the player fires plays an explosion, and every enemy that dies
// plays the engine drone from the end of the warp dive. This suite pins the three
// records to the cues the ROM actually dispatches them from, by ROM address and by
// byte, so the swap can never silently come back.
//
// These tests assert against BYTES, not audio: "proved by a test on the bake
// mapping, not by ear alone" (AC#2) is a direct instruction not to repeat 6-6's
// mistake. The one place a human ear is allowed to matter is nowhere.
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { SFX, ALSOUN_STREAM, ALSOUN_STREAM_BASE } from '../../tools/pokey-bake/sfx-data.mjs'
import { playEventSounds } from '../../src/shell/audio-dispatch'
import type { AudioEngine, SoundName } from '../../src/shell/audio'
import type { GameEvent } from '../../src/core/events'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const sourceDir = process.env.TEMPEST_SOURCE_DIR ?? '/Users/slabgorb/Projects/tempest-source-text'
const sourceAvailable = existsSync(sourceDir)

// ── The 13-slot ALSOUN table (ALSOUN.MAC:87-100, PNTRS) ──────────────────────
// Slot order is the ROM's own. Addresses are the rev-3 CPU addresses of each
// slot's AUDF record, cross-checked in docs/ux/2026-06-28-pokey-sfx-rom-map.md
// (whose idx column IS this table). AC#4: every sound we ship must be one of these.
const ALSOUN_SLOTS = [
  { idx: 0, slot: 'LO', rom: '$cc39', meaning: 'CURSOR MOVES' },
  { idx: 1, slot: 'EX', rom: '$cc5d', meaning: 'ENEMY EXPLOSION' },
  { idx: 2, slot: 'LA', rom: '$cbe9', meaning: 'PLAYER FIRE' },
  { idx: 3, slot: 'PU', rom: '$cc99', meaning: 'PULSATION' },
  { idx: 4, slot: 'WP', rom: '$cc11', meaning: 'SPECIAL SCORE' },
  { idx: 5, slot: 'DI', rom: '$cbf5', meaning: 'PLAYER DIES' },
  { idx: 6, slot: 'T2', rom: '$cc75', meaning: 'THRUST IN TUBE' },
  { idx: 7, slot: 'T3', rom: '$cc81', meaning: 'THRUST IN SPACE' },
  { idx: 8, slot: 'ES', rom: '$cc45', meaning: 'ENEMY SHOT' },
  { idx: 9, slot: 'EL', rom: '$cc51', meaning: 'ENEMY LINE DESTRUCTION' },
  { idx: 10, slot: 'SL', rom: '$cc69', meaning: 'SLAM' },
  { idx: 11, slot: 'S3', rom: '$cc8d', meaning: '3 SECONDS LEFT WARNING' },
  { idx: 12, slot: 'PO', rom: '$cca9', meaning: 'PULSAR OFF' },
] as const

// ── The three records this story re-seats, verbatim from Theurer's source ────
// Hex in ALSOUN.MAC is written with a leading 0 on letter-initial literals
// (0A2 = 0xa2). The skipIf block at the bottom re-opens the source and proves
// these six constants byte-for-byte, so nothing here is taken on trust.
const LA = {
  // ";LAUNCH SOUND" (ALSOUN.MAC:140) — the cue SLAUNC dispatches the instant a
  // charge leaves the Claw (ALWELG.MAC:2675, "JSR SLAUNC ;LAUNCH SOUND").
  rom: '$cbe9',
  audf: [0x10, 0x01, 0x07, 0x20, 0x00, 0x00], // LA3F, ALSOUN.MAC:141
  audc: [0xa2, 0x01, 0xf8, 0x20, 0x00, 0x00], // LA3A, ALSOUN.MAC:142
  offset: 24, // its position inside ALSOUN_STREAM — the bytes were always here
}
const EX = {
  // ";ENEMY EXPLOSION" (ALSOUN.MAC:181) — dispatched only from EXSNON
  // (ALSOUN.MAC:224), fed by CIEXPL/CCEXPL on a kill. Never from SLAUNC.
  rom: '$cc5d',
  audf: [0x01, 0x08, 0x02, 0x10, 0x00, 0x00], // EX2F, ALSOUN.MAC:181
  audc: [0x86, 0x20, 0x00, 0x04, 0x00, 0x00], // EX2A, ALSOUN.MAC:183
}
const T3 = {
  // ";THRUST SOUND IN SPACE" (ALSOUN.MAC:193) — dispatched only from SOUTS3
  // (ALSOUN.MAC:253) when the cursor clears the bottom of the well and space
  // mode begins. It is an engine drone, not an explosion.
  rom: '$cc81',
  audf: [0x10, 0x0b, 0x01, 0x40, 0x00, 0x00], // T36F, ALSOUN.MAC:193
  audc: [0x86, 0x40, 0x00, 0x0b, 0x00, 0x00], // T36A, ALSOUN.MAC:195
}

// tp1-2 keeps the cue NAMES and moves the ROM records behind them: `player_fire`
// really is the player's fire cue — 6-6 just put the wrong bytes in it. So a
// missing cue name here means someone renamed rather than re-seated, and the
// failure should say so out loud instead of dying on `undefined.rom`.
const cue = (name: string) => {
  const found = SFX.find((s) => s.name === name)
  if (!found) {
    throw new Error(
      `no SFX cue named '${name}'. tp1-2 does not rename the cues — it puts the ` +
        `right ROM record behind each one. If you renamed, say why in a deviation.`,
    )
  }
  return found
}
const atRom = (rom: string) => SFX.filter((s) => s.rom === rom)

describe('tp1-2 AC#1 — the player-fire cue is ALSOUN\'s LAUNCH record, derived from the bake data', () => {
  it('resolves ALSOUN_STREAM offset 24 to ROM $cbe9', () => {
    // The story's two coordinates for the same twelve bytes must agree. If a
    // future edit shifts the blob's base, "offset 24" silently starts meaning a
    // different sound — this is the assertion that catches that.
    expect(ALSOUN_STREAM_BASE + LA.offset).toBe(0xcbe9)
  })

  it('carries the LAUNCH record verbatim at offset 24 of the blob we already shipped', () => {
    // S-010's punchline: the correct bytes were in our own repo the whole time,
    // sitting unused inside ALSOUN_STREAM.
    expect(ALSOUN_STREAM.slice(LA.offset, LA.offset + 6)).toEqual(LA.audf)
    expect(ALSOUN_STREAM.slice(LA.offset + 6, LA.offset + 12)).toEqual(LA.audc)
  })

  it('ships the player-fire cue at $cbe9, DERIVED from those bytes and not hand-authored', () => {
    const fire = cue('player_fire')
    expect(fire.rom, 'player_fire must play the LA record, not EX').toBe(LA.rom)

    // "Derived from the bake data, not hand-authored to taste" (AC#1): the cue's
    // envelope must BE the blob's bytes, value for value. An envelope tuned by ear
    // to sound like a launch would pass a listening test and fail this one.
    expect(fire.alsoun?.audf).toEqual(ALSOUN_STREAM.slice(LA.offset, LA.offset + 6))
    expect(fire.alsoun?.audc).toEqual(ALSOUN_STREAM.slice(LA.offset + 6, LA.offset + 12))
  })

  it('no longer fires an explosion when the player shoots', () => {
    // The negative half of the fix. Without this, a "fix" that leaves the EX bytes
    // on the fire cue and merely relabels things still passes the tests above.
    const fire = cue('player_fire')
    expect(fire.alsoun?.audf, 'the fire cue must not be the ENEMY EXPLOSION envelope').not.toEqual(EX.audf)
    expect(fire.rom).not.toBe(EX.rom)
  })
})

describe('tp1-2 AC#2 — the swap: EX is the enemy explosion, T3 is the thrust drone', () => {
  it('plays the ENEMY EXPLOSION record on an enemy death', () => {
    // These are the bytes currently shipping as player_fire.wav. They belong here.
    const death = cue('enemy_explosion')
    expect(death.rom, 'enemy_explosion must play the EX record (ALSOUN.MAC:181)').toBe(EX.rom)
    expect(death.alsoun?.audf).toEqual(EX.audf)
    expect(death.alsoun?.audc).toEqual(EX.audc)
  })

  it('no longer plays the warp-dive engine drone when an enemy dies', () => {
    const death = cue('enemy_explosion')
    expect(death.alsoun?.audf, 'the enemy-death cue must not be the THRUST-IN-SPACE envelope').not.toEqual(T3.audf)
    expect(death.rom).not.toBe(T3.rom)
  })

  it('still ships the THRUST-IN-SPACE record, as its own cue', () => {
    // The bytes currently shipping as enemy_explosion.wav are not garbage — they
    // are ALSOUN's T3, the drone that takes over when the dive reaches space. They
    // must survive the swap as a cue of their own: tp1-9 wires them to the warp's
    // second phase and reuses exactly this record, so losing them here breaks it.
    const thrust = atRom(T3.rom)
    expect(thrust, `exactly one cue must carry the T3 record ${T3.rom}`).toHaveLength(1)
    expect(thrust[0].alsoun?.audf).toEqual(T3.audf)
    expect(thrust[0].alsoun?.audc).toEqual(T3.audc)

    // ...and it must be a cue in its own right, not the enemy-death or fire cue.
    expect(thrust[0].name).not.toBe('enemy_explosion')
    expect(thrust[0].name).not.toBe('player_fire')
  })

  it('gives each of the three records exactly one home', () => {
    // A swap done by copy-paste rather than by moving leaves a duplicate behind —
    // two cues on one ROM record, one record silently dropped.
    for (const rom of [LA.rom, EX.rom, T3.rom]) {
      expect(atRom(rom), `${rom} must be shipped by exactly one cue`).toHaveLength(1)
    }
  })
})

describe('tp1-2 AC#2 — the shell still dispatches those cues to the right events', () => {
  // The bake mapping is only half the chain. These two events must keep reaching
  // the cues we just re-seated, or the fix is right in the data and still wrong in
  // the game. audio.ts's SOUNDS manifest resolves 'fire' -> player_fire.wav and
  // 'enemyDeath' -> enemy_explosion.wav, and the bake writes `${name}.wav`, so
  // event -> SoundName (here) + SoundName -> cue (manifest) + cue -> ROM record
  // (above) closes the loop from trigger to bytes.
  const recorder = () => {
    const played: SoundName[] = []
    const audio: Pick<AudioEngine, 'play' | 'startLoop' | 'stopLoop'> = {
      play: (name) => played.push(name),
      startLoop: () => {},
      stopLoop: () => {},
    }
    return { played, audio }
  }

  const FIRED: GameEvent = { type: 'fire', lane: 3, depth: 1 }
  const KILLED: GameEvent = { type: 'enemy-death', enemyType: 'flipper', lane: 3, depth: 0.4 }

  it('plays the fire cue — now the LAUNCH record — when the player shoots', () => {
    const { played, audio } = recorder()
    playEventSounds(audio, [FIRED])
    expect(played).toEqual(['fire'])
    expect(cue('player_fire').rom).toBe(LA.rom)
  })

  it('plays the enemy-death cue — now the EXPLOSION record — when an enemy dies', () => {
    const { played, audio } = recorder()
    playEventSounds(audio, [KILLED])
    expect(played).toEqual(['enemyDeath'])
    expect(cue('enemy_explosion').rom).toBe(EX.rom)
  })
})

describe('tp1-2 AC#4 — every shipped sound traces to a slot in ALSOUN\'s 13-sound table', () => {
  it('invents no new .wav: each cue sits on one of the 13 ROM slots', () => {
    const slots = new Set<string>(ALSOUN_SLOTS.map((s) => s.rom))
    for (const spec of SFX) {
      expect(slots.has(spec.rom), `${spec.name} (${spec.rom}) is not an ALSOUN slot`).toBe(true)
    }
  })

  it('keeps the table itself honest: 13 slots, all distinct', () => {
    expect(ALSOUN_SLOTS).toHaveLength(13) // PNTRS, ALSOUN.MAC:88-100
    expect(new Set(ALSOUN_SLOTS.map((s) => s.rom)).size).toBe(13)
  })
})

describe('tp1-2 AC#3 — the POKEY map\'s unresolved "?" is resolved to $cbe9', () => {
  const map = () => readFileSync(join(repoRoot, 'docs/ux/2026-06-28-pokey-sfx-rom-map.md'), 'utf8')
  const rowFor = (rom: string) =>
    map()
      .split('\n')
      .filter((l) => l.startsWith('|') && l.includes(rom))

  it('no longer shrugs at the launch sound', () => {
    // The map's authors flagged idx2 "player-shot variant?" and never came back to
    // it. That "?" is the whole reason the launch sound went unshipped for a year.
    expect(map()).not.toMatch(/player-shot variant\?/)
  })

  it('names $cbe9 as the player-fire / LAUNCH slot', () => {
    const rows = rowFor('$cbe9')
    expect(rows, 'the map must still have a row for $cbe9').not.toHaveLength(0)
    expect(rows.join('\n')).toMatch(/launch|player-fire|\bLA\b/i)
  })

  it('stops calling the ENEMY EXPLOSION record "player-fire"', () => {
    // idx1 ($cc5d) is EX. The map's by-ear label here is what misled story 6-6.
    expect(rowFor('$cc5d').join('\n')).toMatch(/enem/i)
  })

  it('names $cc81 as the thrust-in-space slot, not an enemy explosion', () => {
    // idx7 is T3. The map already suspected this ("zoom-end") and waved it off in
    // its own Notes as a naming quibble — it was not. It was the bug.
    const row = rowFor('$cc81').join('\n')
    expect(row).toMatch(/thrust|space|\bT3\b/i)
  })
})

describe('tp1-2 AC#5 — the audit record is reconciled, so citations stay green', () => {
  // check-citations re-opens every finding's `ours` line against the working tree.
  // The moment Dev edits sfx-data.mjs, S-008's and S-009's cited lines stop
  // matching and `npm test -- citations` goes red. `remediated_by` is the mechanism
  // tp1-1 established for exactly this: the citation is kept as HISTORY and is no
  // longer re-opened. Without it, this story cannot go green — and an audit that
  // still says our code plays an explosion on fire is an audit nobody can trust.
  const findings = () =>
    JSON.parse(readFileSync(join(repoRoot, 'docs/audit/findings/pair-5-alsoun-audio.json'), 'utf8')) as {
      id: string
      remediated_by?: string
      ours: { file: string; line: number } | null
    }[]

  const finding = (id: string) => {
    const f = findings().find((x) => x.id === id)
    if (!f) throw new Error(`${id} is gone — the audit is a record, not a scratchpad`)
    return f
  }

  it.each(['S-008', 'S-009', 'S-010'])('marks %s remediated_by tp1-2', (id) => {
    expect(finding(id).remediated_by, `${id} is fixed by this story and must say so`).toBe('tp1-2')
  })

  it('gives S-010 the `ours` citation its remediation now requires', () => {
    // S-010 is NO_COUNTERPART: `ours` was null because the launch sound existed
    // nowhere in our code. It exists now — so the finding gets a real `ours`, which
    // check-citations demands of anything marked remediated_by.
    const ours = finding('S-010').ours
    expect(ours, 'S-010 now HAS a counterpart — cite it').not.toBeNull()
    expect(ours?.file).toBe('tools/pokey-bake/sfx-data.mjs')
  })
})

// ── Provenance: prove the constants above against the 1981 source ────────────
// Skipped in CI, which has no copy of Theurer's source. Locally it is the whole
// point: every byte this story moves is re-read from ALSOUN.MAC at the line the
// audit cites, so a typo in the constants above cannot survive.
describe.skipIf(!sourceAvailable)('tp1-2 provenance — bytes re-read from Theurer\'s ALSOUN.MAC', () => {
  const line = (n: number) => readFileSync(join(sourceDir, 'ALSOUN.MAC'), 'utf8').split('\n')[n - 1]

  // `.BYTE 10,1,7,20,0,0` -> [0x10, 0x01, 0x07, 0x20, 0x00, 0x00]
  const bytesOf = (src: string) =>
    src
      .replace(/;.*$/, '')
      .replace(/^\s*\S*:?\s*\.BYTE\s+/i, '')
      .split(',')
      .map((b) => parseInt(b.trim(), 16))

  it('the 13-slot table is ALSOUN PNTRS, in order', () => {
    for (const { idx, slot, meaning } of ALSOUN_SLOTS) {
      const src = line(88 + idx) // PNTRS: ALSOUN.MAC:87, first OFFSET on :88
      expect(src, `slot ${idx}`).toMatch(new RegExp(`OFFSET\\s+${slot}\\b`))
      expect(src.toUpperCase(), `slot ${idx} meaning`).toContain(meaning)
    }
  })

  it('LA is the PLAYER FIRE slot and holds the bytes we ship as the fire cue', () => {
    expect(line(90)).toMatch(/OFFSET\s+LA\b.*;PLAYER FIRE/)
    expect(line(140)).toMatch(/;LAUNCH SOUND/)
    expect(bytesOf(line(141))).toEqual(LA.audf) // LA3F
    expect(bytesOf(line(142))).toEqual(LA.audc) // LA3A
  })

  it('EX is the ENEMY EXPLOSION slot and holds the bytes we shipped as player_fire', () => {
    expect(line(89)).toMatch(/OFFSET\s+EX\b.*;ENEMY EXPLOSION/)
    expect(line(181)).toMatch(/;ENEMY EXPLOSION/)
    expect(bytesOf(line(181))).toEqual(EX.audf.slice(0, 4)) // EX2F — 4 bytes, then 0,0 on :182
    expect(bytesOf(line(183))).toEqual(EX.audc.slice(0, 4)) // EX2A
  })

  it('T3 is the THRUST IN SPACE slot and holds the bytes we shipped as enemy_explosion', () => {
    expect(line(95)).toMatch(/OFFSET\s+T3\b.*;THRUST IN SPACE/)
    expect(line(193)).toMatch(/;THRUST SOUND IN SPACE/)
    expect(bytesOf(line(193))).toEqual(T3.audf.slice(0, 4)) // T36F
    expect(bytesOf(line(195))).toEqual(T3.audc.slice(0, 4)) // T36A
  })

  it('SLAUNC — the only dispatcher of LA — fires the moment a charge launches', () => {
    const alwelg = readFileSync(join(sourceDir, 'ALWELG.MAC'), 'utf8').split('\n')
    expect(alwelg[2674]).toMatch(/JSR\s+SLAUNC\s*;LAUNCH SOUND/) // ALWELG.MAC:2675
  })
})
