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
// `score` is the points actually awarded for this kill (tp1-21: the fuseball's
// tier is a random roll, so the shell can no longer re-derive it from `depth` —
// it must read the number the sim actually rolled). Optional so every other
// kind, and existing hand-built fixtures, need not carry it.
export interface EnemyDeathEvent {
  type: 'enemy-death'
  enemyType: EnemyKind
  lane: number
  depth: number
  score?: number
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

// The warp descent BEGAN (tp1-10, WD-017): the first frame the Claw actually leaves
// the rim and dives, AFTER the AVOID-SPIKES hold. MOVCUD starts the thrust rumble
// exactly here — "LDA CURSY / CMP I,ILINLI / IFEQ ;STILL AT TOP? / JSR SOUTS2 ;YES.
// START RUMBLE" (ALWELG.MAC:1019-1023) — so the shell starts the sustained warp loop
// on this edge, NOT at level-clear (warp entry), keeping it silent through the hold.
// Fires once per dive, on the first descending frame.
export interface WarpDescentStartEvent {
  type: 'warp-descent-start'
}

// The warp/zoom dive concluded (Story 10-11) — either the descent bottomed out (the
// eye fly-in begins) or the Claw crashed onto a spike. The shell stops the sustained
// warp rumble here so it spans exactly the descent (no early silence, no bleed).
export interface WarpEndEvent {
  type: 'warp-end'
}

// The dive crossed the well bottom (ILINDDY = $F0) into space (tp1-13, S-014).
// MOVCUD initializes space mode and starts the T3 space drone via SOUTS3 on this
// exact frame (ALWELG.MAC:1032-1037); the shell hands the sustained thrust loop
// over from T2 (in-well) to T3 (in-space). The level has NOT advanced yet — the
// space segment is still the warp.
export interface WarpSpaceEvent {
  type: 'warp-space'
}

// The end-of-wave skill-step bonus for starting at an advanced wave was awarded
// (tp1-13, S-015). ENDWAV pays BONPTM[BONUS] once — gated on the bonus being
// nonzero (`LDA X,BONUS / IFNE`, ALEXEC.MAC:371-376) — and makes the WP
// special-score chime through SAUSON. `points` is the ladder value; the shell
// plays the same extra_life cue.
export interface WaveBonusEvent {
  type: 'wave-bonus'
  points: number
}

// A player shot destroyed an enemy bolt in flight (tp1-13, S-013). INCCSQ's
// charge-charge kill places the EX explosion at the SHOT's coordinates and makes
// the EX noise, awarding no points (ALWELG.MAC:2797-2809). `lane`/`depth` mark the
// destroyed bolt's position for the burst + cue.
export interface BoltDestroyedEvent {
  type: 'bolt-destroyed'
  lane: number
  depth: number
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
  | WarpDescentStartEvent
  | WarpEndEvent
  | WarpSpaceEvent
  | WaveBonusEvent
  | BoltDestroyedEvent
