# Tempest Wave 4 (Superzapper & Framing) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wrap the playable 16-level game in its full arcade framing — the once-per-level **Superzapper** (full blast then a single weak shot), a title/**attract** screen, **start-level select**, a **high-score** table entry flow with `localStorage` persistence, lives drawn as Claw icons, and a clean `attract → select → playing → gameover → highscore → attract` loop.

**Architecture:** Continue the pure, deterministic `core/` (`stepGame(state, input, dt) → state`). The Superzapper is pure core state on `player` (`'full' | 'used-once' | 'spent'`), driven by the existing reserved `Input.zap` edge, reset every level by the existing `startLevel`. The `Mode` union widens to add `'attract'` and `'levelselect'` and `'highscore'`; all mode transitions (attract → select → play → gameover → highscore → attract) live in `sim.ts` as pure, unit-tested logic. The high-score **table** and the initials-**entry** state machine live in core (`GameState.highScore`, `GameState.entry`); the only thing that is *not* pure is reading/writing `localStorage`, which is confined to a new `shell/storage.ts` called from `main.ts` at boot (load) and on the `highscore → attract` edge (save). `Input` is unchanged — its four fields (`spin`/`fire`/`zap`/`start`) are reused with per-mode meaning. The shell renderer gains the attract, level-select, high-score-entry screens and the Claw-icon lives HUD; those draws are verified by running the game.

**Tech Stack:** TypeScript (strict, ES modules), Vite, Vitest (node environment), HTML5 Canvas 2D, `window.localStorage` (shell only).

**Reference:** `docs/superpowers/specs/2026-06-24-tempest-clone-design.md` (north-star design — Wave 4 = the "framing" section); `docs/superpowers/plans/2026-06-25-tempest-wave-3-levels-warp.md` (the levels/warp this builds on). Authentic scoring/extra-life values: user memory `tempest-arcade-scoring.md` (extra life every 10,000 — already implemented in Wave 2).

## Global Constraints

- **Pure core boundary (load-bearing):** Files under `src/core/` MUST NOT import from `src/shell/`, and MUST NOT reference `window`, `document`, `canvas`, `localStorage`, `Date.now()`, `new Date()`, `performance.now()`, `Math.random()`, or `requestAnimationFrame`. Randomness comes only from `src/core/rng.ts` seeded by `GameState.rng`. Time comes only from the `dt` parameter. The Superzapper, mode transitions, level select, and high-score entry are all pure functions of `(state, input, dt)`.
- **High-score persistence is a SHELL concern:** the **numeric** `highScore` and the initials-**entry** state machine live in `GameState` and are unit-tested in core; reading and writing `localStorage` happen ONLY in `src/shell/` (`src/shell/storage.ts`, wired by `src/main.ts`). The seam: `initialState(seed, highScore)` seeds the table from a value the shell loaded; the shell saves on the `highscore → attract` transition.
- **No audio this wave** — WebAudio SFX are Wave 5. Add no `AudioContext`, no sound.
- **Determinism:** `stepGame(state, input, dt)` returns identical output for identical input, and must NOT mutate its `state` argument (it deep-copies via `cloneState` first, which must now also clone `player.superzapper` (a primitive, copied by `{ ...s.player }`) and the new `entry` sub-object). The Superzapper's "destroy one enemy" pick is deterministic (no RNG): it targets the enemy nearest the rim (highest `depth`, ties broken by lowest array index).
- **Input is reused, not widened:** `Input` keeps exactly `{ spin, fire, zap, start }`. Per-mode meaning — `attract`: `start` begins; `levelselect`: `spin` changes the chosen level, `start` confirms; `playing`/`warp`/`dying`: as today, plus `zap` triggers the Superzapper in `playing`; `gameover`: `start` proceeds (to highscore entry if qualifying, else attract); `highscore`: `spin` cycles the current initial's letter, `fire` advances to the next initial / commits the last one.
- **TypeScript strict:** `"strict": true`, `noUnusedLocals: true`. **Vitest (esbuild) does NOT typecheck — run `npm run build` (tsc) as part of every task's verification, not just `npm test`.**
- **Builds on Wave 3 end-state:** assume `Mode` already includes `'warp'`; `GameState.warp` exists; `tubeForLevel(level)` and the 16 `GEOMETRIES` exist in `core/geometry.ts`; `advanceLevel`/`stepWarp` exist in `sim.ts`; `WARP_SPEED` exists in `rules.ts`; `shell/palette.ts` (`paletteForLevel`, `Palette`) exists and `render.ts` is palette-driven.
- **Commit cadence:** One commit per task (conventional commit messages). Branch from `main` (`feat/tempest-wave-4-superzapper-and-framing`). Trunk-based.

---

## File Structure

```
src/core/
  state.ts        # MODIFY: Mode gains 'attract'|'levelselect'|'highscore'; Player gains superzapper;
                  #         GameState gains highScore, selectLevel, entry:HighScoreEntry;
                  #         initialState(seed, highScore) seeds the table + starts in 'attract'
  rules.ts        # MODIFY: MAX_START_LEVEL; INITIALS_SLOTS; INITIALS_ALPHABET; highScoreQualifies()
  sim.ts          # MODIFY: cloneState clones entry; reset superzapper in startLevel;
                  #         stepZap (full/weak Superzapper) wired in the 'playing' branch;
                  #         stepAttract/stepLevelSelect/stepHighScore + 'attract'|'levelselect'|'highscore' branches;
                  #         startGame(s, level) honours the chosen start level; gameover routes to entry/attract
src/shell/
  storage.ts      # CREATE: loadHighScore()/saveHighScore() — the ONLY localStorage touch (shell)
  render.ts       # MODIFY: attract, level-select, high-score-entry screens; Claw-icon lives HUD; high-score in HUD
  loop.ts         # MODIFY: onModeChange hook so the shell can persist on the highscore→attract edge
main.ts           # MODIFY: load high score at boot; seed initialState; save on highscore→attract
tests/core/
  sim.superzapper.test.ts  # CREATE: full blast, weak single shot, spent, per-level reset, scoring
  sim.framing.test.ts      # CREATE: attract→select→playing→gameover→highscore→attract transitions
  sim.levelselect.test.ts  # CREATE: spin changes chosen level within bounds; start begins at it
  sim.highscore.test.ts    # CREATE: qualifies check + initials entry state machine + table commit
tests/shell/
  storage.test.ts          # CREATE: load/save round-trips through a localStorage stub (jsdom-free fake)
```

### Key interfaces (defined across the tasks below, referenced by all)

```typescript
// core/state.ts
export type Superzapper = 'full' | 'used-once' | 'spent'
export type Mode = 'attract' | 'levelselect' | 'playing' | 'dying' | 'gameover' | 'warp' | 'highscore'
export interface Player { lane: number; alive: boolean; respawnTimer: number; superzapper: Superzapper }
export interface HighScoreEntry { active: boolean; initials: string[]; cursor: number }  // cursor ∈ [0, INITIALS_SLOTS)
export interface GameState {
  /* ...existing... */
  highScore: number
  selectLevel: number          // the level chosen on the level-select screen (≥ 1)
  entry: HighScoreEntry        // high-score initials entry machine
}
export function initialState(seed: number, highScore?: number): GameState  // starts in 'attract'

// core/rules.ts
export const MAX_START_LEVEL: number        // highest level the player may start on (16)
export const INITIALS_SLOTS: number         // 3
export const INITIALS_ALPHABET: string      // "ABCDEFGHIJKLMNOPQRSTUVWXYZ_." (last two: space, period/back)
export function highScoreQualifies(score: number, highScore: number): boolean

// core/sim.ts (internal unless noted)
function stepZap(s: GameState, input: Input): void          // full blast → used-once → weak → spent
function stepAttract(s: GameState, input: Input): void       // start → levelselect
function stepLevelSelect(s: GameState, input: Input): void   // spin picks level; start → playing at selectLevel
function stepHighScore(s: GameState, input: Input): void      // spin cycles letter; fire advances/commits → attract
function startGame(s: GameState, level: number): void         // begin a run at the chosen level

// shell/storage.ts
export function loadHighScore(): number                       // localStorage read; 0 if absent/invalid
export function saveHighScore(score: number): void            // localStorage write

// shell/loop.ts
export function createLoop(initial, sampleInput, draw, now, onModeChange?): Loop  // onModeChange(prev, next, state)
```

