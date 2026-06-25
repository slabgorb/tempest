# Tempest Wave 0 + Wave 1 (Playable Slice) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first genuinely playable slice of the Tempest clone — a glowing closed tube you rotate around with the mousewheel, firing bullets down lanes at Flippers that spawn, climb, and flip, with collisions, death, lives, score, and level progression.

**Architecture:** A pure, deterministic simulation `core/` (no DOM, no `Date.now()`, no `Math.random()`, no `requestAnimationFrame`) exposes `stepGame(state, input, dt) → state`. A thin `shell/` does IO: Canvas2D rendering, mousewheel/keyboard input, and a fixed-timestep loop. All time enters the core as `dt`; all randomness comes from a seeded RNG carried in `GameState`. This makes the game logic fully unit-testable and frame-rate independent.

**Tech Stack:** TypeScript (strict, ES modules), Vite (dev server + build), Vitest (unit tests, node environment), HTML5 Canvas 2D.

**Reference:** `docs/superpowers/specs/2026-06-24-tempest-clone-design.md` (north-star design).

## Global Constraints

- **Pure core boundary (load-bearing):** Files under `src/core/` MUST NOT import from `src/shell/`, and MUST NOT reference `window`, `document`, `canvas`, `Date.now()`, `new Date()`, `performance.now()`, `Math.random()`, or `requestAnimationFrame`. Randomness comes only from `src/core/rng.ts` seeded by `GameState.rng`. Time comes only from the `dt` parameter.
- **Determinism:** `stepGame(state, input, dt)` must return identical output for identical input. `stepGame` must NOT mutate its `state` argument (it deep-copies first and mutates the copy).
- **Depth convention:** `depth ∈ [0, 1]` where `0 = far end` (enemy spawn) and `1 = near rim` (player). Enemies climb `0 → 1` (depth increases). Bullets travel `1 → 0` (depth decreases).
- **Coordinate space:** Positions in the core are **tube space** `{ laneIndex, depth }`. Screen projection lives only in `src/shell/render.ts`. Collision is lane + depth overlap, never pixels.
- **Lane convention:** Integer lanes index `0 .. laneCount-1`. The player's continuous position `player.lane` is a float wrapped into `[0, laneCount)`; the player's *occupied* lane is `currentLane(tube, player.lane)` (rounded + wrapped).
- **TypeScript strict:** `"strict": true`. `noUnusedLocals: true`, `noUnusedParameters: false` (sim sub-steppers take `dt` before they use it).
- **Fixed timestep:** Sim advances in fixed `STEP = 1/60` s increments. The renderer draws the latest state once per animation frame.
- **Commit cadence:** One commit per task (conventional commit messages). Branch from `main`; this project is trunk-based.

---

## File Structure

```
tempest/
├── index.html                         # canvas host + module entry
├── package.json                       # scripts + dev deps
├── tsconfig.json                      # strict TS config
├── vite.config.ts                     # Vite + Vitest config
├── src/
│   ├── main.ts                        # bootstrap: wire shell ↔ core
│   ├── core/                          # PURE — unit-tested, no IO
│   │   ├── rng.ts                     # seeded PRNG (mulberry32)
│   │   ├── geometry.ts                # Tube, projection, lane math
│   │   ├── input.ts                   # Input type (produced by shell, read by core)
│   │   ├── rules.ts                   # constants, per-level params, scoring
│   │   ├── state.ts                   # GameState types + initialState
│   │   ├── sim.ts                     # stepGame orchestration + sub-steppers
│   │   └── enemies/
│   │       └── flipper.ts             # flipper state machine (climb + flip)
│   └── shell/                         # IO — verified by running
│       ├── render.ts                  # GameState → glowing Canvas2D
│       ├── input.ts                   # mousewheel + keyboard → Input
│       └── loop.ts                    # fixed-timestep accumulator loop
└── tests/
    ├── core/
    │   ├── rng.test.ts
    │   ├── geometry.test.ts
    │   ├── state.test.ts
    │   ├── sim.player.test.ts
    │   ├── sim.bullets.test.ts
    │   ├── sim.collisions.test.ts
    │   ├── sim.death.test.ts
    │   ├── sim.level.test.ts
    │   └── enemies/
    │       ├── flipper.spawn.test.ts
    │       └── flipper.flip.test.ts
```

### Key interfaces (defined once, referenced by all tasks)

```typescript
// core/geometry.ts
export interface Point { readonly x: number; readonly y: number }
export interface Tube {
  readonly laneCount: number
  readonly closed: boolean
  readonly far: readonly Point[]    // boundary points at far rim; closed ⇒ length === laneCount
  readonly near: readonly Point[]   // boundary points at near rim; closed ⇒ length === laneCount
}
export function makeCircleTube(laneCount: number, center: Point, farRadius: number, nearRadius: number): Tube
export function wrapLane(tube: Tube, lane: number): number
export function currentLane(tube: Tube, laneFloat: number): number
export function laneCenterFar(tube: Tube, lane: number): Point
export function laneCenterNear(tube: Tube, lane: number): Point
export function project(tube: Tube, lane: number, depth: number): Point

// core/rng.ts
export interface Rng { readonly s: number }
export function makeRng(seed: number): Rng
export function rngNext(rng: Rng): { value: number; rng: Rng }   // value ∈ [0,1)
export function rngInt(rng: Rng, maxExclusive: number): { value: number; rng: Rng }

// core/input.ts
export interface Input { spin: number; fire: boolean; zap: boolean; start: boolean }

// core/rules.ts
export const SPIN_SENSITIVITY: number
export const BULLET_SPEED: number
export const MAX_BULLETS: number
export const PLAYER_RIM_DEPTH: number
export const RESPAWN_DELAY: number
export const START_LIVES: number
export const SCORE_FLIPPER: number
export interface LevelParams { enemyCount: number; flipperSpeed: number; flipInterval: number; spawnInterval: number }
export function levelParams(level: number): LevelParams
export function spawnForLevel(level: number): { remaining: number; timer: number }

// core/state.ts
export type Mode = 'playing' | 'dying' | 'gameover'
export interface Player { lane: number; alive: boolean; respawnTimer: number }
export interface Bullet { lane: number; depth: number }
export type EnemyKind = 'flipper'
export interface Enemy { kind: EnemyKind; lane: number; depth: number; flipTimer: number }
export interface SpawnState { remaining: number; timer: number }
export interface GameState {
  mode: Mode
  level: number
  tube: Tube
  player: Player
  bullets: Bullet[]
  enemies: Enemy[]
  score: number
  lives: number
  spawn: SpawnState
  rng: Rng
}
export function initialState(seed: number): GameState

// core/sim.ts
export function stepGame(state: GameState, input: Input, dt: number): GameState

// core/enemies/flipper.ts
export function stepFlipper(
  enemy: Enemy, dt: number, params: LevelParams, tube: Tube, rng: Rng
): { enemy: Enemy; rng: Rng }
```

---

## Task 1: Project scaffold + black canvas

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `src/main.ts`

**Interfaces:**
- Consumes: nothing
- Produces: a runnable Vite app and a working Vitest harness for later tasks

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "tempest",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run --passWithNoTests",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vite": "^5.2.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": false,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "types": ["vitest/globals"],
    "noEmit": true
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 3: Create `vite.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
})
```

- [ ] **Step 4: Create `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Tempest</title>
    <style>
      html, body { margin: 0; height: 100%; background: #000; overflow: hidden; }
      canvas { display: block; }
    </style>
  </head>
  <body>
    <canvas id="game"></canvas>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 5: Create `src/main.ts` (black canvas placeholder)**

```typescript
const canvas = document.getElementById('game') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!

function resize(): void {
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
}

