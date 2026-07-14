// tests/core/tp1-25.source-rules.test.ts
//
// RED suite for story tp1-25 — the source-level rules. Three jobs:
//
//   1. FINGERPRINT THE QUARRY. There are two copies of Theurer's source on this machine
//      and they DISAGREE ABOUT LINE NUMBERS:
//
//        ~/Projects/tempest-source-text   3569 lines   <- CITABLE (TEMPEST_SOURCE_DIR default)
//        ~/Projects/tempest-source        3559 lines   <- ten lines short, NOT citable
//
//      The short copy glues each form-feed page break onto the following line, so the
//      shortfall accrues in a staircase and there is no constant offset that repairs it.
//      Every citation in this story is worthless against the wrong copy. Red Baron shipped
//      a whole poisoned findings doc this way (rb4-2). Tempest has never had this guard.
//      It has one now.
//
//   2. PIN WHAT THE ROM ACTUALLY DOES, so nobody "corrects" it back to what it looks like
//      it should do. Two claims in this story's own wording are refuted by the source:
//        - TR is an ALTERNATION, not a ramp  -> the fuseball does NOT chase at wave 17.
//        - MAYBLR's gate is ODD, not even    -> the ROM's own comment is wrong.
//
//   3. Lang-review (.pennyfarthing/gates/lang-review/typescript.md) check #4: `||` where
//      0 is falsy but valid. WFUSCH is 0 for waves 1-17, and 0 is a REAL answer — a
//      `?? ` / `||` fallback on that lookup silently restores the always-chase bug.
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { wfuschForLevel } from '../../src/core/rules'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const sourceDir = process.env.TEMPEST_SOURCE_DIR ?? '/Users/slabgorb/Projects/tempest-source-text'
const sourceAvailable = existsSync(join(sourceDir, 'ALWELG.MAC'))

/** The WRONG copy — kept only so the fingerprint can be shown to reject it. Never cite it. */
const SIBLING = '/Users/slabgorb/Projects/tempest-source/ALWELG.MAC'

const read = (rel: string): string => readFileSync(join(repoRoot, rel), 'utf8')

