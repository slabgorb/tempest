// tests/core/tp1-6.source-rules.test.ts
//
// RED suite for story tp1-6 — the source-level rules. Three jobs, same shape as
// tp1-25.source-rules.test.ts:
//
//   1. FINGERPRINT THE QUARRY (the 3569-line citable copy, never the sibling).
//   2. PIN THE LINES THIS STORY'S TESTS AND CITATIONS REST ON — including the
//      two decodes a plausible port gets wrong:
//        - MOVNYM's gate is `IFCS` NESTED WITH `IFNE`: the queue freezes only
//          when INMCOU+INCCOU is STRICTLY GREATER than WINVMX (6). Read it as a
//          plain >= and the cap becomes 6 — one invader short of the cabinet.
//        - WINVMX is "MAX # OF INVADERS-1" (ALCOMN.MAC:732). The cap itself is
//          NINVAD = 7; 6 is the compare operand, not the ceiling.
//   3. AC-1 says NYMCOU must be "a real counter, cited to the ROM": scan the
//      production core (comment-INCLUSIVE — citations live in comments) for the
//      ROM names the port must carry.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const sourceDir = process.env.TEMPEST_SOURCE_DIR ?? '/Users/slabgorb/Projects/tempest-source-text'
const sourceAvailable = existsSync(join(sourceDir, 'ALWELG.MAC'))

let alwelg: string[] = []
let alcomn: string[] = []
if (sourceAvailable) {
  alwelg = readFileSync(join(sourceDir, 'ALWELG.MAC'), 'utf8').split('\n')
  alcomn = readFileSync(join(sourceDir, 'ALCOMN.MAC'), 'utf8').split('\n')
}

/** 1-based, the way a citation reads. */
const wl = (n: number): string => alwelg[n - 1] ?? ''
const cm = (n: number): string => alcomn[n - 1] ?? ''

describe.skipIf(!sourceAvailable)('tp1-6 — the quarry is the CITABLE copy', () => {
  it('ALWELG.MAC has 3569 lines and ALCOMN.MAC 1131 — anything else is the wrong checkout', () => {
    expect(alwelg.length - 1).toBe(3569)
    expect(alcomn.length - 1).toBe(1131)
  })
})

describe.skipIf(!sourceAvailable)('tp1-6 — the lines the story rests on resolve where it cites them', () => {
  it('the counters and pool sizes (ALCOMN.MAC)', () => {
    expect(cm(809)).toBe('NINVAD=\t7')
    expect(cm(811)).toBe('NNYMPH=\t64.')
    expect(cm(916)).toContain('NYMCOU:')
    expect(cm(916)).toContain('# OF NYMPHS')
    expect(cm(732)).toContain('WINVMX:')
    expect(cm(732)).toContain('MAX # OF INVADERS-1') // 6 is the operand; the CAP is 7
    expect(cm(788)).toContain('NWNYMC:')
  })

  it('the wave enters as nymphs (INIENE/ININYM) and TINVMX never varies', () => {
    expect(wl(303)).toContain('INIENE:')
    expect(wl(304)).toBe('\tSTA NYMCOU')
    expect(wl(315)).toBe('ININYM:')
    // One T1 record, waves 1-99, value 6. There is no second record to fall to.
    expect(wl(695)).toBe('TINVMX:\t.BYTE T1,1,99.,6')
  })

  it('MOVNYM\'s gate is STRICTLY-GREATER: IFCS nested with IFNE', () => {
    expect(wl(1110)).toBe('\tLDA INMCOU')
    expect(wl(1112)).toBe('\tADC INCCOU') // movers PLUS chasers book the board
    expect(wl(1113)).toBe('\tCMP WINVMX')
    expect(wl(1114)).toContain('IFCS') // carry set: sum >= 6 ...
    expect(wl(1115)).toContain('IFNE') // ... AND sum != 6 -> blocked only ABOVE 6
    expect(wl(1119)).toContain('SUZTIM') // and a running zap freezes the queue too
    expect(wl(1119)).toContain('AVOID KAMIKAZE')
  })

  it('the march, the hatch, and the never-drop restore', () => {
    expect(wl(1131)).toBe('\tSBC I,1') // py -= 1, one per frame
    expect(wl(1134)).toContain('JSR CONYMP')
    expect(wl(1143)).toContain('INC X,NYMPY') // alone-zone back off
    expect(wl(1191)).toContain('DEC NYMCOU')
    expect(wl(1199)).toContain('MOVE NYMPH BACK TO OLD POSITION') // no slot -> restored, not dropped
    expect(wl(1219)).toContain('ACTINV:')
    expect(wl(1262)).toContain('SLOT NOT FOUND FLAG')
  })

  it('the NYMCOU readers this story rekeys: JPULMO, CHASER, JFUSEUP, JJUMPM, JSTRAI', () => {
    expect(wl(1791)).toBe('\tLDY NYMCOU')
    expect(wl(1793)).toContain('SEND PULSAR UP')
    expect(wl(1831)).toContain('LDA NYMCOU')
    expect(wl(1834)).toBe('\tEOR I,INVDIR') // the rim bounce
    expect(wl(2110)).toContain('LDY NYMCOU')
    expect(wl(2113)).toBe('\tCPY I,17.') // 0-based CURWAV: displayed waves 1-17 are "early"
    expect(wl(2115)).toContain('TURN BACK BEFORE TOP')
    expect(wl(2118)).toContain('NONE LEFT. HEAD FOR TOP')
    expect(wl(2133)).toBe('\tCMP I,080') // the $80 bottom of the fuse range
    expect(wl(1931)).toContain('REVERSE UP DOWN DIRECTION') // every fuse landing flips INVDIR
    expect(wl(1932)).toBe('\tLDA NYMCOU') // ...unless the queue is spent: sent up
    expect(wl(2236)).toContain('LDA NYMCOU') // JSTRAI's conversion key — the CODE reads
    // NYMCOU alone; its comment's "OR NON SPIKER TYPE CLIMBERS" is wishful prose.
  })

  it('the fuse kill is exact-rim (JFUSKI), which is what keeps the $20 patrol survivable', () => {
    expect(wl(1994)).toContain('JFUSKI:')
    expect(wl(1994)).toContain('CHECK FOR FUSE KILL CURSOR')
    expect(wl(1995)).toBe('\tCMP CURSY') // equality with the cursor's own line — not a band
  })
})

// ── AC-1: "NYMCOU is a real counter, cited to the ROM" ───────────────────────

describe('tp1-6 — the port carries its ROM citations (comment-inclusive scan)', () => {
  /** Every .ts file under src/core, concatenated. Citations may live anywhere in the core. */
  function coreSource(): string {
    const out: string[] = []
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name)
        if (statSync(p).isDirectory()) walk(p)
        else if (name.endsWith('.ts')) out.push(readFileSync(p, 'utf8'))
      }
    }
    walk(join(repoRoot, 'src', 'core'))
    return out.join('\n')
  }

  it('names the ROM machinery it ports: NYMCOU, MOVNYM, NINVAD, WINVMX, and their homes', () => {
    const src = coreSource()
    for (const name of ['NYMCOU', 'MOVNYM', 'ININYM', 'CONYMP', 'NINVAD', 'WINVMX']) {
      expect(src.includes(name), `src/core must cite ${name} — AC-1 says cited, not just built`).toBe(true)
    }
    // The counter and the cap must point at their defining lines, not just wave at the file.
    expect(src.includes('ALCOMN.MAC:916'), 'NYMCOU\'s definition line').toBe(true)
    expect(src.includes('ALCOMN.MAC:809'), 'NINVAD\'s definition line').toBe(true)
  })
})
