# Tempest Wave 2 (Full Roster) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the playable Tempest slice from a Flipper-only game into the full enemy roster — Spikers (+ persistent spikes), Pulsars (electrify their lane), Fuseballs (erratic climbers), and Tankers (split into two of their cargo type) — with authentic per-enemy scoring, extra-life thresholds, and a per-level spawn mix.

**Architecture:** Continue the pure, deterministic `core/` (no DOM, no `Date.now()`, no `Math.random()`, no `requestAnimationFrame`) exposing `stepGame(state, input, dt) → state`. `Enemy` becomes a **discriminated union** keyed by `kind`; each enemy type gets its own pure stepper in `src/core/enemies/`, dispatched by `kind` in `sim.ts`. Spikes live as a per-lane `number[]` height array on `GameState`. The shell renderer gains glyphs for each enemy kind and the spikes. All randomness flows through the seeded RNG carried in `GameState`; all time enters as `dt`.

**Tech Stack:** TypeScript (strict, ES modules), Vite, Vitest (node environment), HTML5 Canvas 2D.

**Reference:** `docs/superpowers/specs/2026-06-24-tempest-clone-design.md` (north-star design); `docs/superpowers/plans/2026-06-24-tempest-wave-0-1-playable-slice.md` (the slice this extends).

## Global Constraints

- **Pure core boundary (load-bearing):** Files under `src/core/` MUST NOT import from `src/shell/`, and MUST NOT reference `window`, `document`, `canvas`, `Date.now()`, `new Date()`, `performance.now()`, `Math.random()`, or `requestAnimationFrame`. Randomness comes only from `src/core/rng.ts` seeded by `GameState.rng`. Time comes only from the `dt` parameter.
- **Determinism:** `stepGame(state, input, dt)` must return identical output for identical input. `stepGame` must NOT mutate its `state` argument (it deep-copies first via `cloneState` and mutates the copy). Every RNG draw threads the new `Rng` back into state (`s.rng = res.rng`).
- **Depth convention:** `depth ∈ [0, 1]`, `0 = far end` (enemy spawn), `1 = near rim` (player). Enemies climb `0 → 1`; bullets travel `1 → 0`.
- **Coordinate space:** core positions are tube space `{ laneIndex, depth }`. Projection lives only in `src/shell/render.ts`. Collision is lane + depth overlap, never pixels.
- **TypeScript strict:** `"strict": true`, `noUnusedLocals: true`, `noUnusedParameters: false`. **Vitest (esbuild) does NOT typecheck — run `npm run build` (tsc) as part of every task's verification, not just `npm test`.**
- **Authentic scoring (pinned against arcade reference):** Spiker = 50, Tanker = 100, Flipper = 150, Pulsar = 200, Fuseball = 250→750 escalating by depth (nearer rim = more), spike segment = 1–3, extra life every 10,000 points.
- **Commit cadence:** One commit per task (conventional commit messages). Branch from `main` after PR #1 (Wave 0/1) merges, or stack on it. This project is trunk-based.

---

## File Structure

```
src/core/
  state.ts            # MODIFY: Enemy → discriminated union; add spikes:number[] to GameState
  rules.ts            # MODIFY: per-kind scores, extra-life interval, spawn table, per-kind level params
  sim.ts              # MODIFY: kind dispatch, spike laying, spike hits, tanker split/arrival, extra-life award
  enemies/
    flipper.ts        # MODIFY: narrow stepFlipper to the Flipper member type
    spiker.ts         # CREATE: stepSpiker (oscillating climb that lays spike)
    pulsar.ts         # CREATE: stepPulsar (climb + flip + pulse cycle)
    fuseball.ts       # CREATE: stepFuseball (erratic climb)
    tanker.ts         # CREATE: stepTanker (climb) + splitTanker (two cargo children)
src/shell/
  render.ts           # MODIFY: per-kind enemy glyphs + spikes + pulsar flash
tests/core/
  enemies/
    roster.types.test.ts   # CREATE: union + spikes spine
    spiker.test.ts         # CREATE
    pulsar.test.ts         # CREATE
    fuseball.test.ts       # CREATE
    tanker.test.ts         # CREATE
  sim.scoring.test.ts      # CREATE: per-kind score + extra life
  sim.spikes.test.ts       # CREATE: spike laying + bullet shortening
  sim.spawn.test.ts        # CREATE: per-level spawn mix
```

### Key interfaces (defined across the tasks below, referenced by all)

```typescript
// core/state.ts
export type EnemyKind = 'flipper' | 'tanker' | 'spiker' | 'fuseball' | 'pulsar'
export type TankerCargo = 'flipper' | 'fuseball' | 'pulsar'
interface EnemyBase { lane: number; depth: number }
export interface Flipper  extends EnemyBase { kind: 'flipper';  flipTimer: number }
export interface Tanker   extends EnemyBase { kind: 'tanker';   contains: TankerCargo }
export interface Spiker   extends EnemyBase { kind: 'spiker';   direction: 1 | -1 }
export interface Fuseball extends EnemyBase { kind: 'fuseball'; jitterTimer: number }
export interface Pulsar   extends EnemyBase { kind: 'pulsar';   flipTimer: number; pulseTimer: number; pulsing: boolean }
export type Enemy = Flipper | Tanker | Spiker | Fuseball | Pulsar
export interface GameState { /* ...existing... */ spikes: number[] }   // per-lane spike height (0 = none)

// core/rules.ts
export const SCORE_SPIKER: number       // 50
export const SCORE_TANKER: number       // 100
export const SCORE_PULSAR: number       // 200
export const SCORE_FUSEBALL_BASE: number// 250
export const SCORE_FUSEBALL_STEP: number// 250 (250/500/750 by depth tier)
export const SCORE_SPIKE_SEGMENT: number// 3
export const EXTRA_LIFE_INTERVAL: number// 10000
export const SPIKE_MAX_DEPTH: number    // 0.75
export const SPIKE_SHORTEN: number      // 0.08
export const PULSE_DURATION: number     // 0.6
export const FUSEBALL_JITTER_INTERVAL: number // 0.3
export const TANKER_SPLIT_DEPTH: number // 0.9
export function scoreFor(enemy: Enemy): number
export function fuseballScore(depth: number): number
export function rollSpawnKind(level: number, rng: Rng): { kind: EnemyKind; rng: Rng }
export function rollTankerCargo(level: number, rng: Rng): { cargo: TankerCargo; rng: Rng }
// LevelParams gains: spikerSpeed, pulseInterval, fuseballSpeed, tankerSpeed

// core/enemies/*
export function stepFlipper(e: Flipper, dt, params, tube, rng): { enemy: Flipper; rng: Rng }
export function stepSpiker(e: Spiker, dt, params): { enemy: Spiker }
export function stepPulsar(e: Pulsar, dt, params, tube, rng): { enemy: Pulsar; rng: Rng }
export function stepFuseball(e: Fuseball, dt, params, tube, rng): { enemy: Fuseball; rng: Rng }
export function stepTanker(e: Tanker, dt, params): { enemy: Tanker }
export function splitTanker(t: Tanker, tube: Tube, params: LevelParams): Enemy[]

// core/sim.ts (internal)
function makeEnemy(kind: EnemyKind, lane: number, depth: number, params: LevelParams, cargo?: TankerCargo): Enemy
function awardScore(s: GameState, points: number): void   // adds score + grants extra lives on 10k crossings
```

---

## Task 1: Enemy discriminated union + spikes field (the spine)

**Files:**
- Modify: `src/core/state.ts`
- Modify: `src/core/sim.ts`
- Modify: `src/core/enemies/flipper.ts`
- Test: `tests/core/enemies/roster.types.test.ts`

**Interfaces:**
- Consumes: existing `GameState`, `stepFlipper`
- Produces: `Enemy` union (`Flipper | Tanker | Spiker | Fuseball | Pulsar`), `EnemyKind`, `TankerCargo`, `GameState.spikes`, and a `kind`-dispatch loop in `stepEnemies` (only `flipper` handled so far)

- [ ] **Step 1: Write the failing test**

