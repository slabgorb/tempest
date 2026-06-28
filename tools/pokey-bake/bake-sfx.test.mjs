// tools/pokey-bake/bake-sfx.test.mjs
//
// Tests for the authentic POKEY SFX bake tool (story 6-6). This lives WITH the
// tool, as `.mjs`, on purpose: the bake is build-time Node tooling (node:fs,
// node:vm, node:child_process), and the game's TS test suite is deliberately
// browser-pure (lib: DOM, no @types/node — see tests/raw-imports.d.ts). Keeping
// these node-flavoured assertions out of tests/ preserves that posture while
// still being picked up by Vitest's default `**/*.test.mjs` discovery.
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync, mkdtempSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { SFX } from './sfx-data.mjs'

// The in-scope subset story 6-6 delivers: the SFX with a confirmed sound->ROM
// address (verified by ear against the real machine). AC#1's full catalogue is
// 13; the remaining 7 are deferred (segment_tick + countdown_beep have data but
// no game trigger -> story 6-10; the rest are not yet extracted). See the TEA
// Delivery Findings in the session for the scope gap on AC#1.
const IN_SCOPE = {
  player_fire: '$cc5d',
  enemy_fire: '$cc45',
  enemy_explosion: '$cc81',
  warp: '$cc75',
  countdown_beep: '$cc69',
  segment_tick: '$cc39',
}

const here = (rel) => fileURLToPath(new URL(rel, import.meta.url))
const bakeScript = here('./bake-sfx.mjs')

describe('pokey-bake sfx-data (AC#1: authentic ALSOUN envelope data)', () => {
  it('encodes every SFX as a pair of 6-byte ALSOUN records (audf + audc)', () => {
    expect(SFX.length).toBeGreaterThan(0)
    for (const spec of SFX) {
      expect(typeof spec.name).toBe('string')
      expect(spec.rom).toMatch(/^\$[0-9a-f]{4}$/i) // CPU address of the ROM record
      for (const seq of [spec.alsoun.audf, spec.alsoun.audc]) {
        expect(Array.isArray(seq)).toBe(true)
        expect(seq).toHaveLength(6) // [value, beats, delta, count, restart, stop]
        for (const b of seq) {
          expect(Number.isInteger(b)).toBe(true)
          expect(b).toBeGreaterThanOrEqual(0)
          expect(b).toBeLessThanOrEqual(0xff)
        }
      }
      expect(spec.alsoun.audf[5]).toBe(0x00) // stop terminator
      expect(spec.alsoun.audc[5]).toBe(0x00)
      expect(typeof spec.gain).toBe('number')
      expect(spec.gain).toBeGreaterThan(0)
      expect(spec.gain).toBeLessThanOrEqual(1)
    }
  })

  it('includes the enemy-fire bolt at its confirmed ROM address $cc45 (AC#3)', () => {
    const ef = SFX.find((s) => s.name === 'enemy_fire')
    expect(ef).toBeDefined()
    expect(ef.rom).toBe('$cc45')
  })

  it('matches the confirmed in-scope sound->ROM map exactly', () => {
    const map = Object.fromEntries(SFX.map((s) => [s.name, s.rom]))
    expect(map).toEqual(IN_SCOPE)
  })
})

describe('pokey-bake render pipeline (AC#2: non-silent WAV bake)', () => {
  it('bakes every in-scope SFX to a non-silent 16-bit WAV with no SILENT warnings', () => {
    const out = mkdtempSync(join(tmpdir(), 'pokey-bake-'))
    try {
      // Drive the real bake end to end through the vendored web-pokey core.
      const stdout = execFileSync('node', [bakeScript, out], {
        encoding: 'utf8',
        timeout: 60000,
      })

      // The merge-sort in expandAlsoun() (bake-sfx.mjs) is what keeps these
      // audible: web-pokey walks the feed monotonically, so unsorted AUDF/AUDC
      // writes land in a lump at the end and the sound renders silent. A SILENT
      // warning here means that invariant (or the register data) is broken.
      expect(stdout).not.toMatch(/SILENT/i)

      for (const [name] of Object.entries(IN_SCOPE)) {
        const wav = join(out, `${name}.wav`)
        expect(existsSync(wav), `${name}.wav was baked`).toBe(true)
        const buf = readFileSync(wav)
        expect(buf.byteLength).toBeGreaterThan(44) // 44-byte header + PCM payload
        expect(buf.toString('ascii', 0, 4)).toBe('RIFF')
        expect(buf.toString('ascii', 8, 12)).toBe('WAVE')

        // Peak across the 16-bit PCM payload must clear the noise floor.
        let peak = 0
        for (let i = 44; i + 1 < buf.byteLength; i += 2) {
          const s = Math.abs(buf.readInt16LE(i))
          if (s > peak) peak = s
        }
        expect(peak, `${name}.wav is audible`).toBeGreaterThan(200) // full scale = 32767
      }
    } finally {
      rmSync(out, { recursive: true, force: true })
    }
  })
})

describe('web-pokey attribution (AC#5: MIT attribution retained)', () => {
  it('keeps the vendored MIT LICENSE crediting the web-pokey author', () => {
    const license = readFileSync(here('./vendor/LICENSE'), 'utf8')
    expect(license).toMatch(/MIT License/i)
    expect(license).toMatch(/Mariusz Kry/i)
  })

  it('credits web-pokey and its license in the README', () => {
    const readme = readFileSync(here('./README.md'), 'utf8')
    expect(readme).toMatch(/web-pokey/i)
    expect(readme).toMatch(/MIT/)
  })
})
