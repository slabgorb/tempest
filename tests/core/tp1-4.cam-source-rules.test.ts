// tests/core/tp1-4.cam-source-rules.test.ts
//
// RED suite for story tp1-4 — the source-level rules. Two jobs:
//
//   1. AC-5: the five per-kind steppers are DELETED, not left dead beside the
//      interpreter. A rewrite that leaves the old machine standing is not a
//      rewrite — it is a second machine, and the next reader cannot tell which
//      one is live.
//   2. The lang-review checklist (.pennyfarthing/gates/lang-review/typescript.md)
//      applied to what this story actually adds: a table of ROM constants and a
//      switch over an opcode.
//
// Core purity (AC-1's "no Date, no Math.random") is NOT re-tested here — it is
// already enforced across all of src/core, recursively, by
// tests/rom-clock-sources.test.ts:166. cam.ts inherits that guard for free.
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CAM, CAMWAV, TNEWCAM, CAM_OPS } from '../../src/core/enemies/cam'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (rel: string): string => readFileSync(join(repoRoot, rel), 'utf8')

function tsFilesUnder(rel: string): string[] {
  const out: string[] = []
  const walk = (dir: string): void => {
    const abs = join(repoRoot, dir)
    if (!existsSync(abs)) return
    for (const entry of readdirSync(abs)) {
      const next = `${dir}/${entry}`
      if (statSync(join(repoRoot, next)).isDirectory()) walk(next)
      else if (entry.endsWith('.ts')) out.push(next)
    }
  }
  walk(rel)
  return out
}

/** Strip comments so prose about `Math.random` or `stepFlipper` cannot trip a grep. */
function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

describe('tp1-4 AC-5 — the old per-kind steppers are gone', () => {
  const STEPPERS = [
    ['flipper.ts', 'stepFlipper'],
    ['tanker.ts', 'stepTanker'],
    ['spiker.ts', 'stepSpiker'],
    ['fuseball.ts', 'stepFuseball'],
    ['pulsar.ts', 'stepPulsar'],
  ] as const

  // Every kind has a CAM program to be replaced BY — TNEWCAM (ALWELG.MAC:1481)
  // maps all five appearance codes: flipper→WFLICAM, pulsar→PULSCH,
  // tanker→NOJUMP, spiker("TRALER")→TRALUP, fuseball→FUSEUP. So there is no
  // enemy this story is entitled to leave behind.
  it.each(STEPPERS)('src/core/enemies/%s is deleted', (file) => {
    expect(
      existsSync(join(repoRoot, 'src/core/enemies', file)),
      `src/core/enemies/${file} must be deleted — the CAM replaces it`,
    ).toBe(false)
  })

  it('no stepXxx symbol survives anywhere in src/', () => {
    const survivors: string[] = []
    for (const file of tsFilesUnder('src')) {
      const code = stripComments(read(file))
      for (const [, symbol] of STEPPERS) {
        if (new RegExp(`\\b${symbol}\\b`).test(code)) survivors.push(`${file}: ${symbol}`)
      }
    }
    expect(survivors, `dead steppers still referenced:\n${survivors.join('\n')}`).toEqual([])
  })

  it('sim.ts no longer switches on the enemy kind to move it', () => {
    // W-005's `ours` citation is sim.ts's `switch (e.kind) {` — the five-armed
    // dispatch that IS the finding. Under the CAM, an enemy's behaviour comes
    // from its program counter, not from its kind: one loop, one interpreter.
    // (Rendering and scoring may still branch on kind — this rule is about the
    // MOVE dispatch, so it is scoped to the enemy-stepping function.)
    const sim = stripComments(read('src/core/sim.ts'))
    const stepEnemies = sim.slice(sim.indexOf('function stepEnemies'))
    const body = stepEnemies.slice(0, stepEnemies.indexOf('\nfunction ') + 1 || undefined)
    expect(
      /switch\s*\(\s*e\.kind\s*\)/.test(body),
      'stepEnemies must not dispatch movement on e.kind — the CAM does that now',
    ).toBe(false)
  })
})

