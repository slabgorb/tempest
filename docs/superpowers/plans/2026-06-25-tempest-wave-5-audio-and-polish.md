# Tempest Wave 5 (Audio & Polish) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the finished game its arcade voice and shine — synthesized WebAudio SFX (fire, enemy explosion, player death, level-clear/warp, superzapper, extra life), explosion + death particles with screen-shake, and final vector-CRT glow tuning — all driven by a typed, deterministic **event channel** emitted by the pure core and consumed by the shell.

**Architecture:** Keep the pure, deterministic `core/` (`stepGame(state, input, dt) → state`). The one core change is a typed `events: GameEvent[]` channel on `GameState`: `stepGame` clears it at the start of each step and the existing sub-steppers append a `GameEvent` at each game moment that should make a sound or a spark (bullet fired, enemy killed, player died, level cleared, warp arrived, superzapper, extra life). The core emits **data, not sound** — it never touches `AudioContext`. The shell drains the per-step events each frame and routes them to two new shell-only systems: `shell/audio.ts` (a lazily-created `AudioContext` that synthesizes SFX with oscillators/noise, gated on a user gesture, a graceful no-op when audio is unavailable) and `shell/particles.ts` + screen-shake state in `shell/loop.ts` (render state seeded from events, drawn in `render.ts`, never fed back into the sim). Glow tuning is pure render-layer constant changes.

**Tech Stack:** TypeScript (strict, ES modules), Vite, Vitest (node environment), HTML5 Canvas 2D, WebAudio (`AudioContext`).

**Reference:** `docs/superpowers/specs/2026-06-24-tempest-clone-design.md` (north-star design — Wave 5 scope: "WebAudio SFX, particle/screen-shake polish, glow tuning"); `docs/superpowers/plans/2026-06-25-tempest-wave-3-levels-warp.md` and `docs/superpowers/plans/2026-06-25-tempest-wave-2-full-roster.md` (the format and the systems this builds on). This plan assumes Waves 0–4 are complete: full enemy roster, the `'warp'` mode with spike-crash, the Superzapper (`zap`), HUD, extra-life thresholds, attract/title, game-over + high-score, and start-level select are all already in place.

## Global Constraints

- **Pure core boundary (load-bearing):** Files under `src/core/` MUST NOT import from `src/shell/`, and MUST NOT reference `window`, `document`, `canvas`, `AudioContext`, `Date.now()`, `new Date()`, `performance.now()`, `Math.random()`, or `requestAnimationFrame`. Randomness comes only from `src/core/rng.ts` seeded by `GameState.rng`. Time comes only from the `dt` parameter. **The core emits sound/particle intent as data (`GameEvent`); it never produces a sound, samples wall-clock, or reads the DOM.**
- **The event-channel rule (the one core change):** `GameState.events: GameEvent[]` is populated *during* a step and **cleared at the very start of every `stepGame`** (so events describe exactly the step that just ran). Events are derived deterministically from state + input + `dt` — given identical inputs the same events appear in the same order. Events are the ONLY new gameplay-adjacent field; they MUST NOT influence any later core logic (no sub-stepper reads `s.events`). `cloneState` resets `events` to `[]`.
- **Audio lives only in `src/shell/audio.ts`:** `AudioContext` is created lazily on the first user gesture (browsers block autoplay), and every audio entry point is a graceful no-op when `AudioContext` is unavailable or creation throws. SFX are **synthesized** (oscillator + gain envelopes, filtered noise) in vector-arcade style — no asset files, no network.
- **Particles & screen-shake are SHELL render state, not gameplay:** they live in `src/shell/particles.ts` and `src/shell/loop.ts`, are seeded from drained `GameEvent`s, advanced by real frame time, and drawn in `render.ts`. They MUST NOT feed back into `stepGame` (the sim never sees them) — so they never affect determinism.
- **Per-frame event draining (load-bearing for the fixed-timestep loop):** the loop runs 0..N fixed sim sub-steps per animation frame. Each sub-step overwrites `state.events`. The loop MUST collect events from **every** sub-step into a per-frame list before drawing, or events from all-but-the-last sub-step are lost (e.g. two kills in one frame would drop a sound).
- **Depth convention (unchanged):** `depth ∈ [0, 1]`, `0 = far end`, `1 = near rim`. Enemy-kill and player-death events carry the actor's `lane`/`depth` so the shell can place particles via `project(tube, lane, depth)` and pitch SFX by depth.
- **TypeScript strict:** `"strict": true`, `noUnusedLocals: true`. **Vitest (esbuild) does NOT typecheck — run `npm run build` (`tsc --noEmit && vite build`) as part of every task's verification, not just `npm test`.**
- **Commit cadence:** One commit per task (conventional commit messages). Branch from `main` (`feat/tempest-wave-5-audio-and-polish`). Trunk-based.

---

## File Structure

```
src/core/
  events.ts     # CREATE: GameEvent discriminated union + EnemyKilledEvent etc.
  state.ts      # MODIFY: GameState gains events: GameEvent[]; initialState seeds events: []
  sim.ts        # MODIFY: cloneState resets events:[]; emit() helper; push events at each seam
                #         (fire, kill, player-death, level-clear→warp, warp-arrived, superzapper, extra-life)
src/shell/
  audio.ts      # CREATE: createAudioEngine() — lazy AudioContext, synth SFX, playEvents(events)
  particles.ts  # CREATE: ParticleSystem — spawnFromEvents/update/draw; pure-ish, real-time driven
  render.ts     # MODIFY: draw particles + apply screen-shake transform; final glow constants
  loop.ts       # MODIFY: collect events across sub-steps; feed audio + particles + shake; pass to draw
  main.ts       # MODIFY: construct audio engine + particle system, gate audio on first gesture, wire loop
tests/core/
  events.test.ts            # CREATE: bullet-fired, enemy-killed, player-died, level-clear, extra-life events
  events.determinism.test.ts# CREATE: events cleared each step; identical inputs → identical event stream
src/shell/  (manual / trivial — verified by running the game)
  (audio.ts, particles.ts, render.ts, loop.ts, main.ts have no unit tests; verified via npm run dev + build)
```