window.addEventListener('resize', resize)
resize()
```

- [ ] **Step 6: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created, no errors.

- [ ] **Step 7: Verify the test harness runs**

Run: `npm test`
Expected: Vitest exits 0 with "No test files found, exiting with code 0" (the `--passWithNoTests` flag).

- [ ] **Step 8: Verify the build typechecks and bundles**

Run: `npm run build`
Expected: `tsc --noEmit` passes, Vite writes `dist/`, exit 0.

- [ ] **Step 9: Verify the dev server shows a black canvas**

Run: `npm run dev`, open the printed URL.
Expected: a full-window black canvas, no console errors. Stop the server (Ctrl-C).

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts index.html src/main.ts .gitignore
git commit -m "feat: scaffold Vite + TS + Vitest project with black canvas"
```

---

## Task 2: Seeded RNG (`core/rng.ts`)

**Files:**
- Create: `src/core/rng.ts`
- Test: `tests/core/rng.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `Rng`, `makeRng(seed)`, `rngNext(rng) → {value, rng}`, `rngInt(rng, max) → {value, rng}`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/core/rng.test.ts
import { describe, it, expect } from 'vitest'
import { makeRng, rngNext, rngInt } from '../../src/core/rng'

describe('rng', () => {
  it('is deterministic for the same seed', () => {
    expect(rngNext(makeRng(42)).value).toBe(rngNext(makeRng(42)).value)
  })

  it('produces values in [0, 1)', () => {
    let r = makeRng(1)
    for (let i = 0; i < 200; i++) {
      const n = rngNext(r)
      expect(n.value).toBeGreaterThanOrEqual(0)
      expect(n.value).toBeLessThan(1)
      r = n.rng
    }
  })

  it('advances: consecutive values differ', () => {
    const first = rngNext(makeRng(5))
    const second = rngNext(first.rng)
    expect(first.value).not.toBe(second.value)
  })

  it('rngInt returns integers in [0, max)', () => {
    let r = makeRng(7)
    for (let i = 0; i < 200; i++) {
      const n = rngInt(r, 16)
      expect(Number.isInteger(n.value)).toBe(true)
      expect(n.value).toBeGreaterThanOrEqual(0)
      expect(n.value).toBeLessThan(16)
      r = n.rng
    }
  })

  it('does not mutate the input state', () => {
    const r = makeRng(99)
    const before = r.s
    rngNext(r)
    expect(r.s).toBe(before)
  })

  it('different seeds usually differ', () => {
    expect(rngNext(makeRng(1)).value).not.toBe(rngNext(makeRng(2)).value)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/rng.test.ts`
Expected: FAIL — cannot find module `../../src/core/rng`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/core/rng.ts

export interface Rng {
  readonly s: number
}

export function makeRng(seed: number): Rng {
  return { s: seed >>> 0 }
}

// mulberry32 — deterministic, no Math.random
export function rngNext(rng: Rng): { value: number; rng: Rng } {
  const a = (rng.s + 0x6d2b79f5) | 0
  let t = Math.imul(a ^ (a >>> 15), 1 | a)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296
  return { value, rng: { s: a } }
}