describe('tp1-4 — lang-review rules on the new code', () => {
  const NEW_FILES = ['src/core/enemies/cam.ts']

  it('has no type-safety escapes (checklist §1)', () => {
    const offenders: string[] = []
    for (const file of NEW_FILES) {
      const code = stripComments(read(file))
      if (/\bas\s+any\b/.test(code)) offenders.push(`${file}: as any`)
      if (/as\s+unknown\s+as\b/.test(code)) offenders.push(`${file}: as unknown as`)
      if (/@ts-ignore/.test(code)) offenders.push(`${file}: @ts-ignore`)
    }
    expect(offenders, offenders.join('\n')).toEqual([])
  })

  it('gives every opcode an explicit value (checklist §3: no implicit numbering)', () => {
    // A numeric enum without explicit values is fragile to reordering — and
    // these values are not ours to choose. They are TABJSR's byte offsets.
    const code = read('src/core/enemies/cam.ts')
    const ops: ReadonlyArray<[string, number]> = Object.entries(CAM_OPS)
    for (const [name, value] of ops) {
      const hex = `0x${value.toString(16).padStart(2, '0')}`
      const dec = String(value)
      const line = code.split('\n').find((l) => new RegExp(`\\b${name}\\b`).test(l))
      expect(line, `${name} must be defined somewhere in cam.ts`).toBeDefined()
      expect(
        new RegExp(`(${hex}|\\b${dec}\\b)`, 'i').test(line ?? ''),
        `${name} must be written with its explicit ROM value (${hex})`,
      ).toBe(true)
    }
  })

  it('freezes the ROM tables — module-level state a game could scribble on is not pure', () => {
    // These arrays are module-level and shared by every game in the process.
    // `readonly` is erased at runtime; only a freeze actually stops a stray
    // write from corrupting the CAM for every subsequent game. AC-6's
    // determinism claim is only as strong as this.
    expect(Object.isFrozen(CAM), 'CAM must be frozen').toBe(true)
    expect(Object.isFrozen(CAMWAV), 'CAMWAV must be frozen').toBe(true)
    expect(Object.isFrozen(TNEWCAM), 'TNEWCAM must be frozen').toBe(true)
  })

  it('the CAM is a byte array — every entry fits in a ROM byte', () => {
    // The CAM is 6502 memory. An offset that does not fit in a byte means the
    // transcription has grown something the ROM could not have held, and every
    // `.BYTE X-CAM` operand in the source would have truncated.
    expect(CAM.length).toBeGreaterThan(0)
    for (const [i, b] of CAM.entries()) {
      expect(Number.isInteger(b) && b >= 0 && b <= 0xff, `CAM[${i}] = ${b} is not a byte`).toBe(true)
    }
  })

  it('the CAM ITSELF fits in a byte-addressed space — the trap the rule above cannot see', () => {
    // The assembler stores an address operand as `(target - 1) & 0xff` (cam.ts), and
    // the interpreter's PC wraps to a byte to match. That is the ROM's own encoding —
    // but it means that the day the CAM grows past 256 bytes, a jump target SILENTLY
    // TRUNCATES and the program lands somewhere else entirely.
    //
    // The byte-range rule above looks like it guards this. It cannot: the `& 0xff`
    // GUARANTEES every value it inspects is already in range, so it can never fail
    // for this reason. It is a vacuous guard against precisely this failure, and only
    // this assertion closes it.
    //
    // This matters NOW: story tp1-5 adds the chaser and grows this table. The CAM is
    // ~110 bytes today, so there is plenty of room — but the failure is silent, and a
    // silent failure with room to spare is a trap, not a safety margin.
    expect(CAM.length, 'a CAM longer than 256 bytes cannot be addressed by a one-byte PC')
      .toBeLessThanOrEqual(0x100)
  })

  it('every switch over the enemy kind is exhaustive (checklist §3)', () => {
    // `speedFor` in interpreter.ts switches on e.kind with no default arm. Today it
    // covers all five kinds, so it compiles and runs. Add a SIXTH EnemyKind — a
    // chaser, say, which is exactly what tp1-5 is about — and TypeScript will not
    // complain (noImplicitReturns is off): speedFor returns undefined, every speed
    // becomes NaN, and every invader's depth silently becomes NaN with it.
    //
    // The interpreter's other switches already do this right (runCam and camParam
    // both `default: throw`, and makeEnemy throws after its switch). This is the one
    // that does not.
    const code = stripComments(read('src/core/enemies/interpreter.ts'))
    const offenders: string[] = []
    const re = /switch\s*\(\s*e\.kind\s*\)\s*\{/g
    for (let m = re.exec(code); m !== null; m = re.exec(code)) {
      // Walk to the matching brace, then look for a default arm inside it.
      let depth = 0
      let end = m.index + m[0].length - 1
      for (let i = end; i < code.length; i++) {
        if (code[i] === '{') depth += 1
        else if (code[i] === '}') { depth -= 1; if (depth === 0) { end = i; break } }
      }
      const body = code.slice(m.index, end)
      if (!/\bdefault\s*:/.test(body)) offenders.push(`switch at index ${m.index}`)
    }
    expect(
      offenders,
      `a switch on e.kind with no default arm will return undefined for a new EnemyKind:\n${offenders.join('\n')}`,
    ).toEqual([])
  })
})