### Key interfaces (defined across the tasks below, referenced by all)

```typescript
// core/events.ts
import { EnemyKind } from './state'
export interface BulletFiredEvent  { type: 'bulletFired'; lane: number }
export interface EnemyKilledEvent  { type: 'enemyKilled'; kind: EnemyKind; lane: number; depth: number; points: number }
export interface SpikeHitEvent     { type: 'spikeHit'; lane: number; depth: number }
export interface PlayerDiedEvent   { type: 'playerDied'; lane: number }
export interface LevelClearedEvent { type: 'levelCleared'; level: number }
export interface WarpCompleteEvent { type: 'warpComplete'; level: number }
export interface SuperzapperEvent  { type: 'superzapper'; killed: number }
export interface ExtraLifeEvent    { type: 'extraLife'; lives: number }
export type GameEvent =
  | BulletFiredEvent | EnemyKilledEvent | SpikeHitEvent | PlayerDiedEvent
  | LevelClearedEvent | WarpCompleteEvent | SuperzapperEvent | ExtraLifeEvent

// core/state.ts
export interface GameState { /* ...existing... */ events: GameEvent[] }   // emitted this step; cleared each stepGame

// shell/audio.ts
export interface AudioEngine {
  resume(): void                       // call on first user gesture (creates/resumes the AudioContext)
  playEvents(events: readonly GameEvent[]): void
}
export function createAudioEngine(): AudioEngine

// shell/particles.ts
export interface ParticleSystem {
  spawnFromEvents(events: readonly GameEvent[], tube: Tube): void
  update(dt: number): void
  draw(ctx: CanvasRenderingContext2D): void
  shake(): number                      // current screen-shake magnitude in px (decays to 0)
}
export function createParticleSystem(): ParticleSystem
```

---

## Task 1: The pure-core event channel (`core/events.ts`, `core/state.ts`, `core/sim.ts`)

**Files:**
- Create: `src/core/events.ts`
- Modify: `src/core/state.ts` (`GameState.events`; `initialState` seeds `events: []`)
- Modify: `src/core/sim.ts` (`cloneState` resets `events: []`; `emit` helper; push events at each seam)
- Test: `tests/core/events.test.ts`
- Test: `tests/core/events.determinism.test.ts`

**Interfaces:**
- Consumes: existing `EnemyKind`, `GameState`, `stepGame`, `scoreFor`, `awardScore`, `killPlayer`, `resolveBulletHits`, `stepFiring`, the warp's `checkLevelClear`/`advanceLevel`, and the Superzapper handler.
- Produces: `GameEvent` (discriminated union) and the per-member interfaces; `GameState.events: GameEvent[]`; the invariant that `events` is cleared at the start of every `stepGame` and populated during the step. **This is the only task with unit tests — every later (shell) task consumes `GameState.events`.**

> **Design decision (ADR — chosen approach (a), a pure event channel):** The shell needs to know *when* discrete game moments happen (a kill, a death, a fire, a level clear) to trigger SFX and particles, but the core must stay pure and silent. Two options were considered:
> - **(a) Pure event channel (chosen):** the core appends a typed `GameEvent` to `GameState.events` at each moment, cleared at the top of every `stepGame`. The shell drains it each frame.
> - **(b) Shell state-diffing:** the shell compares successive `GameState`s (enemy count dropped → "something died", `mode` changed → "level cleared") to *infer* events.
>
> **(a) wins.** It is deterministic and **unit-testable** (given a state + input, exactly the right events appear in order — see the tests below), it carries precise data the shell needs (which `kind` died, at what `lane`/`depth`, for how many `points` — so SFX pitch by depth and particles spawn at the right spot), and it cannot mis-count simultaneous events. **(b) is rejected:** diffing is fragile (two kills + one spawn in one frame nets zero count change → a missed explosion), it cannot recover per-event data (which kind? what depth?) without re-deriving core logic in the shell, and it is effectively untestable. The cost of (a) — one array field and a handful of `emit()` calls — is small and contained; the core stays pure because an event is *data describing what happened*, not an effect.

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/core/events.test.ts
import { describe, it, expect } from 'vitest'
import { initialState } from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { Input } from '../../src/core/input'
import { GameEvent } from '../../src/core/events'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }
const FIRE: Input = { spin: 0, fire: true, zap: false, start: false }

function typesOf(events: readonly GameEvent[]): string[] {
  return events.map((e) => e.type)
}

