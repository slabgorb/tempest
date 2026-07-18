// tests/core/tp1-29.source-rules.test.ts
//
// RED suite for tp1-29 — the SOURCE-level anchors, same shape as tp1-25.source-rules. Two jobs:
//
//   1. FINGERPRINT THE QUARRY. Two copies of Theurer's source disagree about line numbers:
//        ~/Projects/tempest-source-text   3569 lines   <- CITABLE (TEMPEST_SOURCE_DIR default)
//        ~/Projects/tempest-source        3559 lines   <- ten short, glues form-feeds on; NOT citable
//      Re-prove we are reading the citable one before trusting a single line number below.
//
//   2. PIN THE TWO ROM FACTS tp1-29 rests on, so nobody "corrects" them back to what they look like:
//        - INIINV allocates a FIXED per-invader slot (ALWELG.MAC:345-350) — the thing our spliced
//          s.enemies array has no equivalent of, and the whole reason this story exists.
//        - MAYBLR chases on an ODD index (ALWELG.MAC:2157-2160) — TXA / LSR / BCC LEFRIT / JSR FUCHPL
//          — the CODE, not the "ONLY IF INDEX IS EVEN" comment beside it (tp1-28 already corrected the
//          audit doc; this keeps the source proof next to the port).
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const sourceDir = process.env.TEMPEST_SOURCE_DIR ?? '/Users/slabgorb/Projects/tempest-source-text'
const sourceAvailable = existsSync(join(sourceDir, 'ALWELG.MAC'))
let alwelg: string[] = []
if (sourceAvailable) alwelg = readFileSync(join(sourceDir, 'ALWELG.MAC'), 'utf8').split('\n')

/** 1-based, the way a citation reads. */
const line = (n: number): string => alwelg[n - 1] ?? ''

/** Derive a label's line rather than typing it — a typed number is a guess. */
function lineOf(pattern: RegExp): number {
  const i = alwelg.findIndex((l) => pattern.test(l))
  if (i < 0) throw new Error(`ALWELG.MAC: no line matches ${pattern}`)
  return i + 1
}

describe.skipIf(!sourceAvailable)('tp1-29 — reading the CITABLE ALWELG.MAC (3569 lines, no form feeds)', () => {
  it('is the 3569-line copy with no glued form feeds — the short sibling must never be cited', () => {
    expect(alwelg.length - 1).toBe(3569)
    expect(alwelg.join('').includes('\f')).toBe(false)
  })
})

describe.skipIf(!sourceAvailable)('tp1-29 — INIINV allocates a FIXED per-invader slot (ALWELG.MAC:345-350)', () => {
  it('walks NINVAD slots with DEX, zeroing INVAY[X] — one slot per invader, indexed by X', () => {
    //   INIINV: LDX I,NINVAD-1        ; X = the top slot index
    //           LDA I,0
    //           BEGIN                 ; LOOP FOR EACH INVADER
    //           STA X,INVAY           ; DEACTIVATE slot X
    //           DEX
    //           MIEND                 ; until X underflows
    // X is the invader's slot; INVAY is indexed by it, and the invader keeps that slot for life.
    // That fixed-slot identity is what our spliced s.enemies array lacks — hence tp1-29's `slotId`.
    const iniinv = lineOf(/^INIINV:/)
    expect(line(iniinv)).toMatch(/LDX\s+I,NINVAD-1/)
    const body = alwelg.slice(iniinv, iniinv + 5).join('\n')
    expect(body).toMatch(/BEGIN\b[\s\S]*LOOP FOR EACH INVADER/)
    expect(body).toMatch(/STA\s+X,INVAY\b[\s\S]*DEACTIVATE/)   // the slot is indexed by X …
    expect(body).toMatch(/\bDEX\b/)                             // … walked down one invader at a time
    expect(body).toMatch(/\bMIEND\b/)
  })
})

describe.skipIf(!sourceAvailable)("tp1-29 — MAYBLR chases on an ODD slot (ALWELG.MAC:2157-2160). The comment says EVEN and is WRONG.", () => {
  it('TXA / LSR / BCC LEFRIT / JSR FUCHPL — EVEN branches to the coin, ODD falls through to the chase', () => {
    // LSR shifts index bit 0 into the carry; BCC branches when the carry is CLEAR (index EVEN) — and
    // that branch goes to LEFRIT, the coin. FUCHPL (chase) is what falls through, only when the carry
    // is SET (index ODD). The label comment on 2157 ("ONLY IF INDEX IS EVEN") is the author's intent;
    // the code is the behaviour, and tp1-29 ports the CODE. Cite the branch, not the comment.
    const mayblr = lineOf(/^MAYBLR:/)
    const body = alwelg.slice(mayblr, mayblr + 20)
    const txa = body.findIndex((l) => /^\s*TXA\b/.test(l))
    expect(txa, 'MAYBLR: no TXA').toBeGreaterThanOrEqual(0)
    expect(body[txa], 'the (wrong) comment').toMatch(/ONLY IF INDEX IS EVEN/)
    expect(body[txa + 1]).toMatch(/^\s*LSR\b/)
    expect(body[txa + 2], 'EVEN index → the coin').toMatch(/^\s*BCC\s+LEFRIT\b/)
    expect(body[txa + 3], 'ODD index → the chase').toMatch(/^\s*JSR\s+FUCHPL\b/)
    // Spelled out, so a future reader cannot un-see it: the EVEN index branches AWAY from the chase.
    const evenGoesTo = /BCC\s+(\w+)/.exec(body[txa + 2] ?? '')?.[1]
    expect(evenGoesTo, 'the EVEN (carry-clear) branch target is the LEFRIT coin').toBe('LEFRIT')
  })

  it('the parity test is downstream of WFUSCH bit 6 — silent until the on-tube chase bit is set', () => {
    // MAYBLR reaches the parity only through `BIT WFUSCH / IFVS` (V = bit 6, "CHASE PLAYERS ON TUBE").
    // Below the TWFUSC table (waves 1-17, WFUSCH=0) the IFVS is false and the parity is never consulted
    // — which is why an ODD slot does NOT chase at wave 16 (the behavioural guard in the sibling suite).
    const mayblr = lineOf(/^MAYBLR:/)
    const body = alwelg.slice(mayblr, mayblr + 12).join('\n')
    expect(body).toMatch(/BIT\s+WFUSCH/)
    expect(body).toMatch(/IFVS\b[\s\S]*CHASE PLAYERS ON TUBE/)
  })
})