/** Strip comments, so prose ABOUT a pattern cannot satisfy — or trip — a grep. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

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

describe.skipIf(!sourceAvailable)('tp1-25 — the quarry is the CITABLE copy, not its short sibling', () => {
  it('ALWELG.MAC has 3569 lines — the 3559-line copy is a different file and must not be cited', () => {
    // The trailing newline splits into a final empty element, hence 3570 entries for 3569 lines.
    expect(alwelg.length - 1).toBe(3569)
  })

  it('the citations this story rests on resolve at the lines it names', () => {
    // If these drift, EVERY line number in tp1-25 is suspect — including the ones baked
    // into the production comments. Fail loudly here rather than quietly there.
    expect(line(686)).toBe('TWFUSC:')
    expect(line(414)).toBe('TR=0C;ALTERNATE BETWEEN BYTES 3 & 4')
    expect(line(2168)).toContain('FUCHPL:')
    expect(line(2169)).toContain('FUSE IS BACKWARDS')
  })

  it('the citable copy has NO form feeds — the sibling keeps all ten, glued onto a line', () => {
    // This is the whole mechanism. ALWELG.MAC has ten page breaks. The citable copy gives
    // each one its own line; the CRLF sibling leaves the raw \x0c attached to the following
    // line and so runs TEN lines short — but not evenly. The shortfall accrues in a
    // STAIRCASE, one line per page break passed, so there is no constant offset that
    // repairs a citation:
    //
    //     TWFUSC:                 citable 686   sibling 685   (1 break passed)
    //     "FUSE IS BACKWARDS"     citable 2169  sibling 2163  (6 breaks passed)
    //
    // Shift everything by 1 to "fix the off-by-one" and you silently re-break every deep
    // citation in the file.
    expect(alwelg.join('').includes('\f')).toBe(false)
  })

  it.skipIf(!existsSync(SIBLING))('BITES: the real sibling copy fails this fingerprint', () => {
    // A fingerprint nobody has tampered with is decoration. Hand the guard the actual wrong
    // copy — the one sitting on this machine, one directory over — and require it to reject
    // it. If this ever passes silently, the guard above has stopped guarding.
    const sibling = readFileSync(SIBLING, 'utf8').split('\n')

    expect(sibling.length - 1, 'the sibling is not 3569 lines').not.toBe(3569)
    expect(sibling.join('').includes('\f'), 'the sibling keeps its form feeds').toBe(true)

    // And the citation that matters is NOT where this story says it is, in that copy.
    expect(sibling[2169 - 1] ?? '').not.toContain('FUSE IS BACKWARDS')
    expect(sibling[2163 - 1] ?? '').toContain('FUSE IS BACKWARDS')   // it is six rows up
  })
})

describe.skipIf(!sourceAvailable)('tp1-25 — TWFUSC starts at 17 and TR ALTERNATES (it does not ramp)', () => {
  it('TWFUSC has no record below wave 17 — CONTOUR falls off the end and returns 0', () => {
    const twfusc = lineOf(/^TWFUSC:/)
    expect(line(twfusc + 1)).toBe('\t.BYTE TR,17.,32.,0,40')
    expect(line(twfusc + 2)).toBe('\t.BYTE TR,33.,48.,40,0C0')
    expect(line(twfusc + 3)).toBe('\t.BYTE T1,49.,99.,0C0')
    expect(line(twfusc + 4)).toBe('\t.BYTE TE')

    // Nothing in the table mentions a wave below 17. That is the whole of tp1-5's half.
    const records = [1, 2, 3].map((d) => line(twfusc + d))
    expect(records.every((r) => !/,(?:[1-9]|1[0-6])\.,/.test(r))).toBe(true)
  })

  it('CONTOUR folds every wave >= 99 back INSIDE the table — so $C0 is the answer forever', () => {
    // REWORK (Reviewer, round 1). We walked off the end of TWFUSC above wave 99 and returned
    // the TE zero, which put the fuseball back on the coin. The ROM never reaches the end of
    // the table, because CONTOUR rewrites the wave before the walk (415-423):
    //
    //     LDA CURWAV / CMP I,98. / IFCS      ; CURWAV >= 98 -> displayed wave >= 99
    //       LDA RANDO2 / AND I,1F / ORA I,40
    //     ENDIF
    //     STA TEMP2 / INC TEMP2
    //
    // Derive the band rather than trusting the arithmetic in prose:
    // CONTOUR: is at 398, but its first INSTRUCTION is at 415 — the intervening lines are
    // the ";PARAMETER TABLES DATA STRUCTURE" block and the T1/TZ/TE/TA/TB/TR type equates.
    // A 10-line window stops short of the code and matches nothing but comments.
    const contour = lineOf(/^CONTOUR:/)
    const head = alwelg.slice(contour, contour + 26).join('\n')
    expect(head).toMatch(/CMP\s+I,98\./)
    expect(head).toMatch(/LDA\s+RANDO2/)
    expect(head).toMatch(/AND\s+I,1F/)
    expect(head).toMatch(/ORA\s+I,40/)
    expect(head).toMatch(/INC\s+TEMP2/)

    const lo = ((0x00 & 0x1f) | 0x40) + 1   // 65
    const hi = ((0x1f & 0x1f) | 0x40) + 1   // 96
    expect([lo, hi]).toEqual([65, 96])

    // The whole random band lies inside record 3 (`T1, 49-99`), so the draw is UNOBSERVABLE
    // in WFUSCH — every substituted wave gives the same byte. That is why a deep wave needs
    // no RNG to reproduce, and why $C0 is the only correct answer up there.
    const twfusc = lineOf(/^TWFUSC:/)
    expect(line(twfusc + 3)).toBe('\t.BYTE T1,49.,99.,0C0')
    expect(lo).toBeGreaterThanOrEqual(49)
    expect(hi).toBeLessThanOrEqual(99)

    // And now hold OUR code to it.
    for (const level of [99, 100, 150, 999]) {
      expect(wfuschForLevel(level), `wave ${level}`).toBe(0xc0)
    }
  })

  it('TR is "ALTERNATE BETWEEN BYTES 3 & 4" — the word "ramp" appears nowhere', () => {
    expect(line(414)).toMatch(/ALTERNATE BETWEEN BYTES 3 & 4/)
    expect(line(414)).not.toMatch(/ramp/i)
  })

  it('DOTR takes byte 4 on an ODD offset into the range — so wave 17 draws byte 3 = 0', () => {
    // DOTR: JSR RANGER / AND I,1 / IFNE / INY / LDA NY,TEMP3
    // RANGER: ACC = TEMP2 - startWave, and TEMP2 is the 1-based wave (CONTOUR INCs CURWAV).
    // Wave 17 -> offset 0 -> even -> no INY -> byte 3 -> 0. THE FUSEBALL DOES NOT CHASE AT 17.
    const dotr = lineOf(/^DOTR:/)
    const body = alwelg.slice(dotr, dotr + 6).join('\n')
    expect(body).toMatch(/JSR\s+RANGER/)
    expect(body).toMatch(/AND\s+I,1/)
    expect(body).toMatch(/INY/)

    const ranger = lineOf(/^RANGER:/)
    expect(alwelg.slice(ranger, ranger + 8).join('\n')).toMatch(/SBC\s+NY,TEMP3/)
  })
})

describe.skipIf(!sourceAvailable)('tp1-25 — FUCHPL aims, then REVERSES. It is not a bug.', () => {
  it('FUCHPL is JSR JCHPLA followed by JSR JCHROT', () => {
    const fuchpl = lineOf(/^FUCHPL:/)
    expect(line(fuchpl)).toMatch(/JSR\s+JCHPLA/)
    expect(line(fuchpl + 1)).toMatch(/JSR\s+JCHROT/)
    expect(line(fuchpl + 1)).toMatch(/FUSE IS BACKWARDS/)
  })

  it('JCHPLA picks the SHORTEST way and JCHROT flips it — EOR, not a no-op', () => {
    const jchrot = lineOf(/^JCHROT:/)
    expect(alwelg.slice(jchrot, jchrot + 4).join('\n')).toMatch(/EOR\s+I,INVROT/)

    const jchpla = lineOf(/^JCHPLA:/)
    expect(alwelg.slice(jchpla, jchpla + 4).join('\n')).toMatch(/SHORTEST WAY/)
  })
})

describe.skipIf(!sourceAvailable)("tp1-25 — MAYBLR's gate is ODD. The ROM's own comment says EVEN, and it is WRONG.", () => {
  it('chases only when the invader index is ODD — the comment is intent, the code is behaviour', () => {
    // 2157-2160:
    //     TXA            ;YES. ONLY IF INDEX IS EVEN     <- the comment
    //     LSR                                            <- bit 0 -> carry
    //     BCC LEFRIT                                     <- carry CLEAR (index EVEN) -> random
    //     JSR FUCHPL     ;YES. CHASE                     <- reached only when carry SET -> ODD
    //
    // LSR shifts bit 0 into the carry; BCC branches when the carry is CLEAR, i.e. when the
    // index is EVEN — and that branch goes to LEFRIT, the coin. The chase is what falls
    // through, on an ODD index. A label's comment records what the author meant; the code
    // records what the machine does. AC-3 inherited the comment's word. The code wins.
    const mayblr = lineOf(/^MAYBLR:/)
    const body = alwelg.slice(mayblr, mayblr + 20)
    const txa = body.findIndex((l) => /^\s*TXA\b/.test(l))
    expect(txa, 'MAYBLR: no TXA').toBeGreaterThanOrEqual(0)

    expect(body[txa]).toMatch(/ONLY IF INDEX IS EVEN/)   // the claim…
    expect(body[txa + 1]).toMatch(/^\s*LSR\b/)
    expect(body[txa + 2]).toMatch(/^\s*BCC\s+LEFRIT\b/)  // …and its refutation
    expect(body[txa + 3]).toMatch(/JSR\s+FUCHPL/)

    // Spelled out, so a future reader cannot un-see it: the EVEN index is the one that
    // branches AWAY from the chase.
    const evenIndexGoesTo = /BCC\s+(\w+)/.exec(body[txa + 2] ?? '')?.[1]
    expect(evenIndexGoesTo).toBe('LEFRIT')
  })
})

// ── Lang-review guards on the code this story touches ───────────────────────────────
describe('tp1-25 — lang-review: 0 is a REAL WFUSCH value, not a missing one', () => {
  it('rules.ts exports the table lookup — the decision comes from TWFUSC, not a hardcoded wave', () => {
    // Anti-shortcut guard. `if (level >= 18) chase()` reproduces wave 18 and gets every
    // other wave wrong: it never alternates, and it never lights the AT_TOP bit.
    const rules = read('src/core/rules.ts')
    expect(rules).toMatch(/export function wfuschForLevel/)
    expect(rules).toMatch(/export const FUSE_CHASE_ON_TUBE/)
    expect(rules).toMatch(/export const FUSE_CHASE_AT_TOP/)
  })

  it('the fuseball consults WFUSCH — jfuseup no longer rolls the coin unconditionally', () => {
    const interpreter = stripComments(read('src/core/enemies/interpreter.ts'))
    expect(interpreter).toMatch(/wfuschForLevel/)
  })

  it('0 survives the lookup as a VALUE — every early wave really is zero (TS check #4)', () => {
    // THIS TEST REPLACES A FAKE ONE. It used to be a grep:
    //
    //     expect(src).not.toMatch(/wfuschForLevel\([^)]*\)\s*(\|\||\?\?)/)
    //
    // and the Reviewer mutation-proved it was SCENERY. Hoisting the fallback onto its own
    // line reintroduces the exact always-chase bug it claimed to ban —
    //
    //     const wfusch = wfuschForLevel(ctx.level)
    //     const gated  = wfusch || FUSE_CHASE_ON_TUBE     // waves 1-17 now chase
    //
    // — and the regex sailed through, 14/14 green, because the `||` is no longer textually
    // adjacent to the call. A guard that cannot fail is not a guard; it is a decoration that
    // makes the next reader stop looking.
    //
    // So assert the VALUE through the exported function instead of grepping for a shape.
    //
    // ⚠ BE PRECISE ABOUT WHAT THIS DOES AND DOES NOT COVER — the first draft of this comment
    // overclaimed, and the Reviewer mutation-proved THAT too. This test guards ONE thing: a
    // fallback baked INSIDE wfuschForLevel, i.e. that `0` is a real answer (CONTOUR's TE path,
    // 442) and not something the function itself coerces away. It never calls jfuseup, so it
    // CANNOT see a fallback at the CALL SITE — reintroduce the `gated` mutation above and this
    // test stays green.
    //
    // The call site is guarded by BEHAVIOUR, in tp1-25.fuseball-chase.test.ts: the wave-1/16/17
    // "ignores the player" tests go red on exactly that mutation. THOSE ARE THE REAL GUARD.
    // Do not delete them believing this one covers them. It does not.
    for (let level = 1; level <= 17; level++) {
      expect(wfuschForLevel(level), `wave ${level} must be exactly 0 — not "falsy, so default it"`)
        .toBe(0)
    }
    // …and it must be a NUMBER, not undefined/null dressed up as a missing lookup.
    expect(typeof wfuschForLevel(1)).toBe('number')
  })

  it('no `as any` / non-null assertion smuggled into the fuseball path (TS check #1)', () => {
    const src = stripComments(read('src/core/enemies/interpreter.ts'))
    expect(src).not.toMatch(/as any/)
  })
})