describe('core event channel', () => {
  it('emits a bulletFired event on the step a bullet is fired', () => {
    const s = initialState(1)
    const out = stepGame(s, FIRE, 1 / 60)
    const fired = out.events.filter((e) => e.type === 'bulletFired')
    expect(fired).toHaveLength(1)
    expect(fired[0]).toMatchObject({ type: 'bulletFired', lane: 0 })
  })

  it('does not emit bulletFired when not firing', () => {
    const s = initialState(1)
    const out = stepGame(s, NEUTRAL, 1 / 60)
    expect(typesOf(out.events)).not.toContain('bulletFired')
  })

  it('emits an enemyKilled event carrying kind, lane, depth, and points when a bullet hits', () => {
    const s = initialState(1)
    s.enemies = [{ kind: 'flipper', lane: 0, depth: 0.5, flipTimer: 999 }]
    s.bullets = [{ lane: 0, depth: 0.5 }]
    const out = stepGame(s, NEUTRAL, 1 / 60)
    const kills = out.events.filter((e) => e.type === 'enemyKilled')
    expect(kills).toHaveLength(1)
    expect(kills[0]).toMatchObject({ type: 'enemyKilled', kind: 'flipper', lane: 0, points: 150 })
    expect((kills[0] as { depth: number }).depth).toBeCloseTo(0.5, 5)
  })

  it('emits a playerDied event when an enemy grabs the player', () => {
    const s = initialState(1)
    s.player.lane = 3
    s.enemies = [{ kind: 'flipper', lane: 3, depth: 0.95, flipTimer: 999 }]
    const out = stepGame(s, NEUTRAL, 1 / 60)
    const died = out.events.filter((e) => e.type === 'playerDied')
    expect(died).toHaveLength(1)
    expect(died[0]).toMatchObject({ type: 'playerDied', lane: 3 })
  })

  it('emits a levelCleared event when the last enemy is gone and the budget is empty', () => {
    const s = initialState(1)
    s.spawn.remaining = 0
    s.enemies = []
    const out = stepGame(s, NEUTRAL, 1 / 60)
    expect(typesOf(out.events)).toContain('levelCleared')
    const cleared = out.events.find((e) => e.type === 'levelCleared')
    expect(cleared).toMatchObject({ type: 'levelCleared', level: 1 })
  })

  it('emits an extraLife event when a score award crosses the threshold', () => {
    const s = initialState(1)
    s.score = 9900
    // A flipper kill awards 150 → crosses 10000.
    s.enemies = [{ kind: 'flipper', lane: 0, depth: 0.5, flipTimer: 999 }]
    s.bullets = [{ lane: 0, depth: 0.5 }]
    const out = stepGame(s, NEUTRAL, 1 / 60)
    const extra = out.events.filter((e) => e.type === 'extraLife')
    expect(extra).toHaveLength(1)
    expect(extra[0]).toMatchObject({ type: 'extraLife' })
  })
})
```

```typescript
// tests/core/events.determinism.test.ts
import { describe, it, expect } from 'vitest'
import { initialState } from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { Input } from '../../src/core/input'

const FIRE: Input = { spin: 0, fire: true, zap: false, start: false }
const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }

describe('event channel determinism', () => {
  it('clears events at the start of every step (events describe only the step that just ran)', () => {
    let s = initialState(1)
    s = stepGame(s, FIRE, 1 / 60)        // produces a bulletFired
    expect(s.events.length).toBeGreaterThan(0)
    const next = stepGame(s, NEUTRAL, 1 / 60) // no fire this step
    expect(next.events).toHaveLength(0)  // not carried over from the prior step
  })

  it('does not mutate the input state and leaves its events untouched', () => {
    const s = initialState(1)
    const out = stepGame(s, FIRE, 1 / 60)
    expect(s.events).toHaveLength(0)     // original untouched
    expect(out).not.toBe(s)
  })

  it('produces an identical event stream for identical inputs', () => {
    const inputs: Input[] = [FIRE, NEUTRAL, FIRE, NEUTRAL, NEUTRAL]
    function run(): string[] {
      let s = initialState(42)
      const stream: string[] = []
      for (const i of inputs) {
        s = stepGame(s, i, 1 / 60)
        for (const e of s.events) stream.push(e.type)
      }
      return stream
    }
    expect(run()).toEqual(run())
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/events.test.ts tests/core/events.determinism.test.ts`
Expected: FAIL — `src/core/events.ts` does not exist; `out.events` is `undefined`.

- [ ] **Step 3: Create the event types in `src/core/events.ts`**

```typescript
// src/core/events.ts
// Typed, deterministic record of game moments emitted by the pure sim during a
// single stepGame call. The core emits DATA, never sound — the shell (audio +
// particles) drains GameState.events each frame to trigger SFX and sparks.
import { EnemyKind } from './state'

export interface BulletFiredEvent {
  type: 'bulletFired'
  lane: number
}

export interface EnemyKilledEvent {
  type: 'enemyKilled'
  kind: EnemyKind
  lane: number
  depth: number   // 0 (far) → 1 (near); shell pitches SFX + places particles by depth
  points: number  // score awarded; shell may scale explosion size by points
}

export interface SpikeHitEvent {
  type: 'spikeHit'
  lane: number
  depth: number   // where the bullet struck the spike
}

export interface PlayerDiedEvent {
  type: 'playerDied'
  lane: number    // the Claw's lane at death (for the death burst)
}

export interface LevelClearedEvent {
  type: 'levelCleared'
  level: number   // the level that was just cleared
}

export interface WarpCompleteEvent {
  type: 'warpComplete'
  level: number   // the level just arrived at
}

export interface SuperzapperEvent {
  type: 'superzapper'
  killed: number  // how many enemies this activation destroyed
}

export interface ExtraLifeEvent {
  type: 'extraLife'
  lives: number   // lives total after the award
}

export type GameEvent =
  | BulletFiredEvent
  | EnemyKilledEvent
  | SpikeHitEvent
  | PlayerDiedEvent
  | LevelClearedEvent
  | WarpCompleteEvent
  | SuperzapperEvent
  | ExtraLifeEvent
```

- [ ] **Step 4: Add `events` to `GameState` in `src/core/state.ts`**

Add the import at the top of `src/core/state.ts`:

```typescript
import { GameEvent } from './events'
```

Add the field to the `GameState` interface (after `spawn: SpawnState`):

```typescript
  spawn: SpawnState
  events: GameEvent[]   // emitted during the current step; cleared at the start of each stepGame
  rng: Rng
```

Seed it in `initialState` (after the `spawn:` line):

```typescript
    spawn: spawnForLevel(1),
    events: [],
    rng: makeRng(seed),
```

- [ ] **Step 5: Reset events in `cloneState` and add the `emit` helper in `src/core/sim.ts`**

Add the import at the top of `src/core/sim.ts`:

```typescript
import { GameEvent } from './events'
```

In `cloneState`, **reset** `events` to a fresh empty array (events describe the *current* step, never the prior one — so the clone starts clean):

```typescript
function cloneState(s: GameState): GameState {
  return {
    ...s,
    player: { ...s.player },
    bullets: s.bullets.map((b) => ({ ...b })),
    enemies: s.enemies.map((e) => ({ ...e })),
    spikes: s.spikes.slice(),
    spawn: { ...s.spawn },
    events: [],   // cleared each step; populated during this step's sub-steppers
  }
}
```

Add a tiny `emit` helper just below `cloneState`:

```typescript
function emit(s: GameState, event: GameEvent): void {
  s.events.push(event)
}
```

- [ ] **Step 6: Emit `bulletFired` in `stepFiring`**

In `src/core/sim.ts`, after the bullet is pushed in `stepFiring`:

```typescript
function stepFiring(s: GameState, input: Input): void {
  if (!input.fire || !s.player.alive) return
  if (s.bullets.length >= MAX_BULLETS) return
  const lane = currentLane(s.tube, s.player.lane)
  s.bullets.push({ lane, depth: 1 })
  emit(s, { type: 'bulletFired', lane })
}
```

- [ ] **Step 7: Emit `enemyKilled` in `resolveBulletHits` and `spikeHit` in `resolveSpikeHits`**

In `resolveBulletHits`, capture the score and emit a kill event when a bullet downs an enemy (the enemy's `lane`/`depth`/`kind` are read before it is removed):

```typescript
      if (e.lane === b.lane && Math.abs(e.depth - b.depth) <= HIT_DEPTH) {
        deadBullets.add(bi)
        deadEnemies.add(ei)
        const points = scoreFor(e)
        awardScore(s, points)
        emit(s, { type: 'enemyKilled', kind: e.kind, lane: e.lane, depth: e.depth, points })
        if (e.kind === 'tanker') spawned.push(...splitTanker(e, s.tube, params))
        break
      }
```

In `resolveSpikeHits`, emit a `spikeHit` when a bullet trims a spike:

```typescript
    if (h > 0 && b.depth <= h) {
      s.spikes[b.lane] = Math.max(0, h - SPIKE_SHORTEN)
      dead.add(bi)
      awardScore(s, SCORE_SPIKE_SEGMENT)
      emit(s, { type: 'spikeHit', lane: b.lane, depth: b.depth })
    }
```

- [ ] **Step 8: Emit `extraLife` from `awardScore`**

`awardScore` already detects threshold crossings. Emit one `extraLife` per life gained:

```typescript
function awardScore(s: GameState, points: number): void {
  const before = s.score
  s.score += points
  const crossed = Math.floor(s.score / EXTRA_LIFE_INTERVAL) - Math.floor(before / EXTRA_LIFE_INTERVAL)
  if (crossed > 0) {
    s.lives += crossed
    emit(s, { type: 'extraLife', lives: s.lives })
  }
}
```

- [ ] **Step 9: Emit `playerDied` in `killPlayer`, `levelCleared` at clear, `warpComplete` at warp arrival, and `superzapper` on zap**

`killPlayer` runs for every player death (grab, pulse, warp spike-crash). Emit `playerDied` with the Claw's current lane:

```typescript
function killPlayer(s: GameState): void {
  emit(s, { type: 'playerDied', lane: currentLane(s.tube, s.player.lane) })
  s.player.alive = false
  s.lives -= 1
  if (s.lives <= 0) {
    s.mode = 'gameover'
  } else {
    s.mode = 'dying'
    s.player.respawnTimer = RESPAWN_DELAY
  }
}
```

In `checkLevelClear` (the Wave 3 version enters `'warp'` on clear), emit `levelCleared` carrying the level that was cleared:

```typescript
function checkLevelClear(s: GameState): void {
  if (s.mode !== 'playing') return
  if (s.enemies.length === 0 && s.spawn.remaining === 0) {
    emit(s, { type: 'levelCleared', level: s.level })
    s.mode = 'warp'
    s.warp.progress = 0
    s.bullets = []
  }
}
```

In `advanceLevel` (the Wave 3 helper that finishes the warp into the next level), emit `warpComplete` with the new level:

```typescript
function advanceLevel(s: GameState): void {
  s.level += 1
  s.tube = tubeForLevel(s.level)
  s.spikes = new Array(s.tube.laneCount).fill(0)
  s.player.lane = wrapLane(s.tube, s.player.lane)
  s.warp.progress = 0
  s.mode = 'playing'
  emit(s, { type: 'warpComplete', level: s.level })
  startLevel(s)
}
```

In the Superzapper handler (Wave 4 — wherever `input.zap` destroys enemies), emit a `superzapper` event with the kill count. The handler clears enemies on the first activation and one enemy on the second; capture the count removed and emit:

```typescript
// inside the superzapper branch, after computing `killed` (enemies removed this activation):
emit(s, { type: 'superzapper', killed })
```

> **Note for the implementer:** Wave 4 introduced the Superzapper. Locate the function that consumes `input.zap` (likely `stepSuperzapper(s, input)` or a branch in `stepGame`'s `'playing'` case). Compute `const killed = removed.length` (or `before - s.enemies.length`) before/after the removal and emit the event with that number. Do not emit when `zap` is false or the superzapper is already `'spent'`. If, in your Wave 4 build, individual zapped enemies should also spark, additionally emit one `enemyKilled` per removed enemy here — but the single `superzapper` event is sufficient for the SFX and the screen-shake.

- [ ] **Step 10: Run the tests + full suite + build**

Run: `npx vitest run tests/core/events.test.ts tests/core/events.determinism.test.ts` → PASS
Run: `npm test` → all prior suites still green (events is an additive field; no existing behavior changes)
Run: `npm run build` → tsc clean, exit 0

- [ ] **Step 11: Commit**

```bash
git add src/core/events.ts src/core/state.ts src/core/sim.ts tests/core/events.test.ts tests/core/events.determinism.test.ts
git commit -m "feat(core): deterministic GameEvent channel emitted by the pure sim"
```

---

## Task 2: WebAudio SFX engine (`shell/audio.ts`)

**Files:**
- Create: `src/shell/audio.ts`
- Test: none (shell IO — verified by `npm run build` and by playing the game)

**Interfaces:**
- Consumes: `GameEvent` (from `core/events.ts`), the browser `AudioContext`.
- Produces: `AudioEngine { resume(): void; playEvents(events: readonly GameEvent[]): void }` and `createAudioEngine(): AudioEngine`. Consumed by `main.ts` (gesture gating) and `loop.ts` (per-frame `playEvents`).

> **Shell verification (trivial workflow):** No Vitest — `AudioContext` is a browser API not present in the node test environment. The engine is verified by `npm run build` (tsc must accept the WebAudio types) and by playing the game (`npm run dev`) and confirming each event makes a distinct sound. **Autoplay gating:** browsers refuse to start an `AudioContext` until a user gesture, so the context is created lazily inside `resume()` (called from a `click`/`keydown` handler in Task 5) and every method is a no-op until then and whenever creation fails (headless, disabled audio).

- [ ] **Step 1: Create `src/shell/audio.ts`**

```typescript
// src/shell/audio.ts
// Synthesized vector-arcade SFX over WebAudio. No asset files: each sound is an
// oscillator (or filtered noise) shaped by a short gain envelope. Lives only in
// the shell — the pure core emits GameEvents; this turns them into sound.
//
// Gating: AudioContext is created lazily in resume() (call it from the first
// user gesture) because browsers block autoplay. Every method is a safe no-op
// when WebAudio is unavailable or the context cannot be created/resumed.
import { GameEvent } from '../core/events'

export interface AudioEngine {
  resume(): void
  playEvents(events: readonly GameEvent[]): void
}

// Resolve the constructor across browsers without leaning on `any`.
function getAudioContextCtor(): typeof AudioContext | undefined {
  const w = window as unknown as {
    AudioContext?: typeof AudioContext
    webkitAudioContext?: typeof AudioContext
  }
  return w.AudioContext ?? w.webkitAudioContext
}

export function createAudioEngine(): AudioEngine {
  let ctx: AudioContext | null = null
  let master: GainNode | null = null
  const Ctor = getAudioContextCtor()

  function ensure(): boolean {
    if (ctx) return true
    if (!Ctor) return false
    try {
      ctx = new Ctor()
      master = ctx.createGain()
      master.gain.value = 0.25 // headroom; SFX overlap
      master.connect(ctx.destination)
      return true
    } catch {
      ctx = null
      master = null
      return false
    }
  }

  // A single percussive oscillator blip with an exponential decay envelope.
  function blip(
    type: OscillatorType, freq: number, duration: number, gain: number, sweepTo?: number,
  ): void {
    if (!ctx || !master) return
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const env = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, now)
    if (sweepTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, sweepTo), now + duration)
    env.gain.setValueAtTime(0.0001, now)
    env.gain.exponentialRampToValueAtTime(gain, now + 0.005)
    env.gain.exponentialRampToValueAtTime(0.0001, now + duration)
    osc.connect(env)
    env.connect(master)
    osc.start(now)
    osc.stop(now + duration + 0.02)
  }

  // A short burst of filtered white noise — explosions, the superzapper sweep.
  function noise(duration: number, gain: number, cutoff: number): void {
    if (!ctx || !master) return
    const now = ctx.currentTime
    const frames = Math.max(1, Math.floor(ctx.sampleRate * duration))
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1 // shell-side randomness is fine
    const src = ctx.createBufferSource()
    src.buffer = buffer
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = cutoff
    const env = ctx.createGain()
    env.gain.setValueAtTime(gain, now)
    env.gain.exponentialRampToValueAtTime(0.0001, now + duration)
    src.connect(filter)
    filter.connect(env)
    env.connect(master)
    src.start(now)
    src.stop(now + duration + 0.02)
  }

  function playOne(e: GameEvent): void {
    switch (e.type) {
      case 'bulletFired':
        // Short high zap, pitch wobble for flavor.
        blip('square', 880, 0.08, 0.5, 1320)
        break
      case 'enemyKilled': {
        // Nearer the rim (higher depth) = higher pitch; noisy explosion underneath.
        const base = 200 + e.depth * 500
        blip('sawtooth', base, 0.18, 0.6, base * 0.4)
        noise(0.16, 0.4, 1200)
        break
      }
      case 'spikeHit':
        blip('triangle', 320, 0.06, 0.35)
        break
      case 'playerDied':
        // Descending doom sweep + heavy noise burst.
        blip('sawtooth', 400, 0.7, 0.7, 40)
        noise(0.6, 0.6, 800)
        break
      case 'levelCleared':
        blip('triangle', 523, 0.12, 0.5)
        blip('triangle', 659, 0.12, 0.5)
        break
      case 'warpComplete':
        // Rising whoosh.
        blip('sine', 220, 0.5, 0.5, 1760)
        break
      case 'superzapper':
        // Big downward noise sweep; louder with more kills.
        noise(0.4, Math.min(0.9, 0.4 + e.killed * 0.05), 2400)
        blip('sawtooth', 1200, 0.4, 0.6, 60)
        break
      case 'extraLife':
        blip('square', 784, 0.1, 0.5)
        blip('square', 1047, 0.14, 0.5)
        break
    }
  }

  return {
    resume(): void {
      if (!ensure()) return
      // Some browsers start the context 'suspended' until resume() is called
      // from within a user-gesture handler.
      if (ctx && ctx.state === 'suspended') void ctx.resume()
    },
    playEvents(events: readonly GameEvent[]): void {
      if (!ctx || !master) return // not yet resumed, or audio unavailable
      for (const e of events) playOne(e)
    },
  }
}
```

- [ ] **Step 2: Verify the build**

Run: `npm run build` → tsc clean (WebAudio lib types resolve), exit 0
Run: `npm test` → unchanged (no new tests; core suite green)

- [ ] **Step 3: Commit**

```bash
git add src/shell/audio.ts
git commit -m "feat(shell): synthesized WebAudio SFX engine driven by GameEvents"
```

---

## Task 3: Particle system + screen-shake (`shell/particles.ts`)

**Files:**
- Create: `src/shell/particles.ts`
- Test: none (shell render state — verified by `npm run build` and by playing the game)

**Interfaces:**
- Consumes: `GameEvent` (from `core/events.ts`); `Tube`, `project`, `currentLane` (from `core/geometry.ts`) to place particles at an event's `lane`/`depth`.
- Produces: `ParticleSystem { spawnFromEvents(events, tube); update(dt); draw(ctx); shake(): number }` and `createParticleSystem()`. Consumed by `loop.ts` (spawn + update) and `render.ts` (draw + shake).

> **Shell verification (trivial workflow):** No Vitest — this is render-only state advanced by real frame time and drawn to a canvas. It is seeded from drained `GameEvent`s and **never feeds back into `stepGame`**, so it cannot affect determinism. `Math.random()` is allowed here (shell only). Verified by `npm run build` and by watching explosions/shake while playing.

- [ ] **Step 1: Create `src/shell/particles.ts`**

```typescript
// src/shell/particles.ts
// Shell-only render polish: short-lived spark particles for explosions/death and
// a decaying screen-shake magnitude. Seeded from the core's GameEvents, advanced
// by real frame time, drawn in render.ts. NEVER fed back into the sim, so it has
// no effect on determinism. Math.random() is fine here (shell, not core).
import { GameEvent } from '../core/events'
import { Tube, currentLane, project } from '../core/geometry'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number   // seconds remaining
  maxLife: number
  color: string
  size: number
}

export interface ParticleSystem {
  spawnFromEvents(events: readonly GameEvent[], tube: Tube): void
  update(dt: number): void
  draw(ctx: CanvasRenderingContext2D): void
  shake(): number
}

const ENEMY_SPARK_COLOR: Record<string, string> = {
  flipper: '#ff2bd6',
  tanker: '#39ff14',
  spiker: '#ffa500',
  fuseball: '#ff3030',
  pulsar: '#00e5ff',
}

export function createParticleSystem(): ParticleSystem {
  let particles: Particle[] = []
  let shakeMag = 0

  function burst(x: number, y: number, count: number, color: string, speed: number, life: number): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2
      const v = speed * (0.4 + Math.random() * 0.6)
      particles.push({
        x, y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life, maxLife: life,
        color,
        size: 1 + Math.random() * 2,
      })
    }
  }

  return {
    spawnFromEvents(events: readonly GameEvent[], tube: Tube): void {
      // The render transform translates to canvas center, so particles live in
      // the same centered space project() returns.
      for (const e of events) {
        switch (e.type) {
          case 'enemyKilled': {
            const p = project(tube, e.lane, e.depth)
            const color = ENEMY_SPARK_COLOR[e.kind] ?? '#ffffff'
            burst(p.x, p.y, 14, color, 140, 0.5)
            shakeMag = Math.max(shakeMag, 3)
            break
          }
          case 'playerDied': {
            const lane = currentLane(tube, e.lane)
            const p = project(tube, lane, 1)
            burst(p.x, p.y, 40, '#ffea00', 220, 0.9)
            shakeMag = Math.max(shakeMag, 14)
            break
          }
          case 'superzapper': {
            // A spark ring at the far center plus a strong shake.
            const p = project(tube, 0, 0)
            burst(p.x, p.y, 30, '#ffffff', 260, 0.6)
            shakeMag = Math.max(shakeMag, 10)
            break
          }
          case 'warpComplete':
            shakeMag = Math.max(shakeMag, 6)
            break
          default:
            break // bulletFired/spikeHit/levelCleared/extraLife: audio-only
        }
      }
    },

    update(dt: number): void {
      for (const p of particles) {
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.vx *= 0.92
        p.vy *= 0.92
        p.life -= dt
      }
      particles = particles.filter((p) => p.life > 0)
      // Screen-shake decays exponentially toward 0.
      shakeMag *= Math.pow(0.001, dt) // ~halves every ~70ms
      if (shakeMag < 0.1) shakeMag = 0
    },

    draw(ctx: CanvasRenderingContext2D): void {
      for (const p of particles) {
        const alpha = Math.max(0, p.life / p.maxLife)
        ctx.globalAlpha = alpha
        ctx.fillStyle = p.color
        ctx.shadowColor = p.color
        ctx.shadowBlur = 8
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    },

    shake(): number {
      return shakeMag
    },
  }
}
```

- [ ] **Step 2: Verify the build**

Run: `npm run build` → tsc clean, exit 0
Run: `npm test` → unchanged (core suite green)

- [ ] **Step 3: Commit**

```bash
git add src/shell/particles.ts
git commit -m "feat(shell): event-driven particle system and screen-shake"
```

---

## Task 4: Render particles + screen-shake + final glow tuning (`shell/render.ts`)

**Files:**
- Modify: `src/shell/render.ts` (accept a `ParticleSystem`; apply shake to the centered transform; draw particles; tune glow constants)
- Test: none (shell render — verified by `npm run build` and by playing the game)

**Interfaces:**
- Consumes: `ParticleSystem` (Task 3), the existing `render` draw helpers.
- Produces: a `render` signature that also takes a `ParticleSystem`, applies a shake offset to the centered transform, draws particles inside that transform, and uses tuned glow values.

> **Shell verification (trivial workflow):** No Vitest. The signature of `render` changes to receive the `ParticleSystem` so it can read `shake()` and call `draw()`. The shake offset is applied to the **same** `translate(width/2, height/2)` transform the rest of the scene already uses (so the whole vector scene shakes together); particles are drawn inside that transform because they were spawned in centered space (Task 3). Glow tuning is constant tweaks — verified visually.

- [ ] **Step 1: Add the glow tuning constants and the particle import to `src/shell/render.ts`**

At the top of `src/shell/render.ts`, add the import and a small glow-tuning block. (Keep the existing per-element constants and `ENEMY_COLOR` map; this task layers shake + particles + glow onto the existing render. If Wave 3's `paletteForLevel` landed, keep using it — the only additions here are the import, the shake offset, the particle draw, and the tuned `shadowBlur` values.)

```typescript
// src/shell/render.ts
import { ParticleSystem } from './particles'