```typescript
// tests/core/enemies/roster.types.test.ts
import { describe, it, expect } from 'vitest'
import { initialState } from '../../../src/core/state'
import { stepGame } from '../../../src/core/sim'
import { Input } from '../../../src/core/input'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }

describe('Wave 2 state spine', () => {
  it('initialises an empty per-lane spike array sized to the tube', () => {
    const s = initialState(1)
    expect(s.spikes).toHaveLength(s.tube.laneCount)
    expect(s.spikes.every((h) => h === 0)).toBe(true)
  })

  it('deep-copies spikes — stepGame does not mutate the input array', () => {
    const s = initialState(1)
    s.spikes[3] = 0.5
    const snapshot = [...s.spikes]
    const out = stepGame(s, NEUTRAL, 1 / 60)
    expect(s.spikes).toEqual(snapshot)      // input untouched
    expect(out.spikes).not.toBe(s.spikes)   // output is a distinct array
  })

  it('still spawns and climbs flippers after the union refactor', () => {
    let s = initialState(1)
    for (let i = 0; i < 200; i++) s = stepGame(s, NEUTRAL, 1 / 60)
    expect(s.enemies.length).toBeGreaterThan(0)
    expect(s.enemies.every((e) => e.kind === 'flipper')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/enemies/roster.types.test.ts`
Expected: FAIL — `s.spikes` is `undefined`.

- [ ] **Step 3: Refactor `src/core/state.ts`**

Replace the `EnemyKind` / `Enemy` block and the `GameState` / `initialState` with:

```typescript
export type EnemyKind = 'flipper' | 'tanker' | 'spiker' | 'fuseball' | 'pulsar'
export type TankerCargo = 'flipper' | 'fuseball' | 'pulsar'

interface EnemyBase {
  lane: number          // integer lane
  depth: number         // 0 (far, spawn) → 1 (near rim)
}

export interface Flipper extends EnemyBase {
  kind: 'flipper'
  flipTimer: number     // seconds until next flip
}

export interface Tanker extends EnemyBase {
  kind: 'tanker'
  contains: TankerCargo // what it splits into
}

export interface Spiker extends EnemyBase {
  kind: 'spiker'
  direction: 1 | -1     // climbing (+1) or descending (-1) while laying spike
}

export interface Fuseball extends EnemyBase {
  kind: 'fuseball'
  jitterTimer: number   // seconds until next erratic lane hop
}

export interface Pulsar extends EnemyBase {
  kind: 'pulsar'
  flipTimer: number     // seconds until next flip
  pulseTimer: number    // seconds until the pulse state next toggles
  pulsing: boolean      // true while the lane is electrified
}

export type Enemy = Flipper | Tanker | Spiker | Fuseball | Pulsar
```

Add `spikes` to the `GameState` interface (after `enemies`):

```typescript
  enemies: Enemy[]
  spikes: number[]      // per-lane spike height in depth units (0 = none)
```

And initialise it in `initialState` (after the `enemies: []` line):

```typescript
    enemies: [],
    spikes: new Array(tube.laneCount).fill(0),
```

- [ ] **Step 4: Narrow `src/core/enemies/flipper.ts` to the `Flipper` type**

```typescript
// src/core/enemies/flipper.ts
import { Flipper } from '../state'
import { Rng, rngNext } from '../rng'
import { Tube, wrapLane } from '../geometry'
import { LevelParams } from '../rules'

export function stepFlipper(
  enemy: Flipper, dt: number, params: LevelParams, tube: Tube, rng: Rng,
): { enemy: Flipper; rng: Rng } {
  const e: Flipper = { ...enemy }
  let r = rng

  // Climb toward the near rim.
  e.depth = Math.min(1, e.depth + params.flipperSpeed * dt)

  // Flip across a lane boundary when the timer elapses.
  e.flipTimer -= dt
  if (e.flipTimer <= 0) {
    const roll = rngNext(r)
    r = roll.rng
    const dir = roll.value < 0.5 ? -1 : 1
    e.lane = wrapLane(tube, e.lane + dir)
    e.flipTimer = params.flipInterval
  }

  return { enemy: e, rng: r }
}
```

- [ ] **Step 5: Update `src/core/sim.ts` — clone spikes + dispatch by kind**

Add `Enemy` to the state import:

```typescript
import { GameState, Enemy } from './state'
```

Add spike cloning to `cloneState` (after the `enemies:` line):

```typescript
    enemies: s.enemies.map((e) => ({ ...e })),
    spikes: s.spikes.slice(),
    spawn: { ...s.spawn },
```

Replace the enemy-movement loop in `stepEnemies` (the `const moved = [] … s.enemies = moved` block) with a `kind` dispatch:

```typescript
  // Move every enemy by kind, threading the RNG.
  const moved: Enemy[] = []
  for (const e of s.enemies) {
    switch (e.kind) {
      case 'flipper': {
        const res = stepFlipper(e, dt, params, s.tube, s.rng)
        s.rng = res.rng
        moved.push(res.enemy)
        break
      }
      default:
        moved.push(e) // kinds without a stepper yet (added in later tasks) hold position
    }
  }
  s.enemies = moved
```

- [ ] **Step 6: Run the test + full suite + build**

Run: `npx vitest run tests/core/enemies/roster.types.test.ts` → PASS
Run: `npm test` → all prior tests still green
Run: `npm run build` → tsc clean, exit 0

- [ ] **Step 7: Commit**

```bash
git add src/core/state.ts src/core/sim.ts src/core/enemies/flipper.ts tests/core/enemies/roster.types.test.ts
git commit -m "feat(core): enemy discriminated union + per-lane spikes field"
```

---

## Task 2: Per-kind scoring + extra-life thresholds (`core/rules.ts`, `core/sim.ts`)

**Files:**
- Modify: `src/core/rules.ts`
- Modify: `src/core/sim.ts`
- Test: `tests/core/sim.scoring.test.ts`

**Interfaces:**
- Consumes: `Enemy` (state), existing `SCORE_FLIPPER`
- Produces: `SCORE_SPIKER/TANKER/PULSAR/FUSEBALL_BASE/FUSEBALL_STEP`, `EXTRA_LIFE_INTERVAL`, `scoreFor(enemy)`, `fuseballScore(depth)`; `awardScore(s, points)` in sim; `resolveBulletHits` now awards `scoreFor(e)` and grants extra lives

- [ ] **Step 1: Write the failing test**

```typescript
// tests/core/sim.scoring.test.ts
import { describe, it, expect } from 'vitest'
import { initialState } from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { Input } from '../../src/core/input'
import {
  scoreFor, fuseballScore, SCORE_FLIPPER, SCORE_TANKER, SCORE_SPIKER, SCORE_PULSAR,
} from '../../src/core/rules'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }

describe('scoreFor', () => {
  it('returns the authentic per-kind value', () => {
    expect(scoreFor({ kind: 'flipper', lane: 0, depth: 0.5, flipTimer: 1 })).toBe(SCORE_FLIPPER)
    expect(scoreFor({ kind: 'tanker', lane: 0, depth: 0.5, contains: 'flipper' })).toBe(SCORE_TANKER)
    expect(scoreFor({ kind: 'spiker', lane: 0, depth: 0.5, direction: 1 })).toBe(SCORE_SPIKER)
    expect(scoreFor({ kind: 'pulsar', lane: 0, depth: 0.5, flipTimer: 1, pulseTimer: 1, pulsing: false })).toBe(SCORE_PULSAR)
  })

  it('escalates the fuseball value with depth (250 → 500 → 750)', () => {
    expect(fuseballScore(0.1)).toBe(250)
    expect(fuseballScore(0.5)).toBe(500)
    expect(fuseballScore(0.9)).toBe(750)
  })
})

describe('scoring through a collision', () => {
  it('awards the tanker value when a bullet kills a tanker', () => {
    const s = initialState(1)
    s.spawn.remaining = 0
    s.enemies = [{ kind: 'tanker', lane: 4, depth: 0.5, contains: 'flipper' }]
    s.bullets = [{ lane: 4, depth: 0.5 }]
    const out = stepGame(s, NEUTRAL, 1 / 60)
    expect(out.score).toBe(SCORE_TANKER)
  })

  it('grants an extra life when the score crosses a 10,000 boundary', () => {
    const s = initialState(1)
    s.spawn.remaining = 0
    s.score = 9900
    s.lives = 3
    s.enemies = [{ kind: 'flipper', lane: 4, depth: 0.5, flipTimer: 999 }] // +150 → 10050
    s.bullets = [{ lane: 4, depth: 0.5 }]
    const out = stepGame(s, NEUTRAL, 1 / 60)
    expect(out.score).toBe(10050)
    expect(out.lives).toBe(4)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/sim.scoring.test.ts`
Expected: FAIL — `scoreFor`/`fuseballScore` not exported; extra-life not granted.

- [ ] **Step 3: Add scoring to `src/core/rules.ts`**

Add the `Enemy` import at the top (type-only to avoid a runtime import cycle with `state.ts`):

```typescript
import type { Enemy } from './state'
```

