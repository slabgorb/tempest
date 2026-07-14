// tests/shell/audio.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createAudioEngine } from '../../src/shell/audio'
// NOTE (story 6-12, AC#2): the event->sound WIRING checks that used to live here
// were brittle `?raw` regex text-matches against src/main.ts (the only way to
// inspect main.ts, which boots a canvas and can't be imported in node). Story 6-12
// extracted that dispatch loop into the importable src/shell/audio-dispatch.ts, so
// the wiring is now asserted BEHAVIOURALLY in audio-dispatch.test.ts. This file
// keeps only the sample-loading assertions, which remain main.ts-independent.

// Story 6-6: the ★ authentic POKEY bakes from the arcade ROM are baked by
// tools/pokey-bake/ and hosted on R2 alongside the original community-rip
// samples; every sample resolves against the R2 base.
const R2 = 'https://arcade-assets.slabgorb.com/tempest/sfx/'

// The engine builds an AudioContext lazily in resume(), reading the constructor
// off globalThis. Node's test env has no Web Audio, so we stub a minimal fake.
// state='running' keeps resume() from awaiting ctx.resume(); the fetch CALL in
// load() is synchronous, so the requested URLs are captured by the time resume()
// returns (the decode chain that follows is async).
class FakeAudioContext {
  state = 'running'
  destination = {}
  createGain() {
    return { gain: { value: 0 }, connect() {} }
  }
  decodeAudioData() {
    return Promise.resolve({})
  }
  resume() {
    return Promise.resolve()
  }
  // Story 10-10: play() now creates sources through here. Hand out a recording
  // source so a test can observe whether the channel's prior voice was stolen.
  createBufferSource(): RecSource {
    return recSource()
  }
}

let fetched: string[]

// --- Story 10-10 (voice-stealing) test scaffolding -------------------------
// play() is the unit under test for 10-10: it must assign each sound to a
// logical channel and STOP the prior source on that channel before starting a
// new one (POKEY-style cut-in), instead of layering a fresh BufferSource on
// every call. To observe that, createBufferSource() above hands out recording
// sources that remember whether start()/stop() ran, collected in module-level
// `sources` (reset each test, exactly like `fetched`).
interface RecSource {
  buffer: unknown
  started: boolean
  stopped: boolean
  disconnected: boolean
  connect(dest: unknown): void
  start(): void
  stop(): void
  disconnect(): void
}

let sources: RecSource[]

// Build a recording BufferSource and register it in `sources`. `overrides` lets
// a test inject a throwing start()/stop() to exercise silent degradation (AC#3).
function recSource(overrides: Partial<Pick<RecSource, 'start' | 'stop'>> = {}): RecSource {
  const src: RecSource = {
    buffer: null,
    started: false,
    stopped: false,
    disconnected: false,
    connect() {},
    start() {
      src.started = true
    },
    stop() {
      src.stopped = true
    },
    disconnect() {
      src.disconnected = true
    },
    ...overrides,
  }
  sources.push(src)
  return src
}

