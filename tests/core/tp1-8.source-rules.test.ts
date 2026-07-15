// tests/core/tp1-8.source-rules.test.ts
//
// RED suite for story tp1-8 — THE SKILL CONTOUR, part 2. NYMCHA, the per-type
// MIN/MAX population solver (W-034, "the second-largest rewrite in the audit").
// This file pins the SOURCE: what NYMCHA and the five per-type min/max tables
// ACTUALLY encode in ALWELG.MAC, so nobody re-derives the weighted-random roll it
// replaces and so no future transcription can silently regress a byte.
//
// ── The solver, decoded from ALWELG.MAC:1266-1412 (NYMCHA) ────────────────────
//
// A hatching nymph (CONYMP:1179-1200 -> NYMCHA) becomes a type by CONSTRAINT
// SATISFACTION over the live board, in this order:
//
//   1. openings[t] = WFLMAX[t] - FLIPCO[t]   for each of the 5 types (1273-1282).
//      FLIPCO[t] is the live count of type t; the subtract clamps at 0 (IFCS:
//      count > max leaves openings 0). A type AT its max has ZERO openings.
//   2. For EVERY live carrier tanker, subtract 2 openings of its CARGO type
//      (1286-1303, `DEC X,OPFLIP-1` twice) — cargo is RESERVED before it splits.
//   3. Cap every type's openings at the total free invader slots,
//      WINVMX+1 - sum(FLIPCO) (1304-1320).
//   4. If exactly ONE type has openings, take it (1332-1347).
//   5. Otherwise satisfy any type whose live count is below its WFLMIN FIRST
//      (1351-1364) — but the check is NESTED inside `OPFLIP[t] != 0`, so a type
//      with no openings can never have its min enforced.
//   6. Then a SMART LAUNCH: if both a spiker and a tanker slot are open, read the
//      enemy line the nymph stands on and launch a SPIKER on a short/dead line, a
//      TANKER on a long one (1366-1385, CMP I,0CC).
//   7. Failing all that, RANDO2 AND 3, +1 — a random type that EXCLUDES flippers
//      (1386-1389) — and walk to the first needy type.
//
// ── The min>max resolution (AC-6, routed blocking from tp1-7) ─────────────────
//
// On waves 35-39 the assembled ROM is self-contradictory: WSPIMI:625 (dotted
// `35.`) gives spiker MIN 1, WSPIMX:633 (UN-dotted `35` = 0x35 = 53 -> dead
// [53,39] range) gives spiker MAX 0. NYMCHA reads both. This file pins WHY the
// answer is ZERO spikers, not one: step 1 leaves openings[spiker]=0 (max 0), and
// EVERY launch path (steps 4/5/6/7) is gated on openings[t]!=0, so the min is
// never reachable. MAX governs; the min is inert. Decoded from the code, not
// assumed — exactly what AC-6 demands.
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const sourceDir = process.env.TEMPEST_SOURCE_DIR ?? '/Users/slabgorb/Projects/tempest-source-text'
const sourceAvailable = existsSync(join(sourceDir, 'ALWELG.MAC'))

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

/** The routine body from `label:` to the next label at column 0. */
function routine(label: RegExp): string {
  const start = lineOf(label)
  let end = start
  while (end < alwelg.length && !/^[A-Z0-9]+:/.test(alwelg[end])) end++
  return alwelg.slice(start - 1, end).join('\n')
}

/**
 * One numeric token, assembled the way MACRO-11 does inside ALWELG's ambient HEX
 * radix: a trailing dot forces DECIMAL, its absence leaves base 16. This is the
 * whole of the tp1-7 WSPIMX record-6 finding, promoted to the AC-7 net.
 */
const asm = (tok: string): number =>
  tok.endsWith('.') ? parseInt(tok.slice(0, -1), 10) : parseInt(tok, 16)

