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

// The Claw died; `cause` distinguishes the death channel for cue selection.
export interface PlayerDeathEvent {
  type: 'player-death'
  cause: 'grab' | 'pulse' | 'spike'
}

export type GameEvent =
  | EnemyDeathEvent
  | PlayerGrabEvent
  | FireEvent
  | WarpSpikeCrashEvent
  | LevelClearEvent
  | SuperzapperActivateEvent
  | PlayerSpawnEvent
  | PlayerDeathEvent
