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

// R2 samples live on the dedicated assets host. arcade.slabgorb.com itself now
// routes to the game's Cloudflare tunnel (the Vite origin), so the .wav samples
// were moved to the arcade-assets custom domain to keep them edge-served.
const DEFAULT_BASE_URL = 'https://arcade-assets.slabgorb.com/tempest/sfx/'

// Logical sound name -> source. Keyed to the gameplay moments the 5-1
// `GameEvent` channel reports, so the event->sound wiring is a thin lookup.
//
// Two sources are in play (story 6-6): the ★ entries are AUTHENTIC POKEY bakes
// from the arcade ROM, served locally from `public/sfx/`; the rest are the
// original community-rip samples still hosted on R2. A value that is rooted
// (`/…`) or absolute (`https://…`) is fetched as-is; a bare filename resolves
// against the R2 base. (When the authentic bakes move to R2, swap their values
// back to bare filenames.)
const LOCAL = '/tempest/sfx/' // public/sfx under the pinned /tempest/ base
const SOUNDS = {
  fire: LOCAL + 'player_fire.wav', // ★ authentic bake (ROM $cc5d) — player bullet fired
  enemyFire: LOCAL + 'enemy_fire.wav', // ★ authentic ($cc45) — an enemy fired an energy bolt
  enemyDeath: LOCAL + 'enemy_explosion.wav', // ★ authentic ($cc81) — an enemy was destroyed
  playerGrab: 'clawcatch.wav', // the Claw was grabbed at the rim (community rip)
  playerDeath: 'shipexplosion.wav', // the Claw was destroyed (community rip)
  warpSpikeCrash: 'kaboom.wav', // crashed onto a spike during the warp (community rip)
  levelClear: LOCAL + 'warp.wav', // ★ authentic ($cc75) — level cleared, warp begins
  superzapper: 'kzap.wav', // superzapper fired (community rip)
  playerSpawn: 'warpin.wav', // the Claw (re)spawned (community rip)
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
      const src = SOUNDS[name]
      // rooted ("/…") or absolute ("https://…") sources are used as-is; a bare
      // filename resolves against the R2 base.
      const url = /^(?:https?:)?\//.test(src) ? src : baseUrl + src
      fetch(url)
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
