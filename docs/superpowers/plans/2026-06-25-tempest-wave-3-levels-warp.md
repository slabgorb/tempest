# Tempest Wave 3 (Levels & Warp) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the single-tube game into the full 16-level cycle — sixteen distinct tube geometries (open and closed) that cycle and repeat harder, per-level color cycling, and the end-of-level **warp** where the Claw flies down the tube and must dodge spikes or die.

**Architecture:** Continue the pure, deterministic `core/` (`stepGame(state, input, dt) → state`). The 16 geometries become a data-driven table of pre-built `Tube`s in `core/geometry.ts`, selected by a pure `tubeForLevel(level)`. Level transition gains a new `'warp'` `Mode`: clearing a level no longer advances immediately — it enters `warp`, the Claw descends (a probe depth travels `1 → 0`), the player may still rotate to dodge, and a spike in the player's lane crashes them. Warp completion (or a crash) runs a single `advanceLevel` helper that swaps in the next geometry, resizes the per-lane spike array, and ramps difficulty. Color is a pure render concern: a new `shell/palette.ts` derives the level's palette from `level` alone — no core change for color.

**Tech Stack:** TypeScript (strict, ES modules), Vite, Vitest (node environment), HTML5 Canvas 2D.

**Reference:** `docs/superpowers/specs/2026-06-24-tempest-clone-design.md` (north-star design); `docs/superpowers/plans/2026-06-25-tempest-wave-2-full-roster.md` (the roster this builds on).

## Global Constraints

- **Pure core boundary (load-bearing):** Files under `src/core/` MUST NOT import from `src/shell/`, and MUST NOT reference `window`, `document`, `canvas`, `Date.now()`, `new Date()`, `performance.now()`, `Math.random()`, or `requestAnimationFrame`. Randomness comes only from `src/core/rng.ts` seeded by `GameState.rng`. Time comes only from the `dt` parameter. `tubeForLevel` and `advanceLevel` are pure; the warp advances only via `dt`.
- **Determinism:** `stepGame(state, input, dt)` must return identical output for identical input, and must NOT mutate its `state` argument (it deep-copies via `cloneState` first). Geometry selection draws **no** RNG.
- **Depth convention:** `depth ∈ [0, 1]`, `0 = far end` (enemy spawn), `1 = near rim` (player). Enemies climb `0 → 1`; bullets travel `1 → 0`. A spike of height `h` in a lane occupies depth `[0, h]` (grows from the far end toward the rim). During the warp the Claw's probe depth descends `1 → 0`.
- **Tube boundary-point convention (already in `geometry.ts`):** a **closed** tube has exactly `laneCount` boundary points (boundaries wrap); an **open** tube has `laneCount + 1` boundary points (boundaries clamp). `wrapLane` wraps on closed tubes and clamps on open ones; `boundaryIndex` (private) clamps boundary lookups for open tubes. Geometry builders MUST honor this or `project`/`laneCenter*` will read out of range.
- **Geometry index 0 must equal the current game:** `tubeForLevel(1)` must return the existing 16-lane closed circle (`makeCircleTube(16, {x:0,y:0}, 60, 300)`) so all existing `initialState`-based tests stay green.
- **TypeScript strict:** `"strict": true`, `noUnusedLocals: true`. **Vitest (esbuild) does NOT typecheck — run `npm run build` (tsc) as part of every task's verification, not just `npm test`.**
- **Commit cadence:** One commit per task (conventional commit messages). Branch from `main` (`feat/tempest-wave-3-levels-warp`). Trunk-based.

---

## File Structure

```
src/core/
  geometry.ts   # ADD: makePolygonTube, makeOpenTube, profile fns, GEOMETRIES table, tubeForLevel
  state.ts      # MODIFY: Mode gains 'warp'; GameState gains warp:WarpState; initialState uses tubeForLevel(1)
  rules.ts      # MODIFY: WARP_SPEED const; per-cycle difficulty escalation in levelParams + rollSpawnKind
  sim.ts        # MODIFY: cloneState clones warp; advanceLevel helper; checkLevelClear → enter warp;
                #         stepWarp (progress + spike crash); 'warp' branch in stepGame; startGame resets tube+warp
src/shell/
  palette.ts    # CREATE: paletteForLevel(level) — cycling color palette (pure)
  render.ts     # MODIFY: use paletteForLevel; render the warp (descending Claw + zoom); open-tube draw
tests/core/
  geometry.cycle.test.ts   # CREATE: tubeForLevel cycling, laneCount/closed per index, builder validity
  sim.level.test.ts        # MODIFY: level-clear now enters warp; advance happens after warp completes
  sim.warp.test.ts         # CREATE: warp progress, completion → next geometry, rotation allowed, no firing
  sim.warp.spikes.test.ts  # CREATE: spike crash, clear-lane survival, dodge-by-rotating, gameover on last life
  sim.difficulty.test.ts   # CREATE: ramp continues past the 16-cycle, floors hold, roster opens up
tests/shell/
  palette.test.ts          # CREATE: paletteForLevel cycles and is total
```

### Key interfaces (defined across the tasks below, referenced by all)