/** Parse `.BYTE <type>,<start>,<end>,...` records for a contour table label. */
function records(label: RegExp): { type: string; startTok: string; endTok: string }[] {
  const start = lineOf(label)
  const out: { type: string; startTok: string; endTok: string }[] = []
  for (let i = start - 1; i < alwelg.length; i++) {
    const m = /\.BYTE\s+(T[1ZABR]|TZANDF|TE)\b,?([^,]*),?([^,]*)/.exec(alwelg[i])
    if (!m) continue
    if (m[1] === 'TE') break // end of table
    out.push({ type: m[1], startTok: m[2].trim(), endTok: m[3].trim() })
    // stop once we hit the NEXT label at column 0 after having started
    if (i > start - 1 && /^[A-Z0-9]+:/.test(alwelg[i])) break
  }
  return out
}

describe.skipIf(!sourceAvailable)('tp1-8 — the quarry is the CITABLE copy and NYMCHA resolves where named', () => {
  it('ALWELG.MAC has 3569 lines with no form-feeds (the same fingerprint tp1-7 pinned)', () => {
    expect(alwelg.length - 1).toBe(3569)
    expect(alwelg.join('').includes('\f')).toBe(false)
  })

  it('every symbol tp1-8 cites resolves at the line it names — derived, not typed', () => {
    expect(lineOf(/^NYMCHA:/)).toBe(1266)
    expect(lineOf(/^WSPIMI:/)).toBe(621)
    expect(lineOf(/^WSPIMX:/)).toBe(628)
    expect(lineOf(/^WFLIMI:/)).toBe(636)
    expect(lineOf(/^WFLIMX:/)).toBe(639)
    expect(lineOf(/^WTANMI:/)).toBe(645)
    expect(lineOf(/^WPULMI:/)).toBe(658)
    expect(lineOf(/^WFUSMI:/)).toBe(666)
    expect(lineOf(/^WTABLE:/)).toBe(728)
  })
})

describe.skipIf(!sourceAvailable)('tp1-8 — WTABLE fixes the per-type array order [flipper,pulsar,tanker,spiker,fuse]', () => {
  it('the min/max source tables load into consecutive WFLMIN/WFLMAX bytes in TYPE order', () => {
    // NYMCHA indexes WFLMIN/WFLMAX/OPFLIP by a type index 0..4 (LDX I,4 down to 0).
    // The WTABLE .WORD pairs (733-742) declare which source table fills each byte,
    // and the ORDER is the type index. NYMTAD (1423-1427) NEWFLI/NEWPUL/NEWTAN/
    // NEWSPI/NEWFUS confirms the same 0..4 -> flipper,pulsar,tanker,spiker,fuse.
    const body = routine(/^WTABLE:/)
    expect(body).toMatch(/\.WORD\s+WFLIMI,WFLMIN/) // 0 flipper min
    expect(body).toMatch(/\.WORD\s+WFLIMX,WFLMAX/) // 0 flipper max
    expect(body).toMatch(/\.WORD\s+WPULMI,WPUMIN/) // 1 pulsar
    expect(body).toMatch(/\.WORD\s+WPULMX,WPUMAX/)
    expect(body).toMatch(/\.WORD\s+WTANMI,WTAMIN/) // 2 tanker
    expect(body).toMatch(/\.WORD\s+WTANMX,WTAMAX/)
    expect(body).toMatch(/\.WORD\s+WSPIMI,WSPMIN/) // 3 spiker
    expect(body).toMatch(/\.WORD\s+WSPIMX,WSPMAX/)
    expect(body).toMatch(/\.WORD\s+WFUSMI,WFUMIN/) // 4 fuse
    expect(body).toMatch(/\.WORD\s+WFUSMX,WFUMAX/)
  })

  it('NYMTAD dispatches the SAME 0..4 order — flipper, pulsar, tanker, spinner(spiker), fuse', () => {
    const nymtad = routine(/^NYMTAD:/)
    expect(nymtad).toMatch(/\.WORD\s+NEWFLI-1[\s\S]*\.WORD\s+NEWPUL-1[\s\S]*\.WORD\s+NEWTAN-1[\s\S]*\.WORD\s+NEWSPI-1[\s\S]*\.WORD\s+NEWFUS-1/)
  })
})