Add the constants (after `SCORE_FLIPPER`):

```typescript
export const SCORE_SPIKER = 50
export const SCORE_TANKER = 100
export const SCORE_PULSAR = 200
export const SCORE_FUSEBALL_BASE = 250
export const SCORE_FUSEBALL_STEP = 250  // 250 / 500 / 750 across depth thirds
export const SCORE_SPIKE_SEGMENT = 3    // points for shortening a spike (arcade: 1–3)
export const EXTRA_LIFE_INTERVAL = 10000
```

Add the scoring functions (at the end of the file):

```typescript
export function fuseballScore(depth: number): number {
  const tier = Math.min(2, Math.max(0, Math.floor(depth * 3))) // 0,1,2
  return SCORE_FUSEBALL_BASE + tier * SCORE_FUSEBALL_STEP
}

export function scoreFor(enemy: Enemy): number {
  switch (enemy.kind) {
    case 'flipper':  return SCORE_FLIPPER
    case 'tanker':   return SCORE_TANKER
    case 'spiker':   return SCORE_SPIKER
    case 'pulsar':   return SCORE_PULSAR
    case 'fuseball': return fuseballScore(enemy.depth)
  }
}
```

- [ ] **Step 4: Update `src/core/sim.ts` — award via `scoreFor`, grant extra lives**

Update the rules import to add `scoreFor` and `EXTRA_LIFE_INTERVAL` (remove `SCORE_FLIPPER`, now unused — `noUnusedLocals` would otherwise fail the build):

```typescript
import {
  SPIN_SENSITIVITY, BULLET_SPEED, MAX_BULLETS, scoreFor, EXTRA_LIFE_INTERVAL,
  PLAYER_RIM_DEPTH, RESPAWN_DELAY, START_LIVES, levelParams, spawnForLevel,
} from './rules'
```

Add the `awardScore` helper (above `resolveBulletHits`):

```typescript
function awardScore(s: GameState, points: number): void {
  const before = s.score
  s.score += points
  const crossed = Math.floor(s.score / EXTRA_LIFE_INTERVAL) - Math.floor(before / EXTRA_LIFE_INTERVAL)
  if (crossed > 0) s.lives += crossed
}
```

In `resolveBulletHits`, replace `s.score += SCORE_FLIPPER` with:

```typescript
        awardScore(s, scoreFor(e))
```

- [ ] **Step 5: Run the test + full suite + build**

Run: `npx vitest run tests/core/sim.scoring.test.ts` → PASS
Run: `npm test` → all green (the existing `sim.collisions` test still expects `SCORE_FLIPPER` for a flipper — `scoreFor(flipper) === SCORE_FLIPPER`)
Run: `npm run build` → exit 0

- [ ] **Step 6: Commit**

```bash
git add src/core/rules.ts src/core/sim.ts tests/core/sim.scoring.test.ts
git commit -m "feat(core): authentic per-kind scoring and extra-life thresholds"
```

---

## Task 3: Spiker + persistent spikes (`core/enemies/spiker.ts`, `core/sim.ts`)

**Files:**
- Create: `src/core/enemies/spiker.ts`
- Modify: `src/core/rules.ts` (add `spikerSpeed`, `SPIKE_MAX_DEPTH`, `SPIKE_SHORTEN`)
- Modify: `src/core/sim.ts` (dispatch spiker, lay spikes, `resolveSpikeHits`)
- Test: `tests/core/enemies/spiker.test.ts`, `tests/core/sim.spikes.test.ts`

**Interfaces:**
- Consumes: `Spiker` (state), `LevelParams`, `awardScore`, `SCORE_SPIKE_SEGMENT`
- Produces: `stepSpiker(e, dt, params) → { enemy }`; `resolveSpikeHits(s)`; spiker `kind` dispatch + spike-laying in `stepEnemies`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/core/enemies/spiker.test.ts
import { describe, it, expect } from 'vitest'
import { stepSpiker } from '../../../src/core/enemies/spiker'
import { levelParams, SPIKE_MAX_DEPTH } from '../../../src/core/rules'

const params = levelParams(1)

describe('stepSpiker', () => {
  it('climbs while direction is +1', () => {
    const out = stepSpiker({ kind: 'spiker', lane: 5, depth: 0.2, direction: 1 }, 1 / 60, params)
    expect(out.enemy.depth).toBeCloseTo(0.2 + params.spikerSpeed / 60)
  })

  it('reverses to descending at the spike-height cap', () => {
    const out = stepSpiker({ kind: 'spiker', lane: 5, depth: SPIKE_MAX_DEPTH - 0.001, direction: 1 }, 1, params)
    expect(out.enemy.depth).toBe(SPIKE_MAX_DEPTH)
    expect(out.enemy.direction).toBe(-1)
  })

  it('reverses to climbing at the far end', () => {
    const out = stepSpiker({ kind: 'spiker', lane: 5, depth: 0.0001, direction: -1 }, 1, params)
    expect(out.enemy.depth).toBe(0)
    expect(out.enemy.direction).toBe(1)
  })
})
```

```typescript
// tests/core/sim.spikes.test.ts
import { describe, it, expect } from 'vitest'
import { initialState } from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { Input } from '../../src/core/input'
import { SCORE_SPIKE_SEGMENT } from '../../src/core/rules'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }

describe('spikes', () => {
  it('a spiker raises the spike height in its lane as it climbs', () => {
    let s = initialState(1)
    s.spawn.remaining = 0
    s.enemies = [{ kind: 'spiker', lane: 6, depth: 0, direction: 1 }]
    for (let i = 0; i < 30; i++) s = stepGame(s, NEUTRAL, 1 / 60)
    expect(s.spikes[6]).toBeGreaterThan(0)
  })

  it('a bullet shortens the spike in its lane and scores', () => {
    const s = initialState(1)
    s.spawn.remaining = 0
    s.spikes[2] = 0.5
    s.bullets = [{ lane: 2, depth: 0.5 }]
    const out = stepGame(s, NEUTRAL, 1 / 60)
    expect(out.spikes[2]).toBeLessThan(0.5)
    expect(out.bullets).toHaveLength(0)
    expect(out.score).toBe(SCORE_SPIKE_SEGMENT)
  })

  it('leaves spikes in other lanes alone', () => {
    const s = initialState(1)
    s.spawn.remaining = 0
    s.spikes[2] = 0.5
    s.bullets = [{ lane: 9, depth: 0.5 }]
    const out = stepGame(s, NEUTRAL, 1 / 60)
    expect(out.spikes[2]).toBe(0.5)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/enemies/spiker.test.ts tests/core/sim.spikes.test.ts`
Expected: FAIL — `stepSpiker` missing; spikes never change.

- [ ] **Step 3: Add params + constants to `src/core/rules.ts`**

Add the constants (near the other spike-related ones):

```typescript
export const SPIKE_MAX_DEPTH = 0.75   // spiker turnaround + spike height cap
export const SPIKE_SHORTEN = 0.08     // depth a single bullet trims off a spike
```

Add `spikerSpeed` to `LevelParams`:

```typescript
export interface LevelParams {
  enemyCount: number
  flipperSpeed: number
  flipInterval: number
  spawnInterval: number
  spikerSpeed: number    // depth units/s for spiker oscillation
}
```

And to the object returned by `levelParams` (before the closing `}`):

```typescript
    spawnInterval: Math.max(0.3, 1.2 / ramp),
    spikerSpeed: 0.22 * ramp,
```

- [ ] **Step 4: Create `src/core/enemies/spiker.ts`**

```typescript
// src/core/enemies/spiker.ts
import { Spiker } from '../state'
import { LevelParams, SPIKE_MAX_DEPTH } from '../rules'

// A spiker oscillates along its lane (climbing, then descending), laying a
// spike up to its high-water mark. Spike laying itself happens in sim.ts.
export function stepSpiker(
  enemy: Spiker, dt: number, params: LevelParams,
): { enemy: Spiker } {
  const e: Spiker = { ...enemy }
  e.depth += e.direction * params.spikerSpeed * dt
  if (e.depth >= SPIKE_MAX_DEPTH) {
    e.depth = SPIKE_MAX_DEPTH
    e.direction = -1
  } else if (e.depth <= 0) {
    e.depth = 0
    e.direction = 1
  }
  return { enemy: e }
}
```

- [ ] **Step 5: Update `src/core/sim.ts`**

Add imports:

```typescript
import { stepSpiker } from './enemies/spiker'
```

Add `SCORE_SPIKE_SEGMENT`, `SPIKE_MAX_DEPTH`, `SPIKE_SHORTEN` to the rules import line.

Add a `spiker` case to the `stepEnemies` dispatch (before `default`), and lay the spike from the moved spiker:

```typescript
      case 'spiker': {
        const res = stepSpiker(e, dt, params)
        const sp = res.enemy
        s.spikes[sp.lane] = Math.min(SPIKE_MAX_DEPTH, Math.max(s.spikes[sp.lane], sp.depth))
        moved.push(sp)
        break
      }
```

Add `resolveSpikeHits` (after `resolveBulletHits`):

```typescript
function resolveSpikeHits(s: GameState): void {
  const dead = new Set<number>()
  s.bullets.forEach((b, bi) => {
    const h = s.spikes[b.lane]
    if (h > 0 && b.depth <= h) {
      s.spikes[b.lane] = Math.max(0, h - SPIKE_SHORTEN)
      dead.add(bi)
      awardScore(s, SCORE_SPIKE_SEGMENT)
    }
  })
  if (dead.size > 0) s.bullets = s.bullets.filter((_, i) => !dead.has(i))
}
```

Call it in the `playing` branch, right after `resolveBulletHits(s)`:

```typescript
      resolveBulletHits(s)
      resolveSpikeHits(s)
```

- [ ] **Step 6: Run tests + full suite + build**

Run: `npx vitest run tests/core/enemies/spiker.test.ts tests/core/sim.spikes.test.ts` → PASS
Run: `npm test` → all green
Run: `npm run build` → exit 0

- [ ] **Step 7: Commit**

```bash
git add src/core/enemies/spiker.ts src/core/rules.ts src/core/sim.ts tests/core/enemies/spiker.test.ts tests/core/sim.spikes.test.ts
git commit -m "feat(core): spikers lay persistent spikes that bullets clear"
```

---

## Task 4: Pulsar — climb, flip, and pulse (`core/enemies/pulsar.ts`, `core/sim.ts`)

**Files:**
- Create: `src/core/enemies/pulsar.ts`
- Modify: `src/core/rules.ts` (add `pulseInterval`, `PULSE_DURATION`)
- Modify: `src/core/sim.ts` (dispatch pulsar; pulse-kill + grabber set in `resolvePlayerHits`)
- Test: `tests/core/enemies/pulsar.test.ts`

**Interfaces:**
- Consumes: `Pulsar` (state), `LevelParams`, `wrapLane`, `rngNext`, `PLAYER_RIM_DEPTH`
- Produces: `stepPulsar(e, dt, params, tube, rng) → { enemy, rng }`; `GRABBER_KINDS`; `resolvePlayerHits` now also kills on a pulse over the player's lane

- [ ] **Step 1: Write the failing test**

```typescript
// tests/core/enemies/pulsar.test.ts
import { describe, it, expect } from 'vitest'
import { initialState } from '../../../src/core/state'
import { stepGame } from '../../../src/core/sim'
import { Input } from '../../../src/core/input'
import { stepPulsar } from '../../../src/core/enemies/pulsar'
import { levelParams } from '../../../src/core/rules'
import { makeRng } from '../../../src/core/rng'
import { makeCircleTube } from '../../../src/core/geometry'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }
const tube = makeCircleTube(16, { x: 0, y: 0 }, 60, 300)
const params = levelParams(1)

describe('stepPulsar', () => {
  it('climbs toward the rim', () => {
    const out = stepPulsar({ kind: 'pulsar', lane: 5, depth: 0.3, flipTimer: 999, pulseTimer: 999, pulsing: false }, 1 / 60, params, tube, makeRng(1))
    expect(out.enemy.depth).toBeGreaterThan(0.3)
  })

  it('flips to an adjacent lane when its flip timer elapses', () => {
    const out = stepPulsar({ kind: 'pulsar', lane: 5, depth: 0.3, flipTimer: 0.001, pulseTimer: 999, pulsing: false }, 1 / 60, params, tube, makeRng(1))
    expect(Math.abs(out.enemy.lane - 5)).toBe(1)
  })

  it('toggles into the pulsing state when its pulse timer elapses', () => {
    const out = stepPulsar({ kind: 'pulsar', lane: 5, depth: 0.3, flipTimer: 999, pulseTimer: 0.001, pulsing: false }, 1 / 60, params, tube, makeRng(1))
    expect(out.enemy.pulsing).toBe(true)
  })
})

describe('pulsar pulse kills the player', () => {
  it('kills the player when a pulse fires on the player lane', () => {
    const s = initialState(1)
    s.spawn.remaining = 0
    s.player.lane = 4
    s.enemies = [{ kind: 'pulsar', lane: 4, depth: 0.4, flipTimer: 999, pulseTimer: 0.001, pulsing: false }]
    const out = stepGame(s, NEUTRAL, 1 / 60) // pulse toggles on, player shares the lane
    expect(out.mode).toBe('dying')
    expect(out.lives).toBe(2)
  })

  it('does not kill when not pulsing', () => {
    const s = initialState(1)
    s.spawn.remaining = 0
    s.player.lane = 4
    s.enemies = [{ kind: 'pulsar', lane: 4, depth: 0.4, flipTimer: 999, pulseTimer: 999, pulsing: false }]
    const out = stepGame(s, NEUTRAL, 1 / 60)
    expect(out.mode).toBe('playing')
    expect(out.lives).toBe(3)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/enemies/pulsar.test.ts`
Expected: FAIL — `stepPulsar` missing; pulses don't kill.

- [ ] **Step 3: Add params to `src/core/rules.ts`**

```typescript
export const PULSE_DURATION = 0.6   // seconds a pulse stays lethal
```

Add `pulseInterval` to `LevelParams`:

```typescript
  spikerSpeed: number
  pulseInterval: number  // seconds between pulsar pulses
```

And to `levelParams`:

```typescript
    spikerSpeed: 0.22 * ramp,
    pulseInterval: Math.max(1.2, 3.0 / ramp),
```

- [ ] **Step 4: Create `src/core/enemies/pulsar.ts`**

```typescript
// src/core/enemies/pulsar.ts
import { Pulsar } from '../state'
import { Rng, rngNext } from '../rng'
import { Tube, wrapLane } from '../geometry'
import { LevelParams, PULSE_DURATION } from '../rules'

// A pulsar climbs and flips like a flipper, and periodically pulses — toggling
// `pulsing` on for PULSE_DURATION (lethal to a player on its lane), then off
// for `pulseInterval`. sim.ts reads `pulsing` to resolve the kill.
export function stepPulsar(
  enemy: Pulsar, dt: number, params: LevelParams, tube: Tube, rng: Rng,
): { enemy: Pulsar; rng: Rng } {
  const e: Pulsar = { ...enemy }
  let r = rng

  // Climb at flipper speed.
  e.depth = Math.min(1, e.depth + params.flipperSpeed * dt)

  // Pulse cycle.
  e.pulseTimer -= dt
  if (e.pulseTimer <= 0) {
    e.pulsing = !e.pulsing
    e.pulseTimer = e.pulsing ? PULSE_DURATION : params.pulseInterval
  }

  // Flip across a lane boundary.
  e.flipTimer -= dt
  if (e.flipTimer <= 0) {
    const roll = rngNext(r)
    r = roll.rng
    const dir = roll.value < 0.5 ? -1 : 1
    e.lane = wrapLane(tube, e.lane + dir)
    e.flipTimer = params.flipInterval
  }

  return { enemy: e, rng: r }
}
```

- [ ] **Step 5: Update `src/core/sim.ts`**

Add imports:

```typescript
import { stepPulsar } from './enemies/pulsar'
import { EnemyKind } from './state'
```

(Combine with the existing `import { GameState, Enemy } from './state'` → `import { GameState, Enemy, EnemyKind } from './state'`.)

Add a `pulsar` case to the dispatch (before `default`):

```typescript
      case 'pulsar': {
        const res = stepPulsar(e, dt, params, s.tube, s.rng)
        s.rng = res.rng
        moved.push(res.enemy)
        break
      }
```

Add the grabber set (module scope, near `HIT_DEPTH`):

```typescript
// Enemies that kill the player by reaching its rim segment. Tankers split
// before the rim; spikers never reach grab depth.
const GRABBER_KINDS: ReadonlySet<EnemyKind> = new Set<EnemyKind>(['flipper', 'fuseball', 'pulsar'])
```

Replace `resolvePlayerHits` with the grabber + pulse version:

```typescript
function resolvePlayerHits(s: GameState): void {
  if (!s.player.alive) return
  const pl = currentLane(s.tube, s.player.lane)
  const grabbed = s.enemies.some(
    (e) => GRABBER_KINDS.has(e.kind) && e.depth >= PLAYER_RIM_DEPTH && e.lane === pl,
  )
  const pulsed = s.enemies.some((e) => e.kind === 'pulsar' && e.pulsing && e.lane === pl)
  if (grabbed || pulsed) killPlayer(s)
}
```

- [ ] **Step 6: Run test + full suite + build**

Run: `npx vitest run tests/core/enemies/pulsar.test.ts` → PASS
Run: `npm test` → all green (existing flipper death test still passes — flipper ∈ GRABBER_KINDS)
Run: `npm run build` → exit 0

- [ ] **Step 7: Commit**

```bash
git add src/core/enemies/pulsar.ts src/core/rules.ts src/core/sim.ts tests/core/enemies/pulsar.test.ts
git commit -m "feat(core): pulsars climb, flip, and electrify their lane on a pulse"
```

---

## Task 5: Fuseball — erratic climber (`core/enemies/fuseball.ts`, `core/sim.ts`)

**Files:**
- Create: `src/core/enemies/fuseball.ts`
- Modify: `src/core/rules.ts` (add `fuseballSpeed`, `FUSEBALL_JITTER_INTERVAL`)
- Modify: `src/core/sim.ts` (dispatch fuseball)
- Test: `tests/core/enemies/fuseball.test.ts`

**Interfaces:**
- Consumes: `Fuseball` (state), `LevelParams`, `wrapLane`, `rngNext`
- Produces: `stepFuseball(e, dt, params, tube, rng) → { enemy, rng }`; fuseball `kind` dispatch. (Fuseball is a grabber — already in `GRABBER_KINDS` from Task 4 — and is scored via `fuseballScore` from Task 2; no extra wiring needed for death/grab.)

> Simplified first cut (per scope decision): the fuseball climbs up a lane center and hops erratically between adjacent lanes; it is always vulnerable. True lane-*boundary* movement and vulnerability windows are a later refinement.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/core/enemies/fuseball.test.ts
import { describe, it, expect } from 'vitest'
import { initialState } from '../../../src/core/state'
import { stepGame } from '../../../src/core/sim'
import { Input } from '../../../src/core/input'
import { stepFuseball } from '../../../src/core/enemies/fuseball'
import { levelParams } from '../../../src/core/rules'
import { makeRng } from '../../../src/core/rng'
import { makeCircleTube } from '../../../src/core/geometry'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }
const tube = makeCircleTube(16, { x: 0, y: 0 }, 60, 300)
const params = levelParams(1)

describe('stepFuseball', () => {
  it('climbs toward the rim', () => {
    const out = stepFuseball({ kind: 'fuseball', lane: 8, depth: 0.2, jitterTimer: 999 }, 1 / 60, params, tube, makeRng(1))
    expect(out.enemy.depth).toBeCloseTo(0.2 + params.fuseballSpeed / 60)
  })

  it('hops to an adjacent lane when the jitter timer elapses', () => {
    const out = stepFuseball({ kind: 'fuseball', lane: 8, depth: 0.5, jitterTimer: 0.001 }, 1 / 60, params, tube, makeRng(1))
    expect([7, 9]).toContain(out.enemy.lane)
  })

  it('is deterministic for a given seed', () => {
    const a = stepFuseball({ kind: 'fuseball', lane: 8, depth: 0.5, jitterTimer: 0.001 }, 1 / 60, params, tube, makeRng(7))
    const b = stepFuseball({ kind: 'fuseball', lane: 8, depth: 0.5, jitterTimer: 0.001 }, 1 / 60, params, tube, makeRng(7))
    expect(a.enemy.lane).toBe(b.enemy.lane)
  })
})

describe('fuseball at the rim', () => {
  it('grabs the player on its lane (lethal contact)', () => {
    const s = initialState(1)
    s.spawn.remaining = 0
    s.player.lane = 3
    s.enemies = [{ kind: 'fuseball', lane: 3, depth: 0.95, jitterTimer: 999 }]
    const out = stepGame(s, NEUTRAL, 1 / 60)
    expect(out.mode).toBe('dying')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/enemies/fuseball.test.ts`
Expected: FAIL — `stepFuseball` missing; the fuseball holds position (default dispatch) so it never climbs to grab depth.

- [ ] **Step 3: Add params to `src/core/rules.ts`**

```typescript
export const FUSEBALL_JITTER_INTERVAL = 0.3  // seconds between erratic lane hops
```

Add `fuseballSpeed` to `LevelParams`:

```typescript
  pulseInterval: number
  fuseballSpeed: number  // depth units/s climb for fuseballs
```

And to `levelParams`:

```typescript
    pulseInterval: Math.max(1.2, 3.0 / ramp),
    fuseballSpeed: 0.26 * ramp,
```

- [ ] **Step 4: Create `src/core/enemies/fuseball.ts`**

```typescript
// src/core/enemies/fuseball.ts
import { Fuseball } from '../state'
import { Rng, rngNext } from '../rng'
import { Tube, wrapLane } from '../geometry'
import { LevelParams, FUSEBALL_JITTER_INTERVAL } from '../rules'

// Simplified first cut: climb a lane center and hop erratically between
// adjacent lanes on a timer. Always vulnerable; lethal on rim contact.
export function stepFuseball(
  enemy: Fuseball, dt: number, params: LevelParams, tube: Tube, rng: Rng,
): { enemy: Fuseball; rng: Rng } {
  const e: Fuseball = { ...enemy }
  let r = rng

  e.depth = Math.min(1, e.depth + params.fuseballSpeed * dt)

  e.jitterTimer -= dt
  if (e.jitterTimer <= 0) {
    const roll = rngNext(r)
    r = roll.rng
    const dir = roll.value < 0.5 ? -1 : 1
    e.lane = wrapLane(tube, e.lane + dir)
    e.jitterTimer = FUSEBALL_JITTER_INTERVAL
  }

  return { enemy: e, rng: r }
}
```

- [ ] **Step 5: Update `src/core/sim.ts`**

Add import:

```typescript
import { stepFuseball } from './enemies/fuseball'
```

Add a `fuseball` case to the dispatch (before `default`):

```typescript
      case 'fuseball': {
        const res = stepFuseball(e, dt, params, s.tube, s.rng)
        s.rng = res.rng
        moved.push(res.enemy)
        break
      }
```

- [ ] **Step 6: Run test + full suite + build**

Run: `npx vitest run tests/core/enemies/fuseball.test.ts` → PASS
Run: `npm test` → all green
Run: `npm run build` → exit 0

- [ ] **Step 7: Commit**

```bash
git add src/core/enemies/fuseball.ts src/core/rules.ts src/core/sim.ts tests/core/enemies/fuseball.test.ts
git commit -m "feat(core): fuseballs climb erratically and grab at the rim"
```

---

## Task 6: Tanker — split into two cargo enemies (`core/enemies/tanker.ts`, `core/sim.ts`)

**Files:**
- Create: `src/core/enemies/tanker.ts`
- Modify: `src/core/rules.ts` (add `tankerSpeed`, `TANKER_SPLIT_DEPTH`)
- Modify: `src/core/sim.ts` (`makeEnemy` factory; dispatch tanker; split-on-death in `resolveBulletHits`; `resolveTankerArrivals`)
- Test: `tests/core/enemies/tanker.test.ts`

**Interfaces:**
- Consumes: `Tanker`/`Enemy`/`TankerCargo` (state), `LevelParams`, `wrapLane`, `scoreFor`
- Produces: `stepTanker(e, dt, params) → { enemy }`; `splitTanker(t, tube, params) → Enemy[]`; `makeEnemy(kind, lane, depth, params, cargo?)` in sim; tankers split into two cargo enemies on death or on reaching the rim

- [ ] **Step 1: Write the failing test**

```typescript
// tests/core/enemies/tanker.test.ts
import { describe, it, expect } from 'vitest'
import { initialState } from '../../../src/core/state'
import { stepGame } from '../../../src/core/sim'
import { Input } from '../../../src/core/input'
import { stepTanker } from '../../../src/core/enemies/tanker'
import { levelParams, SCORE_TANKER } from '../../../src/core/rules'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }
const params = levelParams(1)

describe('stepTanker', () => {
  it('climbs toward the rim', () => {
    const out = stepTanker({ kind: 'tanker', lane: 4, depth: 0.2, contains: 'flipper' }, 1 / 60, params)
    expect(out.enemy.depth).toBeCloseTo(0.2 + params.tankerSpeed / 60)
  })
})

describe('tanker splitting', () => {
  it('splits into two cargo enemies when shot, and scores the tanker', () => {
    const s = initialState(1)
    s.spawn.remaining = 0
    s.enemies = [{ kind: 'tanker', lane: 4, depth: 0.5, contains: 'flipper' }]
    s.bullets = [{ lane: 4, depth: 0.5 }]
    const out = stepGame(s, NEUTRAL, 1 / 60)
    expect(out.enemies).toHaveLength(2)
    expect(out.enemies.every((e) => e.kind === 'flipper')).toBe(true)
    expect(out.score).toBe(SCORE_TANKER)
  })

  it('places the two children on adjacent lanes at the tanker depth', () => {
    const s = initialState(1)
    s.spawn.remaining = 0
    s.enemies = [{ kind: 'tanker', lane: 4, depth: 0.5, contains: 'flipper' }]
    s.bullets = [{ lane: 4, depth: 0.5 }]
    const out = stepGame(s, NEUTRAL, 1 / 60)
    const lanes = out.enemies.map((e) => e.lane).sort((a, b) => a - b)
    expect(lanes).toEqual([4, 5])
  })

  it('splits when it reaches the rim instead of grabbing the player', () => {
    const s = initialState(1)
    s.spawn.remaining = 0
    s.player.lane = 4
    s.enemies = [{ kind: 'tanker', lane: 4, depth: 0.95, contains: 'flipper' }]
    const out = stepGame(s, NEUTRAL, 1 / 60)
    expect(out.mode).toBe('playing')                 // tanker does not grab
    expect(out.enemies).toHaveLength(2)
    expect(out.enemies.every((e) => e.kind === 'flipper')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/enemies/tanker.test.ts`
Expected: FAIL — `stepTanker` missing; tankers never split.

- [ ] **Step 3: Add params to `src/core/rules.ts`**

```typescript
export const TANKER_SPLIT_DEPTH = 0.9  // tankers split at/after this depth
```

Add `tankerSpeed` to `LevelParams`:

```typescript
  fuseballSpeed: number
  tankerSpeed: number    // depth units/s climb for tankers
```

And to `levelParams`:

```typescript
    fuseballSpeed: 0.26 * ramp,
    tankerSpeed: 0.14 * ramp,
```

- [ ] **Step 4: Create `src/core/enemies/tanker.ts`**

```typescript
// src/core/enemies/tanker.ts
import { Tanker, Enemy } from '../state'
import { Tube, wrapLane } from '../geometry'
import { LevelParams } from '../rules'
import { makeEnemy } from '../sim'

// Children appear just below grab depth (PLAYER_RIM_DEPTH = 0.92) so a tanker
// that splits AT the rim does not instantly grab the player on the same frame.
const SPLIT_CHILD_DEPTH = 0.85

export function stepTanker(
  enemy: Tanker, dt: number, params: LevelParams,
): { enemy: Tanker } {
  const e: Tanker = { ...enemy }
  e.depth = Math.min(1, e.depth + params.tankerSpeed * dt)
  return { enemy: e }
}

// Two cargo enemies on adjacent lanes at the tanker's depth (capped just below
// the rim so a rim-split is not an instant grab).
export function splitTanker(t: Tanker, tube: Tube, params: LevelParams): Enemy[] {
  const depth = Math.min(t.depth, SPLIT_CHILD_DEPTH)
  return [
    makeEnemy(t.contains, t.lane, depth, params),
    makeEnemy(t.contains, wrapLane(tube, t.lane + 1), depth, params),
  ]
}
```

- [ ] **Step 5: Update `src/core/sim.ts`**

Add imports:

```typescript
import { stepTanker, splitTanker } from './enemies/tanker'
import { TankerCargo } from './state'
```

(Combine with the existing state import → `import { GameState, Enemy, EnemyKind, TankerCargo } from './state'`.)

Add `TANKER_SPLIT_DEPTH`, `levelParams` are already imported; ensure `TANKER_SPLIT_DEPTH` is added to the rules import line.

Add the `makeEnemy` factory (module scope, above `stepEnemies`). **Exported** because `tanker.ts` imports it:

```typescript
export function makeEnemy(
  kind: EnemyKind, lane: number, depth: number, params: LevelParams, cargo: TankerCargo = 'flipper',
): Enemy {
  switch (kind) {
    case 'flipper':  return { kind, lane, depth, flipTimer: params.flipInterval }
    case 'tanker':   return { kind, lane, depth, contains: cargo }
    case 'spiker':   return { kind, lane, depth, direction: 1 }
    case 'fuseball': return { kind, lane, depth, jitterTimer: 0 }
    case 'pulsar':   return { kind, lane, depth, flipTimer: params.flipInterval, pulseTimer: params.pulseInterval, pulsing: false }
  }
}
```

Add a `tanker` case to the dispatch (before `default`):

```typescript
      case 'tanker': {
        const res = stepTanker(e, dt, params)
        moved.push(res.enemy)
        break
      }
```

Make `resolveBulletHits` split tankers on death. Replace the function body so a killed tanker queues its children (note: it now reads `levelParams(s.level)` for `splitTanker`):

```typescript
function resolveBulletHits(s: GameState): void {
  const params = levelParams(s.level)
  const deadBullets = new Set<number>()
  const deadEnemies = new Set<number>()
  const spawned: Enemy[] = []
  s.bullets.forEach((b, bi) => {
    if (deadBullets.has(bi)) return
    for (let ei = 0; ei < s.enemies.length; ei++) {
      if (deadEnemies.has(ei)) continue
      const e = s.enemies[ei]
      if (e.lane === b.lane && Math.abs(e.depth - b.depth) <= HIT_DEPTH) {
        deadBullets.add(bi)
        deadEnemies.add(ei)
        awardScore(s, scoreFor(e))
        if (e.kind === 'tanker') spawned.push(...splitTanker(e, s.tube, params))
        break
      }
    }
  })
  if (deadBullets.size > 0) s.bullets = s.bullets.filter((_, i) => !deadBullets.has(i))
  if (deadEnemies.size > 0) s.enemies = s.enemies.filter((_, i) => !deadEnemies.has(i))
  if (spawned.length > 0) s.enemies = s.enemies.concat(spawned)
}
```

Add `resolveTankerArrivals` (after `resolveSpikeHits`):

```typescript
function resolveTankerArrivals(s: GameState): void {
  if (!s.enemies.some((e) => e.kind === 'tanker' && e.depth >= TANKER_SPLIT_DEPTH)) return
  const params = levelParams(s.level)
  const survivors: Enemy[] = []
  const spawned: Enemy[] = []
  for (const e of s.enemies) {
    if (e.kind === 'tanker' && e.depth >= TANKER_SPLIT_DEPTH) {
      spawned.push(...splitTanker(e, s.tube, params))
    } else {
      survivors.push(e)
    }
  }
  s.enemies = survivors.concat(spawned)
}
```

Call it in the `playing` branch, after `resolveSpikeHits(s)` and before `resolvePlayerHits(s)`:

```typescript
      resolveBulletHits(s)
      resolveSpikeHits(s)
      resolveTankerArrivals(s)
      resolvePlayerHits(s)
```

> **Note on the import cycle:** `sim.ts` imports `splitTanker` from `tanker.ts`, and `tanker.ts` imports `makeEnemy` from `sim.ts`. This value cycle is safe here because `makeEnemy` is only *called* at runtime (inside `splitTanker`), never at module-eval time, so both modules finish initialising before either function runs. Keep `makeEnemy` a plain function declaration (hoisted), not a `const` arrow.

- [ ] **Step 6: Run test + full suite + build**

Run: `npx vitest run tests/core/enemies/tanker.test.ts` → PASS
Run: `npm test` → all green
Run: `npm run build` → exit 0 (verifies the cross-module cycle typechecks)

- [ ] **Step 7: Commit**

```bash
git add src/core/enemies/tanker.ts src/core/rules.ts src/core/sim.ts tests/core/enemies/tanker.test.ts
git commit -m "feat(core): tankers split into two cargo enemies on death or at the rim"
```

---

## Task 7: Per-level spawn mix (`core/rules.ts`, `core/sim.ts`)

**Files:**
- Modify: `src/core/rules.ts` (`rollSpawnKind`, `rollTankerCargo`)
- Modify: `src/core/sim.ts` (spawn via the table + `makeEnemy`)
- Test: `tests/core/sim.spawn.test.ts`

**Interfaces:**
- Consumes: `Rng`/`rngNext` (rng), `EnemyKind`/`TankerCargo` (state), `makeEnemy` (sim)
- Produces: `rollSpawnKind(level, rng) → { kind, rng }`, `rollTankerCargo(level, rng) → { cargo, rng }`; `stepEnemies` now spawns a level-appropriate mix

- [ ] **Step 1: Write the failing test**

```typescript
// tests/core/sim.spawn.test.ts
import { describe, it, expect } from 'vitest'
import { initialState } from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { Input } from '../../src/core/input'
import { rollSpawnKind } from '../../src/core/rules'
import { makeRng } from '../../src/core/rng'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }

function spawnedKinds(level: number, seed: number): Set<string> {
  let s = initialState(seed)
  s.level = level
  s.spawn = { remaining: 40, timer: 0 }
  const kinds = new Set<string>()
  for (let i = 0; i < 6000; i++) {
    s = stepGame(s, NEUTRAL, 1 / 60)
    for (const e of s.enemies) kinds.add(e.kind)
  }
  return kinds
}

describe('rollSpawnKind', () => {
  it('only rolls flippers at level 1', () => {
    let r = makeRng(123)
    for (let i = 0; i < 100; i++) {
      const res = rollSpawnKind(1, r)
      expect(res.kind).toBe('flipper')
      r = res.rng
    }
  })

  it('introduces tankers and spikers by level 3', () => {
    let r = makeRng(123)
    const kinds = new Set<string>()
    for (let i = 0; i < 200; i++) {
      const res = rollSpawnKind(3, r)
      kinds.add(res.kind)
      r = res.rng
    }
    expect(kinds.has('tanker')).toBe(true)
    expect(kinds.has('spiker')).toBe(true)
  })
})

describe('spawn mix through the sim', () => {
  it('level 1 spawns only flippers', () => {
    expect(spawnedKinds(1, 1)).toEqual(new Set(['flipper']))
  })

  it('a high level spawns a varied roster', () => {
    const kinds = spawnedKinds(6, 1)
    expect(kinds.size).toBeGreaterThan(1)
    expect(kinds.has('flipper')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/sim.spawn.test.ts`
Expected: FAIL — `rollSpawnKind` not exported; the sim still spawns only flippers, so the high-level variety assertion fails.

- [ ] **Step 3: Add the spawn table to `src/core/rules.ts`**

Add the rng import, and extend the existing `import type { Enemy } from './state'` line (from Task 2) to also bring in `EnemyKind` and `TankerCargo`:

```typescript
import { Rng, rngNext } from './rng'
import type { Enemy, EnemyKind, TankerCargo } from './state'   // was: import type { Enemy } …
```

Add the two rollers (at the end of the file):

```typescript
function weightedPick<T>(table: ReadonlyArray<readonly [T, number]>, rng: Rng): { value: T; rng: Rng } {
  const total = table.reduce((sum, [, w]) => sum + w, 0)
  const roll = rngNext(rng)
  let pick = roll.value * total
  for (const [value, w] of table) {
    if (w <= 0) continue
    pick -= w
    if (pick < 0) return { value, rng: roll.rng }
  }
  return { value: table[0][0], rng: roll.rng }
}

export function rollSpawnKind(level: number, rng: Rng): { kind: EnemyKind; rng: Rng } {
  const table: ReadonlyArray<readonly [EnemyKind, number]> = [
    ['flipper', 10],
    ['tanker', level >= 3 ? 4 : 0],
    ['spiker', level >= 3 ? 3 : 0],
    ['pulsar', level >= 5 ? 3 : 0],
    ['fuseball', level >= 5 ? 3 : 0],
  ]
  const res = weightedPick(table, rng)
  return { kind: res.value, rng: res.rng }
}

export function rollTankerCargo(level: number, rng: Rng): { cargo: TankerCargo; rng: Rng } {
  const table: ReadonlyArray<readonly [TankerCargo, number]> = [
    ['flipper', 10],
    ['fuseball', level >= 5 ? 4 : 0],
    ['pulsar', level >= 5 ? 4 : 0],
  ]
  const res = weightedPick(table, rng)
  return { cargo: res.value, rng: res.rng }
}
```

- [ ] **Step 4: Update `src/core/sim.ts` to spawn via the table**

Add `rollSpawnKind, rollTankerCargo` to the rules import line.

Replace the spawn block in `stepEnemies` (the `if (s.spawn.remaining > 0) { … }` body) with:

```typescript
  if (s.spawn.remaining > 0) {
    s.spawn.timer -= dt
    if (s.spawn.timer <= 0) {
      const kindRoll = rollSpawnKind(s.level, s.rng)
      s.rng = kindRoll.rng
      const laneRoll = rngInt(s.rng, s.tube.laneCount)
      s.rng = laneRoll.rng
      let cargo: TankerCargo = 'flipper'
      if (kindRoll.kind === 'tanker') {
        const cargoRoll = rollTankerCargo(s.level, s.rng)
        s.rng = cargoRoll.rng
        cargo = cargoRoll.cargo
      }
      s.enemies.push(makeEnemy(kindRoll.kind, laneRoll.value, 0, params, cargo))
      s.spawn.remaining -= 1
      s.spawn.timer = params.spawnInterval
    }
  }
```

- [ ] **Step 5: Run test + full suite + build**

Run: `npx vitest run tests/core/sim.spawn.test.ts` → PASS
Run: `npm test` → all green (the existing `flipper.spawn` test still sees only flippers at level 1)
Run: `npm run build` → exit 0

- [ ] **Step 6: Commit**

```bash
git add src/core/rules.ts src/core/sim.ts tests/core/sim.spawn.test.ts
git commit -m "feat(core): per-level weighted spawn mix across the full roster"
```

---

## Task 8: Render the full roster + spikes (`shell/render.ts`)

**Files:**
- Modify: `src/shell/render.ts`

**Interfaces:**
- Consumes: `project` (geometry), `GameState`/`Enemy` (state)
- Produces: distinct glyphs per enemy kind, the per-lane spikes, and a pulsar flash. Shell rendering is verified by running; all sim behavior it depends on is already covered by Tasks 1–7.

- [ ] **Step 1: Replace `src/shell/render.ts` with the roster-aware renderer**

```typescript
// src/shell/render.ts
import { GameState, Enemy } from '../core/state'
import { Tube, currentLane, project } from '../core/geometry'

const TUBE_COLOR = '#1e90ff'
const CLAW_COLOR = '#ffea00'
const BULLET_COLOR = '#ffffff'
const SPIKE_COLOR = '#8a2be2'

const ENEMY_COLOR: Record<Enemy['kind'], string> = {
  flipper: '#ff2bd6',
  tanker: '#39ff14',
  spiker: '#ffa500',
  fuseball: '#ff3030',
  pulsar: '#00e5ff',
}

function strokePoly(
  ctx: CanvasRenderingContext2D, pts: readonly { x: number; y: number }[], closed: boolean,
): void {
  if (pts.length === 0) return
  ctx.beginPath()
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
  if (closed) ctx.closePath()
  ctx.stroke()
}

function drawTube(ctx: CanvasRenderingContext2D, tube: Tube): void {
  ctx.lineWidth = 2
  ctx.strokeStyle = TUBE_COLOR
  ctx.shadowColor = TUBE_COLOR
  ctx.shadowBlur = 12
  strokePoly(ctx, tube.far, tube.closed)
  strokePoly(ctx, tube.near, tube.closed)
  for (let i = 0; i < tube.far.length; i++) {
    ctx.beginPath()
    ctx.moveTo(tube.far[i].x, tube.far[i].y)
    ctx.lineTo(tube.near[i].x, tube.near[i].y)
    ctx.stroke()
  }
}

function drawSpikes(ctx: CanvasRenderingContext2D, s: GameState): void {
  ctx.lineWidth = 2
  ctx.strokeStyle = SPIKE_COLOR
  ctx.shadowColor = SPIKE_COLOR
  ctx.shadowBlur = 10
  for (let lane = 0; lane < s.spikes.length; lane++) {
    const h = s.spikes[lane]
    if (h <= 0) continue
    const a = project(s.tube, lane, 0)
    const b = project(s.tube, lane, h)
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
  }
}

function drawBullets(ctx: CanvasRenderingContext2D, s: GameState): void {
  ctx.fillStyle = BULLET_COLOR
  ctx.shadowColor = BULLET_COLOR
  ctx.shadowBlur = 10
  for (const b of s.bullets) {
    const p = project(s.tube, b.lane, b.depth)
    ctx.beginPath()
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawEnemy(ctx: CanvasRenderingContext2D, s: GameState, e: Enemy): void {
  const p = project(s.tube, e.lane, e.depth)
  const r = 5 + e.depth * 9 // grows as it nears the rim
  const color = ENEMY_COLOR[e.kind]
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.shadowColor = color
  ctx.lineWidth = 2

  switch (e.kind) {
    case 'flipper': // diamond (matches Wave 1)
      ctx.shadowBlur = 14
      ctx.beginPath()
      ctx.moveTo(p.x - r, p.y)
      ctx.lineTo(p.x, p.y - r)
      ctx.lineTo(p.x + r, p.y)
      ctx.lineTo(p.x, p.y + r)
      ctx.closePath()
      ctx.stroke()
      break
    case 'tanker': // square box
      ctx.shadowBlur = 14
      ctx.strokeRect(p.x - r, p.y - r, r * 2, r * 2)
      break
    case 'spiker': // spinning cross
      ctx.shadowBlur = 12
      ctx.beginPath()
      ctx.moveTo(p.x - r, p.y); ctx.lineTo(p.x + r, p.y)
      ctx.moveTo(p.x, p.y - r); ctx.lineTo(p.x, p.y + r)
      ctx.stroke()
      break
    case 'fuseball': // filled crackling ball
      ctx.shadowBlur = 16
      ctx.beginPath()
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
      ctx.fill()
      break
    case 'pulsar': // ring, bright while pulsing
      ctx.shadowBlur = e.pulsing ? 28 : 12
      ctx.lineWidth = e.pulsing ? 4 : 2
      ctx.beginPath()
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
      ctx.stroke()
      break
  }
}

function drawPlayer(ctx: CanvasRenderingContext2D, s: GameState): void {
  if (!s.player.alive) return
  const lane = currentLane(s.tube, s.player.lane)
  const p = project(s.tube, lane, 1.0)
  ctx.lineWidth = 3
  ctx.strokeStyle = CLAW_COLOR
  ctx.shadowColor = CLAW_COLOR
  ctx.shadowBlur = 16
  ctx.beginPath()
  ctx.arc(p.x, p.y, 10, 0, Math.PI * 2)
  ctx.stroke()
}

function drawHud(ctx: CanvasRenderingContext2D, s: GameState, width: number): void {
  ctx.shadowBlur = 0
  ctx.fillStyle = '#ffffff'
  ctx.font = '20px monospace'
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  ctx.fillText(`SCORE ${s.score}`, 16, 16)
  ctx.fillText(`LEVEL ${s.level}`, 16, 40)
  ctx.textAlign = 'right'
  ctx.fillText(`LIVES ${s.lives}`, width - 16, 16)

  if (s.mode === 'gameover') {
    ctx.textAlign = 'center'
    ctx.font = '48px monospace'
    ctx.fillText('GAME OVER', width / 2, 80)
    ctx.font = '20px monospace'
    ctx.fillText('press ENTER to restart', width / 2, 140)
  }
}

export function render(
  ctx: CanvasRenderingContext2D, s: GameState, width: number, height: number,
): void {
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, width, height)
  ctx.save()
  ctx.translate(width / 2, height / 2)
  drawTube(ctx, s.tube)
  drawSpikes(ctx, s)
  drawBullets(ctx, s)
  for (const e of s.enemies) drawEnemy(ctx, s, e)
  drawPlayer(ctx, s)
  ctx.restore()
  drawHud(ctx, s, width)
  ctx.shadowBlur = 0
}
```

- [ ] **Step 2: Verify the build typechecks**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 3: Verify the full Wave 2 roster visually**

Run: `npm run dev`, open the URL. Play into the higher levels (or temporarily raise the starting level in `main.ts`'s `initialState` call, then revert). Expected, with no console errors:
- Green **tankers** climb and, when shot or at the rim, burst into two enemies.
- Orange **spikers** oscillate in a lane leaving a growing purple **spike**; shooting the spike trims it from the tip and scores.
- Red **fuseballs** climb while hopping erratically between adjacent lanes; lethal at the rim.
- Cyan **pulsars** flip like flippers and flare brightly when they pulse; standing on a pulsing lane costs a life.
- The HUD score reflects authentic values; crossing 10,000 grants an extra life.

Stop the server.

- [ ] **Step 4: Run the full test suite + build**

Run: `npm test` → all tests pass.
Run: `npm run build` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/shell/render.ts
git commit -m "feat(shell): render the full enemy roster and spikes (Wave 2)"
```

---

## Self-Review

**1. Spec coverage (Wave 2 requirements from the design doc):**

| Spec requirement | Task(s) |
|---|---|
| `Enemy` tagged union by type | 1 |
| Spikes persist per-lane; bullets shorten/clear them | 1 (field), 3 (lay + clear) |
| Spikes harmless during normal play (warp death deferred to Wave 3) | 3 (no spike→player kill exists) |
| Spiker travels a lane laying a growing spike; killed by bullets | 3 (+ collision from Wave 1 generalised in 2) |
| Pulsar climbs, flips, and pulses (electrifies its lane → player dies) | 4 |
| Fuseball erratic climber, lethal at rim (simplified first cut) | 5 |
| Tanker splits into two of its cargo (Flipper/Fuseball/Pulsar) on death or at rim | 6 |
| Authentic per-enemy scoring + extra-life thresholds | 2 (+ used everywhere score changes) |
| Per-level spawn mix of the roster | 7 |
| Distinct vector glyphs per enemy + spikes rendered | 8 |
| Pure deterministic core; RNG threaded; no DOM/time/random | all (Global Constraints; verified by `npm run build` + determinism tests) |

Items deferred to later waves per the design doc and the agreed Wave 2 scope — the **warp** and spike-kills-during-warp, the 16 geometries + color cycling (Wave 3), true fuseball lane-*boundary* movement + vulnerability windows (later refinement), Superzapper + framing (Wave 4), audio (Wave 5) — are **out of scope** here.

**2. Placeholder scan:** No `TBD`/`TODO`/"handle edge cases"/"similar to Task N" — every code and test step contains complete content. The `default` arm in `stepEnemies` is intentional (defensive hold-position for any not-yet-dispatched kind) and harmless once all five cases exist.

**3. Type consistency:** Signatures match the "Key interfaces" block across tasks — `stepFlipper/stepPulsar/stepFuseball(e, dt, params, tube, rng) → {enemy, rng}`, `stepSpiker/stepTanker(e, dt, params) → {enemy}`, `splitTanker(t, tube, params) → Enemy[]`, `makeEnemy(kind, lane, depth, params, cargo?) → Enemy`, `scoreFor(enemy) → number`, `rollSpawnKind/rollTankerCargo(level, rng) → {…, rng}`. The discriminant field is `kind` everywhere; tanker cargo is `contains: TankerCargo`; pulsar pulse state is `pulsing: boolean` consistently in the stepper, the `resolvePlayerHits` check, and the renderer. `LevelParams` gains exactly one field per task (`spikerSpeed`→3, `pulseInterval`→4, `fuseballSpeed`→5, `tankerSpeed`→6); earlier tests assert only the fields that already existed, so each addition is backward-compatible.

**Determinism check:** every RNG draw (`stepFlipper`, `stepPulsar`, `stepFuseball`, `rollSpawnKind`, `rollTankerCargo`, `rngInt` for lanes) threads the returned `Rng` back into `s.rng`; `stepSpiker`/`stepTanker` are RNG-free. `stepGame` still deep-copies via `cloneState` (now including `spikes.slice()`), so input is never mutated. Time enters only via `dt`.

**Ordering check (per `stepGame` `playing` branch):** `stepPlayer → stepFiring → stepBullets → stepEnemies (move + lay spikes + spawn) → resolveBulletHits (deaths, scoring, tanker split-on-death) → resolveSpikeHits (remaining bullets trim spikes) → resolveTankerArrivals (rim tankers split before they can grab) → resolvePlayerHits (grabbers + pulse) → checkLevelClear`. Tankers split before `resolvePlayerHits`, so they never grab; their children spawn at `SPLIT_CHILD_DEPTH` (0.85), below `PLAYER_RIM_DEPTH` (0.92), so a rim-split is not an instant grab; the spiker cap (0.75) is also below 0.92, so spikers never grab.

**Import-cycle check:** the only value cycle is `sim.ts ⇄ tanker.ts` (`splitTanker` ↔ `makeEnemy`). Both are hoisted function declarations called only at runtime, so module init completes safely. `rules.ts`'s imports of `Enemy/EnemyKind/TankerCargo` from `state.ts` are `import type` (erased), so they add no runtime edge to the existing `state.ts → rules.ts` import.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-25-tempest-wave-2-full-roster.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