export function rngInt(rng: Rng, maxExclusive: number): { value: number; rng: Rng } {
  const next = rngNext(rng)
  return { value: Math.floor(next.value * maxExclusive), rng: next.rng }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/rng.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/rng.ts tests/core/rng.test.ts
git commit -m "feat(core): add seeded deterministic RNG"
```

---

## Task 3: Geometry & projection (`core/geometry.ts`)

**Files:**
- Create: `src/core/geometry.ts`
- Test: `tests/core/geometry.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `Point`, `Tube`, `makeCircleTube`, `wrapLane`, `currentLane`, `laneCenterFar`, `laneCenterNear`, `project`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/core/geometry.test.ts
import { describe, it, expect } from 'vitest'
import {
  makeCircleTube, wrapLane, currentLane, laneCenterFar, laneCenterNear, project, Tube,
} from '../../src/core/geometry'

describe('makeCircleTube', () => {
  it('builds laneCount boundary points on each rim and is closed', () => {
    const t = makeCircleTube(16, { x: 0, y: 0 }, 60, 300)
    expect(t.laneCount).toBe(16)
    expect(t.closed).toBe(true)
    expect(t.far).toHaveLength(16)
    expect(t.near).toHaveLength(16)
  })
})

describe('wrapLane (closed tube)', () => {
  const t = makeCircleTube(16, { x: 0, y: 0 }, 60, 300)
  it('wraps overflow', () => { expect(wrapLane(t, 16)).toBe(0) })
  it('wraps negatives', () => { expect(wrapLane(t, -1)).toBe(15) })
  it('leaves in-range lanes alone', () => { expect(wrapLane(t, 5)).toBe(5) })
})

describe('wrapLane (open tube)', () => {
  const open: Tube = { laneCount: 4, closed: false, far: [], near: [] }
  it('clamps below 0', () => { expect(wrapLane(open, -2)).toBe(0) })
  it('clamps above laneCount-1', () => { expect(wrapLane(open, 9)).toBe(3) })
})

describe('currentLane', () => {
  const t = makeCircleTube(16, { x: 0, y: 0 }, 60, 300)
  it('rounds then wraps', () => {
    expect(currentLane(t, 0.4)).toBe(0)
    expect(currentLane(t, 15.6)).toBe(0)
    expect(currentLane(t, 2.5)).toBe(3)
  })
})

describe('project', () => {
  const t = makeCircleTube(16, { x: 0, y: 0 }, 60, 300)
  it('depth 0 equals the far lane center', () => {
    expect(project(t, 3, 0)).toEqual(laneCenterFar(t, 3))
  })
  it('depth 1 equals the near lane center', () => {
    expect(project(t, 3, 1)).toEqual(laneCenterNear(t, 3))
  })
  it('depth 0.5 is the midpoint', () => {
    const f = laneCenterFar(t, 3)
    const n = laneCenterNear(t, 3)
    const p = project(t, 3, 0.5)
    expect(p.x).toBeCloseTo((f.x + n.x) / 2)
    expect(p.y).toBeCloseTo((f.y + n.y) / 2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/geometry.test.ts`
Expected: FAIL — cannot find module `../../src/core/geometry`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/core/geometry.ts

export interface Point { readonly x: number; readonly y: number }

export interface Tube {
  readonly laneCount: number
  readonly closed: boolean
  readonly far: readonly Point[]
  readonly near: readonly Point[]
}

export function makeCircleTube(
  laneCount: number, center: Point, farRadius: number, nearRadius: number,
): Tube {
  const far: Point[] = []
  const near: Point[] = []
  for (let i = 0; i < laneCount; i++) {
    const a = (i / laneCount) * Math.PI * 2 - Math.PI / 2
    far.push({ x: center.x + Math.cos(a) * farRadius, y: center.y + Math.sin(a) * farRadius })
    near.push({ x: center.x + Math.cos(a) * nearRadius, y: center.y + Math.sin(a) * nearRadius })
  }
  return { laneCount, closed: true, far, near }
}

export function wrapLane(tube: Tube, lane: number): number {
  if (tube.closed) {
    return ((lane % tube.laneCount) + tube.laneCount) % tube.laneCount
  }
  return Math.max(0, Math.min(tube.laneCount - 1, lane))
}

export function currentLane(tube: Tube, laneFloat: number): number {
  return wrapLane(tube, Math.round(laneFloat))
}

function boundaryIndex(tube: Tube, i: number): number {
  if (tube.closed) {
    return ((i % tube.laneCount) + tube.laneCount) % tube.laneCount
  }
  return Math.max(0, Math.min(tube.far.length - 1, i))
}

export function laneCenterFar(tube: Tube, lane: number): Point {
  const a = tube.far[boundaryIndex(tube, lane)]
  const b = tube.far[boundaryIndex(tube, lane + 1)]
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

export function laneCenterNear(tube: Tube, lane: number): Point {
  const a = tube.near[boundaryIndex(tube, lane)]
  const b = tube.near[boundaryIndex(tube, lane + 1)]
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

export function project(tube: Tube, lane: number, depth: number): Point {
  const f = laneCenterFar(tube, lane)
  const n = laneCenterNear(tube, lane)
  return { x: f.x + (n.x - f.x) * depth, y: f.y + (n.y - f.y) * depth }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/geometry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/geometry.ts tests/core/geometry.test.ts
git commit -m "feat(core): add tube geometry, lane math, and projection"
```

---

## Task 4: Game state, input type, and rules (`core/state.ts`, `core/input.ts`, `core/rules.ts`)

**Files:**
- Create: `src/core/input.ts`
- Create: `src/core/rules.ts`
- Create: `src/core/state.ts`
- Test: `tests/core/state.test.ts`

**Interfaces:**
- Consumes: `makeCircleTube` (geometry), `makeRng` (rng)
- Produces: `Input`, all `rules.ts` constants + `levelParams` + `spawnForLevel`, `GameState` + sub-types + `initialState(seed)`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/core/state.test.ts
import { describe, it, expect } from 'vitest'
import { initialState } from '../../src/core/state'
import { levelParams } from '../../src/core/rules'

describe('initialState', () => {
  it('starts in playing mode at level 1 with full lives', () => {
    const s = initialState(123)
    expect(s.mode).toBe('playing')
    expect(s.level).toBe(1)
    expect(s.lives).toBe(3)
    expect(s.score).toBe(0)
  })

  it('builds a 16-lane closed tube', () => {
    const s = initialState(123)
    expect(s.tube.laneCount).toBe(16)
    expect(s.tube.closed).toBe(true)
  })

  it('seeds the level-1 spawn budget', () => {
    const s = initialState(123)
    expect(s.spawn.remaining).toBe(levelParams(1).enemyCount)
    expect(s.enemies).toEqual([])
    expect(s.bullets).toEqual([])
  })

  it('places an alive player at lane 0', () => {
    const s = initialState(123)
    expect(s.player.alive).toBe(true)
    expect(s.player.lane).toBe(0)
  })
})

describe('levelParams', () => {
  it('ramps enemy count and speed with level', () => {
    expect(levelParams(2).enemyCount).toBeGreaterThan(levelParams(1).enemyCount)
    expect(levelParams(2).flipperSpeed).toBeGreaterThan(levelParams(1).flipperSpeed)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/state.test.ts`
Expected: FAIL — cannot find module `../../src/core/state`.

- [ ] **Step 3: Write `src/core/input.ts`**

```typescript
// src/core/input.ts

export interface Input {
  spin: number    // signed spinner intent for this step (lane units, applied via SPIN_SENSITIVITY)
  fire: boolean   // fire edge (true only on the step the trigger goes down)
  zap: boolean    // superzapper (reserved for Wave 4)
  start: boolean  // start/restart (used by gameover in this slice)
}
```

- [ ] **Step 4: Write `src/core/rules.ts`**

```typescript
// src/core/rules.ts

export const SPIN_SENSITIVITY = 0.15
export const BULLET_SPEED = 2.0       // depth units per second (near → far)
export const MAX_BULLETS = 8
export const PLAYER_RIM_DEPTH = 0.92  // enemy depth ≥ this on player's lane = grab
export const RESPAWN_DELAY = 1.5      // seconds
export const START_LIVES = 3
export const SCORE_FLIPPER = 150

export interface LevelParams {
  enemyCount: number
  flipperSpeed: number   // depth units per second
  flipInterval: number   // seconds between flips
  spawnInterval: number  // seconds between spawns
}

export function levelParams(level: number): LevelParams {
  const ramp = 1 + (level - 1) * 0.15
  return {
    enemyCount: 6 + (level - 1) * 2,
    flipperSpeed: 0.18 * ramp,
    flipInterval: Math.max(0.4, 1.5 / ramp),
    spawnInterval: Math.max(0.3, 1.2 / ramp),
  }
}

export function spawnForLevel(level: number): { remaining: number; timer: number } {
  const p = levelParams(level)
  return { remaining: p.enemyCount, timer: p.spawnInterval }
}
```

- [ ] **Step 5: Write `src/core/state.ts`**

```typescript
// src/core/state.ts
import { Tube, makeCircleTube } from './geometry'
import { Rng, makeRng } from './rng'
import { START_LIVES, spawnForLevel } from './rules'

export type Mode = 'playing' | 'dying' | 'gameover'

export interface Player {
  lane: number          // continuous, wrapped into [0, laneCount)
  alive: boolean
  respawnTimer: number  // seconds remaining while mode === 'dying'
}

export interface Bullet {
  lane: number          // integer lane the bullet travels down
  depth: number         // 1 (near, just fired) → 0 (far)
}

export type EnemyKind = 'flipper'

export interface Enemy {
  kind: EnemyKind
  lane: number          // integer lane
  depth: number         // 0 (far, spawn) → 1 (near rim)
  flipTimer: number     // seconds until next flip
}

export interface SpawnState {
  remaining: number     // enemies left to spawn this level
  timer: number         // seconds until next spawn
}

export interface GameState {
  mode: Mode
  level: number
  tube: Tube
  player: Player
  bullets: Bullet[]
  enemies: Enemy[]
  score: number
  lives: number
  spawn: SpawnState
  rng: Rng
}

export function initialState(seed: number): GameState {
  const tube: Tube = makeCircleTube(16, { x: 0, y: 0 }, 60, 300)
  return {
    mode: 'playing',
    level: 1,
    tube,
    player: { lane: 0, alive: true, respawnTimer: 0 },
    bullets: [],
    enemies: [],
    score: 0,
    lives: START_LIVES,
    spawn: spawnForLevel(1),
    rng: makeRng(seed),
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/core/state.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/core/input.ts src/core/rules.ts src/core/state.ts tests/core/state.test.ts
git commit -m "feat(core): add GameState, Input, and per-level rules"
```

---

## Task 5: Player rotation in the sim (`core/sim.ts`)

**Files:**
- Create: `src/core/sim.ts`
- Test: `tests/core/sim.player.test.ts`

**Interfaces:**
- Consumes: `GameState` (state), `Input` (input), `wrapLane` (geometry), `SPIN_SENSITIVITY` (rules)
- Produces: `stepGame(state, input, dt)` (player movement only, for now); internal `cloneState`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/core/sim.player.test.ts
import { describe, it, expect } from 'vitest'
import { initialState } from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { Input } from '../../src/core/input'
import { SPIN_SENSITIVITY } from '../../src/core/rules'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }

describe('stepGame player rotation', () => {
  it('moves the player by spin * SPIN_SENSITIVITY', () => {
    const s = initialState(1)
    const out = stepGame(s, { ...NEUTRAL, spin: 1 }, 1 / 60)
    expect(out.player.lane).toBeCloseTo(SPIN_SENSITIVITY)
  })

  it('wraps around a closed tube on negative spin', () => {
    const s = initialState(1)   // lane starts at 0
    const out = stepGame(s, { ...NEUTRAL, spin: -1 }, 1 / 60)
    expect(out.player.lane).toBeCloseTo(16 - SPIN_SENSITIVITY)
  })

  it('does not mutate the input state', () => {
    const s = initialState(1)
    stepGame(s, { ...NEUTRAL, spin: 5 }, 1 / 60)
    expect(s.player.lane).toBe(0)
  })

  it('is deterministic: same input → same output', () => {
    const a = stepGame(initialState(1), { ...NEUTRAL, spin: 3 }, 1 / 60)
    const b = stepGame(initialState(1), { ...NEUTRAL, spin: 3 }, 1 / 60)
    expect(a.player.lane).toBe(b.player.lane)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/sim.player.test.ts`
Expected: FAIL — cannot find module `../../src/core/sim`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/core/sim.ts
import { GameState } from './state'
import { Input } from './input'
import { wrapLane } from './geometry'
import { SPIN_SENSITIVITY } from './rules'

function cloneState(s: GameState): GameState {
  return {
    ...s,
    player: { ...s.player },
    bullets: s.bullets.map((b) => ({ ...b })),
    enemies: s.enemies.map((e) => ({ ...e })),
    spawn: { ...s.spawn },
  }
}

function stepPlayer(s: GameState, input: Input): void {
  if (!s.player.alive) return
  s.player.lane = wrapLane(s.tube, s.player.lane + input.spin * SPIN_SENSITIVITY)
}

export function stepGame(state: GameState, input: Input, dt: number): GameState {
  void dt // unused until bullets/enemies (Task 9+)
  const s = cloneState(state)
  if (s.mode === 'playing') {
    stepPlayer(s, input)
  }
  return s
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/sim.player.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/sim.ts tests/core/sim.player.test.ts
git commit -m "feat(core): step player rotation in stepGame"
```

---

## Task 6: Renderer — glowing tube + claw (`shell/render.ts`)

**Files:**
- Create: `src/shell/render.ts`

**Interfaces:**
- Consumes: `GameState` (state), `Tube`/`currentLane`/`project` (geometry)
- Produces: `render(ctx, state, width, height)`

> The IO shell is verified by running (per the design doc's testing strategy), not by unit tests. Projection correctness is already covered by Task 3.

- [ ] **Step 1: Write `src/shell/render.ts`**

```typescript
// src/shell/render.ts
import { GameState } from '../core/state'
import { Tube, currentLane, project } from '../core/geometry'

const TUBE_COLOR = '#1e90ff'
const CLAW_COLOR = '#ffea00'

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

export function render(
  ctx: CanvasRenderingContext2D, s: GameState, width: number, height: number,
): void {
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, width, height)
  ctx.save()
  ctx.translate(width / 2, height / 2)
  drawTube(ctx, s.tube)
  drawPlayer(ctx, s)
  ctx.restore()
  ctx.shadowBlur = 0
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: no errors. (Rendering is visually verified in Task 8 once the loop is wired.)

- [ ] **Step 3: Commit**

```bash
git add src/shell/render.ts
git commit -m "feat(shell): render glowing tube and claw"
```

---

## Task 7: Shell input — mousewheel + keyboard (`shell/input.ts`)

**Files:**
- Create: `src/shell/input.ts`

**Interfaces:**
- Consumes: `Input` (core/input)
- Produces: `createInputController(target) → { sample(): Input }`

> Verified by running in Task 8. `sample()` returns the accumulated spin and the queued fire/start edges since the last call, then clears them.

- [ ] **Step 1: Write `src/shell/input.ts`**

```typescript
// src/shell/input.ts
import { Input } from '../core/input'

const WHEEL_SCALE = 0.01

export interface InputController {
  sample(): Input
}

export function createInputController(target: HTMLElement): InputController {
  let spinAccum = 0
  let fireQueued = false
  let startQueued = false
  let leftHeld = false
  let rightHeld = false

  target.addEventListener(
    'wheel',
    (e: WheelEvent) => {
      spinAccum += e.deltaY * WHEEL_SCALE
      e.preventDefault()
    },
    { passive: false },
  )

  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.repeat) return
    if (e.key === 'ArrowLeft') leftHeld = true
    else if (e.key === 'ArrowRight') rightHeld = true
    else if (e.key === ' ') fireQueued = true
    else if (e.key === 'Enter') startQueued = true
  })

  window.addEventListener('keyup', (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') leftHeld = false
    else if (e.key === 'ArrowRight') rightHeld = false
  })

  return {
    sample(): Input {
      const keySpin = (rightHeld ? 1 : 0) + (leftHeld ? -1 : 0)
      const input: Input = {
        spin: spinAccum + keySpin,
        fire: fireQueued,
        zap: false,
        start: startQueued,
      }
      spinAccum = 0
      fireQueued = false
      startQueued = false
      return input
    },
  }
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/shell/input.ts
git commit -m "feat(shell): mousewheel + keyboard input controller"
```

---

## Task 8: Fixed-timestep loop + wire main (Wave 0 complete)

**Files:**
- Create: `src/shell/loop.ts`
- Modify: `src/main.ts` (replace the black-canvas placeholder)

**Interfaces:**
- Consumes: `GameState` (state), `Input` (input), `stepGame` (sim)
- Produces: `createLoop(initial, sampleInput, draw, now) → { start, stop, getState }`

- [ ] **Step 1: Write `src/shell/loop.ts`**

```typescript
// src/shell/loop.ts
import { GameState } from '../core/state'
import { Input } from '../core/input'
import { stepGame } from '../core/sim'

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
  draw: (s: GameState) => void,
  now: () => number,
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
    while (acc >= STEP) {
      // Apply the sampled edges (fire/start/spin) only on the first sub-step
      // so a single input event can't fire multiple bullets in one frame.
      state = stepGame(state, first ? input : NEUTRAL, STEP)
      acc -= STEP
      first = false
    }
    draw(state)
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

- [ ] **Step 2: Replace `src/main.ts` with the full bootstrap**

```typescript
// src/main.ts
import { initialState } from './core/state'
import { createInputController } from './shell/input'
import { createLoop } from './shell/loop'
import { render } from './shell/render'

const canvas = document.getElementById('game') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!

function resize(): void {
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight
}
window.addEventListener('resize', resize)
resize()

const input = createInputController(canvas)
const loop = createLoop(
  initialState(12345),
  () => input.sample(),
  (s) => render(ctx, s, canvas.width, canvas.height),
  () => performance.now(),
)
loop.start()
```

- [ ] **Step 3: Verify the build typechecks**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 4: Verify Wave 0 visually**

Run: `npm run dev`, open the URL.
Expected: a glowing blue 16-lane circular tube centered on screen with a yellow claw on the near rim. Scrolling the mousewheel (and the Left/Right arrow keys) rotates the claw around the rim, wrapping past lane 0. No enemies yet. Stop the server.

- [ ] **Step 5: Commit**

```bash
git add src/shell/loop.ts src/main.ts
git commit -m "feat(shell): fixed-timestep loop wiring the playable tube (Wave 0)"
```

---

## Task 9: Firing + bullets in the sim (`core/sim.ts`)

**Files:**
- Modify: `src/core/sim.ts`
- Test: `tests/core/sim.bullets.test.ts`

**Interfaces:**
- Consumes: `currentLane` (geometry), `BULLET_SPEED`/`MAX_BULLETS` (rules)
- Produces: bullets in `GameState.bullets`; `stepGame` now also fires and moves bullets

- [ ] **Step 1: Write the failing test**

```typescript
// tests/core/sim.bullets.test.ts
import { describe, it, expect } from 'vitest'
import { initialState } from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { Input } from '../../src/core/input'
import { MAX_BULLETS, BULLET_SPEED } from '../../src/core/rules'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }

describe('stepGame firing and bullets', () => {
  it('spawns a bullet at the player lane, depth 1, on fire', () => {
    const out = stepGame(initialState(1), { ...NEUTRAL, fire: true }, 1 / 60)
    expect(out.bullets).toHaveLength(1)
    expect(out.bullets[0].lane).toBe(0)
    expect(out.bullets[0].depth).toBeCloseTo(1 - BULLET_SPEED / 60)
  })

  it('does not fire when fire is false', () => {
    const out = stepGame(initialState(1), NEUTRAL, 1 / 60)
    expect(out.bullets).toHaveLength(0)
  })

  it('moves bullets toward the far end (depth decreases)', () => {
    let s = stepGame(initialState(1), { ...NEUTRAL, fire: true }, 1 / 60)
    const before = s.bullets[0].depth
    s = stepGame(s, NEUTRAL, 1 / 60)
    expect(s.bullets[0].depth).toBeLessThan(before)
  })

  it('caps bullets at MAX_BULLETS', () => {
    let s = initialState(1)
    for (let i = 0; i < MAX_BULLETS + 5; i++) {
      s = stepGame(s, { ...NEUTRAL, fire: true }, 1 / 60)
    }
    expect(s.bullets.length).toBeLessThanOrEqual(MAX_BULLETS)
  })

  it('removes bullets that reach the far end', () => {
    let s = stepGame(initialState(1), { ...NEUTRAL, fire: true }, 1 / 60)
    for (let i = 0; i < 120; i++) s = stepGame(s, NEUTRAL, 1 / 60)
    expect(s.bullets).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/sim.bullets.test.ts`
Expected: FAIL — `out.bullets` is empty (no firing logic yet).

- [ ] **Step 3: Update `src/core/sim.ts`**

Add the imports and two sub-steppers, and call them inside the `playing` branch. The full file is now:

```typescript
// src/core/sim.ts
import { GameState } from './state'
import { Input } from './input'
import { wrapLane, currentLane } from './geometry'
import { SPIN_SENSITIVITY, BULLET_SPEED, MAX_BULLETS } from './rules'

function cloneState(s: GameState): GameState {
  return {
    ...s,
    player: { ...s.player },
    bullets: s.bullets.map((b) => ({ ...b })),
    enemies: s.enemies.map((e) => ({ ...e })),
    spawn: { ...s.spawn },
  }
}

function stepPlayer(s: GameState, input: Input): void {
  if (!s.player.alive) return
  s.player.lane = wrapLane(s.tube, s.player.lane + input.spin * SPIN_SENSITIVITY)
}

function stepFiring(s: GameState, input: Input): void {
  if (!input.fire || !s.player.alive) return
  if (s.bullets.length >= MAX_BULLETS) return
  s.bullets.push({ lane: currentLane(s.tube, s.player.lane), depth: 1 })
}

function stepBullets(s: GameState, dt: number): void {
  for (const b of s.bullets) {
    b.depth -= BULLET_SPEED * dt
  }
  s.bullets = s.bullets.filter((b) => b.depth > 0)
}

export function stepGame(state: GameState, input: Input, dt: number): GameState {
  const s = cloneState(state)
  if (s.mode === 'playing') {
    stepPlayer(s, input)
    stepFiring(s, input)
    stepBullets(s, dt)
  }
  return s
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/sim.bullets.test.ts`
Expected: PASS. Also run `npx vitest run` — all prior tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/core/sim.ts tests/core/sim.bullets.test.ts
git commit -m "feat(core): fire and move bullets down lanes with a cap"
```

---

## Task 10: Flipper spawn + climb (`core/enemies/flipper.ts`, `core/sim.ts`)

**Files:**
- Create: `src/core/enemies/flipper.ts`
- Modify: `src/core/sim.ts`
- Test: `tests/core/enemies/flipper.spawn.test.ts`

**Interfaces:**
- Consumes: `Enemy` (state), `Rng`/`rngNext` (rng), `Tube`/`wrapLane` (geometry), `LevelParams`/`levelParams`/`rngInt` (rules/rng)
- Produces: `stepFlipper(enemy, dt, params, tube, rng) → { enemy, rng }`; spawning + enemy movement in `stepGame`. (Note: `startLevel` is introduced later in Task 13 where it is first called — defining it here would be unused code and `noUnusedLocals` would fail `tsc`.)

- [ ] **Step 1: Write the failing test**

```typescript
// tests/core/enemies/flipper.spawn.test.ts
import { describe, it, expect } from 'vitest'
import { initialState } from '../../../src/core/state'
import { stepGame } from '../../../src/core/sim'
import { Input } from '../../../src/core/input'
import { stepFlipper } from '../../../src/core/enemies/flipper'
import { levelParams } from '../../../src/core/rules'
import { makeRng } from '../../../src/core/rng'
import { makeCircleTube } from '../../../src/core/geometry'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }

function run(steps: number) {
  let s = initialState(1)
  for (let i = 0; i < steps; i++) s = stepGame(s, NEUTRAL, 1 / 60)
  return s
}

describe('flipper spawning', () => {
  it('spawns flippers from the budget over time', () => {
    const s = run(200)
    expect(s.enemies.length).toBeGreaterThan(0)
    expect(s.enemies.every((e) => e.kind === 'flipper')).toBe(true)
    expect(s.spawn.remaining).toBeLessThan(levelParams(1).enemyCount)
  })

  it('never spawns more than the level budget', () => {
    const s = run(3000)
    const total = s.enemies.length + s.spawn.remaining
    // total spawned + remaining + killed should not exceed the budget; with no
    // shooting, killed = 0, so spawned ≤ enemyCount.
    expect(total).toBeLessThanOrEqual(levelParams(1).enemyCount)
  })
})

describe('stepFlipper climb', () => {
  it('increases depth toward the near rim', () => {
    const tube = makeCircleTube(16, { x: 0, y: 0 }, 60, 300)
    const params = levelParams(1)
    const enemy = { kind: 'flipper' as const, lane: 3, depth: 0, flipTimer: 999 }
    const out = stepFlipper(enemy, 1 / 60, params, tube, makeRng(1))
    expect(out.enemy.depth).toBeCloseTo(params.flipperSpeed / 60)
  })

  it('clamps depth at 1', () => {
    const tube = makeCircleTube(16, { x: 0, y: 0 }, 60, 300)
    const params = levelParams(1)
    const enemy = { kind: 'flipper' as const, lane: 3, depth: 0.999, flipTimer: 999 }
    const out = stepFlipper(enemy, 1, params, tube, makeRng(1))
    expect(out.enemy.depth).toBe(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/enemies/flipper.spawn.test.ts`
Expected: FAIL — cannot find module `flipper`.

- [ ] **Step 3: Write `src/core/enemies/flipper.ts`**

```typescript
// src/core/enemies/flipper.ts
import { Enemy } from '../state'
import { Rng } from '../rng'
import { Tube } from '../geometry'
import { LevelParams } from '../rules'

// Climb toward the near rim. (Flipping across lanes is added in Task 11.)
export function stepFlipper(
  enemy: Enemy, dt: number, params: LevelParams, _tube: Tube, rng: Rng,
): { enemy: Enemy; rng: Rng } {
  const e: Enemy = { ...enemy }
  e.depth = Math.min(1, e.depth + params.flipperSpeed * dt)
  return { enemy: e, rng }
}
```

- [ ] **Step 4: Update `src/core/sim.ts` to spawn and move enemies**

The full file is now:

```typescript
// src/core/sim.ts
import { GameState } from './state'
import { Input } from './input'
import { wrapLane, currentLane } from './geometry'
import { SPIN_SENSITIVITY, BULLET_SPEED, MAX_BULLETS, levelParams } from './rules'
import { rngInt } from './rng'
import { stepFlipper } from './enemies/flipper'

function cloneState(s: GameState): GameState {
  return {
    ...s,
    player: { ...s.player },
    bullets: s.bullets.map((b) => ({ ...b })),
    enemies: s.enemies.map((e) => ({ ...e })),
    spawn: { ...s.spawn },
  }
}

function stepPlayer(s: GameState, input: Input): void {
  if (!s.player.alive) return
  s.player.lane = wrapLane(s.tube, s.player.lane + input.spin * SPIN_SENSITIVITY)
}

function stepFiring(s: GameState, input: Input): void {
  if (!input.fire || !s.player.alive) return
  if (s.bullets.length >= MAX_BULLETS) return
  s.bullets.push({ lane: currentLane(s.tube, s.player.lane), depth: 1 })
}

function stepBullets(s: GameState, dt: number): void {
  for (const b of s.bullets) {
    b.depth -= BULLET_SPEED * dt
  }
  s.bullets = s.bullets.filter((b) => b.depth > 0)
}

function stepEnemies(s: GameState, dt: number): void {
  const params = levelParams(s.level)

  // Spawn from the budget.
  if (s.spawn.remaining > 0) {
    s.spawn.timer -= dt
    if (s.spawn.timer <= 0) {
      const pick = rngInt(s.rng, s.tube.laneCount)
      s.rng = pick.rng
      s.enemies.push({ kind: 'flipper', lane: pick.value, depth: 0, flipTimer: params.flipInterval })
      s.spawn.remaining -= 1
      s.spawn.timer = params.spawnInterval
    }
  }

  // Move every enemy, threading the RNG.
  const moved = []
  for (const e of s.enemies) {
    const res = stepFlipper(e, dt, params, s.tube, s.rng)
    s.rng = res.rng
    moved.push(res.enemy)
  }
  s.enemies = moved
}

export function stepGame(state: GameState, input: Input, dt: number): GameState {
  const s = cloneState(state)
  if (s.mode === 'playing') {
    stepPlayer(s, input)
    stepFiring(s, input)
    stepBullets(s, dt)
    stepEnemies(s, dt)
  }
  return s
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/core/enemies/flipper.spawn.test.ts`
Expected: PASS. Run `npx vitest run` — all green.

- [ ] **Step 6: Commit**

```bash
git add src/core/enemies/flipper.ts src/core/sim.ts tests/core/enemies/flipper.spawn.test.ts
git commit -m "feat(core): spawn flippers from the level budget and climb the tube"
```

---

## Task 11: Flipper flip across lanes (`core/enemies/flipper.ts`)

**Files:**
- Modify: `src/core/enemies/flipper.ts`
- Test: `tests/core/enemies/flipper.flip.test.ts`

**Interfaces:**
- Consumes: `rngNext` (rng), `wrapLane` (geometry)
- Produces: `stepFlipper` now flips to an adjacent lane when `flipTimer` elapses (deterministic given the RNG)

- [ ] **Step 1: Write the failing test**

```typescript
// tests/core/enemies/flipper.flip.test.ts
import { describe, it, expect } from 'vitest'
import { stepFlipper } from '../../../src/core/enemies/flipper'
import { levelParams } from '../../../src/core/rules'
import { makeRng } from '../../../src/core/rng'
import { makeCircleTube } from '../../../src/core/geometry'

const tube = makeCircleTube(16, { x: 0, y: 0 }, 60, 300)
const params = levelParams(1)

describe('stepFlipper flipping', () => {
  it('flips to an adjacent lane when the flip timer elapses', () => {
    const enemy = { kind: 'flipper' as const, lane: 5, depth: 0.5, flipTimer: 0.001 }
    const out = stepFlipper(enemy, 1 / 60, params, tube, makeRng(1))
    expect(Math.abs(out.enemy.lane - 5)).toBe(1) // moved to lane 4 or 6
    expect(out.enemy.flipTimer).toBeCloseTo(params.flipInterval)
  })

  it('does not flip before the timer elapses', () => {
    const enemy = { kind: 'flipper' as const, lane: 5, depth: 0.5, flipTimer: 1 }
    const out = stepFlipper(enemy, 1 / 60, params, tube, makeRng(1))
    expect(out.enemy.lane).toBe(5)
  })

  it('wraps around the closed tube when flipping past the edge', () => {
    const enemy = { kind: 'flipper' as const, lane: 0, depth: 0.5, flipTimer: 0.001 }
    const out = stepFlipper(enemy, 1 / 60, params, tube, makeRng(99))
    expect([1, 15]).toContain(out.enemy.lane)
  })

  it('is deterministic: same RNG seed → same flip direction', () => {
    const enemy = { kind: 'flipper' as const, lane: 8, depth: 0.5, flipTimer: 0.001 }
    const a = stepFlipper(enemy, 1 / 60, params, tube, makeRng(7))
    const b = stepFlipper(enemy, 1 / 60, params, tube, makeRng(7))
    expect(a.enemy.lane).toBe(b.enemy.lane)
  })

  it('advances the RNG when it flips', () => {
    const enemy = { kind: 'flipper' as const, lane: 8, depth: 0.5, flipTimer: 0.001 }
    const rng = makeRng(7)
    const out = stepFlipper(enemy, 1 / 60, params, tube, rng)
    expect(out.rng.s).not.toBe(rng.s)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/enemies/flipper.flip.test.ts`
Expected: FAIL — the enemy never changes lanes (no flip logic yet).

- [ ] **Step 3: Update `src/core/enemies/flipper.ts`**

```typescript
// src/core/enemies/flipper.ts
import { Enemy } from '../state'
import { Rng, rngNext } from '../rng'
import { Tube, wrapLane } from '../geometry'
import { LevelParams } from '../rules'

export function stepFlipper(
  enemy: Enemy, dt: number, params: LevelParams, tube: Tube, rng: Rng,
): { enemy: Enemy; rng: Rng } {
  const e: Enemy = { ...enemy }
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/enemies/flipper.flip.test.ts`
Expected: PASS. Run `npx vitest run` — all green.

- [ ] **Step 5: Commit**

```bash
git add src/core/enemies/flipper.ts tests/core/enemies/flipper.flip.test.ts
git commit -m "feat(core): flippers flip across lanes deterministically"
```

---

## Task 12: Bullet ↔ enemy collision + scoring (`core/sim.ts`)

**Files:**
- Modify: `src/core/sim.ts`
- Test: `tests/core/sim.collisions.test.ts`

**Interfaces:**
- Consumes: `SCORE_FLIPPER` (rules)
- Produces: `resolveBulletHits(s)` — overlapping bullet + enemy are removed and score increases; called in `stepGame`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/core/sim.collisions.test.ts
import { describe, it, expect } from 'vitest'
import { initialState } from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { Input } from '../../src/core/input'
import { SCORE_FLIPPER } from '../../src/core/rules'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }

describe('bullet ↔ enemy collision', () => {
  it('destroys both and awards score when they overlap', () => {
    const s = initialState(1)
    s.spawn.remaining = 0            // stop new spawns interfering
    s.enemies = [{ kind: 'flipper', lane: 4, depth: 0.5, flipTimer: 999 }]
    s.bullets = [{ lane: 4, depth: 0.5 }]

    const out = stepGame(s, NEUTRAL, 1 / 60)
    expect(out.enemies).toHaveLength(0)
    expect(out.bullets).toHaveLength(0)
    expect(out.score).toBe(SCORE_FLIPPER)
  })

  it('misses when on a different lane', () => {
    const s = initialState(1)
    s.spawn.remaining = 0
    s.enemies = [{ kind: 'flipper', lane: 4, depth: 0.5, flipTimer: 999 }]
    s.bullets = [{ lane: 7, depth: 0.5 }]

    const out = stepGame(s, NEUTRAL, 1 / 60)
    expect(out.enemies).toHaveLength(1)
    expect(out.score).toBe(0)
  })

  it('misses when depths are far apart', () => {
    const s = initialState(1)
    s.spawn.remaining = 0
    s.enemies = [{ kind: 'flipper', lane: 4, depth: 0.1, flipTimer: 999 }]
    s.bullets = [{ lane: 4, depth: 0.9 }]

    const out = stepGame(s, NEUTRAL, 1 / 60)
    expect(out.enemies).toHaveLength(1)
    expect(out.score).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/sim.collisions.test.ts`
Expected: FAIL — enemy and bullet survive, score stays 0.

- [ ] **Step 3: Update `src/core/sim.ts`**

Add the `SCORE_FLIPPER` import, the `resolveBulletHits` function, and call it after `stepEnemies`. Add this constant to the existing rules import line:

```typescript
import { SPIN_SENSITIVITY, BULLET_SPEED, MAX_BULLETS, SCORE_FLIPPER, levelParams, spawnForLevel } from './rules'
```

Add the function (place it after `stepEnemies`):

```typescript
const HIT_DEPTH = 0.06

function resolveBulletHits(s: GameState): void {
  const deadBullets = new Set<number>()
  const deadEnemies = new Set<number>()
  s.bullets.forEach((b, bi) => {
    if (deadBullets.has(bi)) return
    for (let ei = 0; ei < s.enemies.length; ei++) {
      if (deadEnemies.has(ei)) continue
      const e = s.enemies[ei]
      if (e.lane === b.lane && Math.abs(e.depth - b.depth) <= HIT_DEPTH) {
        deadBullets.add(bi)
        deadEnemies.add(ei)
        s.score += SCORE_FLIPPER
        break
      }
    }
  })
  if (deadBullets.size > 0) s.bullets = s.bullets.filter((_, i) => !deadBullets.has(i))
  if (deadEnemies.size > 0) s.enemies = s.enemies.filter((_, i) => !deadEnemies.has(i))
}
```

Update the `playing` branch of `stepGame`:

```typescript
  if (s.mode === 'playing') {
    stepPlayer(s, input)
    stepFiring(s, input)
    stepBullets(s, dt)
    stepEnemies(s, dt)
    resolveBulletHits(s)
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/sim.collisions.test.ts`
Expected: PASS. Run `npx vitest run` — all green.

- [ ] **Step 5: Commit**

```bash
git add src/core/sim.ts tests/core/sim.collisions.test.ts
git commit -m "feat(core): bullet-enemy collision destroys both and scores"
```

---

## Task 13: Enemy ↔ player collision, death, lives, respawn (`core/sim.ts`)

**Files:**
- Modify: `src/core/sim.ts`
- Test: `tests/core/sim.death.test.ts`

**Interfaces:**
- Consumes: `PLAYER_RIM_DEPTH`/`RESPAWN_DELAY` (rules), `currentLane` (geometry)
- Produces: `resolvePlayerHits`, `killPlayer`, `respawn`, `startGame`; `stepGame` handles `dying` and `gameover` modes

- [ ] **Step 1: Write the failing test**

```typescript
// tests/core/sim.death.test.ts
import { describe, it, expect } from 'vitest'
import { initialState } from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { Input } from '../../src/core/input'
import { RESPAWN_DELAY } from '../../src/core/rules'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }

describe('enemy ↔ player collision and death', () => {
  it('kills the player when an enemy reaches the rim on the player lane', () => {
    const s = initialState(1)
    s.spawn.remaining = 0
    s.player.lane = 4
    s.enemies = [{ kind: 'flipper', lane: 4, depth: 0.95, flipTimer: 999 }]

    const out = stepGame(s, NEUTRAL, 1 / 60)
    expect(out.lives).toBe(2)
    expect(out.mode).toBe('dying')
    expect(out.player.alive).toBe(false)
  })

  it('does not kill the player on a different lane', () => {
    const s = initialState(1)
    s.spawn.remaining = 0
    s.player.lane = 4
    s.enemies = [{ kind: 'flipper', lane: 9, depth: 0.99, flipTimer: 999 }]

    const out = stepGame(s, NEUTRAL, 1 / 60)
    expect(out.mode).toBe('playing')
    expect(out.lives).toBe(3)
  })

  it('respawns after the delay while lives remain', () => {
    let s = initialState(1)
    s.spawn.remaining = 0
    s.player.lane = 4
    s.enemies = [{ kind: 'flipper', lane: 4, depth: 0.95, flipTimer: 999 }]
    s = stepGame(s, NEUTRAL, 1 / 60)            // → dying
    expect(s.mode).toBe('dying')

    for (let i = 0; i < Math.ceil(RESPAWN_DELAY * 60) + 2; i++) {
      s = stepGame(s, NEUTRAL, 1 / 60)
    }
    expect(s.mode).toBe('playing')
    expect(s.player.alive).toBe(true)
  })

  it('goes to gameover when the last life is lost', () => {
    const s = initialState(1)
    s.spawn.remaining = 0
    s.lives = 1
    s.player.lane = 4
    s.enemies = [{ kind: 'flipper', lane: 4, depth: 0.95, flipTimer: 999 }]

    const out = stepGame(s, NEUTRAL, 1 / 60)
    expect(out.mode).toBe('gameover')
    expect(out.lives).toBe(0)
  })

  it('restarts from gameover on start', () => {
    let s = initialState(1)
    s.mode = 'gameover'
    s.score = 5000
    s = stepGame(s, { ...NEUTRAL, start: true }, 1 / 60)
    expect(s.mode).toBe('playing')
    expect(s.score).toBe(0)
    expect(s.lives).toBe(3)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/sim.death.test.ts`
Expected: FAIL — player never dies; modes not handled.

- [ ] **Step 3: Update `src/core/sim.ts`**

Add `PLAYER_RIM_DEPTH, RESPAWN_DELAY, START_LIVES` to the rules import:

```typescript
import {
  SPIN_SENSITIVITY, BULLET_SPEED, MAX_BULLETS, SCORE_FLIPPER,
  PLAYER_RIM_DEPTH, RESPAWN_DELAY, START_LIVES, levelParams, spawnForLevel,
} from './rules'
```

Add these functions (after `resolveBulletHits`). `startLevel` is introduced here — this is the first task that calls it (from `startGame` below, and from `checkLevelClear` in Task 14):

```typescript
function startLevel(s: GameState): void {
  s.spawn = spawnForLevel(s.level)
  s.bullets = []
}

function killPlayer(s: GameState): void {
  s.player.alive = false
  s.lives -= 1
  if (s.lives <= 0) {
    s.mode = 'gameover'
  } else {
    s.mode = 'dying'
    s.player.respawnTimer = RESPAWN_DELAY
  }
}

function resolvePlayerHits(s: GameState): void {
  if (!s.player.alive) return
  const pl = currentLane(s.tube, s.player.lane)
  const grabbed = s.enemies.some((e) => e.depth >= PLAYER_RIM_DEPTH && e.lane === pl)
  if (grabbed) killPlayer(s)
}

function respawn(s: GameState): void {
  s.player.alive = true
  s.player.respawnTimer = 0
  // Clear enemies already at the rim so the player isn't killed on the same frame.
  s.enemies = s.enemies.filter((e) => e.depth < PLAYER_RIM_DEPTH)
  s.mode = 'playing'
}

function startGame(s: GameState): void {
  s.mode = 'playing'
  s.level = 1
  s.score = 0
  s.lives = START_LIVES
  s.player = { lane: 0, alive: true, respawnTimer: 0 }
  s.enemies = []
  startLevel(s)
}
```

Replace the body of `stepGame` with the full mode machine:

```typescript
export function stepGame(state: GameState, input: Input, dt: number): GameState {
  const s = cloneState(state)
  switch (s.mode) {
    case 'playing':
      stepPlayer(s, input)
      stepFiring(s, input)
      stepBullets(s, dt)
      stepEnemies(s, dt)
      resolveBulletHits(s)
      resolvePlayerHits(s)
      break
    case 'dying':
      s.player.respawnTimer -= dt
      if (s.player.respawnTimer <= 0) respawn(s)
      break
    case 'gameover':
      if (input.start) startGame(s)
      break
  }
  return s
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/sim.death.test.ts`
Expected: PASS. Run `npx vitest run` — all green.

- [ ] **Step 5: Commit**

```bash
git add src/core/sim.ts tests/core/sim.death.test.ts
git commit -m "feat(core): player death, lives, respawn, and gameover restart"
```

---

## Task 14: Level clear → next level, harder (`core/sim.ts`)

**Files:**
- Modify: `src/core/sim.ts`
- Test: `tests/core/sim.level.test.ts`

**Interfaces:**
- Consumes: `levelParams` (rules)
- Produces: `checkLevelClear(s)` — when the budget is empty and no enemies remain, advance the level and reseed the (harder) spawn budget

- [ ] **Step 1: Write the failing test**

```typescript
// tests/core/sim.level.test.ts
import { describe, it, expect } from 'vitest'
import { initialState } from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { Input } from '../../src/core/input'
import { levelParams } from '../../src/core/rules'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }

describe('level clear', () => {
  it('advances to the next level when the budget is empty and enemies are gone', () => {
    const s = initialState(1)
    s.spawn.remaining = 0
    s.enemies = []

    const out = stepGame(s, NEUTRAL, 1 / 60)
    expect(out.level).toBe(2)
    expect(out.spawn.remaining).toBe(levelParams(2).enemyCount)
  })

  it('does not advance while enemies remain', () => {
    const s = initialState(1)
    s.spawn.remaining = 0
    s.enemies = [{ kind: 'flipper', lane: 1, depth: 0.2, flipTimer: 999 }]

    const out = stepGame(s, NEUTRAL, 1 / 60)
    expect(out.level).toBe(1)
  })

  it('does not advance while the budget still has enemies to spawn', () => {
    const s = initialState(1)            // spawn.remaining > 0, no enemies yet
    s.enemies = []
    const out = stepGame(s, NEUTRAL, 1 / 60)
    expect(out.level).toBe(1)
  })

  it('makes the next level harder (more enemies, faster flippers)', () => {
    expect(levelParams(2).enemyCount).toBeGreaterThan(levelParams(1).enemyCount)
    expect(levelParams(2).flipperSpeed).toBeGreaterThan(levelParams(1).flipperSpeed)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/sim.level.test.ts`
Expected: FAIL — level stays at 1.

- [ ] **Step 3: Update `src/core/sim.ts`**

Add the function (after `startGame`):

```typescript
function checkLevelClear(s: GameState): void {
  if (s.enemies.length === 0 && s.spawn.remaining === 0) {
    s.level += 1
    startLevel(s)
  }
}
```

Call it at the end of the `playing` branch:

```typescript
    case 'playing':
      stepPlayer(s, input)
      stepFiring(s, input)
      stepBullets(s, dt)
      stepEnemies(s, dt)
      resolveBulletHits(s)
      resolvePlayerHits(s)
      checkLevelClear(s)
      break
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/sim.level.test.ts`
Expected: PASS. Run `npx vitest run` — all green.

- [ ] **Step 5: Commit**

```bash
git add src/core/sim.ts tests/core/sim.level.test.ts
git commit -m "feat(core): clear level and ramp difficulty when enemies are gone"
```

---

## Task 15: Render enemies, bullets, HUD + final wiring (Wave 1 complete)

**Files:**
- Modify: `src/shell/render.ts`

**Interfaces:**
- Consumes: `project` (geometry), `GameState` (state)
- Produces: full game rendering (tube, bullets, enemies, claw, HUD, gameover banner)

> Shell rendering is verified by running. All sim behavior it depends on is already covered by Tasks 9–14.

- [ ] **Step 1: Replace `src/shell/render.ts` with the full renderer**

```typescript
// src/shell/render.ts
import { GameState } from '../core/state'
import { Tube, currentLane, project } from '../core/geometry'

const TUBE_COLOR = '#1e90ff'
const CLAW_COLOR = '#ffea00'
const BULLET_COLOR = '#ffffff'
const FLIPPER_COLOR = '#ff2bd6'

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

function drawEnemies(ctx: CanvasRenderingContext2D, s: GameState): void {
  ctx.lineWidth = 2
  ctx.strokeStyle = FLIPPER_COLOR
  ctx.shadowColor = FLIPPER_COLOR
  ctx.shadowBlur = 14
  for (const e of s.enemies) {
    const p = project(s.tube, e.lane, e.depth)
    const r = 5 + e.depth * 9 // grows as it approaches the near rim
    ctx.beginPath()
    ctx.moveTo(p.x - r, p.y)
    ctx.lineTo(p.x, p.y - r)
    ctx.lineTo(p.x + r, p.y)
    ctx.lineTo(p.x, p.y + r)
    ctx.closePath()
    ctx.stroke()
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
  drawBullets(ctx, s)
  drawEnemies(ctx, s)
  drawPlayer(ctx, s)
  ctx.restore()
  drawHud(ctx, s, width)
  ctx.shadowBlur = 0
}
```

- [ ] **Step 2: Verify the build typechecks**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 3: Verify the full Wave 1 slice visually**

Run: `npm run dev`, open the URL.
Expected, with no console errors:
- The glowing tube and HUD (`SCORE`, `LEVEL`, `LIVES`) render.
- Magenta flippers spawn at the far (small/central) end and grow as they climb toward the rim; they occasionally jump to adjacent lanes.
- Mousewheel / arrows rotate the claw; Space fires white bullets down the current lane that pop flippers and raise the score.
- Letting a flipper reach the rim on your lane costs a life; losing all lives shows `GAME OVER`; Enter restarts.
- Clearing every flipper advances `LEVEL` and the next wave is denser/faster.

Stop the server.

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/shell/render.ts
git commit -m "feat(shell): render enemies, bullets, and HUD (Wave 1 playable slice)"
```

---

## Self-Review

**1. Spec coverage (Wave 0 + Wave 1 requirements from the design doc):**

| Spec requirement | Task(s) |
|---|---|
| Vite + TS project, canvas bootstrap | 1 |
| Fixed-timestep loop (accumulator) | 8 |
| Render one closed tube with glow | 6 |
| Mousewheel moves the Claw around the rim (wrap on closed) | 5, 7, 8 |
| Seeded deterministic RNG in state | 2 |
| Pure `stepGame(state, input, dt)` core, no DOM/time/random | 5, 9–14 (boundary enforced by Global Constraints) |
| Bullets fire down lanes, with an on-screen cap | 9 |
| Flippers spawn, climb, and flip | 10, 11 |
| Bullet ↔ enemy collision | 12 |
| Enemy ↔ player collision | 13 |
| Player death + lives + respawn | 13 |
| Score | 12 (award), 15 (HUD) |
| Level-clear → same geometry, harder | 14 |
| Tube-space `{lane, depth}` model, projection in shell only | 3 (project), enforced throughout |

All Wave 0 and Wave 1 items map to a task. Items explicitly deferred to later waves (Tankers/Spikers/Fuseballs/Pulsars, spikes, the 16 geometries, the warp, Superzapper, attract/title, high-score entry, audio) are **out of scope** for this plan per the design doc's wave breakdown.

**2. Placeholder scan:** No `TBD`/`TODO`/"handle edge cases"/"similar to Task N" — every code and test step contains complete content. (One intentional `void dt` in Task 5 is removed in Task 9 when `dt` becomes used.)

**3. Type consistency:** Signatures match the "Key interfaces" block across tasks — `stepGame(state, input, dt)`, `stepFlipper(enemy, dt, params, tube, rng) → {enemy, rng}`, `rngNext → {value, rng}`, `project(tube, lane, depth)`, `currentLane(tube, laneFloat)`. The `Enemy`, `Bullet`, `GameState`, and `Input` shapes are introduced once in Task 4 and used unchanged thereafter. RNG threading (`s.rng = res.rng`) is consistent in spawn and enemy movement.

**Determinism check:** `stepGame` deep-copies via `cloneState` before mutating (purity tested in Tasks 5/9); the only randomness is `s.rng` threaded through `rngInt`/`rngNext`; the only time is the `dt` parameter. The loop injects `now`/`requestAnimationFrame` so the core never touches them.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-24-tempest-wave-0-1-playable-slice.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
