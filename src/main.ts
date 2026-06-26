// src/main.ts
import { initialState } from './core/state'
import { createInputController } from './shell/input'
import { createLoop } from './shell/loop'
import { createFx } from './shell/fx'
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
let lastDraw = performance.now()

// Seed the in-memory high-score table from persisted storage so saved scores
// appear on the attract screen immediately at boot.
const initial = initialState((Math.random() * 0xffffffff) >>> 0)
initial.highScoreTable = loadHighScores()

const loop = createLoop(
  initial,
  () => input.sample(),
  (s) => {
    const t = performance.now()
    let rdt = (t - lastDraw) / 1000
    lastDraw = t
    if (rdt > 0.05) rdt = 0.05
    fx.detect(s, rdt)
    fx.update(rdt)
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