// Final vector-CRT glow tuning (Wave 5). Brighter, layered glow for the hero
// elements (Claw, bullets, explosions); slightly softer for the tube so the
// foreground reads. Tuned by eye against the reference look.
const GLOW_TUBE = 14
const GLOW_CLAW = 20
const GLOW_BULLET = 12
const GLOW_ENEMY = 16
```

(Where `drawTube` sets `ctx.shadowBlur = 12`, use `GLOW_TUBE`; in `drawPlayer` use `GLOW_CLAW`; in `drawBullets` use `GLOW_BULLET`; in `drawEnemy` use `GLOW_ENEMY` for the base kinds. These are visual nudges — exact values are tuned while watching the game.)

- [ ] **Step 2: Apply the screen-shake offset and draw particles in `render`**

Replace the `render` function so it takes the `ParticleSystem`, jitters the centered transform by the current shake magnitude, and draws particles inside that transform:

```typescript
export function render(
  ctx: CanvasRenderingContext2D,
  s: GameState,
  width: number,
  height: number,
  particles: ParticleSystem,
): void {
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, width, height)

  // Screen-shake: jitter the whole centered scene by a decaying offset.
  const mag = particles.shake()
  const ox = mag ? (Math.random() * 2 - 1) * mag : 0
  const oy = mag ? (Math.random() * 2 - 1) * mag : 0

  ctx.save()
  ctx.translate(width / 2 + ox, height / 2 + oy)
  drawTube(ctx, s.tube)
  drawSpikes(ctx, s)
  if (s.mode === 'warp') {
    drawWarp(ctx, s)
  } else {
    drawBullets(ctx, s)
    for (const e of s.enemies) drawEnemy(ctx, s, e)
    drawPlayer(ctx, s)
  }
  particles.draw(ctx) // explosions/death sparks, in centered space
  ctx.restore()

  drawHud(ctx, s, width)
  ctx.shadowBlur = 0
}
```

> **Note for the implementer:** the `'warp'` branch and `drawWarp` come from Wave 3; if your render already branches on `s.mode === 'warp'`, keep it and just add `particles.draw(ctx)` before `ctx.restore()` plus the shake offset on the `translate`. If Wave 3 wired `paletteForLevel`, the draw-helper calls will take a `pal` argument — keep those as they are; only the shake offset, the particle draw, and the glow constants are new here.

- [ ] **Step 3: Verify the build**

Run: `npm run build` → tsc will FAIL until `main.ts` passes a `ParticleSystem` to `render` (fixed in Task 5). That is expected mid-task; verify the render file itself has no type errors by checking the tsc output names only `main.ts` as the unresolved caller.
Run: `npm test` → core suite unchanged, green

- [ ] **Step 4: Commit**

```bash
git add src/shell/render.ts
git commit -m "feat(shell): draw event particles, apply screen-shake, tune glow"
```

---

## Task 5: Wire audio + particles into the loop and bootstrap (`shell/loop.ts`, `main.ts`)

**Files:**
- Modify: `src/shell/loop.ts` (collect events across all sub-steps; feed audio + particles; pass particles to `draw`)
- Modify: `src/main.ts` (construct the audio engine + particle system; gate audio on first gesture; wire `render`)
- Test: none (shell integration — verified by `npm run build` and by playing the game)

**Interfaces:**
- Consumes: `AudioEngine`/`createAudioEngine` (Task 2), `ParticleSystem`/`createParticleSystem` (Task 3), the new `render` signature (Task 4), `GameEvent`.
- Produces: a loop that drains per-step events into per-frame audio + particle updates, and a bootstrap that gates audio on a user gesture. This is the integration task that makes `npm run build` green again.

> **Per-frame event draining (load-bearing):** the fixed-timestep loop runs 0..N sim sub-steps per animation frame, and **each `stepGame` overwrites `state.events`**. If the loop only read `state.events` once after the while-loop, every sub-step but the last would be silent (two kills landing in one frame would lose a sound + an explosion). So the loop concatenates each sub-step's events into a per-frame `frameEvents` list, then hands the whole list to audio + particles once before drawing.

- [ ] **Step 1: Collect per-step events in `src/shell/loop.ts` and feed audio + particles**

Replace `src/shell/loop.ts` with the event-aware loop. It takes an `AudioEngine` and a `ParticleSystem`, accumulates events across sub-steps, plays them and spawns particles once per frame, advances particles by the real frame delta, and passes the particle system to `draw`:

```typescript
// src/shell/loop.ts
import { GameState } from '../core/state'
import { Input } from '../core/input'
import { GameEvent } from '../core/events'
import { stepGame } from '../core/sim'
import { AudioEngine } from './audio'
import { ParticleSystem } from './particles'

