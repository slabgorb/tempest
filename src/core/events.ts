// src/core/events.ts
//
// The pure-core game-event channel (Story 5-1). `stepGame` emits a fresh list of
// these on `GameState.events` each frame, describing the gameplay moments the
// shell reacts to — audio (5-2 / 5-5) and the warp-crash cue (5-6) consume them.
//
// Events are DATA, never callbacks: they carry only the information a renderer or
// SFX engine needs (which lane, how deep, what kind), so the core stays pure and
// deterministic. A fixed RNG seed + input stream yields an identical event stream.
//
// Narrow with the `type` discriminant (`switch (e.type)` / `e.type === '...'`).

// `import type` ⇒ a compile-time-only reference, so no runtime import cycle with
// state.ts. Typing enemy kinds as the `EnemyKind` union (not `string`) keeps
// downstream consumers' `switch` exhaustive and rejects misspelled kinds.
import type { EnemyKind } from './state'

// An enemy was destroyed (by a bullet or the superzapper). `enemyType` is the
// enemy's kind; `lane`/`depth` mark where it died, for particle/SFX placement.
export interface EnemyDeathEvent {
  type: 'enemy-death'
  enemyType: EnemyKind
  lane: number
  depth: number
}

// The Claw was killed at the rim — grabbed by an enemy or caught by a pulse.
// `killedBy` is the offending enemy's kind. (A `PlayerDeathEvent` accompanies it.)
export interface PlayerGrabEvent {
  type: 'player-grab'
  lane: number
  killedBy: EnemyKind
}

// A bullet was fired from the rim (depth 1) down `lane`.
export interface FireEvent {
  type: 'fire'
  lane: number
  depth: number
}

// An enemy fired an energy bolt (Story 6-5). `lane`/`depth` mark the spawn point;
// this is the hook the shell's SFX engine consumes for the enemy-fire cue (6-6).
export interface EnemyFireEvent {
  type: 'enemy-fire'
  lane: number
  depth: number
}

// The Claw crashed onto a spike during the warp descent.
export interface WarpSpikeCrashEvent {
  type: 'warp-spike-crash'
  lane: number
}

// The level was cleared (board empty, spawn budget spent); the warp to
// `newLevel` begins this frame.
export interface LevelClearEvent {
  type: 'level-clear'
  newLevel: number
}

// The superzapper fired. `killCount` is how many enemies it vaporised this
// activation (all of them on a full blast, one on a weak shot).
export interface SuperzapperActivateEvent {
  type: 'superzapper-activate'
  killCount: number
}

// The Claw (re)spawned onto `lane` after a death.
export interface PlayerSpawnEvent {
  type: 'player-spawn'
  lane: number
}

// The Superzapper well-color flash (Story 10-2). One is emitted on every ACTIVE
// zap frame; `color` is the ROM's QFRAME-AND-7 well-color index (0..7). The core
// only signals WHICH color index to show — the renderer maps it to the palette.
export interface SuperzapperFlashEvent {
  type: 'superzapper-flash'
  color: number
}

// The spinner carried the Claw across a tube-segment boundary into a new lane
// (Story 6-10). `lane` is the new discrete lane entered. Fires once per crossing;
// the shell plays the authentic POKEY segment_tick cue on it.
export interface SegmentCrossEvent {
  type: 'segment-cross'
  lane: number
}

// The Claw died; `cause` distinguishes the death channel for cue selection.
export interface PlayerDeathEvent {
  type: 'player-death'
  cause: 'grab' | 'pulse' | 'spike' | 'bolt'
}

// A player bullet shortened a standing spike (Story 10-11). `lane` is where it
// hit; the shell plays the authentic spike_shot cue (ROM cc51).
export interface SpikeShotEvent {
  type: 'spike-shot'
  lane: number
}

// A bonus life was awarded this frame (Story 10-11) — the score crossed one (or
// more) EXTRA_LIFE_INTERVAL boundaries. `count` is how many lives were added; the
// shell plays the authentic extra_life cue (ROM cc11) once per award.
export interface ExtraLifeEvent {
  type: 'extra-life'
  count: number
}

// The pulsar population went 0 → >0 (Story 10-11): the first pulsar appeared, so
// the shell begins looping the authentic pulsar_hum (ROM cc99). Fires once on the
// rising edge, not every frame a pulsar is present.
export interface PulsarHumStartEvent {
  type: 'pulsar-hum-start'
}

// The pulsar population went >0 → 0 (Story 10-11): the last pulsar left, so the
// shell stops the pulsar_hum loop. Fires once on the falling edge.
export interface PulsarHumStopEvent {
  type: 'pulsar-hum-stop'
}

// The warp/zoom dive concluded (Story 10-11) — either it completed (reached the
// next level) or the Claw crashed onto a spike. The shell stops the sustained
// warp sound here so it spans exactly the dive (no early silence, no bleed).
export interface WarpEndEvent {
  type: 'warp-end'
}

export type GameEvent =
  | EnemyDeathEvent
  | PlayerGrabEvent
  | FireEvent
  | EnemyFireEvent
  | WarpSpikeCrashEvent
  | LevelClearEvent
  | SuperzapperActivateEvent
  | SuperzapperFlashEvent
  | PlayerSpawnEvent
  | PlayerDeathEvent
  | SegmentCrossEvent
  | SpikeShotEvent
  | ExtraLifeEvent
  | PulsarHumStartEvent
  | PulsarHumStopEvent
  | WarpEndEvent