beforeEach(() => {
  fetched = []
  sources = []
  vi.stubGlobal('fetch', (input: string) => {
    fetched.push(input)
    return Promise.resolve({
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    })
  })
  vi.stubGlobal('AudioContext', FakeAudioContext)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('audio engine sample loading (story 6-6: authentic bakes on R2)', () => {
  it('loads the authentic ROM bakes from the R2 base', () => {
    createAudioEngine().resume()
    // The ROM addresses behind two of these moved in tp1-2 (the cross-wiring), but
    // the filenames did not — the cues were named right and filled wrong. Which ROM
    // record each name now carries is pinned in tests/audit/alsoun-cue-mapping.test.ts.
    expect(fetched).toContain(R2 + 'player_fire.wav') // ★ ROM $cbe9 (LA)
    expect(fetched).toContain(R2 + 'enemy_explosion.wav') // ★ ROM $cc5d (EX)
    expect(fetched).toContain(R2 + 'warp.wav') // ★ ROM $cc75 (T2)
    expect(fetched).toContain(R2 + 'thrust_space.wav') // ★ ROM $cc81 (T3) — tp1-13
  })

  it('loads the community-rip samples from the R2 base', () => {
    createAudioEngine().resume()
    expect(fetched).toContain(R2 + 'clawcatch.wav')
    expect(fetched).toContain(R2 + 'warpin.wav')
  })

  // tp1-13 (S-011): kzap.wav was an invention — ALSOUN's 13-sound table has no
  // superzapper slot. The manifest must no longer name it, so the engine must
  // no longer fetch it.
  it('does not fetch the invented kzap.wav (tp1-13, S-011)', () => {
    createAudioEngine().resume()
    expect(fetched.some((u) => u.includes('kzap')), 'kzap.wav is deleted').toBe(false)
  })

  it('resolves every sample against a custom base URL', () => {
    createAudioEngine('https://cdn.test/x/').resume()
    expect(fetched).toContain('https://cdn.test/x/player_fire.wav') // ★ authentic
    expect(fetched).toContain('https://cdn.test/x/clawcatch.wav') // community rip
  })

  // AC#3: the enemy-fire bolt plays the AUTHENTIC bake (enemy_fire.wav, ROM $cc45,
  // hosted on R2), not the old community 'enemyfire.wav' placeholder.
  it('plays the authentic enemy-fire bake, not the old placeholder (AC#3)', () => {
    createAudioEngine().resume()
    expect(fetched).toContain(R2 + 'enemy_fire.wav')
    expect(fetched).not.toContain(R2 + 'enemyfire.wav')
  })

  it('decodes loaded samples into a ready engine', async () => {
    const engine = createAudioEngine()
    expect(engine.ready()).toBe(false)
    engine.resume()
    // flush the fetch -> arrayBuffer -> decodeAudioData microtask chain
    await vi.waitFor(() => expect(engine.ready()).toBe(true))
  })

  it('stays silent on a failed fetch without blocking the other samples', async () => {
    // one bad sample must neither throw nor stop the rest from decoding — the
    // engine degrades silently, leaving just that one sound unloaded.
    vi.stubGlobal('fetch', (input: string) => {
      fetched.push(input)
      if (input.endsWith('enemy_fire.wav')) return Promise.reject(new Error('network'))
      return Promise.resolve({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) })
    })
    const engine = createAudioEngine()
    engine.resume()
    await vi.waitFor(() => expect(engine.ready()).toBe(true)) // the others still load
  })
})

// The enemy-fire event->sound wiring (story 6-5/6-6) is now asserted behaviourally
// in audio-dispatch.test.ts ("plays 'enemyFire' on an 'enemy-fire' event"), against
// the extracted dispatcher — replacing the brittle `?raw` regex that used to live
// here (story 6-12, AC#2).

// Story 6-10: the authentic segment_tick bake (ROM $cc39 — the cursor/claw
// line-cross tick) was baked + hosted on R2 by 6-6 but had no game trigger. This
// story registers it in the manifest and wires it to the new 'segment-cross'
// core event (emitted when the Claw rotates into a new lane). It reuses the 6-6
// asset — no new invented audio.
//
// NOTE (countdown_beep, ROM $cc69): DEFERRED. Its only authentic trigger is the
// arcade's level-select timeout, and this clone's select mode has no countdown
// timer (SelectState is just { selectedLevel }). Rather than invent a timer, the
// countdown_beep half is scoped out — see the session's Design Deviations. No
// countdownBeep manifest entry or wiring is added here, so no test asserts it.
describe('segment-tick cue wiring (story 6-10)', () => {
  it('loads the authentic segment_tick bake from the R2 base', () => {
    createAudioEngine().resume()
    expect(fetched).toContain(R2 + 'segment_tick.wav') // ★ ROM $cc39
  })

  it('resolves the segment_tick bake against a custom base URL too', () => {
    createAudioEngine('https://cdn.test/x/').resume()
    expect(fetched).toContain('https://cdn.test/x/segment_tick.wav')
  })

  // The segment-cross event->sound wiring is asserted behaviourally in
  // audio-dispatch.test.ts ("plays 'segmentTick' on a 'segment-cross' event") —
  // replacing the former `?raw` regex match (story 6-12, AC#2).
})

// Story 6-11: the player-death cue now plays the AUTHENTIC POKEY bake
// (player_explosion.wav — extracted from the rev-3 ROM by tools/pokey-bake/ and
// hosted on R2), replacing the community-rip placeholder shipexplosion.wav. The
// core already emits 'player-death' and main.ts already maps it to the playerDeath
// manifest key (that wiring predates this story) — 6-11 only swaps the asset
// behind that key. player-explosion is the one of the remaining 7 catalogued SFX
// with an existing game trigger, so it is the headline deliverable.
describe('player-explosion cue (story 6-11: authentic player-death bake)', () => {
  it('loads the authentic player_explosion bake from the R2 base (AC#3)', () => {
    createAudioEngine().resume()
    expect(fetched).toContain(R2 + 'player_explosion.wav')
  })

  it('no longer loads the community-rip shipexplosion.wav placeholder (AC#3)', () => {
    createAudioEngine().resume()
    expect(fetched).not.toContain(R2 + 'shipexplosion.wav')
  })

  it('resolves the player_explosion bake against a custom base URL too', () => {
    createAudioEngine('https://cdn.test/x/').resume()
    expect(fetched).toContain('https://cdn.test/x/player_explosion.wav')
  })

  // The player-death event->sound wiring is asserted behaviourally in
  // audio-dispatch.test.ts ("plays 'playerDeath' on a 'player-death' event") —
  // replacing the former `?raw` regex match (story 6-12, AC#2).
})

// Story 10-10: voice-stealing playback (per-channel cut-in). The 1981 cabinet's
// POKEY has four hardware channels; a new sound on a channel cuts in over
// whatever was already there. Today play() ignores this and stacks a new
// BufferSource on every call (audio.ts), so a held fire button or a superzapper
// mass-death layers a dozen overlapping copies. This suite pins the contract:
//   - retriggering the SAME sound steals its own channel (prior source stopped),
//   - sounds on DIFFERENT channels coexist (no global stop-everything),
//   - a single one-shot is otherwise unchanged, and the engine still degrades
//     silently when a source's start()/stop() throws.
// The exact channel grouping (how many, which sound on which) is an internal
// detail Dev chooses; these tests assert only the observable cut-in behaviour.
//
// Spin up an engine and wait until its samples have decoded, so play() has real
// buffers to start sources from (mirrors the 'decodes loaded samples' test).
async function readyEngine() {
  const engine = createAudioEngine()
  engine.resume()
  await vi.waitFor(() => expect(engine.ready()).toBe(true))
  return engine
}

describe('voice-stealing playback (story 10-10: per-channel cut-in)', () => {
  it('stops the prior source when the same sound retriggers (AC#1)', async () => {
    const engine = await readyEngine()
    engine.play('fire')
    engine.play('fire')
    expect(sources, 'each trigger still creates its own source').toHaveLength(2)
    expect(sources[0].stopped, 'the first fire voice must be stolen by the second').toBe(true)
    expect(sources[1].started, 'the replacement voice must start').toBe(true)
    expect(sources[1].stopped, 'the live voice must not be stopped').toBe(false)
  })

  it('leaves exactly one live source after a rapid burst of one sound (AC#2)', async () => {
    const engine = await readyEngine()
    // Superzapper mass-death / held-fire: many triggers of the same sound in a
    // tight window must not stack into a layered pile-up.
    for (let i = 0; i < 6; i++) engine.play('enemyDeath')
    expect(sources, 'every trigger creates a source, even the stolen ones').toHaveLength(6)
    const live = sources.filter((s) => s.started && !s.stopped)
    expect(live, 'only the most recent trigger should still be ringing').toHaveLength(1)
    expect(live[0], 'the surviving voice is the last one started').toBe(sources[5])
  })

  it('does not stop a sound on a different channel (AC#1)', async () => {
    const engine = await readyEngine()
    // "stop the prior source on ITS channel" — not a global stop-everything.
    // Regression guard: firing must not cut off the player-death explosion.
    engine.play('playerDeath')
    engine.play('fire')
    const deathVoice = sources[0]
    const fireVoice = sources[1]
    expect(deathVoice.stopped, 'player-death must keep ringing while fire plays').toBe(false)
    expect(fireVoice.started, 'fire still plays on its own channel').toBe(true)
  })

  it('plays a single one-shot unchanged: one started, un-stopped source (AC#3)', async () => {
    const engine = await readyEngine()
    engine.play('fire')
    expect(sources, 'no prior voice to steal — one source created').toHaveLength(1)
    expect(sources[0].started).toBe(true)
    expect(sources[0].stopped, 'nothing to steal, so nothing is stopped').toBe(false)
  })

  it('creates no source for a sound that has not loaded yet (AC#3)', () => {
    const engine = createAudioEngine()
    engine.resume() // decode microtasks not flushed — buffers still empty
    engine.play('fire')
    expect(sources, 'unloaded sound stays a silent no-op').toHaveLength(0)
  })

  it('swallows a throwing stop() and still starts the replacement (AC#3)', async () => {
    // A flaky stop() on the stolen voice must neither crash the frame nor abort
    // the cut-in — the new sound still plays.
    class ThrowingStopCtx extends FakeAudioContext {
      createBufferSource(): RecSource {
        return recSource({
          stop() {
            throw new Error('stop failed')
          },
        })
      }
    }
    vi.stubGlobal('AudioContext', ThrowingStopCtx)
    const engine = await readyEngine()
    engine.play('fire')
    expect(() => engine.play('fire')).not.toThrow()
    expect(sources[1].started, 'replacement starts despite a throwing stop()').toBe(true)
  })

  it('swallows a throwing start() without crashing the frame (AC#3)', async () => {
    class ThrowingStartCtx extends FakeAudioContext {
      createBufferSource(): RecSource {
        return recSource({
          start() {
            throw new Error('start failed')
          },
        })
      }
    }
    vi.stubGlobal('AudioContext', ThrowingStartCtx)
    const engine = await readyEngine()
    expect(() => engine.play('fire')).not.toThrow()
  })
})
