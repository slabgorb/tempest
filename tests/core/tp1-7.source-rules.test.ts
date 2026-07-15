// tests/core/tp1-7.source-rules.test.ts
//
// RED suite for story tp1-7 — THE SKILL CONTOUR, part 1. The SOURCE-LEVEL rules:
// pin what the ROM's CONTOUR/WTABLE machinery ACTUALLY encodes, so nobody "fixes"
// a transcription back into the hand-tuned curve it replaces.
//
// This story lifts EIGHT per-wave tables out of ALWELG.MAC's skill contour and stops
// hand-tuning the difficulty curves. Every one is the SAME mechanism — CONTOUR walks
// WTABLE and dispatches on a one-byte type code — read eight times:
//
//   enemy count        TNYMMX   (697)   TZ, itemised, NON-MONOTONIC (drops at 7 and 12)
//   invader speed      TINVIN   (591)   piecewise, DIPS at wave 17, keeps climbing past 33
//   spiker speed       TSPIIN   (602)   TB (byte + WINVIL): == flipper for waves 1-20
//   enemy-bolt cap     TCHAMX   (586)   TZ, WCHAMX+1, NON-MONOTONIC (up AND down)
//   enemy-bolt speed   TCHARIN  (600)   TB, byte -64 -> always +2.0 along/frame
//   tanker cargo       WWTAC2/3 (614)   flipper-only until wave 33; pulsar only at 41+
//   intro waves        WTANMX/WSPIMX    tankers first appear WAVE 3, spikers WAVE 4
//   pre-seeded spikes  TELIHI   (696)   TZANDF: from wave 4 every lane starts spiked
//
// The type codes are the whole trick, and three of them are traps:
//   - TZ is ITEMISED (one byte per wave) — read it as one-value-for-the-range and every
//     count collapses to its first byte.
//   - TB adds the byte to WINVIL (the invader speed already computed by the BACKWARD walk),
//     so a "0" byte means "identical to the flipper", not "zero".
//   - TZANDF ANDs the wave with 0xF first, so TELIHI is periodic mod 16.
//
// And the fold: CONTOUR rewrites CURWAV>=98 to a random wave in 65..96 BEFORE it walks
// (415-423), so the ROM can never fall off its own table. Our s.level is uncapped
// (sim.ts increments it forever; MAX_SELECT_LEVEL bounds only the SELECT screen), so a
// naive walk returns the end-of-table 0 at wave 100 — and 0 here is catastrophic: a wave
// with zero enemies, a frozen pulse, a rim-depth kill zone. The behavioural suite
// (tp1-7.contour-tables.test.ts) holds the lookups to the fold; this file pins the SOURCE.
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const sourceDir = process.env.TEMPEST_SOURCE_DIR ?? '/Users/slabgorb/Projects/tempest-source-text'
const sourceAvailable = existsSync(join(sourceDir, 'ALWELG.MAC'))

/** The WRONG copy — kept only so the fingerprint can be shown to reject it. Never cite it. */
const SIBLING = '/Users/slabgorb/Projects/tempest-source/ALWELG.MAC'

let alwelg: string[] = []
if (sourceAvailable) alwelg = readFileSync(join(sourceDir, 'ALWELG.MAC'), 'utf8').split('\n')

/** 1-based, the way a citation reads. */
const line = (n: number): string => alwelg[n - 1] ?? ''

/** Derive a label's line rather than typing it — a typed number is a guess (tp1-25). */
function lineOf(pattern: RegExp): number {
  const i = alwelg.findIndex((l) => pattern.test(l))
  if (i < 0) throw new Error(`ALWELG.MAC: no line matches ${pattern}`)
  return i + 1
}

