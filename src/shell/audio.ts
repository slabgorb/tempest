// src/shell/audio.ts
//
// Tempest's SFX manifest + engine constructor. The WebAudio ENGINE itself (lazy
// AudioContext, master gain, buffer load/decode, POKEY-style voice-stealing, silent
// degrade) was extracted to @arcade/shared/audio in SH2-16 — four cabinets shared
// the identical mechanism. This module keeps only tempest's NUMBERS (the SOUNDS
// name->file manifest, the CHANNELS voice map, the R2 base URL) and constructs the
// shared engine from them. The event->sound wiring stays in audio-dispatch.ts.
//
// This is IO (shell), not simulation (core): the pure core emits `GameEvent` DATA
// and never imports this module — it must stay free of `AudioContext`/DOM.
//
// Every failure mode still degrades silently (no WebAudio, blocked autoplay, failed
// fetch, undecodable sample) — that behaviour now lives in the shared engine.
import {
  createAudioEngine as createSharedAudioEngine,
  type AudioEngine as SharedAudioEngine,
} from '@arcade/shared/audio'

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
  fire: 'player_fire.wav', // ★ authentic ($cbe9 = LA ";PLAYER FIRE"; was $cc5d — tp1-2)
  enemyFire: 'enemy_fire.wav', // ★ authentic ($cc45 = ES) — an enemy fired an energy bolt
  enemyDeath: 'enemy_explosion.wav', // ★ authentic ($cc5d = EX; was $cc81 — tp1-2)
  playerGrab: 'clawcatch.wav', // the Claw was grabbed at the rim (community rip)
  playerDeath: 'player_explosion.wav', // ★ authentic ($cbf5) — the Claw was destroyed (6-11)
  warpSpikeCrash: 'kaboom.wav', // crashed onto a spike during the warp (community rip)
  levelClear: 'warp.wav', // ★ authentic ($cc75 = T2 ";THRUST IN TUBE") — the dive's in-well phase
  // tp1-13 (S-014): the dive's SPACE phase. ★ authentic ($cc81 = T3 ";THRUST IN
  // SPACE"), baked+hosted by tp1-2 and wired here — MOVCUD hands the drone over from
  // T2 the frame the cursor passes ILINDDY. (kzap.wav is DELETED: it was an invention
  // with no slot in ALSOUN's 13-sound table — S-011. The zap's audio is each kill's EX
  // burst, already played by their 'enemy-death' events.)
  thrustSpace: 'thrust_space.wav',
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
  segmentTick: 'segment', // own channel: ticks must survive a held fire
  // Story 10-11: the sustained cues each get their OWN voice. levelClear is now a
  // loop spanning the dive, so it can no longer share 'warp' with the crash impact
  // (a mid-dive crash rings WHILE the zoom loop is up, then warp-end stops only the
  // loop). The hum likewise rings under everything on its own voice.
  levelClear: 'zoom', // the sustained zoom/warp loop (10-11)
  // tp1-13 (S-014): T3 shares levelClear's 'zoom' voice — the dive's two thrust
  // phases are the same category and mutually exclusive in time (warp-space stops T2
  // the frame it starts T3), which is exactly when the channel rule allows sharing.
  thrustSpace: 'zoom',
  spikeShot: 'spike',
  extraLife: 'bonus',
  pulsarHum: 'pulsar',
}

// Tempest's concrete engine type — the shared `AudioEngine<N>` specialised to this
// cabinet's SoundName union, so `play()` stays typed and audio-dispatch.ts can do
// `Pick<AudioEngine, 'play' | 'startLoop' | 'stopLoop'>` without a type argument.
export type AudioEngine = SharedAudioEngine<SoundName>

// Construct tempest's SFX engine from its manifest. The default base URL keeps the
// 0-arg call sites (main.ts, the sample-loading tests) working; a custom base URL
// is threaded through for tests. masterGain is omitted so the shared 0.4 default
// (tempest's long-standing headroom value) applies.
export function createAudioEngine(baseUrl: string = DEFAULT_BASE_URL): AudioEngine {
  return createSharedAudioEngine<SoundName>({
    baseUrl,
    sounds: SOUNDS,
    channels: CHANNELS,
  })
}