const STEP = 1 / 60
const MAX_FRAME = 0.25
const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }

export interface Loop {
  start(): void
  stop(): void
  getState(): GameState
}

export function createLoop(
  initial: GameState,
  sampleInput: () => Input,
  draw: (s: GameState, particles: ParticleSystem) => void,
  now: () => number,
  audio: AudioEngine,
  particles: ParticleSystem,
): Loop {
  let state = initial
  let acc = 0
  let last = now()
  let raf = 0

  function frame(): void {
    const t = now()
    let delta = (t - last) / 1000
    last = t
    if (delta > MAX_FRAME) delta = MAX_FRAME
    acc += delta

    const input = sampleInput()
    let first = true
    const frameEvents: GameEvent[] = []
    while (acc >= STEP) {
      // Apply the sampled edges (fire/zap/start/spin) only on the first sub-step
      // so one input event can't fire multiple bullets in a single frame.
      state = stepGame(state, first ? input : NEUTRAL, STEP)
      // Collect events from EVERY sub-step — state.events is overwritten each step.
      for (const e of state.events) frameEvents.push(e)
      acc -= STEP
      first = false
    }

    // Route this frame's events to sound + sparks, then advance + draw.
    audio.playEvents(frameEvents)
    particles.spawnFromEvents(frameEvents, state.tube)
    particles.update(delta)

    draw(state, particles)
    raf = requestAnimationFrame(frame)
  }

  return {
    start(): void {
      last = now()
      raf = requestAnimationFrame(frame)
    },
    stop(): void {
      cancelAnimationFrame(raf)
    },
    getState(): GameState {
      return state
    },
  }
}
```

- [ ] **Step 2: Construct + gate audio and wire the systems in `src/main.ts`**

Replace `src/main.ts` so it builds the audio engine and particle system, resumes audio on the first user gesture (click or keydown — required by autoplay policy), and threads both into the loop and the new `render` signature:

```typescript
// src/main.ts
import { initialState } from './core/state'
import { createInputController } from './shell/input'
import { createLoop } from './shell/loop'
import { render } from './shell/render'
import { createAudioEngine } from './shell/audio'
import { createParticleSystem } from './shell/particles'