```typescript
// core/geometry.ts
export function makePolygonTube(laneCount: number, sides: number, center: Point, farRadius: number, nearRadius: number): Tube  // closed
export function makeOpenTube(laneCount: number, center: Point, halfWidth: number, profile: (t: number) => number): Tube        // open
export function tubeForLevel(level: number): Tube   // cycles a 16-entry table; index 0 = the current circle

// core/state.ts
export type Mode = 'playing' | 'dying' | 'gameover' | 'warp'
export interface WarpState { progress: number }    // 0 = entered (Claw at rim), 1 = arrived at next level
export interface GameState { /* ...existing... */ warp: WarpState }

// core/rules.ts
export const WARP_SPEED: number                     // warp progress units per second

// core/sim.ts (internal unless noted)
function advanceLevel(s: GameState): void           // level+1, next geometry, reset spikes, wrap player, mode→'playing'
function stepWarp(s: GameState, dt: number): void   // advance progress; spike crash; completion → advanceLevel

// shell/palette.ts
export interface Palette { tube: string; claw: string; bullet: string; spike: string; enemy: Record<EnemyKind, string> }
export function paletteForLevel(level: number): Palette
```

---

## Task 1: The 16-geometry roster + `tubeForLevel` (`core/geometry.ts`)

**Files:**
- Modify: `src/core/geometry.ts`
- Modify: `src/core/state.ts` (`initialState` uses `tubeForLevel(1)`)
- Modify: `src/core/sim.ts` (`startGame` resets `s.tube = tubeForLevel(1)`)
- Test: `tests/core/geometry.cycle.test.ts`

**Interfaces:**
- Consumes: existing `Tube`, `Point`, `makeCircleTube`
- Produces: `makePolygonTube`, `makeOpenTube`, `tubeForLevel`; a module-level `GEOMETRIES: readonly Tube[]` of length 16 (8 closed + 8 open), index 0 = the current 16-lane circle

- [ ] **Step 1: Write the failing test**

```typescript
// tests/core/geometry.cycle.test.ts
import { describe, it, expect } from 'vitest'
import { tubeForLevel } from '../../src/core/geometry'

describe('tubeForLevel', () => {
  it('returns the original 16-lane closed circle for level 1', () => {
    const t = tubeForLevel(1)
    expect(t.laneCount).toBe(16)
    expect(t.closed).toBe(true)
    expect(t.far).toHaveLength(16)   // closed: laneCount boundary points
    expect(t.near).toHaveLength(16)
  })

  it('offers a mix of open and closed geometries across the cycle', () => {
    const tubes = Array.from({ length: 16 }, (_, i) => tubeForLevel(i + 1))
    expect(tubes.some((t) => t.closed)).toBe(true)
    expect(tubes.some((t) => !t.closed)).toBe(true)
  })

  it('every geometry has matching far/near boundary counts sized to its open/closed rule', () => {
    for (let level = 1; level <= 16; level++) {
      const t = tubeForLevel(level)
      const expected = t.closed ? t.laneCount : t.laneCount + 1
      expect(t.far).toHaveLength(expected)
      expect(t.near).toHaveLength(expected)
      expect(t.laneCount).toBeGreaterThanOrEqual(8)
    }
  })

  it('cycles with period 16 (level 17 reuses level 1 geometry)', () => {
    expect(tubeForLevel(17).laneCount).toBe(tubeForLevel(1).laneCount)
    expect(tubeForLevel(17).closed).toBe(tubeForLevel(1).closed)
    expect(tubeForLevel(33).closed).toBe(tubeForLevel(1).closed)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/geometry.cycle.test.ts`
Expected: FAIL — `tubeForLevel` is not exported.

- [ ] **Step 3: Add the builders + profiles + table to `src/core/geometry.ts`**

Append to the end of `src/core/geometry.ts`:

```typescript
// --- Wave 3: the 16-geometry roster ------------------------------------------

// A closed regular-polygon tube. sides=4 → square, 3 → triangle, etc. Boundary
// points are sampled evenly by angle around the polygon perimeter (flat sides +
// corners), with exactly laneCount points (boundaries wrap, like the circle).
export function makePolygonTube(
  laneCount: number, sides: number, center: Point, farRadius: number, nearRadius: number,
): Tube {
  const far: Point[] = []
  const near: Point[] = []
  for (let i = 0; i < laneCount; i++) {
    const t = i / laneCount
    far.push(polygonPoint(center, farRadius, sides, t))
    near.push(polygonPoint(center, nearRadius, sides, t))
  }
  return { laneCount, closed: true, far, near }
}

// Point on a regular `sides`-gon of circumradius `radius`, at fraction `t` ∈ [0,1)
// around the perimeter, starting from the top.
function polygonPoint(center: Point, radius: number, sides: number, t: number): Point {
  const a = t * Math.PI * 2 - Math.PI / 2
  const seg = (Math.PI * 2) / sides
  const rel = (((a + Math.PI / 2) % seg) + seg) % seg
  const r = (radius * Math.cos(seg / 2)) / Math.cos(rel - seg / 2)
  return { x: center.x + Math.cos(a) * r, y: center.y + Math.sin(a) * r }
}

// An open "fan" strip tube: far points converge near the top, near points fan
// out toward the player rim. `profile(t)` ∈ [0,1] bows the strip (V, U, step…).
// Open tubes carry laneCount+1 boundary points (boundaries clamp, no wrap).
export function makeOpenTube(
  laneCount: number, center: Point, halfWidth: number, profile: (t: number) => number,
): Tube {
  const far: Point[] = []
  const near: Point[] = []
  for (let i = 0; i <= laneCount; i++) {
    const t = i / laneCount
    const dip = profile(t)
    far.push({ x: center.x + (t - 0.5) * halfWidth * 0.3, y: center.y - 60 + dip * 30 })
    near.push({ x: center.x + (t - 0.5) * halfWidth, y: center.y + 220 + dip * 90 })
  }
  return { laneCount, closed: false, far, near }
}

const FLAT = (): number => 0
const SHALLOW_V = (t: number): number => Math.abs(t - 0.5)
const DEEP_V = (t: number): number => Math.abs(t - 0.5) * 2
const BOWL = (t: number): number => (2 * (t - 0.5)) ** 2
const W = (t: number): number => Math.abs(((t * 2) % 1) - 0.5) * 2
const STEP = (t: number): number => (t < 0.5 ? 0 : 1)
const RAMP = (t: number): number => t
const HUMP = (t: number): number => 1 - Math.abs(t - 0.5) * 2

const GEO_CENTER: Point = { x: 0, y: 0 }

// 16 distinct geometries (8 closed, 8 open). Index 0 is the original circle so
// level 1 is unchanged. Built once (immutable, shared) — never mutated.
const GEOMETRIES: readonly Tube[] = [
  makeCircleTube(16, GEO_CENTER, 60, 300),        // 1  circle
  makePolygonTube(16, 4, GEO_CENTER, 70, 320),    // 2  square
  makeOpenTube(16, GEO_CENTER, 640, FLAT),        // 3  flat line
  makePolygonTube(12, 3, GEO_CENTER, 80, 340),    // 4  triangle
  makeOpenTube(14, GEO_CENTER, 600, SHALLOW_V),   // 5  shallow V
  makePolygonTube(15, 5, GEO_CENTER, 70, 320),    // 6  pentagon
  makeOpenTube(16, GEO_CENTER, 640, DEEP_V),      // 7  deep V
  makePolygonTube(12, 6, GEO_CENTER, 70, 320),    // 8  hexagon
  makeOpenTube(16, GEO_CENTER, 640, BOWL),        // 9  U / bowl
  makePolygonTube(16, 8, GEO_CENTER, 70, 320),    // 10 octagon
  makeOpenTube(16, GEO_CENTER, 640, W),           // 11 W zigzag
  makePolygonTube(14, 7, GEO_CENTER, 70, 320),    // 12 heptagon
  makeOpenTube(12, GEO_CENTER, 560, STEP),        // 13 step
  makePolygonTube(12, 4, GEO_CENTER, 70, 320),    // 14 small square
  makeOpenTube(16, GEO_CENTER, 640, RAMP),        // 15 ramp
  makeOpenTube(16, GEO_CENTER, 640, HUMP),        // 16 hump
]

// Pure: cycles the table with period 16, repeating geometry on later passes
// (difficulty keeps climbing via levelParams). No RNG, no time.
export function tubeForLevel(level: number): Tube {
  const n = GEOMETRIES.length
  return GEOMETRIES[(((level - 1) % n) + n) % n]
}
```

- [ ] **Step 4: Point `initialState` at the roster**

In `src/core/state.ts`, add `tubeForLevel` to the geometry import and replace the hardcoded circle:

```typescript
import { Tube, tubeForLevel } from './geometry'
```

```typescript
export function initialState(seed: number): GameState {
  const tube: Tube = tubeForLevel(1)
  return {
```

(Remove the now-unused `makeCircleTube` from the `state.ts` import if `noUnusedLocals`/lint flags it.)

- [ ] **Step 5: Reset the tube in `startGame`**

In `src/core/sim.ts`, add `tubeForLevel` to the geometry import:

```typescript
import { wrapLane, currentLane, tubeForLevel } from './geometry'
```

In `startGame`, set the level-1 geometry before rebuilding spikes:

```typescript
function startGame(s: GameState): void {
  s.mode = 'playing'
  s.level = 1
  s.score = 0
  s.lives = START_LIVES
  s.player = { lane: 0, alive: true, respawnTimer: 0 }
  s.enemies = []
  s.tube = tubeForLevel(1)
  s.spikes = new Array(s.tube.laneCount).fill(0)
  startLevel(s)
}
```

- [ ] **Step 6: Run the test + full suite + build**

Run: `npx vitest run tests/core/geometry.cycle.test.ts` → PASS
Run: `npm test` → all prior tests still green (level-1 geometry is identical to the old circle)
Run: `npm run build` → tsc clean, exit 0

- [ ] **Step 7: Commit**

```bash
git add src/core/geometry.ts src/core/state.ts src/core/sim.ts tests/core/geometry.cycle.test.ts
git commit -m "feat(core): 16-geometry roster and pure tubeForLevel selector"
```

---

## Task 2: Warp transition + `advanceLevel` (`core/state.ts`, `core/sim.ts`)

**Files:**
- Modify: `src/core/state.ts` (`Mode` gains `'warp'`; `GameState.warp`; init)
- Modify: `src/core/rules.ts` (`WARP_SPEED`)
- Modify: `src/core/sim.ts` (`cloneState` clones `warp`; `advanceLevel`; `checkLevelClear` → enter warp; `stepWarp`; `'warp'` branch)
- Modify: `tests/core/sim.level.test.ts` (new transition semantics)
- Test: `tests/core/sim.warp.test.ts`

**Interfaces:**
- Consumes: `tubeForLevel`, `wrapLane`, `startLevel`, `stepPlayer`, `WARP_SPEED`
- Produces: `Mode = 'playing' | 'dying' | 'gameover' | 'warp'`; `WarpState { progress }`; `GameState.warp`; `advanceLevel(s)`; `stepWarp(s, dt)`