describe.skipIf(!sourceAvailable)('tp1-8 — the five per-type MIN tables are transcribed VERBATIM (AC-1)', () => {
  // The four MAX tables (WTANMX/WSPIMX/WFUSMX/WPULMX) landed in tp1-7. The MIN tables
  // and the flipper MAX are NEW to NYMCHA — pin their raw bytes here.
  it('WFLIMI / WFLIMX — flippers require 1 (waves 1-4) then 0; max 4/5/3/4/5 by band', () => {
    const mi = lineOf(/^WFLIMI:/)
    expect(line(mi)).toContain('.BYTE T1,1,4,1')
    expect(line(mi + 1)).toBe('\t.BYTE T1,5,99.,0')
    const mx = lineOf(/^WFLIMX:/)
    expect(line(mx)).toContain('.BYTE T1,1,4,4')
    expect(line(mx + 1)).toBe('\t.BYTE T1,5,16.,5')
    expect(line(mx + 2)).toBe('\t.BYTE T1,17.,19.,3')
    expect(line(mx + 3)).toBe('\t.BYTE T1,20.,25.,4')
    expect(line(mx + 4)).toBe('\t.BYTE T1,26.,99.,5')
  })

  it('WPULMI — pulsars require 2 (waves 17-32) then 1 (33+)', () => {
    const mi = lineOf(/^WPULMI:/)
    expect(line(mi + 1)).toBe('\t.BYTE T1,17.,32.,2')
    expect(line(mi + 2)).toBe('\t.BYTE T1,33.,99.,1')
  })

  it('WTANMI — a tanker is REQUIRED on wave 3, then from wave 5 on', () => {
    const mi = lineOf(/^WTANMI:/)
    expect(line(mi)).toContain('.BYTE TZ,1,4,0,0,1,0') // waves 1-4 min = 0,0,1,0
    expect(line(mi + 1)).toBe('\t.BYTE T1,5,16.,1')
  })

  it('WFUSMI — a fuseball is required in its live bands (11-16, 22-25, 27+)', () => {
    const mi = lineOf(/^WFUSMI:/)
    expect(line(mi + 1)).toBe('\t.BYTE T1,11.,16.,1')
    expect(line(mi + 2)).toBe('\t.BYTE T1,22.,25.,1')
    expect(line(mi + 3)).toBe('\t.BYTE T1,27.,99.,1')
  })

  it('WSPIMI — spiker MIN is 1 on waves 35-39 (the DOTTED half of the tp1-7 typo)', () => {
    const mi = lineOf(/^WSPIMI:/)
    expect(line(mi)).toContain('.BYTE TZ,1,4,0,0,0,1')
    expect(line(mi + 1)).toBe('\t.BYTE T1,5,16.,2')
    expect(line(mi + 2)).toBe('\t.BYTE T1,17.,19.,0')
    expect(line(mi + 3)).toBe('\t.BYTE T1,20.,32.,1')
    expect(line(mi + 4)).toBe('\t.BYTE T1,35.,39.,1') // DOTTED -> decimal 35 -> min 1
    expect(line(mi + 5)).toBe('\t.BYTE T1,44.,99.,1')
  })
})

