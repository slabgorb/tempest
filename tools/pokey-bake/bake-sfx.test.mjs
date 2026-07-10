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

// The streaming-engine parity test (story 6-11) drives the bake engine's
// expandAlsoun / streamVoice / expandStream directly. NAMESPACE import (not a
// named `import { expandStream }`) on purpose: until Dev's green phase exports
// those functions, a named import would fail to LINK and take down the whole
// file — a namespace import just leaves `bake.expandStream` === undefined, so
// only the parity test fails (its intended RED). NOTE: importing bake-sfx.mjs
// today also runs its top-level bake as a side effect (writes to the gitignored
// out/ dir); Dev's green phase adds the isMain guard that makes import inert.
import * as bake from './bake-sfx.mjs'

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
          // A start index must point at a REAL note INSIDE ALSOUN_STREAM, not past
          // its end: streamByte() silently returns 0x00 out of bounds, so a typo'd
          // index degrades the whole sound to SILENCE with no error. Derived from
          // streamVoice (bake-sfx.mjs): the engine pre-advances Lc0 by 2, then reads
          // the first 4-byte note record [value,beats,delta,count] at array indices
          // value @ 2*v-2, beats @ 2*v-1, delta @ 2*v, count @ 2*v+1. All four of
          // those reads must be in bounds or the sound starts on a phantom 0x00 note.
          const firstReadIdx = 2 * v - 2
          const lastReadIdx = 2 * v + 1
          expect(firstReadIdx, `${spec.name} start ${v}: first-note value byte index >= 0`).toBeGreaterThanOrEqual(0)
          expect(lastReadIdx, `${spec.name} start ${v}: first-note record stays within ALSOUN_STREAM`).toBeLessThan(stream.length)
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
  // CPU-bound end-to-end bake: ~10s on GitHub Actions runners, so it needs more
  // than Vitest's default 5s per-test timeout (scoped here, not globally).
  it('bakes every SFX to a non-silent 16-bit WAV with no SILENT warnings', { timeout: 30_000 }, () => {
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

        // Independently measure the peak |sample| in the 16-bit PCM payload.
        let measured = 0
        for (let i = 44; i + 1 < buf.byteLength; i += 2) {
          const s = Math.abs(buf.readInt16LE(i))
          if (s > measured) measured = s
        }

        // AC#3 (story 6-12): the old `measured > 200` floor (≈0.006 of full scale,
        // ≈ -44 dBFS) was analytically weak — it sat ~12x BELOW the quietest real
        // bake (segment_tick peaks at ~0.074). Replace it by asserting the bake
        // script's OWN reported peak: parse the `peak=<float 0..1>` it prints per
        // sound, (a) cross-check it against the PCM we measured so the audibility
        // bar is tied to the renderer's own measurement rather than a magic number,
        // then (b) require that reported peak to clear a justified audibility floor.
        const m = stdout.match(
          new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.wav.*?peak=([0-9.]+)`),
        )
        expect(m, `${name}: bake printed a peak= value in stdout`).not.toBeNull()
        const reported = Number(m[1])

        // (a) Same signal: measured ≈ reported * 32767. stdout rounds the float to
        // 3 decimals and writeWav truncates, so allow ≤ 0.001 of full scale of
        // slack (twice the 0.0005 rounding bound) — clearly non-flaky.
        expect(
          Math.abs(measured - reported * 32767),
          `${name}: measured PCM peak (${measured}) matches the bake's reported peak (${reported})`,
        ).toBeLessThanOrEqual(0.001 * 32767)

        // (b) Justified floor: 0.02 of full scale (≈ -34 dBFS) sits well above the
        // renderer's 1e-4 SILENT cutoff and the -80 dBFS noise floor, yet safely
        // below the quietest real bake (segment_tick ≈ 0.074 ≈ -22.6 dBFS) — a
        // meaningful "audibly synthesised, not near-silent" bar, unlike the old 200.
        expect(reported, `${name}.wav clears the audibility floor (reported peak)`).toBeGreaterThan(0.02)
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
    // Pin the exact confirmed CPU address. The old /^\$[0-9a-f]{4}$/ regex was
    // vacuous — any 4 hex digits passed, so a corrupted/edited address would slip
    // through. $cbf5 is the `pieces_death` -> sound_Lccb0 record (see sfx-data.mjs).
    expect(pe.rom).toBe('$cbf5')
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

// ── Story 6-11: streaming engine parity (Reviewer test-hardening) ─────────────
// The streaming engine (expandStream / streamVoice in bake-sfx.mjs, ~60 lines of
// `update_sounds` NMI emulation) had NO direct unit test — only the coarse
// `peak>200` bake check above. The Dev's claim that it is "validated bit-for-bit
// against the 6-6 sounds" was UNAUTOMATED: a wrong-but-audible regression (a
// broken odd-nibble mask, or an off-by-one in the restart/advance index logic)
// would still bake audible and slip through. These tests pin the claim.
//
// `enemy_fire` is the lever: it is a clean 6-byte ALSOUN record AND it sits
// VERBATIM inside ALSOUN_STREAM (audf @ indices 116..121, audc @ 122..127). So
// the same sound can be driven through BOTH engines and the two register-event
// lists compared:
//   clean path:     expandAlsoun({ audf, audc })           (6-byte record walker)
//   streaming path: expandStream({ audfStart, audcStart }) (NMI stream engine)
//
// START VALUES: the engine advances its index by 2 BEFORE reading the first note,
// so a note whose value byte sits at array index `off` is reached from start
// value S where 2*S - 2 === off. enemy_fire audf value byte @116 → S=0x3b;
// audc value byte @122 → S=0x3e.
//
// THE ONE DIFFERENCE (discovered empirically by running both, NOT assumed):
// streamVoice appends exactly ONE trailing terminator event [reg, 0x00, t] per
// voice — it reads the clean record's [restart,stop]=[0x00,0x00] tail as a
// beats==0 note, which ENDS the stream after pushing a final value-0 write.
// expandSeq emits exactly `count` events with no terminator. So:
//     stream events === clean events + one trailing [reg, 0x00, t].
// The tests strip that terminator and assert the rest is identical. enemy_fire's
// AUDC high nibble is 0, so the odd-nibble mask is a NO-OP here — which is *why*
// the two engines stay equivalent for it; the mask path gets its own test below.
const ENEMY_FIRE_EMBED = {
  audf: { off: 116, rec: [0x00, 0x03, 0x02, 0x09, 0x00, 0x00], start: 0x3b },
  audc: { off: 122, rec: [0x08, 0x03, 0xff, 0x09, 0x00, 0x00], start: 0x3e },
}

// Split a POKEY feed ([reg,val,t, reg,val,t, ...], here prefixed by an [8,0,0]
// AUDCTL header) into the per-register [reg,val,t] event list for `reg`.
const feedEvents = (p1, reg) => {
  const ev = []
  for (let i = 0; i + 2 < p1.length; i += 3) if (p1[i] === reg) ev.push([p1[i], p1[i + 1], p1[i + 2]])
  return ev
}

// Assert+strip the single trailing terminator [reg, 0x00, t] streamVoice appends.
const stripTerminator = (ev, reg) => {
  const last = ev[ev.length - 1]
  expect(last, 'streamVoice should append a trailing terminator event').toBeDefined()
  expect(last[0], 'terminator is on the voice register').toBe(reg)
  expect(last[1], 'terminator value is 0x00').toBe(0x00)
  return ev.slice(0, -1)
}

describe('pokey-bake streaming engine parity (story 6-11, Reviewer hardening)', () => {
  it('exports the engine functions so they can be unit-tested directly', () => {
    // RED until Dev's green phase exports them (and adds the isMain guard so the
    // import above stops running a full bake). Today bake.* === undefined.
    expect(typeof bake.expandAlsoun, 'expandAlsoun must be exported').toBe('function')
    expect(typeof bake.streamVoice, 'streamVoice must be exported').toBe('function')
    expect(typeof bake.expandStream, 'expandStream must be exported').toBe('function')
  })

  it('embeds enemy_fire verbatim in ALSOUN_STREAM, consistent with its start indices', () => {
    const s = sfxData.ALSOUN_STREAM
    expect(s.slice(ENEMY_FIRE_EMBED.audf.off, ENEMY_FIRE_EMBED.audf.off + 6)).toEqual(ENEMY_FIRE_EMBED.audf.rec)
    expect(s.slice(ENEMY_FIRE_EMBED.audc.off, ENEMY_FIRE_EMBED.audc.off + 6)).toEqual(ENEMY_FIRE_EMBED.audc.rec)
    // start value S satisfies 2*S - 2 === value-byte offset (engine pre-advances by 2)
    expect(2 * ENEMY_FIRE_EMBED.audf.start - 2).toBe(ENEMY_FIRE_EMBED.audf.off)
    expect(2 * ENEMY_FIRE_EMBED.audc.start - 2).toBe(ENEMY_FIRE_EMBED.audc.off)
  })

  it('streamVoice reproduces the clean expandSeq events per voice (modulo one terminator)', () => {
    expect(typeof bake.streamVoice, 'streamVoice must be exported (RED until Dev exports it)').toBe('function')
    expect(typeof bake.expandAlsoun, 'expandAlsoun must be exported (RED until Dev exports it)').toBe('function')

    const ef = SFX.find((s) => s.name === 'enemy_fire')
    const clean = bake.expandAlsoun(ef.alsoun)
    const cleanAudf = feedEvents(clean.pokey1, 0)
    const cleanAudc = feedEvents(clean.pokey1, 1)
    expect(cleanAudf, 'clean AUDF event count == audf record count').toHaveLength(9)
    expect(cleanAudc, 'clean AUDC event count == audc record count').toHaveLength(9)

    const streamAudf = bake.streamVoice(ENEMY_FIRE_EMBED.audf.start, 0, false).ev
    const streamAudc = bake.streamVoice(ENEMY_FIRE_EMBED.audc.start, 1, true).ev
    // exactly ONE extra event (the terminator) over the clean path...
    expect(streamAudf).toHaveLength(cleanAudf.length + 1)
    expect(streamAudc).toHaveLength(cleanAudc.length + 1)
    // ...and after stripping that terminator the two engines agree bit-for-bit.
    expect(stripTerminator(streamAudf, 0)).toEqual(cleanAudf)
    expect(stripTerminator(streamAudc, 1)).toEqual(cleanAudc)
  })

  it('expandStream matches expandAlsoun end-to-end for the embedded enemy_fire record', () => {
    expect(typeof bake.expandStream, 'expandStream must be exported (RED until Dev exports it)').toBe('function')
    expect(typeof bake.expandAlsoun, 'expandAlsoun must be exported (RED until Dev exports it)').toBe('function')

    const ef = SFX.find((s) => s.name === 'enemy_fire')
    const clean = bake.expandAlsoun(ef.alsoun)
    const stream = bake.expandStream({
      audfStart: ENEMY_FIRE_EMBED.audf.start,
      audcStart: ENEMY_FIRE_EMBED.audc.start,
    })
    // The merged streaming feed is the clean feed plus the two trailing terminators
    // (one per voice, both at the final timestamp, sorted to the end). Everything
    // before them must be identical, and the baked durations must match.
    expect(stream.pokey1.slice(0, clean.pokey1.length)).toEqual(clean.pokey1)
    const tail = stream.pokey1.slice(clean.pokey1.length)
    expect(tail, 'exactly two trailing terminator triples (AUDF + AUDC)').toHaveLength(6)
    expect([tail[0], tail[1]]).toEqual([0, 0x00]) // AUDF terminator: reg, value
    expect([tail[3], tail[4]]).toEqual([1, 0x00]) // AUDC terminator: reg, value
    expect(tail[2], 'both terminators share the final timestamp').toBe(tail[5])
    expect(stream.durationMs).toBe(clean.durationMs)
  })

  it('odd-nibble mask holds AUDC distortion (high nibble) fixed while ramping volume (low nibble)', () => {
    expect(typeof bake.streamVoice, 'streamVoice must be exported (RED until Dev exports it)').toBe('function')
    // enemy_fire cannot prove the mask (its AUDC value high nibble is 0). Point an
    // odd (AUDC-masked) voice at a stream note whose VALUE has a non-zero high
    // nibble AND a non-zero delta, so the mask path actually runs. The 4-byte note
    // [0x40,0x01,0xff,0x40] sits at indices 68..71 → start = (68+2)/2 = 0x23.
    const start = 0x23
    expect(sfxData.ALSOUN_STREAM.slice(68, 72)).toEqual([0x40, 0x01, 0xff, 0x40])
    const masked = bake.streamVoice(start, 1, true).ev // odd → mask ON
    const plain = bake.streamVoice(start, 0, false).ev // even → no mask
    const HI = 0x40 & 0xf0 // the note value's distortion (high) nibble
    // The note ramps count(0x40)=64 times at beats=1 before advancing; sample a
    // window safely inside that first note.
    const RUN = 0x20
    const maskedRun = masked.slice(0, RUN)
    expect(maskedRun).toHaveLength(RUN)
    // distortion (high nibble) pinned across the whole ramp...
    for (const [, v] of maskedRun) expect(v & 0xf0).toBe(HI)
    // ...while volume (low nibble) genuinely varies.
    expect(new Set(maskedRun.map(([, v]) => v & 0x0f)).size, 'volume nibble actually ramps').toBeGreaterThan(1)
    // The SAME bytes WITHOUT the mask must NOT pin the high nibble — proving the
    // mask is doing real work, not coincidentally agreeing.
    expect(plain.slice(0, RUN).some(([, v]) => (v & 0xf0) !== HI), 'unmasked voice changes the high nibble').toBe(true)
  })
})

// ── Story 6-12 (AC#1): expandAlsoun merge-sort timestamp invariant ────────────
// expandAlsoun merges the AUDF1 and AUDC1 event streams into ONE chronological
// POKEY feed (`merged = [...a.ev, ...b.ev].sort(by time)`). web-pokey walks that
// feed monotonically, so if the sort were dropped the second voice's earlier-timed
// writes would land in a lump at the very end → a silent or wrong sound.
//
// Today that invariant is guarded only INDIRECTLY by the integration bake test
// above (a missing sort surfaces as a SILENT warning). The 6-6 review flagged the
// gap: that guard would still pass for a future single-event (count=1) record whose
// two voices each emit one already-ordered event — the un-sorted concat would
// happen to stay monotonic, so a removed sort would go unnoticed. These tests pin
// the invariant on the merged feed DIRECTLY, and prove the guard is non-vacuous:
// for real multi-event data the un-sorted concatenation is provably non-monotonic.
const HEADER_TRIPLES = 1 // pokey1 begins with the [8, 0x00, 0.0] AUDCTL header

// Drop the header and split a pokey1 feed ([reg,val,t, ...]) into [reg, time] pairs.
const feedTimeline = (pokey1) => {
  const out = []
  for (let i = HEADER_TRIPLES * 3; i + 2 < pokey1.length; i += 3) out.push([pokey1[i], pokey1[i + 2]])
  return out
}
const isNonDecreasing = (ts) => ts.every((t, i) => i === 0 || t >= ts[i - 1])

describe('expandAlsoun merge-sort timestamp invariant (story 6-12, AC#1)', () => {
  const alsounSfx = SFX.filter((s) => s.alsoun)

  it('exports expandAlsoun so the invariant can be unit-tested directly', () => {
    expect(typeof bake.expandAlsoun, 'expandAlsoun must be exported').toBe('function')
  })

  it('emits a non-decreasing timestamp stream for every authentic ALSOUN record', () => {
    expect(alsounSfx.length, 'at least one spec.alsoun SFX to exercise').toBeGreaterThan(0)
    for (const spec of alsounSfx) {
      const times = feedTimeline(bake.expandAlsoun(spec.alsoun).pokey1).map(([, t]) => t)
      expect(isNonDecreasing(times), `${spec.name}: merged pokey1 timestamps non-decreasing`).toBe(true)
    }
  })

  it('is a NON-VACUOUS guard: the un-sorted concat is non-monotonic for multi-event data', () => {
    // enemy_fire ramps BOTH voices 9 steps across the same ~[0, 0.096s] window, so
    // the naive [...audf, ...audc] order drops from the last AUDF time back to the
    // first AUDC time — exactly the lump-at-the-end the sort prevents. (This is the
    // count>1 case the 6-6 review said the SILENT check alone would NOT catch.)
    const ef = SFX.find((s) => s.name === 'enemy_fire')
    expect(ef, 'enemy_fire present as the multi-event lever').toBeDefined()
    const timeline = feedTimeline(bake.expandAlsoun(ef.alsoun).pokey1)
    const audfTimes = timeline.filter(([reg]) => reg === 0).map(([, t]) => t)
    const audcTimes = timeline.filter(([reg]) => reg === 1).map(([, t]) => t)

    // Both voices are genuinely multi-event (NOT the count=1 degenerate).
    expect(audfTimes.length, 'AUDF voice emits multiple events').toBeGreaterThan(1)
    expect(audcTimes.length, 'AUDC voice emits multiple events').toBeGreaterThan(1)
    // Each voice is internally ordered...
    expect(isNonDecreasing(audfTimes), 'AUDF voice internally ordered').toBe(true)
    expect(isNonDecreasing(audcTimes), 'AUDC voice internally ordered').toBe(true)
    // ...but voice-A-then-voice-B (the pre-sort concat order) is NOT — so dropping
    // the .sort() in expandAlsoun WOULD break the non-decreasing invariant above.
    expect(isNonDecreasing([...audfTimes, ...audcTimes]), 'un-sorted concat is non-monotonic').toBe(false)
    // ...while the actual merged stream IS sorted. The two together prove the sort
    // did real reordering work, not a coincidentally already-ordered input.
    expect(isNonDecreasing(timeline.map(([, t]) => t)), 'merged stream is sorted').toBe(true)
  })
})
