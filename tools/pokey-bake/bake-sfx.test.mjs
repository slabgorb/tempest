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

// Namespace import so the 6-11 catalogue test can read an OPTIONAL `DEFERRED`
// export without a hard ESM link error before it exists (a named `import
// { DEFERRED }` would fail to load the whole module until Dev adds the export).
import * as sfxData from './sfx-data.mjs'
const { SFX } = sfxData

// The 6-6 baseline: the six SFX story 6-6 delivered with a confirmed sound->ROM
// address (verified by ear against the real machine). Story 6-11 expands the
// catalogue past these six (see the remaining-7 block below), so this is now a
// regression floor — every baseline sound must stay present at its address — not
// the full set.
const BASELINE_6_6 = {
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
  it('encodes every SFX as a clean ALSOUN record OR a streaming envelope', () => {
    // 6-6's sounds are single 6-byte records (`spec.alsoun`); 6-11 added
    // multi-note sounds the engine streams from ALSOUN_STREAM (`spec.stream`).
    // Every entry must have exactly one of those shapes, plus a name/rom/gain.
    const stream = sfxData.ALSOUN_STREAM ?? []
    expect(SFX.length).toBeGreaterThan(0)
    for (const spec of SFX) {
      expect(typeof spec.name).toBe('string')
      expect(spec.rom).toMatch(/^\$[0-9a-f]{4}$/i) // CPU address of the ROM record
      expect(typeof spec.gain).toBe('number')
      expect(spec.gain).toBeGreaterThan(0)
      expect(spec.gain).toBeLessThanOrEqual(1)

      const isClean = !!spec.alsoun
      const isStream = !!spec.stream
      expect(isClean !== isStream, `${spec.name} must be exactly one of alsoun/stream`).toBe(true)

      if (isClean) {
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
      } else {
        // streaming: audf/audc start indices into the embedded ALSOUN_STREAM
        for (const v of [spec.stream.audfStart, spec.stream.audcStart]) {
          expect(Number.isInteger(v)).toBe(true)
          expect(v).toBeGreaterThan(0)
          expect(v).toBeLessThanOrEqual(0xff)
        }
        expect(stream.length, 'ALSOUN_STREAM data present for streaming SFX').toBeGreaterThan(0)
      }
    }
  })

  it('includes the enemy-fire bolt at its confirmed ROM address $cc45 (AC#3)', () => {
    const ef = SFX.find((s) => s.name === 'enemy_fire')
    expect(ef).toBeDefined()
    expect(ef.rom).toBe('$cc45')
  })

  it('keeps the 6-6 baseline sounds at their confirmed ROM addresses', () => {
    // 6-11 expands the catalogue past the original six, so the data set is no
    // longer exactly BASELINE_6_6 — but every baseline sound must stay present at
    // its confirmed address (regression floor against an accidental drop/edit).
    const map = Object.fromEntries(SFX.map((s) => [s.name, s.rom]))
    for (const [name, rom] of Object.entries(BASELINE_6_6)) {
      expect(map[name], `${name} baseline preserved`).toBe(rom)
    }
  })
})

describe('pokey-bake render pipeline (AC#2: non-silent WAV bake)', () => {
  it('bakes every SFX to a non-silent 16-bit WAV with no SILENT warnings', () => {
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

      // Every delivered SFX (6-6 baseline + 6-11 additions) must bake audible.
      for (const spec of SFX) {
        const name = spec.name
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

// ── Story 6-11: the remaining 7 catalogued SFX ───────────────────────────────
// 6-6 baked 6 of the 13 catalogued POKEY SFX; 6-10 wired segment_tick. This story
// handles the remaining 7. Of them, only `player_explosion` has an existing game
// trigger (the core's 'player-death' event — see tests/shell/audio.test.ts), so
// it MUST be delivered as a playable bake. The other six may lack a confirmable
// ROM address and/or a game trigger; AC#1 ("any without a confirmable address
// explicitly noted") and AC#3 ("any without a trigger explicitly scoped or
// deferred with a documented reason") require each be EITHER delivered OR noted.
//
// We make that disposition testable (not buried in prose, as 6-10 did for its
// single deferral) by requiring sfx-data.mjs to export, alongside SFX:
//
//   export const DEFERRED = [{ name: 'pulsar_hum', reason: '...' }, ...]
//
// listing every remaining catalogued sound investigated but NOT delivered, each
// with a substantive reason. Names are matched case-insensitively with '-'/'_'
// treated alike, so 'spike-shot' and 'spike_shot' are equivalent.
const CATALOGUED_7 = [
  'spike_shot',
  'player_explosion',
  'pulsar_hum',
  'pulsar_active',
  'zoom_start',
  'extra_life',
  'slam',
]
const norm = (s) => String(s).toLowerCase().replace(/-/g, '_')

describe('pokey-bake remaining-7 catalogue (story 6-11)', () => {
  it('delivers the authentic player_explosion bake — it has a game trigger (AC#1/#3)', () => {
    const pe = SFX.find((s) => norm(s.name) === 'player_explosion')
    expect(
      pe,
      'player_explosion must be a delivered SFX entry (wired to player-death), not deferred',
    ).toBeDefined()
    expect(pe.rom).toMatch(/^\$[0-9a-f]{4}$/i) // confirmed CPU address of the ROM record
  })

  it('accounts for all 7 remaining catalogued SFX — delivered or explicitly deferred (AC#1/#3)', () => {
    const delivered = new Set(SFX.map((s) => norm(s.name)))
    const deferred = new Map((sfxData.DEFERRED ?? []).map((d) => [norm(d.name), d.reason]))
    for (const name of CATALOGUED_7) {
      const isDelivered = delivered.has(name)
      const isDeferred = deferred.has(name)
      expect(
        isDelivered || isDeferred,
        `${name} must be delivered in SFX or explicitly deferred in DEFERRED with a reason`,
      ).toBe(true)
      if (!isDelivered) {
        const reason = deferred.get(name)
        expect(typeof reason, `${name} deferral needs a documented reason string`).toBe('string')
        expect(
          reason.trim().length,
          `${name} deferral reason must be substantive`,
        ).toBeGreaterThan(10)
      }
    }
  })
})