> **Transition model:** Clearing a level (no enemies, spawn budget empty) sets `mode='warp'`, `warp.progress=0`, clears bullets. In `warp`, the player may still rotate (`stepPlayer`) but cannot fire. `warp.progress` advances `0 → 1` at `WARP_SPEED`. At `progress ≥ 1` the warp completes via `advanceLevel`, which bumps the level, swaps in `tubeForLevel(level)`, resets the spike array to the new `laneCount`, wraps the player lane into the new tube, resets `warp.progress`, and sets `mode='playing'`. (Spike crashes are added in Task 3.)

- [ ] **Step 1: Write the failing tests**

Replace the entire contents of `tests/core/sim.level.test.ts` with the new transition semantics:

```typescript
// tests/core/sim.level.test.ts
import { describe, it, expect } from 'vitest'
import { initialState } from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { Input } from '../../src/core/input'
import { levelParams } from '../../src/core/rules'
import { tubeForLevel } from '../../src/core/geometry'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }

// Run enough steps for the warp to complete.
function runWarp(s: ReturnType<typeof initialState>) {
  let out = s
  for (let i = 0; i < 200 && out.mode === 'warp'; i++) out = stepGame(out, NEUTRAL, 1 / 60)
  return out
}

describe('level clear → warp', () => {
  it('enters warp (not the next level) when the budget is empty and enemies are gone', () => {
    const s = initialState(1)
    s.spawn.remaining = 0
    s.enemies = []
    const out = stepGame(s, NEUTRAL, 1 / 60)
    expect(out.mode).toBe('warp')
    expect(out.level).toBe(1) // not advanced yet
  })

  it('advances to the next level and geometry once the warp completes', () => {
    let s = initialState(1)
    s.spawn.remaining = 0
    s.enemies = []
    s = stepGame(s, NEUTRAL, 1 / 60) // now warping
    const out = runWarp(s)
    expect(out.mode).toBe('playing')
    expect(out.level).toBe(2)
    expect(out.spawn.remaining).toBe(levelParams(2).enemyCount)
    expect(out.tube.laneCount).toBe(tubeForLevel(2).laneCount)
    expect(out.tube.closed).toBe(tubeForLevel(2).closed)
    expect(out.spikes).toHaveLength(tubeForLevel(2).laneCount)
  })

  it('does not enter warp while enemies remain', () => {
    const s = initialState(1)
    s.spawn.remaining = 0
    s.enemies = [{ kind: 'flipper', lane: 1, depth: 0.2, flipTimer: 999 }]
    const out = stepGame(s, NEUTRAL, 1 / 60)
    expect(out.mode).toBe('playing')
    expect(out.level).toBe(1)
  })

  it('does not enter warp while the budget still has enemies to spawn', () => {
    const s = initialState(1) // spawn.remaining > 0, no enemies yet
    s.enemies = []
    const out = stepGame(s, NEUTRAL, 1 / 60)
    expect(out.mode).toBe('playing')
  })

  it('makes the next level harder (more enemies, faster flippers)', () => {
    expect(levelParams(2).enemyCount).toBeGreaterThan(levelParams(1).enemyCount)
    expect(levelParams(2).flipperSpeed).toBeGreaterThan(levelParams(1).flipperSpeed)
  })

  it('does not enter warp when the player is killed by the final enemy', () => {
    const s = initialState(1)
    s.spawn.remaining = 0
    s.lives = 1
    s.player.lane = 4
    s.enemies = [{ kind: 'flipper', lane: 4, depth: 0.95, flipTimer: 999 }]
    const out = stepGame(s, NEUTRAL, 1 / 60)
    expect(out.mode).toBe('gameover') // player died
    expect(out.level).toBe(1)
  })
})
```

```typescript
// tests/core/sim.warp.test.ts
import { describe, it, expect } from 'vitest'
import { initialState } from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { Input } from '../../src/core/input'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }
const FIRING: Input = { spin: 0, fire: true, zap: false, start: false }

// Put the game into a fresh warp on level 1.
function enterWarp() {
  let s = initialState(1)
  s.spawn.remaining = 0
  s.enemies = []
  s = stepGame(s, NEUTRAL, 1 / 60)
  return s
}

describe('warp', () => {
  it('begins at progress 0 and advances toward 1', () => {
    const s = enterWarp()
    expect(s.mode).toBe('warp')
    expect(s.warp.progress).toBeGreaterThan(0)
    const next = stepGame(s, NEUTRAL, 1 / 60)
    expect(next.warp.progress).toBeGreaterThan(s.warp.progress)
  })

  it('does not fire bullets during the warp', () => {
    let s = enterWarp()
    for (let i = 0; i < 5; i++) s = stepGame(s, FIRING, 1 / 60)
    expect(s.bullets).toHaveLength(0)
  })

  it('still lets the player rotate during the warp', () => {
    const s = enterWarp()
    const before = s.player.lane
    const out = stepGame(s, { spin: 3, fire: false, zap: false, start: false }, 1 / 60)
    expect(out.player.lane).not.toBe(before)
  })

  it('resets warp progress to 0 after completing', () => {
    let s = enterWarp()
    for (let i = 0; i < 200 && s.mode === 'warp'; i++) s = stepGame(s, NEUTRAL, 1 / 60)
    expect(s.mode).toBe('playing')
    expect(s.warp.progress).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/sim.level.test.ts tests/core/sim.warp.test.ts`
Expected: FAIL — `s.warp` is `undefined`; clearing still advances the level directly; `'warp'` mode unhandled.

- [ ] **Step 3: Extend the state model in `src/core/state.ts`**

Add `'warp'` to `Mode` and define `WarpState`:

```typescript
export type Mode = 'playing' | 'dying' | 'gameover' | 'warp'

export interface WarpState {
  progress: number      // 0 = warp just entered (Claw at rim), 1 = arrived at next level
}
```