describe.skipIf(!sourceAvailable)('tp1-7 — the quarry is the CITABLE copy, not its short sibling', () => {
  it('ALWELG.MAC has 3569 lines — the short copy is a different file and must not be cited', () => {
    // Same fingerprint tp1-25 established. The CRLF sibling glues each form-feed page break
    // onto the following line and runs ten lines short, in a STAIRCASE with no constant
    // offset. Every citation in this story is worthless against the wrong copy.
    expect(alwelg.length - 1).toBe(3569)
    expect(alwelg.join('').includes('\f')).toBe(false)
  })

  it('the citations this story rests on resolve at the lines it names', () => {
    // If these drift, EVERY line number in tp1-7 is suspect. Fail loudly here rather than
    // quietly in the findings JSON. Derived, not typed.
    expect(lineOf(/^TNYMMX:/)).toBe(697)
    expect(lineOf(/^TINVIN:/)).toBe(591)
    expect(lineOf(/^TSPIIN:/)).toBe(602)
    expect(lineOf(/^TCHAMX:/)).toBe(586)
    expect(lineOf(/^TCHARIN:/)).toBe(600)
    expect(lineOf(/^TELIHI:/)).toBe(696)
    expect(lineOf(/^WTANMX:/)).toBe(651)
    expect(lineOf(/^WSPIMX:/)).toBe(628)
  })

  it.skipIf(!existsSync(SIBLING))('BITES: the real sibling copy fails this fingerprint', () => {
    const sibling = readFileSync(SIBLING, 'utf8').split('\n')
    expect(sibling.length - 1, 'the sibling is not 3569 lines').not.toBe(3569)
    expect(sibling.join('').includes('\f'), 'the sibling keeps its form feeds').toBe(true)
  })
})

describe.skipIf(!sourceAvailable)('tp1-7 — the CONTOUR type codes (the byte that decides everything)', () => {
  it('TZ is ITEMISED (one byte per wave) — NOT one value for the whole range', () => {
    // The trap. TNYMMX/TCHAMX/WTANMX/WSPIMX are all TZ. Read TZ as "one byte for the range"
    // (its T1 sibling) and every count collapses to its first entry: enemyCount forever 10,
    // bolt cap forever 2, spikers forever 0.
    expect(line(409)).toBe('TZ=4;\t1 BYTE IN PARAMETER FIELD FOR EACH WAVE IN RANGE')
    expect(line(408)).toBe('T1=2;\t1 BYTE IN PARAMETER FIELD GOES FOR ALL WAVES IN RANGE')
  })

  it('TB "ADD BYTE 3 TO WINVIN" — so TSPIIN/TCHARIN are OFFSETS onto the invader speed', () => {
    // TSPIIN's byte is 0 for waves 1-20 -> spiker speed IS the flipper's speed, not zero.
    // TCHARIN's byte is -64 for all waves -> the bolt is always exactly +2.0 along/frame.
    expect(line(413)).toBe('TB=0A; ADD BYTE 3 TO WINVIN')
    // DOTB is literally `param + WINVIL`, and CONTOUR walks WTABLE BACKWARDS (INDEX1 from
    // WTABEND-WTABLE-1, SBC #4 each pass), so TINVIN (later in forward order at line 754)
    // sets WINVIL BEFORE TSPIIN (752) / TCHARIN (753) read it.
    const dotb = lineOf(/^DOTB:/)
    expect(alwelg.slice(dotb, dotb + 5).join('\n')).toMatch(/ADC\s+WINVIL/)
  })

  it('TZANDF ANDs the wave with 0xF first — TELIHI is periodic mod 16', () => {
    expect(line(411)).toBe('TZANDF=6; AND CURRENT WAVE WITH F, THE DO TZ')
    const dotzan = lineOf(/^DOTZAN:/)
    expect(alwelg.slice(dotzan, dotzan + 6).join('\n')).toMatch(/AND\s+I,0?F/)
  })

  it('TA "AND BYTE 4 TO BYTE 3 FOR EACH LEVEL" is an arithmetic ramp (base + delta*offset)', () => {
    expect(line(412)).toBe('TA=8; AND BYTE 4 TO BYTE 3 FOR EACH LEVEL')
  })

  it('TE=0 is EOT and returns 0 — the walk-off value the fold exists to make unreachable', () => {
    expect(line(410)).toBe('TE=0;\tEOT (RETURN WITH 0)')
  })

  it('CONTOUR folds every wave >= 99 to a RANDOM wave in 65..96 BEFORE the walk (415-423)', () => {
    // The port reaches states the ROM caps. This fold is why the ROM never returns the TE
    // zero, and every bounded lookup in this story must reproduce it (extract it ONCE — the
    // tp1-26 epic note — not eight inline copies).
    const contour = lineOf(/^CONTOUR:/)
    const head = alwelg.slice(contour, contour + 26).join('\n')
    expect(head).toMatch(/CMP\s+I,98\./)
    expect(head).toMatch(/LDA\s+RANDO2/)
    expect(head).toMatch(/AND\s+I,1F/)
    expect(head).toMatch(/ORA\s+I,40/)
    expect(head).toMatch(/INC\s+TEMP2/)
    // Derive the band, don't trust prose: (RANDO2 & 0x1F | 0x40) then INC -> 65..96.
    const lo = ((0x00 & 0x1f) | 0x40) + 1
    const hi = ((0x1f & 0x1f) | 0x40) + 1
    expect([lo, hi]).toEqual([65, 96])
  })
})

