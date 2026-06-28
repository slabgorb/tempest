// tests/shell/audio.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createAudioEngine } from '../../src/shell/audio'
// Read main.ts as text (Vite `?raw`) for the event->sound wiring check below —
// the same browser-pure idiom as storage.test.ts / events.test.ts, so we never
// pull Node's `fs` types into the deliberately browser-pure test posture.
import mainSrc from '../../src/main.ts?raw'

// Story 6-6 runs two SFX sources side by side: ★ AUTHENTIC POKEY bakes from the
// arcade ROM, served locally from `/tempest/sfx/`, and the original community-rip
// samples still on the R2 assets host. audio.ts resolves a rooted/absolute source
// as-is and a bare filename against the R2 base.
const R2 = 'https://arcade-assets.slabgorb.com/tempest/sfx/'
const LOCAL = '/tempest/sfx/'

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

describe('audio engine source resolution (story 6-6 dual-source)', () => {
  it('serves the authentic ROM bakes from the local /tempest/sfx/ path', () => {
    createAudioEngine().resume()
    expect(fetched).toContain(LOCAL + 'player_fire.wav') // ★ ROM $cc5d
    expect(fetched).toContain(LOCAL + 'enemy_explosion.wav') // ★ ROM $cc81
    expect(fetched).toContain(LOCAL + 'warp.wav') // ★ ROM $cc75
  })

  it('resolves bare community-rip filenames against the R2 base', () => {
    createAudioEngine().resume()
    expect(fetched).toContain(R2 + 'clawcatch.wav')
    expect(fetched).toContain(R2 + 'kzap.wav')
    expect(fetched).toContain(R2 + 'warpin.wav')
  })

  it('honours a custom base URL for bare names but leaves rooted paths absolute', () => {
    createAudioEngine('https://cdn.test/x/').resume()
    expect(fetched).toContain('https://cdn.test/x/clawcatch.wav') // bare -> custom base
    expect(fetched).toContain(LOCAL + 'player_fire.wav') // rooted -> as-is
  })

  // AC#3 (RED): the enemy-fire bolt must play the AUTHENTIC bake, served locally
  // like the other ★ sounds, not the community R2 rip. enemyFire currently points
  // at the bare R2 'enemyfire.wav' (inherited from the 6-5 hook), so these fail
  // until Dev repoints it at the baked /tempest/sfx/enemy_fire.wav.
  it('serves the enemy-fire bolt as the authentic local bake (AC#3)', () => {
    createAudioEngine().resume()
    expect(fetched).toContain(LOCAL + 'enemy_fire.wav')
    expect(fetched).not.toContain(R2 + 'enemyfire.wav')
  })

  it('decodes loaded samples into a ready engine', async () => {
    const engine = createAudioEngine()
    expect(engine.ready()).toBe(false)
    engine.resume()
    // flush the fetch -> arrayBuffer -> decodeAudioData microtask chain
    await vi.waitFor(() => expect(engine.ready()).toBe(true))
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