describe.skipIf(!sourceAvailable)('tp1-8 — AC-7: every WSPIMI/WSPIMX record start/end >= 0x0A is radix-pinned', () => {
  // The tp1-7 WSPIMX record-6 typo was latent because no source pin decoded the radix
  // of its start/end. Promote that to a NET: walk every record in BOTH tables and, for
  // any bound >= 0x0A, assert its decode. The invariant that makes a future dropped dot
  // FAIL LOUDLY: every multi-digit bound is DOTTED (decimal) EXCEPT the one known 1981
  // typo at WSPIMX:633. A new un-dotted hex byte breaks the "all dotted but :633" pin.

  it('the ambient radix is HEX — a bare token is base 16, a trailing dot is decimal', () => {
    expect(asm('1F')).toBe(31)
    expect(asm('0FF')).toBe(255)
    expect(asm('35')).toBe(53) // 0x35 — the disputed byte
    expect(asm('35.')).toBe(35)
    expect(asm('99.')).toBe(99)
  })

  // The intended (decimal) wave bounds of every record with a bound >= 10, in table order.
  // Derived from the audit's decode; the test proves the ROM tokens assemble to these.
  const WSPIMI_BOUNDS: [number, number][] = [[5, 16], [17, 19], [20, 32], [35, 39], [44, 99]]
  const WSPIMX_BOUNDS: [number, number][] = [[7, 10], [11, 16], [20, 25], [26, 32], [/*TYPO*/ 35, 39], [43, 99]]

  it('WSPIMI — every bound >= 0x0A is DOTTED and decodes to its intended decimal wave', () => {
    const recs = records(/^WSPIMI:/).filter((r) => asm(r.startTok) >= 0x0a || asm(r.endTok) >= 0x0a)
    // Same count of "big" records as the decode expects — a dropped/extra record fails here.
    expect(recs.length).toBe(WSPIMI_BOUNDS.length)
    recs.forEach((r, i) => {
      const [wantStart, wantEnd] = WSPIMI_BOUNDS[i]
      // WSPIMI has NO typo: every multi-digit bound must be dotted, so hex vs decimal agree.
      if (asm(r.startTok) >= 0x0a) expect(r.startTok.endsWith('.'), `WSPIMI start ${r.startTok} must be dotted`).toBe(true)
      if (asm(r.endTok) >= 0x0a) expect(r.endTok.endsWith('.'), `WSPIMI end ${r.endTok} must be dotted`).toBe(true)
      expect([asm(r.startTok), asm(r.endTok)]).toEqual([wantStart, wantEnd])
    })
  })

  it('WSPIMX — one and ONLY one bound is un-dotted (the :633 `35`=0x35=53 typo); all else dotted', () => {
    const recs = records(/^WSPIMX:/).filter((r) => asm(r.startTok) >= 0x0a || asm(r.endTok) >= 0x0a)
    expect(recs.length).toBe(WSPIMX_BOUNDS.length)

    // Collect every multi-digit bound token and count the un-dotted ones.
    const bigTokens = recs.flatMap((r) => [r.startTok, r.endTok]).filter((t) => asm(t) >= 0x0a)
    const undotted = bigTokens.filter((t) => !t.endsWith('.'))
    expect(undotted, 'exactly one un-dotted multi-digit bound — the 1981 typo').toEqual(['35'])

    // And it is specifically WSPIMX record 6's START, assembling to 0x35 = 53 (a dead range).
    const rec6 = recs[4]
    expect(rec6.startTok).toBe('35')
    expect(asm(rec6.startTok)).toBe(53)
    expect(asm(rec6.endTok)).toBe(39)
    expect(asm(rec6.startTok)).toBeGreaterThan(asm(rec6.endTok)) // covers NO wave -> max 0
  })

  it('the assembled ROM is SELF-CONTRADICTORY on 35-39: WSPIMI min 1 > WSPIMX max 0', () => {
    // Pinned at the source so tp1-8 cannot ship without resolving it. tp1-7 verbatim-
    // transcribed WSPIMX record 6 as the dead [53,39]; here we cross the two tables.
    const spimx = records(/^WSPIMX:/)
    const spimxRec6 = spimx.find((r) => r.startTok === '35')!
    const maxStart = asm(spimxRec6.startTok) // 53
    const maxEnd = asm(spimxRec6.endTok) // 39
    for (let wave = 35; wave <= 39; wave++) {
      expect(wave >= maxStart && wave <= maxEnd, `WSPIMX max must NOT cover wave ${wave}`).toBe(false)
      expect(wave >= 35 && wave <= 39, `WSPIMI (dotted 35.-39.) min covers wave ${wave}`).toBe(true)
    }
  })
})

