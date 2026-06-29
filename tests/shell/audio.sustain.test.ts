// tests/shell/audio.sustain.test.ts
//
// RED-phase suite for Story 10-11 — sustained / looping playback in the WebAudio
// engine. Today `audio.ts` only knows one-shot `play()`; the pulsar hum and the
// warp/zoom dive need a sound that STARTS, rings continuously, and STOPS on cue.
// This pins the new engine surface:
//
//   - startLoop(name): begin a looping source (source.loop === true) on the
//     sound's channel; a second startLoop steals the first (one live loop max).
//   - stopLoop(name): stop the live looping source on that channel; a safe no-op
//     when nothing is looping.
//   - the three previously-baked-but-unwired samples (spike_shot, extra_life,
//     pulsar_hum) are added to the manifest and fetched from R2.
//   - every failure mode still degrades silently (unloaded sound, throwing start).
//
// Mirrors the recording-source scaffolding in audio.test.ts, extended with a
// `loop` flag so a test can observe that startLoop set it. startLoop/stopLoop do
// not exist on the engine yet, so these all fail today (valid RED).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createAudioEngine } from '../../src/shell/audio'

const R2 = 'https://arcade-assets.slabgorb.com/tempest/sfx/'

// A recording BufferSource that remembers whether it was started/stopped and
// whether it was set to loop. `overrides` lets a test inject a throwing start().
interface RecSource {
  buffer: unknown
  loop: boolean
  started: boolean
  stopped: boolean
  disconnected: boolean
  connect(dest: unknown): void
  start(): void
  stop(): void
  disconnect(): void
}

let sources: RecSource[]
let fetched: string[]

function recSource(overrides: Partial<Pick<RecSource, 'start' | 'stop'>> = {}): RecSource {
  const src: RecSource = {
    buffer: null,
    loop: false,
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
  createBufferSource(): RecSource {
    return recSource()
  }
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

// Spin up an engine and wait until its samples have decoded, so startLoop has a
// real buffer to start a source from (mirrors audio.test.ts's readyEngine).
async function readyEngine() {
  const engine = createAudioEngine()
  engine.resume()
  await vi.waitFor(() => expect(engine.ready()).toBe(true))
  return engine
}

describe('manifest: the previously-unwired bakes are loaded from R2 (story 10-11)', () => {
  it('fetches the spike_shot, extra_life, and pulsar_hum bakes', () => {
    createAudioEngine().resume()
    expect(fetched).toContain(R2 + 'spike_shot.wav') // ★ ROM cc51
    expect(fetched).toContain(R2 + 'extra_life.wav') // ★ ROM cc11
    expect(fetched).toContain(R2 + 'pulsar_hum.wav') // ★ ROM cc99
  })

  it('resolves the new bakes against a custom base URL too', () => {
    createAudioEngine('https://cdn.test/x/').resume()
    expect(fetched).toContain('https://cdn.test/x/spike_shot.wav')
    expect(fetched).toContain('https://cdn.test/x/extra_life.wav')
    expect(fetched).toContain('https://cdn.test/x/pulsar_hum.wav')
  })
})

describe('startLoop / stopLoop sustained playback (story 10-11)', () => {
  it('startLoop begins a single looping, started source', async () => {
    const engine = await readyEngine()
    engine.startLoop('pulsarHum')
    expect(sources).toHaveLength(1)
    expect(sources[0].loop, 'a sustained sound must loop, not fire once').toBe(true)
    expect(sources[0].started).toBe(true)
    expect(sources[0].stopped).toBe(false)
  })

  it('a second startLoop on the same sound steals the first — one live loop, never a stack', async () => {
    const engine = await readyEngine()
    engine.startLoop('pulsarHum')
    engine.startLoop('pulsarHum')
    const live = sources.filter((s) => s.started && !s.stopped)
    expect(live, 'only one pulsar hum may ring at a time').toHaveLength(1)
    expect(sources[0].stopped, 'the first loop was stolen by the second').toBe(true)
    expect(sources[1].started).toBe(true)
  })

  it('stopLoop stops the live looping source', async () => {
    const engine = await readyEngine()
    engine.startLoop('pulsarHum')
    engine.stopLoop('pulsarHum')
    expect(sources).toHaveLength(1)
    expect(sources[0].stopped, 'the hum must actually stop when the last pulsar dies').toBe(true)
  })

  it('stopLoop is a safe no-op when nothing is looping', async () => {
    const engine = await readyEngine()
    expect(() => engine.stopLoop('pulsarHum')).not.toThrow()
    expect(sources, 'stopping a silent loop creates nothing').toHaveLength(0)
  })

  it('startLoop on an unloaded sound is a silent no-op (no source)', () => {
    const engine = createAudioEngine()
    engine.resume() // decode microtasks not flushed — buffers still empty
    engine.startLoop('pulsarHum')
    expect(sources).toHaveLength(0)
  })

  it('swallows a throwing start() without crashing the frame', async () => {
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
    expect(() => engine.startLoop('pulsarHum')).not.toThrow()
  })
})