describe.skipIf(!sourceAvailable)('tp1-7 — the eight tables are transcribed VERBATIM (AC-1)', () => {
  // Each record is pinned at its derived label line. The `.toContain` guards the .BYTE
  // payload; the leading label + tab is asserted by lineOf resolving the symbol.

  it('TNYMMX (enemy count) — 16 itemised bytes, and it DROPS at wave 7 and wave 12', () => {
    expect(line(lineOf(/^TNYMMX:/)))
      .toContain('.BYTE TZ,1,16.,10.,12.,15.,17.,20.,22.,20.,24.,27.,29.,27.,24.,26.,28.,30.,27.')
    // The non-monotonic drops are the whole point of W-011 (a straight line cannot express
    // them): 22 -> 20 at wave 7, 27 -> 24 at wave 12.
    const t = lineOf(/^TNYMMX:/)
    const bytes = /\.BYTE TZ,1,16\.,(.+)/.exec(line(t))![1].split(',').map((b) => parseInt(b, 10))
    expect(bytes.slice(0, 16)).toEqual([10, 12, 15, 17, 20, 22, 20, 24, 27, 29, 27, 24, 26, 28, 30, 27])
    expect(bytes[6]).toBeLessThan(bytes[5]) // wave 7 < wave 6
    expect(bytes[11]).toBeLessThan(bytes[10]) // wave 12 < wave 11
  })

  it('TINVIN (invader speed) — waves 1-8 ramp -44 by -5, itemised 9-16, DIP at 17', () => {
    const t = lineOf(/^TINVIN:/)
    expect(line(t + 1)).toBe('\t.BYTE TA,1,8,-44.,-5')
    expect(line(t + 2)).toBe('\t.BYTE TZ,9,16.,-81.,-84.,-84.,-84.,-88.,-92.,-96.,-96.')
    expect(line(t + 3)).toBe('\t.BYTE TA,17.,25.,-81.,-3') // wave 17 restarts at -81: SLOWER than 16's -96
    expect(line(t + 8)).toBe('\t.BYTE TR,65.,99.,-160.,-191.') // deep waves alternate, they do not cap
  })

  it('TSPIIN (spiker speed) — TB 0 for waves 1-20: the spiker IS the flipper', () => {
    const t = lineOf(/^TSPIIN:/)
    expect(line(t)).toContain('.BYTE TB,1,20.,0')
    expect(line(t + 1)).toBe('\t.BYTE TB,21.,32.,-48.')
  })

  it('TCHAMX (enemy-bolt cap) — TZ, and the ";ADD 1" says the live cap is WCHAMX+1', () => {
    expect(line(lineOf(/^TCHAMX:/))).toContain('.BYTE TZ,1,9,1,1,1,2,3,2,2,3,3')
    expect(line(lineOf(/^TCHAMX:/))).toContain(';ADD 1')
  })

  it('TCHARIN (enemy-bolt speed) — one TB record, byte -64, for every wave', () => {
    const t = lineOf(/^TCHARIN:/)
    expect(line(t + 1)).toBe('\t.BYTE TB,1,99.,-64.')
  })

  it('WWTAC2 / WWTAC3 (tanker cargo slots 2 & 3) — flipper until 33, pulsar only at 41+', () => {
    const w2 = lineOf(/^WWTAC2:/)
    expect(line(w2 + 1)).toBe('\t.BYTE T1,1,32.,ZCARFL')
    expect(line(w2 + 2)).toBe('\t.BYTE T1,33.,40.,ZCARFU')
    expect(line(w2 + 3)).toBe('\t.BYTE T1,41.,99.,ZCARPU')
    const w3 = lineOf(/^WWTAC3:/)
    expect(line(w3 + 1)).toBe('\t.BYTE T1,1,48.,ZCARFL')
    expect(line(w3 + 2)).toBe('\t.BYTE T1,49.,99.,ZCARFU')
    // Slots 0 and 1 are hard-set to ZCARFL EVERY wave in CONTOUR itself (not in WTABLE) —
    // so all four cargo slots are flippers for waves 1-32.
    const contour = lineOf(/^CONTOUR:/)
    const body = alwelg.slice(contour, contour + 160).join('\n')
    expect(body).toMatch(/LDA\s+I,ZCARFL[\s\S]*STA\s+WTACAR\+1[\s\S]*STA\s+WTACAR\+0/)
  })

  it('WTANMX / WSPIMX (intro waves) — the FIRST non-zero max is the introduction wave', () => {
    // WTANMX itemises the tanker max for waves 1-5 as 0,0,1,0,1 -> a tanker first appears on
    // WAVE 3 (and vanishes again on 4). WSPIMX for waves 1-6 is 0,0,0,2,3,4 -> spikers on 4.
    // Both refute our `level >= 5` gate (W-035).
    expect(line(lineOf(/^WTANMX:/))).toContain('.BYTE TZ,1,5,0,0,1,0,1')
    expect(line(lineOf(/^WSPIMX:/))).toContain('.BYTE TZ,1,6,0,0,0,2,3,4')
    expect(line(lineOf(/^WTANMI:/))).toContain('.BYTE TZ,1,4,0,0,1,0') // wave 3 REQUIRES its tanker
    expect(line(lineOf(/^WSPIMI:/))).toContain('.BYTE TZ,1,4,0,0,0,1') // wave 4 REQUIRES its spiker
  })

  it('TELIHI (pre-seeded spikes) — TZANDF: waves 1-3 clean, wave 4 seeds every lane at 0xE0', () => {
    expect(line(lineOf(/^TELIHI:/)))
      .toContain('.BYTE TZANDF,1,99.,0,0,0,0E0,0D8,0D4,0D0,0C8,0C0,0B8,0B0,0A8,0A0,0A0,0A0,0A8,0A0,9C,9A,98')
    // The AND-0xF index only ever reaches the first 16 bytes; the trailing 4 (0A0,9C,9A,98)
    // are dead data (W-037 correction). Index 3 = wave 4 = 0xE0; index 12 = wave 13 = 0xA0.
    const bytes = /TZANDF,1,99\.,(.+)/.exec(line(lineOf(/^TELIHI:/)))![1]
      .split(',').map((b) => parseInt(b, 16))
    expect(bytes.slice(0, 3)).toEqual([0, 0, 0]) // waves 1-3 clean
    expect(bytes[3]).toBe(0xe0) // wave 4
    expect(bytes[12]).toBe(0xa0) // wave 13
  })
})