---

## Task 1: Superzapper — full blast, weak shot, per-level reset (`core/state.ts`, `core/sim.ts`)

**Files:**
- Modify: `src/core/state.ts` (`Player.superzapper`; `initialState`)
- Modify: `src/core/sim.ts` (reset in `startLevel`; `stepZap`; wire `zap` in the `playing` branch)
- Test: `tests/core/sim.superzapper.test.ts`

**Interfaces:**
- Consumes: `Input.zap`, `GameState.enemies`, `scoreFor`, `awardScore`, `splitTanker`, `levelParams`, `startLevel`
- Produces: `Superzapper = 'full' | 'used-once' | 'spent'`; `Player.superzapper`; `stepZap(s, input)`; the Superzapper is reset to `'full'` whenever a level starts

> **Model:** `Input.zap` is an edge (true only on the step the key goes down — the shell already debounces edges to the first sub-step). In `playing`, a `zap` edge fires the Superzapper based on `player.superzapper`:
> - `'full'` → destroy **every** enemy on screen, awarding `scoreFor` for each (tankers split first? NO — the Superzapper vaporises; it does not split tankers), then set `'used-once'`.
> - `'used-once'` → destroy exactly **one** enemy — the most dangerous, deterministically the one nearest the rim (max `depth`, ties → lowest index) — award its score, then set `'spent'`.
> - `'spent'` → no effect.
>
> It is reset to `'full'` by `startLevel` (so a fresh blast is available each level, including after the warp, since `advanceLevel` calls `startLevel`). Scoring flows through the existing `awardScore`, so Superzapper kills can grant extra lives just like bullet kills.

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/core/sim.superzapper.test.ts
import { describe, it, expect } from 'vitest'
import { initialState } from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { Input } from '../../src/core/input'
import { SCORE_FLIPPER } from '../../src/core/rules'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }
const ZAP: Input = { spin: 0, fire: false, zap: true, start: false }

// A fresh, in-progress level with a handful of enemies and no pending spawns.
function playingWithEnemies() {
  const s = initialState(1)
  s.mode = 'playing'
  s.spawn.remaining = 0
  s.enemies = [
    { kind: 'flipper', lane: 1, depth: 0.2, flipTimer: 999 },
    { kind: 'flipper', lane: 5, depth: 0.6, flipTimer: 999 },
    { kind: 'flipper', lane: 9, depth: 0.9, flipTimer: 999 },
  ]
  return s
}

