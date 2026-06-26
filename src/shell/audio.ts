// src/shell/audio.ts
//
// Shell-side WebAudio SFX engine (Story 5-2). Loads the game's real arcade `.wav`
// samples from Cloudflare R2 and plays them by name. This is IO (shell), not
// simulation (core): the pure core emits `GameEvent` DATA and never imports this
// module — it must stay free of `AudioContext`/DOM (CLAUDE.md hard boundary).
//
// Every failure mode degrades silently: no WebAudio support, a blocked autoplay
// context, a failed fetch, or an undecodable sample all leave the game running
// without sound rather than throwing. Browsers also forbid creating an
// `AudioContext` before a user gesture, so the context is built lazily inside
// `resume()` (wired to a click/keydown handler in Story 5-5) and every method is
// a no-op until then.
//
// Scope (5-2): the engine + sound manifest only. Mapping `GameEvent`s to sound
// names and draining `state.events` each frame is Story 5-5's job.

const DEFAULT_BASE_URL = 'https://arcade.slabgorb.com/tempest/sfx/'

// Logical sound name -> R2 filename. Keyed to the gameplay moments the 5-1
// `GameEvent` channel reports, so 5-5's event->sound wiring is a thin lookup.
// Filenames are exact (R2 keys are case-sensitive).
const SOUNDS = {
  fire: 'shot.wav', // player bullet fired
  enemyDeath: 'explo.wav', // an enemy was destroyed
  playerGrab: 'clawcatch.wav', // the Claw was grabbed at the rim
  playerDeath: 'shipexplosion.wav', // the Claw was destroyed
  warpSpikeCrash: 'kaboom.wav', // crashed onto a spike during the warp
  levelClear: 'getwarp.wav', // level cleared, warp begins
  superzapper: 'kzap.wav', // superzapper fired
  playerSpawn: 'warpin.wav', // the Claw (re)spawned
} as const

export type SoundName = keyof typeof SOUNDS

export interface AudioEngine {
  // Create/resume the AudioContext and start loading samples. Safe to call
  // repeatedly (e.g. on every user gesture); only the first call does work.
  resume(): void
  // Play a loaded sample once. No-op if the sound is not loaded, the context is
  // not ready, or audio is unavailable.
  play(name: SoundName): void
  // True once at least one sample has decoded. Mainly for tests / readiness UI.
  ready(): boolean
}

// Resolve the AudioContext constructor, covering the legacy `webkitAudioContext`
// prefix (older Safari/iOS) and non-browser environments. Read off `globalThis`
// with an explicit shape — `AudioContext` is a global ambient, not a member of
// the `Window` interface, so a bare `window.AudioContext` access won't typecheck.
function getAudioContextCtor(): typeof AudioContext | undefined {
  const g = globalThis as {
    AudioContext?: typeof AudioContext
    webkitAudioContext?: typeof AudioContext
  }
  return g.AudioContext ?? g.webkitAudioContext
}

export function createAudioEngine(baseUrl: string = DEFAULT_BASE_URL): AudioEngine {
  let ctx: AudioContext | null = null
  let master: GainNode | null = null
  let loadStarted = false
  const buffers = new Map<SoundName, AudioBuffer>()

  // Fetch + decode every manifest sample once. A failure on any one sample
  // (network, CORS, undecodable) is swallowed — that sound simply never plays.
  function load(): void {
    if (loadStarted || !ctx) return
    loadStarted = true
    const context = ctx
    for (const name of Object.keys(SOUNDS) as SoundName[]) {
      fetch(baseUrl + SOUNDS[name])
        .then((res) => res.arrayBuffer())
        .then((data) => context.decodeAudioData(data))
        .then((buffer) => {
          buffers.set(name, buffer)
        })
        .catch(() => {
          /* one missing sound is non-fatal — leave it unloaded, stay silent */
        })
    }
  }

  function resume(): void {
    if (!ctx) {
      const Ctor = getAudioContextCtor()
      if (!Ctor) return // no WebAudio — engine stays inert
      try {
        ctx = new Ctor()
        master = ctx.createGain()
        master.gain.value = 0.4 // headroom so overlapping SFX don't clip
        master.connect(ctx.destination)
      } catch {
        ctx = null
        master = null
        return
      }
    }
    // The context can start 'suspended' until a gesture unlocks it.
    if (ctx.state === 'suspended') void ctx.resume()
    load()
  }

  function play(name: SoundName): void {
    if (!ctx || !master) return
    const buffer = buffers.get(name)
    if (!buffer) return // not loaded (yet) or failed to decode — silent no-op
    try {
      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.connect(master)
      source.start()
    } catch {
      /* never let a single sound failure crash the frame */
    }
  }

  function ready(): boolean {
    return buffers.size > 0
  }

  return { resume, play, ready }
}