describe.skipIf(!sourceAvailable)('tp1-8 — NYMCHA is the algorithm the port must reproduce (AC-1/2/3/6)', () => {
  const nymcha = routine(/^NYMCHA:/)

  it('step 1: openings[t] = WFLMAX[t] - FLIPCO[t], clamped at 0 (a type at its max has none)', () => {
    // LDA X,WFLMAX / SEC / SBC X,FLIPCO / IFCS (no borrow: max>=count) / STA X,OPFLIP.
    // IFCC (count>max) leaves OPFLIP untouched at its pre-zeroed 0.
    expect(nymcha).toMatch(/LDA\s+X,WFLMAX[\s\S]*SEC[\s\S]*SBC\s+X,FLIPCO[\s\S]*STA\s+X,OPFLIP/)
  })

  it('step 2 (AC-2): every live CARRIER tanker reserves TWO openings of its cargo type', () => {
    // LOOP FOR EACH INVADER / alive & carrier -> map ZCARFU->ZABFUS+1 -> DEC OPFLIP-1 twice.
    expect(nymcha).toMatch(/AND\s+I,INVCAR[\s\S]*DEC\s+X,OPFLIP-1[\s\S]*DEC\s+X,OPFLIP-1/)
  })

  it('step 3: openings are capped at the total free slots, WINVMX+1 - sum(FLIPCO)', () => {
    // LDA WINVMX / ADC I,1 / loop SBC X,FLIPCO -> total free; then CMP X,OPFLIP / IFCC / STA.
    expect(nymcha).toMatch(/LDA\s+WINVMX[\s\S]*ADC\s+I,1[\s\S]*SBC\s+X,FLIPCO/)
    expect(nymcha).toMatch(/CMP\s+X,OPFLIP[\s\S]*STA\s+X,OPFLIP/)
  })

  it('step 5 (AC-6): the WFLMIN starvation check is NESTED inside "type has openings"', () => {
    // This is the whole min>max resolution: `LDA X,OPFLIP / IFNE / LDA X,FLIPCO /
    // CMP X,WFLMIN / IFCC / JSR NEWTYP`. A type with OPFLIP 0 (max 0) never reaches the
    // min compare, so min 1 > max 0 yields ZERO of that type — MAX governs.
    expect(nymcha).toMatch(/LDA\s+X,OPFLIP\s*\n\s*IFNE[\s\S]*LDA\s+X,FLIPCO[\s\S]*CMP\s+X,WFLMIN[\s\S]*IFCC[\s\S]*JSR\s+NEWTYP/)
  })

  it('step 6 (AC-3): a SMART LAUNCH puts a SPIKER on a short line, a TANKER on a long one', () => {
    // OPSPIN & OPTANK both open -> read LINEY at the nymph's line (TEMP1); a dead line is
    // "REAL SHORT" (0FF); CMP I,0CC picks OPTANK (tanker) on a LONG line, else OPSPIN (spiker).
    expect(nymcha).toMatch(/LDA\s+OPSPIN[\s\S]*LDA\s+OPTANK[\s\S]*LDA\s+Y,LINEY/)
    expect(nymcha).toMatch(/LDX\s+I,OPSPIN-OPFLIP[\s\S]*CMP\s+I,0CC[\s\S]*LDX\s+I,OPTANK-OPFLIP/)
  })

  it('step 7: the random fallback draws RANDO2 AND 3, +1 — a type that EXCLUDES flippers', () => {
    expect(nymcha).toMatch(/LDA\s+RANDO2[\s\S]*AND\s+I,3[\s\S]*INX/)
  })

  it('a failed solve signals TEMP0=0 — CONYMP then PUTS THE NYMPH BACK, never drops it', () => {
    // NYMCHA falls through to `LDA I,0 / STA TEMP0 / RTS`; CONYMP:1197-1199 sees TEMP0=0 and
    // does INC X,NYMPY ("MOVE NYMPH BACK"). This is the back-pressure that keeps the 7-cap safe.
    expect(nymcha).toMatch(/LDA\s+I,0[^\n]*\n\s*STA\s+TEMP0[^\n]*\n\s*RTS/)
    const conymp = routine(/^CONYMP:/)
    expect(conymp).toMatch(/INC\s+X,NYMPY/)
  })
})