Add `warp` to the `GameState` interface (after `spawn`):

```typescript
  spawn: SpawnState
  warp: WarpState
  rng: Rng
```

Initialise it in `initialState` (after the `spawn:` line):

```typescript
    spawn: spawnForLevel(1),
    warp: { progress: 0 },
    rng: makeRng(seed),
```

- [ ] **Step 4: Add `WARP_SPEED` to `src/core/rules.ts`**

```typescript
export const WARP_SPEED = 1.5  // warp progress (0→1) per second; ~0.67s flight down the tube
```

- [ ] **Step 5: Wire the warp into `src/core/sim.ts`**

Add `WARP_SPEED` to the rules import line:

```typescript
import {
  SPIN_SENSITIVITY, BULLET_SPEED, MAX_BULLETS, scoreFor, EXTRA_LIFE_INTERVAL,
  PLAYER_RIM_DEPTH, RESPAWN_DELAY, START_LIVES, levelParams, spawnForLevel,
  SCORE_SPIKE_SEGMENT, SPIKE_MAX_DEPTH, SPIKE_SHORTEN, TANKER_SPLIT_DEPTH, LevelParams,
  rollSpawnKind, rollTankerCargo, WARP_SPEED,
} from './rules'
```

Clone the warp sub-object in `cloneState` (after the `spawn:` line):

```typescript
    spawn: { ...s.spawn },
    warp: { ...s.warp },
```

Add the `advanceLevel` helper (replace the body of `checkLevelClear` and add `advanceLevel` + `stepWarp` near it):

```typescript
// The single place a new level is set up: next geometry, fresh spikes sized to
// the new tube, player wrapped into range, warp reset, back to play.
function advanceLevel(s: GameState): void {
  s.level += 1
  s.tube = tubeForLevel(s.level)
  s.spikes = new Array(s.tube.laneCount).fill(0)
  s.player.lane = wrapLane(s.tube, s.player.lane)
  s.warp.progress = 0
  s.mode = 'playing'
  startLevel(s)
}

function stepWarp(s: GameState, dt: number): void {
  s.warp.progress = Math.min(1, s.warp.progress + WARP_SPEED * dt)
  if (s.warp.progress >= 1) advanceLevel(s)
}
```

Replace `checkLevelClear` so it enters the warp instead of advancing:

```typescript
function checkLevelClear(s: GameState): void {
  if (s.mode !== 'playing') return
  if (s.enemies.length === 0 && s.spawn.remaining === 0) {
    s.mode = 'warp'
    s.warp.progress = 0
    s.bullets = []
  }
}
```

Add the `'warp'` branch to `stepGame` (after the `'playing'` case):

```typescript
    case 'warp':
      stepPlayer(s, input)   // rotate to dodge; no firing during the warp
      stepWarp(s, dt)
      break
```

- [ ] **Step 6: Run the tests + full suite + build**

Run: `npx vitest run tests/core/sim.level.test.ts tests/core/sim.warp.test.ts` → PASS
Run: `npm test` → all green (other suites unaffected; warp only triggers on clear)
Run: `npm run build` → exit 0

- [ ] **Step 7: Commit**

```bash
git add src/core/state.ts src/core/rules.ts src/core/sim.ts tests/core/sim.level.test.ts tests/core/sim.warp.test.ts
git commit -m "feat(core): end-of-level warp transition with geometry switch"
```

---

## Task 3: Spike collision during the warp (`core/sim.ts`)

**Files:**
- Modify: `src/core/sim.ts` (`stepWarp` gains the spike crash)
- Test: `tests/core/sim.warp.spikes.test.ts`

**Interfaces:**
- Consumes: `currentLane`, `killPlayer`, `advanceLevel`, `GameState.spikes`, `GameState.warp`
- Produces: spike-crash behavior inside `stepWarp` — a spike in the Claw's lane crashes it as the probe descends

> **Crash model:** The warp probe descends `probeDepth = 1 - warp.progress` (`1 → 0`). A spike of height `h` in the player's current lane occupies `[0, h]`. The Claw crashes the instant the descending probe reaches the spike tip: `h > 0 && probeDepth <= h` (taller spike → hit sooner; a clear lane, `h = 0`, is always safe). On a crash the warp still completes into the next level (`advanceLevel`) but the crash costs a life (`killPlayer` — which sets `'dying'` for a respawn, or `'gameover'` if it was the last life, overriding the `'playing'` that `advanceLevel` set). The crash check is skipped once `progress ≥ 1` (reaching the far end = safe arrival).

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/core/sim.warp.spikes.test.ts
import { describe, it, expect } from 'vitest'
import { initialState } from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { Input } from '../../src/core/input'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }

// Enter a fresh warp on level 1 with a chosen spike layout and player lane.
function warpWith(spikes: Record<number, number>, playerLane: number) {
  let s = initialState(1)
  s.spawn.remaining = 0
  s.enemies = []
  s.player.lane = playerLane
  for (const [lane, h] of Object.entries(spikes)) s.spikes[Number(lane)] = h
  s = stepGame(s, NEUTRAL, 1 / 60) // enter warp
  return s
}

function run(s: ReturnType<typeof initialState>, input: Input, steps = 200) {
  let out = s
  for (let i = 0; i < steps && out.mode === 'warp'; i++) out = stepGame(out, input, 1 / 60)
  return out
}