describe('superzapper', () => {
  it('a fresh level starts with a full superzapper', () => {
    const s = initialState(1)
    s.mode = 'playing'
    expect(s.player.superzapper).toBe('full')
  })

  it('the first activation destroys ALL enemies and becomes used-once', () => {
    const s = playingWithEnemies()
    const out = stepGame(s, ZAP, 1 / 60)
    expect(out.enemies).toHaveLength(0)
    expect(out.player.superzapper).toBe('used-once')
  })

  it('awards score for every enemy vaporised by the full blast', () => {
    const s = playingWithEnemies()
    const out = stepGame(s, ZAP, 1 / 60)
    expect(out.score).toBe(SCORE_FLIPPER * 3)
  })

  it('the second activation destroys exactly ONE enemy (nearest the rim) and becomes spent', () => {
    let s = playingWithEnemies()
    s = stepGame(s, ZAP, 1 / 60)          // full blast clears the board, used-once
    s.enemies = [
      { kind: 'flipper', lane: 2, depth: 0.3, flipTimer: 999 },
      { kind: 'flipper', lane: 7, depth: 0.8, flipTimer: 999 }, // nearest the rim
    ]
    const out = stepGame(s, ZAP, 1 / 60)
    expect(out.enemies).toHaveLength(1)
    expect(out.enemies[0].lane).toBe(2)   // the deeper (0.8) one was vaporised
    expect(out.player.superzapper).toBe('spent')
  })

  it('a spent superzapper does nothing', () => {
    let s = playingWithEnemies()
    s = stepGame(s, ZAP, 1 / 60)          // full → used-once
    s.enemies = [{ kind: 'flipper', lane: 2, depth: 0.3, flipTimer: 999 }]
    s = stepGame(s, ZAP, 1 / 60)          // used-once → spent (one killed)
    s.enemies = [
      { kind: 'flipper', lane: 3, depth: 0.4, flipTimer: 999 },
      { kind: 'flipper', lane: 8, depth: 0.5, flipTimer: 999 },
    ]
    const out = stepGame(s, ZAP, 1 / 60)  // spent → no effect
    expect(out.enemies).toHaveLength(2)
    expect(out.player.superzapper).toBe('spent')
  })

  it('refills to full when the next level starts (after the warp)', () => {
    let s = playingWithEnemies()
    s = stepGame(s, ZAP, 1 / 60)          // used-once
    expect(s.player.superzapper).toBe('used-once')
    // Clear the board so the level ends and the warp runs to completion.
    s.enemies = []
    s.spawn.remaining = 0
    for (let i = 0; i < 200 && s.mode !== 'playing'; i++) s = stepGame(s, NEUTRAL, 1 / 60)
    expect(s.mode).toBe('playing')
    expect(s.level).toBe(2)
    expect(s.player.superzapper).toBe('full')
  })

  it('does not fire when the player is dead', () => {
    const s = playingWithEnemies()
    s.player.alive = false
    const out = stepGame(s, ZAP, 1 / 60)
    expect(out.enemies).toHaveLength(3)
    expect(out.player.superzapper).toBe('full')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/sim.superzapper.test.ts`
Expected: FAIL — `s.player.superzapper` is `undefined`; `zap` is ignored.

- [ ] **Step 3: Add `superzapper` to the player in `src/core/state.ts`**

Add the type alias (near `Mode`):

```typescript
export type Superzapper = 'full' | 'used-once' | 'spent'
```

Add the field to `Player`:

```typescript
export interface Player {
  lane: number          // continuous, wrapped into [0, laneCount)
  alive: boolean
  respawnTimer: number  // seconds remaining while mode === 'dying'
  superzapper: Superzapper  // once-per-level: full blast → weak single shot → spent
}
```

Initialise it in `initialState` (in the `player:` literal):

```typescript
    player: { lane: 0, alive: true, respawnTimer: 0, superzapper: 'full' },
```

- [ ] **Step 4: Reset the superzapper each level + add `stepZap` in `src/core/sim.ts`**

In `startLevel`, refill the Superzapper so every level (and every post-warp level via `advanceLevel → startLevel`) begins with a full charge:

```typescript
function startLevel(s: GameState): void {
  s.spawn = spawnForLevel(s.level)
  s.bullets = []
  s.player.superzapper = 'full'
}
```

Add `stepZap` (above `checkLevelClear`):

```typescript
// Superzapper: once per level. The first activation vaporises every enemy on
// screen (no tanker split — it is a kill, not a hit); the second activation
// vaporises exactly one enemy, the nearest the rim (max depth, ties → lowest
// index); after that it is spent until the next level. Scoring flows through
// awardScore so a zap can grant extra lives.
function stepZap(s: GameState, input: Input): void {
  if (!input.zap || !s.player.alive) return
  if (s.player.superzapper === 'spent' || s.enemies.length === 0) {
    if (s.player.superzapper === 'full') s.player.superzapper = 'used-once'
    return
  }
  if (s.player.superzapper === 'full') {
    for (const e of s.enemies) awardScore(s, scoreFor(e))
    s.enemies = []
    s.player.superzapper = 'used-once'
    return
  }
  // 'used-once' → destroy one enemy nearest the rim.
  let target = 0
  for (let i = 1; i < s.enemies.length; i++) {
    if (s.enemies[i].depth > s.enemies[target].depth) target = i
  }
  awardScore(s, scoreFor(s.enemies[target]))
  s.enemies = s.enemies.filter((_, i) => i !== target)
  s.player.superzapper = 'spent'
}
```

Wire it into the `playing` branch of `stepGame`, right after `stepFiring(s, input)`:

```typescript
    case 'playing':
      stepPlayer(s, input)
      stepFiring(s, input)
      stepZap(s, input)
      stepBullets(s, dt)
      stepEnemies(s, dt)
      resolveBulletHits(s)
      resolveSpikeHits(s)
      resolveTankerArrivals(s)
      resolvePlayerHits(s)
      checkLevelClear(s)
      break
```

- [ ] **Step 5: Run the tests + full suite + build**

Run: `npx vitest run tests/core/sim.superzapper.test.ts` → PASS
Run: `npm test` → all green (prior tests construct `player` via `initialState`, which now sets `superzapper`; the `'full'` reset in `startLevel` is harmless to existing level/warp tests)
Run: `npm run build` → tsc clean, exit 0

- [ ] **Step 6: Commit**

```bash
git add src/core/state.ts src/core/sim.ts tests/core/sim.superzapper.test.ts
git commit -m "feat(core): superzapper full blast, weak single shot, per-level reset"
```

---

## Task 2: Framing modes — attract & start-level select (`core/state.ts`, `core/rules.ts`, `core/sim.ts`)

**Files:**
- Modify: `src/core/state.ts` (`Mode` gains `'attract'`/`'levelselect'`; `GameState.selectLevel`; `initialState` starts in `'attract'`)
- Modify: `src/core/rules.ts` (`MAX_START_LEVEL`)
- Modify: `src/core/sim.ts` (`stepAttract`, `stepLevelSelect`; `startGame(s, level)`; new branches)
- Test: `tests/core/sim.framing.test.ts`, `tests/core/sim.levelselect.test.ts`

**Interfaces:**
- Consumes: `Input`, `startGame`, `wrapLane`, `tubeForLevel`, `START_LIVES`, `startLevel`
- Produces: `Mode` widened to include `'attract'` and `'levelselect'`; `GameState.selectLevel`; `MAX_START_LEVEL`; `stepAttract(s, input)`; `stepLevelSelect(s, input)`; `startGame(s, level)` (now takes the chosen start level)

> **Transition model:** `initialState` now begins in `'attract'` (the title screen). The flow:
> - `attract` — pressing `start` goes to `'levelselect'` (resets `selectLevel = 1`).
> - `levelselect` — `spin` nudges the chosen level (`+`/`−` by whole steps, clamped to `[1, MAX_START_LEVEL]`); `start` begins the run via `startGame(s, selectLevel)`.
> - `gameover` — `start` no longer restarts directly into level 1 (that routing moves to Task 4, where it goes to high-score entry if qualifying, else back to attract). In THIS task, `gameover` + `start` returns to `'attract'`.
>
> `startGame(s, level)` is generalised to begin at any level: it sets `level`, swaps in `tubeForLevel(level)`, sizes the spike array, resets score/lives/player, and calls `startLevel`.

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/core/sim.framing.test.ts
import { describe, it, expect } from 'vitest'
import { initialState } from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { Input } from '../../src/core/input'
import { START_LIVES } from '../../src/core/rules'
import { tubeForLevel } from '../../src/core/geometry'

const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }
const START: Input = { spin: 0, fire: false, zap: false, start: true }

describe('framing: attract → level select → playing', () => {
  it('the game boots into the attract screen', () => {
    const s = initialState(1)
    expect(s.mode).toBe('attract')
  })

  it('attract + start goes to the level-select screen', () => {
    const s = initialState(1)
    const out = stepGame(s, START, 1 / 60)
    expect(out.mode).toBe('levelselect')
    expect(out.selectLevel).toBe(1)
  })

  it('level-select + start begins a run at the chosen level with full lives', () => {
    let s = initialState(1)
    s = stepGame(s, START, 1 / 60)        // attract → levelselect
    s.selectLevel = 3
    const out = stepGame(s, START, 1 / 60) // levelselect → playing at 3
    expect(out.mode).toBe('playing')
    expect(out.level).toBe(3)
    expect(out.tube.laneCount).toBe(tubeForLevel(3).laneCount) // geometry swapped to level 3's tube
    expect(out.tube.closed).toBe(tubeForLevel(3).closed)
    expect(out.lives).toBe(START_LIVES)
    expect(out.score).toBe(0)
    expect(out.player.superzapper).toBe('full')
  })

  it('attract ignores input other than start', () => {
    const s = initialState(1)
    const out = stepGame(s, { spin: 5, fire: true, zap: true, start: false }, 1 / 60)
    expect(out.mode).toBe('attract')
  })

  it('gameover + start returns to attract', () => {
    const s = initialState(1)
    s.mode = 'gameover'
    const out = stepGame(s, START, 1 / 60)
    expect(out.mode).toBe('attract')
  })
})
```

```typescript
// tests/core/sim.levelselect.test.ts
import { describe, it, expect } from 'vitest'
import { initialState } from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { Input } from '../../src/core/input'
import { MAX_START_LEVEL } from '../../src/core/rules'

function selecting() {
  const s = initialState(1)
  s.mode = 'levelselect'
  s.selectLevel = 1
  return s
}

describe('start-level select', () => {
  it('spinning right raises the chosen level', () => {
    const s = selecting()
    const out = stepGame(s, { spin: 2, fire: false, zap: false, start: false }, 1 / 60)
    expect(out.selectLevel).toBeGreaterThan(1)
  })

  it('spinning left lowers the chosen level but never below 1', () => {
    const s = selecting()
    s.selectLevel = 1
    const out = stepGame(s, { spin: -5, fire: false, zap: false, start: false }, 1 / 60)
    expect(out.selectLevel).toBe(1)
  })

  it('cannot select above MAX_START_LEVEL', () => {
    const s = selecting()
    s.selectLevel = MAX_START_LEVEL
    const out = stepGame(s, { spin: 9, fire: false, zap: false, start: false }, 1 / 60)
    expect(out.selectLevel).toBe(MAX_START_LEVEL)
  })

  it('starts the run at the chosen level', () => {
    const s = selecting()
    s.selectLevel = 5
    const out = stepGame(s, { spin: 0, fire: false, zap: false, start: true }, 1 / 60)
    expect(out.mode).toBe('playing')
    expect(out.level).toBe(5)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/sim.framing.test.ts tests/core/sim.levelselect.test.ts`
Expected: FAIL — `initialState` starts in `'playing'`; `'attract'`/`'levelselect'` are not valid `Mode`s; `selectLevel` is `undefined`.

- [ ] **Step 3: Widen `Mode` and add `selectLevel` in `src/core/state.ts`**

Replace the `Mode` alias (Wave 3 had `'playing' | 'dying' | 'gameover' | 'warp'`):

```typescript
export type Mode = 'attract' | 'levelselect' | 'playing' | 'dying' | 'gameover' | 'warp' | 'highscore'
```

> `'highscore'` is added now (cheap, keeps the union stable) and is consumed in Task 4.

Add `selectLevel` to `GameState` (after `level`):

```typescript
  mode: Mode
  level: number
  selectLevel: number   // the level chosen on the level-select screen (≥ 1)
  tube: Tube
```

Start in `'attract'` and seed `selectLevel` in `initialState`:

```typescript
    mode: 'attract',
    level: 1,
    selectLevel: 1,
    tube,
```

- [ ] **Step 4: Add `MAX_START_LEVEL` to `src/core/rules.ts`**

```typescript
export const MAX_START_LEVEL = 16  // the player may start on any of the 16 distinct geometries
```

- [ ] **Step 5: Wire the framing modes into `src/core/sim.ts`**

Generalise `startGame` to take a chosen level (replace the existing `startGame`):

```typescript
function startGame(s: GameState, level: number): void {
  s.mode = 'playing'
  s.level = level
  s.score = 0
  s.lives = START_LIVES
  s.player = { lane: 0, alive: true, respawnTimer: 0, superzapper: 'full' }
  s.enemies = []
  s.tube = tubeForLevel(level)
  s.spikes = new Array(s.tube.laneCount).fill(0)
  startLevel(s)
}
```

Add the attract + level-select steppers (above `stepGame`):

```typescript
function stepAttract(s: GameState, input: Input): void {
  if (input.start) {
    s.mode = 'levelselect'
    s.selectLevel = 1
  }
}

function stepLevelSelect(s: GameState, input: Input): void {
  if (input.spin !== 0) {
    const step = input.spin > 0 ? 1 : -1
    s.selectLevel = Math.max(1, Math.min(MAX_START_LEVEL, s.selectLevel + step))
  }
  if (input.start) startGame(s, s.selectLevel)
}
```

Add `MAX_START_LEVEL` to the rules import line:

```typescript
import {
  SPIN_SENSITIVITY, BULLET_SPEED, MAX_BULLETS, scoreFor, EXTRA_LIFE_INTERVAL,
  PLAYER_RIM_DEPTH, RESPAWN_DELAY, START_LIVES, levelParams, spawnForLevel,
  SCORE_SPIKE_SEGMENT, SPIKE_MAX_DEPTH, SPIKE_SHORTEN, TANKER_SPLIT_DEPTH, LevelParams,
  rollSpawnKind, rollTankerCargo, WARP_SPEED, MAX_START_LEVEL,
} from './rules'
```

Add the `'attract'`/`'levelselect'` branches and update the `'gameover'` branch in `stepGame`:

```typescript
    case 'attract':
      stepAttract(s, input)
      break
    case 'levelselect':
      stepLevelSelect(s, input)
      break
```

Replace the `'gameover'` branch (Wave 1 had `if (input.start) startGame(s)`):

```typescript
    case 'gameover':
      if (input.start) s.mode = 'attract'
      break
```

- [ ] **Step 6: Run the tests + full suite + build**

Run: `npx vitest run tests/core/sim.framing.test.ts tests/core/sim.levelselect.test.ts` → PASS
Run: `npm test`

> **Expected breakage to fix here:** tests that called `initialState(seed)` and immediately drove `'playing'` logic now boot in `'attract'`. The minimal, faithful fix is per-test: set `s.mode = 'playing'` (and, where a clean run is needed, call the flow). Inspect the failures and add `s.mode = 'playing'` to the affected setup helpers (most Wave 1–3 tests already mutate `s.spawn`/`s.enemies` directly, so adding one line is enough). Do NOT weaken assertions. Re-run until green.

Run: `npm run build` → exit 0

- [ ] **Step 7: Commit**

```bash
git add src/core/state.ts src/core/rules.ts src/core/sim.ts tests/core/sim.framing.test.ts tests/core/sim.levelselect.test.ts
git commit -m "feat(core): attract screen and start-level select with pure transitions"
```

---

## Task 3: High-score entry state machine + table (`core/state.ts`, `core/rules.ts`, `core/sim.ts`)

**Files:**
- Modify: `src/core/state.ts` (`GameState.highScore`, `GameState.entry`; `initialState(seed, highScore?)`)
- Modify: `src/core/rules.ts` (`INITIALS_SLOTS`, `INITIALS_ALPHABET`, `highScoreQualifies`)
- Modify: `src/core/sim.ts` (`cloneState` clones `entry`; `stepHighScore`; gameover routes to entry/attract; `'highscore'` branch)
- Test: `tests/core/sim.highscore.test.ts`

**Interfaces:**
- Consumes: `Input`, `GameState.score`, `GameState.highScore`, `highScoreQualifies`, `INITIALS_SLOTS`, `INITIALS_ALPHABET`
- Produces: `GameState.highScore`, `GameState.entry: HighScoreEntry`; `initialState(seed, highScore?)`; `stepHighScore(s, input)`; gameover → `'highscore'` (qualifying) or `'attract'` (not); the entry machine commits the new high score on the final initial

> **Entry model:** A run's `score` *qualifies* when it is strictly greater than the stored `highScore`. On `gameover + start`:
> - qualifies → `mode = 'highscore'`, `entry = { active: true, initials: ['A','A','A'], cursor: 0 }`.
> - does not qualify → `mode = 'attract'` (no entry).
>
> In `'highscore'`:
> - `spin` cycles the **current** initial (`entry.initials[cursor]`) forward/back through `INITIALS_ALPHABET` (wrapping). One whole `spin` step = one letter; sign sets direction.
> - `fire` confirms the current initial and advances `cursor`. When confirming the **last** slot (`cursor === INITIALS_SLOTS - 1`), the entry **commits**: `highScore = score`, `entry.active = false`, `mode = 'attract'`. (Initials are stored in `entry.initials` for the shell to display; persistence of the *numeric* high score is the shell's job — see Tasks 5–6.)
>
> `highScore` is seeded by `initialState(seed, highScore = 0)` so the shell can pass in the value it loaded from `localStorage`.

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/core/sim.highscore.test.ts
import { describe, it, expect } from 'vitest'
import { initialState } from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { Input } from '../../src/core/input'
import { highScoreQualifies, INITIALS_SLOTS, INITIALS_ALPHABET } from '../../src/core/rules'

const START: Input = { spin: 0, fire: false, zap: false, start: true }
const FIRE: Input = { spin: 0, fire: true, zap: false, start: false }
const NEUTRAL: Input = { spin: 0, fire: false, zap: false, start: false }

describe('highScoreQualifies', () => {
  it('qualifies only when strictly greater than the stored high score', () => {
    expect(highScoreQualifies(1000, 999)).toBe(true)
    expect(highScoreQualifies(999, 999)).toBe(false)
    expect(highScoreQualifies(0, 0)).toBe(false)
  })
})

describe('high-score seed', () => {
  it('seeds the stored high score from the constructor argument', () => {
    expect(initialState(1, 4200).highScore).toBe(4200)
    expect(initialState(1).highScore).toBe(0)   // default
  })
})

describe('gameover routing', () => {
  it('a qualifying score routes gameover → high-score entry', () => {
    const s = initialState(1, 1000)
    s.mode = 'gameover'
    s.score = 5000
    const out = stepGame(s, START, 1 / 60)
    expect(out.mode).toBe('highscore')
    expect(out.entry.active).toBe(true)
    expect(out.entry.initials).toHaveLength(INITIALS_SLOTS)
    expect(out.entry.cursor).toBe(0)
  })

  it('a non-qualifying score routes gameover → attract', () => {
    const s = initialState(1, 9000)
    s.mode = 'gameover'
    s.score = 5000
    const out = stepGame(s, START, 1 / 60)
    expect(out.mode).toBe('attract')
    expect(out.entry.active).toBe(false)
  })
})

describe('initials entry machine', () => {
  function entering(score = 5000) {
    const s = initialState(1, 1000)
    s.mode = 'gameover'
    s.score = score
    return stepGame(s, START, 1 / 60) // now in 'highscore'
  }

  it('spin cycles the current initial through the alphabet', () => {
    const s = entering()
    expect(s.entry.initials[0]).toBe(INITIALS_ALPHABET[0]) // 'A'
    const out = stepGame(s, { spin: 1, fire: false, zap: false, start: false }, 1 / 60)
    expect(out.entry.initials[0]).toBe(INITIALS_ALPHABET[1]) // 'B'
  })

  it('spinning back from the first letter wraps to the last', () => {
    const s = entering()
    const out = stepGame(s, { spin: -1, fire: false, zap: false, start: false }, 1 / 60)
    expect(out.entry.initials[0]).toBe(INITIALS_ALPHABET[INITIALS_ALPHABET.length - 1])
  })

  it('fire advances the cursor to the next initial', () => {
    const s = entering()
    const out = stepGame(s, FIRE, 1 / 60)
    expect(out.entry.cursor).toBe(1)
  })

  it('confirming the last initial commits the high score and returns to attract', () => {
    let s = entering(7777)
    for (let i = 0; i < INITIALS_SLOTS; i++) s = stepGame(s, FIRE, 1 / 60)
    expect(s.mode).toBe('attract')
    expect(s.entry.active).toBe(false)
    expect(s.highScore).toBe(7777)
  })

  it('does nothing on a neutral step', () => {
    const s = entering()
    const out = stepGame(s, NEUTRAL, 1 / 60)
    expect(out.mode).toBe('highscore')
    expect(out.entry.cursor).toBe(0)
    expect(out.entry.initials[0]).toBe(INITIALS_ALPHABET[0])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/sim.highscore.test.ts`
Expected: FAIL — `highScoreQualifies`/`INITIALS_*` not exported; `s.highScore`/`s.entry` undefined; gameover routes to attract unconditionally.

- [ ] **Step 3: Add the high-score state to `src/core/state.ts`**

Add the entry interface (after `SpawnState`):

```typescript
export interface HighScoreEntry {
  active: boolean       // true while the player is entering initials
  initials: string[]    // one letter per slot, length INITIALS_SLOTS
  cursor: number        // which slot is being edited, ∈ [0, INITIALS_SLOTS)
}
```

Add `highScore` and `entry` to `GameState` (after `lives`):

```typescript
  score: number
  highScore: number
  lives: number
  spawn: SpawnState
  warp: WarpState
  entry: HighScoreEntry
  rng: Rng
```

Update `initialState`'s signature and the literal (import `INITIALS_SLOTS` from rules):

```typescript
import { START_LIVES, spawnForLevel, INITIALS_SLOTS } from './rules'
```

```typescript
export function initialState(seed: number, highScore = 0): GameState {
  const tube: Tube = tubeForLevel(1)
  return {
    mode: 'attract',
    level: 1,
    selectLevel: 1,
    tube,
    player: { lane: 0, alive: true, respawnTimer: 0, superzapper: 'full' },
    bullets: [],
    enemies: [],
    spikes: new Array(tube.laneCount).fill(0),
    score: 0,
    highScore,
    lives: START_LIVES,
    spawn: spawnForLevel(1),
    warp: { progress: 0 },
    entry: { active: false, initials: new Array(INITIALS_SLOTS).fill('A'), cursor: 0 },
    rng: makeRng(seed),
  }
}
```

- [ ] **Step 4: Add the high-score rules to `src/core/rules.ts`**

```typescript
export const INITIALS_SLOTS = 3
export const INITIALS_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

export function highScoreQualifies(score: number, highScore: number): boolean {
  return score > highScore
}
```

- [ ] **Step 5: Wire the high-score machine into `src/core/sim.ts`**

Clone the entry sub-object in `cloneState` (after the `warp:` line):

```typescript
    warp: { ...s.warp },
    entry: { ...s.entry, initials: s.entry.initials.slice() },
```

Add the imports to the rules import line — `highScoreQualifies, INITIALS_SLOTS, INITIALS_ALPHABET`:

```typescript
import {
  SPIN_SENSITIVITY, BULLET_SPEED, MAX_BULLETS, scoreFor, EXTRA_LIFE_INTERVAL,
  PLAYER_RIM_DEPTH, RESPAWN_DELAY, START_LIVES, levelParams, spawnForLevel,
  SCORE_SPIKE_SEGMENT, SPIKE_MAX_DEPTH, SPIKE_SHORTEN, TANKER_SPLIT_DEPTH, LevelParams,
  rollSpawnKind, rollTankerCargo, WARP_SPEED, MAX_START_LEVEL,
  highScoreQualifies, INITIALS_SLOTS, INITIALS_ALPHABET,
} from './rules'
```

Add `stepHighScore` (near `stepAttract`/`stepLevelSelect`):

```typescript
function stepHighScore(s: GameState, input: Input): void {
  if (input.spin !== 0) {
    const dir = input.spin > 0 ? 1 : -1
    const n = INITIALS_ALPHABET.length
    const cur = INITIALS_ALPHABET.indexOf(s.entry.initials[s.entry.cursor])
    const next = (((cur + dir) % n) + n) % n
    s.entry.initials[s.entry.cursor] = INITIALS_ALPHABET[next]
  }
  if (input.fire) {
    if (s.entry.cursor >= INITIALS_SLOTS - 1) {
      s.highScore = s.score          // commit the numeric high score (shell persists it)
      s.entry.active = false
      s.mode = 'attract'
    } else {
      s.entry.cursor += 1
    }
  }
}
```

Route `gameover` to the entry screen or attract (replace the Task-2 `'gameover'` branch):

```typescript
    case 'gameover':
      if (input.start) {
        if (highScoreQualifies(s.score, s.highScore)) {
          s.mode = 'highscore'
          s.entry = { active: true, initials: new Array(INITIALS_SLOTS).fill('A'), cursor: 0 }
        } else {
          s.mode = 'attract'
        }
      }
      break
    case 'highscore':
      stepHighScore(s, input)
      break
```

- [ ] **Step 6: Run the tests + full suite + build**

Run: `npx vitest run tests/core/sim.highscore.test.ts` → PASS
Run: `npm test`

> **Expected breakage to fix here:** the `sim.framing` test "gameover + start returns to attract" was written in Task 2 against the unconditional routing. Its `initialState(1)` has `highScore = 0` and `score = 0`, so `highScoreQualifies(0, 0)` is `false` → it still returns to attract. No change needed. If any other test set a non-zero `score` before driving `gameover + start`, update it to set `highScore` ≥ `score` (non-qualifying) or assert the `'highscore'` route. Re-run until green; do not weaken assertions.

Run: `npm run build` → exit 0

- [ ] **Step 7: Commit**

```bash
git add src/core/state.ts src/core/rules.ts src/core/sim.ts tests/core/sim.highscore.test.ts
git commit -m "feat(core): high-score qualify check and pure initials-entry state machine"
```

---

## Task 4: High-score persistence seam — `shell/storage.ts` (the only `localStorage` touch)

**Files:**
- Create: `src/shell/storage.ts`
- Test: `tests/shell/storage.test.ts`

**Interfaces:**
- Consumes: `window.localStorage` (shell-only)
- Produces: `loadHighScore(): number`, `saveHighScore(score: number): void`

> **Seam:** This is the *entire* `localStorage` footprint of the game. The core never imports it. `main.ts` calls `loadHighScore()` at boot to seed `initialState(seed, highScore)` and `saveHighScore()` when the high score is committed (Task 6). `loadHighScore` is defensive: missing key, non-numeric, or negative → `0`. Guard for `localStorage` being unavailable (private mode / blocked) so the game still runs.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/shell/storage.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { loadHighScore, saveHighScore } from '../../src/shell/storage'

// A minimal in-memory localStorage fake (tests run in node — no DOM).
function installFakeStorage() {
  const map = new Map<string, string>()
  const fake = {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => { map.set(k, String(v)) },
    removeItem: (k: string) => { map.delete(k) },
    clear: () => { map.clear() },
  }
  vi.stubGlobal('localStorage', fake)
  return map
}

describe('high-score storage (shell)', () => {
  beforeEach(() => { vi.unstubAllGlobals() })

  it('returns 0 when nothing is stored', () => {
    installFakeStorage()
    expect(loadHighScore()).toBe(0)
  })

  it('round-trips a saved high score', () => {
    installFakeStorage()
    saveHighScore(12345)
    expect(loadHighScore()).toBe(12345)
  })

  it('returns 0 for a corrupt stored value', () => {
    const map = installFakeStorage()
    map.set('tempest.highscore', 'not-a-number')
    expect(loadHighScore()).toBe(0)
  })

  it('does not throw when localStorage is unavailable', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(() => saveHighScore(99)).not.toThrow()
    expect(loadHighScore()).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/shell/storage.test.ts`
Expected: FAIL — `src/shell/storage.ts` does not exist.

- [ ] **Step 3: Create `src/shell/storage.ts`**

```typescript
// src/shell/storage.ts
// The ONLY localStorage touch in the game. The pure core never imports this;
// main.ts loads at boot and saves when a high score is committed.

const KEY = 'tempest.highscore'

function store(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined // access can throw in some privacy modes
  }
}

export function loadHighScore(): number {
  const s = store()
  if (!s) return 0
  const raw = s.getItem(KEY)
  const n = raw === null ? NaN : Number(raw)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0
}

export function saveHighScore(score: number): void {
  const s = store()
  if (!s) return
  try {
    s.setItem(KEY, String(Math.max(0, Math.floor(score))))
  } catch {
    // quota / blocked — high scores are best-effort, never fatal.
  }
}
```

- [ ] **Step 4: Run the test + full suite + build**

Run: `npx vitest run tests/shell/storage.test.ts` → PASS
Run: `npm test` → all green
Run: `npm run build` → exit 0

- [ ] **Step 5: Commit**

```bash
git add src/shell/storage.ts tests/shell/storage.test.ts
git commit -m "feat(shell): localStorage high-score persistence (load/save seam)"
```

---

## Task 5: Loop `onModeChange` hook (`shell/loop.ts`)

**Files:**
- Modify: `src/shell/loop.ts`
- Test: `tests/shell/loop.modechange.test.ts`

**Interfaces:**
- Consumes: `stepGame`, `GameState.mode`
- Produces: `createLoop(initial, sampleInput, draw, now, onModeChange?)` — fires `onModeChange(prev, next, state)` once per mode transition so the shell can persist on the `highscore → attract` edge

> **Why a hook (not polling):** the shell must save the high score exactly when the entry commits (`highscore → attract`). Rather than have `main.ts` diff the mode every frame, the loop reports transitions. The hook is optional (back-compat: Wave 0–3 callers pass four args). The loop detects transitions across **all** sub-steps in a frame, firing for each distinct change, so a transition that happens mid-accumulator is not missed.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/shell/loop.modechange.test.ts
import { describe, it, expect } from 'vitest'
import { createLoop } from '../../src/shell/loop'
import { initialState } from '../../src/core/state'
import { Input } from '../../src/core/input'
import { Mode } from '../../src/core/state'

// Drive the loop deterministically by faking rAF + now (no DOM).
function harness(input: Input) {
  let cb: FrameRequestCallback | null = null
  let t = 0
  // @ts-expect-error test stub
  globalThis.requestAnimationFrame = (fn: FrameRequestCallback) => { cb = fn; return 1 }
  // @ts-expect-error test stub
  globalThis.cancelAnimationFrame = () => {}
  const transitions: Array<[Mode, Mode]> = []
  // Boot in gameover with score 0 so 'start' routes straight to attract (a clean transition).
  const s = initialState(1)
  s.mode = 'gameover'
  const loop = createLoop(
    s,
    () => input,
    () => {},
    () => (t += 1000 / 60),
    (prev, next) => transitions.push([prev, next]),
  )
  loop.start()
  // Advance one frame's worth of steps.
  if (cb) cb(0)
  return transitions
}

describe('loop onModeChange', () => {
  it('reports the gameover → attract transition once', () => {
    const transitions = harness({ spin: 0, fire: false, zap: false, start: true })
    expect(transitions).toContainEqual(['gameover', 'attract'])
  })

  it('reports nothing when the mode is steady', () => {
    const transitions = harness({ spin: 0, fire: false, zap: false, start: false })
    expect(transitions).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/shell/loop.modechange.test.ts`
Expected: FAIL — `createLoop` takes only four arguments; no `onModeChange` is fired.

- [ ] **Step 3: Add the hook to `src/shell/loop.ts`**

Add the optional parameter and emit transitions per sub-step. Replace the signature and `frame`:

```typescript
// src/shell/loop.ts
import { GameState, Mode } from '../core/state'
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
  onModeChange?: (prev: Mode, next: Mode, state: GameState) => void,
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
      const prev = state.mode
      state = stepGame(state, first ? input : NEUTRAL, STEP)
      if (onModeChange && state.mode !== prev) onModeChange(prev, state.mode, state)
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

- [ ] **Step 4: Run the test + full suite + build**

Run: `npx vitest run tests/shell/loop.modechange.test.ts` → PASS
Run: `npm test` → all green (existing `main.ts` still calls `createLoop` with four args — `onModeChange` is optional)
Run: `npm run build` → exit 0

- [ ] **Step 5: Commit**

```bash
git add src/shell/loop.ts tests/shell/loop.modechange.test.ts
git commit -m "feat(shell): loop onModeChange hook for shell-side persistence"
```

---

## Task 6: Wire persistence at boot + on commit (`main.ts`)

**Files:**
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `loadHighScore`/`saveHighScore` (storage), `initialState(seed, highScore)`, `createLoop(..., onModeChange)`, `Loop.getState`
- Produces: a running game that loads the high score at boot and saves it on the `highscore → attract` commit edge

> **Shell-only wiring:** no core change. Boot loads the stored high score and seeds the sim; the `onModeChange` hook saves the committed high score when the entry machine returns to attract (`highscore → attract`). Because the core sets `highScore = score` *before* leaving `'highscore'` (Task 3), the state handed to `onModeChange` already carries the new value.

- [ ] **Step 1: Replace `src/main.ts`**

```typescript
// src/main.ts
import { initialState } from './core/state'
import { createInputController } from './shell/input'
import { createLoop } from './shell/loop'
import { render } from './shell/render'
import { loadHighScore, saveHighScore } from './shell/storage'

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
  initialState(12345, loadHighScore()),
  () => input.sample(),
  (s) => render(ctx, s, canvas.width, canvas.height),
  () => performance.now(),
  (prev, next, state) => {
    // The high score is committed by the core on the highscore → attract edge.
    if (prev === 'highscore' && next === 'attract') saveHighScore(state.highScore)
  },
)
loop.start()
```

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: exit 0 (no test — this is shell wiring; behaviour is verified by playing in Task 7).

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "feat(shell): load high score at boot and persist on entry commit"
```

---

## Task 7: Framing screens + Claw-icon lives HUD (`shell/render.ts`)

**Files:**
- Modify: `src/shell/render.ts`

**Interfaces:**
- Consumes: `GameState` (`mode`, `selectLevel`, `score`, `highScore`, `lives`, `entry`, `player.superzapper`), `paletteForLevel`, `project`/`currentLane`
- Produces: attract, level-select, and high-score-entry screens; the HUD now draws HIGH SCORE, lives as Claw icons, and a SUPERZAPPER indicator. Pure-state behaviour these screens read is covered by Tasks 1–3; the drawing is verified by running.

> **Shell verification:** rendering is verified by `npm run build` and `npm run dev`. The render builds a palette from `s.level` (Wave 3) and branches on `s.mode`. The existing `'playing'`/`'warp'` draws are unchanged; this task adds the framing-screen draws and replaces the numeric `LIVES n` HUD with Claw icons.

- [ ] **Step 1: Add the framing-screen + HUD helpers to `src/shell/render.ts`**

Add a small Claw-icon helper and the three screen helpers (place above `render`). These use `pal.claw` for the icons and white text for labels:

```typescript
// A small Claw glyph used for the lives indicator and menu accents.
function drawClawIcon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  ctx.lineWidth = 2
  ctx.strokeStyle = color
  ctx.shadowColor = color
  ctx.shadowBlur = 8
  ctx.beginPath()
  ctx.arc(x, y, r, Math.PI * 0.15, Math.PI * 0.85)   // open claw arc
  ctx.stroke()
}

function drawLives(ctx: CanvasRenderingContext2D, s: GameState, pal: Palette, width: number): void {
  // Draw up to a sane cap of icons; show "xN" beyond it.
  const cap = 8
  const shown = Math.min(s.lives, cap)
  const r = 9
  const gap = 26
  const baseX = width - 24
  const y = 56
  ctx.textAlign = 'right'
  ctx.fillStyle = '#ffffff'
  ctx.font = '16px monospace'
  ctx.shadowBlur = 0
  ctx.fillText('LIVES', baseX, 36)
  for (let i = 0; i < shown; i++) drawClawIcon(ctx, baseX - i * gap, y, r, pal.claw)
  if (s.lives > cap) {
    ctx.shadowBlur = 0
    ctx.fillStyle = '#ffffff'
    ctx.fillText(`x${s.lives}`, baseX - shown * gap - 8, y + 5)
  }
}

function drawAttract(ctx: CanvasRenderingContext2D, s: GameState, width: number, height: number): void {
  ctx.shadowBlur = 0
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.font = '64px monospace'
  ctx.fillText('TEMPEST', width / 2, height * 0.28)
  ctx.font = '22px monospace'
  ctx.fillText('press ENTER to play', width / 2, height * 0.5)
  ctx.font = '18px monospace'
  ctx.fillText(`HIGH SCORE  ${s.highScore}`, width / 2, height * 0.62)
}

function drawLevelSelect(ctx: CanvasRenderingContext2D, s: GameState, width: number, height: number): void {
  ctx.shadowBlur = 0
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.font = '40px monospace'
  ctx.fillText('SELECT START LEVEL', width / 2, height * 0.3)
  ctx.font = '72px monospace'
  ctx.fillText(`${s.selectLevel}`, width / 2, height * 0.5)
  ctx.font = '18px monospace'
  ctx.fillText('spin to choose  -  ENTER to start', width / 2, height * 0.64)
}

function drawHighScoreEntry(ctx: CanvasRenderingContext2D, s: GameState, width: number, height: number): void {
  ctx.shadowBlur = 0
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.font = '40px monospace'
  ctx.fillText('NEW HIGH SCORE', width / 2, height * 0.28)
  ctx.font = '28px monospace'
  ctx.fillText(`${s.score}`, width / 2, height * 0.4)
  ctx.font = '64px monospace'
  const spacing = 60
  const startX = width / 2 - ((s.entry.initials.length - 1) * spacing) / 2
  s.entry.initials.forEach((ch, i) => {
    ctx.fillStyle = i === s.entry.cursor ? '#ffea00' : '#ffffff'
    ctx.fillText(ch, startX + i * spacing, height * 0.56)
  })
  ctx.fillStyle = '#ffffff'
  ctx.font = '18px monospace'
  ctx.fillText('spin to change letter  -  SPACE to confirm', width / 2, height * 0.7)
}
```

- [ ] **Step 2: Update `drawHud` to show HIGH SCORE + a Superzapper indicator, and drop the numeric LIVES**

Replace `drawHud` with a version that adds HIGH SCORE under SCORE, a SUPERZAPPER state readout, and delegates lives to `drawLives` (the numeric `LIVES n` line is removed — Claw icons replace it):

```typescript
function drawHud(ctx: CanvasRenderingContext2D, s: GameState, pal: Palette, width: number): void {
  ctx.shadowBlur = 0
  ctx.fillStyle = '#ffffff'
  ctx.font = '20px monospace'
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  ctx.fillText(`SCORE ${s.score}`, 16, 16)
  ctx.fillText(`HIGH  ${s.highScore}`, 16, 40)
  ctx.fillText(`LEVEL ${s.level}`, 16, 64)
  ctx.font = '14px monospace'
  const zap = s.player.superzapper === 'full' ? 'ZAP READY'
    : s.player.superzapper === 'used-once' ? 'ZAP x1'
      : 'ZAP SPENT'
  ctx.fillText(zap, 16, 92)

  drawLives(ctx, s, pal, width)

  if (s.mode === 'gameover') {
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.font = '48px monospace'
    ctx.fillText('GAME OVER', width / 2, 80)
    ctx.font = '20px monospace'
    ctx.fillText('press ENTER', width / 2, 140)
  }
}
```

- [ ] **Step 3: Branch the framing screens in `render`**

Replace `render` so the framing modes draw their own screens (no tube), while play/warp render as before with the new HUD signature:

```typescript
export function render(
  ctx: CanvasRenderingContext2D, s: GameState, width: number, height: number,
): void {
  const pal = paletteForLevel(s.level)
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, width, height)

  if (s.mode === 'attract') { drawAttract(ctx, s, width, height); ctx.shadowBlur = 0; return }
  if (s.mode === 'levelselect') { drawLevelSelect(ctx, s, width, height); ctx.shadowBlur = 0; return }
  if (s.mode === 'highscore') { drawHighScoreEntry(ctx, s, width, height); ctx.shadowBlur = 0; return }

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
  drawHud(ctx, s, pal, width)
  ctx.shadowBlur = 0
}
```

> The `drawHud` call now passes `pal`. If your Wave 3 `render` called `drawHud(ctx, s, width)`, this is the one updated call site.

- [ ] **Step 4: Verify the build typechecks**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 5: Verify the framing visually**

Run: `npm run dev`, open the URL. With no console errors, confirm:
- The game boots to the **TEMPEST** attract screen showing the loaded HIGH SCORE.
- **ENTER** → the **SELECT START LEVEL** screen; spinning the wheel changes the number (1–16); **ENTER** starts the run at that level.
- In play: the HUD shows SCORE, HIGH, LEVEL, the **ZAP READY/x1/SPENT** indicator, and **lives as Claw icons** (top-right). Press the zap key (`Input.zap`) — the first press clears the board, the second kills one enemy, the third does nothing; the indicator tracks it; it refills after the warp.
- Lose all lives → **GAME OVER**; **ENTER** with a qualifying score → the **NEW HIGH SCORE** initials screen (spin changes the highlighted letter, SPACE confirms each of three slots); after the third, it returns to attract and the HIGH SCORE reflects the new value. Reload the page — the high score persists (`localStorage`).

Stop the server.

- [ ] **Step 6: Run the full suite + build**

Run: `npm test` → all tests pass.
Run: `npm run build` → exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/shell/render.ts
git commit -m "feat(shell): attract, level-select, high-score screens and Claw-icon lives HUD"
```

---

## Self-Review

**1. Spec coverage (design doc Wave 4 — the "framing" section: "Superzapper (full + weak), HUD, extra-life thresholds, attract/title screen, game-over + high-score (localStorage), start-level select"):**

| Spec item | Task(s) |
|-----------|---------|
| Superzapper — first activation destroys all on screen | Task 1 (`stepZap`, `'full'` branch) |
| Superzapper — second activation destroys one, then spent | Task 1 (`'used-once'` → nearest-rim kill → `'spent'`) |
| Superzapper — once per level, refills next level | Task 1 (reset in `startLevel`, reached via `advanceLevel`) |
| Superzapper kills score (and can grant extra life) | Task 1 (routes through `awardScore`/`scoreFor`) |
| Extra-life thresholds | **Already implemented (Wave 2)** — `EXTRA_LIFE_INTERVAL` + `awardScore` 10k crossings; Wave 4 only adds the Claw-icon HUD (Task 7) and does NOT re-implement it |
| Attract / title screen | Task 2 (`'attract'` mode + transition) + Task 7 (`drawAttract`) |
| Start-level select | Task 2 (`'levelselect'`, `selectLevel`, `MAX_START_LEVEL`, `startGame(s, level)`) + Task 7 (`drawLevelSelect`) |
| Game-over → high-score entry → attract | Task 3 (`gameover` routing, `stepHighScore`, commit) + Task 7 (`drawHighScoreEntry`) |
| High score numeric in core; entry machine in core | Task 3 (`GameState.highScore`, `HighScoreEntry`, `stepHighScore`) |
| High score persisted to localStorage (shell only) | Task 4 (`shell/storage.ts`) + Task 5 (`onModeChange` hook) + Task 6 (`main.ts` boot-load + commit-save) |
| HUD: score + high score + level + lives as Claw icons | Task 7 (`drawHud` + `drawLives`/`drawClawIcon`) |

**Out of Wave 4 scope (later waves):** WebAudio SFX, particle/screen-shake polish, glow tuning (Wave 5). Attract-mode *demo playback* (recorded seed + input replay) is enabled by the deterministic core but is not built here — the attract screen is static title + high score. A multi-row high-score *table* (N entries) is reduced to a single stored high score + initials, faithful to the "high scores are local" non-goal; expanding to a table is a later, isolated change behind the same `shell/storage.ts` seam.

**2. Placeholder scan:** No `TBD`/`TODO`/"handle edge cases"/"similar to Task N" — every code and test step contains complete content. The two "Expected breakage to fix here" notes (Tasks 2 and 3) are deliberate TDD guidance for the mode-default change rippling into older suites, with the exact, bounded fix spelled out (set `s.mode = 'playing'` in setup; never weaken assertions) — not deferred work.

**3. Type consistency across tasks:**
- `Superzapper = 'full' | 'used-once' | 'spent'` (Task 1) is the type of `Player.superzapper`, read in `stepZap` (Task 1) and the HUD (Task 7).
- `Mode` is widened once in Task 2 to the full `'attract' | 'levelselect' | 'playing' | 'dying' | 'gameover' | 'warp' | 'highscore'` (including `'highscore'`, consumed in Task 3 and Task 7) — no later task re-edits the union.
- `GameState.selectLevel: number` (Task 2) is written by `stepLevelSelect`/`stepAttract` and read by `startGame`/`drawLevelSelect`.
- `GameState.highScore: number` and `GameState.entry: HighScoreEntry { active; initials: string[]; cursor: number }` (Task 3) are consumed by `stepHighScore` (Task 3), `cloneState` (Task 3), `drawHighScoreEntry`/`drawHud` (Task 7), and persisted via `state.highScore` in `onModeChange` (Task 6).
- `initialState(seed: number, highScore = 0)` (Task 3) is called with two args by `main.ts` (Task 6) and with one arg by every existing test (default applies).
- `startGame(s, level)` (Task 2) — every call site passes the level: `stepLevelSelect` passes `s.selectLevel`. The Wave 1 zero-arg `startGame(s)` call in the `gameover` branch is removed in Task 2 (gameover no longer restarts directly).
- `createLoop(initial, sampleInput, draw, now, onModeChange?)` (Task 5) — the fifth parameter is optional; `main.ts` (Task 6) supplies it; older callers/tests pass four args.
- `loadHighScore(): number` / `saveHighScore(score: number): void` (Task 4) — consumed only by `main.ts` (Task 6).
- HUD signature: `drawHud(ctx, s, pal, width)` (Task 7) replaces Wave 3's `drawHud(ctx, s, width)`; the single call site in `render` is updated in the same task.

**4. Pure-core / shell-seam check (load-bearing constraint):**
- No file under `src/core/` imports from `src/shell/` or touches `window`/`document`/`localStorage`/`Date`/`performance`/`Math.random`/`requestAnimationFrame`. The Superzapper, framing transitions, level select, and high-score *entry machine* are pure functions of `(state, input, dt)`.
- The Superzapper "destroy one" pick is RNG-free and deterministic (max `depth`, ties → lowest index), so `stepGame` stays reproducible.
- `localStorage` appears in exactly one file, `src/shell/storage.ts` (Task 4), called only from `src/main.ts` (Task 6). The numeric high score crosses the seam as the `highScore` argument to `initialState` (load) and the `state.highScore` field read in `onModeChange` (save). The core commits `highScore = score` *before* the `highscore → attract` edge, so the value is present when the shell persists it.

**5. Determinism + non-mutation check:** `cloneState` now also deep-copies `entry` (`{ ...s.entry, initials: s.entry.initials.slice() }`, Task 3); `player.superzapper` is a primitive copied by the existing `{ ...s.player }`. No new RNG draws are introduced (Superzapper, transitions, select, and entry are all RNG-free). Time still enters only via `dt`; the framing modes ignore `dt` entirely.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-25-tempest-wave-4-superzapper-and-framing.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
