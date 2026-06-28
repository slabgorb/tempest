// tests/shell/audio.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createAudioEngine } from '../../src/shell/audio'
// Read main.ts as text (Vite `?raw`) for the event->sound wiring check below —
// the same browser-pure idiom as storage.test.ts / events.test.ts, so we never
// pull Node's `fs` types into the deliberately browser-pure test posture.
import mainSrc from '../../src/main.ts?raw'

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

describe('event -> sound wiring (AC#3: enemy-fire event)', () => {
  // The core emits an 'enemy-fire' GameEvent (story 6-5); the shell's event pump
  // in main.ts maps it to the enemyFire sample. Asserted at the source level —
  // main.ts bootstraps a canvas, so it cannot be imported in the node test env.
  it("plays the enemyFire sample on the core 'enemy-fire' event", () => {
    expect(mainSrc).toMatch(/case 'enemy-fire':\s*audio\.play\('enemyFire'\)/)
  })
})