const canvas = document.getElementById('game') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!

function resize(): void {
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight
}
window.addEventListener('resize', resize)
resize()

const audio = createAudioEngine()
const particles = createParticleSystem()

// Autoplay policy: the AudioContext can only start from a user gesture. Resume
// on the first click or keydown, then stop listening.
function unlockAudio(): void {
  audio.resume()
  window.removeEventListener('pointerdown', unlockAudio)
  window.removeEventListener('keydown', unlockAudio)
}
window.addEventListener('pointerdown', unlockAudio)
window.addEventListener('keydown', unlockAudio)

const input = createInputController(canvas)
const loop = createLoop(
  initialState(12345),
  () => input.sample(),
  (s, parts) => render(ctx, s, canvas.width, canvas.height, parts),
  () => performance.now(),
  audio,
  particles,
)
loop.start()
```

- [ ] **Step 3: Verify the build, full suite, and the running game**

Run: `npm run build` → tsc clean (the `render` caller now passes a `ParticleSystem`), exit 0
Run: `npm test` → all green (no core behavior changed; only the shell loop/bootstrap were rewired)
Run: `npm run dev` and play, confirming:
- click or press a key once → audio unlocks (first fire makes a sound)
- firing: a short zap; killing an enemy: pitched explosion + a spark burst (pitch rises for rim kills)
- dying: a descending doom sweep + a big spark burst + a heavy screen-shake
- clearing a level / warp arrival: the clear chime / rising whoosh
- superzapper: the noise sweep + ring of sparks + shake
- crossing 10,000 points: the extra-life chime
- with the tab muted or audio blocked, the game still runs (no thrown errors)

- [ ] **Step 4: Commit**

```bash
git add src/shell/loop.ts src/main.ts
git commit -m "feat(shell): drain per-frame events into audio + particles; gate audio on gesture"
```

---

## Self-Review

**Spec coverage** (design doc Wave 5: "WebAudio SFX, particle/screen-shake polish, glow tuning"):

| Spec / brief item | Task |
|-------------------|------|
| Event seam: pure core emits events, shell consumes (the key design problem) | Task 1 (`GameEvent` union, `GameState.events`, emit at every seam; ADR for option (a) vs (b)) |
| WebAudio SFX, synthesized, gesture-gated, graceful no-op | Task 2 (`audio.ts`, lazy `AudioContext`, oscillator/noise SFX) + Task 5 (gesture gating in `main.ts`) |
| Particle explosions (enemy death) + player-death burst | Task 3 (`particles.ts` `spawnFromEvents`) + Task 4 (`render` draws them) |
| Screen-shake | Task 3 (decaying `shakeMag`) + Task 4 (shake offset on the centered transform) |
| Glow tuning | Task 4 (`GLOW_*` constants, layered `shadowBlur`) |
| Events for: enemy killed (kind+depth for pitch/score), bullet fired, player died, level cleared / warp complete, superzapper, extra life | Task 1 (`EnemyKilledEvent` carries kind+depth+points; all listed members defined and emitted) |
| Determinism preserved (events unit-tested; particles/shake never feed back) | Task 1 (`events.determinism.test.ts`) + Task 3 (shell-only, not read by sim) |
| Per-frame event draining across fixed sub-steps | Task 5 (`frameEvents` accumulation in `loop.ts`) |

**Deferred / out of Wave 5 scope:** Continuous/looping ambience (the arcade's idle hum) and per-enemy movement loops are not implemented — only discrete event SFX (faithful enough and far simpler; a looping-oscillator layer can be a later polish pass). Music is out of scope (Tempest has none). Volume/mute UI is deferred (master gain is fixed at 0.25); a settings toggle is a Wave 4-framing follow-up if desired. Playwright smoke tests for audio/particles are not added (browser audio is awkward to assert headlessly); the shell tasks use the manual/`trivial` workflow as the design doc prescribes.

**Type consistency:** `GameEvent` and its members are defined once in `core/events.ts` (Task 1) and consumed unchanged by `audio.ts` (Task 2), `particles.ts` (Task 3), and `loop.ts` (Task 5). `EnemyKilledEvent` carries `{ kind, lane, depth, points }` — emitted with exactly those fields in `resolveBulletHits` (Task 1), read as `e.depth`/`e.kind` for pitch + color in Tasks 2–3. `AudioEngine.playEvents` and `ParticleSystem.spawnFromEvents`/`update`/`draw`/`shake` keep the signatures declared in the Key Interfaces block through their use in `loop.ts` and `render.ts`. The `render` signature gains exactly one parameter (`particles: ParticleSystem`) in Task 4 and is called with it in Task 5 — the one transient build break (Task 4 Step 3) is closed in Task 5 Step 1.

**Purity / determinism check:** the only core change is an additive `events: GameEvent[]` field that is cleared at the top of every step (`cloneState`) and written by `emit()` — no sub-stepper reads it, so it cannot alter gameplay. The core never imports the shell and never touches `AudioContext`/DOM/wall-clock. All audio + particle + shake state lives in the shell, is advanced by real frame time, and is never passed back into `stepGame`, so `stepGame(state, input, dt)` remains a pure, reproducible function and every existing core test stays green.
