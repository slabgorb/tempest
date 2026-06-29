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

// Logical sound name -> R2 filename. Keyed to the gameplay moments the 5-1
// `GameEvent` channel reports, so the event->sound wiring is a thin lookup.
// Filenames are exact (R2 keys are case-sensitive). The ★ entries are AUTHENTIC
// POKEY bakes from the arcade ROM (story 6-6 — baked by tools/pokey-bake/ and
// hosted on R2); the rest are the original community-rip samples.
const SOUNDS = {
  fire: 'player_fire.wav', // ★ authentic bake (ROM $cc5d) — player bullet fired
  enemyFire: 'enemy_fire.wav', // ★ authentic ($cc45) — an enemy fired an energy bolt
  enemyDeath: 'enemy_explosion.wav', // ★ authentic ($cc81) — an enemy was destroyed
  playerGrab: 'clawcatch.wav', // the Claw was grabbed at the rim (community rip)
  playerDeath: 'player_explosion.wav', // ★ authentic ($cbf5) — the Claw was destroyed (6-11)
  warpSpikeCrash: 'kaboom.wav', // crashed onto a spike during the warp (community rip)
  levelClear: 'warp.wav', // ★ authentic ($cc75) — level cleared, warp begins
  superzapper: 'kzap.wav', // superzapper fired (community rip)
  playerSpawn: 'warpin.wav', // the Claw (re)spawned (community rip)
  segmentTick: 'segment_tick.wav', // ★ authentic ($cc39) — cursor crossed into a new tube segment
  // Story 10-11: previously-baked-but-unwired authentic POKEY samples (idx9/4/3 of
  // the sound table — see docs/ux/2026-06-28-pokey-sfx-rom-map.md).
  spikeShot: 'spike_shot.wav', // ★ authentic ($cc51) — a bullet shortened a spike
  extraLife: 'extra_life.wav', // ★ authentic ($cc11) — a bonus life was awarded
  pulsarHum: 'pulsar_hum.wav', // ★ authentic ($cc99) — looped while a pulsar is alive
} as const

export type SoundName = keyof typeof SOUNDS

// Story 10-10: logical playback channels (POKEY-style voice stealing). The 1981
// cabinet mixes through POKEY's handful of hardware channels, so a new sound on a
// channel cuts in over whatever was already there. `play()` mirrors that: it stops
// the channel's prior source before starting the new one, so rapid retriggers —
// held fire, or a Superzapper mass-death — cut in instead of stacking into a
// layered pile-up (the old code spawned a fresh BufferSource on every call).
//
// Sounds only share a channel when they are the same category AND mutually
// exclusive in time, so stealing one for another is never a surprise: a death and
// a respawn never overlap; a level-clear and a spike-crash are alternatives. The
// rapid Claw cues (fire, segment tick) keep their own channels so holding fire
// never silences the lane-cross ticks. Keyed by SoundName, so a new manifest
// sound without a channel is a compile error.
const CHANNELS: Record<SoundName, string> = {
  fire: 'fire', // the player's gun — the headline held-fire pile-up
  enemyFire: 'enemy', // enemy weapons/deaths share the "enemy" voice
  enemyDeath: 'enemy', // Superzapper mass-death stops stacking here
  playerGrab: 'grab',
  playerDeath: 'player-life', // death then respawn never overlap
  playerSpawn: 'player-life',
  warpSpikeCrash: 'warp', // the crash impact owns the warp voice
  superzapper: 'zap',
  segmentTick: 'segment', // own channel: ticks must survive a held fire
  // Story 10-11: the sustained cues each get their OWN voice. levelClear is now a
  // loop spanning the dive, so it can no longer share 'warp' with the crash impact
  // (a mid-dive crash rings WHILE the zoom loop is up, then warp-end stops only the
  // loop). The hum likewise rings under everything on its own voice.
  levelClear: 'zoom', // the sustained zoom/warp loop (10-11)
  spikeShot: 'spike',
  extraLife: 'bonus',
  pulsarHum: 'pulsar',
}

export interface AudioEngine {
  // Create/resume the AudioContext and start loading samples. Safe to call
  // repeatedly (e.g. on every user gesture); only the first call does work.
  resume(): void
  // Play a loaded sample once. No-op if the sound is not loaded, the context is
  // not ready, or audio is unavailable.
  play(name: SoundName): void
  // Start a sustained (looping) sample on its channel — the pulsar hum or the
  // warp/zoom dive (Story 10-11). Steals the channel like play(), so only one loop
  // rings per channel. Same silent no-ops as play() when unavailable/unloaded.
  startLoop(name: SoundName): void
  // Stop the sustained sample sounding on `name`'s channel (Story 10-11). A safe
  // no-op when nothing is looping there.
  stopLoop(name: SoundName): void
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
  // Story 10-10: the source currently sounding on each logical channel, so the
  // next trigger on that channel can steal (stop) it. Cleared by `onended` when a
  // source finishes on its own, so a later trigger never tries to stop a node that
  // already ended.
  const live = new Map<string, AudioBufferSourceNode>()

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

  // Steal a channel: stop whatever is sounding on it so a new trigger cuts in.
  // Its own guard, separate from starting any replacement — a prior source that
  // already ended would throw on stop(), and that must NOT abort the cut-in.
  function stopChannel(channel: string): void {
    const prev = live.get(channel)
    if (!prev) return
    live.delete(channel)
    try {
      prev.stop()
      prev.disconnect()
    } catch {
      /* prior source may have already ended — ignore */
    }
  }

  // Start a buffer source on `name`'s channel, optionally looping. Shared by the
  // one-shot play() and the sustained startLoop() (Story 10-11) — the only
  // difference is `source.loop`. Steals the channel first so retriggers cut in
  // instead of stacking; silently no-ops when unavailable or unloaded.
  function startSource(name: SoundName, loop: boolean): void {
    if (!ctx || !master) return
    const buffer = buffers.get(name)
    if (!buffer) return // not loaded (yet) or failed to decode — silent no-op
    const channel = CHANNELS[name]
    stopChannel(channel)
    try {
      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.loop = loop
      source.connect(master)
      // Forget a source once it finishes so it isn't left as the channel's "live"
      // voice; otherwise the next trigger would stop an already-ended node. (A
      // looping source never fires onended on its own — stopLoop ends it.)
      source.onended = () => {
        if (live.get(channel) === source) live.delete(channel)
      }
      source.start()
      live.set(channel, source)
    } catch {
      /* never let a single sound failure crash the frame */
    }
  }

  function play(name: SoundName): void {
    startSource(name, false)
  }

  function startLoop(name: SoundName): void {
    startSource(name, true)
  }

  function stopLoop(name: SoundName): void {
    stopChannel(CHANNELS[name])
  }

  function ready(): boolean {
    return buffers.size > 0
  }

  return { resume, play, startLoop, stopLoop, ready }
}