describe('warp spike collision', () => {
  it('crashes the Claw when its lane has a spike, costing a life', () => {
    const s = warpWith({ 4: 0.5 }, 4)
    const out = run(s, NEUTRAL)
    expect(out.lives).toBe(2)               // lost one
    expect(out.mode).toBe('dying')          // crashed → respawn
  })

  it('survives a clear lane and arrives at the next level with lives intact', () => {
    const s = warpWith({ 4: 0.5 }, 9)       // spike in 4, player in clear lane 9
    const out = run(s, NEUTRAL)
    expect(out.mode).toBe('playing')
    expect(out.level).toBe(2)
    expect(out.lives).toBe(3)
  })

  it('lets the player dodge by rotating to a clear lane before the probe reaches the spike', () => {
    const s = warpWith({ 4: 0.6 }, 4)       // start on the spiked lane...
    const out = run(s, { spin: -8, fire: false, zap: false, start: false }) // ...rotate away fast
    expect(out.mode).toBe('playing')
    expect(out.lives).toBe(3)
  })

  it('ends the game when the crash takes the last life', () => {
    const s = warpWith({ 4: 0.5 }, 4)
    s.lives = 1
    const out = run(s, NEUTRAL)
    expect(out.mode).toBe('gameover')
    expect(out.lives).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/sim.warp.spikes.test.ts`
Expected: FAIL — the warp ignores spikes, so every case arrives safely (`mode==='playing'`, lives unchanged).

- [ ] **Step 3: Add the crash to `stepWarp` in `src/core/sim.ts`**

Replace `stepWarp` with the crash-aware version:

```typescript
function stepWarp(s: GameState, dt: number): void {
  s.warp.progress = Math.min(1, s.warp.progress + WARP_SPEED * dt)
  const probeDepth = 1 - s.warp.progress
  const pl = currentLane(s.tube, s.player.lane)

  // Crash into a spike in the Claw's lane as the probe descends onto its tip.
  if (s.warp.progress < 1 && s.player.alive && s.spikes[pl] > 0 && probeDepth <= s.spikes[pl]) {
    advanceLevel(s)  // the warp still arrives at the next level...
    killPlayer(s)    // ...but the crash costs a life (overrides mode → dying/gameover)
    return
  }

  if (s.warp.progress >= 1) advanceLevel(s)
}
```

- [ ] **Step 4: Run the tests + full suite + build**

Run: `npx vitest run tests/core/sim.warp.spikes.test.ts` → PASS
Run: `npm test` → all green (clear-lane warps in `sim.warp.test.ts`/`sim.level.test.ts` are unaffected — those tubes have no spikes)
Run: `npm run build` → exit 0

- [ ] **Step 5: Commit**

```bash
git add src/core/sim.ts tests/core/sim.warp.spikes.test.ts
git commit -m "feat(core): spikes crash the Claw during the warp; clear lanes survive"
```

---

## Task 4: Difficulty ramp across the geometry cycle (`core/rules.ts`)

**Files:**
- Modify: `src/core/rules.ts` (`levelParams` cycle term; `rollSpawnKind` opens up on later cycles)
- Test: `tests/core/sim.difficulty.test.ts`

**Interfaces:**
- Consumes: existing `levelParams`, `rollSpawnKind`, `LevelParams`
- Produces: a monotonic, floored ramp that keeps climbing past level 16; full enemy roster available once the player has cycled the 16 geometries at least once

> **Model:** The base ramp `1 + (level-1)*0.15` already climbs monotonically, so wrapping the geometry table (period 16) does not reset difficulty. This task makes that explicit and faithful: speeds keep rising (floored so high levels stay playable), and `rollSpawnKind` guarantees the nastier kinds are available on the second cycle even though the geometry repeats.

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/core/sim.difficulty.test.ts
import { describe, it, expect } from 'vitest'
import { levelParams, rollSpawnKind } from '../../src/core/rules'
import { makeRng } from '../../src/core/rng'
import { EnemyKind } from '../../src/core/state'

describe('difficulty ramp across the 16-geometry cycle', () => {
  it('keeps getting harder past the cycle wrap (level 20 > level 16)', () => {
    expect(levelParams(20).enemyCount).toBeGreaterThan(levelParams(16).enemyCount)
    expect(levelParams(20).flipperSpeed).toBeGreaterThan(levelParams(16).flipperSpeed)
  })

  it('flipper speed is monotonic non-decreasing level over level', () => {
    for (let l = 1; l < 40; l++) {
      expect(levelParams(l + 1).flipperSpeed).toBeGreaterThanOrEqual(levelParams(l).flipperSpeed)
    }
  })

  it('keeps timing intervals above their playable floors at very high levels', () => {
    expect(levelParams(50).flipInterval).toBeGreaterThanOrEqual(0.4)
    expect(levelParams(50).spawnInterval).toBeGreaterThanOrEqual(0.3)
    expect(levelParams(50).pulseInterval).toBeGreaterThanOrEqual(1.2)
  })

  it('offers the full roster once past the first cycle (level 18)', () => {
    const seen = new Set<EnemyKind>()
    let rng = makeRng(1)
    for (let i = 0; i < 400; i++) {
      const r = rollSpawnKind(18, rng)
      rng = r.rng
      seen.add(r.kind)
    }
    expect(seen.has('flipper')).toBe(true)
    expect(seen.has('tanker')).toBe(true)
    expect(seen.has('spiker')).toBe(true)
    expect(seen.has('pulsar')).toBe(true)
    expect(seen.has('fuseball')).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/sim.difficulty.test.ts`
Expected: PASS for the ramp/floor cases (already true), FAIL only if the current roster gating leaves a kind unavailable at level 18 — confirm which assertion fails before editing. (Current `rollSpawnKind` already enables every kind by level 5, so the roster test likely passes; the edit below makes the late-cycle weighting explicit and future-proof.)

- [ ] **Step 3: Make the late-cycle weighting explicit in `src/core/rules.ts`**

Replace `rollSpawnKind` so weights scale up with level (more tankers/spikers/pulsars/fuseballs deeper in, faithful to the arcade's escalating mix) while keeping the early-level introduction schedule:

```typescript
export function rollSpawnKind(level: number, rng: Rng): { kind: EnemyKind; rng: Rng } {
  const cycle = Math.floor((level - 1) / 16)  // 0 on the first pass, ≥1 after a wrap
  const table: ReadonlyArray<readonly [EnemyKind, number]> = [
    ['flipper', 10],
    ['tanker', level >= 3 ? 4 + cycle : 0],
    ['spiker', level >= 3 ? 3 + cycle : 0],
    ['pulsar', level >= 5 ? 3 + cycle * 2 : 0],
    ['fuseball', level >= 5 ? 3 + cycle * 2 : 0],
  ]
  const res = weightedPick(table, rng)
  return { kind: res.value, rng: res.rng }
}
```

(The `enemyCount`, speed, and interval ramp in `levelParams` already climb monotonically with `level` and are floored via `Math.max(...)`; no change needed there. If any floor assertion failed in Step 2, raise the corresponding `Math.max` floor to match the test.)

- [ ] **Step 4: Run the tests + full suite + build**

Run: `npx vitest run tests/core/sim.difficulty.test.ts` → PASS
Run: `npm test` → all green (Wave 2's `sim.spawn` mix test uses early levels where `cycle === 0`, so weights are unchanged there)
Run: `npm run build` → exit 0

- [ ] **Step 5: Commit**

```bash
git add src/core/rules.ts tests/core/sim.difficulty.test.ts
git commit -m "feat(core): difficulty keeps ramping and the roster opens up past the cycle"
```

---

## Task 5: Color cycling, warp rendering, and open tubes (`shell/palette.ts`, `shell/render.ts`)

**Files:**
- Create: `src/shell/palette.ts`
- Modify: `src/shell/render.ts` (use the palette; draw the warp; the existing tube/spike/enemy draws already handle open tubes)
- Test: `tests/shell/palette.test.ts`

**Interfaces:**
- Consumes: `GameState`, `Enemy['kind']`, `level`, `warp.progress`, `project`
- Produces: `Palette`, `paletteForLevel(level)`; `render` reads the palette and renders `mode === 'warp'`

> **Shell verification:** Rendering is verified by running the game (`npm run dev`) and by `npm run build`; only the pure `paletteForLevel` gets a unit test. Color is derived from `level` alone — no core change. The existing `drawTube`/`drawSpikes`/`drawEnemy`/`drawBullets` already project through `tube`, so open geometries draw correctly once the palette is wired; the new work is the per-level palette and the warp visual.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/shell/palette.test.ts
import { describe, it, expect } from 'vitest'
import { paletteForLevel } from '../../src/shell/palette'

const HEX = /^#[0-9a-fA-F]{3,8}$/

describe('paletteForLevel', () => {
  it('returns a complete palette of valid colors for any level', () => {
    for (const level of [1, 2, 7, 16, 17, 50]) {
      const p = paletteForLevel(level)
      expect(p.tube).toMatch(HEX)
      expect(p.claw).toMatch(HEX)
      expect(p.bullet).toMatch(HEX)
      expect(p.spike).toMatch(HEX)
      for (const k of ['flipper', 'tanker', 'spiker', 'fuseball', 'pulsar'] as const) {
        expect(p.enemy[k]).toMatch(HEX)
      }
    }
  })

  it('cycles the tube color and changes it level to level within a cycle', () => {
    expect(paletteForLevel(1).tube).not.toBe(paletteForLevel(2).tube)
    expect(paletteForLevel(17).tube).toBe(paletteForLevel(1).tube) // period 16
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/shell/palette.test.ts`
Expected: FAIL — `src/shell/palette.ts` does not exist.

- [ ] **Step 3: Create `src/shell/palette.ts`**

```typescript
// src/shell/palette.ts
import { EnemyKind } from '../core/state'

export interface Palette {
  tube: string
  claw: string
  bullet: string
  spike: string
  enemy: Record<EnemyKind, string>
}

// One tube hue per level, cycling with the 16-geometry period. Enemy/claw/
// bullet hues stay constant for readability; only the tube + spike shift so each
// level reads as a new "color" while the roster stays recognisable.
const TUBE_HUES: readonly string[] = [
  '#1e90ff', '#ff2bd6', '#39ff14', '#ffa500', '#00e5ff', '#ff3030', '#b026ff', '#ffe600',
  '#00ff9c', '#ff6ec7', '#4d4dff', '#ff8c00', '#2effd5', '#ff1493', '#7CFC00', '#00bfff',
]

export function paletteForLevel(level: number): Palette {
  const n = TUBE_HUES.length
  const tube = TUBE_HUES[(((level - 1) % n) + n) % n]
  return {
    tube,
    claw: '#ffea00',
    bullet: '#ffffff',
    spike: '#8a2be2',
    enemy: {
      flipper: '#ff2bd6',
      tanker: '#39ff14',
      spiker: '#ffa500',
      fuseball: '#ff3030',
      pulsar: '#00e5ff',
    },
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/shell/palette.test.ts` → PASS

- [ ] **Step 5: Wire the palette + warp into `src/shell/render.ts`**

Replace the top-of-file colour constants and the `ENEMY_COLOR` map with a palette lookup. Update the imports and `render` to derive a palette from `s.level`, pass colours down, and draw the warp. Replace the file's color usage as follows:

Change the imports + drop the consts:

```typescript
// src/shell/render.ts
import { GameState, Enemy } from '../core/state'
import { Tube, currentLane, project } from '../core/geometry'
import { paletteForLevel, Palette } from './palette'
```

(Delete the `TUBE_COLOR`/`CLAW_COLOR`/`BULLET_COLOR`/`SPIKE_COLOR` consts and the `ENEMY_COLOR` map.)

Thread the palette through the draw helpers — `drawTube(ctx, tube, pal)`, `drawSpikes(ctx, s, pal)`, `drawBullets(ctx, s, pal)`, `drawEnemy(ctx, s, e, pal)`, `drawPlayer(ctx, s, pal)` — using `pal.tube`, `pal.spike`, `pal.bullet`, `pal.enemy[e.kind]`, `pal.claw` in place of the old constants. For example `drawTube`:

```typescript
function drawTube(ctx: CanvasRenderingContext2D, tube: Tube, pal: Palette): void {
  ctx.lineWidth = 2
  ctx.strokeStyle = pal.tube
  ctx.shadowColor = pal.tube
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
```

Add a warp draw helper that shows the Claw descending the tube and a zoom pulse:

```typescript
function drawWarp(ctx: CanvasRenderingContext2D, s: GameState, pal: Palette): void {
  const lane = currentLane(s.tube, s.player.lane)
  const probeDepth = 1 - s.warp.progress           // 1 (rim) → 0 (far)
  const p = project(s.tube, lane, probeDepth)
  const r = 10 * (0.3 + probeDepth * 0.7)          // shrinks as it flies away
  ctx.lineWidth = 3
  ctx.strokeStyle = pal.claw
  ctx.shadowColor = pal.claw
  ctx.shadowBlur = 24
  ctx.beginPath()
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
  ctx.stroke()
}
```

Update `render` to build the palette once and branch the player vs. warp draw:

```typescript
export function render(
  ctx: CanvasRenderingContext2D, s: GameState, width: number, height: number,
): void {
  const pal = paletteForLevel(s.level)
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, width, height)
  ctx.save()
  ctx.translate(width / 2, height / 2)
  drawTube(ctx, s.tube, pal)
  drawSpikes(ctx, s, pal)
  if (s.mode === 'warp') {
    drawWarp(ctx, s, pal)
  } else {
    drawBullets(ctx, s, pal)
    for (const e of s.enemies) drawEnemy(ctx, s, e, pal)
    drawPlayer(ctx, s, pal)
  }
  ctx.restore()
  drawHud(ctx, s, width)
  ctx.shadowBlur = 0
}
```

(Leave `drawHud` as-is — it uses fixed white text. Optionally show a `WARP` banner when `s.mode === 'warp'`.)

- [ ] **Step 6: Verify the build, full suite, and the running game**

Run: `npm test` → all green (core suites unaffected; `palette.test.ts` passes)
Run: `npm run build` → tsc clean, exit 0
Run: `npm run dev` and play: confirm each level shows a new tube shape (open shapes appear as fans/V/U strips) and color; clear a level and watch the Claw fly down the tube; steer onto a spiked lane during the warp to crash, or a clear lane to pass.

- [ ] **Step 7: Commit**

```bash
git add src/shell/palette.ts src/shell/render.ts tests/shell/palette.test.ts
git commit -m "feat(shell): per-level color cycling, open-tube draw, and warp rendering"
```

---

## Self-Review

**Spec coverage** (design doc Wave 3: "all 16 tube geometries (open + closed), color cycling, the warp transition with spike collision, difficulty ramp"):

| Spec item | Task |
|-----------|------|
| 16 tube geometries (open + closed) | Task 1 (`GEOMETRIES`, `tubeForLevel`, polygon + open builders) |
| Geometry cycles and repeats | Task 1 (period-16 `tubeForLevel`) + Task 2 (`advanceLevel` swaps geometry) |
| Color cycling | Task 5 (`paletteForLevel`, render wired) |
| Warp transition | Task 2 (`'warp'` mode, `stepWarp`, `advanceLevel`) |
| Spike collision on warp | Task 3 (`stepWarp` crash) |
| Difficulty ramp | Task 4 (ramp continuation + roster escalation) |
| Spikes reset on new geometry | Task 2 (`advanceLevel` resizes `spikes` to new `laneCount`) |
| Warp render (Claw flies down) | Task 5 (`drawWarp`) |

**Out of Wave 3 scope (later waves):** Superzapper, HUD/extra-life framing, attract/title, high-score entry (Wave 4); audio/particles (Wave 5). The warp's "you can't fire" is enforced; firing UI polish is Wave 4+.

**Type consistency:** `Mode` is widened to include `'warp'` in Task 2 and consumed by Task 3 (`stepWarp`) and Task 5 (`render` branch). `WarpState.progress` is written in Tasks 2–3 and read in Task 5. `tubeForLevel` (Task 1) is consumed by `initialState`/`startGame` (Task 1) and `advanceLevel` (Task 2). `paletteForLevel`/`Palette` (Task 5) are self-contained in the shell. `advanceLevel` and `stepWarp` keep the same signatures from their introduction (Task 2) through their extension (Task 3).

**Determinism check:** `tubeForLevel`, `advanceLevel`, `stepWarp`, and `paletteForLevel` take no RNG and no wall-clock — the warp advances solely on `dt`. Geometry selection is a pure index into an immutable table.
