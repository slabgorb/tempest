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
}

let fetched: string[]

beforeEach(() => {
  fetched = []
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
    expect(fetched).toContain(R2 + 'player_fire.wav') // ★ ROM $cc5d
    expect(fetched).toContain(R2 + 'enemy_explosion.wav') // ★ ROM $cc81
    expect(fetched).toContain(R2 + 'warp.wav') // ★ ROM $cc75
  })

  it('loads the community-rip samples from the R2 base', () => {
    createAudioEngine().resume()
    expect(fetched).toContain(R2 + 'clawcatch.wav')
    expect(fetched).toContain(R2 + 'kzap.wav')
    expect(fetched).toContain(R2 + 'warpin.wav')
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
