// src/main.ts
import { initialState } from './core/state'
import { createInputController } from './shell/input'
import { createLoop } from './shell/loop'
import { createFx } from './shell/fx'
import { createAudioEngine } from './shell/audio'
import { render } from './shell/render'
import { loadHighScores, saveHighScores } from './shell/storage'

const canvas = document.getElementById('game') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!

let dpr = Math.min(2, window.devicePixelRatio || 1)
let W = window.innerWidth
let H = window.innerHeight

function resize(): void {
  dpr = Math.min(2, window.devicePixelRatio || 1)
  W = window.innerWidth
  H = window.innerHeight
  canvas.width = Math.floor(W * dpr)
  canvas.height = Math.floor(H * dpr)
  canvas.style.width = `${W}px`
  canvas.style.height = `${H}px`
}
window.addEventListener('resize', resize)
resize()

const input = createInputController(canvas)
const fx = createFx()
const audio = createAudioEngine()
let lastDraw = performance.now()

// Browsers forbid starting an AudioContext before a user gesture, so the engine
// stays inert until the first click/keypress unlocks it. resume() is idempotent
// (only the first call builds the context and loads samples), so leaving both
// listeners attached makes every later gesture a harmless no-op.
function unlockAudio(): void {
  audio.resume()
}
canvas.addEventListener('click', unlockAudio)
window.addEventListener('keydown', unlockAudio)

// Seed the in-memory high-score table from persisted storage so saved scores
// appear on the attract screen immediately at boot.
const initial = initialState((Math.random() * 0xffffffff) >>> 0)
initial.highScoreTable = loadHighScores()

const loop = createLoop(
  initial,
  () => input.sample(),
  (s, frameEvents) => {
    const t = performance.now()
    let rdt = (t - lastDraw) / 1000
    lastDraw = t
    if (rdt > 0.05) rdt = 0.05
    fx.detect(s, rdt, frameEvents)
    fx.update(rdt)
    // Play one sound per gameplay event the core emitted this frame. The loop
    // accumulates events across all sub-steps, so nothing is dropped when two
    // events land in the same render frame. play() is a no-op until the gesture
    // above unlocks the engine, so pre-interaction events are silently skipped.
    for (const event of frameEvents) {
      switch (event.type) {
        case 'fire':
          audio.play('fire')
          break
        case 'enemy-death':
          audio.play('enemyDeath')
          break
        case 'player-grab':
          audio.play('playerGrab')
          break
        case 'player-death':
          audio.play('playerDeath')
          break
        case 'warp-spike-crash':
          audio.play('warpSpikeCrash')
          break
        case 'level-clear':
          audio.play('levelClear')
          break
        case 'superzapper-activate':
          audio.play('superzapper')
          break
        case 'player-spawn':
          audio.play('playerSpawn')
          break
      }
    }
    render(ctx, s, W, H, fx, dpr)
  },
  () => performance.now(),
  // The 4-3 state machine inserts the committed entry and transitions
  // 'highscore' → 'attract'. That is the only exit from 'highscore', so saving
  // whenever the OLD mode was 'highscore' persists the updated table. Referencing
  // `loop` here is safe: this callback only runs at frame time, after `loop` is
  // assigned (createLoop never invokes it synchronously).
  (oldMode) => {
    if (oldMode === 'highscore') saveHighScores(loop.getState().highScoreTable)
  },
)
loop.start()