describe.skipIf(!sourceAvailable)('tp1-7 — WTABLE binds each table to the parameter it fills', () => {
  it('the WTABLE .WORD entries pair the eight tables with their live parameters', () => {
    const wtable = lineOf(/^WTABLE:/)
    const body = alwelg.slice(wtable, lineOf(/^WTABEND:/)).join('\n')
    expect(body).toMatch(/\.WORD\s+TNYMMX,NWNYMC/)
    expect(body).toMatch(/\.WORD\s+TINVIN,WINVIL/)
    expect(body).toMatch(/\.WORD\s+TSPIIN,WINVIL\+ZABTRA/)
    expect(body).toMatch(/\.WORD\s+TCHAMX,WCHAMX/)
    expect(body).toMatch(/\.WORD\s+TCHARIN,WCHARL/)
    expect(body).toMatch(/\.WORD\s+WWTAC2,WTACAR\+2/)
    expect(body).toMatch(/\.WORD\s+WWTAC3,WTACAR\+3/)
    expect(body).toMatch(/\.WORD\s+WTANMX,WTAMAX/)
    expect(body).toMatch(/\.WORD\s+WSPIMX,WSPMAX/)
    expect(body).toMatch(/\.WORD\s+TELIHI,NWTELI/)
  })
})

describe.skipIf(!sourceAvailable)('tp1-7 — WSPIMX record 6 is a RADIX TYPO (:633 vs :625) — the Reviewer finding', () => {
  // The "intro waves" test above pins only WSPIMX's FIRST record (the TZ, waves 1-6). Record 6
  // (:633) went unpinned and a decimal misread of an un-dotted hex byte slipped through. Pin it
  // now, radix-decoded, so no future transcription can regress. ALWELG.MAC has NO `.RADIX` line
  // — the radix is inherited HEX (bare 0FF/1F immediates only parse under radix 16; the CONTOUR
  // fold's `AND I,1F` at :419, already pinned above, is the proof). A trailing dot forces
  // DECIMAL; its absence leaves the ambient hex. EVERY multi-digit start in BOTH tables is
  // dotted — except :633.

  /** One numeric token, assembled the way MACRO does: trailing dot = decimal, else ambient HEX. */
  const asm = (tok: string): number =>
    tok.endsWith('.') ? parseInt(tok.slice(0, -1), 10) : parseInt(tok, 16)

  it('the ambient radix is HEX — the assembler reads a bare token as base 16', () => {
    expect(asm('1F')).toBe(31) // bare hex-only literal — cannot be decimal or octal
    expect(asm('0FF')).toBe(255)
    expect(asm('35')).toBe(53) // the disputed byte, UN-dotted -> 0x35
    expect(asm('35.')).toBe(35) // its dotted sibling -> decimal
  })

  it(':633 WSPIMX record 6 — `35` is UN-dotted, so it assembles to 0x35 = 53: a DEAD [53,39] range', () => {
    const w = lineOf(/^WSPIMX:/)
    expect(line(w + 5)).toBe('\t.BYTE T1,35,39.,1') // verbatim: 35 has no dot, 39. does
    const [, startTok, endTok] = /\.BYTE T1,([^,]+),([^,]+),/.exec(line(w + 5))!
    expect(startTok).toBe('35') // no trailing dot
    expect(endTok).toBe('39.') // dotted
    expect(asm(startTok)).toBe(53) // 0x35
    expect(asm(endTok)).toBe(39)
    expect(asm(startTok)).toBeGreaterThan(asm(endTok)) // 53 > 39 => the record covers NO wave
  })

  it(':625 WSPIMI record — the SAME band is DOTTED (`35.` = decimal 35, min 1): the typo is one dot', () => {
    const m = lineOf(/^WSPIMI:/)
    expect(line(m + 4)).toBe('\t.BYTE T1,35.,39.,1') // dotted 35. — decimal, min 1 on 35-39
    const [, startTok] = /\.BYTE T1,([^,]+),/.exec(line(m + 4))!
    expect(startTok).toBe('35.')
    expect(asm(startTok)).toBe(35) // decimal — WSPIMI covers waves 35-39 with min 1
  })

  it('the assembled ROM is SELF-CONTRADICTORY on 35-39: min 1 (WSPIMI) > max 0 (WSPIMX) — a 1981 typo', () => {
    // Not a decode bug — a ROM bug. tp1-8's NYMCHA reads both tables per wave and must resolve
    // min>max on these five waves; pinned here so tp1-8 cannot miss it. WSPIMX's dead [53,39]
    // range yields the gap value 0; WSPIMI's dotted 35. yields min 1. The verbatim transcription
    // SURFACES the contradiction — the decimal misread hides it behind an accidental max=1.
    const maxStart = asm('35') // 53
    const maxEnd = asm('39.') // 39
    for (let wave = 35; wave <= 39; wave++) {
      const wspimxCovers = wave >= maxStart && wave <= maxEnd
      expect(wspimxCovers, `WSPIMX record 6 must NOT cover wave ${wave} (max 0)`).toBe(false)
      const wspimiCovers = wave >= 35 && wave <= 39 // WSPIMI:625 dotted -> decimal 35..39
      expect(wspimiCovers, `WSPIMI record must cover wave ${wave} (min 1)`).toBe(true)
    }
  })
})
